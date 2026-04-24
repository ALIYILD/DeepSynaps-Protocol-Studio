"""Tests for :mod:`deepsynaps_qeeg.normative.zscore`."""
from __future__ import annotations


def test_toy_norm_db_loads_rows():
    from deepsynaps_qeeg.normative.zscore import ToyCsvNormDB

    db = ToyCsvNormDB()
    mean = db.mean("spectral.bands.alpha.absolute_uv2.Fz", age=30, sex="F")
    std = db.std("spectral.bands.alpha.absolute_uv2.Fz", age=30, sex="F")
    assert mean == 8.0
    assert std == 2.5


def test_compute_zscores_flags_large_deviations():
    from deepsynaps_qeeg.normative.zscore import compute

    # Fz alpha norm: mean=8, std=2.5 → a value of 20 is z≈4.8 (flagged)
    features = {
        "spectral": {
            "bands": {
                "alpha": {
                    "absolute_uv2": {"Fz": 20.0, "Cz": 9.0},
                    "relative": {"Fz": 0.25, "Cz": 0.28},
                }
            },
            "aperiodic": {"slope": {"Fz": 1.2, "Cz": 1.2}},
        }
    }
    z = compute(features, age=30, sex="F")

    assert z["norm_db_version"] == "toy-0.1"
    fz_z = z["spectral"]["bands"]["alpha"]["absolute_uv2"]["Fz"]
    assert fz_z > 1.96
    assert any(f["metric"] == "spectral.bands.alpha.absolute_uv2" and f["channel"] == "Fz"
               for f in z["flagged"])


def test_compute_zscores_no_age_returns_empty():
    from deepsynaps_qeeg.normative.zscore import compute

    z = compute({"spectral": {"bands": {}}}, age=None, sex=None)
    assert z["flagged"] == []
    assert z["norm_db_version"] == "toy-0.1"
