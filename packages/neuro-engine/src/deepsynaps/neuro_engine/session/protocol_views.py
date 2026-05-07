"""Condition-oriented feature selection for DeepSynaps imaging sessions.

This module converts canonical :class:`SessionFeatures` objects into
condition-specific feature subsets that are easier for downstream protocol and
clinical reasoning components to consume. It does not diagnose disease or
prescribe treatment. The selector is intentionally conservative: when a target
feature cannot be derived from the available structural, functional, or
metadata inputs, it records the missing key instead of inventing a value.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timezone
import json
import logging
from typing import Any, Iterable

from .features import SessionFeatures
from .presenters import SessionFeaturePresenter, SessionPresentationError

logger = logging.getLogger(__name__)


class ProtocolFeatureViewError(RuntimeError):
    """Raised when a protocol-oriented feature view cannot be produced safely."""


@dataclass(slots=True)
class ProtocolFeature:
    """One selected feature exposed to a downstream protocol engine."""

    feature_key: str
    display_name: str
    value: float | int | str | None
    unit: str | None
    source: str
    notes: str | None

    def to_dict(self) -> dict[str, Any]:
        """Serialize the protocol feature into JSON-friendly primitives."""

        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ProtocolFeature":
        """Reconstruct a protocol feature from serialized primitives."""

        return cls(**data)


@dataclass(slots=True)
class ProtocolFeatureView:
    """Condition-specific, versioned feature subset for one session."""

    version: str
    condition: str
    subject_id: str
    session_id: str | None
    metadata: dict[str, Any]
    selected_features: list[ProtocolFeature]
    missing_features: list[str]
    created_at: datetime

    def to_dict(self) -> dict[str, Any]:
        """Serialize the protocol feature view into JSON-friendly primitives."""

        return {
            "version": self.version,
            "condition": self.condition,
            "subject_id": self.subject_id,
            "session_id": self.session_id,
            "metadata": self.metadata,
            "selected_features": [feature.to_dict() for feature in self.selected_features],
            "missing_features": list(self.missing_features),
            "created_at": self.created_at.isoformat(),
        }

    def to_json(self, **json_kwargs: Any) -> str:
        """Serialize the protocol feature view to a JSON string."""

        return json.dumps(self.to_dict(), **json_kwargs)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ProtocolFeatureView":
        """Reconstruct a protocol feature view from serialized primitives."""

        return cls(
            version=data["version"],
            condition=data["condition"],
            subject_id=data["subject_id"],
            session_id=data.get("session_id"),
            metadata=dict(data.get("metadata", {})),
            selected_features=[
                ProtocolFeature.from_dict(feature)
                for feature in data.get("selected_features", [])
            ],
            missing_features=list(data.get("missing_features", [])),
            created_at=datetime.fromisoformat(data["created_at"]),
        )


class ProtocolFeatureSelector:
    """Select conservative condition-oriented feature subsets from session data."""

    _ALIASES = {
        "depression": "depression",
        "mdd": "depression",
        "major_depression": "depression",
        "majordepression": "depression",
        "adhd": "adhd",
        "attention_deficit_hyperactivity_disorder": "adhd",
        "attentiondeficithyperactivitydisorder": "adhd",
        "alzheimers": "alzheimers",
        "alzheimer": "alzheimers",
        "dementia": "alzheimers",
        "ad": "alzheimers",
    }

    def __init__(self, version: str = "1.0.0") -> None:
        """Initialize a deterministic selector version."""

        self.version = version
        self._presenter = SessionFeaturePresenter()

    def select(self, session_features: SessionFeatures, condition: str) -> ProtocolFeatureView:
        """Route one session feature object to a supported condition selector."""

        normalized = condition.strip().lower().replace("-", "_").replace(" ", "_")
        canonical = self._ALIASES.get(normalized)
        if canonical is None:
            raise ProtocolFeatureViewError(f"Unsupported protocol condition: {condition}")
        if canonical == "depression":
            return self._select_depression_features(session_features)
        if canonical == "adhd":
            return self._select_adhd_features(session_features)
        if canonical == "alzheimers":
            return self._select_alzheimers_features(session_features)
        raise ProtocolFeatureViewError(f"Unsupported protocol condition: {condition}")

    def _select_depression_features(self, session_features: SessionFeatures) -> ProtocolFeatureView:
        """Select a pragmatic first-pass depression/TMS-oriented feature set."""

        features: list[ProtocolFeature] = []
        missing: list[str] = []

        self._append_metadata_feature(session_features, features, missing, "age_years", "Age", "years")
        self._append_metadata_feature(session_features, features, missing, "sex", "Sex", None)

        self._append_structural_metric(
            session_features,
            features,
            missing,
            feature_key="frontal_lobe_gray_matter_volume_mm3_lh",
            display_name="Left frontal lobe gray matter volume",
            structure_patterns=["frontal_lobe"],
            metric_name="lobe_gray_matter_volume_mm3",
            hemisphere="lh",
            aggregate="sum",
        )
        self._append_structural_metric(
            session_features,
            features,
            missing,
            feature_key="frontal_lobe_gray_matter_volume_mm3_rh",
            display_name="Right frontal lobe gray matter volume",
            structure_patterns=["frontal_lobe"],
            metric_name="lobe_gray_matter_volume_mm3",
            hemisphere="rh",
            aggregate="sum",
        )
        self._append_structural_metric(
            session_features,
            features,
            missing,
            feature_key="frontal_lobe_mean_thickness_mm_lh",
            display_name="Left frontal lobe mean thickness",
            structure_patterns=["frontal_lobe"],
            metric_name="lobe_mean_thickness_mm",
            hemisphere="lh",
            aggregate="mean",
        )
        self._append_structural_metric(
            session_features,
            features,
            missing,
            feature_key="frontal_lobe_mean_thickness_mm_rh",
            display_name="Right frontal lobe mean thickness",
            structure_patterns=["frontal_lobe"],
            metric_name="lobe_mean_thickness_mm",
            hemisphere="rh",
            aggregate="mean",
        )
        self._append_structural_metric(
            session_features,
            features,
            missing,
            feature_key="cingulate_mean_thickness_mm_lh",
            display_name="Left cingulate mean thickness",
            structure_patterns=["cingulate"],
            metric_name="mean_thickness_mm",
            hemisphere="lh",
            aggregate="mean",
        )
        self._append_structural_metric(
            session_features,
            features,
            missing,
            feature_key="cingulate_mean_thickness_mm_rh",
            display_name="Right cingulate mean thickness",
            structure_patterns=["cingulate"],
            metric_name="mean_thickness_mm",
            hemisphere="rh",
            aggregate="mean",
        )
        self._append_structural_metric(
            session_features,
            features,
            missing,
            feature_key="cingulate_gray_matter_volume_mm3_lh",
            display_name="Left cingulate gray matter volume",
            structure_patterns=["cingulate"],
            metric_name="gray_matter_volume_mm3",
            hemisphere="lh",
            aggregate="sum",
        )
        self._append_structural_metric(
            session_features,
            features,
            missing,
            feature_key="cingulate_gray_matter_volume_mm3_rh",
            display_name="Right cingulate gray matter volume",
            structure_patterns=["cingulate"],
            metric_name="gray_matter_volume_mm3",
            hemisphere="rh",
            aggregate="sum",
        )

        self._append_connectivity_summary(session_features, features, missing)
        self._append_roi_connectivity(
            session_features,
            features,
            missing,
            feature_key="dmn_within_connectivity_mean",
            display_name="Default-mode network mean connectivity",
            left_patterns=["default", "dmn", "precuneus", "posteriorcingulate", "posterior_cingulate", "cingulate", "angular"],
        )
        self._append_roi_connectivity(
            session_features,
            features,
            missing,
            feature_key="prefrontal_cingulate_connectivity_mean",
            display_name="Prefrontal-cingulate coupling",
            left_patterns=["prefrontal", "frontal", "dlpfc"],
            right_patterns=["cingulate", "sgacc", "acc"],
        )

        structural_frontal_present = int(
            any(feature.feature_key.startswith("frontal_lobe_") for feature in features)
        )
        connectivity_present = int(session_features.functional is not None and session_features.functional.connectivity is not None)
        features.append(
            ProtocolFeature(
                feature_key="functional_connectivity_present",
                display_name="Functional connectivity available",
                value=connectivity_present,
                unit=None,
                source="derived",
                notes=None,
            )
        )
        features.append(
            ProtocolFeature(
                feature_key="structural_frontal_features_present",
                display_name="Structural frontal features available",
                value=structural_frontal_present,
                unit=None,
                source="derived",
                notes=None,
            )
        )

        return self._build_view("depression", session_features, features, missing)

    def _select_adhd_features(self, session_features: SessionFeatures) -> ProtocolFeatureView:
        """Select a first-pass ADHD-oriented feature subset."""

        features: list[ProtocolFeature] = []
        missing: list[str] = []

        self._append_metadata_feature(session_features, features, missing, "age_years", "Age", "years")
        self._append_metadata_feature(session_features, features, missing, "sex", "Sex", None)

        self._append_structural_metric(
            session_features,
            features,
            missing,
            feature_key="frontal_lobe_gray_matter_volume_mm3_lh",
            display_name="Left frontal lobe gray matter volume",
            structure_patterns=["frontal_lobe"],
            metric_name="lobe_gray_matter_volume_mm3",
            hemisphere="lh",
            aggregate="sum",
        )
        self._append_structural_metric(
            session_features,
            features,
            missing,
            feature_key="frontal_lobe_gray_matter_volume_mm3_rh",
            display_name="Right frontal lobe gray matter volume",
            structure_patterns=["frontal_lobe"],
            metric_name="lobe_gray_matter_volume_mm3",
            hemisphere="rh",
            aggregate="sum",
        )
        self._append_structural_metric(
            session_features,
            features,
            missing,
            feature_key="frontal_lobe_mean_thickness_mm_lh",
            display_name="Left frontal lobe mean thickness",
            structure_patterns=["frontal_lobe"],
            metric_name="lobe_mean_thickness_mm",
            hemisphere="lh",
            aggregate="mean",
        )
        self._append_structural_metric(
            session_features,
            features,
            missing,
            feature_key="frontal_lobe_mean_thickness_mm_rh",
            display_name="Right frontal lobe mean thickness",
            structure_patterns=["frontal_lobe"],
            metric_name="lobe_mean_thickness_mm",
            hemisphere="rh",
            aggregate="mean",
        )
        self._append_structural_metric(
            session_features,
            features,
            missing,
            feature_key="caudate_asymmetry_index_percent",
            display_name="Caudate asymmetry index",
            structure_patterns=["caudate"],
            metric_name="asymmetry_index_percent",
            aggregate="first",
        )
        self._append_structural_metric(
            session_features,
            features,
            missing,
            feature_key="thalamus_asymmetry_index_percent",
            display_name="Thalamus asymmetry index",
            structure_patterns=["thalamus"],
            metric_name="asymmetry_index_percent",
            aggregate="first",
        )

        self._append_connectivity_summary(session_features, features, missing)
        self._append_roi_connectivity(
            session_features,
            features,
            missing,
            feature_key="frontostriatal_connectivity_mean",
            display_name="Frontostriatal proxy connectivity",
            left_patterns=["prefrontal", "frontal", "dlpfc"],
            right_patterns=["caudate", "putamen", "accumb", "stri"],
        )
        self._append_roi_connectivity(
            session_features,
            features,
            missing,
            feature_key="frontoparietal_connectivity_mean",
            display_name="Frontoparietal proxy connectivity",
            left_patterns=["prefrontal", "frontal", "dlpfc"],
            right_patterns=["pariet", "supramarg", "precuneus"],
        )

        structural_proxy_present = int(
            any(
                feature.feature_key in {
                    "frontal_lobe_gray_matter_volume_mm3_lh",
                    "frontal_lobe_gray_matter_volume_mm3_rh",
                    "caudate_asymmetry_index_percent",
                    "thalamus_asymmetry_index_percent",
                }
                for feature in features
            )
        )
        functional_proxy_present = int(
            any(feature.feature_key == "frontostriatal_connectivity_mean" for feature in features)
        )
        features.append(
            ProtocolFeature(
                feature_key="frontostriatal_structural_features_present",
                display_name="Frontostriatal structural proxies available",
                value=structural_proxy_present,
                unit=None,
                source="derived",
                notes=None,
            )
        )
        features.append(
            ProtocolFeature(
                feature_key="frontostriatal_functional_features_present",
                display_name="Frontostriatal functional proxies available",
                value=functional_proxy_present,
                unit=None,
                source="derived",
                notes=None,
            )
        )

        return self._build_view("adhd", session_features, features, missing)

    def _select_alzheimers_features(self, session_features: SessionFeatures) -> ProtocolFeatureView:
        """Select a conservative Alzheimer’s/dementia-oriented feature subset."""

        features: list[ProtocolFeature] = []
        missing: list[str] = []

        self._append_metadata_feature(session_features, features, missing, "age_years", "Age", "years")
        self._append_metadata_feature(session_features, features, missing, "sex", "Sex", None)

        self._append_structural_metric(
            session_features,
            features,
            missing,
            feature_key="hippocampus_volume_mm3_per_icv_lh",
            display_name="Left hippocampal normalized volume",
            structure_patterns=["hippocampus"],
            metric_name="volume_mm3_per_icv",
            hemisphere="lh",
            aggregate="first",
        )
        self._append_structural_metric(
            session_features,
            features,
            missing,
            feature_key="hippocampus_volume_mm3_per_icv_rh",
            display_name="Right hippocampal normalized volume",
            structure_patterns=["hippocampus"],
            metric_name="volume_mm3_per_icv",
            hemisphere="rh",
            aggregate="first",
        )
        if "hippocampus_volume_mm3_per_icv_lh" in missing:
            self._append_structural_metric(
                session_features,
                features,
                missing,
                feature_key="hippocampus_volume_mm3_lh",
                display_name="Left hippocampal volume",
                structure_patterns=["hippocampus"],
                metric_name="volume_mm3",
                hemisphere="lh",
                aggregate="first",
            )
        if "hippocampus_volume_mm3_per_icv_rh" in missing:
            self._append_structural_metric(
                session_features,
                features,
                missing,
                feature_key="hippocampus_volume_mm3_rh",
                display_name="Right hippocampal volume",
                structure_patterns=["hippocampus"],
                metric_name="volume_mm3",
                hemisphere="rh",
                aggregate="first",
            )
        self._append_structural_metric(
            session_features,
            features,
            missing,
            feature_key="hippocampus_asymmetry_index_percent",
            display_name="Hippocampal asymmetry index",
            structure_patterns=["hippocampus"],
            metric_name="asymmetry_index_percent",
            aggregate="first",
        )
        self._append_structural_metric(
            session_features,
            features,
            missing,
            feature_key="temporal_lobe_gray_matter_volume_mm3_lh",
            display_name="Left temporal lobe gray matter volume",
            structure_patterns=["temporal_lobe"],
            metric_name="lobe_gray_matter_volume_mm3",
            hemisphere="lh",
            aggregate="sum",
        )
        self._append_structural_metric(
            session_features,
            features,
            missing,
            feature_key="temporal_lobe_gray_matter_volume_mm3_rh",
            display_name="Right temporal lobe gray matter volume",
            structure_patterns=["temporal_lobe"],
            metric_name="lobe_gray_matter_volume_mm3",
            hemisphere="rh",
            aggregate="sum",
        )
        self._append_structural_metric(
            session_features,
            features,
            missing,
            feature_key="parietal_lobe_gray_matter_volume_mm3_lh",
            display_name="Left parietal lobe gray matter volume",
            structure_patterns=["parietal_lobe"],
            metric_name="lobe_gray_matter_volume_mm3",
            hemisphere="lh",
            aggregate="sum",
        )
        self._append_structural_metric(
            session_features,
            features,
            missing,
            feature_key="parietal_lobe_gray_matter_volume_mm3_rh",
            display_name="Right parietal lobe gray matter volume",
            structure_patterns=["parietal_lobe"],
            metric_name="lobe_gray_matter_volume_mm3",
            hemisphere="rh",
            aggregate="sum",
        )

        self._append_connectivity_summary(session_features, features, missing)
        self._append_roi_connectivity(
            session_features,
            features,
            missing,
            feature_key="dmn_within_connectivity_mean",
            display_name="Default-mode network mean connectivity",
            left_patterns=["default", "dmn", "precuneus", "posteriorcingulate", "posterior_cingulate", "angular", "pariet"],
        )

        hippocampal_markers_present = int(
            any("hippocampus" in feature.feature_key for feature in features)
        )
        connectivity_markers_present = int(
            any(
                feature.feature_key in {
                    "connectivity_matrix_mean_value",
                    "connectivity_upper_triangle_abs_mean",
                    "dmn_within_connectivity_mean",
                }
                for feature in features
            )
        )
        features.append(
            ProtocolFeature(
                feature_key="hippocampal_markers_present",
                display_name="Hippocampal markers available",
                value=hippocampal_markers_present,
                unit=None,
                source="derived",
                notes=None,
            )
        )
        features.append(
            ProtocolFeature(
                feature_key="connectivity_markers_present",
                display_name="Connectivity markers available",
                value=connectivity_markers_present,
                unit=None,
                source="derived",
                notes=None,
            )
        )

        return self._build_view("alzheimers", session_features, features, missing)

    def _build_view(
        self,
        condition: str,
        session_features: SessionFeatures,
        features: list[ProtocolFeature],
        missing: list[str],
    ) -> ProtocolFeatureView:
        """Create the final protocol feature view with stable metadata."""

        metadata = session_features.to_dict()["metadata"]
        return ProtocolFeatureView(
            version=self.version,
            condition=condition,
            subject_id=session_features.subject_id,
            session_id=session_features.session_id,
            metadata=metadata,
            selected_features=features,
            missing_features=sorted(set(missing)),
            created_at=datetime.now(timezone.utc),
        )

    def _append_metadata_feature(
        self,
        session_features: SessionFeatures,
        features: list[ProtocolFeature],
        missing: list[str],
        key: str,
        display_name: str,
        unit: str | None,
    ) -> None:
        """Append one metadata feature or record it as missing."""

        value = getattr(session_features.metadata, key, None)
        if value is None:
            missing.append(key)
            return
        features.append(
            ProtocolFeature(
                feature_key=key,
                display_name=display_name,
                value=value,
                unit=unit,
                source="metadata",
                notes=None,
            )
        )

    def _append_structural_metric(
        self,
        session_features: SessionFeatures,
        features: list[ProtocolFeature],
        missing: list[str],
        *,
        feature_key: str,
        display_name: str,
        structure_patterns: list[str],
        metric_name: str,
        hemisphere: str | None = None,
        aggregate: str = "first",
    ) -> None:
        """Append one structural metric or record the requested key as missing."""

        result = self._find_structural_metric(
            session_features,
            structure_patterns=structure_patterns,
            metric_name=metric_name,
            hemisphere=hemisphere,
            aggregate=aggregate,
        )
        if result is None:
            missing.append(feature_key)
            return
        value, unit, source, notes = result
        features.append(
            ProtocolFeature(
                feature_key=feature_key,
                display_name=display_name,
                value=value,
                unit=unit,
                source=source,
                notes=notes,
            )
        )

    def _append_connectivity_summary(
        self,
        session_features: SessionFeatures,
        features: list[ProtocolFeature],
        missing: list[str],
    ) -> None:
        """Append matrix-level connectivity summary features when available."""

        try:
            summary = self._presenter.summarize_connectivity(session_features)
        except SessionPresentationError as exc:
            logger.warning("Connectivity summary failed for sub-%s: %s", session_features.subject_id, exc)
            summary = None
        if summary is None:
            missing.extend(
                [
                    "connectivity_matrix_mean_value",
                    "connectivity_diagonal_mean",
                    "connectivity_upper_triangle_abs_mean",
                ]
            )
            return
        features.extend(
            [
                ProtocolFeature(
                    feature_key="connectivity_matrix_mean_value",
                    display_name="Connectivity matrix mean",
                    value=summary.mean_value,
                    unit=None,
                    source="functional_connectivity",
                    notes=None,
                ),
                ProtocolFeature(
                    feature_key="connectivity_diagonal_mean",
                    display_name="Connectivity matrix diagonal mean",
                    value=summary.diagonal_mean,
                    unit=None,
                    source="functional_connectivity",
                    notes=None,
                ),
                ProtocolFeature(
                    feature_key="connectivity_upper_triangle_abs_mean",
                    display_name="Connectivity upper triangle absolute mean",
                    value=summary.upper_triangle_abs_mean,
                    unit=None,
                    source="functional_connectivity",
                    notes=None,
                ),
            ]
        )

    def _append_roi_connectivity(
        self,
        session_features: SessionFeatures,
        features: list[ProtocolFeature],
        missing: list[str],
        *,
        feature_key: str,
        display_name: str,
        left_patterns: list[str],
        right_patterns: list[str] | None = None,
    ) -> None:
        """Append a pattern-based connectivity proxy feature when feasible."""

        result = self._compute_pattern_connectivity(
            session_features,
            left_patterns=left_patterns,
            right_patterns=right_patterns,
        )
        if result is None:
            missing.append(feature_key)
            return
        value, notes = result
        features.append(
            ProtocolFeature(
                feature_key=feature_key,
                display_name=display_name,
                value=value,
                unit=None,
                source="functional_connectivity",
                notes=notes,
            )
        )

    def _find_structural_metric(
        self,
        session_features: SessionFeatures,
        *,
        structure_patterns: list[str],
        metric_name: str,
        hemisphere: str | None,
        aggregate: str,
    ) -> tuple[float | int | str | None, str | None, str, str | None] | None:
        """Find one structural metric across normalized and biomarker-backed records."""

        candidates: list[tuple[dict[str, Any], str]] = []
        structural = session_features.structural
        if structural is None:
            return None

        for record in structural.normalized_records:
            candidates.append((record.to_dict(), "structural_normalized"))
        for record in structural.biomarker_bundle.to_flat_records():
            candidates.append((record, "structural_biomarker"))

        matches: list[tuple[dict[str, Any], str]] = []
        for record, source in candidates:
            if record.get("metric_name") != metric_name:
                continue
            if not _match_structure(record.get("structure_name"), structure_patterns):
                continue
            if hemisphere is not None and _record_hemisphere(record) != hemisphere:
                continue
            matches.append((record, source))

        if not matches:
            return None
        if aggregate == "first":
            record, source = matches[0]
            return record.get("value"), record.get("unit"), source, None

        numeric_matches = [
            (float(record["value"]), record, source)
            for record, source in matches
            if isinstance(record.get("value"), (int, float))
        ]
        if not numeric_matches:
            record, source = matches[0]
            return record.get("value"), record.get("unit"), source, None
        values = [value for value, _, _ in numeric_matches]
        result_value = sum(values) if aggregate == "sum" else sum(values) / len(values)
        representative_record = numeric_matches[0][1]
        representative_source = numeric_matches[0][2]
        notes = None if len(numeric_matches) == 1 else f"Aggregated from {len(numeric_matches)} matching records."
        return result_value, representative_record.get("unit"), representative_source, notes

    def _compute_pattern_connectivity(
        self,
        session_features: SessionFeatures,
        *,
        left_patterns: list[str],
        right_patterns: list[str] | None = None,
    ) -> tuple[float, str | None] | None:
        """Compute a conservative label-pattern connectivity proxy."""

        connectivity = session_features.functional
        if connectivity is None or connectivity.connectivity is None:
            return None

        matrix, labels = _select_matrix_and_labels(connectivity.connectivity)
        if matrix is None or labels is None:
            return None

        validated = _validate_square_matrix(matrix)
        left_indices = _find_label_indices(labels, left_patterns)
        if right_patterns is None:
            if len(left_indices) < 2:
                return None
            values = [
                validated[row_index][col_index]
                for row_index in left_indices
                for col_index in left_indices
                if row_index < col_index
            ]
            if not values:
                return None
            return sum(values) / len(values), f"Computed from {len(values)} within-group atlas connections."

        right_indices = _find_label_indices(labels, right_patterns)
        if not left_indices or not right_indices:
            return None
        values = [
            validated[left_index][right_index]
            for left_index in left_indices
            for right_index in right_indices
            if left_index != right_index
        ]
        if not values:
            return None
        return sum(values) / len(values), f"Computed from {len(values)} atlas label-pair connections."


def _match_structure(structure_name: Any, patterns: Iterable[str]) -> bool:
    """Return whether a structure name matches any requested pattern."""

    if structure_name is None:
        return False
    lowered = str(structure_name).lower()
    return any(pattern.lower() in lowered for pattern in patterns)


def _record_hemisphere(record: dict[str, Any]) -> str | None:
    """Infer the hemisphere for one structural record when possible."""

    explicit = record.get("hemisphere")
    if explicit in {"lh", "rh"}:
        return str(explicit)
    structure_name = str(record.get("structure_name") or "").lower()
    if structure_name.startswith(("left-", "left_", "lh_", "lh-")):
        return "lh"
    if structure_name.startswith(("right-", "right_", "rh_", "rh-")):
        return "rh"
    return None


def _select_matrix_and_labels(bundle: Any) -> tuple[list[list[float]] | None, list[str] | None]:
    """Return the best available connectivity matrix and its atlas labels."""

    if bundle.aggregated_matrix is not None:
        labels = list(bundle.runs[0].atlas_labels) if bundle.runs else None
        return bundle.aggregated_matrix, labels
    if len(bundle.runs) == 1:
        run = bundle.runs[0]
        return run.matrix, list(run.atlas_labels)
    return None, None


def _validate_square_matrix(matrix: Any) -> list[list[float]]:
    """Normalize and validate a square numeric matrix."""

    if not isinstance(matrix, list) or not matrix:
        raise ProtocolFeatureViewError("Connectivity matrix must be a non-empty 2D list.")
    normalized: list[list[float]] = []
    expected_width: int | None = None
    for row in matrix:
        if not isinstance(row, list) or not row:
            raise ProtocolFeatureViewError("Connectivity matrix rows must be non-empty lists.")
        if expected_width is None:
            expected_width = len(row)
        if len(row) != expected_width:
            raise ProtocolFeatureViewError("Connectivity matrix rows must all have equal length.")
        try:
            normalized.append([float(value) for value in row])
        except (TypeError, ValueError) as exc:
            raise ProtocolFeatureViewError("Connectivity matrix contains non-numeric values.") from exc
    if expected_width != len(normalized):
        raise ProtocolFeatureViewError("Connectivity matrix must be square.")
    return normalized


def _find_label_indices(labels: list[str], patterns: list[str]) -> list[int]:
    """Locate atlas label indices by case-insensitive substring matching."""

    lowered_patterns = [pattern.lower() for pattern in patterns]
    indices: list[int] = []
    for index, label in enumerate(labels):
        lowered = label.lower()
        if any(pattern in lowered for pattern in lowered_patterns):
            indices.append(index)
    return indices


__all__ = [
    "ProtocolFeature",
    "ProtocolFeatureSelector",
    "ProtocolFeatureView",
    "ProtocolFeatureViewError",
]
