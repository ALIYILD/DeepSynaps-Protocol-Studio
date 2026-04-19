# Live Literature Watch — evidence-pipeline component

Nightly PubMed sweep that populates `literature_watch` for every protocol in
`apps/web/src/protocols-data.js`. Spec: `docs/SPEC-live-literature-watch.md`.

## Files

- `migrations/002_literature_watch.sql` — `literature_watch` + `refresh_jobs` tables (PR #1).
- `migrations/run-migrations.sh` — idempotent runner, tracks applied SQL files in `schema_migrations`.
- `pubmed_client.py` — stdlib + `requests` wrapper over PubMed E-utilities. Rate-limited, retrying.
- `literature_watch_cron.py` — the nightly worker. Reads the JS protocol library via `node -e`.
- `com.deepsynaps.literature-watch.plist` — launchd template (03:00 daily). Requires `__HOME__` substitution.

## One-time setup

```bash
# 1. Apply migrations (safe to re-run):
cd ~/Desktop/DeepSynaps-Protocol-Studio/services/evidence-pipeline
./migrations/run-migrations.sh

# 2. Export NCBI credentials (bumps 3 req/s -> 10 req/s, and is polite):
export PUBMED_API_KEY=...     # or NCBI_API_KEY, either works
export PUBMED_EMAIL=you@example.com

# 3. Dry-run on a handful of protocols to sanity-check the query + dedupe path:
../../venv/bin/python literature_watch_cron.py --dry-run --limit 5
```

## Manual runs

```bash
# Full sweep (all 107 protocols, last 30 days, max 25 PMIDs/protocol):
../../venv/bin/python literature_watch_cron.py

# Wider lookback (e.g. backfill after a week offline):
../../venv/bin/python literature_watch_cron.py --days 90

# Sanity check without inserts:
../../venv/bin/python literature_watch_cron.py --dry-run
```

Exit code: `0` success (including per-protocol failures, which are logged but do
not poison the run); `1` fatal config errors (missing tables, node failure, etc.).

## launchd install (macOS)

The plist in this directory is a template — it uses `__HOME__` placeholders so
it stays safe to commit. Install it with:

```bash
# From this directory:
sed "s|__HOME__|$HOME|g" com.deepsynaps.literature-watch.plist \
  > ~/Library/LaunchAgents/com.deepsynaps.literature-watch.plist

launchctl load ~/Library/LaunchAgents/com.deepsynaps.literature-watch.plist

# Verify:
launchctl list | grep literature-watch

# Force an immediate run (useful for verifying the install without waiting for 03:00):
launchctl start com.deepsynaps.literature-watch
tail -f literature_watch.log
```

Unload:

```bash
launchctl unload ~/Library/LaunchAgents/com.deepsynaps.literature-watch.plist
rm ~/Library/LaunchAgents/com.deepsynaps.literature-watch.plist
```

If you add a PUBMED_API_KEY after install, edit the loaded plist (or unload →
edit the template → re-sed → re-load).

## Inspecting results

```bash
# Total rows:
sqlite3 evidence.db "SELECT COUNT(*) FROM literature_watch;"

# Top protocols by new-paper count:
sqlite3 evidence.db \
  "SELECT protocol_id, COUNT(*) n FROM literature_watch
     GROUP BY protocol_id ORDER BY n DESC LIMIT 10;"

# Source breakdown (should be pubmed only until Consensus/Apify are wired):
sqlite3 evidence.db "SELECT source, COUNT(*) FROM literature_watch GROUP BY source;"

# Last 24 h of refresh jobs:
sqlite3 evidence.db \
  "SELECT protocol_id, status, new_papers_count, started_at
     FROM refresh_jobs
     WHERE started_at >= datetime('now','-1 day')
     ORDER BY started_at DESC LIMIT 20;"
```

## Notes & gotchas

- **Node dependency** — the cron shells out to `node -e` to read
  `protocols-data.js`. Keep `node` on the `PATH` visible to launchd (the plist
  sets `PATH=/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin`).
- **Rate limits** — PubMed bans IPs that exceed 3 req/s without a key. Always
  set `PUBMED_API_KEY` for production runs.
- **Dedup key** — `UNIQUE(protocol_id, pmid)` at the DB layer. A paper can exist
  under multiple protocols (that is the desired behaviour).
- **Papers without PMID** — dropped silently. Spec §10 risk: any row lacking
  both PMID and DOI should be rejected; this cron inserts on PMID only so the
  constraint is stricter than required.
- **Longnames** — the query uses the `label` fields from `CONDITIONS` and
  `DEVICES` in `protocols-data.js`. If those labels change, queries change.
