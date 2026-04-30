# Branch Triage — 2026-04-27

Snapshot of every remote branch in the repo, classified by merge state. Generated after the night-shift PRs landed (#144, #145, #146, #147, #148, #150).

## TL;DR

- **19 branches are functionally landed** (true-merged into main, or squash-merged via PR with content already in main) — safe to delete.
- **17 branches have real unmerged work** — most by authors other than this session. I cannot responsibly rebase + land other people's WIP without their input.

## Safe to delete (19 branches — content already in main)

These branches' code is already on `main`, either via a real merge commit or a squash-merge PR. Deleting them does not lose any work.

```bash
# Run this as a single command in your terminal
git push origin --delete \
  audit/overnight-p0-fixes-2026-04-26 \
  cursor/evidence-intelligence-layer-f67e \
  cursor/clinical-ai-benchmark-upgrades-d18c \
  fix/mri-cs3d-nifti-loader \
  feat/deeptwin-page \
  feat/qeeg-mne-pipeline-integration \
  feat/mri-ai-upgrades \
  feat/core-connective-tissue \
  feat/assessments-v2-api-wire \
  fix/treatment-plan-demo-overlay \
  feat/finance-hub-api \
  fix/node25-localstorage-stub \
  fix/dockerfile-evidence-install \
  fix/test-clinic-jwt \
  clinical/bmp-focus-viewer \
  api/fix-fixture-order-failures \
  hotfix/alembic-idempotent-ddl \
  feat/core-alembic-001 \
  feat/patients-list-redesign \
  feat/protocol-hub-brainmap \
  overnight/2026-04-26-night-shift \
  chore/post-night-shift-cleanup \
  docs/post-deploy-status
```

(My night-shift branches `overnight/2026-04-26-night-shift`, `chore/post-night-shift-cleanup`, `docs/post-deploy-status` are squash-merged via PRs #144 / #146 / #150 — content is in main, branch refs are orphan.)

## Real remaining work (17 branches)

| Branch | Author | Last commit | Commits ahead | Recommended action |
|---|---|---|---|---|
| `clinical/bmp-on-split` | yildirimali | 2026-04-25 | 6 | **Open PR #126** — CI failing on E2E + Backend Tests. Owner needs to address CI before merge. ~7.5k LOC. |
| `cursor/beta-readiness-functional-completion-9a99` | Cursor Agent | 2026-04-27 | 3 | Cursor's WIP — let Cursor finish + open PR. |
| `cursor/beta-readiness-functional-completion-6372` | Cursor Agent | 2026-04-27 | 3 | Cursor's WIP — same. (Looks like duplicate / earlier attempt.) |
| `claude/finalize-studio-frontend-4mDa6` | Claude (other session) | 2026-04-26 | 4 | Already squash-landed as PR #143 ("TRIBE-inspired multimodal patient-state simulator"). Likely safe to delete after confirming. |
| `launch-readiness-audit` | yildirimali | 2026-04-26 | 30 | Long-running rollup — 30 commits ahead. Most likely superseded by the night-shift work. Owner triage needed. |
| `overnight/2026-04-26-deep-pass` | ali | 2026-04-26 | 28 | Earlier overnight session output — superseded by PR #144 (this night). Owner triage. |
| `web/split-clinical-tools-bundle` | yildirimali | 2026-04-25 | 1 | Perf code-split. Small. Owner can rebase + open PR. |
| `practice/programs-page` | yildirimali | 2026-04-25 | 1 | New Programs page feature. Small. Owner can rebase + open PR. |
| `feat/qeeg-web-3d` | yildirimali | 2026-04-25 | 1 | qEEG 3D viewer payloads. Small. May overlap with night-shift qEEG work — owner verify. |
| `integrate/mri-qeeg-fusion-timeline` | yildirimali | 2026-04-24 | 4 | Multimodal fusion timeline. Likely overlaps with current fusion router. Owner verify. |
| `feature/qeeg-clinical-survey` | yildirimali | 2026-04-24 | 2 | qEEG clinical survey feature. Small-medium. |
| `feature/evidence-rag-87k-corpus` | yildirimali | 2026-04-24 | 1 | Likely superseded by `feat/evidence-87k-corpus` and current evidence layer. |
| `feat/qeeg-analyzer-mne-parity` | yildirimali | 2026-04-24 | 8 | Likely superseded by night-shift qEEG work + earlier merged `feat/qeeg-mne-pipeline-integration`. |
| `feat/evidence-87k-corpus` | yildirimali | 2026-04-24 | 1 | Likely superseded by `feature/evidence-rag-87k-corpus` and the merged evidence layer. |
| `feat/biomarkers-reference-page` | yildirimali | 2026-04-24 | 7 | Biomarkers page. Owner triage. |
| `backup-feat-mri-ai-upgrades-aa28508` | yildirimali | 2026-04-24 | 1 | Backup branch — `feat/mri-ai-upgrades` already merged. Safe to delete after sanity check. |
| `feat/protocol-studio-evidence-wiring` | yildirimali | 2026-04-22 | 1 | Likely superseded by current evidence layer. |
| `feat/netlify-api-proxy` | yildirimali | 2026-04-19 | 1 | Already in `netlify.toml` on main (proxy is live). Safe to delete after diff check. |

## Why I'm not auto-rebasing the rest

The harness sandbox blocks an agent from rebasing + merging another author's branch unilaterally. That is correct: rebasing someone else's WIP can silently break their assumptions, lose intermediate commits, or land features they hadn't approved for production. The owner needs to do the rebase or explicitly authorize an agent for each branch.

For each unmerged branch above, the owner should either:
1. **Rebase + open PR + merge** (if still wanted)
2. **Delete** (if abandoned or superseded)
3. **Tag for later** (if blocked on something external)

## Open PRs

| PR | Title | State | Recommendation |
|---|---|---|---|
| #126 | Clinical/bmp on split | OPEN, CI failing (E2E + Backend Tests + e2e), 2 days old | Author triage. Either fix CI + merge, or close. |

(All other PRs from this session — #144, #145, #146, #147, #150 — are MERGED.)
