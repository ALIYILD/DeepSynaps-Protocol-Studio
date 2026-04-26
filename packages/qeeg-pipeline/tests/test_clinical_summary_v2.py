"""Tests for the night-shift clinical_summary upgrades (2026-04-26).

Covers:
- output schema contract: qc_flags, confidence, method_provenance, limitations
  arrays present at top level
- method_provenance non-empty
- evidence_pending fallback when evidence_lookup is missing
- evidence_lookup callable that returns hits is forwarded into findings
- structured stage-error envelope
- structured limitations array (not prose)
"""
from __future__ import annotations

from typing import Any

from deepsynaps_qeeg.clinical_summary import build_clinical_summary


def _baseline_quality(**overrides: Any) -> dict[str, Any]:
    base = {
        "pipeline_version": "0.1.0",
        "n_epochs_retained": 50,
        "n_epochs_total": 60,
        "n_channels_input": 19,
        "bad_channels": [],
        "prep_used": True,
        "iclabel_used": True,
        "autoreject_used": True,
        "stage_errors": {},
        "bandpass": [1.0, 45.0],
        "notch_hz": 50.0,
        "sfreq_input": 500.0,
        "sfreq_output": 250.0,
        "bad_channel_detector": "pyprep",
    }
    base.update(overrides)
    return base


def _baseline_features() -> dict[str, Any]:
    return {
        "spectral": {
            "peak_alpha_freq": {"O1": 9.8, "O2": 10.2},
            "method_provenance": {
                "psd_method": "welch", "fooof_available": True,
                "n_epochs_contributing": 50,
            },
        },
        "asymmetry": {
            "frontal_alpha_F3_F4": 0.21,
            "method_provenance": {"method": "ln(right) - ln(left)"},
        },
        "source": {"method": "eLORETA"},
    }


def test_top_level_schema_has_all_decision_support_keys() -> None:
    summary = build_clinical_summary(
        features=_baseline_features(),
        zscores={"norm_db_version": "test-norms", "flagged": []},
        quality=_baseline_quality(),
        age=44, sex="F",
    )
    # Top-level keys
    assert "qc_flags" in summary, "qc_flags must be promoted to top level"
    assert isinstance(summary["qc_flags"], list)
    assert "confidence" in summary
    assert isinstance(summary["confidence"], dict)
    assert "method_provenance" in summary
    assert "limitations" in summary
    assert isinstance(summary["limitations"], list)
    # Backwards-compat: data_quality.flags still mirrors qc_flags
    assert summary["data_quality"]["flags"] == summary["qc_flags"]


def test_method_provenance_non_empty_and_records_tools() -> None:
    summary = build_clinical_summary(
        features=_baseline_features(),
        zscores={"norm_db_version": "test-norms", "flagged": []},
        quality=_baseline_quality(),
    )
    mp = summary["method_provenance"]
    assert mp["pipeline_version"] == "0.1.0"
    assert mp["norm_db_version"] == "test-norms"
    assert mp["preprocessing"]["bandpass"] == [1.0, 45.0]
    assert mp["preprocessing"]["bad_channel_detector"] == "pyprep"
    assert mp["spectral"]["psd_method"] == "welch"
    assert mp["asymmetry"]["method"]
    assert isinstance(mp["citations"], list) and len(mp["citations"]) >= 4


def test_limitations_are_structured_objects_not_strings() -> None:
    summary = build_clinical_summary(
        features=_baseline_features(),
        zscores={"norm_db_version": "test-norms", "flagged": []},
        quality=_baseline_quality(n_epochs_retained=10),  # triggers low_clean_epoch_count
    )
    assert summary["limitations"], "expected at least the baseline limitations"
    for lim in summary["limitations"]:
        assert isinstance(lim, dict), "limitations must be structured dicts now"
        assert "code" in lim
        assert "severity" in lim
        assert "message" in lim
    codes = {lim["code"] for lim in summary["limitations"]}
    assert "decision_support_only" in codes
    assert "low_clean_epoch_count" in codes


def test_evidence_pending_when_no_lookup_provided() -> None:
    summary = build_clinical_summary(
        features=_baseline_features(),
        zscores={
            "norm_db_version": "n",
            "flagged": [{"metric": "alpha_relative", "channel": "O1", "z": 2.4}],
        },
        quality=_baseline_quality(),
    )
    findings = summary["observed_findings"]
    assert findings, "expected at least one observed finding"
    for f in findings:
        assert "evidence" in f
        assert f["evidence"]["status"] == "evidence_pending"
        assert f["evidence"].get("reason") == "no_evidence_lookup_provided"


def test_evidence_lookup_callable_forwards_real_citations() -> None:
    def fake_lookup(label: str) -> list[dict[str, Any]]:
        # Simulates the deepsynaps_evidence search response shape.
        return [
            {"title": "Frontal alpha asymmetry in MDD", "url": "https://pubmed.ncbi.nlm.nih.gov/1",
             "pmid": "1", "year": 2020, "evidence_level": "II-1"},
            {"title": "PAF in cognition", "url": "https://pubmed.ncbi.nlm.nih.gov/2",
             "pmid": "2", "year": 2018},
        ]

    summary = build_clinical_summary(
        features=_baseline_features(),
        zscores={"norm_db_version": "n", "flagged": []},
        quality=_baseline_quality(),
        evidence_lookup=fake_lookup,
    )
    found = [f for f in summary["observed_findings"] if f["evidence"]["status"] == "found"]
    assert found, "expected at least one finding with attached evidence"
    citations = found[0]["evidence"]["citations"]
    assert len(citations) <= 3
    assert citations[0]["title"] == "Frontal alpha asymmetry in MDD"
    assert citations[0]["url"].startswith("https://")


def test_evidence_lookup_raising_marks_pending_does_not_blow_up() -> None:
    def boom(_label: str) -> list[dict[str, Any]]:
        raise RuntimeError("simulated outage")

    summary = build_clinical_summary(
        features=_baseline_features(),
        zscores={"norm_db_version": "n", "flagged": []},
        quality=_baseline_quality(),
        evidence_lookup=boom,
    )
    for f in summary["observed_findings"]:
        assert f["evidence"]["status"] == "evidence_pending"
        assert "lookup_error" in f["evidence"]["reason"]


def test_structured_stage_error_envelope() -> None:
    summary = build_clinical_summary(
        features=_baseline_features(),
        zscores={"norm_db_version": "n", "flagged": []},
        quality=_baseline_quality(stage_errors={
            "spectral": "ValueError: bad PSD",
            "source": "MemoryError: too big",
        }),
    )
    structured = summary["data_quality"]["stage_errors_structured"]
    assert isinstance(structured, list)
    by_stage = {item["stage"]: item for item in structured}
    assert "spectral" in by_stage
    assert by_stage["spectral"]["severity"] == "high"
    assert by_stage["spectral"]["recoverable"] is False
    assert by_stage["source"]["recoverable"] is True  # source is in the recoverable allow-list
    assert by_stage["source"]["partial_output_available"] is True


def test_low_quality_data_degrades_gracefully() -> None:
    """All-bad input should still produce a well-shaped summary."""
    summary = build_clinical_summary(
        features={},
        zscores={},
        quality={
            "n_epochs_retained": 3,
            "n_epochs_total": 60,
            "n_channels_input": 19,
            "bad_channels": ["F3", "F4", "Fz", "Cz", "Pz"],  # ratio > 0.20
            "prep_used": False,
            "iclabel_used": False,
            "autoreject_used": False,
            "stage_errors": {"preprocess": "boom"},
        },
    )
    # Should still hand back the schema, just with strong warnings.
    assert summary["confidence"]["level"] == "low"
    codes = {f["code"] for f in summary["qc_flags"]}
    assert "low_clean_epoch_count" in codes
    assert "high_bad_channel_ratio" in codes
    assert any(c == "stage_error_preprocess" for c in codes)
    assert isinstance(summary["limitations"], list)
    assert summary["module"] == "qEEG Analyzer"
