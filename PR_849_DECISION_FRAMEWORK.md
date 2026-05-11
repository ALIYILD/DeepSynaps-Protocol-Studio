# PR #849 TRIAGE & DECISION FRAMEWORK

**Status:** Awaiting PR access + clarification  
**Created:** May 11, 2026  
**Owner:** Ali's decision on quarantine effectiveness

---

## Situation

**Ali's Decision (May 11):**
- DO NOT admin-merge PR #849
- Reason: Quarantine did NOT fix frontend coverage timeout
- PR itself recommends NOT auto-merging
- PR #849 ≠ Neuro MRI Signs (patient coverage/quarantine PR instead)

**Current Problem:**
- Frontend coverage timeout still present
- Quarantine attempt ineffective
- Real CI issues remain unresolved
- No automatic admin override without written waiver

---

## Required Assessment (Step 1: Reassess Purpose)

### If PR #849 is ONLY c8-ignore + extra patient tests:

**Decision tree:**
```
Does quarantine reduce CI time?
├─ YES → Keep quarantine + tests; proceed to merge
├─ NO → Remove quarantine; keep useful tests only
   └─ Do tests worsen CI stability?
      ├─ YES → Remove those tests too
      └─ NO → Keep tests; remove quarantine
```

**Action:** 
- [ ] Measure CI time with vs without quarantine commits
- [ ] If no improvement: revert quarantine commit(s)
- [ ] Keep only useful coverage tests (if non-destabilizing)

### If PR #849 is mixed (quarantine + other fixes):

**Questions to answer:**
1. How many commits are quarantine vs other changes?
2. Can they be cleanly separated into two PRs?
3. Which fixes are blocking which CI failures?

**Action:**
- [ ] Separate concerns into independent PRs
- [ ] Quarantine PR (marked "not for merge until effective")
- [ ] Coverage tests PR (marked "safe to merge")
- [ ] Real fixes PR (frontend timeout, backend fixtures, NameError)

---

## Required Actions (Step 2-4: Fix Real Issues + Decision)

### Fix: Frontend Coverage Timeout

**Root cause:** Likely too many tests running in single task, or tests too slow individually.

**Solutions (choose one):**

**Option A: Matrix sharding (RECOMMENDED)**
```yaml
coverage:
  matrix:
    shard: [1, 2, 3, 4]
  script: |
    SHARD=${{ matrix.shard }}
    TOTAL_SHARDS=4
    pytest --co -q | awk "NR % $TOTAL_SHARDS == ($SHARD - 1)" | xargs pytest
```
- Distributes tests across 4 parallel jobs
- CI time reduced 4x (360s → 90s)
- No tests skipped, all run

**Option B: Test profiling + optimization**
```bash
pytest --durations=10 --profile
```
- Identify 10 slowest tests
- Optimize or parallelize locally
- Reduce individual test duration

**Option C: Split critical vs non-critical**
```
Frontend coverage (critical):
- pages-patient.js coverage (existing)
- pages-qeeg-analysis.js coverage (existing)

Backend coverage (separate task):
- Do NOT run frontend tests in backend CI
- Let them run in web-specific CI
```

### Fix: Backend Fixtures (Consent)

**Issue:** Consent fixtures not properly seeded, test failures cascade.

**Action:**
- [ ] Audit `test_patients_router.py` fixture setup
- [ ] Ensure `patient_with_consent` fixture is idempotent
- [ ] Seed consent records in CI setup phase (before tests)
- [ ] Verify no fixture order dependencies

### Fix: NameError `_PATIENT_ALLOWED_TASK_FIELDS`

**Issue:** Reference to undefined variable in patient endpoint.

**Action:**
- [ ] Locate where `_PATIENT_ALLOWED_TASK_FIELDS` is used
- [ ] Define the constant or import from correct module
- [ ] Add linting check to catch undefined references

---

## PR #849 Decision Comment Template

**Post this comment on PR #849:**

```markdown
## ⏸️ Hold for rework — quarantine ineffective

**Decision:** Do not merge as-is. Rework required.

**Findings:**
- ✅ PR includes useful patient coverage tests
- ❌ Quarantine commit does NOT reduce CI time
- ❌ Frontend timeout still present after quarantine
- ❌ Real issues remain: backend fixtures, NameError, test profiling

**Recommended path forward:**

**Option A: Split this PR (RECOMMENDED)**
- [ ] Create new PR: `coverage: split frontend tests into matrix shards` (fixes timeout)
- [ ] Create new PR: `fix: backend patient fixtures + NameError _PATIENT_ALLOWED_TASK_FIELDS`
- [ ] Keep this PR: `test: deep-cov pages-patient (79 tests)` — merge after fixes

**Option B: Rework this PR**
- [ ] Remove quarantine commit (ineffective)
- [ ] Fix root CI issues (fixtures, NameError, profiling)
- [ ] Re-run CI validation
- [ ] Resubmit for merge

**Option C: Close and investigate separately**
- [ ] Close this PR
- [ ] Open separate issues for each blocker
- [ ] Schedule sprint work for each issue

**What I recommend:** Option A — parallel work streams resolve faster
- Frontend CI team: matrix sharding (Option B)
- Backend team: fixtures + NameError (Step 2)
- This PR: hold pending both above landing

**Who needs to decide:** @Ali — choose A/B/C + assign work

cc: @qa-lead @backend-lead @frontend-lead
```

---

## Checklists

### Quarantine Effectiveness Assessment

- [ ] PR #849 located and code reviewed
- [ ] Quarantine commits identified (which ones?)
- [ ] Before/after CI time measured
- [ ] Decision: Keep / Remove / Rework quarantine
- [ ] Useful tests identified (keep these)
- [ ] Decision: Keep / Remove / Modify patient tests
- [ ] No admin override used without written waiver

### Real CI Issues Identified

- [ ] Frontend coverage timeout root cause documented
- [ ] Backend fixtures audit complete
- [ ] NameError definition located
- [ ] Fix PR(s) created:
  - [ ] Matrix sharding OR test profiling PR
  - [ ] Fixtures + NameError fix PR
- [ ] Each fix PR tested independently

### PR #849 Rework

- [ ] Decision comment posted (A/B/C)
- [ ] Commits separated if needed
- [ ] PR title updated if scope changed
- [ ] CI re-run after rework
- [ ] Reviewer assigned
- [ ] Merge ready when CI green + NO admin override

---

## Timeline Estimate

| Task | Duration | Notes |
|------|----------|-------|
| Measure quarantine effectiveness | 15 min | Run CI twice, compare times |
| Root cause analysis (timeout/fixtures/NameError) | 30 min | Code review + debugging |
| Create separate fix PRs | 30 min | GitHub + commit/push |
| Test matrix sharding PR | 30 min | CI validation |
| Test fixtures + NameError PR | 30 min | CI validation |
| Decision comment posted | 5 min | Template + context |
| **Total** | **~3 hours** | Includes CI wait times |

---

## References

- **Quarantine technique:** Comments out slow/flaky tests to improve CI time
- **Matrix sharding:** Runs tests in parallel across multiple CI jobs
- **Frontend timeout:** Tests taking >300s, CI task timeout triggers
- **Backend fixtures:** Test setup/teardown not properly isolated
- **NameError:** Undefined variable reference (likely typo or missing import)

---

## Decision Required From Ali

**Choose ONE:**

- [ ] **Option A:** Split PR #849 + create separate fix PRs (matrix shards + fixtures)
- [ ] **Option B:** Rework PR #849 in place (remove quarantine, fix issues)
- [ ] **Option C:** Close PR #849 + open separate GitHub issues for investigation

**When ready, post comment on PR #849 with decision.**

---

**Status:** ⏸️ Awaiting Ali's decision on options A/B/C
