# CONTROLLED PILOT PLAN
## DeepSynaps Protocol Studio - 10-20 Workflow Staging Pilot

**Date:** May 12, 2026  
**Status:** Pilot Planning Phase  
**Prepared for:** Pilot Execution Team

---

## PILOT OVERVIEW

### Scope
- **Workflows:** 10-20 total
- **Environment:** Staging only (deepsynaps-studio.fly.dev)
- **Real patients:** NO - synthetic test data
- **Real clinics:** NO - test clinic IDs
- **Duration:** 3-5 days
- **Oversight:** Clinical team + QA team

### Objectives
1. Verify missing consent always blocks workflows
2. Verify friendly consent messages are shown
3. Verify valid consent allows workflows
4. Verify AuditEvent/SafetyFlag created
5. Verify no model calls occur without consent
6. Verify no clinician confusion
7. Verify no unsafe wording

### Success Criteria
- Missing consent always blocks: ✅
- Friendly messages shown: ✅
- Valid consent allows: ✅
- AuditEvent logged: ✅
- SafetyFlag created: ✅
- No clinician confusion: ✅
- No unsafe claims: ✅
- All 6 workflows covered: ✅

---

## TEST SCENARIOS (10-20 Workflows)

### Scenario 1: qEEG - Missing Consent (Workflow #1)

**Setup:**
- Patient: test_patient_001 (in test clinic)
- Consent status: NONE
- Action: Attempt to upload qEEG file

**Expected behavior:**
- API returns 403 Forbidden
- Frontend shows: "Patient consent is required before this workflow can run."
- No file processed
- No model call occurs

**Verification:**
- [ ] 403 returned
- [ ] Message shown
- [ ] No file stored
- [ ] AuditEvent created
- [ ] SafetyFlag created

**Result:** PASS / FAIL

---

### Scenario 2: qEEG - Valid Consent (Workflow #2)

**Setup:**
- Patient: test_patient_001
- Consent status: VALID (created in setup)
- Action: Upload qEEG file

**Expected behavior:**
- Upload succeeds
- File is processed
- Analysis completes
- Results shown

**Verification:**
- [ ] Upload succeeds (200)
- [ ] File stored
- [ ] qEEG analysis runs
- [ ] Results displayed

**Result:** PASS / FAIL

---

### Scenario 3: MRI - Missing Consent (Workflow #3)

**Setup:**
- Patient: test_patient_002
- Consent status: NONE
- Action: Attempt to upload MRI scan

**Expected behavior:**
- API returns 403 Forbidden
- Frontend shows: "Patient consent is required"
- No scan processed

**Verification:**
- [ ] 403 returned
- [ ] Message shown
- [ ] No scan stored
- [ ] AuditEvent created
- [ ] SafetyFlag created

**Result:** PASS / FAIL

---

### Scenario 4: MRI - Valid Consent (Workflow #4)

**Setup:**
- Patient: test_patient_002
- Consent status: VALID
- Action: Upload MRI scan

**Expected behavior:**
- Upload succeeds
- Scan processed
- Analysis completes

**Verification:**
- [ ] Upload succeeds
- [ ] Scan stored
- [ ] MRI analysis runs
- [ ] Results displayed

**Result:** PASS / FAIL

---

### Scenario 5: DeepTwin - Missing Consent (Workflow #5)

**Setup:**
- Patient: test_patient_003
- Consent status: NONE
- Action: Attempt to run simulation

**Expected behavior:**
- API returns 403 Forbidden
- Frontend shows: "Patient consent required"
- No simulation runs

**Verification:**
- [ ] 403 returned
- [ ] Message shown
- [ ] No simulation stored
- [ ] AuditEvent created
- [ ] SafetyFlag created

**Result:** PASS / FAIL

---

### Scenario 6: DeepTwin - Valid Consent (Workflow #6)

**Setup:**
- Patient: test_patient_003
- Consent status: VALID
- Action: Run simulation

**Expected behavior:**
- Simulation runs
- Results generated
- Report available

**Verification:**
- [ ] Simulation runs
- [ ] Results stored
- [ ] Report generated
- [ ] Results displayed

**Result:** PASS / FAIL

---

### Scenario 7: Biometrics - Missing Consent (Workflow #7)

**Setup:**
- Patient: test_patient_004
- Consent status: NONE
- Action: Attempt to analyze biometrics

**Expected behavior:**
- API returns 403/405
- Frontend shows friendly message
- No analysis runs

**Verification:**
- [ ] Request blocked
- [ ] Message shown
- [ ] No analysis stored
- [ ] AuditEvent created
- [ ] SafetyFlag created

**Result:** PASS / FAIL

---

### Scenario 8: Biometrics - Valid Consent (Workflow #8)

**Setup:**
- Patient: test_patient_004
- Consent status: VALID
- Action: Analyze biometrics

**Expected behavior:**
- Analysis runs
- Results generated

**Verification:**
- [ ] Analysis succeeds
- [ ] Results stored
- [ ] Results displayed

**Result:** PASS / FAIL

---

### Scenario 9: Device Sync - Missing Consent (Workflow #9)

**Setup:**
- Patient: test_patient_005
- Consent status: NONE
- Action: Attempt device sync

**Expected behavior:**
- API returns 403/405
- Frontend shows friendly message
- No sync occurs

**Verification:**
- [ ] Request blocked
- [ ] Message shown
- [ ] No data synced
- [ ] AuditEvent created
- [ ] SafetyFlag created

**Result:** PASS / FAIL

---

### Scenario 10: Device Sync - Valid Consent (Workflow #10)

**Setup:**
- Patient: test_patient_005
- Consent status: VALID
- Action: Device sync

**Expected behavior:**
- Sync succeeds
- Data transferred

**Verification:**
- [ ] Sync succeeds
- [ ] Data stored
- [ ] Devices updated

**Result:** PASS / FAIL

---

### Scenario 11: Documents - Missing Consent (Workflow #11)

**Setup:**
- Patient: test_patient_006
- Consent status: NONE
- Action: Attempt to generate protocol/report

**Expected behavior:**
- API returns 403/405
- Frontend shows friendly message
- No document generated

**Verification:**
- [ ] Request blocked
- [ ] Message shown
- [ ] No document stored
- [ ] AuditEvent created
- [ ] SafetyFlag created

**Result:** PASS / FAIL

---

### Scenario 12: Documents - Valid Consent (Workflow #12)

**Setup:**
- Patient: test_patient_006
- Consent status: VALID
- Action: Generate protocol/report

**Expected behavior:**
- Generation succeeds
- Document created

**Verification:**
- [ ] Generation succeeds
- [ ] Document stored
- [ ] Document downloadable

**Result:** PASS / FAIL

---

### Additional Scenarios (Optional, Workflows #13-20)

**Scenario 13: Consent Withdrawal**
- Patient has valid consent
- Consent is withdrawn mid-session
- Next workflow attempt gets 403
- Verification: [ ] Withdrawal blocks [ ] Message shown [ ] AuditEvent created

**Scenario 14: Expired Consent**
- Patient consent expires
- Workflow attempt gets 403
- Verification: [ ] Expiration blocks [ ] Message shown [ ] AuditEvent created

**Scenario 15: Cross-Clinic Isolation**
- Patient in Clinic A
- Attempt access from Clinic B
- Should fail with 403/isolation error
- Verification: [ ] Access denied [ ] Clinics isolated

**Scenario 16: Concurrent Workflows**
- Multiple workflows for same patient simultaneously
- All respect consent status
- Verification: [ ] All respect consent [ ] No race conditions

**Scenario 17: Error Recovery**
- Workflow fails for consent reason
- Consent is obtained
- Workflow retry succeeds
- Verification: [ ] Retry succeeds [ ] No data duplication

**Scenario 18: Clinician Notifications**
- Missing consent should trigger audit log
- Compliance team should be notified
- Verification: [ ] Audit logged [ ] Notification sent

**Scenario 19: Data Integrity**
- No partial data should be stored on consent denial
- All-or-nothing transaction
- Verification: [ ] No partial data [ ] Transactions atomic

**Scenario 20: Performance**
- Consent check should not slow workflow
- API response time <200ms
- Verification: [ ] Response time <200ms [ ] No bottleneck

---

## TEST DATA SETUP

### Test Clinics
```
Clinic A (test_clinic_001)
- Name: Test Clinic A
- Status: Active
- Region: US/East

Clinic B (test_clinic_002)
- Name: Test Clinic B
- Status: Active
- Region: US/West
```

### Test Patients
```
Patient 1 (test_patient_001)
- Clinic: Clinic A
- Name: Test Patient One
- DOB: 1990-01-01
- Initial consent: NONE

Patient 2 (test_patient_002)
- Clinic: Clinic A
- Name: Test Patient Two
- DOB: 1985-06-15
- Initial consent: NONE

Patient 3 (test_patient_003)
- Clinic: Clinic A
- Name: Test Patient Three
- DOB: 1980-12-25
- Initial consent: NONE

Patient 4 (test_patient_004)
- Clinic: Clinic B
- Name: Test Patient Four
- DOB: 1995-03-10
- Initial consent: NONE

Patient 5 (test_patient_005)
- Clinic: Clinic B
- Name: Test Patient Five
- DOB: 1988-07-20
- Initial consent: NONE

Patient 6 (test_patient_006)
- Clinic: Clinic B
- Name: Test Patient Six
- DOB: 1992-11-05
- Initial consent: NONE
```

### Test Consent Records
```
For each patient without initial consent:
- Consent status: NONE (until workflow attempts)
- When workflow attempted: Create consent
- Consent type: qEEG, MRI, etc.
- Consent source: Test (manual)
- Consent valid: Yes
- Consent expiry: 30 days from creation
```

---

## EXECUTION TIMELINE

### Day 1: Setup (May 13)
- [ ] Create test clinic records
- [ ] Create test patient records
- [ ] Set up audit logging
- [ ] Brief pilot team
- [ ] Verify staging deployment

### Days 2-4: Execution (May 14-16)
- [ ] Run scenarios 1-12 (core workflows)
- [ ] Document results
- [ ] Verify AuditEvents/SafetyFlags
- [ ] Collect clinician feedback
- [ ] Fix any issues found

### Days 5+: Optional (May 17+)
- [ ] Run optional scenarios 13-20
- [ ] Performance testing
- [ ] Edge case testing
- [ ] Extended verification

### Final: Results (May 17-18)
- [ ] Compile all results
- [ ] Create CONTROLLED_PILOT_RESULTS_REPORT.md
- [ ] Issue final verdict
- [ ] Plan next phase

---

## AUDIT TRAIL REQUIREMENTS

For each workflow, record:

**Scenario #1 qEEG Missing Consent:**
```
Workflow ID: pilot_001
Patient ID: test_patient_001
Clinic ID: test_clinic_001
Timestamp: YYYY-MM-DD HH:MM:SS
Action: qEEG upload attempt
Consent status before: NONE
API response: 403
Frontend message: "Patient consent required"
AuditEvent created: YES / NO
  - Event ID: _________
  - Timestamp: _________
  - Details: _________
SafetyFlag created: YES / NO
  - Flag ID: _________
  - Flag status: CONSENT_DENIED
  - Details: _________
Data stored: YES / NO
Model call: YES / NO
Result: PASS / FAIL
Notes: ___________
```

**Repeat for each workflow**

---

## SUCCESS DEFINITION

Pilot is successful ONLY if:

✅ All 12 core scenarios pass (100% pass rate)
✅ Missing consent always blocks (12/12 blocked)
✅ Friendly messages always shown (12/12 shown)
✅ Valid consent always allows (6/6 allowed)
✅ AuditEvent always created (12/12 created)
✅ SafetyFlag always created for denials (6/6 created)
✅ No model calls without consent (12/12 blocked)
✅ No clinician confusion (feedback positive)
✅ No unsafe wording (review clean)
✅ No cross-clinic access (isolation verified)

**Pilot FAILS if ANY of these are false.**

---

## ESCALATION PATH

If pilot fails on ANY criterion:

1. **Document failure** — What failed and why
2. **Halt pilot** — Stop further testing
3. **Notify engineering** — Required fixes
4. **Engineering fixes** — Make necessary changes
5. **Re-test** — Verify fix works
6. **Re-run pilot** — Restart from scratch
7. **Repeat until pass**

**DO NOT PROCEED to production without full pilot pass.**

---

## CLINICIAN FEEDBACK TEMPLATE

During pilot, collect feedback:

```
PILOT FEEDBACK FORM

Clinician: ________________
Date: ________________

CONSENT UX:
[ ] Clear and intuitive
[ ] Confusing
[ ] Needs improvement: ________________

MISSING CONSENT MESSAGE:
[ ] Helpful
[ ] Confusing
[ ] Too technical
[ ] Not clear what to do next

WORKFLOW WITH CONSENT:
[ ] Worked smoothly
[ ] Had issues: ________________

OVERALL IMPRESSION:
[ ] Ready for production
[ ] Needs changes: ________________
[ ] Not ready

SAFETY CONCERNS:
[ ] None
[ ] Issue: ________________

SUGGESTIONS:
________________

Would recommend for production?
[ ] Yes
[ ] With changes: ________________
[ ] No
```

---

## DOCUMENTATION DELIVERABLES

### During Pilot
- Daily status updates (brief)
- Workflow results (checklist per scenario)
- Issues/blockers (as they arise)

### After Pilot
- CONTROLLED_PILOT_RESULTS_REPORT.md (comprehensive)
  - All scenario results
  - Audit trail verification
  - Clinician feedback summary
  - Final verdict

---

## PRODUCTION GATE

**Pilot MUST pass all criteria before production.**

If pilot successful:
→ Proceed to DPIA/compliance review (2-3 days)
→ Proceed to final clinical safety sign-off (1 day)
→ Proceed to production deployment (if all approve)

If pilot fails:
→ Document failures
→ Engineering fixes issues
→ Re-run pilot
→ Repeat until pass

---

**Status:** ✅ Pilot Plan Ready  
**Next:** Await Clinical Review Sign-Off  
**Then:** Execute Pilot (May 13-17)

