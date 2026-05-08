/**
 * Virtual Care readiness — source-level guards (no jsdom render).
 * Run: node --test src/pages-virtualcare-readiness.test.js
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import test from 'node:test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(__dirname, 'pages-virtualcare.js'), 'utf8');

test('Virtual Care: vcApplyTopbar prevents object titles', () => {
  assert.match(SRC, /function vcApplyTopbar/);
  assert.equal(/setTopbar\(\s*\{/.test(SRC), false, 'setTopbar must not receive object form');
});

test('Virtual Care: demo row gate exported', () => {
  assert.match(SRC, /export function vcVirtualCareDemoRowsAllowed/);
});

test('Virtual Care: controlled preview + governance copy', () => {
  assert.ok(SRC.includes('Controlled preview'));
  assert.ok(SRC.includes('does not diagnose'));
  assert.ok(SRC.includes('not continuous bedside monitoring') || SRC.includes('not continuous'));
});

test('Virtual Care: schedule launch buttons scoped away from video CTA', () => {
  assert.ok(SRC.includes('.vc-db-sched-row .vc-db-launch-btn'));
  assert.ok(SRC.includes('vc-db-video-open-btn'));
});

test('Virtual Care: patient drill-out uses patient-profile', () => {
  assert.ok(SRC.includes("window._nav?.('patient-profile')"));
});
