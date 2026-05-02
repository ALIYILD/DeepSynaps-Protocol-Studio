// ─────────────────────────────────────────────────────────────────────────────
// raw-ai-hooks.test.js — Phase 5
//
// Verifies the AI co-pilot overlay hooks:
//   * Quality scorecard fills with subscore values when getQEEGAIQualityScore
//     resolves.
//   * Filter "AI Suggest" prefills LFF/HFF after getQEEGAIRecommendFilters.
//   * Decomposition Studio hover-tooltip wiring populates per-cell from
//     classifier output.
// ─────────────────────────────────────────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  fillQualityScorecardFromAI,
  prefillFiltersFromAI,
  applyComponentClassificationsTooltips,
} from './raw-ai-hooks.js';

// ── Tiny DOM polyfill — just enough for the three hooks ─────────────────────

class FakeEl {
  constructor(tag = 'div', id = '') {
    this.tagName = String(tag).toUpperCase();
    this.id = id;
    this.children = [];
    this._text = '';
    this.value = '';
    this.dataset = {};
    this.attributes = {};
  }
  set textContent(v) { this._text = String(v); }
  get textContent() { return this._text; }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attributes, k) ? this.attributes[k] : null; }
  appendChild(c) { c.parentElement = this; this.children.push(c); }
  querySelector(sel) {
    // Support `[data-metric="<key>"] span` form used by quality scorecard.
    const m = /^\[data-metric="([^"]+)"\]\s+span$/.exec(sel);
    if (m) {
      const key = m[1];
      const target = this.children.find((c) => c.dataset && c.dataset.metric === key);
      if (target) {
        if (!target._span) {
          target._span = new FakeEl('span');
          target.appendChild(target._span);
        }
        return target._span;
      }
      return null;
    }
    if (sel === '.eeg-ds__cell') return this.children.find((c) => c._isCell) || null;
    return null;
  }
  querySelectorAll(sel) {
    if (sel === '.eeg-ds__cell') return this.children.filter((c) => c._isCell);
    return [];
  }
}

function makeFakeDocument() {
  const reg = new Map();
  return {
    _reg: reg,
    register(el) { reg.set(el.id, el); return el; },
    getElementById(id) { return reg.get(id) || null; },
  };
}


// ── Test 1 — Quality scorecard fills with subscore values ───────────────────

test('fillQualityScorecardFromAI populates score, subscores, and narrative', async () => {
  const doc = makeFakeDocument();
  doc.register(new FakeEl('div', 'quality-score-big'));
  const card = new FakeEl('section', 'quality-scorecard');
  for (const k of ['impedance', 'line_noise', 'blink_density', 'motion', 'channel_agreement']) {
    const row = new FakeEl('div');
    row.dataset.metric = k;
    card.appendChild(row);
  }
  doc.register(card);
  doc.register(new FakeEl('p', 'quality-narrative'));

  const stub = {
    getQEEGAIQualityScore: async () => ({
      result: {
        score: 84.2,
        subscores: {
          impedance: 95.0,
          line_noise: 70.0,
          blink_density: 75.0,
          motion: 88.0,
          channel_agreement: 93.0,
        },
      },
      reasoning: 'High-quality recording with mild line noise.',
      features: { n_bad_channels: 1, n_bad_segments: 0 },
    }),
  };
  const state = { ai: {} };

  const resp = await fillQualityScorecardFromAI(state, 'a-1', stub, doc);
  assert.ok(resp);
  assert.equal(state.ai.qualityScore, 84.2);
  assert.equal(state.ai.qualitySubscores.impedance, 95.0);
  // Big score updated.
  assert.equal(doc.getElementById('quality-score-big').textContent, '84.2');
  // Each subscore row updated.
  const card2 = doc.getElementById('quality-scorecard');
  assert.equal(card2.querySelector('[data-metric="impedance"] span').textContent, '95');
  assert.equal(card2.querySelector('[data-metric="line_noise"] span').textContent, '70');
  // Narrative replaced.
  assert.equal(
    doc.getElementById('quality-narrative').textContent,
    'High-quality recording with mild line noise.',
  );
});

test('fillQualityScorecardFromAI is graceful when API call rejects', async () => {
  const stub = {
    getQEEGAIQualityScore: async () => { throw new Error('network down'); },
  };
  const state = { ai: { qualityNarrative: 'pre-existing' } };
  const resp = await fillQualityScorecardFromAI(state, 'a-1', stub, makeFakeDocument());
  // Returns null and leaves state alone.
  assert.equal(resp, null);
  assert.equal(state.ai.qualityNarrative, 'pre-existing');
});


// ── Test 2 — Filter "AI Suggest" prefills LFF/HFF ───────────────────────────

test('prefillFiltersFromAI prefills LFF/HFF/notch select values + state', async () => {
  const doc = makeFakeDocument();
  const lff = doc.register(new FakeEl('select', 'eeg-lff-sel'));
  const hff = doc.register(new FakeEl('select', 'eeg-hff-sel'));
  const notch = doc.register(new FakeEl('select', 'eeg-notch-sel'));

  const stub = {
    getQEEGAIRecommendFilters: async () => ({
      result: {
        lff: 1.0,
        hff: 45.0,
        notch: 60,
        rationale: 'Long resting recording — 1 Hz LFF; 60 Hz mains detected.',
      },
      reasoning: 'Long resting recording — 1 Hz LFF; 60 Hz mains detected.',
      features: { sfreq: 256, duration_sec: 300 },
    }),
  };
  const state = {
    ai: {},
    processing: { filterParams: { lff: 0.3, hff: 30.0, notch: 50 }, hasUnsavedChanges: false },
    filterParams: { lff: 0.3, hff: 30.0, notch: 50 },
    hasUnsavedChanges: false,
  };

  const resp = await prefillFiltersFromAI(state, 'a-1', stub, doc);
  assert.ok(resp);
  // State populated.
  assert.equal(state.ai.recommendedFilters.lff, 1.0);
  assert.equal(state.ai.recommendedFilters.hff, 45.0);
  assert.equal(state.ai.recommendedFilters.notch, 60);
  assert.equal(state.processing.filterParams.lff, 1.0);
  assert.equal(state.processing.filterParams.hff, 45.0);
  assert.equal(state.processing.filterParams.notch, 60);
  assert.equal(state.processing.hasUnsavedChanges, true);
  // DOM select values updated.
  assert.equal(lff.value, '1');
  assert.equal(hff.value, '45');
  assert.equal(notch.value, '60');
  // Tooltip set on each select with the rationale.
  for (const el of [lff, hff, notch]) {
    assert.equal(
      el.getAttribute('title'),
      'Long resting recording — 1 Hz LFF; 60 Hz mains detected.',
    );
  }
});


// ── Test 3 — Decomposition Studio hover-tooltip wiring ──────────────────────

test('applyComponentClassificationsTooltips populates each IC cell with title + dataset', () => {
  // Build a fake studio container with three IC cells (idx 0..2).
  const container = new FakeEl('div');
  for (let i = 0; i < 3; i += 1) {
    const cell = new FakeEl('div');
    cell._isCell = true;
    cell.dataset.idx = String(i);
    container.appendChild(cell);
  }

  const resp = {
    result: [
      { idx: 0, label: 'eye',   confidence: 0.92, explanation: 'Saccade / blink artifact.' },
      { idx: 1, label: 'brain', confidence: 0.95, explanation: 'Neural activity, retain.' },
      { idx: 2, label: 'muscle', confidence: 0.81, explanation: 'EMG contamination, often temporal.' },
    ],
    reasoning: 'Three-component decomposition.',
    features: { n_components: 3 },
  };

  const n = applyComponentClassificationsTooltips(resp, container);
  assert.equal(n, 3);
  const cells = container.querySelectorAll('.eeg-ds__cell');
  assert.equal(cells[0].getAttribute('title'), 'IC0: eye 92% — Saccade / blink artifact.');
  assert.equal(cells[0].dataset.aiLabel, 'eye');
  assert.equal(cells[0].dataset.aiConfidence, '0.92');
  assert.equal(cells[1].getAttribute('title'), 'IC1: brain 95% — Neural activity, retain.');
  assert.equal(cells[2].dataset.aiLabel, 'muscle');
});

test('applyComponentClassificationsTooltips returns 0 with empty / malformed input', () => {
  assert.equal(applyComponentClassificationsTooltips(null, null), 0);
  assert.equal(applyComponentClassificationsTooltips({}, null), 0);
  // Missing matching cell idx
  const container = new FakeEl('div');
  const cell = new FakeEl('div');
  cell._isCell = true;
  cell.dataset.idx = '99';
  container.appendChild(cell);
  const n = applyComponentClassificationsTooltips(
    { result: [{ idx: 0, label: 'eye', confidence: 0.5, explanation: '' }] },
    container,
  );
  assert.equal(n, 0);
});
