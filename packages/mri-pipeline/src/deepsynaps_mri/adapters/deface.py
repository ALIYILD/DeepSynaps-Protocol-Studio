"""Defacing CLIs — ``pydeface`` and FreeSurfer ``mri_deface``."""
from __future__ import annotations

import logging
from pathlib import Path

from .subprocess_tools import run_logged_subprocess

log = logging.getLogger(__name__)


def run_pydeface(t1_path: Path | str, out_path: Path | str) -> list[str]:
    """Run ``pydeface`` with ``--force``. Returns argv executed."""
    cmd = ["pydeface", str(t1_path), "--out", str(out_path), "--force"]
    log.info("pydeface adapter: %s", " ".join(cmd))
    run_logged_subprocess(cmd)
    return cmd


def run_mri_deface(
    mri_deface_exe: str,
    t1_path: Path | str,
    tal_gca: Path | str,
    face_gca: Path | str,
    out_path: Path | str,
) -> list[str]:
    """Run FreeSurfer ``mri_deface`` with explicit template paths. Returns argv executed."""
    cmd = [
        mri_deface_exe,
        str(t1_path),
        str(tal_gca),
        str(face_gca),
        str(out_path),
    ]
    log.info("mri_deface adapter: %s", " ".join(cmd))
    run_logged_subprocess(cmd)
    return cmd
