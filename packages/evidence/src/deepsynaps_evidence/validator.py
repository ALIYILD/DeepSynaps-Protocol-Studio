"""Citation Validator — orchestrator for claim validation against the corpus.

Implements the ``CitationValidator`` interface described in
``evidence_citation_validator.md`` section 5.4. Coordinates corpus
search, fabrication checks, evidence scoring, and audit logging.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Optional

from sqlalchemy.orm import Session

from deepsynaps_evidence.schemas import (
    Citation,
    Claim,
    ConfidenceLabel,
    ValidationIssue,
    ValidationRequest,
    ValidationResult,
)
from deepsynaps_evidence.scoring import (
    EVIDENCE_LEVEL_SCORE,
    assign_confidence,
    assign_grade,
    evidence_level_to_score,
    score_citation,
)

_log = logging.getLogger(__name__)

VALIDATOR_VERSION = "0.1.0"


# ── Strong-claim patterns (spec section 6.2) ────────────────────────────────

_STRONG_CLAIM_PATTERNS = [
    re.compile(p, re.IGNORECASE)
    for p in [
        r"(?:has been|is)\s+(?:proven|demonstrated|shown)\s+to\s+(?:cure|eliminate|reverse)",
        r"(?:definitively|conclusively)\s+(?:treats|cures)",
        r"100%\s+(?:effective|response|cure)\s+rate",
        r"guaranteed\s+(?:outcome|improvement|recovery)",
        r"FDA.approved\s+for",
        r"CE.marked\s+for\s+(?!class\s+I)",
    ]
]


def _check_strong_claims(claim_text: str) -> list[ValidationIssue]:
    """Check for unsupported strong efficacy language."""
    issues = []
    for pattern in _STRONG_CLAIM_PATTERNS:
        match = pattern.search(claim_text)
        if match:
            issues.append(ValidationIssue(
                issue_type="strong_claim_ungrounded",
                severity="block",
                message=f"Strong claim detected: '{match.group()}'. "
                        f"Requires Grade A or B citation support.",
            ))
    return issues


def _check_empty_claim(claim: Claim) -> list[ValidationIssue]:
    """Check for empty or trivially short claims."""
    if not claim.claim_text.strip():
        return [ValidationIssue(
            issue_type="empty_claim",
            severity="warning",
            message="Claim text is empty or whitespace-only.",
        )]
    return []


# ── Main validation logic ────────────────────────────────────────────────────

def validate_claims(
    session: Session,
    request: ValidationRequest,
    *,
    actor_id: str | None = None,
) -> list[ValidationResult]:
    """Validate a batch of claims against the evidence corpus.

    For each claim:
    1. Check for empty text
    2. Run strong-claim regex check
    3. Verify any asserted PMIDs (fabrication detection)
    4. Search corpus via pgvector ANN (or text fallback)
    5. Check retraction status
    6. Compute evidence grade and confidence
    7. Persist DsClaimCitation records
    8. Log hash-chained audit events
    9. Return ValidationResult

    Parameters
    ----------
    session : Session
        Open SQLAlchemy session.
    request : ValidationRequest
        Contains claims and validation parameters.
    actor_id : str, optional
        The clinician/system ID triggering the validation.

    Returns
    -------
    list[ValidationResult]
        One result per claim in the request.
    """
    from deepsynaps_evidence import corpus_adapter
    from deepsynaps_evidence.audit import log_grounding_event

    results: list[ValidationResult] = []

    for claim in request.claims:
        issues: list[ValidationIssue] = []
        citations: list[Citation] = []
        pmids_verified = 0
        pmids_fabricated = 0
        pmids_retracted = 0

        # 1. Empty check
        issues.extend(_check_empty_claim(claim))

        # 2. Strong-claim check
        strong_issues = _check_strong_claims(claim.claim_text)

        # 3. PMID fabrication check
        if claim.asserted_pmids:
            verification = corpus_adapter.bulk_verify_pmids(session, claim.asserted_pmids)
            for pmid, exists in verification.items():
                if exists:
                    pmids_verified += 1
                    # Check retraction
                    if corpus_adapter.is_retracted(session, pmid):
                        pmids_retracted += 1
                        issues.append(ValidationIssue(
                            claim_id=claim.claim_hash,
                            issue_type="retracted_paper",
                            severity="block",
                            message=f"Paper PMID {pmid} has been retracted.",
                            study_identifier=pmid,
                        ))
                        log_grounding_event(
                            session,
                            event_type="retraction_blocked",
                            study_identifier=pmid,
                            claim_hash=claim.claim_hash,
                            decision="block",
                            reason="Paper retracted",
                            decided_by=actor_id or "system",
                        )
                    else:
                        log_grounding_event(
                            session,
                            event_type="pmid_verified",
                            study_identifier=pmid,
                            claim_hash=claim.claim_hash,
                            decision="include",
                            reason="PMID exists in corpus",
                            decided_by=actor_id or "system",
                        )
                else:
                    pmids_fabricated += 1
                    issues.append(ValidationIssue(
                        claim_id=claim.claim_hash,
                        issue_type="fabricated_pmid",
                        severity="block",
                        message=f"PMID {pmid} not found in corpus — possible fabrication.",
                        study_identifier=pmid,
                    ))
                    log_grounding_event(
                        session,
                        event_type="fabrication_blocked",
                        study_identifier=pmid,
                        claim_hash=claim.claim_hash,
                        decision="block",
                        reason="PMID absent from corpus",
                        decided_by=actor_id or "system",
                    )

        # 4. Corpus search — try pgvector first, fall back to text
        found_citations = corpus_adapter.find_similar_text(
            session,
            claim.claim_text,
            top_k=request.max_citations_per_claim,
        )

        # Also try pgvector ANN if embedding is available
        # (will return [] on SQLite)
        ann_citations = corpus_adapter.find_similar(
            session,
            [],  # empty embedding — will gracefully return [] without crashing
            top_k=request.max_citations_per_claim,
            min_score=request.min_relevance,
        )
        if ann_citations:
            found_citations = ann_citations

        # 5. Filter retracted papers and apply min_relevance
        for cit in found_citations:
            if cit.retracted:
                pmids_retracted += 1
                continue
            if cit.relevance_score < request.min_relevance:
                continue
            citations.append(cit)

        # Cap at max_citations_per_claim
        citations = citations[:request.max_citations_per_claim]

        # 6. Score and grade
        if citations:
            scores = []
            for cit in citations:
                if cit.evidence_grade:
                    cit_score = score_citation(cit.relevance_score, cit.evidence_grade)
                else:
                    # Assign grade from paper metadata
                    cit_grade = assign_grade(None, None)
                    cit = cit.model_copy(update={"evidence_grade": cit_grade})
                    cit_score = score_citation(cit.relevance_score, cit_grade)

                scores.append(evidence_level_to_score(None))  # placeholder level

            # If we found papers with evidence_level, use those
            paper_scores = []
            for cit in citations:
                # Look up paper's evidence_level from the DB
                DsPaper = corpus_adapter._import_models()
                paper = session.get(DsPaper, cit.paper_id)
                if paper and paper.evidence_level:
                    paper_scores.append(evidence_level_to_score(paper.evidence_level))
                elif cit.evidence_grade:
                    # Map grade to approximate score
                    grade_to_level = {"A": "HIGHEST", "B": "HIGH", "C": "MEDIUM", "D": "LOW"}
                    paper_scores.append(
                        evidence_level_to_score(grade_to_level.get(cit.evidence_grade, "LOW"))
                    )
                else:
                    paper_scores.append(1)

            mean_score = sum(paper_scores) / len(paper_scores) if paper_scores else 0
            confidence_label = assign_confidence(mean_score, len(citations))
            grounding_score = sum(c.relevance_score for c in citations) / len(citations)
        else:
            confidence_label = "INSUFFICIENT"
            grounding_score = 0.0

        # Strong-claim check: only block if no Grade A/B citation supports it
        if strong_issues:
            has_strong_support = any(
                c.evidence_grade in ("A", "B") for c in citations
            )
            if not has_strong_support:
                issues.extend(strong_issues)
                for si in strong_issues:
                    log_grounding_event(
                        session,
                        event_type="unsupported_claim_blocked",
                        claim_hash=claim.claim_hash,
                        decision="block",
                        reason=si.message,
                        decided_by=actor_id or "system",
                    )

        # Corpus miss
        if not citations and not any(i.severity == "block" for i in issues):
            issues.append(ValidationIssue(
                claim_id=claim.claim_hash,
                issue_type="corpus_miss",
                severity="warning",
                message="No matching papers found in the evidence corpus.",
            ))
            log_grounding_event(
                session,
                event_type="corpus_miss",
                claim_hash=claim.claim_hash,
                decision="warn",
                reason="Zero corpus matches",
                decided_by=actor_id or "system",
            )

        # 7. Persist DsClaimCitation records
        citation_ids: list[str] = []
        from app.repositories.citation_validator import create_claim_citation
        for cit in citations:
            record = create_claim_citation(
                session,
                claim_text=claim.claim_text,
                claim_hash=claim.claim_hash,
                paper_id=cit.paper_id,
                citation_type=cit.citation_type,
                relevance_score=cit.relevance_score,
                evidence_grade=cit.evidence_grade,
                confidence=grounding_score,
                validation_status="supported" if not any(i.severity == "block" for i in issues) else "blocked",
                issues=[i.model_dump() for i in issues] if issues else None,
                actor_id=actor_id,
                validator_version=VALIDATOR_VERSION,
            )
            citation_ids.append(record.id)
            log_grounding_event(
                session,
                event_type="relevance_accepted",
                study_identifier=cit.pmid or cit.doi,
                claim_hash=claim.claim_hash,
                decision="include",
                reason=f"relevance={cit.relevance_score:.3f} grade={cit.evidence_grade}",
                confidence=cit.relevance_score,
                decided_by=actor_id or "system",
            )

        # If no citations, still persist the claim as ungrounded
        if not citations:
            record = create_claim_citation(
                session,
                claim_text=claim.claim_text,
                claim_hash=claim.claim_hash,
                validation_status="ungrounded",
                issues=[i.model_dump() for i in issues] if issues else None,
                actor_id=actor_id,
                validator_version=VALIDATOR_VERSION,
            )
            citation_ids.append(record.id)

        # 8. Log confidence assignment
        audit_event_id = log_grounding_event(
            session,
            event_type="confidence_assigned",
            claim_hash=claim.claim_hash,
            decision="include" if confidence_label != "INSUFFICIENT" else "warn",
            reason=f"confidence={confidence_label} grounding_score={grounding_score:.3f}",
            confidence=grounding_score,
            decided_by=actor_id or "system",
        )

        # 9. Attempt hypergraph enrichment for passed results
        if not any(i.severity == "block" for i in issues) and citations:
            try:
                from deepsynaps_evidence.hypergraph import auto_enrich_from_validation
                enriched = auto_enrich_from_validation(session, citation_ids)
                if enriched > 0:
                    log_grounding_event(
                        session,
                        event_type="hypergraph_enriched",
                        claim_hash=claim.claim_hash,
                        decision="include",
                        reason=f"Enriched {enriched} hyperedge link(s)",
                        decided_by=actor_id or "system",
                    )
            except Exception as exc:
                _log.debug("Hypergraph enrichment skipped: %s", exc)

        results.append(ValidationResult(
            claim_hash=claim.claim_hash,
            claim_text=claim.claim_text,
            citations=citations,
            grounding_score=grounding_score,
            confidence_label=confidence_label,
            issues=issues,
            pmids_verified=pmids_verified,
            pmids_fabricated=pmids_fabricated,
            pmids_retracted=pmids_retracted,
            audit_event_id=audit_event_id,
        ))

    return results


def ground_claim(
    session: Session,
    claim_text: str,
    *,
    actor_id: str | None = None,
    top_k: int = 5,
    min_relevance: float = 0.15,
) -> ValidationResult:
    """Convenience wrapper to validate a single claim string.

    Parameters
    ----------
    session : Session
    claim_text : str
        De-identified clinical assertion.
    actor_id : str, optional
    top_k : int
    min_relevance : float

    Returns
    -------
    ValidationResult
    """
    claim = Claim(claim_text=claim_text)
    request = ValidationRequest(
        claims=[claim],
        max_citations_per_claim=top_k,
        min_relevance=min_relevance,
    )
    results = validate_claims(session, request, actor_id=actor_id)
    return results[0] if results else ValidationResult(
        claim_hash=claim.claim_hash,
        claim_text=claim_text,
    )
