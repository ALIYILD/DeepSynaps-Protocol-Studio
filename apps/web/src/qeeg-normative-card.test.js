// Tests for qeeg-normative-card.js — Normative Model Card
// Pins: null guard, status pill variants, OOD warning banner, clinical caveat,
//       limitations list, decision-support disclaimer, boolean field rendering,
//       XSS escaping.

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { renderNormativeModelCard } from './qeeg-normative-card.js';

describe('renderNormativeModelCard', () => {
  it('returns empty string when card is null', () => {
    assert.strictEqual(renderNormativeModelCard(null), '');
  });

  it('returns empty string when card is undefined', () => {
    assert.strictEqual(renderNormativeModelCard(undefined), '');
  });

  it('renders section header "Normative Model Card"', () => {
    const html = renderNormativeModelCard({ complete: true, status: 'configured' });
    assert.ok(html.includes('Normative Model Card'), 'expected section header');
  });

  it('shows "Complete" pill (green) when complete=true and status is not overriding', () => {
    const html = renderNormativeModelCard({ complete: true, status: 'ok' });
    assert.ok(html.includes('Complete'), 'expected Complete pill');
    assert.ok(html.includes('#22c55e'), 'Complete pill must use green colour');
  });

  it('shows "Partial" pill (amber) when complete=false', () => {
    const html = renderNormativeModelCard({ complete: false, status: 'partial' });
    assert.ok(html.includes('Partial'), 'expected Partial pill');
    assert.ok(html.includes('#f59e0b'), 'Partial pill must use amber colour');
  });

  it('shows "Toy / Non-Clinical" pill when status is "toy"', () => {
    const html = renderNormativeModelCard({ complete: false, status: 'toy' });
    assert.ok(html.includes('Toy / Non-Clinical'), 'expected "Toy / Non-Clinical" pill text');
  });

  it('shows "Norms Unavailable" pill (red) when status is "unavailable"', () => {
    const html = renderNormativeModelCard({ complete: false, status: 'unavailable' });
    assert.ok(html.includes('Norms Unavailable'), 'expected "Norms Unavailable" pill');
    assert.ok(html.includes('#ef4444'), '"Norms Unavailable" pill must use red colour');
  });

  it('shows "Configured" pill (green) when status is "configured"', () => {
    const html = renderNormativeModelCard({ complete: true, status: 'configured' });
    assert.ok(html.includes('Configured'), 'expected "Configured" pill');
    assert.ok(html.includes('#22c55e'), '"Configured" pill must use green colour');
  });

  it('renders Out-of-Distribution Warning banner when ood_warning is provided', () => {
    const html = renderNormativeModelCard({ complete: true, ood_warning: 'Age outside training range.' });
    assert.ok(html.includes('Out-of-Distribution Warning'), 'expected OOD warning banner');
    assert.ok(html.includes('Age outside training range.'), 'expected OOD warning text');
  });

  it('renders Clinical Caveat banner when clinical_caveat is provided', () => {
    const html = renderNormativeModelCard({ complete: true, clinical_caveat: 'Not validated for paediatric use.' });
    assert.ok(html.includes('Clinical Caveat'), 'expected clinical caveat label');
    assert.ok(html.includes('Not validated for paediatric use.'), 'expected caveat text');
  });

  it('renders Yes/No for boolean fields (eyes_condition_compatible, montage_compatible)', () => {
    const html = renderNormativeModelCard({
      complete: true,
      eyes_condition_compatible: true,
      montage_compatible: false,
    });
    assert.ok(html.includes('Yes'), 'expected "Yes" for true boolean field');
    assert.ok(html.includes('No'), 'expected "No" for false boolean field');
  });

  it('renders limitations list when provided', () => {
    const html = renderNormativeModelCard({
      complete: true,
      limitations: ['Limited to adults 18+', 'EO recordings only'],
    });
    assert.ok(html.includes('Limitations'), 'expected "Limitations" heading');
    assert.ok(html.includes('Limited to adults 18+'), 'expected first limitation');
    assert.ok(html.includes('EO recordings only'), 'expected second limitation');
  });

  it('includes decision-support disclaimer', () => {
    const html = renderNormativeModelCard({ complete: true, status: 'configured' });
    assert.ok(
      html.includes('decision-support information'),
      'expected decision-support disclaimer',
    );
    assert.ok(
      html.includes('consult your clinician'),
      'expected "consult your clinician" in disclaimer',
    );
  });

  it('escapes XSS in normative_db_name and clinical_caveat', () => {
    const html = renderNormativeModelCard({
      complete: true,
      normative_db_name: '<script>alert(1)</script>',
      clinical_caveat: '<img src=x onerror=alert(2)>',
    });
    assert.ok(!html.includes('<script>'), 'normative_db_name must be HTML-escaped');
    assert.ok(!html.includes('<img src'), 'clinical_caveat must be HTML-escaped');
    assert.ok(html.includes('&lt;script&gt;'), 'expected escaped entity');
  });
});
