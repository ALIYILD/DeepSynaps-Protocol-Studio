<!-- Edited 2026-05-18 from kimi-salvage; original audit verdict EDIT. -->
# Release Notes Template — DeepSynaps Protocol Studio

**Use this template for every beta release.**

> **Deploy targets:** API on Fly.io (`deepsynaps-studio`), web on Netlify (`deepsynaps-studio-preview`). See `CLAUDE.md` for deploy commands.

---

## Release [VERSION] — [DATE]

### Summary

[1-2 paragraph overview of what this release contains and why it matters to clinicians.]

**Type:** [Patch / Minor / Major]  
**Target:** [Clinic beta / All clinics / Internal only]  
**Previous version:** [VERSION]  
**Database changes:** [Yes / No]  
**Migration required:** [Yes / No — run `alembic upgrade head`]

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
- [ ] Database backup completed (`DEEPSYNAPS_DATABASE_URL` target confirmed)
- [ ] Staging migration verified
- [ ] Health check passes: `curl -sf https://deepsynaps-studio.fly.dev/health`

**Post-migration checklist:**
- [ ] Migration applied successfully
- [ ] Health check passes
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

- [ ] Code reviewed and merged to `main`
- [ ] Tests pass (backend + E2E)
- [ ] API deployed: `bash scripts/deploy-preview.sh --api-only`
- [ ] Web deployed: `bash scripts/deploy-via-hook.sh`
- [ ] Release notes approved
- [ ] Safety team sign-off
- [ ] Database migration tested
- [ ] Clinic notification sent
- [ ] Monitoring dashboards checked
- [ ] Post-deploy smoke test: `curl -sf https://deepsynaps-studio.fly.dev/health`

---

### Contact

- **Technical issues:** engineering@deepsynaps.io
- **Safety concerns:** safety@deepsynaps.io
- **General feedback:** beta-feedback@deepsynaps.io
