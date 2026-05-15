"""Batch sign-status endpoint — tenant scope and event semantics (Intervention Analyzer rename)."""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import (
    ClinicalSession,
    ClinicalSessionEvent,
    DeliveredSessionParameters,
    TreatmentCourse,
)


def _create_patient(client: TestClient, headers: dict[str, str]) -> str:
    resp = client.post(
        "/api/v1/patients",
        headers=headers,
        json={
            "first_name": "IA",
            "last_name": "Batch",
            "primary_condition": "MDD",
            "primary_modality": "TMS",
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _create_session_row(db, patient_id: str, session_id: str) -> None:
    db.add(
        ClinicalSession(
            id=session_id,
            patient_id=patient_id,
            clinician_id="actor-clinician-demo",
            scheduled_at=datetime.now(timezone.utc).isoformat(),
            duration_minutes=30,
            appointment_type="session",
            status="completed",
        )
    )


def _create_course_and_log(
    db, patient_id: str, course_id: str, session_id: str, clinician_id: str = "actor-clinician-demo"
) -> None:
    db.add(
        TreatmentCourse(
            id=course_id,
            patient_id=patient_id,
            clinician_id=clinician_id,
            protocol_id="PRO-BATCH-1",
            condition_slug="mdd",
            modality_slug="TMS",
            target_region="DLPFC",
            planned_sessions_total=10,
            planned_session_duration_minutes=30,
            planned_intensity="120",
            coil_placement="F3",
            status="active",
        )
    )
    db.add(
        DeliveredSessionParameters(
            session_id=session_id,
            course_id=course_id,
            coil_position="F3",
            intensity_pct_rmt="100",
            duration_minutes=30,
        )
    )


def _post_batch(
    client: TestClient, headers: dict[str, str], **kwargs
) -> object:
    return client.post(
        "/api/v1/intervention/sign-status/batch",
        headers=headers,
        json=kwargs,
    )


def test_batch_sign_pending_no_events(client: TestClient, auth_headers) -> None:
    h = auth_headers["clinician"]
    patient_id = _create_patient(client, h)
    session_id = str(uuid.uuid4())
    course_id = f"course-{uuid.uuid4().hex[:8]}"
    db = SessionLocal()
    try:
        _create_session_row(db, patient_id, session_id)
        _create_course_and_log(db, patient_id, course_id, session_id)
        db.commit()
    finally:
        db.close()

    resp = _post_batch(client, h, course_ids=[course_id])
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert len(data["items"]) == 1
    assert data["items"][0]["session_id"] == session_id
    assert data["items"][0]["sign_status"] == "pending"
    assert data["items"][0]["missing_reason"] == "no_events"


def test_batch_signed_when_sign_event_exists(client: TestClient, auth_headers) -> None:
    h = auth_headers["clinician"]
    patient_id = _create_patient(client, h)
    session_id = str(uuid.uuid4())
    course_id = f"course-{uuid.uuid4().hex[:8]}"
    db = SessionLocal()
    try:
        _create_session_row(db, patient_id, session_id)
        _create_course_and_log(db, patient_id, course_id, session_id)
        db.add(
            ClinicalSessionEvent(
                session_id=session_id,
                clinician_id="actor-clinician-demo",
                actor_id="actor-clinician-demo",
                event_type="SIGN",
                note="Signed",
                payload_json=json.dumps({"signed_by": "actor-clinician-demo", "signed_at": datetime.now(timezone.utc).isoformat()}),
            )
        )
        db.commit()
    finally:
        db.close()

    resp = _post_batch(client, h, course_ids=[course_id])
    assert resp.status_code == 200, resp.text
    item = resp.json()["items"][0]
    assert item["sign_status"] == "signed"
    assert item["signed_by"] == "actor-clinician-demo"
    assert item["missing_reason"] is None


def test_batch_signed_by_falls_back_to_actor_when_payload_value_blank(client: TestClient, auth_headers) -> None:
    h = auth_headers["clinician"]
    patient_id = _create_patient(client, h)
    session_id = str(uuid.uuid4())
    course_id = f"course-{uuid.uuid4().hex[:8]}"
    db = SessionLocal()
    try:
        _create_session_row(db, patient_id, session_id)
        _create_course_and_log(db, patient_id, course_id, session_id)
        db.add(
            ClinicalSessionEvent(
                session_id=session_id,
                clinician_id="actor-clinician-demo",
                actor_id="actor-clinician-demo",
                event_type="SIGN",
                note="Signed",
                payload_json=json.dumps({"signed_by": "   "}),
            )
        )
        db.commit()
    finally:
        db.close()

    resp = _post_batch(client, h, course_ids=[course_id])
    assert resp.status_code == 200, resp.text
    item = resp.json()["items"][0]
    assert item["sign_status"] == "signed"
    assert item["signed_by"] == "actor-clinician-demo"


def test_guest_denied(client: TestClient, auth_headers) -> None:
    resp = _post_batch(client, auth_headers["guest"], course_ids=["any"])
    assert resp.status_code == 403


def test_patient_denied(client: TestClient, auth_headers) -> None:
    resp = _post_batch(client, auth_headers["patient"], course_ids=["any"])
    assert resp.status_code == 403


def test_batch_limit_enforced(client: TestClient, auth_headers) -> None:
    large = ["x"] * 101
    resp = _post_batch(client, auth_headers["clinician"], course_ids=large)
    assert resp.status_code == 422


def test_empty_body_rejected(client: TestClient, auth_headers) -> None:
    resp = _post_batch(client, auth_headers["clinician"])
    assert resp.status_code == 422


def test_whitespace_only_ids_rejected_as_empty_batch(client: TestClient, auth_headers) -> None:
    resp = _post_batch(
        client,
        auth_headers["clinician"],
        course_ids=["   "],
        session_ids=["\n\t"],
    )
    assert resp.status_code == 422, resp.text
    assert resp.json()["code"] == "empty_batch"


def test_course_aggregate_counts(client: TestClient, auth_headers) -> None:
    h = auth_headers["clinician"]
    patient_id = _create_patient(client, h)
    s1 = str(uuid.uuid4())
    s2 = str(uuid.uuid4())
    course_id = f"course-{uuid.uuid4().hex[:8]}"
    db = SessionLocal()
    try:
        _create_session_row(db, patient_id, s1)
        _create_session_row(db, patient_id, s2)
        _create_course_and_log(db, patient_id, course_id, s1)
        db.add(
            DeliveredSessionParameters(
                session_id=s2,
                course_id=course_id,
                coil_position="F3",
                intensity_pct_rmt="100",
                duration_minutes=30,
            )
        )
        db.add(
            ClinicalSessionEvent(
                session_id=s1,
                clinician_id="actor-clinician-demo",
                actor_id="actor-clinician-demo",
                event_type="SIGN",
                note="ok",
                payload_json="{}",
            )
        )
        db.commit()
    finally:
        db.close()

    resp = _post_batch(client, h, course_ids=[course_id])
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["summary"]["returned_count"] == 2
    assert data["summary"]["signed_count"] == 1
    assert data["summary"]["pending_count"] == 1
    crs = {c["course_id"]: c for c in data["courses"]}
    assert crs[course_id]["session_count"] == 2
    assert crs[course_id]["signed_count"] == 1
    assert crs[course_id]["pending_count"] == 1


def test_random_session_id_not_exposed(client: TestClient, auth_headers) -> None:
    """Invalid ids are omitted — no error body that leaks existence across clinics."""
    fake = str(uuid.uuid4())
    resp = _post_batch(client, auth_headers["clinician"], session_ids=[fake])
    assert resp.status_code == 200
    assert resp.json()["items"] == []


def test_padded_ids_are_trimmed_before_lookup(client: TestClient, auth_headers) -> None:
    h = auth_headers["clinician"]
    patient_id = _create_patient(client, h)
    session_id = str(uuid.uuid4())
    course_id = f"course-{uuid.uuid4().hex[:8]}"
    db = SessionLocal()
    try:
        _create_session_row(db, patient_id, session_id)
        _create_course_and_log(db, patient_id, course_id, session_id)
        db.commit()
    finally:
        db.close()

    resp = _post_batch(
        client,
        h,
        course_ids=[f"  {course_id}  "],
        session_ids=[f"  {session_id}  "],
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert len(data["items"]) == 1
    assert data["items"][0]["session_id"] == session_id
    assert data["items"][0]["course_id"] == course_id


def test_other_clinicians_course_omitted(client: TestClient, auth_headers) -> None:
    """Clinician token cannot batch SIGN rows for a course owned by another clinician_id."""
    h = auth_headers["clinician"]
    patient_id = _create_patient(client, h)
    session_id = str(uuid.uuid4())
    course_id = f"course-{uuid.uuid4().hex[:8]}"
    db = SessionLocal()
    try:
        _create_session_row(db, patient_id, session_id)
        _create_course_and_log(
            db,
            patient_id,
            course_id,
            session_id,
            clinician_id="other-clinician-not-demo",
        )
        db.commit()
    finally:
        db.close()

    resp = _post_batch(client, h, course_ids=[course_id], session_ids=[session_id])
    assert resp.status_code == 200, resp.text
    assert resp.json()["items"] == []


def test_admin_can_read_course_owned_by_peer(client: TestClient, auth_headers) -> None:
    """Admin may request batch for another clinician's course (same as course list admin rule)."""
    h = auth_headers["clinician"]
    patient_id = _create_patient(client, h)
    session_id = str(uuid.uuid4())
    course_id = f"course-{uuid.uuid4().hex[:8]}"
    db = SessionLocal()
    try:
        _create_session_row(db, patient_id, session_id)
        _create_course_and_log(
            db,
            patient_id,
            course_id,
            session_id,
            clinician_id="other-clinician-not-demo",
        )
        db.commit()
    finally:
        db.close()

    resp = _post_batch(client, auth_headers["admin"], course_ids=[course_id])
    assert resp.status_code == 200, resp.text
    assert len(resp.json()["items"]) == 1


def test_batch_reviewed_by_falls_back_to_actor_when_payload_value_blank(client: TestClient, auth_headers) -> None:
    h = auth_headers["clinician"]
    patient_id = _create_patient(client, h)
    session_id = str(uuid.uuid4())
    course_id = f"course-{uuid.uuid4().hex[:8]}"
    db = SessionLocal()
    try:
        _create_session_row(db, patient_id, session_id)
        _create_course_and_log(db, patient_id, course_id, session_id)
        db.add(
            ClinicalSessionEvent(
                session_id=session_id,
                clinician_id="actor-clinician-demo",
                actor_id="actor-clinician-demo",
                event_type="REVIEW",
                note="Reviewed",
                payload_json=json.dumps({"reviewed_by": "   "}),
            )
        )
        db.commit()
    finally:
        db.close()

    resp = _post_batch(client, h, course_ids=[course_id])
    assert resp.status_code == 200, resp.text
    item = resp.json()["items"][0]
    assert item["review_status"] == "reviewed"
    assert item["reviewed_by"] == "actor-clinician-demo"
    assert resp.json()["items"][0]["sign_status"] == "pending"


def test_review_event_sets_review_status(client: TestClient, auth_headers) -> None:
    h = auth_headers["clinician"]
    patient_id = _create_patient(client, h)
    session_id = str(uuid.uuid4())
    course_id = f"course-{uuid.uuid4().hex[:8]}"
    db = SessionLocal()
    try:
        _create_session_row(db, patient_id, session_id)
        _create_course_and_log(db, patient_id, course_id, session_id)
        db.add(
            ClinicalSessionEvent(
                session_id=session_id,
                clinician_id="actor-clinician-demo",
                actor_id="actor-clinician-demo",
                event_type="SIGN",
                note="Signed",
                payload_json="{}",
            )
        )
        db.add(
            ClinicalSessionEvent(
                session_id=session_id,
                clinician_id="actor-clinician-demo",
                actor_id="actor-clinician-demo",
                event_type="REVIEW",
                note="Chart reviewed",
                payload_json=json.dumps({"reviewed_by": "actor-clinician-demo"}),
            )
        )
        db.commit()
    finally:
        db.close()

    resp = _post_batch(client, h, course_ids=[course_id])
    assert resp.status_code == 200, resp.text
    item = resp.json()["items"][0]
    assert item["sign_status"] == "signed"
    assert item["review_status"] == "reviewed"


# ---------------------------------------------------------------------------
# Performance path: verify batch does not trigger per-session N+1
# ---------------------------------------------------------------------------

def test_batch_with_many_sessions_is_single_query(client: TestClient, auth_headers) -> None:
    """Batch endpoint must resolve all statuses in one request, not N per-session calls."""
    h = auth_headers["clinician"]
    patient_id = _create_patient(client, h)
    course_id = f"course-perf-{uuid.uuid4().hex[:8]}"
    db = SessionLocal()
    session_ids = []
    try:
        for _ in range(10):
            sid = str(uuid.uuid4())
            session_ids.append(sid)
            _create_session_row(db, patient_id, sid)
            db.add(
                DeliveredSessionParameters(
                    session_id=sid,
                    course_id=course_id,
                    coil_position="F3",
                    intensity_pct_rmt="100",
                    duration_minutes=30,
                )
            )
        db.commit()
    finally:
        db.close()

    resp = _post_batch(client, h, course_ids=[course_id])
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["summary"]["returned_count"] == 10
    # All statuses resolved in a single API call
    assert len(data["items"]) == 10
    for item in data["items"]:
        assert "sign_status" in item
