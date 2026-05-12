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

  it('formats live evidence source labels honestly', () => {
    const label = mod.__aiAgentV2TestApi__.formatEvidenceSourceBadge({
      source_kind: 'live_sqlite',
      paper_count: 184670,
    });
    assert.match(label, /Live SQLite/i);
    assert.match(label, /184,670 papers/);
  });

  it('formats bundled evidence fallback labels honestly', () => {
    const label = mod.__aiAgentV2TestApi__.formatEvidenceSourceBadge({
      source_kind: 'bundled_fallback',
    });
    assert.match(label, /Bundled fallback/i);
    assert.match(label, /184,669 papers/);
  });

  it('formats degraded evidence labels distinctly from bundled fallback', () => {
    const label = mod.__aiAgentV2TestApi__.formatEvidenceSourceBadge({
      source_kind: 'degraded',
    });
    const warning = mod.__aiAgentV2TestApi__.formatEvidenceWarning({
      source_kind: 'degraded',
      degraded_reason: 'OperationalError',
    });
    assert.match(label, /Evidence DB degraded/i);
    assert.match(warning, /OperationalError/);
  });

  it('formats governance drift notes honestly for head of clinic', () => {
    const note = mod.__aiAgentV2TestApi__.formatEvidenceGovernanceNote({
      source_kind: 'live_sqlite',
      paper_count: 184670,
      ds_paper_count: 87654,
      literature_paper_count: 1200,
      updated_at: new Date().toISOString(),
    }, 'clinic.head_of_clinic');
    assert.match(note, /Governance note/i);
    assert.match(note, /184,670/);
    assert.match(note, /87,654/);
  });

  it('formats pending review citation counts for dr ai', () => {
    const note = mod.__aiAgentV2TestApi__.formatEvidenceGovernanceNote({
      source_kind: 'live_sqlite',
      paper_count: 184670,
      pending_review_citation_count: 3,
      unverified_saved_citation_count: 1,
      updated_at: new Date().toISOString(),
    }, 'clinic.dr_ai');
    assert.match(note, /3 draft citations waiting for clinician review/i);
  });

  it('formats degraded governance notes for dr ai', () => {
    const note = mod.__aiAgentV2TestApi__.formatEvidenceGovernanceNote({
      source_kind: 'degraded',
    }, 'clinic.dr_ai');
    assert.match(note, /degraded mode/i);
    assert.match(note, /clinician review/i);
  });

  it('renders evidence status copy in dashboard widgets', () => {
    mod.__aiAgentV2TestApi__.setWidgetData({
      'clinic.dr_ai': {
        pendingDrafts: 2,
        newEvidenceAlerts: 0,
        protocolSuggestions: 3,
        evidenceSource: 'Live SQLite · 184,670 papers',
        evidenceWarning: 'Updated just now',
        evidenceGovernance: 'Citations remain draft-only and clinician-reviewed before final reports.',
      },
    });
    const html = mod.__aiAgentV2TestApi__.renderAgentDashboardWidgets([
      { id: 'clinic.dr_ai', name: 'Dr AI', hired: true },
    ]);
    assert.match(html, /Live SQLite · 184,670 papers/);
    assert.match(html, /Updated just now/);
    assert.match(html, /draft-only and clinician-reviewed/i);
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

describe('__promptHistoryTestApi__ seams', () => {
  beforeEach(() => {
    mod.__promptHistoryTestApi__.reset();
    delete _lsStore.ds_user;
  });

  it('diffLines marks equal, deleted, and added rows', () => {
    const diff = mod.__promptHistoryTestApi__.diffLines('alpha\nbeta', 'alpha\ngamma');
    assert.deepStrictEqual(diff.map(row => row.kind), ['eq', 'del', 'add']);
    assert.strictEqual(diff[1].text, 'beta');
    assert.strictEqual(diff[2].text, 'gamma');
  });

  it('renderSection exposes the history affordance when overrides are seeded', () => {
    mod.__promptHistoryTestApi__.seedOverrides([{ agent_id: 'clinic.reception', name: 'Reception Agent' }]);
    const html = mod.__promptHistoryTestApi__.renderSection([{ id: 'clinic.reception', name: 'Reception Agent' }]);
    assert.match(html, /prompts-history-btn-clinic\.reception/);
    assert.match(html, /History/);
  });

  it('isSuperAdmin respects admin-without-clinic gating', () => {
    _lsStore.ds_user = JSON.stringify({ role: 'admin' });
    assert.strictEqual(mod.__promptHistoryTestApi__.isSuperAdmin(), true);
    _lsStore.ds_user = JSON.stringify({ role: 'admin', clinic_id: 'clinic-1' });
    assert.strictEqual(mod.__promptHistoryTestApi__.isSuperAdmin(), false);
  });

  it('fetchHistory records a load error and exposes it via getState when fetch fails', async () => {
    const items = await mod.__promptHistoryTestApi__.fetchHistory('clinic.reception');
    assert.deepStrictEqual(items, []);
    const state = mod.__promptHistoryTestApi__.getState();
    assert.strictEqual(state.loading, false);
    assert.ok(typeof state.error === 'string' && state.error.length > 0);
    assert.ok(Object.prototype.hasOwnProperty.call(state.byAgent, 'clinic.reception'));
  });
});

describe('__webhookReplayTestApi__ seams', () => {
  beforeEach(() => {
    mod.__webhookReplayTestApi__.reset();
    delete _lsStore.ds_user;
  });

  it('renderCard disables replay until the input looks like a Stripe event id', () => {
    let html = mod.__webhookReplayTestApi__.renderCard();
    assert.match(html, /disabled/);
    mod.__webhookReplayTestApi__.setInput('evt_123');
    html = mod.__webhookReplayTestApi__.renderCard();
    assert.doesNotMatch(html, /data-test="webhook-replay-btn"[^>]*disabled/);
  });

  it('renderTabStrip falls back to catalog tabs for non-super-admins', () => {
    const html = mod.__webhookReplayTestApi__.renderTabStrip();
    assert.match(html, /Catalog/);
    assert.doesNotMatch(html, /Activation/);
  });

  it('isSuperAdmin is true only for cross-clinic admins', () => {
    _lsStore.ds_user = JSON.stringify({ role: 'admin' });
    assert.strictEqual(mod.__webhookReplayTestApi__.isSuperAdmin(), true);
    _lsStore.ds_user = JSON.stringify({ role: 'clinician' });
    assert.strictEqual(mod.__webhookReplayTestApi__.isSuperAdmin(), false);
  });

  it('getState reflects current input and idle replay state', () => {
    mod.__webhookReplayTestApi__.setInput('evt_999');
    const state = mod.__webhookReplayTestApi__.getState();
    assert.deepStrictEqual(state, {
      input: 'evt_999',
      busy: false,
      result: null,
    });
  });
});

describe('__onboardingFunnelTestApi__ seams', () => {
  beforeEach(() => {
    mod.__onboardingFunnelTestApi__.reset();
    delete _lsStore.ds_user;
  });

  it('setWindow clamps invalid and oversized day windows', () => {
    mod.__onboardingFunnelTestApi__.setWindow(0);
    assert.strictEqual(mod.__onboardingFunnelTestApi__.getState().days, 1);
    mod.__onboardingFunnelTestApi__.setWindow(120);
    assert.strictEqual(mod.__onboardingFunnelTestApi__.getState().days, 90);
  });

  it('renderCard shows loading state before funnel data exists', () => {
    const html = mod.__onboardingFunnelTestApi__.renderCard();
    assert.match(html, /Loading onboarding funnel/i);
  });

  it('renderTabStrip and renderOpsSection expose super-admin surfaces when authorised', () => {
    _lsStore.ds_user = JSON.stringify({ role: 'admin' });
    let html = mod.__onboardingFunnelTestApi__.renderTabStrip();
    assert.match(html, /Activation/);
    assert.match(html, /Ops/);
    assert.match(html, /Prompts/);

    html = mod.__onboardingFunnelTestApi__.renderOpsSection([]);
    assert.match(html, /Cross-clinic ops/i);
    assert.match(html, /Replay Stripe webhook event/i);
    assert.match(html, /Onboarding funnel/i);
  });

  it('isSuperAdmin is false for clinic-scoped admins', () => {
    _lsStore.ds_user = JSON.stringify({ role: 'admin', clinic_id: 'clinic-7' });
    assert.strictEqual(mod.__onboardingFunnelTestApi__.isSuperAdmin(), false);
  });

  it('fetchFunnel records network errors and getState exposes the failed window', async () => {
    const payload = await mod.__onboardingFunnelTestApi__.fetchFunnel(14);
    assert.strictEqual(payload, null);
    const state = mod.__onboardingFunnelTestApi__.getState();
    assert.strictEqual(state.loading, false);
    assert.ok(typeof state.error === 'string' && state.error.length > 0);
    assert.strictEqual(state.byDays[14], undefined);
  });
});
