# DeepSynaps Protocol Studio — API Documentation

> **Version:** 4.0.0 | **API Base:** `http://localhost:8000` (dev) / `https://<your-domain>` (prod)
>
> **Safety Notice:** All endpoints return `safety_disclaimer` in responses. This is decision support only — clinician review required. Does not diagnose, prescribe, or prove causality.

---

## Table of Contents

1. [Authentication & Authorization](#1-authentication--authorization)
2. [System Endpoints](#2-system-endpoints)
3. [Multimodal Intelligence (Phase 3)](#3-multimodal-intelligence-phase-3)
4. [DeepTwin (Phase 4)](#4-deeptwin-phase-4)
5. [Summary Endpoints](#5-summary-endpoints)
6. [Analyzer Evidence Endpoints](#6-analyzer-evidence-endpoints)
7. [Admin & Operations](#7-admin--operations)
8. [Error Response Formats](#8-error-response-formats)
9. [Rate Limiting](#9-rate-limiting)
10. [Data Models & Contracts](#10-data-models--contracts)

---

## 1. Authentication & Authorization

### Headers Required on All Endpoints (except `/health`, `/api/v1/system/runtime-config`)

| Header | Value | Required |
|--------|-------|----------|
| `X-Clinic-ID` | Clinic identifier | Yes |
| `X-Patient-Access-Token` | Patient access token | Yes |

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `clinician_id` | `string` | Yes | Clinician ID (validated against role naming convention) |

### Role-Based Access Control (RBAC)

Roles are determined by `clinician_id` naming convention (prefix matching):

| Role Prefix | Role ID | Permissions |
|-------------|---------|-------------|
| `superadmin` | `super_admin` | Cross-clinic access, all operations |
| `clinicadmin` | `clinic_admin` | Clinic-scoped admin, user management |
| `clinician` | `clinician` | Standard patient care, AI synthesis |
| `reviewer` | `reviewer` | Read-only, no AI synthesis |
| `technician` | `technician` | Data ingestion only, no patient read |

**Role hierarchy (most to least privileged):** `super_admin > clinic_admin > clinician > reviewer > technician`

Higher roles inherit permissions from lower roles. Each role prefix must be an exact match or a strict prefix followed by `-<digits>` (e.g., `clinician-001`, `clinicadmin-42`).

### Clinic Isolation

Every patient query is scoped to `X-Clinic-ID`. Cross-clinic access returns `403 Forbidden`, except for `super_admin` (for governance override only).

### AI Consent

Endpoints requiring AI synthesis (`/synthesis`) check `ai_analysis_consent` on the `patient_access` record. No role — including `super_admin` — bypasses consent. Missing consent returns `403 Forbidden`.

### Export Permission

`POST /api/v1/deeptwin/patients/{patient_id}/export` requires `can_export` permission. Only `super_admin`, `clinic_admin`, `clinician`, and `reviewer` roles have this.

### Request Example

```bash
curl -X GET "http://localhost:8000/api/v1/multimodal/patients/p-001/timeline?clinician_id=clinician-001" \
  -H "Content-Type: application/json" \
  -H "X-Clinic-ID: clinic-001" \
  -H "X-Patient-Access-Token: token-001"
```

---

## 2. System Endpoints

### 2.1 GET `/health` — Health Check

Unauthenticated endpoint for load balancer / monitoring checks.

**Auth:** None

**Response:**
```json
{
  "status": "ok",
  "phase": "4",
  "modules": [
    "timeline",
    "correlation",
    "confound",
    "evidence",
    "hypothesis",
    "missing_data",
    "deeptwin_snapshot",
    "deeptwin_review",
    "deeptwin_export"
  ]
}
```

**cURL:**
```bash
curl http://localhost:8000/health
```

---

### 2.2 GET `/api/v1/system/runtime-config` — Runtime Configuration

Returns safe, non-secret runtime configuration for the frontend (demo mode flags, env label, build info).

**Auth:** None

**Response:**
```json
{
  "app_env": "development",
  "dialect": "postgresql",
  "demo_mode_enabled": false,
  "demo_seed_enabled": false,
  "demo_mode_label": "DEMO BUILD",
  "is_production": false,
  "log_level": "INFO",
  "pool_size": 10,
  "sslmode": "prefer"
}
```

**cURL:**
```bash
curl http://localhost:8000/api/v1/system/runtime-config
```

---

### 2.3 GET `/api/v1/system/materialized-views/status` — Materialized View Status

Returns materialized view status for admin monitoring. No PHI exposed.

**Auth:** Requires `clinic_admin` or `super_admin` role.

**Headers:**
| Header | Required | Description |
|--------|----------|-------------|
| `X-Clinic-ID` | Yes | Clinic ID |
| `clinician_id` | Yes (query param) | Admin clinician ID |

**Response:**
```json
{
  "dialect": "postgresql",
  "available": true,
  "views": [],
  "last_refresh": null,
  "generated_by": "clinicadmin-001",
  "generated_at": "2024-01-15T10:30:00"
}
```

**cURL:**
```bash
curl -X GET "http://localhost:8000/api/v1/system/materialized-views/status?clinician_id=clinicadmin-001" \
  -H "X-Clinic-ID: clinic-001"
```

---

### 2.4 POST `/api/v1/system/materialized-views/refresh` — Refresh Materialized Views

Manually refresh all materialized views. No-op on SQLite. Returns refresh status per view.

**Auth:** Requires `clinic_admin` or `super_admin` role.

**Headers:**
| Header | Required | Description |
|--------|----------|-------------|
| `X-Clinic-ID` | Yes | Clinic ID |
| `clinician_id` | Yes (query param) | Admin clinician ID |

**Response:**
```json
{
  "refreshed_by": "clinicadmin-001",
  "refreshed_at": "2024-01-15T10:30:00",
  "dialect": "postgresql",
  "results": {}
}
```

**cURL:**
```bash
curl -X POST "http://localhost:8000/api/v1/system/materialized-views/refresh?clinician_id=clinicadmin-001" \
  -H "X-Clinic-ID: clinic-001"
```

---

## 3. Multimodal Intelligence (Phase 3)

All Phase 3 endpoints require: `X-Clinic-ID`, `X-Patient-Access-Token`, `clinician_id` query param, and a valid `clinician`+ role.

### 3.1 GET `/api/v1/multimodal/patients/{patient_id}/timeline` — Patient Timeline

Get multimodal timeline events for a patient.

**Auth:** Clinician role, clinic isolation

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `patient_id` | `string` | Patient identifier |

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `clinician_id` | `string` | Yes | Clinician ID |
| `modality` | `string[]` | No | Filter by modality (repeat param for multiple) |
| `from_date` | `string` (ISO) | No | Start date (ISO-8601) |
| `to_date` | `string` (ISO) | No | End date (ISO-8601) |

**Response Model:** `TimelineResponse`
```json
{
  "patient_id": "p-001",
  "events": [
    {
      "event_id": "evt_a1b2c3d4e5f6",
      "patient_id": "p-001",
      "event_type": "assessment",
      "modality": "assessment",
      "source_system": "EMR",
      "source_record_id": "rec-001",
      "timestamp": "2024-01-01T09:00:00",
      "value_summary": "PHQ-9 score: 12",
      "numeric_features": {"phq9_total": 12},
      "textual_summary": "Moderate depression symptoms reported",
      "confidence": 0.85,
      "data_quality": "high",
      "provenance": {},
      "evidence_links": [],
      "audit_reference": "audit_a1b2c3d4"
    }
  ],
  "event_count": 1,
  "safety_disclaimer": "This output is decision support only and requires clinician review. It does not constitute a diagnosis or treatment recommendation."
}
```

**cURL:**
```bash
curl -X GET "http://localhost:8000/api/v1/multimodal/patients/p-001/timeline?clinician_id=clinician-001&modality=assessment&modality=qeeg&from_date=2024-01-01&to_date=2024-01-31" \
  -H "X-Clinic-ID: clinic-001" \
  -H "X-Patient-Access-Token: token-001"
```

---

### 3.2 GET `/api/v1/multimodal/patients/{patient_id}/correlations` — Correlation Findings

Get cross-modality correlation findings for a patient.

**Auth:** Clinician role, clinic isolation

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `patient_id` | `string` | Patient identifier |

**Query Parameters:**
| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| `clinician_id` | `string` | — | Yes | Clinician ID |
| `window_days` | `int` | `30` | 1–365 | Correlation window in days |
| `min_confidence` | `float` | `0.5` | 0.0–1.0 | Minimum confidence threshold |

**Response Model:** `CorrelationResponse`
```json
{
  "patient_id": "p-001",
  "correlations": [
    {
      "insight_id": "ins_a1b2c3d4e5f6",
      "patient_id": "p-001",
      "insight_type": "correlation",
      "modalities_involved": ["qeeg", "medication"],
      "timeline_window": ["2024-01-01T00:00:00", "2024-01-31T00:00:00"],
      "summary": "QEEG theta power shows temporal association with medication adherence patterns",
      "supporting_events": ["evt_001", "evt_002"],
      "conflicting_events": [],
      "confounders": [],
      "evidence_links": [],
      "confidence": 0.72,
      "uncertainty_drivers": ["Limited longitudinal data", "Single clinic cohort"],
      "research_only": true,
      "clinician_review_required": true,
      "safety_labels": ["Decision support only. Requires clinician review.", "Temporal association only. Not causal proof."]
    }
  ],
  "safety_disclaimer": "This output is decision support only and requires clinician review. It does not constitute a diagnosis or treatment recommendation."
}
```

**cURL:**
```bash
curl -X GET "http://localhost:8000/api/v1/multimodal/patients/p-001/correlations?clinician_id=clinician-001&window_days=30&min_confidence=0.5" \
  -H "X-Clinic-ID: clinic-001" \
  -H "X-Patient-Access-Token: token-001"
```

---

### 3.3 GET `/api/v1/multimodal/patients/{patient_id}/confounders` — Confounders

Get potential confounders for a patient.

**Auth:** Clinician role, clinic isolation

**Response Model:** `ConfounderResponse`
```json
{
  "patient_id": "p-001",
  "confounders": [
    {
      "confounder_id": "cnf_a1b2c3d4e5f6",
      "confounder_type": "medication",
      "description": "Concurrent SSRI use may influence QEEG theta power readings",
      "severity": "moderate",
      "evidence_events": ["evt_001", "evt_003"],
      "impact_estimate": "moderate reduction in correlation strength",
      "mitigation_suggestion": "Consider medication washout period or adjust for SSRI dosage"
    }
  ],
  "safety_disclaimer": "This output is decision support only and requires clinician review. It does not constitute a diagnosis or treatment recommendation."
}
```

**cURL:**
```bash
curl -X GET "http://localhost:8000/api/v1/multimodal/patients/p-001/confounders?clinician_id=clinician-001" \
  -H "X-Clinic-ID: clinic-001" \
  -H "X-Patient-Access-Token: token-001"
```

---

### 3.4 GET `/api/v1/multimodal/patients/{patient_id}/quality-flags` — Quality Flags

Get data quality flags for a patient.

**Auth:** Clinician role, clinic isolation

**Response Model:** `QualityFlagsResponse`
```json
{
  "patient_id": "p-001",
  "quality_flags": [
    {
      "flag_id": "qf_a1b2c3d4e5f6",
      "modality": "qeeg",
      "flag_type": "stale_data",
      "severity": "medium",
      "description": "No QEEG recordings in the last 45 days",
      "recommendation": "Schedule follow-up QEEG session"
    }
  ],
  "safety_disclaimer": "This output is decision support only and requires clinician review. It does not constitute a diagnosis or treatment recommendation."
}
```

**cURL:**
```bash
curl -X GET "http://localhost:8000/api/v1/multimodal/patients/p-001/quality-flags?clinician_id=clinician-001" \
  -H "X-Clinic-ID: clinic-001" \
  -H "X-Patient-Access-Token: token-001"
```

---

### 3.5 POST `/api/v1/multimodal/patients/{patient_id}/synthesis` — Full Synthesis

Generate full multimodal synthesis for a patient. **Requires `ai_analysis_consent`.**

**Auth:** Clinician role, clinic isolation, AI consent

**Request Body:** `SynthesisBody`
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `include_modalities` | `string[]` | No | All | Filter by modality types |
| `date_range` | `string[]` (2) | No | All history | `[from_date, to_date]` ISO-8601 |
| `focus_areas` | `string[]` | No | None | Focus areas for synthesis |
| `min_confidence` | `float` | No | `0.3` | Minimum confidence threshold (0.0–1.0) |
| `max_hypotheses` | `int` | No | `5` | Maximum hypotheses to return (>= 1) |

**Valid Modality Types:**
`assessment`, `qeeg`, `mri`, `biomarker`, `medication`, `intervention`, `voice`, `text`, `video`, `wearable`, `digital_phenotyping`, `risk_signal`, `report`, `patient_checkin`

**Response Model:** `SynthesisResponseModel`
```json
{
  "synthesis_id": "syn_a1b2c3d4e5f6",
  "patient_id": "p-001",
  "generated_at": "2024-01-15T10:30:00",
  "timeline": [...],
  "correlations": [...],
  "confounders": [...],
  "quality_flags": [...],
  "ranked_hypotheses": [
    {
      "insight_id": "ins_a1b2c3d4e5f6",
      "patient_id": "p-001",
      "insight_type": "hypothesis",
      "modalities_involved": ["qeeg", "medication"],
      "summary": "Increased theta power correlates with reduced medication adherence",
      "confidence": 0.72,
      "safety_labels": ["Decision support only. Requires clinician review.", "Ranked clinical hypothesis. Requires clinician review."]
    }
  ],
  "evidence_summary": {"total_evidence": 3, "grades": {"A": 1, "B": 2}},
  "safety_disclaimer": "This output is decision support only and requires clinician review. It does not constitute a diagnosis or treatment recommendation."
}
```

**cURL:**
```bash
curl -X POST "http://localhost:8000/api/v1/multimodal/patients/p-001/synthesis?clinician_id=clinician-001" \
  -H "Content-Type: application/json" \
  -H "X-Clinic-ID: clinic-001" \
  -H "X-Patient-Access-Token: token-001" \
  -d '{
    "include_modalities": ["qeeg", "medication"],
    "date_range": ["2024-01-01", "2024-01-31"],
    "focus_areas": ["adherence"],
    "min_confidence": 0.3,
    "max_hypotheses": 5
  }'
```

---

## 4. DeepTwin (Phase 4)

All DeepTwin endpoints require: `X-Clinic-ID`, `X-Patient-Access-Token`, `clinician_id` query param, and a valid `clinician`+ role.

### 4.1 GET `/api/v1/deeptwin/patients/{patient_id}/snapshot` — Full DeepTwin Snapshot

Get a complete DeepTwin snapshot with all synthesis data for a patient.

**Auth:** Clinician role, clinic isolation

**Response Model:** `DeepTwinSnapshotResponse`
```json
{
  "snapshot": {
    "snapshot_id": "dts_a1b2c3d4e5f6",
    "patient_id": "p-001",
    "generated_at": "2024-01-15T10:30:00",
    "modality_coverage": {"qeeg": true, "medication": true, "assessment": false},
    "recency_status": {"qeeg": "2024-01-10", "medication": "2024-01-14"},
    "data_quality_flags": [...],
    "timeline_events": [...],
    "correlation_findings": [...],
    "confounders": [...],
    "ranked_hypotheses": [...],
    "evidence_links": [...],
    "uncertainty_drivers": ["Limited multimodal data available", "Temporal association only"],
    "forecast_status": "unavailable: no calibrated model",
    "clinician_review_status": {
      "reviewed": false,
      "reviewed_by": null,
      "reviewed_at": null,
      "hypotheses_reviewed": 0,
      "hypotheses_total": 3,
      "notes": [],
      "pending_actions": []
    },
    "provenance": {},
    "safety_disclaimer": "Decision support only. Requires clinician review. DeepTwin does not diagnose, prescribe, or prove causality."
  },
  "safety_disclaimer": "Decision support only. Requires clinician review. DeepTwin does not diagnose, prescribe, or prove causality."
}
```

**cURL:**
```bash
curl -X GET "http://localhost:8000/api/v1/deeptwin/patients/p-001/snapshot?clinician_id=clinician-001" \
  -H "X-Clinic-ID: clinic-001" \
  -H "X-Patient-Access-Token: token-001"
```

---

### 4.2 GET `/api/v1/deeptwin/patients/{patient_id}/timeline` — DeepTwin Timeline

Get DeepTwin timeline view with modality coverage and recency status.

**Auth:** Clinician role, clinic isolation

**Response Model:** `DeepTwinTimelineResponse`
```json
{
  "patient_id": "p-001",
  "modality_coverage": {"qeeg": true, "medication": true, "assessment": false},
  "recency_status": {"qeeg": "2024-01-10", "medication": "2024-01-14"},
  "events": [...],
  "event_count": 15,
  "safety_disclaimer": "Decision support only. Requires clinician review. DeepTwin does not diagnose, prescribe, or prove causality."
}
```

**cURL:**
```bash
curl -X GET "http://localhost:8000/api/v1/deeptwin/patients/p-001/timeline?clinician_id=clinician-001" \
  -H "X-Clinic-ID: clinic-001" \
  -H "X-Patient-Access-Token: token-001"
```

---

### 4.3 GET `/api/v1/deeptwin/patients/{patient_id}/hypotheses` — Ranked Hypotheses

Get ranked clinical hypotheses for a patient.

**Auth:** Clinician role, clinic isolation

**Response Model:** `DeepTwinHypothesesResponse`
```json
{
  "patient_id": "p-001",
  "ranked_hypotheses": [...],
  "hypothesis_count": 3,
  "safety_disclaimer": "Decision support only. Requires clinician review. DeepTwin does not diagnose, prescribe, or prove causality."
}
```

**cURL:**
```bash
curl -X GET "http://localhost:8000/api/v1/deeptwin/patients/p-001/hypotheses?clinician_id=clinician-001" \
  -H "X-Clinic-ID: clinic-001" \
  -H "X-Patient-Access-Token: token-001"
```

---

### 4.4 POST `/api/v1/deeptwin/patients/{patient_id}/synthesis` — DeepTwin Synthesis

Generate full DeepTwin synthesis. **Requires `ai_analysis_consent`.**

**Auth:** Clinician role, clinic isolation, AI consent

**Request Body:** `DeepTwinSynthesisBody`
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `include_modalities` | `string[]` | No | All | Filter by modalities |
| `date_range` | `string[]` (2) | No | All history | `[from, to]` ISO dates |
| `max_hypotheses` | `int` | No | `5` | Max hypotheses (>= 1) |

**Response Model:** `DeepTwinSynthesisResponse`
```json
{
  "snapshot": {
    "snapshot_id": "dts_a1b2c3d4e5f6",
    "patient_id": "p-001",
    "generated_at": "2024-01-15T10:30:00",
    ...
  },
  "safety_disclaimer": "Decision support only. Requires clinician review. DeepTwin does not diagnose, prescribe, or prove causality."
}
```

**cURL:**
```bash
curl -X POST "http://localhost:8000/api/v1/deeptwin/patients/p-001/synthesis?clinician_id=clinician-001" \
  -H "Content-Type: application/json" \
  -H "X-Clinic-ID: clinic-001" \
  -H "X-Patient-Access-Token: token-001" \
  -d '{
    "include_modalities": ["qeeg", "medication"],
    "date_range": ["2024-01-01", "2024-01-31"],
    "max_hypotheses": 5
  }'
```

---

### 4.5 POST `/api/v1/deeptwin/patients/{patient_id}/review` — Clinician Review

Record a clinician review action on a DeepTwin snapshot/hypothesis.

**Auth:** Clinician role, clinic isolation

**Request Body:** `DeepTwinReviewBody`
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `clinician_id` | `string` | Yes | Reviewing clinician ID |
| `snapshot_id` | `string` | Yes | Snapshot being reviewed |
| `hypothesis_id` | `string` | Yes | Hypothesis being reviewed |
| `action` | `string` | Yes | One of: `accept`, `reject`, `note`, `request_data`, `mark_reviewed` |
| `note` | `string` | No | Reviewer's note |
| `requested_modalities` | `string[]` | No | Modalities to request more data for |

**Valid Actions:**
| Action | Description |
|--------|-------------|
| `accept` | Clinician accepts the hypothesis |
| `reject` | Clinician rejects the hypothesis |
| `note` | Add a note without accept/reject |
| `request_data` | Request additional data/modalities |
| `mark_reviewed` | Mark as reviewed with no action |

**Response Model:** `DeepTwinReviewResponse`
```json
{
  "review_id": "rev_a1b2c3d4e5f6",
  "action": "accept",
  "status": "recorded",
  "safety_disclaimer": "Decision support only. Requires clinician review. DeepTwin does not diagnose, prescribe, or prove causality."
}
```

**cURL:**
```bash
curl -X POST "http://localhost:8000/api/v1/deeptwin/patients/p-001/review?clinician_id=clinician-001" \
  -H "Content-Type: application/json" \
  -H "X-Clinic-ID: clinic-001" \
  -H "X-Patient-Access-Token: token-001" \
  -d '{
    "clinician_id": "clinician-001",
    "snapshot_id": "dts_a1b2c3d4e5f6",
    "hypothesis_id": "hyp_a1b2c3d4",
    "action": "accept",
    "note": "Consistent with clinical observation",
    "requested_modalities": []
  }'
```

---

### 4.6 POST `/api/v1/deeptwin/patients/{patient_id}/export` — Export Snapshot

Export or hand off a DeepTwin snapshot. **Requires `can_export` permission.**

**Auth:** Clinician role (with `can_export`), clinic isolation

**Request Body:** `DeepTwinExportBody`
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `clinician_id` | `string` | Yes | Requesting clinician ID |
| `snapshot_id` | `string` | Yes | Snapshot to export |
| `export_type` | `string` | Yes | One of: `json`, `pdf`, `report_handoff`, `protocol_handoff` |

**Response Model:** `DeepTwinExportResponse`
```json
{
  "export_id": "exp_a1b2c3d4e5f6",
  "export_type": "json",
  "audit_reference": "audit_a1b2c3d4",
  "safety_disclaimer": "Decision support only. Requires clinician review. DeepTwin does not diagnose, prescribe, or prove causality."
}
```

**cURL:**
```bash
curl -X POST "http://localhost:8000/api/v1/deeptwin/patients/p-001/export?clinician_id=clinician-001" \
  -H "Content-Type: application/json" \
  -H "X-Clinic-ID: clinic-001" \
  -H "X-Patient-Access-Token: token-001" \
  -d '{
    "clinician_id": "clinician-001",
    "snapshot_id": "dts_a1b2c3d4e5f6",
    "export_type": "json"
  }'
```

---

## 5. Summary Endpoints

Aggregate, bounded-payload summary queries optimized for dashboard performance. Uses SQL COUNT/aggregate instead of loading full records.

### 5.1 GET `/api/v1/summary/clinic-dashboard` — Clinic Dashboard

Clinic-level aggregate dashboard. Bounded counts, no PHI.

**Auth:** `clinician`, `clinic_admin`, or `super_admin`

**Headers:**
| Header | Required | Description |
|--------|----------|-------------|
| `X-Clinic-ID` | Yes | Clinic ID |
| `X-Patient-Access-Token` | Yes | Access token |
| `clinician_id` | Yes (query) | Clinician ID |

**Response Model:** `ClinicDashboardResponse`
```json
{
  "scope": "clinic_dashboard",
  "clinic_id": "clinic-001",
  "generated_at": "2024-01-15T10:30:00",
  "generated_by": "clinician-001",
  "active_patients": 42,
  "recent_events_30d": 156,
  "recent_audits_30d": 89,
  "ai_consent_count": 38,
  "patients_missing_consent": 4,
  "high_risk_patients": 2,
  "pending_reviews": 5,
  "modality_breakdown": [{"modality": "qeeg", "count": 45}, {"modality": "medication", "count": 78}],
  "quality_flags": {"high": 2, "medium": 5, "low": 12},
  "evidence_coverage": {"total_links": 23, "modalities_covered": 4},
  "cache_status": "miss",
  "cache_ttl_seconds": 30,
  "partial": false,
  "safety_disclaimer": "Summary counts only. Requires clinician review. Not a diagnosis or clinical assessment."
}
```

**cURL:**
```bash
curl -X GET "http://localhost:8000/api/v1/summary/clinic-dashboard?clinician_id=clinician-001" \
  -H "X-Clinic-ID: clinic-001" \
  -H "X-Patient-Access-Token: token-001"
```

---

### 5.2 GET `/api/v1/summary/patients/{patient_id}/dashboard` — Patient Dashboard

Enriched patient-level snapshot. Counts, latest per modality, risk flags, consent.

**Auth:** `clinician`, `clinic_admin`, or `super_admin`

**Response Model:** `PatientDashboardResponse`
```json
{
  "scope": "patient_dashboard",
  "patient_id": "p-001",
  "clinic_id": "clinic-001",
  "generated_at": "2024-01-15T10:30:00",
  "generated_by": "clinician-001",
  "total_events": 45,
  "recent_events_30d": 8,
  "modality_breakdown": [{"modality": "qeeg", "count": 12}, {"modality": "medication", "count": 20}],
  "latest_by_modality": [{"modality": "qeeg", "timestamp": "2024-01-10T09:00:00"}],
  "missing_modalities": ["mri", "voice"],
  "latest_event_at": "2024-01-14T16:30:00",
  "first_event_at": "2023-08-01T10:00:00",
  "data_quality_summary": {"high": 35, "medium": 8, "low": 2},
  "risk_signal_count": 1,
  "consent_status": {"ai_analysis_consent": true, "consented_at": "2023-08-01"},
  "cache_status": "miss",
  "cache_ttl_seconds": 60,
  "partial": false,
  "safety_disclaimer": "Summary counts only. Requires clinician review. Not a diagnosis or clinical assessment."
}
```

**cURL:**
```bash
curl -X GET "http://localhost:8000/api/v1/summary/patients/p-001/dashboard?clinician_id=clinician-001" \
  -H "X-Clinic-ID: clinic-001" \
  -H "X-Patient-Access-Token: token-001"
```

---

### 5.3 GET `/api/v1/summary/analyzer-status` — Analyzer Status

Aggregate analyzer/data processing status. Counts and freshness per modality.

**Auth:** `clinician`, `clinic_admin`, or `super_admin`

**Response Model:** `AnalyzerStatusResponse`
```json
{
  "scope": "analyzer_status",
  "clinic_id": "clinic-001",
  "generated_at": "2024-01-15T10:30:00",
  "generated_by": "clinician-001",
  "all_time_modality_counts": [{"modality": "qeeg", "count": 245}],
  "recent_30d_modality_counts": [{"modality": "qeeg", "count": 12}],
  "stale_modalities": ["mri", "voice"],
  "evidence_entries": 67,
  "cache_status": "miss",
  "cache_ttl_seconds": 30,
  "partial": false,
  "safety_disclaimer": "Summary counts only. Requires clinician review. Not a diagnosis or clinical assessment."
}
```

**cURL:**
```bash
curl -X GET "http://localhost:8000/api/v1/summary/analyzer-status?clinician_id=clinician-001" \
  -H "X-Clinic-ID: clinic-001" \
  -H "X-Patient-Access-Token: token-001"
```

---

### 5.4 GET `/api/v1/summary/patients/{patient_id}/analyzer` — Patient Analyzer Summary

Per-patient analyzer summary. Modality counts, missing modalities, risk status.

**Auth:** `clinician`, `clinic_admin`, or `super_admin`

**Response Model:** `PatientAnalyzerResponse`
```json
{
  "scope": "patient_analyzer",
  "patient_id": "p-001",
  "generated_at": "2024-01-15T10:30:00",
  "modality_stats": [{"modality": "qeeg", "count": 12, "latest": "2024-01-10", "quality": "high"}],
  "missing_modalities": ["mri", "voice", "wearable"],
  "evidence_linked_count": 5,
  "risk_signal_count": 1,
  "latest_risk_signal_at": "2024-01-14T08:00:00",
  "risk_status": "moderate",
  "avg_confidence": 0.72,
  "days_since_last_event": 1,
  "cache_status": "miss",
  "cache_ttl_seconds": 60,
  "partial": false,
  "safety_disclaimer": "Summary counts only. Requires clinician review. Not a diagnosis or clinical assessment."
}
```

**cURL:**
```bash
curl -X GET "http://localhost:8000/api/v1/summary/patients/p-001/analyzer?clinician_id=clinician-001" \
  -H "X-Clinic-ID: clinic-001" \
  -H "X-Patient-Access-Token: token-001"
```

---

## 6. Analyzer Evidence Endpoints

### 6.1 GET `/api/v1/analyzers/{analyzer_type}/evidence` — Evidence Links

Get evidence citations for a specific analyzer type. Returns enriched evidence with study type, year, DOI, caveats.

**Auth:** `clinician`, `clinic_admin`, or `super_admin`

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `analyzer_type` | `string` | One of: `qeeg`, `mri`, `biomarker`, `assessment`, `medication`, `voice`, `wearable` |

**Query Parameters:**
| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| `clinician_id` | `string` | — | Yes | Clinician ID |
| `limit` | `int` | `5` | 1–10 | Max evidence links to return |

**Headers:**
| Header | Required |
|--------|----------|
| `X-Clinic-ID` | Yes |

**Response:**
```json
{
  "analyzer_type": "qeeg",
  "clinic_id": "clinic-001",
  "generated_by": "clinician-001",
  "generated_at": "2024-01-15T10:30:00",
  "evidence_count": 2,
  "evidence_links": [
    {
      "id": "ev_a1b2c3d4e5f6",
      "title": "Theta power as a biomarker for antidepressant response",
      "source": "literature",
      "evidence_grade": "B",
      "study_type": "RCT",
      "year": 2022,
      "doi": "10.1234/example.2022.001",
      "pmid": "35000123",
      "url": "https://pubmed.ncbi.nlm.nih.gov/35000123",
      "condition": "Major Depressive Disorder",
      "modality": "qeeg",
      "relevance_score": 0.85,
      "research_only": false,
      "conflicting": false,
      "caveat": "Single-center study, n=120"
    }
  ],
  "safety_disclaimer": "Evidence links support clinician review and do not establish diagnosis or treatment recommendations.",
  "partial": false
}
```

**cURL:**
```bash
curl -X GET "http://localhost:8000/api/v1/analyzers/qeeg/evidence?clinician_id=clinician-001&limit=5" \
  -H "X-Clinic-ID: clinic-001"
```

---

## 7. Admin & Operations

### Pre-configured Guard Reference

| Guard | Allowed Roles | AI Consent | Use Case |
|-------|--------------|------------|----------|
| `CLINICIAN_GUARD` | `clinician`, `clinic_admin`, `super_admin` | No | Standard read endpoints |
| `AI_SYNTHESIS_GUARD` | `clinician`, `clinic_admin`, `super_admin` | Yes | Synthesis endpoints |
| `REVIEW_GUARD` | `reviewer`, `clinician`, `clinic_admin`, `super_admin` | No | Review endpoints |
| `EXPORT_GUARD` | `clinician`, `clinic_admin`, `super_admin`, `reviewer` | No | Export endpoints |
| `ADMIN_GUARD` | `clinic_admin`, `super_admin` | No | Clinic management |
| `SUPER_ADMIN_GUARD` | `super_admin` | No | System-level operations |

### Role Permission Matrix

| Permission | super_admin | clinic_admin | clinician | reviewer | technician |
|------------|:-----------:|:------------:|:---------:|:--------:|:----------:|
| `can_read_patient` | Yes | Yes | Yes | Yes | No |
| `can_write_patient` | Yes | Yes | Yes | No | Yes |
| `can_run_ai_synthesis` | Yes | Yes | Yes | No | No |
| `can_export` | Yes | Yes | Yes | Yes | No |
| `can_review_hypotheses` | Yes | Yes | Yes | Yes | No |
| `can_manage_clinic` | Yes | Yes | No | No | No |
| `can_manage_users` | Yes | Yes | No | No | No |
| `cross_clinic_access` | Yes | No | No | No | No |

---

## 8. Error Response Formats

### Standard HTTP Status Codes

| Code | When | Response Body |
|------|------|---------------|
| `200 OK` | Successful GET/POST | Response model as documented |
| `400 Bad Request` | Invalid parameters, validation failure | `{ "detail": "error message", "safety_disclaimer": "..." }` |
| `403 Forbidden` | Auth denied, no clinic access, no AI consent, role insufficient | `{ "detail": "specific error", "safety_disclaimer": "..." }` |
| `422 Unprocessable Entity` | Pydantic validation error | FastAPI default validation error format |
| `500 Internal Server Error` | Unexpected server error | `{ "detail": "Internal server error" }` |

### Error Response Examples

**400 — Invalid Analyzer Type:**
```json
{
  "detail": "Invalid analyzer type: ct. Valid: assessment, biomarker, medication, mri, qeeg, voice, wearable",
  "safety_disclaimer": "Decision support only. Requires clinician review. DeepTwin does not diagnose, prescribe, or prove causality."
}
```

**403 — Role Not Authorized:**
```json
{
  "detail": "Role 'technician' is not authorized to run AI synthesis"
}
```

**403 — Patient Has Not Consented:**
```json
{
  "detail": "Patient has not consented to AI analysis"
}
```

**403 — Clinic Isolation Violation:**
```json
{
  "detail": "Clinician does not have access to this patient in this clinic"
}
```

**403 — Export Permission Denied:**
```json
{
  "detail": "Export permission denied. User lacks can_export privilege."
}
```

**403 — Materialized View Requires Admin:**
```json
{
  "detail": "Materialized view status requires clinic_admin or super_admin role."
}
```

### ValueError Handler

All `ValueError` exceptions raised in endpoint logic are caught and returned as `400`:
```json
{
  "detail": "Invalid action 'approve'. Must be one of: ['accept', 'reject', 'note', 'request_data', 'mark_reviewed']",
  "safety_disclaimer": "Decision support only. Requires clinician review. DeepTwin does not diagnose, prescribe, or prove causality."
}
```

---

## 9. Rate Limiting

**Note:** The current API version (4.0.0) does not implement explicit rate limiting. Rate limiting is expected to be applied at the infrastructure level (reverse proxy / load balancer).

### Recommended Rate Limits (for infrastructure configuration)

| Endpoint Category | Recommended Limit | Burst |
|-------------------|-------------------|-------|
| Health check (`/health`) | 60 req/min | 10 |
| System endpoints | 30 req/min | 5 |
| Multimodal GET | 60 req/min | 10 |
| Multimodal POST (synthesis) | 10 req/min | 3 |
| DeepTwin GET | 60 req/min | 10 |
| DeepTwin POST | 10 req/min | 3 |
| Summary endpoints | 60 req/min | 10 |
| Analyzer evidence | 60 req/min | 10 |

### GZip Compression

Responses >= 1024 bytes are automatically GZip-compressed when the client sends `Accept-Encoding: gzip`.

| Config | Default | Description |
|--------|---------|-------------|
| `DEEPSYNAPS_ENABLE_GZIP` | `true` | Enable/disable GZip |
| `DEEPSYNAPS_GZIP_MINIMUM_SIZE` | `1024` | Minimum response size (bytes) |

Small responses (< 1KB), streaming responses, and already-compressed binary payloads are never compressed.

---

## 10. Data Models & Contracts

### Core Python Contracts (apps/api/src/deepsynaps/contracts.py)

| Dataclass | Purpose |
|-----------|---------|
| `MultimodalEvent` | Canonical event across all modalities |
| `EvidenceLink` | Evidence citation with enrichment fields (GRADE A–D) |
| `ConfounderCandidate` | Potential confounder for clinical observations |
| `IntelligenceOutput` | Every insight from any engine (safety-enforced) |
| `SynthesisRequest` | Request body for POST /synthesis |
| `SynthesisResponse` | Full synthesis response envelope |

### DeepTwin Contracts (apps/api/src/deepsynaps/deeptwin_contracts.py)

| Dataclass | Purpose |
|-----------|---------|
| `DeepTwinSnapshot` | Unified patient-level synthesis output |
| `ClinicianReview` | Review action on a snapshot/hypothesis |
| `DeepTwinAuditEvent` | DeepTwin-specific audit events |
| `DeepTwinExport` | Export/handoff result |

### Safety Governance (apps/api/src/deepsynaps/safety_governance.py)

| Rule | Enforcement |
|------|-------------|
| Confidence cap | `< 0.95` (values >= 0.95 are capped to 0.94) |
| Causal overclaiming | 13 disallowed patterns blocked |
| Required labels | `clinician_review_required = true` on all outputs |
| Uncertainty drivers | Must be populated (defaults provided) |
| Research-only flag | Set when evidence grade is C or D |
| Correlation label | `"Temporal association only. Not causal proof."` |
| Hypothesis label | `"Ranked clinical hypothesis. Requires clinician review."` |

### Frontend Contract Validation (apps/web/src/contracts.js)

All API responses are validated client-side using matching JavaScript validators:
- `validateEvent()` / `validateEventBatch()`
- `validateEvidenceLink()`
- `validateConfounderCandidate()`
- `validateInsight()` / `validateInsightBatch()`
- `validateSynthesisRequest()` / `validateSynthesisResponse()`
- `validateDeepTwinSnapshot()` / `validateClinicianReview()`
- `validateDeepTwinAuditEvent()` / `validateDeepTwinExport()`
- `sweepSafetyWording()` — enforces safety labels on all payloads
- `containsCausalOverclaiming()` — detects disallowed language

### Supported Analyzer Types

`qeeg`, `mri`, `biomarker`, `assessment`, `medication`, `voice`, `wearable`

### Supported Export Types

`json`, `pdf`, `report_handoff`, `protocol_handoff`

---

## Endpoint Summary (Quick Reference)

| # | Method | Path | Auth | AI Consent | Category |
|---|--------|------|------|------------|----------|
| 1 | GET | `/health` | None | N/A | System |
| 2 | GET | `/api/v1/system/runtime-config` | None | N/A | System |
| 3 | GET | `/api/v1/system/materialized-views/status` | Admin | N/A | System |
| 4 | POST | `/api/v1/system/materialized-views/refresh` | Admin | N/A | System |
| 5 | GET | `/api/v1/multimodal/patients/{pid}/timeline` | Clinician+ | No | Multimodal |
| 6 | GET | `/api/v1/multimodal/patients/{pid}/correlations` | Clinician+ | No | Multimodal |
| 7 | GET | `/api/v1/multimodal/patients/{pid}/confounders` | Clinician+ | No | Multimodal |
| 8 | GET | `/api/v1/multimodal/patients/{pid}/quality-flags` | Clinician+ | No | Multimodal |
| 9 | POST | `/api/v1/multimodal/patients/{pid}/synthesis` | Clinician+ | **Yes** | Multimodal |
| 10 | GET | `/api/v1/deeptwin/patients/{pid}/snapshot` | Clinician+ | No | DeepTwin |
| 11 | GET | `/api/v1/deeptwin/patients/{pid}/timeline` | Clinician+ | No | DeepTwin |
| 12 | GET | `/api/v1/deeptwin/patients/{pid}/hypotheses` | Clinician+ | No | DeepTwin |
| 13 | POST | `/api/v1/deeptwin/patients/{pid}/synthesis` | Clinician+ | **Yes** | DeepTwin |
| 14 | POST | `/api/v1/deeptwin/patients/{pid}/review` | Clinician+ | No | DeepTwin |
| 15 | POST | `/api/v1/deeptwin/patients/{pid}/export` | Clinician+ (export) | No | DeepTwin |
| 16 | GET | `/api/v1/summary/clinic-dashboard` | Clinician+ | N/A | Summary |
| 17 | GET | `/api/v1/summary/patients/{pid}/dashboard` | Clinician+ | N/A | Summary |
| 18 | GET | `/api/v1/summary/analyzer-status` | Clinician+ | N/A | Summary |
| 19 | GET | `/api/v1/summary/patients/{pid}/analyzer` | Clinician+ | N/A | Summary |
| 20 | GET | `/api/v1/analyzers/{type}/evidence` | Clinician+ | N/A | Analyzers |

**Total: 20 endpoints** across 5 categories.
