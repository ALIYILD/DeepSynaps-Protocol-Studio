// ════════════════════════════════════════════════════════════════════════════════
// Phase 10 — First-login clinic admin onboarding wizard.
//
// A 4-step linear flow:
//   1. Welcome / package selection (Solo Clinician £0 trial, Clinician Pro £99,
//      Enterprise custom).
//   2. Stripe billing (skip allowed only for Solo Clinician trial).
//   3. Enable agents (informational toggles, persisted to localStorage).
//   4. Invite team (POST /api/v1/team/invite per email; localStorage fallback
//      if endpoint unavailable). Done → redirects to agents marketplace.
//
// Match existing visual style — same fonts, button shapes, color tokens. No
// new design tokens.
//
// Kept in its own module (not pages-onboarding.js) so the unit-test suite can
// import it under Node without dragging in the legacy onboarding's transitive
// dependencies on auth.js / friendly-forms.js (both of which assume Vite
// `import.meta.env`).
// ════════════════════════════════════════════════════════════════════════════════

import { api } from './api.js';

function _obEsc(v) {
  if (v == null) return '';
  return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;');
}

const AGENT_ONB_STORAGE_KEY = 'deepsynaps.onboarding.enabledAgents';
const AGENT_ONB_SKIPPED_KEY = 'deepsynaps.onboarding.skipped';
const AGENT_ONB_DONE_KEY    = 'deepsynaps.onboarding.completed';
const AGENT_ONB_INVITES_KEY = 'deepsynaps.onboarding.pendingInvites';

const AGENT_ONB_PACKAGES = [
  { id: 'solo',       name: 'Solo Clinician',  price: '£0',     priceSub: 'free trial',
    desc: 'Perfect to get started — single clinician, demo data, no card needed.' },
  { id: 'pro',        name: 'Clinician Pro',   price: '£99',    priceSub: '/mo base',
    desc: 'Full marketplace access. Pay-as-you-go for paid agents on top.' },
  { id: 'enterprise', name: 'Enterprise',      price: 'Custom', priceSub: 'multi-site',
    desc: 'Multi-clinic, SSO, dedicated support. Talk to our team.' },
];

// ── State ─────────────────────────────────────────────────────────────────────
let _agentOnb = {
  step: 1,
  packageId: '',         // 'solo' | 'pro' | 'enterprise'
  agents: [],            // catalog from GET /api/v1/agents/
  agentsLoading: false,
  agentsError: null,
  enabledAgents: {},     // { [agentId]: bool }
  invitesText: '',
  inviteResult: null,    // { kind: 'ok'|'partial'|'fallback'|'error', text }
};

function _agentOnbApiBase() {
  try { return import.meta.env?.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000'; }
  catch { return 'http://127.0.0.1:8000'; }
}

function _agentOnbHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  try {
    const t = api.getToken && api.getToken();
    if (t) headers['Authorization'] = 'Bearer ' + t;
  } catch {}
  return headers;
}

// ── Phase 12 — funnel telemetry ──────────────────────────────────────────────
// Best-effort POST to the onboarding events endpoint. Never blocks or throws
// — telemetry must not regress wizard UX even when the API is unreachable.
function reportOnboardingEvent(step, payload) {
  try {
    const _fetch = (typeof fetch !== 'undefined') ? fetch : (globalThis && globalThis.fetch);
    if (typeof _fetch !== 'function') return Promise.resolve();
    return _fetch(`${_agentOnbApiBase()}/api/v1/onboarding/events`, {
      method: 'POST',
      headers: _agentOnbHeaders(),
      credentials: 'include',
      body: JSON.stringify({ step, payload: payload || null }),
    }).catch(() => {}); // never block the wizard on telemetry
  } catch {
    return Promise.resolve();
  }
}

// ── Catalog fetch ──────────────────────────────────────────────────────────────
async function _agentOnbFetchCatalog() {
  if (_agentOnb.agentsLoading) return;
  _agentOnb.agentsLoading = true;
  _agentOnb.agentsError = null;
  try {
    const res = await fetch(`${_agentOnbApiBase()}/api/v1/agents/`, {
      method: 'GET',
      headers: _agentOnbHeaders(),
      credentials: 'include',
    });
    let payload = null;
    try { payload = await res.json(); } catch {}
    let agents = [];
    if (payload && Array.isArray(payload.agents)) agents = payload.agents;
    else if (payload && Array.isArray(payload.items)) agents = payload.items;
    else if (Array.isArray(payload)) agents = payload;
    _agentOnb.agents = agents;
    if (!res.ok) _agentOnb.agentsError = 'Could not load agent catalog.';
  } catch (err) {
    _agentOnb.agentsError = 'Could not load agent catalog (offline).';
    _agentOnb.agents = [];
  } finally {
    _agentOnb.agentsLoading = false;
  }
}

// ── Stripe checkout for cheapest qualifying SKU ───────────────────────────────
async function _agentOnbStartCheckout() {
  // Pick the cheapest paid agent in the catalog for the selected package.
  // For Pro we look for the cheapest agent with a defined monthly_price_gbp;
  // for Enterprise we route through the same endpoint (the backend decides
  // the right SKU based on package_required/clinic state).
  const candidates = (_agentOnb.agents || [])
    .filter(a => Number.isFinite(a.monthly_price_gbp) && a.monthly_price_gbp > 0)
    .sort((a, b) => (a.monthly_price_gbp || 0) - (b.monthly_price_gbp || 0));
  const target = candidates[0] || (_agentOnb.agents || [])[0];
  if (!target || !target.id) {
    _showCheckoutError('No agent SKU available — please continue without billing.');
    return;
  }
  const successUrl = `${window.location.origin}${window.location.pathname}?onboarding=billing-ok`;
  const cancelUrl  = `${window.location.origin}${window.location.pathname}?onboarding=billing-cancelled`;
  const body = {
    agent_id: target.id,
    agent_name: target.name || target.id,
    package_required: Array.isArray(target.package_required) ? target.package_required : [_agentOnb.packageId],
    monthly_price_gbp: Number.isFinite(target.monthly_price_gbp) ? target.monthly_price_gbp : 0,
    success_url: successUrl,
    cancel_url: cancelUrl,
  };
  try {
    const res = await fetch(`${_agentOnbApiBase()}/api/v1/agent-billing/checkout/${encodeURIComponent(target.id)}`, {
      method: 'POST',
      headers: _agentOnbHeaders(),
      credentials: 'include',
      body: JSON.stringify(body),
    });
    let data = null;
    try { data = await res.json(); } catch {}
    if (data && data.ok && data.checkout_url) {
      window.location.assign(data.checkout_url);
      return;
    }
    _showCheckoutError("Couldn't start Stripe checkout. Please try again.");
  } catch {
    _showCheckoutError("Couldn't reach the billing service. Try again or skip for now.");
  }
}

function _showCheckoutError(text) {
  const el = document.getElementById('agent-onb-billing-err');
  if (el) { el.textContent = text; el.style.display = 'block'; }
}

// ── Invitations ───────────────────────────────────────────────────────────────
async function _agentOnbSendInvites() {
  const raw = (document.getElementById('agent-onb-invites-text')?.value || _agentOnb.invitesText || '').trim();
  const emails = raw.split(/[\s,;]+/).map(e => e.trim()).filter(e => /.+@.+\..+/.test(e));
  if (!emails.length) {
    _agentOnb.inviteResult = { kind: 'error', text: 'Please enter at least one email address.' };
    return;
  }
  let okCount = 0, failCount = 0, fellBack = false;
  for (const email of emails) {
    try {
      const res = await fetch(`${_agentOnbApiBase()}/api/v1/team/invite`, {
        method: 'POST',
        headers: _agentOnbHeaders(),
        credentials: 'include',
        body: JSON.stringify({ email, role: 'clinician' }),
      });
      if (res.ok) {
        okCount += 1;
      } else if (res.status === 404 || res.status === 405) {
        // Endpoint missing — fall back to localStorage queue for the entire
        // batch and stop hammering the API.
        fellBack = true;
        break;
      } else {
        failCount += 1;
      }
    } catch {
      // Network unreachable → fall back.
      fellBack = true;
      break;
    }
  }
  if (fellBack) {
    try {
      const existing = JSON.parse(localStorage.getItem(AGENT_ONB_INVITES_KEY) || '[]');
      const merged = Array.from(new Set([...existing, ...emails]));
      localStorage.setItem(AGENT_ONB_INVITES_KEY, JSON.stringify(merged));
    } catch {}
    _agentOnb.inviteResult = {
      kind: 'fallback',
      text: `We'll email these ${emails.length} ${emails.length === 1 ? 'address' : 'addresses'} for you when invitations ship.`,
    };
    return;
  }
  if (okCount && !failCount) {
    _agentOnb.inviteResult = { kind: 'ok', text: `Sent ${okCount} invitation${okCount === 1 ? '' : 's'}.` };
  } else if (okCount && failCount) {
    _agentOnb.inviteResult = { kind: 'partial', text: `Sent ${okCount}, ${failCount} failed.` };
  } else {
    _agentOnb.inviteResult = { kind: 'error', text: 'Could not send invitations.' };
  }
}

// ── Step renderers ────────────────────────────────────────────────────────────
function _agentOnbProgress() {
  const total = 4;
  const pct = Math.round((_agentOnb.step / total) * 100);
  return `
    <div data-test="agent-onb-progress" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px">
      <div style="font-size:11.5px;font-weight:600;color:var(--text-secondary);letter-spacing:.4px;text-transform:uppercase">
        Step ${_agentOnb.step} of ${total}
      </div>
      <a href="#" data-test="agent-onb-skip-link"
         style="font-size:11.5px;color:var(--text-tertiary);text-decoration:none"
         onclick="window._agentOnbSkipWizard(event)">Skip wizard</a>
    </div>
    <div style="height:6px;background:var(--border);border-radius:99px;overflow:hidden;margin-bottom:20px">
      <div style="height:100%;width:${pct}%;background:var(--violet);border-radius:99px;transition:width 240ms ease"></div>
    </div>
  `;
}

function _agentOnbStep1() {
  return `
    <div data-test="agent-onb-step-1" id="agent-onb-step-1">
      ${_agentOnbProgress()}
      <h2 style="font-size:20px;font-weight:700;color:var(--text-primary);margin:0 0 6px">Welcome to DeepSynaps</h2>
      <p style="font-size:13px;color:var(--text-secondary);margin:0 0 18px">Pick the package that fits your clinic. You can change this later.</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-bottom:24px">
        ${AGENT_ONB_PACKAGES.map(p => {
          const sel = _agentOnb.packageId === p.id;
          const border = sel ? 'var(--violet)' : 'var(--border)';
          const bg     = sel ? 'rgba(139,92,246,0.06)' : 'transparent';
          return `
          <div data-test="agent-onb-pkg-${p.id}"
               role="button" tabindex="0"
               onclick="window._agentOnbSelectPackage('${p.id}')"
               style="border:2px solid ${border};background:${bg};border-radius:12px;padding:16px;cursor:pointer;transition:border-color 200ms ease,background 200ms ease">
            <div style="font-size:14px;font-weight:700;color:var(--text-primary);margin-bottom:4px">${_obEsc(p.name)}</div>
            <div style="font-size:18px;font-weight:800;color:var(--violet);margin-bottom:2px">${_obEsc(p.price)}</div>
            <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:10px">${_obEsc(p.priceSub)}</div>
            <div style="font-size:12px;color:var(--text-secondary);line-height:1.5">${_obEsc(p.desc)}</div>
          </div>`;
        }).join('')}
      </div>
      <div style="display:flex;justify-content:flex-end">
        <button class="btn btn-primary" data-test="agent-onb-step1-continue"
          onclick="window._agentOnbContinue()"
          ${_agentOnb.packageId ? '' : 'disabled'}
          style="font-size:13px;padding:10px 22px;font-weight:600">
          Continue →
        </button>
      </div>
    </div>
  `;
}

function _agentOnbStep2() {
  const isSolo = _agentOnb.packageId === 'solo';
  const skipDisabled = !isSolo;
  return `
    <div data-test="agent-onb-step-2" id="agent-onb-step-2">
      ${_agentOnbProgress()}
      <h2 style="font-size:20px;font-weight:700;color:var(--text-primary);margin:0 0 6px">Connect billing</h2>
      <p style="font-size:13px;color:var(--text-secondary);margin:0 0 16px">
        We'll redirect you to Stripe to enter card details. You won't be charged
        until you enable a paid agent.
      </p>
      <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:18px">
        <div style="font-size:12.5px;color:var(--text-secondary);line-height:1.6">
          Stripe Checkout is a secure hosted page. We never see your card.
          ${isSolo ? 'Solo Clinician trials can skip this step.' : 'A card is required for paid packages.'}
        </div>
      </div>
      <div id="agent-onb-billing-err" role="alert"
        style="display:none;margin-bottom:14px;padding:10px 12px;border-radius:8px;border:1px solid rgba(255,107,107,0.25);background:rgba(255,107,107,0.08);color:var(--red,#ff6b6b);font-size:12.5px"></div>
      <div style="display:flex;gap:10px;justify-content:space-between;align-items:center">
        <button class="btn" data-test="agent-onb-back"
          onclick="window._agentOnbBack()"
          style="font-size:12.5px;padding:8px 16px">← Back</button>
        <div style="display:flex;gap:10px">
          <button class="btn" data-test="agent-onb-skip-billing"
            onclick="window._agentOnbSkipBilling()"
            ${skipDisabled ? 'disabled' : ''}
            title="${skipDisabled ? 'Skip is only available on the Solo Clinician trial' : 'Skip billing for now'}"
            style="font-size:12.5px;padding:8px 16px;${skipDisabled ? 'opacity:0.45;cursor:not-allowed' : ''}">Skip for now (trial)</button>
          <button class="btn btn-primary" data-test="agent-onb-stripe"
            onclick="window._agentOnbStartCheckout()"
            style="font-size:12.5px;padding:8px 16px;font-weight:600">Connect Stripe →</button>
        </div>
      </div>
    </div>
  `;
}

function _agentOnbStep3() {
  const agents = _agentOnb.agents || [];
  let body;
  if (_agentOnb.agentsLoading) {
    body = `<div data-test="agent-onb-catalog-loading" style="padding:14px 16px;font-size:12px;color:var(--text-tertiary)">Loading agents…</div>`;
  } else if (!agents.length) {
    const err = _agentOnb.agentsError ? _obEsc(_agentOnb.agentsError) : 'No agents available yet.';
    body = `<div data-test="agent-onb-catalog-empty" style="padding:14px 16px;font-size:12px;color:var(--text-tertiary)">${err}</div>`;
  } else {
    body = `
      <div data-test="agent-onb-catalog-list" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px">
        ${agents.map(a => {
          const id = a.id || a.slug || a.name;
          const checked = !!_agentOnb.enabledAgents[id];
          return `
          <div data-test="agent-onb-agent-${_obEsc(id)}"
               style="border:1px solid var(--border);border-radius:10px;padding:12px 14px;display:flex;align-items:flex-start;gap:10px">
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;flex:1;min-width:0">
              <input type="checkbox" data-test="agent-onb-toggle"
                ${checked ? 'checked' : ''}
                onchange="window._agentOnbToggleAgent('${_obEsc(id)}', this.checked)"
                style="accent-color:var(--violet);width:16px;height:16px" />
              <div style="min-width:0">
                <div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:2px">${_obEsc(a.name || id)}</div>
                <div style="font-size:11.5px;color:var(--text-secondary);line-height:1.45">${_obEsc((a.description || a.summary || '').slice(0, 120))}</div>
              </div>
            </label>
          </div>`;
        }).join('')}
      </div>
    `;
  }
  return `
    <div data-test="agent-onb-step-3" id="agent-onb-step-3">
      ${_agentOnbProgress()}
      <h2 style="font-size:20px;font-weight:700;color:var(--text-primary);margin:0 0 6px">Enable agents</h2>
      <p style="font-size:13px;color:var(--text-secondary);margin:0 0 16px">Tick the agents you'd like ready to go. Paid agents bill per-seat via Stripe.</p>
      ${body}
      <div style="display:flex;gap:10px;justify-content:space-between;align-items:center;margin-top:22px">
        <button class="btn" data-test="agent-onb-back"
          onclick="window._agentOnbBack()"
          style="font-size:12.5px;padding:8px 16px">← Back</button>
        <button class="btn btn-primary" data-test="agent-onb-step3-continue"
          onclick="window._agentOnbContinue()"
          style="font-size:12.5px;padding:8px 16px;font-weight:600">Continue →</button>
      </div>
    </div>
  `;
}

function _agentOnbStep4() {
  const r = _agentOnb.inviteResult;
  let resultEl = '';
  if (r) {
    const colorMap = {
      ok:       { fg: 'var(--teal)',  bg: 'rgba(0,212,188,0.08)',  bd: 'rgba(0,212,188,0.25)' },
      partial:  { fg: 'var(--amber,#f59e0b)', bg: 'rgba(245,158,11,0.08)', bd: 'rgba(245,158,11,0.25)' },
      fallback: { fg: 'var(--blue)', bg: 'rgba(74,158,255,0.08)', bd: 'rgba(74,158,255,0.25)' },
      error:    { fg: 'var(--red,#ff6b6b)', bg: 'rgba(255,107,107,0.08)', bd: 'rgba(255,107,107,0.25)' },
    };
    const c = colorMap[r.kind] || colorMap.fallback;
    resultEl = `
      <div data-test="agent-onb-invite-result-${r.kind}"
        style="margin-top:12px;padding:10px 12px;border-radius:8px;border:1px solid ${c.bd};background:${c.bg};color:${c.fg};font-size:12.5px">
        ${_obEsc(r.text)}
      </div>
    `;
  }
  return `
    <div data-test="agent-onb-step-4" id="agent-onb-step-4">
      ${_agentOnbProgress()}
      <h2 style="font-size:20px;font-weight:700;color:var(--text-primary);margin:0 0 6px">Invite your team</h2>
      <p style="font-size:13px;color:var(--text-secondary);margin:0 0 14px">Comma-separated email addresses. We'll send each one an invite link.</p>
      <textarea id="agent-onb-invites-text" data-test="agent-onb-invites-text"
        rows="4"
        placeholder="alex@clinic.com, morgan@clinic.com"
        oninput="window._agentOnbSetInvites(this.value)"
        style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:10px;background:var(--bg-surface);color:var(--text-primary);font-size:13px;font-family:inherit;resize:vertical">${_obEsc(_agentOnb.invitesText)}</textarea>
      ${resultEl}
      <div style="display:flex;gap:10px;justify-content:space-between;align-items:center;margin-top:22px">
        <button class="btn" data-test="agent-onb-back"
          onclick="window._agentOnbBack()"
          style="font-size:12.5px;padding:8px 16px">← Back</button>
        <div style="display:flex;gap:10px">
          <button class="btn" data-test="agent-onb-send-invites"
            onclick="window._agentOnbSendInvitesUI()"
            style="font-size:12.5px;padding:8px 16px">Send invites</button>
          <button class="btn btn-primary" data-test="agent-onb-done"
            onclick="window._agentOnbDone()"
            style="font-size:12.5px;padding:8px 16px;font-weight:600">Done →</button>
        </div>
      </div>
    </div>
  `;
}

function _agentOnbRender(host) {
  const el = host || document.getElementById('content');
  if (!el) return;
  let html;
  switch (_agentOnb.step) {
    case 1: html = _agentOnbStep1(); break;
    case 2: html = _agentOnbStep2(); break;
    case 3: html = _agentOnbStep3(); break;
    case 4: html = _agentOnbStep4(); break;
    default: html = _agentOnbStep1();
  }
  el.innerHTML = `
    <div style="max-width:680px;margin:0 auto;padding:36px 24px">
      <div style="background:var(--bg-card,var(--bg-surface));border:1px solid var(--border);border-radius:16px;padding:28px 28px 24px;box-shadow:0 1px 2px rgba(0,0,0,0.04)">
        ${html}
      </div>
    </div>
  `;
}

// ── Global handlers ───────────────────────────────────────────────────────────
// Guard for environments without a `window` (Node test runner).
const _g = (typeof window !== 'undefined') ? window : globalThis;

_g._agentOnbSelectPackage = function(pkgId) {
  _agentOnb.packageId = pkgId;
  reportOnboardingEvent('package_selected', { package_id: pkgId });
  _agentOnbRender();
};

_g._agentOnbContinue = async function() {
  if (_agentOnb.step === 1) {
    if (!_agentOnb.packageId) return;
    _agentOnb.step = 2;
    _agentOnbRender();
    return;
  }
  if (_agentOnb.step === 2) {
    // Continuing from billing without explicit Stripe → only allowed via Skip,
    // which has its own handler. Defensive: just advance.
    _agentOnb.step = 3;
    _agentOnbRender();
    if (!_agentOnb.agents.length && !_agentOnb.agentsLoading) {
      await _agentOnbFetchCatalog();
      _agentOnbRender();
    }
    return;
  }
  if (_agentOnb.step === 3) {
    try { localStorage.setItem(AGENT_ONB_STORAGE_KEY, JSON.stringify(_agentOnb.enabledAgents)); } catch {}
    const selected = Object.keys(_agentOnb.enabledAgents || {}).filter(k => !!_agentOnb.enabledAgents[k]);
    reportOnboardingEvent('agents_enabled', { selected });
    _agentOnb.step = 4;
    _agentOnbRender();
    return;
  }
};

_g._agentOnbBack = function() {
  if (_agentOnb.step > 1) {
    _agentOnb.step -= 1;
    _agentOnbRender();
  }
};

_g._agentOnbSkipBilling = function() {
  if (_agentOnb.packageId !== 'solo') return; // guard
  reportOnboardingEvent('stripe_skipped');
  _agentOnb.step = 3;
  _agentOnbRender();
  if (!_agentOnb.agents.length && !_agentOnb.agentsLoading) {
    _agentOnbFetchCatalog().then(() => _agentOnbRender());
  }
};

_g._agentOnbStartCheckout = async function() {
  if (!_agentOnb.agents.length) {
    await _agentOnbFetchCatalog();
  }
  // Surface the agent SKU we're about to send the user to Stripe for. Picked
  // with the same selection logic as `_agentOnbStartCheckout` so the funnel
  // row matches the actual checkout target — see that function for rationale.
  let _agentId = null;
  try {
    const _candidates = (_agentOnb.agents || [])
      .filter(a => Number.isFinite(a.monthly_price_gbp) && a.monthly_price_gbp > 0)
      .sort((a, b) => (a.monthly_price_gbp || 0) - (b.monthly_price_gbp || 0));
    const _target = _candidates[0] || (_agentOnb.agents || [])[0];
    if (_target) _agentId = _target.id || null;
  } catch {}
  reportOnboardingEvent('stripe_initiated', { agent_id: _agentId });
  await _agentOnbStartCheckout();
};

_g._agentOnbToggleAgent = function(agentId, checked) {
  _agentOnb.enabledAgents = { ..._agentOnb.enabledAgents, [agentId]: !!checked };
  try { localStorage.setItem(AGENT_ONB_STORAGE_KEY, JSON.stringify(_agentOnb.enabledAgents)); } catch {}
};

_g._agentOnbSetInvites = function(value) {
  _agentOnb.invitesText = value || '';
};

_g._agentOnbSendInvitesUI = async function() {
  await _agentOnbSendInvites();
  _agentOnbRender();
};

_g._agentOnbDone = function() {
  try { localStorage.setItem(AGENT_ONB_DONE_KEY, '1'); } catch {}
  try { localStorage.setItem(AGENT_ONB_STORAGE_KEY, JSON.stringify(_agentOnb.enabledAgents)); } catch {}
  // Telemetry — fire team_invited (with the count we shipped) followed by
  // the terminal `completed` event. Both are best-effort.
  let _inviteCount = 0;
  try {
    const _raw = (_agentOnb.invitesText || '').trim();
    _inviteCount = _raw ? _raw.split(/[\s,;]+/).filter(e => /.+@.+\..+/.test(e)).length : 0;
  } catch {}
  reportOnboardingEvent('team_invited', { count: _inviteCount });
  reportOnboardingEvent('completed');
  // Redirect to agents marketplace.
  if (typeof _g._nav === 'function') {
    _g._nav('agents');
  } else if (_g.location && typeof _g.location.assign === 'function') {
    _g.location.assign(`${_g.location.pathname}?page=agents`);
  }
};

_g._agentOnbSkipWizard = function(e) {
  e?.preventDefault?.();
  try { localStorage.setItem(AGENT_ONB_SKIPPED_KEY, '1'); } catch {}
  reportOnboardingEvent('skipped');
  if (typeof _g._nav === 'function') {
    _g._nav('agents');
  } else if (_g.location && typeof _g.location.assign === 'function') {
    _g.location.assign(`${_g.location.pathname}?page=agents`);
  }
};

// ── Entry point ──────────────────────────────────────────────────────────────
export async function pgAgentOnboarding(setTopbar) {
  if (typeof setTopbar === 'function') setTopbar('Welcome to DeepSynaps', '');
  // Reset state for a fresh entry.
  _agentOnb = {
    step: 1,
    packageId: '',
    agents: [],
    agentsLoading: false,
    agentsError: null,
    enabledAgents: {},
    invitesText: '',
    inviteResult: null,
  };
  // Start the catalog fetch in the background — by the time the user reaches
  // step 3 it should be ready.
  _agentOnbFetchCatalog().then(() => {
    if (_agentOnb.step === 3) _agentOnbRender();
  });
  // Telemetry — funnel entry point. Best-effort, never blocks render.
  reportOnboardingEvent('started');
  _agentOnbRender();
}

// ── Test seam ────────────────────────────────────────────────────────────────
// Internal exports used by the unit-test suite. Not part of the public API.
export const __agentOnboardingTestApi__ = {
  reset() {
    _agentOnb = {
      step: 1,
      packageId: '',
      agents: [],
      agentsLoading: false,
      agentsError: null,
      enabledAgents: {},
      invitesText: '',
      inviteResult: null,
    };
  },
  getState() {
    return {
      step: _agentOnb.step,
      packageId: _agentOnb.packageId,
      enabledAgents: { ..._agentOnb.enabledAgents },
      agents: _agentOnb.agents.slice(),
      inviteResult: _agentOnb.inviteResult ? { ..._agentOnb.inviteResult } : null,
      invitesText: _agentOnb.invitesText,
    };
  },
  setState(patch) {
    _agentOnb = { ..._agentOnb, ...patch };
  },
  render(host) {
    _agentOnbRender(host);
  },
  renderStep(step) {
    _agentOnb.step = step;
    if (step === 1) return _agentOnbStep1();
    if (step === 2) return _agentOnbStep2();
    if (step === 3) return _agentOnbStep3();
    return _agentOnbStep4();
  },
  fetchCatalog: _agentOnbFetchCatalog,
  sendInvites: _agentOnbSendInvites,
  STORAGE_KEYS: {
    enabled: AGENT_ONB_STORAGE_KEY,
    skipped: AGENT_ONB_SKIPPED_KEY,
    done: AGENT_ONB_DONE_KEY,
    invites: AGENT_ONB_INVITES_KEY,
  },
};
