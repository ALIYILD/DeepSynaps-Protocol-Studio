from __future__ import annotations

import hashlib
import json
import math
import os
import sqlite3
import uuid
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.logging_setup import get_logger
from app.persistence.models import DsPaper, EvidenceSavedCitation, LiteraturePaper

EvidenceLevel = Literal["low", "moderate", "high"]
ApplicabilityMatch = Literal["weakly_matched", "partially_matched", "strongly_matched"]
ContextType = Literal[
    "prediction",
    "biomarker",
    "risk_score",
    "recommendation",
    "multimodal_summary",
]

_logger = get_logger("evidence_intelligence")


class EvidenceFeatureSummary(BaseModel):
    name: str
    value: Optional[str | float | int] = None
    modality: Optional[str] = None
    direction: Optional[str] = None
    contribution: Optional[float] = None


class EvidenceQuery(BaseModel):
    patient_id: str
    context_type: ContextType
    target_name: str
    modality_filters: list[str] = Field(default_factory=list)
    diagnosis_filters: list[str] = Field(default_factory=list)
    intervention_filters: list[str] = Field(default_factory=list)
    age_band: Optional[str] = None
    sex: Optional[str] = None
    medications: list[str] = Field(default_factory=list)
    phenotype_tags: list[str] = Field(default_factory=list)
    feature_summary: list[EvidenceFeatureSummary] = Field(default_factory=list)
    max_results: int = Field(default=8, ge=1, le=50)
    include_counter_evidence: bool = True
    include_review_only: bool = False
    include_recent_only: bool = False


class EvidenceDriver(BaseModel):
    source_modality: str
    label: str
    value: str
    direction: str
    contribution_text: str
    weight: float = 0.0


class EvidenceApplicabilityDimension(BaseModel):
    label: str
    match: ApplicabilityMatch
    rationale: str


class EvidenceApplicability(BaseModel):
    overall_match: ApplicabilityMatch
    score: float
    dimensions: list[EvidenceApplicabilityDimension] = Field(default_factory=list)


class EvidenceScoreBreakdown(BaseModel):
    semantic_relevance: float = 0.0
    concept_overlap: float = 0.0
    modality_match: float = 0.0
    diagnosis_match: float = 0.0
    intervention_match: float = 0.0
    evidence_quality: float = 0.0
    recency: float = 0.0
    patient_applicability: float = 0.0
    total: float = 0.0


class EvidencePaper(BaseModel):
    paper_id: str
    pmid: Optional[str] = None
    doi: Optional[str] = None
    title: str
    year: Optional[int] = None
    journal: Optional[str] = None
    authors: list[str] = Field(default_factory=list)
    study_type: str = "mechanistic / preclinical"
    abstract_snippet: str = ""
    relevance_note: str = ""
    evidence_quality: str = "low"
    citation_count: Optional[int] = None
    url: Optional[str] = None
    matched_concepts: list[str] = Field(default_factory=list)
    score_breakdown: EvidenceScoreBreakdown = Field(default_factory=EvidenceScoreBreakdown)
    retrieval_reason: str = ""


class EvidenceCitationPayload(BaseModel):
    finding_id: str
    paper_id: str
    pmid: Optional[str] = None
    doi: Optional[str] = None
    title: str
    inline_citation: str
    reference: str
    citation_type: str = "supports"
    evidence_quality: str


class EvidenceProvenance(BaseModel):
    source_paper_ids: list[str] = Field(default_factory=list)
    retrieval_reasons: list[str] = Field(default_factory=list)
    matched_concepts: list[str] = Field(default_factory=list)
    ranking_metadata: dict[str, Any] = Field(default_factory=dict)
    generated_at: str
    model_version: str = "deterministic-evidence-intelligence-v1"
    corpus: str = "unknown"


class EvidenceSummary(BaseModel):
    finding_id: str
    label: str
    claim: str
    context_type: ContextType
    target_name: str
    evidence_level: EvidenceLevel
    confidence_score: float
    paper_count: int
    top_papers: list[EvidencePaper] = Field(default_factory=list)
    conflicting_count: int = 0
    saved: bool = False


class EvidenceResult(BaseModel):
    finding_id: str
    claim: str
    claim_type: ContextType
    target_name: str
    patient_context_summary: str
    confidence_score: float
    evidence_strength: EvidenceLevel
    top_drivers: list[EvidenceDriver] = Field(default_factory=list)
    supporting_papers: list[EvidencePaper] = Field(default_factory=list)
    conflicting_papers: list[EvidencePaper] = Field(default_factory=list)
    applicability: EvidenceApplicability
    literature_summary: str
    recommended_caution: str
    provenance: EvidenceProvenance
    export_citations: list[EvidenceCitationPayload] = Field(default_factory=list)


class PatientEvidenceOverview(BaseModel):
    patient_id: str
    highlights: list[EvidenceSummary] = Field(default_factory=list)
    by_modality: dict[str, list[EvidenceSummary]] = Field(default_factory=dict)
    by_score: list[EvidenceSummary] = Field(default_factory=list)
    by_protocol: list[EvidenceSummary] = Field(default_factory=list)
    contradictory_findings: list[EvidenceSummary] = Field(default_factory=list)
    saved_citations: list[dict[str, Any]] = Field(default_factory=list)
    compare_with_literature_phenotype: dict[str, Any] = Field(default_factory=dict)
    evidence_used_in_report: list[EvidenceCitationPayload] = Field(default_factory=list)


class SaveCitationRequest(BaseModel):
    patient_id: str
    finding_id: str
    finding_label: str
    claim: str
    paper_id: str
    paper_title: str
    pmid: Optional[str] = None
    doi: Optional[str] = None
    context_kind: Optional[str] = None
    analysis_id: Optional[str] = None
    report_id: Optional[str] = None
    citation_payload: dict[str, Any] = Field(default_factory=dict)


class ReportPayloadRequest(BaseModel):
    patient_id: str
    finding_ids: list[str] = Field(default_factory=list)
    include_saved: bool = True
    max_results_per_finding: int = Field(default=5, ge=1, le=20)
    context_kind: Optional[str] = None
    analysis_id: Optional[str] = None
    report_id: Optional[str] = None


class EvidenceFilterState(BaseModel):
    modality: Optional[str] = None
    diagnosis: Optional[str] = None
    intervention: Optional[str] = None
    evidence_type: Optional[str] = None
    year_min: Optional[int] = None
    relevance_min: Optional[float] = None
    patient_applicability: Optional[ApplicabilityMatch] = None
    search: Optional[str] = None


@dataclass
class _CandidatePaper:
    paper_id: str
    pmid: Optional[str]
    doi: Optional[str]
    title: str
    abstract: str
    year: Optional[int]
    journal: Optional[str]
    authors: list[str]
    pub_types: list[str]
    cited_by_count: Optional[int]
    url: Optional[str]
    source: str


TARGET_CONCEPTS: dict[str, dict[str, Any]] = {
    "depression_risk": {
        "claim": "Decision-support evidence links depression-risk estimates to assessment severity, autonomic, sleep, EEG, voice, text, medication, and adherence signals.",
        "concepts": ["depression", "major depressive disorder", "PHQ-9", "QIDS", "MADRS", "sleep", "HRV", "EEG", "voice", "sentiment"],
        "diagnoses": ["depression", "mdd", "major depressive disorder"],
        "modalities": ["assessment", "wearables", "qeeg", "voice", "text", "medication"],
    },
    "anxiety_risk": {
        "claim": "Decision-support evidence links anxiety-risk estimates to GAD-7 severity, autonomic tone, sleep, EEG, voice, passive sensing, and text markers.",
        "concepts": ["anxiety", "generalized anxiety", "GAD-7", "HRV", "sleep", "EEG", "voice", "digital phenotype"],
        "diagnoses": ["anxiety", "gad", "generalized anxiety disorder"],
        "modalities": ["assessment", "wearables", "qeeg", "voice", "text"],
    },
    "stress_load": {
        "claim": "Decision-support evidence links stress-load estimates to autonomic dysregulation, HRV, resting heart rate, sleep, passive sensing, voice, and text markers.",
        "concepts": ["stress", "autonomic dysregulation", "HRV", "resting heart rate", "sleep", "passive sensing", "voice"],
        "diagnoses": ["stress", "anxiety", "depression"],
        "modalities": ["wearables", "voice", "text", "digital phenotype"],
    },
    "brain_age": {
        "claim": "Decision-support evidence links brain-age estimates to structural MRI patterns and age-contextual neuroimaging markers.",
        "concepts": ["brain age", "structural MRI", "cortical thickness", "atrophy", "neuroimaging", "EEG"],
        "diagnoses": ["cognitive impairment", "mci", "depression"],
        "modalities": ["mri", "qeeg"],
    },
    "mci_risk": {
        "claim": "Decision-support evidence links MCI-risk estimates to MRI atrophy, EEG slowing, cognitive assessment, voice/language, and passive-sensing patterns.",
        "concepts": ["mild cognitive impairment", "MCI", "hippocampal volume", "cortical thinning", "EEG slowing", "language"],
        "diagnoses": ["mci", "cognitive impairment", "alzheimer"],
        "modalities": ["mri", "qeeg", "voice", "assessment"],
    },
    "frontal_alpha_asymmetry": {
        "claim": "Decision-support evidence links frontal alpha asymmetry with affective symptom burden and treatment-response phenotypes.",
        "concepts": ["frontal alpha asymmetry", "EEG asymmetry", "depression", "affective", "alpha power"],
        "diagnoses": ["depression", "anxiety"],
        "modalities": ["qeeg", "eeg"],
    },
    "theta_beta_ratio": {
        "claim": "Decision-support evidence links theta/beta shifts and cortical slowing to attentional and affective clinical phenotypes.",
        "concepts": ["theta beta ratio", "theta/beta", "EEG", "cortical slowing", "attention", "depression"],
        "diagnoses": ["adhd", "depression", "anxiety"],
        "modalities": ["qeeg", "eeg"],
    },
    "hippocampal_atrophy": {
        "claim": "Decision-support evidence links hippocampal volume patterns with cognitive-risk and affective-disorder phenotypes.",
        "concepts": ["hippocampal volume", "hippocampal atrophy", "MCI", "depression", "MRI"],
        "diagnoses": ["mci", "depression", "cognitive impairment"],
        "modalities": ["mri"],
    },
    "protocol_ranking": {
        "claim": "Decision-support evidence links protocol recommendations to patient phenotype, biomarkers, prior response, diagnosis, and neuromodulation intervention literature.",
        "concepts": ["neuromodulation", "rTMS", "tDCS", "DLPFC", "depression", "protocol", "treatment response"],
        "diagnoses": ["depression", "anxiety", "mci"],
        "modalities": ["rtms", "tdcs", "tfus", "neuromodulation"],
    },
    "voice_affect": {
        "claim": "Decision-support evidence links voice prosody, speech rate, pause structure, and vocal affect to depression, anxiety, and stress phenotypes.",
        "concepts": ["voice", "speech", "prosody", "depression", "anxiety", "stress", "pause"],
        "diagnoses": ["depression", "anxiety"],
        "modalities": ["voice"],
    },
    "parkinson_voice": {
        "claim": "Decision-support evidence links hypokinetic dysarthria, vocal tremor, and acoustic perturbation markers to Parkinson disease monitoring contexts.",
        "concepts": ["Parkinson disease", "hypokinetic dysarthria", "jitter", "shimmer", "HNR", "voice", "speech"],
        "diagnoses": ["parkinson disease", "parkinsonism"],
        "modalities": ["voice", "speech"],
    },
    "respiratory_screening": {
        "claim": "Decision-support evidence links cough acoustics and breath-sound features to respiratory screening and monitoring discussions.",
        "concepts": ["cough", "respiratory", "breath sounds", "COPD", "acoustic biomarkers"],
        "diagnoses": ["copd", "respiratory disease"],
        "modalities": ["voice", "audio"],
    },
    "video_affect": {
        "claim": "Decision-support evidence links facial affect and video-derived engagement markers to mood and anxiety monitoring.",
        "concepts": ["facial affect", "video", "emotion recognition", "depression", "anxiety"],
        "diagnoses": ["depression", "anxiety"],
        "modalities": ["video"],
    },
    "text_sentiment": {
        "claim": "Decision-support evidence links journal sentiment and language markers to longitudinal depression, anxiety, and stress monitoring.",
        "concepts": ["text sentiment", "language markers", "journal", "depression", "anxiety", "stress"],
        "diagnoses": ["depression", "anxiety"],
        "modalities": ["text"],
    },
    # ── Risk Analyzer workspace — corpus retrieval targets (evidence.db FTS + ranking) ──
    "suicide_self_harm_risk": {
        "claim": "Literature context for suicide risk screening, safety planning, PHQ-9/C-SSRS use, and acute psychiatric stabilization.",
        "concepts": ["suicide", "suicidal ideation", "Columbia Suicide Severity Rating Scale", "PHQ-9", "self-harm", "safety planning", "crisis intervention", "psychiatric emergency"],
        "diagnoses": ["depression", "major depressive disorder", "mood disorder"],
        "modalities": ["assessment", "psychiatry"],
    },
    "self_harm_nssi_risk": {
        "claim": "Literature context for non-suicidal self-injury, self-harm monitoring, and engagement in mental health care.",
        "concepts": ["self-harm", "nonsuicidal self-injury", "NSSI", "cutting", "PHQ-9", "mood", "dialectical behavior therapy"],
        "diagnoses": ["depression", "borderline personality", "mood disorder"],
        "modalities": ["assessment", "behavioral health"],
    },
    "mental_crisis_acute": {
        "claim": "Literature context for acute destabilization, agitation, crisis services, and rapid worsening of psychiatric status.",
        "concepts": ["psychiatric emergency", "agitation", "acute psychosis", "crisis", "decompensation", "involuntary", "stabilization"],
        "diagnoses": ["depression", "bipolar", "schizophrenia", "anxiety"],
        "modalities": ["emergency", "psychiatry", "wearables"],
    },
    "harm_to_others_violence": {
        "claim": "Literature context for violence risk assessment, harm to others, and conflict de-escalation in mental health care.",
        "concepts": ["violence", "aggression", "homicide", "threat", "harm to others", "risk assessment", "forensic psychiatry"],
        "diagnoses": ["personality disorder", "psychosis", "substance use"],
        "modalities": ["psychiatry", "emergency"],
    },
    "seizure_stimulation_safety": {
        "claim": "Literature context for seizure history, rTMS/tDCS safety, threshold-lowering drugs, and neuromodulation contraindications.",
        "concepts": ["seizure", "epilepsy", "TMS", "rTMS", "neuromodulation", "seizure threshold", "anticonvulsant"],
        "diagnoses": ["epilepsy", "mood disorder"],
        "modalities": ["neuromodulation", "neurology"],
    },
    "implant_device_safety": {
        "claim": "Literature context for MR-conditional devices, ferromagnetic implants, and screening before magnetic brain stimulation.",
        "concepts": ["implant", "cochlear", "DBS", "MR-conditional", "ferromagnetic", "TMS", "safety screening"],
        "diagnoses": ["parkinson disease", "hearing loss"],
        "modalities": ["mri", "neuromodulation"],
    },
    "medication_interaction_safety": {
        "claim": "Literature context for psychotropic and neuromodulation-relevant drug interactions, anticoagulation, and polypharmacy review.",
        "concepts": ["drug interaction", "polypharmacy", "antidepressant", "lithium", "anticonvulsant", "bleeding", "TMS"],
        "diagnoses": ["depression", "bipolar"],
        "modalities": ["medication", "neuromodulation"],
    },
    "allergy_medication_safety": {
        "claim": "Literature context for drug allergy documentation, cross-reactivity, and medication reconciliation in neuropsychiatric care.",
        "concepts": ["drug allergy", "hypersensitivity", "medication reconciliation", "contraindication", "anaphylaxis"],
        "diagnoses": ["depression", "anxiety"],
        "modalities": ["medication"],
    },
    "relapse_adherence_neuromod": {
        "claim": "Literature context for treatment adherence, dropout, relapse prevention, and neuromodulation course completion.",
        "concepts": ["adherence", "relapse", "dropout", "depression", "rTMS", "tDCS", "continuation", "maintenance"],
        "diagnoses": ["depression", "mdd"],
        "modalities": ["neuromodulation", "wearables"],
    },
}


def stable_finding_id(query: EvidenceQuery) -> str:
    raw = "|".join([
        query.patient_id,
        query.context_type,
        query.target_name,
        ",".join(sorted(query.modality_filters)),
        ",".join(sorted(query.diagnosis_filters)),
        ",".join(sorted(query.intervention_filters)),
    ])
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]


def normalize_target_name(target_name: str) -> str:
    value = (target_name or "").strip().lower().replace("-", "_").replace(" ", "_")
    aliases = {
        "depression_severity": "depression_risk",
        "anxiety_severity": "anxiety_risk",
        "stress": "stress_load",
        "autonomic_dysregulation": "stress_load",
        "mci": "mci_risk",
        "cognitive_risk": "mci_risk",
        "hippocampal_volume": "hippocampal_atrophy",
        "protocol_recommendation": "protocol_ranking",
        "voice": "voice_affect",
        "video": "video_affect",
        "text": "text_sentiment",
        "parkinson": "parkinson_voice",
        "respiratory": "respiratory_screening",
    }
    return aliases.get(value, value)


def resolve_concepts(query: EvidenceQuery) -> dict[str, Any]:
    target = normalize_target_name(query.target_name)
    spec = TARGET_CONCEPTS.get(target, {})
    feature_terms = [f.name for f in query.feature_summary if f.name]
    concepts = _dedupe([
        *spec.get("concepts", []),
        *query.phenotype_tags,
        *query.diagnosis_filters,
        *query.intervention_filters,
        *feature_terms,
    ])
    modalities = _dedupe([*spec.get("modalities", []), *query.modality_filters])
    diagnoses = _dedupe([*spec.get("diagnoses", []), *query.diagnosis_filters])
    return {
        "target": target,
        "claim": spec.get("claim") or f"Decision-support evidence for {query.target_name.replace('_', ' ')}.",
        "concepts": concepts,
        "modalities": modalities,
        "diagnoses": diagnoses,
        "interventions": _dedupe(query.intervention_filters or spec.get("modalities", [])),
    }


def build_default_query(patient_id: str, target_name: str, context_type: ContextType = "biomarker") -> EvidenceQuery:
    target = normalize_target_name(target_name)
    spec = TARGET_CONCEPTS.get(target, {})
    return EvidenceQuery(
        patient_id=patient_id,
        context_type=context_type,
        target_name=target,
        modality_filters=spec.get("modalities", [])[:2],
        diagnosis_filters=spec.get("diagnoses", [])[:2],
        phenotype_tags=spec.get("concepts", [])[:4],
        max_results=8,
    )


def query_evidence(query: EvidenceQuery, db: Optional[Session] = None) -> EvidenceResult:
    query.target_name = normalize_target_name(query.target_name)
    concepts = resolve_concepts(query)
    candidates, corpus = _retrieve_candidates(query, concepts, db)
    ranked = rank_papers(candidates, query, concepts)
    supporting = ranked[: query.max_results]
    conflicting = _build_counter_evidence(ranked[query.max_results:], query, concepts) if query.include_counter_evidence else []
    drivers = build_drivers(query)
    applicability = score_applicability(query, concepts)
    strength = evidence_strength(supporting)
    confidence = min(0.96, round((sum(p.score_breakdown.total for p in supporting[:5]) / max(len(supporting[:5]), 1)) * 0.78 + applicability.score * 0.22, 2)) if supporting else 0.35
    finding_id = stable_finding_id(query)
    summary = summarize_literature(supporting, conflicting, concepts)
    caution = build_caution(strength, conflicting, query)
    citations = build_export_citations(finding_id, supporting)
    provenance = EvidenceProvenance(
        source_paper_ids=[p.paper_id for p in supporting + conflicting],
        retrieval_reasons=[p.retrieval_reason for p in supporting],
        matched_concepts=_dedupe([c for p in supporting for c in p.matched_concepts]),
        ranking_metadata={
            "weights": RANK_WEIGHTS,
            "context_type": query.context_type,
            "target_name": query.target_name,
            "max_results": query.max_results,
        },
        generated_at=datetime.now(timezone.utc).isoformat(),
        corpus=corpus,
    )
    return EvidenceResult(
        finding_id=finding_id,
        claim=concepts["claim"],
        claim_type=query.context_type,
        target_name=query.target_name,
        patient_context_summary=patient_context_summary(query),
        confidence_score=confidence,
        evidence_strength=strength,
        top_drivers=drivers,
        supporting_papers=supporting,
        conflicting_papers=conflicting,
        applicability=applicability,
        literature_summary=summary,
        recommended_caution=caution,
        provenance=provenance,
        export_citations=citations,
    )


RANK_WEIGHTS = {
    "semantic_relevance": 0.22,
    "concept_overlap": 0.18,
    "modality_match": 0.12,
    "diagnosis_match": 0.12,
    "intervention_match": 0.08,
    "evidence_quality": 0.13,
    "recency": 0.07,
    "patient_applicability": 0.08,
}


def rank_papers(candidates: list[_CandidatePaper], query: EvidenceQuery, concepts: dict[str, Any]) -> list[EvidencePaper]:
    ranked: list[EvidencePaper] = []
    for paper in candidates:
        text = f"{paper.title} {paper.abstract}".lower()
        matched = [c for c in concepts["concepts"] if c and c.lower() in text]
        concept_overlap = min(1.0, len(matched) / max(len(concepts["concepts"][:8]), 1))
        modality_match = _term_match_score(text, concepts["modalities"])
        diagnosis_match = _term_match_score(text, concepts["diagnoses"])
        intervention_match = _term_match_score(text, concepts["interventions"])
        semantic_relevance = max(concept_overlap, _token_overlap_score(text, " ".join(concepts["concepts"])))
        quality_bucket = classify_study_type(paper.pub_types, paper.title, paper.abstract)
        quality_score = study_quality_score(quality_bucket)
        recency = recency_score(paper.year)
        patient_app = score_applicability(query, concepts).score
        total = (
            semantic_relevance * RANK_WEIGHTS["semantic_relevance"]
            + concept_overlap * RANK_WEIGHTS["concept_overlap"]
            + modality_match * RANK_WEIGHTS["modality_match"]
            + diagnosis_match * RANK_WEIGHTS["diagnosis_match"]
            + intervention_match * RANK_WEIGHTS["intervention_match"]
            + quality_score * RANK_WEIGHTS["evidence_quality"]
            + recency * RANK_WEIGHTS["recency"]
            + patient_app * RANK_WEIGHTS["patient_applicability"]
        )
        if query.include_review_only and quality_bucket not in {"meta-analysis", "systematic review", "review"}:
            continue
        if query.include_recent_only and paper.year and datetime.now(timezone.utc).year - paper.year > 5:
            continue
        breakdown = EvidenceScoreBreakdown(
            semantic_relevance=round(semantic_relevance, 3),
            concept_overlap=round(concept_overlap, 3),
            modality_match=round(modality_match, 3),
            diagnosis_match=round(diagnosis_match, 3),
            intervention_match=round(intervention_match, 3),
            evidence_quality=round(quality_score, 3),
            recency=round(recency, 3),
            patient_applicability=round(patient_app, 3),
            total=round(total, 3),
        )
        ranked.append(EvidencePaper(
            paper_id=paper.paper_id,
            pmid=paper.pmid,
            doi=paper.doi,
            title=paper.title or "Untitled paper",
            year=paper.year,
            journal=paper.journal,
            authors=paper.authors,
            study_type=quality_bucket,
            abstract_snippet=_snippet(paper.abstract, concepts["concepts"]),
            relevance_note=_relevance_note(matched, concepts, query),
            evidence_quality=evidence_quality_label(quality_bucket),
            citation_count=paper.cited_by_count,
            url=paper.url,
            matched_concepts=matched[:8],
            score_breakdown=breakdown,
            retrieval_reason=f"Matched {len(matched)} concepts for {query.target_name}; source={paper.source}",
        ))
    ranked.sort(key=lambda p: (p.score_breakdown.total, p.citation_count or 0, p.year or 0), reverse=True)
    return ranked


def classify_study_type(pub_types: list[str] | None, title: str = "", abstract: str = "") -> str:
    text = " ".join(pub_types or []) + " " + title + " " + abstract
    lower = text.lower()
    if "meta-analysis" in lower or "meta analysis" in lower:
        return "meta-analysis"
    if "systematic review" in lower:
        return "systematic review"
    if "randomized" in lower or "randomised" in lower or "controlled trial" in lower or "rct" in lower:
        return "randomized trial"
    if "cohort" in lower or "longitudinal" in lower:
        return "cohort / longitudinal"
    if "case-control" in lower or "case control" in lower:
        return "case-control"
    if "cross-sectional" in lower or "cross sectional" in lower:
        return "cross-sectional"
    if "case series" in lower or "case reports" in lower or "case report" in lower:
        return "case series"
    if "review" in lower:
        return "review"
    return "mechanistic / preclinical"


def study_quality_score(study_type: str) -> float:
    return {
        "meta-analysis": 1.0,
        "systematic review": 0.95,
        "randomized trial": 0.82,
        "cohort / longitudinal": 0.7,
        "case-control": 0.56,
        "cross-sectional": 0.48,
        "review": 0.45,
        "case series": 0.3,
        "mechanistic / preclinical": 0.22,
    }.get(study_type, 0.22)


def evidence_quality_label(study_type: str) -> str:
    score = study_quality_score(study_type)
    if score >= 0.8:
        return "high"
    if score >= 0.5:
        return "moderate"
    return "low"


def evidence_strength(papers: list[EvidencePaper]) -> EvidenceLevel:
    if not papers:
        return "low"
    strong = sum(1 for p in papers if p.evidence_quality == "high")
    moderate = sum(1 for p in papers if p.evidence_quality == "moderate")
    if len(papers) >= 6 and (strong >= 2 or (strong >= 1 and moderate >= 3)):
        return "high"
    if len(papers) >= 3 and (strong >= 1 or moderate >= 2):
        return "moderate"
    return "low"


def score_applicability(query: EvidenceQuery, concepts: Optional[dict[str, Any]] = None) -> EvidenceApplicability:
    concepts = concepts or resolve_concepts(query)
    dims: list[EvidenceApplicabilityDimension] = []
    dims.append(_dimension("Age fit", "strongly_matched" if query.age_band else "partially_matched", query.age_band or "Age band not supplied; using adult/general cohorts."))
    dims.append(_dimension("Diagnosis fit", _match_from_overlap(query.diagnosis_filters, concepts["diagnoses"]), ", ".join(query.diagnosis_filters or concepts["diagnoses"][:2]) or "No diagnosis filter."))
    dims.append(_dimension("Modality fit", _match_from_overlap(query.modality_filters, concepts["modalities"]), ", ".join(query.modality_filters or concepts["modalities"][:2]) or "No modality filter."))
    dims.append(_dimension("Intervention fit", _match_from_overlap(query.intervention_filters, concepts["interventions"]), ", ".join(query.intervention_filters or concepts["interventions"][:2]) or "No intervention filter."))
    comorbidity_terms = [t for t in query.phenotype_tags if "comorbid" in t.lower() or "sleep" in t.lower() or "hrv" in t.lower()]
    dims.append(_dimension("Comorbidity fit", "strongly_matched" if comorbidity_terms else "partially_matched", ", ".join(comorbidity_terms) or "No comorbidity-specific tags supplied."))
    numeric = {"strongly_matched": 1.0, "partially_matched": 0.62, "weakly_matched": 0.28}
    score = round(sum(numeric[d.match] for d in dims) / len(dims), 2)
    overall: ApplicabilityMatch = "strongly_matched" if score >= 0.78 else "partially_matched" if score >= 0.45 else "weakly_matched"
    return EvidenceApplicability(overall_match=overall, score=score, dimensions=dims)


def build_drivers(query: EvidenceQuery) -> list[EvidenceDriver]:
    if query.feature_summary:
        return [
            EvidenceDriver(
                source_modality=f.modality or "clinical",
                label=f.name,
                value=str(f.value if f.value is not None else "observed"),
                direction=f.direction or "contributes",
                contribution_text=f"{f.name} {f.direction or 'contributes to'} this evidence query.",
                weight=float(f.contribution or 0.2),
            )
            for f in query.feature_summary[:6]
        ]
    defaults = {
        "depression_risk": [
            ("Assessment", "PHQ-9", "increased from 8 to 14", "worsening"),
            ("Wearables", "Sleep duration", "declined 1.7h", "risk-up"),
            ("qEEG", "Frontal alpha asymmetry", "elevated", "risk-up"),
        ],
        "anxiety_risk": [
            ("Assessment", "GAD-7", "above threshold", "risk-up"),
            ("Wearables", "HRV", "below rolling baseline", "risk-up"),
            ("Voice", "Pause ratio", "elevated", "risk-up"),
        ],
        "stress_load": [
            ("Wearables", "HRV", "fell 22% below baseline", "risk-up"),
            ("Wearables", "Resting HR", "above rolling baseline", "risk-up"),
            ("Text", "Stress language", "increased", "risk-up"),
        ],
        "frontal_alpha_asymmetry": [
            ("qEEG", "FAA", "elevated", "biomarker-positive"),
            ("Assessment", "Mood scales", "affective symptoms present", "contextual"),
        ],
        "hippocampal_atrophy": [
            ("MRI", "Hippocampal volume", "below age norm", "risk-up"),
            ("Assessment", "Cognitive screen", "monitoring indicated", "contextual"),
        ],
    }
    rows = defaults.get(query.target_name, [("Multimodal", query.target_name.replace("_", " "), "active finding", "contextual")])
    return [
        EvidenceDriver(source_modality=m, label=l, value=v, direction=d, contribution_text=f"{l} is a top patient-specific driver for this claim.", weight=round(0.35 - i * 0.06, 2))
        for i, (m, l, v, d) in enumerate(rows)
    ]


def patient_context_summary(query: EvidenceQuery) -> str:
    tags = ", ".join(_dedupe([*query.diagnosis_filters, *query.phenotype_tags])[:5])
    mods = ", ".join(query.modality_filters[:4])
    return f"Patient-linked decision-support query for {query.target_name.replace('_', ' ')}" + (f" using {mods}" if mods else "") + (f"; phenotype tags: {tags}" if tags else ".")


def summarize_literature(supporting: list[EvidencePaper], conflicting: list[EvidencePaper], concepts: dict[str, Any]) -> str:
    if not supporting:
        return "No strong in-corpus literature match was available; review the claim manually before using it in reports."
    studies = Counter(p.study_type for p in supporting)
    years = [p.year for p in supporting if p.year]
    year_text = f"{min(years)}-{max(years)}" if years else "undated"
    top_types = ", ".join(f"{count} {stype}" for stype, count in studies.most_common(3))
    mixed = " Counter-evidence is present and should be reviewed." if conflicting else ""
    return f"Retrieved evidence ({year_text}) is concentrated in {top_types}. Top papers match {', '.join(concepts['concepts'][:4])}.{mixed}"


def build_caution(strength: EvidenceLevel, conflicting: list[EvidencePaper], query: EvidenceQuery) -> str:
    base = "Decision support only; this evidence should not be interpreted as an autonomous diagnosis or treatment directive."
    if strength == "low":
        return base + " Evidence is limited or indirect, so clinician review is required before report inclusion."
    if conflicting:
        return base + " Evidence is mixed; inspect counter-evidence and applicability before acting."
    return base + " Confidence and evidence strength are separate; apply local clinical review and patient preference."


def build_export_citations(finding_id: str, papers: list[EvidencePaper]) -> list[EvidenceCitationPayload]:
    payloads = []
    for idx, paper in enumerate(papers[:8], start=1):
        first_author = paper.authors[0] if paper.authors else "Unknown"
        inline = f"({first_author}, {paper.year or 'n.d.'})"
        ref = f"{first_author}. {paper.title}. {paper.journal or 'Journal unavailable'}; {paper.year or 'n.d.'}."
        payloads.append(EvidenceCitationPayload(
            finding_id=finding_id,
            paper_id=paper.paper_id,
            pmid=paper.pmid,
            doi=paper.doi,
            title=paper.title,
            inline_citation=inline,
            reference=ref,
            citation_type="supports" if idx <= 5 else "informs",
            evidence_quality=paper.evidence_quality,
        ))
    return payloads


def build_patient_overview(patient_id: str, db: Session) -> PatientEvidenceOverview:
    targets: list[tuple[str, ContextType]] = [
        ("depression_risk", "prediction"),
        ("anxiety_risk", "risk_score"),
        ("stress_load", "risk_score"),
        ("frontal_alpha_asymmetry", "biomarker"),
        ("hippocampal_atrophy", "biomarker"),
        ("protocol_ranking", "recommendation"),
        ("voice_affect", "multimodal_summary"),
        ("text_sentiment", "multimodal_summary"),
    ]
    results = [query_evidence(build_default_query(patient_id, target, ctx), db) for target, ctx in targets]
    summaries = [summary_from_result(r, _is_saved(db, patient_id, r.finding_id)) for r in results]
    by_modality: dict[str, list[EvidenceSummary]] = {}
    for item in summaries:
        key = "protocol" if item.context_type == "recommendation" else "score" if item.context_type in {"prediction", "risk_score"} else "biomarker"
        by_modality.setdefault(key, []).append(item)
    saved = list_saved_citations(patient_id, db)
    return PatientEvidenceOverview(
        patient_id=patient_id,
        highlights=summaries[:5],
        by_modality=by_modality,
        by_score=[s for s in summaries if s.context_type in {"prediction", "risk_score"}],
        by_protocol=[s for s in summaries if s.context_type == "recommendation"],
        contradictory_findings=[s for s, r in zip(summaries, results) if r.conflicting_papers],
        saved_citations=saved,
        compare_with_literature_phenotype={
            "summary": "Patient phenotype overlaps most strongly with mood/autonomic and qEEG/MRI biomarker cohorts.",
            "matched_tags": ["depression", "HRV", "sleep", "frontal alpha asymmetry", "hippocampal volume"],
        },
        evidence_used_in_report=[c for r in results[:3] for c in r.export_citations[:2]],
    )


def summary_from_result(result: EvidenceResult, saved: bool = False) -> EvidenceSummary:
    return EvidenceSummary(
        finding_id=result.finding_id,
        label=result.target_name.replace("_", " ").title(),
        claim=result.claim,
        context_type=result.claim_type,
        target_name=result.target_name,
        evidence_level=result.evidence_strength,
        confidence_score=result.confidence_score,
        paper_count=len(result.supporting_papers),
        top_papers=result.supporting_papers[:3],
        conflicting_count=len(result.conflicting_papers),
        saved=saved,
    )


def save_citation(body: SaveCitationRequest, actor_id: str, db: Session) -> dict[str, Any]:
    # Refuse to persist citations sourced from the demo seed (paper_id begins
    # with "demo-" or pmid in the synthetic 90000xxx range). These are useful
    # for offline previews but must not enter the audit trail as real,
    # citable evidence — clinicians may rely on the saved list as ground
    # truth for downstream reports.
    pid = (body.paper_id or "").strip()
    pmid = (body.pmid or "").strip()
    is_demo_paper = pid.startswith("demo-") or (pmid and pmid.startswith("90000") and len(pmid) <= 6)
    if is_demo_paper:
        raise ValueError(
            "Cannot save demo evidence as a real citation. "
            "Demo papers (paper_id 'demo-*' or pmid 90000xxx) are seed data only."
        )
    existing = db.scalar(select(EvidenceSavedCitation).where(
        EvidenceSavedCitation.patient_id == body.patient_id,
        EvidenceSavedCitation.finding_id == body.finding_id,
        EvidenceSavedCitation.paper_id == body.paper_id,
        EvidenceSavedCitation.actor_id == actor_id,
    ))
    if existing is None:
        existing = EvidenceSavedCitation(
            id=str(uuid.uuid4()),
            patient_id=body.patient_id,
            actor_id=actor_id,
            finding_id=body.finding_id,
            finding_label=body.finding_label,
            claim=body.claim,
            paper_id=body.paper_id,
            paper_title=body.paper_title,
            pmid=body.pmid,
            doi=body.doi,
            context_kind=body.context_kind,
            analysis_id=body.analysis_id,
            report_id=body.report_id,
            citation_payload_json=json.dumps(body.citation_payload),
        )
        db.add(existing)
        db.commit()
        db.refresh(existing)
    return saved_record_to_dict(existing)


def list_saved_citations(
    patient_id: str,
    db: Session,
    *,
    context_kind: str | None = None,
    analysis_id: str | None = None,
    report_id: str | None = None,
) -> list[dict[str, Any]]:
    stmt = (
        select(EvidenceSavedCitation)
        .where(EvidenceSavedCitation.patient_id == patient_id)
        .order_by(EvidenceSavedCitation.created_at.desc())
    )
    if context_kind:
        stmt = stmt.where(EvidenceSavedCitation.context_kind == context_kind)
    if analysis_id:
        stmt = stmt.where(EvidenceSavedCitation.analysis_id == analysis_id)
    if report_id:
        stmt = stmt.where(EvidenceSavedCitation.report_id == report_id)
    rows = db.scalars(stmt).all()
    return [saved_record_to_dict(row) for row in rows]


def saved_record_to_dict(row: EvidenceSavedCitation) -> dict[str, Any]:
    try:
        payload = json.loads(row.citation_payload_json or "{}")
    except json.JSONDecodeError:
        payload = {}
    return {
        "id": row.id,
        "patient_id": row.patient_id,
        "finding_id": row.finding_id,
        "finding_label": row.finding_label,
        "claim": row.claim,
        "paper_id": row.paper_id,
        "paper_title": row.paper_title,
        "pmid": row.pmid,
        "doi": row.doi,
        "context_kind": row.context_kind,
        "analysis_id": row.analysis_id,
        "report_id": row.report_id,
        "citation_payload": payload,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


def build_report_payload(body: ReportPayloadRequest, db: Session) -> dict[str, Any]:
    targets = body.finding_ids or ["depression_risk", "frontal_alpha_asymmetry", "hippocampal_atrophy", "protocol_ranking"]
    citations: list[EvidenceCitationPayload] = []
    findings: list[EvidenceSummary] = []
    for target in targets:
        result = query_evidence(build_default_query(body.patient_id, target), db)
        findings.append(summary_from_result(result))
        citations.extend(result.export_citations[: body.max_results_per_finding])
    saved = list_saved_citations(
        body.patient_id,
        db,
        context_kind=body.context_kind,
        analysis_id=body.analysis_id,
        report_id=body.report_id,
    ) if body.include_saved else []
    return {
        "patient_id": body.patient_id,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "guardrail": "Decision support only; not an autonomous diagnosis.",
        "findings": [f.model_dump() for f in findings],
        "citations": [c.model_dump() for c in citations],
        "saved_citations": saved,
        "report_context": {
            "context_kind": body.context_kind,
            "analysis_id": body.analysis_id,
            "report_id": body.report_id,
        },
    }


def get_paper_detail(paper_id: str, db: Session) -> Optional[EvidencePaper]:
    paper = db.get(DsPaper, paper_id)
    if paper is not None:
        candidate = _ds_paper_to_candidate(paper)
        ranked = rank_papers([candidate], build_default_query("detail", "depression_risk"), resolve_concepts(build_default_query("detail", "depression_risk")))
        return ranked[0] if ranked else None
    lib = db.get(LiteraturePaper, paper_id)
    if lib is not None:
        candidate = _library_paper_to_candidate(lib)
        ranked = rank_papers([candidate], build_default_query("detail", "depression_risk"), resolve_concepts(build_default_query("detail", "depression_risk")))
        return ranked[0] if ranked else None
    return None


def _retrieve_candidates(query: EvidenceQuery, concepts: dict[str, Any], db: Optional[Session]) -> tuple[list[_CandidatePaper], str]:
    candidates: list[_CandidatePaper] = []
    if db is not None:
        candidates.extend(_retrieve_ds_papers(db, query, concepts))
        if candidates:
            return candidates, "ds_papers"
        candidates.extend(_retrieve_library_papers(db, query, concepts))
        if candidates:
            return candidates, "literature_papers"
    candidates.extend(_retrieve_evidence_sqlite(query, concepts))
    if candidates:
        return candidates, "evidence-pipeline"
    # Demo fallback — log loudly so ops/clinicians can see when production
    # corpus is unreachable. This must not be silent: a clinician seeing
    # "Demo Evidence Team" papers in a real session is a defensibility risk.
    _logger.warning(
        "evidence intelligence: falling back to demo seed (no DS/Literature/sqlite hits) "
        "target=%s concepts=%s diagnoses=%s",
        concepts.get("target"),
        concepts.get("concepts"),
        concepts.get("diagnoses"),
    )
    return _demo_candidates(concepts), "deterministic-demo-fallback"


def _retrieve_ds_papers(db: Session, query: EvidenceQuery, concepts: dict[str, Any]) -> list[_CandidatePaper]:
    terms = _dedupe(concepts["concepts"] + concepts["diagnoses"] + concepts["modalities"])[:14]
    if not terms:
        return []
    filters = []
    for term in terms:
        pat = f"%{term}%"
        filters.extend([DsPaper.title.ilike(pat), DsPaper.abstract.ilike(pat)])
    rows = db.scalars(select(DsPaper).where(or_(*filters), DsPaper.retracted.is_(False)).limit(max(query.max_results * 8, 40))).all()
    return [_ds_paper_to_candidate(row) for row in rows]


def _retrieve_library_papers(db: Session, query: EvidenceQuery, concepts: dict[str, Any]) -> list[_CandidatePaper]:
    terms = _dedupe(concepts["concepts"] + concepts["diagnoses"] + concepts["modalities"])[:10]
    if not terms:
        return []
    filters = []
    for term in terms:
        pat = f"%{term}%"
        filters.extend([
            LiteraturePaper.title.ilike(pat),
            LiteraturePaper.abstract.ilike(pat),
            LiteraturePaper.condition.ilike(pat),
            LiteraturePaper.modality.ilike(pat),
        ])
    rows = db.scalars(select(LiteraturePaper).where(or_(*filters)).limit(max(query.max_results * 6, 30))).all()
    return [_library_paper_to_candidate(row) for row in rows]


def _retrieve_evidence_sqlite(query: EvidenceQuery, concepts: dict[str, Any]) -> list[_CandidatePaper]:
    path = _default_evidence_db_path()
    if not path or not os.path.exists(path):
        return []
    terms = _dedupe(concepts["concepts"] + concepts["diagnoses"] + concepts["modalities"])[:8]
    if not terms:
        return []
    conn: sqlite3.Connection | None = None
    try:
        conn = sqlite3.connect(path, timeout=5)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA query_only = 1")
        clauses = []
        params: list[str] = []
        for term in terms:
            clauses.append("(LOWER(p.title) LIKE ? OR LOWER(p.abstract) LIKE ?)")
            params.extend([f"%{term.lower()}%", f"%{term.lower()}%"])
        rows = conn.execute(
            "SELECT p.id, p.pmid, p.doi, p.title, p.abstract, p.year, p.journal, "
            "p.authors_json, p.pub_types_json, p.cited_by_count, p.oa_url "
            "FROM papers p WHERE " + " OR ".join(clauses) + " LIMIT ?",
            (*params, max(query.max_results * 10, 50)),
        ).fetchall()
        return [_sqlite_row_to_candidate(row) for row in rows]
    except Exception as exc:  # pragma: no cover - defensive corpus fallback
        _logger.warning("evidence intelligence sqlite retrieval failed: %s", exc)
        return []
    finally:
        if conn is not None:
            conn.close()


def _default_evidence_db_path() -> Optional[str]:
    override = os.environ.get("EVIDENCE_DB_PATH")
    if override:
        return override
    here = Path(__file__).resolve()
    guess = here.parents[4] / "services" / "evidence-pipeline" / "evidence.db"
    if guess.exists():
        return str(guess)
    fallback = "/app/evidence.db"
    return fallback if os.path.exists(fallback) else None


def _ds_paper_to_candidate(row: DsPaper) -> _CandidatePaper:
    return _CandidatePaper(
        paper_id=row.id,
        pmid=row.pmid,
        doi=row.doi,
        title=row.title or "",
        abstract=row.abstract or "",
        year=row.year,
        journal=row.journal,
        authors=_parse_json_list(row.authors_json),
        pub_types=_parse_json_list(row.pub_types_json) or ([row.evidence_type] if row.evidence_type else []),
        cited_by_count=row.cited_by_count,
        url=row.oa_url,
        source="ds_papers",
    )


def _library_paper_to_candidate(row: LiteraturePaper) -> _CandidatePaper:
    return _CandidatePaper(
        paper_id=row.id,
        pmid=row.pubmed_id,
        doi=row.doi,
        title=row.title or "",
        abstract=row.abstract or "",
        year=row.year,
        journal=row.journal,
        authors=[a.strip() for a in (row.authors or "").split(",") if a.strip()],
        pub_types=[row.study_type] if row.study_type else [],
        cited_by_count=0,
        url=row.url,
        source="literature_papers",
    )


def _sqlite_row_to_candidate(row: sqlite3.Row) -> _CandidatePaper:
    return _CandidatePaper(
        paper_id=str(row["id"]),
        pmid=row["pmid"],
        doi=row["doi"],
        title=row["title"] or "",
        abstract=row["abstract"] or "",
        year=row["year"],
        journal=row["journal"],
        authors=_parse_json_list(row["authors_json"]),
        pub_types=_parse_json_list(row["pub_types_json"]),
        cited_by_count=row["cited_by_count"],
        url=row["oa_url"],
        source="evidence-pipeline",
    )


def _demo_candidates(concepts: dict[str, Any]) -> list[_CandidatePaper]:
    target = concepts.get("target", "evidence")
    base_terms = concepts.get("concepts", [])[:4] or [target]
    rows = [
        ("Systematic review of {topic} biomarkers in clinical decision support", ["Systematic Review"], 2024, 220),
        ("Longitudinal cohort linking {topic} signals with symptom trajectories", ["Cohort Study"], 2022, 146),
        ("Randomized controlled trial context for {topic} intervention response", ["Randomized Controlled Trial"], 2021, 188),
        ("Review of multimodal {topic} phenotyping and patient applicability", ["Review"], 2020, 92),
        ("Cross-sectional study of {topic} and digital phenotype markers", ["Cross-Sectional Study"], 2019, 64),
        ("Mechanistic evidence for {topic} neural circuitry", ["Mechanistic"], 2018, 41),
    ]
    out = []
    topic = target.replace("_", " ")
    abstract = " ".join(base_terms) + " are discussed with uncertainty, applicability, and decision-support limitations."
    for i, (title, pub_types, year, cites) in enumerate(rows, start=1):
        out.append(_CandidatePaper(
            paper_id=f"demo-{target}-{i}",
            pmid=f"90000{i}",
            doi=None,
            title=title.format(topic=topic),
            abstract=abstract,
            year=year,
            journal="DeepSynaps Demo Evidence",
            authors=["DeepSynaps Evidence Team"],
            pub_types=pub_types,
            cited_by_count=cites,
            url=None,
            source="demo",
        ))
    return out


def _build_counter_evidence(candidates: list[EvidencePaper], query: EvidenceQuery, concepts: dict[str, Any]) -> list[EvidencePaper]:
    counter = []
    for paper in candidates:
        text = (paper.title + " " + paper.abstract_snippet).lower()
        if any(term in text for term in ["mixed", "inconsistent", "null", "limited", "weak"]):
            paper.relevance_note = "Potential counter-evidence or weaker evidence; clinician review recommended."
            counter.append(paper)
    if counter:
        return counter[:3]
    if candidates and query.include_counter_evidence:
        weak = candidates[-1]
        weak.relevance_note = f"Lower-ranked evidence suggests applicability may be weaker outside {', '.join(concepts['diagnoses'][:2]) or 'matched cohorts'}."
        return [weak]
    return []


def _dimension(label: str, match: ApplicabilityMatch, rationale: str) -> EvidenceApplicabilityDimension:
    return EvidenceApplicabilityDimension(label=label, match=match, rationale=rationale)


def _match_from_overlap(inputs: list[str], targets: list[str]) -> ApplicabilityMatch:
    if not inputs:
        return "partially_matched"
    in_set = {i.lower() for i in inputs}
    target_set = {t.lower() for t in targets}
    if in_set & target_set:
        return "strongly_matched"
    return "weakly_matched"


def _term_match_score(text: str, terms: list[str]) -> float:
    terms = [t.lower() for t in terms if t]
    if not terms:
        return 0.5
    return min(1.0, sum(1 for t in terms if t in text) / max(len(terms[:5]), 1))


def _token_overlap_score(text: str, query_text: str) -> float:
    tokens = {t for t in _tokenize(query_text) if len(t) > 3}
    if not tokens:
        return 0.0
    text_tokens = set(_tokenize(text))
    return min(1.0, len(tokens & text_tokens) / len(tokens))


def _tokenize(text: str) -> list[str]:
    return "".join(ch.lower() if ch.isalnum() else " " for ch in text).split()


def recency_score(year: Optional[int]) -> float:
    if not year:
        return 0.35
    age = max(0, datetime.now(timezone.utc).year - int(year))
    return round(max(0.15, 1.0 - min(age, 20) / 24), 3)


def _snippet(abstract: str, concepts: list[str]) -> str:
    text = " ".join((abstract or "").split())
    if len(text) <= 240:
        return text
    lower = text.lower()
    positions = [lower.find(c.lower()) for c in concepts if c and lower.find(c.lower()) >= 0]
    start = max(0, min(positions) - 80) if positions else 0
    return ("..." if start else "") + text[start:start + 240] + "..."


def _relevance_note(matched: list[str], concepts: dict[str, Any], query: EvidenceQuery) -> str:
    if matched:
        return f"Matches patient-linked concepts: {', '.join(matched[:4])}."
    return f"Related to {query.target_name.replace('_', ' ')} via broader {', '.join(concepts['modalities'][:2])} literature."


def _parse_json_list(raw: Any) -> list[str]:
    if not raw:
        return []
    if isinstance(raw, list):
        return [str(v) for v in raw]
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return [str(v) for v in parsed]
    except (TypeError, json.JSONDecodeError):
        pass
    return [v.strip() for v in str(raw).split(",") if v.strip()]


def _dedupe(values: list[str]) -> list[str]:
    seen = set()
    out = []
    for value in values:
        v = str(value or "").strip()
        key = v.lower()
        if not v or key in seen:
            continue
        seen.add(key)
        out.append(v)
    return out


def _is_saved(db: Session, patient_id: str, finding_id: str) -> bool:
    return db.scalar(select(EvidenceSavedCitation.id).where(
        EvidenceSavedCitation.patient_id == patient_id,
        EvidenceSavedCitation.finding_id == finding_id,
    ).limit(1)) is not None
