from __future__ import annotations

import json
import os
from datetime import datetime
from typing import Any, Callable, Dict, Mapping

import faust
from redis.asyncio import Redis

from deepsynaps_features.transforms import assessment, qeeg, therapy, wearable


def _redis_url() -> str:
    return os.getenv("DEEPSYNAPS_FEATURES_REDIS_URL", os.getenv("REDIS_URL", "redis://localhost:6379/0"))


def _kafka_brokers() -> str:
    return os.getenv("DEEPSYNAPS_FEATURES_KAFKA_BROKERS", os.getenv("KAFKA_BROKERS", "kafka://localhost:9092"))


def redis_key(tenant_id: str, patient_id: str, group: str) -> str:
    # Tenant isolation is enforced via the key namespace.
    return f"deepsynaps:features:{tenant_id}:patient:{patient_id}:{group}"


async def write_online_features(r: Redis, tenant_id: str, patient_id: str, group: str, features: Mapping[str, Any]) -> None:
    key = redis_key(tenant_id, patient_id, group)
    occurred_at = features.get("occurred_at")
    if isinstance(occurred_at, datetime):
        occurred_at_s = occurred_at.isoformat()
    else:
        occurred_at_s = str(occurred_at) if occurred_at is not None else ""

    await r.hset(
        key,
        mapping={
            "features": json.dumps(dict(features), default=str),
            "occurred_at": occurred_at_s,
        },
    )


# Faust application wiring (Layer 2 streaming workers).
app = faust.App(
    "deepsynaps-feature-store",
    broker=_kafka_brokers(),
    value_serializer="raw",
)


def _loads(b: bytes) -> Dict[str, Any]:
    if not b:
        return {}
    return json.loads(b.decode("utf-8"))


TransformFn = Callable[[Mapping[str, Any]], Dict[str, Any]]

GROUPS: dict[str, TransformFn] = {
    "qeeg": qeeg.compute_online,
    "wearable": wearable.compute_online,
    "assessment": assessment.compute_online,
    "therapy": therapy.compute_online,
}


def _topic_for(group: str) -> faust.TopicT:
    topic_name = os.getenv(f"DEEPSYNAPS_FEATURES_TOPIC_{group.upper()}", f"deepsynaps.events.{group}")
    return app.topic(topic_name, value_type=bytes)


async def _redis() -> Redis:
    return Redis.from_url(_redis_url(), decode_responses=False)


def _agent_for(group: str, transform: TransformFn) -> None:
    topic = _topic_for(group)

    @app.agent(topic)  # type: ignore[misc]
    async def _consume(stream: faust.StreamT[bytes]) -> None:
        r = await _redis()
        async for raw in stream:
            evt = _loads(raw)
            tenant_id = str(evt.get("tenant_id", ""))
            patient_id = str(evt.get("patient_id", ""))
            if not tenant_id or not patient_id:
                continue
            features = transform(evt)
            await write_online_features(r, tenant_id=tenant_id, patient_id=patient_id, group=group, features=features)

    return None


for _group, _transform in GROUPS.items():
    _agent_for(_group, _transform)

