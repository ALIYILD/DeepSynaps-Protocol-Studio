// Clinical Agent Brain — status banner.
//
// Renders a small honest pill/banner into a host element with id
// `agent-brain-status` (or whatever selector the caller passes). Reports:
//   - "n / total providers configured"
//   - "evidence: ok | unavailable | not_configured"
//   - decision-support disclaimer
//
// Pages can call `mountAgentBrainStatus()` from their existing init code; the
// component is additive — it does not rewrite any flows. If the host element
// is missing (e.g. the page hasn't been migrated), the function returns null.

import { api } from './api.js';

const STYLE_ID = 'ds-agent-brain-status-styles';
const STYLE = `
  .ds-ab-banner { display:flex; flex-wrap:wrap; align-items:center; gap:10px;
    background:#f8fafc; border:1px solid #e2e8f0; border-left:4px solid #0f766e;
    border-radius:6px; padding:8px 12px; margin:8px 0 12px 0;
    font: 12px/1.4 system-ui, -apple-system, sans-serif; color:#0f172a; }
  .ds-ab-banner.warn { border-left-color:#b45309; background:#fffbeb; }
  .ds-ab-banner.err { border-left-color:#b91c1c; background:#fef2f2; }
  .ds-ab-pill { display:inline-flex; align-items:center; gap:4px; padding:2px 8px;
    border-radius:999px; background:#0f766e; color:#fff; font-weight:600;
    text-transform:uppercase; letter-spacing:.04em; font-size:10px; }
  .ds-ab-pill.warn { background:#b45309; }
  .ds-ab-pill.err { background:#b91c1c; }
  .ds-ab-meta { color:#475569; }
  .ds-ab-disc { color:#334155; }
  .ds-ab-providers { display:flex; gap:6px; flex-wrap:wrap; }
  .ds-ab-prov { font-size:11px; padding:1px 6px; border-radius:4px; background:#e2e8f0;
    color:#0f172a; }
  .ds-ab-prov.bad { background:#fee2e2; color:#7f1d1d; }
`;

function ensureStyle() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = STYLE;
  document.head.appendChild(el);
}

function renderBanner(host, payload) {
  const total = payload?.providers_total ?? 0;
  const configured = payload?.providers_configured ?? 0;
  const providers = Array.isArray(payload?.providers) ? payload.providers : [];
  const ok = configured >= 4 && total > 0;
  const tone = ok ? '' : configured > 0 ? 'warn' : 'err';
  const provChips = providers
    .map((p) => {
      const status = p?.status || 'unknown';
      const cls = status === 'ok' ? 'ds-ab-prov' : 'ds-ab-prov bad';
      return `<span class="${cls}" title="${status}">${p?.name || '?'}</span>`;
    })
    .join('');

  host.innerHTML = `
    <div class="ds-ab-banner ${tone}" role="status" aria-live="polite">
      <span class="ds-ab-pill ${tone}">Clinical Agent Brain</span>
      <span class="ds-ab-meta">${configured} / ${total} providers configured</span>
      <span class="ds-ab-disc">Decision-support only · clinician review required.</span>
      <span class="ds-ab-providers">${provChips}</span>
    </div>
  `;
}

function renderError(host, error) {
  host.innerHTML = `
    <div class="ds-ab-banner err" role="status" aria-live="polite">
      <span class="ds-ab-pill err">Clinical Agent Brain</span>
      <span class="ds-ab-meta">Status unavailable: ${String(error?.message || error || 'unknown error').slice(0, 200)}</span>
      <span class="ds-ab-disc">Decision-support only · clinician review required.</span>
    </div>
  `;
}

/**
 * Ensure a `#agent-brain-status` host element exists at the top of `parent`,
 * creating one if missing, then mount the banner. Idempotent — safe to call
 * after every re-render. Use this from AI page modules so they don't have to
 * thread the host div into their existing HTML template.
 *
 * @param {HTMLElement} parent - the element whose innerHTML was just set
 *   (typically the page's `#content` host).
 * @returns {Promise<{host: HTMLElement, payload: object}|null>}
 */
export async function ensureAgentBrainStatus(parent) {
  if (typeof document === 'undefined' || !parent) return null;
  let host = parent.querySelector?.('#agent-brain-status');
  if (!host) {
    host = document.createElement('div');
    host.id = 'agent-brain-status';
    parent.insertBefore(host, parent.firstChild);
  }
  return mountAgentBrainStatus(host);
}

/**
 * Mount the agent-brain status banner into a host element.
 * @param {string|HTMLElement} target - selector or element. Default: `#agent-brain-status`.
 * @returns {Promise<{host: HTMLElement, payload: object}|null>}
 */
export async function mountAgentBrainStatus(target = '#agent-brain-status') {
  if (typeof document === 'undefined') return null;
  const host =
    typeof target === 'string' ? document.querySelector(target) : target;
  if (!host) return null;
  ensureStyle();
  try {
    const payload = await api.getAgentBrainStatus();
    renderBanner(host, payload);
    return { host, payload };
  } catch (err) {
    renderError(host, err);
    return { host, payload: null, error: err };
  }
}
