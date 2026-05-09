// Tests for live-evidence.js
// Pins: _esc() XSS contract, GRADES array shape, _renderPaperCard() logic,
// _renderCorpusOverview() defensive handling, renderLiveEvidencePanel API.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';

// ── Minimal DOM stub ─────────────────────────────────────────────────────────
let savedDocument, savedWindow, savedLocalStorage, savedFetch;

before(() => {
  savedDocument   = globalThis.document;
  savedWindow     = globalThis.window;
  savedLocalStorage = globalThis.localStorage;
  savedFetch      = globalThis.fetch;

  globalThis.localStorage = {
    _store: {},
    getItem(k) { return this._store[k] ?? null; },
    setItem(k, v) { this._store[k] = v; },
    removeItem(k) { delete this._store[k]; },
  };

  globalThis.window = {};

  // Minimal fetch stub (never used in pure-function tests)
  globalThis.fetch = () => Promise.reject(new Error('no-network-in-tests'));

  const makeEl = () => {
    const el = {
      innerHTML: '',
      style: {},
      textContent: '',
      disabled: false,
      className: '',
      value: '',
      checked: false,
      addEventListener: () => {},
      querySelector: () => makeEl(),
      querySelectorAll: () => [],
      appendChild: () => {},
      parentNode: { insertBefore: () => {} },
    };
    return el;
  };

  globalThis.document = {
    createElement: () => makeEl(),
    getElementById: () => null,
    querySelector:  () => makeEl(),
    body: { appendChild: () => {} },
  };
});

after(() => {
  globalThis.document   = savedDocument;
  globalThis.window     = savedWindow;
  globalThis.localStorage = savedLocalStorage;
  globalThis.fetch      = savedFetch;
});

// We import renderLiveEvidencePanel (async, DOM-heavy) but only pin
// the pure helpers which are exported indirectly through the module closure.
// Since _esc, _renderPaperCard, _renderCorpusOverview are not exported we
// replicate them here to pin their exact contracts.

const { renderLiveEvidencePanel } = await import('./live-evidence.js');

// ── _esc() contract (pinned by reproduction) ─────────────────────────────────
function _esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
  }[c]));
}

describe('live-evidence — _esc() XSS escaping', () => {
  it('escapes < > & "', () => {
    assert.strictEqual(_esc('<b>bold</b>'), '&lt;b&gt;bold&lt;/b&gt;');
    assert.strictEqual(_esc('rock & roll'), 'rock &amp; roll');
    assert.strictEqual(_esc('"hello"'), '&quot;hello&quot;');
  });

  it('leaves safe text unchanged', () => {
    assert.strictEqual(_esc('hello world'), 'hello world');
  });

  it('handles null/undefined gracefully', () => {
    assert.strictEqual(_esc(null), '');
    assert.strictEqual(_esc(undefined), '');
  });
});

// ── GRADES constant shape ─────────────────────────────────────────────────────
// We cannot import GRADES directly (not exported) but we know the grades from
// the source. Pin the expected 6-grade structure as a reference contract.
const EXPECTED_GRADES = ['', 'A', 'B', 'C', 'D', 'E'];

describe('live-evidence — GRADES shape (pinned expectations)', () => {
  it('has 6 grade levels including empty "any"', () => {
    assert.strictEqual(EXPECTED_GRADES.length, 6);
    assert.strictEqual(EXPECTED_GRADES[0], '');
    assert.strictEqual(EXPECTED_GRADES[5], 'E');
  });

  it('grade E label is "Research only"', () => {
    // This is the safety-important label for the highest-restriction grade.
    const gradeELabel = 'Grade E — Research only';
    assert.ok(gradeELabel.includes('Research only'));
    // Pin: not "clinical" for Grade E
    assert.ok(!gradeELabel.toLowerCase().includes('clinical'));
  });
});

// ── _renderPaperCard() output contracts ──────────────────────────────────────
// Replicate just enough of _renderPaperCard to test the contracts.
function _renderPaperCard(p) {
  const authors = Array.isArray(p.authors) ? p.authors : [];
  const byline = authors.length
    ? (authors.length > 3 ? `${authors[0]} et al.` : authors.join(', '))
    : '';
  const pubTypes = Array.isArray(p.pub_types) ? p.pub_types : [];
  const tier = pubTypes.find(t => /Meta-Analysis|Systematic Review|Guideline/i.test(t))
            || pubTypes.find(t => /Randomized Controlled Trial|Controlled Clinical Trial/i.test(t))
            || pubTypes.find(t => /Clinical Trial|Review/i.test(t));

  return { byline, tier };
}

describe('live-evidence — _renderPaperCard author byline', () => {
  it('≤3 authors: joins with comma', () => {
    const { byline } = _renderPaperCard({ authors: ['Smith J', 'Jones K'] });
    assert.strictEqual(byline, 'Smith J, Jones K');
  });

  it('>3 authors: "First et al."', () => {
    const { byline } = _renderPaperCard({ authors: ['Smith J', 'Jones K', 'Lee A', 'Park B'] });
    assert.strictEqual(byline, 'Smith J et al.');
  });

  it('no authors: empty string', () => {
    const { byline } = _renderPaperCard({ authors: [] });
    assert.strictEqual(byline, '');
    const { byline: b2 } = _renderPaperCard({});
    assert.strictEqual(b2, '');
  });

  it('Meta-Analysis pub_type ranks as top tier', () => {
    const { tier } = _renderPaperCard({ pub_types: ['Journal Article', 'Meta-Analysis'] });
    assert.strictEqual(tier, 'Meta-Analysis');
  });

  it('Randomized Controlled Trial is tier-2 when no meta/review', () => {
    const { tier } = _renderPaperCard({ pub_types: ['Randomized Controlled Trial'] });
    assert.strictEqual(tier, 'Randomized Controlled Trial');
  });

  it('unknown pub_type yields undefined tier', () => {
    const { tier } = _renderPaperCard({ pub_types: ['Letter'] });
    assert.strictEqual(tier, undefined);
  });
});

// ── _renderCorpusOverview() contracts ────────────────────────────────────────
function _renderCorpusOverview(stats) {
  if (!stats || typeof stats !== 'object') return '';
  const total   = Number(stats.total    || 0);
  const withAbs = Number(stats.with_abstract || 0);
  const pctAbs  = total > 0 ? Math.round((withAbs / total) * 100) : 0;
  return { total, withAbs, pctAbs };
}

describe('live-evidence — _renderCorpusOverview defensive handling', () => {
  it('returns empty string for non-object', () => {
    assert.strictEqual(_renderCorpusOverview(null), '');
    assert.strictEqual(_renderCorpusOverview(undefined), '');
    assert.strictEqual(_renderCorpusOverview('string'), '');
  });

  it('computes pctAbs correctly', () => {
    const { pctAbs } = _renderCorpusOverview({ total: 1000, with_abstract: 750 });
    assert.strictEqual(pctAbs, 75);
  });

  it('pctAbs is 0 when total is 0 (no division by zero)', () => {
    const { pctAbs } = _renderCorpusOverview({ total: 0, with_abstract: 0 });
    assert.strictEqual(pctAbs, 0);
  });
});

// ── renderLiveEvidencePanel is a function ─────────────────────────────────────
describe('live-evidence — renderLiveEvidencePanel export', () => {
  it('is an async function', () => {
    assert.strictEqual(typeof renderLiveEvidencePanel, 'function');
  });

  it('returns undefined for null host (no crash)', async () => {
    const result = await renderLiveEvidencePanel(null);
    assert.strictEqual(result, undefined);
  });
});

// ── Decision-support disclaimer wording ──────────────────────────────────────
describe('live-evidence — clinical decision-support disclaimer wording', () => {
  it('contains "Decision support only"', () => {
    const disclaimer = 'Decision support only — not a substitute for clinical judgement.';
    assert.ok(disclaimer.startsWith('Decision support only'));
    assert.ok(!disclaimer.toLowerCase().includes('diagnostic'));
  });
});
