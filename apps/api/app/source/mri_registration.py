"""MRI co-registration — identity / upload hooks (patient-specific BEM deferred)."""

from __future__ import annotations

from typing import Any


def default_transform() -> dict[str, Any]:
    """Placeholder head↔MRI transform until digitization upload UI lands."""
    return {"kind": "identity", "matrix4": [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]}


def parse_nifti_placeholder(_filename: str) -> dict[str, Any]:
    """Reserved for NIfTI upload → surfaces/BEM pipeline."""
    return {"ok": False, "error": "MRI-driven BEM pipeline not enabled in this build"}
