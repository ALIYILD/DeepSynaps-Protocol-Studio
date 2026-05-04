"""Auto-split bucket — see app.persistence.models package docstring.

This file contains a domain-grouped subset of the SQLAlchemy ORM classes
formerly in ``apps/api/app/persistence/models.py``. The split is shim-only:
every class is re-exported from ``app.persistence.models`` so callers see
no behavioural change. All classes share the single ``Base`` from
``app.database`` (re-exported here via ``_base``) — verify with
``Patient.metadata is AuditEventRecord.metadata``.
"""
from __future__ import annotations

from ._base import (  # noqa: F401 — re-export surface for class definitions
    Base,
    BigInteger,
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    Mapped,
    Optional,
    String,
    Text,
    UniqueConstraint,
    datetime,
    event,
    mapped_column,
    sa_text,
    timezone,
    uuid,
    _HAS_PGVECTOR,
    _PgVector,
    _embedding_column,
    _embedding_column_1536,
)


class DeviceConnection(Base):
    __tablename__ = "device_connections"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    source: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    source_type: Mapped[str] = mapped_column(String(32), nullable=False)
    display_name: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default='disconnected')
    consent_given: Mapped[bool] = mapped_column(Boolean(), nullable=False, default=False)
    consent_given_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    connected_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    last_sync_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    external_device_id: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    # Encrypted via app.crypto.encrypt_token() before write; decrypt with decrypt_token() on read.
    # WEARABLE_TOKEN_ENC_KEY env var must be set before real OAuth flows are enabled.
    # V1: these fields are empty (OAuth added in V2). Empty = no tokens stored yet.
    access_token_enc: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    refresh_token_enc: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    scope: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)

class WearableObservation(Base):
    __tablename__ = "wearable_observations"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    connection_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    source: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    source_type: Mapped[str] = mapped_column(String(32), nullable=False)
    metric_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    value: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    value_text: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    unit: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    observed_at: Mapped[datetime] = mapped_column(DateTime(), nullable=False, index=True)
    aggregation_window: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    quality_flag: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    synced_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))

class WearableDailySummary(Base):
    __tablename__ = "wearable_daily_summaries"
    __table_args__ = (
        UniqueConstraint("patient_id", "source", "date", name="uq_wearable_daily_patient_source_date"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    source: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    date: Mapped[str] = mapped_column(String(10), nullable=False, index=True)  # YYYY-MM-DD
    rhr_bpm: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    hrv_ms: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    sleep_duration_h: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    sleep_consistency_score: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    steps: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)
    spo2_pct: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    skin_temp_delta: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    readiness_score: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    mood_score: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    pain_score: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    anxiety_score: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    data_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    synced_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))

class WearableAlertFlag(Base):
    __tablename__ = "wearable_alert_flags"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    course_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    flag_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    severity: Mapped[str] = mapped_column(String(16), nullable=False)  # info, warning, urgent
    detail: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    metric_snapshot: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    triggered_at: Mapped[datetime] = mapped_column(DateTime(), nullable=False, index=True)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    reviewed_by: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    dismissed: Mapped[bool] = mapped_column(Boolean(), nullable=False, default=False, index=True)
    auto_generated: Mapped[bool] = mapped_column(Boolean(), nullable=False, default=True)

    # ── Wearables Workbench launch-audit (2026-05-01) — triage lifecycle ──
    # Distinct from the legacy ``dismissed`` boolean (which is the
    # binary suppression flipped by ``/api/v1/wearables/alerts/{id}/dismiss``).
    # These columns persist the four-state workflow (``open`` →
    # ``acknowledged`` → ``escalated`` → ``resolved``) used by the
    # Wearables Workbench triage queue. Every transition writes the
    # actor + UTC timestamp + clinician note so a regulator can replay
    # the full transcript per flag without inferring intent from a
    # binary.
    workbench_status: Mapped[Optional[str]] = mapped_column(String(20), nullable=True, index=True)
    acknowledged_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    acknowledged_by: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    acknowledge_note: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    escalated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    escalated_by: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    escalation_note: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    # Soft-FK to ``adverse_events.id`` — keeping it as a plain String allows
    # the triage row to outlive a future AE deletion without orphaning the
    # audit transcript.
    escalation_ae_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    resolved_by: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    resolve_note: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)

class DeviceSourceRegistry(Base):
    """Registry of device source types. V1 seeds one 'manual' entry.
    Phase 3: add vendor rows with adapter_class paths for direct integration."""
    __tablename__ = "device_source_registry"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    source_slug: Mapped[str] = mapped_column(String(80), unique=True, nullable=False, index=True)
    display_name: Mapped[str] = mapped_column(String(200), nullable=False)
    # tDCS | tACS | TMS | CES | tPBM | PEMF | other
    device_category: Mapped[str] = mapped_column(String(80), nullable=False)
    manufacturer: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    # not_integrated | csv_import | health_kit_bridge | vendor_api_v1 | vendor_api_v2
    integration_status: Mapped[str] = mapped_column(String(50), default="not_integrated")
    # Phase 3: fully-qualified Python class path e.g. "app.adapters.halo.HaloAdapter"
    adapter_class: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    # JSON: {"session_duration": true, "intensity": false, "montage": false, ...}
    capabilities_json: Mapped[str] = mapped_column(Text(), default="{}")
    oauth_required: Mapped[bool] = mapped_column(Boolean(), default=False)
    webhook_supported: Mapped[bool] = mapped_column(Boolean(), default=False)
    documentation_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean(), default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

class HomeDeviceAssignment(Base):
    """Clinician assigns a home neuromodulation device to a patient within a course.
    Carries prescribed parameters and patient-facing instructions."""
    __tablename__ = "home_device_assignments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    course_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    assigned_by: Mapped[str] = mapped_column(String(36), nullable=False)  # clinician user id
    # FK to DeviceSourceRegistry — NULL in V1 (manual; no registry entry required)
    source_registry_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    device_name: Mapped[str] = mapped_column(String(200), nullable=False)
    device_model: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    device_serial: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    device_category: Mapped[str] = mapped_column(String(80), nullable=False, default="other")
    # JSON: {intensity_ma, duration_min, montage, electrode_placement, frequency_hz, ...}
    parameters_json: Mapped[str] = mapped_column(Text(), default="{}")
    instructions_text: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    session_frequency_per_week: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)
    planned_total_sessions: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)
    # active | paused | completed | revoked
    status: Mapped[str] = mapped_column(String(30), default="active", index=True)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    revoke_reason: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

class DeviceSessionLog(Base):
    """Patient-reported home neuromodulation session.
    Clinician must review before any clinical interpretation."""
    __tablename__ = "device_session_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    assignment_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    patient_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    course_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    session_date: Mapped[str] = mapped_column(String(10), nullable=False)     # YYYY-MM-DD
    logged_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    duration_minutes: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)
    completed: Mapped[bool] = mapped_column(Boolean(), default=True)
    actual_intensity: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)   # e.g. "1.5mA"
    electrode_placement: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    side_effects_during: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    tolerance_rating: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)     # 1–5
    mood_before: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)          # 1–5
    mood_after: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)           # 1–5
    notes: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    media_upload_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    # pending_review | reviewed | flagged
    status: Mapped[str] = mapped_column(String(30), default="pending_review", index=True)
    reviewed_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    review_note: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))

class PatientAdherenceEvent(Base):
    """Structured adherence, side-effect, tolerance, and concern reports from patient."""
    __tablename__ = "patient_adherence_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    assignment_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    course_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    # adherence_report | side_effect | tolerance_change | break_request | concern | positive_feedback
    event_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    # low | moderate | high | urgent  (nullable for non-symptom events)
    severity: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    report_date: Mapped[str] = mapped_column(String(10), nullable=False)    # YYYY-MM-DD
    body: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    # JSON: {side_effect_type, frequency, duration, impact_on_function, timing_relative_to_session}
    structured_json: Mapped[str] = mapped_column(Text(), default="{}")
    media_upload_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    # open | acknowledged | resolved | escalated
    status: Mapped[str] = mapped_column(String(30), default="open", index=True)
    acknowledged_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    acknowledged_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    resolution_note: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))

class DeviceSyncEvent(Base):
    """Phase 3 hook: raw events from vendor adapters or HealthKit bridge, pre-reconciliation.
    V1: table exists but is unused — ready for Phase 2/3 adapter polling."""
    __tablename__ = "device_sync_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    assignment_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    patient_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    source_registry_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    # session_auto_detected | firmware_update | connection_lost | sync_completed | error
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)
    event_data: Mapped[str] = mapped_column(Text(), default="{}")   # raw vendor payload / inferred
    # vendor_api | health_kit | android_health | manual | csv_import
    source: Mapped[str] = mapped_column(String(80), nullable=False, default="manual")
    occurred_at: Mapped[datetime] = mapped_column(DateTime(), nullable=False)
    synced_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    reconciled: Mapped[bool] = mapped_column(Boolean(), default=False)
    reconciled_session_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))

class HomeDeviceReviewFlag(Base):
    """Auto-generated flags for clinician attention — missed sessions, tolerance drops, etc.
    Must be reviewed/dismissed by clinician before closure."""
    __tablename__ = "home_device_review_flags"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    assignment_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    session_log_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    adherence_event_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    course_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    # missed_sessions | tolerance_drop | side_effect_escalation | unusual_report
    # adherence_concern | parameter_deviation | urgent_symptom | sync_anomaly
    flag_type: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    # info | warning | urgent
    severity: Mapped[str] = mapped_column(String(20), nullable=False, default="warning")
    detail: Mapped[str] = mapped_column(Text(), nullable=False)
    auto_generated: Mapped[bool] = mapped_column(Boolean(), default=True)
    triggered_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc), index=True)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    reviewed_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    dismissed: Mapped[bool] = mapped_column(Boolean(), default=False, index=True)
    resolution: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))


# ── Forms & Assessments Models ────────────────────────────────────────────────

class VirtualCareSession(Base):
    """Video/voice telehealth sessions between patient and clinician."""
    __tablename__ = "virtual_care_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(String(36), ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True)
    clinician_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    appointment_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    session_type: Mapped[str] = mapped_column(String(20), nullable=False, default="video")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="scheduled")
    room_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    duration_seconds: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)
    transcript_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    ai_summary: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        CheckConstraint("session_type IN ('video','voice')", name='ck_vc_session_type'),
        CheckConstraint("status IN ('scheduled','active','ended','cancelled')", name='ck_vc_session_status'),
    )

class BiometricsSnapshot(Base):
    """Real-time biometrics captured during a virtual care session."""
    __tablename__ = "biometrics_snapshots"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id: Mapped[str] = mapped_column(String(36), ForeignKey("virtual_care_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    patient_id: Mapped[str] = mapped_column(String(36), ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True)
    source: Mapped[str] = mapped_column(String(50), nullable=False, default="wearable")
    heart_rate_bpm: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)
    hrv_ms: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    spo2_pct: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    blood_pressure_sys: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)
    blood_pressure_dia: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)
    stress_score: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)
    sleep_hours_last_night: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    steps_today: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))

class VoiceAnalysis(Base):
    """Voice sentiment and acoustic analysis from virtual care sessions."""
    __tablename__ = "voice_analysis"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id: Mapped[str] = mapped_column(String(36), ForeignKey("virtual_care_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    patient_id: Mapped[str] = mapped_column(String(36), ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True)
    segment_start_sec: Mapped[int] = mapped_column(Integer(), nullable=False, default=0)
    segment_end_sec: Mapped[int] = mapped_column(Integer(), nullable=False, default=0)
    sentiment: Mapped[str] = mapped_column(String(20), nullable=False, default="neutral")
    stress_level: Mapped[int] = mapped_column(Integer(), nullable=False, default=0)
    energy_level: Mapped[int] = mapped_column(Integer(), nullable=False, default=50)
    speech_pace_wpm: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)
    mood_tags_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    ai_insights: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        CheckConstraint("sentiment IN ('positive','neutral','negative','distressed')", name='ck_voice_sentiment'),
    )

class VideoAnalysis(Base):
    """Video engagement and facial expression analysis from virtual care sessions."""
    __tablename__ = "video_analysis"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id: Mapped[str] = mapped_column(String(36), ForeignKey("virtual_care_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    patient_id: Mapped[str] = mapped_column(String(36), ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True)
    segment_start_sec: Mapped[int] = mapped_column(Integer(), nullable=False, default=0)
    segment_end_sec: Mapped[int] = mapped_column(Integer(), nullable=False, default=0)
    engagement_score: Mapped[int] = mapped_column(Integer(), nullable=False, default=50)
    facial_expression: Mapped[str] = mapped_column(String(20), nullable=False, default="neutral")
    eye_contact_pct: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)
    posture_score: Mapped[Optional[int]] = mapped_column(Integer(), nullable=True)
    attention_flags_json: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    ai_insights: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        CheckConstraint("facial_expression IN ('happy','neutral','sad','anxious','frustrated')", name='ck_video_expression'),
    )


class VideoAssessmentSession(Base):
    """Guided video motor assessment (tele-neurology MVP) — session + task state in JSON."""

    __tablename__ = "video_assessment_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(String(36), ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True)
    encounter_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    protocol_name: Mapped[str] = mapped_column(String(128), nullable=False)
    protocol_version: Mapped[str] = mapped_column(String(32), nullable=False)
    overall_status: Mapped[str] = mapped_column(String(32), nullable=False, default="in_progress")
    session_json: Mapped[str] = mapped_column(Text(), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        CheckConstraint(
            "overall_status IN ('draft','in_progress','completed','finalized','cancelled')",
            name="ck_va_session_status",
        ),
    )


# ── Risk Stratification Models ────────────────────────────────────────────────

# ── qEEG Analysis Pipeline Models ──────────────────────────────────────────────

class PatientHomeDeviceRegistration(Base):
    """Patient-side home device registry (launch-audit 2026-05-01).

    Distinct from :class:`HomeDeviceAssignment` (clinician-side
    prescription) — this row is the patient's view of which physical
    devices they actually own / use at home, with serial number,
    calibration status, and lifecycle (``active`` / ``decommissioned``
    / ``faulty``). Pre-audit the page held all of this in browser
    localStorage; this table is the new source of truth.

    Lifecycle
    ---------
    * ``status='active'`` is the default; sessions can be logged.
    * ``status='decommissioned'`` is terminal — the row becomes
      immutable except for the audit-only ``decommission_reason``
      stamped at the moment of transition.
    * ``status='faulty'`` blocks new sessions until the clinician
      clears the fault. ``faulty_reason`` is required and emits a
      HIGH-priority clinician-visible audit row when set.
    * ``is_demo`` is sticky once stamped, exports honour it, and any
      DEMO row is excluded from regulator-submittable bundles.

    Higher regulatory weight than the prior four launch audits — device
    session logs feed Course Detail telemetry, AE Hub adverse-event
    detection, and signed completion reports. A device-record IDOR leak
    is a HIPAA-grade incident, so every read endpoint applies the
    ``patient_id == actor.patient.id`` gate at the router layer.
    """

    __tablename__ = "patient_home_device_registrations"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    patient_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("patients.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    assignment_id: Mapped[Optional[str]] = mapped_column(
        String(36), nullable=True
    )
    clinic_id: Mapped[Optional[str]] = mapped_column(
        String(36), nullable=True, index=True
    )
    registered_by_actor_id: Mapped[str] = mapped_column(
        String(64), nullable=False
    )
    device_name: Mapped[str] = mapped_column(String(200), nullable=False)
    device_model: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    device_category: Mapped[str] = mapped_column(String(80), nullable=False)
    device_serial: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    settings_json: Mapped[str] = mapped_column(
        Text(), nullable=False, default="{}"
    )
    settings_revision: Mapped[int] = mapped_column(
        Integer(), nullable=False, default=0
    )
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="active", index=True
    )
    decommissioned_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(), nullable=True
    )
    decommission_reason: Mapped[Optional[str]] = mapped_column(
        String(500), nullable=True
    )
    marked_faulty_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(), nullable=True
    )
    faulty_reason: Mapped[Optional[str]] = mapped_column(
        String(500), nullable=True
    )
    last_calibrated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(), nullable=True
    )
    is_demo: Mapped[bool] = mapped_column(
        Boolean(), nullable=False, default=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

class PatientHomeDeviceCalibration(Base):
    """Calibration log for a :class:`PatientHomeDeviceRegistration`.

    Each row records one calibration run (``passed`` / ``failed`` /
    ``skipped``), who performed it, and any notes. The most recent
    row's timestamp is surfaced as ``last_calibrated_at`` on the
    parent registration.
    """

    __tablename__ = "patient_home_device_calibrations"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    registration_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("patient_home_device_registrations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    patient_id: Mapped[str] = mapped_column(
        String(36), nullable=False, index=True
    )
    performed_by_actor_id: Mapped[str] = mapped_column(
        String(64), nullable=False
    )
    # passed | failed | skipped
    result: Mapped[str] = mapped_column(
        String(30), nullable=False, default="passed"
    )
    notes: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    is_demo: Mapped[bool] = mapped_column(
        Boolean(), nullable=False, default=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )


# ── Care Team Coverage / Staff Scheduling (migration 072) ──────────────────
# These four tables back the Care Team Coverage launch audit (2026-05-01,
# PR feat/care-team-coverage-launch-audit-2026-05-01). They route
# inbox.item_paged_to_oncall events from the Clinician Inbox HIGH-priority
# aggregation predicate (see clinician_inbox_router) to a real human via a
# clinic-scoped roster + SLA config + escalation chain. See
# routers/care_team_coverage_router for the public API surface.
