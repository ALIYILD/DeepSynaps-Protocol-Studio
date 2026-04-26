from __future__ import annotations

from deepsynaps_qeeg.clinical_summary import build_clinical_summary


def test_qeeg_clinical_summary_separates_observed_and_derived() -> None:
    summary = build_clinical_summary(
        features={
            "spectral": {"peak_alpha_freq": {"O1": 9.8, "O2": 10.2}},
            "asymmetry": {"frontal_alpha_F3_F4": 0.21},
            "source": {"method": "eLORETA"},
        },
        zscores={
            "norm_db_version": "test-norms",
            "flagged": [{"metric": "alpha_relative", "channel": "O1", "z": 2.4}],
        },
        quality={
            "pipeline_version": "0.1.0",
            "n_epochs_retained": 18,
            "n_epochs_total": 30,
            "n_channels_input": 19,
            "bad_channels": ["Fp1", "T7", "P7", "O1"],
            "prep_used": False,
            "iclabel_used": True,
            "autoreject_used": False,
            "stage_errors": {},
        },
        age=44,
        sex="F",
    )

    assert summary["module"] == "qEEG Analyzer"
    assert summary["data_quality"]["flags"]
    assert summary["confidence"]["level"] in {"low", "moderate"}
    assert any(f["type"] == "normative_deviation" for f in summary["observed_findings"])
    assert summary["derived_interpretations"]
    assert "diagnostic" not in summary["safety_statement"].lower()

