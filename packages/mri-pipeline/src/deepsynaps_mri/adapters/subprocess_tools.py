"""Shared subprocess helpers — auditable logs, consistent error paths."""
from __future__ import annotations

import logging
import subprocess
from pathlib import Path

log = logging.getLogger(__name__)


def run_logged_subprocess(
    cmd: list[str],
    *,
    cwd: Path | None = None,
) -> subprocess.CompletedProcess[str]:
    """Run CLI; on non-zero exit log stderr/stdout and raise ``CalledProcessError``."""
    proc = subprocess.run(
        cmd,
        check=False,
        capture_output=True,
        text=True,
        cwd=cwd,
    )
    if proc.returncode != 0:
        detail = (proc.stderr or proc.stdout or "").strip()
        log.error(
            "%s failed returncode=%s: %s",
            cmd[0],
            proc.returncode,
            detail[:4000] if detail else "(no stdout/stderr)",
        )
        raise subprocess.CalledProcessError(
            proc.returncode,
            cmd,
            output=proc.stdout,
            stderr=proc.stderr,
        )
    return proc


def run_subprocess_capture(
    cmd: list[str],
    *,
    cwd: Path | None = None,
    timeout: float | None = None,
) -> subprocess.CompletedProcess[str]:
    """Run CLI without raising — caller interprets ``returncode`` (used by MRIQC)."""
    return subprocess.run(
        cmd,
        check=False,
        capture_output=True,
        text=True,
        cwd=cwd,
        timeout=timeout,
    )
