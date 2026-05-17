<!--
Optional PR template for salvage / recovery work.

This is NOT a default template — GitHub only uses it when the user appends
`?template=salvage.md` to the New PR URL, or selects it from the template
picker. Default PRs are unaffected.

When to use: any PR that recovers stranded work from a stale clone, stash,
untracked file, or dropped branch. See docs/engineering/salvage-pr-governance.md.

Delete sections you don't need before submitting.
-->

## Summary

<!-- 1-3 sentences. What changed, user-visible impact first. -->

## Provenance

<!--
Required for salvage PRs.

Where did this work come from?
- Stale-clone stash whose parent commit was `<sha>`
- Untracked file recovered from `~/Desktop/...` / sibling worktree
- Dropped PR / abandoned branch
- Hand re-authored from a forensic patch

One paragraph. Cite the SHA / branch / clone path.
-->

## Drift

<!--
Optional. Only include if `main` moved on the touched files between
the original work and this PR.

Name what moved and how the merge / resolution handled it. Example:
"`main` added the X / Y exports to <file>. The merge keeps main's
exports verbatim and slots the new helper below them."

Omit this section if there's no drift.
-->

## Files intentionally untouched

<!--
Optional but recommended for any salvage PR with adjacent stranded work.

A short list of files NOT touched in this PR and why. Pre-empts
"did you mean to leave X alone?" review questions.

Example:
- apps/web/src/pages-agents.js — overlay system is in flux; deferring
- CLAUDE.md — actively edited by other sessions; out of scope
-->

## Concurrent sessions / agents involved

<!--
Optional. If multiple agents collaborated or the PR was salvaged from
a sibling session's worktree, name it.

Example:
"Recovered from a stale Desktop clone stash. No subagent delegation —
written from the parent Claude Code session foreground per
openclaw-subagent-write-tool-denial memory."
-->

## Runtime surface impact

<!--
Required if the PR touches anything listed in
docs/engineering/runtime-critical-surface-protection.md.

Name the surface(s), describe the change as additive-only /
contract-preserving / breaking. If breaking, link to the migration
or contract update.
-->

## Test plan

<!--
Bulleted checklist. Mix manual + automatic. Mark checked only what
you actually ran.

Example:
- [x] Local: `cd apps/web && node --test src/<file>.test.js` → 2 pass, 0 fail
- [ ] CI: backend tests
- [ ] CI: web-unit lane
- [ ] Manual: <one specific click-path or curl>
-->

## Abort considered?

<!--
For salvage PRs only. If you almost aborted but decided to proceed,
note what tipped the decision. Helps future salvages calibrate.

Example: "Considered aborting at the merge conflict on <file>, but
the conflict was a clean superset choice — took 'theirs' and verified
2/2 tests pass."

If no abort was considered, omit this section.
-->
