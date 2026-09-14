// Copyright (C) CVAT.ai Corporation
// SPDX-License-Identifier: MIT

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Provider, useDispatch, useSelector } from 'react-redux';
import { MemoryRouter, useLocation } from 'react-router-dom';
import notification from 'antd/lib/notification';
import Alert from 'antd/lib/alert';
import Button from 'antd/lib/button';
import { getCVATStore } from 'cvat-store';
import AnnotationPageComponent from 'components/annotation-page/annotation-page';
import SettingsModal from 'components/header/settings-modal/settings-modal';
import { AnnotationActionTypes, changeFrameAsync, closeJob } from 'actions/annotation-actions';
import { resetErrors } from 'actions/notification-actions';
import { SettingsActionTypes } from 'actions/settings-actions';
import { CombinedState, Workspace } from 'reducers';
import { colors } from '../../cvat-core/src/enums';
import { LocalProject } from './project';
import { getLocalJob, LocalJob } from './local-session';

export interface LocalWorkspaceProps {
    project: LocalProject;
    onChange(project: LocalProject): void;
    onClose(): void;
    onError(error: unknown): void;
}

function LocalAnnotationPage({
    job,
    onClose,
}: {
    job: LocalJob;
    onClose(): void;
}): JSX.Element {
    const dispatch = useDispatch();
    const annotation = useSelector((state: CombinedState) => state.annotation);
    const settingsVisible = useSelector((state: CombinedState) => state.settings.showDialog);
    const errors = useSelector((state: CombinedState) => state.notifications.errors);
    const [initializationError, setInitializationError] = useState('');
    const location = useLocation();

    useEffect(() => {
        if (location.pathname !== `/tasks/${job.taskId}/jobs/${job.id}`) onClose();
    }, [location.pathname, job, onClose]);

    useEffect(() => {
        const values = Object.values(errors).flatMap((group) => Object.values(group)).filter(Boolean);
        values.forEach((error) => {
            if (!error.ignore) notification.error({
                message: error.message, description: error.reason?.message || String(error.reason), duration: null,
            });
        });
        if (values.length) dispatch(resetErrors());
    }, [errors, dispatch]);

    useEffect(() => {
        let cancelled = false;
        const initialize = async (): Promise<void> => {
            try {
                const frameData = await job.frames.get(0);
                const states = await job.annotations.get(0, false, []);
                const history = await job.actions.get();
                if (cancelled) return;

                dispatch({
                    type: AnnotationActionTypes.GET_JOB_SUCCESS,
                    payload: {
                        openTime: Date.now(),
                        job,
                        frameNumbers: [0],
                        jobMeta: job.meta,
                        queryParameters: {
                            initialOpenGuide: false,
                            defaultLabel: job.labels[0]?.name || null,
                            defaultPointsCount: null,
                            initialWorkspace: Workspace.STANDARD,
                        },
                        groundTruthInstance: null,
                        groundTruthJobFramesMeta: null,
                        validationLayout: null,
                        issues: [],
                        conflicts: [],
                        frameNumber: 0,
                        frameFilename: frameData.filename,
                        relatedFiles: frameData.relatedFiles,
                        frameData,
                        colors,
                        filters: [],
                    },
                });
                dispatch({
                    type: AnnotationActionTypes.FETCH_ANNOTATIONS_SUCCESS,
                    payload: { states, intervals: [], history },
                });
            } catch (error) {
                if (!cancelled) setInitializationError(error instanceof Error ? error.message : String(error));
            }
        };
        dispatch({ type: AnnotationActionTypes.GET_JOB, payload: { requestedId: job.id } });
        void initialize();
        return () => { cancelled = true; };
    }, [dispatch, job]);

    if (initializationError) return <Alert type='error' message={initializationError} action={<Button onClick={onClose}>Projects</Button>} />;

    return (
        <>
            <AnnotationPageComponent
                job={annotation.job.instance}
                fetching={annotation.job.fetching}
                annotationsInitialized={annotation.annotations.initialized}
                frameNumber={annotation.player.frame.number}
                workspace={annotation.workspace}
                getJob={() => undefined}
                saveLogs={() => undefined}
                closeJob={() => {
                    dispatch(closeJob());
                }}
                changeFrame={(frame) => dispatch(changeFrameAsync(frame))}
            />
            <SettingsModal
                visible={settingsVisible}
                onClose={() => dispatch({
                    type: SettingsActionTypes.SWITCH_SETTINGS_DIALOG,
                    payload: { visible: false },
                })}
            />
        </>
    );
}

export default function LocalWorkspace(props: LocalWorkspaceProps): JSX.Element {
    const { project, onChange, onClose } = props;
    const changeRef = useRef(onChange);
    changeRef.current = onChange;
    const job = useMemo(() => getLocalJob(project, (updated) => changeRef.current(updated)), [project.id]);
    const store = useMemo(() => getCVATStore(), []);

    return (
        <Provider store={store}>
            <MemoryRouter initialEntries={[`/tasks/${job.taskId}/jobs/${job.id}`]}>
                <LocalAnnotationPage job={job} onClose={onClose} />
            </MemoryRouter>
        </Provider>
    );
}
