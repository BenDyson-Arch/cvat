// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import './brush-toolbox-styles.scss';

import React, { useCallback, useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { useDispatch, useSelector } from 'react-redux';
import Button from 'antd/lib/button';
import Icon, {
    BgColorsOutlined, EyeInvisibleFilled, EyeOutlined, VerticalAlignBottomOutlined,
} from '@ant-design/icons';
import InputNumber from 'antd/lib/input-number';
import Select from 'antd/lib/select';
import Slider from 'antd/lib/slider';
import notification from 'antd/lib/notification';

import { filterApplicableForType } from 'utils/filter-applicable-labels';
import {
    getCore, Label, LabelType, ObjectType, ShapeType,
} from 'cvat-core-wrapper';
import { Canvas, CanvasMode } from 'cvat-canvas-wrapper';
import {
    BrushIcon, EraserIcon, PolygonMinusIcon, PolygonPlusIcon,
    PlusIcon, CheckIcon, MoveIcon,
} from 'icons';
import CVATTooltip from 'components/common/cvat-tooltip';
import { CombinedState } from 'reducers';
import LabelSelector from 'components/label-selector/label-selector';
import { changeHideActiveObjectAsync, rememberObject, updateCanvasBrushTools } from 'actions/annotation-actions';
import { ShortcutScope } from 'utils/enums';
import { shallowEqual } from 'utils/redux';
import GlobalHotKeys from 'utils/mousetrap-react';
import { subKeyMap } from 'utils/component-subkeymap';
import { registerComponentShortcuts } from 'actions/shortcuts-actions';
import { isTouchLayout } from 'utils/pointer';
import {
    TOUCH_BRUSH_PALETTE_ID, TOUCH_DOCK_EXTRAS_ID,
} from 'components/annotation-page/touch-chrome/constants';
import useDraggable from './draggable-hoc';

const DraggableArea = (
    <div className='cvat-brush-tools-draggable-area'>
        <Icon component={MoveIcon} />
    </div>
);

const componentShortcuts = {
    ACTIVATE_BRUSH_TOOL_STANDARD_CONTROLS: {
        name: 'Brush tool',
        description: 'Activate brush tool on masks drawing toolbox',
        sequences: ['shift+1'],
        scope: ShortcutScope.STANDARD_WORKSPACE_CONTROLS,
        displayWeight: 10,
    },
    ACTIVATE_ERASER_TOOL_STANDARD_CONTROLS: {
        name: 'Eraser tool',
        description: 'Activate eraser tool on masks drawing toolbox',
        sequences: ['shift+2'],
        scope: ShortcutScope.STANDARD_WORKSPACE_CONTROLS,
        displayWeight: 15,
    },
    ACTIVATE_POLYGON_TOOL_STANDARD_CONTROLS: {
        name: 'Polygon tool',
        description: 'Activate polygon tool on masks drawing toolbox',
        sequences: ['shift+3'],
        scope: ShortcutScope.STANDARD_WORKSPACE_CONTROLS,
        displayWeight: 20,
    },
    ACTIVATE_POLYGON_REMOVE_TOOL_STANDARD_CONTROLS: {
        name: 'Polygon remove tool',
        description: 'Activate polygon remove tool on masks drawing toolbox',
        sequences: ['shift+4'],
        scope: ShortcutScope.STANDARD_WORKSPACE_CONTROLS,
        displayWeight: 25,
    },
};
registerComponentShortcuts(componentShortcuts);

const MIN_BRUSH_SIZE = 1;
function BrushTools(): JSX.Element | React.ReactPortal | null {
    const dispatch = useDispatch();
    const {
        defaultLabelID, visible, canvasInstance, labels, activeObjectHidden, keyMap, normalizedKeyMap,
    } = useSelector((state: CombinedState) => ({
        defaultLabelID: state.annotation.drawing.activeLabelID,
        visible: state.annotation.canvas.brushTools.visible,
        canvasInstance: state.annotation.canvas.instance,
        labels: state.annotation.job.labels,
        activeObjectHidden: state.annotation.canvas.activeObjectHidden,
        keyMap: state.shortcuts.keyMap,
        normalizedKeyMap: state.shortcuts.normalizedKeyMap,
    }), shallowEqual);

    const [editableState, setEditableState] = useState<any | null>(null);
    const [currentTool, setCurrentTool] = useState<
        'brush' | 'eraser' | 'fill' | 'polygon-plus' | 'polygon-minus'
    >('brush');
    const [brushForm, setBrushForm] = useState<'circle' | 'square'>('circle');
    const [[top, left], setTopLeft] = useState([0, 0]);
    const [brushSize, setBrushSize] = useState(10);
    const [applicableLabels, setApplicableLabels] = useState<Label[]>([]);

    const [blockedTools, setBlockedTools] = useState<Record<'eraser' | 'polygon-minus', boolean>>({
        eraser: false,
        'polygon-minus': false,
    });

    const setBrushTool = useCallback(() => setCurrentTool('brush'), [setCurrentTool]);
    const setEraserTool = useCallback(() => {
        if (!blockedTools.eraser) {
            setCurrentTool('eraser');
        }
    }, [setCurrentTool, blockedTools.eraser]);
    const setFillTool = useCallback(() => setCurrentTool('fill'), [setCurrentTool]);
    const setPolygonTool = useCallback(() => setCurrentTool('polygon-plus'), [setCurrentTool]);
    const setPolygonRemoveTool = useCallback(() => {
        if (!blockedTools['polygon-minus']) {
            setCurrentTool('polygon-minus');
        }
    }, [setCurrentTool, blockedTools['polygon-minus']]);

    const hideMask = useCallback((hide: boolean) => {
        dispatch(changeHideActiveObjectAsync(hide));
    }, []);

    const handlers: Record<keyof typeof componentShortcuts, (event?: KeyboardEvent) => void> = {
        ACTIVATE_BRUSH_TOOL_STANDARD_CONTROLS: setBrushTool,
        ACTIVATE_ERASER_TOOL_STANDARD_CONTROLS: setEraserTool,
        ACTIVATE_POLYGON_TOOL_STANDARD_CONTROLS: setPolygonTool,
        ACTIVATE_POLYGON_REMOVE_TOOL_STANDARD_CONTROLS: setPolygonRemoveTool,
    };

    const [removeUnderlyingPixels, setRemoveUnderlyingPixels] = useState(false);
    const [touchHost, setTouchHost] = useState<HTMLElement | null>(null);
    const [touchPaletteHost, setTouchPaletteHost] = useState<HTMLElement | null>(null);
    const dragBar = useDraggable(
        (): number[] => {
            const [element] = window.document.getElementsByClassName('cvat-brush-tools-toolbox');
            if (element) {
                const { offsetTop, offsetLeft } = element as HTMLDivElement;
                return [offsetTop, offsetLeft];
            }

            return [0, 0];
        },
        (newTop, newLeft) => setTopLeft([newTop, newLeft]),
        DraggableArea,
    );

    const onBlockUpdated = useCallback((blockedToolsConfiguration: typeof blockedTools) => {
        setBlockedTools(blockedToolsConfiguration);
    }, []);

    getCore().config.removeUnderlyingMaskPixels.onEmptyMaskOccurrence = () => {
        notification.warning({
            message: 'Some objects were deleted',
            description: 'As a result of removing the underlying pixels, some masks became empty and were subsequently deleted.',
            className: 'cvat-empty-masks-notification',
            duration: null,
        });
    };

    useEffect(() => {
        const label = labels.find((_label: any) => _label.id === defaultLabelID);
        if (visible && label && canvasInstance instanceof Canvas) {
            const onUpdateConfiguration = ({ brushTool }: any): void => {
                if (brushTool?.size) {
                    setBrushSize(Math.max(MIN_BRUSH_SIZE, brushTool.size));
                }
            };

            if (canvasInstance.mode() === CanvasMode.DRAW) {
                canvasInstance.draw({
                    enabled: true,
                    shapeType: ShapeType.MASK,
                    crosshair: false,
                    brushTool: {
                        type: currentTool,
                        size: brushSize,
                        form: brushForm,
                        color: label.color as string,
                        onBlockUpdated,
                    },
                    onUpdateConfiguration,
                });
            } else if (canvasInstance.mode() === CanvasMode.EDIT && editableState) {
                canvasInstance.edit({
                    enabled: true,
                    state: editableState,
                    brushTool: {
                        type: currentTool,
                        size: brushSize,
                        form: brushForm,
                        color: label.color as string,
                        onBlockUpdated,
                    },
                    onUpdateConfiguration,
                });
            }
        }
    }, [currentTool, brushSize, brushForm, visible, defaultLabelID, editableState]);

    useEffect(() => {
        getCore().config.removeUnderlyingMaskPixels.enabled = removeUnderlyingPixels;
    }, [removeUnderlyingPixels]);

    useEffect(() => {
        setApplicableLabels(filterApplicableForType(LabelType.MASK, labels));
    }, [labels]);

    useEffect(() => {
        const canvasContainer = window.document.getElementsByClassName('cvat-canvas-container')[0];
        if (canvasContainer) {
            const { offsetTop, offsetLeft } = canvasContainer.parentElement as HTMLElement;
            setTopLeft([offsetTop, offsetLeft]);
        }

        return () => {
            dispatch(updateCanvasBrushTools({ visible: false }));
        };
    }, []);

    useEffect(() => {
        if (isTouchLayout()) {
            setTouchHost(window.document.getElementById(TOUCH_DOCK_EXTRAS_ID));
            setTouchPaletteHost(window.document.getElementById(TOUCH_BRUSH_PALETTE_ID));
        }
    }, [visible]);

    useEffect(() => {
        const resetCurrentTool = (): void => {
            if (['eraser', 'polygon-minus'].includes(currentTool)) {
                setCurrentTool('brush');
            }
        };

        const hideToolset = (): void => {
            if (visible) {
                dispatch(updateCanvasBrushTools({ visible: false }));
            }
        };

        const showToolset = (e: Event): void => {
            const evt = e as CustomEvent;
            if (evt.detail?.state?.shapeType === ShapeType.MASK ||
                (evt.detail?.drawData?.shapeType === ShapeType.MASK && !evt.detail?.drawData?.initialState)) {
                dispatch(updateCanvasBrushTools({ visible: true }));
            }
        };

        const updateEditableState = (e: Event): void => {
            const evt = e as CustomEvent;
            if (evt.type === 'canvas.editstart' && evt.detail?.state?.shapeType === ShapeType.MASK) {
                setEditableState(evt.detail.state);
            } else if (editableState) {
                setEditableState(null);
            }
        };

        if (canvasInstance instanceof Canvas) {
            canvasInstance.html().addEventListener('canvas.drawn', hideToolset);
            canvasInstance.html().addEventListener('canvas.canceled', hideToolset);
            canvasInstance.html().addEventListener('canvas.canceled', updateEditableState);
            canvasInstance.html().addEventListener('canvas.drawstart', resetCurrentTool);
            canvasInstance.html().addEventListener('canvas.drawstart', showToolset);
            canvasInstance.html().addEventListener('canvas.editstart', showToolset);
            canvasInstance.html().addEventListener('canvas.editstart', updateEditableState);
            canvasInstance.html().addEventListener('canvas.edited', updateEditableState);
        }

        return () => {
            if (canvasInstance instanceof Canvas) {
                canvasInstance.html().removeEventListener('canvas.drawn', hideToolset);
                canvasInstance.html().removeEventListener('canvas.canceled', hideToolset);
                canvasInstance.html().removeEventListener('canvas.canceled', updateEditableState);
                canvasInstance.html().removeEventListener('canvas.drawstart', resetCurrentTool);
                canvasInstance.html().removeEventListener('canvas.drawstart', showToolset);
                canvasInstance.html().removeEventListener('canvas.editstart', showToolset);
                canvasInstance.html().removeEventListener('canvas.editstart', updateEditableState);
                canvasInstance.html().removeEventListener('canvas.edited', updateEditableState);
            }
        };
    }, [visible, editableState, currentTool]);

    if (!labels.length) {
        return null;
    }

    const touchLayout = isTouchLayout();
    const portalTarget = touchHost || window.document.body;

    if (touchLayout && (!touchHost || !touchPaletteHost)) {
        return null;
    }

    if (touchLayout && touchHost && touchPaletteHost) {
        return (
            <>
                {ReactDOM.createPortal((
                    <div
                        className='cvat-touch-brush-palette'
                        style={{ display: visible ? '' : 'none' }}
                        aria-label='Mask drawing tools'
                    >
                        <GlobalHotKeys
                            keyMap={subKeyMap(componentShortcuts, keyMap)}
                            handlers={handlers}
                        />
                        <Button
                            type='text'
                            aria-label='Brush'
                            className={['cvat-brush-tools-brush', ...(currentTool === 'brush' ?
                                ['cvat-brush-tools-active-tool'] : [])].join(' ')}
                            icon={<Icon component={BrushIcon} />}
                            onClick={setBrushTool}
                        />
                        <Button
                            type='text'
                            aria-label='Eraser'
                            className={['cvat-brush-tools-eraser', ...(currentTool === 'eraser' ?
                                ['cvat-brush-tools-active-tool'] : [])].join(' ')}
                            icon={<Icon component={EraserIcon} />}
                            onClick={setEraserTool}
                            disabled={blockedTools.eraser}
                        />
                        <Button
                            type='text'
                            aria-label='Fill enclosed area'
                            className={['cvat-brush-tools-fill', ...(currentTool === 'fill' ?
                                ['cvat-brush-tools-active-tool'] : [])].join(' ')}
                            icon={<BgColorsOutlined />}
                            onClick={setFillTool}
                        />
                        {['brush', 'eraser'].includes(currentTool) ? (
                            <div className='cvat-touch-brush-palette-size'>
                                <span
                                    className='cvat-touch-brush-size-preview'
                                    style={{
                                        width: Math.max(8, Math.min(34, brushSize / 3)),
                                        height: Math.max(8, Math.min(34, brushSize / 3)),
                                    }}
                                />
                                <Slider
                                    vertical
                                    min={MIN_BRUSH_SIZE}
                                    max={200}
                                    step={1}
                                    value={brushSize}
                                    onChange={(value: number) => setBrushSize(value)}
                                />
                                <span className='cvat-touch-brush-size-value'>{brushSize}</span>
                            </div>
                        ) : null}
                    </div>
                ), touchPaletteHost)}
                {ReactDOM.createPortal((
                    <div
                        className='cvat-touch-next-action'
                        style={{ display: visible && !editableState ? '' : 'none' }}
                    >
                        <CVATTooltip title={`Next ${normalizedKeyMap.SWITCH_REDRAW_MODE_STANDARD_CONTROLS}`}>
                            <Button
                                type='primary'
                                aria-label='Next annotation'
                                className='cvat-brush-tools-continue'
                                icon={<Icon component={PlusIcon} />}
                                onClick={() => {
                                    if (canvasInstance instanceof Canvas && defaultLabelID) {
                                        canvasInstance.draw({ enabled: false, continue: true });
                                        dispatch(
                                            rememberObject({
                                                activeObjectType: ObjectType.SHAPE,
                                                activeShapeType: ShapeType.MASK,
                                                activeLabelID: defaultLabelID,
                                            }),
                                        );
                                    }
                                }}
                            />
                        </CVATTooltip>
                    </div>
                ), touchHost)}
            </>
        );
    }

    return ReactDOM.createPortal((
        <div
            className={`cvat-brush-tools-toolbox${touchLayout ? ' cvat-brush-tools-toolbox-touch' : ''}`}
            style={touchLayout ? { display: visible ? '' : 'none' } : { top, left, display: visible ? '' : 'none' }}
        >
            <GlobalHotKeys
                keyMap={subKeyMap(componentShortcuts, keyMap)}
                handlers={handlers}
            />
            <CVATTooltip title={`Finish ${normalizedKeyMap.SWITCH_DRAW_MODE_STANDARD_CONTROLS}`}>
                <Button
                    type='text'
                    className='cvat-brush-tools-finish'
                    icon={<Icon component={CheckIcon} />}
                    onClick={() => {
                        if (canvasInstance instanceof Canvas) {
                            if (editableState) {
                                canvasInstance.edit({ enabled: false });
                            } else {
                                canvasInstance.draw({ enabled: false });
                            }
                        }
                    }}
                />
            </CVATTooltip>
            <hr />
            <CVATTooltip title={`Brush tool ${normalizedKeyMap.ACTIVATE_BRUSH_TOOL_STANDARD_CONTROLS}`}>
                <Button
                    type='text'
                    className={['cvat-brush-tools-brush', ...(currentTool === 'brush' ? ['cvat-brush-tools-active-tool'] : [])].join(' ')}
                    icon={<Icon component={BrushIcon} />}
                    onClick={setBrushTool}
                />
            </CVATTooltip>
            <CVATTooltip title={`Eraser tool ${normalizedKeyMap.ACTIVATE_ERASER_TOOL_STANDARD_CONTROLS}`}>
                <Button
                    type='text'
                    className={['cvat-brush-tools-eraser', ...(currentTool === 'eraser' ? ['cvat-brush-tools-active-tool'] : [])].join(' ')}
                    icon={<Icon component={EraserIcon} />}
                    onClick={setEraserTool}
                    disabled={blockedTools.eraser}
                />
            </CVATTooltip>
            {!touchLayout ? (
                <>
                    <CVATTooltip title={`Polygon tool ${normalizedKeyMap.ACTIVATE_POLYGON_TOOL_STANDARD_CONTROLS}`}>
                        <Button
                            type='text'
                            className={['cvat-brush-tools-polygon-plus', ...(currentTool === 'polygon-plus' ? ['cvat-brush-tools-active-tool'] : [])].join(' ')}
                            icon={<Icon component={PolygonPlusIcon} />}
                            onClick={setPolygonTool}
                        />
                    </CVATTooltip>
                    <CVATTooltip
                        title={`Polygon remove tool ${normalizedKeyMap.ACTIVATE_POLYGON_REMOVE_TOOL_STANDARD_CONTROLS}`}
                    >
                        <Button
                            type='text'
                            className={['cvat-brush-tools-polygon-minus', ...(currentTool === 'polygon-minus' ? ['cvat-brush-tools-active-tool'] : [])].join(' ')}
                            icon={<Icon component={PolygonMinusIcon} />}
                            onClick={setPolygonRemoveTool}
                            disabled={blockedTools['polygon-minus']}
                        />
                    </CVATTooltip>
                </>
            ) : null}
            { ['brush', 'eraser'].includes(currentTool) && touchLayout ? (
                <div className='cvat-touch-brush-size-control'>
                    <span
                        className='cvat-touch-brush-size-preview'
                        style={{
                            width: Math.max(8, Math.min(34, brushSize / 3)),
                            height: Math.max(8, Math.min(34, brushSize / 3)),
                        }}
                    />
                    <Slider
                        min={MIN_BRUSH_SIZE}
                        max={200}
                        step={1}
                        value={brushSize}
                        onChange={(value: number) => setBrushSize(value)}
                    />
                    <span className='cvat-touch-brush-size-value'>{brushSize}</span>
                </div>
            ) : null}
            { ['brush', 'eraser'].includes(currentTool) && !touchLayout ? (
                <CVATTooltip title='Brush size [Hold Alt + Right Mouse Click + Drag Left/Right]'>
                    <InputNumber
                        className='cvat-brush-tools-brush-size'
                        value={brushSize}
                        min={MIN_BRUSH_SIZE}
                        onChange={(value: number | null) => {
                            if (typeof value === 'number' && Number.isInteger(value) && value >= MIN_BRUSH_SIZE) {
                                setBrushSize(value);
                            }
                        }}
                    />
                </CVATTooltip>
            ) : null}
            { ['brush', 'eraser'].includes(currentTool) && !touchLayout ? (
                <Select value={brushForm} onChange={(value: 'circle' | 'square') => setBrushForm(value)}>
                    <Select.Option value='circle'>Circle</Select.Option>
                    <Select.Option value='square'>Square</Select.Option>
                </Select>
            ) : null}
            {!touchLayout ? (
                <Button
                    type='text'
                    className={['cvat-brush-tools-underlying-pixels', ...(removeUnderlyingPixels ? ['cvat-brush-tools-active-tool'] : [])].join(' ')}
                    icon={<VerticalAlignBottomOutlined />}
                    onClick={() => setRemoveUnderlyingPixels(!removeUnderlyingPixels)}
                />
            ) : null}
            {!touchLayout ? (
                <CVATTooltip title={`Hide mask ${normalizedKeyMap.SWITCH_HIDDEN}`}>
                    <Button
                        type='text'
                        className={['cvat-brush-tools-hide', ...(activeObjectHidden ? ['cvat-brush-tools-active-tool'] : [])].join(' ')}
                        icon={activeObjectHidden ? <EyeInvisibleFilled /> : <EyeOutlined />}
                        onClick={() => hideMask(!activeObjectHidden)}
                    />
                </CVATTooltip>
            ) : null}
            { !touchLayout && !editableState && !!applicableLabels.length && (
                <LabelSelector
                    labels={applicableLabels}
                    value={defaultLabelID}
                    onChange={({ id: labelID }: { id: number }) => {
                        if (Number.isInteger(labelID)) {
                            dispatch(
                                rememberObject({ activeLabelID: labelID }),
                            );
                        }
                    }}
                />
            )}
            {!editableState && (
                <CVATTooltip title={`Continue ${normalizedKeyMap.SWITCH_REDRAW_MODE_STANDARD_CONTROLS}`}>
                    <Button
                        type={touchLayout ? 'primary' : 'text'}
                        disabled={!!editableState}
                        className='cvat-brush-tools-continue'
                        icon={<Icon component={PlusIcon} />}
                        onClick={() => {
                            if (canvasInstance instanceof Canvas && defaultLabelID) {
                                canvasInstance.draw({ enabled: false, continue: true });

                                dispatch(
                                    rememberObject({
                                        activeObjectType: ObjectType.SHAPE,
                                        activeShapeType: ShapeType.MASK,
                                        activeLabelID: defaultLabelID,
                                    }),
                                );
                            }
                        }}
                    />
                </CVATTooltip>
            )}
            { touchLayout ? null : dragBar }
        </div>

    ), portalTarget);
}

export default React.memo(BrushTools);
