from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Literal, Optional, TypedDict

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor
from app.persistence.models import DeepTwinAnalysisRun, MriAnalysis, PrescribedProtocol, QEEGAnalysis
from app.services import evidence_rag
from app.services.registries import get_protocol as registry_get_protocol
from app.services.registries import list_protocols as registry_list_protocols


Mode = Literal["evidence_search", "qeeg_guided", "mri_guided", "deeptwin_personalized", "multimodal"]
DraftStatus = Literal[
    "draft_requires_review",
    "insufficient_evidence",
    "needs_more_data",
    "blocked_requires_review",
    "research_only_not_prescribable",
]


def _iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _normalize_off_label(text: str | None) -> bool:
    raw = (text or "").strip().lower()
    if raw.startswith("off"):
        return True
    if raw.startswith("on"):
        return False
    return True


_OFF_LABEL_WARNING = (
    "Off-label protocol: clinician decision-support only. Requires explicit clinician review and acknowledgement before use."
)


class GenerateRequest(TypedDict, total=False):
    patient_id: str | None
    mode: Mode
    condition: str
    modality: str
    target: str | None
    protocol_id: str | None
    include_off_label: bool
    constraints: dict[str, Any]


class EvidenceLink(TypedDict):
    id: str
    title: str | None
    link: str | None
    retrieval_source: str
    retrieved_at: str


class DraftResponse(TypedDict):
    draft_id: str | None
    status: DraftStatus
    mode: Mode
    protocol_summary: str
    parameters: dict[str, Any]
    rationale: list[str]
    evidence_links: list[EvidenceLink]
    evidence_grade: str | None
    regulatory_status: str | None
    off_label: bool
    off_label_warning: str | None
    contraindications: list[str]
    missing_data: list[str]
    uncertainty: str
    patient_context_used: dict[str, Any]
    safety_status: str
    clinician_review_required: bool
    not_autonomous_prescription: bool


@dataclass(frozen=True)
class _SourceCounts:
    qeeg: int
    mri: int
    deeptwin: int


def _get_source_counts(session: Session, patient_id: str) -> _SourceCounts:
    qeeg = int(session.scalar(select(func.count()).where(QEEGAnalysis.patient_id == patient_id)) or 0)
    mri = int(session.scalar(select(func.count()).where(MriAnalysis.patient_id == patient_id)) or 0)
    deeptwin = int(session.scalar(select(func.count()).where(DeepTwinAnalysisRun.patient_id == patient_id)) or 0)
    return _SourceCounts(qeeg=qeeg, mri=mri, deeptwin=deeptwin)


def _local_evidence_available() -> bool:
    try:
        path = evidence_rag._default_db_path()  # noqa: SLF001
    except Exception:
        return False
    import os

    return bool(path and os.path.exists(path))


def _pick_protocol_row(req: GenerateRequest) -> dict[str, Any] | None:
    protocol_id = (req.get("protocol_id") or "").strip()
    if protocol_id:
        return registry_get_protocol(protocol_id)

    condition = (req.get("condition") or "").strip().lower()
    modality = (req.get("modality") or "").strip().lower()
    target = (req.get("target") or "").strip().lower()

    for row in registry_list_protocols():
        if condition and str(row.get("condition_id") or "").strip().lower() != condition:
            continue
        if modality and str(row.get("modality_id") or "").strip().lower() != modality:
            continue
        if target and target not in str(row.get("target_region") or "").strip().lower():
            continue
        return row
    return None


def _is_research_only(row: dict[str, Any]) -> bool:
    review_status = str(row.get("review_status") or "").strip().lower()
    notes = str(row.get("notes") or "").strip().lower()
    return ("research" in review_status) or ("research only" in notes) or ("research-only" in notes)


def _registry_parameters(row: dict[str, Any]) -> dict[str, Any]:
    fields = [
        "frequency_hz",
        "intensity",
        "session_duration",
        "sessions_per_week",
        "total_course",
        "coil_or_electrode_placement",
        "laterality",
        "target_region",
        "monitoring_requirements",
        "adverse_event_monitoring",
        "escalation_or_adjustment_rules",
    ]
    out: dict[str, Any] = {}
    for f in fields:
        v = row.get(f)
        if v is None:
            continue
        sv = str(v).strip()
        if sv == "":
            continue
        out[f] = sv
    return out


def _contraindications(row: dict[str, Any]) -> list[str]:
    text = str(row.get("contraindication_check_required") or "").strip()
    if not text:
        return []
    # Keep as a single conservative item; registry currently stores free-text.
    return [text[:240]]


def _evidence_refs(row: dict[str, Any]) -> list[str]:
    refs = []
    for k in ("source_url_primary", "source_url_secondary"):
        v = str(row.get(k) or "").strip()
        if v:
            refs.append(v)
    return refs


def _build_protocol_summary(row: dict[str, Any], *, condition: str, modality: str, target: str | None) -> str:
    name = str(row.get("name") or row.get("id") or "Protocol").strip()
    pieces = [name]
    if condition:
        pieces.append(f"Condition: {condition}")
    if modality:
        pieces.append(f"Modality: {modality}")
    targ = (target or row.get("target_region") or "").strip()
    if targ:
        pieces.append(f"Target: {targ}")
    return " — ".join(pieces)


def generate_deterministic_protocol_studio_draft(
    session: Session,
    *,
    actor: AuthenticatedActor,
    req: GenerateRequest,
) -> DraftResponse:
    mode: Mode = req.get("mode")  # type: ignore[assignment]
    include_off_label = bool(req.get("include_off_label", False))
    patient_id = (req.get("patient_id") or "").strip() or None
    condition = (req.get("condition") or "").strip()
    modality = (req.get("modality") or "").strip()
    target = (req.get("target") or "").strip() or None

    row = _pick_protocol_row(req)
    if row is None:
        return DraftResponse(
            draft_id=None,
            status="insufficient_evidence",
            mode=mode,
            protocol_summary="No matching protocol found in the registry for the supplied criteria.",
            parameters={},
            rationale=["No registry match. Provide a `protocol_id` or refine condition/modality/target."],
            evidence_links=[],
            evidence_grade=None,
            regulatory_status=None,
            off_label=False,
            off_label_warning=None,
            contraindications=[],
            missing_data=["protocol_registry_match"],
            uncertainty="No draft could be generated without a registry match.",
            patient_context_used={},
            safety_status="needs_registry_match",
            clinician_review_required=True,
            not_autonomous_prescription=True,
        )

    off_label = _normalize_off_label(row.get("on_label_vs_off_label"))
    if off_label and not include_off_label:
        return DraftResponse(
            draft_id=None,
            status="blocked_requires_review",
            mode=mode,
            protocol_summary=_build_protocol_summary(row, condition=condition, modality=modality, target=target),
            parameters=_registry_parameters(row),
            rationale=["Selected registry protocol is off-label and `include_off_label=false`."],
            evidence_links=[],
            evidence_grade=(row.get("evidence_grade") or None),
            regulatory_status=(row.get("on_label_vs_off_label") or None),
            off_label=True,
            off_label_warning=_OFF_LABEL_WARNING,
            contraindications=_contraindications(row),
            missing_data=[],
            uncertainty="Off-label selection blocked until clinician explicitly opts in to off-label drafts.",
            patient_context_used={},
            safety_status="off_label_blocked",
            clinician_review_required=True,
            not_autonomous_prescription=True,
        )

    if _is_research_only(row):
        return DraftResponse(
            draft_id=None,
            status="research_only_not_prescribable",
            mode=mode,
            protocol_summary=_build_protocol_summary(row, condition=condition, modality=modality, target=target),
            parameters=_registry_parameters(row),
            rationale=["Selected registry protocol is marked research-only and cannot be drafted as treatment."],
            evidence_links=[],
            evidence_grade=(row.get("evidence_grade") or None),
            regulatory_status=(row.get("on_label_vs_off_label") or None),
            off_label=off_label,
            off_label_warning=_OFF_LABEL_WARNING if off_label else None,
            contraindications=_contraindications(row),
            missing_data=[],
            uncertainty="Research-only entries are informational; no prescribable draft generated.",
            patient_context_used={},
            safety_status="research_only",
            clinician_review_required=True,
            not_autonomous_prescription=True,
        )

    missing: list[str] = []
    patient_context_used: dict[str, Any] = {}

    if mode in ("qeeg_guided", "mri_guided", "deeptwin_personalized", "multimodal") and not patient_id:
        missing.append("patient_id")

    counts: Optional[_SourceCounts] = None
    if patient_id:
        counts = _get_source_counts(session, patient_id)
        patient_context_used = {
            "patient_id": patient_id,
            "sources": {
                "qeeg": {"available": counts.qeeg > 0, "count": counts.qeeg},
                "mri": {"available": counts.mri > 0, "count": counts.mri},
                "deeptwin": {"available": counts.deeptwin > 0, "count": counts.deeptwin},
            },
        }

    if mode == "qeeg_guided" and (not counts or counts.qeeg <= 0):
        missing.append("qeeg")
    if mode == "mri_guided" and (not counts or counts.mri <= 0):
        missing.append("mri")
    if mode == "deeptwin_personalized" and (not counts or counts.deeptwin <= 0):
        missing.append("deeptwin")
    if mode == "multimodal":
        avail = 0
        if counts:
            avail = int(counts.qeeg > 0) + int(counts.mri > 0) + int(counts.deeptwin > 0)
        if avail < 2:
            missing.append("multimodal_requires_two_sources")

    if missing:
        return DraftResponse(
            draft_id=None,
            status="needs_more_data",
            mode=mode,
            protocol_summary=_build_protocol_summary(row, condition=condition, modality=modality, target=target),
            parameters=_registry_parameters(row),
            rationale=["Required patient data sources are missing for the selected mode."],
            evidence_links=[],
            evidence_grade=(row.get("evidence_grade") or None),
            regulatory_status=(row.get("on_label_vs_off_label") or None),
            off_label=off_label,
            off_label_warning=_OFF_LABEL_WARNING if off_label else None,
            contraindications=_contraindications(row),
            missing_data=missing,
            uncertainty="Draft cannot be generated for this mode without the required patient data sources.",
            patient_context_used=patient_context_used,
            safety_status="needs_more_data",
            clinician_review_required=True,
            not_autonomous_prescription=True,
        )

    # Evidence requirement: we must have local evidence DB and return at least one hit.
    if not _local_evidence_available():
        return DraftResponse(
            draft_id=None,
            status="insufficient_evidence",
            mode=mode,
            protocol_summary=_build_protocol_summary(row, condition=condition, modality=modality, target=target),
            parameters=_registry_parameters(row),
            rationale=["Local evidence corpus is unavailable on this API host; draft generation is disabled without evidence grounding."],
            evidence_links=[],
            evidence_grade=(row.get("evidence_grade") or None),
            regulatory_status=(row.get("on_label_vs_off_label") or None),
            off_label=off_label,
            off_label_warning=_OFF_LABEL_WARNING if off_label else None,
            contraindications=_contraindications(row),
            missing_data=["local_evidence_db"],
            uncertainty="No draft generated because evidence grounding is unavailable.",
            patient_context_used=patient_context_used,
            safety_status="insufficient_evidence",
            clinician_review_required=True,
            not_autonomous_prescription=True,
        )

    papers = evidence_rag.search_evidence(
        f"{condition} {modality}".strip(),
        modality=(modality or None),
        condition=(condition or None),
        top_k=5,
        prefer_rct=True,
    )
    retrieved_at = _iso_now()
    evidence_links: list[EvidenceLink] = []
    for p in papers or []:
        pid = str(p.get("paper_id") or "").strip()
        if not pid:
            continue
        evidence_links.append(
            EvidenceLink(
                id=pid,
                title=(p.get("title") or None),
                link=(p.get("url") or None),
                retrieval_source="local",
                retrieved_at=retrieved_at,
            )
        )

    if not evidence_links:
        return DraftResponse(
            draft_id=None,
            status="insufficient_evidence",
            mode=mode,
            protocol_summary=_build_protocol_summary(row, condition=condition, modality=modality, target=target),
            parameters=_registry_parameters(row),
            rationale=["No supporting evidence matches were found in the local corpus for the provided condition/modality query."],
            evidence_links=[],
            evidence_grade=(row.get("evidence_grade") or None),
            regulatory_status=(row.get("on_label_vs_off_label") or None),
            off_label=off_label,
            off_label_warning=_OFF_LABEL_WARNING if off_label else None,
            contraindications=_contraindications(row),
            missing_data=["supporting_evidence_matches"],
            uncertainty="No draft generated because evidence grounding could not be established from the local corpus.",
            patient_context_used=patient_context_used,
            safety_status="insufficient_evidence",
            clinician_review_required=True,
            not_autonomous_prescription=True,
        )

    refs = _evidence_refs(row)
    rationale: list[str] = [
        "Draft built deterministically from the protocol registry plus local evidence search; clinician review required.",
    ]
    ev_summary = str(row.get("evidence_summary") or "").strip()
    if ev_summary:
        rationale.append(ev_summary[:400])
    if off_label:
        rationale.append(_OFF_LABEL_WARNING)
    if refs:
        rationale.append("Registry source links included; review primary sources before use.")

    parameters = _registry_parameters(row)
    protocol_summary = _build_protocol_summary(row, condition=condition, modality=modality, target=target)

    # Optional persistence: only when we have a patient_id and a reviewable draft.
    draft_id: str | None = None
    if patient_id:
        proto_meta = {
            "protocol_id": str(row.get("id") or ""),
            "name": str(row.get("name") or row.get("id") or "").strip() or protocol_summary,
            "parameters_json": parameters,
            "evidence_refs": refs,
            "governance_state": "draft",
            "clinician_notes": None,
            "protocol_studio": {
                "mode": mode,
                "status": "draft_requires_review",
                "generated_at": retrieved_at,
                "off_label": off_label,
                "off_label_warning": _OFF_LABEL_WARNING if off_label else None,
                "missing_data": [],
            },
        }
        record = PrescribedProtocol(
            patient_id=patient_id,
            clinician_id=actor.actor_id,
            condition=condition or (row.get("condition_id") or ""),
            modality=modality or (row.get("modality_id") or ""),
            device=(row.get("device_id_if_specific") or None),
            protocol_json=json.dumps(proto_meta),
            status="active",
        )
        session.add(record)
        session.commit()
        session.refresh(record)
        draft_id = record.id

    return DraftResponse(
        draft_id=draft_id,
        status="draft_requires_review",
        mode=mode,
        protocol_summary=protocol_summary,
        parameters=parameters,
        rationale=rationale,
        evidence_links=evidence_links,
        evidence_grade=(row.get("evidence_grade") or None),
        regulatory_status=(row.get("on_label_vs_off_label") or None),
        off_label=off_label,
        off_label_warning=_OFF_LABEL_WARNING if off_label else None,
        contraindications=_contraindications(row),
        missing_data=[],
        uncertainty="Deterministic draft: evidence links are provided, but applicability to the individual patient requires clinician judgement.",
        patient_context_used=patient_context_used,
        safety_status="safe_to_review",
        clinician_review_required=True,
        not_autonomous_prescription=True,
    )


def build_generation_preview_id() -> str:
    """Non-persistent identifier used when draft_id is unavailable."""
    return f"ps-preview-{uuid.uuid4().hex[:16]}"

