"""API-facing presentation helpers for DeepSynaps session feature payloads.

DeepSynaps keeps :class:`SessionFeatures` as the canonical internal object for
assembled imaging sessions. This module adds lightweight presentation views on
top of that object so API consumers can request a compact ``lite`` shape or a
more complete ``full`` shape without re-running extraction logic. Matrix
summaries are especially useful for functional connectivity because they let UI
and orchestration clients inspect a connectivity payload without always pulling
large raw matrices across the API boundary.
"""

from __future__ import annotations

from copy import deepcopy
from dataclasses import asdict, dataclass
from datetime import datetime
import math
from typing import Any

from .features import SessionFeatures


class SessionPresentationError(RuntimeError):
    """Raised when a session feature object cannot be presented safely."""


@dataclass(slots=True)
class ConnectivityMatrixSummary:
    """Compact numeric summary of one connectivity matrix payload."""

    atlas_name: str
    connectivity_kind: str
    n_regions: int
    n_runs: int
    aggregation_method: str | None
    min_value: float | None
    max_value: float | None
    mean_value: float | None
    diagonal_mean: float | None
    upper_triangle_mean: float | None
    upper_triangle_abs_mean: float | None

    def to_dict(self) -> dict[str, Any]:
        """Serialize the summary into JSON-friendly primitives."""

        return asdict(self)


@dataclass(slots=True)
class SessionFeaturesLite:
    """Compact API view for UI cards, lists, and orchestration."""

    version: str
    subject_id: str
    session_id: str | None
    metadata: dict[str, Any]
    structural_summary: dict[str, Any] | None
    functional_summary: dict[str, Any] | None
    created_at: datetime

    def to_dict(self) -> dict[str, Any]:
        """Serialize the lite view into JSON-friendly primitives."""

        return {
            "version": self.version,
            "subject_id": self.subject_id,
            "session_id": self.session_id,
            "metadata": self.metadata,
            "structural_summary": self.structural_summary,
            "functional_summary": self.functional_summary,
            "created_at": self.created_at.isoformat(),
        }


@dataclass(slots=True)
class SessionFeaturesFull:
    """Expanded API view for analytics, protocol engines, and research use."""

    version: str
    subject_id: str
    session_id: str | None
    metadata: dict[str, Any]
    structural: dict[str, Any] | None
    functional: dict[str, Any] | None
    created_at: datetime

    def to_dict(self) -> dict[str, Any]:
        """Serialize the full view into JSON-friendly primitives."""

        return {
            "version": self.version,
            "subject_id": self.subject_id,
            "session_id": self.session_id,
            "metadata": self.metadata,
            "structural": self.structural,
            "functional": self.functional,
            "created_at": self.created_at.isoformat(),
        }


class SessionFeaturePresenter:
    """Project canonical session features into API-friendly presentation views."""

    def summarize_connectivity(
        self,
        session_features: SessionFeatures,
    ) -> ConnectivityMatrixSummary | None:
        """Summarize the most useful connectivity matrix for one session.

        The presenter prefers the aggregated matrix when present. If no
        aggregated matrix is available, it falls back to a single run matrix
        only when there is exactly one run. If there is no usable matrix, the
        method returns ``None`` instead of failing.
        """

        functional = session_features.functional
        if functional is None or functional.connectivity is None:
            return None

        bundle = functional.connectivity
        matrix = bundle.aggregated_matrix
        aggregation_method = bundle.aggregation_method
        if matrix is None:
            if len(bundle.runs) != 1:
                return None
            matrix = bundle.runs[0].matrix
            aggregation_method = None

        normalized_matrix = _validate_square_matrix(matrix)
        flattened = [value for row in normalized_matrix for value in row]
        diagonal = [normalized_matrix[index][index] for index in range(len(normalized_matrix))]
        upper_triangle = [
            normalized_matrix[row_index][col_index]
            for row_index in range(len(normalized_matrix))
            for col_index in range(row_index + 1, len(normalized_matrix))
        ]

        return ConnectivityMatrixSummary(
            atlas_name=bundle.atlas_name,
            connectivity_kind=bundle.connectivity_kind,
            n_regions=len(normalized_matrix),
            n_runs=len(bundle.runs),
            aggregation_method=aggregation_method,
            min_value=min(flattened) if flattened else None,
            max_value=max(flattened) if flattened else None,
            mean_value=_mean(flattened),
            diagonal_mean=_mean(diagonal),
            upper_triangle_mean=_mean(upper_triangle),
            upper_triangle_abs_mean=_mean([abs(value) for value in upper_triangle]),
        )

    def to_lite(self, session_features: SessionFeatures) -> SessionFeaturesLite:
        """Build a compact, stable response view without large raw payloads."""

        metadata = deepcopy(session_features.to_dict()["metadata"])
        structural_summary = self._build_structural_summary(session_features)
        functional_summary = self._build_functional_summary(session_features)
        return SessionFeaturesLite(
            version=session_features.version,
            subject_id=session_features.subject_id,
            session_id=session_features.session_id,
            metadata=metadata,
            structural_summary=structural_summary,
            functional_summary=functional_summary,
            created_at=session_features.created_at,
        )

    def to_full(
        self,
        session_features: SessionFeatures,
        include_raw_matrix: bool = True,
    ) -> SessionFeaturesFull:
        """Build a complete API view while optionally stripping raw matrices."""

        payload = deepcopy(session_features.to_dict())
        functional = payload.get("functional")
        summary = self.summarize_connectivity(session_features)
        if functional is not None:
            functional["connectivity_summary"] = None if summary is None else summary.to_dict()
            connectivity = functional.get("connectivity")
            if connectivity is not None and not include_raw_matrix:
                connectivity["aggregated_matrix"] = None
                for run in connectivity.get("runs", []):
                    if isinstance(run, dict):
                        run.pop("matrix", None)

        return SessionFeaturesFull(
            version=payload["version"],
            subject_id=payload["subject_id"],
            session_id=payload["session_id"],
            metadata=payload["metadata"],
            structural=payload["structural"],
            functional=functional,
            created_at=session_features.created_at,
        )

    def _build_structural_summary(
        self,
        session_features: SessionFeatures,
    ) -> dict[str, Any] | None:
        structural = session_features.structural
        if structural is None:
            return None

        bundle = structural.biomarker_bundle
        estimated_total_intracranial_volume = _pick_first_numeric(
            bundle.global_metrics,
            "EstimatedTotalIntraCranialVol",
            "eTIV",
            "estimated_total_intracranial_volume_mm3",
            "sbTIV",
        )
        hippocampus_ai = _find_normalized_metric(
            structural.normalized_records,
            structure_name="hippocampus",
            metric_name="asymmetry_index_percent",
        )
        frontal_lobe_total = _sum_normalized_metric(
            structural.normalized_records,
            structure_name="frontal_lobe",
            metric_name="lobe_gray_matter_volume_mm3",
        )

        return {
            "normalized_record_count": len(structural.normalized_records),
            "global_metric_count": len(bundle.global_metrics),
            "headlines": {
                "estimated_total_intracranial_volume_mm3": estimated_total_intracranial_volume,
                "hippocampus_asymmetry_index_percent": hippocampus_ai,
                "frontal_lobe_gray_matter_volume_mm3": frontal_lobe_total,
            },
        }

    def _build_functional_summary(
        self,
        session_features: SessionFeatures,
    ) -> dict[str, Any] | None:
        functional = session_features.functional
        if functional is None or functional.connectivity is None:
            return None

        bundle = functional.connectivity
        summary = self.summarize_connectivity(session_features)
        return {
            "atlas_name": bundle.atlas_name,
            "connectivity_kind": bundle.connectivity_kind,
            "n_runs": len(bundle.runs),
            "has_aggregated_matrix": bundle.aggregated_matrix is not None,
            "matrix_summary": None if summary is None else summary.to_dict(),
        }


def _validate_square_matrix(matrix: Any) -> list[list[float]]:
    """Validate and normalize a numeric square matrix."""

    if not isinstance(matrix, list) or not matrix:
        raise SessionPresentationError("Connectivity matrix must be a non-empty 2D list.")
    normalized: list[list[float]] = []
    expected_width: int | None = None
    for row in matrix:
        if not isinstance(row, list) or not row:
            raise SessionPresentationError("Connectivity matrix rows must be non-empty lists.")
        if expected_width is None:
            expected_width = len(row)
        if len(row) != expected_width:
            raise SessionPresentationError("Connectivity matrix rows must all have the same length.")
        normalized_row: list[float] = []
        for value in row:
            try:
                normalized_row.append(float(value))
            except (TypeError, ValueError) as exc:
                raise SessionPresentationError("Connectivity matrix contains non-numeric values.") from exc
        normalized.append(normalized_row)
    if expected_width != len(normalized):
        raise SessionPresentationError("Connectivity matrix must be square.")
    return normalized


def _mean(values: list[float]) -> float | None:
    """Return the mean of a numeric list or ``None`` when empty."""

    return None if not values else sum(values) / len(values)


def _pick_first_numeric(values: dict[str, Any], *keys: str) -> float | int | None:
    """Return the first numeric value found under the provided keys."""

    for key in keys:
        candidate = values.get(key)
        if isinstance(candidate, (int, float)) and not math.isnan(float(candidate)):
            return candidate
    return None


def _find_normalized_metric(
    records: list[Any],
    *,
    structure_name: str,
    metric_name: str,
) -> float | None:
    """Locate the first matching normalized structural metric value."""

    for record in records:
        if record.structure_name == structure_name and record.metric_name == metric_name:
            return float(record.value)
    return None


def _sum_normalized_metric(
    records: list[Any],
    *,
    structure_name: str,
    metric_name: str,
) -> float | None:
    """Sum matching normalized metrics, returning ``None`` when absent."""

    matches = [
        float(record.value)
        for record in records
        if record.structure_name == structure_name and record.metric_name == metric_name
    ]
    return None if not matches else sum(matches)


__all__ = [
    "ConnectivityMatrixSummary",
    "SessionFeaturePresenter",
    "SessionFeaturesFull",
    "SessionFeaturesLite",
    "SessionPresentationError",
]
