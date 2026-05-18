# Pilot Feedback Form Schema — DeepSynaps Protocol Studio

**Date:** 2026-05-17  
**Audience:** Product team, engineering, clinical safety  
**Purpose:** Standardized feedback capture from beta pilot participants

---

## 1. Feedback Form Fields

### Required Fields

| Field | Type | Description | Validation |
|-------|------|-------------|------------|
| `feedback_id` | UUID | Auto-generated unique ID | Auto |
| `submitted_at` | ISO 8601 | Timestamp of submission | Auto (UTC) |
| `clinic_id` | String | Clinic identifier | From auth context |
| `user_id` | String | Submitting user ID | From auth context |
| `user_role` | Enum | Role of submitter | `clinician`, `reviewer`, `clinic_admin`, `technician` |
| `module` | Enum | Affected module | See module list below |
| `issue_type` | Enum | Type of feedback | See category list below |
| `severity` | Enum | Impact severity | `critical`, `high`, `medium`, `low` |
| `description` | Text (max 2000) | Detailed description | Required, min 20 chars |
| `actual_behavior` | Text (max 1000) | What actually happened | Required |
| `phii_included` | Boolean | Whether description includes PHI | Required. Must be `false` for submission. |

### Optional Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `patient_context` | Boolean | Was a specific patient involved? | `true` |
| `patient_id` | String | Patient ID (if patient_context=true) | `patient-001` |
| `expected_behavior` | Text (max 1000) | What should have happened | "Dashboard should show 8 patients" |
| `screenshot_url` | URL | Link to screenshot | `https://...` |
| `log_reference` | String | Ticket or log reference | `audit_log: 2026-05-17:clinic-001` |
| `consent_related` | Boolean | Is this related to consent? | `false` |
| `export_related` | Boolean | Is this related to export? | `false` |
| `steps_to_reproduce` | Text (max 2000) | Step-by-step reproduction | "1. Open Dashboard 2. Click..." |
| `environment` | String | Browser/OS | "Chrome 120 / macOS" |
| `suggested_priority` | Enum | Reporter's suggested priority | `p0`, `p1`, `p2`, `p3` |
| `workaround` | Text (max 500) | Any known workaround | "Refresh page after 30 seconds" |
| `contact_email` | Email | Optional follow-up contact | `clinician@clinic.com` |

---

## 2. Module Enum

```
dashboard, patients, assessments, qeeg_analyzer, mri_analyzer,
biomarkers, medication_analyzer, protocol_studio, evidence_research,
deeptwin, reports, patient_portal, admin, auth, general
```

---

## 3. Issue Type Enum

```
clinical_workflow, ui_ux, data_accuracy, evidence_provenance,
report_quality, patient_portal, performance, access_role,
safety_concern, bug, feature_request, documentation, other
```

---

## 4. Severity Definitions

| Level | Response Time | Description |
|-------|--------------|-------------|
| `critical` | 1 hour | Patient safety risk, data integrity issue, system unavailability |
| `high` | 4 hours | Major workflow blocker, incorrect data, access issue |
| `medium` | 24 hours | Minor bug, UI issue, confusion, partial functionality |
| `low` | 48-72 hours | Cosmetic, enhancement, documentation |

---

## 5. JSON Schema

```json
{
  "feedback_id": "baf12345-6789-4abc-8def-0123456789ab",
  "submitted_at": "2026-05-17T10:30:00+00:00",
  "clinic_id": "clinic-demo-001",
  "user_id": "clinician-001",
  "user_role": "clinician",
  "module": "deeptwin",
  "issue_type": "safety_concern",
  "severity": "high",
  "description": "DeepTwin output says 'Patient has ADHD' without the usual decision-support disclaimer. The evidence links also show Grade D but no research-only badge.",
  "actual_behavior": "Missing safety disclaimer and research-only badge on low-grade evidence.",
  "expected_behavior": "All DeepTwin outputs should include 'Decision support only. Requires clinician review.' and Grade D evidence should show research-only badge.",
  "patient_context": true,
  "patient_id": "patient-001",
  "phii_included": false,
  "consent_related": false,
  "export_related": false,
  "screenshot_url": null,
  "steps_to_reproduce": "1. Open DeepTwin for patient-001 2. Scroll to Evidence tab 3. Observe missing disclaimer",
  "environment": "Chrome 120 / Windows 11",
  "suggested_priority": "p1",
  "workaround": null,
  "contact_email": null
}
```

---

## 6. Privacy Rules

### PHI Handling

- `phii_included` must be `false` for submission to complete
- If `phii_included=true`, form rejects with message:
  > "Your description appears to contain patient-identifiable information. Please remove all names, IDs, dates of birth, and clinical details. Use approved secure support channels for PHI-related issues."
- `patient_id` field is optional and should be a pseudonymized ID only
- Free text fields are scanned for patterns: SSN, DOB, phone numbers
- All feedback is stored with clinic isolation

### Data Retention

| Data | Retention | Reason |
|------|-----------|--------|
| Feedback records | Duration of beta + 1 year | Product improvement |
| Screenshot attachments | Duration of beta + 6 months | Debugging |
| IP logs | 30 days | Security |
| Reporter identity | Duration of beta + 1 year | Follow-up |

---

## 7. Submission API

### Endpoint

```
POST /api/v1/feedback
Content-Type: application/json
Authorization: Bearer <token>
```

### Request Body

```json
{
  "module": "deeptwin",
  "issue_type": "safety_concern",
  "severity": "high",
  "description": "...",
  "actual_behavior": "...",
  "phii_included": false
}
```

### Response

```json
{
  "feedback_id": "baf12345-6789-4abc-8def-0123456789ab",
  "status": "received",
  "ticket_id": "BETA-2026-042",
  "response_sla": "4h",
  "submitted_at": "2026-05-17T10:30:00+00:00"
}
```

---

## 8. Analytics

### Feedback Dashboard Queries

| Report | SQL / Logic |
|--------|-------------|
| Feedback by module | `GROUP BY module ORDER BY count DESC` |
| Feedback by severity | `GROUP BY severity` |
| Feedback by clinic | `GROUP BY clinic_id` |
| Avg time to resolution | `AVG(resolved_at - submitted_at)` |
| Top 5 issue types | `GROUP BY issue_type ORDER BY count DESC LIMIT 5` |
| Safety concern trend | `COUNT WHERE issue_type = 'safety_concern' BY week` |
