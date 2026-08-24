// Copyright (C) 2020-2022 Intel Corporation
// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import './styles.scss';
import React from 'react';
import Layout from 'antd/lib/layout';

import CanvasLayout from 'components/annotation-page/canvas/grid-layout/canvas-layout';
import ControlsSideBarContainer from 'containers/annotation-page/standard-workspace/controls-side-bar/controls-side-bar';
import CanvasContextMenuContainer from 'containers/annotation-page/canvas/canvas-context-menu';
import ObjectsListContainer from 'containers/annotation-page/standard-workspace/objects-side-bar/objects-list';
import ObjectSideBarComponent from 'components/annotation-page/standard-workspace/objects-side-bar/objects-side-bar';
import CanvasPointContextMenuComponent from 'components/annotation-page/canvas/views/canvas2d/canvas-point-context-menu';
import IssueAggregatorComponent from 'components/annotation-page/review/issues-aggregator';
import RemoveConfirmComponent from 'components/annotation-page/standard-workspace/remove-confirm';
import PropagateConfirmComponent from 'components/annotation-page/standard-workspace/propagate-confirm';
import BrushTools from 'components/annotation-page/canvas/views/canvas2d/brush-tools';
import { isTouchLayout } from 'utils/pointer';
import TouchToolDock from 'components/annotation-page/touch-chrome/touch-tool-dock';
import TouchObjectsDrawer from 'components/annotation-page/touch-chrome/touch-objects-drawer';

export default function StandardWorkspaceComponent(): JSX.Element {
    const touchLayout = isTouchLayout();

    return (
        <Layout
            hasSider={!touchLayout}
            className={`cvat-standard-workspace${touchLayout ? ' cvat-standard-workspace-touch' : ''}`}
        >
            <ControlsSideBarContainer hotkeysOnly={touchLayout} />
            <CanvasLayout />
            {touchLayout ? (
                <>
                    <TouchToolDock />
                    <TouchObjectsDrawer objectsList={<ObjectsListContainer />} />
                </>
            ) : (
                <ObjectSideBarComponent objectsList={<ObjectsListContainer />} />
            )}
            <BrushTools />
            <PropagateConfirmComponent />
            <CanvasContextMenuContainer />
            <CanvasPointContextMenuComponent />
            <IssueAggregatorComponent />
            <RemoveConfirmComponent />
        </Layout>
    );
}
