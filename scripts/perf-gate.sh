#!/usr/bin/env bash
# perf-gate.sh — informational p50/p95/p99 latency gate for /health.
#
# Usage: bash scripts/perf-gate.sh [BASE_URL]
#
# ENV overrides (for testing):
#   PERF_N              number of probes (default 20)
#   PERF_RESULTS_FILE   where to write JSON (default ./perf-results.json)
#   P95_THRESHOLD_MS    warning threshold in ms (default 500)
#
# Exit code is always 0 — informational only.

set -euo pipefail

BASE_URL="${1:-https://deepsynaps-studio.fly.dev}"
N="${PERF_N:-20}"
RESULTS_FILE="${PERF_RESULTS_FILE:-perf-results.json}"
THRESHOLD="${P95_THRESHOLD_MS:-500}"
ENDPOINT="${BASE_URL%/}/health"

echo "perf-gate: probing ${ENDPOINT} (N=${N})"
echo ""

times=()
for i in $(seq 1 "$N"); do
    t=$(curl -sf -o /dev/null -w "%{time_total}" --max-time 10 "$ENDPOINT" 2>/dev/null || echo "")
    if [ -n "$t" ]; then
        times+=("$t")
    fi
done

actual="${#times[@]}"
if [ "$actual" -eq 0 ]; then
    echo "ERROR: all ${N} probes failed against ${ENDPOINT}" >&2
    exit 0
fi

sorted_times=($(printf '%s\n' "${times[@]}" | sort -n))

percentile() {
    local p="$1"
    local n="${#sorted_times[@]}"
    local idx
    idx=$(awk "BEGIN { v = int(($p/100.0) * $n + 0.9999) - 1; if (v < 0) v=0; if (v >= $n) v=$n-1; print v }")
    echo "${sorted_times[$idx]}"
}

p50_s=$(percentile 50)
p95_s=$(percentile 95)
p99_s=$(percentile 99)

to_ms() { awk "BEGIN { printf \"%.3f\", $1 * 1000 }"; }

p50_ms=$(to_ms "$p50_s")
p95_ms=$(to_ms "$p95_s")
p99_ms=$(to_ms "$p99_s")

printf '%-8s %10s\n' "metric" "latency_ms"
printf '%-8s %10s\n' "------" "----------"
printf '%-8s %10s\n' "p50"   "$p50_ms"
printf '%-8s %10s\n' "p95"   "$p95_ms"
printf '%-8s %10s\n' "p99"   "$p99_ms"
printf '%-8s %10d\n' "samples" "$actual"
echo ""

over=$(awk "BEGIN { print ($p95_ms > $THRESHOLD) ? 1 : 0 }")
if [ "$over" -eq 1 ]; then
    echo "WARNING: p95 ${p95_ms}ms exceeds ${THRESHOLD}ms target"
fi

cat > "$RESULTS_FILE" <<JSON
{
  "p50_ms": $p50_ms,
  "p95_ms": $p95_ms,
  "p99_ms": $p99_ms,
  "samples": $actual
}
JSON

echo "Results written to ${RESULTS_FILE}"
exit 0
