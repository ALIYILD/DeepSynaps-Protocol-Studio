# Governance Lock — Post-Salvage Stabilization Era

**Date:** 2026-05-17
**Wave endpoint commit:** `76c51a6d`
**Annotated tag:** `post-salvage-stabilization-2026-05-17`
**Baseline snapshot:** [`docs/stabilization/post-salvage-baseline-2026-05-17.md`](./post-salvage-baseline-2026-05-17.md) (PR #982)
**Audit classification:** CLEAN with MINOR pre-existing drift

This document is the **final governance/handoff layer** for the 2026-05-17 DeepSynaps Protocol Studio salvage wave. It formally closes the salvage era and protects future workstreams from contamination, accidental resurrection, and uncontrolled drift.

This is governance / documentation / process only. No runtime code, no routing changes, no CI changes, no DeepSynaps clinical-behavior changes, no overlay or marketplace flow changes.

---

## 1. The Governance Lock

The following two tables are the authoritative reference for the abandoned vs preserved boundary established by this wave. The audit (`docs/stabilization/post-salvage-baseline-2026-05-17.md` § Audit Conclusions) verified that **all "abandoned" symbols return 0 hits across `apps/web/src/`**.

### 1.1 ABANDONED / DO NOT RESURRECT

These symbols, files, and patterns were intentionally NOT brought to `main` by the salvage wave. They represent an alternate architecture that competed with `main`'s live UI and was rejected. Future contributors **must not re-introduce them**, even if they look like an "obvious improvement," without an explicit task that names the architectural reversal as its stated goal.

| Symbol / pattern | What it was | Why it was rejected |
|---|---|---|
| `_renderAgentSetupWizard` | Alternate hire-flow renderer | Competed with live `_renderHireWizard` at 5 tab-render call-sites |
| `_setupWizardAgent` | Wizard state: current agent | Part of the scattered state machine |
| `_setupWizardStep` | Wizard state: current step | Part of the scattered state machine |
| `_setupWizardConfig` | Wizard state: tool / scope draft | Part of the scattered state machine |
| `_setupWizardLoading` | Wizard state: in-flight flag | Part of the scattered state machine |
| `_setupWizardError` | Wizard state: error string | Part of the scattered state machine |
| The 5 tab-render call-sites where `${toolOverlay}${hireOverlay}` was replaced with `${_renderAgentSetupWizard()}` | Overlay replacement at the catalog / control-centre / activation / ops / prompts tabs | Replaced live overlays with an alternate; not incremental, not salvage |
| Wholesale "overlay replacement" patches | Any patch that swaps the live overlay system for an alternate render path | Architectural surgery, not salvage |
| Wholesale "modal replacement" surgery | Any patch that re-routes the marketplace modal lifecycle | Same — architectural |
| Setup-wizard lineage broadly | The full `_setupWizard*` state machine + `_renderAgentSetupWizard` renderer + window helpers like `window._agentSetupWizardNext/Back/Complete` | The wave aborted this in PR-C and shipped the additive minimum in PR #981 instead |

**Verification:** The post-merge audit greps `apps/web/src/` for each symbol above. Re-introducing any of them must be flagged in code review as a governance violation unless the PR's stated scope is an explicit architectural reversal of this decision.

### 1.2 PRESERVED / LIVE

These symbols and flows pre-existed the salvage wave and remain LIVE. They were intentionally preserved. Future contributors **must not "clean up"** these systems on the assumption that they look similar to the abandoned wizard. They are different surfaces.

| Symbol / flow | What it is | Status |
|---|---|---|
| `toolOverlay` (6 refs in `pages-agents.js`) | Live tool-permission overlay variable threaded into tab renders | PRESERVED |
| `hireOverlay` (6 refs in `pages-agents.js`) | Live hire-flow overlay variable threaded into tab renders | PRESERVED |
| `marketplaceModal` (70 refs) | Live marketplace modal lifecycle | PRESERVED |
| `_renderMarketplaceModal` (7 refs) | Live renderer for the marketplace modal | PRESERVED |
| `_marketplaceModalExecuted` (9 refs) | Live execution tracker for marketplace modal | PRESERVED |
| `_renderHireWizard` (5 refs) | Live 3-step hire wizard (Step 1 Billing plan · Step 2 Data scope · Step 3 Tool scope, line 3642). **NOT the abandoned setup wizard.** | PRESERVED |
| `_hireWizardAgent` (12 refs) | Live state: which agent the hire wizard is currently configured for | PRESERVED |
| `_renderToolPermissionPanel` (5 refs) | Live tool-permission inline panel renderer | PRESERVED |
| `_toolPermissionAgentId` (7 refs) | Live state: which agent the tool-permission panel is open for | PRESERVED |
| All 71 `window._agent*` handlers | Live click / form / re-render handlers across the AI Agents page | PRESERVED |
| `class="ds-modal-overlay"` + `class="ds-modal"` | Live CSS classes used by the live hire wizard's modal | PRESERVED |
| `_agentsOrDemo` / `_isMarketplaceDemoMode` / `MARKETPLACE_DEMO_AGENTS` | Honest demo fallback with explicit labels | PRESERVED |
| `_resolvePatientContextLabel()` reading `window._patientRoster` + `localStorage.ds_selected_patient_id` | The contract PR #981's picker hooked into | PRESERVED |

**Verification:** Every entry above has > 0 references in `pages-agents.js`. Cleanup or refactoring that removes any of these without explicit scope must be rejected in code review.

---

## 2. Stabilization-Sensitive Surfaces

The full list of surfaces requiring explicit approval before modification lives in [`docs/engineering/runtime-critical-surface-protection.md`](../engineering/runtime-critical-surface-protection.md). This wave adds the concept of **"stabilization-sensitive surfaces"** — a subset of runtime-critical surfaces where the post-salvage discipline applies most strongly.

A surface is **stabilization-sensitive** if **any** of these is true:

1. It was preserved or abandoned by name in § 1 above.
2. It is touched by the live marketplace / hire-wizard / tool-permission overlay system on the AI Agents page.
3. It is referenced by `docs/engineering/runtime-critical-surface-protection.md`'s § "Frontend overlay surface (concurrent-edit hotspot)".
4. It is a routing entry under `apps/web/src/navigation/` that points at an agent surface or marketplace surface.
5. It is the operational resilience layer (Hermes — pending separate workstream).
6. It is a DeepSynaps clinical-runtime surface (clinical-hub renderers, evidence DB read path, patient hub renderers, scheduling engine, course lifecycle, monitoring + wearables, AE submission).
7. It is a security-governance enforcement layer (banned-language enforcement, claim governance, cross-clinic tenant gates, role gates, auth contracts).

For each of these, the rule is **additive-only unless the PR's stated task explicitly names the surface**.

Cleanup PRs may NEVER touch stabilization-sensitive surfaces. If a cleanup PR's diff brushes against one of these surfaces, the PR is misscoped — split or abort per `docs/engineering/salvage-pr-governance.md` § Abort conditions.

---

## 3. Workstream Separation

The salvage era is closed. The following workstreams are approved to begin independently from this baseline. **Each must run in its own PR lane with no mixing into the others.**

### 3.1 Approved independent lanes

1. **Hermes operational resilience layer** — owned by the Hermes operational track. Separate worktree, separate branches, separate PRs.
2. **torch 2.6 security upgrade** — currently in flight on branches matching `fix/security-torch-*`. Owned by the security/dependency track.
3. **Future architecture modernization** — must be scoped per-task with explicit task ownership; must respect § 1.2 PRESERVED list and `docs/engineering/runtime-critical-surface-protection.md`.
4. **Explicit clinician UX redesign** — must be scoped per-task; cannot be folded into other lanes. Any UX work that touches `pages-agents.js` overlays falls under § 1 and § 2 above.
5. **Evidence pipeline evolution** — owned by the evidence/ingest track. Separate from agent UI, separate from clinical-hub renderers.

### 3.2 Explicitly prohibited mixing

The following combinations are **not allowed** in a single PR:

| Forbidden mix | Why |
|---|---|
| Stabilization cleanup + infrastructure (Hermes / torch / CI / Docker) | Mixed scope hides drift; cleanup hides under "needed for infrastructure" |
| Architecture rewrite + security PR (torch upgrade, dep bump, CVE fix) | Reviewers approve the security fix and inadvertently approve the rewrite |
| Overlay redesign + operational work (Hermes / monitoring / metrics) | Overlay surface is in § 1; not in operational work scope |
| Clinical-runtime change + evidence-pipeline change | Two different surfaces; review by different specialists |
| Routing / sidebar change + agent UX change | Routing belongs to `apps/web/src/navigation/`; agent UX in `pages-agents.js` |
| "While I'm here" cleanup + anything | Pre-empted by `docs/engineering/pr-hygiene-and-drift-disclosure.md` § Single-concern test |

If a contributor (human or AI agent) finds genuine cross-cutting work, they must:

1. Stop.
2. Split the work into N PRs, one per lane.
3. Order them sequentially.
4. Land them one at a time.

There is **no exception** for "small mixed PRs". Small mixed PRs are the largest single cause of branch archaeology cost in this repo.

---

## 4. PR Governance Rules

The following rules apply to **every PR landing on this repo from this baseline forward**, regardless of workstream. They restate and extend the rules established by `docs/engineering/salvage-pr-governance.md` (PR #977) and `docs/engineering/pr-hygiene-and-drift-disclosure.md` (PR #979).

### 4.1 The five rules

1. **Additive re-authoring is preferred over contaminated cherry-picks.** When a stash, fork, or stale clone holds work that conflicts architecturally with `main`, hand-craft a new minimal patch using the original as reference only. PR #981 vs the aborted PR-C is the canonical example (52 lines additive vs 735 lines of overlay surgery).
2. **Abort > unsafe salvage.** When the work grows beyond stated scope, when conflicts proliferate, when state starts looking scattered, **stop**. Abort the PR, leave the source intact, document the decision. The work will still exist tomorrow; a corrupted `main` will not.
3. **Disclose drift honestly.** If `main` moved on the touched files between when the PR branched and when it was opened, say so in a `## Drift` section. If a test fails on `main` independently of the PR's diff, name the failure mode and the lane it belongs to.
4. **Preserve live systems unless proven dead.** A symbol with > 0 references in `apps/web/src/` is presumed alive. Verify before deleting. Default to keeping.
5. **No overlay surgery without explicit scope.** Any PR that changes how an overlay is rendered or what it renders is architectural, not incremental. If the task description doesn't say "modify the X overlay," the PR must not modify the X overlay.

### 4.2 Mandatory PR checklist for stabilization-sensitive work

Any PR touching the surfaces named in § 1 (PRESERVED), the surfaces in `docs/engineering/runtime-critical-surface-protection.md`, or routing entries under `apps/web/src/navigation/` **MUST** include the following sections in its PR body. Use the opt-in template at `.github/PULL_REQUEST_TEMPLATE/stabilization-sensitive.md` by appending `?template=stabilization-sensitive.md` to the New PR URL.

- `## Summary` — 1–3 sentences, user-visible impact first.
- `## Stabilization-sensitive surfaces touched` — name each surface from § 1 or `runtime-critical-surface-protection.md`. If none, state "none".
- `## Governance lock acknowledgement` — explicit "I have read `docs/stabilization/governance-lock-2026-05-17.md` § 1 and confirm this PR does NOT re-introduce any ABANDONED symbol."
- `## Additive-only declaration` — explicit "This PR is additive-only on stabilization-sensitive surfaces" OR cite the explicit task ownership that authorizes non-additive change.
- `## Drift` — if `main` moved on touched files.
- `## Test plan` — bulleted, marked-checked only what was actually run.
- `## Abort considered?` — if you nearly aborted but proceeded, name what tipped the decision.

The checklist is enforced by **human review**, not by CI. Reviewers must reject PRs touching stabilization-sensitive surfaces without these sections.

---

## 5. Audit Traceability Map

Future reviewers can reconstruct the entire salvage wave from the following artifacts. No branch archaeology required.

| Artifact | Location | Purpose |
|---|---|---|
| **Annotated tag** | `post-salvage-stabilization-2026-05-17` (origin) → `76c51a6d` | Wave endpoint marker; tag message lists all 8 merged PRs by squash SHA |
| **Baseline snapshot** | [`docs/stabilization/post-salvage-baseline-2026-05-17.md`](./post-salvage-baseline-2026-05-17.md) (PR #982) | Audit conclusions, preserved/abandoned rationale, hygiene snapshot, honest disclosures |
| **This governance lock** | `docs/stabilization/governance-lock-2026-05-17.md` (this file) | Final handoff; governance rules; workstream separation; PR checklist |
| **Salvage governance** | [`docs/engineering/salvage-pr-governance.md`](../engineering/salvage-pr-governance.md) (PR #977) | Process for any future stale-clone salvage |
| **Concurrent-agent safety** | [`docs/engineering/concurrent-agent-safety.md`](../engineering/concurrent-agent-safety.md) (PR #979) | Multi-session collaboration patterns |
| **Worktree discipline** | [`docs/engineering/worktree-discipline.md`](../engineering/worktree-discipline.md) (PR #979) | Worktree-per-PR workflow |
| **PR hygiene + drift disclosure** | [`docs/engineering/pr-hygiene-and-drift-disclosure.md`](../engineering/pr-hygiene-and-drift-disclosure.md) (PR #979) | Single-concern PRs, Provenance + Drift sections |
| **Runtime-critical surfaces** | [`docs/engineering/runtime-critical-surface-protection.md`](../engineering/runtime-critical-surface-protection.md) (PR #979, updated this wave) | Surfaces requiring additive-only discipline; now includes "stabilization-sensitive surfaces" section |
| **Future safeguards** | [`docs/engineering/future-safeguards.md`](../engineering/future-safeguards.md) (PR #979) | Design space for candidate CI checks |
| **Salvage PR template** | `.github/PULL_REQUEST_TEMPLATE/salvage.md` (PR #979) | Opt-in via `?template=salvage.md` for stash / stale-clone recovery PRs |
| **Stabilization-sensitive PR template** | `.github/PULL_REQUEST_TEMPLATE/stabilization-sensitive.md` (this PR) | Opt-in via `?template=stabilization-sensitive.md` for any PR touching § 1 surfaces |
| **Salvage map memory** | `~/.claude/projects/-Users-aliyildirim/memory/deepsynaps-stash-salvage-map-2026-05-17.md` | Local memory entry with stash-by-stash triage, dropped SHAs backed up to `/tmp/stash-backup/` |
| **Subagent denial memory** | `~/.claude/projects/-Users-aliyildirim/memory/openclaw-subagent-write-tool-denial.md` | Why writes were foreground-only |
| **Merged wave PRs** | #971, #972, #973, #975, #976, #977, #979, #981 | The 8 squash commits land on main and are reachable via `git log 76c51a6d --first-parent` |
| **Aborted PR-C** | Documented in baseline snapshot § Abandoned Systems and salvage-pr-governance § Overlay coupling warning | The cautionary case — never landed |
| **Superseded stash@{1}** | Documented in baseline snapshot § Merge Wave Summary | Early-scaffold routers (76/121/77 lines) main grew past (3490/454/972 lines); never filed |

Anyone investigating "why does `pages-agents.js` look the way it does on 2026-05-17 forward" can read this index top-to-bottom and have the complete picture.

---

## 6. Honest Reporting — What This Baseline Does NOT Resolve

Per the project's "honest state reporting" pattern, the following items are explicitly **unresolved** by this governance lock. They are not contamination from the salvage wave; they are pre-existing or open-ended state that the lock does not pretend to fix.

### 6.1 What remains intentionally unresolved

- **78 orphan local branches** in the active clone. Read-only count only; not auto-pruned. Future cleanup is an explicit task, not part of this lock.
- **Stash@{0} on the Desktop clone** (P1 IDOR branch parent, mixed content). Kept as forensic reference for un-salvaged bits (`index.html` SW kill-switch re-register, `app.js` ~30 lines, `neuro-biomarker-data.js` +17, `complexity.py`, several `.test.js`). Future decision is an explicit task.
- **PR #982** (baseline snapshot) is OPEN at the time this lock is filed. The cross-link from this doc to the baseline doc assumes both will land. If #982 is rejected or substantially rewritten, this lock will need a follow-up.

### 6.2 Pre-existing drift

- **`ds_selected_patient_id` vs `ds_ppv_patient_id`** — two different localStorage keys for "selected patient" state. Pre-existing namespace fragmentation. Consolidating is a cross-surface refactor that needs explicit task ownership.
- **`ds_marketplace_*` keys in `pages-knowledge-extras.js`** — for a knowledge marketplace, distinct from the agent marketplace. Ambiguous naming, pre-existing.
- **CI on `main`** is red across pre-existing lanes (Router Schema Lint on `wellness_router.py:171-194`, web-unit assertion-drift, Build & Type Check, Backend Smoke, Bandit, ESLint Security, npm audit, Frontend coverage). Not introduced by the wave; not resolved by this lock.

### 6.3 What future contributors should avoid touching

- Everything in § 1.2 PRESERVED.
- Everything in `docs/engineering/runtime-critical-surface-protection.md` § "DO NOT TOUCH" lists.
- `CLAUDE.md` (root) — actively edited by other sessions; the file's own concurrent-session warning applies.
- The remaining 1 stash on the Desktop clone — forensic reference.
- The annotated tag `post-salvage-stabilization-2026-05-17` — do not delete or move. Use new tags for future baselines.
- `docs/stabilization/post-salvage-baseline-2026-05-17.md` (PR #982) — immutable historical record once it lands; corrections via new entries, not edits.

### 6.4 Assumptions

- That `origin` is the canonical remote for this repo, and that the merged wave's squash commits will not be force-pushed away by any out-of-band administrative action.
- That `docs/engineering/*` (PRs #977 + #979) and `docs/stabilization/*` (PRs #982 + this one) will land and remain on `main`.
- That future contributors will read this lock before making changes to stabilization-sensitive surfaces. The lock is a contract enforced by code review, not by tooling.
- That the next infrastructure / security wave will run in independent lanes per § 3.1 and respect § 3.2 prohibitions.
- That the human operator retains final authority over the workstream split — this document does not preempt that.

### 6.5 What still depends on human discipline

- **Recognising stabilization-sensitive surfaces in a PR diff.** No CI gate enforces the § 1 list. Reviewers must catch attempts to touch ABANDONED symbols or to re-render PRESERVED systems.
- **Splitting cross-cutting work into independent PRs.** The § 3.2 prohibitions are advisory; a contributor can technically file a mixed PR. Reviewers must reject mixed PRs at review time.
- **Using the opt-in PR templates.** GitHub does not enforce template usage; contributors must remember to append `?template=stabilization-sensitive.md` or `?template=salvage.md` when appropriate.
- **Updating the memory + governance docs when this lock becomes stale.** A future wave (e.g. when the abandoned wizard surface is genuinely revived as a real product decision) will need a new lock that supersedes this one. Do not edit this file; supersede it.
- **Honoring the prohibition on auto-cleanup.** This lock does not auto-prune branches, drop stashes, delete worktrees, or modify `main`. Future contributors must continue this discipline.

---

## 7. Final Governance Classification

**SALVAGE ERA: FORMALLY CLOSED.**

- Wave endpoint: `76c51a6d`
- Tag: `post-salvage-stabilization-2026-05-17`
- Baseline snapshot: PR #982
- This lock: filed at the same time as the lock acknowledgement PR
- Wizard contamination: **none detected**, **must not be re-introduced** without explicit architectural-reversal scope
- Live overlay / marketplace / hire-wizard systems: **preserved**, **must not be "cleaned up"** without explicit scope
- Future workstreams: **separated into independent lanes** per § 3
- Cleanup, branch archaeology, stash retirement, worktree pruning: **deferred** to explicit per-item tasks; not part of this lock
- Audit traceability: **complete** via § 5

The salvage era ends here. The next wave (whatever it is) starts cleanly from this point.
