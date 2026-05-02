"""
Cortical surface reconstruction — FastSurfer-oriented façade (no ``recon-all``).

Surfaces are produced by FastSurfer's cortical pipeline when ``parallel=True``
(see :func:`deepsynaps_mri.structural.run_fastsurfer`). This module records
paths, copies meshes for downstream tools, and emits lightweight QC manifests.
"""
from __future__ import annotations

import json
import logging
import shutil
from pathlib import Path

from pydantic import BaseModel, Field

from . import structural as structural_mod

log = logging.getLogger(__name__)

_SURF_NAMES = ("lh.white", "rh.white", "lh.pial", "rh.pial")


class CorticalSurfaceReconstructionResult(BaseModel):
    ok: bool
    subject_dir: str | None = None
    surf_dir: str | None = None
    lh_white: str | None = None
    rh_white: str | None = None
    lh_pial: str | None = None
    rh_pial: str | None = None
    manifest_path: str | None = None
    message: str = ""
    engine: str = "fastsurfer"


class SurfaceMeshExportResult(BaseModel):
    ok: bool
    export_dir: str | None = None
    exported_paths: list[str] = Field(default_factory=list)
    manifest_path: str | None = None
    message: str = ""


class SurfaceQCMetrics(BaseModel):
    n_expected_surfaces: int = 4
    n_present: int = 0
    missing: list[str] = Field(default_factory=list)
    total_bytes: int | None = None


class SurfaceQCReport(BaseModel):
    ok: bool
    metrics: SurfaceQCMetrics = Field(default_factory=SurfaceQCMetrics)
    manifest_path: str | None = None
    message: str = ""


def reconstruct_cortical_surfaces(
    t1_path: str | Path,
    artefacts_dir: str | Path,
    subject_id: str,
    *,
    force_rerun: bool = False,
) -> CorticalSurfaceReconstructionResult:
    """
    Run FastSurfer segmentation/surfaces and capture surface paths under ``subject_id/``.

    Uses :func:`deepsynaps_mri.structural.run_fastsurfer`; requires GPU FastSurfer
    install when surfaces are not already present.
    """
    root = Path(artefacts_dir)
    seg_root = root / "segmentation"
    seg_root.mkdir(parents=True, exist_ok=True)
    out_dir = seg_root
    sdir = out_dir / subject_id
    surf = sdir / "surf"

    manifest_dir = root / "cortical_surfaces"
    manifest_dir.mkdir(parents=True, exist_ok=True)
    man_path = manifest_dir / "reconstruct_manifest.json"

    def _paths_ok() -> bool:
        return surf.is_dir() and all((surf / n).is_file() for n in _SURF_NAMES)

    if _paths_ok() and not force_rerun:
        payload = {
            "skipped_run": True,
            "subject_dir": str(sdir.resolve()),
            "surf_dir": str(surf.resolve()),
        }
        man_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        return CorticalSurfaceReconstructionResult(
            ok=True,
            subject_dir=str(sdir.resolve()),
            surf_dir=str(surf.resolve()),
            lh_white=str((surf / "lh.white").resolve()),
            rh_white=str((surf / "rh.white").resolve()),
            lh_pial=str((surf / "lh.pial").resolve()),
            rh_pial=str((surf / "rh.pial").resolve()),
            manifest_path=str(man_path.resolve()),
            message="surfaces_already_present",
        )

    try:
        structural_mod.run_fastsurfer(Path(t1_path), out_dir, subject_id)
    except Exception as exc:  # noqa: BLE001
        log.warning("reconstruct_cortical_surfaces failed: %s", exc)
        err_payload = {"ok": False, "error": str(exc)}
        man_path.write_text(json.dumps(err_payload, indent=2), encoding="utf-8")
        return CorticalSurfaceReconstructionResult(
            ok=False,
            manifest_path=str(man_path.resolve()),
            message=str(exc),
        )

    if not _paths_ok():
        msg = "fastsurfer_finished_but_surfaces_missing"
        man_path.write_text(json.dumps({"ok": False, "error": msg}, indent=2), encoding="utf-8")
        return CorticalSurfaceReconstructionResult(
            ok=False,
            subject_dir=str(sdir.resolve()) if sdir.is_dir() else None,
            manifest_path=str(man_path.resolve()),
            message=msg,
        )

    payload = {
        "tool": "fastsurfer",
        "subject_dir": str(sdir.resolve()),
        "surf_dir": str(surf.resolve()),
        "surfaces": [str((surf / n).resolve()) for n in _SURF_NAMES],
    }
    man_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return CorticalSurfaceReconstructionResult(
        ok=True,
        subject_dir=str(sdir.resolve()),
        surf_dir=str(surf.resolve()),
        lh_white=str((surf / "lh.white").resolve()),
        rh_white=str((surf / "rh.white").resolve()),
        lh_pial=str((surf / "lh.pial").resolve()),
        rh_pial=str((surf / "rh.pial").resolve()),
        manifest_path=str(man_path.resolve()),
        message="ok",
    )


def export_surface_meshes(
    surf_dir: str | Path,
    export_dir: str | Path,
    *,
    names: tuple[str, ...] = _SURF_NAMES,
) -> SurfaceMeshExportResult:
    """Copy selected FreeSurfer-style surface files into ``export_dir``."""
    src = Path(surf_dir)
    dst_root = Path(export_dir)
    dst_root.mkdir(parents=True, exist_ok=True)
    exported: list[str] = []
    missing: list[str] = []
    for n in names:
        p = src / n
        if not p.is_file():
            missing.append(n)
            continue
        dest = dst_root / n
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(p, dest)
        exported.append(str(dest.resolve()))

    man = dst_root / "surface_export_manifest.json"
    man.write_text(
        json.dumps({"source_surf_dir": str(src.resolve()), "exported": exported, "missing": missing}, indent=2),
        encoding="utf-8",
    )
    if missing and not exported:
        return SurfaceMeshExportResult(
            ok=False,
            export_dir=str(dst_root.resolve()),
            exported_paths=exported,
            manifest_path=str(man.resolve()),
            message=f"missing_surfaces:{','.join(missing)}",
        )
    return SurfaceMeshExportResult(
        ok=True,
        export_dir=str(dst_root.resolve()),
        exported_paths=exported,
        manifest_path=str(man.resolve()),
        message="ok" if not missing else f"partial_missing:{','.join(missing)}",
    )


def compute_surface_qc(
    surf_dir: str | Path,
    artefacts_dir: str | Path,
    *,
    expected: tuple[str, ...] = _SURF_NAMES,
) -> SurfaceQCReport:
    """Existence and byte-size QC for expected surface files."""
    sdir = Path(surf_dir)
    root = Path(artefacts_dir) / "cortical_surfaces"
    root.mkdir(parents=True, exist_ok=True)
    man = root / "surface_qc.json"

    missing: list[str] = []
    total = 0
    for n in expected:
        p = sdir / n
        if not p.is_file():
            missing.append(n)
            continue
        total += p.stat().st_size

    n_present = len(expected) - len(missing)
    metrics = SurfaceQCMetrics(
        n_expected_surfaces=len(expected),
        n_present=n_present,
        missing=missing,
        total_bytes=total if n_present else None,
    )
    ok = n_present == len(expected)
    report = SurfaceQCReport(
        ok=ok,
        metrics=metrics,
        manifest_path=str(man.resolve()),
        message="ok" if ok else "missing_surfaces",
    )
    man.write_text(json.dumps(metrics.model_dump(), indent=2), encoding="utf-8")
    return report


__all__ = [
    "CorticalSurfaceReconstructionResult",
    "SurfaceMeshExportResult",
    "SurfaceQCMetrics",
    "SurfaceQCReport",
    "reconstruct_cortical_surfaces",
    "export_surface_meshes",
    "compute_surface_qc",
]
