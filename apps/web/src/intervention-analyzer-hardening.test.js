/**
 * Production-hardening contracts for Intervention Analyzer (pages-intervention-analyzer.js).
 * Run: node --test src/intervention-analyzer-hardening.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

function src() {
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  return fs.readFileSync(path.join(here, 'pages-intervention-analyzer.js'), 'utf8');
}

test('GOVERNANCE_COPY is present in page header comment', () => {
  const s = src();
  assert.ok(s.includes('clinician-reviewed intervention decision support') || s.includes('clinician-reviewed treatment-session decision support'));
  assert.ok(s.includes('Does not approve protocols'));
});

test('Role gate whitelist is explicit and excludes patient/guest', () => {
  const s = src();
  assert.ok(s.includes("'clinician'"));
  assert.ok(s.includes("'admin'"));
  assert.ok(s.includes('canUseInterventionAnalyzerWorkspace'));
  assert.ok(s.includes('restricted to authorised clinical staff roles'));
});

test('Role gate excludes reviewer, technician, resident (narrowed clinical gate)', () => {
  const s = src();
  // Reviewer/technician/resident should NOT be in the allowed set for intervention analyzer
  const roleSetMatch = s.match(/INTERVENTION_CLINICAL_ROLES\s*=\s*new\s+Set\(\[([^\]]+)\]/s)
    || s.match(/TREATMENT_SESSIONS_CLINICAL_ROLES\s*=\s*new\s+Set\(\[([^\]]+)\]/s);
  if (roleSetMatch) {
    const setBody = roleSetMatch[1];
    assert.equal(setBody.includes("'reviewer'"), false, 'reviewer must not be in allowed set');
    assert.equal(setBody.includes("'technician'"), false, 'technician must not be in allowed set');
    assert.equal(setBody.includes("'resident'"), false, 'resident must not be in allowed set');
  }
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

test('No causal overclaim language in source', () => {
  const s = src();
  // The phrase list intentionally includes forbidden marketing language as
  // fixtures so the analyzer source is verified to NOT contain them. The
  // governance-allow marker keeps this file out of the audit walker.
  const banned = ['caused improvement', 'proves efficacy', 'predicts response', // governance-allow: fixture list asserts these are absent
    'recommends treatment', 'treatment caused', 'will improve', 'guaranteed', 'proven outcome']; // governance-allow: same fixture list
  for (const phrase of banned) {
    assert.equal(
      s.toLowerCase().includes(phrase),
      false,
      `Banned causal phrase found in source: "${phrase}"`
    );
  }
});

test('Safety disclaimer copy is present in rendered output', () => {
  const s = src();
  assert.ok(s.includes('decision support only') || s.includes('decision-support only'));
});

test('Model limitation disclosure is present (not a calibrated prediction model)', () => {
  const s = src();
  assert.ok(
    s.includes('not a calibrated prediction model') || s.includes('no_calibrated_model'),
    'Missing calibrated-model limitation disclosure'
  );
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

test('All 5 demo patients are present in intervention analyzer fixture', () => {
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  const fixtureSrc = fs.readFileSync(path.join(here, 'demo-fixtures-analyzers.js'), 'utf8');
  assert.ok(fixtureSrc.includes("'demo-pt-samantha-li'"));
  assert.ok(fixtureSrc.includes("'demo-pt-marcus-chen'"));
  assert.ok(fixtureSrc.includes("'demo-pt-elena-vasquez'"));
  assert.ok(fixtureSrc.includes("'demo-pt-omar-haddad'"));
  assert.ok(fixtureSrc.includes("'demo-pt-amelia-brown'"));
});

test('Demo fixtures include varied clinical scenarios (adherence, deviations, AEs, outcomes)', () => {
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  const fixtureSrc = fs.readFileSync(path.join(here, 'demo-fixtures-analyzers.js'), 'utf8');
  // Multiple deviations
  assert.ok(fixtureSrc.includes('deviationIndices: [6, 9]'));
  // Low adherence
  assert.ok(fixtureSrc.includes('adherence_pct: 45'));
  // Multiple outcome scales
  assert.ok(fixtureSrc.includes('all_summaries'));
  // AE flag
  assert.ok(fixtureSrc.includes('aeIndices'));
  // Unsigned sessions
  assert.ok(fixtureSrc.includes('unsignedIndices'));
});

// ---------------------------------------------------------------------------
// Honest Response Label hardening (post-intervention-rename contract)
// ---------------------------------------------------------------------------

test('_responseLabel contract returns provenance object (not bare string)', () => {
  const s = src();
  assert.ok(
    s.includes('provenance') && s.includes('rule_based_heuristic'),
    '_responseLabel must expose provenance: "rule_based_heuristic"'
  );
});

test('Heuristic limitation note is present in response label', () => {
  const s = src();
  assert.ok(
    s.includes('heuristic') && s.includes('not a calibrated prediction model'),
    'Response label must disclose heuristic nature and calibrated-model limitation'
  );
});
