
# DeepSynaps Protocol Studio — Configuration Validation Report
## Generated: 2025
## Validator: Deep-Validation Engine

================================================================================
SUMMARY
================================================================================

| Category              | Files Checked | Status        | Issues |
|-----------------------|---------------|---------------|--------|
| GitHub Actions        | 16            | ⚠️ ISSUES     | 3      |
| Grafana Dashboards    | 3             | ⚠️ ISSUES     | 3      |
| AlertManager + Prom   | 4             | ✅ VALID      | 0      |
| Terraform             | 4             | ✅ VALID*     | 0*     |
| Vitest Config         | 1             | ⚠️ ISSUES     | 2      |
| **TOTAL**             | **28**        |               | **8**  |

*Terraform: 7 regex-flagged items were verified as FALSE POSITIVES (secret name
references and documentation strings, not actual hardcoded credentials).

================================================================================
1. GITHUB ACTIONS WORKFLOWS (16 files)
================================================================================

Status: ⚠️ ISSUES (3 found)

### ISSUE 1: CRITICAL — Hardcoded JWT Secret in CI Workflow
- **File:** `.github/workflows/ci.yml` (line 98)
- **Severity:** HIGH
- **Description:** `JWT_SECRET_KEY: e2e-ci-test-secret-not-for-production-use-only`
  is hardcoded directly in the workflow YAML. Even though it has a
  "not-for-production" suffix, this value is committed to the repository and
  could be used to forge JWT tokens in the CI test environment.
- **Recommendation:** Replace with `${{ secrets.CI_JWT_SECRET_KEY }}` or
  generate a random value at workflow runtime using:
  ```yaml
  - name: Generate test JWT secret
    run: echo "JWT_SECRET_KEY=$(openssl rand -hex 32)" >> $GITHUB_ENV
  ```

### ISSUE 2: CRITICAL — Hardcoded JWT Secret in E2E Workflow
- **File:** `.github/workflows/e2e.yml` (line 83)
- **Severity:** HIGH
- **Description:** Same hardcoded `JWT_SECRET_KEY` value as ci.yml. This is a
  duplicated secret that creates a second attack surface.
- **Recommendation:** Same fix as Issue 1. Also consider creating a shared
  composite action for test environment setup to avoid duplication.

### ISSUE 3: MEDIUM — Missing timeout-minutes on Job
- **File:** `.github/workflows/sast.yml` (job: `notify-override`)
- **Severity:** MEDIUM
- **Description:** The `notify-override` job lacks a `timeout-minutes` setting.
  Without a timeout, a hung job could consume runner resources for up to 6
  hours (GitHub default).
- **Recommendation:** Add `timeout-minutes: 10` (this job only runs echo and
  GitHub API calls, should complete in < 2 minutes).

### Best Practice Observations (non-blocking):
- 11 of 16 workflows (69%) are missing a top-level `permissions` block.
  Without explicit permissions, workflows default to write-all in older repos.
  Affected files: build.yml, ci.yml, dast.yml, deepsweeper-validate.yml,
  dependency-audit.yml, deploy-netlify.yml, e2e.yml, evidence-refresh.yml,
  frontend-coverage.yml, load-test.yml, sast.yml.
  **Recommendation:** Add `permissions: contents: read` at minimum.

- Several workflows use mutable action tags (`@master`, `@main`):
  * `aquasecurity/trivy-action@master` — dependency-audit.yml, security-scan.yml
  * `superfly/flyctl-actions/setup-flyctl@master` — deploy-blue-green.yml,
    deploy-netlify.yml, evidence-refresh.yml, rollback.yml
  * `trufflesecurity/trufflehog@main` — security-scan.yml
  * `returntocorp/semgrep-action@v1` — sast.yml (v1 is mutable)
  **Recommendation:** Pin to specific SHA hashes or immutable tags for supply
  chain security.

- `docker/setup-buildx-action@v3` used in deploy-blue-green.yml and
  security-scan.yml (v4 is available).

================================================================================
2. GRAFANA DASHBOARDS (3 JSON files)
================================================================================

Status: ⚠️ ISSUES (3 found)

### ISSUE 4: MEDIUM — Missing Dashboard UID
- **Files:** All 3 dashboard files
  * `deploy/grafana/dashboard-api.json` — Missing top-level `uid`
  * `deploy/grafana/dashboard-clinical.json` — Missing top-level `uid`
  * `deploy/grafana/dashboard-infrastructure.json` — Missing top-level `uid`
- **Severity:** MEDIUM
- **Description:** All three dashboards lack a top-level `uid` field. The UID is
  required for stable dashboard URLs, provisioning, and API references. Without
  a UID, Grafana auto-generates one on import, which breaks deep links and
  cross-dashboard navigation on every re-import.
- **Recommendation:** Add a stable, unique uid to each dashboard:
  ```json
  "uid": "deepsynaps-api",
  "uid": "deepsynaps-clinical",
  "uid": "deepsynaps-infra"
  ```

### Positive Findings:
- All dashboards have `title` fields set.
- All panels have `datasource` references (using `${prometheus}` variable).
- All dashboards have proper `schemaVersion: 39` (current).
- No hardcoded credentials found in any dashboard JSON.
- Tags are properly configured on all dashboards.

================================================================================
3. ALERTMANAGER + PROMETHEUS CONFIGS (4 files)
================================================================================

Status: ✅ VALID (0 issues)

### Files Checked:
- `deploy/alertmanager/alertmanager.yml` — PASS
- `deploy/alertmanager/alerts-clinical.yml` — PASS
- `deploy/alertmanager/alerts-system.yml` — PASS
- `deploy/prometheus.yml` — PASS

### Positive Findings:
- **alertmanager.yml**: Proper route tree with 6 receivers (PagerDuty + Slack),
  3 inhibit_rules for alert deduplication. All routing is well-structured.
- **alerts-clinical.yml**: 16 alerts across 7 groups, ALL have `runbook_url`
  annotations pointing to `docs.deepsynaps.io/runbooks/`. Severity labels are
  valid (`critical`, `warning`). No duplicate alert names.
- **alerts-system.yml**: 23 alerts across 7 groups, ALL have `runbook_url`
  annotations. Includes useful Fly.io-specific alerts.
- **prometheus.yml**: 9 scrape jobs properly configured with correct
  `static_configs`. Alertmanager target (`alertmanager:9093`) correctly
  configured with `api_version: v2`. Both rule files referenced.
- No hardcoded credentials in any Prometheus/AlertManager config.
- Total: 39 unique alerts, all with runbook URLs.

### Architecture Notes:
- Alert severity distribution: 11 critical, 27 warning, 1 info — appropriate
  for a clinical platform where patient safety alerts must page.
- Alert routing: Critical alerts go to PagerDuty; warnings go to Slack.
- Inhibit rules prevent redundant paging (e.g., if endpoint is down, don't
  also fire high-error-rate alert).

================================================================================
4. TERRAFORM CONFIGS (4 files)
================================================================================

Status: ✅ VALID (0 real issues; 7 false positives detected and cleared)

### Files Checked:
- `deploy/terraform/main.tf` — PASS
- `deploy/terraform/fly.tf` — PASS
- `deploy/terraform/variables.tf` — PASS
- `deploy/terraform/outputs.tf` — PASS

### False Positive Analysis:
The following 7 items were flagged by credential-scanning regex but verified as
SAFE upon manual inspection:

1. **main.tf:298** `DATABASE_URL_SECRET = "DEEPSYNAPS_DATABASE_URL"` — This is
   a **secret name reference** (the Fly secret key to look up), not a secret
   value. The actual connection string is stored in Fly secrets.

2. **main.tf:299** `ENCRYPTION_KEY_SECRET = "BACKUP_ENCRYPTION_KEY"` — Same as
   above; a secret name reference, not the encryption key itself.

3. **outputs.tf:299** `JWT_SECRET_KEY = "Secret key for JWT token signing..."` —
   This is a **documentation string** inside a `secrets_documentation` output.
   It describes what the secret is for; it does not contain the actual secret.

4. **outputs.tf:301** `STRIPE_SECRET_KEY = "Stripe secret key..."` — Same;
   documentation string, not an actual Stripe key.

5. **outputs.tf:302** `STRIPE_WEBHOOK_SECRET = "Stripe webhook signing secret"` —
   Same; documentation string.

6. **outputs.tf:306** `ANTHROPIC_API_KEY = "Anthropic API key for AI features"` —
   Same; documentation string.

7. **outputs.tf:307** `OPENAI_API_KEY = "OpenAI API key for Whisper..."` —
   Same; documentation string.

### Positive Findings:
- All sensitive variables properly marked with `sensitive = true` (e.g.,
  `fly_api_token`, `database_url`, `stripe_secret_key`).
- Proper variable validation rules (e.g., environment must be one of
  production/staging/dev).
- Backend state configured with S3 + DynamoDB locking.
- Remote secrets documented but not exposed in output values.
- 64 variables with proper type constraints and defaults where appropriate.

### Architecture Note:
- The `secrets_documentation` output (outputs.tf:294) lists all secret names
  that operators must configure. While this is not a credential leak, consider
  whether listing all secret names aids reconnaissance. This is a low-risk
  informational disclosure that aids operational onboarding.

================================================================================
5. VITEST CONFIG (1 file)
================================================================================

Status: ⚠️ ISSUES (2 minor issues found)

### ISSUE 5: MINOR — Missing `.next` directory in exclude patterns
- **File:** `apps/web/vitest.config.ts`
- **Severity:** LOW
- **Description:** The `test.exclude` array does not include `.next` (Next.js
  build output). While the `include` pattern (`src/**/*.test.ts`) makes it
  unlikely to pick up files from `.next/`, it's best practice to exclude build
  artifacts explicitly.
- **Recommendation:** Add `".next"` to the `test.exclude` array.

### ISSUE 6: MINOR — Missing `coverage` directory in exclude patterns
- **File:** `apps/web/vitest.config.ts`
- **Severity:** LOW
- **Description:** The `test.exclude` array does not include `coverage`.
  Previous coverage reports could potentially be picked up. Again, the
  `include` pattern mitigates this, but explicit exclusion is safer.
- **Recommendation:** Add `"coverage"` to the `test.exclude` array.

### Positive Findings:
- All 4 coverage thresholds correctly set to 90% (lines, branches, functions,
  statements).
- Proper coverage provider (`v8`) with multiple reporters (text, lcov, json,
  html).
- Comprehensive `coverage.exclude` list for generated code, demo fixtures,
  stories, WebGL studio code, and test infrastructure.
- Test environment set to `jsdom` for React Testing Library compatibility.
- Proper module resolution aliases matching `vite.config.ts`.
- Per-directory override system commented and documented.

================================================================================
PRIORITY-RANKED FIX LIST
================================================================================

| Prio | Issue | File | Effort | Risk if Unfixed |
|------|-------|------|--------|-----------------|
| P0   | Hardcoded JWT_SECRET_KEY (CI) | ci.yml:98 | 5 min | Token forgery in CI env |
| P0   | Hardcoded JWT_SECRET_KEY (E2E) | e2e.yml:83 | 5 min | Token forgery in CI env |
| P1   | Missing timeout-minutes | sast.yml | 1 min | 6-hour hung runner |
| P1   | Missing dashboard UIDs (x3) | *.json | 5 min | Broken dashboard links |
| P2   | Missing `.next`/`coverage` excludes | vitest.config.ts | 2 min | Test pollution risk |
| P3   | Missing permissions (11 workflows) | 11x .yml | 15 min | Excessive token scope |
| P3   | Mutable action tags (@master) | 6x .yml | 20 min | Supply chain attack |

================================================================================
FILES CHECKED (28 total)
================================================================================

.github/workflows/:
  build.yml, ci.yml, coverage.yml, dast.yml,
  deepsweeper-sweep.yml, deepsweeper-validate.yml, dependency-audit.yml,
  deploy-blue-green.yml, deploy-netlify.yml, e2e.yml, evidence-refresh.yml,
  frontend-coverage.yml, load-test.yml, rollback.yml, sast.yml,
  security-scan.yml

deploy/grafana/:
  dashboard-api.json, dashboard-clinical.json, dashboard-infrastructure.json

deploy/alertmanager/:
  alertmanager.yml, alerts-clinical.yml, alerts-system.yml

deploy/:
  prometheus.yml

deploy/terraform/:
  fly.tf, main.tf, outputs.tf, variables.tf

apps/web/:
  vitest.config.ts

================================================================================
VALIDATION COMPLETE
================================================================================
