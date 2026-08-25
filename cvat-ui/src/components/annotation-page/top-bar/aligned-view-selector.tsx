// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Select from 'antd/lib/select';

import { setActiveView } from 'actions/annotation-actions';
import { RelatedImageMode } from 'cvat-core-wrapper';
import { CombinedState } from 'reducers';

export default function AlignedViewSelector(): JSX.Element | null {
    const dispatch = useDispatch();
    const {
        activeViewIndex,
        pendingViewIndex,
        loading,
        filename,
        relatedFilePaths,
        relatedImageMode,
    } = useSelector((state: CombinedState) => ({
        activeViewIndex: state.annotation.player.activeViewIndex,
        pendingViewIndex: state.annotation.player.pendingViewIndex,
        loading: state.annotation.player.activeViewLoading,
        filename: state.annotation.player.frame.filename,
        relatedFilePaths: state.annotation.player.frame.data?.relatedFilePaths || [],
        relatedImageMode: state.annotation.job.instance?.relatedImageMode,
    }));

    if (relatedImageMode !== RelatedImageMode.ALIGNED || !relatedFilePaths.length) {
        return null;
    }

    const options = [
        {
            value: 0,
            label: `Primary: ${filename.split('/').pop()}`,
        },
        ...relatedFilePaths.map((path: string, index: number) => ({
            value: index + 1,
            label: path.split('/').pop() || path,
        })),
    ];
    const pendingLabel = pendingViewIndex === null ?
        undefined : options.find((option) => option.value === pendingViewIndex)?.label;

    return (
        <Select
            className='cvat-aligned-view-selector'
            size='small'
            value={activeViewIndex}
            loading={loading}
            disabled={loading}
            title={loading ? `Loading ${pendingLabel}` : 'Switch aligned image'}
            aria-label={loading ? `Loading ${pendingLabel}` : 'Switch aligned image'}
            onChange={(value: number) => dispatch(setActiveView(value))}
            options={options}
            style={{ minWidth: 180, maxWidth: 240 }}
        />
    );
}
