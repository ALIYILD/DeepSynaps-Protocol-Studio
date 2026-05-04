"""Jinja2 → HTML → weasyprint PDF report rendering.

Mirrors the MRI / qEEG analyzer report stack. The renderer returns
``ReportArtefacts`` with the HTML and (optionally) PDF S3 URIs; if
weasyprint is not installed (slim image), the PDF URI is ``None`` and the
caller surfaces a 503 instead of crashing.
"""

from __future__ import annotations

from dataclasses import dataclass

from .schemas import VideoAnalysisReport


@dataclass
class ReportArtefacts:
    html_uri: str
    pdf_uri: str | None = None


def render_report(report: VideoAnalysisReport) -> ReportArtefacts:
    """Render the clinician-ready HTML + PDF report. TODO(impl).

    The Jinja template lives at ``templates/video_report.html.j2`` (added in
    a follow-up). It must surface, per task and per monitoring event:

    - the value, normative z-score, and at least one MedRAG citation;
    - the explicit "decision support, not diagnosis" disclaimer;
    - the longitudinal trend line if available.
    """

    _ = report
    raise NotImplementedError


__all__ = ["ReportArtefacts", "render_report"]
