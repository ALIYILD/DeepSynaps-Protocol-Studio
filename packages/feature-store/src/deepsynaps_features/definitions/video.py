from __future__ import annotations

from datetime import timedelta

from feast import Field, FeatureView, StreamFeatureView
from feast.types import Float32, Int64, String

from .common import id_fields, patient, tenant


video_entities = [tenant, patient]

video_feature_view = FeatureView(
    name="video_features_v1",
    entities=["tenant_id", "patient_id"],
    ttl=timedelta(days=365),
    schema=[
        *id_fields(),
        Field(name="clip_id", dtype=String),
        Field(name="duration_s", dtype=Float32),
        Field(name="fps", dtype=Float32),
        Field(name="num_faces_detected", dtype=Int64),
        Field(name="affect_valence", dtype=Float32),
        Field(name="affect_arousal", dtype=Float32),
    ],
    online=True,
    source=None,
    tags={"group": "video", "version": "v1"},
)

video_stream_view = StreamFeatureView(
    name="video_stream_features_v1",
    entities=["tenant_id", "patient_id"],
    ttl=timedelta(days=30),
    schema=video_feature_view.schema,
    source=None,
    tags={"group": "video", "version": "v1", "mode": "stream"},
)

