// Per-clinician AI Agent hire-flow — frontend rendering tests.
//
// Exercises the test seam exposed by `pages-agents.js` so we can assert
// what the hub renders without booting a real DOM. Companion to the
// backend pytest file `apps/api/tests/test_agents_hire_flow.py`.

import test from 'node:test';
import assert from 'node:assert/strict';

function installBrowserStubs() {
  if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
  // Node 25 ships an experimental localStorage that throws when accessed
  // outside a real WebStorage context. Replace it unconditionally with an
  // in-memory polyfill so module evaluation succeeds.
  const lsStore = {};
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: {
      getItem(k) { return Object.prototype.hasOwnProperty.call(lsStore, k) ? lsStore[k] : null; },
      setItem(k, v) { lsStore[k] = String(v); },
      removeItem(k) { delete lsStore[k]; },
    },
  });
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    writable: true,
    value: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  });
  if (typeof globalThis.document === 'undefined') {
    globalThis.document = {
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => ({ style: {}, addEventListener() {}, appendChild() {} }),
      body: { appendChild() {} },
    };
  }
}

installBrowserStubs();

const mod = await import('./pages-agents.js');
const api = mod.__hireFlowTestApi__;

const ACTOR_AGENT = {
  id: 'clinic.reception',
  name: 'Reception Agent',
  tagline: 'Triages calls and books sessions.',
  audience: 'clinic',
  role_required: 'clinician',
  package_required: [],
  tool_allowlist: ['sessions.list', 'sessions.create'],
  monthly_price_gbp: 0,
  tags: [],
  hired: false,
  last_used_at: null,
};


test.beforeEach(() => api.reset());


test('hired-agents rail is empty when no agent is hired', () => {
  api.setAgents([{ ...ACTOR_AGENT, hired: false }]);
  const html = api.renderHiredRail();
  assert.equal(html, '', 'rail should not render when no hires');
});


test('hired-agents rail surfaces hired agents with their tagline', () => {
  api.setAgents([
    { ...ACTOR_AGENT, hired: true, last_used_at: null },
    { ...ACTOR_AGENT, id: 'clinic.reporting', name: 'Reporting Agent', hired: false },
  ]);
  const html = api.renderHiredRail();
  assert.match(html, /Your hired agents/);
  assert.match(html, /Reception Agent/);
  assert.match(html, /Triages calls and books sessions\./);
  assert.doesNotMatch(html, /Reporting Agent/, 'unhired agents must not appear in the rail');
});


test('hired-agents rail shows recency hint when last_used_at is set', () => {
  const recent = new Date(Date.now() - 5 * 60_000).toISOString(); // 5 minutes ago
  api.setAgents([{ ...ACTOR_AGENT, hired: true, last_used_at: recent }]);
  const html = api.renderHiredRail();
  assert.match(html, /used\s+\d+m ago/);
});


test('hired-agents rail handles never-used hires honestly', () => {
  api.setAgents([{ ...ACTOR_AGENT, hired: true, last_used_at: null }]);
  const html = api.renderHiredRail();
  assert.match(html, /not used yet/);
});


test('detail drawer renders nothing when no agent is selected', () => {
  assert.equal(api.renderDetailDrawer(), '');
});


test('detail drawer surfaces tools as plain English', () => {
  api.setDrawerAgent({
    ...ACTOR_AGENT,
    tool_allowlist: ['sessions.list', 'sessions.create', 'patients.list'],
  });
  const html = api.renderDetailDrawer();
  assert.match(html, /Sees your scheduled sessions/);
  assert.match(html, /Books new sessions \(only after you approve\)/);
  assert.match(html, /Sees your patient list/);
});


test('detail drawer states what the agent will NOT do', () => {
  api.setDrawerAgent({ ...ACTOR_AGENT });
  const html = api.renderDetailDrawer();
  assert.match(html, /What this agent will NOT do/);
  assert.match(html, /Take any clinical action without your explicit confirmation/);
  assert.match(html, /Diagnose, prescribe/);
});


test('detail drawer flips primary CTA between Hire and Open chat', () => {
  api.setDrawerAgent({ ...ACTOR_AGENT, hired: false });
  let html = api.renderDetailDrawer();
  assert.match(html, /Hire</);
  assert.match(html, /Try once</);
  assert.doesNotMatch(html, /Open chat</);

  api.setDrawerAgent({ ...ACTOR_AGENT, hired: true });
  html = api.renderDetailDrawer();
  assert.match(html, /Open chat</);
  assert.match(html, /Pause</);
  assert.doesNotMatch(html, /Hire</, 'already-hired agent must not re-offer Hire');
});


test('plain-English mapping falls back to raw id for unknown tools', () => {
  assert.equal(api.formatToolPlainEnglish('sessions.list'), 'Sees your scheduled sessions');
  assert.equal(
    api.formatToolPlainEnglish('something.unknown'),
    'something.unknown',
    'unknown tool must show its raw id rather than disappearing',
  );
});


test('relative timestamp formatter handles the common ranges', () => {
  const now = Date.now();
  assert.equal(
    api.formatRelativeTimestamp(new Date(now - 30_000).toISOString()),
    'just now',
  );
  assert.match(api.formatRelativeTimestamp(new Date(now - 5 * 60_000).toISOString()), /5m ago/);
  assert.match(api.formatRelativeTimestamp(new Date(now - 3 * 3_600_000).toISOString()), /3h ago/);
  assert.match(api.formatRelativeTimestamp(new Date(now - 4 * 86_400_000).toISOString()), /4d ago/);
});
