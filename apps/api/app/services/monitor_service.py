from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, require_minimum_role
from app.persistence.models import DeviceConnection, OutcomeEvent, Patient, WearableAlertFlag, WearableDailySummary

LIVE_STREAM_INTERVAL_SECONDS = 15

CONNECTOR_CATALOG = (
    # ── EHR / EMR ─────────────────────────────────────────────────────────────
    {"id": "epic_fhir",         "display_name": "Epic (FHIR R4)",             "kind": "ehr", "auth_method": "smart_on_fhir"},
    {"id": "cerner_oracle",     "display_name": "Cerner / Oracle Health",     "kind": "ehr", "auth_method": "smart_on_fhir"},
    {"id": "athenahealth",      "display_name": "Athenahealth",               "kind": "ehr", "auth_method": "oauth2"},
    {"id": "allscripts",        "display_name": "Allscripts Veradigm",        "kind": "ehr", "auth_method": "oauth2"},
    {"id": "eclinicalworks",    "display_name": "eClinicalWorks",             "kind": "ehr", "auth_method": "api_key"},
    {"id": "drchrono",          "display_name": "DrChrono",                   "kind": "ehr", "auth_method": "oauth2"},
    {"id": "practice_fusion",   "display_name": "Practice Fusion",            "kind": "ehr", "auth_method": "oauth2"},
    {"id": "kareo_clinical",    "display_name": "Kareo Clinical",             "kind": "ehr", "auth_method": "api_key"},
    # ── Wearable / Biometrics ─────────────────────────────────────────────────
    {"id": "apple_healthkit",   "display_name": "Apple HealthKit",            "kind": "wearable", "auth_method": "oauth2"},
    {"id": "google_health",     "display_name": "Google Health Connect",      "kind": "wearable", "auth_method": "oauth2"},
    {"id": "fitbit",            "display_name": "Fitbit",                     "kind": "wearable", "auth_method": "oauth2"},
    {"id": "garmin_connect",    "display_name": "Garmin Connect",             "kind": "wearable", "auth_method": "oauth2"},
    {"id": "oura_ring",         "display_name": "Oura Ring",                  "kind": "wearable", "auth_method": "oauth2"},
    {"id": "whoop",             "display_name": "WHOOP",                      "kind": "wearable", "auth_method": "oauth2"},
    {"id": "polar",             "display_name": "Polar",                      "kind": "wearable", "auth_method": "oauth2"},
    {"id": "samsung_health",    "display_name": "Samsung Health",             "kind": "wearable", "auth_method": "oauth2"},
    {"id": "biostrap",          "display_name": "Biostrap",                   "kind": "wearable", "auth_method": "api_key"},
    {"id": "withings",          "display_name": "Withings Health Mate",       "kind": "wearable", "auth_method": "oauth2"},
    # ── Home-use neuromodulation devices ──────────────────────────────────────
    {"id": "flow_tdcs",         "display_name": "Flow Neuroscience tDCS",     "kind": "home_device", "auth_method": "api_key"},
    {"id": "fisher_wallace",    "display_name": "Fisher Wallace Stimulator",  "kind": "home_device", "auth_method": "api_key"},
    {"id": "soterix_medical",   "display_name": "Soterix Medical tDCS",       "kind": "home_device", "auth_method": "api_key"},
    {"id": "neuroelectrics",    "display_name": "Neuroelectrics Starstim",    "kind": "home_device", "auth_method": "api_key"},
    {"id": "brainpatch",        "display_name": "BrainPatch",                 "kind": "home_device", "auth_method": "api_key"},
    {"id": "neurostyle",        "display_name": "NeuroStyle Home tES",        "kind": "home_device", "auth_method": "api_key"},
    # ── Brain monitoring / EEG headsets ───────────────────────────────────────
    {"id": "muse_interaxon",    "display_name": "Muse (InteraXon)",           "kind": "brain_monitor", "auth_method": "bluetooth"},
    {"id": "emotiv_epoc",       "display_name": "Emotiv EPOC",               "kind": "brain_monitor", "auth_method": "api_key"},
    {"id": "neurosky",          "display_name": "NeuroSky MindWave",          "kind": "brain_monitor", "auth_method": "bluetooth"},
    {"id": "openbci",           "display_name": "OpenBCI Cyton",              "kind": "brain_monitor", "auth_method": "api_key"},
    {"id": "neurosity_crown",   "display_name": "Neurosity Crown",            "kind": "brain_monitor", "auth_method": "oauth2"},
    # ── PROM / Patient-reported outcomes ──────────────────────────────────────
    {"id": "native_prom",       "display_name": "DeepSynaps PWA e-diary",     "kind": "prom", "auth_method": "none"},
    {"id": "redcap",            "display_name": "REDCap",                     "kind": "prom", "auth_method": "api_key"},
    {"id": "qualtrics",         "display_name": "Qualtrics",                  "kind": "prom", "auth_method": "api_key"},
    # ── Messaging / Communication ─────────────────────────────────────────────
    {"id": "twilio_sms",        "display_name": "Twilio SMS",                 "kind": "messaging", "auth_method": "api_key"},
    {"id": "sendgrid_email",    "display_name": "SendGrid Email",             "kind": "messaging", "auth_method": "api_key"},
    # ── Lab / Diagnostics ─────────────────────────────────────────────────────
    {"id": "quest_diagnostics", "display_name": "Quest Diagnostics",          "kind": "lab", "auth_method": "api_key"},
    {"id": "labcorp",           "display_name": "LabCorp",                    "kind": "lab", "auth_method": "api_key"},
    # ── Pharmacy ──────────────────────────────────────────────────────────────
    {"id": "surescripts",       "display_name": "Surescripts e-Prescribing",  "kind": "pharmacy", "auth_method": "api_key"},
    {"id": "pillpack",          "display_name": "PillPack (Amazon Pharmacy)", "kind": "pharmacy", "auth_method": "oauth2"},
    # ── Telehealth ────────────────────────────────────────────────────────────
    {"id": "zoom_health",       "display_name": "Zoom Health (HIPAA)",        "kind": "telehealth", "auth_method": "oauth2"},
    {"id": "doxy_me",           "display_name": "Doxy.me",                    "kind": "telehealth", "auth_method": "api_key"},
    # ── Billing / Insurance ───────────────────────────────────────────────────
    {"id": "availity",          "display_name": "Availity",                   "kind": "billing", "auth_method": "api_key"},
    {"id": "change_healthcare", "display_name": "Change Healthcare",          "kind": "billing", "auth_method": "api_key"},
)

_CONNECTED: dict[str, dict[str, dict]] = {}
_RESOLVED: dict[str, set[str]] = {}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: datetime | None) -> datetime | None:
    """Coerce a potentially tz-naive datetime to UTC-aware (SQLite strips tzinfo)."""
    if dt is None:
        return None
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


def _clinic_id(actor: AuthenticatedActor) -> str:
    return actor.actor_id


def _patients(actor: AuthenticatedActor, db: Session) -> list[Patient]:
    require_minimum_role(actor, 'clinician')
    q = db.query(Patient)
    if actor.role != 'admin':
        q = q.filter(Patient.clinician_id == actor.actor_id)
    return q.order_by(Patient.created_at.desc()).all()


def build_live_snapshot(actor: AuthenticatedActor, db: Session) -> dict:
    patients = _patients(actor, db)
    patient_ids = [p.id for p in patients]
    summaries = {}
    for row in db.query(WearableDailySummary).filter(WearableDailySummary.patient_id.in_(patient_ids)).order_by(WearableDailySummary.synced_at.desc()).all():
        summaries.setdefault(row.patient_id, row)
    alerts = {}
    for row in db.query(WearableAlertFlag).filter(WearableAlertFlag.patient_id.in_(patient_ids), WearableAlertFlag.dismissed.is_(False)).order_by(WearableAlertFlag.triggered_at.desc()).all():
        alerts.setdefault(row.patient_id, []).append(row)
    outcomes = {}
    for row in db.query(OutcomeEvent).filter(OutcomeEvent.patient_id.in_(patient_ids)).order_by(OutcomeEvent.recorded_at.desc()).all():
        outcomes.setdefault(row.patient_id, row)

    rows = []
    counts = {'red': 0, 'orange': 0, 'yellow': 0, 'green': 0}
    for patient in patients:
        summary = summaries.get(patient.id)
        patient_alerts = alerts.get(patient.id, [])
        outcome = outcomes.get(patient.id)
        risk_tier = 'green'
        risk_score = 0.18
        drivers = []
        if summary is None or (_now() - _aware(summary.synced_at)).total_seconds() >= 48 * 3600:
            risk_tier = 'orange'
            risk_score = 0.58
            drivers.append('wearable_stale')
        if summary and summary.readiness_score is not None and summary.readiness_score < 20:
            risk_tier = 'red'
            risk_score = max(risk_score, 0.78)
            drivers.append('low_readiness')
        for alert in patient_alerts:
            if alert.severity == 'urgent':
                risk_tier = 'red'
                risk_score = max(risk_score, 0.86)
                drivers.append(alert.flag_type)
                break
            if alert.severity in ('warning', 'warn') and risk_tier != 'red':
                risk_tier = 'orange'
                risk_score = max(risk_score, 0.64)
                drivers.append(alert.flag_type)
        if not drivers:
            drivers.append('no_elevated_signal')
        counts[risk_tier] += 1
        rows.append({
            'patient_id': patient.id,
            'display_name': f'{patient.first_name} {patient.last_name}'.strip(),
            'risk_tier': risk_tier,
            'risk_score': round(risk_score, 2),
            'risk_drivers': drivers[:4],
            'hrv_last': summary.hrv_ms if summary else None,
            'sleep_last': summary.sleep_duration_h if summary else None,
            'prom_delta': None,
            'adherence_pct': summary.readiness_score if summary else None,
            'last_feature_at': summary.synced_at.isoformat() if summary else None,
            'wearable_stale': summary is None or (_now() - _aware(summary.synced_at)).total_seconds() >= 48 * 3600,
            'last_device_seen_at': summary.synced_at.isoformat() if summary else None,
            'last_contact_at': outcome.recorded_at.isoformat() if outcome else None,
        })
    rows.sort(key=lambda item: ({'red': 0, 'orange': 1, 'yellow': 2, 'green': 3}.get(item['risk_tier'], 4), -item['risk_score'], item['display_name']))
    crises = [{
        'patient_id': row['patient_id'],
        'display_name': row['display_name'],
        'tier': row['risk_tier'],
        'score': row['risk_score'],
        'top_driver': row['risk_drivers'][0],
        'reason_text': ', '.join(row['risk_drivers'][:2]),
    } for row in rows if row['risk_tier'] == 'red']
    active_rows = len(rows) or 1
    return {
        'clinic_id': _clinic_id(actor),
        'generated_at': _now().isoformat(),
        'kpis': {
            'red': counts['red'],
            'orange': counts['orange'],
            'yellow': counts['yellow'],
            'green': counts['green'],
            'open_crises': len(crises),
            'wearable_uptime_pct': round((len([r for r in rows if not r['wearable_stale']]) / active_rows) * 100, 1),
            'prom_compliance_pct': round((len([r for r in rows if r['last_contact_at']]) / active_rows) * 100, 1),
        },
        'crises': crises,
        'caseload': rows,
    }


def list_integrations(actor: AuthenticatedActor, db: Session) -> dict:
    require_minimum_role(actor, 'clinician')
    clinic = _clinic_id(actor)
    configured = []
    patient_counts = {}
    for source, in db.query(DeviceConnection.source).filter(DeviceConnection.status != 'disconnected').all():
        patient_counts[source] = patient_counts.get(source, 0) + 1
    for connector_id, item in _CONNECTED.get(clinic, {}).items():
        configured.append({
            'id': connector_id,
            'connector_id': connector_id,
            'display_name': item['display_name'],
            'kind': item['kind'],
            'auth_method': item['auth_method'],
            'status': item['status'],
            'last_sync_at': item.get('last_sync_at'),
            'patient_count': patient_counts.get(connector_id, 0),
            'last_error': item.get('last_error'),
        })
    groups = {}
    for item in CONNECTOR_CATALOG:
        groups.setdefault(item['kind'], []).append(dict(item))
    return {'catalog': [dict(item) for item in CONNECTOR_CATALOG], 'groups': groups, 'configured': configured}


def connect_integration(actor: AuthenticatedActor, db: Session, connector_id: str, config: dict) -> dict:
    require_minimum_role(actor, 'admin')
    connector = next((item for item in CONNECTOR_CATALOG if item['id'] == connector_id), None)
    if connector is None:
        raise ValueError('unknown_connector')
    clinic = _clinic_id(actor)
    _CONNECTED.setdefault(clinic, {})[connector_id] = {
        **connector,
        'status': 'healthy',
        'last_sync_at': _now().isoformat(),
        'config': config or {},
    }
    return {'ok': True, 'integration_id': connector_id, 'connector_id': connector_id}


def sync_integration(actor: AuthenticatedActor, db: Session, integration_id: str) -> dict:
    require_minimum_role(actor, 'clinician')
    clinic = _clinic_id(actor)
    item = _CONNECTED.setdefault(clinic, {}).setdefault(integration_id, {
        'display_name': integration_id,
        'kind': 'external',
        'auth_method': 'manual',
        'status': 'healthy',
    })
    item['last_sync_at'] = _now().isoformat()
    item['status'] = 'healthy'
    return {'ok': True, 'integration_id': integration_id, 'last_sync_at': item['last_sync_at']}


def disconnect_integration(actor: AuthenticatedActor, db: Session, integration_id: str) -> dict:
    require_minimum_role(actor, 'admin')
    _CONNECTED.setdefault(_clinic_id(actor), {}).pop(integration_id, None)
    return {'ok': True, 'integration_id': integration_id}


def list_fleet(actor: AuthenticatedActor, db: Session) -> dict:
    require_minimum_role(actor, 'clinician')
    # Scope DeviceConnection rows to the actor's patients — pre-fix this
    # query had no clinic/clinician filter and returned every connected
    # device across every clinic (cross-clinic info disclosure).
    patients = _patients(actor, db)
    patient_ids = [p.id for p in patients]
    grouped: dict = {}
    if not patient_ids:
        return {'clinic_id': _clinic_id(actor), 'devices': []}
    for row in db.query(DeviceConnection).filter(
        DeviceConnection.status != 'disconnected',
        DeviceConnection.patient_id.in_(patient_ids),
    ).all():
        item = grouped.setdefault(row.source, {
            'id': row.source,
            'device_key': row.source,
            'display_name': row.display_name or row.source.replace('_', ' ').title(),
            'kind': row.source_type,
            'status': 'healthy',
            'assigned_patient_count': 0,
            'last_seen_at': None,
            'detail': None,
        })
        item['assigned_patient_count'] += 1
        seen_at = row.last_sync_at or row.connected_at
        if seen_at and (item['last_seen_at'] is None or seen_at.isoformat() > item['last_seen_at']):
            item['last_seen_at'] = seen_at.isoformat()
    return {'clinic_id': _clinic_id(actor), 'devices': list(grouped.values())}


def list_data_quality_issues(actor: AuthenticatedActor, db: Session) -> dict:
    require_minimum_role(actor, 'clinician')
    clinic = _clinic_id(actor)
    resolved = _RESOLVED.setdefault(clinic, set())
    live = build_live_snapshot(actor, db)
    issues = []
    counts = {'error': 0, 'warn': 0, 'info': 0}
    for row in live['caseload']:
        if row['wearable_stale']:
            issue_id = f"derived:wearable_stale_48h:patient:{row['patient_id']}"
            if issue_id not in resolved:
                counts['warn'] += 1
                issues.append({
                    'id': issue_id,
                    'severity': 'warn',
                    'title': f"{row['display_name']} - wearable not synced >48h",
                    'detail': f"last feature update: {row['last_feature_at'] or 'none'}",
                    'suggested_fix': 'Ask the patient to reopen the wearable app and confirm permissions.',
                })
    for connector_id, item in _CONNECTED.get(clinic, {}).items():
        if item.get('last_error'):
            issue_id = f'derived:integration_error:integration:{connector_id}'
            if issue_id not in resolved:
                counts['error'] += 1
                issues.append({
                    'id': issue_id,
                    'severity': 'error',
                    'title': f"{item['display_name']} - integration error",
                    'detail': item['last_error'],
                    'suggested_fix': 'Reconnect the integration and review credentials or webhook configuration.',
                })
    return {'counts': counts, 'issues': issues}


def resolve_data_quality_issue(actor: AuthenticatedActor, db: Session, issue_id: str) -> dict:
    require_minimum_role(actor, 'admin')
    _RESOLVED.setdefault(_clinic_id(actor), set()).add(issue_id)
    return {'ok': True, 'issue_id': issue_id}
