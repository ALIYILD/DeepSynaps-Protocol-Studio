"""FSL FAST tissue segmentation adapter."""
from __future__ import annotations

import logging
from pathlib import Path

from .subprocess_tools import run_logged_subprocess

log = logging.getLogger(__name__)


def run_fast(
    input_path: Path | str,
    output_basename: Path | str,
    *,
    n_classes: int = 3,
    bias_field_correction: bool = True,
) -> list[str]:
    """
    Run ``fast`` on a brain-extracted T1.

    ``output_basename`` is the prefix for ``fast`` outputs (no ``.nii.gz``).
    Returns argv executed.
    """
    cmd = ["fast", "-o", str(output_basename), "-n", str(n_classes)]
    if bias_field_correction:
        cmd.append("-B")
    cmd.append(str(input_path))
    log.info("FSL FAST: %s", " ".join(cmd))
    run_logged_subprocess(cmd)
    return cmd
