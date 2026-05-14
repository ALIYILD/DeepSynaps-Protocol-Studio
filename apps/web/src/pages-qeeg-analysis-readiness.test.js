/**
 * Live-readiness helpers for qEEG Analysis: synthetic demo detection and
 * safety copy — avoids presenting bundled preview data as clinical findings.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const mod = await import('./pages-qeeg-analysis.js');

test('_qeegAnalysisIsSyntheticDemo detects demo bundle shape', () => {
  assert.equal(mod._qeegAnalysisIsSyntheticDemo(null), false);
  assert.equal(mod._qeegAnalysisIsSyntheticDemo({}), false);
  assert.equal(mod._qeegAnalysisIsSyntheticDemo({ id: 'demo' }), true);
  assert.equal(mod._qeegAnalysisIsSyntheticDemo({ norm_db_version: 'toy-0.1' }), true);
  assert.equal(mod._qeegAnalysisIsSyntheticDemo({ is_synthetic_demo: true }), true);
});

test('_qeegReportIsSyntheticDemo pairs report + analysis', () => {
  assert.equal(mod._qeegReportIsSyntheticDemo({}, { id: 'real-uuid' }), false);
  assert.equal(mod._qeegReportIsSyntheticDemo({ id: 'demo-report' }, null), true);
  assert.equal(mod._qeegReportIsSyntheticDemo({}, { id: 'demo' }), true);
});

test('clinical safety footer lists non-diagnosis and non-prescriptive language', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  // The footer renderer lives in pages-qeeg-analysis.js but the bullet
  // copy itself was extracted into ./clinical-ai-safety-copy.js for
  // reuse across surfaces. Verify (a) the renderer is wired and pulls
  // the canonical constant, and (b) the canonical bullets still carry
  // the required clinical-safety language.
  const pageSrc = fs.readFileSync(path.join(import.meta.dirname, 'pages-qeeg-analysis.js'), 'utf8');
  const copySrc = fs.readFileSync(path.join(import.meta.dirname, 'clinical-ai-safety-copy.js'), 'utf8');
  assert.match(pageSrc, /function _qeegClinicalSafetyFooter/);
  assert.match(pageSrc, /QEEG_ANALYZER_SAFETY_FOOTER_BULLETS/);
  assert.ok(copySrc.includes('not autonomous diagnosis'), 'explicit non-diagnosis');
  assert.ok(copySrc.includes('draft'), 'protocol draft wording');
  assert.ok(copySrc.includes('does not diagnose, prescribe, triage emergencies, approve treatment, or act autonomously'), 'required sprint disclaimer');
  assert.ok(copySrc.includes('All outputs require clinician review'), 'sprint clinician review clause');
});

test('diagnoses field renamed to clinical_profile_notes to avoid forbidden word', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const src = fs.readFileSync(path.join(import.meta.dirname, 'pages-qeeg-analysis.js'), 'utf8');
  // Should not have diagnoses: field key in demo fixtures (only in old function names)
  assert.ok(/clinical_profile_notes:\s*{/.test(src), 'clinical_profile_notes field present');
  // Verify it's in the demo fixtures
  assert.ok(src.includes("clinical_profile_notes:  { primary_dx: 'Demo profile'"), 'renamed in COMMON fixture');
  assert.ok(src.includes("clinical_profile_notes:    { primary_dx: 'ADHD"), 'renamed in Sarah demo');
});

test('evidence-qeeg integration module exports required functions', async () => {
  const evMod = await import('./evidence-qeeg.js');
  assert.ok(typeof evMod.fetchQEEGEvidenceForAnalysis === 'function');
  assert.ok(typeof evMod.renderQEEGEvidenceCitations === 'function');
  assert.ok(typeof evMod.isEvidenceAvailable === 'function');
  assert.ok(typeof evMod.summarizeQEEGFlaggedConditions === 'function');
});

test('evidence rendering includes honest unavailable / error / empty states', async () => {
  const evMod = await import('./evidence-qeeg.js');

  // Test unavailable state — never misleads clinician
  const unavail = evMod.renderQEEGEvidenceCitations({ status: 'unavailable', items: [] });
  assert.ok(unavail.includes('unavailable'));
  assert.ok(unavail.includes('Clinician judgment'));

  // Test error state — honest about retrieval failure
  const errState = evMod.renderQEEGEvidenceCitations({ status: 'error', items: [] });
  assert.ok(errState.includes('Could not retrieve') || errState.includes('could not retrieve'));

  // Test empty result state — no false confidence
  const empty = evMod.renderQEEGEvidenceCitations({ status: 'ok', items: [] });
  assert.ok(empty.includes('Clinician review'));
});

// ── Evidence-safety: filterGatedSuggestions defence-in-depth wiring ─────────
//
// Audit finding (~/.hermes/audits/evidence-safety-2026-05-11.md, P1): the
// frontend filter at qeeg-protocol-suggestion-filter.js existed but no
// production renderer imported it. tDCS-O1/O2 and tACS-Pz protocol
// suggestions were blocked only by the backend; no defence-in-depth.

test('pages-qeeg-analysis imports filterGatedSuggestions for defence-in-depth', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const src = fs.readFileSync(path.join(import.meta.dirname, 'pages-qeeg-analysis.js'), 'utf8');
  assert.match(
    src,
    /import\s+\{\s*filterGatedSuggestions\s*\}\s+from\s+['"]\.\/qeeg-protocol-suggestion-filter\.js['"]/,
    'pages-qeeg-analysis.js must import filterGatedSuggestions from the dedicated filter module',
  );
});

test('filterGatedSuggestions is applied before suggestions reach the DOM in pages-qeeg-analysis', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const src = fs.readFileSync(path.join(import.meta.dirname, 'pages-qeeg-analysis.js'), 'utf8');
  // Both suggestion-render sites (the comprehensive report renderer near
  // line 2397 and the print-window renderer near line 7049) must wrap the
  // protocol_suggestions array with filterGatedSuggestions().
  const occurrences = src.match(/filterGatedSuggestions\s*\(/g) || [];
  assert.ok(
    occurrences.length >= 2,
    `expected >=2 call sites for filterGatedSuggestions(), found ${occurrences.length}`,
  );
  // Spot-check: the print renderer must filter too (regression guard for line 7049).
  assert.match(
    src,
    /filterGatedSuggestions\(_currentReport\.protocol_suggestions/,
    'print renderer must filter _currentReport.protocol_suggestions',
  );
});

test('filterGatedSuggestions actually strips tDCS-O1/O2 + tACS-Pz from arrays', async () => {
  const { filterGatedSuggestions } = await import('./qeeg-protocol-suggestion-filter.js');
  // Even if a hypothetical backend regression emits the audit-disabled
  // patterns, the frontend filter must drop them before any DOM render.
  const out = filterGatedSuggestions([
    { modality: 'tDCS', target: 'O1/O2', protocol: 'Should not appear' },
    { modality: 'tACS', target: 'Pz', protocol: 'Also should not appear' },
    { pattern: 'lateraloccipital_bilateral_deficit', protocol: 'Pattern fingerprint hit' },
    { pattern: 'precuneus_bilateral_excess', protocol: 'Pattern fingerprint hit' },
    { modality: 'rTMS', target: 'left DLPFC', protocol: 'Evidence-backed — should survive' },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].target, 'left DLPFC');
});
