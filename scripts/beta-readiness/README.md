# DeepSynaps Studio — Beta-Readiness Agent Team

8 specialist agents run in parallel via the Claude Agent SDK to validate
that the studio is ready to serve customers. Each agent has a narrow
scope, a tool whitelist, and emits a structured `<REPORT>` JSON block
that the orchestrator merges into a single Markdown report under
`docs/beta-readiness/auto-sweep-<timestamp>.md`.

## Agents

| Agent | Scope |
|---|---|
| `api-probe` | Probes every documented FastAPI endpoint on the live preview |
| `db-migration` | Validates Alembic chain integrity + SQLAlchemy model coherence |
| `backend-tests` | Runs `pytest` and parses failures |
| `frontend-units` | Runs `npm run test:unit` (node:test) and parses failures |
| `e2e-playwright` | Runs Playwright e2e suite against preview URL |
| `ui-walker` | Walks every page in demo mode, clicks visible buttons, captures errors |
| `ai-llm-quality` | Smoke-tests LLM endpoints; checks safety stamps + prompt-injection guards |
| `security-audit` | npm audit, secret scan, missing-auth gate scan, CORS allowlist |

## Run

```bash
# all agents in parallel (~6-10 min wall clock)
node scripts/beta-readiness/run.mjs

# subset
node scripts/beta-readiness/run.mjs api-probe ui-walker

# single
node scripts/beta-readiness/run.mjs backend-tests
```

Requires `ANTHROPIC_API_KEY` in env, or login via the bundled `claude` CLI
(`npx claude login`).

## Verdict

Exit code 0 if no blockers, 1 otherwise. Verdict line in the report:

- **READY for beta** — no blockers, no majors
- **CONDITIONAL — majors should be triaged** — no blockers, some majors
- **NOT READY — blockers must clear** — at least one blocker
