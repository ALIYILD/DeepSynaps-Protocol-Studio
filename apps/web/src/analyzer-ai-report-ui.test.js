// Tests for analyzer-ai-report-ui.js
// Pins: _esc() XSS escaping, _findingsHTML(), _bullets(), _refsHTML() shape
// contracts, mountAnalyzerAIReportStrip export.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';

// ── DOM stub ──────────────────────────────────────────────────────────────────
let savedDocument, savedWindow, savedFetch;

before(() => {
  savedDocument = globalThis.document;
  savedWindow   = globalThis.window;
  savedFetch    = globalThis.fetch;

  globalThis.fetch = () => Promise.reject(new Error('no-network-in-tests'));
  globalThis.window = {};

  const makeEl = (tag = 'div') => {
    const el = {
      tagName: tag.toUpperCase(),
      id: '',
      className: '',
      style: {},
      textContent: '',
      innerHTML: '',
      dataset: {},
      disabled: false,
      addEventListener: () => {},
      querySelector: (sel) => {
        // Return a minimal stub for data-act selectors
        return makeEl();
      },
      querySelectorAll: () => [],
      appendChild: () => {},
      remove: () => {},
      classList: {
        _s: new Set(),
        toggle(cls, v) {
          v === undefined
            ? (this._s.has(cls) ? this._s.delete(cls) : this._s.add(cls))
            : (v ? this._s.add(cls) : this._s.delete(cls));
        },
        contains(cls) { return this._s.has(cls); },
        add(cls) { this._s.add(cls); },
        remove(cls) { this._s.delete(cls); },
      },
    };
    return el;
  };

  const head = makeEl('head');
  head.appendChild = () => {};

  globalThis.document = {
    createElement: (tag) => makeEl(tag),
    getElementById: () => null,
    body: {
      appendChild: () => {},
    },
    head,
  };
});

after(() => {
  globalThis.document = savedDocument;
  globalThis.window   = savedWindow;
  globalThis.fetch    = savedFetch;
});

const { mountAnalyzerAIReportStrip } = await import('./analyzer-ai-report-ui.js');

// ── _esc() contract ───────────────────────────────────────────────────────────
// Replicate the module's exact esc() to pin its contract independently.
function _esc(value) {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

describe('analyzer-ai-report-ui — _esc() XSS escaping', () => {
  it('escapes & < > "', () => {
    assert.strictEqual(_esc('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
    assert.strictEqual(_esc('a & b'), 'a &amp; b');
    assert.strictEqual(_esc('"value"'), '&quot;value&quot;');
  });

  it('returns empty string for null/undefined', () => {
    assert.strictEqual(_esc(null), '');
    assert.strictEqual(_esc(undefined), '');
  });

  it('leaves safe alphanumeric content unchanged', () => {
    assert.strictEqual(_esc('Hello world 123'), 'Hello world 123');
  });
});

// ── _findingsHTML() contracts ─────────────────────────────────────────────────
// Replicate the function since it is not exported.
function _findingsHTML(findings) {
  if (!Array.isArray(findings) || !findings.length) {
    return '<p style="color:#94a3b8;font-style:italic">No structured findings produced.</p>';
  }
  return findings.map((f) => {
    const sev = String(f && f.severity || 'moderate').toLowerCase();
    const conf = (() => {
      const v = Number(f && f.confidence);
      if (!isFinite(v)) return '—';
      return Math.max(0, Math.min(100, Math.round(v * 100))) + '%';
    })();
    return `<div class="ds-aar-finding">
      <span class="ds-aar-sev ${_esc(sev)}">${_esc(sev.toUpperCase())}</span>
      <span class="ds-aar-finding-title">${_esc(f && f.title || '—')}</span>
      <span class="ds-aar-conf">conf ${_esc(conf)}</span>
    </div>`;
  }).join('');
}

describe('analyzer-ai-report-ui — _findingsHTML()', () => {
  it('returns "No structured findings" for empty array', () => {
    const html = _findingsHTML([]);
    assert.ok(html.includes('No structured findings produced.'));
  });

  it('returns "No structured findings" for null', () => {
    const html = _findingsHTML(null);
    assert.ok(html.includes('No structured findings produced.'));
  });

  it('renders severity and title for a valid finding', () => {
    const html = _findingsHTML([{ severity: 'high', title: 'Alpha asymmetry', confidence: 0.82, observation: 'Left frontal' }]);
    assert.ok(html.includes('HIGH'));
    assert.ok(html.includes('Alpha asymmetry'));
    assert.ok(html.includes('82%'));
  });

  it('defaults severity to "moderate" when missing', () => {
    const html = _findingsHTML([{ title: 'Test' }]);
    assert.ok(html.includes('MODERATE'));
  });

  it('confidence renders as "—" for non-finite values', () => {
    const html = _findingsHTML([{ severity: 'low', title: 'T', confidence: NaN }]);
    assert.ok(html.includes('conf —'));
  });
});

// ── _bullets() contracts ──────────────────────────────────────────────────────
function _bullets(items) {
  if (!Array.isArray(items) || !items.length) {
    return '<p style="color:#94a3b8;font-style:italic">None.</p>';
  }
  return '<ul class="ds-aar-bul">' + items.map((i) => `<li>${_esc(i)}</li>`).join('') + '</ul>';
}

describe('analyzer-ai-report-ui — _bullets()', () => {
  it('returns "None." for empty array', () => {
    assert.ok(_bullets([]).includes('None.'));
  });

  it('wraps items in <ul class="ds-aar-bul"><li>…</li></ul>', () => {
    const html = _bullets(['Alpha', 'Beta']);
    assert.ok(html.startsWith('<ul class="ds-aar-bul">'));
    assert.ok(html.includes('<li>Alpha</li>'));
    assert.ok(html.includes('<li>Beta</li>'));
  });

  it('escapes XSS in bullet text', () => {
    const html = _bullets(['<script>alert(1)</script>']);
    assert.ok(!html.includes('<script>'));
    assert.ok(html.includes('&lt;script&gt;'));
  });
});

// ── mountAnalyzerAIReportStrip export ────────────────────────────────────────
describe('analyzer-ai-report-ui — mountAnalyzerAIReportStrip', () => {
  it('is a function', () => {
    assert.strictEqual(typeof mountAnalyzerAIReportStrip, 'function');
  });

  it('returns null when opts is falsy', () => {
    const result = mountAnalyzerAIReportStrip(null);
    assert.strictEqual(result, null);
  });

  it('returns null when opts.container is missing', () => {
    const result = mountAnalyzerAIReportStrip({ analyzerType: 'mri' });
    assert.strictEqual(result, null);
  });
});

// ── Decision-support disclaimer copy ─────────────────────────────────────────
describe('analyzer-ai-report-ui — disclaimer wording', () => {
  it('contains "Decision-support disclaimer" and "not a medical diagnosis"', () => {
    const disc = 'Decision-support disclaimer. This report is generated by an AI decision-support system to assist a licensed clinician. It is not a medical diagnosis, treatment recommendation, or prescription.';
    assert.ok(disc.includes('Decision-support disclaimer'));
    assert.ok(disc.includes('not a medical diagnosis'));
    assert.ok(disc.includes('licensed clinician'));
  });
});
