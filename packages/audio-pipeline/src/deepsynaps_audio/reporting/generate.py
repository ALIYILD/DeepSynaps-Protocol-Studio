"""Generate minimal HTML reports from structured payloads (no WeasyPrint requirement)."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Mapping
from uuid import UUID, uuid4

from jinja2 import Environment, FileSystemLoader, select_autoescape

from ..schemas import ReportBundle


def generate_report(session: Any, payload: Mapping[str, Any]) -> ReportBundle:
    """Render a minimal HTML summary into temp-like paths (session_id from payload)."""

    sid_raw = payload.get("session_id", getattr(session, "session_id", None))
    try:
        sid_uuid = UUID(str(sid_raw)) if sid_raw else uuid4()
    except ValueError:
        sid_uuid = uuid4()
    sid = str(sid_raw or sid_uuid)
    html_body = _render_html(payload)
    out_dir = Path.cwd() / ".deepsynaps_audio_reports"
    out_dir.mkdir(exist_ok=True)
    html_path = str(out_dir / f"voice_{sid}.html")
    Path(html_path).write_text(html_body, encoding="utf-8")

    from ..constants import NORM_DB_VERSION, PIPELINE_VERSION

    return ReportBundle(
        session_id=sid_uuid,
        json_payload=dict(payload),
        html_path=html_path,
        pdf_path=None,
        citations=[],
        pipeline_version=PIPELINE_VERSION,
        norm_db_version=NORM_DB_VERSION,
        model_versions={"report": "jinja_min/v1"},
        flagged_conditions=[],
    )


def _render_html(payload: Mapping[str, Any]) -> str:
    tpl_dir = Path(__file__).resolve().parent / "templates"
    env = Environment(
        loader=FileSystemLoader(str(tpl_dir)),
        autoescape=select_autoescape(["html"]),
    )
    try:
        tmpl = env.get_template("voice_summary_min.html.j2")
        return tmpl.render(payload=payload)
    except Exception:
        return f"<html><body><pre>{payload}</pre></body></html>"
