"""AI co-pilot overlay for the clinical raw-data EEG cleaning workstation.

Phase 5 of the qEEG raw-data clinical workstation rebuild. Surfaces nine
public functions, each returning the canonical ``{result, reasoning,
features}`` envelope so the UI can show a "why this suggestion" tooltip
beside every AI output.

Design intent
=============

* **Deterministic features first.** Every function computes a numeric
  ``features`` payload from the existing helpers
  (``auto_artifact_scan.scan_for_artifacts``,
  ``eeg_signal_service.extract_ica_data`` / ``load_raw_for_analysis``).
  The LLM is only asked to *verbalise* those features into a
  clinician-grade sentence-or-three. If the LLM is unavailable we still
  ship the deterministic ``result`` and substitute a fixed fallback
  reasoning string.
* **Audit by default.** Every function writes one ``CleaningDecision``
  audit row at proposal time (``actor='ai'``, ``action='propose_*'``)
  even before the clinician decides — that gives a complete audit trail
  of "the AI said X at time T, the user later did Y".
* **Phase-4 compatibility.** ``auto_clean_propose`` returns a Phase-4-
  shaped ``AutoCleanRun.proposal_json`` dict so the existing
  ``/auto-scan/{run_id}/decide`` flow can commit it unchanged.

TODO Phase 7: enable prompt cache on the LLM wrapper. The
``chat_service._llm_chat`` wrapper does not yet expose a cache surface
on OpenRouter. When it does, swap each ``_safe_llm`` call to the cached
variant — the call sites already pass static system prompts that would
be cache-friendly.
"""
from __future__ import annotations

import json
import logging
import math
import threading
import time
from typing import Any

from sqlalchemy.orm import Session

from app.persistence.models import AutoCleanRun, CleaningDecision

_log = logging.getLogger(__name__)

# In-process TTL cache for copilot_assist_bundle — idempotent for repeat HTTP
# calls: same analysis_id within the window returns the same payload without
# re-running scan/ICA/LLM and without a second audit row.
_ASSIST_BUNDLE_LOCK = threading.Lock()
_ASSIST_BUNDLE_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
_ASSIST_BUNDLE_TTL_SEC = 120.0

# Fallback reasoning when the LLM provider is unavailable. Surfaced verbatim
# in the UI so the clinician knows why the narrative is missing.
_LLM_FALLBACK = (
    "LLM unavailable; deterministic result above is authoritative."
)


# ── LLM safe-call wrapper ───────────────────────────────────────────────────


def _safe_llm(
    *,
    system: str,
    user: str,
    max_tokens: int = 256,
    temperature: float = 0.2,
) -> str:
    """Call ``chat_service._llm_chat`` and degrade gracefully on failure.

    The wrapper hides three failure modes from the caller:

    1. ``chat_service`` import failed (sandbox without OpenAI / Anthropic
       installed). ``ImportError`` ⇒ fallback string.
    2. ``_llm_chat`` raised ⇒ fallback string + warning log.
    3. ``_llm_chat`` returned the literal ``not_configured_message`` (no
       API key is set) ⇒ fallback string.

    Returns the assistant text or :data:`_LLM_FALLBACK`.
    """
    try:
        from app.services.chat_service import _llm_chat
    except ImportError:  # pragma: no cover - chat_service is in repo
        return _LLM_FALLBACK
    try:
        text = _llm_chat(
            system=system,
            messages=[{"role": "user", "content": user}],
            max_tokens=max_tokens,
            temperature=temperature,
            not_configured_message="__not_configured__",
        )
    except Exception as exc:  # noqa: BLE001 — provider boundaries vary
        _log.warning("raw_ai LLM call failed: %s", exc)
        return _LLM_FALLBACK
    if not text or "__not_configured__" in text:
        return _LLM_FALLBACK
    text = text.strip()
    if not text:
        return _LLM_FALLBACK
    return text


# ── Audit helper ────────────────────────────────────────────────────────────


def _audit_proposal(
    db: Session,
    *,
    analysis_id: str,
    action: str,
    target: str | None,
    payload: dict[str, Any],
    auto_clean_run_id: str | None = None,
    confidence: float | None = None,
    commit: bool = True,
) -> None:
    """Write one ``CleaningDecision`` row (``actor='ai'``) at proposal time.

    Phase 5 contract: every AI suggestion is audited *before* the clinician
    decides, so the audit trail records "the AI said X at time T" even if
    the clinician never accepts/rejects.
    """
    try:
        row = CleaningDecision(
            analysis_id=analysis_id,
            auto_clean_run_id=auto_clean_run_id,
            actor="ai",
            action=action,
            target=target,
            payload_json=json.dumps(payload, default=str),
            accepted_by_user=None,
            confidence=confidence,
        )
        db.add(row)
        if commit:
            db.commit()
    except Exception as exc:  # pragma: no cover - audit is best-effort
        _log.warning("raw_ai audit row failed (action=%s): %s", action, exc)
        db.rollback()


# ── Deterministic feature helpers ───────────────────────────────────────────


def _scan_or_empty(analysis_id: str, db: Session) -> dict[str, Any]:
    """Run the threshold-based artifact scanner, swallowing any errors.

    Returns an empty Phase-4-shaped dict when the scanner is unavailable
    (no MNE, no signal file in test mode, etc.) so callers still ship
    structured ``features`` to the UI.
    """
    try:
        from app.services.auto_artifact_scan import scan_for_artifacts
    except ImportError:
        return {
            "bad_channels": [],
            "bad_segments": [],
            "summary": {
                "n_bad_channels": 0,
                "n_bad_segments": 0,
                "total_excluded_sec": 0.0,
                "scanner_version": "unavailable",
            },
        }
    try:
        return scan_for_artifacts(analysis_id, db)
    except Exception as exc:  # noqa: BLE001 - sandbox / no-MNE paths
        _log.info("auto_artifact_scan unavailable for %s: %s", analysis_id, exc)
        return {
            "bad_channels": [],
            "bad_segments": [],
            "summary": {
                "n_bad_channels": 0,
                "n_bad_segments": 0,
                "total_excluded_sec": 0.0,
                "scanner_version": "unavailable",
            },
        }


def _ica_or_empty(analysis_id: str, db: Session) -> dict[str, Any]:
    """Pull ICA component data; degrade to an empty list on failure."""
    try:
        from app.services.eeg_signal_service import extract_ica_data
    except ImportError:
        return {"n_components": 0, "components": [], "iclabel_available": False}
    try:
        return extract_ica_data(analysis_id, db)
    except Exception as exc:  # noqa: BLE001
        _log.info("extract_ica_data unavailable for %s: %s", analysis_id, exc)
        return {"n_components": 0, "components": [], "iclabel_available": False}


def _load_analysis_meta(analysis_id: str, db: Session) -> dict[str, Any]:
    """Read recording metadata off the QEEGAnalysis row (no MNE required)."""
    from app.persistence.models import QEEGAnalysis

    row = db.query(QEEGAnalysis).filter_by(id=analysis_id).first()
    if row is None:
        return {}
    return {
        "sfreq": float(row.sample_rate_hz or 0.0),
        "duration_sec": float(row.recording_duration_sec or 0.0),
        "channel_count": int(row.channel_count or 0),
        "eyes_condition": row.eyes_condition,
        "channels_json": row.channels_json,
    }


def _clip(x: float, lo: float = 0.0, hi: float = 100.0) -> float:
    if not math.isfinite(x):
        return lo
    return float(max(lo, min(hi, x)))


# ── 1. quality_score ────────────────────────────────────────────────────────


def quality_score(analysis_id: str, db: Session) -> dict[str, Any]:
    """Compute a 0–100 recording quality score with five subscores.

    Subscores are derived from the deterministic auto-scan + ICA features:

    * **impedance** — proxied from flatline channel count (true impedance
      not available without device-side metadata).
    * **line_noise** — inverse of the line-noise channel ratio.
    * **blink_density** — derived from ICA "eye"-labelled components.
    * **motion** — inverse of bad-segment density (gradient + amplitude).
    * **channel_agreement** — fraction of clean channels.

    The composite is the average of the five subscores, clipped to 0–100.
    """
    scan = _scan_or_empty(analysis_id, db)
    ica = _ica_or_empty(analysis_id, db)
    meta = _load_analysis_meta(analysis_id, db)

    bad_chs = scan.get("bad_channels") or []
    bad_segs = scan.get("bad_segments") or []
    n_chs_total = max(int(meta.get("channel_count") or 0), 1)
    duration_sec = max(float(meta.get("duration_sec") or 0.0), 1.0)

    flat_count = sum(1 for c in bad_chs if c.get("reason") == "flatline")
    line_count = sum(1 for c in bad_chs if c.get("reason") == "line_noise")
    excluded_sec = float(scan.get("summary", {}).get("total_excluded_sec") or 0.0)

    # Subscore mapping (each lands on 0..100, higher is better).
    impedance = _clip(100.0 - 100.0 * (flat_count / n_chs_total))
    line_noise = _clip(100.0 - 100.0 * (line_count / n_chs_total))
    motion = _clip(100.0 - 100.0 * min(1.0, excluded_sec / duration_sec))
    channel_agreement = _clip(100.0 - 100.0 * (len(bad_chs) / n_chs_total))

    eye_components = [
        c for c in (ica.get("components") or []) if (c.get("label") == "eye")
    ]
    # Penalize > 1 dominant eye component.
    blink_density = _clip(100.0 - 25.0 * max(0, len(eye_components) - 1))

    subscores = {
        "impedance": round(impedance, 1),
        "line_noise": round(line_noise, 1),
        "blink_density": round(blink_density, 1),
        "motion": round(motion, 1),
        "channel_agreement": round(channel_agreement, 1),
    }
    composite = round(sum(subscores.values()) / 5.0, 1)

    features = {
        "n_bad_channels": len(bad_chs),
        "n_bad_segments": len(bad_segs),
        "n_eye_components": len(eye_components),
        "duration_sec": round(duration_sec, 2),
        "channel_count": n_chs_total,
        "total_excluded_sec": round(excluded_sec, 2),
    }

    user_prompt = (
        "Recording quality features:\n"
        f"  composite: {composite}/100\n"
        f"  subscores: {json.dumps(subscores)}\n"
        f"  features: {json.dumps(features)}\n\n"
        "In 2-3 sentences, narrate this recording's clinical usability "
        "to a clinician. Reference the lowest subscore. Do not invent "
        "numbers."
    )
    reasoning = _safe_llm(
        system=(
            "You are a clinical EEG quality reviewer. You are NEVER the "
            "decision maker — your role is to summarise deterministic "
            "metrics for a clinician. Be terse and factual."
        ),
        user=user_prompt,
        max_tokens=180,
    )

    result = {"score": composite, "subscores": subscores}

    _audit_proposal(
        db,
        analysis_id=analysis_id,
        action="propose_quality_score",
        target=f"score:{composite}",
        payload={"result": result, "features": features},
    )

    return {"result": result, "reasoning": reasoning, "features": features}


# ── 2. auto_clean_propose ───────────────────────────────────────────────────


def auto_clean_propose(analysis_id: str, db: Session) -> dict[str, Any]:
    """Merge artifact scan + ICA exclusion proposals + filter recommendations.

    Creates one ``AutoCleanRun`` row (``proposal_json`` is the merged
    payload, Phase-4-compatible) and returns the proposal so the UI can
    pass it straight into the existing ``/auto-scan/{run_id}/decide``
    flow.
    """
    scan = _scan_or_empty(analysis_id, db)
    ica = _ica_or_empty(analysis_id, db)
    filt = recommend_filters(analysis_id, db)["result"]

    # IC label exclusion proposal: any IC labelled eye/muscle/heart/line
    # with a best-class probability >= 0.7 is recommended for exclusion.
    proposed_ic_exclusions: list[dict[str, Any]] = []
    for comp in ica.get("components") or []:
        probs = comp.get("label_probabilities") or {}
        # Determine best probability defensively across schemas.
        best_p = 0.0
        for v in probs.values():
            try:
                vf = float(v)
            except (TypeError, ValueError):
                continue
            if vf > best_p:
                best_p = vf
        label = comp.get("label") or "other"
        if label in ("eye", "muscle", "heart", "line") and best_p >= 0.7:
            proposed_ic_exclusions.append(
                {
                    "index": int(comp.get("index", -1)),
                    "label": label,
                    "confidence": round(best_p, 3),
                }
            )

    bad_channels = list(scan.get("bad_channels") or [])
    bad_segments = list(scan.get("bad_segments") or [])
    summary = dict(scan.get("summary") or {})
    summary.setdefault("n_bad_channels", len(bad_channels))
    summary.setdefault("n_bad_segments", len(bad_segments))
    summary["n_proposed_ic_exclusions"] = len(proposed_ic_exclusions)
    summary["recommended_filters"] = filt

    # Phase-4-shaped proposal_json (decide endpoint will consume the
    # bad_channels / bad_segments lists; the IC + filter blocks are
    # additive metadata that the UI uses).
    proposal = {
        "bad_channels": bad_channels,
        "bad_segments": bad_segments,
        "summary": summary,
        "proposed_ic_exclusions": proposed_ic_exclusions,
        "recommended_filters": filt,
    }

    run = AutoCleanRun(
        analysis_id=analysis_id,
        proposal_json=json.dumps(proposal),
    )
    db.add(run)
    db.flush()

    _audit_proposal(
        db,
        analysis_id=analysis_id,
        action="propose_auto_clean",
        target=(
            f"summary:{summary.get('n_bad_channels', 0)}c/"
            f"{summary.get('n_bad_segments', 0)}s/"
            f"{len(proposed_ic_exclusions)}ic"
        ),
        payload={"summary": summary},
        auto_clean_run_id=run.id,
        commit=False,
    )
    db.commit()
    db.refresh(run)

    user_prompt = (
        "Auto-clean proposal summary:\n"
        f"  bad_channels: {summary.get('n_bad_channels', 0)}\n"
        f"  bad_segments: {summary.get('n_bad_segments', 0)}\n"
        f"  proposed_ic_exclusions: {len(proposed_ic_exclusions)}\n"
        f"  filters: {json.dumps(filt)}\n\n"
        "In 2-3 sentences, summarise to the clinician what this auto-clean "
        "proposal will do if accepted. Note the filter settings."
    )
    reasoning = _safe_llm(
        system=(
            "You are an EEG cleaning co-pilot. Summarise auto-clean "
            "proposals concisely for the clinician's review."
        ),
        user=user_prompt,
    )

    features = {
        "n_bad_channels": summary.get("n_bad_channels", 0),
        "n_bad_segments": summary.get("n_bad_segments", 0),
        "n_proposed_ic_exclusions": len(proposed_ic_exclusions),
        "filters": filt,
    }

    return {
        "result": {**proposal, "run_id": run.id},
        "reasoning": reasoning,
        "features": features,
    }


# ── 3. explain_bad_channel ──────────────────────────────────────────────────


def explain_bad_channel(
    analysis_id: str, db: Session, channel: str
) -> dict[str, Any]:
    """Return a clinician-readable explanation of why a channel is flagged."""
    scan = _scan_or_empty(analysis_id, db)
    target = None
    for entry in scan.get("bad_channels") or []:
        if str(entry.get("channel")) == str(channel):
            target = entry
            break

    if target is None:
        features = {
            "channel": channel,
            "found": False,
        }
        result = {
            "channel": channel,
            "found": False,
            "reason": "ok",
            "metric": {},
            "confidence": 0.0,
        }
        reasoning_user = (
            f"Channel {channel} did not trip the artifact scanner. "
            "Tell the clinician this in one sentence."
        )
    else:
        features = {
            "channel": channel,
            "found": True,
            "reason": target.get("reason"),
            "metric": target.get("metric"),
            "confidence": target.get("confidence"),
        }
        result = {
            "channel": channel,
            "found": True,
            "reason": target.get("reason"),
            "metric": target.get("metric") or {},
            "confidence": float(target.get("confidence") or 0.0),
        }
        reasoning_user = (
            f"Channel {channel} flagged with reason='{target.get('reason')}', "
            f"metric={json.dumps(target.get('metric'))}, "
            f"confidence={target.get('confidence')}.\n\n"
            "Explain to the clinician in 1-2 sentences what likely caused "
            "this and whether to mark the channel bad."
        )

    reasoning = _safe_llm(
        system=(
            "You explain EEG bad-channel detections to a clinician. Be "
            "concrete and reference the metric values."
        ),
        user=reasoning_user,
        max_tokens=160,
    )

    _audit_proposal(
        db,
        analysis_id=analysis_id,
        action="propose_explain_channel",
        target=f"channel:{channel}",
        payload={"result": result},
        confidence=result.get("confidence"),
    )

    return {"result": result, "reasoning": reasoning, "features": features}


# ── 4. classify_components ──────────────────────────────────────────────────


def classify_components(analysis_id: str, db: Session) -> dict[str, Any]:
    """Per-IC label + confidence + short explanation.

    Uses the existing ICLabel output as features. The "explanation"
    field is a short deterministic string keyed off the label — we do NOT
    call the LLM per-component (would explode tokens). The top-level
    ``reasoning`` summarises the whole decomposition once.
    """
    ica = _ica_or_empty(analysis_id, db)
    components = ica.get("components") or []

    classifications: list[dict[str, Any]] = []
    label_counts: dict[str, int] = {}
    for comp in components:
        idx = int(comp.get("index", -1))
        probs = comp.get("label_probabilities") or {}
        best_label, best_p = "other", 0.0
        for k, v in probs.items():
            try:
                vf = float(v)
            except (TypeError, ValueError):
                continue
            if vf > best_p:
                best_p = vf
                best_label = k
        # Fall back to the label field if probabilities were absent.
        if best_p == 0.0 and comp.get("label"):
            best_label = comp.get("label") or "other"
            best_p = 1.0 if best_label != "other" else 0.5

        explanation = {
            "brain": "Neural activity, retain.",
            "eye": "Saccade / blink artifact.",
            "muscle": "EMG contamination, often temporal.",
            "heart": "Cardiac artifact (ECG bleed).",
            "line": "Line-noise contamination.",
            "channel_noise": "Single-channel disturbance.",
            "other": "Uncertain — clinician review.",
        }.get(best_label, "Unclassified component.")

        classifications.append(
            {
                "idx": idx,
                "label": best_label,
                "confidence": round(float(best_p), 3),
                "explanation": explanation,
            }
        )
        label_counts[best_label] = label_counts.get(best_label, 0) + 1

    features = {
        "n_components": len(classifications),
        "label_counts": label_counts,
        "iclabel_available": bool(ica.get("iclabel_available")),
    }

    user_prompt = (
        "ICA decomposition summary:\n"
        f"  components: {len(classifications)}\n"
        f"  label_counts: {json.dumps(label_counts)}\n\n"
        "In 2-3 sentences, summarise what the decomposition picked up "
        "and what to consider excluding."
    )
    reasoning = _safe_llm(
        system="You are an EEG ICA reviewer. Be terse and clinical.",
        user=user_prompt,
    )

    _audit_proposal(
        db,
        analysis_id=analysis_id,
        action="propose_classify_components",
        target=f"n_ic:{len(classifications)}",
        payload={"label_counts": label_counts},
    )

    return {
        "result": classifications,
        "reasoning": reasoning,
        "features": features,
    }


# ── 5. classify_segment ─────────────────────────────────────────────────────


def classify_segment(
    analysis_id: str,
    db: Session,
    start_sec: float,
    end_sec: float,
) -> dict[str, Any]:
    """Predict the dominant artifact reason in a [start, end) segment."""
    scan = _scan_or_empty(analysis_id, db)
    overlapping: list[dict[str, Any]] = []
    for seg in scan.get("bad_segments") or []:
        s = float(seg.get("start_sec") or 0.0)
        e = float(seg.get("end_sec") or 0.0)
        # Overlap test
        if not (e <= float(start_sec) or s >= float(end_sec)):
            overlapping.append(seg)

    reason_scores: dict[str, float] = {}
    for seg in overlapping:
        reason = str(seg.get("reason") or "other")
        conf = float(seg.get("confidence") or 0.0)
        reason_scores[reason] = max(reason_scores.get(reason, 0.0), conf)

    if reason_scores:
        best_reason = max(reason_scores.items(), key=lambda kv: kv[1])
        predicted_reason, confidence = best_reason
    else:
        predicted_reason, confidence = "clean", 0.7

    result = {
        "start_sec": round(float(start_sec), 2),
        "end_sec": round(float(end_sec), 2),
        "predicted_reason": predicted_reason,
        "confidence": round(float(confidence), 3),
    }
    features = {
        "n_overlapping_detections": len(overlapping),
        "reason_scores": reason_scores,
    }

    user_prompt = (
        f"Segment [{start_sec}s..{end_sec}s] overlaps "
        f"{len(overlapping)} flagged sub-segments. "
        f"Top reason: '{predicted_reason}' (conf={confidence:.2f}). "
        "Tell the clinician in one sentence what to expect."
    )
    reasoning = _safe_llm(
        system="You explain EEG segment classifications to clinicians.",
        user=user_prompt,
        max_tokens=120,
    )

    _audit_proposal(
        db,
        analysis_id=analysis_id,
        action="propose_classify_segment",
        target=f"segment:{start_sec:.2f}-{end_sec:.2f}",
        payload={"result": result},
        confidence=result["confidence"],
    )

    return {"result": result, "reasoning": reasoning, "features": features}


# ── 6. recommend_filters ────────────────────────────────────────────────────


def recommend_filters(analysis_id: str, db: Session) -> dict[str, Any]:
    """Suggest LFF / HFF / notch from line-noise heuristics + duration."""
    scan = _scan_or_empty(analysis_id, db)
    meta = _load_analysis_meta(analysis_id, db)
    sfreq = float(meta.get("sfreq") or 0.0)
    duration_sec = float(meta.get("duration_sec") or 0.0)

    # Notch decision: if any line-noise channel was flagged at 60 Hz, pick
    # 60 Hz; otherwise default to 50 Hz (EU mains). If no line-noise flags
    # at all, still default to 50 Hz.
    notch_hz = 50
    line_chs = [
        c for c in (scan.get("bad_channels") or []) if c.get("reason") == "line_noise"
    ]
    for c in line_chs:
        if (c.get("metric") or {}).get("line_hz") == 60.0:
            notch_hz = 60
            break

    # LFF/HFF heuristics. Long resting recordings benefit from 1.0 Hz LFF
    # to suppress drift; very short segments need a gentler 0.5 Hz to
    # preserve waveform integrity. HFF capped at sfreq/2 - 5 to avoid
    # aliasing-edge artifacts.
    lff = 1.0 if duration_sec >= 60.0 else 0.5
    hff = 45.0
    if sfreq > 0 and sfreq / 2.0 - 5.0 < hff:
        hff = max(20.0, round(sfreq / 2.0 - 5.0, 1))

    result = {"lff": lff, "hff": hff, "notch": notch_hz}
    features = {
        "sfreq": sfreq,
        "duration_sec": duration_sec,
        "n_line_noise_channels": len(line_chs),
    }

    user_prompt = (
        f"Filter recommendation: LFF {lff} Hz, HFF {hff} Hz, "
        f"notch {notch_hz} Hz. "
        f"Sampling rate {sfreq} Hz, duration {duration_sec}s, "
        f"{len(line_chs)} channels with line-noise. "
        "In 1-2 sentences, justify these settings to the clinician."
    )
    rationale = _safe_llm(
        system="You recommend EEG filter settings. Be concrete and brief.",
        user=user_prompt,
        max_tokens=140,
    )
    result["rationale"] = rationale

    _audit_proposal(
        db,
        analysis_id=analysis_id,
        action="propose_recommend_filters",
        target=f"lff={lff};hff={hff};notch={notch_hz}",
        payload={"result": result},
    )

    return {"result": result, "reasoning": rationale, "features": features}


# ── 7. recommend_montage ────────────────────────────────────────────────────


def recommend_montage(analysis_id: str, db: Session) -> dict[str, Any]:
    """Suggest a montage based on channel count + clinical context.

    Heuristics:

    * 19-channel 10-20 → ``referential`` (linked-mastoid) + bipolar review
      of temporal channels.
    * 32+ channels → ``average`` reference is the normative baseline.
    * < 19 channels → ``referential`` only; bipolar montages need pairs.
    """
    meta = _load_analysis_meta(analysis_id, db)
    n_channels = int(meta.get("channel_count") or 0)
    eyes = (meta.get("eyes_condition") or "").lower()

    if n_channels >= 32:
        montage = "average"
    elif n_channels >= 19:
        montage = "referential"
    else:
        montage = "referential"

    result = {"montage": montage}
    features = {"n_channels": n_channels, "eyes_condition": eyes or None}

    user_prompt = (
        f"Recording has {n_channels} channels, eyes={eyes or 'unknown'}. "
        f"Suggested montage: {montage}. "
        "In 1-2 sentences, justify this to the clinician."
    )
    rationale = _safe_llm(
        system="You recommend EEG montages. Be concrete and brief.",
        user=user_prompt,
        max_tokens=120,
    )
    result["rationale"] = rationale

    _audit_proposal(
        db,
        analysis_id=analysis_id,
        action="propose_recommend_montage",
        target=f"montage:{montage}",
        payload={"result": result},
    )

    return {"result": result, "reasoning": rationale, "features": features}


# ── 8. segment_eo_ec ────────────────────────────────────────────────────────


def segment_eo_ec(analysis_id: str, db: Session) -> dict[str, Any]:
    """Approximate EO/EC fragments from the recording's eyes-condition.

    Without alpha-rhythm spectral analysis (heavy and out of scope here),
    we rely on the ``eyes_condition`` field. ``open`` ⇒ one EO span,
    ``closed`` ⇒ one EC span, ``both`` ⇒ two halves. Confidence is low
    when relying on metadata only — surfaced honestly.
    """
    meta = _load_analysis_meta(analysis_id, db)
    duration = float(meta.get("duration_sec") or 0.0)
    eyes = (meta.get("eyes_condition") or "").lower()

    fragments: list[dict[str, Any]] = []
    if duration <= 0:
        fragments = []
    elif eyes == "open":
        fragments = [
            {"label": "EO", "start_sec": 0.0, "end_sec": round(duration, 2),
             "confidence": 0.6}
        ]
    elif eyes == "closed":
        fragments = [
            {"label": "EC", "start_sec": 0.0, "end_sec": round(duration, 2),
             "confidence": 0.6}
        ]
    elif eyes == "both":
        half = round(duration / 2.0, 2)
        fragments = [
            {"label": "EO", "start_sec": 0.0, "end_sec": half, "confidence": 0.4},
            {"label": "EC", "start_sec": half, "end_sec": round(duration, 2),
             "confidence": 0.4},
        ]
    else:
        fragments = [
            {"label": "EO", "start_sec": 0.0, "end_sec": round(duration, 2),
             "confidence": 0.2}
        ]

    features = {
        "eyes_condition": eyes or None,
        "duration_sec": round(duration, 2),
    }
    user_prompt = (
        f"Segmented {len(fragments)} EO/EC fragments based on eyes='{eyes}'. "
        "In 1-2 sentences, tell the clinician how confident this is and "
        "what to verify."
    )
    reasoning = _safe_llm(
        system="You explain EEG EO/EC segmentation to clinicians.",
        user=user_prompt,
        max_tokens=120,
    )

    _audit_proposal(
        db,
        analysis_id=analysis_id,
        action="propose_segment_eo_ec",
        target=f"fragments:{len(fragments)}",
        payload={"fragments": fragments},
    )

    return {"result": fragments, "reasoning": reasoning, "features": features}


# ── 9. narrate ──────────────────────────────────────────────────────────────


def narrate(analysis_id: str, db: Session) -> dict[str, Any]:
    """Free-text recording summary woven from all available features."""
    scan = _scan_or_empty(analysis_id, db)
    ica = _ica_or_empty(analysis_id, db)
    meta = _load_analysis_meta(analysis_id, db)

    summary = scan.get("summary") or {}
    n_components = len(ica.get("components") or [])
    eye_count = sum(
        1 for c in (ica.get("components") or []) if c.get("label") == "eye"
    )

    features = {
        "duration_sec": round(float(meta.get("duration_sec") or 0.0), 2),
        "channel_count": int(meta.get("channel_count") or 0),
        "eyes_condition": meta.get("eyes_condition"),
        "n_bad_channels": summary.get("n_bad_channels", 0),
        "n_bad_segments": summary.get("n_bad_segments", 0),
        "total_excluded_sec": summary.get("total_excluded_sec", 0.0),
        "n_components": n_components,
        "n_eye_components": eye_count,
    }

    user_prompt = (
        "Recording features:\n" + json.dumps(features, indent=2)
        + "\n\nWrite a 3-5 sentence clinical summary of this EEG recording's "
        "raw quality and what cleaning steps should be taken next."
    )
    text = _safe_llm(
        system=(
            "You are a senior clinical EEG technologist writing a brief "
            "raw-recording summary for the reading clinician. Be terse and "
            "clinically grounded. Do not invent metrics."
        ),
        user=user_prompt,
        max_tokens=320,
    )

    result = {"summary": text}

    _audit_proposal(
        db,
        analysis_id=analysis_id,
        action="propose_narrate",
        target=f"len:{len(text or '')}",
        payload={"features": features},
    )

    return {"result": result, "reasoning": text, "features": features}


# ── 10. copilot_assist_bundle (aggregated assist for Raw EEG Workbench QC) ─


def copilot_assist_bundle(analysis_id: str, db: Session) -> dict[str, Any]:
    """Single-call assist payload for the Raw EEG / QC panel.

    Composes **deterministic** scanner + ICA + metadata into one response so
    the web UI can render flagged segments, channel ranking, suggested next
    steps, and a pre-analysis readiness label without firing six separate
    requests.  LLM use is limited to a short optional narrative; all
    numbers come from heuristics.

    Does **not** change cleaning state.  Writes one ``CleaningDecision`` row
    (``propose_copilot_assist_bundle``) for audit.
    """
    with _ASSIST_BUNDLE_LOCK:
        now = time.monotonic()
        ent = _ASSIST_BUNDLE_CACHE.get(analysis_id)
        if ent is not None and (now - ent[0]) < _ASSIST_BUNDLE_TTL_SEC:
            return ent[1]

    scan = _scan_or_empty(analysis_id, db)
    ica = _ica_or_empty(analysis_id, db)
    meta = _load_analysis_meta(analysis_id, db)

    bad_chs: list[dict[str, Any]] = list(scan.get("bad_channels") or [])
    bad_segs: list[dict[str, Any]] = list(scan.get("bad_segments") or [])
    n_chs_total = max(int(meta.get("channel_count") or 0), 1)
    duration_sec = max(float(meta.get("duration_sec") or 0.0), 1.0)
    excluded_sec = float((scan.get("summary") or {}).get("total_excluded_sec") or 0.0)

    flat_count = sum(1 for c in bad_chs if c.get("reason") == "flatline")
    line_count = sum(1 for c in bad_chs if c.get("reason") == "line_noise")
    impedance = _clip(100.0 - 100.0 * (flat_count / n_chs_total))
    line_noise = _clip(100.0 - 100.0 * (line_count / n_chs_total))
    motion = _clip(100.0 - 100.0 * min(1.0, excluded_sec / duration_sec))
    channel_agreement = _clip(100.0 - 100.0 * (len(bad_chs) / n_chs_total))
    eye_components = [c for c in (ica.get("components") or []) if c.get("label") == "eye"]
    blink_density = _clip(100.0 - 25.0 * max(0, len(eye_components) - 1))
    subscores = {
        "impedance": round(impedance, 1),
        "line_noise": round(line_noise, 1),
        "blink_density": round(blink_density, 1),
        "motion": round(motion, 1),
        "channel_agreement": round(channel_agreement, 1),
    }
    composite = round(sum(subscores.values()) / 5.0, 1)

    suspicious_segments: list[dict[str, Any]] = []
    for s in bad_segs[:80]:
        suspicious_segments.append(
            {
                "start_sec": float(s.get("start_sec") or 0.0),
                "end_sec": float(s.get("end_sec") or 0.0),
                "reason": str(s.get("reason") or "other"),
                "confidence": float(s.get("confidence") or 0.0),
                "source": "auto_scan",
            }
        )

    channel_quality_rank: list[dict[str, Any]] = []
    for c in bad_chs:
        conf = float(c.get("confidence") or 0.0)
        channel_quality_rank.append(
            {
                "channel": str(c.get("channel") or ""),
                "reason": str(c.get("reason") or "other"),
                "confidence": round(conf, 3),
                "rank_score": round(conf, 3),
            }
        )
    channel_quality_rank.sort(key=lambda x: -float(x.get("rank_score") or 0.0))

    suggested_next_actions: list[dict[str, Any]] = []
    if bad_chs:
        suggested_next_actions.append(
            {
                "id": "review_flagged_channels",
                "label": "Review scanner-flagged channels",
                "rationale": f"{len(bad_chs)} channel(s) exceeded deterministic thresholds.",
                "requires_confirmation": True,
            }
        )
    if bad_segs:
        suggested_next_actions.append(
            {
                "id": "review_flagged_segments",
                "label": "Review flagged time segments",
                "rationale": f"{len(bad_segs)} segment(s) from automatic scan.",
                "requires_confirmation": True,
            }
        )
    if len(eye_components) > 1:
        suggested_next_actions.append(
            {
                "id": "review_ica_eye",
                "label": "Review ICA components labelled as eye",
                "rationale": f"{len(eye_components)} eye-related component(s) — verify before excluding.",
                "requires_confirmation": True,
            }
        )
    if not suggested_next_actions:
        suggested_next_actions.append(
            {
                "id": "continue_visual_qc",
                "label": "Continue systematic visual QC",
                "rationale": "No automatic scanner flags — still perform manual review.",
                "requires_confirmation": False,
            }
        )

    if composite >= 75 and len(bad_segs) < 8 and len(bad_chs) <= 2:
        readiness_label = "likely_ready"
    elif composite < 45 or len(bad_chs) > 8:
        readiness_label = "blocked"
    else:
        readiness_label = "needs_review"

    result: dict[str, Any] = {
        "assist_engine": "rules_heuristic_v1",
        "assist_scope": (
            "Human-in-the-loop assist only. Does not modify EEG. "
            "Confirm each cleaning action."
        ),
        "quality_composite": composite,
        "subscores": subscores,
        "suspicious_segments": suspicious_segments,
        "channel_quality_rank": channel_quality_rank[:32],
        "suggested_next_actions": suggested_next_actions[:12],
        "preanalysis_readiness": {
            "score": composite,
            "label": readiness_label,
        },
        "artifact_hints_summary": {
            "n_segments": len(bad_segs),
            "n_channels_flagged": len(bad_chs),
            "n_ica_components": len(ica.get("components") or []),
            "iclabel_available": bool(ica.get("iclabel_available")),
        },
    }

    features = {
        "n_bad_channels": len(bad_chs),
        "n_bad_segments": len(bad_segs),
        "duration_sec": round(duration_sec, 2),
        "channel_count": n_chs_total,
    }

    user_prompt = (
        "QC assist bundle (deterministic):\n"
        f"  composite: {composite}/100\n"
        f"  readiness_label: {readiness_label}\n"
        f"  bad_channels: {len(bad_chs)}  bad_segments: {len(bad_segs)}\n\n"
        "In 2-3 sentences, tell the clinician what to review first and what "
        "could wait. Do not invent metrics."
    )
    reasoning = _safe_llm(
        system=(
            "You assist EEG technologists with review prioritisation. "
            "You never replace clinical judgment."
        ),
        user=user_prompt,
        max_tokens=200,
    )

    _audit_proposal(
        db,
        analysis_id=analysis_id,
        action="propose_copilot_assist_bundle",
        target=f"qc:{composite}:{readiness_label}",
        payload={
            "features": features,
            "n_segments_returned": len(suspicious_segments),
            "n_actions": len(suggested_next_actions),
        },
        confidence=composite / 100.0 if composite <= 100 else 1.0,
    )

    out: dict[str, Any] = {"result": result, "reasoning": reasoning, "features": features}
    with _ASSIST_BUNDLE_LOCK:
        _ASSIST_BUNDLE_CACHE[analysis_id] = (time.monotonic(), out)
    return out


__all__ = [
    "quality_score",
    "auto_clean_propose",
    "explain_bad_channel",
    "classify_components",
    "classify_segment",
    "recommend_filters",
    "recommend_montage",
    "segment_eo_ec",
    "narrate",
    "copilot_assist_bundle",
]
