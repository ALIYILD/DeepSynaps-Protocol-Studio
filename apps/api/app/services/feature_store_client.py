from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Protocol

from app.settings import AppSettings


@dataclass(frozen=True, slots=True)
class FeatureFetchResult:
    """Returned by FeatureStoreClient.fetch_patient_features().

    Layers 3–4 should treat ``metadata`` as an opaque blob to be persisted
    alongside model outputs for audit/lineage.
    """

    features: dict[str, Any]
    metadata: dict[str, Any]


class FeatureStoreClient(Protocol):
    def fetch_patient_features(
        self,
        tenant_id: str,
        patient_id: str,
        feature_set: str,
    ) -> FeatureFetchResult: ...


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class NullFeatureStoreClient:
    """Default client when no feature store is configured."""

    def fetch_patient_features(self, tenant_id: str, patient_id: str, feature_set: str) -> FeatureFetchResult:
        return FeatureFetchResult(
            features={},
            metadata={
                "provider": "disabled",
                "tenant_id": tenant_id,
                "patient_id": patient_id,
                "feature_set": feature_set,
                "retrieved_at": _now_iso(),
                "empty": True,
                "empty_reason": "feature_store_disabled",
            },
        )


class InMemoryFeatureStoreClient:
    """Tiny test/dry-run implementation.

    Store shape:
      store[tenant_id][patient_id][feature_set] -> {"features": {...}, "metadata": {...}}
    """

    def __init__(self, *, store: dict[str, dict[str, dict[str, dict[str, Any]]]] | None = None) -> None:
        self._store = store or {}

    def fetch_patient_features(self, tenant_id: str, patient_id: str, feature_set: str) -> FeatureFetchResult:
        tenant_bucket = self._store.get(tenant_id) or {}
        patient_bucket = tenant_bucket.get(patient_id) or {}
        record = patient_bucket.get(feature_set)

        if not isinstance(record, dict):
            return FeatureFetchResult(
                features={},
                metadata={
                    "provider": "in_memory",
                    "tenant_id": tenant_id,
                    "patient_id": patient_id,
                    "feature_set": feature_set,
                    "retrieved_at": _now_iso(),
                    "empty": True,
                    # Important invariant for callers: missing == empty, never cross-tenant fallback.
                    "empty_reason": "not_found",
                },
            )

        features = record.get("features")
        metadata = record.get("metadata")
        return FeatureFetchResult(
            features=features if isinstance(features, dict) else {},
            metadata={
                "provider": "in_memory",
                "tenant_id": tenant_id,
                "patient_id": patient_id,
                "feature_set": feature_set,
                "retrieved_at": _now_iso(),
                "empty": False,
                "source_metadata": metadata if isinstance(metadata, dict) else {},
            },
        )


def attach_feature_store_metadata(payload: dict[str, Any], fs_metadata: dict[str, Any]) -> dict[str, Any]:
    """Persist feature retrieval lineage with a model output payload.

    The key is namespaced to avoid collisions with existing schemas.
    """

    if not isinstance(payload, dict):
        return {"_feature_store": fs_metadata}
    merged = dict(payload)
    merged["_feature_store"] = fs_metadata
    return merged


class RedisFeatureStoreClient:
    """Feature store client backed by `packages/feature-store`.

    This is intentionally a thin adapter so app code can depend on a stable
    interface while the feature-store package owns Redis keying, metadata
    envelopes, and feature-set expansion logic.
    """

    def __init__(self) -> None:
        # Import lazily so apps/api can boot even if the package isn't installed
        # in older deployments. In that case, build_feature_store_client will
        # fall back to NullFeatureStoreClient.
        from deepsynaps_features.serve import fetch_patient_features  # type: ignore

        self._fetch_patient_features = fetch_patient_features

    def fetch_patient_features(self, tenant_id: str, patient_id: str, feature_set: str) -> FeatureFetchResult:
        envelope = self._fetch_patient_features(tenant_id=tenant_id, patient_id=patient_id, feature_set=feature_set)
        # `deepsynaps_features.serve.fetch_patient_features` returns a JSON-serializable
        # Pydantic dump (FeatureEnvelope). Keep `metadata` opaque but stable.
        if not isinstance(envelope, dict):
            return FeatureFetchResult(features={}, metadata={"provider": "redis", "empty": True, "empty_reason": "bad_envelope"})

        # Prefer the package’s envelope shape. If missing, degrade gracefully to empty.
        features = envelope.get("features")
        metadata = dict(envelope.get("metadata") or {})
        metadata.update(
            {
                "provider": "redis",
                "tenant_id": tenant_id,
                "patient_id": patient_id,
                "feature_set": feature_set,
                "retrieved_at": _now_iso(),
                "envelope": {k: v for k, v in envelope.items() if k != "features"},
            }
        )

        return FeatureFetchResult(
            features=features if isinstance(features, dict) else {},
            metadata=metadata,
        )


def build_feature_store_client(settings: AppSettings) -> FeatureStoreClient:
    """Factory for the configured Layer 2 client.

    Keeping this in one place prevents Feast-specific decisions from leaking
    into Layer 3–4 call sites.
    """

    if settings.feature_store_backend == "in_memory":
        return InMemoryFeatureStoreClient()
    if settings.feature_store_backend == "feast":
        try:
            return RedisFeatureStoreClient()
        except Exception:  # pragma: no cover
            return NullFeatureStoreClient()
    return NullFeatureStoreClient()

