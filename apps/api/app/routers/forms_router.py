"""Forms & Assessments router.

Endpoints
---------
GET  /api/v1/forms                     — list all form definitions for clinic
POST /api/v1/forms                     — create new form definition
GET  /api/v1/forms/{form_id}           — get form with questions
POST /api/v1/forms/{form_id}/deploy    — deploy form to patient(s)
POST /api/v1/forms/{form_id}/submit    — patient submits completed form
GET  /api/v1/forms/submissions         — list submissions (clinician view)
GET  /api/v1/forms/submissions/{id}    — get one submission with scoring
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import (
    AuthenticatedActor,
    get_authenticated_actor,
    require_minimum_role,
    require_patient_owner,
)
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import FormDefinition, FormSubmission
from app.repositories.patients import resolve_patient_clinic_id


def _gate_patient_access(
    actor: AuthenticatedActor, patient_id: str | None, db: Session
) -> None:
    """Cross-clinic ownership gate. Same shape as the rest of the codebase."""
    if not patient_id:
        return
    exists, clinic_id = resolve_patient_clinic_id(db, patient_id)
    if exists:
        require_patient_owner(actor, clinic_id)


router = APIRouter(prefix="/api/v1/forms", tags=["Forms & Assessments"])


# ── Schemas ────────────────────────────────────────────────────────────────────

class FormCreate(BaseModel):
    title: str
    description: Optional[str] = None
    form_type: str = "custom"       # custom, intake, outcome, screening
    questions: list[dict] = []
    scoring: Optional[dict] = None
    status: str = "draft"           # draft, active, archived


class FormUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    form_type: Optional[str] = None
    questions: Optional[list[dict]] = None
    scoring: Optional[dict] = None
    status: Optional[str] = None


class FormOut(BaseModel):
    id: str
    clinician_id: str
    title: str
    description: Optional[str]
    form_type: str
    questions: list[dict]
    scoring: Optional[dict]
    status: str
    created_at: str
    updated_at: str

    @classmethod
    def from_record(cls, r: FormDefinition) -> "FormOut":
        questions: list[dict] = []
        scoring: Optional[dict] = None
        try:
            questions = json.loads(r.questions_json or "[]")
        except Exception:
            pass
        if r.scoring_json:
            try:
                scoring = json.loads(r.scoring_json)
            except Exception:
                pass
        return cls(
            id=r.id,
            clinician_id=r.clinician_id,
            title=r.title,
            description=r.description,
            form_type=r.form_type,
            questions=questions,
            scoring=scoring,
            status=r.status,
            created_at=r.created_at.isoformat(),
            updated_at=r.updated_at.isoformat(),
        )


class FormListResponse(BaseModel):
    items: list[FormOut]
    total: int


class FormDeployRequest(BaseModel):
    # Cap at 200 patients per deploy. Each id triggers a DB lookup via
    # _gate_patient_access; without a cap a clinician (or attacker with a
    # leaked token) could fan out a single request into thousands of
    # cross-clinic ownership probes.
    patient_ids: list[str] = Field(..., max_length=200)
    message: Optional[str] = None


class FormDeployResponse(BaseModel):
    form_id: str
    deployed_to: list[str]
    message: Optional[str]


class FormSubmitRequest(BaseModel):
    patient_id: str
    responses: dict[str, Any] = {}


class FormSubmissionOut(BaseModel):
    id: str
    form_id: str
    patient_id: str
    clinician_id: str
    responses: dict[str, Any]
    score: Optional[str]
    score_numeric: Optional[float]
    scoring_details: Optional[dict]
    status: str
    submitted_at: str
    created_at: str

    @classmethod
    def from_record(cls, r: FormSubmission) -> "FormSubmissionOut":
        responses: dict = {}
        scoring_details: Optional[dict] = None
        try:
            responses = json.loads(r.responses_json or "{}")
        except Exception:
            pass
        if r.scoring_details_json:
            try:
                scoring_details = json.loads(r.scoring_details_json)
            except Exception:
                pass
        def _dt(v) -> Optional[str]:
            if v is None:
                return None
            return v.isoformat() if isinstance(v, datetime) else str(v)
        return cls(
            id=r.id,
            form_id=r.form_id,
            patient_id=r.patient_id,
            clinician_id=r.clinician_id,
            responses=responses,
            score=r.score,
            score_numeric=r.score_numeric,
            scoring_details=scoring_details,
            status=r.status,
            submitted_at=_dt(r.submitted_at),
            created_at=_dt(r.created_at),
        )


class FormSubmissionListResponse(BaseModel):
    items: list[FormSubmissionOut]
    total: int


# ── Helpers ────────────────────────────────────────────────────────────────────

def _get_form_or_404(db: Session, form_id: str, actor: AuthenticatedActor) -> FormDefinition:
    form = db.query(FormDefinition).filter_by(id=form_id).first()
    if form is None:
        raise ApiServiceError(code="not_found", message="Form not found.", status_code=404)
    if actor.role != "admin" and form.clinician_id != actor.actor_id:
        raise ApiServiceError(code="not_found", message="Form not found.", status_code=404)
    return form


def _apply_scoring(form: FormDefinition, responses: dict) -> tuple[Optional[str], Optional[float], Optional[dict]]:
    """Very simple numeric scoring: sum all integer responses if scoring rules exist."""
    if not form.scoring_json:
        return None, None, None
    try:
        rules = json.loads(form.scoring_json)
        total = 0.0
        details: dict = {}
        for key, val in responses.items():
            if isinstance(val, (int, float)):
                total += float(val)
                details[key] = float(val)
        label = None
        ranges = rules.get("ranges", [])
        for r in ranges:
            if r.get("min", 0) <= total <= r.get("max", 999):
                label = r.get("label")
                break
        return label or str(total), total, details
    except Exception:
        return None, None, None


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/submissions", response_model=FormSubmissionListResponse)
def list_submissions(
    form_id: Optional[str] = Query(default=None),
    patient_id: Optional[str] = Query(default=None),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> FormSubmissionListResponse:
    require_minimum_role(actor, "clinician")
    q = db.query(FormSubmission)
    if actor.role != "admin":
        q = q.filter(FormSubmission.clinician_id == actor.actor_id)
    if form_id:
        q = q.filter(FormSubmission.form_id == form_id)
    if patient_id:
        q = q.filter(FormSubmission.patient_id == patient_id)
    records = q.order_by(FormSubmission.submitted_at.desc()).all()
    items = [FormSubmissionOut.from_record(r) for r in records]
    return FormSubmissionListResponse(items=items, total=len(items))


@router.get("/submissions/{submission_id}", response_model=FormSubmissionOut)
def get_submission(
    submission_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> FormSubmissionOut:
    require_minimum_role(actor, "clinician")
    sub = db.query(FormSubmission).filter_by(id=submission_id).first()
    if sub is None:
        raise ApiServiceError(code="not_found", message="Submission not found.", status_code=404)
    if actor.role != "admin" and sub.clinician_id != actor.actor_id:
        raise ApiServiceError(code="not_found", message="Submission not found.", status_code=404)
    return FormSubmissionOut.from_record(sub)


@router.get("", response_model=FormListResponse)
def list_forms(
    form_type: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> FormListResponse:
    require_minimum_role(actor, "clinician")
    q = db.query(FormDefinition)
    if actor.role != "admin":
        q = q.filter(FormDefinition.clinician_id == actor.actor_id)
    if form_type:
        q = q.filter(FormDefinition.form_type == form_type)
    if status:
        q = q.filter(FormDefinition.status == status)
    records = q.order_by(FormDefinition.created_at.desc()).all()
    items = [FormOut.from_record(r) for r in records]
    return FormListResponse(items=items, total=len(items))


@router.post("", response_model=FormOut, status_code=201)
def create_form(
    body: FormCreate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> FormOut:
    require_minimum_role(actor, "clinician")
    form = FormDefinition(
        clinician_id=actor.actor_id,
        title=body.title.strip(),
        description=body.description,
        form_type=body.form_type,
        questions_json=json.dumps(body.questions),
        scoring_json=json.dumps(body.scoring) if body.scoring else None,
        status=body.status,
    )
    db.add(form)
    db.commit()
    db.refresh(form)
    return FormOut.from_record(form)


@router.get("/{form_id}", response_model=FormOut)
def get_form(
    form_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> FormOut:
    require_minimum_role(actor, "clinician")
    form = _get_form_or_404(db, form_id, actor)
    return FormOut.from_record(form)


@router.post("/{form_id}/deploy", response_model=FormDeployResponse, status_code=200)
def deploy_form(
    form_id: str,
    body: FormDeployRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> FormDeployResponse:
    """Mark the form as active and associate it with target patients (business logic placeholder)."""
    require_minimum_role(actor, "clinician")
    form = _get_form_or_404(db, form_id, actor)
    # FK-stuffing guard: deploying to a list of patient_ids must verify each
    # belongs to the actor's clinic — otherwise a clinician could broadcast
    # a form across clinic boundaries.
    for pid in (body.patient_ids or []):
        _gate_patient_access(actor, pid, db)
    if form.status == "draft":
        form.status = "active"
        db.commit()
    return FormDeployResponse(
        form_id=form_id,
        deployed_to=body.patient_ids,
        message=body.message,
    )


@router.post("/{form_id}/submit", response_model=FormSubmissionOut, status_code=201)
def submit_form(
    form_id: str,
    body: FormSubmitRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> FormSubmissionOut:
    require_minimum_role(actor, "clinician")
    form = _get_form_or_404(db, form_id, actor)
    _gate_patient_access(actor, body.patient_id, db)
    score_label, score_numeric, scoring_details = _apply_scoring(form, body.responses)
    sub = FormSubmission(
        form_id=form_id,
        patient_id=body.patient_id,
        clinician_id=actor.actor_id,
        responses_json=json.dumps(body.responses),
        score=score_label,
        score_numeric=score_numeric,
        scoring_details_json=json.dumps(scoring_details) if scoring_details else None,
        status="scored" if score_label else "submitted",
        submitted_at=datetime.now(timezone.utc),
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return FormSubmissionOut.from_record(sub)
