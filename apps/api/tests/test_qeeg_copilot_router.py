"""Auth gate regression tests for the qEEG Copilot WebSocket.

The /api/v1/qeeg-copilot/{analysis_id} WS used to be unauthenticated —
anyone with an analysis_id could open the socket, read the welcome
payload (qEEG features, recommendations), and stream LLM queries.
After the audit, the WS requires a valid `?token=<jwt>` query param
AND a cross-clinic ownership match.
"""
from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.persistence.models import Clinic, Patient, QEEGAnalysis, User


def _seed(db: Session) -> dict:
    clinic_a = Clinic(id=str(uuid.uuid4()), name="Copilot Clinic A")
    clinic_b = Clinic(id=str(uuid.uuid4()), name="Copilot Clinic B")
    db.add_all([clinic_a, clinic_b])
    db.flush()
    clin_a = User(
        id=str(uuid.uuid4()),
        email=f"cop_a_{uuid.uuid4().hex[:6]}@example.com",
        display_name="Cop A",
        hashed_password="x",
        role="clinician",
        package_id="explorer",
        clinic_id=clinic_a.id,
    )
    clin_b = User(
        id=str(uuid.uuid4()),
        email=f"cop_b_{uuid.uuid4().hex[:6]}@example.com",
        display_name="Cop B",
        hashed_password="x",
        role="clinician",
        package_id="explorer",
        clinic_id=clinic_b.id,
    )
    db.add_all([clin_a, clin_b])
    db.flush()
    patient = Patient(
        id=str(uuid.uuid4()),
        clinician_id=clin_a.id,
        first_name="Cop",
        last_name="Patient",
    )
    db.add(patient)
    db.flush()
    analysis = QEEGAnalysis(
        id=str(uuid.uuid4()),
        patient_id=patient.id,
        clinician_id=clin_a.id,
        analysis_status="completed",
    )
    db.add(analysis)
    db.commit()
    return {
        "analysis_id": analysis.id,
        "clin_a_id": clin_a.id,
        "clin_b_id": clin_b.id,
        "clinic_a_id": clinic_a.id,
        "clinic_b_id": clinic_b.id,
    }


def _mint_token(user_id: str, role: str, clinic_id: str | None) -> str:
    from app.services.auth_service import create_access_token
    return create_access_token(
        user_id=user_id,
        email=f"{user_id}@example.com",
        role=role,
        package_id="explorer",
        clinic_id=clinic_id,
    )


@pytest.fixture
def copilot_setup() -> dict:
    db: Session = SessionLocal()
    try:
        return _seed(db)
    finally:
        db.close()


def test_copilot_ws_rejects_no_token(client: TestClient, copilot_setup: dict) -> None:
    aid = copilot_setup["analysis_id"]
    with client.websocket_connect(f"/api/v1/qeeg-copilot/{aid}") as ws:
        msg = ws.receive_json()
        assert msg["type"] == "error"
        assert "Authentication" in msg["content"]


def test_copilot_ws_rejects_cross_clinic(client: TestClient, copilot_setup: dict) -> None:
    aid = copilot_setup["analysis_id"]
    bad_token = _mint_token(
        copilot_setup["clin_b_id"], "clinician", copilot_setup["clinic_b_id"]
    )
    with client.websocket_connect(
        f"/api/v1/qeeg-copilot/{aid}?token={bad_token}"
    ) as ws:
        msg = ws.receive_json()
        assert msg["type"] == "error"
        assert "Access denied" in msg["content"]


def test_copilot_ws_accepts_owning_clinician(
    client: TestClient, copilot_setup: dict
) -> None:
    aid = copilot_setup["analysis_id"]
    good_token = _mint_token(
        copilot_setup["clin_a_id"], "clinician", copilot_setup["clinic_a_id"]
    )
    with client.websocket_connect(
        f"/api/v1/qeeg-copilot/{aid}?token={good_token}"
    ) as ws:
        msg = ws.receive_json()
        assert msg["type"] == "welcome"
        assert msg["analysis_id"] == aid


def test_copilot_ws_rejects_guest_role(
    client: TestClient, copilot_setup: dict
) -> None:
    aid = copilot_setup["analysis_id"]
    with client.websocket_connect(
        f"/api/v1/qeeg-copilot/{aid}?token=guest-demo-token"
    ) as ws:
        msg = ws.receive_json()
        assert msg["type"] == "error"
        assert "Authentication" in msg["content"]
