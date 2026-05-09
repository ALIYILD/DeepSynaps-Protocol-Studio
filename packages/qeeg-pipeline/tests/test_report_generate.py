from __future__ import annotations

from pathlib import Path

from deepsynaps_qeeg.pipeline import PipelineResult
from deepsynaps_qeeg.report import generate


def test_build_renders_raw_review_and_local_grounding(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr(generate, "_build_topomaps", lambda features, ch_names: {})
    monkeypatch.setattr(generate, "_render_pdf", lambda html_str, pdf_path: None)

    result = PipelineResult(
        features={
            "clinical_summary": {
                "readiness": "reviewable",
                "confidence": {"score": 0.82, "level": "moderate"},
                "safety_statement": "Decision support only.",
                "data_quality": {"flags": []},
                "observed_findings": [{"statement": "Posterior alpha rhythm present."}],
                "derived_interpretations": [{"statement": "No major focal slowing.", "confidence": "moderate"}],
                "limitations": ["Clinical correlation required."],
            },
            "asymmetry": {},
            "graph": {},
            "source": {},
        },
        zscores={"norm_db_version": "test-norms", "flagged": []},
        quality={
            "pipeline_version": "test-pipeline",
            "sfreq_input": 256,
            "sfreq_output": 256,
            "bandpass": [1, 45],
            "notch_hz": 50,
            "bad_channels": ["Fp1", "T7"],
            "n_epochs_retained": 92,
            "n_epochs_total": 100,
            "bad_channel_detector": "pyprep",
            "user_overrides_applied": True,
        },
    )

    html, pdf_path = generate.build(
        result,
        out_dir=tmp_path,
        ch_names=["Fp1", "Fp2"],
    )

    assert pdf_path is None
    assert "Raw Review Handoff" in html
    assert "Bad channels excluded during preprocessing: Fp1, T7." in html
    assert "Manual raw-review overrides were applied before feature extraction." in html
    assert "Local qEEG Courseware Guardrails" in html
    assert "Local qEEG Research Anchors" in html
    assert "Machine-readable summary" in html
    assert (tmp_path / "report.html").exists()
