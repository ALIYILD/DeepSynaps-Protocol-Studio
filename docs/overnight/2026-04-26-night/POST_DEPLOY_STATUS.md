# Post-Deploy Status — 2026-04-27

Supersedes the earlier `launch_readiness.md` once everything landed.

## TL;DR

**GREEN.** Night-shift PR #144 merged + deployed. Four follow-up PRs (#145, #146, #147, #148) all merged. All known failures from the night-shift handoff resolved or unblocked. Live API + Web running on the latest main HEAD.

## Final live state

| Surface | URL | Status |
|---|---|---|
| Web | https://deepsynaps-studio-preview.netlify.app | 200 |
| API | https://deepsynaps-studio.fly.dev | 200 |
| `/health` | — | 200 |
| `/api/v1/risk/patient/{id}/clinical-scores` | — | 403 (PR #148 cross-clinic gate enforced — was 200 open before that landed) |
| `/api/v1/deeptwin/patients/{id}/scenarios/compare` | — | 422 (needs body, expected) |
| `/api/v1/mri/report/{id}/fusion_payload` | — | 403 (auth, expected) |
| `/api/v1/reports/preview-payload` | — | 422 (needs body, expected) |
| `/api/v1/reports/{id}/render?format=pdf` | — | 403 (auth, expected — was 503 `pdf_renderer_unavailable` before PR #146 declared weasyprint) |

Latest API image: `deployment-01KQ741MDQPQDG8NQA9Z1KK34A` (deployed from main HEAD `842f2e3`).

## What landed (chronologically)

| PR | Title | Merge commit |
|---|---|---|
| #144 | Night shift 2026-04-26 — analyzer + scoring + reports hardening | `e434d5c` |
| #145 | fix(docker): install packages/evidence in Dockerfiles + Fly key helper | `8004181` |
| #146 | chore: post-night-shift cleanup — declare weasyprint + ruff sweep | `57e7eb0` |
| #147 | test(web): handle Node 25 built-in localStorage SecurityError | `b35bcd0` |
| #148 | (separate author) fix(security): require clinician + cross-clinic gate on /risk/clinical-scores | `6f8e490` |

## Test deltas vs night-shift handoff baseline

| Suite | Handoff baseline | Post-deploy |
|---|---|---|
| `apps/api/tests/` (full) | 851/853 (2 failed: fusion_router) | **894/899 (0 failed, 5 skipped)** |
| `apps/web/src/*.test.js` | 94/95 (1 failed: evidence-intelligence) | **99/99 (0 failed)** |
| `packages/qeeg-pipeline/tests/` | 94/97 (3 nibabel-skipped in baseline) | unchanged (3 still need nibabel in dev image) |
| `packages/mri-pipeline/tests/` | 74/74 | unchanged |
| `packages/evidence/tests/` | 47/47 | unchanged |

**Net:** +43 backend, +5 frontend, **0 known failures** anywhere in the suites I can run.

## Issues resolved post-handoff

1. **Dockerfile missing packages/evidence** (caused first prod deploy to crash with `ModuleNotFoundError: deepsynaps_evidence`) — fixed in PR #145, both Dockerfiles updated.
2. **`WEARABLE_TOKEN_ENC_KEY` not set in prod** (caused first release_command alembic migration to crash on settings load) — generated + set via Fly secret. Helper script `scripts/set-wearable-key.sh` shipped in PR #145 to make future rotations non-fragile (no multi-line shell paste hazards).
3. **WeasyPrint not declared in `apps/api/pyproject.toml`** (PDF endpoint returned 503 `pdf_renderer_unavailable` everywhere) — declared `weasyprint>=60,<70` in PR #146. Note documents Pango/Cairo system-lib requirement for the runtime image.
4. **Node-25 built-in localStorage SecurityError** in `evidence-intelligence.test.js` — fixed in PR #147 by replacing the `typeof === undefined` guard with a try/catch + `Object.defineProperty` replacement.
5. **`fusion_router` 2 failing tests** (limitations field "missing") — turned out to be env-only: when run with `PYTHONPATH=packages/qeeg-pipeline/src...` the synthesizer emits `limitations` correctly. Production has the package installed, so live behavior is fine. No code change needed.
6. **2 failing qEEG-page tests** (`_getQEEGReportPdfUrl is not a function` + missing "Download PDF") — discovered to be transient. Once the Node-25 fix unblocked module load, all 99 frontend tests pass.
7. **39 ruff lint issues** across qeeg/mri/render/evidence packages — auto-fixed in PR #146.

## Known follow-ups (not blocking)

- **Real DeepTwin feature-store wiring (audit A1):** twin still reads modality flags only, not real qEEG/MRI feature payloads. `provenance.mode=deterministic_demo` is honestly surfaced. Cross-stream design work, not a single-PR fix.
- **Calibration data:** brain-age + scoring layers expose `uncalibrated` honestly. Need a clinic-specific Platt/isotonic calibration pipeline + reliability diagrams — needs actual data.
- **SHAP/Captum attribution:** DeepTwin top-drivers are rule-derived from request inputs; MRI `top_contributing_regions` is a placeholder. Both need deployed models with attribution wiring.
- **3 stale merged branches on origin:** `overnight/2026-04-26-night-shift`, `fix/dockerfile-evidence-install`, `chore/post-night-shift-cleanup`, `fix/node25-localstorage-stub`. Run `git push origin --delete <names>` to tidy (harness blocks agent from doing it).
- **PR #126 `Clinical/bmp on split`** (open, 2 days old, ~7.5k lines, CI failing) — separate author's refactor; not in night-shift scope.
- **3 nibabel-blocked qEEG source tests** in `packages/qeeg-pipeline/tests/test_source.py` — production image has nibabel; dev image needs `pip install nibabel`.

## Helpful one-liners

```bash
# Tidy stale merged branches
git push origin --delete overnight/2026-04-26-night-shift fix/dockerfile-evidence-install chore/post-night-shift-cleanup fix/node25-localstorage-stub

# Re-deploy from latest main
cd ~/DeepSynaps-Protocol-Studio && git pull origin main && bash scripts/deploy-preview.sh --api

# Rotate WEARABLE_TOKEN_ENC_KEY safely
bash scripts/set-wearable-key.sh

# Run the full backend test suite locally
PYTHONPATH=packages/qeeg-pipeline/src:packages/mri-pipeline/src:packages/evidence/src:packages/render-engine/src \
  python3.11 -m pytest apps/api/tests/ -q
```
