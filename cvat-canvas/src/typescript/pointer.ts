// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

const DUPLICATE_MOUSE_MS = 1000;
const DUPLICATE_MOUSE_PX = 16;
const LONG_PRESS_MS = 500;
const TAP_MOVE_PX = 10;
const MAX_PENCIL_TOUCH_CONTACT_PX = 12;

interface RecentPointer {
    t: number;
    x: number;
    y: number;
}

const recentPointers: RecentPointer[] = [];
const disguisedPencilPointers = new Set<number>();

export type PointerKind = 'mouse' | 'pen' | 'touch';

export function isPointerEvent(event: Event): event is PointerEvent {
    return typeof PointerEvent !== 'undefined' && event instanceof PointerEvent;
}

export function pointerTypeOf(event: Event): PointerKind | null {
    if (isPointerEvent(event) && event.pointerType) {
        if (event.pointerType === 'pen' || event.pointerType === 'touch' || event.pointerType === 'mouse') {
            return event.pointerType;
        }
    }
    return null;
}

function isLikelyPencilDisguisedAsTouch(event: PointerEvent): boolean {
    // Some WebKit versions report Apple Pencil as touch. Its contact ellipse is
    // small, but can be quantized above 1px (especially at non-1 viewport scale).
    // A finger contact is substantially larger, so keep it on the gesture path.
    if (event.pointerType !== 'touch') {
        return false;
    }
    const stylusEvent = event as PointerEvent & {
        azimuthAngle?: number;
        altitudeAngle?: number;
    };
    const hasStylusAngles = (
        (typeof event.tiltX === 'number' && event.tiltX !== 0) ||
        (typeof event.tiltY === 'number' && event.tiltY !== 0) ||
        (typeof stylusEvent.azimuthAngle === 'number' && stylusEvent.azimuthAngle !== 0) ||
        (
            typeof stylusEvent.altitudeAngle === 'number' &&
            stylusEvent.altitudeAngle > 0 &&
            stylusEvent.altitudeAngle < Math.PI / 2
        )
    );
    // WebKit reports pressure=0.5 for ordinary touch when force is unavailable.
    // Pencil pressure is variable, even when pointerType is incorrectly "touch".
    const hasStylusPressure = event.pressure > 0 && Math.abs(event.pressure - 0.5) > 0.01;
    const hasSmallContact = (
        event.width > 0 &&
        event.height > 0 &&
        event.width <= MAX_PENCIL_TOUCH_CONTACT_PX &&
        event.height <= MAX_PENCIL_TOUCH_CONTACT_PX
    );
    return hasStylusAngles || hasStylusPressure || hasSmallContact;
}

export function isPenPointer(event: Event): boolean {
    if (!isPointerEvent(event)) {
        return false;
    }
    if (event.pointerType === 'pen') {
        return true;
    }
    if (disguisedPencilPointers.has(event.pointerId)) {
        if (event.type === 'pointerup' || event.type === 'pointercancel') {
            window.setTimeout(() => disguisedPencilPointers.delete(event.pointerId), 0);
        }
        return true;
    }
    if (isLikelyPencilDisguisedAsTouch(event)) {
        disguisedPencilPointers.add(event.pointerId);
        return true;
    }
    return false;
}

export function isTouchPointer(event: Event): boolean {
    return pointerTypeOf(event) === 'touch' && !isPenPointer(event);
}

export function isCoarsePointer(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return false;
    }
    return window.matchMedia('(any-pointer: coarse)').matches;
}

export function rememberPointer(event: PointerEvent): void {
    recentPointers.push({ t: event.timeStamp, x: event.clientX, y: event.clientY });
    if (recentPointers.length > 12) {
        recentPointers.shift();
    }
}

/** Skip MouseEvents synthesized after a PointerEvent (iOS compatibility clicks). */
export function isDuplicateMouseEvent(event: Event): boolean {
    if (isPointerEvent(event)) {
        rememberPointer(event);
        return false;
    }

    if (!(event instanceof MouseEvent)) {
        return false;
    }

    return recentPointers.some((pointer) => (
        event.timeStamp - pointer.t < DUPLICATE_MOUSE_MS &&
        Math.abs(pointer.x - event.clientX) < DUPLICATE_MOUSE_PX &&
        Math.abs(pointer.y - event.clientY) < DUPLICATE_MOUSE_PX
    ));
}

/** Left-button / Pencil tip. Finger is never a draw button (finger pans). */
export function isPrimaryDrawButton(event: MouseEvent): boolean {
    if (isTouchPointer(event)) {
        return false;
    }
    if (isPenPointer(event)) {
        const pointer = event as PointerEvent;
        if (pointer.type === 'pointerdown' || pointer.type === 'mousedown') {
            return pointer.button === 0 || pointer.buttons > 0;
        }
        return pointer.buttons > 0;
    }
    return event.button === 0;
}

export function penPressure(event: Event, fallback = 1): number {
    if (!isPenPointer(event)) {
        return fallback;
    }
    const { pressure } = (event as PointerEvent);
    if (typeof pressure !== 'number' || pressure <= 0) {
        return fallback;
    }
    return Math.max(0.2, Math.min(1, pressure));
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

export interface PointerGestureCallbacks {
    panStart(clientX: number, clientY: number): void;
    panMove(clientX: number, clientY: number): void;
    panEnd(): void;
    pinch(clientX: number, clientY: number, deltaY: number): void;
    tap(clientX: number, clientY: number): void;
    longPress(clientX: number, clientY: number): void;
}

export type CanvasPointerKind = 'pen' | 'finger';
export type CanvasPointerPhase = 'down' | 'move' | 'up' | 'cancel';

export interface NormalizedCanvasPointer {
    kind: CanvasPointerKind;
    phase: CanvasPointerPhase;
    pointerId: number;
    clientX: number;
    clientY: number;
    canvasX: number;
    canvasY: number;
    pressure: number;
    button: number;
    buttons: number;
    altKey: boolean;
    ctrlKey: boolean;
    shiftKey: boolean;
    raw: PointerEvent;
}

export interface CanvasPointerRouterCallbacks extends PointerGestureCallbacks {
    drawPointer(event: NormalizedCanvasPointer): boolean;
}

function preventDefaultIfCancelable(event: PointerEvent): void {
    if (event.cancelable) {
        event.preventDefault();
    }
}

/**
 * Sole pointer owner for native touch input. Mouse stays on the legacy lane.
 * Finger navigation and Pencil drawing cannot both consume the same pointer.
 */
export class CanvasPointerRouter {
    private gestures: PointerGestureSession;
    private callbacks: CanvasPointerRouterCallbacks;
    private pointerKinds = new Map<number, CanvasPointerKind>();
    private ignoredPointers = new Set<number>();
    private activePenPointerId: number | null = null;

    constructor(callbacks: CanvasPointerRouterCallbacks) {
        this.callbacks = callbacks;
        // eslint-disable-next-line no-use-before-define
        this.gestures = new PointerGestureSession(callbacks);
    }

    public handle(
        phase: CanvasPointerPhase,
        event: PointerEvent,
        canvasX: number,
        canvasY: number,
    ): boolean {
        if (event.pointerType === 'mouse') {
            return false;
        }
        rememberPointer(event);

        if (phase === 'down') {
            const kind = isPenPointer(event) ? 'pen' : 'finger';
            if (kind === 'finger' && this.activePenPointerId !== null) {
                this.ignoredPointers.add(event.pointerId);
                preventDefaultIfCancelable(event);
                return true;
            }
            this.pointerKinds.set(event.pointerId, kind);
            if (kind === 'pen') {
                for (const [pointerID, pointerKind] of this.pointerKinds) {
                    if (pointerKind === 'finger') {
                        this.pointerKinds.delete(pointerID);
                        this.ignoredPointers.add(pointerID);
                    }
                }
                this.gestures.destroy();
                // eslint-disable-next-line no-use-before-define
                this.gestures = new PointerGestureSession(this.callbacks);
                this.activePenPointerId = event.pointerId;
            }
        }
        if (this.ignoredPointers.has(event.pointerId)) {
            preventDefaultIfCancelable(event);
            if (phase === 'up' || phase === 'cancel') {
                this.ignoredPointers.delete(event.pointerId);
            }
            return true;
        }
        const kind = this.pointerKinds.get(event.pointerId);
        if (!kind) {
            return false;
        }

        if (kind === 'pen') {
            const consumed = this.callbacks.drawPointer({
                kind,
                phase,
                pointerId: event.pointerId,
                clientX: event.clientX,
                clientY: event.clientY,
                canvasX,
                canvasY,
                pressure: penPressure(event, ['up', 'cancel'].includes(phase) ? 0 : 1),
                button: event.button,
                buttons: event.buttons,
                altKey: event.altKey,
                ctrlKey: event.ctrlKey,
                shiftKey: event.shiftKey,
                raw: event,
            });
            if (consumed) {
                preventDefaultIfCancelable(event);
            } else if (phase === 'down') {
                this.gestures.onPointerDown(event);
            } else if (phase === 'move') {
                this.gestures.onPointerMove(event);
            } else {
                this.gestures.onPointerUp(event);
            }
        } else if (phase === 'down') {
            this.gestures.onPointerDown(event);
        } else if (phase === 'move') {
            this.gestures.onPointerMove(event);
        } else {
            this.gestures.onPointerUp(event);
        }

        if (phase === 'up' || phase === 'cancel') {
            this.pointerKinds.delete(event.pointerId);
            disguisedPencilPointers.delete(event.pointerId);
            if (this.activePenPointerId === event.pointerId) {
                this.activePenPointerId = null;
            }
        }
        return true;
    }

    public destroy(): void {
        this.gestures.destroy();
        this.pointerKinds.clear();
        this.ignoredPointers.clear();
        this.activePenPointerId = null;
    }
}

/**
 * Finger pans / pinches. Pen and mouse are left to existing draw/mouse handlers.
 * While a pen is down, new touch pointers are ignored (palm rejection).
 */
export class PointerGestureSession {
    private touches = new Map<number, { x: number; y: number }>();
    private penDown = false;
    private penPointerId: number | null = null;
    private pinchDistance = 0;
    private longPressTimer: number | null = null;
    private longPressFired = false;
    private downX = 0;
    private downY = 0;
    private moved = false;
    private panning = false;
    private callbacks: PointerGestureCallbacks;

    constructor(callbacks: PointerGestureCallbacks) {
        this.callbacks = callbacks;
    }

    public onPointerDown(event: PointerEvent): boolean {
        rememberPointer(event);

        if (isPenPointer(event)) {
            // Do not preventDefault: svg.draw.js tracks the rubber-band on window mousemove,
            // which WebKit suppresses after a canceled pointerdown.
            this.penDown = true;
            this.penPointerId = event.pointerId;
            this.beginPressTracking(event);
            return false;
        }

        if (!isTouchPointer(event)) {
            return false;
        }

        if (this.penDown) {
            preventDefaultIfCancelable(event);
            return true;
        }

        preventDefaultIfCancelable(event);
        this.touches.set(event.pointerId, { x: event.clientX, y: event.clientY });

        if (this.touches.size === 1) {
            this.beginPressTracking(event);
            this.panning = true;
            this.callbacks.panStart(event.clientX, event.clientY);
        } else if (this.touches.size === 2) {
            this.clearLongPress();
            const midpoint = this.currentPinchMidpoint();
            if (this.panning) {
                this.callbacks.panEnd();
            }
            this.panning = true;
            this.callbacks.panStart(midpoint.x, midpoint.y);
            this.pinchDistance = this.currentPinchDistance();
        }

        return true;
    }

    public onPointerMove(event: PointerEvent): boolean {
        if (isPenPointer(event) && event.pointerId === this.penPointerId) {
            this.updateMoved(event);
            if (this.moved) {
                this.clearLongPress();
            }
            return false;
        }

        if (!isTouchPointer(event) || !this.touches.has(event.pointerId)) {
            return false;
        }

        preventDefaultIfCancelable(event);
        this.touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
        this.updateMoved(event);

        if (this.touches.size === 2) {
            const nextDistance = this.currentPinchDistance();
            if (this.pinchDistance > 0 && nextDistance > 0) {
                const midpoint = this.currentPinchMidpoint();
                const deltaY = (this.pinchDistance - nextDistance) * 0.15;
                this.callbacks.pinch(midpoint.x, midpoint.y, deltaY);
                this.callbacks.panMove(midpoint.x, midpoint.y);
            }
            this.pinchDistance = nextDistance;
            return true;
        }

        if (this.panning && this.touches.size === 1) {
            if (this.moved) {
                this.clearLongPress();
            }
            this.callbacks.panMove(event.clientX, event.clientY);
            return true;
        }

        return true;
    }

    public onPointerUp(event: PointerEvent): boolean {
        if (isPenPointer(event) && event.pointerId === this.penPointerId) {
            const wasLongPress = this.longPressFired;
            this.clearLongPress();
            this.penDown = false;
            this.penPointerId = null;
            if (!this.moved && !wasLongPress) {
                this.callbacks.tap(event.clientX, event.clientY);
            }
            return false;
        }

        if (!isTouchPointer(event)) {
            return false;
        }

        const hadTouch = this.touches.delete(event.pointerId);
        if (!hadTouch) {
            return false;
        }

        preventDefaultIfCancelable(event);

        if (this.touches.size === 0) {
            const wasLongPress = this.longPressFired;
            this.clearLongPress();
            if (this.panning) {
                this.callbacks.panEnd();
                this.panning = false;
            }
            if (!this.moved && !wasLongPress) {
                this.callbacks.tap(event.clientX, event.clientY);
            }
            this.moved = false;
            this.pinchDistance = 0;
            return true;
        }

        if (this.touches.size === 1) {
            this.pinchDistance = 0;
            const remaining = this.touches.values().next().value;
            if (remaining) {
                this.panning = true;
                this.callbacks.panStart(remaining.x, remaining.y);
            }
        }

        return true;
    }

    public destroy(): void {
        this.clearLongPress();
        this.touches.clear();
        this.penDown = false;
        this.penPointerId = null;
        if (this.panning) {
            this.callbacks.panEnd();
        }
        this.panning = false;
    }

    private beginPressTracking(event: PointerEvent): void {
        this.clearLongPress();
        this.longPressFired = false;
        this.moved = false;
        this.downX = event.clientX;
        this.downY = event.clientY;
        const { clientX, clientY } = event;
        this.longPressTimer = window.setTimeout(() => {
            this.longPressTimer = null;
            this.longPressFired = true;
            this.callbacks.longPress(clientX, clientY);
        }, LONG_PRESS_MS);
    }

    private updateMoved(event: PointerEvent): void {
        if (Math.hypot(event.clientX - this.downX, event.clientY - this.downY) > TAP_MOVE_PX) {
            this.moved = true;
        }
    }

    private clearLongPress(): void {
        if (this.longPressTimer !== null) {
            window.clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }
    }

    private currentPinchDistance(): number {
        const points = [...this.touches.values()];
        if (points.length < 2) {
            return 0;
        }
        return distance(points[0], points[1]);
    }

    private currentPinchMidpoint(): { x: number; y: number } {
        const points = [...this.touches.values()];
        return {
            x: (points[0].x + points[1].x) / 2,
            y: (points[0].y + points[1].y) / 2,
        };
    }
}
