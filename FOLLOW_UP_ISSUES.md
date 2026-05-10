# FOLLOW-UP ISSUES: Clinical Data Platform

**Created:** May 10, 2026  
**Triggered by:** feat/clinical-data-platform PR  
**Urgency:** CRITICAL (blocking clinical production use)

---

## BLOCKING ISSUE #1: Wire Consent Enforcement into AI Routers

**Title:** Consent service: enforce gating in mri_analysis, qeeg_analysis, deeptwin routers

**Description:**
Consent service layer is complete and tested. But it is NOT yet enforced in AI analysis routers.

This blocks clinical production use. Must wire before real patient access.

**Affected Routers:**
- `apps/api/app/routers/mri_analysis_router.py` — AI MRI analysis endpoint
- `apps/api/app/routers/qeeg_analysis_router.py` — AI qEEG analysis endpoint
- `apps/api/app/routers/deeptwin_router.py` — DeepTwin digital phenotyping

**Work Required:**
1. Add consent check at start of each endpoint:
   ```python
   consent_service.require_consent(session, patient_id, "ai_analysis")
   ```

2. Add audit logging:
   ```python
   access_control_service.log_phi_access(..., action="ai_analysis_gated_by_consent")
   ```

3. Return 403 if no consent:
   ```python
   except consent_service.ConsentRequiredError:
       raise HTTPException(status_code=403, detail="Consent required for AI analysis")
   ```

4. Add tests:
   - Test: AI analysis blocked if consent withdrawn
   - Test: AI analysis blocked if no consent recorded
   - Test: AI analysis allowed if valid consent exists

**Definition of Done:**
- [ ] All 3 routers have consent check before analysis
- [ ] All endpoints audit-log consent-gated actions
- [ ] All unit tests pass
- [ ] Tested with consent withdrawn scenario
- [ ] Tested with missing consent scenario
- [ ] Tested with valid consent scenario

---

## BLOCKING ISSUE #2: Wire Consent Enforcement into Device Sync

**Title:** Consent service: enforce device data sync only with valid consent

**Description:**
Device registry accepts device data uploads. Must check consent before device data is ingested or used for AI analysis.

**Affected Routers:**
- `apps/api/app/routers/device_registry_router.py` — Device sync/upload endpoint

**Work Required:**
1. Check consent before accepting device data:
   ```python
   consent_service.require_consent(session, patient_id, "device_data")
   ```

2. Return 403 if no consent for device data

3. Add audit logging for device data acceptance

4. Add tests (same pattern as AI routers)

**Definition of Done:**
- [ ] Device sync blocked without consent
- [ ] Device data rejected if consent withdrawn
- [ ] Audit trail records all device gating decisions
- [ ] Tests pass (consent, no consent, withdrawn)

---

## BLOCKING ISSUE #3: Wire Consent Enforcement into Document Generation

**Title:** Consent service: enforce generated documents respect consent status

**Description:**
Generated reports, protocols, and documents must not be created if patient has not consented to document generation.

**Affected Routers:**
- `apps/api/app/routers/protocols_router.py` — Protocol generation
- `apps/api/app/routers/reports_router.py` — Report generation

**Work Required:**
1. Check consent before document generation starts
2. Block generation if consent missing/withdrawn
3. Add audit logging
4. Add tests

**Definition of Done:**
- [ ] Document generation blocked without consent
- [ ] Tests pass (all scenarios)

---

## FOLLOW-UP ISSUE #4: Patient Analytics Runtime Test Coverage

**Title:** Add runtime tests for patient analytics endpoints (pre-CI validation)

**Description:**
Patient analytics service has 4 endpoints. Need runtime tests to validate end-to-end behavior before CI runs.

**Tests Needed:**
1. `test_patient_analytics_summary_clinic_scoped.py` — Verify clinic isolation
2. `test_patient_analytics_timeline_audit_log.py` — Verify audit logging
3. `test_patient_analytics_signals_masking.py` — Verify PHI masking
4. `test_patient_analytics_access_denied.py` — Verify cross-clinic blocking

**Definition of Done:**
- [ ] All 4 test files created
- [ ] All tests pass with pytest
- [ ] CI runs tests automatically
- [ ] Tests cover happy path + error cases

---

## FOLLOW-UP ISSUE #5: Data Console Permission & PHI Regression Tests

**Title:** Add regression tests for data console masking, ALLOWLIST, permissions

**Description:**
Data Console is read-only and uses ALLOWLIST. Need tests to prevent future PHI leakage or SQL injection.

**Tests Needed:**
1. `test_data_console_allowlist_enforcement.py` — Verify unknown tables rejected
2. `test_data_console_phi_masking.py` — Verify sensitive fields masked
3. `test_data_console_read_only.py` — Verify no writes accepted
4. `test_data_console_cross_clinic_blocked.py` — Verify clinic isolation
5. `test_data_console_sql_injection_rejected.py` — Verify parameterized queries (no raw SQL)

**Definition of Done:**
- [ ] All 5 test files created
- [ ] All tests pass
- [ ] Tests prevent future PHI leakage
- [ ] CI runs tests automatically

---

## FOLLOW-UP ISSUE #6: Compliance Review & Data Protection Impact Assessment

**Title:** Schedule GDPR compliance review and DPIA for clinical data platform

**Description:**
Before using with real patients, need:
1. Legal review (GDPR Article 35 — DPIA required for high-risk processing)
2. Clinic/institution legal review
3. Security assessment (penetration test recommended)

**Work Required:**
1. Schedule call with legal team
2. Share DEEPSYNAPS_REPO_MAP.md + VERIFICATION_REPORT.md
3. Provide data flow diagrams (clinic → patient → AI → audit → masked console)
4. Provide security architecture (clinic isolation, PHI masking, audit trail)
5. Document consent enforcement requirement as a constraint

**Definition of Done:**
- [ ] Legal review complete
- [ ] DPIA signed off
- [ ] Security audit complete
- [ ] Recommendations documented
- [ ] Blocking issues resolved (consent enforcement)

---

## FOLLOW-UP ISSUE #7: Clinician UX Review

**Title:** Conduct clinician UX review of data console and patient analytics

**Description:**
Need clinician feedback on:
1. Data Console — Is the safe data browser useful?
2. Patient Analytics — Does it support clinical decision-making?
3. Safety banners — Are warnings clear enough?
4. Masking display — Is PHI masking obvious to clinicians?

**Work Required:**
1. Demo to 3-5 clinicians
2. Collect feedback on usability
3. Verify no unsafe medical claims
4. Iterate if needed

**Definition of Done:**
- [ ] Clinician review complete
- [ ] Feedback documented
- [ ] UX issues (if any) prioritized
- [ ] Safety verified (no autonomous diagnosis)

---

## FOLLOW-UP ISSUE #8: Device Sync Live Integration

**Title:** Implement live device sync connector (Oura, Apple Health, Garmin, WHOOP, Withings)

**Description:**
Device registry model exists but live connectors deferred. This enables real device data for clinical analytics.

**Connectors to Add:**
- Oura Ring → Sleep, HRV, temperature
- Apple Health → Steps, heart rate, workouts
- Garmin → Metrics
- WHOOP → HRV, strain, recovery
- Withings → Weight, blood pressure

**Work Required:**
1. Add OAuth connectors for each platform
2. Sync data to PatientDataAsset
3. Respect consent status (don't sync if consent withdrawn)
4. Add tests

**Definition of Done:**
- [ ] At least 2 live connectors working
- [ ] Data visible in patient analytics
- [ ] Tests pass
- [ ] Consent enforcement in place

---

## ISSUE PRIORITIES

**CRITICAL (blocking clinical use):**
1. Wire consent into AI routers — MUST DO before patient use
2. Wire consent into device sync — MUST DO before device data use
3. Wire consent into document generation — MUST DO before report use
4. Compliance review & DPIA — MUST DO before real patient access

**HIGH (enabling clinical workflows):**
5. Patient analytics runtime tests — Validate before CI
6. Data console regression tests — Prevent PHI leakage
7. Clinician UX review — Ensure safe usage

**MEDIUM (feature completeness):**
8. Device sync live integration — Expand data sources

---

## SUMMARY

**What's Done:**
✅ Consent service layer complete  
✅ Data console safe + read-only  
✅ Patient analytics clinic-scoped  
✅ Infrastructure verified + documented

**What's Blocking Clinical Use:**
❌ Consent NOT enforced in AI routers  
❌ Consent NOT enforced in device sync  
❌ Consent NOT enforced in document generation  
❌ Compliance review not yet scheduled

**Next Step:**
Open PR with infrastructure foundation. Schedule urgent implementation of blocking issues (Issues #1-3) before real patient access.

---

**Created by:** Hermes Agent  
**Date:** May 10, 2026
