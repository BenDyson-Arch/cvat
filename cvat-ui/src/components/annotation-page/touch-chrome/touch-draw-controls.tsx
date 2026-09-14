// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React, {
    useCallback, useEffect, useMemo, useState,
} from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Button from 'antd/lib/button';
import Dropdown from 'antd/lib/dropdown';
import InputNumber from 'antd/lib/input-number';
import Segmented from 'antd/lib/segmented';
import Switch from 'antd/lib/switch';
import Icon, { DownOutlined } from '@ant-design/icons';
import ReactDOM from 'react-dom';

import {
    BrushIcon, CubeIcon, EllipseIcon, PointIcon, PolygonIcon, PolylineIcon, RectangleIcon, SkeletonIcon,
} from 'icons';
import { rememberObject } from 'actions/annotation-actions';
import { CombinedState } from 'reducers';
import {
    Canvas, CuboidDrawingMethod, RectDrawingMethod,
} from 'cvat-canvas-wrapper';
import {
    AnnotationProfile, Label, ObjectType, ShapeType,
} from 'cvat-core-wrapper';
import {
    applicableLabelsForShape, profileAllowsTracks, visibleShapesFromLabels,
} from './visible-shapes';
import { useTouchChrome } from './touch-chrome-context';
import { TOUCH_DROPDOWN_MENU_STYLE } from './constants';

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

export default function TouchDrawControls({ expanded }: { expanded: boolean }): JSX.Element {
    const dispatch = useDispatch();
    const { dockPanel, setDockPanel } = useTouchChrome();
    const {
        canvasInstance, labels, activeShapeType, activeLabelID, annotationProfile,
    } = useSelector((state: CombinedState) => ({
        canvasInstance: state.annotation.canvas.instance,
        labels: state.annotation.job.labels as Label[],
        activeShapeType: state.annotation.drawing.activeShapeType,
        activeLabelID: state.annotation.drawing.activeLabelID,
        annotationProfile: (
            state.annotation.job.instance?.annotationProfile || null
        ) as AnnotationProfile | null,
    }));
    const visible = useMemo(
        () => visibleShapesFromLabels(labels, annotationProfile),
        [labels, annotationProfile],
    );
    const firstVisibleTool = DRAW_TOOLS.find((tool) => visible[tool.visibleKey]);
    const selectedShape = activeShapeType || firstVisibleTool?.type || ShapeType.RECTANGLE;
    const labelsForShape = useMemo(
        () => applicableLabelsForShape(labels, selectedShape, annotationProfile),
        [labels, selectedShape, annotationProfile],
    );
    const selectedLabel = labelsForShape.find((label) => label.id === activeLabelID) || labelsForShape[0];
    const [objectType, setObjectType] = useState<ObjectType>(ObjectType.SHAPE);
    const [numberOfPoints, setNumberOfPoints] = useState<number | undefined>();
    const [rectMethod, setRectMethod] = useState<RectDrawingMethod>(RectDrawingMethod.CLASSIC);
    const [cuboidMethod, setCuboidMethod] = useState<CuboidDrawingMethod>(CuboidDrawingMethod.CLASSIC);
    const [simplifyPoly, setSimplifyPoly] = useState(false);
    const [selectorHost, setSelectorHost] = useState<HTMLElement | null>(null);
    const [classSelectorHost, setClassSelectorHost] = useState<HTMLElement | null>(null);

    useEffect(() => {
        setSelectorHost(window.document.getElementById('cvat-touch-draw-selector'));
        setClassSelectorHost(window.document.getElementById('cvat-touch-class-selector'));
    }, []);

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
        const candidates = applicableLabelsForShape(labels, shapeType, annotationProfile);
        const label = candidates.find((candidate) => candidate.id === labelID) || candidates[0];
        if (!label) {
            return;
        }
        const effectiveObjectType = profileAllowsTracks(annotationProfile, shapeType) ?
            nextObjectType : ObjectType.SHAPE;
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
        canvasInstance, labels, annotationProfile, objectType, numberOfPoints,
        rectMethod, cuboidMethod, simplifyPoly, dispatch,
    ]);

    const availableTools = DRAW_TOOLS.filter((tool) => visible[tool.visibleKey]);
    const selectedTool = availableTools.find((tool) => tool.type === selectedShape) || availableTools[0];
    const drawToolMenu = {
        selectedKeys: [selectedShape],
        style: TOUCH_DROPDOWN_MENU_STYLE,
        items: availableTools.map((tool) => ({
            key: tool.type,
            icon: <Icon component={tool.icon} />,
            label: tool.label,
            onClick: () => {
                setDockPanel('draw-tools');
                startDrawing(tool.type, activeLabelID, ObjectType.SHAPE);
            },
        })),
    };
    const modeSelector = selectorHost && selectedTool ? ReactDOM.createPortal((
        <div className='cvat-touch-mode-selector-group'>
            <Button
                type='text'
                className={`cvat-touch-mode-selector ${expanded ? 'cvat-touch-dock-button-active' : ''}`}
                aria-label={`Annotation mode: ${selectedTool.label}`}
                onClick={() => {
                    setDockPanel('draw-tools');
                    startDrawing(selectedTool.type, activeLabelID, ObjectType.SHAPE);
                }}
            >
                <Icon component={selectedTool.icon} />
            </Button>
            <Dropdown
                trigger={['click']}
                placement='topLeft'
                overlayClassName='cvat-touch-scrollable-dropdown'
                menu={drawToolMenu}
            >
                <Button
                    type='text'
                    className='cvat-touch-mode-selector-menu'
                    aria-label='Choose annotation mode'
                    icon={<DownOutlined className='cvat-touch-mode-selector-chevron' />}
                />
            </Dropdown>
        </div>
    ), selectorHost) : null;
    const classSelector = classSelectorHost && selectedLabel ? ReactDOM.createPortal((
        <Dropdown
            trigger={['click']}
            placement='topLeft'
            overlayClassName='cvat-touch-scrollable-dropdown cvat-touch-class-dropdown'
            menu={{
                selectedKeys: [`${selectedLabel.id}`],
                style: TOUCH_DROPDOWN_MENU_STYLE,
                items: labelsForShape.map((label) => ({
                    key: `${label.id}`,
                    label: (
                        <span className='cvat-touch-class-menu-item'>
                            <span className='cvat-touch-label-color' style={{ backgroundColor: label.color }} />
                            <span>{label.name}</span>
                        </span>
                    ),
                    onClick: () => startDrawing(selectedShape, label.id as number),
                })),
            }}
        >
            <Button
                type='text'
                className='cvat-touch-class-selector'
                aria-label={`Annotation class: ${selectedLabel.name}`}
            >
                <span className='cvat-touch-label-color' style={{ backgroundColor: selectedLabel.color }} />
                <span className='cvat-touch-class-selector-name'>{selectedLabel.name}</span>
                <DownOutlined className='cvat-touch-mode-selector-chevron' />
            </Button>
        </Dropdown>
    ), classSelectorHost) : null;

    return (
        <>
            {modeSelector}
            {classSelector}
            {expanded && dockPanel === 'draw-settings' ? (
                <div className='cvat-touch-draw-controls'>
                    <div className='cvat-touch-dock-rail cvat-touch-draw-settings'>
                        {profileAllowsTracks(annotationProfile, selectedShape) ? (
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
                                    startDrawing(
                                        selectedShape,
                                        selectedLabel?.id as number,
                                        objectType,
                                        { rect: next },
                                    );
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
                                    startDrawing(
                                        selectedShape,
                                        selectedLabel?.id as number,
                                        objectType,
                                        { cuboid: next },
                                    );
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
                </div>
            ) : null}
        </>
    );
}
