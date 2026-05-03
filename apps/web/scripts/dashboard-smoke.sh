#!/usr/bin/env bash
# Clinical Dashboard smoke: unit helpers + source-level pgDash checks.
# Run from apps/web: bash scripts/dashboard-smoke.sh
set -euo pipefail
cd "$(dirname "$0")/.."
echo "== clinical-dashboard-helpers.test.js =="
node --test src/clinical-dashboard-helpers.test.js
echo "== clinical-dashboard-smoke.test.js =="
node --test src/clinical-dashboard-smoke.test.js
echo "OK"
