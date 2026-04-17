import { api } from './api.js';

// ── State ────────────────────────────────────────────────────────────────────
let _agentView = 'hub'; // 'hub' | 'chat-clinician' | 'chat-patient' | 'config'
let _agentBusy = false;
let _agentProvider = localStorage.getItem('ds_agent_provider') || 'glm-free';
let _agentOAKey = localStorage.getItem('ds_agent_oa_key') || '';
const PROVIDERS = [
  { id: 'glm-free', label: 'GLM-4 Free', desc: 'Free tier — no API key needed. Powered by GLM-4 (Zhipu AI).', icon: '🆓', needsKey: false },
  { id: 'anthropic', label: 'Claude', desc: 'System Anthropic key. No configuration needed.', icon: '🧠', needsKey: false },
  { id: 'openai', label: 'GPT-4o', desc: 'Requires your own OpenAI API key.', icon: '✦', needsKey: true },
];
let _taskFilter = 'all';
let _configAgent = 'clinician';

// ── Chat histories (separate per agent) ──────────────────────────────────────
function _loadHistory(agent) {
  try { return JSON.parse(localStorage.getItem(`ds_agent_history_${agent}`) || '[]'); } catch { return []; }
}
function _saveHistory(agent, msgs) {
  try { localStorage.setItem(`ds_agent_history_${agent}`, JSON.stringify(msgs.slice(-50))); } catch {}
}

// ── Task system ──────────────────────────────────────────────────────────────
function _loadTasks() {
  try { return JSON.parse(localStorage.getItem('ds_agent_tasks') || '[]'); } catch { return []; }
}
function _saveTasks(tasks) {
  localStorage.setItem('ds_agent_tasks', JSON.stringify(tasks.slice(-200)));
}
function _addTask(task) {
  const tasks = _loadTasks();
  tasks.push({ ...task, id: 't_' + Date.now(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), completedAt: null });
  _saveTasks(tasks);
  _logActivity('task_created', task.agent || 'clinician', task.title);
  return tasks;
}
function _updateTaskStatus(id, status) {
  const tasks = _loadTasks();
  const t = tasks.find(x => x.id === id);
  if (t) { t.status = status; t.updatedAt = new Date().toISOString(); if (status === 'done') t.completedAt = t.updatedAt; }
  _saveTasks(tasks);
  if (status === 'done') _logActivity('task_completed', t?.agent || 'clinician', t?.title || id);
}

// ── Activity log ─────────────────────────────────────────────────────────────
function _loadActivity() {
  try { return JSON.parse(localStorage.getItem('ds_agent_activity') || '[]'); } catch { return []; }
}
function _logActivity(type, agent, summary) {
  const log = _loadActivity();
  log.unshift({ type, agent, summary, ts: new Date().toISOString() });
  localStorage.setItem('ds_agent_activity', JSON.stringify(log.slice(0, 100)));
}

// ── Quick-action prompts ─────────────────────────────────────────────────────
const CLINICIAN_ACTIONS = [
  { label: 'Patient summary', icon: '👥', prompt: 'Give me a concise summary of my active patients and their current treatment courses.' },
  { label: 'Schedule overview', icon: '📅', prompt: 'What should I prioritise in my clinic today?' },
  { label: 'Review queue', icon: '📋', prompt: 'What items need my review or approval right now?' },
  { label: 'Protocol help', icon: '🧠', prompt: 'Help me choose the right protocol for a patient with treatment-resistant depression.' },
  { label: 'Draft reminder', icon: '💬', prompt: 'Draft a professional appointment reminder for a patient before their next TMS session.' },
  { label: 'AE review', icon: '⚠️', prompt: 'Walk me through how to properly document an adverse event following a TMS session.' },
];
const PATIENT_ACTIONS = [
  { label: 'My progress', icon: '📈', prompt: 'How is my treatment going? Show me my progress.' },
  { label: 'Next session', icon: '📅', prompt: 'When is my next session and what should I expect?' },
  { label: 'Side effects', icon: '💊', prompt: 'What side effects should I watch for with my current treatment?' },
  { label: 'Homework', icon: '📝', prompt: 'What homework or exercises do I need to complete before my next visit?' },
  { label: 'My condition', icon: '🧠', prompt: 'Explain my condition and how my treatment protocol works in simple terms.' },
  { label: 'Contact clinic', icon: '📞', prompt: 'How can I reach my clinic if I have an urgent concern?' },
];

// ── Helpers ──────────────────────────────────────────────────────────────────
const _esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

const _ago = ts => {
  const d = Date.now() - new Date(ts).getTime();
  const m = Math.floor(d / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  return Math.floor(h / 24) + 'd ago';
};

function _formatAgentText(text) {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.08);padding:1px 5px;border-radius:4px;font-size:0.9em">$1</code>')
    .replace(/\n/g, '<br>');
}

function _scrollAgentToBottom() {
  requestAnimationFrame(() => {
    const el = document.getElementById('agent-messages');
    if (el) el.scrollTop = el.scrollHeight;
  });
}

function _renderMsg(msg, agent) {
  const isUser = msg.role === 'user';
  const label = agent === 'patient' ? 'Patient Agent' : 'Clinician Agent';
  const timeStr = msg.ts ? new Date(msg.ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';
  return `
    <div class="agent-msg ${isUser ? 'agent-msg--user' : 'agent-msg--agent'}">
      <div class="agent-msg-bubble">
        ${isUser ? '' : `<div class="agent-msg-label">${label}</div>`}
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

function _rerender() {
  // re-invoke the page function through the global nav if available, otherwise direct
  if (typeof window._navigateTo === 'function') { window._navigateTo('agent'); }
  else { pgAgentChat(_lastSetTopbar); }
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
  setTopbar('OpenClaw Agents', '');

  const el = document.getElementById('content');
  if (!el) return;

  const clinHist = _loadHistory('clinician');
  const patHist = _loadHistory('patient');
  const tasks = _loadTasks();
  const pending = tasks.filter(t => t.status === 'pending' || t.status === 'in_progress');
  const done = tasks.filter(t => t.status === 'done');
  const filtered = _taskFilter === 'all' ? tasks : tasks.filter(t => t.status === _taskFilter);
  const activity = _loadActivity().slice(0, 15);
  const tgConnected = localStorage.getItem('ds_agent_tg_connected') === '1';

  el.innerHTML = `
    <div class="agent-hub">

      <!-- KPI strip -->
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px">
        <div class="card" style="text-align:center;padding:16px 12px">
          <div style="font-size:22px;font-weight:700;color:var(--violet)">${clinHist.length}</div>
          <div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">Clinician Messages</div>
        </div>
        <div class="card" style="text-align:center;padding:16px 12px">
          <div style="font-size:22px;font-weight:700;color:var(--teal)">${patHist.length}</div>
          <div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">Patient Messages</div>
        </div>
        <div class="card" style="text-align:center;padding:16px 12px">
          <div style="font-size:22px;font-weight:700;color:var(--amber,#f59e0b)">${pending.length}</div>
          <div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">Active Tasks</div>
        </div>
        <div class="card" style="text-align:center;padding:16px 12px">
          <div style="font-size:22px;font-weight:700;color:var(--green,#22c55e)">${done.length}</div>
          <div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">Completed Tasks</div>
        </div>
      </div>

      <!-- Agent cards -->
      <div class="agent-hub-grid">

        <!-- Clinician Agent -->
        <div class="agent-card agent-card--clinician">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
            <div class="agent-card__status"><span class="agent-card__status-dot agent-card__status-dot--active"></span> Active</div>
          </div>
          <div style="font-size:15px;font-weight:700;color:var(--text-primary);margin-bottom:6px">Clinician Agent</div>
          <div style="font-size:12px;color:var(--text-secondary);line-height:1.5;margin-bottom:14px">
            Your AI clinic assistant. Answers questions about patients, protocols, schedules, and manages day-to-day tasks.
          </div>
          <div style="display:flex;gap:16px;font-size:11px;color:var(--text-tertiary);margin-bottom:12px">
            <span><strong style="color:var(--text-secondary)">${clinHist.length}</strong> messages</span>
            <span><strong style="color:var(--text-secondary)">${tasks.filter(t=>t.agent==='clinician').length}</strong> tasks</span>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">
            <span class="pill-active" style="font-size:10px;padding:2px 8px">${(PROVIDERS.find(p=>p.id===_agentProvider)||PROVIDERS[0]).label}</span>
            <span style="font-size:10px;padding:2px 8px;border-radius:99px;background:${tgConnected ? 'rgba(34,197,94,0.12);color:#22c55e' : 'rgba(255,255,255,0.06);color:var(--text-tertiary)'}">
              ${tgConnected ? 'Telegram connected' : 'Telegram offline'}
            </span>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-primary btn-sm" onclick="window._agentOpenChat('clinician')">Open Chat</button>
            <button class="btn btn-sm btn-ghost" onclick="window._agentOpenConfig('clinician')">Configure</button>
            ${!tgConnected ? `<button class="btn btn-sm btn-ghost" onclick="window._agentOpenConfig('clinician')">Connect Telegram</button>` : ''}
          </div>
        </div>

        <!-- Patient Agent -->
        <div class="agent-card agent-card--patient">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
            <div class="agent-card__status"><span class="agent-card__status-dot agent-card__status-dot--active"></span> Active</div>
          </div>
          <div style="font-size:15px;font-weight:700;color:var(--text-primary);margin-bottom:6px">Patient Agent</div>
          <div style="font-size:12px;color:var(--text-secondary);line-height:1.5;margin-bottom:14px">
            Patient-facing assistant. Answers treatment questions, explains protocols, tracks homework &mdash; scoped to each patient's own data.
          </div>
          <div style="display:flex;gap:16px;font-size:11px;color:var(--text-tertiary);margin-bottom:12px">
            <span><strong style="color:var(--text-secondary)">${patHist.length}</strong> messages</span>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">
            <span style="font-size:10px;padding:2px 8px;border-radius:99px;background:rgba(34,197,94,0.12);color:#22c55e">Data isolated per patient</span>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-primary btn-sm" onclick="window._agentOpenChat('patient')">Open Chat</button>
            <button class="btn btn-sm btn-ghost" onclick="window._agentOpenConfig('patient')">Configure</button>
          </div>
        </div>
      </div>

      <!-- Task Board -->
      <div class="card" style="margin-top:20px">
        <div class="card-header" style="display:flex;align-items:center;justify-content:space-between">
          <span style="font-weight:700;font-size:14px">Task Board</span>
          <button class="btn btn-sm btn-primary" onclick="document.getElementById('agent-task-form').style.display=document.getElementById('agent-task-form').style.display==='none'?'block':'none'">+ New Task</button>
        </div>
        <div class="card-body" style="padding:0">
          <!-- New task form -->
          <div id="agent-task-form" style="display:none;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,0.06)">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
              <div class="form-group" style="margin:0">
                <label class="form-label">Title</label>
                <input id="task-title" class="form-control" placeholder="Task title">
              </div>
              <div class="form-group" style="margin:0">
                <label class="form-label">Patient (optional)</label>
                <input id="task-patient" class="form-control" placeholder="Patient name">
              </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:10px;align-items:end">
              <div class="form-group" style="margin:0">
                <label class="form-label">Due date</label>
                <input id="task-due" type="date" class="form-control">
              </div>
              <div class="form-group" style="margin:0">
                <label class="form-label">Priority</label>
                <select id="task-priority" class="form-control">
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="low">Low</option>
                </select>
              </div>
              <button class="btn btn-primary btn-sm" onclick="window._agentAddTask()" style="height:34px">Add</button>
            </div>
          </div>

          <!-- Tabs -->
          <div class="agent-tasks__tabs">
            ${['all','pending','in_progress','done'].map(f => `
              <button class="agent-tasks__tab ${_taskFilter===f?'agent-tasks__tab--active':''}" onclick="window._agentSetTaskFilter('${f}')">
                ${f === 'all' ? 'All' : f === 'in_progress' ? 'In Progress' : f.charAt(0).toUpperCase()+f.slice(1)}
              </button>`).join('')}
          </div>

          <!-- Table -->
          ${filtered.length === 0
            ? `<div style="padding:28px 16px;text-align:center;font-size:12px;color:var(--text-tertiary)">No tasks${_taskFilter !== 'all' ? ' with status "'+_taskFilter.replace('_',' ')+'"' : ''}.</div>`
            : `<table class="ds-table" style="margin:0">
                <thead><tr><th>Title</th><th>Patient</th><th>Due</th><th>Status</th><th style="width:120px">Actions</th></tr></thead>
                <tbody>
                  ${filtered.map(t => `<tr>
                    <td style="font-weight:600;font-size:12px">${_esc(t.title)}</td>
                    <td style="font-size:12px;color:var(--text-secondary)">${_esc(t.patient || '-')}</td>
                    <td style="font-size:11px;color:var(--text-tertiary)">${t.due || '-'}</td>
                    <td><span class="${t.status==='done'?'pill-active':'pill-pending'}" style="font-size:10px;padding:2px 8px">${t.status.replace('_',' ')}</span></td>
                    <td style="display:flex;gap:4px">
                      ${t.status !== 'done' ? `<button class="btn btn-sm btn-ghost" style="font-size:10px" onclick="window._agentCompleteTask('${t.id}')">Done</button>` : ''}
                      <button class="btn btn-sm btn-ghost" style="font-size:10px;color:var(--red,#ef4444)" onclick="window._agentDeleteTask('${t.id}')">Delete</button>
                    </td>
                  </tr>`).join('')}
                </tbody>
              </table>`
          }
        </div>
      </div>

      <!-- Activity Log -->
      <div class="card" style="margin-top:16px">
        <div class="card-header"><span style="font-weight:700;font-size:14px">Activity Log</span></div>
        <div class="card-body" style="padding:8px 16px">
          ${activity.length === 0
            ? `<div style="font-size:12px;color:var(--text-tertiary);padding:12px 0;text-align:center">No activity yet. Start chatting or create a task.</div>`
            : activity.map(a => {
                const dotColor = a.type === 'chat' ? 'var(--violet,#9b7fff)'
                  : a.type === 'task_created' ? 'var(--teal,#2dd4bf)'
                  : a.type === 'task_completed' ? 'var(--green,#22c55e)'
                  : a.type === 'telegram' ? '#3b82f6'
                  : 'var(--text-tertiary)';
                return `<div class="agent-activity__item">
                  <span class="agent-activity__dot" style="background:${dotColor}"></span>
                  <span class="agent-activity__text">${_esc(a.summary)}</span>
                  <span class="agent-activity__time">${_ago(a.ts)}</span>
                </div>`;
              }).join('')
          }
        </div>
      </div>

    </div>
  `;
}

// ── Chat View ────────────────────────────────────────────────────────────────
function _renderChat(setTopbar, agent) {
  const label = agent === 'patient' ? 'Patient Agent' : 'Clinician Agent';
  const actions = agent === 'patient' ? PATIENT_ACTIONS : CLINICIAN_ACTIONS;
  const history = _loadHistory(agent);

  setTopbar(label, `
    <button class="btn btn-sm btn-ghost" onclick="window._agentBackToHub()" style="font-size:11.5px">&#8592; Back to Hub</button>
    <button class="btn btn-sm btn-ghost" onclick="window._agentClearHistory('${agent}')" style="font-size:11.5px">&#8634; New Conversation</button>
  `);

  const el = document.getElementById('content');
  if (!el) return;

  el.innerHTML = `
    <div class="agent-shell">

      <!-- Sidebar -->
      <div class="agent-sidebar">
        <div class="agent-sidebar-head">
          <div style="font-size:11px;font-weight:700;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px">Quick Actions</div>
          ${actions.map(a => `
            <button class="agent-quick-btn" onclick="window._agentQuickAction('${agent}',${JSON.stringify(a.prompt)})">
              <span style="font-size:14px;flex-shrink:0">${a.icon}</span>
              <span>${a.label}</span>
            </button>
          `).join('')}
        </div>
        <div class="agent-sidebar-info">
          <div style="font-size:10px;color:var(--text-tertiary);line-height:1.6;margin-bottom:6px">
            <strong style="color:var(--text-secondary)">Provider:</strong>
            <span>${(PROVIDERS.find(p=>p.id===_agentProvider)||PROVIDERS[0]).label}</span>
          </div>
          <div style="font-size:10px;color:var(--text-tertiary);line-height:1.6">
            ${agent === 'patient'
              ? 'Patient agent is scoped to the selected patient\'s data only.'
              : 'Agent has no access to live patient data. Share context manually in chat.'}
          </div>
        </div>
        <div class="agent-sidebar-info" style="margin-top:8px">
          <div style="font-size:10px;color:var(--text-tertiary);line-height:1.6">
            <strong style="color:var(--text-secondary)">Messages:</strong>
            <span id="agent-msg-count">${history.length}</span>
          </div>
        </div>
      </div>

      <!-- Main chat -->
      <div class="agent-main">
        <div class="agent-messages" id="agent-messages">
          ${history.length === 0 ? `
            <div class="agent-welcome">
              <div class="agent-welcome-icon">${agent === 'patient' ? '🩺' : '✦'}</div>
              <div class="agent-welcome-title">${label}</div>
              <div class="agent-welcome-sub">
                ${agent === 'patient'
                  ? 'I can help you understand your treatment, track progress, and answer questions about your care. Use the quick actions or type below.'
                  : 'Your AI practice management assistant. Ask me anything about your patients, protocols, scheduling, or clinical workflows. Use quick actions on the left or type below.'}
              </div>
            </div>
          ` : history.map(m => _renderMsg(m, agent)).join('')}
        </div>

        <div class="agent-typing" id="agent-typing" style="display:none">
          <div class="agent-typing-dot"></div>
          <div class="agent-typing-dot"></div>
          <div class="agent-typing-dot"></div>
        </div>

        <div class="agent-input-area">
          <textarea
            id="agent-input"
            class="agent-textarea"
            placeholder="${agent === 'patient' ? 'Ask about your treatment, progress, or next steps...' : 'Ask about patients, protocols, scheduling, or workflows...'}"
            rows="1"
            onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();window._agentSend('${agent}')}"
            oninput="this.style.height='auto';this.style.height=Math.min(this.scrollHeight,140)+'px'"
          ></textarea>
          <button class="agent-send-btn" id="agent-send-btn" onclick="window._agentSend('${agent}')">&#8593;</button>
        </div>
        <div style="text-align:center;font-size:10px;color:var(--text-tertiary);padding:6px 0 2px">
          AI-generated content &mdash; always review before clinical use
        </div>
      </div>

    </div>
  `;

  _scrollAgentToBottom();
  setTimeout(() => document.getElementById('agent-input')?.focus(), 100);
}

// ── Config View ──────────────────────────────────────────────────────────────
function _renderConfig(setTopbar) {
  setTopbar('Agent Settings', `
    <button class="btn btn-sm btn-ghost" onclick="window._agentBackToHub()" style="font-size:11.5px">&#8592; Back to Hub</button>
  `);

  const el = document.getElementById('content');
  if (!el) return;

  const tgConnected = localStorage.getItem('ds_agent_tg_connected') === '1';
  const tgNotifs = JSON.parse(localStorage.getItem('ds_agent_tg_notifs') || '{"sessions":true,"reviews":true,"ae":true,"digest":false}');

  el.innerHTML = `
    <div style="max-width:600px;margin:0 auto">

      <!-- Provider -->
      <div class="card" style="margin-bottom:16px">
        <div class="card-header"><span style="font-weight:700;font-size:14px">AI Provider</span></div>
        <div class="card-body">
          <div style="font-size:12px;color:var(--text-secondary);margin-bottom:14px">Choose your AI engine. GLM-4 Free is ready instantly &mdash; no API key needed.</div>
          <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">
            ${PROVIDERS.map(p => `
              <button class="card" style="text-align:left;cursor:pointer;padding:12px 16px;border:1px solid ${_agentProvider===p.id ? 'var(--teal)' : 'var(--border)'};background:${_agentProvider===p.id ? 'rgba(0,212,188,0.06)' : 'var(--bg-card)'}"
                onclick="window._agentSetProvider('${p.id}')">
                <div style="display:flex;align-items:center;gap:8px">
                  <span style="font-size:16px">${p.icon}</span>
                  <span style="font-weight:700;font-size:13px;color:var(--text-primary)">${p.label}</span>
                  ${_agentProvider===p.id ? '<span style="margin-left:auto;font-size:10px;color:var(--teal);font-weight:600">ACTIVE</span>' : ''}
                </div>
                <div style="font-size:11px;color:var(--text-tertiary);margin-top:4px;padding-left:24px">${p.desc}</div>
              </button>
            `).join('')}
          </div>
          <div id="agent-oa-key-row" style="display:${_agentProvider === 'openai' ? 'block' : 'none'}">
            <div class="form-group">
              <label class="form-label">Your OpenAI API Key</label>
              <input id="agent-oa-key-input" type="password" class="form-control" placeholder="sk-..." value="${_esc(_agentOAKey)}"
                oninput="window._agentSaveOAKey(this.value)" style="font-family:monospace;font-size:12px">
            </div>
            <div style="font-size:10px;color:var(--text-tertiary)">Stored in browser only. Never sent to DeepSynaps servers.</div>
          </div>
        </div>
      </div>

      <!-- Telegram (clinician only) -->
      <div class="card" style="margin-bottom:16px">
        <div class="card-header"><span style="font-weight:700;font-size:14px">Telegram Connection</span></div>
        <div class="card-body">
          ${tgConnected ? `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">
              <span class="agent-tg-status" style="background:rgba(34,197,94,0.12);color:#22c55e;padding:4px 12px;border-radius:99px;font-size:11px;font-weight:600">Connected</span>
              <button class="btn btn-sm btn-ghost" style="font-size:10px;color:var(--red,#ef4444)" onclick="window._agentDisconnectTelegram()">Disconnect</button>
            </div>
          ` : `
            <div style="margin-bottom:14px">
              <div id="agent-tg-link-area">
                <button class="btn btn-primary btn-sm" onclick="window._agentConnectTelegram()">Connect Telegram</button>
              </div>
            </div>
          `}

          <div style="font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:10px">Notification Preferences</div>
          <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text-secondary);margin-bottom:8px;cursor:pointer">
            <input type="checkbox" ${tgNotifs.sessions?'checked':''} onchange="window._agentToggleTgNotif('sessions',this.checked)"> Session reminders
          </label>
          <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text-secondary);margin-bottom:8px;cursor:pointer">
            <input type="checkbox" ${tgNotifs.reviews?'checked':''} onchange="window._agentToggleTgNotif('reviews',this.checked)"> Review alerts
          </label>
          <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text-secondary);margin-bottom:8px;cursor:pointer">
            <input type="checkbox" ${tgNotifs.ae?'checked':''} onchange="window._agentToggleTgNotif('ae',this.checked)"> Adverse event alerts
          </label>
          <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text-secondary);cursor:pointer">
            <input type="checkbox" ${tgNotifs.digest?'checked':''} onchange="window._agentToggleTgNotif('digest',this.checked)"> Outcome digest
          </label>
        </div>
      </div>

    </div>
  `;
}

// ── Global handlers ──────────────────────────────────────────────────────────
window._agentOpenChat = function(agent) {
  _agentView = 'chat-' + agent;
  pgAgentChat(_lastSetTopbar);
};

window._agentOpenConfig = function(agent) {
  _configAgent = agent || 'clinician';
  _agentView = 'config';
  pgAgentChat(_lastSetTopbar);
};

window._agentBackToHub = function() {
  _agentView = 'hub';
  pgAgentChat(_lastSetTopbar);
};

window._agentSend = async function(agent) {
  if (_agentBusy) return;
  const input = document.getElementById('agent-input');
  const text = input?.value.trim();
  if (!text) return;

  input.value = '';
  input.style.height = 'auto';

  const history = _loadHistory(agent);
  const userMsg = { role: 'user', content: text, ts: new Date().toISOString() };
  history.push(userMsg);
  _saveHistory(agent, history);
  _appendMsg(userMsg, agent);

  _agentBusy = true;
  const sendBtn = document.getElementById('agent-send-btn');
  if (sendBtn) sendBtn.disabled = true;
  const typing = document.getElementById('agent-typing');
  if (typing) typing.style.display = 'flex';
  _scrollAgentToBottom();

  // Gather patient context
  let context = null;
  try {
    const selPid = localStorage.getItem('ds_selected_patient_id');
    if (selPid) {
      const pRes = await api.getPatient(selPid).catch(() => null);
      if (pRes) {
        const cRes = await api.listCourses().catch(() => null);
        const patientCourses = (cRes?.items || []).filter(c => c.patient_id === selPid);
        context = {
          patient: { id: pRes.id, name: pRes.name, condition: pRes.condition, modality: pRes.modality },
          activeCourses: patientCourses.filter(c => c.status === 'active').map(c => ({
            id: c.id, protocol: c.protocol_name || c.protocol, status: c.status, sessions: c.total_sessions
          })),
        };
      }
    }
  } catch {}

  try {
    let result;
    if (agent === 'patient') {
      result = await api.chatPatient(history, context, 'en', null);
    } else {
      result = await api.chatAgent(
        history,
        _agentProvider === 'glm-free' ? 'glm-free' : _agentProvider,
        _agentProvider === 'openai' ? _agentOAKey : null,
        context
      );
    }
    const reply = result?.reply || 'No response.';
    const assistantMsg = { role: 'assistant', content: reply, ts: new Date().toISOString() };
    history.push(assistantMsg);
    _saveHistory(agent, history);
    _appendMsg(assistantMsg, agent);
    _logActivity('chat', agent, `${agent === 'patient' ? 'Patient' : 'Clinician'} agent replied`);

    // Parse TASK: lines from response
    const taskLines = reply.split('\n').filter(l => l.trim().startsWith('TASK:'));
    for (const line of taskLines) {
      const title = line.replace(/^TASK:\s*/, '').trim();
      if (title) _addTask({ title, agent, status: 'pending', patient: '', due: '', priority: 'normal' });
    }
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

window._agentQuickAction = function(agent, prompt) {
  const input = document.getElementById('agent-input');
  if (input) { input.value = prompt; input.focus(); }
  window._agentSend(agent);
};

window._agentClearHistory = function(agent) {
  localStorage.removeItem(`ds_agent_history_${agent}`);
  const countEl = document.getElementById('agent-msg-count');
  if (countEl) countEl.textContent = '0';
  const el = document.getElementById('agent-messages');
  if (el) {
    const label = agent === 'patient' ? 'Patient Agent' : 'Clinician Agent';
    el.innerHTML = `
      <div class="agent-welcome">
        <div class="agent-welcome-icon">${agent === 'patient' ? '🩺' : '✦'}</div>
        <div class="agent-welcome-title">${label}</div>
        <div class="agent-welcome-sub">
          ${agent === 'patient'
            ? 'I can help you understand your treatment, track progress, and answer questions about your care.'
            : 'Your AI practice management assistant. Ask me anything about your patients, protocols, scheduling, or clinical workflows.'}
        </div>
      </div>`;
  }
};

window._agentAddTask = function() {
  const title = document.getElementById('task-title')?.value.trim();
  if (!title) return;
  const patient = document.getElementById('task-patient')?.value.trim() || '';
  const due = document.getElementById('task-due')?.value || '';
  const priority = document.getElementById('task-priority')?.value || 'normal';
  _addTask({ title, patient, due, priority, agent: 'clinician', status: 'pending' });
  window._showNotifToast?.({ title: 'Task created', body: title, severity: 'success' });
  // Re-render hub to show new task
  _agentView = 'hub';
  pgAgentChat(_lastSetTopbar);
};

window._agentCompleteTask = function(id) {
  _updateTaskStatus(id, 'done');
  window._showNotifToast?.({ title: 'Task completed', body: '', severity: 'success' });
  _agentView = 'hub';
  pgAgentChat(_lastSetTopbar);
};

window._agentDeleteTask = function(id) {
  const tasks = _loadTasks().filter(t => t.id !== id);
  _saveTasks(tasks);
  _agentView = 'hub';
  pgAgentChat(_lastSetTopbar);
};

window._agentSetTaskFilter = function(f) {
  _taskFilter = f;
  _agentView = 'hub';
  pgAgentChat(_lastSetTopbar);
};

window._agentSetProvider = function(provider) {
  _agentProvider = provider;
  localStorage.setItem('ds_agent_provider', provider);
  // Re-render config to update active states
  if (_agentView === 'config') { pgAgentChat(_lastSetTopbar); }
  else {
    const oaRow = document.getElementById('agent-oa-key-row');
    if (oaRow) oaRow.style.display = provider === 'openai' ? 'block' : 'none';
  }
  window._showNotifToast?.({ title: 'Provider changed', body: (PROVIDERS.find(p=>p.id===provider)||{}).label || provider, severity: 'info' });
};

window._agentSaveOAKey = function(val) {
  _agentOAKey = val;
  localStorage.setItem('ds_agent_oa_key', val);
};

window._agentConnectTelegram = async function() {
  const area = document.getElementById('agent-tg-link-area');
  if (!area) return;
  area.innerHTML = '<div style="font-size:12px;color:var(--text-tertiary)">Requesting link code...</div>';
  try {
    const res = await api.telegramLinkCode('clinician');
    const code = res?.code || res?.link_code || 'N/A';
    area.innerHTML = `
      <div class="agent-tg-code" style="font-family:monospace;font-size:20px;font-weight:700;color:var(--violet);background:rgba(155,127,255,0.08);padding:12px 20px;border-radius:8px;text-align:center;margin-bottom:10px;letter-spacing:2px">${_esc(code)}</div>
      <div style="font-size:11px;color:var(--text-secondary);margin-bottom:10px">Send this code to the DeepSynaps Telegram bot to link your account.</div>
      <button class="btn btn-primary btn-sm" onclick="window._agentConfirmTelegram()">I've sent the code</button>
    `;
  } catch (err) {
    area.innerHTML = `<div style="font-size:12px;color:var(--red,#ef4444)">Failed: ${_esc(err.message)}</div>
      <button class="btn btn-sm btn-ghost" style="margin-top:6px" onclick="window._agentConnectTelegram()">Retry</button>`;
  }
};

window._agentConfirmTelegram = function() {
  localStorage.setItem('ds_agent_tg_connected', '1');
  _logActivity('telegram', 'clinician', 'Telegram connected');
  window._showNotifToast?.({ title: 'Telegram connected', body: 'You will receive notifications via Telegram.', severity: 'success' });
  _agentView = 'config';
  pgAgentChat(_lastSetTopbar);
};

window._agentDisconnectTelegram = function() {
  localStorage.removeItem('ds_agent_tg_connected');
  _logActivity('telegram', 'clinician', 'Telegram disconnected');
  window._showNotifToast?.({ title: 'Telegram disconnected', body: '', severity: 'info' });
  _agentView = 'config';
  pgAgentChat(_lastSetTopbar);
};

window._agentToggleTgNotif = function(key, val) {
  const notifs = JSON.parse(localStorage.getItem('ds_agent_tg_notifs') || '{"sessions":true,"reviews":true,"ae":true,"digest":false}');
  notifs[key] = val;
  localStorage.setItem('ds_agent_tg_notifs', JSON.stringify(notifs));
};
