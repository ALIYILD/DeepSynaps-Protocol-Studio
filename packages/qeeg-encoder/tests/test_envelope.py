"""Tests for the universal event envelope."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from qeeg_encoder.bus.envelope import (
    AIInferencePayload,
    EventEnvelope,
    QEEGRecordingPayload,
)


def test_envelope_parse_iso():
    e = EventEnvelope(
        event_id="e",
        event_type="studio.qeeg-recording.v1",
        tenant_id="t",
        patient_pseudonym_id="p",
        occurred_at="2026-04-25T12:00:00Z",
        ingested_at="2026-04-25T12:00:01Z",
        consent_version="2026.04",
        trace_id="tr",
        source_module="src",
    )
    assert e.occurred_at.tzinfo is not None


def test_envelope_parse_epoch_millis():
    e = EventEnvelope(
        event_id="e",
        event_type="studio.qeeg-recording.v1",
        tenant_id="t",
        patient_pseudonym_id="p",
        occurred_at=1714050000000,
        ingested_at=1714050001000,
        consent_version="2026.04",
        trace_id="tr",
        source_module="src",
    )
    assert e.occurred_at.year == 2024


def test_recording_payload_validation():
    QEEGRecordingPayload(
        recording_id="r",
        sfreq=256.0,
        channel_names=["F3", "F4"],
        n_samples=1000,
    )
    with pytest.raises(ValueError):
        QEEGRecordingPayload(recording_id="r", sfreq=0.0, channel_names=["F3"], n_samples=1)
    with pytest.raises(ValueError):
        QEEGRecordingPayload(recording_id="r", sfreq=256.0, channel_names=[], n_samples=1)


def test_ai_inference_payload_advisory_default():
    p = AIInferencePayload(
        inference_id="i",
        model_id="qeeg-encoder",
        model_version="0.1.0",
        head="qeeg_embedding",
        input_event_ids=["e"],
        embedding_dims={"foundation": 512, "tabular": 128},
    )
    assert p.advisory_only is True

