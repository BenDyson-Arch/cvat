// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React, { useCallback, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Button from 'antd/lib/button';
import Icon, {
    AppstoreOutlined, CheckCircleOutlined, CloseCircleOutlined, DownOutlined, EditOutlined, UndoOutlined,
} from '@ant-design/icons';
import { CursorIcon, MoveIcon } from 'icons';

import { ActiveControl, CombinedState } from 'reducers';
import { Canvas } from 'cvat-canvas-wrapper';
import { repeatDrawShapeAsync } from 'actions/annotation-actions';
import { finishDraw, finishDrawAvailable } from 'utils/drawing';
import { useTouchChrome } from './touch-chrome-context';
import TouchDrawSheet from './touch-draw-sheet';
import TouchToolsSheet from './touch-tools-sheet';

export const TOUCH_DOCK_EXTRAS_ID = 'cvat-touch-dock-extras';

const DRAW_CONTROLS = new Set<ActiveControl>([
    ActiveControl.DRAW_RECTANGLE,
    ActiveControl.DRAW_POLYGON,
    ActiveControl.DRAW_POLYLINE,
    ActiveControl.DRAW_POINTS,
    ActiveControl.DRAW_ELLIPSE,
    ActiveControl.DRAW_MASK,
    ActiveControl.DRAW_CUBOID,
    ActiveControl.DRAW_SKELETON,
    ActiveControl.AI_TOOLS,
    ActiveControl.OPENCV_TOOLS,
]);

export default function TouchToolDock(): JSX.Element {
    const dispatch = useDispatch();
    const longPressTimer = useRef<number | null>(null);
    const skipNextDrawClick = useRef(false);
    const { setDrawSheetOpen, setToolsOpen, toolsOpen } = useTouchChrome();
    const { canvasInstance, activeControl, activeShapeType } = useSelector((state: CombinedState) => ({
        canvasInstance: state.annotation.canvas.instance,
        activeControl: state.annotation.canvas.activeControl,
        activeShapeType: state.annotation.drawing.activeShapeType,
    }));

    const drawing = DRAW_CONTROLS.has(activeControl);
    const panning = activeControl === ActiveControl.DRAG_CANVAS;
    const selecting = activeControl === ActiveControl.CURSOR;
    const canFinish = finishDrawAvailable(activeControl);
    const canUndoPoint = [
        ActiveControl.DRAW_POLYGON,
        ActiveControl.DRAW_POLYLINE,
        ActiveControl.DRAW_POINTS,
        ActiveControl.DRAW_CUBOID,
    ].includes(activeControl);

    const clearLongPress = (): void => {
        if (longPressTimer.current !== null) {
            window.clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    };

    const selectCursor = useCallback(() => {
        if (canvasInstance instanceof Canvas && activeControl !== ActiveControl.CURSOR) {
            canvasInstance.cancel();
        }
    }, [canvasInstance, activeControl]);

    const togglePan = useCallback(() => {
        if (!(canvasInstance instanceof Canvas)) {
            return;
        }
        if (activeControl === ActiveControl.DRAG_CANVAS) {
            canvasInstance.dragCanvas(false);
        } else {
            canvasInstance.cancel();
            canvasInstance.dragCanvas(true);
        }
    }, [canvasInstance, activeControl]);

    const onDrawTap = useCallback(() => {
        if (skipNextDrawClick.current) {
            skipNextDrawClick.current = false;
            return;
        }
        if (!(canvasInstance instanceof Canvas)) {
            return;
        }
        if (drawing) {
            canvasInstance.draw({ enabled: false });
            return;
        }
        if (activeShapeType) {
            dispatch(repeatDrawShapeAsync());
            return;
        }
        setDrawSheetOpen(true);
    }, [canvasInstance, drawing, activeShapeType, dispatch, setDrawSheetOpen]);

    return (
        <>
            <div className={`cvat-touch-tool-dock ${drawing ? 'cvat-touch-tool-dock-drawing' : ''}`}>
                <div id={TOUCH_DOCK_EXTRAS_ID} className='cvat-touch-dock-extras' />
                {drawing && canvasInstance instanceof Canvas ? (
                    <div className='cvat-touch-dock-session'>
                        {canFinish ? (
                            <Button
                                type='primary'
                                className='cvat-touch-dock-button cvat-touch-dock-done'
                                aria-label='Done'
                                icon={<CheckCircleOutlined />}
                                onClick={() => finishDraw(canvasInstance, activeControl)}
                            />
                        ) : null}
                        {canUndoPoint ? (
                            <Button
                                type='text'
                                className='cvat-touch-dock-button'
                                aria-label='Undo point'
                                icon={<UndoOutlined />}
                                onClick={() => canvasInstance.undoDrawPoint()}
                            />
                        ) : null}
                        <Button
                            type='text'
                            danger
                            className='cvat-touch-dock-button cvat-touch-dock-cancel'
                            aria-label='Cancel'
                            icon={<CloseCircleOutlined />}
                            onClick={() => canvasInstance.cancel()}
                        />
                    </div>
                ) : null}
                <div className='cvat-touch-dock-nav'>
                    <Button
                        type='text'
                        className={`cvat-touch-dock-button ${selecting ? 'cvat-touch-dock-button-active' : ''}`}
                        aria-label='Select'
                        onClick={selectCursor}
                    >
                        <Icon component={CursorIcon} />
                    </Button>
                    <div className={`cvat-touch-dock-draw ${drawing ? 'cvat-touch-dock-button-active' : ''}`}>
                        <Button
                            type='text'
                            className='cvat-touch-dock-button cvat-touch-dock-draw-main'
                            aria-label='Draw'
                            onPointerDown={() => {
                                clearLongPress();
                                longPressTimer.current = window.setTimeout(() => {
                                    longPressTimer.current = null;
                                    skipNextDrawClick.current = true;
                                    setDrawSheetOpen(true);
                                }, 450);
                            }}
                            onPointerUp={clearLongPress}
                            onPointerCancel={clearLongPress}
                            onClick={onDrawTap}
                        >
                            <EditOutlined />
                        </Button>
                        <Button
                            type='text'
                            className='cvat-touch-dock-button cvat-touch-dock-draw-chevron'
                            aria-label='Choose shape'
                            onClick={() => setDrawSheetOpen(true)}
                        >
                            <DownOutlined />
                        </Button>
                    </div>
                    <Button
                        type='text'
                        className={`cvat-touch-dock-button ${panning ? 'cvat-touch-dock-button-active' : ''}`}
                        aria-label='Pan'
                        onClick={togglePan}
                    >
                        <Icon component={MoveIcon} />
                    </Button>
                    <Button
                        type='text'
                        className={`cvat-touch-dock-button ${toolsOpen ? 'cvat-touch-dock-button-active' : ''}`}
                        aria-label='Tools'
                        onClick={() => setToolsOpen(true)}
                    >
                        <AppstoreOutlined />
                    </Button>
                </div>
            </div>
            <TouchDrawSheet />
            <TouchToolsSheet />
        </>
    );
}
