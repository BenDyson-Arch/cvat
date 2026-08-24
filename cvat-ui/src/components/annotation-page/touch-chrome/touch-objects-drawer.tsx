// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React, { useEffect, useState } from 'react';
import Drawer from 'antd/lib/drawer';
import Tabs from 'antd/lib/tabs';
import { useSelector } from 'react-redux';

import 'components/annotation-page/standard-workspace/objects-side-bar/styles.scss';
import { CombinedState } from 'reducers';
import { DimensionType } from 'cvat-core-wrapper';
import LabelsList from 'components/annotation-page/standard-workspace/objects-side-bar/labels-list';
import AppearanceBlock from 'components/annotation-page/appearance-block';
import IssuesListComponent from 'components/annotation-page/standard-workspace/objects-side-bar/issues-list';
import { OBJECTS_SIDEBAR_OPEN_Z_LAYER_EVENT } from 'utils/objects-sidebar';
import { useTouchChrome } from './touch-chrome-context';

interface Props {
    objectsList: JSX.Element;
}

export default function TouchObjectsDrawer(props: Props): JSX.Element {
    const { objectsList } = props;
    const { objectsOpen, setObjectsOpen } = useTouchChrome();
    const [activeTab, setActiveTab] = useState('objects');
    const jobInstance = useSelector((state: CombinedState) => state.annotation.job.instance);
    const is2D = jobInstance ? jobInstance.dimension === DimensionType.DIMENSION_2D : true;

    useEffect(() => {
        const onOpenZLayer = (): void => {
            setActiveTab('objects');
            setObjectsOpen(true);
        };
        window.addEventListener(OBJECTS_SIDEBAR_OPEN_Z_LAYER_EVENT, onOpenZLayer);
        return () => window.removeEventListener(OBJECTS_SIDEBAR_OPEN_Z_LAYER_EVENT, onOpenZLayer);
    }, [setObjectsOpen]);

    return (
        <Drawer
            title='Objects'
            placement='right'
            width={Math.min(360, typeof window !== 'undefined' ? window.innerWidth - 24 : 360)}
            open={objectsOpen}
            onClose={() => setObjectsOpen(false)}
            className='cvat-touch-objects-drawer'
        >
            <div className='cvat-objects-sidebar'>
                <div className='cvat-touch-objects-drawer-body'>
                    <Tabs
                        type='card'
                        activeKey={activeTab}
                        onChange={setActiveTab}
                        className='cvat-objects-sidebar-tabs'
                        items={[{
                            key: 'objects',
                            label: 'Objects',
                            children: objectsList,
                        }, {
                            key: 'labels',
                            label: 'Labels',
                            forceRender: true,
                            children: <LabelsList />,
                        }, ...(is2D ? [{ key: 'issues', label: 'Issues', children: <IssuesListComponent /> }] : [])]}
                    />
                    <AppearanceBlock />
                </div>
            </div>
        </Drawer>
    );
}
