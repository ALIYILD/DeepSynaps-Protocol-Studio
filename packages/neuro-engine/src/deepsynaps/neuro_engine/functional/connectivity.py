"""Functional connectivity extraction from fMRIPrep-style derivatives.

This module assumes fMRIPrep-style derivatives as input, with preprocessed BOLD
images and accompanying confounds files under a BIDS-derivatives-like tree. It
uses nilearn's fMRIPrep interfaces, maskers, and connectivity estimators to
compute region-by-region connectivity matrices from atlas-defined regional time
series. Connectivity is expressed as correlation or another requested measure,
with optional denoising strategies driven by fMRIPrep confounds. Outputs are
returned as structured, JSON-friendly Python dataclasses suitable for
downstream DeepSynaps analytics.
"""

from __future__ import annotations

from dataclasses import dataclass, field
import json
import logging
import math
from pathlib import Path
import re
from typing import Any, Iterable, Sequence

logger = logging.getLogger(__name__)

_BOLD_SUFFIX = "_desc-preproc_bold.nii.gz"
_CONFOUNDS_SUFFIX = "_desc-confounds_timeseries.tsv"
_ENTITY_PATTERN = re.compile(r"^(?P<key>[A-Za-z0-9]+)-(?P<value>.+)$")


class ConnectivityExtractionError(RuntimeError):
    """Raised when fMRIPrep connectivity extraction cannot proceed safely."""


@dataclass(slots=True)
class ConnectivityRunResult:
    subject_id: str
    session_id: str | None
    run_id: str | None
    task_id: str | None
    space: str
    atlas_name: str
    atlas_labels: list[str]
    connectivity_kind: str
    matrix: list[list[float]]
    confounds_strategy: str
    n_volumes: int
    tr: float | None
    source_bold: str
    source_confounds: str | None


@dataclass(slots=True)
class ConnectivityBundle:
    subject_id: str
    session_id: str | None
    atlas_name: str
    connectivity_kind: str
    runs: list[ConnectivityRunResult]
    aggregated_matrix: list[list[float]] | None
    aggregation_method: str | None


@dataclass(slots=True)
class ConnectivityResult:
    status: str
    backend: str
    matrix: list[list[float]]
    labels: list[str]
    n_regions: int
    source: str
    notes: list[str] = field(default_factory=list)


class FunctionalConnectivityExtractor:
    """Extract run-level and subject-level connectivity from fMRIPrep derivatives."""

    def __init__(
        self,
        atlas_img: Path,
        atlas_labels: list[str],
        atlas_name: str,
        space: str = "MNI152NLin2009cAsym",
        connectivity_kind: str = "correlation",
        confounds_strategy: str = "simple",
        low_pass: float | None = 0.1,
        high_pass: float | None = 0.01,
        t_r: float | None = None,
    ) -> None:
        self.atlas_img = Path(atlas_img)
        self.atlas_labels = list(atlas_labels)
        self.atlas_name = atlas_name.strip()
        self.space = space.strip()
        self.connectivity_kind = connectivity_kind.strip()
        self.confounds_strategy = confounds_strategy.strip()
        self.low_pass = low_pass
        self.high_pass = high_pass
        self.t_r = t_r
        if not self.atlas_labels:
            raise ValueError("atlas_labels must contain at least one label")

    def discover_bold_and_confounds(self, derivatives_root: Path, subject_id: str, session_id: str | None = None) -> list[tuple[Path, Path | None, dict]]:
        root = Path(derivatives_root)
        subject_label = _normalize_identifier(subject_id, "subject_id", "sub-")
        session_label = None if session_id is None else _normalize_identifier(session_id, "session_id", "ses-")
        subject_root = root / f"sub-{subject_label}"
        if not subject_root.exists():
            raise ConnectivityExtractionError(f"Subject derivatives directory does not exist: {subject_root}")
        results: list[tuple[Path, Path | None, dict]] = []
        for bold_file in sorted(subject_root.rglob(f"*space-{self.space}{_BOLD_SUFFIX}")):
            entities = _parse_bids_entities(bold_file.name)
            if entities.get("sub") != subject_label:
                continue
            if session_label is not None and entities.get("ses") != session_label:
                continue
            metadata = {
                "run_id": entities.get("run"),
                "task_id": entities.get("task"),
                "space": entities.get("space", self.space),
            }
            metadata.update(self._read_json_sidecar(bold_file))
            results.append((bold_file, self._find_confounds_file(bold_file), metadata))
        if not results:
            raise ConnectivityExtractionError(
                f"No preprocessed BOLD files were found for sub-{subject_label} in space {self.space} under {root}."
            )
        return results

    def extract_run_connectivity(
        self,
        bold_file: Path,
        confounds_file: Path | None,
        metadata: dict,
        subject_id: str,
        session_id: str | None = None,
    ) -> ConnectivityRunResult:
        confounds = None
        sample_mask = None
        if confounds_file is not None:
            try:
                confounds, sample_mask = self._load_confounds(Path(bold_file))
            except Exception as exc:
                logger.warning("Failed to load fMRIPrep confounds for %s: %s. Proceeding without confounds.", bold_file, exc)
        tr = _coerce_float(self.t_r if self.t_r is not None else metadata.get("RepetitionTime"))
        time_series = self._extract_time_series(Path(bold_file), confounds, sample_mask, tr)
        if len(time_series) < 10:
            raise ConnectivityExtractionError(f"Too few retained volumes for connectivity estimation in {bold_file}: {len(time_series)}")
        matrix = self._compute_connectivity_matrix(time_series)
        return ConnectivityRunResult(
            subject_id=_normalize_identifier(subject_id, "subject_id", "sub-"),
            session_id=None if session_id is None else _normalize_identifier(session_id, "session_id", "ses-"),
            run_id=metadata.get("run_id"),
            task_id=metadata.get("task_id"),
            space=str(metadata.get("space") or self.space),
            atlas_name=self.atlas_name,
            atlas_labels=list(self.atlas_labels),
            connectivity_kind=self.connectivity_kind,
            matrix=matrix,
            confounds_strategy=self.confounds_strategy,
            n_volumes=len(time_series),
            tr=tr,
            source_bold=str(bold_file),
            source_confounds=None if confounds_file is None else str(confounds_file),
        )

    def extract_subject_connectivity(self, derivatives_root: Path, subject_id: str, session_id: str | None = None, aggregate: bool = True) -> ConnectivityBundle:
        discovered = self.discover_bold_and_confounds(Path(derivatives_root), subject_id, session_id)
        runs: list[ConnectivityRunResult] = []
        for bold_file, confounds_file, metadata in discovered:
            try:
                runs.append(self.extract_run_connectivity(bold_file, confounds_file, metadata, subject_id, session_id))
            except ConnectivityExtractionError as exc:
                logger.warning("Skipping connectivity run %s: %s", bold_file, exc)
        if not runs:
            raise ConnectivityExtractionError(f"No usable functional connectivity runs were extracted for sub-{_normalize_identifier(subject_id, 'subject_id', 'sub-')}.")
        aggregated_matrix = None
        aggregation_method = None
        if aggregate and len(runs) > 1:
            aggregated_matrix = _mean_matrices([run.matrix for run in runs])
            aggregation_method = "mean_across_runs"
        return ConnectivityBundle(
            subject_id=_normalize_identifier(subject_id, "subject_id", "sub-"),
            session_id=None if session_id is None else _normalize_identifier(session_id, "session_id", "ses-"),
            atlas_name=self.atlas_name,
            connectivity_kind=self.connectivity_kind,
            runs=runs,
            aggregated_matrix=aggregated_matrix,
            aggregation_method=aggregation_method,
        )

    def _find_confounds_file(self, bold_file: Path) -> Path | None:
        name = bold_file.name
        if not name.endswith(_BOLD_SUFFIX):
            return None
        base = name[:-len(".nii.gz")]
        tokens = base.split("_")
        shared_tokens = [token for token in tokens if token != "bold" and not token.startswith("space-") and not token.startswith("desc-") and not token.startswith("res-")]
        exact = bold_file.parent / f"{'_'.join(shared_tokens)}{_CONFOUNDS_SUFFIX}"
        if exact.exists():
            return exact
        matches = sorted(bold_file.parent.glob(f"{'_'.join(shared_tokens)}*_desc-confounds_timeseries.tsv"))
        return matches[0] if matches else None

    def _read_json_sidecar(self, bold_file: Path) -> dict[str, Any]:
        json_path = bold_file.with_suffix("").with_suffix(".json")
        if not json_path.exists():
            return {}
        try:
            payload = json.loads(json_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {}
        return {key: payload[key] for key in ("RepetitionTime",) if key in payload}

    def _load_confounds(self, bold_file: Path) -> tuple[Any, Any]:
        try:
            from nilearn.interfaces.fmriprep import load_confounds_strategy
        except ImportError as exc:  # pragma: no cover
            raise ConnectivityExtractionError("nilearn is required for fMRIPrep confounds loading but is not installed.") from exc
        return load_confounds_strategy(str(bold_file), denoise_strategy=self.confounds_strategy)

    def _extract_time_series(self, bold_path: Path, confounds: Any, sample_mask: Any, tr: float | None) -> list[list[float]]:
        try:
            from nilearn.maskers import NiftiLabelsMasker
        except ImportError as exc:  # pragma: no cover
            raise ConnectivityExtractionError("nilearn is required for atlas time-series extraction but is not installed.") from exc
        masker = NiftiLabelsMasker(
            labels_img=str(self.atlas_img),
            standardize=True,
            detrend=True,
            low_pass=self.low_pass,
            high_pass=self.high_pass,
            t_r=tr,
        )
        return _to_nested_float_list(masker.fit_transform(str(bold_path), confounds=confounds, sample_mask=sample_mask))

    def _compute_connectivity_matrix(self, time_series: list[list[float]]) -> list[list[float]]:
        try:
            from nilearn.connectome import ConnectivityMeasure
        except ImportError as exc:  # pragma: no cover
            raise ConnectivityExtractionError("nilearn is required for connectivity estimation but is not installed.") from exc
        estimator = ConnectivityMeasure(kind=_normalize_connectivity_kind(self.connectivity_kind))
        return _to_nested_float_list(estimator.fit_transform([time_series])[0])


def _normalize_identifier(value: str, field_name: str, prefix: str) -> str:
    text = value.strip()
    if not text:
        raise ValueError(f"{field_name} must not be empty")
    if text.startswith(prefix):
        text = text[len(prefix):]
    if not text or any(character.isspace() for character in text):
        raise ValueError(f"{field_name} must be a non-empty identifier without whitespace")
    return text


def _parse_bids_entities(filename: str) -> dict[str, str]:
    stem = filename
    for suffix in (".nii.gz", ".tsv", ".json"):
        if stem.endswith(suffix):
            stem = stem[:-len(suffix)]
            break
    entities: dict[str, str] = {}
    for token in stem.split("_"):
        match = _ENTITY_PATTERN.match(token)
        if match is not None:
            entities[match.group("key")] = match.group("value")
    return entities


def _normalize_connectivity_kind(kind: str) -> str:
    normalized = kind.strip().lower().replace("_", " ")
    aliases = {
        "correlation": "correlation",
        "partial correlation": "partial correlation",
        "tangent": "tangent",
        "precision": "precision",
        "covariance": "covariance",
    }
    if normalized not in aliases:
        raise ConnectivityExtractionError(f"Unsupported connectivity kind: {kind}")
    return aliases[normalized]


def _coerce_float(value: Any) -> float | None:
    try:
        return None if value is None else float(value)
    except (TypeError, ValueError):
        return None


def _to_nested_float_list(values: Any) -> list[list[float]]:
    if hasattr(values, "tolist"):
        values = values.tolist()
    return [[float(item) for item in row] for row in values]


def _mean_matrices(matrices: list[list[list[float]]]) -> list[list[float]]:
    row_count = len(matrices[0])
    col_count = len(matrices[0][0]) if row_count else 0
    return [
        [
            sum(matrix[row_index][col_index] for matrix in matrices) / len(matrices)
            for col_index in range(col_count)
        ]
        for row_index in range(row_count)
    ]


def _coerce_timeseries(timeseries: Sequence[Sequence[float]]) -> list[list[float]]:
    return [[float(value) for value in row] for row in timeseries]


def _transpose(values: Sequence[Sequence[float]]) -> list[list[float]]:
    return [list(column) for column in zip(*values)]


def _pearson(left: Sequence[float], right: Sequence[float]) -> float:
    if len(left) != len(right) or len(left) < 2:
        return 0.0
    left_mean = sum(left) / len(left)
    right_mean = sum(right) / len(right)
    numerator = sum((l - left_mean) * (r - right_mean) for l, r in zip(left, right))
    left_var = sum((l - left_mean) ** 2 for l in left)
    right_var = sum((r - right_mean) ** 2 for r in right)
    denominator = math.sqrt(left_var * right_var)
    if denominator == 0:
        return 0.0
    return max(min(numerator / denominator, 1.0), -1.0)


def _correlation_matrix(signals: Sequence[Sequence[float]], fisher_z: bool) -> list[list[float]]:
    matrix: list[list[float]] = []
    for left_signal in signals:
        row: list[float] = []
        for right_signal in signals:
            corr = _pearson(left_signal, right_signal)
            if fisher_z and abs(corr) < 1.0:
                corr = 0.5 * math.log((1.0 + corr) / (1.0 - corr))
            row.append(corr)
        matrix.append(row)
    return matrix


def _extract_signals_from_bold(bold_path: Path) -> list[list[float]]:
    try:
        import nibabel as nib
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError("nibabel is required to extract signals from BOLD data") from exc
    image = nib.load(str(bold_path))
    data = image.get_fdata()
    if data.ndim != 4:
        raise ValueError("BOLD input must be a 4D NIfTI image")
    x_dim, y_dim, z_dim, timepoints = data.shape
    flattened = data.reshape((x_dim * y_dim * z_dim, timepoints))
    region_count = min(16, max(1, flattened.shape[0] // max(1, timepoints)))
    chunk_size = max(1, flattened.shape[0] // region_count)
    signals: list[list[float]] = []
    for index in range(region_count):
        start = index * chunk_size
        stop = flattened.shape[0] if index == region_count - 1 else min(flattened.shape[0], start + chunk_size)
        chunk = flattened[start:stop]
        if chunk.size == 0:
            continue
        mean_signal = chunk.mean(axis=0)
        signals.append([float(value) for value in mean_signal.tolist()])
    return signals


def compute_functional_connectivity(
    timeseries: Sequence[Sequence[float]] | None = None,
    bold_path: str | Path | None = None,
    labels: Iterable[str] | None = None,
    fisher_z: bool = True,
) -> ConnectivityResult:
    notes: list[str] = []
    source = "timeseries"
    if timeseries is None:
        if bold_path is None:
            raise ValueError("Either timeseries or bold_path must be provided")
        source = str(Path(bold_path))
        timeseries = _transpose(_extract_signals_from_bold(Path(bold_path)))
        notes.append("Signals were derived from BOLD voxel partitions before connectivity analysis.")
    data = _coerce_timeseries(timeseries)
    if not data:
        return ConnectivityResult(status="empty", backend="none", matrix=[], labels=[], n_regions=0, source=source, notes=["No time-series samples were provided."])
    regional_signals = _transpose(data)
    resolved_labels = list(labels) if labels is not None else [f"roi_{index:02d}" for index in range(len(regional_signals))]
    try:
        from nilearn.connectome import ConnectivityMeasure
    except ImportError:
        matrix = _correlation_matrix(regional_signals, fisher_z=fisher_z)
        backend = "python-fallback"
        notes.append("nilearn is unavailable; a stdlib Pearson fallback was used.")
    else:  # pragma: no cover
        matrix_values = ConnectivityMeasure(kind="correlation").fit_transform([data])[0]
        matrix = [[float(value) for value in row] for row in matrix_values.tolist()]
        if fisher_z:
            for row_index, row in enumerate(matrix):
                for col_index, corr in enumerate(row):
                    if abs(corr) < 1.0:
                        matrix[row_index][col_index] = 0.5 * math.log((1.0 + corr) / (1.0 - corr))
        backend = "nilearn"
        notes.append("Connectivity matrix computed with nilearn.connectome.ConnectivityMeasure.")
    return ConnectivityResult(
        status="completed",
        backend=backend,
        matrix=matrix,
        labels=resolved_labels,
        n_regions=len(regional_signals),
        source=source,
        notes=notes,
    )


__all__ = [
    "ConnectivityBundle",
    "ConnectivityExtractionError",
    "ConnectivityResult",
    "ConnectivityRunResult",
    "FunctionalConnectivityExtractor",
    "compute_functional_connectivity",
]
