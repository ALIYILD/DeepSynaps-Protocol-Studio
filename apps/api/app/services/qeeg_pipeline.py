"""Façade for the sibling ``deepsynaps_qeeg`` MNE-Python pipeline.

This module isolates the rest of the Studio backend from the heavy scientific
dependency stack (``mne``, ``mne-connectivity``, ``mne-icalabel``, ``pyprep``,
``specparam``, ``autoreject``) that the pipeline package pulls in. The import
is guarded so the API worker starts cleanly in environments where the
``qeeg_mne`` optional extra has not been installed.

Consumers should check :data:`HAS_MNE_PIPELINE` before assuming real output is
available, OR just call :func:`run_pipeline_safe` which always returns a
well-shaped dict — either the pipeline result or a structured error envelope.

See ``deepsynaps_qeeg_analyzer/CONTRACT.md`` §1 for the output schema.
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

_log = logging.getLogger(__name__)


# ── Optional import of the sibling pipeline package ─────────────────────────
# The sibling repo is wired in via the ``qeeg_mne`` extra in pyproject.toml.
# If the extra is not installed (the default in Studio CI + the user's dev
# machine right now) we fall back to a no-op façade that surfaces a clear
# "dependency missing" error without ever crashing the API worker.
try:
    from deepsynaps_qeeg.pipeline import (  # type: ignore[import-not-found]
        run_full_pipeline,
        PipelineResult,
    )

    HAS_MNE_PIPELINE: bool = True
except Exception as _import_exc:  # ImportError or heavy-dep failure
    run_full_pipeline = None  # type: ignore[assignment]
    PipelineResult = None  # type: ignore[assignment,misc]
    HAS_MNE_PIPELINE = False
    _IMPORT_ERROR_MSG = f"{type(_import_exc).__name__}: {_import_exc}"
    _log.info(
        "deepsynaps_qeeg pipeline not available (%s). "
        "Install the qeeg_mne extra to enable MNE-backed analysis.",
        _IMPORT_ERROR_MSG,
    )
else:
    _IMPORT_ERROR_MSG = ""


# ── Serialisation helpers ───────────────────────────────────────────────────


def _pipeline_result_to_dict(result: Any) -> dict[str, Any]:
    """Convert a ``PipelineResult`` dataclass / namedtuple into a plain dict.

    Parameters
    ----------
    result
        Whatever the sibling pipeline returned. Handled cases:
        * dataclass with ``features``, ``zscores``, ``flagged_conditions``,
          ``quality``, ``report_html``, ``report_pdf_path`` attributes.
        * plain dict (already serialised).

    Returns
    -------
    dict
        A JSON-serialisable dict with the §1 contract keys plus ``success``.
    """
    if result is None:
        return {"success": False, "error": "pipeline returned None"}

    if isinstance(result, dict):
        data = dict(result)
        data.setdefault("success", True)
        return data

    # Dataclass / namedtuple path — pull attributes by name.
    report_pdf_path = getattr(result, "report_pdf_path", None)
    if report_pdf_path is not None and isinstance(report_pdf_path, Path):
        report_pdf_path = str(report_pdf_path)

    return {
        "success": True,
        "features": getattr(result, "features", {}) or {},
        "zscores": getattr(result, "zscores", {}) or {},
        "flagged_conditions": list(getattr(result, "flagged_conditions", []) or []),
        "quality": getattr(result, "quality", {}) or {},
        "report_html": getattr(result, "report_html", None),
        "report_pdf_path": report_pdf_path,
        # 2026-04-26 night-shift: top-level decision-support arrays. Surfaced
        # so the frontend can render qc_flags / confidence / method_provenance
        # / limitations badges without descending into features.clinical_summary.
        "qc_flags": list(getattr(result, "qc_flags", []) or []),
        "confidence": dict(getattr(result, "confidence", {}) or {}),
        "method_provenance": dict(getattr(result, "method_provenance", {}) or {}),
        "limitations": list(getattr(result, "limitations", []) or []),
    }


# ── Public API ──────────────────────────────────────────────────────────────


def run_pipeline_safe(file_path: str, **kwargs: Any) -> dict[str, Any]:
    """Run the MNE pipeline, never raising.

    This is the single entry point every Studio caller should use.  It always
    returns a JSON-friendly dict — either the pipeline result (keys:
    ``features``, ``zscores``, ``flagged_conditions``, ``quality``,
    ``report_html``, ``report_pdf_path``) with ``success=True``, or a
    structured error envelope ``{"success": False, "error": str}``.

    Parameters
    ----------
    file_path
        Absolute path to the EEG file (edf / bdf / vhdr / set / fif).
    **kwargs
        Forwarded to :func:`deepsynaps_qeeg.pipeline.run_full_pipeline` when
        the pipeline is available.

    Returns
    -------
    dict
        See §1 of ``CONTRACT.md`` when ``success`` is ``True``.
    """
    if not HAS_MNE_PIPELINE or run_full_pipeline is None:
        return {
            "success": False,
            "error": (
                "deepsynaps_qeeg pipeline is not installed. "
                "Install the `qeeg_mne` extra to enable MNE-backed analysis. "
                f"(import error: {_IMPORT_ERROR_MSG or 'unknown'})"
            ),
        }

    try:
        result = run_full_pipeline(file_path, **kwargs)  # type: ignore[misc]
    except Exception as exc:  # pragma: no cover — bubble up as structured error
        _log.exception("MNE pipeline run failed for %s", file_path)
        return {"success": False, "error": f"{type(exc).__name__}: {exc}"}

    try:
        return _pipeline_result_to_dict(result)
    except Exception as exc:  # pragma: no cover — serialisation failure
        _log.exception("MNE pipeline serialisation failed for %s", file_path)
        return {"success": False, "error": f"serialisation failed: {exc}"}


__all__ = [
    "HAS_MNE_PIPELINE",
    "run_pipeline_safe",
]
