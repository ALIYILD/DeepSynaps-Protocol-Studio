// Phase 13 — Admin browser for the `stripe_webhook_event` table.
//
// Pairs with the single-event replay UI shipped in Phase 11 (Ops tab inside
// the Agents hub). This page is the queryable list operators reach for when
// they need to *find* the event id to replay — filtering by recency window
// and event_type, with a per-row "Replay" action that POSTs to
// `/api/v1/agent-billing/admin/webhook-replay` and re-fetches on success.
//
// Mirrors the test-friendly module shape used by `pages-billing.js`:
// an exported `pgWebhooks(setTopbar)` plus a `__webhooksPageTestApi__` seam
// for node:test coverage without a real DOM.

const _whState = {
  loading: false,
  // Filters
  sinceDays: 7,
  eventTypeInput: '',
  appliedEventType: '',
  // Pagination — doubles on each "Load more"
  limit: 50,
  // Latest fetch result
  rows: [],
  fetchError: null,        // string | null
  // Replay UX
  replayBusy: null,        // event_id of the row currently being replayed
  toast: null,             // { kind: 'ok' | 'err', message }
  // Per-row inline error after a failed replay
  rowError: null,          // { event_id, message } | null
};

function _whEsc(v) {
  if (v == null) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function _whIsSuperAdmin() {
  try {
    const u = JSON.parse(
      (typeof localStorage !== 'undefined' && localStorage.getItem('ds_user')) || '{}'
    );
    return u && u.role === 'admin' && (u.clinic_id == null);
  } catch {
    return false;
  }
}

function _whGetToken() {
  try {
    return (typeof localStorage !== 'undefined') ? localStorage.getItem('ds_token') : null;
  } catch {
    return null;
  }
}

function _whAuthHeaders(extra) {
  const h = Object.assign({ 'Content-Type': 'application/json' }, extra || {});
  const t = _whGetToken();
  if (t) h['Authorization'] = 'Bearer ' + t;
  return h;
}

// Format an ISO timestamp as a short relative string ("5m ago", "2d ago").
// Falls back to the raw string on parse failure.
function _whRelative(iso) {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return String(iso);
  const deltaSec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (deltaSec < 60) return `${deltaSec}s ago`;
  const m = Math.floor(deltaSec / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function _whRenderToast() {
  if (!_whState.toast) return '';
  const isOk = _whState.toast.kind === 'ok';
  const bg = isOk ? 'rgba(16,185,129,0.10)' : 'rgba(239,68,68,0.10)';
  const border = isOk ? 'var(--green,#10b981)' : 'var(--red,#ef4444)';
  const color = isOk ? 'var(--green,#10b981)' : 'var(--red,#ef4444)';
  return `
    <div data-test="webhooks-toast"
      data-kind="${isOk ? 'ok' : 'err'}"
      style="margin:0 0 14px;padding:10px 14px;border-radius:8px;
             background:${bg};border:1px solid ${border};color:${color};
             font-size:13px;line-height:1.55">
      ${_whEsc(_whState.toast.message)}
    </div>`;
}

function _whRenderFilters() {
  const pill = (val, label) => {
    const active = _whState.sinceDays === val;
    return `
      <button type="button"
        data-test="webhooks-since-${val}d"
        data-active="${active ? '1' : '0'}"
        onclick="window._webhooksSetSince(${val})"
        style="padding:6px 12px;border-radius:6px;font-size:12px;font-weight:600;
               border:1px solid ${active ? 'var(--accent,#3b82f6)' : 'var(--border,#e5e7eb)'};
               background:${active ? 'var(--accent,#3b82f6)' : 'transparent'};
               color:${active ? 'white' : 'var(--text-secondary,#6b7280)'};
               cursor:pointer">
        ${_whEsc(label)}
      </button>`;
  };
  const inputVal = _whEsc(_whState.eventTypeInput || '');
  return `
    <div data-test="webhooks-filters"
      style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;
             margin:0 0 16px;padding:12px 14px;border-radius:8px;
             border:1px solid var(--border,#e5e7eb);background:var(--surface,#fff)">
      <span style="font-size:12px;font-weight:600;color:var(--text-secondary,#6b7280);
                   text-transform:uppercase;letter-spacing:0.04em">Window</span>
      ${pill(1, '1d')}
      ${pill(7, '7d')}
      ${pill(30, '30d')}
      <span style="margin-left:12px;font-size:12px;font-weight:600;
                   color:var(--text-secondary,#6b7280);text-transform:uppercase;letter-spacing:0.04em">Type</span>
      <input type="text"
        id="webhooks-event-type-input"
        data-test="webhooks-event-type-input"
        placeholder="checkout.session.completed"
        value="${inputVal}"
        oninput="window._webhooksSetEventTypeInput(this.value)"
        style="flex:1;min-width:220px;padding:6px 10px;border-radius:6px;
               border:1px solid var(--border,#e5e7eb);font-size:13px;
               font-family:ui-monospace,SFMono-Regular,Menlo,monospace" />
      <button type="button"
        data-test="webhooks-apply-btn"
        onclick="window._webhooksApply()"
        ${_whState.loading ? 'disabled' : ''}
        style="padding:7px 16px;border-radius:6px;border:0;
               background:var(--accent,#3b82f6);color:white;
               font-size:13px;font-weight:600;cursor:pointer">
        ${_whState.loading ? 'Loading…' : 'Apply'}
      </button>
    </div>`;
}

function _whRenderTable() {
  if (_whState.fetchError) {
    return `
      <div data-test="webhooks-fetch-error"
        style="padding:14px;border-radius:8px;border:1px solid var(--red,#ef4444);
               background:rgba(239,68,68,0.08);color:var(--red,#ef4444);
               font-size:13px">
        ${_whEsc(_whState.fetchError)}
      </div>`;
  }

  if (!_whState.loading && _whState.rows.length === 0) {
    return `
      <div data-test="webhooks-empty"
        style="padding:24px;text-align:center;border-radius:8px;
               border:1px dashed var(--border,#e5e7eb);
               color:var(--text-secondary,#6b7280);font-size:13px">
        No Stripe webhook events in this window.
      </div>`;
  }

  const rowsHtml = _whState.rows.map((r) => {
    const isBusy = _whState.replayBusy === r.event_id;
    const inlineErr = (_whState.rowError && _whState.rowError.event_id === r.event_id)
      ? `<div data-test="webhooks-row-error" style="margin-top:4px;color:var(--red,#ef4444);font-size:11px">${_whEsc(_whState.rowError.message)}</div>`
      : '';
    const procIcon = r.processed
      ? '<span style="color:var(--green,#10b981);font-weight:700">✓</span>'
      : '<span style="color:var(--red,#ef4444);font-weight:700">✗</span>';
    return `
      <tr data-test="webhooks-row" data-event-id="${_whEsc(r.event_id)}">
        <td style="padding:8px 10px;border-bottom:1px solid var(--border,#e5e7eb);font-size:12px;color:var(--text-secondary,#6b7280)">${_whEsc(r.id)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid var(--border,#e5e7eb);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px">${_whEsc(r.event_id)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid var(--border,#e5e7eb);font-size:13px">${_whEsc(r.event_type)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid var(--border,#e5e7eb);font-size:12px;color:var(--text-secondary,#6b7280)" title="${_whEsc(r.received_at || '')}">${_whEsc(_whRelative(r.received_at))}</td>
        <td style="padding:8px 10px;border-bottom:1px solid var(--border,#e5e7eb);text-align:center">${procIcon}</td>
        <td style="padding:8px 10px;border-bottom:1px solid var(--border,#e5e7eb)">
          <button type="button"
            data-test="webhooks-replay-btn"
            data-event-id="${_whEsc(r.event_id)}"
            onclick="window._webhooksReplay('${_whEsc(r.event_id)}')"
            ${isBusy ? 'disabled' : ''}
            style="padding:5px 12px;border-radius:5px;border:1px solid var(--accent,#3b82f6);
                   background:transparent;color:var(--accent,#3b82f6);
                   font-size:12px;font-weight:600;cursor:pointer">
            ${isBusy ? 'Replaying…' : 'Replay'}
          </button>
          ${inlineErr}
        </td>
      </tr>`;
  }).join('');

  const loadMoreHtml = (_whState.rows.length >= _whState.limit)
    ? `
      <div style="margin-top:14px;text-align:center">
        <button type="button"
          data-test="webhooks-load-more-btn"
          onclick="window._webhooksLoadMore()"
          ${_whState.loading ? 'disabled' : ''}
          style="padding:7px 18px;border-radius:6px;border:1px solid var(--border,#e5e7eb);
                 background:var(--surface,#fff);color:var(--text-primary,#111);
                 font-size:13px;font-weight:600;cursor:pointer">
          ${_whState.loading ? 'Loading…' : 'Load more'}
        </button>
      </div>`
    : '';

  return `
    <div data-test="webhooks-table-wrap"
      style="border-radius:8px;border:1px solid var(--border,#e5e7eb);
             overflow:hidden;background:var(--surface,#fff)">
      <table data-test="webhooks-table" style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:var(--surface-alt,#f9fafb)">
            <th style="text-align:left;padding:10px;font-size:11px;font-weight:600;color:var(--text-secondary,#6b7280);text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid var(--border,#e5e7eb)">id</th>
            <th style="text-align:left;padding:10px;font-size:11px;font-weight:600;color:var(--text-secondary,#6b7280);text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid var(--border,#e5e7eb)">event_id</th>
            <th style="text-align:left;padding:10px;font-size:11px;font-weight:600;color:var(--text-secondary,#6b7280);text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid var(--border,#e5e7eb)">type</th>
            <th style="text-align:left;padding:10px;font-size:11px;font-weight:600;color:var(--text-secondary,#6b7280);text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid var(--border,#e5e7eb)">received_at</th>
            <th style="text-align:center;padding:10px;font-size:11px;font-weight:600;color:var(--text-secondary,#6b7280);text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid var(--border,#e5e7eb)">processed</th>
            <th style="text-align:left;padding:10px;font-size:11px;font-weight:600;color:var(--text-secondary,#6b7280);text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid var(--border,#e5e7eb)">actions</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
    ${loadMoreHtml}`;
}

function _whRender() {
  if (!_whIsSuperAdmin()) {
    return `
      <div data-test="webhooks-page" style="max-width:680px;margin:0 auto;padding:40px 24px">
        <div data-test="webhooks-forbidden"
          style="padding:18px;border-radius:8px;border:1px solid var(--amber,#f59e0b);
                 background:rgba(245,158,11,0.08);color:var(--amber,#f59e0b);font-size:14px">
          Super-admin access required.
        </div>
      </div>`;
  }

  return `
    <div data-test="webhooks-page" style="max-width:1080px;margin:0 auto;padding:32px 24px">
      <h1 data-test="webhooks-heading"
        style="font-size:22px;font-weight:800;color:var(--text-primary,#111);margin:0 0 6px">
        Stripe webhook events
      </h1>
      <p data-test="webhooks-subtext"
        style="font-size:13px;color:var(--text-secondary,#6b7280);line-height:1.55;margin:0 0 18px">
        Browse the dedupe table. Pick a row to re-run its handler against current DB state.
      </p>
      ${_whRenderToast()}
      ${_whRenderFilters()}
      ${_whRenderTable()}
    </div>`;
}

function _whMount() {
  if (typeof document === 'undefined') return _whRender();
  const host = document.getElementById('content');
  const html = _whRender();
  if (host) host.innerHTML = html;
  return html;
}

function _whBuildListUrl() {
  const params = new URLSearchParams();
  params.set('limit', String(_whState.limit));
  params.set('since_days', String(_whState.sinceDays));
  if (_whState.appliedEventType) {
    params.set('event_type', _whState.appliedEventType);
  }
  return `/api/v1/agent-billing/admin/webhook-events?${params.toString()}`;
}

async function _whFetch() {
  if (_whState.loading) return;
  _whState.loading = true;
  _whState.fetchError = null;
  _whMount();

  try {
    const resp = await fetch(_whBuildListUrl(), {
      method: 'GET',
      headers: _whAuthHeaders(),
    });
    if (!resp || !resp.ok) {
      let msg = `HTTP ${resp ? resp.status : '???'}`;
      try {
        const body = await resp.json();
        if (body && body.message) msg = body.message;
      } catch {}
      _whState.fetchError = msg;
      _whState.rows = [];
    } else {
      let body = null;
      try { body = await resp.json(); } catch {}
      _whState.rows = (body && Array.isArray(body.rows)) ? body.rows : [];
    }
  } catch (err) {
    _whState.fetchError = `Network error: ${err && err.message ? err.message : 'request failed'}`;
    _whState.rows = [];
  } finally {
    _whState.loading = false;
    _whMount();
  }
}

async function _whReplay(eventId) {
  if (!eventId || _whState.replayBusy) return;
  const confirmFn = (typeof window !== 'undefined' && typeof window.confirm === 'function') ? window.confirm : null;
  if (confirmFn) {
    const ok = confirmFn(`Replay event ${eventId}? This re-runs the handler against current DB state.`);
    if (!ok) return;
  }

  _whState.replayBusy = eventId;
  _whState.rowError = null;
  _whMount();

  let resp;
  try {
    resp = await fetch('/api/v1/agent-billing/admin/webhook-replay', {
      method: 'POST',
      headers: _whAuthHeaders(),
      body: JSON.stringify({ event_id: eventId }),
    });
  } catch (err) {
    _whState.replayBusy = null;
    _whState.rowError = {
      event_id: eventId,
      message: `Network error: ${err && err.message ? err.message : 'request failed'}`,
    };
    _whMount();
    return;
  }

  let body = null;
  try { body = await resp.json(); } catch {}

  if (resp && resp.ok && body && body.ok !== false) {
    _whState.replayBusy = null;
    _whState.toast = { kind: 'ok', message: `Replayed ${eventId} successfully.` };
    // Re-fetch the list so processed flags / fresh rows show up.
    await _whFetch();
    return;
  }

  _whState.replayBusy = null;
  const msg = (body && (body.message || body.error)) || `HTTP ${resp ? resp.status : '???'}`;
  _whState.rowError = { event_id: eventId, message: String(msg) };
  _whMount();
}

if (typeof window !== 'undefined') {
  window._webhooksSetSince = function(n) {
    const v = Number(n);
    if (![1, 7, 30].includes(v)) return;
    _whState.sinceDays = v;
    _whMount();
  };
  window._webhooksSetEventTypeInput = function(val) {
    _whState.eventTypeInput = String(val == null ? '' : val);
    // No re-render — we don't want to lose focus on the input.
  };
  window._webhooksApply = function() {
    _whState.appliedEventType = String(_whState.eventTypeInput || '').trim();
    _whState.toast = null;
    _whFetch();
  };
  window._webhooksLoadMore = function() {
    _whState.limit = _whState.limit * 2;
    _whFetch();
  };
  window._webhooksReplay = function(eventId) {
    _whReplay(String(eventId || ''));
  };
}

export async function pgWebhooks(setTopbar) {
  if (typeof setTopbar === 'function') {
    try { setTopbar('Stripe webhook events', ''); } catch {}
  }
  // Reset transient state so re-navigation starts from a clean slate.
  _whState.loading = false;
  _whState.sinceDays = 7;
  _whState.eventTypeInput = '';
  _whState.appliedEventType = '';
  _whState.limit = 50;
  _whState.rows = [];
  _whState.fetchError = null;
  _whState.replayBusy = null;
  _whState.toast = null;
  _whState.rowError = null;

  const html = _whMount();
  if (_whIsSuperAdmin()) {
    // Initial fetch — fire-and-forget; render updates in-place.
    _whFetch();
  }
  return html;
}

// ── Test seam — node:test friendly. Mirrors `__billingPageTestApi__`. ───────
export const __webhooksPageTestApi__ = {
  reset() {
    _whState.loading = false;
    _whState.sinceDays = 7;
    _whState.eventTypeInput = '';
    _whState.appliedEventType = '';
    _whState.limit = 50;
    _whState.rows = [];
    _whState.fetchError = null;
    _whState.replayBusy = null;
    _whState.toast = null;
    _whState.rowError = null;
  },
  getState() { return { ..._whState, rows: _whState.rows.slice() }; },
  setState(patch) { Object.assign(_whState, patch); },
  setRows(rows) { _whState.rows = rows.slice(); },
  buildListUrl: _whBuildListUrl,
  isSuperAdmin: _whIsSuperAdmin,
  render: _whRender,
  mount: _whMount,
  fetchList: _whFetch,
  replay: _whReplay,
  apply() { return globalThis.window._webhooksApply(); },
  setSince(n) { return globalThis.window._webhooksSetSince(n); },
  setEventTypeInput(val) { return globalThis.window._webhooksSetEventTypeInput(val); },
  loadMore() { return globalThis.window._webhooksLoadMore(); },
  renderPage: pgWebhooks,
};
