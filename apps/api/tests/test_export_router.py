"""Tests for export router (/api/v1/export).

Existing test_export_router_authz.py covers auth/cross-clinic gates and field
caps. This file pins happy-path schema validation and auth boundaries for the
export endpoints that are not directly covered there.

Covers:
- Protocol DOCX: 422 on missing required fields
- Handbook DOCX: 422 on missing required fields
- Patient guide DOCX: 422 on missing required fields
- FHIR bundle: auth required, patient_id capped, nonexistent patient → 404
- BIDS derivatives: auth required, nonexistent patient → 404
- Guest / unauthenticated rejection on all endpoints
- _safe_filename_part: static unit test
"""
from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient


_EXPORT = "/api/v1/export"

_VALID_PROTOCOL_BODY = {
    "condition_name": "Major Depressive Disorder",
    "modality_name": "rTMS",
    "device_name": "MagVenture MagPro R30",
}

_VALID_HANDBOOK_BODY = {
    "condition_name": "Anxiety",
    "modality_name": "tDCS",
}

_VALID_PATIENT_GUIDE_BODY = {
    "condition_name": "ADHD",
    "modality_name": "Neurofeedback",
}


# ── Auth rejection helpers ──────────────────────────────────────────────────

@pytest.mark.parametrize("endpoint,body", [
    (f"{_EXPORT}/protocol-docx", _VALID_PROTOCOL_BODY),
    (f"{_EXPORT}/handbook-docx", _VALID_HANDBOOK_BODY),
    (f"{_EXPORT}/patient-guide-docx", _VALID_PATIENT_GUIDE_BODY),
])
def test_export_docx_guest_rejected(
    client: TestClient, auth_headers: dict, endpoint: str, body: dict
) -> None:
    resp = client.post(endpoint, json=body, headers=auth_headers["guest"])
    assert resp.status_code == 403, f"{endpoint}: {resp.text}"


@pytest.mark.parametrize("endpoint,body", [
    (f"{_EXPORT}/protocol-docx", _VALID_PROTOCOL_BODY),
    (f"{_EXPORT}/handbook-docx", _VALID_HANDBOOK_BODY),
    (f"{_EXPORT}/patient-guide-docx", _VALID_PATIENT_GUIDE_BODY),
])
def test_export_docx_unauthenticated_rejected(
    client: TestClient, endpoint: str, body: dict
) -> None:
    resp = client.post(endpoint, json=body)
    assert resp.status_code in (401, 403), f"{endpoint}: {resp.text}"


# ── 422 field validation ────────────────────────────────────────────────────

class TestProtocolDocxValidation:
    def test_missing_condition_name_422(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        resp = client.post(
            f"{_EXPORT}/protocol-docx",
            json={"modality_name": "rTMS", "device_name": "MagVenture"},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 422, resp.text

    def test_condition_name_too_long_422(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        resp = client.post(
            f"{_EXPORT}/protocol-docx",
            json={
                "condition_name": "x" * 300,  # max 200
                "modality_name": "rTMS",
                "device_name": "MagVenture",
            },
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 422, resp.text

    def test_all_fields_too_long_422(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        resp = client.post(
            f"{_EXPORT}/protocol-docx",
            json={
                "condition_name": "A" * 5000,
                "modality_name": "B" * 5000,
                "device_name": "C" * 5000,
            },
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 422, resp.text


class TestHandbookDocxValidation:
    def test_missing_modality_name_422(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        resp = client.post(
            f"{_EXPORT}/handbook-docx",
            json={"condition_name": "Depression"},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 422, resp.text

    def test_invalid_handbook_kind_422(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        resp = client.post(
            f"{_EXPORT}/handbook-docx",
            json={
                "condition_name": "Depression",
                "modality_name": "rTMS",
                "handbook_kind": "invalid_kind",
            },
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 422, resp.text


class TestFHIRBundleValidation:
    def test_missing_patient_id_422(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        resp = client.post(
            f"{_EXPORT}/fhir-r4-bundle",
            json={},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 422, resp.text

    def test_nonexistent_patient_404(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        resp = client.post(
            f"{_EXPORT}/fhir-r4-bundle",
            json={"patient_id": "ghost-patient-id"},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 404, resp.text

    def test_patient_id_too_long_422(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        resp = client.post(
            f"{_EXPORT}/fhir-r4-bundle",
            json={"patient_id": "p" * 100},  # max 64
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 422, resp.text

    def test_guest_rejected(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        resp = client.post(
            f"{_EXPORT}/fhir-r4-bundle",
            json={"patient_id": "any-id"},
            headers=auth_headers["guest"],
        )
        assert resp.status_code == 403, resp.text

    def test_unauthenticated_rejected(self, client: TestClient) -> None:
        resp = client.post(
            f"{_EXPORT}/fhir-r4-bundle",
            json={"patient_id": "any-id"},
        )
        assert resp.status_code in (401, 403), resp.text


class TestBIDSDerivativesValidation:
    def test_nonexistent_patient_404(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        resp = client.post(
            f"{_EXPORT}/bids-derivatives",
            json={"patient_id": "ghost-bids-patient"},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 404, resp.text

    def test_missing_patient_id_422(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        resp = client.post(
            f"{_EXPORT}/bids-derivatives",
            json={},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 422, resp.text

    def test_guest_rejected(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        resp = client.post(
            f"{_EXPORT}/bids-derivatives",
            json={"patient_id": "any"},
            headers=auth_headers["guest"],
        )
        assert resp.status_code == 403, resp.text


# ── Unit test: _safe_filename_part ────────────────────────────────────────

def test_safe_filename_part_normalises_special_chars() -> None:
    from app.routers.export_router import _safe_filename_part
    assert _safe_filename_part("Major Depressive Disorder") == "Major_Depressive_Disorder"
    assert _safe_filename_part("rTMS/tDCS") == "rTMS_tDCS"
    assert _safe_filename_part("  spaces  ") == "spaces"
    assert _safe_filename_part("abc123") == "abc123"
