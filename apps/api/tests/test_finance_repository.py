"""Tests for app.repositories.finance — CRUD contracts (PR 77/N).

Covers:
- create_invoice returns row with auto-number INV-00001
- list_invoices returns rows for clinician
- list_invoices filtered by status
- get_invoice returns row / None for wrong clinician
- update_invoice modifies fields + recomputes vat/total
- delete_invoice returns True; second delete returns False
- mark_invoice_paid flips status to paid + creates payment
- create_payment links to invoice + updates invoice.paid
- list_payments returns rows for clinician
- create_claim returns row with auto-number INS-00001
- list_claims filtered by status
- delete_claim happy path
- finance_summary aggregates correctly
"""
from __future__ import annotations


CLINICIAN_ID = "actor-clinician-demo"


# ── Tests: Invoices ───────────────────────────────────────────────────────────


def test_create_invoice_happy_path():
    from app.database import SessionLocal
    from app.repositories.finance import create_invoice, get_invoice

    db = SessionLocal()
    try:
        inv = create_invoice(
            db,
            CLINICIAN_ID,
            patient_name="Alice Test",
            service="TMS Session",
            amount=100.0,
            vat_rate=0.20,
            issue_date="2026-05-01",
            due_date="2026-05-31",
            status="draft",
        )
        assert inv.invoice_number == "INV-00001"
        assert inv.amount == 100.0
        assert round(inv.vat, 2) == 20.0
        assert round(inv.total, 2) == 120.0
        assert inv.clinician_id == CLINICIAN_ID

        fetched = get_invoice(db, CLINICIAN_ID, inv.id)
        assert fetched is not None
        assert fetched.id == inv.id
    finally:
        db.close()


def test_get_invoice_returns_none_for_wrong_clinician():
    from app.database import SessionLocal
    from app.repositories.finance import create_invoice, get_invoice

    db = SessionLocal()
    try:
        inv = create_invoice(
            db,
            CLINICIAN_ID,
            patient_name="Bob",
            service="Consult",
            amount=50.0,
            issue_date="2026-05-01",
            due_date="2026-05-31",
        )

        result = get_invoice(db, "other-clinician", inv.id)
        assert result is None
    finally:
        db.close()


def test_list_invoices_returns_for_clinician():
    from app.database import SessionLocal
    from app.repositories.finance import create_invoice, list_invoices

    db = SessionLocal()
    try:
        for name in ("Patient A", "Patient B"):
            create_invoice(
                db,
                CLINICIAN_ID,
                patient_name=name,
                service="EEG",
                amount=200.0,
                issue_date="2026-05-01",
                due_date="2026-05-31",
            )

        rows = list_invoices(db, CLINICIAN_ID)
        assert len(rows) >= 2
        assert all(r.clinician_id == CLINICIAN_ID for r in rows)
    finally:
        db.close()


def test_list_invoices_filtered_by_status():
    from app.database import SessionLocal
    from app.repositories.finance import create_invoice, list_invoices

    db = SessionLocal()
    try:
        create_invoice(
            db,
            CLINICIAN_ID,
            patient_name="Status A",
            service="EEG",
            amount=150.0,
            issue_date="2026-05-01",
            due_date="2026-05-31",
            status="sent",
        )

        sent_rows = list_invoices(db, CLINICIAN_ID, status="sent")
        assert all(r.status == "sent" for r in sent_rows)
        assert len(sent_rows) >= 1
    finally:
        db.close()


def test_update_invoice_modifies_fields():
    from app.database import SessionLocal
    from app.repositories.finance import create_invoice, update_invoice

    db = SessionLocal()
    try:
        inv = create_invoice(
            db,
            CLINICIAN_ID,
            patient_name="Update Me",
            service="Consult",
            amount=100.0,
            issue_date="2026-05-01",
            due_date="2026-05-31",
            status="draft",
        )

        updated = update_invoice(
            db,
            CLINICIAN_ID,
            inv.id,
            status="sent",
            notes="Sent via email",
            amount=120.0,
        )
        assert updated is not None
        assert updated.status == "sent"
        assert updated.notes == "Sent via email"
        assert round(updated.amount, 2) == 120.0
        assert round(updated.total, 2) == 144.0  # 120 * 1.20
    finally:
        db.close()


def test_delete_invoice_returns_true_then_false():
    from app.database import SessionLocal
    from app.repositories.finance import create_invoice, delete_invoice

    db = SessionLocal()
    try:
        inv = create_invoice(
            db,
            CLINICIAN_ID,
            patient_name="Delete Me",
            service="Delete",
            amount=10.0,
            issue_date="2026-05-01",
            due_date="2026-05-31",
        )
        result1 = delete_invoice(db, CLINICIAN_ID, inv.id)
        assert result1 is True

        result2 = delete_invoice(db, CLINICIAN_ID, inv.id)
        assert result2 is False
    finally:
        db.close()


def test_mark_invoice_paid_flips_status():
    from app.database import SessionLocal
    from app.repositories.finance import create_invoice, list_payments, mark_invoice_paid

    db = SessionLocal()
    try:
        inv = create_invoice(
            db,
            CLINICIAN_ID,
            patient_name="Pay Now",
            service="TMS",
            amount=200.0,
            issue_date="2026-05-01",
            due_date="2026-05-31",
            status="sent",
        )

        result = mark_invoice_paid(
            db, CLINICIAN_ID, inv.id, method="card", reference="REF-001"
        )
        assert result is not None
        assert result.status == "paid"
        assert result.paid == result.total

        payments = list_payments(db, CLINICIAN_ID)
        assert any(p.invoice_id == inv.id for p in payments)
    finally:
        db.close()


# ── Tests: Payments ───────────────────────────────────────────────────────────


def test_create_payment_standalone():
    from app.database import SessionLocal
    from app.repositories.finance import create_payment, list_payments

    db = SessionLocal()
    try:
        payment = create_payment(
            db,
            CLINICIAN_ID,
            patient_name="Pay Standalone",
            amount=75.0,
            method="cash",
            payment_date="2026-05-09",
        )
        assert payment.amount == 75.0
        assert payment.method == "cash"

        payments = list_payments(db, CLINICIAN_ID)
        assert any(p.id == payment.id for p in payments)
    finally:
        db.close()


def test_create_payment_links_invoice_and_updates_paid():
    from app.database import SessionLocal
    from app.repositories.finance import create_invoice, create_payment, get_invoice

    db = SessionLocal()
    try:
        inv = create_invoice(
            db,
            CLINICIAN_ID,
            patient_name="Link Pay",
            service="Session",
            amount=300.0,
            issue_date="2026-05-01",
            due_date="2026-05-31",
            status="sent",
        )

        create_payment(
            db,
            CLINICIAN_ID,
            invoice_id=inv.id,
            patient_name="Link Pay",
            amount=150.0,
            method="card",
        )

        updated_inv = get_invoice(db, CLINICIAN_ID, inv.id)
        assert updated_inv is not None
        assert round(updated_inv.paid, 2) == 150.0
        assert updated_inv.status == "partial"
    finally:
        db.close()


# ── Tests: Insurance Claims ───────────────────────────────────────────────────


def test_create_claim_happy_path():
    from app.database import SessionLocal
    from app.repositories.finance import create_claim, get_claim

    db = SessionLocal()
    try:
        claim = create_claim(
            db,
            CLINICIAN_ID,
            patient_name="Claim Patient",
            insurer="BUPA",
            policy_number="POL-001",
            description="TMS Pre-auth",
            amount=500.0,
            status="draft",
        )
        assert claim.claim_number == "INS-00001"
        assert claim.insurer == "BUPA"
        assert claim.amount == 500.0

        fetched = get_claim(db, CLINICIAN_ID, claim.id)
        assert fetched is not None
    finally:
        db.close()


def test_list_claims_filtered_by_status():
    from app.database import SessionLocal
    from app.repositories.finance import create_claim, list_claims

    db = SessionLocal()
    try:
        create_claim(
            db,
            CLINICIAN_ID,
            patient_name="Submitted Pt",
            insurer="AXA",
            description="MRI Pre-auth",
            amount=300.0,
            status="submitted",
        )

        rows = list_claims(db, CLINICIAN_ID, status="submitted")
        assert all(r.status == "submitted" for r in rows)
        assert len(rows) >= 1
    finally:
        db.close()


def test_delete_claim_happy_path():
    from app.database import SessionLocal
    from app.repositories.finance import create_claim, delete_claim

    db = SessionLocal()
    try:
        claim = create_claim(
            db,
            CLINICIAN_ID,
            patient_name="Delete Claim",
            insurer="NHS",
            description="Routine",
            amount=100.0,
            status="draft",
        )

        result = delete_claim(db, CLINICIAN_ID, claim.id)
        assert result is True

        result2 = delete_claim(db, CLINICIAN_ID, claim.id)
        assert result2 is False
    finally:
        db.close()


def test_finance_summary_empty_clinician():
    """finance_summary for a clinician with no data returns zeroed aggregates."""
    from app.database import SessionLocal
    from app.repositories.finance import finance_summary

    db = SessionLocal()
    try:
        summary = finance_summary(db, "no-activity-clinician")
        assert summary["revenue_paid"] == 0.0
        assert summary["outstanding"] == 0.0
        assert summary["total_invoices"] == 0
        assert summary["claims_approved"] == 0
    finally:
        db.close()
