"""Tests that Brain Map Planner ``full_artifact`` preserves neuroimaging provenance.

The Brain Map Planner stores its full artifact JSON in
``BrainMapPlanCreate.full_artifact: dict[str, Any]`` and returns the same
structure on read. Category 4 (neuroimaging) adds two optional keys on
each ``target_candidate``:

- ``neuroimaging_provenance`` — pass-through provenance dict
- ``decision_support_disclaimer`` — verbatim disclaimer string

This file asserts those keys round-trip through the Pydantic schema
unchanged (the schema uses ``dict[str, Any]`` as a catch-all, so this is
also a regression test against anyone tightening the type later).
"""
from __future__ import annotations

import pytest

from app.schemas.brainmap import BrainMapPlanCreate, BrainMapPlanResponse
from app.services.knowledge.neuroimaging_inventory import (
    DECISION_SUPPORT_DISCLAIMER,
)


def _candidate_artifact() -> dict[str, object]:
    return {
        "target_candidates": [
            {
                "region": "DLPFC-L",
                "anchor": "F3",
                "neuroimaging_provenance": {
                    "source_id": "neurosynth",
                    "source_url": "https://neurosynth.org/api/",
                    "lifecycle_state": "healthy",
                    "coordinate": [-42.0, 16.0, 36.0],
                    "atlas": "MNI152",
                },
                "decision_support_disclaimer": DECISION_SUPPORT_DISCLAIMER,
            }
        ]
    }


def test_neuroimaging_provenance_survives_create_schema():
    artifact = _candidate_artifact()
    payload = BrainMapPlanCreate(
        patient_id="patient-cat4-test",
        region="DLPFC-L",
        target_anchor="F3",
        demo_stamp=False,
        full_artifact=artifact,
    )
    assert payload.full_artifact["target_candidates"][0]["neuroimaging_provenance"][
        "source_id"
    ] == "neurosynth"
    assert (
        payload.full_artifact["target_candidates"][0]["decision_support_disclaimer"]
        == DECISION_SUPPORT_DISCLAIMER
    )


def test_neuroimaging_provenance_survives_response_schema():
    """Verify the response schema also passes through the provenance keys."""
    artifact = _candidate_artifact()
    resp = BrainMapPlanResponse(
        id="plan-cat4-1",
        patient_id="patient-cat4-test",
        created_by="clinician-1",
        created_at="2026-05-19T00:00:00Z",
        status="draft",
        demo_stamp=False,
        full_artifact=artifact,
    )
    candidate = resp.full_artifact["target_candidates"][0]
    assert candidate["neuroimaging_provenance"]["coordinate"] == [-42.0, 16.0, 36.0]
    assert candidate["neuroimaging_provenance"]["atlas"] == "MNI152"
    assert candidate["decision_support_disclaimer"] == DECISION_SUPPORT_DISCLAIMER


def test_provenance_dict_is_arbitrary_keyed_passthrough():
    """``full_artifact`` is ``dict[str, Any]`` — unknown keys must pass through."""
    artifact = {
        "target_candidates": [
            {
                "region": "ACC",
                "neuroimaging_provenance": {
                    "source_id": "openneuro",
                    "future_field_not_yet_defined": {"x": 1, "y": [2, 3]},
                },
                "decision_support_disclaimer": DECISION_SUPPORT_DISCLAIMER,
                "unrelated_future_key": "future_value",
            }
        ],
        "some_top_level_future_key": True,
    }
    payload = BrainMapPlanCreate(
        patient_id="patient-cat4-test",
        demo_stamp=False,
        full_artifact=artifact,
    )
    rt = payload.full_artifact
    assert rt["some_top_level_future_key"] is True
    cand = rt["target_candidates"][0]
    assert cand["unrelated_future_key"] == "future_value"
    assert (
        cand["neuroimaging_provenance"]["future_field_not_yet_defined"]["y"] == [2, 3]
    )
