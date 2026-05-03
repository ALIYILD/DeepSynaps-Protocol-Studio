// Source contract: Monitor / Biometrics Analyzer hardening (2026-05).
// Run: node --test src/monitor-biometrics-analyzer.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

function pagesMonitorSrc() {
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  return fs.readFileSync(path.join(here, 'pages-monitor.js'), 'utf8');
}

test('Default tab is biometrics-analyzer in fresh state', () => {
  const src = pagesMonitorSrc();
  assert.ok(src.includes("'biometrics-analyzer'"));
  assert.ok(src.includes("? storedTab : 'biometrics-analyzer'"));
});

test('Governance copy is present verbatim', () => {
  const src = pagesMonitorSrc();
  assert.ok(
    src.includes(
      'Biometrics are clinician-reviewed decision-support signals. This page is not emergency monitoring, diagnosis, treatment approval, or protocol recommendation.',
    ),
  );
});

test('WebSocket stream only when token exists', () => {
  const src = pagesMonitorSrc();
  assert.ok(src.includes('if (!api.getToken())'));
  assert.ok(src.includes('function connectLiveStream()'));
});

test('Trends: honest unavailable (no chart library)', () => {
  const src = pagesMonitorSrc();
  assert.ok(src.includes('Trend endpoint not connected on this page yet.'));
});

test('AI summary: disabled / not connected copy', () => {
  const src = pagesMonitorSrc();
  assert.ok(src.includes('AI biometrics summary not connected on this analyzer page.'));
});

test('Clinic roster snapshot: not crisis triage language in primary labels', () => {
  const src = pagesMonitorSrc();
  assert.equal(/Crisis queue/i.test(src), false);
  assert.equal(/No open crises/i.test(src), false);
  assert.ok(src.includes('Review priority queue'));
});

test('Workbench empty state is not all-clear', () => {
  const src = pagesMonitorSrc();
  assert.equal(/all clear/i.test(src), false);
  assert.ok(src.includes('No wearable alert flags are queued for review in this filter.'));
});

test('Data quality empty state is not reassuring green', () => {
  const src = pagesMonitorSrc();
  assert.equal(
    /monitor-empty-inline--ok">No data-quality issues/.test(src),
    false,
  );
});

test('Linked module navigation handler exists', () => {
  const src = pagesMonitorSrc();
  assert.ok(src.includes('_monitorNavigateModule'));
});
