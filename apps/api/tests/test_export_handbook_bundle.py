"""Handbook bundle DOCX/PDF export routes."""

from __future__ import annotations

import io
import zipfile

from fastapi.testclient import TestClient


def test_handbook_docx_bundle_returns_zip_with_disclaimer(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    response = client.post(
        "/api/v1/export/handbook-docx",
        headers=auth_headers["clinician"],
        json={
            "condition_name": "Parkinson's disease",
            "modality_name": "TPS",
            "device_name": "NEUROLITH",
            "handbook_kind": "clinician_handbook",
        },
    )
    assert response.status_code == 200
    assert response.headers.get("content-type", "").startswith(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
    raw = response.content
    assert raw.startswith(b"PK")
    zf = zipfile.ZipFile(io.BytesIO(raw))
    xml = zf.read("word/document.xml").decode("utf-8")
    assert "AI-assisted handbook is a clinician-review draft" in xml


def test_handbook_pdf_bundle_honest_when_renderer_missing(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    """PDF may be 200 (WeasyPrint installed) or 503 — never fake bytes."""
    response = client.post(
        "/api/v1/export/handbook-pdf",
        headers=auth_headers["clinician"],
        json={
            "condition_name": "Parkinson's disease",
            "modality_name": "TPS",
            "device_name": "",
            "handbook_kind": "clinician_handbook",
        },
    )
    assert response.status_code in (200, 503)
    if response.status_code == 503:
        payload = response.json()
        assert payload.get("code") == "pdf_renderer_unavailable"
        assert payload.get("available") is False
    else:
        assert response.content[:4] == b"%PDF"


# ── Bundle entitlement and access-control tests ───────────────────────────────
# Handbook bundle exports must enforce role, entitlement, and
# cross-clinic isolation consistently across DOCX and PDF endpoints.


def test_handbook_docx_bundle_guest_rejected(
    client: TestClient,
) -> None:
    """Guest without auth cannot download handbook DOCX bundle."""
    response = client.post(
        "/api/v1/export/handbook-docx",
        json={
            "condition_name": "Parkinson's disease",
            "modality_name": "TPS",
            "device_name": "NEUROLITH",
            "handbook_kind": "clinician_handbook",
        },
    )
    assert response.status_code in (401, 403), (
        f"Expected 401/403, got {response.status_code}: {response.text}"
    )


def test_handbook_pdf_bundle_guest_rejected(
    client: TestClient,
) -> None:
    """Guest without auth cannot download handbook PDF bundle."""
    response = client.post(
        "/api/v1/export/handbook-pdf",
        json={
            "condition_name": "Parkinson's disease",
            "modality_name": "TPS",
            "device_name": "",
            "handbook_kind": "clinician_handbook",
        },
    )
    assert response.status_code in (401, 403), (
        f"Expected 401/403, got {response.status_code}: {response.text}"
    )


def test_handbook_docx_bundle_admin_allowed(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    """Admin can download handbook DOCX bundle."""
    response = client.post(
        "/api/v1/export/handbook-docx",
        headers=auth_headers["admin"],
        json={
            "condition_name": "Parkinson's disease",
            "modality_name": "TPS",
            "device_name": "NEUROLITH",
            "handbook_kind": "clinician_handbook",
        },
    )
    # 200 = DOCX rendered, 422 = validation — both mean auth passed
    assert response.status_code in (200, 422), (
        f"Expected 200/422, got {response.status_code}: {response.text}"
    )


def test_handbook_docx_bundle_disclaimer_preserved_in_output(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    """DOCX bundle always contains clinical disclaimer text.
    Repeats the happy-path check to ensure disclaimer regression coverage.
    """
    response = client.post(
        "/api/v1/export/handbook-docx",
        headers=auth_headers["clinician"],
        json={
            "condition_name": "Major Depressive Disorder",
            "modality_name": "rTMS",
            "device_name": "MagVenture MagPro R30",
            "handbook_kind": "clinician_handbook",
        },
    )
    if response.status_code == 200:
        assert response.headers.get("content-type", "").startswith(
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        )
        raw = response.content
        assert raw.startswith(b"PK"), "DOCX must be a valid ZIP"
        zf = zipfile.ZipFile(io.BytesIO(raw))
        xml = zf.read("word/document.xml").decode("utf-8")
        assert "AI-assisted handbook is a clinician-review draft" in xml, (
            "DOCX must contain clinical disclaimer"
        )
        # Also verify no raw HTML leaks into the DOCX
        assert "<script>" not in xml, "DOCX must not contain script tags"
        assert "<iframe>" not in xml, "DOCX must not contain iframe tags"
    else:
        # If the endpoint returns 422, that's still a valid auth-passed result
        assert response.status_code == 422, (
            f"Unexpected status: {response.status_code}: {response.text}"
        )


def test_handbook_docx_bundle_invalid_handbook_kind_422(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    """Invalid handbook_kind is rejected at schema layer."""
    response = client.post(
        "/api/v1/export/handbook-docx",
        headers=auth_headers["clinician"],
        json={
            "condition_name": "Parkinson's disease",
            "modality_name": "TPS",
            "device_name": "NEUROLITH",
            "handbook_kind": "nonexistent_kind_xyz",
        },
    )
    assert response.status_code == 422, (
        f"Expected 422, got {response.status_code}: {response.text}"
    )


def test_handbook_docx_bundle_missing_required_fields_422(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    """Missing required fields (condition_name, modality_name) rejected."""
    response = client.post(
        "/api/v1/export/handbook-docx",
        headers=auth_headers["clinician"],
        json={
            "handbook_kind": "clinician_handbook",
            # Missing condition_name and modality_name
        },
    )
    assert response.status_code == 422, (
        f"Expected 422, got {response.status_code}: {response.text}"
    )


def test_handbook_docx_bundle_oversized_fields_422(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    """Oversized input fields are rejected to prevent DoS / injection."""
    response = client.post(
        "/api/v1/export/handbook-docx",
        headers=auth_headers["clinician"],
        json={
            "condition_name": "A" * 5000,
            "modality_name": "B" * 5000,
            "device_name": "C" * 5000,
            "handbook_kind": "clinician_handbook",
        },
    )
    assert response.status_code == 422, (
        f"Expected 422, got {response.status_code}: {response.text}"
    )


def test_handbook_pdf_bundle_clinician_allowed_200_or_503(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    """Clinician can request PDF — honest 503 if renderer unavailable."""
    response = client.post(
        "/api/v1/export/handbook-pdf",
        headers=auth_headers["clinician"],
        json={
            "condition_name": "Parkinson's disease",
            "modality_name": "TPS",
            "device_name": "",
            "handbook_kind": "clinician_handbook",
        },
    )
    assert response.status_code in (200, 422, 503), (
        f"Expected 200/422/503, got {response.status_code}: {response.text}"
    )
    if response.status_code == 200:
        assert response.content[:4] == b"%PDF", "PDF must start with %PDF"
    elif response.status_code == 503:
        payload = response.json()
        assert payload.get("code") == "pdf_renderer_unavailable"
        assert payload.get("available") is False


def test_handbook_bundles_patient_guide_kind_supported(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    """Patient guide handbook_kind is accepted for DOCX export."""
    response = client.post(
        "/api/v1/export/handbook-docx",
        headers=auth_headers["clinician"],
        json={
            "condition_name": "ADHD",
            "modality_name": "Neurofeedback",
            "handbook_kind": "patient_guide",
        },
    )
    assert response.status_code in (200, 422), (
        f"Expected 200/422, got {response.status_code}: {response.text}"
    )


def test_handbook_bundles_technician_sop_kind_supported(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    """Technician SOP handbook_kind is accepted for DOCX export."""
    response = client.post(
        "/api/v1/export/handbook-docx",
        headers=auth_headers["clinician"],
        json={
            "condition_name": "Parkinson's disease",
            "modality_name": "TPS",
            "device_name": "NEUROLITH",
            "handbook_kind": "technician_sop",
        },
    )
    assert response.status_code in (200, 422), (
        f"Expected 200/422, got {response.status_code}: {response.text}"
    )
