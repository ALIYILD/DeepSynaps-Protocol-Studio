#!/usr/bin/env bash
# nightly-enrichment.sh — one cycle of the local evidence-DB upkeep loop.
#
#   1. enrich the next batch of papers' abstracts via EuropePMC
#   2. re-route paper_indications using the now-larger FTS-indexed corpus
#   3. re-extract protocols from paper abstracts (idempotent — UNIQUE constraint)
#   4. dump a one-line health summary into the log
#
# Designed to be invoked by the macOS LaunchAgent at
# ~/Library/LaunchAgents/com.deepsynaps.evidence-enrichment.plist (or by hand:
# `bash services/evidence-pipeline/scripts/nightly-enrichment.sh`).
#
# Schedule: the plist now fires every 7200s (2h) so the full ~132k unenriched
# corpus completes in ~1.1 days. The script name still says "nightly" for
# compatibility with the existing log path; the cadence comment is the source
# of truth.
#
# Conservative defaults:
#   - BATCH=10000 papers/run. EuropePMC pilot showed ~98% fill at this rate
#     with no rate-limit hits, ~17 minutes per batch. Twelve runs/day × 10k =
#     120k/day cap, well below EuropePMC's polite limit at this batch size.
#   - Re-route caps at top 1000 papers per indication by BM25.
#   - Stops the whole cycle if any step fails — safer than partial state.
#   - Atomic mkdir lockfile prevents overlapping runs (a previous run still
#     paging EuropePMC will block the next 2h tick from starting).
#   - `caffeinate -i` keeps the Mac awake during the run without disabling
#     the system idle-sleep policy globally.
#
# Override defaults via env:
#   EVIDENCE_DB_PATH    — defaults to the canonical v4 DB on this machine.
#   ENRICH_BATCH        — default 10000.
#   ROUTE_TOP           — default 1000.
#   PIPELINE_DIR        — default ~/DeepSynaps-Protocol-Studio/services/evidence-pipeline.
#   LOCK_DIR            — default $TMPDIR/deepsynaps-evidence-enrichment.lock.

set -euo pipefail

# CRON_WORKTREE is the dedicated repo checkout the LaunchAgent invokes from.
# Pinned to origin/main so concurrent sessions in the primary repo checkout
# can't break the cron by switching branches. Local DB lives outside the
# worktree (see EVIDENCE_DB_PATH below) so it survives `git checkout`.
CRON_WORKTREE="${CRON_WORKTREE:-$HOME/.deepsynaps-cron}"
PIPELINE_DIR="${PIPELINE_DIR:-$CRON_WORKTREE/services/evidence-pipeline}"
EVIDENCE_DB_PATH="${EVIDENCE_DB_PATH:-$HOME/DeepSynaps-Protocol-Studio/services/evidence-pipeline/neuromodulation_evidence_2026-04-29_v4.db}"
ENRICH_BATCH="${ENRICH_BATCH:-10000}"
ROUTE_TOP="${ROUTE_TOP:-1000}"
LOCK_DIR="${LOCK_DIR:-${TMPDIR:-/tmp}/deepsynaps-evidence-enrichment.lock}"
# macOS keychain trust roots (corporate MITM that intercepts CTGOV/EuropePMC
# at certain hours rejected default certifi at 01:04 BST 2026-05-09; system
# keychain has the org root pre-installed).
SSL_CERT_FILE="${SSL_CERT_FILE:-/etc/ssl/cert.pem}"

export EVIDENCE_DB_PATH SSL_CERT_FILE

ts() { date +"%Y-%m-%dT%H:%M:%S%z"; }

# ---------------------------------------------------------------------------
# Refresh the pinned worktree to the latest origin/main BEFORE the lockfile
# guard. If origin/main has new wrapper / script changes, this picks them up
# without anyone touching the LaunchAgent.
# ---------------------------------------------------------------------------
if [[ -d "$CRON_WORKTREE/.git" || -f "$CRON_WORKTREE/.git" ]]; then
    git -C "$CRON_WORKTREE" fetch origin --quiet || true
    # Detached-HEAD checkout — no branch state to clash with concurrent sessions.
    git -C "$CRON_WORKTREE" checkout --quiet origin/main || true
fi

# ---------------------------------------------------------------------------
# Atomic single-instance guard. mkdir is the macOS-portable atomic op.
# ---------------------------------------------------------------------------
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
    echo "[$(ts)] another enrichment cycle is already running (lock: $LOCK_DIR) — exiting"
    exit 0
fi
trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT INT TERM

# ---------------------------------------------------------------------------
# Keep the Mac awake while the cycle runs, without disabling system sleep.
# `caffeinate -i -w $$` exits as soon as this script's PID dies.
# ---------------------------------------------------------------------------
if command -v caffeinate >/dev/null 2>&1; then
    caffeinate -i -w "$$" &
    CAFFEINATE_PID=$!
    trap 'rmdir "$LOCK_DIR" 2>/dev/null || true; kill '"$CAFFEINATE_PID"' 2>/dev/null || true' EXIT INT TERM
fi

cd "$PIPELINE_DIR"

echo "[$(ts)] enrichment cycle start  db=$EVIDENCE_DB_PATH  batch=$ENRICH_BATCH  top=$ROUTE_TOP"

# ---------------------------------------------------------------------------
# Cron health tracking: open a row in enrichment_runs at start, close it at
# end. If the script aborts (set -e), the trap will mark the row 'failed'
# with a notes column pointing at the failed step. Schema lives in
# migrations/010_enrichment_runs.sql.
# ---------------------------------------------------------------------------
RUN_ID=""
RUN_TRIGGER="${RUN_TRIGGER:-launchd}"
CURRENT_STEP="(init)"

snapshot_counts() {
    # echoes "papers_w_abstract paper_indications trial_indications protocols paper_trial_links trials"
    sqlite3 "$EVIDENCE_DB_PATH" "
      SELECT
        COALESCE((SELECT COUNT(*) FROM papers WHERE abstract IS NOT NULL AND length(abstract)>0), 0),
        COALESCE((SELECT COUNT(*) FROM paper_indications), 0),
        COALESCE((SELECT COUNT(*) FROM trial_indications), 0),
        COALESCE((SELECT COUNT(*) FROM protocols), 0),
        COALESCE((SELECT COUNT(*) FROM paper_trial_links), 0),
        COALESCE((SELECT COUNT(*) FROM trials), 0);
    " 2>/dev/null
}

# Snapshot at start.
START_SNAP="$(snapshot_counts || true)"
read -r WA_S PI_S TI_S PR_S PL_S TR_S <<< "$(echo "$START_SNAP" | tr '|' ' ')"

# Insert a 'running' row and capture the rowid.
RUN_ID="$(sqlite3 "$EVIDENCE_DB_PATH" "
  INSERT INTO enrichment_runs(status, trigger,
    papers_w_abstract_start, paper_indications_start, trial_indications_start,
    protocols_start, paper_trial_links_start, trials_start)
  VALUES ('running', '${RUN_TRIGGER}',
    ${WA_S:-NULL}, ${PI_S:-NULL}, ${TI_S:-NULL},
    ${PR_S:-NULL}, ${PL_S:-NULL}, ${TR_S:-NULL});
  SELECT last_insert_rowid();
" 2>/dev/null || true)"

# Replace the prior trap with one that closes the run row.
finalize_run() {
    local s="$1"
    local note="${2:-}"
    if [[ -n "$RUN_ID" ]]; then
        END_SNAP="$(snapshot_counts || true)"
        read -r WA_E PI_E TI_E PR_E PL_E TR_E <<< "$(echo "$END_SNAP" | tr '|' ' ')"
        sqlite3 "$EVIDENCE_DB_PATH" "
          UPDATE enrichment_runs SET
            finished_at             = datetime('now'),
            status                  = '$s',
            papers_w_abstract_end   = ${WA_E:-NULL},
            paper_indications_end   = ${PI_E:-NULL},
            trial_indications_end   = ${TI_E:-NULL},
            protocols_end           = ${PR_E:-NULL},
            paper_trial_links_end   = ${PL_E:-NULL},
            trials_end              = ${TR_E:-NULL},
            notes                   = NULLIF('$(echo "$note" | sed "s/'/''/g")', '')
          WHERE id = $RUN_ID;
        " 2>/dev/null || true
    fi
    rmdir "$LOCK_DIR" 2>/dev/null || true
    if [[ -n "${CAFFEINATE_PID:-}" ]]; then
        kill "$CAFFEINATE_PID" 2>/dev/null || true
    fi
}
trap 'finalize_run failed "step=$CURRENT_STEP"' ERR
trap 'finalize_run interrupted "interrupt during $CURRENT_STEP"' INT TERM
trap 'rmdir "$LOCK_DIR" 2>/dev/null || true; [[ -n "${CAFFEINATE_PID:-}" ]] && kill "$CAFFEINATE_PID" 2>/dev/null || true' EXIT

# Source funnel:
#   1. EuropePMC  (PMID-keyed, MEDLINE+PMC, batched 50)
#   2. PubMed     (PMID-keyed, MEDLINE, batched 50)
#   3. CrossRef   (DOI-keyed, JATS-XML abstracts, per-record)
#   4. OpenAlex   (DOI-keyed, inverted-index reconstruction, per-record)
# Each tier targets the rows the previous tier marked as not_found, so the
# funnel is monotonic — no row is hit by more than one source per cycle.
# A row that ends up 'openalex:not_found' is genuinely abstract-less in
# every major index and is not retried by future cron ticks.

# 1. EuropePMC main pass
CURRENT_STEP="europepmc-enrich"
echo "[$(ts)] step 1/10 enrich_abstracts.py --limit $ENRICH_BATCH (europepmc)"
python3 enrich_abstracts.py --limit "$ENRICH_BATCH"

# 2. PubMed retry of europepmc:not_found
CURRENT_STEP="pubmed-retry"
echo "[$(ts)] step 2/10 enrich_abstracts.py --retry-not-found (pubmed)"
python3 enrich_abstracts.py --retry-not-found --limit "$ENRICH_BATCH"

# 3. CrossRef retry of pubmed:not_found
CURRENT_STEP="crossref-retry"
echo "[$(ts)] step 3/10 enrich_abstracts.py --retry-with-crossref"
python3 enrich_abstracts.py --retry-with-crossref --limit "$ENRICH_BATCH"

# 4. OpenAlex retry of crossref:not_found
CURRENT_STEP="openalex-retry"
echo "[$(ts)] step 4/10 enrich_abstracts.py --retry-with-openalex"
python3 enrich_abstracts.py --retry-with-openalex --limit "$ENRICH_BATCH"

# 5. re-route paper_indications (clears existing rows for each slug + reroutes)
CURRENT_STEP="route-indications"
echo "[$(ts)] step 5/10 route_indications.py --clear --top $ROUTE_TOP"
python3 route_indications.py --clear --top "$ROUTE_TOP"

# 6. re-extract paper-derived protocols. Trial extraction is a no-op
#    here — interventions_json doesn't change between runs.
CURRENT_STEP="extract-paper-protocols"
echo "[$(ts)] step 6/10 extract_protocols.py --source papers"
python3 extract_protocols.py --source papers

# 7. scan paper abstracts for NCT IDs and bridge papers ↔ trials.
#    Idempotent (PRIMARY KEY on paper_id, nct_id) so re-runs are cheap.
CURRENT_STEP="link-papers-to-trials"
echo "[$(ts)] step 7/10 link_papers_to_trials.py"
python3 link_papers_to_trials.py

# 8. self-heal unresolved links: fetch the actual CTGOV records for any
#    NCT IDs the linker found but our trials table doesn't have yet. Each
#    new trial typically resolves 2-3 paper edges (papers often cite the
#    same trial). Capped per cycle so a 2h tick stays bounded.
CURRENT_STEP="ingest-missing-trials"
echo "[$(ts)] step 8/10 ingest_missing_trials.py --limit 100"
python3 ingest_missing_trials.py --limit 100

# 9. re-extract trial-derived protocols now that step 8 may have added
#    new trials with rich interventions_json.
CURRENT_STEP="extract-trial-protocols"
echo "[$(ts)] step 9/10 extract_protocols.py --source trials --all-trials"
python3 extract_protocols.py --source trials --all-trials

# 10. recompute dynamic evidence grades from junction-table counts.
#     Runs AFTER routing (step 5) so paper_indications is current.
#     Single SQL pass -- cheap even on 9k+ junction rows.
CURRENT_STEP="compute-indication-grades"
echo "[$(ts)] step 10/10 compute_indication_grades.py"
python3 compute_indication_grades.py

CURRENT_STEP="health-summary"

# Health summary
echo "[$(ts)] HEALTH"
sqlite3 "$EVIDENCE_DB_PATH" <<'SQL'
.mode column
.headers on
SELECT
  (SELECT COUNT(*) FROM papers)                                                AS papers_total,
  (SELECT COUNT(*) FROM papers WHERE abstract IS NOT NULL AND length(abstract) > 0) AS papers_w_abstract,
  (SELECT COUNT(*) FROM paper_indications)                                     AS paper_indications,
  (SELECT COUNT(*) FROM trial_indications)                                     AS trial_indications,
  (SELECT COUNT(*) FROM paper_trial_links)                                     AS paper_trial_links,
  (SELECT COUNT(*) FROM paper_trial_links WHERE trial_id IS NOT NULL)          AS pt_links_resolved,
  (SELECT COUNT(*) FROM protocols)                                             AS protocols_total,
  (SELECT COUNT(*) FROM protocols WHERE source_type='paper')                   AS protocols_from_papers,
  (SELECT COUNT(*) FROM protocols WHERE confidence='high')                     AS protocols_high_conf;
SQL

# Grade distribution summary
echo "[$(ts)] GRADE DISTRIBUTION"
sqlite3 "$EVIDENCE_DB_PATH" <<'SQL'
.mode column
.headers on
SELECT
  COALESCE(computed_evidence_grade, 'null') AS grade,
  COUNT(*)                                  AS indications,
  GROUP_CONCAT(slug, ', ')                  AS slugs
FROM indications
GROUP BY computed_evidence_grade
ORDER BY grade;
SQL

echo "[$(ts)] enrichment cycle done"

# Cron health: mark the run row as success. Done last so the row only flips
# to 'success' if every step above completed without `set -e` aborting.
finalize_run success ""
