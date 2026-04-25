"""Shared pytest fixtures."""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import pytest

from qeeg_encoder.bus.envelope import EventEnvelope, QEEGRecordingPayload
from qeeg_encoder.config import (
    BusConfig,
    BusTopics,
    ConformalConfig,
    EmitConfig,
    FeatureStoreConfig,
    FoundationConfig,
    ServiceConfig,
    Settings,
    TabularConfig,
    TenancyConfig,
)


@pytest.fixture
def channel_names() -> list[str]:
    return [
        "Fp1",
        "Fp2",
        "F3",
        "F4",
        "F7",
        "F8",
        "Fz",
        "C3",
        "C4",
        "Cz",
        "T3",
        "T4",
        "T5",
        "T6",
        "P3",
        "P4",
        "Pz",
        "O1",
        "O2",
    ]


@pytest.fixture
def synthetic_eeg(channel_names: list[str]) -> tuple[np.ndarray, float]:
    sfreq = 256.0
    duration_s = 30.0
    n_samples = int(sfreq * duration_s)
    t = np.arange(n_samples) / sfreq
    rng = np.random.default_rng(42)

    eeg = np.zeros((len(channel_names), n_samples), dtype=np.float32)
    for i in range(len(channel_names)):
        eeg[i] += np.sin(2 * np.pi * 10 * t) * 5.0  # alpha
        eeg[i] += np.sin(2 * np.pi * 6 * t) * 2.0  # theta
        eeg[i] += rng.normal(0, 1.0, n_samples).astype(np.float32)
    return eeg, sfreq


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    weights_dir = tmp_path / "weights"
    weights_dir.mkdir()
    cache_dir = tmp_path / "cache"
    cache_dir.mkdir()
    return Settings(
        service=ServiceConfig(),
        bus=BusConfig(
            bootstrap_servers="localhost:9092",
            schema_registry_url="http://localhost:8081",
            consumer_group="test",
            topics=BusTopics(
                qeeg_recording="studio.qeeg-recording.v1",
                qeeg_features="studio.qeeg-features.v1",
                ai_inference="studio.ai-inference.v1",
                dlq="studio.dlq.qeeg-encoder.v1",
            ),
        ),
        foundation=FoundationConfig(
            enabled=True,
            backbone="labram-base",
            weights_dir=weights_dir,
            expected_sha256="0" * 64,
            device="cpu",
            embedding_dim=512,
        ),
        tabular=TabularConfig(enabled=True, embedding_dim=128),
        conformal=ConformalConfig(alpha=0.10, cache_dir=cache_dir),
        feature_store=FeatureStoreConfig(
            feast_repo=tmp_path / "feast",
            push_endpoint="http://localhost:8080",
        ),
        emit=EmitConfig(),
        tenancy=TenancyConfig(),
    )


@pytest.fixture
def envelope() -> EventEnvelope:
    now = datetime.now(UTC)
    return EventEnvelope(
        event_id="evt-1",
        event_type="studio.qeeg-recording.v1",
        tenant_id="tenant-A",
        patient_pseudonym_id="pseudo-123",
        occurred_at=now,
        ingested_at=now,
        consent_version="2026.04",
        trace_id="trace-1",
        source_module="qeeg-analyzer",
        payload_inline={},
    )


@pytest.fixture
def recording_payload(channel_names: list[str]) -> QEEGRecordingPayload:
    return QEEGRecordingPayload(
        recording_id="rec-1",
        sfreq=256.0,
        channel_names=channel_names,
        n_samples=7680,
    )

