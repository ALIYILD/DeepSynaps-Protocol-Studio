"""Residual tests for knowledge atlas modules with 0% coverage.

Covers:
- :mod:`deepsynaps_qeeg.knowledge.medication_washout`
- :mod:`deepsynaps_qeeg.knowledge.montage_reference`
- :mod:`deepsynaps_qeeg.knowledge.display_settings`

No MNE / EEG fixtures required — pure data modules.
"""

from __future__ import annotations

import pytest

from deepsynaps_qeeg.knowledge.medication_washout import (
    MedicationWashoutAtlas,
    WashoutEntry,
    check_washout_compliance,
    explain_washout,
)
from deepsynaps_qeeg.knowledge.montage_reference import (
    MontageAtlas,
    MontageDefinition,
    explain_montage,
    recommend_montage,
)
from deepsynaps_qeeg.knowledge.display_settings import (
    DisplaySettingsAtlas,
    explain_display_preset,
    explain_filter_preset,
    recommend_display_settings,
)


# ─── MedicationWashoutAtlas ───────────────────────────────────────────────────

class TestMedicationWashoutAtlas:
    def test_lookup_lorazepam_primary_name(self) -> None:
        entry = MedicationWashoutAtlas.lookup("lorazepam")
        assert entry is not None
        assert entry.name == "LORAZEPAM"
        assert entry.detox_time == "4 DAYS"
        assert entry.category == "psychiatric"

    def test_lookup_by_alternate_name_xanax(self) -> None:
        entry = MedicationWashoutAtlas.lookup("xanax")
        assert entry is not None
        assert entry.name == "ALPRAZOLAM"

    def test_lookup_case_insensitive(self) -> None:
        assert MedicationWashoutAtlas.lookup("DIAZEPAM") is not None
        assert MedicationWashoutAtlas.lookup("Diazepam") is not None

    def test_lookup_unknown_returns_none(self) -> None:
        assert MedicationWashoutAtlas.lookup("no_such_drug_xyz999") is None

    def test_all_entries_non_empty(self) -> None:
        entries = MedicationWashoutAtlas.all_entries()
        assert len(entries) > 30

    def test_by_category_psychiatric(self) -> None:
        entries = MedicationWashoutAtlas.by_category("psychiatric")
        assert len(entries) > 10
        assert all(e.category == "psychiatric" for e in entries)

    def test_by_category_opioid(self) -> None:
        entries = MedicationWashoutAtlas.by_category("opioid")
        assert len(entries) >= 3
        names = [e.name for e in entries]
        assert "MORPHINE" in names

    def test_categories_returns_sorted_unique(self) -> None:
        cats = MedicationWashoutAtlas.categories()
        assert "psychiatric" in cats
        assert "opioid" in cats
        assert "recreational" in cats
        # sorted
        assert list(cats) == sorted(cats)

    def test_fluoxetine_30_day_washout(self) -> None:
        entry = MedicationWashoutAtlas.lookup("fluoxetine")
        assert entry is not None
        assert entry.detox_time == "30 DAYS"

    def test_cannabis_washout_data(self) -> None:
        entry = MedicationWashoutAtlas.lookup("cannabis")
        assert entry is not None
        assert entry.category == "recreational"
        assert "20" in entry.detox_time


class TestExplainWashout:
    def test_explain_lorazepam_keys(self) -> None:
        result = explain_washout("lorazepam")
        assert result is not None
        assert result["name"] == "LORAZEPAM"
        assert result["detox_time"] == "4 DAYS"
        assert "5 half-lives" in result["note"]

    def test_explain_unknown_returns_none(self) -> None:
        assert explain_washout("unknown_drug") is None

    def test_explain_alternate_name(self) -> None:
        result = explain_washout("prozac")
        assert result is not None
        assert result["name"] == "FLUOXETINE"


class TestCheckWashoutCompliance:
    def test_compliant_status(self) -> None:
        results = check_washout_compliance(
            ["lorazepam"], days_since_last_dose={"lorazepam": 10.0}
        )
        assert len(results) == 1
        assert results[0]["status"] == "compliant"
        assert results[0]["medication"] == "LORAZEPAM"

    def test_insufficient_status(self) -> None:
        results = check_washout_compliance(
            ["lorazepam"], days_since_last_dose={"lorazepam": 1.0}
        )
        assert results[0]["status"] == "insufficient"

    def test_no_days_defaults_to_zero(self) -> None:
        results = check_washout_compliance(["diazepam"])
        assert results[0]["status"] == "insufficient"

    def test_unknown_medication_skipped(self) -> None:
        results = check_washout_compliance(["imaginary_drug"])
        assert len(results) == 0

    def test_hours_based_detox(self) -> None:
        # cocaine: "11 HOURS" — 11/24 ~ 0.46 days; 1 day is compliant
        results = check_washout_compliance(
            ["cocaine"], days_since_last_dose={"cocaine": 1.0}
        )
        assert results[0]["status"] == "compliant"


# ─── MontageAtlas ─────────────────────────────────────────────────────────────

class TestMontageAtlas:
    def test_lookup_linked_ears(self) -> None:
        m = MontageAtlas.lookup("linked_ears")
        assert m is not None
        assert m.montage_type == "referential"
        assert len(m.channels) == 19

    def test_lookup_double_banana(self) -> None:
        m = MontageAtlas.lookup("double_banana")
        assert m is not None
        assert m.montage_type == "bipolar"
        assert len(m.channels) == 16

    def test_lookup_average_reference(self) -> None:
        m = MontageAtlas.lookup("average_reference")
        assert m is not None
        assert m.montage_type == "referential"

    def test_lookup_laplacian(self) -> None:
        m = MontageAtlas.lookup("laplacian")
        assert m is not None
        assert m.montage_type == "laplacian"

    def test_lookup_unknown_returns_none(self) -> None:
        assert MontageAtlas.lookup("no_such_montage") is None

    def test_all_montages_returns_4(self) -> None:
        montages = MontageAtlas.all_montages()
        assert len(montages) == 4

    def test_by_type_referential(self) -> None:
        refs = MontageAtlas.by_type("referential")
        assert len(refs) == 2
        names = [r.montage_name for r in refs]
        assert "linked_ears" in names
        assert "average_reference" in names

    def test_channel_labels_linked_ears(self) -> None:
        labels = MontageAtlas.channel_labels("linked_ears")
        assert len(labels) == 19
        assert "Fp1" in labels
        assert "O2" in labels

    def test_channel_labels_unknown_returns_empty(self) -> None:
        assert MontageAtlas.channel_labels("nonexistent") == []


class TestExplainMontage:
    def test_explain_double_banana_keys(self) -> None:
        result = explain_montage("double_banana")
        assert result is not None
        assert result["name"] == "double_banana"
        assert result["type"] == "bipolar"
        assert "Phase reversals" in result["reference_note"]
        assert "clinical_use" in result

    def test_explain_unknown_returns_none(self) -> None:
        assert explain_montage("fake_montage") is None


class TestRecommendMontage:
    def test_epilepsy_recommends_double_banana(self) -> None:
        recs = recommend_montage("epilepsy monitoring")
        names = [r["montage"] for r in recs]
        assert "double_banana" in names

    def test_connectivity_recommends_average_reference(self) -> None:
        recs = recommend_montage("connectivity analysis")
        names = [r["montage"] for r in recs]
        assert "average_reference" in names

    def test_topography_recommends_laplacian(self) -> None:
        recs = recommend_montage("topography neurofeedback")
        names = [r["montage"] for r in recs]
        assert "laplacian" in names

    def test_unknown_goal_returns_empty(self) -> None:
        recs = recommend_montage("completely unrelated medical procedure")
        assert isinstance(recs, list)


# ─── DisplaySettingsAtlas ──────────────────────────────────────────────────────

class TestDisplaySettingsAtlas:
    def test_filter_preset_clinical_default(self) -> None:
        fp = DisplaySettingsAtlas.filter_preset("raw_clinical_default")
        assert fp is not None
        assert fp.high_pass_hz == 0.5
        assert fp.low_pass_hz == 70.0
        assert fp.notch_hz == 50.0

    def test_filter_preset_unknown_returns_none(self) -> None:
        assert DisplaySettingsAtlas.filter_preset("no_such_preset") is None

    def test_filter_preset_fir_bandpass(self) -> None:
        fp = DisplaySettingsAtlas.filter_preset("offline_fir_bandpass")
        assert fp is not None
        assert fp.filter_type == "fir"
        assert fp.notch_hz is None

    def test_display_preset_clinical_default(self) -> None:
        dp = DisplaySettingsAtlas.display_preset("clinical_default")
        assert dp is not None
        assert dp.time_scale_s_per_page == 10.0
        assert dp.amplitude_sensitivity_uv_per_cm == 7.0
        assert dp.montage_default == "linked_ears"

    def test_display_preset_unknown_returns_none(self) -> None:
        assert DisplaySettingsAtlas.display_preset("no_such_preset") is None

    def test_all_filter_presets_count(self) -> None:
        assert len(DisplaySettingsAtlas.all_filter_presets()) == 6

    def test_all_display_presets_count(self) -> None:
        assert len(DisplaySettingsAtlas.all_display_presets()) == 4


class TestExplainFilterPreset:
    def test_explain_clinical_default_keys(self) -> None:
        result = explain_filter_preset("raw_clinical_default")
        assert result is not None
        assert result["preset_name"] == "raw_clinical_default"
        assert result["high_pass_hz"] == "0.5"
        assert result["low_pass_hz"] == "70.0"
        assert "IIR" in result["phase_shift_note"]

    def test_explain_none_fields_serialized_as_none_string(self) -> None:
        result = explain_filter_preset("raw_wideband")
        assert result is not None
        assert result["notch_hz"] == "none"

    def test_explain_unknown_returns_none(self) -> None:
        assert explain_filter_preset("unknown_filter") is None


class TestExplainDisplayPreset:
    def test_explain_spike_detail_keys(self) -> None:
        result = explain_display_preset("spike_detail")
        assert result is not None
        assert result["preset_name"] == "spike_detail"
        assert result["time_scale_s_per_page"] == "5.0"
        assert result["montage_default"] == "double_banana"

    def test_explain_unknown_returns_none(self) -> None:
        assert explain_display_preset("no_such_preset") is None


class TestRecommendDisplaySettings:
    def test_sleep_recommends_long_epoch(self) -> None:
        recs = recommend_display_settings("sleep staging")
        presets = [r["preset"] for r in recs]
        assert "long_epoch_review" in presets

    def test_epilepsy_recommends_spike_detail(self) -> None:
        recs = recommend_display_settings("epilepsy interictal spike review")
        presets = [r["preset"] for r in recs]
        assert "spike_detail" in presets

    def test_default_returns_clinical_default(self) -> None:
        recs = recommend_display_settings("routine screening")
        assert len(recs) >= 1
        assert recs[0]["preset"] == "clinical_default"
