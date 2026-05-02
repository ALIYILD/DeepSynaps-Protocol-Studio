"""Clinical voice-quality composites: AVQI-v3, DSI-like, GRBAS estimator, voice break."""

from __future__ import annotations

from .schemas import AVQIScore, DSIScore, GRBASScore, Recording, VoiceBreakStats


def compute_avqi(rec_vowel: Recording, rec_speech: Recording) -> AVQIScore:
    """Compute AVQI-v3 (Acoustic Voice Quality Index) from sustained vowel + connected speech.

    TODO: implement in PR #3 (see ``AUDIO_ANALYZER_STACK.md §9`` task
    3). Re-implement the published 7-feature regression on top of
    Parselmouth measurements (CPPS, HNR, slope of LTAS, shimmer
    local + APQ11, jitter, plus shimmer dB). Map the continuous
    score to a severity band (normal / mild / moderate / severe).
    """

    raise NotImplementedError(
        "clinical_indices.compute_avqi: implement in PR #3 "
        "(see AUDIO_ANALYZER_STACK.md §9)."
    )


def compute_dsi(recording: Recording) -> DSIScore:
    """Compute a DSI-like Dysphonia Severity Index. v1 preview, v2 GA.

    TODO: implement behind a feature flag in v1; promote to GA in v2
    once the calibration cohort is signed off.
    """

    raise NotImplementedError(
        "clinical_indices.compute_dsi: ship in v1 behind a feature flag, "
        "promote to GA in v2 (see AUDIO_ANALYZER_STACK.md §7)."
    )


def estimate_grbas(recording: Recording) -> GRBASScore:
    """Auto-GRBAS estimator (small CNN over log-mel of a sustained vowel).

    TODO: implement in v2 — model lives under ``models/grbas_cnn.pt`` and
    is gated behind the ``[ml]`` install extra.
    """

    raise NotImplementedError(
        "clinical_indices.estimate_grbas: v2 module — see AUDIO_ANALYZER_STACK.md §7."
    )


def voice_break_metrics(recording: Recording) -> VoiceBreakStats:
    """Voice break rate / ratio / longest-break duration.

    TODO: implement in PR #3 with ``parselmouth.praat.call`` returning
    ``Get fraction of locally unvoiced frames`` and break event
    timing.
    """

    raise NotImplementedError(
        "clinical_indices.voice_break_metrics: implement in PR #3 "
        "(see AUDIO_ANALYZER_STACK.md §9)."
    )
