"""FSL FIRST subcortical segmentation adapter."""
from __future__ import annotations

import logging
import shutil
from pathlib import Path

from .subprocess_tools import run_logged_subprocess

log = logging.getLogger(__name__)


def resolve_first_binary() -> str | None:
    """Return ``first`` or ``run_first_all`` on PATH."""
    for name in ("first", "run_first_all"):
        p = shutil.which(name)
        if p:
            return p
    return None


def run_first(
    input_path: Path | str,
    output_basename: Path | str,
    *,
    structures: str | None = None,
) -> list[str]:
    """
    Run FIRST on a brain-extracted T1.

    Uses ``first`` if available, else ``run_first_all`` with compatible args.
    ``structures`` optional FIRST ``-s`` list (tool-specific).
    Returns argv executed.
    """
    exe = resolve_first_binary()
    if exe is None:
        raise FileNotFoundError("Neither 'first' nor 'run_first_all' found on PATH")

    base_cmd = Path(exe).name
    if base_cmd == "first":
        cmd = [exe, "-i", str(input_path), "-o", str(output_basename)]
        if structures:
            cmd += ["-s", structures]
    else:
        # run_first_all style varies by install — minimal portable invocation
        cmd = [exe, "-i", str(input_path), "-o", str(output_basename)]

    log.info("FSL FIRST: %s", " ".join(cmd))
    run_logged_subprocess(cmd)
    return cmd
