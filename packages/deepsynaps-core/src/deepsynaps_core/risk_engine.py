"""
RiskEngine — single module that fuses every signal into one
``risk_score ∈ [0,1]`` and a tier (green / yellow / orange / red).

Triggered by the EventBus whenever any upstream event lands. Writes its
output back into the timeline as a ``crisis_alert`` event.

v0: transparent logistic regression (calibrated on clinician-labeled
historic alerts). v1: gradient-boosted overlay. v2: graph-fused neural
model once >500 patients with paired qEEG+MRI+biometrics exist.

Regulatory posture: decision-support only. Red tier notifies the
clinician inbox and primes the CrisisDr agent; it does NOT autonomously
contact the patient.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import datetime
from typing import Literal

from .features import Feature, get_snapshot

Tier = Literal["green", "yellow", "orange", "red"]


# ---------------------------------------------------------------------------
# Feature → weight table. v0 weights are placeholder priors derived from
# the literature — they must be recalibrated on clinic-specific data.
# ---------------------------------------------------------------------------
DEFAULT_WEIGHTS: dict[str, float] = {
    # --- MRI (structural) ---
    "hippocampus_l_volume_z":            -0.25,
    "acc_thickness_z":                   -0.20,
    "amygdala_l_volume_z":                0.15,
    "wmh_volume_z":                       0.10,
    # --- MRI (functional) ---
    "sgACC_DLPFC_anticorrelation_z":     -0.40,   # weaker anti-correlation → higher risk
    "DMN_within_fc_z":                    0.25,    # DMN hyperconnectivity in MDD
    "SN_within_fc_z":                    -0.20,
    # --- qEEG ---
    "alpha_asymmetry_z":                  0.25,
    "theta_beta_ratio_z":                 0.15,
    "frontal_theta_z":                    0.10,
    # --- biometrics ---
    "hrv_rmssd_7d_z":                    -0.35,   # low HRV → risk
    "sleep_efficiency_7d_z":             -0.25,
    "sleep_fragmentation_7d_z":           0.25,
    "step_count_7d_z":                   -0.20,
    "resting_hr_trend_z":                 0.15,
    # --- PROMs ---
    "phq9_total_z":                       0.50,
    "phq9_item9":                         0.90,   # ideation — raw, not z
    "cssrs_ideation":                     1.10,
    "gad7_total_z":                       0.30,
    # --- adherence ---
    "sessions_missed_7d":                 0.30,
    "medication_gap_days":                0.15,
    # --- contextual ---
    "anniversary_proximity":              0.20,
    "season_winter":                      0.05,
}

BIAS: float = -1.5       # prior log-odds anchors baseline around 18%


@dataclass
class RiskScore:
    patient_id: str
    t_utc: datetime
    risk: float                              # 0..1
    tier: Tier
    drivers: list[dict] = field(default_factory=list)
    model_version: str = "v0-logreg"

    @property
    def as_event_payload(self) -> dict:
        return {
            "risk": self.risk,
            "tier": self.tier,
            "drivers": self.drivers,
            "model_version": self.model_version,
        }


def _tier(risk: float) -> Tier:
    if risk >= 0.75:
        return "red"
    if risk >= 0.45:
        return "orange"
    if risk >= 0.20:
        return "yellow"
    return "green"


def _sigmoid(x: float) -> float:
    if x >= 0:
        return 1.0 / (1.0 + math.exp(-x))
    ez = math.exp(x)
    return ez / (1.0 + ez)


def score_patient(
    patient_id: str,
    *,
    weights: dict[str, float] | None = None,
    window_hours: int = 72,
) -> RiskScore:
    """Compute risk for a patient using the current FeatureStore snapshot.

    Returns a RiskScore whose payload can be written back into the timeline
    via ``timeline.from_crisis_alert``.
    """
    w = weights or DEFAULT_WEIGHTS
    snap = get_snapshot(patient_id, age_hours=window_hours)

    contributions: list[tuple[str, float, float]] = []   # (name, value, weighted)
    logit = BIAS
    for name, weight in w.items():
        f: Feature | None = snap.features.get(name)
        if f is None:
            continue
        x = f.z if f.z is not None else f.value
        contrib = weight * x
        logit += contrib
        contributions.append((name, x, contrib))

    risk = _sigmoid(logit)
    tier = _tier(risk)

    # top-5 drivers by absolute contribution
    contributions.sort(key=lambda t: abs(t[2]), reverse=True)
    drivers = [
        {"feature": n, "value": round(v, 3), "contribution": round(c, 3)}
        for n, v, c in contributions[:5]
    ]
    return RiskScore(
        patient_id=patient_id,
        t_utc=snap.t_utc,
        risk=risk,
        tier=tier,
        drivers=drivers,
    )


# ---------------------------------------------------------------------------
# Side-effects: routing decisions per tier
# ---------------------------------------------------------------------------
def route(risk: RiskScore) -> list[str]:
    """Return a list of routing intents for this risk score.

    The EventBus listener translates each intent into a concrete action
    (clinician inbox, agent trigger, patient notification) per the
    clinic's configured policy. v0 returns intent strings only.
    """
    if risk.tier == "red":
        return [
            "clinician_inbox:high_priority",
            "openclaw:crisis_dr:assess",
            "schedule:urgent_visit_slot",
        ]
    if risk.tier == "orange":
        return [
            "clinician_inbox:standard",
            "openclaw:insight_dr:explain",
        ]
    if risk.tier == "yellow":
        return ["openclaw:insight_dr:watchlist"]
    return []
