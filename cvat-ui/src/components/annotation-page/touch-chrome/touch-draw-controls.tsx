// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React, {
    useCallback, useEffect, useMemo, useState,
} from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Button from 'antd/lib/button';
import InputNumber from 'antd/lib/input-number';
import Segmented from 'antd/lib/segmented';
import Select from 'antd/lib/select';
import Switch from 'antd/lib/switch';
import Icon from '@ant-design/icons';

import {
    BrushIcon, CubeIcon, EllipseIcon, PointIcon, PolygonIcon, PolylineIcon, RectangleIcon, SkeletonIcon,
} from 'icons';
import { rememberObject } from 'actions/annotation-actions';
import { CombinedState } from 'reducers';
import {
    Canvas, CuboidDrawingMethod, RectDrawingMethod,
} from 'cvat-canvas-wrapper';
import {
    Label, LabelType, ObjectType, ShapeType,
} from 'cvat-core-wrapper';
import { visibleShapesFromLabels } from './visible-shapes';
import { useTouchChrome } from './touch-chrome-context';

const DRAW_TOOLS: {
    type: ShapeType;
    label: string;
    icon: React.ComponentType;
    visibleKey: keyof ReturnType<typeof visibleShapesFromLabels>;
}[] = [
    {
        type: ShapeType.RECTANGLE, label: 'Box', icon: RectangleIcon, visibleKey: 'rectangle',
    },
    {
        type: ShapeType.POLYGON, label: 'Polygon', icon: PolygonIcon, visibleKey: 'polygon',
    },
    {
        type: ShapeType.POLYLINE, label: 'Line', icon: PolylineIcon, visibleKey: 'polyline',
    },
    {
        type: ShapeType.POINTS, label: 'Points', icon: PointIcon, visibleKey: 'points',
    },
    {
        type: ShapeType.ELLIPSE, label: 'Ellipse', icon: EllipseIcon, visibleKey: 'ellipse',
    },
    {
        type: ShapeType.CUBOID, label: 'Cuboid', icon: CubeIcon, visibleKey: 'cuboid',
    },
    {
        type: ShapeType.MASK, label: 'Mask', icon: BrushIcon, visibleKey: 'mask',
    },
    {
        type: ShapeType.SKELETON, label: 'Skeleton', icon: SkeletonIcon, visibleKey: 'skeleton',
    },
];

function applicableLabels(labels: Label[], shapeType: ShapeType): Label[] {
    return labels.filter((label: Label) => {
        if (shapeType === ShapeType.SKELETON) {
            return label.type === LabelType.SKELETON;
        }
        return !label.hasParent && ['any', shapeType].includes(label.type as string);
    });
}

export default function TouchDrawControls(): JSX.Element {
    const dispatch = useDispatch();
    const { dockPanel, setDockPanel } = useTouchChrome();
    const {
        canvasInstance, labels, activeShapeType, activeLabelID,
    } = useSelector((state: CombinedState) => ({
        canvasInstance: state.annotation.canvas.instance,
        labels: state.annotation.job.labels as Label[],
        activeShapeType: state.annotation.drawing.activeShapeType,
        activeLabelID: state.annotation.drawing.activeLabelID,
    }));
    const visible = useMemo(() => visibleShapesFromLabels(labels), [labels]);
    const firstVisibleTool = DRAW_TOOLS.find((tool) => visible[tool.visibleKey]);
    const selectedShape = activeShapeType || firstVisibleTool?.type || ShapeType.RECTANGLE;
    const labelsForShape = useMemo(
        () => applicableLabels(labels, selectedShape),
        [labels, selectedShape],
    );
    const selectedLabel = labelsForShape.find((label) => label.id === activeLabelID) || labelsForShape[0];
    const [objectType, setObjectType] = useState<ObjectType>(ObjectType.SHAPE);
    const [numberOfPoints, setNumberOfPoints] = useState<number | undefined>();
    const [rectMethod, setRectMethod] = useState<RectDrawingMethod>(RectDrawingMethod.CLASSIC);
    const [cuboidMethod, setCuboidMethod] = useState<CuboidDrawingMethod>(CuboidDrawingMethod.CLASSIC);
    const [simplifyPoly, setSimplifyPoly] = useState(false);

    useEffect(() => {
        if (selectedLabel && selectedLabel.id !== activeLabelID) {
            dispatch(rememberObject({ activeLabelID: selectedLabel.id as number }));
        }
    }, [selectedLabel?.id, activeLabelID, dispatch]);

    const startDrawing = useCallback((
        shapeType: ShapeType,
        labelID?: number,
        nextObjectType: ObjectType = objectType,
        overrides: {
            points?: number;
            rect?: RectDrawingMethod;
            cuboid?: CuboidDrawingMethod;
            simplify?: boolean;
        } = {},
    ): void => {
        if (!(canvasInstance instanceof Canvas)) {
            return;
        }
        const candidates = applicableLabels(labels, shapeType);
        const label = candidates.find((candidate) => candidate.id === labelID) || candidates[0];
        if (!label) {
            return;
        }
        const effectiveObjectType = shapeType === ShapeType.MASK ? ObjectType.SHAPE : nextObjectType;
        const effectivePoints = Object.prototype.hasOwnProperty.call(overrides, 'points') ?
            overrides.points : numberOfPoints;
        const effectiveRectMethod = overrides.rect ?? rectMethod;
        const effectiveCuboidMethod = overrides.cuboid ?? cuboidMethod;
        const effectiveSimplify = (overrides.simplify ?? simplifyPoly) && typeof effectivePoints === 'undefined';
        canvasInstance.cancel();
        canvasInstance.draw({
            enabled: true,
            shapeType,
            numberOfPoints: effectivePoints,
            rectDrawingMethod: shapeType === ShapeType.RECTANGLE ? effectiveRectMethod : undefined,
            cuboidDrawingMethod: shapeType === ShapeType.CUBOID ? effectiveCuboidMethod : undefined,
            simplifyPoly: [ShapeType.POLYGON, ShapeType.POLYLINE].includes(shapeType) ?
                effectiveSimplify : undefined,
            skeletonSVG: shapeType === ShapeType.SKELETON ? label.structure.svg : undefined,
            crosshair: [ShapeType.RECTANGLE, ShapeType.CUBOID, ShapeType.ELLIPSE].includes(shapeType),
        });
        dispatch(rememberObject({
            activeObjectType: effectiveObjectType,
            activeShapeType: shapeType,
            activeLabelID: label.id as number,
            activeNumOfPoints: effectivePoints,
            activeRectDrawingMethod: effectiveRectMethod,
            activeCuboidDrawingMethod: effectiveCuboidMethod,
            activeSimplifyPoly: effectiveSimplify,
        }));
    }, [
        canvasInstance, labels, objectType, numberOfPoints, rectMethod, cuboidMethod, simplifyPoly, dispatch,
    ]);

    return (
        <div className='cvat-touch-draw-controls'>
            <div className='cvat-touch-dock-rail cvat-touch-draw-tool-rail' aria-label='Drawing tools'>
                {DRAW_TOOLS.filter((tool) => visible[tool.visibleKey]).map((tool) => (
                    <Button
                        type='text'
                        key={tool.type}
                        className={`cvat-touch-rail-button ${selectedShape === tool.type ? 'cvat-touch-rail-button-active' : ''}`}
                        onClick={() => {
                            setDockPanel('draw-tools');
                            startDrawing(tool.type, activeLabelID, ObjectType.SHAPE);
                        }}
                    >
                        <Icon component={tool.icon} />
                        <span>{tool.label}</span>
                    </Button>
                ))}
            </div>
            <div className='cvat-touch-dock-rail cvat-touch-label-rail' aria-label='Annotation classes'>
                {labelsForShape.slice(0, 10).map((label) => (
                    <Button
                        type='text'
                        key={label.id}
                        className={`cvat-touch-label-chip ${selectedLabel?.id === label.id ? 'cvat-touch-label-chip-active' : ''}`}
                        onClick={() => startDrawing(selectedShape, label.id as number)}
                    >
                        <span className='cvat-touch-label-color' style={{ backgroundColor: label.color }} />
                        <span>{label.name}</span>
                    </Button>
                ))}
                {labelsForShape.length > 10 ? (
                    <Select
                        className='cvat-touch-label-overflow'
                        value={selectedLabel?.id}
                        options={labelsForShape.map((label) => ({
                            value: label.id,
                            label: label.name,
                        }))}
                        onChange={(labelID) => startDrawing(selectedShape, labelID)}
                    />
                ) : null}
            </div>
            {dockPanel === 'draw-settings' ? (
                <div className='cvat-touch-dock-rail cvat-touch-draw-settings'>
                    {selectedShape !== ShapeType.MASK ? (
                        <Segmented
                            value={objectType}
                            options={[
                                { label: 'Shape', value: ObjectType.SHAPE },
                                { label: 'Track', value: ObjectType.TRACK },
                            ]}
                            onChange={(value) => {
                                const next = value as ObjectType;
                                setObjectType(next);
                                startDrawing(selectedShape, selectedLabel?.id as number, next);
                            }}
                        />
                    ) : null}
                    {selectedShape === ShapeType.RECTANGLE ? (
                        <Segmented
                            value={rectMethod}
                            options={[
                                { label: '2 points', value: RectDrawingMethod.CLASSIC },
                                { label: '4 points', value: RectDrawingMethod.EXTREME_POINTS },
                            ]}
                            onChange={(value) => {
                                const next = value as RectDrawingMethod;
                                setRectMethod(next);
                                startDrawing(selectedShape, selectedLabel?.id as number, objectType, { rect: next });
                            }}
                        />
                    ) : null}
                    {selectedShape === ShapeType.CUBOID ? (
                        <Segmented
                            value={cuboidMethod}
                            options={[
                                { label: 'Classic', value: CuboidDrawingMethod.CLASSIC },
                                { label: '4 points', value: CuboidDrawingMethod.CORNER_POINTS },
                            ]}
                            onChange={(value) => {
                                const next = value as CuboidDrawingMethod;
                                setCuboidMethod(next);
                                startDrawing(selectedShape, selectedLabel?.id as number, objectType, { cuboid: next });
                            }}
                        />
                    ) : null}
                    {[ShapeType.POLYGON, ShapeType.POLYLINE, ShapeType.POINTS].includes(selectedShape) ? (
                        <div className='cvat-touch-points-setting'>
                            <span>Points</span>
                            <InputNumber
                                min={selectedShape === ShapeType.POLYGON ? 3 : 1}
                                value={numberOfPoints}
                                placeholder='Any'
                                onChange={(value) => {
                                    const next = typeof value === 'number' ? value : undefined;
                                    setNumberOfPoints(next);
                                    startDrawing(
                                        selectedShape,
                                        selectedLabel?.id as number,
                                        objectType,
                                        { points: next },
                                    );
                                }}
                            />
                        </div>
                    ) : null}
                    {[ShapeType.POLYGON, ShapeType.POLYLINE].includes(selectedShape) ? (
                        <div className='cvat-touch-simplify-setting'>
                            <span>Smooth</span>
                            <Switch
                                checked={simplifyPoly}
                                disabled={typeof numberOfPoints !== 'undefined'}
                                onChange={(checked) => {
                                    setSimplifyPoly(checked);
                                    startDrawing(
                                        selectedShape,
                                        selectedLabel?.id as number,
                                        objectType,
                                        { simplify: checked },
                                    );
                                }}
                            />
                        </div>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}
