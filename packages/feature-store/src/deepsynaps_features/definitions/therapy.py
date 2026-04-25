from __future__ import annotations

from datetime import timedelta

from feast import Field, FeatureView, StreamFeatureView
from feast.types import Float32, Int64, String

from .common import id_fields, patient, tenant


therapy_entities = [tenant, patient]

therapy_feature_view = FeatureView(
    name="therapy_features_v1",
    entities=["tenant_id", "patient_id"],
    ttl=timedelta(days=365 * 5),
    schema=[
        *id_fields(),
        Field(name="protocol_id", dtype=String),
        Field(name="session_number", dtype=Int64),
        Field(name="session_duration_min", dtype=Float32),
        Field(name="adherence_pct", dtype=Float32),
        Field(name="side_effects_present", dtype=Int64),
        Field(name="self_reported_relief", dtype=Float32),
        Field(name="notes_len", dtype=Int64),
    ],
    online=True,
    source=None,
    tags={"group": "therapy", "version": "v1"},
)

therapy_stream_view = StreamFeatureView(
    name="therapy_stream_features_v1",
    entities=["tenant_id", "patient_id"],
    ttl=timedelta(days=365),
    schema=therapy_feature_view.schema,
    source=None,
    tags={"group": "therapy", "version": "v1", "mode": "stream"},
)

