"""Tests for :mod:`app.routers.research_dataset_router`.

Slice C scaffold — research dataset spec endpoints, hard-gated behind
``RESEARCH_EXPORT_ENABLED``. The flag is intentionally not set on
production / staging, so the bulk of these tests exercise the *gate*,
not the underlying behaviour.

Notes
-----
* All anonymization primitives need ``DEEPSYNAPS_DATE_SHIFT_SECRET`` +
  ``DEEPSYNAPS_ANON_ID_SECRET``. We set both via ``monkeypatch.setenv``
  on the fixtures that need them.
* ``research_consent_service.get_consent_status_for_patients`` may not
  exist yet (Slice B is in flight). The preflight test stubs the module
  import via :func:`monkeypatch.setattr` so we can verify the consent
  filter end-to-end without coupling to Slice B's merge ordering.
"""
from __future__ import annotations

import sys
import types
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient


# ── Helpers ──────────────────────────────────────────────────────────────────


def _enable_flag(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("RESEARCH_EXPORT_ENABLED", "true")
    monkeypatch.setenv("DEEPSYNAPS_ANON_ID_SECRET", "test-secret-id")
    monkeypatch.setenv("DEEPSYNAPS_DATE_SHIFT_SECRET", "test-secret-date")


def _disable_flag(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("RESEARCH_EXPORT_ENABLED", raising=False)


def _valid_create_body() -> dict:
    return {
        "name": "Pilot Cohort",
        "description": "k=5 pilot for IRB exemption",
        "source_clinic_ids": ["clinic-demo-default"],
        "included_tables": ["patients", "consent_records"],
        "quasi_id_fields": ["age_bucket"],
        "k_anonymity_threshold": 5,
    }


# ── Flag gate (flag OFF → 403 everywhere) ────────────────────────────────────


def test_endpoints_403_when_flag_unset(
    client: TestClient,
    auth_headers: dict,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Every endpoint returns 403 when the env flag is unset.

    The detail message names ``RESEARCH_EXPORT_ENABLED`` so an
    operator hitting the endpoint can self-serve the fix.
    """
    _disable_flag(monkeypatch)

    cases = [
        ("post", "/api/v1/research-datasets", _valid_create_body()),
        ("get", "/api/v1/research-datasets", None),
        ("get", "/api/v1/research-datasets/rd_abc", None),
        ("post", "/api/v1/research-datasets/rd_abc/preflight", None),
        ("post", "/api/v1/research-datasets/rd_abc/build", None),
        ("post", "/api/v1/research-datasets/rd_abc/revoke", None),
    ]
    for method, path, body in cases:
        kwargs = {"headers": auth_headers["admin"]}
        if body is not None:
            kwargs["json"] = body
        resp = getattr(client, method)(path, **kwargs)
        assert resp.status_code == 403, (method, path, resp.text)
        assert "RESEARCH_EXPORT_ENABLED" in resp.text


def test_flag_value_must_be_true(
    client: TestClient,
    auth_headers: dict,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """``RESEARCH_EXPORT_ENABLED=1`` / ``yes`` / etc. are NOT accepted.

    Only the literal string ``"true"`` (case-insensitive) flips the
    gate, on the principle that a typo should fail closed.
    """
    monkeypatch.setenv("RESEARCH_EXPORT_ENABLED", "1")
    resp = client.get(
        "/api/v1/research-datasets", headers=auth_headers["admin"]
    )
    assert resp.status_code == 403


# ── Role gate (flag ON, non-admin → 403) ─────────────────────────────────────


def test_non_admin_forbidden_when_flag_on(
    client: TestClient,
    auth_headers: dict,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Even with the flag on, only ``admin`` can call these endpoints."""
    _enable_flag(monkeypatch)
    for role in ("clinician", "guest", "patient"):
        resp = client.get(
            "/api/v1/research-datasets", headers=auth_headers[role]
        )
        assert resp.status_code == 403, f"role={role} got {resp.status_code}"


# ── Happy path: create / list / get ──────────────────────────────────────────


def test_admin_can_create_list_and_get(
    client: TestClient,
    auth_headers: dict,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _enable_flag(monkeypatch)

    # Create
    resp = client.post(
        "/api/v1/research-datasets",
        headers=auth_headers["admin"],
        json=_valid_create_body(),
    )
    assert resp.status_code == 201, resp.text
    created = resp.json()
    assert created["status"] == "draft"
    assert created["name"] == "Pilot Cohort"
    assert created["id"].startswith("rd_")
    dataset_id = created["id"]

    # List
    resp = client.get(
        "/api/v1/research-datasets", headers=auth_headers["admin"]
    )
    assert resp.status_code == 200, resp.text
    items = resp.json()
    assert any(d["id"] == dataset_id for d in items)
    # export_uri suppressed on a draft.
    for d in items:
        assert d.get("export_uri") is None

    # Get
    resp = client.get(
        f"/api/v1/research-datasets/{dataset_id}",
        headers=auth_headers["admin"],
    )
    assert resp.status_code == 200, resp.text
    detail = resp.json()
    assert detail["id"] == dataset_id
    assert detail["k_anonymity_threshold"] == 5
    assert detail["included_tables"] == ["patients", "consent_records"]


def test_get_missing_dataset_returns_404(
    client: TestClient,
    auth_headers: dict,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _enable_flag(monkeypatch)
    resp = client.get(
        "/api/v1/research-datasets/rd_doesnotexist",
        headers=auth_headers["admin"],
    )
    assert resp.status_code == 404


# ── Validation ───────────────────────────────────────────────────────────────


def test_create_rejects_unknown_table(
    client: TestClient,
    auth_headers: dict,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """``included_tables`` outside ``SAFE_TABLES`` is a 422.

    This is the load-bearing guard between the dataset spec and the
    data-console allowlist: a researcher cannot smuggle a non-allowlisted
    table into the (deferred) build job.
    """
    _enable_flag(monkeypatch)
    body = _valid_create_body()
    body["included_tables"] = ["patients", "users"]  # 'users' is not safe
    resp = client.post(
        "/api/v1/research-datasets",
        headers=auth_headers["admin"],
        json=body,
    )
    assert resp.status_code == 422, resp.text


# ── Build (deferred) ─────────────────────────────────────────────────────────


def test_build_is_deferred_with_log(
    client: TestClient,
    auth_headers: dict,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Build returns 202 and stamps a deferred-message line into build_log.

    The actual Celery task lands in a follow-up PR; this test pins the
    contract so a future implementation doesn't accidentally start
    shipping data while the placeholder is still in place.
    """
    _enable_flag(monkeypatch)

    resp = client.post(
        "/api/v1/research-datasets",
        headers=auth_headers["admin"],
        json=_valid_create_body(),
    )
    dataset_id = resp.json()["id"]

    resp = client.post(
        f"/api/v1/research-datasets/{dataset_id}/build",
        headers=auth_headers["admin"],
    )
    assert resp.status_code == 202, resp.text
    body = resp.json()
    assert body["status"] == "building"
    assert "BUILD DEFERRED" in body["detail"]

    # Verify it landed in the persisted build_log.
    resp = client.get(
        f"/api/v1/research-datasets/{dataset_id}",
        headers=auth_headers["admin"],
    )
    detail = resp.json()
    assert detail["status"] == "building"
    assert "BUILD DEFERRED" in (detail.get("build_log") or "")


# ── Revoke ───────────────────────────────────────────────────────────────────


def test_revoke_clears_export_uri(
    client: TestClient,
    auth_headers: dict,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """``/revoke`` flips status -> revoked and nulls ``export_uri``.

    Even though we never populate ``export_uri`` in this PR, the kill-
    switch contract is what a future operator will rely on when they
    need to recall a leaked dataset.
    """
    _enable_flag(monkeypatch)
    resp = client.post(
        "/api/v1/research-datasets",
        headers=auth_headers["admin"],
        json=_valid_create_body(),
    )
    dataset_id = resp.json()["id"]

    resp = client.post(
        f"/api/v1/research-datasets/{dataset_id}/revoke",
        headers=auth_headers["admin"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "revoked"
    assert body.get("export_uri") is None


# ── Preflight + consent gating ───────────────────────────────────────────────


def _stub_research_consent_service(
    monkeypatch: pytest.MonkeyPatch, allowed_ids: set[str]
) -> None:
    """Install a fake ``app.services.research_consent_service`` module.

    Slice B owns the real implementation. We stub it here so we can
    test the preflight consent filter without waiting for Slice B's
    merge.
    """
    mod = types.ModuleType("app.services.research_consent_service")

    def get_consent_status_for_patients(session, patient_ids):
        return {
            pid: {"granted": pid in allowed_ids} for pid in patient_ids
        }

    mod.get_consent_status_for_patients = get_consent_status_for_patients
    monkeypatch.setitem(
        sys.modules, "app.services.research_consent_service", mod
    )


def _seed_two_patients(client: TestClient) -> tuple[str, str]:
    """Insert two patients directly into the SQLite test DB.

    Returns ``(pid_consented, pid_not_consented)``. We bypass the
    patients router because (a) it requires fields we don't care
    about here, and (b) we want to control the ids so the consent
    stub can match them.
    """
    from app.database import SessionLocal
    from app.persistence.models import Patient

    db = SessionLocal()
    try:
        p1 = Patient(
            id="patient-consent-yes",
            clinician_id="actor-clinician-demo",
            first_name="Alice",
            last_name="Anon",
            dob="1980-01-01",
        )
        p2 = Patient(
            id="patient-consent-no",
            clinician_id="actor-clinician-demo",
            first_name="Bob",
            last_name="Bloc",
            dob="1985-01-01",
        )
        db.add_all([p1, p2])
        db.commit()
    finally:
        db.close()
    return "patient-consent-yes", "patient-consent-no"


def test_preflight_excludes_rows_without_consent(
    client: TestClient,
    auth_headers: dict,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Preflight drops rows whose patient lacks an active consent.

    Verifies that the preflight sample respects Slice B's consent
    state: only patients with ``granted=True`` reach the k-anonymity
    check. The ``consent_filtered_out`` counter surfaces the drop so
    the operator can see *why* their cohort shrank.
    """
    _enable_flag(monkeypatch)
    pid_yes, pid_no = _seed_two_patients(client)
    _stub_research_consent_service(monkeypatch, allowed_ids={pid_yes})

    # Create the dataset.
    resp = client.post(
        "/api/v1/research-datasets",
        headers=auth_headers["admin"],
        json=_valid_create_body(),
    )
    dataset_id = resp.json()["id"]

    resp = client.post(
        f"/api/v1/research-datasets/{dataset_id}/preflight",
        headers=auth_headers["admin"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    # Exactly the consented patient reaches the sample.
    assert body["sample_size"] == 1
    assert body["consent_filtered_out"] == 1
    # And the sample row carries an anonymized id, not the raw one.
    assert body["sample_rows"]
    sample = body["sample_rows"][0]
    assert sample["patient_id_hash"] != pid_yes
    assert len(sample["patient_id_hash"]) == 16


def test_preflight_when_slice_b_missing(
    client: TestClient,
    auth_headers: dict,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """If Slice B's service is unavailable, preflight excludes ALL rows.

    Conservative fail-closed behaviour: a missing consent service must
    never accidentally release rows we cannot verify.
    """
    _enable_flag(monkeypatch)
    _seed_two_patients(client)

    # Ensure the module is absent.
    monkeypatch.setitem(
        sys.modules, "app.services.research_consent_service", None
    )

    resp = client.post(
        "/api/v1/research-datasets",
        headers=auth_headers["admin"],
        json=_valid_create_body(),
    )
    dataset_id = resp.json()["id"]

    resp = client.post(
        f"/api/v1/research-datasets/{dataset_id}/preflight",
        headers=auth_headers["admin"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["sample_size"] == 0
    assert body["consent_filtered_out"] >= 2
