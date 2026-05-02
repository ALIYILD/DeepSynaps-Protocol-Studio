"""F0 / pitch extraction via Praat (Parselmouth)."""

from __future__ import annotations

from typing import Optional

from ..schemas import PitchSummary, Recording


def extract_pitch(
    recording: Recording,
    *,
    f0_min_hz: Optional[float] = None,
    f0_max_hz: Optional[float] = None,
) -> PitchSummary:
    """Extract F0 contour summary statistics from the recording.

    TODO: implement in PR #2 (see ``AUDIO_ANALYZER_STACK.md §9`` task
    2). Use ``parselmouth.praat.call(snd, "To Pitch", ...)`` then
    ``Get mean / Get standard deviation / Get minimum / Get maximum``
    over the voiced portion. Default range from
    :data:`constants.F0_RANGE_DEFAULT` if neither ``f0_min_hz`` nor
    ``f0_max_hz`` is supplied.
    """

    raise NotImplementedError(
        "acoustic.pitch.extract_pitch: implement in PR #2 (see AUDIO_ANALYZER_STACK.md §9)."
    )
