"""
Thin subprocess / CLI adapters for external neuroimaging tools.

These wrappers centralize capture of stdout/stderr and logging. Core algorithms
stay in sibling modules (`io`, `structural`, `qc`) which call into here.

Public surface is intentionally small — expand as more CLIs move behind adapters.
"""
from __future__ import annotations

from .dcm2niix import invoke_dcm2niix
from .subprocess_tools import run_logged_subprocess, run_subprocess_capture

__all__ = [
    "invoke_dcm2niix",
    "run_logged_subprocess",
    "run_subprocess_capture",
]
