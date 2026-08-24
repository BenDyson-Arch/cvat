// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React, { useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Text from 'antd/lib/typography/Text';
import Button from 'antd/lib/button';

import { Canvas } from 'cvat-canvas-wrapper';
import { ActiveControl, CombinedState, Rotation } from 'reducers';
import { rotateCurrentFrame, updateActiveControl } from 'actions/annotation-actions';
import CursorControl from 'components/annotation-page/standard-workspace/controls-side-bar/cursor-control';
import MoveControl from 'components/annotation-page/standard-workspace/controls-side-bar/move-control';
import RotateControl from 'components/annotation-page/standard-workspace/controls-side-bar/rotate-control';
import FitControl from 'components/annotation-page/standard-workspace/controls-side-bar/fit-control';
import ResizeControl from 'components/annotation-page/standard-workspace/controls-side-bar/resize-control';
import ToolsControl from 'components/annotation-page/standard-workspace/controls-side-bar/tools-control';
import OpenCVControl from 'components/annotation-page/standard-workspace/controls-side-bar/opencv-control';
import SnapToolsControl from 'components/annotation-page/standard-workspace/controls-side-bar/snap-tools-control';
import Popover from 'antd/lib/popover';
import { CloseOutlined, SettingOutlined } from '@ant-design/icons';
import ImageSetupsContent from 'components/annotation-page/canvas/views/canvas2d/image-setups-content';
import SetupTagControl from 'components/annotation-page/standard-workspace/controls-side-bar/setup-tag-control';
import MergeControl from 'components/annotation-page/standard-workspace/controls-side-bar/merge-control';
import GroupControl from 'components/annotation-page/standard-workspace/controls-side-bar/group-control';
import SplitControl from 'components/annotation-page/standard-workspace/controls-side-bar/split-control';
import JoinControl from 'components/annotation-page/standard-workspace/controls-side-bar/join-control';
import SliceControl from 'components/annotation-page/standard-workspace/controls-side-bar/slice-control';
import { useTouchChrome } from './touch-chrome-context';
import { visibleShapesFromLabels } from './visible-shapes';

export default function TouchToolsSheet(): JSX.Element {
    const dispatch = useDispatch();
    const { dockPanel, setDockPanel } = useTouchChrome();
    const {
        canvasInstance, activeControl, labels, frameData, normalizedKeyMap,
    } = useSelector((state: CombinedState) => ({
        canvasInstance: state.annotation.canvas.instance,
        activeControl: state.annotation.canvas.activeControl,
        labels: state.annotation.job.labels,
        frameData: state.annotation.player.frame.data,
        normalizedKeyMap: state.shortcuts.normalizedKeyMap,
    }));

    const controlsDisabled = !labels.length || frameData.deleted;
    const visible = visibleShapesFromLabels(labels);

    const mergeProps = useMemo(() => (
        activeControl === ActiveControl.MERGE ? {
            className: 'cvat-merge-control cvat-active-canvas-control',
            onClick: (): void => {
                if (canvasInstance instanceof Canvas) {
                    canvasInstance.merge({ enabled: false });
                }
                dispatch(updateActiveControl(ActiveControl.CURSOR));
            },
        } : {
            className: 'cvat-merge-control',
            onClick: (): void => {
                if (canvasInstance instanceof Canvas) {
                    canvasInstance.cancel();
                    canvasInstance.merge({ enabled: true });
                }
                dispatch(updateActiveControl(ActiveControl.MERGE));
            },
        }
    ), [activeControl, canvasInstance, dispatch]);

    const groupProps = useMemo(() => (
        activeControl === ActiveControl.GROUP ? {
            className: 'cvat-group-control cvat-active-canvas-control',
            onClick: (): void => {
                if (canvasInstance instanceof Canvas) {
                    canvasInstance.group({ enabled: false });
                }
                dispatch(updateActiveControl(ActiveControl.CURSOR));
            },
        } : {
            className: 'cvat-group-control',
            onClick: (): void => {
                if (canvasInstance instanceof Canvas) {
                    canvasInstance.cancel();
                    canvasInstance.group({ enabled: true });
                }
                dispatch(updateActiveControl(ActiveControl.GROUP));
            },
        }
    ), [activeControl, canvasInstance, dispatch]);

    const splitProps = useMemo(() => (
        activeControl === ActiveControl.SPLIT ? {
            className: 'cvat-split-track-control cvat-active-canvas-control',
            onClick: (): void => {
                if (canvasInstance instanceof Canvas) {
                    canvasInstance.split({ enabled: false });
                }
            },
        } : {
            className: 'cvat-split-track-control',
            onClick: (): void => {
                if (canvasInstance instanceof Canvas) {
                    canvasInstance.cancel();
                    canvasInstance.split({ enabled: true });
                }
                dispatch(updateActiveControl(ActiveControl.SPLIT));
            },
        }
    ), [activeControl, canvasInstance, dispatch]);

    if (!(canvasInstance instanceof Canvas) || dockPanel !== 'annotation-tools') {
        return null;
    }

    return (
        <div className='cvat-touch-inline-tools'>
            <div className='cvat-touch-inline-tools-heading'>
                <Text strong>Tools</Text>
                <Button
                    type='text'
                    icon={<CloseOutlined />}
                    aria-label='Close tools'
                    onClick={() => setDockPanel('primary')}
                />
            </div>
            <Text strong>View</Text>
            <div className='cvat-touch-tools-grid'>
                <CursorControl
                    canvasInstance={canvasInstance}
                    activeControl={activeControl}
                    cursorShortkey={normalizedKeyMap.CANCEL}
                />
                <MoveControl canvasInstance={canvasInstance} activeControl={activeControl} />
                <FitControl canvasInstance={canvasInstance} />
                <ResizeControl canvasInstance={canvasInstance} activeControl={activeControl} />
                <RotateControl
                    anticlockwiseShortcut={normalizedKeyMap.ANTICLOCKWISE_ROTATION_STANDARD_CONTROLS}
                    clockwiseShortcut={normalizedKeyMap.CLOCKWISE_ROTATION_STANDARD_CONTROLS}
                    rotateFrame={(rotation: Rotation) => dispatch(rotateCurrentFrame(rotation))}
                />
                <Popover trigger='click' placement='top' overlayInnerStyle={{ padding: 0 }} content={<ImageSetupsContent />}>
                    <SettingOutlined className='cvat-touch-image-setups' aria-label='Image setups' />
                </Popover>
            </div>
            <Text strong>Assist</Text>
            <div className='cvat-touch-tools-grid'>
                <ToolsControl />
                <OpenCVControl />
                <SnapToolsControl />
                {visible.tag ? (
                    <SetupTagControl canvasInstance={canvasInstance} disabled={controlsDisabled} />
                ) : null}
            </div>
            <Text strong>Edit</Text>
            <div className='cvat-touch-tools-grid'>
                <MergeControl
                    canvasInstance={canvasInstance}
                    dynamicIconProps={mergeProps}
                    disabled={controlsDisabled}
                />
                <GroupControl
                    canvasInstance={canvasInstance}
                    dynamicIconProps={groupProps}
                    disabled={controlsDisabled}
                />
                <SplitControl
                    canvasInstance={canvasInstance}
                    dynamicIconProps={splitProps}
                    disabled={controlsDisabled}
                />
                <JoinControl
                    updateActiveControl={(control) => dispatch(updateActiveControl(control))}
                    canvasInstance={canvasInstance}
                    activeControl={activeControl}
                    disabled={controlsDisabled}
                />
                <SliceControl
                    updateActiveControl={(control) => dispatch(updateActiveControl(control))}
                    canvasInstance={canvasInstance}
                    activeControl={activeControl}
                    disabled={controlsDisabled}
                />
            </div>
        </div>
    );
}
