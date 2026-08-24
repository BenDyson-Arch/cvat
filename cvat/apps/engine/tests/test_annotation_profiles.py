# Copyright (C) CVAT.ai Corporation
#
# SPDX-License-Identifier: MIT

from types import SimpleNamespace

import pytest

from cvat.apps.engine import models
from cvat.apps.engine.annotation_profiles import validate_annotations_for_profile


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
