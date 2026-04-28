# DeepSynaps Agent Marketplace — Status Snapshot

Generated: 2026-04-28

## What shipped tonight

| Phase | PR | Commit | What |
|---|---|---|---|
| v1 | #194 | `c4b8d4c` | Registry + 3 SKU agents + UI tiles + 26 tests |
| Phase 2 | #198 | `609197e` | ToolBroker — pre-fetch live clinic context into LLM prompt |
| v1.5 | #200 | `82a2456` | 4 patient-side agents (locked) + "Grounded in:" badge |
| Phase 3 | #202 | `69b352f` | AgentRunAudit DB table + `GET /api/v1/agents/runs` + Activity tab |
| Phase 2.5 | _in flight_ | _branch `feat/agent-tool-calls`_ | LLM tool-calls + two-step confirmation + `sessions.create` |

## Architecture

```
                ┌────────────────────────────────────────┐
                │  Marketplace UI (pages-agents.js)      │
                │  - Catalog tiles (clinic+patient)      │
                │  - Try-in-chat modal                   │
                │  - Activity tab (audit history)        │
                │  - Tool-call confirmation (Phase 2.5)  │
                └─────────────┬──────────────────────────┘
                              │ HTTP
                              ▼
        ┌──────────────────────────────────────────────┐
        │  /api/v1/agents/                              │
        │     GET  /                  list visible      │
        │     POST /{id}/run          run agent         │
        │     GET  /runs              audit history     │
        └─────────────┬────────────────────────────────┘
                      │
                      ▼
        ┌──────────────────────────────────────────────┐
        │  services/agents/                             │
        │     registry.py     AgentDefinition catalog   │
        │     runner.py       LLM dispatch + tool loop  │
        │     broker.py       pre-fetch context tools   │
        │     tools/          ToolDefinition registry   │
        │     tool_dispatcher (Phase 2.5)               │
        │     pending_calls   in-mem 5-min TTL store    │
        │     audit.py        writes AgentRunAudit row  │
        └─────────────┬────────────────────────────────┘
                      │
                      ▼
        ┌──────────────────────────────────────────────┐
        │  chat_service._llm_chat                       │
        │  (OpenRouter GLM → Anthropic fallback)        │
        └──────────────────────────────────────────────┘
```

## Current agent catalog (7)

### Clinic-side (3, live)

| ID | Name | £/mo | Min role | Package |
|---|---|---|---|---|
| `clinic.reception` | Clinic Reception | 99 | clinician | clinician_pro / enterprise |
| `clinic.reporting` | Clinic Reporting | 49 | admin | clinician_pro / enterprise |
| `clinic.aliclaw_doctor_telegram` | AliClaw Doctor (Telegram) | 79 | clinician | clinician_pro / enterprise |

### Patient-side (4, locked behind `pending_clinical_signoff`)

| ID | Name | £/mo | Safety contract |
|---|---|---|---|
| `patient.care_companion` | Care Companion | 19 | Halts + escalates on crisis signals |
| `patient.adherence` | Adherence Agent | 12 | Only reminds prescribed items in `<context>` |
| `patient.education` | Education Agent | 9 | Only answers from clinic-approved evidence |
| `patient.crisis` | Crisis Safety Agent | 0 (free) | Hard-scripted; never gives advice, only escalates |

## Tool registry (broker pre-fetch tools, 13)

**Read tools (10, live)** — `sessions.list`, `patients.search`, `forms.list`, `consent.status`, `outcomes.summary`, `treatment_courses.list`, `adverse_events.list`, `finance.summary`, `notes.list`, `tasks.list`

**Write tools (3, scaffolded)** — `sessions.create`, `sessions.cancel`, `notes.approve_draft`. After Phase 2.5: `sessions.create` becomes live (with two-step confirmation); the others stay registered but return "not yet implemented".

**Patient-side placeholder tools (8)** — all return `{"unavailable": true}` until clinical signoff.

## Audit table

`agent_run_audit` (alembic `048`):
- `id`, `created_at`, `actor_id` (FK → users.id, ON DELETE SET NULL), `clinic_id`
- `agent_id`, `message_preview` (200ch), `reply_preview` (500ch)
- `context_used_json`, `latency_ms`, `ok`, `error_code`

Indexed on `created_at`, `actor_id`, `clinic_id`, `agent_id`.

`GET /api/v1/agents/runs?limit=50&agent_id=<opt>` — clinician+, clinic-scoped, ordered by created_at DESC.

## Test coverage

| Suite | Tests |
|---|---|
| `test_agent_registry.py` | 26 |
| `test_agents_router.py` | 13 |
| `test_agent_toolbroker.py` | 18 |
| `test_agent_audit.py` | 17 |
| `test_agent_tool_calls.py` (Phase 2.5, in flight) | TBD |
| **Total backend agent tests** | **74+** |

Plus 98/98 web unit tests pass.

## Phase 4 candidates (not yet started)

Ordered by ROI × ship-feasibility:

1. **Stripe SKU wiring** — bind `monthly_price_gbp` to real per-clinic billing. Highest revenue impact. Risk: real money, needs careful testing.
2. **Patient agent activation flow** — clinical PM signoff workflow + per-clinic enable. Unlocks £40/mo per patient potential.
3. **More live write handlers** — `sessions.cancel`, `notes.approve_draft`, `tasks.create`. Each ~3h.
4. **Telegram channel adapter** — same agents, callable from Telegram (AliClaw Doctor's promised channel). Telegram bot infra already exists in repo.
5. **Cross-clinic ops dashboard** — super-admin view of audit stream + abuse detection (rate-spike alerts). Ops feature.
6. **Agent prompt versioning** — ship system_prompt edits without code deploy via DB-backed override. Useful when clinical PM tunes safety copy.
7. **Per-agent token budgets** — guard against runaway cost. `agent_run_audit.tokens_used` column + monthly cap per package.

## Files touched (cumulative across all 4 phases)

```
apps/api/app/services/agents/
  __init__.py
  registry.py
  runner.py
  broker.py
  audit.py
  tools/__init__.py
  tools/registry.py
  tool_dispatcher.py     (Phase 2.5)
  pending_calls.py       (Phase 2.5)
apps/api/app/routers/
  agents_router.py
apps/api/app/persistence/models.py     (AgentRunAudit added)
apps/api/alembic/versions/
  048_agent_run_audit.py
apps/api/tests/
  test_agent_registry.py
  test_agents_router.py
  test_agent_toolbroker.py
  test_agent_audit.py
  test_agent_tool_calls.py             (Phase 2.5)
apps/web/src/pages-agents.js           (Marketplace section + Activity tab + tool-call UI)
docs/agents/
  marketplace-status.md   (this file)
```
