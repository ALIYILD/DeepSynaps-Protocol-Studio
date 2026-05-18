# EXPORT GOVERNANCE AUDIT
## DeepSynaps Protocol Studio v4.0.0
### Audit Date: 2025-06-10
### Auditor: Security Engineering Team

---

## 1. EXECUTIVE SUMMARY

This audit evaluates export governance across the DeepTwin export subsystem,
including export types, consent requirements, role-based access, audit
trail requirements, and PHI protection controls.

**Overall Grade: B (Good foundation, needs hardening for production)**

The export system supports 4 export types with appropriate safety headers
and audit logging. Key gaps include: (1) no explicit export approval workflow,
(2) no export rate limiting, (3) no export content encryption, and (4) role
enforcement is implicit rather than explicit.

---

## 2. EXPORT TYPE INVENTORY

### 2.1 Supported Export Types

| Export Type | Description | Risk Level | Consent Required | Role Required |
|-------------|-------------|------------|------------------|---------------|
| `json` | Full snapshot as JSON | **HIGH** | Yes (implicit) | `can_export` |
| `pdf` | PDF-formatted snapshot | **HIGH** | Yes (implicit) | `can_export` |
| `report_handoff` | Handoff to Report module | **MEDIUM** | Yes (implicit) | `can_export` + approval |
| `protocol_handoff` | Handoff to Protocol Studio | **MEDIUM** | Yes (implicit) | `can_export` + approval |

### 2.2 Export Type Risk Analysis

```
Risk Level:   LOW        MEDIUM        HIGH
             |            |             |
             +--- pdf ----+-- json ------+
             |            |             |
             + report_handoff           |
             |            |             |
             + protocol_handoff         |
                          |             |
                          +-------------+
```

**`json` and `pdf`** exports contain the **full PHI snapshot** including all
patient data, hypotheses, correlations, and confounders. These are the
highest-risk export types.

**`report_handoff` and `protocol_handoff`** are structured handoffs to other
modules within the system. They contain summaries rather than full raw data,
but still include patient identifiers and clinical insights.

---

## 3. CONSENT REQUIREMENTS MATRIX

### 3.1 AI Analysis Consent

Export of DeepTwin snapshots **requires** that the patient has consented to
AI analysis (`ai_analysis_consent = 1` in the `patient_access` table). This
is because the exported content contains AI-generated insights (hypotheses,
correlations, confounders).

| Export Type | AI Content Included | Requires ai_analysis_consent |
|-------------|-------------------|------------------------------|
| `json` | Yes (full snapshot) | **Yes** |
| `pdf` | Yes (full snapshot) | **Yes** |
| `report_handoff` | Yes (summaries) | **Yes** |
| `protocol_handoff` | Yes (summaries) | **Yes** |

**Current Status:** AI consent is checked indirectly via the endpoint auth
dependency (`require_clinician_auth`), but export-specific consent validation
is **not explicitly enforced**.

### 3.2 Export Consent

A dedicated `export_consent` flag is **recommended** but not yet implemented.
This would allow patients to consent separately to:
- Data export in general
- Export to external systems (handoff)
- Export in specific formats (JSON, PDF)

**Recommendation:** Add `export_consent` column to `patient_access` table.

---

## 4. ROLE-BASED EXPORT PERMISSIONS

### 4.1 Permission Matrix

The hardened `access_control.py` defines `can_export` permissions per role:

| Role | can_export | Export Scope | Notes |
|------|------------|--------------|-------|
| `super_admin` | Yes | All clinics, all formats | Cross-clinic access |
| `clinic_admin` | Yes | Own clinic, all formats | Can approve sensitive exports |
| `clinician` | Yes | Own clinic, all formats | Standard export access |
| `reviewer` | Yes | Own clinic, read-only export | For external review purposes |
| `technician` | **No** | N/A | Cannot export patient data |

### 4.2 Export Approval Workflow

For **HIGH** risk exports (`json`, `pdf`), the following approval workflow
is recommended:

```
Clinician requests export
        |
        v
+-------------------------+
| Export type = json/pdf? |--No--> Execute export + log
+-------------------------+
        | Yes
        v
+-------------------------+
| Clinic admin approval   |
| required?               |--No (super_admin)--> Execute export + log
+-------------------------+
        | Yes
        v
+-------------------------+
| Await approval from     |
| clinic_admin or         |
| super_admin             |
+-------------------------+
        |
        v
+-------------------------+
| Execute export + log    |
| with approval reference |
+-------------------------+
```

**Current Status:** No approval workflow is implemented. Any authenticated
clinician can export.

---

## 5. AUDIT TRAIL REQUIREMENTS

### 5.1 Required Audit Fields

Every export operation must log the following:

| Field | Source | Status |
|-------|--------|--------|
| `timestamp` | Audit log auto-generated | OK |
| `endpoint` | Request URL | OK |
| `clinician_id` | Authenticated user | OK |
| `clinic_id` | Request header | OK |
| `patient_id` | URL parameter | OK |
| `export_type` | Request body | OK |
| `snapshot_id` | Request body | OK |
| `export_id` | Generated at export time | OK |
| `audit_reference` | Cross-reference to export record | OK |
| `role` | User role at time of export | **Missing** |
| `approval_reference` | Reference to approval (if required) | **Missing** |
| `consent_status` | Patient consent at time of export | **Missing** |

### 5.2 Current Audit Implementation

The current implementation logs via two audit systems:

1. **Primary audit** (`audit.log_intelligence_request`):
   - Logs endpoint, patient, clinician, clinic, params, status, count
   - Used for all patient-linked operations

2. **DeepTwin audit** (`dt_audit.log_deeptwin_event`):
   - Logs DeepTwin-specific events with event_type
   - Maps export types to event types:
     - `json` -> `export_generated`
     - `pdf` -> `export_generated`
     - `report_handoff` -> `report_handoff`
     - `protocol_handoff` -> `protocol_handoff`

### 5.3 Audit Event Type Mapping

```python
EXPORT_EVENT_TYPE_MAP = {
    "json":            "export_generated",
    "pdf":             "export_generated",
    "report_handoff":  "report_handoff",
    "protocol_handoff": "protocol_handoff",
}
```

This mapping is implemented in `main.py` at lines 847-852.

---

## 6. PHI PROTECTION CONTROLS

### 6.1 Current PHI Protections

| Control | Status | Description |
|---------|--------|-------------|
| Safety disclaimer | OK | Every export includes `SAFETY_HEADER` |
| Patient ID in export | Present | Required for clinical correlation |
| De-identification option | **Missing** | No option to export de-identified data |
| Encryption at rest | **Missing** | Export content is not encrypted |
| Encryption in transit | N/A | HTTPS is assumed at infrastructure level |
| Export retention limit | **Missing** | No TTL on exported data |
| Export watermarking | **Missing** | No user-specific watermarking |

### 6.2 Safety Header

All exports include the following safety header:

```
"Decision support only. Requires clinician review.
This export does not constitute a diagnosis or treatment recommendation."
```

This is defined in `deeptwin_export.py` as `SAFETY_HEADER` and is
included in every export content payload.

---

## 7. EXPORT GOVERNANCE RULES

### 7.1 Rule: Export Requires Authentication

**Rule ID:** EXP-AUTH-001
**Description:** All export operations require valid authentication.
**Enforcement:** Via `require_clinician_auth` dependency.
**Status:** OK

### 7.2 Rule: Export Requires Patient Access

**Rule ID:** EXP-ACCESS-001
**Description:** Clinician must have patient access in the requesting clinic.
**Enforcement:** Via `kl.check_patient_access()` in `require_clinician_auth`.
**Status:** OK

### 7.3 Rule: Export Requires Clinic Isolation

**Rule ID:** EXP-ISO-001
**Description:** Clinician can only export patients from their own clinic.
**Enforcement:** Via `kl.check_patient_access()` clinic_id matching.
**Exception:** `super_admin` can bypass via `cross_clinic_access`.
**Status:** OK

### 7.4 Rule: Export Content Must Include Safety Disclaimer

**Rule ID:** EXP-SAFE-001
**Description:** Every export must include the safety disclaimer header.
**Enforcement:** Via `DeepTwinExportEngine.SAFETY_HEADER` in all content builders.
**Status:** OK

### 7.5 Rule: Export Must Be Auditable

**Rule ID:** EXP-AUDIT-001
**Description:** Every export must create an audit trail entry.
**Enforcement:** Both `audit.log_intelligence_request` and
`dt_audit.log_deeptwin_event` are called.
**Status:** OK

### 7.6 Rule: AI Consent Required for AI-Content Export (RECOMMENDED)

**Rule ID:** EXP-CONSENT-001
**Description:** Export of AI-generated content requires patient consent.
**Enforcement:** Currently implicit via auth; should be explicit.
**Status:** **NEEDS IMPLEMENTATION**

### 7.7 Rule: Sensitive Exports Require Approval (RECOMMENDED)

**Rule ID:** EXP-APPROVE-001
**Description:** `json` and `pdf` exports require clinic_admin approval.
**Enforcement:** **NOT IMPLEMENTED**
**Status:** **NEEDS IMPLEMENTATION**

### 7.8 Rule: Export Rate Limiting (RECOMMENDED)

**Rule ID:** EXP-RATE-001
**Description:** Maximum N exports per patient per hour.
**Enforcement:** **NOT IMPLEMENTED**
**Status:** **NEEDS IMPLEMENTATION**

---

## 8. DATA FLOW ANALYSIS

### 8.1 Export Data Flow

```
+------------------+     +------------------+     +------------------+
|   Clinician      |     |   FastAPI        |     |   DeepTwin       |
|   Request        +---->|   Endpoint       +---->|   ExportEngine   |
|                  |     |                  |     |                  |
| POST /export     |     | Auth check       |     | Validate type    |
| {snapshot_id,    |     | Clinic isolation |     | Build content    |
|  export_type}    |     | Patient access   |     | Add safety header|
+------------------+     +--------+---------+     +--------+---------+
                                  |                          |
                                  v                          v
                         +------------------+     +------------------+
                         |   AuditLogger    |     |   DeepTwinExport  |
                         |   log_intelligence|    |   (with content)  |
                         |   _request       |     +--------+---------+
                         +------------------+              |
                                                            v
                                                   +------------------+
                                                   |   Response       |
                                                   |   {export_id,    |
                                                   |    audit_ref,    |
                                                   |    safety}       |
                                                   +------------------+
```

### 8.2 Content Builder Audit

The `DeepTwinExportEngine` in `deeptwin_export.py` implements four content
builders:

| Builder | Method | PHI Exposure | Safety Labels |
|---------|--------|--------------|---------------|
| JSON | `_build_json_content` | Full snapshot | Safety header only |
| PDF | `_build_pdf_content` | Full snapshot | Per-section notes |
| Report Handoff | `_build_report_handoff_content` | Summaries + counts | Safety header |
| Protocol Handoff | `_build_protocol_handoff_content` | Hypotheses summary | Safety header |

---

## 9. GAP ANALYSIS

### 9.1 Critical Gaps

| # | Gap | Risk | Status |
|---|-----|------|--------|
| 1 | No explicit export consent check | HIGH | Open |
| 2 | No approval workflow for json/pdf exports | MEDIUM | Open |
| 3 | No export rate limiting | MEDIUM | Open |
| 4 | Role enforcement is implicit (via hardcoded "clinician") | MEDIUM | Open |
| 5 | No de-identification export option | MEDIUM | Open |

### 9.2 Acceptable Risks

| # | Risk | Rationale |
|---|------|-----------|
| 1 | Safety disclaimer is text-only | Clinical context requires human review regardless |
| 2 | Export content is not encrypted | Transport encryption (HTTPS) assumed; at-rest encryption deferred to Phase 5 |
| 3 | No export TTL | Audit log provides complete traceability |

---

## 10. RECOMMENDATIONS

### 10.1 Short-Term (Phase 4b)

1. **Add explicit export consent check** before executing export:
   ```python
   consent = ac.check_ai_consent(patient_id, clinic_id, clinician_id)
   if not consent["consented"]:
       raise HTTPException(403, detail="Patient consent required for export")
   ```

2. **Use `EXPORT_GUARD` for the export endpoint** to enforce `can_export`
   permission:
   ```python
   guard = AccessControlDecorators.full_guard(
       allowed_roles=["clinician", "clinic_admin", "super_admin", "reviewer"]
   )
   ```

3. **Add `export_consent` column** to `patient_access` table.

### 10.2 Medium-Term (Phase 5)

4. **Implement export approval workflow** for json/pdf exports.
5. **Add export rate limiting** (e.g., max 5 exports per patient per hour).
6. **Add de-identification option** for research exports.
7. **Implement export watermarking** with user ID and timestamp.

### 10.3 Long-Term (Phase 6)

8. **Encrypt export content at rest** using per-patient encryption keys.
9. **Add export TTL** with automatic cleanup after N days.
10. **Integrate with external DLP** (Data Loss Prevention) systems.

---

## 11. COMPLIANCE MAPPING

### 11.1 HIPAA

| HIPAA Requirement | Export Control | Status |
|-------------------|----------------|--------|
| Minimum Necessary (164.502(b)) | Role-based access limits | Partial |
| Access Control (164.312(a)) | Auth + clinic isolation | OK |
| Audit Controls (164.312(b)) | Full audit trail | OK |
| Integrity (164.312(c)) | Safety disclaimers | OK |

### 11.2 GDPR (if applicable)

| GDPR Requirement | Export Control | Status |
|------------------|----------------|--------|
| Lawful basis | Consent via `ai_analysis_consent` | Partial |
| Right to portability | Export functionality provides this | OK |
| Right to restriction | No restriction mechanism | Gap |

---

## 12. ACTION ITEMS

| # | Action | Priority | Target Phase |
|---|--------|----------|--------------|
| 1 | Add explicit AI consent check to export endpoint | HIGH | 4b |
| 2 | Wire `EXPORT_GUARD` into export endpoint | HIGH | 4b |
| 3 | Add `export_consent` column to `patient_access` | MEDIUM | 4b |
| 4 | Implement approval workflow for json/pdf | MEDIUM | 5 |
| 5 | Add export rate limiting | MEDIUM | 5 |
| 6 | Add de-identification export option | MEDIUM | 5 |
| 7 | Add role context to audit logs | LOW | 4b |
| 8 | Encrypt export content at rest | LOW | 6 |

---

*End of Export Governance Audit*
