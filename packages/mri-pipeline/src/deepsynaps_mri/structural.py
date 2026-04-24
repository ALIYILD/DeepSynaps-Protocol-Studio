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

import logging
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

from .schemas import NormedValue, SegmentationEngine, StructuralMetrics

log = logging.getLogger(__name__)


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

        metrics.brain_age = predict_brain_age(
            t1_preprocessed_path=t1_preprocessed_path,
            chronological_age=chronological_age,
            weights_path=weights_path,
        )
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
    subprocess.run(cmd, check=True)

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
    subprocess.run(cmd, check=True)

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
) -> StructuralMetrics:
    """
    Convert raw segmentation outputs into a `StructuralMetrics` object.

    Steps:
        1. Read per-region volumes (mm³) from stats/aseg.stats or volumes.csv
        2. Read per-region cortical thickness (FastSurfer: aparc.stats) — or skip for SynthSeg
        3. Compute ICV
        4. Look up normative values by (region, age, sex, ICV, field strength)
        5. Compute z-scores + flag |z| > 2
    """
    metrics = StructuralMetrics(segmentation_engine=seg_result.engine)

    # TODO — parse seg_result.stats_dir depending on engine:
    #   FastSurfer: parse aseg.stats + lh.aparc.stats + rh.aparc.stats
    #   SynthSeg:   parse volumes.csv (one row, columns per label)

    # TODO — load normative DB (CSV in data/norms/istaging.csv)
    # For now, return a placeholder with empty metrics and a note.
    metrics.icv_ml = None
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
        subprocess.run(cmd, check=True)
        return out_path
    if shutil.which("mri_deface"):
        cmd = ["mri_deface", str(t1_path),
               "$FREESURFER_HOME/average/talairach_mixed_with_skull.gca",
               "$FREESURFER_HOME/average/face.gca", str(out_path)]
        subprocess.run(cmd, check=True, shell=False)
        return out_path
    log.warning("No defacing tool found (pydeface or mri_deface). Skipping.")
    shutil.copy(t1_path, out_path)
    return out_path
