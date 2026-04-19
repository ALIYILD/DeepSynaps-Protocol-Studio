import { api } from './api.js';

// ── State ────────────────────────────────────────────────────────────────────
let _agentView = 'hub'; // 'hub' | 'chat-clinician' | 'chat-patient' | 'config'
let _agentBusy = false;
let _agentProvider = localStorage.getItem('ds_agent_provider') || 'glm-free';
let _agentOAKey = localStorage.getItem('ds_agent_oa_key') || '';
const PROVIDERS = [
  { id: 'glm-free', label: 'GLM-4 Free', desc: 'Free tier — no API key needed.', icon: '🆓' },
  { id: 'anthropic', label: 'Claude', desc: 'System key. No config needed.', icon: '🧠' },
  { id: 'openai', label: 'GPT-4o', desc: 'Requires your own API key.', icon: '✦' },
];
let _taskFilter = 'all';
let _configAgent = 'clinician';
let _activeSkill = null;

// ── Data helpers ─────────────────────────────────────────────────────────────
function _loadHistory(agent) {
  try { return JSON.parse(localStorage.getItem(`ds_agent_history_${agent}`) || '[]'); } catch { return []; }
}
function _saveHistory(agent, msgs) {
  try { localStorage.setItem(`ds_agent_history_${agent}`, JSON.stringify(msgs.slice(-50))); } catch {}
}
function _loadTasks() {
  try { return JSON.parse(localStorage.getItem('ds_agent_tasks') || '[]'); } catch { return []; }
}
function _saveTasks(tasks) { localStorage.setItem('ds_agent_tasks', JSON.stringify(tasks.slice(-200))); }
function _addTask(task) {
  const tasks = _loadTasks();
  tasks.push({ ...task, id: 't_' + Date.now(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), completedAt: null });
  _saveTasks(tasks);
  _logActivity('task_created', task.agent || 'clinician', task.title);
}
function _updateTaskStatus(id, status) {
  const tasks = _loadTasks();
  const t = tasks.find(x => x.id === id);
  if (t) { t.status = status; t.updatedAt = new Date().toISOString(); if (status === 'done') t.completedAt = t.updatedAt; }
  _saveTasks(tasks);
  if (status === 'done') _logActivity('task_completed', t?.agent || 'clinician', t?.title || id);
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
const SKILL_CATEGORIES = [
  { id: 'comms', label: 'Communication', icon: '💬' },
  { id: 'clinical', label: 'Clinical', icon: '🩺' },
  { id: 'admin', label: 'Administration', icon: '📋' },
  { id: 'reports', label: 'Reports & Data', icon: '📊' },
];

const CLINICIAN_SKILLS = [
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

// ── Main Export ──────────────────────────────────────────────────────────────
export async function pgAgentChat(setTopbar) {
  _lastSetTopbar = setTopbar;
  if (_agentView === 'hub') return _renderHub(setTopbar);
  if (_agentView === 'chat-clinician') return _renderChat(setTopbar, 'clinician');
  if (_agentView === 'chat-patient') return _renderChat(setTopbar, 'patient');
  if (_agentView === 'config') return _renderConfig(setTopbar);
}

// ── Hub View ─────────────────────────────────────────────────────────────────
function _renderHub(setTopbar) {
  setTopbar('AI Practice Agent', `
    <button class="btn btn-sm btn-ghost" onclick="window._agentOpenConfig()" style="font-size:11.5px">⚙ Settings</button>
  `);

  const el = document.getElementById('content');
  if (!el) return;

  const tasks = _loadTasks();
  const pendingTasks = tasks.filter(t => t.status === 'pending' || t.status === 'in_progress');
  const tgConnected = localStorage.getItem('ds_agent_tg_connected') === '1';
  const provLabel = (PROVIDERS.find(p => p.id === _agentProvider) || PROVIDERS[0]).label;
  const activity = _loadActivity().slice(0, 8);
  const userName = (() => { try { return JSON.parse(localStorage.getItem('ds_user') || '{}').display_name || JSON.parse(localStorage.getItem('ds_user') || '{}').name || 'Doctor'; } catch { return 'Doctor'; } })();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  el.innerHTML = `<div class="dv2-hub-shell" style="padding:20px;display:flex;flex-direction:column;gap:16px"><div class="agent-hub">

    <!-- Welcome banner -->
    <div class="card" style="padding:20px 24px;margin-bottom:20px;border-left:3px solid var(--violet);background:linear-gradient(135deg,rgba(155,127,255,0.05),rgba(0,212,188,0.03))">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
        <div>
          <div style="font-size:18px;font-weight:700;color:var(--text-primary);margin-bottom:4px">${greeting}, ${_esc(userName.split(' ')[0])}</div>
          <div style="font-size:12px;color:var(--text-secondary)">Your AI practice assistants are ready. Pick a skill below or start a conversation.</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <span style="font-size:10px;padding:3px 10px;border-radius:99px;background:rgba(74,222,128,0.12);color:var(--green,#22c55e);font-weight:600">${provLabel} active</span>
          ${tgConnected
            ? '<span style="font-size:10px;padding:3px 10px;border-radius:99px;background:rgba(74,222,128,0.12);color:var(--green,#22c55e);font-weight:600">✈ Telegram</span>'
            : `<button class="btn btn-sm" style="font-size:10px;border-color:var(--blue);color:var(--blue)" onclick="window._agentOpenConfig()">Connect Telegram</button>`}
        </div>
      </div>
    </div>

    <!-- Two agent launch cards -->
    <div class="agent-hub-grid" style="margin-bottom:20px">
      <button class="card agent-card--clinician" style="cursor:pointer;text-align:left;padding:16px 20px" onclick="window._agentOpenChat('clinician')">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
          <span style="font-size:20px">🩺</span>
          <span style="font-size:15px;font-weight:700;color:var(--text-primary)">Clinic Agent</span>
          <span class="agent-card__status-dot agent-card__status-dot--active" style="margin-left:auto"></span>
        </div>
        <div style="font-size:11.5px;color:var(--text-secondary);line-height:1.5">Your AI receptionist and clinical assistant. Manages patients, reports, scheduling, and clinic communications.</div>
      </button>
      <button class="card agent-card--patient" style="cursor:pointer;text-align:left;padding:16px 20px" onclick="window._agentOpenChat('patient')">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
          <span style="font-size:20px">👤</span>
          <span style="font-size:15px;font-weight:700;color:var(--text-primary)">Patient Agent</span>
          <span class="agent-card__status-dot agent-card__status-dot--active" style="margin-left:auto"></span>
        </div>
        <div style="font-size:11.5px;color:var(--text-secondary);line-height:1.5">Patient-facing assistant. Answers treatment questions, tracks homework, explains care — scoped per patient.</div>
      </button>
    </div>

    <!-- Skills Grid -->
    ${SKILL_CATEGORIES.map(cat => {
      const skills = CLINICIAN_SKILLS.filter(s => s.cat === cat.id);
      return `<div style="margin-bottom:16px">
        <div style="font-size:11px;font-weight:700;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px;padding-left:2px">${cat.icon} ${cat.label}</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px">
          ${skills.map(s => `
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
    }).join('')}

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
  const tgConnected = localStorage.getItem('ds_agent_tg_connected') === '1';
  const tgNotifs = JSON.parse(localStorage.getItem('ds_agent_tg_notifs') || '{"sessions":true,"reviews":true,"ae":true,"digest":false}');

  el.innerHTML = `<div style="max-width:600px;margin:0 auto;padding:20px 0">

    <!-- Provider -->
    <div class="card" style="margin-bottom:16px">
      <div class="card-header"><span style="font-weight:700;font-size:14px">AI Provider</span></div>
      <div class="card-body">
        <div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px">Choose your AI engine. GLM-4 Free works instantly.</div>
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

    <!-- Telegram -->
    <div class="card" style="margin-bottom:16px">
      <div class="card-header"><span style="font-weight:700;font-size:14px">Telegram Connection</span></div>
      <div class="card-body">
        <div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px">Connect Telegram to receive notifications and manage your clinic on the go.</div>
        ${tgConnected ? `
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">
            <span style="font-size:11px;font-weight:600;padding:4px 12px;border-radius:99px;background:rgba(74,222,128,0.12);color:var(--green,#22c55e)">Connected</span>
            <button class="btn btn-sm btn-ghost" style="font-size:10px;color:var(--red,#ef4444)" onclick="window._agentDisconnectTelegram()">Disconnect</button>
          </div>
        ` : `<div id="agent-tg-link-area" style="margin-bottom:14px">
          <div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px"><strong>3 easy steps:</strong></div>
          <div style="font-size:12px;color:var(--text-secondary);line-height:1.8;margin-bottom:12px">
            1. Click the button below to get your link code<br>
            2. Open Telegram and search for <strong>@DeepSynapsBot</strong><br>
            3. Send the code to the bot — done!
          </div>
          <button class="btn btn-primary btn-sm" onclick="window._agentConnectTelegram()">Get Link Code</button>
        </div>`}
        <div style="font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:8px">Notifications</div>
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
          const filterBar = '<div style="padding:8px 16px;display:flex;gap:6px;border-bottom:1px solid var(--border)">' +
            _FILTERS.map(f => '<button class="btn btn-sm '+(_taskFilter===f.id?'btn-primary':'btn-ghost')+'" style="font-size:10px;padding:3px 10px" onclick="window._agentSetTaskFilter(\''+f.id+'\')">'+f.label+' ('+(f.id==='all'?tasksAll.length:tasksAll.filter(x=>x.status===f.id).length)+')</button>').join('') + '</div>';
          const tasks = _taskFilter === 'all' ? tasksAll : tasksAll.filter(t => t.status === _taskFilter);
          if (!tasks.length) return filterBar + '<div style="padding:20px;text-align:center;font-size:12px;color:var(--text-tertiary)">No tasks match this filter.</div>';
          return filterBar + `<div style="padding:8px 16px">${tasks.slice(0, 20).map(t => `
            <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">
              <button style="width:18px;height:18px;border-radius:4px;border:1.5px solid ${t.status==='done'?'var(--green,#22c55e)':'var(--text-tertiary)'};background:${t.status==='done'?'rgba(74,222,128,0.2)':'none'};cursor:pointer;flex-shrink:0;font-size:10px;color:${t.status==='done'?'var(--green)':'var(--text-tertiary)'};display:flex;align-items:center;justify-content:center"
                onclick="window._agentCompleteTask('${t.id}')">${t.status==='done'?'✓':''}</button>
              <span style="flex:1;font-size:12px;color:${t.status==='done'?'var(--text-tertiary)':'var(--text-primary)'};${t.status==='done'?'text-decoration:line-through':''}">${_esc(t.title)}</span>
              ${t.due?`<span style="font-size:10px;color:var(--text-tertiary)">${t.due}</span>`:''}
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
      const [patientsRes, coursesRes, reviewRes, aeRes, outcomesRes, tasksLocal] = await Promise.all([
        api.listPatients().catch(() => null),
        api.listCourses().catch(() => null),
        api.listReviewQueue().catch(() => null),
        api.listAdverseEvents().catch(() => null),
        api.aggregateOutcomes().catch(() => null),
        Promise.resolve(_loadTasks()),
      ]);

      const patients = patientsRes?.items || [];
      const courses = coursesRes?.items || [];
      const reviewQueue = reviewRes?.items || [];
      const adverseEvents = aeRes?.items || [];
      const outcomes = outcomesRes || {};

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
        today: new Date().toISOString().split('T')[0],
        instructions: 'You are a clinic AI receptionist. You have full access to the clinic data above. Answer questions, create tasks (prefix with TASK:), and help manage day-to-day clinic operations. Be specific — use patient names, real data, and actionable advice.',
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
      if (title) _addTask({ title, agent, status: 'pending', patient: '', due: '', priority: 'normal' });
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

window._agentAddTask = function() {
  const title = document.getElementById('task-title')?.value.trim();
  if (!title) return;
  _addTask({ title, patient: document.getElementById('task-patient')?.value.trim() || '', due: document.getElementById('task-due')?.value || '', priority: 'normal', agent: 'clinician', status: 'pending' });
  window._showNotifToast?.({ title: 'Task created', body: title, severity: 'success' });
  _agentView = 'config'; pgAgentChat(_lastSetTopbar);
};
window._agentCompleteTask = function(id) { _updateTaskStatus(id, 'done'); window._showNotifToast?.({ title: 'Done', body: '', severity: 'success' }); pgAgentChat(_lastSetTopbar); };
window._agentDeleteTask = function(id) { const t = _loadTasks().filter(x => x.id !== id); _saveTasks(t); pgAgentChat(_lastSetTopbar); };
window._agentSetTaskFilter = function(f) { _taskFilter = f; pgAgentChat(_lastSetTopbar); };

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
      <div style="font-size:10.5px;color:var(--text-tertiary);margin-bottom:10px">Linking completes automatically once the bot receives your code. Tap below to mark it done on this device.</div>
      <button class="btn btn-primary btn-sm" onclick="window._agentConfirmTelegram()">Mark as linked ✓</button>`;
  } catch (err) {
    area.innerHTML = `<div style="font-size:12px;color:var(--red,#ef4444)">Failed: ${_esc(err.message)}</div>
      <button class="btn btn-sm btn-ghost" style="margin-top:6px" onclick="window._agentConnectTelegram()">Retry</button>`;
  }
};
window._agentConfirmTelegram = function() {
  localStorage.setItem('ds_agent_tg_connected', '1');
  _logActivity('telegram', 'clinician', 'Telegram connected');
  window._showNotifToast?.({ title: 'Telegram connected', body: 'You will receive notifications via Telegram.', severity: 'success' });
  _agentView = 'config'; pgAgentChat(_lastSetTopbar);
};
window._agentDisconnectTelegram = function() {
  localStorage.removeItem('ds_agent_tg_connected');
  _agentView = 'config'; pgAgentChat(_lastSetTopbar);
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
