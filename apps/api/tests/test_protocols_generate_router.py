"""Tests for protocols_generate_router.py.

Covers:
- Auth: unauthenticated request rejected (403) for each endpoint
- generate-brain-scan: missing required fields → 422 (schema validation)
- generate-brain-scan: valid request returns BrainScanProtocolResponse shape
- generate-brain-scan: scan_guidance references the supplied scan type
- generate-brain-scan: with eeg_markers produces specific marker_adjustment text
- generate-personalized: missing required fields → 422
- generate-personalized: valid request returns PersonalizedProtocolResponse shape
- generate-personalized: PHQ-9 score appears in personalization_rationale
- generate-personalized: morning chronotype note appears in rationale

Uses "Major Depressive Disorder" (full dataset name) so the clinical data service
resolves successfully without mocking.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


_CLINICIAN_HEADERS = {"Authorization": "Bearer clinician-demo-token"}

# ── Auth (no auth → guest → require_minimum_role → 403) ──────────────────────

def test_brain_scan_requires_auth(client: TestClient) -> None:
    """Unauthenticated request with valid body must be rejected (403).

    FastAPI validates body before auth so an invalid body would return 422;
    we send a fully-valid payload so the auth gate is the first failing check.
    """
    r = client.post(
        "/api/v1/protocols/generate-brain-scan",
        json={"condition": "Major Depressive Disorder", "scan_type": "qEEG", "primary_target": "DLPFC"},
    )
    assert r.status_code == 403


def test_personalized_requires_auth(client: TestClient) -> None:
    """Unauthenticated request with valid body must be rejected (403)."""
    r = client.post(
        "/api/v1/protocols/generate-personalized",
        json={"condition": "Major Depressive Disorder"},
    )
    assert r.status_code == 403


# ── generate-brain-scan ───────────────────────────────────────────────────────

def test_brain_scan_missing_required_fields_422(client: TestClient) -> None:
    r = client.post(
        "/api/v1/protocols/generate-brain-scan",
        json={"scan_type": "qEEG"},  # missing condition
        headers=_CLINICIAN_HEADERS,
    )
    assert r.status_code == 422


def test_brain_scan_happy_path(client: TestClient) -> None:
    r = client.post(
        "/api/v1/protocols/generate-brain-scan",
        json={
            "condition": "Major Depressive Disorder",
            "scan_type": "qEEG",
            "primary_target": "DLPFC",
        },
        headers=_CLINICIAN_HEADERS,
    )
    assert r.status_code == 200
    body = r.json()
    # BrainScanProtocolResponse must carry the enrichment fields
    assert "scan_guidance" in body
    assert "recommended_montage" in body
    assert "marker_adjustment" in body


def test_brain_scan_scan_guidance_references_scan_type(client: TestClient) -> None:
    """scan_guidance must include the scan_type name from the request."""
    r = client.post(
        "/api/v1/protocols/generate-brain-scan",
        json={
            "condition": "Major Depressive Disorder",
            "scan_type": "qEEG",
            "primary_target": "DLPFC",
        },
        headers=_CLINICIAN_HEADERS,
    )
    assert r.status_code == 200
    body = r.json()
    # Scan guidance must mention the scan type
    assert "qEEG" in body["scan_guidance"]


def test_brain_scan_with_eeg_markers(client: TestClient) -> None:
    r = client.post(
        "/api/v1/protocols/generate-brain-scan",
        json={
            "condition": "Major Depressive Disorder",
            "scan_type": "qEEG",
            "primary_target": "DLPFC",
            "eeg_markers": ["alpha-asymmetry", "frontal-theta"],
        },
        headers=_CLINICIAN_HEADERS,
    )
    assert r.status_code == 200
    body = r.json()
    # Markers present → marker_adjustment should be non-default
    marker_adj = body["marker_adjustment"]
    assert marker_adj != ""
    assert "No EEG markers supplied" not in marker_adj


# ── generate-personalized ─────────────────────────────────────────────────────

def test_personalized_missing_required_fields_422(client: TestClient) -> None:
    r = client.post(
        "/api/v1/protocols/generate-personalized",
        json={"phq9": 15},  # missing condition
        headers=_CLINICIAN_HEADERS,
    )
    assert r.status_code == 422


def test_personalized_happy_path(client: TestClient) -> None:
    r = client.post(
        "/api/v1/protocols/generate-personalized",
        json={"condition": "Major Depressive Disorder"},
        headers=_CLINICIAN_HEADERS,
    )
    assert r.status_code == 200
    body = r.json()
    assert "personalization_rationale" in body


def test_personalized_phq9_appears_in_rationale(client: TestClient) -> None:
    r = client.post(
        "/api/v1/protocols/generate-personalized",
        json={"condition": "Major Depressive Disorder", "phq9": 22},
        headers=_CLINICIAN_HEADERS,
    )
    assert r.status_code == 200
    rationale = r.json()["personalization_rationale"]
    # PHQ-9 of 22 (severe) should appear
    assert "22" in rationale or "severe" in rationale.lower()


def test_personalized_morning_chronotype_scheduling_note(client: TestClient) -> None:
    r = client.post(
        "/api/v1/protocols/generate-personalized",
        json={"condition": "Major Depressive Disorder", "chronotype": "morning"},
        headers=_CLINICIAN_HEADERS,
    )
    assert r.status_code == 200
    rationale = r.json()["personalization_rationale"]
    assert "morning" in rationale.lower() or "08:00" in rationale
