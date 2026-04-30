"""Phase 2 cross-surface tests:
  - suggest_protocols_from_report consumes the QEEGBrainMapReport contract
  - qeeg_pdf_export renders HTML cleanly from a contract-shaped payload
  - regulatory copy: no banned strings outside the disclaimer phrase
  - the bundled DK narrative bank no longer contains the literal "diagnosis"
    string (audit P1-3 fix in qeeg_protocol_fit.py).
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

from app.services.qeeg_pdf_export import (
    QEEGPdfRendererUnavailable,
    render_qeeg_html,
    render_qeeg_pdf,
)
from app.services.qeeg_protocol_fit import suggest_protocols_from_report


# Self-contained QEEGBrainMapReport-shaped fixture so this test is mergeable
# independently of Phase 0 (which lives on its own branch). The shape mirrors
# apps/api/app/services/qeeg_report_template.py exactly.
def _fixture_payload() -> dict:
    dk_atlas: list[dict] = []
    # Inject a left rostralmiddlefrontal deficit (z=-2.1) and a bilateral
    # lateral occipital deficit (z=-1.8 each side) so the protocol mapper
    # has signal to suggest against. All other regions sit near zero.
    spec = [
        ("rostralmiddlefrontal", "F5", "Rostral Middle Frontal", "frontal", "lh", -2.1),
        ("rostralmiddlefrontal", "F5", "Rostral Middle Frontal", "frontal", "rh", 0.2),
        ("superiorfrontal", "F7", "Superior Frontal", "frontal", "lh", 0.2),
        ("superiorfrontal", "F7", "Superior Frontal", "frontal", "rh", 0.2),
        ("precuneus", "P5", "Precuneus", "parietal", "lh", 0.2),
        ("precuneus", "P5", "Precuneus", "parietal", "rh", 0.2),
        ("lateraloccipital", "O1", "Lateral Occipital", "occipital", "lh", -1.8),
        ("lateraloccipital", "O1", "Lateral Occipital", "occipital", "rh", -1.8),
    ]
    for roi, code, name, lobe, hemi, z in spec:
        dk_atlas.append({
            "code": code, "roi": roi, "name": name, "lobe": lobe, "hemisphere": hemi,
            "lt_percentile": 30.0 if hemi == "lh" else None,
            "rt_percentile": 35.0 if hemi == "rh" else None,
            "z_score": z,
            "functions": ["Working memory and executive control."],
            "decline_symptoms": ["Reduced concentration."],
        })
    return {
        "header": {
            "client_name": "Demo Patient", "sex": "M", "dob": "2018-05-20",
            "age_years": 7.4, "eeg_acquisition_date": "2025-10-13",
            "eyes_condition": "eyes_closed",
        },
        "indicators": {
            "tbr": {"value": 4.1, "unit": "ratio", "percentile": 77.8, "band": "balanced"},
            "occipital_paf": {"value": 8.8, "unit": "Hz", "percentile": 22.2, "band": "balanced"},
            "alpha_reactivity": {"value": 1.4, "unit": "EO/EC", "percentile": 35.0, "band": "balanced"},
            "brain_balance": {"value": 0.1, "unit": "laterality", "percentile": 41.7, "band": "balanced"},
            "ai_brain_age": {"value": 9.3, "unit": "years", "percentile": None, "band": None},
        },
        "brain_function_score": {"score_0_100": 59.1, "formula_version": "phase0_placeholder_v1", "scatter_dots": []},
        "lobe_summary": {
            "frontal":   {"lt_percentile": 47.6, "rt_percentile": 46.4, "lt_band": "balanced", "rt_band": "balanced"},
            "temporal":  {"lt_percentile": 50.5, "rt_percentile": 52.5, "lt_band": "balanced", "rt_band": "balanced"},
            "parietal":  {"lt_percentile": 75.2, "rt_percentile": 76.9, "lt_band": "balanced", "rt_band": "balanced"},
            "occipital": {"lt_percentile": 66.1, "rt_percentile": 57.8, "lt_band": "balanced", "rt_band": "balanced"},
        },
        "source_map": {"topomap_url": "/static/topomaps/abc.png", "dk_roi_zscores": []},
        "dk_atlas": dk_atlas,
        "ai_narrative": {
            "executive_summary": "Within typical range overall.",
            "findings": [{"description": "adhd_pattern_watch", "severity": "watch", "related_rois": []}],
            "protocol_recommendations": [],
            "citations": [{"pmid": "12345", "doi": "10.1000/xyz", "title": "Sample paper", "year": 2024}],
        },
        "quality": {
            "n_clean_epochs": 84, "channels_used": ["Fp1", "Fp2", "F3", "F4"],
            "qc_flags": [], "confidence": {"global": 0.78},
            "method_provenance": {"ica": "picard"},
            "limitations": ["template fsaverage source model"],
        },
        "provenance": {
            "schema_version": "1.0.0", "pipeline_version": "0.5.0",
            "norm_db_version": "lemip+hbn-v1", "file_hash": "a" * 64,
            "generated_at": "2026-04-30T09:00:00Z",
        },
        "disclaimer": "Research and wellness use only. This brain map summary is informational and is not a medical diagnosis or treatment recommendation. Discuss any findings with a qualified clinician.",
    }


# ── suggest_protocols_from_report ────────────────────────────────────────────


def test_suggest_protocols_handles_empty_payload() -> None:
    assert suggest_protocols_from_report({}) == []
    assert suggest_protocols_from_report({"dk_atlas": []}) == []
    assert suggest_protocols_from_report(None) == []  # type: ignore[arg-type]


def test_suggest_protocols_picks_up_left_dlpfc_deficit() -> None:
    payload = _fixture_payload()
    suggestions = suggest_protocols_from_report(payload)
    assert suggestions, "expected at least one suggestion"
    # Left rostral middle frontal deficit should propose left DLPFC rTMS
    dlpfc = [s for s in suggestions if s.get("target") == "left DLPFC" and s.get("modality") == "rTMS"]
    assert dlpfc, f"no left DLPFC rTMS suggestion in {suggestions}"
    s0 = dlpfc[0]
    assert "Verify no seizure history" in s0["required_checks"]
    assert "seizure_history" in s0["contraindications"]
    assert s0["fit_score"] > 0.5


def test_suggest_protocols_picks_up_bilateral_occipital_deficit() -> None:
    payload = _fixture_payload()
    suggestions = suggest_protocols_from_report(payload)
    occ = [s for s in suggestions if s.get("pattern") == "lateraloccipital_bilateral_deficit"]
    assert occ, f"no bilateral occipital deficit suggestion in {[s['pattern'] for s in suggestions]}"
    assert occ[0]["modality"] == "tDCS"


def test_suggest_protocols_required_checks_no_diagnosis_word() -> None:
    payload = _fixture_payload()
    for s in suggest_protocols_from_report(payload):
        for check in s.get("required_checks", []):
            assert "diagnosis" not in check.lower(), f"banned word in required_check: {check}"
            assert "diagnostic" not in check.lower(), f"banned word in required_check: {check}"


# ── qeeg_pdf_export ──────────────────────────────────────────────────────────


def test_render_qeeg_html_renders_all_sections() -> None:
    html = render_qeeg_html(_fixture_payload())
    assert "<!DOCTYPE html>" in html or "<!doctype" in html.lower()
    assert "Demo Patient" in html
    assert "Frontal Lobe Development" in html
    assert "Information Processing Speed" in html
    assert "Brain Activity by Hemisphere" in html
    assert "Standardized Brain Function Score" in html
    # Lobe drill-downs should appear
    assert "Frontal Lobe" in html
    assert "Occipital Lobe" in html
    # Disclaimer
    assert "research and wellness" in html.lower()
    assert "not a medical diagnosis" in html.lower()


def test_render_qeeg_html_no_banned_terms_outside_disclaimer() -> None:
    html = render_qeeg_html(_fixture_payload())
    stripped = re.sub(r"not a medical diagnosis or treatment recommendation", "", html, flags=re.IGNORECASE)
    assert not re.search(r"\bdiagnosis\b", stripped, re.IGNORECASE), "leak: 'diagnosis' outside disclaimer"
    assert not re.search(r"\bdiagnostic\b", stripped, re.IGNORECASE), "leak: 'diagnostic' outside disclaimer"
    assert not re.search(r"\btreatment recommendation\b", stripped, re.IGNORECASE), "leak: 'treatment recommendation' outside disclaimer"


def test_render_qeeg_pdf_503_when_weasyprint_missing(monkeypatch) -> None:
    """If WeasyPrint cannot be imported, the service raises a typed exception
    that the router maps to HTTP 503. Simulate the missing-dep path so the
    test does not require WeasyPrint at CI time."""
    import builtins
    real_import = builtins.__import__

    def _fake_import(name, *args, **kwargs):
        if name == "weasyprint" or name.startswith("weasyprint."):
            raise ModuleNotFoundError("weasyprint is missing")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", _fake_import)
    with pytest.raises(QEEGPdfRendererUnavailable):
        render_qeeg_pdf(_fixture_payload())


# ── DK narrative bank regression ────────────────────────────────────────────


def test_dk_narrative_bank_has_no_banned_terms() -> None:
    path = Path(__file__).resolve().parent.parent / "app" / "data" / "dk_atlas_narrative.json"
    if not path.exists():
        pytest.skip("Phase 0 narrative bank not yet on this branch")
    text = path.read_text(encoding="utf-8")
    # The bank reproduces functions/decline-symptoms strings verbatim from the
    # iSyncBrain sample and must not contain "diagnosis"/"diagnostic" — those
    # words would re-introduce the audit P1-3 leak.
    assert "diagnosis" not in text.lower(), "narrative bank contains 'diagnosis'"
    assert "diagnostic" not in text.lower(), "narrative bank contains 'diagnostic'"


# ── Protocol-fit pattern library regression (audit P1-3) ────────────────────


def test_protocol_fit_pattern_library_no_diagnosis_word() -> None:
    from app.services.qeeg_protocol_fit import _PATTERN_LIBRARY
    for pat in _PATTERN_LIBRARY:
        for check in pat.get("required_checks", []):
            assert "diagnosis" not in check.lower(), f"banned word in pattern '{pat.get('pattern')}' check: {check}"
