# Kimi master-branch salvage — 2026-05-18

## What this is

Cherry-picked copies of the **89 markdown files** that existed on `origin/master` but not on `main` as of 2026-05-18.

`origin/master` was a long-divergent branch (3,096 commits **behind** main, 48 commits ahead) onto which a "Kimi" agent — and other agents identifying as `DeepSynaps Agent <agent@deepsynaps.ai>` — pushed planning docs, audit reports, beta-pilot pack content, and PR/runbook drafts over a ~28-hour window ending 2026-05-17.

The branch could not be merged or made default because doing so would have deleted ~13 CI workflows, the salvage / stabilization-sensitive PR templates, the torch.load CVE audit work, the knowledge layer endpoints, and roughly 3,000 commits worth of mainline progress.

These docs are **copied as-is** and **NOT YET AUDITED**. Each was written against a snapshot of the codebase that no longer exists.

## What needs to happen before any of this graduates to canonical docs

For every file in this directory, an auditor needs to confirm:

1. **Factual accuracy against current main.** Endpoint names, file paths, role names, service names, env var names, port numbers, table names, migration revisions — all may have moved.
2. **No contradictions with newer doc in the same area.** Compare against `docs/engineering/`, `docs/rebase-2026-05-18/`, `docs/security/`, etc. Newer docs take precedence.
3. **No regulatory / clinical-governance regressions in copy.** Several of the files (`FINAL_LAUNCH_RECOMMENDATION.md`, `FINAL_DEMO_LIVE_BOUNDARY_REVIEW.md`, `FINAL_ACCESS_GOVERNANCE_REVIEW.md`, `EXPORT_GOVERNANCE_AUDIT.md`, `DEEPTWIN_SAFETY_AUDIT.md`) make clinical / safety claims. Their wording must match the canonical safety contracts now on main, not the older snapshot.
4. **Test references that name actual files.** Several reports reference test files by path (e.g., "428 new tests"). Those tests are **not** in this salvage — only the docs are. If you want the tests too, do a separate audited cherry-pick *from `origin/master`*, file by file, not branch-merge.

Per-file recommendation column should be added during audit:
- **PROMOTE** — accurate and useful; move out of `kimi-salvage-2026-05-18/` to canonical home (e.g. `docs/operations/`, `docs/runbooks/`, etc.) in a follow-up PR.
- **EDIT** — partially accurate; needs rewrite before promotion.
- **DELETE** — fully superseded or fully wrong against current codebase.

## Why these docs are quarantined (not at repo root)

The Kimi agent placed files at the repo root (`API_DOCUMENTATION.md`, `DEPLOYMENT_RUNBOOK.md`, etc.). Promoting them blindly would clutter the root *and* conflict with paths future agents are likely to write to fresh. Keeping them under `docs/kimi-salvage-2026-05-18/` until audited prevents that collision and signals their not-yet-validated status.

## How `origin/master` got into this state

Several agents pushed in parallel without ancestry awareness — the same pattern that produced the redundant-branch sweep documented in `docs/rebase-2026-05-18/`. `origin/master` happens to be the original default branch from before the repo switched to `main`; some agent prompts still reference it as the canonical branch, so pushes landed there instead of into a feature branch off `main`.

The 48 master-only commits include **48 commit messages** with content like `PR #15: Production Launch Candidate Freeze`, `MASSIVE AUDIT`, `P0 FIX SPRINT`, etc. — those are commit messages, **not actual PR merges**. The work was never reviewed or integrated; it lives only on `master`.

## After audit

Once every file in this directory has a PROMOTE / EDIT / DELETE decision, the directory can be removed. Until then, treat anything in here as **a draft, written against an old codebase, not currently authoritative**.

---
**Created by:** salvage commit on `salvage/kimi-master-docs-2026-05-18`, 2026-05-18.
**Source:** `origin/master` HEAD `ef214d4f` (`docs: Complete inventory of everything built in this chat session`).
