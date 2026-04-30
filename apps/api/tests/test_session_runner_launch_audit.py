"""Backend tests for the Session Runner launch-audit (2026-04-30).

Covers the three new endpoints added to ``sessions_router``:

* ``GET  /api/v1/sessions/{id}/telemetry``
  is_demo flag honesty: when no real device is attached the values are
  deterministic stubs and the response carries ``is_demo: true``. When a
  real ``device_id`` is on the row the response uses real impedance from
  the latest IMPEDANCE event and ``is_demo: false``.

* ``POST /api/v1/sessions/{id}/comfort``
  NRS-SE 0-10 rating persists as a ``COMFORT`` clinical session event,
  with the optional verbatim quote on the payload. Out-of-range ratings
  are rejected by Pydantic.

* ``POST /api/v1/sessions/{id}/sign``
  Clinician sign-off persists a ``SIGN`` event. The ``is_demo`` flag is
  carried through to the payload so PDF exports can stamp DEMO.

Also covers the audit-events surface whitelist extension: posting
``surface: "session_runner"`` to ``/api/v1/qeeg-analysis/audit-events``
must round-trip with the surface preserved on the action label.
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi.testclient import TestClient


def _create_patient(client: TestClient, headers: dict[str, str]) -> str:
    resp = client.post(
        "/api/v1/patients",
        headers=headers,
        json={
            "first_name": "Theo",
            "last_name": "Reyes",
            "primary_condition": "MDD",
            "primary_modality": "tDCS",
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _create_session(
    client: TestClient,
    headers: dict[str, str],
    patient_id: str,
    *,
    device_id: str | None = None,
) -> str:
    body: dict = {
        "patient_id": patient_id,
        "scheduled_at": datetime.now(timezone.utc).isoformat(),
        "duration_minutes": 20,
        "modality": "tDCS",
        "protocol_ref": "F3 → Fp2",
        "session_number": 1,
        "total_sessions": 12,
        "appointment_type": "session",
    }
    if device_id is not None:
        body["device_id"] = device_id
    resp = client.post("/api/v1/sessions", headers=headers, json=body)
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _advance_to_in_progress(client: TestClient, headers: dict[str, str], session_id: str) -> None:
    for status in ("confirmed", "checked_in", "in_progress"):
        resp = client.patch(
            f"/api/v1/sessions/{session_id}",
            headers=headers,
            json={"status": status},
        )
        assert resp.status_code == 200, resp.text


# ── /telemetry ─────────────────────────────────────────────────────────────────


def test_session_telemetry_demo_when_no_device(client: TestClient, auth_headers) -> None:
    """No device_id on the session ⇒ is_demo=True, deterministic stub values."""
    headers = auth_headers["clinician"]
    patient_id = _create_patient(client, headers)
    session_id = _create_session(client, headers, patient_id, device_id=None)

    resp = client.get(f"/api/v1/sessions/{session_id}/telemetry", headers=headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["is_demo"] is True
    assert body["session_id"] == session_id
    # Values present and inside the documented stub ranges.
    assert body["impedance_kohm"] is not None
    assert 2.0 <= body["impedance_kohm"] <= 8.0
    assert body["intensity_pct_rmt"] is not None
    assert 1.0 <= body["intensity_pct_rmt"] <= 3.0
    # Determinism: same id → same numbers.
    resp2 = client.get(f"/api/v1/sessions/{session_id}/telemetry", headers=headers)
    body2 = resp2.json()
    assert body["impedance_kohm"] == body2["impedance_kohm"]
    assert body["intensity_pct_rmt"] == body2["intensity_pct_rmt"]


def test_session_telemetry_real_when_device_attached(client: TestClient, auth_headers) -> None:
    """device_id on the session ⇒ is_demo=False, impedance from latest event."""
    headers = auth_headers["clinician"]
    patient_id = _create_patient(client, headers)
    session_id = _create_session(client, headers, patient_id, device_id="dev-real-123")
    _advance_to_in_progress(client, headers, session_id)

    # Record a real impedance reading.
    imp = client.post(
        f"/api/v1/sessions/{session_id}/impedance",
        headers=headers,
        json={"impedance_kohm": 5.4},
    )
    assert imp.status_code == 201, imp.text

    resp = client.get(f"/api/v1/sessions/{session_id}/telemetry", headers=headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["is_demo"] is False
    assert body["impedance_kohm"] == 5.4


def test_session_telemetry_demo_for_explicit_demo_device(client: TestClient, auth_headers) -> None:
    """device_id=='demo' must still flag is_demo=True (sentinel honesty)."""
    headers = auth_headers["clinician"]
    patient_id = _create_patient(client, headers)
    session_id = _create_session(client, headers, patient_id, device_id="demo")
    resp = client.get(f"/api/v1/sessions/{session_id}/telemetry", headers=headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["is_demo"] is True


# ── /comfort ───────────────────────────────────────────────────────────────────


def test_session_comfort_records_nrs_se_event(client: TestClient, auth_headers) -> None:
    headers = auth_headers["clinician"]
    patient_id = _create_patient(client, headers)
    session_id = _create_session(client, headers, patient_id)

    resp = client.post(
        f"/api/v1/sessions/{session_id}/comfort",
        headers=headers,
        json={"nrs_se": 4, "note": "Patient: 'mild scalp tingling'"},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["type"] == "COMFORT"
    assert body["payload"]["nrs_se"] == 4
    assert "tingling" in (body["payload"].get("note") or "")
    assert "NRS-SE 4/10" in (body["note"] or "")


def test_session_comfort_rejects_out_of_range(client: TestClient, auth_headers) -> None:
    headers = auth_headers["clinician"]
    patient_id = _create_patient(client, headers)
    session_id = _create_session(client, headers, patient_id)

    resp = client.post(
        f"/api/v1/sessions/{session_id}/comfort",
        headers=headers,
        json={"nrs_se": 11},  # over the 0-10 range
    )
    assert resp.status_code == 422, resp.text


# ── /sign ──────────────────────────────────────────────────────────────────────


def test_session_sign_records_signature_event(client: TestClient, auth_headers) -> None:
    headers = auth_headers["clinician"]
    patient_id = _create_patient(client, headers)
    session_id = _create_session(client, headers, patient_id)

    resp = client.post(
        f"/api/v1/sessions/{session_id}/sign",
        headers=headers,
        json={"note": "Reviewed and signed", "is_demo": False},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["type"] == "SIGN"
    assert body["payload"]["signed_by"]
    assert body["payload"]["signed_at"]
    assert body["payload"]["is_demo"] is False
    assert body["payload"].get("note") == "Reviewed and signed"


def test_session_sign_propagates_demo_flag(client: TestClient, auth_headers) -> None:
    """Sign-off must carry is_demo through to the persisted event payload."""
    headers = auth_headers["clinician"]
    patient_id = _create_patient(client, headers)
    session_id = _create_session(client, headers, patient_id)

    resp = client.post(
        f"/api/v1/sessions/{session_id}/sign",
        headers=headers,
        json={"is_demo": True},
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["payload"]["is_demo"] is True


# ── /qeeg-analysis/audit-events surface whitelist ──────────────────────────────


def test_audit_events_accepts_session_runner_surface(client: TestClient, auth_headers) -> None:
    """The Session Runner reuses /audit-events with surface='session_runner'.

    The whitelist is enforced server-side; if this regresses the page-level
    audit log breaks silently. The accepted-surface set is small on purpose.
    """
    headers = auth_headers["clinician"]
    resp = client.post(
        "/api/v1/qeeg-analysis/audit-events",
        headers=headers,
        json={
            "event": "page_loaded",
            "surface": "session_runner",
            "note": "courses=2 demo=false",
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["accepted"] is True
    assert body["event_id"].startswith("session_runner-page_loaded-")


def test_audit_events_rejects_unknown_surface_falls_back_to_qeeg(client: TestClient, auth_headers) -> None:
    """Unknown surface strings must fall back to 'qeeg' (no arbitrary user input)."""
    headers = auth_headers["clinician"]
    resp = client.post(
        "/api/v1/qeeg-analysis/audit-events",
        headers=headers,
        json={
            "event": "page_loaded",
            "surface": "evil_surface_<script>",
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["event_id"].startswith("qeeg-page_loaded-")
