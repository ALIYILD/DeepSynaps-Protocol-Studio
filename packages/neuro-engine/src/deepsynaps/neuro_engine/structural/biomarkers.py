"""Quantitative structural biomarker extraction from FastSurfer stats files.

FastSurfer and FreeSurfer stats files contain summary structural measurements
derived from processed structural MRI. ``aseg``-style files provide
segmentation and subcortical volume-oriented metrics, while ``aparc``-style
files provide cortical regional measurements such as thickness, area, and gray
matter volume. This module extracts quantitative features only and returns
machine-readable records; it does not interpret the measurements clinically.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import json
import logging
from pathlib import Path
import re
from typing import Any

logger = logging.getLogger(__name__)

_MEASURE_PATTERN = re.compile(
    r"^#\s*Measure\s+([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+)(?:,\s*([^,]+))?\s*$"
)


class StructuralBiomarkerError(RuntimeError):
    """Raised when FastSurfer structural biomarker extraction cannot proceed."""


@dataclass(slots=True)
class StructuralBiomarkerBundle:
    """Structured biomarker output extracted from one FastSurfer subject directory."""

    subject_id: str
    session_id: str | None
    source_dir: Path
    aseg_metrics: list[dict]
    cortical_metrics: list[dict]
    global_metrics: dict[str, float | int | str | None]
    generated_at: datetime
    global_metric_units: dict[str, str | None] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "subject_id": self.subject_id,
            "session_id": self.session_id,
            "source_dir": str(self.source_dir),
            "aseg_metrics": self.aseg_metrics,
            "cortical_metrics": self.cortical_metrics,
            "global_metrics": self.global_metrics,
            "global_metric_units": self.global_metric_units,
            "generated_at": self.generated_at.isoformat(),
        }

    def to_flat_records(self) -> list[dict[str, Any]]:
        records: list[dict[str, Any]] = []
        for metric in self.aseg_metrics + self.cortical_metrics:
            records.append(
                {
                    "subject_id": self.subject_id,
                    "session_id": self.session_id,
                    "modality": "sMRI",
                    "scope": metric.get("scope"),
                    "hemisphere": metric.get("hemisphere"),
                    "structure_name": metric.get("structure_name"),
                    "metric_name": metric.get("metric_name"),
                    "value": metric.get("value"),
                    "unit": metric.get("unit"),
                    "source_file": metric.get("source_file"),
                }
            )
        for metric_name, value in self.global_metrics.items():
            records.append(
                {
                    "subject_id": self.subject_id,
                    "session_id": self.session_id,
                    "modality": "sMRI",
                    "scope": "global",
                    "hemisphere": None,
                    "structure_name": None,
                    "metric_name": metric_name,
                    "value": value,
                    "unit": self.global_metric_units.get(metric_name),
                    "source_file": None,
                }
            )
        return records


class FastSurferBiomarkerExtractor:
    """Parse FastSurfer stats files into normalized structural biomarker records."""

    def __init__(self) -> None:
        self._last_measure_units: dict[str, str | None] = {}

    def extract(
        self,
        subject_output_dir: Path,
        subject_id: str,
        session_id: str | None = None,
    ) -> StructuralBiomarkerBundle:
        source_dir = Path(subject_output_dir)
        if not source_dir.exists():
            raise StructuralBiomarkerError(f"Subject output directory does not exist: {source_dir}")

        stats_files = self.find_stats_files(source_dir)
        aseg_metrics: list[dict] = []
        cortical_metrics: list[dict] = []
        global_metrics: dict[str, float | int | str | None] = {}
        global_units: dict[str, str | None] = {}

        aseg_path = stats_files.get("aseg")
        if aseg_path is not None:
            parsed_aseg_metrics, aseg_global = self.parse_aseg_stats(aseg_path)
            aseg_metrics.extend(parsed_aseg_metrics)
            global_metrics.update(aseg_global)
            global_units.update(self._last_measure_units)
        else:
            logger.warning("No aseg-style stats file found under %s", source_dir)

        for hemisphere_key, hemisphere in (("lh_aparc", "lh"), ("rh_aparc", "rh")):
            aparc_path = stats_files.get(hemisphere_key)
            if aparc_path is None:
                logger.warning("No %s cortical stats file found under %s", hemisphere, source_dir)
                continue
            parsed_cortical_metrics, cortical_global = self.parse_aparc_stats(aparc_path, hemisphere=hemisphere)
            cortical_metrics.extend(parsed_cortical_metrics)
            global_metrics.update(cortical_global)
            global_units.update(self._last_measure_units)

        if not aseg_metrics and not cortical_metrics and not global_metrics:
            raise StructuralBiomarkerError(f"No structural biomarkers could be extracted from {source_dir}")

        return StructuralBiomarkerBundle(
            subject_id=_normalize_identifier(subject_id, "subject_id", "sub-"),
            session_id=None if session_id is None else _normalize_identifier(session_id, "session_id", "ses-"),
            source_dir=source_dir,
            aseg_metrics=aseg_metrics,
            cortical_metrics=cortical_metrics,
            global_metrics=global_metrics,
            generated_at=datetime.now(timezone.utc),
            global_metric_units=global_units,
        )

    def find_stats_files(self, subject_output_dir: Path) -> dict[str, Path]:
        stats_dir = Path(subject_output_dir) / "stats"
        if not stats_dir.exists():
            raise StructuralBiomarkerError(f"Stats directory does not exist: {stats_dir}")

        found: dict[str, Path] = {}
        aseg_path = stats_dir / "aseg.stats"
        if aseg_path.exists():
            found["aseg"] = aseg_path
        else:
            fallback = stats_dir / "aseg+DKT.stats"
            if fallback.exists():
                found["aseg"] = fallback
        for key, name in (
            ("lh_aparc", "lh.aparc.DKTatlas.mapped.stats"),
            ("rh_aparc", "rh.aparc.DKTatlas.mapped.stats"),
        ):
            path = stats_dir / name
            if path.exists():
                found[key] = path
        if not found:
            raise StructuralBiomarkerError(f"No usable FastSurfer structural stats files were found under {stats_dir}")
        return found

    def parse_aseg_stats(self, stats_file: Path) -> tuple[list[dict], dict[str, float | int | str | None]]:
        metrics: list[dict] = []
        global_metrics: dict[str, float | int | str | None] = {}
        self._last_measure_units = {}
        lines = Path(stats_file).read_text(encoding="utf-8").splitlines()
        column_headers: list[str] = []
        source_name = Path(stats_file).name

        for raw_line in lines:
            line = raw_line.strip()
            if not line:
                continue
            if line.startswith("#"):
                match = _MEASURE_PATTERN.match(line)
                if match is not None:
                    measure_name, measure_field, _, measure_value, unit = match.groups()
                    metric_name = _normalize_measure_key(measure_name, measure_field, _normalize_unit(unit))
                    value = _safe_number(measure_value)
                    global_metrics[metric_name] = value if value is not None else measure_value.strip()
                    self._last_measure_units[metric_name] = _normalize_unit(unit)
                    continue
                if line.startswith("# ColHeaders"):
                    column_headers = line.replace("# ColHeaders", "", 1).strip().split()
                continue

            tokens = line.split()
            row = _row_from_tokens(tokens, column_headers, "aseg")
            if row is None:
                continue
            structure_name = str(row.get("StructName") or row.get("StructureName") or row.get("LabelName") or "").strip()
            volume = _lookup_first_numeric(row, "Volume_mm3", "Volume", "Vol", "GrayVol")
            if structure_name and volume is not None:
                metrics.append(
                    {
                        "structure_name": structure_name,
                        "metric_name": "volume_mm3",
                        "value": volume,
                        "unit": "mm^3",
                        "scope": "subcortical",
                        "source_file": source_name,
                        "hemisphere": None,
                    }
                )
        if not metrics and not global_metrics:
            raise StructuralBiomarkerError(f"No usable aseg metrics could be parsed from {stats_file}")
        return metrics, global_metrics

    def parse_aparc_stats(self, stats_file: Path, hemisphere: str) -> tuple[list[dict], dict[str, float | int | str | None]]:
        if hemisphere not in {"lh", "rh"}:
            raise ValueError("hemisphere must be 'lh' or 'rh'")
        metrics: list[dict] = []
        global_metrics: dict[str, float | int | str | None] = {}
        self._last_measure_units = {}
        lines = Path(stats_file).read_text(encoding="utf-8").splitlines()
        column_headers: list[str] = []
        source_name = Path(stats_file).name
        metric_map = {
            "SurfArea": ("surface_area_mm2", "mm^2"),
            "GrayVol": ("gray_matter_volume_mm3", "mm^3"),
            "ThickAvg": ("mean_thickness_mm", "mm"),
            "ThickStd": ("thickness_std_mm", "mm"),
        }
        for raw_line in lines:
            line = raw_line.strip()
            if not line:
                continue
            if line.startswith("#"):
                match = _MEASURE_PATTERN.match(line)
                if match is not None:
                    measure_name, measure_field, _, measure_value, unit = match.groups()
                    metric_name = _normalize_measure_key(measure_name, measure_field, _normalize_unit(unit), hemisphere=hemisphere)
                    value = _safe_number(measure_value)
                    global_metrics[metric_name] = value if value is not None else measure_value.strip()
                    self._last_measure_units[metric_name] = _normalize_unit(unit)
                    continue
                if line.startswith("# ColHeaders"):
                    column_headers = line.replace("# ColHeaders", "", 1).strip().split()
                continue
            tokens = line.split()
            row = _row_from_tokens(tokens, column_headers, "aparc")
            if row is None:
                continue
            structure_name = str(row.get("StructName") or row.get("Struct") or "").strip()
            if not structure_name:
                continue
            for column_name, (metric_name, unit) in metric_map.items():
                value = _lookup_first_numeric(row, column_name)
                if value is None:
                    continue
                metrics.append(
                    {
                        "hemisphere": hemisphere,
                        "structure_name": structure_name,
                        "metric_name": metric_name,
                        "value": value,
                        "unit": unit,
                        "scope": "cortical",
                        "source_file": source_name,
                    }
                )
        if not metrics and not global_metrics:
            raise StructuralBiomarkerError(f"No usable cortical metrics could be parsed from {stats_file}")
        return metrics, global_metrics


def _normalize_identifier(value: str, field_name: str, prefix: str) -> str:
    text = value.strip()
    if not text:
        raise ValueError(f"{field_name} must not be empty")
    if text.startswith(prefix):
        text = text[len(prefix) :]
    if not text or any(character.isspace() for character in text):
        raise ValueError(f"{field_name} must be a non-empty identifier without whitespace")
    return text


def _safe_number(value: str) -> float | int | None:
    try:
        number = float(value.strip())
    except ValueError:
        return None
    if number.is_integer():
        return int(number)
    return number


def _normalize_unit(unit: str | None) -> str | None:
    if unit is None:
        return None
    aliases = {"mm3": "mm^3", "mm2": "mm^2", "count": "count", "unitless": None}
    return aliases.get(unit.strip(), unit.strip())


def _normalize_measure_key(
    measure_name: str,
    measure_field: str,
    unit: str | None,
    hemisphere: str | None = None,
) -> str:
    text = re.sub(r"(?<!^)(?=[A-Z])", "_", f"{measure_name}_{measure_field}")
    text = re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")
    aliases = {
        "brain_seg_brain_seg_vol": "brain_seg_volume_mm3",
        "estimated_total_intra_cranial_vol_estimated_total_intra_cranial_vol": "estimated_total_intracranial_volume_mm3",
        "cortex_mean_thickness": "cortex_mean_thickness_mm",
    }
    text = aliases.get(text, text)
    if text.endswith("_volume") and unit == "mm^3":
        text = f"{text}_mm3"
    if hemisphere is not None:
        text = f"{hemisphere}_{text}"
    return text


def _row_from_tokens(tokens: list[str], column_headers: list[str], kind: str) -> dict[str, Any] | None:
    if column_headers:
        if len(tokens) < len(column_headers):
            return None
        return {column_headers[index]: tokens[index] for index in range(len(column_headers))}
    if kind == "aseg":
        if len(tokens) < 5:
            return None
        return {
            "Index": tokens[0],
            "SegId": tokens[1],
            "NVoxels": tokens[2],
            "Volume_mm3": tokens[3],
            "StructName": tokens[4],
        }
    if kind == "aparc":
        if len(tokens) < 5:
            return None
        row = {
            "StructName": tokens[0],
            "NumVert": tokens[1],
            "SurfArea": tokens[2],
            "GrayVol": tokens[3],
            "ThickAvg": tokens[4],
        }
        if len(tokens) > 5:
            row["ThickStd"] = tokens[5]
        return row
    return None


def _lookup_first_numeric(row: dict[str, Any], *keys: str) -> float | int | None:
    for key in keys:
        if key in row:
            numeric = _safe_number(str(row[key]))
            if numeric is not None:
                return numeric
    return None


__all__ = [
    "FastSurferBiomarkerExtractor",
    "StructuralBiomarkerBundle",
    "StructuralBiomarkerError",
]
