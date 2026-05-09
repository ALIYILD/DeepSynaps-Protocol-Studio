#!/usr/bin/env bash
# cron-watchdog.sh — fire a macOS push notification when the enrichment cron
# hasn't had a successful cycle in the last 4 hours.
#
# Driven by a third LaunchAgent (com.deepsynaps.evidence-cron-watchdog) that
# fires every 30 minutes. Reads cron-status.py --json, checks the `stale`
# field, and uses `osascript` to surface a Notification Center alert.
#
# Spam guard: writes the last-alert timestamp to
# $TMPDIR/deepsynaps-cron-watchdog.last-alert and only re-fires if it's been
# more than ALERT_COOLDOWN_SECS (default 7200 = 2h) since the previous alert.
#
# Exit codes:
#   0 — cron is fresh (or cooldown still active; no notification fired)
#   1 — alert was fired this run
#   2 — cron-status.py exited with status 2 (DB / table missing); logged
#       only, no alert.

set -euo pipefail

CRON_WORKTREE="${CRON_WORKTREE:-$HOME/.deepsynaps-cron}"
PIPELINE_DIR="${PIPELINE_DIR:-$CRON_WORKTREE/services/evidence-pipeline}"
EVIDENCE_DB_PATH="${EVIDENCE_DB_PATH:-$HOME/DeepSynaps-Protocol-Studio/services/evidence-pipeline/neuromodulation_evidence_2026-04-29_v4.db}"
ALERT_COOLDOWN_SECS="${ALERT_COOLDOWN_SECS:-7200}"
LAST_ALERT_FILE="${LAST_ALERT_FILE:-${TMPDIR:-/tmp}/deepsynaps-cron-watchdog.last-alert}"

export EVIDENCE_DB_PATH

ts() { date +"%Y-%m-%dT%H:%M:%S%z"; }

# Refresh the worktree (same as the enrichment wrapper) so cron-status.py is
# always the latest version on origin/main. Explicit HTTPS URL — see
# nightly-enrichment.sh for rationale (avoids SSH auth under launchd).
CRON_HTTPS_URL="${CRON_HTTPS_URL:-https://github.com/ALIYILD/DeepSynaps-Protocol-Studio.git}"
if [[ -d "$CRON_WORKTREE/.git" || -f "$CRON_WORKTREE/.git" ]]; then
    git -C "$CRON_WORKTREE" fetch "$CRON_HTTPS_URL" main:refs/remotes/origin/main --quiet || true
    git -C "$CRON_WORKTREE" checkout --quiet origin/main || true
fi

STATUS_JSON="$(python3 "$PIPELINE_DIR/scripts/cron-status.py" --json 2>&1 || true)"
EXIT="$?"

if [[ "$EXIT" == "2" ]]; then
    echo "[$(ts)] cron-status returned exit 2 (DB/table missing). Not firing alert."
    exit 2
fi

# Parse the stale + age fields out of the JSON. Keep this tiny — no jq dep.
STALE="$(echo "$STATUS_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print('1' if d.get('stale') else '0')" 2>/dev/null || echo "0")"
AGE_HOURS="$(echo "$STATUS_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('last_success_age_hours') or 'unknown')" 2>/dev/null || echo "unknown")"

if [[ "$STALE" != "1" ]]; then
    echo "[$(ts)] cron fresh (last success ${AGE_HOURS}h ago). No action."
    exit 0
fi

# Cooldown guard so the watchdog doesn't spam Notification Center every 30 min.
NOW="$(date +%s)"
if [[ -f "$LAST_ALERT_FILE" ]]; then
    LAST_ALERT="$(cat "$LAST_ALERT_FILE" 2>/dev/null || echo 0)"
    SECS_SINCE="$(( NOW - LAST_ALERT ))"
    if [[ "$SECS_SINCE" -lt "$ALERT_COOLDOWN_SECS" ]]; then
        echo "[$(ts)] cron stale (${AGE_HOURS}h) but cooldown active (${SECS_SINCE}s of ${ALERT_COOLDOWN_SECS}s). Skipping."
        exit 0
    fi
fi

# Fire the macOS notification.
TITLE="DeepSynaps cron stale"
SUBTITLE="Last success ${AGE_HOURS}h ago"
BODY="Check: tail ~/Library/Logs/deepsynaps-evidence-enrichment.log"
osascript -e "display notification \"$BODY\" with title \"$TITLE\" subtitle \"$SUBTITLE\" sound name \"Submarine\"" 2>&1 || true
echo "$NOW" > "$LAST_ALERT_FILE"
echo "[$(ts)] alert fired (stale ${AGE_HOURS}h). Cooldown until $(date -r $((NOW + ALERT_COOLDOWN_SECS)))."
exit 1
