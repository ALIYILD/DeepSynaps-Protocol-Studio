from __future__ import annotations

from datetime import timedelta

from feast import Field, FeatureView, StreamFeatureView
from feast.types import Float32, Int64, String

from .common import id_fields, patient, tenant


qeeg_entities = [tenant, patient]

# Batch features (offline / historical)
qeeg_feature_view = FeatureView(
    name="qeeg_features_v1",
    entities=["tenant_id", "patient_id"],
    ttl=timedelta(days=365),
    schema=[
        *id_fields(),
        Field(name="session_id", dtype=String),
        Field(name="recording_duration_s", dtype=Int64),
        Field(name="alpha_power", dtype=Float32),
        Field(name="beta_power", dtype=Float32),
        Field(name="theta_power", dtype=Float32),
        Field(name="delta_power", dtype=Float32),
        Field(name="alpha_peak_hz", dtype=Float32),
        Field(name="band_power_ratio_ab", dtype=Float32),
        Field(name="artifact_pct", dtype=Float32),
    ],
    online=True,
    source=None,  # wired in the Feast repo layer (feature_repo/)
    tags={"group": "qeeg", "version": "v1"},
)


# Streaming features (Kafka -> online store)
qeeg_stream_view = StreamFeatureView(
    name="qeeg_stream_features_v1",
    entities=["tenant_id", "patient_id"],
    ttl=timedelta(days=30),
    schema=qeeg_feature_view.schema,
    source=None,  # wired in the Feast repo layer (feature_repo/)
    tags={"group": "qeeg", "version": "v1", "mode": "stream"},
)

