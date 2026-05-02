"""Digital Phenotyping Analyzer — stub aggregation until passive ingest lands.

Merges persisted per-patient consent/state from ``digital_phenotyping_patient_state``.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

# Canonical signal_domain keys — must match UI / fixtures.
DEFAULT_DOMAINS_ENABLED: dict[str, bool] = {
    "screen_use": True,
    "location_mobility": True,
    "physical_activity": True,
    "sleep_proxy": True,
    "social_communication": False,
    "device_engagement": True,
    "ema_active": True,
}

# Map consent domain → snapshot metric key (subset of domains affect headline cards).
_DOMAIN_TO_SNAPSHOT: dict[str, str] = {
    "screen_use": "screen_time_pattern",
    "location_mobility": "mobility_stability",
    "physical_activity": "activity_level",
    "sleep_proxy": "sleep_timing_proxy",
    "social_communication": "sociability_proxy",
}


def _iso(dt: datetime) -> str:
    return dt.replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _parse_domains_json(raw: Optional[str]) -> dict[str, bool]:
    if not raw or not raw.strip():
        return dict(DEFAULT_DOMAINS_ENABLED)
    try:
        data = json.loads(raw)
        if not isinstance(data, dict):
            return dict(DEFAULT_DOMAINS_ENABLED)
        out = dict(DEFAULT_DOMAINS_ENABLED)
        for k, v in data.items():
            if isinstance(v, bool):
                out[str(k)] = v
        return out
    except json.JSONDecodeError:
        return dict(DEFAULT_DOMAINS_ENABLED)


def merge_state_into_payload(
    payload: dict[str, Any],
    *,
    domains_enabled: dict[str, bool],
    consent_scope_version: str,
    state_updated_at: Optional[datetime],
    hide_stub_audit_when_persisted: bool,
) -> dict[str, Any]:
    """Apply consent gates and consent_state metadata. Mutates a shallow copy."""
    out = dict(payload)
    now = datetime.now(timezone.utc)
    merged_domains = {**DEFAULT_DOMAINS_ENABLED, **domains_enabled}

    consent_state = dict(out.get("consent_state") or {})
    consent_state["domains_enabled"] = merged_domains
    consent_state["consent_scope_version"] = consent_scope_version
    consent_state["updated_at"] = _iso(state_updated_at or now)
    out["consent_state"] = consent_state

    snap = dict(out.get("snapshot") or {})
    for domain, metric_key in _DOMAIN_TO_SNAPSHOT.items():
        if merged_domains.get(domain) is False:
            m = snap.get(metric_key)
            if isinstance(m, dict):
                m = dict(m)
                m["value"] = None
                m["completeness"] = 0.0
                m["baseline_comparison"] = "unknown"
                snap[metric_key] = m
    out["snapshot"] = snap

    dom_list = out.get("domains")
    if isinstance(dom_list, list):
        new_list = []
        for d in dom_list:
            if not isinstance(d, dict):
                continue
            dd = dict(d)
            key = dd.get("signal_domain")
            if key and merged_domains.get(key) is False:
                dd["summary_stats"] = {"withheld": "consent_off"}
                dd["completeness"] = 0.0
            new_list.append(dd)
        out["domains"] = new_list

    if hide_stub_audit_when_persisted:
        out["audit_events"] = []

    return out


def merge_observations_into_payload(
    payload: dict[str, Any],
    *,
    observations: list[dict[str, Any]],
) -> dict[str, Any]:
    """Fold MVP observation log into provenance + snapshot completeness (additive)."""
    out = dict(payload)
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=14)

    def _parse_ts(s: Any) -> Optional[datetime]:
        if not s:
            return None
        if isinstance(s, datetime):
            return s if s.tzinfo else s.replace(tzinfo=timezone.utc)
        try:
            raw = str(s).replace("Z", "+00:00")
            dt = datetime.fromisoformat(raw)
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except (ValueError, TypeError):
            return None

    recent = []
    for o in observations:
        ra = _parse_ts(o.get("recorded_at"))
        if ra is None:
            continue
        if ra >= cutoff:
            recent.append(o)

    n_manual = sum(1 for o in recent if o.get("source") == "manual")
    n_device = sum(1 for o in recent if o.get("source") == "device_sync")
    kind_counts: dict[str, int] = {}
    for o in recent:
        k = str(o.get("kind") or "unknown")
        kind_counts[k] = kind_counts.get(k, 0) + 1

    prov = dict(out.get("provenance") or {})
    prov["mvp_manual_observations_14d"] = n_manual
    prov["mvp_device_observations_14d"] = n_device
    prov["mvp_observation_kinds_14d"] = kind_counts
    sources = ["stub_pipeline"]
    if n_manual:
        sources.append("manual_observations")
    if n_device:
        sources.append("device_sync_log")
    prov["data_sources"] = sources
    out["provenance"] = prov

    snap = dict(out.get("snapshot") or {})
    dc = snap.get("data_completeness")
    if not isinstance(dc, dict):
        dc = {"value": 0.76, "confidence": 0.9, "completeness": 1.0, "baseline_comparison": "within", "privacy_sensitivity_level": "low"}
    else:
        dc = dict(dc)
    base_v = float(dc.get("value") or 0.76)
    bump = min(0.18, 0.015 * min(len(recent), 12))
    dc["value"] = min(1.0, base_v + bump)
    dc["baseline_comparison"] = "within"
    notes = dc.get("notes") if isinstance(dc.get("notes"), list) else []
    if recent:
        notes = list(notes) + [
            f"MVP: {len(recent)} observation(s) in last 14d (manual {n_manual}, device_sync {n_device}).",
        ]
    elif len(notes) == 0:
        notes = ["No manual or device-sync observations in the last 14 days — add via the Data panel."]
    dc["notes"] = notes[:5]
    snap["data_completeness"] = dc
    out["snapshot"] = snap

    recs = list(out.get("recommendations") or [])
    if len(recent) == 0 and not any(
        isinstance(r, dict) and r.get("id") == "mvp-rec-add-data" for r in recs
    ):
        recs.append(
            {
                "id": "mvp-rec-add-data",
                "priority": "P2",
                "title": "Add patient-reported or device data",
                "detail": "Enter an EMA row in the Data panel or open Biometrics (Device Sync) to connect a wearable — improves completeness until passive phone ingest ships.",
                "action_type": "review_assessment",
                "targets": ["wearables"],
                "confidence": 0.9,
            }
        )
    out["recommendations"] = recs

    return out


def build_stub_analyzer_payload(patient_id: str, *, patient_name: str | None = None) -> dict[str, Any]:
    """Build a demo-shaped page payload (matches web contract v1)."""
    now = datetime.now(timezone.utc)
    start = now - timedelta(days=28)
    display_name = (patient_name or "").strip() or "Patient"
    return {
        "schema_version": "1.0.0",
        "clinical_disclaimer": (
            "Decision-support only. Passive phone data do not diagnose a disorder. "
            "Signals are behavioral indicators that require clinical correlation."
        ),
        "generated_at": _iso(now),
        "patient_id": patient_id,
        "patient_display_name": display_name,
        "analysis_window": {
            "start": _iso(start),
            "end": _iso(now),
            "timezone": "UTC",
        },
        "provenance": {
            "source_system": "stub",
            "ingest_batch_id": None,
            "feature_pipeline_version": "0.1.0-stub",
        },
        "audit_summary": {
            "last_computed_at": _iso(now),
            "recompute_job_id": None,
            "data_pipeline_version": "0.1.0-stub",
        },
        "snapshot": {
            "computed_at": _iso(now),
            "mobility_stability": _metric(0.72, 0.78, "within", "medium"),
            "routine_regularity": _metric(0.61, 0.65, "below", "low"),
            "screen_time_pattern": _metric(1.15, 0.55, "above", "medium"),
            "sleep_timing_proxy": _metric(0.85, 0.70, "within", "medium"),
            "sociability_proxy": _metric(0.58, 0.62, "below", "high"),
            "activity_level": _metric(0.68, 0.82, "within", "low"),
            "anomaly_score": _metric(0.42, 0.58, "above", "low"),
            "data_completeness": _metric(0.76, 0.91, "within", "low"),
        },
        "domains": [
            _domain(
                "screen_use",
                ["screen_events"],
                "passive",
                _iso(now - timedelta(days=1)),
                {"hours_daily_avg": 4.2, "late_night_pct": 22},
            ),
            _domain(
                "location_mobility",
                ["gps"],
                "passive",
                _iso(now - timedelta(hours=6)),
                {"radius_km_typical": 3.8, "entropy_index": 0.71},
            ),
            _domain(
                "physical_activity",
                ["accel", "steps"],
                "passive",
                _iso(now - timedelta(hours=2)),
                {"steps_daily_avg": 5120},
            ),
            _domain(
                "sleep_proxy",
                ["screen_off", "motion"],
                "hybrid",
                _iso(now - timedelta(days=1)),
                {"bedtime_variability_min": 95},
            ),
            _domain(
                "social_communication",
                ["communication_meta"],
                "passive",
                _iso(now - timedelta(days=2)),
                {"outbound_call_share": 0.44},
            ),
            _domain(
                "device_engagement",
                ["session_length", "unlock_count"],
                "passive",
                _iso(now - timedelta(hours=12)),
                {"unlocks_daily_avg": 84},
            ),
            _domain(
                "ema_active",
                ["ema"],
                "active",
                _iso(now - timedelta(days=3)),
                {"ema_completion_pct": 68},
            ),
        ],
        "baseline_profile": {
            "estimated_at": _iso(now - timedelta(days=7)),
            "valid_from": _iso(start),
            "baseline_window_days": 28,
            "method": "robust_stats_stub",
            "confidence": 0.58,
            "feature_summaries": {
                "screen_hours_daily": {"median": 3.6, "iqr": 1.1},
                "steps_daily": {"median": 5400, "iqr": 1200},
                "routine_index": {"median": 0.68, "iqr": 0.12},
            },
            "weekday_weekend_delta": {"screen_hours": 0.4, "steps": -900},
        },
        "deviations": [
            {
                "event_id": "dev-stub-1",
                "detected_at": _iso(now - timedelta(days=2)),
                "window": {"start": _iso(now - timedelta(days=5)), "end": _iso(now - timedelta(days=2))},
                "signal_domain": "screen_use",
                "deviation_type": "short_term_spike",
                "severity": "medium",
                "urgency": "soon",
                "confidence": 0.52,
                "summary": "Late-night screen use increased vs personal baseline.",
                "linked_analyzers_impacted": ["risk:wellbeing", "risk:engagement"],
            }
        ],
        "clinical_flags": [
            {
                "flag_id": "cf-stub-1",
                "raised_at": _iso(now - timedelta(days=1)),
                "category": "sleep_disruption",
                "statement_type": "behavioral_indicator",
                "severity": "low",
                "urgency": "routine",
                "confidence": 0.49,
                "label": "Possible sleep timing instability (proxy)",
                "detail": (
                    "Bedtime variability increased versus the patient baseline. "
                    "Interpret alongside sleep diary / biometrics if available."
                ),
                "caveats": ["Sleep proxy only — not polysomnography.", "Completeness 76% this window."],
                "evidence_refs": ["sleep_timing_proxy_deviation", "registry:sleep_circadian"],
            }
        ],
        "recommendations": [
            {
                "id": "rec-stub-1",
                "priority": "P1",
                "title": "Cross-check with Biometrics / Assessments",
                "detail": "Compare passive sleep proxy trend with wearable sleep and recent PHQ/GAD scores.",
                "action_type": "review_assessment",
                "targets": ["wearables", "assessments-v2"],
                "confidence": 0.55,
            }
        ],
        "multimodal_links": [
            _link("research-evidence", "Research Evidence", "87K+ papers — search: digital phenotyping / passive sensing", "—"),
            _link("qeeg-analysis", "qEEG Analyzer", "Neurophysiology context for same patient", "—"),
            _link("assessments-v2", "Assessments", "Last GAD-7 within analysis window", "2026-04-28"),
            _link("wearables", "Biometrics", "Resting HR / sleep duration series", "2026-05-01"),
            _link("risk-analyzer", "Risk Analyzer", "Wellbeing + engagement categories", "2026-05-02"),
            _link("session-execution", "Session execution", "In-clinic / treatment session capture", "—"),
            _link("live-session", "Virtual Care", "Telehealth treatment sessions", "—"),
            _link("protocol-studio", "Protocol Studio", "Active protocol context for this patient", "—"),
            _link("deeptwin", "DeepTwin", "Multimodal 360° patient view", "—"),
            _link("ai-agent-v2", "AI Practice Agents", "Agent-assisted protocol / documentation", "—"),
            _link("voice-analyzer", "Voice Analyzer", "Optional: correlate vocal fatigue flags", "—"),
            _link("video-assessments", "Video", "Session-based functional tasks", "—"),
            _link("text-analyzer", "Clinical Text", "Recent notes entity extraction", "—"),
        ],
        "consent_state": {
            "updated_at": _iso(now - timedelta(days=30)),
            "consent_scope_version": "2026.04",
            "domains_enabled": dict(DEFAULT_DOMAINS_ENABLED),
            "retention_summary_days": 365,
            "visibility_note": "Clinic care team per organization policy.",
        },
        "audit_events": [
            {
                "event_id": "aud-stub-1",
                "timestamp": _iso(now - timedelta(hours=3)),
                "action": "view",
                "actor_role": "clinician",
                "summary": "Page payload viewed",
            },
            {
                "event_id": "aud-stub-2",
                "timestamp": _iso(now - timedelta(days=1)),
                "action": "recompute",
                "actor_role": "clinician",
                "summary": "Recompute requested (stub)",
            },
        ],
    }


def _metric(value: float, confidence: float, baseline_comparison: str, sensitivity: str) -> dict[str, Any]:
    return {
        "value": value,
        "confidence": confidence,
        "completeness": 0.76,
        "baseline_comparison": baseline_comparison,
        "privacy_sensitivity_level": sensitivity,
    }


def _domain(
    domain: str,
    modalities: list[str],
    source_type: str,
    updated_at: str,
    stats: dict[str, Any],
) -> dict[str, Any]:
    return {
        "signal_domain": domain,
        "collection_modalities": modalities,
        "source_types": [source_type],
        "window_end": updated_at,
        "completeness": 0.76,
        "summary_stats": stats,
        "trend": "unclear",
        "linked_analyzers_impacted": [],
    }


def _link(page_id: str, title: str, note: str, last_updated: str) -> dict[str, Any]:
    return {
        "nav_page_id": page_id,
        "title": title,
        "relevance_note": note,
        "last_updated": last_updated,
    }


def _fmt_audit_ts(dt: Any) -> str:
    if dt is None:
        return ""
    if isinstance(dt, datetime):
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat().replace("+00:00", "Z")
    return str(dt)


def audit_rows_to_payload_events(rows: list[Any]) -> list[dict[str, Any]]:
    """Map ORM audit rows to the JSON shape expected by the web client."""
    out = []
    for r in rows:
        summary = ""
        if getattr(r, "detail_json", None):
            try:
                detail = json.loads(r.detail_json)
                summary = str(detail.get("summary") or detail.get("message") or "")
            except json.JSONDecodeError:
                summary = ""
        out.append(
            {
                "event_id": r.id,
                "timestamp": _fmt_audit_ts(r.created_at),
                "action": r.action,
                "actor_role": "clinician",
                "summary": summary or r.action,
            }
        )
    return out
