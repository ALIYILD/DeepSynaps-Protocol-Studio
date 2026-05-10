/**
 * Clinical disclaimer helper: tests for banner rendering and badge helpers.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  renderClinicalDisclaimer,
  renderAiOutputDisclaimer,
  renderModuleClinicalDisclaimer,
  renderPHIWarningBadge,
  renderNLPStatusBadge,
} from './clinical-disclaimer.js';

test('renderClinicalDisclaimer includes required disclaimer text', () => {
  const html = renderClinicalDisclaimer();
  assert.ok(html.includes('Clinical disclaimer'));
  assert.ok(html.includes('does not diagnose'));
  assert.ok(html.includes('prescribe'));
  assert.ok(html.includes('require clinician review'));
  assert.ok(html.includes('role="region"'));
  assert.ok(html.includes('aria-label="Clinical disclaimer"'));
});

test('renderAiOutputDisclaimer renders patient-facing copy', () => {
  const html = renderAiOutputDisclaimer({ variant: 'patient' });
  assert.ok(html.includes('Not medical advice'));
  assert.ok(html.includes('education only'));
  assert.ok(html.includes('patient-ai-output-disclaimer'));
});

test('renderModuleClinicalDisclaimer renders MRI copy', () => {
  const html = renderModuleClinicalDisclaimer('mri');
  assert.ok(html.includes('Imaging support only'));
  assert.ok(html.includes('radiology report'));
  assert.ok(html.includes('module-disclaimer-mri'));
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
