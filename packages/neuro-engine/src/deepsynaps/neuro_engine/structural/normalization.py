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
        """Serialize the record into a plain dictionary."""

        return asdict(self)


class StructuralNormalizer:
    """Generate normalized and derived structural biomarker records.

    Lobe-level thickness uses a simple arithmetic mean across included cortical
    regions. That choice is explicit and reproducible, and avoids implying a
    weighted scheme that may not match all downstream protocols.
    """

    def __init__(self, volume_norm_scale: float = 1_000.0) -> None:
        """Store the scaling constant used for ICV-normalized volume metrics."""

        if volume_norm_scale <= 0:
            raise ValueError("volume_norm_scale must be positive")
        self.volume_norm_scale = float(volume_norm_scale)

    def normalize(self, bundle: StructuralBiomarkerBundle) -> list[NormalizedStructuralRecord]:
        """Compute normalized and derived structural records from one bundle."""

        if not bundle.aseg_metrics and not bundle.cortical_metrics and not bundle.global_metrics:
            raise StructuralNormalizationError("Structural biomarker bundle is empty")

        flat_records = bundle.to_flat_records()
        cortical_records = [record for record in flat_records if record.get("scope") == "cortical"]
        non_global_records = [record for record in flat_records if record.get("scope") != "global"]
        normalized_records: list[NormalizedStructuralRecord] = []
        icv = self._get_intracranial_volume(bundle)
        if icv is not None:
            normalized_records.extend(self._normalize_volumes_by_icv(flat_records, icv))

        normalized_records.extend(self._compute_hemisphere_normalized_measures(cortical_records))
        normalized_records.extend(self._compute_asymmetry_indices(non_global_records))
        normalized_records.extend(self._compute_lobe_aggregates(cortical_records))

        logger.info(
            "Generated %d normalized structural records for %s (icv_used=%s)",
            len(normalized_records),
            bundle.subject_id,
            icv is not None,
        )
        return normalized_records

    def _get_intracranial_volume(self, bundle: StructuralBiomarkerBundle) -> float | None:
        """Return the first plausible intracranial volume from bundle globals."""

        candidate_keys = [
            "EstimatedTotalIntraCranialVol",
            "eTIV",
            "sbTIV",
            "estimated_total_intracranial_volume_mm3",
            "estimated_total_intra_cranial_vol",
        ]
        for key in candidate_keys:
            raw = bundle.global_metrics.get(key)
            if isinstance(raw, (int, float)) and float(raw) > 0:
                return float(raw)
        logger.warning(
            "No intracranial volume metric found for %s; skipping ICV normalization",
            bundle.subject_id,
        )
        return None

    def _normalize_volumes_by_icv(
        self,
        records: list[dict],
        icv: float,
    ) -> list[NormalizedStructuralRecord]:
        """Create ICV-normalized metrics for volume records only."""

        normalized: list[NormalizedStructuralRecord] = []
        for record in records:
            if not self._is_volume_metric(record):
                continue
            value = record.get("value")
            if not isinstance(value, (int, float)):
                continue
            normalized.append(
                NormalizedStructuralRecord(
                    subject_id=str(record["subject_id"]),
                    session_id=record.get("session_id"),
                    modality=str(record.get("modality") or "sMRI"),
                    scope=str(record.get("scope") or "derived"),
                    hemisphere=record.get("hemisphere"),
                    structure_name=record.get("structure_name"),
                    metric_name=f"{record['metric_name']}_per_icv",
                    value=(float(value) / icv) * self.volume_norm_scale,
                    unit=f"{self._display_unit(record.get('unit'))}/icv"
                    if record.get("unit") is not None
                    else "per_icv",
                    source_metric_name=str(record["metric_name"]),
                    source_file=record.get("source_file"),
                )
            )
        return normalized

    def _compute_hemisphere_normalized_measures(
        self,
        records: list[dict],
    ) -> list[NormalizedStructuralRecord]:
        """Compute cortical volume fractions relative to hemisphere cortical totals."""

        normalized: list[NormalizedStructuralRecord] = []
        hemisphere_totals: dict[str, float] = {"lh": 0.0, "rh": 0.0}
        for record in records:
            hemisphere = record.get("hemisphere")
            if hemisphere not in hemisphere_totals:
                continue
            if record.get("metric_name") != "gray_matter_volume_mm3":
                continue
            value = record.get("value")
            if isinstance(value, (int, float)):
                hemisphere_totals[hemisphere] += float(value)

        for hemisphere, total in hemisphere_totals.items():
            if total <= 0:
                logger.warning(
                    "Missing or zero cortical hemisphere total for %s; skipping hemisphere fractions",
                    hemisphere,
                )
                continue
            for record in records:
                if record.get("hemisphere") != hemisphere:
                    continue
                if record.get("metric_name") != "gray_matter_volume_mm3":
                    continue
                value = record.get("value")
                if not isinstance(value, (int, float)):
                    continue
                normalized.append(
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
                        source_metric_name=str(record["metric_name"]),
                        source_file=record.get("source_file"),
                    )
                )
        return normalized

    def _compute_asymmetry_indices(
        self,
        records: list[dict],
    ) -> list[NormalizedStructuralRecord]:
        """Compute percent asymmetry indices for bilateral volume metrics."""

        normalized: list[NormalizedStructuralRecord] = []
        paired: dict[tuple[str, str], dict[str, dict]] = {}
        allowed_structures = {"hippocampus", "amygdala", "thalamus", "superiortemporal"}

        for record in records:
            if not self._is_volume_metric(record):
                continue
            base_name, hemisphere = self._extract_structure_side(record)
            if hemisphere is None:
                continue
            if not any(token in base_name for token in allowed_structures):
                continue
            metric_name = str(record.get("metric_name"))
            paired.setdefault((base_name, metric_name), {})[hemisphere] = record

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
                logger.warning(
                    "Zero bilateral total for asymmetry index of %s; skipping",
                    base_name,
                )
                continue
            normalized.append(
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
        return normalized

    def _compute_lobe_aggregates(
        self,
        records: list[dict],
    ) -> list[NormalizedStructuralRecord]:
        """Compute lobe-level cortical aggregates from a small DKT-style mapping."""

        lobe_mapping = {
            "frontal": {
                "superiorfrontal",
                "rostralmiddlefrontal",
                "caudalmiddlefrontal",
                "precentral",
                "parsopercularis",
                "parstriangularis",
                "parsorbitalis",
                "lateralorbitofrontal",
                "medialorbitofrontal",
                "frontalpole",
            },
            "parietal": {
                "postcentral",
                "superiorparietal",
                "inferiorparietal",
                "supramarginal",
                "precuneus",
            },
            "temporal": {
                "superiortemporal",
                "middletemporal",
                "inferiortemporal",
                "fusiform",
                "transversetemporal",
                "entorhinal",
                "temporalpole",
                "parahippocampal",
                "bankssts",
            },
            "occipital": {
                "lateraloccipital",
                "lingual",
                "cuneus",
                "pericalcarine",
            },
        }
        grouped: dict[tuple[str, str], dict[str, list[float] | float | str | None]] = {}

        for record in records:
            hemisphere = record.get("hemisphere")
            if hemisphere not in {"lh", "rh"}:
                continue
            base_region = self._base_structure_name(record.get("structure_name"))
            lobe_name = None
            for candidate_lobe, regions in lobe_mapping.items():
                if base_region in regions:
                    lobe_name = candidate_lobe
                    break
            if lobe_name is None:
                continue

            key = (lobe_name, hemisphere)
            bucket = grouped.setdefault(
                key,
                {
                    "subject_id": record.get("subject_id"),
                    "session_id": record.get("session_id"),
                    "source_file": record.get("source_file"),
                    "volume_sum": 0.0,
                    "thickness_values": [],
                },
            )
            if record.get("metric_name") == "gray_matter_volume_mm3" and isinstance(record.get("value"), (int, float)):
                bucket["volume_sum"] = float(bucket["volume_sum"]) + float(record["value"])
            if record.get("metric_name") == "mean_thickness_mm" and isinstance(record.get("value"), (int, float)):
                thickness_values = bucket["thickness_values"]
                assert isinstance(thickness_values, list)
                thickness_values.append(float(record["value"]))

        normalized: list[NormalizedStructuralRecord] = []
        for (lobe_name, hemisphere), bucket in grouped.items():
            subject_id = str(bucket["subject_id"])
            session_id = bucket["session_id"]
            source_file = bucket["source_file"]
            volume_sum = float(bucket["volume_sum"])
            if volume_sum > 0:
                normalized.append(
                    NormalizedStructuralRecord(
                        subject_id=subject_id,
                        session_id=session_id,
                        modality="sMRI",
                        scope="derived",
                        hemisphere=hemisphere,
                        structure_name=f"{lobe_name}_lobe",
                        metric_name="lobe_gray_matter_volume_mm3",
                        value=volume_sum,
                        unit="mm^3",
                        source_metric_name="gray_matter_volume_mm3",
                        source_file=source_file,
                    )
                )
            thickness_values = bucket["thickness_values"]
            assert isinstance(thickness_values, list)
            if thickness_values:
                normalized.append(
                    NormalizedStructuralRecord(
                        subject_id=subject_id,
                        session_id=session_id,
                        modality="sMRI",
                        scope="derived",
                        hemisphere=hemisphere,
                        structure_name=f"{lobe_name}_lobe",
                        metric_name="lobe_mean_thickness_mm",
                        value=sum(thickness_values) / len(thickness_values),
                        unit="mm",
                        source_metric_name="mean_thickness_mm",
                        source_file=source_file,
                    )
                )
        return normalized

    @staticmethod
    def _display_unit(unit: str | None) -> str:
        """Return a readable unit label for derived metrics."""

        return unit if unit is not None else "value"

    @staticmethod
    def _is_volume_metric(record: dict) -> bool:
        """Return whether a record represents a volume-like metric."""

        unit = record.get("unit")
        metric_name = str(record.get("metric_name") or "")
        return unit == "mm^3" or "volume_mm3" in metric_name.lower()

    @staticmethod
    def _base_structure_name(structure_name: str | None) -> str:
        """Normalize a structure name into a bilateral base name."""

        if structure_name is None:
            return ""
        text = structure_name.lower().strip()
        for prefix in ("lh_", "rh_", "left-", "right-", "left_", "right_"):
            if text.startswith(prefix):
                text = text[len(prefix) :]
                break
        text = text.replace("-", "").replace("_", "").replace(" ", "")
        if text.endswith("proper"):
            text = text[: -len("proper")]
        return text

    def _extract_structure_side(self, record: dict) -> tuple[str, str | None]:
        """Infer a bilateral base name and hemisphere code from one record."""

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
