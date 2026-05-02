"""Render a session's results into HTML + PDF + JSON."""

from __future__ import annotations

from typing import Any, Mapping

from ..schemas import ReportBundle, Session


def generate_report(
    session: Session,
    payload: Mapping[str, Any],
) -> ReportBundle:
    """Render the session payload into a clinical report bundle.

    TODO: implement in PR #4 — Jinja2 template under
    ``reporting/templates/clinical_voice_v1.html.j2``, WeasyPrint to
    PDF, JSON written verbatim from ``payload``. Stamp pipeline +
    norm-DB + model versions.
    """

    raise NotImplementedError(
        "reporting.generate.generate_report: implement in PR #4 "
        "(see AUDIO_ANALYZER_STACK.md §9)."
    )
