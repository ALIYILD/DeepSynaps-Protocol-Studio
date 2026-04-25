"""ai_inference event emitter.

Every encoder run emits exactly one studio.ai-inference.v1 event with full
provenance — model id/version, conformal interval, RAG citations (empty here,
fusion adds them), advisory_only=true.

The encoder service NEVER emits a prescriptive action. advisory_only=true is
hard-coded.
"""

from __future__ import annotations

import io
import json
import struct
import uuid
from datetime import UTC, datetime
from typing import Any

import fastavro
import structlog
from aiokafka import AIOKafkaProducer
from prometheus_client import Counter

from ..bus.envelope import AIInferencePayload, EventEnvelope
from ..bus.schema_registry import SchemaRegistryClient
from ..config import BusConfig, EmitConfig
from ..encoder import QEEGEmbedding

log = structlog.get_logger(__name__)

emit_success = Counter("qeeg_encoder_emit_success_total", "ai_inference events emitted")
emit_failure = Counter("qeeg_encoder_emit_failure_total", "ai_inference emit failures")
dlq_emit = Counter("qeeg_encoder_dlq_emit_total", "DLQ writes from encoder")


def _confluent_frame(schema_id: int, schema: dict[str, Any], payload: dict[str, Any]) -> bytes:
    buf = io.BytesIO()
    buf.write(b"\x00")
    buf.write(struct.pack(">I", schema_id))
    fastavro.schemaless_writer(buf, schema, payload)
    return buf.getvalue()


class AIInferenceEmitter:
    """Emits studio.ai-inference.v1 events; also writes DLQ records."""

    def __init__(
        self,
        bus_cfg: BusConfig,
        emit_cfg: EmitConfig,
        registry: SchemaRegistryClient,
        model_id: str = "qeeg-encoder",
        model_version: str = "0.1.0",
    ) -> None:
        self.bus_cfg = bus_cfg
        self.emit_cfg = emit_cfg
        self.registry = registry
        self.model_id = model_id
        self.model_version = model_version
        self._producer: AIOKafkaProducer | None = None

    async def start(self) -> None:
        self._producer = AIOKafkaProducer(
            bootstrap_servers=self.bus_cfg.bootstrap_servers,
            enable_idempotence=True,
            acks="all",
            max_batch_size=131072,
        )
        await self._producer.start()

    async def stop(self) -> None:
        if self._producer is not None:
            await self._producer.stop()
            self._producer = None

    async def emit(self, envelope: EventEnvelope, embedding: QEEGEmbedding) -> None:
        if self._producer is None:
            raise RuntimeError("call start() first")

        payload = AIInferencePayload(
            inference_id=str(uuid.uuid4()),
            model_id=self.model_id,
            model_version=self.model_version,
            head="qeeg_embedding",
            input_event_ids=[envelope.event_id],
            embedding_dims={
                "foundation": int(embedding.foundation_emb.shape[0]),
                "tabular": int(embedding.tabular_emb.shape[0]),
            },
            embedding_uri=None,  # set by feature-store/blob path in production
            confidence=None,
            conformal_lower=None,
            conformal_upper=None,
            conformal_alpha=None,
            rag_citations=[],
            advisory_only=True,
            provenance=embedding.provenance,
        )

        out = EventEnvelope(
            event_id=str(uuid.uuid4()),
            event_type="studio.ai-inference.v1",
            schema_version="v1",
            tenant_id=envelope.tenant_id,
            patient_pseudonym_id=envelope.patient_pseudonym_id,
            occurred_at=datetime.now(UTC),
            ingested_at=datetime.now(UTC),
            consent_version=envelope.consent_version,
            trace_id=envelope.trace_id,
            source_module=self.model_id,
            payload_inline=payload.model_dump(mode="json"),
            hash_prev=None,
        )

        record = out.model_dump(mode="json")
        record["payload_inline"] = payload.model_dump(mode="json")

        try:
            schema_id, schema = self.registry.latest_schema(
                subject=f"{self.bus_cfg.topics.ai_inference}-value"
            )
            framed = _confluent_frame(schema_id, schema, record)
            await self._producer.send_and_wait(
                self.bus_cfg.topics.ai_inference,
                framed,
                key=envelope.patient_pseudonym_id.encode(),
            )
            emit_success.inc()
        except Exception:
            emit_failure.inc()
            raise

    async def send_dlq(
        self,
        topic: str,
        raw: bytes,
        reason: str,
        source_topic: str,
    ) -> None:
        if self._producer is None:
            raise RuntimeError("call start() first")
        record = {
            "received_at": datetime.now(UTC).isoformat(),
            "source_topic": source_topic,
            "reason": reason,
            "raw_b64": raw.hex(),
        }
        await self._producer.send_and_wait(topic, json.dumps(record).encode())
        dlq_emit.inc()

