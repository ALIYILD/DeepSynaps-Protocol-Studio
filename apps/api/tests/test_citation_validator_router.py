"""Integration tests for the Citation Validator router.

Uses the same SQLite-backed test harness as other API tests.
The ``isolated_database`` fixture in conftest.py ensures each test
starts with a clean schema including the ds_* tables from migration 045.
"""
from __future__ import annotations

import json
import uuid

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import DsClaimCitation, DsGroundingAudit, DsPaper, KgHyperedge


# ── Helpers ──────────────────────────────────────────────────────────────────

def _seed_paper(session, *, pmid="12345678", title="Test tDCS Paper", year=2023, grade="B"):
    """Insert a DsPaper row and return its id."""
    paper = DsPaper(
        id=str(uuid.uuid4()),
        pmid=pmid,
        title=title,
        abstract="Bilateral tDCS targeting DLPFC reduces depressive symptoms in treatment-resistant depression.",
        year=year,
        journal="J Clin Psychiatry",
        authors_json=json.dumps(["Smith A", "Jones B"]),
        pub_types_json=json.dumps(["Randomized Controlled Trial"]),
        evidence_type="rct",
        evidence_level="HIGH",
        grade=grade,
    )
    session.add(paper)
    session.commit()
    session.refresh(paper)
    return paper


# ── Health endpoint ──────────────────────────────────────────────────────────

def test_health_empty_corpus(client: TestClient, auth_headers: dict):
    """Health endpoint works on an empty corpus."""
    resp = client.get("/api/v1/citations/health", headers=auth_headers["clinician"])
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_papers"] == 0
    assert data["chain_valid"] is True


def test_health_with_papers(client: TestClient, auth_headers: dict):
    """Health reflects seeded papers."""
    session = SessionLocal()
    try:
        _seed_paper(session)
        _seed_paper(session, pmid="99999999", title="Second paper")
    finally:
        session.close()

    resp = client.get("/api/v1/citations/health", headers=auth_headers["clinician"])
    assert resp.status_code == 200
    assert resp.json()["total_papers"] == 2


def test_health_guest_forbidden(client: TestClient, auth_headers: dict):
    """Guest role cannot access health endpoint."""
    resp = client.get("/api/v1/citations/health", headers=auth_headers["guest"])
    assert resp.status_code == 403


# ── Validate endpoint ────────────────────────────────────────────────────────

def test_validate_empty_corpus(client: TestClient, auth_headers: dict):
    """Validate with no papers returns INSUFFICIENT confidence."""
    body = {
        "claims": [{"claim_text": "tDCS reduces depressive symptoms"}],
    }
    resp = client.post("/api/v1/citations/validate", json=body, headers=auth_headers["clinician"])
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_claims"] == 1
    result = data["results"][0]
    assert result["confidence_label"] == "INSUFFICIENT"
    assert result["passed"] is True  # no block-severity issues, just corpus miss


def test_validate_with_corpus_match(client: TestClient, auth_headers: dict):
    """Validate finds matching papers via text search."""
    session = SessionLocal()
    try:
        _seed_paper(session)
    finally:
        session.close()

    body = {
        "claims": [{"claim_text": "tDCS targeting DLPFC reduces depressive symptoms"}],
        "max_citations_per_claim": 5,
        "min_relevance": 0.0,  # accept any relevance for text search
    }
    resp = client.post("/api/v1/citations/validate", json=body, headers=auth_headers["clinician"])
    assert resp.status_code == 200
    data = resp.json()
    result = data["results"][0]
    assert len(result["citations"]) >= 1
    assert result["citations"][0]["pmid"] == "12345678"


def test_validate_strong_claim_blocked(client: TestClient, auth_headers: dict):
    """Strong efficacy claim without Grade A/B support is blocked."""
    body = {
        "claims": [{"claim_text": "tDCS has been proven to cure depression"}],
    }
    resp = client.post("/api/v1/citations/validate", json=body, headers=auth_headers["clinician"])
    assert resp.status_code == 200
    result = resp.json()["results"][0]
    blocked = [i for i in result["issues"] if i["severity"] == "block"]
    assert len(blocked) >= 1
    assert result["passed"] is False


def test_validate_fabricated_pmid_blocked(client: TestClient, auth_headers: dict):
    """Asserted PMID not in corpus triggers fabrication block."""
    body = {
        "claims": [{
            "claim_text": "test claim",
            "asserted_pmids": ["00000000"],
        }],
    }
    resp = client.post("/api/v1/citations/validate", json=body, headers=auth_headers["clinician"])
    assert resp.status_code == 200
    result = resp.json()["results"][0]
    assert result["pmids_fabricated"] == 1
    fab_issues = [i for i in result["issues"] if i["issue_type"] == "fabricated_pmid"]
    assert len(fab_issues) == 1
    assert result["passed"] is False


def test_validate_multiple_claims(client: TestClient, auth_headers: dict):
    """Batch validation of multiple claims."""
    body = {
        "claims": [
            {"claim_text": "claim one"},
            {"claim_text": "claim two"},
            {"claim_text": "claim three"},
        ],
    }
    resp = client.post("/api/v1/citations/validate", json=body, headers=auth_headers["clinician"])
    assert resp.status_code == 200
    assert resp.json()["total_claims"] == 3


def test_validate_guest_forbidden(client: TestClient, auth_headers: dict):
    """Guest role cannot validate."""
    body = {"claims": [{"claim_text": "test"}]}
    resp = client.post("/api/v1/citations/validate", json=body, headers=auth_headers["guest"])
    assert resp.status_code == 403


# ── Audit endpoint ───────────────────────────────────────────────────────────

def test_audit_trail_after_validation(client: TestClient, auth_headers: dict):
    """Audit trail records appear after a validation run."""
    body = {"claims": [{"claim_text": "tDCS for depression"}]}
    client.post("/api/v1/citations/validate", json=body, headers=auth_headers["clinician"])

    resp = client.get("/api/v1/citations/audit", headers=auth_headers["clinician"])
    assert resp.status_code == 200
    events = resp.json()
    assert len(events) >= 1
    # Each event has a hash chain link
    for e in events:
        assert e["row_hash"] != ""
        assert e["event_type"] != ""


def test_audit_filter_by_claim(client: TestClient, auth_headers: dict):
    """Audit trail can filter by claim_hash."""
    body = {"claims": [{"claim_text": "unique claim for audit filter test"}]}
    validate_resp = client.post("/api/v1/citations/validate", json=body, headers=auth_headers["clinician"])
    claim_hash = validate_resp.json()["results"][0]["claim_hash"]

    resp = client.get(
        f"/api/v1/citations/audit?claim_hash={claim_hash}",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200
    events = resp.json()
    assert all(e["claim_hash"] == claim_hash for e in events)


# ── Single citation detail ───────────────────────────────────────────────────

def test_get_claim_citation(client: TestClient, auth_headers: dict):
    """Can retrieve a single claim citation by ID."""
    session = SessionLocal()
    try:
        _seed_paper(session)
    finally:
        session.close()

    body = {
        "claims": [{"claim_text": "tDCS targeting DLPFC reduces depressive symptoms"}],
        "min_relevance": 0.0,
    }
    validate_resp = client.post("/api/v1/citations/validate", json=body, headers=auth_headers["clinician"])

    # Fetch citation IDs from the DB
    session = SessionLocal()
    try:
        records = list(session.query(DsClaimCitation).all())
        assert len(records) >= 1
        cid = records[0].id
    finally:
        session.close()

    resp = client.get(f"/api/v1/citations/{cid}", headers=auth_headers["clinician"])
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == cid


def test_get_claim_citation_not_found(client: TestClient, auth_headers: dict):
    """404 for non-existent citation ID."""
    resp = client.get("/api/v1/citations/nonexistent-id", headers=auth_headers["clinician"])
    assert resp.status_code == 404


# ── Retraction check ────────────────────────────────────────────────────────

def test_validate_retracted_pmid_blocked(client: TestClient, auth_headers: dict):
    """Asserted PMID that is retracted triggers retraction block."""
    session = SessionLocal()
    try:
        _seed_paper(session, pmid="77777777", title="Retracted study", grade="A")
        paper = session.query(DsPaper).filter_by(pmid="77777777").first()
        paper.retracted = True
        session.commit()
    finally:
        session.close()

    body = {
        "claims": [{
            "claim_text": "retracted study claim",
            "asserted_pmids": ["77777777"],
        }],
    }
    resp = client.post("/api/v1/citations/validate", json=body, headers=auth_headers["clinician"])
    assert resp.status_code == 200
    result = resp.json()["results"][0]
    assert result["pmids_retracted"] == 1
    retract_issues = [i for i in result["issues"] if i["issue_type"] == "retracted_paper"]
    assert len(retract_issues) == 1
    assert result["passed"] is False
