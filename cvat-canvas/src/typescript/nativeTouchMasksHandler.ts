// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import {
    BrushTool, ColorBy, Configuration, DrawData, Geometry,
} from './canvasModel';
import { imageDataToRLE, RLEToImageData } from './shared';
import { NormalizedCanvasPointer } from './pointer';

interface RasterPoint {
    x: number;
    y: number;
    pressure: number;
}

interface MaskBBox {
    left: number;
    top: number;
    right: number;
    bottom: number;
}

const FILL_BOUNDARY_ALPHA = 128;
const MAX_HISTORY_BYTES = 64 * 1024 * 1024;

type DrawDoneCallback = (
    data: object | null,
    duration?: number,
    continueDraw?: boolean,
    previousDrawData?: DrawData,
) => void;

export type NativeMaskPolygonDelegate = (
    tool: Extract<BrushTool['type'], 'polygon-plus' | 'polygon-minus'>,
    drawData: DrawData,
    geometry: Geometry,
) => void;

export interface NativeTouchMasksConfiguration extends Configuration {
    polygonDelegate?: NativeMaskPolygonDelegate;
}

/**
 * Pencil-only mask renderer used by the native pointer lane.
 *
 * The backing canvas always has image resolution. `NormalizedCanvasPointer`
 * coordinates are expected in CVAT canvas coordinates, so geometry.offset is
 * removed before rasterization.
 */
export class NativeTouchMasksHandler {
    private readonly onDrawDone: DrawDoneCallback;
    private readonly canvas: HTMLCanvasElement;
    private readonly context: CanvasRenderingContext2D;
    private configuration: NativeTouchMasksConfiguration;
    private geometry: Geometry | null = null;
    private drawData: DrawData | null = null;
    private tool: BrushTool | null = null;
    private imageOffset = 0;
    private drawing = false;
    private pointerID: number | null = null;
    private strokeBefore: ImageData | null = null;
    private undoStack: ImageData[] = [];
    private redoStack: ImageData[] = [];
    private historyBytes = 0;
    private pendingPoints: RasterPoint[] = [];
    private animationFrame: number | null = null;
    private lastPoint: RasterPoint | null = null;
    private lastPressure = 1;
    private startedAt = 0;
    private polygonDelegate: NativeMaskPolygonDelegate | null = null;
    private activePolygonTool: BrushTool['type'] | null = null;

    public constructor(
        onDrawDone: DrawDoneCallback,
        previewHost: HTMLElement | SVGElement,
        configuration: NativeTouchMasksConfiguration,
    ) {
        this.onDrawDone = onDrawDone;
        this.configuration = { ...configuration };
        this.polygonDelegate = configuration.polygonDelegate || null;
        this.canvas = document.createElement('canvas');
        this.canvas.className = 'cvat_native_touch_masks_canvas';
        this.canvas.setAttribute('aria-hidden', 'true');
        Object.assign(this.canvas.style, {
            position: 'absolute',
            display: 'none',
            background: 'transparent',
            pointerEvents: 'none',
            touchAction: 'none',
            transformOrigin: 'center center',
            imageRendering: 'pixelated',
            zIndex: '1',
        });

        const context = this.canvas.getContext('2d', { willReadFrequently: true });
        if (!context) {
            throw new Error('A 2D canvas context is required for native mask drawing');
        }
        this.context = context;
        this.context.imageSmoothingEnabled = false;

        const parent = previewHost instanceof SVGElement ? previewHost.parentElement : previewHost;
        if (!parent) {
            throw new Error('Native mask preview host must be attached to an HTML element');
        }
        parent.appendChild(this.canvas);
        this.applyConfiguration();
    }

    public configure(configuration: Configuration): void {
        this.configuration = { ...this.configuration, ...configuration };
        this.applyConfiguration();
    }

    public setPolygonDelegate(delegate: NativeMaskPolygonDelegate | null): void {
        this.polygonDelegate = delegate;
    }

    public draw(drawData: DrawData, geometry?: Geometry, imageOffset?: number): void {
        if (geometry) {
            this.transform(geometry, imageOffset);
        } else if (typeof imageOffset === 'number') {
            this.imageOffset = imageOffset;
        }

        if (drawData.enabled && drawData.shapeType === 'mask') {
            if (!this.geometry) {
                throw new Error('Geometry must be supplied before native mask drawing starts');
            }

            this.drawData = drawData;
            this.tool = drawData.brushTool || this.tool;
            if (!this.tool) {
                // CVAT enters mask mode before the brush popover reports its
                // selected tool. Wait for the following DRAW update.
                return;
            }

            if (!this.drawing) {
                this.begin(drawData);
            }
            if (this.tool.type.startsWith('polygon-')) {
                if (this.activePolygonTool !== this.tool.type) {
                    this.activePolygonTool = this.tool.type;
                    this.polygonDelegate?.(
                        this.tool.type as 'polygon-plus' | 'polygon-minus',
                        drawData,
                        this.geometry,
                    );
                }
                return;
            }
            this.activePolygonTool = null;

            this.updateBlockedTools();
            return;
        }

        if (!drawData.enabled && this.drawing) {
            this.finish(drawData.continue);
        }
    }

    public transform(geometry: Geometry, imageOffset: number = geometry.offset): void {
        this.geometry = geometry;
        this.imageOffset = imageOffset;
        const { width, height } = geometry.image;

        if (this.canvas.width !== width || this.canvas.height !== height) {
            const previous = this.canvas.width && this.canvas.height ?
                this.context.getImageData(0, 0, this.canvas.width, this.canvas.height) : null;
            this.canvas.width = width;
            this.canvas.height = height;
            this.context.imageSmoothingEnabled = false;
            if (previous) {
                this.context.putImageData(previous, 0, 0);
            }
        }

        const visualWidth = width * geometry.scale;
        const visualHeight = height * geometry.scale;
        this.canvas.style.left = `${geometry.left + (width * (1 - geometry.scale)) / 2}px`;
        this.canvas.style.top = `${geometry.top + (height * (1 - geometry.scale)) / 2}px`;
        this.canvas.style.width = `${visualWidth}px`;
        this.canvas.style.height = `${visualHeight}px`;
        this.canvas.style.transform = geometry.angle ? `rotate(${geometry.angle}deg)` : 'none';
    }

    public updateGeometry(geometry: Geometry, imageOffset: number = geometry.offset): void {
        this.transform(geometry, imageOffset);
    }

    public handlePointer(pointer: NormalizedCanvasPointer): void {
        if (!this.drawing || pointer.kind !== 'pen' || !this.isRasterTool()) {
            return;
        }

        if (this.tool?.type === 'fill') {
            if (
                pointer.phase === 'down' &&
                this.pointerID === null &&
                (pointer.button === 0 || pointer.buttons > 0)
            ) {
                this.pointerID = pointer.pointerId;
                this.fillEnclosed(
                    Math.round(pointer.canvasX - this.imageOffset),
                    Math.round(pointer.canvasY - this.imageOffset),
                );
            } else if (
                pointer.pointerId === this.pointerID &&
                ['up', 'cancel'].includes(pointer.phase)
            ) {
                this.pointerID = null;
            }
            return;
        }

        if (pointer.phase === 'down') {
            if (this.pointerID !== null || (pointer.button !== 0 && pointer.buttons === 0)) {
                return;
            }
            this.pointerID = pointer.pointerId;
            this.strokeBefore = this.snapshot();
            this.lastPoint = null;
            this.lastPressure = 1;
            this.enqueuePointer(pointer);
            return;
        }

        if (pointer.pointerId !== this.pointerID) {
            return;
        }

        if (pointer.phase === 'move') {
            this.enqueuePointer(pointer);
        } else if (pointer.phase === 'up') {
            this.enqueuePointer(pointer);
            this.flushPoints();
            this.completeStroke();
        } else {
            this.abortStroke();
        }
    }

    public undo(): boolean {
        if (!this.drawing || !this.undoStack.length) {
            return false;
        }
        this.abortStroke();
        const previous = this.undoStack.pop() as ImageData;
        this.historyBytes -= this.snapshotBytes(previous);
        this.pushRedo(this.snapshot());
        this.context.putImageData(previous, 0, 0);
        this.updateBlockedTools();
        return true;
    }

    public redo(): boolean {
        if (!this.drawing || !this.redoStack.length) {
            return false;
        }
        this.abortStroke();
        const next = this.redoStack.pop() as ImageData;
        this.historyBytes -= this.snapshotBytes(next);
        this.pushUndo(this.snapshot());
        this.context.putImageData(next, 0, 0);
        this.updateBlockedTools();
        return true;
    }

    public applyPolygon(points: number[], erase: boolean): boolean {
        if (!this.drawing || points.length < 6) {
            return false;
        }
        const before = this.snapshot();
        this.context.save();
        this.context.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
        this.context.fillStyle = this.tool?.color || '#ffffff';
        this.context.beginPath();
        this.context.moveTo(points[0], points[1]);
        for (let index = 2; index + 1 < points.length; index += 2) {
            this.context.lineTo(points[index], points[index + 1]);
        }
        this.context.closePath();
        this.context.fill();
        this.context.restore();
        this.clearRedo();
        this.pushUndo(before);
        this.updateBlockedTools();
        return true;
    }

    public fillEnclosed(seedX: number, seedY: number): boolean {
        if (!this.drawing || !this.tool || this.tool.type !== 'fill') {
            return false;
        }
        const { width, height } = this.canvas;
        if (seedX < 0 || seedY < 0 || seedX >= width || seedY >= height) {
            return false;
        }

        const before = this.snapshot();
        const visited = new Uint8Array(width * height);
        const spans: [number, number, number][] = [];
        const stack: [number, number][] = [[seedX, seedY]];
        const isFillable = (x: number, y: number): boolean => {
            const index = y * width + x;
            return !visited[index] && before.data[index * 4 + 3] < FILL_BOUNDARY_ALPHA;
        };

        if (!isFillable(seedX, seedY)) {
            return false;
        }

        while (stack.length) {
            const [x, y] = stack.pop() as [number, number];
            if (!isFillable(x, y)) {
                continue;
            }
            let left = x;
            let right = x;
            while (left > 0 && isFillable(left - 1, y)) {
                left -= 1;
            }
            while (right < width - 1 && isFillable(right + 1, y)) {
                right += 1;
            }
            if (left === 0 || right === width - 1 || y === 0 || y === height - 1) {
                return false;
            }

            for (let cursor = left; cursor <= right; cursor += 1) {
                visited[y * width + cursor] = 1;
            }
            spans.push([y, left, right]);

            for (const neighborY of [y - 1, y + 1]) {
                let cursor = left;
                while (cursor <= right) {
                    while (cursor <= right && !isFillable(cursor, neighborY)) {
                        cursor += 1;
                    }
                    if (cursor <= right) {
                        stack.push([cursor, neighborY]);
                        while (cursor <= right && isFillable(cursor, neighborY)) {
                            cursor += 1;
                        }
                    }
                }
            }
        }

        this.context.save();
        this.context.globalCompositeOperation = 'source-over';
        this.context.fillStyle = this.tool.color;
        for (const [y, left, right] of spans) {
            this.context.fillRect(left, y, right - left + 1, 1);
        }
        this.context.restore();
        this.clearRedo();
        this.pushUndo(before);
        this.updateBlockedTools();
        return true;
    }

    public cancel(): void {
        if (!this.drawing) {
            return;
        }
        this.abortStroke();
        this.reset();
    }

    public destroy(): void {
        this.cancel();
        this.canvas.remove();
    }

    public get enabled(): boolean {
        return this.drawing;
    }

    public get previewCanvas(): HTMLCanvasElement {
        return this.canvas;
    }

    private begin(drawData: DrawData): void {
        this.drawing = true;
        this.startedAt = Date.now();
        this.clearHistory();
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.loadInitialMask(drawData.initialState);
        this.canvas.style.display = 'block';
    }

    private finish(continueDraw = false): void {
        this.abortStroke(false);
        const previousDrawData = this.drawData;
        const bbox = this.findMaskBBox();
        let result: object | null = null;

        if (bbox) {
            const imageData = this.context.getImageData(
                bbox.left,
                bbox.top,
                bbox.right - bbox.left + 1,
                bbox.bottom - bbox.top + 1,
            );
            const points = imageDataToRLE(imageData.data);
            points.push(bbox.left, bbox.top, bbox.right, bbox.bottom);
            const initialState = previousDrawData?.initialState;
            result = {
                shapeType: 'mask',
                points,
                ...(initialState && !Number.isInteger(previousDrawData?.redraw) ? {
                    occluded: initialState.occluded,
                    attributes: { ...initialState.attributes },
                    color: initialState.color,
                    objectType: initialState.objectType,
                    label: initialState.label,
                } : {}),
                ...(Number.isInteger(previousDrawData?.redraw) ? { clientID: previousDrawData?.redraw } : {}),
            };
        }

        const duration = Date.now() - this.startedAt;
        this.reset();
        this.onDrawDone(result, duration, continueDraw, previousDrawData || undefined);
    }

    private reset(): void {
        this.drawing = false;
        this.pointerID = null;
        this.strokeBefore = null;
        this.pendingPoints = [];
        this.lastPoint = null;
        this.lastPressure = 1;
        this.drawData = null;
        this.tool = null;
        this.activePolygonTool = null;
        this.clearHistory();
        if (this.animationFrame !== null) {
            window.cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.canvas.style.display = 'none';
    }

    private loadInitialMask(state: any): void {
        if (state?.shapeType !== 'mask' || !Array.isArray(state.points) || state.points.length < 5) {
            return;
        }
        const points = state.points as number[];
        const [left, top, right, bottom] = points.slice(-4);
        const [red, green, blue] = this.colorForState(state);
        const pixels = RLEToImageData(red, green, blue, points);
        const imageData = new ImageData(
            new Uint8ClampedArray(pixels),
            right - left + 1,
            bottom - top + 1,
        );
        this.context.putImageData(imageData, left, top);
    }

    private enqueuePointer(pointer: NormalizedCanvasPointer): void {
        const coalesced = typeof pointer.raw.getCoalescedEvents === 'function' ?
            pointer.raw.getCoalescedEvents() : [];
        if (coalesced.length > 1 && this.geometry) {
            const angle = (-this.geometry.angle * Math.PI) / 180;
            const cosine = Math.cos(angle);
            const sine = Math.sin(angle);
            for (const sample of coalesced) {
                const dx = (sample.clientX - pointer.clientX) / this.geometry.scale;
                const dy = (sample.clientY - pointer.clientY) / this.geometry.scale;
                this.pendingPoints.push({
                    x: pointer.canvasX - this.imageOffset + dx * cosine - dy * sine,
                    y: pointer.canvasY - this.imageOffset + dx * sine + dy * cosine,
                    pressure: this.normalizePressure(sample.pressure),
                });
            }
        } else {
            this.pendingPoints.push(this.pointFromPointer(pointer));
        }

        if (this.animationFrame === null) {
            this.animationFrame = window.requestAnimationFrame(() => this.flushPoints());
        }
    }

    private flushPoints(): void {
        if (this.animationFrame !== null) {
            window.cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }
        const points = this.pendingPoints;
        this.pendingPoints = [];
        for (const point of points) {
            this.paintTo(point);
        }
    }

    private paintTo(point: RasterPoint): void {
        if (!this.tool) {
            return;
        }
        if (!this.lastPoint) {
            this.paintStamp(point);
            this.lastPoint = point;
            return;
        }

        const distance = Math.hypot(point.x - this.lastPoint.x, point.y - this.lastPoint.y);
        const minimumSize = this.tool.size *
            Math.min(this.lastPoint.pressure, point.pressure);
        const steps = Math.max(1, Math.ceil(distance / Math.max(0.5, minimumSize * 0.25)));
        for (let index = 1; index <= steps; index += 1) {
            const ratio = index / steps;
            this.paintStamp({
                x: this.lastPoint.x + (point.x - this.lastPoint.x) * ratio,
                y: this.lastPoint.y + (point.y - this.lastPoint.y) * ratio,
                pressure: this.lastPoint.pressure + (point.pressure - this.lastPoint.pressure) * ratio,
            });
        }
        this.lastPoint = point;
    }

    private paintStamp(point: RasterPoint): void {
        if (!this.tool) {
            return;
        }
        const size = Math.max(1, this.tool.size * point.pressure);
        this.context.save();
        this.context.globalCompositeOperation = this.tool.type === 'eraser' ? 'destination-out' : 'source-over';
        this.context.fillStyle = this.tool.color;
        if (this.tool.form === 'circle') {
            this.context.beginPath();
            this.context.arc(point.x, point.y, size / 2, 0, Math.PI * 2);
            this.context.fill();
        } else {
            this.context.fillRect(point.x - size / 2, point.y - size / 2, size, size);
        }
        this.context.restore();
    }

    private completeStroke(): void {
        if (this.strokeBefore) {
            this.clearRedo();
            this.pushUndo(this.strokeBefore);
        }
        this.strokeBefore = null;
        this.pointerID = null;
        this.lastPoint = null;
        this.updateBlockedTools();
    }

    private abortStroke(restore = true): void {
        if (this.animationFrame !== null) {
            window.cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }
        this.pendingPoints = [];
        if (restore && this.strokeBefore) {
            this.context.putImageData(this.strokeBefore, 0, 0);
        }
        this.strokeBefore = null;
        this.pointerID = null;
        this.lastPoint = null;
    }

    private pointFromPointer(pointer: NormalizedCanvasPointer): RasterPoint {
        return {
            x: pointer.canvasX - this.imageOffset,
            y: pointer.canvasY - this.imageOffset,
            pressure: this.normalizePressure(pointer.pressure),
        };
    }

    private normalizePressure(pressure: number): number {
        if (Number.isFinite(pressure) && pressure > 0) {
            this.lastPressure = Math.max(0.2, Math.min(1, pressure));
        }
        return this.lastPressure;
    }

    private snapshot(): ImageData {
        return this.context.getImageData(0, 0, this.canvas.width, this.canvas.height);
    }

    private snapshotBytes(snapshot: ImageData): number {
        return snapshot.data.byteLength;
    }

    private pushUndo(snapshot: ImageData): void {
        this.undoStack.push(snapshot);
        this.historyBytes += this.snapshotBytes(snapshot);
        this.pruneHistory();
    }

    private pushRedo(snapshot: ImageData): void {
        this.redoStack.push(snapshot);
        this.historyBytes += this.snapshotBytes(snapshot);
        this.pruneHistory();
    }

    private clearRedo(): void {
        for (const snapshot of this.redoStack) {
            this.historyBytes -= this.snapshotBytes(snapshot);
        }
        this.redoStack = [];
    }

    private clearHistory(): void {
        this.undoStack = [];
        this.redoStack = [];
        this.historyBytes = 0;
    }

    private pruneHistory(): void {
        // Keep the newest undo entries reachable first. If those are exhausted,
        // discard the oldest redo entries as well so the cap is never exceeded.
        while (this.historyBytes > MAX_HISTORY_BYTES && this.undoStack.length) {
            const oldest = this.undoStack.shift() as ImageData;
            this.historyBytes -= this.snapshotBytes(oldest);
        }
        while (this.historyBytes > MAX_HISTORY_BYTES && this.redoStack.length) {
            const oldest = this.redoStack.shift() as ImageData;
            this.historyBytes -= this.snapshotBytes(oldest);
        }
    }

    private findMaskBBox(): MaskBBox | null {
        const { width, height } = this.canvas;
        const pixels = this.context.getImageData(0, 0, width, height).data;
        let left = width;
        let top = height;
        let right = -1;
        let bottom = -1;

        for (let y = 0; y < height; y += 1) {
            for (let x = 0; x < width; x += 1) {
                if (pixels[(y * width + x) * 4 + 3]) {
                    left = Math.min(left, x);
                    top = Math.min(top, y);
                    right = Math.max(right, x);
                    bottom = Math.max(bottom, y);
                }
            }
        }
        return right < left || bottom < top ? null : {
            left, top, right, bottom,
        };
    }

    private updateBlockedTools(): void {
        if (!this.tool) {
            return;
        }
        const empty = this.findMaskBBox() === null;
        this.tool.onBlockUpdated({
            eraser: empty,
            'polygon-minus': empty,
        });
    }

    private colorForState(state: any): [number, number, number] {
        let color = state.color || this.tool?.color || '#ffffff';
        if (this.configuration.colorBy === ColorBy.LABEL) {
            color = state.label?.color || color;
        } else if (this.configuration.colorBy === ColorBy.GROUP) {
            color = state.group?.color || color;
        }
        return this.parseColor(color);
    }

    private parseColor(color: string): [number, number, number] {
        const shortHex = /^#([\da-f])([\da-f])([\da-f])$/i.exec(color);
        if (shortHex) {
            return shortHex.slice(1).map((value: string): number => (
                Number.parseInt(`${value}${value}`, 16)
            )) as [number, number, number];
        }
        const hex = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})/i.exec(color);
        if (hex) {
            return hex.slice(1).map((value: string): number => (
                Number.parseInt(value, 16)
            )) as [number, number, number];
        }
        const rgb = /^rgba?\(\s*(\d+)\D+(\d+)\D+(\d+)/i.exec(color);
        return rgb ? [
            Number(rgb[1]), Number(rgb[2]), Number(rgb[3]),
        ] : [255, 255, 255];
    }

    private applyConfiguration(): void {
        const opacity = typeof this.configuration.selectedShapeOpacity === 'number' ?
            this.configuration.selectedShapeOpacity : 0.5;
        this.canvas.style.opacity = `${Math.max(0, Math.min(1, opacity))}`;
    }

    private isRasterTool(): boolean {
        return ['brush', 'eraser', 'fill'].includes(this.tool?.type || '');
    }
}
