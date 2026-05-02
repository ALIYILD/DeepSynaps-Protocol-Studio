# DeepSynaps Protocol Studio — Architecture Audit

**Date:** 2026-05-02 · **Branch audited:** `main` (commit `899893d`) · **Auditor:** Claude (Opus 4.7) · **Scope:** read-only.

---

## 1. TL;DR

- **Healthy:** persistence layer is properly split (13 model files, no inter-model imports → no circular-import risk); auth/cross-clinic gate is well-designed and instrumented (`apps/api/app/auth.py:154-206`); demo-mode shim in `api.js` is mostly consistent across 14 analyzers.
- **Risky now:** **CI is red on `main`** for the last 15+ runs — root cause is a stale `create_access_token()` call signature in ~30+ test files (`apps/api/tests/test_biometrics_router.py:54-60`). Backend is shipping with a broken test suite, which means real regressions will be invisible.
- **Risky structural:** **17 of 112 alembic migrations are merge-heads** (15%) — concurrent-session pattern is causing branch divergence at the schema level, not just code. This is the single most dangerous trend.
- **Architecture debt is bounded but large:** `tools/router_basemodel_allowlist.txt` lists **1,097 frozen exemptions** (Architect Rec #5) and `tools/router_no_models_allowlist.txt` lists **99 routers** bypassing the repository layer (Rec #8). Both are gated by lint, so debt cannot grow — but it isn't shrinking either.
- **Fix in next 2-4 weeks:** (a) green the test suite, (b) put a serialization gate on alembic head creation, (c) refactor `apps/web/src/app.js` (3,391 LOC, 161 commits) — it is the #1 multi-session conflict point.

---

## 2. Health-by-area scorecard

| Area      | Status | Note |
|-----------|--------|------|
| Frontend  | 🟡 | 7 god-files >10k LOC; `app.js` is the conflict hot-spot. Demo gate consistent in 14 analyzers but missing in `apiFetchBlob`. |
| Backend   | 🟡 | 131 routers, 86 use repos, 102 import models directly (lint allowlists 99). Two duplicate `fusion_router` imports in `main.py:205,212`. |
| DB        | 🔴 | 112 migrations, 17 merge-heads (15%); pattern accelerating — 8 merge-heads created since 084 (i.e. last ~30 PRs). |
| CI        | 🔴 | Failing on `main` continuously since at least 2026-05-02 morning; backend test job is the failing one. |
| Tests     | 🔴 | ~30+ test files broken by `create_access_token()` signature drift; root cause is a single API change without a sweep. |
| Auth      | 🟢 | `auth.py` is small, dataclass-based, no PHI in logs (only IDs); cross-clinic denials emit structured `security.cross_clinic` events. |

---

## 3. Top-3 risks ranked

### Risk #1 — Test suite is broken on `main`; CI has been red for ≥15 runs
**Files:** `apps/api/app/services/auth_service.py:36-42` (current signature), `apps/api/tests/test_biometrics_router.py:54-60` (test calling old signature with a dict).
**Impact:** No PR merging today produces a green CI signal. Real regressions can land unnoticed; `gh pr merge --squash --admin` is documented in CLAUDE.md as a workaround, which is dangerous when the underlying tests are dishonest. The "62 follow-up failures" cited in PR #465 are dominated by this single root cause (test-side, not production-side).
**Fix:** Single PR — sweep all 38 test files using `create_access_token`, swap `create_access_token({...})` → `create_access_token(user_id=..., email=..., role=..., package_id=..., clinic_id=...)`. Then add a lint rule (regex check) that fails if any test passes a dict to that helper.

### Risk #2 — Alembic merge-head treadmill
**Files:** `apps/api/alembic/versions/084_merge_heads_movement_and_reviewer_sla.py`, `085_merge_heads_*.py` (×2), `086_merge_heads_*.py` (×2), `087_merge_heads_*.py`, `088_merge_heads_*.py`, `089_merge_heads_risk_analyzer.py`. **8 merge-head migrations in the last ~30 PRs.**
**Impact:** Each merge-head migration is a manual conflict-resolution that happened *after* the divergent branches landed on `main`. The cited blocker in `.claude-audit-findings.md` ("Alembic migration ordering bug that blocks API deploy") is the same pattern. Production deploys are now gated on a chronic synchronization problem, and concurrent-session work makes it worse, not better.
**Fix:** Single workflow change — every PR that adds a migration must `alembic heads | wc -l == 1` as a CI check. Add `tools/lint_alembic_single_head.py` running in the same job as the existing repo lints.

### Risk #3 — `apps/web/src/app.js` (3,391 LOC, 161 commits) is the multi-session bottleneck
**Files:** `apps/web/src/app.js` whole; the lazy-load registry at lines 159-224 is appended to by every new analyzer page.
**Impact:** PR #429 already flagged this. Edit frequency = 161 commits is the highest for any single file in the repo. Every NAV change, every new analyzer, every demo-mode tweak touches this file. With 5+ concurrent Claude sessions, this is the file most likely to hit a merge conflict — and the conflict has historically broken the lazy-load wiring (one orphaned page found: `pages-billing.js` at 191 LOC, never loaded; `pages-qeeg-raw.js` at 3,305 LOC also dead).
**Fix:** Mechanical extraction (no behavior change) — move the 64 `loadXxx()` definitions to a generated `apps/web/src/page-loader-registry.js` file emitted from a manifest. Each analyzer PR then only edits the manifest, not `app.js`. Estimated effort: 4 hours. Estimated conflict reduction: ~60% based on commit history.

---

## 4. Top-5 quick wins (≤ 30 LOC each)

### QW-1 — Add demo gate to `apiFetchBlob` (5 LOC)
**File:** `apps/web/src/api.js:310`
**Sketch:**
```js
async function apiFetchBlob(path, data) {
  if (_isDemoSession() && !_DEMO_PASSTHROUGH.test(path)) {
    return new Blob(['{"demo":true}'], { type: 'application/json' });
  }
  // ...existing code
}
```
Today, demo users hitting `exportProtocolDocx` (`api.js:1113-1115`) get a 401 logged in the console. The other two fetch helpers (`apiFetch:149`, `apiFetchBinary:324`) already gate.

### QW-2 — Remove duplicate `fusion_router` import (2 LOC)
**File:** `apps/api/app/main.py:212`
**Sketch:** Delete line 212 (`from app.routers.fusion_router import router as fusion_router` — already imported at line 205). Pure dead code; harmless today but noise during multi-session merges.

### QW-3 — Delete `apps/web/src/pages-qeeg-raw.js` (3,305 LOC dead)
**File:** `apps/web/src/pages-qeeg-raw.js` (entire) plus stale references in `apps/web/src/raw-keyboard-shortcuts.js` and `apps/web/src/pages-qeeg-raw-state.test.js`.
**Sketch:** `git rm apps/web/src/pages-qeeg-raw.js apps/web/src/pages-qeeg-raw-state.test.js`. Hash route was renamed to `qeeg-raw-workbench` (`app.js:1838`); the old file is orphaned. Saves ~2.5% of frontend bundle pre-tree-shake.

### QW-4 — Delete `apps/web/src/pages-billing.js` (191 LOC dead)
**File:** `apps/web/src/pages-billing.js`
**Sketch:** `git rm apps/web/src/pages-billing.js`. Only reference is a comment in `pages-webhooks.js:9`. Confirmed not lazy-loaded by `app.js`.

### QW-5 — Add single-head alembic CI check (~25 LOC tool + 8 LOC CI)
**File:** new `tools/lint_alembic_single_head.py`, new step in `.github/workflows/ci.yml` after line 244 (`router-schema-lint`).
**Sketch:**
```python
import subprocess, sys
out = subprocess.check_output(["alembic", "-c", "apps/api/alembic.ini", "heads"], text=True)
heads = [l for l in out.splitlines() if l.strip()]
if len(heads) > 1:
    print(f"Multiple alembic heads: {heads}", file=sys.stderr); sys.exit(1)
```
Stops the merge-head treadmill at the PR boundary.

---

## 5. Architectural follow-ups (medium effort)

### FU-1 — Standardize analyzer response envelopes (3-5 days)
Risk Analyzer returns `{"status": "ok", ...}` (`risk_analyzer_router.py:221,251`); Movement Analyzer returns `{"ok": True, ...}` (`movement_analyzer_router.py:136`); Nutrition Analyzer uses Pydantic `response_model=AckResponse` (`nutrition_analyzer_router.py:127`). All three are functionally `{ ok: bool }` envelopes. Pick one (recommend `AckResponse` from `core-schema`), migrate the other 13 analyzers, delete the local `Ack`/`{status}`/`{ok}` shapes. Front-end already tolerates all three but new analyzers re-invent the divergence.

### FU-2 — Slim `apps/api/app/main.py` from 1,145 LOC to <400 (1 week)
Currently it: imports 127 routers, defines 8 in-line endpoints (`main.py:953-1112`), runs the lifespan with 8 inline worker start/stop pairs (`main.py:241-273`), seeds demo users (`main.py:291`), wires CORS / SlowAPI / sentry / static mounts. Split into: `app/wiring/routers.py` (router list), `app/wiring/workers.py` (lifespan), `app/wiring/middleware.py` (CORS/limit/sentry). Inline endpoints move to `app/routers/legacy_router.py`. Net: `main.py` becomes a 50-line composition root.

### FU-3 — Migrate top 50 router-local BaseModels to `core-schema` (2 weeks, parallelizable)
`tools/router_basemodel_allowlist.txt` has 1,097 entries. Tackle the 50 highest-traffic ones first (analyzers + auth + patients + sessions). Frontend type drift is currently manual. After migration, `packages/api-client/openapi.json` regen catches breaking changes — exactly what FU-1 needs to be safe.

### FU-4 — Refactor `apps/web/src/app.js` per QW-3 above and split `pages-knowledge.js` (20,235 LOC) (1 week)
`pages-knowledge.js` is the single biggest file in the repo. It is a god-file: split by knowledge-section (handbooks / protocols / conditions / brain-targets) into ~5 modules, each lazy-loaded. Same pattern as the analyzer split. Reduces conflict surface and bundle size on first paint.

### FU-5 — `clinical.py` model file is creeping back to god-file (4 hours)
`apps/api/app/persistence/models/clinical.py` is 1,085 LOC — the largest in `persistence/models/` and ~2× the next (`qeeg.py:534`). PR #401 split the original god-file into 13 modules; this one needs another split: extract `Note`, `Annotation`, `CarePlan` into `clinical_notes.py` to keep the rule of "one model file ≤ 500 LOC".

---

## 6. Anything else worth flagging

- **`apps/web/src/api.js` is 5,089 LOC with one exported `api` constant.** Split per-domain (auth, patients, analyzers, exports) — same conflict pattern as `app.js`.
- **`auth_router.py` is 1,168 LOC for 17 endpoints** (~70 LOC each) due to inline JWT, demo-token branches, audit writes, rate-limiting. Extract an `auth_service`.
- **`app/schemas/` has only 2 files** (`labs_analyzer.py`, `nutrition_analyzer.py`); 12 analyzers don't have one. With FU-3 above, this is what makes the FE/BE contract fragile.
- **`scripts/deploy-preview.sh` is fine for previews, not production.** `flyctl deploy --remote-only --yes` (`deploy-preview.sh:93-94`) has no health-check gate, no rollback, no migration dry-run. Production needs `alembic upgrade --sql` dry-run, post-deploy `curl /health`, auto rollback on fail.
- **Two truly-orphaned routers ship in the image:** `ai_health_router.py` (233 LOC) and `quality_assurance_router.py` (1,291 LOC) are imported nowhere — the live QA router is `qa_router.py`. Delete or wire.
- **Concurrent-session reality is under-instrumented.** A `.claude/worktree-state.md` index of which worktree owns each god-file (`app.js`, `api.js`, `main.py`, `pages-knowledge.js`, `clinical.py`), kept by a pre-commit hook, is the cheapest mitigation for the alembic merge-head pattern.

— end of audit —
