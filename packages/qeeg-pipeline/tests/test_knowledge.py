"""Tests for :mod:`deepsynaps_qeeg.knowledge`."""
from __future__ import annotations

import pytest

from deepsynaps_qeeg.knowledge import (
    ArtifactAtlas,
    ChannelAtlas,
    DOMAIN_ENCYCLOPEDIA,
    MedicationEEGAtlas,
    SleepStagingEngine,
    enhance_findings,
    flag_medication_confounds,
    load_wineeg_reference_library,
    manual_analysis_checklist,
    required_workflow_categories,
    validate_wineeg_reference_library,
)
from deepsynaps_qeeg.knowledge.channel_anatomy import explain_channel, channels_for_artifact
from deepsynaps_qeeg.knowledge.medication_eeg import _ALIASES
from deepsynaps_qeeg.knowledge.normative import expected_pdr_hz, age_aware_band_range
from deepsynaps_qeeg.narrative.types import Finding


# ── Channel Anatomy Tests ───────────────────────────────────────────────────


def test_explain_channel_fp1() -> None:
    info = explain_channel("Fp1")
    assert info is not None
    assert "Left inferior frontal gyrus" in info["cortical_region"]
    assert "BA 10" in info["brodmann_areas"]
    assert "eye_blink" in info["common_artifacts"]
    assert "Default Mode Network" in info["functional_networks"]


def test_explain_channel_cz() -> None:
    info = explain_channel("Cz")
    assert info is not None
    assert "Paracentral lobule" in info["cortical_region"]
    assert "BA 4" in info["brodmann_areas"]
    # functional_networks is a tuple in the dataclass, and explain_channel joins it.
    assert "Sensorimotor Network" in info["functional_networks"]


def test_explain_channel_unknown() -> None:
    assert explain_channel("UNKNOWN") is None


def test_channel_atlas_all_channels() -> None:
    channels = ChannelAtlas.all_channels()
    assert len(channels) == 19
    assert "FP1" in channels  # stored upper-case internally
    assert "CZ" in channels


def test_channels_for_artifact_eye_blink() -> None:
    chs = channels_for_artifact("eye_blink")
    assert "Fp1" in chs
    assert "Fp2" in chs


def test_legacy_name_normalization() -> None:
    assert ChannelAtlas.lookup("T3") is None
    assert ChannelAtlas.lookup("T4") is None
    assert ChannelAtlas.lookup("T5") is None
    assert ChannelAtlas.lookup("T6") is None
    assert ChannelAtlas.lookup("T7") is not None
    assert ChannelAtlas.lookup("T8") is not None
    assert ChannelAtlas.lookup("P7") is not None
    assert ChannelAtlas.lookup("P8") is not None


# ── Medication EEG Atlas Tests ──────────────────────────────────────────────


def test_lookup_lorazepam() -> None:
    profile = MedicationEEGAtlas.lookup("lorazepam")
    assert profile is not None
    assert "Benzodiazepines" in profile.name
    assert "beta" in profile.affected_bands


def test_lookup_valproate() -> None:
    profile = MedicationEEGAtlas.lookup("valproate")
    assert profile is not None
    assert "Antiepileptics" in profile.name
    assert "GABA" in profile.drug_class


def test_lookup_unknown() -> None:
    assert MedicationEEGAtlas.lookup("not_a_real_drug_12345") is None


def test_by_class_benzodiazepine() -> None:
    profiles = MedicationEEGAtlas.by_drug_class(
        "GABA-A positive allosteric modulator / anxiolytic-sedative"
    )
    assert len(profiles) >= 1
    names = [p.name for p in profiles]
    assert any("Benzodiazepines" in n for n in names)


def test_all_classes() -> None:
    profiles = MedicationEEGAtlas.all_profiles()
    classes = {p.drug_class for p in profiles}
    assert len(classes) >= 3


def test_all_aliases_resolve() -> None:
    for alias in _ALIASES:
        profile = MedicationEEGAtlas.lookup(alias)
        assert profile is not None, f"alias {alias!r} did not resolve"


def test_by_band_returns_non_empty() -> None:
    for band in ("beta", "theta", "alpha", "delta"):
        profiles = MedicationEEGAtlas.by_band(band)
        assert len(profiles) > 0, f"by_band({band!r}) returned empty list"


def test_by_drug_class_multiple_classes() -> None:
    classes = [
        "GABA-A positive allosteric modulator / anxiolytic-sedative",
        "Dopamine-norepinephrine reuptake inhibitor",
        "Mood stabilizer",
        "Mu-opioid receptor agonist",
        "Histamine H1 receptor antagonist",
    ]
    for cls in classes:
        profiles = MedicationEEGAtlas.by_drug_class(cls)
        assert len(profiles) > 0, f"by_drug_class({cls!r}) returned empty list"


def test_flag_medication_confounds_beta() -> None:
    flags = flag_medication_confounds("beta", ["lorazepam", "cocaine", "caffeine"])
    names = {f["medication"] for f in flags}
    assert any("Benzodiazepines" in n for n in names)
    assert any("Cocaine" in n for n in names)
    assert any("Caffeine" in n for n in names)
    assert len(flags) == 3


def test_flag_medication_confounds_theta() -> None:
    flags = flag_medication_confounds("theta", ["lithium", "heroin"])
    names = {f["medication"] for f in flags}
    assert any("Lithium" in n for n in names)
    assert any("Heroin" in n for n in names)
    assert len(flags) == 2


def test_all_profiles_count() -> None:
    profiles = MedicationEEGAtlas.all_profiles()
    assert len(profiles) == 37


def test_lookup_key_profiles() -> None:
    key_profiles = [
        ("cannabis", "Cannabis / THC / Marijuana"),
        ("thc", "Cannabis / THC / Marijuana"),
        ("lsd", "LSD"),
        ("pcp", "PCP (Phencyclidine)"),
        ("heroin", "Heroin"),
        ("nicotine", "Nicotine"),
        ("meprobamate", "Meprobamate"),
        ("antihistamine", "Antihistamines (sedating and non-sedating)"),
        ("antibiotics", "Antibiotics (chronic use)"),
        ("solvents", "Solvents / Inhalants"),
        ("withdrawal", "Medication withdrawal — general"),
    ]
    for alias, expected_name in key_profiles:
        profile = MedicationEEGAtlas.lookup(alias)
        assert profile is not None, f"lookup({alias!r}) returned None"
        assert profile.name == expected_name, f"lookup({alias!r}) name mismatch"


def test_profile_affected_bands() -> None:
    cocaine = MedicationEEGAtlas.lookup("cocaine")
    assert cocaine is not None
    assert set(cocaine.affected_bands) == {"alpha", "beta"}

    cannabis = MedicationEEGAtlas.lookup("cannabis")
    assert cannabis is not None
    assert set(cannabis.affected_bands) == {"alpha", "delta", "beta"}


# ── Artifact Atlas Tests ────────────────────────────────────────────────────


def test_lookup_fp1_artifacts() -> None:
    profiles = ArtifactAtlas.lookup("Fp1")
    types = {p.artifact_type for p in profiles}
    assert "eye_blink" in types
    assert "myogenic_frontal" in types


def test_by_type_eye_blink() -> None:
    profiles = ArtifactAtlas.all_profiles()
    eye_blink = [p for p in profiles if p.artifact_type == "eye_blink"]
    assert len(eye_blink) == 1
    assert "Fp1" in eye_blink[0].primary_channels
    assert "Fp2" in eye_blink[0].primary_channels


def test_all_types() -> None:
    profiles = ArtifactAtlas.all_profiles()
    types = {p.artifact_type for p in profiles}
    assert len(types) >= 5
    assert "eye_blink" in types
    assert "ecg" in types


# ── Normative Tables Tests ──────────────────────────────────────────────────


def test_zscore_delta_adult() -> None:
    # The knowledge package does not expose z-scores for bands; it exposes
    # age-aware PDR ranges and band semantics. We test the adult PDR range.
    min_hz, max_hz, note = expected_pdr_hz(age_months=240)
    assert min_hz == 8.5
    assert max_hz == 12.0
    assert "Adult" in note


def test_wineeg_reference_library_loads_and_is_reference_only() -> None:
    library = load_wineeg_reference_library()
    assert library["status"] == "reference_only"
    assert library["native_file_ingestion"] is False
    assert "clinician review" in library["clinical_disclaimer"].lower()


def test_wineeg_reference_library_has_required_workflow_categories() -> None:
    validation = validate_wineeg_reference_library()
    assert validation["valid"] is True
    assert validation["missing_categories"] == []
    categories = {item["category"] for item in load_wineeg_reference_library()["workflows"]}
    for category in required_workflow_categories():
        assert category in categories


def test_manual_analysis_checklist_carries_safety_notes() -> None:
    checklist = manual_analysis_checklist()
    assert len(checklist) >= 6
    assert checklist[0]["category"] == "recording_setup"
    assert any("clinician" in " ".join(item["safety_notes"]).lower() for item in checklist)


def test_reference_range_theta() -> None:
    ctx = age_aware_band_range("theta", age_months=240, state="awake_eo")
    assert ctx.band_in_context
    assert "Abnormal" in ctx.band_in_context or "abnormal" in ctx.band_in_context


def test_zscore_child() -> None:
    min_hz, max_hz, note = expected_pdr_hz(age_months=60)
    # 60 months -> nearest younger milestone is 36 months -> 8 Hz
    assert min_hz == 8.0
    assert max_hz == 8.0
    assert "8 Hz" in note


# ── Findings Enhancer Tests ─────────────────────────────────────────────────


def test_enhance_findings_empty() -> None:
    result = enhance_findings([])
    assert result == []


def test_enhance_findings_adds_artifact_flags() -> None:
    finding = Finding(
        region="Fp1",
        band="delta",
        metric="spectral.bands.delta.absolute_uv2",
        value=50.0,
        z=3.0,
        direction="elevated",
        severity="significant",
    )
    enriched = enhance_findings([finding])
    assert len(enriched) == 1
    assert enriched[0]["artifact_flags"]
    types = [a["artifact_type"] for a in enriched[0]["artifact_flags"]]
    assert "eye_blink" in types


def test_enhance_findings_adds_medication_flags() -> None:
    finding = Finding(
        region="Fz",
        band="beta",
        metric="spectral.bands.beta.absolute_uv2",
        value=25.0,
        z=2.5,
        direction="elevated",
        severity="significant",
    )
    enriched = enhance_findings(
        [finding],
        patient_meta={"medications": ["lorazepam"]},
    )
    assert len(enriched) == 1
    assert enriched[0]["medication_flags"]
    names = [m["medication"] for m in enriched[0]["medication_flags"]]
    assert any("Benzodiazepines" in n for n in names)


def test_enhance_findings_adds_normative_context() -> None:
    finding = Finding(
        region="O1",
        band="alpha",
        metric="spectral.bands.alpha.absolute_uv2",
        value=10.0,
        z=0.5,
        direction="normal",
        severity="borderline",
    )
    enriched = enhance_findings([finding], age_months=60)
    assert len(enriched) == 1
    ctx = enriched[0]["normative_context"]
    assert ctx["expected_pdr_min_hz"] is not None
    assert ctx["developmental_note"]


def test_enhance_findings_clinical_note() -> None:
    finding = Finding(
        region="Cz",
        band="theta",
        metric="spectral.bands.theta.absolute_uv2",
        value=15.0,
        z=2.2,
        direction="elevated",
        severity="significant",
    )
    enriched = enhance_findings([finding])
    assert len(enriched) == 1
    assert enriched[0]["clinical_note"]
    assert "Cz" in enriched[0]["clinical_note"]


def test_enhance_findings_includes_medication_summary() -> None:
    finding = Finding(
        region="Fz",
        band="beta",
        metric="spectral.bands.beta.absolute_uv2",
        value=25.0,
        z=2.5,
        direction="elevated",
        severity="significant",
    )
    enriched = enhance_findings(
        [finding],
        patient_meta={"medications": ["lorazepam", "sertraline"]},
    )
    assert len(enriched) == 1
    summary = enriched[0].get("medication_summary")
    assert summary is not None
    assert isinstance(summary, list)
    assert len(summary) == 2
    names = [m["medication"] for m in summary]
    assert any("Benzodiazepines" in n for n in names)
    assert any("SSRIs" in n for n in names)
    for m in summary:
        assert "affected_bands" in m
        assert isinstance(m["affected_bands"], list)
        assert "drug_class" in m
        assert "clinical_note" in m


def test_enhance_findings_empty_medication_summary_when_no_meds() -> None:
    finding = Finding(
        region="Cz",
        band="theta",
        metric="spectral.bands.theta.absolute_uv2",
        value=15.0,
        z=2.2,
        direction="elevated",
        severity="significant",
    )
    enriched = enhance_findings([finding])
    assert len(enriched) == 1
    assert enriched[0].get("medication_summary") == []


# ── Encyclopedia Tests ──────────────────────────────────────────────────────


def test_domain_encyclopedia_has_delta() -> None:
    assert "delta_band" in DOMAIN_ENCYCLOPEDIA
    entry = DOMAIN_ENCYCLOPEDIA["delta_band"]
    assert "Delta activity" in entry["name"]


def test_domain_encyclopedia_has_mu() -> None:
    assert "mu_rhythm" in DOMAIN_ENCYCLOPEDIA
    entry = DOMAIN_ENCYCLOPEDIA["mu_rhythm"]
    assert "Mu rhythm" in entry["name"]


def test_domain_encyclopedia_count() -> None:
    assert len(DOMAIN_ENCYCLOPEDIA) == 26


# ── Sleep Staging Tests ─────────────────────────────────────────────────────


def test_sleep_staging_initialization() -> None:
    engine = SleepStagingEngine()
    assert engine is not None
    criteria = SleepStagingEngine.all_criteria()
    assert len(criteria) > 0
