"""FastSurfer CLI adapter — ``run_fastsurfer.sh`` subprocess boundary."""
from __future__ import annotations

import logging
from pathlib import Path

from .subprocess_tools import run_logged_subprocess

log = logging.getLogger(__name__)


def run_fastsurfer_segmentation(
    t1_path: Path | str,
    out_dir: Path | str,
    subject_id: str,
    *,
    threads: int = 4,
    parallel: bool = True,
) -> list[str]:
    """
    Run FastSurfer with DeepSynaps-standard flags.

    Returns the argv actually executed (for manifests).
    """
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    cmd: list[str] = [
        "run_fastsurfer.sh",
        "--t1",
        str(t1_path),
        "--sid",
        subject_id,
        "--sd",
        str(out_dir),
    ]
    if parallel:
        cmd.append("--parallel")
    cmd += ["--threads", str(threads)]
    log.info("FastSurfer adapter: %s", " ".join(cmd))
    run_logged_subprocess(cmd)
    return cmd
