"""
FastSurfer / FreeSurfer-layout surface pipeline — subprocess wrapper.

Runs ``run_fastsurfer.sh`` (or override binary) to produce ``surf/lh.white``,
``surf/lh.pial``, and right-hemisphere counterparts under
``<subjects_dir>/<subject_id>/``.

This module does **not** call ``recon-all``. Prefer FastSurfer for runtime
(see project CLAUDE.md).
"""
from __future__ import annotations

import logging
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class FastSurferSurfaceRunResult:
    ok: bool
    subject_dir: Path | None
    command: list[str]
    returncode: int
    log_path: Path | None
    stdout_stderr: str
    code: str = ""
    message: str = ""

    def to_dict(self) -> dict:
        return {
            "ok": self.ok,
            "subject_dir": str(self.subject_dir) if self.subject_dir else None,
            "command": list(self.command),
            "returncode": self.returncode,
            "log_path": str(self.log_path) if self.log_path else None,
            "code": self.code,
            "message": self.message,
        }


def fastsurfer_available(binary: str | None = None) -> bool:
    name = binary or "run_fastsurfer.sh"
    return shutil.which(name) is not None


def run_fastsurfer_surfaces(
    t1_nifti: str | Path,
    subjects_dir: str | Path,
    subject_id: str,
    *,
    fastsurfer_bin: str | None = None,
    extra_args: list[str] | None = None,
    log_path: Path | None = None,
    timeout_sec: int = 28800,
) -> FastSurferSurfaceRunResult:
    """
    Invoke FastSurfer to build cortical surfaces.

    Parameters
    ----------
    extra_args
        Additional CLI tokens (e.g. ``["--surf_only"]`` when segmentation
        already exists in ``subjects_dir``).
    """
    exe = fastsurfer_bin or shutil.which("run_fastsurfer.sh") or ""
    t1 = Path(t1_nifti).resolve()
    sd = Path(subjects_dir).resolve()
    sd.mkdir(parents=True, exist_ok=True)

    if not exe:
        return FastSurferSurfaceRunResult(
            ok=False,
            subject_dir=None,
            command=[],
            returncode=-1,
            log_path=log_path,
            stdout_stderr="",
            code="fastsurfer_not_found",
            message="run_fastsurfer.sh not on PATH (set fastsurfer_bin or install FastSurfer).",
        )

    if not t1.is_file():
        return FastSurferSurfaceRunResult(
            ok=False,
            subject_dir=None,
            command=[],
            returncode=-1,
            log_path=log_path,
            stdout_stderr="",
            code="input_missing",
            message=f"T1 not found: {t1}",
        )

    cmd = [
        exe,
        "--t1",
        str(t1),
        "--sid",
        subject_id,
        "--sd",
        str(sd),
        "--threads",
        "4",
    ]
    if extra_args:
        cmd.extend(extra_args)

    log.info("FastSurfer surfaces: %s", " ".join(cmd))

    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout_sec,
            check=False,
        )
    except subprocess.TimeoutExpired:
        msg = f"FastSurfer timed out after {timeout_sec}s"
        if log_path:
            log_path.parent.mkdir(parents=True, exist_ok=True)
            log_path.write_text(msg, encoding="utf-8")
        return FastSurferSurfaceRunResult(
            ok=False,
            subject_dir=sd / subject_id,
            command=cmd,
            returncode=-9,
            log_path=log_path,
            stdout_stderr=msg,
            code="fastsurfer_timeout",
            message=msg,
        )

    combined = ""
    if proc.stdout:
        combined += "=== stdout ===\n" + proc.stdout + "\n"
    if proc.stderr:
        combined += "=== stderr ===\n" + proc.stderr + "\n"
    if log_path:
        log_path.parent.mkdir(parents=True, exist_ok=True)
        log_path.write_text(combined or "(no output)\n", encoding="utf-8")

    sdir = sd / subject_id
    if proc.returncode != 0:
        return FastSurferSurfaceRunResult(
            ok=False,
            subject_dir=sdir,
            command=cmd,
            returncode=proc.returncode,
            log_path=log_path,
            stdout_stderr=combined,
            code="fastsurfer_failed",
            message=f"run_fastsurfer.sh exited {proc.returncode}",
        )

    return FastSurferSurfaceRunResult(
        ok=True,
        subject_dir=sdir,
        command=cmd,
        returncode=0,
        log_path=log_path,
        stdout_stderr=combined,
        message="ok",
    )


__all__ = [
    "FastSurferSurfaceRunResult",
    "fastsurfer_available",
    "run_fastsurfer_surfaces",
]
