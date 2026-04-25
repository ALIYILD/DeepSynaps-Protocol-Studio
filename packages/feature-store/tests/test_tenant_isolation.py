from __future__ import annotations

import json

from deepsynaps_features.serve import fetch_patient_features
from deepsynaps_features.streaming.keys import redis_key


class _FakeRedis:
    def __init__(self) -> None:
        self._h: dict[str, dict[str, str]] = {}

    def hset(self, key: str, mapping: dict[str, str]) -> None:
        self._h.setdefault(key, {}).update(mapping)

    def hgetall(self, key: str) -> dict[str, str]:
        return dict(self._h.get(key, {}))


def test_tenant_isolation_keys_do_not_collide(monkeypatch) -> None:
    """
    Smoke test outline: the same patient_id in different tenants must not collide.
    """

    r = _FakeRedis()

    # Seed two tenants with same patient_id but different feature blobs.
    k1 = redis_key("tenant_a", "patient_1", "qeeg")
    k2 = redis_key("tenant_b", "patient_1", "qeeg")
    assert k1 != k2

    r.hset(
        k1,
        {
            "alpha_power": "1.0",
            "__meta:max_occurred_at": "2026-01-01T00:00:00+00:00",
            "__meta:materialized_at": "2026-01-01T00:00:01+00:00",
            "__meta:transform_version": "qeeg@v1",
            "__meta:source_event_schema": "deepsynaps.qeeg.features.v1",
        },
    )
    r.hset(
        k2,
        {
            "alpha_power": "2.0",
            "__meta:max_occurred_at": "2026-01-01T00:00:00+00:00",
            "__meta:materialized_at": "2026-01-01T00:00:01+00:00",
            "__meta:transform_version": "qeeg@v1",
            "__meta:source_event_schema": "deepsynaps.qeeg.features.v1",
        },
    )

    monkeypatch.setattr("deepsynaps_features.serve._get_redis", lambda: r)

    out_a = fetch_patient_features("tenant_a", "patient_1", feature_set="qeeg")
    out_b = fetch_patient_features("tenant_b", "patient_1", feature_set="qeeg")

    assert out_a["tenant_id"] == "tenant_a"
    assert out_b["tenant_id"] == "tenant_b"
    assert out_a["features"]["qeeg"]["alpha_power"] == 1.0
    assert out_b["features"]["qeeg"]["alpha_power"] == 2.0

