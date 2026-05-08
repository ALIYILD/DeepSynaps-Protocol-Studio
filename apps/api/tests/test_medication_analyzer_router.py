"""Tests for Medication Analyzer API (``/api/v1/medications/analyzer``)."""
from __future__ import annotations

import uuid

from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.persistence.models import AuditEventRecord, Patient, PatientMedication


def _seed_patient_and_meds(patient_id: str | None = None) -> str:
    pid = patient_id or str(uuid.uuid4())
    db = SessionLocal()
    try:
        db.add(
            Patient(
                id=pid,
                clinician_id="actor-clinician-demo",
                first_name="Med",
                last_name="AnalyzerTest",
                email=f"medtest-{pid[:8]}@example.com",
                consent_signed=True,
                status="active",
            )
        )
        db.add(
            PatientMedication(
                patient_id=pid,
                clinician_id="actor-clinician-demo",
                name="sertraline",
                generic_name="sertraline",
                drug_class="ssri",
                dose="50 mg",
                frequency="daily",
                route="oral",
                indication="MDD",
                active=True,
                started_at="2025-01-01",
            )
        )
        db.add(
            PatientMedication(
                patient_id=pid,
                clinician_id="actor-clinician-demo",
                name="tramadol",
                generic_name="tramadol",
                drug_class="opioid analgesic",
                dose="50 mg",
                frequency="prn",
                route="oral",
                active=True,
                started_at="2025-02-01",
            )
        )
        db.commit()
    finally:
        db.close()
    return pid


def test_analyzer_get_requires_auth(client: TestClient) -> None:
    r = client.get(f"/api/v1/medications/analyzer/patient/{uuid.uuid4()}")
    assert r.status_code == 403


def test_analyzer_payload_contains_schema_and_research_disclosures(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    pid = _seed_patient_and_meds()
    r = client.get(
        f"/api/v1/medications/analyzer/patient/{pid}",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["schema_version"] == "1.0"
    assert data["patient_id"] == pid
    assert "snapshot" in data
    assert data["snapshot"]["polypharmacy"]["active_count"] == 2
    assert len(data["safety_alerts"]) >= 1
    assert any(a.get("category") == "drug_drug" for a in data["safety_alerts"])
    rd = data.get("regulatory_disclosures") or {}
    assert "limitations" in rd
    assert rd.get("not_intended_for")
    assert "persisted_review_notes" in data
    assert isinstance(data["persisted_review_notes"], list)


def test_analyzer_review_note_persisted(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    pid = _seed_patient_and_meds()
    note = client.post(
        f"/api/v1/medications/analyzer/patient/{pid}/review-note",
        headers=auth_headers["clinician"],
        json={"note_text": "Reviewed interactions — chart verified.", "linked_recommendation_ids": []},
    )
    assert note.status_code == 200, note.text
    body = note.json()
    assert body.get("note_id")
    fp = body.get("full_payload")
    assert fp is not None
    assert any(
        "chart verified" in (n.get("note_text") or "") for n in (fp.get("persisted_review_notes") or [])
    )

    aud = client.get(
        f"/api/v1/medications/analyzer/patient/{pid}/audit",
        headers=auth_headers["clinician"],
    )
    assert aud.status_code == 200
    j = aud.json()
    entries = j.get("entries", [])
    assert any(e.get("action") == "review_note" for e in entries)
    rnotes = j.get("review_notes", [])
    assert any("chart verified" in (n.get("note_text") or "") for n in rnotes)


def test_analyzer_review_note_trims_and_dedupes_linked_recommendation_ids(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    pid = _seed_patient_and_meds()
    note = client.post(
        f"/api/v1/medications/analyzer/patient/{pid}/review-note",
        headers=auth_headers["clinician"],
        json={
            "note_text": "Reviewed interactions — linked recs normalized.",
            "linked_recommendation_ids": ["  rec-1  ", "rec-1", "   ", "rec-2"],
        },
    )
    assert note.status_code == 200, note.text
    fp = note.json().get("full_payload") or {}
    persisted = next(
        n for n in (fp.get("persisted_review_notes") or [])
        if "linked recs normalized" in (n.get("note_text") or "")
    )
    assert persisted["linked_recommendation_ids"] == ["rec-1", "rec-2"]

    aud = client.get(
        f"/api/v1/medications/analyzer/patient/{pid}/audit",
        headers=auth_headers["clinician"],
    )
    assert aud.status_code == 200, aud.text
    entries = aud.json().get("entries", [])
    row = next(e for e in entries if e.get("action") == "review_note")
    assert (row.get("detail") or {}).get("linked") == ["rec-1", "rec-2"]


def test_analyzer_review_note_rejects_whitespace_only(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    pid = _seed_patient_and_meds()
    note = client.post(
        f"/api/v1/medications/analyzer/patient/{pid}/review-note",
        headers=auth_headers["clinician"],
        json={"note_text": "   ", "linked_recommendation_ids": []},
    )
    assert note.status_code == 422, note.text


def test_timeline_event_persists_and_appears_in_payload(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    pid = _seed_patient_and_meds()
    te = client.post(
        f"/api/v1/medications/analyzer/patient/{pid}/timeline-event",
        headers=auth_headers["clinician"],
        json={
            "event_type": "side_effect_report",
            "occurred_at": "2025-03-15T10:00:00+00:00",
            "payload": {"description": "nausea after titration"},
        },
    )
    assert te.status_code == 200, te.text
    ev = te.json().get("event", {})
    assert ev.get("event_type") == "side_effect_report"

    r = client.get(
        f"/api/v1/medications/analyzer/patient/{pid}",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 200
    timeline = r.json().get("timeline", [])
    assert any(
        e.get("event_type") == "side_effect_report" for e in timeline
    ), timeline


def test_timeline_event_rejects_invalid_occurred_at(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    pid = _seed_patient_and_meds()
    te = client.post(
        f"/api/v1/medications/analyzer/patient/{pid}/timeline-event",
        headers=auth_headers["clinician"],
        json={
            "event_type": "side_effect_report",
            "occurred_at": "not-a-datetime",
            "payload": {"description": "nausea after titration"},
        },
    )
    assert te.status_code == 422, te.text
    assert "occurred_at" in te.text


def test_timeline_event_trims_and_normalizes_inputs(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    pid = _seed_patient_and_meds()
    te = client.post(
        f"/api/v1/medications/analyzer/patient/{pid}/timeline-event",
        headers=auth_headers["clinician"],
        json={
            "event_type": "  side_effect_report  ",
            "occurred_at": " 2025-03-15T10:00:00Z ",
            "medication_id": "   ",
            "source_origin": "  clinician_entry  ",
            "payload": {"description": "nausea after titration"},
        },
    )
    assert te.status_code == 200, te.text
    ev = te.json().get("event", {})
    assert ev.get("event_type") == "side_effect_report"
    assert ev.get("occurred_at") == "2025-03-15T10:00:00Z"
    assert ev.get("medication_id") is None
    assert (ev.get("source") or {}).get("origin") == "clinician_entry"


def test_timeline_event_rejects_overlong_event_type(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    pid = _seed_patient_and_meds()
    te = client.post(
        f"/api/v1/medications/analyzer/patient/{pid}/timeline-event",
        headers=auth_headers["clinician"],
        json={
            "event_type": "event_type_that_is_far_longer_than_forty_eight_chars",
            "occurred_at": "2025-03-15T10:00:00Z",
            "payload": {"description": "nausea after titration"},
        },
    )
    assert te.status_code == 422, te.text
    assert "48 characters or fewer" in te.text


def test_timeline_event_rejects_overlong_source_origin(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    pid = _seed_patient_and_meds()
    te = client.post(
        f"/api/v1/medications/analyzer/patient/{pid}/timeline-event",
        headers=auth_headers["clinician"],
        json={
            "event_type": "side_effect_report",
            "occurred_at": "2025-03-15T10:00:00Z",
            "source_origin": "source_origin_that_is_far_longer_than_forty_eight_chars",
            "payload": {"description": "nausea after titration"},
        },
    )
    assert te.status_code == 422, te.text
    assert "48 characters or fewer" in te.text


def test_analyzer_recompute(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    pid = _seed_patient_and_meds()
    r = client.post(
        f"/api/v1/medications/analyzer/patient/{pid}/recompute",
        headers=auth_headers["clinician"],
        json={"force": True},
    )
    assert r.status_code == 200
    assert r.json().get("status") == "complete"


def test_analyzer_recompute_persists_full_umbrella_audit_note(
    client: TestClient, auth_headers: dict[str, dict[str, str]]
) -> None:
    pid = _seed_patient_and_meds()
    long_module = "module-" + ("x" * 620)
    r = client.post(
        f"/api/v1/medications/analyzer/patient/{pid}/recompute",
        headers=auth_headers["clinician"],
        json={"modules": [long_module]},
    )
    assert r.status_code == 200, r.text

    db = SessionLocal()
    try:
        row = (
            db.query(AuditEventRecord)
            .filter(
                AuditEventRecord.target_id == pid,
                AuditEventRecord.target_type == "medication_analyzer",
                AuditEventRecord.action == "medication_analyzer.recompute",
            )
            .order_by(AuditEventRecord.id.desc())
            .first()
        )
        assert row is not None
        assert long_module in (row.note or "")
    finally:
        db.close()
