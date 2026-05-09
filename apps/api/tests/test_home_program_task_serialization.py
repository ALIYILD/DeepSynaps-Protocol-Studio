"""Unit tests for app.services.home_program_task_serialization.

Pure-logic module; no DB required — all ORM rows are MagicMock stubs.
"""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import MagicMock

import pytest

from app.services.home_program_task_serialization import (
    CLIENT_TRANSIENT_KEYS,
    REQUEST_ONLY_KEYS,
    enrich_task_dict_from_row,
    strip_client_transient_fields,
    strip_request_only_fields,
    task_dict_for_clinician_audit,
    task_dict_for_export_stub,
)


# ── helpers ───────────────────────────────────────────────────────────────────

def _mock_row(
    server_task_id="srv-001",
    revision=3,
    created_at=None,
    updated_at=None,
    patient_id="pat-1",
    clinician_id="clin-1",
    external_id="ext-001",
):
    row = MagicMock()
    row.server_task_id = server_task_id
    row.revision = revision
    row.created_at = created_at or datetime(2024, 6, 1, tzinfo=timezone.utc)
    row.updated_at = updated_at or datetime(2024, 7, 1, tzinfo=timezone.utc)
    row.patient_id = patient_id
    row.clinician_id = clinician_id
    row.id = external_id
    return row


# ── strip helpers ─────────────────────────────────────────────────────────────

class TestStripRequestOnlyFields:
    def test_removes_last_known_server_revision(self):
        body = {"lastKnownServerRevision": 5, "title": "Exercise"}
        assert strip_request_only_fields(body) == {"title": "Exercise"}

    def test_no_removal_when_key_absent(self):
        body = {"title": "Meditation", "freq": 3}
        assert strip_request_only_fields(body) == body

    def test_returns_new_dict(self):
        body = {"lastKnownServerRevision": 1}
        result = strip_request_only_fields(body)
        assert result is not body
        assert result == {}


class TestStripClientTransientFields:
    def test_removes_all_transient_keys(self):
        task = {
            "id": "t-1",
            "_syncStatus": "synced",
            "_syncConflictReason": "version mismatch",
            "_conflictServerTask": {"id": "srv-t-1"},
            "createDisposition": "new",
            "lastKnownServerRevision": 2,
            "title": "Run",
        }
        result = strip_client_transient_fields(task)
        for key in CLIENT_TRANSIENT_KEYS:
            assert key not in result
        assert result["id"] == "t-1"
        assert result["title"] == "Run"

    def test_non_transient_keys_preserved(self):
        task = {"title": "Walk", "freq": 5}
        assert strip_client_transient_fields(task) == task


# ── enrich_task_dict_from_row ─────────────────────────────────────────────────

class TestEnrichTaskDictFromRow:
    def test_injects_server_metadata(self):
        row = _mock_row(server_task_id="srv-42", revision=7)
        result = enrich_task_dict_from_row({"id": "ext-1"}, row)
        assert result["serverTaskId"] == "srv-42"
        assert result["serverRevision"] == 7
        assert "serverCreatedAt" in result
        assert "serverUpdatedAt" in result
        assert "lastSyncedAt" in result

    def test_original_keys_preserved(self):
        row = _mock_row()
        result = enrich_task_dict_from_row({"title": "Sleep hygiene"}, row)
        assert result["title"] == "Sleep hygiene"

    def test_naive_datetime_gets_utc(self):
        naive_dt = datetime(2024, 1, 15, 10, 0, 0)  # no tzinfo
        row = _mock_row(created_at=naive_dt)
        result = enrich_task_dict_from_row({}, row)
        assert "+00:00" in result["serverCreatedAt"] or "UTC" in result["serverCreatedAt"] or "Z" in result["serverCreatedAt"] or result["serverCreatedAt"].endswith("+00:00")

    def test_none_datetime_defaults_to_now(self):
        row = _mock_row()
        row.created_at = None
        result = enrich_task_dict_from_row({}, row)
        # Should not raise and should produce a valid ISO string
        assert isinstance(result["serverCreatedAt"], str)
        assert len(result["serverCreatedAt"]) > 10


# ── task_dict_for_clinician_audit ─────────────────────────────────────────────

class TestTaskDictForClinicianAudit:
    def test_contains_required_audit_keys(self):
        row = _mock_row(patient_id="pat-99", clinician_id="clin-5", revision=2)
        task = {"id": "task-a", "title": "Balance training"}
        result = task_dict_for_clinician_audit(task, row)
        for key in ("task_id", "patient_id", "clinician_id", "revision", "payload"):
            assert key in result, f"Missing key: {key}"

    def test_patient_id_from_row(self):
        row = _mock_row(patient_id="pat-77")
        result = task_dict_for_clinician_audit({}, row)
        assert result["patient_id"] == "pat-77"

    def test_payload_includes_server_metadata(self):
        row = _mock_row(server_task_id="srv-999")
        result = task_dict_for_clinician_audit({}, row)
        assert result["payload"]["serverTaskId"] == "srv-999"


# ── task_dict_for_export_stub ─────────────────────────────────────────────────

class TestTaskDictForExportStub:
    def test_schema_version_is_one(self):
        row = _mock_row()
        result = task_dict_for_export_stub({}, row)
        assert result["schema_version"] == 1

    def test_provenance_summary_populated_when_present(self):
        hp = {
            "conditionId": "cond-adhd",
            "provenanceVersion": "2.1",
            "templateId": "tpl-7",
        }
        task = {"homeProgramSelection": hp}
        row = _mock_row()
        result = task_dict_for_export_stub(task, row)
        prov = result["provenance_summary"]
        assert prov is not None
        assert prov["conditionId"] == "cond-adhd"
        assert prov["templateId"] == "tpl-7"

    def test_provenance_summary_none_when_no_hp(self):
        row = _mock_row()
        result = task_dict_for_export_stub({}, row)
        assert result["provenance_summary"] is None

    def test_contains_server_task_id(self):
        row = _mock_row(server_task_id="srv-export-1")
        result = task_dict_for_export_stub({}, row)
        assert result["server_task_id"] == "srv-export-1"

    def test_clinical_ids_not_swapped(self):
        row = _mock_row(patient_id="pat-A", clinician_id="clin-B")
        result = task_dict_for_export_stub({}, row)
        assert result["patient_id"] == "pat-A"
        assert result["clinician_id"] == "clin-B"
