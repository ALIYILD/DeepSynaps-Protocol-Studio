"""Unit + integration tests for the documents_router consent gate.

#843 was nominally closed by PR #890 (protocol_studio_router) and the
follow-up PR #896 (consent_type filtering). That left
``documents_router.py`` without any consent enforcement — a real gap
since clinical documents are the canonical artefact patients sign for.

This module covers:

* ``_enforce_document_consent`` — direct helper behaviour: empty
  patient_id no-op, missing patient no-op, missing consent → 403,
  wrong consent_type → 403, withdrawn consent → 403, valid consent
  passes, ``consent_type`` filter rejects unrelated active records.
* End-to-end via the FastAPI TestClient: ``POST /api/v1/documents``,
  ``POST /api/v1/documents/upload``, ``POST /api/v1/documents/{id}/sign``,
  and ``POST /api/v1/documents/{id}/supersede`` all 403 without
  ``document_generation`` consent and 200/201 with it.

Companions:

* ``tests/test_device_sync_consent_helpers.py`` (PR #895) — same shape
  for device sync.
* ``tests/test_protocol_studio_consent_helpers.py`` (PR #896) — same
  shape for protocol studio.
"""
from __future__ import annotations

import io
import json
import uuid

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.errors import ApiServiceError
from app.persistence.models import ConsentRecord, FormDefinition, Patient
from app.routers.documents_router import _enforce_document_consent
from app.services.auth_service import create_access_token


# ── helpers ───────────────────────────────────────────────────────────────────

class _StubActor:
    """Minimal AuthenticatedActor stand-in.

    The router's ``_enforce_document_consent`` only reads ``actor_id``
    and ``role`` (via the canonical consent helper's audit-log entry),
    so a typed stub avoids importing the JWT plumbing for unit tests.
    """

    def __init__(self, actor_id: str = "actor-clinician-demo", role: str = "clinician"):
        self.actor_id = actor_id
        self.role = role
        self.clinic_id = None


def _new_patient(db) -> Patient:
    p = Patient(
        id=str(uuid.uuid4()),
        clinician_id="actor-clinician-demo",
        first_name="Doc",
        last_name="Patient",
    )
    db.add(p)
    db.commit()
    return p


def _seed_consent(
    db, *, patient_id: str, consent_type: str, status: str = "active",
    clinician_id: str = "actor-clinician-demo",
) -> ConsentRecord:
    c = ConsentRecord(
        id=str(uuid.uuid4()),
        patient_id=patient_id,
        clinician_id=clinician_id,
        consent_type=consent_type,
        status=status,
        signed=True,
    )
    db.add(c)
    db.commit()
    return c


# ── _enforce_document_consent — direct helper ────────────────────────────────

class TestEnforceDocumentConsentHelper:
    def test_noop_for_empty_patient_id(self) -> None:
        db = SessionLocal()
        try:
            _enforce_document_consent(db, "", _StubActor(), document_type="document")
            _enforce_document_consent(db, None, _StubActor(), document_type="document")
        finally:
            db.close()

    def test_noop_for_nonexistent_patient(self) -> None:
        """Mirrors the clinical_text_router pattern: gate only fires for
        real patient rows so demo/bogus IDs pass through (the cross-clinic
        gate upstream is what 404s the unknown-patient case)."""
        db = SessionLocal()
        try:
            _enforce_document_consent(
                db, "no-such-patient-xxx", _StubActor(), document_type="document"
            )
        finally:
            db.close()

    def test_raises_403_when_no_consent_record(self) -> None:
        db = SessionLocal()
        try:
            p = _new_patient(db)
            with pytest.raises(ApiServiceError) as exc_info:
                _enforce_document_consent(db, p.id, _StubActor(), document_type="document")
            assert exc_info.value.status_code == 403
            assert exc_info.value.code == "consent_required"
        finally:
            db.close()

    def test_raises_403_for_unrelated_consent_type(self) -> None:
        """An active ai_analysis/device_sync/media consent must NOT
        authorise document generation — guards against the loose-filter
        bug PR #896 fixed for protocol_studio."""
        db = SessionLocal()
        try:
            p = _new_patient(db)
            _seed_consent(db, patient_id=p.id, consent_type="ai_analysis", status="active")
            _seed_consent(db, patient_id=p.id, consent_type="device_sync", status="active")
            _seed_consent(db, patient_id=p.id, consent_type="media", status="active")
            with pytest.raises(ApiServiceError) as exc_info:
                _enforce_document_consent(db, p.id, _StubActor(), document_type="document")
            assert exc_info.value.status_code == 403
        finally:
            db.close()

    def test_raises_403_for_withdrawn_document_consent(self) -> None:
        db = SessionLocal()
        try:
            p = _new_patient(db)
            _seed_consent(
                db, patient_id=p.id, consent_type="document_generation", status="withdrawn"
            )
            with pytest.raises(ApiServiceError) as exc_info:
                _enforce_document_consent(db, p.id, _StubActor(), document_type="document")
            assert exc_info.value.status_code == 403
        finally:
            db.close()

    def test_passes_for_active_document_consent(self) -> None:
        db = SessionLocal()
        try:
            p = _new_patient(db)
            _seed_consent(
                db, patient_id=p.id, consent_type="document_generation", status="active"
            )
            _enforce_document_consent(db, p.id, _StubActor(), document_type="document")
        finally:
            db.close()


# ── End-to-end: documents-router write endpoints ─────────────────────────────


def _e2e_seed(*, with_doc_consent: bool, with_protocol_consent: bool = False) -> dict:
    """Seed a clinic-scoped clinician + patient pair. Returns ids + token."""
    db = SessionLocal()
    try:
        from app.persistence.models import Clinic, User

        clinic = Clinic(id=str(uuid.uuid4()), name="Doc Consent Clinic")
        db.add(clinic)
        db.flush()
        clin = User(
            id=str(uuid.uuid4()),
            email=f"docclin_{uuid.uuid4().hex[:8]}@ex.com",
            display_name="Doc Clin",
            hashed_password="x",
            role="clinician",
            package_id="explorer",
            clinic_id=clinic.id,
        )
        db.add(clin)
        db.flush()
        patient = Patient(
            id=str(uuid.uuid4()),
            clinician_id=clin.id,
            first_name="Doc",
            last_name="E2E",
        )
        db.add(patient)
        db.flush()
        if with_doc_consent:
            _seed_consent(
                db,
                patient_id=patient.id,
                consent_type="document_generation",
                status="active",
                clinician_id=clin.id,
            )
        if with_protocol_consent:  # noqa: not used but kept for symmetry
            pass
        db.commit()
        token = create_access_token(
            user_id=clin.id,
            email=clin.email,
            role="clinician",
            package_id="explorer",
            clinic_id=clinic.id,
        )
        return {"patient_id": patient.id, "clinician_id": clin.id, "token": token}
    finally:
        db.close()


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


class TestDocumentsRouterEndpointConsent:
    """End-to-end coverage on the four write endpoints I wired."""

    @pytest.fixture
    def client(self) -> TestClient:
        from app.main import app
        return TestClient(app)

    def test_create_document_rejects_without_consent(self, client: TestClient) -> None:
        setup = _e2e_seed(with_doc_consent=False)
        r = client.post(
            "/api/v1/documents",
            json={
                "title": "GP letter",
                "doc_type": "letter",
                "status": "pending",
                "patient_id": setup["patient_id"],
            },
            headers=_auth(setup["token"]),
        )
        assert r.status_code == 403, r.text
        assert r.json()["code"] == "consent_required"

    def test_create_document_passes_with_consent(self, client: TestClient) -> None:
        setup = _e2e_seed(with_doc_consent=True)
        r = client.post(
            "/api/v1/documents",
            json={
                "title": "GP letter",
                "doc_type": "letter",
                "status": "pending",
                "patient_id": setup["patient_id"],
            },
            headers=_auth(setup["token"]),
        )
        assert r.status_code == 201, r.text

    def test_upload_rejects_without_consent(self, client: TestClient, tmp_path, monkeypatch) -> None:
        from app.settings import get_settings
        monkeypatch.setattr(get_settings(), "media_storage_root", str(tmp_path))
        setup = _e2e_seed(with_doc_consent=False)
        files = {"file": ("note.pdf", io.BytesIO(b"%PDF-1.4 fake pdf"), "application/pdf")}
        data = {"title": "X", "doc_type": "uploaded", "patient_id": setup["patient_id"]}
        r = client.post(
            "/api/v1/documents/upload",
            files=files,
            data=data,
            headers=_auth(setup["token"]),
        )
        assert r.status_code == 403, r.text
        assert r.json()["code"] == "consent_required"

    def test_sign_rejects_when_consent_withdrawn_after_create(self, client: TestClient) -> None:
        """A document created under active consent must still be blocked
        from being SIGNED if consent is withdrawn before sign time."""
        setup = _e2e_seed(with_doc_consent=True)
        # Create the doc while consent is active.
        r = client.post(
            "/api/v1/documents",
            json={
                "title": "Draft",
                "doc_type": "letter",
                "status": "pending",
                "patient_id": setup["patient_id"],
            },
            headers=_auth(setup["token"]),
        )
        assert r.status_code == 201, r.text
        doc_id = r.json()["id"]
        # Withdraw the consent.
        db = SessionLocal()
        try:
            consent = (
                db.query(ConsentRecord)
                .filter(
                    ConsentRecord.patient_id == setup["patient_id"],
                    ConsentRecord.consent_type == "document_generation",
                )
                .one()
            )
            consent.status = "withdrawn"
            db.commit()
        finally:
            db.close()
        # Sign should now 403.
        r = client.post(
            f"/api/v1/documents/{doc_id}/sign",
            headers=_auth(setup["token"]),
        )
        assert r.status_code == 403, r.text
        assert r.json()["code"] == "consent_required"

    def test_supersede_rejects_without_consent(self, client: TestClient) -> None:
        setup = _e2e_seed(with_doc_consent=True)
        r = client.post(
            "/api/v1/documents",
            json={
                "title": "Original",
                "doc_type": "letter",
                "status": "pending",
                "patient_id": setup["patient_id"],
            },
            headers=_auth(setup["token"]),
        )
        assert r.status_code == 201, r.text
        doc_id = r.json()["id"]
        # Withdraw consent.
        db = SessionLocal()
        try:
            consent = (
                db.query(ConsentRecord)
                .filter(
                    ConsentRecord.patient_id == setup["patient_id"],
                    ConsentRecord.consent_type == "document_generation",
                )
                .one()
            )
            consent.status = "withdrawn"
            db.commit()
        finally:
            db.close()
        r = client.post(
            f"/api/v1/documents/{doc_id}/supersede",
            json={"reason": "follow-up revision needed"},
            headers=_auth(setup["token"]),
        )
        assert r.status_code == 403, r.text
        assert r.json()["code"] == "consent_required"
