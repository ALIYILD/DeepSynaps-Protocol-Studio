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


def build_feature_store_client(settings: AppSettings) -> FeatureStoreClient:
    """Factory for the configured Layer 2 client.

    Keeping this in one place prevents Feast-specific decisions from leaking
    into Layer 3–4 call sites.
    """

    if settings.feature_store_backend == "in_memory":
        return InMemoryFeatureStoreClient()
    if settings.feature_store_backend == "feast":
        # Placeholder: Layers 3–4 depend on FeatureStoreClient only.
        return NullFeatureStoreClient()
    return NullFeatureStoreClient()

