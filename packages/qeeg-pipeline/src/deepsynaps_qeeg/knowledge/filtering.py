"""EEG filtering guide derived from QEEG courseware (Filtering EEG Brainwaves).

Provides deterministic guidance on analog and digital filter types,
recommended settings, and clinical cautions. Advisory only — actual
filter parameters depend on amplifier specifications and recording context.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable


@dataclass(frozen=True)
class FilterProfile:
    """A single filter type with settings, use-cases, and cautions."""

    filter_type: str
    full_name: str
    description: str
    typical_settings: tuple[str, ...]
    when_to_use: str
    cautions: str
    category: str  # analog, digital, analysis


_ATLAS: tuple[FilterProfile, ...] = (
    # ── Analog filters ────────────────────────────────────────────────────────
    FilterProfile(
        filter_type="high_pass",
        full_name="High-Pass Filter (Low-Frequency Filter, LFF)",
        description=(
            "Reduces low-frequency activity and allows higher frequencies to pass through. "
            "Keeps each EEG channel within its own horizontal area, eliminating upward or "
            "downward drift that may interfere with other channels."
        ),
        typical_settings=(
            "0.1 Hz — minimal attenuation; may still show slow drift",
            "1.0 Hz — standard initial setting; reduces eye-blink artifact while preserving most EEG",
            "3.0 Hz — further reduces slow-wave artifact; acceptable for sleep or high-amplitude recordings",
            "10 Hz — aggressive; used when client has very high amplitude slow activity; removes most delta/theta",
        ),
        when_to_use=(
            "Low-frequency artifacts such as eye blinks, sweat drift, or electrode movement. "
            "Consider the clinical question: if slow-wave analysis is needed, keep LFF at 1 Hz or lower."
        ),
        cautions=(
            "Setting LFF too high (e.g., 10 Hz) removes genuine delta and theta activity. "
            "Always think about what you want to keep versus what you want to get rid of."
        ),
        category="analog",
    ),
    FilterProfile(
        filter_type="low_pass",
        full_name="Low-Pass Filter (High-Frequency Filter, HFF)",
        description=(
            "Filters out high-frequency activity and allows low-frequency activity to pass through. "
            "Useful for removing muscle (EMG) artifact and electrical interference."
        ),
        typical_settings=(
            "70 Hz — standard initial setting; preserves all physiologic EEG",
            "35 Hz — reduces EMG artifact while preserving beta and gamma",
            "15 Hz — very aggressive; converts spiky muscle artifact into smoother waveforms but removes beta",
        ),
        when_to_use=(
            "50/60 Hz artifact, EMG/muscle tension, or when fast activity obscures slower rhythms. "
            "Use 70 Hz as default; reduce only if muscle artifact is severe."
        ),
        cautions=(
            "Aggressive HFF (e.g., 15 Hz) removes genuine beta and gamma activity. "
            "Muscle artifact converted to sinusoidal waveforms may be mistaken for cerebral activity."
        ),
        category="analog",
    ),
    FilterProfile(
        filter_type="bandpass",
        full_name="Band-Pass Filter",
        description=(
            "Combines high-pass and low-pass filters to allow only a specific range of frequencies. "
            "Bandwidth = absolute difference between HFF and LFF cutoff frequencies."
        ),
        typical_settings=(
            "LFF 1 Hz + HFF 70 Hz — typical initial EEG recording setting",
        ),
        when_to_use="Standard EEG acquisition; adjust bounds based on the frequency band of interest.",
        cautions="Narrow bandwidths remove clinically relevant frequencies outside the pass-band.",
        category="analog",
    ),
    FilterProfile(
        filter_type="notch",
        full_name="Notch Filter (Mains Rejection)",
        description=(
            "Attenuates a narrow band centered on the AC mains frequency: 60 Hz in North America, "
            "50 Hz in Europe. Shows a flat response at all frequencies except the nominal frequency, "
            "where there is a deep notch (complete attenuation)."
        ),
        typical_settings=(
            "60 Hz — North America",
            "50 Hz — Europe",
        ),
        when_to_use=(
            "When 50/60 Hz electrical interference contaminates the recording. "
            "First troubleshoot impedance and equipment grounding before relying on notch filters."
        ),
        cautions=(
            "Notch filters can mask underlying impedance problems. After applying a notch filter, "
            "re-inspect the raw EEG—if the trace is now 'clean' but single channels still look odd, "
            "suspect poor electrode contact rather than successful artifact removal."
        ),
        category="analog",
    ),
    FilterProfile(
        filter_type="ica",
        full_name="Independent Component Analysis (ICA)",
        description=(
            "A blind source-separation technique that isolates and removes non-neural artifacts "
            "from EEG signals. Conceptually, ICA assumes individual sources are statistically independent, "
            "making it possible to tease apart underlying components."
        ),
        typical_settings=(
            "Infomax or Extended-Infomax — common algorithms in EEGLAB/MNE",
            "AMICA — adaptive mixture ICA for non-stationary data",
        ),
        when_to_use=(
            "Eye blinks, lateral eye movements, muscle tension, and other artifacts that project to "
            "overlapping sets of electrodes. Preferred over template-based automatic rejection because "
            "it retains more genuine EEG data."
        ),
        cautions=(
            "ICA affects phase relationships of the EEG. Review raw EEG before and after ICA. "
            "Variability of ICA decomposition may impact results—manually verify rejected components. "
            "Amplitudes between 100-200 µV on frontal channels often indicate blink components."
        ),
        category="analysis",
    ),
    # ── Digital filters ───────────────────────────────────────────────────────
    FilterProfile(
        filter_type="iir",
        full_name="Infinite Impulse Response (IIR) Filter",
        description=(
            "Digital filter where the output is computed using current and previous inputs AND previous outputs. "
            "Results in sharp frequency cutoff characteristics. Favored over FIR because of shorter time delay."
        ),
        typical_settings=(
            "Butterworth — maximally flat passband",
            "Chebyshev — sharper roll-off with passband ripple",
        ),
        when_to_use="Standard noise filtering of one-dimensional signals in real-time or offline processing.",
        cautions="Non-linear phase response can distort waveform morphology; avoid for ERP latency analyses.",
        category="digital",
    ),
    FilterProfile(
        filter_type="fir",
        full_name="Finite Impulse Response (FIR) Filter",
        description=(
            "Digital filter with no feedback in its equation. Requires more coefficients than IIR to achieve "
            "the same frequency response, resulting in longer execution time and greater time delay."
        ),
        typical_settings=(
            "Hamming window — common for EEG band-pass filtering",
            "Kaiser window — adjustable trade-off between transition bandwidth and stop-band attenuation",
        ),
        when_to_use="When linear phase response is critical (e.g., ERP analysis, latency-sensitive measures).",
        cautions="Longer time delay than IIR; may not be suitable for real-time neurofeedback applications.",
        category="digital",
    ),
    FilterProfile(
        filter_type="fft",
        full_name="Fast-Fourier Transform (FFT) Analysis",
        description=(
            "Rapidly collects, digitizes, and decomposes EEG signals into constituent frequencies. "
            "Breaks down a complex waveform (the 'smoothie') into individual frequency components (the 'fruits')."
        ),
        typical_settings=(
            "Windowed FFT with Hanning or Hamming window to reduce spectral leakage",
            "Power spectral density (PSD) via Welch's method for smoother estimates",
        ),
        when_to_use=(
            "Spectral power estimation, qEEG absolute/relative power computation, and frequency-domain connectivity. "
            "The inverse FFT can reconstruct the time-domain signal from filtered frequency components."
        ),
        cautions=(
            "FFT assumes stationarity within the analysis window. Long windows improve frequency resolution "
            "but reduce time resolution (Heisenberg uncertainty)."
        ),
        category="digital",
    ),
    FilterProfile(
        filter_type="cmrr",
        full_name="Common Mode Rejection Ratio (CMRR)",
        description=(
            "An amplifier property that subtracts similar signals from active and reference electrodes, "
            "displaying only the difference. Larger CMRR values mean the amplifier effectively controls "
            "a wider range of artifacts."
        ),
        typical_settings=(
            "Modern amplifiers achieve >80 dB CMRR at 50/60 Hz",
            "Differential amplifiers with active grounding improve CMRR",
        ),
        when_to_use="Built into all modern EEG amplifiers; maximized by proper electrode preparation and cable management.",
        cautions=(
            "CMRR is degraded by impedance imbalances between electrodes. Good electrode contact, "
            "conductive gel, and short, unkinked cables are essential."
        ),
        category="analog",
    ),
)

_TYPE_INDEX: dict[str, FilterProfile] = {}
for _entry in _ATLAS:
    _TYPE_INDEX[_entry.filter_type] = _entry

_CATEGORY_INDEX: dict[str, list[FilterProfile]] = {}
for _entry in _ATLAS:
    _CATEGORY_INDEX.setdefault(_entry.category, []).append(_entry)


class FilterAtlas:
    """Read-only accessor for the filter atlas."""

    @staticmethod
    def lookup(filter_type: str) -> FilterProfile | None:
        return _TYPE_INDEX.get(filter_type)

    @staticmethod
    def by_category(category: str) -> list[FilterProfile]:
        return list(_CATEGORY_INDEX.get(category, []))

    @staticmethod
    def all_profiles() -> tuple[FilterProfile, ...]:
        return _ATLAS


def explain_filter(filter_type: str) -> dict[str, str] | None:
    """Return a dict describing *filter_type*, or None if unknown."""
    profile = FilterAtlas.lookup(filter_type)
    if profile is None:
        return None
    return {
        "filter_type": profile.filter_type,
        "full_name": profile.full_name,
        "description": profile.description,
        "typical_settings": "\n".join(profile.typical_settings),
        "when_to_use": profile.when_to_use,
        "cautions": profile.cautions,
        "category": profile.category,
    }


def recommend_filter_settings(
    artifact_concerns: Iterable[str],
    analysis_goals: Iterable[str] | None = None,
) -> dict[str, str]:
    """Return advisory filter recommendations based on stated concerns.

    Parameters
    ----------
    artifact_concerns : iterable of str
        e.g. ``["eye_blink", "muscle_tension", "60hz"]``.
    analysis_goals : iterable of str, optional
        e.g. ``["slow_wave_analysis", "beta_analysis"]``.

    Returns
    -------
    dict
        Keys ``lff_hz``, ``hff_hz``, ``notch``, ``ica``, ``rationale``.
    """
    concerns = {c.lower().replace(" ", "_") for c in (artifact_concerns or [])}
    goals = {g.lower().replace(" ", "_") for g in (analysis_goals or [])}

    lff = 1.0
    hff = 70.0
    notch = "off"
    use_ica = False
    reasons: list[str] = []

    if "eye_blink" in concerns or "ocular" in concerns:
        lff = max(lff, 1.0)
        use_ica = True
        reasons.append("Eye-blink artifact: LFF 1 Hz + ICA component removal.")

    if "muscle_tension" in concerns or "emg" in concerns or "myogenic" in concerns:
        hff = min(hff, 35.0)
        reasons.append("Muscle/EMG artifact: HFF 35 Hz to reduce temporalis interference.")

    if "60hz" in concerns or "50hz" in concerns or "electrical" in concerns:
        notch = "60 Hz" if "60hz" in concerns else "50 Hz"
        reasons.append(f"Mains interference: apply {notch} notch after checking impedance.")

    if "slow_wave_analysis" in goals or "delta" in goals or "theta" in goals:
        lff = min(lff, 1.0)
        reasons.append("Slow-wave analysis goal: keep LFF at 1 Hz or lower.")

    if "beta" in goals or "gamma" in goals:
        hff = max(hff, 70.0)
        reasons.append("High-frequency analysis goal: keep HFF at 70 Hz.")

    if not reasons:
        reasons.append("Default settings: LFF 1 Hz, HFF 70 Hz, no notch.")

    return {
        "lff_hz": str(lff),
        "hff_hz": str(hff),
        "notch": notch,
        "ica": "yes" if use_ica else "optional",
        "rationale": " ".join(reasons),
    }
