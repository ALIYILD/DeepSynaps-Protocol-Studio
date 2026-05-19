"""Patient-linked neuroimaging knowledge search — Category 4 PR-4.

POST /api/v1/neuroimaging/search-for-patient

Test matrix (per the cross-clinic IDOR pattern memory note
``deepsynaps-qeeg-pdf-export-tenant-gate.md`` — every patient-data
endpoint MUST ship with a cross-clinic regression):

1. Happy path: clinician of patient's clinic → 200 + results +
   consent_status echoed.
2. Cross-clinic IDOR: clinician of OTHER clinic → 403 with
   ``cross_clinic_access_denied``. MANDATORY.
3. Missing ai_analysis consent: 403 with ``consent_missing``.
4. Missing patient_id: 422 (FastAPI validation).
5. Patient not found: 404.
6. Federation runtime delegation — the endpoint MUST call
   :func:`app.services.knowledge.neuroimaging_federation.federate`,
   never duplicate federation logic.

The PR-3 federation runtime
(``app.services.knowledge.neuroimaging_federation``) may not be wired
in this build yet — these tests synthesise a minimal in-memory module
and inject it into ``sys.modules`` so the endpoint's lazy import path
succeeds against the contract documented in the PR-3 federation router.
"""
from __future__ import annotations

import sys
import types
import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.persistence.models import Clinic, ConsentRecord, Patient, User


pytestmark = pytest.mark.usefixtures("isolated_database")


# ─── Federation runtime stub ─────────────────────────────────────────────────


_FED_INVOCATIONS: list[dict[str, Any]] = []


def _install_fake_federation_runtime(*, results: list[dict[str, Any]] | None = None) -> None:
    """Install a minimal in-memory federation runtime under
    ``app.services.knowledge.neuroimaging_federation`` and
    ``app.services.knowledge.neuroimaging_inventory`` so the lazy import
    in the patient-linked search endpoint succeeds.

    Records every ``federate()`` call into ``_FED_INVOCATIONS`` so tests
    can assert the endpoint delegated, rather than duplicating logic.
    """
    _FED_INVOCATIONS.clear()

    fed_module = types.ModuleType("app.services.knowledge.neuroimaging_federation")
    inv_module = types.ModuleType("app.services.knowledge.neuroimaging_inventory")

    # Minimal Pydantic-ish stand-in for NeuroimagingSearchResult.
    class _FakeResult:
        def __init__(self, **kw: Any) -> None:
            self._data = kw
            self.source = kw.get("source", "neurovault")
            self.provenance = kw.get("provenance", {})

        def model_dump(self) -> dict[str, Any]:
            return dict(self._data)

    class _FakeQuery:
        def __init__(self, **kw: Any) -> None:
            self.__dict__.update(kw)

    async def _fake_federate(query: Any, enabled: list[dict[str, Any]]) -> dict[str, Any]:
        _FED_INVOCATIONS.append(
            {
                "query": getattr(query, "__dict__", {}),
                "enabled_ids": [s["id"] for s in enabled],
            }
        )
        rows = results if results is not None else [
            _FakeResult(
                title="Working memory n-back contrast",
                source="neurovault",
                source_id="42",
                modality="fMRI-BOLD",
                provenance={"citation": "Doe 2020"},
            )
        ]
        return {
            "results": rows,
            "source_status": [
                {
                    "id": "neurovault",
                    "name": "NeuroVault",
                    "status": "ok",
                    "result_count": len(rows),
                    "error": None,
                }
            ],
            "warnings": [],
        }

    fed_module.federate = _fake_federate  # type: ignore[attr-defined]
    fed_module.NeuroimagingSearchQuery = _FakeQuery  # type: ignore[attr-defined]
    fed_module.NeuroimagingSearchResult = _FakeResult  # type: ignore[attr-defined]

    inv_module.DECISION_SUPPORT_DISCLAIMER = (  # type: ignore[attr-defined]
        "Decision-support tool. Not a medical device. Clinician must "
        "verify against patient anatomy."
    )
    inv_module.NEUROIMAGING_SOURCES = [  # type: ignore[attr-defined]
        {"id": "neurovault", "name": "NeuroVault"},
        {"id": "openneuro", "name": "OpenNeuro"},
    ]
    inv_module.list_enabled_sources = lambda: [  # type: ignore[attr-defined]
        {"id": "neurovault", "name": "NeuroVault", "source_url": "https://neurovault.org", "lifecycle_state": "healthy"},
    ]

    sys.modules["app.services.knowledge.neuroimaging_federation"] = fed_module
    sys.modules["app.services.knowledge.neuroimaging_inventory"] = inv_module


def _uninstall_fake_federation_runtime() -> None:
    for k in (
        "app.services.knowledge.neuroimaging_federation",
        "app.services.knowledge.neuroimaging_inventory",
    ):
        sys.modules.pop(k, None)


# ─── Seeding helpers (parallels test_cross_clinic_ownership) ─────────────────


def _seed_two_clinics_with_patient(db: Session) -> dict[str, Any]:
    """Seed clinic A + clinic B + a clinician in each + a Patient under
    clinician A. Returns ids the test asserts against.
    """
    clinic_a = Clinic(id=str(uuid.uuid4()), name="PR-4 Clinic A")
    clinic_b = Clinic(id=str(uuid.uuid4()), name="PR-4 Clinic B")
    db.add_all([clinic_a, clinic_b])
    db.flush()

    clin_a = User(
        id=str(uuid.uuid4()),
        email=f"pr4_clin_a_{uuid.uuid4().hex[:8]}@example.com",
        display_name="Clinician A",
        hashed_password="x",
        role="clinician",
        package_id="explorer",
        clinic_id=clinic_a.id,
    )
    clin_b = User(
        id=str(uuid.uuid4()),
        email=f"pr4_clin_b_{uuid.uuid4().hex[:8]}@example.com",
        display_name="Clinician B",
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
        first_name="N",
        last_name="Patient",
    )
    db.add(patient)
    db.commit()

    return {
        "clinic_a_id": clinic_a.id,
        "clinic_b_id": clinic_b.id,
        "clin_a_id": clin_a.id,
        "clin_b_id": clin_b.id,
        "patient_id": patient.id,
    }


def _add_ai_consent(db: Session, *, patient_id: str, clinician_id: str) -> str:
    """Persist an active ai_analysis ConsentRecord for the pair."""
    consent = ConsentRecord(
        id=str(uuid.uuid4()),
        patient_id=patient_id,
        clinician_id=clinician_id,
        consent_type="ai_analysis",
        status="active",
        signed=True,
    )
    db.add(consent)
    db.commit()
    return consent.id


def _mint_token(user_id: str, role: str, clinic_id: str | None) -> str:
    from app.services.auth_service import create_access_token
    return create_access_token(
        user_id=user_id,
        email=f"{user_id}@example.com",
        role=role,
        package_id="explorer",
        clinic_id=clinic_id,
    )


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def neuro_patient_setup() -> dict[str, Any]:
    """Seed two clinics, two clinicians, one patient at clinic A, and a
    valid ai_analysis consent for the clinic-A clinician.
    """
    db: Session = SessionLocal()
    try:
        ids = _seed_two_clinics_with_patient(db)
        consent_id = _add_ai_consent(
            db, patient_id=ids["patient_id"], clinician_id=ids["clin_a_id"]
        )
        ids["consent_id"] = consent_id
    finally:
        db.close()

    ids["token_clin_a"] = _mint_token(
        ids["clin_a_id"], "clinician", ids["clinic_a_id"]
    )
    ids["token_clin_b"] = _mint_token(
        ids["clin_b_id"], "clinician", ids["clinic_b_id"]
    )
    return ids


# ─── Happy path ─────────────────────────────────────────────────────────────


def test_happy_path_returns_200_with_consent_status(
    client: TestClient, neuro_patient_setup: dict[str, Any]
) -> None:
    """Clinician of patient's clinic + valid consent → 200 with results,
    consent_status, and patient_id echoed in provenance.
    """
    _install_fake_federation_runtime()
    try:
        resp = client.post(
            "/api/v1/neuroimaging/search-for-patient",
            json={
                "patient_id": neuro_patient_setup["patient_id"],
                "condition": "working memory",
                "modality": "fMRI-BOLD",
                "limit": 5,
            },
            headers=_auth(neuro_patient_setup["token_clin_a"]),
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()

        # Patient id echoed at both top level and in provenance.
        assert body["patient_id"] == neuro_patient_setup["patient_id"]
        assert body["provenance"]["patient_id"] == neuro_patient_setup["patient_id"]

        # Consent status carries the record id used.
        assert body["consent_status"]["ai_modality"] == "neuroimaging"
        assert body["consent_status"]["consent_type"] == "ai_analysis"
        assert body["consent_status"]["consent_id"] == neuro_patient_setup["consent_id"]

        # Federation delegated correctly.
        assert len(_FED_INVOCATIONS) == 1
        assert _FED_INVOCATIONS[0]["enabled_ids"] == ["neurovault"]
        assert _FED_INVOCATIONS[0]["query"]["condition"] == "working memory"
        assert _FED_INVOCATIONS[0]["query"]["modality"] == "fMRI-BOLD"

        # Results normalized.
        assert len(body["results"]) == 1
        assert body["results"][0]["source_id"] == "neurovault"
        assert body["decision_support_disclaimer"].startswith("Decision-support")
    finally:
        _uninstall_fake_federation_runtime()


# ─── Cross-clinic IDOR (MANDATORY) ──────────────────────────────────────────


def test_cross_clinic_clinician_denied(
    client: TestClient, neuro_patient_setup: dict[str, Any]
) -> None:
    """Clinician at clinic B cannot query patient at clinic A.

    This is the regression for ``deepsynaps-qeeg-pdf-export-tenant-gate.md``.
    """
    _install_fake_federation_runtime()
    try:
        resp = client.post(
            "/api/v1/neuroimaging/search-for-patient",
            json={
                "patient_id": neuro_patient_setup["patient_id"],
                "condition": "working memory",
            },
            headers=_auth(neuro_patient_setup["token_clin_b"]),
        )
        assert resp.status_code == 403, resp.text
        assert resp.json()["code"] == "cross_clinic_access_denied"
        # Federation MUST NOT have been called.
        assert _FED_INVOCATIONS == []
    finally:
        _uninstall_fake_federation_runtime()


# ─── Missing consent ────────────────────────────────────────────────────────


def test_missing_ai_consent_denied(client: TestClient) -> None:
    """No active ai_analysis consent → 403 with consent_missing."""
    db: Session = SessionLocal()
    try:
        ids = _seed_two_clinics_with_patient(db)
        # Deliberately NO consent record seeded.
    finally:
        db.close()
    token = _mint_token(ids["clin_a_id"], "clinician", ids["clinic_a_id"])

    _install_fake_federation_runtime()
    try:
        resp = client.post(
            "/api/v1/neuroimaging/search-for-patient",
            json={"patient_id": ids["patient_id"]},
            headers=_auth(token),
        )
        assert resp.status_code == 403, resp.text
        assert resp.json()["code"] == "consent_missing"
        # Federation MUST NOT have been called.
        assert _FED_INVOCATIONS == []
    finally:
        _uninstall_fake_federation_runtime()


# ─── Validation ─────────────────────────────────────────────────────────────


def test_missing_patient_id_returns_422(client: TestClient) -> None:
    """Body without patient_id → 422 (Pydantic validation)."""
    token = _mint_token("nobody", "clinician", "ghost-clinic")
    resp = client.post(
        "/api/v1/neuroimaging/search-for-patient",
        json={"condition": "working memory"},
        headers=_auth(token),
    )
    assert resp.status_code == 422, resp.text


def test_patient_not_found_returns_404(
    client: TestClient, neuro_patient_setup: dict[str, Any]
) -> None:
    """Unknown patient_id → 404 not_found before federation is touched."""
    _install_fake_federation_runtime()
    try:
        resp = client.post(
            "/api/v1/neuroimaging/search-for-patient",
            json={"patient_id": "patient-does-not-exist-xxx"},
            headers=_auth(neuro_patient_setup["token_clin_a"]),
        )
        assert resp.status_code == 404, resp.text
        assert resp.json()["code"] == "not_found"
        assert _FED_INVOCATIONS == []
    finally:
        _uninstall_fake_federation_runtime()


# ─── Federation delegation ──────────────────────────────────────────────────


def test_federate_called_once_per_request(
    client: TestClient, neuro_patient_setup: dict[str, Any]
) -> None:
    """The endpoint delegates federation — no duplicate logic.

    Strong contract: exactly one ``federate()`` invocation per 200 OK.
    """
    _install_fake_federation_runtime()
    try:
        resp = client.post(
            "/api/v1/neuroimaging/search-for-patient",
            json={
                "patient_id": neuro_patient_setup["patient_id"],
                "modality": "fMRI-BOLD",
            },
            headers=_auth(neuro_patient_setup["token_clin_a"]),
        )
        assert resp.status_code == 200, resp.text
        assert len(_FED_INVOCATIONS) == 1
    finally:
        _uninstall_fake_federation_runtime()


# ─── No federation runtime → 503 (PR-3 not yet wired) ───────────────────────


def test_no_federation_runtime_returns_503(
    client: TestClient, neuro_patient_setup: dict[str, Any]
) -> None:
    """If the PR-3 federation runtime is not importable, the endpoint
    returns a structured 503 — it must NOT crash or leak patient data.
    """
    # Make sure no fake runtime is installed.
    _uninstall_fake_federation_runtime()
    resp = client.post(
        "/api/v1/neuroimaging/search-for-patient",
        json={"patient_id": neuro_patient_setup["patient_id"]},
        headers=_auth(neuro_patient_setup["token_clin_a"]),
    )
    # The build may or may not include PR-3. Either: 503 (no runtime) or
    # 200 (runtime live). Both are acceptable; the contract is "no crash".
    assert resp.status_code in (200, 503), resp.text
    if resp.status_code == 503:
        assert resp.json()["code"] == "federation_runtime_unavailable"
