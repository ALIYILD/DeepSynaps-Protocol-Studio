"""
FSL FIRST — subcortical structure segmentation.

Expects a **brain-extracted** or reasonably skull-stripped T1 for best
results (match FSL documentation). Subprocess boundary with optional log file.
"""
from __future__ import annotations

import logging
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class FIRSTRunResult:
    ok: bool
    output_prefix: Path
    seg_path: Path | None  # *_all_fast_firstseg.nii.gz
    command: list[str]
    returncode: int
    log_path: Path | None
    stderr_text: str
    code: str = ""
    message: str = ""

    def to_dict(self) -> dict:
        return {
            "ok": self.ok,
            "output_prefix": str(self.output_prefix),
            "seg_path": str(self.seg_path) if self.seg_path else None,
            "command": list(self.command),
            "returncode": self.returncode,
            "log_path": str(self.log_path) if self.log_path else None,
            "code": self.code,
            "message": self.message,
        }


def first_available() -> bool:
    return shutil.which("first") is not None or shutil.which("run_first_all") is not None


def _resolve_first_binary() -> tuple[str, bool]:
    """Return (executable, is_run_first_all_wrapper)."""
    p = shutil.which("first")
    if p:
        return p, False
    p = shutil.which("run_first_all")
    if p:
        return p, True
    return "", False


def run_first_subcortical(
    input_nifti: str | Path,
    output_prefix: str | Path,
    *,
    log_path: Path | None = None,
    timeout_sec: int = 7200,
    verbose: bool = True,
) -> FIRSTRunResult:
    """
    Run FIRST via ``first -i <input> -o <prefix>`` (or ``run_first_all`` if present).

    Default output segmentation: ``<prefix>_all_fast_firstseg.nii.gz`` (FSL 6.x).
    """
    first_bin, is_wrapper = _resolve_first_binary()
    inp = Path(input_nifti).resolve()
    prefix = Path(output_prefix).resolve()
    prefix.parent.mkdir(parents=True, exist_ok=True)

    if not first_bin:
        return FIRSTRunResult(
            ok=False,
            output_prefix=prefix,
            seg_path=None,
            command=[],
            returncode=-1,
            log_path=log_path,
            stderr_text="",
            code="first_not_found",
            message="FSL first/run_first_all not on PATH",
        )

    if not inp.is_file():
        return FIRSTRunResult(
            ok=False,
            output_prefix=prefix,
            seg_path=None,
            command=[],
            returncode=-1,
            log_path=log_path,
            stderr_text="",
            code="input_missing",
            message=f"Input not found: {inp}",
        )

    if is_wrapper:
        cmd = [first_bin, "-i", str(inp), "-o", str(prefix)]
    else:
        cmd = [first_bin, "-i", str(inp), "-o", str(prefix)]
        if verbose:
            cmd.append("-v")

    log.info("FSL FIRST: %s", " ".join(cmd))

    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout_sec,
            check=False,
        )
    except subprocess.TimeoutExpired:
        msg = f"FIRST timed out after {timeout_sec}s"
        if log_path:
            log_path.parent.mkdir(parents=True, exist_ok=True)
            log_path.write_text(msg, encoding="utf-8")
        return FIRSTRunResult(
            ok=False,
            output_prefix=prefix,
            seg_path=None,
            command=cmd,
            returncode=-9,
            log_path=log_path,
            stderr_text=msg,
            code="first_timeout",
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

    if proc.returncode != 0:
        return FIRSTRunResult(
            ok=False,
            output_prefix=prefix,
            seg_path=None,
            command=cmd,
            returncode=proc.returncode,
            log_path=log_path,
            stderr_text=combined,
            code="first_failed",
            message=f"first exited {proc.returncode}",
        )

    cand = Path(str(prefix) + "_all_fast_firstseg.nii.gz")
    if not cand.is_file():
        # Alternate naming in some installs
        alt = prefix.parent / (prefix.name + "_all_fast_firstseg.nii.gz")
        cand = alt if alt.is_file() else cand

    if not cand.is_file():
        return FIRSTRunResult(
            ok=False,
            output_prefix=prefix,
            seg_path=None,
            command=cmd,
            returncode=proc.returncode,
            log_path=log_path,
            stderr_text=combined,
            code="first_missing_seg",
            message="FIRST segmentation output not found (expected *_all_fast_firstseg.nii.gz)",
        )

    return FIRSTRunResult(
        ok=True,
        output_prefix=prefix,
        seg_path=cand,
        command=cmd,
        returncode=0,
        log_path=log_path,
        stderr_text=combined,
        message="ok",
    )


__all__ = ["FIRSTRunResult", "first_available", "run_first_subcortical"]
