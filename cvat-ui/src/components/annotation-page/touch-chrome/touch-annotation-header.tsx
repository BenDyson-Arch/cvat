// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React, { useCallback, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useHistory } from 'react-router';
import Button from 'antd/lib/button';
import Dropdown from 'antd/lib/dropdown';
import Modal from 'antd/lib/modal';
import notification from 'antd/lib/notification';
import Popover from 'antd/lib/popover';
import Slider from 'antd/lib/slider';
import InputNumber from 'antd/lib/input-number';
import Icon, {
    EllipsisOutlined,
    FullscreenExitOutlined,
    FullscreenOutlined,
    LeftOutlined,
    RightOutlined,
    UnorderedListOutlined,
} from '@ant-design/icons';
import { MenuProps } from 'antd/lib/menu';
import MDEditor from '@uiw/react-md-editor';
import rehypeSanitize from 'rehype-sanitize';

import { UndoIcon, RedoIcon } from 'icons';
import { CombinedState, NavigationType, Workspace } from 'reducers';
import {
    Job, DimensionType, JobStage, JobState,
} from 'cvat-core-wrapper';
import {
    changeFrameAsync,
    changeWorkspaceAsync,
    collectStatisticsAsync,
    redoActionAsync,
    setForceExitAnnotationFlag,
    showFilters as showFiltersAction,
    showStatistics as showStatisticsAction,
    switchPlay,
    undoActionAsync,
} from 'actions/annotation-actions';
import { switchSettingsModalVisible } from 'actions/settings-actions';
import AnnotationMenuComponent from 'components/annotation-page/top-bar/annotation-menu';
import AlignedViewSelector from 'components/annotation-page/top-bar/aligned-view-selector';
import SaveAnnotationsButton from 'components/annotation-page/top-bar/save-annotations-button';
import 'components/annotation-page/top-bar/left-group';
import 'components/annotation-page/top-bar/player-buttons';
import GlobalHotKeys from 'utils/mousetrap-react';
import { subKeyMap } from 'utils/component-subkeymap';
import { ShortcutScope } from 'utils/enums';
import isAbleToChangeFrame from 'utils/is-able-to-change-frame';
import { isIPadLike } from 'utils/pointer';
import { writeLatestFrame } from 'utils/remember-latest-frame';
import config from 'config';
import { useTouchChrome } from './touch-chrome-context';
import { TOUCH_DROPDOWN_MENU_STYLE } from './constants';

const headerShortcuts = {
    UNDO: {
        name: 'Undo action',
        description: 'Cancel the latest action related with objects',
        sequences: ['ctrl+z'],
        scope: ShortcutScope.ANNOTATION_PAGE,
    },
    REDO: {
        name: 'Redo action',
        description: 'Cancel undo action',
        sequences: ['ctrl+shift+z', 'ctrl+y'],
        scope: ShortcutScope.ANNOTATION_PAGE,
    },
    NEXT_FRAME: {
        name: 'Next frame',
        description: 'Go to the next frame',
        sequences: ['f'],
        scope: ShortcutScope.ANNOTATION_PAGE,
    },
    PREV_FRAME: {
        name: 'Previous frame',
        description: 'Go to the previous frame',
        sequences: ['d'],
        scope: ShortcutScope.ANNOTATION_PAGE,
    },
    PLAY_PAUSE: {
        name: 'Play/pause',
        description: 'Start/stop automatic changing frames',
        sequences: ['space'],
        scope: ShortcutScope.ANNOTATION_PAGE,
    },
};

export default function TouchAnnotationHeader(): JSX.Element {
    const dispatch = useDispatch();
    const history = useHistory();
    const { objectsOpen, setObjectsOpen } = useTouchChrome();
    const [frameOpen, setFrameOpen] = useState(false);
    const [fullscreen, setFullscreen] = useState(Boolean(window.document.fullscreenElement));
    const fullscreenAvailable = window.document.fullscreenEnabled && !isIPadLike();

    const {
        jobInstance,
        frameNumber,
        playing,
        undoAction,
        redoAction,
        keyMap,
        annotationFilters,
        showDeletedFrames,
        navigationType,
        startFrame,
        stopFrame,
        frameFilename,
        initialOpenGuide,
        forceExit,
    } = useSelector((state: CombinedState) => {
        const job = state.annotation.job.instance as Job;
        return {
            jobInstance: job,
            frameNumber: state.annotation.player.frame.number,
            playing: state.annotation.player.playing,
            undoAction: state.annotation.annotations.history.undo.length ?
                state.annotation.annotations.history.undo[state.annotation.annotations.history.undo.length - 1][0] :
                undefined,
            redoAction: state.annotation.annotations.history.redo.length ?
                state.annotation.annotations.history.redo[state.annotation.annotations.history.redo.length - 1][0] :
                undefined,
            keyMap: state.shortcuts.keyMap,
            annotationFilters: state.annotation.annotations.filters,
            showDeletedFrames: state.settings.player.showDeletedFrames,
            navigationType: state.annotation.player.navigationType,
            startFrame: job.startFrame,
            stopFrame: job.stopFrame,
            frameFilename: state.annotation.player.frame.filename,
            initialOpenGuide: state.annotation.job.queryParameters.initialOpenGuide,
            forceExit: state.annotation.annotations.saving.forceExit,
        };
    });

    const changeFrame = useCallback((frame: number) => {
        if (isAbleToChangeFrame(frame)) {
            dispatch(changeFrameAsync(frame));
        }
    }, [dispatch]);

    const toggleFullscreen = useCallback(() => {
        const request = window.document.fullscreenElement ?
            window.document.exitFullscreen() :
            window.document.documentElement.requestFullscreen();
        request.catch((error: Error) => {
            notification.warning({
                message: 'Could not change fullscreen mode',
                description: error.message,
            });
        });
    }, []);

    useEffect(() => {
        const handleFullscreenChange = (): void => {
            setFullscreen(Boolean(window.document.fullscreenElement));
        };

        window.document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => window.document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    const goAdjacent = useCallback(async (direction: 1 | -1) => {
        const from = direction > 0 ?
            Math.min(stopFrame, frameNumber + 1) :
            Math.max(startFrame, frameNumber - 1);
        const to = direction > 0 ? stopFrame : startFrame;
        const newFrame = await jobInstance.frames.search(
            { notDeleted: !showDeletedFrames },
            from,
            to,
        );
        if (newFrame !== frameNumber && newFrame !== null && isAbleToChangeFrame(newFrame)) {
            if (playing) {
                dispatch(switchPlay(false));
            }
            if (navigationType === NavigationType.REGULAR) {
                changeFrame(newFrame);
            }
        }
    }, [
        jobInstance, frameNumber, startFrame, stopFrame, showDeletedFrames,
        playing, navigationType, changeFrame, dispatch,
    ]);

    const openGuide = useCallback(() => {
        const padding = Math.min(window.screen.availHeight, window.screen.availWidth) * 0.4;
        jobInstance.guide().then((guide) => {
            if (guide) {
                Modal.info({
                    icon: null,
                    width: window.screen.availWidth - padding,
                    className: 'cvat-annotation-view-markdown-guide-modal',
                    content: (
                        <MDEditor
                            visibleDragbar={false}
                            data-color-mode='light'
                            height={window.screen.availHeight - padding}
                            preview='preview'
                            hideToolbar
                            value={guide.markdown}
                            previewOptions={{ rehypePlugins: [[rehypeSanitize]] }}
                        />
                    ),
                });
            }
        }).catch((error: unknown) => {
            notification.error({
                message: 'Could not receive annotation guide',
                description: error instanceof Error ? error.message : 'Unknown error',
            });
        });
    }, [jobInstance]);

    useEffect(() => {
        if (Number.isInteger(jobInstance?.guideId)) {
            if (initialOpenGuide) {
                openGuide();
            } else if (
                jobInstance?.stage === JobStage.ANNOTATION &&
                jobInstance?.state === JobState.NEW
            ) {
                let seenGuides: number[] = [];
                try {
                    seenGuides = JSON.parse(localStorage.getItem('seenGuides') || '[]');
                    if (!Array.isArray(seenGuides) || seenGuides.some((el) => !Number.isInteger(el))) {
                        throw new Error('Wrong structure stored in local storage');
                    }
                } catch (_error: unknown) {
                    seenGuides = [];
                }

                if (!seenGuides.includes(jobInstance.guideId as number)) {
                    openGuide();
                    const updatedSeenGuides = Array.from(new Set([
                        jobInstance.guideId as number,
                        ...seenGuides.slice(0, config.LOCAL_STORAGE_SEEN_GUIDES_MEMORY_LIMIT - 1),
                    ]));
                    localStorage.setItem('seenGuides', JSON.stringify(updatedSeenGuides));
                }
            }
        }
    }, []);

    useEffect(() => {
        const confirmationMessage = 'You have unsaved changes, please confirm leaving this page.';
        const unblock = history.block((location) => {
            writeLatestFrame(jobInstance.id, frameNumber);
            if (
                jobInstance.annotations.hasUnsavedChanges() &&
                location.pathname !== `/tasks/${jobInstance.taskId}/jobs/${jobInstance.id}` &&
                !forceExit
            ) {
                return confirmationMessage;
            }

            if (forceExit) {
                dispatch(setForceExitAnnotationFlag(false));
            }
            return undefined;
        });
        const handleBeforeUnload = (event: BeforeUnloadEvent): string | undefined => {
            writeLatestFrame(jobInstance.id, frameNumber);
            if (jobInstance.annotations.hasUnsavedChanges() && !forceExit) {
                // eslint-disable-next-line no-param-reassign
                event.returnValue = confirmationMessage;
                return confirmationMessage;
            }

            if (forceExit) {
                dispatch(setForceExitAnnotationFlag(false));
            }
            return undefined;
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => {
            unblock();
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, [dispatch, forceExit, frameNumber, history, jobInstance]);

    const handlers = {
        UNDO: (event?: KeyboardEvent) => {
            event?.preventDefault();
            dispatch(undoActionAsync());
        },
        REDO: (event?: KeyboardEvent) => {
            event?.preventDefault();
            dispatch(redoActionAsync());
        },
        NEXT_FRAME: (event?: KeyboardEvent) => {
            event?.preventDefault();
            goAdjacent(1);
        },
        PREV_FRAME: (event?: KeyboardEvent) => {
            event?.preventDefault();
            goAdjacent(-1);
        },
        PLAY_PAUSE: (event?: KeyboardEvent) => {
            event?.preventDefault();
            dispatch(switchPlay(!playing));
        },
    };

    const moreItems: MenuProps['items'] = [
        {
            key: 'filters',
            label: `Filters${annotationFilters.length ? ` (${annotationFilters.length})` : ''}`,
            onClick: () => dispatch(showFiltersAction(true)),
        },
        {
            key: 'info',
            label: 'Job info',
            onClick: () => {
                dispatch(collectStatisticsAsync(jobInstance));
                dispatch(showStatisticsAction(true));
            },
        },
        {
            key: 'settings',
            label: 'Settings',
            onClick: () => dispatch(switchSettingsModalVisible(true)),
        },
        ...(jobInstance.guideId !== null ? [{
            key: 'guide',
            label: 'Guide',
            onClick: () => openGuide(),
        }] : []),
        {
            key: 'play',
            label: playing ? 'Pause' : 'Play',
            onClick: () => dispatch(switchPlay(!playing)),
        },
        {
            key: 'first',
            label: 'First frame',
            onClick: () => changeFrame(startFrame),
        },
        {
            key: 'last',
            label: 'Last frame',
            onClick: () => changeFrame(stopFrame),
        },
        {
            key: 'workspace',
            label: 'Workspace',
            children: Object.values(Workspace)
                .filter((ws) => {
                    if (jobInstance.mediaType !== 'audio' && ws === Workspace.AUDIO) return false;
                    if (jobInstance.dimension === DimensionType.DIMENSION_3D) {
                        return ws === Workspace.STANDARD3D;
                    }
                    return ws !== Workspace.STANDARD3D;
                })
                .map((ws) => ({
                    key: ws,
                    label: ws,
                    onClick: () => dispatch(changeWorkspaceAsync(ws)),
                })),
        },
    ];

    return (
        <div className='cvat-touch-annotation-header-inner'>
            <GlobalHotKeys
                keyMap={subKeyMap(headerShortcuts, keyMap)}
                handlers={handlers}
            />
            <div className='cvat-touch-header-cluster'>
                <AnnotationMenuComponent />
                <SaveAnnotationsButton />
                <Button
                    type='link'
                    className='cvat-annotation-header-button'
                    disabled={!undoAction}
                    onClick={() => dispatch(undoActionAsync())}
                    aria-label='Undo'
                >
                    <Icon component={UndoIcon} />
                </Button>
                <Button
                    type='link'
                    className='cvat-annotation-header-button'
                    disabled={!redoAction}
                    onClick={() => dispatch(redoActionAsync())}
                    aria-label='Redo'
                >
                    <Icon component={RedoIcon} />
                </Button>
            </div>
            <div className='cvat-touch-header-player'>
                <Button
                    type='link'
                    className='cvat-annotation-header-button'
                    onClick={() => goAdjacent(-1)}
                    aria-label='Previous frame'
                >
                    <LeftOutlined />
                </Button>
                <Popover
                    trigger='click'
                    open={frameOpen}
                    onOpenChange={setFrameOpen}
                    overlayClassName='cvat-touch-frame-popover'
                    content={(
                        <div>
                            <Slider
                                min={startFrame}
                                max={stopFrame}
                                value={frameNumber}
                                onChange={(value: number) => changeFrame(value)}
                            />
                            <InputNumber
                                size='small'
                                min={startFrame}
                                max={stopFrame}
                                value={frameNumber}
                                onChange={(value) => {
                                    if (typeof value === 'number') {
                                        changeFrame(value);
                                    }
                                }}
                            />
                            <div className='cvat-touch-frame-filename' title={frameFilename}>{frameFilename}</div>
                        </div>
                    )}
                >
                    <Button type='text' className='cvat-touch-frame-button'>
                        {frameNumber}
                    </Button>
                </Popover>
                <Button
                    type='link'
                    className='cvat-annotation-header-button'
                    onClick={() => goAdjacent(1)}
                    aria-label='Next frame'
                >
                    <RightOutlined />
                </Button>
                <AlignedViewSelector />
            </div>
            <div className='cvat-touch-header-cluster'>
                <Button
                    type='link'
                    className={`cvat-annotation-header-button ${objectsOpen ? 'cvat-button-active' : ''}`}
                    onClick={() => setObjectsOpen(!objectsOpen)}
                    aria-label='Objects'
                >
                    <UnorderedListOutlined />
                </Button>
                {fullscreenAvailable ? (
                    <Button
                        type='link'
                        className={`cvat-annotation-header-button ${fullscreen ? 'cvat-button-active' : ''}`}
                        onClick={toggleFullscreen}
                        aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                    >
                        {fullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
                    </Button>
                ) : null}
                <Dropdown
                    menu={{
                        items: moreItems,
                        triggerSubMenuAction: 'click',
                        style: TOUCH_DROPDOWN_MENU_STYLE,
                    }}
                    trigger={['click']}
                    placement='bottomRight'
                    overlayClassName='cvat-touch-scrollable-dropdown'
                >
                    <Button type='link' className='cvat-annotation-header-button' aria-label='More'>
                        <EllipsisOutlined />
                    </Button>
                </Dropdown>
            </div>
        </div>
    );
}
