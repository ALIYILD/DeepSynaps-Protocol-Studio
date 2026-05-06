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
