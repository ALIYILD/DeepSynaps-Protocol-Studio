"""Clinical Finance Hub API.

Backs apps/web ``pgFinanceHub`` (Overview / Invoices / Payments / Insurance /
Analytics tabs). Replaces the legacy localStorage key ``ds_finance_v1`` with
DB-backed resources at ``/api/v1/finance/*``.

Conventions:
- Every endpoint is scoped by ``actor.actor_id`` (clinician_id). We never
  accept a clinician_id from the client and never leak one back.
- Collections return ``{"items": [...]}``. Single resources return the
  object directly.
- Pydantic models serialize DB rows; dates and YYYY-MM strings stay as-is.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..auth import AuthenticatedActor, get_authenticated_actor
from ..database import get_db_session
from ..repositories import finance as finance_repo


router = APIRouter(prefix="/api/v1/finance", tags=["finance"])


# ── Schemas ─────────────────────────────────────────────────────────────────


class InvoiceCreate(BaseModel):
    patient_id: Optional[str] = None
    patient_name: str
    service: str
    amount: float
    vat_rate: float = 0.20
    issue_date: str
    due_date: str
    status: str = "draft"
    currency: str = "GBP"
    notes: Optional[str] = None


class InvoiceUpdate(BaseModel):
    patient_id: Optional[str] = None
    patient_name: Optional[str] = None
    service: Optional[str] = None
    amount: Optional[float] = None
    vat_rate: Optional[float] = None
    issue_date: Optional[str] = None
    due_date: Optional[str] = None
    status: Optional[str] = None
    currency: Optional[str] = None
    notes: Optional[str] = None
    paid: Optional[float] = None


class MarkPaidRequest(BaseModel):
    method: str = "manual"
    reference: Optional[str] = None


class InvoiceOut(BaseModel):
    id: str
    invoice_number: str
    patient_id: Optional[str]
    patient_name: str
    service: str
    amount: float
    vat_rate: float
    vat: float
    total: float
    paid: float
    currency: str
    issue_date: str
    due_date: str
    status: str
    notes: Optional[str]
    created_at: str
    updated_at: str

    @classmethod
    def from_record(cls, r) -> "InvoiceOut":
        return cls(
            id=r.id,
            invoice_number=r.invoice_number,
            patient_id=r.patient_id,
            patient_name=r.patient_name,
            service=r.service,
            amount=float(r.amount or 0.0),
            vat_rate=float(r.vat_rate or 0.0),
            vat=float(r.vat or 0.0),
            total=float(r.total or 0.0),
            paid=float(r.paid or 0.0),
            currency=r.currency,
            issue_date=r.issue_date,
            due_date=r.due_date,
            status=r.status,
            notes=r.notes,
            created_at=r.created_at.isoformat(),
            updated_at=r.updated_at.isoformat(),
        )


class PaymentCreate(BaseModel):
    invoice_id: Optional[str] = None
    patient_name: str
    amount: float
    method: str = "card"
    reference: Optional[str] = None
    payment_date: str
    notes: Optional[str] = None


class PaymentOut(BaseModel):
    id: str
    invoice_id: Optional[str]
    patient_name: str
    amount: float
    method: str
    reference: Optional[str]
    payment_date: str
    notes: Optional[str]
    created_at: str

    @classmethod
    def from_record(cls, r) -> "PaymentOut":
        return cls(
            id=r.id,
            invoice_id=r.invoice_id,
            patient_name=r.patient_name,
            amount=float(r.amount or 0.0),
            method=r.method,
            reference=r.reference,
            payment_date=r.payment_date,
            notes=r.notes,
            created_at=r.created_at.isoformat(),
        )


class ClaimCreate(BaseModel):
    patient_id: Optional[str] = None
    patient_name: str
    insurer: str
    policy_number: Optional[str] = None
    description: str
    amount: float
    status: str = "draft"
    submitted_date: Optional[str] = None
    decision_date: Optional[str] = None
    notes: Optional[str] = None


class ClaimUpdate(BaseModel):
    patient_id: Optional[str] = None
    patient_name: Optional[str] = None
    insurer: Optional[str] = None
    policy_number: Optional[str] = None
    description: Optional[str] = None
    amount: Optional[float] = None
    status: Optional[str] = None
    submitted_date: Optional[str] = None
    decision_date: Optional[str] = None
    notes: Optional[str] = None


class ClaimOut(BaseModel):
    id: str
    claim_number: str
    patient_id: Optional[str]
    patient_name: str
    insurer: str
    policy_number: Optional[str]
    description: str
    amount: float
    status: str
    submitted_date: Optional[str]
    decision_date: Optional[str]
    notes: Optional[str]
    created_at: str
    updated_at: str

    @classmethod
    def from_record(cls, r) -> "ClaimOut":
        return cls(
            id=r.id,
            claim_number=r.claim_number,
            patient_id=r.patient_id,
            patient_name=r.patient_name,
            insurer=r.insurer,
            policy_number=r.policy_number,
            description=r.description,
            amount=float(r.amount or 0.0),
            status=r.status,
            submitted_date=r.submitted_date,
            decision_date=r.decision_date,
            notes=r.notes,
            created_at=r.created_at.isoformat(),
            updated_at=r.updated_at.isoformat(),
        )


class InvoiceListResponse(BaseModel):
    items: list[InvoiceOut]


class PaymentListResponse(BaseModel):
    items: list[PaymentOut]


class ClaimListResponse(BaseModel):
    items: list[ClaimOut]


class SummaryResponse(BaseModel):
    revenue_paid: float
    outstanding: float
    overdue: float
    total_invoices: int
    total_payments: int
    claims_approved: int
    claims_pending: int
    claims_value: float


class MonthlyRevenueRow(BaseModel):
    month: str
    revenue: float
    invoiced: float


class MonthlyRevenueResponse(BaseModel):
    items: list[MonthlyRevenueRow]


# ── Invoices ────────────────────────────────────────────────────────────────


@router.get("/invoices", response_model=InvoiceListResponse)
def list_invoices_endpoint(
    status: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> InvoiceListResponse:
    rows = finance_repo.list_invoices(
        session, actor.actor_id, status=status, search=search
    )
    return InvoiceListResponse(items=[InvoiceOut.from_record(r) for r in rows])


@router.post("/invoices", response_model=InvoiceOut, status_code=201)
def create_invoice_endpoint(
    body: InvoiceCreate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> InvoiceOut:
    invoice = finance_repo.create_invoice(
        session, actor.actor_id, **body.model_dump()
    )
    return InvoiceOut.from_record(invoice)


@router.get("/invoices/{invoice_id}", response_model=InvoiceOut)
def get_invoice_endpoint(
    invoice_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> InvoiceOut:
    invoice = finance_repo.get_invoice(session, actor.actor_id, invoice_id)
    if invoice is None:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return InvoiceOut.from_record(invoice)


@router.patch("/invoices/{invoice_id}", response_model=InvoiceOut)
def update_invoice_endpoint(
    invoice_id: str,
    body: InvoiceUpdate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> InvoiceOut:
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    invoice = finance_repo.update_invoice(
        session, actor.actor_id, invoice_id, **updates
    )
    if invoice is None:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return InvoiceOut.from_record(invoice)


@router.delete("/invoices/{invoice_id}", status_code=204)
def delete_invoice_endpoint(
    invoice_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> None:
    ok = finance_repo.delete_invoice(session, actor.actor_id, invoice_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Invoice not found")


@router.post("/invoices/{invoice_id}/mark-paid", response_model=InvoiceOut)
def mark_invoice_paid_endpoint(
    invoice_id: str,
    body: MarkPaidRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> InvoiceOut:
    invoice = finance_repo.mark_invoice_paid(
        session,
        actor.actor_id,
        invoice_id,
        method=body.method,
        reference=body.reference,
    )
    if invoice is None:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return InvoiceOut.from_record(invoice)


# ── Payments ────────────────────────────────────────────────────────────────


@router.get("/payments", response_model=PaymentListResponse)
def list_payments_endpoint(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> PaymentListResponse:
    rows = finance_repo.list_payments(session, actor.actor_id)
    return PaymentListResponse(items=[PaymentOut.from_record(r) for r in rows])


@router.post("/payments", response_model=PaymentOut, status_code=201)
def create_payment_endpoint(
    body: PaymentCreate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> PaymentOut:
    payload = body.model_dump()
    invoice_id = payload.pop("invoice_id", None)
    payment = finance_repo.create_payment(
        session, actor.actor_id, invoice_id=invoice_id, **payload
    )
    return PaymentOut.from_record(payment)


# ── Insurance Claims ────────────────────────────────────────────────────────


@router.get("/claims", response_model=ClaimListResponse)
def list_claims_endpoint(
    status: Optional[str] = Query(default=None),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> ClaimListResponse:
    rows = finance_repo.list_claims(session, actor.actor_id, status=status)
    return ClaimListResponse(items=[ClaimOut.from_record(r) for r in rows])


@router.post("/claims", response_model=ClaimOut, status_code=201)
def create_claim_endpoint(
    body: ClaimCreate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> ClaimOut:
    claim = finance_repo.create_claim(session, actor.actor_id, **body.model_dump())
    return ClaimOut.from_record(claim)


@router.get("/claims/{claim_id}", response_model=ClaimOut)
def get_claim_endpoint(
    claim_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> ClaimOut:
    claim = finance_repo.get_claim(session, actor.actor_id, claim_id)
    if claim is None:
        raise HTTPException(status_code=404, detail="Claim not found")
    return ClaimOut.from_record(claim)


@router.patch("/claims/{claim_id}", response_model=ClaimOut)
def update_claim_endpoint(
    claim_id: str,
    body: ClaimUpdate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> ClaimOut:
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    claim = finance_repo.update_claim(session, actor.actor_id, claim_id, **updates)
    if claim is None:
        raise HTTPException(status_code=404, detail="Claim not found")
    return ClaimOut.from_record(claim)


@router.delete("/claims/{claim_id}", status_code=204)
def delete_claim_endpoint(
    claim_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> None:
    ok = finance_repo.delete_claim(session, actor.actor_id, claim_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Claim not found")


# ── Summary / Analytics ─────────────────────────────────────────────────────


@router.get("/summary", response_model=SummaryResponse)
def finance_summary_endpoint(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> SummaryResponse:
    data = finance_repo.finance_summary(session, actor.actor_id)
    return SummaryResponse(**data)


@router.get("/analytics/monthly", response_model=MonthlyRevenueResponse)
def finance_monthly_endpoint(
    months: int = Query(default=6, ge=1, le=36),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> MonthlyRevenueResponse:
    rows = finance_repo.monthly_revenue(session, actor.actor_id, months=months)
    return MonthlyRevenueResponse(
        items=[MonthlyRevenueRow(**row) for row in rows]
    )
