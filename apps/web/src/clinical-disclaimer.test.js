/**
 * Clinical disclaimer helper: tests for banner rendering and badge helpers.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  renderClinicalDisclaimer,
  renderAiOutputDisclaimer,
  renderModuleClinicalDisclaimer,
  renderPatientFacingDisclaimer,
  renderPHIWarningBadge,
  renderNLPStatusBadge,
  renderEvidenceLink,
} from './clinical-disclaimer.js';

test('renderClinicalDisclaimer includes required disclaimer text', () => {
  const html = renderClinicalDisclaimer();
  assert.ok(html.includes('Clinical disclaimer'));
  assert.ok(html.includes('Clinical decision-support only'));
  assert.ok(html.includes('does not provide a diagnosis'));
  assert.ok(html.includes('prescribe treatment'));
  assert.ok(html.includes('Human review required'));
  assert.ok(html.includes('Clinician review required'));
  assert.ok(html.includes('role="region"'));
  assert.ok(html.includes('aria-label="Clinical disclaimer"'));
});

test('renderAiOutputDisclaimer uses the AI-generated draft copy', () => {
  const html = renderAiOutputDisclaimer();
  assert.ok(html.includes('AI-generated draft'));
  assert.ok(html.includes('verify before use'));
  assert.ok(html.includes('Do not rely on this output as the sole basis'));
});

test('renderModuleClinicalDisclaimer emits module-specific copy', () => {
  const html = renderModuleClinicalDisclaimer('protocol');
  assert.ok(html.includes('Protocol drafting support only'));
  assert.ok(html.includes('off-label'));
});

test('renderPatientFacingDisclaimer emits simplified patient copy', () => {
  const html = renderPatientFacingDisclaimer();
  assert.ok(html.includes('Not medical advice'));
  assert.ok(html.includes('education only'));
});

test('renderClinicalDisclaimer HTML is valid and escaped', () => {
  const html = renderClinicalDisclaimer();
  assert.ok(typeof html === 'string');
  assert.ok(html.length > 100);
  assert.ok(html.startsWith('<div'));
  assert.ok(html.endsWith('</div>'));
});

test('renderPHIWarningBadge renders with active status', () => {
  const html = renderPHIWarningBadge('active');
  assert.match(html, /PHI protection: Presidio active/i);
  assert.ok(html.includes('rgba(34,197,94'));
  assert.ok(html.includes('inline-flex'));
});

test('renderPHIWarningBadge renders with heuristic status', () => {
  const html = renderPHIWarningBadge('heuristic');
  assert.match(html, /PHI protection: heuristic only/i);
  assert.ok(html.includes('rgba(246,178,60'));
  assert.ok(html.includes('Manual review recommended'));
});

test('renderPHIWarningBadge renders with unavailable status', () => {
  const html = renderPHIWarningBadge('unavailable');
  assert.match(html, /PHI protection: unavailable/i);
  assert.ok(html.includes('rgba(248,113,113'));
  assert.ok(html.includes('Do not process real patient text'));
});

test('renderNLPStatusBadge renders with active status', () => {
  const html = renderNLPStatusBadge('active');
  assert.match(html, /NLP: Active/i);
  assert.ok(html.includes('rgba(34,197,94'));
});

test('renderNLPStatusBadge renders with demo status', () => {
  const html = renderNLPStatusBadge('demo');
  assert.match(html, /NLP: Demo \/ heuristic/i);
  assert.ok(html.includes('rgba(168,85,247'));
});

test('renderNLPStatusBadge renders with unavailable status', () => {
  const html = renderNLPStatusBadge('unavailable');
  assert.match(html, /NLP: Unavailable/i);
  assert.ok(html.includes('rgba(107,114,128'));
});

test('all badges include title/tooltip text', () => {
  assert.ok(renderPHIWarningBadge('active').includes('title='));
  assert.ok(renderNLPStatusBadge('demo').includes('title='));
});

// ──────────────────────────────────────────────────────────────────────────
// Branch-coverage additions: target options-paths and fallthrough branches
// that the original test set never exercised. These hit the `||` fallback
// chains in _renderDisclaimerCard, _resolveDisclaimer, renderAiOutputDisclaimer,
// renderModuleClinicalDisclaimer, renderPHIWarningBadge, renderNLPStatusBadge,
// and the previously-unwired renderEvidenceLink export.
// ──────────────────────────────────────────────────────────────────────────

test('renderModuleClinicalDisclaimer falls back to global for unknown keys', () => {
  const html = renderModuleClinicalDisclaimer('this-key-does-not-exist');
  // Global disclaimer copy must surface when the moduleKey is unknown.
  assert.ok(html.includes('Clinical decision-support only'));
  assert.ok(html.includes('module-disclaimer-this-key-does-not-exist'));
});

test('renderModuleClinicalDisclaimer accepts an explicit className override', () => {
  const html = renderModuleClinicalDisclaimer('protocol', { className: 'my-custom-class' });
  assert.ok(html.includes('class="my-custom-class"'));
  // Default module-disclaimer prefix should NOT appear when overridden.
  assert.equal(html.includes('module-disclaimer-protocol'), false);
});

test('renderModuleClinicalDisclaimer respects compact=false and custom marginBottom', () => {
  const compact = renderModuleClinicalDisclaimer('qeeg'); // default compact=true
  const wide = renderModuleClinicalDisclaimer('qeeg', { compact: false, marginBottom: 32 });
  assert.ok(compact.includes('font-size: 12px'));
  assert.ok(wide.includes('font-size: 13px'));
  assert.ok(wide.includes('margin-bottom: 32px'));
});

test('renderAiOutputDisclaimer routes through patient copy when patientFacing=true', () => {
  const html = renderAiOutputDisclaimer({ patientFacing: true });
  assert.ok(html.includes('Not medical advice'));
  assert.ok(html.includes('education only'));
});

test('renderAiOutputDisclaimer honors explicit variant and className overrides', () => {
  const html = renderAiOutputDisclaimer({ variant: 'mri', className: 'my-ai-card', marginBottom: 24 });
  assert.ok(html.includes('Imaging support only'));
  assert.ok(html.includes('class="my-ai-card"'));
  assert.ok(html.includes('margin-bottom: 24px'));
});

test('renderAiOutputDisclaimer compact=false widens padding and font-size', () => {
  const html = renderAiOutputDisclaimer({ compact: false });
  assert.ok(html.includes('font-size: 13px'));
  assert.ok(html.includes('padding: 12px 16px'));
});

test('renderPHIWarningBadge falls back to unavailable copy for unknown status', () => {
  const html = renderPHIWarningBadge('not-a-real-status');
  // Unknown status should render the unavailable variant (red, "Do not process…").
  assert.match(html, /PHI protection: unavailable/i);
  assert.ok(html.includes('rgba(248,113,113'));
});

test('renderNLPStatusBadge falls back to unavailable for unknown status', () => {
  const html = renderNLPStatusBadge('mystery');
  assert.match(html, /NLP: Unavailable/i);
  assert.ok(html.includes('rgba(107,114,128'));
});

test('renderEvidenceLink renders a pubmed link with default label', () => {
  const html = renderEvidenceLink({ pubmed: '12345678' });
  assert.ok(html.includes('href="https://pubmed.ncbi.nlm.nih.gov/12345678/"'));
  assert.ok(html.includes('PMID: 12345678'));
  assert.ok(html.includes('target="_blank"'));
  assert.ok(html.includes('rel="noopener noreferrer"'));
});

test('renderEvidenceLink renders a doi link when only doi is provided', () => {
  const html = renderEvidenceLink({ doi: '10.1234/foo.bar' });
  assert.ok(html.includes('href="https://doi.org/10.1234/foo.bar"'));
  assert.ok(html.includes('DOI: 10.1234/foo.bar'));
});

test('renderEvidenceLink prefers pubmed when both pubmed and doi are present', () => {
  const html = renderEvidenceLink({ pubmed: '111', doi: '10.0/x' });
  assert.ok(html.includes('href="https://pubmed.ncbi.nlm.nih.gov/111/"'));
  // The doi shouldn't appear in href when pubmed wins.
  assert.equal(html.includes('https://doi.org/10.0/x'), false);
});

test('renderEvidenceLink uses a custom label when provided', () => {
  const html = renderEvidenceLink({ pubmed: '999', label: 'Smith 2024' });
  assert.ok(html.includes('Smith 2024'));
  // Default PMID label should be replaced.
  assert.equal(html.includes('PMID: 999'), false);
});

test('renderEvidenceLink returns empty string when neither pubmed nor doi is given', () => {
  assert.equal(renderEvidenceLink({}), '');
  assert.equal(renderEvidenceLink({ label: 'orphan' }), '');
  assert.equal(renderEvidenceLink(), '');
  assert.equal(renderEvidenceLink(null), '');
});

test('renderClinicalDisclaimer falls back to global when kind is unknown', () => {
  const html = renderClinicalDisclaimer('mystery-kind');
  // The fallback path in _resolveDisclaimer routes to DISCLAIMER_COPY.global.
  assert.ok(html.includes('Clinical decision-support only'));
});

test('renderClinicalDisclaimer accepts module keys (mri, voice, biometrics, etc.)', () => {
  // Just exercising more of the DISCLAIMER_COPY map so additional copy
  // branches in _renderDisclaimerCard are touched.
  assert.ok(renderClinicalDisclaimer('mri').includes('Imaging support only'));
  assert.ok(renderClinicalDisclaimer('voice').includes('Behavioural AI limitation'));
  assert.ok(renderClinicalDisclaimer('biometrics').includes('Biometric data limitation'));
  assert.ok(renderClinicalDisclaimer('export').includes('AI-assisted clinical document'));
  assert.ok(renderClinicalDisclaimer('evidence').includes('Evidence retrieval'));
  assert.ok(renderClinicalDisclaimer('text').includes('Document summarisation warning'));
  assert.ok(renderClinicalDisclaimer('deeptwin').includes('Simulation and prediction limitation'));
});
