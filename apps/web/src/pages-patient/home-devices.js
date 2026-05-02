// pgPatientHomeDevices / pgPatientHomeDevice / pgPatientHomeSessionLog
// Extracted from `pages-patient.js` on 2026-05-02 as part of the file-split
// refactor (see `pages-patient/_shared.js`). NO behavioural change: code
// below is the verbatim home-devices block from the original file, with
// imports rewired.
import { api } from '../api.js';
import { t } from '../i18n.js';
import { setTopbar, spinner, fmtDate, fmtRelative, _vizWeekStrip } from './_shared.js';

// ── Home Devices hub ────────────────────────────────────────────────────────

export async function pgPatientHomeDevices() {
  setTopbar(
    'Home Devices',
    '<div class="phd-topbar-actions">' +
      '<button class="btn btn-ghost btn-sm" onclick="window._phdRefresh()"><svg width="12" height="12"><use href="#i-refresh"/></svg>Refresh</button>' +
      '<button class="btn btn-primary btn-sm" onclick="window._phdJumpCatalog()"><svg width="12" height="12"><use href="#i-plus"/></svg>Add device</button>' +
    '</div>'
  );

  const el = document.getElementById('patient-content');
  if (!el) return;

  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
  const raceNull = (p, ms = 3200) => Promise.race([
    Promise.resolve(p).catch(() => null),
    new Promise((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
  const emitToast = (message, tone = 'var(--teal)') => {
    const node = document.createElement('div');
    node.textContent = message;
    node.style.cssText =
      'position:fixed;bottom:24px;right:24px;z-index:9999;background:' + tone +
      ';color:#08111f;padding:10px 16px;border-radius:10px;font-size:12.5px;font-weight:700;box-shadow:0 12px 28px rgba(0,0,0,0.35)';
    document.body.appendChild(node);
    setTimeout(() => node.remove(), 2600);
  };
  const formatMetric = (num) => {
    if (num == null || Number.isNaN(Number(num))) return '0';
    const value = Number(num);
    if (value >= 1000) return value.toLocaleString('en-US', { maximumFractionDigits: 1 }).replace('.0', '');
    return String(value);
  };
  const daysSince = (iso) => {
    if (!iso) return 0;
    const then = new Date(iso).getTime();
    if (!Number.isFinite(then)) return 0;
    return Math.max(0, Math.round((Date.now() - then) / 86400000));
  };
  const activityTypeLabel = (type) => ({
    adherence_report: 'Adherence update',
    side_effect: 'Side-effect report',
    tolerance_change: 'Tolerance update',
    break_request: 'Break request',
    concern: 'Care concern',
    positive_feedback: 'Positive feedback',
    device_request: 'Device request',
  }[type] || 'Activity');
  const summarizeParameters = (params) => {
    if (!params || typeof params !== 'object') return [];
    const keys = ['frequency_hz', 'pulse_width_us', 'intensity_ma', 'target', 'montage', 'duration_min'];
    return keys
      .filter((key) => params[key] != null && params[key] !== '')
      .slice(0, 4)
      .map((key) => {
        const label = {
          frequency_hz: 'Hz',
          pulse_width_us: 'Pulse',
          intensity_ma: 'Intensity',
          target: 'Target',
          montage: 'Montage',
          duration_min: 'Duration',
        }[key] || key;
        const suffix = key === 'frequency_hz' ? ' Hz'
          : key === 'pulse_width_us' ? ' us'
          : key === 'intensity_ma' ? ' mA'
          : key === 'duration_min' ? ' min'
          : '';
        return label + ' ' + params[key] + suffix;
      });
  };
  const buildWeekStrip = (sessions) => {
    const out = [];
    const today = new Date();
    for (let i = 6; i >= 0; i -= 1) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const dayIso = date.toISOString().slice(0, 10);
      const hits = sessions.filter((row) => (row.session_date || '').slice(0, 10) === dayIso);
      out.push({
        dayName: date.toLocaleDateString('en-US', { weekday: 'short' }),
        status: hits.length ? (hits.some((row) => row.completed === false) ? 'partial' : 'done') : 'missed',
        isToday: i === 0,
      });
    }
    return out;
  };

  el.innerHTML = `
    <div class="phd-page">
      <div class="phd-hero-grid">
        <section class="phd-panel phd-panel--hero">
          <div class="phd-eyebrow">Home neuromodulation hub</div>
          <div class="phd-skeleton phd-skeleton--headline"></div>
          <div class="phd-skeleton phd-skeleton--body"></div>
          <div class="phd-skeleton phd-skeleton--body phd-skeleton--body-short"></div>
          <div class="phd-kpi-grid">
            ${Array.from({ length: 4 }, () => `
              <div class="phd-skeleton-card">
                <div class="phd-skeleton phd-skeleton--title"></div>
                <div class="phd-skeleton phd-skeleton--value"></div>
                <div class="phd-skeleton phd-skeleton--sub"></div>
              </div>
            `).join('')}
          </div>
        </section>
        <section class="phd-panel phd-panel--adherence">
          <div class="phd-panel-title">Weekly adherence</div>
          <div class="phd-adherence-skeleton">
            <div class="phd-skeleton phd-skeleton--gauge"></div>
            <div class="phd-skeleton-lines">
              <div class="phd-skeleton phd-skeleton--bar"></div>
              <div class="phd-skeleton phd-skeleton--bar"></div>
              <div class="phd-skeleton phd-skeleton--bar"></div>
            </div>
          </div>
        </section>
      </div>
    </div>
  `;

  // Mount-time audit ping (Patient Home Devices launch-audit 2026-05-01).
  // Fire-and-forget — the page must render even if the audit endpoint is
  // unreachable. Mirrors the pattern established by Symptom Journal #344
  // / Wellness #345 / Patient Reports #346 / Patient Messages #347.
  try {
    if (api.postHomeDevicesAuditEvent) {
      api.postHomeDevicesAuditEvent({ event: 'view', note: 'page mount' });
    }
  } catch (_) { /* audit must never block UI */ }

  const [
    wearablesRaw,
    wearableSummaryRaw,
    homeDeviceRaw,
    adherenceRaw,
    sessionsRaw,
    eventsRaw,
    registryRaw,
    homeDevicesListRaw,
    homeDevicesSummaryRaw,
  ] = await Promise.all([
    raceNull(api.patientPortalWearables()),
    raceNull(api.patientPortalWearableSummary(14)),
    raceNull(api.portalGetHomeDevice()),
    raceNull(api.portalHomeAdherenceSummary()),
    raceNull(api.portalListHomeSessions()),
    raceNull(api.portalListAdherenceEvents()),
    raceNull(api.devices_registry()),
    raceNull(api.homeDevicesList ? api.homeDevicesList() : null),
    raceNull(api.homeDevicesSummary ? api.homeDevicesSummary() : null),
  ]);

  // Patient Home Devices launch-audit (2026-05-01). Server-side device
  // registry is the new source of truth — surface the rows alongside the
  // existing clinician assignment view. ``is_demo`` and
  // ``consent_active`` come from the server so demo banners and the
  // read-only consent state are honest.
  const homeDevicesItems = Array.isArray(homeDevicesListRaw?.items) ? homeDevicesListRaw.items : [];
  const homeDevicesIsDemo = !!homeDevicesListRaw?.is_demo;
  const homeDevicesConsentActive = homeDevicesListRaw?.consent_active !== false;
  const homeDevicesSummary = homeDevicesSummaryRaw && typeof homeDevicesSummaryRaw === 'object'
    ? homeDevicesSummaryRaw
    : null;

  const connections = Array.isArray(wearablesRaw?.connections) ? wearablesRaw.connections : [];
  const alerts = Array.isArray(wearablesRaw?.recent_alerts) ? wearablesRaw.recent_alerts : [];
  const wearableSummary = Array.isArray(wearableSummaryRaw) ? wearableSummaryRaw : [];
  const assignment = (homeDeviceRaw && typeof homeDeviceRaw === 'object' && 'assignment' in homeDeviceRaw)
    ? (homeDeviceRaw.assignment || null)
    : (homeDeviceRaw || null);
  const adherenceEnvelope = adherenceRaw && typeof adherenceRaw === 'object' ? adherenceRaw : {};
  const adherence = adherenceEnvelope.adherence || adherenceEnvelope || null;
  const sessions = Array.isArray(sessionsRaw) ? sessionsRaw : [];
  const events = Array.isArray(eventsRaw) ? eventsRaw : [];
  const registryItems = Array.isArray(registryRaw?.items) ? registryRaw.items : [];

  const PLATFORM_DEFS = [
    { id: 'apple_health', label: 'Apple Health', platform: 'iPhone / iOS', icon: '◌', accent: '#53e4cf', description: 'Sleep, HRV, heart rate, steps', supported: true },
    { id: 'android_health', label: 'Health Connect', platform: 'Android', icon: '◍', accent: '#7cc9ff', description: 'Sleep, steps, heart rate', supported: true },
    { id: 'fitbit', label: 'Fitbit', platform: 'iOS / Android', icon: '◐', accent: '#79f2d4', description: 'Sleep, activity, recovery trends', supported: true },
    { id: 'garmin_connect', label: 'Garmin Connect', platform: 'Garmin wearables', icon: '◎', accent: '#94a3b8', description: 'Recovery, training load, heart rate, and sleep', supported: true },
  ];
  const platformStatus = (platformId) => {
    const conn = connections.find((row) => row.source === platformId);
    if (!conn) return { tone: 'idle', label: 'Not linked', pill: 'Not linked', connection: null };
    const lastSync = conn.last_sync_at ? Date.now() - new Date(conn.last_sync_at).getTime() : Number.POSITIVE_INFINITY;
    if (conn.status !== 'connected') return { tone: 'idle', label: 'Disconnected', pill: 'Disconnected', connection: conn };
    if (lastSync < 36e5 * 18) return { tone: 'good', label: 'Syncing', pill: 'Synced', connection: conn };
    if (lastSync < 36e5 * 72) return { tone: 'warn', label: 'Needs refresh', pill: 'Stale', connection: conn };
    return { tone: 'warn', label: 'Reconnect needed', pill: 'Reconnect', connection: conn };
  };

  const sessionsLogged = Number(adherence?.sessions_logged ?? sessions.length ?? 0);
  const sessionsExpected = Number(adherence?.sessions_expected ?? assignment?.planned_total_sessions ?? 0) || 0;
  const adherencePct = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        adherence?.adherence_rate_pct
          ?? (sessionsExpected > 0 ? (sessionsLogged / sessionsExpected) * 100 : (sessionsLogged > 0 ? 100 : 0))
      )
    )
  );
  const streak = Number(adherence?.streak_current ?? 0);
  const assignmentWeeks = assignment?.assigned_at ? Math.max(1, Math.ceil(daysSince(assignment.assigned_at) / 7)) : 0;
  const summaryMetrics = [
    { label: 'Active devices', value: formatMetric((assignment ? 1 : 0) + connections.filter((row) => row.status === 'connected').length), sub: assignment ? 'Home + health platforms' : 'Health platforms only' },
    { label: 'Sessions logged', value: formatMetric(sessionsLogged), sub: sessionsExpected ? 'of ' + formatMetric(sessionsExpected) + ' planned' : 'Portal session log' },
    { label: 'Adherence', value: adherencePct + '%', sub: streak ? streak + '-day streak' : 'No streak yet' },
    { label: 'Data points', value: formatMetric(wearableSummary.length * Math.max(1, connections.length || 1)), sub: wearableSummary.length ? 'From recent syncs' : 'Waiting for sync' },
  ];

  const supportedPlatforms = PLATFORM_DEFS.filter((row) => row.supported);
  const connectedSupportedPlatforms = supportedPlatforms.filter((row) => platformStatus(row.id).connection);
  const homeDeviceCards = [];
  if (assignment) {
    homeDeviceCards.push({
      id: 'assignment',
      kind: 'assignment',
      title: assignment.device_name || 'Home device',
      subtitle: assignment.device_category || 'Clinician-assigned therapy',
      status: 'Online',
      tone: 'good',
      pill: assignment.device_model || 'Active plan',
      primary: sessionsLogged + ' sessions',
      secondary: sessionsExpected ? sessionsExpected + ' planned' : 'Flexible plan',
      tertiary: assignment.assigned_at ? 'Week ' + assignmentWeeks : 'Assigned',
      chips: summarizeParameters(assignment.parameters),
      primaryLabel: 'Start session',
      primaryAction: "window._phdStartSession()",
      secondaryLabel: 'Details',
      secondaryAction: "window._phdOpenDeviceDetails('assignment')",
    });
  }
  connectedSupportedPlatforms.slice(0, assignment ? 2 : 3).forEach((platform) => {
    const state = platformStatus(platform.id);
    const latest = wearableSummary.filter((row) => row.source === platform.id).slice(-1)[0] || null;
    const metricParts = [
      latest?.sleep_duration_h != null ? latest.sleep_duration_h.toFixed(1) + 'h sleep' : null,
      latest?.hrv_ms != null ? Math.round(latest.hrv_ms) + ' ms HRV' : null,
      latest?.steps != null ? formatMetric(latest.steps) + ' steps' : null,
    ].filter(Boolean);
    homeDeviceCards.push({
      id: platform.id,
      kind: 'source',
      title: platform.label,
      subtitle: platform.platform,
      status: state.label,
      tone: state.tone,
      pill: state.pill,
      primary: metricParts[0] || 'Source linked',
      secondary: metricParts[1] || (state.connection?.last_sync_at ? 'Last sync ' + fmtRelative(state.connection.last_sync_at) : 'Awaiting first sync'),
      tertiary: metricParts[2] || 'Wearable data',
      chips: latest?.readiness_score != null ? ['Readiness ' + Math.round(latest.readiness_score)] : [],
      primaryLabel: 'Manage',
      primaryAction: "window._phdTogglePlatform('" + platform.id + "')",
      secondaryLabel: 'Details',
      secondaryAction: "window._phdOpenDeviceDetails('" + platform.id + "')",
    });
  });
  while (homeDeviceCards.length < 3) {
    homeDeviceCards.push({
      id: 'placeholder-' + homeDeviceCards.length,
      kind: 'placeholder',
      title: homeDeviceCards.length === 0 ? 'No devices linked yet' : 'Add another data source',
      subtitle: homeDeviceCards.length === 0 ? 'Connect a health platform to unlock trends' : 'Broaden your recovery signals',
      status: 'Ready to connect',
      tone: 'idle',
      pill: 'Setup',
      primary: 'No live sync',
      secondary: 'Use Add device to connect',
      tertiary: 'Your clinic only sees what you approve',
      chips: [],
      primaryLabel: 'Add device',
      primaryAction: "window._phdJumpCatalog()",
      secondaryLabel: 'Message team',
      secondaryAction: "window._navPatient('patient-messages')",
    });
  }

  const fallbackCatalog = [
    { id: 'synaps-one', name: 'Synaps One', modality: 'tDCS', category: 'Clinic-prescribed', price: 'Clinic plan', action: 'request', desc: 'Portal-guided home sessions with side-effect logging.' },
    { id: 'neuro-alpha', name: 'Neuro Alpha', modality: 'Photobiomodulation', category: 'Recommended', price: 'Clinic plan', action: 'request', desc: 'NIR sessions paired with your recovery protocol.' },
    { id: 'vagus-mini', name: 'Vagus Mini', modality: 'nVNS', category: 'Vagus', price: 'By referral', action: 'request', desc: 'Gentle vagus stimulation with clinician oversight.' },
    { id: 'apple-health-card', name: 'Apple Health', modality: 'Wearable sync', category: 'iOS', price: 'Included', action: 'connect', sourceId: 'apple_health', desc: 'Use your iPhone or Apple Watch data.' },
    { id: 'health-connect-card', name: 'Health Connect', modality: 'Wearable sync', category: 'Android', price: 'Included', action: 'connect', sourceId: 'android_health', desc: 'Sync steps, sleep, and heart rate from Android.' },
    { id: 'fitbit-card', name: 'Fitbit', modality: 'Wearable sync', category: 'Wearable', price: 'Included', action: 'connect', sourceId: 'fitbit', desc: 'Pull Fitbit recovery and activity trends.' },
    { id: 'oura-card', name: 'Oura Ring', modality: 'Wearable sync', category: 'Recovery', price: 'Included', action: 'connect', sourceId: 'oura', desc: 'Readiness, HRV, and sleep staging.' },
    { id: 'garmin-card', name: 'Garmin Connect', modality: 'Wearable sync', category: 'Wearable', price: 'Included', action: 'connect', sourceId: 'garmin_connect', desc: 'Sync Garmin recovery, sleep, and training trends.' },
  ];
  const compatibleCatalog = (registryItems.length
    ? registryItems.slice(0, 8).map((item, idx) => ({
        id: item.id || ('registry-' + idx),
        name: item.name || item.label || item.id || 'Device',
        modality: item.modality || item.modality_id || item.type || 'Neuromodulation',
        category: item.category || item.vendor || 'Clinic-supported',
        price: 'Clinic-supported',
        action: 'request',
        desc: item.description || 'Discuss with your care team before starting a new device at home.',
      }))
    : fallbackCatalog
  ).map((item) => {
    if (item.sourceId) {
      const state = platformStatus(item.sourceId);
      return { ...item, liveLabel: state.connection ? state.pill : 'Available', action: state.connection ? 'manage' : item.action };
    }
    return item;
  });

  const recentActivity = []
    .concat(sessions.slice(0, 5).map((row) => ({
      id: 'session-' + row.id,
      title: row.completed === false ? 'Session marked partial' : 'Home session logged',
      meta: (assignment?.device_name || 'Home device') + ' · ' + fmtDate(row.session_date || row.logged_at),
      amount: row.duration_minutes ? '+' + row.duration_minutes + ' min' : 'Logged',
      tone: row.completed === false ? 'warn' : 'good',
      tag: row.status === 'pending_review' ? 'Pending review' : 'Synced',
      at: row.logged_at || row.session_date,
      open: "window._navPatient('pt-adherence-history')",
    })))
    .concat(events.slice(0, 5).map((row) => ({
      id: 'event-' + row.id,
      title: activityTypeLabel(row.event_type),
      meta: fmtDate(row.report_date || row.created_at),
      amount: row.severity || 'Reported',
      tone: row.severity === 'urgent' || row.severity === 'high' ? 'warn' : 'idle',
      tag: row.status || 'Open',
      at: row.created_at || row.report_date,
      open: "window._navPatient('pt-adherence-events')",
    })))
    .concat(connections.filter((row) => row.last_sync_at).map((row) => ({
      id: 'sync-' + row.id,
      title: (PLATFORM_DEFS.find((def) => def.id === row.source)?.label || row.display_name || row.source) + ' synced',
      meta: fmtRelative(row.last_sync_at),
      amount: '+1 sync',
      tone: 'good',
      tag: 'Synced',
      at: row.last_sync_at,
      open: "window._phdOpenDeviceDetails('" + row.source + "')",
    })))
    .filter((row) => row.at)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 7);

  const weeklyDays = buildWeekStrip(sessions);
  const heroTitle = assignment
    ? 'Your at-home toolkit is in sync with your clinic plan.'
    : 'Connect your home devices so your clinic can track progress safely.';
  const heroCopy = assignment
    ? 'Your prescribed device, session logs, and health-platform connections appear here. Your care team receives reviewed updates, not raw personal data.'
    : 'Link a supported health platform first, then ask your care team to assign a home therapy device if it is part of your plan.';
  const alertCopy = alerts[0]?.detail
    ? esc(alerts[0].detail)
    : (assignment
      ? 'Your clinic reviews home-session logs and wearable trends before they change your plan.'
      : 'Connect a health platform to start sharing sleep, activity, and recovery signals.');
  const renderStatusDot = (tone) => '<span class="phd-status-dot is-' + tone + '"></span>';
  const renderWeeklyBar = (label, value, total, accentClass) => {
    const max = total > 0 ? total : 1;
    const pct = Math.max(0, Math.min(100, Math.round((value / max) * 100)));
    return `
      <div class="phd-progress-row">
        <div class="phd-progress-copy"><span>${esc(label)}</span><strong>${formatMetric(value)} / ${formatMetric(total)}</strong></div>
        <div class="phd-progress-rail"><div class="phd-progress-fill ${accentClass}" style="width:${pct}%"></div></div>
      </div>
    `;
  };

  // Banners surface server-truth flags from the Patient Home Devices
  // launch-audit (2026-05-01). DEMO banner renders only when the
  // /devices list explicitly reports is_demo=true. Consent banner
  // renders only when consent_active=false; the page becomes
  // read-only-aware (action buttons emit a toast pointing at consent
  // re-affirmation).
  const phdBanners = []
    + (homeDevicesIsDemo ? '<div class="phd-banner is-demo" data-test="phd-demo-banner">DEMO data — device records on this page are not regulator-submittable.</div>' : '')
    + (!homeDevicesConsentActive ? '<div class="phd-banner is-consent" data-test="phd-consent-banner">Consent withdrawn — your devices remain readable, but registering, logging, calibrating and decommissioning are paused until consent is reinstated.</div>' : '')
    + (homeDevicesSummary && homeDevicesSummary.faulty > 0 ? '<div class="phd-banner is-warn" data-test="phd-faulty-banner">' + homeDevicesSummary.faulty + ' device' + (homeDevicesSummary.faulty === 1 ? '' : 's') + ' marked faulty — your care team has been notified at high priority.</div>' : '');

  el.innerHTML = `
    <div class="phd-page">
      ${phdBanners}
      <div class="phd-hero-grid">
        <section class="phd-panel phd-panel--hero">
          <div class="phd-eyebrow">Home neuromodulation hub</div>
          <h1 class="phd-hero-title">${esc(heroTitle)}</h1>
          <p class="phd-hero-copy">${esc(heroCopy)}</p>
          <div class="phd-clinician-note">${alertCopy}</div>
          <div class="phd-kpi-grid">
            ${summaryMetrics.map((item) => `
              <article class="phd-kpi-card">
                <div class="phd-kpi-label">${esc(item.label)}</div>
                <div class="phd-kpi-value">${esc(item.value)}</div>
                <div class="phd-kpi-sub">${esc(item.sub)}</div>
              </article>
            `).join('')}
          </div>
        </section>
        <section class="phd-panel phd-panel--adherence">
          <div class="phd-panel-head">
            <div>
              <div class="phd-panel-title">Weekly adherence</div>
              <div class="phd-panel-sub">${assignment ? 'Your plan this week' : 'Your setup progress'}</div>
            </div>
            <button class="phd-icon-btn" onclick="window._phdRefresh()" aria-label="Refresh home devices">↻</button>
          </div>
          <div class="phd-adherence-body">
            <div class="phd-gauge" style="--pct:${adherencePct}">
              <div class="phd-gauge-inner">
                <strong>${adherencePct}%</strong>
                <span>${adherencePct >= 85 ? 'Strong overall' : adherencePct >= 60 ? 'Steady overall' : 'Needs support'}</span>
              </div>
            </div>
            <div class="phd-adherence-metrics">
              ${renderWeeklyBar('Sessions logged', sessionsLogged, sessionsExpected || Math.max(sessionsLogged, 1), 'is-teal')}
              ${renderWeeklyBar('Current streak', Math.min(streak, 7), 7, 'is-violet')}
              ${renderWeeklyBar('Health sources', connections.filter((row) => row.status === 'connected').length, supportedPlatforms.length, 'is-amber')}
            </div>
          </div>
        </section>
      </div>

      <section class="phd-block">
        <div class="phd-block-head">
          <div>
            <h2>Health platforms</h2>
            <p>Connect only the platforms your phone or wearable already supports.</p>
          </div>
          <span class="phd-block-meta">${connections.filter((row) => row.status === 'connected').length} linked</span>
        </div>
        <div class="phd-platform-grid">
          ${PLATFORM_DEFS.map((platform) => {
            const state = platformStatus(platform.id);
            const buttonLabel = !platform.supported ? 'Unavailable' : (state.connection ? 'Manage' : 'Connect');
            const syncCopy = state.connection?.last_sync_at
              ? 'Last sync ' + fmtRelative(state.connection.last_sync_at)
              : platform.supported
                ? 'No sync yet'
                : (platform.disabledReason || 'Not supported');
            return `
              <article class="phd-platform-card ${platform.supported ? '' : 'is-disabled'}" id="phd-platform-${platform.id}">
                <div class="phd-platform-main">
                  <div class="phd-platform-icon" style="color:${platform.accent};border-color:${platform.accent}33;background:${platform.accent}14">${platform.icon}</div>
                  <div class="phd-platform-copy">
                    <h3>${esc(platform.label)}</h3>
                    <p>${esc(platform.platform)}</p>
                  </div>
                  <span class="phd-inline-pill is-${state.tone}">${esc(state.pill)}</span>
                </div>
                <div class="phd-platform-sub">${esc(platform.description)}</div>
                <div class="phd-platform-sync">${esc(syncCopy)}</div>
                <button class="phd-platform-btn ${platform.supported && !state.connection ? 'is-primary' : ''}" ${platform.supported ? `onclick="window._phdTogglePlatform('${platform.id}')"` : 'disabled title="Not supported by the current backend connector set"'}>
                  ${esc(buttonLabel)}
                </button>
              </article>
            `;
          }).join('')}
        </div>
      </section>

      <div class="phd-main-grid">
        <div class="phd-main-col">
          <section class="phd-block">
            <div class="phd-block-head">
              <div>
                <h2>My devices</h2>
                <p>${assignment ? 'Assigned hardware and connected data sources in your current plan.' : 'Link a health platform or ask your clinician to assign a home device.'}</p>
              </div>
              <div class="phd-head-actions"><button class="phd-ghost-btn" onclick="window._phdRefresh()">Rescan</button></div>
            </div>
            <div class="phd-device-grid">
              ${homeDeviceCards.map((card) => `
                <article class="phd-device-card is-${card.tone}">
                  <div class="phd-device-topline">
                    <span class="phd-device-pill">${esc(card.pill)}</span>
                    <span class="phd-device-status">${renderStatusDot(card.tone)}${esc(card.status)}</span>
                  </div>
                  <h3>${esc(card.title)}</h3>
                  <p>${esc(card.subtitle)}</p>
                  <div class="phd-device-stats">
                    <div><span>${esc(card.primary)}</span></div>
                    <div><span>${esc(card.secondary)}</span></div>
                    <div><span>${esc(card.tertiary)}</span></div>
                  </div>
                  ${card.chips.length ? `<div class="phd-device-chips">${card.chips.map((chip) => `<span>${esc(chip)}</span>`).join('')}</div>` : '<div class="phd-device-spacer"></div>'}
                  <div class="phd-device-actions">
                    <button class="phd-card-btn" onclick="${card.secondaryAction}">${esc(card.secondaryLabel)}</button>
                    <button class="phd-card-btn is-primary" onclick="${card.primaryAction}">${esc(card.primaryLabel)}</button>
                  </div>
                </article>
              `).join('')}
            </div>
          </section>

          <section class="phd-block" id="phd-registered-devices" data-test="phd-registered-devices">
            <div class="phd-block-head">
              <div>
                <h2>My registered devices</h2>
                <p>Server-side registry. Audited on every action; decommissioning is one-way; mark-faulty raises a high-priority alert to your care team.</p>
              </div>
              <span class="phd-block-meta">${homeDevicesItems.length} on file</span>
            </div>
            <div class="phd-registered-list">
              ${homeDevicesItems.length === 0 ? `
                <div class="phd-empty-state" data-test="phd-empty-registry">
                  <div class="phd-empty-icon">⌁</div>
                  <strong>No home devices registered yet</strong>
                  <p>Register a device to log sessions and calibration runs against it. Your care team will see the same record.</p>
                  ${homeDevicesConsentActive ? '<button class="phd-card-btn is-primary" onclick="window._phdRegisterDevice()">Register a device</button>' : ''}
                </div>
              ` : homeDevicesItems.map((dev) => {
                const statusTone = dev.status === 'active' ? 'good' : dev.status === 'faulty' ? 'warn' : 'idle';
                const statusLabel = dev.status === 'active' ? 'Active' : dev.status === 'faulty' ? 'Faulty' : 'Decommissioned';
                const cal = dev.last_calibrated_at ? ('Calibrated ' + fmtRelative(dev.last_calibrated_at)) : 'No calibration on file';
                const isImmutable = dev.status === 'decommissioned';
                const isFaulty = dev.status === 'faulty';
                return `
                  <article class="phd-registered-card is-${statusTone}" data-device-id="${esc(dev.id)}">
                    <div class="phd-device-topline">
                      <span class="phd-device-pill">${esc(dev.device_category || 'device')}</span>
                      <span class="phd-device-status">${renderStatusDot(statusTone)}${esc(statusLabel)}</span>
                    </div>
                    <h3>${esc(dev.device_name)}</h3>
                    <p>${esc(dev.device_model || 'No model on file')}</p>
                    <div class="phd-device-stats">
                      <div><span>Serial: ${esc(dev.device_serial || '—')}</span></div>
                      <div><span>${esc(cal)}</span></div>
                      <div><span>Settings rev. ${dev.settings_revision || 0}</span></div>
                    </div>
                    ${isFaulty && dev.faulty_reason ? `<div class="phd-fault-reason"><strong>Fault:</strong> ${esc(dev.faulty_reason)}</div>` : ''}
                    ${isImmutable && dev.decommission_reason ? `<div class="phd-fault-reason"><strong>Decommissioned:</strong> ${esc(dev.decommission_reason)}</div>` : ''}
                    <div class="phd-device-actions">
                      <button class="phd-card-btn" onclick="window._phdLogDeviceSession('${esc(dev.id)}')" ${isImmutable || isFaulty || !homeDevicesConsentActive ? 'disabled' : ''}>Log session</button>
                      <button class="phd-card-btn" onclick="window._phdCalibrateDevice('${esc(dev.id)}')" ${isImmutable || !homeDevicesConsentActive ? 'disabled' : ''}>Calibrate</button>
                      <button class="phd-card-btn" onclick="window._phdMarkFaulty('${esc(dev.id)}')" ${isImmutable || !homeDevicesConsentActive ? 'disabled' : ''}>Mark faulty</button>
                      <button class="phd-card-btn" onclick="window._phdDecommission('${esc(dev.id)}')" ${isImmutable || !homeDevicesConsentActive ? 'disabled' : ''}>Decommission</button>
                      <button class="phd-card-btn" onclick="window._phdExportSessions('${esc(dev.id)}')">Export CSV</button>
                    </div>
                  </article>
                `;
              }).join('')}
            </div>
            ${homeDevicesItems.length > 0 && homeDevicesConsentActive ? '<div class="phd-registered-foot"><button class="phd-card-btn is-primary" onclick="window._phdRegisterDevice()">Register another device</button></div>' : ''}
          </section>

          <section class="phd-block" id="phd-compatible-devices">
            <div class="phd-block-head">
              <div>
                <h2>Compatible devices</h2>
                <p>Connect supported sources directly here, or send a structured request for clinician-approved home devices.</p>
              </div>
              <span class="phd-block-meta">${compatibleCatalog.length} supported</span>
            </div>
            <div class="phd-compatible-grid">
              ${compatibleCatalog.map((item) => {
                const actionLabel = item.action === 'manage' ? 'Manage'
                  : item.action === 'connect' ? 'Connect'
                  : item.action === 'disabled' ? 'Coming soon'
                  : assignment && item.name === assignment.device_name ? 'Open' : 'Request';
                const actionAttr = item.action === 'disabled'
                  ? 'disabled title="This integration is not available in the backend yet"'
                  : `onclick="window._phdCompatibleAction('${item.id}')"`
                ;
                return `
                  <article class="phd-compatible-card">
                    <div class="phd-compatible-meta">
                      <span class="phd-compatible-type">${esc(item.modality)}</span>
                      <span class="phd-compatible-price">${esc(item.price)}</span>
                    </div>
                    <h3>${esc(item.name)}</h3>
                    <div class="phd-compatible-tags">
                      <span>${esc(item.category)}</span>
                      ${item.liveLabel ? `<span>${esc(item.liveLabel)}</span>` : ''}
                    </div>
                    <p>${esc(item.desc)}</p>
                    <button class="phd-compatible-btn ${item.action === 'connect' || item.action === 'manage' ? 'is-primary' : ''}" ${actionAttr}>${esc(actionLabel)}</button>
                  </article>
                `;
              }).join('')}
            </div>
          </section>
        </div>

        <aside class="phd-side-col">
          <section class="phd-block">
            <div class="phd-block-head">
              <div>
                <h2>Recent activity</h2>
                <p>Latest syncs, logs, and reports visible to your care team.</p>
              </div>
              <button class="phd-ghost-btn" onclick="window._phdRefresh()">Refresh all</button>
            </div>
            <div class="phd-activity-list">
              ${recentActivity.length ? recentActivity.map((item) => `
                <button class="phd-activity-row" onclick="${item.open}">
                  <div class="phd-activity-icon is-${item.tone}">${item.title.charAt(0)}</div>
                  <div class="phd-activity-copy">
                    <strong>${esc(item.title)}</strong>
                    <span>${esc(item.meta)}</span>
                  </div>
                  <div class="phd-activity-side">
                    <em>${esc(item.amount)}</em>
                    <span class="phd-inline-pill is-${item.tone === 'warn' ? 'warn' : item.tone === 'good' ? 'good' : 'idle'}">${esc(item.tag)}</span>
                  </div>
                </button>
              `).join('') : `
                <div class="phd-empty-state">
                  <div class="phd-empty-icon">⌁</div>
                  <strong>No recent device activity</strong>
                  <p>Start by connecting a health platform or logging your first home session.</p>
                </div>
              `}
            </div>
          </section>

          <section class="phd-block">
            <div class="phd-block-head">
              <div>
                <h2>Care sync</h2>
                <p>What your team can actually review from this page.</p>
              </div>
            </div>
            <div class="phd-sync-card">
              <div class="phd-sync-list">
                <div>${renderStatusDot(assignment ? 'good' : 'idle')}Assigned device and instructions</div>
                <div>${renderStatusDot(sessions.length ? 'good' : 'idle')}Home-session logs and tolerance ratings</div>
                <div>${renderStatusDot(connections.length ? 'good' : 'idle')}Wearable summaries and last-sync status</div>
                <div>${renderStatusDot(events.length ? 'warn' : 'idle')}Side-effect and concern reports</div>
              </div>
              ${_vizWeekStrip(weeklyDays, { legend: false })}
              <button class="phd-sync-btn" onclick="window._navPatient('patient-messages')">Message care team</button>
            </div>
          </section>
        </aside>
      </div>
    </div>
  `;

  window._phdRefresh = () => pgPatientHomeDevices();
  window._phdJumpCatalog = () => {
    const target = document.getElementById('phd-compatible-devices');
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  window._phdStartSession = () => {
    if (!assignment) {
      emitToast('Ask your clinician to assign a home device first.', '#f5b74c');
      window._navPatient('patient-messages');
      return;
    }
    window._navPatient('pt-home-session-log');
  };
  window._phdOpenDeviceDetails = (targetId) => {
    if (targetId === 'assignment') {
      window._navPatient('pt-home-device');
      return;
    }
    const platformEl = document.getElementById('phd-platform-' + targetId);
    if (platformEl) {
      platformEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      platformEl.classList.add('is-flash');
      setTimeout(() => platformEl.classList.remove('is-flash'), 1400);
    } else {
      emitToast('Open Messages to ask your care team about this device.', '#7cc9ff');
      window._navPatient('patient-messages');
    }
  };
  window._phdTogglePlatform = async (sourceId) => {
    const platform = PLATFORM_DEFS.find((row) => row.id === sourceId);
    if (!platform || !platform.supported) {
      emitToast((platform && platform.disabledReason) || 'This platform is not available yet.', '#94a3b8');
      return;
    }
    const state = platformStatus(sourceId);
    try {
      if (state.connection) {
        if (window.confirm('Disconnect ' + platform.label + '? Existing records stay in your chart, but new syncs will stop.')) {
          await api.disconnectWearableSource(state.connection.id);
          emitToast(platform.label + ' disconnected.', '#7cc9ff');
        }
      } else {
        await api.connectWearableSource({ source: sourceId, display_name: platform.label, consent_given: true });
        emitToast(platform.label + ' connected.', 'var(--teal)');
      }
      await pgPatientHomeDevices();
    } catch (err) {
      emitToast(err?.message || 'Could not update this connection.', '#f87171');
    }
  };
  // ── Patient Home Devices launch-audit (2026-05-01) ─────────────────────────
  // Server-side registry actions. Each handler audits on success / failure
  // through the home_devices surface so a regulator can see exactly what
  // the patient did from this page. The audit ping is fire-and-forget —
  // we never let a network hiccup block the UI action.
  const _phdAudit = (event, deviceId, note) => {
    try {
      if (api.postHomeDevicesAuditEvent) {
        api.postHomeDevicesAuditEvent({ event, device_id: deviceId || null, note: note || null });
      }
    } catch (_) { /* audit must never block UI */ }
  };

  window._phdRegisterDevice = async () => {
    if (!homeDevicesConsentActive) {
      emitToast('Consent withdrawn — registering a device is paused.', '#f5b74c');
      return;
    }
    const name = (window.prompt('Device name (e.g. "Synaps One"):') || '').trim();
    if (!name) return;
    const category = (window.prompt('Device category (tdcs, tacs, tens, pbm, vagus, wearable, other):') || '').trim().toLowerCase() || 'other';
    const serial = (window.prompt('Serial number (optional):') || '').trim();
    try {
      const created = await api.homeDevicesRegister({
        device_name: name,
        device_category: category,
        device_serial: serial || null,
        settings: {},
      });
      _phdAudit('device_registered', created && created.id, 'category=' + category);
      emitToast('Device registered.', 'var(--teal)');
      await pgPatientHomeDevices();
    } catch (err) {
      emitToast(err && err.message ? err.message : 'Could not register the device.', '#f87171');
    }
  };

  window._phdLogDeviceSession = async (deviceId) => {
    if (!homeDevicesConsentActive) {
      emitToast('Consent withdrawn — session logging is paused.', '#f5b74c');
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    const dur = window.prompt('Session duration (minutes), 1-480:', '20');
    if (!dur) return;
    const tol = window.prompt('Tolerance rating (1-5):', '4');
    try {
      await api.homeDevicesLogSession(deviceId, {
        session_date: today,
        duration_minutes: Math.max(1, Math.min(480, Number(dur) || 20)),
        completed: true,
        tolerance_rating: tol ? Math.max(1, Math.min(5, Number(tol) || 4)) : null,
      });
      _phdAudit('session_logged', deviceId, 'duration=' + dur);
      emitToast('Session logged.', 'var(--teal)');
      await pgPatientHomeDevices();
    } catch (err) {
      emitToast(err && err.message ? err.message : 'Could not log this session.', '#f87171');
    }
  };

  window._phdCalibrateDevice = async (deviceId) => {
    if (!homeDevicesConsentActive) {
      emitToast('Consent withdrawn — calibration is paused.', '#f5b74c');
      return;
    }
    const result = (window.prompt('Calibration result (passed / failed / skipped):', 'passed') || 'passed').trim().toLowerCase();
    if (!['passed', 'failed', 'skipped'].includes(result)) {
      emitToast('Invalid calibration result.', '#f87171');
      return;
    }
    const notes = window.prompt('Calibration notes (optional):', '') || '';
    try {
      await api.homeDevicesCalibrate(deviceId, { result, notes: notes || null });
      _phdAudit('calibration_run', deviceId, 'result=' + result);
      emitToast('Calibration logged.', 'var(--teal)');
      await pgPatientHomeDevices();
    } catch (err) {
      emitToast(err && err.message ? err.message : 'Could not log calibration.', '#f87171');
    }
  };

  window._phdMarkFaulty = async (deviceId) => {
    if (!homeDevicesConsentActive) {
      emitToast('Consent withdrawn — flagging a device is paused.', '#f5b74c');
      return;
    }
    const reason = (window.prompt('What is wrong with the device? Your care team will be notified at high priority.') || '').trim();
    if (!reason) return;
    try {
      await api.homeDevicesMarkFaulty(deviceId, reason);
      _phdAudit('device_marked_faulty', deviceId, 'priority=high');
      emitToast('Device marked faulty. Your care team has been notified.', '#f5b74c');
      await pgPatientHomeDevices();
    } catch (err) {
      emitToast(err && err.message ? err.message : 'Could not flag this device.', '#f87171');
    }
  };

  window._phdDecommission = async (deviceId) => {
    if (!homeDevicesConsentActive) {
      emitToast('Consent withdrawn — decommissioning is paused.', '#f5b74c');
      return;
    }
    if (!window.confirm('Decommission this device? This is one-way — historical sessions remain readable but you cannot edit, calibrate, or log new sessions on it.')) return;
    const reason = (window.prompt('Reason for decommissioning:') || '').trim();
    if (!reason) return;
    try {
      await api.homeDevicesDecommission(deviceId, reason);
      _phdAudit('device_decommissioned', deviceId);
      emitToast('Device decommissioned.', '#94a3b8');
      await pgPatientHomeDevices();
    } catch (err) {
      emitToast(err && err.message ? err.message : 'Could not decommission this device.', '#f87171');
    }
  };

  window._phdExportSessions = (deviceId) => {
    _phdAudit('export', deviceId, 'format=csv');
    const path = '/api/v1/home-devices/devices/' + encodeURIComponent(deviceId) + '/sessions/export.csv';
    try { window.open(path, '_blank'); } catch (_) { window.location.href = path; }
  };

  window._phdCompatibleAction = async (deviceId) => {
    const item = compatibleCatalog.find((row) => row.id === deviceId);
    if (!item) return;
    if ((item.action === 'manage' || item.action === 'connect') && item.sourceId) {
      await window._phdTogglePlatform(item.sourceId);
      return;
    }
    if (assignment && item.name === assignment.device_name) {
      window._navPatient('pt-home-device');
      return;
    }
    try {
      await api.portalRequestHomeDevice({
        device_name: item.name,
        device_category: item.category || null,
        modality: item.modality || null,
        catalog_id: item.id,
        note: 'Requested from the Home Devices page.',
      });
      emitToast(item.name + ' request was submitted in the portal workflow. Care-team delivery timing is not confirmed from this page.', 'var(--teal)');
      await pgPatientHomeDevices();
    } catch (err) {
      emitToast(err?.message || ('Could not request ' + item.name + '.'), '#f87171');
    }
  };
}

// ── Home Device pages ─────────────────────────────────────────────────────────

// Shared HTML escaper for home-device pages
function _hdEsc(v) {
  if (v == null) return '';
  return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;');
}

// ── pgPatientHomeDevice ───────────────────────────────────────────────────────
export async function pgPatientHomeDevice() {
  setTopbar(t('patient.nav.home_device'));
  const el = document.getElementById('patient-content');
  if (!el) return;
  el.innerHTML = spinner();

  // Backend returns { assignment: {...} | null }. Unwrap so the empty state
  // fires honestly. 3s timeout per call so a hung Fly backend never wedges
  // the Home Device page on a spinner.
  const _timeout = (ms) => new Promise(r => setTimeout(() => r(null), ms));
  const _raceNull = (p) => Promise.race([
    Promise.resolve(p).catch(() => null),
    _timeout(3000),
  ]);
  let assignment = null;
  let adherence  = null;
  const [resHD, sumHD] = await Promise.all([
    _raceNull(api.portalGetHomeDevice()),
    _raceNull(api.portalHomeAdherenceSummary()),
  ]);
  if (resHD && typeof resHD === 'object' && 'assignment' in resHD) {
    assignment = resHD.assignment || null;
  } else {
    assignment = resHD || null;
  }
  adherence = (sumHD && typeof sumHD === 'object') ? (sumHD.adherence || null) : null;

  if (!assignment) {
    el.innerHTML = `
      <div class="pt-portal-empty" style="padding:60px 24px">
        <div class="pt-portal-empty-ico" aria-hidden="true" style="font-size:32px">⚡</div>
        <div class="pt-portal-empty-title">No Home Device Assigned</div>
        <div class="pt-portal-empty-body">A home device has not been assigned yet. Device details, schedule, and session logs will appear here after your portal workflow is updated.</div>
        <button class="btn btn-ghost btn-sm" style="margin-top:18px" onclick="window._navPatient('patient-messages')">Contact Your Care Team →</button>
      </div>`;
    return;
  }

  const deviceName   = _hdEsc(assignment.device_name || assignment.device_slug || 'Home Device');
  const category     = _hdEsc(assignment.device_category || assignment.modality_slug || '');
  const freqPerWeek  = assignment.session_frequency_per_week ?? assignment.frequency_per_week ?? null;
  const frequency    = _hdEsc(
    freqPerWeek != null
      ? `${freqPerWeek}x / week`
      : (assignment.prescribed_frequency || assignment.frequency || '')
  );
  const instructions = _hdEsc(assignment.instructions_text || assignment.instructions || assignment.notes || '');
  const startDate    = fmtDate(assignment.assigned_at || assignment.start_date || assignment.created_at);
  const endDate      = assignment.end_date ? fmtDate(assignment.end_date) : null;
  const totalSessions    = assignment.planned_total_sessions ?? assignment.total_sessions_prescribed ?? null;
  const completedSessions = adherence?.sessions_logged
    ?? assignment.sessions_completed
    ?? assignment.session_count
    ?? 0;
  const adherencePct = (adherence?.adherence_rate_pct != null)
    ? Math.min(100, Math.round(adherence.adherence_rate_pct))
    : ((totalSessions && completedSessions != null)
        ? Math.min(100, Math.round((completedSessions / totalSessions) * 100))
        : null);

  // Adherence ring SVG
  function adherenceRingSVG(pct) {
    if (pct == null) return '';
    const r = 36; const circ = 2 * Math.PI * r;
    const dash = (pct / 100) * circ;
    const color = pct >= 80 ? 'var(--teal)' : pct >= 50 ? 'var(--amber,#f59e0b)' : '#ff6b6b';
    return `<div style="position:relative;width:96px;height:96px;flex-shrink:0">
      <svg width="96" height="96" viewBox="0 0 96 96">
        <circle cx="48" cy="48" r="${r}" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="7"/>
        <circle cx="48" cy="48" r="${r}" fill="none" stroke="${color}" stroke-width="7"
          stroke-dasharray="${dash} ${circ - dash}" stroke-dashoffset="${circ / 4}"
          stroke-linecap="round" style="transition:stroke-dasharray 1s ease"/>
      </svg>
      <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
        <div style="font-size:18px;font-weight:700;color:${color}">${pct}%</div>
        <div style="font-size:9px;color:var(--text-tertiary);margin-top:1px">adherence</div>
      </div>
    </div>`;
  }

  el.innerHTML = `
    <!-- Device card -->
    <div class="card" style="margin-bottom:20px;border-color:var(--border-teal)">
      <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
        <h3>⚡ ${deviceName}</h3>
        <span class="pill pill-active" style="font-size:10.5px">Active</span>
      </div>
      <div class="card-body">
        <div class="g2">
          <div>
            ${category    ? `<div class="field-row"><span>Category</span><span>${category}</span></div>` : ''}
            ${frequency   ? `<div class="field-row"><span>Prescribed Frequency</span><span>${frequency}</span></div>` : ''}
            <div class="field-row"><span>Assigned</span><span>${_hdEsc(startDate)}</span></div>
            ${endDate     ? `<div class="field-row"><span>Target End</span><span>${_hdEsc(endDate)}</span></div>` : ''}
            ${totalSessions != null ? `<div class="field-row"><span>Sessions Prescribed</span><span>${totalSessions}</span></div>` : ''}
            <div class="field-row"><span>Sessions Completed</span><span>${completedSessions}</span></div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px">
            ${adherenceRingSVG(adherencePct)}
            ${adherencePct != null
              ? `<div style="font-size:11px;color:var(--text-tertiary);text-align:center">${completedSessions} of ${totalSessions} sessions</div>`
              : `<div style="font-size:12px;color:var(--text-tertiary);text-align:center">No target set</div>`}
          </div>
        </div>
        ${instructions ? `
        <div class="notice notice-info" style="margin-top:16px;font-size:12.5px;line-height:1.65">
          <strong>Instructions:</strong> ${instructions}
        </div>` : ''}
      </div>
    </div>

    <!-- CTA buttons -->
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:24px">
      <button class="btn btn-primary" style="flex:1;min-width:130px" onclick="window._navPatient('pt-home-session-log')">Log Session</button>
      <button class="btn btn-ghost"   style="flex:1;min-width:130px" onclick="window._navPatient('pt-adherence-events')">Report Issue</button>
      <button class="btn btn-ghost"   style="flex:1;min-width:130px" onclick="window._navPatient('pt-adherence-history')">View History</button>
    </div>

    <!-- Encouragement -->
    <div class="card" style="margin-bottom:20px;border-color:rgba(0,212,188,0.2);background:rgba(0,212,188,0.03)">
      <div class="card-body" style="padding:16px 20px">
        <div style="font-size:13px;font-weight:600;color:var(--teal);margin-bottom:6px">Keep going!</div>
        <div style="font-size:12.5px;color:var(--text-secondary);line-height:1.65">
          Consistent home device use is an important part of your treatment plan. Even short sessions as prescribed help your brain respond to therapy. Your care team can review synced session logs, and follow-up timing depends on portal workflow.
        </div>
      </div>
    </div>
  `;
}

// ── pgPatientHomeSessionLog ───────────────────────────────────────────────────
export async function pgPatientHomeSessionLog() {
  setTopbar('Log Home Session');
  const el = document.getElementById('patient-content');
  if (!el) return;
  el.innerHTML = spinner();

  // Check assignment so we can honestly tell the patient if no device is
  // assigned. Backend will 404 on POST /home-sessions with
  // no_active_assignment — surface it up front. 3s timeout per call so a
  // hung Fly backend never wedges the page on a spinner.
  const _timeout = (ms) => new Promise(r => setTimeout(() => r(null), ms));
  const _raceNull = (p) => Promise.race([
    Promise.resolve(p).catch(() => null),
    _timeout(3000),
  ]);
  const [resHD, rawSessions] = await Promise.all([
    _raceNull(api.portalGetHomeDevice()),
    _raceNull(api.portalListHomeSessions()),
  ]);
  const a = (resHD && typeof resHD === 'object' && 'assignment' in resHD) ? resHD.assignment : resHD;
  const hasAssignment = !!a;
  const sessions = Array.isArray(rawSessions) ? rawSessions : [];

  if (!hasAssignment) {
    el.innerHTML = `
      <div class="pt-portal-empty" style="padding:60px 24px">
        <div class="pt-portal-empty-ico" aria-hidden="true" style="font-size:32px">⚡</div>
        <div class="pt-portal-empty-title">No Active Home Device</div>
        <div class="pt-portal-empty-body">You cannot log a session yet — your care team has not assigned a home device. Session logs are linked to an active assignment.</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center;margin-top:18px">
          <button class="btn btn-ghost btn-sm" onclick="window._navPatient('pt-home-device')">Home Device →</button>
          <button class="btn btn-ghost btn-sm" onclick="window._navPatient('patient-messages')">Contact Care Team</button>
        </div>
      </div>`;
    return;
  }

  const todayStr = new Date().toISOString().slice(0, 10);

  // Tolerance button helper
  function tolButtons(name, selectedVal) {
    return [1,2,3,4,5].map(v => `
      <button type="button"
        id="${name}-${v}"
        class="pt-tol-btn${selectedVal === v ? ' selected' : ''}"
        style="width:38px;height:38px;border-radius:50%;border:2px solid var(--border);background:${selectedVal === v ? 'var(--teal)' : 'var(--surface)'};color:${selectedVal === v ? '#000' : 'var(--text-primary)'};font-weight:600;font-size:14px;cursor:pointer;transition:all .15s"
        onclick="window._hdTolPick('${name}', ${v})">${v}</button>
    `).join('');
  }

  el.innerHTML = `
    <!-- Session log form -->
    <div class="card" style="margin-bottom:24px">
      <div class="card-header"><h3>Log a Home Session</h3></div>
      <div class="card-body" style="padding:20px">
        <div class="form-group">
          <label class="form-label">Session Date</label>
          <input type="date" id="hsl-date" class="form-control" value="${todayStr}" max="${todayStr}">
        </div>
        <div class="form-group">
          <label class="form-label">Duration (minutes)</label>
          <input type="number" id="hsl-duration" class="form-control" min="1" max="480" placeholder="e.g. 30">
        </div>
        <div class="form-group">
          <label class="form-label">Tolerance (1 = very easy, 5 = very difficult)</label>
          <div style="display:flex;gap:8px;margin-top:6px" id="hsl-tol-wrap">
            ${tolButtons('hsl-tol', null)}
          </div>
          <input type="hidden" id="hsl-tolerance" value="">
        </div>
        <div class="form-group">
          <label class="form-label">Mood Before Session (1 = very low, 5 = very good)</label>
          <div style="display:flex;gap:8px;margin-top:6px" id="hsl-mood-before-wrap">
            ${tolButtons('hsl-mood-before', null)}
          </div>
          <input type="hidden" id="hsl-mood-before" value="">
        </div>
        <div class="form-group">
          <label class="form-label">Mood After Session (1 = very low, 5 = very good)</label>
          <div style="display:flex;gap:8px;margin-top:6px" id="hsl-mood-after-wrap">
            ${tolButtons('hsl-mood-after', null)}
          </div>
          <input type="hidden" id="hsl-mood-after" value="">
        </div>
        <div class="form-group">
          <label class="form-label">Side Effects (if any)</label>
          <textarea id="hsl-side-effects" class="form-control" rows="2" placeholder="e.g. mild headache, tingling, none"></textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Notes</label>
          <textarea id="hsl-notes" class="form-control" rows="2" placeholder="Any other observations…"></textarea>
        </div>
        <div class="form-group" style="display:flex;align-items:center;gap:10px">
          <input type="checkbox" id="hsl-completed" checked style="width:16px;height:16px;accent-color:var(--teal);cursor:pointer">
          <label for="hsl-completed" style="font-size:13px;font-weight:500;color:var(--text-primary);cursor:pointer">Session completed as prescribed</label>
        </div>
        <div id="hsl-status" style="display:none;margin-bottom:10px;font-size:13px"></div>
        <button class="btn btn-primary" style="width:100%;padding:11px" onclick="window._hslSubmit()">Save Session Log →</button>
      </div>
    </div>

    <!-- Past sessions list -->
    <div class="card" style="margin-bottom:20px">
      <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
        <h3>Session History</h3>
        <span style="font-size:12px;color:var(--text-tertiary)">${sessions.length} session${sessions.length !== 1 ? 's' : ''} logged</span>
      </div>
      <div id="hsl-history-list" style="padding:0 0 4px">
        ${sessions.length === 0
          ? `<div style="padding:24px;text-align:center;color:var(--text-tertiary);font-size:13px">No sessions logged yet. Use the form above to add your first session.</div>`
          : sessions.slice().sort((a,b) => new Date(b.session_date||b.created_at||0)-new Date(a.session_date||a.created_at||0)).map(s => {
              const tol  = s.tolerance_rating != null ? `Tol: ${_hdEsc(String(s.tolerance_rating))}` : '';
              const dur  = s.duration_minutes ? `${s.duration_minutes} min` : '';
              const done = s.completed !== false;
              return `<div style="display:flex;align-items:center;gap:12px;padding:12px 18px;border-bottom:1px solid var(--border)">
                <span style="font-size:14px;color:${done ? 'var(--teal)' : 'var(--text-tertiary)'}">${done ? '✓' : '○'}</span>
                <div style="flex:1">
                  <div style="font-size:13px;font-weight:500;color:var(--text-primary)">${fmtDate(s.session_date||s.created_at)}</div>
                  <div style="font-size:11.5px;color:var(--text-secondary);margin-top:2px">${[dur, tol].filter(Boolean).join(' · ') || 'No details'}</div>
                  ${(s.side_effects_during || s.side_effects) ? `<div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">${_hdEsc(s.side_effects_during || s.side_effects)}</div>` : ''}
                </div>
                <span style="font-size:10px;padding:2px 8px;border-radius:99px;background:${done ? 'rgba(0,212,188,0.1)' : 'rgba(148,163,184,0.1)'};color:${done ? 'var(--teal)' : 'var(--text-tertiary)'}">${done ? 'Done' : 'Partial'}</span>
              </div>`;
            }).join('')}
      </div>
    </div>
  `;

  // Tolerance/mood picker state
  const _hdSelections = {};

  window._hdTolPick = function(name, val) {
    _hdSelections[name] = val;
    // Update hidden input
    const hidden = document.getElementById(name);
    if (hidden) hidden.value = String(val);
    // Update button styles
    [1,2,3,4,5].forEach(v => {
      const btn = document.getElementById(`${name}-${v}`);
      if (!btn) return;
      const sel = v === val;
      btn.style.background = sel ? 'var(--teal)' : 'var(--surface)';
      btn.style.color = sel ? '#000' : 'var(--text-primary)';
      btn.style.borderColor = sel ? 'var(--teal)' : 'var(--border)';
    });
  };

  window._hslSubmit = async function() {
    const dateEl       = document.getElementById('hsl-date');
    const durationEl   = document.getElementById('hsl-duration');
    const tolEl        = document.getElementById('hsl-tolerance');
    const moodBeforeEl = document.getElementById('hsl-mood-before');
    const moodAfterEl  = document.getElementById('hsl-mood-after');
    const sideEl       = document.getElementById('hsl-side-effects');
    const notesEl      = document.getElementById('hsl-notes');
    const completedEl  = document.getElementById('hsl-completed');
    const statusEl     = document.getElementById('hsl-status');

    const sessionDate = dateEl?.value;
    if (!sessionDate) {
      if (statusEl) { statusEl.style.display=''; statusEl.style.color='#ff6b6b'; statusEl.textContent='Please select a session date.'; }
      return;
    }

    const payload = {
      session_date:     sessionDate,
      duration_minutes: durationEl?.value ? parseInt(durationEl.value, 10) : null,
      tolerance_rating: tolEl?.value ? parseInt(tolEl.value, 10) : null,
      mood_before:      moodBeforeEl?.value ? parseInt(moodBeforeEl.value, 10) : null,
      mood_after:       moodAfterEl?.value ? parseInt(moodAfterEl.value, 10) : null,
      side_effects_during: sideEl?.value?.trim() || null,
      notes:            notesEl?.value?.trim() || null,
      completed:        completedEl?.checked !== false,
    };

    const btn = el.querySelector('button.btn-primary[onclick*="_hslSubmit"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    if (statusEl) statusEl.style.display = 'none';

    try {
      await api.portalLogHomeSession(payload);
      if (statusEl) {
        statusEl.style.display='';
        statusEl.style.color='var(--teal)';
        statusEl.textContent='Session logged successfully!';
      }
      if (btn) { btn.disabled = false; btn.textContent = 'Save Session Log →'; }
      // Refresh the page to show updated history
      setTimeout(() => pgPatientHomeSessionLog(), 800);
    } catch (err) {
      if (statusEl) {
        statusEl.style.display='';
        statusEl.style.color='#ff6b6b';
        statusEl.textContent='Could not save session: ' + (err?.message || 'Unknown error');
      }
      if (btn) { btn.disabled = false; btn.textContent = 'Save Session Log →'; }
    }
  };
}

