from __future__ import annotations

from fastapi import APIRouter, Depends

from app.auth import AuthenticatedActor, get_authenticated_actor
from app.qeeg.registry import list_analyses
from app.qeeg.schemas import AnalysesCatalogResponse

router = APIRouter(prefix="/api/v1/qeeg/analyses", tags=["qeeg-105"])


@router.get("", response_model=AnalysesCatalogResponse)
def get_qeeg_analyses_catalog(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> AnalysesCatalogResponse:
    # Read-only catalog. Audit for view/export is handled at the report surface.
    _ = actor  # reserved for future clinic scoping
    return AnalysesCatalogResponse(analyses=list_analyses())

