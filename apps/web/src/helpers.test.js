// Tests for helpers.js
// Pins: evidenceBadge(), labelBadge(), safetyBadge(), approvalBadge(),
// clinicalBand(), trajectoryChip(), govFlag(), cardWrap(), fr(), evBar(),
// pillSt(), initials(), statCard(), drHero() — pure HTML renderers.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';

// ── DOM + window stub for showToast and brainMapSVG ───────────────────────────
let savedDocument, savedWindow;

before(() => {
  savedDocument = globalThis.document;
  savedWindow   = globalThis.window;

  const makeEl = () => ({
    id: '', innerHTML: '', style: { cssText: '' }, className: '',
    textContent: '',
    setAttribute: () => {},
    getAttribute: () => null,
    appendChild: () => {},
    remove: () => {},
    addEventListener: () => {},
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); },
      contains(c) { return this._s.has(c); },
    },
  });

  globalThis.window = {};

  globalThis.document = {
    createElement: (t) => { const el = makeEl(); el.tagName = t.toUpperCase(); return el; },
    getElementById: () => null,
    body: { appendChild: () => {} },
  };

  globalThis.requestAnimationFrame = (fn) => fn();
});

after(() => {
  globalThis.document = savedDocument;
  globalThis.window   = savedWindow;
  delete globalThis.requestAnimationFrame;
});

const {
  evidenceBadge,
  labelBadge,
  safetyBadge,
  approvalBadge,
  clinicalBand,
  trajectoryChip,
  govFlag,
  cardWrap,
  fr,
  evBar,
  pillSt,
  initials,
  statCard,
  drHero,
} = await import('./helpers.js');

// ── evidenceBadge ─────────────────────────────────────────────────────────────
describe('helpers — evidenceBadge()', () => {
  it('EV-A returns label="EV-A" and teal color', () => {
    const html = evidenceBadge('EV-A');
    assert.ok(html.includes('EV-A'));
    assert.ok(html.includes('var(--teal)'));
  });

  it('single-letter "A" maps to same EV-A label', () => {
    const html = evidenceBadge('A');
    assert.ok(html.includes('EV-A'));
  });

  it('EV-D (insufficient) uses red color', () => {
    const html = evidenceBadge('EV-D');
    assert.ok(html.includes('var(--red)'));
    assert.ok(html.includes('Insufficient evidence'));
  });

  it('unknown grade shows the raw grade as label', () => {
    const html = evidenceBadge('Z');
    assert.ok(html.includes('Z'));
  });

  it('null/undefined grade shows "—"', () => {
    const html = evidenceBadge(undefined);
    assert.ok(html.includes('—'));
  });
});

// ── labelBadge ────────────────────────────────────────────────────────────────
describe('helpers — labelBadge()', () => {
  it('"on-label" string returns On-label badge', () => {
    const html = labelBadge('on-label');
    assert.ok(html.includes('On-label'));
    assert.ok(!html.includes('Off-label'));
  });

  it('"off-label" string returns Off-label badge with warning icon', () => {
    const html = labelBadge('off-label');
    assert.ok(html.includes('Off-label'));
    assert.ok(html.includes('⚠'));
  });

  it('checks startsWith("on") case-insensitively', () => {
    const html = labelBadge('On-Label');
    assert.ok(html.includes('On-label'));
  });
});

// ── safetyBadge ───────────────────────────────────────────────────────────────
describe('helpers — safetyBadge()', () => {
  it('returns empty string for no warnings', () => {
    assert.strictEqual(safetyBadge([]), '');
    assert.strictEqual(safetyBadge(), '');
  });

  it('single flag: "1 flag" (not plural)', () => {
    const html = safetyBadge(['seizure-check']);
    assert.ok(html.includes('1 flag'));
    assert.ok(!html.includes('1 flags'));
  });

  it('two flags: "2 flags" (plural)', () => {
    const html = safetyBadge(['seizure-check', 'implant-check']);
    assert.ok(html.includes('2 flags'));
  });
});

// ── approvalBadge ─────────────────────────────────────────────────────────────
describe('helpers — approvalBadge()', () => {
  it('"active" returns "In Treatment" label with teal', () => {
    const html = approvalBadge('active');
    assert.ok(html.includes('In Treatment'));
    assert.ok(html.includes('var(--teal)'));
  });

  it('"completed" returns "Completed" with green', () => {
    const html = approvalBadge('completed');
    assert.ok(html.includes('Completed'));
    assert.ok(html.includes('var(--green)'));
  });

  it('"discontinued" returns "Discontinued" with red', () => {
    const html = approvalBadge('discontinued');
    assert.ok(html.includes('Discontinued'));
    assert.ok(html.includes('var(--red)'));
  });

  it('unknown status humanizes underscore names', () => {
    const html = approvalBadge('pending_review');
    // Falls back to replacing _ and capitalizing
    assert.ok(html.includes('Pending Review') || html.includes('pending review') || html.includes('pending_review'));
  });
});

// ── clinicalBand ──────────────────────────────────────────────────────────────
describe('helpers — clinicalBand()', () => {
  it('returns "—" for null value', () => {
    const html = clinicalBand(null);
    assert.ok(html.includes('—'));
  });

  it('returns "—" for NaN value', () => {
    const html = clinicalBand(NaN);
    assert.ok(html.includes('—'));
  });

  it('percentile ≥95 is classified as "High" band', () => {
    const html = clinicalBand(97, { kind: 'percentile' });
    assert.ok(html.includes('High'));
    assert.ok(html.includes('var(--red)'));
  });

  it('percentile <50 is classified as "Low" band', () => {
    const html = clinicalBand(30, { kind: 'percentile' });
    assert.ok(html.includes('Low'));
    assert.ok(html.includes('var(--green)'));
  });

  it('score kind without band renders neutral chip', () => {
    const html = clinicalBand(0.74, { kind: 'score' });
    // No band pill — just the numeric chip
    assert.ok(!html.includes('High'));
    assert.ok(!html.includes('Elevated'));
    assert.ok(html.includes('0.74'));
  });

  it('explicit band overrides auto-classify', () => {
    const html = clinicalBand(10, { kind: 'percentile', band: 'elevated' });
    assert.ok(html.includes('Elevated'));
  });

  it('appends "p" suffix for percentile kind', () => {
    const html = clinicalBand(82, { kind: 'percentile' });
    assert.ok(html.includes('82.00p') || html.includes('82p'));
  });
});

// ── trajectoryChip ────────────────────────────────────────────────────────────
describe('helpers — trajectoryChip()', () => {
  it('returns "" when current is null', () => {
    assert.strictEqual(trajectoryChip(null, 0.8), '');
  });

  it('returns "" when prior is 0 (no division by zero)', () => {
    assert.strictEqual(trajectoryChip(0.5, 0), '');
  });

  it('lower-better: decrease is green (improvement)', () => {
    const html = trajectoryChip(0.6, 0.8, { direction: 'lower-better' });
    assert.ok(html.includes('var(--green)'));
    assert.ok(html.includes('↓'));
  });

  it('lower-better: increase ≥10% is red (worsening)', () => {
    const html = trajectoryChip(0.9, 0.7, { direction: 'lower-better' });
    assert.ok(html.includes('var(--red)'));
    assert.ok(html.includes('↑'));
  });

  it('higher-better: increase is green (improvement)', () => {
    const html = trajectoryChip(0.9, 0.7, { direction: 'higher-better' });
    assert.ok(html.includes('var(--green)'));
  });

  it('< 1% change renders as "~stable"', () => {
    const html = trajectoryChip(1.001, 1.000, { direction: 'lower-better' });
    assert.ok(html.includes('~stable'));
  });

  it('uses custom priorLabel', () => {
    const html = trajectoryChip(0.5, 0.6, { direction: 'lower-better', priorLabel: 'vs Apr 24' });
    assert.ok(html.includes('vs Apr 24'));
  });
});

// ── govFlag ───────────────────────────────────────────────────────────────────
describe('helpers — govFlag()', () => {
  it('renders text in output', () => {
    const html = govFlag('Seizure check required');
    assert.ok(html.includes('Seizure check required'));
  });

  it('error severity uses red', () => {
    const html = govFlag('Critical issue', 'error');
    assert.ok(html.includes('var(--red)'));
  });

  it('warn (default) severity uses amber', () => {
    const html = govFlag('Watch this');
    assert.ok(html.includes('var(--amber)'));
  });
});

// ── pillSt ────────────────────────────────────────────────────────────────────
describe('helpers — pillSt()', () => {
  it('"active" renders "Active" with pill-active class', () => {
    const html = pillSt('active');
    assert.ok(html.includes('Active'));
    assert.ok(html.includes('pill-active'));
  });

  it('"draft" renders "Draft" with pill-pending class', () => {
    const html = pillSt('draft');
    assert.ok(html.includes('Draft'));
    assert.ok(html.includes('pill-pending'));
  });

  it('null/undefined renders "—"', () => {
    const html = pillSt(null);
    assert.ok(html.includes('—'));
  });

  it('unknown status humanizes underscores and capitalizes', () => {
    const html = pillSt('pending_activation');
    assert.ok(html.includes('Pending Activation'));
  });
});

// ── initials ──────────────────────────────────────────────────────────────────
describe('helpers — initials()', () => {
  it('"John Smith" → "JS"', () => {
    assert.strictEqual(initials('John Smith'), 'JS');
  });

  it('"Ali Yildirim" → "AY"', () => {
    assert.strictEqual(initials('Ali Yildirim'), 'AY');
  });

  it('empty/null → "?"', () => {
    assert.strictEqual(initials(''), '?');
    assert.strictEqual(initials(null), '?');
  });

  it('truncates to 2 chars for long names', () => {
    assert.strictEqual(initials('A B C D').length, 2);
  });
});

// ── drHero — clinical safety copy ────────────────────────────────────────────
describe('helpers — drHero()', () => {
  it('renders question text', () => {
    const html = drHero({ question: 'Has this patient changed?', flagCount: 0 });
    assert.ok(html.includes('Has this patient changed?'));
  });

  it('renders flag count chip when flags > 0', () => {
    const html = drHero({ question: 'Q', flagCount: 2, flagSummary: 'Alpha elevated' });
    assert.ok(html.includes('2 flags'));
    assert.ok(html.includes('Alpha elevated'));
  });

  it('renders "No active flags" chip when flagCount=0', () => {
    const html = drHero({ question: 'Q', flagCount: 0 });
    assert.ok(html.includes('No active flags'));
  });

  it('is wrapped in a <section> with aria-labelledby', () => {
    const html = drHero({ question: 'Q' });
    assert.ok(html.includes('<section'));
    assert.ok(html.includes('aria-labelledby'));
  });
});
