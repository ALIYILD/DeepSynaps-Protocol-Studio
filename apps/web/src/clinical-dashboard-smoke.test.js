/**
 * Source-level smoke tests for Clinical Dashboard (pgDash) in pages-clinical.js.
 * No browser; reads the module source to assert critical production-safety strings exist.
 *
 * Run: node --test src/clinical-dashboard-smoke.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CLINICAL = readFileSync(resolve(__dirname, 'pages-clinical.js'), 'utf8');

test('pgDash: route handler export exists', () => {
  assert.match(CLINICAL, /export async function pgDash/);
});

test('pgDash: exported dashboard entry (home / today / dashboard routes)', () => {
  assert.match(CLINICAL, /export async function pgDash/);
});

test('pgDash: backend unreachable (non-demo) does not proceed to full dashboard HTML', () => {
  assert.ok(
    CLINICAL.includes("We couldn't reach your clinic data right now"),
    'unreachable backend copy must remain for production safety',
  );
});

test('pgDash: VITE_ENABLE_DEMO demo banner — not real patient data / P-DEMO callout', () => {
  assert.ok(
    /Demo data — not real patient data|P-DEMO-\*/.test(CLINICAL),
    'demo build must state synthetic data and P-DEMO prefix',
  );
});

test('pgDash: honest empty clinic when not seeding demo', () => {
  assert.ok(
    CLINICAL.includes('Your clinic has no patients or courses yet'),
    'empty non-demo clinic must show honest empty state',
  );
});

test('pgDash: shouldSeedDashboardDemo policy imported', () => {
  assert.match(CLINICAL, /shouldSeedDashboardDemo/);
});

test('pgDash: clinical decision support strip (no autonomous diagnosis)', () => {
  assert.ok(
    CLINICAL.includes('Clinical decision support') && CLINICAL.includes('Not for autonomous diagnosis'),
  );
});
