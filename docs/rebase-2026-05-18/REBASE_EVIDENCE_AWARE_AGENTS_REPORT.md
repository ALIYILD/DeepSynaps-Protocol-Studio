# Rebase report — `feat/evidence-aware-agents`

- **Original branch:** `origin/feat/evidence-aware-agents`
- **Rebased branch:** `rebase/feat-evidence-aware-agents-onto-main-2026-05-18` (created, rebase aborted, not pushed)
- **State vs main pre-rebase:** 21 commits ahead, 974 behind
- **Total files differing from main:** 952 (most are pytest temp `.gz` artifacts that would never be merged, but the source/test surface alone is in the dozens)
- **Unique commits:** 20 (the 21st `Harden brittle practice and patient e2e checks` is an alias of an earlier commit on a different SHA).

## Unique commit summary (clinical scope highlighted)

| Commit | Title | Scope |
| --- | --- | --- |
| `a7cdfaad` | test(ci): relax brittle e2e assertions and extend backend timeout | CI / e2e — **first commit, already conflicted at attempt** |
| `f908664d` | Add evidence-aware clinic agent tools | **CLINICAL · AGENT** |
| `ab924ba4` | Harden Telegram evidence agent routing | **AGENT permissions** |
| `264cf841` | Tighten Telegram evidence command guards | **AGENT permissions** |
| `3fd92974` | Harden evidence citation approval metadata | **CITATION SAFETY · provenance** |
| `0869a02e` | Deepen evidence governance widget summaries | **CLINICAL · governance UI** |
| `6df552cf` | chore: trigger PR checks | noise |
| `0cb68312` | Expose evidence review counts in governance status | **CLINICAL · governance** |
| `6d6d1a2a` | Differentiate bundled fallback from degraded evidence status | **CLINICAL** |
| `a54683c9` | Scope evidence status review counts to clinic actors | **TENANT ISOLATION** |
| `e29e0fd8` | Scope evidence review status and remove fake alerts | **CLINICAL · removes fake alerts** |
| `d0656a56` | Exclude pending review citations from report payloads | **EXPORT GOVERNANCE · clinical** |
| `52bbfff6` | Add runner coverage for evidence-aware Dr AI context | **AGENT / AI** |
| `35f55c40` | Keep patient evidence search wired after rerender | **PATIENT ACCESS** |
| `a509fce0` | Render contradictory findings in evidence workspace | **CLINICAL · contradictory evidence UI** |
| `3e3f7e51` | Label evidence provenance in workspace and drawer | **CITATION PROVENANCE** |
| `17b38398` | Handle evidence save failures honestly | **CLINICAL · error truthfulness** |
| `d78eeb48` | Keep evidence governance visible in zero-state widgets | **CLINICAL · governance UI** |
| `81c7510c` | Fix router repo lint in research dataset preflight | minor (but in `research_dataset_router.py` — sensitive) |
| `af1c6d6c` | Harden brittle practice and patient e2e checks | e2e |

## Conflicts hit attempting the first commit alone
- `apps/web/e2e/responsive-shell.spec.ts` (add/add)
- `apps/web/e2e/flows.spec.ts` (auto-merged but with branch-vs-main drift on the same locator-strategy lines we already touched in branch B)
- `.github/workflows/ci.yml` (auto-merged)

Subsequent commits (the substantive evidence/agent/governance ones) would conflict in: `apps/api/app/routers/evidence_router.py`, `apps/api/app/routers/research_dataset_router.py`, `apps/api/tests/test_evidence_router.py`, almost certainly `apps/api/app/services/evidence_intelligence.py`, plus the agent-tool surface for the Telegram bot integration.

## Conflict classification
**CLINICAL_GOVERNANCE_RISK + AGENT_PERMISSIONS_RISK + EXPORT_GOVERNANCE_RISK · STOPPED PER RULES**

The branch's commits explicitly touch:
- **evidence consent gating** (citation approval metadata, pending-review citations exclusion)
- **patient access** (scoped review counts, patient search rewire)
- **evidence provenance** (workspace + drawer labelling, contradictory findings rendering)
- **citation safety** (excluding pending-review citations from report payloads)
- **agent permissions** (Telegram command guards, agent routing hardening)
- **export governance** (report-payload citation filtering)
- **honest error reporting** (handle-save-failures-honestly, no-fake-alerts)
- **tenant isolation** (clinic-actor-scoped status counts)

Every single one of these is in the mission's "stop on conflict" list. Cannot be rebased without per-commit clinical/security review.

## Tests run
None — rebase aborted at commit 1.

## Remaining risks
- The agent/evidence governance contract on main has moved heavily over the last ~6 days (974 commits). The branch's commits may *predate* the main implementation of the same guarantees. Resolving conflicts blind would risk reverting clinical hardening that main already shipped.
- "Remove fake alerts" (`e29e0fd8`) and "honest save failures" (`17b38398`) are the kind of copy/UX changes that, if they overwrite something main already polished, regress regulatory wording without breaking tests.
- Telegram agent hardening (`ab924ba4`, `264cf841`) touches the AliClaw / AliSlave bot integration — separate Telegram permissions/governance surface that this session has no auth surface to validate.

## Recommendation
**BLOCKED — split into ≥6 focused PRs by clinical theme.**

Rebasing 20 commits at once across this scope is unsafe. Suggested split (each its own rebase + PR + review):

1. **Tests/CI only** (`a7cdfaad`, `af1c6d6c`) — low risk, can land first.
2. **Evidence provenance UI** (`3e3f7e51`, `a509fce0`, `d78eeb48`, `0869a02e`) — frontend only, clinical-copy review.
3. **Evidence citation governance** (`3fd92974`, `d0656a56`) — must compare to main's current citation/HITL contract before landing.
4. **Tenant scoping** (`a54683c9`, `0cb68312`, `6d6d1a2a`) — security review for cross-clinic leakage.
5. **Agent / Telegram** (`f908664d`, `ab924ba4`, `264cf841`, `52bbfff6`) — agent permissions + Telegram routing review.
6. **Honest-state UX** (`e29e0fd8`, `17b38398`, `35f55c40`) — clinical-copy review for regulatory wording.

Each split should be rebased onto current main individually and PR'd separately. Attempting to land the whole branch in one go without governance review is the kind of merge that costs another v372-style outage — except this time inside the clinical surface.
