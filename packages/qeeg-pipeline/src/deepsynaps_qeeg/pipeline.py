"""Pipeline orchestrator — wire the stages together.

Each stage is wrapped in a try/except so a failure in a heavy stage (source
localization, normative lookup) does not break the API worker. Failures are
recorded in ``PipelineResult.quality['stage_errors']`` and dependent stages
are skipped.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from . import (
    BANDPASS,
    EPOCH_LENGTH_SEC,
    EPOCH_OVERLAP,
    FREQ_BANDS,
    NOTCH_HZ,
    RESAMPLE_SFREQ,
    __version__ as PIPELINE_VERSION,
)
from .io import load_raw

log = logging.getLogger(__name__)


@dataclass
class PipelineResult:
    """Bundle returned by :func:`run_full_pipeline`. Matches ``CONTRACT.md §1``."""

    features: dict[str, Any] = field(default_factory=dict)
    zscores: dict[str, Any] = field(default_factory=dict)
    flagged_conditions: list[str] = field(default_factory=list)
    quality: dict[str, Any] = field(default_factory=dict)
    report_html: str | None = None
    report_pdf_path: Path | None = None


def run_full_pipeline(
    eeg_path: str | Path,
    *,
    age: int | None = None,
    sex: str | None = None,
    notch_hz: float = NOTCH_HZ,
    bandpass: tuple[float, float] = BANDPASS,
    resample: float = RESAMPLE_SFREQ,
    epoch_len: float = EPOCH_LENGTH_SEC,
    overlap: float = EPOCH_OVERLAP,
    do_source_localization: bool = True,
    do_report: bool = False,
    out_dir: str | Path | None = None,
) -> PipelineResult:
    """End-to-end qEEG pipeline.

    Parameters
    ----------
    eeg_path : str or Path
        File on disk (.edf / .vhdr / .bdf / .set / .fif).
    age : int or None
        Subject age (years). Required for normative z-scoring.
    sex : str or None
        'M' or 'F'. Required for normative z-scoring.
    notch_hz : float
        Notch frequency in Hz. Default from :data:`NOTCH_HZ`.
    bandpass : tuple of (float, float)
        Filter band.
    resample : float
        Target sampling rate.
    epoch_len : float
        Epoch duration in seconds.
    overlap : float
        Epoch overlap fraction.
    do_source_localization : bool
        Run eLORETA on the fsaverage template. Heavy; set ``False`` for quick
        smoke tests.
    do_report : bool
        Render an HTML/PDF report into ``out_dir``.
    out_dir : str, Path, or None
        Output directory for the report. Required when ``do_report=True``.

    Returns
    -------
    PipelineResult
    """
    from . import artifacts, preprocess
    from .features import asymmetry as asymmetry_mod
    from .features import connectivity as connectivity_mod
    from .features import graph as graph_mod
    from .features import spectral as spectral_mod
    from .normative import zscore as zscore_mod

    result = PipelineResult()
    result.quality["pipeline_version"] = PIPELINE_VERSION
    result.quality["stage_errors"] = {}

    # --- Stage 1 — I/O ---
    raw = load_raw(eeg_path)
    result.quality["n_channels_input"] = len(raw.ch_names)

    # --- Stage 2 — preprocess ---
    try:
        raw_clean, prep_quality = preprocess.run(
            raw, bandpass=bandpass, notch=notch_hz, resample=resample
        )
        result.quality.update(prep_quality)
    except Exception as exc:
        log.exception("Preprocess stage failed")
        result.quality["stage_errors"]["preprocess"] = str(exc)
        result.quality["pipeline_version"] = PIPELINE_VERSION
        return result

    # --- Stage 3 — artifacts + epoching ---
    try:
        epochs, art_quality = artifacts.run(
            raw_clean, epoch_len=epoch_len, overlap=overlap, quality=result.quality
        )
        result.quality.update(art_quality)
    except Exception as exc:
        log.exception("Artifact stage failed")
        result.quality["stage_errors"]["artifacts"] = str(exc)
        return result

    ch_names = list(epochs.ch_names)

    # --- Stage 4 — features ---
    features: dict[str, Any] = {}
    try:
        features["spectral"] = spectral_mod.compute(epochs, FREQ_BANDS)
    except Exception as exc:
        log.exception("Spectral features failed")
        result.quality["stage_errors"]["spectral"] = str(exc)
        features["spectral"] = {"bands": {}, "aperiodic": {}, "peak_alpha_freq": {}}

    try:
        features["connectivity"] = connectivity_mod.compute(epochs, FREQ_BANDS)
    except Exception as exc:
        log.exception("Connectivity features failed")
        result.quality["stage_errors"]["connectivity"] = str(exc)
        features["connectivity"] = {"wpli": {}, "coherence": {}, "channels": ch_names}

    try:
        features["asymmetry"] = asymmetry_mod.compute(features["spectral"], ch_names)
    except Exception as exc:
        log.exception("Asymmetry features failed")
        result.quality["stage_errors"]["asymmetry"] = str(exc)
        features["asymmetry"] = {"frontal_alpha_F3_F4": None, "frontal_alpha_F7_F8": None}

    try:
        features["graph"] = graph_mod.compute(features["connectivity"])
    except Exception as exc:
        log.exception("Graph metrics failed")
        result.quality["stage_errors"]["graph"] = str(exc)
        features["graph"] = {}

    # --- Stage 5 — source localization (optional) ---
    if do_source_localization:
        try:
            from .source import eloreta as eloreta_mod

            features["source"] = eloreta_mod.compute(epochs, bands=FREQ_BANDS)
        except Exception as exc:
            log.warning("Source localization skipped (%s)", exc)
            result.quality["stage_errors"]["source"] = str(exc)
            features["source"] = {"roi_band_power": {}, "method": None}
    else:
        features["source"] = {"roi_band_power": {}, "method": None}

    result.features = features

    # --- Stage 6 — normative z-scoring ---
    try:
        result.zscores = zscore_mod.compute(features, age=age, sex=sex)
    except Exception as exc:
        log.exception("Normative stage failed")
        result.quality["stage_errors"]["normative"] = str(exc)
        result.zscores = {"spectral": {"bands": {}}, "aperiodic": {"slope": {}},
                          "flagged": [], "norm_db_version": "unknown"}

    # Flagged conditions are a consumer-provided mapping; default to [].
    result.flagged_conditions = []

    # --- Stage 7 — report (optional) ---
    if do_report:
        try:
            from .report import generate as report_mod

            if out_dir is None:
                raise ValueError("out_dir is required when do_report=True")
            html, pdf_path = report_mod.build(result, out_dir=Path(out_dir), ch_names=ch_names)
            result.report_html = html
            result.report_pdf_path = pdf_path
        except Exception as exc:
            log.warning("Report stage failed (%s)", exc)
            result.quality["stage_errors"]["report"] = str(exc)

    # Re-stamp pipeline version at the end (avoid being clobbered by sub-dicts).
    result.quality["pipeline_version"] = PIPELINE_VERSION
    return result
