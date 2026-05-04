"""AI spike classifier — optional ONNX; heuristic fallback for dev / CI."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np

_PACKAGE_DIR = Path(__file__).resolve().parent
_MODEL_PATH = _PACKAGE_DIR / "models" / "spike_cnn.onnx"


def _heuristic_class(dur_ms: float, p2p_uv: float, deriv_z: float) -> tuple[str, float]:
    """Rule-based stand-in until TUH-finetuned weights ship."""
    if p2p_uv > 200 and dur_ms < 30:
        return "polyspike", min(0.95, 0.55 + min(p2p_uv, 400) / 800)
    if dur_ms > 65 or p2p_uv < 60:
        return "artifact", max(0.35, 1.0 - min(dur_ms, 120) / 200)
    if 35 <= dur_ms <= 55 and 80 <= p2p_uv <= 220:
        return "IED", min(0.92, 0.58 + deriv_z / 20)
    if dur_ms < 35:
        return "sharp_wave", min(0.88, 0.52 + p2p_uv / 500)
    return "IED", 0.55


def _try_onnx_window(x_uv: np.ndarray, sfreq: float) -> tuple[str, float] | None:
    try:
        import onnxruntime as ort  # type: ignore[import-not-found]
    except ImportError:
        return None
    if not _MODEL_PATH.is_file():
        return None
    try:
        sess = ort.InferenceSession(str(_MODEL_PATH), providers=["CPUExecutionProvider"])
        # Expect bundled model: input [1,1,T] logits [1,4] — if shapes mismatch, bail.
        inp = sess.get_inputs()[0]
        name = inp.name
        shape = inp.shape
        target = int(shape[-1]) if shape[-1] not in (None, "T") else 256
        x = np.asarray(x_uv, dtype=np.float32).ravel()
        if x.size < target:
            pad = np.zeros(target - x.size, dtype=np.float32)
            x = np.concatenate([x, pad])
        else:
            mid = len(x) // 2
            half = target // 2
            x = x[max(0, mid - half) : mid - half + target]
        feed = x[:target].reshape(1, 1, target)
        logits = sess.run(None, {name: feed})[0]
        probs = 1.0 / (1.0 + np.exp(-logits))
        cls_idx = int(np.argmax(probs.ravel()))
        labels = ["IED", "sharp_wave", "polyspike", "artifact"]
        conf = float(np.max(probs))
        return labels[cls_idx % len(labels)], conf
    except Exception:
        return None


def augment_spikes_with_ai(
    raw: Any,
    spikes: list[dict[str, Any]],
    *,
    half_window_ms: float = 125.0,
) -> list[dict[str, Any]]:
    """Attach aiClass + aiConfidence (+ optional ONNX)."""
    if not spikes:
        return []
    raw = raw.copy().pick_types(eeg=True, meg=False, stim=False)
    raw.load_data()
    sfreq = float(raw.info["sfreq"])
    half = int(max(4, half_window_ms / 1000.0 * sfreq))

    out: list[dict[str, Any]] = []
    for sp in spikes:
        row = dict(sp)
        ch = str(sp.get("channel") or "")
        peak = float(sp["peakSec"])
        i_peak = int(peak * sfreq)
        if ch not in raw.ch_names:
            cls, conf = _heuristic_class(
                float(sp.get("durationMs") or 40),
                float(sp.get("peakToPeakUv") or 80),
                float(sp.get("derivZ") or 4),
            )
            row["aiClass"] = cls
            row["aiConfidence"] = round(conf, 4)
            row["aiBackend"] = "heuristic"
            out.append(row)
            continue
        ic = raw.ch_names.index(ch)
        d = raw.get_data(picks=[ic])[0] * 1e6
        a = max(0, i_peak - half)
        b = min(len(d), i_peak + half)
        win = np.asarray(d[a:b], dtype=np.float32)
        tried = _try_onnx_window(win, sfreq)
        if tried:
            cls, conf = tried
            backend = "onnx"
        else:
            cls, conf = _heuristic_class(
                float(sp.get("durationMs") or 40),
                float(sp.get("peakToPeakUv") or 80),
                float(sp.get("derivZ") or 4),
            )
            backend = "heuristic"
        row["aiClass"] = cls
        row["aiConfidence"] = round(float(conf), 4)
        row["aiBackend"] = backend
        out.append(row)
    return out


def spike_payload_json(spike: dict[str, Any]) -> str:
    """Serialize spike metadata for RecordingEvent.text (JSON string)."""
    slim = {
        "v": 1,
        "peakSec": spike.get("peakSec"),
        "channel": spike.get("channel"),
        "peakToPeakUv": spike.get("peakToPeakUv"),
        "durationMs": spike.get("durationMs"),
        "aiClass": spike.get("aiClass"),
        "aiConfidence": spike.get("aiConfidence"),
        "accepted": spike.get("accepted", True),
    }
    return json.dumps(slim, separators=(",", ":"))
