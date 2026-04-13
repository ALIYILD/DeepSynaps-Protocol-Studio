"""Tests for clinician home program tasks API and provenance validation."""

from __future__ import annotations

import re

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import func, select

from app.database import SessionLocal
from app.persistence.models import AuditEventRecord
from app.services.home_program_task_audit import (
    ACTION_CREATE_REPLAY,
    ACTION_LEGACY_PUT_CREATE,
    ACTION_SYNC_CONFLICT,
)
from deepsynaps_core_schema import parse_home_program_selection, patient_safe_home_program_selection


@pytest.fixture
def patient_id(client: TestClient, auth_headers: dict) -> str:
    resp = client.post(
        "/api/v1/patients",
        json={"first_name": "Home", "last_name": "Programs", "dob": "1990-01-15", "gender": "F"},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 201
    return resp.json()["id"]


def _valid_provenance() -> dict:
    return {
        "conditionId": "CON-001",
        "confidenceScore": 88,
        "confidenceTier": "high",
        "matchMethod": "explicit_id",
        "matchedField": "protocol",
        "matchedValue": "CON-001",
        "sourceCourseId": "course-1",
        "sourceCourseLabel": "Test course",
        "courseLinkAutoSet": True,
        "appliedAt": "2026-04-12T12:00:00.000Z",
        "templateId": "tpl-x",
        "provenanceVersion": 1,
    }


class TestProvenanceSchema:
    def test_parse_normalizes_and_strips_nulls(self) -> None:
        d = parse_home_program_selection(_valid_provenance())
        assert d is not None
        assert d["conditionId"] == "CON-001"
        assert d["confidenceTier"] == "high"

    def test_extra_keys_rejected(self) -> None:
        bad = {**_valid_provenance(), "evil": {"nested": True}}
        with pytest.raises(ValidationError):
            parse_home_program_selection(bad)

    def test_patient_safe_strips_scores(self) -> None:
        d = parse_home_program_selection(_valid_provenance())
        assert d is not None
        safe = patient_safe_home_program_selection(d)
        assert safe is not None
        assert "confidenceScore" not in safe
        assert "confidenceTier" not in safe
        assert safe.get("conditionId") == "CON-001"


class TestHomeProgramTasksApi:
    def test_upsert_with_provenance_and_list(
        self, client: TestClient, auth_headers: dict, patient_id: str
    ) -> None:
        tid = "htask-test-1"
        task = {
            "id": tid,
            "patientId": patient_id,
            "title": "Walk",
            "type": "activity",
            "instructions": "20 min",
            "dueDate": "2026-04-15",
            "frequency": "daily",
            "courseId": "",
            "status": "active",
            "assignedAt": "2026-04-12T10:00:00.000Z",
            "homeProgramSelection": _valid_provenance(),
        }
        r = client.put(f"/api/v1/home-program-tasks/{tid}", json=task, headers=auth_headers["clinician"])
        assert r.status_code == 200
        body = r.json()
        assert body["title"] == "Walk"
        assert body["homeProgramSelection"]["conditionId"] == "CON-001"

        r2 = client.get("/api/v1/home-program-tasks", headers=auth_headers["clinician"])
        assert r2.status_code == 200
        items = r2.json()["items"]
        assert len(items) >= 1
        found = next((x for x in items if x.get("id") == tid), None)
        assert found is not None
        assert found["homeProgramSelection"]["conditionId"] == "CON-001"

    def test_edit_without_home_program_selection_preserves_provenance(
        self, client: TestClient, auth_headers: dict, patient_id: str
    ) -> None:
        tid = "htask-test-2"
        base = {
            "id": tid,
            "patientId": patient_id,
            "title": "Journal",
            "type": "mood-journal",
            "instructions": "Write",
            "status": "active",
            "assignedAt": "2026-04-12T10:00:00.000Z",
            "homeProgramSelection": _valid_provenance(),
        }
        assert client.put(f"/api/v1/home-program-tasks/{tid}", json=base, headers=auth_headers["clinician"]).status_code == 200

        update = {
            "patientId": patient_id,
            "title": "Journal updated",
            "type": "mood-journal",
            "instructions": "Write more",
            "status": "active",
            "assignedAt": "2026-04-12T10:00:00.000Z",
        }
        r = client.put(f"/api/v1/home-program-tasks/{tid}", json=update, headers=auth_headers["clinician"])
        assert r.status_code == 200
        hp = r.json().get("homeProgramSelection")
        assert hp is not None
        assert hp.get("conditionId") == "CON-001"

    def test_replace_provenance_on_save(
        self, client: TestClient, auth_headers: dict, patient_id: str
    ) -> None:
        tid = "htask-test-3"
        first = {
            "id": tid,
            "patientId": patient_id,
            "title": "A",
            "type": "activity",
            "instructions": "x",
            "status": "active",
            "assignedAt": "2026-04-12T10:00:00.000Z",
            "homeProgramSelection": _valid_provenance(),
        }
        assert client.put(f"/api/v1/home-program-tasks/{tid}", json=first, headers=auth_headers["clinician"]).status_code == 200

        second_sel = {
            **_valid_provenance(),
            "conditionId": "CON-002",
            "confidenceScore": 40,
            "templateId": "tpl-other",
        }
        second = {
            **first,
            "title": "A2",
            "homeProgramSelection": second_sel,
        }
        r = client.put(f"/api/v1/home-program-tasks/{tid}", json=second, headers=auth_headers["clinician"])
        assert r.status_code == 200
        assert r.json()["homeProgramSelection"]["conditionId"] == "CON-002"
        assert r.json()["homeProgramSelection"]["confidenceTier"] == "low"

    def test_invalid_provenance_rejected(
        self, client: TestClient, auth_headers: dict, patient_id: str
    ) -> None:
        tid = "htask-test-bad"
        task = {
            "id": tid,
            "patientId": patient_id,
            "title": "Bad",
            "type": "activity",
            "instructions": "x",
            "status": "active",
            "assignedAt": "2026-04-12T10:00:00.000Z",
            "homeProgramSelection": {"confidenceScore": "not-a-number"},
        }
        r = client.put(f"/api/v1/home-program-tasks/{tid}", json=task, headers=auth_headers["clinician"])
        assert r.status_code == 422
        assert r.json().get("code") == "invalid_home_program_provenance"

    def test_guest_forbidden(self, client: TestClient, auth_headers: dict, patient_id: str) -> None:
        r = client.get("/api/v1/home-program-tasks", headers=auth_headers["guest"])
        assert r.status_code == 403


class TestRevisionAndConflict:
    def test_upsert_returns_revision_and_timestamps(
        self, client: TestClient, auth_headers: dict, patient_id: str
    ) -> None:
        tid = "htask-rev-meta"
        task = {
            "id": tid,
            "patientId": patient_id,
            "title": "R1",
            "type": "activity",
            "instructions": "x",
            "status": "active",
            "assignedAt": "2026-04-12T10:00:00.000Z",
        }
        r = client.put(f"/api/v1/home-program-tasks/{tid}", json=task, headers=auth_headers["clinician"])
        assert r.status_code == 200
        body = r.json()
        assert body.get("serverRevision") == 1
        assert body.get("serverUpdatedAt")
        assert body.get("lastSyncedAt")
        assert body.get("serverTaskId")
        assert re.match(
            r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
            body["serverTaskId"],
            re.I,
        )

    def test_stale_last_known_returns_409(
        self, client: TestClient, auth_headers: dict, patient_id: str
    ) -> None:
        tid = "htask-stale"
        base = {
            "id": tid,
            "patientId": patient_id,
            "title": "v1",
            "type": "activity",
            "instructions": "x",
            "status": "active",
            "assignedAt": "2026-04-12T10:00:00.000Z",
        }
        r1 = client.put(f"/api/v1/home-program-tasks/{tid}", json=base, headers=auth_headers["clinician"])
        assert r1.status_code == 200
        assert r1.json()["serverRevision"] == 1
        r2 = client.put(
            f"/api/v1/home-program-tasks/{tid}",
            json={**base, "title": "v2", "lastKnownServerRevision": 1},
            headers=auth_headers["clinician"],
        )
        assert r2.status_code == 200
        assert r2.json()["serverRevision"] == 2
        r3 = client.put(
            f"/api/v1/home-program-tasks/{tid}",
            json={**base, "title": "v3", "lastKnownServerRevision": 1},
            headers=auth_headers["clinician"],
        )
        assert r3.status_code == 409
        assert r3.json().get("code") == "sync_conflict"
        det = r3.json().get("details") or {}
        assert det.get("serverRevision") == 2
        assert det.get("serverTaskId")
        assert det.get("serverTask", {}).get("title") == "v2"

    def test_force_skips_revision_check(
        self, client: TestClient, auth_headers: dict, patient_id: str
    ) -> None:
        tid = "htask-force"
        base = {
            "id": tid,
            "patientId": patient_id,
            "title": "v1",
            "type": "activity",
            "instructions": "x",
            "status": "active",
            "assignedAt": "2026-04-12T10:00:00.000Z",
        }
        client.put(f"/api/v1/home-program-tasks/{tid}", json=base, headers=auth_headers["clinician"])
        client.put(
            f"/api/v1/home-program-tasks/{tid}",
            json={**base, "title": "v2", "lastKnownServerRevision": 1},
            headers=auth_headers["clinician"],
        )
        r = client.put(
            f"/api/v1/home-program-tasks/{tid}?force=true",
            json={**base, "title": "forced", "lastKnownServerRevision": 1},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        assert r.json()["title"] == "forced"

    def test_export_stub_has_payload_and_revision(
        self, client: TestClient, auth_headers: dict, patient_id: str
    ) -> None:
        tid = "htask-export"
        task = {
            "id": tid,
            "patientId": patient_id,
            "title": "Ex",
            "type": "activity",
            "instructions": "x",
            "status": "active",
            "assignedAt": "2026-04-12T10:00:00.000Z",
            "homeProgramSelection": _valid_provenance(),
        }
        client.put(f"/api/v1/home-program-tasks/{tid}", json=task, headers=auth_headers["clinician"])
        r = client.get(f"/api/v1/home-program-tasks/{tid}/export-stub", headers=auth_headers["clinician"])
        assert r.status_code == 200
        data = r.json()
        assert data.get("schema_version") == 1
        assert data.get("revision") == 1
        assert data.get("patient_id") == patient_id
        assert data.get("external_task_id") == tid
        assert data.get("server_task_id")
        assert "provenance_summary" in data
        assert "payload" in data


class TestIdentityAndAudit:
    def test_rejects_external_id_with_invalid_chars(
        self, client: TestClient, auth_headers: dict, patient_id: str
    ) -> None:
        r = client.get("/api/v1/home-program-tasks/%3Cinject%3E", headers=auth_headers["clinician"])
        assert r.status_code == 422
        assert r.json().get("code") == "invalid_external_task_id"

    def test_sync_conflict_logs_audit_event(
        self, client: TestClient, auth_headers: dict, patient_id: str
    ) -> None:
        db = SessionLocal()
        try:
            before = db.scalar(
                select(func.count()).select_from(AuditEventRecord).where(AuditEventRecord.action == ACTION_SYNC_CONFLICT)
            )
        finally:
            db.close()

        tid = "htask-audit-conflict"
        base = {
            "id": tid,
            "patientId": patient_id,
            "title": "v1",
            "type": "activity",
            "instructions": "x",
            "status": "active",
            "assignedAt": "2026-04-12T10:00:00.000Z",
        }
        client.put(f"/api/v1/home-program-tasks/{tid}", json=base, headers=auth_headers["clinician"])
        client.put(
            f"/api/v1/home-program-tasks/{tid}",
            json={**base, "title": "v2", "lastKnownServerRevision": 1},
            headers=auth_headers["clinician"],
        )
        r3 = client.put(
            f"/api/v1/home-program-tasks/{tid}",
            json={**base, "title": "v3", "lastKnownServerRevision": 1},
            headers=auth_headers["clinician"],
        )
        assert r3.status_code == 409

        db = SessionLocal()
        try:
            after = db.scalar(
                select(func.count()).select_from(AuditEventRecord).where(AuditEventRecord.action == ACTION_SYNC_CONFLICT)
            )
        finally:
            db.close()
        assert after == before + 1

    def test_audit_actions_take_server(
        self, client: TestClient, auth_headers: dict, patient_id: str
    ) -> None:
        tid = "htask-audit-take"
        client.put(
            f"/api/v1/home-program-tasks/{tid}",
            json={
                "id": tid,
                "patientId": patient_id,
                "title": "x",
                "type": "activity",
                "instructions": "x",
                "status": "active",
                "assignedAt": "2026-04-12T10:00:00.000Z",
            },
            headers=auth_headers["clinician"],
        )
        r = client.post(
            "/api/v1/home-program-tasks/audit-actions",
            json={"external_task_id": tid, "action": "take_server"},
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        assert r.json().get("status") == "recorded"


class TestExplicitCreateAndLookup:
    def test_post_create_returns_server_ids_revision_and_header(
        self, client: TestClient, auth_headers: dict, patient_id: str
    ) -> None:
        tid = "htask-post-create-1"
        task = {
            "id": tid,
            "patientId": patient_id,
            "title": "Post create",
            "type": "activity",
            "instructions": "x",
            "status": "active",
            "assignedAt": "2026-04-12T10:00:00.000Z",
        }
        r = client.post("/api/v1/home-program-tasks", json=task, headers=auth_headers["clinician"])
        assert r.status_code == 200
        assert r.headers.get("X-DS-Home-Task-Create") == "new"
        body = r.json()
        assert body.get("createDisposition") == "created"
        assert body.get("serverRevision") == 1
        assert body.get("title") == "Post create"
        assert body.get("serverTaskId")
        assert re.match(
            r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
            body["serverTaskId"],
            re.I,
        )

    def test_post_create_idempotent_same_payload_replay_header(
        self, client: TestClient, auth_headers: dict, patient_id: str
    ) -> None:
        tid = "htask-post-idem"
        task = {
            "id": tid,
            "patientId": patient_id,
            "title": "Same",
            "type": "activity",
            "instructions": "x",
            "status": "active",
            "assignedAt": "2026-04-12T10:00:00.000Z",
        }
        r1 = client.post("/api/v1/home-program-tasks", json=task, headers=auth_headers["clinician"])
        assert r1.status_code == 200
        assert r1.headers.get("X-DS-Home-Task-Create") == "new"
        r2 = client.post("/api/v1/home-program-tasks", json=task, headers=auth_headers["clinician"])
        assert r2.status_code == 200
        assert r2.headers.get("X-DS-Home-Task-Create") == "replay"
        assert r2.json().get("createDisposition") == "replay"
        assert r2.json().get("serverTaskId") == r1.json().get("serverTaskId")
        assert r2.json().get("serverRevision") == r1.json().get("serverRevision")

    def test_post_create_replay_logs_audit(
        self, client: TestClient, auth_headers: dict, patient_id: str
    ) -> None:
        tid = "htask-replay-audit"
        task = {
            "id": tid,
            "patientId": patient_id,
            "title": "Audit replay",
            "type": "activity",
            "instructions": "x",
            "status": "active",
            "assignedAt": "2026-04-12T10:00:00.000Z",
        }
        assert client.post("/api/v1/home-program-tasks", json=task, headers=auth_headers["clinician"]).status_code == 200
        db = SessionLocal()
        try:
            before = db.scalar(
                select(func.count()).select_from(AuditEventRecord).where(
                    AuditEventRecord.action == ACTION_CREATE_REPLAY
                )
            )
        finally:
            db.close()
        client.post("/api/v1/home-program-tasks", json=task, headers=auth_headers["clinician"])
        db = SessionLocal()
        try:
            after = db.scalar(
                select(func.count()).select_from(AuditEventRecord).where(
                    AuditEventRecord.action == ACTION_CREATE_REPLAY
                )
            )
        finally:
            db.close()
        assert after == before + 1

    def test_post_then_put_advances_revision(
        self, client: TestClient, auth_headers: dict, patient_id: str
    ) -> None:
        tid = "htask-post-then-put"
        task = {
            "id": tid,
            "patientId": patient_id,
            "title": "v1",
            "type": "activity",
            "instructions": "x",
            "status": "active",
            "assignedAt": "2026-04-12T10:00:00.000Z",
        }
        r1 = client.post("/api/v1/home-program-tasks", json=task, headers=auth_headers["clinician"])
        assert r1.status_code == 200
        rev = r1.json()["serverRevision"]
        r2 = client.put(
            f"/api/v1/home-program-tasks/{tid}",
            json={**task, "title": "v2", "lastKnownServerRevision": rev},
            headers=auth_headers["clinician"],
        )
        assert r2.status_code == 200
        assert r2.json()["title"] == "v2"
        assert r2.json()["serverRevision"] == 2
        assert "createDisposition" not in r2.json()

    def test_legacy_put_create_marks_disposition_headers_and_audit(
        self, client: TestClient, auth_headers: dict, patient_id: str
    ) -> None:
        tid = "htask-legacy-put-create"
        task = {
            "id": tid,
            "patientId": patient_id,
            "title": "Legacy",
            "type": "activity",
            "instructions": "x",
            "status": "active",
            "assignedAt": "2026-04-12T10:00:00.000Z",
        }
        db = SessionLocal()
        try:
            before = db.scalar(
                select(func.count()).select_from(AuditEventRecord).where(
                    AuditEventRecord.action == ACTION_LEGACY_PUT_CREATE
                )
            )
        finally:
            db.close()
        r = client.put(f"/api/v1/home-program-tasks/{tid}", json=task, headers=auth_headers["clinician"])
        assert r.status_code == 200
        assert r.json().get("createDisposition") == "legacy_put_create"
        assert r.headers.get("X-DS-Home-Task-Legacy-Put-Create") == "true"
        assert r.headers.get("Deprecation")
        db = SessionLocal()
        try:
            after = db.scalar(
                select(func.count()).select_from(AuditEventRecord).where(
                    AuditEventRecord.action == ACTION_LEGACY_PUT_CREATE
                )
            )
        finally:
            db.close()
        assert after == before + 1

    def test_openapi_includes_create_disposition_on_mutation_schema(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        r = client.get("/openapi.json")
        assert r.status_code == 200
        schema = r.json()
        mut = schema["components"]["schemas"].get("HomeProgramTaskMutationResponse")
        assert mut is not None
        props = mut.get("properties") or {}
        assert "createDisposition" in props

    def test_get_by_server_task_id(
        self, client: TestClient, auth_headers: dict, patient_id: str
    ) -> None:
        tid = "htask-by-srv"
        task = {
            "id": tid,
            "patientId": patient_id,
            "title": "Lookup",
            "type": "activity",
            "instructions": "x",
            "status": "active",
            "assignedAt": "2026-04-12T10:00:00.000Z",
        }
        created = client.post("/api/v1/home-program-tasks", json=task, headers=auth_headers["clinician"])
        sid = created.json()["serverTaskId"]
        r = client.get(f"/api/v1/home-program-tasks/by-server-id/{sid}", headers=auth_headers["clinician"])
        assert r.status_code == 200
        assert r.json()["id"] == tid
        assert r.json()["serverTaskId"] == sid

    def test_duplicate_external_id_other_patient_returns_409(
        self, client: TestClient, auth_headers: dict, patient_id: str
    ) -> None:
        resp = client.post(
            "/api/v1/patients",
            json={"first_name": "Other", "last_name": "Pt", "dob": "1991-02-20", "gender": "M"},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 201
        other_pid = resp.json()["id"]
        tid = "htask-cross-patient"
        task_a = {
            "id": tid,
            "patientId": patient_id,
            "title": "A",
            "type": "activity",
            "instructions": "x",
            "status": "active",
            "assignedAt": "2026-04-12T10:00:00.000Z",
        }
        assert client.post("/api/v1/home-program-tasks", json=task_a, headers=auth_headers["clinician"]).status_code == 200
        task_b = {**task_a, "patientId": other_pid, "title": "B"}
        r = client.post("/api/v1/home-program-tasks", json=task_b, headers=auth_headers["clinician"])
        assert r.status_code == 409
        assert r.json().get("code") == "patient_mismatch"


class TestPatientView:
    def test_patient_view_omits_tier(
        self, client: TestClient, auth_headers: dict, patient_id: str
    ) -> None:
        tid = "htask-pv-1"
        task = {
            "id": tid,
            "patientId": patient_id,
            "title": "PV",
            "type": "activity",
            "instructions": "x",
            "status": "active",
            "assignedAt": "2026-04-12T10:00:00.000Z",
            "homeProgramSelection": _valid_provenance(),
        }
        client.put(f"/api/v1/home-program-tasks/{tid}", json=task, headers=auth_headers["clinician"])
        r = client.get(f"/api/v1/home-program-tasks/{tid}/patient-view", headers=auth_headers["clinician"])
        assert r.status_code == 200
        hp = r.json().get("homeProgramSelection") or {}
        assert "confidenceTier" not in hp
        assert "confidenceScore" not in hp
