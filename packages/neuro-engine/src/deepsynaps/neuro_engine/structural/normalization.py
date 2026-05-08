"""Normalization and derived structural metrics for DeepSynaps Neuro Engine.

Intracranial volume estimates such as eTIV or sbTIV are commonly used to
normalize regional brain volumes so measurements better account for overall
head size. Asymmetry indices quantify left-right differences as a percentage of
the combined structure volume. This module computes normalization and derived
metrics only; interpretation is intentionally left to higher-level DeepSynaps
components.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
import logging

from .biomarkers import StructuralBiomarkerBundle

logger = logging.getLogger(__name__)


class StructuralNormalizationError(RuntimeError):
    """Raised when structural biomarker normalization cannot proceed safely."""


@dataclass(slots=True)
class NormalizedStructuralRecord:
    """One normalized or derived structural biomarker record."""

    subject_id: str
    session_id: str | None
    modality: str
    scope: str
    hemisphere: str | None
    structure_name: str | None
    metric_name: str
    value: float
    unit: str | None
    source_metric_name: str | None
    source_file: str | None

    def to_dict(self) -> dict[str, str | float | None]:
        return asdict(self)


class StructuralNormalizer:
    """Generate normalized and derived structural biomarker records."""

    def __init__(self, volume_norm_scale: float = 1_000.0) -> None:
        if volume_norm_scale <= 0:
            raise ValueError("volume_norm_scale must be positive")
        self.volume_norm_scale = float(volume_norm_scale)

    def normalize(self, bundle: StructuralBiomarkerBundle) -> list[NormalizedStructuralRecord]:
        if not bundle.aseg_metrics and not bundle.cortical_metrics and not bundle.global_metrics:
            raise StructuralNormalizationError("Structural biomarker bundle is empty")
        flat_records = bundle.to_flat_records()
        cortical_records = [record for record in flat_records if record.get("scope") == "cortical"]
        non_global_records = [record for record in flat_records if record.get("scope") != "global"]
        normalized: list[NormalizedStructuralRecord] = []
        icv = self._get_intracranial_volume(bundle)
        if icv is not None:
            normalized.extend(self._normalize_volumes_by_icv(flat_records, icv))
        normalized.extend(self._compute_hemisphere_normalized_measures(cortical_records))
        normalized.extend(self._compute_asymmetry_indices(non_global_records))
        normalized.extend(self._compute_lobe_aggregates(cortical_records))
        return normalized

    def _get_intracranial_volume(self, bundle: StructuralBiomarkerBundle) -> float | None:
        for key in (
            "EstimatedTotalIntraCranialVol",
            "eTIV",
            "sbTIV",
            "estimated_total_intracranial_volume_mm3",
        ):
            raw = bundle.global_metrics.get(key)
            if isinstance(raw, (int, float)) and float(raw) > 0:
                return float(raw)
        logger.warning("No intracranial volume metric found for %s; skipping ICV normalization", bundle.subject_id)
        return None

    def _normalize_volumes_by_icv(self, records: list[dict], icv: float) -> list[NormalizedStructuralRecord]:
        output: list[NormalizedStructuralRecord] = []
        for record in records:
            if not self._is_volume_metric(record):
                continue
            value = record.get("value")
            if not isinstance(value, (int, float)):
                continue
            output.append(
                NormalizedStructuralRecord(
                    subject_id=str(record["subject_id"]),
                    session_id=record.get("session_id"),
                    modality=str(record.get("modality") or "sMRI"),
                    scope=str(record.get("scope") or "derived"),
                    hemisphere=record.get("hemisphere"),
                    structure_name=record.get("structure_name"),
                    metric_name=f"{record['metric_name']}_per_icv",
                    value=(float(value) / icv) * self.volume_norm_scale,
                    unit=f"{record.get('unit')}/icv" if record.get("unit") else "per_icv",
                    source_metric_name=str(record["metric_name"]),
                    source_file=record.get("source_file"),
                )
            )
        return output

    def _compute_hemisphere_normalized_measures(self, records: list[dict]) -> list[NormalizedStructuralRecord]:
        output: list[NormalizedStructuralRecord] = []
        hemisphere_totals = {"lh": 0.0, "rh": 0.0}
        for record in records:
            if record.get("metric_name") == "gray_matter_volume_mm3" and isinstance(record.get("value"), (int, float)):
                hemisphere = record.get("hemisphere")
                if hemisphere in hemisphere_totals:
                    hemisphere_totals[hemisphere] += float(record["value"])
        for hemisphere, total in hemisphere_totals.items():
            if total <= 0:
                logger.warning("Missing or zero cortical hemisphere total for %s; skipping hemisphere fractions", hemisphere)
                continue
            for record in records:
                if record.get("hemisphere") != hemisphere or record.get("metric_name") != "gray_matter_volume_mm3":
                    continue
                value = record.get("value")
                if not isinstance(value, (int, float)):
                    continue
                output.append(
                    NormalizedStructuralRecord(
                        subject_id=str(record["subject_id"]),
                        session_id=record.get("session_id"),
                        modality="sMRI",
                        scope="cortical",
                        hemisphere=hemisphere,
                        structure_name=record.get("structure_name"),
                        metric_name="gray_matter_volume_mm3_fraction_of_hemisphere",
                        value=float(value) / total,
                        unit="fraction",
                        source_metric_name="gray_matter_volume_mm3",
                        source_file=record.get("source_file"),
                    )
                )
        return output

    def _compute_asymmetry_indices(self, records: list[dict]) -> list[NormalizedStructuralRecord]:
        output: list[NormalizedStructuralRecord] = []
        paired: dict[tuple[str, str], dict[str, dict]] = {}
        allowed = {"hippocampus", "amygdala", "thalamus", "superiortemporal"}
        for record in records:
            if not self._is_volume_metric(record):
                continue
            base_name, hemisphere = self._extract_structure_side(record)
            if hemisphere is None or not any(token in base_name for token in allowed):
                continue
            paired.setdefault((base_name, str(record["metric_name"])), {})[hemisphere] = record
        for (base_name, metric_name), sides in paired.items():
            left = sides.get("lh")
            right = sides.get("rh")
            if left is None or right is None:
                continue
            left_value = left.get("value")
            right_value = right.get("value")
            if not isinstance(left_value, (int, float)) or not isinstance(right_value, (int, float)):
                continue
            total = float(left_value) + float(right_value)
            if total == 0:
                logger.warning("Zero bilateral total for asymmetry index of %s; skipping", base_name)
                continue
            output.append(
                NormalizedStructuralRecord(
                    subject_id=str(left["subject_id"]),
                    session_id=left.get("session_id"),
                    modality="sMRI",
                    scope="derived",
                    hemisphere=None,
                    structure_name=base_name,
                    metric_name="asymmetry_index_percent",
                    value=(abs(float(left_value) - float(right_value)) / total) * 100.0,
                    unit="%",
                    source_metric_name=metric_name,
                    source_file=left.get("source_file") or right.get("source_file"),
                )
            )
        return output

    def _compute_lobe_aggregates(self, records: list[dict]) -> list[NormalizedStructuralRecord]:
        output: list[NormalizedStructuralRecord] = []
        lobe_mapping = {
            "frontal": {"precentral", "superiorfrontal", "rostralmiddlefrontal", "caudalmiddlefrontal"},
            "parietal": {"postcentral", "superiorparietal", "inferiorparietal", "supramarginal", "precuneus"},
            "temporal": {"superiortemporal", "middletemporal", "inferiortemporal", "fusiform", "entorhinal", "parahippocampal"},
            "occipital": {"lateraloccipital", "lingual", "cuneus", "pericalcarine"},
        }
        grouped: dict[tuple[str, str], dict[str, object]] = {}
        for record in records:
            hemisphere = record.get("hemisphere")
            if hemisphere not in {"lh", "rh"}:
                continue
            base_region = self._base_structure_name(record.get("structure_name"))
            lobe_name = None
            for candidate, labels in lobe_mapping.items():
                if base_region in labels:
                    lobe_name = candidate
                    break
            if lobe_name is None:
                continue
            bucket = grouped.setdefault(
                (lobe_name, hemisphere),
                {
                    "subject_id": record.get("subject_id"),
                    "session_id": record.get("session_id"),
                    "source_file": record.get("source_file"),
                    "volume_sum": 0.0,
                    "thickness_values": [],
                },
            )
            if record.get("metric_name") == "gray_matter_volume_mm3" and isinstance(record.get("value"), (int, float)):
                bucket["volume_sum"] = float(bucket["volume_sum"]) + float(record["value"])  # type: ignore[index]
            if record.get("metric_name") == "mean_thickness_mm" and isinstance(record.get("value"), (int, float)):
                thickness_values = bucket["thickness_values"]  # type: ignore[index]
                assert isinstance(thickness_values, list)
                thickness_values.append(float(record["value"]))
        for (lobe_name, hemisphere), bucket in grouped.items():
            subject_id = str(bucket["subject_id"])  # type: ignore[index]
            session_id = bucket["session_id"]  # type: ignore[index]
            source_file = bucket["source_file"]  # type: ignore[index]
            volume_sum = float(bucket["volume_sum"])  # type: ignore[index]
            if volume_sum > 0:
                output.append(
                    NormalizedStructuralRecord(
                        subject_id=subject_id,
                        session_id=session_id,  # type: ignore[arg-type]
                        modality="sMRI",
                        scope="derived",
                        hemisphere=hemisphere,
                        structure_name=f"{lobe_name}_lobe",
                        metric_name="lobe_gray_matter_volume_mm3",
                        value=volume_sum,
                        unit="mm^3",
                        source_metric_name="gray_matter_volume_mm3",
                        source_file=source_file,  # type: ignore[arg-type]
                    )
                )
            thickness_values = bucket["thickness_values"]  # type: ignore[index]
            assert isinstance(thickness_values, list)
            if thickness_values:
                output.append(
                    NormalizedStructuralRecord(
                        subject_id=subject_id,
                        session_id=session_id,  # type: ignore[arg-type]
                        modality="sMRI",
                        scope="derived",
                        hemisphere=hemisphere,
                        structure_name=f"{lobe_name}_lobe",
                        metric_name="lobe_mean_thickness_mm",
                        value=sum(thickness_values) / len(thickness_values),
                        unit="mm",
                        source_metric_name="mean_thickness_mm",
                        source_file=source_file,  # type: ignore[arg-type]
                    )
                )
        return output

    @staticmethod
    def _is_volume_metric(record: dict) -> bool:
        return record.get("unit") == "mm^3" or "volume_mm3" in str(record.get("metric_name", "")).lower()

    @staticmethod
    def _base_structure_name(structure_name: str | None) -> str:
        if structure_name is None:
            return ""
        text = str(structure_name).lower().strip()
        for prefix in ("lh_", "rh_", "left-", "right-", "left_", "right_"):
            if text.startswith(prefix):
                text = text[len(prefix):]
                break
        text = text.replace("-", "").replace("_", "").replace(" ", "")
        if text.endswith("proper"):
            text = text[:-6]
        return text

    def _extract_structure_side(self, record: dict) -> tuple[str, str | None]:
        hemisphere = record.get("hemisphere")
        structure_name = str(record.get("structure_name") or "")
        lowered = structure_name.lower()
        if hemisphere in {"lh", "rh"}:
            return self._base_structure_name(structure_name), hemisphere
        if lowered.startswith("left-") or lowered.startswith("left_"):
            return self._base_structure_name(structure_name), "lh"
        if lowered.startswith("right-") or lowered.startswith("right_"):
            return self._base_structure_name(structure_name), "rh"
        return self._base_structure_name(structure_name), None


__all__ = [
    "NormalizedStructuralRecord",
    "StructuralNormalizationError",
    "StructuralNormalizer",
]
