#!/usr/bin/env bash
# sync-evidence-db-to-fly.sh — push the local canonical evidence DB up to
# the Fly volume that backs deepsynaps-studio.fly.dev.
#
# Why this exists: the local LaunchAgent (com.deepsynaps.evidence-enrichment)
# keeps growing this Mac's neuromodulation_evidence_2026-04-29_v4.db every
# 2h. Production reads /data/evidence.db on the Fly app machine. They drift
# unless we re-upload. This script is the bridge.
#
# Idempotent + safe:
#   - Discovers the target machine dynamically via `flyctl volumes list` so
#     a future Fly app re-balance doesn't break the script.
#   - Uploads to /data/evidence.db.staging first, verifies integrity + row
#     counts on prod, only THEN atomic-mv's into place.
#   - Backs up the live DB to /data/evidence.db.bak-<UTC-timestamp> before
#     the swap. Backups accumulate; the user prunes them when the volume
#     fills.
#   - Restarts only the app machine. qeeg_worker / stripe_worker untouched.
#
# Usage:
#   bash services/evidence-pipeline/scripts/sync-evidence-db-to-fly.sh
#   bash services/evidence-pipeline/scripts/sync-evidence-db-to-fly.sh --dry-run
#
# Env overrides:
#   FLY_APP                — default 'deepsynaps-studio'
#   FLY_VOLUME_NAME        — default 'deepsynaps_data'
#   EVIDENCE_DB_PATH       — local DB; default canonical v4 file.
#   FLY_REMOTE_DB_PATH     — remote dest; default '/data/evidence.db'
#
# Auth required (interactive, one-time):
#   flyctl auth login

set -euo pipefail

FLY_APP="${FLY_APP:-deepsynaps-studio}"
FLY_VOLUME_NAME="${FLY_VOLUME_NAME:-deepsynaps_data}"
# Cron-pinned worktree (independent of the volatile primary checkout).
CRON_WORKTREE="${CRON_WORKTREE:-$HOME/.deepsynaps-cron}"
PIPELINE_DIR="${PIPELINE_DIR:-$CRON_WORKTREE/services/evidence-pipeline}"
# DB file lives outside the worktree on purpose so `git checkout` can't move it.
EVIDENCE_DB_PATH="${EVIDENCE_DB_PATH:-$HOME/DeepSynaps-Protocol-Studio/services/evidence-pipeline/neuromodulation_evidence_2026-04-29_v4.db}"
FLY_REMOTE_DB_PATH="${FLY_REMOTE_DB_PATH:-/data/evidence.db}"
SSL_CERT_FILE="${SSL_CERT_FILE:-/etc/ssl/cert.pem}"
export SSL_CERT_FILE

DRY_RUN=0
case "${1:-}" in
    --dry-run) DRY_RUN=1 ;;
    "")        ;;
    *) echo "Usage: $0 [--dry-run]" >&2; exit 2 ;;
esac

ts() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
log() { echo "[$(ts)] $*"; }

# ── Pre-flight ──────────────────────────────────────────────────────────────

if [[ ! -f "$EVIDENCE_DB_PATH" ]]; then
    log "ERROR: local DB not found at $EVIDENCE_DB_PATH"
    exit 1
fi

if ! command -v flyctl >/dev/null 2>&1; then
    log "ERROR: flyctl not on PATH. Install: curl -L https://fly.io/install.sh | sh"
    exit 1
fi

if ! flyctl auth whoami >/dev/null 2>&1; then
    log "ERROR: not authenticated to Fly. Run: flyctl auth login"
    exit 1
fi

LOCAL_BYTES="$(stat -f %z "$EVIDENCE_DB_PATH" 2>/dev/null || stat -c %s "$EVIDENCE_DB_PATH")"
log "local DB: $EVIDENCE_DB_PATH ($(( LOCAL_BYTES / 1024 / 1024 )) MB)"

# Local integrity check — abort early if the file is corrupt.
log "checking local DB integrity..."
INTEGRITY="$(sqlite3 "$EVIDENCE_DB_PATH" 'PRAGMA integrity_check;' | head -1 | tr -d '[:space:]')"
if [[ "$INTEGRITY" != "ok" ]]; then
    log "ERROR: local DB integrity_check returned: $INTEGRITY"
    exit 1
fi

LOCAL_PAPERS="$(sqlite3 "$EVIDENCE_DB_PATH" 'SELECT COUNT(*) FROM papers;')"
LOCAL_INDICATIONS="$(sqlite3 "$EVIDENCE_DB_PATH" 'SELECT COUNT(*) FROM indications;')"
LOCAL_PI="$(sqlite3 "$EVIDENCE_DB_PATH" 'SELECT COUNT(*) FROM paper_indications;')"
LOCAL_PROTOCOLS="$(sqlite3 "$EVIDENCE_DB_PATH" 'SELECT COUNT(*) FROM protocols;')"
log "local counts: papers=$LOCAL_PAPERS indications=$LOCAL_INDICATIONS paper_indications=$LOCAL_PI protocols=$LOCAL_PROTOCOLS"

# Discover the machine that has the volume mounted.
log "discovering Fly machine attached to volume '$FLY_VOLUME_NAME'..."
TARGET_MACHINE="$(
    flyctl volumes list -a "$FLY_APP" --json 2>/dev/null \
        | python3 -c "
import json, sys
vols = json.load(sys.stdin)
for v in vols:
    if v.get('name') == '$FLY_VOLUME_NAME' and v.get('attached_machine_id'):
        print(v['attached_machine_id'])
        sys.exit(0)
sys.exit(1)
" 2>/dev/null || true
)"

if [[ -z "$TARGET_MACHINE" ]]; then
    log "ERROR: no machine has volume '$FLY_VOLUME_NAME' attached. Available volumes:"
    flyctl volumes list -a "$FLY_APP"
    exit 1
fi
log "target machine: $TARGET_MACHINE"

if [[ "$DRY_RUN" == "1" ]]; then
    log "DRY RUN — would upload $LOCAL_BYTES bytes to ${FLY_REMOTE_DB_PATH}.staging on $TARGET_MACHINE, then atomic-mv."
    exit 0
fi

# ── Upload ──────────────────────────────────────────────────────────────────

log "uploading to ${FLY_REMOTE_DB_PATH}.staging (this can take 2-4 min over WireGuard)..."
upload_ok=0
for attempt in 1 2 3; do
    if flyctl ssh sftp put "$EVIDENCE_DB_PATH" "${FLY_REMOTE_DB_PATH}.staging" \
        -a "$FLY_APP" --machine "$TARGET_MACHINE" 2>&1; then
        upload_ok=1
        break
    fi
    log "upload attempt $attempt failed (likely a WireGuard hiccup) — retrying after 10s..."
    # Defensively remove partial file so the retry starts clean.
    flyctl ssh console -a "$FLY_APP" --machine "$TARGET_MACHINE" \
        -C "sh -c 'rm -f ${FLY_REMOTE_DB_PATH}.staging'" 2>/dev/null || true
    sleep 10
done
if [[ "$upload_ok" != "1" ]]; then
    log "ERROR: upload failed after 3 attempts. Existing $FLY_REMOTE_DB_PATH on prod is untouched."
    exit 1
fi

# ── Verify on prod ──────────────────────────────────────────────────────────

log "verifying staged file on prod..."
REMOTE_VERIFY="$(
    flyctl ssh console -a "$FLY_APP" --machine "$TARGET_MACHINE" -C "python3 -c \"
import os, sqlite3
print('size:', os.path.getsize('${FLY_REMOTE_DB_PATH}.staging'))
c = sqlite3.connect('${FLY_REMOTE_DB_PATH}.staging')
print('integrity:', c.execute('PRAGMA integrity_check').fetchone()[0])
print('papers:', c.execute('SELECT COUNT(*) FROM papers').fetchone()[0])
print('indications:', c.execute('SELECT COUNT(*) FROM indications').fetchone()[0])
print('paper_indications:', c.execute('SELECT COUNT(*) FROM paper_indications').fetchone()[0])
print('protocols:', c.execute('SELECT COUNT(*) FROM protocols').fetchone()[0])
\"" 2>&1
)"
echo "$REMOTE_VERIFY" | grep -E "^(size|integrity|papers|indications|paper_indications|protocols):"

remote_papers="$(echo "$REMOTE_VERIFY" | grep -E '^papers:' | awk '{print $2}')"
remote_integrity="$(echo "$REMOTE_VERIFY" | grep -E '^integrity:' | awk '{print $2}')"
remote_size="$(echo "$REMOTE_VERIFY" | grep -E '^size:' | awk '{print $2}')"

if [[ "$remote_integrity" != "ok" ]]; then
    log "ERROR: remote integrity_check returned '$remote_integrity'. Leaving staging file in place; not swapping."
    exit 1
fi
if [[ "$remote_size" != "$LOCAL_BYTES" ]]; then
    log "ERROR: remote size ($remote_size) != local size ($LOCAL_BYTES). Aborting swap."
    exit 1
fi
if [[ "$remote_papers" != "$LOCAL_PAPERS" ]]; then
    log "ERROR: remote papers count ($remote_papers) != local ($LOCAL_PAPERS). Aborting swap."
    exit 1
fi
log "verified: ${remote_size} bytes, integrity=ok, papers=$remote_papers"

# ── Atomic swap ─────────────────────────────────────────────────────────────

BAK_NAME="evidence.db.bak-$(date -u +%Y%m%dT%H%M%SZ)"
log "backing up existing prod DB to /data/$BAK_NAME, then mv staging → $FLY_REMOTE_DB_PATH..."
flyctl ssh console -a "$FLY_APP" --machine "$TARGET_MACHINE" -C "sh -c '
    if [ -f $FLY_REMOTE_DB_PATH ]; then
        cp $FLY_REMOTE_DB_PATH /data/$BAK_NAME
    fi
    mv ${FLY_REMOTE_DB_PATH}.staging $FLY_REMOTE_DB_PATH
    ls -lah $FLY_REMOTE_DB_PATH
'" 2>&1 | tail -3

# ── Restart + smoke ────────────────────────────────────────────────────────

log "restarting app machine $TARGET_MACHINE..."
flyctl machine restart "$TARGET_MACHINE" -a "$FLY_APP" --skip-health-checks >/dev/null 2>&1

log "waiting for /health to come back..."
HEALTH_URL="https://${FLY_APP}.fly.dev/health"
deadline=$(( $(date +%s) + 120 ))
until curl -sf "$HEALTH_URL" >/dev/null 2>&1; do
    if [[ $(date +%s) -gt $deadline ]]; then
        log "WARNING: /health not responding within 120s. Check manually: $HEALTH_URL"
        exit 1
    fi
    sleep 2
done
log "/health green"

log "verifying API reads new DB..."
flyctl ssh console -a "$FLY_APP" --machine "$TARGET_MACHINE" -C "python3 -c \"
import sqlite3
c = sqlite3.connect('$FLY_REMOTE_DB_PATH')
print('papers:', c.execute('SELECT COUNT(*) FROM papers').fetchone()[0])
print('paper_indications:', c.execute('SELECT COUNT(*) FROM paper_indications').fetchone()[0])
print('protocols:', c.execute('SELECT COUNT(*) FROM protocols').fetchone()[0])
print('paper_trial_links:', c.execute('SELECT COUNT(*) FROM paper_trial_links').fetchone()[0])
\"" 2>&1 | tail -5

log "sync complete. backup: /data/$BAK_NAME"
