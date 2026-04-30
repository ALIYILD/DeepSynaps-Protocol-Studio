"""Evidence-gap gating tests (QEEG evidence-citation audit 2026-04-30).

Verifies:
  1. Every indicator returned by ``compute_indicators`` carries non-empty
     ``evidence_grade`` and ``evidence_caveat`` strings.
  2. The two audit-disabled protocol mappings (tDCS-O1/O2 for lateral
     occipital bilateral deficit, tACS-Pz for precuneus bilateral excess)
     do NOT surface any suggestion via ``suggest_protocols_from_report``.
  3. The three evidence-supported protocol mappings (Left DLPFC rTMS for
     MDD, Right DLPFC rTMS for anxiety, DMPFC rTMS for ACC hypoactivation)
     still surface and carry their expected ``evidence_grade``.

Reference: ``deepsynaps-qeeg-evidence-gaps.md`` (auto-memory).
"""
from __future__ import annotations

from app.services.qeeg_protocol_fit import suggest_protocols_from_report
from app.services.qeeg_report_template import compute_indicators


# ── Indicator gating ─────────────────────────────────────────────────────────


_EXPECTED_INDICATOR_GRADES: dict[str, str] = {
    "tbr": "FDA_CLEARED_AID_CONTESTED",
    "occipital_paf": "RESEARCH_HEURISTIC",
    "alpha_reactivity": "RESEARCH_HEURISTIC",
    "brain_balance": "RESEARCH_INVESTIGATIONAL",
    "ai_brain_age": "INVESTIGATIONAL_NO_REGULATORY_CLEARANCE",
}


def _features_fixture() -> dict:
    """Minimal pipeline-feature dict that exercises every indicator path."""
    return {
        "spectral": {
            "theta_beta_ratio": 4.1,
            "theta_beta_ratio_percentile": 77.8,
            "peak_alpha_frequency_hz": 8.8,
            "peak_alpha_frequency_percentile": 22.2,
            "alpha_reactivity_ratio": 1.4,
            "alpha_reactivity_percentile": 35.0,
        },
        "asymmetry": {
            "hemisphere_laterality_index": 0.1,
            "hemisphere_laterality_percentile": 41.7,
        },
        "aperiodic": {
            "ai_estimated_brain_age_years": 9.3,
        },
    }


def test_every_indicator_has_evidence_grade_and_caveat() -> None:
    indicators = compute_indicators(_features_fixture())
    dump = indicators.model_dump()
    for name in _EXPECTED_INDICATOR_GRADES:
        block = dump.get(name)
        assert isinstance(block, dict), f"missing indicator {name}"
        grade = block.get("evidence_grade")
        caveat = block.get("evidence_caveat")
        assert isinstance(grade, str) and grade, f"{name}: empty evidence_grade"
        assert isinstance(caveat, str) and caveat, f"{name}: empty evidence_caveat"


def test_indicator_evidence_grades_match_audit() -> None:
    indicators = compute_indicators(_features_fixture())
    dump = indicators.model_dump()
    for name, expected in _EXPECTED_INDICATOR_GRADES.items():
        assert dump[name]["evidence_grade"] == expected, (
            f"{name}: expected {expected}, got {dump[name]['evidence_grade']}"
        )


def test_ai_brain_age_caveat_warns_no_clearance() -> None:
    indicators = compute_indicators(_features_fixture())
    caveat = indicators.ai_brain_age.evidence_caveat or ""
    # Caveat must explicitly say no clearance and direct against clinical use.
    assert "no FDA/CE clearance" in caveat or "no FDA / CE clearance" in caveat
    assert "clinical biomarker" in caveat.lower() or "clinical use" in caveat.lower()


# ── Protocol-suggestion gating ───────────────────────────────────────────────


def _fixture_payload() -> dict:
    """QEEGBrainMapReport-shaped payload that triggers every gated mapping.

    Mirrors the fixture pattern from ``test_qeeg_brain_map_phase2.py``. We
    need:
      - left rostralmiddlefrontal deficit  → triggers Left DLPFC rTMS (STRONG)
      - right rostralmiddlefrontal excess  → triggers Right DLPFC rTMS (WEAK)
      - bilateral lateraloccipital deficit → would have triggered tDCS-O1/O2
        (DISABLED — must NOT surface)
      - bilateral precuneus excess         → would have triggered tACS-Pz
        (DISABLED — must NOT surface)
      - bilateral rostralanteriorcingulate deficit → triggers DMPFC rTMS
        (MODERATE)
    """
    spec = [
        ("rostralmiddlefrontal", "F5", "Rostral Middle Frontal", "frontal", "lh", -2.1),
        ("rostralmiddlefrontal", "F5", "Rostral Middle Frontal", "frontal", "rh", 1.7),
        ("lateraloccipital", "O1", "Lateral Occipital", "occipital", "lh", -1.8),
        ("lateraloccipital", "O1", "Lateral Occipital", "occipital", "rh", -1.8),
        ("precuneus", "P5", "Precuneus", "parietal", "lh", 1.9),
        ("precuneus", "P5", "Precuneus", "parietal", "rh", 1.9),
        ("rostralanteriorcingulate", "C1", "Rostral Anterior Cingulate", "frontal", "lh", -1.8),
        ("rostralanteriorcingulate", "C1", "Rostral Anterior Cingulate", "frontal", "rh", -1.8),
    ]
    dk_atlas: list[dict] = []
    for roi, code, name, lobe, hemi, z in spec:
        dk_atlas.append({
            "code": code, "roi": roi, "name": name, "lobe": lobe, "hemisphere": hemi,
            "lt_percentile": 30.0 if hemi == "lh" else None,
            "rt_percentile": 35.0 if hemi == "rh" else None,
            "z_score": z,
            "functions": [],
            "decline_symptoms": [],
        })
    return {"dk_atlas": dk_atlas}


def test_disabled_tdcs_o1_o2_does_not_surface() -> None:
    suggestions = suggest_protocols_from_report(_fixture_payload())
    matches = [
        s for s in suggestions
        if s.get("pattern") == "lateraloccipital_bilateral_deficit"
        or s.get("target") == "O1/O2"
    ]
    assert matches == [], (
        f"tDCS-O1/O2 mapping is audit-disabled — must not surface. "
        f"Got: {matches}"
    )


def test_disabled_tacs_pz_does_not_surface() -> None:
    suggestions = suggest_protocols_from_report(_fixture_payload())
    matches = [
        s for s in suggestions
        if s.get("pattern") == "precuneus_bilateral_excess"
        or (s.get("modality") == "tACS" and s.get("target") == "Pz")
    ]
    assert matches == [], (
        f"tACS-Pz mapping is audit-disabled — must not surface. "
        f"Got: {matches}"
    )


def test_left_dlpfc_rtms_surfaces_with_strong_grade() -> None:
    suggestions = suggest_protocols_from_report(_fixture_payload())
    dlpfc = [
        s for s in suggestions
        if s.get("target") == "left DLPFC" and s.get("modality") == "rTMS"
    ]
    assert dlpfc, "Left DLPFC rTMS suggestion missing"
    assert dlpfc[0]["evidence_grade"] == "STRONG_FDA_CLEARED"
    assert isinstance(dlpfc[0].get("evidence_caveat"), str)


def test_right_dlpfc_rtms_surfaces_with_weak_off_label_grade() -> None:
    suggestions = suggest_protocols_from_report(_fixture_payload())
    rdl = [
        s for s in suggestions
        if s.get("target") == "right DLPFC" and s.get("modality") == "rTMS"
    ]
    assert rdl, "Right DLPFC rTMS suggestion missing"
    assert rdl[0]["evidence_grade"] == "WEAK_OFF_LABEL_FOR_ANXIETY"
    assert isinstance(rdl[0].get("evidence_caveat"), str)


def test_dmpfc_rtms_surfaces_with_moderate_grade() -> None:
    suggestions = suggest_protocols_from_report(_fixture_payload())
    dmpfc = [
        s for s in suggestions
        if s.get("target") == "DMPFC" and s.get("modality") == "rTMS"
    ]
    assert dmpfc, "DMPFC rTMS suggestion missing"
    assert dmpfc[0]["evidence_grade"] == "MODERATE_NO_RCT_OPEN_LABEL_LARGE_SERIES"
    assert isinstance(dmpfc[0].get("evidence_caveat"), str)
