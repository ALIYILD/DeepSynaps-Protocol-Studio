"""ML risk scoring: depression / anxiety / stress from biomarker + emotion features."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import xgboost as xgb

from .biomarkers import Biomarkers
from .emotion import EmotionTimeline


@dataclass(frozen=True)
class RiskScores:
    depression: float
    anxiety: float
    stress: float
    confidence: float


def feature_vector(biomarkers: Biomarkers, emotions: EmotionTimeline) -> np.ndarray:
    """Concatenate biomarkers + emotion summary into a fixed-length feature row."""
    # TODO: stable feature ordering, document version in registry.
    raise NotImplementedError


def score(biomarkers: Biomarkers, emotions: EmotionTimeline) -> RiskScores:
    """Run XGBoost models for each construct; return calibrated [0,1] scores."""
    # TODO: load three booster models, predict_proba, apply calibration.
    raise NotImplementedError
