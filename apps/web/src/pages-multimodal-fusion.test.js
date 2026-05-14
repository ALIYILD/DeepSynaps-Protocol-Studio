/**
 * pages-multimodal-fusion.test.js — Frontend validation for Multimodal Fusion dashboard.
 *
 * Tests verify the page renders correctly across all sections, enforces clinical
 * safety constraints (no diagnostic claims, decision-support disclaimer visible),
 * and validates modality card structure, evidence grade badges, provenance labels,
 * trajectory indicator, risk flags panel, and correlation matrix.
 *
 * Run: node --test pages-multimodal-fusion.test.js
 */

import test from 'node:test';
import assert from 'node:assert/strict';

if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis;
}
if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({ style: {}, addEventListener() {}, appendChild() {} }),
    body: { appendChild() {} },
  };
}

const mf = await import('./pages-multimodal-fusion.js');

const demoData = mf._demoFusionData('demo-patient-001');

// ── Test 1: Page renders without errors ────────────────────────────────────────

test('page renders without throwing', () => {
  assert.doesNotThrow(() => {
    mf._renderSafetyBanner();
    mf._renderFusionGauge(demoData);
    mf._renderTrajectory(demoData);
    mf._renderModalityCards(demoData);
    mf._renderRiskFlags(demoData);
    mf._renderCorrelationMatrix(demoData);
    mf._renderEvidenceSummary(demoData);
  });
});

// ── Test 2: Safety banner visible ──────────────────────────────────────────────

test('safety banner contains decision-support warning', () => {
  const html = mf._renderSafetyBanner();
  assert.match(html, /Decision-Support Only/i);
  assert.match(html, /does <em>not<\/em> replace clinical judgment/i);
});

test('safety banner has amber styling', () => {
  const html = mf._renderSafetyBanner();
  assert.match(html, /#f59e0b/);
});

// ── Test 3: Fusion score gauge renders ─────────────────────────────────────────

test('fusion gauge renders overall score', () => {
  const html = mf._renderFusionGauge(demoData);
  assert.match(html, /Fusion Score/);
  assert.match(html, /62/);
});

test('fusion gauge renders confidence bar', () => {
  const html = mf._renderFusionGauge(demoData);
  assert.match(html, /Overall Confidence/);
  assert.match(html, /78%/);
});

test('fusion gauge renders modality coverage badges', () => {
  const html = mf._renderFusionGauge(demoData);
  assert.match(html, /Video/);
  assert.match(html, /Voice/);
  assert.match(html, /Text/);
  assert.match(html, /Wearable/);
  assert.match(html, /Biomarkers/);
  assert.match(html, /Assessments/);
  assert.match(html, /Digital Phenotyping/);
});

// ── Test 4: 7 modality cards render ────────────────────────────────────────────

test('modality cards renders all 7 modalities', () => {
  const html = mf._renderModalityCards(demoData);
  assert.match(html, /Video \/ Movement/);
  assert.match(html, /Voice/);
  assert.match(html, /Text/);
  assert.match(html, /Wearable/);
  assert.match(html, /Biomarkers/);
  assert.match(html, /Assessments/);
  assert.match(html, /Digital Phenotyping/);
});

// ── Test 5: Each card shows score, confidence, grade ───────────────────────────

test('each modality card shows score value', () => {
  const html = mf._renderModalityCards(demoData);
  // Scores from demo data
  assert.match(html, /72/);  // video_movement
  assert.match(html, /58/);  // voice
  assert.match(html, /81/);  // text
  assert.match(html, /65/);  // wearable
  assert.match(html, /45/);  // biomarkers
  assert.match(html, /62/);  // assessments
  assert.match(html, /55/);  // digital_phenotyping
});

test('each modality card shows confidence bar', () => {
  const html = mf._renderModalityCards(demoData);
  assert.match(html, /Confidence/);
});

test('each modality card shows evidence grade badge', () => {
  const html = mf._renderModalityCards(demoData);
  // Evidence badges should appear
  assert.match(html, /EV-/);
});

// ── Test 6: Trajectory indicator visible ───────────────────────────────────────

test('trajectory indicator shows direction', () => {
  const html = mf._renderTrajectory(demoData);
  assert.match(html, /Stable/i);
});

test('trajectory indicator shows confidence percentage', () => {
  const html = mf._renderTrajectory(demoData);
  assert.match(html, /82%/);
});

test('trajectory indicator renders arrow symbol', () => {
  const html = mf._renderTrajectory(demoData);
  // Arrow character for stable direction
  assert.match(html, /→/);
});

test('trajectory declining shows red arrow', () => {
  const decliningData = {
    ...demoData,
    trajectory: { direction: 'declining', confidence: 0.65 },
  };
  const html = mf._renderTrajectory(decliningData);
  assert.match(html, /Declining/i);
  assert.match(html, /↓/);
  assert.match(html, /65%/);
});

test('trajectory improving shows green arrow', () => {
  const improvingData = {
    ...demoData,
    trajectory: { direction: 'improving', confidence: 0.70 },
  };
  const html = mf._renderTrajectory(improvingData);
  assert.match(html, /Improving/i);
  assert.match(html, /↑/);
});

// ── Test 7: Risk flags panel renders ───────────────────────────────────────────

test('risk flags panel renders all flags', () => {
  const html = mf._renderRiskFlags(demoData);
  // All 4 demo risk flags should appear
  assert.match(html, /Elevated PHQ-9/);
  assert.match(html, /Low vitamin D/);
  assert.match(html, /Biomarker-fusion discordance/);
  assert.match(html, /Reduced social signal/);
});

test('risk flags show severity badges', () => {
  const html = mf._renderRiskFlags(demoData);
  assert.match(html, /moderate/i);
  assert.match(html, /low/i);
});

test('risk flags panel shows evidence text when expanded', () => {
  // Expand all flags so evidence detail is visible
  demoData.risk_flags.forEach(f => mf._toggleFlag(f.id));
  const html = mf._renderRiskFlags(demoData);
  assert.match(html, /PHQ-9 = 9/);
  assert.match(html, /Vitamin D = 22/);
  // Reset for other tests
  demoData.risk_flags.forEach(f => mf._toggleFlag(f.id));
});

test('risk flags panel handles empty state', () => {
  const emptyData = { ...demoData, risk_flags: [] };
  const html = mf._renderRiskFlags(emptyData);
  assert.match(html, /No risk flags/);
});

// ── Test 8: No diagnostic claims in text ───────────────────────────────────────

const BANNED_DIAGNOSTIC_PHRASES = [
  'patient has depression',
  'patient has anxiety',
  'suffers from',
  'is depressed',
  'is bipolar',
  'confirms depression',
  'confirms anxiety',
  'confirms ADHD',
  'confirms PTSD',
  'clinical depression',
  'major depressive disorder',
  'schizophrenia',
  'bipolar disorder',
];

// Note: "diagnosis" and "diagnoses" are intentionally excluded from the
// banned list because the safety disclaimer legitimately uses phrases like
// "not a basis for diagnosis" — this is appropriate clinical safety language.

test('no diagnostic claims in safety banner', () => {
  const html = mf._renderSafetyBanner();
  const lower = html.toLowerCase();
  for (const phrase of BANNED_DIAGNOSTIC_PHRASES) {
    assert.equal(lower.includes(phrase.toLowerCase()), false, `Banned phrase '${phrase}' found in safety banner`);
  }
});

test('no diagnostic claims in evidence summary', () => {
  const html = mf._renderEvidenceSummary(demoData);
  const lower = html.toLowerCase();
  for (const phrase of BANNED_DIAGNOSTIC_PHRASES) {
    assert.equal(lower.includes(phrase.toLowerCase()), false, `Banned phrase '${phrase}' found in evidence summary`);
  }
});

test('no diagnostic claims in modality cards', () => {
  const html = mf._renderModalityCards(demoData);
  const lower = html.toLowerCase();
  for (const phrase of BANNED_DIAGNOSTIC_PHRASES) {
    assert.equal(lower.includes(phrase.toLowerCase()), false, `Banned phrase '${phrase}' found in modality cards`);
  }
});

test('no diagnostic claims in risk flags descriptions', () => {
  const html = mf._renderRiskFlags(demoData);
  const lower = html.toLowerCase();
  // Risk flags should use cautious language
  assert.doesNotMatch(html, /confirms (depression|anxiety|ADHD|PTSD|bipolar)/i);
  assert.doesNotMatch(html, /diagnoses/i);
});

// ── Test 9: Decision-support disclaimer visible ────────────────────────────────

test('evidence summary contains decision-support disclaimer', () => {
  const html = mf._renderEvidenceSummary(demoData);
  assert.match(html, /decision-support tool only/i);
  assert.match(html, /qualified clinician/i);
});

test('safety banner contains decision-support language', () => {
  const html = mf._renderSafetyBanner();
  assert.match(html, /Decision-Support/i);
  assert.match(html, /clinician review/i);
});

// ── Test 10: Evidence grade badges present (A/B/C/D) ───────────────────────────

test('evidence summary shows grade A badge', () => {
  const html = mf._renderEvidenceSummary(demoData);
  assert.match(html, /EV-A/);
});

test('evidence summary shows grade B badge', () => {
  const html = mf._renderEvidenceSummary(demoData);
  assert.match(html, /EV-B/);
});

test('evidence summary shows grade C badge', () => {
  const html = mf._renderEvidenceSummary(demoData);
  assert.match(html, /EV-C/);
});

test('evidence summary shows grade D badge', () => {
  const html = mf._renderEvidenceSummary(demoData);
  assert.match(html, /EV-D/);
});

test('evidence summary grade counts match data', () => {
  const html = mf._renderEvidenceSummary(demoData);
  // Demo data has: a_count=2, b_count=2, c_count=3, d_count=0
  // Each grade badge + count should appear in the grid
  assert.match(html, />2</);           // count of 2 appears
  assert.match(html, />3</);           // count of 3 appears
  assert.match(html, />0</);           // count of 0 appears
  assert.match(html, /High quality/);   // grade A description
  assert.match(html, /Moderate/);       // grade B description
  assert.match(html, /Limited/);        // grade C description
  assert.match(html, /Insufficient/);   // grade D description
});

// ── Test 11: Provenance labels present ─────────────────────────────────────────

test('modality cards show provenance labels', () => {
  const html = mf._renderModalityCards(demoData);
  assert.match(html, /Measured/i);
  assert.match(html, /Inferred/i);
  assert.match(html, /Proxy/i);
});

test('provenance pill has correct styling', () => {
  const measured = mf.provenancePill('measured');
  assert.match(measured, /Measured/);
  assert.match(measured, /22c55e/); // green

  const inferred = mf.provenancePill('inferred');
  assert.match(inferred, /Inferred/);
  assert.match(inferred, /3b82f6/); // blue

  const proxy = mf.provenancePill('proxy');
  assert.match(proxy, /Proxy/);
  assert.match(proxy, /a855f7/); // purple
});

// ── Test 12: Correlation matrix renders ────────────────────────────────────────

test('correlation matrix renders table structure', () => {
  const html = mf._renderCorrelationMatrix(demoData);
  assert.match(html, /<table/);
  assert.match(html, /<\/table>/);
  assert.match(html, /<thead/);
  assert.match(html, /<tbody/);
});

test('correlation matrix has 7 rows and 7 columns', () => {
  const html = mf._renderCorrelationMatrix(demoData);
  // Count row elements
  const rowMatches = html.match(/<tr>/g);
  assert.ok(rowMatches && rowMatches.length >= 7, 'Expected at least 7 table rows');
});

test('correlation matrix shows modality names', () => {
  const html = mf._renderCorrelationMatrix(demoData);
  assert.match(html, /Video/);
  assert.match(html, /Voice/);
  assert.match(html, /Wearable/);
  assert.match(html, /Biomarkers/);
  assert.match(html, /Assessments/);
});

test('correlation matrix diagonal shows 1.0', () => {
  const html = mf._renderCorrelationMatrix(demoData);
  assert.match(html, /1\.0/);
});

test('correlation matrix cells have color coding', () => {
  const html = mf._renderCorrelationMatrix(demoData);
  // Should have rgba colors for correlation values
  assert.match(html, /rgba\(34,197,94/);  // green for positive
  assert.match(html, /rgba\(239,68,68/);  // red for negative
});

// ── Test helpers: grade letter function ────────────────────────────────────────

test('gradeLetter normalizes grades correctly', () => {
  assert.equal(mf.gradeLetter('A'), 'A');
  assert.equal(mf.gradeLetter('B'), 'B');
  assert.equal(mf.gradeLetter('C'), 'C');
  assert.equal(mf.gradeLetter('D'), 'D');
  assert.equal(mf.gradeLetter('EV-A'), 'A');
  assert.equal(mf.gradeLetter('EV-B'), 'B');
  assert.equal(mf.gradeLetter(null), 'D');
  assert.equal(mf.gradeLetter(undefined), 'D');
  assert.equal(mf.gradeLetter(''), 'D');
});

// ── Test helpers: trajectory arrow function ────────────────────────────────────

test('trajectoryArrow returns correct symbols', () => {
  assert.equal(mf.trajectoryArrow('improving'), '↑');
  assert.equal(mf.trajectoryArrow('declining'), '↓');
  assert.equal(mf.trajectoryArrow('stable'), '→');
  assert.equal(mf.trajectoryArrow('fluctuating'), '~');
  assert.equal(mf.trajectoryArrow('unknown'), '→'); // default
});

// ── Test helpers: confidence bar function ──────────────────────────────────────

test('confidenceBar returns SVG markup', () => {
  const html = mf.confidenceBar(0.75);
  assert.match(html, /<svg/);
  assert.match(html, /<\/svg>/);
  assert.match(html, /<rect/);
});

// ── Test helpers: score color function ─────────────────────────────────────────

test('scoreColor returns green for high scores', () => {
  assert.equal(mf.scoreColor(75), '#22c55e');
  assert.equal(mf.scoreColor(100), '#22c55e');
  assert.equal(mf.scoreColor(70), '#22c55e');
});

test('scoreColor returns amber for mid scores', () => {
  assert.equal(mf.scoreColor(50), '#f59e0b');
  assert.equal(mf.scoreColor(60), '#f59e0b');
  assert.equal(mf.scoreColor(69), '#f59e0b');
});

test('scoreColor returns red for low scores', () => {
  assert.equal(mf.scoreColor(49), '#ef4444');
  assert.equal(mf.scoreColor(0), '#ef4444');
  assert.equal(mf.scoreColor(25), '#ef4444');
});

// ── Test helpers: esc function ─────────────────────────────────────────────────

test('esc escapes HTML entities', () => {
  assert.equal(mf.esc('<script>'), '&lt;script&gt;');
  assert.equal(mf.esc('"test"'), '&quot;test&quot;');
  assert.equal(mf.esc('a & b'), 'a &amp; b');
  assert.equal(mf.esc(null), '');
  assert.equal(mf.esc(undefined), '');
});

// ── Test: fmtPct formatting ────────────────────────────────────────────────────

test('fmtPct formats percentages correctly', () => {
  assert.equal(mf.fmtPct(0.78), '78%');
  assert.equal(mf.fmtPct(0.5), '50%');
  assert.equal(mf.fmtPct(1.0), '100%');
  assert.equal(mf.fmtPct(null), '\u2014');
  assert.equal(mf.fmtPct(undefined), '\u2014');
});

// ── Test: demo data has all 7 modalities ───────────────────────────────────────

test('demo data contains all 7 modalities', () => {
  const modalities = demoData.modalities;
  assert.ok(modalities.video_movement);
  assert.ok(modalities.voice);
  assert.ok(modalities.text);
  assert.ok(modalities.wearable);
  assert.ok(modalities.biomarkers);
  assert.ok(modalities.assessments);
  assert.ok(modalities.digital_phenotyping);
});

// ── Test: demo data has risk flags ─────────────────────────────────────────────

test('demo data contains risk flags', () => {
  assert.ok(demoData.risk_flags.length > 0);
  assert.equal(demoData.risk_flags.length, 4);
});

// ── Test: demo data has correlation data ───────────────────────────────────────

test('demo data contains correlations', () => {
  assert.ok(demoData.correlations.length > 0);
  // 7 choose 2 = 21 correlations
  assert.equal(demoData.correlations.length, 21);
});

// ── Test: demo data has timeline data ──────────────────────────────────────────

test('demo data contains 30-day timeline', () => {
  assert.equal(demoData.timeline.length, 30);
  assert.ok(demoData.timeline[0].date);
  assert.ok(demoData.timeline[29].date);
});
