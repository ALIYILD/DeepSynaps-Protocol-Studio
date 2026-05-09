"""Tests for /api/v1/patient-timeline (CONTRACT_V3 §6).

Covers:
- Auth gate (403)
- Empty DB → demo synthesis (6 events, all required fields)
- Event shape (type, at, summary, ref_id, lane, connects_to)
- Banned-word sanitisation in summaries
- Events sorted newest-first
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app

_CLINICIAN = {"Authorization": "Bearer clinician-demo-token"}
_BASE = "/api/v1/patient-timeline"


@pytest.fixture
def client() -> TestClient:
    with TestClient(app) as c:
        yield c


def test_timeline_requires_auth(client: TestClient) -> None:
    r = client.get(f"{_BASE}/pt-999")
    assert r.status_code == 403


def test_timeline_empty_db_returns_demo_events(client: TestClient) -> None:
    r = client.get(f"{_BASE}/pt-demo-empty", headers=_CLINICIAN)
    assert r.status_code == 200
    body = r.json()
    assert "events" in body
    events = body["events"]
    # Demo synthesis must produce exactly 6 events
    assert len(events) == 6


def test_timeline_event_shape(client: TestClient) -> None:
    r = client.get(f"{_BASE}/pt-demo-shape", headers=_CLINICIAN)
    assert r.status_code == 200
    events = r.json()["events"]
    required_fields = {"type", "at", "summary", "ref_id", "lane", "connects_to"}
    for ev in events:
        assert required_fields.issubset(ev.keys()), f"Event missing fields: {ev}"
        assert isinstance(ev["connects_to"], list)


def test_timeline_valid_lanes(client: TestClient) -> None:
    r = client.get(f"{_BASE}/pt-demo-lanes", headers=_CLINICIAN)
    assert r.status_code == 200
    events = r.json()["events"]
    valid_lanes = {"qeeg", "mri", "assessment", "session", "outcome"}
    for ev in events:
        assert ev["lane"] in valid_lanes, f"Unexpected lane: {ev['lane']}"


def test_timeline_sorted_newest_first(client: TestClient) -> None:
    r = client.get(f"{_BASE}/pt-demo-sort", headers=_CLINICIAN)
    assert r.status_code == 200
    events = r.json()["events"]
    timestamps = [ev["at"] for ev in events if ev["at"]]
    assert timestamps == sorted(timestamps, reverse=True)


def test_timeline_no_banned_words_in_summary(client: TestClient) -> None:
    r = client.get(f"{_BASE}/pt-demo-banned", headers=_CLINICIAN)
    assert r.status_code == 200
    events = r.json()["events"]
    banned = ["treatment recommendation", "diagnosis", "diagnostic", "diagnoses"]
    for ev in events:
        summary_lower = (ev.get("summary") or "").lower()
        for word in banned:
            assert word not in summary_lower, (
                f"Banned word '{word}' found in summary: {ev['summary']}"
            )


def test_timeline_different_patient_ids_independent(client: TestClient) -> None:
    r1 = client.get(f"{_BASE}/pt-aaa", headers=_CLINICIAN)
    r2 = client.get(f"{_BASE}/pt-bbb", headers=_CLINICIAN)
    assert r1.status_code == 200
    assert r2.status_code == 200
    # Each patient gets their own independent demo events
    ids1 = {ev["ref_id"] for ev in r1.json()["events"]}
    ids2 = {ev["ref_id"] for ev in r2.json()["events"]}
    assert ids1.isdisjoint(ids2), "Demo events from different patients must have distinct ref_ids"
