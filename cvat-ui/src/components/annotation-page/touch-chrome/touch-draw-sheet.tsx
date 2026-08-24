// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React, { useCallback, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import Drawer from 'antd/lib/drawer';
import { ShapeType } from 'cvat-core-wrapper';
import { RectangleIcon, PolygonIcon, PolylineIcon, PointIcon, EllipseIcon, CubeIcon, BrushIcon, SkeletonIcon } from 'icons';
import Icon from '@ant-design/icons';

import { CombinedState } from 'reducers';
import DrawShapePopoverContainer from 'containers/annotation-page/standard-workspace/controls-side-bar/draw-shape-popover';
import { visibleShapesFromLabels } from './visible-shapes';
import { useTouchChrome } from './touch-chrome-context';

const SHAPE_CELLS: {
    type: ShapeType;
    label: string;
    icon: React.ComponentType;
    key: keyof ReturnType<typeof visibleShapesFromLabels>;
}[] = [
    { type: ShapeType.RECTANGLE, label: 'Box', icon: RectangleIcon, key: 'rectangle' },
    { type: ShapeType.POLYGON, label: 'Polygon', icon: PolygonIcon, key: 'polygon' },
    { type: ShapeType.POLYLINE, label: 'Line', icon: PolylineIcon, key: 'polyline' },
    { type: ShapeType.POINTS, label: 'Points', icon: PointIcon, key: 'points' },
    { type: ShapeType.ELLIPSE, label: 'Ellipse', icon: EllipseIcon, key: 'ellipse' },
    { type: ShapeType.CUBOID, label: 'Cuboid', icon: CubeIcon, key: 'cuboid' },
    { type: ShapeType.MASK, label: 'Mask', icon: BrushIcon, key: 'mask' },
    { type: ShapeType.SKELETON, label: 'Skeleton', icon: SkeletonIcon, key: 'skeleton' },
];

export default function TouchDrawSheet(): JSX.Element {
    const { drawSheetOpen, setDrawSheetOpen } = useTouchChrome();
    const labels = useSelector((state: CombinedState) => state.annotation.job.labels);
    const lastShape = useSelector((state: CombinedState) => state.annotation.drawing.activeShapeType);
    const visible = visibleShapesFromLabels(labels);
    const [selected, setSelected] = useState<ShapeType | null>(lastShape);

    const close = useCallback(() => setDrawSheetOpen(false), [setDrawSheetOpen]);

    useEffect(() => {
        if (!drawSheetOpen) {
            return;
        }
        const vis = visibleShapesFromLabels(labels);
        const lastKey = SHAPE_CELLS.find((cell) => cell.type === lastShape)?.key;
        if (lastShape && lastKey && vis[lastKey]) {
            setSelected(lastShape);
            return;
        }
        const first = SHAPE_CELLS.find((cell) => vis[cell.key]);
        if (first) {
            setSelected(first.type);
        }
    }, [drawSheetOpen, lastShape, labels]);

    return (
        <Drawer
            title='Draw'
            placement='bottom'
            height='auto'
            open={drawSheetOpen}
            onClose={close}
            className='cvat-touch-draw-sheet'
            destroyOnClose={false}
        >
            <div className='cvat-touch-shape-grid'>
                {SHAPE_CELLS.filter((cell) => visible[cell.key]).map((cell) => (
                    <button
                        type='button'
                        key={cell.type}
                        className={`cvat-touch-shape-cell ${selected === cell.type ? 'cvat-touch-shape-cell-active' : ''}`}
                        onClick={() => setSelected(cell.type)}
                    >
                        <Icon component={cell.icon} />
                        <span>{cell.label}</span>
                    </button>
                ))}
            </div>
            {selected ? (
                <div onClickCapture={(event) => {
                    const target = event.target as HTMLElement;
                    if (target.closest('[class*="cvat-draw-"][class*="-shape-button"], [class*="cvat-draw-"][class*="-track-button"]')) {
                        setTimeout(close, 0);
                    }
                }}
                >
                    <DrawShapePopoverContainer key={selected} shapeType={selected} />
                </div>
            ) : null}
        </Drawer>
    );
}
