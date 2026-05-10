# DATABASE VERIFICATION CHECKLIST
## DeepSynaps Protocol Studio - Controlled Pilot Verification

**Date:** May 12, 2026  
**Status:** Pilot Verification Phase  
**Prepared for:** QA + Database Verification Team

---

## OVERVIEW

For each blocked workflow during pilot, you must verify:

1. ✅ AuditEvent exists
2. ✅ SafetyFlag exists
3. ✅ Patient/clinic IDs correct
4. ✅ No output artifact was generated
5. ✅ No AI/model run was created
6. ✅ Timestamp is accurate
7. ✅ Data integrity maintained

---

## VERIFICATION PROCESS

### For Each Blocked Workflow (Missing Consent)

**Example: Pilot Workflow #1 - qEEG Missing Consent**

#### Step 1: Verify AuditEvent

```sql
-- Query AuditEvent table
SELECT * FROM audit_events
WHERE patient_id = 'test_patient_001'
  AND action = 'qeeg_upload_denied'
  AND reason = 'consent_missing'
  AND created_at > '2026-05-13 00:00:00'
ORDER BY created_at DESC
LIMIT 5;
```

**Expected:**
- [ ] 1 record exists
- [ ] patient_id = test_patient_001
- [ ] clinic_id = test_clinic_001
- [ ] action = qeeg_upload_denied
- [ ] reason = consent_missing
- [ ] timestamp recent (within 1 minute of workflow attempt)
- [ ] actor = system or clinician
- [ ] details contain workflow reference

**Checklist:**
```
Workflow #1 qEEG Missing Consent:
[ ] AuditEvent exists
[ ] patient_id correct
[ ] clinic_id correct
[ ] action correct
[ ] reason correct
[ ] timestamp accurate
[ ] details captured
Record ID: ________________
Timestamp: ________________
```

#### Step 2: Verify SafetyFlag

```sql
-- Query SafetyFlag table
SELECT * FROM safety_flags
WHERE patient_id = 'test_patient_001'
  AND flag_type = 'CONSENT_DENIED'
  AND workflow = 'qeeg_upload'
  AND created_at > '2026-05-13 00:00:00'
ORDER BY created_at DESC
LIMIT 5;
```

**Expected:**
- [ ] 1 record exists (or more if multiple denials)
- [ ] patient_id = test_patient_001
- [ ] clinic_id = test_clinic_001
- [ ] flag_type = CONSENT_DENIED
- [ ] workflow = qeeg_upload
- [ ] severity = high or medium
- [ ] status = open or acknowledged
- [ ] timestamp recent

**Checklist:**
```
Workflow #1 qEEG Missing Consent:
[ ] SafetyFlag exists
[ ] patient_id correct
[ ] clinic_id correct
[ ] flag_type = CONSENT_DENIED
[ ] workflow correct
[ ] severity reasonable
[ ] status = open/acknowledged
Flag ID: ________________
Timestamp: ________________
```

#### Step 3: Verify No Data Stored

```sql
-- Query data tables for test patient
SELECT COUNT(*) as qeeg_records FROM qeeg_data
WHERE patient_id = 'test_patient_001'
  AND created_at > '2026-05-13 00:00:00';

SELECT COUNT(*) as qeeg_analysis_records FROM qeeg_analysis
WHERE patient_id = 'test_patient_001'
  AND created_at > '2026-05-13 00:00:00';

SELECT COUNT(*) as files FROM files
WHERE patient_id = 'test_patient_001'
  AND file_type = 'qeeg'
  AND created_at > '2026-05-13 00:00:00';
```

**Expected:**
- [ ] qeeg_records = 0
- [ ] qeeg_analysis_records = 0
- [ ] files = 0

**Checklist:**
```
Workflow #1 qEEG Missing Consent:
[ ] No qEEG data stored (0 records)
[ ] No analysis stored (0 records)
[ ] No file stored (0 records)
[ ] No partial data (cleanup verified)
```

#### Step 4: Verify No Model Call

```sql
-- Query model_runs table
SELECT * FROM model_runs
WHERE patient_id = 'test_patient_001'
  AND model = 'qeeg_analyzer'
  AND created_at > '2026-05-13 00:00:00'
ORDER BY created_at DESC
LIMIT 5;

-- Query external_api_calls
SELECT * FROM external_api_calls
WHERE patient_id = 'test_patient_001'
  AND api_name IN ('deepneuron', 'neurotech', 'etc')
  AND created_at > '2026-05-13 00:00:00'
ORDER BY created_at DESC
LIMIT 5;
```

**Expected:**
- [ ] model_runs = 0 (no AI called)
- [ ] external_api_calls = 0 (no external API called)

**Checklist:**
```
Workflow #1 qEEG Missing Consent:
[ ] No model_runs created (0 records)
[ ] No external_api_calls made (0 records)
[ ] No cloud resources used
[ ] No compute charges incurred
```

#### Step 5: Verify Consent Status Unchanged

```sql
-- Query consent table
SELECT * FROM consents
WHERE patient_id = 'test_patient_001'
ORDER BY updated_at DESC
LIMIT 5;
```

**Expected:**
- [ ] No new consent created
- [ ] Consent status unchanged (still NONE)
- [ ] Consent updated_at unchanged

**Checklist:**
```
Workflow #1 qEEG Missing Consent:
[ ] No new consent created
[ ] Consent status unchanged
[ ] Consent updated_at unchanged
Consent status: ________________
Updated_at: ________________
```

#### Step 6: Verify Clinic Isolation

```sql
-- Verify clinic_id is correct
SELECT DISTINCT clinic_id FROM audit_events
WHERE patient_id = 'test_patient_001';

SELECT DISTINCT clinic_id FROM safety_flags
WHERE patient_id = 'test_patient_001';

-- Verify no cross-clinic leakage
SELECT COUNT(*) FROM audit_events
WHERE patient_id = 'test_patient_001'
  AND clinic_id NOT IN ('test_clinic_001', 'test_clinic_002');
```

**Expected:**
- [ ] All events have clinic_id = test_clinic_001 or test_clinic_002 (patient's clinic)
- [ ] No events in other clinics (count = 0)

**Checklist:**
```
Workflow #1 qEEG Missing Consent:
[ ] All events clinic_id correct
[ ] No cross-clinic leakage (0 events elsewhere)
[ ] Clinic isolation verified
Patient clinic: test_clinic_001
Leakage count: ________________
```

---

## VERIFICATION TEMPLATE

Print this for each blocked workflow:

```
╔════════════════════════════════════════════════════════════════╗
║              WORKFLOW VERIFICATION CHECKLIST                    ║
╚════════════════════════════════════════════════════════════════╝

Workflow ID: pilot_001
Workflow type: qEEG Upload
Patient: test_patient_001
Clinic: test_clinic_001
Attempt timestamp: 2026-05-13 14:23:45

STEP 1: AuditEvent Verification
[ ] Record exists
[ ] patient_id correct: test_patient_001
[ ] clinic_id correct: test_clinic_001
[ ] action correct: qeeg_upload_denied
[ ] reason correct: consent_missing
[ ] timestamp accurate (within 1 min)
[ ] details complete

AuditEvent ID: _________________
Verified by: _________________ Date: _________

STEP 2: SafetyFlag Verification
[ ] Record exists
[ ] patient_id correct: test_patient_001
[ ] clinic_id correct: test_clinic_001
[ ] flag_type correct: CONSENT_DENIED
[ ] workflow correct: qeeg_upload
[ ] severity reasonable
[ ] status = open or acknowledged

SafetyFlag ID: _________________
Verified by: _________________ Date: _________

STEP 3: No Data Stored
[ ] qeeg_data count = 0
[ ] qeeg_analysis count = 0
[ ] files count = 0
[ ] No partial data

Verified by: _________________ Date: _________

STEP 4: No Model Call
[ ] model_runs count = 0
[ ] external_api_calls count = 0
[ ] No compute charges

Verified by: _________________ Date: _________

STEP 5: Consent Unchanged
[ ] No new consent created
[ ] Consent status still NONE
[ ] Consent updated_at unchanged

Verified by: _________________ Date: _________

STEP 6: Clinic Isolation
[ ] All events clinic_id correct
[ ] No cross-clinic leakage (count = 0)
[ ] Isolation verified

Verified by: _________________ Date: _________

OVERALL RESULT:
[ ] PASS - All verifications complete
[ ] FAIL - Issue(s) found:
    ___________________________________________
    ___________________________________________

Verifier signature: _________________ Date: _________
```

---

## ALLOWED WORKFLOW VERIFICATION

For each successful workflow (valid consent), verify:

**Example: Pilot Workflow #2 - qEEG Valid Consent**

```sql
-- Verify data was stored
SELECT COUNT(*) as qeeg_records FROM qeeg_data
WHERE patient_id = 'test_patient_001'
  AND created_at > '2026-05-13 00:00:00';
-- Expected: >= 1

-- Verify analysis was run
SELECT COUNT(*) as analysis_records FROM qeeg_analysis
WHERE patient_id = 'test_patient_001'
  AND created_at > '2026-05-13 00:00:00';
-- Expected: >= 1

-- Verify model was called
SELECT COUNT(*) as model_runs FROM model_runs
WHERE patient_id = 'test_patient_001'
  AND model = 'qeeg_analyzer'
  AND status = 'completed'
  AND created_at > '2026-05-13 00:00:00';
-- Expected: >= 1

-- Verify results generated
SELECT COUNT(*) as results FROM analysis_results
WHERE patient_id = 'test_patient_001'
  AND analysis_type = 'qeeg'
  AND created_at > '2026-05-13 00:00:00';
-- Expected: >= 1
```

**Checklist:**
```
Workflow #2 qEEG Valid Consent:
[ ] qEEG data stored (>= 1 records)
[ ] Analysis stored (>= 1 records)
[ ] Model called (>= 1 runs)
[ ] Results generated (>= 1 results)
[ ] File accessible to clinician
[ ] No errors in logs
```

---

## SUMMARY VERIFICATION ACROSS ALL WORKFLOWS

After all workflows complete:

```sql
-- Count of denied workflows
SELECT COUNT(*) as denied_workflows FROM audit_events
WHERE action LIKE '%_denied'
  AND created_at > '2026-05-13 00:00:00';
-- Expected: 6 (one per workflow type without consent)

-- Count of SafetyFlags for denials
SELECT COUNT(*) as safety_flags FROM safety_flags
WHERE flag_type = 'CONSENT_DENIED'
  AND created_at > '2026-05-13 00:00:00';
-- Expected: >= 6

-- Count of successful workflows
SELECT COUNT(*) as successful_workflows FROM model_runs
WHERE status = 'completed'
  AND created_at > '2026-05-13 00:00:00';
-- Expected: >= 6

-- Verify cross-clinic isolation
SELECT COUNT(DISTINCT clinic_id) as clinic_count FROM audit_events
WHERE created_at > '2026-05-13 00:00:00';
-- Expected: <= 2 (only test clinics)

-- Verify no PHI leakage
SELECT COUNT(*) as phi_leakage FROM audit_events
WHERE details LIKE '%@%'
  OR details LIKE '%patient_%'
  OR details LIKE '%diagnos%'
  AND created_at > '2026-05-13 00:00:00';
-- Expected: 0 (no PHI in logs)
```

**Final Checklist:**
```
PILOT VERIFICATION SUMMARY:

[ ] 12 core workflows tested
[ ] 6 denials created AuditEvents
[ ] 6+ SafetyFlags created
[ ] 6 valid-consent workflows succeeded
[ ] 0 cross-clinic leakage
[ ] 0 PHI exposed in logs
[ ] All timestamps accurate
[ ] All data integrity maintained
[ ] All isolation verified

Result: PASS / NEEDS REVIEW / FAIL

Verifier: _________________ Date: _________
```

---

## ESCALATION

If ANY verification fails:

1. Document the failure
2. Notify engineering immediately
3. Halt pilot
4. Engineering investigates + fixes
5. Restart verification for that workflow
6. Repeat until all pass

**DO NOT PROCEED without complete verification.**

---

**Status:** ✅ Verification Checklist Ready  
**Use:** During and after pilot execution  
**Next:** Execute pilot → Verify → Document results

