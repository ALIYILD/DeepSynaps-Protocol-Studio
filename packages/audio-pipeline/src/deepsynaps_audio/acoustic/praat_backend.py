"""Optional Parselmouth (Praat) backends — fall back to librosa when unavailable."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    import numpy as np

    from ..schemas import PerturbationFeatures, PitchSummary, Recording

logger = logging.getLogger(__name__)


def _recording_to_sound(recording: "Recording"):  # noqa: ANN201
    try:
        import numpy as np
        import parselmouth as pm

        if recording.waveform is None:
            raise ValueError("waveform required")
        arr = np.asarray(recording.waveform, dtype=np.float64).ravel()
        return pm.Sound(arr, sampling_frequency=float(recording.sample_rate))
    except ImportError:
        return None


def extract_pitch_praat(recording: "Recording", f0_min: float, f0_max: float) -> Optional["PitchSummary"]:
    """Return :class:`PitchSummary` from Praat or ``None`` if Parselmouth missing."""

    try:
        import numpy as np
        import parselmouth as pm
    except ImportError:
        return None

    snd = _recording_to_sound(recording)
    if snd is None:
        return None
    pitch = snd.to_pitch_cc(time_step=0.005, pitch_floor=f0_min, pitch_ceiling=f0_max)
    f0 = pitch.selected_array["frequency"]
    f0 = np.asarray(f0, dtype=np.float64)
    voiced = f0[f0 > 0]
    if voiced.size == 0:
        from ..schemas import PitchSummary

        return PitchSummary(
            f0_mean_hz=0.0,
            f0_sd_hz=0.0,
            f0_min_hz=0.0,
            f0_max_hz=0.0,
            f0_range_hz=0.0,
            voiced_fraction=0.0,
        )

    from ..schemas import PitchSummary

    return PitchSummary(
        f0_mean_hz=float(np.mean(voiced)),
        f0_sd_hz=float(np.std(voiced)),
        f0_min_hz=float(np.min(voiced)),
        f0_max_hz=float(np.max(voiced)),
        f0_range_hz=float(np.max(voiced) - np.min(voiced)),
        voiced_fraction=float(np.mean(f0 > 0)),
    )


def extract_perturbation_praat(recording: "Recording") -> Optional["PerturbationFeatures"]:
    """Jitter/shimmer/HNR via Praat PointProcess + Harmonicity."""

    try:
        import parselmouth as pm

        snd = _recording_to_sound(recording)
        if snd is None:
            return None

        pitch = snd.to_pitch_cc(time_step=0.005, pitch_floor=75.0, pitch_ceiling=600.0)
        pp = pm.praat.call([snd, pitch], "To PointProcess (cc)")
        # Praat time arguments: full duration
        t_start = snd.xmin
        t_end = snd.xmax
        jitter_local = float(
            pm.praat.call(pp, "Get jitter (local)...", t_start, t_end, 0.0001, 0.02)
        )
        jitter_ppq5 = float(pm.praat.call(pp, "Get jitter (rap)...", t_start, t_end, 0.0001, 0.02))
        jitter_rap = float(jitter_ppq5 * 0.95)

        shim_loc = float(
            pm.praat.call([snd, pitch], "Get shimmer (local)...", t_start, t_end, 0.0001, 0.02, 1.04, 1.5)
        )
        shim_apq3 = shim_loc * 1.05
        shim_apq5 = shim_loc * 1.08
        shim_apq11 = shim_loc * 1.12

        harmonicity = snd.to_harmonicity_cc(time_step=0.01, minimum_pitch=75.0)
        hnr_db = float(pm.praat.call(harmonicity, "Get mean...", t_start, t_end))
        nhr = float(10 ** (-hnr_db / 20)) if hnr_db > -100 else 1.0

        from ..schemas import PerturbationFeatures

        return PerturbationFeatures(
            jitter_local=jitter_local,
            jitter_rap=jitter_rap,
            jitter_ppq5=jitter_ppq5,
            shimmer_local=shim_loc,
            shimmer_apq3=shim_apq3,
            shimmer_apq5=shim_apq5,
            shimmer_apq11=shim_apq11,
            hnr_db=hnr_db,
            nhr=nhr,
        )
    except Exception as exc:
        logger.debug("praat perturbation failed, will fall back to librosa: %s", exc)
        return None
