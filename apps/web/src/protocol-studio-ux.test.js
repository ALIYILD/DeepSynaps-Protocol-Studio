/**
 * Protocol Studio UX regressions (node:test, DOM-lite).
 *
 * These tests intentionally avoid a full browser runtime. They enforce
 * presence of stable `data-testid` hooks and safety banner wording so the
 * clinician workspace remains testable and governance language doesn't drift.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

test('pgProtocolHub contains stable testids + safety banner hook', () => {
  const hubs = readFileSync(join(__dirname, 'pages-clinical-hubs.js'), 'utf8');

  // Shell hooks
  assert.ok(hubs.includes('protocol-studio-root'));
  assert.ok(hubs.includes('protocol-studio-tabbar'));
  assert.ok(hubs.includes('protocol-studio-tab-conditions'));
  assert.ok(hubs.includes('protocol-studio-tab-generate'));
  assert.ok(hubs.includes('protocol-studio-tab-browse'));
  assert.ok(hubs.includes('protocol-studio-tab-drafts'));
  assert.ok(hubs.includes('protocol-studio-body'));

  // Required safety banner hook
  assert.ok(hubs.includes('protocol-safety-banner'));

  // Phase-1 wiring: real facade panels + no fake generation
  assert.ok(hubs.includes('protocol-evidence-health'));
  assert.ok(hubs.includes('protocol-evidence-search-panel'));
  assert.ok(hubs.includes('protocol-results-list'));
  assert.ok(hubs.includes('protocol-patient-context-panel'));
  assert.ok(hubs.includes('Generation engine not enabled'));
});

test('Protocol Studio messaging does not claim autonomous prescribing', () => {
  const hubs = readFileSync(join(__dirname, 'pages-clinical-hubs.js'), 'utf8');
  assert.ok(/decision-support/i.test(hubs));
  assert.ok(/clinician review/i.test(hubs));
  assert.ok(/not diagnosis|not.*autonomous/i.test(hubs));
});

test('Protocol Studio API helpers are present in api.js', () => {
  const apiJs = readFileSync(join(__dirname, 'api.js'), 'utf8');
  assert.ok(apiJs.includes('protocolStudioEvidenceHealth'));
  assert.ok(apiJs.includes('protocolStudioEvidenceSearch'));
  assert.ok(apiJs.includes('protocolStudioProtocols'));
  assert.ok(apiJs.includes('protocolStudioProtocol'));
  assert.ok(apiJs.includes('protocolStudioPatientContext'));
});

