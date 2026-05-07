/**
 * Voice Analyzer — renderer and demo-banner regression tests (logic-only).
 *
 * Run: node --test src/pages-voice-analyzer.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import {
  esc,
  pgVoiceAnalyzer,
  renderVoiceReportHtml,
  resolveVoiceAnalyzerPatientContext,
  voiceAnalyzerAllowsLiveRole,
  voiceAnalyzerDemoFixtureBanner,
  voiceAnalyzerPreviewBuildBanner,
  voiceAnalyzerShouldAutoLoadStoredReport,
} from './pages-voice-analyzer.js';
import { api } from './api.js';
import { ANALYZER_DEMO_FIXTURES } from './demo-fixtures-analyzers.js';

// ─── JSDOM helpers (mirrors pages-deeptwin.test.js) ───────────────────────────

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body><div id="content"></div></body></html>', {
    url: 'https://example.test/voice-analyzer',
  });

  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    sessionStorage: globalThis.sessionStorage,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    Event: globalThis.Event,
    HTMLElement: globalThis.HTMLElement,
    Node: globalThis.Node,
  };

  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.sessionStorage = dom.window.sessionStorage;
  globalThis.requestAnimationFrame = (cb) => cb();
  globalThis.Event = dom.window.Event;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Node = dom.window.Node;

  return {
    window: dom.window,
    restore() {
      dom.window.close();
      globalThis.window = previous.window;
      globalThis.document = previous.document;
      globalThis.sessionStorage = previous.sessionStorage;
      globalThis.requestAnimationFrame = previous.requestAnimationFrame;
      globalThis.Event = previous.Event;
      globalThis.HTMLElement = previous.HTMLElement;
      globalThis.Node = previous.Node;
    },
  };
}

function installToken(token) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem(key) {
        return key === 'ds_access_token' ? token : null;
      },
      setItem() {},
      removeItem() {},
    },
  });
  return () => {
    if (previous) {
      Object.defineProperty(globalThis, 'localStorage', previous);
    } else {
      delete globalThis.localStorage;
    }
  };
}

/**
 * Stub the minimum api surface pgVoiceAnalyzer touches so the page mounts
 * without network calls. Returns a restore function.
 */
function stubApiForMount({ audioGetReportImpl } = {}) {
  const saved = {
    me: api.me,
    listPatients: api.listPatients,
    audioGetReport: api.audioGetReport,
    audioListPatientAnalyses: api.audioListPatientAnalyses,
  };

  api.me = async () => ({ role: 'clinician' });
  api.listPatients = async () => ({ items: [] });
  api.audioListPatientAnalyses = async () => ({ items: [] });
  api.audioGetReport = audioGetReportImpl ?? (async () => { throw new Error('no report'); });

  return () => {
    api.me = saved.me;
    api.listPatients = saved.listPatients;
    api.audioGetReport = saved.audioGetReport;
    api.audioListPatientAnalyses = saved.audioListPatientAnalyses;
  };
}

test('esc escapes HTML', () => {
  assert.equal(esc('<script>'), '&lt;script&gt;');
});

test('voiceAnalyzerDemoFixtureBanner mentions demo data', () => {
  const html = voiceAnalyzerDemoFixtureBanner();
  assert.ok(html.includes('Demo'), 'banner should label demo');
});

test('renderVoiceReportHtml demo fixture shows demo/sample banner', () => {
  const html = renderVoiceReportHtml(ANALYZER_DEMO_FIXTURES.voice, { demoFixture: true });
  assert.ok(html.includes('Demo/sample payload'));
  assert.ok(html.includes('Literature-linked evidence packs'));
});

test('renderVoiceReportHtml stored report shows stored banner', () => {
  const minimal = {
    ok: true,
    analysis_id: 'test-analysis-id',
    voice_report: { qc: { snr_db: 22 }, decision_support: { disclaimer: 'DS only.' } },
    clinical_disclaimer: 'Clinical decision-support only.',
  };
  const html = renderVoiceReportHtml(minimal, { storedReport: true });
  assert.ok(html.includes('Stored analysis'));
});

test('voiceAnalyzerPreviewBuildBanner is empty without vite demo env', () => {
  assert.equal(voiceAnalyzerPreviewBuildBanner(), '');
});

test('voice analyzer role gate allows clinician roles and rejects patient role', () => {
  assert.equal(voiceAnalyzerAllowsLiveRole('clinician'), true);
  assert.equal(voiceAnalyzerAllowsLiveRole('admin'), true);
  assert.equal(voiceAnalyzerAllowsLiveRole('patient'), false);
});

test('voice analyzer patient context requires selected clinic patient for live mode', () => {
  const liveBlocked = resolveVoiceAnalyzerPatientContext({
    selectedPatientId: '',
    overridePatientId: 'pt-live-123',
    demoMode: false,
    allowManualOverride: false,
  });
  assert.equal(liveBlocked.patientId, null);
  assert.match(liveBlocked.error, /clinic list|Select the patient/i);

  const liveSelected = resolveVoiceAnalyzerPatientContext({
    selectedPatientId: 'pt-123',
    overridePatientId: '',
    demoMode: false,
    allowManualOverride: false,
  });
  assert.equal(liveSelected.patientId, 'pt-123');
  assert.equal(liveSelected.error, null);
});

test('voice analyzer patient context permits demo override but rejects mismatch', () => {
  const demoOverride = resolveVoiceAnalyzerPatientContext({
    selectedPatientId: '',
    overridePatientId: 'demo-pt-1',
    demoMode: true,
    allowManualOverride: true,
  });
  assert.equal(demoOverride.patientId, 'demo-pt-1');

  const mismatch = resolveVoiceAnalyzerPatientContext({
    selectedPatientId: 'pt-a',
    overridePatientId: 'pt-b',
    demoMode: false,
    allowManualOverride: false,
  });
  assert.equal(mismatch.patientId, null);
  assert.match(mismatch.error, /must match/i);
});

test('voice analyzer stored report autoload respects patient scope', () => {
  assert.equal(voiceAnalyzerShouldAutoLoadStoredReport('pt-1', 'pt-1'), true);
  assert.equal(voiceAnalyzerShouldAutoLoadStoredReport('pt-1', 'pt-2'), false);
  assert.equal(voiceAnalyzerShouldAutoLoadStoredReport('', 'pt-2'), false); // tightened: null currentPatientId with a stored patient must NOT autoload
});

test('real clinician session does not show demo fixture when api.audioGetReport errors', async () => {
  // shouldUseVoiceAnalyzerDemoFixtures must exist as a named export and return
  // false for a non-demo token — coder adds this helper (mirrors isDeepTwinDemoTokenSession).
  const mod = await import('./pages-voice-analyzer.js');
  assert.ok(
    typeof mod.shouldUseVoiceAnalyzerDemoFixtures === 'function',
    'shouldUseVoiceAnalyzerDemoFixtures must be exported from pages-voice-analyzer.js',
  );
  const restoreToken = installToken('real-clinician-jwt');
  try {
    assert.equal(
      mod.shouldUseVoiceAnalyzerDemoFixtures(),
      false,
      'real clinician token must not qualify as a demo fixture session',
    );
  } finally {
    restoreToken();
  }
});

test('demo session may still show fixture when api.audioGetReport errors', async () => {
  // With a demo token, shouldUseVoiceAnalyzerDemoFixtures() must return true —
  // the fixture fallback IS allowed for demo/offline sessions.
  const mod = await import('./pages-voice-analyzer.js');
  assert.ok(
    typeof mod.shouldUseVoiceAnalyzerDemoFixtures === 'function',
    'shouldUseVoiceAnalyzerDemoFixtures must be exported from pages-voice-analyzer.js',
  );
  const restoreToken = installToken('clinician-demo-token');
  try {
    assert.equal(
      mod.shouldUseVoiceAnalyzerDemoFixtures(),
      true,
      'demo token session must qualify for the demo fixture fallback',
    );
  } finally {
    restoreToken();
  }
});

test('voice analyzer demo gate allows preview when forced and no access token', async () => {
  const mod = await import('./pages-voice-analyzer.js');
  assert.ok(
    typeof mod.shouldUseVoiceAnalyzerDemoFixtures === 'function',
    'shouldUseVoiceAnalyzerDemoFixtures must be exported',
  );
  // Set the testable seam that signals DEMO_FORCED in non-Vite environments,
  // and install no token — mirrors the logged-out Netlify preview scenario.
  const prev = globalThis._VA_DEMO_FORCED;
  globalThis._VA_DEMO_FORCED = true;
  const restoreToken = installToken(null);
  try {
    assert.equal(
      mod.shouldUseVoiceAnalyzerDemoFixtures(),
      true,
      'DEMO_FORCED + no token must qualify for demo fixtures (logged-out Netlify preview)',
    );
  } finally {
    globalThis._VA_DEMO_FORCED = prev;
    restoreToken();
  }
});

test('nav button does not call navigate() when patientCtx.error is non-null', async () => {
  const { window, restore } = installDom();
  const restoreToken = installToken('real-clinician-jwt');
  const restoreApi = stubApiForMount();
  const navigateCalls = [];
  try {
    await pgVoiceAnalyzer(() => {}, (page) => { navigateCalls.push(page); });

    // Set conflicting patient values so effectivePatientId() produces a mismatch error.
    const selEl = globalThis.document.getElementById('va-patient-select');
    const ovEl = globalThis.document.getElementById('va-patient-id-override');
    if (selEl) selEl.value = 'pt-a';
    if (ovEl) {
      ovEl.disabled = false;
      ovEl.value = 'pt-b';
    }

    const navBtn = globalThis.document.querySelector('[data-va-nav]');
    assert.ok(navBtn, 'at least one data-va-nav button must be rendered');

    const callsBefore = navigateCalls.length;
    navBtn.click();

    assert.equal(
      navigateCalls.length,
      callsBefore,
      'navigate() must not fire when effectivePatientId() returns a non-null error',
    );
    assert.equal(
      window._deeptwinPatientId,
      undefined,
      'window._deeptwinPatientId must not be written when patient context has an error',
    );
  } finally {
    restoreApi();
    restoreToken();
    restore();
  }
});
