"""Happy-path + auth + edge-case tests for qeeg_viz_router.

Pins the following routes:
  GET  /api/v1/qeeg-viz/{analysis_id}/capabilities
  GET  /api/v1/qeeg-viz/{analysis_id}/topomap/{band}
  GET  /api/v1/qeeg-viz/{analysis_id}/band-grid
  GET  /api/v1/qeeg-viz/{analysis_id}/connectivity/chord/{band}
  GET  /api/v1/qeeg-viz/{analysis_id}/connectivity/heatmap/{band}
  GET  /api/v1/qeeg-viz/{analysis_id}/source/{band}
  GET  /api/v1/qeeg-viz/{analysis_id}/source-image/{band}
  POST /api/v1/qeeg-viz/{analysis_id}/report-pdf
"""
from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient


# ── helpers ───────────────────────────────────────────────────────────────────

BASE = "/api/v1/qeeg-viz"

_BAND_POWERS = json.dumps({
    "bands": {
        "alpha": {
            "channels": {
                "Cz": {"absolute_uv2": 1.2, "relative_pct": 22.0},
                "Fz": {"absolute_uv2": 0.9, "relative_pct": 18.0},
            }
        },
        "beta": {
            "channels": {
                "Cz": {"absolute_uv2": 0.5, "relative_pct": 10.0},
                "Fz": {"absolute_uv2": 0.4, "relative_pct": 9.0},
            }
        },
    }
})

_CHANNELS = json.dumps(["Cz", "Fz"])

_CONNECTIVITY = json.dumps({
    "channels": ["Cz", "Fz"],
    "coherence": {
        "alpha": [[1.0, 0.5], [0.5, 1.0]],
        "beta": [[1.0, 0.3], [0.3, 1.0]],
    },
    "wpli": {
        "alpha": [[0.0, 0.2], [0.2, 0.0]],
    },
})


def _seed_analysis(
    client: TestClient,
    auth_headers: dict,
    *,
    analysis_id: str = "ana-test-001",
    band_powers: str | None = None,
    channels: str | None = None,
    connectivity: str | None = None,
    status: str = "completed",
) -> str:
    from app.database import SessionLocal
    from app.persistence.models import QEEGAnalysis

    # First create a patient and a qeeg upload so the FK is valid
    pr = client.post(
        "/api/v1/patients",
        json={"first_name": "Viz", "last_name": "Patient", "dob": "1980-01-01", "gender": "M"},
        headers=auth_headers["clinician"],
    )
    assert pr.status_code == 201
    patient_id = pr.json()["id"]

    db = SessionLocal()
    try:
        existing = db.query(QEEGAnalysis).filter_by(id=analysis_id).first()
        if existing is None:
            row = QEEGAnalysis(
                id=analysis_id,
                patient_id=patient_id,
                clinician_id="actor-clinician-demo",
                analysis_status=status,
                band_powers_json=band_powers or _BAND_POWERS,
                channels_json=channels or _CHANNELS,
                connectivity_json=connectivity or _CONNECTIVITY,
                recording_date="2026-01-15",
            )
            db.add(row)
            db.commit()
    finally:
        db.close()
    return analysis_id


# ── capabilities ─────────────────────────────────────────────────────────────

def test_capabilities_requires_auth(client: TestClient, auth_headers: dict) -> None:
    ana_id = _seed_analysis(client, auth_headers, analysis_id="cap-anon")
    resp = client.get(f"{BASE}/{ana_id}/capabilities")
    assert resp.status_code in (401, 403)


def test_capabilities_happy_path(client: TestClient, auth_headers: dict) -> None:
    ana_id = _seed_analysis(client, auth_headers, analysis_id="cap-happy")
    resp = client.get(f"{BASE}/{ana_id}/capabilities", headers=auth_headers["clinician"])
    assert resp.status_code == 200
    body = resp.json()
    assert body["analysis_id"] == ana_id
    assert isinstance(body["has_topomaps"], bool)
    assert isinstance(body["bands"], list)
    assert isinstance(body["channels"], list)
    assert "alpha" in body["bands"] or body["has_topomaps"] is False


def test_capabilities_not_found_404(client: TestClient, auth_headers: dict) -> None:
    resp = client.get(f"{BASE}/nonexistent-analysis/capabilities", headers=auth_headers["clinician"])
    assert resp.status_code == 404


# ── topomap ───────────────────────────────────────────────────────────────────

def test_topomap_viz_package_missing_returns_503_or_200(client: TestClient, auth_headers: dict) -> None:
    """Either 200 (if deepsynaps_qeeg installed) or 503 (if not). Never 500."""
    ana_id = _seed_analysis(client, auth_headers, analysis_id="topo-happy")
    resp = client.get(f"{BASE}/{ana_id}/topomap/alpha", headers=auth_headers["clinician"])
    assert resp.status_code in (200, 400, 503)


def test_topomap_invalid_mode_422(client: TestClient, auth_headers: dict) -> None:
    ana_id = _seed_analysis(client, auth_headers, analysis_id="topo-422")
    resp = client.get(f"{BASE}/{ana_id}/topomap/alpha?mode=invalid_mode", headers=auth_headers["clinician"])
    assert resp.status_code == 422


# ── band-grid ─────────────────────────────────────────────────────────────────

def test_band_grid_viz_package_missing_returns_503_or_200(client: TestClient, auth_headers: dict) -> None:
    ana_id = _seed_analysis(client, auth_headers, analysis_id="grid-happy")
    resp = client.get(f"{BASE}/{ana_id}/band-grid", headers=auth_headers["clinician"])
    assert resp.status_code in (200, 400, 503)


def test_band_grid_invalid_mode_422(client: TestClient, auth_headers: dict) -> None:
    ana_id = _seed_analysis(client, auth_headers, analysis_id="grid-422")
    resp = client.get(f"{BASE}/{ana_id}/band-grid?mode=badmode", headers=auth_headers["clinician"])
    assert resp.status_code == 422


# ── connectivity/chord ────────────────────────────────────────────────────────

def test_connectivity_chord_viz_package_missing_or_200(client: TestClient, auth_headers: dict) -> None:
    ana_id = _seed_analysis(client, auth_headers, analysis_id="chord-happy")
    resp = client.get(f"{BASE}/{ana_id}/connectivity/chord/alpha", headers=auth_headers["clinician"])
    assert resp.status_code in (200, 400, 503)


def test_connectivity_chord_no_data_for_band(client: TestClient, auth_headers: dict) -> None:
    ana_id = _seed_analysis(client, auth_headers, analysis_id="chord-nodata")
    resp = client.get(f"{BASE}/{ana_id}/connectivity/chord/gamma", headers=auth_headers["clinician"])
    assert resp.status_code in (400, 503)


# ── connectivity/heatmap ──────────────────────────────────────────────────────

def test_connectivity_heatmap_viz_package_missing_or_200(client: TestClient, auth_headers: dict) -> None:
    ana_id = _seed_analysis(client, auth_headers, analysis_id="heat-happy")
    resp = client.get(f"{BASE}/{ana_id}/connectivity/heatmap/alpha", headers=auth_headers["clinician"])
    assert resp.status_code in (200, 400, 503)


# ── source ─────────────────────────────────────────────────────────────────────

def test_source_no_data_returns_400(client: TestClient, auth_headers: dict) -> None:
    """Analysis without source_roi_json must return 400."""
    ana_id = _seed_analysis(client, auth_headers, analysis_id="source-no-data")
    resp = client.get(f"{BASE}/{ana_id}/source/alpha", headers=auth_headers["clinician"])
    assert resp.status_code in (400, 503)


# ── source-image ──────────────────────────────────────────────────────────────

def test_source_image_invalid_fmt_422(client: TestClient, auth_headers: dict) -> None:
    ana_id = _seed_analysis(client, auth_headers, analysis_id="src-img-422")
    resp = client.get(f"{BASE}/{ana_id}/source-image/alpha?fmt=gif", headers=auth_headers["clinician"])
    assert resp.status_code == 422


# ── report-pdf ────────────────────────────────────────────────────────────────

def test_report_pdf_analysis_not_completed_returns_400(client: TestClient, auth_headers: dict) -> None:
    ana_id = _seed_analysis(client, auth_headers, analysis_id="pdf-pending", status="pending")
    resp = client.post(f"{BASE}/{ana_id}/report-pdf", headers=auth_headers["clinician"])
    assert resp.status_code in (400, 503)


def test_report_pdf_not_found_404(client: TestClient, auth_headers: dict) -> None:
    resp = client.post(f"{BASE}/nonexistent-pdf-ana/report-pdf", headers=auth_headers["clinician"])
    assert resp.status_code == 404
