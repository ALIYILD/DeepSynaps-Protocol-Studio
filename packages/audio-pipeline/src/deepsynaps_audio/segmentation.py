"""Split long recordings into speech-active segments using energy-based VAD."""

from __future__ import annotations

import math
from typing import Optional

import numpy as np

from .schemas import Recording, VoiceSegment


def segment_voice_tasks(
    recording: Recording,
    *,
    frame_ms: float = 25.0,
    hop_ms: float = 10.0,
    energy_quantile: float = 0.35,
    min_segment_s: float = 0.25,
    max_merge_gap_s: float = 0.15,
) -> list[VoiceSegment]:
    """Very voiced segments by RMS energy vs a quantile threshold.

    Suitable for reading passages or connected speech; not a substitute for
    clinical phonetic segmentation.
    """

    if recording.waveform is None or not recording.waveform:
        return []

    sr = max(int(recording.sample_rate), 1)
    y = np.asarray(recording.waveform, dtype=np.float64).ravel()
    if y.size < 2:
        return []

    frame = max(int(sr * frame_ms / 1000.0), 2)
    hop = max(int(sr * hop_ms / 1000.0), 1)

    rms: list[float] = []
    centers: list[float] = []
    n = y.shape[0]
    pos = 0
    while pos + frame <= n:
        chunk = y[pos : pos + frame]
        rms.append(float(math.sqrt(float(np.mean(chunk * chunk)) + 1e-12)))
        centers.append((pos + frame / 2.0) / sr)
        pos += hop
    if not rms:
        return []

    thresh = float(np.quantile(np.asarray(rms, dtype=np.float64), energy_quantile))
    voiced = [r > thresh for r in rms]

    segments: list[tuple[float, float]] = []
    in_seg = False
    seg_start_t = 0.0
    last_active_t: Optional[float] = None

    for i, v in enumerate(voiced):
        t0 = max(0.0, centers[i] - frame / (2.0 * sr))
        t1 = min(float(n) / sr, centers[i] + frame / (2.0 * sr))
        if v and not in_seg:
            in_seg = True
            seg_start_t = t0
            last_active_t = t1
        elif v and in_seg:
            last_active_t = t1
        elif not v and in_seg:
            if last_active_t is not None:
                segments.append((seg_start_t, last_active_t))
            in_seg = False
            last_active_t = None
    if in_seg and last_active_t is not None:
        segments.append((seg_start_t, last_active_t))

    merged: list[tuple[float, float]] = []
    for start, end in segments:
        if end - start < min_segment_s:
            continue
        if merged and start - merged[-1][1] <= max_merge_gap_s:
            merged[-1] = (merged[-1][0], end)
        else:
            merged.append((start, end))

    out: list[VoiceSegment] = []
    for start, end in merged:
        i0 = max(0, int(start * sr))
        i1 = min(n, int(math.ceil(end * sr)))
        if i1 <= i0:
            continue
        clip = y[i0:i1].astype(float).tolist()
        out.append(
            VoiceSegment(
                start_s=float(start),
                end_s=float(end),
                sample_rate_hz=sr,
                waveform=clip,
            )
        )
    return out


__all__ = ["segment_voice_tasks"]
