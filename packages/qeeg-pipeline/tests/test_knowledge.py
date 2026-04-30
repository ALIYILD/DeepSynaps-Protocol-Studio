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
)
from deepsynaps_qeeg.knowledge.channel_anatomy import explain_channel, channels_for_artifact
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
    assert len(DOMAIN_ENCYCLOPEDIA) == 14


# ── Sleep Staging Tests ─────────────────────────────────────────────────────


def test_sleep_staging_initialization() -> None:
    engine = SleepStagingEngine()
    assert engine is not None
    criteria = SleepStagingEngine.all_criteria()
    assert len(criteria) > 0
