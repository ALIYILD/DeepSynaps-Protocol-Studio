from __future__ import annotations

import uuid

from app.database import SessionLocal
from app.persistence.models import Clinic, Patient, User


def test_patient_linked_specialized_genomics_requires_consent(client) -> None:
    db = SessionLocal()
    try:
        clinic_id = f"clinic-sg-{uuid.uuid4().hex[:8]}"
        clinician_id = f"clin-sg-{uuid.uuid4().hex[:8]}"
        patient_id = f"pt-sg-{uuid.uuid4().hex[:8]}"
        db.add(Clinic(id=clinic_id, name="SG Clinic"))
        db.flush()
        db.add(
            User(
                id=clinician_id,
                email=f"{clinician_id}@example.com",
                display_name="SG Clinician",
                hashed_password="x",
                role="clinician",
                package_id="clinician_pro",
                clinic_id=clinic_id,
            )
        )
        db.add(
            Patient(
                id=patient_id,
                clinician_id=clinician_id,
                first_name="Spec",
                last_name="Genomics",
                email=f"{patient_id}@example.com",
                consent_signed=False,
                status="active",
            )
        )
        db.commit()
    finally:
        db.close()

    from app.services.auth_service import create_access_token

    token = create_access_token(
        user_id=clinician_id,
        email=f"{clinician_id}@example.com",
        role="clinician",
        package_id="clinician_pro",
        clinic_id=clinic_id,
    )

    res = client.post(
        "/api/v1/specialized-genomics/query",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "disease_focus": "epilepsy",
            "gene_symbol": "SCN1A",
            "patient_id": patient_id,
        },
    )
    assert res.status_code == 403
    body = res.json()
    assert body["code"] == "consent_missing"
