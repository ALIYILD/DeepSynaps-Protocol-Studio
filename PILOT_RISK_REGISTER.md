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

### Status: [Template Ready for Week 2 Execution]

No issues logged yet. Issues will be added as testing progresses (May 19-23).

---

## PILOT READINESS GATES

### Gate 1: Critical Issues
**Requirement:** 0 critical issues
**Status:** ⏳ Pending testing

### Gate 2: Pilot-Blocking Issues
**Requirement:** 0 issues marked "Blocks Pilot"
**Status:** ⏳ Pending testing

### Gate 3: Production-Blocking Issues
**Requirement:** All production-blocking issues have clear mitigation
**Status:** ⏳ Pending testing

---

## ISSUE SUMMARY

| Severity | Count | Blocks | Status |
|----------|-------|--------|--------|
| Critical | 0 | Pilot | Pending |
| High | 0 | Pilot/Production | Pending |
| Medium | 0 | Production | Pending |
| Low | 0 | N/A | Pending |

**Verdict:** ⏳ Pending Week 2 testing

---

## FINAL VERDICT

- [ ] ✅ **READY FOR CONTROLLED PILOT** — No critical issues, all blocked resolved
- [ ] ⏳ **READY FOR STAGING ONLY** — Non-critical issues being addressed
- [ ] ❌ **NOT READY** — Critical or unresolved pilot-blocking issues

**Status:** Pending testing results (May 19-23, 2026)

