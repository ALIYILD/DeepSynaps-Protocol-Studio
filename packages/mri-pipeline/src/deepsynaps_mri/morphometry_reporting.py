"""
Regional morphometry aggregation — parse stats tables into report-ready structures.

Normative z-scores remain ``None`` until a licensed norm database is configured.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

from .schemas import (
    AsymmetryIndexRow,
    AsymmetryResult,
    MRIAnalysisReportPayload,
    MRIReport,
    MorphometryProvenance,
    MorphometrySummary,
    NormedValue,
    RegionalVolumeRow,
    RegionalVolumesResult,
    StructuralMetrics,
)

log = logging.getLogger(__name__)


def compute_regional_volumes(
    *,
    artefacts_dir: str | Path,
    aseg_stats_path: str | Path | None = None,
    synthseg_csv_path: str | Path | None = None,
) -> RegionalVolumesResult:
    """Load regional volumes from ``aseg.stats`` or SynthSeg ``volumes.csv``."""
    root = Path(artefacts_dir)
    rows: list[RegionalVolumeRow] = []
    man = root / "morphometry" / "regional_volumes_manifest.json"
    man.parent.mkdir(parents=True, exist_ok=True)

    if aseg_stats_path and Path(aseg_stats_path).is_file():
        from . import structural_stats as ss

        vols, _ = ss.parse_aseg_stats(Path(aseg_stats_path))
        for name, mm3 in vols.items():
            rows.append(RegionalVolumeRow(region=name, volume_mm3=mm3, source="aseg.stats"))
        payload = {"source": "aseg.stats", "path": str(Path(aseg_stats_path).resolve()), "n": len(rows)}
    elif synthseg_csv_path and Path(synthseg_csv_path).is_file():
        from . import structural_stats as ss

        vols = ss.parse_synthseg_volumes_csv(Path(synthseg_csv_path))
        for name, mm3 in vols.items():
            rows.append(RegionalVolumeRow(region=name, volume_mm3=mm3, source="volumes.csv"))
        payload = {"source": "volumes.csv", "path": str(Path(synthseg_csv_path).resolve()), "n": len(rows)}
    else:
        return RegionalVolumesResult(ok=False, message="no_volume_source")

    man.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return RegionalVolumesResult(
        ok=True,
        rows=rows,
        manifest_path=str(man.resolve()),
        message="ok",
    )


_LR_PAIRS: tuple[tuple[str, str, str], ...] = (
    ("Left-Hippocampus", "Right-Hippocampus", "Hippocampus"),
    ("Left-Thalamus-Proper", "Right-Thalamus-Proper", "Thalamus"),
    ("Left-Putamen", "Right-Putamen", "Putamen"),
)


def compute_asymmetry_indices(volumes_mm3: dict[str, float]) -> list[tuple[str, float]]:
    """Simple |L-R| / (L+R) asymmetry for paired aseg names."""
    out: list[tuple[str, float]] = []
    for left, right, label in _LR_PAIRS:
        l_v = volumes_mm3.get(left)
        r_v = volumes_mm3.get(right)
        if l_v is None or r_v is None or (l_v + r_v) <= 0:
            continue
        ai = abs(l_v - r_v) / (l_v + r_v)
        out.append((label, float(ai)))
    return out


def summarize_morphometry(
    volumes: RegionalVolumesResult,
    *,
    artefacts_dir: str | Path | None = None,
) -> MorphometrySummary:
    """QC flags + provenance envelope from regional volumes."""
    flags: list[str] = []
    prov = MorphometryProvenance(sources=[], notes=[])

    if not volumes.ok or not volumes.rows:
        flags.append("no_regional_volumes")
        return MorphometrySummary(
            regional_volumes=volumes,
            qc_flags=flags,
            provenance=prov,
        )

    vd = {r.region: r.volume_mm3 for r in volumes.rows}
    pairs = compute_asymmetry_indices(vd)
    asym_rows = [
        AsymmetryIndexRow(structure_pair=a[0], asymmetry_index=a[1])
        for a in pairs
    ]

    for _, ai in pairs:
        if ai > 0.15:
            flags.append("high_asymmetry_hint")

    prov.sources.append(volumes.manifest_path or "inline")
    return MorphometrySummary(
        regional_volumes=volumes,
        asymmetry=AsymmetryResult(ok=True, rows=asym_rows, message="ok"),
        qc_flags=flags,
        provenance=prov,
    )


def generate_mri_analysis_report_payload(
    base_report: MRIReport,
    *,
    artefacts_dir: str | Path | None = None,
    aseg_stats_path: str | Path | None = None,
    synthseg_csv_path: str | Path | None = None,
) -> MRIAnalysisReportPayload:
    """Merge morphometry tables into an extended payload (additive structural merge)."""
    root_dir = artefacts_dir or Path(".")
    vols = compute_regional_volumes(
        artefacts_dir=root_dir,
        aseg_stats_path=aseg_stats_path,
        synthseg_csv_path=synthseg_csv_path,
    )
    morph = summarize_morphometry(vols, artefacts_dir=root_dir)

    struct = base_report.structural or StructuralMetrics()
    if vols.ok:
        for row in vols.rows:
            struct.subcortical_volume_mm3[row.region] = NormedValue(
                value=row.volume_mm3,
                unit="mm^3",
                z=None,
                flagged=False,
                model_id=row.source or "morphometry_reporting",
            )

    report_out = base_report.model_copy(update={"structural": struct})
    root = str(Path(root_dir).resolve()) if artefacts_dir else None
    return MRIAnalysisReportPayload(
        report=report_out,
        morphometry=morph,
        artefacts_root=root,
    )


__all__ = [
    "compute_regional_volumes",
    "compute_asymmetry_indices",
    "summarize_morphometry",
    "generate_mri_analysis_report_payload",
]
