"""MFCC summary features (mean / SD over time, with deltas)."""

from __future__ import annotations

from ..schemas import MFCCSummary, Recording


def extract_mfcc(recording: Recording, n: int = 13) -> MFCCSummary:
    """Compute MFCC + Δ + ΔΔ summary stats.

    TODO: implement in PR #2 with ``librosa.feature.mfcc`` and
    ``librosa.feature.delta``. Summarise across time as mean and SD.
    """

    raise NotImplementedError(
        "acoustic.mfcc.extract_mfcc: implement in PR #2 "
        "(see AUDIO_ANALYZER_STACK.md §9)."
    )
