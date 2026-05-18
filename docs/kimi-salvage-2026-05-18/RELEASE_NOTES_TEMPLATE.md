# Release Notes Template — DeepSynaps Protocol Studio

**Use this template for every beta release.**

---

## Release [VERSION] — [DATE]

### Summary

[1-2 paragraph overview of what this release contains and why it matters to clinicians.]

**Type:** [Patch / Minor / Major]  
**Target:** [Clinic beta / All clinics / Internal only]  
**Previous version:** [VERSION]  
**Database changes:** [Yes / No]  
**Migration required:** [Yes / No — run `alembic upgrade head`]  
**Materialized view refresh required:** [Yes / No — `POST /api/v1/system/materialized-views/refresh`]

---

### Clinical Workflow Changes

| # | Change | Module | Impact |
|---|--------|--------|--------|
| 1 | [Description] | [Module] | [None / Low / Medium / High] |
| 2 | [Description] | [Module] | [None / Low / Medium / High] |

**Clinician action required:** [Yes / No]  
If yes:
- [Step 1]
- [Step 2]

---

### Safety / Governance Changes

| # | Change | Category | Severity |
|---|--------|----------|----------|
| 1 | [Description] | [Safety / Consent / Audit / Evidence] | [Low / Medium / High] |

**New safety tests added:** [Yes / No]  
**E2E safety tests updated:** [Yes / No]

---

### Bug Fixes

| # | Bug ID | Description | Severity | Reporter |
|---|--------|-------------|----------|----------|
| 1 | BETA-NNN | [Description] | [Low / Medium / High] | [Name/Clinic] |

**Total bugs fixed:** [N]  
**Bug tickets closed:** [List of IDs]

---

### Known Limitations

| # | Limitation | Impact | Workaround | Planned Fix |
|---|-----------|--------|-----------|-------------|
| 1 | [Description] | [Low / Medium / High] | [Workaround] | [Sprint/version] |

**Limitations unchanged from previous release:** [N]

---

### Test Evidence

| Category | Count | Status |
|----------|-------|--------|
| Backend unit tests | [N] | [Pass / Fail] |
| E2E tests | [N] | [Pass / Fail] |
| Safety tests | [N] | [Pass / Fail] |
| Performance tests | [N] | [Pass / Fail] |

**Test command:** `pytest apps/api/tests/ -q`  
**E2E command:** `npx playwright test`  
**Test results link:** [CI link]

---

### Migration Notes

**Migration file:** `[alembic version file]`  
**Migration script:** `alembic upgrade head`  
**Rollback:** `alembic downgrade -1`

**Pre-migration checklist:**
- [ ] Database backup completed
- [ ] Staging migration verified
- [ ] Materialized view refresh scheduled

**Post-migration checklist:**
- [ ] Migration applied successfully
- [ ] Health check passes
- [ ] Materialized views refreshed
- [ ] Smoke tests pass

---

### Rollback Notes

**Rollback command:** `alembic downgrade [previous version]`  
**Rollback time estimate:** [N minutes]  
**Rollback risks:** [Description or "None"]

**When to rollback:**
- Critical safety issue detected post-deploy
- Performance degradation >50%
- >2 clinics report blocking issue

---

### Deployment Checklist

- [ ] Code reviewed
- [ ] Tests pass (backend + E2E)
- [ ] Staging deployed and verified
- [ ] Release notes approved
- [ ] Safety team sign-off
- [ ] Database migration tested
- [ ] Materialized views refreshed
- [ ] Clinic notification sent
- [ ] Monitoring dashboards checked
- [ ] Deployed to production
- [ ] Post-deploy smoke test passed

---

### Contact

- **Technical issues:** engineering@deepsynaps.io
- **Safety concerns:** safety@deepsynaps.io
- **General feedback:** beta-feedback@deepsynaps.io
