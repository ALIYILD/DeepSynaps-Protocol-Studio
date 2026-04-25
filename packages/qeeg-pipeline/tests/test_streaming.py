from __future__ import annotations

import asyncio
import sys
from pathlib import Path

import pytest

# Ensure src/ is importable when tests run without editable install.
_SRC = Path(__file__).resolve().parents[1] / "src"
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))


def test_mock_source_yields_overlapping_windows_at_hop(synthetic_raw):
    pytest.importorskip("numpy")

    from deepsynaps_qeeg.streaming.lsl_source import MockSource

    src = MockSource(raw=synthetic_raw, window_sec=1.0, hop_sec=0.25, realtime=False)

    async def _collect():
        out = []
        async for w in src.windows(duration_sec=3.0):
            out.append(w)
            if len(out) >= 3:
                break
        return out

    windows = asyncio.run(_collect())
    assert len(windows) == 3
    w0, w1, w2 = windows

    assert w0.data.ndim == 2
    assert w0.data.shape[0] == len(w0.ch_names)
    assert w0.data.shape[1] == int(round(w0.sfreq * 1.0))

    hop_n = int(round(w0.sfreq * 0.25))
    # Consecutive windows should overlap by window-hop samples.
    assert pytest.approx(float((w0.data[:, hop_n:] - w1.data[:, :-hop_n]).mean()), abs=1e-12) == 0.0
    assert pytest.approx(float((w1.data[:, hop_n:] - w2.data[:, :-hop_n]).mean()), abs=1e-12) == 0.0


def test_rolling_features_continuous_over_synthetic_stream(synthetic_raw):
    pytest.importorskip("numpy")
    pytest.importorskip("scipy")

    from deepsynaps_qeeg.streaming.lsl_source import MockSource
    from deepsynaps_qeeg.streaming.rolling import RollingFeatures

    src = MockSource(raw=synthetic_raw, window_sec=1.0, hop_sec=0.25, realtime=False)
    rf = RollingFeatures(sfreq=float(synthetic_raw.info["sfreq"]), ch_names=list(synthetic_raw.ch_names))

    async def _run():
        frames = []
        async for w in src.windows(duration_sec=30.0):
            frame = rf.update(w.data)
            frames.append(frame)
        return frames

    frames = asyncio.run(_run())
    # 30s with 1s windows, 0.25s hop => about 117 frames (inclusive)
    assert len(frames) >= 100

    # No NaNs in band powers and derived biomarkers are stable types.
    for f in frames[:10] + frames[-10:]:
        bands = f["spectral"]["bands"]
        for band_name, payload in bands.items():
            abs_uv2 = payload["absolute_uv2"]
            assert isinstance(abs_uv2, dict)
            # Values should be finite and non-negative.
            for v in abs_uv2.values():
                assert v is not None
                assert v >= 0
        assert f["biomarkers"]["tbr"] is None or f["biomarkers"]["tbr"] >= 0
        assert "Monitoring only" in f.get("disclaimer", "")

