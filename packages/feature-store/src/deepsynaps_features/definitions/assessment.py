from __future__ import annotations

from datetime import timedelta

from feast import Field, FeatureView, StreamFeatureView
from feast.types import Float32, Int64, String

from .common import id_fields, patient, tenant


assessment_entities = [tenant, patient]

assessment_feature_view = FeatureView(
    name="assessment_features_v1",
    entities=["tenant_id", "patient_id"],
    ttl=timedelta(days=365 * 5),
    schema=[
        *id_fields(),
        Field(name="instrument", dtype=String),  # e.g. PHQ-9, GAD-7, PCL-5
        Field(name="raw_score", dtype=Int64),
        Field(name="severity_level", dtype=String),
        Field(name="normed_score", dtype=Float32),
        Field(name="completion_time_s", dtype=Int64),
        Field(name="is_clinician_administered", dtype=Int64),
    ],
    online=True,
    source=None,
    tags={"group": "assessment", "version": "v1"},
)

assessment_stream_view = StreamFeatureView(
    name="assessment_stream_features_v1",
    entities=["tenant_id", "patient_id"],
    ttl=timedelta(days=365),
    schema=assessment_feature_view.schema,
    source=None,
    tags={"group": "assessment", "version": "v1", "mode": "stream"},
)

