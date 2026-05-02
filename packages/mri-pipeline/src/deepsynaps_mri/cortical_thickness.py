"""
Cortical thickness — regional summaries from FreeSurfer-style ``aparc.stats``.

Vertex-wise maps (``surf/lh.thickness``) are produced by FastSurfer; this module
aggregates Desikan–Killiany region means from ``lh.aparc.stats`` / ``rh.aparc.stats``
and emits QC scalars + manifests (aligned with :mod:`deepsynaps_mri.structural_stats`).
"""
from __future__ import annotations

import json
import statistics
from pathlib import Path

from pydantic import BaseModel, Field

from . import structural_stats as ss


class CorticalThicknessResult(BaseModel):
    ok: bool
    lh_stats_path: str | None = None
    rh_stats_path: str | None = None
    vertex_thickness_path: str | None = None
    manifest_path: str | None = None
    message: str = ""


class RegionalThicknessSummary(BaseModel):
    ok: bool
    region_mean_mm: dict[str, float] = Field(default_factory=dict)
    global_mean_mm: float | None = None
    global_std_mm: float | None = None
    n_regions: int = 0
    manifest_path: str | None = None
    message: str = ""


class ThicknessQCMetrics(BaseModel):
    global_mean_mm: float | None = None
    global_std_mm: float | None = None
    n_regions: int = 0
    min_region_mm: float | None = None
    max_region_mm: float | None = None


class ThicknessQCReport(BaseModel):
    ok: bool
    metrics: ThicknessQCMetrics = Field(default_factory=ThicknessQCMetrics)
    manifest_path: str | None = None
    message: str = ""


def compute_cortical_thickness(
    stats_dir: str | Path,
    artefacts_dir: str | Path,
    *,
    vertex_thickness_path: str | Path | None = None,
) -> CorticalThicknessResult:
    """
    Record aparc stats paths and optional vertex thickness map for provenance.

    Does not compute thickness (that is done by FastSurfer); this step binds
    artefacts for downstream reporting.
    """
    sd = Path(stats_dir)
    root = Path(artefacts_dir) / "cortical_thickness"
    root.mkdir(parents=True, exist_ok=True)
    man = root / "thickness_sources_manifest.json"

    lh_p = sd / "lh.aparc.stats"
    rh_p = sd / "rh.aparc.stats"
    vtx = Path(vertex_thickness_path).resolve() if vertex_thickness_path else None

    payload = {
        "lh_aparc_stats": str(lh_p.resolve()) if lh_p.is_file() else None,
        "rh_aparc_stats": str(rh_p.resolve()) if rh_p.is_file() else None,
        "vertex_thickness": str(vtx) if vtx and vtx.is_file() else None,
    }
    man.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    if not lh_p.is_file() and not rh_p.is_file():
        return CorticalThicknessResult(
            ok=False,
            manifest_path=str(man.resolve()),
            message="missing_aparc_stats",
        )

    return CorticalThicknessResult(
        ok=True,
        lh_stats_path=str(lh_p.resolve()) if lh_p.is_file() else None,
        rh_stats_path=str(rh_p.resolve()) if rh_p.is_file() else None,
        vertex_thickness_path=str(vtx) if vtx and vtx.is_file() else None,
        manifest_path=str(man.resolve()),
        message="ok",
    )


def summarize_regional_thickness(
    stats_dir: str | Path,
    artefacts_dir: str | Path | None = None,
) -> RegionalThicknessSummary:
    """Mean thickness per DK region (``lh_*`` / ``rh_*`` prefixes)."""
    sd = Path(stats_dir)
    lh_p = sd / "lh.aparc.stats"
    rh_p = sd / "rh.aparc.stats"
    combined: dict[str, float] = {}

    if lh_p.is_file():
        for name, t in ss.parse_aparc_stats_thickness(lh_p).items():
            combined[f"lh_{name}"] = float(t)
    if rh_p.is_file():
        for name, t in ss.parse_aparc_stats_thickness(rh_p).items():
            combined[f"rh_{name}"] = float(t)

    vals = list(combined.values())
    g_mean = float(statistics.mean(vals)) if vals else None
    g_std = float(statistics.pstdev(vals)) if len(vals) > 1 else None

    man_path = None
    if artefacts_dir is not None:
        root = Path(artefacts_dir) / "cortical_thickness"
        root.mkdir(parents=True, exist_ok=True)
        man_path = root / "regional_thickness_summary.json"
        man_path.write_text(
            json.dumps(
                {
                    "region_mean_mm": combined,
                    "global_mean_mm": g_mean,
                    "global_std_mm": g_std,
                    "n_regions": len(combined),
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        man_path = str(man_path.resolve())

    if not combined:
        return RegionalThicknessSummary(ok=False, message="no_aparc_stats", manifest_path=man_path)

    return RegionalThicknessSummary(
        ok=True,
        region_mean_mm=combined,
        global_mean_mm=g_mean,
        global_std_mm=g_std,
        n_regions=len(combined),
        manifest_path=man_path,
        message="ok",
    )


def compute_thickness_qc(
    stats_dir: str | Path,
    artefacts_dir: str | Path,
) -> ThicknessQCReport:
    """Global thickness statistics + min/max region mean for QC dashboards."""
    summary = summarize_regional_thickness(stats_dir, artefacts_dir=None)
    root = Path(artefacts_dir) / "cortical_thickness"
    root.mkdir(parents=True, exist_ok=True)
    man = root / "thickness_qc.json"

    if not summary.ok or not summary.region_mean_mm:
        report = ThicknessQCReport(ok=False, message=summary.message or "no_data")
        man.write_text(json.dumps({"ok": False, "message": report.message}, indent=2), encoding="utf-8")
        return report

    vals = list(summary.region_mean_mm.values())
    metrics = ThicknessQCMetrics(
        global_mean_mm=summary.global_mean_mm,
        global_std_mm=summary.global_std_mm,
        n_regions=summary.n_regions,
        min_region_mm=min(vals),
        max_region_mm=max(vals),
    )
    man.write_text(json.dumps(metrics.model_dump(), indent=2), encoding="utf-8")
    return ThicknessQCReport(
        ok=True,
        metrics=metrics,
        manifest_path=str(man.resolve()),
        message="ok",
    )


__all__ = [
    "CorticalThicknessResult",
    "RegionalThicknessSummary",
    "ThicknessQCMetrics",
    "ThicknessQCReport",
    "compute_cortical_thickness",
    "summarize_regional_thickness",
    "compute_thickness_qc",
]
