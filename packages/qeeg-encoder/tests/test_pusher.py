"""Tests for qeeg_encoder.features.pusher.FeatureStorePusher."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import httpx
import numpy as np
import pytest

from qeeg_encoder.bus.envelope import EventEnvelope
from qeeg_encoder.config import FeatureStoreConfig
from qeeg_encoder.features.pusher import FeatureStorePusher


def _envelope() -> EventEnvelope:
    now = datetime.now(tz=UTC)
    return EventEnvelope(
        event_id="ev-1",
        event_type="qeeg.recording.v1",
        tenant_id="tenant-A",
        patient_pseudonym_id="pseudo-XYZ",
        occurred_at=now,
        ingested_at=now,
        consent_version="2026-04-01",
        trace_id="trace-1",
        source_module="qeeg-encoder",
    )


def _embedding(*, recording_id: str = "rec-1") -> SimpleNamespace:
    """Mimic the QEEGEmbedding shape FeatureStorePusher reads."""
    return SimpleNamespace(
        provenance={"recording_id": recording_id},
        foundation_emb=np.array([0.1, 0.2, 0.3], dtype=np.float32),
        tabular_emb=np.array([0.4, 0.5], dtype=np.float32),
        canonical_features={
            "frontal_alpha_asymmetry": 0.05,
            "band_powers": {"alpha": 1.2, "beta": 3.4},
            "relative_powers": {"alpha": 0.1},
            "coherence": [0.7, 0.8],
        },
    )


def _config() -> FeatureStoreConfig:
    return FeatureStoreConfig(
        feast_repo=Path("/tmp/feast"),
        push_endpoint="https://feast.example.com/api",
    )


def _success_response() -> MagicMock:
    r = MagicMock()
    r.raise_for_status = MagicMock()
    return r


# ───────────────────────────── _row_from ───────────────────────────────────


class TestRowFrom:
    def test_tenant_prefixed_patient_key(self) -> None:
        pusher = FeatureStorePusher(_config())
        try:
            row = pusher._row_from(_envelope(), _embedding())
            # Tenant-prefixed key matches the Redis online-store strategy.
            assert row["patient"] == "tenant-A:pseudo-XYZ"
            assert row["tenant_id"] == "tenant-A"
        finally:
            asyncio.run(pusher.aclose())

    def test_session_id_from_provenance(self) -> None:
        pusher = FeatureStorePusher(_config())
        try:
            row = pusher._row_from(_envelope(), _embedding(recording_id="rec-42"))
            assert row["session_id"] == "rec-42"
        finally:
            asyncio.run(pusher.aclose())

    def test_embeddings_serialised_to_lists(self) -> None:
        pusher = FeatureStorePusher(_config())
        try:
            row = pusher._row_from(_envelope(), _embedding())
            assert isinstance(row["qeeg_foundation_emb"], list)
            assert isinstance(row["qeeg_tabular_emb"], list)
            # Values preserved.
            assert row["qeeg_foundation_emb"][0] == pytest.approx(0.1)
        finally:
            asyncio.run(pusher.aclose())

    def test_canonical_features_passthrough(self) -> None:
        pusher = FeatureStorePusher(_config())
        try:
            row = pusher._row_from(_envelope(), _embedding())
            assert row["frontal_alpha_asymmetry"] == 0.05
            assert row["band_powers"] == {"alpha": 1.2, "beta": 3.4}
            assert row["coherence"] == [0.7, 0.8]
        finally:
            asyncio.run(pusher.aclose())

    def test_iso_timestamps_used(self) -> None:
        pusher = FeatureStorePusher(_config())
        try:
            row = pusher._row_from(_envelope(), _embedding())
            # iso_format always produces a parseable string.
            datetime.fromisoformat(row["event_timestamp"])
            datetime.fromisoformat(row["created_timestamp"])
        finally:
            asyncio.run(pusher.aclose())

    def test_consent_version_recorded(self) -> None:
        pusher = FeatureStorePusher(_config())
        try:
            row = pusher._row_from(_envelope(), _embedding())
            assert row["consent_version"] == "2026-04-01"
        finally:
            asyncio.run(pusher.aclose())


# ───────────────────────────── push (async) ────────────────────────────────


def _run(coro):
    return asyncio.run(coro)


class TestPushAsync:
    def test_success_path_posts_to_push_endpoint(self) -> None:
        pusher = FeatureStorePusher(_config())
        try:
            mock_client = MagicMock()
            mock_client.post = AsyncMock(return_value=_success_response())
            mock_client.aclose = AsyncMock()
            pusher._client = mock_client

            _run(pusher.push(_envelope(), _embedding()))

            mock_client.post.assert_called_once()
            call_args = mock_client.post.call_args
            assert call_args[0][0].endswith("/push")
            payload = call_args.kwargs["json"]
            assert payload["push_source_name"] == "qeeg_session_push"
            assert payload["to"] == "online_and_offline"
            assert isinstance(payload["df"], list) and len(payload["df"]) == 1
        finally:
            _run(pusher.aclose())

    def test_failure_path_raises(self) -> None:
        pusher = FeatureStorePusher(_config())
        try:
            mock_client = MagicMock()
            mock_client.post = AsyncMock(
                side_effect=httpx.HTTPError("simulated connection error"),
            )
            mock_client.aclose = AsyncMock()
            pusher._client = mock_client

            with pytest.raises(httpx.HTTPError):
                _run(pusher.push(_envelope(), _embedding()))
        finally:
            _run(pusher.aclose())

    def test_endpoint_trailing_slash_stripped(self) -> None:
        cfg = FeatureStoreConfig(
            feast_repo=Path("/tmp/feast"),
            push_endpoint="https://feast.example.com/api/",
        )
        pusher = FeatureStorePusher(cfg)
        try:
            mock_client = MagicMock()
            mock_client.post = AsyncMock(return_value=_success_response())
            mock_client.aclose = AsyncMock()
            pusher._client = mock_client

            _run(pusher.push(_envelope(), _embedding()))

            url = mock_client.post.call_args[0][0]
            # Single slash before /push, no double-slash.
            assert url == "https://feast.example.com/api/push"
            assert "//push" not in url
        finally:
            _run(pusher.aclose())
