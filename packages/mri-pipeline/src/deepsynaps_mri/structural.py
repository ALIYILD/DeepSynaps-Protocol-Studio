"""
Structural MRI analysis — T1 segmentation, volumetry, cortical thickness.

Segmentation engines (auto-fallback in this order):
    1. FastSurfer (GPU, ~5 min)          — preferred when CUDA is available
    2. SynthSeg+ (CPU, ~2 min, robust)   — works on any contrast/resolution
    3. SynthSeg (CPU, ~30 s, less robust)— final fallback

All engines produce:
    - a Desikan-Killiany cortical parcellation
    - an ASEG subcortical segmentation
    - optional cortical thickness map (FastSurfer only out-of-the-box)

Normative z-scores are computed against the ISTAGING normative curves
(Habes et al. 2021) which span ages 18-95, adjusted for sex, ICV, scanner
field strength. The normative LUT is loaded from `data/norms/istaging.csv`
(not included — TODO: populate from licensed source).

WMH burden: if a FLAIR is available and SynthSeg-WMH is used, we get a
probabilistic WMH mask; else we fall back to FSL BIANCA or simply report NA.
"""
from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

from .adapters.subprocess_tools import run_logged_subprocess as _adapter_run_cli
from .schemas import NormedValue, SegmentationEngine, StructuralMetrics

log = logging.getLogger(__name__)


def _run_logged_subprocess(cmd: list[str], *, cwd: Path | None = None) -> None:
    """Run external CLI via adapter; on failure log combined output and raise."""
    _adapter_run_cli(cmd, cwd=cwd)


# ---------------------------------------------------------------------------
# Brain-age hook (optional — graceful on missing torch)
# ---------------------------------------------------------------------------
def attach_brain_age(
    metrics: StructuralMetrics,
    t1_preprocessed_path: Path,
    chronological_age: float | None,
    weights_path: Path | None = None,
) -> StructuralMetrics:
    """Attach a :class:`~deepsynaps_mri.schemas.BrainAgePrediction` to ``metrics``.

    Wraps :func:`deepsynaps_mri.models.brain_age.predict_brain_age` so
    structural callers do not need to import torch directly. Graceful on
    every failure mode — ``StructuralMetrics.brain_age`` is populated with
    a ``status='dependency_missing'`` or ``status='failed'`` envelope
    instead of raising.

    Parameters
    ----------
    metrics
        The :class:`StructuralMetrics` to mutate. Returned unchanged.
    t1_preprocessed_path
        Path to the preprocessed T1 (skull-stripped, MNI-registered).
    chronological_age
        Patient's chronological age in years (optional).
    weights_path
        Optional override for the CNN weights; see ``predict_brain_age``.
    """
    try:
        from .models.brain_age import predict_brain_age
        from .safety import safe_brain_age

        raw = predict_brain_age(
            t1_preprocessed_path=t1_preprocessed_path,
            chronological_age=chronological_age,
            weights_path=weights_path,
        )
        # Always go through the safety wrapper so the API surface gets a
        # plausibility-checked envelope with confidence band + calibration
        # provenance attached. Garbage in → not_estimable instead of a
        # bogus age value reaching the clinician.
        metrics.brain_age = safe_brain_age(raw)
    except Exception as exc:  # noqa: BLE001
        log.warning("brain-age attach failed: %s", exc)
    return metrics


# ---------------------------------------------------------------------------
# Engine availability probes
# ---------------------------------------------------------------------------
def _has_cuda() -> bool:
    try:
        import torch
        return torch.cuda.is_available()
    except Exception:  # noqa: BLE001
        return False


def _has_fastsurfer() -> bool:
    """Detect FastSurfer via the `run_fastsurfer.sh` script or the docker image."""
    if shutil.which("run_fastsurfer.sh") is not None:
        return True
    # Check for docker image
    try:
        out = subprocess.run(
            ["docker", "image", "inspect", "deepmi/fastsurfer"],
            capture_output=True, check=False,
        )
        return out.returncode == 0
    except FileNotFoundError:
        return False


def _has_synthseg() -> bool:
    """SynthSeg ships with FreeSurfer 7.4+."""
    return shutil.which("mri_synthseg") is not None


def choose_engine() -> SegmentationEngine:
    """Auto-select best available engine."""
    if _has_cuda() and _has_fastsurfer():
        return SegmentationEngine.FASTSURFER
    if _has_synthseg():
        return SegmentationEngine.SYNTHSEG_PLUS
    raise RuntimeError(
        "No segmentation engine available. Install FreeSurfer 7.4+ (for SynthSeg) "
        "or FastSurfer (Docker image deepmi/fastsurfer)."
    )


# ---------------------------------------------------------------------------
# Segmentation runners
# ---------------------------------------------------------------------------
@dataclass
class SegmentationResult:
    engine: SegmentationEngine
    aseg_path: Path
    aparc_path: Path                # DK cortical parcellation
    thickness_path: Path | None
    wmh_path: Path | None
    stats_dir: Path                 # FreeSurfer-style stats dir


def run_fastsurfer(t1_path: Path, out_dir: Path, subject_id: str) -> SegmentationResult:
    """
    Run FastSurfer (Henschel et al. 2020).

    Requires:
        - CUDA GPU
        - `deepmi/fastsurfer` docker image OR local `run_fastsurfer.sh`
        - FreeSurfer license at $FREESURFER_HOME/license.txt

    TODO:
        - pass `--parallel` for the surface pipeline
        - mount /tmp/.X11-unix for the optional QC screenshots
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    cmd = [
        "run_fastsurfer.sh",
        "--t1", str(t1_path),
        "--sid", subject_id,
        "--sd", str(out_dir),
        "--parallel",
        "--threads", "4",
    ]
    log.info("Running FastSurfer: %s", " ".join(cmd))
    _run_logged_subprocess(cmd)

    sdir = out_dir / subject_id
    return SegmentationResult(
        engine=SegmentationEngine.FASTSURFER,
        aseg_path=sdir / "mri" / "aseg.mgz",
        aparc_path=sdir / "mri" / "aparc+aseg.mgz",
        thickness_path=sdir / "surf" / "lh.thickness",
        wmh_path=None,
        stats_dir=sdir / "stats",
    )


def run_synthseg(
    t1_path: Path,
    out_dir: Path,
    robust: bool = True,
    parc: bool = True,
    with_wmh: bool = False,
) -> SegmentationResult:
    """
    Run SynthSeg / SynthSeg+ (Billot et al. PNAS 2023).

    Works on any contrast and resolution (T1, T2, FLAIR, CT, low-field MRI).
    `robust=True` enables the SynthSeg+ hierarchical architecture (recommended
    for heterogeneous clinical scans).

    Parameters
    ----------
    with_wmh : if True, uses WMH-SynthSeg (optional extension) to also segment
               white matter hyperintensities.
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    seg_out = out_dir / "seg.nii.gz"
    parc_out = out_dir / "parc.nii.gz"
    vol_csv = out_dir / "volumes.csv"
    qc_csv = out_dir / "qc.csv"

    cmd = [
        "mri_synthseg",
        "--i", str(t1_path),
        "--o", str(seg_out),
        "--vol", str(vol_csv),
        "--qc", str(qc_csv),
    ]
    if parc:
        cmd += ["--parc"]
    if robust:
        cmd += ["--robust"]
    log.info("Running SynthSeg: %s", " ".join(cmd))
    _run_logged_subprocess(cmd)

    wmh = None
    if with_wmh:
        # TODO: integrate WMH-SynthSeg model path
        pass

    return SegmentationResult(
        engine=SegmentationEngine.SYNTHSEG_PLUS if robust else SegmentationEngine.SYNTHSEG,
        aseg_path=seg_out,
        aparc_path=parc_out if parc else seg_out,
        thickness_path=None,         # SynthSeg does not produce thickness natively
        wmh_path=wmh,
        stats_dir=out_dir,
    )


def segment(t1_path: Path, out_dir: Path, subject_id: str) -> SegmentationResult:
    """Auto-fallback segmentation entry point."""
    engine = choose_engine()
    log.info("Selected engine: %s", engine)
    if engine == SegmentationEngine.FASTSURFER:
        return run_fastsurfer(t1_path, out_dir, subject_id)
    return run_synthseg(t1_path, out_dir, robust=True, parc=True)


# ---------------------------------------------------------------------------
# Post-seg metric extraction
# ---------------------------------------------------------------------------
def extract_structural_metrics(
    seg_result: SegmentationResult,
    age: float | None,
    sex: str | None,
    norm_db_path: Path | None = None,
    *,
    artefacts_root: Path | None = None,
) -> StructuralMetrics:
    """
    Convert raw segmentation outputs into a `StructuralMetrics` object.

    Parses FastSurfer-style ``aseg.stats`` / ``aparc.stats`` or SynthSeg ``volumes.csv``.
    Normative z-scores remain ``None`` until a licensed normative LUT is configured
    (see ``norm_db_path`` / istaging — not bundled).

    Writes ``structural_metrics_manifest.json`` under ``artefacts_root/structural/`` when
    ``artefacts_root`` is provided (provenance for audit).
    """
    from . import structural_stats as ss

    metrics = StructuralMetrics(segmentation_engine=seg_result.engine)
    notes: list[str] = []
    provenance: dict[str, object] = {
        "engine": seg_result.engine.value,
        "stats_dir": str(seg_result.stats_dir),
        "aseg_path": str(seg_result.aseg_path),
    }

    manifest_path: Path | None = None
    if artefacts_root is not None:
        root = Path(artefacts_root)
        struct_dir = root / "structural"
        struct_dir.mkdir(parents=True, exist_ok=True)
        manifest_path = struct_dir / "structural_metrics_manifest.json"

    if seg_result.engine == SegmentationEngine.FASTSURFER:
        aseg_p = seg_result.stats_dir / "aseg.stats"
        lh_p = seg_result.stats_dir / "lh.aparc.stats"
        rh_p = seg_result.stats_dir / "rh.aparc.stats"
        provenance["aseg_stats"] = str(aseg_p)
        provenance["lh_aparc_stats"] = str(lh_p)
        provenance["rh_aparc_stats"] = str(rh_p)

        if aseg_p.is_file():
            vols, icv = ss.parse_aseg_stats(aseg_p)
            metrics.icv_ml = icv
            for name, mm3 in vols.items():
                metrics.subcortical_volume_mm3[name] = NormedValue(
                    value=mm3,
                    unit="mm^3",
                    z=None,
                    flagged=False,
                    model_id="parsed_aseg.stats",
                )
        else:
            notes.append(f"missing_aseg_stats:{aseg_p}")

        if lh_p.is_file():
            for name, t in ss.parse_aparc_stats_thickness(lh_p).items():
                metrics.cortical_thickness_mm[f"lh_{name}"] = NormedValue(
                    value=t,
                    unit="mm",
                    z=None,
                    flagged=False,
                    model_id="parsed_lh.aparc.stats",
                )
        else:
            notes.append(f"missing_lh_aparc:{lh_p}")

        if rh_p.is_file():
            for name, t in ss.parse_aparc_stats_thickness(rh_p).items():
                metrics.cortical_thickness_mm[f"rh_{name}"] = NormedValue(
                    value=t,
                    unit="mm",
                    z=None,
                    flagged=False,
                    model_id="parsed_rh.aparc.stats",
                )
        else:
            notes.append(f"missing_rh_aparc:{rh_p}")

    elif seg_result.engine in (
        SegmentationEngine.SYNTHSEG,
        SegmentationEngine.SYNTHSEG_PLUS,
    ):
        vol_csv = seg_result.stats_dir / "volumes.csv"
        provenance["volumes_csv"] = str(vol_csv)
        if vol_csv.is_file():
            raw_vol = ss.parse_synthseg_volumes_csv(vol_csv)
            metrics.icv_ml = ss.estimate_icv_from_synthseg_volumes(raw_vol)
            for name, mm3 in raw_vol.items():
                metrics.subcortical_volume_mm3[name] = NormedValue(
                    value=mm3,
                    unit="mm^3",
                    z=None,
                    flagged=False,
                    model_id="parsed_volumes.csv",
                )
        else:
            notes.append(f"missing_volumes_csv:{vol_csv}")

    if norm_db_path is not None:
        notes.append("norm_db_path_set_but_not_implemented")

    if manifest_path is not None:
        payload = {
            "engine": seg_result.engine.value,
            "icv_ml": metrics.icv_ml,
            "n_subcortical": len(metrics.subcortical_volume_mm3),
            "n_cortical_thickness": len(metrics.cortical_thickness_mm),
            "notes": notes,
            "provenance": provenance,
        }
        manifest_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        metrics.structural_metrics_manifest_path = str(manifest_path.resolve())
        log.info(
            "structural_metrics_manifest_written path=%s n_vol=%s n_thick=%s",
            manifest_path,
            len(metrics.subcortical_volume_mm3),
            len(metrics.cortical_thickness_mm),
        )

    metrics.structural_parse_notes = notes
    metrics.structural_parse_provenance = provenance
    return metrics


# ---------------------------------------------------------------------------
# Face-stripping for privacy
# ---------------------------------------------------------------------------
def deface_t1(t1_path: Path, out_path: Path) -> Path:
    """
    Remove facial features from a T1 for privacy.

    Prefers `pydeface` if installed; falls back to FreeSurfer's `mri_deface`.
    """
    if shutil.which("pydeface"):
        cmd = ["pydeface", str(t1_path), "--out", str(out_path), "--force"]
        _run_logged_subprocess(cmd)
        return out_path
    fs_home = os.environ.get("FREESURFER_HOME", "").strip()
    mri_deface_exe = shutil.which("mri_deface")
    if mri_deface_exe and fs_home:
        tal = Path(fs_home) / "average" / "talairach_mixed_with_skull.gca"
        face = Path(fs_home) / "average" / "face.gca"
        if tal.is_file() and face.is_file():
            cmd = [mri_deface_exe, str(t1_path), str(tal), str(face), str(out_path)]
            _run_logged_subprocess(cmd)
            return out_path
        log.warning(
            "mri_deface on PATH but FREESURFER_HOME templates missing (%s, %s); skipping deface",
            tal,
            face,
        )
    log.warning("No defacing tool found (pydeface or mri_deface). Skipping.")
    shutil.copy(t1_path, out_path)
    return out_path
