from __future__ import annotations

import json
import os
import tempfile
import uuid
from pathlib import Path

from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import DsPaper
from app.services.evidence_intelligence import (
    EvidenceQuery,
    SaveCitationRequest,
    build_default_query,
    build_report_payload,
    classify_study_type,
    list_saved_citations,
    query_evidence,
    rank_papers,
    resolve_concepts,
    save_citation,
    score_applicability,
)


def _seed_ds_paper(
    *,
    title: str,
    abstract: str,
    pub_types: list[str],
    year: int = 2024,
    citations: int = 100,
) -> str:
    session = SessionLocal()
    try:
        paper = DsPaper(
            id=str(uuid.uuid4()),
            pmid=str(80000000 + citations),
            title=title,
            abstract=abstract,
            year=year,
            journal="Evidence Intelligence Tests",
            authors_json=json.dumps(["Tester A", "Reviewer B"]),
            pub_types_json=json.dumps(pub_types),
            cited_by_count=citations,
            evidence_type=pub_types[0] if pub_types else None,
            evidence_level="HIGH",
            grade="A",
            retracted=False,
        )
        session.add(paper)
        session.commit()
        return paper.id
    finally:
        session.close()


def test_study_type_tagging_is_deterministic():
    assert classify_study_type(["Meta-Analysis"]) == "meta-analysis"
    assert classify_study_type(["Systematic Review"]) == "systematic review"
    assert classify_study_type(["Randomized Controlled Trial"]) == "randomized trial"
    assert classify_study_type(["Cohort Study"]) == "cohort / longitudinal"
    assert classify_study_type(["Case Reports"]) == "case series"


def test_applicability_scoring_reflects_patient_context():
    query = EvidenceQuery(
        patient_id="pat-1",
        context_type="prediction",
        target_name="depression_risk",
        diagnosis_filters=["depression"],
        modality_filters=["qeeg", "wearables"],
        intervention_filters=["tdcs"],
        age_band="adult",
        phenotype_tags=["sleep decline", "HRV low"],
    )
    applicability = score_applicability(query)
    assert applicability.score >= 0.7
    assert applicability.overall_match in {"strongly_matched", "partially_matched"}
    assert {d.label for d in applicability.dimensions} >= {"Age fit", "Diagnosis fit", "Modality fit"}


def test_ranking_prioritizes_relevant_high_quality_paper():
    query = build_default_query("pat-1", "depression_risk", "prediction")
    concepts = resolve_concepts(query)
    from app.services.evidence_intelligence import _CandidatePaper

    candidates = [
        _CandidatePaper(
            paper_id="weak",
            pmid="1",
            doi=None,
            title="Unrelated mechanistic note",
            abstract="Cell model of neural firing.",
            year=2018,
            journal="Lab",
            authors=[],
            pub_types=["Mechanistic"],
            cited_by_count=2,
            url=None,
            source="test",
        ),
        _CandidatePaper(
            paper_id="strong",
            pmid="2",
            doi=None,
            title="Systematic review of depression PHQ-9 sleep HRV EEG markers",
            abstract="Depression and major depressive disorder cohorts include PHQ-9, sleep, HRV, EEG and voice biomarkers.",
            year=2024,
            journal="Clinical",
            authors=["A"],
            pub_types=["Systematic Review"],
            cited_by_count=240,
            url=None,
            source="test",
        ),
    ]
    ranked = rank_papers(candidates, query, concepts)
    assert ranked[0].paper_id == "strong"
    assert ranked[0].score_breakdown.total > ranked[1].score_breakdown.total


def test_query_response_shape_from_seeded_corpus():
    _seed_ds_paper(
        title="Systematic review of depression risk PHQ-9 sleep HRV EEG biomarkers",
        abstract="Major depressive disorder evidence links PHQ-9, QIDS, sleep, HRV, EEG and voice features to symptom trajectories.",
        pub_types=["Systematic Review"],
        citations=222,
    )
    session = SessionLocal()
    try:
        result = query_evidence(build_default_query("pat-1", "depression_risk", "prediction"), session)
    finally:
        session.close()
    assert result.claim_type == "prediction"
    assert result.supporting_papers
    assert result.export_citations
    assert result.provenance.source_paper_ids
    assert "Decision support only" in result.recommended_caution


def test_embed_query_text_and_rerank_flags_do_not_break_sqlite_retrieval():
    """Hybrid retrieval opts-in via embed_query_text; SQLite skips ANN without failing."""
    _seed_ds_paper(
        title="Depression PHQ-9 systematic review",
        abstract="Depression and PHQ-9 severity in clinical cohorts.",
        pub_types=["Systematic Review"],
        citations=90,
    )
    session = SessionLocal()
    try:
        q = build_default_query("pat-embed", "depression_risk", "prediction")
        q = q.model_copy(
            update={
                "embed_query_text": "PHQ-9 depression systematic review evidence.",
                "use_cross_encoder_rerank": True,
            }
        )
        result = query_evidence(q, session)
    finally:
        session.close()
    assert result.supporting_papers
    md = result.provenance.ranking_metadata
    assert md.get("ann_retrieval") is True
    assert md.get("cross_encoder_rerank") is False  # optional dep absent in CI


def test_evidence_api_happy_path_save_and_overview(client: TestClient, auth_headers: dict):
    _seed_ds_paper(
        title="Depression risk multimodal cohort PHQ-9 HRV sleep",
        abstract="Depression cohort data link PHQ-9, HRV and sleep decline with clinical symptom severity.",
        pub_types=["Cohort Study"],
        citations=144,
    )
    body = {
        "patient_id": "pat-api",
        "context_type": "prediction",
        "target_name": "depression_risk",
        "diagnosis_filters": ["depression"],
        "modality_filters": ["assessment", "wearables"],
        "max_results": 5,
    }
    resp = client.post("/api/v1/evidence/query", json=body, headers=auth_headers["clinician"])
    assert resp.status_code == 200
    result = resp.json()
    assert result["supporting_papers"]
    paper = result["supporting_papers"][0]
    save_resp = client.post(
        "/api/v1/evidence/save-citation",
        json={
            "patient_id": "pat-api",
            "finding_id": result["finding_id"],
            "finding_label": "Depression risk",
            "claim": result["claim"],
            "paper_id": paper["paper_id"],
            "paper_title": paper["title"],
            "pmid": paper["pmid"],
            "doi": paper["doi"],
            "citation_payload": result["export_citations"][0],
        },
        headers=auth_headers["clinician"],
    )
    assert save_resp.status_code == 201
    saved = client.get("/api/v1/evidence/patient/pat-api/saved-citations", headers=auth_headers["clinician"])
    assert saved.status_code == 200
    assert saved.json()[0]["paper_id"] == paper["paper_id"]
    overview = client.get("/api/v1/evidence/patient/pat-api/overview", headers=auth_headers["clinician"])
    assert overview.status_code == 200
    assert overview.json()["saved_citations"]


def test_report_payload_generation_contains_citations():
    _seed_ds_paper(
        title="Frontal alpha asymmetry depression systematic review",
        abstract="Frontal alpha asymmetry EEG evidence in depression and anxiety cohorts.",
        pub_types=["Systematic Review"],
        citations=111,
    )
    session = SessionLocal()
    try:
        payload = build_report_payload(
            body=__import__("app.services.evidence_intelligence", fromlist=["ReportPayloadRequest"]).ReportPayloadRequest(
                patient_id="pat-report",
                finding_ids=["frontal_alpha_asymmetry"],
                include_saved=False,
            ),
            db=session,
        )
    finally:
        session.close()
    assert payload["guardrail"].startswith("Decision support only")
    assert payload["citations"]


def test_report_payload_includes_adjunct_evidence_context():
    from test_evidence_router import _build_research_bundle

    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
        bundle_root = Path(tmp) / "bundle"
        _build_research_bundle(bundle_root)
        os.environ["DEEPSYNAPS_NEUROMODULATION_RESEARCH_BUNDLE_ROOT"] = str(bundle_root)
        session = SessionLocal()
        try:
            payload = build_report_payload(
                body=__import__("app.services.evidence_intelligence", fromlist=["ReportPayloadRequest"]).ReportPayloadRequest(
                    patient_id="pat-report-bio",
                    finding_ids=["depression_risk"],
                    include_saved=False,
                ),
                db=session,
            )
        finally:
            session.close()
            os.environ.pop("DEEPSYNAPS_NEUROMODULATION_RESEARCH_BUNDLE_ROOT", None)

    assert payload["adjunct_evidence"]["source"] == "neuromodulation_adjunct_evidence"
    assert payload["adjunct_evidence"]["terms"]
    assert "sertraline" in [term.lower() for term in payload["adjunct_evidence"]["terms"]]


def test_saved_citations_can_be_filtered_by_report_context():
    session = SessionLocal()
    try:
        save_citation(
            SaveCitationRequest(
                patient_id="pat-scope",
                finding_id="finding-a",
                finding_label="Finding A",
                claim="Claim A",
                paper_id="paper-a",
                paper_title="Paper A",
                context_kind="qeeg",
                analysis_id="qeeg-1",
                report_id="report-1",
                citation_payload={"inline_citation": "(A, 2024)"},
            ),
            "clinician-1",
            session,
        )
        save_citation(
            SaveCitationRequest(
                patient_id="pat-scope",
                finding_id="finding-b",
                finding_label="Finding B",
                claim="Claim B",
                paper_id="paper-b",
                paper_title="Paper B",
                context_kind="mri",
                analysis_id="mri-1",
                report_id="report-9",
                citation_payload={"inline_citation": "(B, 2024)"},
            ),
            "clinician-1",
            session,
        )
        qeeg_rows = list_saved_citations(
            "pat-scope",
            session,
            context_kind="qeeg",
            analysis_id="qeeg-1",
            report_id="report-1",
        )
        assert len(qeeg_rows) == 1
        assert qeeg_rows[0]["context_kind"] == "qeeg"
        assert qeeg_rows[0]["analysis_id"] == "qeeg-1"
        assert qeeg_rows[0]["report_id"] == "report-1"
    finally:
        session.close()


def test_report_payload_respects_saved_citation_context_filters():
    session = SessionLocal()
    try:
        save_citation(
            SaveCitationRequest(
                patient_id="pat-report-scope",
                finding_id="finding-qeeg",
                finding_label="qEEG finding",
                claim="Claim qEEG",
                paper_id="paper-qeeg",
                paper_title="qEEG Paper",
                context_kind="qeeg",
                analysis_id="qeeg-55",
                report_id="report-qeeg",
                citation_payload={"inline_citation": "(Q, 2024)"},
            ),
            "clinician-2",
            session,
        )
        save_citation(
            SaveCitationRequest(
                patient_id="pat-report-scope",
                finding_id="finding-mri",
                finding_label="MRI finding",
                claim="Claim MRI",
                paper_id="paper-mri",
                paper_title="MRI Paper",
                context_kind="mri",
                analysis_id="mri-44",
                report_id="report-mri",
                citation_payload={"inline_citation": "(M, 2024)"},
            ),
            "clinician-2",
            session,
        )
        payload = build_report_payload(
            body=__import__("app.services.evidence_intelligence", fromlist=["ReportPayloadRequest"]).ReportPayloadRequest(
                patient_id="pat-report-scope",
                finding_ids=["frontal_alpha_asymmetry"],
                include_saved=True,
                context_kind="qeeg",
                analysis_id="qeeg-55",
                report_id="report-qeeg",
            ),
            db=session,
        )
        assert payload["report_context"]["context_kind"] == "qeeg"
        assert len(payload["saved_citations"]) == 1
        assert payload["saved_citations"][0]["paper_id"] == "paper-qeeg"
    finally:
        session.close()
