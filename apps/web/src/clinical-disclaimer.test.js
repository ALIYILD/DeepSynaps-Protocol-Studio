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
