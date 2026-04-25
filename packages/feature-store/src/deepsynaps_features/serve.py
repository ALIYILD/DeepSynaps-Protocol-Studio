from __future__ import annotations

import json
import os
from datetime import datetime
from typing import Any, Dict, Iterable, Optional

from redis import Redis

from .contracts import FeatureEnvelope, FeatureSetName, utc_now
from .streaming.workers import redis_key


def _redis_url() -> str:
    return os.getenv("DEEPSYNAPS_FEATURES_REDIS_URL", os.getenv("REDIS_URL", "redis://localhost:6379/0"))


def _get_redis() -> Redis:
    return Redis.from_url(_redis_url(), decode_responses=True)


def _groups_for(feature_set: str) -> Iterable[str]:
    if feature_set == "full":
        return ("qeeg", "wearable", "assessment", "therapy", "mri", "video", "audio", "ehr", "outcome")
    return (feature_set,)


def _parse_dt(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s)
    except Exception:
        return None


def fetch_patient_features(tenant_id: str, patient_id: str, feature_set: FeatureSetName = "full") -> Dict[str, Any]:
    """
    Fetch latest per-group online features for a tenant+patient from Redis.

    Returns a metadata envelope with `features` and provenance fields.
    """

    r = _get_redis()
    features_out: Dict[str, Any] = {}
    occurred_at_max: Optional[datetime] = None

    for group in _groups_for(feature_set):
        key = redis_key(tenant_id, patient_id, group)
        blob = r.hget(key, "features")
        occurred_at_s = r.hget(key, "occurred_at")
        if blob:
            try:
                features_out[group] = json.loads(blob)
            except Exception:
                features_out[group] = {"_raw": blob}
        dt = _parse_dt(occurred_at_s)
        if dt and (occurred_at_max is None or dt > occurred_at_max):
            occurred_at_max = dt

    envelope = FeatureEnvelope(
        tenant_id=tenant_id,
        patient_id=patient_id,
        feature_set=feature_set,
        generated_at=utc_now(),
        occurred_at=occurred_at_max,
        features=features_out,
        metadata={"redis_url": _redis_url()},
    )
    return envelope.model_dump()

