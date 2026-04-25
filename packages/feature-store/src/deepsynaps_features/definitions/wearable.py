from __future__ import annotations

from datetime import timedelta

from feast import Field, FeatureView, StreamFeatureView
from feast.types import Float32, Int64, String

from .common import id_fields, patient, tenant


wearable_entities = [tenant, patient]

wearable_feature_view = FeatureView(
    name="wearable_features_v1",
    entities=["tenant_id", "patient_id"],
    ttl=timedelta(days=90),
    schema=[
        *id_fields(),
        Field(name="device_id", dtype=String),
        Field(name="steps_24h", dtype=Int64),
        Field(name="sleep_minutes_24h", dtype=Int64),
        Field(name="resting_hr_bpm", dtype=Float32),
        Field(name="hrv_rmssd_ms", dtype=Float32),
        Field(name="activity_minutes_24h", dtype=Int64),
        Field(name="calories_kcal_24h", dtype=Float32),
        Field(name="spo2_pct", dtype=Float32),
    ],
    online=True,
    source=None,
    tags={"group": "wearable", "version": "v1"},
)

wearable_stream_view = StreamFeatureView(
    name="wearable_stream_features_v1",
    entities=["tenant_id", "patient_id"],
    ttl=timedelta(days=30),
    schema=wearable_feature_view.schema,
    source=None,
    tags={"group": "wearable", "version": "v1", "mode": "stream"},
)

