from __future__ import annotations

from datetime import timedelta

from feast import Field, FeatureView, StreamFeatureView
from feast.types import Float32, String

from .common import id_fields, patient, tenant


mri_entities = [tenant, patient]

mri_feature_view = FeatureView(
    name="mri_features_v1",
    entities=["tenant_id", "patient_id"],
    ttl=timedelta(days=365 * 10),
    schema=[
        *id_fields(),
        Field(name="scan_id", dtype=String),
        Field(name="sequence", dtype=String),  # T1w/T2w/FLAIR/dMRI/etc
        Field(name="icv_ml", dtype=Float32),
        Field(name="hippocampus_vol_ml", dtype=Float32),
        Field(name="wmh_vol_ml", dtype=Float32),
    ],
    online=True,
    source=None,
    tags={"group": "mri", "version": "v1"},
)

mri_stream_view = StreamFeatureView(
    name="mri_stream_features_v1",
    entities=["tenant_id", "patient_id"],
    ttl=timedelta(days=365),
    schema=mri_feature_view.schema,
    source=None,
    tags={"group": "mri", "version": "v1", "mode": "stream"},
)

