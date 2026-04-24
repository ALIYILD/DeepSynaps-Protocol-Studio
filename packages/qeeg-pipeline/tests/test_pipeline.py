"""End-to-end tests for :func:`deepsynaps_qeeg.pipeline.run_full_pipeline`."""
from __future__ import annotations

from pathlib import Path

import pytest

pytest.importorskip("mne")


def _write_fif(raw, tmp_path: Path) -> Path:
    fif_path = tmp_path / "synthetic_raw.fif"
    raw.save(str(fif_path), overwrite=True, verbose="WARNING")
    return fif_path


def test_pipeline_end_to_end(synthetic_raw, tmp_path, monkeypatch):
    """Run the full pipeline on synthetic EEG with source localization disabled."""
    fif_path = _write_fif(synthetic_raw, tmp_path)

    # Bypass the 30-second minimum just in case (synthetic is 60 s, but keep safe)
    from deepsynaps_qeeg import pipeline

    result = pipeline.run_full_pipeline(
        fif_path,
        age=30,
        sex="F",
        do_source_localization=False,
        do_report=False,
    )

    assert result.quality["pipeline_version"] == "0.1.0"
    assert isinstance(result.flagged_conditions, list)
    assert "spectral" in result.features
    assert "connectivity" in result.features
    assert "asymmetry" in result.features
    assert "graph" in result.features
    # zscores shape per CONTRACT.md §1.2
    assert "spectral" in result.zscores
    assert "flagged" in result.zscores
    assert "norm_db_version" in result.zscores
    # quality dict shape
    for key in ("sfreq_input", "sfreq_output", "bandpass",
                "n_epochs_total", "n_epochs_retained"):
        assert key in result.quality
