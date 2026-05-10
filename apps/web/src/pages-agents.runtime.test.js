import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { api } from './api.js';

const dom = new JSDOM(
  `<!doctype html>
   <html>
     <body>
       <div id="content"></div>
     </body>
   </html>`,
  { url: 'https://example.test/' },
);

const store = {};
const storage = {
  getItem(key) {
    return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
  },
  setItem(key, value) {
    store[key] = String(value);
  },
  removeItem(key) {
    delete store[key];
  },
  clear() {
    for (const key of Object.keys(store)) delete store[key];
  },
};

globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.location = dom.window.location;
globalThis.localStorage = storage;
globalThis.sessionStorage = storage;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Node = dom.window.Node;
globalThis.requestAnimationFrame = globalThis.requestAnimationFrame || ((cb) => setTimeout(cb, 0));
globalThis.cancelAnimationFrame = globalThis.cancelAnimationFrame || clearTimeout;

const mod = await import('./pages-agents.js');
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function makeJsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function setUser(role, clinicId = null, extra = {}) {
  storage.setItem('ds_user', JSON.stringify({
    role,
    clinic_id: clinicId,
    display_name: 'Dr Demo',
    name: 'Dr Demo',
    ...extra,
  }));
}

const originalApi = {
  listHomeProgramTasks: api.listHomeProgramTasks,
  createHomeProgramTask: api.createHomeProgramTask,
  mutateHomeProgramTask: api.mutateHomeProgramTask,
  deleteHomeProgramTask: api.deleteHomeProgramTask,
  telegramLinkCode: api.telegramLinkCode,
  listPatients: api.listPatients,
  listCourses: api.listCourses,
  listReviewQueue: api.listReviewQueue,
  listAdverseEvents: api.listAdverseEvents,
  aggregateOutcomes: api.aggregateOutcomes,
  getClinicRiskSummary: api.getClinicRiskSummary,
  chatAgent: api.chatAgent,
};

function restoreApiStubs() {
  Object.assign(api, originalApi);
}

test.beforeEach(() => {
  storage.clear();
  document.getElementById('content').innerHTML = '';
  mod.__aiAgentV2TestApi__.reset();
  mod.__hireFlowTestApi__?.reset?.();
  mod.__promptOverridesTestApi__?.reset?.();
  mod.__promptHistoryTestApi__?.reset?.();
  mod.__webhookReplayTestApi__?.reset?.();
  mod.__onboardingFunnelTestApi__?.reset?.();
  restoreApiStubs();
  globalThis.fetch = async () => {
    throw new Error('fetch not stubbed');
  };
  window.confirm = () => true;
  window._selectedPatientId = null;
  window._patientRoster = null;
  window._showNotifToast = undefined;
});

test('canUseAiAgentV2Workspace honors role access from localStorage', () => {
  storage.setItem('ds_user', JSON.stringify({ role: 'patient' }));
  assert.equal(mod.canUseAiAgentV2Workspace(), false);
  storage.setItem('ds_user', JSON.stringify({ role: 'clinician' }));
  assert.equal(mod.canUseAiAgentV2Workspace(), true);
});

test('pgAgentChat renders the restricted notice for patient roles', async () => {
  storage.setItem('ds_user', JSON.stringify({ role: 'patient' }));
  let topbarTitle = '';
  await mod.pgAgentChat((title) => {
    topbarTitle = title;
  });
  assert.equal(topbarTitle, 'AI Agents');
  assert.match(document.getElementById('content').innerHTML, /Clinician workspace only/);
  assert.match(document.getElementById('content').innerHTML, /AI Agent v2 is for authorised clinical staff/);
});

test('super-admin hub runtime covers marketplace activity, ops, prompts, and activation tabs', async () => {
  setUser('admin', null, { package_id: 'enterprise' });
  api.listHomeProgramTasks = async () => ({ items: [] });

  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    const method = String(opts.method || 'GET').toUpperCase();
    if (u.endsWith('/api/v1/agents') && method === 'GET') {
      return makeJsonResponse({
        agents: [
          {
            id: 'clinic.reception',
            name: 'Reception Agent',
            tagline: 'Books, reschedules, runs intake forms.',
            audience: 'clinic',
            hired: true,
            monthly_price_gbp: 99,
            package_required: ['enterprise'],
            tool_allowlist: ['sessions.list', 'sessions.create', 'sessions.cancel'],
          },
        ],
      });
    }
    if (u.includes('/api/v1/agents/runs?')) return makeJsonResponse({ runs: [{ created_at: '2026-05-10T12:00:00Z', actor_id: 'actor-1', agent_id: 'clinic.reception', message_preview: 'Show bookings', reply_preview: '3 sessions today.', context_used: ['sessions.list'], latency_ms: 840, cost_pence: 4, ok: true }] });
    if (u.includes('/api/v1/agents/usage-chart')) return makeJsonResponse({ agents: [{ agent_id: 'clinic.reception', days: [{ date: '2026-05-09', runs: 2, tokens_in: 200, tokens_out: 100, cost_pence: 2 }] }] });
    if (u.includes('/api/v1/agent-admin/patient-activations') && method === 'GET') return makeJsonResponse({ items: [{ clinic_id: 'clinic-oxford', agent_id: 'patient.care_companion', attested_by: 'admin-1', attested_at: '2026-05-10T10:00:00Z' }] });
    if (u.includes('/api/v1/agents/ops/runs')) return makeJsonResponse({ runs: [{ created_at: '2026-05-10T11:30:00Z', clinic_id: 'clinic-oxford', actor_id: 'actor-ops-1', agent_id: 'clinic.reception', message_preview: 'Weekly digest', reply_preview: 'Digest ready.', context_used: ['sessions.list'], latency_ms: 1180, cost_pence: 7, ok: true }] });
    if (u.includes('/api/v1/agents/ops/abuse-signals')) return makeJsonResponse({ signals: [{ clinic_id: 'clinic-oxford', agent_id: 'clinic.reception', runs_in_window: 12, median_multiple: 2.4, severity: 'medium' }] });
    if (u.includes('/api/v1/agents/ops/sla')) return makeJsonResponse({ rollup: [{ agent_id: 'clinic.reception', runs: 142, error_rate: 0.063, p50_ms: 720, p95_ms: 2100, avg_cost_pence: 4.2 }] });
    if (u.includes('/api/v1/onboarding/funnel')) return makeJsonResponse({ since_days: 7, totals: { started: 120, package_selected: 96, stripe_initiated: 60, stripe_skipped: 24, agents_enabled: 70, team_invited: 48, completed: 38, skipped: 12 }, conversion: { started_to_completed: 38 / 120, started_to_skipped: 12 / 120 } });
    if (u.includes('/api/v1/agents/admin/prompt-overrides/clinic.reception/history')) return makeJsonResponse({ history: [{ id: 'hist-1', version: 2, system_prompt: 'Be precise.', created_at: '2026-05-08T09:00:00Z', created_by_id: 'admin-1', is_active: true }] });
    if (u.includes('/api/v1/agents/admin/prompt-overrides') && method === 'GET') return makeJsonResponse({ overrides: [{ id: 'ovr-1', agent_id: 'clinic.reception', clinic_id: null, system_prompt: 'Be precise.', version: 2, enabled: true, created_at: '2026-05-08T09:00:00Z', created_by: 'admin-1' }] });
    throw new Error(`unexpected fetch: ${u}`);
  };

  window._agentBackToHub?.();
  await tick();
  await mod.pgAgentChat(() => {});
  await tick();
  await tick();

  assert.match(document.getElementById('content').innerHTML, /Agent Marketplace/);
  assert.match(document.getElementById('content').innerHTML, /Reception Agent/);

  window._agentMarketplaceSetTab('activity');
  await tick();
  await tick();
  assert.match(document.getElementById('content').innerHTML, /Token &amp; cost trend/);
  window._agentUsageChartSetWindow(7);
  await tick();
  await tick();
  assert.match(document.getElementById('content').innerHTML, /last 7 days/);
  try {
    window._agentActivityExportCsv();
  } catch {}

  window._agentMarketplaceSetTab('ops');
  await tick();
  await tick();
  assert.match(document.getElementById('content').innerHTML, /Cross-clinic ops/);
  assert.match(document.getElementById('content').innerHTML, /Onboarding funnel/);

  window._agentMarketplaceSetTab('prompts');
  await tick();
  await tick();
  assert.match(document.getElementById('content').innerHTML, /Agent prompt overrides/);
  window._agentPromptHistoryToggle('clinic.reception');
  await tick();
  await tick();
  assert.match(document.getElementById('content').innerHTML, /Override history/);

  window._agentMarketplaceSetTab('activation');
  await tick();
  await tick();
  assert.match(document.getElementById('content').innerHTML, /Activate a patient agent/);
});

test('clinician config runtime covers Telegram linking, notification toggles, and backend plus local task lifecycle', async () => {
  setUser('clinician', 'clinic-1', { package_id: 'clinician_pro' });
  const toasts = [];
  window._showNotifToast = (payload) => { toasts.push(payload); };

  let taskCounter = 0;
  let backendTasks = [];
  let telegramFails = false;

  api.listHomeProgramTasks = async () => ({ items: backendTasks });
  api.createHomeProgramTask = async (payload) => {
    if (String(payload.title).includes('Local')) throw new Error('task api offline');
    taskCounter += 1;
    const item = { id: `srv-task-${taskCounter}`, title: payload.title, patient_id: payload.patient_id, due_date: payload.due_date, priority: payload.priority, status: payload.status, agent: payload.agent, source: payload.source, tags: payload.tags, created_at: `2026-05-10T12:0${taskCounter}:00Z`, updated_at: `2026-05-10T12:0${taskCounter}:00Z` };
    backendTasks = backendTasks.concat([item]);
    return { item };
  };
  api.mutateHomeProgramTask = async ({ id, status }) => {
    backendTasks = backendTasks.map((task) => task.id === id ? { ...task, status, updated_at: '2026-05-10T12:30:00Z' } : task);
    return { task: backendTasks.find((task) => task.id === id) };
  };
  api.deleteHomeProgramTask = async (id) => {
    backendTasks = backendTasks.filter((task) => task.id !== id);
    return { ok: true };
  };
  api.telegramLinkCode = async () => {
    if (telegramFails) throw new Error('bot offline');
    return { code: 'Q7XZ91', instructions: 'Open @DeepSynapsOpsBot and send LINK Q7XZ91' };
  };

  await mod.pgAgentChat(() => {});
  await tick();
  await tick();
  window._agentOpenConfig();
  await tick();

  assert.match(document.getElementById('content').innerHTML, /Telegram Connection/);
  await window._agentConnectTelegram();
  assert.match(document.getElementById('content').innerHTML, /Q7XZ91/);
  assert.match(document.getElementById('content').innerHTML, /DeepSynapsOpsBot/);

  window._agentConfirmTelegram();
  await tick();
  assert.equal(localStorage.getItem('ds_agent_tg_state'), 'pending');
  assert.equal(toasts.at(-1)?.title, 'Reminder saved');

  window._agentToggleTgNotif('digest', true);
  assert.equal(JSON.parse(localStorage.getItem('ds_agent_tg_notifs') || '{}').digest, true);

  window._agentDisconnectTelegram();
  await tick();
  assert.equal(localStorage.getItem('ds_agent_tg_state'), null);
  assert.equal(toasts.at(-1)?.title, 'Reminder cleared');

  telegramFails = true;
  await window._agentConnectTelegram();
  assert.match(document.getElementById('content').innerHTML, /Failed: bot offline/);

  document.getElementById('task-title').value = 'Backend follow-up';
  document.getElementById('task-patient').value = 'pt-7';
  document.getElementById('task-due').value = '2026-05-15';
  await window._agentAddTask();
  await tick();
  assert.equal(toasts.at(-1)?.title, 'Task created');
  await window._agentCompleteTask(backendTasks[0]?.id);
  await tick();
  assert.equal(toasts.at(-1)?.title, 'Done');
  await window._agentDeleteTask(backendTasks[0]?.id);
  await tick();

  document.getElementById('task-title').value = 'Local fallback task';
  document.getElementById('task-patient').value = 'pt-8';
  document.getElementById('task-due').value = '2026-05-20';
  await window._agentAddTask();
  await tick();
  assert.equal(toasts.at(-1)?.title, 'Task saved locally');
});

test('clinician marketplace modal runtime covers pending approval, approve execution, and reject error states', async () => {
  setUser('clinician', 'clinic-2', { package_id: 'clinician_pro' });
  api.listHomeProgramTasks = async () => ({ items: [] });

  const runBodies = [];
  let rejectShouldFail = false;

  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    const method = String(opts.method || 'GET').toUpperCase();
    if (u.endsWith('/api/v1/agents') && method === 'GET') {
      return makeJsonResponse({
        agents: [
          {
            id: 'clinic.reception',
            name: 'Reception Agent',
            tagline: 'Books, reschedules, runs intake forms.',
            audience: 'clinic',
            hired: true,
            monthly_price_gbp: 99,
            package_required: ['clinician_pro'],
            tool_allowlist: ['sessions.list', 'sessions.create'],
          },
        ],
      });
    }
    if (u.includes('/api/v1/agents/runs?')) return makeJsonResponse({ runs: [] });
    if (u.includes('/api/v1/agents/usage-chart')) return makeJsonResponse({ agents: [] });
    if (u.includes('/api/v1/agents/clinic.reception/run') && method === 'POST') {
      const body = JSON.parse(String(opts.body || '{}'));
      runBodies.push(body);
      if (body.message === 'approve' && body.confirmed_tool_call_id === 'call-123') {
        return makeJsonResponse({ agent_id: 'clinic.reception', reply: 'Booked and confirmed.', context_used: ['sessions.list', 'patients.search'], safety_footer: 'Decision-support only — not autonomous diagnosis.', tool_call_executed: { tool_id: 'sessions.create', ok: true, result: 'Booked patient p1 on 2026-05-15 14:00.', audit_id: 'audit-123' } });
      }
      if (body.message === 'reject') {
        if (rejectShouldFail) throw new Error('Reject transport failed');
        return makeJsonResponse({ ok: true });
      }
      return makeJsonResponse({ agent_id: 'clinic.reception', reply: 'I can draft that booking for you.', context_used: ['sessions.list', 'patients.search'], safety_footer: 'Decision-support only — not autonomous diagnosis.', pending_tool_call: { call_id: 'call-123', tool_id: 'sessions.create', args: { patient_id: 'p1', starts_at: '2026-05-15T14:00:00Z' }, summary: 'Book demo patient p1 on May 15 14:00 for 60 min', expires_at: '2026-05-15T13:55:00Z' } });
    }
    throw new Error(`unexpected fetch: ${u}`);
  };

  window._agentBackToHub?.();
  await tick();
  await mod.pgAgentChat(() => {});
  await tick();
  await tick();

  window._agentMarketplaceTry('clinic.reception');
  await tick();
  document.getElementById('agent-marketplace-input').value = 'Book follow-up tomorrow afternoon';
  await window._agentMarketplaceModalSend();
  await tick();
  await tick();
  assert.match(document.getElementById('content').innerHTML, /Action requires your approval/);
  assert.match(document.getElementById('content').innerHTML, /Grounded in:/);
  assert.equal(runBodies[0]?.message, 'Book follow-up tomorrow afternoon');

  await window._agentApproveToolCall('call-123', 'clinic.reception');
  await tick();
  await tick();
  assert.match(document.getElementById('content').innerHTML, /Booked and confirmed/);
  assert.match(document.getElementById('content').innerHTML, /✓ Done/);
  assert.equal(runBodies[1]?.confirmed_tool_call_id, 'call-123');

  document.getElementById('agent-marketplace-input').value = 'Book another session';
  await window._agentMarketplaceModalSend();
  await tick();
  await tick();
  rejectShouldFail = true;
  await window._agentRejectToolCall('call-123', 'clinic.reception');
  await tick();
  await tick();
  assert.match(document.getElementById('content').innerHTML, /Cancelled\./);
  assert.match(document.getElementById('content').innerHTML, /Reject transport failed/);
});
