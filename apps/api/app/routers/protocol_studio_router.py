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
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role, require_patient_owner
from app.database import get_db_session
from app.persistence.models.patient import ConsentRecord, Patient
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
    PatientContextResponse,
    ProtocolCatalogItem,
    ProtocolCatalogResponse,
    ProtocolStatus,
    ProtocolStudioGenerateRequest,
    ProtocolStudioGenerateResponse,
    ProtocolStudioRecommendRequest,
    ProtocolStudioRecommendResponse,
    ProtocolStudioSimulateRequest,
    ProtocolStudioSimulateResponse,
    RankedProtocolOption,
)
from app.services import evidence_rag
from app.services.pgvector_bridge import HAS_PGVECTOR_RUNTIME, check_pgvector_enabled
from app.services.protocol_studio_generation import DraftResponse as DraftResponseDict
from app.services.protocol_studio_generation import GenerateRequest as GenerateRequestDict
from app.services.protocol_studio_generation import _is_research_only
from app.services.protocol_studio_generation import build_generation_preview_id, generate_deterministic_protocol_studio_draft
from app.services.protocol_studio_recommend import build_protocol_recommendation
from app.services.protocol_studio_recommend import registry_row_parameter_summary
from app.services.registries import get_protocol as registry_get_protocol
from app.services.registries import list_protocols as registry_list_protocols
from app.settings import get_settings

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


# ── Consent helpers ────────────────────────────────────────────────────────

def _consent_active_protocol(db: Session, patient_id: str) -> bool:
    """Check if patient has active consent specifically for protocol/document generation.

    Filters by both ``consent_type`` AND ``status="active"`` so that an
    active consent for an unrelated category (e.g. ``media`` or
    ``device_sync``) does not silently authorise protocol generation.
    """
    if not patient_id:
        return False
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        return False
    consent = (
        db.query(ConsentRecord)
        .filter(
            ConsentRecord.patient_id == patient_id,
            ConsentRecord.consent_type == "document_generation",
            ConsentRecord.status == "active",
        )
        .order_by(ConsentRecord.created_at.desc())
        .first()
    )
    return consent is not None


def _assert_protocol_consent_active(db: Session, patient_id: str) -> None:
    """Raise error if patient lacks active consent for protocol generation."""
    if patient_id and not _consent_active_protocol(db, patient_id):
        from app.errors import ApiServiceError
        raise ApiServiceError(
            code="consent_required",
            message="Patient consent is required for protocol generation.",
            status_code=403,
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
            message="Evidence corpus unavailable or not connected in this environment.",
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


def _catalog_item_from_row(row: dict[str, Any]) -> ProtocolCatalogItem:
    refs = [x for x in [row.get("source_url_primary"), row.get("source_url_secondary")] if x]
    off_label = _normalize_off_label(row.get("on_label_vs_off_label"))
    ev_grade = row.get("evidence_grade") or None
    status = _protocol_status(off_label, refs, ev_grade)
    research_only = _is_research_only(row)
    dev_raw = row.get("device_id_if_specific") or row.get("device_slug") or ""
    device = str(dev_raw).strip() or None
    last_rev = row.get("last_reviewed") or row.get("reviewed_at") or None
    last_reviewed = str(last_rev).strip() if last_rev else None
    psum = registry_row_parameter_summary(row)
    ev_ct = len(refs)
    return ProtocolCatalogItem(
        id=str(row.get("id") or ""),
        title=str(row.get("name") or row.get("id") or ""),
        condition=row.get("condition_id") or None,
        modality=row.get("modality_id") or None,
        device=device,
        target=row.get("target_region") or None,
        parameter_summary=psum or None,
        status=status,
        evidence_grade=ev_grade,
        evidence_count=ev_ct,
        regulatory_status=row.get("on_label_vs_off_label") or None,
        off_label=off_label,
        off_label_warning=_OFF_LABEL_WARNING if off_label else None,
        research_only=research_only,
        last_reviewed=last_reviewed,
        has_evidence_links=ev_ct > 0,
        contraindication_summary=(row.get("contraindication_check_required") or None),
        clinician_review_required=True,
        not_autonomous_prescription=True,
        evidence_refs=refs,
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
        items.append(_catalog_item_from_row(row))

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

    item = _catalog_item_from_row(row)

    _audit(
        db,
        actor=actor,
        action="protocol_studio.protocol_viewed",
        target_id=str(protocol_id),
        note=f"off_label={int(item.off_label)}; status={item.status}",
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
        _assert_protocol_consent_active(db, patient_id)

    req: GenerateRequestDict = {
        "patient_id": patient_id,
        "mode": body.mode,
        "condition": body.condition,
        "modality": body.modality,
        "target": body.target,
        "protocol_id": body.protocol_id,
        "include_off_label": body.include_off_label,
        "constraints": body.constraints or {},
        "neuromodulation_context": body.neuromodulation_context or {},
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


@router.post("/recommend", response_model=ProtocolStudioRecommendResponse)
def protocol_studio_recommend(
    body: ProtocolStudioRecommendRequest,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> ProtocolStudioRecommendResponse:
    require_minimum_role(actor, "clinician")

    patient_id = (body.patient_id or "").strip() or None
    if patient_id:
        exists, clinic_id = resolve_patient_clinic_id(db, patient_id)
        if not exists:
            from app.errors import ApiServiceError

            raise ApiServiceError(code="not_found", message="Patient not found.", status_code=404)
        require_patient_owner(actor, clinic_id)
        _assert_protocol_consent_active(db, patient_id)

    payload = {
        "patient_id": patient_id,
        "condition": body.condition,
        "modalities": body.modalities,
        "qeeg_summary": body.qeeg_summary,
        "mri_summary": body.mri_summary,
        "contraindications": body.contraindications,
        "available_devices": body.available_devices,
        "desired_outcome_domain": body.desired_outcome_domain,
    }
    raw = build_protocol_recommendation(payload)

    def _rank_list(key: str) -> list[RankedProtocolOption]:
        return [RankedProtocolOption(**x) for x in raw.get(key, [])]

    try:
        _audit(
            db,
            actor=actor,
            action="protocol_studio.recommend_attempt",
            target_id="recommend",
            patient_id=patient_id,
            note=f"condition_len={len(body.condition or '')}; modalities={len(body.modalities or [])}",
        )
    except Exception:
        pass

    return ProtocolStudioRecommendResponse(
        evidence_backed_options=_rank_list("evidence_backed_options"),
        personalized_options=_rank_list("personalized_options"),
        imaging_guided_options=_rank_list("imaging_guided_options"),
        overall_top_3=_rank_list("overall_top_3"),
        not_recommended=list(raw.get("not_recommended") or []),
        missing_data=list(raw.get("missing_data") or []),
        safety_flags=list(raw.get("safety_flags") or []),
        ranking_note=str(raw.get("ranking_note") or ""),
    )


@router.post("/simulate", response_model=ProtocolStudioSimulateResponse)
def protocol_studio_simulate(
    body: ProtocolStudioSimulateRequest,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> ProtocolStudioSimulateResponse:
    """Protocol Studio does not embed DeepTwin predictions — returns explicit unavailable state."""

    require_minimum_role(actor, "clinician")

    patient_id = (body.patient_id or "").strip() or None
    if patient_id:
        exists, clinic_id = resolve_patient_clinic_id(db, patient_id)
        if not exists:
            from app.errors import ApiServiceError

            raise ApiServiceError(code="not_found", message="Patient not found.", status_code=404)
        require_patient_owner(actor, clinic_id)

    settings = get_settings()
    enabled = bool(getattr(settings, "enable_deeptwin_simulation", False))

    try:
        _audit(
            db,
            actor=actor,
            action="protocol_studio.simulate_attempt",
            target_id="simulate",
            patient_id=patient_id,
            note=f"protocol_ids={len(body.protocol_ids or [])}",
        )
    except Exception:
        pass

    return ProtocolStudioSimulateResponse(
        available=False,
        message=(
            "Simulation engine is not available in this build. No clinical prediction has been made."
        ),
        deeptwin_simulation_enabled=enabled,
        assumptions=[
            "DeepTwin simulation is a what-if modelling aid. "
            "It is not a validated clinical outcome prediction, diagnosis, or treatment approval."
        ],
        missing_data=["simulation_engine_not_wired_in_protocol_studio_preview"],
        safety_flags=["no_clinical_prediction_returned"],
    )


# ── Research-derived evidence parameters & safety endpoints ───────────────────
# These endpoints serve the 2024-2025 neuromodulation research findings
# embedded in Protocol Studio for decision-support only.

_PROTOCOL_EVIDENCE_PARAMS: dict[str, dict[str, dict[str, Any]]] = {
    "major-depressive-disorder": {
        "tms": {
            "target": "Left DLPFC",
            "frequency": "10 Hz",
            "intensity": "120% RMT",
            "pulses_per_session": "3000-4000",
            "effective_dose": "34,773 total pulses (~2.8 weeks)",
            "evidence_grade": "A",
            "fda_status": "Approved (2008)",
            "key_reference": "JAMA Network Open 2024 dose-response meta-analysis",
        },
        "tdcs": {
            "target": "Left DLPFC (anode)",
            "intensity": "2 mA",
            "duration": "30 min",
            "montage": "F3 anode / F4 cathode (or right orbit)",
            "sessions": "typically 10+",
            "evidence_grade": "B",
            "fda_status": "Cleared (2022) — Flow/Sohi devices",
            "effect_size": "SMD = -0.355 (p<0.001)",
            "key_reference": "Zhang et al. 2024 meta-analysis (56 studies, 2349 pts)",
        },
        "itbs": {
            "target": "Left DLPFC",
            "intensity": "120% RMT",
            "duration": "3 min/session (600 pulses)",
            "note": "Equivalent efficacy to 10 Hz standard (FDA-cleared 3-min protocol)",
            "evidence_grade": "A",
            "fda_status": "Approved (2021)",
            "key_reference": "Blumberger et al. 2018 THREE-D trial",
        },
        "rtms_tdcs_combined": {
            "note": "RCT of 240 patients: combined superior to monotherapy for MDD with anxiety",
            "anxiety_response_rate": "82.83% vs sham",
            "evidence_grade": "B",
            "key_reference": "BMJ Mental Health 2026",
        },
    },
    "treatment-resistant-depression": {
        "tms": {
            "target": "Left DLPFC (deeper with H1 coil)",
            "evidence_grade": "A",
            "fda_status": "Approved (2013) — H1 coil",
            "response_rate": "40-60%",
            "effect_size": "SMD ~0.64",
        },
        "saint": {
            "target": "fMRI-guided subgenual cingulate",
            "schedule": "10 sessions/day x 5 days = 50 sessions",
            "imaging": "fMRI-guided, neuronavigated",
            "evidence_grade": "B",
            "fda_status": "Cleared (2022) — Magnus Medical",
            "key_reference": "Cole EJ et al. SAINT trial, Am J Psychiatry 2022",
        },
        "accelerated-itbs": {
            "schedule": "5 sessions/day x 6 days = 30 sessions total",
            "device": "BrainsWay Deep TMS",
            "evidence_grade": "B",
            "fda_status": "Cleared (Sep 2025)",
            "note": "No fMRI needed; broader accessibility",
        },
        "hdtdcs": {
            "schedule": "12 days, 20 min/day",
            "approach": "Personalized neuronavigated HD-tDCS",
            "effect_size": "Cohen's d = -0.50",
            "evidence_grade": "B",
            "key_reference": "JAMA Network Open 2025",
            "note": "Faster onset than conventional approaches",
        },
    },
    "ocd": {
        "tms": {
            "target": "dmPFC (H7 coil)",
            "protocol": "H7 coil + symptom provocation before sessions",
            "evidence_grade": "B",
            "fda_status": "Approved (2018)",
            "effect_size": "Hedges' g = 0.64; OR for response = 3.15",
            "response_rate": "38-58%",
        },
    },
    "ptsd": {
        "tdcs": {
            "approach": "Dual-tDCS (bilateral DLPFC)",
            "effect_size": "SMD = -1.30 (strongest in network)",
            "evidence_grade": "B",
            "note": "Significant at endpoint but not sustained at follow-up",
            "key_reference": "Liu et al. 2024 network meta-analysis (21 RCTs, 981 pts)",
        },
        "tms": {
            "frequency_hf": "HF-rTMS SMD = -0.97",
            "frequency_itbs": "iTBS SMD = -0.93",
            "evidence_grade": "B",
            "key_reference": "Liu et al. 2024 network meta-analysis",
        },
    },
    "adhd-inattentive": {
        "nf": {
            "evidence_grade": "N",
            "grade_label": "NEGATIVE",
            "warning": "JAMA Psychiatry 2024: 38 RCTs, 2472 pts — probably-blinded SMD = 0.04 (no clinically meaningful benefit)",
            "standard_protocol_smd": "0.21 (sub-clinical)",
            "methylphenidate_comparison": "SMD -0.68 to -0.74 (significantly outperformed NF)",
            "key_reference": "Janvier ME et al. JAMA Psychiatry 2024",
        },
    },
    "adhd-combined": {
        "nf": {
            "evidence_grade": "N",
            "grade_label": "NEGATIVE",
            "warning": "JAMA Psychiatry 2024: 38 RCTs, 2472 pts — probably-blinded SMD = 0.04 (no clinically meaningful benefit)",
            "standard_protocol_smd": "0.21 (sub-clinical)",
            "key_reference": "Janvier ME et al. JAMA Psychiatry 2024",
        },
    },
    "chronic-pain": {
        "tms": {
            "target": "M1 (primary motor cortex)",
            "note": "Analgesic effects demonstrated",
            "evidence_grade": "A",
            "fda_status": "Off-label",
        },
        "tdcs": {
            "target": "Left DLPFC + M1",
            "note": "Reduces pain expectation and perception",
            "evidence_grade": "C",
        },
    },
    "fibromyalgia": {
        "tacs": {
            "frequency": "10 Hz bifrontal",
            "note": "Reduced pain vs sham; increased somatosensory alpha power",
            "evidence_grade": "C",
        },
        "tdcs": {
            "target": "Left DLPFC or M1",
            "evidence_grade": "C",
        },
    },
}

_SAFETY_LIMITS: dict[str, dict[str, Any]] = {
    "tdcs": {
        "max_duration_min": 40,
        "max_intensity_ma": 4,
        "max_charge_mc": 7.2,
        "contraindications": [
            "Metal implants in head/neck",
            "Cardiac pacemaker or ICD",
            "Skin lesions at electrode sites",
        ],
        "pediatric_note": "Well tolerated in 1080+ sessions (ages <10y); mild erythema most common AE. Shorter duration, lower intensity, smaller electrodes recommended.",
    },
    "tms": {
        "max_pulses_per_session": 6000,
        "max_sessions_per_day": 10,
        "contraindications": [
            "Ferromagnetic implants <30cm from coil",
            "Seizure disorder (relative — risk ~0.01-0.1% per session)",
            "Pregnancy (relative — limited data)",
            "Cochlear implant",
        ],
        "pediatric_note": "Safe in <18y; only mild transient side effects reported. NeuroStar cleared ages 15-21 (2024).",
    },
    "tacs": {
        "max_intensity_ma": 4,
        "max_duration_min": 40,
        "contraindications": [
            "Seizure disorder or epilepsy (gamma frequency risk)",
            "Cardiac pacemaker",
        ],
    },
    "tavns": {
        "max_intensity_ma": 5,
        "max_duration_min": 60,
        "contraindications": [
            "Active implant in head/neck (including cochlear implant)",
            "Bradycardia or arrhythmia",
            "Cervical vagal nerve lesion",
            "Recent (<3mo) TIA/stroke",
        ],
    },
}


@router.get("/evidence-params/{condition}/{modality}")
def protocol_studio_evidence_params(
    condition: str,
    modality: str,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    """Return research-derived evidence parameters for a condition-modality pair.

    Decision-support only: these are literature-summarised defaults, not
    patient-specific prescriptions. Always requires clinician review.
    """
    require_minimum_role(actor, "clinician")
    params = _PROTOCOL_EVIDENCE_PARAMS.get(condition, {}).get(modality)
    if not params:
        return {
            "condition": condition,
            "modality": modality,
            "available": False,
            "message": "No research-derived parameters available for this condition-modality pair.",
        }
    _audit(
        db,
        actor=actor,
        action="protocol_studio.evidence_params_viewed",
        target_id=f"{condition}/{modality}",
        note=f"grade={params.get('evidence_grade', 'N/A')}; fda={bool(params.get('fda_status'))}",
    )
    return {"condition": condition, "modality": modality, "available": True, "params": params}


class _SafetyCheckRequest(BaseModel):
    modality: str
    proposed_duration_min: float | None = None
    proposed_intensity_ma: float | None = None
    proposed_sessions_per_day: int | None = None
    patient_has_pacemaker: bool = False
    patient_has_seizure_history: bool = False
    patient_age_years: int | None = None


@router.post("/safety-check")
def protocol_studio_safety_check(
    body: _SafetyCheckRequest,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    """Validate proposed protocol parameters against research-derived safety limits.

    Returns warnings and contraindication flags. Decision-support only —
    not a substitute for clinical judgment or manufacturer guidelines.
    """
    require_minimum_role(actor, "clinician")
    limits = _SAFETY_LIMITS.get(body.modality)
    warnings: list[str] = []
    contraindications: list[str] = []

    if not limits:
        return {
            "modality": body.modality,
            "checked": False,
            "message": f"No safety limits configured for modality '{body.modality}'.",
        }

    # Duration check
    max_dur = limits.get("max_duration_min")
    if max_dur and body.proposed_duration_min and body.proposed_duration_min > max_dur:
        warnings.append(
            f"Proposed duration ({body.proposed_duration_min} min) exceeds "
            f"research safety limit ({max_dur} min)."
        )

    # Intensity check
    max_int = limits.get("max_intensity_ma")
    if max_int and body.proposed_intensity_ma and body.proposed_intensity_ma > max_int:
        warnings.append(
            f"Proposed intensity ({body.proposed_intensity_ma} mA) exceeds "
            f"research safety limit ({max_int} mA)."
        )

    # Sessions per day check
    max_ses = limits.get("max_sessions_per_day")
    if max_ses and body.proposed_sessions_per_day and body.proposed_sessions_per_day > max_ses:
        warnings.append(
            f"Proposed sessions/day ({body.proposed_sessions_per_day}) exceeds "
            f"research safety limit ({max_ses})."
        )

    # Patient-specific contraindications
    if body.patient_has_pacemaker:
        for c in limits.get("contraindications", []):
            if "pacemaker" in c.lower() or "ICD" in c:
                contraindications.append(c)
    if body.patient_has_seizure_history:
        for c in limits.get("contraindications", []):
            if "seizure" in c.lower() or "epilepsy" in c.lower():
                contraindications.append(c)

    # Pediatric considerations
    if body.patient_age_years is not None and body.patient_age_years < 18:
        ped_note = limits.get("pediatric_note")
        if ped_note:
            warnings.append(f"Pediatric use: {ped_note}")

    _audit(
        db,
        actor=actor,
        action="protocol_studio.safety_check",
        target_id=body.modality,
        note=f"warnings={len(warnings)}; contras={len(contraindications)}; age={body.patient_age_years}",
    )

    return {
        "modality": body.modality,
        "checked": True,
        "safety_limits": {k: v for k, v in limits.items() if k not in ("contraindications", "pediatric_note")},
        "warnings": warnings,
        "contraindications_triggered": contraindications,
        "all_contraindications": limits.get("contraindications", []),
        "pediatric_note": limits.get("pediatric_note"),
        "passes": len(warnings) == 0 and len(contraindications) == 0,
        "clinician_review_required": True,
    }
