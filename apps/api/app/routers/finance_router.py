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

from ..auth import AuthenticatedActor, get_authenticated_actor, require_patient_owner
from ..database import get_db_session
from ..errors import ApiServiceError
from ..persistence.models import InsuranceClaim, Invoice
from ..repositories import finance as finance_repo
from ..repositories.patients import resolve_patient_clinic_id


router = APIRouter(prefix="/api/v1/finance", tags=["finance"])

_FINANCE_READ_ROLES = frozenset(
    {
        "clinician",
        "admin",
        "clinic-admin",
        "supervisor",
        "reviewer",
        "technician",
    }
)
_FINANCE_WRITE_ROLES = frozenset({"admin", "clinic-admin"})


def _require_finance_read(actor: AuthenticatedActor) -> None:
    """Block guests, anonymous viewers, and patient accounts from finance APIs."""
    if actor.role in ("guest", "patient") or actor.role not in _FINANCE_READ_ROLES:
        raise HTTPException(
            status_code=403,
            detail="Finance endpoints require a clinical or administrator account.",
        )


def _require_finance_write(actor: AuthenticatedActor) -> None:
    """Mutations (invoice CRUD, payments, claims) are administrator-only."""
    _require_finance_read(actor)
    if actor.role not in _FINANCE_WRITE_ROLES:
        raise HTTPException(
            status_code=403,
            detail="Finance management requires an administrator or clinic administrator role.",
        )


def _gate_patient_access(actor: AuthenticatedActor, patient_id: str, db: Session) -> None:
    """Cross-clinic ownership gate.

    Resolves the patient's owning clinic via ``resolve_patient_clinic_id``
    and delegates to ``require_patient_owner``.  When the patient's owning
    clinician has no clinic_id (solo practitioner, not yet assigned to a
    clinic), falls back to checking ``actor.actor_id == patient.clinician_id``
    so that solo-clinician workflows are not broken.

    Raises 404 for non-existent patient_id.  Raises 403 on clinic mismatch.
    """
    exists, clinic_id = resolve_patient_clinic_id(db, patient_id)
    if not exists:
        raise ApiServiceError(code="not_found", message="Patient not found.", status_code=404)
    if clinic_id is not None:
        # Clinic-scoped check: delegate to canonical require_patient_owner.
        require_patient_owner(actor, clinic_id)
    else:
        # Orphaned / solo-practitioner patient: fall back to clinician_id ownership.
        if actor.role == "admin":
            return
        from ..persistence.models import Patient
        patient = db.query(Patient).filter_by(id=patient_id).first()
        if patient is None or patient.clinician_id != actor.actor_id:
            raise ApiServiceError(
                code="forbidden",
                message="You are not authorised to access this patient's data.",
                status_code=403,
            )


def _gate_finance_patient_access(actor: AuthenticatedActor, patient_id: str | None, db: Session) -> None:
    """Finance-specific patient ownership gate.

    Finance write routes must reject clinic-bound admins trying to mutate
    another clinic's patient billing records. Only a true platform admin
    (``role=admin`` with ``clinic_id is None``) may bypass the patient gate.
    """
    if not patient_id:
        return
    allow_platform_admin = actor.role == "admin" and actor.clinic_id is None
    exists, clinic_id = resolve_patient_clinic_id(db, patient_id)
    if not exists:
        raise ApiServiceError(code="not_found", message="Patient not found.", status_code=404)
    require_patient_owner(actor, clinic_id, allow_admin=allow_platform_admin)


def _require_invoice_write_scope(actor: AuthenticatedActor, invoice: Invoice | None, db: Session) -> Invoice:
    if invoice is None:
        raise HTTPException(status_code=404, detail="Invoice not found")
    _gate_finance_patient_access(actor, invoice.patient_id, db)
    return invoice


def _require_claim_write_scope(
    actor: AuthenticatedActor, claim: InsuranceClaim | None, db: Session
) -> InsuranceClaim:
    if claim is None:
        raise HTTPException(status_code=404, detail="Claim not found")
    _gate_finance_patient_access(actor, claim.patient_id, db)
    return claim


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
    _require_finance_read(actor)
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
    _require_finance_write(actor)
    _gate_finance_patient_access(actor, body.patient_id, session)
    invoice = finance_repo.create_invoice(
        session, actor.actor_id, **body.model_dump()
    )
    finance_repo.record_finance_audit(
        session,
        action="invoice:create",
        target_type="invoice",
        target_id=invoice.id,
        actor_id=actor.actor_id,
        actor_role=actor.role,
        clinic_id=actor.clinic_id,
        patient_id=invoice.patient_id,
        amount=invoice.total,
        currency=invoice.currency,
        snapshot={
            "invoice_number": invoice.invoice_number,
            "patient_name": invoice.patient_name,
            "service": invoice.service,
            "amount": float(invoice.amount or 0.0),
            "vat_rate": float(invoice.vat_rate or 0.0),
            "vat": float(invoice.vat or 0.0),
            "total": float(invoice.total or 0.0),
            "status": invoice.status,
            "currency": invoice.currency,
            "issue_date": invoice.issue_date,
            "due_date": invoice.due_date,
        },
    )
    return InvoiceOut.from_record(invoice)


@router.get("/invoices/{invoice_id}", response_model=InvoiceOut)
def get_invoice_endpoint(
    invoice_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> InvoiceOut:
    _require_finance_read(actor)
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
    _require_finance_write(actor)
    existing = _require_invoice_write_scope(
        actor, finance_repo.get_invoice(session, actor.actor_id, invoice_id), session
    )
    old_snapshot = {
        "patient_name": existing.patient_name,
        "service": existing.service,
        "amount": float(existing.amount or 0.0),
        "vat_rate": float(existing.vat_rate or 0.0),
        "vat": float(existing.vat or 0.0),
        "total": float(existing.total or 0.0),
        "paid": float(existing.paid or 0.0),
        "status": existing.status,
        "currency": existing.currency,
        "issue_date": existing.issue_date,
        "due_date": existing.due_date,
        "notes": existing.notes,
    }
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    target_patient_id = updates.get("patient_id", existing.patient_id)
    _gate_finance_patient_access(actor, target_patient_id, session)
    invoice = finance_repo.update_invoice(
        session, actor.actor_id, invoice_id, **updates
    )
    new_snapshot = {
        "patient_name": invoice.patient_name,
        "service": invoice.service,
        "amount": float(invoice.amount or 0.0),
        "vat_rate": float(invoice.vat_rate or 0.0),
        "vat": float(invoice.vat or 0.0),
        "total": float(invoice.total or 0.0),
        "paid": float(invoice.paid or 0.0),
        "status": invoice.status,
        "currency": invoice.currency,
        "issue_date": invoice.issue_date,
        "due_date": invoice.due_date,
        "notes": invoice.notes,
    }
    delta = {k: {"old": old_snapshot.get(k), "new": new_snapshot.get(k)}
             for k in old_snapshot if old_snapshot.get(k) != new_snapshot.get(k)}
    finance_repo.record_finance_audit(
        session,
        action="invoice:update",
        target_type="invoice",
        target_id=invoice.id,
        actor_id=actor.actor_id,
        actor_role=actor.role,
        clinic_id=actor.clinic_id,
        patient_id=invoice.patient_id,
        amount=invoice.total,
        currency=invoice.currency,
        snapshot=new_snapshot,
        delta=delta if delta else None,
    )
    return InvoiceOut.from_record(invoice)


@router.delete("/invoices/{invoice_id}", status_code=204)
def delete_invoice_endpoint(
    invoice_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> None:
    _require_finance_write(actor)
    invoice = _require_invoice_write_scope(
        actor, finance_repo.get_invoice(session, actor.actor_id, invoice_id), session
    )
    finance_repo.record_finance_audit(
        session,
        action="invoice:delete",
        target_type="invoice",
        target_id=invoice_id,
        actor_id=actor.actor_id,
        actor_role=actor.role,
        clinic_id=actor.clinic_id,
        patient_id=invoice.patient_id,
        amount=float(invoice.total or 0.0),
        currency=invoice.currency,
        snapshot={
            "invoice_number": invoice.invoice_number,
            "patient_name": invoice.patient_name,
            "service": invoice.service,
            "amount": float(invoice.amount or 0.0),
            "total": float(invoice.total or 0.0),
            "status": invoice.status,
        },
    )
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
    _require_finance_write(actor)
    invoice_before = _require_invoice_write_scope(
        actor, finance_repo.get_invoice(session, actor.actor_id, invoice_id), session
    )
    outstanding = max(0.0, round(float(invoice_before.total or 0.0) - float(invoice_before.paid or 0.0), 2))
    invoice = finance_repo.mark_invoice_paid(
        session,
        actor.actor_id,
        invoice_id,
        method=body.method,
        reference=body.reference,
    )
    if invoice is None:
        raise HTTPException(status_code=404, detail="Invoice not found")
    finance_repo.record_finance_audit(
        session,
        action="invoice:mark-paid",
        target_type="invoice",
        target_id=invoice.id,
        actor_id=actor.actor_id,
        actor_role=actor.role,
        clinic_id=actor.clinic_id,
        patient_id=invoice.patient_id,
        amount=outstanding,
        currency=invoice.currency,
        snapshot={
            "invoice_number": invoice.invoice_number,
            "paid": float(invoice.paid or 0.0),
            "total": float(invoice.total or 0.0),
            "status": invoice.status,
        },
        note=f"method={body.method}; ref={body.reference}",
    )
    return InvoiceOut.from_record(invoice)


# ── Payments ────────────────────────────────────────────────────────────────


@router.get("/payments", response_model=PaymentListResponse)
def list_payments_endpoint(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> PaymentListResponse:
    _require_finance_read(actor)
    rows = finance_repo.list_payments(session, actor.actor_id)
    return PaymentListResponse(items=[PaymentOut.from_record(r) for r in rows])


@router.post("/payments", response_model=PaymentOut, status_code=201)
def create_payment_endpoint(
    body: PaymentCreate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> PaymentOut:
    _require_finance_write(actor)
    payload = body.model_dump()
    invoice_id = payload.pop("invoice_id", None)
    if invoice_id:
        invoice = _require_invoice_write_scope(
            actor, finance_repo.get_invoice(session, actor.actor_id, invoice_id), session
        )
        payload.setdefault("patient_name", invoice.patient_name)
    payment = finance_repo.create_payment(
        session, actor.actor_id, invoice_id=invoice_id, **payload
    )
    finance_repo.record_finance_audit(
        session,
        action="payment:create",
        target_type="payment",
        target_id=payment.id,
        actor_id=actor.actor_id,
        actor_role=actor.role,
        clinic_id=actor.clinic_id,
        patient_id=invoice.patient_id if invoice else None,
        amount=float(payment.amount or 0.0),
        currency=invoice.currency if invoice else None,
        snapshot={
            "invoice_id": payment.invoice_id,
            "patient_name": payment.patient_name,
            "amount": float(payment.amount or 0.0),
            "method": payment.method,
            "reference": payment.reference,
            "payment_date": payment.payment_date,
        },
    )
    return PaymentOut.from_record(payment)


# ── Insurance Claims ────────────────────────────────────────────────────────


@router.get("/claims", response_model=ClaimListResponse)
def list_claims_endpoint(
    status: Optional[str] = Query(default=None),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> ClaimListResponse:
    _require_finance_read(actor)
    rows = finance_repo.list_claims(session, actor.actor_id, status=status)
    return ClaimListResponse(items=[ClaimOut.from_record(r) for r in rows])


@router.post("/claims", response_model=ClaimOut, status_code=201)
def create_claim_endpoint(
    body: ClaimCreate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> ClaimOut:
    _require_finance_write(actor)
    _gate_finance_patient_access(actor, body.patient_id, session)
    claim = finance_repo.create_claim(session, actor.actor_id, **body.model_dump())
    finance_repo.record_finance_audit(
        session,
        action="claim:create",
        target_type="claim",
        target_id=claim.id,
        actor_id=actor.actor_id,
        actor_role=actor.role,
        clinic_id=actor.clinic_id,
        patient_id=claim.patient_id,
        amount=claim.amount,
        snapshot={
            "claim_number": claim.claim_number,
            "patient_name": claim.patient_name,
            "insurer": claim.insurer,
            "policy_number": claim.policy_number,
            "description": claim.description,
            "amount": float(claim.amount or 0.0),
            "status": claim.status,
            "submitted_date": claim.submitted_date,
            "decision_date": claim.decision_date,
        },
    )
    return ClaimOut.from_record(claim)


@router.get("/claims/{claim_id}", response_model=ClaimOut)
def get_claim_endpoint(
    claim_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> ClaimOut:
    _require_finance_read(actor)
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
    _require_finance_write(actor)
    existing = _require_claim_write_scope(
        actor, finance_repo.get_claim(session, actor.actor_id, claim_id), session
    )
    old_snapshot = {
        "patient_name": existing.patient_name,
        "insurer": existing.insurer,
        "policy_number": existing.policy_number,
        "description": existing.description,
        "amount": float(existing.amount or 0.0),
        "status": existing.status,
        "submitted_date": existing.submitted_date,
        "decision_date": existing.decision_date,
        "notes": existing.notes,
    }
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    target_patient_id = updates.get("patient_id", existing.patient_id)
    _gate_finance_patient_access(actor, target_patient_id, session)
    claim = finance_repo.update_claim(session, actor.actor_id, claim_id, **updates)
    new_snapshot = {
        "patient_name": claim.patient_name,
        "insurer": claim.insurer,
        "policy_number": claim.policy_number,
        "description": claim.description,
        "amount": float(claim.amount or 0.0),
        "status": claim.status,
        "submitted_date": claim.submitted_date,
        "decision_date": claim.decision_date,
        "notes": claim.notes,
    }
    delta = {k: {"old": old_snapshot.get(k), "new": new_snapshot.get(k)}
             for k in old_snapshot if old_snapshot.get(k) != new_snapshot.get(k)}
    finance_repo.record_finance_audit(
        session,
        action="claim:update",
        target_type="claim",
        target_id=claim.id,
        actor_id=actor.actor_id,
        actor_role=actor.role,
        clinic_id=actor.clinic_id,
        patient_id=claim.patient_id,
        amount=claim.amount,
        snapshot=new_snapshot,
        delta=delta if delta else None,
    )
    return ClaimOut.from_record(claim)


@router.delete("/claims/{claim_id}", status_code=204)
def delete_claim_endpoint(
    claim_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> None:
    _require_finance_write(actor)
    claim = _require_claim_write_scope(
        actor, finance_repo.get_claim(session, actor.actor_id, claim_id), session
    )
    finance_repo.record_finance_audit(
        session,
        action="claim:delete",
        target_type="claim",
        target_id=claim_id,
        actor_id=actor.actor_id,
        actor_role=actor.role,
        clinic_id=actor.clinic_id,
        patient_id=claim.patient_id,
        amount=float(claim.amount or 0.0),
        snapshot={
            "claim_number": claim.claim_number,
            "patient_name": claim.patient_name,
            "insurer": claim.insurer,
            "description": claim.description,
            "amount": float(claim.amount or 0.0),
            "status": claim.status,
        },
    )
    ok = finance_repo.delete_claim(session, actor.actor_id, claim_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Claim not found")


# ── Summary / Analytics ─────────────────────────────────────────────────────


@router.get("/summary", response_model=SummaryResponse)
def finance_summary_endpoint(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> SummaryResponse:
    _require_finance_read(actor)
    data = finance_repo.finance_summary(session, actor.actor_id)
    return SummaryResponse(**data)


@router.get("/analytics/monthly", response_model=MonthlyRevenueResponse)
def finance_monthly_endpoint(
    months: int = Query(default=6, ge=1, le=36),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> MonthlyRevenueResponse:
    _require_finance_read(actor)
    rows = finance_repo.monthly_revenue(session, actor.actor_id, months=months)
    return MonthlyRevenueResponse(
        items=[MonthlyRevenueRow(**row) for row in rows]
    )
