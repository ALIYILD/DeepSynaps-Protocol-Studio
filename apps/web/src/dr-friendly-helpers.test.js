// Unit tests for the doctor-friendly UX primitives in helpers.js
// (clinicalBand, drHero). Pure render helpers — no DOM, no API.
// Run via: node --test src/dr-friendly-helpers.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { clinicalBand, drHero, trajectoryChip } from './helpers.js';
import { loadPatientFlagSummary } from './dr-friendly-flags.js';

// ── clinicalBand ──────────────────────────────────────────────────────────────

test('clinicalBand returns em-dash for null / undefined / NaN', () => {
  assert.match(clinicalBand(null), /—/);
  assert.match(clinicalBand(undefined), /—/);
  assert.match(clinicalBand(NaN), /—/);
});

test('clinicalBand percentile auto-classifies into Low / Moderate / Elevated / High', () => {
  assert.match(clinicalBand(20, { kind: 'percentile' }), /Low/);
  assert.match(clinicalBand(50, { kind: 'percentile' }), /Moderate/);
  assert.match(clinicalBand(80, { kind: 'percentile' }), /Elevated/);
  assert.match(clinicalBand(95, { kind: 'percentile' }), /High/);
  assert.match(clinicalBand(99, { kind: 'percentile' }), /High/);
});

test('clinicalBand percentile renders with "p" suffix for monospace chip', () => {
  const html = clinicalBand(82, { kind: 'percentile' });
  assert.match(html, /82\.00p/);
});

test('clinicalBand raw score does NOT auto-classify (clinical-safety guard)', () => {
  const html = clinicalBand(0.74, { kind: 'score', scaleLabel: '0–1' });
  assert.doesNotMatch(html, /Elevated|High|Moderate|Low/);
  assert.match(html, /0\.74/);
  assert.match(html, /0–1/);
});

test('clinicalBand raw score WITH explicit band shows colored severity pill', () => {
  const html = clinicalBand(0.74, { kind: 'score', band: 'elevated', scaleLabel: '0–1' });
  assert.match(html, /Elevated/);
  assert.match(html, /0\.74/);
});

test('clinicalBand confidence appears in tooltip when supplied', () => {
  const html = clinicalBand(82, { kind: 'percentile', confidence: 0.78 });
  assert.match(html, /model confidence 0\.78/);
});

test('clinicalBand passes through helpText into the tooltip', () => {
  const html = clinicalBand(82, { kind: 'percentile', helpText: 'PD voice screening' });
  assert.match(html, /PD voice screening/);
});

test('clinicalBand has cursor:help so tooltip discovery is obvious', () => {
  const html = clinicalBand(82, { kind: 'percentile' });
  assert.match(html, /cursor:help/);
});

// ── drHero ────────────────────────────────────────────────────────────────────

test('drHero with no flags shows the calm "no active flags" state, not empty', () => {
  const html = drHero({ question: 'Q?', howToRead: 'R', flagCount: 0 });
  assert.match(html, /No active flags for this patient/);
  assert.doesNotMatch(html, /flag.{1,5}for review/);
});

test('drHero with flagCount > 0 shows the alert chip with count and summary', () => {
  const html = drHero({ question: 'Q?', flagCount: 2, flagSummary: 'PD elevated' });
  assert.match(html, /2 flags for review/);
  assert.match(html, /PD elevated/);
});

test('drHero pluralizes the flag count correctly', () => {
  assert.match(drHero({ flagCount: 1 }), /1 flag for review/);
  assert.match(drHero({ flagCount: 5 }), /5 flags for review/);
});

test('drHero clinical question renders as h2 (the page lede)', () => {
  const html = drHero({ question: 'Has voice changed?' });
  assert.match(html, /<h2 [^>]*>Has voice changed\?<\/h2>/);
});

test('drHero howToRead block renders as a paragraph below the question', () => {
  const html = drHero({ question: 'Q', howToRead: 'Severity bands explained.' });
  assert.match(html, /Severity bands explained\./);
});

test('drHero is wrapped in a labelled section for accessibility', () => {
  const html = drHero({ question: 'Q' });
  assert.match(html, /<section [^>]*aria-labelledby="dr-hero-q"/);
});

test('drHero alert chip has role=status so screen readers announce it', () => {
  const flagsHtml = drHero({ question: 'Q', flagCount: 1 });
  const calmHtml = drHero({ question: 'Q', flagCount: 0 });
  assert.match(flagsHtml, /role="status"/);
  assert.match(calmHtml, /role="status"/);
});

// ── trajectoryChip ────────────────────────────────────────────────────────────

test('trajectoryChip returns "" when prior is null/missing — graceful no-op', () => {
  assert.equal(trajectoryChip(0.5, null), '');
  assert.equal(trajectoryChip(0.5, undefined), '');
  assert.equal(trajectoryChip(null, 0.5), '');
});

test('trajectoryChip returns "" when prior is 0 — undefined % change', () => {
  assert.equal(trajectoryChip(0.5, 0), '');
});

test('trajectoryChip returns "" when current/prior are NaN', () => {
  assert.equal(trajectoryChip(NaN, 0.5), '');
  assert.equal(trajectoryChip(0.5, NaN), '');
});

test('trajectoryChip lower-better: drop is improvement (green ↓)', () => {
  const html = trajectoryChip(0.5, 0.8, { direction: 'lower-better' });
  assert.match(html, /↓/);
  assert.match(html, /38%/);
  assert.match(html, /var\(--green\)/);
});

test('trajectoryChip lower-better: rise ≥10% is significant worsening (red ↑)', () => {
  const html = trajectoryChip(1.0, 0.8, { direction: 'lower-better' });
  assert.match(html, /↑/);
  assert.match(html, /25%/);
  assert.match(html, /var\(--red\)/);
});

test('trajectoryChip lower-better: rise <10% is mild worsening (amber ↑)', () => {
  const html = trajectoryChip(0.85, 0.80, { direction: 'lower-better' });
  assert.match(html, /↑/);
  assert.match(html, /var\(--amber\)/);
});

test('trajectoryChip higher-better: rise is improvement (green ↑)', () => {
  const html = trajectoryChip(0.9, 0.7, { direction: 'higher-better' });
  assert.match(html, /↑/);
  assert.match(html, /var\(--green\)/);
});

test('trajectoryChip higher-better: drop ≥10% is significant worsening (red ↓)', () => {
  const html = trajectoryChip(0.5, 0.7, { direction: 'higher-better' });
  assert.match(html, /↓/);
  assert.match(html, /var\(--red\)/);
});

test('trajectoryChip near-zero change shows ~stable, not green/amber/red', () => {
  const html = trajectoryChip(0.500, 0.502, { direction: 'lower-better' });
  assert.match(html, /~stable/);
});

test('trajectoryChip uses custom priorLabel when supplied', () => {
  const html = trajectoryChip(0.5, 0.8, { priorLabel: 'vs Apr 24' });
  assert.match(html, /vs Apr 24/);
});

test('trajectoryChip default priorLabel is "vs prior"', () => {
  const html = trajectoryChip(0.5, 0.8);
  assert.match(html, /vs prior/);
});

// ── loadPatientFlagSummary ────────────────────────────────────────────────────

test('loadPatientFlagSummary returns calm shape for empty patientId', async () => {
  const r = await loadPatientFlagSummary(null);
  assert.deepEqual(r, { flagCount: 0, flagSummary: '', loaded: false });
});

test('loadPatientFlagSummary counts elevated/high/critical categories', async () => {
  const fakeApi = {
    getPatientRiskProfile: async () => ({
      categories: [
        { category: 'safety', level: 'High' },
        { category: 'adherence', level: 'elevated' },
        { category: 'wellbeing', level: 'low' },
        { category: 'engagement', level: 'CRITICAL' },
        { category: 'caregiver', level: 'moderate' },
      ],
    }),
  };
  const r = await loadPatientFlagSummary('p-1', fakeApi);
  assert.equal(r.flagCount, 3);
  assert.equal(r.loaded, true);
  assert.match(r.flagSummary, /safety high/);
  assert.match(r.flagSummary, /adherence elevated/);
  assert.match(r.flagSummary, /engagement critical/);
});

test('loadPatientFlagSummary truncates flagSummary at 3 categories', async () => {
  const fakeApi = {
    getPatientRiskProfile: async () => ({
      categories: [
        { category: 'a', level: 'high' },
        { category: 'b', level: 'high' },
        { category: 'c', level: 'high' },
        { category: 'd', level: 'high' },
      ],
    }),
  };
  const r = await loadPatientFlagSummary('p-1', fakeApi);
  assert.equal(r.flagCount, 4);
  // 3 separators-of-2 in summary: "a high · b high · c high"
  assert.equal(r.flagSummary.split(' · ').length, 3);
  assert.doesNotMatch(r.flagSummary, /\bd\b/);
});

test('loadPatientFlagSummary returns calm shape on api failure (loaded: false)', async () => {
  const fakeApi = {
    getPatientRiskProfile: async () => { throw new Error('500'); },
  };
  const r = await loadPatientFlagSummary('p-1', fakeApi);
  assert.deepEqual(r, { flagCount: 0, flagSummary: '', loaded: false });
});

test('loadPatientFlagSummary handles missing categories array gracefully', async () => {
  const fakeApi = {
    getPatientRiskProfile: async () => ({}),
  };
  const r = await loadPatientFlagSummary('p-1', fakeApi);
  assert.equal(r.flagCount, 0);
  assert.equal(r.loaded, true);
});

test('loadPatientFlagSummary normalises underscored category labels', async () => {
  const fakeApi = {
    getPatientRiskProfile: async () => ({
      categories: [{ category: 'clinical_deterioration', level: 'high' }],
    }),
  };
  const r = await loadPatientFlagSummary('p-1', fakeApi);
  assert.match(r.flagSummary, /clinical deterioration high/);
});
