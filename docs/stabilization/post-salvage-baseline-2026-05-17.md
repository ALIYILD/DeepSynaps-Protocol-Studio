# Post-Salvage Stabilization Baseline — 2026-05-17

**Tag:** `post-salvage-stabilization-2026-05-17`
**Wave endpoint commit:** `76c51a6d` (PR #981 squash)
**Audit classification:** CLEAN with MINOR pre-existing drift
**Wizard-system contamination:** None detected

This document is the post-merge baseline checkpoint for the 2026-05-17 salvage wave. It exists so the next infrastructure / security wave (Hermes operational resilience, torch 2.6 upgrade) starts from a known-good state with explicit provenance and a clear "do not touch" boundary.

This is a baseline + governance document. Not a feature design, not a refactor plan, not a cleanup queue.

## Merge Wave Summary

Eight PRs filed and merged on 2026-05-17. All sourced from triage of a stale `~/Desktop/DeepSynaps-Protocol-Studio` clone (760 commits behind main, 4 stashes, 4 untracked files) plus operational governance follow-on.

| PR | Squash commit | Title | Source |
|---|---|---|---|
| [#971](https://github.com/ALIYILD/DeepSynaps-Protocol-Studio/pull/971) | `1bed59ca` | `fix(netlify): no-cache headers for sw.js, studio.html, manifest.json` | Desktop stash@{0} `netlify.toml` block — companion to #970 cache-nuke |
| [#972](https://github.com/ALIYILD/DeepSynaps-Protocol-Studio/pull/972) | `9cce56e0` | `feat(api): complete per-clinic agent-config (model + router + tests)` | Desktop stash@{0} backend bits + Desktop untracked router + test |
| [#973](https://github.com/ALIYILD/DeepSynaps-Protocol-Studio/pull/973) | `7660a5e4` | `test(web): complete DOM polyfill in patient-analytics evidence test` | Desktop stash@{3} (main had a partial polyfill; took the stash's superset) |
| [#975](https://github.com/ALIYILD/DeepSynaps-Protocol-Studio/pull/975) | `52ec4335` | `fix(web): honest empty-state toasts across clinical-tools + practice` | Desktop stash@{2} — 8 toast-copy edits |
| [#976](https://github.com/ALIYILD/DeepSynaps-Protocol-Studio/pull/976) | `cb310e13` | `feat(web): video-assessments AI-summary feedback as a draft` | Desktop stash@{0} pages-video-assessments .js + .test.js |
| [#977](https://github.com/ALIYILD/DeepSynaps-Protocol-Studio/pull/977) | `7c5af2b5` | `docs(engineering): salvage-PR governance for stale-clone recovery` | Process docs from the wave's lessons |
| [#979](https://github.com/ALIYILD/DeepSynaps-Protocol-Studio/pull/979) | `534e9321` | `docs(governance): operational hardening — concurrent-agent + worktree + PR-hygiene + runtime-surface protection` | Process docs follow-on |
| [#981](https://github.com/ALIYILD/DeepSynaps-Protocol-Studio/pull/981) | `76c51a6d` | `feat(web): AI Agents patient picker + dismissable welcome banner (minimal re-author)` | Hand re-authored from scratch — wizard architecture explicitly DROPPED |

Stash@{1} (early-scaffold deeptwin / device_sync / protocol_studio routers, 76/121/77 lines) was **superseded** — main had grown those routers to 3490/454/972 lines independently. No salvage value; not filed.

The original 735-line PR-C salvage attempt was **aborted** on 2026-05-17 because it would have replaced main's live `toolOverlay`/`hireOverlay` system at 5 call-sites with a `_renderAgentSetupWizard` system whose state machine was scattered across the file. PR #981 is the minimal additive re-author that ships only the patient picker + welcome banner — no overlay touches.

## Audit Conclusions

Comprehensive read-only audit was performed against `main` at commit `5b7caf69` (the snapshot just before PR #981 merged) covering 515 `.js` files in `apps/web/src/`. The audit's primary finding:

> **Zero contamination from the abandoned setup-wizard architecture survives on `main`.** All abandoned symbols (`_renderAgentSetupWizard`, `_setupWizardAgent`, `_setupWizardStep`, `_setupWizardConfig`, `_setupWizardLoading`, `_setupWizardError`) return 0 hits across `apps/web/src/`. The live overlay/modal system (`toolOverlay`, `hireOverlay`, `marketplaceModal`, `_renderHireWizard`, `_renderMarketplaceModal`, `_renderToolPermissionPanel`) pre-existed the salvage wave and is the legitimate UI; the salvage discipline correctly preserved it.

The audit verified:

- 71 `window._agent*` handlers — all defined, all referenced (no orphans, no broken refs)
- 0 handlers in `window._wizard*` / `window._marketplace*` / `window._modal*` / `window._overlay*` namespaces
- 0 dead imports in `pages-agents.js`
- `node --check apps/web/src/pages-agents.js` passes
- 0 `addEventListener` / 0 `removeEventListener` in `pages-agents.js` — no programmatic event-listener leak risk; the page uses inline `onclick=` in template literals
- Demo mode is honestly labeled (`ai-agent-v2-demo-banner`, "Demo / synthetic" badge, "not real patient data" copy)
- Sidebar routes (`/ecosystem/agents`, `/ecosystem/marketplace`) registered in `apps/web/src/navigation/clinicianSidebar.js` resolve to live pages

Final classification: **CLEAN** with **MINOR pre-existing drift** — see § Known Drift below.

## Preserved Systems (rationale)

These pre-existed the salvage wave and remain live. They were **intentionally preserved** because they are the legitimate UI, not contamination:

- `toolOverlay`, `hireOverlay` in `pages-agents.js` (6 references each) — live marketplace tool-permission + hire flow overlays
- `marketplaceModal` / `_renderMarketplaceModal` / `_marketplaceModalExecuted` — live marketplace modal lifecycle
- `_renderHireWizard` / `_hireWizardAgent` (12 references) — live 3-step hire wizard ("Step 1: Billing plan · Step 2: Data scope · Step 3: Tool scope" at line 3642). **This is NOT the abandoned setup wizard.**
- `_renderToolPermissionPanel` / `_toolPermissionAgentId` — live tool permission panel
- All 71 `window._agent*` handlers — all referenced from inline HTML handlers in the template-literal renderers
- `class="ds-modal-overlay"` + `class="ds-modal"` — live hire-wizard modal styling
- `_agentsOrDemo` / `_isMarketplaceDemoMode` / `MARKETPLACE_DEMO_AGENTS` — honest demo fallback with explicit labels
- `_resolvePatientContextLabel()` reading `window._patientRoster` + `localStorage.ds_selected_patient_id` — the contract PR #981's picker hooked into

Rationale: salvage discipline rejected any patch that would have replaced these. Replacing them would have been architecture surgery, not salvage.

## Abandoned Systems (rationale)

These were in the original PR-C salvage candidate and were **intentionally NOT brought to main**:

- `_renderAgentSetupWizard` — alternate hire flow that competed with the live `_renderHireWizard`
- `_setupWizardAgent`, `_setupWizardStep`, `_setupWizardConfig`, `_setupWizardLoading`, `_setupWizardError` — state machine for that alternate flow, originally scattered through `pages-agents.js`
- The 5 tab-render call-sites where the original patch replaced `${toolOverlay}${hireOverlay}` with `${_renderAgentSetupWizard()}` — replacing live overlays with an alternate that main had moved past

Rationale: main moved past the wizard pattern. Bringing it back would have been a parallel-implementation regression, not a salvage. The "abort > unsafe salvage" rule from `docs/engineering/salvage-pr-governance.md` applies here as the cautionary reference case.

What WAS salvaged from the same workstream — strictly additive, no overlay touches:

- The patient picker dropdown inside `_renderAiAgentV2PatientContextPanel` (~14 lines, opt-in on `window._patientRoster`)
- `_renderAgentV2WelcomeBanner` — dismissable 3-step onboarding banner (~18 lines, localStorage-gated)
- `window._agentSelectPatient` + `window._agentDismissWelcome` (~14 lines, same pattern as existing `window._agent*` handlers)
- One `${_renderAgentV2WelcomeBanner()}` call site in `_renderHub`

Total: 52 lines additive in PR #981, zero deletions, zero overlay touches.

## Known Drift (pre-existing, NOT introduced by this wave)

The audit surfaced three minor pre-existing drift items. None are contamination from the salvage wave. None are recommended for cleanup in this baseline.

1. **`ds_selected_patient_id` vs `ds_ppv_patient_id`** — two different localStorage keys hold "currently selected patient" state in different page surfaces (`pages-virtualcare.js` + `pages-agents.js` + `pages-video-assessments.js` use the first; `pages-clinical-tools.js` uses the second). Pre-existing namespace fragmentation. Consolidating is a real cross-surface refactor that needs explicit task ownership.
2. **`ds_selected_patient_id` previously had no `removeItem` anywhere.** PR #981 added the first `removeItem` path (when the picker is set to the empty option). Other pages still don't clear the key.
3. **`ds_marketplace_*` keys** in `pages-knowledge-extras.js` are for a different marketplace (knowledge / protocols), not the agent marketplace. Naming is ambiguous; pre-existing.

CI on `main` itself is currently red across pre-existing lanes (Router Schema Lint on `wellness_router.py:171-194`, web-unit assertion-drift, etc.). This pre-existed every PR in this wave and is not a wave finding. Documented in `docs/engineering/runtime-critical-surface-protection.md`.

## Repo Hygiene Snapshot (no auto-cleanup performed)

Captured at the moment this baseline was written. **Nothing was auto-deleted or auto-pruned.** Listed here only so the next wave starts with eyes open.

- **Worktrees:** 18 total
  - 1 active clone (`~/DeepSynaps-Protocol-Studio`, currently on `fix/security-torch-load-governance` — set by another concurrent session)
  - 1 `~/.deepsynaps-cron` (runtime)
  - 5 `~/.hermes/{worktrees,kanban}/...` (Hermes-owned)
  - 1 `~/DeepSynaps-Protocol-Studio-pr877` (user-named)
  - 1 `~/dsps-web-assertion-drift` (user-named)
  - 9 `.claude/worktrees/agent-*` (mix of 3 live + 6 dirty preserved)
- **Local branches:** 88 total
  - 10 on remote (live)
  - **78 orphan** (no remote — branches were deleted from origin but kept locally). All 8 salvage-wave branches landed via squash-merge with `--delete-branch`; the orphans here are predominantly older agent-launched branches accumulated over weeks. Pruning is local-only cleanup; deferred.
- **Stashes (active clone):** 4
  - `stash@{0}` — `concurrent-session WIP (apps/web/src) — preserved before assertion-drift lane`
  - `stash@{1}` — `WIP on quarantine-patient-runtime-fe-coverage-timeout`
  - `stash@{2}` — `wip/ds-disclaimers-main-dirty-pre-sync-2026-05-10`
  - `stash@{3}` — `WIP on main: docs: Staging readiness report - consent enforcement verification complete`
- **Stashes (Desktop clone, after the 2026-05-17 drop):** 1 remaining — `stash@{0}` (P1 IDOR branch parent, mixed content — kept as forensic reference for un-salvaged bits, see `deepsynaps-stash-salvage-map-2026-05-17` memory)
- **Untracked entries on active clone:** 6 (top-level summary count only — no individual listing per the "no auto-cleanup" rule)
- **Tags created in this wave:** `post-salvage-stabilization-2026-05-17` (annotated, points at `76c51a6d`)
- **CI baseline:** Red on `main` itself across Router Schema Lint, Build & Type Check, Backend Smoke, Frontend coverage, ESLint Security, npm audit, Bandit. These pre-existed the wave; not introduced by it. Most recent activity on main: `Deploy (Blue-Green)` failure → `Rollback` in progress (torch 2.6 upgrade work, separate workstream).

## Governance Lessons

Codified in `docs/engineering/salvage-pr-governance.md` (PR #977) and `docs/engineering/{concurrent-agent-safety,worktree-discipline,pr-hygiene-and-drift-disclosure,runtime-critical-surface-protection,future-safeguards}.md` (PR #979). Restated here for the baseline record:

- **Abort > unsafe salvage.** When the salvage attempt grows beyond its stated scope, when conflicts proliferate, when state starts looking scattered, when the diff stat surprises you — stop, leave the stash intact, write a memo, walk away. The patch will still exist tomorrow; a corrupted `main` will not. PR-C abort + PR #981 minimal re-author is the canonical example.
- **Additive re-authoring > contaminated cherry-picks.** When a salvage candidate is architecturally entangled, hand-craft a new minimal patch from scratch using the abandoned patch as reference only. PR #981's 52 lines (vs the original 735) is the win.
- **Preserve live systems unless proven dead.** `toolOverlay`, `hireOverlay`, the marketplace modal lifecycle, the existing `_renderHireWizard` are LIVE. Replacing them would have been architecture surgery. The audit confirmed they are still in use.
- **No overlay surgery without explicit scope.** Any PR that changes how an overlay is rendered or what it renders is architectural, not incremental. Verify with symbol-grep on the diff (the audit's specific check).
- **Stabilization work must remain scope-disciplined.** This baseline document is governance only. No runtime touches, no feature additions, no cross-surface refactors bundled in. Future stabilization waves should follow the same discipline.

## Next Approved Workstreams

The following workstreams are explicitly approved to begin from this baseline:

1. **Hermes operational resilience layer** — separate workstream, not tied to the salvage wave. Owned by the Hermes operational track.
2. **torch 2.6 security upgrade** — in flight on `fix/security-torch-load-governance` (visible in current worktree list and active CI runs). Owned by the security/dependency track.
3. **Future explicit architecture tasks** — to be scoped individually with explicit task ownership; must respect the "DO NOT TOUCH" list in `docs/engineering/runtime-critical-surface-protection.md`.

**No additional cleanup PRs are required from the salvage audit.** Items in § Known Drift are not stabilization-task material; they require their own explicit task ownership if and when they're worth addressing.

## Honest Reporting (assumptions + what was NOT verified)

Per the project's "honest state reporting" pattern, the following items are explicitly disclosed:

- **What was NOT verified end-to-end:**
  - The patient picker dropdown in PR #981 was syntax-checked (`node --check` OK) and logic-reviewed, but **not exercised in a browser** by this session. A manual test plan is in the PR body — reviewer or QA must execute.
  - Full backend integration of the agent-config feature (#972) was smoke-tested for imports but **not exercised end-to-end** locally (system Python is 3.8 here, project is 3.10+).
  - CI is red on main itself for reasons unrelated to this wave. None of the wave's PRs introduce a new CI failure, but **none of them cause CI to go green either**.
  - The 1 remaining stash on the Desktop clone (`stash@{0}`) was inspected only at the file-list level. Detailed line-level forensics on the un-salvaged bits (index.html SW kill-switch re-register, `app.js` ~30 lines, `neuro-biomarker-data.js` +17, `complexity.py`, several `.test.js` files) was not performed.
  - The 78 orphan local branches were not individually inspected for unique work. They are presumed safe to delete eventually; this baseline does not commit to that decision.
- **What remains pre-existing drift:**
  - The two patient-id localStorage keys (`ds_selected_patient_id`, `ds_ppv_patient_id`)
  - The `ds_marketplace_*` keys (knowledge marketplace, distinct from agent marketplace)
  - The 88 local branches / 78 orphans accumulation
  - CI-on-main being red
- **What future reviewers / agents should avoid touching:**
  - The "DO NOT TOUCH" lists in `docs/engineering/runtime-critical-surface-protection.md` (clinical safety, evidence policy, API contracts, scheduling, courses, overlays, CI workflows, Alembic migrations)
  - The live `toolOverlay` / `hireOverlay` / `_renderHireWizard` / marketplace modal system on `pages-agents.js` — preserved deliberately by this wave
  - `CLAUDE.md` (root) — actively edited by other sessions
  - Stash@{0} on the Desktop clone — kept intentionally as forensic reference
- **What operational work is still pending:**
  - torch 2.6 upgrade (in flight on `fix/security-torch-load-governance`, separate workstream)
  - Hermes operational resilience layer (not yet started in this repo)
  - The 39 web-unit test failures in the assertion-drift lane (separately tracked)
  - The `wellness_router.py:171-194` Router Schema Lint failure on main (pre-existing; needs core-schema extraction or `# core-schema-exempt:` markers)
- **Assumptions:**
  - That the next infrastructure / security wave will respect the same `docs/engineering/` process docs.
  - That the user (or the next stabilization wave) will eventually triage the 78 orphan local branches and remaining stashes; this baseline does not auto-clean them.
  - That the merge wave's 8 squash commits represent the complete intended salvage. Any additional work that was in scope but not landed should be raised as new, explicitly-scoped PRs.

## Final Baseline Classification

**STABLE — APPROVED FOR HANDOFF.**

The 2026-05-17 salvage wave is closed. No open PRs from the wave remain. No additional cleanup is required from the audit. The repo is at a known-good checkpoint ready for the next workstream.

Anchor commit: `76c51a6d`
Tag: `post-salvage-stabilization-2026-05-17`
Audit: CLEAN with MINOR pre-existing drift
Wizard contamination: **none detected**
