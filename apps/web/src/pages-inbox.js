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

import { api, downloadBlob, isDemoSession } from './api.js';
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
  pollMountGen: 0,
  loaded: false,
  error: null,
  /** @type {'all'|'messages'|'adherence'|'wearables'|'safety'|'protocol'|'intake'|'other'} */
  activeCategory: 'all',
  searchQuery: '',
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

/** High-level queue buckets for clinician triage (subset of backend surfaces). */
const INBOX_CATEGORY_KEYS = /** @type {const} */ ([
  'all',
  'messages',
  'adherence',
  'wearables',
  'safety',
  'protocol',
  'intake',
  'other',
]);

const CATEGORY_META = {
  all: { label: 'All items', hint: 'Every high-priority queue item for your clinic.' },
  messages: { label: 'Messages & requests', hint: 'Patient messages and urgent requests routed to clinicians.' },
  adherence: { label: 'Adherence & tasks', hint: 'Missed sessions, home-program tasks, and adherence escalations.' },
  wearables: { label: 'Wearables & monitoring', hint: 'Device-sync alerts and workbench thresholds.' },
  safety: { label: 'Safety & adverse events', hint: 'Reported adverse events and safety escalations.' },
  protocol: { label: 'Courses & QA', hint: 'Course/review surfaces and quality-assurance signals.' },
  intake: { label: 'Patient profile', hint: 'Profile and intake-related HIGH-priority audit mirrors.' },
  other: { label: 'Other', hint: 'Surfaces not in the groups above.' },
};

/** Maps backend `surface` → UI category key (must stay aligned with INBOX_SURFACE_CATEGORIES). */
export function inboxSurfaceCategory(surface) {
  const s = (surface || '').trim();
  if (s === 'patient_messages') return 'messages';
  if (s === 'adherence_events' || s === 'home_program_tasks') return 'adherence';
  if (s === 'wearables' || s === 'wearables_workbench') return 'wearables';
  if (s === 'adverse_events_hub') return 'safety';
  if (s === 'course_detail' || s === 'quality_assurance') return 'protocol';
  if (s === 'patient_profile') return 'intake';
  return 'other';
}

export function inboxItemMatchesCategory(item, category) {
  if (!category || category === 'all') return true;
  return inboxSurfaceCategory(item?.surface) === category;
}

export function inboxItemMatchesSearch(item, rawQuery) {
  const q = String(rawQuery || '').trim().toLowerCase();
  if (!q) return true;
  const hay = [
    item?.note,
    item?.event_type,
    item?.surface,
    SURFACE_LABEL[item?.surface],
    item?.patient_id,
    item?.patient_name,
    item?.actor_id,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}


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
  const q = new URLSearchParams();
  q.set('page', page);
  if (item?.patient_id) q.set('patient_id', item.patient_id);
  return `?${q.toString()}`;
}

export function inboxExportCsvPath() {
  return '/api/v1/clinician-inbox/export.csv';
}


/** Regroup flat inbox items by patient for display (client-side filters). */
export function groupInboxItemsByPatient(items) {
  const grouped = {};
  (items || []).forEach(item => {
    const pid = item.patient_id || '_unassigned';
    if (!grouped[pid]) {
      grouped[pid] = {
        patient_id: item.patient_id || null,
        patient_name: item.patient_name || null,
        items: [],
        item_count: 0,
        unread_count: 0,
        is_demo: false,
      };
    }
    const g = grouped[pid];
    g.items.push(item);
    g.item_count++;
    if (!item.is_acknowledged) g.unread_count++;
    if (item.is_demo) g.is_demo = true;
    if (!g.patient_name && item.patient_name) g.patient_name = item.patient_name;
  });
  return Object.values(grouped).sort((a, b) => {
    if (b.unread_count !== a.unread_count) return b.unread_count - a.unread_count;
    return String(a.patient_name || a.patient_id || '').localeCompare(String(b.patient_name || b.patient_id || ''));
  });
}

function _categoryCounts(items) {
  const counts = { all: (items || []).length };
  INBOX_CATEGORY_KEYS.forEach(k => { if (k !== 'all') counts[k] = 0; });
  (items || []).forEach(it => {
    const c = inboxSurfaceCategory(it.surface);
    counts[c] = (counts[c] || 0) + 1;
  });
  return counts;
}

function _applyClientFilters(items) {
  return (items || []).filter(
    it => inboxItemMatchesCategory(it, _inboxState.activeCategory) && inboxItemMatchesSearch(it, _inboxState.searchQuery),
  );
}


// ── Renderer ────────────────────────────────────────────────────────────────


function renderSafetyDisclaimer() {
  return `
    <div style="margin:0 0 14px;padding:12px 14px;border-radius:10px;background:rgba(59,130,246,0.06);border:1px solid var(--border);font-size:12px;line-height:1.55;color:var(--text-secondary)">
      <strong style="color:var(--text-primary)">Clinician-in-the-loop decision support.</strong>
      This queue surfaces HIGH-priority audit signals for review; it does not diagnose, prescribe, or automate clinical decisions.
      AI-assisted outputs elsewhere in the product remain drafts until you document review.
    </div>`;
}

function renderEmptyState() {
  return `
    <div role="status" style="text-align:center;padding:64px 24px;color:var(--text-tertiary);background:var(--surface-1);border:1px solid var(--border);border-radius:12px">
      <div style="font-size:36px;margin-bottom:8px" aria-hidden="true">📭</div>
      <div style="font-size:15px;font-weight:600;color:var(--text-secondary);margin-bottom:8px">
        Inbox clear — no matching HIGH-priority items
      </div>
      <div style="font-size:12px;color:var(--text-tertiary);max-width:520px;margin:0 auto;line-height:1.5">
        When patients trigger urgent mirrors (messages, adherence, wearables, adverse events), they appear here for triage. Adjust filters or search if you expected to see work.
      </div>
    </div>`;
}

function renderDemoBanner() {
  return `
    <div style="margin:12px 0;padding:10px 14px;border-radius:10px;background:rgba(245, 158, 11, 0.1);border:1px solid var(--amber);color:var(--amber);font-size:12.5px">
      <strong>DEMO sample data.</strong> Labels reference synthetic patients. Exports are DEMO-prefixed and are not regulator-submittable.
    </div>`;
}

function renderConnectionBanner(isDemoPreview, loadError) {
  if (!loadError) return '';
  const offline = /network|failed to fetch/i.test(loadError);
  return `
    <div role="alert" style="margin:12px 0;padding:10px 14px;border-radius:10px;background:rgba(239,68,68,0.08);border:1px solid var(--red);color:var(--text-secondary);font-size:12.5px;line-height:1.45">
      <strong style="color:var(--red)">${offline ? 'Offline or unreachable API.' : 'Could not refresh inbox.'}</strong>
      ${esc(loadError)}
      ${isDemoPreview ? '<div style="margin-top:6px;font-size:11px;color:var(--text-tertiary)">Demo preview: showing labelled sample items below. Live clinicians should use a signed-in session with API connectivity.</div>' : ''}
    </div>`;
}

function renderSummaryStrip(summary) {
  const s = summary || {};
  const stat = (label, val, color = 'var(--text-primary)') => `
    <div role="region" aria-label="${esc(label)}" style="padding:12px 16px;background:var(--surface-1);border:1px solid var(--border);border-radius:10px;flex:1;min-width:120px">
      <div style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.04em">${esc(label)}</div>
      <div style="font-size:22px;font-weight:600;color:${color};margin-top:2px">${esc(val)}</div>
    </div>`;
  const unread = inboxSummaryHonestUnreadCount(summary);
  const surfKeys = Object.keys(s.by_surface || {});
  return `
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin:12px 0">
      ${stat('Unread HIGH-priority', unread, unread > 0 ? 'var(--red)' : 'var(--teal)')}
      ${stat('Last 24 hours', s.last_24h ?? 0)}
      ${stat('Last 7 days', s.last_7d ?? 0)}
      ${stat('Surfaces with traffic', surfKeys.length)}
    </div>`;
}

function renderCategoryTabs(state, counts) {
  const tabs = INBOX_CATEGORY_KEYS.map(key => {
    const meta = CATEGORY_META[key] || { label: key, hint: '' };
    const n = counts[key] ?? 0;
    const active = state.activeCategory === key;
    return `
      <button type="button" class="inbox-cat-btn" data-cat="${esc(key)}"
        title="${esc(meta.hint)}"
        aria-pressed="${active ? 'true' : 'false'}"
        style="padding:8px 12px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;border:1px solid ${active ? 'var(--teal)' : 'var(--border)'};background:${active ? 'rgba(20,184,166,0.12)' : 'var(--surface-1)'};color:var(--text-primary);white-space:nowrap">
        ${esc(meta.label)} <span style="opacity:0.75;font-weight:500">(${n})</span>
      </button>`;
  }).join('');
  const hint = CATEGORY_META[state.activeCategory]?.hint || '';
  return `
    <div style="margin:14px 0 8px">
      <div style="font-size:11px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px">Queue lenses</div>
      <div role="tablist" aria-label="Inbox categories" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">${tabs}</div>
      <div style="font-size:11px;color:var(--text-tertiary);margin-top:8px;line-height:1.4">${esc(hint)}</div>
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
    ['acknowledged', 'Reviewed / acknowledged'],
    ['', 'All statuses'],
  ].map(([v, l]) =>
    `<option value="${v}" ${state.filterStatus === v ? 'selected' : ''}>${esc(l)}</option>`,
  ).join('');
  const qVal = esc(state.searchQuery || '');
  return `
    <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;margin:12px 0">
      <label style="font-size:12px;color:var(--text-secondary);flex:1;min-width:200px">Search
        <input id="inbox-search" type="search" autocomplete="off" placeholder="Patient, note text, surface…" value="${qVal}"
          aria-label="Search inbox items"
          style="display:block;margin-top:4px;width:100%;padding:8px 10px;border-radius:6px;background:var(--surface-1);border:1px solid var(--border);color:var(--text-primary);font-size:13px" />
      </label>
      <label style="font-size:12px;color:var(--text-secondary)">Surface
        <select id="inbox-filter-surface" aria-label="Filter by surface"
          style="display:block;margin-top:4px;padding:8px 10px;border-radius:6px;background:var(--surface-1);border:1px solid var(--border);color:var(--text-primary);min-width:160px">${surfaceOpts}</select>
      </label>
      <label style="font-size:12px;color:var(--text-secondary)">Status
        <select id="inbox-filter-status" aria-label="Filter by read status"
          style="display:block;margin-top:4px;padding:8px 10px;border-radius:6px;background:var(--surface-1);border:1px solid var(--border);color:var(--text-primary);min-width:170px">${statusOpts}</select>
      </label>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-left:auto">
        <button type="button" id="inbox-bulk-ack-btn" style="padding:8px 14px;border-radius:6px;background:var(--teal);border:none;color:white;font-weight:600;cursor:pointer;font-size:12px">
          Acknowledge selected
        </button>
        <button type="button" id="inbox-export-csv-btn" style="padding:8px 14px;border-radius:6px;background:var(--surface-2);border:1px solid var(--border);color:var(--text-primary);font-size:12px;font-weight:600;cursor:pointer">
          Export CSV
        </button>
      </div>
    </div>`;
}

function renderItemRow(item) {
  const urgent = !item.is_acknowledged;
  const sev = urgent ? 'var(--red)' : 'var(--text-tertiary)';
  const ack = item.is_acknowledged
    ? `<span style="color:var(--teal);font-weight:600;font-size:11px">Reviewed</span>`
    : `<button type="button" class="inbox-ack-btn" data-event-id="${esc(item.event_id)}" aria-label="Acknowledge with note"
        style="padding:6px 12px;border-radius:6px;background:var(--teal);border:none;color:white;font-size:11px;font-weight:600;cursor:pointer">Acknowledge…</button>`;
  const drillOutPage = inboxDrillOutPageFor(item.surface);
  const drillLabel = item.surface === 'wearables_workbench' ? 'Open workbench' : 'Open source';
  const drillOut = drillOutPage
    ? `<button type="button" class="inbox-drillout-btn" data-event-id="${esc(item.event_id)}" data-surface="${esc(item.surface)}" data-patient="${esc(item.patient_id || '')}"
        aria-label="${esc(drillLabel)}"
        style="padding:6px 12px;border-radius:6px;background:var(--surface-2);border:1px solid var(--border);color:var(--text-primary);font-size:11px;font-weight:600;cursor:pointer">${esc(drillLabel)}</button>`
    : `<span style="font-size:11px;color:var(--text-tertiary)" title="No drill-out route">—</span>`;
  const cat = inboxSurfaceCategory(item.surface);
  const catLabel = (CATEGORY_META[cat] && CATEGORY_META[cat].label) || 'Other';
  return `
    <div class="inbox-item-row" role="listitem" style="display:flex;gap:10px;padding:12px 14px;border-bottom:1px solid var(--border);align-items:flex-start">
      <input type="checkbox" class="inbox-item-checkbox" data-event-id="${esc(item.event_id)}" aria-label="Select for bulk acknowledge" ${_inboxState.selectedIds.has(item.event_id) ? 'checked' : ''}>
      <div style="flex:0 0 4px;min-height:40px;background:${sev};border-radius:2px;margin-top:2px" aria-hidden="true" title="${urgent ? 'Awaiting review' : 'Reviewed'}"></div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:4px;flex-wrap:wrap">
          <span style="padding:2px 8px;border-radius:4px;background:var(--surface-2);border:1px solid var(--border);font-size:10.5px;color:var(--text-secondary)">
            ${esc(SURFACE_LABEL[item.surface] || item.surface)}
          </span>
          <span style="padding:2px 8px;border-radius:4px;background:rgba(100,116,139,0.12);font-size:10px;color:var(--text-tertiary)">${esc(catLabel)}</span>
          <span style="font-size:11px;color:var(--text-tertiary)">${esc(item.event_type)}</span>
          ${item.is_demo ? `<span style="padding:2px 6px;border-radius:4px;background:var(--amber);color:white;font-size:10px;font-weight:600">DEMO</span>` : ''}
          ${urgent ? `<span style="padding:2px 6px;border-radius:4px;background:rgba(239,68,68,0.15);color:var(--red);font-size:10px;font-weight:700">ACTION</span>` : ''}
        </div>
        <div style="font-size:13px;color:var(--text-primary);font-weight:500;line-height:1.45">
          ${esc(item.note || '(no note)').slice(0, 280)}
        </div>
        <div style="font-size:11px;color:var(--text-tertiary);margin-top:6px">
          <time datetime="${esc(item.created_at)}">${esc(item.created_at)}</time>
          · source=${esc(item.actor_id || '—')}
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0;align-items:stretch">
        ${ack}
        ${drillOut}
      </div>
    </div>`;
}

function renderPatientGroup(group) {
  const headerColor = group.unread_count > 0 ? 'var(--red)' : 'var(--text-secondary)';
  const label = group.patient_name || group.patient_id || 'Unassigned';
  return `
    <section style="margin:16px 0;background:var(--surface-1);border:1px solid var(--border);border-radius:12px;overflow:hidden">
      <header style="padding:12px 14px;background:var(--surface-2);border-bottom:1px solid var(--border);display:flex;flex-wrap:wrap;align-items:center;gap:10px">
        <h2 style="margin:0;font-size:14px;font-weight:700;color:${headerColor}">
          ${esc(label)}
        </h2>
        <div style="font-size:11px;color:var(--text-tertiary)">
          ${group.unread_count} awaiting review · ${group.item_count} total
          ${group.is_demo ? ' · <span style="color:var(--amber);font-weight:600">DEMO</span>' : ''}
        </div>
      </header>
      <div role="list">
      ${(group.items || []).map(renderItemRow).join('')}
      </div>
    </section>`;
}


// ── Mount ───────────────────────────────────────────────────────────────────


export async function pgClinicianInbox(setTopbar, navigate) {
  const el = document.getElementById('content');
  if (!el) return;

  if (typeof setTopbar === 'function') {
    setTopbar(
      'Clinician Inbox',
      'HIGH-priority patient signals and escalations — review, acknowledge, and drill out to source surfaces.',
    );
  }

  _inboxState.pollMountGen = (_inboxState.pollMountGen || 0) + 1;
  const pollGen = _inboxState.pollMountGen;

  if (_inboxState.pollHandle != null && typeof window !== 'undefined') {
    window.clearInterval(_inboxState.pollHandle);
    _inboxState.pollHandle = null;
  }

  try {
    api.postClinicianInboxAuditEvent(buildInboxAuditPayload('view', { note: 'inbox page mounted' }));
  } catch (_) { /* ignore */ }

  el.innerHTML = `
    <div id="inbox-root" style="max-width:1120px;margin:0 auto;padding:18px 20px 48px">
      <div id="inbox-disclaimer"></div>
      <div id="inbox-summary"></div>
      <div id="inbox-categories"></div>
      <div id="inbox-filters"></div>
      <div id="inbox-banner"></div>
      <div id="inbox-connection"></div>
      <div id="inbox-content">
        <div role="status" style="text-align:center;padding:48px 24px;color:var(--text-tertiary);font-size:13px">Loading clinician inbox…</div>
      </div>
    </div>`;

  const discEl = document.getElementById('inbox-disclaimer');
  if (discEl) discEl.innerHTML = renderSafetyDisclaimer();

  await loadInboxData();

  bindFilterHandlers(navigate);
  bindRowHandlers(navigate);

  if (typeof window !== 'undefined') {
    _inboxState.pollHandle = window.setInterval(() => {
      if (_inboxState.pollMountGen !== pollGen) return;
      try {
        api.postClinicianInboxAuditEvent(buildInboxAuditPayload('polling_tick'));
      } catch (_) { /* ignore */ }
      loadInboxData().then(() => {
        bindFilterHandlers(navigate);
        bindRowHandlers(navigate);
      }).catch(() => { /* keep prior UI */ });
    }, 30_000);
  }
}

async function loadInboxData() {
  const root = document.getElementById('inbox-root');
  if (!root) return;

  const params = buildInboxFilterParams({
    surface: _inboxState.filterSurface,
    status: _inboxState.filterStatus,
  });

  let list = null;
  let summary = null;
  let fetchErr = null;

  try {
    [list, summary] = await Promise.all([
      api.clinicianInboxListItems(params),
      api.clinicianInboxSummary(),
    ]);
  } catch (e) {
    fetchErr = e?.message || String(e);
  }

  const demoSession = typeof isDemoSession === 'function' && isDemoSession();
  const useDemoFallback = demoSession && (!list || !summary);

  if (useDemoFallback) {
    list = list || _buildDemoInboxResponse();
    summary = summary || _buildDemoInboxSummary();
    fetchErr = null;
  }

  if (fetchErr && !useDemoFallback) {
    _inboxState.error = fetchErr;
    _inboxState.items = [];
    _inboxState.grouped = [];
    _inboxState.total = 0;
    _inboxState.summary = null;
    _inboxState.isDemoView = false;
    _inboxState.loaded = true;

    const summaryEl = document.getElementById('inbox-summary');
    if (summaryEl) summaryEl.innerHTML = '';
    const catEl = document.getElementById('inbox-categories');
    if (catEl) catEl.innerHTML = '';
    const filtersEl = document.getElementById('inbox-filters');
    if (filtersEl) filtersEl.innerHTML = renderFilterStrip(_inboxState);
    const bannerEl = document.getElementById('inbox-banner');
    if (bannerEl) bannerEl.innerHTML = '';
    const connEl = document.getElementById('inbox-connection');
    if (connEl) connEl.innerHTML = renderConnectionBanner(demoSession, fetchErr);
    const contentEl = document.getElementById('inbox-content');
    if (contentEl) {
      contentEl.innerHTML = `
        <div role="alert" style="text-align:center;padding:56px 24px;background:var(--surface-1);border:1px solid var(--border);border-radius:12px;max-width:560px;margin:0 auto">
          <div style="font-size:40px;margin-bottom:12px" aria-hidden="true">⚠️</div>
          <div style="font-size:16px;font-weight:600;color:var(--text-primary);margin-bottom:8px">Inbox unavailable</div>
          <div style="font-size:13px;color:var(--text-secondary);line-height:1.55;margin-bottom:20px">${esc(fetchErr)}</div>
          <button type="button" id="inbox-retry-btn" class="btn-primary" style="padding:10px 18px;border-radius:8px;font-weight:600;cursor:pointer">Retry</button>
        </div>`;
    }
    return;
  }

  _inboxState.error = null;
  const effectiveList = list;
  const effectiveSummary = summary;

  _inboxState.items = (effectiveList && Array.isArray(effectiveList.items)) ? effectiveList.items : [];
  _inboxState.total = (effectiveList && Number(effectiveList.total)) || _inboxState.items.length;
  _inboxState.isDemoView = !!(effectiveList && effectiveList.is_demo_view);
  _inboxState.summary = effectiveSummary;
  _inboxState.loaded = true;

  const filteredItems = _applyClientFilters(_inboxState.items);
  _inboxState.grouped = groupInboxItemsByPatient(filteredItems);

  const counts = _categoryCounts(_inboxState.items);

  const summaryEl = document.getElementById('inbox-summary');
  if (summaryEl) summaryEl.innerHTML = renderSummaryStrip(_inboxState.summary);

  const catEl = document.getElementById('inbox-categories');
  if (catEl) catEl.innerHTML = renderCategoryTabs(_inboxState, counts);

  const filtersEl = document.getElementById('inbox-filters');
  if (filtersEl) filtersEl.innerHTML = renderFilterStrip(_inboxState);

  const bannerEl = document.getElementById('inbox-banner');
  if (bannerEl) {
    bannerEl.innerHTML = shouldShowInboxDemoBanner(effectiveList) ? renderDemoBanner() : '';
  }

  const connEl = document.getElementById('inbox-connection');
  if (connEl) connEl.innerHTML = renderConnectionBanner(demoSession, fetchErr);

  const contentEl = document.getElementById('inbox-content');
  if (contentEl) {
    const emptySource = { ...effectiveList, items: filteredItems };
    if (shouldShowInboxEmptyState(emptySource)) {
      contentEl.innerHTML = renderEmptyState();
    } else {
      contentEl.innerHTML = (_inboxState.grouped || []).map(renderPatientGroup).join('');
    }
  }
}

function bindFilterHandlers(navigate) {
  const retryBtn = document.getElementById('inbox-retry-btn');
  if (retryBtn && !retryBtn._bound) {
    retryBtn._bound = true;
    retryBtn.onclick = () => {
      loadInboxData().then(() => {
        bindFilterHandlers(navigate);
        bindRowHandlers(navigate);
      });
    };
  }

  const searchInp = document.getElementById('inbox-search');
  if (searchInp && !searchInp._bound) {
    searchInp._bound = true;
    let t = null;
    searchInp.addEventListener('input', () => {
      _inboxState.searchQuery = searchInp.value || '';
      if (t) window.clearTimeout(t);
      t = window.setTimeout(() => {
        loadInboxData().then(() => {
          bindFilterHandlers(navigate);
          bindRowHandlers(navigate);
        });
      }, 180);
    });
  }

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

  document.querySelectorAll('.inbox-cat-btn').forEach(btn => {
    if (btn._bound) return;
    btn._bound = true;
    btn.onclick = () => {
      const cat = btn.getAttribute('data-cat') || 'all';
      _inboxState.activeCategory = cat;
      try { api.postClinicianInboxAuditEvent(buildInboxAuditPayload('filter_changed', { note: 'category=' + cat })); } catch (_) {}
      loadInboxData().then(() => { bindFilterHandlers(navigate); bindRowHandlers(navigate); });
    };
  });

  const bulkBtn = document.getElementById('inbox-bulk-ack-btn');
  if (bulkBtn && !bulkBtn._bound) {
    bulkBtn._bound = true;
    bulkBtn.onclick = async () => {
      if (_inboxState.selectedIds.size === 0) {
        showToast('Select at least one item to acknowledge.', 'warn');
        return;
      }
      const note = (typeof window !== 'undefined' ? window.prompt('Acknowledgement note (required):', '') : '');
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
      } catch (e) {
        const msg = e?.message || 'Bulk acknowledge failed.';
        showToast(msg, 'error');
      }
    };
  }

  const exportBtn = document.getElementById('inbox-export-csv-btn');
  if (exportBtn && !exportBtn._bound) {
    exportBtn._bound = true;
    exportBtn.onclick = async () => {
      try { api.postClinicianInboxAuditEvent(buildInboxAuditPayload('export', { note: 'format=csv' })); } catch (_) {}
      try {
        const out = await api.clinicianInboxExportCsvBlob();
        const name = out.filename || 'clinician-inbox.csv';
        downloadBlob(out.blob, name);
        showToast('Export started.', 'success');
      } catch (e) {
        showToast(e?.message || 'CSV export failed.', 'error');
      }
    };
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
      const note = (typeof window !== 'undefined' ? window.prompt('Acknowledgement note (required):', '') : '');
      if (!inboxNoteRequiredValid(note)) {
        showToast('Acknowledgement note is required.', 'warn');
        return;
      }
      try {
        const r = await api.clinicianInboxAcknowledge(eventId, note);
        try { api.postClinicianInboxAuditEvent(buildInboxAuditPayload('item_acknowledged_via_modal', { item_event_id: eventId })); } catch (_) {}
        if (r && r.accepted) {
          showToast('Recorded acknowledgement.', 'success');
        }
        await loadInboxData();
        bindFilterHandlers(navigate);
        bindRowHandlers(navigate);
      } catch (e) {
        showToast(e?.message || 'Acknowledge failed.', 'error');
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
      if (surface === 'wearables_workbench') {
        try { window.localStorage.setItem('monitor_tab', 'wearables-workbench'); } catch (_) {}
      }
      if (patient) window._patientId = patient;
      if (typeof navigate === 'function') navigate(page);
      else if (typeof window !== 'undefined' && window._nav) window._nav(page);
    };
  });
}
