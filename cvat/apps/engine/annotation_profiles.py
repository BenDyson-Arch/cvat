# Copyright (C) CVAT.ai Corporation
#
# SPDX-License-Identifier: MIT

from dataclasses import dataclass

from . import models


@dataclass(frozen=True)
class AnnotationProfilePolicy:
    allow_tags: bool
    shape_types: frozenset[str]
    track_types: frozenset[str]


ANNOTATION_PROFILE_POLICIES = {
    models.AnnotationProfile.CLASSIFICATION: AnnotationProfilePolicy(
        allow_tags=True,
        shape_types=frozenset(),
        track_types=frozenset(),
    ),
    models.AnnotationProfile.OBJECT_DETECTION: AnnotationProfilePolicy(
        allow_tags=False,
        shape_types=frozenset({models.ShapeType.RECTANGLE}),
        track_types=frozenset({models.ShapeType.RECTANGLE}),
    ),
    models.AnnotationProfile.INSTANCE_SEGMENTATION: AnnotationProfilePolicy(
        allow_tags=False,
        shape_types=frozenset({models.ShapeType.POLYGON, models.ShapeType.MASK}),
        track_types=frozenset({models.ShapeType.POLYGON}),
    ),
    models.AnnotationProfile.SEMANTIC_SEGMENTATION: AnnotationProfilePolicy(
        allow_tags=False,
        shape_types=frozenset({models.ShapeType.MASK}),
        track_types=frozenset(),
    ),
    models.AnnotationProfile.KEYPOINTS: AnnotationProfilePolicy(
        allow_tags=False,
        shape_types=frozenset({models.ShapeType.POINTS, models.ShapeType.SKELETON}),
        track_types=frozenset({models.ShapeType.POINTS, models.ShapeType.SKELETON}),
    ),
}


def validate_annotations_for_profile(*, profile: str | None, annotations) -> None:
    if not profile:
        return

    policy = ANNOTATION_PROFILE_POLICIES[models.AnnotationProfile(profile)]

    if annotations.tags and not policy.allow_tags:
        raise ValueError("tag")
    if annotations.intervals:
        raise ValueError("interval")
    if annotations.shapes and not policy.shape_types:
        raise ValueError("shape")
    if annotations.tracks and not policy.track_types:
        raise ValueError("track")

    for shape in annotations.shapes:
        if shape["type"] not in policy.shape_types:
            raise ValueError(f"shape:{shape['type']}")

    for track in annotations.tracks:
        for shape in track.get("shapes", []):
            if shape["type"] not in policy.track_types:
                raise ValueError(f"track:{shape['type']}")
