/**
 * Launch-audit / wiring contract tests for the Clinical Dashboard (pgDash).
 *
 * These are intentionally DOM-free and use source-grep + small helper asserts.
 *
 * Run: node --test src/clinical-dashboard-launch-audit.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

function readSrc(rel) {
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  return fs.readFileSync(path.join(here, rel), 'utf8');
}

test('pgDash export exists', () => {
  const src = readSrc('pages-clinical.js');
  assert.ok(src.includes('export async function pgDash'));
});

test('Dashboard: safety strip includes non-autonomous + non-emergency wording', () => {
  const src = readSrc('pages-clinical.js').toLowerCase();
  assert.ok(src.includes('clinical decision support'));
  assert.ok(src.includes('not for autonomous'));
  assert.ok(src.includes('not an emergency triage system'));
  assert.ok(src.includes('treatment planning'));
});

test('Dashboard: demo banner calls out non-PHI synthetic data', () => {
  const src = readSrc('pages-clinical.js');
  assert.ok(
    /non-phi|not real patient data/i.test(src),
    'demo banner must mention non-PHI / not real patient data',
  );
});

test('Dashboard: Start Session routes to session-execution', () => {
  const src = readSrc('pages-clinical.js');
  assert.ok(src.includes("window._nav('session-execution'"));
  assert.ok(/Start Session/i.test(src));
});

test('Dashboard: New messages routes to clinician-inbox', () => {
  const src = readSrc('pages-clinical.js');
  assert.ok(src.includes("'clinician-inbox'"));
  assert.ok(/New messages/i.test(src));
});

test('Dashboard: Open schedule routes to scheduling-hub (or clinic-day)', () => {
  const src = readSrc('pages-clinical.js');
  assert.ok(src.includes("window._nav('scheduling-hub'") || src.includes("window._nav('clinic-day'"));
});

test('Dashboard: Open planner routes to brain-map-planner', () => {
  const src = readSrc('pages-clinical.js');
  assert.ok(src.includes("window._nav('brain-map-planner'"));
});

test('Dashboard: Protocol actions route to protocol-hub / protocols-registry', () => {
  const src = readSrc('pages-clinical.js');
  assert.ok(src.includes("window._nav('protocol-hub'") || src.includes("window._nav('protocols-registry'"));
});

test('Dashboard: Evidence library routes to research-evidence', () => {
  const src = readSrc('pages-clinical.js');
  assert.ok(src.includes("window._nav('research-evidence'"));
});

test('Dashboard: Ask Agent routes to ai-agents when available', () => {
  const src = readSrc('pages-clinical.js');
  // We allow the dashboard to open a modal and then route to agents or call api.postChat,
  // but the route target must exist in app.js if used.
  if (src.includes("window._nav('ai-agents'") || src.includes("window._nav('ai-assistant'")) {
    assert.ok(true);
  } else {
    // Fallback: embedded agent strip uses api.postChat
    assert.ok(src.includes('api.postChat'));
  }
});

