# Branch Cleanup Analysis - DeepSynaps Studio

## 🔴 DUPLICATES (Same fix, different branch names)

### Group 1: BaseModel Import in Assessments V2
- `fix/api-router-basemodel-import-assessments-v2`
- `fix/assessments-v2-basemodel-import`
- **Status:** Both OPEN, Same commit (2026-05-14)
- **Recommendation:** Keep `fix/api-router-basemodel-import-assessments-v2`, delete the other

### Group 2: Agent Config Migration Restore
- `fix/api-migrations-agent-configs-lineage`
- `fix/restore-agent-configs-migration`
- **Status:** Both OPEN, Same purpose
- **Recommendation:** Consolidate, keep one name

### Group 3: Guardian Portal E2E Render Ready
- `fix/guardian-portal-render-ready`
- `fix/e2e-guardian-portal-render-ready`
- **Status:** Both OPEN, Same test fix
- **Recommendation:** Keep E2E-prefixed version for clarity, delete plain version

### Group 4: Web Unit Test Timeout Fixes
- `fix/web-unit-timeout-source`
- `fix/web-unit-timeout-source-2`
- `fix/web-unit-timeout-bisect`
- **Status:** All OPEN, progressive bisect/fix iterations
- **Recommendation:** Review commits; likely can squash into 1-2 branches

---

## ✅ SAFE TO DELETE (Already Merged to Main)
- `feat/clinical-bug-fixes` ✓

---

## 📊 BRANCH SUMMARY

**Merged:** 1 branch
```
- feat/clinical-bug-fixes
```

**Open (Active):** 17 branches
```
Active Development:
  - feat/ai-core-pages
  - feat/evidence-aware-agents
  - feat/production-infrastructure

API Fixes:
  - fix/api-deploy-fly-grace-period
  - fix/api-migrations-agent-configs-lineage (DUPLICATE)
  - fix/api-router-basemodel-import-assessments-v2 (DUPLICATE)
  - fix/assessments-v2-basemodel-import (DUPLICATE)
  - fix/restore-agent-configs-migration (DUPLICATE)

Test/E2E Fixes:
  - fix/e2e-guardian-portal-render-ready (DUPLICATE)
  - fix/guardian-portal-render-ready (DUPLICATE)
  - fix/patient-portal-dual-review-fixture
  - fix/web-unit-assertion-drift
  - fix/web-unit-final-source-gaps-v2
  - fix/web-unit-jsdom-cleanup
  - fix/web-unit-timeout-bisect (DUPLICATE GROUP)
  - fix/web-unit-timeout-source (DUPLICATE GROUP)
  - fix/web-unit-timeout-source-2 (DUPLICATE GROUP)
```

---

## 🎯 CLEANUP PLAN

### Step 1: Identify Blocker
Need to know from team:
- Which duplicate branch name to keep for each group?
- Are the timeout-source branches progressive (keep all) or redundant?

### Step 2: Delete Safely
```bash
# Delete merged branch
git push origin --delete feat/clinical-bug-fixes

# Delete duplicates (after approval)
git push origin --delete fix/assessments-v2-basemodel-import
git push origin --delete fix/restore-agent-configs-migration
git push origin --delete fix/guardian-portal-render-ready
```

### Step 3: Verify
- Confirm no broken links in PRs
- Check CI status post-cleanup

---

## Clinical Relevance
Duplicate branches don't affect production, but they:
- ❌ Slow down branch reviews
- ❌ Create confusion about which fix is active
- ❌ Make cherry-picking/backports harder for patches
