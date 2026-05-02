"""MVP prediction: baselines, simple rules, bounded risk score — not deep ML."""

from __future__ import annotations

from datetime import datetime, timezone

from deepsynaps_biometrics.enums import AlertSeverity
from deepsynaps_biometrics.schemas import PredictiveAlert


def predict_next_day_readiness(
    recent_sleep_h: list[float],
    recent_hrv_ms: list[float],
) -> dict[str, float]:
    """Toy convex combo — replace with clinic-tuned weights."""
    s = sum(recent_sleep_h[-7:]) / max(len(recent_sleep_h[-7:]), 1)
    h = sum(recent_hrv_ms[-7:]) / max(len(recent_hrv_ms[-7:]), 1)
    score = min(100.0, max(0.0, 0.5 * min(s / 8.0, 1.0) * 100 + 0.5 * min(h / 50.0, 1.0) * 100))
    return {"readiness_0_100": score, "component_sleep": s, "component_hrv": h}


def generate_biometric_alerts(
    *,
    user_id: str,
    z_scores: dict[str, float],
    thresholds: dict[str, float] | None = None,
) -> list[PredictiveAlert]:
    """Emit alerts when |z| exceeds threshold per feature."""
    th = thresholds or {"default": 2.5}
    default_t = th.get("default", 2.5)
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    alerts: list[PredictiveAlert] = []
    for feat, z in z_scores.items():
        t = th.get(feat, default_t)
        if abs(z) < t:
            continue
        sev = AlertSeverity.MEDIUM if abs(z) < 3.5 else AlertSeverity.HIGH
        alerts.append(
            PredictiveAlert(
                alert_id=f"alt-{user_id}-{feat}-{now}",
                user_id=user_id,
                severity=sev,
                title=f"Deviation in {feat}",
                detail=f"z-score={z:.2f} vs baseline (threshold {t})",
                triggered_at_utc=now,
                feature_refs=[feat],
                score_0_1=min(1.0, abs(z) / 5.0),
                rule_name="z_score_threshold",
                requires_clinical_review=True,
            )
        )
    return alerts
