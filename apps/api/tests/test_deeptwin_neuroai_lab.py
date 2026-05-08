"""HTTP tests for research-only NeuroAI Lab preview routes and audit persistence."""

from __future__ import annotations

import json
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.database import SessionLocal
from app.persistence.models import AuditEventRecord


def test_neuroai_status_public(client: TestClient) -> None:
    r = client.get("/api/v1/deeptwin/neuroai/status")
    assert r.status_code == 200
    body = r.json()
    assert body.get("research_only") is True
    assert body.get("clinical_prediction_enabled") is False


def test_timeline_preview_guest_ok(client: TestClient) -> None:
    payload = {
        "patient_id": "pt-test",
        "events": [
            {
                "event_id": "e1",
                "patient_id": "pt-test",
                "event_type": "observation",
                "modality": "qeeg",
                "timestamp": "2024-06-01T12:00:00Z",
                "source": "test",
                "payload": {"band_power": {"alpha": 0.5}},
                "research_only": True,
            }
        ],
    }
    r = client.post("/api/v1/deeptwin/neuroai/timeline/preview", json=payload)
    assert r.status_code == 200
    data = r.json()
    assert "summary" in data
    assert data["envelope"]["research_only"] is True


def test_simulation_preview_blocked_for_patient(client: TestClient, auth_headers: dict) -> None:
    r = client.post(
        "/api/v1/deeptwin/neuroai/simulation/preview",
        json={"patient_id": "pt-x", "baseline_events": []},
        headers=auth_headers["patient"],
    )
    assert r.status_code == 403


def test_simulation_preview_ok_for_clinician(client: TestClient, auth_headers: dict) -> None:
    r = client.post(
        "/api/v1/deeptwin/neuroai/simulation/preview",
        json={
            "patient_id": "pt-x",
            "baseline_events": [],
            "proposed_intervention": {
                "intervention_type": "tDCS",
                "target": "M1",
                "duration_minutes": 20,
                "clinician_approved": True,
            },
        },
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    body = r.json()
    assert body["result"]["clinician_review_required"] is True
    assert body["result"]["no_parameter_change_recommendation"] is True


def _count_neuroai_lab_audits() -> int:
    db = SessionLocal()
    try:
        n = db.scalar(
            select(func.count()).select_from(AuditEventRecord).where(
                AuditEventRecord.target_type == "deeptwin_neuroai_lab"
            )
        )
        return int(n or 0)
    finally:
        db.close()


def _latest_neuroai_lab_audits(limit: int = 5) -> list[AuditEventRecord]:
    db = SessionLocal()
    try:
        return list(
            db.scalars(
                select(AuditEventRecord)
                .where(AuditEventRecord.target_type == "deeptwin_neuroai_lab")
                .order_by(AuditEventRecord.id.desc())
                .limit(limit)
            ).all()
        )
    finally:
        db.close()


def _assert_note_has_no_phi_leak(note: str, *, forbidden_literals: list[str]) -> None:
    lowered = note.lower()
    for lit in forbidden_literals:
        assert lit.lower() not in lowered, f"audit note must not contain {lit!r}"
    # Obvious structured-leak patterns we never store in NeuroAI Lab audit notes.
    assert "band_power" not in note
    assert '"payload"' not in note
    assert "@example.com" not in note
    assert ".edf" not in lowered
    assert ".csv" not in lowered


def test_timeline_preview_persists_audit_row(client: TestClient, auth_headers: dict) -> None:
    before = _count_neuroai_lab_audits()
    secret_phi = "NEUROAI_AUDIT_LEAK_SECRET_ABC999"
    payload = {
        "patient_id": "pt-audit-timeline",
        "events": [
            {
                "event_id": "evt-leak-check",
                "patient_id": "pt-audit-timeline",
                "event_type": "observation",
                "modality": "clinical_note",
                "timestamp": "2024-06-02T12:00:00Z",
                "source": "unit_test",
                "payload": {
                    "free_text": secret_phi,
                    "band_power": {"theta": 9.99},
                    "attachment": "scan_upload_secret_file_xyz.edf",
                },
                "research_only": True,
            }
        ],
    }
    r = client.post(
        "/api/v1/deeptwin/neuroai/timeline/preview",
        json=payload,
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    after = _count_neuroai_lab_audits()
    assert after == before + 1
    row = _latest_neuroai_lab_audits(1)[0]
    assert row.target_type == "deeptwin_neuroai_lab"
    assert row.action == "neuroai_lab.timeline_preview"
    meta = json.loads(row.note)
    assert meta == {"event_count": 1}
    _assert_note_has_no_phi_leak(row.note, forbidden_literals=[secret_phi, "scan_upload_secret_file"])


def test_features_preview_persists_audit_row(client: TestClient, auth_headers: dict) -> None:
    before = _count_neuroai_lab_audits()
    leak = "FEATURE_AUDIT_LEAK_SECRET_DEF888"
    payload = {
        "events": [
            {
                "event_id": "f1",
                "modality": "assessment",
                "timestamp": "2024-06-03T12:00:00Z",
                "event_type": "assessment",
                "payload": {
                    "scale_name": "PHQ-9",
                    "score": 14,
                    "clinician_comment": leak,
                },
                "research_only": True,
            }
        ],
    }
    r = client.post(
        "/api/v1/deeptwin/neuroai/features/preview",
        json=payload,
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    assert _count_neuroai_lab_audits() == before + 1
    row = _latest_neuroai_lab_audits(1)[0]
    assert row.action == "neuroai_lab.features_preview"
    meta = json.loads(row.note)
    assert meta == {"event_count": 1}
    _assert_note_has_no_phi_leak(row.note, forbidden_literals=[leak, "clinician_comment", "PHQ-9"])


def test_simulation_preview_persists_audit_row(client: TestClient, auth_headers: dict) -> None:
    before = _count_neuroai_lab_audits()
    r = client.post(
        "/api/v1/deeptwin/neuroai/simulation/preview",
        json={
            "patient_id": "pt-sim-audit",
            "baseline_events": [
                {
                    "event_id": "b1",
                    "modality": "qeeg",
                    "timestamp": "2024-01-01T12:00:00Z",
                    "event_type": "recording",
                    "payload": {"SUPER_SECRET_BASELINE": "should_not_appear_in_audit"},
                    "research_only": True,
                }
            ],
            "proposed_intervention": {
                "intervention_type": "tDCS",
                "target": "DLPFC",
                "duration_minutes": 20,
                "clinician_approved": True,
            },
            "outcome_domains": ["mood"],
            "time_horizon_days": 42,
            "evidence_context": "SIM_AUDIT_LEAK_GHI777 narrative should not be stored",
        },
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    assert _count_neuroai_lab_audits() == before + 1
    row = _latest_neuroai_lab_audits(1)[0]
    assert row.action == "neuroai_lab.simulation_preview"
    meta = json.loads(row.note)
    assert meta == {
        "baseline_event_count": 1,
        "has_proposed_intervention": True,
        "time_horizon_days": 42,
        "outcome_domain_count": 1,
    }
    _assert_note_has_no_phi_leak(
        row.note,
        forbidden_literals=[
            "SUPER_SECRET_BASELINE",
            "SIM_AUDIT_LEAK_GHI777",
            "should_not_appear",
        ],
    )


def test_timeline_preview_returns_200_when_audit_insert_fails(
    client: TestClient, auth_headers: dict, monkeypatch: Any
) -> None:
    import app.repositories.audit as audit_mod

    def _boom(*_a: Any, **_k: Any) -> None:
        raise RuntimeError("simulated audit persistence failure")

    monkeypatch.setattr(audit_mod, "create_audit_event", _boom)
    payload = {
        "patient_id": "pt-resilient",
        "events": [
            {
                "event_id": "e-res",
                "modality": "other",
                "timestamp": "2024-06-04T12:00:00Z",
                "event_type": "observation",
                "payload": {},
                "research_only": True,
            }
        ],
    }
    r = client.post(
        "/api/v1/deeptwin/neuroai/timeline/preview",
        json=payload,
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
