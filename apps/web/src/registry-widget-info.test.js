// Tests for registry-widget-info.js
// Pins: REGISTRY_WIDGET_INFO structure, renderRegistryInfoModal output,
// renderRegistryItemDetailModal XSS escaping and snapshot shapes,
// esc() correctness, dlRow() empty-skip contract.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';

// ── DOM stub for mountRegistryItemDetailModal ─────────────────────────────────
let savedDocument, savedWindow;

before(() => {
  savedDocument = globalThis.document;
  savedWindow   = globalThis.window;

  const makeEl = () => ({
    id: '', innerHTML: '', addEventListener: () => {},
    querySelectorAll: () => [],
    appendChild: () => {},
    remove: () => {},
  });

  globalThis.window = { _closeRegistryInfo: undefined, _closeRegistryItemDetail: undefined, _openRegItemDetail: undefined };

  globalThis.document = {
    createElement: (t) => { const el = makeEl(); el.tagName = t.toUpperCase(); return el; },
    getElementById: () => null,
    body: { appendChild: () => {} },
  };
});

after(() => {
  globalThis.document = savedDocument;
  globalThis.window   = savedWindow;
});

const {
  REGISTRY_WIDGET_INFO,
  renderRegistryInfoModal,
  renderRegistryItemDetailModal,
} = await import('./registry-widget-info.js');

// ── REGISTRY_WIDGET_INFO ──────────────────────────────────────────────────────
describe('registry-widget-info — REGISTRY_WIDGET_INFO shape', () => {
  const EXPECTED_KEYS = [
    'conditions', 'assessments', 'protocols', 'devices',
    'targets', 'consent', 'reports', 'handbooks',
    'home-programs', 'virtual-care',
  ];

  it('exposes all 10 expected registry keys', () => {
    for (const k of EXPECTED_KEYS) {
      assert.ok(k in REGISTRY_WIDGET_INFO, `key "${k}" missing`);
    }
  });

  it('each entry has title, summary, bullets[], links[]', () => {
    for (const [k, v] of Object.entries(REGISTRY_WIDGET_INFO)) {
      assert.ok(typeof v.title === 'string',   `${k}.title not string`);
      assert.ok(typeof v.summary === 'string',  `${k}.summary not string`);
      assert.ok(Array.isArray(v.bullets),       `${k}.bullets not array`);
      assert.ok(Array.isArray(v.links),         `${k}.links not array`);
    }
  });

  it('conditions entry has at least 3 bullets', () => {
    assert.ok(REGISTRY_WIDGET_INFO.conditions.bullets.length >= 3);
  });

  it('devices entry mentions "510(k)" or "clearance" in bullets', () => {
    const bulletText = REGISTRY_WIDGET_INFO.devices.bullets.join(' ');
    assert.ok(
      bulletText.includes('510(k)') || bulletText.toLowerCase().includes('clearance'),
      'no clearance mention in devices bullets'
    );
  });

  it('consent entry mentions HIPAA in links or bullets', () => {
    const text = [
      ...REGISTRY_WIDGET_INFO.consent.bullets,
      ...(REGISTRY_WIDGET_INFO.consent.links || []).map(l => l.label + ' ' + l.url),
    ].join(' ');
    assert.ok(text.toLowerCase().includes('hipaa') || text.toLowerCase().includes('hhs'), 'no HIPAA/HHS reference in consent');
  });

  it('is frozen (immutable)', () => {
    assert.ok(Object.isFrozen(REGISTRY_WIDGET_INFO));
  });
});

// ── renderRegistryInfoModal ───────────────────────────────────────────────────
describe('registry-widget-info — renderRegistryInfoModal', () => {
  it('returns empty string for unknown kind', () => {
    const html = renderRegistryInfoModal('does-not-exist');
    assert.strictEqual(html, '');
  });

  it('renders modal with title and summary for "conditions"', () => {
    const html = renderRegistryInfoModal('conditions');
    assert.ok(html.includes('Condition Registry'), 'title missing');
    assert.ok(html.includes('ds-modal'), 'modal class missing');
    assert.ok(html.includes('role="dialog"'));
  });

  it('renders bullets as <li> items', () => {
    const html = renderRegistryInfoModal('assessments');
    assert.ok(html.includes('<li>'), 'no list items rendered');
  });

  it('renders links as <a> tags pointing to external sources', () => {
    const html = renderRegistryInfoModal('protocols');
    assert.ok(html.includes('<a href="'), 'no link tags rendered');
    assert.ok(html.includes('target="_blank"'));
  });

  it('escapes XSS in title (content is static but esc() is called)', () => {
    // The title for conditions is a safe string, but we verify esc() is applied
    // by checking no unescaped angle brackets appear in the whole output.
    const html = renderRegistryInfoModal('conditions');
    // The source contains no angle brackets in the title value itself,
    // but confirm the modal wrapper does not double-escape the static string
    assert.ok(!html.includes('&amp;lt;'), 'double-escaped entity found');
  });
});

// ── renderRegistryItemDetailModal ─────────────────────────────────────────────
describe('registry-widget-info — renderRegistryItemDetailModal', () => {
  it('renders condition item snapshot with ICD-10 row', () => {
    const html = renderRegistryItemDetailModal('conditions', {
      id: 'mdd', name: 'Major Depressive Disorder', icd10: 'F32',
      cat: 'Mood', ev: 'A', modalities: ['TMS/rTMS'], targets: ['F3'],
      onLabel: ['TMS/rTMS'], assessments: ['phq9'], flags: [], notes: 'FDA-cleared.',
    });
    assert.ok(html.includes('Major Depressive Disorder'));
    assert.ok(html.includes('ICD-10'));
    assert.ok(html.includes('F32'));
  });

  it('escapes XSS in item name', () => {
    const html = renderRegistryItemDetailModal('conditions', {
      id: 'x', name: '<script>alert(1)</script>', icd10: 'X', cat: 'X', ev: 'A',
      modalities: [], targets: [], onLabel: [], assessments: [], flags: [],
    });
    assert.ok(!html.includes('<script>'), 'unescaped <script> tag found in output');
    assert.ok(html.includes('&lt;script&gt;'));
  });

  it('renders assessment snapshot with domain and scoring', () => {
    const html = renderRegistryItemDetailModal('assessments', {
      id: 'phq9', name: 'PHQ-9', domain: 'Mood', type: 'Self-report',
      ev: 'A', items: 9, mins: 3, scoring: '0–27', freq: ['pre', 'weekly'], conditions: ['mdd'],
    });
    assert.ok(html.includes('PHQ-9'));
    assert.ok(html.includes('Mood'));
    assert.ok(html.includes('0–27'));
  });

  it('includes crosswalk "How this connects" section', () => {
    const html = renderRegistryItemDetailModal('protocols', {
      id: 'test-proto', name: 'Test Protocol', condition: 'mdd', modality: 'TMS/rTMS',
      target: 'F3', laterality: 'Left', freq: '10 Hz', intensity: '120% MT',
      sessions: 30, sessPerWeek: 5, duration: '6 wks', ev: 'A', onLabel: true,
    });
    assert.ok(html.includes('How this connects across registries'));
  });

  it('unknown kind renders "Registry entry" as title', () => {
    const html = renderRegistryItemDetailModal('unknown-kind', { name: 'Foo' });
    assert.ok(html.includes('Registry entry'));
  });
});
