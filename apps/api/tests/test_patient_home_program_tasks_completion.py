import json
from datetime import datetime, timezone

from app.persistence.models import ClinicianHomeProgramTask, Patient, PatientHomeProgramTaskCompletion


def _mk_patient(db, *, email="patient@demo.com"):
    p = Patient(
        id="pt-1",
        clinician_id="actor-clinician-demo",
        first_name="Jane",
        last_name="Patient",
        email=email,
        status="active",
    )
    db.add(p)
    db.commit()
    return p


def _mk_task(db, *, patient_id, clinician_id="actor-clinician-demo"):
    t = ClinicianHomeProgramTask(
        id="task-ext-1",
        server_task_id="11111111-1111-1111-1111-111111111111",
        patient_id=patient_id,
        clinician_id=clinician_id,
        task_json=json.dumps(
            {
                "id": "task-ext-1",
                "patientId": patient_id,
                "title": "Breathing practice",
                "category": "breathing",
                "instructions": "Do 5 minutes box breathing.",
                "homeProgramSelection": {"conditionSlug": "insomnia"},
            }
        ),
        revision=1,
    )
    db.add(t)
    db.commit()
    return t


def test_patient_can_list_home_program_tasks(client, auth_headers):
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        p = _mk_patient(db)
        _mk_task(db, patient_id=p.id)
    finally:
        db.close()

    r = client.get("/api/v1/patient-portal/home-program-tasks", headers=auth_headers["patient"])
    assert r.status_code == 200
    items = r.json()
    assert isinstance(items, list)
    assert items and items[0]["server_task_id"] == "11111111-1111-1111-1111-111111111111"


def test_patient_can_submit_completion_and_read_back(client, auth_headers):
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        p = _mk_patient(db)
        _mk_task(db, patient_id=p.id)
    finally:
        db.close()

    body = {"completed": True, "rating": 5, "difficulty": 2, "feedback_text": "Helped a lot."}
    r = client.post(
        "/api/v1/patient-portal/home-program-tasks/11111111-1111-1111-1111-111111111111/complete",
        headers=auth_headers["patient"],
        json=body,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["completed"] is True
    assert data["rating"] == 5

    r2 = client.get(
        "/api/v1/patient-portal/home-program-tasks/11111111-1111-1111-1111-111111111111/completion",
        headers=auth_headers["patient"],
    )
    assert r2.status_code == 200
    data2 = r2.json()
    assert data2["rating"] == 5


def test_patient_rating_bounds_validated(client, auth_headers):
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        p = _mk_patient(db)
        _mk_task(db, patient_id=p.id)
    finally:
        db.close()

    r = client.post(
        "/api/v1/patient-portal/home-program-tasks/11111111-1111-1111-1111-111111111111/complete",
        headers=auth_headers["patient"],
        json={"completed": True, "rating": 9},
    )
    assert r.status_code == 422


def test_clinician_can_list_completions(client, auth_headers):
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        p = _mk_patient(db)
        _mk_task(db, patient_id=p.id)
        c = PatientHomeProgramTaskCompletion(
            id="c1",
            server_task_id="11111111-1111-1111-1111-111111111111",
            patient_id=p.id,
            clinician_id="actor-clinician-demo",
            completed=True,
            completed_at=datetime.now(timezone.utc),
            feedback_text="ok",
            feedback_json="{}",
        )
        db.add(c)
        db.commit()
    finally:
        db.close()

    r = client.get("/api/v1/home-program-tasks/completions", headers=auth_headers["clinician"])
    assert r.status_code == 200
    items = r.json()
    assert items and items[0]["server_task_id"] == "11111111-1111-1111-1111-111111111111"
