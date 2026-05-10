# FOLLOW-UP CHECKLIST: Clinical Data Platform

**Reference:** PR #840 (feat/clinical-data-platform)  
**Status:** Infrastructure foundation delivered. Blocking items must complete before clinical use.  
**Created:** May 10, 2026

---

## ⚠️ BLOCKING ITEMS (Must complete before real patient access)

### A. Consent Enforcement in AI Routers

Add consent gating to AI analysis endpoints.

**Where:**
- `apps/api/app/routers/mri_analysis_router.py`
- `apps/api/app/routers/qeeg_analysis_router.py`
- `apps/api/app/routers/deeptwin_router.py`

**What to do:**
```python
# In each endpoint, after require_patient_access():
consent_service.require_consent(session, patient_id, "ai_analysis")
# Raises 403 Forbidden if consent missing
```

**Tests required:**
- [ ] AI blocked when consent withdrawn
- [ ] AI blocked when no consent exists
- [ ] AI allowed with valid consent
- [ ] Audit logs consent-gated decision

**Timeline:** CRITICAL — Must complete before any real patient AI analysis

---

### B. Consent Enforcement in Device Sync

Device registry must verify consent before accepting device data.

**Where:**
- `apps/api/app/routers/device_registry_router.py`

**What to do:**
```python
# Before accepting device data:
consent_service.require_consent(session, patient_id, "device_data")
```

**Tests required:**
- [ ] Device sync blocked without consent
- [ ] Device sync blocked if consent withdrawn
- [ ] Audit trail records device gating

**Timeline:** CRITICAL — Must complete before any real device data collection

---

### C. Consent Enforcement in Document Generation

Reports and protocols must respect consent status.

**Where:**
- `apps/api/app/routers/protocols_router.py`
- `apps/api/app/routers/reports_router.py`

**What to do:**
```python
# Before document generation:
consent_service.require_consent(session, patient_id, "document_generation")
```

**Tests required:**
- [ ] Document generation blocked without consent
- [ ] Document generation blocked if consent withdrawn
- [ ] Tests pass for all scenarios

**Timeline:** CRITICAL — Must complete before any real report generation

---

### D. UK GDPR / DPIA Compliance Review

Legal and compliance sign-off required before clinical use.

**Required:**
- [ ] Data Protection Impact Assessment (GDPR Article 35)
- [ ] Consent management compliance review
- [ ] Data retention policy documented
- [ ] Data subject rights procedures documented
- [ ] Security audit/penetration test (if required by institution)

**Timeline:** CRITICAL — Must complete before real patient access

---

## 📋 HIGH-PRIORITY ITEMS (Testing & verification)

### E. Backend Runtime Tests for Access Control & Consent

Create unit tests to prevent regression of security controls.

**Tests to create:**
- [ ] `test_access_control_isolation.py` — Clinic isolation verification
- [ ] `test_consent_enforcement.py` — Consent gating validation
- [ ] `test_audit_logging.py` — Audit trail verification
- [ ] `test_data_console_masking.py` — PHI masking verification
- [ ] `test_patient_analytics_clinic_scoped.py` — Clinic scope validation

**Timeline:** HIGH — Essential for CI validation

---

### F. Data Console Regression Tests

Prevent PHI leakage and SQL injection in data console.

**Tests to create:**
- [ ] ALLOWLIST enforcement (unknown tables rejected)
- [ ] PHI masking (sensitive fields masked)
- [ ] Read-only enforcement (no INSERT/UPDATE/DELETE)
- [ ] Cross-clinic access blocked
- [ ] SQL injection prevention (parameterized queries)

**Timeline:** HIGH — Essential before production deployment

---

### G. Clinician UX Review

Validate that data console and patient analytics are clinically usable and safe.

**Review points:**
- [ ] Is Data Console usable and safe?
- [ ] Does Patient Analytics support clinical decision-making?
- [ ] Are safety banners clear?
- [ ] Is PHI masking obvious?
- [ ] Any autonomous diagnosis claims? (Should be none)

**Timeline:** HIGH — Essential before real clinician use

---

## 🔄 MEDIUM-PRIORITY ITEMS (Feature expansion)

### H. Device Sync Live Integration

Implement OAuth connectors for real device data.

**Connectors:**
- [ ] Oura Ring (sleep, HRV, temperature)
- [ ] Apple Health (steps, HR, workouts)
- [ ] Garmin (metrics)
- [ ] WHOOP (HRV, strain, recovery)
- [ ] Withings (weight, BP)

**Timeline:** MEDIUM — Deferred to next sprint (feature expansion)

---

## 🎯 EXECUTION ORDER

**Phase 1 (Before any real patient use):** A, B, C, D
- Wire consent enforcement (A, B, C)
- Complete compliance review (D)

**Phase 2 (Before production deployment):** E, F, G
- Create runtime tests (E, F)
- Clinician UX review (G)

**Phase 3 (Feature expansion):** H
- Device connectors (not MVP)

---

## ✅ DO NOT PROCEED UNTIL:

- ✅ A: Consent enforcement in AI routers complete
- ✅ B: Consent enforcement in device sync complete
- ✅ C: Consent enforcement in document generation complete
- ✅ D: GDPR/DPIA compliance review complete

After A+B+C+D are done, items E+F+G can run in parallel before production.

---

## SUMMARY

**What's Ready Now:**
✅ Consent service layer complete (infrastructure)
✅ Data Console safe + read-only (infrastructure)
✅ Patient Analytics clinic-scoped (infrastructure)
✅ PR #840 passed static verification

**What's Blocking Clinical Use:**
❌ A: Consent NOT enforced in AI routers
❌ B: Consent NOT enforced in device sync
❌ C: Consent NOT enforced in document generation
❌ D: Compliance review not yet scheduled

**Next Action:**
1. Merge PR #840 (infrastructure)
2. Immediately start work on A, B, C, D (blocking items)
3. Do NOT use with real patients until all blocking items complete

**Responsible:**
- A, B, C: Backend engineer (consent integration work)
- D: Legal/compliance (GDPR DPIA review)
- E, F: QA/backend (runtime & regression tests)
- G: Clinician review (UX validation)
- H: Feature team (device integration, future sprint)

---

**Reference:** PR #840 infrastructure foundation  
**Status:** Blocking items tracked and documented  
**Created:** May 10, 2026
