# PILOT RISK REGISTER
## DeepSynaps Protocol Studio - Known Issues & Mitigation

**Date:** [To be filled during testing]  
**Status:** Risk tracking template  
**Prepared for:** Engineering + QA + Clinical teams

---

## OVERVIEW

This register tracks all known issues found during Week 2 testing, including:
- Issue description
- Severity (Critical/High/Medium/Low)
- Impact (Blocks pilot / Blocks production / Informational)
- Root cause (if identified)
- Mitigation strategy
- Status (OPEN / CLOSED / ACCEPTED RISK)
- Owner + ETA

**Important:** Issues must be documented DURING testing, not deferred to end.

---

## RISK ASSESSMENT MATRIX

### Severity Levels

| Level | Definition | Example |
|-------|-----------|---------|
| **Critical** | System crash, data loss, safety violation | SQL injection success, consent bypass, data leak |
| **High** | Major feature broken, security concern | Slow response (>5s), cross-clinic access, wrong audit trail |
| **Medium** | Feature degraded, UX issue, minor security concern | Consent message unclear, slow load (2-5s), optional field masked incorrectly |
| **Low** | Minor UX issue, cosmetic problem, documentation gap | Button text unclear, color contrast low, missing label |

### Impact Levels

| Impact | Definition | Blocks | Action |
|--------|-----------|--------|--------|
| **Blocks Pilot** | Cannot proceed with pilot until fixed | Pilot gate | FIX before pilot |
| **Blocks Production** | Can pilot but cannot go production until fixed | Production gate | FIX before production |
| **Informational** | Good to know, no gate impact | N/A | Document, defer if low priority |

---

## ISSUE TEMPLATE

For each issue found, complete this section:

```
ISSUE #[N]: [Brief title]

Severity: Critical / High / Medium / Low
Impact: Blocks Pilot / Blocks Production / Informational
Status: OPEN / IN PROGRESS / RESOLVED / ACCEPTED RISK

Description:
[Detailed description of the issue]

Steps to Reproduce:
1. [Step 1]
2. [Step 2]
3. ...

Expected Behavior:
[What should happen]

Actual Behavior:
[What actually happens]

Evidence:
[Screenshots, logs, test results, etc.]

Root Cause:
[Technical root cause, if known]

Mitigation Strategy:
[How to fix or work around]

Estimated Effort:
[Hours to fix]

Owner:
[Engineer responsible]

Target Resolution Date:
[When it should be fixed]

Resolution:
[Actual fix applied or decision made]

Resolved Date:
[When actually fixed]
```

---

## KNOWN ISSUES LOG

### Issue #1: [Template - Delete Before Submission]

**Severity:** High  
**Impact:** Blocks Pilot  
**Status:** OPEN

**Description:**
qEEG upload response time exceeds acceptable threshold during load testing

**Steps to Reproduce:**
1. Run load test: k6 run qeeg_upload_load.js
2. Observe response times
3. Extract p95 response time

**Expected Behavior:**
p95 response time < 500ms

**Actual Behavior:**
p95 response time = 2300ms (4.6x threshold)

**Evidence:**
```
k6 output:
  http_req_duration..............: avg=1523ms, p95=2300ms, p99=3100ms
  Upload scenario failing at 10 VUs
```

**Root Cause:**
qEEG processing performs synchronous ML inference (not async). Blocks request thread during inference.

**Mitigation Strategy:**
1. Convert qEEG processing to async queue
2. Return 202 Accepted immediately
3. Send results via webhook when ready
4. Estimated effort: 8 hours

**Owner:** Backend team  
**Target Resolution:** May 21, 2026  
**Status:** OPEN → [Update as work progresses]

---

### Issue #2: [Template - Delete Before Submission]

**Severity:** Medium  
**Impact:** Blocks Production  
**Status:** OPEN

**Description:**
PHI masking inconsistent across different output formats

**Steps to Reproduce:**
1. Query patient names via Data Console (masked)
2. Export same query as CSV
3. Compare output

**Expected Behavior:**
Patient names masked in both Console and CSV export

**Actual Behavior:**
Console shows masked names, CSV shows raw names

**Evidence:**
```
Data Console output: Patient_001, Patient_002, ...
CSV export output: John Doe, Jane Smith, ...
```

**Root Cause:**
CSV export uses different code path, not applying masking layer

**Mitigation Strategy:**
1. Apply masking layer to all export formats
2. Add test case for each format (CSV, JSON, Excel)
3. Estimated effort: 3 hours

**Owner:** Backend team  
**Target Resolution:** May 22, 2026  
**Status:** OPEN

---

### Issue #3: [Add Your Issues Below]

[New issues discovered during testing should be added here]

---

## ISSUE SUMMARY

### By Severity

| Severity | Count | Status | Blocks |
|----------|-------|--------|--------|
| Critical | 0 | - | - |
| High | 0 | - | - |
| Medium | 0 | - | - |
| Low | 0 | - | - |
| **Total** | **0** | - | **?** |

### By Impact

| Impact | Count | Status | Action |
|--------|-------|--------|--------|
| Blocks Pilot | 0 | - | Fix before pilot |
| Blocks Production | 0 | - | Fix before production |
| Informational | 0 | - | Document, can defer |

### By Status

| Status | Count | ETA |
|--------|-------|-----|
| OPEN | 0 | TBD |
| IN PROGRESS | 0 | May 21-23 |
| RESOLVED | 0 | May 19-23 |
| ACCEPTED RISK | 0 | - |

---

## PILOT READINESS DECISION BASED ON RISK REGISTER

### Gate 1: Critical Issues
**Requirement:** 0 critical issues

**Status:** ✅ [Update: 0 found or BLOCKED if >0]

---

### Gate 2: Pilot-Blocking Issues
**Requirement:** 0 issues marked "Blocks Pilot"

**Status:** ✅ [Update: 0 found or BLOCKED if >0]

---

### Gate 3: Production-Blocking Issues
**Requirement:** All production-blocking issues have clear mitigation (can be deferred)

**Status:** ✅ [Update: all have mitigation or BLOCKED if >0 without mitigation]

---

## EXECUTIVE SUMMARY

### Week 2 Testing Results

**Total issues found:** ___

**Pilot readiness:**
- [ ] ✅ **READY FOR CONTROLLED PILOT** — No critical issues, pilot-blocking issues resolved
- [ ] ⏳ **READY FOR STAGING ONLY** — Non-critical issues, can proceed but not pilot-ready
- [ ] ❌ **NOT READY** — Critical or unresolved pilot-blocking issues

**Production readiness:**
- [ ] ✅ **Ready for compliance review** — All production gates clear
- [ ] ⏳ **Blocked on production issues** — Issues found, clear mitigation path
- [ ] ❌ **Major concerns** — Multiple unresolved production issues

---

## ISSUE ESCALATION PATH

**If critical issue found:**
1. Halt testing immediately
2. Notify engineering lead + clinical lead
3. Document severity + impact
4. Determine: Fix now vs. Accept risk vs. Block pilot
5. If fix: Resume testing after resolution
6. If accept: Document acceptance + risk mitigation
7. If block: Halt pilot until next cycle

---

## APPROVALS

**QA Lead:**
Name: ________________________  
Signature: ________________________  Date: __________
Comments: _______________________________________________

---

**Engineering Lead:**
Name: ________________________  
Signature: ________________________  Date: __________
Comments: _______________________________________________

---

**Clinical Lead (if critical/high severity issues):**
Name: ________________________  
Signature: ________________________  Date: __________
Comments: _______________________________________________

---

## NEXT STEPS

1. **During testing (May 19-22):** Log issues in real-time
2. **After testing (May 23):** Finalize issue list + mitigation
3. **After mitigation (May 24+):** Re-run affected tests
4. **Final verdict:** Ready for pilot / Ready for staging / Not ready
5. **If ready:** Proceed to pilot execution (May 26+)

---

**Status:** Risk register template ready for Week 2 execution  
**Next:** Fill in issues as discovered during testing

