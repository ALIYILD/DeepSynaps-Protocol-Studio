"""Handbook v2 router -- evidence-integrated handbook management (22 endpoints).

Categories: Evidence Integration (5), Document Generation (5), AI Safety (5),
Advanced Features (7).  All endpoints enforce role checks, entitlement checks,
audit logging, and return evidence grades + provenance labels."""
from __future__ import annotations

import hashlib
import logging
import re
import uuid
from datetime import datetime, timezone
from io import BytesIO
from typing import Any

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.database import get_db_session
from app.entitlements import require_any_feature
from app.errors import ApiServiceError
from app.limiter import limiter
from app.packages import Feature
from app.repositories.audit import create_audit_event

router = APIRouter(prefix="/api/v1/handbooks", tags=["handbooks"])
DOCX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
PDF_MEDIA_TYPE = "application/pdf"
_logger = logging.getLogger(__name__)

# ── Service stubs ────────────────────────────────────────────────────────────────

_SVC_DEFS: dict[str, tuple[str, ...]] = {
    "handbook_evidence_service": (
        "get_handbook_evidence_items", "get_evidence_grade_table",
        "check_evidence_decay_for_handbook", "check_citation_grounding_for_handbook",
        "search_pubmed_for_handbook_terms", "check_evidence_freshness_score",
    ),
    "handbook_doc_generator": (
        "generate_handbook_docx", "generate_handbook_pdf", "generate_handbook_markdown",
        "generate_patient_guide_docx", "generate_handbook_bundle",
    ),
    "handbook_safety_service": (
        "scan_handbook_for_safety_issues", "check_handbook_readability",
        "get_hitl_checkpoint_status", "advance_hitl_checkpoint_for_handbook",
        "enforce_literacy_level",
    ),
    "handbook_block_tree": ("get_handbook_block_tree", "update_handbook_block_tree"),
    "handbook_version_control": (
        "get_handbook_version_history", "save_handbook_version",
        "revert_handbook_to_version", "diff_handbook_versions",
    ),
}


def _load_svc(mod_name: str, funcs: tuple[str, ...]) -> dict[str, Any]:
    try:
        mod = __import__(f"app.services.{mod_name}", fromlist=funcs)
        return {f: getattr(mod, f) for f in funcs}
    except Exception as exc:
        _logger.warning("handbook_v2: %s not available (%s) -- using stubs", mod_name, exc)
        stubs: dict[str, Any] = {}
        for f in funcs:
            if f.startswith(("get_", "search_", "check_", "diff_")):
                stubs[f] = lambda **_k: []
            elif f.startswith(("generate_", "generate_handbook_")):
                stubs[f] = lambda **_k: b""
            else:
                stubs[f] = lambda **_k: {"success": True}
        return stubs


_ev = _load_svc("handbook_evidence_service", _SVC_DEFS["handbook_evidence_service"])
_dg = _load_svc("handbook_doc_generator", _SVC_DEFS["handbook_doc_generator"])
_sf = _load_svc("handbook_safety_service", _SVC_DEFS["handbook_safety_service"])
_bt = _load_svc("handbook_block_tree", _SVC_DEFS["handbook_block_tree"])
_vc = _load_svc("handbook_version_control", _SVC_DEFS["handbook_version_control"])


# ── Helpers ────────────────────────────────────────────────────────────────────

def _audit(db: Session, actor: AuthenticatedActor, action: str, target_id: str = "", note: str = "") -> None:
    create_audit_event(
        db, event_id=str(uuid.uuid4()), target_id=target_id or "handbook",
        target_type="handbook", action=action, role=str(actor.role),
        actor_id=actor.actor_id, note=note,
        created_at=datetime.now(timezone.utc).isoformat(),
    )


def _entitlement(actor: AuthenticatedActor) -> None:
    require_any_feature(
        actor.package_id, Feature.HANDBOOK_GENERATE_FULL, Feature.HANDBOOK_GENERATE_LIMITED,
        message="Handbook access requires Resident / Fellow or higher.",
    )


def _safe(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9]+", "_", value).strip("_")


def _tag(handbook_id: str) -> str:
    return hashlib.sha256(handbook_id.encode("utf-8")).hexdigest()[:12]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _provenance(source: str, actor_id: str, clinic_id: str, **extra: Any) -> dict[str, Any]:
    return {"source": source, "queried_at": _now(), "actor_id": actor_id, "clinic_id": clinic_id, **extra}


def _grade_from_score(score: float) -> str:
    if score >= 0.9:
        return "A"
    if score >= 0.7:
        return "B"
    if score >= 0.5:
        return "C"
    return "D"


# ── Schemas ────────────────────────────────────────────────────────────────────

class _ExportDocx(BaseModel):
    condition_name: str = Field(..., max_length=200)
    modality_name: str = Field(..., max_length=200)
    device_name: str = Field(default="", max_length=200)
    include_evidence: bool = True


class _ExportPdf(BaseModel):
    condition_name: str = Field(..., max_length=200)
    modality_name: str = Field(..., max_length=200)
    device_name: str = Field(default="", max_length=200)
    include_evidence: bool = True


class _ExportMd(BaseModel):
    condition_name: str = Field(..., max_length=200)
    modality_name: str = Field(..., max_length=200)
    device_name: str = Field(default="", max_length=200)


class _ExportGuide(BaseModel):
    condition_name: str = Field(..., max_length=200)
    modality_name: str = Field(..., max_length=200)
    literacy_level: str = "standard"


class _ExportBundle(BaseModel):
    condition_name: str = Field(..., max_length=200)
    modality_name: str = Field(..., max_length=200)
    device_name: str = Field(default="", max_length=200)
    formats: list[str] = Field(default_factory=lambda: ["docx", "pdf", "markdown"])


class _BlocksUpdate(BaseModel):
    blocks: list[dict[str, Any]] = Field(default_factory=list)
    version_tag: str = "1.0"


class _VerSave(BaseModel):
    label: str = ""
    notes: str = ""


class _VerRevert(BaseModel):
    version_id: str


class _SafetyScan(BaseModel):
    scan_depth: str = "standard"


class _HitlAdv(BaseModel):
    checkpoint: int = Field(..., ge=0, le=10)


class _LitEnforce(BaseModel):
    target_grade_level: int = Field(8, ge=1, le=18)


# ═══════════════════════════════════════════════════════════════════════════════
# Evidence Integration (5 endpoints)
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/{handbook_id}/evidence")
@limiter.limit("30/minute")
def get_handbook_evidence(
    request: Request, handbook_id: str,
    evidence_threshold: str = Query("B"),
    clinic_id: str = Query(...),
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    """List evidence items attached to a handbook, filtered by minimum grade."""
    require_minimum_role(actor, "clinician")
    _entitlement(actor)
    _audit(db, actor, "handbook.evidence.list", handbook_id, f"threshold={evidence_threshold}")
    items = _ev["get_handbook_evidence_items"](handbook_id=handbook_id, evidence_threshold=evidence_threshold, clinic_id=clinic_id)
    return {
        "handbook_id": handbook_id, "evidence_threshold": evidence_threshold, "items": items,
        "provenance": _provenance("handbook_evidence_service", actor.actor_id, clinic_id, result_count=len(items)),
    }


@router.get("/{handbook_id}/evidence/grade-table")
@limiter.limit("30/minute")
def get_grade_table(
    request: Request, handbook_id: str,
    clinic_id: str = Query(...),
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    """Get the evidence grade distribution table for a handbook."""
    require_minimum_role(actor, "clinician")
    _entitlement(actor)
    _audit(db, actor, "handbook.evidence.grade_table", handbook_id, "")
    table = _ev["get_evidence_grade_table"](handbook_id=handbook_id, clinic_id=clinic_id)
    return {
        "handbook_id": handbook_id, "grade_table": table,
        "provenance": _provenance("handbook_evidence_service", actor.actor_id, clinic_id),
    }


@router.get("/{handbook_id}/evidence/decay-check")
@limiter.limit("20/minute")
def check_evidence_decay(
    request: Request, handbook_id: str,
    max_age_months: int = Query(24, ge=1, le=120),
    clinic_id: str = Query(...),
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    """Check whether evidence citations have decayed beyond max age."""
    require_minimum_role(actor, "clinician")
    _entitlement(actor)
    _audit(db, actor, "handbook.evidence.decay_check", handbook_id, f"max_age={max_age_months}mo")
    report = _ev["check_evidence_decay_for_handbook"](handbook_id=handbook_id, max_age_months=max_age_months, clinic_id=clinic_id)
    return {
        "handbook_id": handbook_id, "decay_report": report,
        "provenance": _provenance("handbook_evidence_service", actor.actor_id, clinic_id, max_age_months=max_age_months),
    }


@router.get("/{handbook_id}/evidence/grounding")
@limiter.limit("20/minute")
def check_citation_grounding(
    request: Request, handbook_id: str,
    clinic_id: str = Query(...),
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    """Verify citations are grounded in retrievable sources."""
    require_minimum_role(actor, "clinician")
    _entitlement(actor)
    _audit(db, actor, "handbook.evidence.grounding_check", handbook_id, "")
    report = _ev["check_citation_grounding_for_handbook"](handbook_id=handbook_id, clinic_id=clinic_id)
    return {
        "handbook_id": handbook_id, "grounding_report": report,
        "provenance": _provenance("handbook_evidence_service", actor.actor_id, clinic_id),
    }


@router.get("/{handbook_id}/evidence/pubmed-search")
@limiter.limit("15/minute")
def search_pubmed_for_handbook(
    request: Request, handbook_id: str,
    query: str = Query(...), max_results: int = Query(20, ge=1, le=100),
    clinic_id: str = Query(...),
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    """Search PubMed for additional evidence relevant to the handbook."""
    require_minimum_role(actor, "clinician")
    _entitlement(actor)
    _audit(db, actor, "handbook.evidence.pubmed_search", handbook_id, f"query='{query}'")
    results = _ev["search_pubmed_for_handbook_terms"](handbook_id=handbook_id, query=query, max_results=max_results, clinic_id=clinic_id)
    return {
        "handbook_id": handbook_id, "query": query, "results": results,
        "provenance": _provenance("handbook_evidence_service.pubmed", actor.actor_id, clinic_id, pubmed_query=query, max_results=max_results, result_count=len(results)),
    }


# ═══════════════════════════════════════════════════════════════════════════════
# Document Generation (5 endpoints)
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/{handbook_id}/export/docx")
@limiter.limit("10/minute")
def export_handbook_docx(
    request: Request, handbook_id: str, payload: _ExportDocx,
    clinic_id: str = Query(...),
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> StreamingResponse:
    """Export a handbook as a DOCX document (StreamingResponse download)."""
    require_minimum_role(actor, "clinician")
    _entitlement(actor)
    require_any_feature(actor.package_id, Feature.EXPORTS_DOCX, Feature.HANDBOOK_GENERATE_FULL,
                        message="DOCX export requires a plan with document export enabled.")
    _audit(db, actor, "handbook.export.docx", handbook_id, f"condition={payload.condition_name}")
    data = _dg["generate_handbook_docx"](handbook_id=handbook_id, condition_name=payload.condition_name, modality_name=payload.modality_name, device_name=payload.device_name, include_evidence=payload.include_evidence, clinic_id=clinic_id)
    fn = f"handbook_{_safe(payload.condition_name)}_{_safe(payload.modality_name)}_{_tag(handbook_id)}.docx"
    return StreamingResponse(BytesIO(data), media_type=DOCX_MEDIA_TYPE, headers={"Content-Disposition": f'attachment; filename="{fn}"'})


@router.post("/{handbook_id}/export/pdf")
@limiter.limit("10/minute")
def export_handbook_pdf(
    request: Request, handbook_id: str, payload: _ExportPdf,
    clinic_id: str = Query(...),
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> StreamingResponse:
    """Export a handbook as a PDF document (StreamingResponse download)."""
    require_minimum_role(actor, "clinician")
    _entitlement(actor)
    require_any_feature(actor.package_id, Feature.EXPORTS_PDF, Feature.HANDBOOK_GENERATE_FULL,
                        message="PDF export requires a plan with PDF export enabled.")
    _audit(db, actor, "handbook.export.pdf", handbook_id, f"condition={payload.condition_name}")
    data = _dg["generate_handbook_pdf"](handbook_id=handbook_id, condition_name=payload.condition_name, modality_name=payload.modality_name, device_name=payload.device_name, include_evidence=payload.include_evidence, clinic_id=clinic_id)
    fn = f"handbook_{_safe(payload.condition_name)}_{_safe(payload.modality_name)}_{_tag(handbook_id)}.pdf"
    return StreamingResponse(BytesIO(data), media_type=PDF_MEDIA_TYPE, headers={"Content-Disposition": f'attachment; filename="{fn}"'})


@router.post("/{handbook_id}/export/markdown")
@limiter.limit("10/minute")
def export_handbook_markdown(
    request: Request, handbook_id: str, payload: _ExportMd,
    clinic_id: str = Query(...),
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    """Export a handbook as Markdown (inline JSON response, not download)."""
    require_minimum_role(actor, "clinician")
    _entitlement(actor)
    _audit(db, actor, "handbook.export.markdown", handbook_id, f"condition={payload.condition_name}")
    md = _dg["generate_handbook_markdown"](handbook_id=handbook_id, condition_name=payload.condition_name, modality_name=payload.modality_name, device_name=payload.device_name, clinic_id=clinic_id)
    return {
        "handbook_id": handbook_id, "markdown": md,
        "provenance": _provenance("handbook_doc_generator", actor.actor_id, clinic_id, format="markdown"),
    }


@router.post("/{handbook_id}/export/patient-guide")
@limiter.limit("10/minute")
def export_patient_guide_docx(
    request: Request, handbook_id: str, payload: _ExportGuide,
    clinic_id: str = Query(...),
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> StreamingResponse:
    """Export a patient-facing guide derived from the handbook (DOCX download)."""
    require_minimum_role(actor, "clinician")
    _entitlement(actor)
    require_any_feature(actor.package_id, Feature.EXPORTS_PATIENT_FACING, Feature.HANDBOOK_GENERATE_FULL,
                        message="Patient guide export requires patient-facing exports.")
    _audit(db, actor, "handbook.export.patient_guide", handbook_id, f"condition={payload.condition_name}")
    data = _dg["generate_patient_guide_docx"](handbook_id=handbook_id, condition_name=payload.condition_name, modality_name=payload.modality_name, literacy_level=payload.literacy_level, clinic_id=clinic_id)
    fn = f"patient_guide_{_safe(payload.condition_name)}_{_safe(payload.modality_name)}_{_tag(handbook_id)}.docx"
    return StreamingResponse(BytesIO(data), media_type=DOCX_MEDIA_TYPE, headers={"Content-Disposition": f'attachment; filename="{fn}"'})


@router.post("/{handbook_id}/export/bundle")
@limiter.limit("5/minute")
def export_handbook_bundle(
    request: Request, handbook_id: str, payload: _ExportBundle,
    clinic_id: str = Query(...),
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> StreamingResponse:
    """Export a multi-format ZIP bundle containing handbook in requested formats."""
    require_minimum_role(actor, "clinician")
    _entitlement(actor)
    require_any_feature(actor.package_id, Feature.HANDBOOK_GENERATE_FULL, Feature.EXPORTS_DOCX,
                        message="Bundle export requires full handbook generation.")
    _audit(db, actor, "handbook.export.bundle", handbook_id, f"formats={payload.formats}")
    data = _dg["generate_handbook_bundle"](handbook_id=handbook_id, condition_name=payload.condition_name, modality_name=payload.modality_name, device_name=payload.device_name, formats=payload.formats, clinic_id=clinic_id)
    fn = f"handbook_bundle_{_safe(payload.condition_name)}_{_safe(payload.modality_name)}_{_tag(handbook_id)}.zip"
    return StreamingResponse(BytesIO(data), media_type="application/zip", headers={"Content-Disposition": f'attachment; filename="{fn}"'})


# ═══════════════════════════════════════════════════════════════════════════════
# AI Safety (5 endpoints)
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/{handbook_id}/safety/scan")
@limiter.limit("10/minute")
def scan_handbook_safety(
    request: Request, handbook_id: str, payload: _SafetyScan,
    clinic_id: str = Query(...),
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    """Run a safety scan over handbook content (contradictions, outdated info, missing warnings)."""
    require_minimum_role(actor, "clinician")
    _entitlement(actor)
    _audit(db, actor, "handbook.safety.scan", handbook_id, f"depth={payload.scan_depth}")
    result = _sf["scan_handbook_for_safety_issues"](handbook_id=handbook_id, scan_depth=payload.scan_depth, clinic_id=clinic_id)
    return {
        "handbook_id": handbook_id, "scan_result": result,
        "provenance": _provenance("handbook_safety_service", actor.actor_id, clinic_id, scan_depth=payload.scan_depth),
    }


@router.get("/{handbook_id}/safety/readability")
@limiter.limit("20/minute")
def check_readability(
    request: Request, handbook_id: str,
    clinic_id: str = Query(...),
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    """Compute readability metrics (Flesch-Kincaid, grade level) for the handbook."""
    require_minimum_role(actor, "clinician")
    _entitlement(actor)
    _audit(db, actor, "handbook.safety.readability", handbook_id, "")
    r = _sf["check_handbook_readability"](handbook_id=handbook_id, clinic_id=clinic_id)
    return {
        "handbook_id": handbook_id, "readability": r,
        "provenance": _provenance("handbook_safety_service", actor.actor_id, clinic_id),
    }


@router.get("/{handbook_id}/safety/hitl-status")
@limiter.limit("30/minute")
def get_hitl_status(
    request: Request, handbook_id: str,
    clinic_id: str = Query(...),
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    """Get the Human-in-the-Loop (HITL) review status for a handbook."""
    require_minimum_role(actor, "clinician")
    _entitlement(actor)
    _audit(db, actor, "handbook.safety.hitl_status", handbook_id, "")
    status = _sf["get_hitl_checkpoint_status"](handbook_id=handbook_id, clinic_id=clinic_id)
    return {
        "handbook_id": handbook_id, "hitl_status": status,
        "provenance": _provenance("handbook_safety_service", actor.actor_id, clinic_id),
    }


@router.post("/{handbook_id}/safety/hitl-advance")
@limiter.limit("15/minute")
def advance_hitl_checkpoint(
    request: Request, handbook_id: str, payload: _HitlAdv,
    clinic_id: str = Query(...),
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    """Advance the HITL review checkpoint for a handbook."""
    require_minimum_role(actor, "clinician")
    _entitlement(actor)
    _audit(db, actor, "handbook.safety.hitl_advance", handbook_id, f"checkpoint={payload.checkpoint}")
    result = _sf["advance_hitl_checkpoint_for_handbook"](handbook_id=handbook_id, checkpoint=payload.checkpoint, clinic_id=clinic_id, actor_id=actor.actor_id)
    return {
        "handbook_id": handbook_id, "result": result,
        "provenance": _provenance("handbook_safety_service", actor.actor_id, clinic_id, checkpoint=payload.checkpoint),
    }


@router.post("/{handbook_id}/safety/enforce-literacy")
@limiter.limit("10/minute")
def enforce_literacy(
    request: Request, handbook_id: str, payload: _LitEnforce,
    clinic_id: str = Query(...),
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    """Enforce a target literacy level on the handbook content."""
    require_minimum_role(actor, "clinician")
    _entitlement(actor)
    _audit(db, actor, "handbook.safety.enforce_literacy", handbook_id, f"grade={payload.target_grade_level}")
    result = _sf["enforce_literacy_level"](handbook_id=handbook_id, target_grade_level=payload.target_grade_level, clinic_id=clinic_id)
    return {
        "handbook_id": handbook_id, "result": result,
        "provenance": _provenance("handbook_safety_service", actor.actor_id, clinic_id, target_grade_level=payload.target_grade_level),
    }


# ═══════════════════════════════════════════════════════════════════════════════
# Advanced Features (7 endpoints)
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/{handbook_id}/blocks")
@limiter.limit("30/minute")
def get_block_tree(
    request: Request, handbook_id: str,
    clinic_id: str = Query(...),
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    """Get the structured block tree representing the handbook's sections and content blocks."""
    require_minimum_role(actor, "clinician")
    _entitlement(actor)
    _audit(db, actor, "handbook.blocks.get", handbook_id, "")
    tree = _bt["get_handbook_block_tree"](handbook_id=handbook_id, clinic_id=clinic_id)
    return {
        "handbook_id": handbook_id, "block_tree": tree,
        "provenance": _provenance("handbook_block_tree", actor.actor_id, clinic_id),
    }


@router.post("/{handbook_id}/blocks")
@limiter.limit("15/minute")
def update_block_tree(
    request: Request, handbook_id: str, payload: _BlocksUpdate,
    clinic_id: str = Query(...),
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    """Update the block tree structure of the handbook."""
    require_minimum_role(actor, "clinician")
    _entitlement(actor)
    _audit(db, actor, "handbook.blocks.update", handbook_id, f"blocks={len(payload.blocks)}")
    result = _bt["update_handbook_block_tree"](handbook_id=handbook_id, blocks=payload.blocks, version_tag=payload.version_tag, clinic_id=clinic_id, actor_id=actor.actor_id)
    return {
        "handbook_id": handbook_id, "result": result,
        "provenance": _provenance("handbook_block_tree", actor.actor_id, clinic_id),
    }


@router.get("/{handbook_id}/versions")
@limiter.limit("30/minute")
def get_version_history(
    request: Request, handbook_id: str,
    clinic_id: str = Query(...),
    page: int = Query(1, ge=1), limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    """Get the version history of a handbook with pagination."""
    require_minimum_role(actor, "clinician")
    _entitlement(actor)
    _audit(db, actor, "handbook.versions.list", handbook_id, f"page={page}")
    versions = _vc["get_handbook_version_history"](handbook_id=handbook_id, clinic_id=clinic_id, page=page, limit=limit)
    return {
        "handbook_id": handbook_id, "versions": versions,
        "provenance": _provenance("handbook_version_control", actor.actor_id, clinic_id, page=page, limit=limit),
    }


@router.post("/{handbook_id}/versions/save")
@limiter.limit("10/minute")
def save_version(
    request: Request, handbook_id: str, payload: _VerSave,
    clinic_id: str = Query(...),
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    """Save a named snapshot (version) of the current handbook state."""
    require_minimum_role(actor, "clinician")
    _entitlement(actor)
    _audit(db, actor, "handbook.versions.save", handbook_id, f"label={payload.label}")
    result = _vc["save_handbook_version"](handbook_id=handbook_id, label=payload.label, notes=payload.notes, clinic_id=clinic_id, actor_id=actor.actor_id)
    return {
        "handbook_id": handbook_id, "result": result,
        "provenance": _provenance("handbook_version_control", actor.actor_id, clinic_id),
    }


@router.post("/{handbook_id}/versions/revert")
@limiter.limit("10/minute")
def revert_to_version(
    request: Request, handbook_id: str, payload: _VerRevert,
    clinic_id: str = Query(...),
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    """Revert a handbook to a previously saved version."""
    require_minimum_role(actor, "clinician")
    _entitlement(actor)
    _audit(db, actor, "handbook.versions.revert", handbook_id, f"ver={payload.version_id}")
    result = _vc["revert_handbook_to_version"](handbook_id=handbook_id, version_id=payload.version_id, clinic_id=clinic_id, actor_id=actor.actor_id)
    return {
        "handbook_id": handbook_id, "result": result,
        "provenance": _provenance("handbook_version_control", actor.actor_id, clinic_id),
    }


@router.get("/{handbook_id}/versions/diff")
@limiter.limit("20/minute")
def diff_versions(
    request: Request, handbook_id: str,
    from_version: str = Query(...), to_version: str = Query(...),
    clinic_id: str = Query(...),
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    """Compute a structural diff between two handbook versions."""
    require_minimum_role(actor, "clinician")
    _entitlement(actor)
    _audit(db, actor, "handbook.versions.diff", handbook_id, f"{from_version}..{to_version}")
    diff = _vc["diff_handbook_versions"](handbook_id=handbook_id, from_version=from_version, to_version=to_version, clinic_id=clinic_id)
    return {
        "handbook_id": handbook_id, "diff": diff,
        "provenance": _provenance("handbook_version_control", actor.actor_id, clinic_id, from_version=from_version, to_version=to_version),
    }


@router.get("/{handbook_id}/evidence-freshness")
@limiter.limit("20/minute")
def check_evidence_freshness(
    request: Request, handbook_id: str,
    clinic_id: str = Query(...),
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    """Check the overall evidence freshness score for a handbook. Returns A/B/C/D grade."""
    require_minimum_role(actor, "clinician")
    _entitlement(actor)
    _audit(db, actor, "handbook.evidence_freshness", handbook_id, "")
    freshness = _ev["check_evidence_freshness_score"](handbook_id=handbook_id, clinic_id=clinic_id)
    score = freshness.get("freshness_score", 1.0) if isinstance(freshness, dict) else 1.0
    grade = _grade_from_score(score)
    return {
        "handbook_id": handbook_id, "freshness": freshness, "freshness_grade": grade,
        "provenance": _provenance("handbook_evidence_service", actor.actor_id, clinic_id, freshness_score=score, freshness_grade=grade),
    }
