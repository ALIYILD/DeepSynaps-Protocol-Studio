"""Storage model and service tests for persisted neuro engine artifacts."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import sys

import pytest

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from deepsynaps.neuro_engine import NeuroEngine
from deepsynaps.neuro_engine.functional.connectivity import ConnectivityBundle
from deepsynaps.neuro_engine.session.features import (
    SessionFeatures,
    SessionFunctionalFeatures,
    SessionMetadata,
    SessionStructuralFeatures,
)
from deepsynaps.neuro_engine.session.protocol_evidence import ProtocolEvidenceBundle
from deepsynaps.neuro_engine.session.protocol_views import ProtocolFeature, ProtocolFeatureView
from deepsynaps.neuro_engine.storage.models import (
    StoredProtocolEvidenceBundle,
    StoredProtocolFeatureView,
    StoredSessionFeatures,
)
from deepsynaps.neuro_engine.storage.service import (
    InMemoryNeuroEngineStorage,
    JsonFileNeuroEngineStorage,
)
from deepsynaps.neuro_engine.structural.biomarkers import StructuralBiomarkerBundle


def _build_session_features() -> SessionFeatures:
    """Create a minimal session feature object for storage tests."""

    biomarker_bundle = StructuralBiomarkerBundle(
        subject_id="DS123",
        session_id="V1",
        source_dir=Path("/tmp/fastsurfer"),
        aseg_metrics=[],
        cortical_metrics=[],
        global_metrics={"EstimatedTotalIntraCranialVol": 1_500_000.0},
        generated_at=datetime(2026, 5, 7, 12, 0, tzinfo=timezone.utc),
        global_metric_units={},
    )
    return SessionFeatures(
        version="1.0.0",
        subject_id="DS123",
        session_id="V1",
        metadata=SessionMetadata(subject_id="DS123", session_id="V1", age_years=42.0, sex="F"),
        structural=SessionStructuralFeatures(
            subject_id="DS123",
            session_id="V1",
            source_dir=Path("/tmp/fastsurfer"),
            biomarker_bundle=biomarker_bundle,
            normalized_records=[],
        ),
        functional=SessionFunctionalFeatures(
            subject_id="DS123",
            session_id="V1",
            derivatives_root=Path("/tmp/fmriprep"),
            connectivity=ConnectivityBundle(
                subject_id="DS123",
                session_id="V1",
                atlas_name="toy-atlas",
                connectivity_kind="correlation",
                runs=[],
                aggregated_matrix=None,
                aggregation_method=None,
            ),
        ),
        created_at=datetime(2026, 5, 7, 12, 30, tzinfo=timezone.utc),
    )


def _build_protocol_feature_view() -> ProtocolFeatureView:
    """Create a minimal protocol feature view for storage tests."""

    return ProtocolFeatureView(
        version="1.0.0",
        condition="depression",
        subject_id="DS123",
        session_id="V1",
        metadata={"subject_id": "DS123", "session_id": "V1"},
        selected_features=[
            ProtocolFeature(
                feature_key="connectivity_matrix_mean_value",
                display_name="Connectivity matrix mean",
                value=0.21,
                unit=None,
                source="functional_connectivity",
                notes=None,
            )
        ],
        missing_features=["dmn_within_connectivity_mean"],
        created_at=datetime(2026, 5, 7, 12, 45, tzinfo=timezone.utc),
    )


def _build_protocol_evidence() -> ProtocolEvidenceBundle:
    """Create a minimal protocol evidence bundle for storage tests."""

    feature_view = _build_protocol_feature_view()
    return ProtocolEvidenceBundle(
        version="1.0.0",
        condition="depression",
        subject_id="DS123",
        session_id="V1",
        items=[],
        missing_feature_keys=list(feature_view.missing_features),
        created_at=datetime(2026, 5, 7, 13, 0, tzinfo=timezone.utc),
    )


def test_inmemory_storage_round_trips_all_artifact_types() -> None:
    """In-memory storage should save and load all three artifact families."""

    storage = InMemoryNeuroEngineStorage()
    session = StoredSessionFeatures(
        id="session-1",
        subject_id="DS123",
        session_id="V1",
        session_features_version="1.0.0",
        payload=_build_session_features().to_dict(),
        created_at=datetime.now(timezone.utc),
        updated_at=None,
    )
    view = StoredProtocolFeatureView(
        id="view-1",
        subject_id="DS123",
        session_id="V1",
        condition="depression",
        protocol_feature_view_version="1.0.0",
        payload=_build_protocol_feature_view().to_dict(),
        created_at=datetime.now(timezone.utc),
        updated_at=None,
    )
    evidence = StoredProtocolEvidenceBundle(
        id="evidence-1",
        subject_id="DS123",
        session_id="V1",
        condition="depression",
        protocol_evidence_version="1.0.0",
        payload=_build_protocol_evidence().to_dict(),
        created_at=datetime.now(timezone.utc),
        updated_at=None,
    )

    storage.save_session_features(session)
    storage.save_protocol_feature_view(view)
    storage.save_protocol_evidence(evidence)

    assert storage.get_session_features("DS123", "V1") == session
    assert storage.get_protocol_feature_view("DS123", "V1", "depression") == view
    assert storage.get_protocol_evidence("DS123", "V1", "depression") == evidence


def test_json_file_storage_round_trips_all_artifact_types(tmp_path: Path) -> None:
    """JSON-file storage should write and reload persisted artifact payloads."""

    storage = JsonFileNeuroEngineStorage(tmp_path)
    session = StoredSessionFeatures(
        id="session-1",
        subject_id="DS123",
        session_id="V1",
        session_features_version="1.0.0",
        payload=_build_session_features().to_dict(),
        created_at=datetime.now(timezone.utc),
        updated_at=None,
    )
    view = StoredProtocolFeatureView(
        id="view-1",
        subject_id="DS123",
        session_id="V1",
        condition="depression",
        protocol_feature_view_version="1.0.0",
        payload=_build_protocol_feature_view().to_dict(),
        created_at=datetime.now(timezone.utc),
        updated_at=None,
    )
    evidence = StoredProtocolEvidenceBundle(
        id="evidence-1",
        subject_id="DS123",
        session_id="V1",
        condition="depression",
        protocol_evidence_version="1.0.0",
        payload=_build_protocol_evidence().to_dict(),
        created_at=datetime.now(timezone.utc),
        updated_at=None,
    )

    storage.save_session_features(session)
    storage.save_protocol_feature_view(view)
    storage.save_protocol_evidence(evidence)

    assert storage.get_session_features("DS123", "V1") is not None
    assert storage.get_protocol_feature_view("DS123", "V1", "depression") is not None
    assert storage.get_protocol_evidence("DS123", "V1", "depression") is not None


def test_neuroengine_persists_and_loads_artifacts(monkeypatch, tmp_path: Path) -> None:
    """NeuroEngine should persist generated artifacts and load them back via storage helpers."""

    storage = InMemoryNeuroEngineStorage()
    engine = NeuroEngine(storage=storage)
    session_features = _build_session_features()
    protocol_view = _build_protocol_feature_view()
    protocol_evidence = _build_protocol_evidence()

    monkeypatch.setattr(
        "deepsynaps.neuro_engine.SessionFeatureAssembler.assemble_session_features",
        lambda self, subject_id, session_id, **kwargs: session_features,
    )
    monkeypatch.setattr(
        "deepsynaps.neuro_engine.ProtocolFeatureSelector.select",
        lambda self, active_session_features, condition: protocol_view,
    )
    monkeypatch.setattr(
        "deepsynaps.neuro_engine.ProtocolEvidenceBuilder.build",
        lambda self, feature_view: protocol_evidence,
    )

    built_session = engine.assemble_session_features(
        "DS123",
        "V1",
        fastsurfer_output_dir=tmp_path / "fastsurfer",
    )
    built_view = engine.build_protocol_feature_view(
        "depression",
        "DS123",
        "V1",
        fastsurfer_output_dir=tmp_path / "fastsurfer",
    )
    built_evidence = engine.build_protocol_evidence_for_condition(
        "depression",
        "DS123",
        "V1",
        fastsurfer_output_dir=tmp_path / "fastsurfer",
    )

    assert built_session is session_features
    assert built_view is protocol_view
    assert built_evidence is protocol_evidence

    loaded_session = engine.load_session_features("DS123", "V1")
    loaded_view = engine.load_protocol_feature_view("DS123", "V1", "depression")
    loaded_evidence = engine.load_protocol_evidence("DS123", "V1", "depression")

    assert loaded_session is not None
    assert loaded_view is not None
    assert loaded_evidence is not None
    assert loaded_session.to_dict() == session_features.to_dict()
    assert loaded_view.to_dict() == protocol_view.to_dict()
    assert loaded_evidence.to_dict() == protocol_evidence.to_dict()


def test_load_helpers_return_none_when_storage_missing_or_empty() -> None:
    """Load helpers should degrade gracefully when storage is missing or empty."""

    engine_without_storage = NeuroEngine(storage=None)
    engine_with_storage = NeuroEngine(storage=InMemoryNeuroEngineStorage())

    assert engine_without_storage.load_session_features("DS123", "V1") is None
    assert engine_without_storage.load_protocol_feature_view("DS123", "V1", "depression") is None
    assert engine_without_storage.load_protocol_evidence("DS123", "V1", "depression") is None
    assert engine_with_storage.load_session_features("DS123", "V1") is None
    assert engine_with_storage.load_protocol_feature_view("DS123", "V1", "depression") is None
    assert engine_with_storage.load_protocol_evidence("DS123", "V1", "depression") is None
