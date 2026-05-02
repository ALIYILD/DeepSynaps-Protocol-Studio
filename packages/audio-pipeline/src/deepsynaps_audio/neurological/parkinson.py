"""Parkinson's-voice likelihood scoring.

Built on the Tsanas / Little PD voice telemonitoring feature paradigm:
jitter (5 variants), shimmer (6 variants), HNR, NHR, RPDE, DFA, PPE,
plus a small MFCC summary. The model is a calibrated lightgbm /
sklearn GBM trained on public PD voice datasets (UCI, mPower derivatives).
"""

from __future__ import annotations

from typing import Mapping

from ..schemas import PDLikelihood


def pd_voice_likelihood(features: Mapping[str, float]) -> PDLikelihood:
    """Return a continuous PD-voice likelihood (0–1) plus the top drivers.

    ``features`` should be the merged dict of perturbation + nonlinear
    + DDK + MFCC summary features for the current session. Consumers
    must never read ``features.get("hard_label")`` — there is no hard
    label.

    TODO: implement in PR #3 (see ``AUDIO_ANALYZER_STACK.md §9`` task
    3). Load model from ``models/pd_voice_gbm_v0.joblib`` after a
    hash check against ``models/MANIFEST.json``. Use SHAP to populate
    the top-k ``drivers`` list.
    """

    raise NotImplementedError(
        "neurological.parkinson.pd_voice_likelihood: implement in PR #3 "
        "(see AUDIO_ANALYZER_STACK.md §9)."
    )
