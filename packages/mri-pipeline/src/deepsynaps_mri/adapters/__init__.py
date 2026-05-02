"""
Thin subprocess / CLI adapters for external neuroimaging tools.

These wrappers centralize capture of stdout/stderr and logging. Core algorithms
stay in sibling modules (`io`, `structural`, `qc`) which call into here.

Public surface is intentionally small — expand as more CLIs move behind adapters.
"""
from __future__ import annotations

from .deface import run_mri_deface, run_pydeface
from .dcm2niix import invoke_dcm2niix
from .fastsurfer import run_fastsurfer_segmentation
from .fsl_bet import run_bet
from .fsl_fast import run_fast
from .fsl_first import resolve_first_binary, run_first
from .subprocess_tools import run_logged_subprocess, run_subprocess_capture
from .synthseg import run_synthseg_segmentation

__all__ = [
    "invoke_dcm2niix",
    "run_logged_subprocess",
    "run_subprocess_capture",
    "run_fastsurfer_segmentation",
    "run_synthseg_segmentation",
    "run_pydeface",
    "run_mri_deface",
    "run_bet",
    "run_fast",
    "resolve_first_binary",
    "run_first",
]
