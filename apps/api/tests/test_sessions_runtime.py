from __future__ import annotations

from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import AdverseEvent, ClinicalSession, DeviceSessionLog, DeliveredSessionParameters, TreatmentCourse, WearableDailySummary


def _create_patient(client: TestClient, headers: dict[str, str]) -> str:
    resp = client.post(
        "/api/v1/patients",
        headers=headers,
        json={
            "first_name": "Samantha",
            "last_name": "Li",
            "primary_condition": "MDD",
            "primary_modality": "tDCS",
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _create_session(client: TestClient, headers: dict[str, str], patient_id: str) -> str:
    resp = client.post(
        "/api/v1/sessions",
        headers=headers,
        json={
            "patient_id": patient_id,
            "scheduled_at": datetime.now(timezone.utc).isoformat(),
            "duration_minutes": 20,
            "modality": "tDCS",
            "protocol_ref": "F3 → Fp2",
            "session_number": 12,
            "total_sessions": 20,
            "appointment_type": "consultation",
        },
    )
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


def test_live_session_runtime_endpoints(client: TestClient, auth_headers) -> None:
    headers = auth_headers["clinician"]
    patient_id = _create_patient(client, headers)
    session_id = _create_session(client, headers, patient_id)
    _advance_to_in_progress(client, headers, session_id)

    db = SessionLocal()
    try:
        db.add(
            TreatmentCourse(
                id="course-1",
                patient_id=patient_id,
                clinician_id="demo-clinician",
                protocol_id="PRO-003",
                condition_slug="major-depressive-disorder",
                modality_slug="tDCS",
                target_region="Left DLPFC",
                planned_sessions_total=20,
                planned_session_duration_minutes=20,
                planned_intensity="2 mA",
                coil_placement="Anode at F3; Cathode at Fp2",
                status="active",
            )
        )
        db.add(
            DeliveredSessionParameters(
                session_id=session_id,
                course_id="course-1",
                coil_position="F3 → Fp2",
                montage="F3 → Fp2",
                intensity_pct_rmt="2.0 mA",
                duration_minutes=20,
            )
        )
        db.commit()
    finally:
        db.close()

    resp = client.post(
        f"/api/v1/sessions/{session_id}/impedance",
        headers=headers,
        json={"impedance_kohm": 4.8},
    )
    assert resp.status_code == 201, resp.text

    resp = client.post(
        f"/api/v1/sessions/{session_id}/events",
        headers=headers,
        json={"type": "CHECK", "note": "5-min side-effect check"},
    )
    assert resp.status_code == 201, resp.text

    resp = client.post(
        f"/api/v1/sessions/{session_id}/events",
        headers=headers,
        json={"type": "AE", "note": "headache reported · level 5/10", "payload": {"event_type": "headache", "severity": "moderate", "level": 5}},
    )
    assert resp.status_code == 201, resp.text

    resp = client.post(
        f"/api/v1/sessions/{session_id}/events",
        headers=headers,
        json={"type": "CHECKLIST", "note": "Completed: Post-stim vitals + debrief", "payload": {"checklist_id": "postvitals", "label": "Post-stim vitals + debrief", "done": True}},
    )
    assert resp.status_code == 201, resp.text

    resp = client.post(
        f"/api/v1/sessions/{session_id}/events",
        headers=headers,
        json={"type": "OPER", "note": "Session paused by operator", "payload": {"action": "pause", "paused": True}},
    )
    assert resp.status_code == 201, resp.text

    resp = client.post(
        f"/api/v1/sessions/{session_id}/events",
        headers=headers,
        json={"type": "OPER", "note": "Session resumed", "payload": {"action": "resume", "paused": False}},
    )
    assert resp.status_code == 201, resp.text

    resp = client.get("/api/v1/sessions/current", headers=headers)
    assert resp.status_code == 200, resp.text
    current = resp.json()
    assert current["id"] == session_id
    assert current["patient_name"] == "Samantha Li"
    assert current["phase"] == "stim"
    assert current["impedance_kohm"] == 4.8
    assert current["montage"] == "F3 → Fp2"
    assert current["target_region"] == "Left DLPFC"
    assert current["intensity_mA"] == 2.0

    resp = client.get(f"/api/v1/sessions/{session_id}/events", headers=headers)
    assert resp.status_code == 200, resp.text
    events = resp.json()
    assert len(events) >= 2
    assert events[0]["type"] in {"CHECK", "IMPEDANCE"}

    resp = client.post(
        f"/api/v1/sessions/{session_id}/phase",
        headers=headers,
        json={"phase": "ramp_dn"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["phase"] == "ramp_dn"

    resp = client.post(f"/api/v1/sessions/{session_id}/video/start", headers=headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["active"] is True
    assert resp.json()["room_name"] == f"ds-live-{session_id}"

    resp = client.post(f"/api/v1/sessions/{session_id}/video/end", headers=headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["active"] is False

    resp = client.post(
        f"/api/v1/sessions/{session_id}/phase",
        headers=headers,
        json={"phase": "ended"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "completed"

    db = SessionLocal()
    try:
        db.add(
            WearableDailySummary(
                patient_id=patient_id,
                source="fitbit",
                date=datetime.now(timezone.utc).date().isoformat(),
                hrv_ms=58.0,
                synced_at=datetime.now(timezone.utc),
            )
        )
        db.add(
            DeviceSessionLog(
                assignment_id="assign-1",
                patient_id=patient_id,
                session_date=datetime.now(timezone.utc).date().isoformat(),
                completed=True,
                status="reviewed",
            )
        )
        db.commit()
        ae = db.query(AdverseEvent).filter_by(session_id=session_id, event_type="headache").first()
        assert ae is not None
        assert ae.severity == "moderate"
        delivered = db.query(DeliveredSessionParameters).filter_by(session_id=session_id).first()
        assert delivered is not None
        assert delivered.course_id == "course-1"
        assert delivered.checklist_json is not None
        assert delivered.interruptions is True
        assert delivered.interruption_reason is not None
        assert "paused" in delivered.interruption_reason.lower()
        course = db.query(TreatmentCourse).filter_by(id="course-1").first()
        assert course is not None
        assert course.sessions_delivered == 1
        session_row = db.query(ClinicalSession).filter_by(id=session_id).first()
        assert session_row is not None
        assert session_row.status == "completed"
        assert session_row.session_notes is not None
        assert "Post-stim vitals + debrief" in session_row.session_notes
        assert session_row.adverse_events is not None
        assert "headache reported" in session_row.adverse_events
    finally:
        db.close()

    resp = client.get(f"/api/v1/sessions/{session_id}/remote-monitor-snapshot", headers=headers)
    assert resp.status_code == 200, resp.text
    snap = resp.json()
    assert snap["hrv"] == 58.0
    assert snap["impedance"] == 4.8
    assert snap["adherence"] == "OK"
