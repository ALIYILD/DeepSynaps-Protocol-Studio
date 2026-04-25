"""Citation Validator API — validate clinical claims against the evidence corpus.

Endpoints
---------
POST /api/v1/citations/validate  — Validate one or more claims
GET  /api/v1/citations/health    — Corpus stats & chain integrity
GET  /api/v1/citations/{id}      — Single claim citation detail
GET  /api/v1/citations/audit     — Hash-chained audit trail
"""
from __future__ import annotations

import json
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.database import get_db_session
from app.errors import ApiServiceError

router = APIRouter(prefix="/api/v1/citations", tags=["citation-validator"])


# ── Schemas ──────────────────────────────────────────────────────────────────

class ClaimIn(BaseModel):
    claim_text: str = Field(..., max_length=2000)
    claim_category: str = ""
    asserted_pmids: list[str] = Field(default_factory=list)


class ValidateRequest(BaseModel):
    claims: list[ClaimIn] = Field(..., min_length=1, max_length=50)
    max_citations_per_claim: int = Field(default=5, ge=1, le=20)
    min_relevance: float = Field(default=0.15, ge=0.0, le=1.0)
    require_pmid: bool = True


class CitationOut(BaseModel):
    paper_id: str
    pmid: Optional[str] = None
    doi: Optional[str] = None
    title: str = ""
    authors_short: str = ""
    year: Optional[int] = None
    journal: Optional[str] = None
    citation_type: str = "supports"
    evidence_grade: Optional[str] = None
    relevance_score: float = 0.0
    retracted: bool = False


class ValidationIssueOut(BaseModel):
    issue_type: str
    severity: str
    message: str
    study_identifier: Optional[str] = None


class ValidationResultOut(BaseModel):
    claim_hash: str
    claim_text: str = ""
    citations: list[CitationOut] = Field(default_factory=list)
    grounding_score: float = 0.0
    confidence_label: str = "INSUFFICIENT"
    issues: list[ValidationIssueOut] = Field(default_factory=list)
    pmids_verified: int = 0
    pmids_fabricated: int = 0
    pmids_retracted: int = 0
    passed: bool = True
    audit_event_id: Optional[str] = None


class ValidateResponse(BaseModel):
    results: list[ValidationResultOut]
    total_claims: int
    total_passed: int


class ClaimCitationOut(BaseModel):
    id: str
    claim_text: str
    claim_hash: str
    paper_id: Optional[str] = None
    citation_type: str = "supports"
    relevance_score: Optional[float] = None
    evidence_grade: Optional[str] = None
    confidence: Optional[float] = None
    validation_status: str = "pending"
    issues: list[dict] = Field(default_factory=list)
    created_at: str = ""


class AuditEventOut(BaseModel):
    event_id: str
    event_type: str
    study_identifier: Optional[str] = None
    claim_hash: Optional[str] = None
    decision: str
    reason: Optional[str] = None
    confidence: Optional[float] = None
    decided_by: str = "system"
    prev_hash: Optional[str] = None
    row_hash: str = ""
    created_at: str = ""


class HealthResponse(BaseModel):
    total_papers: int
    papers_with_embeddings: int
    total_claim_citations: int
    total_audit_events: int
    chain_valid: bool
    chain_errors: list[str] = Field(default_factory=list)


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/validate", response_model=ValidateResponse, status_code=200)
def validate_claims(
    body: ValidateRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ValidateResponse:
    """Validate clinical claims against the evidence corpus."""
    require_minimum_role(actor, "clinician")

    from deepsynaps_evidence.schemas import Claim, ValidationRequest
    from deepsynaps_evidence.validator import validate_claims as _validate

    claims = [
        Claim(
            claim_text=c.claim_text,
            claim_category=c.claim_category,
            asserted_pmids=c.asserted_pmids,
        )
        for c in body.claims
    ]

    request = ValidationRequest(
        claims=claims,
        max_citations_per_claim=body.max_citations_per_claim,
        min_relevance=body.min_relevance,
        require_pmid=body.require_pmid,
    )

    results = _validate(db, request, actor_id=actor.actor_id)

    out_results = []
    for r in results:
        out_results.append(ValidationResultOut(
            claim_hash=r.claim_hash,
            claim_text=r.claim_text,
            citations=[
                CitationOut(
                    paper_id=c.paper_id,
                    pmid=c.pmid,
                    doi=c.doi,
                    title=c.title,
                    authors_short=c.authors_short,
                    year=c.year,
                    journal=c.journal,
                    citation_type=c.citation_type,
                    evidence_grade=c.evidence_grade,
                    relevance_score=c.relevance_score,
                    retracted=c.retracted,
                )
                for c in r.citations
            ],
            grounding_score=r.grounding_score,
            confidence_label=r.confidence_label,
            issues=[
                ValidationIssueOut(
                    issue_type=i.issue_type,
                    severity=i.severity,
                    message=i.message,
                    study_identifier=i.study_identifier,
                )
                for i in r.issues
            ],
            pmids_verified=r.pmids_verified,
            pmids_fabricated=r.pmids_fabricated,
            pmids_retracted=r.pmids_retracted,
            passed=r.passed,
            audit_event_id=r.audit_event_id,
        ))

    return ValidateResponse(
        results=out_results,
        total_claims=len(out_results),
        total_passed=sum(1 for r in out_results if r.passed),
    )


@router.get("/health", response_model=HealthResponse)
def citations_health(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> HealthResponse:
    """Return corpus statistics and audit chain integrity."""
    require_minimum_role(actor, "clinician")

    from app.repositories.citation_validator import (
        count_papers,
        count_papers_with_embeddings,
    )
    from app.persistence.models import DsClaimCitation, DsGroundingAudit
    from deepsynaps_evidence.audit import verify_chain

    total_papers = count_papers(db)
    papers_with_emb = count_papers_with_embeddings(db)
    total_citations = db.query(DsClaimCitation).count()
    total_audit = db.query(DsGroundingAudit).count()
    chain_valid, chain_errors = verify_chain(db, limit=200)

    return HealthResponse(
        total_papers=total_papers,
        papers_with_embeddings=papers_with_emb,
        total_claim_citations=total_citations,
        total_audit_events=total_audit,
        chain_valid=chain_valid,
        chain_errors=chain_errors,
    )


@router.get("/audit", response_model=list[AuditEventOut])
def list_audit(
    claim_hash: Optional[str] = None,
    limit: int = 50,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> list[AuditEventOut]:
    """Return the hash-chained grounding audit trail."""
    require_minimum_role(actor, "clinician")

    from app.repositories.citation_validator import list_audit_events

    records = list_audit_events(db, claim_hash=claim_hash, limit=limit)
    return [
        AuditEventOut(
            event_id=r.event_id,
            event_type=r.event_type,
            study_identifier=r.study_identifier,
            claim_hash=r.claim_hash,
            decision=r.decision,
            reason=r.reason,
            confidence=r.confidence,
            decided_by=r.decided_by,
            prev_hash=r.prev_hash,
            row_hash=r.row_hash,
            created_at=r.created_at.isoformat() if r.created_at else "",
        )
        for r in records
    ]


@router.get("/{claim_citation_id}", response_model=ClaimCitationOut)
def get_claim_citation(
    claim_citation_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ClaimCitationOut:
    """Return a single claim citation record."""
    require_minimum_role(actor, "clinician")

    from app.repositories.citation_validator import get_claim_citation as _get

    record = _get(db, claim_citation_id)
    if record is None:
        raise ApiServiceError(
            code="not_found",
            message=f"Claim citation {claim_citation_id} not found.",
            status_code=404,
        )

    issues = []
    if record.issues_json:
        try:
            issues = json.loads(record.issues_json)
        except (json.JSONDecodeError, TypeError):
            pass

    return ClaimCitationOut(
        id=record.id,
        claim_text=record.claim_text,
        claim_hash=record.claim_hash,
        paper_id=record.paper_id,
        citation_type=record.citation_type,
        relevance_score=record.relevance_score,
        evidence_grade=record.evidence_grade,
        confidence=record.confidence,
        validation_status=record.validation_status,
        issues=issues,
        created_at=record.created_at.isoformat() if record.created_at else "",
    )
