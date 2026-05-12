"""Regression tests: P1 cross-clinic IDOR gates on finance router.

Covered routes:
  POST /api/v1/finance/invoices (when patient_id is supplied)
    fix: apps/api/app/routers/finance_router.py:310 —
         _gate_patient_access(actor, body.patient_id, session) after
         _require_finance_write when patient_id is present.
  POST /api/v1/finance/claims (when patient_id is supplied)
    fix: apps/api/app/routers/finance_router.py:436 — same pattern.

Finance write endpoints currently require admin or clinic-admin role
(_require_finance_write); admin actors bypass the patient ownership gate
by design (platform operators are cross-clinic).  The gate is therefore
exercised by a clinic-admin role actor — but no clinic-admin demo token
exists in the current registry.  These tests validate:

  1. The gate raises 404 for a non-existent patient_id (pre-write guard).
  2. When a patient_id belongs to a real patient, the gate will enforce
     ownership when a non-admin write-capable role is present.  This test
     uses the admin token (which bypasses) to confirm the happy-path still
     works, and documents the 404 guard for the non-existent-patient case.

NOTE: Full cross-clinic 403 coverage for finance requires a clinic-admin
demo token bound to a *different* clinic_id than the patient's owning clinic.
That test will be added in a follow-up when the clinic-admin demo actor is
seeded (tracked as a non-blocking follow-up to this PR).
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

_ADMIN = {"Authorization": "Bearer admin-demo-token"}
_CLINICIAN = {"Authorization": "Bearer clinician-demo-token"}


def _create_patient(client: TestClient) -> str:
    """Create a patient owned by the demo clinician (actor-clinician-demo)."""
    resp = client.post(
        "/api/v1/patients",
        json={
            "first_name": "Finance",
            "last_name": "TestPatient",
            "dob": "1975-09-01",
            "gender": "M",
            "primary_condition": "GAD",
            "status": "active",
        },
        headers=_CLINICIAN,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


class TestInvoicePatientGate:
    """POST /api/v1/finance/invoices — patient_id gate."""

    def test_create_invoice_with_valid_patient_id_succeeds(
        self, client: TestClient
    ) -> None:
        """Admin (gate bypassed) + a real patient_id → 201."""
        patient_id = _create_patient(client)
        resp = client.post(
            "/api/v1/finance/invoices",
            json={
                "patient_id": patient_id,
                "patient_name": "Finance TestPatient",
                "service": "TMS Course",
                "amount": 200.0,
                "vat_rate": 0.20,
                "issue_date": "2026-05-11",
                "due_date": "2026-06-11",
                "status": "draft",
                "currency": "GBP",
            },
            headers=_ADMIN,
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["patient_id"] == patient_id

    def test_create_invoice_nonexistent_patient_returns_404(
        self, client: TestClient
    ) -> None:
        """Non-existent patient_id must return 404 before invoice is written.

        Pre-fix: the invoice was written anyway since patient_id was never
        validated, leaking that UUIDs are enumerable via error vs. success.
        """
        resp = client.post(
            "/api/v1/finance/invoices",
            json={
                "patient_id": "00000000-0000-0000-0000-deadbeef0001",
                "patient_name": "Ghost Patient",
                "service": "TMS Course",
                "amount": 100.0,
                "vat_rate": 0.20,
                "issue_date": "2026-05-11",
                "due_date": "2026-06-11",
                "status": "draft",
                "currency": "GBP",
            },
            headers=_ADMIN,
        )
        assert resp.status_code == 404, (
            f"Expected 404 for non-existent patient_id, got {resp.status_code}: {resp.text}"
        )

    def test_create_invoice_without_patient_id_still_works(
        self, client: TestClient
    ) -> None:
        """Invoice without patient_id (anonymous billing) is unaffected by gate."""
        resp = client.post(
            "/api/v1/finance/invoices",
            json={
                "patient_name": "Anonymous Billing",
                "service": "Consultation",
                "amount": 150.0,
                "vat_rate": 0.20,
                "issue_date": "2026-05-11",
                "due_date": "2026-06-11",
                "status": "draft",
                "currency": "GBP",
            },
            headers=_ADMIN,
        )
        assert resp.status_code == 201, resp.text


class TestClaimPatientGate:
    """POST /api/v1/finance/claims — patient_id gate."""

    def test_create_claim_with_valid_patient_id_succeeds(
        self, client: TestClient
    ) -> None:
        """Admin (gate bypassed) + a real patient_id → 201."""
        patient_id = _create_patient(client)
        resp = client.post(
            "/api/v1/finance/claims",
            json={
                "patient_id": patient_id,
                "patient_name": "Finance TestPatient",
                "insurer": "BUPA",
                "description": "TMS pre-auth",
                "amount": 3000.0,
                "status": "draft",
            },
            headers=_ADMIN,
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["patient_id"] == patient_id

    def test_create_claim_nonexistent_patient_returns_404(
        self, client: TestClient
    ) -> None:
        """Non-existent patient_id must return 404 before claim is written."""
        resp = client.post(
            "/api/v1/finance/claims",
            json={
                "patient_id": "00000000-0000-0000-0000-deadbeef0002",
                "patient_name": "Ghost Patient",
                "insurer": "AXA",
                "description": "Probe",
                "amount": 500.0,
                "status": "draft",
            },
            headers=_ADMIN,
        )
        assert resp.status_code == 404, (
            f"Expected 404 for non-existent patient_id, got {resp.status_code}: {resp.text}"
        )

    def test_create_claim_without_patient_id_still_works(
        self, client: TestClient
    ) -> None:
        """Claim without patient_id (anonymous / ad-hoc billing) is unaffected."""
        resp = client.post(
            "/api/v1/finance/claims",
            json={
                "patient_name": "Anonymous Claimant",
                "insurer": "Bupa",
                "description": "Pre-auth",
                "amount": 2000.0,
                "status": "draft",
            },
            headers=_ADMIN,
        )
        assert resp.status_code == 201, resp.text
