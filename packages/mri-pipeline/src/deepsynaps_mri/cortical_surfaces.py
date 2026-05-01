"""
Cortical surface reconstruction — white / pial meshes per hemisphere.

**Initial strategy:** wrap external tools (FastSurfer, FreeSurfer-compatible
layouts). Do **not** port BrainSuite/FastSurfer surface algorithms in Python.

References: FreeSurfer ``surf/*.white|*.pial`` layout; FastSurfer produces the
same under ``<subject>/surf/``. BrainSuite (BFC + SVReg) would be a separate
``adapters/brainsuite_surfaces.py`` when needed.

Outputs are suitable for Niivue/VTK viewers (GIFTI) and reporting (JSON QC).
"""
from __future__ import annotations

import json
import logging
import shutil
from pathlib import Path
from typing import Literal

import numpy as np
from pydantic import BaseModel, Field

from .adapters.fastsurfer_surfaces import run_fastsurfer_surfaces as _adapter_fastsurfer
from .validation import validate_nifti_header

log = logging.getLogger(__name__)

Hemisphere = Literal["lh", "rh"]
SurfaceKind = Literal["white", "pial"]


class SurfMeshMeta(BaseModel):
    """Per-surface metadata (FS native triangular mesh)."""

    hemisphere: Hemisphere
    surface: SurfaceKind
    path: str
    n_vertices: int
    n_faces: int
    coord_units: str = "mm"
    format: Literal["freesurfer_triangular"] = "freesurfer_triangular"

    def to_dict(self) -> dict:
        return self.model_dump()


class CorticalSurfaceBundle(BaseModel):
    ok: bool
    source: Literal["fastsurfer", "external_freesurfer_layout", "none"]
    subject_id: str | None = None
    fsnative_dir: str | None = None
    """Directory containing ``lh.white``, ``lh.pial``, ``rh.white``, ``rh.pial``."""
    surfaces: list[SurfMeshMeta] = Field(default_factory=list)
    manifest_path: str | None = None
    log_path: str | None = None
    adapter_details: dict | None = None
    validation: dict | None = None
    code: str = ""
    message: str = ""

    def to_dict(self) -> dict:
        return self.model_dump()


class ExportSurfaceMeshesResult(BaseModel):
    ok: bool
    gifti_paths: dict[str, str] = Field(default_factory=dict)
    """Keys like ``lh_white``, ``lh_pial``, … → ``.gii`` paths."""
    manifest_path: str | None = None
    code: str = ""
    message: str = ""

    def to_dict(self) -> dict:
        return self.model_dump()


class SurfaceQCMetrics(BaseModel):
    hemisphere: Hemisphere
    surface: SurfaceKind
    n_vertices: int
    n_faces: int
    bbox_extent_mm: tuple[float, float, float] | None = None
    mean_edge_length_mm: float | None = None
    max_edge_length_mm: float | None = None
    passes_min_vertices: bool = True
    min_vertices: int = 1000

    def to_dict(self) -> dict:
        d = self.model_dump()
        if self.bbox_extent_mm is not None:
            d["bbox_extent_mm"] = list(self.bbox_extent_mm)
        return d


class SurfaceQCReport(BaseModel):
    ok: bool
    surfaces: list[SurfaceQCMetrics] = Field(default_factory=list)
    json_path: str | None = None
    code: str = ""
    message: str = ""

    def to_dict(self) -> dict:
        return self.model_dump()


def _cortical_root(artefacts_dir: Path) -> Path:
    d = artefacts_dir / "cortical_surfaces"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _fs_surf_names() -> list[tuple[Hemisphere, SurfaceKind, str]]:
    return [
        ("lh", "white", "lh.white"),
        ("lh", "pial", "lh.pial"),
        ("rh", "white", "rh.white"),
        ("rh", "pial", "rh.pial"),
    ]


def _collect_fs_native_surfs(fsnative: Path) -> list[SurfMeshMeta]:
    out: list[SurfMeshMeta] = []
    try:
        import nibabel as nib
    except ImportError as exc:
        raise RuntimeError(f"nibabel required for surface IO: {exc}") from exc

    for hemi, skind, fname in _fs_surf_names():
        p = fsnative / fname
        if not p.is_file():
            continue
        coords, faces = nib.freesurfer.read_geometry(str(p))
        out.append(
            SurfMeshMeta(
                hemisphere=hemi,
                surface=skind,
                path=str(p.resolve()),
                n_vertices=int(coords.shape[0]),
                n_faces=int(faces.shape[0]),
            )
        )
    return out


def _copy_surfaces_to_artefacts(src_surf_dir: Path, dst_fsnative: Path) -> None:
    dst_fsnative.mkdir(parents=True, exist_ok=True)
    for _, _, fname in _fs_surf_names():
        sp = src_surf_dir / fname
        if sp.is_file():
            shutil.copy2(sp, dst_fsnative / fname)


def reconstruct_cortical_surfaces(
    *,
    artefacts_dir: str | Path,
    subject_id: str,
    source: Literal["fastsurfer", "external_freesurfer_layout", "brainsuite"] = "fastsurfer",
    t1_nifti: str | Path | None = None,
    external_subject_dir: str | Path | None = None,
    run_input_validation: bool = True,
    fastsurfer_bin: str | None = None,
    fastsurfer_extra_args: list[str] | None = None,
    subjects_dir: str | Path | None = None,
    timeout_sec: int = 28800,
) -> CorticalSurfaceBundle:
    """
    Produce standardized white/pial surfaces for both hemispheres.

    Parameters
    ----------
    source
        * ``fastsurfer`` — run ``run_fastsurfer.sh`` (needs GPU/license per site).
        * ``external_freesurfer_layout`` — copy from ``external_subject_dir/surf``.
        * ``brainsuite`` — reserved; returns ``ok=False`` until an adapter exists.
    subjects_dir
        Parent directory for FastSurfer ``--sd`` (default: ``artefacts_dir/surfaces_fs``).
    """
    root = Path(artefacts_dir).resolve()
    croot = _cortical_root(root)
    log_dir = croot / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    fs_log = log_dir / "fastsurfer_subprocess.log"
    dst_native = croot / "fsnative"
    validation_dict: dict | None = None

    if source == "brainsuite":
        return CorticalSurfaceBundle(
            ok=False,
            source="none",
            subject_id=subject_id,
            code="brainsuite_not_implemented",
            message=(
                "BrainSuite surface pipeline is not wrapped yet; add "
                "adapters/brainsuite_surfaces.py or export FreeSurfer-compatible surf/."
            ),
        )

    if source == "external_freesurfer_layout":
        if external_subject_dir is None:
            return CorticalSurfaceBundle(
                ok=False,
                source="none",
                subject_id=subject_id,
                code="external_dir_required",
                message="external_subject_dir is required for external_freesurfer_layout",
            )
        ext = Path(external_subject_dir).resolve()
        surf = ext / "surf"
        if not surf.is_dir():
            return CorticalSurfaceBundle(
                ok=False,
                source="none",
                subject_id=subject_id,
                code="surf_dir_missing",
                message=f"No surf directory: {surf}",
            )
        _copy_surfaces_to_artefacts(surf, dst_native)
        try:
            metas = _collect_fs_native_surfs(dst_native)
        except RuntimeError as exc:
            return CorticalSurfaceBundle(
                ok=False,
                source="external_freesurfer_layout",
                subject_id=subject_id,
                log_path=str(fs_log) if fs_log.exists() else None,
                code="surface_read_failed",
                message=str(exc),
            )
        if len(metas) < 4:
            return CorticalSurfaceBundle(
                ok=False,
                source="external_freesurfer_layout",
                subject_id=subject_id,
                fsnative_dir=str(dst_native),
                surfaces=metas,
                code="incomplete_surfaces",
                message="Expected lh/rh .white and .pial; some files missing or unreadable.",
            )
        bundle = CorticalSurfaceBundle(
            ok=True,
            source="external_freesurfer_layout",
            subject_id=subject_id,
            fsnative_dir=str(dst_native.resolve()),
            surfaces=metas,
            log_path=None,
            message="ok",
        )
        man = croot / "cortical_surfaces_manifest.json"
        man.write_text(json.dumps(bundle.to_dict(), indent=2), encoding="utf-8")
        return bundle.model_copy(update={"manifest_path": str(man.resolve())})

    # fastsurfer
    if t1_nifti is None:
        return CorticalSurfaceBundle(
            ok=False,
            source="none",
            subject_id=subject_id,
            code="t1_required",
            message="t1_nifti is required for fastsurfer source",
        )
    t1 = Path(t1_nifti).resolve()
    if run_input_validation:
        vr = validate_nifti_header(t1)
        validation_dict = vr.to_dict()
        if not vr.ok:
            return CorticalSurfaceBundle(
                ok=False,
                source="none",
                subject_id=subject_id,
                validation=validation_dict,
                code=vr.code or "validation_failed",
                message=vr.message,
            )

    sd = Path(subjects_dir).resolve() if subjects_dir else (root / "surfaces_fs")
    sd.mkdir(parents=True, exist_ok=True)

    run = _adapter_fastsurfer(
        t1,
        sd,
        subject_id,
        fastsurfer_bin=fastsurfer_bin,
        extra_args=fastsurfer_extra_args,
        log_path=fs_log,
        timeout_sec=timeout_sec,
    )

    if not run.ok:
        return CorticalSurfaceBundle(
            ok=False,
            source="fastsurfer",
            subject_id=subject_id,
            log_path=str(fs_log.resolve()) if fs_log.exists() else None,
            adapter_details=run.to_dict(),
            validation=validation_dict,
            code=run.code,
            message=run.message,
        )

    surf_src = (run.subject_dir or sd / subject_id) / "surf"
    if not surf_src.is_dir():
        return CorticalSurfaceBundle(
            ok=False,
            source="fastsurfer",
            subject_id=subject_id,
            adapter_details=run.to_dict(),
            code="surf_dir_missing",
            message=f"FastSurfer did not produce surf dir: {surf_src}",
        )

    _copy_surfaces_to_artefacts(surf_src, dst_native)
    try:
        metas = _collect_fs_native_surfs(dst_native)
    except RuntimeError as exc:
        return CorticalSurfaceBundle(
            ok=False,
            source="fastsurfer",
            subject_id=subject_id,
            adapter_details=run.to_dict(),
            code="surface_read_failed",
            message=str(exc),
        )

    if len(metas) < 4:
        return CorticalSurfaceBundle(
            ok=False,
            source="fastsurfer",
            subject_id=subject_id,
            fsnative_dir=str(dst_native),
            surfaces=metas,
            adapter_details=run.to_dict(),
            code="incomplete_surfaces",
            message="Expected four surface files after FastSurfer.",
        )

    bundle = CorticalSurfaceBundle(
        ok=True,
        source="fastsurfer",
        subject_id=subject_id,
        fsnative_dir=str(dst_native.resolve()),
        surfaces=metas,
        log_path=str(fs_log.resolve()),
        adapter_details=run.to_dict(),
        validation=validation_dict,
        message="ok",
    )
    man = croot / "cortical_surfaces_manifest.json"
    man.write_text(json.dumps(bundle.to_dict(), indent=2), encoding="utf-8")
    log.info("Cortical surfaces ready under %s", dst_native)
    return bundle.model_copy(update={"manifest_path": str(man.resolve())})


def export_surface_meshes(
    fsnative_dir: str | Path,
    output_dir: str | Path,
    *,
    formats: tuple[Literal["gifti"], ...] = ("gifti",),
    hemispheres: tuple[Hemisphere, ...] = ("lh", "rh"),
    surfaces: tuple[SurfaceKind, ...] = ("white", "pial"),
) -> ExportSurfaceMeshesResult:
    """
    Convert FreeSurfer binary surfaces to viewer-friendly GIFTI (per mesh).

    ``output_dir`` receives ``<hemi>.<surface>.surf.gii`` files and a small manifest.
    """
    try:
        import nibabel as nib
        from nibabel.gifti import GiftiDataArray, GiftiImage
    except ImportError as exc:
        return ExportSurfaceMeshesResult(
            ok=False,
            code="nibabel_missing",
            message=str(exc),
        )

    src = Path(fsnative_dir).resolve()
    out = Path(output_dir).resolve()
    out.mkdir(parents=True, exist_ok=True)

    if "gifti" not in formats:
        return ExportSurfaceMeshesResult(
            ok=False,
            code="unsupported_format",
            message=f"Only gifti supported; got {formats}",
        )

    gifti_paths: dict[str, str] = {}
    for hemi in hemispheres:
        for sk in surfaces:
            fname = f"{hemi}.{sk}"
            sp = src / fname
            if not sp.is_file():
                return ExportSurfaceMeshesResult(
                    ok=False,
                    code="surface_missing",
                    message=f"Missing {sp}",
                )
            coords, faces = nib.freesurfer.read_geometry(str(sp))
            faces = np.asarray(faces, dtype=np.int32)
            gimg = GiftiImage(
                darrays=[
                    GiftiDataArray(
                        np.asarray(coords, dtype=np.float32),
                        intent="NIFTI_INTENT_POINTSET",
                    ),
                    GiftiDataArray(
                        faces,
                        intent="NIFTI_INTENT_TRIANGLE",
                    ),
                ]
            )
            key = f"{hemi}_{sk}"
            dest = out / f"{key}.surf.gii"
            gimg.to_filename(str(dest))
            gifti_paths[key] = str(dest.resolve())

    man = out / "surface_export_manifest.json"
    payload = {"format": "gifti", "meshes": gifti_paths}
    man.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    return ExportSurfaceMeshesResult(
        ok=True,
        gifti_paths=gifti_paths,
        manifest_path=str(man.resolve()),
        message="ok",
    )


def _edge_stats(coords: np.ndarray, faces: np.ndarray) -> tuple[float, float]:
    """Mean and max edge length across triangular faces."""
    lengths: list[float] = []
    for tri in faces:
        a, b, c = coords[tri[0]], coords[tri[1]], coords[tri[2]]
        lengths.append(float(np.linalg.norm(a - b)))
        lengths.append(float(np.linalg.norm(b - c)))
        lengths.append(float(np.linalg.norm(c - a)))
    arr = np.array(lengths, dtype=np.float64)
    return float(np.mean(arr)), float(np.max(arr))


def compute_surface_qc(
    fsnative_dir: str | Path,
    artefacts_dir: str | Path,
    *,
    json_name: str = "cortical_surface_qc.json",
) -> SurfaceQCReport:
    """QC metrics for lh/rh white and pial in ``fsnative_dir``."""
    try:
        import nibabel as nib
    except ImportError as exc:
        return SurfaceQCReport(ok=False, code="nibabel_missing", message=str(exc))

    src = Path(fsnative_dir).resolve()
    root = Path(artefacts_dir).resolve()
    croot = _cortical_root(root)

    metrics_list: list[SurfaceQCMetrics] = []
    try:
        for hemi, sk, fname in _fs_surf_names():
            p = src / fname
            if not p.is_file():
                return SurfaceQCReport(
                    ok=False,
                    code="surface_missing",
                    message=str(p),
                )
            coords, faces = nib.freesurfer.read_geometry(str(p))
            c = np.asarray(coords, dtype=np.float64)
            f = np.asarray(faces, dtype=np.int64)
            extent = tuple(float(x) for x in (c.max(axis=0) - c.min(axis=0)))
            mean_e, max_e = _edge_stats(c, f)
            nv = int(c.shape[0])
            metrics_list.append(
                SurfaceQCMetrics(
                    hemisphere=hemi,
                    surface=sk,
                    n_vertices=nv,
                    n_faces=int(f.shape[0]),
                    bbox_extent_mm=extent,
                    mean_edge_length_mm=mean_e,
                    max_edge_length_mm=max_e,
                    passes_min_vertices=nv >= 1000,
                )
            )

        report = SurfaceQCReport(ok=True, surfaces=metrics_list, message="ok")
        jp = croot / json_name
        jp.write_text(report.model_dump_json(indent=2), encoding="utf-8")
        return report.model_copy(update={"json_path": str(jp.resolve())})
    except Exception as exc:  # noqa: BLE001
        log.exception("compute_surface_qc failed")
        return SurfaceQCReport(ok=False, code="qc_failed", message=str(exc))


__all__ = [
    "CorticalSurfaceBundle",
    "ExportSurfaceMeshesResult",
    "SurfMeshMeta",
    "SurfaceQCMetrics",
    "SurfaceQCReport",
    "compute_surface_qc",
    "export_surface_meshes",
    "reconstruct_cortical_surfaces",
]
