from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.database import get_db_session
from app.qeeg.audit import record_qeeg_105_audit_event
from app.qeeg.registry import list_analyses
from app.qeeg.schemas import AnalysesCatalogResponse

router = APIRouter(prefix="/api/v1/qeeg/analyses", tags=["qeeg-105"])


@router.get("", response_model=AnalysesCatalogResponse)
def get_qeeg_analyses_catalog(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AnalysesCatalogResponse:
    # Read-only catalog. Audit for view/export is handled at the report surface.
    require_minimum_role(actor, "clinician")
    analyses = list_analyses()
    try:
        record_qeeg_105_audit_event(
            db,
            actor=actor,
            event="catalog_view",
            target_id=actor.clinic_id or actor.actor_id,
            metadata={"count": len(analyses)},
        )
    except Exception:  # pragma: no cover
        pass
    return AnalysesCatalogResponse(analyses=analyses)

