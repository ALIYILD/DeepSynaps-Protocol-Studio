// Tests for qeeg-protocol-fit.js — AI Protocol Fit Panel
// Pins: null guard, evidence-grade colour mapping, off-label pill, contraindications,
//       required checks, rationale rendering, decision-support disclaimer, XSS escaping.

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { renderProtocolFit } from './qeeg-protocol-fit.js';

describe('renderProtocolFit', () => {
  it('returns empty string when fit is null', () => {
    assert.strictEqual(renderProtocolFit(null), '');
  });

  it('returns empty string when fit is undefined', () => {
    assert.strictEqual(renderProtocolFit(undefined), '');
  });

  it('renders section header "Protocol Fit"', () => {
    const html = renderProtocolFit({ evidence_grade: 'A' });
    assert.ok(html.includes('Protocol Fit'), 'expected section header');
  });

  it('maps evidence grade A to green colour #22c55e', () => {
    const html = renderProtocolFit({ evidence_grade: 'A' });
    assert.ok(html.includes('Evidence: A'), 'expected evidence grade label');
    assert.ok(html.includes('#22c55e'), 'grade A must use green colour');
  });

  it('maps evidence grade B to blue colour #3b82f6', () => {
    const html = renderProtocolFit({ evidence_grade: 'B' });
    assert.ok(html.includes('Evidence: B'), 'expected evidence grade label');
    assert.ok(html.includes('#3b82f6'), 'grade B must use blue colour');
  });

  it('maps evidence grade C to amber colour #f59e0b', () => {
    const html = renderProtocolFit({ evidence_grade: 'C' });
    assert.ok(html.includes('Evidence: C'), 'expected evidence grade label');
    assert.ok(html.includes('#f59e0b'), 'grade C must use amber colour');
  });

  it('maps unknown evidence grade to grey colour #6b7280', () => {
    const html = renderProtocolFit({ evidence_grade: 'D' });
    assert.ok(html.includes('#6b7280'), 'unknown grade must use grey colour');
  });

  it('renders "Off-Label" pill (red) when off_label_flag is true', () => {
    const html = renderProtocolFit({ evidence_grade: 'B', off_label_flag: true });
    assert.ok(html.includes('Off-Label'), 'expected Off-Label pill');
    assert.ok(html.includes('#ef4444'), 'Off-Label pill must use red colour');
  });

  it('does not render Off-Label pill when off_label_flag is false', () => {
    const html = renderProtocolFit({ evidence_grade: 'A', off_label_flag: false });
    assert.ok(!html.includes('Off-Label'), 'no Off-Label pill when flag is false');
  });

  it('renders "Pending Review" pill (amber) when clinician_reviewed is false', () => {
    const html = renderProtocolFit({ evidence_grade: 'A', clinician_reviewed: false });
    assert.ok(html.includes('Pending Review'), 'expected "Pending Review" pill');
  });

  it('renders "Reviewed" pill (green) when clinician_reviewed is true', () => {
    const html = renderProtocolFit({ evidence_grade: 'A', clinician_reviewed: true });
    assert.ok(html.includes('Reviewed'), 'expected "Reviewed" pill');
  });

  it('renders candidate protocol block when candidate_protocol.name is provided', () => {
    const html = renderProtocolFit({
      evidence_grade: 'A',
      candidate_protocol: { name: 'Alpha Up Z4', description: 'Increase posterior alpha' },
    });
    assert.ok(html.includes('Alpha Up Z4'), 'expected candidate protocol name');
    assert.ok(html.includes('Increase posterior alpha'), 'expected candidate protocol description');
  });

  it('renders contraindications list when provided', () => {
    const html = renderProtocolFit({
      evidence_grade: 'B',
      contraindications: ['Active seizure disorder', 'Cardiac pacemaker'],
    });
    assert.ok(html.includes('Contraindications'), 'expected "Contraindications" label');
    assert.ok(html.includes('Active seizure disorder'), 'expected first contraindication');
    assert.ok(html.includes('Cardiac pacemaker'), 'expected second contraindication');
  });

  it('renders required clinician checks heading and items', () => {
    const html = renderProtocolFit({
      evidence_grade: 'A',
      required_checks: ['Verify baseline impedances', 'Confirm consent form signed'],
    });
    assert.ok(html.includes('Required Clinician Checks'), 'expected "Required Clinician Checks" heading');
    assert.ok(html.includes('Verify baseline impedances'), 'expected check item text');
  });

  it('renders match_rationale and caution_rationale when provided', () => {
    const html = renderProtocolFit({
      evidence_grade: 'A',
      match_rationale: 'High frontal theta burden matches protocol target.',
      caution_rationale: 'Recent medication change may confound baseline.',
    });
    assert.ok(html.includes('Match rationale:'), 'expected "Match rationale:" label');
    assert.ok(html.includes('High frontal theta burden'), 'expected match rationale text');
    assert.ok(html.includes('Caution:'), 'expected "Caution:" label');
    assert.ok(html.includes('Recent medication change'), 'expected caution text');
  });

  it('includes the decision-support disclaimer with clinician review requirement', () => {
    const html = renderProtocolFit({ evidence_grade: 'A' });
    assert.ok(
      html.includes('decision-support information'),
      'expected decision-support disclaimer',
    );
    assert.ok(
      html.includes('clinician review before use'),
      'expected "clinician review before use" in disclaimer',
    );
  });

  it('escapes XSS in pattern_summary and candidate protocol name', () => {
    const html = renderProtocolFit({
      evidence_grade: 'A',
      pattern_summary: '<script>xss()</script>',
      candidate_protocol: { name: '<img onerror=alert(1)>', description: '' },
    });
    assert.ok(!html.includes('<script>'), 'pattern_summary must be HTML-escaped');
    assert.ok(!html.includes('<img onerror'), 'candidate name must be HTML-escaped');
    assert.ok(html.includes('&lt;script&gt;'), 'expected escaped entity');
  });
});
