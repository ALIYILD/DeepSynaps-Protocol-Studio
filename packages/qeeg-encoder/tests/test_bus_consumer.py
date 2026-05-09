"""Tests for ``qeeg_encoder.bus.consumer``.

Pins the consumer pipeline contract:

- **Confluent decode**: malformed (no magic byte / too short) raises
  ValueError immediately so the consumer routes to DLQ rather than
  trying to process garbage.
- **run() requires start()**: a misconfigured worker that forgot to
  call start() raises RuntimeError instead of silently no-oping.
- **stop() before start() is safe** (idempotent shutdown).
- **_handle_one orchestration order**: decode → validate envelope
  → load EEG → encoder.forward → pusher.push → emitter.emit →
  extra_hook (in that order). A reorder here would break the
  feature-store-before-emit invariant.
- **extra_hook is optional**: the pipeline runs without an extra
  hook (returns None instead of raising).
"""
from __future__ import annotations

import io
import struct
from typing import Any
from unittest import mock

import fastavro
import numpy as np
import pytest

from qeeg_encoder.bus import consumer as cons_mod
from qeeg_encoder.bus.consumer import QEEGConsumer, decode_confluent
from qeeg_encoder.bus.envelope import EventEnvelope, QEEGRecordingPayload
from qeeg_encoder.encoder import QEEGEmbedding


# ── decode_confluent pure helper ───────────────────────────────────


class TestDecodeConfluent:
    def test_too_short_raises(self) -> None:
        registry = mock.MagicMock()
        with pytest.raises(ValueError, match="Confluent"):
            decode_confluent(b"\x00\x00", registry)

    def test_wrong_magic_byte_raises(self) -> None:
        registry = mock.MagicMock()
        # Magic byte 0x01 instead of 0x00.
        with pytest.raises(ValueError, match="Confluent"):
            decode_confluent(b"\x01\x00\x00\x00\x00xxx", registry)

    def test_valid_confluent_decodes(self) -> None:
        # Pin: a well-formed Confluent message decodes via the
        # registry's schema_by_id and the schemaless Avro reader.
        schema = {
            "type": "record",
            "name": "Test",
            "fields": [{"name": "x", "type": "int"}],
        }
        # Build a Confluent-framed payload manually.
        buf = io.BytesIO()
        buf.write(b"\x00")
        buf.write(struct.pack(">I", 7))
        fastavro.schemaless_writer(buf, schema, {"x": 42})

        registry = mock.MagicMock()
        registry.schema_by_id.return_value = schema

        out = decode_confluent(buf.getvalue(), registry)
        assert out == {"x": 42}
        registry.schema_by_id.assert_called_once_with(7)


# ── QEEGConsumer wiring ────────────────────────────────────────────


def _make_consumer(extra_hook=None) -> QEEGConsumer:
    return QEEGConsumer(
        settings=mock.MagicMock(),
        encoder=mock.MagicMock(),
        pusher=mock.MagicMock(),
        emitter=mock.MagicMock(),
        registry=mock.MagicMock(),
        extra_hook=extra_hook,
    )


class TestRequiresStart:
    @pytest.mark.asyncio
    async def test_run_without_start_raises(self) -> None:
        # Pin: the run loop refuses to start without a configured
        # consumer. A worker that forgot to call start() must raise
        # RuntimeError, not silently no-op.
        c = _make_consumer()
        with pytest.raises(RuntimeError, match="start"):
            await c.run(lambda payload: (np.zeros((1, 1)), ["Fp1"]))

    @pytest.mark.asyncio
    async def test_stop_without_start_is_safe(self) -> None:
        # Pin: stop() before start() is idempotent — important for
        # exception-safe finally blocks in the host.
        c = _make_consumer()
        await c.stop()  # must not raise


# ── _handle_one orchestration ──────────────────────────────────────


class TestHandleOneOrchestration:
    @pytest.mark.asyncio
    async def test_pipeline_runs_in_order(
        self, monkeypatch: pytest.MonkeyPatch, envelope: EventEnvelope
    ) -> None:
        # Pin THE pipeline order: decode → encode → push → emit
        # → extra_hook. A reorder here would break the contract
        # that the feature store sees the embedding BEFORE the
        # ai_inference event lands on Kafka.
        call_log: list[str] = []

        encoder = mock.MagicMock()
        embedding = QEEGEmbedding(
            foundation_emb=np.zeros(512, dtype=np.float32),
            tabular_emb=np.zeros(128, dtype=np.float32),
            canonical_features={},
            provenance={},
        )

        def _forward(*a, **kw):
            call_log.append("encode")
            return embedding

        encoder.forward.side_effect = _forward

        pusher = mock.MagicMock()

        async def _push(*a, **kw):
            call_log.append("push")

        pusher.push = mock.AsyncMock(side_effect=_push)

        emitter = mock.MagicMock()

        async def _emit(*a, **kw):
            call_log.append("emit")

        emitter.emit = mock.AsyncMock(side_effect=_emit)

        async def _hook(env, emb):
            call_log.append("hook")

        c = QEEGConsumer(
            settings=mock.MagicMock(),
            encoder=encoder,
            pusher=pusher,
            emitter=emitter,
            registry=mock.MagicMock(),
            extra_hook=_hook,
        )

        # Stub out the wire-format decode so we can inject a
        # well-formed envelope+payload directly.
        decoded = {
            **envelope.model_dump(mode="json"),
            "payload_inline": {
                "recording_id": "rec-1",
                "sfreq": 256.0,
                "channel_names": ["Fp1", "Fp2", "F3"],
                "n_samples": 10,
            },
        }
        monkeypatch.setattr(
            cons_mod,
            "decode_confluent",
            lambda raw, reg: decoded,
        )

        msg = mock.MagicMock(value=b"raw-bytes", topic="studio.qeeg-recording.v1")

        def _load(payload: QEEGRecordingPayload):
            call_log.append("load")
            return np.zeros((3, 10), dtype=np.float32), ["Fp1", "Fp2", "F3"]

        await c._handle_one(msg, _load)

        # Pin the order: load runs in an executor before encode;
        # then push, emit, hook.
        assert call_log == ["load", "encode", "push", "emit", "hook"]
        # Pin: encoder receives tenant_id from the envelope.
        encoder.forward.assert_called_once()
        kwargs = encoder.forward.call_args.kwargs
        assert kwargs["tenant_id"] == envelope.tenant_id
        assert kwargs["recording_id"] == "rec-1"
        assert kwargs["sfreq"] == 256.0

    @pytest.mark.asyncio
    async def test_pipeline_no_extra_hook(
        self, monkeypatch: pytest.MonkeyPatch, envelope: EventEnvelope
    ) -> None:
        # Pin: extra_hook is optional. The pipeline runs without
        # raising when extra_hook is None.
        encoder = mock.MagicMock()
        embedding = QEEGEmbedding(
            foundation_emb=np.zeros(512, dtype=np.float32),
            tabular_emb=np.zeros(128, dtype=np.float32),
            canonical_features={},
            provenance={},
        )
        encoder.forward.return_value = embedding
        pusher = mock.MagicMock()
        pusher.push = mock.AsyncMock()
        emitter = mock.MagicMock()
        emitter.emit = mock.AsyncMock()

        c = QEEGConsumer(
            settings=mock.MagicMock(),
            encoder=encoder,
            pusher=pusher,
            emitter=emitter,
            registry=mock.MagicMock(),
            extra_hook=None,
        )

        decoded = {
            **envelope.model_dump(mode="json"),
            "payload_inline": {
                "recording_id": "rec-1",
                "sfreq": 256.0,
                "channel_names": ["Fp1", "Fp2", "F3"],
                "n_samples": 10,
            },
        }
        monkeypatch.setattr(
            cons_mod, "decode_confluent", lambda raw, reg: decoded
        )

        msg = mock.MagicMock(value=b"x", topic="t")

        def _load(payload):
            return np.zeros((3, 10), dtype=np.float32), ["Fp1", "Fp2", "F3"]

        # Just must not raise.
        await c._handle_one(msg, _load)
        pusher.push.assert_awaited_once()
        emitter.emit.assert_awaited_once()
