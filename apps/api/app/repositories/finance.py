"""Repository for Clinical Finance Hub.

Module-level functions (matching the style of ``repositories/patients.py``)
that encapsulate all DB work for invoices, patient payments, and insurance
claims. The router layer stays thin and focuses on auth + serialization.

Key behaviours:
- Invoice numbers auto-increment per clinician (``INV-00001``, ``INV-00002`` ...).
- Claim numbers auto-increment per clinician (``INS-00001`` ...).
- Creating a ``PatientPayment`` linked to an invoice increments ``invoice.paid``
  and flips the invoice status to ``partial`` or ``paid`` as appropriate.
- ``finance_summary`` / ``monthly_revenue`` power the Analytics tab.
"""
from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.persistence.models import InsuranceClaim, Invoice, PatientPayment


# ── Internal helpers ─────────────────────────────────────────────────────────


def _round2(v: float) -> float:
    return round(float(v), 2)


def _compute_totals(amount: float, vat_rate: float) -> tuple[float, float]:
    vat = _round2(float(amount) * float(vat_rate))
    total = _round2(float(amount) + vat)
    return vat, total


def _next_invoice_number(session: Session, clinician_id: str) -> str:
    # Pull the max numeric suffix for this clinician's invoice numbers.
    # Using a Python-side max keeps the logic portable across SQLite/Postgres.
    rows = session.scalars(
        select(Invoice.invoice_number).where(Invoice.clinician_id == clinician_id)
    ).all()
    highest = 0
    for num in rows:
        if not num:
            continue
        tail = num.rsplit("-", 1)[-1]
        try:
            highest = max(highest, int(tail))
        except ValueError:
            continue
    return f"INV-{highest + 1:05d}"


def _next_claim_number(session: Session, clinician_id: str) -> str:
    rows = session.scalars(
        select(InsuranceClaim.claim_number).where(
            InsuranceClaim.clinician_id == clinician_id
        )
    ).all()
    highest = 0
    for num in rows:
        if not num:
            continue
        tail = num.rsplit("-", 1)[-1]
        try:
            highest = max(highest, int(tail))
        except ValueError:
            continue
    return f"INS-{highest + 1:05d}"


def _refresh_invoice_status_from_paid(invoice: Invoice) -> None:
    """Flip status based on paid vs total, but only for non-terminal states."""
    if invoice.status in ("void", "draft"):
        return
    if invoice.paid >= invoice.total - 0.009:  # tolerate float dust
        invoice.status = "paid"
    elif invoice.paid > 0:
        invoice.status = "partial"


# ── Invoices ─────────────────────────────────────────────────────────────────


def list_invoices(
    session: Session,
    clinician_id: str,
    status: Optional[str] = None,
    search: Optional[str] = None,
) -> list[Invoice]:
    stmt = select(Invoice).where(Invoice.clinician_id == clinician_id)
    if status:
        stmt = stmt.where(Invoice.status == status)
    if search:
        term = f"%{search.strip()}%"
        stmt = stmt.where(
            (Invoice.patient_name.ilike(term))
            | (Invoice.invoice_number.ilike(term))
            | (Invoice.service.ilike(term))
        )
    stmt = stmt.order_by(Invoice.issue_date.desc(), Invoice.created_at.desc())
    return list(session.scalars(stmt).all())


def get_invoice(
    session: Session, clinician_id: str, invoice_id: str
) -> Optional[Invoice]:
    return session.scalar(
        select(Invoice).where(
            Invoice.id == invoice_id, Invoice.clinician_id == clinician_id
        )
    )


def create_invoice(session: Session, clinician_id: str, **fields) -> Invoice:
    amount = float(fields.get("amount") or 0.0)
    vat_rate = float(fields.get("vat_rate", 0.20))
    vat, total = _compute_totals(amount, vat_rate)

    invoice = Invoice(
        clinician_id=clinician_id,
        invoice_number=_next_invoice_number(session, clinician_id),
        patient_id=fields.get("patient_id"),
        patient_name=fields.get("patient_name", ""),
        service=fields.get("service", ""),
        amount=amount,
        vat_rate=vat_rate,
        vat=vat,
        total=total,
        paid=float(fields.get("paid") or 0.0),
        currency=fields.get("currency", "GBP"),
        issue_date=fields.get("issue_date"),
        due_date=fields.get("due_date"),
        status=fields.get("status", "draft"),
        notes=fields.get("notes"),
    )
    session.add(invoice)
    session.commit()
    session.refresh(invoice)
    return invoice


def update_invoice(
    session: Session, clinician_id: str, invoice_id: str, **fields
) -> Optional[Invoice]:
    invoice = get_invoice(session, clinician_id, invoice_id)
    if invoice is None:
        return None

    # Never let the client reassign clinician_id / invoice_number / computed cols.
    for protected in ("clinician_id", "invoice_number", "vat", "total", "id"):
        fields.pop(protected, None)

    amount_changed = "amount" in fields
    vat_rate_changed = "vat_rate" in fields

    for key, value in fields.items():
        if value is None:
            # Skip None so PATCH-style partial updates don't wipe columns unless
            # the caller explicitly sends null — which we treat as "no change".
            continue
        if hasattr(invoice, key):
            setattr(invoice, key, value)

    if amount_changed or vat_rate_changed:
        invoice.vat, invoice.total = _compute_totals(
            float(invoice.amount or 0.0), float(invoice.vat_rate or 0.0)
        )
        _refresh_invoice_status_from_paid(invoice)

    session.commit()
    session.refresh(invoice)
    return invoice


def delete_invoice(session: Session, clinician_id: str, invoice_id: str) -> bool:
    invoice = get_invoice(session, clinician_id, invoice_id)
    if invoice is None:
        return False
    session.delete(invoice)
    session.commit()
    return True


def mark_invoice_paid(
    session: Session,
    clinician_id: str,
    invoice_id: str,
    method: str = "manual",
    reference: Optional[str] = None,
) -> Optional[Invoice]:
    """Fully pay an invoice and record a matching PatientPayment atomically."""
    invoice = get_invoice(session, clinician_id, invoice_id)
    if invoice is None:
        return None

    today = date.today().isoformat()
    outstanding = max(0.0, _round2(float(invoice.total) - float(invoice.paid)))

    invoice.paid = float(invoice.total)
    invoice.status = "paid"

    if outstanding > 0:
        payment = PatientPayment(
            clinician_id=clinician_id,
            invoice_id=invoice.id,
            patient_name=invoice.patient_name,
            amount=outstanding,
            method=method or "manual",
            reference=reference,
            payment_date=today,
        )
        session.add(payment)

    session.commit()
    session.refresh(invoice)
    return invoice


# ── Payments ─────────────────────────────────────────────────────────────────


def list_payments(session: Session, clinician_id: str) -> list[PatientPayment]:
    return list(
        session.scalars(
            select(PatientPayment)
            .where(PatientPayment.clinician_id == clinician_id)
            .order_by(PatientPayment.payment_date.desc(), PatientPayment.created_at.desc())
        ).all()
    )


def create_payment(
    session: Session,
    clinician_id: str,
    invoice_id: Optional[str] = None,
    **fields,
) -> PatientPayment:
    amount = float(fields.get("amount") or 0.0)
    invoice: Optional[Invoice] = None
    if invoice_id:
        invoice = get_invoice(session, clinician_id, invoice_id)
        # If the invoice doesn't belong to this clinician we silently drop the
        # link rather than raise — the router validates before calling us, and
        # this keeps the repo function forgiving for internal callers.
        if invoice is None:
            invoice_id = None

    payment = PatientPayment(
        clinician_id=clinician_id,
        invoice_id=invoice_id,
        patient_name=fields.get("patient_name", invoice.patient_name if invoice else ""),
        amount=amount,
        method=fields.get("method", "card"),
        reference=fields.get("reference"),
        payment_date=fields.get("payment_date") or date.today().isoformat(),
        notes=fields.get("notes"),
    )
    session.add(payment)

    if invoice is not None:
        invoice.paid = _round2(float(invoice.paid or 0.0) + amount)
        if invoice.status not in ("void", "draft"):
            if invoice.paid >= invoice.total - 0.009:
                invoice.status = "paid"
            elif invoice.paid > 0:
                invoice.status = "partial"
        else:
            # Even for a draft, if it got paid in full, flip to paid so
            # the UI doesn't show an already-paid draft.
            if invoice.paid >= invoice.total - 0.009 and invoice.status == "draft":
                invoice.status = "paid"

    session.commit()
    session.refresh(payment)
    return payment


# ── Insurance Claims ─────────────────────────────────────────────────────────


def list_claims(
    session: Session, clinician_id: str, status: Optional[str] = None
) -> list[InsuranceClaim]:
    stmt = select(InsuranceClaim).where(InsuranceClaim.clinician_id == clinician_id)
    if status:
        stmt = stmt.where(InsuranceClaim.status == status)
    stmt = stmt.order_by(InsuranceClaim.created_at.desc())
    return list(session.scalars(stmt).all())


def get_claim(
    session: Session, clinician_id: str, claim_id: str
) -> Optional[InsuranceClaim]:
    return session.scalar(
        select(InsuranceClaim).where(
            InsuranceClaim.id == claim_id,
            InsuranceClaim.clinician_id == clinician_id,
        )
    )


def create_claim(session: Session, clinician_id: str, **fields) -> InsuranceClaim:
    status = fields.get("status", "draft")
    today = datetime.now(timezone.utc).date().isoformat()
    submitted_date = fields.get("submitted_date")
    if submitted_date is None and status in ("submitted", "pending", "approved", "rejected", "paid"):
        submitted_date = today
    claim = InsuranceClaim(
        clinician_id=clinician_id,
        claim_number=_next_claim_number(session, clinician_id),
        patient_id=fields.get("patient_id"),
        patient_name=fields.get("patient_name", ""),
        insurer=fields.get("insurer", ""),
        policy_number=fields.get("policy_number"),
        description=fields.get("description", ""),
        amount=float(fields.get("amount") or 0.0),
        status=status,
        submitted_date=submitted_date,
        decision_date=fields.get("decision_date"),
        notes=fields.get("notes"),
    )
    session.add(claim)
    session.commit()
    session.refresh(claim)
    return claim


def update_claim(
    session: Session, clinician_id: str, claim_id: str, **fields
) -> Optional[InsuranceClaim]:
    claim = get_claim(session, clinician_id, claim_id)
    if claim is None:
        return None

    for protected in ("clinician_id", "claim_number", "id"):
        fields.pop(protected, None)

    for key, value in fields.items():
        if value is None:
            continue
        if hasattr(claim, key):
            setattr(claim, key, value)

    # Convenience: auto-stamp lifecycle dates when status transitions and the
    # caller didn't set them explicitly.
    if "status" in fields:
        today = date.today().isoformat()
        if claim.status == "submitted" and not claim.submitted_date:
            claim.submitted_date = today
        if claim.status in ("approved", "rejected", "paid") and not claim.decision_date:
            claim.decision_date = today

    session.commit()
    session.refresh(claim)
    return claim


def delete_claim(session: Session, clinician_id: str, claim_id: str) -> bool:
    claim = get_claim(session, clinician_id, claim_id)
    if claim is None:
        return False
    session.delete(claim)
    session.commit()
    return True


# ── Summaries / Analytics ────────────────────────────────────────────────────


def finance_summary(session: Session, clinician_id: str) -> dict:
    today = date.today().isoformat()

    # Invoice aggregates
    invoices = list(
        session.scalars(
            select(Invoice).where(Invoice.clinician_id == clinician_id)
        ).all()
    )

    total_invoices = len(invoices)
    revenue_paid = 0.0  # actual money received (sum of paid across all invoices)
    outstanding = 0.0  # total - paid for non-void, non-paid-in-full invoices
    overdue = 0.0  # outstanding balance for invoices past due date in sent/partial

    for inv in invoices:
        revenue_paid += float(inv.paid or 0.0)
        if inv.status == "void":
            continue
        bal = float(inv.total or 0.0) - float(inv.paid or 0.0)
        if bal > 0:
            outstanding += bal
            if inv.due_date and inv.due_date < today and inv.status in ("sent", "partial"):
                overdue += bal

    revenue_paid = _round2(revenue_paid)
    outstanding = _round2(outstanding)
    overdue = _round2(overdue)

    # Payment aggregates
    total_payments = session.scalar(
        select(func.count(PatientPayment.id)).where(
            PatientPayment.clinician_id == clinician_id
        )
    ) or 0

    # Claim aggregates
    claims = list(
        session.scalars(
            select(InsuranceClaim).where(InsuranceClaim.clinician_id == clinician_id)
        ).all()
    )
    claims_approved = 0
    claims_pending = 0
    claims_value = 0.0
    for c in claims:
        claims_value += float(c.amount or 0.0)
        if c.status in ("approved", "paid"):
            claims_approved += 1
        elif c.status in ("submitted", "pending"):
            claims_pending += 1

    return {
        "revenue_paid": revenue_paid,
        "outstanding": outstanding,
        "overdue": overdue,
        "total_invoices": total_invoices,
        "total_payments": int(total_payments),
        "claims_approved": claims_approved,
        "claims_pending": claims_pending,
        "claims_value": _round2(claims_value),
    }


def monthly_revenue(
    session: Session, clinician_id: str, months: int = 6
) -> list[dict]:
    """Return ``{month, revenue, invoiced}`` rows for the last N months."""
    months = max(1, min(int(months), 36))

    today = date.today()
    # Build an ordered list of month buckets from oldest to newest.
    buckets: list[str] = []
    y, m = today.year, today.month
    rolling: list[tuple[int, int]] = []
    for _ in range(months):
        rolling.append((y, m))
        m -= 1
        if m == 0:
            m = 12
            y -= 1
    rolling.reverse()
    buckets = [f"{yy:04d}-{mm:02d}" for (yy, mm) in rolling]

    earliest = buckets[0] + "-01"

    invoices = list(
        session.scalars(
            select(Invoice).where(
                Invoice.clinician_id == clinician_id,
                Invoice.issue_date >= earliest,
            )
        ).all()
    )

    # Initialize map with all buckets so the UI can draw a continuous axis.
    result: dict[str, dict] = {b: {"month": b, "revenue": 0.0, "invoiced": 0.0} for b in buckets}

    for inv in invoices:
        if not inv.issue_date or len(inv.issue_date) < 7:
            continue
        bucket = inv.issue_date[:7]
        if bucket not in result:
            continue
        result[bucket]["invoiced"] = _round2(result[bucket]["invoiced"] + float(inv.total or 0.0))
        if inv.status == "paid":
            result[bucket]["revenue"] = _round2(
                result[bucket]["revenue"] + float(inv.paid or inv.total or 0.0)
            )
        else:
            # Count partial payments toward revenue for their share of the month.
            result[bucket]["revenue"] = _round2(
                result[bucket]["revenue"] + float(inv.paid or 0.0)
            )

    return [result[b] for b in buckets]
