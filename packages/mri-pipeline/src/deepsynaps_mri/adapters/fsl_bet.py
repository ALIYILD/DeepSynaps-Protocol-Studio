"""
FSL BET subprocess adapter — explicit boundary for audit logs.

Requires ``bet`` on PATH (FSL installation). Logs full stdout/stderr to
``log_path`` when provided.
"""
from __future__ import annotations

import logging
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class BETAvailability:
    """Whether FSL ``bet`` is callable."""

    available: bool
    path: str | None


def bet_available() -> BETAvailability:
    p = shutil.which("bet")
    return BETAvailability(available=p is not None, path=p)


@dataclass
class BETRunResult:
    ok: bool
    brain_path: Path | None  # *_brain.nii.gz
    mask_path: Path | None
    command: list[str]
    returncode: int
    stdout_path: Path | None
    stderr_text: str
    code: str = ""
    message: str = ""

    def to_dict(self) -> dict:
        return {
            "ok": self.ok,
            "brain_path": str(self.brain_path) if self.brain_path else None,
            "mask_path": str(self.mask_path) if self.mask_path else None,
            "command": list(self.command),
            "returncode": self.returncode,
            "stdout_path": str(self.stdout_path) if self.stdout_path else None,
            "code": self.code,
            "message": self.message,
        }


def run_bet(
    input_nii: str | Path,
    output_prefix: str | Path,
    *,
    frac: float = 0.5,
    log_path: Path | None = None,
    timeout_sec: int = 7200,
) -> BETRunResult:
    """
    Run ``bet <input> <output_prefix> -m -f <frac>``.

    Produces ``{prefix}_brain.nii.gz`` and ``{prefix}_brain_mask.nii.gz``.

    Parameters
    ----------
    input_nii
        Input T1 (or brain-ish) NIfTI path.
    output_prefix
        Output prefix **without** extension (FSL convention), e.g.
        ``/out/subject_bet``.
    frac
        Fractional intensity threshold for BET (FSL ``-f``).
    log_path
        If set, append combined subprocess log (stdout+stderr).
    """
    inp = Path(input_nii).resolve()
    prefix = Path(output_prefix).resolve()
    prefix.parent.mkdir(parents=True, exist_ok=True)

    av = bet_available()
    if not av.available:
        return BETRunResult(
            ok=False,
            brain_path=None,
            mask_path=None,
            command=[],
            returncode=-1,
            stdout_path=log_path,
            stderr_text="",
            code="bet_not_found",
            message="FSL bet not on PATH; install FSL or use another backend.",
        )

    cmd = [
        str(av.path),
        str(inp),
        str(prefix),
        "-m",
        "-f",
        str(frac),
    ]
    log.info("FSL BET: %s", " ".join(cmd))

    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout_sec,
            check=False,
        )
    except subprocess.TimeoutExpired:
        txt = f"BET timed out after {timeout_sec}s"
        if log_path:
            log_path.parent.mkdir(parents=True, exist_ok=True)
            log_path.write_text(txt, encoding="utf-8")
        return BETRunResult(
            ok=False,
            brain_path=None,
            mask_path=None,
            command=cmd,
            returncode=-9,
            stdout_path=log_path,
            stderr_text=txt,
            code="bet_timeout",
            message=txt,
        )

    combined = ""
    if proc.stdout:
        combined += "=== stdout ===\n" + proc.stdout + "\n"
    if proc.stderr:
        combined += "=== stderr ===\n" + proc.stderr + "\n"
    if log_path:
        log_path.parent.mkdir(parents=True, exist_ok=True)
        log_path.write_text(combined or "(no output)\n", encoding="utf-8")

    brain = Path(str(prefix) + "_brain.nii.gz")
    mask = Path(str(prefix) + "_brain_mask.nii.gz")

    if proc.returncode != 0:
        return BETRunResult(
            ok=False,
            brain_path=None,
            mask_path=None,
            command=cmd,
            returncode=proc.returncode,
            stdout_path=log_path,
            stderr_text=combined,
            code="bet_failed",
            message=f"bex exited {proc.returncode}",
        )

    if not brain.exists():
        return BETRunResult(
            ok=False,
            brain_path=None,
            mask_path=None,
            command=cmd,
            returncode=proc.returncode,
            stdout_path=log_path,
            stderr_text=combined,
            code="bet_missing_output",
            message=f"Expected brain output missing: {brain}",
        )

    return BETRunResult(
        ok=True,
        brain_path=brain,
        mask_path=mask if mask.exists() else None,
        command=cmd,
        returncode=0,
        stdout_path=log_path,
        stderr_text=combined,
        message="ok",
    )


__all__ = ["BETAvailability", "bet_available", "BETRunResult", "run_bet"]
