#!/usr/bin/env bash
# run-migrations.sh — minimal idempotent migration runner for evidence.db.
#
# Applies every *.sql file in this directory that has not been recorded in the
# schema_migrations table. Each migration is wrapped in a single sqlite3 call,
# so if a migration file contains its own BEGIN/COMMIT, that is respected.
#
# Usage:
#   ./run-migrations.sh                       # uses ../evidence.db
#   DB=/path/to/evidence.db ./run-migrations.sh
#
# Exit codes: 0 on success, 1 on any failure.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB="${DB:-$HERE/../evidence.db}"

if [[ ! -f "$DB" ]]; then
    echo "[run-migrations] DB not found: $DB" >&2
    echo "[run-migrations] (it will be created by sqlite3 on first apply)" >&2
fi

# Ensure schema_migrations exists. Created idempotently.
sqlite3 "$DB" <<'SQL'
CREATE TABLE IF NOT EXISTS schema_migrations (
    filename    TEXT PRIMARY KEY,
    applied_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
SQL

applied=0
skipped=0

# Iterate lexicographically over .sql files so 001_, 002_, ... apply in order.
shopt -s nullglob
for f in "$HERE"/*.sql; do
    fname="$(basename "$f")"
    # Skip if already recorded.
    already=$(sqlite3 "$DB" "SELECT 1 FROM schema_migrations WHERE filename='$fname' LIMIT 1;")
    if [[ "$already" == "1" ]]; then
        echo "[run-migrations] skip  $fname (already applied)"
        skipped=$((skipped+1))
        continue
    fi
    echo "[run-migrations] apply $fname"
    if ! sqlite3 "$DB" < "$f"; then
        echo "[run-migrations] FAILED on $fname" >&2
        exit 1
    fi
    sqlite3 "$DB" "INSERT INTO schema_migrations(filename) VALUES ('$fname');"
    applied=$((applied+1))
done

echo "[run-migrations] done. applied=$applied skipped=$skipped db=$DB"
