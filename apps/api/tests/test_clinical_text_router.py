"""Comprehensive tests for clinical_text_router.py

Covers all five endpoints with auth, consent, patient-context gating,
source-type validation, edge cases, and rate-limit decorator verification.
All external services are mocked; tests are fully self-contained.

NOTE: This test file does NOT depend on conftest.py. It sets up its own
sys.path, mocks the rate limiter before importing the router, and creates
a clean FastAPI app for each test session.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any, Generator
from unittest.mock import MagicMock, patch

# ---------------------------------------------------------------------------
# 0. Environment + path setup (must run before any app import)
# ---------------------------------------------------------------------------

REPO_ROOT = Path(__file__).resolve().parents[3]
SOURCE_PATHS = [
    REPO_ROOT / "apps" / "api",
    REPO_ROOT / "packages" / "core-schema" / "src",
    REPO_ROOT / "packages" / "condition-registry" / "src",
    REPO_ROOT / "packages" / "modality-registry" / "src",
    REPO_ROOT / "packages" / "device-registry" / "src",
    REPO_ROOT / "packages" / "safety-engine" / "src",
    REPO_ROOT / "packages" / "render-engine" / "src",
    REPO_ROOT / "packages" / "generation-engine" / "src",
    REPO_ROOT / "packages" / "qeeg-pipeline" / "src",
    REPO_ROOT / "packages" / "mri-pipeline" / "src",
    REPO_ROOT / "packages" / "neuro-engine" / "src",
    REPO_ROOT / "packages" / "biometrics-pipeline" / "src",
    REPO_ROOT / "packages" / "evidence" / "src",
    REPO_ROOT / "packages" / "clinical-data-registry" / "src",
    REPO_ROOT / "packages" / "qa" / "src",
    REPO_ROOT / "packages" / "deeptwin-neuroai-lab" / "src",
]
for sp in SOURCE_PATHS:
    sys.path.insert(0, str(sp))

os.environ.setdefault("DEEPSYNAPS_APP_ENV", "test")
os.environ.setdefault("DEEPSYNAPS_SECRETS_KEY", "test-key-for-testing-only")

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.auth import AuthenticatedActor
from app.services.openmed.schemas import (
    AnalyzeResponse,
    DeidentifyResponse,
    ExtractedClinicalEntity,
    HealthResponse,
    NeuromodulationExtractResponse,
    PIIEntity,
    PIIExtractResponse,
    TextSpan,
)

# ---------------------------------------------------------------------------
# Import the router module WITHOUT limiter interference
# ---------------------------------------------------------------------------

# The router applies @limiter.limit("30/minute") BEFORE @router.post().
# The SlowAPI wrapper breaks FastAPI's Pydantic-body parsing in TestClient
# because FastAPI registers the *wrapped* function and can no longer see
# that the `payload: _TextRequest` parameter is a request-body model.
#
# Fix: inject a fake app.limiter module in sys.modules BEFORE importing
# the router. The router does `from app.limiter import limiter` which will
# pick up our fake. The fake limiter.limit() is a pass-through decorator.

import types

_fake_limiter_module = types.ModuleType("app.limiter")
_fake_limiter = MagicMock()
_fake_limiter.limit = lambda rate_string: lambda func: func  # pass-through
_fake_limiter_module.limiter = _fake_limiter

# Ensure parent module exists
if "app" not in sys.modules:
    sys.modules["app"] = types.ModuleType("app")
    sys.modules["app"].__path__ = []  # type: ignore[attr-defined]
sys.modules["app.limiter"] = _fake_limiter_module

import app.routers.clinical_text_router as _ctr  # noqa: E402

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

CLINICAL_TEXT_BASE = "/api/v1/clinical-text"
VALID_PATIENT_ID = "patient-001"
NONEXISTENT_PATIENT_ID = "patient-does-not-exist"
MINIMAL_TEXT = "Patient reports headache and dizziness."


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def test_actor() -> AuthenticatedActor:
    return AuthenticatedActor(
        actor_id="actor-clinician-demo",
        display_name="Test Clinician",
        role="clinician",
        clinic_id="clinic-demo-default",
    )


@pytest.fixture
def mock_adapter() -> Generator[MagicMock, None, None]:
    """Patch the adapter module used by the router."""
    with patch.object(_ctr, "adapter") as m:
        m.health.return_value = HealthResponse(
            ok=True,
            backend="heuristic",
            upstream_ok=None,
            upstream_url=None,
            note="",
        )
        m.analyze.return_value = AnalyzeResponse(
            schema_id="deepsynaps.openmed.analyze/v1",
            backend="heuristic",
            entities=[
                ExtractedClinicalEntity(
                    label="symptom",
                    text="headache",
                    span=TextSpan(start=15, end=23),
                    confidence=0.92,
                ),
            ],
            pii=[],
            summary="Single symptom noted.",
            char_count=len(MINIMAL_TEXT),
        )
        m.extract_pii.return_value = PIIExtractResponse(
            schema_id="deepsynaps.openmed.pii/v1",
            backend="heuristic",
            pii=[
                PIIEntity(
                    label="person_name",
                    text="John Doe",
                    span=TextSpan(start=0, end=8),
                    confidence=0.95,
                ),
            ],
        )
        m.deidentify.return_value = DeidentifyResponse(
            schema_id="deepsynaps.openmed.deid/v1",
            backend="heuristic",
            redacted_text="[NAME] reports headache and dizziness.",
            replacements=[
                PIIEntity(
                    label="person_name",
                    text="John Doe",
                    span=TextSpan(start=0, end=8),
                    confidence=0.95,
                ),
            ],
        )
        m.analyze_neuromodulation.return_value = NeuromodulationExtractResponse(
            schema_id="deepsynaps.openmed.neuro/v1",
            backend="heuristic",
            entities=[
                ExtractedClinicalEntity(
                    label="stimulation_protocol",
                    text="rTMS 10 Hz",
                    span=TextSpan(start=0, end=10),
                    confidence=0.88,
                ),
            ],
            pii=[],
            summary="Neuromodulation protocol identified.",
            char_count=len(MINIMAL_TEXT),
        )
        yield m


@pytest.fixture
def mock_resolve_patient() -> Generator[MagicMock, None, None]:
    """Patch patient resolution: valid patient exists, invalid does not."""
    with patch.object(_ctr, "resolve_patient_clinic_id") as m:

        def _side_effect(session: Any, patient_id: str) -> tuple[bool, str | None]:
            if patient_id == VALID_PATIENT_ID:
                return True, "clinic-demo-default"
            return False, None

        m.side_effect = _side_effect
        yield m


@pytest.fixture
def mock_require_consent() -> Generator[MagicMock, None, None]:
    """Patch consent enforcement: passes by default."""
    with patch.object(_ctr, "require_ai_analysis_consent") as m:
        yield m


@pytest.fixture
def mock_get_actor(test_actor: AuthenticatedActor) -> Generator[MagicMock, None, None]:
    """Patch authentication to return our test actor."""
    with patch.object(_ctr, "get_authenticated_actor", return_value=test_actor) as m:
        yield m


@pytest.fixture
def mock_require_role() -> Generator[MagicMock, None, None]:
    """Patch role requirement as pass-through."""
    with patch.object(
        _ctr, "require_minimum_role",
        side_effect=lambda actor, minimum_role, warnings=None: None,
    ) as m:
        yield m


@pytest.fixture
def mock_db_session() -> Generator[MagicMock, None, None]:
    """Patch DB session dependency."""
    with patch.object(_ctr, "get_db_session") as m:
        mock_session = MagicMock()
        m.return_value = mock_session
        yield m


@pytest.fixture
def client(
    mock_get_actor: MagicMock,
    mock_require_role: MagicMock,
    mock_adapter: MagicMock,
    mock_db_session: MagicMock,
) -> TestClient:
    """Create a TestClient with the clinical text router and all mocks."""
    app = FastAPI()
    app.include_router(_ctr.router)
    return TestClient(app)


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------


def _make_payload(
    text: str = MINIMAL_TEXT,
    source_type: str = "free_text",
    locale: str = "en",
    patient_id: str | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "text": text,
        "source_type": source_type,
        "locale": locale,
    }
    if patient_id is not None:
        payload["patient_id"] = patient_id
    return payload


# =============================================================================
# 1. HEALTH ENDPOINT
# =============================================================================


class TestHealthEndpoint:
    """GET /api/v1/clinical-text/health"""

    def test_health_returns_backend_status(
        self,
        client: TestClient,
        mock_adapter: MagicMock,
    ) -> None:
        resp = client.get(f"{CLINICAL_TEXT_BASE}/health")
        assert resp.status_code == 200
        body = resp.json()
        assert body["ok"] is True
        assert body["backend"] in ("openmed_http", "heuristic")
        mock_adapter.health.assert_called_once()

    def test_health_403_for_insufficient_role(self) -> None:
        from app.errors import ApiServiceError

        with patch.object(
            _ctr, "require_minimum_role",
            side_effect=ApiServiceError(
                code="insufficient_role",
                message="Clinician access is required.",
                status_code=403,
            ),
        ):
            app = FastAPI()
            app.include_router(_ctr.router)
            c = TestClient(app)
            resp = c.get(f"{CLINICAL_TEXT_BASE}/health")
        assert resp.status_code == 403


# =============================================================================
# 2. ANALYZE ENDPOINT
# =============================================================================


class TestAnalyzeEndpoint:
    """POST /api/v1/clinical-text/analyze"""

    def test_analyze_successful_with_valid_text(
        self,
        client: TestClient,
        mock_adapter: MagicMock,
    ) -> None:
        resp = client.post(f"{CLINICAL_TEXT_BASE}/analyze", json=_make_payload())
        assert resp.status_code == 200
        body = resp.json()
        assert body["schema_id"] == "deepsynaps.openmed.analyze/v1"
        assert len(body["entities"]) == 1
        assert body["entities"][0]["label"] == "symptom"
        assert body["char_count"] == len(MINIMAL_TEXT)
        mock_adapter.analyze.assert_called_once()

    def test_analyze_returns_422_for_empty_text(
        self,
        client: TestClient,
    ) -> None:
        """Pydantic min_length=1 rejects empty string at validation layer."""
        resp = client.post(
            f"{CLINICAL_TEXT_BASE}/analyze",
            json=_make_payload(text=""),
        )
        assert resp.status_code == 422

    def test_analyze_returns_422_for_whitespace_only_text(
        self,
        client: TestClient,
    ) -> None:
        """_validated_input strips whitespace and raises ApiServiceError."""
        resp = client.post(
            f"{CLINICAL_TEXT_BASE}/analyze",
            json=_make_payload(text="   "),
        )
        assert resp.status_code == 422

    def test_analyze_returns_403_for_insufficient_role(self) -> None:
        from app.errors import ApiServiceError

        guest_actor = AuthenticatedActor(
            actor_id="actor-guest",
            display_name="Guest",
            role="guest",
        )
        with patch.object(
            _ctr, "get_authenticated_actor", return_value=guest_actor,
        ):
            with patch.object(
                _ctr, "require_minimum_role",
                side_effect=ApiServiceError(
                    code="insufficient_role",
                    message="Clinician access is required.",
                    status_code=403,
                ),
            ):
                app = FastAPI()
                app.include_router(_ctr.router)
                c = TestClient(app)
                resp = c.post(f"{CLINICAL_TEXT_BASE}/analyze", json=_make_payload())
        assert resp.status_code == 403

    def test_analyze_with_valid_patient_id_and_consent_passes(
        self,
        client: TestClient,
        mock_adapter: MagicMock,
        mock_resolve_patient: MagicMock,
        mock_require_consent: MagicMock,
    ) -> None:
        resp = client.post(
            f"{CLINICAL_TEXT_BASE}/analyze",
            json=_make_payload(patient_id=VALID_PATIENT_ID),
        )
        assert resp.status_code == 200
        mock_resolve_patient.assert_called_once()
        mock_require_consent.assert_called_once()
        mock_adapter.analyze.assert_called_once()

    def test_analyze_returns_403_when_consent_missing(
        self,
        client: TestClient,
        mock_resolve_patient: MagicMock,
    ) -> None:
        from app.services.consent_enforcement import ConsentMissingError

        with patch.object(
            _ctr, "require_ai_analysis_consent",
            side_effect=ConsentMissingError("consent missing"),
        ):
            resp = client.post(
                f"{CLINICAL_TEXT_BASE}/analyze",
                json=_make_payload(patient_id=VALID_PATIENT_ID),
            )
        assert resp.status_code == 403
        body = resp.json()
        assert "consent" in body.get("detail", "").lower()

    def test_analyze_ignores_consent_for_nonexistent_patient(
        self,
        client: TestClient,
        mock_adapter: MagicMock,
        mock_require_consent: MagicMock,
    ) -> None:
        """Nonexistent patient_id -> _gate_patient_context returns False,
        consent is skipped, adapter still runs in generic mode."""
        resp = client.post(
            f"{CLINICAL_TEXT_BASE}/analyze",
            json=_make_payload(patient_id=NONEXISTENT_PATIENT_ID),
        )
        assert resp.status_code == 200
        mock_require_consent.assert_not_called()
        mock_adapter.analyze.assert_called_once()

    def test_analyze_works_without_patient_id_generic_mode(
        self,
        client: TestClient,
        mock_adapter: MagicMock,
        mock_require_consent: MagicMock,
    ) -> None:
        resp = client.post(
            f"{CLINICAL_TEXT_BASE}/analyze",
            json=_make_payload(),  # no patient_id
        )
        assert resp.status_code == 200
        mock_require_consent.assert_not_called()
        mock_adapter.analyze.assert_called_once()

    def test_analyze_with_null_patient_id_skips_consent(
        self,
        client: TestClient,
        mock_adapter: MagicMock,
        mock_require_consent: MagicMock,
    ) -> None:
        payload = _make_payload()
        payload["patient_id"] = None
        resp = client.post(
            f"{CLINICAL_TEXT_BASE}/analyze",
            json=payload,
        )
        assert resp.status_code == 200
        mock_require_consent.assert_not_called()

    def test_analyze_source_type_free_text(
        self,
        client: TestClient,
        mock_adapter: MagicMock,
    ) -> None:
        resp = client.post(
            f"{CLINICAL_TEXT_BASE}/analyze",
            json=_make_payload(source_type="free_text"),
        )
        assert resp.status_code == 200
        call_args = mock_adapter.analyze.call_args[0][0]
        assert call_args.source_type == "free_text"

    def test_analyze_source_type_clinician_note(
        self,
        client: TestClient,
        mock_adapter: MagicMock,
    ) -> None:
        resp = client.post(
            f"{CLINICAL_TEXT_BASE}/analyze",
            json=_make_payload(source_type="clinician_note"),
        )
        assert resp.status_code == 200
        call_args = mock_adapter.analyze.call_args[0][0]
        assert call_args.source_type == "clinician_note"

    def test_analyze_source_type_intake_form(
        self,
        client: TestClient,
        mock_adapter: MagicMock,
    ) -> None:
        resp = client.post(
            f"{CLINICAL_TEXT_BASE}/analyze",
            json=_make_payload(source_type="intake_form"),
        )
        assert resp.status_code == 200
        call_args = mock_adapter.analyze.call_args[0][0]
        assert call_args.source_type == "intake_form"

    def test_analyze_source_type_referral(
        self,
        client: TestClient,
        mock_adapter: MagicMock,
    ) -> None:
        resp = client.post(
            f"{CLINICAL_TEXT_BASE}/analyze",
            json=_make_payload(source_type="referral"),
        )
        assert resp.status_code == 200
        call_args = mock_adapter.analyze.call_args[0][0]
        assert call_args.source_type == "referral"

    def test_analyze_source_type_transcript(
        self,
        client: TestClient,
        mock_adapter: MagicMock,
    ) -> None:
        resp = client.post(
            f"{CLINICAL_TEXT_BASE}/analyze",
            json=_make_payload(source_type="transcript"),
        )
        assert resp.status_code == 200
        call_args = mock_adapter.analyze.call_args[0][0]
        assert call_args.source_type == "transcript"

    def test_analyze_source_type_document_text(
        self,
        client: TestClient,
        mock_adapter: MagicMock,
    ) -> None:
        resp = client.post(
            f"{CLINICAL_TEXT_BASE}/analyze",
            json=_make_payload(source_type="document_text"),
        )
        assert resp.status_code == 200
        call_args = mock_adapter.analyze.call_args[0][0]
        assert call_args.source_type == "document_text"

    def test_analyze_source_type_patient_note(
        self,
        client: TestClient,
        mock_adapter: MagicMock,
    ) -> None:
        resp = client.post(
            f"{CLINICAL_TEXT_BASE}/analyze",
            json=_make_payload(source_type="patient_note"),
        )
        assert resp.status_code == 200
        call_args = mock_adapter.analyze.call_args[0][0]
        assert call_args.source_type == "patient_note"

    def test_analyze_invalid_source_type_returns_422(
        self,
        client: TestClient,
    ) -> None:
        resp = client.post(
            f"{CLINICAL_TEXT_BASE}/analyze",
            json=_make_payload(source_type="invalid_source_type"),
        )
        assert resp.status_code == 422

    def test_analyze_non_english_locale(
        self,
        client: TestClient,
        mock_adapter: MagicMock,
    ) -> None:
        resp = client.post(
            f"{CLINICAL_TEXT_BASE}/analyze",
            json=_make_payload(locale="fr"),
        )
        assert resp.status_code == 200
        call_args = mock_adapter.analyze.call_args[0][0]
        assert call_args.locale == "fr"

    def test_analyze_text_at_max_length_boundary(
        self,
        client: TestClient,
        mock_adapter: MagicMock,
    ) -> None:
        """Very long but within-limit text should be accepted."""
        long_text = "word " * 1000  # well under 200k limit
        resp = client.post(
            f"{CLINICAL_TEXT_BASE}/analyze",
            json=_make_payload(text=long_text),
        )
        assert resp.status_code == 200
        call_args = mock_adapter.analyze.call_args[0][0]
        assert call_args.text == long_text


# =============================================================================
# 3. EXTRACT-PII ENDPOINT
# =============================================================================


class TestExtractPIIEndpoint:
    """POST /api/v1/clinical-text/extract-pii"""

    def test_extract_pii_successful(
        self,
        client: TestClient,
        mock_adapter: MagicMock,
    ) -> None:
        resp = client.post(
            f"{CLINICAL_TEXT_BASE}/extract-pii",
            json=_make_payload(text="John Doe is 45 years old."),
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["schema_id"] == "deepsynaps.openmed.pii/v1"
        assert len(body["pii"]) == 1
        assert body["pii"][0]["label"] == "person_name"
        mock_adapter.extract_pii.assert_called_once()

    def test_extract_pii_403_for_insufficient_role(self) -> None:
        from app.errors import ApiServiceError

        guest_actor = AuthenticatedActor(
            actor_id="actor-guest", display_name="Guest", role="guest",
        )
        with patch.object(
            _ctr, "get_authenticated_actor", return_value=guest_actor,
        ):
            with patch.object(
                _ctr, "require_minimum_role",
                side_effect=ApiServiceError(
                    code="insufficient_role",
                    message="Clinician access is required.",
                    status_code=403,
                ),
            ):
                app = FastAPI()
                app.include_router(_ctr.router)
                c = TestClient(app)
                resp = c.post(f"{CLINICAL_TEXT_BASE}/extract-pii", json=_make_payload())
        assert resp.status_code == 403

    def test_extract_pii_with_valid_patient_and_consent(
        self,
        client: TestClient,
        mock_adapter: MagicMock,
        mock_resolve_patient: MagicMock,
        mock_require_consent: MagicMock,
    ) -> None:
        resp = client.post(
            f"{CLINICAL_TEXT_BASE}/extract-pii",
            json=_make_payload(
                text="John Doe is 45.", patient_id=VALID_PATIENT_ID
            ),
        )
        assert resp.status_code == 200
        mock_resolve_patient.assert_called_once()
        mock_require_consent.assert_called_once()

    def test_extract_pii_generic_mode_no_patient(
        self,
        client: TestClient,
        mock_adapter: MagicMock,
        mock_require_consent: MagicMock,
    ) -> None:
        resp = client.post(
            f"{CLINICAL_TEXT_BASE}/extract-pii",
            json=_make_payload(text="Some generic text."),
        )
        assert resp.status_code == 200
        mock_require_consent.assert_not_called()

    def test_extract_pii_consent_missing_returns_403(
        self,
        client: TestClient,
        mock_resolve_patient: MagicMock,
    ) -> None:
        from app.services.consent_enforcement import ConsentMissingError

        with patch.object(
            _ctr, "require_ai_analysis_consent",
            side_effect=ConsentMissingError("consent missing"),
        ):
            resp = client.post(
                f"{CLINICAL_TEXT_BASE}/extract-pii",
                json=_make_payload(patient_id=VALID_PATIENT_ID),
            )
        assert resp.status_code == 403


# =============================================================================
# 4. DEIDENTIFY ENDPOINT
# =============================================================================


class TestDeidentifyEndpoint:
    """POST /api/v1/clinical-text/deidentify"""

    def test_deidentify_successful(
        self,
        client: TestClient,
        mock_adapter: MagicMock,
    ) -> None:
        resp = client.post(
            f"{CLINICAL_TEXT_BASE}/deidentify",
            json=_make_payload(text="John Doe lives at 123 Main St."),
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["schema_id"] == "deepsynaps.openmed.deid/v1"
        assert "[NAME]" in body["redacted_text"]
        assert len(body["replacements"]) == 1
        mock_adapter.deidentify.assert_called_once()

    def test_deidentify_returns_redacted_text(
        self,
        client: TestClient,
        mock_adapter: MagicMock,
    ) -> None:
        resp = client.post(
            f"{CLINICAL_TEXT_BASE}/deidentify",
            json=_make_payload(text="Contact Jane Doe at 555-1234."),
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "redacted_text" in body
        assert body["safety_footer"] == "de-identified preview; verify before sharing"

    def test_deidentify_403_for_insufficient_role(self) -> None:
        from app.errors import ApiServiceError

        guest_actor = AuthenticatedActor(
            actor_id="actor-guest", display_name="Guest", role="guest",
        )
        with patch.object(
            _ctr, "get_authenticated_actor", return_value=guest_actor,
        ):
            with patch.object(
                _ctr, "require_minimum_role",
                side_effect=ApiServiceError(
                    code="insufficient_role",
                    message="Clinician access is required.",
                    status_code=403,
                ),
            ):
                app = FastAPI()
                app.include_router(_ctr.router)
                c = TestClient(app)
                resp = c.post(f"{CLINICAL_TEXT_BASE}/deidentify", json=_make_payload())
        assert resp.status_code == 403

    def test_deidentify_with_valid_patient_and_consent(
        self,
        client: TestClient,
        mock_adapter: MagicMock,
        mock_resolve_patient: MagicMock,
        mock_require_consent: MagicMock,
    ) -> None:
        resp = client.post(
            f"{CLINICAL_TEXT_BASE}/deidentify",
            json=_make_payload(
                text="Patient info.", patient_id=VALID_PATIENT_ID
            ),
        )
        assert resp.status_code == 200
        mock_resolve_patient.assert_called_once()
        mock_require_consent.assert_called_once()

    def test_deidentify_generic_mode_no_patient(
        self,
        client: TestClient,
        mock_adapter: MagicMock,
        mock_require_consent: MagicMock,
    ) -> None:
        resp = client.post(
            f"{CLINICAL_TEXT_BASE}/deidentify",
            json=_make_payload(text="Generic text to deidentify."),
        )
        assert resp.status_code == 200
        mock_require_consent.assert_not_called()

    def test_deidentify_consent_missing_returns_403(
        self,
        client: TestClient,
        mock_resolve_patient: MagicMock,
    ) -> None:
        from app.services.consent_enforcement import ConsentMissingError

        with patch.object(
            _ctr, "require_ai_analysis_consent",
            side_effect=ConsentMissingError("consent missing"),
        ):
            resp = client.post(
                f"{CLINICAL_TEXT_BASE}/deidentify",
                json=_make_payload(patient_id=VALID_PATIENT_ID),
            )
        assert resp.status_code == 403


# =============================================================================
# 5. ANALYZE-NEUROMODULATION ENDPOINT
# =============================================================================


class TestAnalyzeNeuromodulationEndpoint:
    """POST /api/v1/clinical-text/analyze-neuromodulation"""

    def test_analyze_neuromodulation_successful(
        self,
        client: TestClient,
        mock_adapter: MagicMock,
    ) -> None:
        resp = client.post(
            f"{CLINICAL_TEXT_BASE}/analyze-neuromodulation",
            json=_make_payload(
                text="Patient received rTMS 10 Hz to left DLPFC."
            ),
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["schema_id"] == "deepsynaps.openmed.neuro/v1"
        assert len(body["entities"]) == 1
        assert body["entities"][0]["label"] == "stimulation_protocol"
        mock_adapter.analyze_neuromodulation.assert_called_once()

    def test_analyze_neuromodulation_returns_neuromod_entities(
        self,
        client: TestClient,
        mock_adapter: MagicMock,
    ) -> None:
        """Verify neuromodulation-specific entities are present in response."""
        resp = client.post(
            f"{CLINICAL_TEXT_BASE}/analyze-neuromodulation",
            json=_make_payload(
                text="tDCS montage: anode F3, cathode F4, 2 mA."
            ),
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "entities" in body
        assert "summary" in body
        assert body["safety_footer"] == "decision-support, not autonomous diagnosis"

    def test_analyze_neuromodulation_403_for_insufficient_role(self) -> None:
        from app.errors import ApiServiceError

        guest_actor = AuthenticatedActor(
            actor_id="actor-guest", display_name="Guest", role="guest",
        )
        with patch.object(
            _ctr, "get_authenticated_actor", return_value=guest_actor,
        ):
            with patch.object(
                _ctr, "require_minimum_role",
                side_effect=ApiServiceError(
                    code="insufficient_role",
                    message="Clinician access is required.",
                    status_code=403,
                ),
            ):
                app = FastAPI()
                app.include_router(_ctr.router)
                c = TestClient(app)
                resp = c.post(
                    f"{CLINICAL_TEXT_BASE}/analyze-neuromodulation",
                    json=_make_payload(),
                )
        assert resp.status_code == 403

    def test_analyze_neuromodulation_with_valid_patient_and_consent(
        self,
        client: TestClient,
        mock_adapter: MagicMock,
        mock_resolve_patient: MagicMock,
        mock_require_consent: MagicMock,
    ) -> None:
        resp = client.post(
            f"{CLINICAL_TEXT_BASE}/analyze-neuromodulation",
            json=_make_payload(
                text="Neuro text.", patient_id=VALID_PATIENT_ID
            ),
        )
        assert resp.status_code == 200
        mock_resolve_patient.assert_called_once()
        mock_require_consent.assert_called_once()

    def test_analyze_neuromodulation_generic_mode_no_patient(
        self,
        client: TestClient,
        mock_adapter: MagicMock,
        mock_require_consent: MagicMock,
    ) -> None:
        resp = client.post(
            f"{CLINICAL_TEXT_BASE}/analyze-neuromodulation",
            json=_make_payload(text="Generic neuromod text."),
        )
        assert resp.status_code == 200
        mock_require_consent.assert_not_called()

    def test_analyze_neuromodulation_consent_missing_returns_403(
        self,
        client: TestClient,
        mock_resolve_patient: MagicMock,
    ) -> None:
        from app.services.consent_enforcement import ConsentMissingError

        with patch.object(
            _ctr, "require_ai_analysis_consent",
            side_effect=ConsentMissingError("consent missing"),
        ):
            resp = client.post(
                f"{CLINICAL_TEXT_BASE}/analyze-neuromodulation",
                json=_make_payload(patient_id=VALID_PATIENT_ID),
            )
        assert resp.status_code == 403

    def test_analyze_neuromodulation_with_free_text_source_type(
        self,
        client: TestClient,
        mock_adapter: MagicMock,
    ) -> None:
        resp = client.post(
            f"{CLINICAL_TEXT_BASE}/analyze-neuromodulation",
            json=_make_payload(
                text="rTMS session log.", source_type="free_text"
            ),
        )
        assert resp.status_code == 200
        call_args = mock_adapter.analyze_neuromodulation.call_args[0][0]
        assert call_args.source_type == "free_text"


# =============================================================================
# 6. RATE LIMITING
# =============================================================================


class TestRateLimiting:
    """Verify endpoints carry the expected rate-limit decorators."""

    def test_analyze_has_rate_limit_decorator(self) -> None:
        func = _ctr.clinical_text_analyze
        assert hasattr(func, "_rate_limit")
        limit_value = func._rate_limit
        assert "30" in limit_value or "30/minute" in str(limit_value)

    def test_extract_pii_has_rate_limit_decorator(self) -> None:
        func = _ctr.clinical_text_extract_pii
        assert hasattr(func, "_rate_limit")
        limit_value = func._rate_limit
        assert "30" in limit_value or "30/minute" in str(limit_value)

    def test_deidentify_has_rate_limit_decorator(self) -> None:
        func = _ctr.clinical_text_deidentify
        assert hasattr(func, "_rate_limit")
        limit_value = func._rate_limit
        assert "30" in limit_value or "30/minute" in str(limit_value)

    def test_analyze_neuromodulation_has_rate_limit_decorator(self) -> None:
        func = _ctr.clinical_text_analyze_neuromodulation
        assert hasattr(func, "_rate_limit")
        limit_value = func._rate_limit
        assert "30" in limit_value or "30/minute" in str(limit_value)


# =============================================================================
# 7. CROSS-CLINIC OWNERSHIP
# =============================================================================


class TestCrossClinicOwnership:
    """Verify patient-owner gate fires for cross-clinic access."""

    def test_analyze_cross_clinic_patient_returns_403(self) -> None:
        from app.errors import ApiServiceError

        with patch.object(
            _ctr, "resolve_patient_clinic_id",
            return_value=(True, "different-clinic-id"),
        ):
            with patch.object(
                _ctr, "require_patient_owner",
                side_effect=ApiServiceError(
                    code="cross_clinic_access_denied",
                    message="This patient belongs to a different clinic.",
                    status_code=403,
                ),
            ):
                app = FastAPI()
                app.include_router(_ctr.router)
                c = TestClient(app)
                resp = c.post(
                    f"{CLINICAL_TEXT_BASE}/analyze",
                    json=_make_payload(patient_id=VALID_PATIENT_ID),
                )
        assert resp.status_code == 403

    def test_extract_pii_cross_clinic_patient_returns_403(self) -> None:
        from app.errors import ApiServiceError

        with patch.object(
            _ctr, "resolve_patient_clinic_id",
            return_value=(True, "different-clinic-id"),
        ):
            with patch.object(
                _ctr, "require_patient_owner",
                side_effect=ApiServiceError(
                    code="cross_clinic_access_denied",
                    message="This patient belongs to a different clinic.",
                    status_code=403,
                ),
            ):
                app = FastAPI()
                app.include_router(_ctr.router)
                c = TestClient(app)
                resp = c.post(
                    f"{CLINICAL_TEXT_BASE}/extract-pii",
                    json=_make_payload(patient_id=VALID_PATIENT_ID),
                )
        assert resp.status_code == 403

    def test_deidentify_cross_clinic_patient_returns_403(self) -> None:
        from app.errors import ApiServiceError

        with patch.object(
            _ctr, "resolve_patient_clinic_id",
            return_value=(True, "different-clinic-id"),
        ):
            with patch.object(
                _ctr, "require_patient_owner",
                side_effect=ApiServiceError(
                    code="cross_clinic_access_denied",
                    message="This patient belongs to a different clinic.",
                    status_code=403,
                ),
            ):
                app = FastAPI()
                app.include_router(_ctr.router)
                c = TestClient(app)
                resp = c.post(
                    f"{CLINICAL_TEXT_BASE}/deidentify",
                    json=_make_payload(patient_id=VALID_PATIENT_ID),
                )
        assert resp.status_code == 403

    def test_analyze_neuromod_cross_clinic_patient_returns_403(self) -> None:
        from app.errors import ApiServiceError

        with patch.object(
            _ctr, "resolve_patient_clinic_id",
            return_value=(True, "different-clinic-id"),
        ):
            with patch.object(
                _ctr, "require_patient_owner",
                side_effect=ApiServiceError(
                    code="cross_clinic_access_denied",
                    message="This patient belongs to a different clinic.",
                    status_code=403,
                ),
            ):
                app = FastAPI()
                app.include_router(_ctr.router)
                c = TestClient(app)
                resp = c.post(
                    f"{CLINICAL_TEXT_BASE}/analyze-neuromodulation",
                    json=_make_payload(patient_id=VALID_PATIENT_ID),
                )
        assert resp.status_code == 403


# =============================================================================
# 8. SHARED BEHAVIOR / EDGE CASES
# =============================================================================


class TestSharedEdgeCases:
    """Edge cases applicable to all POST endpoints."""

    def test_all_post_endpoints_reject_empty_json_body(
        self,
        client: TestClient,
    ) -> None:
        """Missing 'text' field entirely -> 422 from Pydantic."""
        for endpoint in (
            "analyze",
            "extract-pii",
            "deidentify",
            "analyze-neuromodulation",
        ):
            resp = client.post(
                f"{CLINICAL_TEXT_BASE}/{endpoint}",
                json={},
            )
            assert resp.status_code == 422, (
                f"Endpoint {endpoint} should return 422 for empty body, "
                f"got {resp.status_code}"
            )

    def test_all_post_endpoints_reject_missing_text_field(
        self,
        client: TestClient,
    ) -> None:
        """JSON without 'text' key -> 422."""
        for endpoint in (
            "analyze",
            "extract-pii",
            "deidentify",
            "analyze-neuromodulation",
        ):
            resp = client.post(
                f"{CLINICAL_TEXT_BASE}/{endpoint}",
                json={"source_type": "free_text"},
            )
            assert resp.status_code == 422

    def test_admin_role_can_access_analyze(self) -> None:
        """Admin role (ROLE_ORDER=5) is above clinician (ROLE_ORDER=4)."""
        admin_actor = AuthenticatedActor(
            actor_id="actor-admin",
            display_name="Admin",
            role="admin",
        )
        with patch.object(
            _ctr, "get_authenticated_actor", return_value=admin_actor,
        ):
            app = FastAPI()
            app.include_router(_ctr.router)
            c = TestClient(app)
            resp = c.post(
                f"{CLINICAL_TEXT_BASE}/analyze",
                json=_make_payload(),
            )
        assert resp.status_code == 200

    def test_supervisor_role_can_access_analyze(self) -> None:
        """Supervisor role (ROLE_ORDER=5) is above clinician."""
        supervisor_actor = AuthenticatedActor(
            actor_id="actor-supervisor",
            display_name="Supervisor",
            role="supervisor",
        )
        with patch.object(
            _ctr, "get_authenticated_actor", return_value=supervisor_actor,
        ):
            app = FastAPI()
            app.include_router(_ctr.router)
            c = TestClient(app)
            resp = c.post(
                f"{CLINICAL_TEXT_BASE}/analyze",
                json=_make_payload(),
            )
        assert resp.status_code == 200

    def test_patient_role_cannot_access_analyze(self) -> None:
        """Patient role (ROLE_ORDER=1) is below clinician (ROLE_ORDER=4)."""
        from app.errors import ApiServiceError

        patient_actor = AuthenticatedActor(
            actor_id="actor-patient",
            display_name="Patient",
            role="patient",
        )
        with patch.object(
            _ctr, "get_authenticated_actor", return_value=patient_actor,
        ):
            with patch.object(
                _ctr, "require_minimum_role",
                side_effect=ApiServiceError(
                    code="insufficient_role",
                    message="Clinician access is required.",
                    status_code=403,
                ),
            ):
                app = FastAPI()
                app.include_router(_ctr.router)
                c = TestClient(app)
                resp = c.post(
                    f"{CLINICAL_TEXT_BASE}/analyze",
                    json=_make_payload(),
                )
        assert resp.status_code == 403

    def test_analyze_preserves_unicode_text(
        self,
        client: TestClient,
        mock_adapter: MagicMock,
    ) -> None:
        """Unicode characters in text should pass through cleanly."""
        unicode_text = "Patient reports cephal\u00e9e and vertige."
        resp = client.post(
            f"{CLINICAL_TEXT_BASE}/analyze",
            json=_make_payload(text=unicode_text),
        )
        assert resp.status_code == 200
        call_args = mock_adapter.analyze.call_args[0][0]
        assert call_args.text == unicode_text

    def test_analyze_strips_leading_trailing_whitespace(
        self,
        client: TestClient,
        mock_adapter: MagicMock,
    ) -> None:
        """_validated_input should strip whitespace from text."""
        resp = client.post(
            f"{CLINICAL_TEXT_BASE}/analyze",
            json=_make_payload(text="  trimmed text  "),
        )
        assert resp.status_code == 200
        call_args = mock_adapter.analyze.call_args[0][0]
        assert call_args.text == "trimmed text"

    def test_analyze_with_stimulation_log_source_type(
        self,
        client: TestClient,
        mock_adapter: MagicMock,
    ) -> None:
        """free_text source_type works for neuromodulation-related requests."""
        resp = client.post(
            f"{CLINICAL_TEXT_BASE}/analyze",
            json=_make_payload(
                text="Stimulation session log entry.",
                source_type="free_text",
            ),
        )
        assert resp.status_code == 200
        call_args = mock_adapter.analyze.call_args[0][0]
        assert call_args.source_type == "free_text"
