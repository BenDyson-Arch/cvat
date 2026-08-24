// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React from 'react';
import Button from 'antd/lib/button';
import { CheckCircleOutlined, CloseCircleOutlined, UndoOutlined } from '@ant-design/icons';
import { useSelector } from 'react-redux';

import { ActiveControl, CombinedState } from 'reducers';
import { Canvas } from 'cvat-canvas-wrapper';
import { finishDraw, finishDrawAvailable } from 'utils/drawing';
import { isTouchLayout } from 'utils/pointer';

function CanvasDrawActions(): JSX.Element | null {
    const { activeControl, canvasInstance } = useSelector((state: CombinedState) => ({
        activeControl: state.annotation.canvas.activeControl,
        canvasInstance: state.annotation.canvas.instance,
    }));

    if (isTouchLayout()) {
        return null;
    }

    if (!(canvasInstance instanceof Canvas)) {
        return null;
    }

    const canFinish = finishDrawAvailable(activeControl);
    const canUndoPoint = [
        ActiveControl.DRAW_POLYGON,
        ActiveControl.DRAW_POLYLINE,
        ActiveControl.DRAW_POINTS,
        ActiveControl.DRAW_CUBOID,
    ].includes(activeControl);
    const drawing = activeControl !== ActiveControl.CURSOR &&
        activeControl !== ActiveControl.DRAG_CANVAS &&
        activeControl !== ActiveControl.ZOOM_CANVAS;

    if (!drawing) {
        return null;
    }

    return (
        <div className='cvat-canvas-draw-actions' role='toolbar' aria-label='Drawing actions'>
            {canFinish ? (
                <Button
                    type='primary'
                    size='large'
                    className='cvat-canvas-draw-actions-done'
                    icon={<CheckCircleOutlined />}
                    onClick={() => finishDraw(canvasInstance, activeControl)}
                >
                    Done
                </Button>
            ) : null}
            {canUndoPoint ? (
                <Button
                    size='large'
                    className='cvat-canvas-draw-actions-undo-point'
                    icon={<UndoOutlined />}
                    onClick={() => canvasInstance.undoDrawPoint()}
                >
                    Undo point
                </Button>
            ) : null}
            <Button
                size='large'
                danger
                className='cvat-canvas-draw-actions-cancel'
                icon={<CloseCircleOutlined />}
                onClick={() => canvasInstance.cancel()}
            >
                Cancel
            </Button>
        </div>
    );
}

export default React.memo(CanvasDrawActions);
