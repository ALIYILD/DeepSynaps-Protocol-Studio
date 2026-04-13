"""Serialize home program tasks for API responses, export, and audit (clinician vs patient-safe)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.persistence.models import ClinicianHomeProgramTask

# Client-only fields that must never be persisted in task_json.
CLIENT_TRANSIENT_KEYS = frozenset(
    {
        "lastKnownServerRevision",
        "_syncStatus",
        "_syncConflictReason",
        "_conflictServerTask",
        # API response contract — never persist
        "createDisposition",
    }
)

# Request-only (not stored in task_json).
REQUEST_ONLY_KEYS = frozenset({"lastKnownServerRevision"})


def _iso(dt: datetime | None) -> str:
    if dt is None:
        return datetime.now(timezone.utc).isoformat()
    if isinstance(dt, datetime):
        if dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc).isoformat()
        return dt.isoformat()
    return str(dt)


def strip_request_only_fields(body: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in body.items() if k not in REQUEST_ONLY_KEYS}


def strip_client_transient_fields(task: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in task.items() if k not in CLIENT_TRANSIENT_KEYS}


def enrich_task_dict_from_row(task: dict[str, Any], row: ClinicianHomeProgramTask) -> dict[str, Any]:
    """Overlay authoritative sync metadata from the DB row (deterministic read path)."""
    out = {**task}
    out["serverTaskId"] = row.server_task_id
    out["serverRevision"] = row.revision
    out["serverCreatedAt"] = _iso(row.created_at)
    out["serverUpdatedAt"] = _iso(row.updated_at)
    out["lastSyncedAt"] = _iso(row.updated_at)
    return out


def task_dict_for_clinician_audit(task: dict[str, Any], row: ClinicianHomeProgramTask) -> dict[str, Any]:
    """Full clinician/audit record for future export bundles (includes provenance)."""
    base = enrich_task_dict_from_row(task, row)
    return {
        "task_id": base.get("id"),
        "patient_id": row.patient_id,
        "clinician_id": row.clinician_id,
        "revision": row.revision,
        "server_created_at": _iso(row.created_at),
        "server_updated_at": _iso(row.updated_at),
        "payload": base,
    }


def task_dict_for_export_stub(task: dict[str, Any], row: ClinicianHomeProgramTask) -> dict[str, Any]:
    """Stable audit/export projection (versioned; extend for bulk DOCX/JSON later)."""
    hp = task.get("homeProgramSelection") if isinstance(task.get("homeProgramSelection"), dict) else None
    prov_summary = None
    if hp:
        prov_summary = {
            "conditionId": hp.get("conditionId"),
            "provenanceVersion": hp.get("provenanceVersion"),
            "templateId": hp.get("templateId"),
        }
    enriched = enrich_task_dict_from_row(task, row)
    return {
        "schema_version": 1,
        "server_task_id": row.server_task_id,
        "external_task_id": row.id,
        "patient_id": row.patient_id,
        "clinician_id": row.clinician_id,
        "revision": row.revision,
        "server_created_at": _iso(row.created_at),
        "server_updated_at": _iso(row.updated_at),
        "provenance_summary": prov_summary,
        "provenance": hp,
        "payload": enriched,
    }
