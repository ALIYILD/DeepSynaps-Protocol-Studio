"""Protocol-oriented session feature selection tests for the Neuro Engine."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import json
import sys

import pytest

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from deepsynaps.neuro_engine import NeuroEngine
from deepsynaps.neuro_engine.functional.connectivity import (
    ConnectivityBundle,
    ConnectivityRunResult,
)
from deepsynaps.neuro_engine.session.features import (
    SessionFeatures,
    SessionFunctionalFeatures,
    SessionMetadata,
    SessionStructuralFeatures,
)
from deepsynaps.neuro_engine.session.protocol_views import (
    ProtocolFeatureSelector,
    ProtocolFeatureView,
    ProtocolFeatureViewError,
)
from deepsynaps.neuro_engine.structural.biomarkers import StructuralBiomarkerBundle
from deepsynaps.neuro_engine.structural.normalization import NormalizedStructuralRecord


def _build_structural_bundle() -> StructuralBiomarkerBundle:
    """Create a synthetic biomarker bundle with cortical and hippocampal content."""

    return StructuralBiomarkerBundle(
        subject_id="DS123",
        session_id="V1",
        source_dir=Path("/tmp/fastsurfer/sub-DS123_ses-V1"),
        aseg_metrics=[
            {
                "structure_name": "Left-Hippocampus",
                "metric_name": "volume_mm3",
                "value": 3200.0,
                "unit": "mm^3",
                "scope": "subcortical",
                "source_file": "aseg.stats",
                "hemisphere": None,
            },
            {
                "structure_name": "Right-Hippocampus",
                "metric_name": "volume_mm3",
                "value": 3000.0,
                "unit": "mm^3",
                "scope": "subcortical",
                "source_file": "aseg.stats",
                "hemisphere": None,
            },
        ],
        cortical_metrics=[
            {
                "hemisphere": "lh",
                "structure_name": "caudalanteriorcingulate",
                "metric_name": "mean_thickness_mm",
                "value": 2.55,
                "unit": "mm",
                "scope": "cortical",
                "source_file": "lh.aparc.DKTatlas.mapped.stats",
            },
            {
                "hemisphere": "rh",
                "structure_name": "rostralanteriorcingulate",
                "metric_name": "mean_thickness_mm",
                "value": 2.44,
                "unit": "mm",
                "scope": "cortical",
                "source_file": "rh.aparc.DKTatlas.mapped.stats",
            },
            {
                "hemisphere": "lh",
                "structure_name": "caudalanteriorcingulate",
                "metric_name": "gray_matter_volume_mm3",
                "value": 4200.0,
                "unit": "mm^3",
                "scope": "cortical",
                "source_file": "lh.aparc.DKTatlas.mapped.stats",
            },
            {
                "hemisphere": "rh",
                "structure_name": "rostralanteriorcingulate",
                "metric_name": "gray_matter_volume_mm3",
                "value": 4000.0,
                "unit": "mm^3",
                "scope": "cortical",
                "source_file": "rh.aparc.DKTatlas.mapped.stats",
            },
        ],
        global_metrics={"EstimatedTotalIntraCranialVol": 1_500_000.0},
        generated_at=datetime.now(timezone.utc),
    )


def _build_normalized_records() -> list[NormalizedStructuralRecord]:
    """Create normalized records spanning frontal, temporal, parietal, and asymmetry metrics."""

    return [
        NormalizedStructuralRecord(
            subject_id="DS123",
            session_id="V1",
            modality="sMRI",
            scope="derived",
            hemisphere="lh",
            structure_name="frontal_lobe",
            metric_name="lobe_gray_matter_volume_mm3",
            value=10100.0,
            unit="mm^3",
            source_metric_name="gray_matter_volume_mm3",
            source_file="lh.aparc.DKTatlas.mapped.stats",
        ),
        NormalizedStructuralRecord(
            subject_id="DS123",
            session_id="V1",
            modality="sMRI",
            scope="derived",
            hemisphere="rh",
            structure_name="frontal_lobe",
            metric_name="lobe_gray_matter_volume_mm3",
            value=9800.0,
            unit="mm^3",
            source_metric_name="gray_matter_volume_mm3",
            source_file="rh.aparc.DKTatlas.mapped.stats",
        ),
        NormalizedStructuralRecord(
            subject_id="DS123",
            session_id="V1",
            modality="sMRI",
            scope="derived",
            hemisphere="lh",
            structure_name="frontal_lobe",
            metric_name="lobe_mean_thickness_mm",
            value=2.61,
            unit="mm",
            source_metric_name="mean_thickness_mm",
            source_file="lh.aparc.DKTatlas.mapped.stats",
        ),
        NormalizedStructuralRecord(
            subject_id="DS123",
            session_id="V1",
            modality="sMRI",
            scope="derived",
            hemisphere="rh",
            structure_name="frontal_lobe",
            metric_name="lobe_mean_thickness_mm",
            value=2.49,
            unit="mm",
            source_metric_name="mean_thickness_mm",
            source_file="rh.aparc.DKTatlas.mapped.stats",
        ),
        NormalizedStructuralRecord(
            subject_id="DS123",
            session_id="V1",
            modality="sMRI",
            scope="derived",
            hemisphere="lh",
            structure_name="temporal_lobe",
            metric_name="lobe_gray_matter_volume_mm3",
            value=8600.0,
            unit="mm^3",
            source_metric_name="gray_matter_volume_mm3",
            source_file="lh.aparc.DKTatlas.mapped.stats",
        ),
        NormalizedStructuralRecord(
            subject_id="DS123",
            session_id="V1",
            modality="sMRI",
            scope="derived",
            hemisphere="rh",
            structure_name="temporal_lobe",
            metric_name="lobe_gray_matter_volume_mm3",
            value=8450.0,
            unit="mm^3",
            source_metric_name="gray_matter_volume_mm3",
            source_file="rh.aparc.DKTatlas.mapped.stats",
        ),
        NormalizedStructuralRecord(
            subject_id="DS123",
            session_id="V1",
            modality="sMRI",
            scope="derived",
            hemisphere="lh",
            structure_name="parietal_lobe",
            metric_name="lobe_gray_matter_volume_mm3",
            value=7300.0,
            unit="mm^3",
            source_metric_name="gray_matter_volume_mm3",
            source_file="lh.aparc.DKTatlas.mapped.stats",
        ),
        NormalizedStructuralRecord(
            subject_id="DS123",
            session_id="V1",
            modality="sMRI",
            scope="derived",
            hemisphere="rh",
            structure_name="parietal_lobe",
            metric_name="lobe_gray_matter_volume_mm3",
            value=7100.0,
            unit="mm^3",
            source_metric_name="gray_matter_volume_mm3",
            source_file="rh.aparc.DKTatlas.mapped.stats",
        ),
        NormalizedStructuralRecord(
            subject_id="DS123",
            session_id="V1",
            modality="sMRI",
            scope="subcortical",
            hemisphere=None,
            structure_name="Left-Hippocampus",
            metric_name="volume_mm3_per_icv",
            value=2.13,
            unit="mm^3/icv",
            source_metric_name="volume_mm3",
            source_file="aseg.stats",
        ),
        NormalizedStructuralRecord(
            subject_id="DS123",
            session_id="V1",
            modality="sMRI",
            scope="subcortical",
            hemisphere=None,
            structure_name="Right-Hippocampus",
            metric_name="volume_mm3_per_icv",
            value=2.00,
            unit="mm^3/icv",
            source_metric_name="volume_mm3",
            source_file="aseg.stats",
        ),
        NormalizedStructuralRecord(
            subject_id="DS123",
            session_id="V1",
            modality="sMRI",
            scope="derived",
            hemisphere=None,
            structure_name="hippocampus",
            metric_name="asymmetry_index_percent",
            value=3.2,
            unit="%",
            source_metric_name="volume_mm3",
            source_file="aseg.stats",
        ),
        NormalizedStructuralRecord(
            subject_id="DS123",
            session_id="V1",
            modality="sMRI",
            scope="derived",
            hemisphere=None,
            structure_name="caudate",
            metric_name="asymmetry_index_percent",
            value=4.8,
            unit="%",
            source_metric_name="volume_mm3",
            source_file="aseg.stats",
        ),
        NormalizedStructuralRecord(
            subject_id="DS123",
            session_id="V1",
            modality="sMRI",
            scope="derived",
            hemisphere=None,
            structure_name="thalamus",
            metric_name="asymmetry_index_percent",
            value=2.7,
            unit="%",
            source_metric_name="volume_mm3",
            source_file="aseg.stats",
        ),
    ]


def _build_connectivity_bundle(labels: list[str] | None = None) -> ConnectivityBundle:
    """Create a synthetic connectivity bundle with atlas labels suitable for proxy extraction."""

    atlas_labels = labels or [
        "left_prefrontal",
        "right_prefrontal",
        "posterior_cingulate",
        "precuneus",
        "left_caudate",
        "left_parietal",
        "left_hippocampus",
    ]
    matrix = [
        [1.0, 0.20, 0.35, 0.30, 0.18, 0.25, 0.10],
        [0.20, 1.0, 0.33, 0.29, 0.16, 0.27, 0.11],
        [0.35, 0.33, 1.0, 0.42, 0.08, 0.31, 0.14],
        [0.30, 0.29, 0.42, 1.0, 0.07, 0.36, 0.13],
        [0.18, 0.16, 0.08, 0.07, 1.0, 0.15, 0.09],
        [0.25, 0.27, 0.31, 0.36, 0.15, 1.0, 0.12],
        [0.10, 0.11, 0.14, 0.13, 0.09, 0.12, 1.0],
    ]
    run = ConnectivityRunResult(
        subject_id="DS123",
        session_id="V1",
        run_id="01",
        task_id="rest",
        space="MNI152NLin2009cAsym",
        atlas_name="synthetic-atlas",
        atlas_labels=atlas_labels,
        connectivity_kind="correlation",
        matrix=matrix,
        confounds_strategy="simple",
        n_volumes=160,
        tr=2.0,
        source_bold="bold.nii.gz",
        source_confounds="confounds.tsv",
    )
    return ConnectivityBundle(
        subject_id="DS123",
        session_id="V1",
        atlas_name="synthetic-atlas",
        connectivity_kind="correlation",
        runs=[run],
        aggregated_matrix=matrix,
        aggregation_method="mean_across_runs",
    )


def _build_session_features(
    *,
    normalized_records: list[NormalizedStructuralRecord] | None = None,
    connectivity_bundle: ConnectivityBundle | None = None,
) -> SessionFeatures:
    """Create a canonical session feature object for protocol selector tests."""

    structural = SessionStructuralFeatures(
        subject_id="DS123",
        session_id="V1",
        source_dir=Path("/tmp/fastsurfer/sub-DS123_ses-V1"),
        biomarker_bundle=_build_structural_bundle(),
        normalized_records=_build_normalized_records() if normalized_records is None else normalized_records,
    )
    functional = None
    if connectivity_bundle is not None:
        functional = SessionFunctionalFeatures(
            subject_id="DS123",
            session_id="V1",
            derivatives_root=Path("/tmp/fmriprep"),
            connectivity=connectivity_bundle,
        )
    return SessionFeatures(
        version="1.0.0",
        subject_id="DS123",
        session_id="V1",
        metadata=SessionMetadata(
            subject_id="DS123",
            session_id="V1",
            age_years=42.0,
            sex="F",
            diagnosis="test",
        ),
        structural=structural,
        functional=functional,
        created_at=datetime(2026, 5, 7, 11, 0, tzinfo=timezone.utc),
    )


def _feature_map(view: ProtocolFeatureView) -> dict[str, object]:
    """Map protocol feature keys to their values for concise assertions."""

    return {feature.feature_key: feature.value for feature in view.selected_features}


@pytest.mark.parametrize(
    ("alias", "expected"),
    [
        ("mdd", "depression"),
        ("major_depression", "depression"),
        ("attention_deficit_hyperactivity_disorder", "adhd"),
        ("dementia", "alzheimers"),
    ],
)
def test_condition_alias_routing(alias: str, expected: str) -> None:
    """Selector should normalize supported condition aliases."""

    selector = ProtocolFeatureSelector()
    view = selector.select(_build_session_features(connectivity_bundle=_build_connectivity_bundle()), alias)

    assert view.condition == expected


def test_depression_protocol_view_includes_structural_and_functional_proxies() -> None:
    """Depression selection should surface frontal, cingulate, and connectivity proxies."""

    selector = ProtocolFeatureSelector()
    view = selector.select(
        _build_session_features(connectivity_bundle=_build_connectivity_bundle()),
        "depression",
    )
    features = _feature_map(view)

    assert view.condition == "depression"
    assert features["frontal_lobe_gray_matter_volume_mm3_lh"] == 10100.0
    assert features["cingulate_mean_thickness_mm_lh"] == 2.55
    assert "dmn_within_connectivity_mean" in features
    assert "prefrontal_cingulate_connectivity_mean" in features
    assert features["functional_connectivity_present"] == 1
    assert features["structural_frontal_features_present"] == 1
    json.dumps(view.to_dict())


def test_adhd_protocol_view_handles_missing_partial_features_gracefully() -> None:
    """ADHD selection should preserve partial proxies and record missing feature keys."""

    partial_records = [
        record
        for record in _build_normalized_records()
        if record.structure_name in {"frontal_lobe"} and record.metric_name.startswith("lobe_")
    ]
    connectivity = _build_connectivity_bundle(
        labels=["left_prefrontal", "right_prefrontal", "left_parietal", "precuneus"]
    )
    view = ProtocolFeatureSelector().select(
        _build_session_features(normalized_records=partial_records, connectivity_bundle=connectivity),
        "adhd",
    )
    features = _feature_map(view)

    assert view.condition == "adhd"
    assert features["frontostriatal_structural_features_present"] == 1
    assert features["frontostriatal_functional_features_present"] == 0
    assert "caudate_asymmetry_index_percent" in view.missing_features
    assert "frontostriatal_connectivity_mean" in view.missing_features


def test_alzheimers_protocol_view_includes_hippocampal_markers() -> None:
    """Alzheimer's selection should emphasize hippocampal and lobe-level markers."""

    view = ProtocolFeatureSelector().select(
        _build_session_features(connectivity_bundle=_build_connectivity_bundle()),
        "alzheimers",
    )
    features = _feature_map(view)

    assert view.condition == "alzheimers"
    assert features["hippocampus_volume_mm3_per_icv_lh"] == 2.13
    assert features["hippocampus_volume_mm3_per_icv_rh"] == 2.00
    assert features["hippocampus_asymmetry_index_percent"] == 3.2
    assert features["hippocampal_markers_present"] == 1
    assert features["connectivity_markers_present"] == 1


def test_missing_data_is_recorded_in_missing_features() -> None:
    """Selector should keep going and record requested features that are unavailable."""

    session_features = _build_session_features(connectivity_bundle=None)
    view = ProtocolFeatureSelector().select(session_features, "depression")

    assert "dmn_within_connectivity_mean" in view.missing_features
    assert "prefrontal_cingulate_connectivity_mean" in view.missing_features


def test_unsupported_condition_raises_protocol_feature_view_error() -> None:
    """Unsupported conditions should fail clearly."""

    with pytest.raises(ProtocolFeatureViewError):
        ProtocolFeatureSelector().select(_build_session_features(), "ocd")


def test_neuroengine_build_protocol_feature_view_delegates(monkeypatch) -> None:
    """NeuroEngine should assemble session features and then apply the selector."""

    session_features = _build_session_features(connectivity_bundle=_build_connectivity_bundle())
    expected = ProtocolFeatureSelector().select(session_features, "depression")
    engine = NeuroEngine()

    monkeypatch.setattr(engine, "assemble_session_features", lambda *args, **kwargs: session_features)
    monkeypatch.setattr(
        "deepsynaps.neuro_engine.ProtocolFeatureSelector.select",
        lambda self, active_session_features, condition: expected,
    )

    result = engine.build_protocol_feature_view("depression", "DS123", "V1")

    assert result is expected


def test_protocol_feature_route_returns_expected_shape() -> None:
    """The API route should return a serialized protocol feature view."""

    pytest.importorskip("fastapi")
    from fastapi.testclient import TestClient

    expected = ProtocolFeatureSelector().select(
        _build_session_features(connectivity_bundle=_build_connectivity_bundle()),
        "depression",
    )

    class _Engine:
        def build_protocol_feature_view(self, *args, **kwargs) -> ProtocolFeatureView:
            return expected

    from deepsynaps.neuro_engine.api.routes import create_app

    client = TestClient(create_app(_Engine()))
    response = client.get(
        "/neuro-engine/protocol-features",
        params={"subject_id": "DS123", "session_id": "V1", "condition": "depression"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["condition"] == "depression"
    assert payload["subject_id"] == "DS123"
    assert isinstance(payload["selected_features"], list)
    assert "missing_features" in payload
