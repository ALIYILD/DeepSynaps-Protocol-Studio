"""Studio EEG viewer — windowed traces + ephemeral markers (dev/in-memory)."""

from __future__ import annotations

import base64
import json
import math
import uuid
from collections import defaultdict
from typing import Any

import numpy as np
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

import asyncio
import os
import tempfile

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.database import get_db_session
from app.eeg.montage import PRESET_SPECS, apply_montage_to_window
from app.routers.montages_router import get_recording_montage_pref, get_user_montage
from app.persistence.models import QEEGAnalysis
from app.routers.qeeg_raw_router import _load_analysis, _require_mne

router = APIRouter(prefix="/api/v1/studio/eeg", tags=["studio-eeg"])

_STUDIO_MARKERS: dict[str, list[dict[str, Any]]] = defaultdict(list)


class MarkerIn(BaseModel):
    kind: str = Field(..., pattern="^(label|artifact|fragment)$")
    fromSec: float
    toSec: float | None = None
    text: str | None = None


class BandrangeIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    low_hz: float = Field(..., alias="lowHz")
    high_hz: float = Field(..., alias="highHz")
    transition_hz: float = Field(0.5, alias="transitionHz")
    window: str = "hamming"
    band_label: str = Field("Alpha", alias="bandLabel")
    output_name: str = Field(..., alias="outputName")
    apply_to: str = Field("eeg", alias="applyTo")
    selection_channels: list[str] | None = Field(None, alias="selectionChannels")
    visualize_only: bool = Field(False, alias="visualizeOnly")


FILTER_PAD_SEC = 12.0


def _encode_rows(rows: list[list[float]]) -> list[Any]:
    """Prefer compact base64 float32 blobs for large payloads."""
    out: list[Any] = []
    for row in rows:
        arr = np.asarray(row, dtype=np.float32)
        if arr.size > 2048:
            raw = arr.tobytes()
            out.append(base64.standard_b64encode(raw).decode("ascii"))
        else:
            out.append(row)
    return out


def _parse_filter_overrides(raw: str | None) -> dict[str, dict[str, Any]]:
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    if not isinstance(data, dict):
        return {}
    out: dict[str, dict[str, Any]] = {}
    for k, v in data.items():
        if isinstance(v, dict):
            out[str(k)] = dict(v)
    return out


def _apply_live_filters(
    *,
    rows: list[list[float]],
    channels: list[str],
    sfreq: float,
    t_win_start: float,
    from_sec: float,
    to_sec: float,
    max_points: int,
    low_cut_s: float | None,
    high_cut_hz: float | None,
    notch_key: str,
    baseline_uv: float,
    filter_overrides: dict[str, dict[str, Any]],
) -> tuple[list[list[float]], float, list[str]]:
    """Pad-aware pipeline already applied to extended rows — crop, DC, baseline, decimate."""
    from app.eeg.filters_iir import (
        apply_per_channel_iir,
        apply_sosfilt_rows,
        build_iir_sos_chain,
        crop_rows_to_visible,
        decimate_rows_uniform,
        subtract_baseline_uv,
        subtract_epoch_mean_rows,
    )

    warns: list[str] = []
    use_filters = (
        (low_cut_s is not None and low_cut_s > 0)
        or (high_cut_hz is not None and high_cut_hz > 0)
        or (notch_key and notch_key != "none")
    )
    if use_filters:
        if filter_overrides:
            rows, fw = apply_per_channel_iir(
                rows,
                channels,
                sfreq,
                default_low_s=low_cut_s,
                default_high_hz=high_cut_hz,
                default_notch=notch_key,
                overrides=filter_overrides,
            )
            warns.extend(fw)
        else:
            sos, fw = build_iir_sos_chain(
                sfreq,
                low_cut_s=low_cut_s,
                high_cut_hz=high_cut_hz,
                notch_key=notch_key,
            )
            warns.extend(fw)
            rows = apply_sosfilt_rows(rows, sfreq, sos)

    rows = crop_rows_to_visible(
        rows,
        sfreq=sfreq,
        window_t_start=t_win_start,
        vis_from=from_sec,
        vis_to=to_sec,
    )
    rows = subtract_epoch_mean_rows(rows)
    if abs(baseline_uv) > 1e-15:
        rows = subtract_baseline_uv(rows, baseline_uv)

    rows, stride = decimate_rows_uniform(rows, max_points)
    eff_sfreq = sfreq / float(stride)
    return rows, eff_sfreq, warns


@router.get("/{analysis_id}/window")
def studio_eeg_window(
    analysis_id: str,
    fromSec: float = Query(..., alias="fromSec"),
    toSec: float = Query(..., alias="toSec"),
    maxPoints: int = Query(8000, alias="maxPoints", ge=64, le=50_000),
    channels: str | None = Query(None, description="Comma-separated channel names"),
    montageId: str | None = Query(None, alias="montageId"),
    badChannels: str | None = Query(None, alias="badChannels"),
    lowCutS: float | None = Query(None, alias="lowCutS"),
    highCutHz: float | None = Query(None, alias="highCutHz"),
    notch: str | None = Query(None, alias="notch"),
    baselineUv: float = Query(0.0, alias="baselineUv"),
    filterOverrides: str | None = Query(None, alias="filterOverrides"),
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    """Return a viewer-shaped signal window (µV, downsampled server-side)."""
    require_minimum_role(actor, "clinician")
    _load_analysis(analysis_id, db, actor)
    _require_mne()

    from app.services.eeg_signal_service import (
        extract_signal_window,
        extract_signal_window_rest,
        load_raw_for_analysis,
    )

    raw = load_raw_for_analysis(analysis_id, db)
    ch_list = [c.strip() for c in channels.split(",")] if channels else None

    effective_mid = montageId or get_recording_montage_pref(analysis_id) or "builtin:raw"
    bad_set = {b.strip() for b in badChannels.split(",") if b.strip()} if badChannels else set()

    montage_warns: list[str] = []
    ov = _parse_filter_overrides(filterOverrides)

    low_s = None if lowCutS is None or lowCutS <= 0 else float(lowCutS)
    high_hz = None if highCutHz is None or highCutHz <= 0 else float(highCutHz)
    notch_key = (notch or "none").strip() or "none"

    ext_from = max(0.0, fromSec - FILTER_PAD_SEC)
    vis_span = max(toSec - fromSec, 0.01)
    ext_span = max(toSec - ext_from, vis_span)
    ratio = min(12.0, ext_span / vis_span)
    inner_max = min(50_000, max(maxPoints, int(math.ceil(maxPoints * ratio))))

    if effective_mid == "builtin:rest":
        window, rw = extract_signal_window_rest(
            raw,
            t_start=ext_from,
            t_end=toSec,
            channels=ch_list,
            max_points_per_channel=inner_max,
        )
        montage_warns.extend(rw)
        out_channels = list(window["channels"])
        rows = window["data"]
    else:
        window = extract_signal_window(
            raw,
            t_start=ext_from,
            t_end=toSec,
            window_sec=max(toSec - ext_from, 0.01),
            channels=ch_list,
            max_points_per_channel=inner_max,
        )
        user_spec = (
            get_user_montage(effective_mid)
            if effective_mid not in PRESET_SPECS
            else None
        )
        out_channels, rows, mw, _meta = apply_montage_to_window(
            ch_names=list(window["channels"]),
            data_rows=window["data"],
            montage_id=effective_mid,
            bad_channels=bad_set,
            user_spec=user_spec,
        )
        montage_warns.extend(mw)

    sfreq = float(window["sfreq"])
    t_start = float(window["t_start"])

    rows, eff_sfreq, fwarn = _apply_live_filters(
        rows=rows,
        channels=out_channels,
        sfreq=sfreq,
        t_win_start=t_start,
        from_sec=fromSec,
        to_sec=toSec,
        max_points=maxPoints,
        low_cut_s=low_s,
        high_cut_hz=high_hz,
        notch_key=notch_key,
        baseline_uv=float(baselineUv),
        filter_overrides=ov,
    )
    montage_warns.extend(fwarn)

    encoded = _encode_rows(rows)

    return {
        "sampleRateHz": float(eff_sfreq),
        "channels": out_channels,
        "fromSec": float(fromSec),
        "toSec": float(toSec),
        "data": encoded,
        "totalDurationSec": float(window["total_duration_sec"]),
        "fragments": [],
        "events": _STUDIO_MARKERS.get(analysis_id, []),
        "montageId": effective_mid,
        "montageWarnings": montage_warns,
        "filterWarnings": fwarn,
    }


@router.get("/bandrange-presets")
def studio_bandrange_presets(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    require_minimum_role(actor, "clinician")
    from app.eeg.bandrange_presets import preset_to_payload

    return {"presets": preset_to_payload()}


@router.post("/{analysis_id}/bandrange")
def create_bandrange_derivative(
    analysis_id: str,
    body: BandrangeIn,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    """Offline FIR band-pass → new ``QEEGAnalysis`` row + uploaded EDF (sibling recording)."""
    require_minimum_role(actor, "clinician")
    parent = _load_analysis(analysis_id, db, actor)
    _require_mne()

    if body.visualize_only:
        return {
            "ok": True,
            "derivativeAnalysisId": None,
            "message": "visualizeOnly not persisted — use false for derivative upload",
        }

    from mne.io import RawArray  # type: ignore[import-untyped]

    from app.eeg.filters_fir import fir_bandpass_zero_phase
    from app.services import media_storage
    from app.services.eeg_signal_service import clear_caches, load_raw_for_analysis
    from app.settings import get_settings

    raw = load_raw_for_analysis(analysis_id, db)

    data_v = raw.get_data()
    sfreq = float(raw.info["sfreq"])
    d_uv = data_v * 1e6
    win = body.window.lower()
    if win not in ("hamming", "blackman", "kaiser"):
        win = "hamming"

    ch_names = list(raw.ch_names)
    n_ch = int(data_v.shape[0])
    apply_mode = (body.apply_to or "eeg").strip().lower()
    pick_idx: list[int]
    if apply_mode == "selection" and body.selection_channels:
        want = {str(x) for x in body.selection_channels}
        pick_idx = [i for i, nm in enumerate(ch_names) if nm in want]
        if not pick_idx:
            pick_idx = list(range(n_ch))
    elif apply_mode == "all":
        pick_idx = list(range(n_ch))
    else:
        # EEG channels only (default)
        try:
            import mne  # type: ignore[import-not-found]

            picks = mne.pick_types(raw.info, meg=False, eeg=True, exclude=[])
            pick_idx = [int(i) for i in picks]
        except Exception:
            pick_idx = list(range(n_ch))
        if not pick_idx:
            pick_idx = list(range(n_ch))

    filt_uv = np.asarray(d_uv, dtype=np.float64, order="C")
    sub = filt_uv[pick_idx, :]
    sub_f = fir_bandpass_zero_phase(
        sub,
        sfreq,
        body.low_hz,
        body.high_hz,
        transition_hz=float(body.transition_hz),
        window=win,  # type: ignore[arg-type]
    )
    filt_uv[pick_idx, :] = sub_f
    data_out_v = filt_uv / 1e6
    info = raw.info
    new_raw = RawArray(data_out_v, info)

    new_id = str(uuid.uuid4())
    suffix = ".edf"
    safe_name = "".join(c for c in body.output_name if c.isalnum() or c in "._- ")[:120]
    out_fn = f"{safe_name or 'bandrange'}_{new_id[:8]}{suffix}"

    settings = get_settings()
    parent_ref = parent.file_ref or "qeeg/uploads"
    folder = parent_ref.rsplit("/", 1)[0] if "/" in parent_ref else "qeeg/uploads"
    file_ref = f"{folder}/bandrange/{new_id}{suffix}"

    tmp_path = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
    tmp_path.close()
    try:
        new_raw.save(tmp_path.name, overwrite=True)
        with open(tmp_path.name, "rb") as fh:
            blob = fh.read()
        asyncio.run(media_storage.write_upload(file_ref, blob, settings))
    finally:
        try:
            os.unlink(tmp_path.name)
        except OSError:
            pass

    meta = {
        "derivative_of": analysis_id,
        "derivative_kind": "fir_bandrange",
        "band": body.band_label,
        "low_hz": body.low_hz,
        "high_hz": body.high_hz,
        "transition_hz": body.transition_hz,
        "window": win,
        "apply_to": body.apply_to,
    }
    child = QEEGAnalysis(
        id=new_id,
        qeeg_record_id=parent.qeeg_record_id,
        patient_id=parent.patient_id,
        clinician_id=actor.actor_id,
        file_ref=file_ref,
        original_filename=out_fn,
        file_size_bytes=len(blob),
        recording_duration_sec=parent.recording_duration_sec,
        sample_rate_hz=parent.sample_rate_hz,
        channels_json=parent.channels_json,
        channel_count=parent.channel_count,
        recording_date=parent.recording_date,
        eyes_condition=parent.eyes_condition,
        equipment=parent.equipment,
        course_id=parent.course_id,
        analysis_status="pending",
        analysis_params_json=json.dumps(meta),
    )
    db.add(child)
    db.commit()
    clear_caches(new_id)

    return {
        "ok": True,
        "derivativeAnalysisId": new_id,
        "fileRef": file_ref,
        "openUrl": f"/studio/?id={new_id}",
        "meta": meta,
    }


@router.post("/{analysis_id}/markers")
def post_marker(
    analysis_id: str,
    body: MarkerIn,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    require_minimum_role(actor, "clinician")
    _load_analysis(analysis_id, db, actor)
    mid = str(uuid.uuid4())
    entry = {
        "id": mid,
        "kind": body.kind,
        "fromSec": body.fromSec,
        "toSec": body.toSec,
        "text": body.text,
    }
    _STUDIO_MARKERS[analysis_id].append(entry)
    return {"ok": True, "marker": entry}


@router.delete("/{analysis_id}/markers/{marker_id}")
def delete_marker(
    analysis_id: str,
    marker_id: str,
    db: Session = Depends(get_db_session),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> dict[str, Any]:
    require_minimum_role(actor, "clinician")
    _load_analysis(analysis_id, db, actor)
    lst = _STUDIO_MARKERS.get(analysis_id, [])
    _STUDIO_MARKERS[analysis_id] = [m for m in lst if m.get("id") != marker_id]
    return {"ok": True}
