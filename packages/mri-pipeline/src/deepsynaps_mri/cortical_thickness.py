"""
Cortical thickness — vertex/surface maps and atlas-aware regional summaries.

**Wrapped externally**
    * **FreeSurfer / FastSurfer** per-vertex thickness: ``surf/lh.thickness``,
      ``surf/rh.thickness`` (binary morph, ``nibabel.freesurfer.read_morph_data``).
    * **ANTs DiReCT**: ``ants.kelly_kapowski`` via ``adapters/ants_kelly_kapowski.py``
      (needs multi-label seg + GM/WM probability maps, e.g. from FSL FAST).

**Computed natively in Python**
    * Parsing **aparc.stats** (lh/rh) → regional mean thickness table.
    * **QC** statistics (global distribution, outliers) on vertex or volume maps.
    * Manifest / JSON artefacts for audit and reporting.

Decision-support biomarker context — not diagnostic. All outputs include
``provenance.engine`` and file paths for clinical audit trails.

See ``docs/CORTICAL_THICKNESS.md`` for algorithm notes and validation plan.
"""
from __future__ import annotations

import json
import logging
import shutil
from pathlib import Path
from typing import Literal

import numpy as np
from pydantic import BaseModel, Field

from .adapters.ants_kelly_kapowski import run_kelly_kapowski_thickness as _adapter_kk
from .validation import validate_nifti_header

log = logging.getLogger(__name__)

Hemisphere = Literal["lh", "rh"]


class VertexThicknessPaths(BaseModel):
    lh_thickness: str | None = None
    rh_thickness: str | None = None

    def to_dict(self) -> dict:
        return self.model_dump()


class CorticalThicknessComputeResult(BaseModel):
    ok: bool
    engine: Literal["freesurfer_surfaces", "ants_kelly_kapowski", "none"]
    atlas: str = "Desikan-Killiany"
    vertex_paths: VertexThicknessPaths = Field(default_factory=VertexThicknessPaths)
    """Per-vertex thickness on spherical inflated mesh topology (FS morph)."""
    volume_thickness_path: str | None = None
    """Optional voxel-wise thickness map (e.g. ANTs DiReCT)."""
    subject_dir: str | None = None
    manifest_path: str | None = None
    log_path: str | None = None
    adapter_details: dict | None = None
    validation: dict | None = None
    provenance_note: str = ""
    code: str = ""
    message: str = ""

    def to_dict(self) -> dict:
        return self.model_dump(mode="json")


class RegionalThicknessRow(BaseModel):
    region_id: str
    """Stable id, e.g. ``lh.bankssts`` from aparc.stats StructName."""
    hemisphere: Hemisphere
    mean_thickness_mm: float
    n_vertices: int | None = None
    surface_area_mm2: float | None = None

    def to_dict(self) -> dict:
        return self.model_dump()


class RegionalThicknessSummary(BaseModel):
    ok: bool
    atlas: str = "Desikan-Killiany"
    source: Literal["aparc_stats", "none"] = "aparc_stats"
    regions: list[RegionalThicknessRow] = Field(default_factory=list)
    manifest_path: str | None = None
    code: str = ""
    message: str = ""

    def to_dict(self) -> dict:
        return self.model_dump()


class ThicknessQCVertexMetrics(BaseModel):
    n_vertices_lh: int | None = None
    n_vertices_rh: int | None = None
    median_mm: float | None = None
    iqr_mm: float | None = None
    pct_below_1mm: float | None = None
    pct_above_6mm: float | None = None
    passes_sanity: bool = True

    def to_dict(self) -> dict:
        return self.model_dump()


class ThicknessQCReport(BaseModel):
    ok: bool
    domain: Literal["vertex", "volume"] = "vertex"
    metrics: ThicknessQCVertexMetrics = Field(default_factory=ThicknessQCVertexMetrics)
    json_path: str | None = None
    code: str = ""
    message: str = ""

    def to_dict(self) -> dict:
        return self.model_dump(mode="json")


def _root(artefacts_dir: Path) -> Path:
    d = artefacts_dir / "cortical_thickness"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _parse_aparc_stats_thickness(path: Path) -> list[RegionalThicknessRow]:
    """
    Parse FreeSurfer ``aparc.stats`` for per-parcel mean thickness.

    Uses ``# ColHeaders`` line to find ``ThickAvg`` column index.
    """
    text = path.read_text(encoding="utf-8", errors="replace").splitlines()
    col_headers: list[str] | None = None
    for line in text:
        if line.startswith("# ColHeaders"):
            parts = line.split()
            col_headers = parts[2:]  # drop # ColHeaders
            break
    if not col_headers:
        raise ValueError(f"No ColHeaders in {path}")

    try:
        i_thick = col_headers.index("ThickAvg")
        i_nv = col_headers.index("NumVert") if "NumVert" in col_headers else None
        i_area = col_headers.index("SurfArea") if "SurfArea" in col_headers else None
    except ValueError as exc:
        raise ValueError(f"Unexpected ColHeaders in {path}: {col_headers}") from exc

    hemi: Hemisphere = "lh" if path.name.startswith("lh.") else "rh"
    rows: list[RegionalThicknessRow] = []
    for line in text:
        if not line or line.startswith("#"):
            continue
        parts = line.split()
        if len(parts) <= i_thick:
            continue
        name = parts[0]
        try:
            thick = float(parts[i_thick])
        except ValueError:
            continue
        nv = int(parts[i_nv]) if i_nv is not None and len(parts) > i_nv else None
        area = float(parts[i_area]) if i_area is not None and len(parts) > i_area else None
        rows.append(
            RegionalThicknessRow(
                region_id=f"{hemi}.{name}",
                hemisphere=hemi,
                mean_thickness_mm=thick,
                n_vertices=nv,
                surface_area_mm2=area,
            )
        )
    return rows


def compute_cortical_thickness(
    artefacts_dir: str | Path,
    *,
    engine: Literal["freesurfer_surfaces", "ants_kelly_kapowski"] = "freesurfer_surfaces",
    subject_dir: str | Path | None = None,
    seg_nifti: str | Path | None = None,
    gm_pve_nifti: str | Path | None = None,
    wm_pve_nifti: str | Path | None = None,
    kk_its: int = 45,
    kk_gm_label: int = 2,
    kk_wm_label: int = 3,
    run_input_validation: bool = True,
) -> CorticalThicknessComputeResult:
    """
    Produce standardized thickness artefacts.

    * ``freesurfer_surfaces``: copy ``<subject_dir>/surf/{lh,rh}.thickness`` into
      ``cortical_thickness/fsnative/``.
    * ``ants_kelly_kapowski``: run DiREct; writes ``cortical_thickness/kelly_kapowski_thickness.nii.gz``.

    Segmentation labels for ANTs should match DeepSynaps FAST convention (2=GM, 3=WM)
    when using defaults.
    """
    root = Path(artefacts_dir).resolve()
    tdir = _root(root)
    log_dir = tdir / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = tdir / "cortical_thickness_manifest.json"

    if engine == "freesurfer_surfaces":
        if subject_dir is None:
            return CorticalThicknessComputeResult(
                ok=False,
                engine="none",
                code="subject_dir_required",
                message="subject_dir required for freesurfer_surfaces engine",
            )
        sd = Path(subject_dir).resolve()
        surf = sd / "surf"
        if not surf.is_dir():
            return CorticalThicknessComputeResult(
                ok=False,
                engine="none",
                subject_dir=str(sd),
                code="surf_dir_missing",
                message=f"No surf directory: {surf}",
            )
        dst = tdir / "fsnative"
        dst.mkdir(parents=True, exist_ok=True)
        out_lh = dst / "lh.thickness"
        out_rh = dst / "rh.thickness"
        src_lh = surf / "lh.thickness"
        src_rh = surf / "rh.thickness"
        if not src_lh.is_file() or not src_rh.is_file():
            return CorticalThicknessComputeResult(
                ok=False,
                engine="none",
                subject_dir=str(sd),
                code="thickness_missing",
                message=f"Expected {src_lh} and {src_rh}",
            )
        shutil.copy2(src_lh, out_lh)
        shutil.copy2(src_rh, out_rh)

        bundle = CorticalThicknessComputeResult(
            ok=True,
            engine="freesurfer_surfaces",
            atlas="Desikan-Killiany",
            vertex_paths=VertexThicknessPaths(
                lh_thickness=str(out_lh.resolve()),
                rh_thickness=str(out_rh.resolve()),
            ),
            subject_dir=str(sd),
            provenance_note=(
                "Per-vertex thickness from FreeSurfer/FastSurfer surface pipeline; "
                "regional DK summaries come from aparc.stats via summarize_regional_thickness."
            ),
            message="ok",
        )
        manifest_path.write_text(json.dumps(bundle.to_dict(), indent=2), encoding="utf-8")
        log.info("Cortical thickness (FS morph) staged under %s", dst)
        return bundle.model_copy(update={"manifest_path": str(manifest_path.resolve())})

    # ants_kelly_kapowski
    validation_dict: dict | None = None
    for label, p in (
        ("seg", seg_nifti),
        ("gm_pve", gm_pve_nifti),
        ("wm_pve", wm_pve_nifti),
    ):
        if p is None:
            return CorticalThicknessComputeResult(
                ok=False,
                engine="none",
                code="inputs_required",
                message="seg_nifti, gm_pve_nifti, wm_pve_nifti required for ants_kelly_kapowski",
            )

    sp = Path(seg_nifti).resolve()
    if run_input_validation:
        vr = validate_nifti_header(sp)
        validation_dict = vr.to_dict()
        if not vr.ok:
            return CorticalThicknessComputeResult(
                ok=False,
                engine="none",
                validation=validation_dict,
                code=vr.code or "validation_failed",
                message=vr.message,
            )

    out_vol = tdir / "kelly_kapowski_thickness.nii.gz"
    kk_log = log_dir / "kelly_kapowski.log"
    run = _adapter_kk(
        sp,
        Path(gm_pve_nifti).resolve(),
        Path(wm_pve_nifti).resolve(),
        out_vol,
        its=kk_its,
        gm_label=kk_gm_label,
        wm_label=kk_wm_label,
        log_path=kk_log,
    )

    if not run.ok:
        return CorticalThicknessComputeResult(
            ok=False,
            engine="ants_kelly_kapowski",
            volume_thickness_path=None,
            log_path=str(kk_log.resolve()) if kk_log.exists() else None,
            adapter_details=run.to_dict(),
            validation=validation_dict,
            code=run.code,
            message=run.message,
        )

    bundle = CorticalThicknessComputeResult(
        ok=True,
        engine="ants_kelly_kapowski",
        atlas="native_volume_DiReCT",
        volume_thickness_path=str(out_vol.resolve()),
        log_path=str(kk_log.resolve()),
        adapter_details=run.to_dict(),
        validation=validation_dict,
        provenance_note=(
            "Voxel-wise cortical thickness via ANTs KellyKapowski (DiReCT). "
            "Not on FS vertex grid — use for volume-based biomarkers or resample to surf separately."
        ),
        message="ok",
    )
    manifest_path.write_text(json.dumps(bundle.to_dict(), indent=2), encoding="utf-8")
    log.info("KellyKapowski thickness written: %s", out_vol)
    return bundle.model_copy(update={"manifest_path": str(manifest_path.resolve())})


def summarize_regional_thickness(
    subject_stats_dir: str | Path,
    artefacts_dir: str | Path,
    *,
    atlas: str = "Desikan-Killiany",
) -> RegionalThicknessSummary:
    """
    Parse ``lh.aparc.stats`` and ``rh.aparc.stats`` into a regional table.

    ``subject_stats_dir`` is typically ``<FreeSurfer_subject>/stats``.
    """
    sd = Path(subject_stats_dir).resolve()
    root = Path(artefacts_dir).resolve()
    tdir = _root(root)
    rows: list[RegionalThicknessRow] = []
    for name in ("lh.aparc.stats", "rh.aparc.stats"):
        p = sd / name
        if not p.is_file():
            return RegionalThicknessSummary(
                ok=False,
                atlas=atlas,
                source="none",
                code="aparc_missing",
                message=f"Missing {p}",
            )
        try:
            rows.extend(_parse_aparc_stats_thickness(p))
        except ValueError as exc:
            return RegionalThicknessSummary(
                ok=False,
                atlas=atlas,
                code="aparc_parse_failed",
                message=str(exc),
            )

    summary = RegionalThicknessSummary(
        ok=True,
        atlas=atlas,
        source="aparc_stats",
        regions=rows,
        message="ok",
    )
    out = tdir / "regional_thickness_summary.json"
    out.write_text(summary.model_dump_json(indent=2), encoding="utf-8")
    return summary.model_copy(update={"manifest_path": str(out.resolve())})


def compute_thickness_qc(
    *,
    lh_thickness_path: str | Path | None = None,
    rh_thickness_path: str | Path | None = None,
    volume_thickness_path: str | Path | None = None,
    artefacts_dir: str | Path,
    json_name: str = "cortical_thickness_qc.json",
) -> ThicknessQCReport:
    """
    QC on vertex morph files (FS) or a single volume map (ANTs).

    Vertex mode: concatenates lh+rh thickness values for global distribution stats.
    """
    try:
        import nibabel as nib
    except ImportError as exc:
        return ThicknessQCReport(ok=False, code="nibabel_missing", message=str(exc))

    root = Path(artefacts_dir).resolve()
    tdir = _root(root)
    jp = tdir / json_name

    if volume_thickness_path is not None:
        vp = Path(volume_thickness_path).resolve()
        if not vp.is_file():
            return ThicknessQCReport(ok=False, code="volume_missing", message=str(vp))
        try:
            data = np.asanyarray(nib.load(str(vp)).dataobj, dtype=np.float64).ravel()
            data = data[np.isfinite(data) & (data > 0)]
            if data.size < 100:
                return ThicknessQCReport(
                    ok=False,
                    domain="volume",
                    code="too_few_voxels",
                    message=f"Only {data.size} positive finite voxels",
                )
            q25, q50, q75 = np.percentile(data, [25, 50, 75])
            metrics = ThicknessQCVertexMetrics(
                n_vertices_lh=None,
                n_vertices_rh=None,
                median_mm=float(q50),
                iqr_mm=float(q75 - q25),
                pct_below_1mm=float(np.mean(data < 1.0) * 100.0),
                pct_above_6mm=float(np.mean(data > 6.0) * 100.0),
                passes_sanity=0.5 <= q50 <= 5.0,
            )
            report = ThicknessQCReport(ok=True, domain="volume", metrics=metrics, message="ok")
        except Exception as exc:  # noqa: BLE001
            log.exception("thickness QC volume failed")
            return ThicknessQCReport(ok=False, domain="volume", code="qc_failed", message=str(exc))
        jp.write_text(report.model_dump_json(indent=2), encoding="utf-8")
        return report.model_copy(update={"json_path": str(jp.resolve())})

    if lh_thickness_path is None or rh_thickness_path is None:
        return ThicknessQCReport(
            ok=False,
            code="paths_required",
            message="Provide lh_thickness_path and rh_thickness_path, or volume_thickness_path",
        )

    lp = Path(lh_thickness_path).resolve()
    rp = Path(rh_thickness_path).resolve()
    if not lp.is_file() or not rp.is_file():
        return ThicknessQCReport(ok=False, code="morph_missing", message=f"{lp} / {rp}")

    try:
        lh = nib.freesurfer.read_morph_data(str(lp))
        rh = nib.freesurfer.read_morph_data(str(rp))
        combined = np.concatenate([lh.astype(np.float64), rh.astype(np.float64)])
        combined = combined[np.isfinite(combined) & (combined > 0)]
        if combined.size < 100:
            return ThicknessQCReport(
                ok=False,
                code="too_few_vertices",
                message=f"Only {combined.size} positive vertices",
            )
        q25, q50, q75 = np.percentile(combined, [25, 50, 75])
        metrics = ThicknessQCVertexMetrics(
            n_vertices_lh=int(lh.shape[0]),
            n_vertices_rh=int(rh.shape[0]),
            median_mm=float(q50),
            iqr_mm=float(q75 - q25),
            pct_below_1mm=float(np.mean(combined < 1.0) * 100.0),
            pct_above_6mm=float(np.mean(combined > 6.0) * 100.0),
            passes_sanity=0.5 <= q50 <= 5.0,
        )
        report = ThicknessQCReport(ok=True, domain="vertex", metrics=metrics, message="ok")
        jp.write_text(report.model_dump_json(indent=2), encoding="utf-8")
        return report.model_copy(update={"json_path": str(jp.resolve())})
    except Exception as exc:  # noqa: BLE001
        log.exception("thickness QC vertex failed")
        return ThicknessQCReport(ok=False, code="qc_failed", message=str(exc))


__all__ = [
    "CorticalThicknessComputeResult",
    "RegionalThicknessRow",
    "RegionalThicknessSummary",
    "ThicknessQCReport",
    "VertexThicknessPaths",
    "compute_cortical_thickness",
    "compute_thickness_qc",
    "summarize_regional_thickness",
]
