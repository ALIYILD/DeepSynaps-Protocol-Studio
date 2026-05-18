# Rebase report — `fix/api-migrations-agent-configs-lineage`

- **Original branch:** `origin/fix/api-migrations-agent-configs-lineage`
- **Rebased branch:** `rebase/fix-api-migrations-agent-configs-lineage-onto-main-2026-05-18` (created, rebase aborted, not pushed)
- **State vs main pre-rebase:** 34 commits ahead, 890 behind
- **Unique commits (patch-id matched):** **1** — `8338f37e fix(api-migrations): restore agent_configs alembic lineage`. The other 33 are squash-merged copies of already-on-main PRs (e.g. #940, #937, plus a chain of `feat/clinical-bug-fixes`, `feat/ai-core-pages`, `feat/production-infrastructure` merges).

## Conflict file
- `apps/api/alembic/versions/100_agent_configs.py` (add/add)

## Conflict classification
**MIGRATION_RISK — STOPPED PER RULES · CONTENT IS REDUNDANT**

Three conflict regions, all in **docstring text** (lines 5-9, 19-23, 31-34):
1. `(clinic_id, agent_id)` vs `` ``(clinic_id, agent_id)`` `` (RST literal-backtick wrapping).
2. `Revises: 099_widen_audit_event_columns` vs `Revises: b5278dd39fee` — but this is **inside the docstring only**. The actual migration code (line 36) reads `down_revision = "b5278dd39fee"` on both sides, no conflict marker. The docstring on HEAD is stale.
3. A blank-line whitespace tweak.

`apps/api/alembic/versions/` on main contains:
- `100_agent_configs.py` (this file — added by PR #943, *"fix(alembic): restore 100_agent_configs + bridge to current head"*, commit `a28a3743`).
- `b5278dd39fee_merge_neuro_signs_and_research_dataset_.py` (the parent the migration points to).
- `d1e2f3a4b5c6_merge_100_agent_configs.py` (added today by PR #972).
- `104_merge_agent_configs_lineage.py` (a sibling merge added separately).

i.e. **main has already restored the agent_configs lineage** via PR #943 and bridged it with two follow-up merge revisions. The branch's own commit `8338f37e` is the same lineage fix from a different agent's session — superseded.

## Why I stopped
Mission rule: *"If conflict touches clinical governance, consent, export, audit, auth, or migrations, stop and report."* This is an alembic migration file. Even though the only actual delta is docstring formatting and the underlying migration is already in main, I'm respecting the rule literally and not resolving.

If you want the docstring tidied (literal-backtick wrap + accurate `Revises:` line), the right path is a tiny separate PR against the file on main — not a rebase of a 34-commit divergent branch.

## Tests run
None — rebase aborted before any application of patches.

## Remaining risks
None operationally — `alembic upgrade head` will succeed against main as-is; PR #943 already provided the lineage fix. The only "risk" of leaving this alone is a slightly stale docstring inside `100_agent_configs.py`. Nothing functional.

## Recommendation
**BLOCKED (by rule)** — but functionally **READY TO ABANDON**.

- Close `origin/fix/api-migrations-agent-configs-lineage` and delete the branch.
- If anyone wants the docstring polish, open a one-line PR against `apps/api/alembic/versions/100_agent_configs.py` on main.
- Do **not** merge the unrebased branch in any form; doing so would attempt to re-introduce migration `100_agent_configs` over the one already on main and break `alembic upgrade head`.
