import { api } from './api.js';
import { currentUser } from './auth.js';

function esc(v) {
  if (v == null) return '';
  return String(v)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#x27;');
}

function _ensureRoot(id) {
  let el = document.getElementById(id);
  if (el) return el;
  el = document.createElement('div');
  el.id = id;
  document.body.appendChild(el);
  return el;
}

function _toggleVisible(el, v) {
  el.classList.toggle('is-open', !!v);
  el.setAttribute('aria-hidden', v ? 'false' : 'true');
}

export function mountSalesChatWidget() {
  const root = _ensureRoot('ds-sales-chat');
  root.innerHTML = `
    <button class="ds-chat-fab" id="ds-sales-fab" type="button" aria-label="Message us">
      <span class="ds-chat-fab__icon">✉</span>
    </button>
    <div class="ds-chat-panel" id="ds-sales-panel" aria-hidden="true">
      <div class="ds-chat-panel__hd">
        <div>
          <div class="ds-chat-panel__title">Questions? Talk to our team</div>
          <div class="ds-chat-panel__sub">We usually reply within 1 business day.</div>
        </div>
        <button class="ds-chat-x" id="ds-sales-close" type="button" aria-label="Close">×</button>
      </div>
      <div class="ds-chat-panel__body">
        <div class="ds-chat-tabs">
          <button class="ds-chat-tab active" data-tab="sales" type="button">Message</button>
          <button class="ds-chat-tab" data-tab="faq" type="button">Ask AI</button>
        </div>

        <div class="ds-chat-tabpanel" data-tabpanel="sales">
          <div class="ds-chat-form">
            <input id="ds-sales-name" class="form-control" placeholder="Name (optional)" aria-label="Your name">
            <input id="ds-sales-email" class="form-control" placeholder="Email (optional)" aria-label="Email">
            <textarea id="ds-sales-msg" class="form-control" rows="4" placeholder="How can we help?" aria-label="Message"></textarea>
            <div id="ds-sales-status" class="ds-chat-status" style="display:none"></div>
            <button id="ds-sales-send" class="btn btn-primary btn-sm" type="button" style="width:100%">Send</button>
          </div>
        </div>

        <div class="ds-chat-tabpanel" data-tabpanel="faq" style="display:none">
          <div class="ds-chat-log" id="ds-faq-log"></div>
          <div class="ds-chat-compose">
            <input id="ds-faq-input" class="form-control" placeholder="Ask about plans, pricing, modalities…">
            <button id="ds-faq-send" class="btn btn-sm" type="button">Send</button>
          </div>
          <div class="ds-chat-footnote">AI answers are informational. For clinical questions, sign in as a clinician.</div>
        </div>
      </div>
    </div>
  `;

  const fab = document.getElementById('ds-sales-fab');
  const panel = document.getElementById('ds-sales-panel');
  const close = document.getElementById('ds-sales-close');
  if (!fab || !panel || !close) return;

  fab.onclick = () => _toggleVisible(panel, !panel.classList.contains('is-open'));
  close.onclick = () => _toggleVisible(panel, false);

  root.querySelectorAll('.ds-chat-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      root.querySelectorAll('.ds-chat-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.getAttribute('data-tab');
      root.querySelectorAll('.ds-chat-tabpanel').forEach(p => {
        p.style.display = p.getAttribute('data-tabpanel') === tab ? '' : 'none';
      });
    });
  });

  const statusEl = document.getElementById('ds-sales-status');
  const setStatus = (text, kind) => {
    if (!statusEl) return;
    statusEl.style.display = '';
    statusEl.className = 'ds-chat-status ' + (kind ? `ds-chat-status--${kind}` : '');
    statusEl.textContent = text;
  };

  document.getElementById('ds-sales-send')?.addEventListener('click', async () => {
    const name = document.getElementById('ds-sales-name')?.value || '';
    const email = document.getElementById('ds-sales-email')?.value || '';
    const msg = document.getElementById('ds-sales-msg')?.value || '';
    if ((msg || '').trim().length < 5) {
      setStatus('Please enter a bit more detail.', 'warn');
      return;
    }
    setStatus('Sending…', 'info');
    try {
      const res = await api.salesInquiry(name, email, msg, 'landing');
      if (res && res.ok !== false) {
        setStatus('Sent. Thanks — we’ll get back to you soon.', 'ok');
        const ta = document.getElementById('ds-sales-msg');
        if (ta) ta.value = '';
      } else {
        setStatus('Could not send. Please try again.', 'warn');
      }
    } catch {
      setStatus('Could not send. Please try again.', 'warn');
    }
  });

  const faqLog = document.getElementById('ds-faq-log');
  const append = (role, text) => {
    if (!faqLog) return;
    const div = document.createElement('div');
    div.className = 'ds-chat-bubble ' + (role === 'user' ? 'me' : 'bot');
    div.innerHTML = esc(text);
    faqLog.appendChild(div);
    faqLog.scrollTop = faqLog.scrollHeight;
  };
  document.getElementById('ds-faq-send')?.addEventListener('click', async () => {
    const inp = document.getElementById('ds-faq-input');
    const q = (inp?.value || '').trim();
    if (!q) return;
    if (inp) inp.value = '';
    append('user', q);
    try {
      const res = await api.chatPublic([{ role: 'user', content: q }]);
      append('assistant', res?.reply || 'Sorry — I could not answer that right now.');
    } catch {
      append('assistant', 'Sorry — I could not answer that right now.');
    }
  });
}

export function mountAppAgentWidget(kind) {
  // kind: 'patient' | 'clinician'
  const root = _ensureRoot('ds-app-agent');
  const _tgState = localStorage.getItem('ds_patient_tg_state') || 'idle';
  root.innerHTML = `
    <button class="ds-chat-fab ds-chat-fab--agent" id="ds-agent-fab" type="button" aria-label="AI agents">
      <span class="ds-chat-fab__icon">🧠</span>
    </button>
    <div class="ds-chat-panel" id="ds-agent-panel" aria-hidden="true">
      <div class="ds-chat-panel__hd">
        <div>
          <div class="ds-chat-panel__title">${kind === 'patient' ? 'Your AI Agent' : 'Clinic AI Agent'}</div>
          <div class="ds-chat-panel__sub">Powered by OpenClaw \u00b7 GLM-4.5 Air</div>
        </div>
        <button class="ds-chat-x" id="ds-agent-close" type="button" aria-label="Close">×</button>
      </div>
      <div class="ds-chat-panel__body">
        <div class="ds-agent-tabs">
          <button class="ds-agent-tab active" data-atab="chat">Chat</button>
          <button class="ds-agent-tab" data-atab="settings">\u2699 Settings</button>
        </div>
        <div data-atabpanel="chat">
          <div class="ds-chat-log" id="ds-agent-log"></div>
          <div class="ds-chat-compose">
            <input id="ds-agent-input" class="form-control" placeholder="Ask a question\u2026">
            <button id="ds-agent-send" class="btn btn-sm" type="button">Send</button>
          </div>
          <div class="ds-chat-footnote">${kind === 'patient' ? 'Not a substitute for your clinician.' : 'AI suggestions are advisory; verify clinically.'}</div>
        </div>
        <div data-atabpanel="settings" style="display:none;padding:10px 14px;font-size:12px">
          <div style="font-weight:700;font-size:13px;margin-bottom:10px">\u2708 Connect Telegram</div>
          <div style="color:var(--text-secondary);margin-bottom:10px">Get your AI agent on Telegram in 3 steps:</div>
          <div id="ds-agent-tg-area">${_tgState === 'pending'
            ? '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px"><span style="font-size:11px;font-weight:600;padding:4px 12px;border-radius:99px;background:rgba(255,179,71,0.14);color:var(--amber,#f59e0b)">Link code issued</span><button class="btn btn-sm btn-ghost" style="font-size:10px;color:var(--red,#ef4444)" onclick="window._patientDisconnectTg()">Clear</button></div><div style="font-size:11px;color:var(--text-secondary);line-height:1.7;margin-bottom:10px">This widget cannot verify Telegram linking yet. It only remembers that a link code was issued on this device.</div>'
            : '<div style="font-size:12px;color:var(--text-secondary);line-height:1.8;margin-bottom:10px">1. Click below to get your link code<br>2. Follow the bot handle shown with the code<br>3. Send the code to the bot to complete linking outside this widget</div><button class="btn btn-primary btn-sm" onclick="window._patientGetTgCode()">Get Link Code</button>'
          }</div>
          <div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border)">
            <div style="font-size:11px;color:var(--text-tertiary)">Model: <strong>GLM-4.5 Flash (Free)</strong></div>
            <div style="font-size:10px;color:var(--text-tertiary);margin-top:4px">Powered by OpenClaw</div>
          </div>
        </div>
      </div>
    </div>
  `;
  const fab = document.getElementById('ds-agent-fab');
  const panel = document.getElementById('ds-agent-panel');
  const close = document.getElementById('ds-agent-close');
  const log = document.getElementById('ds-agent-log');
  if (!fab || !panel || !close || !log) return;
  fab.onclick = () => _toggleVisible(panel, !panel.classList.contains('is-open'));
  close.onclick = () => _toggleVisible(panel, false);

  // Tab switching
  root.querySelectorAll('.ds-agent-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      root.querySelectorAll('.ds-agent-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const key = btn.getAttribute('data-atab');
      root.querySelectorAll('[data-atabpanel]').forEach(p => {
        p.style.display = p.getAttribute('data-atabpanel') === key ? '' : 'none';
      });
    });
  });

  // Patient Telegram handlers
  window._patientGetTgCode = async function() {
    const area = document.getElementById('ds-agent-tg-area');
    if (!area) return;
    area.innerHTML = '<div style="color:var(--text-secondary)">Requesting link code\u2026</div>';
    try {
      const res = await api.telegramLinkCode('patient');
      const code = res?.code || res?.data?.code || '------';
      const instr = res?.instructions || '';
      const m = instr.match(/@([A-Za-z0-9_]+)/);
      const handle = m ? m[1] : 'DeepSynapsPatientBot';
      area.innerHTML = `
        <div style="font-family:monospace;font-size:22px;font-weight:700;color:var(--teal);letter-spacing:3px;margin:10px 0">${code}</div>
        <div style="font-size:11px;color:var(--text-secondary);line-height:1.6;margin-bottom:10px">
          Open <strong>@${handle}</strong> on Telegram and send:<br>
          <code style="background:rgba(255,255,255,0.05);padding:2px 6px;border-radius:4px">LINK ${code}</code>
        </div>
        <div style="font-size:10.5px;color:var(--text-tertiary);margin-bottom:10px">This widget cannot verify Telegram linkage. After sending the code to the bot, you can keep a reminder on this device or clear it manually.</div>
        <button class="btn btn-primary btn-sm" onclick="window._patientConfirmTg()">Keep reminder on this device</button>
      `;
    } catch {
      area.innerHTML = '<div style="color:var(--red,#ef4444)">Could not get link code. Try again later.</div>';
    }
  };

  window._patientConfirmTg = function() {
    localStorage.setItem('ds_patient_tg_state', 'pending');
    if (typeof window._showNotifToast === 'function') {
      window._showNotifToast({ title: 'Reminder saved', body: 'This device will remember that a Telegram link code was issued, but linkage is not verified in-app yet.', severity: 'info' });
    }
    const area = document.getElementById('ds-agent-tg-area');
    if (area) area.innerHTML = '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px"><span style="font-size:11px;font-weight:600;padding:4px 12px;border-radius:99px;background:rgba(255,179,71,0.14);color:var(--amber,#f59e0b)">Link code issued</span><button class="btn btn-sm btn-ghost" style="font-size:10px;color:var(--red,#ef4444)" onclick="window._patientDisconnectTg()">Clear</button></div><div style="font-size:11px;color:var(--text-secondary);line-height:1.7">This widget cannot verify Telegram linking yet. It only remembers that a link code was issued on this device.</div>';
  };

  window._patientDisconnectTg = function() {
    localStorage.removeItem('ds_patient_tg_state');
    if (typeof window._showNotifToast === 'function') {
      window._showNotifToast({ title: 'Reminder cleared', body: 'This widget no longer stores a Telegram link-code reminder.', severity: 'info' });
    }
    const area = document.getElementById('ds-agent-tg-area');
    if (area) area.innerHTML = '<div style="font-size:12px;color:var(--text-secondary);line-height:1.8;margin-bottom:10px">1. Click below to get your link code<br>2. Follow the bot handle shown with the code<br>3. Send the code to the bot to complete linking outside this widget</div><button class="btn btn-primary btn-sm" onclick="window._patientGetTgCode()">Get Link Code</button>';
  };

  const append = (role, text) => {
    const div = document.createElement('div');
    div.className = 'ds-chat-bubble ' + (role === 'user' ? 'me' : 'bot');
    div.innerHTML = esc(text);
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  };

  document.getElementById('ds-agent-send')?.addEventListener('click', async () => {
    const inp = document.getElementById('ds-agent-input');
    const q = (inp?.value || '').trim();
    if (!q) return;
    if (inp) inp.value = '';
    append('user', q);
    try {
      if (kind === 'patient') {
        const res = await api.chatPatient([{ role: 'user', content: q }], null, 'en', null);
        append('assistant', res?.reply || 'Sorry — I could not answer that right now.');
      } else {
        const ctx = 'Clinician dashboard assistant (no patient selected).';
        const res = await api.chatAgent([{ role: 'user', content: q }], 'anthropic', null, ctx);
        append('assistant', res?.reply || 'Sorry — I could not answer that right now.');
      }
    } catch {
      append('assistant', 'Sorry — I could not answer that right now.');
    }
  });
}
