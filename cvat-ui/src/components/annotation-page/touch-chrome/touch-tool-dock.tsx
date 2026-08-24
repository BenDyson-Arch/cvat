// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React, { useCallback } from 'react';
import { useSelector } from 'react-redux';
import Button from 'antd/lib/button';
import Icon, {
    AppstoreOutlined, CheckCircleOutlined, CloseCircleOutlined, EditOutlined, SettingOutlined, UndoOutlined,
} from '@ant-design/icons';
import { CursorIcon } from 'icons';

import { ActiveControl, CombinedState } from 'reducers';
import { Canvas } from 'cvat-canvas-wrapper';
import { finishDraw, finishDrawAvailable } from 'utils/drawing';
import { useTouchChrome } from './touch-chrome-context';
import TouchToolsSheet from './touch-tools-sheet';
import TouchDrawControls from './touch-draw-controls';

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
    const { dockPanel, setDockPanel } = useTouchChrome();
    const { canvasInstance, activeControl } = useSelector((state: CombinedState) => ({
        canvasInstance: state.annotation.canvas.instance,
        activeControl: state.annotation.canvas.activeControl,
    }));

    const drawing = DRAW_CONTROLS.has(activeControl);
    const selecting = activeControl === ActiveControl.CURSOR;
    const canFinish = finishDrawAvailable(activeControl);
    const canUndoPoint = [
        ActiveControl.DRAW_POLYGON,
        ActiveControl.DRAW_POLYLINE,
        ActiveControl.DRAW_POINTS,
        ActiveControl.DRAW_CUBOID,
    ].includes(activeControl);

    const selectCursor = useCallback(() => {
        if (canvasInstance instanceof Canvas && activeControl !== ActiveControl.CURSOR) {
            canvasInstance.cancel();
        }
    }, [canvasInstance, activeControl]);

    const onDrawTap = useCallback(() => {
        setDockPanel(dockPanel === 'draw-tools' ? 'primary' : 'draw-tools');
    }, [dockPanel, setDockPanel]);

    return (
        <div className={`cvat-touch-tool-dock ${drawing ? 'cvat-touch-tool-dock-drawing' : ''}`}>
            {(drawing || ['draw-tools', 'draw-settings', 'mask-settings'].includes(dockPanel)) ? (
                <TouchDrawControls />
            ) : null}
            <TouchToolsSheet />
            <div className='cvat-touch-dock-primary-row'>
                <div id={TOUCH_DOCK_EXTRAS_ID} className='cvat-touch-dock-extras' />
                {drawing && canvasInstance instanceof Canvas ? (
                    <div className='cvat-touch-dock-session'>
                        {canFinish && activeControl !== ActiveControl.DRAW_MASK ? (
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
                    <div className={`cvat-touch-dock-draw ${drawing || dockPanel === 'draw-tools' ? 'cvat-touch-dock-button-active' : ''}`}>
                        <Button
                            type='text'
                            className='cvat-touch-dock-button cvat-touch-dock-draw-main'
                            aria-label='Draw'
                            onClick={onDrawTap}
                        >
                            <EditOutlined />
                        </Button>
                        {drawing ? (
                            <Button
                                type='text'
                                className='cvat-touch-dock-button cvat-touch-dock-draw-chevron'
                                aria-label='Drawing settings'
                                onClick={() => setDockPanel(
                                    dockPanel === 'draw-settings' ? 'draw-tools' : 'draw-settings',
                                )}
                            >
                                <SettingOutlined />
                            </Button>
                        ) : null}
                    </div>
                    <Button
                        type='text'
                        className={`cvat-touch-dock-button ${dockPanel === 'annotation-tools' ? 'cvat-touch-dock-button-active' : ''}`}
                        aria-label='Tools'
                        onClick={() => setDockPanel(
                            dockPanel === 'annotation-tools' ? 'primary' : 'annotation-tools',
                        )}
                    >
                        <AppstoreOutlined />
                    </Button>
                </div>
            </div>
        </div>
    );
}
