"""Avro consumer for studio.qeeg-recording.v1 and studio.qeeg-features.v1.

At-least-once semantics. Manual offset commit only after the full pipeline
(encode -> feast push -> ai_inference emit) succeeds. Failures route to DLQ.
"""

from __future__ import annotations

import asyncio
import io
import struct
from collections.abc import Awaitable, Callable
from typing import Any

import fastavro
import structlog
from aiokafka import AIOKafkaConsumer
from prometheus_client import Counter, Histogram

from ..config import Settings, load_settings
from ..encoder import QEEGEmbedding, QEEGEncoder
from ..emit.ai_inference import AIInferenceEmitter
from ..features.pusher import FeatureStorePusher
from .envelope import EventEnvelope, QEEGRecordingPayload
from .schema_registry import SchemaRegistryClient

log = structlog.get_logger(__name__)

# Confluent magic byte + 4-byte schema id + Avro payload
_CONFLUENT_MAGIC = 0

events_consumed = Counter("qeeg_encoder_events_consumed_total", "events consumed", ["topic"])
events_dlq = Counter("qeeg_encoder_events_dlq_total", "events routed to DLQ", ["topic", "reason"])
encode_latency = Histogram("qeeg_encoder_encode_seconds", "end-to-end encode latency seconds")


def decode_confluent(raw: bytes, registry: SchemaRegistryClient) -> dict[str, Any]:
    if len(raw) < 5 or raw[0] != _CONFLUENT_MAGIC:
        raise ValueError("not a Confluent-framed Avro message")
    schema_id = struct.unpack(">I", raw[1:5])[0]
    schema = registry.schema_by_id(schema_id)
    return fastavro.schemaless_reader(io.BytesIO(raw[5:]), schema)  # type: ignore[no-any-return]


PipelineHook = Callable[[EventEnvelope, QEEGEmbedding], Awaitable[None]]


class QEEGConsumer:
    """Consumes qEEG events, runs the encoder, pushes to feature store, emits ai_inference."""

    def __init__(
        self,
        settings: Settings,
        encoder: QEEGEncoder,
        pusher: FeatureStorePusher,
        emitter: AIInferenceEmitter,
        registry: SchemaRegistryClient,
        extra_hook: PipelineHook | None = None,
    ) -> None:
        self.settings = settings
        self.encoder = encoder
        self.pusher = pusher
        self.emitter = emitter
        self.registry = registry
        self.extra_hook = extra_hook
        self._consumer: AIOKafkaConsumer | None = None

    async def start(self) -> None:
        topics = [
            self.settings.bus.topics.qeeg_recording,
            self.settings.bus.topics.qeeg_features,
        ]
        self._consumer = AIOKafkaConsumer(
            *topics,
            bootstrap_servers=self.settings.bus.bootstrap_servers,
            group_id=self.settings.bus.consumer_group,
            enable_auto_commit=self.settings.bus.enable_auto_commit,
            auto_offset_reset="earliest",
            max_poll_records=self.settings.bus.max_poll_records,
        )
        await self._consumer.start()
        log.info("consumer_started", topics=topics, group=self.settings.bus.consumer_group)

    async def stop(self) -> None:
        if self._consumer is not None:
            await self._consumer.stop()
            self._consumer = None

    async def run(self, load_eeg_array: Callable[[QEEGRecordingPayload], Any]) -> None:
        """Main loop. `load_eeg_array(payload) -> (np.ndarray, channel_names)` is injected.

        Tests pass an in-memory loader. Production uses an S3-backed loader.
        """
        if self._consumer is None:
            raise RuntimeError("call start() first")

        async for msg in self._consumer:
            events_consumed.labels(topic=msg.topic).inc()
            try:
                with encode_latency.time():
                    await self._handle_one(msg, load_eeg_array)
                await self._consumer.commit()
            except Exception as e:  # pragma: no cover - exercised via DLQ test
                log.error("dlq", topic=msg.topic, error=str(e))
                events_dlq.labels(topic=msg.topic, reason=type(e).__name__).inc()
                await self.emitter.send_dlq(
                    topic=self.settings.bus.topics.dlq,
                    raw=msg.value,
                    reason=str(e),
                    source_topic=msg.topic,
                )
                await self._consumer.commit()

    async def _handle_one(
        self,
        msg: Any,
        load_eeg_array: Callable[[QEEGRecordingPayload], Any],
    ) -> None:
        decoded = decode_confluent(msg.value, self.registry)
        envelope = EventEnvelope.model_validate(decoded)
        payload_dict = decoded.get("payload_inline") or decoded
        payload = QEEGRecordingPayload.model_validate(payload_dict)

        eeg, channel_names = await asyncio.get_running_loop().run_in_executor(
            None, load_eeg_array, payload
        )

        embedding = self.encoder.forward(
            eeg=eeg,
            sfreq=payload.sfreq,
            channel_names=channel_names,
            recording_id=payload.recording_id,
            tenant_id=envelope.tenant_id,
        )

        await self.pusher.push(envelope=envelope, embedding=embedding)
        await self.emitter.emit(envelope=envelope, embedding=embedding)

        if self.extra_hook is not None:
            await self.extra_hook(envelope, embedding)


def run() -> None:  # pragma: no cover - entrypoint
    """CLI entrypoint: qeeg-encoder-consume."""
    import sys

    settings = load_settings()
    log.info("starting", service=settings.service.name)
    # Wiring is done by the service host (apps/brain-twin) in production.
    sys.stderr.write(
        "qeeg-encoder-consume is a library entrypoint. "
        "Run via apps/brain-twin/host or `python -m qeeg_encoder.cli`.\n"
    )
    sys.exit(2)

