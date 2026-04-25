from __future__ import annotations

from feast import Entity, Field
from feast.types import String, UnixTimestamp


# Shared identifiers for multi-tenant, per-patient features.
tenant = Entity(name="tenant_id", join_keys=["tenant_id"], description="Tenant/workspace identifier.")
patient = Entity(name="patient_id", join_keys=["patient_id"], description="Patient identifier scoped to tenant.")


# Common timestamp field name used across all FeatureViews/StreamFeatureViews.
occurred_at = Field(name="occurred_at", dtype=UnixTimestamp)


def id_fields() -> list[Field]:
    return [
        Field(name="tenant_id", dtype=String),
        Field(name="patient_id", dtype=String),
        occurred_at,
    ]

