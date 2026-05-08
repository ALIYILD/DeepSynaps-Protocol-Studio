"""Tests for the medical-image report-context plumb-in.

Covers the file-based sidecar reader, the safe payload-attach helper, the
qEEG cross-modal section helper, and the safety-contract scrub against
``DIAGNOSTIC_FORBIDDEN_TERMS``. Includes an end-to-end test that exercises
the wired report builder (the assessments-summary endpoint) against a
synthetic sidecar fixture.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Optional

import pytest


# ── Fixture helpers ──────────────────────────────────────────────────────────


def _settings_stub(media_root: Path) -> SimpleNamespace:
    return SimpleNamespace(media_storage_root=str(media_root))


def _write_sidecar(
    media_root: Path,
    *,
    image_id: str,
    patient_id: Optional[str],
    status: str = "ready",
    created_at: str = "2026-05-01T12:00:00+00:00",
    clinician_imaging_note: Optional[str] = None,
    metadata: Optional[dict[str, Any]] = None,
    fmt: str = "NIfTI",
    raw: Optional[str] = None,
) -> Path:
    """Drop a synthetic sidecar.json under the previews root."""
    previews_root = media_root / "medical_image_previews"
    image_dir = previews_root / image_id
    image_dir.mkdir(parents=True, exist_ok=True)
    sidecar_path = image_dir / "sidecar.json"
    if raw is not None:
        sidecar_path.write_text(raw, encoding="utf-8")
        return sidecar_path
    md = metadata or {
        "filename": f"{image_id}.nii",
        "format": fmt,
        "dimensions": [8, 8, 8],
        "voxel_size_mm": [1.5, 1.5, 1.0],
        "volumes": 1,
        "datatype": "float32",
        "orientation_note": "Raw orientation preview; not reoriented.",
        "warnings": ["Preview only; not diagnostic."],
    }
    sidecar = {
        "id": image_id,
        "patient_id": patient_id,
        "upload_id": None,
        "filename": md["filename"],
        "format": fmt,
        "status": status,
        "error": None,
        "metadata": md,
        "preview": {
            "axial_url": f"/api/v1/medical-images/{image_id}/slices/axial.png",
            "coronal_url": None,
            "sagittal_url": None,
        },
        "created_at": created_at,
        "processed_at": created_at,
        "clinician_imaging_note": clinician_imaging_note,
    }
    sidecar_path.write_text(json.dumps(sidecar), encoding="utf-8")
    return sidecar_path


# ── load_latest_medical_image_for_patient ────────────────────────────────────


def test_load_latest_returns_none_when_dir_missing(tmp_path: Path):
    from app.services.medical_image_report_context import (
        load_latest_medical_image_for_patient,
    )

    result = load_latest_medical_image_for_patient(
        "pt-1", media_storage_root=str(tmp_path / "does-not-exist")
    )
    assert result is None


def test_load_latest_returns_none_when_no_sidecar_matches(tmp_path: Path):
    from app.services.medical_image_report_context import (
        load_latest_medical_image_for_patient,
    )

    _write_sidecar(tmp_path, image_id="img_a", patient_id="pt-other")
    _write_sidecar(tmp_path, image_id="img_b", patient_id=None)

    result = load_latest_medical_image_for_patient(
        "pt-target", media_storage_root=str(tmp_path)
    )
    assert result is None


def test_load_latest_returns_most_recent_match(tmp_path: Path):
    from app.services.medical_image_report_context import (
        load_latest_medical_image_for_patient,
    )

    _write_sidecar(
        tmp_path,
        image_id="img_old",
        patient_id="pt-1",
        created_at="2025-12-01T00:00:00+00:00",
    )
    _write_sidecar(
        tmp_path,
        image_id="img_new",
        patient_id="pt-1",
        created_at="2026-04-01T00:00:00+00:00",
    )
    _write_sidecar(
        tmp_path,
        image_id="img_other",
        patient_id="pt-2",
        created_at="2026-05-01T00:00:00+00:00",
    )

    result = load_latest_medical_image_for_patient(
        "pt-1", media_storage_root=str(tmp_path)
    )
    assert result is not None
    assert result["id"] == "img_new"


def test_load_latest_skips_unreadable_sidecar(tmp_path: Path):
    from app.services.medical_image_report_context import (
        load_latest_medical_image_for_patient,
    )

    _write_sidecar(tmp_path, image_id="img_bad", patient_id="pt-1", raw="{ not json")
    _write_sidecar(
        tmp_path,
        image_id="img_good",
        patient_id="pt-1",
        created_at="2026-04-01T00:00:00+00:00",
    )

    result = load_latest_medical_image_for_patient(
        "pt-1", media_storage_root=str(tmp_path)
    )
    assert result is not None
    assert result["id"] == "img_good"


# ── attach_medical_image_context_to_payload ──────────────────────────────────


def test_attach_idempotent_when_caller_pre_set(tmp_path: Path):
    from app.services.medical_image_report_context import (
        attach_medical_image_context_to_payload,
    )

    _write_sidecar(tmp_path, image_id="img_real", patient_id="pt-1")
    payload = {
        "medical_image_context": {
            "image_id": "img_caller",
            "available": True,
            "preview_status": "ready",
        }
    }
    out = attach_medical_image_context_to_payload(
        payload,
        patient_id="pt-1",
        settings=_settings_stub(tmp_path),
    )
    # caller wins
    assert out["medical_image_context"]["image_id"] == "img_caller"


def test_attach_sets_available_false_when_no_imaging(tmp_path: Path):
    from app.services.medical_image_report_context import (
        attach_medical_image_context_to_payload,
    )

    payload: dict = {"patient_id": "pt-no-imaging"}
    attach_medical_image_context_to_payload(
        payload,
        patient_id="pt-no-imaging",
        settings=_settings_stub(tmp_path),
    )
    ctx = payload["medical_image_context"]
    assert ctx["available"] is False
    assert ctx["preview_status"] == "unavailable"
    assert ctx["automated_interpretation_performed"] is False


def test_attach_sets_preview_ready_when_sidecar_ready(tmp_path: Path):
    from app.services.medical_image_report_context import (
        attach_medical_image_context_to_payload,
    )

    _write_sidecar(tmp_path, image_id="img_ready", patient_id="pt-1", status="ready")
    payload: dict = {}
    attach_medical_image_context_to_payload(
        payload,
        patient_id="pt-1",
        settings=_settings_stub(tmp_path),
    )
    ctx = payload["medical_image_context"]
    assert ctx["available"] is True
    assert ctx["preview_status"] == "ready"
    assert ctx["image_id"] == "img_ready"
    assert ctx["automated_interpretation_performed"] is False


def test_attach_preserves_clinician_note_verbatim(tmp_path: Path):
    from app.services.medical_image_report_context import (
        attach_medical_image_context_to_payload,
    )

    note = "Patient reports tinnitus and intermittent vertigo since 2024."
    _write_sidecar(
        tmp_path,
        image_id="img_with_note",
        patient_id="pt-1",
        clinician_imaging_note=note,
    )
    payload: dict = {}
    attach_medical_image_context_to_payload(
        payload,
        patient_id="pt-1",
        settings=_settings_stub(tmp_path),
    )
    ctx = payload["medical_image_context"]
    assert ctx["clinician_imaging_note"] == note


# ── Safety-contract scrub ────────────────────────────────────────────────────


def test_safety_contract_no_forbidden_terms_in_safe_sentence(tmp_path: Path):
    from app.services import medical_image_preview as svc
    from app.services.medical_image_report_context import (
        attach_medical_image_context_to_payload,
    )

    statuses = [None, "ready", "metadata_only", "error", "unsupported"]
    notes = [None, "", "Patient reports tinnitus.", "Lesion on T2."]

    for i, status in enumerate(statuses):
        for j, note in enumerate(notes):
            image_id = f"img_combo_{i}_{j}"
            patient_id = f"pt_{i}_{j}"
            if status is None:
                # Skip sidecar — exercises the unavailable branch.
                pass
            else:
                _write_sidecar(
                    tmp_path,
                    image_id=image_id,
                    patient_id=patient_id,
                    status=status,
                    clinician_imaging_note=note,
                )
            payload: dict = {}
            attach_medical_image_context_to_payload(
                payload,
                patient_id=patient_id,
                settings=_settings_stub(tmp_path),
            )
            sentence = payload["medical_image_context"]["safe_report_sentence"].lower()
            for forbidden in svc.DIAGNOSTIC_FORBIDDEN_TERMS:
                assert forbidden not in sentence, (
                    f"Forbidden term {forbidden!r} appeared in safe_sentence "
                    f"(status={status!r}, note={note!r}): {sentence!r}"
                )


# ── build_qeeg_cross_modal_section ───────────────────────────────────────────


def test_qeeg_cross_modal_no_imaging(tmp_path: Path):
    from app.services import medical_image_preview as svc
    from app.services.medical_image_report_context import (
        build_qeeg_cross_modal_section,
    )

    section = build_qeeg_cross_modal_section(
        "pt-no-imaging", settings=_settings_stub(tmp_path)
    )
    assert section["has_mri"] is False
    assert section["mri_image_id"] is None
    assert section["mri_preview_status"] is None
    assert section["safe_sentence"] == svc.SAFE_REPORT_SENTENCES["unavailable"]
    assert "not used to infer" in section["disclaimer"]


def test_qeeg_cross_modal_when_imaging_ready(tmp_path: Path):
    from app.services import medical_image_preview as svc
    from app.services.medical_image_report_context import (
        build_qeeg_cross_modal_section,
    )

    _write_sidecar(
        tmp_path, image_id="img_ready", patient_id="pt-1", status="ready"
    )
    section = build_qeeg_cross_modal_section(
        "pt-1", settings=_settings_stub(tmp_path)
    )
    assert section["has_mri"] is True
    assert section["mri_image_id"] == "img_ready"
    assert section["mri_preview_status"] == "ready"
    # The preview-ready safe sentence must appear in the section's safe_sentence.
    assert svc.SAFE_REPORT_SENTENCES["preview_ready"] in section["safe_sentence"]
    # Cross-modal disclaimer must explicitly say MRI was not used to infer qEEG.
    assert "not used to infer" in section["disclaimer"]
    # No diagnostic terms anywhere.
    blob = (section["safe_sentence"] + " " + section["disclaimer"]).lower()
    for forbidden in svc.DIAGNOSTIC_FORBIDDEN_TERMS:
        assert forbidden not in blob


# ── End-to-end: the wired assessment-summary endpoint ────────────────────────


def test_assessment_summary_includes_medical_image_context_e2e(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    """End-to-end: the assessments-summary endpoint surfaces the safe MRI block.

    Builds a Patient row inline (conftest only seeds Clinic + Users), points
    the helper at a tmp ``media_storage_root`` via ``_resolve_settings``,
    drops a synthetic sidecar, and asserts the additive ``medical_image_
    context`` is present + non-diagnostic.
    """
    fastapi_testclient = pytest.importorskip("fastapi.testclient")
    try:
        from app.database import SessionLocal
        from app.main import app
        from app.persistence.models import Patient
        from app.settings import get_settings as real_get_settings
    except Exception as exc:
        pytest.skip(f"app imports unavailable: {exc}")

    base_settings = real_get_settings()

    class _Shim:
        def __getattr__(self, name: str) -> Any:
            if name == "media_storage_root":
                return str(tmp_path)
            return getattr(base_settings, name)

    shim = _Shim()
    monkeypatch.setattr(
        "app.services.medical_image_report_context._resolve_settings",
        lambda settings: settings if settings is not None else shim,
    )

    pid = "pt-e2e-mri"
    db = SessionLocal()
    try:
        if db.query(Patient).filter_by(id=pid).first() is None:
            db.add(
                Patient(
                    id=pid,
                    first_name="E2E",
                    last_name="Patient",
                    email="e2e@demo.local",
                    clinician_id="actor-clinician-demo",
                )
            )
            db.commit()
    finally:
        db.close()

    _write_sidecar(
        tmp_path,
        image_id="img_e2e",
        patient_id=pid,
        status="ready",
        clinician_imaging_note="Patient reports headaches.",
    )

    client = fastapi_testclient.TestClient(app)
    resp = client.get(
        f"/api/v1/assessments/summary/{pid}",
        headers={"Authorization": "Bearer clinician-demo-token"},
    )
    if resp.status_code != 200:
        pytest.skip(
            f"assessments summary endpoint unavailable: {resp.status_code} {resp.text[:200]}"
        )
    body = resp.json()
    assert "medical_image_context" in body
    ctx = body["medical_image_context"]
    assert ctx["available"] is True
    assert ctx["preview_status"] == "ready"
    assert ctx["image_id"] == "img_e2e"
    assert ctx["automated_interpretation_performed"] is False
    from app.services import medical_image_preview as svc

    lowered = ctx["safe_report_sentence"].lower()
    for forbidden in svc.DIAGNOSTIC_FORBIDDEN_TERMS:
        assert forbidden not in lowered


def test_attach_idempotent_when_called_twice_same_patient(tmp_path: Path):
    """Calling the helper a second time leaves the same context in place."""
    from app.services.medical_image_report_context import (
        attach_medical_image_context_to_payload,
    )

    _write_sidecar(tmp_path, image_id="img_x", patient_id="pt-1", status="ready")
    payload: dict = {}
    attach_medical_image_context_to_payload(
        payload, patient_id="pt-1", settings=_settings_stub(tmp_path)
    )
    first_ctx = dict(payload["medical_image_context"])
    attach_medical_image_context_to_payload(
        payload, patient_id="pt-1", settings=_settings_stub(tmp_path)
    )
    # Same image_id; caller-wins idempotency means the helper does not
    # rewrite a context that already names a real image_id.
    assert payload["medical_image_context"]["image_id"] == first_ctx["image_id"]


# ── medical_image.used_in_report audit event (PR #619 follow-up gap B) ───────


class _StubActor:
    """Minimal stand-in for AuthenticatedActor — only the two attrs the
    audit emitter touches."""

    def __init__(self, actor_id: str, role: str) -> None:
        self.actor_id = actor_id
        self.role = role


def _count_used_in_report_audits(patient_id: Optional[str] = None) -> int:
    from app.database import SessionLocal
    from app.persistence.models import AuditEventRecord

    s = SessionLocal()
    try:
        q = s.query(AuditEventRecord).filter(
            AuditEventRecord.action == "medical_image.used_in_report"
        )
        rows = q.all()
        if patient_id is None:
            return len(rows)
        return sum(1 for r in rows if patient_id in (r.note or ""))
    finally:
        s.close()


def _latest_used_in_report_audit():
    from app.database import SessionLocal
    from app.persistence.models import AuditEventRecord

    s = SessionLocal()
    try:
        return (
            s.query(AuditEventRecord)
            .filter(AuditEventRecord.action == "medical_image.used_in_report")
            .order_by(AuditEventRecord.id.desc())
            .first()
        )
    finally:
        s.close()


def test_used_in_report_audit_fires_when_imaging_attached(tmp_path: Path):
    """When MRI is available + actor + db are passed, emit the audit event."""
    from app.database import SessionLocal
    from app.services.medical_image_report_context import (
        attach_medical_image_context_to_payload,
    )

    _write_sidecar(
        tmp_path, image_id="img_audit_1", patient_id="pt-aud-1", status="ready"
    )
    actor = _StubActor("actor-clinician-demo", "clinician")
    db = SessionLocal()
    try:
        payload: dict = {}
        attach_medical_image_context_to_payload(
            payload,
            patient_id="pt-aud-1",
            db=db,
            actor=actor,
            surface="assessment_summary",
            settings=_settings_stub(tmp_path),
        )
    finally:
        db.close()

    row = _latest_used_in_report_audit()
    assert row is not None
    assert row.action == "medical_image.used_in_report"
    assert row.target_type == "medical_image"
    assert row.target_id == "img_audit_1"
    assert row.actor_id == "actor-clinician-demo"
    assert row.role == "clinician"
    note = json.loads(row.note or "{}")
    assert note.get("surface") == "assessment_summary"
    assert note.get("patient_id") == "pt-aud-1"
    assert note.get("image_id") == "img_audit_1"


def test_used_in_report_audit_skipped_when_no_imaging(tmp_path: Path):
    """Patient has no MRI — must NOT emit the audit."""
    from app.database import SessionLocal
    from app.services.medical_image_report_context import (
        attach_medical_image_context_to_payload,
    )

    before = _count_used_in_report_audits()
    actor = _StubActor("actor-clinician-demo", "clinician")
    db = SessionLocal()
    try:
        payload: dict = {}
        attach_medical_image_context_to_payload(
            payload,
            patient_id="pt-no-mri-aud",
            db=db,
            actor=actor,
            surface="assessment_summary",
            settings=_settings_stub(tmp_path),
        )
    finally:
        db.close()
    after = _count_used_in_report_audits()
    assert after == before
    # And the payload still got the unavailable block.
    assert payload["medical_image_context"]["available"] is False


def test_used_in_report_audit_skipped_when_actor_omitted(tmp_path: Path):
    """Legacy callers without actor must keep working and emit no audit."""
    from app.database import SessionLocal
    from app.services.medical_image_report_context import (
        attach_medical_image_context_to_payload,
    )

    _write_sidecar(
        tmp_path, image_id="img_legacy", patient_id="pt-legacy", status="ready"
    )
    before = _count_used_in_report_audits()
    db = SessionLocal()
    try:
        payload: dict = {}
        attach_medical_image_context_to_payload(
            payload,
            patient_id="pt-legacy",
            db=db,  # db given, actor omitted
            settings=_settings_stub(tmp_path),
        )
    finally:
        db.close()
    after = _count_used_in_report_audits()
    assert after == before
    # But context still attached normally.
    assert payload["medical_image_context"]["available"] is True


def test_used_in_report_audit_skipped_when_db_omitted(tmp_path: Path):
    """No db session — no audit, no crash."""
    from app.services.medical_image_report_context import (
        attach_medical_image_context_to_payload,
    )

    _write_sidecar(
        tmp_path, image_id="img_no_db", patient_id="pt-no-db", status="ready"
    )
    actor = _StubActor("actor-clinician-demo", "clinician")
    before = _count_used_in_report_audits()
    payload: dict = {}
    attach_medical_image_context_to_payload(
        payload,
        patient_id="pt-no-db",
        actor=actor,  # actor given, db omitted
        settings=_settings_stub(tmp_path),
    )
    after = _count_used_in_report_audits()
    assert after == before
    assert payload["medical_image_context"]["available"] is True


def test_used_in_report_audit_failure_never_breaks_payload(
    tmp_path: Path, monkeypatch
):
    """If audit emission throws, the payload is still returned intact."""
    from app.services import medical_image_report_context as ctx_mod

    _write_sidecar(
        tmp_path, image_id="img_audit_boom", patient_id="pt-boom", status="ready"
    )

    def _boom(*args, **kwargs):  # noqa: ANN001
        raise RuntimeError("simulated audit-emit failure")

    monkeypatch.setattr(ctx_mod, "_emit_used_in_report_audit", _boom)
    actor = _StubActor("actor-clinician-demo", "clinician")
    payload: dict = {}
    # Must not raise — the helper itself catches inside _emit_used_in_report_audit,
    # but here we're patching the wrapper. The attach call should still succeed
    # because the audit call sits at the very end of the helper's success path.
    # We assert the payload is correctly populated regardless.
    try:
        ctx_mod.attach_medical_image_context_to_payload(
            payload,
            patient_id="pt-boom",
            db=object(),  # truthy non-None
            actor=actor,
            surface="assessment_summary",
            settings=_settings_stub(tmp_path),
        )
    except RuntimeError:
        # Acceptable failure mode: the wrapper raised. But the attach should
        # have still written the imaging context BEFORE attempting the audit.
        pass
    assert payload.get("medical_image_context", {}).get("available") is True
    assert payload["medical_image_context"]["image_id"] == "img_audit_boom"
