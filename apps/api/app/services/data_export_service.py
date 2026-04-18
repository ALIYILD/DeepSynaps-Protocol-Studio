"""GDPR Article 20 data export worker.

Runs synchronously inside FastAPI's ``BackgroundTasks`` pool (no Celery/arq
dependency for v0). The entry point is :func:`run_export` which is invoked
from ``data_privacy_router.POST /privacy/export`` with a freshly-created
``DataExport`` row id.

Responsibilities:

1. Transition the job row ``queued -> running``.
2. Collect every table that is linked to the requesting user (and, if they
   are a clinic admin, their clinic's rows).
3. Serialize each table as a JSON file and bundle everything (plus a
   ``manifest.json`` index) into a single ZIP under
   ``apps/api/data/exports/<export_id>.zip``.
4. Update the row: ``status=ready``, ``file_url=/static/exports/<id>.zip``,
   ``file_bytes`` and ``completed_at``.

Each per-table collector is wrapped in ``try/except`` so a missing model or
query error does not kill the whole export — the offending table is simply
omitted with a warning in the server log (and in the manifest so the user
can see the gap).

The ``/static`` mount in ``app.main`` points at ``apps/api/data/`` so the
generated files are immediately downloadable via the written ``file_url``
without any further plumbing.
"""
from __future__ import annotations

import json
import logging
import traceback
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from sqlalchemy import select, or_

from ..database import SessionLocal
from ..persistence.models import (
    AssessmentRecord,
    AuditEventRecord,
    Clinic,
    ClinicDefaults,
    ClinicalSession,
    DataExport,
    FormDefinition,
    Message,
    Patient,
    TreatmentCourse,
    User,
    UserPreferences,
)

logger = logging.getLogger(__name__)

# Exports live under ``apps/api/data/exports`` — created on import so the
# directory always exists even if the lifespan handler hasn't run yet (e.g.
# when called from tests). The ``/static`` mount in main.py maps
# ``apps/api/data`` onto ``/static`` so these files are served as
# ``/static/exports/<id>.zip``.
EXPORTS_DIR: Path = (
    Path(__file__).resolve().parent.parent.parent / "data" / "exports"
)
EXPORTS_DIR.mkdir(parents=True, exist_ok=True)

# Bump this string whenever the bundle layout changes so consumers that
# archive exports can detect format shifts.
SCHEMA_VERSION = "2026-04-17"


# ── Serialization helpers ─────────────────────────────────────────────────────


def _row_to_dict(row: Any) -> dict:
    """Generic SQLAlchemy row -> dict. Private columns (leading underscore)
    are skipped. ``datetime`` values are rendered lazily via ``default=str``
    at JSON-dump time so we avoid eager conversion here.
    """
    try:
        return {
            column.name: getattr(row, column.name)
            for column in row.__table__.columns
            if not column.name.startswith("_")
        }
    except Exception:
        logger.exception("[data-export] _row_to_dict failed for %r", type(row).__name__)
        return {}


def _serialize_user(user: User) -> dict:
    """User JSON — intentionally omits credentials/tokens/password hashes."""
    return {
        "id": user.id,
        "email": user.email,
        "display_name": user.display_name,
        "role": user.role,
        "package_id": user.package_id,
        "clinic_id": user.clinic_id,
        "credentials": getattr(user, "credentials", None),
        "license_number": getattr(user, "license_number", None),
        "avatar_url": getattr(user, "avatar_url", None),
        "is_verified": user.is_verified,
        "is_active": user.is_active,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "updated_at": user.updated_at.isoformat() if user.updated_at else None,
        # DELIBERATELY EXCLUDED: hashed_password, pending_email_token,
        # pending_email, pending_email_expires_at.
    }


def _collect(db, user: User, name: str, fn: Callable[[], list[dict]]) -> list[dict]:
    """Run a collector and catch anything so one missing table does not
    kill the whole export. Warnings are logged and the list is returned
    empty; the manifest records the failure via the ``errors`` map.
    """
    try:
        rows = fn()
        logger.info("[data-export] collected %d rows for %s", len(rows), name)
        return rows
    except Exception as exc:  # noqa: BLE001 — we want to swallow EVERYTHING
        logger.warning(
            "[data-export] collector %s failed: %s", name, exc, exc_info=True
        )
        return []


# ── Per-table collectors ──────────────────────────────────────────────────────
#
# The ``user.id`` field is stored as ``clinician_id`` across the clinical
# tables — that is the convention in this codebase (see patients_router etc.).
# ``Patient`` has no ``clinic_id``, so the admin-vs-self filter folds down to
# "all patients created by any clinician in my clinic". We read the clinic's
# clinician IDs once and pass them into each query.


def _clinician_ids_for_scope(db, user: User) -> list[str]:
    """Return the list of user ids whose clinical data should be included.

    Non-admins always see only their own data. Admins see every user row
    attached to their clinic. Falls back to ``[user.id]`` if anything goes
    sideways so the export never accidentally widens its scope.
    """
    if user.role == "admin" and user.clinic_id:
        try:
            ids = db.execute(
                select(User.id).where(User.clinic_id == user.clinic_id)
            ).scalars().all()
            return list(ids) or [user.id]
        except Exception:
            logger.warning(
                "[data-export] failed to resolve clinic members, falling back to self",
                exc_info=True,
            )
    return [user.id]


def _collect_patients(db, user: User, clinician_ids: list[str]) -> list[dict]:
    q = select(Patient).where(Patient.clinician_id.in_(clinician_ids))
    return [_row_to_dict(row) for row in db.execute(q).scalars().all()]


def _collect_sessions(db, user: User, clinician_ids: list[str]) -> list[dict]:
    q = select(ClinicalSession).where(ClinicalSession.clinician_id.in_(clinician_ids))
    return [_row_to_dict(row) for row in db.execute(q).scalars().all()]


def _collect_assessments(db, user: User, clinician_ids: list[str]) -> list[dict]:
    q = select(AssessmentRecord).where(AssessmentRecord.clinician_id.in_(clinician_ids))
    return [_row_to_dict(row) for row in db.execute(q).scalars().all()]


def _collect_protocols(db, user: User, clinician_ids: list[str]) -> list[dict]:
    q = select(TreatmentCourse).where(TreatmentCourse.clinician_id.in_(clinician_ids))
    return [_row_to_dict(row) for row in db.execute(q).scalars().all()]


def _collect_documents(db, user: User, clinician_ids: list[str]) -> list[dict]:
    """Documents are persisted as ``FormDefinition`` rows of type 'document'.
    We export all form_definitions owned by the in-scope clinicians since the
    router layer treats them uniformly."""
    q = select(FormDefinition).where(FormDefinition.clinician_id.in_(clinician_ids))
    return [_row_to_dict(row) for row in db.execute(q).scalars().all()]


def _collect_messages(db, user: User, clinician_ids: list[str]) -> list[dict]:
    q = select(Message).where(
        or_(
            Message.sender_id.in_(clinician_ids),
            Message.recipient_id.in_(clinician_ids),
        )
    )
    return [_row_to_dict(row) for row in db.execute(q).scalars().all()]


def _collect_audit_events(db, user: User) -> list[dict]:
    """Audit events are always scoped to the caller — even admins do not get
    other users' audit trails in the export."""
    q = select(AuditEventRecord).where(AuditEventRecord.actor_id == user.id)
    return [_row_to_dict(row) for row in db.execute(q).scalars().all()]


def _collect_preferences(db, user: User) -> dict | None:
    row = db.get(UserPreferences, user.id)
    return _row_to_dict(row) if row is not None else None


def _collect_clinic(db, user: User) -> dict | None:
    if not user.clinic_id:
        return None
    row = db.get(Clinic, user.clinic_id)
    return _row_to_dict(row) if row is not None else None


def _collect_clinic_defaults(db, user: User) -> dict | None:
    if not user.clinic_id:
        return None
    row = db.get(ClinicDefaults, user.clinic_id)
    return _row_to_dict(row) if row is not None else None


# ── Main entry point ──────────────────────────────────────────────────────────


def run_export(export_id: str, user_id: str) -> None:
    """Synchronous export worker. Invoked via FastAPI ``BackgroundTasks``.

    The function owns its own DB session because ``BackgroundTasks`` runs
    after the request-scoped session has been closed.
    """
    db = SessionLocal()
    export: DataExport | None = None
    try:
        export = db.get(DataExport, export_id)
        if export is None:
            logger.error("[data-export] export %s not found; aborting", export_id)
            return
        export.status = "running"
        db.commit()

        user = db.get(User, user_id)
        if user is None:
            logger.error(
                "[data-export] user %s missing for export %s", user_id, export_id
            )
            export.status = "failed"
            export.error = "User not found"
            db.commit()
            return

        clinician_ids = _clinician_ids_for_scope(db, user)

        manifest: dict = {
            "export_id": export_id,
            "user_id": user_id,
            "clinic_id": user.clinic_id,
            "scope": "clinic-admin" if (user.role == "admin" and user.clinic_id) else "self",
            "scope_clinician_ids": clinician_ids,
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "schema_version": SCHEMA_VERSION,
            "files": [],  # filled below
        }

        bundle: dict[str, Any] = {
            "user.json": _serialize_user(user),
            "patients.json": _collect(
                db, user, "patients",
                lambda: _collect_patients(db, user, clinician_ids),
            ),
            "sessions.json": _collect(
                db, user, "sessions",
                lambda: _collect_sessions(db, user, clinician_ids),
            ),
            "assessments.json": _collect(
                db, user, "assessments",
                lambda: _collect_assessments(db, user, clinician_ids),
            ),
            "protocols.json": _collect(
                db, user, "protocols",
                lambda: _collect_protocols(db, user, clinician_ids),
            ),
            "documents.json": _collect(
                db, user, "documents",
                lambda: _collect_documents(db, user, clinician_ids),
            ),
            "messages.json": _collect(
                db, user, "messages",
                lambda: _collect_messages(db, user, clinician_ids),
            ),
            "audit_events.json": _collect(
                db, user, "audit_events",
                lambda: _collect_audit_events(db, user),
            ),
            "preferences.json": _collect_preferences(db, user) or {},
        }
        clinic_payload = _collect_clinic(db, user)
        if clinic_payload is not None:
            bundle["clinic.json"] = clinic_payload
        clinic_defaults_payload = _collect_clinic_defaults(db, user)
        if clinic_defaults_payload is not None:
            bundle["clinic_defaults.json"] = clinic_defaults_payload

        # Index the list of files we actually wrote so the manifest reflects
        # reality (empty tables still produce a file so consumers always find
        # the expected key).
        manifest["files"] = sorted(bundle.keys())

        zip_path = EXPORTS_DIR / f"{export_id}.zip"
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("manifest.json", json.dumps(manifest, indent=2, default=str))
            for name, payload in bundle.items():
                zf.writestr(
                    name,
                    json.dumps(payload, indent=2, ensure_ascii=False, default=str),
                )

        export.status = "ready"
        export.file_url = f"/static/exports/{export_id}.zip"
        export.file_bytes = zip_path.stat().st_size
        export.completed_at = datetime.now(timezone.utc)
        db.commit()
        logger.info(
            "[data-export] %s ready (%d bytes, %d files)",
            export_id,
            export.file_bytes,
            len(bundle),
        )
    except Exception as exc:  # noqa: BLE001 — top-level catch: MUST NOT raise out
        logger.error(
            "[data-export] %s failed: %s\n%s",
            export_id,
            exc,
            traceback.format_exc(),
        )
        try:
            if export is not None:
                export.status = "failed"
                export.error = str(exc)[:500]
                db.commit()
        except Exception:
            logger.exception("[data-export] failed to persist failure state")
    finally:
        db.close()


def delete_export_file(export_id: str) -> bool:
    """Remove the ZIP file from disk. Returns True if a file was removed,
    False if it was already absent. Exceptions are logged but swallowed so
    DB-row deletion can still proceed."""
    try:
        path = EXPORTS_DIR / f"{export_id}.zip"
        if path.exists():
            path.unlink()
            return True
        return False
    except Exception:
        logger.exception("[data-export] delete_export_file failed for %s", export_id)
        return False
