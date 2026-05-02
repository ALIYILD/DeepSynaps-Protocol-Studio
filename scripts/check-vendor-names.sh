#!/usr/bin/env bash
# Guard: no vendor or product names in user-facing source.
#
# Scope: apps/web/src/, apps/api/app/, packages/*/src/, scripts/. Engineering
# memory files (CLAUDE.md, README in packages/qeeg-pipeline) are excluded —
# they document MNE-Python's supported file formats which legitimately
# include device-vendor names. The bar is: a clinician using the product
# never sees these strings.
#
# Exits non-zero if any banned term is found. Runs in CI (.github/workflows
# or pre-commit), and locally as part of `make check`.
set -eu

BANNED='(mitsar|wineeg|persyst|neuroworks)'
SCOPED_DIRS=(
  "apps/web/src"
  "apps/api/app"
  "packages"
  "scripts"
)
EXCLUDE_GLOBS=(
  '*/node_modules/*'
  '*/dist/*'
  '*/__pycache__/*'
  '*/.pytest_cache/*'
  '*/pytest-cache-files-*/*'
  '*CLAUDE.md'
  '*README.md'
  '*QEEG_ANALYZER_STACK.md'
  '*check-vendor-names.sh'
)

cmd=(grep -rEni --include='*.js' --include='*.ts' --include='*.tsx'
     --include='*.py' --include='*.html' --include='*.css' --include='*.vue')

for g in "${EXCLUDE_GLOBS[@]}"; do
  cmd+=(--exclude="$g")
done

cmd+=("$BANNED" "${SCOPED_DIRS[@]}")

if "${cmd[@]}" 2>/dev/null; then
  echo "" >&2
  echo "ERROR: vendor/product name found in user-facing source." >&2
  echo "       Replace with neutral clinical vocabulary." >&2
  exit 1
fi

echo "OK: no vendor/product names in user-facing source."
