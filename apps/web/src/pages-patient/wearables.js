// pgPatientWearables — Devices & Wearables hub. Extracted from
// `pages-patient.js` on 2026-05-02 as part of the file-split refactor (see
// `pages-patient/_shared.js`). NO behavioural change: code below is the
// verbatim wearables block from the original file, with imports rewired.
import { api } from '../api.js';
import { currentUser } from '../auth.js';
import { EVIDENCE_TOTAL_PAPERS } from '../evidence-dataset.js';
import { t } from '../i18n.js';
import { setTopbar, spinner, fmtRelative, _vizWeekStrip, _vizTrafficLight } from './_shared.js';

// ── Devices & Wearables ───────────────────────────────────────────────────────
export async function pgPatientWearables() {
  setTopbar('Devices & Wearables');
  const user = currentUser;
  const uid  = user?.patient_id || user?.id;
  const el   = document.getElementById('patient-content');
  el.innerHTML = spinner();

  // ── Health source definitions ─────────────────────────────────────────────
  const HEALTH_SOURCES = [
    {
      id: 'apple_health', label: 'Apple Health', platform: 'iPhone / iOS',
      icon: '◌', accentVar: '--teal',
      dataUsed: ['Sleep', 'Heart rate', 'HRV', 'Steps', 'Activity'],
      connectNote: 'Opens Apple Health permissions on your iPhone.',
    },
    {
      id: 'android_health', label: 'Android Health Connect', platform: 'Android',
      icon: '◌', accentVar: '--green',
      dataUsed: ['Sleep', 'Heart rate', 'Steps', 'Activity'],
      connectNote: 'Opens Health Connect on your Android phone.',
    },
    // Generic "Smart Watch" entry intentionally omitted — the backend only
    // accepts the four canonical sources (_VALID_SOURCES in
    // patient_portal_router.py). Apple Watch / Wear OS users sync via
    // Apple Health or Android Health Connect above; a dedicated
    // "smartwatch" source would 422 on connect.
    {
      id: 'oura', label: 'Oura Ring', platform: 'iOS / Android',
      icon: '◌', accentVar: '--violet',
      dataUsed: ['Sleep stages', 'HRV', 'Resting heart rate', 'Readiness'],
      connectNote: 'Authorise via Oura API — no extra app needed.',
    },
    {
      id: 'fitbit', label: 'Smart Band / Fitbit', platform: 'iOS / Android',
      icon: '◌', accentVar: '--amber',
      dataUsed: ['Sleep', 'Heart rate', 'Steps', 'SpO₂'],
      connectNote: 'Authorise via Fitbit account.',
    },
  ];

  // ── Home therapy device definitions ──────────────────────────────────────
  const HOME_THERAPY_DEVICES = [
    {
      id: 'tdcs',
      label: 'Home tDCS Device',
      category: 'Transcranial Direct Current Stimulation',
      icon: '⊕', accentVar: '--teal',
      what: 'A small device that delivers a very low, safe current to specific areas of the scalp. Used between clinic sessions to maintain treatment benefits.',
      whyMatters: 'Home sessions can extend treatment effects and reduce the number of clinic visits needed.',
      dataShared: ['Session completed (yes/no)', 'Date and time', 'Side effects you report'],
      dataNotShared: ['Current settings (set by clinician only)', 'Your location'],
      troubleshoot: ['Check electrode contacts are moist before use.', 'If you feel sharp discomfort, stop and contact your clinic.', 'Device not powering on? Check the battery or charger.'],
      contactClinic: "Unusual discomfort, tingling that doesn't fade after 5 minutes, or skin irritation.",
    },
    {
      id: 'pbm',
      label: 'Photobiomodulation (PBM)',
      category: 'Near-Infrared / Red Light Therapy',
      icon: '◎', accentVar: '--amber',
      what: 'A helmet or headband that uses near-infrared light to gently stimulate brain metabolism and neuroplasticity.',
      whyMatters: 'PBM supports the effects of clinic-based neuromodulation and improves cognitive energy.',
      dataShared: ['Session completed', 'Date and time', 'How you felt after the session'],
      dataNotShared: ['Light intensity settings', 'Your location'],
      troubleshoot: ['Position the device correctly before starting.', 'Avoid direct eye exposure to the light.', 'If the device feels hot, stop and let it cool.'],
      contactClinic: 'Headaches, visual disturbances, or unusual skin sensitivity.',
    },
    {
      id: 'vns',
      label: 'Vagus Nerve Stimulator (VNS)',
      category: 'Non-Invasive Vagal Stimulation',
      icon: '∿', accentVar: '--blue',
      what: 'A handheld device placed on the neck that delivers gentle pulses to the vagus nerve, supporting mood regulation and stress resilience.',
      whyMatters: 'The vagus nerve connects your brain and body. Stimulating it helps regulate the stress response and supports depression treatment.',
      dataShared: ['Session completed', 'Date and time', 'Side effects reported'],
      dataNotShared: ['Pulse parameters', 'Your location'],
      troubleshoot: ['Ensure the gel pad is correctly applied.', 'If you feel dizziness, reduce session duration.', 'App not connecting? Restart Bluetooth.'],
      contactClinic: 'Persistent neck discomfort, voice changes, or dizziness that does not resolve in a few minutes.',
    },
    {
      id: 'ces',
      label: 'Cranial Electrotherapy Stimulation (CES)',
      category: 'Cranial Electrotherapy',
      icon: '⌁', accentVar: '--violet',
      what: 'A clip-on device worn on the earlobes delivering a very low alternating current to promote relaxation, reduce anxiety, and improve sleep.',
      whyMatters: 'CES supports mood and sleep between clinic sessions. Non-invasive and gentle.',
      dataShared: ['Session completed', 'Date and time', 'Sleep quality after night use'],
      dataNotShared: ['Frequency settings', 'Your location'],
      troubleshoot: ['Ensure ear clips are properly positioned.', 'If you feel contact discomfort, check for skin irritation.', 'Start at the lowest comfortable intensity.'],
      contactClinic: 'Unusual sensations, persistent skin irritation, or dizziness.',
    },
  ];

  // ── XSS helper ───────────────────────────────────────────────────────────
  function esc(v) {
    if (v == null) return '';
    return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;');
  }

  // ── Local toast (the clinician-intake showToast is out of scope here) ───
  // Without this, _pdwConnect / _pdwSaveSession / _pdwReportIssue would
  // throw ReferenceError on their first use and silently break the page.
  function showToast(msg, color) {
    color = color || 'var(--teal)';
    const toastEl = document.createElement('div');
    toastEl.textContent = msg;
    toastEl.style.cssText =
      'position:fixed;bottom:24px;right:24px;z-index:9999;background:' + color +
      ';color:white;padding:10px 20px;border-radius:8px;font-size:.875rem;font-weight:500;' +
      'box-shadow:0 4px 12px rgba(0,0,0,.25);pointer-events:none';
    document.body.appendChild(toastEl);
    setTimeout(() => toastEl.remove(), 2800);
  }

  // ── Fetch API data ────────────────────────────────────────────────────────
  // 3s timeout so a hung Fly backend can never wedge Devices & Wearables on
  // a spinner. On timeout each value is null and we fall through to the
  // local/demo overlays below.
  const _timeout = (ms) => new Promise(r => setTimeout(() => r(null), ms));
  const _raceNull = (p) => Promise.race([
    Promise.resolve(p).catch(() => null),
    _timeout(3000),
  ]);
  // ── Patient Wearables launch-audit (2026-05-01) ──────────────────────────
  // EIGHTH and final patient-facing launch-audit surface. We read both the
  // legacy patient-portal connection list (already wired to real DB) AND
  // the new audited devices/summary endpoints so the page can render the
  // launch-audit banners (DEMO / consent-revoked) plus pending-anomaly
  // counts. The legacy reads stay so existing UI keeps rendering during
  // the rollout — the launch-audit reads layer the audit + IDOR guarantees
  // on top.
  const [wearableData, _summaryData, homeDeviceData, pwDevicesResp, pwSummaryResp] = await Promise.all([
    _raceNull(api.patientPortalWearables()),
    _raceNull(api.patientPortalWearableSummary(7)),
    // Real home-device assignment from /api/v1/patient-portal/home-device.
    // Used by _pdwSaveSession below to decide whether it can POST the
    // log to the live backend (requires an active assignment) or must
    // fall back to local-only storage and an honest "saved locally" toast.
    _raceNull(api.portalGetHomeDevice ? api.portalGetHomeDevice() : null),
    _raceNull(api.patientWearablesDevices ? api.patientWearablesDevices() : null),
    _raceNull(api.patientWearablesSummary ? api.patientWearablesSummary() : null),
  ]);

  const connections  = wearableData?.connections   || [];
  const recentAlerts = wearableData?.recent_alerts || [];
  const activeHomeAssignment = homeDeviceData?.assignment || null;
  // Launch-audit signals.
  const pwIsDemo = !!(pwDevicesResp && pwDevicesResp.is_demo);
  const pwConsentActive = pwDevicesResp ? !!pwDevicesResp.consent_active : true;
  const pwPendingAnomalies = (pwSummaryResp && pwSummaryResp.pending_anomalies) || 0;
  const pwAuditedDevices = (pwDevicesResp && pwDevicesResp.items) || [];
  // Map source → audited-device row so the per-card "Sync now" / per-card
  // disconnect can target the audited connection_id (a UUID) rather than
  // the legacy /patient-portal/wearable-connect/{id} flow.
  const pwBySource = {};
  for (const d of pwAuditedDevices) { if (d && d.source) pwBySource[d.source] = d; }
  // Mount-time view audit ping. Best-effort — the helper already swallows
  // failures so a wedged audit endpoint never breaks the page.
  if (api.postPatientWearablesAuditEvent) {
    api.postPatientWearablesAuditEvent({
      event: 'view',
      note: 'patient mounted Wearables page',
      using_demo_data: pwIsDemo,
    });
  }
  if (pwIsDemo && api.postPatientWearablesAuditEvent) {
    api.postPatientWearablesAuditEvent({ event: 'demo_banner_shown', using_demo_data: true });
  }
  if (!pwConsentActive && api.postPatientWearablesAuditEvent) {
    api.postPatientWearablesAuditEvent({ event: 'consent_banner_shown' });
  }

  // ── Evidence intelligence bridge (biometrics → 87k corpus) ─────────────────
  let wearEvidenceBlock = '';
  if (api.biometricsEvidence && api.biometricsCorrelations && api.biometricsFeatures) {
    try {
      const [corr, feat] = await Promise.all([
        _raceNull(api.biometricsCorrelations({ days: 90 })),
        _raceNull(api.biometricsFeatures({ days: 90 })),
      ]);
      const hasMatrix = corr && corr.matrix && Object.keys(corr.matrix).length > 0;
      if (corr && feat && hasMatrix) {
        const ev = await _raceNull(
          api.biometricsEvidence({
            evidence_target: 'stress_load',
            context_type: 'biomarker',
            max_results: 5,
            correlation_snapshot: corr,
            features_snapshot: feat,
          })
        );
        if (ev && Array.isArray(ev.supporting_papers) && ev.supporting_papers.length) {
          const corpus = ev.provenance && ev.provenance.corpus ? String(ev.provenance.corpus) : '';
          const papers = ev.supporting_papers
            .slice(0, 5)
            .map(
              (p) => `
            <div class="pdw-ev-paper">
              <div class="pdw-ev-title">${esc(p.title)}</div>
              <div class="pdw-ev-meta">${esc([p.journal, p.year].filter(Boolean).join(' · '))}</div>
              <p class="pdw-ev-snippet">${esc((p.abstract_snippet || p.relevance_note || '').slice(0, 280))}${(p.abstract_snippet || '').length > 280 ? '…' : ''}</p>
              ${p.url ? `<a class="pdw-ev-link" href="${esc(p.url)}" target="_blank" rel="noreferrer">View source</a>` : ''}
            </div>`
            )
            .join('');
          const summ = esc((ev.literature_summary || '').slice(0, 500));
          const caution = esc(ev.recommended_caution || '');
          wearEvidenceBlock = `
            <div class="pdw-evidence-inner">
              ${summ ? `<p class="pdw-ev-lead">${summ}${(ev.literature_summary || '').length > 500 ? '…' : ''}</p>` : ''}
              ${corpus ? `<p class="pdw-ev-corpus">Corpus: <span class="mono">${esc(corpus)}</span></p>` : ''}
              <div class="pdw-ev-papers">${papers}</div>
              <p class="pdw-ev-foot">${caution}</p>
            </div>`;
        }
      }
    } catch (_evErr) {
      wearEvidenceBlock = '';
    }
  }
  const wearEvidenceFallback = `
    <div class="pdw-evidence-fallback">
      <p><strong>Research library.</strong> DeepSynaps indexes on the order of <strong>${EVIDENCE_TOTAL_PAPERS.toLocaleString()}</strong> peer-reviewed works for clinical decision support (multi-source ingest including PubMed and OpenAlex). Consumer wearable metrics are <em>associational</em> — open the hub below for cited papers on sleep, HRV, and activity.</p>
      <button type="button" class="btn btn-ghost btn-sm" onclick="window._nav('research-evidence')">Open Research Evidence (${EVIDENCE_TOTAL_PAPERS.toLocaleString()} papers)</button>
    </div>`;

  // ── LocalStorage: home device assignments + session log ───────────────────
  const homeDevKey  = 'ds_home_devices_'  + (uid || 'demo');
  const homeSessKey = 'ds_home_sessions_' + (uid || 'demo');
  let homeDevices  = [];
  let homeSessions = [];
  try { homeDevices  = JSON.parse(localStorage.getItem(homeDevKey)  || '[]'); } catch (_e) {}
  try { homeSessions = JSON.parse(localStorage.getItem(homeSessKey) || '[]'); } catch (_e) {}

  // Demo seed: assign tDCS if nothing stored
  if (!homeDevices.length) {
    homeDevices = [{
      deviceId: 'tdcs', assigned: true, prescribedFreq: 'Daily (Mon–Fri)',
      status: 'active', monitoredByClinician: true,
      lastSession: new Date(Date.now() - 86400000).toISOString(),
      _isDemoData: true,
    }];
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function connFor(id)    { return connections.find(c => c.source === id) || null; }
  function homeDevFor(id) { return homeDevices.find(d => d.deviceId === id) || null; }
  function lastSessFor(id) {
    const all = homeSessions.filter(s => s.deviceId === id);
    return all.length ? all[all.length - 1] : null;
  }

  function syncStatus(conn) {
    if (!conn || conn.status !== 'connected') return 'disconnected';
    if (!conn.last_sync_at) return 'pending';
    const hrs = (Date.now() - new Date(conn.last_sync_at).getTime()) / 3600000;
    return hrs <= 24 ? 'synced' : 'stale';
  }

  function statusPill(s, label) {
    const cfg = {
      synced:       { bg:'rgba(34,197,94,0.12)',  color:'var(--green,#22c55e)',   lbl:label||'Synced' },
      stale:        { bg:'rgba(245,158,11,0.12)', color:'var(--amber,#f59e0b)',  lbl:label||'Sync overdue' },
      disconnected: { bg:'rgba(255,107,107,0.1)', color:'var(--red,#ef4444)',    lbl:label||'Not connected' },
      pending:      { bg:'rgba(245,158,11,0.12)', color:'var(--amber,#f59e0b)',  lbl:label||'Pending' },
      active:       { bg:'rgba(0,212,188,0.12)',  color:'var(--teal,#00d4bc)',   lbl:label||'Active' },
      assigned:     { bg:'rgba(59,130,246,0.12)', color:'var(--blue,#3b82f6)',   lbl:label||'Assigned' },
    };
    const c = cfg[s] || cfg.disconnected;
    return `<span class="pdw-pill" style="background:${c.bg};color:${c.color}"><span class="pdw-pill-dot" style="background:${c.color}"></span>${c.lbl}</span>`;
  }

  // ── Summary counts ────────────────────────────────────────────────────────
  const connectedCount = connections.filter(c => c.status === 'connected').length;
  const assignedCount  = homeDevices.filter(d => d.assigned).length;
  const lastSyncMs     = connections.filter(c => c.last_sync_at)
    .map(c => new Date(c.last_sync_at).getTime()).sort((a,b) => b-a)[0] || null;

  // ── Biometric snapshot ────────────────────────────────────────────────────
  // Read order: real audited devices > legacy localStorage cache > demo.
  // The hardcoded fallback is preserved for offline / pre-consent demo
  // rendering only — it is ALWAYS labelled `_isDemoData=true` so the UI
  // can disclose it as example data, never AI-fabricated insight. When
  // the new audited summary endpoint reports is_demo=false but the
  // patient has no real wearable data, we honestly show the empty state
  // ("No biometrics yet — connect a device above") rather than fake
  // numbers.
  let bio = null;
  try { bio = JSON.parse(localStorage.getItem('ds_wearable_summary') || 'null'); } catch (_e) {}
  const pwHasRealData = pwAuditedDevices.some(d => !!d.last_observed_at);
  if (!bio) {
    if (pwIsDemo || !pwHasRealData) {
      // Demo or empty real data — keep the honest example-data fallback.
      bio = { _isDemoData: true, hrv: '42 ms', sleep: '7h 12m', steps: '6,840', rhr: '64 bpm' };
    } else {
      bio = { _isDemoData: false, hrv: '—', sleep: '—', steps: '—', rhr: '—' };
    }
  }

  // Biometric status classification
  function _bioStatus(type, valStr) {
    const n = parseFloat(String(valStr).replace(/[^\d.]/g, ''));
    if (isNaN(n)) return 'grey';
    if (type === 'sleep') return n >= 7 ? 'green' : n >= 5.5 ? 'amber' : 'red';
    if (type === 'hrv')   return n >= 50 ? 'green' : n >= 30  ? 'amber' : 'red';
    if (type === 'rhr')   return n <= 65 ? 'green' : n <= 80  ? 'amber' : 'red';
    if (type === 'steps') return n >= 8000 ? 'green' : n >= 4000 ? 'amber' : 'red';
    return 'grey';
  }
  function _bioLabel(type, status) {
    const ranges = {
      sleep: { green: '7–9 hrs recommended', amber: 'Slightly low', red: 'Below target' },
      hrv:   { green: 'Good recovery', amber: 'Moderate', red: 'Low — check in' },
      rhr:   { green: 'Healthy range', amber: 'Moderate', red: 'Elevated' },
      steps: { green: 'Active day', amber: 'Moderate activity', red: 'Low activity' },
    };
    return (ranges[type] || {})[status] || '';
  }

  // Build 7-day biometric strip from localStorage check-in history
  const _bioWeekDays = (() => {
    const days = [];
    const todayBio = new Date().toISOString().slice(0, 10);
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const ds = d.toISOString().slice(0, 10);
      const hasCk = !!localStorage.getItem('ds_checkin_' + ds);
      const isFut = ds > todayBio;
      days.push({
        dayName: d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 2),
        status: isFut ? 'future' : hasCk ? 'done' : 'missed',
        isToday: ds === todayBio,
      });
    }
    return days;
  })();

  // ── Render ────────────────────────────────────────────────────────────────
  el.innerHTML = `
<div class="pdw-wrap">

  <!-- ① CONNECTION SUMMARY BAR -->
  <div class="pdw-summary-bar">
    <div class="pdw-stat">
      <div class="pdw-stat-icon">◌</div>
      <div class="pdw-stat-val">${connectedCount}</div>
      <div class="pdw-stat-lbl">Health source${connectedCount !== 1 ? 's' : ''} connected</div>
    </div>
    <div class="pdw-stat-divider"></div>
    <div class="pdw-stat">
      <div class="pdw-stat-icon">⊕</div>
      <div class="pdw-stat-val">${assignedCount}</div>
      <div class="pdw-stat-lbl">Home therapy device${assignedCount !== 1 ? 's' : ''}</div>
    </div>
    <div class="pdw-stat-divider"></div>
    <div class="pdw-stat">
      <div class="pdw-stat-icon">↻</div>
      <div class="pdw-stat-val">${lastSyncMs ? fmtRelative(new Date(lastSyncMs).toISOString()) : 'Never'}</div>
      <div class="pdw-stat-lbl">Last sync</div>
    </div>
    <div class="pdw-stat-divider"></div>
    <div class="pdw-stat">
      <div class="pdw-stat-icon ${connectedCount > 0 ? 'pdw-stat-ok' : 'pdw-stat-off'}">◎</div>
      <div class="pdw-stat-val ${connectedCount > 0 ? 'pdw-stat-ok' : 'pdw-stat-off'}">${connectedCount > 0 ? 'Active' : 'Inactive'}</div>
      <div class="pdw-stat-lbl">Monitoring</div>
    </div>
  </div>

  ${pwIsDemo ? `<div class="notice notice-info" style="font-size:12px;background:rgba(245,158,11,0.12);color:var(--amber,#f59e0b);border-left:3px solid var(--amber,#f59e0b);padding:8px 12px;border-radius:6px;margin-bottom:10px"><strong>Demo mode:</strong> The wearables and observations on this page are example data. Exports are prefixed <code>DEMO-</code> and not regulator-submittable.</div>` : ''}
  ${!pwConsentActive ? `<div class="notice notice-warn" style="font-size:12px;background:rgba(239,68,68,0.12);color:var(--red,#ef4444);border-left:3px solid var(--red,#ef4444);padding:8px 12px;border-radius:6px;margin-bottom:10px"><strong>Consent withdrawn:</strong> You are in read-only mode. Existing observations remain visible but no new syncs or disconnects can be triggered until consent is reinstated.</div>` : ''}
  ${pwPendingAnomalies > 0 ? `<div class="notice notice-warn" style="font-size:12px;background:rgba(239,68,68,0.12);color:var(--red,#ef4444);border-left:3px solid var(--red,#ef4444);padding:8px 12px;border-radius:6px;margin-bottom:10px"><strong>${pwPendingAnomalies} anomaly alert${pwPendingAnomalies===1?'':'s'} pending clinician review.</strong> Your care team has been notified — you do not need to take further action.</div>` : ''}
  ${recentAlerts.length ? `<div class="notice notice-warn" style="font-size:12px"><strong>Sync note:</strong> ${esc(recentAlerts[0].detail||'A recent sync issue was detected.')}</div>` : ''}

  <!-- ② HEALTH SOURCES -->
  <div class="pdw-section">
    <div class="pdw-section-header">
      <h3 class="pdw-section-title"><span class="pdw-title-icon">◌</span>Health sources</h3>
      <span class="pdw-section-sub">Connect your phone or wearable to share health data with your care team</span>
    </div>
    <div class="pdw-source-grid">
      ${HEALTH_SOURCES.map(src => {
        const conn    = connFor(src.id);
        const status  = syncStatus(conn);
        const isConn  = status === 'synced' || status === 'stale' || status === 'pending';
        const accent  = `var(${src.accentVar},#00d4bc)`;
        const syncStr = conn?.last_sync_at ? `Last sync ${fmtRelative(conn.last_sync_at)}` : 'Never synced';
        return `
        <div class="pdw-source-card pdw-source-card--${status}" style="${isConn ? `--src-accent:${accent}` : ''}">
          <div class="pdw-source-status-bar" style="background:${isConn ? accent : 'rgba(255,255,255,0.06)'}"></div>
          <div class="pdw-source-inner">
            <div class="pdw-source-top">
              <div class="pdw-source-icon-wrap" style="background:${accent}18;border-color:${accent}30">
                <span class="pdw-source-icon" style="color:${accent}">${src.icon}</span>
              </div>
              <div class="pdw-source-meta">
                <div class="pdw-source-name">${esc(src.label)}</div>
                <div class="pdw-source-platform">${esc(src.platform)}</div>
              </div>
              ${statusPill(status)}
            </div>
            <div class="pdw-source-sync">${isConn ? syncStr : 'Tap Connect to start syncing'}</div>
            <div class="pdw-data-used">
              <span class="pdw-data-label">Data synced:</span>
              ${src.dataUsed.map(d=>`<span class="pdw-data-chip">${esc(d)}</span>`).join('')}
            </div>
            ${!isConn ? `<div class="pdw-source-note">${esc(src.connectNote)}</div>` : ''}
            <div class="pdw-source-actions">
              ${isConn
                ? `<button class="pdw-btn-manage"    onclick="window._pdwManageSource('${src.id}','${conn?.id||''}')" ${pwConsentActive?'':'disabled title="Read-only — consent withdrawn"'}>Manage</button>
                   <button class="pdw-btn-reconnect" onclick="window._pdwReconnect('${src.id}')" ${pwConsentActive?'':'disabled title="Read-only — consent withdrawn"'}>Reconnect</button>
                   ${pwBySource[src.id] ? `<button class="pdw-btn-reconnect" onclick="window._pdwSyncNow('${pwBySource[src.id].id}')" ${pwConsentActive?'':'disabled title="Read-only — consent withdrawn"'}>Sync now</button>
                   <button class="pdw-btn-reconnect" onclick="window._pdwExportObs('${pwBySource[src.id].id}')">Export CSV</button>` : ''}`
                : `<button class="pdw-btn-connect"   onclick="window._pdwConnect('${src.id}')" ${pwConsentActive?'':'disabled title="Read-only — consent withdrawn"'}>Connect</button>`}
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>
  </div>

  <!-- ③ HOME THERAPY DEVICES -->
  <div class="pdw-section">
    <div class="pdw-section-header">
      <h3 class="pdw-section-title"><span class="pdw-title-icon">⊕</span>Home therapy devices</h3>
      <span class="pdw-section-sub">Devices assigned by your clinic for use between sessions</span>
    </div>
    <div class="pdw-device-list">
      ${HOME_THERAPY_DEVICES.map(dev => {
        const asgn     = homeDevFor(dev.id);
        const lastSess = lastSessFor(dev.id) || (asgn?.lastSession ? { date: asgn.lastSession } : null);
        const devSt    = asgn?.status || 'unassigned';
        const accent   = `var(${dev.accentVar},#00d4bc)`;
        const assigned = asgn?.assigned;
        return `
        <div class="pdw-device-card ${assigned ? 'pdw-device-card--assigned' : ''}" style="${assigned ? `border-left:3px solid ${accent}` : ''}">
          <div class="pdw-device-top">
            <div class="pdw-device-icon" style="color:${accent}">${dev.icon}</div>
            <div class="pdw-device-meta">
              <div class="pdw-device-name">${esc(dev.label)}</div>
              <div class="pdw-device-category">${esc(dev.category)}</div>
            </div>
            ${assigned ? statusPill(devSt, devSt==='active'?'Active':'Assigned') : statusPill('disconnected','Not assigned')}
          </div>
          ${assigned ? `
          <div class="pdw-device-details">
            <div class="pdw-detail-row"><span class="pdw-detail-lbl">Prescribed frequency</span><span class="pdw-detail-val">${esc(asgn.prescribedFreq||'As directed')}</span></div>
            <div class="pdw-detail-row"><span class="pdw-detail-lbl">Last session logged</span><span class="pdw-detail-val">${lastSess ? fmtRelative(lastSess.date||lastSess.completedAt) : 'Not yet logged'}</span></div>
            <div class="pdw-detail-row"><span class="pdw-detail-lbl">Clinician monitoring</span><span class="pdw-detail-val ${asgn.monitoredByClinician?'pdw-monitored-yes':''}">${asgn.monitoredByClinician?'✓ Monitored':'Self-tracking only'}</span></div>
            ${asgn._isDemoData ? '<div class="pdw-demo-badge">Example assignment</div>' : ''}
          </div>
          <div class="pdw-device-actions-wrap">
            <button class="pdw-action-primary-btn" onclick="window._pdwLogSession('${dev.id}')">+ Log Session</button>
            <div class="pdw-action-secondary-row">
              <button class="pdw-action-ghost" onclick="window._pdwViewInstructions('${dev.id}')">Instructions</button>
              <button class="pdw-action-ghost pdw-action-ghost--warn" onclick="window._pdwReportIssue()">Report Issue</button>
              ${(typeof navigator !== 'undefined' && 'bluetooth' in navigator)
                ? `<button class="pdw-action-ghost pdw-action-ghost--ble" id="pdw-ble-btn-${dev.id}" onclick="window._patPairBleHrm('${dev.id}')" title="Pair a Bluetooth heart rate monitor (BLE 0x180D)">◌ Pair HRM <span class="pdw-ble-status" id="pdw-ble-status-${dev.id}"></span></button>`
                : `<button class="pdw-action-ghost pdw-action-ghost--ble" disabled title="Web Bluetooth not supported in this browser (use Chrome or Edge)">◌ Pair HRM</button>`}
            </div>
          </div>` : `
          <p class="pdw-device-unassigned">Not currently part of your plan. Contact your care team if you have this device.</p>
          <div class="pdw-device-actions"><button class="pdw-action-btn" onclick="window._navPatient('patient-messages')">Ask my clinician</button></div>`}
          <!-- Detail drawer -->
          <div class="pdw-detail-drawer" id="pdw-drawer-${dev.id}" style="display:none">
            <div class="pdw-drawer-body">
              <div class="pdw-drawer-section"><div class="pdw-drawer-heading">What is this device?</div><p class="pdw-drawer-text">${esc(dev.what)}</p></div>
              <div class="pdw-drawer-section"><div class="pdw-drawer-heading">Why does it matter?</div><p class="pdw-drawer-text">${esc(dev.whyMatters)}</p></div>
              <div class="pdw-drawer-section">
                <div class="pdw-drawer-heading">What data is shared with your clinic</div>
                <ul class="pdw-drawer-list">${dev.dataShared.map(d=>`<li>${esc(d)}</li>`).join('')}</ul>
              </div>
              <div class="pdw-drawer-section">
                <div class="pdw-drawer-heading">What is NOT shared</div>
                <ul class="pdw-drawer-list pdw-list-muted">${dev.dataNotShared.map(d=>`<li>${esc(d)}</li>`).join('')}</ul>
              </div>
              <div class="pdw-drawer-section">
                <div class="pdw-drawer-heading">Troubleshooting</div>
                <ul class="pdw-drawer-list">${dev.troubleshoot.map(d=>`<li>${esc(d)}</li>`).join('')}</ul>
              </div>
              <div class="pdw-drawer-section pdw-drawer-contact">
                <div class="pdw-drawer-heading">When to contact your clinic</div>
                <p class="pdw-drawer-text">${esc(dev.contactClinic)}</p>
                <button class="pdw-action-btn pdw-action-primary" style="margin-top:10px" onclick="window._navPatient('patient-messages')">Message care team</button>
              </div>
            </div>
          </div>
          <button class="pdw-drawer-toggle" onclick="window._pdwToggleDrawer('${dev.id}')">
            <span id="pdw-dtgl-${dev.id}">Show details</span> ▾
          </button>
        </div>`;
      }).join('')}
    </div>
  </div>

  <!-- ④ WHAT YOUR CLINIC MONITORS -->
  <div class="pdw-section">
    <div class="pdw-section-header">
      <h3 class="pdw-section-title"><span class="pdw-title-icon">◎</span>What your clinic monitors</h3>
      <span class="pdw-section-sub">Automatically shared with your care team</span>
    </div>
    <div class="pdw-monitoring-chips">
      ${[
        {label:'Sleep',           icon:'◗'},
        {label:'HRV',             icon:'∿'},
        {label:'Heart rate',      icon:'♡'},
        {label:'Steps & activity',icon:'◈'},
        {label:'Home sessions',   icon:'⊕'},
        {label:'Symptom check-ins',icon:'◉'},
        {label:'Side effects',    icon:'◬'},
        {label:'Uploaded updates',icon:'↑'},
      ].map(c=>`<span class="pdw-monitor-chip"><span class="pdw-chip-icon">${c.icon}</span>${esc(c.label)}</span>`).join('')}
    </div>
    <p class="pdw-note-text">Only the items above are visible to your clinic. Personal notes and voice memos are only shared when you choose to upload them.</p>
  </div>

  <!-- ⑤ BIOMETRICS SNAPSHOT -->
  <div class="pdw-section">
    <div class="pdw-section-header">
      <h3 class="pdw-section-title"><span class="pdw-title-icon">◗</span>Biometrics snapshot</h3>
      ${bio._isDemoData
        ? '<span class="pdw-demo-tag">Example data — connect a device to see real values</span>'
        : `<span class="pdw-section-sub">Last sync ${lastSyncMs ? fmtRelative(new Date(lastSyncMs).toISOString()) : '—'}</span>`}
    </div>
    <div class="pdw-bio-tiles">
      ${[
        { key:'sleep', icon:'◗', val:bio.sleep,      label:'Sleep last night' },
        { key:'hrv',   icon:'∿', val:bio.hrv,        label:'HRV' },
        { key:'rhr',   icon:'♡', val:bio.rhr||'—',   label:'Resting heart rate' },
        { key:'steps', icon:'◈', val:bio.steps,      label:'Steps today' },
      ].map(t => {
        const st = _bioStatus(t.key, t.val);
        const hl = _bioLabel(t.key, st);
        return `<div class="pdw-bio-tile pdw-bio-tile--${t.key}">
          <div class="pdw-bio-icon">${t.icon}</div>
          <div class="pdw-bio-val">${esc(t.val)}</div>
          <div class="pdw-bio-lbl">${t.label}</div>
          <div class="pdw-bio-status">${_vizTrafficLight(st, hl)}</div>
        </div>`;
      }).join('')}
    </div>
    ${_vizWeekStrip(_bioWeekDays, { legend: false })}
    <div style="font-size:11px;color:var(--text-tertiary,#64748b);margin-top:6px">7-day check-in log · connect a device to see biometric history</div>
  </div>

  <!-- ⑤b EVIDENCE (87k library bridge) -->
  <div class="pdw-section pdw-evidence-section">
    <div class="pdw-section-header">
      <h3 class="pdw-section-title"><span class="pdw-title-icon">⌕</span>Evidence behind wearable metrics</h3>
      <span class="pdw-section-sub">Ranked citations from the DeepSynaps evidence intelligence layer — educational context only</span>
    </div>
    ${wearEvidenceBlock ? `<div class="pdw-evidence">${wearEvidenceBlock}</div>` : wearEvidenceFallback}
  </div>

  <!-- ⑥ PRIVACY & PERMISSIONS -->
  <div class="pdw-section pdw-privacy-section">
    <div class="pdw-section-header"><h3 class="pdw-section-title"><span class="pdw-title-icon">◧</span>Privacy &amp; permissions</h3></div>
    <div class="pdw-privacy-grid">
      <div class="pdw-priv-block">
        <div class="pdw-priv-heading"><span class="pdw-priv-icon">◉</span>What data is read</div>
        <p class="pdw-priv-text">Sleep, heart rate, HRV, steps, and activity. No location data is ever accessed.</p>
      </div>
      <div class="pdw-priv-block">
        <div class="pdw-priv-heading"><span class="pdw-priv-icon">◌</span>Permissions used</div>
        <p class="pdw-priv-text">Read-only access you explicitly grant. We never write back to Apple Health or Health Connect.</p>
      </div>
      <div class="pdw-priv-block">
        <div class="pdw-priv-heading"><span class="pdw-priv-icon">◫</span>How to disconnect</div>
        <p class="pdw-priv-text">Use the Manage button on any connected source. On iOS, revoke in Settings → Privacy → Health.</p>
      </div>
      <div class="pdw-priv-block">
        <div class="pdw-priv-heading"><span class="pdw-priv-icon">◻</span>How to stop sharing</div>
        <p class="pdw-priv-text">Disconnect any source at any time. Historical data stays in your record but no new data will be collected.</p>
      </div>
    </div>
  </div>

  <!-- ⑦ FUTURE-READY BLE PLACEHOLDER -->
  <div class="pdw-ble-section">
    <div class="pdw-ble-inner">
      <div class="pdw-ble-pulse">
        <div class="pdw-ble-ring"></div>
        <div class="pdw-ble-ring pdw-ble-ring--2"></div>
        <span class="pdw-ble-center-icon">◌</span>
      </div>
      <div class="pdw-ble-copy">
        <div class="pdw-ble-badge">Web Bluetooth</div>
        <div class="pdw-ble-heading">Direct Bluetooth connection</div>
        <p class="pdw-ble-text">Pair a Bluetooth heart rate monitor (chest strap, watch, or armband supporting BLE 0x180D) to view live BPM in this browser session. A summary is uploaded only if secure sync succeeds. Chrome or Edge required.</p>
      </div>
    </div>
  </div>

</div>

<!-- HOME SESSION LOG MODAL -->
<div class="pdw-modal-overlay" id="pdw-log-modal" style="display:none">
  <div class="pdw-modal-card">
    <div class="pdw-modal-header">
      <h4 class="pdw-modal-title" id="pdw-log-title">Log home session</h4>
      <button class="pdw-modal-close" onclick="window._pdwCloseModal()">✕</button>
    </div>
    <div class="pdw-modal-body">
      <input type="hidden" id="pdw-log-device-id">
      <div class="pdw-form-row">
        <label class="pdw-form-label">Did you complete a session?</label>
        <div class="pdw-radio-row">
          <label class="pdw-radio-label"><input type="radio" name="pdw-completed" value="yes" checked> Yes, completed</label>
          <label class="pdw-radio-label"><input type="radio" name="pdw-completed" value="partial"> Partial</label>
          <label class="pdw-radio-label"><input type="radio" name="pdw-completed" value="no"> No, skipped</label>
        </div>
      </div>
      <div class="pdw-form-row">
        <label class="pdw-form-label" for="pdw-log-time">When?</label>
        <input type="datetime-local" id="pdw-log-time" class="form-control" style="font-size:13px">
      </div>
      <div class="pdw-form-row">
        <label class="pdw-form-label">Any side effects or discomfort?</label>
        <div class="pdw-checkbox-grid">
          ${['None','Mild headache','Scalp tingling','Fatigue afterward','Skin irritation','Jaw tension','Other'].map(
            e=>`<label class="pdw-check-label"><input type="checkbox" name="pdw-effects" value="${e}"> ${e}</label>`
          ).join('')}
        </div>
      </div>
      <div class="pdw-form-row">
        <label class="pdw-form-label" for="pdw-log-feel">How did you feel after?</label>
        <select id="pdw-log-feel" class="form-control" style="font-size:13px">
          <option value="">Select…</option>
          <option>Much better</option><option>A bit better</option>
          <option>About the same</option><option>A bit worse</option><option>Much worse</option>
        </select>
      </div>
      <div class="pdw-form-row">
        <label class="pdw-form-label" for="pdw-log-note">Optional note</label>
        <textarea id="pdw-log-note" class="form-control" rows="2" placeholder="Anything you want your clinician to know…" style="font-size:13px;resize:vertical"></textarea>
      </div>
    </div>
    <div class="pdw-modal-footer">
      <button class="btn btn-ghost btn-sm" onclick="window._pdwCloseModal()">Cancel</button>
      <button class="btn btn-primary btn-sm" onclick="window._pdwSaveSession()">Save session</button>
    </div>
  </div>
</div>`;

  // ── Drawer toggle ─────────────────────────────────────────────────────────
  window._pdwToggleDrawer = function(id) {
    const dr  = document.getElementById('pdw-drawer-' + id);
    const lbl = document.getElementById('pdw-dtgl-' + id);
    if (!dr) return;
    const open = dr.style.display === 'none';
    dr.style.display = open ? '' : 'none';
    if (lbl) lbl.textContent = open ? 'Hide details' : 'Show details';
  };

  window._pdwViewInstructions = function(id) {
    const dr  = document.getElementById('pdw-drawer-' + id);
    const lbl = document.getElementById('pdw-dtgl-' + id);
    if (dr && dr.style.display === 'none') {
      dr.style.display = '';
      if (lbl) lbl.textContent = 'Hide details';
      dr.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };

  // ── Source actions ────────────────────────────────────────────────────────
  window._pdwConnect = async function(sourceId) {
    if (!pwConsentActive) { showToast('Read-only mode — consent withdrawn.', '#ef4444'); return; }
    try {
      // V1 connect requires explicit consent; the legacy helper omits the
      // flag so we set it here on the patient's behalf — the consent
      // banner above explains the implications, and the audit row makes
      // the patient-action visible to the care team.
      await api.connectWearableSource({ source: sourceId, consent_given: true });
      if (api.postPatientWearablesAuditEvent) {
        api.postPatientWearablesAuditEvent({
          event: 'wearable_connected',
          note: 'source=' + sourceId,
          using_demo_data: pwIsDemo,
        });
      }
      await pgPatientWearables();
    } catch (_e) { showToast('Could not initiate connection. Please try again.'); }
  };
  window._pdwReconnect = async function(sourceId) {
    if (!pwConsentActive) { showToast('Read-only mode — consent withdrawn.', '#ef4444'); return; }
    try {
      await api.connectWearableSource({ source: sourceId, consent_given: true });
      if (api.postPatientWearablesAuditEvent) {
        api.postPatientWearablesAuditEvent({
          event: 'wearable_connected',
          note: 'reconnect; source=' + sourceId,
          using_demo_data: pwIsDemo,
        });
      }
      await pgPatientWearables();
    }
    catch (_e) { showToast('Could not reconnect. Please try again.'); }
  };
  window._pdwManageSource = async function(sourceId, connectionId) {
    if (!pwConsentActive) { showToast('Read-only mode — consent withdrawn.', '#ef4444'); return; }
    if (!connectionId) return;
    const note = prompt('Disconnect this source? Your existing observations will remain but no new syncs will occur.\n\nReason (required):');
    if (note == null) return;
    const trimmed = String(note).trim();
    if (!trimmed) { showToast('A reason is required to disconnect.', '#d97706'); return; }
    try {
      // Prefer the new audited disconnect endpoint when the source is
      // also visible in the launch-audit devices list. Fall back to the
      // legacy DELETE for sources the new router has not seen (during
      // rollout).
      const audited = pwBySource[sourceId];
      if (audited && audited.id && api.patientWearablesDisconnect) {
        await api.patientWearablesDisconnect(audited.id, trimmed);
      } else {
        await api.disconnectWearableSource(connectionId);
        if (api.postPatientWearablesAuditEvent) {
          api.postPatientWearablesAuditEvent({
            event: 'wearable_disconnected',
            note: 'legacy; source=' + sourceId + '; reason=' + trimmed.slice(0, 200),
            using_demo_data: pwIsDemo,
          });
        }
      }
      await pgPatientWearables();
    }
    catch (_e) { showToast('Could not disconnect. Please try again.'); }
  };
  // Sync-now uses the launch-audit endpoint so the audit row + anomaly
  // detection chain runs. No clinical-grade arrhythmia inference here —
  // just bridge-trigger + optional patient-supplied sample for the
  // anomaly thresholds documented on the server.
  window._pdwSyncNow = async function(deviceId) {
    if (!pwConsentActive) { showToast('Read-only mode — consent withdrawn.', '#ef4444'); return; }
    if (!deviceId || !api.patientWearablesSync) return;
    try {
      const resp = await api.patientWearablesSync(deviceId, {});
      if (resp && resp.adverse_event_id) {
        showToast('Anomaly detected — your care team has been notified.', '#ef4444');
      } else {
        showToast('Sync triggered.', 'var(--teal,#00d4bc)');
      }
      await pgPatientWearables();
    } catch (_e) { showToast('Could not trigger sync. Please try again.', '#d97706'); }
  };
  // Export uses the new launch-audit endpoint so the export is audited
  // and DEMO-prefixed when the patient row is demo. No blob URL — the
  // server returns a real CSV with DEMO honesty headers.
  window._pdwExportObs = function(deviceId) {
    if (!deviceId) return;
    const url = '/api/v1/patient-wearables/devices/' + encodeURIComponent(deviceId) + '/observations/export.csv';
    if (api.postPatientWearablesAuditEvent) {
      api.postPatientWearablesAuditEvent({
        event: 'export',
        device_id: deviceId,
        note: 'format=csv',
        using_demo_data: pwIsDemo,
      });
    }
    try { window.open(url, '_blank'); }
    catch (_e) { showToast('Could not open export.', '#d97706'); }
  };

  // ── Legacy compat ─────────────────────────────────────────────────────────
  window._connectWearable = async function(source, action, connectionId) {
    if (action === 'disconnect' && connectionId) await window._pdwManageSource(source, connectionId);
    else await window._pdwConnect(source);
  };

  // ── Session log modal ─────────────────────────────────────────────────────
  window._pdwLogSession = function(deviceId) {
    const dev   = HOME_THERAPY_DEVICES.find(d => d.id === deviceId);
    const modal = document.getElementById('pdw-log-modal');
    if (!modal) return;
    const title = document.getElementById('pdw-log-title');
    if (title)  title.textContent = 'Log session — ' + (dev?.label || deviceId);
    const devInp = document.getElementById('pdw-log-device-id');
    if (devInp)  devInp.value = deviceId;
    const timeInp = document.getElementById('pdw-log-time');
    if (timeInp) {
      const now = new Date();
      now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
      timeInp.value = now.toISOString().slice(0, 16);
    }
    modal.querySelectorAll('input[name="pdw-effects"]').forEach(cb => { cb.checked = false; });
    const noneBox = modal.querySelector('input[name="pdw-effects"][value="None"]');
    if (noneBox) noneBox.checked = true;
    const feel = document.getElementById('pdw-log-feel');
    if (feel) feel.value = '';
    const note = document.getElementById('pdw-log-note');
    if (note) note.value = '';
    modal.style.display = 'flex';
  };

  window._pdwCloseModal = function() {
    const m = document.getElementById('pdw-log-modal');
    if (m) m.style.display = 'none';
  };

  window._pdwSaveSession = async function() {
    const deviceId  = document.getElementById('pdw-log-device-id')?.value || '';
    const completed = document.querySelector('input[name="pdw-completed"]:checked')?.value || 'yes';
    const timeVal   = document.getElementById('pdw-log-time')?.value || new Date().toISOString();
    const effects   = [...document.querySelectorAll('input[name="pdw-effects"]:checked')].map(cb => cb.value).filter(v => v !== 'None');
    const feel      = document.getElementById('pdw-log-feel')?.value || '';
    const note      = document.getElementById('pdw-log-note')?.value?.trim() || '';
    const entry = { id:'sess_'+Date.now(), deviceId, date:timeVal, completedAt:timeVal, completed, effects, feel, note };

    // Local cache — always write so the UI reflects the log instantly.
    let sess = [];
    try { sess = JSON.parse(localStorage.getItem(homeSessKey) || '[]'); } catch (_e) {}
    sess.push(entry);
    try { localStorage.setItem(homeSessKey, JSON.stringify(sess)); } catch (_e) {}

    let devs = [];
    try { devs = JSON.parse(localStorage.getItem(homeDevKey) || '[]'); } catch (_e) {}
    const devRec = devs.find(d => d.deviceId === deviceId);
    if (devRec) devRec.lastSession = timeVal;
    try { localStorage.setItem(homeDevKey, JSON.stringify(devs)); } catch (_e) {}

    // Backend sync — only when the clinician has issued a real home-device
    // assignment. Without it, POST /home-sessions returns 404
    // (no_active_assignment), so we honestly downgrade the toast instead
    // of falsely claiming the care team saw the log.
    let syncedToBackend = false;
    if (activeHomeAssignment && typeof api.portalLogHomeSession === 'function') {
      try {
        const rawFeel = parseInt(feel, 10);
        const mood_after = Number.isFinite(rawFeel)
          ? Math.max(1, Math.min(5, Math.round(rawFeel / 2)))
          : null;
        const tolerance_rating = effects.length > 0 ? 3 : null;
        await api.portalLogHomeSession({
          session_date: new Date(timeVal).toISOString().slice(0, 10),
          completed: completed === 'yes',
          side_effects_during: effects.length ? effects.join(', ') : null,
          tolerance_rating,
          mood_after,
          notes: note || null,
        });
        syncedToBackend = true;
      } catch (_err) { /* keep local-only; toast below reflects truth */ }
    }

    window._pdwCloseModal();
    showToast(
      syncedToBackend
        ? 'Session logged. Synced entries are available in your portal workflow.'
        : 'Session saved locally. Ask your clinician to activate home-device sync so it reaches your care team.',
      syncedToBackend ? undefined : '#d97706',
    );
    pgPatientWearables();
  };

  window._pdwReportIssue = function() {
    showToast('Opening messages — describe the issue to your care team.');
    window._navPatient('patient-messages');
  };

  // ── BLE Heart Rate Monitor pairing (Web Bluetooth, service 0x180D) ────────
  function _bleToast(msg, color) {
    color = color || 'var(--teal,#00d4bc)';
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;background:' + color + ';color:#fff;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:500;box-shadow:0 4px 12px rgba(0,0,0,.25);pointer-events:none';
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2800);
  }
  window._patPairBleHrm = async function(deviceId) {
    if (!('bluetooth' in navigator)) { _bleToast('Web Bluetooth not supported in this browser', '#ef4444'); return; }
    const statusEl = document.getElementById('pdw-ble-status-' + deviceId);
    const setStatus = (txt) => { if (statusEl) statusEl.textContent = txt ? ' ' + txt : ''; };
    let device, server, char, latestBpm = 0, samples = 0, stopTimer = null;
    const cleanup = async () => {
      if (stopTimer) { clearTimeout(stopTimer); stopTimer = null; }
      try { if (char) { char.removeEventListener('characteristicvaluechanged', onChange); await char.stopNotifications(); } } catch (_) {}
      try { if (server && server.connected) server.disconnect(); } catch (_) {}
      setStatus(latestBpm ? 'Connected ✓' : '');
      if (latestBpm > 0) {
        let synced = false;
        try {
          await api.submitWearableObservations({ rhr_bpm: latestBpm, source: 'web_bluetooth_hrm', samples });
          synced = true;
        } catch (_) {}
        _bleToast(
          synced
            ? 'Bluetooth reading captured and shared with your clinic.'
            : 'Bluetooth reading captured in this browser session. Clinic sync was not confirmed.',
          synced ? 'var(--teal,#00d4bc)' : '#d97706',
        );
      }
    };
    function onChange(ev) {
      const v = ev.target.value; if (!v || v.byteLength < 2) return;
      const flags = v.getUint8(0);
      const bpm = (flags & 0x01) ? v.getUint16(1, true) : v.getUint8(1);
      if (bpm > 0 && bpm < 250) { latestBpm = bpm; samples++; setStatus('● ' + bpm + ' bpm'); }
    }
    try {
      setStatus('scanning…');
      device = await navigator.bluetooth.requestDevice({ filters: [{ services: ['heart_rate'] }], optionalServices: ['battery_service'] });
      device.addEventListener('gattserverdisconnected', () => { setStatus(latestBpm ? 'Connected ✓' : 'Disconnected'); });
      setStatus('connecting…');
      server = await device.gatt.connect();
      const service = await server.getPrimaryService('heart_rate');
      char = await service.getCharacteristic('heart_rate_measurement');
      await char.startNotifications();
      char.addEventListener('characteristicvaluechanged', onChange);
      setStatus('● — bpm');
      stopTimer = setTimeout(cleanup, 60000);
    } catch (err) {
      setStatus('');
      if (err && (err.name === 'NotFoundError' || /cancelled/i.test(err.message || ''))) return; // user cancelled
      _bleToast('Bluetooth pairing failed: ' + ((err && err.message) || 'unknown error'), '#ef4444');
    }
  };
}
