from __future__ import annotations

from datetime import timedelta

from feast import Field, FeatureView, StreamFeatureView
from feast.types import Float32, Int64, String

from .common import id_fields, patient, tenant


ehr_entities = [tenant, patient]

ehr_feature_view = FeatureView(
    name="ehr_features_v1",
    entities=["tenant_id", "patient_id"],
    ttl=timedelta(days=365 * 10),
    schema=[
        *id_fields(),
        Field(name="diagnosis_codes", dtype=String),  # serialized list placeholder
        Field(name="medication_codes", dtype=String),  # serialized list placeholder
        Field(name="num_active_meds", dtype=Int64),
        Field(name="bmi", dtype=Float32),
        Field(name="sbp_mmHg", dtype=Float32),
        Field(name="dbp_mmHg", dtype=Float32),
    ],
    online=True,
    source=None,
    tags={"group": "ehr", "version": "v1"},
)

ehr_stream_view = StreamFeatureView(
    name="ehr_stream_features_v1",
    entities=["tenant_id", "patient_id"],
    ttl=timedelta(days=365),
    schema=ehr_feature_view.schema,
    source=None,
    tags={"group": "ehr", "version": "v1", "mode": "stream"},
)

