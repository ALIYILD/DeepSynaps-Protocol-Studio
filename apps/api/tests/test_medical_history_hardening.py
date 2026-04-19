"""Targeted tests for Patients Hub medical-history hardening.

Covers:
    - replace mode persists and bumps version
    - merge_sections preserves untouched sections
    - safety acknowledgement stamps actor + timestamp
    - mark_reviewed stamps reviewer metadata
    - blocking safety flag surfaces via AI context
    - AI context is permission-scoped (clinician only; own patient only)
    - audit event is written on each save
"""
from __future__ import annotations

from fastapi.testclient import TestClient


def _create_patient(client: TestClient, auth: dict, email: str = "mhx@example.com") -> str:
    r = client.post(
        "/api/v1/patients",
        json={"first_name": "MH", "last_name": "Patient", "dob": "1990-01-01",
              "gender": "F", "email": email, "primary_condition": "Depression"},
        headers=auth["clinician"],
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


class TestMedicalHistoryReplaceMode:
    def test_replace_mode_persists_and_bumps_version(self, client, auth_headers):
        pid = _create_patient(client, auth_headers)
        r = client.patch(
            f"/api/v1/patients/{pid}/medical-history",
            json={"mode": "replace", "medical_history": {"sections": {"presenting": {"notes": "Insomnia, anhedonia"}}}},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        data = r.json()["medical_history"]
        assert data["sections"]["presenting"]["notes"] == "Insomnia, anhedonia"
        assert data["meta"]["version"] == 1
        assert data["meta"]["updated_by"]

        r2 = client.patch(
            f"/api/v1/patients/{pid}/medical-history",
            json={"mode": "replace", "medical_history": {"sections": {"presenting": {"notes": "Updated"}}}},
            headers=auth_headers["clinician"],
        )
        assert r2.json()["medical_history"]["meta"]["version"] == 2


class TestMedicalHistoryMergeSections:
    def test_merge_preserves_untouched_sections(self, client, auth_headers):
        pid = _create_patient(client, auth_headers)
        # Seed two sections via replace.
        client.patch(
            f"/api/v1/patients/{pid}/medical-history",
            json={"mode": "replace", "medical_history": {
                "sections": {
                    "presenting": {"notes": "chief complaint A"},
                    "diagnoses": {"notes": "MDD recurrent"},
                }}},
            headers=auth_headers["clinician"],
        )
        # Merge-update only presenting.
        r = client.patch(
            f"/api/v1/patients/{pid}/medical-history",
            json={"mode": "merge_sections", "sections": {"presenting": {"notes": "chief complaint B"}}},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        data = r.json()["medical_history"]
        assert data["sections"]["presenting"]["notes"] == "chief complaint B"
        assert data["sections"]["diagnoses"]["notes"] == "MDD recurrent"  # preserved
        assert data["meta"]["version"] == 2

    def test_merge_rejects_unknown_section_id(self, client, auth_headers):
        pid = _create_patient(client, auth_headers)
        r = client.patch(
            f"/api/v1/patients/{pid}/medical-history",
            json={"mode": "merge_sections", "sections": {"nonsense_section": {"notes": "x"}}},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        data = r.json()["medical_history"]
        assert "nonsense_section" not in (data.get("sections") or {})


class TestMedicalHistorySafetyAck:
    def test_acknowledge_stamps_actor_and_time(self, client, auth_headers):
        pid = _create_patient(client, auth_headers)
        r = client.patch(
            f"/api/v1/patients/{pid}/medical-history",
            json={"mode": "merge_sections", "sections": {"safety": {"notes": "n/a"}},
                  "safety": {"acknowledged": True, "flags": {"implanted_device": False}}},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        safety = r.json()["medical_history"]["safety"]
        assert safety["acknowledged"] is True
        assert safety["acknowledged_by"]
        assert safety["acknowledged_at"]

    def test_blocking_flag_persists(self, client, auth_headers):
        pid = _create_patient(client, auth_headers)
        r = client.patch(
            f"/api/v1/patients/{pid}/medical-history",
            json={"mode": "merge_sections",
                  "safety": {"flags": {"implanted_device": True, "lower_threshold_meds": True}}},
            headers=auth_headers["clinician"],
        )
        flags = r.json()["medical_history"]["safety"]["flags"]
        assert flags["implanted_device"] is True
        assert flags["lower_threshold_meds"] is True


class TestMedicalHistoryMarkReviewed:
    def test_mark_reviewed_stamps_meta(self, client, auth_headers):
        pid = _create_patient(client, auth_headers)
        r = client.patch(
            f"/api/v1/patients/{pid}/medical-history",
            json={"mode": "merge_sections", "sections": {"summary": {"notes": "Plan: TMS 6wk"}},
                  "mark_reviewed": True},
            headers=auth_headers["clinician"],
        )
        meta = r.json()["medical_history"]["meta"]
        assert meta["reviewed_at"]
        assert meta["reviewed_by"]
        assert meta["requires_review"] is False


class TestMedicalHistoryAIContext:
    def test_returns_prompt_safe_summary_and_flags_require_review(self, client, auth_headers):
        pid = _create_patient(client, auth_headers)
        client.patch(
            f"/api/v1/patients/{pid}/medical-history",
            json={"mode": "merge_sections",
                  "sections": {"presenting": {"notes": "Chief complaint: fatigue"},
                               "summary": {"notes": "MDD recurrent, moderate"}},
                  "safety": {"flags": {"implanted_device": True}}},
            headers=auth_headers["clinician"],
        )
        r = client.get(f"/api/v1/patients/{pid}/medical-history/ai-context",
                       headers=auth_headers["clinician"])
        assert r.status_code == 200
        data = r.json()
        assert "Chief complaint: fatigue" in data["summary_md"]
        assert data["structured_flags"]["implanted_device"] is True
        assert data["requires_review"] is True  # blocking flag set → requires_review
        assert "presenting" in data["used_sections"]

    def test_patient_role_blocked_from_ai_context(self, client, auth_headers):
        pid = _create_patient(client, auth_headers)
        r = client.get(f"/api/v1/patients/{pid}/medical-history/ai-context",
                       headers=auth_headers["patient"])
        assert r.status_code == 403

    def test_guest_role_blocked(self, client, auth_headers):
        pid = _create_patient(client, auth_headers)
        r = client.get(f"/api/v1/patients/{pid}/medical-history/ai-context",
                       headers=auth_headers["guest"])
        assert r.status_code == 403


class TestMedicalHistoryAudit:
    def test_save_writes_audit_event(self, client, auth_headers):
        from app.database import SessionLocal
        from app.repositories.audit import count_audit_events

        pid = _create_patient(client, auth_headers)
        s = SessionLocal()
        try:
            before = count_audit_events(s)
        finally:
            s.close()
        client.patch(
            f"/api/v1/patients/{pid}/medical-history",
            json={"mode": "merge_sections", "sections": {"diagnoses": {"notes": "F33.1"}}},
            headers=auth_headers["clinician"],
        )
        s = SessionLocal()
        try:
            after = count_audit_events(s)
        finally:
            s.close()
        assert after == before + 1
