from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, Optional

from redis import Redis

from .contracts import FeatureEnvelope, FeatureSetName, utc_now
from .streaming.keys import redis_key


def _redis_url() -> str:
    return os.getenv("DEEPSYNAPS_FEATURES_REDIS_URL", os.getenv("REDIS_URL", "redis://localhost:6379/0"))


def _get_redis() -> Redis:
    return Redis.from_url(_redis_url(), decode_responses=True)

FEATURE_SET_VERSION = os.getenv("DEEPSYNAPS_FEATURE_SET_VERSION", "2026-04-25")

FEATURE_SETS: dict[str, tuple[str, ...]] = {
    # Canonical sets from the Layer 2 spec (see deepsynaps_brain_twin_kit/docs/FEATURE_STORE.md).
    "core": ("assessment", "therapy", "wearable"),
    "qeeg": ("qeeg",),
    "imaging": ("mri",),
    "virtual_care": ("video", "audio"),
    "ehr": ("ehr",),
    "outcomes": ("outcome",),
    "full": ("qeeg", "wearable", "assessment", "therapy", "mri", "video", "audio", "ehr", "outcome"),
    # App-specific named sets (Layer 3–4 call sites).
    "qeeg_recommend_protocol_v1": ("qeeg", "assessment", "therapy", "wearable"),
}


def _groups_for(feature_set: str) -> Iterable[str]:
    if feature_set in FEATURE_SETS:
        return FEATURE_SETS[feature_set]
    # Backward-compat: allow passing a group name directly.
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
    groups_meta: Dict[str, Any] = {}
    now = datetime.now(timezone.utc)

    for group in _groups_for(feature_set):
        key = redis_key(tenant_id, patient_id, group)
        raw_map = r.hgetall(key)
        group_features: Dict[str, Any] = {}
        meta: Dict[str, Any] = {}

        for k, v in raw_map.items():
            if k.startswith("__meta:"):
                meta[k.replace("__meta:", "", 1)] = v
                continue
            # best-effort decode of JSON scalar/list/dict; fallback to string
            try:
                group_features[k] = json.loads(v)
            except Exception:
                group_features[k] = v

        features_out[group] = group_features
        dt = _parse_dt(meta.get("max_occurred_at"))
        if dt is not None:
            meta["staleness_s"] = max(0.0, (now - dt).total_seconds())
        groups_meta[group] = meta

        if dt and (occurred_at_max is None or dt > occurred_at_max):
            occurred_at_max = dt

    envelope = FeatureEnvelope(
        tenant_id=tenant_id,
        patient_id=patient_id,
        feature_set=feature_set,
        feature_set_version=FEATURE_SET_VERSION,
        generated_at=utc_now(),
        occurred_at=occurred_at_max,
        features=features_out,
        metadata={"redis_url": _redis_url(), "groups": groups_meta},
    )
    return envelope.model_dump()

