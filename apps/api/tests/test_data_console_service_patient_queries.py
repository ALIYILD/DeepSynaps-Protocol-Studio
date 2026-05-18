from __future__ import annotations

from app.database import SessionLocal
from app.persistence.models import AuditEventRecord, Patient
from app.services.data_console_service import (
    get_patient_data_summary,
    get_patient_rows,
)


def _seed_patient(session, patient_id: str) -> None:
    session.add(
        Patient(
            id=patient_id,
            clinician_id="actor-clinician-demo",
            first_name="Alice",
            last_name="Example",
            dob="1985-03-15",
            email="alice@example.com",
            phone="555-1234",
            status="active",
        )
    )


def test_get_patient_rows_reads_patients_table_by_primary_key(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.services.data_console_service.require_patient_access",
        lambda session, actor_user_id, patient_id: None,
    )
    monkeypatch.setattr(
        "app.services.data_console_service.log_phi_access",
        lambda **kwargs: None,
    )

    session = SessionLocal()
    try:
        _seed_patient(session, "patient-console-1")
        session.commit()

        rows = get_patient_rows(
            session=session,
            actor_user_id="actor-clinician-demo",
            patient_id="patient-console-1",
            table_name="patients",
        )
    finally:
        session.close()

    assert len(rows) == 1
    assert rows[0]["id"] == "patient-console-1"
    assert rows[0]["first_name"] == "***"
    assert rows[0]["last_name"] == "***"
    assert rows[0]["dob"] == "***-***-****"


def test_get_patient_data_summary_counts_patients_and_audit_alias(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.services.data_console_service.require_patient_access",
        lambda session, actor_user_id, patient_id: None,
    )

    session = SessionLocal()
    try:
        _seed_patient(session, "patient-console-2")
        session.add_all(
            [
                AuditEventRecord(
                    event_id="audit-console-1",
                    target_id="patient-console-2",
                    target_type="patient",
                    action="view_rows",
                    role="clinician",
                    actor_id="actor-clinician-demo",
                    note="opened patient console",
                    created_at="2026-05-18T00:00:00Z",
                ),
                AuditEventRecord(
                    event_id="audit-console-2",
                    target_id="patient-console-2",
                    target_type="patient",
                    action="export_rows",
                    role="clinician",
                    actor_id="actor-clinician-demo",
                    note="exported patient console",
                    created_at="2026-05-18T00:05:00Z",
                ),
            ]
        )
        session.commit()

        summary = get_patient_data_summary(
            session=session,
            actor_user_id="actor-clinician-demo",
            patient_id="patient-console-2",
        )
    finally:
        session.close()

    assert summary["patients"] == 1
    assert summary["audit_event_records"] == 2
