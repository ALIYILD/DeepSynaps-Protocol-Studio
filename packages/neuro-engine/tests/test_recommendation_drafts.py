"""Recommendation draft tests for the DeepSynaps Neuro Engine."""

from __future__ import annotations

from datetime import datetime, timezone
import json
from pathlib import Path
import sys

import pytest

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from deepsynaps.neuro_engine import NeuroEngine
from deepsynaps.neuro_engine.session.protocol_evidence import (
    EvidenceCitation,
    EvidenceItem,
    ProtocolEvidenceBundle,
)
from deepsynaps.neuro_engine.session.recommendation_drafts import (
    RecommendationDraftBuilder,
    RecommendationDraftError,
)
from deepsynaps.neuro_engine.storage.service import InMemoryNeuroEngineStorage


def _citation() -> EvidenceCitation:
    """Create a minimal evidence citation for test items."""

    return EvidenceCitation(
        id="TEST_001",
        title="Test Citation",
        source="Test Journal",
        year=2024,
        doi_or_url="https://example.com/test",
    )


def _evidence_item(
    *,
    key: str,
    modality: str,
    condition: str,
    value: float | int | str | None = None,
) -> EvidenceItem:
    """Create a minimal evidence item for draft tests."""

    return EvidenceItem(
        key=key,
        modality=modality,
        condition=condition,
        direction=None,
        value=value,
        unit=None,
        qualitative_strength="moderate",
        rationale="Synthetic rationale",
        citations=[_citation()],
        source_feature_key=key,
        notes=None,
    )


def _bundle(
    condition: str,
    items: list[EvidenceItem],
    missing: list[str] | None = None,
) -> ProtocolEvidenceBundle:
    """Create a synthetic protocol evidence bundle."""

    return ProtocolEvidenceBundle(
        version="1.0.0",
        condition=condition,
        subject_id="DS123",
        session_id="V1",
        items=items,
        missing_feature_keys=[] if missing is None else missing,
        created_at=datetime(2026, 5, 7, 13, 30, tzinfo=timezone.utc),
    )


def test_depression_draft_with_functional_and_structural_evidence_is_moderate() -> None:
    """Depression drafts should reach moderate confidence when two modalities support the option."""

    bundle = _bundle(
        "depression",
        [
            _evidence_item(
                key="functional_dmn_connectivity_abnormality_proxy",
                modality="fMRI",
                condition="depression",
                value=0.31,
            ),
            _evidence_item(
                key="structural_frontal_lobe_features_present",
                modality="sMRI",
                condition="depression",
                value=4,
            ),
        ],
    )

    draft = RecommendationDraftBuilder().build(bundle)

    assert draft.options
    assert draft.required_human_review is True
    assert draft.review_status == "draft"
    assert any(option.confidence_level == "moderate" for option in draft.options)
    assert "evidence_linked" in draft.audit_tags


def test_adhd_draft_populates_missing_information() -> None:
    """ADHD drafts should always surface missing-information checklists."""

    bundle = _bundle(
        "adhd",
        [
            _evidence_item(
                key="frontostriatal_structural_proxy_measured",
                modality="sMRI",
                condition="adhd",
                value=1,
            )
        ],
        missing=["frontostriatal_connectivity_mean"],
    )

    draft = RecommendationDraftBuilder().build(bundle)

    assert draft.options
    assert draft.options[0].missing_information
    assert "frontostriatal_connectivity_mean" in draft.options[0].missing_information


def test_alzheimers_draft_remains_low_confidence() -> None:
    """Alzheimer's drafts should stay conservative and low-confidence in this initial version."""

    bundle = _bundle(
        "alzheimers",
        [
            _evidence_item(
                key="structural_hippocampal_marker_measured",
                modality="sMRI",
                condition="alzheimers",
                value=2.1,
            )
        ],
    )

    draft = RecommendationDraftBuilder().build(bundle)

    assert draft.options
    assert all(option.confidence_level == "low" for option in draft.options)
    assert any("clinician" in flag.lower() for flag in draft.options[0].safety_flags)


def test_unsupported_condition_raises_recommendation_draft_error() -> None:
    """Unsupported conditions should fail clearly."""

    with pytest.raises(RecommendationDraftError):
        RecommendationDraftBuilder().build(_bundle("ocd", []))


def test_recommendation_draft_to_dict_is_json_serializable() -> None:
    """Recommendation drafts should serialize cleanly to JSON-friendly primitives."""

    draft = RecommendationDraftBuilder().build(
        _bundle(
            "depression",
            [
                _evidence_item(
                    key="functional_dmn_connectivity_abnormality_proxy",
                    modality="fMRI",
                    condition="depression",
                    value=0.31,
                )
            ],
        )
    )

    payload = draft.to_dict()

    assert payload["condition"] == "depression"
    assert payload["created_at"].endswith("+00:00")
    json.dumps(payload)


def test_recommendation_draft_storage_round_trip(monkeypatch) -> None:
    """Recommendation drafts should persist and load through configured storage."""

    storage = InMemoryNeuroEngineStorage()
    engine = NeuroEngine(storage=storage)
    evidence_bundle = _bundle(
        "depression",
        [
            _evidence_item(
                key="functional_dmn_connectivity_abnormality_proxy",
                modality="fMRI",
                condition="depression",
                value=0.31,
            )
        ],
    )
    expected = RecommendationDraftBuilder().build(evidence_bundle)

    monkeypatch.setattr(
        "deepsynaps.neuro_engine.RecommendationDraftBuilder.build",
        lambda self, active_bundle: expected,
    )

    built = engine.build_recommendation_draft(evidence_bundle)
    loaded = engine.load_recommendation_draft("DS123", "V1", "depression")

    assert built is expected
    assert loaded is not None
    assert loaded.to_dict() == expected.to_dict()


def test_neuroengine_build_recommendation_draft_for_condition_delegates(monkeypatch) -> None:
    """NeuroEngine should delegate evidence assembly before building the draft."""

    engine = NeuroEngine(storage=None)
    evidence_bundle = _bundle(
        "depression",
        [
            _evidence_item(
                key="functional_dmn_connectivity_abnormality_proxy",
                modality="fMRI",
                condition="depression",
                value=0.31,
            )
        ],
    )
    expected = RecommendationDraftBuilder().build(evidence_bundle)

    monkeypatch.setattr(engine, "build_protocol_evidence_for_condition", lambda *args, **kwargs: evidence_bundle)
    monkeypatch.setattr(
        "deepsynaps.neuro_engine.RecommendationDraftBuilder.build",
        lambda self, active_bundle: expected,
    )

    result = engine.build_recommendation_draft_for_condition("depression", "DS123", "V1")

    assert result is expected


def test_recommendation_draft_route_returns_expected_structure() -> None:
    """The recommendation draft route should return a serialized draft."""

    pytest.importorskip("fastapi")
    from fastapi.testclient import TestClient
    from deepsynaps.neuro_engine.api.routes import create_app

    expected = RecommendationDraftBuilder().build(
        _bundle(
            "depression",
            [
                _evidence_item(
                    key="functional_dmn_connectivity_abnormality_proxy",
                    modality="fMRI",
                    condition="depression",
                    value=0.31,
                ),
                _evidence_item(
                    key="structural_frontal_lobe_features_present",
                    modality="sMRI",
                    condition="depression",
                    value=3,
                ),
            ],
        )
    )

    class _Engine:
        def build_recommendation_draft_for_condition(self, *args, **kwargs):
            return expected

    client = TestClient(create_app(_Engine()))
    response = client.get(
        "/neuro-engine/recommendation-draft",
        params={"subject_id": "DS123", "session_id": "V1", "condition": "depression"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["condition"] == "depression"
    assert payload["required_human_review"] is True
    assert isinstance(payload["options"], list)


def test_stored_recommendation_draft_route_returns_expected_structure() -> None:
    """The stored recommendation draft route should return persisted draft content."""

    pytest.importorskip("fastapi")
    from fastapi.testclient import TestClient
    from deepsynaps.neuro_engine.api.routes import create_app

    expected = RecommendationDraftBuilder().build(
        _bundle(
            "depression",
            [
                _evidence_item(
                    key="functional_dmn_connectivity_abnormality_proxy",
                    modality="fMRI",
                    condition="depression",
                    value=0.31,
                )
            ],
        )
    )

    class _Engine:
        def load_recommendation_draft(self, subject_id, session_id, condition):
            return expected

    client = TestClient(create_app(_Engine()))
    response = client.get(
        "/neuro-engine/recommendation-draft/stored",
        params={"subject_id": "DS123", "session_id": "V1", "condition": "depression"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["condition"] == "depression"
    assert isinstance(payload["audit_tags"], list)
