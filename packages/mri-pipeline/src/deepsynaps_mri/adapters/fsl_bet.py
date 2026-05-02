"""FSL BET brain extraction adapter."""
from __future__ import annotations

import logging
from pathlib import Path

from .subprocess_tools import run_logged_subprocess

log = logging.getLogger(__name__)


def run_bet(
    input_path: Path | str,
    output_prefix: Path | str,
    *,
    fractional_intensity: float = 0.5,
    robust: bool = False,
) -> list[str]:
    """
    Run ``bet`` — output is ``{output_prefix}`` plus FSL suffixes (e.g. ``_brain.nii.gz``).

    ``output_prefix`` should be a path **without** extension (FSL convention).
    Returns argv executed.
    """
    cmd = ["bet", str(input_path), str(output_prefix), "-f", str(fractional_intensity)]
    if robust:
        cmd.append("-R")
    log.info("FSL BET: %s", " ".join(cmd))
    run_logged_subprocess(cmd)
    return cmd
