# Branch cleanup report — 2026-05-18

After the integration sweep documented in `KIMI_ALL_BRANCHES_INTEGRATION_REPORT.md` and the rebase sweep in `KIMI_CONFLICTED_BRANCHES_REBASE_SUMMARY.md`, the remote tree was pruned to the work that still needs attention.

## Deleted (8)

| Branch | Why safe to delete |
| --- | --- |
| `feat/ai-core-pages` | `git merge` reported "Already up to date" against current main — content reachable via squash-merge elsewhere. |
| `feat/production-infrastructure` | Same — already reachable from main. |
| `chore/delete-literature-local-knowledge-orphan-tests` | 0 commits ahead of main; was an ancestor. |
| `docs/post-salvage-governance-lock-2026-05-17` | 0 commits ahead of main; was an ancestor. |
| `fix/e2e-guardian-portal-render-ready` | Content landed via merged PR #988 (rebased onto current main as comment-only change to `flows.spec.ts`). |
| `fix/guard-movement-analyzer-router` | Content landed via merged PR #987 (`movement_analyzer_router` is now feature-flag-gated in `apps/api/app/main.py`). |
| `fix/web-unit-timeout-bisect` | Content landed via merged PR #987 (test-runner timeout quarantine in `apps/web/scripts/run-unit-tests.mjs`). |
| `test/frontend-coverage-branch-threshold` | Content landed via merged PR #987 (10 new frontend test files restoring coverage threshold). |

Earlier in the same session (in the rebase sweep), these were also deleted:

| Branch | Why |
| --- | --- |
| `fix/patient-portal-dual-review-fixture` | Same fix already landed via PR #916 (`d400e385`). `git rebase --skip` left 0 unique commits. |
| `fix/api-migrations-agent-configs-lineage` | Migration `100_agent_configs.py` already on main via PR #943 (`a28a3743`) + merge revisions `b5278dd39fee`, `d1e2f3a4b5c6`, `104_merge_agent_configs_lineage`. Branch's conflict was docstring-only. |

## Intentionally preserved (2)

| Branch | Status | Why preserved |
| --- | --- | --- |
| `feat/qeeg-rag-draft-reports` | 🛡 BLOCKED | Clinical-governance risk. Main already added `generate_qeeg_rag_report_endpoint` via PR #889 today; the branch's commit conflicted across 15 markers in `qeeg_analysis_router.py`. Needs senior-clinician + governance review to determine which side is authoritative before any cherry-pick. See `REBASE_QEEG_RAG_DRAFT_REPORTS_REPORT.md`. |
| `feat/evidence-aware-agents` | 🛡 BLOCKED | Clinical + agent governance + export governance risk. 20 unique commits touching evidence consent, citation provenance, patient access, agent permissions, Telegram routing, tenant scoping. Needs splitting into ≥6 themed PRs before any can land. See `REBASE_EVIDENCE_AWARE_AGENTS_REPORT.md`. |

## Current remote inventory (excluding `archive/*`)

```
origin/feat/evidence-aware-agents     ← BLOCKED
origin/feat/qeeg-rag-draft-reports    ← BLOCKED
origin/main
origin/master
```

## Remaining governance-risk surfaces

Both preserved branches carry **clinical governance** risk by their nature, not because of misbehaviour. The session-wide pattern was:

- Multiple Kimi/agent sessions implemented overlapping features in parallel (qEEG RAG reports, agent_configs migration, patient-portal dual-review fixture) without ancestry awareness, so each landed twice — once on a feature branch, once on a PR that reached main first.
- Where the two implementations agree, the branch becomes redundant (most of what we deleted).
- Where they disagree on clinical contract (consent gating, citation provenance, audit-event keys, HITL sign-off), the divergence cannot be resolved by a rebase — only by a human clinical-governance review.

## Recommendation

- **No further automated work** on `feat/qeeg-rag-draft-reports` or `feat/evidence-aware-agents` until they have explicit owners and a governance reviewer.
- Run the existing **deepsweeper-sweep** / **deepsweeper-validate** workflows (already on main) periodically to catch the *next* parallel-implementation drift before it gets to this state.
- Consider adding a guardrail in agent prompts: "before opening a PR for feature X, grep main for an endpoint or model with the same name; if it exists, surface to the human instead of duplicating it."

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
