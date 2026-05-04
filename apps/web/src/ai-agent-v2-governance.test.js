// AI Agent v2 — governance copy, permission matrix, demo banner, patient context.
import test from 'node:test';
import assert from 'node:assert/strict';

function installLocalStorageStub(initial = {}) {
  const store = { ...initial };
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: {
      getItem(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
      setItem(k, v) { store[k] = String(v); },
      removeItem(k) { delete store[k]; },
      _store: store,
    },
  });
}

if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis;
}
if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({ style: {}, addEventListener() {}, appendChild() {} }),
    body: { appendChild() {} },
  };
}
if (typeof globalThis.sessionStorage === 'undefined') {
  globalThis.sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
}

globalThis.fetch = async () => {
  throw new Error('fetch not stubbed');
};

installLocalStorageStub({
  ds_user: JSON.stringify({ role: 'clinician', clinic_id: 'clinic-demo', display_name: 'Dr Test' }),
});

const mod = await import('./pages-agents.js');
const {
  AI_AGENT_V2_GOVERNANCE_COPY,
  canUseAiAgentV2Workspace,
  __aiAgentV2TestApi__,
} = mod;

const DEMO_AGENTS = [
  {
    id: 'clinic.reception',
    name: 'Reception Agent',
    audience: 'clinic',
    role_required: 'clinician',
    tool_allowlist: ['sessions.list', 'sessions.create', 'patients.search'],
    monthly_price_gbp: 99,
    tagline: 'x',
    package_required: [],
    tags: [],
  },
];

test('required governance copy is exported verbatim', () => {
  assert.ok(AI_AGENT_V2_GOVERNANCE_COPY.includes('clinician-reviewed draft support'));
  assert.ok(AI_AGENT_V2_GOVERNANCE_COPY.includes('do not diagnose'));
});

test('non-clinical roles cannot use workspace', () => {
  installLocalStorageStub({ ds_user: JSON.stringify({ role: 'patient' }) });
  assert.equal(canUseAiAgentV2Workspace(), false);
  installLocalStorageStub({ ds_user: JSON.stringify({ role: 'guest' }) });
  assert.equal(canUseAiAgentV2Workspace(), false);
});

test('clinical roles can use workspace', () => {
  installLocalStorageStub({ ds_user: JSON.stringify({ role: 'clinician' }) });
  assert.equal(canUseAiAgentV2Workspace(), true);
});

test('governance banner HTML contains governance copy', () => {
  __aiAgentV2TestApi__.reset();
  const html = __aiAgentV2TestApi__.renderGovernanceBanner();
  assert.match(html, /data-test="ai-agent-v2-governance"/);
  assert.ok(html.includes(AI_AGENT_V2_GOVERNANCE_COPY));
});

test('permission matrix lists agents and write-tool column', () => {
  __aiAgentV2TestApi__.reset();
  const html = __aiAgentV2TestApi__.renderPermissionMatrix(DEMO_AGENTS);
  assert.match(html, /data-test="ai-agent-v2-permission-matrix"/);
  assert.match(html, /Marketplace agent permissions/);
  assert.match(html, /Reception Agent/);
  assert.match(html, /sessions\.create/);
});

test('module shortcuts are navigation-only and include key routes', () => {
  __aiAgentV2TestApi__.reset();
  const html = __aiAgentV2TestApi__.renderModuleShortcuts();
  assert.match(html, /data-test="ai-agent-v2-module-links"/);
  assert.match(html, /window\._nav\('protocol-studio'\)/);
  assert.match(html, /window\._nav\('deeptwin'\)/);
  assert.match(html, /Navigation only/);
});

test('patient context panel marks missing patient when none selected', () => {
  __aiAgentV2TestApi__.reset();
  globalThis.window._selectedPatientId = undefined;
  try {
    sessionStorage.removeItem('ds_pat_selected_id');
  } catch { /* ignore */ }
  const html = __aiAgentV2TestApi__.renderPatientContextPanel();
  assert.match(html, /data-ai-agent-v2-patient-missing="1"/);
  assert.match(html, /No patient selected/);
});

test('local audit panel labels browser-only scope', () => {
  __aiAgentV2TestApi__.reset();
  const html = __aiAgentV2TestApi__.renderLocalAuditPanel();
  assert.match(html, /data-test="ai-agent-v2-local-audit"/);
  assert.match(html, /this browser/);
});
