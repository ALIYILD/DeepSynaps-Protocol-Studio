# Deploy Hotfix — 2026-05-18

**Classification:** Outage recovery exception. Not a workflow change.

> This was an outage recovery exception, not a workflow change.

This document records a production-deploy outage on the DeepSynaps Protocol
Studio repo on 2026-05-18, the three commits landed directly on `main` to
restore service, the branch-protection bypasses required to do so, and the
governance state that must be restored now that production is healthy again.

Companion docs:
- [governance-lock-2026-05-17.md](./governance-lock-2026-05-17.md) — post-salvage governance lock that this hotfix operated under
- [post-salvage-baseline-2026-05-17.md](./post-salvage-baseline-2026-05-17.md) — repo baseline at salvage closeout
- [docs/engineering/runtime-critical-surface-protection.md](../engineering/runtime-critical-surface-protection.md) — referenced policy for runtime-critical surfaces
- [docs/engineering/post-salvage-governance-lock-2026-05-17.md](../engineering/post-salvage-governance-lock-2026-05-17.md) — engineering-side governance lock

---

## 1. Outage symptoms

Operator attempted `fly deploy --app deepsynaps-studio` from repo root.
Successive deploy attempts failed at the Docker build step. Production
remained on the prior healthy revision throughout — there was no user-facing
outage, but new deploys (including any pending hotfix) were blocked.

Three distinct failure modes surfaced in sequence as each was fixed:

1. `npm ci` exited with `EUSAGE` — lockfile out of sync with workspaces:
   ```
   Missing: @deepsynaps/api-client@ from lock file
   Missing: @deepsynaps/web@ from lock file
   ```
2. `npm ci` succeeded, then `npm run build:web` (vite) crashed:
   ```
   Cannot find module @rollup/rollup-linux-x64-gnu
   ```
3. vite build started cleanly, then rollup parser failed:
   ```
   src/pages-brain-twin.js (391:6): Expression expected
   ```

## 2. Root causes

### 2a. Lockfile EUSAGE
Commit `f9eba73c "Add package-lock.json (minimal, no root deps — all deps in
workspaces)"` added a stub `package-lock.json` that declared the workspaces
but contained no resolved dependency tree for them. `npm ci` requires the
lockfile to fully describe every workspace; a stub is rejected before any
network call.

### 2b. Rollup native binary missing in container
The regenerated lockfile (produced on macOS) referenced
`@rollup/rollup-linux-x64-gnu` only as an optional-dependency name in
rollup's own `optionalDependencies` map, without a full
`node_modules/@rollup/rollup-linux-x64-gnu` package entry (tarball URL +
integrity hash). This is the known npm bug
[npm/cli#4828](https://github.com/npm/cli/issues/4828): platform-specific
optional native binaries are omitted from the resolved tree when the
lockfile is generated on a host that cannot use them.

The Fly container runs x86_64 Linux glibc, so it needs the `linux-x64-gnu`
binary specifically. Without a lockfile entry, `npm ci --frozen` had nothing
to fetch.

### 2c. Vite build breakage source
`apps/web/src/pages-brain-twin.js` contained a syntax error that derailed
the rollup parser at line 391 on a `<polygon>` JSX tag. The error itself
was not "JSX-in-`.js` not allowed" — this codebase deliberately allows JSX
in `.js` files and vite is configured for it
(`app.js`, `auth.js`, `brain-map-svg.js`, `eeg-decomposition-studio.js`,
and ~10 other files use the same pattern). The actual cause was unclosed
syntax earlier in the file that derailed the parser by the time it reached
line 391.

The breaking change was a **rewrite**, not a new file: commit `5db478f0
feat(knowledge): P4 apps/web/src/pages-brain-twin.js` modified the existing
2,508-line file with -1,357 / +1,151 (net -206 lines). It was landed
directly on `main` without `vite build` ever being run locally.

## 3. Why direct-to-main was used

The hotfix path skipped PR-and-required-checks for three reasons, all
documented in real time:

1. **Production deploys were blocked.** The prior healthy revision was
   still serving traffic, but no new code could ship — including any
   subsequent hotfix. This made the deploy pipeline itself the outage.
2. **The fixes were strictly mechanical and self-evident.**
   Regenerating a lockfile, pinning an npm optional dep, and reverting a
   single broken rewrite commit are not architectural decisions. The
   diff is auditable in seconds.
3. **Required status checks are themselves billing-blocked / flaky.**
   CLAUDE.md already documents the `gh pr merge --squash --admin` pattern
   for landing when CI is blocked on billing. The PR-only rule is policy;
   the hotfix path is the existing outage exception to that policy.

The bypass was logged by GitHub on each push:
```
Bypassed rule violations for refs/heads/main:
  - Changes must be made through a pull request.
  - 3 of 3 required status checks are expected.
```
That message was received, read, and accepted three times — once per
push. It is not boilerplate; it is the audit trail of this exception.

## 4. Exact commits landed

All on `origin/main`, pushed by the operator's local session, signed under
the operator's identity. No autonomous-agent authorship was involved in
any of these three commits.

| SHA | Subject | Purpose |
|---|---|---|
| `203f3f17` | `fix(build): regenerate package-lock.json with workspace deps` | Replace the stub lockfile with one that resolves `@deepsynaps/web` (0.2.0) and `@deepsynaps/api-client` (0.1.0). Verified locally with `npm ci --dry-run` before push. |
| `10a9879a` | `fix(build): pin @rollup/rollup-linux-x64-gnu so Docker frontend build works` | Add `optionalDependencies` block to root `package.json` pinning `@rollup/rollup-linux-x64-gnu@4.60.3`, forcing npm to write the full `node_modules/...` entry into the lockfile. Container can now fetch the linux binary; macOS dev keeps skipping it via the package's own `os:[linux]` constraint. |
| `fbcca4b9` (rebased to `456e41b5` on push) | `Revert "feat(knowledge): P4 apps/web/src/pages-brain-twin.js"` | Restore the pre-`5db478f0` working version of `pages-brain-twin.js`. Nothing else imports from this file, so the revert is contained. |

Final `main` HEAD after this hotfix sequence: `456e41b5`.

## 5. Health verification evidence

Captured 2026-05-18, immediately after `fly deploy` reported all machines
in good state:

```
$ curl -sf -m 15 -w "\nHTTP %{http_code} in %{time_total}s\n" \
    https://deepsynaps-studio.fly.dev/health
{"status":"ok","db":"connected","environment":"production","version":"0.1.0",
 "database":"ok","clinical_snapshot":{"snapshot_id":"clinical-ab549dd1b827",
 "total_records":263}}
HTTP 200 in 0.150215s
```

```
$ fly status --app deepsynaps-studio
Image: deepsynaps-studio:deployment-01KRXE9C1T1AF4C6X64DNKMZEM
PROCESS        ID              VERSION  REGION  STATE    CHECKS
app            d89092df576d78  377      lhr     started  1 total, 1 passing
qeeg_worker    1859292f535028  377      lhr     stopped
stripe_worker  8e1ddea707e928  377      lhr     stopped
stripe_worker† d896d93a3135e8  377      lhr     stopped (standby)
```

The `stopped` state on `qeeg_worker` and both `stripe_worker` instances is
expected — those processes wake on jobs and are not idle-running on Fly's
shared-cpu plan. The single `app` process is the API surface and is the
only one that should be `started` continuously.

## 6. Branch-protection bypass context

Branch protection on `main` requires:
- PR (no direct push)
- 3 required status checks to pass

Both rules were bypassed three times during this hotfix:

1. `203f3f17` — lockfile regeneration
2. `10a9879a` — rollup linux-x64-gnu pin
3. `456e41b5` (revert of `5db478f0`) — brain-twin rewrite rollback

Each push surfaced the audit message from GitHub:
```
Bypassed rule violations for refs/heads/main:
  - Changes must be made through a pull request.
  - 3 of 3 required status checks are expected.
```

These bypasses are documented here as the **only** acceptable use of the
direct-to-main path under this repo's governance:

- A production deploy is blocked.
- The fix is mechanical and auditable in one short diff.
- A PR cannot run because required checks are themselves not running, or
  the fix needs to ship faster than the CI cycle.

Three bypasses in one outage is the upper bound. If a fourth fix had been
required, the right move would have been to step out of the hotfix path
and back into the PR flow rather than continuing to chain direct pushes.

## 7. Governance restoration statement

As of the deployment of version 377 being verified healthy
(2026-05-18, /health HTTP 200), the outage hotfix exception is **closed**.

All subsequent work on this repo returns to the standing governance from
[governance-lock-2026-05-17.md](./governance-lock-2026-05-17.md) and
[../engineering/post-salvage-governance-lock-2026-05-17.md](../engineering/post-salvage-governance-lock-2026-05-17.md):

- **PR-only.** No direct pushes to `main` for feature, refactor, or
  cleanup work.
- **Required checks must run and pass** (or be explicitly waived via the
  documented stabilization-sensitive workflow).
- **Review gates apply** to every change touching runtime-critical
  surfaces (see
  [runtime-critical-surface-protection.md](../engineering/runtime-critical-surface-protection.md)).
- **Stabilization-sensitive PRs** use the dedicated template at
  `.github/PULL_REQUEST_TEMPLATE/stabilization-sensitive.md`.
- **Salvage-PR governance** (see `docs/engineering/salvage-pr-governance.md`)
  is the path for any rework of `pages-brain-twin.js`, not direct edits.

The hotfix path described in §3 is not a normal workflow. It is the
documented outage escape hatch, and the bar for using it is "production
is broken and waiting for a CI cycle makes things worse."

## 8. Operator and identity audit

Each hotfix commit was authored under the operator's primary identity
(`AliYildirim`, `dr.aliyildirim123@gmail.com`), pushed from the operator's
local checkout. No commits in this sequence were authored by
`agent@deepsynaps.ai`, `agent@example.com`, or any other autonomous-agent
identity.

The reverted commit `5db478f0` was authored under
`62653182+ALIYILD@users.noreply.github.com` — the operator's GitHub
no-reply identity, used by web-UI or squash-merge flows. This is a
legitimate operator identity but the change behind it never ran
`vite build` locally; see issue tracker for the follow-up PR plan.

---

## Follow-up tracking

- GitHub issue **#993** — "Redo brain-twin rewrite via PR with CI green".
  Containment-only. The rewrite is **not scheduled**; the issue exists so
  that if/when someone resumes it, they do so via PR with `vite build`
  passing locally first.

## Cross-references in memory

This document is the canonical record of the 2026-05-18 hotfix. The
following memory files reference it indirectly and should be updated
to point here if they are revised:

- `deepsynaps-concurrent-session-chaos.md`
- `deepsynaps-runaway-agent-master-branch.md` (relevant because
  `origin/master` was deleted again in this closeout)
- `deepsynaps-post-salvage-governance-lock.md`
