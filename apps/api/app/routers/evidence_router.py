"""Evidence router.

Reads from the standalone SQLite evidence database produced by
`services/evidence-pipeline/`. Read-only — this router never writes to
evidence.db. The one write path is `promote-to-library`, which creates a
LiteraturePaper row in the app's primary DB from an evidence paper.

Endpoints
---------
GET  /api/v1/evidence/health                     — counts + DB path
GET  /api/v1/evidence/indications                — list curated indications
GET  /api/v1/evidence/papers                     — search papers (FTS + filters, ranked)
GET  /api/v1/evidence/papers/{paper_id}          — paper detail
GET  /api/v1/evidence/trials                     — ClinicalTrials.gov studies
GET  /api/v1/evidence/trials/{nct_id}            — trial detail (preserves intervention JSON)
GET  /api/v1/evidence/devices                    — FDA device records (PMA/510k/HDE)
POST /api/v1/evidence/papers/{paper_id}/promote-to-library — save as doctor's library entry

Config
------
Set `EVIDENCE_DB_PATH` (defaults to
  `<repo>/services/evidence-pipeline/evidence.db` in local dev;
  `/app/evidence.db` in container). If the DB is missing, every endpoint
returns 503 with a clear message — never a 500 stack trace at a doctor.
"""
from __future__ import annotations

import json
import math
import os
import sqlite3
import sys
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Path as PathParam, Query, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.database import get_db_session
from app.logging_setup import get_logger
from app.persistence.models import AssessmentRecord, ClinicalSession, LiteraturePaper, OutcomeSeries, Patient, TreatmentCourse
from app.services.neuromodulation_research import (
    build_research_summary,
    dataset_keys,
    dataset_path,
    get_condition_knowledge as get_research_condition_knowledge,
    list_condition_knowledge as list_research_condition_knowledge,
    list_datasets as list_research_datasets,
    list_evidence_graph as list_research_evidence_graph,
    list_exact_protocols as list_research_exact_protocols,
    list_protocol_coverage as list_research_protocol_coverage,
    list_protocol_templates as list_research_protocol_templates,
    list_safety_signals as list_research_safety_signals,
    research_health as neuromodulation_research_health,
    search_ranked_papers as search_research_ranked_papers,
)
from app.services.evidence_intelligence import (
    EvidencePaper,
    EvidenceQuery,
    EvidenceResult,
    PatientEvidenceOverview,
    ReportPayloadRequest,
    SaveCitationRequest,
    build_default_query,
    build_patient_overview,
    build_report_payload,
    get_paper_detail as get_intelligence_paper_detail,
    list_saved_citations,
    query_evidence,
    save_citation,
)

# ── Cross-platform temp paths for admin-refresh lock + log ──────────────────
# `/tmp` is POSIX-only; on Windows it resolves to C:\tmp which may not exist.
# Using tempfile.gettempdir() makes local Windows dev and container Linux
# behave the same way without changing the container behaviour (still /tmp).
_REFRESH_LOCK = Path(tempfile.gettempdir()) / "deepsynaps_evidence_refresh.lock"
_REFRESH_LOG = Path(tempfile.gettempdir()) / "deepsynaps_evidence_refresh.log"


router = APIRouter(prefix="/api/v1/evidence", tags=["Evidence"])
_logger = get_logger("evidence_router")
_RESEARCH_EXPORT_SCHEDULES = [
    {
        "id": "sched-nightly-session-archive",
        "name": "Nightly session archive",
        "cron": "0 2 * * *",
        "target": "research-archive/session-archive.csv",
        "status": "active",
    },
    {
        "id": "sched-weekly-cohort-snapshot",
        "name": "Weekly cohort snapshot",
        "cron": "0 3 * * 1",
        "target": "research-archive/cohort-snapshot.json",
        "status": "active",
    },
    {
        "id": "sched-monthly-regulator-pack",
        "name": "Monthly regulator pack",
        "cron": "0 1 1 * *",
        "target": "research-archive/regulator-pack.xlsx",
        "status": "paused",
    },
]


def _actor_id(actor: AuthenticatedActor) -> str:
    return getattr(actor, "actor_id", None) or getattr(actor, "email", None) or str(actor)


def _audit(event: str, actor: AuthenticatedActor, **extra) -> None:
    """Structured audit log — one JSON line per clinically-meaningful query.
    Includes actor, query params, and result_count. No PHI in here."""
    payload = {"actor_id": _actor_id(actor), "event": event, **extra}
    _logger.info(f"evidence.{event}", extra=payload)


def _scoped_patient_query(db: Session, actor: AuthenticatedActor):
    q = db.query(Patient)
    if actor.role != "admin":
        q = q.filter(Patient.clinician_id == actor.actor_id)
    return q


def _research_export_summary(db: Session, actor: AuthenticatedActor, consent: str, fmt: str) -> dict:
    patient_q = _scoped_patient_query(db, actor)
    norm_consent = (consent or "research").strip().lower()
    if norm_consent in {"research", "analytics", "marketing"}:
        patient_q = patient_q.filter(Patient.consent_signed.is_(True))
    patients = patient_q.all()
    patient_ids = [p.id for p in patients]
    if not patient_ids:
        return {
            "consent": consent,
            "format": fmt,
            "patients_eligible": 0,
            "sessions": 0,
            "assessments": 0,
            "outcomes": 0,
            "modality_condition_pairs": 0,
        }

    session_q = db.query(ClinicalSession).filter(ClinicalSession.patient_id.in_(patient_ids))
    assessment_q = db.query(AssessmentRecord).filter(AssessmentRecord.patient_id.in_(patient_ids))
    outcome_q = db.query(OutcomeSeries).filter(OutcomeSeries.patient_id.in_(patient_ids))
    course_q = db.query(TreatmentCourse).filter(TreatmentCourse.patient_id.in_(patient_ids))
    if actor.role != "admin":
        session_q = session_q.filter(ClinicalSession.clinician_id == actor.actor_id)
        assessment_q = assessment_q.filter(AssessmentRecord.clinician_id == actor.actor_id)
        outcome_q = outcome_q.filter(OutcomeSeries.clinician_id == actor.actor_id)
        course_q = course_q.filter(TreatmentCourse.clinician_id == actor.actor_id)

    pairs = (
        course_q.with_entities(
            TreatmentCourse.condition_slug,
            TreatmentCourse.modality_slug,
        )
        .distinct()
        .count()
    )
    return {
        "consent": consent,
        "format": fmt,
        "patients_eligible": len(patient_ids),
        "sessions": session_q.count(),
        "assessments": assessment_q.count(),
        "outcomes": outcome_q.count(),
        "modality_condition_pairs": pairs,
    }


def _find_patient_for_export(db: Session, actor: AuthenticatedActor, patient_query: str) -> Optional[Patient]:
    term = (patient_query or "").strip()
    if not term:
        return None
    q = _scoped_patient_query(db, actor)
    patient = q.filter(Patient.id == term).first()
    if patient is not None:
        return patient
    return q.filter(func.lower(Patient.email) == term.lower()).first()


# ── DB handle ─────────────────────────────────────────────────────────────────

def _default_db_path() -> str:
    override = os.environ.get("EVIDENCE_DB_PATH")
    if override:
        return override
    here = Path(__file__).resolve()
    repo_guess = here.parents[4] / "services" / "evidence-pipeline" / "evidence.db"
    if repo_guess.exists():
        return str(repo_guess)
    return "/app/evidence.db"


def _evidence_conn() -> sqlite3.Connection:
    path = _default_db_path()
    if not os.path.exists(path):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Evidence database not found. Run "
                "`python3 services/evidence-pipeline/ingest.py --all` to generate it, "
                "or set EVIDENCE_DB_PATH."
            ),
        )
    conn = sqlite3.connect(path, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA query_only = 1")  # defense-in-depth: refuse writes
    return conn


# ── Schemas ───────────────────────────────────────────────────────────────────

class IndicationOut(BaseModel):
    slug: str
    label: str
    modality: str
    condition: str
    evidence_grade: Optional[str] = None
    regulatory: Optional[str] = None


class PaperOut(BaseModel):
    id: int
    pmid: Optional[str] = None
    doi: Optional[str] = None
    openalex_id: Optional[str] = None
    title: Optional[str] = None
    year: Optional[int] = None
    journal: Optional[str] = None
    authors: list[str] = Field(default_factory=list)
    pub_types: list[str] = Field(default_factory=list)
    cited_by_count: Optional[int] = None
    is_oa: bool = False
    oa_url: Optional[str] = None
    sources: list[str] = Field(default_factory=list)
    abstract: Optional[str] = None
    # CSV-enrichment columns (migration 004). Optional so pre-migration DBs still work.
    pmcid: Optional[str] = None
    source: Optional[str] = None
    modalities: list[str] = Field(default_factory=list)
    conditions: list[str] = Field(default_factory=list)
    study_design: Optional[str] = None
    sample_size: Optional[int] = None
    primary_outcome_measure: Optional[str] = None
    effect_direction: Optional[str] = None
    europe_pmc_url: Optional[str] = None
    enrichment_status: Optional[str] = None


class TrialOut(BaseModel):
    nct_id: str
    title: Optional[str]
    phase: Optional[str]
    status: Optional[str]
    enrollment: Optional[int]
    sponsor: Optional[str]
    conditions: list[str] = Field(default_factory=list)
    interventions: list[dict] = Field(default_factory=list)
    outcomes: list[dict] = Field(default_factory=list)
    brief_summary: Optional[str] = None
    start_date: Optional[str] = None
    last_update: Optional[str] = None


class DeviceOut(BaseModel):
    kind: str
    number: str
    applicant: Optional[str] = None
    trade_name: Optional[str] = None
    product_code: Optional[str] = None
    decision_date: Optional[str] = None


class HealthOut(BaseModel):
    ok: bool
    db_path: str
    counts: dict[str, int]


class PromoteOut(BaseModel):
    library_id: str
    title: str


class ByFindingRequest(BaseModel):
    patient_id: str
    context_type: str = "biomarker"
    target_name: str
    finding_label: Optional[str] = None
    modality: Optional[str] = None
    diagnosis: Optional[str] = None
    intervention: Optional[str] = None
    phenotype_tags: list[str] = Field(default_factory=list)
    feature_summary: list[dict] = Field(default_factory=list)
    max_results: int = Field(default=8, ge=1, le=50)


class ResearchDatasetOut(BaseModel):
    key: str
    label: str
    description: str
    filename: str
    path: str
    rows: int
    size_bytes: int
    modified_at: float


class ResearchHealthOut(BaseModel):
    ok: bool
    bundle_root: str
    dataset_count: int
    datasets: list[ResearchDatasetOut]


class ResearchPaperOut(BaseModel):
    paper_key: Optional[str] = None
    title: Optional[str] = None
    authors: Optional[str] = None
    journal: Optional[str] = None
    year: Optional[int] = None
    doi: Optional[str] = None
    pmid: Optional[str] = None
    pmcid: Optional[str] = None
    primary_modality: Optional[str] = None
    canonical_modalities: list[str] = Field(default_factory=list)
    indication_tags: list[str] = Field(default_factory=list)
    population_tags: list[str] = Field(default_factory=list)
    target_tags: list[str] = Field(default_factory=list)
    parameter_signal_tags: list[str] = Field(default_factory=list)
    study_type_normalized: Optional[str] = None
    evidence_tier: Optional[str] = None
    protocol_relevance_score: int = 0
    citation_count: int = 0
    open_access_flag: bool = False
    record_url: Optional[str] = None
    source_exports: list[str] = Field(default_factory=list)
    research_summary: Optional[str] = None
    abstract_status: Optional[str] = None
    paper_confidence_score: int = 0
    priority_score: int = 0
    trial_match_count: int = 0
    fda_match_count: int = 0
    trial_signal_score: int = 0
    fda_signal_score: int = 0
    real_world_evidence_flag: bool = False
    outcome_snippet_count: int = 0
    trial_protocol_parameter_summary: Optional[str] = None
    regulatory_clinical_signal: Optional[str] = None
    ranking_mode: Optional[str] = None


class ResearchTemplateOut(BaseModel):
    modality: Optional[str] = None
    indication: Optional[str] = None
    target: Optional[str] = None
    invasiveness: Optional[str] = None
    paper_count: int = 0
    citation_sum: int = 0
    template_support_score: int = 0
    top_study_types: str = ""
    top_parameter_tags: str = ""
    top_population_tags: str = ""
    top_safety_tags: str = ""
    example_titles: str = ""


class ResearchGraphOut(BaseModel):
    indication: Optional[str] = None
    modality: Optional[str] = None
    target: Optional[str] = None
    paper_count: int = 0
    citation_sum: int = 0
    evidence_weight_sum: int = 0
    mean_citations_per_paper: float = 0.0
    top_study_types: str = ""
    top_parameter_tags: str = ""
    top_safety_tags: str = ""
    open_access_count: int = 0
    year_min: Optional[int] = None
    year_max: Optional[int] = None


class ResearchSafetySignalOut(BaseModel):
    paper_key: Optional[str] = None
    title: Optional[str] = None
    year: Optional[int] = None
    primary_modality: Optional[str] = None
    canonical_modalities: list[str] = Field(default_factory=list)
    indication_tags: list[str] = Field(default_factory=list)
    study_type_normalized: Optional[str] = None
    evidence_tier: Optional[str] = None
    safety_signal_tags: list[str] = Field(default_factory=list)
    contraindication_signal_tags: list[str] = Field(default_factory=list)
    population_tags: list[str] = Field(default_factory=list)
    target_tags: list[str] = Field(default_factory=list)
    parameter_signal_tags: list[str] = Field(default_factory=list)
    record_url: Optional[str] = None


class ResearchFacetCount(BaseModel):
    key: str
    count: int


class ResearchSummaryOut(BaseModel):
    filters: dict[str, Optional[str]]
    paper_count: int
    open_access_paper_count: int
    top_evidence_tiers: list[ResearchFacetCount] = Field(default_factory=list)
    top_study_types: list[ResearchFacetCount] = Field(default_factory=list)
    top_modalities: list[ResearchFacetCount] = Field(default_factory=list)
    top_indications: list[ResearchFacetCount] = Field(default_factory=list)
    top_safety_tags: list[ResearchFacetCount] = Field(default_factory=list)
    top_evidence_links: list[ResearchGraphOut] = Field(default_factory=list)
    top_protocol_templates: list[ResearchTemplateOut] = Field(default_factory=list)
    recent_safety_signals: list[ResearchSafetySignalOut] = Field(default_factory=list)


class ResearchProtocolCoverageRowOut(BaseModel):
    id: str
    condition: str
    modality: str
    coverage: int = 0
    gap: str = ""
    reviewed: str = ""
    paper_count: int = 0
    evidence_weight_sum: int = 0
    citation_sum: int = 0
    top_targets: str = ""
    top_parameter_tags: str = ""
    top_study_types: str = ""


class ResearchProtocolCoverageOut(BaseModel):
    rows: list[ResearchProtocolCoverageRowOut] = Field(default_factory=list)
    generated_from: str = ""
    total: int = 0


class ResearchConditionOut(BaseModel):
    condition_slug: str
    condition_label: str
    research_paper_count: int = 0
    priority_modalities: list[str] = Field(default_factory=list)
    top_safety_signals: list[dict] = Field(default_factory=list)


class ResearchExportSummaryOut(BaseModel):
    consent: str
    format: str
    patients_eligible: int = 0
    sessions: int = 0
    assessments: int = 0
    outcomes: int = 0
    modality_condition_pairs: int = 0


class ResearchExportScheduleOut(BaseModel):
    id: str
    name: str
    cron: str
    target: str
    status: str


class ResearchDatasetExportRequest(BaseModel):
    consent: str = "research"
    format: str = "CSV"
    kind: str = "dataset"


class ResearchIndividualExportRequest(BaseModel):
    patient_query: str
    format: str = "FHIR Bundle"


class ResearchExportRequestOut(BaseModel):
    export_id: str
    kind: str
    status: str
    requested_at: str
    summary: dict = Field(default_factory=dict)


# ── Evidence score (mirrors services/evidence-pipeline/query.py) ──────────────

_PUB_TYPE_TIER = {
    "Meta-Analysis": 5, "Systematic Review": 5, "Practice Guideline": 5, "Guideline": 5,
    "Randomized Controlled Trial": 4, "Controlled Clinical Trial": 4,
    "Clinical Trial": 3,
    "Review": 2,
    "Case Reports": 1,
}


def _score(row: sqlite3.Row) -> float:
    pub_types = json.loads(row["pub_types_json"] or "[]")
    tier = max((_PUB_TYPE_TIER.get(pt, 0) for pt in pub_types), default=0)
    cites = row["cited_by_count"] or 0
    year = row["year"] or 0
    oa_bonus = 2 if row["is_oa"] else 0
    return tier * 10 + math.log1p(cites) + (year - 2000) * 0.1 + oa_bonus


def _paper_row_to_out(row: sqlite3.Row, include_abstract: bool = False) -> PaperOut:
    keys = row.keys()
    out = PaperOut(
        id=row["id"],
        pmid=row["pmid"],
        doi=row["doi"],
        openalex_id=row["openalex_id"] if "openalex_id" in keys else None,
        title=row["title"],
        year=row["year"],
        journal=row["journal"],
        authors=json.loads(row["authors_json"] or "[]"),
        pub_types=json.loads(row["pub_types_json"] or "[]"),
        cited_by_count=row["cited_by_count"],
        is_oa=bool(row["is_oa"]) if row["is_oa"] is not None else False,
        oa_url=row["oa_url"],
        sources=json.loads(row["sources_json"] or "[]") if "sources_json" in keys else [],
    )
    if include_abstract and "abstract" in keys:
        out.abstract = row["abstract"]
    # CSV-enrichment columns (migration 004). Guarded for backward compatibility.
    if "pmcid" in keys:
        out.pmcid = row["pmcid"]
    if "source" in keys:
        out.source = row["source"]
    if "modalities_json" in keys:
        try:
            out.modalities = json.loads(row["modalities_json"] or "[]")
        except (TypeError, ValueError):
            out.modalities = []
    if "conditions_json" in keys:
        try:
            out.conditions = json.loads(row["conditions_json"] or "[]")
        except (TypeError, ValueError):
            out.conditions = []
    if "study_design" in keys:
        out.study_design = row["study_design"]
    if "sample_size" in keys:
        out.sample_size = row["sample_size"]
    if "primary_outcome_measure" in keys:
        out.primary_outcome_measure = row["primary_outcome_measure"]
    if "effect_direction" in keys:
        out.effect_direction = row["effect_direction"]
    if "europe_pmc_url" in keys:
        out.europe_pmc_url = row["europe_pmc_url"]
    if "enrichment_status" in keys:
        out.enrichment_status = row["enrichment_status"]
    return out


# ── Schemas for new convenience endpoints ────────────────────────────────────

class SuggestPaperOut(BaseModel):
    id: int
    pmid: Optional[str] = None
    doi: Optional[str] = None
    title: Optional[str] = None
    year: Optional[int] = None
    journal: Optional[str] = None
    authors: list[str] = Field(default_factory=list)
    pub_types: list[str] = Field(default_factory=list)
    cited_by_count: Optional[int] = None
    is_oa: bool = False
    oa_url: Optional[str] = None
    evidence_grade: Optional[str] = None


class SuggestTrialOut(BaseModel):
    nct_id: str
    title: Optional[str] = None
    phase: Optional[str] = None
    status: Optional[str] = None
    enrollment: Optional[int] = None
    sponsor: Optional[str] = None


class SuggestOut(BaseModel):
    papers: list[SuggestPaperOut] = Field(default_factory=list)
    trials: list[SuggestTrialOut] = Field(default_factory=list)
    indication_slug: Optional[str] = None
    indication_label: Optional[str] = None
    evidence_grade: Optional[str] = None


class ForProtocolOut(BaseModel):
    protocol_id: str
    papers: list[PaperOut] = Field(default_factory=list)
    trials: list[TrialOut] = Field(default_factory=list)
    devices: list[DeviceOut] = Field(default_factory=list)


class StatusOut(BaseModel):
    total_papers: int
    total_trials: int
    total_fda: int
    last_updated: Optional[str] = None


class ByFindingRequest(BaseModel):
    patient_id: str
    context_type: str = "biomarker"
    target_name: str
    modality: Optional[str] = None
    diagnosis: Optional[str] = None
    intervention: Optional[str] = None
    phenotype_tags: list[str] = Field(default_factory=list)
    feature_summary: list[dict] = Field(default_factory=list)
    max_results: int = Field(default=8, ge=1, le=50)


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/health", response_model=HealthOut)
def evidence_health(actor: AuthenticatedActor = Depends(get_authenticated_actor)) -> HealthOut:
    require_minimum_role(actor, "clinician")
    conn = _evidence_conn()
    try:
        counts = {
            t: conn.execute(f"SELECT count(*) FROM {t}").fetchone()[0]
            for t in ("papers", "trials", "devices", "adverse_events", "indications")
        }
    finally:
        conn.close()
    return HealthOut(ok=True, db_path=_default_db_path(), counts=counts)


@router.get("/patient/{patient_id}/overview", response_model=PatientEvidenceOverview)
def evidence_patient_overview(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> PatientEvidenceOverview:
    require_minimum_role(actor, "clinician")
    overview = build_patient_overview(patient_id, db)
    _audit("intelligence.patient_overview", actor, patient_id=patient_id, result_count=len(overview.highlights))
    return overview


@router.post("/query", response_model=EvidenceResult)
def evidence_query(
    body: EvidenceQuery,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> EvidenceResult:
    require_minimum_role(actor, "clinician")
    result = query_evidence(body, db)
    _audit(
        "intelligence.query",
        actor,
        patient_id=body.patient_id,
        target_name=body.target_name,
        result_count=len(result.supporting_papers),
    )
    return result


@router.post("/by-finding", response_model=EvidenceResult)
def evidence_by_finding(
    body: ByFindingRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> EvidenceResult:
    require_minimum_role(actor, "clinician")
    query = EvidenceQuery(
        patient_id=body.patient_id,
        context_type=body.context_type,  # type: ignore[arg-type]
        target_name=body.target_name,
        modality_filters=[body.modality] if body.modality else [],
        diagnosis_filters=[body.diagnosis] if body.diagnosis else [],
        intervention_filters=[body.intervention] if body.intervention else [],
        phenotype_tags=body.phenotype_tags,
        feature_summary=body.feature_summary,
        max_results=body.max_results,
    )
    result = query_evidence(query, db)
    _audit("intelligence.by_finding", actor, patient_id=body.patient_id, target_name=body.target_name, result_count=len(result.supporting_papers))
    return result


@router.get("/papers/{paper_id}/intelligence", response_model=EvidencePaper)
def evidence_intelligence_paper(
    paper_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> EvidencePaper:
    require_minimum_role(actor, "clinician")
    paper = get_intelligence_paper_detail(paper_id, db)
    if paper is None:
        raise HTTPException(status_code=404, detail="paper not found")
    return paper


@router.post("/save-citation", status_code=status.HTTP_201_CREATED)
def save_evidence_citation(
    body: SaveCitationRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict:
    require_minimum_role(actor, "clinician")
    record = save_citation(body, _actor_id(actor), db)
    _audit("intelligence.save_citation", actor, patient_id=body.patient_id, finding_id=body.finding_id, paper_id=body.paper_id)
    return record


@router.get("/patient/{patient_id}/saved-citations")
def get_saved_evidence_citations(
    patient_id: str,
    context_kind: str | None = Query(default=None),
    analysis_id: str | None = Query(default=None),
    report_id: str | None = Query(default=None),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> list[dict]:
    require_minimum_role(actor, "clinician")
    return list_saved_citations(
        patient_id,
        db,
        context_kind=context_kind,
        analysis_id=analysis_id,
        report_id=report_id,
    )


@router.post("/report-payload")
def evidence_report_payload(
    body: ReportPayloadRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict:
    require_minimum_role(actor, "clinician")
    payload = build_report_payload(body, db)
    _audit("intelligence.report_payload", actor, patient_id=body.patient_id, result_count=len(payload.get("citations", [])))
    return payload


@router.get("/status", response_model=StatusOut)
def evidence_status() -> StatusOut:
    """Public endpoint — no auth. Returns total record counts and last ingest
    timestamp from the evidence DB. Returns zeros if the DB is absent.
    Used by the Protocol Detail footer: 'Evidence DB: N records · updated Xh ago'."""
    path = _default_db_path()
    if not os.path.exists(path):
        return StatusOut(total_papers=0, total_trials=0, total_fda=0, last_updated=None)
    try:
        conn = sqlite3.connect(path, timeout=5)
        conn.execute("PRAGMA query_only = 1")
        total_papers = conn.execute("SELECT count(*) FROM papers").fetchone()[0]
        total_trials = conn.execute("SELECT count(*) FROM trials").fetchone()[0]
        total_fda = conn.execute("SELECT count(*) FROM devices").fetchone()[0]
        last_updated = conn.execute(
            "SELECT MAX(last_ingested) FROM papers"
        ).fetchone()[0]
        conn.close()
    except Exception:
        return StatusOut(total_papers=0, total_trials=0, total_fda=0, last_updated=None)
    return StatusOut(
        total_papers=total_papers,
        total_trials=total_trials,
        total_fda=total_fda,
        last_updated=last_updated,
    )


@router.get("/suggest", response_model=SuggestOut)
def evidence_suggest(
    modality: Optional[str] = Query(None, description="Modality slug e.g. rtms, tdcs, vns."),
    indication: Optional[str] = Query(None, description="Condition/indication free-text or slug e.g. depression, mdd."),
    limit: int = Query(5, ge=1, le=20),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> SuggestOut:
    """Top papers + trials ranked by citation count / recency for a given
    modality + indication pair. Used by Protocol Builder to populate the
    'Evidence basis' collapsible panel when the clinician selects device+condition.

    Matching strategy (most-specific first):
    1. Exact indication slug match (indications.slug LIKE '%{indication}%')
    2. Modality column match (indications.modality = modality)
    3. Falls back to full-text search over paper titles/abstracts.
    """
    require_minimum_role(actor, "clinician")
    conn = _evidence_conn()
    try:
        # Resolve indication slug — try exact then fuzzy
        ind_row = None
        if indication:
            ind_row = conn.execute(
                "SELECT id, slug, label, modality, evidence_grade "
                "FROM indications WHERE slug = ? LIMIT 1",
                (indication,),
            ).fetchone()
            if not ind_row:
                ind_row = conn.execute(
                    "SELECT id, slug, label, modality, evidence_grade "
                    "FROM indications WHERE slug LIKE ? OR label LIKE ? LIMIT 1",
                    (f"%{indication}%", f"%{indication}%"),
                ).fetchone()
        if not ind_row and modality:
            ind_row = conn.execute(
                "SELECT id, slug, label, modality, evidence_grade "
                "FROM indications WHERE modality = ? LIMIT 1",
                (modality,),
            ).fetchone()

        papers: list[SuggestPaperOut] = []
        trials: list[SuggestTrialOut] = []

        if ind_row:
            ind_id = ind_row["id"]
            raw_papers = conn.execute(
                "SELECT p.id, p.pmid, p.doi, p.title, p.year, p.journal, "
                "p.cited_by_count, p.is_oa, p.oa_url, p.pub_types_json, "
                "p.authors_json, i.evidence_grade "
                "FROM papers p "
                "JOIN paper_indications pi ON pi.paper_id = p.id "
                "JOIN indications i ON i.id = pi.indication_id "
                "WHERE pi.indication_id = ? "
                "LIMIT ?",
                (ind_id, limit * 4),
            ).fetchall()
            ranked = sorted(raw_papers, key=_score, reverse=True)[:limit]
            for r in ranked:
                papers.append(SuggestPaperOut(
                    id=r["id"], pmid=r["pmid"], doi=r["doi"],
                    title=r["title"], year=r["year"], journal=r["journal"],
                    authors=json.loads(r["authors_json"] or "[]"),
                    pub_types=json.loads(r["pub_types_json"] or "[]"),
                    cited_by_count=r["cited_by_count"],
                    is_oa=bool(r["is_oa"]),
                    oa_url=r["oa_url"],
                    evidence_grade=r["evidence_grade"],
                ))

            raw_trials = conn.execute(
                "SELECT t.nct_id, t.title, t.phase, t.status, t.enrollment, t.sponsor "
                "FROM trials t "
                "JOIN trial_indications ti ON ti.trial_id = t.id "
                "WHERE ti.indication_id = ? "
                "ORDER BY t.last_update DESC LIMIT ?",
                (ind_id, limit),
            ).fetchall()
            for r in raw_trials:
                trials.append(SuggestTrialOut(
                    nct_id=r["nct_id"], title=r["title"], phase=r["phase"],
                    status=r["status"], enrollment=r["enrollment"], sponsor=r["sponsor"],
                ))
        elif indication or modality:
            # Fallback: FTS over paper titles
            fts_q = indication or modality or ""
            try:
                raw_papers = conn.execute(
                    "SELECT p.id, p.pmid, p.doi, p.title, p.year, p.journal, "
                    "p.cited_by_count, p.is_oa, p.oa_url, p.pub_types_json, p.authors_json "
                    "FROM papers p "
                    "JOIN papers_fts f ON f.rowid = p.id "
                    "WHERE papers_fts MATCH ? LIMIT ?",
                    (fts_q, limit * 4),
                ).fetchall()
                ranked = sorted(raw_papers, key=_score, reverse=True)[:limit]
                for r in ranked:
                    papers.append(SuggestPaperOut(
                        id=r["id"], pmid=r["pmid"], doi=r["doi"],
                        title=r["title"], year=r["year"], journal=r["journal"],
                        authors=json.loads(r["authors_json"] or "[]"),
                        pub_types=json.loads(r["pub_types_json"] or "[]"),
                        cited_by_count=r["cited_by_count"],
                        is_oa=bool(r["is_oa"]),
                        oa_url=r["oa_url"],
                    ))
            except Exception:
                pass  # FTS not available — return empty

    finally:
        conn.close()

    _audit("evidence.suggest", actor, modality=modality, indication=indication, result_count=len(papers) + len(trials))
    return SuggestOut(
        papers=papers,
        trials=trials,
        indication_slug=ind_row["slug"] if ind_row else None,
        indication_label=ind_row["label"] if ind_row else None,
        evidence_grade=ind_row["evidence_grade"] if ind_row else None,
    )


@router.get("/for-protocol/{protocol_id}", response_model=ForProtocolOut)
def evidence_for_protocol(
    protocol_id: str = PathParam(...),
    limit: int = Query(10, ge=1, le=50),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> ForProtocolOut:
    """Papers, trials, and FDA device records linked to a protocol.

    Matching strategy: the protocol_id is decoded as '{modality}_{condition}'
    (e.g. 'rtms_mdd', 'tdcs_depression') or a plain condition slug. Falls back
    to FTS search on the id string. Returns empty lists when the DB is absent —
    never raises.
    """
    require_minimum_role(actor, "clinician")
    conn = _evidence_conn()
    try:
        # Heuristic: protocol IDs often encode modality+condition as 'mod-cond-...'
        # or 'mod_cond'. Extract both parts.
        parts = protocol_id.replace("-", "_").split("_")
        condition_guess = "_".join(parts[1:]) if len(parts) > 1 else protocol_id

        # Try to find a matching indication
        ind_row = conn.execute(
            "SELECT id, slug, label, modality, evidence_grade "
            "FROM indications WHERE slug LIKE ? OR slug LIKE ? OR label LIKE ? LIMIT 1",
            (f"%{condition_guess}%", f"%{protocol_id}%", f"%{condition_guess}%"),
        ).fetchone()

        papers: list[PaperOut] = []
        trials: list[TrialOut] = []
        devices: list[DeviceOut] = []

        if ind_row:
            ind_id = ind_row["id"]
            raw_papers = conn.execute(
                "SELECT p.id, p.pmid, p.doi, p.openalex_id, p.title, p.year, p.journal, "
                "p.cited_by_count, p.is_oa, p.oa_url, p.pub_types_json, "
                "p.authors_json, p.sources_json "
                "FROM papers p "
                "JOIN paper_indications pi ON pi.paper_id = p.id "
                "WHERE pi.indication_id = ? LIMIT ?",
                (ind_id, limit * 4),
            ).fetchall()
            ranked = sorted(raw_papers, key=_score, reverse=True)[:limit]
            papers = [_paper_row_to_out(r) for r in ranked]

            raw_trials = conn.execute(
                "SELECT t.nct_id, t.title, t.phase, t.status, t.enrollment, t.sponsor, "
                "t.conditions_json, t.interventions_json, t.outcomes_json, "
                "t.brief_summary, t.start_date, t.last_update "
                "FROM trials t "
                "JOIN trial_indications ti ON ti.trial_id = t.id "
                "WHERE ti.indication_id = ? "
                "ORDER BY t.last_update DESC LIMIT ?",
                (ind_id, limit),
            ).fetchall()
            for r in raw_trials:
                trials.append(TrialOut(
                    nct_id=r["nct_id"], title=r["title"], phase=r["phase"],
                    status=r["status"], enrollment=r["enrollment"], sponsor=r["sponsor"],
                    conditions=json.loads(r["conditions_json"] or "[]"),
                    interventions=json.loads(r["interventions_json"] or "[]"),
                    outcomes=json.loads(r["outcomes_json"] or "[]"),
                    brief_summary=r["brief_summary"],
                    start_date=r["start_date"],
                    last_update=r["last_update"],
                ))

            raw_devices = conn.execute(
                "SELECT d.kind, d.number, d.applicant, d.trade_name, d.product_code, d.decision_date "
                "FROM devices d "
                "JOIN device_indications di ON di.device_id = d.id "
                "WHERE di.indication_id = ? "
                "ORDER BY d.decision_date DESC LIMIT ?",
                (ind_id, limit),
            ).fetchall()
            devices = [DeviceOut(**dict(r)) for r in raw_devices]
        else:
            # Fallback FTS
            try:
                fts_q = condition_guess or protocol_id
                raw_papers = conn.execute(
                    "SELECT p.id, p.pmid, p.doi, p.openalex_id, p.title, p.year, p.journal, "
                    "p.cited_by_count, p.is_oa, p.oa_url, p.pub_types_json, "
                    "p.authors_json, p.sources_json "
                    "FROM papers p "
                    "JOIN papers_fts f ON f.rowid = p.id "
                    "WHERE papers_fts MATCH ? LIMIT ?",
                    (fts_q, limit * 4),
                ).fetchall()
                ranked = sorted(raw_papers, key=_score, reverse=True)[:limit]
                papers = [_paper_row_to_out(r) for r in ranked]
            except Exception:
                pass
    finally:
        conn.close()

    _audit("evidence.for_protocol", actor, protocol_id=protocol_id, result_count=len(papers) + len(trials))
    return ForProtocolOut(protocol_id=protocol_id, papers=papers, trials=trials, devices=devices)


_PUBLIC_STATS_MODALITIES = (
    "tms", "dbs", "tdcs", "scs", "vns", "pns", "tacs", "snm", "rns",
    "tvns", "tfus", "mcs", "ons", "trns", "trigns", "gen",
)
_PUBLIC_STATS_CONDITIONS = (
    "parkinsons", "chronic_pain", "stroke", "mdd", "depression", "alzheimers",
    "ocd", "ms", "asd", "tbi", "ptsd", "insomnia", "anxiety", "adhd",
    "tinnitus", "long_covid", "epilepsy",
)


@router.get("/stats")
def evidence_stats() -> dict:
    """PUBLIC endpoint — no auth. Returns only aggregate counts (no titles,
    no authors, no abstracts, no PHI). Used by the marketing landing page to
    show live evidence-corpus metrics.

    Returns baseline `{ok, counts}` plus richer corpus aggregates when the
    migration-004 enrichment columns are present. Safe to call from the
    public landing page — the content is purely numerical roll-ups.

    Never raises: returns `{ok: false, counts: {}}` if the DB is missing or
    any query fails.
    """
    path = _default_db_path()
    if not os.path.exists(path):
        return {"ok": False, "counts": {}}
    try:
        conn = sqlite3.connect(path, timeout=5)
        conn.execute("PRAGMA query_only = 1")

        counts: dict[str, int] = {}
        for t in ("papers", "trials", "indications", "devices"):
            try:
                counts[t] = conn.execute(f"SELECT count(*) FROM {t}").fetchone()[0]
            except sqlite3.OperationalError:
                counts[t] = 0

        # last_ingested timestamp drives the landing-page "updated Xh ago" badge.
        try:
            last_updated = conn.execute(
                "SELECT MAX(last_ingested) FROM papers"
            ).fetchone()[0]
        except sqlite3.OperationalError:
            last_updated = None

        payload: dict = {
            "ok": True,
            "counts": counts,
            "last_updated": last_updated,
        }

        # Migration-004 enrichment columns may or may not exist. Probe once and
        # short-circuit cleanly if this is an older DB.
        col_rows = conn.execute("PRAGMA table_info(papers)").fetchall()
        col_names = {row[1] for row in col_rows}
        has_enrichment = {
            "modalities_json",
            "conditions_json",
            "study_design",
            "effect_direction",
            "source",
            "enrichment_status",
            "year",
        }.issubset(col_names)

        if has_enrichment:
            papers_with_abstract = conn.execute(
                "SELECT count(*) FROM papers WHERE abstract IS NOT NULL AND length(abstract) > 50"
            ).fetchone()[0]
            counts["papers_with_abstract"] = papers_with_abstract

            by_source = {
                (row[0] or "unknown"): row[1]
                for row in conn.execute(
                    "SELECT source, count(*) FROM papers GROUP BY source"
                ).fetchall()
                if row[0]
            }

            by_study_design = {
                row[0]: row[1]
                for row in conn.execute(
                    "SELECT study_design, count(*) FROM papers "
                    "WHERE study_design IS NOT NULL AND study_design != '' "
                    "GROUP BY study_design ORDER BY count(*) DESC LIMIT 10"
                ).fetchall()
            }

            by_effect_direction = {
                row[0]: row[1]
                for row in conn.execute(
                    "SELECT effect_direction, count(*) FROM papers "
                    "WHERE effect_direction IS NOT NULL AND effect_direction != '' "
                    "GROUP BY effect_direction"
                ).fetchall()
            }

            # Modality / condition counts via LIKE on JSON column. One round-
            # trip per token (bounded: 16 modalities × 17 conditions).
            top_modalities: list[dict[str, int | str]] = []
            for tok in _PUBLIC_STATS_MODALITIES:
                row = conn.execute(
                    "SELECT count(*) FROM papers WHERE modalities_json LIKE ?",
                    (f'%"{tok}"%',),
                ).fetchone()
                if row and row[0]:
                    top_modalities.append({"key": tok, "count": row[0]})
            top_modalities.sort(key=lambda x: x["count"], reverse=True)

            top_conditions: list[dict[str, int | str]] = []
            for tok in _PUBLIC_STATS_CONDITIONS:
                row = conn.execute(
                    "SELECT count(*) FROM papers WHERE conditions_json LIKE ?",
                    (f'%"{tok}"%',),
                ).fetchone()
                if row and row[0]:
                    top_conditions.append({"key": tok, "count": row[0]})
            top_conditions.sort(key=lambda x: x["count"], reverse=True)

            year_row = conn.execute(
                "SELECT MIN(year), MAX(year) FROM papers WHERE year IS NOT NULL"
            ).fetchone()
            year_coverage = {
                "min": year_row[0] if year_row else None,
                "max": year_row[1] if year_row else None,
            }

            payload.update({
                "by_source": by_source,
                "by_study_design": by_study_design,
                "by_effect_direction": by_effect_direction,
                "top_modalities": top_modalities[:12],
                "top_conditions": top_conditions[:12],
                "year_coverage": year_coverage,
            })

        conn.close()
    except Exception:
        return {"ok": False, "counts": {}}
    return payload


@router.get("/research/health", response_model=ResearchHealthOut)
def neuromodulation_artifact_health(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> ResearchHealthOut:
    require_minimum_role(actor, "clinician")
    return ResearchHealthOut(**neuromodulation_research_health())


@router.get("/research/datasets", response_model=list[ResearchDatasetOut])
def list_neuromodulation_research_datasets(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> list[ResearchDatasetOut]:
    require_minimum_role(actor, "clinician")
    return [ResearchDatasetOut(**item) for item in list_research_datasets()]


@router.get("/research/datasets/{dataset_key}/download")
def download_neuromodulation_research_dataset(
    dataset_key: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> FileResponse:
    require_minimum_role(actor, "clinician")
    if dataset_key not in dataset_keys():
        raise HTTPException(status_code=404, detail="unknown research dataset")
    path = dataset_path(dataset_key)
    return FileResponse(str(path), media_type="text/csv", filename=path.name)


@router.get("/research/conditions", response_model=list[ResearchConditionOut])
def list_neuromodulation_research_conditions(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> list[ResearchConditionOut]:
    require_minimum_role(actor, "clinician")
    return [ResearchConditionOut(**item) for item in list_research_condition_knowledge()]


@router.get("/research/conditions/{condition_slug}")
def get_neuromodulation_research_condition(
    condition_slug: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict:
    require_minimum_role(actor, "clinician")
    payload = get_research_condition_knowledge(condition_slug)
    if payload is None:
        raise HTTPException(status_code=404, detail="condition knowledge not found")
    return payload


@router.get("/research/papers", response_model=list[ResearchPaperOut])
def search_neuromodulation_research_papers(
    q: Optional[str] = Query(None, description="Free-text search over title and AI-ingestion text."),
    modality: Optional[str] = Query(None),
    indication: Optional[str] = Query(None),
    target: Optional[str] = Query(None),
    study_type: Optional[str] = Query(None),
    evidence_tier: Optional[str] = Query(None),
    year_min: Optional[int] = Query(None),
    year_max: Optional[int] = Query(None),
    open_access_only: bool = Query(False),
    min_confidence: Optional[int] = Query(None, ge=0, le=100),
    min_priority: Optional[int] = Query(None, ge=0, le=1000),
    real_world_only: bool = Query(False),
    with_trial_signal: bool = Query(False),
    with_fda_signal: bool = Query(False),
    ranking_mode: str = Query("best", pattern="^(best|clinical|regulatory|safety|recent)$"),
    limit: int = Query(20, ge=1, le=100),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> list[ResearchPaperOut]:
    require_minimum_role(actor, "clinician")
    rows = search_research_ranked_papers(
        q=q,
        modality=modality,
        indication=indication,
        target=target,
        study_type=study_type,
        evidence_tier=evidence_tier,
        year_min=year_min,
        year_max=year_max,
        open_access_only=open_access_only,
        min_confidence=min_confidence,
        min_priority=min_priority,
        real_world_only=real_world_only,
        with_trial_signal=with_trial_signal,
        with_fda_signal=with_fda_signal,
        ranking_mode=ranking_mode,
        limit=limit,
    )
    _audit(
        "research.papers.search",
        actor,
        q=q,
        modality=modality,
        indication=indication,
        target=target,
        study_type=study_type,
        evidence_tier=evidence_tier,
        year_min=year_min,
        year_max=year_max,
        open_access_only=open_access_only,
        min_confidence=min_confidence,
        min_priority=min_priority,
        real_world_only=real_world_only,
        with_trial_signal=with_trial_signal,
        with_fda_signal=with_fda_signal,
        ranking_mode=ranking_mode,
        result_count=len(rows),
    )
    return [ResearchPaperOut(**row) for row in rows]


@router.get("/research/protocol-coverage", response_model=ResearchProtocolCoverageOut)
def get_neuromodulation_protocol_coverage(
    limit: int = Query(50, ge=1, le=200),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> ResearchProtocolCoverageOut:
    require_minimum_role(actor, "clinician")
    return ResearchProtocolCoverageOut(**list_research_protocol_coverage(limit=limit))


@router.get("/research/exact-protocols")
def list_neuromodulation_exact_protocols(
    condition_slug: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> list[dict[str, str]]:
    require_minimum_role(actor, "clinician")
    return list_research_exact_protocols(condition_slug=condition_slug, limit=limit)


@router.get("/research/protocol-templates", response_model=list[ResearchTemplateOut])
def list_neuromodulation_protocol_templates(
    indication: Optional[str] = Query(None),
    modality: Optional[str] = Query(None),
    invasiveness: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> list[ResearchTemplateOut]:
    require_minimum_role(actor, "clinician")
    rows = list_research_protocol_templates(
        indication=indication,
        modality=modality,
        invasiveness=invasiveness,
        limit=limit,
    )
    return [ResearchTemplateOut(**row) for row in rows]


@router.get("/research/evidence-graph", response_model=list[ResearchGraphOut])
def list_neuromodulation_evidence_graph(
    indication: Optional[str] = Query(None),
    modality: Optional[str] = Query(None),
    target: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> list[ResearchGraphOut]:
    require_minimum_role(actor, "clinician")
    rows = list_research_evidence_graph(
        indication=indication,
        modality=modality,
        target=target,
        limit=limit,
    )
    return [ResearchGraphOut(**row) for row in rows]


@router.get("/research/safety-signals", response_model=list[ResearchSafetySignalOut])
def list_neuromodulation_safety_signals(
    indication: Optional[str] = Query(None),
    modality: Optional[str] = Query(None),
    safety_tag: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> list[ResearchSafetySignalOut]:
    require_minimum_role(actor, "clinician")
    rows = list_research_safety_signals(
        indication=indication,
        modality=modality,
        safety_tag=safety_tag,
        limit=limit,
    )
    return [ResearchSafetySignalOut(**row) for row in rows]


@router.get("/research/summary", response_model=ResearchSummaryOut)
def get_neuromodulation_research_summary(
    indication: Optional[str] = Query(None),
    modality: Optional[str] = Query(None),
    limit: int = Query(5, ge=1, le=20),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> ResearchSummaryOut:
    require_minimum_role(actor, "clinician")
    return ResearchSummaryOut(**build_research_summary(indication=indication, modality=modality, limit=limit))


@router.get("/research/exports/summary", response_model=ResearchExportSummaryOut)
def get_research_export_summary(
    consent: str = Query("research"),
    format: str = Query("CSV"),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ResearchExportSummaryOut:
    require_minimum_role(actor, "clinician")
    summary = _research_export_summary(db, actor, consent, format)
    _audit("research.export.summary", actor, consent=consent, format=format, patients=summary["patients_eligible"])
    return ResearchExportSummaryOut(**summary)


@router.get("/research/exports/schedules", response_model=list[ResearchExportScheduleOut])
def list_research_export_schedules(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> list[ResearchExportScheduleOut]:
    require_minimum_role(actor, "clinician")
    return [ResearchExportScheduleOut(**row) for row in _RESEARCH_EXPORT_SCHEDULES]


@router.post("/research/exports/dataset", response_model=ResearchExportRequestOut, status_code=status.HTTP_202_ACCEPTED)
def create_research_dataset_export(
    body: ResearchDatasetExportRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ResearchExportRequestOut:
    require_minimum_role(actor, "clinician")
    summary = _research_export_summary(db, actor, body.consent, body.format)
    export_id = str(uuid.uuid4())
    requested_at = datetime.now(timezone.utc).isoformat()
    _audit(
        "research.export.dataset",
        actor,
        export_id=export_id,
        consent=body.consent,
        format=body.format,
        kind=body.kind,
        patients=summary["patients_eligible"],
    )
    return ResearchExportRequestOut(
        export_id=export_id,
        kind=body.kind,
        status="queued",
        requested_at=requested_at,
        summary=summary,
    )


@router.post("/research/exports/bundle", response_model=ResearchExportRequestOut, status_code=status.HTTP_202_ACCEPTED)
def create_research_bundle_export(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> ResearchExportRequestOut:
    require_minimum_role(actor, "clinician")
    export_id = str(uuid.uuid4())
    requested_at = datetime.now(timezone.utc).isoformat()
    summary = {
        "datasets": len(list_research_datasets()),
        "bundle_root": str(dataset_path("master")),
    }
    _audit("research.export.bundle", actor, export_id=export_id, datasets=summary["datasets"])
    return ResearchExportRequestOut(
        export_id=export_id,
        kind="research-bundle",
        status="queued",
        requested_at=requested_at,
        summary=summary,
    )


@router.post("/research/exports/individual", response_model=ResearchExportRequestOut, status_code=status.HTTP_202_ACCEPTED)
def create_research_individual_export(
    body: ResearchIndividualExportRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ResearchExportRequestOut:
    require_minimum_role(actor, "clinician")
    patient = _find_patient_for_export(db, actor, body.patient_query)
    if patient is None:
        raise HTTPException(status_code=404, detail="Patient not found for export. Use patient ID or email.")
    export_id = str(uuid.uuid4())
    requested_at = datetime.now(timezone.utc).isoformat()
    summary = {
        "patient_id": patient.id,
        "patient_name": f"{patient.first_name} {patient.last_name}".strip(),
        "format": body.format,
    }
    _audit("research.export.individual", actor, export_id=export_id, patient_id=patient.id, format=body.format)
    return ResearchExportRequestOut(
        export_id=export_id,
        kind="individual",
        status="queued",
        requested_at=requested_at,
        summary=summary,
    )


@router.get("/indications", response_model=list[IndicationOut])
def list_indications(actor: AuthenticatedActor = Depends(get_authenticated_actor)) -> list[IndicationOut]:
    require_minimum_role(actor, "clinician")
    conn = _evidence_conn()
    try:
        rows = conn.execute(
            "SELECT slug, label, modality, condition, evidence_grade, regulatory "
            "FROM indications ORDER BY modality, slug"
        ).fetchall()
    finally:
        conn.close()
    return [IndicationOut(**dict(r)) for r in rows]


_PAPER_SELECT_COLS = (
    "p.id, p.pmid, p.doi, p.openalex_id, p.title, p.year, p.journal, "
    "p.cited_by_count, p.is_oa, p.oa_url, p.pub_types_json, p.authors_json, p.sources_json, "
    "p.abstract, p.source, p.pmcid, p.modalities_json, p.conditions_json, "
    "p.study_design, p.sample_size, p.primary_outcome_measure, p.effect_direction, "
    "p.europe_pmc_url, p.enrichment_status"
)

# Known tokens from migration 004 / CSV enrichment. Used by /papers/stats.
_KNOWN_MODALITIES = [
    "tms", "dbs", "tdcs", "scs", "pns", "vns", "tacs", "snm", "rns",
    "tvns", "mcs", "tfus", "trigns", "ons", "trns", "gen",
]
_KNOWN_CONDITIONS = [
    "parkinsons", "chronic_pain", "stroke", "mdd", "alzheimers", "ocd", "ms",
    "asd", "tbi", "ptsd", "insomnia", "anxiety", "adhd", "tinnitus",
    "long_covid", "depression",
]


@router.get("/papers", response_model=list[PaperOut])
def search_papers(
    q: Optional[str] = Query(None, description="FTS5 query over title/abstract."),
    indication: Optional[str] = Query(None, description="Indication slug."),
    grade: Optional[str] = Query(None, pattern="^[A-E]$", description="A-E evidence grade filter."),
    oa_only: bool = Query(False, description="Only papers with accessible open-access URLs."),
    modality: Optional[str] = Query(None, description="Modality token, e.g. 'tms' (matches modalities_json)."),
    condition: Optional[str] = Query(None, description="Condition token, e.g. 'mdd' (matches conditions_json)."),
    study_design: Optional[str] = Query(None, description="Exact study design, e.g. 'rct'."),
    effect_direction: Optional[str] = Query(None, description="positive | null | mixed"),
    year_min: Optional[int] = Query(None, ge=1900, le=2100),
    year_max: Optional[int] = Query(None, ge=1900, le=2100),
    source: Optional[str] = Query(None, description="EuropePMC source (MED, PMC, PPR, AGR, ETH)."),
    has_abstract: Optional[bool] = Query(None, description="Only papers with a non-trivial abstract."),
    limit: int = Query(20, ge=1, le=200),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> list[PaperOut]:
    require_minimum_role(actor, "clinician")
    conn = _evidence_conn()
    try:
        where: list[str] = []
        params: list = []
        join = ""
        if indication:
            join = (
                "JOIN paper_indications pi ON pi.paper_id = p.id "
                "JOIN indications i ON i.id = pi.indication_id "
            )
            where.append("i.slug = ?")
            params.append(indication)
            if grade:
                where.append("i.evidence_grade = ?")
                params.append(grade)
        if oa_only:
            where.append("p.is_oa = 1")
        if modality:
            where.append("p.modalities_json LIKE ?")
            params.append(f'%"{modality}"%')
        if condition:
            where.append("p.conditions_json LIKE ?")
            params.append(f'%"{condition}"%')
        if study_design:
            where.append("p.study_design = ?")
            params.append(study_design)
        if effect_direction:
            where.append("p.effect_direction = ?")
            params.append(effect_direction)
        if year_min is not None:
            where.append("p.year >= ?")
            params.append(year_min)
        if year_max is not None:
            where.append("p.year <= ?")
            params.append(year_max)
        if source:
            where.append("p.source = ?")
            params.append(source)
        if has_abstract:
            where.append("p.abstract IS NOT NULL AND length(p.abstract) > 50")
        if q:
            join += "JOIN papers_fts f ON f.rowid = p.id "
            where.append("papers_fts MATCH ?")
            params.append(q)

        sql = (
            "SELECT " + _PAPER_SELECT_COLS + " "
            "FROM papers p " + join
            + (" WHERE " + " AND ".join(where) if where else "")
            + " LIMIT ?"
        )
        params.append(limit * 4)
        rows = conn.execute(sql, params).fetchall()
    finally:
        conn.close()

    ranked = sorted(rows, key=_score, reverse=True)[:limit]
    _audit(
        "papers.search", actor,
        q=q, indication=indication, grade=grade, oa_only=oa_only,
        modality=modality, condition=condition, study_design=study_design,
        effect_direction=effect_direction, year_min=year_min, year_max=year_max,
        source=source, has_abstract=has_abstract, limit=limit,
        result_count=len(ranked),
    )
    return [_paper_row_to_out(r) for r in ranked]


# ── Stats endpoint ────────────────────────────────────────────────────────────

class PaperStatsOut(BaseModel):
    total: int
    with_abstract: int
    by_source: dict[str, int] = Field(default_factory=dict)
    by_study_design: dict[str, int] = Field(default_factory=dict)
    by_effect_direction: dict[str, int] = Field(default_factory=dict)
    by_year: list[dict] = Field(default_factory=list)
    top_modalities: list[dict] = Field(default_factory=list)
    top_conditions: list[dict] = Field(default_factory=list)


@router.get("/papers/stats", response_model=PaperStatsOut)
def papers_stats(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> PaperStatsOut:
    """Aggregate counts over `papers` for the Knowledge dashboard. Scans
    modalities_json / conditions_json once in Python to stay under 500ms on
    ~87k rows. Requires clinician role."""
    require_minimum_role(actor, "clinician")
    conn = _evidence_conn()
    try:
        total = conn.execute("SELECT count(*) FROM papers").fetchone()[0]
        with_abstract = conn.execute(
            "SELECT count(*) FROM papers WHERE abstract IS NOT NULL AND length(abstract) > 50"
        ).fetchone()[0]

        def _group(col: str) -> dict[str, int]:
            out: dict[str, int] = {}
            try:
                rows = conn.execute(
                    f"SELECT {col} AS k, count(*) AS c FROM papers "
                    f"WHERE {col} IS NOT NULL AND {col} <> '' GROUP BY {col}"
                ).fetchall()
            except sqlite3.OperationalError:
                return out
            for r in rows:
                out[str(r["k"])] = int(r["c"])
            return out

        by_source = _group("source")
        by_study_design = _group("study_design")
        by_effect_direction = _group("effect_direction")

        # Top years (top 10)
        year_rows = conn.execute(
            "SELECT year, count(*) AS c FROM papers WHERE year IS NOT NULL "
            "GROUP BY year ORDER BY c DESC LIMIT 10"
        ).fetchall()
        by_year = [{"year": int(r["year"]), "count": int(r["c"])} for r in year_rows]

        # Modalities / conditions: single pass over json text blobs.
        modality_counts: dict[str, int] = {k: 0 for k in _KNOWN_MODALITIES}
        condition_counts: dict[str, int] = {k: 0 for k in _KNOWN_CONDITIONS}
        try:
            blob_rows = conn.execute(
                "SELECT modalities_json, conditions_json FROM papers "
                "WHERE (modalities_json IS NOT NULL AND modalities_json <> '[]') "
                "OR (conditions_json IS NOT NULL AND conditions_json <> '[]')"
            ).fetchall()
            for r in blob_rows:
                mj = r["modalities_json"]
                if mj:
                    try:
                        for tok in json.loads(mj):
                            if tok in modality_counts:
                                modality_counts[tok] += 1
                    except (TypeError, ValueError):
                        pass
                cj = r["conditions_json"]
                if cj:
                    try:
                        for tok in json.loads(cj):
                            if tok in condition_counts:
                                condition_counts[tok] += 1
                    except (TypeError, ValueError):
                        pass
        except sqlite3.OperationalError:
            pass

        top_modalities = [
            {"key": k, "count": c}
            for k, c in sorted(modality_counts.items(), key=lambda kv: kv[1], reverse=True)
            if c > 0
        ][:20]
        top_conditions = [
            {"key": k, "count": c}
            for k, c in sorted(condition_counts.items(), key=lambda kv: kv[1], reverse=True)
            if c > 0
        ][:20]
    finally:
        conn.close()

    _audit("papers.stats", actor, total=total)
    return PaperStatsOut(
        total=int(total),
        with_abstract=int(with_abstract),
        by_source=by_source,
        by_study_design=by_study_design,
        by_effect_direction=by_effect_direction,
        by_year=by_year,
        top_modalities=top_modalities,
        top_conditions=top_conditions,
    )


@router.get("/papers/similar/{paper_id}", response_model=list[PaperOut])
def similar_papers(
    paper_id: int = PathParam(..., ge=1),
    limit: int = Query(10, ge=1, le=50),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> list[PaperOut]:
    """FTS-based 'more like this'. Tokenises the source paper's title into
    word bigrams and runs them OR-joined through papers_fts MATCH. Falls back
    to unigrams if the title is too short for bigrams."""
    require_minimum_role(actor, "clinician")
    conn = _evidence_conn()
    try:
        seed = conn.execute(
            "SELECT id, title FROM papers WHERE id = ?", (paper_id,)
        ).fetchone()
        if not seed:
            raise HTTPException(status_code=404, detail="paper not found")
        title = (seed["title"] or "").strip()
        # Keep alphanumeric tokens of length >=3, drop a few obvious stopwords.
        _STOP = {"and", "the", "for", "with", "from", "into", "using", "study",
                 "trial", "versus", "effect", "effects", "analysis", "review",
                 "patients", "clinical", "randomized", "randomised", "based"}
        toks = [
            "".join(ch for ch in w.lower() if ch.isalnum())
            for w in title.split()
        ]
        toks = [t for t in toks if len(t) >= 3 and t not in _STOP]
        # Build bigrams, quoted so FTS treats them as phrases.
        if len(toks) >= 2:
            terms = [f'"{toks[i]} {toks[i + 1]}"' for i in range(len(toks) - 1)]
        else:
            terms = toks
        if not terms:
            _audit("papers.similar", actor, paper_id=paper_id, result_count=0)
            return []
        # Cap to a reasonable number to avoid pathological MATCH queries.
        fts_query = " OR ".join(terms[:20])

        sql = (
            "SELECT " + _PAPER_SELECT_COLS + " "
            "FROM papers p JOIN papers_fts f ON f.rowid = p.id "
            "WHERE papers_fts MATCH ? AND p.id <> ? "
            "LIMIT ?"
        )
        try:
            rows = conn.execute(sql, (fts_query, paper_id, limit * 4)).fetchall()
        except sqlite3.OperationalError:
            rows = []
    finally:
        conn.close()

    ranked = sorted(rows, key=_score, reverse=True)[:limit]
    _audit("papers.similar", actor, paper_id=paper_id, result_count=len(ranked))
    return [_paper_row_to_out(r) for r in ranked]


@router.get("/papers/{paper_id}", response_model=PaperOut)
def get_paper(
    paper_id: int = PathParam(..., ge=1),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> PaperOut:
    require_minimum_role(actor, "clinician")
    conn = _evidence_conn()
    try:
        row = conn.execute(
            "SELECT " + _PAPER_SELECT_COLS + " "
            "FROM papers p WHERE p.id = ?",
            (paper_id,),
        ).fetchone()
    finally:
        conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="paper not found")
    return _paper_row_to_out(row, include_abstract=True)


@router.get("/trials", response_model=list[TrialOut])
def search_trials(
    indication: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    trial_status: Optional[str] = Query(None, alias="status"),
    limit: int = Query(20, ge=1, le=100),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> list[TrialOut]:
    require_minimum_role(actor, "clinician")
    conn = _evidence_conn()
    try:
        where: list[str] = []
        params: list = []
        join = ""
        if indication:
            join = (
                "JOIN trial_indications ti ON ti.trial_id = t.id "
                "JOIN indications i ON i.id = ti.indication_id "
            )
            where.append("i.slug = ?")
            params.append(indication)
        if trial_status:
            where.append("t.status = ?")
            params.append(trial_status)
        if q:
            join += "JOIN trials_fts tf ON tf.rowid = t.id "
            where.append("trials_fts MATCH ?")
            params.append(q)

        sql = (
            "SELECT t.nct_id, t.title, t.phase, t.status, t.enrollment, t.sponsor, "
            "t.conditions_json, t.interventions_json, t.outcomes_json, "
            "t.brief_summary, t.start_date, t.last_update "
            "FROM trials t " + join
            + (" WHERE " + " AND ".join(where) if where else "")
            + " ORDER BY t.last_update DESC LIMIT ?"
        )
        params.append(limit)
        rows = conn.execute(sql, params).fetchall()
    finally:
        conn.close()

    out: list[TrialOut] = []
    for r in rows:
        out.append(TrialOut(
            nct_id=r["nct_id"], title=r["title"], phase=r["phase"], status=r["status"],
            enrollment=r["enrollment"], sponsor=r["sponsor"],
            conditions=json.loads(r["conditions_json"] or "[]"),
            interventions=json.loads(r["interventions_json"] or "[]"),
            outcomes=json.loads(r["outcomes_json"] or "[]"),
            brief_summary=r["brief_summary"], start_date=r["start_date"], last_update=r["last_update"],
        ))
    return out


@router.get("/trials/{nct_id}", response_model=TrialOut)
def get_trial(nct_id: str, actor: AuthenticatedActor = Depends(get_authenticated_actor)) -> TrialOut:
    require_minimum_role(actor, "clinician")
    conn = _evidence_conn()
    try:
        r = conn.execute(
            "SELECT nct_id, title, phase, status, enrollment, sponsor, conditions_json, "
            "interventions_json, outcomes_json, brief_summary, start_date, last_update "
            "FROM trials WHERE nct_id = ?",
            (nct_id,),
        ).fetchone()
    finally:
        conn.close()
    if not r:
        raise HTTPException(status_code=404, detail="trial not found")
    return TrialOut(
        nct_id=r["nct_id"], title=r["title"], phase=r["phase"], status=r["status"],
        enrollment=r["enrollment"], sponsor=r["sponsor"],
        conditions=json.loads(r["conditions_json"] or "[]"),
        interventions=json.loads(r["interventions_json"] or "[]"),
        outcomes=json.loads(r["outcomes_json"] or "[]"),
        brief_summary=r["brief_summary"], start_date=r["start_date"], last_update=r["last_update"],
    )


@router.get("/devices", response_model=list[DeviceOut])
def search_devices(
    indication: Optional[str] = Query(None),
    applicant: Optional[str] = Query(None),
    kind: Optional[str] = Query(None, pattern="^(pma|510k|hde|denovo)$"),
    limit: int = Query(30, ge=1, le=200),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> list[DeviceOut]:
    require_minimum_role(actor, "clinician")
    conn = _evidence_conn()
    try:
        where: list[str] = []
        params: list = []
        join = ""
        if indication:
            join = (
                "JOIN device_indications di ON di.device_id = d.id "
                "JOIN indications i ON i.id = di.indication_id "
            )
            where.append("i.slug = ?")
            params.append(indication)
        if applicant:
            where.append("d.applicant LIKE ?")
            params.append(f"%{applicant}%")
        if kind:
            where.append("d.kind = ?")
            params.append(kind)

        sql = (
            "SELECT d.kind, d.number, d.applicant, d.trade_name, d.product_code, d.decision_date "
            "FROM devices d " + join
            + (" WHERE " + " AND ".join(where) if where else "")
            + " ORDER BY d.decision_date DESC LIMIT ?"
        )
        params.append(limit)
        rows = conn.execute(sql, params).fetchall()
    finally:
        conn.close()
    return [DeviceOut(**dict(r)) for r in rows]


@router.post("/admin/refresh", status_code=202)
def admin_refresh(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict:
    """Admin-only: kick off a full evidence ingest in the background.

    Requires admin role. Returns 202 immediately; the subprocess runs
    detached for ~45 min. Progress is visible via the structured logs
    (`evidence.admin.refresh.*`). A concurrent run guard keeps only one
    ingest in flight at a time via a lock file in /tmp.
    """
    import subprocess

    require_minimum_role(actor, "admin", warnings=["Admin role is required to refresh the evidence pipeline."])

    lock_path = _REFRESH_LOCK
    if lock_path.exists():
        pid_text = lock_path.read_text().strip()
        raise HTTPException(
            status_code=409,
            detail=f"Another evidence refresh is already running (pid {pid_text}). Wait for it to finish or delete the lock file.",
        )

    script = Path(__file__).resolve().parents[4] / "services" / "evidence-pipeline" / "ingest.py"
    if not script.exists():
        raise HTTPException(status_code=503, detail=f"Pipeline not present at {script}.")

    logfile = _REFRESH_LOG
    # Detached subprocess so the HTTP request returns immediately.
    proc = subprocess.Popen(
        [
            "python3", str(script),
            "--all", "--papers", "200", "--trials", "150",
            "--fda", "200", "--events", "100", "--unpaywall",
        ],
        stdout=open(logfile, "w"), stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    lock_path.write_text(f"{proc.pid}\n{datetime.now(timezone.utc).isoformat()}\n")
    _audit("admin.refresh.started", actor, pid=proc.pid, logfile=str(logfile))
    return {
        "ok": True,
        "pid": proc.pid,
        "logfile": str(logfile),
        "lockfile": str(lock_path),
        "note": "Ingest running in background. Poll /api/v1/evidence/stats to watch counts.",
    }


@router.get("/admin/refresh/status")
def admin_refresh_status(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict:
    """Admin-only: inspect the current refresh lock and log tail."""
    require_minimum_role(actor, "admin")
    lock_path = _REFRESH_LOCK
    logfile = _REFRESH_LOG
    if not lock_path.exists():
        return {"running": False, "log_tail": logfile.read_text().splitlines()[-25:] if logfile.exists() else []}
    pid_text = lock_path.read_text().strip()
    return {
        "running": True,
        "lock": pid_text,
        "log_tail": logfile.read_text().splitlines()[-25:] if logfile.exists() else [],
    }


@router.get("/export.xlsx")
def export_matrix_xlsx(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> FileResponse:
    """Stream an up-to-date Excel matrix of the entire evidence DB.

    Generates fresh on each call by invoking
    services/evidence-pipeline/scripts/export_matrix_xlsx.build(). Falls back
    to the committed snapshot under data/evidence-matrix/ if the live DB is
    missing or generation fails.
    """
    import tempfile

    snapshot_dir = Path(__file__).resolve().parents[4] / "data" / "evidence-matrix"
    snapshots = sorted(snapshot_dir.glob("deepsynaps-evidence-*.xlsx"))
    fallback = snapshots[-1] if snapshots else None

    db_path = _default_db_path()
    if os.path.exists(db_path):
        try:
            pipeline_dir = Path(__file__).resolve().parents[4] / "services" / "evidence-pipeline"
            sys.path.insert(0, str(pipeline_dir / "scripts"))
            sys.path.insert(0, str(pipeline_dir))
            import export_matrix_xlsx  # type: ignore
            tmp = tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False)
            tmp.close()
            export_matrix_xlsx.build(tmp.name)
            _audit("export.xlsx.live", actor, output_bytes=os.path.getsize(tmp.name))
            return FileResponse(
                tmp.name,
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                filename="deepsynaps-evidence-live.xlsx",
            )
        except Exception as e:
            _logger.warning(f"live xlsx build failed, falling back to snapshot: {e}")

    if fallback is None:
        raise HTTPException(
            status_code=503,
            detail="Evidence DB not ingested yet and no snapshot committed. "
                   "Run `python3 services/evidence-pipeline/ingest.py --all`.",
        )
    _audit("export.xlsx.snapshot", actor, snapshot=fallback.name)
    return FileResponse(
        str(fallback),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=fallback.name,
    )


@router.post(
    "/papers/{paper_id}/promote-to-library",
    response_model=PromoteOut,
    status_code=status.HTTP_201_CREATED,
)
def promote_to_library(
    paper_id: int,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> PromoteOut:
    """Copy one evidence paper into the doctor's Literature Library.

    This is the bridge between the pre-ingested public evidence DB and the
    Studio's user-scoped library. The library row is independent — deleting
    or re-ingesting the evidence DB does not affect it.
    """
    conn = _evidence_conn()
    try:
        row = conn.execute(
            "SELECT p.id, p.pmid, p.doi, p.title, p.abstract, p.year, p.journal, "
            "p.authors_json, p.pub_types_json, p.oa_url, "
            "(SELECT i.modality FROM indications i JOIN paper_indications pi ON pi.indication_id=i.id "
            " WHERE pi.paper_id=p.id LIMIT 1) AS modality, "
            "(SELECT i.condition FROM indications i JOIN paper_indications pi ON pi.indication_id=i.id "
            " WHERE pi.paper_id=p.id LIMIT 1) AS condition, "
            "(SELECT i.evidence_grade FROM indications i JOIN paper_indications pi ON pi.indication_id=i.id "
            " WHERE pi.paper_id=p.id LIMIT 1) AS evidence_grade "
            "FROM papers p WHERE p.id = ?",
            (paper_id,),
        ).fetchone()
    finally:
        conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="paper not found")

    pub_types = json.loads(row["pub_types_json"] or "[]")
    study_type = None
    for pt in pub_types:
        if pt in {"Randomized Controlled Trial", "Meta-Analysis", "Systematic Review",
                  "Practice Guideline", "Review", "Case Reports", "Clinical Trial"}:
            study_type = pt
            break

    authors_list = json.loads(row["authors_json"] or "[]")
    authors_str = ", ".join(authors_list) if authors_list else None

    lib = LiteraturePaper(
        id=str(uuid.uuid4()),
        added_by=actor.actor_id if hasattr(actor, "actor_id") else str(actor),
        title=row["title"] or "(untitled)",
        authors=authors_str,
        journal=row["journal"],
        year=row["year"],
        doi=row["doi"],
        pubmed_id=row["pmid"],
        abstract=row["abstract"],
        modality=row["modality"],
        condition=row["condition"],
        evidence_grade=row["evidence_grade"],
        study_type=study_type,
        tags_json=json.dumps(["promoted-from-evidence"]),
        url=row["oa_url"],
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(lib)
    db.commit()
    db.refresh(lib)
    _audit("papers.promote_to_library", actor, paper_id=paper_id, library_id=lib.id,
           pmid=row["pmid"], doi=row["doi"])
    return PromoteOut(library_id=lib.id, title=lib.title)
