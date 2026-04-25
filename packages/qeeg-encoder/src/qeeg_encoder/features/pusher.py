"""Push encoder outputs to the Feast feature store via the push API.

Writes to the `qeeg_session_features` FeatureView. Tenant scoping is enforced
by prefixing the join key with the tenant id (matches FEATURE_STORE.md §9).
"""

from __future__ import annotations

from typing import Any

import httpx
import structlog
from prometheus_client import Counter

from ..bus.envelope import EventEnvelope
from ..config import FeatureStoreConfig
from ..encoder import QEEGEmbedding

log = structlog.get_logger(__name__)

push_success = Counter("qeeg_encoder_feature_push_success_total", "successful Feast pushes")
push_failure = Counter("qeeg_encoder_feature_push_failure_total", "failed Feast pushes")


class FeatureStorePusher:
    def __init__(self, cfg: FeatureStoreConfig) -> None:
        self.cfg = cfg
        self._client = httpx.AsyncClient(timeout=10.0)

    async def push(self, envelope: EventEnvelope, embedding: QEEGEmbedding) -> None:
        row = self._row_from(envelope, embedding)
        try:
            resp = await self._client.post(
                f"{self.cfg.push_endpoint.rstrip('/')}/push",
                json={
                    "push_source_name": "qeeg_session_push",
                    "df": [row],
                    "to": "online_and_offline",
                },
            )
            resp.raise_for_status()
            push_success.inc()
        except httpx.HTTPError as e:
            push_failure.inc()
            log.error("feast_push_failed", error=str(e), recording=embedding.provenance.get("recording_id"))
            raise

    def _row_from(self, envelope: EventEnvelope, embedding: QEEGEmbedding) -> dict[str, Any]:
        # Tenant-prefixed patient key matches the Redis online-store key strategy
        patient_key = f"{envelope.tenant_id}:{envelope.patient_pseudonym_id}"
        return {
            "patient": patient_key,
            "session_id": embedding.provenance.get("recording_id"),
            "tenant_id": envelope.tenant_id,
            "event_timestamp": envelope.occurred_at.isoformat(),
            "created_timestamp": envelope.ingested_at.isoformat(),
            "consent_version": envelope.consent_version,
            # Embeddings are stored as float32 arrays
            "qeeg_foundation_emb": embedding.foundation_emb.tolist(),
            "qeeg_tabular_emb": embedding.tabular_emb.tolist(),
            # Canonical clinician-readable features
            "frontal_alpha_asymmetry": embedding.canonical_features["frontal_alpha_asymmetry"],
            "band_powers": embedding.canonical_features["band_powers"],
            "relative_powers": embedding.canonical_features["relative_powers"],
            "coherence": embedding.canonical_features["coherence"],
        }

    async def aclose(self) -> None:
        await self._client.aclose()

