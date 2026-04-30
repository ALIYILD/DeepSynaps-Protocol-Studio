"""Standard EEG display and acquisition settings for raw data viewing.

Derived from WinEEG 3.11.24 manual (Mitsar/Neurosoft) and ACNS guidelines.
Provides deterministic presets for time scale, amplitude sensitivity, and
digital filtering parameters used in clinical EEG raw data display.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class FilterPreset:
    """A digital filter configuration for raw EEG display or analysis."""

    preset_name: str
    filter_type: str  # "iir" or "fir"
    high_pass_hz: float | None
    low_pass_hz: float | None
    notch_hz: float | None
    notch_bandwidth: str | None
    order_description: str
    phase_shift_note: str
    use_case: str


@dataclass(frozen=True)
class DisplayPreset:
    """A complete display configuration for raw EEG traces."""

    preset_name: str
    time_scale_s_per_page: float
    amplitude_sensitivity_uv_per_cm: float
    filter_preset: str
    montage_default: str
    description: str


# ── Filter presets (from WinEEG manual) ─────────────────────────────────────

_FILTER_PRESETS: tuple[FilterPreset, ...] = (
    FilterPreset(
        preset_name="raw_clinical_default",
        filter_type="iir",
        high_pass_hz=0.5,
        low_pass_hz=70.0,
        notch_hz=50.0,
        notch_bandwidth="45-55 Hz",
        order_description="HP 1st order (6 dB/oct), LP 2nd order (12 dB/oct), Notch 12th order (>40 dB)",
        phase_shift_note="IIR filters introduce phase shift; acceptable for clinical visual review.",
        use_case="Standard clinical raw EEG viewing on screen.",
    ),
    FilterPreset(
        preset_name="raw_wideband",
        filter_type="iir",
        high_pass_hz=0.1,
        low_pass_hz=100.0,
        notch_hz=None,
        notch_bandwidth=None,
        order_description="HP 1st order, LP 2nd order",
        phase_shift_note="Minimal high-pass cutoff preserves slow fluctuations; no notch avoids phase distortion at line frequency.",
        use_case="Research acquisition where line interference is minimal or removed offline.",
    ),
    FilterPreset(
        preset_name="raw_epilepsy_review",
        filter_type="iir",
        high_pass_hz=1.0,
        low_pass_hz=30.0,
        notch_hz=50.0,
        notch_bandwidth="45-55 Hz",
        order_description="HP 1st order, LP 2nd order, Notch 12th order",
        phase_shift_note="1 Hz high-pass reduces slow drift while preserving spike waveforms.",
        use_case="Epileptiform discharge review; spike detection is sensitive to slow drift.",
    ),
    FilterPreset(
        preset_name="raw_sleep_review",
        filter_type="iir",
        high_pass_hz=0.3,
        low_pass_hz=30.0,
        notch_hz=50.0,
        notch_bandwidth="45-55 Hz",
        order_description="HP 1st order, LP 2nd order, Notch 12th order",
        phase_shift_note="Slightly lower high-pass than epilepsy preset to preserve slow sleep transients.",
        use_case="Sleep staging and sleep disorder review.",
    ),
    FilterPreset(
        preset_name="offline_fir_bandpass",
        filter_type="fir",
        high_pass_hz=1.0,
        low_pass_hz=40.0,
        notch_hz=None,
        notch_bandwidth=None,
        order_description="FIR zero-phase filter (computationally expensive, not for real-time)",
        phase_shift_note="Zero phase shift; preferred for quantitative analysis and connectivity.",
        use_case="Offline spectral analysis, ERP/ERD computation, connectivity analysis.",
    ),
    FilterPreset(
        preset_name="notch_harmonic_suppression",
        filter_type="iir",
        high_pass_hz=None,
        low_pass_hz=None,
        notch_hz=50.0,
        notch_bandwidth="45-55 & 95-105 Hz",
        order_description="12th order notch, dual-band for fundamental + 2nd harmonic",
        phase_shift_note="Suppresses both 50 Hz fundamental and 100 Hz harmonic simultaneously.",
        use_case="Environments with severe AC line interference and harmonic contamination.",
    ),
)

# ── Display presets ─────────────────────────────────────────────────────────

_DISPLAY_PRESETS: tuple[DisplayPreset, ...] = (
    DisplayPreset(
        preset_name="clinical_default",
        time_scale_s_per_page=10.0,
        amplitude_sensitivity_uv_per_cm=7.0,
        filter_preset="raw_clinical_default",
        montage_default="linked_ears",
        description="Standard 10-second page, 7 µV/mm sensitivity, linked ears referential montage.",
    ),
    DisplayPreset(
        preset_name="long_epoch_review",
        time_scale_s_per_page=20.0,
        amplitude_sensitivity_uv_per_cm=7.0,
        filter_preset="raw_clinical_default",
        montage_default="double_banana",
        description="20-second page for background rhythm assessment over longer intervals.",
    ),
    DisplayPreset(
        preset_name="high_amplitude_slow",
        time_scale_s_per_page=10.0,
        amplitude_sensitivity_uv_per_cm=15.0,
        filter_preset="raw_sleep_review",
        montage_default="linked_ears",
        description="15 µV/mm for high-amplitude slow activity (pediatric or encephalopathy).",
    ),
    DisplayPreset(
        preset_name="spike_detail",
        time_scale_s_per_page=5.0,
        amplitude_sensitivity_uv_per_cm=5.0,
        filter_preset="raw_epilepsy_review",
        montage_default="double_banana",
        description="5-second page, 5 µV/mm for detailed spike and sharp-wave morphology.",
    ),
)

_FILTER_INDEX: dict[str, FilterPreset] = {}
for _fp in _FILTER_PRESETS:
    _FILTER_INDEX[_fp.preset_name.lower()] = _fp

_DISPLAY_INDEX: dict[str, DisplayPreset] = {}
for _dp in _DISPLAY_PRESETS:
    _DISPLAY_INDEX[_dp.preset_name.lower()] = _dp


class DisplaySettingsAtlas:
    """Read-only accessor for EEG display and filter presets."""

    @staticmethod
    def filter_preset(name: str) -> FilterPreset | None:
        return _FILTER_INDEX.get(name.lower())

    @staticmethod
    def display_preset(name: str) -> DisplayPreset | None:
        return _DISPLAY_INDEX.get(name.lower())

    @staticmethod
    def all_filter_presets() -> tuple[FilterPreset, ...]:
        return _FILTER_PRESETS

    @staticmethod
    def all_display_presets() -> tuple[DisplayPreset, ...]:
        return _DISPLAY_PRESETS


def explain_filter_preset(preset_name: str) -> dict[str, str] | None:
    """Return filter parameters as a plain dict, or None."""
    fp = DisplaySettingsAtlas.filter_preset(preset_name)
    if fp is None:
        return None
    return {
        "preset_name": fp.preset_name,
        "filter_type": fp.filter_type,
        "high_pass_hz": str(fp.high_pass_hz) if fp.high_pass_hz else "none",
        "low_pass_hz": str(fp.low_pass_hz) if fp.low_pass_hz else "none",
        "notch_hz": str(fp.notch_hz) if fp.notch_hz else "none",
        "notch_bandwidth": fp.notch_bandwidth or "none",
        "order_description": fp.order_description,
        "phase_shift_note": fp.phase_shift_note,
        "use_case": fp.use_case,
    }


def explain_display_preset(preset_name: str) -> dict[str, str] | None:
    """Return display parameters as a plain dict, or None."""
    dp = DisplaySettingsAtlas.display_preset(preset_name)
    if dp is None:
        return None
    return {
        "preset_name": dp.preset_name,
        "time_scale_s_per_page": str(dp.time_scale_s_per_page),
        "amplitude_sensitivity_uv_per_cm": str(dp.amplitude_sensitivity_uv_per_cm),
        "filter_preset": dp.filter_preset,
        "montage_default": dp.montage_default,
        "description": dp.description,
    }


def recommend_display_settings(recording_context: str) -> list[dict[str, str]]:
    """Advisory display preset recommendations based on recording context."""
    ctx = recording_context.lower()
    recs: list[dict[str, str]] = []
    if any(k in ctx for k in ("sleep", "sedated", "coma", "slow")):
        recs.append({"preset": "long_epoch_review", "reason": "Longer pages suit slow background assessment"})
        recs.append({"preset": "high_amplitude_slow", "reason": "Higher sensitivity captures slow high-amplitude activity"})
    elif any(k in ctx for k in ("spike", "seizure", "epilepsy", "ictal", "interictal")):
        recs.append({"preset": "spike_detail", "reason": "High temporal resolution for spike morphology"})
    else:
        recs.append({"preset": "clinical_default", "reason": "Standard 10 s / 7 µV/mm is the universal default"})
    return recs
