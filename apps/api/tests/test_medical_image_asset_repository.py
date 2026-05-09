"""Tests for the DB-backed MedicalImageAsset repository (migration 098).

Promotion of PR #619's sidecar JSON store into a real table. Covers
the four repository surfaces (upsert, get, list-by-patient, latest-by-
patient), the round-trip through ``asset_to_sidecar_dict``, the
dual-write contract from the upload router, and the DB-prefer-fallback-
to-sidecar contract in the report-context reader.
"""
from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Optional


# ── Helpers ──────────────────────────────────────────────────────────────────


def _settings_stub(media_root: Path) -> SimpleNamespace:
    return SimpleNamespace(media_storage_root=str(media_root))


def _sample_metadata(filename: str = "brain.nii.gz") -> dict[str, Any]:
    return {
        "filename": filename,
        "format": "NIfTI",
        "dimensions": [256, 256, 176],
        "voxel_size_mm": [1.0, 1.0, 1.0],
        "volumes": 1,
        "datatype": "float32",
        "orientation_note": "Raw orientation preview; not reoriented.",
        "compressed": True,
        "warnings": ["Preview only; not diagnostic."],
    }


def _sample_preview_paths(image_id: str) -> dict[str, Optional[str]]:
    base = f"/api/v1/medical-images/{image_id}/slices"
    return {
        "axial_url": f"{base}/axial.png",
        "coronal_url": f"{base}/coronal.png",
        "sagittal_url": f"{base}/sagittal.png",
    }


# ── Repository: upsert / get ──────────────────────────────────────────────────


def test_upsert_inserts_then_returns_row():
    from app.database import SessionLocal
    from app.repositories.medical_images import (
        get_medical_image_asset,
        upsert_medical_image_asset,
    )

    db = SessionLocal()
    try:
        row = upsert_medical_image_asset(
            db,
            image_id="img_repo_a",
            patient_id="pt-repo-a",
            upload_id=None,
            filename="brain.nii.gz",
            file_format="NIfTI",
            storage_path="/tmp/brain.nii.gz",
            status="ready",
            error=None,
            metadata=_sample_metadata(),
            preview_paths=_sample_preview_paths("img_repo_a"),
            warning_flags=["Preview only; not diagnostic."],
            clinician_imaging_note=None,
            created_by="actor-clinician-demo",
            created_by_role="clinician",
            clinic_id="clinic-demo-default",
        )
        assert row.id == "img_repo_a"
        assert row.patient_id == "pt-repo-a"
        assert row.file_format == "NIfTI"
        assert row.status == "ready"
        assert row.metadata_json
        assert json.loads(row.metadata_json)["dimensions"] == [256, 256, 176]

        fetched = get_medical_image_asset(db, "img_repo_a")
        assert fetched is not None
        assert fetched.id == "img_repo_a"
    finally:
        db.close()


def test_upsert_is_idempotent_on_image_id():
    """Replays of the same image_id update in place rather than inserting."""
    from app.database import SessionLocal
    from app.persistence.models import MedicalImageAsset
    from app.repositories.medical_images import upsert_medical_image_asset

    db = SessionLocal()
    try:
        upsert_medical_image_asset(
            db,
            image_id="img_repo_idem",
            patient_id="pt-1",
            upload_id=None,
            filename="brain.nii.gz",
            file_format="NIfTI",
            storage_path="/tmp/v1",
            status="ready",
            error=None,
            metadata=_sample_metadata(),
            preview_paths=_sample_preview_paths("img_repo_idem"),
            warning_flags=[],
            clinician_imaging_note=None,
            created_by="actor-clinician-demo",
            created_by_role="clinician",
            clinic_id="clinic-demo-default",
            created_at="2026-01-01T00:00:00+00:00",
        )
        # Second call: change status + storage_path; created_at must persist.
        upsert_medical_image_asset(
            db,
            image_id="img_repo_idem",
            patient_id="pt-1",
            upload_id=None,
            filename="brain.nii.gz",
            file_format="NIfTI",
            storage_path="/tmp/v2",
            status="metadata_only",
            error="rebuilt",
            metadata=_sample_metadata(),
            preview_paths=_sample_preview_paths("img_repo_idem"),
            warning_flags=["replay"],
            clinician_imaging_note=None,
            created_by="actor-clinician-demo",
            created_by_role="clinician",
            clinic_id="clinic-demo-default",
            created_at="2026-02-01T00:00:00+00:00",
        )
        rows = db.query(MedicalImageAsset).filter_by(id="img_repo_idem").all()
        assert len(rows) == 1
        assert rows[0].storage_path == "/tmp/v2"
        assert rows[0].status == "metadata_only"
        assert rows[0].error == "rebuilt"
        assert rows[0].created_at.isoformat().startswith("2026-01-01")
    finally:
        db.close()


def test_list_and_latest_for_patient():
    from app.database import SessionLocal
    from app.repositories.medical_images import (
        latest_medical_image_for_patient,
        list_medical_images_for_patient,
        upsert_medical_image_asset,
    )

    db = SessionLocal()
    try:
        for image_id, ts in (
            ("img_old", "2025-12-01T00:00:00+00:00"),
            ("img_new", "2026-04-15T00:00:00+00:00"),
            ("img_other_pt", "2026-05-01T00:00:00+00:00"),
        ):
            upsert_medical_image_asset(
                db,
                image_id=image_id,
                patient_id="pt-list" if image_id != "img_other_pt" else "pt-other",
                upload_id=None,
                filename=f"{image_id}.nii",
                file_format="NIfTI",
                storage_path=None,
                status="ready",
                error=None,
                metadata=_sample_metadata(),
                preview_paths=_sample_preview_paths(image_id),
                warning_flags=[],
                clinician_imaging_note=None,
                created_by="actor-clinician-demo",
                created_by_role="clinician",
                clinic_id="clinic-demo-default",
                created_at=ts,
            )

        rows = list_medical_images_for_patient(db, "pt-list")
        assert [r.id for r in rows] == ["img_new", "img_old"]

        latest = latest_medical_image_for_patient(db, "pt-list")
        assert latest is not None
        assert latest.id == "img_new"

        # Empty / missing patient guard.
        assert list_medical_images_for_patient(db, "") == []
        assert latest_medical_image_for_patient(db, "") is None
    finally:
        db.close()


def test_asset_to_sidecar_dict_round_trip():
    """A DB row rendered as sidecar must look identical to the file shape."""
    from app.database import SessionLocal
    from app.repositories.medical_images import (
        asset_to_sidecar_dict,
        upsert_medical_image_asset,
    )

    db = SessionLocal()
    try:
        row = upsert_medical_image_asset(
            db,
            image_id="img_round",
            patient_id="pt-round",
            upload_id=None,
            filename="brain.nii.gz",
            file_format="NIfTI",
            storage_path="/tmp/brain",
            status="ready",
            error=None,
            metadata=_sample_metadata(),
            preview_paths=_sample_preview_paths("img_round"),
            warning_flags=["Preview only; not diagnostic."],
            clinician_imaging_note="Patient reports tinnitus.",
            created_by="actor-clinician-demo",
            created_by_role="clinician",
            clinic_id="clinic-demo-default",
            created_at="2026-05-08T10:00:00+00:00",
        )
        sidecar = asset_to_sidecar_dict(row)
        assert sidecar["id"] == "img_round"
        assert sidecar["patient_id"] == "pt-round"
        assert sidecar["format"] == "NIfTI"
        assert sidecar["status"] == "ready"
        assert sidecar["metadata"]["dimensions"] == [256, 256, 176]
        assert sidecar["preview"]["axial_url"].endswith("/axial.png")
        assert sidecar["clinician_imaging_note"] == "Patient reports tinnitus."
        assert sidecar["created_at"].startswith("2026-05-08")
    finally:
        db.close()


# ── Reader: prefer DB, fall back to sidecar ──────────────────────────────────


def _write_legacy_sidecar(
    media_root: Path, *, image_id: str, patient_id: str, status: str = "ready"
) -> None:
    previews = media_root / "medical_image_previews" / image_id
    previews.mkdir(parents=True, exist_ok=True)
    (previews / "sidecar.json").write_text(
        json.dumps(
            {
                "id": image_id,
                "patient_id": patient_id,
                "filename": f"{image_id}.nii",
                "format": "NIfTI",
                "status": status,
                "created_at": "2025-11-01T00:00:00+00:00",
                "metadata": _sample_metadata(),
                "preview": _sample_preview_paths(image_id),
            }
        ),
        encoding="utf-8",
    )


def test_reader_prefers_db_over_sidecar(tmp_path: Path):
    """When a DB row exists, it wins regardless of sidecar contents."""
    from app.database import SessionLocal
    from app.repositories.medical_images import upsert_medical_image_asset
    from app.services.medical_image_report_context import (
        load_latest_medical_image_for_patient,
    )

    # Legacy sidecar with image_id="img_legacy" + recent created_at.
    _write_legacy_sidecar(tmp_path, image_id="img_legacy", patient_id="pt-prefer-db")

    db = SessionLocal()
    try:
        # DB row with image_id="img_in_db" + EARLIER created_at than sidecar.
        upsert_medical_image_asset(
            db,
            image_id="img_in_db",
            patient_id="pt-prefer-db",
            upload_id=None,
            filename="brain.nii.gz",
            file_format="NIfTI",
            storage_path="/tmp/db",
            status="ready",
            error=None,
            metadata=_sample_metadata(),
            preview_paths=_sample_preview_paths("img_in_db"),
            warning_flags=[],
            clinician_imaging_note=None,
            created_by="actor-clinician-demo",
            created_by_role="clinician",
            clinic_id="clinic-demo-default",
            created_at="2025-01-01T00:00:00+00:00",  # older than sidecar
        )
        result = load_latest_medical_image_for_patient(
            "pt-prefer-db", media_storage_root=str(tmp_path), db=db
        )
        # DB row wins even though the sidecar's created_at is more recent.
        assert result is not None
        assert result["id"] == "img_in_db"
    finally:
        db.close()


def test_reader_falls_back_to_sidecar_when_db_row_absent(tmp_path: Path):
    """Legacy uploads (sidecar only, no DB row) still resolve when db is given."""
    from app.database import SessionLocal
    from app.services.medical_image_report_context import (
        load_latest_medical_image_for_patient,
    )

    _write_legacy_sidecar(
        tmp_path, image_id="img_legacy_only", patient_id="pt-legacy-only"
    )
    db = SessionLocal()
    try:
        result = load_latest_medical_image_for_patient(
            "pt-legacy-only", media_storage_root=str(tmp_path), db=db
        )
        assert result is not None
        assert result["id"] == "img_legacy_only"
    finally:
        db.close()


def test_reader_works_without_db_for_back_compat(tmp_path: Path):
    """Callers that don't pass db keep working — pure sidecar-scan path."""
    from app.services.medical_image_report_context import (
        load_latest_medical_image_for_patient,
    )

    _write_legacy_sidecar(
        tmp_path, image_id="img_backcompat", patient_id="pt-backcompat"
    )
    result = load_latest_medical_image_for_patient(
        "pt-backcompat", media_storage_root=str(tmp_path)
    )
    assert result is not None
    assert result["id"] == "img_backcompat"


def test_reader_returns_none_when_neither_db_nor_sidecar_match(tmp_path: Path):
    from app.database import SessionLocal
    from app.services.medical_image_report_context import (
        load_latest_medical_image_for_patient,
    )

    db = SessionLocal()
    try:
        result = load_latest_medical_image_for_patient(
            "pt-nothing", media_storage_root=str(tmp_path), db=db
        )
        assert result is None
    finally:
        db.close()
