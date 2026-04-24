"""Tests for :mod:`deepsynaps_qeeg.normative.gamlss`."""
from __future__ import annotations

from typing import Any


def _features() -> dict[str, Any]:
    """Classical feature dict with a deliberately extreme channel.

    Returns
    -------
    dict
    """
    return {
        "spectral": {
            "bands": {
                "alpha": {
                    # Fz deliberately huge — the stub sigmoid + inverse
                    # normal should push the resulting z-score into the
                    # flagged range.
                    "absolute_uv2": {"Fz": 50.0, "Cz": 9.0, "Pz": 8.5},
                    "relative":     {"Fz": 0.4,  "Cz": 0.25, "Pz": 0.24},
                },
                "theta": {
                    "absolute_uv2": {"Fz": 4.0, "Cz": 3.9, "Pz": 3.1},
                    "relative":     {"Fz": 0.18, "Cz": 0.17, "Pz": 0.15},
                },
            },
            "aperiodic": {
                "slope":   {"Fz": 1.2, "Cz": 1.1, "Pz": 0.9},
                "offset":  {"Fz": 0.3, "Cz": 0.4, "Pz": 0.4},
            },
            "peak_alpha_freq": {"Fz": 10.0, "Cz": 10.2, "Pz": 9.5},
        }
    }


def test_centiles_shape_and_range() -> None:
    """Centiles dict has spectral + aperiodic blocks; values 0..100."""
    from deepsynaps_qeeg.normative.gamlss import compute_centiles_and_zscores

    out = compute_centiles_and_zscores(_features(), age=30, sex="F")

    assert "centiles" in out
    assert "zscores" in out

    cent = out["centiles"]
    assert "spectral" in cent and "bands" in cent["spectral"]
    assert "aperiodic" in cent and "slope" in cent["aperiodic"]
    assert cent["norm_db_version"].startswith("gamlss-v1")

    # Every centile is a float in [0, 100].
    for band, metrics in cent["spectral"]["bands"].items():
        for metric_key, ch_map in metrics.items():
            for ch, value in ch_map.items():
                assert 0.0 <= float(value) <= 100.0, f"{band}.{metric_key}.{ch}={value}"
    for ch, value in cent["aperiodic"]["slope"].items():
        assert 0.0 <= float(value) <= 100.0


def test_flagged_list_populated_for_extreme_value() -> None:
    """Alpha.absolute_uv2.Fz is extreme → |z|>1.96 → flagged."""
    from deepsynaps_qeeg.normative.gamlss import compute_centiles_and_zscores

    out = compute_centiles_and_zscores(_features(), age=30, sex="F")
    zscores = out["zscores"]
    assert "flagged" in zscores
    assert len(zscores["flagged"]) >= 1, "extreme Fz value should trigger at least one flag"
    for item in zscores["flagged"]:
        assert set(item.keys()) >= {"metric", "channel", "z"}
        assert abs(float(item["z"])) > 1.96


def test_no_age_or_sex_returns_empty_bundle() -> None:
    """Missing age/sex → empty centiles and zscores, version still tagged."""
    from deepsynaps_qeeg.normative.gamlss import compute_centiles_and_zscores

    out = compute_centiles_and_zscores(_features(), age=None, sex=None)
    assert out["centiles"]["spectral"]["bands"] == {}
    assert out["centiles"]["aperiodic"]["slope"] == {}
    assert out["zscores"]["flagged"] == []
    assert out["zscores"]["norm_db_version"].startswith("gamlss-v1")


def test_stub_is_deterministic_across_calls() -> None:
    """Identical inputs → identical centile + z-score dicts."""
    from deepsynaps_qeeg.normative.gamlss import compute_centiles_and_zscores

    a = compute_centiles_and_zscores(_features(), age=30, sex="F")
    b = compute_centiles_and_zscores(_features(), age=30, sex="F")
    assert a == b


def test_legacy_normative_zscore_untouched() -> None:
    """The legacy :mod:`normative.zscore` module must still be importable."""
    from deepsynaps_qeeg.normative import zscore as legacy

    assert hasattr(legacy, "compute")
    assert hasattr(legacy, "ToyCsvNormDB")
    assert legacy.DEFAULT_NORM_DB_VERSION == "toy-0.1"


def test_gamlss_db_implements_normative_protocol() -> None:
    """:class:`GamlssNormativeDB` quacks like :class:`NormativeDB`."""
    from deepsynaps_qeeg.normative.gamlss import GamlssNormativeDB

    db = GamlssNormativeDB()
    # Protocol methods exist and are callable.
    assert callable(db.mean)
    assert callable(db.std)
    assert callable(db.centile)
    # In stub mode mean/std return None and centile returns 50.
    assert db.mean("spectral.bands.alpha.absolute_uv2.Fz", 30, "F") is None
    assert db.std("spectral.bands.alpha.absolute_uv2.Fz", 30, "F") is None
    assert db.centile("spectral.bands.alpha.absolute_uv2.Fz", 30, "F") == 50.0
