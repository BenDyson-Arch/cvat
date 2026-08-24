// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import { LabelType } from 'cvat-core-wrapper';
import { CombinedState } from 'reducers';

type Label = CombinedState['annotation']['job']['labels'][0];

export interface VisibleShapes {
    rectangle: boolean;
    polygon: boolean;
    polyline: boolean;
    points: boolean;
    ellipse: boolean;
    cuboid: boolean;
    mask: boolean;
    skeleton: boolean;
    tag: boolean;
}

export function visibleShapesFromLabels(labels: Label[]): VisibleShapes {
    const withUnspecifiedType = labels.some((label) => label.type === 'any' && !label.hasParent);
    const visible: VisibleShapes = {
        rectangle: withUnspecifiedType,
        polygon: withUnspecifiedType,
        polyline: withUnspecifiedType,
        points: withUnspecifiedType,
        ellipse: withUnspecifiedType,
        cuboid: withUnspecifiedType,
        mask: withUnspecifiedType,
        tag: withUnspecifiedType,
        skeleton: labels.some((label: Label) => label.type === LabelType.SKELETON),
    };

    labels.forEach((label: Label) => {
        visible.rectangle = visible.rectangle || label.type === LabelType.RECTANGLE;
        visible.polygon = visible.polygon || label.type === LabelType.POLYGON;
        visible.polyline = visible.polyline || label.type === LabelType.POLYLINE;
        visible.points = visible.points || label.type === LabelType.POINTS;
        visible.ellipse = visible.ellipse || label.type === LabelType.ELLIPSE;
        visible.cuboid = visible.cuboid || label.type === LabelType.CUBOID;
        visible.mask = visible.mask || label.type === LabelType.MASK;
        visible.tag = visible.tag || label.type === LabelType.TAG;
    });

    return visible;
}
