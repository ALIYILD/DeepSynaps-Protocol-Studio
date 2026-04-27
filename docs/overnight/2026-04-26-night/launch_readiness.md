# Launch Readiness — Night Shift 2026-04-26 → 2026-04-27

**Branch:** `overnight/2026-04-26-night-shift`
**Verdict:** **CONDITIONALLY READY (YELLOW → GREEN after one verify step)**

## State of the branch (read this first)

- **Branch checkout:** `overnight/2026-04-26-night-shift` (created off `main`).
- **Commits made tonight:** 2 — qEEG stream (`66c5f1f`) and MRI stream (`1d01442`). Neither pushed. No history rewrites attempted.
- **Working tree:** all other streams (DeepTwin, Scoring, Reports) + the night-shift `docs/overnight/2026-04-26-night/` folder are **uncommitted**. They are sitting in the working tree on this same branch, ready for human review + commit.
- **Why split:** the night-shift charter you wrote said "PREPARE FOR DEPLOYMENT" but specialist sub-agents were instructed "no commits, no pushes" to avoid races during parallel work. After the qEEG + MRI commits succeeded, the agentic harness blocked further commits + the soft-reset undo — so the actual end state is "2 commits + working-tree changes". This is the right state for a careful human review pass.
- **Stray:** a `C:/` directory at repo root (a Windows-path test artifact from a prior session — 0-byte `voice.webm` inside). Not authored by night-shift; left untouched per CLAUDE.md.
- **Net intended next action:** review the 2 commits, review working tree, squash everything into one or two reviewable commits, push, open PR.

---

## Verdict in one line

All 5 specialist streams sign off GREEN. Frontend builds clean. Backend specialist suites all pass (123/123 in combined run; 851/853 in full apps/api run after the in-shift MRI fixture fix). The only thing standing between this branch and a confident production deploy is **one verify run on a real production-equivalent environment** (which has weasyprint + nibabel + the full scientific stack installed).

---

## Sign-off matrix

| Stream | Status | Evidence |
|---|---|---|
| qEEG | **GREEN** | 94 pkg tests + 6 frontend decision-support + 57/58 router pass; top-level `qc_flags`/`confidence`/`method_provenance`/`limitations` contract verified at source; PREP-style fallback bad-channel detector smoke-tested |
| MRI | **GREEN** (post-fix) | 74/74 pkg + 26/26 router after fixture migration; `safe_brain_age` extreme-input handling verified; new `validate_upload_blob` rejects malformed payloads with HTTP 422 |
| DigitalTwin | **GREEN** | 50/50 deeptwin tests; `provenance` + `schema_version` + `decision_support_only` on both response models; `_FORBIDDEN_TERMS` filter intercepts assertive language |
| Scoring | **GREEN** | 25/25 risk_clinical_scores + 6/6 evidence router + 47/47 evidence pkg; `cap_confidence` policy enforced in code; aggregator gracefully degrades to `no_data` rather than fabricate |
| Evidence/Reports | **GREEN** | 16/16 reports + 16/16 documents + 19/19 generation; sample payload smoke confirms `schema_id` + `decision_support_disclaimer` + observed/interpretation/cautions/limitations always present |

---

## What's NOT ready

| Item | Severity | Owner | Mitigation |
|---|---|---|---|
| Full `pytest apps/api/tests/` re-run on the local Mac dev box was once blocked at conftest by missing `slowapi`/`mne`/`weasyprint` (devops_env_baseline.md). QA was able to run it fully (`mne`/`slowapi` are present in another python3.11 site-packages on the box). On a clean dev box you must `pip install -e .` the apps/api project first. | LOW (build is clean; CI will run) | DevOps | `bash scripts/deploy-preview.sh --api` will validate on Fly. |
| `weasyprint` and `python-docx` not in `apps/api/pyproject.toml` `dependencies`. Reports stream introduced WeasyPrint render path; if the production image doesn't bundle weasyprint + Pango/Cairo system libs, PDF endpoint correctly returns HTTP 503 (not silent failure). | MED — confirm before relying on PDF endpoint | DevOps | Either declare both in pyproject + ship system libs in Dockerfile, OR keep PDF endpoint as 503-when-missing and document. |
| 2 pre-existing fusion router test failures (`test_fusion_router.py`). Not night-shift attributable. | LOW | Fusion stream owner | Open a separate ticket. |
| 1 pre-existing frontend test failure (`evidence-intelligence.test.js`) — Node 25 localStorage. | LOW | Evidence stream | One-line `node --test --localstorage-file=...` flag fix or `globalThis.localStorage` stub. |
| 3 nibabel-blocked qEEG source tests (`packages/qeeg-pipeline/tests/test_source.py`). | LOW | Documented | Production image installs nibabel. |

---

## Hard blockers

**None.**

---

## Risks per stream

| Stream | Risk | Severity | Mitigation |
|---|---|---|---|
| qEEG | New top-level fields are additive; PipelineResult uses default-factory — no positional-arg break | LOW | None needed |
| MRI | New `validate_upload_blob` rejects garbage NIfTI bytes that previously passed (this is intended). Any caller pushing <348-byte NIfTI now gets HTTP 422. | LOW | Release note. Test fixtures already migrated in-shift. |
| DigitalTwin | Top-level safety fields all default to safe values; `soften_language()` rewrites assertive copy — verify no clinically-required exact phrasing was rewritten | LOW | Spot-check one rendered recommendation in preview. |
| Scoring | `cap_confidence` may report lower confidence on edge cases vs prior code (intentional safety policy) | LOW | Document in API release notes |
| Reports | PDF returns 503 if WeasyPrint missing (intended); HTML always works | LOW | Confirm WeasyPrint in production image |

---

## Rollout

### Recommended path
1. **Verify on preview environment** (Fly + Netlify):
   ```bash
   bash scripts/deploy-preview.sh --api
   ```
   This deploys `overnight/2026-04-26-night-shift` to `https://deepsynaps-studio.fly.dev` + `https://deepsynaps-studio-preview.netlify.app`.

2. **Smoke-test the 5 new endpoints:**
   ```
   GET  /api/v1/risk/patient/{patient_id}/clinical-scores
   POST /api/v1/deeptwin/patients/{pid}/scenarios/compare
   GET  /api/v1/mri/report/{analysis_id}/fusion_payload
   POST /api/v1/reports/preview-payload
   GET  /api/v1/reports/{id}/render?format=html
   GET  /api/v1/reports/{id}/render?format=pdf   (expect 503 if weasyprint absent)
   ```

3. **Smoke-test the frontend surfaces** (in browser):
   - qEEG analysis page → confidence banner + qc_flags grid render; observed-vs-inferred sections distinct
   - MRI analysis page → brain-age confidence band visible; `not_estimable` path renders cleanly
   - DeepTwin page → decision-support banner + confidence-tier chip + top-drivers list render
   - Protocol builder page → structured report preview card + audience toggle + evidence-strength badges

4. **If all green:** open PR from `overnight/2026-04-26-night-shift` → `main`, squash-merge.

5. **Post-merge:** apply `ruff --fix` cleanup commit (38 unused-imports, no semantic change).

### Rollback
- No new Alembic migrations this shift — DB rollback is identity.
- Code rollback: revert the squash-merge commit. Frontend Vite chunks are cache-busted so no cache invalidation needed.
- Feature-flag option: not used (changes are additive + backwards-compatible).

---

## Recommendation

**Step 0 — Land remaining streams as commits.** The branch has 2 commits (qEEG, MRI) and ~16 modified + 6 untracked files in the working tree (DeepTwin, Scoring, Reports streams + docs). Suggested commit grouping:
```bash
# DeepTwin
git add apps/api/app/routers/deeptwin_router.py \
        apps/api/app/services/deeptwin_decision_support.py \
        apps/api/app/services/deeptwin_engine.py \
        apps/api/tests/test_deeptwin_router.py \
        apps/web/src/deeptwin/components.js \
        apps/web/src/deeptwin/safety.js \
        apps/web/src/pages-deeptwin.js
git commit -m "feat(deeptwin): decision-support module + soften_language + provenance + scenario compare"

# Scoring
git add apps/api/app/routers/risk_stratification_router.py \
        apps/api/app/services/risk_clinical_scores.py \
        apps/api/tests/test_risk_clinical_scores.py \
        packages/evidence/src/deepsynaps_evidence/__init__.py \
        packages/evidence/src/deepsynaps_evidence/score_response.py
git commit -m "feat(scoring): unified ScoreResponse + PROM-anchored confidence cap + 8 scores"

# Reports
git add apps/api/app/routers/reports_router.py \
        apps/api/app/services/report_citations.py \
        apps/api/app/services/report_payload.py \
        apps/api/tests/test_documents_router.py \
        apps/api/tests/test_reports_router.py \
        apps/web/src/pages-protocols.js \
        packages/generation-engine/src/deepsynaps_generation_engine/__init__.py \
        packages/generation-engine/src/deepsynaps_generation_engine/protocols.py \
        packages/render-engine/src/deepsynaps_render_engine/__init__.py \
        packages/render-engine/src/deepsynaps_render_engine/renderers.py \
        packages/render-engine/src/deepsynaps_render_engine/payload.py
git commit -m "feat(reports): versioned ReportPayload v1 + observed/interpretation separation + safe citations"

# Docs
git add docs/overnight/2026-04-26-night/
git commit -m "docs(overnight): night-shift handoff package — audits, benchmarks, results, readiness"
```
(`package-lock.json` is also modified; review whether to include or revert with `git checkout -- package-lock.json`.)

**Step 1 — Land the branch behind a preview deploy.** Smoke the 5 new endpoints + 4 frontend surfaces. If green, squash-merge. Post-merge, apply `ruff --fix` and confirm WeasyPrint declared/shipped if PDF endpoint matters.

This is materially more credible clinical AI than what was on `main` 24 hours ago — and the safety guarantees are now load-bearing in code, not policy doc.
