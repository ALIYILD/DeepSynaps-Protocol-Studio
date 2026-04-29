// Phase 12 — Billing & subscriptions surface.
//
// Single-action page: a "Manage billing in Stripe" button that hits
// POST /api/v1/agent-billing/portal and redirects the user to the Stripe
// Customer Portal URL it returns. The portal is Stripe's hosted self-serve
// surface for cancellations, payment-method updates, and invoice history,
// so we deliberately keep this page minimal — anything richer would just
// duplicate what Stripe already renders.
//
// Mirrors the test-friendly module shape used by `pages-marketplace.js`:
// an exported `pgBilling(setTopbar)` plus a `__billingPageTestApi__` seam
// for node:test coverage without a real DOM.

const _bpState = {
  loading: false,
  error: null,        // { kind: 'no_subscription' | 'generic', message?: string }
};

function _bpEsc(v) {
  if (v == null) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function _bpRender() {
  // Inline error block — re-rendered after each click attempt.
  let errHtml = '';
  if (_bpState.error?.kind === 'no_subscription') {
    errHtml = `
      <div data-test="billing-error-no-subscription"
        style="margin-top:16px;padding:12px 14px;border-radius:8px;
               border:1px solid var(--amber,#f59e0b);
               background:rgba(245,158,11,0.08);
               color:var(--amber,#f59e0b);font-size:13px;line-height:1.55">
        Start a subscription first — visit the
        <a href="?page=marketplace-landing"
           data-test="billing-link-marketplace"
           style="color:inherit;text-decoration:underline">Agent marketplace</a>
        to choose a plan.
      </div>`;
  } else if (_bpState.error?.kind === 'generic') {
    errHtml = `
      <div data-test="billing-error-generic"
        style="margin-top:16px;padding:12px 14px;border-radius:8px;
               border:1px solid var(--red,#ef4444);
               background:rgba(239,68,68,0.08);
               color:var(--red,#ef4444);font-size:13px;line-height:1.55">
        ${_bpEsc(_bpState.error.message || 'Could not open the Stripe customer portal. Please try again.')}
      </div>`;
  }

  const btnDisabled = _bpState.loading ? 'disabled' : '';
  const btnLabel = _bpState.loading
    ? 'Opening Stripe…'
    : 'Open Stripe customer portal →';

  return `
    <div data-test="billing-page" style="max-width:680px;margin:0 auto;padding:40px 24px">
      <h1 data-test="billing-heading"
        style="font-size:24px;font-weight:800;color:var(--text-primary);margin:0 0 8px">
        Billing &amp; subscriptions
      </h1>
      <p data-test="billing-subtext"
        style="font-size:14px;color:var(--text-secondary);line-height:1.65;margin:0 0 24px">
        Manage payment methods, invoices, and cancellations through Stripe.
      </p>
      <button data-test="billing-portal-btn"
        class="btn btn-primary"
        style="padding:12px 24px;font-size:14px;font-weight:600"
        ${btnDisabled}
        onclick="window._billingOpenPortal()">${btnLabel}</button>
      ${errHtml}
    </div>`;
}

function _bpMount() {
  if (typeof document === 'undefined') return '';
  const host = document.getElementById('content');
  const html = _bpRender();
  if (host) host.innerHTML = html;
  return html;
}

async function _bpOpenPortal() {
  if (_bpState.loading) return;
  _bpState.loading = true;
  _bpState.error = null;
  _bpMount();

  // Build the request. We explicitly prefer the live URL so Stripe sends the
  // user back to whichever page they launched the portal from.
  const returnUrl =
    (typeof window !== 'undefined' && window.location && window.location.href) ||
    '';

  // Bearer token — prefer the same `ds_token` key the rest of the SPA uses;
  // fall back to no-auth so anonymous renders still surface a friendly 403/404
  // rather than blowing up before we even hit the network.
  let token = null;
  try { token = (typeof localStorage !== 'undefined') ? localStorage.getItem('ds_token') : null; } catch {}
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let resp;
  try {
    resp = await fetch('/api/v1/agent-billing/portal', {
      method: 'POST',
      headers,
      body: JSON.stringify({ return_url: returnUrl }),
    });
  } catch (err) {
    _bpState.loading = false;
    _bpState.error = {
      kind: 'generic',
      message: `Network error: ${err && err.message ? err.message : 'request failed'}`,
    };
    _bpMount();
    return;
  }

  if (resp && resp.status === 404) {
    _bpState.loading = false;
    _bpState.error = { kind: 'no_subscription' };
    _bpMount();
    return;
  }

  if (!resp || !resp.ok) {
    let msg = `HTTP ${resp ? resp.status : '???'}`;
    try {
      const body = await resp.json();
      if (body && body.message) msg = body.message;
    } catch {}
    _bpState.loading = false;
    _bpState.error = { kind: 'generic', message: msg };
    _bpMount();
    return;
  }

  let body = null;
  try { body = await resp.json(); } catch {}
  const url = body && body.url;
  if (!url) {
    _bpState.loading = false;
    _bpState.error = {
      kind: 'generic',
      message: 'Stripe response missing portal URL.',
    };
    _bpMount();
    return;
  }

  // Success — redirect. We keep `loading=true` so the button stays disabled
  // during the navigation transition.
  if (typeof window !== 'undefined' && window.location && typeof window.location.assign === 'function') {
    window.location.assign(url);
  }
}

if (typeof window !== 'undefined') {
  window._billingOpenPortal = _bpOpenPortal;
}

export async function pgBilling(setTopbar) {
  if (typeof setTopbar === 'function') {
    try { setTopbar('Billing & subscriptions', ''); } catch {}
  }
  // Reset transient state so re-navigation starts from a clean slate.
  _bpState.loading = false;
  _bpState.error = null;
  return _bpMount();
}

// ── Test seam — node:test friendly. Mirrors the pattern used by other
// pages-* modules (e.g. `__marketplaceLandingTestApi__`). ────────────────
export const __billingPageTestApi__ = {
  reset() {
    _bpState.loading = false;
    _bpState.error = null;
  },
  getState() { return { ..._bpState, error: _bpState.error ? { ..._bpState.error } : null }; },
  setState(patch) { Object.assign(_bpState, patch); },
  render: _bpRender,
  mount: _bpMount,
  openPortal: _bpOpenPortal,
  renderPage: pgBilling,
};
