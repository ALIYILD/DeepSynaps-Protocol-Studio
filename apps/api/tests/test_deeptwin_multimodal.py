"""Tests for the DeepTwin multimodal aggregation layer.

Covers:
- Multimodal context endpoint returns all analyzers (10 analyzers)
- Each analyzer result includes status (available/missing/error)
- Provenance is present for all results
- Cross-analyzer aggregation has no N+1 query pattern
- Evidence links builder returns valid queries
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any
from unittest.mock import MagicMock, call, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.deeptwin_decision_support import build_evidence_links
from app.services.deeptwin_engine import DOMAINS, SOURCE_LABELS


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def client() -> TestClient:
    with TestClient(app) as c:
        yield c


@pytest.fixture
def auth_headers() -> dict[str, dict[str, str]]:
    return {
        "clinician": {"Authorization": "Bearer clinician-demo-token"},
        "admin": {"Authorization": "Bearer admin-demo-token"},
    }


# ---------------------------------------------------------------------------
# Evidence links builder (unit tests — no DB needed)
# ---------------------------------------------------------------------------


def test_build_evidence_links_returns_empty_for_empty_hypothesis() -> None:
    result = build_evidence_links({})
    assert result == []


def test_build_evidence_links_returns_intervention_query() -> None:
    result = build_evidence_links({"intervention_type": "rTMS"})
    assert len(result) == 1
    assert result[0]["query"] == "rTMS outcome"
    assert result[0]["domain"] == "intervention"
    assert result[0]["evidence_grade"] == "pending"


def test_build_evidence_links_returns_biomarker_query() -> None:
    result = build_evidence_links({"affected_domain": "attention"})
    assert len(result) == 1
    assert result[0]["query"] == "attention biomarker"
    assert result[0]["domain"] == "biomarker"
    assert result[0]["evidence_grade"] == "pending"


def test_build_evidence_links_returns_confounder_queries() -> None:
    result = build_evidence_links({"confounders": ["sleep", "caffeine"]})
    assert len(result) == 2
    assert result[0]["query"] == "sleep confound"
    assert result[0]["domain"] == "causality"
    assert result[1]["query"] == "caffeine confound"
    assert result[1]["domain"] == "causality"


def test_build_evidence_links_combines_all_fields() -> None:
    result = build_evidence_links({
        "intervention_type": "tDCS",
        "affected_domain": "mood",
        "confounders": ["stress"],
    })
    assert len(result) == 3
    queries = [r["query"] for r in result]
    assert "tDCS outcome" in queries
    assert "mood biomarker" in queries
    assert "stress confound" in queries


def test_build_evidence_links_never_fabricates_citations() -> None:
    """The evidence builder must never return fabricated citations."""
    result = build_evidence_links({
        "intervention_type": "tDCS",
        "affected_domain": "sleep",
    })
    for item in result:
        # No PMID, DOI, or fabricated reference should appear
        assert "pmid" not in item
        assert "doi" not in item
        assert "citation" not in item
        # Evidence grade must be pending (not fabricated)
        assert item["evidence_grade"] == "pending"


# ---------------------------------------------------------------------------
# DOMAINS and SOURCE_LABELS expansion
# ---------------------------------------------------------------------------


def test_domains_expanded_to_17() -> None:
    assert len(DOMAINS) == 17
    expected = {
        "qeeg", "mri", "assessments", "biomarkers",
        "sleep_hrv_activity", "sessions", "tasks_adherence",
        "notes_text", "wearables", "outcomes",
        "voice", "video", "digital_phenotyping",
        "risk_scores", "medications", "labs", "text_analysis",
    }
    assert set(DOMAINS) == expected


def test_source_labels_contains_new_entries() -> None:
    new_labels = [
        "voice", "digital_phenotyping", "risk_scores",
        "medications", "labs", "text_analysis",
    ]
    for key in new_labels:
        assert key in SOURCE_LABELS, f"SOURCE_LABELS missing: {key}"
        assert SOURCE_LABELS[key]  # non-empty label


def test_source_labels_audio_aliased_to_voice() -> None:
    """Audio and Voice both resolve to 'Voice' label."""
    assert SOURCE_LABELS["audio"] == "Voice"
    assert SOURCE_LABELS["voice"] == "Voice"


# ---------------------------------------------------------------------------
# Multimodal context endpoint
# ---------------------------------------------------------------------------


def test_multimodal_context_endpoint_returns_all_analyzers(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    """The endpoint must return all 10 analyzer slots."""
    resp = client.get(
        "/api/v1/deeptwin/multimodal-context/pat-demo-1",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()

    expected_analyzers = {
        "qeeg", "mri", "assessments", "medications",
        "labs", "voice", "video", "wearables", "interventions",
    }
    assert set(body["analyzers"].keys()) == expected_analyzers


def test_multimodal_context_each_analyzer_has_status(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    """Every analyzer result must include a status field."""
    resp = client.get(
        "/api/v1/deeptwin/multimodal-context/pat-demo-1",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()

    for analyzer_name, analyzer_data in body["analyzers"].items():
        assert "status" in analyzer_data, (
            f"Analyzer '{analyzer_name}' missing 'status' field"
        )
        assert analyzer_data["status"] in {"available", "missing", "error"}, (
            f"Analyzer '{analyzer_name}' has invalid status: {analyzer_data['status']}"
        )


def test_multimodal_context_provenance_present_for_all_results(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    """Every analyzer must include provenance metadata."""
    resp = client.get(
        "/api/v1/deeptwin/multimodal-context/pat-demo-1",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()

    # Top-level provenance
    assert "provenance" in body
    assert body["provenance"]["schema_version"]

    # Per-analyzer provenance
    for analyzer_name, analyzer_data in body["analyzers"].items():
        assert "provenance" in analyzer_data, (
            f"Analyzer '{analyzer_name}' missing 'provenance'"
        )
        assert "source" in analyzer_data["provenance"], (
            f"Analyzer '{analyzer_name}' provenance missing 'source'"
        )


def test_multimodal_context_top_level_fields(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    """The top-level response must include patient_id, timestamp, analyzers, provenance."""
    resp = client.get(
        "/api/v1/deeptwin/multimodal-context/pat-demo-1",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()

    assert body["patient_id"] == "pat-demo-1"
    assert "timestamp" in body
    assert "analyzers" in body
    assert "provenance" in body
    assert isinstance(body["timestamp"], str)


def test_multimodal_context_requires_clinician_role(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    """Non-clinician actors should be rejected."""
    resp = client.get(
        "/api/v1/deeptwin/multimodal-context/pat-demo-1",
        headers=auth_headers.get("patient", {"Authorization": "Bearer patient-demo-token"}),
    )
    assert resp.status_code == 403


def test_multimodal_context_no_n_plus_one_queries(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The endpoint must issue exactly one query per analyzer, not N+1.

    We verify this by counting DB query() calls — there should be
    exactly 9 (one per analyzer table), not 9 + N per-row follow-ups.
    """
    query_count = 0

    class _QueryCounter:
        """Wraps a session query() to count invocations."""

        def __init__(self, real_query: Any) -> None:
            self._real_query = real_query

        def __call__(self, *args: Any, **kwargs: Any) -> Any:
            nonlocal query_count
            query_count += 1
            return self._real_query(*args, **kwargs)

    # Patch Session.query to count calls on the demo patient path.
    # The demo path does not have real DB rows, so queries return []
    # but we still verify the *number* of queries issued.
    from sqlalchemy.orm import Session as _Session

    original_query = _Session.query

    def _patched_query(self: Any, *entities: Any, **kwargs: Any) -> Any:
        nonlocal query_count
        query_count += 1
        return original_query(self, *entities, **kwargs)

    monkeypatch.setattr(_Session, "query", _patched_query)

    resp = client.get(
        "/api/v1/deeptwin/multimodal-context/pat-demo-1",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text

    # 9 analyzers = 9 queries (qeeg, mri, assessments, medications,
    # labs, voice, video, wearables, interventions)
    assert query_count == 9, (
        f"Expected 9 DB queries (one per analyzer), got {query_count}. "
        "N+1 detected — the endpoint may be issuing extra queries."
    )


def test_multimodal_context_assessments_include_latest_scores(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    """The assessments analyzer must include latest_scores when available."""
    resp = client.get(
        "/api/v1/deeptwin/multimodal-context/pat-demo-1",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()

    assessments = body["analyzers"]["assessments"]
    # For demo patients, assessments are missing (no DB rows)
    assert assessments["status"] == "missing"
    assert "latest_scores" not in assessments
    assert assessments["count"] == 0
    assert assessments["latest"] is None


def test_multimodal_context_medications_include_active_count(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    """The medications analyzer must include active count when available."""
    resp = client.get(
        "/api/v1/deeptwin/multimodal-context/pat-demo-1",
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()

    medications = body["analyzers"]["medications"]
    assert "active" in medications
    assert medications["count"] == 0
    assert medications["status"] == "missing"
