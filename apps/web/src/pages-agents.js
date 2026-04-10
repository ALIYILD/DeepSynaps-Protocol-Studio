import { api } from './api.js';

// ── Agent state ───────────────────────────────────────────────────────────────
let _agentHistory = [];   // { role, content }
let _agentBusy = false;
let _agentProvider = localStorage.getItem('ds_agent_provider') || 'anthropic';
let _agentOAKey = localStorage.getItem('ds_agent_oa_key') || '';
let _agentSettingsOpen = false;

// ── Quick-action prompts ──────────────────────────────────────────────────────
const QUICK_ACTIONS = [
  { label: 'Patient summary',   icon: '◉', prompt: 'Give me a concise summary of my active patients and their current treatment courses.' },
  { label: 'Schedule overview', icon: '📅', prompt: 'Summarise what a typical week looks like for a neuromodulation clinic and what I should prioritise today.' },
  { label: 'Draft reminder',    icon: '💬', prompt: 'Draft a professional appointment reminder message I can send to a patient before their next session. Keep it brief and reassuring.' },
  { label: 'Revenue insight',   icon: '💰', prompt: 'What are the key revenue metrics I should track in a neuromodulation practice, and how should I review them monthly?' },
  { label: 'Protocol help',     icon: '⬡',  prompt: 'Help me choose the right protocol modality for a patient presenting with treatment-resistant depression who has tried 2+ antidepressants.' },
  { label: 'Onboard checklist', icon: '📋', prompt: 'Generate an onboarding checklist for a new patient starting TMS therapy at my clinic.' },
  { label: 'AE review',         icon: '⚠',  prompt: 'Walk me through how to properly document and review an adverse event following a TMS session.' },
  { label: 'Business growth',   icon: '◫',  prompt: 'What are the most effective ways for a neuromodulation clinic to grow its patient base while maintaining clinical governance?' },
];

// ── Render ────────────────────────────────────────────────────────────────────
export async function pgAgentChat(setTopbar) {
  setTopbar('AI Practice Agent', `
    <button class="btn btn-sm" style="background:rgba(155,127,255,0.12);color:var(--violet);border:1px solid rgba(155,127,255,0.3);border-radius:8px;padding:5px 12px;font-size:11.5px;font-weight:600;cursor:pointer" onclick="window._agentToggleSettings()">
      ⚙ Agent Settings
    </button>
    <button class="btn btn-sm btn-secondary" onclick="window._agentClearHistory()" style="font-size:11.5px">
      ↺ New Conversation
    </button>
  `);

  const el = document.getElementById('content');
  el.innerHTML = `
    <div class="agent-shell">

      <!-- ── Sidebar: quick actions ── -->
      <div class="agent-sidebar">
        <div class="agent-sidebar-head">
          <div style="font-size:11px;font-weight:700;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px">Quick Actions</div>
          ${QUICK_ACTIONS.map(a => `
            <button class="agent-quick-btn" onclick="window._agentQuickAction(${JSON.stringify(a.prompt)})">
              <span style="font-size:14px;flex-shrink:0">${a.icon}</span>
              <span>${a.label}</span>
            </button>
          `).join('')}
        </div>

        <div class="agent-sidebar-info">
          <div style="font-size:10px;color:var(--text-tertiary);line-height:1.6;margin-bottom:6px">
            <strong style="color:var(--text-secondary)">Provider:</strong>
            <span id="agent-provider-label">${_agentProvider === 'openai' ? 'OpenAI (your key)' : 'Anthropic (system)'}</span>
          </div>
          <div style="font-size:10px;color:var(--text-tertiary);line-height:1.6">
            Agent has no access to live patient data. Share context manually in chat for personalised answers.
          </div>
        </div>
      </div>

      <!-- ── Main chat ── -->
      <div class="agent-main">

        <!-- Settings panel (hidden by default) -->
        <div class="agent-settings-panel" id="agent-settings-panel" style="display:none">
          <div class="agent-settings-inner">
            <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:14px">Agent Settings</div>

            <div style="font-size:11px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">AI Provider</div>
            <div style="display:flex;gap:8px;margin-bottom:16px">
              <button id="agent-btn-anthropic" class="agent-provider-btn ${_agentProvider === 'anthropic' ? 'active' : ''}"
                onclick="window._agentSetProvider('anthropic')">
                🧠 Anthropic (Claude)
              </button>
              <button id="agent-btn-openai" class="agent-provider-btn ${_agentProvider === 'openai' ? 'active' : ''}"
                onclick="window._agentSetProvider('openai')">
                ✦ OpenAI (GPT-4o)
              </button>
            </div>

            <div id="agent-oa-key-row" style="display:${_agentProvider === 'openai' ? 'block' : 'none'}">
              <div style="font-size:11px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Your OpenAI API Key</div>
              <input id="agent-oa-key-input" type="password" class="form-input" placeholder="sk-..." value="${_agentOAKey}"
                style="font-family:monospace;font-size:12px;margin-bottom:6px"
                oninput="window._agentSaveOAKey(this.value)">
              <div style="font-size:10px;color:var(--text-tertiary)">Stored in browser only. Never sent to DeepSynaps servers — passed directly to OpenAI.</div>
            </div>

            <div id="agent-anthropic-note" style="display:${_agentProvider === 'anthropic' ? 'block' : 'none'};font-size:11px;color:var(--text-secondary);line-height:1.6">
              Using the system Anthropic (Claude) key. No configuration needed.
            </div>
          </div>
        </div>

        <!-- Chat messages -->
        <div class="agent-messages" id="agent-messages">
          ${_agentHistory.length === 0 ? `
            <div class="agent-welcome">
              <div class="agent-welcome-icon">✦</div>
              <div class="agent-welcome-title">DeepSynaps Practice Agent</div>
              <div class="agent-welcome-sub">
                Your AI practice management assistant. Ask me anything about your patients,
                protocols, scheduling, billing, or clinical workflows.<br><br>
                Use quick actions on the left or type below to start.
              </div>
            </div>
          ` : _agentHistory.map(_renderMsg).join('')}
        </div>

        <!-- Typing indicator -->
        <div class="agent-typing" id="agent-typing" style="display:none">
          <div class="agent-typing-dot"></div>
          <div class="agent-typing-dot"></div>
          <div class="agent-typing-dot"></div>
        </div>

        <!-- Input area -->
        <div class="agent-input-area">
          <textarea
            id="agent-input"
            class="agent-textarea"
            placeholder="Ask me about your practice, patients, protocols, or any clinical workflow…"
            rows="1"
            onkeydown="window._agentKeydown(event)"
            oninput="this.style.height='auto';this.style.height=Math.min(this.scrollHeight,140)+'px'"
          ></textarea>
          <button class="agent-send-btn" id="agent-send-btn" onclick="window._agentSend()">
            ↑
          </button>
        </div>
        <div style="text-align:center;font-size:10px;color:var(--text-tertiary);padding:6px 0 2px">
          AI-generated content — always review before clinical use
        </div>
      </div>

    </div>
  `;

  // Scroll to bottom if history exists
  _scrollAgentToBottom();
  setTimeout(() => document.getElementById('agent-input')?.focus(), 100);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function _renderMsg(msg) {
  const isUser = msg.role === 'user';
  return `
    <div class="agent-msg ${isUser ? 'agent-msg--user' : 'agent-msg--agent'}">
      <div class="agent-msg-bubble">
        ${isUser ? '' : '<div class="agent-msg-label">Practice Agent</div>'}
        <div class="agent-msg-text">${_formatAgentText(msg.content)}</div>
      </div>
    </div>
  `;
}

function _formatAgentText(text) {
  // Basic markdown: bold, code, newlines
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

function _appendMsg(msg) {
  const el = document.getElementById('agent-messages');
  if (!el) return;
  // Remove welcome screen on first message
  const welcome = el.querySelector('.agent-welcome');
  if (welcome) welcome.remove();
  const div = document.createElement('div');
  div.innerHTML = _renderMsg(msg);
  el.appendChild(div.firstElementChild);
  _scrollAgentToBottom();
}

// ── Global handlers ───────────────────────────────────────────────────────────
window._agentSend = async function() {
  if (_agentBusy) return;
  const input = document.getElementById('agent-input');
  const text = input?.value.trim();
  if (!text) return;

  input.value = '';
  input.style.height = 'auto';

  const userMsg = { role: 'user', content: text };
  _agentHistory.push(userMsg);
  _appendMsg(userMsg);

  _agentBusy = true;
  document.getElementById('agent-send-btn').disabled = true;
  document.getElementById('agent-typing').style.display = 'flex';
  _scrollAgentToBottom();

  try {
    const result = await api.chatAgent(
      _agentHistory,
      _agentProvider,
      _agentProvider === 'openai' ? _agentOAKey : null,
      null
    );
    const reply = result?.reply || 'No response.';
    const assistantMsg = { role: 'assistant', content: reply };
    _agentHistory.push(assistantMsg);
    _appendMsg(assistantMsg);
  } catch (err) {
    const errMsg = { role: 'assistant', content: `Error: ${err.message || 'Failed to reach agent.'}` };
    _agentHistory.push(errMsg);
    _appendMsg(errMsg);
  } finally {
    _agentBusy = false;
    document.getElementById('agent-send-btn').disabled = false;
    document.getElementById('agent-typing').style.display = 'none';
    document.getElementById('agent-input')?.focus();
  }
};

window._agentKeydown = function(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    window._agentSend();
  }
};

window._agentQuickAction = function(prompt) {
  const input = document.getElementById('agent-input');
  if (input) { input.value = prompt; input.focus(); }
  window._agentSend();
};

window._agentClearHistory = function() {
  _agentHistory = [];
  const el = document.getElementById('agent-messages');
  if (el) el.innerHTML = `
    <div class="agent-welcome">
      <div class="agent-welcome-icon">✦</div>
      <div class="agent-welcome-title">DeepSynaps Practice Agent</div>
      <div class="agent-welcome-sub">
        Your AI practice management assistant. Ask me anything about your patients,
        protocols, scheduling, billing, or clinical workflows.<br><br>
        Use quick actions on the left or type below to start.
      </div>
    </div>
  `;
};

window._agentToggleSettings = function() {
  _agentSettingsOpen = !_agentSettingsOpen;
  const panel = document.getElementById('agent-settings-panel');
  if (panel) panel.style.display = _agentSettingsOpen ? 'block' : 'none';
};

window._agentSetProvider = function(provider) {
  _agentProvider = provider;
  localStorage.setItem('ds_agent_provider', provider);
  document.getElementById('agent-btn-anthropic')?.classList.toggle('active', provider === 'anthropic');
  document.getElementById('agent-btn-openai')?.classList.toggle('active', provider === 'openai');
  document.getElementById('agent-oa-key-row').style.display = provider === 'openai' ? 'block' : 'none';
  document.getElementById('agent-anthropic-note').style.display = provider === 'anthropic' ? 'block' : 'none';
  const lbl = document.getElementById('agent-provider-label');
  if (lbl) lbl.textContent = provider === 'openai' ? 'OpenAI (your key)' : 'Anthropic (system)';
};

window._agentSaveOAKey = function(val) {
  _agentOAKey = val;
  localStorage.setItem('ds_agent_oa_key', val);
};
