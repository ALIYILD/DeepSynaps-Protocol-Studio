from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.services.feature_store_client import build_feature_store_client
from app.settings import get_settings


router = APIRouter(prefix="/api/v1/feature-store", tags=["feature-store"])


class FeatureStoreFetchResponse(BaseModel):
    tenant_id: str
    patient_id: str
    feature_set: str
    features: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)


@router.get("/patients/{patient_id}/features", response_model=FeatureStoreFetchResponse)
def fetch_patient_features_endpoint(
    patient_id: str,
    feature_set: str = Query(default="full", min_length=1),
    tenant_id: Optional[str] = Query(default=None, min_length=1),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> FeatureStoreFetchResponse:
    """
    HTTP façade over Layer 2 fetch_patient_features.

    - Requires clinician role (v1 safety default).
    - Tenant scoping is explicit. If tenant_id is omitted, falls back to the API's
      configured default tenant_id for demo/dev workflows.
    - Returns features plus an opaque metadata blob intended for model output lineage.
    """

    require_minimum_role(actor, "clinician")
    settings = get_settings()
    scoped_tenant_id = tenant_id or settings.feature_store_default_tenant_id

    client = build_feature_store_client(settings)
    result = client.fetch_patient_features(
        tenant_id=scoped_tenant_id,
        patient_id=patient_id,
        feature_set=feature_set,
    )

    return FeatureStoreFetchResponse(
        tenant_id=scoped_tenant_id,
        patient_id=patient_id,
        feature_set=feature_set,
        features=result.features,
        metadata=result.metadata,
    )

