"""Final report — templates, variable context, PDF/DOCX/RTF render (M12)."""

from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.database import get_db_session
from app.report.render_docx import document_to_docx_bytes
from app.report.render_html import document_to_html
from app.report.render_pdf import html_to_pdf_bytes, redact_phi_html
from app.report.render_rtf import document_to_rtf
from app.report.template_store import list_builtin_templates, load_builtin_template
from app.report.variables import build_template_context
from app.routers.qeeg_raw_router import _load_analysis

router = APIRouter(prefix="/api/v1/studio/eeg", tags=["studio-report"])

# core-schema-exempt: report document — studio report router-local


class ReportDocumentIn(BaseModel):
    model_config = ConfigDict(extra="allow")

    title: str = "EEG Report"
    blocks: list[dict[str, Any]] = Field(default_factory=list)

# core-schema-exempt: render report — studio report router-local


class RenderReportIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    format: Literal["pdf", "docx", "rtf", "html"] = "pdf"
    renderer: Literal["internal", "ms_word"] = Field("internal", alias="renderer")
    document: ReportDocumentIn
    redact_phi: bool = Field(False, alias="redactPhi")


@router.get("/report/templates")
def report_templates_list(
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    require_minimum_role(actor, "clinician")
    return {"templates": list_builtin_templates()}


@router.get("/report/templates/{template_id}")
def report_template_get(
    template_id: str,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    require_minimum_role(actor, "clinician")
    return load_builtin_template(template_id)


@router.get("/{analysis_id}/report/context")
def report_context(
    analysis_id: str,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    require_minimum_role(actor, "clinician")
    _load_analysis(analysis_id, db, actor)
    ctx = build_template_context(analysis_id, db)
    return {"analysisId": analysis_id, "variables": ctx}


@router.post("/{analysis_id}/report/render")
def report_render(
    analysis_id: str,
    body: RenderReportIn,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> Response:
    require_minimum_role(actor, "clinician")
    _load_analysis(analysis_id, db, actor)
    ctx = build_template_context(analysis_id, db)
    doc = body.document.model_dump(mode="json")

    fmt = body.format
    if fmt == "html":
        html = document_to_html(doc, ctx)
        if body.redact_phi:
            html = redact_phi_html(html)
        return Response(content=html, media_type="text/html; charset=utf-8")

    if fmt == "pdf":
        html = document_to_html(doc, ctx)
        if body.redact_phi:
            html = redact_phi_html(html)
        pdf = html_to_pdf_bytes(html)
        return Response(
            content=pdf,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="report-{analysis_id}.pdf"'},
        )

    if fmt == "docx":
        data = document_to_docx_bytes(doc, ctx)
        return Response(
            content=data,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f'attachment; filename="report-{analysis_id}.docx"'},
        )

    if fmt == "rtf":
        rtf = document_to_rtf(doc, ctx)
        return Response(
            content=rtf,
            media_type="application/rtf",
            headers={"Content-Disposition": f'attachment; filename="report-{analysis_id}.rtf"'},
        )

    return Response(status_code=400)
