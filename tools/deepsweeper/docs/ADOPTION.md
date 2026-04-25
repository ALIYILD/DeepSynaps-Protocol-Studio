# Adoption guide — DeepSweeper for DeepSynaps

How to take this kit and stand up DeepSweeper on your GitHub org.

## Prerequisites

- A GitHub org with admin rights (e.g. `deepsynaps`)
- A bot service account with PAT scoped to: `repo`, `issues`, `pull-requests`, `actions:write`
- An OpenAI API key (Codex CLI uses `OPENAI_API_KEY`)
- Node 24+
- The 5 DeepSynaps repos you want swept (Studio core, qEEG analyzer, MRI analyzer, Brain Twin kit, Monitor)

## Step 1. Clone upstream + apply the fork

```bash
git clone https://github.com/openclaw/clawsweeper.git deepsweeper
cd deepsweeper
git checkout -b deepsynaps/0.1.0
```

Then either copy in the files from this kit, or apply `patches/clawsweeper.diff` and add the new files:

```bash
# Copy the new files from this kit:
cp <kit>/src/regulated.ts src/regulated.ts
cp <kit>/src/audit.ts src/audit.ts
cp <kit>/src/repos.ts src/repos.ts
cp <kit>/src/tests/*.ts src/tests/
cp <kit>/schema/deepsweeper-decision.schema.json schema/
cp <kit>/prompts/review-item.md prompts/
cp -r <kit>/config .
cp <kit>/.github/workflows/sweep.yml .github/workflows/
cp <kit>/package.json .
cp <kit>/tsconfig.json .
cp <kit>/README.md .
cp -r <kit>/docs .

# Delete the old ClawSweeper files:
rm schema/clawsweeper-decision.schema.json
mv src/clawsweeper.ts src/deepsweeper.ts

# Apply the source diff manually (the patch is a guide, not a literal patch):
$EDITOR src/deepsweeper.ts  # see patches/clawsweeper.diff
```

## Step 2. Configure your repos

Edit `config/target-repos.yaml`:

```yaml
repos:
  - owner: deepsynaps
    name: studio
    apply_closures: true       # auto-close OK on the public-marketing repo
    apply_limit: 50
    apply_min_age_days: 14

  - owner: deepsynaps
    name: qeeg-analyzer
    apply_closures: false      # NEVER auto-close on regulated repos
    apply_limit: 0
    apply_min_age_days: 30
  # ...
```

**Rule of thumb:** if a repo contains code that would be on a 510(k) submission, set `apply_closures: false`. The bot still reviews and writes records, but a human must close.

## Step 3. Tune the regulated allow-list

Edit `config/regulated-paths.yaml`:

- Add any internal path conventions you have (e.g. `apps/regulatory/`, `validation/`)
- Add team-specific keywords (project codenames, regulator submission IDs)
- The list is OR-merged — any one match flags the item

## Step 4. Create the report repo

DeepSweeper writes review records and the audit log into a dedicated repo:

```bash
gh repo create deepsynaps/deepsweeper --private --description "DeepSynaps maintainer bot"
git push -u origin deepsynaps/0.1.0
```

The bot commits to this repo from CI.

## Step 5. Set GitHub Actions secrets

In `deepsynaps/deepsweeper` → Settings → Secrets:

- `DEEPSWEEPER_GITHUB_TOKEN` — PAT with repo, issues, pull-requests, actions:write
- `DEEPSWEEPER_OPENAI_API_KEY` — OpenAI key for Codex

## Step 6. First dry run

```bash
gh workflow run sweep.yml \
  -f apply_closures=false \
  -f shard_count=4 \
  -f batch_size=3
```

This reviews items but does not close anything. Inspect the resulting `items/*.md` records and the dashboard. Look for:

- Regulated-component items correctly tagged `keep_open` with reason `regulated_component`
- Maintainer-authored items correctly tagged `keep_open` with reason `maintainer_authored`
- Marketplace candidates correctly suggested as `studio_marketplace`

## Step 7. Enable closures (only on non-regulated repos)

Once you have read 50+ review records and trust the bot's judgment, enable closures on `studio` and `monitor`:

```bash
gh workflow run sweep.yml \
  -f apply_existing=true \
  -f apply_kind=issue \
  -f apply_limit=20 \
  -f apply_min_age_days=30
```

Start with `apply_limit=20` and `apply_min_age_days=30`. Watch the audit log. If override rate (you reopen something the bot closed) exceeds 5%, reduce `apply_limit` to 5 and re-tune the prompt.

## Step 8. Schedule

The shipped workflow runs daily at 06:17 UTC. Adjust if needed in `.github/workflows/sweep.yml`. Hourly is overkill for a 5-repo footprint.

## Step 9. Audit log retention

The `audit-log.ndjson` file is append-only and committed every run. Per IEC 62304 SOUP requirements, retain for the device lifetime + post-market period. Do not edit, rebase, or squash this file.

## Step 10. Re-applying upstream changes

ClawSweeper evolves. To re-apply upstream changes:

```bash
git remote add upstream https://github.com/openclaw/clawsweeper.git
git fetch upstream
git diff upstream/main..HEAD -- src/ schema/ prompts/   # see your delta
git merge upstream/main                                  # resolve conflicts
# Re-run patches/clawsweeper.diff hunks if needed
npm test                                                 # the regulated + audit tests must still pass
```

The patch in `patches/clawsweeper.diff` is your re-application guide.

## Common pitfalls

- **Not setting `apply_closures: false` on a regulated repo.** The schema double-checks but the apply policy is the second line of defense. Both must agree.
- **Overly broad regulated keywords.** Adding `test` or `bug` would flag every item. Keep keywords specific to regulatory and clinical domains.
- **Forgetting the audit chain.** Never use `git filter-branch`, `git rebase -i`, or `--force` on the report repo's `main` branch. The chain is verified end-to-end in CI; any rewrite breaks it.
- **Running with `apply_closures=true` on first run.** Always dry-run first.
- **Skipping `npm run verify-audit` in CI.** It is in the shipped workflow — do not remove it.
