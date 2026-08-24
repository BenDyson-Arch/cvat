// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

const DUPLICATE_MOUSE_MS = 1000;
const DUPLICATE_MOUSE_PX = 16;
const LONG_PRESS_MS = 500;
const TAP_MOVE_PX = 10;

interface RecentPointer {
    t: number;
    x: number;
    y: number;
}

const recentPointers: RecentPointer[] = [];

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
    // Some WebKit versions report Apple Pencil as touch with a ~0.5px contact ellipse.
    if (event.pointerType !== 'touch') {
        return false;
    }
    if (event.width > 2 || event.height > 2) {
        return false;
    }
    if ((typeof event.tiltX === 'number' && event.tiltX !== 0) ||
        (typeof event.tiltY === 'number' && event.tiltY !== 0) ||
        (typeof event.azimuthAngle === 'number' && event.azimuthAngle !== 0)
    ) {
        return true;
    }
    return event.width > 0 && event.width <= 1 && event.height > 0 && event.height <= 1;
}

export function isPenPointer(event: Event): boolean {
    if (!isPointerEvent(event)) {
        return false;
    }
    return event.pointerType === 'pen' || isLikelyPencilDisguisedAsTouch(event);
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
    const pressure = (event as PointerEvent).pressure;
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
            event.preventDefault();
            return true;
        }

        event.preventDefault();
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

        event.preventDefault();
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

        event.preventDefault();

        if (this.touches.size === 0) {
            const wasLongPress = this.longPressFired;
            const wasTap = !this.moved && !wasLongPress && !this.panning === false;
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
            void wasTap;
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
