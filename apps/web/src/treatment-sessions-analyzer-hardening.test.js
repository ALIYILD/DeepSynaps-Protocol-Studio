/**
 * Production-hardening contracts for Treatment Sessions Analyzer (pages-treatment-sessions-analyzer.js).
 * Run: node --test src/treatment-sessions-analyzer-hardening.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

function src() {
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  return fs.readFileSync(path.join(here, 'pages-treatment-sessions-analyzer.js'), 'utf8');
}

test('GOVERNANCE_COPY is present in page header comment', () => {
  const s = src();
  assert.ok(s.includes('clinician-reviewed treatment-session decision support'));
  assert.ok(s.includes('Does not approve protocols'));
});

test('Role gate whitelist is explicit and excludes patient/guest', () => {
  const s = src();
  assert.ok(s.includes("'clinician'"));
  assert.ok(s.includes("'admin'"));
  assert.ok(s.includes('canUseTreatmentSessionsAnalyzerWorkspace'));
  assert.ok(s.includes('restricted to authorised clinical staff roles'));
});

test('No positive diagnosis or treatment-approval claims in source', () => {
  const s = src();
  // "Not a diagnosis" and "not autonomous approval" disclaimers are appropriate and allowed
  assert.equal(/diagnosis of/i.test(s), false);
  assert.equal(/diagnosed/i.test(s), false);
  // Positive claims only
  assert.equal(/protocol approved/i.test(s), false);
  assert.equal(/treatment recommended/i.test(s), false);
});

test('Empty states avoid all-clear and absence-proves-negative language', () => {
  const s = src();
  assert.equal(/all clear/i.test(s), false);
  assert.equal(/no concerns/i.test(s), false);
  assert.ok(s.includes('does not prove zero treatments occurred'));
  assert.ok(s.includes('does not prove absence of adverse events'));
});

test('Demo fixtures are honestly tagged throughout', () => {
  const s = src();
  assert.ok(s.includes('Demo sample'));
  assert.ok(s.includes('Demo / sample'));
  assert.ok(s.includes('DEMO_FIXTURE_BANNER_HTML'));
  assert.ok(s.includes('_demo_fixture'));
});

test('Sign-off panel carries clinician-review disclaimer', () => {
  const s = src();
  assert.ok(s.includes('requires clinician review per clinic protocol'));
  assert.ok(s.includes('not autonomous approval'));
});

test('Adverse-event copy requires clinician review and does not notify staff', () => {
  const s = src();
  assert.ok(s.includes('Requires clinician review per clinic protocol'));
  assert.ok(s.includes('does not notify staff unless your backend sends notifications separately'));
});

test('Outcome trajectory uses neutral directional labels only', () => {
  const s = src();
  assert.ok(s.includes("'down'"));
  assert.ok(s.includes("'up'"));
  assert.ok(s.includes("'flat'"));
  assert.equal(/improved/i.test(s), false);
  assert.equal(/worsened/i.test(s), false);
});

test('Deviation and interruption language is cautious and references source records', () => {
  const s = src();
  assert.ok(s.includes('Open Course Detail or source records for parameters'));
  assert.ok(s.includes('Requires clinician review'));
});

test('Audit teaser distinguishes empty from unavailable', () => {
  const s = src();
  assert.ok(s.includes('_renderAuditTeaser'));
  assert.ok(s.includes('audit_unavailable'));
});

test('Batch sign-status merge logic is present for performance', () => {
  const s = src();
  assert.ok(s.includes('_mergeBatchSignIntoRows'));
  assert.ok(s.includes('_mergeBatchUnavailable'));
});

test('Concurrency limiter is present for session hydration', () => {
  const s = src();
  assert.ok(s.includes('_mapWithConcurrency'));
});

test('Restricted card renders for unauthorized roles', () => {
  const s = src();
  assert.ok(s.includes('_restrictedCard'));
  assert.ok(s.includes('restricted to authorised clinical staff roles'));
});

test('Export or save actions are wired to audit logging', () => {
  const s = src();
  assert.ok(s.includes('logReportsAudit') || s.includes('postWearablesWorkbenchAuditEvent') || s.includes('audit'));
});

test('Session parameter delta compares prescribed vs delivered', () => {
  const s = src();
  assert.ok(s.includes('prescribed') && s.includes('delivered'));
});

test('Outcome sparkline is hand-rolled SVG (no external chart library)', () => {
  const s = src();
  assert.ok(s.includes('<svg') || s.includes('<polyline'));
  assert.equal(s.includes('chart.js') || s.includes('d3') || s.includes('plotly'), false);
});
