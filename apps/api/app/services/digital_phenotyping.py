"""Digital Phenotyping Analyzer — stub aggregation until passive ingest lands.

Returns a deterministic, JSON-serializable payload for clinician UI scaffolding.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any


def _iso(dt: datetime) -> str:
    return dt.replace(microsecond=0).isoformat().replace("+00:00", "Z")


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
            _link("assessments-v2", "Assessments", "Last GAD-7 within analysis window", "2026-04-28"),
            _link("wearables", "Biometrics", "Resting HR / sleep duration series", "2026-05-01"),
            _link("risk-analyzer", "Risk Analyzer", "Wellbeing + engagement categories", "2026-05-02"),
            _link("live-session", "Virtual Care", "Scheduled or ad-hoc treatment sessions", "—"),
            _link("protocol-studio", "Protocol Studio", "Active protocol context for this patient", "—"),
            _link("voice-analyzer", "Voice Analyzer", "Optional: correlate vocal fatigue flags", "—"),
            _link("video-assessments", "Video", "Session-based functional tasks", "—"),
            _link("text-analyzer", "Clinical Text", "Recent notes entity extraction", "—"),
        ],
        "consent_state": {
            "updated_at": _iso(now - timedelta(days=30)),
            "consent_scope_version": "2026.04",
            "domains_enabled": {
                "screen_use": True,
                "location_mobility": True,
                "physical_activity": True,
                "sleep_proxy": True,
                "social_communication": False,
                "device_engagement": True,
                "ema_active": True,
            },
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
