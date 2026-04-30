"""QEEG Brain Map PDF export service (Phase 2).

Renders a ``QEEGBrainMapReport`` payload (from Phase 0) into a print-grade
PDF that mirrors the on-screen renderer in
``apps/web/src/qeeg-patient-report.js`` and the Jinja template at
``apps/api/app/templates/qeeg_brain_map_report.html``.

Returns:
  - ``render_qeeg_html(payload)``  → str (always available)
  - ``render_qeeg_pdf(payload)``   → bytes (raises ``QEEGPdfRendererUnavailable``
    if WeasyPrint is not installed; the router maps to HTTP 503).

WeasyPrint requires native deps (Pango, Cairo). Production Dockerfile must
install them for PDF to work — see audit P2-3.
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from jinja2 import Environment, FileSystemLoader, select_autoescape

_log = logging.getLogger(__name__)

_TEMPLATE_DIR = Path(__file__).resolve().parent.parent / "templates"
_TEMPLATE_NAME = "qeeg_brain_map_report.html"


class QEEGPdfRendererUnavailable(RuntimeError):
    """Raised when WeasyPrint (or its native deps) is not installed."""


_jinja_env: Environment | None = None


def _get_env() -> Environment:
    global _jinja_env
    if _jinja_env is None:
        _jinja_env = Environment(
            loader=FileSystemLoader(str(_TEMPLATE_DIR)),
            autoescape=select_autoescape(["html", "xml"]),
            trim_blocks=True,
            lstrip_blocks=True,
        )
    return _jinja_env


def _group_dk_atlas_by_lobe(dk_atlas: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    """Group lh+rh rows per ROI so each region appears once with both percentiles.

    Output shape mirrors the frontend renderer's grouping in
    ``qeeg-brain-map-template.js::renderLobeSection``.
    """
    by_roi: dict[str, dict[str, Any]] = {}
    for row in dk_atlas or []:
        if not isinstance(row, dict):
            continue
        roi = row.get("roi")
        if not roi:
            continue
        agg = by_roi.setdefault(roi, {
            "code": row.get("code"),
            "roi": roi,
            "name": row.get("name"),
            "lobe": row.get("lobe"),
            "functions": row.get("functions") or [],
            "decline_symptoms": row.get("decline_symptoms") or [],
            "lt_percentile": None,
            "rt_percentile": None,
            "z_score": None,
        })
        if row.get("hemisphere") == "lh" and row.get("lt_percentile") is not None:
            agg["lt_percentile"] = row.get("lt_percentile")
        if row.get("hemisphere") == "rh" and row.get("rt_percentile") is not None:
            agg["rt_percentile"] = row.get("rt_percentile")
        z = row.get("z_score")
        if z is not None and (agg["z_score"] is None or abs(z) > abs(agg["z_score"])):
            agg["z_score"] = z

    grouped: dict[str, list[dict[str, Any]]] = {}
    for r in by_roi.values():
        lobe = r.get("lobe") or "unknown"
        grouped.setdefault(lobe, []).append(r)
    for lobe, rows in grouped.items():
        rows.sort(key=lambda r: (r.get("code") or "", r.get("roi") or ""))
    return grouped


def render_qeeg_html(payload: dict[str, Any]) -> str:
    """Render the QEEGBrainMapReport payload to a standalone HTML document."""
    env = _get_env()
    template = env.get_template(_TEMPLATE_NAME)
    if not isinstance(payload, dict):
        raise ValueError("payload must be a dict matching QEEGBrainMapReport contract")
    ctx = {
        "header": payload.get("header") or {},
        "indicators": payload.get("indicators") or {},
        "brain_function_score": payload.get("brain_function_score") or {},
        "lobe_summary": payload.get("lobe_summary") or {},
        "source_map": payload.get("source_map") or {},
        "dk_atlas": payload.get("dk_atlas") or [],
        "grouped_dk_atlas": _group_dk_atlas_by_lobe(payload.get("dk_atlas") or []),
        "ai_narrative": payload.get("ai_narrative") or {},
        "quality": payload.get("quality") or {},
        "provenance": payload.get("provenance") or {},
        "disclaimer": payload.get("disclaimer") or "Research and wellness use only. Not a medical diagnosis or treatment recommendation.",
    }
    return template.render(**ctx)


def render_qeeg_pdf(payload: dict[str, Any]) -> bytes:
    """Render the QEEGBrainMapReport payload to PDF bytes via WeasyPrint.

    Raises
    ------
    QEEGPdfRendererUnavailable
        If WeasyPrint (or its native dependencies) is not installed.
    """
    try:
        from weasyprint import HTML  # type: ignore[import-not-found]
    except Exception as exc:  # pragma: no cover — WeasyPrint optional dep
        _log.info("WeasyPrint unavailable: %s", exc)
        raise QEEGPdfRendererUnavailable(
            "WeasyPrint is not installed on this host. PDF rendering requires "
            "WeasyPrint + Pango/Cairo system libraries (see audit P2-3)."
        ) from exc

    html_doc = render_qeeg_html(payload)
    pdf_bytes = HTML(string=html_doc).write_pdf()
    if not pdf_bytes:
        raise RuntimeError("WeasyPrint returned empty PDF bytes")
    return pdf_bytes


__all__ = [
    "QEEGPdfRendererUnavailable",
    "render_qeeg_html",
    "render_qeeg_pdf",
]
