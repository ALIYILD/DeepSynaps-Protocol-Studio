"""Tests for deepsynaps_core.risk_engine.

The risk engine is decision-support — pin every tier transition + driver
ranking + sigmoid behaviour so a regression in scoring is loud.
"""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from deepsynaps_core import features as features_mod
from deepsynaps_core import risk_engine as risk_mod
from deepsynaps_core.features import Feature, FeatureSnapshot
from deepsynaps_core.risk_engine import (
    BIAS,
    DEFAULT_WEIGHTS,
    RiskScore,
    _sigmoid,
    _tier,
    route,
    score_patient,
)


# ───────────────────────────── _tier ────────────────────────────────────────


class TestTier:
    @pytest.mark.parametrize(
        "risk,expected",
        [
            (0.0, "green"),
            (0.19, "green"),
            (0.20, "yellow"),
            (0.44, "yellow"),
            (0.45, "orange"),
            (0.74, "orange"),
            (0.75, "red"),
            (1.0, "red"),
        ],
    )
    def test_tier_thresholds(self, risk: float, expected: str) -> None:
        assert _tier(risk) == expected


# ───────────────────────────── _sigmoid ─────────────────────────────────────


class TestSigmoid:
    def test_zero_is_half(self) -> None:
        assert _sigmoid(0.0) == pytest.approx(0.5)

    def test_large_positive(self) -> None:
        assert _sigmoid(20.0) == pytest.approx(1.0, abs=1e-6)

    def test_large_negative(self) -> None:
        assert _sigmoid(-20.0) == pytest.approx(0.0, abs=1e-6)

    def test_monotonic(self) -> None:
        assert _sigmoid(-1.0) < _sigmoid(0.0) < _sigmoid(1.0)


# ───────────────────────────── score_patient ────────────────────────────────


def _snap_with(features: dict[str, float]) -> FeatureSnapshot:
    """Build a snapshot whose feature.z values are the given numbers."""
    now = datetime.now(timezone.utc)
    return FeatureSnapshot(
        patient_id="p-1",
        t_utc=now,
        features={
            name: Feature(
                patient_id="p-1",
                t_utc=now,
                source="qeeg",
                name=name,
                value=z,
                z=z,
            )
            for name, z in features.items()
        },
    )


class TestScorePatient:
    def test_baseline_with_no_features_uses_bias(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(
            risk_mod, "get_snapshot", lambda pid, age_hours=72: _snap_with({})
        )
        result = score_patient("p-1")
        assert isinstance(result, RiskScore)
        # Baseline ≈ sigmoid(BIAS=-1.5) ≈ 0.182 → green tier.
        assert result.tier == "green"
        assert result.drivers == []
        assert result.model_version == "v0-logreg"

    def test_high_phq9_item9_pushes_to_red(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # phq9_item9 weight is +0.90; a value of 3.0 alone adds 2.7 to logit
        # which more than overcomes the -1.5 bias.
        monkeypatch.setattr(
            risk_mod, "get_snapshot",
            lambda pid, age_hours=72: _snap_with({"phq9_item9": 3.0}),
        )
        result = score_patient("p-1")
        assert result.tier in {"orange", "red"}
        assert any(d["feature"] == "phq9_item9" for d in result.drivers)

    def test_drivers_are_top_5_by_absolute_contribution(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        feats = {name: 1.0 for name in list(DEFAULT_WEIGHTS)[:8]}
        monkeypatch.setattr(
            risk_mod, "get_snapshot", lambda pid, age_hours=72: _snap_with(feats)
        )
        result = score_patient("p-1")
        assert len(result.drivers) <= 5
        # drivers are sorted by absolute contribution
        contribs = [abs(d["contribution"]) for d in result.drivers]
        assert contribs == sorted(contribs, reverse=True)

    def test_custom_weights_override(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(
            risk_mod, "get_snapshot",
            lambda pid, age_hours=72: _snap_with({"x": 5.0}),
        )
        result = score_patient("p-1", weights={"x": 1.0})
        # logit = -1.5 + 1.0*5 = 3.5 → sigmoid(3.5) ≈ 0.97 → red
        assert result.tier == "red"

    def test_value_used_when_z_missing(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # phq9_item9 in DEFAULT_WEIGHTS expects raw value, not z.
        now = datetime.now(timezone.utc)
        snap = FeatureSnapshot(
            patient_id="p-1",
            t_utc=now,
            features={
                "phq9_item9": Feature(
                    patient_id="p-1",
                    t_utc=now,
                    source="prom",
                    name="phq9_item9",
                    value=3.0,
                    z=None,
                ),
            },
        )
        monkeypatch.setattr(risk_mod, "get_snapshot", lambda pid, age_hours=72: snap)
        result = score_patient("p-1")
        assert any(d["feature"] == "phq9_item9" for d in result.drivers)


# ───────────────────────────── route ────────────────────────────────────────


def _score(tier: str) -> RiskScore:
    return RiskScore(
        patient_id="p-1",
        t_utc=datetime.now(timezone.utc),
        risk={"green": 0.1, "yellow": 0.3, "orange": 0.5, "red": 0.9}[tier],
        tier=tier,  # type: ignore[arg-type]
    )


class TestRoute:
    def test_red_routes_to_three_intents(self) -> None:
        assert route(_score("red")) == [
            "clinician_inbox:high_priority",
            "openclaw:crisis_dr:assess",
            "schedule:urgent_visit_slot",
        ]

    def test_orange_routes_to_two_intents(self) -> None:
        assert route(_score("orange")) == [
            "clinician_inbox:standard",
            "openclaw:insight_dr:explain",
        ]

    def test_yellow_routes_to_watchlist(self) -> None:
        assert route(_score("yellow")) == ["openclaw:insight_dr:watchlist"]

    def test_green_returns_empty(self) -> None:
        assert route(_score("green")) == []


# ───────────────────────────── RiskScore.as_event_payload ──────────────────


class TestRiskScorePayload:
    def test_payload_shape(self) -> None:
        rs = RiskScore(
            patient_id="p-1",
            t_utc=datetime.now(timezone.utc),
            risk=0.42,
            tier="yellow",
            drivers=[{"feature": "x", "value": 1.0, "contribution": 0.5}],
        )
        payload = rs.as_event_payload
        assert payload["risk"] == 0.42
        assert payload["tier"] == "yellow"
        assert payload["model_version"] == "v0-logreg"
        assert payload["drivers"][0]["feature"] == "x"


# ───────────────────────────── BIAS / DEFAULT_WEIGHTS shape ─────────────────


class TestRegistryConstants:
    def test_bias_is_finite_and_negative(self) -> None:
        assert isinstance(BIAS, float)
        assert BIAS < 0

    def test_default_weights_keys_are_strings(self) -> None:
        assert all(isinstance(k, str) for k in DEFAULT_WEIGHTS)
        assert all(isinstance(v, (int, float)) for v in DEFAULT_WEIGHTS.values())
        assert "phq9_item9" in DEFAULT_WEIGHTS  # high-priority safety signal
        assert "cssrs_ideation" in DEFAULT_WEIGHTS
