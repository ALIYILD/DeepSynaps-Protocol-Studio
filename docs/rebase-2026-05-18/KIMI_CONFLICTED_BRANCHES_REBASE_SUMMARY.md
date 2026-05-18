# Kimi/agent conflicted-branches rebase — summary

**Date:** 2026-05-18
**Mission:** Rebase the 5 conflicted branches from PR #987 onto current `main`, one at a time, without merging directly to main.
**Outcome:** 1 cleanly rebased + PR'd · 1 fully redundant · 3 BLOCKED (clinical/migration).

PR #987 (`integration/kimi-all-branches-review-2026-05-18`) remains open and is unaffected by this work — none of these rebase outputs need to be folded into it.

---

## 1. Branches successfully rebased

### B — `fix/e2e-guardian-portal-render-ready` → PR [#988](https://github.com/ALIYILD/DeepSynaps-Protocol-Studio/pull/988)
- 14 commits ahead, 13 patch-id matched against main and skipped automatically; 1 unique commit (`43493c50`).
- Conflict was **comment-only** in `apps/web/e2e/flows.spec.ts` — main already adopted the same `[data-page="guardian-portal"]` locator. Kept the explanatory comment.
- Final delta: `+10/−1` in one e2e spec.
- Verdict: **READY**.

## 2. Branches successfully rebased to zero unique commits (no PR)

### A — `fix/patient-portal-dual-review-fixture`
- 1 commit, identical fix already landed via PR #916 (`d400e385`). `git rebase --skip` left the branch at main; no work to push.
- Report: `REBASE_PATIENT_PORTAL_DUAL_REVIEW_FIXTURE_REPORT.md`.
- Recommendation: **delete `origin/fix/patient-portal-dual-review-fixture`** — fully superseded.

## 3. Branches BLOCKED (aborted per mission rule)

### C — `fix/api-migrations-agent-configs-lineage`
- 34 commits ahead, only 1 unique (`8338f37e`).
- Conflict in `apps/api/alembic/versions/100_agent_configs.py` — but the actual code is identical to main; the conflict is **docstring formatting only**.
- Main already has the lineage fix via **PR #943** (`a28a3743`) + merge revisions `b5278dd39fee`, `d1e2f3a4b5c6` (PR #972), and `104_merge_agent_configs_lineage`.
- Classification: **MIGRATION_RISK** (by rule) but functionally **REDUNDANT** (by content).
- Report: `REBASE_API_MIGRATIONS_AGENT_CONFIGS_LINEAGE_REPORT.md`.
- Recommendation: **delete `origin/fix/api-migrations-agent-configs-lineage`**. Do **not** merge — would attempt to re-add a migration revision already on main and break `alembic upgrade head`.

### D — `feat/qeeg-rag-draft-reports`
- 3 commits, all unique (`b6382cb8` + 2 tests).
- 15 conflict markers in `apps/api/app/routers/qeeg_analysis_router.py` plus auto-merged drift in 4 more files.
- Main *already has* `generate_qeeg_rag_report_endpoint` (line 1934 of that router) — a different agent shipped the same feature via the PR #889 chain today.
- Classification: **CLINICAL_GOVERNANCE_RISK** — clinical contract divergence (consent gating, citation provenance, audit-event keys, HITL sign-off path).
- Report: `REBASE_QEEG_RAG_DRAFT_REPORTS_REPORT.md`.
- Recommendation: **needs senior-clinician + governance review** before any cherry-pick. Most likely outcome: close the branch and salvage only the tests that pass against main's contract.

### E — `feat/evidence-aware-agents`
- 20 unique commits across evidence governance, citation safety, agent permissions, tenant scoping, Telegram routing, and patient-access wiring.
- 952 files differ from main (most are pytest temp `.gz`, but the source surface still spans `evidence_router.py`, `research_dataset_router.py`, `evidence_intelligence.py`, agent tools, and frontend evidence workspace).
- First commit alone conflicted in `responsive-shell.spec.ts`, `flows.spec.ts`, `ci.yml`. Subsequent commits would conflict across the clinical evidence stack.
- Classification: **CLINICAL_GOVERNANCE_RISK + AGENT_PERMISSIONS_RISK + EXPORT_GOVERNANCE_RISK**.
- Report: `REBASE_EVIDENCE_AWARE_AGENTS_REPORT.md`.
- Recommendation: **split into ≥6 focused PRs** by clinical theme (CI/tests, provenance UI, citation governance, tenant scoping, agent/Telegram, honest-state UX). Each PR rebased + reviewed individually.

---

## 4. Tests run

| Branch | Build | Typecheck | Branch-specific tests | Notes |
| --- | --- | --- | --- | --- |
| A | n/a | n/a | not needed | zero unique commits after skip |
| B | (spec line-count sanity) | n/a | playwright **not run** | comment-only diff; playwright would need a running server |
| C | n/a | n/a | n/a | aborted (migration rule) |
| D | n/a | n/a | n/a | aborted (clinical-governance rule) |
| E | n/a | n/a | n/a | aborted at first commit (clinical/agent rule) |

Mission-listed pytest / playwright / alembic / qEEG / evidence test runs were **not performed** for C/D/E because the rebases were aborted before any patch was applied, per rule.

For A and B (where unique content is comment/test-only), the wider suite isn't strictly required. The host environment still has the same blockers that PR #987 documented:
- Local uv venv is missing `prometheus_client` (pytest can't start)
- Frontend test runner needs `--localstorage-file` config fix

---

## 5. Safety / governance risks surfaced

- **Three branches (A, C, plus the qEEG endpoint half of D) are *redundant by content*** with PRs already on main (#916, #943, #889). The duplicate work suggests multiple agents implemented the same features in parallel without ancestry awareness. **Risk:** if any of these branches were force-merged with `--admin`, they'd either no-op or actively regress main's version of the same feature.
- **D and E touch the regulated clinical surface** (qEEG report governance, evidence citation provenance, HITL gating). Both must not be merged blind.
- **C is a migration file.** Merging it would put two revisions with the same `revision = "100_agent_configs"` ID into alembic, breaking upgrades.

---

## 6. Should PR #987 wait?

**No — PR #987 is independent.** It contains a defensive feature flag (`movement_analyzer_router`), 10 new frontend tests, and a test-runner timeout fix. The 5 conflicted branches reviewed here intersect with none of that surface. PR #987 can be merged on its own merits whenever you're ready (its own caveats are documented in its body — pytest/test:web are env-broken locally, build+typecheck+demo-boundary pass).

---

## 7. Recommended merge order

Following the mission brief's ordering rule (tests first → fixture → migration only if safe → qEEG only after governance review → evidence-aware last), translated to current state:

1. **PR #987** (integration branch — tests + feature flag) — safe, can land first.
2. **PR #988** (rebase of B — comment-only e2e doc) — safe, can land alongside #987.
3. **Close `origin/fix/patient-portal-dual-review-fixture`** (A) — no merge, just cleanup.
4. **Close `origin/fix/api-migrations-agent-configs-lineage`** (C) — no merge, just cleanup. Optional one-line docstring polish PR against main if anyone cares.
5. **D (`feat/qeeg-rag-draft-reports`)** — only after a senior clinician confirms whether main's `rag-report` endpoint already covers the branch's intent. Most likely: close and salvage tests.
6. **E (`feat/evidence-aware-agents`)** — only after splitting into ≥6 focused PRs and reviewing each clinical theme on its own.

---

## 8. Per-branch reports
- `REBASE_PATIENT_PORTAL_DUAL_REVIEW_FIXTURE_REPORT.md`
- `REBASE_E2E_GUARDIAN_PORTAL_RENDER_READY_REPORT.md`
- `REBASE_API_MIGRATIONS_AGENT_CONFIGS_LINEAGE_REPORT.md`
- `REBASE_QEEG_RAG_DRAFT_REPORTS_REPORT.md`
- `REBASE_EVIDENCE_AWARE_AGENTS_REPORT.md`

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
