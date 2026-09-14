// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React, { useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Button from 'antd/lib/button';
import { EditOutlined } from '@ant-design/icons';

import { Canvas, CanvasMode } from 'cvat-canvas-wrapper';
import { Label, ObjectState, ShapeType } from 'cvat-core-wrapper';
import LabelSelector from 'components/label-selector/label-selector';
import { ActiveControl, CombinedState } from 'reducers';
import {
    saveAnnotationsAsync,
    updateActiveControl,
    updateAnnotationsAsync,
} from 'actions/annotation-actions';
import { filterApplicableLabels } from 'utils/filter-applicable-labels';

export default function TouchObjectControls(): JSX.Element | null {
    const dispatch = useDispatch();
    const {
        activeControl,
        activatedStateID,
        annotations,
        canvasInstance,
        labels,
        isSaving,
    } = useSelector((state: CombinedState) => ({
        activeControl: state.annotation.canvas.activeControl,
        activatedStateID: state.annotation.annotations.activatedStateID,
        annotations: state.annotation.annotations.states,
        canvasInstance: state.annotation.canvas.instance,
        labels: state.annotation.job.labels,
        isSaving: state.annotation.annotations.saving.uploading,
    }));
    const objectState = useMemo(
        () => annotations.find((state: ObjectState) => state.clientID === activatedStateID) || null,
        [activatedStateID, annotations],
    );

    if (
        !objectState ||
        !(canvasInstance instanceof Canvas) ||
        ![ActiveControl.CURSOR, ActiveControl.EDIT].includes(activeControl)
    ) {
        return null;
    }

    const editing = activeControl === ActiveControl.EDIT;
    const applicableLabels = filterApplicableLabels(objectState, labels);
    const canEdit = [ShapeType.POLYGON, ShapeType.MASK].includes(objectState.shapeType) && !objectState.lock;

    const changeLabel = (label: Label): void => {
        objectState.label = label;
        dispatch(updateAnnotationsAsync([objectState])).then(() => dispatch(saveAnnotationsAsync()));
    };

    const toggleEdit = (): void => {
        if (editing) {
            canvasInstance.edit({ enabled: false });
            return;
        }

        if (canvasInstance.mode() !== CanvasMode.IDLE) {
            canvasInstance.cancel();
        }
        dispatch(updateActiveControl(ActiveControl.EDIT));
        canvasInstance.edit({ enabled: true, state: objectState });
    };

    return (
        <div className='cvat-touch-object-controls'>
            <LabelSelector
                className='cvat-touch-object-label-selector'
                popupClassName='cvat-touch-scrollable-select'
                aria-label='Change annotation class'
                labels={applicableLabels}
                value={objectState.label.id}
                disabled={editing || isSaving}
                placement='topLeft'
                listHeight={280}
                showSearch={false}
                onChange={changeLabel}
            />
            {canEdit ? (
                <Button
                    type={editing ? 'primary' : 'text'}
                    className={`cvat-touch-object-edit${editing ? ' cvat-touch-dock-button-active' : ''}`}
                    aria-label={editing ? 'Finish editing annotation' : 'Edit annotation'}
                    icon={<EditOutlined />}
                    disabled={isSaving}
                    onClick={toggleEdit}
                >
                    Edit
                </Button>
            ) : null}
        </div>
    );
}
