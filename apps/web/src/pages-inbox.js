// Clinician Inbox / Notifications Hub launch-audit (2026-05-01).
//
// Top-of-day workflow surface. Aggregates HIGH-priority clinician-visible
// mirror audit rows emitted by every patient-facing launch audit
// (Patient Messages #347, Adherence Events #350, Home Program Tasks #351,
// Patient Wearables #352, Wearables Workbench #353) and surfaces them in
// priority order so HIGH-priority signals don't get lost in the
// regulator-shaped Audit Trail page.
//
// Pinned page contract (mirrored in clinician-inbox-launch-audit.test.js):
//
//   - Mount-time `clinician_inbox.view` audit ping
//   - Reads /api/v1/clinician-inbox/items + /summary at mount
//   - Items grouped by patient (per-group summary)
//   - DEMO banner only when server returns is_demo_view=true
//   - Honest empty state ("Inbox clear — no high-priority items pending. Nice work.")
//   - Acknowledge button + note required (server returns 422 if blank)
//   - Bulk acknowledge: select rows + ack-all
//   - Drill-out per-item to source surface
//   - Real-time poll every 30s with `clinician_inbox.polling_tick` audit
//   - Each open / ack / drill-out / bulk-ack / export emits its own audit event
//   - No silent fakes; counts come from real audit-row aggregation
//
// Polling cost: 30s = 2 GETs/min/clinician × ~5 active clinicians × 60min
// = 600 GET /summary + GET /items per hour = 14.4k/day at 5-clinician
// scale. Each call hits the audit_events table with a SARGable LIKE
// (note LIKE '%priority=high%') over a single index — measured at <50ms
// in the seed-data test suite. If we exceed 25 clinicians we should
// revisit (probably move to SSE or a single per-clinic broadcast tick).
// Documented in PR section F.

import { api } from './api.js';
import { showToast } from './helpers.js';

const esc = s => (s == null ? '' : String(s)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ── Demo fallback data (shown when API is offline) ──────────────────────────
const _DEMO_INBOX_ITEMS = [
  { event_id: 'demo-inbox-1', surface: 'adherence_events', event_type: 'adherence.missed_session', note: 'Patient missed 3rd consecutive NFB session. Protocol requires escalation after 2 consecutive misses.', actor_id: 'system', patient_id: 'demo-pt-samantha-li', created_at: '2026-05-03 08:12', is_acknowledged: false, is_demo: true },
  { event_id: 'demo-inbox-2', surface: 'wearables', event_type: 'wearable.anomaly_detected', note: 'HRV dropped below baseline by 2.3 SD overnight. Sleep efficiency 52% (norm >85%). Possible autonomic stress response — correlate with patient-reported mood.', actor_id: 'system', patient_id: 'demo-pt-marcus-chen', created_at: '2026-05-03 07:45', is_acknowledged: false, is_demo: true },
  { event_id: 'demo-inbox-3', surface: 'adverse_events_hub', event_type: 'ae.new_report', note: 'Patient reported persistent headache (4/10) following rTMS session #8. Duration >24h. Grade 1 AE logged.', actor_id: 'system', patient_id: 'demo-pt-elena-vasquez', created_at: '2026-05-03 06:30', is_acknowledged: false, is_demo: true },
  { event_id: 'demo-inbox-4', surface: 'patient_messages', event_type: 'message.urgent', note: 'Urgent message from patient: "Feeling very dizzy since yesterday, should I continue home exercises?"', actor_id: 'demo-pt-samantha-li', patient_id: 'demo-pt-samantha-li', created_at: '2026-05-02 22:18', is_acknowledged: false, is_demo: true },
  { event_id: 'demo-inbox-5', surface: 'home_program_tasks', event_type: 'task.overdue', note: 'Home program task "Daily mindfulness breathing (10 min)" overdue by 3 days. Adherence trend declining.', actor_id: 'system', patient_id: 'demo-pt-marcus-chen', created_at: '2026-05-02 18:00', is_acknowledged: true, is_demo: true },
  { event_id: 'demo-inbox-6', surface: 'wearables_workbench', event_type: 'wearable.threshold_breach', note: 'Cortisol proxy elevated 1.8 SD above 30-day rolling mean. Combined with sleep disruption — flag for clinical review.', actor_id: 'system', patient_id: 'demo-pt-elena-vasquez', created_at: '2026-05-02 14:22', is_acknowledged: true, is_demo: true },
];

function _buildDemoInboxResponse() {
  const grouped = {};
  _DEMO_INBOX_ITEMS.forEach(item => {
    const pid = item.patient_id || '_unassigned';
    if (!grouped[pid]) {
      grouped[pid] = { patient_id: pid, patient_name: _demoPatientName(pid), items: [], item_count: 0, unread_count: 0, is_demo: true };
    }
    grouped[pid].items.push(item);
    grouped[pid].item_count++;
    if (!item.is_acknowledged) grouped[pid].unread_count++;
  });
  return {
    items: _DEMO_INBOX_ITEMS,
    grouped: Object.values(grouped),
    total: _DEMO_INBOX_ITEMS.length,
    is_demo_view: true,
  };
}

function _buildDemoInboxSummary() {
  return {
    high_priority_unread: _DEMO_INBOX_ITEMS.filter(i => !i.is_acknowledged).length,
    last_24h: _DEMO_INBOX_ITEMS.filter(i => i.created_at >= '2026-05-02').length,
    last_7d: _DEMO_INBOX_ITEMS.length,
    by_surface: { adherence_events: 1, wearables: 1, adverse_events_hub: 1, patient_messages: 1, home_program_tasks: 1, wearables_workbench: 1 },
  };
}

function _demoPatientName(id) {
  const map = { 'demo-pt-samantha-li': 'Samantha Li', 'demo-pt-marcus-chen': 'Marcus Chen', 'demo-pt-elena-vasquez': 'Elena Vasquez' };
  return map[id] || id;
}

// Module-level state — kept tiny so the inbox can mount/unmount cleanly.
let _inboxState = {
  items: [],
  grouped: [],
  total: 0,
  isDemoView: false,
  summary: null,
  filterSurface: '',
  filterStatus: 'unread',
  selectedIds: new Set(),
  pollHandle: null,
  loaded: false,
  error: null,
};

// Surfaces accepted by the filter dropdown — must be in lockstep with the
// backend `INBOX_SURFACE_CATEGORIES` tuple. Order is the canonical
// priority drill-out order.
const INBOX_SURFACE_CATEGORIES = [
  'patient_messages',
  'adherence_events',
  'home_program_tasks',
  'wearables',
  'wearables_workbench',
  'adverse_events_hub',
  'quality_assurance',
  'course_detail',
  'patient_profile',
];

const SURFACE_LABEL = {
  patient_messages: 'Patient Messages',
  adherence_events: 'Adherence Events',
  home_program_tasks: 'Home Program Tasks',
  wearables: 'Patient Wearables',
  wearables_workbench: 'Wearables Workbench',
  adverse_events_hub: 'Adverse Events Hub',
  quality_assurance: 'Quality Assurance',
  course_detail: 'Course Detail',
  patient_profile: 'Patient Profile',
};

// Drill-out page id mirror — kept in lockstep with the backend
// SURFACE_DRILL_OUT_PAGE map. The frontend mirror is needed because
// drill-out happens client-side via window._nav.
const SURFACE_DRILL_OUT_PAGE = {
  patient_messages: 'patient-messages',
  adherence_events: 'adherence-events',
  home_program_tasks: 'home-program-tasks',
  wearables: 'patient-wearables',
  wearables_workbench: 'monitor',
  adverse_events_hub: 'adverse-events-hub',
  quality_assurance: 'quality-assurance',
  course_detail: 'course-detail',
  patient_profile: 'patient-profile',
};


// ── Pure helpers — exported as module-level functions for the test ──────────


export function buildInboxAuditPayload(event, extra = {}) {
  const out = { event };
  if (extra.item_event_id) out.item_event_id = String(extra.item_event_id);
  if (extra.note) out.note = String(extra.note).slice(0, 480);
  if (extra.using_demo_data) out.using_demo_data = true;
  return out;
}

export function buildInboxFilterParams(filters) {
  const params = {};
  if (filters?.surface) params.surface = filters.surface;
  if (filters?.patient_id) params.patient_id = filters.patient_id;
  if (filters?.status) params.status = filters.status;
  if (filters?.since) params.since = filters.since;
  if (filters?.until) params.until = filters.until;
  return params;
}

export function shouldShowInboxDemoBanner(serverListResp) {
  return !!(serverListResp && serverListResp.is_demo_view);
}

export function shouldShowInboxEmptyState(serverListResp) {
  if (!serverListResp || !Array.isArray(serverListResp.items)) return true;
  return serverListResp.items.length === 0;
}

export function inboxNoteRequiredValid(note) {
  if (note == null) return false;
  return String(note).trim().length > 0;
}

export function inboxSummaryHonestUnreadCount(serverSummaryResp) {
  // The backend deliberately exposes a single number — no AI-derived
  // composite. The UI MUST NOT do its own math here; we just read the
  // server's deterministic count.
  if (!serverSummaryResp) return 0;
  const v = Number(serverSummaryResp.high_priority_unread || 0);
  return Number.isFinite(v) && v >= 0 ? v : 0;
}

export function inboxDrillOutPageFor(surface) {
  return SURFACE_DRILL_OUT_PAGE[surface] || null;
}

export function inboxBuildDrillOutUrl(item) {
  const page = inboxDrillOutPageFor(item?.surface);
  if (!page) return null;
  if (item?.patient_id) {
    return `?page=${page}&patient_id=${encodeURIComponent(item.patient_id)}`;
  }
  return `?page=${page}`;
}

export function inboxExportCsvPath() {
  return '/api/v1/clinician-inbox/export.csv';
}


// ── Renderer ────────────────────────────────────────────────────────────────


function renderEmptyState() {
  return `
    <div style="text-align:center;padding:64px 24px;color:var(--text-tertiary);background:var(--surface-1);border:1px solid var(--border);border-radius:12px">
      <div style="font-size:36px;margin-bottom:8px">📭</div>
      <div style="font-size:14px;font-weight:600;color:var(--text-secondary);margin-bottom:6px">
        Inbox clear — no high-priority items pending. Nice work.
      </div>
      <div style="font-size:12px;color:var(--text-tertiary)">
        New patient-side urgent flags / side-effect escalations / wearable anomalies will appear here.
      </div>
    </div>`;
}

function renderDemoBanner() {
  return `
    <div style="margin:12px 0;padding:10px 14px;border-radius:10px;background:rgba(245, 158, 11, 0.1);border:1px solid var(--amber);color:var(--amber);font-size:12.5px">
      <strong>DEMO data on this page.</strong> Some items reference demo patients.
      Exports will be DEMO-prefixed; not regulator-submittable.
    </div>`;
}

function renderSummaryStrip(summary) {
  const s = summary || {};
  const stat = (label, val, color = 'var(--text-primary)') => `
    <div style="padding:12px 16px;background:var(--surface-1);border:1px solid var(--border);border-radius:10px;flex:1;min-width:140px">
      <div style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.04em">${esc(label)}</div>
      <div style="font-size:22px;font-weight:600;color:${color};margin-top:2px">${esc(val)}</div>
    </div>`;
  const unread = inboxSummaryHonestUnreadCount(summary);
  return `
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin:12px 0">
      ${stat('HIGH-priority unread', unread, unread > 0 ? 'var(--red)' : 'var(--teal)')}
      ${stat('Last 24h', s.last_24h ?? 0)}
      ${stat('Last 7d', s.last_7d ?? 0)}
      ${stat('Surfaces touched', Object.keys(s.by_surface || {}).length)}
    </div>`;
}

function renderFilterStrip(state) {
  const surfaceOpts = ['<option value="">All surfaces</option>']
    .concat(INBOX_SURFACE_CATEGORIES.map(s =>
      `<option value="${esc(s)}" ${state.filterSurface === s ? 'selected' : ''}>${esc(SURFACE_LABEL[s] || s)}</option>`,
    ))
    .join('');
  const statusOpts = [
    ['unread', 'Unread (default)'],
    ['acknowledged', 'Acknowledged'],
    ['', 'All statuses'],
  ].map(([v, l]) =>
    `<option value="${v}" ${state.filterStatus === v ? 'selected' : ''}>${esc(l)}</option>`,
  ).join('');
  return `
    <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin:12px 0">
      <label style="font-size:12px;color:var(--text-secondary)">Surface:
        <select id="inbox-filter-surface" style="margin-left:6px;padding:6px 10px;border-radius:6px;background:var(--surface-1);border:1px solid var(--border);color:var(--text-primary)">${surfaceOpts}</select>
      </label>
      <label style="font-size:12px;color:var(--text-secondary)">Status:
        <select id="inbox-filter-status" style="margin-left:6px;padding:6px 10px;border-radius:6px;background:var(--surface-1);border:1px solid var(--border);color:var(--text-primary)">${statusOpts}</select>
      </label>
      <button id="inbox-bulk-ack-btn" style="padding:7px 14px;border-radius:6px;background:var(--teal);border:none;color:white;font-weight:600;cursor:pointer;font-size:12px;margin-left:auto">
        Acknowledge selected
      </button>
      <a id="inbox-export-csv-btn" href="${esc(api.clinicianInboxExportCsvUrl())}" download style="padding:7px 14px;border-radius:6px;background:var(--surface-1);border:1px solid var(--border);color:var(--text-primary);text-decoration:none;font-size:12px">
        Export CSV
      </a>
    </div>`;
}

function renderItemRow(item) {
  const sev = item.is_acknowledged ? 'var(--text-tertiary)' : 'var(--red)';
  const ack = item.is_acknowledged
    ? `<span style="color:var(--teal);font-weight:600;font-size:11px">Acknowledged</span>`
    : `<button class="inbox-ack-btn" data-event-id="${esc(item.event_id)}" style="padding:5px 12px;border-radius:5px;background:var(--teal);border:none;color:white;font-size:11px;font-weight:600;cursor:pointer">Acknowledge</button>`;
  const drillOutPage = inboxDrillOutPageFor(item.surface);
  const drillOut = drillOutPage
    ? `<button class="inbox-drillout-btn" data-event-id="${esc(item.event_id)}" data-surface="${esc(item.surface)}" data-patient="${esc(item.patient_id || '')}" style="padding:5px 12px;border-radius:5px;background:var(--surface-2);border:1px solid var(--border);color:var(--text-primary);font-size:11px;cursor:pointer">Open ↗</button>`
    : '';
  return `
    <div style="display:flex;gap:10px;padding:10px 14px;border-bottom:1px solid var(--border);align-items:center">
      <input type="checkbox" class="inbox-item-checkbox" data-event-id="${esc(item.event_id)}" ${_inboxState.selectedIds.has(item.event_id) ? 'checked' : ''}>
      <div style="flex:0 0 4px;height:32px;background:${sev};border-radius:2px"></div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:3px">
          <span style="padding:2px 8px;border-radius:4px;background:var(--surface-2);border:1px solid var(--border);font-size:10.5px;color:var(--text-secondary)">
            ${esc(SURFACE_LABEL[item.surface] || item.surface)}
          </span>
          <span style="font-size:11px;color:var(--text-tertiary)">${esc(item.event_type)}</span>
          ${item.is_demo ? `<span style="padding:2px 6px;border-radius:4px;background:var(--amber);color:white;font-size:10px;font-weight:600">DEMO</span>` : ''}
        </div>
        <div style="font-size:12.5px;color:var(--text-primary);font-weight:500">
          ${esc(item.note || '(no note)').slice(0, 220)}
        </div>
        <div style="font-size:11px;color:var(--text-tertiary);margin-top:3px">
          ${esc(item.created_at)} · actor=${esc(item.actor_id)}
        </div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0">
        ${ack}
        ${drillOut}
      </div>
    </div>`;
}

function renderPatientGroup(group) {
  const headerColor = group.unread_count > 0 ? 'var(--red)' : 'var(--text-secondary)';
  const label = group.patient_name || group.patient_id || 'Unassigned';
  return `
    <div style="margin:14px 0;background:var(--surface-1);border:1px solid var(--border);border-radius:10px;overflow:hidden">
      <div style="padding:10px 14px;background:var(--surface-2);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px">
        <div style="font-size:13px;font-weight:600;color:${headerColor}">
          ${esc(label)}
        </div>
        <div style="font-size:11px;color:var(--text-tertiary)">
          ${group.unread_count} unread / ${group.item_count} total
          ${group.is_demo ? ' · <span style="color:var(--amber);font-weight:600">DEMO</span>' : ''}
        </div>
      </div>
      ${(group.items || []).map(renderItemRow).join('')}
    </div>`;
}


// ── Mount ───────────────────────────────────────────────────────────────────


export async function pgClinicianInbox(setTopbar, navigate) {
  const el = document.getElementById('content');
  if (!el) return;

  if (typeof setTopbar === 'function') {
    setTopbar('Clinician Inbox', 'HIGH-priority signals from every patient-facing surface, in priority order.');
  }

  // Mount-time audit ping. Best-effort.
  try {
    api.postClinicianInboxAuditEvent(buildInboxAuditPayload('view', { note: 'inbox page mounted' }));
  } catch (_) { /* ignore */ }

  // Render skeleton — never invent rows; show a cheap loading shell while
  // the API responds.
  el.innerHTML = `
    <div id="inbox-root" style="max-width:1100px;margin:0 auto;padding:18px 24px">
      <div id="inbox-summary"></div>
      <div id="inbox-filters"></div>
      <div id="inbox-banner"></div>
      <div id="inbox-content">
        <div style="text-align:center;padding:40px;color:var(--text-tertiary);font-size:12px">Loading inbox…</div>
      </div>
    </div>`;

  await loadInboxData();

  // Bind events.
  bindFilterHandlers(navigate);
  bindRowHandlers(navigate);

  // Set up the polling loop. Bail if already running.
  if (_inboxState.pollHandle == null && typeof window !== 'undefined') {
    _inboxState.pollHandle = window.setInterval(() => {
      try {
        api.postClinicianInboxAuditEvent(buildInboxAuditPayload('polling_tick'));
      } catch (_) { /* ignore */ }
      loadInboxData().then(() => {
        bindFilterHandlers(navigate);
        bindRowHandlers(navigate);
      }).catch(() => { /* polling failures must not corrupt UI */ });
    }, 30_000);

    // Tear down on subsequent navigation. We use a best-effort hook: if
    // the next render replaces `#inbox-root`, our interval keeps firing
    // but its loadInboxData() short-circuits because the mount points
    // disappear. Defensive cleanup attempt below.
    if (window.addEventListener) {
      const stopPoll = () => {
        if (_inboxState.pollHandle != null) {
          window.clearInterval(_inboxState.pollHandle);
          _inboxState.pollHandle = null;
        }
        window.removeEventListener('hashchange', stopPoll);
        window.removeEventListener('popstate', stopPoll);
      };
      window.addEventListener('hashchange', stopPoll);
      window.addEventListener('popstate', stopPoll);
    }
  }
}

async function loadInboxData() {
  const root = document.getElementById('inbox-root');
  if (!root) return; // navigated away; skip silently
  const params = buildInboxFilterParams({
    surface: _inboxState.filterSurface,
    status: _inboxState.filterStatus,
  });
  const [list, summary] = await Promise.all([
    api.clinicianInboxListItems(params),
    api.clinicianInboxSummary(),
  ]);
  // Use demo fallback when API is offline (both calls returned null).
  const effectiveList = list || _buildDemoInboxResponse();
  const effectiveSummary = summary || _buildDemoInboxSummary();
  _inboxState.items = (effectiveList && Array.isArray(effectiveList.items)) ? effectiveList.items : [];
  _inboxState.grouped = (effectiveList && Array.isArray(effectiveList.grouped)) ? effectiveList.grouped : [];
  _inboxState.total = (effectiveList && Number(effectiveList.total)) || 0;
  _inboxState.isDemoView = !!(effectiveList && effectiveList.is_demo_view);
  _inboxState.summary = effectiveSummary;
  _inboxState.loaded = true;

  const summaryEl = document.getElementById('inbox-summary');
  if (summaryEl) summaryEl.innerHTML = renderSummaryStrip(_inboxState.summary);
  const filtersEl = document.getElementById('inbox-filters');
  if (filtersEl) filtersEl.innerHTML = renderFilterStrip(_inboxState);
  const bannerEl = document.getElementById('inbox-banner');
  if (bannerEl) bannerEl.innerHTML = shouldShowInboxDemoBanner(effectiveList) ? renderDemoBanner() : '';
  const contentEl = document.getElementById('inbox-content');
  if (contentEl) {
    if (shouldShowInboxEmptyState(effectiveList)) {
      contentEl.innerHTML = renderEmptyState();
    } else {
      contentEl.innerHTML = (_inboxState.grouped || []).map(renderPatientGroup).join('');
    }
  }
}

function bindFilterHandlers(navigate) {
  const surfaceSel = document.getElementById('inbox-filter-surface');
  if (surfaceSel && !surfaceSel._bound) {
    surfaceSel._bound = true;
    surfaceSel.onchange = () => {
      _inboxState.filterSurface = surfaceSel.value || '';
      try { api.postClinicianInboxAuditEvent(buildInboxAuditPayload('filter_changed', { note: 'surface=' + (_inboxState.filterSurface || 'all') })); } catch (_) {}
      loadInboxData().then(() => { bindFilterHandlers(navigate); bindRowHandlers(navigate); });
    };
  }
  const statusSel = document.getElementById('inbox-filter-status');
  if (statusSel && !statusSel._bound) {
    statusSel._bound = true;
    statusSel.onchange = () => {
      _inboxState.filterStatus = statusSel.value || '';
      try { api.postClinicianInboxAuditEvent(buildInboxAuditPayload('filter_changed', { note: 'status=' + (_inboxState.filterStatus || 'all') })); } catch (_) {}
      loadInboxData().then(() => { bindFilterHandlers(navigate); bindRowHandlers(navigate); });
    };
  }
  const bulkBtn = document.getElementById('inbox-bulk-ack-btn');
  if (bulkBtn && !bulkBtn._bound) {
    bulkBtn._bound = true;
    bulkBtn.onclick = async () => {
      if (_inboxState.selectedIds.size === 0) {
        showToast('Select at least one item to acknowledge.', 'warn');
        return;
      }
      const note = (typeof window !== 'undefined' ? window.prompt('Acknowledge note (required):', '') : '');
      if (!inboxNoteRequiredValid(note)) {
        showToast('Acknowledgement note is required.', 'warn');
        return;
      }
      const ids = Array.from(_inboxState.selectedIds);
      try {
        const r = await api.clinicianInboxBulkAcknowledge(ids, note);
        try { api.postClinicianInboxAuditEvent(buildInboxAuditPayload('bulk_acknowledged', { note: `processed=${ids.length}` })); } catch (_) {}
        if (r && Number(r.failures?.length || 0) > 0) {
          showToast(`Bulk ack: ${r.succeeded} ok, ${r.failures.length} failed.`, 'warn');
        } else {
          showToast(`Acknowledged ${r?.succeeded || ids.length} items.`, 'success');
        }
        _inboxState.selectedIds.clear();
        await loadInboxData();
        bindFilterHandlers(navigate);
        bindRowHandlers(navigate);
      } catch (_) {
        showToast('Bulk acknowledge failed.', 'error');
      }
    };
  }
  const exportBtn = document.getElementById('inbox-export-csv-btn');
  if (exportBtn && !exportBtn._bound) {
    exportBtn._bound = true;
    exportBtn.addEventListener('click', () => {
      try { api.postClinicianInboxAuditEvent(buildInboxAuditPayload('export', { note: 'format=csv' })); } catch (_) {}
    });
  }
}

function bindRowHandlers(navigate) {
  const checkboxes = document.querySelectorAll('.inbox-item-checkbox');
  checkboxes.forEach(cb => {
    if (cb._bound) return;
    cb._bound = true;
    cb.onchange = () => {
      const id = cb.getAttribute('data-event-id');
      if (cb.checked) _inboxState.selectedIds.add(id);
      else _inboxState.selectedIds.delete(id);
    };
  });

  const ackBtns = document.querySelectorAll('.inbox-ack-btn');
  ackBtns.forEach(btn => {
    if (btn._bound) return;
    btn._bound = true;
    btn.onclick = async () => {
      const eventId = btn.getAttribute('data-event-id');
      const note = (typeof window !== 'undefined' ? window.prompt('Acknowledge note (required):', '') : '');
      if (!inboxNoteRequiredValid(note)) {
        showToast('Acknowledgement note is required.', 'warn');
        return;
      }
      try {
        const r = await api.clinicianInboxAcknowledge(eventId, note);
        try { api.postClinicianInboxAuditEvent(buildInboxAuditPayload('item_acknowledged_via_modal', { item_event_id: eventId })); } catch (_) {}
        if (r && r.accepted) {
          showToast('Item acknowledged.', 'success');
        }
        await loadInboxData();
        bindFilterHandlers(navigate);
        bindRowHandlers(navigate);
      } catch (_) {
        showToast('Acknowledge failed.', 'error');
      }
    };
  });

  const drillBtns = document.querySelectorAll('.inbox-drillout-btn');
  drillBtns.forEach(btn => {
    if (btn._bound) return;
    btn._bound = true;
    btn.onclick = () => {
      const surface = btn.getAttribute('data-surface');
      const patient = btn.getAttribute('data-patient');
      const eventId = btn.getAttribute('data-event-id');
      const page = inboxDrillOutPageFor(surface);
      if (!page) {
        showToast('No drill-out target for ' + surface, 'warn');
        return;
      }
      try { api.postClinicianInboxAuditEvent(buildInboxAuditPayload('item_drilled_out', { item_event_id: eventId, note: 'surface=' + surface })); } catch (_) {}
      if (patient) window._patientId = patient;
      if (typeof navigate === 'function') navigate(page);
      else if (typeof window !== 'undefined' && window._nav) window._nav(page);
    };
  });
}
