# WEEK 2 TESTING PLAN
## DeepSynaps Protocol Studio - E2E, Security, Load Testing

**Date:** May 12, 2026  
**Duration:** Week 2 (May 19-25)  
**Status:** Planning Phase  
**Prepared for:** QA + Security + DevOps teams

---

## OVERVIEW

Week 2 focuses on strengthening test coverage, security validation, and load/stability testing for controlled pilot readiness.

**Key principles:**
- ❌ NO new product features
- ✅ Test coverage only
- ✅ Synthetic data only (no real PHI)
- ✅ Staging-only testing
- ✅ Gate-controlled verdicts

**Timeline:**
- Mon-Tue (May 19-20): E2E test development
- Wed (May 21): Security testing
- Thu (May 22): Load testing
- Fri (May 23): Results compilation + reporting

---

## WORKSTREAM 1: E2E TESTING (16 Scenarios)

### Framework & Setup

**Framework options:**
- Playwright (recommended: modern, fast, cross-browser)
- Cypress (alternative: focus-mode friendly)
- Existing framework (if already in use)

**Test environment:**
- Staging: deepsynaps-studio.fly.dev
- Test data: Synthetic (6 test clinics, 6 test patients, pre-configured)
- Browser: Chrome headless
- Timeline: Single test run <30 min

### E2E Test Scenarios (16 Total)

#### Group 1: Authentication & Dashboard (3 Scenarios)

**Scenario E2E-1: Login as Clinician**
- Step 1: Navigate to login page
- Step 2: Enter clinician credentials (test_clinician_001 / password)
- Step 3: Submit login form
- Step 4: Verify redirect to dashboard
- Step 5: Verify clinician name displayed
- Step 6: Verify clinic name displayed
- Expected: Success (200 OK, dashboard loaded)
- Security check: No credentials in logs

**Test code skeleton:**
```javascript
test('Login as clinician', async ({ page }) => {
  await page.goto('https://deepsynaps-studio.fly.dev/login');
  await page.fill('input[name="email"]', 'test_clinician_001@example.com');
  await page.fill('input[name="password"]', 'test_password_123');
  await page.click('button:has-text("Login")');
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.locator('text=test_clinician_001')).toBeVisible();
});
```

**Pass criteria:**
- [ ] Login form loads
- [ ] Credentials accepted
- [ ] Redirect to dashboard
- [ ] Clinician name visible
- [ ] No error messages

---

**Scenario E2E-2: Clinic Dashboard Overview**
- Step 1: Login as clinician
- Step 2: Navigate to clinic dashboard
- Step 3: Verify patient count displayed
- Step 4: Verify recent analyses listed
- Step 5: Verify analytics visible
- Step 6: Verify no PHI exposed in list view
- Expected: Dashboard loads, data visible, no raw PHI

**Pass criteria:**
- [ ] Dashboard loads
- [ ] Patient count displayed
- [ ] Recent analyses listed
- [ ] Analytics visible
- [ ] No raw PHI (names masked if applicable)

---

**Scenario E2E-3: Patient Dashboard Access**
- Step 1: Login as clinician
- Step 2: Click on a test patient
- Step 3: Verify patient dashboard loads
- Step 4: Verify patient ID visible
- Step 5: Verify consent status displayed
- Step 6: Verify analysis history visible
- Expected: Patient dashboard loads with appropriate data

**Pass criteria:**
- [ ] Dashboard loads
- [ ] Patient ID visible
- [ ] Consent status shown
- [ ] Analysis history visible

---

#### Group 2: qEEG Consent Missing (2 Scenarios)

**Scenario E2E-4: qEEG Upload Blocked (No Consent)**
- Step 1: Login as clinician
- Step 2: Navigate to patient dashboard (test_patient_001, NO consent)
- Step 3: Click "Upload qEEG"
- Step 4: Verify "Upload" button is disabled or shows message
- Step 5: Attempt to upload qEEG file (if form allows)
- Step 6: Verify 403 error OR friendly message shown
- Expected: Upload blocked, friendly message displayed

**Test code skeleton:**
```javascript
test('qEEG upload blocked without consent', async ({ page }) => {
  // Login + navigate to patient (no consent)
  await page.goto('https://deepsynaps-studio.fly.dev/patient/test_patient_001');
  
  // Try to upload qEEG
  const uploadButton = page.locator('button:has-text("Upload qEEG")');
  
  // Either button is disabled...
  if (await uploadButton.isDisabled()) {
    expect(await uploadButton.isDisabled()).toBe(true);
  } else {
    // ...or shows friendly message after clicking
    await uploadButton.click();
    await expect(page.locator('text=Patient consent is required')).toBeVisible();
  }
});
```

**Pass criteria:**
- [ ] Upload button disabled OR message shown
- [ ] Friendly message visible (no raw 403)
- [ ] No file processed
- [ ] No analysis started

---

**Scenario E2E-5: qEEG Upload Success (With Consent)**
- Step 1: Login as clinician
- Step 2: Navigate to patient dashboard (test_patient_002, WITH consent)
- Step 3: Click "Upload qEEG"
- Step 4: Select test qEEG file (synthetic data)
- Step 5: Submit upload
- Step 6: Verify upload success message
- Step 7: Verify analysis started
- Step 8: Verify results appear in dashboard
- Expected: Upload succeeds, analysis runs, results visible

**Pass criteria:**
- [ ] Upload form loads
- [ ] File selection works
- [ ] Upload succeeds (200 OK)
- [ ] Success message shown
- [ ] Analysis status updated
- [ ] Results visible in dashboard

---

#### Group 3: MRI Consent Missing/Valid (2 Scenarios)

**Scenario E2E-6: MRI Upload Blocked (No Consent)**
- Similar to E2E-4 but for MRI
- Expected: Upload blocked, friendly message

**Scenario E2E-7: MRI Upload Success (With Consent)**
- Similar to E2E-5 but for MRI
- Expected: Upload succeeds, analysis runs, results visible

---

#### Group 4: DeepTwin Consent Missing/Valid (2 Scenarios)

**Scenario E2E-8: DeepTwin Simulation Blocked (No Consent)**
- Similar to E2E-4 but for DeepTwin simulation
- Expected: Simulation blocked, friendly message

**Scenario E2E-9: DeepTwin Simulation Success (With Consent)**
- Similar to E2E-5 but for DeepTwin
- Expected: Simulation runs, results visible

---

#### Group 5: Device Sync Consent Missing/Valid (2 Scenarios)

**Scenario E2E-10: Device Sync Blocked (No Consent)**
- Similar to E2E-4 but for device sync
- Expected: Sync blocked, friendly message

**Scenario E2E-11: Device Sync Success (With Consent)**
- Similar to E2E-5 but for device sync
- Expected: Sync succeeds, data synced

---

#### Group 6: Document Generation Consent Missing/Valid (2 Scenarios)

**Scenario E2E-12: Document Generation Blocked (No Consent)**
- Similar to E2E-4 but for document/protocol generation
- Expected: Generation blocked, friendly message

**Scenario E2E-13: Document Generation Success (With Consent)**
- Similar to E2E-5 but for document generation
- Expected: Generation succeeds, document created, downloadable

---

#### Group 7: Data Console & Access Control (3 Scenarios)

**Scenario E2E-14: Data Console Read-Only Access**
- Step 1: Login as researcher (researcher_001)
- Step 2: Navigate to Data Console
- Step 3: Verify "SELECT" queries work
- Step 4: Attempt UPDATE query
- Step 5: Verify UPDATE blocked (no permission)
- Step 6: Verify read-only interface
- Expected: Read-only access enforced, writes blocked

**Pass criteria:**
- [ ] SELECT queries work
- [ ] UPDATE queries blocked
- [ ] DELETE queries blocked
- [ ] Error message appropriate
- [ ] Read-only badge visible

---

**Scenario E2E-15: PHI Masking in Data Console**
- Step 1: Login as researcher
- Step 2: Navigate to Data Console
- Step 3: Run query: SELECT patient_name, patient_id FROM patients
- Step 4: Verify patient names are masked (e.g., "Patient_001")
- Step 5: Verify raw names NOT shown
- Expected: PHI masked by default

**Pass criteria:**
- [ ] Query executes
- [ ] Names masked
- [ ] Raw names not visible
- [ ] Masking applied automatically

---

**Scenario E2E-16: Cross-Clinic Access Blocked**
- Step 1: Login as clinician_clinic_001
- Step 2: Attempt to access patient from clinic_clinic_002
- Step 3: Verify 403 access denied
- Step 4: Verify friendly message shown
- Step 5: Verify redirect to own clinic
- Expected: Cross-clinic access blocked, isolation enforced

**Pass criteria:**
- [ ] 403 error returned (or friendly message)
- [ ] Patient not displayed
- [ ] No data leaked
- [ ] Redirect to own clinic

---

### E2E Test Infrastructure

**Test data setup (pre-test):**
```sql
-- 6 test clinics
INSERT INTO clinics VALUES 
  ('test_clinic_001', 'Test Clinic 1', ...),
  ('test_clinic_002', 'Test Clinic 2', ...),
  ... (4 more)

-- 6 test patients (with/without consent mix)
INSERT INTO patients VALUES 
  ('test_patient_001', 'test_clinic_001', NO_CONSENT),
  ('test_patient_002', 'test_clinic_001', WITH_CONSENT),
  ('test_patient_003', 'test_clinic_002', NO_CONSENT),
  ... (3 more)

-- 3 test clinicians
INSERT INTO clinicians VALUES 
  ('clinician_001', 'test_clinic_001', 'Clinician'),
  ('clinician_002', 'test_clinic_002', 'Clinician'),
  ('researcher_001', NULL, 'Researcher')
```

**Test execution:**
```bash
# Run all E2E tests
npx playwright test e2e/ --headed=false

# Run specific test group
npx playwright test e2e/consent.spec.js

# Generate HTML report
npx playwright show-report

# Results: PASS/FAIL per scenario, execution time, screenshots on failure
```

**Success criteria (E2E overall):**
- [ ] 16/16 scenarios pass
- [ ] Execution time <30 min
- [ ] No flaky tests (0 retries needed)
- [ ] All consent scenarios pass
- [ ] All access control scenarios pass

---

## WORKSTREAM 2: SECURITY TESTING (9 Vectors)

### Security Test Methodology

**Approach:** Automated + manual security checks

**Test environment:** Staging (deepsynaps-studio.fly.dev)

**Tools:**
- OWASP ZAP (automatic scanning)
- Manual SQL injection tests
- Manual access control tests
- Log inspection
- API request inspection

### Security Vectors (9 Total)

#### Vector 1: No Raw SQL Exposed

**Test:** SQL injection attempt on user inputs

```bash
# Attempt SQL injection on login
curl -X POST https://deepsynaps-studio.fly.dev/api/v1/login \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com\" OR \"1\"=\"1", "password": "x"}'

# Expected: 400 Bad Request (input validation error)
# NOT: SQL error message, NOT: 5xx error with SQL details
```

**Pass criteria:**
- [ ] Input validation catches injection attempt
- [ ] No SQL error in response
- [ ] No database details leaked
- [ ] Clean error message only

---

#### Vector 2: Data Console Allowlist Enforced

**Test:** Attempt queries outside allowlist

```bash
# Attempt UPDATE query (not in allowlist)
curl -X POST https://deepsynaps-studio.fly.dev/api/v1/data-console/query \
  -H "Authorization: Bearer researcher_token" \
  -H "Content-Type: application/json" \
  -d '{"query": "UPDATE patients SET name = \"hacked\" WHERE id = \"test_patient_001\""}'

# Expected: 403 Forbidden (query type not allowed)
```

**Pass criteria:**
- [ ] UPDATE denied
- [ ] DELETE denied
- [ ] DROP denied
- [ ] CREATE denied
- [ ] SELECT allowed

---

#### Vector 3: PHI Fields Masked by Default

**Test:** Query PHI field, verify masking

```bash
# Query patient names (should be masked)
curl -X POST https://deepsynaps-studio.fly.dev/api/v1/data-console/query \
  -H "Authorization: Bearer researcher_token" \
  -d '{"query": "SELECT patient_id, patient_name FROM patients LIMIT 5"}'

# Expected: patient_name values = "Patient_001", "Patient_002", etc.
# NOT: Raw names, NOT: "John Doe", etc.
```

**Pass criteria:**
- [ ] Patient names masked
- [ ] Patient emails masked
- [ ] Patient phone masked
- [ ] Patient address masked
- [ ] Masking applied automatically (no manual request)

---

#### Vector 4: Patient Cannot Access Another Patient

**Test:** Attempt cross-patient access

```bash
# Login as patient_001
# Request: GET /api/v1/patient/patient_002/data
# Expected: 403 Forbidden

curl -X GET https://deepsynaps-studio.fly.dev/api/v1/patient/patient_002/data \
  -H "Authorization: Bearer patient_001_token"

# Expected: 403 Forbidden (or 404)
# NOT: patient_002's data
```

**Pass criteria:**
- [ ] 403 or 404 returned
- [ ] No cross-patient data leaked
- [ ] No error reveals patient exists
- [ ] Audit trail created (AuditEvent + SafetyFlag)

---

#### Vector 5: Clinician Cannot Access Another Clinic's Patient

**Test:** Attempt cross-clinic access

```bash
# Login as clinician_clinic_001
# Request: GET /api/v1/patient/patient_from_clinic_002/data
# Expected: 403 Forbidden

curl -X GET https://deepsynaps-studio.fly.dev/api/v1/patient/test_patient_003/data \
  -H "Authorization: Bearer clinician_clinic_001_token"

# Expected: 403 Forbidden
# NOT: patient data from clinic_002
```

**Pass criteria:**
- [ ] 403 returned
- [ ] No cross-clinic data leaked
- [ ] AuditEvent created
- [ ] SafetyFlag created (UNAUTHORIZED_ACCESS)

---

#### Vector 6: Researcher Cannot Access PHI

**Test:** Researcher attempts PHI access

```bash
# Login as researcher (no clinic affiliation)
# Request: GET /api/v1/patient/test_patient_001/raw-data
# Expected: 403 Forbidden (or masked response)

curl -X GET https://deepsynaps-studio.fly.dev/api/v1/patient/test_patient_001/raw-data \
  -H "Authorization: Bearer researcher_token"

# Expected: 403 Forbidden or masked data only
# NOT: Raw patient data
```

**Pass criteria:**
- [ ] 403 returned
- [ ] PHI not accessible
- [ ] Only query results from Data Console
- [ ] AuditEvent created

---

#### Vector 7: Missing Consent Blocks Workflow

**Test:** Attempt workflow without consent

```bash
# qEEG upload without consent
curl -X POST https://deepsynaps-studio.fly.dev/api/v1/qeeg/upload \
  -H "Authorization: Bearer clinician_token" \
  -F "file=@test.qeeg" \
  -F "patient_id=test_patient_001_NO_CONSENT"

# Expected: 403 Forbidden
```

**Pass criteria:**
- [ ] 403 returned
- [ ] No data processed
- [ ] AuditEvent created
- [ ] SafetyFlag created (CONSENT_MISSING)

---

#### Vector 8: Denied Attempts Create AuditEvent + SafetyFlag

**Test:** Verify audit trail for denied access

```sql
-- After failed access attempt, verify audit trail
SELECT * FROM audit_events 
WHERE patient_id = 'test_patient_001_NO_CONSENT'
AND reason = 'consent_missing'
ORDER BY created_at DESC 
LIMIT 1;

-- Expected: Event exists, timestamp recent, details logged
```

**Pass criteria:**
- [ ] AuditEvent created
- [ ] AuditEvent has correct patient_id
- [ ] AuditEvent has correct reason
- [ ] AuditEvent timestamp accurate
- [ ] SafetyFlag created (CONSENT_DENIED)
- [ ] SafetyFlag type correct

---

#### Vector 9: No AI/Model/Provider Call After Denied Consent

**Test:** Verify no model execution on denial

```sql
-- After denied consent attempt, verify no model execution
SELECT COUNT(*) FROM model_runs
WHERE patient_id = 'test_patient_001_NO_CONSENT'
AND created_at > (now() - interval '1 minute');

-- Expected: 0 runs
```

**Pass criteria:**
- [ ] 0 model runs after denial
- [ ] 0 external API calls after denial
- [ ] 0 database writes (except audit events)
- [ ] Request rejected at auth layer

---

### Security Testing Execution

```bash
# 1. Run OWASP ZAP scan
zaproxy -cmd -quickurl https://deepsynaps-studio.fly.dev -quickout results.html

# 2. Run manual security tests
./tests/security/manual_tests.sh

# 3. Inspect audit logs
./tests/security/audit_log_check.sh

# 4. Generate security report
./tests/security/generate_report.sh
```

**Success criteria (Security overall):**
- [ ] 9/9 vectors pass
- [ ] No OWASP Top 10 findings
- [ ] No data leakage
- [ ] All denials logged
- [ ] All access controlled

---

## WORKSTREAM 3: LOAD TESTING (6 Endpoints)

### Load Testing Methodology

**Tool:** k6 (Grafana k6) for staged load testing

**Environment:** Staging (deepsynaps-studio.fly.dev)

**Constraints:**
- Ramp-up: 0 → 10 VUs over 1 min (avoid sudden spike)
- Sustain: 10 VUs for 2 min
- Ramp-down: 10 → 0 VUs over 1 min
- Total: 4 min per endpoint
- No spike testing (production safety)

**Test data:** Synthetic, pre-loaded

**Acceptable thresholds:**
- Response time: p95 <500ms, p99 <1s
- Error rate: <1%
- Throughput: >100 req/sec per endpoint

### Load Test Scenarios (6 Endpoints)

#### Load Test 1: Login/Session

**Scenario:** Simulate concurrent logins

```javascript
// k6 test: login_load.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  stages: [
    { duration: '1m', target: 10 },  // Ramp to 10 VUs
    { duration: '2m', target: 10 },  // Sustain
    { duration: '1m', target: 0 },   // Ramp down
  ],
};

export default function () {
  let res = http.post('https://deepsynaps-studio.fly.dev/api/v1/login', {
    email: `test_clinician_${__VU}@example.com`,
    password: 'test_password_123',
  });

  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });

  sleep(1);
}
```

**Expected results:**
- p95 response time: <500ms
- Error rate: 0%
- Throughput: >100 logins/sec

---

#### Load Test 2: Patient Dashboard

**Scenario:** Simulate concurrent dashboard loads

```javascript
// k6 test: dashboard_load.js
// Similar structure but GET /api/v1/dashboard
// Expected: p95 <300ms, error <1%
```

---

#### Load Test 3: Patient Analytics

**Scenario:** Simulate concurrent analytics queries

```javascript
// k6 test: analytics_load.js
// GET /api/v1/patient/{id}/analytics
// Expected: p95 <500ms, error <1%
```

---

#### Load Test 4: Data Console Queries

**Scenario:** Simulate concurrent read-only queries

```javascript
// k6 test: data_console_load.js
// POST /api/v1/data-console/query (SELECT only)
// Expected: p95 <1s (queries slower), error <1%
```

---

#### Load Test 5: Consent-Gated Endpoints

**Scenario:** Simulate concurrent consent checks

```javascript
// k6 test: consent_gated_load.js
// POST /api/v1/qeeg/upload (with/without consent mix)
// Expected: p95 <200ms (quick rejection), error <1%
```

---

#### Load Test 6: Audit Logging Volume

**Scenario:** Simulate concurrent audit events

```javascript
// k6 test: audit_logging_load.js
// Trigger audit events at load, verify logging keeps up
// Expected: <1% events dropped, logging latency <100ms
```

---

### Load Testing Execution

```bash
# 1. Run load tests sequentially
k6 run tests/load/login_load.js
k6 run tests/load/dashboard_load.js
k6 run tests/load/analytics_load.js
k6 run tests/load/data_console_load.js
k6 run tests/load/consent_gated_load.js
k6 run tests/load/audit_logging_load.js

# 2. Collect results (k6 outputs JSON)
# 3. Analyze results vs thresholds
# 4. Generate load test report
```

**Success criteria (Load overall):**
- [ ] 6/6 endpoints meet response time targets
- [ ] All endpoints <1% error rate
- [ ] All endpoints >100 req/sec throughput
- [ ] No database connection exhaustion
- [ ] Audit logging keeps up

---

## WORKSTREAM 4: REPORTING (3 Deliverables)

### Deliverable 1: E2E_SECURITY_LOAD_REPORT.md

**Contents:**
- E2E test results (16/16 scenarios, PASS/FAIL, execution time)
- Security test results (9/9 vectors, PASS/FAIL, findings)
- Load test results (6/6 endpoints, response times, throughput)
- Issues found (critical/non-critical, resolution status)
- Recommendations

---

### Deliverable 2: PILOT_RISK_REGISTER.md

**Contents:**
- Known issues found in testing
- Severity: Critical/High/Medium/Low
- Impact: Blocks pilot / Blocks production / Informational
- Mitigation: Resolved / Deferred / Accepted risk
- Status: OPEN / CLOSED

---

### Deliverable 3: WEEK_2_TESTING_PLAN.md

**This document** — Complete testing plan + execution guide

---

## TESTING TIMELINE (Week 2)

```
Mon 19 May:  E2E test development + execution
Tue 20 May:  E2E results compilation
Wed 21 May:  Security testing + manual verification
Thu 22 May:  Load testing
Fri 23 May:  Results compilation + reporting
```

---

## FINAL VERDICT (Conservative)

After all testing complete, verdict must be one of:

### ✅ READY FOR CONTROLLED PILOT
**Criteria:**
- E2E: 16/16 pass
- Security: 9/9 vectors pass
- Load: 6/6 endpoints pass
- No critical issues
- Risk register cleared

### ⏳ READY FOR STAGING ONLY
**Criteria:**
- E2E: 14-15/16 pass
- Security: 8-9/9 vectors pass
- Load: 5-6/6 endpoints pass
- Non-critical issues found, being addressed
- Can continue staging validation, not pilot-ready yet

### ❌ NOT READY
**Criteria:**
- E2E: <14/16 pass
- Security: <8/9 vectors pass
- Load: <5/6 endpoints pass
- Critical issues blocking
- Needs engineering fixes before retry

---

## IMPORTANT CONSTRAINTS

✅ **NO new product features** — Test coverage only  
✅ **Synthetic data only** — No real PHI  
✅ **Staging-only testing** — No production changes  
✅ **Conservative verdicts** — Pass high bar for pilot readiness  
✅ **Gate-controlled** — Verdict gates later compliance/production steps  

---

**Status:** Testing plan ready for Week 2 execution  
**Timeline:** May 19-23, 2026  
**Next:** Execute testing, compile results, issue verdict

