"""NeuroKit2 peripheral-physiology wrappers — ECG, EDA, RSP.

Only globals are HAS_NEUROKIT and nk (the module reference).
Public functions return Pydantic models; no pandas DataFrames on the surface.
"""
from __future__ import annotations

import numpy as np

try:
    import neurokit2 as nk
    HAS_NEUROKIT: bool = True
except ImportError:
    nk = None  # type: ignore[assignment]
    HAS_NEUROKIT = False

from app.errors import ApiServiceError
from app.services.neuroimaging.schemas import EcgFeatures, EdaFeatures, RspFeatures

_MIN_SECONDS = 5


def process_ecg(
    signal: list[float] | np.ndarray,
    sampling_rate: int,
) -> EcgFeatures:
    """Process an ECG signal and return key features.

    Parameters
    ----------
    signal:
        Raw ECG voltage samples (mV or arbitrary units).
    sampling_rate:
        Samples per second.

    Returns
    -------
    EcgFeatures with mean_hr_bpm, hrv_sdnn_ms, rpeak_count, signal_length.

    Raises
    ------
    ImportError if NeuroKit2 is not installed.
    ApiServiceError(400, "signal_too_short") if signal is shorter than 5 s.
    """
    if not HAS_NEUROKIT:
        raise ImportError("NeuroKit2 is not installed")

    sig = np.asarray(signal, dtype=float)
    signal_length = len(sig)

    if signal_length < _MIN_SECONDS * sampling_rate:
        raise ApiServiceError(
            status_code=400,
            code="signal_too_short",
            message=f"ECG signal must be at least {_MIN_SECONDS} seconds "
                    f"({_MIN_SECONDS * sampling_rate} samples at {sampling_rate} Hz); "
                    f"got {signal_length} samples.",
        )

    signals_df, info = nk.ecg_process(sig, sampling_rate=sampling_rate)

    rpeaks = info.get("ECG_R_Peaks", np.array([]))
    rpeak_count = int(len(rpeaks))

    mean_hr = float(np.nanmean(signals_df["ECG_Rate"].values))

    rr_intervals_ms = np.diff(rpeaks) / sampling_rate * 1000.0
    hrv_sdnn = float(np.std(rr_intervals_ms, ddof=1)) if len(rr_intervals_ms) > 1 else 0.0

    return EcgFeatures(
        mean_hr_bpm=mean_hr,
        hrv_sdnn_ms=hrv_sdnn,
        rpeak_count=rpeak_count,
        signal_length=signal_length,
    )


def process_eda(
    signal: list[float] | np.ndarray,
    sampling_rate: int,
) -> EdaFeatures:
    """Process an EDA (electrodermal activity) signal and return key features.

    Returns
    -------
    EdaFeatures with mean_tonic_microsiemens, scr_count, signal_length.

    Raises
    ------
    ImportError if NeuroKit2 is not installed.
    """
    if not HAS_NEUROKIT:
        raise ImportError("NeuroKit2 is not installed")

    sig = np.asarray(signal, dtype=float)
    signal_length = len(sig)

    signals_df, info = nk.eda_process(sig, sampling_rate=sampling_rate)

    mean_tonic = float(np.nanmean(signals_df["EDA_Tonic"].values))

    scr_onsets = info.get("SCR_Onsets", np.array([]))
    scr_count = int(len(scr_onsets))

    return EdaFeatures(
        mean_tonic_microsiemens=mean_tonic,
        scr_count=scr_count,
        signal_length=signal_length,
    )


def process_rsp(
    signal: list[float] | np.ndarray,
    sampling_rate: int,
) -> RspFeatures:
    """Process a respiratory signal and return key features.

    Returns
    -------
    RspFeatures with mean_rate_bpm, rrv_sdbb_ms, signal_length.

    Raises
    ------
    ImportError if NeuroKit2 is not installed.
    """
    if not HAS_NEUROKIT:
        raise ImportError("NeuroKit2 is not installed")

    sig = np.asarray(signal, dtype=float)
    signal_length = len(sig)

    signals_df, info = nk.rsp_process(sig, sampling_rate=sampling_rate)

    mean_rate = float(np.nanmean(signals_df["RSP_Rate"].values))

    peaks = info.get("RSP_Peaks", np.array([]))
    breath_intervals_ms = np.diff(peaks) / sampling_rate * 1000.0
    rrv_sdbb = float(np.std(breath_intervals_ms, ddof=1)) if len(breath_intervals_ms) > 1 else 0.0

    return RspFeatures(
        mean_rate_bpm=mean_rate,
        rrv_sdbb_ms=rrv_sdbb,
        signal_length=signal_length,
    )
