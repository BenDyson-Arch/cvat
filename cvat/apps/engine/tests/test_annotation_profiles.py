# Copyright (C) CVAT.ai Corporation
#
# SPDX-License-Identifier: MIT

from types import SimpleNamespace

import pytest

from cvat.apps.engine import models
from cvat.apps.engine.annotation_profiles import validate_annotations_for_profile
from cvat.apps.engine.task import _group_direct_upload_as_aligned_views


@pytest.mark.parametrize(
    ("profile", "tags", "shapes", "tracks"),
    [
        (models.AnnotationProfile.CLASSIFICATION, [{}], [], []),
        (
            models.AnnotationProfile.OBJECT_DETECTION,
            [],
            [{"type": models.ShapeType.RECTANGLE}],
            [{"shapes": [{"type": models.ShapeType.RECTANGLE}]}],
        ),
        (
            models.AnnotationProfile.INSTANCE_SEGMENTATION,
            [],
            [{"type": models.ShapeType.POLYGON}, {"type": models.ShapeType.MASK}],
            [{"shapes": [{"type": models.ShapeType.POLYGON}]}],
        ),
        (
            models.AnnotationProfile.SEMANTIC_SEGMENTATION,
            [],
            [{"type": models.ShapeType.MASK}],
            [],
        ),
        (
            models.AnnotationProfile.KEYPOINTS,
            [],
            [{"type": models.ShapeType.POINTS}, {"type": models.ShapeType.SKELETON}],
            [{"shapes": [{"type": models.ShapeType.POINTS}]}],
        ),
    ],
)
def test_annotation_profile_accepts_compatible_objects(profile, tags, shapes, tracks):
    validate_annotations_for_profile(
        profile=profile,
        annotations=SimpleNamespace(tags=tags, shapes=shapes, tracks=tracks, intervals=[]),
    )


@pytest.mark.parametrize(
    ("profile", "tags", "shapes", "tracks"),
    [
        (models.AnnotationProfile.CLASSIFICATION, [], [{"type": models.ShapeType.RECTANGLE}], []),
        (models.AnnotationProfile.OBJECT_DETECTION, [{}], [], []),
        (
            models.AnnotationProfile.INSTANCE_SEGMENTATION,
            [],
            [{"type": models.ShapeType.RECTANGLE}],
            [],
        ),
        (
            models.AnnotationProfile.SEMANTIC_SEGMENTATION,
            [],
            [],
            [{"shapes": [{"type": models.ShapeType.MASK}]}],
        ),
        (
            models.AnnotationProfile.KEYPOINTS,
            [],
            [{"type": models.ShapeType.POLYGON}],
            [],
        ),
    ],
)
def test_annotation_profile_rejects_incompatible_objects(profile, tags, shapes, tracks):
    with pytest.raises(ValueError):
        validate_annotations_for_profile(
            profile=profile,
            annotations=SimpleNamespace(tags=tags, shapes=shapes, tracks=tracks, intervals=[]),
        )


def test_direct_aligned_upload_uses_first_image_as_primary_view():
    images = [
        models.Image(path="primary.png", frame=0),
        models.Image(path="alternate-a.png", frame=1),
        models.Image(path="alternate-b.png", frame=2),
    ]

    primary_images, related_images = _group_direct_upload_as_aligned_views(images, {})

    assert primary_images == [images[0]]
    assert related_images == {
        "primary.png": ["alternate-a.png", "alternate-b.png"],
    }


def test_existing_related_image_groups_are_not_regrouped():
    images = [
        models.Image(path="frame-a/primary.png", frame=0),
        models.Image(path="frame-b/primary.png", frame=1),
    ]
    existing_related_images = {
        "frame-a/primary.png": ["frame-a/alternate.png"],
        "frame-b/primary.png": ["frame-b/alternate.png"],
    }

    primary_images, related_images = _group_direct_upload_as_aligned_views(
        images, existing_related_images
    )

    assert primary_images == images
    assert related_images == existing_related_images
