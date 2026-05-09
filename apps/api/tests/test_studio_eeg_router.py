"""Tests for Studio EEG router (/api/v1/studio/eeg).

This router requires MNE + real EDF files for the /window and /bandrange
endpoints — those are not feasible in the test-DB-only environment.

We test:
- GET /bandrange-presets — auth gating + structure check
- POST /{analysis_id}/markers — 404 on unknown analysis, auth gating
- DELETE /{analysis_id}/markers/{marker_id} — auth gating + 404 unknown analysis
- GET /{analysis_id}/window — auth gating + 404 on unknown analysis (before MNE)
- Marker kind validation: invalid kind → 422
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


_STUDIO = "/api/v1/studio/eeg"


# ── Bandrange Presets ──────────────────────────────────────────────────────

class TestBandrangePresets:
    def test_clinician_gets_presets(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        resp = client.get(f"{_STUDIO}/bandrange-presets", headers=auth_headers["clinician"])
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert "presets" in data
        assert isinstance(data["presets"], list)

    def test_guest_rejected(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        resp = client.get(f"{_STUDIO}/bandrange-presets", headers=auth_headers["guest"])
        assert resp.status_code == 403, resp.text

    def test_unauthenticated_rejected(self, client: TestClient) -> None:
        resp = client.get(f"{_STUDIO}/bandrange-presets")
        assert resp.status_code in (401, 403), resp.text


# ── Markers: post ─────────────────────────────────────────────────────────

class TestPostMarker:
    def test_unknown_analysis_404(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        resp = client.post(
            f"{_STUDIO}/ghost-analysis-id/markers",
            json={"kind": "label", "fromSec": 1.0, "toSec": 2.0, "text": "test"},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 404, resp.text

    def test_invalid_kind_422(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        resp = client.post(
            f"{_STUDIO}/any-analysis/markers",
            json={"kind": "invalid_kind", "fromSec": 1.0},
            headers=auth_headers["clinician"],
        )
        # Pydantic pattern validation for kind fires before DB lookup
        assert resp.status_code == 422, resp.text

    def test_missing_from_sec_422(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        resp = client.post(
            f"{_STUDIO}/any-analysis/markers",
            json={"kind": "label"},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 422, resp.text

    def test_guest_rejected(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        resp = client.post(
            f"{_STUDIO}/any-analysis/markers",
            json={"kind": "label", "fromSec": 0.0},
            headers=auth_headers["guest"],
        )
        assert resp.status_code == 403, resp.text

    def test_unauthenticated_rejected(self, client: TestClient) -> None:
        resp = client.post(
            f"{_STUDIO}/any-analysis/markers",
            json={"kind": "label", "fromSec": 0.0},
        )
        assert resp.status_code in (401, 403), resp.text


# ── Markers: delete ────────────────────────────────────────────────────────

class TestDeleteMarker:
    def test_unknown_analysis_404(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        resp = client.delete(
            f"{_STUDIO}/ghost-analysis/markers/ghost-marker",
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 404, resp.text

    def test_guest_rejected(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        resp = client.delete(
            f"{_STUDIO}/any-analysis/markers/any-marker",
            headers=auth_headers["guest"],
        )
        assert resp.status_code == 403, resp.text


# ── Window: auth gating (MNE not needed for these checks) ─────────────────

class TestWindowAuthGating:
    def test_unknown_analysis_returns_404(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        resp = client.get(
            f"{_STUDIO}/ghost-id/window?fromSec=0&toSec=5",
            headers=auth_headers["clinician"],
        )
        # 404 comes from _load_analysis before MNE is invoked
        assert resp.status_code == 404, resp.text

    def test_missing_required_query_params_422(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # Missing fromSec and toSec
        resp = client.get(
            f"{_STUDIO}/any-id/window",
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 422, resp.text

    def test_guest_rejected(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        resp = client.get(
            f"{_STUDIO}/any-id/window?fromSec=0&toSec=5",
            headers=auth_headers["guest"],
        )
        assert resp.status_code == 403, resp.text

    def test_unauthenticated_rejected(self, client: TestClient) -> None:
        resp = client.get(f"{_STUDIO}/any-id/window?fromSec=0&toSec=5")
        assert resp.status_code in (401, 403), resp.text
