// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import {
    AnnotationProfile, Label, LabelType, ShapeType,
} from 'cvat-core-wrapper';
import { CombinedState } from 'reducers';

type JobLabel = CombinedState['annotation']['job']['labels'][0];

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

const PROFILE_SHAPES: Record<AnnotationProfile, Partial<Record<keyof VisibleShapes, boolean>>> = {
    [AnnotationProfile.CLASSIFICATION]: { tag: true },
    [AnnotationProfile.OBJECT_DETECTION]: { rectangle: true },
    [AnnotationProfile.INSTANCE_SEGMENTATION]: { polygon: true, mask: true },
    [AnnotationProfile.SEMANTIC_SEGMENTATION]: { mask: true },
    [AnnotationProfile.KEYPOINTS]: { points: true, skeleton: true },
};

export function visibleShapesFromLabels(
    labels: JobLabel[],
    profile: AnnotationProfile | null = null,
): VisibleShapes {
    if (profile) {
        const configured = PROFILE_SHAPES[profile];
        return {
            rectangle: !!configured.rectangle,
            polygon: !!configured.polygon,
            polyline: !!configured.polyline,
            points: !!configured.points,
            ellipse: !!configured.ellipse,
            cuboid: !!configured.cuboid,
            mask: !!configured.mask,
            tag: !!configured.tag,
            skeleton: !!configured.skeleton &&
                labels.some((label: JobLabel) => label.type === LabelType.SKELETON),
        };
    }

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
        skeleton: labels.some((label: JobLabel) => label.type === LabelType.SKELETON),
    };

    labels.forEach((label: JobLabel) => {
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

export function applicableLabelsForShape(
    labels: Label[],
    shapeType: ShapeType,
    profile: AnnotationProfile | null,
): Label[] {
    return labels.filter((label: Label) => {
        if (shapeType === ShapeType.SKELETON) {
            return label.type === LabelType.SKELETON;
        }
        if (profile) {
            return !label.hasParent && label.type !== LabelType.SKELETON;
        }
        return !label.hasParent && ['any', shapeType].includes(label.type as string);
    });
}

export function profileAllowsTracks(
    profile: AnnotationProfile | null,
    shapeType: ShapeType,
): boolean {
    if (!profile) {
        return shapeType !== ShapeType.MASK;
    }
    return (
        profile === AnnotationProfile.OBJECT_DETECTION && shapeType === ShapeType.RECTANGLE
    ) || (
        profile === AnnotationProfile.INSTANCE_SEGMENTATION && shapeType === ShapeType.POLYGON
    ) || (
        profile === AnnotationProfile.KEYPOINTS &&
        [ShapeType.POINTS, ShapeType.SKELETON].includes(shapeType)
    );
}
