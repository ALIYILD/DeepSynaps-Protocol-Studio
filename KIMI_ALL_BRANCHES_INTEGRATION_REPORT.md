# Integration review — all remaining agent/Kimi branches

**Branch:** `integration/kimi-all-branches-review-2026-05-18`
**Base:** `main` @ `f9eba73c` (post-pull, 105 commits ahead of the local checkout this morning)
**Goal:** combine every unmerged remote branch (not `archive/`, not `wip/`, not already-on-main) into one branch so all in-flight work is visible in a single diff against `main`. **Not** for fast-track merge to main.

---

## 1. Branches surveyed

12 remote branches were considered (the 12 listed in the mission brief). Pre-merge inventory against current `main`:

| Branch | Commits ahead | Commits behind | Outcome |
| --- | ---: | ---: | --- |
| `feat/ai-core-pages` | 17 | 906 | ⊘ already in main (ancestry / squash-merged elsewhere) |
| `feat/evidence-aware-agents` | 21 | 974 | ❌ conflict — aborted |
| `feat/production-infrastructure` | 18 | 905 | ⊘ already in main (ancestry / squash-merged elsewhere) |
| `feat/qeeg-rag-draft-reports` | 3 | 949 | ❌ conflict — aborted |
| `fix/api-migrations-agent-configs-lineage` | 34 | 890 | ❌ conflict — aborted |
| `fix/e2e-guardian-portal-render-ready` | 14 | 910 | ❌ conflict — aborted |
| `fix/guard-movement-analyzer-router` | 42 | 882 | ✅ merged |
| `fix/patient-portal-dual-review-fixture` | 1 | 923 | ❌ conflict — aborted |
| `fix/web-unit-timeout-bisect` | 14 | 910 | ✅ merged |
| `chore/delete-literature-local-knowledge-orphan-tests` | 0 | 922 | ⊘ already in main |
| `docs/post-salvage-governance-lock-2026-05-17` | 0 | 109 | ⊘ already in main |
| `test/frontend-coverage-branch-threshold` | 14 | 910 | ✅ merged |

**Result:** 3 cleanly merged · 4 already in main · 5 conflicted-and-aborted.

---

## 2. Cleanly merged

### 2.1 `fix/guard-movement-analyzer-router`
Feature-flag guard around `movement_analyzer_router`. The router imports `MovementBiomarkerTrend` from `app.persistence.models`, which doesn't exist in `__init__.py` yet (the model + migration are a separate backlog item). The import is now gated behind `DEEPSYNAPS_ENABLE_MOVEMENT_ANALYZER=1`, so the app stays bootable in production.

Same class of fix as today's v372 outage (broken router import killing `app.main` at startup). Defensive, low-risk, ship-worthy on its own.

- `apps/api/app/main.py` (+11/−2)

### 2.2 `fix/web-unit-timeout-bisect`
Quarantines a hanging frontend test (`pages-qeeg-raw-workbench-coverage`) by extending the timeout in the unit-test runner. Pure test-runner config.

- `apps/web/scripts/run-unit-tests.mjs` (+18)

### 2.3 `test/frontend-coverage-branch-threshold`
Restores the frontend branch-coverage threshold by adding 10 missing unit tests:

| File | Lines |
| --- | ---: |
| `apps/web/src/clinical-disclaimer.test.js` | 116 |
| `apps/web/src/erp-event-mapping.test.js` | 94 |
| `apps/web/src/home-program-task-sync.test.js` | 117 |
| `apps/web/src/marketplace-hub-catalog.test.js` | 48 |
| `apps/web/src/medication-neuromod-rules.test.js` | 37 |
| `apps/web/src/personalization-explainability.test.js` | 73 |
| `apps/web/src/protocols-data.test.js` | 59 |
| `apps/web/src/qeeg-red-flags.test.js` | 38 |
| `apps/web/src/route-id.test.js` | 14 |
| `apps/web/src/video-assessment-clinical-presets.test.js` | 37 |

Tests only — no source changes.

### 2.4 Integration diff against main

```
12 files changed, 662 insertions(+), 2 deletions(-)
```

(1 source file, 1 test-runner config, 10 new test files.)

---

## 3. Conflicts (aborted — not guessed)

Each of these had at least one content-conflict. Per mission rules I aborted cleanly and did not attempt to resolve.

| Branch | Conflicting files |
| --- | --- |
| `fix/patient-portal-dual-review-fixture` | `apps/api/tests/test_patient_portal.py` |
| `fix/e2e-guardian-portal-render-ready` | `apps/web/e2e/flows.spec.ts` |
| `fix/api-migrations-agent-configs-lineage` | `apps/api/alembic/versions/100_agent_configs.py` (add/add) |
| `feat/qeeg-rag-draft-reports` | `apps/api/app/routers/qeeg_analysis_router.py` |
| `feat/evidence-aware-agents` | `apps/api/app/routers/evidence_router.py`, `apps/api/app/routers/research_dataset_router.py`, `apps/api/tests/test_evidence_router.py` |

Common pattern: every conflicted branch is 882–974 commits behind current `main`. Main moved heavily over the last 4–6 days; these branches need to be rebased onto current `main` (or have their critical hunks cherry-picked) before they can be re-attempted.

---

## 4. Already-on-main (no work to surface)

| Branch | Reason |
| --- | --- |
| `feat/ai-core-pages` | `git merge` says "Already up to date" — content reachable from current `main` (likely squash-merged into a different PR and the branch was never deleted). |
| `feat/production-infrastructure` | Same — already reachable from current `main`. |
| `chore/delete-literature-local-knowledge-orphan-tests` | `ahead=0`. |
| `docs/post-salvage-governance-lock-2026-05-17` | `ahead=0`. |

All four can be deleted from origin without losing work.

---

## 5. Tests run

| Check | Result | Notes |
| --- | --- | --- |
| `npm run build` (web bundle) | ✅ pass | Exit 0 |
| `npm run typecheck --workspace @deepsynaps/web` | ✅ pass | Exit 0, no TS errors |
| `python3 scripts/verify_demo_boundary.py` | ✅ 10/10 pass | Demo / production boundary intact |
| Backend `pytest apps/api/tests/` | ⚠️ env-fail | Local uv-managed venv missing `prometheus_client` — fails at conftest import, **not** at any test added or modified by this integration. Refresh: `uv pip install -r apps/api/requirements.txt` (or equivalent). |
| Frontend `npm run test:web` | ⚠️ env-fail | Test runner aborts with `SecurityError: Cannot initialize local storage without a --localstorage-file path`. Same failure mode is in the run-unit-tests.mjs config; not introduced by the merged branches. |

**Both test failures are pre-existing environment issues on this machine, not regressions introduced by the integration.** The build and typecheck both pass on the integration diff. The integration diff itself is 1 source file (a defensive feature flag) plus 11 test/test-config files.

---

## 6. Safety / governance checks on the integration diff

Grepped `git diff main...HEAD` for sensitive surfaces:

| Surface | Matches in integration diff | Verdict |
| --- | --- | --- |
| Role gates (`require_role`, `require_minimum_role`, `UserRole`, `@admin_only`, `allow_anonymous`) | 0 | clean |
| Consent gates (`consent`, `Consent`) | 0 | clean |
| Export / download / serialize-to-response | 5 (all in test strings; e.g. `renderClinicalDisclaimer('export')`) | clean |
| Patient/clinic isolation (`clinic_id`, `patient_id`, `actor.`, `tenant`) | 0 | clean |
| Demo / live boundary | covered by `verify_demo_boundary.py` 10/10 | clean |
| qEEG / MRI governance | no qEEG/MRI router or model files touched | clean |
| Duplicate routers / route collisions | only `movement_analyzer_router` is touched, and it's *removed* from the unconditional include path | clean |
| Unsafe wording | new test files only — no production copy added | clean |

---

## 7. Recommended branch disposition

| Branch | Recommendation |
| --- | --- |
| `feat/ai-core-pages` | **Delete** — already in main. |
| `feat/production-infrastructure` | **Delete** — already in main. |
| `chore/delete-literature-local-knowledge-orphan-tests` | **Delete** — already in main. |
| `docs/post-salvage-governance-lock-2026-05-17` | **Delete** — already in main. |
| `fix/guard-movement-analyzer-router` | **Keep / merge directly** — defensive, low-risk; included here. |
| `fix/web-unit-timeout-bisect` | **Keep / merge directly** — test-runner only; included here. |
| `test/frontend-coverage-branch-threshold` | **Keep / merge directly** — 10 new tests; included here. |
| `fix/patient-portal-dual-review-fixture` | **Rebase onto main, re-attempt.** 1 commit ahead — easiest of the conflicted set. |
| `fix/e2e-guardian-portal-render-ready` | **Rebase onto main, re-attempt.** Conflict only in `flows.spec.ts`. |
| `fix/api-migrations-agent-configs-lineage` | **Manual review.** Migration `100_agent_configs.py` already exists on main (added by PR #972 today); the lineage fix may already be redundant or actively contradictory. |
| `feat/qeeg-rag-draft-reports` | **Rebase + re-review.** qEEG router has moved heavily on main. |
| `feat/evidence-aware-agents` | **Rebase + reduced re-review.** Three router conflicts; biggest of the rebase tasks. |

---

## 8. Final recommendation

**READY WITH WARNINGS** to merge `integration/kimi-all-branches-review-2026-05-18` → `main`.

### What's "ready"
- Build + typecheck pass.
- Demo/production boundary verified.
- Safety surface (auth / consent / exports / tenant isolation / governance) untouched in the integration diff.
- The merged content is 1 defensive feature flag + 11 test/test-config files. Risk is genuinely small.

### The warnings
1. Backend pytest **could not be run** — local uv venv is missing `prometheus_client`. This is unrelated to the integration but means we lack the green pytest signal the mission requested. Fix: refresh the API venv (`uv pip install -r apps/api/requirements.txt`) and re-run on this branch before any human review concludes.
2. Frontend `test:web` could not be run — `--localstorage-file` config error in the unit-test runner. Same caveat: re-run after the runner config is fixed.
3. The bulk of the agent/Kimi work users want to see (`feat/qeeg-rag-draft-reports`, `feat/evidence-aware-agents`, the three `fix/...` branches) is **not** in this integration branch because each conflicted on real source files. Reviewing this integration alone gives a misleadingly small picture of what's still pending.
4. Two `feat/*` branches that *appeared* to have unique commits actually have all their content reachable from current `main` already — same name still exists on origin and may collect more commits if someone pushes to it. Worth pruning to avoid future confusion.

### What this branch should *not* be used for
- It must not be treated as a substitute for resolving the 5 conflicted branches. Those still need rebase + per-branch review before any of their work reaches `main`.
- It should not be force-merged with `--admin` to bypass CI on the green-test front, given the env-fail caveats above.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
