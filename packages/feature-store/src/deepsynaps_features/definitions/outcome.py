from __future__ import annotations

from datetime import timedelta

from feast import Field, FeatureView, StreamFeatureView
from feast.types import Float32, Int64, String

from .common import id_fields, patient, tenant


outcome_entities = [tenant, patient]

outcome_feature_view = FeatureView(
    name="outcome_features_v1",
    entities=["tenant_id", "patient_id"],
    ttl=timedelta(days=365 * 10),
    schema=[
        *id_fields(),
        Field(name="target", dtype=String),  # outcome target name
        Field(name="label", dtype=Int64),  # classification label placeholder
        Field(name="score", dtype=Float32),  # regression/continuous placeholder
        Field(name="horizon_days", dtype=Int64),
    ],
    online=True,
    source=None,
    tags={"group": "outcome", "version": "v1"},
)

outcome_stream_view = StreamFeatureView(
    name="outcome_stream_features_v1",
    entities=["tenant_id", "patient_id"],
    ttl=timedelta(days=365),
    schema=outcome_feature_view.schema,
    source=None,
    tags={"group": "outcome", "version": "v1", "mode": "stream"},
)

