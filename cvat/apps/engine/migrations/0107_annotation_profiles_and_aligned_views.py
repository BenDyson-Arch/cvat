# Copyright (C) CVAT.ai Corporation
#
# SPDX-License-Identifier: MIT

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("engine", "0106_add_interval_annotations"),
    ]

    operations = [
        migrations.AddField(
            model_name="project",
            name="annotation_profile",
            field=models.CharField(
                blank=True,
                choices=[
                    ("classification", "CLASSIFICATION"),
                    ("object_detection", "OBJECT_DETECTION"),
                    ("instance_segmentation", "INSTANCE_SEGMENTATION"),
                    ("semantic_segmentation", "SEMANTIC_SEGMENTATION"),
                    ("keypoints", "KEYPOINTS"),
                ],
                default=None,
                max_length=32,
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="project",
            name="related_image_mode",
            field=models.CharField(
                choices=[("contextual", "CONTEXTUAL"), ("aligned", "ALIGNED")],
                default="contextual",
                max_length=16,
            ),
        ),
        migrations.AddField(
            model_name="task",
            name="annotation_profile",
            field=models.CharField(
                blank=True,
                choices=[
                    ("classification", "CLASSIFICATION"),
                    ("object_detection", "OBJECT_DETECTION"),
                    ("instance_segmentation", "INSTANCE_SEGMENTATION"),
                    ("semantic_segmentation", "SEMANTIC_SEGMENTATION"),
                    ("keypoints", "KEYPOINTS"),
                ],
                default=None,
                max_length=32,
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="task",
            name="related_image_mode",
            field=models.CharField(
                choices=[("contextual", "CONTEXTUAL"), ("aligned", "ALIGNED")],
                default="contextual",
                max_length=16,
            ),
        ),
    ]
