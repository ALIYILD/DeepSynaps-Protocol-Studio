"""dcm2niix invocation — extracted from :mod:`deepsynaps_mri.io` for a clear seam."""
from __future__ import annotations

import logging
import subprocess
from pathlib import Path

log = logging.getLogger(__name__)


def invoke_dcm2niix(
    dicom_dir: Path,
    out_dir: Path,
    *,
    anonymize: bool,
    stderr_log_path: Path | None,
) -> None:
    """
    Run ``dcm2niix`` with DeepSynaps-standard flags.

    Raises ``subprocess.CalledProcessError`` on failure. Optional
    ``stderr_log_path`` receives stderr text when the call fails (audit).
    """
    cmd = [
        "dcm2niix",
        "-b",
        "y",
        "-ba",
        "y" if anonymize else "n",
        "-z",
        "y",
        "-f",
        "%d_%s",
        "-o",
        str(out_dir),
        str(dicom_dir),
    ]
    log.info("Running: %s", " ".join(cmd))
    try:
        proc = subprocess.run(cmd, check=True, capture_output=True, text=True)
        if proc.stderr and proc.stderr.strip():
            log.info("dcm2niix stderr: %s", proc.stderr.strip()[:2000])
    except subprocess.CalledProcessError as exc:
        err = (exc.stderr or "").strip()
        log.error("dcm2niix failed: %s", err[:2000] if err else exc)
        if stderr_log_path is not None:
            stderr_log_path = Path(stderr_log_path)
            stderr_log_path.parent.mkdir(parents=True, exist_ok=True)
            stderr_log_path.write_text(
                f"command: {' '.join(cmd)}\nreturncode: {exc.returncode}\n\n{exc.stderr or ''}",
                encoding="utf-8",
            )
        raise
