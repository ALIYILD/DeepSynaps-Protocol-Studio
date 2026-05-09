// pages-agents.test.js — Wave-7 pinning tests (PR 99/N)
//
// Pins public exports and test-seam API from pages-agents.js.
// Complements the existing hire-flow + prompt-history tests without
// duplicating them.

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ── Browser stubs ─────────────────────────────────────────────────────────────
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;

const _lsStore = {};
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true, writable: true,
  value: {
    getItem(k) { return Object.prototype.hasOwnProperty.call(_lsStore, k) ? _lsStore[k] : null; },
    setItem(k, v) { _lsStore[k] = String(v); },
    removeItem(k) { delete _lsStore[k]; },
  },
});
Object.defineProperty(globalThis, 'sessionStorage', {
  configurable: true, writable: true,
  value: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
});
if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({ style: {}, addEventListener() {}, appendChild() {} }),
    body: { appendChild() {} },
    addEventListener: () => {},
  };
}
globalThis.fetch = async () => { throw new Error('fetch not stubbed in pages-agents.test'); };

const mod = await import('./pages-agents.js');

// ── 1. Export presence ────────────────────────────────────────────────────────
describe('pages-agents public exports', () => {
  it('exports AI_AGENT_V2_GOVERNANCE_COPY as a non-empty string', () => {
    assert.strictEqual(typeof mod.AI_AGENT_V2_GOVERNANCE_COPY, 'string');
    assert.ok(mod.AI_AGENT_V2_GOVERNANCE_COPY.length > 0);
  });

  it('exports canUseAiAgentV2Workspace as a function', () => {
    assert.strictEqual(typeof mod.canUseAiAgentV2Workspace, 'function');
  });

  it('exports pgAgentChat as a function', () => {
    assert.strictEqual(typeof mod.pgAgentChat, 'function');
  });

  it('exports __hireFlowTestApi__ as an object', () => {
    assert.strictEqual(typeof mod.__hireFlowTestApi__, 'object');
    assert.ok(mod.__hireFlowTestApi__ !== null);
  });

  it('exports __aiAgentV2TestApi__ as an object', () => {
    assert.strictEqual(typeof mod.__aiAgentV2TestApi__, 'object');
    assert.ok(mod.__aiAgentV2TestApi__ !== null);
  });

  it('exports __promptOverridesTestApi__ as an object', () => {
    assert.strictEqual(typeof mod.__promptOverridesTestApi__, 'object');
  });

  it('exports __promptHistoryTestApi__ as an object', () => {
    assert.strictEqual(typeof mod.__promptHistoryTestApi__, 'object');
  });

  it('exports __webhookReplayTestApi__ as an object', () => {
    assert.strictEqual(typeof mod.__webhookReplayTestApi__, 'object');
  });

  it('exports __onboardingFunnelTestApi__ as an object', () => {
    assert.strictEqual(typeof mod.__onboardingFunnelTestApi__, 'object');
  });
});

// ── 2. AI_AGENT_V2_GOVERNANCE_COPY clinical-safety content ───────────────────
describe('AI_AGENT_V2_GOVERNANCE_COPY clinical safety pin', () => {
  it('contains "clinician-reviewed"', () => {
    assert.match(mod.AI_AGENT_V2_GOVERNANCE_COPY, /clinician-reviewed/i);
  });

  it('contains "do not diagnose" language', () => {
    assert.match(mod.AI_AGENT_V2_GOVERNANCE_COPY, /do not diagnose/i);
  });

  it('contains "prescribe" language', () => {
    assert.match(mod.AI_AGENT_V2_GOVERNANCE_COPY, /prescribe/i);
  });

  it('contains "explicit authorised workflow" or equivalent explicit approval language', () => {
    // The copy includes "without explicit authorised workflow"
    assert.match(mod.AI_AGENT_V2_GOVERNANCE_COPY, /explicit/i);
  });

  it('is a single-line or multi-line string ending with a period', () => {
    assert.ok(
      mod.AI_AGENT_V2_GOVERNANCE_COPY.trimEnd().endsWith('.'),
      'governance copy should end with a period'
    );
  });
});

// ── 3. canUseAiAgentV2Workspace ───────────────────────────────────────────────
describe('canUseAiAgentV2Workspace', () => {
  it('returns true when no user is stored (anonymous / not loaded)', () => {
    delete _lsStore.ds_user;
    assert.strictEqual(mod.canUseAiAgentV2Workspace(), true);
  });

  it('returns true for clinician role', () => {
    _lsStore.ds_user = JSON.stringify({ role: 'clinician' });
    assert.strictEqual(mod.canUseAiAgentV2Workspace(), true);
    delete _lsStore.ds_user;
  });

  it('returns true for admin role', () => {
    _lsStore.ds_user = JSON.stringify({ role: 'admin' });
    assert.strictEqual(mod.canUseAiAgentV2Workspace(), true);
    delete _lsStore.ds_user;
  });

  it('returns false for patient role', () => {
    _lsStore.ds_user = JSON.stringify({ role: 'patient' });
    assert.strictEqual(mod.canUseAiAgentV2Workspace(), false);
    delete _lsStore.ds_user;
  });

  it('returns false for guest role', () => {
    _lsStore.ds_user = JSON.stringify({ role: 'guest' });
    assert.strictEqual(mod.canUseAiAgentV2Workspace(), false);
    delete _lsStore.ds_user;
  });
});

// ── 4. __aiAgentV2TestApi__ rendering ────────────────────────────────────────
describe('__aiAgentV2TestApi__ governance banner', () => {
  beforeEach(() => mod.__aiAgentV2TestApi__.reset());

  it('renderGovernanceBanner returns a non-empty HTML string', () => {
    const html = mod.__aiAgentV2TestApi__.renderGovernanceBanner();
    assert.strictEqual(typeof html, 'string');
    assert.ok(html.length > 0);
  });

  it('governance banner contains data-test="ai-agent-v2-governance"', () => {
    const html = mod.__aiAgentV2TestApi__.renderGovernanceBanner();
    assert.match(html, /data-test="ai-agent-v2-governance"/);
  });

  it('governance banner includes the governance copy text', () => {
    const html = mod.__aiAgentV2TestApi__.renderGovernanceBanner();
    assert.match(html, /clinician-reviewed/i);
  });
});

describe('__aiAgentV2TestApi__ patient context panel', () => {
  beforeEach(() => mod.__aiAgentV2TestApi__.reset());

  it('renderPatientContextPanel returns a non-empty HTML string', () => {
    const html = mod.__aiAgentV2TestApi__.renderPatientContextPanel();
    assert.strictEqual(typeof html, 'string');
    assert.ok(html.length > 0);
  });

  it('context panel contains data-test="ai-agent-v2-context-panel"', () => {
    const html = mod.__aiAgentV2TestApi__.renderPatientContextPanel();
    assert.match(html, /data-test="ai-agent-v2-context-panel"/);
  });

  it('context panel marks patient-missing when no patient is selected', () => {
    // window._selectedPatientId not set in stubs
    const html = mod.__aiAgentV2TestApi__.renderPatientContextPanel();
    assert.match(html, /data-ai-agent-v2-patient-missing="1"/);
  });
});

// ── 5. __hireFlowTestApi__ smoke tests ───────────────────────────────────────
describe('__hireFlowTestApi__ smoke', () => {
  beforeEach(() => mod.__hireFlowTestApi__.reset());

  it('formatToolPlainEnglish returns a string', () => {
    const result = mod.__hireFlowTestApi__.formatToolPlainEnglish('sessions.create');
    assert.strictEqual(typeof result, 'string');
  });

  it('formatRelativeTimestamp returns a string for a valid ISO date', () => {
    const result = mod.__hireFlowTestApi__.formatRelativeTimestamp(new Date().toISOString());
    assert.strictEqual(typeof result, 'string');
  });

  it('formatRelativeTimestamp returns a string for null', () => {
    const result = mod.__hireFlowTestApi__.formatRelativeTimestamp(null);
    assert.strictEqual(typeof result, 'string');
  });

  it('renderHiredRail is empty when agent list is empty', () => {
    assert.strictEqual(mod.__hireFlowTestApi__.renderHiredRail(), '');
  });
});

// ── 6. __promptOverridesTestApi__ state management ───────────────────────────
describe('__promptOverridesTestApi__ state', () => {
  beforeEach(() => mod.__promptOverridesTestApi__.reset());

  it('reset() sets tab to "catalog"', () => {
    mod.__promptOverridesTestApi__.setTab('ops');
    mod.__promptOverridesTestApi__.reset();
    assert.strictEqual(mod.__promptOverridesTestApi__.getState().tab, 'catalog');
  });

  it('setTab() changes the active tab', () => {
    mod.__promptOverridesTestApi__.setTab('activity');
    assert.strictEqual(mod.__promptOverridesTestApi__.getState().tab, 'activity');
  });

  it('renderTabStrip returns a non-empty string', () => {
    const html = mod.__promptOverridesTestApi__.renderTabStrip();
    assert.strictEqual(typeof html, 'string');
    assert.ok(html.length > 0);
  });

  it('getState returns expected shape', () => {
    const s = mod.__promptOverridesTestApi__.getState();
    assert.ok('tab' in s);
    assert.ok('list' in s);
    assert.ok('error' in s);
    assert.ok('editingAgentId' in s);
  });
});
