"""Voice perturbation features: jitter, shimmer, HNR, NHR.

Re-implements the Praat voice report fields most often cited in
clinical and research voice work (see AVQI-v3 + the Tsanas PD voice
biomarker stack).
"""

from __future__ import annotations

from ..schemas import PerturbationFeatures, Recording


def extract_perturbation(recording: Recording) -> PerturbationFeatures:
    """Extract jitter (local / RAP / PPQ5), shimmer (local / APQ3 / 5 / 11), HNR, NHR.

    TODO: implement in PR #2. Use Parselmouth's
    ``To Pitch (cc)`` → ``To PointProcess (cc)`` chain, then call
    ``Get jitter (local) / Get jitter (rap) / Get jitter (ppq5)``
    and ``Get shimmer (local) / Get shimmer (apq3) / (apq5) / (apq11)``,
    plus ``To Harmonicity (cc)`` for HNR. NHR is computed from HNR.

    Recordings should be a sustained vowel; warn (don't raise) if the
    task protocol is something else.
    """

    raise NotImplementedError(
        "acoustic.perturbation.extract_perturbation: implement in PR #2 "
        "(see AUDIO_ANALYZER_STACK.md §9)."
    )
