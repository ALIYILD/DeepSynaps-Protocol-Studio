"""ToolBroker registry — declarative catalogue of pre-fetchable agent tools.

Each :class:`ToolDefinition` describes one *read-only* tool that the
ToolBroker may invoke ahead of an LLM call. The handler returns a JSON-
serialisable payload that gets folded into the ``<context>`` block sent to
the model.

Write-only tools (e.g. ``sessions.create``) are *registered* here for
visibility but carry ``handler=None`` so the broker skips them. They will
be wired up in Phase 2.5 once true LLM function-calling lands.

Scoping convention
==================
Per-row scoping in this codebase uses ``clinician_id == actor.actor_id``
(see ``apps/api/app/routers/sessions_router.py``,
``patients_router.py``, ``finance_router.py``). Tool handlers follow the
same pattern so they only ever surface data the actor is already
authorised to see through the regular REST surface.

Graceful degradation
====================
Handlers MUST NOT raise on a missing service or dependency — they return
``{"unavailable": True, "reason": "<short>"}`` instead. The broker layer
adds an additional try/except wrapper for true bugs. This mirrors the
fallback pattern in ``apps/api/app/services/openmed/adapter.py``.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
import re
from typing import TYPE_CHECKING, Any, Callable, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from app.auth import AuthenticatedActor


# NB: kept as an unparameterised ``Callable`` so Pydantic can validate the
# field without needing to resolve the ``AuthenticatedActor`` forward ref
# at class-definition time. The runtime contract is still
# ``(actor, db) -> dict | list``.
ToolHandler = Callable[..., Any]
ToolRequiredRole = Literal["clinician", "admin"]


class ToolDefinition(BaseModel):
    """Immutable description of one pre-fetchable agent tool."""

    model_config = ConfigDict(frozen=True, arbitrary_types_allowed=True)

    id: str = Field(..., description="Stable canonical id, e.g. 'sessions.list'.")
    name: str = Field(..., description="Display name for telemetry / UI hints.")
    description: str = Field(
        ...,
        description=(
            "What the tool returns; surfaced to the LLM via the context "
            "block so it knows what each key represents."
        ),
    )
    handler: Optional[ToolHandler] = Field(
        default=None,
        description=(
            "Callable invoked by the broker. ``None`` for write-only tools "
            "that are registered for documentation but skipped at runtime."
        ),
    )
    requires_role: ToolRequiredRole = Field(
        default="clinician",
        description=(
            "Defensive minimum role for invocation. Doubled with the agent "
            "role gate enforced by the router."
        ),
    )
    write_only: bool = Field(
        default=False,
        description=(
            "Marks tools that mutate state and therefore cannot be safely "
            "pre-fetched. Skipped by the broker."
        ),
    )


def is_write_tool(tool: ToolDefinition) -> bool:
    """Return True if ``tool`` is write-only or has no handler."""
    return tool.write_only or tool.handler is None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _patient_full_name(first: str | None, last: str | None) -> str:
    return " ".join(p for p in (first, last) if p).strip() or "(no name)"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


_PATIENT_ID_RE = re.compile(
    r"\bpatient(?:_id)?\s*[:=#]?\s*([A-Za-z0-9][A-Za-z0-9._:-]{2,})\b",
    re.IGNORECASE,
)
_TARGET_RULES: tuple[tuple[str, str, str], ...] = (
    ("frontal alpha asymmetry", "frontal_alpha_asymmetry", "biomarker"),
    ("hippocampal atrophy", "hippocampal_atrophy", "biomarker"),
    ("protocol ranking", "protocol_ranking", "recommendation"),
    ("treatment-resistant depression", "protocol_ranking", "recommendation"),
    ("depression risk", "depression_risk", "prediction"),
    ("anxiety risk", "anxiety_risk", "risk_score"),
    ("stress load", "stress_load", "risk_score"),
    ("voice affect", "voice_affect", "multimodal_summary"),
    ("text sentiment", "text_sentiment", "multimodal_summary"),
)


def _extract_patient_id(message: str | None) -> str | None:
    if not message:
        return None
    match = _PATIENT_ID_RE.search(message)
    return match.group(1) if match else None


def _match_evidence_target(message: str | None) -> tuple[str, str] | None:
    if not message:
        return None
    haystack = message.lower()
    for needle, target_name, context_type in _TARGET_RULES:
        if needle in haystack:
            return target_name, context_type
    if " tms " in f" {haystack} " or "rtms" in haystack or "tdcs" in haystack:
        return "protocol_ranking", "recommendation"
    return None


def _guess_condition_filters(message: str | None) -> list[str]:
    if not message:
        return []
    haystack = message.lower()
    out: list[str] = []
    if "depression" in haystack or "mdd" in haystack:
        out.append("depression")
    if "anxiety" in haystack or "gad" in haystack:
        out.append("anxiety")
    if "ocd" in haystack:
        out.append("ocd")
    return out


def _guess_modality_filters(message: str | None) -> list[str]:
    if not message:
        return []
    haystack = message.lower()
    out: list[str] = []
    for needle, label in (
        ("rtms", "rtms"),
        ("tms", "neuromodulation"),
        ("tdcs", "tdcs"),
        ("qeeg", "qeeg"),
        ("eeg", "qeeg"),
        ("mri", "mri"),
        ("voice", "voice"),
        ("text", "text"),
    ):
        if needle in haystack and label not in out:
            out.append(label)
    return out


def _require_patient_scope(
    actor: "AuthenticatedActor",
    db: "Session",
    patient_id: str,
) -> str | None:
    from app.auth import require_patient_owner
    from app.errors import ApiServiceError
    from app.repositories.patients import resolve_patient_clinic_id

    exists, clinic_id = resolve_patient_clinic_id(db, patient_id)
    if not exists:
        raise ApiServiceError(
            code="not_found",
            message="Patient not found.",
            status_code=404,
        )
    require_patient_owner(actor, clinic_id)
    return clinic_id


def _h_evidence_query(
    actor: "AuthenticatedActor",
    db: "Session",
    *,
    message: str | None = None,
) -> dict:
    from app.services.agent_brain.providers.evidence import EvidenceProvider
    from app.services.agent_brain.schemas import ProviderQuery
    from app.services.evidence_intelligence import EvidenceQuery, query_evidence

    patient_id = _extract_patient_id(message)
    matched = _match_evidence_target(message)
    if patient_id and matched:
        _require_patient_scope(actor, db, patient_id)
        target_name, context_type = matched
        result = query_evidence(
            EvidenceQuery(
                patient_id=patient_id,
                context_type=context_type,  # type: ignore[arg-type]
                target_name=target_name,
                modality_filters=_guess_modality_filters(message),
                diagnosis_filters=_guess_condition_filters(message),
                include_counter_evidence=True,
            ),
            db,
        )
        return {
            "mode": "patient_intelligence",
            "patient_id": patient_id,
            "target_name": result.target_name,
            "claim": result.claim,
            "evidence_strength": result.evidence_strength,
            "confidence_score": result.confidence_score,
            "top_papers": [p.model_dump(mode="json") for p in result.supporting_papers[:5]],
            "conflicting_papers": [
                p.model_dump(mode="json") for p in result.conflicting_papers[:3]
            ],
            "literature_summary": result.literature_summary,
            "recommended_caution": result.recommended_caution,
            "provenance": result.provenance.model_dump(mode="json"),
        }

    provider = EvidenceProvider()
    response = provider.query(
        ProviderQuery(
            provider="evidence",
            query=(message or "").strip(),
            condition=(_guess_condition_filters(message) or [None])[0],
            include_citations=True,
        ),
        actor_id=actor.actor_id,
        actor_role=actor.role,
        session=db,
    )
    return {
        "mode": "provider_fallback",
        "answer": response.answer,
        "items": response.items[:5],
        "citations": [c.model_dump(mode="json") for c in response.citations[:5]],
        "safety_flags": response.safety_flags,
        "source_metadata": response.source_metadata,
        "confidence": response.confidence,
        "requires_clinician_review": response.requires_clinician_review,
    }


def _h_evidence_patient_overview(
    actor: "AuthenticatedActor",
    db: "Session",
    *,
    message: str | None = None,
) -> dict:
    from app.services.evidence_intelligence import build_patient_overview

    patient_id = _extract_patient_id(message)
    if not patient_id:
        return {
            "unavailable": True,
            "reason": "patient_id_required",
            "hint": "Include `patient_id: <id>` in the message to load evidence context.",
        }
    _require_patient_scope(actor, db, patient_id)
    overview = build_patient_overview(patient_id, db)
    return overview.model_dump(mode="json")


def _h_evidence_literature_search(
    actor: "AuthenticatedActor",
    db: "Session",
    *,
    message: str | None = None,
) -> dict:
    from sqlalchemy import or_

    from app.persistence.models import DsPaper, LiteraturePaper

    _ = actor
    raw = (message or "").strip()
    if not raw:
        return {"items": [], "count": 0, "reason": "empty_query"}

    tokens = [t for t in re.split(r"\s+", raw) if t][:8]
    doi_match = re.search(r"\b10\.\d{4,9}/[^\s,;]+", raw, re.IGNORECASE)
    pmid_match = re.search(r"\b(?:pmid:?\s*)?(\d{6,9})\b", raw, re.IGNORECASE)

    ds_query = db.query(DsPaper)
    lib_query = db.query(LiteraturePaper)
    if doi_match:
        doi = doi_match.group(0)
        ds_query = ds_query.filter(DsPaper.doi == doi)
        lib_query = lib_query.filter(LiteraturePaper.doi == doi)
    elif pmid_match:
        pmid = pmid_match.group(1)
        ds_query = ds_query.filter(DsPaper.pmid == pmid)
        lib_query = lib_query.filter(LiteraturePaper.pubmed_id == pmid)
    else:
        ds_query = ds_query.filter(or_(*[DsPaper.title.ilike(f"%{t}%") for t in tokens[:3]]))
        lib_query = lib_query.filter(or_(*[LiteraturePaper.title.ilike(f"%{t}%") for t in tokens[:3]]))

    ds_rows = ds_query.order_by(DsPaper.year.desc(), DsPaper.created_at.desc()).limit(5).all()
    lib_rows = (
        lib_query.order_by(LiteraturePaper.year.desc(), LiteraturePaper.created_at.desc())
        .limit(5)
        .all()
    )
    items = [
        {
            "source": "ds_papers",
            "paper_id": row.id,
            "title": row.title,
            "year": row.year,
            "journal": row.journal,
            "pmid": row.pmid,
            "doi": row.doi,
            "url": row.oa_url,
        }
        for row in ds_rows
    ] + [
        {
            "source": "literature_library",
            "paper_id": row.id,
            "title": row.title,
            "year": row.year,
            "journal": row.journal,
            "pmid": row.pubmed_id,
            "doi": row.doi,
            "url": row.url,
        }
        for row in lib_rows
    ]
    return {"items": items[:8], "count": len(items[:8]), "query": raw}


def _h_evidence_status(
    actor: "AuthenticatedActor",
    db: "Session",
) -> dict:
    from sqlalchemy import case, func

    from app.persistence.models import DsPaper, EvidenceSavedCitation, LiteraturePaper, Patient, User
    from app.services.evidence_terminal_service import resolve_evidence_db_path

    ds_paper_count = int(db.query(func.count(DsPaper.id)).scalar() or 0)
    literature_paper_count = int(db.query(func.count(LiteraturePaper.id)).scalar() or 0)
    pending_expr = case(
        (
            EvidenceSavedCitation.citation_payload_json.like(
                '%"approval_status": "pending_clinician_review"%'
            ),
            1,
        ),
        else_=0,
    )
    unverified_expr = case(
        (
            EvidenceSavedCitation.citation_payload_json.like('%"status": "unverified"%'),
            1,
        ),
        else_=0,
    )
    citation_counts = db.query(
        func.sum(pending_expr).label("pending"),
        func.sum(unverified_expr).label("unverified"),
    )
    if actor.clinic_id:
        citation_counts = (
            citation_counts.join(Patient, Patient.id == EvidenceSavedCitation.patient_id)
            .join(User, User.id == Patient.clinician_id, isouter=True)
            .filter(User.clinic_id == actor.clinic_id)
        )
    elif actor.role != "admin":
        return {
            "source_kind": "bundled_fallback",
            "source_label": "Bundled evidence snapshot",
            "paper_count": 0,
            "trial_count": 0,
            "device_count": 0,
            "protocol_count": 0,
            "indication_count": 0,
            "meta_analysis_count": None,
            "ds_paper_count": ds_paper_count,
            "literature_paper_count": literature_paper_count,
            "pending_review_citation_count": 0,
            "unverified_saved_citation_count": 0,
            "updated_at": None,
            "generated_at": _utcnow().isoformat(),
            "degraded_reason": None,
        }
    counts_row = citation_counts.one()
    pending_review_citation_count = int(counts_row.pending or 0)
    unverified_saved_citation_count = int(counts_row.unverified or 0)
    path = resolve_evidence_db_path()
    base = {
        "source_kind": "bundled_fallback",
        "source_label": "Bundled evidence snapshot",
        "paper_count": 0,
        "trial_count": 0,
        "device_count": 0,
        "protocol_count": 0,
        "indication_count": 0,
        "meta_analysis_count": None,
        "ds_paper_count": ds_paper_count,
        "literature_paper_count": literature_paper_count,
        "pending_review_citation_count": pending_review_citation_count,
        "unverified_saved_citation_count": unverified_saved_citation_count,
        "updated_at": None,
        "generated_at": _utcnow().isoformat(),
        "degraded_reason": None,
    }
    try:
        import os
        import sqlite3

        if not os.path.exists(path):
            return base
        conn = sqlite3.connect(path, timeout=5)
        conn.execute("PRAGMA query_only = 1")
        payload = {
            **base,
            "source_kind": "live_sqlite",
            "source_label": "SQLite evidence corpus",
            "paper_count": int(conn.execute("SELECT count(*) FROM papers").fetchone()[0]),
            "trial_count": int(conn.execute("SELECT count(*) FROM trials").fetchone()[0]),
            "device_count": int(conn.execute("SELECT count(*) FROM devices").fetchone()[0]),
            "protocol_count": int(conn.execute("SELECT count(*) FROM protocols").fetchone()[0]),
            "indication_count": int(conn.execute("SELECT count(*) FROM indications").fetchone()[0]),
            "updated_at": conn.execute("SELECT MAX(last_ingested) FROM papers").fetchone()[0],
            "degraded_reason": None,
        }
        conn.close()
        return payload
    except Exception as exc:  # pragma: no cover - defensive
        return {
            **base,
            "source_kind": "degraded",
            "source_label": "Evidence DB degraded",
            "degraded_reason": type(exc).__name__,
        }


# ---------------------------------------------------------------------------
# Read handlers — keep each ≤ ~15 lines. All filter by actor.actor_id, which
# matches the clinician_id column on every domain table. Returning a dict
# (or list) is required so the broker can JSON-serialise.
# ---------------------------------------------------------------------------


def _h_sessions_list(actor: "AuthenticatedActor", db: "Session") -> dict:
    from app.persistence.models import ClinicalSession, Patient

    horizon = (_utcnow() + timedelta(days=7)).isoformat()
    rows = (
        db.query(ClinicalSession)
        .filter(ClinicalSession.clinician_id == actor.actor_id)
        .filter(ClinicalSession.scheduled_at <= horizon)
        .order_by(ClinicalSession.scheduled_at.asc())
        .limit(25)
        .all()
    )
    patient_ids = {r.patient_id for r in rows}
    patients = {
        p.id: p for p in db.query(Patient).filter(Patient.id.in_(patient_ids)).all()
    } if patient_ids else {}
    items = [
        {
            "id": r.id,
            "patient_name": _patient_full_name(
                getattr(patients.get(r.patient_id), "first_name", None),
                getattr(patients.get(r.patient_id), "last_name", None),
            ),
            "start_at": r.scheduled_at,
            "type": r.appointment_type,
            "status": r.status,
        }
        for r in rows
    ]
    return {"items": items, "count": len(items)}


def _h_patients_search(actor: "AuthenticatedActor", db: "Session") -> dict:
    from app.persistence.models import ClinicalSession, Patient

    rows = (
        db.query(Patient)
        .filter(Patient.clinician_id == actor.actor_id)
        .order_by(Patient.created_at.desc())
        .limit(25)
        .all()
    )
    last_session: dict[str, str] = {}
    if rows:
        from sqlalchemy import func

        ids = [r.id for r in rows]
        for pid, last_at in (
            db.query(ClinicalSession.patient_id, func.max(ClinicalSession.scheduled_at))
            .filter(ClinicalSession.patient_id.in_(ids))
            .group_by(ClinicalSession.patient_id)
            .all()
        ):
            last_session[pid] = last_at
    items = [
        {
            "id": p.id,
            "full_name": _patient_full_name(p.first_name, p.last_name),
            "primary_condition": p.primary_condition,
            "last_session_at": last_session.get(p.id),
        }
        for p in rows
    ]
    return {"items": items, "count": len(items)}


def _h_forms_list(actor: "AuthenticatedActor", db: "Session") -> dict:
    from app.persistence.models import FormDefinition

    rows = (
        db.query(FormDefinition)
        .filter(FormDefinition.clinician_id == actor.actor_id)
        .filter(FormDefinition.status == "active")
        .order_by(FormDefinition.updated_at.desc())
        .limit(25)
        .all()
    )
    items = [{"id": r.id, "name": r.title, "type": r.form_type} for r in rows]
    return {"items": items, "count": len(items)}


def _h_consent_status(actor: "AuthenticatedActor", db: "Session") -> dict:
    from sqlalchemy import func

    from app.persistence.models import ConsentRecord

    rows = (
        db.query(ConsentRecord.status, func.count(ConsentRecord.id))
        .filter(ConsentRecord.clinician_id == actor.actor_id)
        .group_by(ConsentRecord.status)
        .all()
    )
    counts = {"active": 0, "expired": 0, "pending": 0}
    for status, count in rows:
        counts[status] = int(count)
    return {"counts": counts}


def _h_outcomes_summary(actor: "AuthenticatedActor", db: "Session") -> dict:
    from app.persistence.models import OutcomeSeries

    cutoff = _utcnow() - timedelta(weeks=4)
    rows = (
        db.query(OutcomeSeries)
        .filter(OutcomeSeries.clinician_id == actor.actor_id)
        .filter(OutcomeSeries.administered_at >= cutoff)
        .filter(OutcomeSeries.template_id.ilike("phq%"))
        .order_by(OutcomeSeries.patient_id, OutcomeSeries.administered_at)
        .all()
    )
    # Group by patient to compute deltas vs first reading in window.
    by_patient: dict[str, list] = {}
    for r in rows:
        if r.score_numeric is None:
            continue
        by_patient.setdefault(r.patient_id, []).append(r)
    weekly: dict[int, list[float]] = {0: [], 1: [], 2: [], 3: []}
    responders = 0
    total = 0
    for series in by_patient.values():
        if len(series) < 2:
            continue
        baseline = float(series[0].score_numeric)
        latest = float(series[-1].score_numeric)
        if baseline <= 0:
            continue
        total += 1
        delta_pct = (latest - baseline) / baseline
        if delta_pct <= -0.5:
            responders += 1
        for r in series[1:]:
            week = min(3, max(0, (r.administered_at - series[0].administered_at).days // 7))
            weekly[week].append(float(r.score_numeric) - baseline)
    weekly_mean = {
        f"week_{k}": (sum(v) / len(v)) if v else None for k, v in weekly.items()
    }
    return {
        "weekly_mean_phq9_delta": weekly_mean,
        "responder_rate": (responders / total) if total else None,
        "responder_count": responders,
        "patients_in_window": total,
    }


def _h_treatment_courses_list(actor: "AuthenticatedActor", db: "Session") -> dict:
    from app.persistence.models import Patient, TreatmentCourse

    rows = (
        db.query(TreatmentCourse)
        .filter(TreatmentCourse.clinician_id == actor.actor_id)
        .filter(TreatmentCourse.status.in_(["active", "in_progress", "approved"]))
        .order_by(TreatmentCourse.updated_at.desc())
        .limit(25)
        .all()
    )
    pids = {r.patient_id for r in rows}
    patients = {
        p.id: p for p in db.query(Patient).filter(Patient.id.in_(pids)).all()
    } if pids else {}
    items = [
        {
            "id": r.id,
            "patient_name": _patient_full_name(
                getattr(patients.get(r.patient_id), "first_name", None),
                getattr(patients.get(r.patient_id), "last_name", None),
            ),
            "condition": r.condition_slug,
            "sessions_completed_of_total": (
                f"{r.sessions_delivered}/{r.planned_sessions_total}"
            ),
        }
        for r in rows
    ]
    return {"items": items, "count": len(items)}


def _h_adverse_events_list(actor: "AuthenticatedActor", db: "Session") -> dict:
    from app.persistence.models import AdverseEvent, Patient

    rows = (
        db.query(AdverseEvent)
        .filter(AdverseEvent.clinician_id == actor.actor_id)
        .filter(AdverseEvent.resolved_at.is_(None))
        .order_by(AdverseEvent.reported_at.desc())
        .limit(25)
        .all()
    )
    pids = {r.patient_id for r in rows}
    patients = {
        p.id: p for p in db.query(Patient).filter(Patient.id.in_(pids)).all()
    } if pids else {}
    items = [
        {
            "id": r.id,
            "patient_name": _patient_full_name(
                getattr(patients.get(r.patient_id), "first_name", None),
                getattr(patients.get(r.patient_id), "last_name", None),
            ),
            "severity": r.severity,
            "status": r.resolution or "open",
            "opened_at": r.reported_at,
        }
        for r in rows
    ]
    return {"items": items, "count": len(items)}


def _h_finance_summary(actor: "AuthenticatedActor", db: "Session") -> dict:
    from sqlalchemy import func

    from app.persistence.models import Invoice

    cutoff = (_utcnow() - timedelta(days=30)).date().isoformat()
    invoices = (
        db.query(Invoice)
        .filter(Invoice.clinician_id == actor.actor_id)
        .filter(Invoice.issue_date >= cutoff)
        .all()
    )
    invoiced = sum(float(i.total or 0.0) for i in invoices)
    paid = sum(float(i.paid or 0.0) for i in invoices)
    outstanding = sum(
        1 for i in invoices
        if i.status not in ("void", "paid")
        and (float(i.total or 0.0) - float(i.paid or 0.0)) > 0
    )
    _ = func  # silence unused-import lint when no aggregate query needed
    return {
        "window_days": 30,
        "total_invoiced": round(invoiced, 2),
        "total_paid": round(paid, 2),
        "count_outstanding": outstanding,
    }


def _h_notes_list(actor: "AuthenticatedActor", db: "Session") -> dict:
    """Return unsigned/draft clinician note drafts for the actor.

    The codebase has ``ClinicianNoteDraft`` (LLM-generated drafts) but no
    direct ``clinician_id`` join — drafts live keyed on ``note_id``. We
    return what we can and degrade gracefully if the join is unavailable
    in this environment.
    """
    try:
        from app.persistence.models import ClinicianNoteDraft
    except ImportError:
        return {"unavailable": True, "reason": "ClinicianNoteDraft model not available"}

    # Without a clinician_id column on the draft we surface drafts whose
    # generated_by matches the actor (covers DrClaw drafts) — and fall
    # back to "unavailable" with reason if that returns nothing
    # consistent. Keep the query bounded.
    rows = (
        db.query(ClinicianNoteDraft)
        .filter(
            (ClinicianNoteDraft.generated_by == actor.actor_id)
            | (ClinicianNoteDraft.approved_by == actor.actor_id)
        )
        .filter(ClinicianNoteDraft.status.in_(["generated", "edited"]))
        .order_by(ClinicianNoteDraft.created_at.desc())
        .limit(25)
        .all()
    )
    items = [
        {
            "id": r.id,
            "patient_name": "(see note)",  # patient join is non-trivial, omit
            "created_at": r.created_at,
            "status": r.status,
        }
        for r in rows
    ]
    return {"items": items, "count": len(items)}


def _h_tasks_list(actor: "AuthenticatedActor", db: "Session") -> dict:
    from app.persistence.models import ReceptionTask

    rows = (
        db.query(ReceptionTask)
        .filter(ReceptionTask.clinician_id == actor.actor_id)
        .filter(ReceptionTask.done.is_(False))
        .order_by(ReceptionTask.created_at.desc())
        .limit(25)
        .all()
    )
    items = [
        {
            "id": r.id,
            "title": r.text,
            "due_at": r.due,
            "source": "reception",
        }
        for r in rows
    ]
    return {"items": items, "count": len(items)}


def _h_stub_unavailable(
    actor: "AuthenticatedActor", db: "Session"
) -> dict:
    """Placeholder handler for read tools not yet wired in Phase 1.

    Returns a canonical ``{"unavailable": True, ...}`` envelope so the
    broker can JSON-serialise the result without raising. Swapped for a
    real implementation in a follow-up phase.
    """
    _ = actor, db
    return {"unavailable": True, "reason": "tool not yet wired in Phase 1"}


# ── Patient-side tools (gated; pending clinical signoff) ──────────────
# These handlers back the four patient-side agents in the marketplace.
# They are registered for visibility but every handler short-circuits to
# ``{"unavailable": True, ...}`` so that *if* the package gate is ever
# unlocked prematurely no fake data leaks into the LLM context. Replace
# the bodies with real queries during the clinical-signoff diff — at
# that point the patient agents go from "Upgrade required" tiles to
# live, callable agents.

_PATIENT_TOOL_UNAVAILABLE = {
    "unavailable": True,
    "reason": "patient-side tools require clinical-signoff before activation",
}


def _h_patient_unavailable(
    actor: "AuthenticatedActor", db: "Session"
) -> dict:
    """Stub handler shared by every patient-side tool.

    Returns the canonical "unavailable" envelope. Kept as a single
    function so the placeholder behaviour is impossible to drift between
    tools — when one is wired up for real, swap the registry entry's
    ``handler`` to a real implementation rather than editing this
    function.
    """
    # ``actor`` and ``db`` are accepted to match the broker contract but
    # deliberately unused — there is nothing to fetch yet.
    _ = actor, db
    return dict(_PATIENT_TOOL_UNAVAILABLE)


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------

TOOL_REGISTRY: dict[str, ToolDefinition] = {
    "sessions.list": ToolDefinition(
        id="sessions.list",
        name="Upcoming sessions",
        description=(
            "Up to 25 of the next 7 days of clinical sessions for the actor. "
            "Each item: id, patient_name, start_at, type, status."
        ),
        handler=_h_sessions_list,
        requires_role="clinician",
    ),
    "sessions.create": ToolDefinition(
        id="sessions.create",
        name="Create session",
        description=(
            "WRITE: schedule a new session. Not pre-fetched. "
            "Wired in Phase 2.5 via LLM function-calling."
        ),
        handler=None,
        requires_role="clinician",
        write_only=True,
    ),
    "sessions.cancel": ToolDefinition(
        id="sessions.cancel",
        name="Cancel session",
        description=(
            "WRITE: cancel an existing session. Not pre-fetched. "
            "Wired in Phase 2.5 via LLM function-calling."
        ),
        handler=None,
        requires_role="clinician",
        write_only=True,
    ),
    "patients.search": ToolDefinition(
        id="patients.search",
        name="Recent patients",
        description=(
            "Most recent 25 patients on the actor's roster. Each item: id, "
            "full_name, primary_condition, last_session_at."
        ),
        handler=_h_patients_search,
        requires_role="clinician",
    ),
    "forms.list": ToolDefinition(
        id="forms.list",
        name="Active forms",
        description="Active form definitions: id, name, type.",
        handler=_h_forms_list,
        requires_role="clinician",
    ),
    "consent.status": ToolDefinition(
        id="consent.status",
        name="Consent counts",
        description="Counts of consent records by status (active/expired/pending).",
        handler=_h_consent_status,
        requires_role="clinician",
    ),
    "outcomes.summary": ToolDefinition(
        id="outcomes.summary",
        name="Outcomes summary",
        description=(
            "Last 4 weeks: per-week mean PHQ-9 delta and responder rate "
            "(>=50%% reduction from baseline)."
        ),
        handler=_h_outcomes_summary,
        requires_role="clinician",
    ),
    "treatment_courses.list": ToolDefinition(
        id="treatment_courses.list",
        name="Active treatment courses",
        description=(
            "Up to 25 active courses. Each item: id, patient_name, "
            "condition, sessions_completed_of_total."
        ),
        handler=_h_treatment_courses_list,
        requires_role="clinician",
    ),
    "adverse_events.list": ToolDefinition(
        id="adverse_events.list",
        name="Open adverse events",
        description=(
            "Open (unresolved) AEs. Each item: id, patient_name, severity, "
            "status, opened_at."
        ),
        handler=_h_adverse_events_list,
        requires_role="clinician",
    ),
    "finance.summary": ToolDefinition(
        id="finance.summary",
        name="Finance summary",
        description=(
            "Last 30 days: total invoiced, total paid, count outstanding."
        ),
        handler=_h_finance_summary,
        requires_role="admin",
    ),
    "notes.list": ToolDefinition(
        id="notes.list",
        name="Unsigned clinical note drafts",
        description=(
            "Up to 25 unsigned/draft clinical notes. Each item: id, "
            "patient_name, created_at, status."
        ),
        handler=_h_notes_list,
        requires_role="clinician",
    ),
    "notes.approve_draft": ToolDefinition(
        id="notes.approve_draft",
        name="Approve note draft",
        description=(
            "WRITE: approve a generated note draft. Not pre-fetched. "
            "Wired in Phase 2.5 via LLM function-calling."
        ),
        handler=None,
        requires_role="clinician",
        write_only=True,
    ),
    "tasks.list": ToolDefinition(
        id="tasks.list",
        name="Open tasks",
        description=(
            "Up to 25 open tasks for the actor. Each item: id, title, "
            "due_at, source."
        ),
        handler=_h_tasks_list,
        requires_role="clinician",
    ),
    "tasks.create": ToolDefinition(
        id="tasks.create",
        name="Create task",
        description=(
            "Create a follow-up task in the clinic queue. Patient "
            "binding is optional."
        ),
        handler=None,
        requires_role="clinician",
        write_only=True,
    ),
    # ── Phase 1 expansion placeholders (read stubs + write stubs) ─────
    "patients.list": ToolDefinition(
        id="patients.list",
        name="All patients",
        description=(
            "Returns all patients on the actor's roster. STUB — not yet "
            "wired in Phase 1."
        ),
        handler=_h_stub_unavailable,
        requires_role="clinician",
    ),
    "vitals.recent": ToolDefinition(
        id="vitals.recent",
        name="Recent vitals",
        description=(
            "Recent vital-sign readings for a patient. STUB — not yet "
            "wired in Phase 1."
        ),
        handler=_h_stub_unavailable,
        requires_role="clinician",
    ),
    "sessions.today": ToolDefinition(
        id="sessions.today",
        name="Today's sessions",
        description=(
            "Clinical sessions scheduled for today. STUB — not yet wired "
            "in Phase 1."
        ),
        handler=_h_stub_unavailable,
        requires_role="clinician",
    ),
    "notes.draft": ToolDefinition(
        id="notes.draft",
        name="Draft note",
        description=(
            "WRITE: create a draft clinical note. Not pre-fetched. "
            "Wired in a follow-up phase via LLM function-calling."
        ),
        handler=None,
        requires_role="clinician",
        write_only=True,
    ),
    "rooms.schedule": ToolDefinition(
        id="rooms.schedule",
        name="Room schedule",
        description=(
            "Room availability and booking schedule. STUB — not yet "
            "wired in Phase 1."
        ),
        handler=_h_stub_unavailable,
        requires_role="clinician",
    ),
    "invoices.pending": ToolDefinition(
        id="invoices.pending",
        name="Pending invoices",
        description=(
            "Outstanding invoices awaiting payment. STUB — not yet wired "
            "in Phase 1."
        ),
        handler=_h_stub_unavailable,
        requires_role="admin",
    ),
    "inventory.list": ToolDefinition(
        id="inventory.list",
        name="Inventory list",
        description=(
            "Clinic inventory items and stock levels. STUB — not yet "
            "wired in Phase 1."
        ),
        handler=_h_stub_unavailable,
        requires_role="clinician",
    ),
    "clinic.settings": ToolDefinition(
        id="clinic.settings",
        name="Clinic settings",
        description=(
            "Operational settings for the clinic. STUB — not yet wired "
            "in Phase 1."
        ),
        handler=_h_stub_unavailable,
        requires_role="admin",
    ),
    "clinic.kpis": ToolDefinition(
        id="clinic.kpis",
        name="Clinic KPIs",
        description=(
            "Key performance indicators for the clinic. STUB — not yet "
            "wired in Phase 1."
        ),
        handler=_h_stub_unavailable,
        requires_role="admin",
    ),
    "escalation.chains": ToolDefinition(
        id="escalation.chains",
        name="Escalation chains",
        description=(
            "Configured escalation chains and contacts. STUB — not yet "
            "wired in Phase 1."
        ),
        handler=_h_stub_unavailable,
        requires_role="admin",
    ),
    "staff.roster": ToolDefinition(
        id="staff.roster",
        name="Staff roster",
        description=(
            "Clinic staff roster and role assignments. STUB — not yet "
            "wired in Phase 1."
        ),
        handler=_h_stub_unavailable,
        requires_role="clinician",
    ),
    "protocols.recommend": ToolDefinition(
        id="protocols.recommend",
        name="Protocol recommendations",
        description=(
            "Evidence-based protocol recommendations. STUB — not yet "
            "wired in Phase 1."
        ),
        handler=_h_stub_unavailable,
        requires_role="clinician",
    ),
    "patients.summary": ToolDefinition(
        id="patients.summary",
        name="Patient summary",
        description=(
            "Condensed summary for a specific patient. STUB — not yet "
            "wired in Phase 1."
        ),
        handler=_h_stub_unavailable,
        requires_role="clinician",
    ),
    "assessments.recent": ToolDefinition(
        id="assessments.recent",
        name="Recent assessments",
        description=(
            "Recent clinical assessments and outcome scores. STUB — not "
            "yet wired in Phase 1."
        ),
        handler=_h_stub_unavailable,
        requires_role="clinician",
    ),
    "reports.draft": ToolDefinition(
        id="reports.draft",
        name="Draft report",
        description=(
            "WRITE: generate a draft clinical report. Not pre-fetched. "
            "Wired in a follow-up phase via LLM function-calling."
        ),
        handler=None,
        requires_role="clinician",
        write_only=True,
    ),
    "contraindications.check": ToolDefinition(
        id="contraindications.check",
        name="Contraindication check",
        description=(
            "Check contraindications for a patient or protocol. STUB — "
            "not yet wired in Phase 1."
        ),
        handler=_h_stub_unavailable,
        requires_role="clinician",
    ),
    "conditions.lookup": ToolDefinition(
        id="conditions.lookup",
        name="Condition lookup",
        description=(
            "Lookup clinical conditions and symptom profiles. STUB — not "
            "yet wired in Phase 1."
        ),
        handler=_h_stub_unavailable,
        requires_role="clinician",
    ),
    "evidence.query": ToolDefinition(
        id="evidence.query",
        name="Evidence query",
        description=(
            "Decision-support evidence query grounded in the existing "
            "evidence provider and evidence-intelligence stack."
        ),
        handler=_h_evidence_query,
        requires_role="clinician",
    ),
    "evidence.patient_overview": ToolDefinition(
        id="evidence.patient_overview",
        name="Patient evidence overview",
        description=(
            "Patient-scoped evidence overview from the existing "
            "`build_patient_overview()` flow. Requires an authorised "
            "`patient_id` in the message."
        ),
        handler=_h_evidence_patient_overview,
        requires_role="clinician",
    ),
    "evidence.literature_search": ToolDefinition(
        id="evidence.literature_search",
        name="Literature search",
        description=(
            "Identifier- or title-based search across the existing "
            "`ds_papers` and `literature_papers` corpora."
        ),
        handler=_h_evidence_literature_search,
        requires_role="clinician",
    ),
    "evidence.status": ToolDefinition(
        id="evidence.status",
        name="Evidence operational status",
        description=(
            "Labeled operational evidence status: live/degraded source kind, "
            "paper/trial/device/protocol counts, and local corpus counts."
        ),
        handler=_h_evidence_status,
        requires_role="clinician",
    ),
    "evidence.draft_report_citations": ToolDefinition(
        id="evidence.draft_report_citations",
        name="Draft report citations",
        description=(
            "WRITE: draft evidence citations for clinician review. Not "
            "pre-fetched; remains approval-gated."
        ),
        handler=None,
        requires_role="clinician",
        write_only=True,
    ),
    "evidence.save_citation_request": ToolDefinition(
        id="evidence.save_citation_request",
        name="Save citation request",
        description=(
            "WRITE: propose saving a citation for later review. Not "
            "pre-fetched; remains approval-gated."
        ),
        handler=None,
        requires_role="clinician",
        write_only=True,
    ),
    # ── Patient-side tools (gated; pending clinical signoff) ──────────
    # All seven of these back the patient-side agents in the marketplace.
    # The handler always returns ``{"unavailable": True, ...}`` — that
    # is the entire point: if the package gate ever leaks, the LLM gets
    # a clear "no data" envelope instead of plausible-looking fakes.
    # ``requires_role="clinician"`` because the clinic operates these on
    # the patient's behalf.
    "assessments.recent_for_patient": ToolDefinition(
        id="assessments.recent_for_patient",
        name="Recent patient assessments (gated)",
        description=(
            "PATIENT-SIDE STUB — pending clinical signoff. Will return "
            "the patient's recent self-report assessments (mood, PHQ-9, "
            "GAD-7) once activated. Returns an unavailable envelope "
            "today."
        ),
        handler=_h_patient_unavailable,
        requires_role="clinician",
    ),
    "tasks.list_for_patient": ToolDefinition(
        id="tasks.list_for_patient",
        name="Patient task list (gated)",
        description=(
            "PATIENT-SIDE STUB — pending clinical signoff. Will return "
            "the patient's outstanding home-program / reminder tasks "
            "once activated. Returns an unavailable envelope today."
        ),
        handler=_h_patient_unavailable,
        requires_role="clinician",
    ),
    "medications.active_for_patient": ToolDefinition(
        id="medications.active_for_patient",
        name="Active patient medications (gated)",
        description=(
            "PATIENT-SIDE STUB — pending clinical signoff. Will return "
            "the patient's clinician-prescribed active medication list "
            "once activated. Returns an unavailable envelope today."
        ),
        handler=_h_patient_unavailable,
        requires_role="clinician",
    ),
    "treatment_courses.active_for_patient": ToolDefinition(
        id="treatment_courses.active_for_patient",
        name="Active patient treatment courses (gated)",
        description=(
            "PATIENT-SIDE STUB — pending clinical signoff. Will return "
            "the patient's currently active treatment course summary "
            "once activated. Returns an unavailable envelope today."
        ),
        handler=_h_patient_unavailable,
        requires_role="clinician",
    ),
    "evidence.search": ToolDefinition(
        id="evidence.search",
        name="Clinic-approved evidence search (gated)",
        description=(
            "PATIENT-SIDE STUB — pending clinical signoff. Will search "
            "the clinic's approved evidence corpus and return source-"
            "cited extracts once activated. Returns an unavailable "
            "envelope today."
        ),
        handler=_h_patient_unavailable,
        requires_role="clinician",
    ),
    "patient.condition": ToolDefinition(
        id="patient.condition",
        name="Patient primary condition (gated)",
        description=(
            "PATIENT-SIDE STUB — pending clinical signoff. Will return "
            "the patient's primary condition slug + clinician-authored "
            "context once activated. Returns an unavailable envelope "
            "today."
        ),
        handler=_h_patient_unavailable,
        requires_role="clinician",
    ),
    "risk.escalation_path": ToolDefinition(
        id="risk.escalation_path",
        name="Risk escalation path (gated)",
        description=(
            "PATIENT-SIDE STUB — pending clinical signoff. Will return "
            "the clinic's configured crisis-escalation contacts and "
            "protocol once activated. Returns an unavailable envelope "
            "today."
        ),
        handler=_h_patient_unavailable,
        requires_role="clinician",
    ),
    "clinic.emergency_contact": ToolDefinition(
        id="clinic.emergency_contact",
        name="Clinic emergency contact (gated)",
        description=(
            "PATIENT-SIDE STUB — pending clinical signoff. Will return "
            "the on-call clinician + emergency phone numbers once "
            "activated. Returns an unavailable envelope today."
        ),
        handler=_h_patient_unavailable,
        requires_role="clinician",
    ),
}


__all__ = [
    "TOOL_REGISTRY",
    "ToolDefinition",
    "ToolHandler",
    "ToolRequiredRole",
    "is_write_tool",
]
