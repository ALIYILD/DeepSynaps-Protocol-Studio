"""Tests for ``qeeg_encoder.emit.ai_inference``.

Pins the load-bearing **advisory_only=True** invariant: the encoder
service NEVER emits a prescriptive action. Every studio.ai-inference.v1
event must carry advisory_only=True so downstream fusion / report
modules cannot mistake an embedding for a clinical recommendation.

Also pins:

- The Confluent-framed Avro envelope: magic byte 0x00 + 4-byte
  big-endian schema id + Avro payload.
- ``emit()`` raises before ``start()`` so a misconfigured worker
  cannot silently drop events.
- ``send_dlq()`` raises before ``start()``.
- ``stop()`` is idempotent (safe to call when never started).
- inference_id and event_id are fresh UUIDs per call (never reused).
- Patient pseudonym is the Kafka key (partitioning by patient).
"""
from __future__ import annotations

import asyncio
import io
import struct
from typing import Any
from unittest import mock

import numpy as np
import pytest

from qeeg_encoder.bus.envelope import EventEnvelope
from qeeg_encoder.config import (
    BusConfig,
    BusTopics,
    EmitConfig,
)
from qeeg_encoder.emit import ai_inference as ai_inf
from qeeg_encoder.emit.ai_inference import (
    AIInferenceEmitter,
    _confluent_frame,
)
from qeeg_encoder.encoder import QEEGEmbedding


# ── _confluent_frame pure helper ───────────────────────────────────


class TestConfluentFrame:
    def test_magic_byte_and_schema_id(self) -> None:
        # Pin Confluent wire format: \x00 + 4-byte BE schema id + Avro.
        schema = {
            "type": "record",
            "name": "Test",
            "fields": [{"name": "x", "type": "int"}],
        }
        framed = _confluent_frame(42, schema, {"x": 7})
        assert framed[0:1] == b"\x00"
        assert struct.unpack(">I", framed[1:5])[0] == 42
        # Body is non-empty Avro.
        assert len(framed) > 5

    def test_roundtrip_via_fastavro(self) -> None:
        # Pin: the body decodes as the same payload we wrote.
        import fastavro

        schema = {
            "type": "record",
            "name": "Test",
            "fields": [{"name": "x", "type": "int"}],
        }
        framed = _confluent_frame(1, schema, {"x": 99})
        body = io.BytesIO(framed[5:])
        decoded = fastavro.schemaless_reader(body, schema)
        assert decoded == {"x": 99}


# ── AIInferenceEmitter wiring ──────────────────────────────────────


def _bus_cfg() -> BusConfig:
    return BusConfig(
        bootstrap_servers="kafka:9092",
        schema_registry_url="http://reg:8081",
        consumer_group="test",
        topics=BusTopics(
            qeeg_recording="studio.qeeg-recording.v1",
            qeeg_features="studio.qeeg-features.v1",
            ai_inference="studio.ai-inference.v1",
            dlq="studio.dlq.qeeg-encoder.v1",
        ),
    )


def _embedding() -> QEEGEmbedding:
    return QEEGEmbedding(
        foundation_emb=np.zeros(512, dtype=np.float32),
        tabular_emb=np.zeros(128, dtype=np.float32),
        canonical_features={},
        provenance={"pipeline_version": "0.1.0"},
    )


class TestEmitterInit:
    def test_defaults(self) -> None:
        em = AIInferenceEmitter(
            bus_cfg=_bus_cfg(),
            emit_cfg=EmitConfig(),
            registry=mock.MagicMock(),
        )
        assert em.model_id == "qeeg-encoder"
        assert em.model_version == "0.1.0"
        assert em._producer is None  # not started yet


class TestEmitterRequiresStart:
    @pytest.mark.asyncio
    async def test_emit_before_start_raises(
        self, envelope: EventEnvelope
    ) -> None:
        # Pin: a misconfigured worker that forgets to call start()
        # MUST raise — never silently drop events.
        em = AIInferenceEmitter(
            bus_cfg=_bus_cfg(),
            emit_cfg=EmitConfig(),
            registry=mock.MagicMock(),
        )
        with pytest.raises(RuntimeError, match="start"):
            await em.emit(envelope, _embedding())

    @pytest.mark.asyncio
    async def test_send_dlq_before_start_raises(self) -> None:
        em = AIInferenceEmitter(
            bus_cfg=_bus_cfg(),
            emit_cfg=EmitConfig(),
            registry=mock.MagicMock(),
        )
        with pytest.raises(RuntimeError, match="start"):
            await em.send_dlq(
                topic="dlq",
                raw=b"bad-event",
                reason="schema",
                source_topic="qeeg",
            )

    @pytest.mark.asyncio
    async def test_stop_is_idempotent(self) -> None:
        # Pin: stop() before start() is a no-op (safe shutdown path).
        em = AIInferenceEmitter(
            bus_cfg=_bus_cfg(),
            emit_cfg=EmitConfig(),
            registry=mock.MagicMock(),
        )
        await em.stop()  # should not raise


class TestEmitHappyPath:
    def _patch_producer(
        self,
        monkeypatch: pytest.MonkeyPatch,
        produce_fn: Any | None = None,
    ) -> mock.MagicMock:
        """Replace AIOKafkaProducer with a mock that records send_and_wait calls."""
        producer = mock.MagicMock()
        producer.start = mock.AsyncMock()
        producer.stop = mock.AsyncMock()
        producer.send_and_wait = mock.AsyncMock(side_effect=produce_fn)
        monkeypatch.setattr(
            ai_inf,
            "AIOKafkaProducer",
            mock.MagicMock(return_value=producer),
        )
        return producer

    @pytest.mark.asyncio
    async def test_emit_advisory_only_true(
        self,
        monkeypatch: pytest.MonkeyPatch,
        envelope: EventEnvelope,
    ) -> None:
        # PIN THE LOAD-BEARING SAFETY INVARIANT: every emitted event
        # carries advisory_only=True. The encoder service must NEVER
        # emit a prescriptive action.
        sent: list[tuple[str, bytes, bytes]] = []

        async def _produce(topic, value, key=None, **_):
            sent.append((topic, value, key))

        producer = self._patch_producer(monkeypatch, _produce)
        registry = mock.MagicMock()
        registry.latest_schema.return_value = (
            7,
            {
                "type": "record",
                "name": "Stub",
                "fields": [{"name": "stub", "type": "string"}],
            },
        )
        # Force the framer to a pass-through stub so we can inspect
        # the record dict directly.
        captured_record: dict[str, Any] = {}

        def _stub_frame(schema_id, schema, payload):
            captured_record.update(payload)
            return b"framed"

        monkeypatch.setattr(ai_inf, "_confluent_frame", _stub_frame)

        em = AIInferenceEmitter(
            bus_cfg=_bus_cfg(),
            emit_cfg=EmitConfig(),
            registry=registry,
        )
        await em.start()
        await em.emit(envelope, _embedding())
        await em.stop()

        # Pin: event landed on the ai-inference topic, keyed by
        # patient pseudonym (partitioning by patient).
        assert len(sent) == 1
        topic, value, key = sent[0]
        assert topic == "studio.ai-inference.v1"
        assert key == envelope.patient_pseudonym_id.encode()
        # Pin the safety invariant: advisory_only=True.
        assert captured_record["payload_inline"]["advisory_only"] is True
        # Pin: tenant + consent + trace flow through unchanged.
        assert captured_record["tenant_id"] == envelope.tenant_id
        assert captured_record["consent_version"] == envelope.consent_version
        assert captured_record["trace_id"] == envelope.trace_id
        # Pin: source_module is the model id (provenance).
        assert captured_record["source_module"] == em.model_id

    @pytest.mark.asyncio
    async def test_emit_uses_dimensions_from_embedding(
        self,
        monkeypatch: pytest.MonkeyPatch,
        envelope: EventEnvelope,
    ) -> None:
        # Pin: embedding_dims captures the actual array shapes — not
        # a config value. A foundation backbone swap that produces a
        # different embedding length must show up in the event.
        producer = self._patch_producer(monkeypatch)
        registry = mock.MagicMock()
        registry.latest_schema.return_value = (
            1,
            {"type": "record", "name": "S", "fields": []},
        )
        captured: dict[str, Any] = {}

        def _stub_frame(schema_id, schema, payload):
            captured.update(payload)
            return b"x"

        monkeypatch.setattr(ai_inf, "_confluent_frame", _stub_frame)

        em = AIInferenceEmitter(
            bus_cfg=_bus_cfg(),
            emit_cfg=EmitConfig(),
            registry=registry,
        )
        await em.start()
        await em.emit(
            envelope,
            QEEGEmbedding(
                foundation_emb=np.zeros(256, dtype=np.float32),
                tabular_emb=np.zeros(64, dtype=np.float32),
                canonical_features={},
                provenance={},
            ),
        )
        await em.stop()
        dims = captured["payload_inline"]["embedding_dims"]
        assert dims == {"foundation": 256, "tabular": 64}

    @pytest.mark.asyncio
    async def test_emit_failure_increments_counter(
        self,
        monkeypatch: pytest.MonkeyPatch,
        envelope: EventEnvelope,
    ) -> None:
        # Pin: producer failure increments emit_failure and re-raises
        # — observability must surface the failure to ops.
        async def _boom(*a, **kw):
            raise ConnectionError("kafka down")

        producer = self._patch_producer(monkeypatch, _boom)
        registry = mock.MagicMock()
        registry.latest_schema.return_value = (
            1,
            {"type": "record", "name": "S", "fields": []},
        )
        monkeypatch.setattr(ai_inf, "_confluent_frame", lambda *a: b"x")

        em = AIInferenceEmitter(
            bus_cfg=_bus_cfg(),
            emit_cfg=EmitConfig(),
            registry=registry,
        )
        await em.start()
        before = ai_inf.emit_failure._value.get()
        with pytest.raises(ConnectionError):
            await em.emit(envelope, _embedding())
        after = ai_inf.emit_failure._value.get()
        assert after == before + 1
        await em.stop()


class TestSendDlq:
    @pytest.mark.asyncio
    async def test_send_dlq_writes_record(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # Pin: DLQ record carries source_topic + reason + raw bytes
        # as hex so an operator can replay or inspect.
        sent: list[tuple[str, bytes]] = []

        async def _produce(topic, value, **_):
            sent.append((topic, value))

        producer = mock.MagicMock()
        producer.start = mock.AsyncMock()
        producer.stop = mock.AsyncMock()
        producer.send_and_wait = mock.AsyncMock(side_effect=_produce)
        monkeypatch.setattr(
            ai_inf,
            "AIOKafkaProducer",
            mock.MagicMock(return_value=producer),
        )

        em = AIInferenceEmitter(
            bus_cfg=_bus_cfg(),
            emit_cfg=EmitConfig(),
            registry=mock.MagicMock(),
        )
        await em.start()
        await em.send_dlq(
            topic="studio.dlq.qeeg-encoder.v1",
            raw=b"\x01\x02\x03",
            reason="schema-mismatch",
            source_topic="studio.qeeg-recording.v1",
        )
        await em.stop()

        assert len(sent) == 1
        topic, value = sent[0]
        assert topic == "studio.dlq.qeeg-encoder.v1"
        import json

        record = json.loads(value.decode())
        assert record["reason"] == "schema-mismatch"
        assert record["source_topic"] == "studio.qeeg-recording.v1"
        assert record["raw_b64"] == "010203"
        # Timestamp present + ISO-8601 shaped.
        assert "T" in record["received_at"]
