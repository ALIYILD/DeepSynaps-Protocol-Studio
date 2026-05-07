"""Session feature assembly tests for the DeepSynaps Neuro Engine package."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
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
    SessionFeatureAssembler,
    SessionFeatureError,
    SessionFeatures,
    SessionFunctionalFeatures,
    SessionMetadata,
    SessionStructuralFeatures,
)
from deepsynaps.neuro_engine.structural.biomarkers import StructuralBiomarkerBundle
from deepsynaps.neuro_engine.structural.normalization import (
    NormalizedStructuralRecord,
    StructuralNormalizer,
)


def _build_structural_bundle() -> StructuralBiomarkerBundle:
    """Create a minimal structural biomarker bundle for tests."""

    return StructuralBiomarkerBundle(
        subject_id="DS123",
        session_id="V1",
        source_dir=Path("/tmp/fastsurfer/sub-DS123_ses-V1"),
        aseg_metrics=[
            {
                "structure_name": "Left-Hippocampus",
                "metric_name": "volume_mm3",
                "value": 3000.0,
                "unit": "mm^3",
                "scope": "subcortical",
                "source_file": "aseg.stats",
                "hemisphere": None,
            }
        ],
        cortical_metrics=[],
        global_metrics={"EstimatedTotalIntraCranialVol": 1_500_000.0},
        generated_at=datetime.now(timezone.utc),
    )


def _build_normalized_records() -> list[NormalizedStructuralRecord]:
    """Create a minimal set of normalized structural records."""

    return [
        NormalizedStructuralRecord(
            subject_id="DS123",
            session_id="V1",
            modality="sMRI",
            scope="subcortical",
            hemisphere=None,
            structure_name="hippocampus",
            metric_name="volume_mm3_per_icv",
            value=2.0,
            unit="mm^3/icv",
            source_metric_name="volume_mm3",
            source_file="aseg.stats",
        )
    ]


def _build_connectivity_bundle() -> ConnectivityBundle:
    """Create a minimal functional connectivity bundle."""

    run = ConnectivityRunResult(
        subject_id="DS123",
        session_id="V1",
        run_id="01",
        task_id="rest",
        space="MNI152NLin2009cAsym",
        atlas_name="toy-atlas",
        atlas_labels=["roi1", "roi2"],
        connectivity_kind="correlation",
        matrix=[[1.0, 0.2], [0.2, 1.0]],
        confounds_strategy="simple",
        n_volumes=120,
        tr=2.0,
        source_bold="bold.nii.gz",
        source_confounds="confounds.tsv",
    )
    return ConnectivityBundle(
        subject_id="DS123",
        session_id="V1",
        atlas_name="toy-atlas",
        connectivity_kind="correlation",
        runs=[run],
        aggregated_matrix=[[1.0, 0.2], [0.2, 1.0]],
        aggregation_method="mean_across_runs",
    )


class _DummyConnectivityExtractor:
    """Minimal connectivity extractor stub for assembler tests."""

    def __init__(self, bundle: ConnectivityBundle | Exception) -> None:
        self.bundle = bundle

    def extract_subject_connectivity(
        self,
        derivatives_root: Path,
        subject_id: str,
        session_id: str | None = None,
        aggregate: bool = True,
    ) -> ConnectivityBundle:
        if isinstance(self.bundle, Exception):
            raise self.bundle
        return self.bundle


def test_session_features_to_dict_is_json_serializable() -> None:
    """Session features should serialize paths and datetimes into JSON-safe values."""

    features = SessionFeatures(
        version="1.0.0",
        subject_id="DS123",
        session_id="V1",
        metadata=SessionMetadata(subject_id="DS123", session_id="V1", age_years=42.0),
        structural=SessionStructuralFeatures(
            subject_id="DS123",
            session_id="V1",
            source_dir=Path("/tmp/fastsurfer/sub-DS123_ses-V1"),
            biomarker_bundle=_build_structural_bundle(),
            normalized_records=_build_normalized_records(),
        ),
        functional=SessionFunctionalFeatures(
            subject_id="DS123",
            session_id="V1",
            derivatives_root=Path("/tmp/fmriprep"),
            connectivity=_build_connectivity_bundle(),
        ),
        created_at=datetime(2026, 5, 7, 10, 0, tzinfo=timezone.utc),
    )

    payload = features.to_dict()

    assert payload["structural"]["source_dir"] == "/tmp/fastsurfer/sub-DS123_ses-V1"
    assert payload["functional"]["derivatives_root"] == "/tmp/fmriprep"
    assert payload["created_at"] == "2026-05-07T10:00:00+00:00"
    json.dumps(payload)


def test_assemble_structural_uses_biomarker_extractor_and_normalizer(monkeypatch, tmp_path: Path) -> None:
    """Structural assembly should return biomarker and normalized structural features."""

    bundle = _build_structural_bundle()
    normalized_records = _build_normalized_records()
    monkeypatch.setattr(
        "deepsynaps.neuro_engine.session.features.FastSurferBiomarkerExtractor.extract",
        lambda self, subject_output_dir, subject_id, session_id=None: bundle,
    )
    normalizer = StructuralNormalizer()
    monkeypatch.setattr(normalizer, "normalize", lambda active_bundle: normalized_records)

    assembler = SessionFeatureAssembler(structural_normalizer=normalizer)
    result = assembler.assemble_structural("DS123", "V1", tmp_path / "fastsurfer")

    assert isinstance(result, SessionStructuralFeatures)
    assert result.biomarker_bundle is bundle
    assert result.normalized_records == normalized_records


def test_assemble_functional_uses_connectivity_extractor(tmp_path: Path) -> None:
    """Functional assembly should return the connectivity bundle from the extractor."""

    connectivity = _build_connectivity_bundle()
    assembler = SessionFeatureAssembler()
    extractor = _DummyConnectivityExtractor(connectivity)

    result = assembler.assemble_functional(
        "DS123",
        "V1",
        tmp_path / "fmriprep",
        extractor,
    )

    assert isinstance(result, SessionFunctionalFeatures)
    assert result.connectivity is connectivity


def test_assemble_session_features_supports_structural_only(monkeypatch, tmp_path: Path) -> None:
    """Session assembly should succeed with structural features only."""

    structural = SessionStructuralFeatures(
        subject_id="DS123",
        session_id="V1",
        source_dir=tmp_path / "fastsurfer",
        biomarker_bundle=_build_structural_bundle(),
        normalized_records=_build_normalized_records(),
    )
    assembler = SessionFeatureAssembler()
    monkeypatch.setattr(assembler, "assemble_structural", lambda *args, **kwargs: structural)

    result = assembler.assemble_session_features(
        "DS123",
        "V1",
        fastsurfer_output_dir=tmp_path / "fastsurfer",
        fmriprep_derivatives_root=None,
    )

    assert result.structural is structural
    assert result.functional is None


def test_assemble_session_features_supports_functional_only(tmp_path: Path) -> None:
    """Session assembly should succeed with functional features only."""

    connectivity = _build_connectivity_bundle()
    extractor = _DummyConnectivityExtractor(connectivity)
    assembler = SessionFeatureAssembler(connectivity_extractor=extractor)

    result = assembler.assemble_session_features(
        "DS123",
        "V1",
        fastsurfer_output_dir=None,
        fmriprep_derivatives_root=tmp_path / "fmriprep",
    )

    assert result.structural is None
    assert result.functional is not None
    assert result.functional.connectivity is connectivity


def test_assemble_session_features_supports_structural_and_functional(monkeypatch, tmp_path: Path) -> None:
    """Session assembly should combine structural and functional features together."""

    structural = SessionStructuralFeatures(
        subject_id="DS123",
        session_id="V1",
        source_dir=tmp_path / "fastsurfer",
        biomarker_bundle=_build_structural_bundle(),
        normalized_records=_build_normalized_records(),
    )
    functional = SessionFunctionalFeatures(
        subject_id="DS123",
        session_id="V1",
        derivatives_root=tmp_path / "fmriprep",
        connectivity=_build_connectivity_bundle(),
    )
    assembler = SessionFeatureAssembler()
    monkeypatch.setattr(assembler, "assemble_structural", lambda *args, **kwargs: structural)
    monkeypatch.setattr(assembler, "assemble_functional", lambda *args, **kwargs: functional)

    result = assembler.assemble_session_features(
        "DS123",
        "V1",
        fastsurfer_output_dir=tmp_path / "fastsurfer",
        fmriprep_derivatives_root=tmp_path / "fmriprep",
        connectivity_extractor=_DummyConnectivityExtractor(_build_connectivity_bundle()),
    )

    assert result.structural is structural
    assert result.functional is functional


def test_assemble_session_features_raises_when_no_inputs_provided() -> None:
    """Assembler should reject empty structural/functional input requests."""

    with pytest.raises(SessionFeatureError):
        SessionFeatureAssembler().assemble_session_features(
            "DS123",
            "V1",
            fastsurfer_output_dir=None,
            fmriprep_derivatives_root=None,
        )


def test_neuroengine_assemble_session_features_delegates(monkeypatch, tmp_path: Path) -> None:
    """NeuroEngine should delegate session assembly and return the assembled object."""

    expected = SessionFeatures(
        version="1.0.0",
        subject_id="DS123",
        session_id="V1",
        metadata=SessionMetadata(subject_id="DS123", session_id="V1"),
        structural=None,
        functional=None,
        created_at=datetime.now(timezone.utc),
    )
    engine = NeuroEngine()
    monkeypatch.setattr(
        "deepsynaps.neuro_engine.SessionFeatureAssembler.assemble_session_features",
        lambda self, subject_id, session_id, **kwargs: expected,
    )

    result = engine.assemble_session_features(
        "DS123",
        "V1",
        fastsurfer_output_dir=tmp_path / "fastsurfer",
    )

    assert result is expected


def test_neuroengine_assemble_session_features_propagates_session_feature_error(
    monkeypatch,
    tmp_path: Path,
) -> None:
    """NeuroEngine should surface session assembler failures as SessionFeatureError."""

    engine = NeuroEngine()

    def _raise_failure(self, subject_id: str, session_id: str | None, **kwargs: object) -> SessionFeatures:
        raise SessionFeatureError("session assembly failed")

    monkeypatch.setattr(
        "deepsynaps.neuro_engine.SessionFeatureAssembler.assemble_session_features",
        _raise_failure,
    )

    with pytest.raises(SessionFeatureError):
        engine.assemble_session_features(
            "DS123",
            "V1",
            fastsurfer_output_dir=tmp_path / "fastsurfer",
        )
