# ROLE GATE AUDIT
## DeepSynaps Protocol Studio v4.0.0
### Audit Date: 2025-06-10
### Auditor: Security Engineering Team

---

## 1. EXECUTIVE SUMMARY

This audit evaluates every API endpoint in `main.py` for the presence of five
critical security gates: **Role Check**, **Clinic Isolation**, **Patient Access
Check**, **AI Consent Check**, and **Audit Logging**. It also documents the
integration points with the hardened `access_control.py` module.

**Overall Grade: B+ (Good, with gaps to address)**

- All patient-linked endpoints have basic auth and audit logging.
- Role hierarchy (super_admin, clinic_admin, reviewer, technician) is now
  implemented in `access_control.py` but **not yet wired into endpoints**.
- AI consent enforcement is present on synthesis endpoints.
- Export governance exists as policy code but **endpoint-level enforcement is
  implicit only**.

---

## 2. ENDPOINT INVENTORY & GATE MATRIX

### 2.1 Public Endpoint

| Endpoint | Method | Role Check | Clinic Iso. | Patient Access | AI Consent | Audit Log | Status |
|----------|--------|------------|-------------|----------------|------------|-----------|--------|
| `/health` | GET | N/A | N/A | N/A | N/A | N/A | OK |

> `/health` is intentionally public. Acceptable.

---

### 2.2 Phase 3 — Multimodal Intelligence Endpoints

| # | Endpoint | Method | Role Check | Clinic Iso. | Patient Access | AI Consent | Audit Log | Status |
|---|----------|--------|------------|-------------|----------------|------------|-----------|--------|
| 1 | `/api/v1/multimodal/patients/{pid}/timeline` | GET | Hardcoded `clinician` | Via `require_clinician_auth` | Via `kl.check_patient_access` | Not required | `audit.log_intelligence_request` | OK |
| 2 | `/api/v1/multimodal/patients/{pid}/correlations` | GET | Hardcoded `clinician` | Via `require_clinician_auth` | Via `kl.check_patient_access` | Not required | `audit.log_intelligence_request` | OK |
| 3 | `/api/v1/multimodal/patients/{pid}/confounders` | GET | Hardcoded `clinician` | Via `require_clinician_auth` | Via `kl.check_patient_access` | Not required | `audit.log_intelligence_request` | OK |
| 4 | `/api/v1/multimodal/patients/{pid}/quality-flags` | GET | Hardcoded `clinician` | Via `require_clinician_auth` | Via `kl.check_patient_access` | Not required | `audit.log_intelligence_request` | OK |
| 5 | `/api/v1/multimodal/patients/{pid}/synthesis` | POST | Hardcoded `clinician` | Inline `ac.authenticate_request` | Via `kl.check_patient_access` | `ai_synthesis=True` enforced | `audit.log_synthesis_request` | OK |

---

### 2.3 Phase 4 — DeepTwin Endpoints

| # | Endpoint | Method | Role Check | Clinic Iso. | Patient Access | AI Consent | Audit Log | Status |
|---|----------|--------|------------|-------------|----------------|------------|-----------|--------|
| 6 | `/api/v1/deeptwin/patients/{pid}/snapshot` | GET | Hardcoded `clinician` | Via `require_clinician_auth` | Via `kl.check_patient_access` | Not required | `audit` + `dt_audit` | OK |
| 7 | `/api/v1/deeptwin/patients/{pid}/timeline` | GET | Hardcoded `clinician` | Via `require_clinician_auth` | Via `kl.check_patient_access` | Not required | `audit` + `dt_audit` | OK |
| 8 | `/api/v1/deeptwin/patients/{pid}/hypotheses` | GET | Hardcoded `clinician` | Via `require_clinician_auth` | Via `kl.check_patient_access` | Not required | `audit` + `dt_audit` | OK |
| 9 | `/api/v1/deeptwin/patients/{pid}/synthesis` | POST | Hardcoded `clinician` | Inline `ac.authenticate_request` | Via `kl.check_patient_access` | `ai_synthesis=True` enforced | `audit` + `dt_audit` | OK |
| 10 | `/api/v1/deeptwin/patients/{pid}/review` | POST | Hardcoded `clinician` | Via `require_clinician_auth` | Via `kl.check_patient_access` | Not required | `audit` + `dt_audit` | OK |
| 11 | `/api/v1/deeptwin/patients/{pid}/export` | POST | Hardcoded `clinician` | Via `require_clinician_auth` | Via `kl.check_patient_access` | Not required | `audit` + `dt_audit` | OK |

---

## 3. DETAILED FINDINGS

### 3.1 Finding: All Endpoints Hardcode Role to "clinician" (MEDIUM)

**Location:** `main.py` lines 283, 519-521, 707-709

**Description:**
The `require_clinician_auth` dependency and inline auth checks hardcode
`role = "clinician"`. The new `access_control.py` supports a full role
hierarchy (`super_admin`, `clinic_admin`, `clinician`, `reviewer`,
`technician`), but endpoints do not leverage it.

**Impact:**
- `clinic_admin` users must be granted "clinician" access to use endpoints.
- `reviewer` users cannot access read endpoints even though `access_control.py`
  now supports it.
- `technician` users appear as clinicians if they bypass the role lookup.

**Remediation:**
Replace `require_clinician_auth` with a parameterized auth dependency that
accepts `allowed_roles`. Example:

```python
def require_auth(
    allowed_roles: List[str] = ["clinician", "clinic_admin", "super_admin"],
    require_ai_consent: bool = False,
):
    def checker(...):
        guard = AccessControlDecorators.full_guard(
            allowed_roles=allowed_roles,
            require_ai_consent=require_ai_consent,
        )
        return guard(ac, patient_id, clinician_id, clinic_id, role, ...)
    return checker
```

**Priority:** MEDIUM — Address in Phase 4b

---

### 3.2 Finding: Export Endpoint Lacks Explicit Export Governance (LOW)

**Location:** `main.py` lines 823-877

**Description:**
The `POST /api/v1/deeptwin/patients/{patient_id}/export` endpoint uses the
standard `require_clinician_auth` dependency which only checks the
`clinician` role and clinic isolation. It does not verify the
`can_export` permission or apply export-type-specific governance.

The `access_control.py` `full_guard` does check `can_export` when the
endpoint matches `EXPORT_ENDPOINTS`, but the endpoint path must exactly match
the parameterized pattern.

**Impact:**
- A clinician with basic access can export without additional approval.
- No rate limiting on exports.
- No explicit "export approval" workflow for sensitive formats
  (`report_handoff`, `protocol_handoff`).

**Remediation:**
1. Add `export_governance_check` before executing the export.
2. Require `clinic_admin` or `super_admin` approval for `report_handoff`
   and `protocol_handoff` export types.
3. Use the `EXPORT_GUARD` pre-configured guard which includes `can_export`
   permission validation.

**Priority:** LOW — Acceptable for current deployment, harden before production

---

### 3.3 Finding: Review Endpoint Uses Body.clinician_id for Auth Context Mismatch (LOW)

**Location:** `main.py` lines 757-815

**Description:**
The `POST /api/v1/deeptwin/patients/{patient_id}/review` endpoint uses
`require_clinician_auth` (which validates the `clinician_id` query parameter)
but then uses `body.clinician_id` for the actual review operation and audit
logging. These may not match.

**Impact:**
- Audit trail may attribute a review to a different clinician than the one
  who was authenticated.
- Potential for review action attribution mismatch.

**Remediation:**
Validate that `body.clinician_id == clinician_id` (from auth) before
processing the review. Log a warning or reject if they differ.

**Priority:** LOW

---

### 3.4 Finding: No Endpoint Uses Hardened Decorators (MEDIUM)

**Location:** All endpoints in `main.py`

**Description:**
The hardened `access_control.py` now provides:
- `AccessControlDecorators.role_required(roles)`
- `AccessControlDecorators.consent_required()`
- `AccessControlDecorators.clinic_isolated()`
- `AccessControlDecorators.full_guard(allowed_roles, require_ai_consent)`
- Pre-configured guards: `CLINICIAN_GUARD`, `AI_SYNTHESIS_GUARD`,
  `REVIEW_GUARD`, `EXPORT_GUARD`, `ADMIN_GUARD`, `SUPER_ADMIN_GUARD`

None of these are wired into `main.py` endpoints. Endpoints still use the
legacy `require_clinician_auth` dependency.

**Impact:**
- New role hierarchy is not enforced at the endpoint level.
- New pre-configured guards are not utilized.

**Remediation:**
Refactor `main.py` to use the hardened decorators. See Section 5 for
recommended endpoint mapping.

**Priority:** MEDIUM — Address in Phase 4b

---

### 3.5 Finding: Health Endpoint Exposes Module Names (INFO)

**Location:** `main.py` lines 318-335

**Description:**
The `/health` endpoint returns a list of active module names including
`synthesis`, `deeptwin_snapshot`, `deeptwin_review`, and `deeptwin_export`.

**Impact:**
- Information disclosure about application capabilities.
- Low risk but aids reconnaissance.

**Remediation:**
Consider returning generic module names or requiring auth for detailed
health information.

**Priority:** INFO

---

## 4. ROLE HIERARCHY MATRIX

| Role | Read Patient | Write Patient | AI Synthesis | Export | Review | Manage Clinic | Cross-Clinic |
|------|-------------|---------------|--------------|--------|--------|---------------|--------------|
| `super_admin` | Yes | Yes | Yes | Yes | Yes | Yes | **Yes** |
| `clinic_admin` | Yes | Yes | Yes | Yes | Yes | Yes | No |
| `clinician` | Yes | Yes | Yes | Yes | Yes | No | No |
| `reviewer` | Yes | **No** | **No** | Yes | Yes | No | No |
| `technician` | **No** | Yes | **No** | **No** | **No** | No | No |

---

## 5. RECOMMENDED ENDPOINT-TO-GUARD MAPPING

This table shows the recommended guard configuration for each endpoint using
the hardened `access_control.py` decorators.

| Endpoint | Recommended Guard | Allowed Roles | AI Consent |
|----------|------------------|---------------|------------|
| `/health` | None (public) | N/A | N/A |
| `/multimodal/*/timeline` | `CLINICIAN_GUARD` | `clinician`, `clinic_admin`, `super_admin`, `reviewer` | No |
| `/multimodal/*/correlations` | `CLINICIAN_GUARD` | `clinician`, `clinic_admin`, `super_admin`, `reviewer` | No |
| `/multimodal/*/confounders` | `CLINICIAN_GUARD` | `clinician`, `clinic_admin`, `super_admin`, `reviewer` | No |
| `/multimodal/*/quality-flags` | `CLINICIAN_GUARD` | `clinician`, `clinic_admin`, `super_admin`, `reviewer` | No |
| `/multimodal/*/synthesis` | `AI_SYNTHESIS_GUARD` | `clinician`, `clinic_admin`, `super_admin` | **Yes** |
| `/deeptwin/*/snapshot` | `CLINICIAN_GUARD` | `clinician`, `clinic_admin`, `super_admin`, `reviewer` | No |
| `/deeptwin/*/timeline` | `CLINICIAN_GUARD` | `clinician`, `clinic_admin`, `super_admin`, `reviewer` | No |
| `/deeptwin/*/hypotheses` | `CLINICIAN_GUARD` | `clinician`, `clinic_admin`, `super_admin`, `reviewer` | No |
| `/deeptwin/*/synthesis` | `AI_SYNTHESIS_GUARD` | `clinician`, `clinic_admin`, `super_admin` | **Yes** |
| `/deeptwin/*/review` | `REVIEW_GUARD` | `reviewer`, `clinician`, `clinic_admin`, `super_admin` | No |
| `/deeptwin/*/export` | `EXPORT_GUARD` | `clinician`, `clinic_admin`, `super_admin`, `reviewer` | No |

---

## 6. AUDIT LOG COVERAGE

All patient-linked endpoints call audit logging. Coverage:

| Endpoint | Primary Audit | DeepTwin Audit | Denied Audit |
|----------|--------------|----------------|--------------|
| Timeline | `audit.log_intelligence_request` | N/A | Via `require_clinician_auth` |
| Correlations | `audit.log_intelligence_request` | N/A | Via `require_clinician_auth` |
| Confounders | `audit.log_intelligence_request` | N/A | Via `require_clinician_auth` |
| Quality Flags | `audit.log_intelligence_request` | N/A | Via `require_clinician_auth` |
| Synthesis | `audit.log_synthesis_request` | N/A | Inline |
| Snapshot | `audit.log_intelligence_request` | `dt_audit.log_deeptwin_event` | Via `require_clinician_auth` |
| DeepTwin Timeline | `audit.log_intelligence_request` | N/A | Via `require_clinician_auth` |
| Hypotheses | `audit.log_intelligence_request` | N/A | Via `require_clinician_auth` |
| DeepTwin Synthesis | `audit.log_synthesis_request` | `dt_audit.log_deeptwin_event` | Inline |
| Review | `audit.log_intelligence_request` | `dt_audit.log_deeptwin_event` | Via `require_clinician_auth` |
| Export | `audit.log_intelligence_request` | `dt_audit.log_deeptwin_event` | Via `require_clinician_auth` |

---

## 7. COMPLIANCE NOTES

### 7.1 HIPAA
- Patient data access is controlled via `patient_access` table.
- Clinic isolation prevents unauthorized cross-clinic access.
- Audit logging records all patient data access.
- AI consent enforcement meets patient-rights requirements.

### 7.2 SOC 2
- Role-based access control is implemented.
- Audit trail is complete for all patient-linked operations.
- Export operations are logged with export type and snapshot reference.

---

## 8. ACTION ITEMS

| # | Action | Priority | Owner | Target |
|---|--------|----------|-------|--------|
| 1 | Wire hardened decorators into `main.py` endpoints | MEDIUM | Backend | Phase 4b |
| 2 | Add export governance gate for `report_handoff`/`protocol_handoff` | LOW | Backend | Phase 4b |
| 3 | Validate `body.clinician_id == clinician_id` in review endpoint | LOW | Backend | Phase 4b |
| 4 | Implement role-aware `require_auth` dependency | MEDIUM | Backend | Phase 4b |
| 5 | Add rate limiting for export endpoints | LOW | Backend | Phase 5 |
| 6 | Update API documentation with role requirements | LOW | Docs | Phase 4b |

---

*End of Role Gate Audit*
