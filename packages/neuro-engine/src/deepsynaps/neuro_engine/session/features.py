"""Unified, versioned feature assembly for DeepSynaps imaging sessions.

This module provides a stable representation of a DeepSynaps imaging session.
It combines normalized structural MRI biomarkers, fMRI connectivity features,
and subject/session-level metadata into one JSON-friendly domain object. The
assembled session feature object is intended for higher-level clinical
reasoning, protocol generation, offline analytics, and API/JSON consumers.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import json
import logging
from pathlib import Path
from typing import Any

from ..functional.connectivity import ConnectivityBundle, FunctionalConnectivityExtractor
from ..structural.biomarkers import FastSurferBiomarkerExtractor, StructuralBiomarkerBundle
from ..structural.normalization import NormalizedStructuralRecord, StructuralNormalizer

logger = logging.getLogger(__name__)


class SessionFeatureError(RuntimeError):
    """Raised when session-level feature assembly cannot be completed safely."""


@dataclass(slots=True)
class SessionStructuralFeatures:
    """Structural MRI features assembled for one subject/session."""

    subject_id: str
    session_id: str | None
    source_dir: Path
    biomarker_bundle: StructuralBiomarkerBundle
    normalized_records: list[NormalizedStructuralRecord]

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "SessionStructuralFeatures":
        """Reconstruct structural session features from serialized primitives."""

        biomarker_payload = dict(data["biomarker_bundle"])
        biomarker = StructuralBiomarkerBundle(
            subject_id=biomarker_payload["subject_id"],
            session_id=biomarker_payload.get("session_id"),
            source_dir=Path(biomarker_payload["source_dir"]),
            aseg_metrics=list(biomarker_payload.get("aseg_metrics", [])),
            cortical_metrics=list(biomarker_payload.get("cortical_metrics", [])),
            global_metrics=dict(biomarker_payload.get("global_metrics", {})),
            generated_at=datetime.fromisoformat(biomarker_payload["generated_at"]),
            global_metric_units=dict(biomarker_payload.get("global_metric_units", {})),
        )
        normalized_records = [
            NormalizedStructuralRecord(**record)
            for record in data.get("normalized_records", [])
        ]
        return cls(
            subject_id=data["subject_id"],
            session_id=data.get("session_id"),
            source_dir=Path(data["source_dir"]),
            biomarker_bundle=biomarker,
            normalized_records=normalized_records,
        )


@dataclass(slots=True)
class SessionFunctionalFeatures:
    """Functional MRI features assembled for one subject/session."""

    subject_id: str
    session_id: str | None
    derivatives_root: Path
    connectivity: ConnectivityBundle | None

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "SessionFunctionalFeatures":
        """Reconstruct functional session features from serialized primitives."""

        connectivity_payload = data.get("connectivity")
        connectivity = None
        if connectivity_payload is not None:
            runs = [
                _deserialize_connectivity_run(run_payload)
                for run_payload in connectivity_payload.get("runs", [])
            ]
            connectivity = ConnectivityBundle(
                subject_id=connectivity_payload["subject_id"],
                session_id=connectivity_payload.get("session_id"),
                atlas_name=connectivity_payload["atlas_name"],
                connectivity_kind=connectivity_payload["connectivity_kind"],
                runs=runs,
                aggregated_matrix=connectivity_payload.get("aggregated_matrix"),
                aggregation_method=connectivity_payload.get("aggregation_method"),
            )
        return cls(
            subject_id=data["subject_id"],
            session_id=data.get("session_id"),
            derivatives_root=Path(data["derivatives_root"]),
            connectivity=connectivity,
        )


@dataclass(slots=True)
class SessionMetadata:
    """Subject/session-level metadata attached to an assembled feature set."""

    subject_id: str
    session_id: str | None
    age_years: float | None = None
    sex: str | None = None
    diagnosis: str | None = None
    visit_type: str | None = None
    scanner_site: str | None = None
    notes: str | None = None

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "SessionMetadata":
        """Reconstruct session metadata from serialized primitives."""

        return cls(
            subject_id=data["subject_id"],
            session_id=data.get("session_id"),
            age_years=data.get("age_years"),
            sex=data.get("sex"),
            diagnosis=data.get("diagnosis"),
            visit_type=data.get("visit_type"),
            scanner_site=data.get("scanner_site"),
            notes=data.get("notes"),
        )


@dataclass(slots=True)
class SessionFeatures:
    """Unified, versioned DeepSynaps feature object for one imaging session."""

    version: str
    subject_id: str
    session_id: str | None
    metadata: SessionMetadata
    structural: SessionStructuralFeatures | None
    functional: SessionFunctionalFeatures | None
    created_at: datetime

    def to_dict(self) -> dict[str, Any]:
        """Serialize the session feature object into JSON-friendly primitives."""

        return {
            "version": self.version,
            "subject_id": self.subject_id,
            "session_id": self.session_id,
            "metadata": _serialize_session_metadata(self.metadata),
            "structural": None if self.structural is None else _serialize_structural_features(self.structural),
            "functional": None if self.functional is None else _serialize_functional_features(self.functional),
            "created_at": self.created_at.isoformat(),
        }

    def to_json(self, **json_kwargs: Any) -> str:
        """Serialize the session feature object to a JSON string."""

        return json.dumps(self.to_dict(), **json_kwargs)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "SessionFeatures":
        """Reconstruct a session feature object from serialized primitives."""

        structural_payload = data.get("structural")
        functional_payload = data.get("functional")
        return cls(
            version=data["version"],
            subject_id=data["subject_id"],
            session_id=data.get("session_id"),
            metadata=SessionMetadata.from_dict(data["metadata"]),
            structural=None
            if structural_payload is None
            else SessionStructuralFeatures.from_dict(structural_payload),
            functional=None
            if functional_payload is None
            else SessionFunctionalFeatures.from_dict(functional_payload),
            created_at=datetime.fromisoformat(data["created_at"]),
        )


class SessionFeatureAssembler:
    """Assemble stable session-level feature objects from completed derivatives."""

    def __init__(
        self,
        structural_normalizer: StructuralNormalizer | None = None,
        connectivity_extractor: FunctionalConnectivityExtractor | None = None,
        version: str = "1.0.0",
    ) -> None:
        """Store collaborators used for lightweight post-hoc feature assembly."""

        self.structural_normalizer = structural_normalizer or StructuralNormalizer()
        self.connectivity_extractor = connectivity_extractor
        self.version = version

    def assemble_structural(
        self,
        subject_id: str,
        session_id: str | None,
        fastsurfer_output_dir: Path,
    ) -> SessionStructuralFeatures:
        """Extract and normalize structural MRI features from FastSurfer outputs."""

        try:
            biomarker_bundle = FastSurferBiomarkerExtractor().extract(
                subject_output_dir=Path(fastsurfer_output_dir),
                subject_id=subject_id,
                session_id=session_id,
            )
            normalized_records = self.structural_normalizer.normalize(biomarker_bundle)
        except Exception as exc:  # pragma: no cover - exercised in tests via wrapping behavior.
            raise SessionFeatureError(
                f"Failed to assemble structural session features for sub-{subject_id}: {exc}"
            ) from exc

        return SessionStructuralFeatures(
            subject_id=biomarker_bundle.subject_id,
            session_id=biomarker_bundle.session_id,
            source_dir=Path(fastsurfer_output_dir),
            biomarker_bundle=biomarker_bundle,
            normalized_records=normalized_records,
        )

    def assemble_functional(
        self,
        subject_id: str,
        session_id: str | None,
        fmriprep_derivatives_root: Path,
        connectivity_extractor: FunctionalConnectivityExtractor,
    ) -> SessionFunctionalFeatures:
        """Extract functional connectivity features from fMRIPrep derivatives."""

        try:
            connectivity = connectivity_extractor.extract_subject_connectivity(
                derivatives_root=Path(fmriprep_derivatives_root),
                subject_id=subject_id,
                session_id=session_id,
                aggregate=True,
            )
        except Exception as exc:  # pragma: no cover - exercised in tests via wrapping behavior.
            raise SessionFeatureError(
                f"Failed to assemble functional session features for sub-{subject_id}: {exc}"
            ) from exc

        return SessionFunctionalFeatures(
            subject_id=connectivity.subject_id,
            session_id=connectivity.session_id,
            derivatives_root=Path(fmriprep_derivatives_root),
            connectivity=connectivity,
        )

    def assemble_session_features(
        self,
        subject_id: str,
        session_id: str | None,
        *,
        fastsurfer_output_dir: Path | None,
        fmriprep_derivatives_root: Path | None,
        metadata: SessionMetadata | None = None,
        connectivity_extractor: FunctionalConnectivityExtractor | None = None,
    ) -> SessionFeatures:
        """Assemble structural and/or functional features into one session object."""

        if fastsurfer_output_dir is None and fmriprep_derivatives_root is None:
            raise SessionFeatureError(
                "At least one of fastsurfer_output_dir or fmriprep_derivatives_root must be provided."
            )

        resolved_metadata = metadata or SessionMetadata(
            subject_id=subject_id,
            session_id=session_id,
        )
        structural = None
        functional = None

        if fastsurfer_output_dir is not None:
            structural = self.assemble_structural(
                subject_id=subject_id,
                session_id=session_id,
                fastsurfer_output_dir=Path(fastsurfer_output_dir),
            )

        if fmriprep_derivatives_root is not None:
            active_extractor = connectivity_extractor or self.connectivity_extractor
            if active_extractor is None:
                raise SessionFeatureError(
                    "Functional assembly requires a FunctionalConnectivityExtractor with atlas configuration."
                )
            functional = self.assemble_functional(
                subject_id=subject_id,
                session_id=session_id,
                fmriprep_derivatives_root=Path(fmriprep_derivatives_root),
                connectivity_extractor=active_extractor,
            )

        return SessionFeatures(
            version=self.version,
            subject_id=subject_id,
            session_id=session_id,
            metadata=resolved_metadata,
            structural=structural,
            functional=functional,
            created_at=datetime.now(timezone.utc),
        )


def _serialize_session_metadata(metadata: SessionMetadata) -> dict[str, Any]:
    """Convert session metadata into JSON-friendly primitives."""

    return {
        "subject_id": metadata.subject_id,
        "session_id": metadata.session_id,
        "age_years": metadata.age_years,
        "sex": metadata.sex,
        "diagnosis": metadata.diagnosis,
        "visit_type": metadata.visit_type,
        "scanner_site": metadata.scanner_site,
        "notes": metadata.notes,
    }


def _serialize_normalized_record(record: NormalizedStructuralRecord) -> dict[str, Any]:
    """Convert one normalized structural record into JSON-friendly primitives."""

    return {
        "subject_id": record.subject_id,
        "session_id": record.session_id,
        "modality": record.modality,
        "scope": record.scope,
        "hemisphere": record.hemisphere,
        "structure_name": record.structure_name,
        "metric_name": record.metric_name,
        "value": record.value,
        "unit": record.unit,
        "source_metric_name": record.source_metric_name,
        "source_file": record.source_file,
    }


def _serialize_structural_features(structural: SessionStructuralFeatures) -> dict[str, Any]:
    """Convert structural session features into JSON-friendly primitives."""

    return {
        "subject_id": structural.subject_id,
        "session_id": structural.session_id,
        "source_dir": str(structural.source_dir),
        "biomarker_bundle": structural.biomarker_bundle.to_dict(),
        "normalized_records": [
            _serialize_normalized_record(record) for record in structural.normalized_records
        ],
    }


def _serialize_connectivity_run(run: Any) -> dict[str, Any]:
    """Convert one connectivity run result into JSON-friendly primitives."""

    return {
        "subject_id": run.subject_id,
        "session_id": run.session_id,
        "run_id": run.run_id,
        "task_id": run.task_id,
        "space": run.space,
        "atlas_name": run.atlas_name,
        "atlas_labels": list(run.atlas_labels),
        "connectivity_kind": run.connectivity_kind,
        "matrix": run.matrix,
        "confounds_strategy": run.confounds_strategy,
        "n_volumes": run.n_volumes,
        "tr": run.tr,
        "source_bold": run.source_bold,
        "source_confounds": run.source_confounds,
    }


def _deserialize_connectivity_run(payload: dict[str, Any]) -> Any:
    """Reconstruct one connectivity run result from serialized primitives."""

    from ..functional.connectivity import ConnectivityRunResult

    return ConnectivityRunResult(
        subject_id=payload["subject_id"],
        session_id=payload.get("session_id"),
        run_id=payload.get("run_id"),
        task_id=payload.get("task_id"),
        space=payload["space"],
        atlas_name=payload["atlas_name"],
        atlas_labels=list(payload.get("atlas_labels", [])),
        connectivity_kind=payload["connectivity_kind"],
        matrix=payload["matrix"],
        confounds_strategy=payload["confounds_strategy"],
        n_volumes=payload["n_volumes"],
        tr=payload.get("tr"),
        source_bold=payload["source_bold"],
        source_confounds=payload.get("source_confounds"),
    )


def _serialize_connectivity_bundle(bundle: ConnectivityBundle | None) -> dict[str, Any] | None:
    """Convert a connectivity bundle into JSON-friendly primitives."""

    if bundle is None:
        return None
    return {
        "subject_id": bundle.subject_id,
        "session_id": bundle.session_id,
        "atlas_name": bundle.atlas_name,
        "connectivity_kind": bundle.connectivity_kind,
        "runs": [_serialize_connectivity_run(run) for run in bundle.runs],
        "aggregated_matrix": bundle.aggregated_matrix,
        "aggregation_method": bundle.aggregation_method,
    }


def _serialize_functional_features(functional: SessionFunctionalFeatures) -> dict[str, Any]:
    """Convert functional session features into JSON-friendly primitives."""

    return {
        "subject_id": functional.subject_id,
        "session_id": functional.session_id,
        "derivatives_root": str(functional.derivatives_root),
        "connectivity": _serialize_connectivity_bundle(functional.connectivity),
    }


__all__ = [
    "SessionFeatureAssembler",
    "SessionFeatureError",
    "SessionFeatures",
    "SessionFunctionalFeatures",
    "SessionMetadata",
    "SessionStructuralFeatures",
]
