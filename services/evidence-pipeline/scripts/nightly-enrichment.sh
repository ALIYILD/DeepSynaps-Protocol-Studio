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
# Conservative defaults:
#   - BATCH=10000 papers/run. EuropePMC pilot showed ~98% fill at this rate
#     with no rate-limit hits, ~17 minutes per batch.
#   - Re-route caps at top 1000 papers per indication by BM25.
#   - Stops the whole cycle if any step fails — safer than partial state.
#
# Override defaults via env:
#   EVIDENCE_DB_PATH    — defaults to the canonical v4 DB on this machine.
#   ENRICH_BATCH        — default 10000.
#   ROUTE_TOP           — default 1000.
#   PIPELINE_DIR        — default ~/DeepSynaps-Protocol-Studio/services/evidence-pipeline.

set -euo pipefail

PIPELINE_DIR="${PIPELINE_DIR:-$HOME/DeepSynaps-Protocol-Studio/services/evidence-pipeline}"
EVIDENCE_DB_PATH="${EVIDENCE_DB_PATH:-$PIPELINE_DIR/neuromodulation_evidence_2026-04-29_v4.db}"
ENRICH_BATCH="${ENRICH_BATCH:-10000}"
ROUTE_TOP="${ROUTE_TOP:-1000}"

export EVIDENCE_DB_PATH

cd "$PIPELINE_DIR"

ts() { date +"%Y-%m-%dT%H:%M:%S%z"; }

echo "[$(ts)] nightly-enrichment start  db=$EVIDENCE_DB_PATH  batch=$ENRICH_BATCH  top=$ROUTE_TOP"

# 1. enrich the next batch
echo "[$(ts)] step 1/3 enrich_abstracts.py --limit $ENRICH_BATCH"
python3 enrich_abstracts.py --limit "$ENRICH_BATCH"

# 2. re-route paper_indications (clears existing rows for each slug + reroutes)
echo "[$(ts)] step 2/3 route_indications.py --clear --top $ROUTE_TOP"
python3 route_indications.py --clear --top "$ROUTE_TOP"

# 3. re-extract paper-derived protocols. Trial extraction is a no-op
#    here — interventions_json doesn't change between runs.
echo "[$(ts)] step 3/3 extract_protocols.py --source papers"
python3 extract_protocols.py --source papers

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
  (SELECT COUNT(*) FROM protocols)                                             AS protocols_total,
  (SELECT COUNT(*) FROM protocols WHERE source_type='paper')                   AS protocols_from_papers,
  (SELECT COUNT(*) FROM protocols WHERE confidence='high')                     AS protocols_high_conf;
SQL

echo "[$(ts)] nightly-enrichment done"
