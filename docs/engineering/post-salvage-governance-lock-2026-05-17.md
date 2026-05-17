# Post-salvage governance lock — 2026-05-17

This document formally closes the salvage stabilization wave and establishes the governance boundary that protects future workstreams from contamination, accidental resurrection, and uncontrolled drift.

It is **governance-only**. It does not change runtime behavior, routing, clinical logic, or any live surface. It is the canonical anchor for what was concluded, what was abandoned, and what must not be touched without an explicit task.

## Status: salvage era CLOSED

| | |
|---|---|
| **Baseline tag** | `post-salvage-stabilization-2026-05-17` |
| **Wave endpoint commit** | `76c51a6d` (PR #981 squash) |
| **Baseline snapshot PR** | #982 (`docs/post-salvage-baseline-snapshot`) |
| **Audit classification** | CLEAN with MINOR pre-existing drift |
| **Wizard-system contamination** | NONE detected |
| **This governance lock PR** | (this doc) |

Companion docs from PR #977 and PR #979:

- [`salvage-pr-governance.md`](./salvage-pr-governance.md) — recovery process from stale clones
- [`runtime-critical-surface-protection.md`](./runtime-critical-surface-protection.md) — surface list + additive-only rules
- [`concurrent-agent-safety.md`](./concurrent-agent-safety.md) — multi-session safety
- [`worktree-discipline.md`](./worktree-discipline.md) — when to escalate to a worktree
- [`pr-hygiene-and-drift-disclosure.md`](./pr-hygiene-and-drift-disclosure.md) — disclosure conventions
- [`future-safeguards.md`](./future-safeguards.md) — opt-in salvage PR template + anchors

This lock sits ON TOP of those — it does not supersede them. It adds the wave-closing specificity (named symbols, named lanes, named prohibitions) that those general-purpose docs intentionally left abstract.

## Abandoned / DO NOT RESURRECT

The following symbols, render paths, and code lineage were attempted during salvage exploration (PR-C / ai-agents UX) and **abandoned** because they entangled architecturally with overlays that are part of the live marketplace state machine. Re-introducing them — even as "we'll just port the design" — is treated as a regression risk equal to the original entanglement.

### Wizard symbol lineage (do not re-create under these names or close variants)

- `_renderAgentSetupWizard`
- `_setupWizardAgent`
- `_setupWizardStep`
- `_setupWizardConfig`
- `_setupWizardLoading`
- `_setupWizardError`
- Any new `_setupWizard*` symbol intended to render an agent-onboarding flow inside `pages-agents.js`

### Lineage patterns (do not reproduce by other names)

- "Overlay replacement patches" — opening one of the live overlays only to mutate it into the wizard render
- "Modal replacement surgery" — replacing `_renderMarketplaceModal` body with a setup wizard
- Anything that treats `toolOverlay` / `hireOverlay` / `marketplaceModal` as an empty container for a new flow

If a future task genuinely needs a setup-wizard pattern, **create a new dedicated surface** (e.g., a new page route, a new isolated component file). Do not graft onto live overlays.

## Preserved / live (DO NOT remove or refactor without an explicit task)

The following are operational. Touching them in the course of cleanup, governance, or infrastructure work is forbidden by this lock.

### Overlay surface (in `apps/web/src/pages-agents.js`)

- `toolOverlay` + its state machine
- `hireOverlay` + its state machine
- `marketplaceModal` + its state machine
- `_renderMarketplaceModal`
- `_renderHireWizard`
- `_renderToolPermissionPanel`
- All other `_render*Overlay*` / `_render*Modal*` paths currently called from the live flow

### Window-attached agent handlers

- All 71 `window._agent*` handlers as of baseline `76c51a6d`. Count and behavior are part of the contract.

### Live marketplace flows

- All marketplace tabs, transitions, and modal lifecycle code paths active at baseline.

### Operational resilience layer (separate concern)

- Hermes credit monitor, ops-mode framework, daily summary, session protection — these live OUTSIDE this repo (on Fly volume). Do not import, mirror, or cross-link from this repo without an explicit task.

## Approved future workstream lanes

The following are recognized independent workstreams. Each lane has its own PR series, its own owner discipline, and **must not mix with the others** in a single PR.

| Lane | Owner-of-record | Scope boundary |
|---|---|---|
| **Hermes operational resilience** | hermes-ops / hermes-fleet agent surface | Outside-repo only. Must not import into DeepSynaps. |
| **torch 2.6 upgrade** | branch `fix/security-torch-load-governance` series | Library + scanner + CI gate. Must not bundle UI refactors, overlay edits, or clinical-logic tweaks. |
| **Future architecture modernization** | TBD | Must arrive via a design doc PR first; no in-place rewrites. |
| **Explicit clinician UX redesign** | TBD | Net-new surfaces or net-new pages. Must not touch the marketplace/overlay state machine without an explicit clinical-UX task. |
| **Evidence pipeline evolution** | deepsynaps-ingest-ops / evidence-pipeline scripts | Outside `apps/api` routers. Curator and ingest only. Router changes require a separate PR. |

A lane is "approved" in the sense that it is recognized as a legitimate workstream — not in the sense that any given PR within it is pre-approved. Each PR still goes through normal review.

## Explicitly prohibited mixing

Do not, in a single PR:

- Mix stabilization cleanup into an infrastructure PR
- Mix architecture rewrites into a security PR
- Mix overlay redesign into operational resilience work
- Mix torch-load safety changes with clinical-logic tweaks
- Mix evidence-pipeline curation with router-layer changes
- Mix governance documentation with runtime code edits (this PR being the boundary example: docs-only, zero code)
- Bundle "while I'm here" cleanup with any change to a runtime-critical surface

The cost of one extra PR is small. The cost of a mixed PR landing without one of the changes being reviewed in its own right is large. The default is **split**.

## PR governance rules (codified)

Adopted from PR #979's hardening suite and extended for the post-salvage era:

1. **Additive re-authoring is preferred over contaminated cherry-picks.** If a stash, branch, or PR is suspect (concurrent-session history, unclear provenance, partially failed CI), re-author the change from scratch with explicit scope rather than salvaging it.
2. **Abort > unsafe salvage.** If a salvage attempt drifts into a runtime-critical surface, abort the salvage. File a fresh task with explicit ownership of the affected surface.
3. **Disclose drift honestly.** Every PR that is rebased onto something other than current `origin/main`, or that touches anything in [`runtime-critical-surface-protection.md`](./runtime-critical-surface-protection.md), must include a `## Runtime surface impact` section in the body per [`pr-hygiene-and-drift-disclosure.md`](./pr-hygiene-and-drift-disclosure.md).
4. **Preserve live systems unless proven dead.** A surface is "dead" only when (a) it has no inbound callers in main, AND (b) a separate task explicitly authorized its removal. Absence of recent edits is not death.
5. **No overlay surgery without explicit scope.** "Refactor overlays" is not a valid scope. A valid scope names the specific overlay, the specific behavior change, and the specific call sites being touched.
6. **No runtime-critical changes in cleanup PRs.** Cleanup PRs ship docs, lint config, formatting, test scaffolding. They do not modify routers, migrations, or overlays.

## Mandatory PR checklist (stabilization-sensitive work)

Copy this block into the PR body for any PR that touches a runtime-critical surface OR claims to be a salvage/recovery PR:

```markdown
### Stabilization-sensitive PR checklist

- [ ] This PR's scope is named in a single sentence and does not exceed it.
- [ ] No code outside the named scope is touched.
- [ ] Runtime-critical surfaces touched: (list, or "none")
- [ ] If any surface listed: I have read `docs/engineering/runtime-critical-surface-protection.md` and the change is justified.
- [ ] If this is a salvage/recovery PR: I have read `docs/engineering/salvage-pr-governance.md` and re-authored rather than cherry-picked any suspect change.
- [ ] I have NOT touched anything in `docs/engineering/post-salvage-governance-lock-2026-05-17.md` § "Abandoned / DO NOT RESURRECT" or § "Preserved / live".
- [ ] Drift disclosure (`## Runtime surface impact` in PR body) is present if applicable.
- [ ] No mixing of lanes (see § "Explicitly prohibited mixing" above).
```

PR reviewers are authorized to request a split if the checklist is filled but the scope still drifts.

## Audit traceability map

For future reviewers reconstructing the salvage wave without branch archaeology:

| Artifact | Where |
|---|---|
| Baseline tag | `git show post-salvage-stabilization-2026-05-17` |
| Wave endpoint | commit `76c51a6d` (PR #981 squash) |
| Baseline snapshot PR | #982 — `docs/post-salvage-baseline-snapshot` |
| Salvage triage map | memory entry `deepsynaps-stash-salvage-map-2026-05-17` |
| Salvage PR governance | PR #977 — `docs/engineering/salvage-pr-governance.md` |
| Operational hardening suite | PR #979 — `docs/engineering/{concurrent-agent-safety,worktree-discipline,pr-hygiene-and-drift-disclosure,runtime-critical-surface-protection,future-safeguards}.md` |
| This governance lock | (this doc) |
| Concurrent-session lessons | `docs/engineering/concurrent-agent-safety.md` + memory `deepsynaps-concurrent-session-chaos`, `deepsynaps-concurrent-session-reset-on-branch`, `deepsynaps-worktree-when-revert-races` |
| Aborted PR-C ai-agents UX | memory `deepsynaps-stash-salvage-map-2026-05-17` § "PR-C ABORTED" |
| Runaway-agent incident | memory `deepsynaps-runaway-agent-master-branch` (separate workstream, archived) |

A future contributor with no prior context should be able to reconstruct the wave by reading: (1) this doc, (2) PR #982, (3) `runtime-critical-surface-protection.md`, (4) `salvage-pr-governance.md`. Anything beyond those four is supplementary.

## Known remaining drift (honest disclosure)

These items are **intentionally unresolved** as of this lock. They are not bugs to fix in a cleanup PR; they are documented so future contributors can stop trying to "fix" them.

1. **`origin/main` is 1 commit past the baseline tag.** Commit `b63eed2c` (sidebar fix) landed after `76c51a6d`. This is classified MINOR pre-existing drift; the audit's CLEAN classification still holds. Future contributors should treat the current `origin/main` HEAD, not the tag, as their actual rebase target.
2. **Pre-existing assertion drift in `apps/web` test suite.** The 39 remaining failures referenced in memory `deepsynaps-web-unit-hard-timeout-fix` are the assertion-drift lane, not the timeout. They are bisect-on-Node-20 work, not cleanup work.
3. **CI hardening lane #884–#887 untouched.** Deliberately deferred per memory `deepsynaps-2026-05-13-stabilization`. Not part of the salvage wave; not in scope for this lock.
4. **PR #845 (legal/DPIA) still open.** Tracked separately; not part of the salvage wave.
5. **~50 accumulated git stashes.** Per memory `deepsynaps-stash-recovery`. NOT to be cleaned automatically. Per the strict rules of this lock, they are left in place pending an explicit cleanup task.
6. **`fix/security-torch-load-governance` branch is locally diverged 41/6 from origin.** Concurrent-session artifact. Not touched by this lock. The torch 2.6 lane (above) owns its own resolution.
7. **`apps/web/src/pages-agents.js` overlay coupling is documented but not refactored.** Per `salvage-pr-governance.md` § "Overlay coupling warning". Refactoring is a separate explicit-clinician-UX-redesign lane.

These are **knowns**. Knowns are safer than unknowns. The lock does not pretend the repo is pristine.

## Human discipline assumptions

This governance lock works only as far as humans (and AI agents acting under human direction) follow the rules. Specifically it assumes:

1. **PR reviewers will enforce the stabilization-sensitive checklist** when it appears (or when its absence is conspicuous on a PR touching a critical surface).
2. **AI agents will read this doc before agreeing to modify anything in `apps/web/src/pages-agents.js`, the marketplace state machine, or anything in the "Preserved / live" list above.**
3. **Lane separation is honored at PR creation time**, not retroactively. A mixed PR is not "fixable" by adding labels — it is fixable only by splitting.
4. **No agent runs `git reset --hard` on a branch it does not own.** Per `concurrent-agent-safety.md`. This includes the agent that wrote this doc.
5. **The baseline tag is treated as authoritative**, not as a starting point to be "improved upon" by retroactive edits. If a fact in this doc turns out to be wrong, the correction goes in a follow-up PR, not in an amendment to the tagged commit.
6. **The `--admin` squash-merge path used when CI is billing-blocked is reserved for genuinely-blocked CI**, not as a way to bypass review on stabilization-sensitive work.

If any of these assumptions break, the lock degrades to a paper document. That is acceptable; the lock is paper, by design. The protection comes from the discipline the document makes legible.

## Final governance classification

**Salvage stabilization era: CLOSED at commit `76c51a6d`, tag `post-salvage-stabilization-2026-05-17`.**

Future work is welcome in any of the approved workstream lanes. Future work that mixes lanes, resurrects the abandoned wizard lineage, or modifies the preserved live overlays without an explicit task will be flagged for split or revert in review.

The principle behind every rule in this doc is one sentence:

> Live systems are protected by default; abandoned systems stay abandoned.

If a future PR would have to argue against either half of that sentence, it is the wrong PR.
