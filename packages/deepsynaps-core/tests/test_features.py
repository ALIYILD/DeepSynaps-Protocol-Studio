"""Tests for deepsynaps_core.features (FeatureStore models)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from deepsynaps_core.features import (
    Feature,
    FeatureSnapshot,
    FeatureTrajectory,
    get_flagged,
    get_snapshot,
    get_trajectory,
    publish_feature,
)


def _f(name: str, value: float, *, flagged: bool = False, z: float | None = None) -> Feature:
    return Feature(
        patient_id="p-1",
        t_utc=datetime.now(timezone.utc),
        source="qeeg",
        name=name,
        value=value,
        flagged=flagged,
        z=z,
    )


class TestFeature:
    def test_minimal_construction(self) -> None:
        f = _f("alpha_asymmetry", 0.5)
        assert f.name == "alpha_asymmetry"
        assert f.value == 0.5
        assert f.flagged is False
        assert f.z is None
        assert f.unit is None


class TestFeatureSnapshot:
    def test_flagged_only_filters(self) -> None:
        snap = FeatureSnapshot(
            patient_id="p-1",
            t_utc=datetime.now(timezone.utc),
            features={
                "a": _f("a", 1.0, flagged=True),
                "b": _f("b", 2.0, flagged=False),
                "c": _f("c", 3.0, flagged=True),
            },
        )
        flagged = snap.flagged_only()
        assert set(flagged.keys()) == {"a", "c"}

    def test_flagged_only_empty(self) -> None:
        snap = FeatureSnapshot(
            patient_id="p-1",
            t_utc=datetime.now(timezone.utc),
            features={"a": _f("a", 1.0)},
        )
        assert snap.flagged_only() == {}


class TestFeatureTrajectory:
    def _now(self) -> datetime:
        return datetime.now(timezone.utc)

    def test_delta_returns_none_when_too_few_points(self) -> None:
        traj = FeatureTrajectory(patient_id="p-1", name="x", points=[(self._now(), 1.0)])
        assert traj.delta(days=30) is None

    def test_delta_returns_none_when_no_past_points(self) -> None:
        traj = FeatureTrajectory(
            patient_id="p-1",
            name="x",
            points=[(self._now(), 1.0), (self._now(), 2.0)],
        )
        # All points are recent (now); past-bucket is empty.
        assert traj.delta(days=30) is None

    def test_delta_returns_none_when_no_recent_points(self) -> None:
        old = self._now() - timedelta(days=120)
        traj = FeatureTrajectory(
            patient_id="p-1",
            name="x",
            points=[(old, 1.0), (old, 2.0)],
        )
        assert traj.delta(days=30) is None

    def test_delta_computes_recent_minus_past_means(self) -> None:
        old = self._now() - timedelta(days=120)
        recent = self._now() - timedelta(days=5)
        traj = FeatureTrajectory(
            patient_id="p-1",
            name="x",
            points=[(old, 2.0), (old, 4.0), (recent, 8.0), (recent, 10.0)],
        )
        # past mean = 3.0, recent mean = 9.0, delta = +6.0
        assert traj.delta(days=30) == pytest.approx(6.0)


class TestPublicAPIPlaceholders:
    """The four public queries are NotImplementedError stubs in v0
    (Postgres-backed implementations live in features_pg.py). Pin the
    contract so a future PR can't silently drop the placeholder.
    """

    def test_get_snapshot_raises_not_implemented(self) -> None:
        with pytest.raises(NotImplementedError):
            get_snapshot("p-1")

    def test_get_trajectory_raises_not_implemented(self) -> None:
        with pytest.raises(NotImplementedError):
            get_trajectory("p-1", "alpha")

    def test_get_flagged_raises_not_implemented(self) -> None:
        with pytest.raises(NotImplementedError):
            get_flagged("p-1")

    def test_publish_feature_raises_not_implemented(self) -> None:
        with pytest.raises(NotImplementedError):
            publish_feature(_f("x", 1.0))
