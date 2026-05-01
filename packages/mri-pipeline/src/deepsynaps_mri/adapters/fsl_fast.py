"""
FSL FAST — 3-class tissue segmentation (CSF / GM / WM).

Subprocess boundary; logs combined stdout/stderr when ``log_path`` is set.
"""
from __future__ import annotations

import logging
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class FASTRunResult:
    ok: bool
    out_basename: Path
    seg_path: Path | None
    pve_csf_path: Path | None
    pve_gm_path: Path | None
    pve_wm_path: Path | None
    command: list[str]
    returncode: int
    log_path: Path | None
    stderr_text: str
    code: str = ""
    message: str = ""

    def to_dict(self) -> dict:
        return {
            "ok": self.ok,
            "out_basename": str(self.out_basename),
            "seg_path": str(self.seg_path) if self.seg_path else None,
            "pve_csf_path": str(self.pve_csf_path) if self.pve_csf_path else None,
            "pve_gm_path": str(self.pve_gm_path) if self.pve_gm_path else None,
            "pve_wm_path": str(self.pve_wm_path) if self.pve_wm_path else None,
            "command": list(self.command),
            "returncode": self.returncode,
            "log_path": str(self.log_path) if self.log_path else None,
            "code": self.code,
            "message": self.message,
        }


def fast_available() -> bool:
    return shutil.which("fast") is not None


def run_fast_tissue_segmentation(
    input_nifti: str | Path,
    out_basename: str | Path,
    *,
    n_classes: int = 3,
    log_path: Path | None = None,
    timeout_sec: int = 7200,
) -> FASTRunResult:
    """
    Run ``fast -t 1 -n <n_classes> -o <basename> <input>``.

    For ``n_classes=3``, FSL writes ``basename_seg.nii.gz`` with labels
    typically **1=CSF, 2=GM, 3=WM** (plus 0 background), and PVE maps
    ``basename_pve_0..2``.
    """
    fast_bin = shutil.which("fast")
    inp = Path(input_nifti).resolve()
    base = Path(out_basename).resolve()
    base.parent.mkdir(parents=True, exist_ok=True)

    if fast_bin is None:
        return FASTRunResult(
            ok=False,
            out_basename=base,
            seg_path=None,
            pve_csf_path=None,
            pve_gm_path=None,
            pve_wm_path=None,
            command=[],
            returncode=-1,
            log_path=log_path,
            stderr_text="",
            code="fast_not_found",
            message="FSL fast not on PATH",
        )

    if not inp.is_file():
        return FASTRunResult(
            ok=False,
            out_basename=base,
            seg_path=None,
            pve_csf_path=None,
            pve_gm_path=None,
            pve_wm_path=None,
            command=[],
            returncode=-1,
            log_path=log_path,
            stderr_text="",
            code="input_missing",
            message=f"Input not found: {inp}",
        )

    cmd = [
        fast_bin,
        "-t",
        "1",
        "-n",
        str(n_classes),
        "-o",
        str(base),
        str(inp),
    ]
    log.info("FSL FAST: %s", " ".join(cmd))

    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout_sec,
            check=False,
        )
    except subprocess.TimeoutExpired:
        msg = f"FAST timed out after {timeout_sec}s"
        if log_path:
            log_path.parent.mkdir(parents=True, exist_ok=True)
            log_path.write_text(msg, encoding="utf-8")
        return FASTRunResult(
            ok=False,
            out_basename=base,
            seg_path=None,
            pve_csf_path=None,
            pve_gm_path=None,
            pve_wm_path=None,
            command=cmd,
            returncode=-9,
            log_path=log_path,
            stderr_text=msg,
            code="fast_timeout",
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
        return FASTRunResult(
            ok=False,
            out_basename=base,
            seg_path=None,
            pve_csf_path=None,
            pve_gm_path=None,
            pve_wm_path=None,
            command=cmd,
            returncode=proc.returncode,
            log_path=log_path,
            stderr_text=combined,
            code="fast_failed",
            message=f"fast exited {proc.returncode}",
        )

    seg = Path(str(base) + "_seg.nii.gz")
    pve0 = Path(str(base) + "_pve_0.nii.gz")
    pve1 = Path(str(base) + "_pve_1.nii.gz")
    pve2 = Path(str(base) + "_pve_2.nii.gz")

    if not seg.is_file():
        return FASTRunResult(
            ok=False,
            out_basename=base,
            seg_path=None,
            pve_csf_path=None,
            pve_gm_path=None,
            pve_wm_path=None,
            command=cmd,
            returncode=proc.returncode,
            log_path=log_path,
            stderr_text=combined,
            code="fast_missing_seg",
            message=f"Expected seg missing: {seg}",
        )

    return FASTRunResult(
        ok=True,
        out_basename=base,
        seg_path=seg,
        pve_csf_path=pve0 if pve0.is_file() else None,
        pve_gm_path=pve1 if pve1.is_file() else None,
        pve_wm_path=pve2 if pve2.is_file() else None,
        command=cmd,
        returncode=0,
        log_path=log_path,
        stderr_text=combined,
        message="ok",
    )


__all__ = ["FASTRunResult", "fast_available", "run_fast_tissue_segmentation"]
