"""Formant analysis: F1–F4, vowel space area, formant dispersion."""

from __future__ import annotations

from ..schemas import FormantFeatures, Recording


def extract_formants(recording: Recording, n: int = 4) -> FormantFeatures:
    """Extract the first ``n`` formants and dispersion from a sustained vowel.

    TODO: implement in PR #2. Use Parselmouth's
    ``To Formant (burg)`` over the voiced portion, take time-averaged
    F1..Fn. Vowel space area is only meaningful when the session
    contains multiple vowels — return ``None`` for single-vowel takes.
    """

    raise NotImplementedError(
        "acoustic.formants.extract_formants: implement in PR #2 "
        "(see AUDIO_ANALYZER_STACK.md §9)."
    )
