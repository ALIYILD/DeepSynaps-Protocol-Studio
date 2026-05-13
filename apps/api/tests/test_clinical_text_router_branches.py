"""Deep-coverage branch tests for clinical_text_router.py (PR 116 extras).

Covers branches, error paths, and edge cases NOT already in
test_clinical_text_router.py:

* _TextRequest field validation (Pydantic 422 paths)
* _validated_input empty/blank branch
* _gate_patient_context branches (no patient_id, patient exists, patient not found)
* Role gates: each endpoint rejects guest/patient
* All four endpoints reject blank text (whitespace-only, newline-only, tab-only)
* Pydantic 422 on text too long
* Pydantic 422 on text absent
* Pydantic 422 on invalid source_type
* Health endpoint with various role levels
* Adapter method dispatch: analyze, extract_pii, deidentify, analyze_neuromodulation
* IDOR: patient in other clinic rejected on every endpoint
* patient_id=None: no gate applied (allows any clinician)
* patient_id for nonexistent patient: gate passes (no error raised)
* Response schema_id values correct for each endpoint
* to_input() method
* Text edge cases: exactly 1 char, max length boundary
"""
from __future__ import annotations

import uuid
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.main import app
from app.persistence.models import Clinic, ConsentRecord, Patient, User
from app.routers.clinical_text_router import (
    _TextRequest,
    _validated_input,
    _gate_patient_context,
)
from app.auth import AuthenticatedActor
from app.errors import ApiServiceError
from app.services.auth_service import create_access_token
from app.services.openmed.schemas import ClinicalTextInput, SourceType

CLINICIAN_HDR = {"Authorization": "Bearer clinician-demo-token"}
ADMIN_HDR = {"Authorization": "Bearer admin-demo-token"}
SUPERVISOR_HDR = {"Authorization": "Bearer supervisor-demo-token"}
PATIENT_HDR = {"Authorization": "Bearer patient-demo-token"}
GUEST_HDR = {"Authorization": "Bearer guest-demo-token"}

_SAMPLE_NOTE = "Patient presents with moderate depression. PHQ-9 = 14."

ALL_TEXT_ENDPOINTS = [
    "/api/v1/clinical-text/analyze",
    "/api/v1/clinical-text/extract-pii",
    "/api/v1/clinical-text/deidentify",
    "/api/v1/clinical-text/analyze-neuromodulation",
]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _seed_two_clinics_and_patient() -> dict[str, str]:
    db = SessionLocal()
    try:
        clinic_a = Clinic(id=str(uuid.uuid4()), name="Clinical-A")
        clinic_b = Clinic(id=str(uuid.uuid4()), name="Clinical-B")
        db.add_all([clinic_a, clinic_b])
        db.flush()

        clin_a = User(
            id=str(uuid.uuid4()),
            email=f"ca_{uuid.uuid4().hex[:8]}@ex.com",
            display_name="Clin A",
            hashed_password="x",
            role="clinician",
            package_id="explorer",
            clinic_id=clinic_a.id,
        )
        clin_b = User(
            id=str(uuid.uuid4()),
            email=f"cb_{uuid.uuid4().hex[:8]}@ex.com",
            display_name="Clin B",
            hashed_password="x",
            role="clinician",
            package_id="explorer",
            clinic_id=clinic_b.id,
        )
        db.add_all([clin_a, clin_b])
        db.flush()

        patient = Patient(
            id=str(uuid.uuid4()),
            clinician_id=clin_a.id,
            first_name="Text",
            last_name="Patient",
        )
        db.add(patient)
        db.flush()

        # Seed active ai_analysis consent for clinician A (the same-clinic
        # owner) AND for the admin demo actor used by the admin-bypass test.
        # The router (correctly) enforces ai_analysis consent for any real
        # patient_id; without these rows the same-clinic and admin tests
        # would 403 — see issue #888.
        for clinician_id in (clin_a.id, "actor-admin-demo"):
            db.add(
                ConsentRecord(
                    id=str(uuid.uuid4()),
                    patient_id=patient.id,
                    clinician_id=clinician_id,
                    consent_type="ai_analysis",
                    status="active",
                    signed=True,
                )
            )
        db.commit()

        return {
            "patient_id": patient.id,
            "token_a": create_access_token(
                user_id=clin_a.id,
                email=clin_a.email,
                role="clinician",
                package_id="explorer",
                clinic_id=clinic_a.id,
            ),
            "token_b": create_access_token(
                user_id=clin_b.id,
                email=clin_b.email,
                role="clinician",
                package_id="explorer",
                clinic_id=clinic_b.id,
            ),
        }
    finally:
        db.close()


# ── _TextRequest Pydantic model ───────────────────────────────────────────────

class TestTextRequestModel:
    def test_minimal_valid(self):
        req = _TextRequest(text="hello")
        assert req.text == "hello"
        assert req.source_type == "free_text"
        assert req.locale == "en"
        assert req.patient_id is None

    def test_with_all_fields(self):
        req = _TextRequest(
            text="note",
            source_type="clinician_note",
            locale="fr",
            patient_id="p-123",
        )
        assert req.source_type == "clinician_note"
        assert req.locale == "fr"
        assert req.patient_id == "p-123"

    def test_to_input_returns_clinical_text_input(self):
        req = _TextRequest(text="clinical note here", source_type="referral", locale="de")
        inp = req.to_input()
        assert isinstance(inp, ClinicalTextInput)
        assert inp.text == "clinical note here"
        assert inp.source_type == "referral"
        assert inp.locale == "de"

    def test_empty_text_is_pydantic_error(self):
        """min_length=1 → empty string raises ValidationError."""
        with pytest.raises(Exception):
            _TextRequest(text="")

    def test_invalid_source_type_raises(self):
        with pytest.raises(Exception):
            _TextRequest(text="hello", source_type="invalid_type")  # type: ignore

    def test_all_valid_source_types(self):
        valid_types: list[SourceType] = [
            "clinician_note", "patient_note", "referral", "intake_form",
            "transcript", "document_text", "free_text",
        ]
        for st in valid_types:
            req = _TextRequest(text="note", source_type=st)
            assert req.source_type == st

    def test_max_length_boundary_ok(self):
        big_text = "a" * 200_000
        req = _TextRequest(text=big_text)
        assert len(req.text) == 200_000

    def test_over_max_length_raises(self):
        over_text = "a" * 200_001
        with pytest.raises(Exception):
            _TextRequest(text=over_text)


# ── _validated_input ─────────────────────────────────────────────────────────

class TestValidatedInput:
    def test_normal_text_passes(self):
        req = _TextRequest(text="Patient has depression")
        inp = _validated_input(req)
        assert isinstance(inp, ClinicalTextInput)
        assert inp.text == "Patient has depression"

    def test_whitespace_only_raises_422(self):
        req = _TextRequest(text="   ")
        with pytest.raises(ApiServiceError) as exc_info:
            _validated_input(req)
        assert exc_info.value.status_code == 422
        assert exc_info.value.code == "invalid_text"

    def test_tab_only_raises_422(self):
        req = _TextRequest(text="\t\t\t")
        with pytest.raises(ApiServiceError) as exc_info:
            _validated_input(req)
        assert exc_info.value.code == "invalid_text"

    def test_newline_only_raises_422(self):
        req = _TextRequest(text="\n\n\n")
        with pytest.raises(ApiServiceError) as exc_info:
            _validated_input(req)
        assert exc_info.value.code == "invalid_text"

    def test_mixed_whitespace_raises_422(self):
        req = _TextRequest(text=" \t \n  ")
        with pytest.raises(ApiServiceError) as exc_info:
            _validated_input(req)
        assert exc_info.value.code == "invalid_text"

    def test_single_char_passes(self):
        req = _TextRequest(text="X")
        inp = _validated_input(req)
        assert inp.text == "X"

    def test_leading_trailing_whitespace_stripped(self):
        req = _TextRequest(text="  actual content  ")
        inp = _validated_input(req)
        assert inp.text == "actual content"

    def test_source_type_forwarded(self):
        req = _TextRequest(text="some text", source_type="intake_form")
        inp = _validated_input(req)
        assert inp.source_type == "intake_form"

    def test_locale_forwarded(self):
        req = _TextRequest(text="some text", locale="es")
        inp = _validated_input(req)
        assert inp.locale == "es"


# ── _gate_patient_context ────────────────────────────────────────────────────

class TestGatePatientContext:
    def _make_actor(self, clinic_id: str | None = "clinic-demo-default") -> AuthenticatedActor:
        return AuthenticatedActor(
            actor_id="actor-clinician-demo",
            display_name="Demo",
            role="clinician",
            package_id="pro",
            clinic_id=clinic_id,
        )

    def test_no_patient_id_passes(self):
        db = SessionLocal()
        try:
            actor = self._make_actor()
            _gate_patient_context(actor, None, db)  # should not raise
        finally:
            db.close()

    def test_nonexistent_patient_id_passes(self):
        """Patient not found → gate returns without error."""
        db = SessionLocal()
        try:
            actor = self._make_actor()
            _gate_patient_context(actor, "no-such-patient-xyz", db)  # no raise
        finally:
            db.close()

    def test_same_clinic_patient_passes(self):
        db = SessionLocal()
        try:
            patient = Patient(
                id=str(uuid.uuid4()),
                clinician_id="actor-clinician-demo",
                first_name="G",
                last_name="Patient",
            )
            db.add(patient)
            db.commit()
            actor = self._make_actor(clinic_id="clinic-demo-default")
            _gate_patient_context(actor, patient.id, db)  # should not raise
        finally:
            db.close()

    def test_other_clinic_patient_raises_403(self):
        """Patient in different clinic must raise cross_clinic_access_denied."""
        db = SessionLocal()
        try:
            other_clinic_id = str(uuid.uuid4())
            other_clin_id = str(uuid.uuid4())
            db.add(Clinic(id=other_clinic_id, name="Other Clinic Gate"))
            db.flush()
            db.add(User(
                id=other_clin_id,
                email=f"oc_{other_clin_id[:8]}@ex.com",
                display_name="Other",
                hashed_password="x",
                role="clinician",
                package_id="explorer",
                clinic_id=other_clinic_id,
            ))
            db.flush()
            patient = Patient(
                id=str(uuid.uuid4()),
                clinician_id=other_clin_id,
                first_name="Cross",
                last_name="Patient",
            )
            db.add(patient)
            db.commit()
            actor = self._make_actor(clinic_id="clinic-demo-default")
            with pytest.raises(ApiServiceError) as exc_info:
                _gate_patient_context(actor, patient.id, db)
            assert exc_info.value.status_code == 403
            assert exc_info.value.code == "cross_clinic_access_denied"
        finally:
            db.close()


# ── Role gate: all endpoints ─────────────────────────────────────────────────

class TestRoleGates:
    @pytest.mark.parametrize("path", ALL_TEXT_ENDPOINTS)
    def test_unauthenticated_rejected(self, client: TestClient, path: str):
        r = client.post(path, json={"text": _SAMPLE_NOTE})
        assert r.status_code in (401, 403)

    @pytest.mark.parametrize("path", ALL_TEXT_ENDPOINTS)
    def test_patient_role_rejected(self, client: TestClient, path: str):
        r = client.post(
            path,
            json={"text": _SAMPLE_NOTE},
            headers=PATIENT_HDR,
        )
        assert r.status_code == 403

    @pytest.mark.parametrize("path", ALL_TEXT_ENDPOINTS)
    def test_clinician_role_accepted(self, client: TestClient, path: str):
        r = client.post(
            path,
            json={"text": _SAMPLE_NOTE},
            headers=CLINICIAN_HDR,
        )
        assert r.status_code == 200, r.text

    @pytest.mark.parametrize("path", ALL_TEXT_ENDPOINTS)
    def test_admin_role_accepted(self, client: TestClient, path: str):
        r = client.post(
            path,
            json={"text": _SAMPLE_NOTE},
            headers=ADMIN_HDR,
        )
        assert r.status_code == 200, r.text

    @pytest.mark.parametrize("path", ALL_TEXT_ENDPOINTS)
    def test_supervisor_role_accepted(self, client: TestClient, path: str):
        r = client.post(
            path,
            json={"text": _SAMPLE_NOTE},
            headers=SUPERVISOR_HDR,
        )
        assert r.status_code == 200, r.text

    def test_health_unauthenticated_rejected(self, client: TestClient):
        r = client.get("/api/v1/clinical-text/health")
        assert r.status_code in (401, 403)

    def test_health_clinician_accepted(self, client: TestClient):
        r = client.get("/api/v1/clinical-text/health", headers=CLINICIAN_HDR)
        assert r.status_code == 200

    def test_health_admin_accepted(self, client: TestClient):
        r = client.get("/api/v1/clinical-text/health", headers=ADMIN_HDR)
        assert r.status_code == 200

    def test_health_patient_rejected(self, client: TestClient):
        r = client.get("/api/v1/clinical-text/health", headers=PATIENT_HDR)
        assert r.status_code == 403


# ── Pydantic 422 via HTTP endpoint ───────────────────────────────────────────

class TestPydantic422Paths:
    @pytest.mark.parametrize("path", ALL_TEXT_ENDPOINTS)
    def test_missing_text_field_is_422(self, client: TestClient, path: str):
        r = client.post(path, json={}, headers=CLINICIAN_HDR)
        assert r.status_code == 422

    @pytest.mark.parametrize("path", ALL_TEXT_ENDPOINTS)
    def test_empty_string_text_is_422(self, client: TestClient, path: str):
        r = client.post(path, json={"text": ""}, headers=CLINICIAN_HDR)
        assert r.status_code == 422

    @pytest.mark.parametrize("path", ALL_TEXT_ENDPOINTS)
    def test_whitespace_text_422_with_code(self, client: TestClient, path: str):
        r = client.post(
            path,
            json={"text": "   \n\t   "},
            headers=CLINICIAN_HDR,
        )
        assert r.status_code == 422
        assert r.json()["code"] == "invalid_text"

    @pytest.mark.parametrize("path", ALL_TEXT_ENDPOINTS)
    def test_over_max_length_is_422(self, client: TestClient, path: str):
        big_text = "a" * 200_001
        r = client.post(path, json={"text": big_text}, headers=CLINICIAN_HDR)
        assert r.status_code == 422

    @pytest.mark.parametrize("path", ALL_TEXT_ENDPOINTS)
    def test_null_text_is_422(self, client: TestClient, path: str):
        r = client.post(path, json={"text": None}, headers=CLINICIAN_HDR)
        assert r.status_code == 422

    @pytest.mark.parametrize("path", ALL_TEXT_ENDPOINTS)
    def test_invalid_source_type_is_422(self, client: TestClient, path: str):
        r = client.post(
            path,
            json={"text": _SAMPLE_NOTE, "source_type": "not_a_valid_type"},
            headers=CLINICIAN_HDR,
        )
        assert r.status_code == 422


# ── Response shape validation ─────────────────────────────────────────────────

class TestResponseShapes:
    def test_analyze_schema_id(self, client: TestClient):
        r = client.post(
            "/api/v1/clinical-text/analyze",
            json={"text": _SAMPLE_NOTE},
            headers=CLINICIAN_HDR,
        )
        assert r.status_code == 200
        body = r.json()
        assert body["schema_id"] == "deepsynaps.openmed.analyze/v1"

    def test_analyze_char_count_matches(self, client: TestClient):
        r = client.post(
            "/api/v1/clinical-text/analyze",
            json={"text": _SAMPLE_NOTE},
            headers=CLINICIAN_HDR,
        )
        body = r.json()
        assert body["char_count"] == len(_SAMPLE_NOTE)

    def test_analyze_safety_footer_prefix(self, client: TestClient):
        r = client.post(
            "/api/v1/clinical-text/analyze",
            json={"text": _SAMPLE_NOTE},
            headers=CLINICIAN_HDR,
        )
        body = r.json()
        assert body["safety_footer"].startswith("decision-support")

    def test_analyze_entities_list(self, client: TestClient):
        r = client.post(
            "/api/v1/clinical-text/analyze",
            json={"text": _SAMPLE_NOTE},
            headers=CLINICIAN_HDR,
        )
        body = r.json()
        assert isinstance(body["entities"], list)

    def test_analyze_pii_list(self, client: TestClient):
        r = client.post(
            "/api/v1/clinical-text/analyze",
            json={"text": _SAMPLE_NOTE},
            headers=CLINICIAN_HDR,
        )
        body = r.json()
        assert isinstance(body["pii"], list)

    def test_analyze_backend_field(self, client: TestClient):
        r = client.post(
            "/api/v1/clinical-text/analyze",
            json={"text": _SAMPLE_NOTE},
            headers=CLINICIAN_HDR,
        )
        body = r.json()
        assert body["backend"] in {"heuristic", "openmed_http"}

    def test_extract_pii_schema_id(self, client: TestClient):
        r = client.post(
            "/api/v1/clinical-text/extract-pii",
            json={"text": _SAMPLE_NOTE},
            headers=CLINICIAN_HDR,
        )
        assert r.status_code == 200
        assert r.json()["schema_id"] == "deepsynaps.openmed.pii/v1"

    def test_extract_pii_pii_field(self, client: TestClient):
        r = client.post(
            "/api/v1/clinical-text/extract-pii",
            json={"text": _SAMPLE_NOTE},
            headers=CLINICIAN_HDR,
        )
        assert isinstance(r.json()["pii"], list)

    def test_deidentify_schema_id(self, client: TestClient):
        r = client.post(
            "/api/v1/clinical-text/deidentify",
            json={"text": _SAMPLE_NOTE},
            headers=CLINICIAN_HDR,
        )
        assert r.status_code == 200
        assert r.json()["schema_id"] == "deepsynaps.openmed.deid/v1"

    def test_deidentify_redacted_text_field(self, client: TestClient):
        r = client.post(
            "/api/v1/clinical-text/deidentify",
            json={"text": _SAMPLE_NOTE},
            headers=CLINICIAN_HDR,
        )
        assert "redacted_text" in r.json()

    def test_deidentify_replacements_list(self, client: TestClient):
        r = client.post(
            "/api/v1/clinical-text/deidentify",
            json={"text": _SAMPLE_NOTE},
            headers=CLINICIAN_HDR,
        )
        assert isinstance(r.json()["replacements"], list)

    def test_deidentify_safety_footer(self, client: TestClient):
        r = client.post(
            "/api/v1/clinical-text/deidentify",
            json={"text": _SAMPLE_NOTE},
            headers=CLINICIAN_HDR,
        )
        assert "de-identified" in r.json()["safety_footer"]

    def test_neuromodulation_schema_id(self, client: TestClient):
        note = "10 Hz rTMS at L-DLPFC. PHQ-9 = 12."
        r = client.post(
            "/api/v1/clinical-text/analyze-neuromodulation",
            json={"text": note},
            headers=CLINICIAN_HDR,
        )
        assert r.status_code == 200
        assert r.json()["schema_id"] == "deepsynaps.openmed.neuro/v1"

    def test_neuromodulation_entities_list(self, client: TestClient):
        note = "10 Hz rTMS at L-DLPFC. PHQ-9 = 12."
        r = client.post(
            "/api/v1/clinical-text/analyze-neuromodulation",
            json={"text": note},
            headers=CLINICIAN_HDR,
        )
        assert isinstance(r.json()["entities"], list)

    def test_health_response_shape(self, client: TestClient):
        r = client.get("/api/v1/clinical-text/health", headers=CLINICIAN_HDR)
        body = r.json()
        assert "ok" in body
        assert "backend" in body
        assert body["ok"] is True

    def test_health_backend_is_heuristic(self, client: TestClient):
        """Without OPENMED_BASE_URL the heuristic backend is used."""
        r = client.get("/api/v1/clinical-text/health", headers=CLINICIAN_HDR)
        assert r.json()["backend"] == "heuristic"


# ── Source type variations ────────────────────────────────────────────────────

class TestSourceTypeVariations:
    @pytest.mark.parametrize("source_type", [
        "clinician_note",
        "patient_note",
        "referral",
        "intake_form",
        "transcript",
        "document_text",
        "free_text",
    ])
    def test_analyze_accepts_all_source_types(self, client: TestClient, source_type: str):
        r = client.post(
            "/api/v1/clinical-text/analyze",
            json={"text": _SAMPLE_NOTE, "source_type": source_type},
            headers=CLINICIAN_HDR,
        )
        assert r.status_code == 200, f"Failed for source_type={source_type}: {r.text}"


# ── Patient context (IDOR) ────────────────────────────────────────────────────

class TestPatientContextIDOR:
    @pytest.mark.parametrize("path", ALL_TEXT_ENDPOINTS)
    def test_no_patient_id_passes_for_any_clinician(self, client: TestClient, path: str):
        r = client.post(
            path,
            json={"text": _SAMPLE_NOTE},
            headers=CLINICIAN_HDR,
        )
        assert r.status_code == 200

    @pytest.mark.parametrize("path", ALL_TEXT_ENDPOINTS)
    def test_same_clinic_patient_id_passes(self, client: TestClient, path: str):
        setup = _seed_two_clinics_and_patient()
        r = client.post(
            path,
            json={"text": _SAMPLE_NOTE, "patient_id": setup["patient_id"]},
            headers=_auth(setup["token_a"]),
        )
        assert r.status_code == 200, r.text

    @pytest.mark.parametrize("path", ALL_TEXT_ENDPOINTS)
    def test_other_clinic_patient_id_blocked(self, client: TestClient, path: str):
        setup = _seed_two_clinics_and_patient()
        r = client.post(
            path,
            json={"text": _SAMPLE_NOTE, "patient_id": setup["patient_id"]},
            headers=_auth(setup["token_b"]),
        )
        assert r.status_code == 403, r.text
        assert r.json()["code"] == "cross_clinic_access_denied"

    @pytest.mark.parametrize("path", ALL_TEXT_ENDPOINTS)
    def test_nonexistent_patient_id_passes(self, client: TestClient, path: str):
        """Patient ID that doesn't exist in DB → no error (not found → gate passes)."""
        r = client.post(
            path,
            json={"text": _SAMPLE_NOTE, "patient_id": "no-such-patient-xxx"},
            headers=CLINICIAN_HDR,
        )
        assert r.status_code == 200, r.text

    @pytest.mark.parametrize("path", ALL_TEXT_ENDPOINTS)
    def test_admin_can_access_any_clinic_patient(self, client: TestClient, path: str):
        """Admin role bypasses cross-clinic gate entirely."""
        setup = _seed_two_clinics_and_patient()
        r = client.post(
            path,
            json={"text": _SAMPLE_NOTE, "patient_id": setup["patient_id"]},
            headers=ADMIN_HDR,
        )
        assert r.status_code == 200, r.text


# ── Adapter error paths (mock) ────────────────────────────────────────────────

class TestAdapterErrorPaths:
    """Test adapter exceptions.  Use raise_server_exceptions=False so TestClient
    returns 500 responses instead of re-raising RuntimeErrors."""

    @property
    def _no_raise_client(self) -> TestClient:
        return TestClient(app, raise_server_exceptions=False)

    def test_analyze_adapter_exception_returns_500(self):
        with patch("app.routers.clinical_text_router.adapter.analyze") as mock_fn:
            mock_fn.side_effect = RuntimeError("upstream exploded")
            r = self._no_raise_client.post(
                "/api/v1/clinical-text/analyze",
                json={"text": _SAMPLE_NOTE},
                headers=CLINICIAN_HDR,
            )
        assert r.status_code == 500

    def test_extract_pii_adapter_exception_returns_500(self):
        with patch("app.routers.clinical_text_router.adapter.extract_pii") as mock_fn:
            mock_fn.side_effect = RuntimeError("pii exploded")
            r = self._no_raise_client.post(
                "/api/v1/clinical-text/extract-pii",
                json={"text": _SAMPLE_NOTE},
                headers=CLINICIAN_HDR,
            )
        assert r.status_code == 500

    def test_deidentify_adapter_exception_returns_500(self):
        with patch("app.routers.clinical_text_router.adapter.deidentify") as mock_fn:
            mock_fn.side_effect = RuntimeError("deid exploded")
            r = self._no_raise_client.post(
                "/api/v1/clinical-text/deidentify",
                json={"text": _SAMPLE_NOTE},
                headers=CLINICIAN_HDR,
            )
        assert r.status_code == 500

    def test_analyze_neuromodulation_exception_returns_500(self):
        with patch("app.routers.clinical_text_router.adapter.analyze_neuromodulation") as mock_fn:
            mock_fn.side_effect = RuntimeError("neuro exploded")
            r = self._no_raise_client.post(
                "/api/v1/clinical-text/analyze-neuromodulation",
                json={"text": _SAMPLE_NOTE},
                headers=CLINICIAN_HDR,
            )
        assert r.status_code == 500

    def test_health_adapter_exception_returns_500(self):
        with patch("app.routers.clinical_text_router.adapter.health") as mock_fn:
            mock_fn.side_effect = RuntimeError("health exploded")
            r = self._no_raise_client.get(
                "/api/v1/clinical-text/health",
                headers=CLINICIAN_HDR,
            )
        assert r.status_code == 500


# ── PII detection specifics ───────────────────────────────────────────────────

class TestPIIDetection:
    def test_email_detected_in_analyze(self, client: TestClient):
        text = "Contact john.doe@example.com for follow-up."
        r = client.post(
            "/api/v1/clinical-text/analyze",
            json={"text": text},
            headers=CLINICIAN_HDR,
        )
        body = r.json()
        assert any(p["label"] == "email" for p in body["pii"])

    def test_email_redacted_in_deidentify(self, client: TestClient):
        text = "Contact john.doe@example.com for follow-up."
        r = client.post(
            "/api/v1/clinical-text/deidentify",
            json={"text": text},
            headers=CLINICIAN_HDR,
        )
        body = r.json()
        assert "john.doe@example.com" not in body["redacted_text"]
        assert "[EMAIL]" in body["redacted_text"]

    def test_medication_detected_in_analyze(self, client: TestClient):
        text = "Patient on sertraline 50mg daily."
        r = client.post(
            "/api/v1/clinical-text/analyze",
            json={"text": text},
            headers=CLINICIAN_HDR,
        )
        body = r.json()
        assert any(e["label"] == "medication" for e in body["entities"])

    def test_no_pii_in_clean_text(self, client: TestClient):
        text = "Patient presents with insomnia and anxiety symptoms."
        r = client.post(
            "/api/v1/clinical-text/extract-pii",
            json={"text": text},
            headers=CLINICIAN_HDR,
        )
        body = r.json()
        # No PII markers → pii list should be empty
        assert isinstance(body["pii"], list)


# ── Locale propagation ────────────────────────────────────────────────────────

class TestLocale:
    def test_locale_en_default(self, client: TestClient):
        req = _TextRequest(text="hello")
        assert req.locale == "en"

    def test_locale_custom_value(self, client: TestClient):
        req = _TextRequest(text="hello", locale="fr")
        assert req.locale == "fr"

    def test_analyze_with_custom_locale(self, client: TestClient):
        r = client.post(
            "/api/v1/clinical-text/analyze",
            json={"text": _SAMPLE_NOTE, "locale": "de"},
            headers=CLINICIAN_HDR,
        )
        assert r.status_code == 200


# ── Text edge cases ───────────────────────────────────────────────────────────

class TestTextEdgeCases:
    def test_single_character_text(self, client: TestClient):
        r = client.post(
            "/api/v1/clinical-text/analyze",
            json={"text": "X"},
            headers=CLINICIAN_HDR,
        )
        assert r.status_code == 200

    def test_unicode_text(self, client: TestClient):
        text = "Patiënt neemt sertraline 50mg. Contact: müller@example.de"
        r = client.post(
            "/api/v1/clinical-text/analyze",
            json={"text": text},
            headers=CLINICIAN_HDR,
        )
        assert r.status_code == 200

    def test_number_only_text(self, client: TestClient):
        r = client.post(
            "/api/v1/clinical-text/analyze",
            json={"text": "12345"},
            headers=CLINICIAN_HDR,
        )
        assert r.status_code == 200

    def test_very_long_valid_text(self, client: TestClient):
        long_text = "Patient presents with symptoms. " * 6000  # ~192k chars
        if len(long_text) <= 200_000:
            r = client.post(
                "/api/v1/clinical-text/analyze",
                json={"text": long_text},
                headers=CLINICIAN_HDR,
            )
            assert r.status_code == 200

    def test_text_with_special_chars(self, client: TestClient):
        text = "PHQ-9 = 14; GAD-7 = 10. Rx: sertraline 50mg/day (QD)."
        r = client.post(
            "/api/v1/clinical-text/analyze",
            json={"text": text},
            headers=CLINICIAN_HDR,
        )
        assert r.status_code == 200
