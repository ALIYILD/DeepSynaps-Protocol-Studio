"""Nonlinear voice features: RPDE, DFA, PPE.

Re-implements the canonical Tsanas / Little PD telemonitoring features.
RPDE = Recurrence Period Density Entropy, DFA = Detrended Fluctuation
Analysis (alpha exponent), PPE = Pitch Period Entropy.
"""

from __future__ import annotations

from ..schemas import NonlinearFeatures, Recording


def nonlinear_features(recording: Recording) -> NonlinearFeatures:
    """Compute RPDE / DFA / PPE for a sustained vowel.

    TODO: implement in PR #3 — RPDE and PPE follow the published
    Tsanas formulas; DFA uses ``nolds.dfa`` (or a numpy port).
    Validate on a fixture sustained `/a/` and assert finite,
    physiologically plausible ranges.
    """

    raise NotImplementedError(
        "neurological.nonlinear.nonlinear_features: implement in PR #3 "
        "(see AUDIO_ANALYZER_STACK.md §9)."
    )
