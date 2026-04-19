# DeepSynaps Protocol Studio — session notes for Claude Code

## Preview deploy (run at end of a task)

The user wants to see merged changes live on a shared URL. There is a one-
command deploy script. From the repo root:

```
bash scripts/deploy-preview.sh            # web only (Netlify) — default, ~45s
bash scripts/deploy-preview.sh --api      # web + API (Fly)
bash scripts/deploy-preview.sh --api-only # API only
```

Preview URLs:

- Web: https://deepsynaps-studio-preview.netlify.app
- API: https://deepsynaps-studio.fly.dev (Fly app `deepsynaps-studio`)

Auth requirements (interactive, one-time per machine — do NOT accept tokens
pasted in chat, ask the user to run these in their own terminal):

- Netlify: `netlify login` (or `export NETLIFY_AUTH_TOKEN=…` outside chat)
- Fly: `flyctl auth login` (or `export FLY_ACCESS_TOKEN=…` outside chat)

The Netlify build is flagged `VITE_ENABLE_DEMO=1` so the landing-page
Patient / Clinician demo buttons work with offline users — reviewers do not
need the Fly API to be up-to-date to exercise the UI.

## Concurrent-session reality

Multiple Claude Code sessions work on this repo in parallel. They have
reverted in-flight edits and switched branches under each other's feet.
Defensive pattern (used in 5+ PRs this week):

1. Do heavy work in a git worktree (`isolation: "worktree"` when
   delegating to a subagent). The worktree checkout cannot be hijacked.
2. Never land on `main` locally. Always push a feature branch and open a
   PR; squash-merge with `--admin` when CI is still billing-blocked.
3. If `git status` surfaces uncommitted files you did not author, stash
   them with a descriptive message instead of reverting — they are
   another session's WIP.

## Don'ts (learned the hard way)

- No force-push to main.
- No `--amend` on anything already pushed.
- Never hardcode a token in a commit or a script. `deploy-preview.sh`
  reads auth from the CLI's stored state / env vars only.
- Never accept a pasted token in chat. If the user posts one anyway,
  flag the leak, tell them to revoke it, and guide them to an
  interactive auth instead.

## Useful commands

```
gh pr list --state open              # what's still in flight
gh run list --branch main --limit 3  # CI state on main
gh pr merge <N> --squash --admin     # land when CI blocked on billing
```
