// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import { Canvas } from 'cvat-canvas-wrapper';
import { Canvas3d } from 'cvat-canvas3d-wrapper';
import { ActiveControl } from 'reducers';

export function finishDrawAvailable(activeControl: ActiveControl): boolean {
    return [
        ActiveControl.DRAW_POLYGON,
        ActiveControl.DRAW_POLYLINE,
        ActiveControl.DRAW_POINTS,
        ActiveControl.DRAW_RECTANGLE,
        ActiveControl.DRAW_ELLIPSE,
        ActiveControl.DRAW_MASK,
        ActiveControl.DRAW_CUBOID,
        ActiveControl.DRAW_SKELETON,
        ActiveControl.AI_TOOLS,
        ActiveControl.OPENCV_TOOLS,
    ].includes(activeControl);
}

export function finishDraw(canvas: Canvas | Canvas3d, activeControl: ActiveControl): void {
    if (
        [ActiveControl.AI_TOOLS, ActiveControl.OPENCV_TOOLS].includes(activeControl) &&
        canvas instanceof Canvas
    ) {
        canvas.interact({ enabled: false });
        return;
    }

    canvas.draw({ enabled: false });
}
