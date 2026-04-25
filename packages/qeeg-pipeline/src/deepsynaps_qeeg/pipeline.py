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
from typing import TYPE_CHECKING, Any

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

if TYPE_CHECKING:  # pragma: no cover
    import mne


@dataclass
class PipelineResult:
    """Bundle returned by :func:`run_full_pipeline`. Matches ``CONTRACT.md §1``."""

    features: dict[str, Any] = field(default_factory=dict)
    zscores: dict[str, Any] = field(default_factory=dict)
    embeddings: dict[str, Any] = field(default_factory=dict)
    flagged_conditions: list[str] = field(default_factory=list)
    quality: dict[str, Any] = field(default_factory=dict)
    source_estimates: dict[str, "mne.SourceEstimate"] = field(default_factory=dict)
    longitudinal: dict[str, Any] = field(default_factory=dict)
    report_html: str | None = None
    report_pdf_path: Path | None = None


def run_full_pipeline(
    eeg_path: str | Path,
    *,
    age: int | None = None,
    sex: str | None = None,
    prev_session_id: str | None = None,
    recording_state: str | None = None,
    notch_hz: float = NOTCH_HZ,
    bandpass: tuple[float, float] = BANDPASS,
    resample: float = RESAMPLE_SFREQ,
    epoch_len: float = EPOCH_LENGTH_SEC,
    overlap: float = EPOCH_OVERLAP,
    do_source_localization: bool = True,
    compute_embeddings: bool = False,
    do_report: bool = False,
    out_dir: str | Path | None = None,
    user_overrides: dict[str, Any] | None = None,
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
    user_overrides : dict or None
        Manual cleaning overrides from the interactive Raw Data viewer.
        Supported keys: ``bad_channels``, ``annotations``,
        ``ica_exclude``, ``ica_keep``, ``bandpass``, ``notch``.

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
    if recording_state:
        # Stored for longitudinal state-mismatch validation (e.g. eyes-open vs eyes-closed).
        result.quality["recording_state"] = str(recording_state)

    # --- Stage 1 — I/O ---
    raw = load_raw(eeg_path)
    result.quality["n_channels_input"] = len(raw.ch_names)

    # --- Stage 1b — apply user overrides (interactive cleaning) ---
    if user_overrides:
        import mne as _mne

        if user_overrides.get("bad_channels"):
            raw.info["bads"] = list(user_overrides["bad_channels"])
            log.info("User overrides: marked %d bad channels", len(raw.info["bads"]))
        for ann in user_overrides.get("annotations", []):
            raw.annotations.append(
                float(ann["onset"]),
                float(ann["duration"]),
                str(ann.get("description", "BAD_user")),
            )
        if user_overrides.get("bandpass"):
            bandpass = tuple(user_overrides["bandpass"])
        if user_overrides.get("notch") is not None:
            notch_hz = float(user_overrides["notch"])
        result.quality["user_overrides_applied"] = True

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
        ica_exclude_override = None
        ica_keep_override = None
        if user_overrides:
            ica_exclude_override = user_overrides.get("ica_exclude")
            ica_keep_override = user_overrides.get("ica_keep")
        epochs, art_quality = artifacts.run(
            raw_clean, epoch_len=epoch_len, overlap=overlap, quality=result.quality,
            ica_exclude_override=ica_exclude_override,
            ica_keep_override=ica_keep_override,
        )
        result.quality.update(art_quality)
    except Exception as exc:
        log.exception("Artifact stage failed")
        result.quality["stage_errors"]["artifacts"] = str(exc)
        return result

    ch_names = list(epochs.ch_names)

    # --- Stage 3b — foundation-model embeddings (optional) ---
    if compute_embeddings:
        try:
            import numpy as np

            from .embeddings import get_embedder

            # Default: compute both allowlisted embedders. Consumers can ignore ones they don't need.
            labram = get_embedder("labram-base")
            eegpt = get_embedder("eegpt-base")
            result.embeddings = {
                "labram-base": labram.embed_recording(raw_clean),
                "eegpt-base": eegpt.embed_recording(raw_clean),
            }

            if out_dir is not None:
                outp = Path(out_dir)
                outp.mkdir(parents=True, exist_ok=True)
                np.savez_compressed(outp / "embeddings.npz", **result.embeddings)
        except Exception as exc:
            log.warning("Embedding stage failed (%s)", exc)
            result.quality["stage_errors"]["embeddings"] = str(exc)
            result.embeddings = {}

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
            if not _should_run_source_localization(epochs, result.quality):
                features["source"] = {"method": None, "roi_table": [], "figures": {}}
            else:
                import numpy as np

                from .source.forward import build_forward_model
                from .source.inverse import apply_inverse, compute_inverse_operator
                from .source.noise import estimate_noise_covariance
                from .source.roi import extract_roi_band_power
                from .source.viz_3d import save_stc_snapshots

                fwd = build_forward_model(raw_clean, subject="fsaverage")
                noise_cov = estimate_noise_covariance(epochs=epochs)
                inv = compute_inverse_operator(raw_clean, fwd, noise_cov)

                source_estimates: dict[str, Any] = {}
                figures: dict[str, Any] = {}
                for band, (lo, hi) in FREQ_BANDS.items():
                    band_epochs = epochs.copy().filter(
                        l_freq=float(lo),
                        h_freq=float(hi),
                        phase="zero",
                        fir_design="firwin",
                        verbose="WARNING",
                    )
                    evoked = band_epochs.average()
                    stc = apply_inverse(evoked, inv, method="eLORETA")
                    power = np.mean(np.asarray(stc.data) ** 2, axis=1)
                    power_stc = stc.copy()
                    power_stc._data = power[:, np.newaxis]
                    power_stc.tmin = 0.0
                    power_stc.tstep = 1.0
                    source_estimates[band] = power_stc

                # Persist on the result for downstream consumers (non-JSON).
                result.source_estimates = source_estimates

                roi_df = extract_roi_band_power(source_estimates, subject="fsaverage")
                roi_records = (
                    roi_df.reset_index(names="roi").to_dict(orient="records")
                    if hasattr(roi_df, "reset_index")
                    else []
                )

                # Optional outputs when an out_dir is provided (e.g. report build).
                if out_dir is not None:
                    source_out = Path(out_dir) / "source"
                    source_out.mkdir(parents=True, exist_ok=True)
                    try:
                        roi_csv = source_out / "dk_roi_band_power.csv"
                        roi_df.to_csv(roi_csv, index=True)
                    except Exception as exc:
                        log.warning("Failed writing ROI CSV (%s).", exc)
                        roi_csv = None

                    for band, stc in source_estimates.items():
                        band_dir = source_out / band
                        band_dir.mkdir(parents=True, exist_ok=True)
                        figures[band] = save_stc_snapshots(
                            stc, out_dir=band_dir, subject="fsaverage", kind="power"
                        )

                    features["source"] = {
                        "method": "eLORETA",
                        "roi_table": roi_records,
                        "roi_csv_path": str(roi_csv) if roi_csv else None,
                        "figures": figures,
                    }
                else:
                    features["source"] = {
                        "method": "eLORETA",
                        "roi_table": roi_records,
                        "roi_csv_path": None,
                        "figures": {},
                    }
        except Exception as exc:
            log.warning("Source localization skipped (%s)", exc)
            result.quality["stage_errors"]["source"] = str(exc)
            features["source"] = {"method": None, "roi_table": [], "figures": {}}
    else:
        features["source"] = {"method": None, "roi_table": [], "figures": {}}

    result.features = features

    # --- Stage 6 — normative z-scoring ---
    try:
        result.zscores = zscore_mod.compute(features, age=age, sex=sex)
    except Exception as exc:
        log.exception("Normative stage failed")
        result.quality["stage_errors"]["normative"] = str(exc)
        result.zscores = {"spectral": {"bands": {}}, "aperiodic": {"slope": {}},
                          "flagged": [], "norm_db_version": "unknown"}

    # --- Stage 6b — longitudinal comparison (optional) ---
    if prev_session_id and out_dir is not None:
        try:
            from .longitudinal.compare import compare_sessions
            from .longitudinal.significance import rci_for_comparison
            from .longitudinal.store import SessionData
            from .longitudinal.viz import plot_change_topomap, plot_trend_lines

            outp = Path(out_dir)
            patient_dir = outp.parent
            curr_session_id = outp.name
            prev_dir = patient_dir / str(prev_session_id)

            prev_features_path = prev_dir / "features.json"
            if not prev_features_path.exists():
                raise FileNotFoundError(str(prev_features_path))
            import json as _json

            prev_features = _json.loads(prev_features_path.read_text(encoding="utf-8"))
            prev_zscores_path = prev_dir / "zscores.json"
            prev_quality_path = prev_dir / "quality.json"
            prev_z = (
                _json.loads(prev_zscores_path.read_text(encoding="utf-8"))
                if prev_zscores_path.exists()
                else None
            )
            prev_q = (
                _json.loads(prev_quality_path.read_text(encoding="utf-8"))
                if prev_quality_path.exists()
                else None
            )

            curr_sess = SessionData(
                patient_id=str(patient_dir.name),
                session_id=str(curr_session_id),
                features=result.features,
                zscores=result.zscores,
                quality=result.quality,
            )
            prev_sess = SessionData(
                patient_id=str(patient_dir.name),
                session_id=str(prev_session_id),
                features=prev_features,
                zscores=prev_z,
                quality=prev_q,
            )

            comp = compare_sessions(curr_sess, prev_sess)
            rci = rci_for_comparison(comp)

            change_topos: dict[str, str] = {}
            for band in sorted(((comp.spectral or {}).get("bands") or {}).keys()):
                img = plot_change_topomap(curr_sess, prev_sess, band=band)
                if isinstance(img, str):
                    change_topos[band] = img

            # Trend lines: when >=3 sessions exist for this patient on disk
            trend_imgs: dict[str, str] = {}
            sess_dirs = [
                p for p in patient_dir.iterdir() if p.is_dir() and (p / "features.json").exists()
            ]
            sess_dirs.sort(key=lambda p: (p.name, p.stat().st_mtime))
            if len(sess_dirs) >= 3:
                sessions: list[SessionData] = []
                for sd in sess_dirs:
                    try:
                        feats = _json.loads((sd / "features.json").read_text(encoding="utf-8"))
                        zpath = sd / "zscores.json"
                        qpath = sd / "quality.json"
                        zs = _json.loads(zpath.read_text(encoding="utf-8")) if zpath.exists() else None
                        qq = _json.loads(qpath.read_text(encoding="utf-8")) if qpath.exists() else None
                        sessions.append(
                            SessionData(
                                patient_id=str(patient_dir.name),
                                session_id=sd.name,
                                features=feats,
                                zscores=zs,
                                quality=qq,
                            )
                        )
                    except Exception:
                        continue
                if len(sessions) >= 3:
                    img1 = plot_trend_lines(sessions, metric="iapf_mean_hz")
                    if isinstance(img1, str):
                        trend_imgs["iapf_mean_hz"] = img1
                    img2 = plot_trend_lines(sessions, metric="tbr")
                    if isinstance(img2, str):
                        trend_imgs["tbr"] = img2

            result.longitudinal = {
                "prev_session_id": str(prev_session_id),
                "comparison": comp.to_dict(),
                "rci": rci.to_dict(),
                "change_topomaps": change_topos,
                "trend_lines": trend_imgs,
            }
        except Exception as exc:
            log.warning("Longitudinal compare skipped (%s)", exc)
            result.quality["stage_errors"]["longitudinal"] = str(exc)

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


def _should_run_source_localization(epochs: Any, quality: dict[str, Any]) -> bool:
    """Quality guard for expensive source localization.

    Requirements:
    - skip when <19 EEG channels after cleaning
    - skip when quality indicates low-quality data
    """
    try:
        import mne

        n_eeg = len(mne.pick_types(epochs.info, eeg=True))
    except Exception:
        n_eeg = len(getattr(epochs, "ch_names", []) or [])

    if int(n_eeg) < 19:
        quality["source_skipped_reason"] = f"insufficient_channels(n_eeg={n_eeg})"
        return False

    n_epochs = int(quality.get("n_epochs_retained") or 0)
    if n_epochs and n_epochs < 20:
        quality["source_skipped_reason"] = f"too_few_epochs(n_epochs_retained={n_epochs})"
        return False

    bads = list(quality.get("bad_channels") or [])
    n_ch_in = int(quality.get("n_channels_input") or 0)
    if n_ch_in and len(bads) / max(n_ch_in, 1) >= 0.30:
        quality["source_skipped_reason"] = "too_many_bad_channels"
        return False

    quality.pop("source_skipped_reason", None)
    return True
