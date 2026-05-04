"""Sanity tests for the curated atlas — these run on the slim base image."""

from __future__ import annotations

from deepsynaps_video import constants


def test_task_atlas_has_dois() -> None:
    for task_id, definition in constants.TASK_ATLAS.items():
        assert definition.task_id == task_id
        assert definition.method_reference_dois, (
            f"{task_id} must cite at least one DOI"
        )


def test_movement_biomarkers_link_to_tasks() -> None:
    known_task_ids = set(constants.TASK_ATLAS)
    for biomarker_id, biomarker in constants.MOVEMENT_BIOMARKERS.items():
        assert biomarker.biomarker_id == biomarker_id
        for task_id in biomarker.related_task_ids:
            assert task_id in known_task_ids, (
                f"{biomarker_id} references unknown task {task_id}"
            )


def test_monitoring_events_have_descriptions() -> None:
    for event_id, event in constants.MONITORING_EVENTS.items():
        assert event.event_id == event_id
        assert event.description, f"{event_id} missing description"


def test_pose_backends_are_consistent() -> None:
    for backend_id, spec in constants.POSE_BACKENDS.items():
        assert spec.backend_id == backend_id
        assert spec.output_dim in (2, 3)
