"""protocol_studio_router.py — Thin, safety-first facades for Protocol Studio.

Phase 1 scope (doctor-ready scaffolding):
- Evidence health + evidence search (local SQLite corpus when available).
- Protocol catalog facades over the clinical registry (CSV-backed).
- Patient context summary (PHI-minimised, clinic-gated, no LLM calls).
- PHI-safe audit events for viewed/searched actions.

Non-goals in this phase:
- No AI protocol generation, no personalization, no approval workflow.
- No external live literature calls; only capability/config reporting.
"""

from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from typing import Any, Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role, require_patient_owner
from app.database import get_db_session
from app.repositories.audit import create_audit_event
from app.repositories.patients import resolve_patient_clinic_id
from app.repositories.protocol_studio import (
    get_patient_context_record,
    get_patient_data_source_stats,
)
from app.schemas.protocol_studio import (
    DataSourceAvailability,
    EvidenceHealthResponse,
    EvidenceSearchResponse,
    EvidenceSearchResult,
    FallbackMode,
    GenerateMode,
    PatientContextResponse,
    ProtocolCatalogItem,
    ProtocolCatalogResponse,
    ProtocolStatus,
    ProtocolStudioGenerateRequest,
    ProtocolStudioGenerateResponse,
)
from app.services import evidence_rag
from app.services.pgvector_bridge import HAS_PGVECTOR_RUNTIME, check_pgvector_enabled
from app.services.protocol_studio_generation import DraftResponse as DraftResponseDict
from app.services.protocol_studio_generation import GenerateRequest as GenerateRequestDict
from app.services.protocol_studio_generation import build_generation_preview_id, generate_deterministic_protocol_studio_draft
from app.services.registries import get_protocol as registry_get_protocol
from app.services.registries import list_protocols as registry_list_protocols

router = APIRouter(prefix="/api/v1/protocol-studio", tags=["protocol-studio"])


# ── Audit helpers (PHI-safe) ──────────────────────────────────────────────────

def _iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _audit(
    session: Session,
    *,
    actor: AuthenticatedActor,
    action: str,
    target_id: str,
    patient_id: str | None = None,
    note: str = "",
) -> None:
    # Note MUST remain PHI-safe and bounded; keep it short + structured.
    safe_note = (note or "")[:240]
    create_audit_event(
        session,
        event_id=f"ps-{uuid.uuid4().hex[:16]}",
        target_id=target_id,
        target_type="protocol_studio",
        action=action,
        role=actor.role,
        actor_id=actor.actor_id,
        note=("patient_id=" + patient_id + "; " if patient_id else "") + safe_note,
        created_at=_iso_now(),
    )


# ── Evidence endpoints ────────────────────────────────────────────────────────

def _is_local_evidence_available() -> bool:
    # evidence_rag internally checks EVIDENCE_DB_PATH / repo guess / /app.
    try:
        path = evidence_rag._default_db_path()  # noqa: SLF001 — reuse canonical resolver
    except Exception:
        path = os.environ.get("EVIDENCE_DB_PATH") or ""
    return bool(path and os.path.exists(path))


@router.get("/evidence/health", response_model=EvidenceHealthResponse)
def protocol_studio_evidence_health(
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> EvidenceHealthResponse:
    require_minimum_role(actor, "clinician")

    local_ok = _is_local_evidence_available()
    local_count: int | None = None
    if local_ok:
        # Cheap count estimate: run a query through evidence_rag (read-only sqlite).
        try:
            papers = evidence_rag.search_evidence("", top_k=1)
            # Can't get total counts cheaply from evidence_rag; keep null to avoid fake numbers.
            local_count = None if papers is None else None
        except Exception:
            local_ok = False

    vector_ok = False
    try:
        vector_ok = bool(HAS_PGVECTOR_RUNTIME and check_pgvector_enabled(db))
    except Exception:
        vector_ok = False

    # Live literature is not called at request-time; treat as "configured" only.
    live_configured = bool(os.environ.get("NCBI_API_KEY") or os.environ.get("SEMANTIC_SCHOLAR_API_KEY") or os.environ.get("OPENALEX_MAILTO"))

    if local_ok:
        fallback_mode: FallbackMode = "local_only"
        safe_msg = "Indexed evidence corpus is available. Results are from the local database (not live internet search)."
        status_ok = True
    else:
        fallback_mode = "unavailable"
        safe_msg = "Evidence corpus is unavailable on this API host. Live literature is not queried directly; configure/ingest the local evidence database."
        status_ok = False

    _audit(
        db,
        actor=actor,
        action="protocol_studio.evidence_health_viewed",
        target_id="evidence",
        note=f"local={int(local_ok)}; vector={int(vector_ok)}; live_cfg={int(live_configured)}; mode={fallback_mode}",
    )

    return EvidenceHealthResponse(
        local_evidence_available=local_ok,
        local_count=local_count if status_ok else None,
        live_literature_available=bool(live_configured),
        vector_search_available=vector_ok,
        fallback_mode=fallback_mode,
        last_checked=_iso_now(),
        safe_user_message=safe_msg,
    )


@router.get("/evidence/search", response_model=EvidenceSearchResponse)
def protocol_studio_evidence_search(
    q: str = Query(default="", description="Keyword query"),
    condition: str | None = Query(default=None),
    modality: str | None = Query(default=None),
    target: str | None = Query(default=None),
    limit: int = Query(default=10, ge=1, le=50),
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> EvidenceSearchResponse:
    require_minimum_role(actor, "clinician")

    local_ok = _is_local_evidence_available()
    if not local_ok:
        _audit(
            db,
            actor=actor,
            action="protocol_studio.evidence_search",
            target_id="evidence",
            note=f"status=unavailable; q_len={len(q or '')}; condition={bool(condition)}; modality={bool(modality)}; target={bool(target)}",
        )
        return EvidenceSearchResponse(
            results=[],
            status="unavailable",
            message="Evidence corpus unavailable on this API host. No results returned.",
        )

    # NOTE: `target` is not indexed in evidence_rag today; we accept the param but do not filter on it.
    papers = evidence_rag.search_evidence(
        q or "",
        modality=(modality or None),
        condition=(condition or None),
        top_k=limit,
        prefer_rct=True,
    )
    retrieved_at = _iso_now()

    results: list[EvidenceSearchResult] = []
    for p in papers or []:
        # evidence_rag returns stable keys; do not invent authors/doi/pmid.
        results.append(
            EvidenceSearchResult(
                id=str(p.get("paper_id") or ""),
                title=str(p.get("title") or ""),
                authors=[],
                year=p.get("year"),
                doi=p.get("doi") or None,
                pmid=p.get("pmid") or None,
                source=p.get("journal") or None,
                evidence_type=p.get("study_design") or None,
                evidence_grade=None,
                condition=condition,
                modality=modality,
                target=target,
                summary=p.get("abstract_snippet") or None,
                limitations=[],
                link=p.get("url") or None,
                retrieval_source="local",
                retrieved_at=retrieved_at,
            )
        )

    status: Literal["ok", "fallback", "unavailable"] = "ok" if results else "fallback"
    msg = "Results retrieved from local indexed evidence corpus." if results else "No matches found in local corpus."

    _audit(
        db,
        actor=actor,
        action="protocol_studio.evidence_search",
        target_id="evidence",
        note=f"status={status}; results={len(results)}; q_len={len(q or '')}; condition={bool(condition)}; modality={bool(modality)}; target={bool(target)}",
    )

    return EvidenceSearchResponse(results=results, status=status, message=msg)


# ── Protocol catalog endpoints ────────────────────────────────────────────────

def _protocol_status(off_label: bool, evidence_refs: list[str], evidence_grade: str | None) -> ProtocolStatus:
    if not evidence_refs:
        return "insufficient_evidence"
    if off_label:
        return "off_label_requires_review"
    # Default: clinician review required for all entries.
    # Treat unknown/low grades as still review-required.
    if not evidence_grade:
        return "clinic_review_required"
    return "clinic_review_required" if evidence_grade.strip().upper() in {"EV-D", "D", "N/A"} else "evidence_based"


_OFF_LABEL_WARNING = (
    "Off-label protocol: clinician decision-support only. Requires explicit clinician review and acknowledgement before use."
)


def _normalize_off_label(text: str | None) -> bool:
    raw = (text or "").strip().lower()
    if raw.startswith("off"):
        return True
    if raw.startswith("on"):
        return False
    # Unknown → treat conservatively as off-label requiring review.
    return True


@router.get("/protocols", response_model=ProtocolCatalogResponse)
def protocol_studio_protocols(
    condition: str | None = Query(default=None),
    modality: str | None = Query(default=None),
    target: str | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=500),
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> ProtocolCatalogResponse:
    require_minimum_role(actor, "clinician")

    rows = registry_list_protocols()
    items: list[ProtocolCatalogItem] = []

    def _match(row: dict[str, Any]) -> bool:
        if condition and str(row.get("condition_id") or "").lower() != condition.lower():
            return False
        if modality and str(row.get("modality_id") or "").lower() != modality.lower():
            return False
        if target and target.lower() not in str(row.get("target_region") or "").lower():
            return False
        return True

    for row in rows:
        if len(items) >= limit:
            break
        if not _match(row):
            continue
        refs = [x for x in [row.get("source_url_primary"), row.get("source_url_secondary")] if x]
        off_label = _normalize_off_label(row.get("on_label_vs_off_label"))
        ev_grade = row.get("evidence_grade") or None
        status = _protocol_status(off_label, refs, ev_grade)
        items.append(
            ProtocolCatalogItem(
                id=str(row.get("id") or ""),
                title=str(row.get("name") or row.get("id") or ""),
                condition=row.get("condition_id") or None,
                modality=row.get("modality_id") or None,
                target=row.get("target_region") or None,
                status=status,
                evidence_grade=ev_grade,
                regulatory_status=row.get("on_label_vs_off_label") or None,
                off_label=off_label,
                off_label_warning=_OFF_LABEL_WARNING if off_label else None,
                contraindication_summary=(row.get("contraindication_check_required") or None),
                clinician_review_required=True,
                not_autonomous_prescription=True,
                evidence_refs=refs,
            )
        )

    _audit(
        db,
        actor=actor,
        action="protocol_studio.protocol_catalog_viewed",
        target_id="protocols",
        note=f"items={len(items)}; condition={bool(condition)}; modality={bool(modality)}; target={bool(target)}",
    )

    return ProtocolCatalogResponse(items=items, total=len(items))


@router.get("/protocols/{protocol_id}", response_model=ProtocolCatalogItem)
def protocol_studio_protocol_detail(
    protocol_id: str,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> ProtocolCatalogItem:
    require_minimum_role(actor, "clinician")
    row = registry_get_protocol(protocol_id)
    if row is None:
        # Registries router uses 404; match that.
        from app.errors import ApiServiceError

        raise ApiServiceError(code="not_found", message="Protocol not found.", status_code=404)

    refs = [x for x in [row.get("source_url_primary"), row.get("source_url_secondary")] if x]
    off_label = _normalize_off_label(row.get("on_label_vs_off_label"))
    ev_grade = row.get("evidence_grade") or None
    status = _protocol_status(off_label, refs, ev_grade)

    item = ProtocolCatalogItem(
        id=str(row.get("id") or ""),
        title=str(row.get("name") or row.get("id") or ""),
        condition=row.get("condition_id") or None,
        modality=row.get("modality_id") or None,
        target=row.get("target_region") or None,
        status=status,
        evidence_grade=ev_grade,
        regulatory_status=row.get("on_label_vs_off_label") or None,
        off_label=off_label,
        off_label_warning=_OFF_LABEL_WARNING if off_label else None,
        contraindication_summary=(row.get("contraindication_check_required") or None),
        clinician_review_required=True,
        not_autonomous_prescription=True,
        evidence_refs=refs,
    )

    _audit(
        db,
        actor=actor,
        action="protocol_studio.protocol_viewed",
        target_id=str(protocol_id),
        note=f"off_label={int(off_label)}; status={status}",
    )
    return item


# ── Patient context endpoint ─────────────────────────────────────────────────


@router.get("/patients/{patient_id}/context", response_model=PatientContextResponse)
def protocol_studio_patient_context(
    patient_id: str,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> PatientContextResponse:
    require_minimum_role(actor, "clinician")

    exists, clinic_id = resolve_patient_clinic_id(db, patient_id)
    if not exists:
        from app.errors import ApiServiceError

        raise ApiServiceError(code="not_found", message="Patient not found.", status_code=404)
    require_patient_owner(actor, clinic_id)

    patient = get_patient_context_record(db, patient_id)
    if patient is None:
        from app.errors import ApiServiceError

        raise ApiServiceError(code="not_found", message="Patient not found.", status_code=404)

    # Minimal demographics: no names, no DOB. Provide age if DOB available.
    age_years: int | None = None
    try:
        if patient.dob:
            dob = datetime.fromisoformat(str(patient.dob))
            now = datetime.now(timezone.utc)
            age_years = now.year - dob.year - ((now.month, now.day) < (dob.month, dob.day))
    except Exception:
        age_years = None

    gender = (patient.gender or "").strip() or None
    demographics = {
        "age_years": age_years,
        "gender": gender,
        "primary_condition": (patient.primary_condition or "").strip() or None,
    }

    source_stats = get_patient_data_source_stats(db, patient_id)
    sources: dict[str, DataSourceAvailability] = {
        key: DataSourceAvailability(
            available=stat.count > 0,
            count=stat.count,
            last_updated=stat.last_updated,
        )
        for key, stat in source_stats.items()
    }
    # Explicitly list sources we are not aggregating yet (ERP, meds) as unavailable.
    sources["erp"] = DataSourceAvailability(available=False, count=None, last_updated=None)
    sources["medications"] = DataSourceAvailability(available=False, count=None, last_updated=None)

    # Safety flags: extract from patient.medical_history JSON if present, but do not return free-text.
    flags: dict[str, bool] = {}
    try:
        import json

        mh = json.loads(patient.medical_history) if patient.medical_history else {}
        safety = (mh or {}).get("safety") or {}
        flags = {k: bool(v) for k, v in (safety.get("flags") or {}).items()}
    except Exception:
        flags = {}

    missing = [k for k, v in sources.items() if not v.available]
    present = [k for k, v in sources.items() if v.available]
    completeness = round((len(present) / max(len(sources), 1)), 2)

    _audit(
        db,
        actor=actor,
        action="protocol_studio.patient_context_viewed",
        target_id=str(patient_id),
        patient_id=str(patient_id),
        note=f"completeness={completeness}; present={len(present)}; missing={len(missing)}",
    )

    return PatientContextResponse(
        patient_id=patient_id,
        demographics=demographics,
        sources=sources,
        missing_data=missing,
        safety_flags=flags,
        data_freshness={k: v.last_updated for k, v in sources.items()},
        completeness_score=completeness,
        clinician_review_required=True,
    )


@router.post("/generate", response_model=ProtocolStudioGenerateResponse)
def protocol_studio_generate(
    body: ProtocolStudioGenerateRequest,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> ProtocolStudioGenerateResponse:
    """Generate a deterministic protocol draft (decision-support only).

    Safety constraints:
    - No LLM calls.
    - No invented citations or parameters.
    - Drafts require local evidence matches.
    - Patient-gated modes require patient ownership + relevant data sources.
    """
    require_minimum_role(actor, "clinician")

    patient_id = (body.patient_id or "").strip() or None
    if patient_id:
        exists, clinic_id = resolve_patient_clinic_id(db, patient_id)
        if not exists:
            from app.errors import ApiServiceError

            raise ApiServiceError(code="not_found", message="Patient not found.", status_code=404)
        require_patient_owner(actor, clinic_id)

    req: GenerateRequestDict = {
        "patient_id": patient_id,
        "mode": body.mode,
        "condition": body.condition,
        "modality": body.modality,
        "target": body.target,
        "protocol_id": body.protocol_id,
        "include_off_label": body.include_off_label,
        "constraints": body.constraints or {},
    }

    out: DraftResponseDict = generate_deterministic_protocol_studio_draft(db, actor=actor, req=req)

    # Ensure a non-empty identifier for UX even when not persisted.
    if not out.get("draft_id"):
        out["draft_id"] = build_generation_preview_id()

    # Audit every attempt; keep note PHI-safe and bounded.
    _audit(
        db,
        actor=actor,
        action="protocol_studio.generate_attempt",
        target_id=str(out.get("draft_id") or "draft"),
        patient_id=patient_id,
        note=f"mode={body.mode}; status={out.get('status')}; off_label={int(bool(out.get('off_label')))}; include_off_label={int(bool(body.include_off_label))}; has_patient={int(bool(patient_id))}",
    )

    return ProtocolStudioGenerateResponse(**out)
