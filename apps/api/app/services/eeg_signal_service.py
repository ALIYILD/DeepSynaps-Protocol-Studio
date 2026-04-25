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


_raw_cache: dict[str, Any] = _make_cache(maxsize=4, ttl=600)
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
        from deepsynaps_qeeg import artifacts  # type: ignore[import-not-found]
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
    from app.services.qeeg_pipeline import HAS_MNE_PIPELINE, run_pipeline_safe

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
