"""Protocol evidence bundle tests for the DeepSynaps Neuro Engine."""

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
    ProtocolEvidenceBuilder,
    ProtocolEvidenceBundle,
)
from deepsynaps.neuro_engine.session.protocol_views import (
    ProtocolFeature,
    ProtocolFeatureView,
)


def _build_protocol_view(condition: str, selected_features: list[ProtocolFeature], missing: list[str] | None = None) -> ProtocolFeatureView:
    """Create a synthetic protocol feature view for evidence tests."""

    return ProtocolFeatureView(
        version="1.0.0",
        condition=condition,
        subject_id="DS123",
        session_id="V1",
        metadata={"subject_id": "DS123", "session_id": "V1", "age_years": 42.0, "sex": "F"},
        selected_features=selected_features,
        missing_features=[] if missing is None else missing,
        created_at=datetime(2026, 5, 7, 12, 0, tzinfo=timezone.utc),
    )


def test_depression_evidence_contains_rationales_and_citations() -> None:
    """Depression evidence should include human-readable rationale and citation metadata."""

    view = _build_protocol_view(
        "depression",
        [
            ProtocolFeature(
                feature_key="frontal_lobe_gray_matter_volume_mm3_lh",
                display_name="Left frontal lobe gray matter volume",
                value=10100.0,
                unit="mm^3",
                source="structural_normalized",
                notes=None,
            ),
            ProtocolFeature(
                feature_key="connectivity_matrix_mean_value",
                display_name="Connectivity matrix mean",
                value=0.21,
                unit=None,
                source="functional_connectivity",
                notes=None,
            ),
            ProtocolFeature(
                feature_key="dmn_within_connectivity_mean",
                display_name="DMN mean connectivity",
                value=0.32,
                unit=None,
                source="functional_connectivity",
                notes=None,
            ),
        ],
    )

    bundle = ProtocolEvidenceBuilder().build(view)

    assert bundle.condition == "depression"
    assert bundle.items
    assert any(item.modality == "fMRI" for item in bundle.items)
    assert any(item.modality == "sMRI" for item in bundle.items)
    for item in bundle.items:
        assert item.rationale
        assert item.citations


def test_adhd_evidence_maps_frontostriatal_proxy_features() -> None:
    """ADHD evidence should represent frontostriatal and frontoparietal proxy features."""

    view = _build_protocol_view(
        "adhd",
        [
            ProtocolFeature(
                feature_key="caudate_asymmetry_index_percent",
                display_name="Caudate asymmetry index",
                value=4.8,
                unit="%",
                source="structural_normalized",
                notes=None,
            ),
            ProtocolFeature(
                feature_key="frontostriatal_connectivity_mean",
                display_name="Frontostriatal connectivity",
                value=0.18,
                unit=None,
                source="functional_connectivity",
                notes=None,
            ),
        ],
        missing=["frontoparietal_connectivity_mean"],
    )

    bundle = ProtocolEvidenceBuilder().build(view)
    keys = {item.key for item in bundle.items}

    assert "frontostriatal_structural_proxy_measured" in keys
    assert "frontostriatal_functional_proxy_measured" in keys
    assert "frontoparietal_connectivity_mean" in bundle.missing_feature_keys


def test_alzheimers_evidence_includes_hippocampal_items_and_missing_keys() -> None:
    """Alzheimer's evidence should capture hippocampal markers and preserve missing data."""

    view = _build_protocol_view(
        "alzheimers",
        [
            ProtocolFeature(
                feature_key="hippocampus_volume_mm3_per_icv_lh",
                display_name="Left hippocampal normalized volume",
                value=2.13,
                unit="mm^3/icv",
                source="structural_normalized",
                notes=None,
            ),
            ProtocolFeature(
                feature_key="hippocampus_asymmetry_index_percent",
                display_name="Hippocampal asymmetry index",
                value=3.2,
                unit="%",
                source="structural_normalized",
                notes=None,
            ),
        ],
        missing=["hippocampus_volume_mm3_per_icv_rh"],
    )

    bundle = ProtocolEvidenceBuilder().build(view)
    keys = {item.key for item in bundle.items}

    assert "structural_hippocampal_marker_measured" in keys
    assert "hippocampus_volume_mm3_per_icv_rh" in bundle.missing_feature_keys


def test_protocol_evidence_bundle_to_dict_is_json_serializable() -> None:
    """Evidence bundle serialization should produce JSON-safe primitives."""

    view = _build_protocol_view(
        "depression",
        [
            ProtocolFeature(
                feature_key="connectivity_matrix_mean_value",
                display_name="Connectivity matrix mean",
                value=0.21,
                unit=None,
                source="functional_connectivity",
                notes=None,
            ),
        ],
    )

    payload = ProtocolEvidenceBuilder().build(view).to_dict()

    assert payload["subject_id"] == "DS123"
    assert isinstance(payload["items"], list)
    assert payload["created_at"].endswith("+00:00")
    json.dumps(payload)


def test_neuroengine_protocol_evidence_helpers_delegate(monkeypatch) -> None:
    """NeuroEngine should delegate protocol evidence creation through its helper methods."""

    engine = NeuroEngine()
    feature_view = _build_protocol_view(
        "depression",
        [
            ProtocolFeature(
                feature_key="connectivity_matrix_mean_value",
                display_name="Connectivity matrix mean",
                value=0.21,
                unit=None,
                source="functional_connectivity",
                notes=None,
            ),
        ],
    )
    expected = ProtocolEvidenceBuilder().build(feature_view)

    monkeypatch.setattr(engine, "build_protocol_feature_view", lambda *args, **kwargs: feature_view)
    monkeypatch.setattr(
        "deepsynaps.neuro_engine.ProtocolEvidenceBuilder.build",
        lambda self, active_feature_view: expected,
    )

    direct = engine.build_protocol_evidence(feature_view)
    delegated = engine.build_protocol_evidence_for_condition("depression", "DS123", "V1")

    assert direct is expected
    assert delegated is expected


def test_protocol_evidence_route_returns_expected_structure() -> None:
    """The protocol evidence route should return a serialized evidence bundle."""

    pytest.importorskip("fastapi")
    from fastapi.testclient import TestClient
    from deepsynaps.neuro_engine.api.routes import create_app

    expected = ProtocolEvidenceBuilder().build(
        _build_protocol_view(
            "depression",
            [
                ProtocolFeature(
                    feature_key="connectivity_matrix_mean_value",
                    display_name="Connectivity matrix mean",
                    value=0.21,
                    unit=None,
                    source="functional_connectivity",
                    notes=None,
                ),
            ],
        )
    )

    class _Engine:
        def build_protocol_evidence_for_condition(self, *args, **kwargs) -> ProtocolEvidenceBundle:
            return expected

    client = TestClient(create_app(_Engine()))
    response = client.get(
        "/neuro-engine/protocol-evidence",
        params={"subject_id": "DS123", "session_id": "V1", "condition": "depression"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["condition"] == "depression"
    assert payload["subject_id"] == "DS123"
    assert isinstance(payload["items"], list)
