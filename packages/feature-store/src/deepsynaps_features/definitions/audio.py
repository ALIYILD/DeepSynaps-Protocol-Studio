from __future__ import annotations

from datetime import timedelta

from feast import Field, FeatureView, StreamFeatureView
from feast.types import Float32, Int64, String

from .common import id_fields, patient, tenant


audio_entities = [tenant, patient]

audio_feature_view = FeatureView(
    name="audio_features_v1",
    entities=["tenant_id", "patient_id"],
    ttl=timedelta(days=365),
    schema=[
        *id_fields(),
        Field(name="utterance_id", dtype=String),
        Field(name="duration_s", dtype=Float32),
        Field(name="sample_rate_hz", dtype=Int64),
        Field(name="speech_rate_wpm", dtype=Float32),
        Field(name="pitch_mean_hz", dtype=Float32),
        Field(name="energy_mean", dtype=Float32),
    ],
    online=True,
    source=None,
    tags={"group": "audio", "version": "v1"},
)

audio_stream_view = StreamFeatureView(
    name="audio_stream_features_v1",
    entities=["tenant_id", "patient_id"],
    ttl=timedelta(days=30),
    schema=audio_feature_view.schema,
    source=None,
    tags={"group": "audio", "version": "v1", "mode": "stream"},
)

