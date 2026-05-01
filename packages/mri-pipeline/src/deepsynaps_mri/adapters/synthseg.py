"""SynthSeg (FreeSurfer ``mri_synthseg``) CLI adapter."""
from __future__ import annotations

import logging
from pathlib import Path

from .subprocess_tools import run_logged_subprocess

log = logging.getLogger(__name__)


def run_synthseg_segmentation(
    t1_path: Path | str,
    out_dir: Path | str,
    *,
    seg_filename: str = "seg.nii.gz",
    volumes_filename: str = "volumes.csv",
    qc_filename: str = "qc.csv",
    parc: bool = True,
    robust: bool = True,
) -> list[str]:
    """
    Run ``mri_synthseg`` with volume / QC CSV outputs (matches ``structural.run_synthseg``).

    Returns the argv actually executed (for manifests).
    """
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    seg_out = out_dir / seg_filename
    vol_csv = out_dir / volumes_filename
    qc_out = out_dir / qc_filename

    cmd: list[str] = [
        "mri_synthseg",
        "--i",
        str(t1_path),
        "--o",
        str(seg_out),
        "--vol",
        str(vol_csv),
        "--qc",
        str(qc_out),
    ]
    if parc:
        cmd.append("--parc")
    if robust:
        cmd.append("--robust")

    log.info("SynthSeg adapter: %s", " ".join(cmd))
    run_logged_subprocess(cmd)
    return cmd
