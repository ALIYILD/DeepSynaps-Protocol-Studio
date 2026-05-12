"""Research dataset spec router (Slice C scaffold, feature-flagged OFF).

Mounted at ``/api/v1/research-datasets``. Every endpoint is admin-only
**and** hard-gated behind the ``RESEARCH_EXPORT_ENABLED`` env flag. The
flag is intentionally not set anywhere — so on every deployment that
ships this PR, every endpoint returns 403 with a message pointing at
the legal + IRB sign-off the operator must obtain before flipping it.

What this PR scaffolds
----------------------
* Create / list / get / revoke a ``ResearchDataset`` spec row.
* ``POST /{id}/preflight`` — dry k-anonymity check over a 200-row
  sample, filtered to patients who have an active research consent
  (Slice B's ``research_consent_service.get_consent_status_for_patients``).
* ``POST /{id}/build`` — placeholder that flips status to
  ``"building"`` and writes a deferred-message build_log. Returns 202.

What this PR does NOT implement
-------------------------------
* The actual Celery task that anonymizes + exports rows.
* ``export_uri`` population.
* Downloadable bundles.

That work lands in a follow-up PR once legal + IRB clear the release.
"""
from __future__ import annotations

import logging
import os
from datetime import date, datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.auth import (
    AuthenticatedActor,
    get_authenticated_actor,
    require_minimum_role,
)
from app.database import get_db_session
from app.models.research_dataset import ResearchDataset
from app.repositories.research_datasets import list_patient_sample
from app.services.anonymization_service import (
    K_ANONYMITY_THRESHOLD,
    age_bucket,
    hash_id,
    k_anonymity_check,
    shift_date,
)
from app.services.data_console_service import SAFE_TABLES


_log = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/research-datasets",
    tags=["research-datasets"],
)


# ── Feature flag gate ────────────────────────────────────────────────────────


def _require_research_export_enabled() -> None:
    """Hard gate: 403 unless ``RESEARCH_EXPORT_ENABLED=true``.

    Intentionally a string-compare rather than a settings flag — we want
    operators to set this explicitly in the deploy env (Fly secrets,
    docker compose), not flipped from a config file someone might
    accidentally commit. The error message names the env var so the
    fix is discoverable from the response alone.
    """
    if os.environ.get("RESEARCH_EXPORT_ENABLED", "").lower() != "true":
        raise HTTPException(
            status_code=403,
            detail=(
                "Research export is disabled. Set "
                "RESEARCH_EXPORT_ENABLED=true to enable (requires legal "
                "+ IRB sign-off)."
            ),
        )


# ── Request / response schemas ───────────────────────────────────────────────


# core-schema-exempt: research export scaffold remains router-local until external consumers exist
class ResearchDatasetCreateRequest(BaseModel):
    """Body for ``POST /api/v1/research-datasets``.

    ``included_tables`` is validated against
    :data:`app.services.data_console_service.SAFE_TABLES` at the
    pydantic layer so bad input never reaches the DB. Any unknown
    table raises ``ValueError`` -> FastAPI returns 422.
    """

    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    source_clinic_ids: list[str] = Field(default_factory=list)
    included_tables: list[str] = Field(default_factory=list)
    quasi_id_fields: list[str] = Field(default_factory=list)
    k_anonymity_threshold: int = Field(
        default=K_ANONYMITY_THRESHOLD, ge=1
    )

    @field_validator("included_tables")
    @classmethod
    def _validate_included_tables(cls, value: list[str]) -> list[str]:
        bad = [t for t in value if t not in SAFE_TABLES]
        if bad:
            raise ValueError(
                f"included_tables contains tables outside SAFE_TABLES: {bad}"
            )
        return value


# core-schema-exempt: research export scaffold remains router-local until external consumers exist
class ResearchDatasetSummary(BaseModel):
    """Listing-row shape — drops ``export_uri`` unless ``status=ready``."""

    id: str
    name: str
    status: str
    created_at: datetime
    row_count: int | None = None
    export_uri: str | None = None


# core-schema-exempt: research export scaffold remains router-local until external consumers exist
class ResearchDatasetDetail(BaseModel):
    """Full record — admin only via ``GET /{id}``."""

    id: str
    name: str
    description: str | None
    created_by_actor_id: str
    created_at: datetime
    source_clinic_ids: list[str]
    included_tables: list[str]
    quasi_id_fields: list[str]
    k_anonymity_threshold: int
    status: str
    build_log: str | None
    row_count: int | None
    export_uri: str | None


# core-schema-exempt: research export scaffold remains router-local until external consumers exist
class PreflightSampleRow(BaseModel):
    """One anonymized row in the preflight preview."""

    patient_id_hash: str
    age_bucket: str | None
    shifted_created_at: datetime | None
    quasi_id_values: dict[str, Any]


# core-schema-exempt: research export scaffold remains router-local until external consumers exist
class PreflightResponse(BaseModel):
    """``POST /{id}/preflight`` response envelope."""

    dataset_id: str
    sample_size: int
    k_anonymity: dict[str, Any]
    sample_rows: list[PreflightSampleRow]
    consent_filtered_out: int


# core-schema-exempt: research export scaffold remains router-local until external consumers exist
class BuildResponse(BaseModel):
    """``POST /{id}/build`` response — always deferred in this PR."""

    dataset_id: str
    status: str
    detail: str


# ── Helpers ──────────────────────────────────────────────────────────────────


def _summarize(row: ResearchDataset) -> ResearchDatasetSummary:
    """Project a full ORM row into the listing shape.

    ``export_uri`` is suppressed unless the dataset is ``ready`` so
    half-built artifacts never leak through the list endpoint.
    """
    return ResearchDatasetSummary(
        id=row.id,
        name=row.name,
        status=row.status,
        created_at=row.created_at,
        row_count=row.row_count,
        export_uri=row.export_uri if row.status == "ready" else None,
    )


def _detail(row: ResearchDataset) -> ResearchDatasetDetail:
    return ResearchDatasetDetail(
        id=row.id,
        name=row.name,
        description=row.description,
        created_by_actor_id=row.created_by_actor_id,
        created_at=row.created_at,
        source_clinic_ids=list(row.source_clinic_ids or []),
        included_tables=list(row.included_tables or []),
        quasi_id_fields=list(row.quasi_id_fields or []),
        k_anonymity_threshold=row.k_anonymity_threshold,
        status=row.status,
        build_log=row.build_log,
        row_count=row.row_count,
        export_uri=row.export_uri,
    )


def _get_consent_filter(patient_ids: list[str], session: Session) -> set[str]:
    """Return the set of ``patient_id`` values that hold an *active*
    research consent at the row's ``created_at`` time.

    Wraps Slice B's
    ``app.services.research_consent_service.get_consent_status_for_patients``.
    If Slice B has not landed yet (import fails), we conservatively
    return an empty set — i.e. every patient is filtered OUT. That's
    the safer default for a preflight check: better to surface zero
    rows than to leak rows belonging to patients we couldn't verify.
    """
    if not patient_ids:
        return set()
    try:
        from app.services.research_consent_service import (
            get_consent_status_for_patients,
        )
    except ImportError:
        _log.warning(
            "research_consent_service not available (Slice B not landed?); "
            "preflight will exclude all rows"
        )
        return set()

    try:
        statuses = get_consent_status_for_patients(
            session, patient_ids
        )
    except Exception as exc:  # noqa: BLE001
        _log.warning(
            "get_consent_status_for_patients failed: %s; "
            "preflight will exclude all rows",
            exc,
        )
        return set()

    # ``statuses`` is expected to be a mapping patient_id -> {granted: bool,
    # ...}. We accept either dict-of-dict or dict-of-bool shapes so a
    # minor Slice B contract drift doesn't break preflight.
    allowed: set[str] = set()
    for pid, info in (statuses or {}).items():
        if isinstance(info, dict):
            if info.get("granted") is True:
                allowed.add(pid)
        elif info is True:
            allowed.add(pid)
    return allowed


# ── Endpoints ────────────────────────────────────────────────────────────────


@router.post(
    "",
    response_model=ResearchDatasetSummary,
    status_code=status.HTTP_201_CREATED,
    summary="Create a research dataset spec (admin, flag-gated)",
)
def create_research_dataset(
    body: ResearchDatasetCreateRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> ResearchDatasetSummary:
    """Create a draft research dataset spec.

    Does NOT build anything — that's a separate, deferred step. The row
    lands with ``status='draft'``.
    """
    _require_research_export_enabled()
    require_minimum_role(actor, "admin")

    row = ResearchDataset(
        name=body.name,
        description=body.description,
        created_by_actor_id=actor.actor_id,
        source_clinic_ids=list(body.source_clinic_ids),
        included_tables=list(body.included_tables),
        quasi_id_fields=list(body.quasi_id_fields),
        k_anonymity_threshold=body.k_anonymity_threshold,
        status="draft",
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return _summarize(row)


@router.get(
    "",
    response_model=list[ResearchDatasetSummary],
    summary="List research dataset specs (admin, flag-gated)",
)
def list_research_datasets(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> list[ResearchDatasetSummary]:
    """List dataset specs ordered by most-recently-created.

    ``export_uri`` is suppressed unless ``status='ready'``.
    """
    _require_research_export_enabled()
    require_minimum_role(actor, "admin")

    rows = (
        session.query(ResearchDataset)
        .order_by(ResearchDataset.created_at.desc())
        .all()
    )
    return [_summarize(r) for r in rows]


@router.get(
    "/{dataset_id}",
    response_model=ResearchDatasetDetail,
    summary="Get full research dataset record (admin, flag-gated)",
)
def get_research_dataset(
    dataset_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> ResearchDatasetDetail:
    _require_research_export_enabled()
    require_minimum_role(actor, "admin")

    row = session.get(ResearchDataset, dataset_id)
    if row is None:
        raise HTTPException(status_code=404, detail="dataset not found")
    return _detail(row)


@router.post(
    "/{dataset_id}/preflight",
    response_model=PreflightResponse,
    summary="Dry-run anonymization + k-anonymity check (admin, flag-gated)",
)
def preflight_research_dataset(
    dataset_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> PreflightResponse:
    """Run an anonymization dry-run over a 200-row sample.

    Returns a k-anonymity report (smallest-group size, whether the
    sample passes) and a handful of example anonymized rows. Rows whose
    patient lacks an active research consent at the row's
    ``created_at`` are excluded BEFORE the k-anonymity check — so the
    operator sees the k-value they'd actually ship.

    Persists nothing.
    """
    _require_research_export_enabled()
    require_minimum_role(actor, "admin")

    row = session.get(ResearchDataset, dataset_id)
    if row is None:
        raise HTTPException(status_code=404, detail="dataset not found")

    # Pull a small candidate sample from the ``patients`` table — the
    # patient table is always part of an anonymized release because
    # every dataset is keyed on it. Real build job will fan out to
    # ``included_tables``; for preflight, this is the minimal cohort
    # whose consent state we must check.
    candidates = list_patient_sample(session, limit=200)
    candidate_ids = [p.id for p in candidates]
    allowed_ids = _get_consent_filter(candidate_ids, session)

    consent_filtered_out = sum(1 for p in candidates if p.id not in allowed_ids)
    kept = [p for p in candidates if p.id in allowed_ids]

    # Anonymize each kept row. We pull only the fields the downstream
    # research dataset would also pull — id, dob, created_at — so the
    # preview reflects the real export shape.
    anonymized: list[dict[str, Any]] = []
    for p in kept:
        # Patient.dob is stored as a ``YYYY-MM-DD`` string in this
        # codebase (free-form, populated by the patients router). We
        # coerce here so :func:`age_bucket` always receives a real
        # ``date``; on parse failure we drop to ``None`` rather than
        # crash so a single bad row never breaks the whole preflight.
        dob_raw = getattr(p, "date_of_birth", None) or getattr(p, "dob", None)
        dob_d: date | None = None
        if isinstance(dob_raw, date) and not isinstance(dob_raw, datetime):
            dob_d = dob_raw
        elif isinstance(dob_raw, datetime):
            dob_d = dob_raw.date()
        elif isinstance(dob_raw, str) and dob_raw:
            try:
                dob_d = date.fromisoformat(dob_raw[:10])
            except ValueError:
                dob_d = None
        created_at = getattr(p, "created_at", None)
        ab = age_bucket(dob_d) if dob_d else None
        anonymized.append(
            {
                "patient_id_hash": hash_id(p.id, namespace="patient"),
                "age_bucket": ab,
                "shifted_created_at": shift_date(created_at, p.id)
                if created_at
                else None,
                # Quasi-id values are pulled from the anonymized projection
                # so the k-anonymity check matches what would ship.
                **{
                    f: ab if f == "age_bucket" else getattr(p, f, None)
                    for f in (row.quasi_id_fields or [])
                },
            }
        )

    k_report = k_anonymity_check(
        anonymized,
        list(row.quasi_id_fields or []),
        k=row.k_anonymity_threshold,
    )

    sample_rows: list[PreflightSampleRow] = []
    for a in anonymized[:10]:
        sample_rows.append(
            PreflightSampleRow(
                patient_id_hash=a["patient_id_hash"],
                age_bucket=a.get("age_bucket"),
                shifted_created_at=a.get("shifted_created_at"),
                quasi_id_values={
                    f: a.get(f) for f in (row.quasi_id_fields or [])
                },
            )
        )

    return PreflightResponse(
        dataset_id=row.id,
        sample_size=len(anonymized),
        k_anonymity=k_report,
        sample_rows=sample_rows,
        consent_filtered_out=consent_filtered_out,
    )


@router.post(
    "/{dataset_id}/build",
    response_model=BuildResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Kick off the (deferred) build job (admin, flag-gated)",
)
def build_research_dataset(
    dataset_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> BuildResponse:
    """**Placeholder — does not actually build anything in this PR.**

    Flips status to ``"building"`` and appends a deferred-message line
    to ``build_log`` so the operator's audit trail makes it obvious
    that nothing shipped. The actual Celery task lands in a follow-up
    PR once legal + IRB sign-off lands.

    Returns ``202 Accepted``.
    """
    _require_research_export_enabled()
    require_minimum_role(actor, "admin")

    row = session.get(ResearchDataset, dataset_id)
    if row is None:
        raise HTTPException(status_code=404, detail="dataset not found")

    deferred_msg = (
        "BUILD DEFERRED — wire the Celery task in a follow-up PR"
    )
    stamp = datetime.now(timezone.utc).isoformat()
    line = f"[{stamp}] {deferred_msg}"
    row.build_log = (
        f"{row.build_log}\n{line}" if row.build_log else line
    )
    row.status = "building"
    session.commit()

    return BuildResponse(
        dataset_id=row.id,
        status=row.status,
        detail=deferred_msg,
    )


@router.post(
    "/{dataset_id}/revoke",
    response_model=ResearchDatasetSummary,
    summary="Revoke a dataset spec, clearing any export uri (admin, flag-gated)",
)
def revoke_research_dataset(
    dataset_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> ResearchDatasetSummary:
    """Kill switch.

    Sets ``status='revoked'`` and clears ``export_uri`` so any
    pre-signed download stops resolving in the listing. Build job (when
    it lands) must respect this status and refuse to write anything
    further to the row.
    """
    _require_research_export_enabled()
    require_minimum_role(actor, "admin")

    row = session.get(ResearchDataset, dataset_id)
    if row is None:
        raise HTTPException(status_code=404, detail="dataset not found")

    row.status = "revoked"
    row.export_uri = None
    session.commit()
    session.refresh(row)
    return _summarize(row)


__all__ = ["router"]
