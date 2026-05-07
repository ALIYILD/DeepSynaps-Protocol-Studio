"""Session feature presenter and route tests for the Neuro Engine package."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import math
import sys

import pytest

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from deepsynaps.neuro_engine.api.routes import create_app
from deepsynaps.neuro_engine.functional.connectivity import (
    ConnectivityBundle,
    ConnectivityRunResult,
)
from deepsynaps.neuro_engine.session.features import (
    SessionFeatureError,
    SessionFeatures,
    SessionFunctionalFeatures,
    SessionMetadata,
    SessionStructuralFeatures,
)
from deepsynaps.neuro_engine.session.presenters import (
    SessionFeaturePresenter,
    SessionPresentationError,
)
from deepsynaps.neuro_engine.structural.biomarkers import StructuralBiomarkerBundle
from deepsynaps.neuro_engine.structural.normalization import NormalizedStructuralRecord


def _build_structural_bundle() -> StructuralBiomarkerBundle:
    """Create a biomarker bundle with one global metric for presenter tests."""

    return StructuralBiomarkerBundle(
        subject_id="DS123",
        session_id="V1",
        source_dir=Path("/tmp/fastsurfer/sub-DS123_ses-V1"),
        aseg_metrics=[],
        cortical_metrics=[],
        global_metrics={"EstimatedTotalIntraCranialVol": 1_450_000.0},
        generated_at=datetime.now(timezone.utc),
    )


def _build_normalized_records() -> list[NormalizedStructuralRecord]:
    """Create normalized structural records with asymmetry and lobe metrics."""

    return [
        NormalizedStructuralRecord(
            subject_id="DS123",
            session_id="V1",
            modality="sMRI",
            scope="derived",
            hemisphere=None,
            structure_name="hippocampus",
            metric_name="asymmetry_index_percent",
            value=4.2,
            unit="%",
            source_metric_name="volume_mm3",
            source_file="aseg.stats",
        ),
        NormalizedStructuralRecord(
            subject_id="DS123",
            session_id="V1",
            modality="sMRI",
            scope="derived",
            hemisphere="lh",
            structure_name="frontal_lobe",
            metric_name="lobe_gray_matter_volume_mm3",
            value=10234.0,
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
            value=9950.0,
            unit="mm^3",
            source_metric_name="gray_matter_volume_mm3",
            source_file="rh.aparc.DKTatlas.mapped.stats",
        ),
    ]


def _build_connectivity_bundle(
    *,
    aggregated_matrix: list[list[float]] | None = None,
    run_matrices: list[list[list[float]]] | None = None,
) -> ConnectivityBundle:
    """Create a connectivity bundle for presenter tests."""

    matrices = run_matrices or [[[1.0, 0.2], [0.2, 1.0]]]
    runs = [
        ConnectivityRunResult(
            subject_id="DS123",
            session_id="V1",
            run_id=f"{index + 1:02d}",
            task_id="rest",
            space="MNI152NLin2009cAsym",
            atlas_name="toy-atlas",
            atlas_labels=["roi1", "roi2", "roi3"][: len(matrix)],
            connectivity_kind="correlation",
            matrix=matrix,
            confounds_strategy="simple",
            n_volumes=120,
            tr=2.0,
            source_bold=f"run-{index + 1}_bold.nii.gz",
            source_confounds=f"run-{index + 1}_confounds.tsv",
        )
        for index, matrix in enumerate(matrices)
    ]
    return ConnectivityBundle(
        subject_id="DS123",
        session_id="V1",
        atlas_name="toy-atlas",
        connectivity_kind="correlation",
        runs=runs,
        aggregated_matrix=aggregated_matrix,
        aggregation_method="mean_across_runs" if aggregated_matrix is not None else None,
    )


def _build_session_features(
    *,
    connectivity_bundle: ConnectivityBundle | None = None,
) -> SessionFeatures:
    """Create a synthetic session feature object for presenter and route tests."""

    structural = SessionStructuralFeatures(
        subject_id="DS123",
        session_id="V1",
        source_dir=Path("/tmp/fastsurfer/sub-DS123_ses-V1"),
        biomarker_bundle=_build_structural_bundle(),
        normalized_records=_build_normalized_records(),
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
        metadata=SessionMetadata(subject_id="DS123", session_id="V1", age_years=42.0, sex="F"),
        structural=structural,
        functional=functional,
        created_at=datetime(2026, 5, 7, 10, 30, tzinfo=timezone.utc),
    )


def test_connectivity_summary_computes_known_3x3_matrix_stats() -> None:
    """Connectivity summary should compute deterministic matrix statistics."""

    matrix = [
        [1.0, 0.2, -0.4],
        [0.2, 1.0, 0.6],
        [-0.4, 0.6, 1.0],
    ]
    session_features = _build_session_features(
        connectivity_bundle=_build_connectivity_bundle(aggregated_matrix=matrix),
    )

    summary = SessionFeaturePresenter().summarize_connectivity(session_features)

    assert summary is not None
    assert summary.n_regions == 3
    assert summary.n_runs == 1
    assert summary.min_value == -0.4
    assert summary.max_value == 1.0
    assert math.isclose(summary.diagonal_mean or 0.0, 1.0)
    assert math.isclose(summary.upper_triangle_mean or 0.0, (0.2 - 0.4 + 0.6) / 3)
    assert math.isclose(summary.upper_triangle_abs_mean or 0.0, (0.2 + 0.4 + 0.6) / 3)


def test_lite_view_omits_raw_matrices_and_record_arrays() -> None:
    """Lite presentation should expose summaries only, not raw heavy arrays."""

    session_features = _build_session_features(
        connectivity_bundle=_build_connectivity_bundle(
            aggregated_matrix=[[1.0, 0.5], [0.5, 1.0]],
        ),
    )

    lite = SessionFeaturePresenter().to_lite(session_features).to_dict()

    assert "structural" not in lite
    assert "functional" not in lite
    assert lite["structural_summary"]["normalized_record_count"] == 3
    assert lite["functional_summary"]["matrix_summary"]["n_regions"] == 2
    assert "normalized_records" not in lite["structural_summary"]
    assert "biomarker_bundle" not in lite["structural_summary"]
    assert "connectivity" not in lite["functional_summary"]


def test_full_view_includes_structural_and_functional_payloads() -> None:
    """Full presentation should include the canonical structural and functional payloads."""

    session_features = _build_session_features(
        connectivity_bundle=_build_connectivity_bundle(
            aggregated_matrix=[[1.0, 0.5], [0.5, 1.0]],
        ),
    )

    full = SessionFeaturePresenter().to_full(session_features).to_dict()

    assert full["structural"] is not None
    assert full["functional"] is not None
    assert full["functional"]["connectivity"]["aggregated_matrix"] == [[1.0, 0.5], [0.5, 1.0]]
    assert full["functional"]["connectivity"]["runs"][0]["matrix"] == [[1.0, 0.2], [0.2, 1.0]]


def test_full_view_can_strip_raw_matrices_but_keep_metadata() -> None:
    """Full presentation should optionally remove raw matrices while preserving run metadata."""

    session_features = _build_session_features(
        connectivity_bundle=_build_connectivity_bundle(
            aggregated_matrix=[[1.0, 0.5], [0.5, 1.0]],
        ),
    )

    full = SessionFeaturePresenter().to_full(session_features, include_raw_matrix=False).to_dict()

    connectivity = full["functional"]["connectivity"]
    assert connectivity["aggregated_matrix"] is None
    assert "matrix" not in connectivity["runs"][0]
    assert connectivity["runs"][0]["run_id"] == "01"
    assert full["functional"]["connectivity_summary"]["n_regions"] == 2


def test_malformed_matrix_raises_session_presentation_error() -> None:
    """Malformed connectivity matrices should fail with a clear presenter error."""

    bad_bundle = _build_connectivity_bundle(
        aggregated_matrix=[[1.0, 0.2], [0.2]],
    )
    session_features = _build_session_features(connectivity_bundle=bad_bundle)

    with pytest.raises(SessionPresentationError):
        SessionFeaturePresenter().summarize_connectivity(session_features)


def test_route_view_lite_returns_compact_payload(monkeypatch) -> None:
    """The session feature route should expose the lite presenter view."""

    fastapi = pytest.importorskip("fastapi")
    from fastapi.testclient import TestClient

    session_features = _build_session_features(
        connectivity_bundle=_build_connectivity_bundle(
            aggregated_matrix=[[1.0, 0.5], [0.5, 1.0]],
        ),
    )

    class _Engine:
        def assemble_session_features(self, *args, **kwargs) -> SessionFeatures:
            return session_features

    client = TestClient(create_app(_Engine()))
    response = client.post(
        "/neuro-engine/session-features?view=lite",
        json={"subject_id": "DS123", "session_id": "V1"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["subject_id"] == "DS123"
    assert "structural_summary" in payload
    assert "functional_summary" in payload
    assert "structural" not in payload


def test_route_view_full_without_raw_matrix_strips_matrix_payload(monkeypatch) -> None:
    """The session feature route should support full view with stripped matrices."""

    fastapi = pytest.importorskip("fastapi")
    from fastapi.testclient import TestClient

    session_features = _build_session_features(
        connectivity_bundle=_build_connectivity_bundle(
            aggregated_matrix=[[1.0, 0.5], [0.5, 1.0]],
        ),
    )

    class _Engine:
        def assemble_session_features(self, *args, **kwargs) -> SessionFeatures:
            return session_features

    client = TestClient(create_app(_Engine()))
    response = client.post(
        "/neuro-engine/session-features?view=full&include_raw_matrix=false",
        json={"subject_id": "DS123", "session_id": "V1"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["functional"]["connectivity"]["aggregated_matrix"] is None
    assert "matrix" not in payload["functional"]["connectivity"]["runs"][0]
    assert payload["functional"]["connectivity_summary"]["atlas_name"] == "toy-atlas"


def test_route_propagates_session_feature_errors_as_http_400() -> None:
    """The route should return a clear client error when assembly fails."""

    fastapi = pytest.importorskip("fastapi")
    from fastapi.testclient import TestClient

    class _Engine:
        def assemble_session_features(self, *args, **kwargs) -> SessionFeatures:
            raise SessionFeatureError("assembly failed")

    client = TestClient(create_app(_Engine()))
    response = client.post(
        "/neuro-engine/session-features?view=lite",
        json={"subject_id": "DS123"},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "assembly failed"
