"""Clinical Safety Cockpit + Red Flag Detector for qEEG analyses.

Non-diagnostic. Decision-support only. All outputs require clinician review.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any, Optional

from app.persistence.models import QEEGAnalysis

_log = logging.getLogger(__name__)


# ── Safety thresholds ────────────────────────────────────────────────────────
_MIN_DURATION_SEC = 60.0
_MIN_SAMPLE_RATE_HZ = 128.0
_MIN_CHANNEL_COUNT = 19
_MIN_EPOCHS_RETAINED_PCT = 60.0
_GOOD_EPOCHS_RETAINED_PCT = 80.0
_MAX_BAD_CHANNEL_PCT = 30.0
_MAX_ARTIFACT_BURDEN_PCT = 40.0

# ── Red-flag keyword scanners ────────────────────────────────────────────────
_MEDICATION_CONFOUND_KEYWORDS = [
    "benzodiazepine", "diazepam", "lorazepam", "clonazepam", "alprazolam",
    "sedation", "sedated", "general anaesthetic", "general anesthetic",
    "propofol", "midazolam", "barbiturate", "phenobarbital",
]

_ACUTE_NEURO_KEYWORDS = [
    "acute stroke", " seizures ", "status epilepticus", "intracranial hemorrhage",
    "subarachnoid hemorrhage", "head trauma", "concussion", "loss of consciousness",
    "encephalitis", "meningitis", "acute confusion",
]

_SELF_HARM_KEYWORDS = [
    "suicide", "self-harm", "self harm", "kill myself", "want to die",
    "end my life", "overdose", "no reason to live",
]


# ── Clinical Safety Cockpit ──────────────────────────────────────────────────

def compute_safety_cockpit(analysis: QEEGAnalysis) -> dict[str, Any]:
    """Return a structured safety panel for the qEEG recording."""
    checks: list[dict] = []
    red_flags: list[dict] = []

    # Duration
    duration = analysis.recording_duration_sec or 0.0
    if duration >= _MIN_DURATION_SEC:
        checks.append({"label": "Duration", "status": "pass", "detail": f"{duration:.1f}s"})
    else:
        checks.append({"label": "Duration", "status": "fail", "detail": f"{duration:.1f}s (need ≥ {_MIN_DURATION_SEC}s)"})
        red_flags.append({"code": "DURATION_SHORT", "severity": "high", "message": "Recording duration below minimum for reliable interpretation."})

    # Sample rate
    sfreq = analysis.sample_rate_hz or 0.0
    if sfreq >= _MIN_SAMPLE_RATE_HZ:
        checks.append({"label": "Sample rate", "status": "pass", "detail": f"{sfreq:.0f} Hz"})
    else:
        checks.append({"label": "Sample rate", "status": "fail", "detail": f"{sfreq:.0f} Hz (need ≥ {_MIN_SAMPLE_RATE_HZ} Hz)"})
        red_flags.append({"code": "SFREQ_LOW", "severity": "high", "message": "Sample rate too low for clinical qEEG."})

    # Channel count
    n_ch = analysis.channel_count or 0
    if n_ch >= _MIN_CHANNEL_COUNT:
        checks.append({"label": "Channels", "status": "pass", "detail": f"{n_ch}"})
    else:
        checks.append({"label": "Channels", "status": "warn", "detail": f"{n_ch} (ideal ≥ {_MIN_CHANNEL_COUNT})"})
        red_flags.append({"code": "CHANNELS_LOW", "severity": "medium", "message": "Channel count below full 10-20 montage."})

    # Eyes condition
    eyes = analysis.eyes_condition
    if eyes and eyes.lower() in ("open", "closed"):
        checks.append({"label": "Eyes condition", "status": "pass", "detail": eyes})
    else:
        checks.append({"label": "Eyes condition", "status": "warn", "detail": eyes or "unspecified"})
        red_flags.append({"code": "EYES_UNSPECIFIED", "severity": "low", "message": "Eyes open/closed condition not recorded."})

    # Artifact rejection / epochs retained
    artifact = _json_loads(analysis.artifact_rejection_json) or {}
    epochs_total = artifact.get("epochs_total") or artifact.get("n_epochs_total") or 0
    epochs_kept = artifact.get("epochs_kept") or artifact.get("n_epochs_retained") or 0
    if epochs_total and epochs_total > 0:
        epoch_pct = (epochs_kept / epochs_total) * 100.0
        checks.append({"label": "Epochs retained", "status": _epoch_status(epoch_pct), "detail": f"{epoch_pct:.0f}% ({epochs_kept}/{epochs_total})"})
        if epoch_pct < _MIN_EPOCHS_RETAINED_PCT:
            red_flags.append({"code": "EPOCHS_LOW", "severity": "high", "message": f"Only {epoch_pct:.0f}% epochs retained — repeat recording recommended."})
        elif epoch_pct < _GOOD_EPOCHS_RETAINED_PCT:
            red_flags.append({"code": "EPOCHS_BORDERLINE", "severity": "medium", "message": f"{epoch_pct:.0f}% epochs retained — interpret cautiously."})
    else:
        checks.append({"label": "Epochs retained", "status": "warn", "detail": "Unknown"})

    # Bad channels
    quality = _json_loads(analysis.quality_metrics_json) or {}
    bad_channels = quality.get("bad_channels") or []
    bad_pct = (len(bad_channels) / max(n_ch, 1)) * 100.0 if n_ch else 0.0
    if bad_pct <= _MAX_BAD_CHANNEL_PCT:
        checks.append({"label": "Bad channels", "status": "pass" if bad_pct == 0 else "warn", "detail": f"{len(bad_channels)} ({bad_pct:.0f}%)"})
    else:
        checks.append({"label": "Bad channels", "status": "fail", "detail": f"{len(bad_channels)} ({bad_pct:.0f}%)"})
        red_flags.append({"code": "BAD_CHANNELS_HIGH", "severity": "high", "message": f"{bad_pct:.0f}% channels rejected — montage integrity compromised."})

    # Preprocessing completion
    pipeline = analysis.pipeline_version
    if pipeline:
        checks.append({"label": "Preprocessing", "status": "pass", "detail": f"Pipeline {pipeline}"})
    else:
        checks.append({"label": "Preprocessing", "status": "warn", "detail": "Legacy / unverified"})

    # Montage completeness (from channels_json)
    channels = _json_loads(analysis.channels_json) or []
    standard_1020 = ["Fp1","Fp2","F7","F3","Fz","F4","F8","T3","C3","Cz","C4","T4","T5","P3","Pz","P4","T6","O1","O2"]
    present = [c for c in standard_1020 if c in channels]
    montage_pct = (len(present) / len(standard_1020)) * 100.0 if standard_1020 else 0.0
    checks.append({"label": "Montage completeness", "status": "pass" if montage_pct >= 95 else "warn", "detail": f"{len(present)}/{len(standard_1020)} ({montage_pct:.0f}%)"})

    return {
        "checks": checks,
        "red_flags": red_flags,
        "overall_status": _overall_status(checks, red_flags),
        "disclaimer": "Research and wellness use only. Decision-support output requires clinician review and is not a medical diagnosis or treatment recommendation. Discuss any findings with a qualified clinician.",
    }


def _epoch_status(pct: float) -> str:
    if pct >= _GOOD_EPOCHS_RETAINED_PCT:
        return "pass"
    if pct >= _MIN_EPOCHS_RETAINED_PCT:
        return "warn"
    return "fail"


def _overall_status(checks: list[dict], red_flags: list[dict]) -> str:
    fail_count = sum(1 for c in checks if c["status"] == "fail")
    high_flags = sum(1 for f in red_flags if f["severity"] == "high")
    if high_flags > 0 or fail_count > 1:
        return "REPEAT_RECOMMENDED"
    if fail_count == 1 or any(f["severity"] == "medium" for f in red_flags):
        return "LIMITED_QUALITY"
    return "VALID_FOR_REVIEW"


def compute_interpretability_status(cockpit: dict) -> str:
    """Return canonical interpretability status from a safety cockpit."""
    return cockpit.get("overall_status", "LIMITED_QUALITY")


# ── Red Flag Detector ────────────────────────────────────────────────────────

def detect_red_flags(analysis: QEEGAnalysis, notes: Optional[str] = None) -> dict[str, Any]:
    """Non-diagnostic safety scanner for patterns requiring clinician attention."""
    flags: list[dict] = []

    band_powers = _json_loads(analysis.band_powers_json) or {}
    normative = _json_loads(analysis.normative_zscores_json) or {}
    quality = _json_loads(analysis.quality_metrics_json) or {}
    artifact = _json_loads(analysis.artifact_rejection_json) or {}

    # 1. Possible epileptiform activity heuristic
    # Look for sharp transient power spikes in beta/gamma on single channels
    bands = band_powers.get("bands") or {}
    for band in ("beta", "gamma"):
        ch_data = (bands.get(band) or {}).get("channels") or {}
        for ch, vals in ch_data.items():
            abs_power = float(vals.get("absolute_uv2") or 0)
            # Heuristic: extremely high absolute power in high frequencies on a single channel
            if abs_power > 200:  # µV² — arbitrary conservative threshold
                flags.append({
                    "code": "EPILEPTIFORM_HEURISTIC",
                    "severity": "high",
                    "title": "Possible epileptiform activity",
                    "message": f"Elevated high-frequency power at {ch} ({abs_power:.1f} µV²). Review raw tracing for sharp waves or spikes.",
                    "action": "Review raw EEG by a qualified clinician. Do not rely on this flag alone.",
                })
                break
        if any(f["code"] == "EPILEPTIFORM_HEURISTIC" for f in flags):
            break

    # 2. Severe focal asymmetry
    z_by_channel: dict[str, dict[str, float]] = {}
    if isinstance(normative, dict) and "spectral" in normative:
        z_bands = normative["spectral"].get("bands") or {}
        for band, payload in z_bands.items():
            abs_z = payload.get("absolute_uv2") or {}
            for ch, z in abs_z.items():
                z_by_channel.setdefault(ch, {})[band] = float(z or 0)
    else:
        # Legacy flat format
        for ch, bands in normative.items():
            if isinstance(bands, dict) and not ch.startswith(("flagged", "norm_db")):
                z_by_channel[ch] = {b: float(v or 0) for b, v in bands.items()}

    for ch, band_z in z_by_channel.items():
        max_z = max(abs(v) for v in band_z.values()) if band_z else 0
        if max_z > 3.0:
            flags.append({
                "code": "FOCAL_ASYMMETRY_SEVERE",
                "severity": "high",
                "title": "Severe focal asymmetry",
                "message": f"{ch} shows extreme normative deviation (|z| > 3).",
                "action": "Correlate with clinical history and raw EEG. Consider structural imaging.",
            })

    # 3. Excessive slowing
    delta_z = _mean_band_z(z_by_channel, "delta")
    theta_z = _mean_band_z(z_by_channel, "theta")
    if delta_z is not None and delta_z > 2.5:
        flags.append({
            "code": "EXCESSIVE_SLOWING_DELTA",
            "severity": "high",
            "title": "Excessive delta slowing",
            "message": f"Mean delta z-score = {delta_z:.2f}.",
            "action": "Assess for encephalopathy, medication effect, or sleepiness.",
        })
    if theta_z is not None and theta_z > 2.5:
        flags.append({
            "code": "EXCESSIVE_SLOWING_THETA",
            "severity": "medium",
            "title": "Excessive theta slowing",
            "message": f"Mean theta z-score = {theta_z:.2f}.",
            "action": "Correlate with age, medication, and cognitive status.",
        })

    # 4. Very poor signal quality
    epochs_total = artifact.get("epochs_total") or artifact.get("n_epochs_total") or 0
    epochs_kept = artifact.get("epochs_kept") or artifact.get("n_epochs_retained") or 0
    epoch_pct = (epochs_kept / epochs_total) * 100.0 if epochs_total else 100.0
    n_ch = analysis.channel_count or 0
    bad_channels = quality.get("bad_channels") or []
    bad_pct = (len(bad_channels) / max(n_ch, 1)) * 100.0 if n_ch else 0.0
    if epoch_pct < 50.0:
        flags.append({
            "code": "SIGNAL_QUALITY_POOR",
            "severity": "high",
            "title": "Very poor signal quality",
            "message": f"Only {epoch_pct:.0f}% epochs retained.",
            "action": "Repeat recording after addressing electrode impedance and patient movement.",
        })
    elif bad_pct > 30.0:
        flags.append({
            "code": "SIGNAL_QUALITY_POOR",
            "severity": "high",
            "title": "Very poor signal quality",
            "message": f"{bad_pct:.0f}% channels rejected.",
            "action": "Repeat recording after addressing electrode impedance and patient movement.",
        })

    # 5. Medication / sedation confound
    if notes:
        lowered = notes.lower()
        for kw in _MEDICATION_CONFOUND_KEYWORDS:
            if kw in lowered:
                flags.append({
                    "code": "MEDICATION_CONFOUND",
                    "severity": "medium",
                    "title": "Medication / sedation confound possible",
                    "message": f"Keyword '{kw}' detected in notes.",
                    "action": "Interpret qEEG in context of current medications. Consider medication washout if clinically appropriate.",
                })
                break

    # 6. Acute neurological concern
    if notes:
        lowered = notes.lower()
        for kw in _ACUTE_NEURO_KEYWORDS:
            if kw in lowered:
                flags.append({
                    "code": "ACUTE_NEURO_CONCERN",
                    "severity": "high",
                    "title": "Acute neurological concern noted",
                    "message": f"Keyword '{kw}' detected in notes.",
                    "action": "Urgent clinician review required. qEEG is not a substitute for emergency assessment.",
                })
                break

    # 7. Self-harm / emergency wording
    if notes:
        lowered = notes.lower()
        for kw in _SELF_HARM_KEYWORDS:
            if kw in lowered:
                flags.append({
                    "code": "SELF_HARM_EMERGENCY",
                    "severity": "high",
                    "title": "Self-harm or emergency wording detected",
                    "message": f"Keyword '{kw}' detected in notes.",
                    "action": "Immediate clinician intervention required. Follow local crisis protocols.",
                })
                break

    if flags:
        _log.warning(
            "qeeg_red_flag_detected",
            extra={
                "event": "qeeg_red_flag_detected",
                "flag_count": len(flags),
                "high_severity_count": sum(1 for f in flags if f["severity"] == "high"),
                "codes": [f["code"] for f in flags],
            },
        )

    return {
        "flags": flags,
        "flag_count": len(flags),
        "high_severity_count": sum(1 for f in flags if f["severity"] == "high"),
        "disclaimer": "Research and wellness use only. Decision-support output requires clinician review and is not a medical diagnosis or treatment recommendation. Discuss any findings with a qualified clinician.",
    }


# ── Helpers ──────────────────────────────────────────────────────────────────

def _json_loads(raw: Optional[str]) -> Optional[Any]:
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        return None


def _mean_band_z(z_by_channel: dict[str, dict[str, float]], band: str) -> Optional[float]:
    values = [band_z.get(band) or 0 for band_z in z_by_channel.values() if band in band_z]
    if not values:
        return None
    return sum(values) / len(values)


# ── Phase 4: red-flag → AdverseEvent escalation ──────────────────────────────
# When detect_red_flags() surfaces a high-severity pattern (epileptiform,
# severe focal asymmetry, severe slowing, very poor signal quality, acute
# neuro concern, self-harm wording), enqueue a corresponding AdverseEvent
# row so the existing Clinical Hub adverse-events feed surfaces it without
# clinician hand-curation. Decision-support only — never auto-resolves.

_AE_TYPE_BY_FLAG: dict[str, str] = {
    "EPILEPTIFORM_HEURISTIC": "qeeg_red_flag_epileptiform",
    "FOCAL_ASYMMETRY_SEVERE": "qeeg_red_flag_focal_asymmetry",
    "EXCESSIVE_SLOWING_DELTA": "qeeg_red_flag_slowing",
    "EXCESSIVE_SLOWING_THETA": "qeeg_red_flag_slowing",
    "SIGNAL_QUALITY_POOR": "qeeg_quality_alert",
    "ACUTE_NEURO_CONCERN": "qeeg_red_flag_acute_neuro",
    "SELF_HARM_EMERGENCY": "qeeg_red_flag_self_harm",
}


def escalate_red_flags_to_adverse_events(
    analysis: "QEEGAnalysis",
    red_flags: list[dict[str, Any]] | None,
    db,
) -> list[str]:
    """Persist one AdverseEvent row per high-severity red flag.

    Idempotent across calls within the same minute: if a same-type AE for
    this patient already exists in the last 60 seconds, the new one is
    skipped (covers re-runs of the safety engine on the same analysis).

    Returns the list of AdverseEvent.ids that were created.
    """
    if not red_flags:
        return []
    # Local imports to avoid cycles at module load time
    from datetime import datetime, timedelta, timezone
    from app.persistence.models import AdverseEvent

    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(seconds=60)
    created: list[str] = []
    for flag in red_flags:
        if not isinstance(flag, dict):
            continue
        if flag.get("severity") != "high":
            continue
        code = flag.get("code")
        ae_type = _AE_TYPE_BY_FLAG.get(code or "")
        if not ae_type:
            continue
        # Idempotency: skip if a recent same-type AE already exists for this patient
        try:
            existing = (
                db.query(AdverseEvent)
                .filter(
                    AdverseEvent.patient_id == analysis.patient_id,
                    AdverseEvent.event_type == ae_type,
                    AdverseEvent.reported_at >= cutoff,
                )
                .first()
            )
        except Exception:
            existing = None
        if existing is not None:
            continue
        ae = AdverseEvent(
            patient_id=analysis.patient_id,
            clinician_id=analysis.clinician_id,
            event_type=ae_type,
            severity="high",
            description=(
                f"qEEG red flag: {flag.get('title') or code}. "
                f"{flag.get('message') or ''} "
                f"Recommended action: {flag.get('action') or 'Clinician review.'}"
            ).strip(),
            onset_timing="during_session",
            resolution="open",
            action_taken="auto_flagged_for_review",
            reported_at=now,
        )
        try:
            db.add(ae)
            db.flush()
            created.append(ae.id)
        except Exception as exc:
            _log.warning("escalate_red_flags AE persist failed for %s: %s", code, exc)
    return created
