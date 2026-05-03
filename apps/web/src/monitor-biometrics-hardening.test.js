/**
 * Production-hardening contracts for Monitor / Biometrics Analyzer (pages-monitor.js).
 * Run: node --test src/monitor-biometrics-hardening.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

function pagesMonitorSrc() {
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  return fs.readFileSync(path.join(here, 'pages-monitor.js'), 'utf8');
}

test('GOVERNANCE_COPY is present verbatim', () => {
  const src = pagesMonitorSrc();
  assert.ok(src.includes(
    'Biometrics are clinician-reviewed decision-support signals. This page is not emergency monitoring, diagnosis, treatment approval, or protocol recommendation.',
  ));
});

test('Default tab is biometrics-analyzer', () => {
  const src = pagesMonitorSrc();
  assert.ok(src.includes("'biometrics-analyzer'"));
  assert.ok(src.includes("storedTab = 'biometrics-analyzer'"));
});

test('Biometrics tab renders required test ids', () => {
  const src = pagesMonitorSrc();
  assert.ok(src.includes('data-testid="monitor-tab-biometrics"'));
  assert.ok(src.includes('data-testid="monitor-biometrics-governance"'));
  assert.ok(src.includes('data-testid="monitor-trend-unavailable"'));
  assert.ok(src.includes('data-testid="monitor-ai-summary-unavailable"'));
  assert.ok(src.includes('data-testid="monitor-alerts-empty"'));
  assert.ok(src.includes('data-testid="monitor-biometrics-auth-gate"'));
});

test('No fake connected-device claims in category tiles', () => {
  const src = pagesMonitorSrc();
  assert.equal(/All healthy/i.test(src), false);
});

test('Alert empty state avoids all-clear language', () => {
  const src = pagesMonitorSrc();
  assert.equal(/all clear/i.test(src), false);
  assert.ok(src.includes('Empty queue does not mean clinically cleared'));
});

test('Clinic overview tab disclaimer — not emergency monitoring', () => {
  const src = pagesMonitorSrc();
  assert.ok(src.includes('data-testid="monitor-live-disclaimer"'));
  assert.ok(src.includes('not continuous bedside monitoring'));
});

test('renderWorkbenchKpis must not shadow esc() with escalated count', () => {
  const src = pagesMonitorSrc();
  assert.match(src, /var escalatedN = Number\(s\.escalated/);
  assert.equal(/function renderWorkbenchKpis[\s\S]*var esc = Number\(s\.escalated/.test(src), false);
});
