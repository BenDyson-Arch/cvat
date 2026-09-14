// Copyright (C) CVAT.ai Corporation
// SPDX-License-Identifier: MIT

export type ShapeType = 'mask' | 'rectangle' | 'polygon' | 'points';

export interface LocalShape {
    id: number;
    type: ShapeType;
    labelID: number;
    points: number[];
    rotation: number;
}

export interface LocalLabel {
    id: number;
    name: string;
    color: string;
}

export interface StackImage {
    id: string;
    name: string;
    width: number;
    height: number;
}

export interface LocalProject {
    version: 1;
    id: string;
    name: string;
    updatedAt: string;
    images: StackImage[];
    labels: LocalLabel[];
    shapes: LocalShape[];
    nextShapeID: number;
}

export function annotationExport(project: LocalProject): object {
    return {
        format: 'cvat-local-aligned-stack',
        version: 1,
        name: project.name,
        updatedAt: project.updatedAt,
        images: project.images.map(({ name, width, height }) => ({ name, width, height })),
        labels: project.labels,
        // All views share frame zero and one image-coordinate annotation layer.
        // Mask points use CVAT's run lengths followed by [left, top, right, bottom].
        annotations: {
            version: 0,
            tags: [],
            tracks: [],
            shapes: project.shapes.map((shape, index) => ({
                type: shape.type,
                frame: 0,
                label_id: shape.labelID,
                points: shape.points,
                rotation: shape.rotation,
                occluded: false,
                outside: false,
                z_order: index,
                source: 'manual',
                attributes: [],
            })),
        },
    };
}
