"""EEG signal extraction service for the raw data viewer.

Loads EDF/BDF files via MNE, caches Raw objects, extracts windowed signal
slices, and provides ICA component data for the interactive cleaning UI.

All MNE imports are lazy / guarded so the API worker starts cleanly when
the ``qeeg_mne`` extra is not installed.
"""
from __future__ import annotations

import asyncio
import io
import json
import logging
import math
import os
import tempfile
from datetime import datetime, timezone
from typing import Any

from app.database import SessionLocal
from app.errors import ApiServiceError
from app.persistence.models import QEEGAnalysis
from app.services import media_storage
from app.settings import get_settings

_log = logging.getLogger(__name__)

# ── Optional heavy imports ──────────────────────────────────────────────────

try:
    import numpy as np

    _HAS_NUMPY = True
except ImportError:
    np = None  # type: ignore[assignment]
    _HAS_NUMPY = False

try:
    import mne  # type: ignore[import-not-found]
    from mne.preprocessing import ICA  # type: ignore[import-not-found]

    _HAS_MNE = True
except ImportError:
    mne = None  # type: ignore[assignment]
    ICA = None  # type: ignore[assignment]
    _HAS_MNE = False

try:
    from mne_icalabel import label_components  # type: ignore[import-not-found]

    _HAS_ICALABEL = True
except ImportError:
    label_components = None  # type: ignore[assignment]
    _HAS_ICALABEL = False

try:
    from cachetools import TTLCache  # type: ignore[import-not-found]
except ImportError:
    # Minimal in-memory dict fallback (no TTL eviction).
    TTLCache = None  # type: ignore[assignment,misc]


# ── Cache ───────────────────────────────────────────────────────────────────

def _make_cache(maxsize: int, ttl: int) -> dict:
    if TTLCache is not None:
        return TTLCache(maxsize=maxsize, ttl=ttl)
    return {}


_raw_cache: dict[str, Any] = _make_cache(maxsize=8, ttl=600)
_cleaned_cache: dict[str, Any] = _make_cache(maxsize=2, ttl=600)
_ica_cache: dict[str, Any] = _make_cache(maxsize=2, ttl=600)


def clear_caches(analysis_id: str | None = None) -> None:
    """Evict cached data for a specific analysis, or all caches."""
    if analysis_id:
        _raw_cache.pop(analysis_id, None)
        _cleaned_cache.pop(analysis_id, None)
        _ica_cache.pop(analysis_id, None)
    else:
        _raw_cache.clear()
        _cleaned_cache.clear()
        _ica_cache.clear()


# ── File loading helpers ────────────────────────────────────────────────────

def _get_file_bytes_and_ext(analysis: QEEGAnalysis) -> tuple[bytes, str]:
    """Read file bytes from media storage and determine extension."""
    settings = get_settings()
    file_bytes = asyncio.run(media_storage.read_upload(analysis.file_ref, settings))
    ext = ".edf"
    if analysis.original_filename and "." in analysis.original_filename:
        ext = "." + analysis.original_filename.rsplit(".", 1)[-1].lower()
    return file_bytes, ext


def _write_temp_file(file_bytes: bytes, ext: str) -> str:
    """Write bytes to a temp file and return the path."""
    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        tmp.write(file_bytes)
        return tmp.name


# ── Raw loading ─────────────────────────────────────────────────────────────

def load_raw_for_analysis(analysis_id: str, db: Any) -> Any:
    """Load the raw MNE Raw object for an analysis (cached).

    Returns
    -------
    mne.io.BaseRaw
        The loaded raw EEG data.
    """
    if not _HAS_MNE:
        raise RuntimeError("MNE-Python is not installed")

    cached = _raw_cache.get(analysis_id)
    if cached is not None:
        return cached

    analysis = db.query(QEEGAnalysis).filter_by(id=analysis_id).first()
    if analysis is None:
        raise ValueError(f"Analysis {analysis_id} not found")

    file_bytes, ext = _get_file_bytes_and_ext(analysis)
    tmp_path = _write_temp_file(file_bytes, ext)
    try:
        # Try the pipeline's io module first (handles channel canonicalization)
        try:
            from deepsynaps_qeeg.io import load_raw  # type: ignore[import-not-found]
            raw = load_raw(tmp_path)
        except ImportError:
            raw = mne.io.read_raw(tmp_path, preload=True)
        _raw_cache[analysis_id] = raw
        return raw
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


def load_cleaned_for_analysis(analysis_id: str, db: Any) -> Any:
    """Load preprocessed + ICA-cleaned continuous Raw (cached).

    Runs preprocess + ICA artifact removal but does NOT epoch.
    """
    if not _HAS_MNE:
        raise RuntimeError("MNE-Python is not installed")

    cached = _cleaned_cache.get(analysis_id)
    if cached is not None:
        return cached

    raw = load_raw_for_analysis(analysis_id, db)
    raw_copy = raw.copy()

    processing_applied = []

    # Try using the pipeline's preprocess module
    try:
        from deepsynaps_qeeg import preprocess  # type: ignore[import-not-found]
        raw_clean, prep_quality = preprocess.run(raw_copy)
        processing_applied.extend([
            f"bandpass_{prep_quality.get('bandpass', [1, 45])}",
            f"notch_{prep_quality.get('notch_hz', 50)}hz",
        ])
        if prep_quality.get("prep_used"):
            processing_applied.append("robust_reference")
        else:
            processing_applied.append("average_reference")
    except ImportError:
        # Minimal fallback: just filter
        raw_clean = raw_copy
        raw_clean.filter(l_freq=1.0, h_freq=45.0, verbose=False)
        raw_clean.notch_filter(freqs=50.0, verbose=False)
        processing_applied.extend(["bandpass_1_45_hz", "notch_50hz"])

    # Try ICA artifact removal
    try:
        # We need to run ICA on the cleaned raw but without epoching
        # Replicate the ICA fitting from artifacts module
        ica_data = _fit_ica_on_raw(raw_clean)
        if ica_data and ica_data.get("ica"):
            ica_obj = ica_data["ica"]
            ica_obj.apply(raw_clean)
            processing_applied.append("ica_artifact_removal")
    except (ImportError, Exception) as exc:
        _log.warning("ICA cleaning skipped: %s", exc)

    raw_clean._eeg_signal_processing = processing_applied  # type: ignore[attr-defined]
    _cleaned_cache[analysis_id] = raw_clean
    return raw_clean


# ── Signal extraction ───────────────────────────────────────────────────────

def extract_signal_window(
    raw: Any,
    t_start: float = 0.0,
    t_end: float | None = None,
    window_sec: float = 10.0,
    channels: list[str] | None = None,
    max_points_per_channel: int = 2500,
) -> dict[str, Any]:
    """Extract a time-windowed signal slice from a Raw object.

    Returns a dict suitable for JSON serialization.
    """
    if not _HAS_MNE or not _HAS_NUMPY:
        raise RuntimeError("MNE-Python and NumPy are required")

    sfreq_original = raw.info["sfreq"]
    total_duration = raw.times[-1] if len(raw.times) > 0 else 0.0

    # Clamp window
    if t_end is None:
        t_end = min(t_start + window_sec, total_duration)
    t_start = max(0.0, t_start)
    t_end = min(t_end, total_duration)
    if t_end <= t_start:
        t_end = min(t_start + window_sec, total_duration)

    # Pick channels
    picks = channels if channels else None

    # Extract data
    start_sample = int(t_start * sfreq_original)
    stop_sample = int(t_end * sfreq_original)
    data, times = raw[picks, start_sample:stop_sample]  # type: ignore[index]

    # Convert to microvolts (MNE stores in volts)
    data = data * 1e6

    ch_names = list(raw.ch_names) if picks is None else channels

    # Auto-downsample
    n_samples = data.shape[1]
    downsample_factor = 1
    if n_samples > max_points_per_channel:
        downsample_factor = math.ceil(n_samples / max_points_per_channel)
        data = data[:, ::downsample_factor]
        times = times[::downsample_factor]

    effective_sfreq = sfreq_original / downsample_factor

    # Extract annotations in the visible window
    annotations = []
    if raw.annotations:
        for ann in raw.annotations:
            ann_start = ann["onset"]
            ann_end = ann_start + ann["duration"]
            if ann_end > t_start and ann_start < t_end:
                annotations.append({
                    "onset": float(ann_start),
                    "duration": float(ann["duration"]),
                    "description": str(ann["description"]),
                })

    # Get processing info if available
    processing_applied = getattr(raw, "_eeg_signal_processing", None)

    result: dict[str, Any] = {
        "t_start": float(t_start),
        "t_end": float(t_end),
        "sfreq": float(effective_sfreq),
        "sfreq_original": float(sfreq_original),
        "downsample_factor": downsample_factor,
        "channels": list(ch_names),
        "n_samples": data.shape[1],
        "data": [row.tolist() for row in data],
        "total_duration_sec": float(total_duration),
        "annotations": annotations,
    }
    if processing_applied:
        result["processing_applied"] = processing_applied
    return result


def extract_signal_window_rest(
    raw: Any,
    t_start: float,
    t_end: float,
    channels: list[str] | None,
    max_points_per_channel: int,
) -> tuple[dict[str, Any], list[str]]:
    """Crop ``raw`` to ``[t_start, t_end]``, apply MNE REST, then extract like ``extract_signal_window``.

    REST uses :func:`mne.set_eeg_reference` with ``ref_channels='REST'``. On failure, falls back to
    the uncorrected cropped window and records a warning.
    """
    warns: list[str] = []
    if not _HAS_MNE or not _HAS_NUMPY:
        raise RuntimeError("MNE-Python and NumPy are required")

    total_duration = raw.times[-1] if len(raw.times) > 0 else 0.0
    t_start = max(0.0, float(t_start))
    t_end = min(float(t_end), total_duration)
    if t_end <= t_start:
        t_end = min(t_start + 0.01, total_duration)

    raw_c = raw.copy()
    raw_c.crop(tmin=t_start, tmax=t_end)

    try:
        # MNE 1.x: REST reference for surface EEG (requires digitization / sphere model when applicable).
        mne.set_eeg_reference(raw_c, ref_channels="REST", verbose=False)  # type: ignore[arg-type]
    except Exception as exc:  # pragma: no cover - optional paths across MNE versions
        warns.append(f"REST reference failed ({exc}); returning uncorrected cropped data")

    span = float(raw_c.times[-1]) if len(raw_c.times) else max(0.01, t_end - t_start)
    window = extract_signal_window(
        raw_c,
        t_start=0.0,
        t_end=span,
        window_sec=max(0.01, span),
        channels=channels,
        max_points_per_channel=max_points_per_channel,
    )
    return window, warns


# ── Channel info extraction ─────────────────────────────────────────────────

def extract_channel_info(raw: Any) -> dict[str, Any]:
    """Extract channel metadata from a Raw object."""
    channels = []
    for i, ch_name in enumerate(raw.ch_names):
        ch_info: dict[str, Any] = {
            "name": ch_name,
            "type": mne.channel_type(raw.info, i) if _HAS_MNE else "eeg",
        }
        # Try to get position
        try:
            montage = raw.get_montage()
            if montage:
                pos = montage.get_positions()
                ch_pos = pos.get("ch_pos", {}).get(ch_name)
                if ch_pos is not None:
                    ch_info["position_x"] = float(ch_pos[0])
                    ch_info["position_y"] = float(ch_pos[1])
                    ch_info["position_z"] = float(ch_pos[2])
        except Exception:
            pass
        channels.append(ch_info)

    return {
        "channels": channels,
        "sfreq": float(raw.info["sfreq"]),
        "duration_sec": float(raw.times[-1]) if len(raw.times) > 0 else 0.0,
        "n_samples": len(raw.times),
        "n_channels": len(raw.ch_names),
        "file_format": getattr(raw, "_filenames", ["unknown"])[0].rsplit(".", 1)[-1] if hasattr(raw, "_filenames") and raw._filenames else "unknown",
    }


# ── ICA component extraction ───────────────────────────────────────────────

def _fit_ica_on_raw(raw_clean: Any) -> dict[str, Any] | None:
    """Fit ICA on a preprocessed Raw and return component data."""
    if not _HAS_MNE or ICA is None:
        return None

    try:
        # High-pass filter copy for ICA fitting (standard practice)
        raw_hp = raw_clean.copy().filter(l_freq=1.0, h_freq=None, verbose=False)

        n_channels = len(raw_hp.ch_names)
        n_components = min(n_channels - 1, 30)
        if n_components < 2:
            return None

        ica = ICA(
            n_components=n_components,
            method="picard",
            random_state=42,
            max_iter="auto",
        )
        try:
            ica.fit(raw_hp)
        except Exception:
            # Fallback to infomax
            ica = ICA(
                n_components=n_components,
                method="infomax",
                random_state=42,
                max_iter=500,
            )
            ica.fit(raw_hp)

        # ICLabel classification
        labels = []
        label_proba = []
        if _HAS_ICALABEL and label_components is not None:
            try:
                labels_out = label_components(raw_hp, ica, method="iclabel")
                labels = list(labels_out.get("labels", []))
                y_pred = labels_out.get("y_pred_proba")
                if y_pred is not None and _HAS_NUMPY:
                    label_proba = y_pred.tolist() if hasattr(y_pred, "tolist") else list(y_pred)
            except Exception as exc:
                _log.warning("ICLabel failed: %s", exc)

        # Auto-exclude: non-brain/non-other with proba > 0.7
        auto_excluded = []
        drop_labels = {"eye", "muscle", "heart", "line_noise", "channel_noise"}
        iclabel_classes = ["brain", "muscle", "eye", "heart", "line_noise", "channel_noise", "other"]
        for idx, label in enumerate(labels):
            if label in drop_labels:
                # Get max proba for this component
                proba = label_proba[idx] if idx < len(label_proba) else []
                max_p = max(proba) if proba else 0
                if max_p > 0.7:
                    auto_excluded.append(idx)

        ica.exclude = list(auto_excluded)

        return {
            "ica": ica,
            "raw_hp": raw_hp,
            "labels": labels,
            "label_proba": label_proba,
            "auto_excluded": auto_excluded,
            "iclabel_classes": iclabel_classes,
            "method": ica.method if hasattr(ica, "method") else "picard",
        }
    except Exception as exc:
        _log.exception("ICA fitting failed: %s", exc)
        return None


def extract_ica_data(analysis_id: str, db: Any) -> dict[str, Any]:
    """Extract ICA component data for the interactive review UI."""
    if not _HAS_MNE:
        raise RuntimeError("MNE-Python is not installed")

    cached = _ica_cache.get(analysis_id)
    if cached is not None:
        return cached

    # Load and preprocess the raw data
    raw = load_raw_for_analysis(analysis_id, db)
    raw_clean = raw.copy()

    try:
        from deepsynaps_qeeg import preprocess  # type: ignore[import-not-found]
        raw_clean, _ = preprocess.run(raw_clean)
    except ImportError:
        raw_clean.filter(l_freq=1.0, h_freq=45.0, verbose=False)
        raw_clean.notch_filter(freqs=50.0, verbose=False)

    ica_data = _fit_ica_on_raw(raw_clean)
    if ica_data is None:
        return {
            "n_components": 0,
            "method": "unavailable",
            "components": [],
            "auto_excluded_indices": [],
            "iclabel_available": False,
        }

    ica_obj = ica_data["ica"]
    labels = ica_data["labels"]
    label_proba = ica_data["label_proba"]
    iclabel_classes = ica_data["iclabel_classes"]

    # Generate topomap images for each component
    components = []
    for idx in range(ica_obj.n_components_):
        comp: dict[str, Any] = {
            "index": idx,
            "label": labels[idx] if idx < len(labels) else "unknown",
            "is_excluded": idx in ica_data["auto_excluded"],
        }

        # Label probabilities
        if idx < len(label_proba) and label_proba[idx]:
            proba_list = label_proba[idx]
            comp["label_probabilities"] = {
                cls_name: round(float(p), 4)
                for cls_name, p in zip(iclabel_classes, proba_list)
            } if len(proba_list) == len(iclabel_classes) else {}
        else:
            comp["label_probabilities"] = {}

        # Render topomap as base64 PNG
        try:
            import matplotlib
            matplotlib.use("Agg")
            import matplotlib.pyplot as plt

            fig = ica_obj.plot_components(picks=[idx], show=False)
            if isinstance(fig, list):
                fig = fig[0]
            buf = io.BytesIO()
            fig.savefig(buf, format="png", dpi=72, bbox_inches="tight",
                        facecolor="#0d1b2a", transparent=False)
            plt.close(fig)
            buf.seek(0)

            import base64
            comp["topomap_b64"] = "data:image/png;base64," + base64.b64encode(buf.read()).decode()
        except Exception as exc:
            _log.warning("Topomap render failed for IC%d: %s", idx, exc)
            comp["topomap_b64"] = ""

        # Variance explained (approximate)
        try:
            if hasattr(ica_obj, "pca_explained_variance_") and ica_obj.pca_explained_variance_ is not None:
                total_var = float(np.sum(ica_obj.pca_explained_variance_))
                if total_var > 0 and idx < len(ica_obj.pca_explained_variance_):
                    comp["variance_explained_pct"] = round(
                        float(ica_obj.pca_explained_variance_[idx]) / total_var * 100, 2
                    )
        except Exception:
            pass

        components.append(comp)

    result = {
        "n_components": ica_obj.n_components_,
        "method": ica_data["method"],
        "components": components,
        "auto_excluded_indices": list(ica_data["auto_excluded"]),
        "iclabel_available": _HAS_ICALABEL,
    }

    # Cache the ICA object alongside the result for timecourse extraction
    _ica_cache[analysis_id] = result
    _ica_cache[f"{analysis_id}__ica_obj"] = ica_obj
    _ica_cache[f"{analysis_id}__raw_clean"] = raw_clean

    return result


def extract_ica_timecourse(
    analysis_id: str,
    component_idx: int,
    db: Any,
    t_start: float = 0.0,
    t_end: float | None = None,
    window_sec: float = 10.0,
    max_points: int = 2500,
) -> dict[str, Any]:
    """Extract the time course of a single ICA component."""
    if not _HAS_MNE or not _HAS_NUMPY:
        raise RuntimeError("MNE-Python and NumPy are required")

    # Ensure ICA is computed
    ica_result = _ica_cache.get(analysis_id)
    if ica_result is None:
        extract_ica_data(analysis_id, db)

    ica_obj = _ica_cache.get(f"{analysis_id}__ica_obj")
    raw_clean = _ica_cache.get(f"{analysis_id}__raw_clean")

    if ica_obj is None or raw_clean is None:
        raise ValueError("ICA data not available. Run extract_ica_data first.")

    if component_idx < 0 or component_idx >= ica_obj.n_components_:
        raise ValueError(f"Component index {component_idx} out of range [0, {ica_obj.n_components_})")

    # Get component sources
    sources = ica_obj.get_sources(raw_clean)
    sfreq = raw_clean.info["sfreq"]
    total_duration = raw_clean.times[-1] if len(raw_clean.times) > 0 else 0.0

    if t_end is None:
        t_end = min(t_start + window_sec, total_duration)
    t_start = max(0.0, t_start)
    t_end = min(t_end, total_duration)

    start_sample = int(t_start * sfreq)
    stop_sample = int(t_end * sfreq)
    data = sources.get_data(picks=[component_idx])[0, start_sample:stop_sample]

    # Downsample
    downsample_factor = 1
    if len(data) > max_points:
        downsample_factor = math.ceil(len(data) / max_points)
        data = data[::downsample_factor]

    ica_result_cached = _ica_cache.get(analysis_id, {})
    comp_info = {}
    if isinstance(ica_result_cached, dict):
        for c in ica_result_cached.get("components", []):
            if c.get("index") == component_idx:
                comp_info = c
                break

    return {
        "analysis_id": analysis_id,
        "component_index": component_idx,
        "t_start": float(t_start),
        "t_end": float(t_end),
        "sfreq": float(sfreq / downsample_factor),
        "n_samples": len(data),
        "data": data.tolist(),
        "label": comp_info.get("label", "unknown"),
        "is_excluded": comp_info.get("is_excluded", False),
    }


# ── Custom pipeline re-run ──────────────────────────────────────────────────

def run_custom_pipeline_sync(analysis_id: str) -> dict[str, Any]:
    """Re-run the MNE pipeline with user cleaning overrides.

    Reads the ``cleaning_config_json`` from the DB row and passes it as
    ``user_overrides`` to the pipeline.
    """
    from app.services.qeeg_pipeline import run_pipeline_safe

    session = SessionLocal()
    tmp_path: str | None = None
    try:
        analysis = session.query(QEEGAnalysis).filter_by(id=analysis_id).first()
        if analysis is None:
            return {"analysis_id": analysis_id, "status": "failed", "error": "analysis_not_found"}

        # Load cleaning config
        config = {}
        if analysis.cleaning_config_json:
            try:
                config = json.loads(analysis.cleaning_config_json)
            except (TypeError, ValueError):
                pass

        if not config:
            return {"analysis_id": analysis_id, "status": "failed", "error": "no_cleaning_config"}

        analysis.analysis_status = "processing:mne_pipeline_custom"
        analysis.analysis_error = None
        session.commit()

        # Build user_overrides dict for the pipeline
        user_overrides: dict[str, Any] = {}
        if config.get("bad_channels"):
            user_overrides["bad_channels"] = list(config["bad_channels"])
        if config.get("bad_segments"):
            user_overrides["annotations"] = [
                {
                    "onset": seg["start_sec"],
                    "duration": seg["end_sec"] - seg["start_sec"],
                    "description": seg.get("description", "BAD_user"),
                }
                for seg in config["bad_segments"]
            ]
        if config.get("excluded_ica_components"):
            user_overrides["ica_exclude"] = list(config["excluded_ica_components"])
        if config.get("included_ica_components"):
            user_overrides["ica_keep"] = list(config["included_ica_components"])

        filter_bp_low = config.get("bandpass_low", 1.0)
        filter_bp_high = config.get("bandpass_high", 45.0)
        filter_notch = config.get("notch_hz", 50.0)
        filter_resample = config.get("resample_hz", 250.0)

        # Get file
        settings = get_settings()
        file_bytes = asyncio.run(media_storage.read_upload(analysis.file_ref, settings))
        ext = ".edf"
        if analysis.original_filename and "." in analysis.original_filename:
            ext = "." + analysis.original_filename.rsplit(".", 1)[-1].lower()

        with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name

        result = run_pipeline_safe(
            tmp_path,
            bandpass=(filter_bp_low, filter_bp_high),
            notch_hz=filter_notch,
            resample=filter_resample,
            user_overrides=user_overrides,
        )

        if not result.get("success"):
            analysis.analysis_status = "failed"
            analysis.analysis_error = str(result.get("error", "custom pipeline failed"))[:500]
            session.commit()
            return {"analysis_id": analysis_id, "status": "failed", "error": analysis.analysis_error}

        # Persist results (same as qeeg_pipeline_job)
        from app.services.spectral_analysis import compute_band_powers_from_pipeline

        features = result.get("features") or {}
        zscores = result.get("zscores") or {}
        quality = result.get("quality") or {}
        flagged = list(result.get("flagged_conditions") or [])

        spectral = features.get("spectral") or {}
        analysis.aperiodic_json = json.dumps(spectral.get("aperiodic") or {})
        analysis.peak_alpha_freq_json = json.dumps(spectral.get("peak_alpha_freq") or {})
        analysis.connectivity_json = json.dumps(features.get("connectivity") or {})
        analysis.asymmetry_json = json.dumps(features.get("asymmetry") or {})
        analysis.graph_metrics_json = json.dumps(features.get("graph") or {})
        analysis.source_roi_json = json.dumps(features.get("source") or {})
        analysis.normative_zscores_json = json.dumps(zscores)
        analysis.flagged_conditions = json.dumps(flagged)

        quality["custom_cleaning"] = True
        analysis.quality_metrics_json = json.dumps(quality)
        analysis.pipeline_version = (str(quality.get("pipeline_version") or "")[:16]) or None
        analysis.norm_db_version = (str(zscores.get("norm_db_version") or "")[:16]) or None

        legacy_bands = compute_band_powers_from_pipeline(features)
        if quality.get("sfreq_output"):
            try:
                legacy_bands["global_summary"]["sample_rate_hz"] = float(quality["sfreq_output"])
            except (TypeError, ValueError):
                pass
        analysis.band_powers_json = json.dumps(legacy_bands)

        analysis.artifact_rejection_json = json.dumps({
            "source": "mne_pipeline_custom",
            "user_overrides": True,
            "rejected_channels": list(quality.get("bad_channels") or []),
            "total_channels": int(quality.get("n_channels_input") or 0),
            "clean_channels": max(0, int(quality.get("n_channels_input") or 0) - int(quality.get("n_channels_rejected") or 0)),
            "epochs_total": int(quality.get("n_epochs_total") or 0),
            "epochs_retained": int(quality.get("n_epochs_retained") or 0),
            "ica_components_dropped": int(quality.get("ica_components_dropped") or 0),
            "ica_labels_dropped": dict(quality.get("ica_labels_dropped") or {}),
            "bandpass": list(quality.get("bandpass") or []),
            "notch_hz": quality.get("notch_hz"),
        })

        analysis.analysis_status = "completed"
        analysis.analyzed_at = datetime.now(timezone.utc)
        session.commit()

        # Clear caches for this analysis since results changed
        clear_caches(analysis_id)

        return {"analysis_id": analysis_id, "status": "completed", "error": None}
    except Exception as exc:
        _log.exception("run_custom_pipeline_sync failed for %s", analysis_id)
        try:
            analysis = session.query(QEEGAnalysis).filter_by(id=analysis_id).first()
            if analysis is not None:
                analysis.analysis_status = "failed"
                analysis.analysis_error = str(exc)[:500]
                session.commit()
        except Exception:
            session.rollback()
        return {"analysis_id": analysis_id, "status": "failed", "error": str(exc)}
    finally:
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
        session.close()


# ── Phase 3: Montage application ────────────────────────────────────────────
#
# Operates directly on a 2-D numpy array (channels × samples) plus a list of
# channel names. Pure-numpy where possible so the service stays callable from
# tests that build a synthetic 19-channel array without a full MNE Raw.
#
# Supported montages:
#   referential    — pass-through (no re-reference)
#   bipolar_long   — longitudinal bipolar pairs (Fp1-F7, F7-T3, ...)
#   bipolar_trans  — transverse bipolar pairs  (F7-F3, F3-Fz, ...)
#   average        — common-average reference
#   laplacian      — small-Laplacian (per-channel mean of nearest neighbors)
#   linked_mastoid — average of A1/A2 (or M1/M2) used as reference
#   csd            — Current Source Density via MNE (compute_current_source_density)
#   rest           — REST reference (simplified; full lead-field deferred)


_LONGITUDINAL_PAIRS: list[tuple[str, str]] = [
    ("Fp1", "F7"), ("F7", "T3"), ("T3", "T5"), ("T5", "O1"),
    ("Fp1", "F3"), ("F3", "C3"), ("C3", "P3"), ("P3", "O1"),
    ("Fz",  "Cz"), ("Cz", "Pz"),
    ("Fp2", "F4"), ("F4", "C4"), ("C4", "P4"), ("P4", "O2"),
    ("Fp2", "F8"), ("F8", "T4"), ("T4", "T6"), ("T6", "O2"),
]

_TRANSVERSE_PAIRS: list[tuple[str, str]] = [
    ("F7", "F3"), ("F3", "Fz"), ("Fz", "F4"), ("F4", "F8"),
    ("T3", "C3"), ("C3", "Cz"), ("Cz", "C4"), ("C4", "T4"),
    ("T5", "P3"), ("P3", "Pz"), ("Pz", "P4"), ("P4", "T6"),
]

# Small-Laplacian neighbor map for the 10-20 system. Each entry lists the
# nearest cardinal neighbours used to build a per-channel reference.
_LAPLACIAN_NEIGHBORS: dict[str, list[str]] = {
    "Fp1": ["F3", "F7"],
    "Fp2": ["F4", "F8"],
    "F7":  ["Fp1", "F3", "T3"],
    "F3":  ["Fp1", "F7", "Fz", "C3"],
    "Fz":  ["F3", "F4", "Cz"],
    "F4":  ["Fp2", "F8", "Fz", "C4"],
    "F8":  ["Fp2", "F4", "T4"],
    "T3":  ["F7", "C3", "T5"],
    "C3":  ["F3", "T3", "Cz", "P3"],
    "Cz":  ["Fz", "C3", "C4", "Pz"],
    "C4":  ["F4", "T4", "Cz", "P4"],
    "T4":  ["F8", "C4", "T6"],
    "T5":  ["T3", "P3", "O1"],
    "P3":  ["C3", "T5", "Pz", "O1"],
    "Pz":  ["Cz", "P3", "P4"],
    "P4":  ["C4", "T6", "Pz", "O2"],
    "T6":  ["T4", "P4", "O2"],
    "O1":  ["T5", "P3", "O2"],
    "O2":  ["T6", "P4", "O1"],
}


def _normalize_ch(name: str) -> str:
    """Normalize channel name for case-insensitive matching."""
    return str(name).strip().upper()


def _channel_index_map(channels: list[str]) -> dict[str, int]:
    return {_normalize_ch(c): i for i, c in enumerate(channels)}


def _find_channel(idx_map: dict[str, int], *names: str) -> int | None:
    for n in names:
        i = idx_map.get(_normalize_ch(n))
        if i is not None:
            return i
    return None


def apply_montage_to_array(
    data: Any,
    channels: list[str],
    montage: str,
    custom_pairs: list[dict[str, str]] | None = None,
) -> tuple[Any, list[str]]:
    """Apply a clinical EEG montage to a (channels, samples) numpy array.

    Returns (new_data, new_channel_names). Raises :class:`ApiServiceError`
    for missing-reference scenarios. The returned channel list reflects
    the montage's output (e.g. bipolar pair labels like "Fp1-F7").
    """
    if not _HAS_NUMPY:
        raise RuntimeError("NumPy is required")

    montage = (montage or "referential").lower()
    idx_map = _channel_index_map(channels)

    if montage in ("referential", "raw", "none", ""):
        return data, list(channels)

    if montage == "average":
        ref = data.mean(axis=0, keepdims=True)
        return data - ref, list(channels)

    if montage in ("bipolar_long", "bipolar_longitudinal", "bipolar_trans", "bipolar_transverse"):
        pairs = (
            _LONGITUDINAL_PAIRS
            if montage.startswith("bipolar_long")
            else _TRANSVERSE_PAIRS
        )
        rows: list[Any] = []
        labels: list[str] = []
        for anode, cathode in pairs:
            ai = _find_channel(idx_map, anode)
            ci = _find_channel(idx_map, cathode)
            if ai is None or ci is None:
                continue
            rows.append(data[ai] - data[ci])
            labels.append(f"{anode}-{cathode}")
        if not rows:
            raise ApiServiceError(
                code="missing_reference",
                message=f"Bipolar montage requires 10-20 channels (found none of: {pairs[0]}…)",
                status_code=400,
            )
        return np.stack(rows, axis=0), labels

    if montage == "laplacian":
        rows = []
        labels = []
        for ch_name, neighbors in _LAPLACIAN_NEIGHBORS.items():
            ci = _find_channel(idx_map, ch_name)
            if ci is None:
                continue
            neighbor_indices = [
                _find_channel(idx_map, n) for n in neighbors
            ]
            neighbor_indices = [n for n in neighbor_indices if n is not None]
            if not neighbor_indices:
                continue
            mean_neighbor = np.mean(data[neighbor_indices, :], axis=0)
            rows.append(data[ci] - mean_neighbor)
            labels.append(ch_name)
        if not rows:
            raise ApiServiceError(
                code="missing_reference",
                message="Laplacian montage requires 10-20 channels",
                status_code=400,
            )
        return np.stack(rows, axis=0), labels

    if montage == "linked_mastoid":
        # Try A1/A2, then M1/M2.
        left = _find_channel(idx_map, "A1", "M1")
        right = _find_channel(idx_map, "A2", "M2")
        if left is None or right is None:
            raise ApiServiceError(
                code="missing_reference",
                message="Linked mastoid requires A1/A2 or M1/M2 channels",
                status_code=400,
            )
        ref = (data[left] + data[right]) / 2.0
        return data - ref[np.newaxis, :], list(channels)

    if montage == "csd":
        # CSD requires MNE plus channel positions. The function in this file
        # operates on a bare array; full CSD is delegated to apply_montage_to_raw
        # which has a real Raw object.  Guard here so callers know.
        if not _HAS_MNE:
            raise ApiServiceError(
                code="dependency_missing",
                message="CSD montage requires MNE-Python with channel positions.",
                status_code=503,
            )
        # Without positions in the bare-array path, fall back to a Laplacian
        # approximation. Real CSD path is in apply_montage_to_raw.
        return apply_montage_to_array(data, channels, "laplacian")

    if montage == "rest":
        # Simplified REST: average reference + small DC correction term.
        # TODO Phase X: full REST via lead-field matrix (requires a forward
        # model — out of scope until a head-model dependency lands).
        ref = data.mean(axis=0, keepdims=True)
        # Small correction term: subtract the per-channel temporal mean so the
        # reference does not absorb a DC offset that biases the average.
        per_ch_mean = data.mean(axis=1, keepdims=True)
        corrected_ref = ref - per_ch_mean.mean(axis=0, keepdims=True)
        return data - corrected_ref, list(channels)

    if montage == "custom" and custom_pairs:
        rows = []
        labels = []
        for pair in custom_pairs:
            anode = pair.get("anode")
            cathode = pair.get("cathode")
            if not anode or not cathode or anode == cathode:
                continue
            ai = _find_channel(idx_map, anode)
            ci = _find_channel(idx_map, cathode)
            if ai is None or ci is None:
                continue
            rows.append(data[ai] - data[ci])
            labels.append(f"{anode}-{cathode}")
        if not rows:
            raise ApiServiceError(
                code="missing_reference",
                message="Custom montage has no resolvable pairs",
                status_code=400,
            )
        return np.stack(rows, axis=0), labels

    # Unknown montage — fall back to referential rather than raising so the UI
    # never wedges on a typo.
    return data, list(channels)


def apply_montage_to_raw(raw: Any, montage: str) -> Any:
    """Apply a montage to an MNE Raw object, returning a new Raw.

    Used by the live signal-window endpoints so the wire format stays
    unchanged. Falls back to array-based path when MNE-specific helpers
    are not available.
    """
    if not _HAS_MNE:
        raise RuntimeError("MNE-Python is not installed")

    montage = (montage or "referential").lower()

    if montage == "csd":
        try:
            from mne.preprocessing import compute_current_source_density  # type: ignore
            return compute_current_source_density(raw.copy())
        except Exception as exc:
            raise ApiServiceError(
                code="dependency_missing",
                message=f"CSD montage failed: {exc}",
                status_code=503,
            ) from exc

    if montage in ("referential", "raw", "none", ""):
        return raw

    # For everything else, route through the array path on a copy.
    raw_copy = raw.copy()
    data = raw_copy.get_data()
    new_data, new_chs = apply_montage_to_array(data, list(raw_copy.ch_names), montage)
    if new_chs == list(raw_copy.ch_names):
        # Same channels — just write the data back.
        raw_copy._data = new_data
        return raw_copy
    # Channel set changed (bipolar / laplacian) — build a new Info.
    info = mne.create_info(new_chs, raw_copy.info["sfreq"], ch_types="eeg")
    return mne.io.RawArray(new_data, info, verbose=False)


# ── Phase 3: Filter preview ─────────────────────────────────────────────────


def _butterworth_freqz(
    lff: float | None,
    hff: float | None,
    notch: float | None,
    sfreq: float,
    n_points: int = 256,
) -> dict[str, list[float]]:
    """Compute an approximate magnitude response (in dB) for the cascaded
    LFF / HFF / notch filter pipeline.

    Pure numpy — no scipy dependency. Uses a 2nd-order Butterworth analytic
    magnitude formula plus a narrowband notch with Q=30. Good enough for a
    UI preview; the actual signal filtering is still done by MNE.
    """
    if not _HAS_NUMPY:
        raise RuntimeError("NumPy is required")

    nyq = max(1.0, sfreq / 2.0)
    hz = np.linspace(0.1, nyq, n_points)
    mag = np.ones_like(hz)

    # 2nd-order high-pass (LFF). |H| = (f/fc)^N / sqrt(1 + (f/fc)^(2N))
    if lff and lff > 0:
        ratio = hz / float(lff)
        mag *= (ratio ** 2) / np.sqrt(1.0 + ratio ** 4)

    # 2nd-order low-pass (HFF). |H| = 1 / sqrt(1 + (f/fc)^(2N))
    if hff and hff > 0:
        ratio = hz / float(hff)
        mag *= 1.0 / np.sqrt(1.0 + ratio ** 4)

    # Narrow notch around the line-noise frequency.
    if notch and notch > 0:
        Q = 30.0
        w0 = float(notch)
        bw = w0 / Q
        # Notch transfer mag: |H| = (f^2 - w0^2) / sqrt((f^2 - w0^2)^2 + (f*bw)^2)
        f2 = hz ** 2
        num = np.abs(f2 - w0 ** 2)
        den = np.sqrt((f2 - w0 ** 2) ** 2 + (hz * bw) ** 2 + 1e-12)
        mag *= num / den

    # Convert to dB. Floor at -80 dB for plotting.
    with np.errstate(divide="ignore"):
        mag_db = 20.0 * np.log10(np.maximum(mag, 1e-4))
    mag_db = np.clip(mag_db, -80.0, 5.0)

    return {
        "hz": [float(x) for x in hz.tolist()],
        "magnitude_db": [float(x) for x in mag_db.tolist()],
    }


def compute_filter_preview(
    analysis_id: str,
    db: Any,
    t_start: float = 0.0,
    window_sec: float = 10.0,
    lff: float | None = 1.0,
    hff: float | None = 45.0,
    notch: float | None = 50.0,
    max_points_per_channel: int = 1500,
    max_channels: int = 6,
) -> dict[str, Any]:
    """Return paired raw/filtered traces + frequency response for the UI.

    Limits the response to ``max_channels`` (first N) and downsamples to
    ``max_points_per_channel`` so the JSON stays small enough to fit in a
    popover preview.
    """
    if not _HAS_MNE or not _HAS_NUMPY:
        raise RuntimeError("MNE-Python and NumPy are required")

    raw = load_raw_for_analysis(analysis_id, db)
    raw_window = raw.copy()
    sfreq = float(raw_window.info["sfreq"])
    total = raw_window.times[-1] if len(raw_window.times) > 0 else 0.0
    t0 = max(0.0, min(float(t_start), max(0.0, total - 0.1)))
    t1 = min(t0 + max(0.5, float(window_sec)), total)

    start_sample = int(t0 * sfreq)
    stop_sample = int(t1 * sfreq)
    raw_data, _times = raw_window[: max_channels, start_sample:stop_sample]
    raw_data = raw_data * 1e6  # → microvolts

    # Build a filtered copy by applying LFF/HFF/notch via MNE.
    filt = raw_window.copy()
    try:
        l_freq = float(lff) if lff and lff > 0 else None
        h_freq = float(hff) if hff and hff > 0 else None
        if l_freq is not None or h_freq is not None:
            filt.filter(l_freq=l_freq, h_freq=h_freq, verbose=False)
        if notch and float(notch) > 0:
            filt.notch_filter(freqs=float(notch), verbose=False)
    except Exception as exc:
        _log.warning("filter-preview: filter step failed (%s) — returning raw both sides", exc)

    filt_data, _ = filt[: max_channels, start_sample:stop_sample]
    filt_data = filt_data * 1e6

    # Downsample.
    n = raw_data.shape[1]
    if n > max_points_per_channel:
        ds = math.ceil(n / max_points_per_channel)
        raw_data = raw_data[:, ::ds]
        filt_data = filt_data[:, ::ds]

    freq_resp = _butterworth_freqz(lff, hff, notch, sfreq)

    ch_names = list(raw_window.ch_names[: max_channels])
    return {
        "analysis_id": analysis_id,
        "t_start": float(t0),
        "t_end": float(t1),
        "sfreq": float(sfreq),
        "channels": ch_names,
        "raw": [row.tolist() for row in raw_data],
        "filtered": [row.tolist() for row in filt_data],
        "freq_response": freq_resp,
        "params": {
            "lff": float(lff) if lff is not None else None,
            "hff": float(hff) if hff is not None else None,
            "notch": float(notch) if notch is not None else None,
        },
    }


# ── Per-window PSD (Raw Workbench helper; not a full qEEG pipeline job) ─────

_MAX_WINDOW_SEC = 600.0
_PSD_FREQ_RANGE = (1.0, 45.0)
_UV2_PER_HZ_SCALE = 1e12  # V²/Hz → µV²/Hz


def _trapz_compat(y: Any, x: Any, axis: int = -1) -> Any:
    fn = getattr(np, "trapezoid", None) or getattr(np, "trapz")
    return fn(y, x, axis=axis)


def _integrate_psd_band(
    freqs: Any, psd_uv2_hz: Any, lo: float, hi: float
) -> Any:
    """Trapezoidal integral of PSD over [lo, hi] Hz → µV² (total power in band)."""
    mask = (freqs >= lo) & (freqs <= hi)
    if not np.any(mask):
        return np.zeros(psd_uv2_hz.shape[0])
    return _trapz_compat(psd_uv2_hz[:, mask], freqs[mask], axis=-1)


def _resolve_eeg_channel(raw: Any, requested: str, eeg_names: list[str]) -> str | None:
    """Map UI-style labels (e.g. ``Cz-Av``) to an available EEG channel name."""
    if requested in eeg_names:
        return requested
    stem = requested.split("-")[0].strip()
    if stem in eeg_names:
        return stem
    matches = [
        n
        for n in eeg_names
        if n.split("-")[0].strip().upper() == stem.upper()
    ]
    if len(matches) == 1:
        return matches[0]
    return None


def _bad_segment_overlap_warnings(
    analysis_id: str, db: Any, t0: float, t1: float
) -> list[str]:
    out: list[str] = []
    row = db.query(QEEGAnalysis).filter_by(id=analysis_id).first()
    if row is None or not row.cleaning_config_json:
        return out
    try:
        cfg = json.loads(row.cleaning_config_json)
    except (TypeError, ValueError):
        return out
    for seg in cfg.get("bad_segments") or []:
        try:
            s0 = float(seg.get("start_sec", 0.0))
            s1 = float(seg.get("end_sec", 0.0))
        except (TypeError, ValueError):
            continue
        if s1 > t0 and s0 < t1:
            out.append(f"window_overlaps_marked_bad_segment:{s0:.2f}-{s1:.2f}")
    return out


def compute_window_psd(
    analysis_id: str,
    db: Any,
    *,
    start_sec: float,
    end_sec: float,
    channels: list[str] | None = None,
    average_channels: bool = False,
    band_defs: dict[str, tuple[float, float]] | None = None,
) -> dict[str, Any]:
    """Welch PSD + band power for a single continuous time window.

    Uses the same Welch segment length / overlap convention as
    ``deepsynaps_qeeg.features.spectral`` (4 s window, 50 % overlap) where
    the recording allows. Units: PSD in µV²/Hz; band power integrals in µV².

    Raises
    ------
    ApiServiceError
        Invalid windows, unknown channels, unavailable raw file, or windows too
        short for a meaningful spectrum estimate.
    RuntimeError
        If MNE / NumPy / SciPy are missing.
    """
    if not _HAS_MNE or not _HAS_NUMPY:
        raise RuntimeError("MNE-Python and NumPy are required")

    try:
        from scipy.signal import welch as scipy_welch  # type: ignore[import-not-found]
    except ImportError as exc:
        raise RuntimeError("SciPy is required for Welch PSD") from exc

    try:
        from deepsynaps_qeeg import FREQ_BANDS  # type: ignore[import-not-found]
    except ImportError:
        FREQ_BANDS = {  # noqa: N806 — fallback mirrors package defaults
            "delta": (1.0, 4.0),
            "theta": (4.0, 8.0),
            "alpha": (8.0, 13.0),
            "beta": (13.0, 30.0),
            "gamma": (30.0, 45.0),
        }

    bands: dict[str, tuple[float, float]] = (
        band_defs if band_defs is not None else dict(FREQ_BANDS)
    )

    duration = float(end_sec) - float(start_sec)
    if duration <= 0:
        raise ApiServiceError(
            code="invalid_window",
            message="end_sec must be greater than start_sec",
            status_code=422,
        )
    if duration > _MAX_WINDOW_SEC:
        raise ApiServiceError(
            code="invalid_window",
            message=f"Window duration exceeds {_MAX_WINDOW_SEC:.0f} s",
            status_code=422,
        )
    if float(start_sec) < 0:
        raise ApiServiceError(
            code="invalid_window",
            message="start_sec must be non-negative",
            status_code=422,
        )

    try:
        raw = load_raw_for_analysis(analysis_id, db)
    except FileNotFoundError as exc:
        raise ApiServiceError(
            code="raw_unavailable",
            message="Raw EEG file is not available for this analysis.",
            status_code=503,
        ) from exc
    except ValueError as exc:
        raise ApiServiceError(
            code="not_found",
            message=str(exc),
            status_code=404,
        ) from exc

    sfreq = float(raw.info["sfreq"])
    total_dur = float(raw.times[-1]) if len(raw.times) > 0 else 0.0
    if total_dur <= 0:
        raise ApiServiceError(
            code="raw_unavailable",
            message="Recording has zero duration.",
            status_code=503,
        )

    t0 = max(0.0, float(start_sec))
    t1 = min(float(end_sec), total_dur)
    if t0 >= total_dur:
        raise ApiServiceError(
            code="invalid_window",
            message="start_sec is beyond the end of the recording",
            status_code=422,
        )
    if t1 <= t0:
        raise ApiServiceError(
            code="invalid_window",
            message="Selected window has no samples after clamping to recording bounds",
            status_code=422,
        )

    warnings: list[str] = []
    if float(end_sec) > total_dur + 1e-6:
        warnings.append("window_end_clamped_to_recording")
    win_len = t1 - t0
    if win_len < 2.0:
        warnings.append("short_window_spectral_resolution_reduced")

    # Match pipeline Welch settings
    try:
        from deepsynaps_qeeg.features.spectral import (  # type: ignore[import-not-found]
            WELCH_OVERLAP,
            WELCH_WINDOW_SEC,
        )
    except ImportError:
        WELCH_WINDOW_SEC = 4.0  # noqa: N806
        WELCH_OVERLAP = 0.5  # noqa: N806

    raw_win = raw.copy().crop(tmin=t0, tmax=t1)

    eeg_picks = mne.pick_types(raw_win.info, eeg=True, exclude=[])
    eeg_names = [raw_win.ch_names[i] for i in eeg_picks]
    if not eeg_names:
        raise ApiServiceError(
            code="no_eeg_channels",
            message="No EEG channels found in this recording.",
            status_code=422,
        )

    if channels:
        picked_names: list[str] = []
        unknown: list[str] = []
        for req in channels:
            resolved = _resolve_eeg_channel(raw_win, req, eeg_names)
            if resolved is None:
                unknown.append(req)
            elif resolved not in picked_names:
                picked_names.append(resolved)
        if unknown:
            raise ApiServiceError(
                code="unknown_channels",
                message=f"Unknown or ambiguous EEG channels: {', '.join(unknown)}",
                status_code=422,
                details={"unknown": unknown, "available": eeg_names},
            )
        use_names = picked_names
    else:
        use_names = list(eeg_names)

    picks_idx = [raw_win.ch_names.index(n) for n in use_names]
    data_v, _times = raw_win[picks_idx, :]  # Volts
    n_samples = int(data_v.shape[1])
    if n_samples < 32:
        raise ApiServiceError(
            code="window_too_short",
            message="Window has too few samples for spectral estimation",
            status_code=422,
        )

    n_per_seg = int(min(WELCH_WINDOW_SEC * sfreq, n_samples))
    n_per_seg = max(n_per_seg, 8)
    n_overlap = int(n_per_seg * WELCH_OVERLAP)

    freqs_hz: Any
    psd_v2_hz: Any
    freqs_hz, psd_v2_hz = scipy_welch(
        data_v,
        fs=sfreq,
        nperseg=n_per_seg,
        noverlap=n_overlap,
        axis=-1,
        scaling="density",
    )

    fmask = (freqs_hz >= _PSD_FREQ_RANGE[0]) & (freqs_hz <= _PSD_FREQ_RANGE[1])
    freqs_hz = np.asarray(freqs_hz[fmask], dtype=float)
    psd_v2_hz = np.asarray(psd_v2_hz[:, fmask], dtype=float)
    psd_uv2_hz = psd_v2_hz * _UV2_PER_HZ_SCALE

    freqs_list = [float(x) for x in freqs_hz.tolist()]
    per_channel_psd: dict[str, list[float]] = {}
    for i, name in enumerate(use_names):
        per_channel_psd[name] = [float(x) for x in psd_uv2_hz[i].tolist()]

    averaged_psd: list[float] | None = None
    if average_channels:
        averaged_psd = [float(x) for x in np.mean(psd_uv2_hz, axis=0).tolist()]

    total_full = _integrate_psd_band(freqs_hz, psd_uv2_hz, *_PSD_FREQ_RANGE)

    abs_per_ch: dict[str, dict[str, float]] = {}
    rel_per_ch: dict[str, dict[str, float]] = {}
    for i, ch in enumerate(use_names):
        abs_per_ch[ch] = {}
        rel_per_ch[ch] = {}
        tot = float(total_full[i]) if total_full.size > i else 0.0
        for bname, (lo, hi) in bands.items():
            ab = float(
                _integrate_psd_band(
                    freqs_hz, psd_uv2_hz[i : i + 1], lo, hi
                )[0]
            )
            abs_per_ch[ch][bname] = ab
            rel_per_ch[ch][bname] = float(ab / tot) if tot > 0 else 0.0

    band_avg: dict[str, float] | None = None
    band_avg_rel: dict[str, float] | None = None
    if average_channels:
        band_avg = {}
        band_avg_rel = {}
        tot_mean = float(np.mean(total_full)) if total_full.size else 0.0
        for bname, (lo, hi) in bands.items():
            band_vals = _integrate_psd_band(freqs_hz, psd_uv2_hz, lo, hi)
            band_avg[bname] = float(np.mean(band_vals))
            band_avg_rel[bname] = (
                float(band_avg[bname] / tot_mean) if tot_mean > 0 else 0.0
            )

    warnings.extend(_bad_segment_overlap_warnings(analysis_id, db, t0, t1))

    if n_per_seg < int(0.5 * WELCH_WINDOW_SEC * sfreq):
        warnings.append("welch_segment_shortened_insufficient_samples")

    quality_flags: list[str] = []
    if any("bad_segment" in w for w in warnings):
        quality_flags.append("bad_segment_overlap")

    return {
        "analysis_id": analysis_id,
        "window": {
            "start_sec": float(t0),
            "end_sec": float(t1),
            "duration_sec": float(t1 - t0),
        },
        "sfreq": sfreq,
        "channels": use_names,
        "frequencies": freqs_list,
        "psd": {
            "per_channel": per_channel_psd,
            "averaged": averaged_psd,
        },
        "band_power": {
            "absolute": {"per_channel": abs_per_ch, "averaged": band_avg},
            "relative": {"per_channel": rel_per_ch, "averaged": band_avg_rel},
        },
        "warnings": warnings,
        "quality_flags": quality_flags,
        "method_provenance": {
            "psd_method": "welch",
            "welch_window_sec": float(WELCH_WINDOW_SEC),
            "welch_overlap": float(WELCH_OVERLAP),
            "freq_range_hz": list(_PSD_FREQ_RANGE),
            "units_psd": "uV2_per_Hz",
            "units_band_power": "uV2_integrated",
            "n_per_seg": int(n_per_seg),
            "n_overlap": int(n_overlap),
        },
        "clinician_review_required": True,
        "decision_support_only": True,
    }

