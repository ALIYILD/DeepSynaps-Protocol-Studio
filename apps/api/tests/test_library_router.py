"""Tests for /api/v1/library/* — the Library page's aggregate API.

Narrow coverage: the overview aggregator, eligibility logic, external-search
provenance tagging, and AI summary draft guarantees. Uses the evidence DB
fixture helper from test_evidence_router so we don't depend on live ingest.
"""
from __future__ import annotations

import os
import tempfile
from pathlib import Path

from fastapi.testclient import TestClient

from test_evidence_router import _build_fixture_db


def test_library_overview_requires_auth(client: TestClient) -> None:
    r = client.get("/api/v1/library/overview")
    assert r.status_code in (401, 403), r.text


def test_library_overview_returns_structured_payload(client: TestClient, auth_headers) -> None:
    r = client.get("/api/v1/library/overview", headers=auth_headers["clinician"])
    assert r.status_code == 200, r.text
    body = r.json()
    # Required top-level keys exist
    for key in (
        "condition_count", "neuromod_eligible_count", "device_count",
        "condition_package_count", "evidence_db_available", "conditions",
        "curated_paper_count", "curated_trial_count", "generated_at",
    ):
        assert key in body, f"missing {key}"
    assert isinstance(body["conditions"], list)
    # Each condition summary carries provenance + eligibility fields
    if body["conditions"]:
        c = body["conditions"][0]
        for field in (
            "id", "name", "source_trust", "review_status",
            "neuromod_eligible", "eligibility_reasons", "eligibility_blockers",
            "reviewed_protocol_count", "total_protocol_count",
            "curated_evidence_paper_count", "compatible_device_count",
            "has_condition_package", "package_slug",
        ):
            assert field in c, f"missing {field} on condition summary"
        assert c["source_trust"] == "curated"
        assert isinstance(c["neuromod_eligible"], bool)


def test_eligibility_requires_reviewed_protocol_and_high_grade(client: TestClient, auth_headers) -> None:
    r = client.get("/api/v1/library/overview", headers=auth_headers["clinician"])
    assert r.status_code == 200
    for c in r.json()["conditions"]:
        if c["neuromod_eligible"]:
            assert c["reviewed_protocol_count"] >= 1, (
                f"{c['id']}: marked eligible with no reviewed protocol"
            )
            # Reasons must include a grade mention
            assert any("grade" in reason.lower() for reason in c["eligibility_reasons"]), (
                f"{c['id']}: eligible but no grade reason"
            )
        else:
            assert c["eligibility_blockers"], f"{c['id']}: ineligible but no blocker text"


def test_external_search_503_when_evidence_db_missing(client: TestClient, auth_headers) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        os.environ["EVIDENCE_DB_PATH"] = str(Path(tmp) / "nope.db")
        try:
            r = client.post(
                "/api/v1/library/external-search",
                headers=auth_headers["clinician"],
                json={"q": "rTMS depression", "limit": 5},
            )
            assert r.status_code == 503
            assert "ingest" in r.json()["detail"].lower() or "not available" in r.json()["detail"].lower()
        finally:
            os.environ.pop("EVIDENCE_DB_PATH", None)


def test_external_search_tags_results_as_unreviewed(client: TestClient, auth_headers) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        db_path = str(Path(tmp) / "evidence.db")
        _build_fixture_db(db_path)
        os.environ["EVIDENCE_DB_PATH"] = db_path
        try:
            r = client.post(
                "/api/v1/library/external-search",
                headers=auth_headers["clinician"],
                json={"q": "iTBS", "limit": 5},
            )
            assert r.status_code == 200, r.text
            body = r.json()
            # Top-level must carry provenance + notice
            assert body["source_trust"] == "external_raw"
            assert body["review_status"] == "pending"
            assert "unreviewed" in body["notice"].lower() or "not curated" in body["notice"].lower()
            assert body["provenance"]
            assert body["last_checked_at"]
            # Every item must carry same trust flags
            for item in body["items"]:
                assert item["source_trust"] == "external_raw"
                assert item["review_status"] == "pending"
                assert item["provenance_note"]
        finally:
            os.environ.pop("EVIDENCE_DB_PATH", None)


def test_external_search_validates_query_length(client: TestClient, auth_headers) -> None:
    r = client.post(
        "/api/v1/library/external-search",
        headers=auth_headers["clinician"],
        json={"q": "a", "limit": 5},
    )
    # Pydantic min_length=2 → 422
    assert r.status_code == 422


def test_ai_summarize_returns_draft_with_citations(client: TestClient, auth_headers) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        db_path = str(Path(tmp) / "evidence.db")
        _build_fixture_db(db_path)
        os.environ["EVIDENCE_DB_PATH"] = db_path
        try:
            r = client.post(
                "/api/v1/library/ai/summarize-evidence",
                headers=auth_headers["clinician"],
                json={"paper_ids": [1]},
            )
            # chat service may fail in CI — that's fine, we still expect a draft shape
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["status"] == "draft"
            assert body["review_status"] == "draft"
            assert body["source_trust"] == "ai_generated"
            assert body["generated_by"] == "ai"
            assert body["source_paper_ids"] == [1]
            assert body["source_citations"]
            assert body["draft_text"]
            assert "review" in body["reviewer_notice"].lower()
        finally:
            os.environ.pop("EVIDENCE_DB_PATH", None)


def test_ai_summarize_rejects_unknown_paper_ids(client: TestClient, auth_headers) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        db_path = str(Path(tmp) / "evidence.db")
        _build_fixture_db(db_path)
        os.environ["EVIDENCE_DB_PATH"] = db_path
        try:
            r = client.post(
                "/api/v1/library/ai/summarize-evidence",
                headers=auth_headers["clinician"],
                json={"paper_ids": [99999]},
            )
            assert r.status_code == 404
        finally:
            os.environ.pop("EVIDENCE_DB_PATH", None)


def test_ai_summarize_enforces_paper_id_bounds(client: TestClient, auth_headers) -> None:
    # Empty array rejected
    r = client.post(
        "/api/v1/library/ai/summarize-evidence",
        headers=auth_headers["clinician"],
        json={"paper_ids": []},
    )
    assert r.status_code == 422
    # Too many rejected
    r = client.post(
        "/api/v1/library/ai/summarize-evidence",
        headers=auth_headers["clinician"],
        json={"paper_ids": list(range(1, 100))},
    )
    assert r.status_code == 422


def test_condition_summary_returns_404_for_unknown_condition(client: TestClient, auth_headers) -> None:
    r = client.get(
        "/api/v1/library/conditions/ZZZ-not-a-real-id/summary",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 404
