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
      ${isUser ? '' : `<div class="agent-msg-label">${label}${msg.skill ? ` · ${msg.skill}` : ''}</div>`}
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

// ── Marketplace tab state ────────────────────────────────────────────────────
// Tracks which sub-view of the Marketplace section is active. Not persisted to
// localStorage — fresh on each visit so the catalog is always the entry point.
let _marketplaceTab = 'catalog'; // 'catalog' | 'activity'
let _activityRuns = null;
let _activityAgentFilter = '';
let _activityLoading = false;
let _activityError = null;

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
    agent_id: 'clinic.aliclaw_doctor_telegram',
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
    id: 'clinic.aliclaw_doctor_telegram',
    name: 'AliClaw Doctor (Telegram)',
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

async function _runMarketplaceAgent(agentId, message) {
  if (_isMarketplaceDemoMode()) {
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
  const res = await fetch(`${_marketplaceApiBase()}/api/v1/agents/${encodeURIComponent(agentId)}/run`, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify({ message, context: {} }),
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
  return `<div style="display:flex;gap:6px;margin-bottom:12px">${tab('catalog', 'Catalog')}${tab('activity', 'Activity')}</div>`;
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
    const lockedAttrs = locked ? 'disabled title="Upgrade required" style="opacity:0.55;cursor:not-allowed"' : '';
    const tryBtn = locked
      ? `<button class="btn btn-sm btn-primary" ${lockedAttrs}>Try in chat</button>`
      : `<button class="btn btn-sm btn-primary" onclick="window._agentMarketplaceTry('${_esc(a.id)}')" style="font-size:11.5px">Try in chat</button>`;
    const cfgBtn = locked
      ? `<button class="btn btn-sm btn-ghost" ${lockedAttrs}>Configure</button>`
      : `<button class="btn btn-sm btn-ghost" onclick="window._agentMarketplaceConfigure('${_esc(a.id)}')" style="font-size:11.5px;opacity:0.7" title="Configuration coming soon">Configure</button>`;
    const dimStyle = locked ? 'opacity:0.7;' : '';
    const price = Number.isFinite(a.monthly_price_gbp) ? a.monthly_price_gbp : (a.monthly_price_gbp || 0);
    return `
      <div class="card ds-card" style="${dimStyle}padding:14px 16px;display:flex;flex-direction:column;gap:8px;min-height:170px">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          ${audPill}
          ${packageBadge}
        </div>
        <h3 style="font-size:14px;font-weight:700;color:var(--text-primary);margin:0">${_esc(a.name || a.id)}</h3>
        <div style="font-size:11.5px;color:var(--text-secondary);line-height:1.4;flex:1">${_esc(a.tagline || '')}</div>
        <div style="font-size:12px;font-weight:700;color:var(--text-primary)">£${_esc(String(price))}/mo</div>
        <div style="display:flex;gap:6px;margin-top:4px">
          ${tryBtn}
          ${cfgBtn}
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
      ${filterRow}
      <div class="card" style="padding:14px 16px;font-size:11.5px;color:var(--text-tertiary)">Loading agent activity…</div>
    `;
  }

  if (!_activityRuns.length) {
    return `
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
      <td style="white-space:nowrap">${status}</td>
    </tr>`;
  }).join('');

  return `
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
            <th>Status</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
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
  const replyBlock = _marketplaceModalReply
    ? `<div style="margin-top:12px;padding:12px;border-radius:8px;background:rgba(255,255,255,0.04);border:1px solid var(--border);font-size:12px;color:var(--text-primary);line-height:1.55;white-space:pre-wrap">${_formatAgentText(_marketplaceModalReply.reply || '(empty reply)')}
        ${groundedBlock}
        <div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--border);font-size:10.5px;color:var(--text-tertiary);font-style:italic">${_esc(_marketplaceModalReply.safety_footer || 'Decision-support, not autonomous diagnosis.')}</div>
      </div>`
    : '';
  const errBlock = _marketplaceModalError
    ? `<div style="margin-top:12px;padding:10px 12px;border-radius:8px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);font-size:11.5px;color:var(--red,#ef4444)">${_esc(_marketplaceModalError)}</div>`
    : '';
  const busyAttr = _marketplaceModalBusy ? 'disabled' : '';
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
  pgAgentChat(_lastSetTopbar);
  setTimeout(() => document.getElementById('agent-marketplace-input')?.focus(), 50);
};

window._agentMarketplaceConfigure = function(/* agentId */) {
  // Placeholder per spec — full configuration UI lands in a follow-up PR.
  alert('Configuration coming soon');
};

window._agentMarketplaceModalClose = function() {
  _marketplaceModalAgent = null;
  _marketplaceModalReply = null;
  _marketplaceModalError = null;
  _marketplaceModalBusy = false;
  if (_agentView === 'hub') pgAgentChat(_lastSetTopbar);
};

window._agentMarketplaceModalSend = async function() {
  if (_marketplaceModalBusy || !_marketplaceModalAgent) return;
  const input = document.getElementById('agent-marketplace-input');
  const message = (input?.value || '').trim();
  if (!message) return;
  _marketplaceModalBusy = true;
  _marketplaceModalError = null;
  pgAgentChat(_lastSetTopbar);
  try {
    const result = await _runMarketplaceAgent(_marketplaceModalAgent.id, message);
    if (result && result.error && !result.reply) {
      _marketplaceModalError = String(result.error);
    } else {
      _marketplaceModalReply = result || { reply: '' };
    }
  } catch (err) {
    _marketplaceModalError = err?.message || 'Agent run failed.';
  } finally {
    _marketplaceModalBusy = false;
    pgAgentChat(_lastSetTopbar);
  }
};

// ── Activity tab handlers ────────────────────────────────────────────────────
window._agentMarketplaceSetTab = function(tab) {
  if (tab !== 'catalog' && tab !== 'activity') return;
  if (_marketplaceTab === tab) return;
  _marketplaceTab = tab;
  // Lazy-load: only fetch runs the first time the user opens Activity. Mirror
  // the marketplace catalog hydration pattern — re-render once data lands.
  if (tab === 'activity' && _activityRuns === null && !_activityLoading) {
    _loadActivityRuns().then(() => {
      if (_agentView === 'hub' && _marketplaceTab === 'activity') {
        try { pgAgentChat(_lastSetTopbar); } catch {}
      }
    }).catch(() => {});
  }
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
