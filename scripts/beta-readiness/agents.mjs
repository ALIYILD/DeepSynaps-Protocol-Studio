/**
 * Agent definitions for the DeepSynaps Studio beta-readiness sweep.
 *
 * Each agent is a specialist with a focused scope, a tool whitelist that
 * keeps it from wandering, and a strict output contract — the coordinator
 * aggregates these into a single readiness report.
 */

const SHARED_PRELUDE = `
You are part of the DeepSynaps Studio beta-readiness team. Repo root is
/Users/aliyildirim/DeepSynaps-Protocol-Studio. Live preview:
  Web: https://deepsynaps-studio-preview.netlify.app
  API: https://deepsynaps-studio.fly.dev

Output a final JSON block of shape:
  { "scope": "<your-scope>", "ok": <bool>, "passed": <int>, "failed": <int>,
    "findings": [{ "severity": "blocker|major|minor|info", "title": "...", "detail": "...", "where": "file:line | url" }] }
Wrap the JSON in <REPORT>...</REPORT>. No prose after the report.
`;

export const agents = {
  'api-probe': {
    description: 'Probes every documented FastAPI endpoint on the live preview API and reports response shape + status.',
    prompt: SHARED_PRELUDE + `
SCOPE: API contract probe.
Steps:
1. List endpoints from apps/api/app/main.py and apps/api/app/routers/*.py (look for @router.get/post/put/delete + APIRouter prefix).
2. For each endpoint, build a curl probe against https://deepsynaps-studio.fly.dev that:
   - Uses GET for read endpoints, POST with empty {} for write endpoints with body, skip path params
   - Reports HTTP status + content-type
3. Report a finding for any 5xx, any unexpected 404 on non-path-param routes, any HTML response on a JSON endpoint.
4. Also probe /health, /api/v1/healthz, /openapi.json — these MUST return 200.
5. Cap at 60 endpoints; pick a representative sample if more.

Use Bash for curl. Limit each curl to 5s timeout (--max-time 5).
`,
    tools: ['Bash', 'Read', 'Grep', 'Glob'],
  },

  'db-migration': {
    description: 'Validates Alembic migration chain integrity and SQLAlchemy model coherence.',
    prompt: SHARED_PRELUDE + `
SCOPE: DB & migrations.
Steps:
1. List apps/api/alembic/versions/*.py — verify each has revision + down_revision and the chain is acyclic + connected.
2. Identify any duplicate revision IDs or orphan heads (use grep on revision = / down_revision =).
3. Read apps/api/app/persistence/models.py — count Base subclasses, check each has __tablename__ + primary key.
4. Cross-check: for any model with a column referenced by a router (e.g. Annotation.deleted_at), verify it exists in the model.
5. Try running: cd apps/api && python3 -c "from app.persistence import models; print(len(models.__dict__))" — must succeed (proves schema imports cleanly).
6. Report any non-canonical chain links, missing columns, or import errors as blockers.
`,
    tools: ['Bash', 'Read', 'Grep', 'Glob'],
  },

  'backend-tests': {
    description: 'Runs the Python pytest suite and summarizes failures.',
    prompt: SHARED_PRELUDE + `
SCOPE: Backend unit + integration tests.
Steps:
1. cd apps/api && python3 -m pytest tests/ -x --tb=short --timeout=30 -q 2>&1 | tail -80
2. If pytest is missing, report "pytest not installed" as a blocker.
3. Parse the output: count passed/failed, capture first 5 failure summaries.
4. Report any failure as major (or blocker if it's a security/auth/data-integrity test).
Cap at 5 minutes.
`,
    tools: ['Bash', 'Read'],
  },

  'frontend-units': {
    description: 'Runs the apps/web node:test unit suite and summarizes failures.',
    prompt: SHARED_PRELUDE + `
SCOPE: Frontend unit tests.
Steps:
1. cd apps/web && npm run test:unit 2>&1 | tail -80
2. Parse: pass/fail counts, list failing test names.
3. Cross-check: each .test.js file in apps/web/src/ should appear in the test:unit script in package.json. Report any orphan test files.
`,
    tools: ['Bash', 'Read', 'Grep'],
  },

  'e2e-playwright': {
    description: 'Runs the Playwright e2e suite against the live preview and summarizes failures.',
    prompt: SHARED_PRELUDE + `
SCOPE: E2E Playwright suite.
Steps:
1. PLAYWRIGHT_BASE_URL=https://deepsynaps-studio-preview.netlify.app cd apps/web && npx playwright test --reporter=list --workers=2 --project=chromium 2>&1 | tail -60
2. Note: e2e/99-demo-page-diagnostic.spec.ts exists — it walks every page; its console output captures broken pages. Run it explicitly.
3. Parse: passed/failed counts, list failing specs.
Cap at 8 minutes.
`,
    tools: ['Bash', 'Read'],
  },

  'ui-walker': {
    description: 'Walks every page in demo mode, clicks every visible button, captures console errors and broken interactions.',
    prompt: SHARED_PRELUDE + `
SCOPE: UI button + interaction sweep (demo-mode clinician).
Steps:
1. Write a Playwright script /tmp/ui-walker.spec.ts that:
   - Lands on https://deepsynaps-studio-preview.netlify.app
   - Calls window.demoLogin('clinician-demo-token')
   - For each page in: dashboard, qeeg-analysis, mri-analysis, deeptwin, brain-twin, protocols, patients, clinical-hub, clinical-trials, clinical-notes, courses, assessments, assessments-hub, research-v2, research-evidence, biomarkers, brain-map-planner, monitor, documents-hub, calendar, careteam, billing, clinic-settings, admin
   - Navigate via /?page=<id>, wait 2.5s, capture console errors + 5xx responses
   - Click each visible button matching :visible button:not([disabled]) (cap 8 buttons per page), wait 500ms, capture errors after each
   - Report any "Something went wrong" body, any console error, any 5xx
2. Run: cd apps/web && npx playwright test /tmp/ui-walker.spec.ts --reporter=list --workers=1 --project=chromium 2>&1 | tail -60
Cap at 8 minutes.
`,
    tools: ['Bash', 'Write', 'Read'],
  },

  'ai-llm-quality': {
    description: 'Smoke-tests LLM endpoints for response shape and safety guardrails.',
    prompt: SHARED_PRELUDE + `
SCOPE: AI/LLM quality + safety guardrails.
Steps:
1. Identify LLM-backed endpoints by grepping apps/api/app/routers for "anthropic\\|openai\\|generate_ai_report\\|llm\\|chat_service".
2. For 3-5 representative endpoints, probe via curl with realistic minimal payloads. Document the response shape.
3. Check that each LLM response includes the required safety stamps: "decision-support", "not diagnostic", or similar regulatory footer.
4. Verify prompt-injection defense: check that apps/api/app/services/qeeg_context_extractor.py wraps untrusted input in delimiters.
5. Verify schema_id is set to "deepsynaps.report-payload/v1" or similar versioned id where applicable.
Report missing safety footers as blockers, missing prompt-injection guards as major.
`,
    tools: ['Bash', 'Read', 'Grep'],
  },

  'security-audit': {
    description: 'Surface security risks: dependency vulns, hardcoded secrets, missing auth gates.',
    prompt: SHARED_PRELUDE + `
SCOPE: Security audit.
Steps:
1. npm audit --json 2>&1 | head -30 — count high/critical vulns.
2. grep -rn -E "sk-[a-zA-Z0-9]{32,}|AKIA[0-9A-Z]{16}|ghp_[a-zA-Z0-9]{36}" apps/ packages/ services/ scripts/ — should be zero hits.
3. grep -rn "TODO.*(security|auth|todo.*fix.*before.*prod)" apps/api/app — list any.
4. For each router in apps/api/app/routers, verify it has at least one require_minimum_role or require_patient_owner call. Report any router without auth as major.
5. Check apps/api/app/main.py for CORS origin allowlist (not "*" in prod).
Report critical npm vulns + leaked secrets as blockers.
`,
    tools: ['Bash', 'Read', 'Grep', 'Glob'],
  },
};
