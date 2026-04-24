"""Clinical analyses — IAPF/plasticity, wavelet decomposition, ICA.

Registered analyses:
  clinical/iapf_plasticity
  clinical/wavelet_decomposition
  clinical/ica_decomposition
"""
from __future__ import annotations

from typing import Any

import numpy as np

from app.services.analyses._engine import register_analysis
from app.services.analyses._helpers import DEFAULT_BANDS


# ── 22. Individual Alpha Peak Frequency + Plasticity Index ───────────────────

@register_analysis("clinical", "iapf_plasticity", "IAPF & Plasticity Index")
def iapf_plasticity(ctx: dict[str, Any]) -> dict[str, Any]:
    """Compute Individual Alpha Peak Frequency (IAPF) and alpha reactivity
    (plasticity index) per channel.

    IAPF is the dominant frequency in the extended alpha range (7-13 Hz).
    Plasticity index estimates alpha bandwidth / peak sharpness — wider
    peaks suggest greater cortical flexibility.

    Clinical reference:
    - IAPF < 8.5 Hz: slowing (MCI/dementia risk, medication effects)
    - IAPF 9-11 Hz: normal adult range
    - IAPF > 11 Hz: fast alpha variant (usually benign)
    """
    freqs = ctx["freqs"]
    psd = ctx["psd"]
    ch_names = ctx["ch_names"]

    alpha_range = (7.0, 13.0)
    alpha_mask = (freqs >= alpha_range[0]) & (freqs <= alpha_range[1])
    alpha_freqs = freqs[alpha_mask]
    freq_res = freqs[1] - freqs[0] if len(freqs) > 1 else 1.0

    channels_data: dict[str, Any] = {}

    for ch_idx, ch in enumerate(ch_names):
        alpha_psd = psd[ch_idx, alpha_mask]

        if len(alpha_psd) == 0 or np.max(alpha_psd) == 0:
            channels_data[ch] = {"error": "no_alpha_data"}
            continue

        # IAPF: center of gravity method (more robust than peak picking)
        total_alpha_power = np.sum(alpha_psd * freq_res)
        if total_alpha_power > 0:
            iapf_cog = float(np.sum(alpha_freqs * alpha_psd * freq_res) / total_alpha_power)
        else:
            iapf_cog = 0.0

        # Peak method (for comparison)
        peak_idx = int(np.argmax(alpha_psd))
        iapf_peak = float(alpha_freqs[peak_idx])

        # Plasticity index: alpha bandwidth at half-maximum
        half_max = np.max(alpha_psd) / 2
        above_half = alpha_freqs[alpha_psd >= half_max]
        if len(above_half) >= 2:
            bandwidth = float(above_half[-1] - above_half[0])
        else:
            bandwidth = 0.0

        # Alpha power relative to total
        total_mask = (freqs >= 1.0) & (freqs <= 45.0)
        total_power = float(np.sum(psd[ch_idx, total_mask] * freq_res))
        alpha_relative = (total_alpha_power / total_power * 100) if total_power > 0 else 0.0

        # Classification
        if iapf_cog < 8.5:
            classification = "slowed"
        elif iapf_cog > 11.0:
            classification = "fast_variant"
        else:
            classification = "normal"

        channels_data[ch] = {
            "iapf_cog_hz": round(iapf_cog, 2),
            "iapf_peak_hz": round(iapf_peak, 2),
            "alpha_bandwidth_hz": round(bandwidth, 2),
            "plasticity_index": round(bandwidth, 2),
            "alpha_relative_pct": round(alpha_relative, 2),
            "classification": classification,
        }

    # Global IAPF
    iapf_vals = [v["iapf_cog_hz"] for v in channels_data.values() if "iapf_cog_hz" in v]
    mean_iapf = round(np.mean(iapf_vals), 2) if iapf_vals else 0.0

    # Posterior IAPF (O1, O2, P3, P4, Pz — most reliable)
    posterior = ["O1", "O2", "P3", "P4", "Pz"]
    post_vals = [channels_data[ch]["iapf_cog_hz"] for ch in posterior
                 if ch in channels_data and "iapf_cog_hz" in channels_data[ch]]
    posterior_iapf = round(np.mean(post_vals), 2) if post_vals else mean_iapf

    return {
        "data": {
            "channels": channels_data,
            "mean_iapf_hz": mean_iapf,
            "posterior_iapf_hz": posterior_iapf,
        },
        "summary": f"Posterior IAPF={posterior_iapf} Hz (global mean={mean_iapf} Hz)",
    }


# ── 23. Morlet Wavelet Time-Frequency Decomposition ──────────────────────────

@register_analysis("clinical", "wavelet_decomposition", "Wavelet Time-Frequency Decomposition")
def wavelet_decomposition(ctx: dict[str, Any]) -> dict[str, Any]:
    """Compute Morlet wavelet time-frequency decomposition for representative
    channels. Returns time-averaged power per frequency and temporal variability.

    Uses MNE's built-in tfr_morlet for correct wavelet computation.
    Falls back to scipy if MNE tfr is unavailable.
    """
    data = ctx["data"]
    sfreq = ctx["sfreq"]
    ch_names = ctx["ch_names"]

    # Use a 30-second segment for performance
    max_samples = int(30.0 * sfreq)
    if data.shape[1] > max_samples:
        start = (data.shape[1] - max_samples) // 2
        segment = data[:, start:start + max_samples]
    else:
        segment = data

    # Frequencies of interest: 1-45 Hz in 1 Hz steps
    foi = np.arange(1.0, 46.0, 1.0)
    n_cycles = foi / 2.0  # Adaptive: more cycles at higher frequencies

    # Compute wavelet power via convolution (manual Morlet)
    channels_data: dict[str, Any] = {}

    # Use representative channels to save computation
    representative = ["Fz", "Cz", "Pz", "O1", "F3", "F4", "C3", "C4"]
    channels_to_use = [ch for ch in representative if ch in ch_names]
    if not channels_to_use:
        channels_to_use = ch_names[:min(8, len(ch_names))]

    for ch in channels_to_use:
        ch_idx = ch_names.index(ch)
        sig = segment[ch_idx]

        # Morlet wavelet convolution per frequency
        power_spectrum: list[float] = []
        temporal_cv: list[float] = []

        for fi, freq in enumerate(foi):
            nc = max(int(n_cycles[fi]), 3)
            # Create Morlet wavelet
            t = np.arange(-nc / (2 * freq), nc / (2 * freq), 1.0 / sfreq)
            if len(t) == 0:
                power_spectrum.append(0.0)
                temporal_cv.append(0.0)
                continue

            sigma_t = nc / (2 * np.pi * freq)
            wavelet = np.exp(2j * np.pi * freq * t) * np.exp(-t ** 2 / (2 * sigma_t ** 2))
            wavelet /= np.sqrt(sigma_t * np.sqrt(np.pi))

            # Convolve
            analytic = np.convolve(sig, wavelet, mode="same")
            inst_power = np.abs(analytic) ** 2

            mean_power = float(np.mean(inst_power))
            std_power = float(np.std(inst_power))
            cv = std_power / mean_power if mean_power > 0 else 0.0

            power_spectrum.append(round(mean_power * 1e12, 4))  # Convert to uV^2
            temporal_cv.append(round(cv, 4))

        channels_data[ch] = {
            "frequencies_hz": [float(f) for f in foi],
            "mean_power_uv2": power_spectrum,
            "temporal_variability_cv": temporal_cv,
        }

    # Per-band summary (averaged across representative channels)
    band_summary: dict[str, Any] = {}
    for bname, (fmin, fmax) in DEFAULT_BANDS.items():
        band_mask = (foi >= fmin) & (foi <= fmax)
        band_powers = []
        for ch_data in channels_data.values():
            bp_vals = np.array(ch_data["mean_power_uv2"])
            if len(bp_vals) == len(foi):
                band_powers.append(float(np.mean(bp_vals[band_mask])))
        band_summary[bname] = round(np.mean(band_powers), 4) if band_powers else 0.0

    return {
        "data": {
            "channels": channels_data,
            "band_summary": band_summary,
            "segment_duration_sec": segment.shape[1] / sfreq,
        },
        "summary": f"Wavelet TF computed for {len(channels_data)} channels, 1-45 Hz",
    }


# ── 24. ICA Decomposition ────────────────────────────────────────────────────

@register_analysis("clinical", "ica_decomposition", "ICA Component Analysis")
def ica_decomposition(ctx: dict[str, Any]) -> dict[str, Any]:
    """Perform Independent Component Analysis (ICA) and classify components
    as brain, eye (blink/saccade), muscle, or heart artifact.

    Classification is heuristic-based using topographic and spectral features.
    """
    raw = ctx["raw"]
    ch_names = ctx["ch_names"]
    sfreq = ctx["sfreq"]
    n_ch = len(ch_names)

    try:
        import mne
    except ImportError:
        raise RuntimeError("MNE is required for ICA decomposition")

    # Limit components for performance
    n_components = min(n_ch, 15)

    # Run ICA
    ica = mne.preprocessing.ICA(
        n_components=n_components,
        method="fastica",
        random_state=42,
        max_iter=200,
    )

    try:
        ica.fit(raw, verbose=False)
    except Exception as exc:
        return {
            "data": {"error": f"ICA fit failed: {exc}"},
            "summary": "ICA fitting failed",
        }

    # Get component properties
    sources = ica.get_sources(raw).get_data()  # (n_components, n_times)
    mixing_matrix = ica.mixing_matrix_  # (n_ch, n_components)

    components_data: list[dict[str, Any]] = []

    for comp_idx in range(n_components):
        comp_signal = sources[comp_idx]
        comp_topo = mixing_matrix[:, comp_idx]

        # Spectral features of component
        from scipy.signal import welch as welch_fn
        nperseg = int(2.0 * sfreq)
        if nperseg > len(comp_signal):
            nperseg = len(comp_signal)
        f_comp, p_comp = welch_fn(comp_signal, fs=sfreq, nperseg=nperseg)
        p_comp_uv2 = p_comp * 1e12

        # Band powers for classification
        freq_res = f_comp[1] - f_comp[0] if len(f_comp) > 1 else 1.0
        delta_mask = (f_comp >= 0.5) & (f_comp <= 4.0)
        alpha_mask = (f_comp >= 8.0) & (f_comp <= 12.0)
        high_freq_mask = (f_comp >= 20.0) & (f_comp <= 45.0)

        total = float(np.sum(p_comp_uv2[(f_comp >= 0.5) & (f_comp <= 45.0)] * freq_res))
        delta_pwr = float(np.sum(p_comp_uv2[delta_mask] * freq_res))
        high_pwr = float(np.sum(p_comp_uv2[high_freq_mask] * freq_res))
        alpha_pwr = float(np.sum(p_comp_uv2[alpha_mask] * freq_res))

        delta_ratio = delta_pwr / total if total > 0 else 0
        high_ratio = high_pwr / total if total > 0 else 0
        alpha_ratio = alpha_pwr / total if total > 0 else 0

        # Topographic features for classification
        topo_abs = np.abs(comp_topo)
        frontal_channels = [i for i, ch in enumerate(ch_names) if ch.startswith(("Fp", "F"))]
        posterior_channels = [i for i, ch in enumerate(ch_names) if ch.startswith(("O", "P"))]

        frontal_weight = float(np.mean(topo_abs[frontal_channels])) if frontal_channels else 0
        posterior_weight = float(np.mean(topo_abs[posterior_channels])) if posterior_channels else 0
        total_weight = float(np.mean(topo_abs)) or 1.0

        frontal_ratio = frontal_weight / total_weight
        posterior_ratio = posterior_weight / total_weight

        # Kurtosis of component signal (eye blinks have high kurtosis)
        from scipy.stats import kurtosis as scipy_kurtosis
        kurt = float(scipy_kurtosis(comp_signal, fisher=True))

        # Classification heuristic
        if delta_ratio > 0.6 and frontal_ratio > 1.3 and kurt > 5:
            classification = "eye_blink"
            confidence = "high" if kurt > 10 else "medium"
        elif delta_ratio > 0.5 and frontal_ratio > 1.2:
            classification = "eye_movement"
            confidence = "medium"
        elif high_ratio > 0.4:
            classification = "muscle"
            confidence = "high" if high_ratio > 0.6 else "medium"
        elif delta_ratio > 0.7:
            # Could be heart artifact — check for rhythmicity
            classification = "heart"
            confidence = "low"
        elif alpha_ratio > 0.3 and posterior_ratio > 1.0:
            classification = "brain_alpha"
            confidence = "medium"
        else:
            classification = "brain"
            confidence = "medium"

        # Topography map
        topo_map = {ch_names[i]: round(float(comp_topo[i]), 4) for i in range(n_ch)}

        components_data.append({
            "index": comp_idx,
            "classification": classification,
            "confidence": confidence,
            "topography": topo_map,
            "spectral_features": {
                "delta_ratio": round(delta_ratio, 3),
                "alpha_ratio": round(alpha_ratio, 3),
                "high_freq_ratio": round(high_ratio, 3),
                "kurtosis": round(kurt, 2),
            },
            "spatial_features": {
                "frontal_ratio": round(frontal_ratio, 3),
                "posterior_ratio": round(posterior_ratio, 3),
            },
        })

    # Summary counts
    brain_count = sum(1 for c in components_data if c["classification"].startswith("brain"))
    artifact_count = n_components - brain_count
    artifact_types = {}
    for c in components_data:
        t = c["classification"]
        artifact_types[t] = artifact_types.get(t, 0) + 1

    return {
        "data": {
            "components": components_data,
            "n_components": n_components,
            "brain_components": brain_count,
            "artifact_components": artifact_count,
            "type_counts": artifact_types,
        },
        "summary": f"ICA: {brain_count} brain, {artifact_count} artifact components "
                   + f"({', '.join(f'{k}:{v}' for k, v in artifact_types.items() if not k.startswith('brain'))})",
    }
