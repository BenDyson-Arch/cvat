// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import * as SVG from 'svg.js';

import {
    Configuration,
    CuboidDrawingMethod,
    DrawData,
    Geometry,
    RectDrawingMethod,
} from './canvasModel';
import consts from './consts';
import { cuboidFrom4Points } from './cuboid';
import { NormalizedCanvasPointer } from './pointer';

type DrawDone = (
    data: object | null,
    duration?: number,
    continueDraw?: boolean,
    previousDrawData?: DrawData,
) => void;

interface CanvasPoint {
    x: number;
    y: number;
}

interface Bounds {
    left: number;
    top: number;
    right: number;
    bottom: number;
}

const DRAG_THRESHOLD = 3;

function flatten(points: CanvasPoint[]): number[] {
    return points.reduce((result: number[], point: CanvasPoint): number[] => {
        result.push(point.x, point.y);
        return result;
    }, []);
}

function stringify(points: CanvasPoint[]): string {
    return points.map((point: CanvasPoint): string => `${point.x},${point.y}`).join(' ');
}

function boundsOf(points: CanvasPoint[]): Bounds {
    return points.reduce((bounds: Bounds, point: CanvasPoint): Bounds => ({
        left: Math.min(bounds.left, point.x),
        top: Math.min(bounds.top, point.y),
        right: Math.max(bounds.right, point.x),
        bottom: Math.max(bounds.bottom, point.y),
    }), {
        left: Number.MAX_SAFE_INTEGER,
        top: Number.MAX_SAFE_INTEGER,
        right: Number.MIN_SAFE_INTEGER,
        bottom: Number.MIN_SAFE_INTEGER,
    });
}

function pointsFromFlat(points: ArrayLike<number>): CanvasPoint[] {
    const result: CanvasPoint[] = [];
    for (let index = 0; index + 1 < points.length; index += 2) {
        result.push({ x: points[index], y: points[index + 1] });
    }
    return result;
}

/**
 * A Pencil-only vector drawing strategy. Pointer routing and Pencil/finger
 * arbitration deliberately live outside this class in CanvasPointerRouter.
 */
export class NativeTouchDrawHandler {
    private readonly onDrawDoneDefault: DrawDone;
    private readonly canvas: SVG.Container;
    private configuration: Configuration;
    private drawData: DrawData | null = null;
    private geometry: Geometry | null = null;
    private preview: SVG.Element | null = null;
    private skeleton: SVG.G | null = null;
    private skeletonTemplateBounds: Bounds | null = null;
    private committed: CanvasPoint[] = [];
    private transient: CanvasPoint | null = null;
    private anchor: CanvasPoint | null = null;
    private current: CanvasPoint | null = null;
    private pointerID: number | null = null;
    private pointerDownAt: CanvasPoint | null = null;
    private awaitingSecondPoint = false;
    private secondBoxInteraction = false;
    private startedAt = 0;
    private active = false;
    private canceled = false;
    private pasteMode = false;
    private pasteCenter: CanvasPoint | null = null;
    private pastePoints: CanvasPoint[] = [];

    public constructor(
        onDrawDone: DrawDone,
        canvas: SVG.Container,
        configuration: Configuration,
    ) {
        this.onDrawDoneDefault = onDrawDone;
        this.canvas = canvas;
        this.configuration = configuration;
    }

    public get enabled(): boolean {
        return this.active;
    }

    public configure(configuration: Configuration): void {
        this.configuration = configuration;
        this.applyAppearance();
        this.render();
    }

    public draw(drawData: DrawData, geometry: Geometry): void {
        this.geometry = geometry;

        if (!drawData.enabled) {
            if (this.active && this.isMultipart() && this.committed.length) {
                this.finishMultipart();
            } else {
                this.release();
            }
            this.drawData = drawData;
            return;
        }

        this.release();
        this.drawData = drawData;
        this.geometry = geometry;
        this.startedAt = Date.now();
        this.active = true;
        this.canceled = false;
        this.pasteMode = !!drawData.initialState;

        if (this.pasteMode) {
            this.initializePaste();
        } else {
            this.createPreview();
        }
    }

    public handlePointer(event: NormalizedCanvasPointer): void {
        if (!this.active || !this.drawData || !this.geometry || event.kind !== 'pen') {
            return;
        }

        if (event.phase === 'cancel') {
            if (event.pointerId === this.pointerID) {
                this.pointerID = null;
                this.pointerDownAt = null;
                this.transient = null;
                this.secondBoxInteraction = false;
                this.render();
            }
            return;
        }

        const point = this.constrainPoint(
            this.clampPoint({ x: event.canvasX, y: event.canvasY }),
            event.shiftKey,
        );
        if (this.pasteMode) {
            this.handlePastePointer(event, point);
        } else if (this.isMultipart()) {
            this.handleMultipartPointer(event, point);
        } else {
            this.handleBoxPointer(event, point);
        }
    }

    public undo(): boolean {
        if (!this.active || !this.isMultipart() || !this.committed.length) {
            return false;
        }

        this.committed.pop();
        this.transient = null;
        this.render();
        return true;
    }

    public cancel(): void {
        if (!this.active) {
            return;
        }
        this.canceled = true;
        this.release();
    }

    public release(): void {
        this.removePreview();
        this.active = false;
        this.pointerID = null;
        this.pointerDownAt = null;
        this.awaitingSecondPoint = false;
        this.secondBoxInteraction = false;
        this.anchor = null;
        this.current = null;
        this.transient = null;
        this.committed = [];
        this.pasteMode = false;
        this.pasteCenter = null;
        this.pastePoints = [];
    }

    public destroy(): void {
        this.release();
        this.drawData = null;
        this.geometry = null;
    }

    private handleBoxPointer(event: NormalizedCanvasPointer, point: CanvasPoint): void {
        if (event.phase === 'down') {
            if (event.altKey || (event.button !== 0 && event.buttons === 0)) {
                return;
            }
            if (this.pointerID !== null) {
                return;
            }

            this.pointerID = event.pointerId;
            this.pointerDownAt = point;
            this.secondBoxInteraction = this.awaitingSecondPoint;
            if (!this.anchor) {
                this.anchor = point;
            }
            this.current = point;
            this.render();
            return;
        }

        if (event.phase === 'move') {
            if (this.awaitingSecondPoint || event.pointerId === this.pointerID) {
                this.current = point;
                this.render();
            }
            return;
        }

        if (event.phase !== 'up' || event.pointerId !== this.pointerID) {
            return;
        }

        this.current = point;
        const moved = this.pointerDownAt ? Math.hypot(
            point.x - this.pointerDownAt.x,
            point.y - this.pointerDownAt.y,
        ) >= DRAG_THRESHOLD : false;
        this.pointerID = null;
        this.pointerDownAt = null;
        this.render();

        if (moved || this.secondBoxInteraction) {
            this.finishBox();
        } else {
            this.awaitingSecondPoint = true;
        }
    }

    private handleMultipartPointer(event: NormalizedCanvasPointer, point: CanvasPoint): void {
        if (event.phase === 'down') {
            if (event.altKey || (event.button !== 0 && event.buttons === 0) || this.pointerID !== null) {
                return;
            }
            this.pointerID = event.pointerId;
            this.transient = point;
            this.render();
            return;
        }

        if (event.phase === 'move' && event.pointerId === this.pointerID) {
            this.transient = point;
            this.render();
            return;
        }

        if (event.phase !== 'up' || event.pointerId !== this.pointerID) {
            return;
        }

        this.pointerID = null;
        this.transient = null;
        this.committed.push(point);
        this.render();

        const required = this.requiredPointCount();
        if (required !== null && this.committed.length >= required) {
            this.finishMultipart();
        }
    }

    private handlePastePointer(event: NormalizedCanvasPointer, point: CanvasPoint): void {
        if (event.phase === 'move') {
            this.movePaste(point);
            return;
        }
        if (event.phase === 'down' && !event.altKey && (event.button === 0 || event.buttons > 0)) {
            this.pointerID = event.pointerId;
            this.movePaste(point);
            return;
        }
        if (event.phase === 'up' && event.pointerId === this.pointerID) {
            this.pointerID = null;
            this.movePaste(point);
            this.finishPaste(event.ctrlKey);
        }
    }

    private isMultipart(): boolean {
        if (!this.drawData) {
            return false;
        }
        const { shapeType } = this.drawData;
        return !!shapeType && (['polygon', 'polyline', 'points'].includes(shapeType) ||
            (this.drawData.shapeType === 'rectangle' &&
                this.drawData.rectDrawingMethod === RectDrawingMethod.EXTREME_POINTS) ||
            (this.drawData.shapeType === 'cuboid' &&
                this.drawData.cuboidDrawingMethod === CuboidDrawingMethod.CORNER_POINTS));
    }

    private requiredPointCount(): number | null {
        if (!this.drawData) {
            return null;
        }
        if (
            (this.drawData.shapeType === 'rectangle' &&
                this.drawData.rectDrawingMethod === RectDrawingMethod.EXTREME_POINTS) ||
            (this.drawData.shapeType === 'cuboid' &&
                this.drawData.cuboidDrawingMethod === CuboidDrawingMethod.CORNER_POINTS)
        ) {
            return 4;
        }
        return typeof this.drawData.numberOfPoints === 'number' ? this.drawData.numberOfPoints : null;
    }

    private createPreview(): void {
        if (!this.drawData) {
            return;
        }

        const { shapeType } = this.drawData;
        if (shapeType === 'rectangle') {
            this.preview = this.drawData.rectDrawingMethod === RectDrawingMethod.EXTREME_POINTS ?
                this.canvas.polygon('') : this.canvas.rect();
        } else if (shapeType === 'ellipse') {
            this.preview = this.canvas.ellipse();
        } else if (shapeType === 'polygon') {
            this.preview = this.canvas.polygon('');
        } else if (shapeType === 'polyline') {
            this.preview = this.canvas.polyline('');
        } else if (shapeType === 'points') {
            this.preview = this.canvas.group();
        } else if (shapeType === 'cuboid') {
            this.preview = this.canvas.group();
        } else if (shapeType === 'skeleton') {
            this.preview = this.canvas.rect();
            this.initializeSkeletonTemplate();
        }

        this.applyAppearance();
    }

    private applyAppearance(): void {
        const stroke = this.configuration.hideEditedObject ?
            'none' : (this.configuration.outlinedBorders || 'black');
        const fillOpacity = this.configuration.hideEditedObject ?
            0 : (this.configuration.selectedShapeOpacity ?? 0.5);
        const strokeWidth = consts.BASE_STROKE_WIDTH / (this.geometry?.scale || 1);

        if (this.preview) {
            this.preview.addClass('cvat_canvas_shape_drawing').attr({
                stroke,
                'stroke-width': strokeWidth,
                'fill-opacity': fillOpacity,
                'pointer-events': 'none',
            });
        }
        if (this.skeleton) {
            this.skeleton.attr({
                stroke,
                'stroke-width': strokeWidth,
                'pointer-events': 'none',
            });
        }
    }

    private render(): void {
        if (!this.active || !this.drawData || !this.preview) {
            return;
        }

        if (this.pasteMode) {
            this.renderPaste();
            return;
        }

        if (this.isMultipart()) {
            this.renderMultipart();
            return;
        }

        if (!this.anchor || !this.current) {
            return;
        }

        const bounds = boundsOf([this.anchor, this.current]);
        const width = bounds.right - bounds.left;
        const height = bounds.bottom - bounds.top;
        if (this.drawData.shapeType === 'ellipse') {
            (this.preview as SVG.Ellipse).move(bounds.left, bounds.top).size(width, height);
        } else if (this.drawData.shapeType !== 'cuboid') {
            (this.preview as SVG.Rect).move(bounds.left, bounds.top).size(width, height);
        }

        if (this.drawData.shapeType === 'cuboid') {
            this.renderCuboid(this.classicCuboidPoints(bounds));
        } else if (this.drawData.shapeType === 'skeleton') {
            this.renderSkeleton(bounds);
        }
    }

    private renderMultipart(): void {
        if (!this.drawData || !this.preview) {
            return;
        }
        const points = this.transient ? [...this.committed, this.transient] : [...this.committed];
        const { shapeType } = this.drawData;

        if (shapeType === 'points') {
            const group = this.preview as SVG.G;
            group.clear();
            const radius = (this.configuration.controlPointsSize || consts.TOUCH_POINT_SIZE) /
                (this.geometry?.scale || 1);
            const strokeWidth = consts.POINTS_STROKE_WIDTH / (this.geometry?.scale || 1);
            points.forEach((point: CanvasPoint): void => {
                group.circle(radius * 2).center(point.x, point.y).attr({
                    fill: 'white',
                    stroke: this.configuration.outlinedBorders || 'black',
                    'stroke-width': strokeWidth,
                });
            });
            return;
        }

        if (shapeType === 'cuboid' && points.length === 4) {
            this.renderCuboid(cuboidFrom4Points(flatten(points)));
            return;
        }

        if (shapeType === 'cuboid') {
            this.renderCuboid([]);
            if (points.length > 1) {
                (this.preview as SVG.G).polyline(stringify(points)).fill('none');
            }
            return;
        }

        if (shapeType === 'rectangle' && points.length === 4) {
            const bounds = boundsOf(points);
            (this.preview as SVG.Polygon).plot(stringify([
                { x: bounds.left, y: bounds.top },
                { x: bounds.right, y: bounds.top },
                { x: bounds.right, y: bounds.bottom },
                { x: bounds.left, y: bounds.bottom },
            ]));
            return;
        }

        (this.preview as SVG.Polygon | SVG.PolyLine).plot(stringify(points));
    }

    private renderCuboid(source: number[] | CanvasPoint[]): void {
        if (!this.preview || this.preview.type !== 'g') {
            return;
        }

        const group = this.preview as SVG.G;
        group.clear();
        const points = Array.isArray(source) && source.length && typeof source[0] === 'number' ?
            pointsFromFlat(source as number[]) : source as CanvasPoint[];
        if (points.length !== 8) {
            return;
        }

        const stroke = this.configuration.hideEditedObject ?
            'none' : (this.configuration.outlinedBorders || 'black');
        const strokeWidth = consts.BASE_STROKE_WIDTH / (this.geometry?.scale || 1);
        const edges = [
            [0, 1], [2, 3], [4, 5], [6, 7],
            [0, 2], [2, 4], [4, 6], [6, 0],
            [1, 3], [3, 5], [5, 7], [7, 1],
        ];
        edges.forEach(([from, to]: number[]): void => {
            group.line(points[from].x, points[from].y, points[to].x, points[to].y).attr({
                stroke,
                'stroke-width': strokeWidth,
            });
        });
    }

    private classicCuboidPoints(bounds: Bounds): CanvasPoint[] {
        const depthX = (bounds.right - bounds.left) * 0.1;
        const depthY = (bounds.bottom - bounds.top) * 0.1;
        return pointsFromFlat(cuboidFrom4Points([
            bounds.left,
            bounds.bottom,
            bounds.right,
            bounds.bottom,
            bounds.right,
            bounds.top,
            bounds.right + depthX,
            bounds.top - depthY,
        ]));
    }

    private initializeSkeletonTemplate(): void {
        if (!this.drawData?.skeletonSVG) {
            return;
        }
        this.skeleton = this.canvas.group();
        this.skeleton.node.replaceChildren(...this.drawData.skeletonSVG.cloneNode(true).childNodes);
        const templatePoints: CanvasPoint[] = [];
        Array.from(this.skeleton.node.children as HTMLCollectionOf<Element>).forEach((child: Element): void => {
            if (child.tagName.toLowerCase() === 'circle') {
                templatePoints.push({
                    x: +(child.getAttribute('cx') || 0),
                    y: +(child.getAttribute('cy') || 0),
                });
            }
        });
        this.skeletonTemplateBounds = templatePoints.length ? boundsOf(templatePoints) : null;
        this.applyAppearance();
    }

    private renderSkeleton(bounds: Bounds): void {
        if (!this.skeleton || !this.drawData?.skeletonSVG || !this.skeletonTemplateBounds) {
            return;
        }

        this.skeleton.node.replaceChildren(...this.drawData.skeletonSVG.cloneNode(true).childNodes);
        const source = this.skeletonTemplateBounds;
        const sourceWidth = source.right - source.left;
        const sourceHeight = source.bottom - source.top;
        const width = bounds.right - bounds.left;
        const height = bounds.bottom - bounds.top;
        Array.from(this.skeleton.node.children as HTMLCollectionOf<Element>).forEach((child: Element): void => {
            if (child.tagName.toLowerCase() !== 'circle') {
                return;
            }
            const sourceX = +(child.getAttribute('cx') || 0);
            const sourceY = +(child.getAttribute('cy') || 0);
            const xRatio = sourceWidth ? (sourceX - source.left) / sourceWidth : 0.5;
            const yRatio = sourceHeight ? (sourceY - source.top) / sourceHeight : 0.5;
            child.setAttribute('cx', `${bounds.left + xRatio * width}`);
            child.setAttribute('cy', `${bounds.top + yRatio * height}`);
            child.setAttribute(
                'r',
                `${(this.configuration.controlPointsSize || consts.TOUCH_POINT_SIZE) /
                    (this.geometry?.scale || 1)}`,
            );
        });
        this.updateSkeletonEdges();
    }

    private updateSkeletonEdges(): void {
        if (!this.skeleton) {
            return;
        }
        Array.from(this.skeleton.node.children as HTMLCollectionOf<Element>).forEach((child: Element): void => {
            if (child.tagName.toLowerCase() !== 'line') {
                return;
            }
            const fromID = child.getAttribute('data-node-from');
            const toID = child.getAttribute('data-node-to');
            if (!fromID || !toID) {
                return;
            }
            const from = this.skeleton.node.querySelector(`[data-node-id="${fromID}"]`);
            const to = this.skeleton.node.querySelector(`[data-node-id="${toID}"]`);
            if (from && to) {
                child.setAttribute('x1', from.getAttribute('cx') || '0');
                child.setAttribute('y1', from.getAttribute('cy') || '0');
                child.setAttribute('x2', to.getAttribute('cx') || '0');
                child.setAttribute('y2', to.getAttribute('cy') || '0');
            }
        });
    }

    private finishBox(): void {
        if (!this.drawData || !this.anchor || !this.current) {
            return;
        }
        const bounds = boundsOf([this.anchor, this.current]);
        const width = bounds.right - bounds.left;
        const height = bounds.bottom - bounds.top;
        const dimensionsValid = this.drawData.shapeType === 'skeleton' ?
            width >= consts.SIZE_THRESHOLD || height >= consts.SIZE_THRESHOLD :
            width >= consts.SIZE_THRESHOLD && height >= consts.SIZE_THRESHOLD;
        if (!dimensionsValid) {
            this.complete(null);
            return;
        }

        const { shapeType, redraw: clientID } = this.drawData;
        if (shapeType === 'rectangle') {
            this.complete({
                clientID,
                shapeType,
                points: this.toImage([
                    bounds.left, bounds.top, bounds.right, bounds.bottom,
                ]),
            });
        } else if (shapeType === 'ellipse') {
            const cx = (bounds.left + bounds.right) / 2;
            const cy = (bounds.top + bounds.bottom) / 2;
            this.complete({
                clientID,
                shapeType,
                points: this.toImage([cx, cy, bounds.right, bounds.top]),
            });
        } else if (shapeType === 'cuboid') {
            const points = flatten(this.classicCuboidPoints(bounds));
            this.complete({ clientID, shapeType, points: this.toImage(points) });
        } else if (shapeType === 'skeleton') {
            const elements = this.readSkeletonElements();
            this.complete({ clientID, shapeType, elements });
        }
    }

    private finishMultipart(): void {
        if (!this.drawData || !this.committed.length) {
            this.release();
            return;
        }

        const { shapeType, redraw: clientID, simplifyPoly } = this.drawData;
        if (shapeType === 'rectangle') {
            const bounds = boundsOf(this.committed);
            if (
                this.committed.length < 4 ||
                bounds.right - bounds.left < consts.SIZE_THRESHOLD ||
                bounds.bottom - bounds.top < consts.SIZE_THRESHOLD
            ) {
                this.complete(null);
                return;
            }
            this.complete({
                clientID,
                shapeType,
                points: this.toImage([bounds.left, bounds.top, bounds.right, bounds.bottom]),
            });
            return;
        }

        if (shapeType === 'cuboid') {
            if (this.committed.length < 4) {
                this.complete(null);
                return;
            }
            const input = this.toImage(flatten(this.committed.slice(0, 4)));
            this.complete({ clientID, shapeType, points: cuboidFrom4Points(input) });
            return;
        }

        const points = this.toImage(flatten(this.committed));
        const bounds = boundsOf(this.committed);
        const width = bounds.right - bounds.left;
        const height = bounds.bottom - bounds.top;
        const valid = (
            (shapeType === 'polygon' && this.committed.length >= 3 &&
                (width >= consts.SIZE_THRESHOLD || height > consts.SIZE_THRESHOLD)) ||
            (shapeType === 'polyline' && this.committed.length >= 2 &&
                (width >= consts.SIZE_THRESHOLD || height >= consts.SIZE_THRESHOLD)) ||
            (shapeType === 'points' && this.committed.length >= 1)
        );
        this.complete(valid ? {
            clientID,
            shapeType,
            points,
            simplifyPoly,
        } : null);
    }

    private complete(result: object | null): void {
        if (this.canceled) {
            this.release();
            return;
        }
        const callback = (this.drawData?.onDrawDone || this.onDrawDoneDefault) as DrawDone;
        const duration = Date.now() - this.startedAt;
        this.release();
        callback(result, duration);
    }

    private initializePaste(): void {
        if (!this.drawData?.initialState || !this.geometry) {
            this.createPreview();
            return;
        }

        const state = this.drawData.initialState;
        const { geometry } = this;
        const sourcePoints = state.shapeType === 'skeleton' ?
            (state.elements || []).reduce((result: number[], element: any): number[] => {
                result.push(...element.points);
                return result;
            }, []) : state.points || [];
        this.pastePoints = pointsFromFlat(sourcePoints).map((point: CanvasPoint): CanvasPoint => ({
            x: point.x + geometry.offset,
            y: point.y + geometry.offset,
        }));
        if (this.pastePoints.length) {
            const bounds = boundsOf(this.pastePoints);
            this.pasteCenter = {
                x: (bounds.left + bounds.right) / 2,
                y: (bounds.top + bounds.bottom) / 2,
            };
        } else {
            this.pasteCenter = { x: this.geometry.offset, y: this.geometry.offset };
        }
        this.createPreview();
        this.renderPaste();
    }

    private movePaste(point: CanvasPoint): void {
        if (!this.pasteCenter) {
            return;
        }
        const dx = point.x - this.pasteCenter.x;
        const dy = point.y - this.pasteCenter.y;
        this.pastePoints = this.pastePoints.map((item: CanvasPoint): CanvasPoint => ({
            x: item.x + dx,
            y: item.y + dy,
        }));
        this.pasteCenter = point;
        this.renderPaste();
    }

    private renderPaste(): void {
        if (!this.drawData || !this.preview || !this.pastePoints.length) {
            return;
        }
        const { shapeType } = this.drawData;
        const bounds = boundsOf(this.pastePoints);
        if (shapeType === 'rectangle') {
            (this.preview as SVG.Rect).move(bounds.left, bounds.top)
                .size(bounds.right - bounds.left, bounds.bottom - bounds.top);
        } else if (shapeType === 'ellipse') {
            const [center, rightAndTop] = this.pastePoints;
            if (center && rightAndTop) {
                (this.preview as SVG.Ellipse)
                    .center(center.x, center.y)
                    .radius(
                        Math.abs(rightAndTop.x - center.x),
                        Math.abs(center.y - rightAndTop.y),
                    );
            }
        } else if (shapeType === 'polygon' || shapeType === 'polyline') {
            (this.preview as SVG.Polygon | SVG.PolyLine).plot(stringify(this.pastePoints));
        } else if (shapeType === 'points') {
            this.committed = [...this.pastePoints];
            this.renderMultipart();
            this.committed = [];
        } else if (shapeType === 'cuboid') {
            this.renderCuboid(this.pastePoints);
        } else if (shapeType === 'skeleton') {
            this.renderPastedSkeleton();
        }
    }

    private renderPastedSkeleton(): void {
        if (!this.skeleton || !this.drawData?.initialState) {
            return;
        }
        const elements = this.drawData.initialState.elements || [];
        Array.from(this.skeleton.node.children as HTMLCollectionOf<Element>).forEach((child: Element): void => {
            if (child.tagName.toLowerCase() !== 'circle') {
                return;
            }
            const labelID = +(child.getAttribute('data-label-id') || NaN);
            const index = elements.findIndex((element: any): boolean => (
                (element.label?.id ?? element.labelID) === labelID
            ));
            if (index >= 0 && this.pastePoints[index]) {
                child.setAttribute('cx', `${this.pastePoints[index].x}`);
                child.setAttribute('cy', `${this.pastePoints[index].y}`);
            }
        });
        this.updateSkeletonEdges();
    }

    private finishPaste(continueDraw: boolean): void {
        if (!this.drawData?.initialState) {
            return;
        }
        const state = this.drawData.initialState;
        const base = {
            shapeType: state.shapeType,
            objectType: state.objectType,
            occluded: state.occluded,
            attributes: { ...state.attributes },
            label: state.label,
            color: state.color,
            rotation: state.rotation,
        };
        const result = state.shapeType === 'skeleton' ? {
            ...base,
            elements: state.elements.map((element: any, index: number): object => ({
                shapeType: element.shapeType,
                outside: element.outside,
                occluded: element.occluded,
                label: element.label,
                attributes: element.attributes,
                points: this.toImage(flatten([this.pastePoints[index]])),
            })),
        } : {
            ...base,
            points: this.toImage(flatten(this.pastePoints)),
        };
        const callback = (this.drawData.onDrawDone || this.onDrawDoneDefault) as DrawDone;
        const previousDrawData = this.drawData;
        const duration = Date.now() - this.startedAt;
        callback(result, duration, continueDraw, previousDrawData);
        if (!continueDraw) {
            this.release();
        }
    }

    private readSkeletonElements(): object[] {
        if (!this.skeleton) {
            return [];
        }
        const elements: object[] = [];
        Array.from(this.skeleton.node.children as HTMLCollectionOf<Element>).forEach((child: Element): void => {
            const dataType = child.getAttribute('data-type') || '';
            if (child.tagName.toLowerCase() === 'circle' && dataType.includes('element')) {
                elements.push({
                    shapeType: 'points',
                    points: this.toImage([
                        +(child.getAttribute('cx') || 0),
                        +(child.getAttribute('cy') || 0),
                    ]),
                    labelID: +(child.getAttribute('data-label-id') || 0),
                });
            }
        });
        return elements;
    }

    private clampPoint(point: CanvasPoint): CanvasPoint {
        if (!this.geometry) {
            return point;
        }
        const { offset, image } = this.geometry;
        return {
            x: Math.min(Math.max(point.x, offset), offset + image.width),
            y: Math.min(Math.max(point.y, offset), offset + image.height),
        };
    }

    private constrainPoint(point: CanvasPoint, enabled: boolean): CanvasPoint {
        if (!enabled) {
            return point;
        }
        const origin = this.isMultipart() ? this.committed[this.committed.length - 1] : this.anchor;
        if (!origin) {
            return point;
        }
        const dx = point.x - origin.x;
        const dy = point.y - origin.y;
        if (!this.isMultipart()) {
            const size = Math.max(Math.abs(dx), Math.abs(dy));
            return this.clampPoint({
                x: origin.x + Math.sign(dx || 1) * size,
                y: origin.y + Math.sign(dy || 1) * size,
            });
        }
        const distance = Math.hypot(dx, dy);
        const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
        return this.clampPoint({
            x: origin.x + Math.cos(angle) * distance,
            y: origin.y + Math.sin(angle) * distance,
        });
    }

    private toImage(points: number[]): number[] {
        const offset = this.geometry?.offset || 0;
        return points.map((coordinate: number): number => coordinate - offset);
    }

    private removePreview(): void {
        if (this.preview) {
            this.preview.remove();
            this.preview = null;
        }
        if (this.skeleton) {
            this.skeleton.remove();
            this.skeleton = null;
        }
        this.skeletonTemplateBounds = null;
    }
}
