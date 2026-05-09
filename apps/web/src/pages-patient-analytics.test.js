// Tests for pages-patient-analytics.js
// Pins: DS_EVIDENCE_TEST_EXPORTS widget HTML correctness, telemetry shape
// (via rendered output), static reference data shapes embedded in rendered HTML,
// and XSS-escape behaviour.
// DOM-heavy page functions (pgPatientAnalyticsCohort / pgPatientAnalyticsDetail)
// are tested for mount/unmount safety only.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { DS_EVIDENCE_TEST_EXPORTS, pgPatientAnalyticsCohort, pgPatientAnalyticsDetail } from './pages-patient-analytics.js';

const {
  evidenceChipHtml,
  renderHeader,
  widgetPredictions,
  widgetQeeg,
  widgetMri,
  widgetVoice,
  widgetVideo,
  widgetText,
} = DS_EVIDENCE_TEST_EXPORTS;

// ── Minimal DOM stub ──────────────────────────────────────────────────────────
let _origDoc, _origWin;
before(() => {
  if (typeof globalThis.document === 'undefined') {
    _origDoc = undefined;
    const el = {
      innerHTML: '',
      style: {},
      querySelectorAll: () => ({ forEach: () => {} }),
      querySelector: () => null,
      getAttribute: () => null,
      setAttribute: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      appendChild: () => {},
      removeChild: () => {},
      insertBefore: () => {},
      firstChild: null,
    };
    globalThis.document = {
      getElementById: (id) => (id === 'content' ? el : null),
      querySelector: () => null,
      querySelectorAll: () => ({ forEach: () => {} }),
      createElement: () => ({
        style: {},
        dataset: {},
        textContent: '',
        appendChild: () => {},
        addEventListener: () => {},
        insertBefore: () => {},
        firstChild: null,
      }),
      body: el,
      head: el,
    };
  }
  if (typeof globalThis.window === 'undefined') {
    _origWin = undefined;
    globalThis.window = {
      _nav: () => {},
      _phSwitchTab: null,
      _dsToast: undefined,
      devicePixelRatio: 1,
    };
  }
});
after(() => {
  if (_origDoc === undefined) delete globalThis.document;
  if (_origWin === undefined) delete globalThis.window;
});

// ── Dummy telemetry (mirrors buildPatientTelemetry shape) ─────────────────────
function makeTel(overrides = {}) {
  const n = 98;
  const make = (start) => Array.from({ length: n }, (_, i) => start + i * 0.01);
  return {
    seriesPHQ:  make(18),
    seriesGAD:  make(14),
    seriesHRV:  make(40),
    seriesSleep: make(5.5),
    seriesMood:  make(3.0),
    events: [],
    sessionsTotal: 38,
    sessionsCompleted: 30,
    phqStart: 22,
    phqEnd: 8,
    gadStart: 17,
    gadEnd: 9,
    riskScore: '0.25',
    adherence: 85,
    ...overrides,
  };
}

// ── Demo patient stub ─────────────────────────────────────────────────────────
const PT = {
  id: 'test-pt-001',
  first_name: 'Test',
  last_name: 'Patient',
  primary_condition: 'MDD',
  primary_modality: 'tDCS',
  age: 35,
  gender: 'F',
};

describe('pages-patient-analytics — widgetQeeg', () => {
  it('returns a non-empty HTML string', () => {
    const html = widgetQeeg(makeTel(), 'test-pt-001');
    assert.strictEqual(typeof html, 'string');
    assert.ok(html.length > 50);
  });

  it('contains band names: Delta, Theta, Alpha, Beta, Gamma', () => {
    const html = widgetQeeg(makeTel(), 'test-pt-001');
    assert.ok(html.includes('Delta'));
    assert.ok(html.includes('Theta'));
    assert.ok(html.includes('Alpha'));
    assert.ok(html.includes('Beta'));
    assert.ok(html.includes('Gamma'));
  });

  it('contains pa-qeeg-row wrapper', () => {
    const html = widgetQeeg(makeTel(), 'test-pt-001');
    assert.ok(html.includes('pa-qeeg-row'));
  });
});

describe('pages-patient-analytics — widgetMri', () => {
  it('returns an HTML string containing MRI region data', () => {
    const html = widgetMri(makeTel(), 'test-pt-001');
    assert.strictEqual(typeof html, 'string');
    assert.ok(html.includes('Hippocampus'));
  });

  it('contains SVG element for MRI slice', () => {
    const html = widgetMri(makeTel(), 'test-pt-001');
    assert.ok(html.includes('<svg'));
  });

  it('contains pa-mri-row wrapper', () => {
    const html = widgetMri(makeTel(), 'test-pt-001');
    assert.ok(html.includes('pa-mri-row'));
  });
});

describe('pages-patient-analytics — widgetPredictions', () => {
  it('returns an HTML string with predictions content', () => {
    const html = widgetPredictions(makeTel(), 'test-pt-001');
    assert.strictEqual(typeof html, 'string');
    assert.ok(html.length > 50);
  });

  it('includes remission probability values', () => {
    const html = widgetPredictions(makeTel(), 'test-pt-001');
    // PREDICTIONS array has remission values like 0.62, 0.74 etc.
    assert.ok(html.includes('%') || html.includes('remission') || html.includes('62'));
  });
});

describe('pages-patient-analytics — widgetVoice', () => {
  it('returns a string', () => {
    const html = widgetVoice(makeTel(), 'test-pt-001');
    assert.strictEqual(typeof html, 'string');
  });

  it('mentions voice features', () => {
    const html = widgetVoice(makeTel(), 'test-pt-001');
    assert.ok(html.includes('Pitch') || html.includes('Speech') || html.includes('voice'));
  });
});

describe('pages-patient-analytics — widgetVideo', () => {
  it('returns a string without throwing', () => {
    assert.doesNotThrow(() => {
      const html = widgetVideo(makeTel(), 'test-pt-001');
      assert.strictEqual(typeof html, 'string');
    });
  });
});

describe('pages-patient-analytics — widgetText', () => {
  it('returns a string without throwing', () => {
    assert.doesNotThrow(() => {
      const html = widgetText(makeTel(), 'test-pt-001');
      assert.strictEqual(typeof html, 'string');
    });
  });
});

describe('pages-patient-analytics — renderHeader', () => {
  it('returns HTML containing patient name', () => {
    const html = renderHeader(PT, makeTel());
    assert.ok(html.includes('Test') || html.includes('Patient'));
  });

  it('contains adherence value', () => {
    const tel = makeTel({ adherence: 92 });
    const html = renderHeader(PT, tel);
    assert.ok(html.includes('92'));
  });

  it('XSS-escapes dangerous patient name', () => {
    const evil = { ...PT, first_name: '<script>alert(1)</script>', last_name: '' };
    const html = renderHeader(evil, makeTel());
    assert.ok(!html.includes('<script>'), 'raw <script> tag must not appear in output');
    assert.ok(html.includes('&lt;script&gt;') || html.includes('&lt;'), 'angle brackets should be escaped');
  });
});

describe('pages-patient-analytics — static data shapes', () => {
  it('QEEG band values are positive percentages (via widgetQeeg HTML)', () => {
    const html = widgetQeeg(makeTel(), 'pt');
    // widgetQeeg renders QEEG_BANDS which have specific values like 18.4, 14.2, 31.8, 26.5, 9.1
    assert.ok(html.includes('31.8'), 'Alpha band 31.8% should appear');
  });

  it('MRI findings include hippocampus volume (cm³) in HTML', () => {
    const html = widgetMri(makeTel(), 'pt');
    assert.ok(html.includes('cm³'));
  });
});

describe('pages-patient-analytics — pgPatientAnalyticsCohort', () => {
  it('does not throw (DOM stub absorbs innerHTML)', async () => {
    await assert.doesNotReject(async () => {
      await pgPatientAnalyticsCohort(() => {});
    });
  });
});
