from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from app.database import SessionLocal


def _create_audit_row(
    *,
    event_id: str,
    action: str,
    target_type: str,
    target_id: str,
    actor_id: str = "actor-clinician-demo",
    role: str = "clinician",
    note: str,
    created_at: datetime | None = None,
) -> None:
    from app.repositories.audit import create_audit_event

    ts = created_at or datetime.now(timezone.utc)
    db = SessionLocal()
    try:
        create_audit_event(
            db,
            event_id=event_id,
            target_id=target_id,
            target_type=target_type,
            action=action,
            role=role,
            actor_id=actor_id,
            note=note,
            created_at=ts.isoformat(),
        )
        db.commit()
    finally:
        db.close()


def test_inbox_items_empty_db(client: TestClient, auth_headers: dict) -> None:
    r = client.get("/api/v1/clinician-inbox/items", headers=auth_headers["clinician"])
    assert r.status_code == 200
    body = r.json()
    assert body["items"] == []
    assert body["total"] == 0
    assert body["is_demo_view"] is False


def test_inbox_items_filters_status_and_ack(client: TestClient, auth_headers: dict) -> None:
    now = datetime.now(timezone.utc)
    # Two qualifying HIGH-priority items (deterministic predicate: endswith _to_clinician / note priority=high)
    _create_audit_row(
        event_id="evt-inbox-1",
        action="patient_messages.urgent_flag_to_clinician",
        target_type="patient_messages",
        target_id="demo-pt-1",
        note="DEMO — priority=high; patient=demo-pt-1; synthetic",
        created_at=now - timedelta(hours=2),
    )
    _create_audit_row(
        event_id="evt-inbox-2",
        action="adherence_events.side_effect_to_clinician_mirror",
        target_type="adherence_events",
        target_id="demo-pt-2",
        note="DEMO — priority=high; patient=demo-pt-2; synthetic",
        created_at=now - timedelta(days=2),
    )
    # Acknowledge the second item (ack stored as separate audit row)
    _create_audit_row(
        event_id="evt-ack-2",
        action="clinician_inbox.item_acknowledged",
        target_type="clinician_inbox",
        target_id="audit-evt-inbox-2",
        note="DEMO; event=evt-inbox-2; reviewed in test",
        created_at=now - timedelta(days=1),
    )

    # Unread filter
    r = client.get("/api/v1/clinician-inbox/items?status=unread", headers=auth_headers["clinician"])
    assert r.status_code == 200
    body = r.json()
    assert {it["event_id"] for it in body["items"]} == {"evt-inbox-1"}

    # Reviewed/ack filter (accept both names)
    r = client.get("/api/v1/clinician-inbox/items?status=acknowledged", headers=auth_headers["clinician"])
    assert r.status_code == 200
    body = r.json()
    assert {it["event_id"] for it in body["items"]} == {"evt-inbox-2"}
    r = client.get("/api/v1/clinician-inbox/items?status=reviewed", headers=auth_headers["clinician"])
    assert r.status_code == 200
    body = r.json()
    assert {it["event_id"] for it in body["items"]} == {"evt-inbox-2"}


def test_inbox_ack_requires_note_and_writes_ack(client: TestClient, auth_headers: dict) -> None:
    _create_audit_row(
        event_id="evt-inbox-3",
        action="wearables.observation_anomaly_to_clinician",
        target_type="wearables",
        target_id="demo-pt-3",
        note="DEMO — priority=high; patient=demo-pt-3; synthetic",
    )

    # Blank note rejected by pydantic min_length/validator (422)
    r = client.post(
        "/api/v1/clinician-inbox/items/evt-inbox-3/acknowledge",
        headers=auth_headers["clinician"],
        json={"note": "   "},
    )
    assert r.status_code == 422

    r = client.post(
        "/api/v1/clinician-inbox/items/evt-inbox-3/acknowledge",
        headers=auth_headers["clinician"],
        json={"note": "Reviewed during demo walkthrough."},
    )
    assert r.status_code == 200
    out = r.json()
    assert out["accepted"] is True
    assert out["event_id"] == "evt-inbox-3"
    assert out["ack_event_id"]

    # Now appears as acknowledged
    r = client.get("/api/v1/clinician-inbox/items?status=acknowledged", headers=auth_headers["clinician"])
    assert r.status_code == 200
    ids = {it["event_id"] for it in r.json()["items"]}
    assert "evt-inbox-3" in ids


def test_inbox_export_csv_is_csv(client: TestClient, auth_headers: dict) -> None:
    _create_audit_row(
        event_id="evt-inbox-4",
        action="patient_profile.consent_renewal_required_to_clinician_mirror",
        target_type="patient_profile",
        target_id="demo-pt-4",
        note="DEMO — priority=high; patient=demo-pt-4; synthetic",
    )
    r = client.get("/api/v1/clinician-inbox/export.csv", headers=auth_headers["clinician"])
    assert r.status_code == 200
    assert r.headers.get("content-type", "").startswith("text/csv")
    txt = r.text
    assert "event_id" in txt.splitlines()[0]
    assert "evt-inbox-4" in txt
