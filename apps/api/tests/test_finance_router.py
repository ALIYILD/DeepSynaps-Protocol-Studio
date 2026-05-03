"""Finance router — invoices, payments, claims, summary, monthly analytics.

The Finance Hub replaced the legacy localStorage key ``ds_finance_v1`` with
DB-backed resources at ``/api/v1/finance/*``. These tests are the contract
verification for the go-live of the Finance Hub surface:

- Every endpoint is scoped to the authenticated clinician (no leakage).
- Invoice totals and VAT are computed server-side and honest.
- Summary / monthly endpoints reflect real DB state (no fake balances).
- Claim lifecycle (create → submit → approve) returns real statuses.
- Honest empty states (never synthesised totals when the DB is empty).
"""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.repositories import finance as finance_repo


def _clinician(auth_headers: dict) -> dict:
    return auth_headers["clinician"]


def _admin(auth_headers: dict) -> dict:
    return auth_headers["admin"]


def _patient(auth_headers: dict) -> dict:
    return auth_headers["patient"]


def _create_invoice(
    client: TestClient,
    headers: dict,
    **overrides,
) -> dict:
    body = {
        "patient_name": "Alex Reid",
        "service": "TMS Course - 30 sessions",
        "amount": 100.0,
        "vat_rate": 0.20,
        "issue_date": "2026-03-15",
        "due_date": "2026-04-15",
        "status": "sent",
        "currency": "GBP",
    }
    body.update(overrides)
    resp = client.post("/api/v1/finance/invoices", json=body, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


def _seed_invoice_as_clinician(clinician_actor_id: str = "actor-clinician-demo", **overrides) -> None:
    """Insert a clinician-scoped invoice directly (clinicians cannot POST invoices)."""
    body = {
        "patient_name": "Scoped Patient",
        "service": "TMS Course",
        "amount": 100.0,
        "vat_rate": 0.20,
        "issue_date": "2026-03-15",
        "due_date": "2026-04-15",
        "status": "sent",
        "currency": "GBP",
    }
    body.update(overrides)
    db = SessionLocal()
    try:
        finance_repo.create_invoice(db, clinician_actor_id, **body)
    finally:
        db.close()


class TestFinanceEmptyState:
    """Honest empty states — never synthesise totals from nothing."""

    def test_list_invoices_empty(self, client: TestClient, auth_headers: dict) -> None:
        resp = client.get("/api/v1/finance/invoices", headers=_clinician(auth_headers))
        assert resp.status_code == 200
        assert resp.json() == {"items": []}

    def test_list_payments_empty(self, client: TestClient, auth_headers: dict) -> None:
        resp = client.get("/api/v1/finance/payments", headers=_clinician(auth_headers))
        assert resp.status_code == 200
        assert resp.json() == {"items": []}

    def test_list_claims_empty(self, client: TestClient, auth_headers: dict) -> None:
        resp = client.get("/api/v1/finance/claims", headers=_clinician(auth_headers))
        assert resp.status_code == 200
        assert resp.json() == {"items": []}

    def test_summary_zero(self, client: TestClient, auth_headers: dict) -> None:
        resp = client.get("/api/v1/finance/summary", headers=_clinician(auth_headers))
        assert resp.status_code == 200
        data = resp.json()
        assert data["revenue_paid"] == 0
        assert data["outstanding"] == 0
        assert data["overdue"] == 0
        assert data["total_invoices"] == 0
        assert data["total_payments"] == 0
        assert data["claims_approved"] == 0
        assert data["claims_pending"] == 0
        assert data["claims_value"] == 0

    def test_monthly_zero(self, client: TestClient, auth_headers: dict) -> None:
        resp = client.get(
            "/api/v1/finance/analytics/monthly?months=6",
            headers=_clinician(auth_headers),
        )
        assert resp.status_code == 200
        items = resp.json()["items"]
        assert len(items) == 6
        for row in items:
            assert row["revenue"] == 0
            assert row["invoiced"] == 0


class TestInvoiceLifecycle:
    def test_create_invoice_computes_totals(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        inv = _create_invoice(client, _admin(auth_headers), amount=100.0, vat_rate=0.20)
        assert inv["amount"] == 100.0
        assert inv["vat"] == 20.0
        assert inv["total"] == 120.0
        assert inv["paid"] == 0.0
        assert inv["status"] == "sent"
        assert inv["invoice_number"].startswith("INV-")
        assert inv["currency"] == "GBP"

    def test_mark_paid_increments_revenue_and_payments(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        inv = _create_invoice(client, _admin(auth_headers))
        iid = inv["id"]

        resp = client.post(
            f"/api/v1/finance/invoices/{iid}/mark-paid",
            json={"method": "manual"},
            headers=_admin(auth_headers),
        )
        assert resp.status_code == 200
        paid = resp.json()
        assert paid["status"] == "paid"
        assert paid["paid"] == paid["total"]

        # The invoice auto-generated a payment for the outstanding balance.
        payments = client.get(
            "/api/v1/finance/payments", headers=_admin(auth_headers)
        ).json()["items"]
        assert len(payments) == 1
        assert payments[0]["amount"] == 120.0
        assert payments[0]["invoice_id"] == iid
        assert payments[0]["method"] == "manual"

        # Summary reflects real paid revenue.
        summary = client.get(
            "/api/v1/finance/summary", headers=_admin(auth_headers)
        ).json()
        assert summary["revenue_paid"] == 120.0
        assert summary["outstanding"] == 0.0
        assert summary["total_payments"] == 1

    def test_partial_payment_updates_status_and_outstanding(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        inv = _create_invoice(client, _admin(auth_headers))
        iid = inv["id"]
        resp = client.post(
            "/api/v1/finance/payments",
            json={
                "invoice_id": iid,
                "patient_name": "Alex Reid",
                "amount": 30.0,
                "method": "card",
                "payment_date": "2026-03-20",
            },
            headers=_admin(auth_headers),
        )
        assert resp.status_code == 201

        summary = client.get(
            "/api/v1/finance/summary", headers=_admin(auth_headers)
        ).json()
        assert summary["revenue_paid"] == 30.0
        assert summary["outstanding"] == 90.0

        refreshed = client.get(
            f"/api/v1/finance/invoices/{iid}", headers=_admin(auth_headers)
        ).json()
        assert refreshed["status"] == "partial"
        assert refreshed["paid"] == 30.0

    def test_overdue_invoice_counted(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # Issue date and due date both in the past
        _create_invoice(
            client,
            _admin(auth_headers),
            issue_date="2020-01-01",
            due_date="2020-02-01",
            status="sent",
        )
        summary = client.get(
            "/api/v1/finance/summary", headers=_admin(auth_headers)
        ).json()
        assert summary["outstanding"] == 120.0
        assert summary["overdue"] == 120.0


class TestClaimLifecycle:
    def test_create_claim_real_status(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        body = {
            "patient_name": "Marcus Chen",
            "insurer": "BUPA",
            "policy_number": "POL-884",
            "description": "TMS pre-auth",
            "amount": 2500.0,
            "status": "submitted",
        }
        resp = client.post(
            "/api/v1/finance/claims", json=body, headers=_admin(auth_headers)
        )
        assert resp.status_code == 201
        claim = resp.json()
        assert claim["status"] == "submitted"
        assert claim["claim_number"].startswith("INS-")
        # Status transitioned to submitted → submitted_date auto-stamped.
        assert claim["submitted_date"] is not None

    def test_claim_status_update_reflects_in_summary(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        body = {
            "patient_name": "Sofia Navarro",
            "insurer": "AXA",
            "description": "Neurofeedback review",
            "amount": 1800.0,
            "status": "pending",
        }
        resp = client.post(
            "/api/v1/finance/claims", json=body, headers=_admin(auth_headers)
        )
        assert resp.status_code == 201
        claim_id = resp.json()["id"]

        summary = client.get(
            "/api/v1/finance/summary", headers=_admin(auth_headers)
        ).json()
        assert summary["claims_pending"] == 1
        assert summary["claims_approved"] == 0

        resp = client.patch(
            f"/api/v1/finance/claims/{claim_id}",
            json={"status": "approved"},
            headers=_admin(auth_headers),
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "approved"
        assert resp.json()["decision_date"] is not None

        summary = client.get(
            "/api/v1/finance/summary", headers=_admin(auth_headers)
        ).json()
        assert summary["claims_pending"] == 0
        assert summary["claims_approved"] == 1


class TestScopeIsolation:
    """Finance rows are scoped per authenticated actor (clinician_id); no cross-leak."""

    def test_invoice_scope_isolation(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # Clinician-owned invoice; admin (different actor_id) must not see it.
        _seed_invoice_as_clinician(patient_name="Private Patient")

        admin_list = client.get(
            "/api/v1/finance/invoices", headers=_admin(auth_headers)
        ).json()["items"]
        assert admin_list == []

    def test_clinician_cannot_create_invoice(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        body = {
            "patient_name": "No Create",
            "service": "Test",
            "amount": 10.0,
            "vat_rate": 0.20,
            "issue_date": "2026-03-15",
            "due_date": "2026-04-15",
            "status": "draft",
            "currency": "GBP",
        }
        resp = client.post(
            "/api/v1/finance/invoices", json=body, headers=_clinician(auth_headers)
        )
        assert resp.status_code == 403

    def test_patient_denied_finance_read(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        resp = client.get("/api/v1/finance/summary", headers=_patient(auth_headers))
        assert resp.status_code == 403

    def test_admin_cannot_fetch_clinician_invoice_by_id(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        _seed_invoice_as_clinician()
        clin_list = client.get(
            "/api/v1/finance/invoices", headers=_clinician(auth_headers)
        ).json()["items"]
        assert len(clin_list) >= 1
        iid = clin_list[0]["id"]
        resp = client.get(
            f"/api/v1/finance/invoices/{iid}", headers=_admin(auth_headers)
        )
        assert resp.status_code == 404


class TestRouteAndSchemaShape:
    """Protect wire contract the UI depends on (hook → API → backend)."""

    def test_summary_shape(self, client: TestClient, auth_headers: dict) -> None:
        resp = client.get("/api/v1/finance/summary", headers=_clinician(auth_headers))
        data = resp.json()
        for key in (
            "revenue_paid",
            "outstanding",
            "overdue",
            "total_invoices",
            "total_payments",
            "claims_approved",
            "claims_pending",
            "claims_value",
        ):
            assert key in data, f"summary missing `{key}`"

    def test_list_response_envelope(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # UI expects { items: [...] } from list endpoints.
        for path in ("invoices", "payments", "claims"):
            resp = client.get(
                f"/api/v1/finance/{path}", headers=_clinician(auth_headers)
            )
            assert resp.status_code == 200
            assert "items" in resp.json()
            assert isinstance(resp.json()["items"], list)

    def test_anonymous_denied_finance_list(self, client: TestClient, auth_headers: dict) -> None:
        _seed_invoice_as_clinician(patient_name="Scoped")
        resp = client.get("/api/v1/finance/invoices")
        assert resp.status_code == 403
