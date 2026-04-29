import { api } from './api.js';

// ── State ────────────────────────────────────────────────────────────────────
let _agentView = 'hub'; // 'hub' | 'chat-clinician' | 'chat-patient' | 'config'
let _agentBusy = false;
let _agentProvider = localStorage.getItem('ds_agent_provider') || 'glm-free';
let _agentOAKey = localStorage.getItem('ds_agent_oa_key') || '';
const PROVIDERS = [
  { id: 'glm-free', label: 'GLM-4.5 Air (Free)', desc: 'Free tier via OpenRouter — no API key needed. Works with OpenClaw.', icon: '🆓' },
  { id: 'anthropic', label: 'Claude', desc: 'System key. No config needed.', icon: '🧠' },
  { id: 'openai', label: 'GPT-4o', desc: 'Requires your own API key.', icon: '✦' },
];
let _taskFilter = 'all';
let _taskSort = 'due'; // 'due' | 'priority' | 'status' | 'created'
let _skillSort = 'default'; // 'default' | 'name' | 'name-desc' | 'category'
let _configAgent = 'clinician';
let _activeSkill = null;
let _tasksCache = [];
let _tasksApiWarned = false;
let _tasksRefreshing = false;
let _tasksLoaded = false;

function _agentTelegramState() {
  try {
    return localStorage.getItem('ds_agent_tg_state') || 'idle';
  } catch {
    return 'idle';
  }
}

// ── Data helpers ─────────────────────────────────────────────────────────────
function _loadHistory(agent) {
  try { return JSON.parse(localStorage.getItem(`ds_agent_history_${agent}`) || '[]'); } catch { return []; }
}
function _saveHistory(agent, msgs) {
  try { localStorage.setItem(`ds_agent_history_${agent}`, JSON.stringify(msgs.slice(-50))); } catch {}
}
function _tasksFallbackNotice() {
  if (_tasksApiWarned) return;
  _tasksApiWarned = true;
  try { console.debug('[agent-tasks] API unavailable'); } catch {}
}
function _shapeAgentTask(r) {
  if (!r || typeof r !== 'object') return null;
  return {
    id: r.id,
    title: r.title,
    status: r.status || 'pending',
    agent: r.agent || 'clinician',
    patient: r.patient_id || r.patient || '',
    due: r.due_date || r.due || '',
    priority: r.priority || 'normal',
    source: r.source || 'agent',
    tags: Array.isArray(r.tags) ? r.tags.slice() : [],
    createdAt: r.created_at || r.createdAt,
    updatedAt: r.updated_at || r.updatedAt,
    completedAt: r.completed_at || r.completedAt || null,
    _backend: !String(r.id || '').startsWith('t_'),
  };
}
function _isAgentTaskRecord(r) {
  if (!r) return false;
  if (r.source === 'agent') return true;
  if (Array.isArray(r.tags) && r.tags.includes('agent')) return true;
  return false;
}
function _mirrorTasksToLocal() {
  try { localStorage.setItem('ds_agent_tasks', JSON.stringify(_tasksCache.slice(-200))); } catch {}
}
function _dispatchTaskEvent(action, task) {
  try {
    window.dispatchEvent(new CustomEvent('ds:home-task-updated', {
      detail: { taskId: task?.id, patientId: task?.patient || task?.patient_id || null, action, source: 'agent' },
    }));
  } catch {}
}
async function _refreshTasks() {
  if (_tasksRefreshing) return _tasksCache;
  _tasksRefreshing = true;
  try {
    try {
      const res = await api.listHomeProgramTasks({ source: 'agent' });
      const items = (res?.items || []).filter(_isAgentTaskRecord);
      _tasksCache = items.map(_shapeAgentTask).filter(Boolean);
      _mirrorTasksToLocal();
      _tasksLoaded = true;
      return _tasksCache;
    } catch {
      _tasksFallbackNotice();
      if (!_tasksCache.length) {
        try { _tasksCache = JSON.parse(localStorage.getItem('ds_agent_tasks') || '[]') || []; }
        catch { _tasksCache = []; }
      }
      _tasksLoaded = true;
      return _tasksCache;
    }
  } finally {
    _tasksRefreshing = false;
  }
}
function _loadTasks() {
  if (_tasksCache.length) return _tasksCache;
  try {
    const stored = JSON.parse(localStorage.getItem('ds_agent_tasks') || '[]');
    if (Array.isArray(stored)) _tasksCache = stored;
  } catch { _tasksCache = []; }
  return _tasksCache;
}
function _saveTasks(tasks) {
  _tasksCache = Array.isArray(tasks) ? tasks : [];
  _mirrorTasksToLocal();
}
async function _addTask(task) {
  const now = new Date().toISOString();
  const localEntry = {
    ...task,
    id: 't_' + Date.now(),
    status: task.status || 'pending',
    agent: task.agent || 'clinician',
    source: 'agent',
    tags: Array.isArray(task.tags) ? Array.from(new Set([...task.tags, 'agent'])) : ['agent'],
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    _backend: false,
  };
  let saved = null;
  try {
    const payload = {
      title: task.title,
      status: localEntry.status,
      patient_id: task.patient || '',
      due_date: task.due || '',
      source: 'agent',
      agent: localEntry.agent,
      priority: task.priority || 'normal',
      tags: localEntry.tags,
    };
    const res = await api.createHomeProgramTask(payload);
    const rec = res?.item || res?.task || res;
    saved = _shapeAgentTask(rec);
  } catch {
    _tasksFallbackNotice();
  }
  const entry = saved || localEntry;
  _tasksCache.push(entry);
  _mirrorTasksToLocal();
  _logActivity('task_created', entry.agent || 'clinician', entry.title);
  _dispatchTaskEvent('assigned', entry);
  return entry;
}
async function _updateTaskStatus(id, status) {
  const now = new Date().toISOString();
  const idx = _tasksCache.findIndex(x => x.id === id);
  const existing = idx >= 0 ? _tasksCache[idx] : null;
  const isLocalOnly = String(id).startsWith('t_') || !existing?._backend;
  let updated = existing ? { ...existing, status, updatedAt: now } : null;
  if (updated && status === 'done') updated.completedAt = now;

  if (!isLocalOnly) {
    try {
      const res = typeof api.mutateHomeProgramTask === 'function'
        ? await api.mutateHomeProgramTask({ id, status, serverTaskId: existing?.serverTaskId || id })
        : await api.upsertHomeProgramTask({ id, status });
      const rec = res?.task || res?.item || res;
      const shaped = _shapeAgentTask(rec);
      if (shaped) updated = { ...updated, ...shaped };
    } catch {
      _tasksFallbackNotice();
    }
  }

  if (idx >= 0 && updated) _tasksCache[idx] = updated;
  _mirrorTasksToLocal();
  if (status === 'done') _logActivity('task_completed', updated?.agent || 'clinician', updated?.title || id);
  if (updated) _dispatchTaskEvent('status', updated);
  return updated;
}
async function _deleteTask(id) {
  const idx = _tasksCache.findIndex(x => x.id === id);
  const existing = idx >= 0 ? _tasksCache[idx] : null;
  const isLocalOnly = String(id).startsWith('t_') || !existing?._backend;
  if (!isLocalOnly) {
    try { await api.deleteHomeProgramTask(id); }
    catch { _tasksFallbackNotice(); }
  }
  if (idx >= 0) _tasksCache.splice(idx, 1);
  _mirrorTasksToLocal();
  if (existing) _dispatchTaskEvent('delete', existing);
}
function _loadActivity() {
  try { return JSON.parse(localStorage.getItem('ds_agent_activity') || '[]'); } catch { return []; }
}
function _logActivity(type, agent, summary) {
  const log = _loadActivity();
  const entry = { type, agent, summary, ts: new Date().toISOString() };
  log.unshift(entry);
  localStorage.setItem('ds_agent_activity', JSON.stringify(log.slice(0, 100)));
  try { window.dispatchEvent(new CustomEvent('ds:agent-activity', { detail: entry })); } catch {}
}

// ── Skills (receptionist-style) ──────────────────────────────────────────────
// SKILL_CATEGORIES and CLINICIAN_SKILLS are the bundled defaults — they
// double as the offline / API-down fallback when /api/v1/agent-skills
// returns empty or fails. The live arrays (`SKILL_CATEGORIES`,
// `CLINICIAN_SKILLS`) are reassigned in `_hydrateAgentSkills` below once the
// server responds. PATIENT_SKILLS is unchanged — only the clinician catalogue
// is server-managed in this PR.
const SKILL_CATEGORIES_DEFAULT = [
  { id: 'launch', label: 'Go-Live Team', icon: '🎯' },
  { id: 'comms', label: 'Communication', icon: '💬' },
  { id: 'clinical', label: 'Clinical', icon: '🩺' },
  { id: 'admin', label: 'Administration', icon: '📋' },
  { id: 'reports', label: 'Reports & Data', icon: '📊' },
];

const CLINICIAN_SKILLS_DEFAULT = [
  // Go-live team
  { id: 'launch-lead',      cat: 'launch',   icon: '🎯', label: 'Go-Live Lead',        desc: 'Coordinate one launch task from intake to release decision', prompt: 'Act as the DeepSynaps Go-Live Lead Agent. Keep scope narrow, choose one highest-value launch task, assign one implementation owner and one QA verifier, and report status using: task summary, scope, owner, verifier, acceptance criteria, current status, blockers. Refuse broad feature expansion, refactors, or unverified completion.' },
  { id: 'launch-implement', cat: 'launch',   icon: '🛠️', label: 'Go-Live Implementer', desc: 'Execute a narrowly scoped launch task and report exact evidence', prompt: 'Act as the DeepSynaps Go-Live Implementation Agent. Change only the owned files needed for the task, keep diffs minimal, run the smallest relevant verification commands, and report: changed files, commands run, results, unresolved risks. Surface blockers immediately and do not expand scope.' },
  { id: 'launch-qa',        cat: 'launch',   icon: '🔎', label: 'Go-Live QA Reviewer',  desc: 'Review a launch diff independently and issue a go or no-go', prompt: 'Act as the DeepSynaps Go-Live QA Agent. Review the proposed change independently. Focus on regressions, weak assumptions, missing tests, unsafe wording, and launch risk. Return findings ordered by severity, residual risks, and a release recommendation of GO, GO_WITH_CONCERNS, or NO_GO.' },
  { id: 'launch-release',   cat: 'launch',   icon: '📦', label: 'Release Brief',        desc: 'Prepare the deploy and rollback brief for the human release owner', prompt: 'Act as the DeepSynaps Release Briefing Agent. Summarize what is changing, what was verified, the QA recommendation, deploy prerequisites, rollback steps, and what the human release owner must approve. Do not claim deployment authority.' },

  // Communication
  { id: 'msg-patient',    cat: 'comms',    icon: '💬', label: 'Message Patient',       desc: 'Draft and send a message to a patient', prompt: 'I need to send a message to a patient. Help me draft a professional, caring message. Ask me which patient and what the message is about.' },
  { id: 'call-patient',   cat: 'comms',    icon: '📞', label: 'Call Patient',           desc: 'Prepare talking points for a patient call', prompt: 'I need to call a patient. Help me prepare talking points and key items to discuss. Ask me which patient and the purpose of the call.' },
  { id: 'email-report',   cat: 'comms',    icon: '📧', label: 'Email Report',           desc: 'Email a clinical report or summary', prompt: 'I want to email a report or clinical summary. Help me draft the email with the key findings. Ask me which patient and what type of report.' },
  { id: 'remind-patient', cat: 'comms',    icon: '🔔', label: 'Send Reminder',         desc: 'Send appointment or homework reminder', prompt: 'Draft an appointment reminder for a patient. Make it professional and reassuring. Ask me which patient and when their appointment is.' },
  { id: 'tg-notify',      cat: 'comms',    icon: '✈️', label: 'Telegram Notify',       desc: 'Send a notification via Telegram', prompt: 'I want to send a Telegram notification. What should I send and to whom? Help me compose the message.' },

  // Clinical
  { id: 'check-report',   cat: 'clinical', icon: '📄', label: 'Check Report',          desc: 'Review a patient report or assessment', prompt: 'I need to review a patient report. Give me a summary of their latest assessment scores, treatment progress, and any flags. Ask me which patient.' },
  { id: 'review-ae',      cat: 'clinical', icon: '⚠️', label: 'Review Adverse Event', desc: 'Document and assess an adverse event', prompt: 'Help me document an adverse event. Walk me through the standard reporting process: what happened, severity, causality, and action taken. Ask me about the patient and event.' },
  { id: 'protocol-rec',   cat: 'clinical', icon: '🧠', label: 'Protocol Advice',       desc: 'Get protocol recommendations', prompt: 'I need help choosing or adjusting a treatment protocol. Consider the evidence base, patient history, and best practices. Ask me about the patient and their condition.' },
  { id: 'check-outcomes',  cat: 'clinical', icon: '📈', label: 'Check Outcomes',        desc: 'Review patient outcome trends', prompt: 'Show me the outcome trends for a patient. Compare baseline to latest scores, calculate improvement percentage, and flag any concerns. Ask me which patient.' },
  { id: 'session-prep',   cat: 'clinical', icon: '⚡', label: 'Prep Session',          desc: 'Prepare for the next treatment session', prompt: 'Help me prepare for an upcoming treatment session. Review the patient history, last session notes, and any adjustments needed. Ask me which patient and session number.' },

  // Administration
  { id: 'schedule-apt',   cat: 'admin',    icon: '📅', label: 'Schedule Appointment',  desc: 'Schedule or reschedule an appointment', prompt: 'I need to schedule an appointment. Help me find a suitable time and draft a confirmation. Ask me which patient, preferred time, and appointment type.' },
  { id: 'check-queue',    cat: 'admin',    icon: '📋', label: 'Check Review Queue',    desc: 'See what needs approval', prompt: 'What items are currently in my review queue? Summarise pending approvals, reviews, and any overdue items that need my attention.' },
  { id: 'patient-intake',  cat: 'admin',    icon: '👤', label: 'Patient Intake',        desc: 'Help with new patient onboarding', prompt: 'I have a new patient to onboard. Walk me through the intake process: demographics, medical history, consent, and initial assessment scheduling. Ask me about the patient.' },
  { id: 'daily-summary',  cat: 'admin',    icon: '☀️', label: 'Daily Summary',         desc: 'Get today\'s clinic overview', prompt: 'Give me a complete daily summary: how many patients today, pending reviews, any overdue tasks, adverse events to follow up on, and what I should prioritise.' },
  { id: 'manage-tasks',   cat: 'admin',    icon: '✅', label: 'Manage Tasks',          desc: 'View and manage clinic tasks', prompt: 'Show me all my current tasks. Which are overdue? What should I tackle first? Help me prioritise and update statuses.' },

  // Reports
  { id: 'gen-report',     cat: 'reports',  icon: '📝', label: 'Generate Report',       desc: 'Generate a clinical or admin report', prompt: 'I need to generate a report. What type? Options: treatment summary, outcome report, adverse event log, clinic utilisation, or patient progress. Ask me what I need.' },
  { id: 'export-data',    cat: 'reports',  icon: '📦', label: 'Export Data',            desc: 'Export clinical data for research', prompt: 'I need to export clinical data. Help me select the right data domains, de-identification method, and export format. Walk me through the process.' },
  { id: 'clinic-stats',   cat: 'reports',  icon: '📊', label: 'Clinic Statistics',     desc: 'View clinic performance metrics', prompt: 'Give me the key clinic statistics: patient volume, treatment completion rates, average improvement scores, revenue trends, and any KPIs that need attention.' },
  { id: 'compare-protocols', cat: 'reports', icon: '🔬', label: 'Compare Protocols', desc: 'Compare protocol effectiveness', prompt: 'Help me compare treatment protocols across my patient cohort. Which protocols have the best response rates? Any patterns by condition or demographics?' },
];

// Live skill catalogue — initialised to the bundled defaults, replaced by
// the server response in `_hydrateAgentSkills`. Existing render code reads
// SKILL_CATEGORIES / CLINICIAN_SKILLS, so reassigning these via `let`
// transparently switches the source of truth.
let SKILL_CATEGORIES = SKILL_CATEGORIES_DEFAULT.slice();
let CLINICIAN_SKILLS = CLINICIAN_SKILLS_DEFAULT.slice();
let _agentSkillsHydrated = false;
let _agentSkillsHydrating = false;

// Map a server AgentSkillOut into the in-memory shape the render code expects.
function _mapServerSkill(row) {
  const payload = (row && row.run_payload) || {};
  return {
    id: row.id,
    cat: row.category_id,
    icon: row.icon || '',
    label: row.label || '',
    desc: row.description || '',
    prompt: typeof payload.prompt === 'string' ? payload.prompt : '',
  };
}

// Derive the SKILL_CATEGORIES list from the server skills. Preserves the
// bundled order/labels for known categories; appends any new server-defined
// category at the end with a default label.
function _deriveCategories(skills) {
  const seen = new Set(skills.map(s => s.cat).filter(Boolean));
  const known = SKILL_CATEGORIES_DEFAULT.filter(c => seen.has(c.id));
  const knownIds = new Set(known.map(c => c.id));
  const extra = [];
  for (const s of skills) {
    if (s.cat && !knownIds.has(s.cat)) {
      knownIds.add(s.cat);
      extra.push({ id: s.cat, label: s.cat, icon: '' });
    }
  }
  return known.concat(extra);
}

async function _hydrateAgentSkills() {
  if (_agentSkillsHydrated || _agentSkillsHydrating) return;
  _agentSkillsHydrating = true;
  try {
    const resp = await api.listAgentSkills();
    const items = Array.isArray(resp && resp.items) ? resp.items : [];
    if (items.length > 0) {
      CLINICIAN_SKILLS = items.map(_mapServerSkill).filter(s => s.id && s.label);
      SKILL_CATEGORIES = _deriveCategories(CLINICIAN_SKILLS);
    }
    // Empty / 404 → leave the bundled defaults in place (already populated).
    _agentSkillsHydrated = true;
    // Re-render so the hub picks up the freshly hydrated catalogue.
    if (_agentView === 'hub' || _agentView === 'chat-clinician') {
      try { pgAgentChat(_lastSetTopbar); } catch {}
    }
  } catch (_) {
    // Network failure / 401 / 403 → keep bundled defaults so the page stays
    // usable. The next mount will retry hydration.
    try { console.debug('[agent-skills] using bundled defaults (API unavailable)'); } catch {}
  } finally {
    _agentSkillsHydrating = false;
  }
}

const PATIENT_SKILLS = [
  { id: 'my-progress',    cat: 'clinical', icon: '📈', label: 'My Progress',           desc: 'See how your treatment is going', prompt: 'How is my treatment going? Show me my progress, latest scores, and what to expect next.' },
  { id: 'next-session',   cat: 'clinical', icon: '📅', label: 'Next Session',          desc: 'Details about your next appointment', prompt: 'When is my next session? What should I expect and how should I prepare?' },
  { id: 'side-effects',   cat: 'clinical', icon: '💊', label: 'Side Effects',          desc: 'Learn about potential side effects', prompt: 'What side effects should I watch for with my current treatment? When should I contact my clinic?' },
  { id: 'my-homework',    cat: 'admin',    icon: '📝', label: 'My Homework',           desc: 'Check your homework assignments', prompt: 'What homework or exercises do I need to complete before my next visit? Show me what is pending.' },
  { id: 'my-condition',   cat: 'clinical', icon: '🧠', label: 'My Condition',          desc: 'Understand your condition', prompt: 'Explain my condition and how my treatment protocol works in simple terms I can understand.' },
  { id: 'contact-clinic', cat: 'comms',    icon: '📞', label: 'Contact Clinic',        desc: 'Get help reaching your clinic', prompt: 'How can I reach my clinic? I need to speak with someone about my care.' },
  { id: 'msg-clinician',  cat: 'comms',    icon: '💬', label: 'Message Clinician',     desc: 'Send a message to your doctor', prompt: 'I want to send a message to my clinician. Help me write it clearly. Ask me what I want to say.' },
  { id: 'my-reports',     cat: 'reports',  icon: '📄', label: 'My Reports',            desc: 'View your clinical reports', prompt: 'Show me my latest clinical reports and explain what the results mean in plain language.' },
];

// ── Helpers ──────────────────────────────────────────────────────────────────
const _esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const _ago = ts => { const d=Date.now()-new Date(ts).getTime(); const m=Math.floor(d/60000); if(m<1) return 'just now'; if(m<60) return m+'m ago'; const h=Math.floor(m/60); if(h<24) return h+'h ago'; return Math.floor(h/24)+'d ago'; };

function _formatAgentText(text) {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.08);padding:1px 5px;border-radius:4px;font-size:0.9em">$1</code>')
    .replace(/\n/g, '<br>');
}

function _scrollAgentToBottom() {
  requestAnimationFrame(() => { const el = document.getElementById('agent-messages'); if (el) el.scrollTop = el.scrollHeight; });
}

function _renderMsg(msg, agent) {
  const isUser = msg.role === 'user';
  const label = agent === 'patient' ? 'Patient Agent' : 'Clinic Agent';
  const timeStr = msg.ts ? new Date(msg.ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';
  return `<div class="agent-msg ${isUser ? 'agent-msg--user' : 'agent-msg--agent'}">
    <div class="agent-msg-bubble">
      ${isUser ? '' : `<div class="agent-msg-label">${label}${msg.skill ? ` · ${_esc(msg.skill)}` : ''}</div>`}
      <div class="agent-msg-text">${_formatAgentText(msg.content)}</div>
      ${timeStr ? `<div style="font-size:9px;color:var(--text-tertiary);margin-top:4px;text-align:${isUser ? 'right' : 'left'}">${timeStr}</div>` : ''}
    </div>
  </div>`;
}

function _appendMsg(msg, agent) {
  const el = document.getElementById('agent-messages');
  if (!el) return;
  const welcome = el.querySelector('.agent-welcome');
  if (welcome) welcome.remove();
  const div = document.createElement('div');
  div.innerHTML = _renderMsg(msg, agent);
  el.appendChild(div.firstElementChild);
  _scrollAgentToBottom();
}

let _lastSetTopbar = () => {};

// ── Agent Marketplace state ──────────────────────────────────────────────────
// Module-scope cache for the marketplace agent catalogue. Hydrated lazily on
// first hub render; falls back to a hardcoded demo list when the backend is
// unavailable or returns an empty/unknown shape (the demo-mode shim in api.js
// turns every list response into `{ items: [] }`).
let _marketplaceAgents = [];
let _marketplaceLoaded = false;
let _marketplaceLoading = false;
let _marketplaceModalAgent = null;
let _marketplaceModalReply = null;
let _marketplaceModalError = null;
let _marketplaceModalBusy = false;
// Pending two-step tool-call awaiting clinician approval. Only one pending
// call may exist at a time per modal — a newer pending_tool_call replaces an
// older one (older one is silently discarded).
let _marketplaceModalPendingCall = null;
// Result of the most recent executed tool call, rendered as a green/red card
// once confirmed_tool_call_id round-trips successfully (or simulated in demo).
let _marketplaceModalExecuted = null;
// "Cancelled." sentinel — set when the clinician rejects a pending call so we
// can show a small grey acknowledgement in place of the confirmation card.
let _marketplaceModalCancelled = false;

// ── Marketplace tab state ────────────────────────────────────────────────────
// Tracks which sub-view of the Marketplace section is active. Not persisted to
// localStorage — fresh on each visit so the catalog is always the entry point.
// Phase 7 added two super-admin tabs: 'activation' (per-clinic patient agent
// sign-off) and 'ops' (cross-clinic runs + abuse signals). Phase 9 adds a
// third super-admin tab: 'prompts' (per-agent system prompt overrides).
let _marketplaceTab = 'catalog'; // 'catalog' | 'activity' | 'activation' | 'ops' | 'prompts'
let _activityRuns = null;
let _activityAgentFilter = '';
let _activityLoading = false;
let _activityError = null;

// ── Phase 13: Token & cost trend (sparklines on Activity tab) ────────────────
// Per-agent daily usage rollup powered by `GET /api/v1/agents/usage-chart`.
// Default window 14 days; pills toggle between 7 / 14 / 30 / 90. Lazy-loaded
// on first Activity tab open and refetched whenever the window pill changes.
const USAGE_CHART_WINDOWS = [7, 14, 30, 90];
let _usageChartSinceDays = 14;
let _usageChartData = null;          // null=unloaded, []=loaded-empty, [...]=loaded
let _usageChartLoading = false;
let _usageChartError = null;

// ── Phase 7: chat suggestion chips ───────────────────────────────────────────
// Per-agent chip lists rendered above the marketplace modal textarea. Clicking
// a chip pre-fills the textarea but does NOT auto-send (clinician still
// reviews). Patient-side agents get an empty array — they're locked anyway.
const _MARKETPLACE_CHIPS = {
  'clinic.reception': [
    "Show today's queue",
    'Book a session for Mr X tomorrow at 14:00',
    'Cancel session sess-123',
    'Add a follow-up for Ms Y',
  ],
  'clinic.reporting': [
    'Weekly digest please',
    'Show open AEs',
    'Outcomes for the last 30 days',
  ],
  'clinic.drclaw_telegram': [
    "What's on my list today?",
    'Show pending notes',
    'Approve draft draft-123 with edits',
  ],
};

// ── Phase 7: super-admin gating helper ───────────────────────────────────────
// Super-admin = role === 'admin' AND no clinic_id (cross-clinic operator).
// Returns false on any localStorage parse failure so anonymous/expired
// sessions never accidentally see the privileged tabs.
function _isSuperAdmin() {
  try {
    const u = JSON.parse(localStorage.getItem('ds_user') || '{}');
    if (!u || u.role !== 'admin') return false;
    return u.clinic_id == null;
  } catch { return false; }
}

// ── Phase 7: Activation panel state ──────────────────────────────────────────
// In-memory cache of GET /api/v1/agent-admin/patient-activations rows. `null`
// before first load so we can render a loading placeholder; otherwise an
// array (possibly empty).
let _activationsList = null;
let _activationsLoading = false;
let _activationsError = null;
let _activationsBusy = false;
let _activationsNotice = null; // { kind: 'success'|'error'|'info', text: string }

// ── Phase 7: Ops panel state ─────────────────────────────────────────────────
// Cross-clinic runs + abuse signals. Populated lazily on first Ops tab open.
let _opsRuns = null;
let _opsRunsLoading = false;
let _opsRunsError = null;
let _opsClinicFilter = '';
let _opsAgentFilter = '';
let _opsAbuse = null;
let _opsAbuseLoading = false;
let _opsAbuseError = null;

// ── Phase 10: per-agent SLA panel state ──────────────────────────────────────
// Lazy-loaded on first Ops tab open. ``_opsSlaWindowHours`` is one of
// {1, 24, 168, 720} — matched to the toggle pills in the SLA card; the
// backend clamps to [1, 168] so the 30d (720h) pill is rendered for parity
// with other dashboards but is sent as 168 to stay within the supported
// range. The dashboard refetches when the user clicks a different pill.
let _opsSla = null;
let _opsSlaLoading = false;
let _opsSlaError = null;
let _opsSlaWindowHours = 24;

const OPS_SLA_WINDOW_OPTIONS = [
  { hours: 1, label: '1h' },
  { hours: 24, label: '24h' },
  { hours: 168, label: '7d' },
  { hours: 720, label: '30d' },
];

// Clamp the requested window to what the backend accepts (1..168). Anything
// above 168 (e.g. the 30d pill) collapses to 168 — consistent with the
// "max 7d of audit roll-up" cap baked into the endpoint.
function _opsSlaApiHours(hours) {
  const n = Number(hours || 24);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(168, Math.floor(n));
}

// ── Phase 11: Stripe webhook replay state (super-admin) ──────────────────────
// Tiny operator card that POSTs `{event_id}` at the Phase 10
// `/api/v1/agent-billing/admin/webhook-replay` endpoint and renders the JSON
// envelope returned. Pure form — no list cache, no auto-fetch, just last
// result kept in memory until the next click. `_webhookReplayResult` shape:
//   { ok: bool, status: number, body: object|null, error: string|null }
let _webhookReplayInput = '';
let _webhookReplayBusy = false;
let _webhookReplayResult = null;

// ── Phase 13: Onboarding funnel dashboard state (super-admin) ────────────────
// Renders inside the Ops tab body as a dashboard card. Backed by
// `GET /api/v1/onboarding/funnel?days=N` (admin+, server clamps 1..90).
// `_onboardingFunnelByDays` is a tiny per-window cache so re-clicking the
// same window pill does NOT re-fetch — the brief explicitly requires this.
// `_onboardingFunnelError` is window-scoped (cleared on every fetch attempt).
const ONBOARDING_FUNNEL_WINDOW_OPTIONS = [
  { days: 1, label: '1d' },
  { days: 7, label: '7d' },
  { days: 30, label: '30d' },
  { days: 90, label: '90d' },
];
const ONBOARDING_FUNNEL_STEPS = [
  { key: 'started', label: 'Started' },
  { key: 'package_selected', label: 'Package selected' },
  { key: 'stripe_initiated', label: 'Stripe initiated' },
  { key: 'stripe_skipped', label: 'Stripe skipped' },
  { key: 'agents_enabled', label: 'Agents enabled' },
  { key: 'team_invited', label: 'Team invited' },
  { key: 'completed', label: 'Completed' },
  { key: 'skipped', label: 'Skipped' },
];
let _onboardingFunnelDays = 7;
let _onboardingFunnelLoading = false;
let _onboardingFunnelError = null;
let _onboardingFunnelByDays = Object.create(null); // { [days]: payload }

// ── Phase 9: Prompt overrides panel state (super-admin) ──────────────────────
// Mirrors the Activation panel pattern: list cached in `_promptOverridesList`
// (null until first fetch), `_promptEditingAgentId` tracks which row's inline
// editor is open, `_promptDraft` holds the textarea value while editing,
// `_promptNotice` is a transient success/error banner that fades after 3s.
let _promptOverridesList = null;
let _promptOverridesLoading = false;
let _promptOverridesError = null;
let _promptOverridesBusy = false;
let _promptEditingAgentId = null;
let _promptDraft = '';
let _promptEditorError = null;
let _promptNotice = null; // { kind: 'success'|'error'|'info', text: string }
let _promptNoticeTimer = null;

// ── Phase 12: Prompt-override version-history drawer state (super-admin) ─────
// `_promptHistoryOpenAgentId` tracks which agent's drawer is currently expanded
// (null = no drawer open; only one open at a time per the brief). The history
// itself is cached per-agent_id in `_promptHistoryByAgent` so re-opening the
// same drawer doesn't refetch. `_promptHistoryDiffOpen` is a string of the
// form "<agent_id>:<version>" — at most one diff is expanded at a time inside
// the open drawer.
let _promptHistoryOpenAgentId = null;
let _promptHistoryByAgent = {}; // { [agentId]: [{id, version, system_prompt, created_at, created_by_id, deactivated_at, is_active}] }
let _promptHistoryLoading = false;
let _promptHistoryError = null;
let _promptHistoryDiffOpen = null; // "<agent_id>:<version>" or null

const PATIENT_AGENT_OPTIONS = [
  { id: 'patient.care_companion', label: 'Care Companion' },
  { id: 'patient.adherence', label: 'Adherence' },
  { id: 'patient.education', label: 'Education' },
  { id: 'patient.crisis', label: 'Crisis' },
];

const OPS_DEMO_RUNS = [
  {
    id: 'demo-ops-1',
    created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    clinic_id: 'clinic-oxford',
    actor_id: 'actor-clin-ox-1',
    agent_id: 'clinic.reception',
    message_preview: '(demo) Reschedule Mr X to 15:00 tomorrow.',
    reply_preview: '(demo) Drafted reschedule — clinician approval required.',
    context_used: ['sessions.list'],
    latency_ms: 720,
    cost_pence: 4,
    ok: true,
    error_code: null,
  },
  {
    id: 'demo-ops-2',
    created_at: new Date(Date.now() - 22 * 60 * 1000).toISOString(),
    clinic_id: 'clinic-bristol',
    actor_id: 'actor-clin-bs-2',
    agent_id: 'clinic.reporting',
    message_preview: '(demo) Weekly digest please.',
    reply_preview: '(demo) Digest: 17 sessions, 0 AE, avg PHQ-9 ↓0.9.',
    context_used: ['sessions.list', 'assessments.list'],
    latency_ms: 1180,
    cost_pence: 7,
    ok: true,
    error_code: null,
  },
  {
    id: 'demo-ops-3',
    created_at: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
    clinic_id: 'clinic-leeds',
    actor_id: 'actor-clin-ld-3',
    agent_id: 'clinic.drclaw_telegram',
    message_preview: '(demo) /queue',
    reply_preview: '(demo) 4 items pending review.',
    context_used: ['tasks.list'],
    latency_ms: 540,
    cost_pence: 3,
    ok: true,
    error_code: null,
  },
];

const OPS_DEMO_ABUSE = [
  { clinic_id: 'clinic-leeds', agent_id: 'clinic.reception', runs_in_window: 184, median_multiple: 7.2, severity: 'high' },
  { clinic_id: 'clinic-bristol', agent_id: 'clinic.reporting', runs_in_window: 62, median_multiple: 2.4, severity: 'medium' },
];

const OPS_DEMO_SLA = [
  { agent_id: 'clinic.reception', runs: 142, errors: 9, error_rate: 0.063, p50_ms: 720, p95_ms: 2100, avg_cost_pence: 4.2 },
  { agent_id: 'clinic.reporting', runs: 88, errors: 1, error_rate: 0.011, p50_ms: 1180, p95_ms: 3050, avg_cost_pence: 7.1 },
  { agent_id: 'clinic.drclaw_telegram', runs: 41, errors: 0, error_rate: 0.0, p50_ms: 540, p95_ms: 1300, avg_cost_pence: 3.0 },
];

// ── Upgrade-CTA state ────────────────────────────────────────────────────────
// Per-tile inline notice shown after the user clicks "Request upgrade →" on a
// locked tile. Keyed by agent id so two locked tiles can each show their own
// notice independently. Cleared when the user navigates away from the hub.
//   { [agentId]: { kind: 'info' | 'error', text: string } }
let _marketplaceUpgradeNotices = {};
// Set of agent ids currently mid-flight on the upgrade POST. Used to disable
// the button while the request is in flight so a rapid double-click doesn't
// spawn two checkout sessions.
let _marketplaceUpgradeInFlight = new Set();

const ACTIVITY_DEMO_RUNS = [
  {
    id: 'demo-run-1',
    created_at: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
    actor_id: 'actor-clinician-demo',
    agent_id: 'clinic.reception',
    message_preview: '(demo) Show me today’s bookings and any cancellations…',
    reply_preview: '(demo) You have 3 sessions today: 09:00 J. Doe, 11:30 A. Singh (cancelled), 15:00 R. Patel.',
    context_used: ['sessions.list', 'patients.search'],
    latency_ms: 842,
    ok: true,
    error_code: null,
  },
  {
    id: 'demo-run-2',
    created_at: new Date(Date.now() - 47 * 60 * 1000).toISOString(),
    actor_id: 'actor-clinician-demo',
    agent_id: 'clinic.reporting',
    message_preview: '(demo) Generate this week’s clinic digest with AE summary.',
    reply_preview: '(demo) Weekly digest: 22 sessions completed, 1 mild AE (transient headache, resolved), avg PHQ-9 ↓1.2.',
    context_used: ['sessions.list', 'assessments.list'],
    latency_ms: 1320,
    ok: true,
    error_code: null,
  },
  {
    id: 'demo-run-3',
    created_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    actor_id: 'actor-clinician-demo',
    agent_id: 'clinic.drclaw_telegram',
    message_preview: '(demo) /queue — what’s next?',
    reply_preview: '(demo) Next: review J. Doe pre-session checklist, then approve A. Singh home-program update.',
    context_used: ['tasks.list'],
    latency_ms: 612,
    ok: true,
    error_code: null,
  },
  {
    id: 'demo-run-4',
    created_at: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
    actor_id: 'actor-clinician-demo',
    agent_id: 'clinic.reception',
    message_preview: '(demo) Reschedule A. Singh from 11:30 to 16:00 tomorrow.',
    reply_preview: '(demo) I can draft a reschedule request — clinician approval required before sending.',
    context_used: ['sessions.list', 'patients.search'],
    latency_ms: 980,
    ok: true,
    error_code: null,
  },
  {
    id: 'demo-run-5',
    created_at: new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString(),
    actor_id: 'actor-clinician-demo',
    agent_id: 'clinic.reporting',
    message_preview: '(demo) Email me the AE summary for last month.',
    reply_preview: '',
    context_used: [],
    latency_ms: 1502,
    ok: false,
    error_code: 'tool_unavailable',
  },
];

const MARKETPLACE_DEMO_AGENTS = [
  {
    id: 'clinic.reception',
    name: 'Reception Agent',
    tagline: 'Books, reschedules, runs intake forms.',
    audience: 'clinic',
    role_required: 'clinician',
    package_required: ['clinician_pro', 'enterprise'],
    tool_allowlist: ['sessions.list', 'sessions.create', 'sessions.cancel', 'patients.search', 'forms.list', 'consent.status'],
    monthly_price_gbp: 99,
    tags: ['scheduling', 'intake'],
  },
  {
    id: 'clinic.reporting',
    name: 'Reporting Agent',
    tagline: 'Weekly clinic digest + AE summary.',
    audience: 'clinic',
    role_required: 'admin',
    package_required: ['clinician_pro', 'enterprise'],
    monthly_price_gbp: 49,
    tags: ['analytics'],
  },
  {
    id: 'clinic.drclaw_telegram',
    name: 'DrClaw (Telegram)',
    tagline: 'Your personal queue agent over Telegram.',
    audience: 'clinic',
    role_required: 'clinician',
    package_required: ['clinician_pro', 'enterprise'],
    monthly_price_gbp: 79,
    tags: ['telegram', 'doctor'],
  },
];

function _isMarketplaceDemoMode() {
  try {
    const flag = import.meta.env?.DEV || import.meta.env?.VITE_ENABLE_DEMO === '1';
    if (!flag) return false;
    const t = api.getToken && api.getToken();
    return !!(t && String(t).endsWith('-demo-token'));
  } catch { return false; }
}

function _marketplaceApiBase() {
  try { return import.meta.env?.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000'; }
  catch { return 'http://127.0.0.1:8000'; }
}

async function _fetchMarketplaceAgents() {
  if (_marketplaceLoading) return _marketplaceAgents;
  _marketplaceLoading = true;
  try {
    const headers = { 'Content-Type': 'application/json' };
    try {
      const t = api.getToken && api.getToken();
      if (t) headers['Authorization'] = 'Bearer ' + t;
    } catch {}
    let payload = null;
    try {
      const res = await fetch(`${_marketplaceApiBase()}/api/v1/agents`, {
        method: 'GET', headers, credentials: 'include',
      });
      if (res.ok) payload = await res.json();
    } catch { payload = null; }

    let agents = [];
    if (payload && Array.isArray(payload.agents)) agents = payload.agents;
    else if (payload && Array.isArray(payload.items)) agents = payload.items;

    if (!agents.length) agents = MARKETPLACE_DEMO_AGENTS.slice();
    _marketplaceAgents = agents;
    _marketplaceLoaded = true;
    return _marketplaceAgents;
  } finally {
    _marketplaceLoading = false;
  }
}

async function _runMarketplaceAgent(agentId, message, confirmedToolCallId = null) {
  if (_isMarketplaceDemoMode()) {
    // Demo two-step simulation. Mirrors PR #185's `{items: []}` shim pattern:
    // synthesise the protocol client-side so demo screenshots show the full
    // confirmation flow without a backend round-trip.
    const lower = String(message || '').toLowerCase();
    if (confirmedToolCallId && String(confirmedToolCallId).startsWith('demo-')) {
      return {
        agent_id: agentId,
        reply: '(demo) Tool executed.',
        schema_id: 'demo.v1',
        safety_footer: 'Decision-support only — not autonomous diagnosis.',
        context_used: ['sessions.list', 'patients.search'],
        pending_tool_call: null,
        tool_call_executed: {
          tool_id: 'sessions.create',
          ok: true,
          result: '(demo) Booked. (No real session created.)',
          audit_id: 'demo',
        },
      };
    }
    if (lower.includes('book')) {
      return {
        agent_id: agentId,
        reply: `Demo agent: I'd like to book that for you — please approve below.`,
        schema_id: 'demo.v1',
        safety_footer: 'Decision-support only — not autonomous diagnosis.',
        context_used: ['sessions.list', 'patients.search'],
        pending_tool_call: {
          call_id: 'demo-' + Date.now(),
          tool_id: 'sessions.create',
          args: { patient_id: 'demo-p1', starts_at: '2026-05-15T14:00:00Z', duration_minutes: 60 },
          summary: '(demo) Book demo patient p1 on May 15 14:00 for 60 min',
          expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        },
        tool_call_executed: null,
      };
    }
    return {
      agent_id: agentId,
      reply: `Demo agent: I would normally [do X based on your message: "${message}"]. (Real responses require a clinician account.)`,
      schema_id: 'demo.v1',
      safety_footer: 'Decision-support only — not autonomous diagnosis.',
      // Synthetic grounding so the "Grounded in:" badge renders in demo mode
      // for marketing screenshots — clearly tagged "(demo)" in the UI.
      context_used: ['sessions.list', 'patients.search'],
    };
  }
  const headers = { 'Content-Type': 'application/json' };
  try {
    const t = api.getToken && api.getToken();
    if (t) headers['Authorization'] = 'Bearer ' + t;
  } catch {}
  const body = { message, confirmed_tool_call_id: confirmedToolCallId || null };
  const res = await fetch(`${_marketplaceApiBase()}/api/v1/agents/${encodeURIComponent(agentId)}/run`, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok && !data) {
    throw new Error(`Agent run failed (${res.status})`);
  }
  return data || { agent_id: agentId, reply: '', error: 'No response' };
}

function _marketplaceCurrentPackageId() {
  try {
    const u = JSON.parse(localStorage.getItem('ds_user') || '{}');
    return u.package_id || null;
  } catch { return null; }
}

function _marketplaceIsLocked(agent) {
  const pkg = _marketplaceCurrentPackageId();
  const required = Array.isArray(agent?.package_required) ? agent.package_required : [];
  if (!required.length) return false; // no gating
  if (!pkg) return true;
  return !required.includes(pkg);
}

// ── Main Export ──────────────────────────────────────────────────────────────
export async function pgAgentChat(setTopbar) {
  _lastSetTopbar = setTopbar;
  if (!_agentSkillsHydrated && !_agentSkillsHydrating) {
    // Fire-and-forget hydration; bundled defaults render immediately while
    // this resolves. `_hydrateAgentSkills` re-renders on success.
    _hydrateAgentSkills();
  }
  if (!_tasksLoaded && !_tasksRefreshing) {
    _refreshTasks().then(() => {
      if (_agentView === 'hub' || _agentView === 'config') {
        try { pgAgentChat(_lastSetTopbar); } catch {}
      }
    }).catch(() => {});
  }
  if (!_marketplaceLoaded && !_marketplaceLoading) {
    // Fire-and-forget; the hub renders immediately with an empty list, then
    // re-renders once the catalogue arrives (or the demo fallback fills in).
    _fetchMarketplaceAgents().then(() => {
      if (_agentView === 'hub') {
        try { pgAgentChat(_lastSetTopbar); } catch {}
      }
    }).catch(() => {});
  }
  if (_agentView === 'hub') return _renderHub(setTopbar);
  if (_agentView === 'chat-clinician') return _renderChat(setTopbar, 'clinician');
  if (_agentView === 'chat-patient') return _renderChat(setTopbar, 'patient');
  if (_agentView === 'config') return _renderConfig(setTopbar);
}

// ── Marketplace Section ──────────────────────────────────────────────────────
function _renderMarketplaceTabStrip() {
  const tab = (k, label) => {
    const active = _marketplaceTab === k;
    const style = active
      ? 'font-size:11.5px;padding:4px 12px;border-radius:6px;background:var(--violet);color:#fff;border:1px solid var(--violet);font-weight:600;cursor:pointer'
      : 'font-size:11.5px;padding:4px 12px;border-radius:6px;background:transparent;color:var(--text-secondary);border:1px solid var(--border);font-weight:500;cursor:pointer';
    return `<button type="button" style="${style}" onclick="window._agentMarketplaceSetTab('${k}')">${label}</button>`;
  };
  const adminTabs = _isSuperAdmin()
    ? tab('activation', 'Activation') + tab('ops', 'Ops') + tab('prompts', 'Prompts')
    : '';
  return `<div style="display:flex;gap:6px;margin-bottom:12px">${tab('catalog', 'Catalog')}${tab('activity', 'Activity')}${adminTabs}</div>`;
}

function _renderMarketplaceSection() {
  // Use whatever's loaded; if nothing's loaded yet (very first paint) and we're
  // in demo mode, show the hardcoded list so reviewers see the marketplace.
  let agents = _marketplaceAgents;
  if ((!agents || !agents.length) && _isMarketplaceDemoMode()) {
    agents = MARKETPLACE_DEMO_AGENTS;
  }

  const header = `
    <h2 style="font-size:18px;font-weight:700;color:var(--text-primary);margin:0 0 4px">Agent Marketplace</h2>
    <p class="muted" style="font-size:12px;color:var(--text-secondary);margin:0 0 12px">Add specialised AI sub-agents to your clinic.</p>
    ${_renderMarketplaceTabStrip()}
  `;

  if (_marketplaceTab === 'activity') {
    return `
      <div style="margin-bottom:20px">
        ${header}
        ${_renderActivitySection(agents)}
      </div>
      ${_renderMarketplaceModal()}
    `;
  }

  // Phase 7: super-admin sub-tabs. If a non-super-admin somehow has the tab
  // value set (stale state), fall through to the catalog rather than showing
  // an unauthorised panel. The tab strip itself never renders these buttons
  // for clinicians.
  if (_marketplaceTab === 'activation' && _isSuperAdmin()) {
    return `
      <div style="margin-bottom:20px">
        ${header}
        ${_renderActivationSection()}
      </div>
      ${_renderMarketplaceModal()}
    `;
  }
  if (_marketplaceTab === 'ops' && _isSuperAdmin()) {
    return `
      <div style="margin-bottom:20px">
        ${header}
        ${_renderOpsSection(agents)}
      </div>
      ${_renderMarketplaceModal()}
    `;
  }
  if (_marketplaceTab === 'prompts' && _isSuperAdmin()) {
    return `
      <div style="margin-bottom:20px">
        ${header}
        ${_renderPromptOverridesSection(agents)}
      </div>
      ${_renderMarketplaceModal()}
    `;
  }

  if (!agents || !agents.length) {
    // Pre-hydration placeholder — keeps the section visible so users know it's
    // loading and the page layout doesn't shift when the list arrives.
    return `
      <div style="margin-bottom:20px">
        ${header}
        <div class="card" style="padding:14px 16px;font-size:11.5px;color:var(--text-tertiary)">Loading available agents…</div>
      </div>
    `;
  }

  const tiles = agents.map(a => {
    const locked = _marketplaceIsLocked(a);
    const audience = _esc(a.audience || 'clinic');
    const required = Array.isArray(a.package_required) ? a.package_required : [];
    const packageBadge = locked
      ? '<span class="ds-pill" style="font-size:10px;padding:3px 9px;border-radius:99px;background:rgba(245,158,11,0.12);color:var(--amber,#f59e0b);font-weight:600;border:1px solid rgba(245,158,11,0.25)">Locked — upgrade required</span>'
      : `<span class="ds-pill" style="font-size:10px;padding:3px 9px;border-radius:99px;background:rgba(0,212,188,0.10);color:var(--teal);font-weight:600;border:1px solid rgba(0,212,188,0.25)">${_esc(required[0] || 'included')}</span>`;
    const audPill = `<span class="ds-pill" style="font-size:10px;padding:3px 9px;border-radius:99px;background:rgba(74,158,255,0.10);color:var(--blue);font-weight:600;border:1px solid rgba(74,158,255,0.25)">${audience}</span>`;
    const dimStyle = locked ? 'opacity:0.7;' : '';
    const price = Number.isFinite(a.monthly_price_gbp) ? a.monthly_price_gbp : (a.monthly_price_gbp || 0);

    // Locked tiles get a single primary CTA — "Request upgrade →" — that
    // either kicks off Stripe checkout (real auth) or shows a demo toast.
    // Unlocked tiles keep the existing Try / Configure pair.
    let actionRow;
    if (locked) {
      const inFlight = _marketplaceUpgradeInFlight.has(a.id);
      const busyAttr = inFlight ? 'disabled' : '';
      const label = inFlight ? 'Starting checkout…' : 'Request upgrade →';
      actionRow = `
        <button class="btn btn-sm btn-primary"
                onclick="window._agentMarketplaceUpgrade('${_esc(a.id)}')"
                style="font-size:11.5px;width:100%"
                ${busyAttr}>${label}</button>
      `;
    } else {
      const tryBtn = `<button class="btn btn-sm btn-primary" onclick="window._agentMarketplaceTry('${_esc(a.id)}')" style="font-size:11.5px">Try in chat</button>`;
      const cfgBtn = `<button class="btn btn-sm btn-ghost" onclick="window._agentMarketplaceConfigure('${_esc(a.id)}')" style="font-size:11.5px;opacity:0.7" title="Configuration coming soon">Configure</button>`;
      actionRow = `
        <div style="display:flex;gap:6px">
          ${tryBtn}
          ${cfgBtn}
        </div>
      `;
    }

    // Inline upgrade-CTA notice (info/error). Mirrors the small grey/red
    // hint blocks used by the marketplace modal — no new CSS, just inline
    // colour overrides per severity.
    const notice = _marketplaceUpgradeNotices[a.id];
    let noticeBlock = '';
    if (notice) {
      const isErr = notice.kind === 'error';
      const bg = isErr ? 'rgba(239,68,68,0.08)' : 'rgba(74,158,255,0.08)';
      const border = isErr ? 'rgba(239,68,68,0.25)' : 'rgba(74,158,255,0.25)';
      const colour = isErr ? 'var(--red,#ef4444)' : 'var(--text-secondary)';
      noticeBlock = `
        <div class="muted" style="font-size:11px;line-height:1.4;padding:8px 10px;border-radius:6px;background:${bg};border:1px solid ${border};color:${colour}">${_esc(notice.text)}</div>
      `;
    }

    return `
      <div class="card ds-card" style="${dimStyle}padding:14px 16px;display:flex;flex-direction:column;gap:8px;min-height:170px">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          ${audPill}
          ${packageBadge}
        </div>
        <h3 style="font-size:14px;font-weight:700;color:var(--text-primary);margin:0">${_esc(a.name || a.id)}</h3>
        <div style="font-size:11.5px;color:var(--text-secondary);line-height:1.4;flex:1">${_esc(a.tagline || '')}</div>
        <div style="font-size:12px;font-weight:700;color:var(--text-primary)">£${_esc(String(price))}/mo</div>
        ${noticeBlock}
        <div style="margin-top:4px">
          ${actionRow}
        </div>
      </div>
    `;
  }).join('');

  return `
    <div style="margin-bottom:20px">
      ${header}
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px">
        ${tiles}
      </div>
    </div>
    ${_renderMarketplaceModal()}
  `;
}

// Format `context_used` tool ids for the "Grounded in:" badge.
// - Strip write-tool ids (broker skips them, so we can't claim them as grounding).
// - Strip the dotted suffix: `"sessions.list"` -> `"sessions"`.
// - Dedupe while preserving first-seen order.
// Returns `[]` when the input is missing/empty/all-filtered.
function _formatGroundedTools(toolIds) {
  if (!Array.isArray(toolIds) || !toolIds.length) return [];
  const writeSuffixes = ['create', 'update', 'delete', 'cancel', 'approve_draft', 'approve', 'send', 'schedule', 'reschedule', 'write', 'set'];
  const isWrite = id => {
    const dot = id.indexOf('.');
    if (dot < 0) return false;
    const action = id.slice(dot + 1).toLowerCase();
    return writeSuffixes.some(s => action === s || action.startsWith(s + '_') || action.endsWith('_' + s));
  };
  const seen = new Set();
  const out = [];
  for (const raw of toolIds) {
    if (typeof raw !== 'string' || !raw) continue;
    if (isWrite(raw)) continue;
    const dot = raw.indexOf('.');
    const prefix = dot >= 0 ? raw.slice(0, dot) : raw;
    if (!prefix || seen.has(prefix)) continue;
    seen.add(prefix);
    out.push(prefix);
  }
  return out;
}

// Compact relative-time formatter used by the Activity table. Falls back to a
// raw locale string for anything older than ~30 days so the audit timeline
// still reads sensibly when scrolled back.
function _relTime(iso) {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const diff = Date.now() - t;
  if (diff < 0) return 'in the future';
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return min + 'm ago';
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr + 'h ago';
  const day = Math.floor(hr / 24);
  if (day === 1) return 'yesterday';
  if (day < 7) return day + 'd ago';
  if (day < 30) return Math.floor(day / 7) + 'w ago';
  try { return new Date(iso).toLocaleDateString(); } catch { return iso; }
}

// "Expires in 4m" / "expired" formatter for the tool-confirmation card.
// Returns a short phrase suitable for the right-aligned hint, never throws.
function _expiresIn(iso) {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const diff = t - Date.now();
  if (diff <= 0) return 'expired';
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `in ${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `in ${min}m`;
  const hr = Math.floor(min / 60);
  return `in ${hr}h`;
}

function _formatLatency(ms) {
  if (!Number.isFinite(ms)) return '—';
  if (ms < 1000) return ms + 'ms';
  return (ms / 1000).toFixed(1) + 's';
}

function _truncate(str, n) {
  const s = String(str ?? '');
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + '…';
}

async function _loadActivityRuns(force = false) {
  if (_activityLoading && !force) return _activityRuns;
  _activityLoading = true;
  _activityError = null;
  try {
    if (_isMarketplaceDemoMode()) {
      // Mirror `_fetchMarketplaceAgents` demo fallback — the demo-mode shim in
      // api.js returns `{items: []}` for any list endpoint, so we substitute
      // synthetic runs covering the three clinic-side agents.
      let runs = ACTIVITY_DEMO_RUNS.slice();
      if (_activityAgentFilter) {
        runs = runs.filter(r => r.agent_id === _activityAgentFilter);
      }
      _activityRuns = runs;
      return _activityRuns;
    }
    const headers = { 'Content-Type': 'application/json' };
    try {
      const t = api.getToken && api.getToken();
      if (t) headers['Authorization'] = 'Bearer ' + t;
    } catch {}
    const qs = '?limit=50' + (_activityAgentFilter ? '&agent_id=' + encodeURIComponent(_activityAgentFilter) : '');
    let payload = null;
    try {
      const res = await fetch(`${_marketplaceApiBase()}/api/v1/agents/runs${qs}`, {
        method: 'GET', headers, credentials: 'include',
      });
      if (res.ok) payload = await res.json();
      else _activityError = `Failed to load activity (${res.status})`;
    } catch (err) {
      _activityError = err?.message || 'Failed to load activity.';
      payload = null;
    }
    let runs = [];
    if (payload && Array.isArray(payload.runs)) runs = payload.runs;
    else if (payload && Array.isArray(payload.items)) runs = payload.items;
    _activityRuns = runs;
    return _activityRuns;
  } finally {
    _activityLoading = false;
  }
}

function _renderActivitySection(agents) {
  // Phase 13 — token & cost trend sparklines render ABOVE the existing run
  // history table. Lazy-loaded on first Activity tab open and refetched on
  // window-pill change. The block wraps the existing UI without touching
  // any of the surrounding tab strip / other tab bodies.
  const chartSection = _renderUsageChartSection(agents);

  // Filter dropdown options come from whatever marketplace catalog we've
  // hydrated; fall back to whatever runs we already have so the dropdown is
  // never empty in demo mode before the catalog finishes loading.
  const agentOptions = Array.isArray(agents) && agents.length ? agents : MARKETPLACE_DEMO_AGENTS;
  const optionsHtml = ['<option value="">All agents</option>']
    .concat(agentOptions.map(a => {
      const sel = _activityAgentFilter === a.id ? ' selected' : '';
      return `<option value="${_esc(a.id)}"${sel}>${_esc(a.name || a.id)}</option>`;
    }))
    .join('');

  const filterRow = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap">
      <label style="font-size:11px;color:var(--text-tertiary)">Filter:</label>
      <select class="form-control" onchange="window._agentActivitySetFilter(this.value)" style="font-size:11.5px;padding:4px 8px;max-width:240px">
        ${optionsHtml}
      </select>
      <button class="btn btn-sm btn-ghost" onclick="window._agentActivityRefresh()" style="font-size:11px" ${_activityLoading ? 'disabled' : ''}>${_activityLoading ? 'Refreshing…' : '↻ Refresh'}</button>
      ${_activityError ? `<span style="font-size:11px;color:var(--red,#ef4444)">${_esc(_activityError)}</span>` : ''}
    </div>
  `;

  // Loading placeholder for first paint before the lazy fetch resolves.
  if (_activityRuns === null) {
    return `
      ${chartSection}
      ${filterRow}
      <div class="card" style="padding:14px 16px;font-size:11.5px;color:var(--text-tertiary)">Loading agent activity…</div>
    `;
  }

  if (!_activityRuns.length) {
    return `
      ${chartSection}
      ${filterRow}
      <div class="card" style="padding:24px 16px;text-align:center">
        <div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:4px">No agent runs yet.</div>
        <div style="font-size:11.5px;color:var(--text-secondary)">Try a Marketplace agent to see activity here.</div>
      </div>
    `;
  }

  const agentNameById = new Map();
  for (const a of agentOptions) agentNameById.set(a.id, a.name || a.id);

  const rows = _activityRuns.map(r => {
    const when = _esc(_relTime(r.created_at));
    const agentName = _esc(agentNameById.get(r.agent_id) || r.agent_id || '');
    const actorRaw = String(r.actor_id || '');
    const actorShort = actorRaw.length > 8 ? actorRaw.slice(-8) : actorRaw;
    const actor = `<span style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px">${_esc(actorShort)}</span>`;
    const message = _esc(_truncate(r.message_preview || '', 60));
    const reply = _esc(_truncate(r.reply_preview || '', 80));
    const grounded = _formatGroundedTools(r.context_used);
    const groundedCell = grounded.length
      ? `<span class="ds-pill" style="font-size:10px;padding:3px 9px;border-radius:99px;background:rgba(74,158,255,0.10);color:var(--blue);font-weight:600;border:1px solid rgba(74,158,255,0.25)">${_esc(grounded.join(', '))}</span>`
      : '<span style="color:var(--text-tertiary)">—</span>';
    const latency = _esc(_formatLatency(r.latency_ms));
    const cost = _esc(_formatCost(r.cost_pence));
    const status = r.ok
      ? '<span style="color:var(--green,#22c55e);font-weight:700">✓</span>'
      : `<span style="color:var(--red,#ef4444);font-weight:700">✗ ${_esc(r.error_code || 'error')}</span>`;
    return `<tr class="ds-tr">
      <td style="white-space:nowrap">${when}</td>
      <td>${agentName}</td>
      <td>${actor}</td>
      <td>${message}</td>
      <td>${reply}</td>
      <td>${groundedCell}</td>
      <td style="white-space:nowrap">${latency}</td>
      <td style="white-space:nowrap">${cost}</td>
      <td style="white-space:nowrap">${status}</td>
    </tr>`;
  }).join('');

  // Footer summary: aggregate cost across the visible runs. Field may be
  // missing on older backends — `_sumCostPence` treats null/undefined as 0.
  const totalPence = _sumCostPence(_activityRuns);
  const footerLine = `Total this view: £${(totalPence / 100).toFixed(2)} from ${_activityRuns.length} run${_activityRuns.length === 1 ? '' : 's'}`;

  return `
    ${chartSection}
    ${filterRow}
    <div style="overflow-x:auto">
      <table class="ds-table" style="width:100%;font-size:12px">
        <thead>
          <tr>
            <th>When</th>
            <th>Agent</th>
            <th>Actor</th>
            <th>Message</th>
            <th>Reply</th>
            <th>Grounded</th>
            <th>Latency</th>
            <th>Cost</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="muted" style="margin-top:8px;font-size:11px;color:var(--text-tertiary)">${footerLine}</div>
  `;
}

// ── Phase 13: Token & cost trend (sparklines) ────────────────────────────────
// Pure SVG polyline renderer — no charting library dependency. Each sparkline
// is ~120px wide × 30px tall and scales to the local maximum so even quiet
// agents get a readable shape (the absolute totals on the right add the
// missing magnitude). Hover shows date+value via the SVG ``title`` element.

async function _loadUsageChart(force = false) {
  if (_usageChartLoading && !force) return _usageChartData;
  _usageChartLoading = true;
  _usageChartError = null;
  try {
    if (_isMarketplaceDemoMode()) {
      // Synthetic demo series — three agents with descending activity so the
      // sparkline shapes visibly differ in offline / preview mode.
      const today = new Date();
      const days = (n, ramp) => {
        const out = [];
        for (let i = n - 1; i >= 0; i--) {
          const d = new Date(today);
          d.setUTCDate(today.getUTCDate() - i);
          const iso = d.toISOString().slice(0, 10);
          const v = Math.max(0, Math.round(ramp(i)));
          out.push({
            date: iso,
            runs: v,
            tokens_in: v * 120,
            tokens_out: v * 60,
            cost_pence: v * 1,
          });
        }
        return out;
      };
      const n = _usageChartSinceDays;
      _usageChartData = [
        { agent_id: 'clinic.reception', days: days(n, i => 4 + Math.sin(i / 2) * 2) },
        { agent_id: 'clinic.drclaw_telegram', days: days(n, i => 2 + Math.cos(i / 3) * 1.5) },
        { agent_id: 'clinic.reporting', days: days(n, i => i % 3 === 0 ? 1 : 0) },
      ];
      return _usageChartData;
    }
    const headers = { 'Content-Type': 'application/json' };
    try {
      const t = api.getToken && api.getToken();
      if (t) headers['Authorization'] = 'Bearer ' + t;
    } catch {}
    const qs = '?since_days=' + encodeURIComponent(_usageChartSinceDays);
    let payload = null;
    try {
      const res = await fetch(`${_marketplaceApiBase()}/api/v1/agents/usage-chart${qs}`, {
        method: 'GET', headers, credentials: 'include',
      });
      if (res.ok) payload = await res.json();
      else _usageChartError = `Failed to load usage chart (${res.status})`;
    } catch (err) {
      _usageChartError = err?.message || 'Failed to load usage chart.';
      payload = null;
    }
    let agents = [];
    if (payload && Array.isArray(payload.agents)) agents = payload.agents;
    _usageChartData = agents;
    return _usageChartData;
  } finally {
    _usageChartLoading = false;
  }
}

// Build a polyline string scaled to the SVG canvas. Empty / all-zero series
// renders as a flat baseline so the SVG doesn't collapse to a degenerate
// shape. Uses a fixed local max so each sparkline is readable on its own —
// cross-agent magnitude is conveyed by the totals column on the right.
function _renderSparkline(values, label, fmt) {
  const W = 120;
  const H = 30;
  const n = Array.isArray(values) ? values.length : 0;
  if (!n) return `<svg width="${W}" height="${H}" role="img" aria-label="${_esc(label)}"></svg>`;
  let max = 0;
  for (const v of values) {
    const num = Number(v);
    if (Number.isFinite(num) && num > max) max = num;
  }
  // Avoid div-by-zero and degenerate flat lines for all-zero series.
  const denom = max > 0 ? max : 1;
  const stepX = n > 1 ? W / (n - 1) : 0;
  const points = values.map((v, i) => {
    const num = Number(v);
    const safe = Number.isFinite(num) ? num : 0;
    const x = (i * stepX).toFixed(1);
    // Invert Y so larger values sit higher on the canvas. Pad 2px top/bottom
    // so the stroke isn't clipped at the canvas edge.
    const y = (H - 2 - (safe / denom) * (H - 4)).toFixed(1);
    return `${x},${y}`;
  }).join(' ');
  // Per-point title via tspans isn't trivial in inline SVG without JS; use
  // the SVG ``<title>`` for an aggregate hover tooltip describing the series
  // and its peak value.
  const peakIdx = values.findIndex(v => Number(v) === max);
  const peakLabel = peakIdx >= 0 ? `peak ${fmt ? fmt(max) : max}` : '';
  const titleText = `${label}${peakLabel ? ' — ' + peakLabel : ''}`;
  return `<svg width="${W}" height="${H}" role="img" aria-label="${_esc(label)}" style="vertical-align:middle">
    <title>${_esc(titleText)}</title>
    <polyline fill="none" stroke="var(--violet)" stroke-width="1.5" points="${points}" />
  </svg>`;
}

function _formatTokensCompact(n) {
  const num = Number(n);
  if (!Number.isFinite(num) || num <= 0) return '0';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
  return String(Math.round(num));
}

function _renderUsageChartSection(agents) {
  const agentNameById = new Map();
  const opts = Array.isArray(agents) && agents.length ? agents : MARKETPLACE_DEMO_AGENTS;
  for (const a of opts) agentNameById.set(a.id, a.name || a.id);

  const pillStyle = (active) => active
    ? 'font-size:10.5px;padding:3px 9px;border-radius:99px;background:var(--violet);color:#fff;border:1px solid var(--violet);font-weight:600;cursor:pointer'
    : 'font-size:10.5px;padding:3px 9px;border-radius:99px;background:transparent;color:var(--text-secondary);border:1px solid var(--border);font-weight:500;cursor:pointer';
  const pills = USAGE_CHART_WINDOWS.map(d => {
    const active = _usageChartSinceDays === d;
    return `<button type="button" style="${pillStyle(active)}" onclick="window._agentUsageChartSetWindow(${d})">${d}d</button>`;
  }).join('');

  const heading = `
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px">
      <h3 style="font-size:13.5px;font-weight:700;color:var(--text-primary);margin:0">Token & cost trend (last ${_usageChartSinceDays} days)</h3>
      <div style="display:flex;gap:4px;margin-left:auto">${pills}</div>
    </div>
  `;

  let body = '';
  if (_usageChartLoading && _usageChartData === null) {
    body = `<div class="muted" style="font-size:11px;color:var(--text-tertiary)">Loading usage…</div>`;
  } else if (_usageChartError && _usageChartData === null) {
    body = `<div style="font-size:11px;color:var(--red,#ef4444)">${_esc(_usageChartError)}</div>`;
  } else if (_usageChartData === null) {
    body = `<div class="muted" style="font-size:11px;color:var(--text-tertiary)">Loading usage…</div>`;
  } else if (!_usageChartData.length) {
    body = `<div class="muted" style="font-size:11.5px;color:var(--text-secondary)">No agent activity yet for this window.</div>`;
  } else {
    const rows = _usageChartData.map(block => {
      const days = Array.isArray(block.days) ? block.days : [];
      const runsSeries = days.map(d => Number(d.runs) || 0);
      const tokensSeries = days.map(d => (Number(d.tokens_in) || 0) + (Number(d.tokens_out) || 0));
      const costSeries = days.map(d => Number(d.cost_pence) || 0);
      const totalRuns = runsSeries.reduce((a, b) => a + b, 0);
      const totalTokens = tokensSeries.reduce((a, b) => a + b, 0);
      const totalCost = costSeries.reduce((a, b) => a + b, 0);
      const name = agentNameById.get(block.agent_id) || block.agent_id;
      const sparkRuns = _renderSparkline(runsSeries, `Runs for ${name}`, v => String(v));
      const sparkTokens = _renderSparkline(tokensSeries, `Tokens for ${name}`, v => _formatTokensCompact(v));
      const sparkCost = _renderSparkline(costSeries, `Cost (pence) for ${name}`, v => v + 'p');
      return `<div class="ds-tr" style="display:flex;align-items:center;gap:12px;padding:6px 4px;border-bottom:1px solid var(--border)">
        <div style="min-width:140px;font-size:11.5px;font-weight:600;color:var(--text-primary);font-family:ui-monospace,SFMono-Regular,Menlo,monospace">${_esc(block.agent_id)}</div>
        <div style="display:flex;gap:8px;align-items:center" title="runs / tokens / cost (pence)">
          ${sparkRuns}${sparkTokens}${sparkCost}
        </div>
        <div style="margin-left:auto;font-size:11px;color:var(--text-secondary);text-align:right;line-height:1.5">
          <div>${totalRuns} run${totalRuns === 1 ? '' : 's'}</div>
          <div>${_formatTokensCompact(totalTokens)} tok</div>
          <div>£${(totalCost / 100).toFixed(2)}</div>
        </div>
      </div>`;
    }).join('');
    const legend = `<div class="muted" style="margin-top:6px;font-size:10.5px;color:var(--text-tertiary)">Sparklines (left → right): runs / tokens / cost-pence per day. Hover for peak value.</div>`;
    body = `<div>${rows}</div>${legend}`;
  }

  return `
    <div class="card" style="padding:12px 14px;margin-bottom:14px">
      ${heading}
      ${body}
    </div>
  `;
}

window._agentUsageChartSetWindow = function(days) {
  const n = Number(days);
  if (!USAGE_CHART_WINDOWS.includes(n)) return;
  if (_usageChartSinceDays === n) return;
  _usageChartSinceDays = n;
  // Force a refetch — the rollup is window-specific so cached data is stale
  // the moment the user clicks a different pill.
  _usageChartData = null;
  pgAgentChat(_lastSetTopbar);
  _loadUsageChart(true).then(() => {
    if (_agentView === 'hub' && _marketplaceTab === 'activity') {
      try { pgAgentChat(_lastSetTopbar); } catch {}
    }
  }).catch(() => {});
};

// Phase 7: render `cost_pence` as £0.04. Null / 0 / undefined → em-dash so the
// column reads cleanly when older backends omit the field or a run had no
// LLM spend (cached, rejected, error).
function _formatCost(pence) {
  if (pence === null || pence === undefined) return '—';
  const n = Number(pence);
  if (!Number.isFinite(n) || n <= 0) return '—';
  return '£' + (n / 100).toFixed(2);
}

function _sumCostPence(runs) {
  if (!Array.isArray(runs)) return 0;
  let total = 0;
  for (const r of runs) {
    const n = Number(r && r.cost_pence);
    if (Number.isFinite(n) && n > 0) total += n;
  }
  return total;
}

// ── Phase 7: Activation panel (super-admin) ──────────────────────────────────
async function _fetchPatientActivations() {
  if (_activationsLoading) return _activationsList;
  _activationsLoading = true;
  _activationsError = null;
  try {
    if (_isMarketplaceDemoMode()) {
      // Demo mode never hits the activation API — start with empty list and
      // simulate POST/DELETE locally below.
      _activationsList = [];
      return _activationsList;
    }
    const headers = { 'Content-Type': 'application/json' };
    try {
      const t = api.getToken && api.getToken();
      if (t) headers['Authorization'] = 'Bearer ' + t;
    } catch {}
    let payload = null;
    try {
      const res = await fetch(`${_marketplaceApiBase()}/api/v1/agent-admin/patient-activations`, {
        method: 'GET', headers, credentials: 'include',
      });
      if (res.ok) payload = await res.json();
      else if (res.status === 403) _activationsError = 'This action requires super-admin privileges.';
      else _activationsError = `Failed to load activations (${res.status})`;
    } catch (err) {
      _activationsError = err?.message || 'Failed to load activations.';
      payload = null;
    }
    let items = [];
    if (payload && Array.isArray(payload.items)) items = payload.items;
    else if (payload && Array.isArray(payload.activations)) items = payload.activations;
    _activationsList = items;
    return _activationsList;
  } finally {
    _activationsLoading = false;
  }
}

function _renderActivationSection() {
  const sectionHeader = `
    <div style="margin-bottom:8px">
      <div style="font-size:14px;font-weight:700;color:var(--text-primary)">Patient agent activation (super-admin)</div>
    </div>
    <div class="card" style="padding:10px 12px;margin-bottom:12px;border-left:3px solid var(--amber,#f59e0b);background:rgba(245,158,11,0.06);font-size:11.5px;color:var(--text-secondary);line-height:1.55">
      Activating a patient agent for a clinic confirms the clinical PM has signed off on the safety copy for that clinic. Activation is per-clinic and per-agent. Production gate: agents stay locked unless DEEPSYNAPS_PATIENT_AGENTS_ACTIVATED=1 is also set on the API.
    </div>
  `;

  const noticeBlock = (() => {
    if (!_activationsNotice) return '';
    const n = _activationsNotice;
    const map = {
      success: { bg: 'rgba(34,197,94,0.10)', border: 'rgba(34,197,94,0.30)', color: 'var(--green,#22c55e)' },
      error:   { bg: 'rgba(239,68,68,0.10)', border: 'rgba(239,68,68,0.30)', color: 'var(--red,#ef4444)' },
      info:    { bg: 'rgba(74,158,255,0.10)', border: 'rgba(74,158,255,0.30)', color: 'var(--blue)' },
    };
    const c = map[n.kind] || map.info;
    return `<div style="margin-bottom:10px;padding:8px 12px;border-radius:6px;background:${c.bg};border:1px solid ${c.border};color:${c.color};font-size:11.5px">${_esc(n.text)}</div>`;
  })();

  // Table block — list current activations.
  let tableBlock;
  if (_activationsList === null) {
    tableBlock = `<div class="card" style="padding:14px 16px;font-size:11.5px;color:var(--text-tertiary)">Loading activations…</div>`;
  } else if (_activationsError) {
    tableBlock = `<div class="card" style="padding:14px 16px;font-size:11.5px;color:var(--red,#ef4444)">${_esc(_activationsError)}</div>`;
  } else if (!_activationsList.length) {
    tableBlock = `<div class="card" style="padding:14px 16px;font-size:11.5px;color:var(--text-tertiary)">No patient agents activated yet.</div>`;
  } else {
    const rows = _activationsList.map(row => {
      const clinic = _esc(String(row.clinic_id || ''));
      const agentId = _esc(String(row.agent_id || ''));
      const attestor = _esc(String(row.attested_by || row.attestor || ''));
      const at = _esc(_relTime(row.attested_at || row.created_at || ''));
      return `<tr class="ds-tr">
        <td style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px">${clinic}</td>
        <td style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px">${agentId}</td>
        <td style="font-size:11.5px">${attestor}</td>
        <td style="white-space:nowrap;font-size:11.5px">${at}</td>
        <td style="white-space:nowrap"><button class="btn btn-sm btn-ghost" style="font-size:10.5px;color:var(--red,#ef4444)" onclick="window._agentActivationDeactivate('${clinic}','${agentId}')">Deactivate</button></td>
      </tr>`;
    }).join('');
    tableBlock = `
      <div style="overflow-x:auto;margin-bottom:14px">
        <table class="ds-table" style="width:100%;font-size:12px">
          <thead><tr><th>Clinic</th><th>Agent</th><th>Attested by</th><th>Attested at</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  // Activate form. Char counter is wired via a tiny inline oninput handler so
  // we don't need a re-render on every keystroke.
  const agentOptions = PATIENT_AGENT_OPTIONS.map(o =>
    `<option value="${_esc(o.id)}">${_esc(o.label)} (${_esc(o.id)})</option>`
  ).join('');
  const busyAttr = _activationsBusy ? 'disabled' : '';
  const formBlock = `
    <div class="card" style="padding:14px 16px">
      <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:10px">Activate a patient agent</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
        <div class="form-group" style="margin:0">
          <label class="form-label" style="font-size:11px">Clinic ID</label>
          <input id="activation-clinic" class="form-control" type="text" placeholder="clinic-..." style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px" ${busyAttr}>
        </div>
        <div class="form-group" style="margin:0">
          <label class="form-label" style="font-size:11px">Patient agent</label>
          <select id="activation-agent" class="form-control" style="font-size:12px" ${busyAttr}>${agentOptions}</select>
        </div>
      </div>
      <div class="form-group" style="margin:0 0 10px">
        <label class="form-label" style="font-size:11px">Attestation (min 32 chars)</label>
        <textarea id="activation-attestation" class="form-control" rows="3" placeholder="I confirm the clinical PM has signed off on the safety copy for this clinic…" style="width:100%;resize:vertical;font-size:12px" oninput="window._agentActivationAttestationInput(this.value)" ${busyAttr}></textarea>
        <div id="activation-attestation-count" style="margin-top:4px;font-size:10.5px;color:var(--text-tertiary)">0 / 32</div>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px">
        <button class="btn btn-sm btn-primary" onclick="window._agentActivationSubmit()" ${busyAttr}>${_activationsBusy ? 'Activating…' : 'Activate'}</button>
      </div>
    </div>
  `;

  return `
    ${sectionHeader}
    ${noticeBlock}
    ${tableBlock}
    ${formBlock}
  `;
}

// ── Phase 7: Ops panel (super-admin) ─────────────────────────────────────────
async function _fetchOpsRuns() {
  if (_opsRunsLoading) return _opsRuns;
  _opsRunsLoading = true;
  _opsRunsError = null;
  try {
    if (_isMarketplaceDemoMode()) {
      let runs = OPS_DEMO_RUNS.slice();
      if (_opsClinicFilter) runs = runs.filter(r => r.clinic_id === _opsClinicFilter);
      if (_opsAgentFilter) runs = runs.filter(r => r.agent_id === _opsAgentFilter);
      _opsRuns = runs;
      return _opsRuns;
    }
    const headers = { 'Content-Type': 'application/json' };
    try {
      const t = api.getToken && api.getToken();
      if (t) headers['Authorization'] = 'Bearer ' + t;
    } catch {}
    const params = ['limit=50'];
    if (_opsClinicFilter) params.push('clinic_id=' + encodeURIComponent(_opsClinicFilter));
    if (_opsAgentFilter) params.push('agent_id=' + encodeURIComponent(_opsAgentFilter));
    const qs = '?' + params.join('&');
    let payload = null;
    try {
      const res = await fetch(`${_marketplaceApiBase()}/api/v1/agents/ops/runs${qs}`, {
        method: 'GET', headers, credentials: 'include',
      });
      if (res.ok) payload = await res.json();
      else if (res.status === 403) _opsRunsError = 'This action requires super-admin privileges.';
      else _opsRunsError = `Failed to load ops runs (${res.status})`;
    } catch (err) {
      _opsRunsError = err?.message || 'Failed to load ops runs.';
      payload = null;
    }
    let runs = [];
    if (payload && Array.isArray(payload.runs)) runs = payload.runs;
    else if (payload && Array.isArray(payload.items)) runs = payload.items;
    _opsRuns = runs;
    return _opsRuns;
  } finally {
    _opsRunsLoading = false;
  }
}

async function _fetchOpsSla() {
  if (_opsSlaLoading) return _opsSla;
  _opsSlaLoading = true;
  _opsSlaError = null;
  try {
    if (_isMarketplaceDemoMode()) {
      _opsSla = OPS_DEMO_SLA.slice();
      return _opsSla;
    }
    const headers = { 'Content-Type': 'application/json' };
    try {
      const t = api.getToken && api.getToken();
      if (t) headers['Authorization'] = 'Bearer ' + t;
    } catch {}
    const hours = _opsSlaApiHours(_opsSlaWindowHours);
    let payload = null;
    try {
      const res = await fetch(`${_marketplaceApiBase()}/api/v1/agents/ops/sla?since_hours=${encodeURIComponent(hours)}`, {
        method: 'GET', headers, credentials: 'include',
      });
      if (res.ok) payload = await res.json();
      else if (res.status === 403) _opsSlaError = 'This action requires super-admin privileges.';
      else _opsSlaError = `Failed to load SLA rollup (${res.status})`;
    } catch (err) {
      _opsSlaError = err?.message || 'Failed to load SLA rollup.';
      payload = null;
    }
    let rollup = [];
    if (payload && Array.isArray(payload.rollup)) rollup = payload.rollup;
    else if (payload && Array.isArray(payload.items)) rollup = payload.items;
    _opsSla = rollup;
    return _opsSla;
  } finally {
    _opsSlaLoading = false;
  }
}

async function _fetchOpsAbuse() {
  if (_opsAbuseLoading) return _opsAbuse;
  _opsAbuseLoading = true;
  _opsAbuseError = null;
  try {
    if (_isMarketplaceDemoMode()) {
      _opsAbuse = OPS_DEMO_ABUSE.slice();
      return _opsAbuse;
    }
    const headers = { 'Content-Type': 'application/json' };
    try {
      const t = api.getToken && api.getToken();
      if (t) headers['Authorization'] = 'Bearer ' + t;
    } catch {}
    let payload = null;
    try {
      const res = await fetch(`${_marketplaceApiBase()}/api/v1/agents/ops/abuse-signals?window_minutes=60`, {
        method: 'GET', headers, credentials: 'include',
      });
      if (res.ok) payload = await res.json();
      else if (res.status === 403) _opsAbuseError = 'This action requires super-admin privileges.';
      else _opsAbuseError = `Failed to load abuse signals (${res.status})`;
    } catch (err) {
      _opsAbuseError = err?.message || 'Failed to load abuse signals.';
      payload = null;
    }
    let items = [];
    if (payload && Array.isArray(payload.signals)) items = payload.signals;
    else if (payload && Array.isArray(payload.items)) items = payload.items;
    _opsAbuse = items;
    return _opsAbuse;
  } finally {
    _opsAbuseLoading = false;
  }
}

function _renderOpsRunsCard(agents) {
  const agentOptions = Array.isArray(agents) && agents.length ? agents : MARKETPLACE_DEMO_AGENTS;
  const optionsHtml = ['<option value="">All agents</option>']
    .concat(agentOptions.map(a => {
      const sel = _opsAgentFilter === a.id ? ' selected' : '';
      return `<option value="${_esc(a.id)}"${sel}>${_esc(a.name || a.id)}</option>`;
    }))
    .join('');

  const filterRow = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap">
      <input id="ops-clinic-filter" class="form-control" type="text" placeholder="clinic_id (optional)" value="${_esc(_opsClinicFilter)}" style="font-size:11.5px;padding:4px 8px;max-width:200px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace">
      <select class="form-control" onchange="window._agentOpsSetAgentFilter(this.value)" style="font-size:11.5px;padding:4px 8px;max-width:200px">${optionsHtml}</select>
      <button class="btn btn-sm btn-primary" onclick="window._agentOpsRefresh()" style="font-size:11px" ${_opsRunsLoading ? 'disabled' : ''}>${_opsRunsLoading ? 'Refreshing…' : '↻ Refresh'}</button>
      ${_opsRunsError ? `<span style="font-size:11px;color:var(--red,#ef4444)">${_esc(_opsRunsError)}</span>` : ''}
    </div>
  `;

  let tableBlock;
  if (_opsRuns === null) {
    tableBlock = `<div class="muted" style="padding:14px 16px;font-size:11.5px;color:var(--text-tertiary)">Loading cross-clinic runs…</div>`;
  } else if (!_opsRuns.length) {
    tableBlock = `<div class="muted" style="padding:14px 16px;font-size:11.5px;color:var(--text-tertiary)">No runs match the current filter.</div>`;
  } else {
    const agentNameById = new Map();
    for (const a of agentOptions) agentNameById.set(a.id, a.name || a.id);
    const rows = _opsRuns.map(r => {
      const when = _esc(_relTime(r.created_at));
      const clinic = _esc(String(r.clinic_id || ''));
      const agentName = _esc(agentNameById.get(r.agent_id) || r.agent_id || '');
      const actorRaw = String(r.actor_id || '');
      const actorShort = actorRaw.length > 8 ? actorRaw.slice(-8) : actorRaw;
      const actor = `<span style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px">${_esc(actorShort)}</span>`;
      const message = _esc(_truncate(r.message_preview || '', 50));
      const reply = _esc(_truncate(r.reply_preview || '', 60));
      const grounded = _formatGroundedTools(r.context_used);
      const groundedCell = grounded.length
        ? `<span class="ds-pill" style="font-size:10px;padding:3px 9px;border-radius:99px;background:rgba(74,158,255,0.10);color:var(--blue);font-weight:600;border:1px solid rgba(74,158,255,0.25)">${_esc(grounded.join(', '))}</span>`
        : '<span style="color:var(--text-tertiary)">—</span>';
      const latency = _esc(_formatLatency(r.latency_ms));
      const cost = _esc(_formatCost(r.cost_pence));
      const status = r.ok
        ? '<span style="color:var(--green,#22c55e);font-weight:700">✓</span>'
        : `<span style="color:var(--red,#ef4444);font-weight:700">✗ ${_esc(r.error_code || 'error')}</span>`;
      return `<tr class="ds-tr">
        <td style="white-space:nowrap">${when}</td>
        <td style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px">${clinic}</td>
        <td>${agentName}</td>
        <td>${actor}</td>
        <td>${message}</td>
        <td>${reply}</td>
        <td>${groundedCell}</td>
        <td style="white-space:nowrap">${latency}</td>
        <td style="white-space:nowrap">${cost}</td>
        <td style="white-space:nowrap">${status}</td>
      </tr>`;
    }).join('');
    tableBlock = `
      <div style="overflow-x:auto">
        <table class="ds-table" style="width:100%;font-size:12px">
          <thead>
            <tr>
              <th>When</th>
              <th>Clinic</th>
              <th>Agent</th>
              <th>Actor</th>
              <th>Message</th>
              <th>Reply</th>
              <th>Grounded</th>
              <th>Latency</th>
              <th>Cost</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  return `
    <div class="card" style="padding:14px 16px;margin-bottom:14px">
      <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:8px">All runs</div>
      ${filterRow}
      ${tableBlock}
    </div>
  `;
}

function _renderOpsAbuseCard() {
  let body;
  if (_opsAbuse === null) {
    body = `<div class="muted" style="padding:8px 0;font-size:11.5px;color:var(--text-tertiary)">Loading abuse signals…</div>`;
  } else if (_opsAbuseError) {
    body = `<div style="padding:8px 0;font-size:11.5px;color:var(--red,#ef4444)">${_esc(_opsAbuseError)}</div>`;
  } else if (!_opsAbuse.length) {
    body = `<div class="muted" style="padding:8px 0;font-size:11.5px;color:var(--text-tertiary)">No abuse signals in the last hour.</div>`;
  } else {
    const sevColor = sev => {
      const s = String(sev || '').toLowerCase();
      if (s === 'high' || s === 'critical') return 'var(--red,#ef4444)';
      if (s === 'medium' || s === 'warn' || s === 'warning') return 'var(--amber,#f59e0b)';
      return 'var(--text-secondary)';
    };
    const rows = _opsAbuse.map(s => {
      const clinic = _esc(String(s.clinic_id || ''));
      const agentId = _esc(String(s.agent_id || ''));
      const runs = Number(s.runs_in_window);
      const median = Number(s.median_multiple);
      const sev = String(s.severity || 'low');
      return `<tr class="ds-tr">
        <td style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px">${clinic}</td>
        <td style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px">${agentId}</td>
        <td style="white-space:nowrap">${Number.isFinite(runs) ? runs : '—'}</td>
        <td style="white-space:nowrap">${Number.isFinite(median) ? median.toFixed(2) + '×' : '—'}</td>
        <td style="white-space:nowrap;color:${sevColor(sev)};font-weight:700">${_esc(sev)}</td>
      </tr>`;
    }).join('');
    body = `
      <div style="overflow-x:auto">
        <table class="ds-table" style="width:100%;font-size:12px">
          <thead><tr><th>Clinic</th><th>Agent</th><th>Runs in window</th><th>Median multiple</th><th>Severity</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }
  return `
    <div class="card" style="padding:14px 16px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <div style="font-size:13px;font-weight:700;color:var(--text-primary)">Abuse signals (last 60 min)</div>
        <button class="btn btn-sm btn-ghost" onclick="window._agentOpsRefreshAbuse()" style="font-size:11px" ${_opsAbuseLoading ? 'disabled' : ''}>${_opsAbuseLoading ? 'Refreshing…' : '↻ Refresh'}</button>
      </div>
      ${body}
    </div>
  `;
}

function _renderOpsSlaCard(agents) {
  // Window pill toggle — clicking a pill swaps `_opsSlaWindowHours`, clears
  // the cached rollup, and re-fetches. The 30d pill is rendered for parity
  // with other dashboards but the request is clamped to 168h (the backend
  // ceiling) so the pill displays as the "longest available window".
  const pills = OPS_SLA_WINDOW_OPTIONS.map(opt => {
    const active = _opsSlaWindowHours === opt.hours;
    const style = active
      ? 'font-size:11px;padding:3px 10px;border-radius:6px;background:var(--violet);color:#fff;border:1px solid var(--violet);font-weight:600;cursor:pointer'
      : 'font-size:11px;padding:3px 10px;border-radius:6px;background:transparent;color:var(--text-secondary);border:1px solid var(--border);font-weight:500;cursor:pointer';
    return `<button type="button" data-test="sla-window-${opt.hours}" style="${style}" onclick="window._agentOpsSetSlaWindow(${opt.hours})">${opt.label}</button>`;
  }).join('');

  const headerRow = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;gap:8px;flex-wrap:wrap">
      <div style="font-size:13px;font-weight:700;color:var(--text-primary)">Per-agent SLA (last 24h)</div>
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
        ${pills}
        <button class="btn btn-sm btn-ghost" onclick="window._agentOpsRefreshSla()" style="font-size:11px" ${_opsSlaLoading ? 'disabled' : ''}>${_opsSlaLoading ? 'Refreshing…' : '↻ Refresh'}</button>
      </div>
    </div>
  `;

  let body;
  if (_opsSla === null) {
    body = `<div class="muted" style="padding:8px 0;font-size:11.5px;color:var(--text-tertiary)">Loading per-agent SLA…</div>`;
  } else if (_opsSlaError) {
    body = `<div data-test="sla-error" style="padding:8px 0;font-size:11.5px;color:var(--red,#ef4444)">${_esc(_opsSlaError)}</div>`;
  } else if (!_opsSla.length) {
    body = `<div data-test="sla-empty" class="muted" style="padding:8px 0;font-size:11.5px;color:var(--text-tertiary)">No agent runs in the selected window.</div>`;
  } else {
    const agentNameById = new Map();
    const agentList = Array.isArray(agents) && agents.length ? agents : MARKETPLACE_DEMO_AGENTS;
    for (const a of agentList) agentNameById.set(a.id, a.name || a.id);
    const fmtMs = v => (Number.isFinite(Number(v)) ? `${Math.round(Number(v))} ms` : '—');
    const fmtPence = v => {
      const n = Number(v);
      if (!Number.isFinite(n)) return '—';
      // Pence → £ with 2 decimals.
      return '£' + (n / 100).toFixed(2);
    };
    const errCellStyle = rate => {
      const r = Number(rate || 0);
      if (r > 0.05) return 'color:var(--red,#ef4444);font-weight:700';
      if (r > 0.01) return 'color:var(--amber,#f59e0b);font-weight:700';
      return 'color:var(--text-secondary)';
    };
    const rows = _opsSla.map(r => {
      const agentId = String(r.agent_id || '');
      const name = agentNameById.get(agentId) || agentId;
      const rate = Number(r.error_rate || 0);
      const ratePct = (rate * 100).toFixed(2) + '%';
      return `<tr class="ds-tr" data-test="sla-row-${_esc(agentId)}">
        <td style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px">${_esc(agentId)}</td>
        <td>${_esc(name)}</td>
        <td style="white-space:nowrap;text-align:right">${Number(r.runs || 0)}</td>
        <td style="white-space:nowrap;text-align:right;${errCellStyle(rate)}" data-test="sla-error-rate-${_esc(agentId)}">${ratePct}</td>
        <td style="white-space:nowrap;text-align:right">${fmtMs(r.p50_ms)}</td>
        <td style="white-space:nowrap;text-align:right">${fmtMs(r.p95_ms)}</td>
        <td style="white-space:nowrap;text-align:right">${fmtPence(r.avg_cost_pence)}</td>
      </tr>`;
    }).join('');
    body = `
      <div style="overflow-x:auto">
        <table class="ds-table" data-test="sla-table" style="width:100%;font-size:12px">
          <thead>
            <tr>
              <th style="text-align:left">Agent ID</th>
              <th style="text-align:left">Name</th>
              <th style="text-align:right">Runs</th>
              <th style="text-align:right">Error rate</th>
              <th style="text-align:right">p50</th>
              <th style="text-align:right">p95</th>
              <th style="text-align:right">Avg cost</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  return `
    <div class="card" data-test="sla-card" style="padding:14px 16px;margin-bottom:14px">
      ${headerRow}
      ${body}
    </div>
  `;
}

// ── Phase 11: Stripe webhook replay card (super-admin) ──────────────────────
// Operator UI for the Phase 10 admin endpoint. The button stays disabled
// until the input matches `evt_*`. Click → confirm() → POST → render the
// JSON envelope below. Panel colour:
//   ok=true            → green
//   ok=false / 500 / network → red
//   404 (event_not_found) → amber
function _renderOpsWebhookReplayCard() {
  const input = String(_webhookReplayInput || '');
  const validInput = /^evt_/.test(input);
  const buttonDisabled = !validInput || _webhookReplayBusy;
  const buttonStyle = buttonDisabled
    ? 'font-size:11.5px;opacity:0.5;cursor:not-allowed'
    : 'font-size:11.5px';
  const buttonLabel = _webhookReplayBusy ? 'Replaying…' : 'Replay';

  let resultPanel = '';
  if (_webhookReplayResult) {
    const r = _webhookReplayResult;
    let bg, border, colour, badge, body;
    if (r.ok && r.body && r.body.ok === true) {
      bg = 'rgba(34,197,94,0.10)';
      border = 'rgba(34,197,94,0.30)';
      colour = 'var(--green,#22c55e)';
      badge = 'OK';
    } else if (r.status === 404) {
      bg = 'rgba(245,158,11,0.10)';
      border = 'rgba(245,158,11,0.30)';
      colour = 'var(--amber,#f59e0b)';
      badge = 'Event not found';
    } else {
      bg = 'rgba(239,68,68,0.10)';
      border = 'rgba(239,68,68,0.30)';
      colour = 'var(--red,#ef4444)';
      badge = r.error ? 'Error' : `HTTP ${r.status}`;
    }
    let displayObj;
    if (r.body && typeof r.body === 'object') {
      displayObj = r.body;
    } else if (r.error) {
      displayObj = { ok: false, error: r.error };
    } else {
      displayObj = { ok: false, status: r.status };
    }
    let pretty;
    try { pretty = JSON.stringify(displayObj, null, 2); }
    catch { pretty = String(displayObj); }
    body = `<pre data-test="webhook-replay-json" style="margin:6px 0 0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;white-space:pre-wrap;word-break:break-word;color:var(--text-primary)">${_esc(pretty)}</pre>`;
    resultPanel = `
      <div data-test="webhook-replay-result" style="margin-top:10px;padding:10px 12px;border-radius:6px;background:${bg};border:1px solid ${border}">
        <div style="font-size:11.5px;font-weight:700;color:${colour}">${_esc(badge)}</div>
        ${body}
      </div>
    `;
  }

  return `
    <div class="card" data-test="webhook-replay-card" style="padding:14px 16px;margin-top:14px">
      <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:4px">Replay Stripe webhook event</div>
      <div class="muted" style="font-size:11.5px;color:var(--text-tertiary);margin-bottom:10px">Re-runs subscription handler for a single Stripe event. Use when a webhook handler bug is fixed and the customer is stuck.</div>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <input
          id="webhook-replay-input"
          data-test="webhook-replay-input"
          class="form-control"
          type="text"
          placeholder="evt_..."
          value="${_esc(input)}"
          oninput="window._agentOpsWebhookReplayInput(this.value)"
          style="font-size:11.5px;padding:4px 8px;max-width:280px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace"
        >
        <button
          class="btn btn-sm btn-primary"
          data-test="webhook-replay-btn"
          onclick="window._agentOpsWebhookReplaySubmit()"
          ${buttonDisabled ? 'disabled' : ''}
          style="${buttonStyle}"
        >${buttonLabel}</button>
      </div>
      ${resultPanel}
    </div>
  `;
}

// ── Phase 13: Onboarding funnel card (super-admin) ───────────────────────────
// Lazy-fetches GET /api/v1/onboarding/funnel?days=N and caches per-window so
// re-clicking the same pill is a no-op (cache hit). On window change we only
// fetch if the cache slot is empty. Visual: two top-line conversion stats +
// 8 horizontal bars (one per funnel step) sized by count/max_count.
async function _fetchOnboardingFunnel(days) {
  const n = _onboardingFunnelClampDays(days);
  if (_onboardingFunnelLoading) return _onboardingFunnelByDays[n] || null;
  // Cache hit — caller asked for a window we already have. Skip the network.
  if (Object.prototype.hasOwnProperty.call(_onboardingFunnelByDays, n)) {
    return _onboardingFunnelByDays[n];
  }
  _onboardingFunnelLoading = true;
  _onboardingFunnelError = null;
  try {
    if (_isMarketplaceDemoMode()) {
      _onboardingFunnelByDays[n] = _onboardingFunnelDemoPayload(n);
      return _onboardingFunnelByDays[n];
    }
    const headers = { 'Content-Type': 'application/json' };
    try {
      const t = api.getToken && api.getToken();
      if (t) headers['Authorization'] = 'Bearer ' + t;
    } catch {}
    let payload = null;
    try {
      const res = await fetch(`${_marketplaceApiBase()}/api/v1/onboarding/funnel?days=${encodeURIComponent(n)}`, {
        method: 'GET', headers, credentials: 'include',
      });
      if (res.ok) payload = await res.json();
      else if (res.status === 403) _onboardingFunnelError = 'This action requires super-admin privileges.';
      else if (res.status === 422) _onboardingFunnelError = `Invalid window (HTTP 422)`;
      else _onboardingFunnelError = `Failed to load onboarding funnel (${res.status})`;
    } catch (err) {
      _onboardingFunnelError = err?.message || 'Failed to load onboarding funnel.';
      payload = null;
    }
    if (payload && typeof payload === 'object') {
      _onboardingFunnelByDays[n] = payload;
    }
    return _onboardingFunnelByDays[n] || null;
  } finally {
    _onboardingFunnelLoading = false;
  }
}

function _onboardingFunnelClampDays(days) {
  const n = Number(days);
  if (!Number.isFinite(n) || n < 1) return 1;
  if (n > 90) return 90;
  return Math.floor(n);
}

function _onboardingFunnelDemoPayload(days) {
  // Conservative demo numbers — taper through the funnel so the bars look
  // sensible. Used only when VITE_ENABLE_DEMO=1 + demo token; never in prod.
  const totals = {
    started: 120,
    package_selected: 96,
    stripe_initiated: 60,
    stripe_skipped: 24,
    agents_enabled: 70,
    team_invited: 48,
    completed: 38,
    skipped: 12,
  };
  return {
    since_days: days,
    totals,
    conversion: {
      started_to_completed: totals.started ? totals.completed / totals.started : 0,
      started_to_skipped: totals.started ? totals.skipped / totals.started : 0,
    },
  };
}

function _onboardingConversionColor(rate) {
  const r = Number(rate || 0);
  if (r > 0.25) return 'var(--green,#22c55e)';
  if (r >= 0.10) return 'var(--amber,#f59e0b)';
  return 'var(--red,#ef4444)';
}

function _renderOpsOnboardingFunnelCard() {
  const days = _onboardingFunnelClampDays(_onboardingFunnelDays);
  const cached = _onboardingFunnelByDays[days] || null;

  const pills = ONBOARDING_FUNNEL_WINDOW_OPTIONS.map(opt => {
    const active = days === opt.days;
    const style = active
      ? 'font-size:11px;padding:3px 10px;border-radius:6px;background:var(--violet);color:#fff;border:1px solid var(--violet);font-weight:600;cursor:pointer'
      : 'font-size:11px;padding:3px 10px;border-radius:6px;background:transparent;color:var(--text-secondary);border:1px solid var(--border);font-weight:500;cursor:pointer';
    return `<button type="button" data-test="funnel-window-${opt.days}" style="${style}" onclick="window._agentOpsSetFunnelWindow(${opt.days})">${opt.label}</button>`;
  }).join('');

  const headerRow = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;gap:8px;flex-wrap:wrap">
      <div style="font-size:13px;font-weight:700;color:var(--text-primary)">Onboarding funnel</div>
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
        ${pills}
      </div>
    </div>
  `;

  let body;
  if (_onboardingFunnelError) {
    body = `<div data-test="funnel-error" style="padding:10px 12px;font-size:11.5px;color:var(--red,#ef4444);background:rgba(239,68,68,0.10);border:1px solid rgba(239,68,68,0.30);border-radius:6px">${_esc(_onboardingFunnelError)}</div>`;
  } else if (cached === null) {
    body = `<div class="muted" style="padding:8px 0;font-size:11.5px;color:var(--text-tertiary)">Loading onboarding funnel…</div>`;
  } else {
    const totals = (cached && cached.totals && typeof cached.totals === 'object') ? cached.totals : {};
    const conversion = (cached && cached.conversion && typeof cached.conversion === 'object') ? cached.conversion : {};
    const completedRate = Number(conversion.started_to_completed || 0);
    const skippedRate = Number(conversion.started_to_skipped || 0);
    const completedPct = (completedRate * 100).toFixed(1) + '%';
    const skippedPct = (skippedRate * 100).toFixed(1) + '%';
    const completedColor = _onboardingConversionColor(completedRate);
    const skippedColor = _onboardingConversionColor(skippedRate);

    const stats = `
      <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:14px">
        <div data-test="funnel-stat-completed" style="flex:1 1 200px;padding:10px 12px;border:1px solid var(--border);border-radius:6px;background:var(--bg-secondary,transparent)">
          <div class="muted" style="font-size:10.5px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.04em">Started → Completed</div>
          <div data-test="funnel-stat-completed-value" style="font-size:24px;font-weight:700;color:${completedColor};margin-top:4px">${completedPct}</div>
        </div>
        <div data-test="funnel-stat-skipped" style="flex:1 1 200px;padding:10px 12px;border:1px solid var(--border);border-radius:6px;background:var(--bg-secondary,transparent)">
          <div class="muted" style="font-size:10.5px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.04em">Started → Skipped</div>
          <div data-test="funnel-stat-skipped-value" style="font-size:24px;font-weight:700;color:${skippedColor};margin-top:4px">${skippedPct}</div>
        </div>
      </div>
    `;

    // Compute max for bar normalisation. Guard against all-zero (avoid /0).
    let maxCount = 0;
    for (const step of ONBOARDING_FUNNEL_STEPS) {
      const v = Number(totals[step.key] || 0);
      if (v > maxCount) maxCount = v;
    }
    const bars = ONBOARDING_FUNNEL_STEPS.map(step => {
      const count = Number(totals[step.key] || 0);
      const pct = maxCount > 0 ? Math.max(0, Math.min(100, (count / maxCount) * 100)) : 0;
      const widthStyle = `width:${pct.toFixed(2)}%`;
      return `
        <div data-test="funnel-bar-${step.key}" style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
          <div style="flex:0 0 140px;font-size:11.5px;color:var(--text-secondary)">${_esc(step.label)}</div>
          <div style="flex:1;height:14px;background:var(--bg-secondary,rgba(127,127,127,0.10));border-radius:4px;overflow:hidden;border:1px solid var(--border)">
            <div style="${widthStyle};height:100%;background:var(--violet);min-width:${count > 0 ? '2px' : '0'}"></div>
          </div>
          <div data-test="funnel-bar-count-${step.key}" style="flex:0 0 60px;text-align:right;font-size:11.5px;font-variant-numeric:tabular-nums;color:var(--text-primary);font-weight:600">${count}</div>
        </div>
      `;
    }).join('');

    body = `
      ${stats}
      <div data-test="funnel-bars">${bars}</div>
    `;
  }

  return `
    <div class="card" data-test="funnel-card" style="padding:14px 16px;margin-top:14px">
      ${headerRow}
      ${body}
    </div>
  `;
}

function _renderOpsSection(agents) {
  const sectionHeader = `
    <div style="margin-bottom:10px">
      <div style="font-size:14px;font-weight:700;color:var(--text-primary)">Cross-clinic ops</div>
      <div class="muted" style="font-size:11.5px;color:var(--text-tertiary);margin-top:2px">Super-admin view across every clinic.</div>
    </div>
  `;
  return `
    ${sectionHeader}
    ${_renderOpsSlaCard(agents)}
    ${_renderOpsRunsCard(agents)}
    ${_renderOpsAbuseCard()}
    ${_renderOpsWebhookReplayCard()}
    ${_renderOpsOnboardingFunnelCard()}
  `;
}

// ── Phase 9: Prompt overrides (super-admin) ─────────────────────────────────
// Lazy-fetch the override list. Backend returns `{ overrides: [...] }` with
// rows shaped as { id, agent_id, clinic_id, system_prompt, version, enabled,
// created_at, created_by }. We surface only the most recent enabled row per
// agent_id (clinic-scoped if the actor has a clinic_id, otherwise global).
async function _fetchPromptOverrides() {
  if (_promptOverridesLoading) return _promptOverridesList;
  _promptOverridesLoading = true;
  _promptOverridesError = null;
  try {
    if (_isMarketplaceDemoMode()) {
      _promptOverridesList = [];
      return _promptOverridesList;
    }
    const headers = { 'Content-Type': 'application/json' };
    try {
      const t = api.getToken && api.getToken();
      if (t) headers['Authorization'] = 'Bearer ' + t;
    } catch {}
    let payload = null;
    try {
      const res = await fetch(`${_marketplaceApiBase()}/api/v1/agents/admin/prompt-overrides`, {
        method: 'GET', headers, credentials: 'include',
      });
      if (res.ok) payload = await res.json();
      else if (res.status === 403) _promptOverridesError = 'This action requires super-admin privileges.';
      else _promptOverridesError = `Failed to load prompt overrides (${res.status})`;
    } catch (err) {
      _promptOverridesError = err?.message || 'Failed to load prompt overrides.';
      payload = null;
    }
    let items = [];
    if (payload && Array.isArray(payload.overrides)) items = payload.overrides;
    else if (payload && Array.isArray(payload.items)) items = payload.items;
    _promptOverridesList = items;
    return _promptOverridesList;
  } finally {
    _promptOverridesLoading = false;
  }
}

// Resolve the active enabled override row (if any) for a given agent_id from
// the cached list. Returns the most-recent enabled row, ignoring disabled
// (soft-deleted) rows so the UI matches what the runner actually applies.
function _activeOverrideForAgent(agentId) {
  if (!Array.isArray(_promptOverridesList)) return null;
  const rows = _promptOverridesList.filter(r => r && r.agent_id === agentId && r.enabled !== false);
  if (!rows.length) return null;
  // Pick highest version, falling back to created_at if version missing.
  rows.sort((a, b) => {
    const va = Number(a.version || 0);
    const vb = Number(b.version || 0);
    if (va !== vb) return vb - va;
    const ta = String(a.created_at || '');
    const tb = String(b.created_at || '');
    return tb.localeCompare(ta);
  });
  return rows[0];
}

// ── Phase 12: prompt-override version history (super-admin) ─────────────────
// Hits the Phase 11C endpoint and caches the DESC-ordered list per agent_id.
// On error we set `_promptHistoryError` (rendered red inline inside the drawer)
// and leave the cache untouched so a successful retry doesn't blink stale data.
async function _fetchPromptHistory(agentId) {
  if (!agentId) return [];
  if (_promptHistoryLoading) return _promptHistoryByAgent[agentId] || [];
  _promptHistoryLoading = true;
  _promptHistoryError = null;
  try {
    if (_isMarketplaceDemoMode()) {
      _promptHistoryByAgent[agentId] = _promptHistoryByAgent[agentId] || [];
      return _promptHistoryByAgent[agentId];
    }
    const headers = { 'Content-Type': 'application/json' };
    try {
      const t = api.getToken && api.getToken();
      if (t) headers['Authorization'] = 'Bearer ' + t;
    } catch {}
    let payload = null;
    try {
      const url = `${_marketplaceApiBase()}/api/v1/agents/admin/prompt-overrides/${encodeURIComponent(agentId)}/history?limit=20`;
      const res = await fetch(url, { method: 'GET', headers, credentials: 'include' });
      if (res.ok) payload = await res.json();
      else if (res.status === 403) _promptHistoryError = 'This action requires super-admin privileges.';
      else _promptHistoryError = `Failed to load history (${res.status}).`;
    } catch (err) {
      _promptHistoryError = err?.message || 'Failed to load history.';
      payload = null;
    }
    let items = [];
    if (payload && Array.isArray(payload.history)) items = payload.history;
    else if (payload && Array.isArray(payload.items)) items = payload.items;
    _promptHistoryByAgent[agentId] = items;
    return items;
  } finally {
    _promptHistoryLoading = false;
  }
}

// Tiny line-by-line LCS diff. Returns an array of {kind, text} where kind is
// one of 'eq' | 'add' | 'del'. Matches the unified-diff convention: removed
// lines from `prev` come before the corresponding added lines from `curr`.
// Naïve O(n*m) DP — fine for the ~20-line system prompts we're diffing in
// this drawer; we deliberately avoid a library dependency per the brief.
function _diffLines(prev, curr) {
  const a = String(prev || '').split('\n');
  const b = String(curr || '').split('\n');
  const m = a.length;
  const n = b.length;
  // dp[i][j] = LCS length of a[i..] vs b[j..]
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out = [];
  let i = 0, j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) { out.push({ kind: 'eq', text: a[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ kind: 'del', text: a[i] }); i++; }
    else { out.push({ kind: 'add', text: b[j] }); j++; }
  }
  while (i < m) { out.push({ kind: 'del', text: a[i++] }); }
  while (j < n) { out.push({ kind: 'add', text: b[j++] }); }
  return out;
}

function _renderPromptHistoryDiff(prevRow, currRow) {
  const lines = _diffLines(prevRow ? prevRow.system_prompt : '', currRow ? currRow.system_prompt : '');
  const styleEq  = 'color:var(--text-tertiary)';
  const styleAdd = 'background:rgba(34,197,94,0.10);color:var(--green,#22c55e)';
  const styleDel = 'background:rgba(239,68,68,0.10);color:var(--red,#ef4444)';
  const rendered = lines.map(l => {
    if (l.kind === 'add') return `<div data-test="prompt-diff-add" style="${styleAdd};padding:1px 6px">+ ${_esc(l.text)}</div>`;
    if (l.kind === 'del') return `<div data-test="prompt-diff-del" style="${styleDel};padding:1px 6px">- ${_esc(l.text)}</div>`;
    return `<div style="${styleEq};padding:1px 6px">  ${_esc(l.text)}</div>`;
  }).join('');
  return `<pre data-test="prompt-diff-pre" style="margin:0;padding:8px;border:1px solid rgba(255,255,255,0.06);border-radius:6px;background:rgba(0,0,0,0.18);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;line-height:1.45;white-space:pre-wrap;overflow-x:auto">${rendered}</pre>`;
}

function _renderPromptHistoryDrawer(agentId, agentName) {
  const list = _promptHistoryByAgent[agentId];
  // Loading state — list not yet seeded for this agent and a fetch is in flight.
  if (list === undefined || list === null) {
    return `
      <tr data-test="prompts-history-row-${_esc(agentId)}">
        <td colspan="4" style="padding:10px 12px;background:rgba(255,255,255,0.02)">
          <div style="font-size:11.5px;color:var(--text-tertiary)">Loading override history…</div>
        </td>
      </tr>
    `;
  }
  const errorBlock = _promptHistoryError
    ? `<div data-test="prompts-history-error" style="margin-bottom:8px;padding:8px 12px;border-radius:6px;background:rgba(239,68,68,0.10);border:1px solid rgba(239,68,68,0.30);color:var(--red,#ef4444);font-size:11.5px">${_esc(_promptHistoryError)}</div>`
    : '';
  if (!list.length) {
    return `
      <tr data-test="prompts-history-row-${_esc(agentId)}">
        <td colspan="4" style="padding:10px 12px;background:rgba(255,255,255,0.02)">
          <div style="font-size:12px;font-weight:600;color:var(--text-primary);margin-bottom:6px">Override history — ${_esc(agentName || agentId)}</div>
          ${errorBlock}
          <div data-test="prompts-history-empty" style="font-size:11.5px;color:var(--text-tertiary)">No history yet — this agent uses the default prompt.</div>
        </td>
      </tr>
    `;
  }
  // List is DESC by version (server contract). Map index → previous-version row
  // is just `list[idx + 1]` because the next index is one version older.
  const versionRows = list.map((row, idx) => {
    const prev = list[idx + 1] || null;
    const diffKey = `${agentId}:${row.version}`;
    const diffOpen = _promptHistoryDiffOpen === diffKey;
    const diffDisabled = !prev;
    const diffBtnAttr = diffDisabled ? 'disabled' : '';
    const activeBadge = row.is_active
      ? '<span class="ds-pill" data-test="prompts-history-active" style="font-size:10px;padding:2px 7px;border-radius:99px;background:rgba(34,197,94,0.12);color:var(--green,#22c55e);font-weight:600;border:1px solid rgba(34,197,94,0.25)">active</span>'
      : '<span class="ds-pill" style="font-size:10px;padding:2px 7px;border-radius:99px;background:rgba(255,255,255,0.04);color:var(--text-tertiary);font-weight:600;border:1px solid rgba(255,255,255,0.08)">inactive</span>';
    const diffCellInner = diffOpen
      ? `<tr data-test="prompts-history-diff-row-${_esc(agentId)}-${_esc(String(row.version))}">
           <td colspan="4" style="padding:8px 12px;background:rgba(0,0,0,0.10)">
             <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:6px">Diff v${_esc(String(prev ? prev.version : '?'))} → v${_esc(String(row.version))}</div>
             ${_renderPromptHistoryDiff(prev, row)}
           </td>
         </tr>`
      : '';
    return `
      <tr data-test="prompts-history-version-row-${_esc(agentId)}-${_esc(String(row.version))}">
        <td style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px">v${_esc(String(row.version))}</td>
        <td style="font-size:11px;color:var(--text-secondary)">${_esc(String(row.created_at || ''))}</td>
        <td style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;color:var(--text-secondary)">${_esc(String(row.created_by_id || '—'))}</td>
        <td style="white-space:nowrap">${activeBadge}</td>
        <td style="white-space:nowrap;text-align:right">
          <button class="btn btn-sm btn-ghost" data-test="prompts-history-diff-btn-${_esc(agentId)}-${_esc(String(row.version))}" style="font-size:11px" onclick="window._agentPromptHistoryDiffToggle('${_esc(agentId)}', ${Number(row.version) || 0})" ${diffBtnAttr}>${diffOpen ? 'Hide diff' : 'Diff vs previous'}</button>
        </td>
      </tr>
      ${diffCellInner}
    `;
  }).join('');

  return `
    <tr data-test="prompts-history-row-${_esc(agentId)}">
      <td colspan="4" style="padding:10px 12px;background:rgba(255,255,255,0.02)">
        <div style="font-size:12px;font-weight:600;color:var(--text-primary);margin-bottom:8px">Override history — ${_esc(agentName || agentId)}</div>
        ${errorBlock}
        <div style="overflow-x:auto">
          <table class="ds-table" data-test="prompts-history-table-${_esc(agentId)}" style="width:100%;font-size:12px">
            <thead>
              <tr>
                <th style="text-align:left">Version</th>
                <th style="text-align:left">Created</th>
                <th style="text-align:left">Author</th>
                <th style="text-align:left">Active?</th>
                <th></th>
              </tr>
            </thead>
            <tbody>${versionRows}</tbody>
          </table>
        </div>
      </td>
    </tr>
  `;
}

function _renderPromptOverridesSection(agents) {
  const sectionHeader = `
    <div style="margin-bottom:8px">
      <div style="font-size:14px;font-weight:700;color:var(--text-primary)">Agent prompt overrides (super-admin)</div>
    </div>
    <div class="card" style="padding:10px 12px;margin-bottom:12px;border-left:3px solid var(--violet);background:rgba(155,127,255,0.06);font-size:11.5px;color:var(--text-secondary);line-height:1.55">
      Override the default system prompt used for an agent. Saved overrides apply to every run for the actor's clinic on the next invocation. Reset removes the override and falls back to the registry default.
    </div>
  `;

  const noticeBlock = (() => {
    if (!_promptNotice) return '';
    const n = _promptNotice;
    const map = {
      success: { bg: 'rgba(34,197,94,0.10)', border: 'rgba(34,197,94,0.30)', color: 'var(--green,#22c55e)' },
      error:   { bg: 'rgba(239,68,68,0.10)', border: 'rgba(239,68,68,0.30)', color: 'var(--red,#ef4444)' },
      info:    { bg: 'rgba(74,158,255,0.10)', border: 'rgba(74,158,255,0.30)', color: 'var(--blue)' },
    };
    const c = map[n.kind] || map.info;
    return `<div data-test="prompts-notice" style="margin-bottom:10px;padding:8px 12px;border-radius:6px;background:${c.bg};border:1px solid ${c.border};color:${c.color};font-size:11.5px">${_esc(n.text)}</div>`;
  })();

  let tableBlock;
  if (_promptOverridesList === null) {
    tableBlock = `<div class="card" style="padding:14px 16px;font-size:11.5px;color:var(--text-tertiary)">Loading prompt overrides…</div>`;
  } else if (_promptOverridesError) {
    tableBlock = `<div class="card" style="padding:14px 16px;font-size:11.5px;color:var(--red,#ef4444)">${_esc(_promptOverridesError)}</div>`;
  } else {
    // Use the loaded marketplace catalog so the table covers every agent the
    // backend knows about. Falls back to demo agents on first paint.
    const catalogAgents = Array.isArray(agents) && agents.length ? agents : MARKETPLACE_DEMO_AGENTS;
    if (!catalogAgents.length) {
      tableBlock = `<div class="card" style="padding:14px 16px;font-size:11.5px;color:var(--text-tertiary)">No agents in the catalog yet.</div>`;
    } else {
      const rows = catalogAgents.map(a => {
        const agentId = String(a.id || '');
        const override = _activeOverrideForAgent(agentId);
        const isCustom = !!override;
        const editing = _promptEditingAgentId === agentId;
        const badge = isCustom
          ? '<span class="ds-pill" data-test="prompts-badge-custom" style="font-size:10px;padding:3px 9px;border-radius:99px;background:rgba(155,127,255,0.12);color:var(--violet);font-weight:600;border:1px solid rgba(155,127,255,0.25)">Custom</span>'
          : '<span class="ds-pill" data-test="prompts-badge-default" style="font-size:10px;padding:3px 9px;border-radius:99px;background:rgba(74,158,255,0.10);color:var(--blue);font-weight:600;border:1px solid rgba(74,158,255,0.25)">Default</span>';
        const editBtnLabel = editing ? 'Close' : (isCustom ? 'View / Edit' : 'View / Edit');
        const busyAttr = _promptOverridesBusy ? 'disabled' : '';
        const editorBlock = editing ? `
          <tr data-test="prompts-editor-row-${_esc(agentId)}">
            <td colspan="4" style="padding:10px 12px;background:rgba(255,255,255,0.02)">
              <div class="form-group" style="margin:0 0 8px">
                <label class="form-label" style="font-size:11px">System prompt override</label>
                <textarea id="prompt-override-textarea" data-test="prompts-textarea" class="form-control" rows="8" placeholder="Enter the override system prompt for this agent…" style="width:100%;resize:vertical;font-size:12px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace" ${busyAttr} oninput="window._agentPromptOverrideDraftInput(this.value)">${_esc(_promptDraft || '')}</textarea>
              </div>
              ${_promptEditorError ? `<div data-test="prompts-editor-error" style="margin-bottom:8px;font-size:11.5px;color:var(--red,#ef4444)">${_esc(_promptEditorError)}</div>` : ''}
              <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                <button class="btn btn-sm btn-primary" data-test="prompts-save-btn" onclick="window._agentPromptOverrideSave('${_esc(agentId)}')" ${busyAttr}>${_promptOverridesBusy ? 'Saving…' : 'Save'}</button>
                ${isCustom ? `<button class="btn btn-sm btn-ghost" data-test="prompts-reset-btn" style="font-size:11px;color:var(--red,#ef4444)" onclick="window._agentPromptOverrideReset('${_esc(agentId)}')" ${busyAttr}>Reset to default</button>` : ''}
                <button class="btn btn-sm btn-ghost" style="font-size:11px" onclick="window._agentPromptOverrideCancel()" ${busyAttr}>Cancel</button>
                ${isCustom && override?.version ? `<span class="muted" style="font-size:10.5px;color:var(--text-tertiary);margin-left:auto">v${_esc(String(override.version))}${override.created_by ? ' · ' + _esc(String(override.created_by)) : ''}</span>` : ''}
              </div>
            </td>
          </tr>
        ` : '';
        const historyOpen = _promptHistoryOpenAgentId === agentId;
        const historyBtnLabel = historyOpen ? 'Hide history' : 'History';
        const historyDrawer = historyOpen ? _renderPromptHistoryDrawer(agentId, a.name || agentId) : '';
        return `
          <tr class="ds-tr" data-test="prompts-row-${_esc(agentId)}">
            <td style="font-size:12px;font-weight:600;color:var(--text-primary)">${_esc(a.name || agentId)}</td>
            <td style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px">${_esc(agentId)}</td>
            <td style="white-space:nowrap">${badge}</td>
            <td style="white-space:nowrap;text-align:right">
              <button class="btn btn-sm btn-ghost" data-test="prompts-edit-btn-${_esc(agentId)}" style="font-size:11px" onclick="window._agentPromptOverrideEdit('${_esc(agentId)}')" ${busyAttr}>${editBtnLabel}</button>
              <button class="btn btn-sm btn-ghost" data-test="prompts-history-btn-${_esc(agentId)}" style="font-size:11px;margin-left:6px" onclick="window._agentPromptHistoryToggle('${_esc(agentId)}')" ${busyAttr}>${historyBtnLabel}</button>
            </td>
          </tr>
          ${editorBlock}
          ${historyDrawer}
        `;
      }).join('');
      tableBlock = `
        <div style="overflow-x:auto">
          <table class="ds-table" data-test="prompts-table" style="width:100%;font-size:12px">
            <thead>
              <tr>
                <th>Agent</th>
                <th>ID</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `;
    }
  }

  return `
    ${sectionHeader}
    ${noticeBlock}
    ${tableBlock}
  `;
}

function _renderToolConfirmCard(pending, agentId) {
  if (!pending) return '';
  const callId = _esc(String(pending.call_id || ''));
  const aid = _esc(String(agentId || ''));
  const summary = _esc(String(pending.summary || ''));
  const toolId = _esc(String(pending.tool_id || ''));
  let argsJson = '';
  try { argsJson = JSON.stringify(pending.args ?? {}, null, 2); } catch { argsJson = String(pending.args ?? ''); }
  const argsEsc = _esc(argsJson);
  const expires = _esc(_expiresIn(pending.expires_at));
  return `
    <div class="ds-tool-confirm-card" style="margin-top:10px;border:1px solid var(--amber, #f59e0b);background:rgba(245,158,11,0.08);padding:12px;border-radius:8px">
      <div style="font-weight:700;color:var(--amber, #f59e0b);font-size:13px;margin-bottom:6px">⚠ Action requires your approval</div>
      <div style="font-size:13px;margin-bottom:8px">${summary}</div>
      <details style="margin-bottom:10px"><summary style="font-size:11px;cursor:pointer;color:var(--muted)">Show details</summary>
        <pre style="font-size:11px;background:rgba(0,0,0,0.2);padding:8px;border-radius:4px;margin-top:6px;overflow:auto">${toolId}\n${argsEsc}</pre>
      </details>
      <div style="display:flex;gap:8px">
        <button class="btn btn-sm btn-primary" onclick="window._agentApproveToolCall('${callId}', '${aid}')">Approve</button>
        <button class="btn btn-sm btn-ghost" onclick="window._agentRejectToolCall('${callId}', '${aid}')">Reject</button>
        <span style="margin-left:auto;font-size:10px;color:var(--muted)">Expires ${expires}</span>
      </div>
    </div>
  `;
}

function _renderToolExecutedCard(executed) {
  if (!executed) return '';
  const ok = !!executed.ok;
  const border = ok ? 'var(--green)' : 'var(--red)';
  const bg = ok ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)';
  const label = ok ? '✓ Done' : '✗ Failed';
  const result = _esc(String(executed.result ?? ''));
  return `
    <div style="margin-top:10px;border:1px solid ${border};background:${bg};padding:10px;border-radius:8px;font-size:13px">
      <span style="font-weight:700">${label}</span> — ${result}
    </div>
  `;
}

function _renderToolCancelledCard() {
  return `
    <div style="margin-top:10px;padding:8px 10px;border-radius:6px;background:rgba(255,255,255,0.03);border:1px solid var(--border);font-size:12px;color:var(--text-tertiary)">Cancelled.</div>
  `;
}

function _renderMarketplaceModal() {
  if (!_marketplaceModalAgent) return '';
  const a = _marketplaceModalAgent;
  const groundedTools = _marketplaceModalReply ? _formatGroundedTools(_marketplaceModalReply.context_used) : [];
  const groundedBlock = groundedTools.length
    ? `<div class="ds-agent-grounded muted" style="font-size:11px;margin-top:6px;display:flex;align-items:center;gap:6px;flex-wrap:wrap">
         <span class="ds-pill ds-pill-info" style="font-size:10px;padding:3px 9px;border-radius:99px;background:rgba(74,158,255,0.10);color:var(--blue);font-weight:600;border:1px solid rgba(74,158,255,0.25)">Grounded in:</span>
         <span>${_isMarketplaceDemoMode() ? '(demo) ' : ''}${_esc(groundedTools.join(', '))}</span>
       </div>`
    : '';
  // Tool-call slot ordering: confirmation card (if pending) → executed result
  // (if a tool just ran) → cancelled sentinel (if user just rejected). Only
  // one of these is meaningful at a time; we render whichever is set.
  const toolBlock = _marketplaceModalPendingCall
    ? _renderToolConfirmCard(_marketplaceModalPendingCall, a.id)
    : _marketplaceModalExecuted
      ? _renderToolExecutedCard(_marketplaceModalExecuted)
      : _marketplaceModalCancelled
        ? _renderToolCancelledCard()
        : '';
  const replyBlock = _marketplaceModalReply
    ? `<div style="margin-top:12px;padding:12px;border-radius:8px;background:rgba(255,255,255,0.04);border:1px solid var(--border);font-size:12px;color:var(--text-primary);line-height:1.55;white-space:pre-wrap">${_formatAgentText(_marketplaceModalReply.reply || '(empty reply)')}
        ${groundedBlock}
        ${toolBlock}
        <div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--border);font-size:10.5px;color:var(--text-tertiary);font-style:italic">${_esc(_marketplaceModalReply.safety_footer || 'Decision-support, not autonomous diagnosis.')}</div>
      </div>`
    : '';
  const errBlock = _marketplaceModalError
    ? `<div style="margin-top:12px;padding:10px 12px;border-radius:8px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);font-size:11.5px;color:var(--red,#ef4444)">${_esc(_marketplaceModalError)}</div>`
    : '';
  const busyAttr = _marketplaceModalBusy ? 'disabled' : '';

  // Phase 7: suggestion chips above the textarea. Pre-fills the input on
  // click — never auto-sends. Patient-side agents have an empty list (locked).
  // The chip text is stuffed into a `data-chip` attribute (HTML-escaped) so
  // arbitrary apostrophes/quotes round-trip safely; the inline onclick reads
  // it back via `this.dataset.chip` rather than fighting nested-quote escapes.
  const chipList = Array.isArray(_MARKETPLACE_CHIPS[a.id]) ? _MARKETPLACE_CHIPS[a.id] : [];
  const chipRow = chipList.length
    ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
        ${chipList.map(text => {
          const safeAttr = _esc(text);
          return `<button type="button" class="btn btn-sm btn-ghost" style="font-size:11px;padding:3px 9px" data-chip="${safeAttr}" onclick="window._agentMarketplaceChip(this.dataset.chip)">${safeAttr}</button>`;
        }).join('')}
      </div>`
    : '';

  return `
    <div class="ds-modal-overlay" onclick="if(event.target===this){window._agentMarketplaceModalClose()}">
      <div class="ds-modal" style="min-width:420px;max-width:560px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px">
          <div>
            <div style="font-size:15px;font-weight:700;color:var(--text-primary)">${_esc(a.name || a.id)}</div>
            <div style="font-size:11.5px;color:var(--text-tertiary);margin-top:2px">${_esc(a.tagline || '')}</div>
          </div>
          <button class="btn btn-sm btn-ghost" onclick="window._agentMarketplaceModalClose()" style="font-size:14px;padding:2px 10px">×</button>
        </div>
        ${chipRow}
        <textarea id="agent-marketplace-input" class="form-control" rows="4" placeholder="Ask this agent anything…" style="width:100%;resize:vertical;font-size:12.5px"></textarea>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px">
          <button class="btn btn-sm btn-ghost" onclick="window._agentMarketplaceModalClose()" ${busyAttr}>Close</button>
          <button class="btn btn-sm btn-primary" onclick="window._agentMarketplaceModalSend()" ${busyAttr}>${_marketplaceModalBusy ? 'Sending…' : 'Send'}</button>
        </div>
        ${errBlock}
        ${replyBlock}
      </div>
    </div>
  `;
}

// ── Hub View ─────────────────────────────────────────────────────────────────
function _renderHub(setTopbar) {
  setTopbar('AI Practice Agents', `
    <button class="btn btn-sm btn-ghost" onclick="window._agentOpenConfig()" style="font-size:11.5px">⚙ Settings</button>
  `);

  const el = document.getElementById('content');
  if (!el) return;

  const tasks = _loadTasks();
  const pendingTasks = tasks.filter(t => t.status === 'pending' || t.status === 'in_progress');
  const tgState = _agentTelegramState();
  const provLabel = (PROVIDERS.find(p => p.id === _agentProvider) || PROVIDERS[0]).label;
  const activity = _loadActivity().slice(0, 8);
  const userName = (() => { try { return JSON.parse(localStorage.getItem('ds_user') || '{}').display_name || JSON.parse(localStorage.getItem('ds_user') || '{}').name || 'Doctor'; } catch { return 'Doctor'; } })();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  // ── DeepTwin handoff banner (picks up ds_agent_handoff_context) ──────────
  let _twinHandoffBanner = '';
  try {
    const raw = sessionStorage.getItem('ds_agent_handoff_context');
    if (raw) {
      const ctx = JSON.parse(raw);
      const patientLabel = _esc(String(ctx.patient_id || 'patient'));
      const kindLabel = _esc(String(ctx.label || ctx.kind || 'DeepTwin handoff'));
      const submitted = ctx.submitted_at ? new Date(ctx.submitted_at).toLocaleString() : '';
      const auditRef = _esc(String(ctx.audit_ref || ''));
      _twinHandoffBanner = `
        <div class="card" style="padding:14px 16px;margin-bottom:16px;border-left:3px solid var(--teal);background:linear-gradient(135deg,rgba(0,212,188,0.06),rgba(74,158,255,0.04))">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
            <div>
              <div style="font-size:11px;color:var(--teal);text-transform:uppercase;letter-spacing:.06em">DeepTwin handoff received</div>
              <div style="font-size:14px;font-weight:650;color:var(--text-primary);margin-top:2px">${kindLabel} · patient ${patientLabel}</div>
              <div style="font-size:11.5px;color:var(--text-tertiary);margin-top:2px">${_esc(submitted)} · audit_ref <code style="font-size:11px">${auditRef}</code></div>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button class="btn btn-sm btn-primary" onclick="window._agentOpenChat('clinician')">Open in clinician chat</button>
              <button class="btn btn-sm btn-ghost" onclick="(function(){ try { sessionStorage.removeItem('ds_agent_handoff_context'); } catch(e){} ; window._agentBackToHub && window._agentBackToHub(); })()">Dismiss</button>
            </div>
          </div>
          <div style="font-size:11.5px;color:var(--text-tertiary);margin-top:8px">Decision-support context only — clinician must review before any treatment action.</div>
        </div>
      `;
    }
  } catch { /* ignore */ }

  el.innerHTML = `<div class="dv2-hub-shell" style="padding:20px;display:flex;flex-direction:column;gap:16px"><div class="agent-hub">
    ${_twinHandoffBanner}
    <!-- Welcome banner -->
    <div class="card" style="padding:20px 24px;margin-bottom:20px;border-left:3px solid var(--violet);background:linear-gradient(135deg,rgba(155,127,255,0.05),rgba(0,212,188,0.03))">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
        <div>
          <div style="font-size:18px;font-weight:700;color:var(--text-primary);margin-bottom:4px">${greeting}, ${_esc(userName.split(' ')[0])}</div>
          <div style="font-size:12px;color:var(--text-secondary)">Your AI practice assistants are ready. Pick a skill below or start a conversation.</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <span style="font-size:10px;padding:3px 10px;border-radius:99px;background:rgba(74,222,128,0.12);color:var(--green,#22c55e);font-weight:600">${provLabel} active</span>
          <span class="agent-openclaw-badge">Powered by OpenClaw</span>
          ${tgState === 'pending'
            ? '<span style="font-size:10px;padding:3px 10px;border-radius:99px;background:rgba(255,179,71,0.14);color:var(--amber,#f59e0b);font-weight:600">✈ Telegram link code issued</span>'
            : `<button class="btn btn-sm" style="font-size:10px;border-color:var(--blue);color:var(--blue)" onclick="window._agentOpenConfig()">Connect Telegram</button>`}
        </div>
      </div>
    </div>

    <!-- Agent Marketplace (above existing clinician/patient launch cards) -->
    ${_renderMarketplaceSection()}

    <!-- Two agent launch cards -->
    <div class="agent-hub-grid" style="margin-bottom:20px">
      <button class="card agent-card--clinician" style="cursor:pointer;text-align:left;padding:16px 20px" onclick="window._agentOpenChat('clinician')">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
          <span style="font-size:20px">🩺</span>
          <span style="font-size:15px;font-weight:700;color:var(--text-primary)">Clinic Agent</span>
          <span class="agent-card__status-dot agent-card__status-dot--active" style="margin-left:auto"></span>
        </div>
        <div style="font-size:10px;color:var(--text-tertiary);margin-bottom:4px">OpenClaw Agent</div>
        <div style="font-size:11.5px;color:var(--text-secondary);line-height:1.5">Your AI receptionist and clinical assistant. Manages patients, reports, scheduling, and clinic communications.</div>
      </button>
      <button class="card agent-card--patient" style="cursor:pointer;text-align:left;padding:16px 20px" onclick="window._agentOpenChat('patient')">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
          <span style="font-size:20px">👤</span>
          <span style="font-size:15px;font-weight:700;color:var(--text-primary)">Patient Agent</span>
          <span class="agent-card__status-dot agent-card__status-dot--active" style="margin-left:auto"></span>
        </div>
        <div style="font-size:10px;color:var(--text-tertiary);margin-bottom:4px">OpenClaw Agent</div>
        <div style="font-size:11.5px;color:var(--text-secondary);line-height:1.5">Patient-facing assistant. Answers treatment questions, tracks homework, explains care — scoped per patient.</div>
      </button>
    </div>

    <!-- Skills Sort Bar -->
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
      <span style="font-size:11px;color:var(--text-tertiary)">Sort:</span>
      ${[['default','Default'],['name','Name A→Z'],['name-desc','Name Z→A'],['category','Category']].map(([k,l]) =>
        `<button class="btn btn-sm ${_skillSort===k?'btn-primary':'btn-ghost'}" style="font-size:10px;padding:3px 10px" onclick="window._agentSetSkillSort('${k}')">${l}</button>`
      ).join('')}
    </div>

    <!-- Skills Grid -->
    ${(() => {
      let skills = CLINICIAN_SKILLS.slice();
      if (_skillSort === 'name') skills.sort((a,b) => a.label.localeCompare(b.label));
      else if (_skillSort === 'name-desc') skills.sort((a,b) => b.label.localeCompare(a.label));
      else if (_skillSort === 'category') skills.sort((a,b) => (a.cat||'').localeCompare(b.cat||'') || a.label.localeCompare(b.label));
      if (_skillSort === 'default') {
        return SKILL_CATEGORIES.map(cat => {
          const catSkills = skills.filter(s => s.cat === cat.id);
          if (!catSkills.length) return '';
          return `<div style="margin-bottom:16px">
            <div style="font-size:11px;font-weight:700;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px;padding-left:2px">${cat.icon} ${cat.label}</div>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px">
              ${catSkills.map(s => `
                <button class="card" style="cursor:pointer;text-align:left;padding:10px 14px;transition:border-color .15s,transform .15s" onmouseenter="this.style.borderColor='var(--violet)';this.style.transform='translateY(-1px)'" onmouseleave="this.style.borderColor='';this.style.transform=''" onclick="window._agentRunSkill('clinician','${s.id}')">
                  <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">
                    <span style="font-size:14px">${s.icon}</span>
                    <span style="font-size:12px;font-weight:600;color:var(--text-primary)">${s.label}</span>
                  </div>
                  <div style="font-size:10.5px;color:var(--text-tertiary);line-height:1.4;padding-left:22px">${s.desc}</div>
                </button>
              `).join('')}
            </div>
          </div>`;
        }).join('');
      }
      return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px;margin-bottom:16px">
        ${skills.map(s => `
          <button class="card" style="cursor:pointer;text-align:left;padding:10px 14px;transition:border-color .15s,transform .15s" onmouseenter="this.style.borderColor='var(--violet)';this.style.transform='translateY(-1px)'" onmouseleave="this.style.borderColor='';this.style.transform=''" onclick="window._agentRunSkill('clinician','${s.id}')">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">
              <span style="font-size:14px">${s.icon}</span>
              <span style="font-size:12px;font-weight:600;color:var(--text-primary)">${s.label}</span>
            </div>
            <div style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px">${SKILL_CATEGORIES.find(c=>c.id===s.cat)?.label||s.cat||''}</div>
            <div style="font-size:10.5px;color:var(--text-tertiary);line-height:1.4;padding-left:22px">${s.desc}</div>
          </button>
        `).join('')}
      </div>`;
    })()}

    <!-- Active Tasks (compact) -->
    ${pendingTasks.length > 0 ? `
      <div class="card" style="margin-bottom:16px">
        <div class="card-header" style="display:flex;align-items:center;justify-content:space-between">
          <span style="font-weight:700;font-size:13px">Active Tasks (${pendingTasks.length})</span>
          <button class="btn btn-sm btn-ghost" style="font-size:10px" onclick="window._agentOpenChat('clinician')">View All</button>
        </div>
        <div class="card-body" style="padding:4px 16px">
          ${pendingTasks.slice(0, 5).map(t => `
            <div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--border)">
              <button style="width:18px;height:18px;border-radius:4px;border:1.5px solid var(--text-tertiary);background:none;cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--text-tertiary)" onclick="window._agentCompleteTask('${t.id}')"></button>
              <span style="flex:1;font-size:12px;color:var(--text-primary)">${_esc(t.title)}</span>
              ${t.due ? `<span style="font-size:10px;color:var(--text-tertiary)">${t.due}</span>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}

    <!-- Recent Activity (compact) -->
    ${activity.length > 0 ? `
      <div class="card">
        <div class="card-header"><span style="font-weight:700;font-size:13px">Recent Activity</span></div>
        <div class="card-body" style="padding:4px 16px">
          ${activity.map(a => {
            const dot = a.type === 'chat' ? 'var(--violet)' : a.type === 'task_created' ? 'var(--teal)' : a.type === 'task_completed' ? 'var(--green)' : 'var(--blue)';
            return `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border)">
              <span style="width:6px;height:6px;border-radius:50%;background:${dot};flex-shrink:0"></span>
              <span style="flex:1;font-size:11.5px;color:var(--text-secondary)">${_esc(a.summary)}</span>
              <span style="font-size:10px;color:var(--text-tertiary);flex-shrink:0">${_ago(a.ts)}</span>
            </div>`;
          }).join('')}
        </div>
      </div>
    ` : ''}

  </div></div>`;
}

// ── Chat View ────────────────────────────────────────────────────────────────
function _renderChat(setTopbar, agent) {
  const label = agent === 'patient' ? 'Patient Agent' : 'Clinic Agent';
  const skills = agent === 'patient' ? PATIENT_SKILLS : CLINICIAN_SKILLS;
  const history = _loadHistory(agent);

  setTopbar(label, `
    <button class="btn btn-sm btn-ghost" onclick="window._agentBackToHub()" style="font-size:11.5px">&#8592; Back</button>
    <button class="btn btn-sm btn-ghost" onclick="window._agentClearHistory('${agent}')" style="font-size:11.5px">&#8634; New</button>
  `);

  const el = document.getElementById('content');
  if (!el) return;

  // Group skills by category for sidebar
  const cats = [...new Set(skills.map(s => s.cat))];

  el.innerHTML = `<div class="agent-shell">
    <!-- Sidebar: skills -->
    <div class="agent-sidebar">
      <div class="agent-sidebar-head">
        ${cats.map(catId => {
          const cat = SKILL_CATEGORIES.find(c => c.id === catId);
          const catSkills = skills.filter(s => s.cat === catId);
          return `
            <div style="font-size:10px;font-weight:700;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.06em;margin:${catId === cats[0] ? '0' : '12px'} 0 6px">${cat?.icon || ''} ${cat?.label || catId}</div>
            ${catSkills.map(s => `
              <button class="agent-quick-btn" onclick="window._agentRunSkill('${agent}','${s.id}')">
                <span style="font-size:13px;flex-shrink:0">${s.icon}</span>
                <span>${s.label}</span>
              </button>
            `).join('')}
          `;
        }).join('')}
      </div>
      <div class="agent-sidebar-info">
        <div style="font-size:10px;color:var(--text-tertiary);line-height:1.6">
          <strong style="color:var(--text-secondary)">Provider:</strong> ${(PROVIDERS.find(p=>p.id===_agentProvider)||PROVIDERS[0]).label}
        </div>
        <div style="font-size:10px;color:var(--text-tertiary);margin-top:4px">
          <strong style="color:var(--text-secondary)">Messages:</strong> <span id="agent-msg-count">${history.length}</span>
        </div>
      </div>
    </div>

    <!-- Main chat -->
    <div class="agent-main">
      <div class="agent-messages" id="agent-messages">
        ${history.length === 0 ? `
          <div class="agent-welcome">
            <div class="agent-welcome-icon">${agent === 'patient' ? '👤' : '🩺'}</div>
            <div class="agent-welcome-title">${label}</div>
            <div class="agent-welcome-sub">
              ${agent === 'patient'
                ? 'I help you understand your treatment and track your progress. Pick a skill on the left or type a question below.'
                : 'Your AI clinic receptionist. I can handle patient communications, check reports, manage scheduling, and more. Pick a skill on the left or type freely.'}
            </div>
          </div>
        ` : history.map(m => _renderMsg(m, agent)).join('')}
      </div>

      <div class="agent-typing" id="agent-typing" style="display:none">
        <div class="agent-typing-dot"></div><div class="agent-typing-dot"></div><div class="agent-typing-dot"></div>
      </div>

      <div class="agent-input-area">
        <textarea id="agent-input" class="agent-textarea"
          placeholder="${agent === 'patient' ? 'Ask about your treatment, progress, or next steps...' : 'Ask me to do anything — check reports, message patients, review schedules...'}"
          rows="1"
          onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();window._agentSend('${agent}')}"
          oninput="this.style.height='auto';this.style.height=Math.min(this.scrollHeight,140)+'px'"></textarea>
        <button class="agent-send-btn" id="agent-send-btn" onclick="window._agentSend('${agent}')">&#8593;</button>
      </div>
      <div style="text-align:center;font-size:10px;color:var(--text-tertiary);padding:4px 0 2px">AI-generated &mdash; review before clinical use</div>
    </div>
  </div>`;

  _scrollAgentToBottom();
  setTimeout(() => document.getElementById('agent-input')?.focus(), 100);
}

// ── Config View ──────────────────────────────────────────────────────────────
function _renderConfig(setTopbar) {
  setTopbar('Agent Settings', `<button class="btn btn-sm btn-ghost" onclick="window._agentBackToHub()" style="font-size:11.5px">&#8592; Back</button>`);
  const el = document.getElementById('content');
  if (!el) return;
  const tgState = _agentTelegramState();
  const tgNotifs = JSON.parse(localStorage.getItem('ds_agent_tg_notifs') || '{"sessions":true,"reviews":true,"ae":true,"digest":false}');
  const provLabel = (PROVIDERS.find(p => p.id === _agentProvider) || PROVIDERS[0]).label;

  el.innerHTML = `<div style="max-width:600px;margin:0 auto;padding:20px 0">

    <!-- Provider -->
    <div class="card" style="margin-bottom:16px">
      <div class="card-header"><span style="font-weight:700;font-size:14px">AI Provider</span></div>
      <div class="card-body">
        <div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px">Choose your AI engine. GLM-4.7 Flash is free and works instantly.</div>
        <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px">
          ${PROVIDERS.map(p => `
            <button class="card" style="text-align:left;cursor:pointer;padding:12px 16px;border:1px solid ${_agentProvider===p.id?'var(--teal)':'var(--border)'};background:${_agentProvider===p.id?'rgba(0,212,188,0.06)':'var(--bg-card)'}" onclick="window._agentSetProvider('${p.id}')">
              <div style="display:flex;align-items:center;gap:8px">
                <span style="font-size:16px">${p.icon}</span>
                <span style="font-weight:700;font-size:13px;color:var(--text-primary)">${p.label}</span>
                ${_agentProvider===p.id?'<span style="margin-left:auto;font-size:10px;color:var(--teal);font-weight:600">ACTIVE</span>':''}
              </div>
              <div style="font-size:11px;color:var(--text-tertiary);margin-top:3px;padding-left:24px">${p.desc}</div>
            </button>`).join('')}
        </div>
        <div id="agent-oa-key-row" style="display:${_agentProvider==='openai'?'block':'none'}">
          <div class="form-group"><label class="form-label">OpenAI API Key</label>
            <input id="agent-oa-key-input" type="password" class="form-control" placeholder="sk-..." value="${_esc(_agentOAKey)}" oninput="window._agentSaveOAKey(this.value)" style="font-family:monospace;font-size:12px">
          </div>
        </div>
      </div>
    </div>

    <!-- OpenClaw Setup -->
    <div class="card" style="margin-bottom:16px">
      <div class="card-header"><span style="font-weight:700;font-size:14px">OpenClaw Setup</span></div>
      <div class="card-body">
        <div style="font-size:12px;color:var(--text-secondary);margin-bottom:14px">Use your clinic agent on Telegram &amp; WhatsApp via OpenClaw &mdash; the open-source AI assistant.</div>
        <div class="agent-openclaw-step">
          <div style="display:flex;align-items:center;margin-bottom:6px">
            <span class="agent-openclaw-step-num">1</span>
            <span style="font-size:12px;font-weight:600;color:var(--text-primary)">Install OpenClaw</span>
          </div>
          <div class="agent-openclaw-cmd">
            <code>npm i -g openclaw &amp;&amp; openclaw onboard</code>
            <button class="btn btn-sm btn-ghost" onclick="window._agentCopyOpenClawCmd()" style="font-size:10px;padding:2px 8px">Copy</button>
          </div>
        </div>
        <div class="agent-openclaw-step">
          <div style="display:flex;align-items:center;margin-bottom:6px">
            <span class="agent-openclaw-step-num">2</span>
            <span style="font-size:12px;font-weight:600;color:var(--text-primary)">Connect a messaging channel</span>
          </div>
          <div style="font-size:12px;color:var(--text-secondary);line-height:1.6">During onboarding, select <strong>Telegram</strong> or <strong>WhatsApp</strong> as your channel, and choose a free model (GLM-4.7 Flash, Gemini, or Groq). Your clinic agent will be available on the messaging platform you choose.</div>
        </div>
        <div style="margin-top:12px;padding:10px 14px;border-radius:8px;background:rgba(0,212,188,0.04);border:1px solid rgba(0,212,188,0.1);font-size:11px;color:var(--text-secondary)">&#8505; Your OpenClaw agent uses the same AI as your in-app assistant (currently: <strong>${provLabel}</strong>).</div>
      </div>
    </div>

    <!-- Telegram -->
    <div class="card" style="margin-bottom:16px">
      <div class="card-header"><span style="font-weight:700;font-size:14px">Telegram Connection</span></div>
      <div class="card-body">
        <div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px">Connect Telegram to receive notifications and manage your clinic on the go.</div>
        ${tgState === 'pending' ? `
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">
            <span style="font-size:11px;font-weight:600;padding:4px 12px;border-radius:99px;background:rgba(255,179,71,0.14);color:var(--amber,#f59e0b)">Link code issued</span>
            <button class="btn btn-sm btn-ghost" style="font-size:10px;color:var(--red,#ef4444)" onclick="window._agentDisconnectTelegram()">Clear</button>
          </div>
          <div style="font-size:11px;color:var(--text-secondary);line-height:1.7;margin-bottom:14px">Telegram linking is not verified in-app yet. Complete the bot flow using your code, then use this badge only as a reminder that a code was issued on this device.</div>
        ` : `<div id="agent-tg-link-area" style="margin-bottom:14px">
          <div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px"><strong>3 easy steps:</strong></div>
          <div style="font-size:12px;color:var(--text-secondary);line-height:1.8;margin-bottom:12px">
            1. Click the button below to get your link code<br>
            2. Follow the bot handle and instructions shown with the code<br>
            3. Send the code to the bot to complete linking outside this page
          </div>
          <button class="btn btn-primary btn-sm" onclick="window._agentConnectTelegram()">Get Link Code</button>
        </div>`}
        <div style="font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:8px">Notifications</div>
        <div style="font-size:10.5px;color:var(--text-tertiary);margin-bottom:8px">These checkbox preferences are remembered on this device only. Telegram delivery settings are not verified from this page.</div>
        ${[
          { key: 'sessions', label: 'Session reminders' },
          { key: 'reviews', label: 'Review alerts' },
          { key: 'ae', label: 'Adverse event alerts' },
          { key: 'digest', label: 'Weekly outcome digest' },
        ].map(n => `<label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text-secondary);margin-bottom:6px;cursor:pointer">
          <input type="checkbox" ${tgNotifs[n.key]?'checked':''} onchange="window._agentToggleTgNotif('${n.key}',this.checked)"> ${n.label}
        </label>`).join('')}
      </div>
    </div>

    <!-- Task Board -->
    <div class="card">
      <div class="card-header" style="display:flex;align-items:center;justify-content:space-between">
        <span style="font-weight:700;font-size:14px">Task Board</span>
        <button class="btn btn-sm btn-primary" onclick="document.getElementById('agent-task-form').style.display=document.getElementById('agent-task-form').style.display==='none'?'block':'none'">+ New Task</button>
      </div>
      <div class="card-body" style="padding:0">
        <div id="agent-task-form" style="display:none;padding:12px 16px;border-bottom:1px solid var(--border)">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
            <div class="form-group" style="margin:0"><label class="form-label">Task</label><input id="task-title" class="form-control" placeholder="What needs doing?"></div>
            <div class="form-group" style="margin:0"><label class="form-label">Patient</label><input id="task-patient" class="form-control" placeholder="Optional"></div>
          </div>
          <div style="display:flex;gap:8px;align-items:end">
            <div class="form-group" style="margin:0;flex:1"><label class="form-label">Due</label><input id="task-due" type="date" class="form-control"></div>
            <button class="btn btn-primary btn-sm" onclick="window._agentAddTask()" style="height:34px">Add Task</button>
          </div>
        </div>
        ${(() => {
          const tasksAll = _loadTasks();
          if (!tasksAll.length) return '<div style="padding:20px;text-align:center;font-size:12px;color:var(--text-tertiary)">No tasks yet. Create one above or let the agent create tasks from chat.</div>';
          const _FILTERS = [
            { id: 'all', label: 'All' },
            { id: 'pending', label: 'Pending' },
            { id: 'in_progress', label: 'In progress' },
            { id: 'done', label: 'Done' },
          ];
          const sortBar = '<div style="padding:4px 16px;display:flex;gap:6px;align-items:center;border-bottom:1px solid var(--border)">' +
            '<span style="font-size:10px;color:var(--text-tertiary)">Sort:</span>' +
            [['due','Due date'],['priority','Priority'],['status','Status'],['created','Created']].map(([k,l]) =>
              '<button class="btn btn-sm '+(_taskSort===k?'btn-primary':'btn-ghost')+'" style="font-size:10px;padding:3px 10px" onclick="window._agentSetTaskSort(\''+k+'\')">'+l+'</button>'
            ).join('') + '</div>';
          const filterBar = '<div style="padding:8px 16px;display:flex;gap:6px;border-bottom:1px solid var(--border)">' +
            _FILTERS.map(f => '<button class="btn btn-sm '+(_taskFilter===f.id?'btn-primary':'btn-ghost')+'" style="font-size:10px;padding:3px 10px" onclick="window._agentSetTaskFilter(\''+f.id+'\')">'+f.label+' ('+(f.id==='all'?tasksAll.length:tasksAll.filter(x=>x.status===f.id).length)+')</button>').join('') + '</div>';
          let tasks = _taskFilter === 'all' ? tasksAll : tasksAll.filter(t => t.status === _taskFilter);
          const _p = { critical:0, high:1, normal:2, low:3 };
          if (_taskSort === 'due') tasks.sort((a,b) => (a.due||'9999-12-31').localeCompare(b.due||'9999-12-31') || a.title.localeCompare(b.title));
          else if (_taskSort === 'priority') tasks.sort((a,b) => (_p[a.priority]||2) - (_p[b.priority]||2) || a.title.localeCompare(b.title));
          else if (_taskSort === 'status') tasks.sort((a,b) => (a.status||'').localeCompare(b.status||'') || a.title.localeCompare(b.title));
          else if (_taskSort === 'created') tasks.sort((a,b) => (b.createdAt||'').localeCompare(a.createdAt||'') || a.title.localeCompare(b.title));
          if (!tasks.length) return sortBar + filterBar + '<div style="padding:20px;text-align:center;font-size:12px;color:var(--text-tertiary)">No tasks match this filter.</div>';
          return sortBar + filterBar + `<div style="padding:8px 16px">${tasks.slice(0, 20).map(t => `
            <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">
              <button style="width:18px;height:18px;border-radius:4px;border:1.5px solid ${t.status==='done'?'var(--green,#22c55e)':'var(--text-tertiary)'};background:${t.status==='done'?'rgba(74,222,128,0.2)':'none'};cursor:pointer;flex-shrink:0;font-size:10px;color:${t.status==='done'?'var(--green)':'var(--text-tertiary)'};display:flex;align-items:center;justify-content:center"
                onclick="window._agentCompleteTask('${t.id}')">${t.status==='done'?'✓':''}</button>
              <span style="flex:1;font-size:12px;color:${t.status==='done'?'var(--text-tertiary)':'var(--text-primary)'};${t.status==='done'?'text-decoration:line-through':''}">${_esc(t.title)}</span>
              ${t.due?`<span style="font-size:10px;color:var(--text-tertiary)">${t.due}</span>`:''}
              ${t.priority && t.priority !== 'normal' ? `<span style="font-size:9px;padding:1px 6px;border-radius:99px;background:${t.priority==='critical'?'rgba(239,68,68,0.12)':t.priority==='high'?'rgba(245,158,11,0.12)':'rgba(74,222,128,0.12)'};color:${t.priority==='critical'?'var(--red)':t.priority==='high'?'var(--amber)':'var(--green)'};flex-shrink:0">${t.priority}</span>` : ''}
              <button class="btn btn-sm btn-ghost" style="font-size:9px;color:var(--red,#ef4444);padding:2px 6px" onclick="window._agentDeleteTask('${t.id}')">×</button>
            </div>`).join('')}</div>`;
        })()}
      </div>
    </div>
  </div>`;
}

// ── Global handlers ──────────────────────────────────────────────────────────
window._agentOpenChat = function(agent) { _agentView = 'chat-' + agent; pgAgentChat(_lastSetTopbar); };
window._agentOpenConfig = function() { _agentView = 'config'; pgAgentChat(_lastSetTopbar); };
window._agentBackToHub = function() { _agentView = 'hub'; _activeSkill = null; pgAgentChat(_lastSetTopbar); };

window._agentRunSkill = function(agent, skillId) {
  const skills = agent === 'patient' ? PATIENT_SKILLS : CLINICIAN_SKILLS;
  const skill = skills.find(s => s.id === skillId);
  if (!skill) return;
  _activeSkill = skill;
  _agentView = 'chat-' + agent;
  pgAgentChat(_lastSetTopbar);
  // Auto-send the skill prompt
  setTimeout(() => {
    const input = document.getElementById('agent-input');
    if (input) { input.value = skill.prompt; }
    window._agentSend(agent);
  }, 200);
};

window._agentSend = async function(agent) {
  if (_agentBusy) return;
  const input = document.getElementById('agent-input');
  const text = input?.value.trim();
  if (!text) return;
  input.value = ''; input.style.height = 'auto';

  const history = _loadHistory(agent);
  const userMsg = { role: 'user', content: text, ts: new Date().toISOString(), skill: _activeSkill?.label || null };
  history.push(userMsg);
  _saveHistory(agent, history);
  _appendMsg(userMsg, agent);
  _activeSkill = null;

  _agentBusy = true;
  const sendBtn = document.getElementById('agent-send-btn');
  if (sendBtn) sendBtn.disabled = true;
  const typing = document.getElementById('agent-typing');
  if (typing) typing.style.display = 'flex';
  _scrollAgentToBottom();

  // ── Build rich context from clinic data ────────────────────────────────
  let context = null;
  try {
    if (agent === 'clinician') {
      // Fetch all clinic data in parallel for full situational awareness
      const [patientsRes, coursesRes, reviewRes, aeRes, outcomesRes, tasksLocal, riskRes] = await Promise.all([
        api.listPatients().catch(() => null),
        api.listCourses().catch(() => null),
        api.listReviewQueue().catch(() => null),
        api.listAdverseEvents().catch(() => null),
        api.aggregateOutcomes().catch(() => null),
        Promise.resolve(_loadTasks()),
        api.getClinicRiskSummary().catch(() => null),
      ]);

      const patients = patientsRes?.items || [];
      const courses = coursesRes?.items || [];
      const reviewQueue = reviewRes?.items || [];
      const adverseEvents = aeRes?.items || [];
      const outcomes = outcomesRes || {};
      const riskPatients = riskRes?.patients || [];

      // Build a comprehensive clinic snapshot
      const activeCourses = courses.filter(c => c.status === 'active');
      const pendingReview = reviewQueue.filter(r => r.status === 'pending' || r.status === 'pending_approval');
      const openAEs = adverseEvents.filter(a => a.status !== 'resolved');
      const pendingTasks = tasksLocal.filter(t => t.status === 'pending' || t.status === 'in_progress');

      context = JSON.stringify({
        clinic_summary: {
          total_patients: patients.length,
          active_courses: activeCourses.length,
          pending_reviews: pendingReview.length,
          open_adverse_events: openAEs.length,
          pending_tasks: pendingTasks.length,
          risk_red_flags: riskPatients.reduce((n, p) => n + (p.categories || []).filter(c => c.level === 'red').length, 0),
          risk_amber_flags: riskPatients.reduce((n, p) => n + (p.categories || []).filter(c => c.level === 'amber').length, 0),
        },
        patients: patients.slice(0, 50).map(p => ({
          id: p.id, name: p.name || p.full_name, condition: p.condition || p.primary_condition,
          modality: p.modality || p.primary_modality, status: p.status,
          course: courses.find(c => c.patient_id === p.id && c.status === 'active')?.protocol_name || 'none',
        })),
        review_queue: pendingReview.slice(0, 10).map(r => ({
          id: r.id, type: r.type || r.review_type, patient: r.patient_name, status: r.status, created: r.created_at,
        })),
        adverse_events: openAEs.slice(0, 10).map(a => ({
          id: a.id, patient: a.patient_name, severity: a.severity, description: a.description?.slice(0, 100), status: a.status,
        })),
        outcomes_summary: outcomes,
        agent_tasks: pendingTasks.map(t => ({ title: t.title, patient: t.patient, due: t.due, status: t.status })),
        risk_stratification: riskPatients.filter(p => (p.categories || []).some(c => c.level === 'red' || c.level === 'amber')).slice(0, 20).map(p => ({
          patient: p.patient_name || p.patient_id,
          flags: (p.categories || []).filter(c => c.level === 'red' || c.level === 'amber').map(c => ({ category: c.category, level: c.level })),
        })),
        today: new Date().toISOString().split('T')[0],
        instructions: 'You are a clinic AI receptionist. You have full access to the clinic data above, including risk stratification flags (red=high risk, amber=moderate, green=safe). Proactively flag patients with red risk levels. Answer questions, create tasks (prefix with TASK:), and help manage day-to-day clinic operations. Be specific — use patient names, real data, and actionable advice.',
      });
    } else {
      // Patient agent — scoped to their own data only
      const user = (() => { try { return JSON.parse(localStorage.getItem('ds_user') || '{}'); } catch { return {}; } })();
      const pid = user.patient_id || user.id;
      const [courseRes, assessRes, outRes] = await Promise.all([
        api.patientPortalCourses?.().catch(() => null),
        api.patientPortalAssessments?.().catch(() => null),
        api.patientPortalOutcomes?.().catch(() => null),
      ]);
      const patientTasks = _loadTasks().filter(t => t.assignedTo?.includes(pid));
      context = JSON.stringify({
        patient: { id: pid, name: user.name || user.display_name },
        courses: (courseRes?.items || []).slice(0, 5).map(c => ({ protocol: c.protocol_name, status: c.status, sessions_completed: c.sessions_completed, total: c.total_sessions })),
        assessments: (assessRes?.items || []).slice(0, 10).map(a => ({ template: a.template_name, score: a.score, date: a.completed_at })),
        outcomes: (outRes?.items || []).slice(0, 10).map(o => ({ template: o.template_name, score: o.score, date: o.recorded_at })),
        tasks: patientTasks.map(t => ({ title: t.title, due: t.due, status: t.status })),
        instructions: 'You are a patient support assistant. Only discuss this patient\'s own data. Be empathetic, clear, and avoid medical jargon. Never reveal other patients\' information.',
      });
    }
  } catch {}

  try {
    let result;
    if (agent === 'patient') {
      result = await api.chatPatient(history, context, 'en', null);
    } else {
      result = await api.chatAgent(history, _agentProvider === 'glm-free' ? 'glm-free' : _agentProvider, _agentProvider === 'openai' ? _agentOAKey : null, context);
    }
    const reply = result?.reply || 'No response.';
    const assistantMsg = { role: 'assistant', content: reply, ts: new Date().toISOString() };
    history.push(assistantMsg);
    _saveHistory(agent, history);
    _appendMsg(assistantMsg, agent);
    _logActivity('chat', agent, text.slice(0, 60) + (text.length > 60 ? '...' : ''));

    // Auto-create tasks from TASK: lines
    reply.split('\n').filter(l => l.trim().startsWith('TASK:')).forEach(line => {
      const title = line.replace(/^TASK:\s*/, '').trim();
      if (title) { _addTask({ title, agent, status: 'pending', patient: '', due: '', priority: 'normal' }).catch(() => {}); }
    });
  } catch (err) {
    const errMsg = { role: 'assistant', content: `Error: ${err.message || 'Failed to reach agent.'}`, ts: new Date().toISOString() };
    history.push(errMsg);
    _saveHistory(agent, history);
    _appendMsg(errMsg, agent);
  } finally {
    _agentBusy = false;
    if (sendBtn) sendBtn.disabled = false;
    if (typing) typing.style.display = 'none';
    document.getElementById('agent-input')?.focus();
    const countEl = document.getElementById('agent-msg-count');
    if (countEl) countEl.textContent = _loadHistory(agent).length;
  }
};

window._agentClearHistory = function(agent) {
  localStorage.removeItem(`ds_agent_history_${agent}`);
  _agentView = 'chat-' + agent;
  pgAgentChat(_lastSetTopbar);
};

window._agentAddTask = async function() {
  const title = document.getElementById('task-title')?.value.trim();
  if (!title) return;
  let entry = null;
  try {
    entry = await _addTask({ title, patient: document.getElementById('task-patient')?.value.trim() || '', due: document.getElementById('task-due')?.value || '', priority: 'normal', agent: 'clinician', status: 'pending' });
  } catch {}
  if (!entry) {
    window._showNotifToast?.({ title: 'Task not created', body: 'The task could not be saved.', severity: 'error' });
    return;
  }
  window._showNotifToast?.({
    title: entry._backend ? 'Task created' : 'Task saved locally',
    body: entry._backend ? title : `${title} — backend sync unavailable`,
    severity: entry._backend ? 'success' : 'warning'
  });
  _agentView = 'config'; pgAgentChat(_lastSetTopbar);
};
window._agentCompleteTask = async function(id) {
  let updated = null;
  try { updated = await _updateTaskStatus(id, 'done'); } catch {}
  if (!updated) {
    window._showNotifToast?.({ title: 'Update failed', body: 'Task status could not be updated.', severity: 'error' });
    return;
  }
  window._showNotifToast?.({
    title: updated._backend ? 'Done' : 'Marked done locally',
    body: updated._backend ? '' : 'Backend sync unavailable for this task.',
    severity: updated._backend ? 'success' : 'warning'
  });
  pgAgentChat(_lastSetTopbar);
};
window._agentDeleteTask = async function(id) {
  try { await _deleteTask(id); } catch {}
  pgAgentChat(_lastSetTopbar);
};
window._agentSetTaskFilter = function(f) { _taskFilter = f; pgAgentChat(_lastSetTopbar); };
window._agentSetTaskSort = function(key) { _taskSort = key; pgAgentChat(_lastSetTopbar); };
window._agentSetSkillSort = function(key) { _skillSort = key; pgAgentChat(_lastSetTopbar); };

window._agentSetProvider = function(provider) {
  _agentProvider = provider; localStorage.setItem('ds_agent_provider', provider);
  if (_agentView === 'config') pgAgentChat(_lastSetTopbar);
  window._showNotifToast?.({ title: 'Provider changed', body: (PROVIDERS.find(p=>p.id===provider)||{}).label || provider, severity: 'info' });
};
window._agentSaveOAKey = function(val) { _agentOAKey = val; localStorage.setItem('ds_agent_oa_key', val); };

window._agentConnectTelegram = async function() {
  const area = document.getElementById('agent-tg-link-area');
  if (!area) return;
  area.innerHTML = '<div style="font-size:12px;color:var(--text-tertiary)">Requesting link code...</div>';
  try {
    const res = await api.telegramLinkCode('clinician');
    const code = res?.code || res?.link_code || 'N/A';
    // Backend supplies the canonical bot handle + instructions; never hardcode.
    const instr = res?.instructions || '';
    const m = instr.match(/@([A-Za-z0-9_]+)/);
    const handle = m ? m[1] : 'DeepSynapsClinicBot';
    area.innerHTML = `
      <div style="font-family:var(--font-mono);font-size:22px;font-weight:700;color:var(--teal);background:rgba(0,212,188,0.08);padding:14px;border-radius:8px;text-align:center;letter-spacing:4px;border:1px solid rgba(0,212,188,0.2);margin-bottom:10px">${_esc(code)}</div>
      <div style="font-size:11px;color:var(--text-secondary);margin-bottom:10px">Open Telegram → <strong>@${_esc(handle)}</strong> → send <code style="background:rgba(255,255,255,0.08);padding:1px 5px;border-radius:4px">LINK ${_esc(code)}</code></div>
      <div style="font-size:10.5px;color:var(--text-tertiary);margin-bottom:10px">This page cannot verify Telegram linkage yet. After you send the code to the bot, keep this reminder state on the device or clear it manually.</div>
      <button class="btn btn-primary btn-sm" onclick="window._agentConfirmTelegram()">Keep reminder on this device</button>`;
  } catch (err) {
    area.innerHTML = `<div style="font-size:12px;color:var(--red,#ef4444)">Failed: ${_esc(err.message)}</div>
      <button class="btn btn-sm btn-ghost" style="margin-top:6px" onclick="window._agentConnectTelegram()">Retry</button>`;
  }
};
window._agentConfirmTelegram = function() {
  localStorage.setItem('ds_agent_tg_state', 'pending');
  _logActivity('telegram', 'clinician', 'Telegram link code issued');
  window._showNotifToast?.({ title: 'Reminder saved', body: 'This device will remember that a Telegram link code was issued, but linkage is not verified in-app yet.', severity: 'info' });
  _agentView = 'config'; pgAgentChat(_lastSetTopbar);
};
window._agentDisconnectTelegram = function() {
  localStorage.removeItem('ds_agent_tg_state');
  window._showNotifToast?.({ title: 'Reminder cleared', body: 'This device no longer stores a Telegram link-code reminder.', severity: 'info' });
  _agentView = 'config'; pgAgentChat(_lastSetTopbar);
};
window._agentCopyOpenClawCmd = function() {
  navigator.clipboard.writeText('npm i -g openclaw && openclaw onboard').then(() => {
    if (typeof window._showNotifToast === 'function') {
      window._showNotifToast({ title: 'Command copied', body: 'OpenClaw onboarding runs outside DeepSynaps.', severity: 'info' });
    }
  }).catch(() => {});
};
window._agentToggleTgNotif = function(key, val) {
  const n = JSON.parse(localStorage.getItem('ds_agent_tg_notifs') || '{"sessions":true,"reviews":true,"ae":true,"digest":false}');
  n[key] = val;
  localStorage.setItem('ds_agent_tg_notifs', JSON.stringify(n));
};

window._agentQuickAction = function(agent, prompt) {
  const input = document.getElementById('agent-input');
  if (input) { input.value = prompt; input.focus(); }
  window._agentSend(agent);
};

// ── Marketplace handlers ─────────────────────────────────────────────────────
window._agentMarketplaceTry = function(agentId) {
  const agent = (_marketplaceAgents && _marketplaceAgents.find(x => x.id === agentId))
    || MARKETPLACE_DEMO_AGENTS.find(x => x.id === agentId);
  if (!agent) return;
  if (_marketplaceIsLocked(agent)) {
    window._showNotifToast?.({ title: 'Upgrade required', body: 'This agent is not included in your current package.', severity: 'warning' });
    return;
  }
  _marketplaceModalAgent = agent;
  _marketplaceModalReply = null;
  _marketplaceModalError = null;
  _marketplaceModalBusy = false;
  _marketplaceModalPendingCall = null;
  _marketplaceModalExecuted = null;
  _marketplaceModalCancelled = false;
  pgAgentChat(_lastSetTopbar);
  setTimeout(() => document.getElementById('agent-marketplace-input')?.focus(), 50);
};

window._agentMarketplaceConfigure = function(/* agentId */) {
  // Placeholder per spec — full configuration UI lands in a follow-up PR.
  alert('Configuration coming soon');
};

// Locked-tile CTA — kicks off Stripe checkout via the agent-billing service
// (built in parallel; returns `{ok, checkout_url, session_id}` or
// `{ok: False, reason}`). Demo mode short-circuits with a toast so reviewers
// can see the path without wiring Stripe.
window._agentMarketplaceUpgrade = async function(agentId) {
  if (!agentId) return;
  if (_marketplaceUpgradeInFlight.has(agentId)) return;

  const agent = (_marketplaceAgents && _marketplaceAgents.find(x => x.id === agentId))
    || MARKETPLACE_DEMO_AGENTS.find(x => x.id === agentId);
  if (!agent) return;

  // Demo-mode short-circuit — no network, just a toast confirming what the
  // production flow would do. Mirrors the `(demo)` callouts elsewhere.
  if (_isMarketplaceDemoMode()) {
    const price = Number.isFinite(agent.monthly_price_gbp) ? agent.monthly_price_gbp : (agent.monthly_price_gbp || 0);
    window._showNotifToast?.({
      title: 'Upgrade (demo)',
      body: `(demo) In production this would launch Stripe checkout for £${price}/mo.`,
      severity: 'info',
    });
    return;
  }

  // Pull clinic_id off the cached user (set at login). The backend uses this
  // to attach the new subscription to the right tenant — without it, the
  // checkout session would land orphaned.
  let clinicId = null;
  try {
    const u = JSON.parse(localStorage.getItem('ds_user') || '{}');
    clinicId = u.clinic_id || null;
  } catch {}

  // Mark in-flight so a second click can't fire while the network call is
  // mid-air — re-render to show the disabled "Starting checkout…" label.
  _marketplaceUpgradeInFlight.add(agentId);
  delete _marketplaceUpgradeNotices[agentId];
  if (_agentView === 'hub') pgAgentChat(_lastSetTopbar);

  const headers = { 'Content-Type': 'application/json' };
  try {
    const t = api.getToken && api.getToken();
    if (t) headers['Authorization'] = 'Bearer ' + t;
  } catch {}

  const successUrl = `${window.location.origin}${window.location.pathname}?upgrade=ok&agent=${encodeURIComponent(agentId)}`;
  const cancelUrl = `${window.location.origin}${window.location.pathname}?upgrade=cancelled&agent=${encodeURIComponent(agentId)}`;

  const body = {
    agent_id: agentId,
    agent_name: agent.name || agentId,
    clinic_id: clinicId,
    package_required: Array.isArray(agent.package_required) ? agent.package_required : [],
    monthly_price_gbp: Number.isFinite(agent.monthly_price_gbp) ? agent.monthly_price_gbp : 0,
    success_url: successUrl,
    cancel_url: cancelUrl,
  };

  try {
    const res = await fetch(`${_marketplaceApiBase()}/api/v1/agent-billing/checkout/${encodeURIComponent(agentId)}`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify(body),
    });
    let data = null;
    try { data = await res.json(); } catch {}

    if (data && data.ok && data.checkout_url) {
      // Stripe-hosted checkout — leave the SPA. The success/cancel URLs
      // bring the user back to this page so the inline notice above shows
      // up post-redirect.
      window.location.assign(data.checkout_url);
      return;
    }

    // Soft-failure path — the backend signals an actionable reason and we
    // surface a tile-local notice instead of a global toast so the user
    // knows which agent the message is about.
    const reason = data && data.reason ? String(data.reason) : '';
    if (reason === 'patient_agent_not_activated') {
      _marketplaceUpgradeNotices[agentId] = {
        kind: 'info',
        text: 'Patient agents are pending clinical sign-off. Talk to your DeepSynaps representative.',
      };
    } else if (reason === 'already_subscribed') {
      _marketplaceUpgradeNotices[agentId] = {
        kind: 'info',
        text: 'You already have this agent. Refresh the page.',
      };
    } else {
      _marketplaceUpgradeNotices[agentId] = {
        kind: 'error',
        text: "Couldn't start checkout. Please try again or contact support.",
      };
    }
  } catch {
    _marketplaceUpgradeNotices[agentId] = {
      kind: 'error',
      text: "Couldn't start checkout. Please try again or contact support.",
    };
  } finally {
    _marketplaceUpgradeInFlight.delete(agentId);
    if (_agentView === 'hub') pgAgentChat(_lastSetTopbar);
  }
};

window._agentMarketplaceModalClose = function() {
  _marketplaceModalAgent = null;
  _marketplaceModalReply = null;
  _marketplaceModalError = null;
  _marketplaceModalBusy = false;
  _marketplaceModalPendingCall = null;
  _marketplaceModalExecuted = null;
  _marketplaceModalCancelled = false;
  if (_agentView === 'hub') pgAgentChat(_lastSetTopbar);
};

window._agentMarketplaceModalSend = async function() {
  if (_marketplaceModalBusy || !_marketplaceModalAgent) return;
  const input = document.getElementById('agent-marketplace-input');
  const message = (input?.value || '').trim();
  if (!message) return;
  _marketplaceModalBusy = true;
  _marketplaceModalError = null;
  // Fresh send always invalidates any prior pending/executed/cancelled tool
  // state — the new turn is what matters; stale cards must not linger.
  _marketplaceModalPendingCall = null;
  _marketplaceModalExecuted = null;
  _marketplaceModalCancelled = false;
  pgAgentChat(_lastSetTopbar);
  try {
    const result = await _runMarketplaceAgent(_marketplaceModalAgent.id, message);
    if (result && result.error && !result.reply) {
      _marketplaceModalError = String(result.error);
    } else {
      _marketplaceModalReply = result || { reply: '' };
      if (result && result.pending_tool_call) {
        _marketplaceModalPendingCall = result.pending_tool_call;
      }
      if (result && result.tool_call_executed) {
        _marketplaceModalExecuted = result.tool_call_executed;
      }
    }
  } catch (err) {
    _marketplaceModalError = err?.message || 'Agent run failed.';
  } finally {
    _marketplaceModalBusy = false;
    pgAgentChat(_lastSetTopbar);
  }
};

// Two-step write protocol: clinician clicks Approve on the confirmation card.
// We POST `confirmed_tool_call_id` so the broker actually executes the write.
// Replaces the confirmation card with the executed-result card on response.
window._agentApproveToolCall = async function(callId, agentId) {
  if (!callId || !agentId) return;
  if (_marketplaceModalBusy) return;
  _marketplaceModalBusy = true;
  _marketplaceModalError = null;
  // Drop the pending card immediately so the user sees the busy state,
  // not the still-actionable Approve button.
  _marketplaceModalPendingCall = null;
  _marketplaceModalCancelled = false;
  pgAgentChat(_lastSetTopbar);
  try {
    const result = await _runMarketplaceAgent(agentId, 'approve', callId);
    if (result && result.error && !result.reply && !result.tool_call_executed) {
      _marketplaceModalError = String(result.error);
    } else {
      _marketplaceModalReply = result || _marketplaceModalReply;
      if (result && result.tool_call_executed) {
        _marketplaceModalExecuted = result.tool_call_executed;
      }
      // If the backend returned a fresh pending_tool_call (e.g. follow-up
      // confirmation), prefer the newer one and discard the prior approval.
      if (result && result.pending_tool_call) {
        _marketplaceModalPendingCall = result.pending_tool_call;
      }
    }
  } catch (err) {
    _marketplaceModalError = err?.message || 'Approval failed.';
  } finally {
    _marketplaceModalBusy = false;
    pgAgentChat(_lastSetTopbar);
  }
};

// Reject path: backend treats `message: "reject"` (no confirmed_tool_call_id)
// as a drop. We don't need the response payload — just acknowledge locally
// with the small grey "Cancelled." line.
window._agentRejectToolCall = async function(callId, agentId) {
  if (!callId || !agentId) return;
  if (_marketplaceModalBusy) return;
  _marketplaceModalBusy = true;
  _marketplaceModalError = null;
  _marketplaceModalPendingCall = null;
  _marketplaceModalExecuted = null;
  _marketplaceModalCancelled = true;
  pgAgentChat(_lastSetTopbar);
  try {
    await _runMarketplaceAgent(agentId, 'reject');
  } catch (err) {
    // Reject is best-effort from the user's POV — surface the error but keep
    // the cancelled-card visible so the UI doesn't snap back to a pending card.
    _marketplaceModalError = err?.message || 'Reject failed.';
  } finally {
    _marketplaceModalBusy = false;
    pgAgentChat(_lastSetTopbar);
  }
};

// ── Activity tab handlers ────────────────────────────────────────────────────
window._agentMarketplaceSetTab = function(tab) {
  const valid = ['catalog', 'activity', 'activation', 'ops', 'prompts'];
  if (!valid.includes(tab)) return;
  // Super-admin gate — silently swallow attempts to navigate to admin tabs
  // from a clinician session (the buttons aren't rendered for them, but URL
  // / external triggers shouldn't punch through).
  if ((tab === 'activation' || tab === 'ops' || tab === 'prompts') && !_isSuperAdmin()) return;
  if (_marketplaceTab === tab) return;
  _marketplaceTab = tab;
  // Lazy-load: only fetch on first open per tab. Mirror the marketplace
  // catalog hydration pattern — re-render once data lands.
  if (tab === 'activity' && _activityRuns === null && !_activityLoading) {
    _loadActivityRuns().then(() => {
      if (_agentView === 'hub' && _marketplaceTab === 'activity') {
        try { pgAgentChat(_lastSetTopbar); } catch {}
      }
    }).catch(() => {});
  }
  // Phase 13 — kick off the per-agent usage chart in parallel with the runs
  // table so both land on the first paint pass.
  if (tab === 'activity' && _usageChartData === null && !_usageChartLoading) {
    _loadUsageChart().then(() => {
      if (_agentView === 'hub' && _marketplaceTab === 'activity') {
        try { pgAgentChat(_lastSetTopbar); } catch {}
      }
    }).catch(() => {});
  }
  if (tab === 'activation' && _activationsList === null && !_activationsLoading) {
    _fetchPatientActivations().then(() => {
      if (_agentView === 'hub' && _marketplaceTab === 'activation') {
        try { pgAgentChat(_lastSetTopbar); } catch {}
      }
    }).catch(() => {});
  }
  if (tab === 'ops') {
    if (_opsRuns === null && !_opsRunsLoading) {
      _fetchOpsRuns().then(() => {
        if (_agentView === 'hub' && _marketplaceTab === 'ops') {
          try { pgAgentChat(_lastSetTopbar); } catch {}
        }
      }).catch(() => {});
    }
    if (_opsAbuse === null && !_opsAbuseLoading) {
      _fetchOpsAbuse().then(() => {
        if (_agentView === 'hub' && _marketplaceTab === 'ops') {
          try { pgAgentChat(_lastSetTopbar); } catch {}
        }
      }).catch(() => {});
    }
    if (_opsSla === null && !_opsSlaLoading) {
      _fetchOpsSla().then(() => {
        if (_agentView === 'hub' && _marketplaceTab === 'ops') {
          try { pgAgentChat(_lastSetTopbar); } catch {}
        }
      }).catch(() => {});
    }
    // Phase 13: lazy-fetch the funnel for the current window if not cached.
    const _funnelDays = _onboardingFunnelClampDays(_onboardingFunnelDays);
    if (!Object.prototype.hasOwnProperty.call(_onboardingFunnelByDays, _funnelDays) && !_onboardingFunnelLoading) {
      _fetchOnboardingFunnel(_funnelDays).then(() => {
        if (_agentView === 'hub' && _marketplaceTab === 'ops') {
          try { pgAgentChat(_lastSetTopbar); } catch {}
        }
      }).catch(() => {});
    }
  }
  if (tab === 'prompts' && _promptOverridesList === null && !_promptOverridesLoading) {
    _fetchPromptOverrides().then(() => {
      if (_agentView === 'hub' && _marketplaceTab === 'prompts') {
        try { pgAgentChat(_lastSetTopbar); } catch {}
      }
    }).catch(() => {});
  }
  if (_agentView === 'hub') pgAgentChat(_lastSetTopbar);
};

// ── Phase 7: chat suggestion chip handler ────────────────────────────────────
// Pre-fills the marketplace modal textarea but does NOT auto-send. The user
// stays in control — they edit if needed and hit Send.
window._agentMarketplaceChip = function(text) {
  const input = document.getElementById('agent-marketplace-input');
  if (!input) return;
  input.value = String(text || '');
  input.focus();
};

// ── Phase 7: Activation handlers ─────────────────────────────────────────────
window._agentActivationAttestationInput = function(val) {
  const counter = document.getElementById('activation-attestation-count');
  if (!counter) return;
  const len = String(val || '').length;
  const ok = len >= 32;
  counter.textContent = `${len} / 32`;
  counter.style.color = ok ? 'var(--green,#22c55e)' : 'var(--text-tertiary)';
};

window._agentActivationSubmit = async function() {
  if (_activationsBusy) return;
  const clinicEl = document.getElementById('activation-clinic');
  const agentEl = document.getElementById('activation-agent');
  const attEl = document.getElementById('activation-attestation');
  const clinicId = (clinicEl?.value || '').trim();
  const agentId = (agentEl?.value || '').trim();
  const attestation = (attEl?.value || '').trim();
  if (!clinicId) {
    _activationsNotice = { kind: 'error', text: 'Clinic ID is required.' };
    pgAgentChat(_lastSetTopbar);
    return;
  }
  if (!agentId) {
    _activationsNotice = { kind: 'error', text: 'Pick a patient agent.' };
    pgAgentChat(_lastSetTopbar);
    return;
  }
  if (attestation.length < 32) {
    _activationsNotice = { kind: 'error', text: `Attestation must be at least 32 characters (got ${attestation.length}).` };
    pgAgentChat(_lastSetTopbar);
    return;
  }

  // Demo mode — simulate success without network. Mirrors the upgrade-CTA
  // and run-agent demo paths.
  if (_isMarketplaceDemoMode()) {
    const agentLabel = (PATIENT_AGENT_OPTIONS.find(o => o.id === agentId) || {}).label || agentId;
    window._showNotifToast?.({
      title: 'Activation (demo)',
      body: `(demo) In production this would activate ${agentLabel} for ${clinicId}.`,
      severity: 'info',
    });
    _activationsNotice = { kind: 'success', text: `(demo) Activated ${agentId} for ${clinicId}.` };
    if (clinicEl) clinicEl.value = '';
    if (attEl) attEl.value = '';
    window._agentActivationAttestationInput('');
    pgAgentChat(_lastSetTopbar);
    return;
  }

  _activationsBusy = true;
  pgAgentChat(_lastSetTopbar);

  const headers = { 'Content-Type': 'application/json' };
  try {
    const t = api.getToken && api.getToken();
    if (t) headers['Authorization'] = 'Bearer ' + t;
  } catch {}

  try {
    const res = await fetch(`${_marketplaceApiBase()}/api/v1/agent-admin/patient-activations`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({ clinic_id: clinicId, agent_id: agentId, attestation }),
    });
    if (res.status === 403) {
      _activationsNotice = { kind: 'error', text: 'This action requires super-admin privileges.' };
    } else if (!res.ok) {
      let msg = `Activation failed (${res.status}).`;
      try {
        const body = await res.json();
        if (body && body.detail) msg = String(body.detail);
        else if (body && body.message) msg = String(body.message);
      } catch {}
      _activationsNotice = { kind: 'error', text: msg };
    } else {
      _activationsNotice = { kind: 'success', text: `Activated ${agentId} for ${clinicId}.` };
      if (clinicEl) clinicEl.value = '';
      if (attEl) attEl.value = '';
      // Force a reload of the table to pick up the new row.
      _activationsList = null;
      _fetchPatientActivations().finally(() => {
        if (_agentView === 'hub' && _marketplaceTab === 'activation') {
          try { pgAgentChat(_lastSetTopbar); } catch {}
        }
      });
    }
  } catch (err) {
    _activationsNotice = { kind: 'error', text: err?.message || 'Activation failed.' };
  } finally {
    _activationsBusy = false;
    pgAgentChat(_lastSetTopbar);
  }
};

window._agentActivationDeactivate = async function(clinicId, agentId) {
  if (!clinicId || !agentId) return;
  if (_activationsBusy) return;

  if (_isMarketplaceDemoMode()) {
    _activationsList = (_activationsList || []).filter(r => !(r.clinic_id === clinicId && r.agent_id === agentId));
    _activationsNotice = { kind: 'info', text: `(demo) Deactivated ${agentId} for ${clinicId}.` };
    pgAgentChat(_lastSetTopbar);
    return;
  }

  _activationsBusy = true;
  pgAgentChat(_lastSetTopbar);

  const headers = { 'Content-Type': 'application/json' };
  try {
    const t = api.getToken && api.getToken();
    if (t) headers['Authorization'] = 'Bearer ' + t;
  } catch {}

  try {
    const res = await fetch(`${_marketplaceApiBase()}/api/v1/agent-admin/patient-activations/${encodeURIComponent(clinicId)}/${encodeURIComponent(agentId)}`, {
      method: 'DELETE',
      headers,
      credentials: 'include',
    });
    if (res.status === 403) {
      _activationsNotice = { kind: 'error', text: 'This action requires super-admin privileges.' };
    } else if (!res.ok && res.status !== 204) {
      _activationsNotice = { kind: 'error', text: `Deactivation failed (${res.status}).` };
    } else {
      _activationsNotice = { kind: 'success', text: `Deactivated ${agentId} for ${clinicId}.` };
      _activationsList = null;
      _fetchPatientActivations().finally(() => {
        if (_agentView === 'hub' && _marketplaceTab === 'activation') {
          try { pgAgentChat(_lastSetTopbar); } catch {}
        }
      });
    }
  } catch (err) {
    _activationsNotice = { kind: 'error', text: err?.message || 'Deactivation failed.' };
  } finally {
    _activationsBusy = false;
    pgAgentChat(_lastSetTopbar);
  }
};

// ── Phase 7: Ops handlers ────────────────────────────────────────────────────
window._agentOpsRefresh = function() {
  // Pick up the clinic_id input value too — it's a free-form text input so we
  // can't rely on onchange firing reliably across browsers.
  const clinicEl = document.getElementById('ops-clinic-filter');
  if (clinicEl) _opsClinicFilter = (clinicEl.value || '').trim();
  if (_opsRunsLoading) return;
  _opsRuns = null;
  _fetchOpsRuns().then(() => {
    if (_agentView === 'hub' && _marketplaceTab === 'ops') {
      try { pgAgentChat(_lastSetTopbar); } catch {}
    }
  }).catch(() => {});
  if (_agentView === 'hub') pgAgentChat(_lastSetTopbar);
};

window._agentOpsSetAgentFilter = function(agentId) {
  _opsAgentFilter = agentId || '';
  // Don't trigger automatic fetch — wait for explicit Refresh click so the
  // user can adjust both filters first.
};

window._agentOpsRefreshAbuse = function() {
  if (_opsAbuseLoading) return;
  _opsAbuse = null;
  _fetchOpsAbuse().then(() => {
    if (_agentView === 'hub' && _marketplaceTab === 'ops') {
      try { pgAgentChat(_lastSetTopbar); } catch {}
    }
  }).catch(() => {});
  if (_agentView === 'hub') pgAgentChat(_lastSetTopbar);
};

window._agentOpsRefreshSla = function() {
  if (_opsSlaLoading) return;
  _opsSla = null;
  _fetchOpsSla().then(() => {
    if (_agentView === 'hub' && _marketplaceTab === 'ops') {
      try { pgAgentChat(_lastSetTopbar); } catch {}
    }
  }).catch(() => {});
  if (_agentView === 'hub') pgAgentChat(_lastSetTopbar);
};

window._agentOpsSetSlaWindow = function(hours) {
  const n = Number(hours);
  if (!Number.isFinite(n) || n < 1) return;
  if (_opsSlaWindowHours === n) return;
  _opsSlaWindowHours = n;
  _opsSla = null;
  _fetchOpsSla().then(() => {
    if (_agentView === 'hub' && _marketplaceTab === 'ops') {
      try { pgAgentChat(_lastSetTopbar); } catch {}
    }
  }).catch(() => {});
  if (_agentView === 'hub') pgAgentChat(_lastSetTopbar);
};

// ── Phase 11: Stripe webhook replay handlers ─────────────────────────────────
// `oninput` keeps the input mirror state in sync so the disabled-state of the
// Replay button updates as the user types. We re-render so the button's
// `disabled` attribute flips on every keystroke (cheap — Ops tab only).
window._agentOpsWebhookReplayInput = function(val) {
  _webhookReplayInput = String(val == null ? '' : val);
  if (_agentView === 'hub' && _marketplaceTab === 'ops') {
    try { pgAgentChat(_lastSetTopbar); } catch {}
  }
};

window._agentOpsWebhookReplaySubmit = async function() {
  if (_webhookReplayBusy) return;
  // Pull live input value too — covers the case where oninput hasn't fired
  // yet (e.g. paste-then-click in Safari).
  try {
    const el = document.getElementById('webhook-replay-input');
    if (el && typeof el.value === 'string') _webhookReplayInput = el.value;
  } catch {}
  const eventId = String(_webhookReplayInput || '').trim();
  if (!/^evt_/.test(eventId)) return;

  // Mandatory operator-confirm — re-running a webhook handler against current
  // DB state is irreversible and the brief explicitly requires this prompt.
  const confirmFn = (typeof window !== 'undefined' && typeof window.confirm === 'function') ? window.confirm : null;
  if (confirmFn) {
    const ok = confirmFn(`Replay event ${eventId}? This re-runs the handler against current DB state.`);
    if (!ok) return;
  }

  _webhookReplayBusy = true;
  if (_agentView === 'hub' && _marketplaceTab === 'ops') {
    try { pgAgentChat(_lastSetTopbar); } catch {}
  }

  const headers = { 'Content-Type': 'application/json' };
  try {
    const t = api.getToken && api.getToken();
    if (t) headers['Authorization'] = 'Bearer ' + t;
  } catch {}

  try {
    const res = await fetch(`${_marketplaceApiBase()}/api/v1/agent-billing/admin/webhook-replay`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({ event_id: eventId }),
    });
    let body = null;
    try { body = await res.json(); } catch {}
    _webhookReplayResult = {
      ok: res.ok,
      status: res.status,
      body: body && typeof body === 'object' ? body : null,
      error: null,
    };
  } catch (err) {
    _webhookReplayResult = {
      ok: false,
      status: 0,
      body: null,
      error: err?.message || 'Network error',
    };
  } finally {
    _webhookReplayBusy = false;
    if (_agentView === 'hub' && _marketplaceTab === 'ops') {
      try { pgAgentChat(_lastSetTopbar); } catch {}
    }
  }
};

// ── Phase 13: Onboarding funnel handlers ─────────────────────────────────────
// Switching the window pill: if we already have the new window cached, swap
// the active window and re-render (no fetch). Otherwise fetch then re-render.
// Re-clicking the active pill is a no-op — required by the brief and tested.
window._agentOpsSetFunnelWindow = function(days) {
  const n = _onboardingFunnelClampDays(days);
  if (_onboardingFunnelDays === n) return;
  _onboardingFunnelDays = n;
  if (Object.prototype.hasOwnProperty.call(_onboardingFunnelByDays, n)) {
    if (_agentView === 'hub' && _marketplaceTab === 'ops') {
      try { pgAgentChat(_lastSetTopbar); } catch {}
    }
    return;
  }
  _fetchOnboardingFunnel(n).then(() => {
    if (_agentView === 'hub' && _marketplaceTab === 'ops') {
      try { pgAgentChat(_lastSetTopbar); } catch {}
    }
  }).catch(() => {});
  if (_agentView === 'hub') pgAgentChat(_lastSetTopbar);
};

window._agentActivityRefresh = function() {
  if (_activityLoading) return;
  _loadActivityRuns(true).then(() => {
    if (_agentView === 'hub' && _marketplaceTab === 'activity') {
      try { pgAgentChat(_lastSetTopbar); } catch {}
    }
  }).catch(() => {});
  // Re-render immediately so the button shows its disabled/loading state.
  if (_agentView === 'hub') pgAgentChat(_lastSetTopbar);
};

window._agentActivitySetFilter = function(agentId) {
  _activityAgentFilter = agentId || '';
  _activityRuns = null; // force loading state during refetch
  _loadActivityRuns(true).then(() => {
    if (_agentView === 'hub' && _marketplaceTab === 'activity') {
      try { pgAgentChat(_lastSetTopbar); } catch {}
    }
  }).catch(() => {});
  if (_agentView === 'hub') pgAgentChat(_lastSetTopbar);
};

// ── Phase 9: Prompt override handlers ────────────────────────────────────────
// Set a transient notice that auto-clears after 3s. Mirrors the pattern asked
// for in the Phase 9 brief — green for success, red for error, fades silently.
function _promptSetNotice(kind, text) {
  if (_promptNoticeTimer) {
    try { clearTimeout(_promptNoticeTimer); } catch {}
    _promptNoticeTimer = null;
  }
  _promptNotice = { kind, text };
  if (kind === 'success' || kind === 'info') {
    _promptNoticeTimer = setTimeout(() => {
      _promptNotice = null;
      _promptNoticeTimer = null;
      if (_agentView === 'hub' && _marketplaceTab === 'prompts') {
        try { pgAgentChat(_lastSetTopbar); } catch {}
      }
    }, 3000);
  }
}

window._agentPromptOverrideEdit = function(agentId) {
  if (!agentId) return;
  if (_promptEditingAgentId === agentId) {
    // Toggle close.
    _promptEditingAgentId = null;
    _promptDraft = '';
    _promptEditorError = null;
  } else {
    _promptEditingAgentId = agentId;
    const active = _activeOverrideForAgent(agentId);
    _promptDraft = active ? String(active.system_prompt || '') : '';
    _promptEditorError = null;
  }
  if (_agentView === 'hub') pgAgentChat(_lastSetTopbar);
};

window._agentPromptOverrideCancel = function() {
  _promptEditingAgentId = null;
  _promptDraft = '';
  _promptEditorError = null;
  if (_agentView === 'hub') pgAgentChat(_lastSetTopbar);
};

window._agentPromptOverrideDraftInput = function(val) {
  _promptDraft = String(val == null ? '' : val);
};

window._agentPromptOverrideSave = async function(agentId) {
  if (!agentId) return;
  if (_promptOverridesBusy) return;
  // Pull live textarea value if available — covers the case where oninput
  // hasn't fired yet (e.g. blur-after-paste edge case in Safari).
  try {
    const ta = document.getElementById('prompt-override-textarea');
    if (ta && typeof ta.value === 'string') _promptDraft = ta.value;
  } catch {}
  const draft = String(_promptDraft || '').trim();
  if (!draft) {
    _promptEditorError = 'System prompt cannot be empty.';
    if (_agentView === 'hub') pgAgentChat(_lastSetTopbar);
    return;
  }

  if (_isMarketplaceDemoMode()) {
    // Demo mode — simulate save locally. Mirrors the activation demo path.
    const fake = {
      id: 'demo-' + Date.now(),
      agent_id: agentId,
      clinic_id: null,
      system_prompt: draft,
      version: 1,
      enabled: true,
      created_at: new Date().toISOString(),
      created_by: 'demo',
    };
    _promptOverridesList = (_promptOverridesList || [])
      .filter(r => !(r.agent_id === agentId && r.enabled !== false))
      .concat([fake]);
    _promptEditingAgentId = null;
    _promptDraft = '';
    _promptEditorError = null;
    _promptSetNotice('success', `(demo) Saved override for ${agentId}.`);
    if (_agentView === 'hub') pgAgentChat(_lastSetTopbar);
    return;
  }

  _promptOverridesBusy = true;
  _promptEditorError = null;
  if (_agentView === 'hub') pgAgentChat(_lastSetTopbar);

  const headers = { 'Content-Type': 'application/json' };
  try {
    const t = api.getToken && api.getToken();
    if (t) headers['Authorization'] = 'Bearer ' + t;
  } catch {}

  try {
    const res = await fetch(`${_marketplaceApiBase()}/api/v1/agents/admin/prompt-overrides`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({ agent_id: agentId, system_prompt: draft }),
    });
    if (res.status === 403) {
      _promptEditorError = 'This action requires super-admin privileges.';
    } else if (!res.ok) {
      let msg = `Save failed (${res.status}).`;
      try {
        const body = await res.json();
        if (body && body.detail) msg = String(body.detail);
        else if (body && body.message) msg = String(body.message);
      } catch {}
      _promptEditorError = msg;
    } else {
      _promptEditingAgentId = null;
      _promptDraft = '';
      _promptEditorError = null;
      _promptSetNotice('success', `Saved override for ${agentId}.`);
      // Force a refetch so badges + version label reflect the new row.
      _promptOverridesList = null;
      _fetchPromptOverrides().finally(() => {
        if (_agentView === 'hub' && _marketplaceTab === 'prompts') {
          try { pgAgentChat(_lastSetTopbar); } catch {}
        }
      });
    }
  } catch (err) {
    _promptEditorError = err?.message || 'Save failed.';
  } finally {
    _promptOverridesBusy = false;
    if (_agentView === 'hub') pgAgentChat(_lastSetTopbar);
  }
};

window._agentPromptOverrideReset = async function(agentId) {
  if (!agentId) return;
  if (_promptOverridesBusy) return;
  const active = _activeOverrideForAgent(agentId);
  if (!active) return;
  // Confirm step per the Phase 9 brief — destructive, so block on the user
  // saying yes. `confirm` is stubbed in tests so we can drive both branches.
  let proceed = true;
  try {
    proceed = (typeof window.confirm === 'function')
      ? window.confirm(`Reset the prompt for ${agentId} to the registry default? This disables the current override.`)
      : true;
  } catch { proceed = true; }
  if (!proceed) return;

  if (_isMarketplaceDemoMode()) {
    _promptOverridesList = (_promptOverridesList || []).map(r => {
      if (r.agent_id === agentId && r.enabled !== false) return { ...r, enabled: false };
      return r;
    });
    _promptEditingAgentId = null;
    _promptDraft = '';
    _promptEditorError = null;
    _promptSetNotice('success', `(demo) Reset override for ${agentId}.`);
    if (_agentView === 'hub') pgAgentChat(_lastSetTopbar);
    return;
  }

  _promptOverridesBusy = true;
  _promptEditorError = null;
  if (_agentView === 'hub') pgAgentChat(_lastSetTopbar);

  const headers = { 'Content-Type': 'application/json' };
  try {
    const t = api.getToken && api.getToken();
    if (t) headers['Authorization'] = 'Bearer ' + t;
  } catch {}

  try {
    const res = await fetch(`${_marketplaceApiBase()}/api/v1/agents/admin/prompt-overrides/${encodeURIComponent(active.id)}`, {
      method: 'DELETE',
      headers,
      credentials: 'include',
    });
    if (res.status === 403) {
      _promptEditorError = 'This action requires super-admin privileges.';
    } else if (!res.ok && res.status !== 204) {
      _promptEditorError = `Reset failed (${res.status}).`;
    } else {
      _promptEditingAgentId = null;
      _promptDraft = '';
      _promptEditorError = null;
      _promptSetNotice('success', `Reset override for ${agentId} to default.`);
      _promptOverridesList = null;
      _fetchPromptOverrides().finally(() => {
        if (_agentView === 'hub' && _marketplaceTab === 'prompts') {
          try { pgAgentChat(_lastSetTopbar); } catch {}
        }
      });
    }
  } catch (err) {
    _promptEditorError = err?.message || 'Reset failed.';
  } finally {
    _promptOverridesBusy = false;
    if (_agentView === 'hub') pgAgentChat(_lastSetTopbar);
  }
};

// ── Phase 12: prompt-override history drawer handlers ───────────────────────
// Toggle the drawer for `agentId`. Re-clicking History on the same row closes
// it (per the brief — "Drawer collapses when 'History' is clicked again");
// clicking History on a different row closes the previous drawer and opens
// the new one ("Only one drawer open at a time per Prompts table"). On open
// we kick off the fetch and re-render when it lands.
window._agentPromptHistoryToggle = function(agentId) {
  if (!agentId) return;
  if (_promptHistoryOpenAgentId === agentId) {
    _promptHistoryOpenAgentId = null;
    _promptHistoryDiffOpen = null;
    if (_agentView === 'hub') pgAgentChat(_lastSetTopbar);
    return;
  }
  _promptHistoryOpenAgentId = agentId;
  _promptHistoryDiffOpen = null;
  // Always refetch on open so a save in another tab doesn't leave stale data.
  // Mark the cache as null (loading state) so the drawer renders the spinner
  // while the request is in flight.
  _promptHistoryByAgent[agentId] = null;
  _promptHistoryError = null;
  if (_agentView === 'hub') pgAgentChat(_lastSetTopbar);
  _fetchPromptHistory(agentId).finally(() => {
    if (_agentView === 'hub' && _marketplaceTab === 'prompts') {
      try { pgAgentChat(_lastSetTopbar); } catch {}
    }
  });
};

window._agentPromptHistoryDiffToggle = function(agentId, version) {
  if (!agentId) return;
  const key = `${agentId}:${version}`;
  if (_promptHistoryDiffOpen === key) _promptHistoryDiffOpen = null;
  else _promptHistoryDiffOpen = key;
  if (_agentView === 'hub') pgAgentChat(_lastSetTopbar);
};

// ── Phase 9: Test surface ────────────────────────────────────────────────────
// Internal exports used by the unit-test suite. Not part of the public API —
// nothing in `apps/web/src/main.js` (or any prod entry-point) imports this.
// Kept named `__promptOverridesTestApi__` so a casual reader sees it's a
// testing seam, not something to call from product code.
export const __promptOverridesTestApi__ = {
  // State resets between tests so order doesn't matter.
  reset() {
    _marketplaceTab = 'catalog';
    _promptOverridesList = null;
    _promptOverridesLoading = false;
    _promptOverridesError = null;
    _promptOverridesBusy = false;
    _promptEditingAgentId = null;
    _promptDraft = '';
    _promptEditorError = null;
    _promptNotice = null;
    if (_promptNoticeTimer) {
      try { clearTimeout(_promptNoticeTimer); } catch {}
      _promptNoticeTimer = null;
    }
    _marketplaceAgents = [];
    _marketplaceLoaded = false;
    _marketplaceLoading = false;
    // Park the view off-hub so handler-triggered re-renders are no-ops in
    // tests (no need to mock `document.getElementById('content')`).
    _agentView = 'detached';
    _lastSetTopbar = () => {};
  },
  // Direct render helper — drives `_renderPromptOverridesSection` without
  // needing a `<div id="content">` host. Returns the raw HTML string.
  renderSection(agents) {
    return _renderPromptOverridesSection(agents);
  },
  renderTabStrip() {
    return _renderMarketplaceTabStrip();
  },
  setTab(tab) {
    _marketplaceTab = tab;
  },
  isSuperAdmin() {
    return _isSuperAdmin();
  },
  fetchOverrides() {
    return _fetchPromptOverrides();
  },
  getState() {
    return {
      tab: _marketplaceTab,
      list: _promptOverridesList,
      error: _promptOverridesError,
      editingAgentId: _promptEditingAgentId,
      draft: _promptDraft,
      editorError: _promptEditorError,
      notice: _promptNotice,
      busy: _promptOverridesBusy,
    };
  },
};

// ── Phase 12: Test surface — prompt-override history drawer ─────────────────
// Mirrors `__promptOverridesTestApi__`. Exposes the history-drawer state +
// renderer to `apps/web/tests/agents-prompt-history.test.js` without standing
// up the live DOM. `reset()` also clears the underlying overrides cache so a
// fresh fetch happens on each test.
export const __promptHistoryTestApi__ = {
  reset() {
    _marketplaceTab = 'catalog';
    _promptOverridesList = null;
    _promptOverridesLoading = false;
    _promptOverridesError = null;
    _promptOverridesBusy = false;
    _promptEditingAgentId = null;
    _promptDraft = '';
    _promptEditorError = null;
    _promptNotice = null;
    if (_promptNoticeTimer) {
      try { clearTimeout(_promptNoticeTimer); } catch {}
      _promptNoticeTimer = null;
    }
    _promptHistoryOpenAgentId = null;
    _promptHistoryByAgent = {};
    _promptHistoryLoading = false;
    _promptHistoryError = null;
    _promptHistoryDiffOpen = null;
    _marketplaceAgents = [];
    _marketplaceLoaded = false;
    _marketplaceLoading = false;
    _agentView = 'detached';
    _lastSetTopbar = () => {};
  },
  // Seed the overrides list so renderSection can render the rows + History
  // button without needing a separate fetchOverrides() call. Most history
  // tests don't care about the override badges, just the History drawer.
  seedOverrides(rows) {
    _promptOverridesList = Array.isArray(rows) ? rows.slice() : [];
  },
  renderSection(agents) {
    return _renderPromptOverridesSection(agents);
  },
  isSuperAdmin() {
    return _isSuperAdmin();
  },
  fetchHistory(agentId) {
    return _fetchPromptHistory(agentId);
  },
  getState() {
    return {
      openAgentId: _promptHistoryOpenAgentId,
      byAgent: _promptHistoryByAgent,
      loading: _promptHistoryLoading,
      error: _promptHistoryError,
      diffOpen: _promptHistoryDiffOpen,
    };
  },
  // Direct access to the diff helper so we can unit-test the diff output
  // without needing a full render.
  diffLines(prev, curr) {
    return _diffLines(prev, curr);
  },
};

// ── Phase 11: Test surface — Stripe webhook replay UI ───────────────────────
// Mirrors `__promptOverridesTestApi__`. Same rationale: keep the Ops card's
// state observable for the unit tests in
// `apps/web/tests/webhook-replay-ui.test.js` without standing up a DOM.
export const __webhookReplayTestApi__ = {
  reset() {
    _marketplaceTab = 'catalog';
    _webhookReplayInput = '';
    _webhookReplayBusy = false;
    _webhookReplayResult = null;
    _agentView = 'detached';
    _lastSetTopbar = () => {};
  },
  renderCard() {
    return _renderOpsWebhookReplayCard();
  },
  renderTabStrip() {
    return _renderMarketplaceTabStrip();
  },
  isSuperAdmin() {
    return _isSuperAdmin();
  },
  setInput(val) {
    _webhookReplayInput = String(val == null ? '' : val);
  },
  getState() {
    return {
      input: _webhookReplayInput,
      busy: _webhookReplayBusy,
      result: _webhookReplayResult,
    };
  },
};

// ── Phase 13: Test surface — Onboarding funnel dashboard card ───────────────
// Mirrors the prompt-override / webhook-replay testing seam so the Phase 13
// tests in `apps/web/tests/onboarding-funnel-ui.test.js` can drive the card
// without a DOM. `reset()` wipes the per-window cache, error, and the active
// window pill back to the 7d default.
export const __onboardingFunnelTestApi__ = {
  reset() {
    _marketplaceTab = 'catalog';
    _onboardingFunnelDays = 7;
    _onboardingFunnelLoading = false;
    _onboardingFunnelError = null;
    _onboardingFunnelByDays = Object.create(null);
    _agentView = 'detached';
    _lastSetTopbar = () => {};
  },
  renderCard() {
    return _renderOpsOnboardingFunnelCard();
  },
  renderTabStrip() {
    return _renderMarketplaceTabStrip();
  },
  renderOpsSection(agents) {
    return _renderOpsSection(agents);
  },
  isSuperAdmin() {
    return _isSuperAdmin();
  },
  fetchFunnel(days) {
    return _fetchOnboardingFunnel(days);
  },
  setWindow(days) {
    _onboardingFunnelDays = _onboardingFunnelClampDays(days);
  },
  getState() {
    return {
      days: _onboardingFunnelDays,
      loading: _onboardingFunnelLoading,
      error: _onboardingFunnelError,
      byDays: _onboardingFunnelByDays,
    };
  },
};
