// pgPatientDashboard
// Extracted from `pages-patient.js` on 2026-05-02 as part of the file-split
// refactor (continuation of #403; see `pages-patient/_shared.js`). NO
// behavioural change: the page body below is the verbatim Home block from
// the original file with imports rewired.
//
// The unused `startCountdown` + `getPatientMilestones` helpers (which lived
// directly under the dashboard in pages-patient.js) are preserved at the
// foot of this file so the mechanical split stays mechanical — they are
// dead code today but moving them keeps line-by-line diffs reviewable.
import { api } from '../api.js';
import { t } from '../i18n.js';
import {
  EVIDENCE_SUMMARY,
  getConditionEvidence,
} from '../evidence-dataset.js';
import { getEvidenceUiStats } from '../evidence-ui-live.js';
import { emptyPatientEvidenceContext, loadPatientEvidenceContext } from '../patient-evidence-context.js';
import {
  outcomeGoalMarker,
  groupOutcomesByTemplate,
  pickTodaysFocus,
  isDemoPatient,
} from '../patient-dashboard-helpers.js';
import { setTopbar, spinner } from './_shared.js';

// Local wrappers around the patient-evidence-context helpers — kept to
// preserve the original call-sites verbatim.
function _emptyPatientEvidenceContext(patientId = '') {
  return emptyPatientEvidenceContext(patientId);
}
async function _loadPatientEvidenceContext(patientId, reports = null) {
  return loadPatientEvidenceContext(patientId, { reports });
}

// ── Dashboard ─────────────────────────────────────────────────────────────────────────────
export async function pgPatientDashboard(user) {
  setTopbar('Home');
  function esc(v) { if (v == null) return ''; return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;'); }
  const firstName = esc((user?.display_name || 'there').split(' ')[0]);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const el = document.getElementById('patient-content');
  el.innerHTML = `
    <div class="ptd-dashboard hm-dashboard" data-patient-dashboard-loading="true">
      <div class="hm-hero">
        <div class="hm-hero-top">
          <div>
            <div class="hm-greet-kicker">Patient portal</div>
            <h1 class="hm-greet-title pth-greeting">${greeting}, ${firstName}.</h1>
            <p class="hm-greet-sub">Loading your Home page…</p>
          </div>
        </div>
      </div>
      ${spinner()}
    </div>`;
  const liveEvidence = await getEvidenceUiStats({
    fallbackSummary: EVIDENCE_SUMMARY,
    fallbackConditionCount: EVIDENCE_SUMMARY.totalConditions,
  });

  // ── Fetch all real endpoints in parallel ────────────────────────────────────
  const patientId = user?.patient_id || user?.id || null;
  const [
    portalSessions,
    portalCourses,
    portalOutcomes,
    portalMessagesRaw,
    wearableSummaryRaw,
    homeTasksRaw,
    homeTasksPortalRaw,
    wellnessLogsRaw,
    dashboardRaw,
    patientSummaryRaw,
    patientReportsRaw,
  ] = await Promise.all([
    api.patientPortalSessions().catch(() => null),
    api.patientPortalCourses().catch(() => null),
    api.patientPortalOutcomes().catch(() => null),
    api.patientPortalMessages().catch(() => null),
    api.patientPortalWearableSummary(7).catch(() => null),
    (patientId ? api.listHomeProgramTasks({ patient_id: patientId }).catch(() => null) : Promise.resolve(null)),
    (api.portalListHomeProgramTasks ? api.portalListHomeProgramTasks().catch(() => null) : Promise.resolve(null)),
    (api.patientPortalWellnessLogs ? api.patientPortalWellnessLogs(7).catch(() => null) : Promise.resolve(null)),
    (api.patientPortalDashboard ? api.patientPortalDashboard().catch(() => null) : Promise.resolve(null)),
    (api.patientPortalSummary ? api.patientPortalSummary().catch(() => null) : Promise.resolve(null)),
    (api.patientPortalReports ? api.patientPortalReports().catch(() => null) : Promise.resolve(null)),
  ]);

  const _hmLoadFailed =
    portalSessions == null &&
    portalCourses == null &&
    portalOutcomes == null &&
    portalMessagesRaw == null &&
    wearableSummaryRaw == null &&
    homeTasksRaw == null &&
    homeTasksPortalRaw == null &&
    wellnessLogsRaw == null &&
    dashboardRaw == null &&
    patientSummaryRaw == null &&
    patientReportsRaw == null;

  // In demo mode, seed sample data instead of showing the error page.
  const _demoEnabled = import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO === '1';
  const _hmDemo = _hmLoadFailed && _demoEnabled && isDemoPatient(user, { getToken: api.getToken });

  if (_hmLoadFailed && !_hmDemo) {
    el.innerHTML = `
      <div class="pt-portal-empty">
        <div class="pt-portal-empty-ico" aria-hidden="true">&#9888;</div>
        <div class="pt-portal-empty-title">We couldn't load your Home page</div>
        <div class="pt-portal-empty-body">Your portal data is temporarily unavailable. Please refresh the page, or message your care team if this keeps happening.</div>
        <div style="display:flex;gap:10px;justify-content:center;margin-top:16px;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" onclick="window.location.reload()">Refresh</button>
          <button class="btn btn-ghost btn-sm" onclick="window._navPatient('patient-messages')">Message care team</button>
        </div>
      </div>`;
    return;
  }

  const sessions     = Array.isArray(portalSessions) ? portalSessions : [];
  const outcomes     = Array.isArray(portalOutcomes) ? portalOutcomes : [];
  const coursesArr   = Array.isArray(portalCourses) ? portalCourses : [];
  const messages     = Array.isArray(portalMessagesRaw) ? portalMessagesRaw : [];
  const patientSummary = (patientSummaryRaw && typeof patientSummaryRaw === 'object') ? patientSummaryRaw : null;
  const patientReports = Array.isArray(patientReportsRaw) ? patientReportsRaw : [];
  const patientEvidence = await _loadPatientEvidenceContext(patientId, patientReports).catch(() => _emptyPatientEvidenceContext(patientId));

  // Wearable daily summary → flatten to latest-valued metrics.
  const wearableDays = Array.isArray(wearableSummaryRaw) ? wearableSummaryRaw : [];

  // ── Demo seed — populates every array when the backend returned nothing so
  //    first-time preview users see a fully-rendered home dashboard. Gated
  //    on "everything empty" — any real patient data and we skip the seed.
  if (_hmDemo) {
    coursesArr.push({
      id: 'demo-crs-001',
      name: 'Left DLPFC tDCS \u2014 Depression',
      condition_slug: 'depression-mdd',
      modality_slug: 'tdcs',
      status: 'active',
      phase: 'Active Treatment',
      total_sessions_planned: 20,
      session_count: 12,
      next_review_date: '2026-04-24',
      primary_clinician_name: 'Dr. Amelia Kolmar',
    });
    const _P = { modality_slug: 'tdcs', stimulation_mA: 2.0, target_site: 'F3 / FP2', ramp_up_sec: 30, duration_minutes: 20, clinician_name: 'Dr. Amelia Kolmar' };
    const _done = [
      { n:1,  date:'2026-02-22T10:00:00', home:false, comfort:7.0 },
      { n:2,  date:'2026-02-25T10:00:00', home:false, comfort:7.5 },
      { n:3,  date:'2026-02-27T10:00:00', home:false, comfort:8.0 },
      { n:4,  date:'2026-03-03T10:00:00', home:false, comfort:7.5 },
      { n:5,  date:'2026-03-06T09:30:00', home:true,  comfort:7.0 },
      { n:6,  date:'2026-03-10T10:00:00', home:false, comfort:8.5 },
      { n:7,  date:'2026-03-13T10:00:00', home:false, comfort:8.5 },
      { n:8,  date:'2026-03-17T09:30:00', home:true,  comfort:8.0 },
      { n:9,  date:'2026-03-20T10:00:00', home:false, comfort:8.5 },
      { n:10, date:'2026-04-03T10:00:00', home:false, comfort:9.0 },
      { n:11, date:'2026-04-10T09:30:00', home:true,  comfort:8.5 },
      { n:12, date:'2026-04-15T10:00:00', home:false, comfort:9.0 },
    ];
    _done.forEach(d => sessions.push({ ..._P, id:'dm-s'+d.n, session_number:d.n, delivered_at:d.date, scheduled_at:d.date, status:'completed', location:d.home?'Home':'Clinic · Room A', is_home:d.home, comfort_rating:d.comfort, impedance_kohm: d.home ? 5.2 : 4.6, tolerance_rating: d.comfort >= 8.5 ? 'excellent' : 'good' }));
    const _upcoming = [
      { n:13, date:'2026-04-22T14:00:00', home:false, location:'Clinic · Rm 2' },
      { n:14, date:'2026-04-24T09:30:00', home:true,  location:'Home' },
      { n:15, date:'2026-04-27T10:00:00', home:false, location:'Clinic · Rm 2' },
      { n:16, date:'2026-04-29T18:00:00', home:true,  location:'Home' },
      { n:17, date:'2026-05-01T10:00:00', home:false, location:'Clinic · Rm 2' },
    ];
    _upcoming.forEach(u => sessions.push({ ..._P, id:'dm-u'+u.n, session_number:u.n, scheduled_at:u.date, status:'scheduled', location:u.location, is_home:u.home, confirmed:true }));

    // Outcomes — PHQ-9, GAD-7, ISI across Weeks 1–6 (lower is better).
    const _phq = [19, 17, 15, 13, 12, 11];
    const _gad = [14, 13, 12, 11, 10, 9];
    const _isi = [16, 15, 14, 13, 12, 12];
    for (let w = 0; w < 6; w++) {
      const d = new Date(2026, 1, 22 + w * 7).toISOString();  // Feb 22 + w weeks
      outcomes.push({ id:'dm-o-phq-'+w, template_slug:'phq-9', template_name:'PHQ-9', score_numeric:_phq[w], administered_at:d });
      outcomes.push({ id:'dm-o-gad-'+w, template_slug:'gad-7', template_name:'GAD-7', score_numeric:_gad[w], administered_at:d });
      outcomes.push({ id:'dm-o-isi-'+w, template_slug:'isi',   template_name:'ISI',   score_numeric:_isi[w], administered_at:d });
    }

    // Messages — 1 unread from Dr. Kolmar + a few read.
    const _dToday = new Date(); _dToday.setHours(8, 12, 0, 0);
    const _dYest  = new Date(Date.now() - 86400000);
    const _dSat   = new Date(Date.now() - 3 * 86400000);
    messages.push(
      { id:'dm-m1', sender_type:'clinician', sender_name:'Dr. Kolmar',  preview:'Nice work on the Week 6 PHQ-9. Keeping protocol for Week 7\u2026', body:'Nice work on the Week 6 PHQ-9.', subject:'Week 6 check-in', is_read:false, created_at:_dToday.toISOString() },
      { id:'dm-m2', sender_type:'clinician', sender_name:'Rhea Nair',   preview:'Reminder: Wed 2 PM. Bring your saline sponges for home-use QC.',     body:'Reminder for Wednesday.',         subject:'Reminder',       is_read:true,  created_at:_dYest.toISOString()  },
      { id:'dm-m3', sender_type:'system',    sender_name:'Synaps AI',   preview:'2 questions answered \u00b7 1 routed to Rhea (skin redness)',         body:'AI assistant summary.',            subject:'AI summary',     is_read:true,  created_at:_dYest.toISOString()  },
      { id:'dm-m4', sender_type:'clinician', sender_name:'Marcus Tan',  preview:'BCBS reauth filed \u00b7 decision expected Apr 25',                   body:'Reauth status update.',            subject:'Insurance',      is_read:true,  created_at:_dSat.toISOString()   },
    );

    // Wearable — 7 days, mildly-bad sleep last night to justify the AI nudge.
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      const isLastNight = i === 0;
      wearableDays.push({
        date: d,
        sleep_duration_h: isLastNight ? 6.2 : (7.0 + Math.random() * 0.8),
        hrv_ms:           isLastNight ? 42  : (50 + Math.random() * 10),
        rhr_bpm:          62 + Math.round(Math.random() * 4),
        steps:            7800 + Math.round(Math.random() * 1500),
      });
    }
  }

  let activeCourse = coursesArr.find(c => c.status === 'active') || coursesArr[0] || null;

  // ── Home (hm-*) shared helpers ──────────────────────────────────────────
  // Inline modality-slug → human label map. pgPatientDashboard doesn't have
  // access to pgPatientSessions' `modalityLabel`, so we duplicate a small
  // version here. Same mapping keys.
  function _hmModalityLabel(slug) {
    if (!slug) return null;
    const key = String(slug).toLowerCase().replace(/[-_\s]/g, '');
    const MAP = {
      tms:'TMS', rtms:'rTMS', dtms:'Deep TMS', tdcs:'tDCS', tacs:'tACS', trns:'tRNS',
      neurofeedback:'Neurofeedback', nfb:'Neurofeedback', hegnfb:'HEG Neurofeedback',
      heg:'HEG Neurofeedback', lensnfb:'LENS Neurofeedback', lens:'LENS Neurofeedback',
      qeeg:'qEEG Assessment', pemf:'PEMF Therapy', biofeedback:'Biofeedback',
      hrvbiofeedback:'HRV Biofeedback', hrv:'HRV Biofeedback', hrvb:'HRV Biofeedback',
      pbm:'Photobiomodulation', nirs:'fNIRS Session', assessment:'Assessment',
    };
    if (MAP[key]) return MAP[key];
    return String(slug).replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
  // "rTMS · MDD" style label for the hero sub.
  function modalityCondShort(c) {
    if (!c) return 'treatment';
    const mod = _hmModalityLabel(c.modality_slug) || (c.modality_slug || 'tDCS').toUpperCase();
    const cond = (c.condition_slug || '').replace(/-/g, ' ').replace(/mdd/i, 'MDD').trim();
    return cond ? `${mod} · ${cond}` : mod;
  }
  // Clinical band label per scale, loose ranges (lower = better except WHO-5).
  function _hmSeverityLabel(slugOrName, v) {
    if (v == null || !Number.isFinite(Number(v))) return null;
    const s = String(slugOrName || '').toLowerCase();
    const n = Number(v);
    if (/phq/.test(s)) return n < 5 ? 'Minimal' : n < 10 ? 'Mild' : n < 15 ? 'Moderate' : n < 20 ? 'Mod-severe' : 'Severe';
    if (/gad/.test(s)) return n < 5 ? 'Minimal' : n < 10 ? 'Mild' : n < 15 ? 'Moderate' : 'Severe';
    if (/isi/.test(s)) return n < 8 ? 'None' : n < 15 ? 'Sub-threshold' : n < 22 ? 'Moderate' : 'Severe';
    if (/who/.test(s)) return n > 17 ? 'Good' : n > 12 ? 'Moderate' : 'Low';
    return null;
  }
  function _hmBandClass(slugOrName, v) {
    const lbl = _hmSeverityLabel(slugOrName, v);
    if (!lbl) return '';
    if (/^(Minimal|None|Good)$/i.test(lbl)) return 'min';
    if (/^(Mild|Sub-threshold|Moderate)$/i.test(lbl)) return 'mild';
    if (/^(Mod-severe|Severe|Low)$/i.test(lbl)) return 'mod';
    return '';
  }
  function _avg(arr) {
    const xs = arr.filter(x => x != null && !Number.isNaN(Number(x))).map(Number);
    if (!xs.length) return null;
    return xs.reduce((a, b) => a + b, 0) / xs.length;
  }
  function _hmSimpleSummaryHtml() {
    if (!patientSummary) return '';
    const cards = [];
    if (patientSummary.latest_qeeg) {
      cards.push(
        '<div class="hm-simple-card">'
          + '<div class="hm-simple-card__eyebrow">Latest brainwave review</div>'
          + '<div class="hm-simple-card__title">' + esc(patientSummary.latest_qeeg.headline || 'Your latest brainwave review is ready.') + '</div>'
          + '<p>' + esc(patientSummary.latest_qeeg.summary || '') + '</p>'
          + (patientSummary.latest_qeeg.quality_note ? '<div class="hm-simple-card__note">' + esc(patientSummary.latest_qeeg.quality_note) + '</div>' : '')
          + (patientSummary.latest_qeeg.follow_up_note ? '<div class="hm-simple-card__note">' + esc(patientSummary.latest_qeeg.follow_up_note) + '</div>' : '')
        + '</div>'
      );
    }
    if (patientSummary.latest_mri) {
      cards.push(
        '<div class="hm-simple-card">'
          + '<div class="hm-simple-card__eyebrow">Latest scan review</div>'
          + '<div class="hm-simple-card__title">' + esc(patientSummary.latest_mri.headline || 'Your latest scan summary is ready.') + '</div>'
          + '<p>' + esc(patientSummary.latest_mri.summary || '') + '</p>'
          + (patientSummary.latest_mri.quality_note ? '<div class="hm-simple-card__note">' + esc(patientSummary.latest_mri.quality_note) + '</div>' : '')
          + (patientSummary.latest_mri.follow_up_note ? '<div class="hm-simple-card__note">' + esc(patientSummary.latest_mri.follow_up_note) + '</div>' : '')
        + '</div>'
      );
    }
    var outcomesHtml = '';
    if (Array.isArray(patientSummary.outcomes_snapshot) && patientSummary.outcomes_snapshot.length) {
      outcomesHtml = '<div class="hm-simple-outcomes">'
        + patientSummary.outcomes_snapshot.slice(0, 3).map(function (row) {
          return '<div class="hm-simple-outcomes__row">'
            + '<strong>' + esc(row.label || 'Outcome') + '</strong>'
            + '<span>' + esc(row.score == null ? '—' : String(row.score)) + '</span>'
            + '<small>' + esc(row.note || '') + '</small>'
            + '</div>';
        }).join('')
        + '</div>';
    }
    if (!cards.length && !outcomesHtml) return '';
    return '<div class="hm-simple-summary">'
      + '<div class="hm-simple-summary__hd"><div><h3>Your latest summaries</h3><p>Plain-language updates from your most recent clinic reviews.</p></div>'
      + '<button class="btn btn-ghost btn-sm" onclick="window._navPatient(\'patient-reports\')">Open reports →</button></div>'
      + (patientEvidence.live
        ? '<div class="hm-simple-summary__note" style="margin-bottom:12px;font-size:12px;color:var(--text-secondary)">'
          + patientEvidence.highlightCount + ' live evidence highlight' + (patientEvidence.highlightCount === 1 ? '' : 's')
          + ' · ' + patientEvidence.savedCitationCount + ' saved citation' + (patientEvidence.savedCitationCount === 1 ? '' : 's')
          + ' · ' + patientEvidence.reportCount + ' report' + (patientEvidence.reportCount === 1 ? '' : 's')
          + ' available'
          + '</div>'
        : '')
      + '<div class="hm-simple-summary__grid">' + cards.join('') + '</div>'
      + outcomesHtml
      + '</div>';
  }
  const wearable = {
    hasData:  wearableDays.length > 0,
    sleepAvg: _avg(wearableDays.map(d => d.sleep_duration_h)),
    hrvAvg:   _avg(wearableDays.map(d => d.hrv_ms)),
    rhrAvg:   _avg(wearableDays.map(d => d.rhr_bpm)),
    lastDate: wearableDays.length ? (wearableDays[wearableDays.length - 1]?.date || null) : null,
  };
  // Last-night sleep (prefer the most recent day's raw sample, fall back to avg).
  const lastNightSleepHours = (() => {
    if (!wearableDays.length) return null;
    const last = wearableDays[wearableDays.length - 1] || {};
    const v = last.sleep_duration_h;
    return Number.isFinite(Number(v)) ? Number(v) : wearable.sleepAvg;
  })();

  // Home-program tasks — prefer clinician-shaped then portal.
  let homeTasks = [];
  if (homeTasksRaw && Array.isArray(homeTasksRaw.items)) {
    homeTasks = homeTasksRaw.items;
  } else if (Array.isArray(homeTasksRaw)) {
    homeTasks = homeTasksRaw;
  } else if (Array.isArray(homeTasksPortalRaw)) {
    homeTasks = homeTasksPortalRaw.map(r => ({
      id: r.server_task_id || r.id,
      server_task_id: r.server_task_id,
      title: r.title || r.task?.title || r.task?.name || 'Task',
      category: r.category || r.task?.category || '',
      instructions: r.instructions || r.task?.instructions || '',
      completed: !!(r.task?.completed || r.task?.done),
      due_on: r.task?.due_on || r.task?.dueOn || null,
      task_type: r.task?.task_type || r.task?.type || null,
      raw: r,
    }));
  }
  // Demo-seed home tasks when the real list is empty on a first-time view.
  if (_hmDemo && homeTasks.length === 0) {
    const todayISO = new Date().toISOString().slice(0, 10);
    homeTasks = [
      { id:'dm-t1', title:'Morning mood check-in',           category:'Check-in',     task_type:'checkin',   completed:true,  due_on:todayISO, _doneAt:'7:22 AM' },
      { id:'dm-t2', title:'4\u20137\u20138 breathing \u00b7 4 cycles', category:'Breathing',    task_type:'breathing', completed:true,  due_on:todayISO, _doneAt:'8:12 AM' },
      { id:'dm-t3', title:'20-min outdoor walk',             category:'Activation',   task_type:'walk',      completed:false, due_on:todayISO, _at:'10:00 AM', _when:'in 32 min' },
      { id:'dm-t4', title:'Home tDCS \u00b7 Synaps One',     category:'Stimulation',  task_type:'tdcs',      completed:false, due_on:todayISO, _at:'6:00 PM',  _when:'home', _sub:'F3 \u2013 FP2 \u00b7 2.0 mA \u00b7 20 min' },
      { id:'dm-t5', title:'Mood journal + sleep checklist',  category:'Journaling',   task_type:'journal',   completed:false, due_on:todayISO, _at:'9:30 PM',  _when:'evening' },
    ];
  }
  const openTasks = homeTasks.filter(t => !(t.completed || t.done));

  // ── Progress math ──────────────────────────────────────────────────────────
  const totalPlanned  = activeCourse?.total_sessions_planned ?? null;
  const sessDelivered = activeCourse?.session_count ?? sessions.length;
  const progressPct   = (totalPlanned && sessDelivered) ? Math.round((sessDelivered / totalPlanned) * 100) : null;

  // ── Next session ───────────────────────────────────────────────────────────
  const now = Date.now();
  const loc = getLocale() === 'tr' ? 'tr-TR' : 'en-US';
  const upcomingSessions = sessions
    .filter(s => s.scheduled_at && new Date(s.scheduled_at).getTime() > now)
    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
  const nextSess = upcomingSessions[0] || null;
  const nextSessDate = nextSess ? new Date(nextSess.scheduled_at) : null;
  const nextSessTime = nextSessDate
    ? nextSessDate.toLocaleTimeString(loc, { hour: 'numeric', minute: '2-digit' })
    : null;

  // ── Greeting ───────────────────────────────────────────────────────────────
  const todayStr = new Date().toISOString().slice(0, 10);
  const _wellnessLogs = Array.isArray(wellnessLogsRaw) ? wellnessLogsRaw : [];
  const checkedInToday = dashboardRaw?.last_checkin_date === todayStr
    || _wellnessLogs.some(function(l) { return l.date === todayStr; })
    || localStorage.getItem('ds_last_checkin') === todayStr;
  const dateLabel = (() => {
    try { return new Date().toLocaleDateString(loc, { weekday: 'long', month: 'long', day: 'numeric' }); }
    catch (_e) { return todayStr; }
  })();

  // ── Outcome grouping ───────────────────────────────────────────────────────
  const outcomeGroups = groupOutcomesByTemplate(outcomes, 4);

  // ── Wellness ring value (derived from API wellness-logs + wearable) ────────
  function _ptdWellnessRingValue() {
    const pieces = [];
    // Mood recency from API logs (last 7 days)
    const last7 = _wellnessLogs.slice(0, 7).map(function(l) {
      return ((Number(l.mood) || 0) + (Number(l.sleep) || 0) + (Number(l.energy) || 0)) / 3;
    }).filter(function(v) { return v > 0; });
    // Fallback to localStorage if API returned nothing
    if (!last7.length) {
      for (var i = 6; i >= 0; i--) {
        var d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
        var raw2 = localStorage.getItem('ds_checkin_' + d);
        if (raw2) { try { var c2 = JSON.parse(raw2); var avg2 = ((Number(c2.mood)||0)+(Number(c2.sleep)||0)+(Number(c2.energy)||0))/3; if(avg2>0) last7.push(avg2); } catch(_e){} }
      }
    }
    if (last7.length) {
      const avg = last7.reduce((s, v) => s + v, 0) / last7.length;
      pieces.push(Math.round((avg / 10) * 100));
    }
    if (wearable.hasData) {
      const parts = [];
      if (wearable.sleepAvg != null) parts.push(Math.max(0, Math.min(100, (wearable.sleepAvg / 8) * 100)));
      if (wearable.hrvAvg   != null) parts.push(Math.max(0, Math.min(100, (wearable.hrvAvg / 80) * 100)));
      if (wearable.rhrAvg   != null) parts.push(Math.max(0, Math.min(100, 100 - ((wearable.rhrAvg - 50) / 50) * 100)));
      if (parts.length) pieces.push(Math.round(parts.reduce((a, b) => a + b, 0) / parts.length));
    }
    if (!pieces.length) return 0;
    return Math.round(pieces.reduce((a, b) => a + b, 0) / pieces.length);
  }
  const wellnessVal = _ptdWellnessRingValue();

  // ── Care team (avatars only for simplified home) ───────────────────────────
  function _ptdCareTeam() {
    if (Array.isArray(activeCourse?.care_team) && activeCourse.care_team.length) {
      return activeCourse.care_team.slice(0, 3).map(m => ({
        name: m.name || m.display_name || 'Clinician',
        role: m.role || m.title || 'Care team',
        avatar: m.avatar_initials || (m.name ? m.name.split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase() : '·'),
        accent: m.accent || 'linear-gradient(135deg,#00d4bc,#4a9eff)',
      }));
    }
    const seen = new Map();
    for (const s of sessions) {
      const n = s.clinician_name || s.clinician_display_name;
      if (!n || seen.has(n)) continue;
      seen.set(n, {
        name: n,
        role: s.clinician_role || s.clinician_title || 'Clinician',
        avatar: n.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase(),
        accent: 'linear-gradient(135deg,#00d4bc,#4a9eff)',
      });
    }
    return Array.from(seen.values()).slice(0, 3);
  }
  const careTeam = _ptdCareTeam();

  // ── Latest unread message ──────────────────────────────────────────────────
  const latestUnread = (() => {
    if (!messages.length) return null;
    const unread = messages
      .filter(m => !m.is_read && (m.sender_type !== 'patient'))
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    return unread[0] || null;
  })();

  // ── Streak (from API dashboard, fallback to localStorage) ─────────────────
  const streak = dashboardRaw?.wellness_streak != null
    ? dashboardRaw.wellness_streak
    : (parseInt(localStorage.getItem('ds_wellness_streak') || '0', 10) || 0);

  // ── Alt-variant soft line (patient-friendly wording only) ──────────────────
  const altVariant = activeCourse?.alt_variant
    || activeCourse?.alternative_variant
    || activeCourse?.recommendation
    || null;

  // ── Outcome delta sentence for progress card ───────────────────────────────
  function _outcomeDeltaSentence() {
    if (!outcomeGroups.length) return null;
    const g = outcomeGroups[0];
    if (!g.latest || !g.baseline || g.latest === g.baseline) return null;
    const base = Number(g.baseline.score_numeric);
    const cur  = Number(g.latest.score_numeric);
    if (!Number.isFinite(base) || !Number.isFinite(cur)) return null;
    const delta = cur - base;
    if (Math.abs(delta) < 1) return null;
    const gm = outcomeGoalMarker(g.latest, g.baseline);
    // Lower-is-better: "lower by N" when cur<base.
    const dropped = delta < 0;
    const direction = gm.down
      ? (dropped ? 'lower' : 'higher')
      : (dropped ? 'lower' : 'higher');
    return `Your ${esc(g.template_name)} is ${direction} by <strong style="color:var(--teal)">${Math.abs(Math.round(delta))} points</strong> since you started.`;
  }
  const outcomeDelta = _outcomeDeltaSentence();

  // ── Focus snooze (localStorage, date-scoped) ───────────────────────────────
  const focusSnoozeKey = 'ds_focus_snoozed_' + todayStr;
  const focusSnoozed = !!localStorage.getItem(focusSnoozeKey);

  // ── Pick today's focus card content ────────────────────────────────────────
  const focus = pickTodaysFocus({
    nextSessionAt: nextSess ? nextSess.scheduled_at : null,
    nextSessionTimeLabel: nextSessTime,
    checkedInToday,
    openTasks,
    streakDays: streak,
    unreadMessage: latestUnread,
    lastNightSleepHours,
    snoozed: focusSnoozed,
    now,
  });

  // ── Patient-friendly target-area line (plain language, no electrode codes) ─
  function _patientTargetAreaLine() {
    const cond = String(activeCourse?.condition_slug || '').toLowerCase();
    const mod  = String(activeCourse?.modality_slug  || '').toLowerCase();
    if (!cond && !mod) return null;
    if (/depress|mdd/.test(cond)) return 'Target area: left prefrontal — supports mood regulation.';
    if (/anx|gad/.test(cond))      return 'Target area: prefrontal — supports calmer thinking.';
    if (/pain|chronic/.test(cond)) return 'Target area: motor cortex — supports pain modulation.';
    if (/sleep|insomn/.test(cond)) return 'Target area: prefrontal — supports sleep regulation.';
    // Default neutral copy
    return 'Target area set by your care team.';
  }
  const targetAreaLine = _patientTargetAreaLine();

  // ── Render helpers ─────────────────────────────────────────────────────────
  function _focusCardHtml() {
    if (focus.hide) return '';
    const hl = esc(focus.headline);
    const cp = esc(focus.caption);
    const ey = esc(focus.eyebrow);
    const pt = esc(focus.primary.target);
    const pl = esc(focus.primary.label);
    const sl = esc(focus.secondaryLabel);
    const altLine = altVariant
      ? `<div class="pth-focus-alt">Your care team is reviewing a small adjustment to your setup.</div>`
      : '';
    return `
      <div class="pth-focus" data-focus-kind="${esc(focus.kind)}">
        <div class="pth-focus-glow" aria-hidden="true"></div>
        <div class="pth-focus-body">
          <div class="pth-focus-eyebrow">${ey}</div>
          <div class="pth-focus-headline">${hl}</div>
          <div class="pth-focus-caption">${cp}</div>
          <div class="pth-focus-actions">
            <button class="pth-focus-btn pth-focus-btn--primary" onclick="window._navPatient('${pt}')">${pl} <span class="pth-focus-btn-arrow" aria-hidden="true">→</span></button>
            <button class="pth-focus-btn pth-focus-btn--ghost" onclick="window._ptdSnoozeFocus()">${sl}</button>
          </div>
          ${altLine}
        </div>
      </div>`;
  }

  function _quickTilesHtml() {
    const tiles = [];
    // 1. Check-in
    const checkinPending = !checkedInToday;
    const checkinMeta = checkinPending
      ? '1 pending'
      : (streak >= 2
          ? `Done today · <span class="pth-tile-streak" aria-label="${streak} day streak">🔥 ${streak}d</span>`
          : 'Done today');
    tiles.push(`<button class="pth-tile${checkinPending ? ' pth-tile--pending' : ' pth-tile--done'}" id="pth-tile-checkin" onclick="window._ptdOpenCheckin()">
      <span class="pth-tile-ico pth-tile-ico--teal" aria-hidden="true">${checkinPending ? '◉' : '✓'}</span>
      <span class="pth-tile-title">Daily check-in</span>
      <span class="pth-tile-meta">${checkinMeta}</span>
    </button>`);
    // 2. Homework
    const openCount = openTasks.length;
    tiles.push(`<button class="pth-tile${openCount ? ' pth-tile--pending' : ''}" onclick="window._navPatient('patient-homework')">
      <span class="pth-tile-ico pth-tile-ico--blue" aria-hidden="true">✓</span>
      <span class="pth-tile-title">Homework</span>
      <span class="pth-tile-meta">${openCount ? openCount + ' pending' : 'All done'}</span>
    </button>`);
    // 3. Messages
    const unreadCount = messages.filter(m => !m.is_read && m.sender_type !== 'patient').length;
    tiles.push(`<button class="pth-tile${unreadCount ? ' pth-tile--pending' : ''}" onclick="window._navPatient('patient-messages')">
      <span class="pth-tile-ico pth-tile-ico--rose" aria-hidden="true">✉</span>
      <span class="pth-tile-title">Messages</span>
      <span class="pth-tile-meta">${unreadCount ? unreadCount + ' new' : 'No new messages'}</span>
    </button>`);
    return tiles.join('');
  }

  function _progressCardHtml() {
    // Headline metric
    let metricLine;
    if (progressPct != null && totalPlanned) {
      metricLine = `You're <strong style="color:var(--teal)">${progressPct}%</strong> through your course · ${sessDelivered} of ${totalPlanned} sessions done.`;
    } else if (sessDelivered > 0) {
      metricLine = `You've completed <strong style="color:var(--teal)">${sessDelivered}</strong> session${sessDelivered === 1 ? '' : 's'} so far.`;
    } else {
      metricLine = `Your course hasn't started yet — your first session will appear here when it is available in the portal workflow.`;
    }
    const deltaHtml = outcomeDelta
      ? `<div class="pth-progress-delta">${outcomeDelta}</div>`
      : `<div class="pth-progress-delta pth-progress-delta--muted">Complete your first assessment to see how your scores change over time.</div>`;
    return `
      <div class="pth-card pth-card--progress">
        <div class="pth-card-head">
          <div class="pth-card-title">Your progress</div>
          <button class="pth-ghost-btn" onclick="window._navPatient('pt-outcomes')">See details →</button>
        </div>
        <div class="pth-progress-metric">${metricLine}</div>
        ${deltaHtml}
        ${targetAreaLine ? `<div class="pth-target-line">${esc(targetAreaLine)}</div>` : ''}
      </div>`;
  }

  function _homeworkCardHtml() {
    if (!homeTasks.length) {
      return `
        <div class="pth-card pth-card--homework">
          <div class="pth-card-head">
            <div class="pth-card-title">Your homework</div>
          </div>
          <div class="pth-empty">
            <div class="pth-empty-title">No tasks yet</div>
            <div class="pth-empty-sub">Tasks will appear here when they are available in the portal workflow.</div>
          </div>
        </div>`;
    }
    const top3 = openTasks.slice(0, 3);
    const rows = top3.length
      ? top3.map(t => {
          const title = t.title || t.name || 'Home task';
          const sub = t.category || t.task_type || 'Pending';
          return `<div class="pth-hw-row">
            <span class="pth-hw-dot" aria-hidden="true"></span>
            <div class="pth-hw-body">
              <div class="pth-hw-title">${esc(title)}</div>
              <div class="pth-hw-sub">${esc(sub)}</div>
            </div>
            <button class="pth-hw-btn" onclick="window._navPatient('patient-homework')">Start</button>
          </div>`;
        }).join('')
      : `<div class="pth-empty">
          <div class="pth-empty-title">All caught up</div>
          <div class="pth-empty-sub">Nice work — nothing left for today.</div>
        </div>`;
    return `
      <div class="pth-card pth-card--homework">
        <div class="pth-card-head">
          <div class="pth-card-title">Your homework</div>
          <button class="pth-ghost-btn" onclick="window._navPatient('patient-homework')">View all →</button>
        </div>
        <div class="pth-hw-list">${rows}</div>
      </div>`;
  }

  function _careTeamCardHtml() {
    if (!careTeam.length) {
      return `
        <div class="pth-card pth-card--team">
          <div class="pth-card-head">
            <div class="pth-card-title">Care team</div>
          </div>
          <div class="pth-empty">
            <div class="pth-empty-title">No team assigned yet</div>
            <div class="pth-empty-sub">Once assigned, your clinicians will appear here.</div>
          </div>
        </div>`;
    }
    const avatars = careTeam.map(m => `
      <div class="pth-avatar" title="${esc(m.name)} · ${esc(m.role)}">
        <span class="pth-avatar-inner" style="background:${m.accent}">${esc(m.avatar)}</span>
      </div>`).join('');
    return `
      <div class="pth-card pth-card--team">
        <div class="pth-card-head">
          <div class="pth-card-title">Care team</div>
        </div>
        <div class="pth-team-avatars">${avatars}</div>
        <button class="pth-team-btn" onclick="window._navPatient('patient-messages')">Message your team →</button>
      </div>`;
  }

  function _wellnessSnapshotHtml() {
    if (!wearable.hasData) {
      return `
        <div class="pth-card pth-card--wellness">
          <div class="pth-card-head">
            <div class="pth-card-title">Wellness snapshot</div>
          </div>
          <div class="pth-empty">
            <div class="pth-empty-title">No wearable data yet</div>
            <div class="pth-empty-sub">Connect a device to see sleep, HRV, and resting HR trends.</div>
            <button class="pth-inline-btn" onclick="window._navPatient('patient-wearables')">Connect your device →</button>
          </div>
        </div>`;
    }
    // Inline target bands let patients self-interpret the numbers without
    // guessing whether their sleep / HRV / RHR is in a typical range.
    // Conservative, non-alarming copy — we surface the band, not a verdict.
    const sleepStat = wearable.sleepAvg != null
      ? { val: wearable.sleepAvg.toFixed(1) + 'h avg sleep',   band: 'target 7–9h',     tip: 'Most adults feel best on 7 to 9 hours.' }
      : { val: 'Sleep: —',                                     band: '',                tip: '' };
    const hrvStat = wearable.hrvAvg != null
      ? { val: Math.round(wearable.hrvAvg) + 'ms HRV',         band: 'typical 20–80ms', tip: 'Heart-rate variability varies by age and fitness; higher is generally better.' }
      : { val: 'HRV: —',                                       band: '',                tip: '' };
    const rhrStat = wearable.rhrAvg != null
      ? { val: Math.round(wearable.rhrAvg) + ' bpm RHR',       band: 'typical 60–100',  tip: 'Resting heart rate below 80 is generally healthy; trained athletes run lower.' }
      : { val: 'RHR: —',                                       band: '',                tip: '' };
    const renderStat = (s) => s.band
      ? `<div class="pth-wellness-stat" title="${esc(s.tip)}">
           <span class="pth-wellness-stat-val">${esc(s.val)}</span>
           <span class="pth-wellness-stat-band">${esc(s.band)}</span>
         </div>`
      : `<div class="pth-wellness-stat">${esc(s.val)}</div>`;
    const ringValDisplay = wellnessVal || '—';
    const ringOffset = Math.max(0, 389 - (wellnessVal / 100) * 389).toFixed(1);
    const ringAriaLabel = wellnessVal
      ? `Wellness score ${wellnessVal} out of 100, based on check-ins and wearable averages`
      : 'Wellness score not yet available';
    // Freshness chip — how recent is the latest wearable reading?
    const freshness = (() => {
      if (!wearable.lastDate) return null;
      const d = new Date(wearable.lastDate);
      if (!Number.isFinite(d.getTime())) return null;
      const days = Math.floor((Date.now() - d.getTime()) / 86400000);
      if (days <= 0) return { label: 'Synced today',     tone: 'fresh' };
      if (days === 1) return { label: 'Synced yesterday', tone: 'fresh' };
      if (days <= 3)  return { label: `Synced ${days}d ago`, tone: 'ok'   };
      return { label: `Last sync ${days}d ago`,          tone: 'stale' };
    })();
    const freshnessChip = freshness
      ? `<span class="pth-wellness-sync pth-wellness-sync--${freshness.tone}" title="Most recent wearable reading">
           <span class="pth-wellness-sync-dot" aria-hidden="true"></span>${esc(freshness.label)}
         </span>`
      : '';
    return `
      <div class="pth-card pth-card--wellness">
        <div class="pth-card-head">
          <div class="pth-card-title">Wellness snapshot</div>
          <button class="pth-ghost-btn" onclick="window._navPatient('pt-wellness')">Details →</button>
        </div>
        <div class="pth-wellness-body">
          <div class="pth-ring" role="img" aria-label="${esc(ringAriaLabel)}">
            <svg width="110" height="110" viewBox="0 0 150 150" aria-hidden="true" focusable="false">
              <circle cx="75" cy="75" r="62" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="10"/>
              <circle cx="75" cy="75" r="62" fill="none" stroke="url(#pth-ring-grad)" stroke-width="10" stroke-linecap="round" stroke-dasharray="389" stroke-dashoffset="${ringOffset}"/>
              <defs>
                <linearGradient id="pth-ring-grad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#00d4bc"/><stop offset="100%" stop-color="#9b7fff"/></linearGradient>
              </defs>
            </svg>
            <div class="pth-ring-center" aria-hidden="true">
              <div class="pth-ring-num">${ringValDisplay}</div>
              <div class="pth-ring-lbl">Wellness</div>
            </div>
          </div>
          <div class="pth-wellness-stats">
            ${freshnessChip}
            ${renderStat(sleepStat)}
            ${renderStat(hrvStat)}
            ${renderStat(rhrStat)}
          </div>
        </div>
      </div>`;
  }

  // ── Design #08 helpers (hero countdown, quick tiles, rich progress, mood grid,
  //    wellness metrics, homework list, care team + upcoming) ────────────────
  const daysToNext = nextSessDate
    ? Math.max(0, Math.ceil((nextSessDate.getTime() - Date.now()) / 86400000))
    : null;
  const nextSessDowLabel = nextSessDate
    ? nextSessDate.toLocaleDateString(loc, { weekday: 'long' })
    : null;
  const nextSessTitle = nextSess
    ? (nextSess.modality || nextSess.session_type || nextSess.protocol_name || 'Next session')
    : null;
  const nextSessSub = (() => {
    if (!nextSess) return null;
    const parts = [];
    if (nextSess.clinician_name) parts.push(esc(nextSess.clinician_name));
    if (nextSess.location || nextSess.room) parts.push(esc(nextSess.location || nextSess.room));
    if (activeCourse?.session_count != null && activeCourse?.total_sessions_planned) {
      parts.push(`session ${activeCourse.session_count + 1}/${activeCourse.total_sessions_planned}`);
    }
    return parts.join(' · ') || null;
  })();

  function _pth2HeroSubHtml() {
    if (progressPct != null && outcomeDelta) {
      return `You're <strong style="color:var(--teal)">${progressPct}%</strong> through your course. ${outcomeDelta}`;
    }
    if (progressPct != null) {
      return `You're <strong style="color:var(--teal)">${progressPct}%</strong> through your course — ${sessDelivered} of ${totalPlanned} sessions done.`;
    }
    if (sessDelivered > 0) {
      return `You've completed <strong style="color:var(--teal)">${sessDelivered}</strong> session${sessDelivered === 1 ? '' : 's'} so far.`;
    }
    return `Your first session will appear here when it is available in the portal workflow.`;
  }

  function _pth2QuickTilesHtml() {
    const tiles = [];
    const checkinPending = !checkedInToday;
    tiles.push(`
      <button class="pth2-tile" id="pth-tile-checkin" onclick="window._ptdOpenCheckin()">
        <div class="pth2-tile-ico pth2-tile-ico--teal" aria-hidden="true">
          <svg width="18" height="18"><use href="#i-clipboard"/></svg>
        </div>
        <div class="pth2-tile-title">Daily check-in</div>
        <div class="pth2-tile-sub">Mood, sleep, energy · under a minute</div>
        <div class="pth2-tile-meta">${checkinPending ? 'Due today' : 'Done today'}</div>
      </button>`);

    const nextTask = openTasks[0] || null;
    if (nextTask) {
      tiles.push(`
        <button class="pth2-tile pth2-tile--blue" onclick="window._navPatient('patient-homework')">
          <div class="pth2-tile-ico pth2-tile-ico--blue" aria-hidden="true">
            <svg width="18" height="18"><use href="#i-video"/></svg>
          </div>
          <div class="pth2-tile-title">${esc(nextTask.title || 'Today\u2019s exercise')}</div>
          <div class="pth2-tile-sub">${esc(nextTask.category || nextTask.task_type || 'Home practice')}</div>
          <div class="pth2-tile-meta">${openTasks.length > 1 ? openTasks.length + ' pending' : 'Home practice'}</div>
        </button>`);
    } else {
      tiles.push(`
        <button class="pth2-tile pth2-tile--blue" onclick="window._navPatient('patient-homework')">
          <div class="pth2-tile-ico pth2-tile-ico--blue" aria-hidden="true">
            <svg width="18" height="18"><use href="#i-video"/></svg>
          </div>
          <div class="pth2-tile-title">Homework</div>
          <div class="pth2-tile-sub">No tasks assigned right now</div>
          <div class="pth2-tile-meta">All clear</div>
        </button>`);
    }

    tiles.push(`
      <button class="pth2-tile pth2-tile--violet" onclick="window._navPatient('pt-learn')">
        <div class="pth2-tile-ico pth2-tile-ico--violet" aria-hidden="true">
          <svg width="18" height="18"><use href="#i-book-open"/></svg>
        </div>
        <div class="pth2-tile-title">Education Library</div>
        <div class="pth2-tile-sub">${patientEvidence.phenotypeTags.length ? esc(patientEvidence.phenotypeTags.slice(0, 3).join(' · ')) : (targetAreaLine ? esc(targetAreaLine) : (liveEvidence.totalPapers.toLocaleString() + '+ papers, courses, podcasts & clinic videos'))}</div>
        <div class="pth2-tile-meta">${patientEvidence.live ? (patientEvidence.highlightCount + ' evidence highlights') : 'Explore'}</div>
      </button>`);

    const unreadCount = messages.filter(m => !m.is_read && m.sender_type !== 'patient').length;
    if (latestUnread) {
      const sender = latestUnread.sender_name || latestUnread.sender_display_name || 'Your care team';
      const preview = latestUnread.preview || latestUnread.body || latestUnread.subject || '';
      tiles.push(`
        <button class="pth2-tile pth2-tile--rose" onclick="window._navPatient('patient-messages')">
          <div class="pth2-tile-ico pth2-tile-ico--rose" aria-hidden="true">
            <svg width="18" height="18"><use href="#i-mail"/></svg>
          </div>
          <div class="pth2-tile-title">Message from ${esc(sender)}</div>
          <div class="pth2-tile-sub">${esc(String(preview).slice(0, 80))}</div>
          <div class="pth2-tile-meta" style="color:var(--rose,#ff6b9d)">${unreadCount} unread</div>
        </button>`);
    } else {
      tiles.push(`
        <button class="pth2-tile pth2-tile--rose" onclick="window._navPatient('patient-messages')">
          <div class="pth2-tile-ico pth2-tile-ico--rose" aria-hidden="true">
            <svg width="18" height="18"><use href="#i-mail"/></svg>
          </div>
          <div class="pth2-tile-title">Messages</div>
          <div class="pth2-tile-sub">No new messages from your team</div>
          <div class="pth2-tile-meta">Inbox</div>
        </button>`);
    }

    return tiles.join('');
  }

  function _pth2OutcomeBarsHtml() {
    if (!outcomeGroups.length) {
      return `<div class="pth2-empty-inline">Complete your first assessment to start tracking scores here.</div>`;
    }
    const rows = outcomeGroups.slice(0, 4).map(g => {
      const gm = outcomeGoalMarker(g.latest, g.baseline);
      const cur = g.latest ? Number(g.latest.score_numeric) : null;
      const base = g.baseline ? Number(g.baseline.score_numeric) : null;
      const goal = gm && gm.goal != null ? Number(gm.goal) : null;
      const max = Math.max(base || 0, cur || 0, goal || 0, 1);
      const pct = cur != null ? Math.max(4, Math.min(100, Math.round((1 - (cur / max)) * 100 + 12))) : 0;
      const goalPct = goal != null ? Math.max(4, Math.min(100, Math.round((1 - (goal / max)) * 100 + 12))) : null;
      const valTxt = cur != null ? cur : '—';
      const goalTxt = goal != null ? ` <em>&rarr; goal ${goal}</em>` : '';
      const subText = g.baseline && g.latest && g.baseline !== g.latest
        ? `From ${base} at start · week ${outcomeGroups.indexOf(g) + 1}`
        : 'Awaiting more data';
      return `
        <div class="pth2-outcome-row">
          <div class="pth2-outcome-top">
            <div>
              <div class="pth2-outcome-name">${esc(g.template_name || 'Outcome')}</div>
              <div class="pth2-outcome-sub">${esc(subText)}</div>
            </div>
            <div class="pth2-outcome-val">${esc(String(valTxt))}${goalTxt}</div>
          </div>
          <div class="pth2-outcome-bar pth2-outcome-bar--${gm && gm.down ? 'down' : 'up'}">
            <span style="width:${pct}%"></span>
            ${goalPct != null ? `<span class="pth2-outcome-marker" style="left:${goalPct}%" title="Goal"></span>` : ''}
          </div>
        </div>`;
    }).join('');

    const adherence = (() => {
      if (!homeTasks.length) return null;
      const done = homeTasks.filter(t => t.completed || t.done).length;
      return Math.round((done / homeTasks.length) * 100);
    })();
    const adherenceRow = adherence != null ? `
      <div class="pth2-outcome-row">
        <div class="pth2-outcome-top">
          <div>
            <div class="pth2-outcome-name">Homework adherence</div>
            <div class="pth2-outcome-sub">${homeTasks.filter(t => t.completed || t.done).length} of ${homeTasks.length} tasks complete</div>
          </div>
          <div class="pth2-outcome-val">${adherence}<em>%</em></div>
        </div>
        <div class="pth2-outcome-bar"><span style="width:${adherence}%"></span></div>
      </div>` : '';

    return rows + adherenceRow;
  }

  function _pth2MoodGridHtml() {
    const cells = [];
    let logged = 0;
    for (let i = 27; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const iso = d.toISOString().slice(0, 10);
      const raw = (() => { try { return localStorage.getItem('ds_checkin_' + iso); } catch (_e) { return null; } })();
      let level = 0;
      if (raw) {
        try {
          const c = JSON.parse(raw);
          const avg = ((Number(c.mood) || 0) + (Number(c.sleep) || 0) + (Number(c.energy) || 0)) / 3;
          if (avg >= 8) level = 5;
          else if (avg >= 6) level = 4;
          else if (avg >= 4) level = 3;
          else if (avg >= 2) level = 2;
          else if (avg > 0) level = 1;
          if (avg > 0) logged++;
        } catch (_e) { /* ignore */ }
      }
      const today = i === 0 ? ' data-today="1"' : '';
      cells.push(`<div class="pth2-mood-cell" data-level="${level}"${today} title="${iso}"></div>`);
    }
    return {
      html: cells.join(''),
      logged,
    };
  }

  function _pth2WellnessMetricsHtml() {
    if (!wearable.hasData) {
      return `
        <div class="pth2-wellness-empty">
          <div class="pth2-wellness-empty-title">No wearable data yet</div>
          <div class="pth2-wellness-empty-sub">Connect a device for sleep, HRV, and heart-rate trends.</div>
          <button class="pth2-inline-btn" onclick="window._navPatient('patient-wearables')">Connect device &rarr;</button>
        </div>`;
    }
    const rows = [];
    if (wearable.sleepAvg != null) {
      const pct = Math.max(4, Math.min(100, Math.round((wearable.sleepAvg / 9) * 100)));
      rows.push({ label: 'Sleep',       val: wearable.sleepAvg.toFixed(1) + 'h', pct, grad: 'linear-gradient(90deg,var(--teal,#00d4bc),var(--blue,#4a9eff))', col: 'var(--teal,#00d4bc)' });
    }
    if (wearable.hrvAvg != null) {
      const pct = Math.max(4, Math.min(100, Math.round((wearable.hrvAvg / 80) * 100)));
      rows.push({ label: 'HRV',         val: Math.round(wearable.hrvAvg) + 'ms', pct, grad: 'linear-gradient(90deg,var(--violet,#9b7fff),var(--blue,#4a9eff))', col: 'var(--violet,#9b7fff)' });
    }
    if (wearable.rhrAvg != null) {
      const pct = Math.max(4, Math.min(100, Math.round(100 - ((wearable.rhrAvg - 50) / 50) * 100)));
      rows.push({ label: 'Resting HR',  val: Math.round(wearable.rhrAvg) + ' bpm', pct, grad: 'linear-gradient(90deg,var(--green,#4ade80),var(--teal,#00d4bc))', col: 'var(--green,#4ade80)' });
    }
    if (wearable.stepsAvg != null) {
      const pct = Math.max(4, Math.min(100, Math.round((wearable.stepsAvg / 10000) * 100)));
      rows.push({ label: 'Steps',       val: (wearable.stepsAvg / 1000).toFixed(1) + 'k', pct, grad: 'linear-gradient(90deg,var(--amber,#ffb547),var(--teal,#00d4bc))', col: 'var(--amber,#ffb547)' });
    }
    if (!rows.length) {
      return `<div class="pth2-wellness-empty-sub">Wearable syncing — metrics will appear shortly.</div>`;
    }
    return rows.map(r => `
      <div class="pth2-metric-row">
        <div class="pth2-metric-top">
          <span class="pth2-metric-label">${esc(r.label)}</span>
          <span class="pth2-metric-val" style="color:${r.col}">${esc(r.val)}</span>
        </div>
        <div class="pth2-metric-bar"><span style="width:${r.pct}%;background:${r.grad}"></span></div>
      </div>`).join('');
  }

  function _pth2TargetPanelHtml() {
    if (!activeCourse && !targetAreaLine) return '';
    const mod = activeCourse?.modality_slug || activeCourse?.modality_name || '';
    const cond = activeCourse?.condition_slug || activeCourse?.condition_name || '';
    const modLabel = mod ? esc(String(mod).toUpperCase()) : 'Your treatment';
    const condLabel = cond ? esc(cond) : '';
    return `
      <div class="pth2-target">
        <div class="pth2-target-label">Your treatment${condLabel ? ' · ' + condLabel : ''}</div>
        <div class="pth2-target-body">
          <svg viewBox="0 0 120 120" width="56" height="56" aria-hidden="true" class="pth2-target-svg">
            <circle cx="60" cy="60" r="48" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>
            <polygon points="60,20 56,27 64,27" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.35)" stroke-width="1"/>
            <ellipse cx="14" cy="60" rx="3" ry="8" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.35)"/>
            <ellipse cx="106" cy="60" rx="3" ry="8" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.35)"/>
            <circle cx="46" cy="46" r="7" fill="var(--teal,#00d4bc)" stroke="rgba(255,255,255,0.8)" stroke-width="1.5"/>
            <circle cx="72" cy="36" r="6" fill="var(--rose,#ff6b9d)" stroke="rgba(255,255,255,0.8)" stroke-width="1.5"/>
            <line x1="46" y1="46" x2="72" y2="36" stroke="rgba(255,255,255,0.35)" stroke-width="1.2" stroke-dasharray="3,2"/>
          </svg>
          <div class="pth2-target-text">
            <div class="pth2-target-title">${modLabel}${condLabel ? ' — ' + condLabel : ''}</div>
            <div class="pth2-target-sub">${targetAreaLine ? esc(targetAreaLine) : 'Target area set by your care team.'}</div>
          </div>
        </div>
        ${(() => {
          const slug = (cond || '').toLowerCase().replace(/\s+/g,'-').replace(/[()]/g,'');
          const ev = slug ? getConditionEvidence(slug) : null;
          return ev ? `<div style="margin-top:8px;font-size:11px;color:var(--text-tertiary);display:flex;align-items:center;gap:6px"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>${ev.paperCount.toLocaleString()} research papers &middot; ${ev.rctCount.toLocaleString()} RCTs indexed for this condition</div>` : '';
        })()}
      </div>`;
  }

  function _pth2HomeworkListHtml() {
    if (!homeTasks.length) {
      return `
        <div class="pth2-empty">
          <div class="pth2-empty-title">No tasks yet</div>
          <div class="pth2-empty-sub">Tasks will appear here when they are available in the portal workflow.</div>
        </div>`;
    }
    const rows = homeTasks.slice(0, 4).map(t => {
      const done = !!(t.completed || t.done);
      const cat = t.category || t.task_type || 'Home task';
      const title = t.title || t.name || 'Home task';
      return `
        <div class="pth2-hw-item${done ? ' pth2-hw-item--done' : ''}">
          <div class="pth2-hw-ico"><svg width="16" height="16"><use href="#i-wave"/></svg></div>
          <div class="pth2-hw-body">
            <div class="pth2-hw-title">${esc(title)}</div>
            <div class="pth2-hw-sub">${esc(cat)}</div>
          </div>
          <div class="pth2-hw-action">
            ${done
              ? '<span class="pth2-chip pth2-chip--green">&check; Done</span>'
              : '<button class="pth2-inline-btn" onclick="window._navPatient(\'patient-homework\')">Open</button>'}
          </div>
        </div>`;
    }).join('');
    const streakLine = streak > 0
      ? `<div class="pth2-streak"><svg width="14" height="14" style="color:var(--teal,#00d4bc);flex-shrink:0"><use href="#i-sparkle"/></svg><span><strong>Streak: ${streak} day${streak === 1 ? '' : 's'}.</strong> Consistency is a strong predictor of treatment response.</span></div>`
      : '';
    return rows + streakLine;
  }

  function _pth2CareTeamHtml() {
    if (!careTeam.length && !upcomingSessions.length) {
      return `
        <div class="pth2-empty">
          <div class="pth2-empty-title">No care team assigned yet</div>
          <div class="pth2-empty-sub">Once assigned, your clinicians will appear here.</div>
        </div>`;
    }
    const members = careTeam.map(m => `
      <div class="pth2-member">
        <div class="pth2-avatar" style="background:${m.accent}">${esc(m.avatar)}</div>
        <div class="pth2-member-body">
          <div class="pth2-member-name">${esc(m.name)}</div>
          <div class="pth2-member-role">${esc(m.role)}</div>
        </div>
      </div>`).join('');

    const upcoming = upcomingSessions.slice(0, 2).map(s => {
      const d = new Date(s.scheduled_at);
      const dow = d.toLocaleDateString(loc, { weekday: 'short' });
      const day = d.getDate();
      const time = d.toLocaleTimeString(loc, { hour: 'numeric', minute: '2-digit' });
      const title = s.modality || s.session_type || s.protocol_name || 'Session';
      const sub = [time, s.location || s.room, s.duration_min ? s.duration_min + ' min' : null].filter(Boolean).join(' · ');
      const status = s.confirmed || s.status === 'confirmed'
        ? '<span class="pth2-chip pth2-chip--teal">Confirmed</span>'
        : s.is_video || s.session_mode === 'video'
          ? '<span class="pth2-chip pth2-chip--blue">Video</span>'
          : '';
      return `
        <div class="pth2-appt">
          <div class="pth2-appt-date">
            <div class="pth2-appt-dow">${esc(dow)}</div>
            <div class="pth2-appt-day">${day}</div>
          </div>
          <div class="pth2-appt-body">
            <div class="pth2-appt-title">${esc(title)}</div>
            <div class="pth2-appt-sub">${esc(sub)}</div>
          </div>
          ${status}
        </div>`;
    }).join('');

    return `
      <div class="pth2-members">${members}</div>
      ${upcoming ? `
        <div class="pth2-appt-section">
          <div class="pth2-section-label">Upcoming</div>
          <div class="pth2-appt-list">${upcoming}</div>
        </div>` : ''}`;
  }

  // ────────────────────────────────────────────────────────────────────────
  // Design · Home dashboard (hm-*) — pulls from every real fetch above.
  // ────────────────────────────────────────────────────────────────────────

  // Kicker line: weekday · full date · HH:MM · tz city (fall back to "Local").
  const _hmKicker = (() => {
    try {
      const d = new Date();
      const datePart = d.toLocaleDateString(loc, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
      const timePart = d.toLocaleTimeString(loc, { hour: 'numeric', minute: '2-digit' });
      const tz = (Intl.DateTimeFormat().resolvedOptions().timeZone || '').split('/').pop().replace(/_/g, ' ') || 'Local';
      return `${datePart} · ${timePart} · ${tz}`;
    } catch (_e) { return todayStr; }
  })();

  // Personalised sub: weave together progressPct / outcomeDelta / streak.
  const _hmSub = (() => {
    const weekN = (totalPlanned && sessDelivered) ? Math.max(1, Math.ceil(sessDelivered / Math.max(1, Math.round(totalPlanned / 10)))) : null;
    const weekOfStr = (weekN && totalPlanned) ? `Week ${weekN} of ${Math.max(10, Math.round(totalPlanned / 2))}` : null;
    const bits = [];
    if (activeCourse && weekOfStr) bits.push(`You're on <strong>${esc(weekOfStr)}</strong> of the ${esc(modalityCondShort(activeCourse))} course.`);
    if (outcomeGroups[0] && outcomeGroups[0].latest && outcomeGroups[0].baseline) {
      const tg = outcomeGroups[0];
      const base = Number(tg.baseline.score_numeric), cur = Number(tg.latest.score_numeric);
      if (Number.isFinite(base) && Number.isFinite(cur) && base > 0) {
        const pct = Math.round((base - cur) / base * 100);
        bits.push(`${esc(tg.template_name)} is down to <strong>${cur} (${_hmSeverityLabel(tg.template_slug || tg.template_name, cur)})</strong>${pct > 0 ? ` — a ${pct}% drop since Week 1` : ''}.`);
      }
    }
    if (nextSess) {
      const t = nextSessTime || '';
      const home = String(nextSess.location || '').toLowerCase().includes('home') || nextSess.is_home;
      bits.push(`${home ? 'Home' : 'In-clinic'} session ${t ? 'at ' + esc(t) : 'today'}${home ? '' : ' with your care team'}.`);
    } else if (openTasks.length) {
      bits.push(`${openTasks.length} item${openTasks.length === 1 ? '' : 's'} on your plan today.`);
    }
    return bits.join(' ') || `You have <strong>no active course</strong> yet — your care team will take it from here.`;
  })();

  // KPI helpers — primary scale current value, delta, phase label.
  function _hmPrimaryKpi() {
    const g = outcomeGroups[0] || null;
    if (!g || !g.latest) return { name:'PHQ-9', val:null, band:null, delta:null, max:27 };
    const base = g.baseline ? Number(g.baseline.score_numeric) : null;
    const cur  = Number(g.latest.score_numeric);
    const delta = (Number.isFinite(base) && Number.isFinite(cur)) ? (base - cur) : null;
    return { name: g.template_name || 'PHQ-9', val: cur, band: _hmSeverityLabel(g.template_slug || g.template_name, cur), delta, max: /phq/i.test(g.template_slug || '') ? 27 : 21 };
  }
  const _hmPrimary = _hmPrimaryKpi();
  const _hmMoodAvg = (() => {
    const vals = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      try {
        const raw = localStorage.getItem('ds_checkin_' + d);
        if (raw) { const c = JSON.parse(raw); if (c.mood) vals.push(Number(c.mood)); }
      } catch (_e) { /* ignore */ }
    }
    if (!vals.length) return null;
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
  })();

  // Morning AI nudge: sleep-aware content when last night's sleep < 7h.
  const _hmNudge = (() => {
    try { if (localStorage.getItem('ds_hm_nudge_dismiss_' + todayStr)) return null; } catch (_e) {}
    if (lastNightSleepHours != null && lastNightSleepHours < 7) {
      const hh = Math.floor(lastNightSleepHours);
      const mm = Math.round((lastNightSleepHours - hh) * 60);
      return {
        kind: 'sleep',
        kicker: 'Synaps AI · Morning note',
        body: `Your sleep last night was ${hh}h ${String(mm).padStart(2,'0')}m — a bit short. That often shows up as low mood mid-morning. <strong>Try a 20-minute outdoor walk after breakfast</strong> — the light + movement combo is on your plan today.`,
        primary: { label: 'Open homework', action: 'walk' },
      };
    }
    if (openTasks.length >= 3) {
      return {
        kind: 'plan',
        kicker: 'Synaps AI · Morning note',
        body: `You have ${openTasks.length} items on your plan today. The first one — <strong>${esc(openTasks[0].title || 'a short activity')}</strong> — usually takes under 10 minutes.`,
        primary: { label: 'Open plan', action: 'plan' },
      };
    }
    return null;
  })();

  // Today's plan — render from homeTasks with time + icon colour by task_type.
  function _hmTaskIcoClass(tp) {
    const t = String(tp || '').toLowerCase();
    if (/check|mood/.test(t))              return 'green';
    if (/breath|wave|meditat/.test(t))     return 'blue';
    if (/walk|exercise|move/.test(t))      return 'orange';
    if (/tdcs|tms|stim|brain/.test(t))     return 'teal';
    if (/journal|book|read/.test(t))       return 'pink';
    if (/sleep|bed/.test(t))               return 'purple';
    return 'teal';
  }
  function _hmTaskIcoSvg(tp) {
    const t = String(tp || '').toLowerCase();
    if (/check|mood/.test(t))              return '#i-check';
    if (/breath|wave|meditat/.test(t))     return '#i-wave';
    if (/walk|exercise|move/.test(t))      return '#i-walk';
    if (/tdcs|tms|stim|brain/.test(t))     return '#i-brain';
    if (/journal|book|read/.test(t))       return '#i-book-open';
    return '#i-check';
  }
  function _hmPlanHtml() {
    if (!homeTasks.length) {
      return `<div class="pth2-empty"><div class="pth2-empty-title">No tasks for today</div><div class="pth2-empty-sub">Your plan will appear here when it is available in the portal workflow.</div></div>`;
    }
    return homeTasks.slice(0, 5).map(t => {
      const done = !!(t.completed || t.done);
      const ico = _hmTaskIcoClass(t.task_type);
      const svg = _hmTaskIcoSvg(t.task_type);
      const title = t.title || 'Today\u2019s task';
      const sub = t.instructions || t.category || t.task_type || (done ? 'Completed' : 'Tap to start');
      const timeTop = t._at || (t.due_on ? 'Today' : '—');
      const timeSub = t._when || (done ? 'done' : '');
      let right = '';
      if (done) {
        right = `<div class="hm-tl-done">\u2713 ${esc(t._doneAt || 'done')}</div>`;
      } else if (t.task_type === 'walk' || /walk/.test(String(t.title||'').toLowerCase())) {
        right = `<button class="hm-tl-action primary" onclick="window._hmStartTask('${esc(t.id)}', 'walk')">Open</button>`;
      } else if (t.task_type === 'tdcs' || /tdcs/.test(String(t.title||'').toLowerCase())) {
        right = `<button class="hm-tl-action" onclick="window._hmStartTask('${esc(t.id)}', 'tdcs')">Prep</button>`;
      } else {
        right = `<button class="hm-tl-action" onclick="window._hmStartTask('${esc(t.id)}', 'reminder')">Open</button>`;
      }
      const pill = done
        ? '<span class="hm-tl-pill done">Done</span>'
        : (t.task_type === 'walk' ? '<span class="hm-tl-pill soon">Up next</span>' : t.task_type === 'tdcs' ? '<span class="hm-tl-pill up">Device ready</span>' : '');
      return `
        <div class="hm-tl-item${done ? ' done' : ''}" data-task-id="${esc(t.id || '')}">
          <div class="hm-tl-time">${esc(timeTop)}${timeSub ? '<small>' + esc(timeSub) + '</small>' : ''}</div>
          <div class="hm-tl-ico ${ico}"><svg width="16" height="16"><use href="${svg}"/></svg></div>
          <div class="hm-tl-body">
            <div class="hm-tl-title">${esc(title)}${pill}</div>
            <div class="hm-tl-sub">${esc(t._sub || sub)}</div>
          </div>
          ${right}
        </div>`;
    }).join('');
  }

  // Progress snapshot: up to 4 outcome groups with mini sparkline.
  function _hmProgHtml() {
    if (!outcomeGroups.length) {
      return `<div class="pth2-empty" style="grid-column:1/-1"><div class="pth2-empty-title">No assessments yet</div><div class="pth2-empty-sub">Scores appear here once you complete your first check-in.</div></div>`;
    }
    const palettes = [
      { stroke:'#00d4bc', id:'hmSparkA' },
      { stroke:'#4a9eff', id:'hmSparkB' },
      { stroke:'#4ade80', id:'hmSparkC' },
      { stroke:'#ffa85b', id:'hmSparkD' },
    ];
    return outcomeGroups.slice(0, 4).map((g, i) => {
      const pal = palettes[i % palettes.length];
      const vals = (g.all || (g.latest ? [g.baseline, g.latest].filter(Boolean) : [])).map(o => Number(o.score_numeric)).filter(Number.isFinite);
      const cur = vals.length ? vals[vals.length - 1] : (g.latest ? Number(g.latest.score_numeric) : null);
      const base = vals.length ? vals[0] : (g.baseline ? Number(g.baseline.score_numeric) : null);
      const delta = (Number.isFinite(base) && Number.isFinite(cur)) ? (base - cur) : null;
      const bandCls = _hmBandClass(g.template_slug || g.template_name, cur);
      const bandLbl = _hmSeverityLabel(g.template_slug || g.template_name, cur) || 'Current';
      const sparkPts = (() => {
        if (vals.length < 2) return null;
        const maxV = Math.max(...vals), minV = Math.min(...vals);
        const rng = (maxV - minV) || 1;
        return vals.map((v, j) => {
          const x = (vals.length === 1) ? 60 : (j / (vals.length - 1)) * 120;
          const y = 24 - ((v - minV) / rng) * 18;
          return x.toFixed(1) + ',' + y.toFixed(1);
        }).join(' ');
      })();
      return `
        <div class="hm-prog-item">
          <div class="hm-prog-top">
            <div>
              <div class="hm-prog-name">${esc(g.template_name || 'Scale')}</div>
              <div class="hm-prog-val">${cur != null ? esc(String(cur)) : '—'}</div>
            </div>
            <span class="hm-prog-band ${bandCls}">${esc(bandLbl)}</span>
          </div>
          ${sparkPts ? `
          <svg class="hm-prog-spark" viewBox="0 0 120 30" preserveAspectRatio="none">
            <defs><linearGradient id="${pal.id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${pal.stroke}" stop-opacity="0.35"/><stop offset="100%" stop-color="${pal.stroke}" stop-opacity="0"/></linearGradient></defs>
            <polyline points="${sparkPts}" fill="none" stroke="${pal.stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <polygon points="${sparkPts} 120,30 0,30" fill="url(#${pal.id})"/>
          </svg>` : '<div class="hm-prog-spark" style="opacity:0.4;font-size:10px;color:var(--text-tertiary);display:flex;align-items:center;padding-left:6px">Need more data</div>'}
          <div class="hm-prog-delta ${(delta != null && delta > 0) ? 'good' : 'bad'}">${delta != null ? (delta > 0 ? `↓ ${delta} point${delta === 1 ? '' : 's'} since baseline` : `↑ ${Math.abs(delta)} since baseline`) : 'Tracking'}</div>
        </div>`;
    }).join('');
  }

  // Next session card.
  function _hmNextSessHtml() {
    if (!nextSess) {
      return `
        <div class="hm-next-wrap">
          <div class="hm-next-kicker">Next clinical session</div>
          <div class="hm-next-title">No session scheduled yet</div>
          <div class="hm-next-sub">Your next session will appear here when it is available in the portal workflow. Reach out if you'd like to check in.</div>
          <div class="hm-next-actions">
            <button class="btn btn-primary btn-sm" onclick="window._navPatient('patient-messages')"><svg width="13" height="13"><use href="#i-mail"/></svg>Message care team</button>
          </div>
        </div>`;
    }
    const d = nextSessDate;
    const dateLbl = d.toLocaleDateString(loc, { weekday: 'short', month: 'short', day: 'numeric' });
    const clinician = nextSess.clinician_name || activeCourse?.primary_clinician_name || 'Your clinician';
    const modality = _hmModalityLabel(nextSess.modality_slug) || 'Session';
    const duration = nextSess.duration_minutes ? nextSess.duration_minutes + ' min' : '—';
    const target = nextSess.target_site || activeCourse?.target_site || 'F3 – FP2';
    const mA = nextSess.stimulation_mA || activeCourse?.stimulation_mA || '2.0 mA';
    const location = nextSess.location || (_isHomeNext(nextSess) ? 'Home' : 'Clinic');
    return `
      <div class="hm-next-wrap">
        <div class="hm-next-kicker">Next clinical session</div>
        <div class="hm-next-title">${esc(dateLbl)} · ${esc(nextSessTime || '')} with ${esc(String(clinician).split(' ').slice(-1)[0])}</div>
        <div class="hm-next-sub">${esc(modality)} · Session ${sessDelivered + 1}${totalPlanned ? ' of ' + totalPlanned : ''}${_isHomeNext(nextSess) ? '' : ' · your care team will guide you through it'}.</div>
        <div class="hm-next-grid">
          <div class="hm-next-spec"><div class="l">Montage</div><div class="v">${esc(target)}</div></div>
          <div class="hm-next-spec"><div class="l">Intensity</div><div class="v">${esc(String(mA))}${/ma$/i.test(String(mA)) ? '' : ' mA'}</div></div>
          <div class="hm-next-spec"><div class="l">Duration</div><div class="v">${esc(duration)}</div></div>
          <div class="hm-next-spec"><div class="l">Location</div><div class="v">${esc(location)}</div></div>
        </div>
        <div class="hm-next-actions">
          <button class="btn btn-primary btn-sm" onclick="window._navPatient('pt-sessions')"><svg width="13" height="13"><use href="#i-calendar"/></svg>Open session</button>
          <button class="btn btn-ghost btn-sm" onclick="window._navPatient('patient-messages')"><svg width="13" height="13"><use href="#i-clock"/></svg>Request reschedule</button>
        </div>
      </div>`;
  }
  function _isHomeNext(s) {
    return !!s.is_home || /home/i.test(String(s.location || s.session_type || ''));
  }

  // Protocol adherence ring (last 7 days: planned vs done, from sessions + tasks).
  function _hmAdhHtml() {
    const cutoff = Date.now() - 7 * 86400000;
    const last7Sessions = sessions.filter(s => {
      const d = new Date(s.scheduled_at || s.delivered_at || 0).getTime();
      return d >= cutoff;
    });
    const doneSessions = last7Sessions.filter(s => s.delivered_at || /completed|done/.test(String(s.status || '').toLowerCase())).length;
    const clinicTot = last7Sessions.filter(s => !_isHomeNext(s)).length;
    const clinicDone = last7Sessions.filter(s => !_isHomeNext(s) && (s.delivered_at || /completed|done/.test(String(s.status || '').toLowerCase()))).length;
    const homeTot = last7Sessions.filter(s => _isHomeNext(s)).length;
    const homeDone = last7Sessions.filter(s => _isHomeNext(s) && (s.delivered_at || /completed|done/.test(String(s.status || '').toLowerCase()))).length;
    const hwTot = homeTasks.length;
    const hwDone = homeTasks.filter(t => t.completed || t.done).length;
    const plannedTotal = last7Sessions.length + hwTot;
    const completedTotal = doneSessions + hwDone;
    const pct = plannedTotal ? Math.round(completedTotal / plannedTotal * 100) : null;
    const C = 2 * Math.PI * 42;
    const offset = pct != null ? Math.max(0, C - (pct / 100) * C) : C;
    const line = pct == null ? 'No items tracked this week yet.'
      : pct >= 80 ? 'Strong week' : pct >= 60 ? 'Solid week' : pct >= 40 ? 'Keep building' : 'Gentle restart';
    return `
      <div class="hm-card">
        <div class="hm-card-head">
          <div>
            <h3>Protocol adherence</h3>
            <p>Last 7 days · home + clinic</p>
          </div>
        </div>
        <div class="hm-adh">
          <div class="hm-adh-ring">
            <svg viewBox="0 0 100 100">
              <defs><linearGradient id="hmAdhGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#00d4bc"/><stop offset="100%" stop-color="#b794ff"/></linearGradient></defs>
              <circle class="hm-adh-ring-bg" cx="50" cy="50" r="42"/>
              <circle class="hm-adh-ring-fg" cx="50" cy="50" r="42" stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}"/>
            </svg>
            <div class="hm-adh-center"><div class="v">${pct != null ? pct + '%' : '—'}</div><div class="l">7-day</div></div>
          </div>
          <div class="hm-adh-body">
            <h4>${esc(line)}</h4>
            <p>${completedTotal} of ${plannedTotal} planned items complete. Consistency improves outcome likelihood.</p>
            <div class="detail">
              <span>Clinic: ${clinicDone}/${clinicTot || 0}</span>
              <span>Home tDCS: ${homeDone}/${homeTot || 0}</span>
              <span>Homework: ${hwDone}/${hwTot || 0}</span>
            </div>
          </div>
        </div>
      </div>`;
  }

  // Messages preview.
  function _hmMessagesHtml() {
    if (!messages.length) {
      return `
        <div class="hm-card">
          <div class="hm-card-head"><div><h3>Care team</h3><p>No messages yet</p></div><button class="hm-card-link" onclick="window._navPatient('patient-messages')">Open →</button></div>
          <div class="pth2-empty"><div class="pth2-empty-title">All quiet</div><div class="pth2-empty-sub">Messages from your clinicians appear here.</div></div>
        </div>`;
    }
    const unreadCount = messages.filter(m => !m.is_read && m.sender_type !== 'patient').length;
    const accents = ['jk', 'rn', 'mt', 'ai'];
    const rows = messages.slice(0, 4).map((m, i) => {
      const name = m.sender_name || m.sender_display_name || 'Care team';
      const ini = String(name).split(/\s+/).map(p => p[0] || '').slice(0, 2).join('').toUpperCase() || 'CT';
      const av = m.sender_type === 'system' ? 'ai' : accents[i % accents.length];
      const rel = (() => {
        try {
          const d = new Date(m.created_at);
          const diff = Date.now() - d.getTime();
          if (diff < 86400000) return d.toLocaleTimeString(loc, { hour: 'numeric', minute: '2-digit' });
          if (diff < 172800000) return 'Yesterday';
          return d.toLocaleDateString(loc, { weekday: 'short' });
        } catch (_e) { return ''; }
      })();
      const unread = !m.is_read && m.sender_type !== 'patient';
      const offline = m.sender_type !== 'clinician' && m.sender_type !== 'system' ? ' off' : '';
      return `
        <div class="hm-msg-row${unread ? ' unread' : ''}" onclick="window._navPatient('patient-messages')">
          <div class="hm-msg-av ${av}${offline}">${esc(ini)}</div>
          <div class="hm-msg-body">
            <div class="hm-msg-line">
              <span class="hm-msg-name">${esc(name)}</span>
              <span class="hm-msg-time">${esc(rel)}</span>
            </div>
            <div class="hm-msg-preview">${esc(m.preview || m.body || m.subject || '')}</div>
          </div>
          ${unread ? '<span class="hm-msg-dot"></span>' : ''}
        </div>`;
    }).join('');
    return `
      <div class="hm-card">
        <div class="hm-card-head">
          <div><h3>Care team</h3><p>${unreadCount ? unreadCount + ' unread' : 'All caught up'}${careTeam.length ? ' · ' + careTeam.length + ' clinicians' : ''}</p></div>
          <button class="hm-card-link" onclick="window._navPatient('patient-messages')">Open →</button>
        </div>
        <div class="hm-msg-list">${rows}</div>
      </div>`;
  }

  // Home device status — derived from wearable summary + any tDCS task.
  function _hmDevicesHtml() {
    const rows = [];
    const hasTdcs = homeTasks.some(t => /tdcs|stim|brain/.test(String(t.task_type || '').toLowerCase()));
    if (hasTdcs || activeCourse?.modality_slug === 'tdcs') {
      rows.push({
        name: 'Synaps One · tDCS',
        sub: 'Battery check before next use',
        status: 'Ready',
        ico: '#i-brain',
        low: false,
      });
    }
    if (wearable.hasData) {
      const sleepLow = wearable.sleepAvg != null && wearable.sleepAvg < 7;
      rows.push({
        name: 'Apple Watch · HRV + sleep',
        sub: `Sleep ${wearable.sleepAvg != null ? wearable.sleepAvg.toFixed(1) + 'h' : '—'} · HRV ${wearable.hrvAvg != null ? Math.round(wearable.hrvAvg) + 'ms' : '—'}`,
        status: sleepLow ? 'Sleep low' : 'Synced',
        ico: '#i-pulse',
        low: sleepLow,
      });
    }
    if (!rows.length) {
      return `
        <div class="hm-card">
          <div class="hm-card-head"><div><h3>Home device</h3><p>No devices connected yet</p></div><button class="hm-card-link" onclick="window._navPatient('patient-wearables')">Connect →</button></div>
          <div class="pth2-empty"><div class="pth2-empty-title">Nothing paired</div><div class="pth2-empty-sub">Pair your wearable to track sleep, HRV, and steps.</div></div>
        </div>`;
    }
    const html = rows.map(r => `
      <div class="hm-dev" onclick="window._navPatient('patient-wearables')">
        <div class="hm-dev-ico"><svg width="18" height="18"><use href="${r.ico}"/></svg></div>
        <div class="hm-dev-body">
          <div class="hm-dev-name">${esc(r.name)}</div>
          <div class="hm-dev-sub">${esc(r.sub)}</div>
        </div>
        <div class="hm-dev-status${r.low ? ' low' : ''}"><span class="hm-dev-status-dot"></span>${esc(r.status)}</div>
      </div>`).join('');
    return `
      <div class="hm-card">
        <div class="hm-card-head"><div><h3>Home device</h3><p>${rows.length} connected</p></div><button class="hm-card-link" onclick="window._navPatient('patient-wearables')">Manage →</button></div>
        ${html}
      </div>`;
  }

  // Education picks — static curated-for-Week-N set; personalised kicker.
  function _hmEducationHtml() {
    const weekN = (totalPlanned && sessDelivered) ? Math.max(1, Math.ceil(sessDelivered / Math.max(1, Math.round(totalPlanned / 10)))) : null;
    const picks = [
      { id:'ed-1', t:'t1', dur:'6:42',  title:'Dr. Kolmar: What happens in weeks 6\u201310 of your tDCS course', meta:'Sample · personalised for you' },
      { id:'ed-2', t:'t2', dur:'14:03', title:'Huberman Lab: Sleep & mood \u2014 the morning light protocol',     meta:'Sample · matches your plan' },
      { id:'ed-3', t:'t3', dur:'4:18',  title:'Mayo Clinic: When to expect symptom improvement',                  meta:'Sample · short read' },
    ];
    return `
      <div class="hm-card">
        <div class="hm-card-head">
          <div><h3>For you today</h3><p>${patientEvidence.live ? (patientEvidence.highlightCount + ' live evidence highlights' + (patientEvidence.phenotypeTags.length ? ' · ' + esc(patientEvidence.phenotypeTags.slice(0, 3).join(' · ')) : '')) : (picks.length + ' sample picks' + (weekN ? ' matched to Week ' + weekN : '') + ' — your clinic will curate real content here')}</p></div>
          <button class="hm-card-link" onclick="window._navPatient('pt-learn')">Library &rarr;</button>
        </div>
        <div class="hm-edu-list">
          ${picks.map(p => `
            <div class="hm-edu-row" onclick="window._hmOpenEdu && window._hmOpenEdu(${JSON.stringify(p.id)})">
              <div class="hm-edu-thumb ${p.t}">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                <span class="dur">${esc(p.dur)}</span>
              </div>
              <div class="hm-edu-body">
                <div class="hm-edu-title">${esc(p.title)}</div>
                <div class="hm-edu-meta">${esc(p.meta)}</div>
              </div>
            </div>`).join('')}
        </div>
      </div>`;
  }

  // ── Render ────────────────────────────────────────────────────────────────
  el.innerHTML = `
    <div class="ptd-dashboard hm-dashboard" id="pt-route-home">

      ${_hmDemo ? `<div class="hw-demo-banner" role="status">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <strong>Demo data</strong>
        &mdash; sample dashboard shown while your clinic is being set up. Your real data will appear once your care team connects your account.
      </div>` : ''}

      <!-- ═══ Greeting hero + KPIs ═══ -->
      <div class="hm-hero">
        <div class="hm-hero-top">
          <div>
            <div class="hm-greet-kicker">${esc(_hmKicker)}</div>
            <h1 class="hm-greet-title pth-greeting">${greeting}, ${firstName}.</h1>
            <p class="hm-greet-sub">${_hmSub}</p>
          </div>
        </div>
        <div class="hm-hero-kpis">
          <div class="hm-kpi" onclick="window._navPatient('pt-outcomes')">
            <div class="hm-kpi-l">${esc(_hmPrimary.name || 'PHQ-9')}</div>
            <div class="hm-kpi-v">${_hmPrimary.val != null ? esc(String(_hmPrimary.val)) : '—'}${_hmPrimary.max ? ' <small>/ ' + _hmPrimary.max + '</small>' : ''}</div>
            <div class="hm-kpi-trend ${_hmPrimary.delta != null && _hmPrimary.delta > 0 ? 'up' : 'neutral'}">${_hmPrimary.delta != null && _hmPrimary.delta > 0 ? '↓ ' + _hmPrimary.delta + ' from baseline' : (_hmPrimary.band || 'Tracking')}</div>
          </div>
          <div class="hm-kpi" onclick="window._navPatient('pt-outcomes')">
            <div class="hm-kpi-l">Mood (7-day avg)</div>
            <div class="hm-kpi-v">${_hmMoodAvg != null ? esc(String(_hmMoodAvg)) : '—'} <small>/ 10</small></div>
            <div class="hm-kpi-trend ${_hmMoodAvg != null && _hmMoodAvg >= 5 ? 'up' : 'neutral'}">${_hmMoodAvg != null ? (_hmMoodAvg >= 6 ? 'Feeling good' : _hmMoodAvg >= 4 ? 'Steady' : 'Below your usual') : 'Log a check-in'}</div>
          </div>
          <div class="hm-kpi" onclick="window._navPatient('pt-sessions')">
            <div class="hm-kpi-l">Sessions</div>
            <div class="hm-kpi-v">${sessDelivered || 0}${totalPlanned ? ' <small>/ ' + totalPlanned + '</small>' : ''}</div>
            <div class="hm-kpi-trend good">${progressPct != null ? progressPct + '% complete' : 'On track'}</div>
          </div>
          <div class="hm-kpi" onclick="window._ptdOpenCheckin && window._ptdOpenCheckin()">
            <div class="hm-kpi-l">Streak</div>
            <div class="hm-kpi-v">${streak || 0} <small>days</small></div>
            <div class="hm-kpi-trend neutral">${streak > 0 ? '🔥 Keep it going' : 'Log to start'}</div>
          </div>
        </div>
      </div>

      ${_hmSimpleSummaryHtml()}

      <!-- ═══ AI nudge (only when a signal justifies one) ═══ -->
      ${_hmNudge ? `
      <div class="hm-ai" id="hm-ai-nudge">
        <div class="hm-ai-ico"><svg width="18" height="18"><use href="#i-sparkle"/></svg></div>
        <div class="hm-ai-body">
          <div class="hm-ai-kicker">${esc(_hmNudge.kicker)}</div>
          <p>${_hmNudge.body}</p>
          <div class="actions">
            <button class="btn btn-primary btn-sm" onclick="window._hmAiAction && window._hmAiAction(${JSON.stringify(_hmNudge.primary.action)})"><svg width="13" height="13"><use href="#i-${_hmNudge.kind === 'sleep' ? 'walk' : 'check'}"/></svg>${esc(_hmNudge.primary.label)}</button>
            <button class="btn btn-ghost btn-sm" onclick="window._hmDismissNudge && window._hmDismissNudge()">Dismiss</button>
          </div>
        </div>
      </div>` : ''}
      <div style="margin-top:${_hmNudge ? '10px' : '0'};padding:10px 12px;border:1px solid rgba(255,255,255,.08);border-radius:12px;background:rgba(255,255,255,.03);font-size:12px;line-height:1.5;color:rgba(255,255,255,.76);">
        <strong style="color:#fff;">Decision-support only.</strong> This summary and assistant guidance may be incomplete and do not replace advice from your clinician or emergency care.
      </div>

      <!-- ═══ Main grid ═══ -->
      <div class="hm-grid">

        <!-- LEFT COLUMN -->
        <div style="display:flex;flex-direction:column;gap:20px;">

          <!-- TODAY'S PLAN -->
          <div class="hm-card">
            <div class="hm-card-head">
              <div>
                <h3>Today's plan</h3>
                <p>${homeTasks.length} item${homeTasks.length === 1 ? '' : 's'} · ${homeTasks.filter(t => t.completed || t.done).length} done · ${openTasks.length ? 'next up when you are' : 'all caught up'}</p>
              </div>
              <button class="hm-card-link" onclick="window._navPatient('patient-homework')">Full homework →</button>
            </div>
            <div class="hm-timeline">${_hmPlanHtml()}</div>
          </div>

          <!-- MOOD CHECK-IN -->
          <div class="hm-card">
            <div class="hm-mood-head">
              <div>
                <h3>How are you feeling right now?</h3>
                <p>Quick 1-tap check-in · helps your team track how the protocol is landing.</p>
              </div>
              ${streak > 0 ? `<span class="hm-mood-streak"><svg width="10" height="10"><use href="#i-sparkle"/></svg>${streak}-day streak</span>` : ''}
            </div>
            <div class="hm-mood-emojis" id="hm-mood-picker">
              ${[1,2,3,4,5,6,7,8,9,10].map(v => `<div class="hm-mood-dot${v === 5 ? ' active' : ''}" data-mood="${v}" onclick="window._hmPickMood && window._hmPickMood(${v})">${['😞','😔','😐','🙂','😊','😄','😁','🤩','🥰','🌟'][v-1]}</div>`).join('')}
            </div>
            <div class="hm-mood-scale">
              <span>1 · Awful</span><span>5 · Okay</span><span>10 · Amazing</span>
            </div>
            <div class="hm-mood-foot">
              <div class="hm-mood-current">Right now: <strong id="hm-mood-val">5</strong> · tap an emoji to pick</div>
              <button class="btn btn-primary btn-sm" id="hm-mood-log" onclick="window._hmLogMood && window._hmLogMood()"><svg width="13" height="13"><use href="#i-check"/></svg>Log mood</button>
            </div>
          </div>

          <!-- PROGRESS SNAPSHOT -->
          <div class="hm-card">
            <div class="hm-card-head">
              <div>
                <h3>Progress snapshot</h3>
                <p>${outcomeGroups.length} scales tracked${activeCourse?.next_review_date ? ' · next review ' + esc(new Date(activeCourse.next_review_date).toLocaleDateString(loc, { weekday:'short', month:'short', day:'numeric' })) : ''}</p>
              </div>
              <button class="hm-card-link" onclick="window._navPatient('pt-outcomes')">See trends →</button>
            </div>
            <div class="hm-prog-grid">${_hmProgHtml()}</div>
            ${outcomeGroups.length ? `
            <div style="margin-top:14px;">
              <div class="hm-bio">
                <div class="hm-bio-ico"><svg width="16" height="16"><use href="#i-brain"/></svg></div>
                <div class="hm-bio-body">
                  <div class="t">Frontal Alpha Asymmetry · ${activeCourse?.phase || 'latest qEEG'}</div>
                  <div class="s">Biomarker appears once your qEEG report is available. Ask your clinician if you'd like to run one.</div>
                </div>
                <div class="hm-bio-v">—</div>
              </div>
            </div>` : ''}
          </div>

          <!-- Inline check-in form (opens when KPI streak clicked) -->
          <div id="pt-checkin-form" class="pth-checkin-form" style="display:none">
            <div class="pth-checkin-title">Quick check-in</div>
            <div class="ptd-slider-rows">
              ${[
                { id: 'ptd-dc-mood',   label: 'Mood',   color: 'var(--teal,#2dd4bf)' },
                { id: 'ptd-dc-sleep',  label: 'Sleep',  color: 'var(--blue,#4a9eff)' },
                { id: 'ptd-dc-energy', label: 'Energy', color: 'var(--violet,#9b7fff)' },
              ].map(s => `<div class="ptd-slider-row">
                <label>${s.label}</label>
                <input type="range" id="${s.id}" min="1" max="10" value="5" oninput="document.getElementById('${s.id}-v').textContent=this.value" style="accent-color:${s.color}">
                <span id="${s.id}-v" style="color:${s.color}">5</span>
              </div>`).join('')}
            </div>
            <div style="display:flex;gap:8px;margin-top:10px">
              <button class="btn btn-primary btn-sm" onclick="window._ptdSubmitCheckin()">Save check-in</button>
              <button class="btn btn-ghost btn-sm" onclick="window._ptdCloseCheckin()">Cancel</button>
            </div>
          </div>

        </div>

        <!-- RIGHT COLUMN -->
        <div style="display:flex;flex-direction:column;gap:20px;">
          ${_hmNextSessHtml()}
          ${_hmAdhHtml()}
          ${_hmMessagesHtml()}
          ${_hmDevicesHtml()}
          ${_hmEducationHtml()}
        </div>

      </div>

      <!-- ═══ Quick actions ═══ -->
      <div>
        <div class="hm-card-head" style="margin-bottom:14px;">
          <div>
            <h3 style="font-family:'Outfit',sans-serif;font-weight:600;font-size:17px;color:#fff;margin:0;letter-spacing:-0.01em;">Quick actions</h3>
            <p style="font-size:12px;color:rgba(255,255,255,0.55);margin:3px 0 0;">Jump into the most common things you do here</p>
          </div>
        </div>
        <div class="hm-quick">
          <button class="hm-q-tile" onclick="window._navPatient('patient-messages')">
            <div class="hm-q-ico teal"><svg width="16" height="16"><use href="#i-mail"/></svg></div>
            <div class="hm-q-t">Message care team</div>
            <div class="hm-q-s">${messages.filter(m => !m.is_read && m.sender_type !== 'patient').length ? 'You have unread messages' : 'We\u2019ll reply as soon as we can'}</div>
          </button>
          <button class="hm-q-tile" onclick="window._navPatient('pt-assessments')">
            <div class="hm-q-ico purple"><svg width="16" height="16"><use href="#i-clipboard"/></svg></div>
            <div class="hm-q-t">Start weekly assessment</div>
            <div class="hm-q-s">PHQ-9 + GAD-7 · ~5 min</div>
          </button>
          <button class="hm-q-tile" onclick="window._ptdOpenCheckin && window._ptdOpenCheckin()">
            <div class="hm-q-ico orange"><svg width="16" height="16"><use href="#i-book-open"/></svg></div>
            <div class="hm-q-t">Log today\u2019s mood</div>
            <div class="hm-q-s">${streak > 0 ? 'Continue your ' + streak + '-day streak' : 'Start a streak today'}</div>
          </button>
          <button class="hm-q-tile" onclick="window._navPatient('patient-sessions')">
            <div class="hm-q-ico pink"><svg width="16" height="16"><use href="#i-calendar"/></svg></div>
            <div class="hm-q-t">View sessions</div>
            <div class="hm-q-s">Check scheduled visits or request a slot</div>
          </button>
        </div>
      </div>

      <!-- Toast -->
      <div class="hm-toast" id="hm-toast"><svg width="16" height="16"><use href="#i-check"/></svg><span id="hm-toast-text">Logged</span></div>

    </div>

    <!-- Care Assistant panel (reachable via AI question prompts) -->
    <div id="ptd-asst-panel" class="ptd-asst-panel" style="display:none" role="dialog" aria-label="Care Assistant">
      <div class="ptd-asst-header">
        <span class="ptd-asst-title">Patient specialist agents</span>
        <button class="ptd-asst-close" onclick="window._ptdCloseAssistant()" aria-label="Close">\u2715</button>
      </div>
      <div class="ptd-asst-body">
        <div class="ptd-asst-intro">Decision-support only. Ask about your scores, next session, or wellbeing &mdash; answers summarise your dashboard snapshot and may be incomplete. For medical decisions or urgent concerns, contact your care team.</div>
        <div class="ptd-asst-prompts">
          ${[
            { icon: '\ud83d\udcc8', q: 'Explain my progress' },
            { icon: '\ud83d\udd04', q: 'What changed since last session?' },
            { icon: '\ud83d\udccb', q: 'What should I do before my next session?' },
            { icon: '\ud83d\udccb', q: 'Explain my last report' },
            { icon: '\ud83d\udca4', q: 'Summarise my check-ins this week' },
          ].map(p => `<button class="ptd-asst-prompt" onclick="window._ptdAskPrompt(${JSON.stringify(p.q)})">${p.icon} ${p.q}</button>`).join('')}
        </div>
        <div class="ptd-asst-input-row">
          <input id="ptd-asst-inp" class="ptd-asst-inp" type="text" placeholder="Type your question\u2026" onkeydown="if(event.key==='Enter'){window._ptdAskPrompt(this.value);}">
          <button class="ptd-asst-send" onclick="window._ptdAskPrompt(document.getElementById('ptd-asst-inp').value)">\u2192</button>
        </div>
        <div id="ptd-asst-resp" class="ptd-asst-resp" style="display:none"></div>
      </div>
    </div>
  `;

  // ── hm-* interactive handlers ───────────────────────────────────────────
  window._hmPickMood = function(v) {
    document.querySelectorAll('#hm-mood-picker .hm-mood-dot').forEach(d => d.classList.toggle('active', Number(d.getAttribute('data-mood')) === v));
    const el2 = document.getElementById('hm-mood-val');
    if (el2) el2.textContent = String(v);
    try { localStorage.setItem('ds_hm_pending_mood', String(v)); } catch (_e) {}
  };
  window._hmLogMood = async function() {
    const v = parseInt(localStorage.getItem('ds_hm_pending_mood') || '5', 10) || 5;
    const iso = new Date().toISOString().slice(0, 10);
    const payload = { mood: v, sleep: 5, energy: 5, side_effects: 'none', date: iso };
    // Persist to localStorage as fast fallback
    try {
      localStorage.setItem('ds_last_checkin', iso);
      localStorage.setItem('ds_checkin_' + iso, JSON.stringify(payload));
      const prev = localStorage.getItem('ds_last_checkin_prev');
      const yest = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const cur = parseInt(localStorage.getItem('ds_wellness_streak') || '0', 10);
      localStorage.setItem('ds_wellness_streak', String(prev === yest ? cur + 1 : 1));
      localStorage.setItem('ds_last_checkin_prev', iso);
    } catch (_e) {}
    // POST to backend wellness-logs endpoint (preferred)
    try {
      if (api.patientPortalSubmitWellnessLog) {
        await api.patientPortalSubmitWellnessLog(payload).catch(() => {});
      } else {
        const uid = user?.patient_id || user?.id;
        if (uid) await api.submitAssessment(uid, { type: 'wellness_checkin', ...payload }).catch(() => {});
      }
    } catch (_e) {}
    _hmShowToast('Mood logged \u2013 great job');
  };
  window._hmStartTask = function(id, kind) {
    if (kind === 'walk') {
      window._navPatient && window._navPatient('patient-homework');
    } else if (kind === 'tdcs') {
      window._navPatient && window._navPatient('patient-home-devices');
    } else {
      window._navPatient && window._navPatient('patient-homework');
    }
  };
  window._hmAiAction = function(action) {
    if (action === 'walk') { window._navPatient && window._navPatient('patient-homework'); return; }
    if (action === 'plan') { window._navPatient && window._navPatient('patient-homework'); return; }
    _hmShowToast('Noted');
  };
  window._hmDismissNudge = function() {
    try { localStorage.setItem('ds_hm_nudge_dismiss_' + todayStr, '1'); } catch (_e) {}
    const n = document.getElementById('hm-ai-nudge');
    if (n && n.parentNode) n.parentNode.removeChild(n);
  };
  window._hmOpenEdu = function(_id) {
    if (window._navPatient) window._navPatient('pt-learn');
  };
  function _hmShowToast(msg) {
    const t = document.getElementById('hm-toast');
    const t2 = document.getElementById('hm-toast-text');
    if (!t || !t2) return;
    t2.textContent = msg || 'Done';
    t.classList.add('show');
    clearTimeout(window._hmToastTimer);
    window._hmToastTimer = setTimeout(() => t.classList.remove('show'), 2400);
  }

  // ── Care assistant handlers ───────────────────────────────────────────────
  window._ptdOpenAssistant = function() {
    const p = document.getElementById('ptd-asst-panel');
    if (p) { p.style.display = 'flex'; requestAnimationFrame(() => p.classList.add('ptd-asst-panel--open')); }
  };
  window._ptdCloseAssistant = function() {
    const p = document.getElementById('ptd-asst-panel');
    if (p) { p.classList.remove('ptd-asst-panel--open'); setTimeout(() => { if (p) p.style.display = 'none'; }, 260); }
  };
  window._ptdAskPrompt = async function(question) {
    if (!question || !question.trim()) return;
    const inp = document.getElementById('ptd-asst-inp');
    const resp = document.getElementById('ptd-asst-resp');
    if (inp) inp.value = '';
    if (!resp) return;
    resp.style.display = 'block';
    resp.innerHTML = '<div class="ptd-asst-thinking">Thinking\u2026</div>';
    const dashCtx = [
      `Sessions delivered: ${sessDelivered}`,
      totalPlanned != null ? `Planned sessions: ${totalPlanned}` : '',
      progressPct != null ? `Course progress: ${progressPct}%` : '',
      nextSessDate ? `Next session: ${nextSessDate.toLocaleDateString(loc)} at ${nextSessTime || ''}` : 'Next session: not scheduled',
      outcomeGroups.length
        ? `Outcome trends: ${outcomeGroups.map(g => g.template_name + ' current=' + (g.latest?.score_numeric ?? '?')).join('; ')}`
        : '',
      wearable.hasData ? `Wearable (avg 7d): sleep ${wearable.sleepAvg?.toFixed(1) || '?'}h, HRV ${wearable.hrvAvg?.toFixed(0) || '?'}ms, RHR ${wearable.rhrAvg?.toFixed(0) || '?'}bpm` : 'No wearable data',
      `Wellness ring: ${wellnessVal}`,
    ].filter(Boolean).join('\n');

    const lang = getLocale() === 'tr' ? 'tr' : 'en';
    try {
      const result = await api.chatPatient(
        [{ role: 'user', content: question.trim() }],
        null,
        lang,
        dashCtx
      );
      const answer = result?.reply || 'No response. Please try again or message your care team.';
      resp.innerHTML = '<div class="ptd-asst-answer">' + esc(answer).replace(/\n/g, '<br>') + '</div>';
    } catch (_e) {
      const q = question.trim().toLowerCase();
      let answer = '';
      if (q.includes('progress') || q.includes('improv')) {
        const g = outcomeGroups[0];
        answer = g && g.latest && g.baseline
          ? `Your ${g.template_name} has changed from ${g.baseline.score_numeric} (baseline) to ${g.latest.score_numeric} (current).`
          : `You\u2019re ${sessDelivered ? sessDelivered + ' sessions into your treatment course' : 'just getting started'}. Complete your first assessment to start tracking scores over time.`;
      } else if (q.includes('next session') || q.includes('before')) {
        answer = nextSessDate
          ? `Your next session is ${nextSessDate.toLocaleDateString(loc)} at ${nextSessTime}. Before then: complete your daily check-in, drink plenty of water, and note any side effects or mood changes to share with your clinician.`
          : `You don\u2019t have a session scheduled yet. Contact your clinic to book your next appointment.`;
      } else {
        answer = 'Assistant is offline. For help, use Messages to reach your care team.';
      }
      resp.innerHTML = '<div class="ptd-asst-answer">' + answer + '</div>';
    }
  };

  // ── Weekly check-in (opens inline) ───────────────────────────────────────
  window._ptdOpenCheckin = function() {
    const f = document.getElementById('pt-checkin-form');
    if (f) { f.style.display = 'block'; f.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
  };
  window._ptdCloseCheckin = function() {
    const f = document.getElementById('pt-checkin-form');
    if (f) f.style.display = 'none';
  };
  window._ptdSubmitCheckin = async function() {
    const moodEl = document.getElementById('ptd-dc-mood');
    const sleepEl = document.getElementById('ptd-dc-sleep');
    const energyEl = document.getElementById('ptd-dc-energy');
    if (!moodEl) return;
    const todayIso = new Date().toISOString().slice(0, 10);
    const payload = { mood: parseInt(moodEl.value, 10), sleep: parseInt(sleepEl.value, 10), energy: parseInt(energyEl.value, 10), side_effects: 'none', date: new Date().toISOString() };
    localStorage.setItem('ds_last_checkin', todayIso);
    localStorage.setItem('ds_checkin_' + todayIso, JSON.stringify(payload));
    try {
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const lastDay = localStorage.getItem('ds_last_checkin_prev');
      const cur = parseInt(localStorage.getItem('ds_wellness_streak') || '0', 10);
      localStorage.setItem('ds_wellness_streak', String(lastDay === yesterday ? cur + 1 : 1));
      localStorage.setItem('ds_last_checkin_prev', todayIso);
    } catch (_e) {}
    let syncedToClinic = false;
    try {
      if (typeof api.patientPortalSubmitWellnessLog === 'function') {
        await api.patientPortalSubmitWellnessLog(payload);
        syncedToClinic = true;
      } else {
        const uid = user?.patient_id || user?.id;
        if (uid) {
          await api.submitAssessment(uid, { type: 'wellness_checkin', ...payload });
          syncedToClinic = true;
        }
      }
    } catch (_e) {}
    const form = document.getElementById('pt-checkin-form');
    if (form) {
      form.outerHTML = syncedToClinic
        ? '<div class="ptd-checkin-done"><span style="color:var(--teal,#2dd4bf)">\u2713</span><span>Check-in saved and synced to your clinic.</span></div>'
        : '<div class="ptd-checkin-done"><span style="color:var(--teal,#2dd4bf)">\u2713</span><span>Check-in saved in this browser. Clinic sync is unavailable right now.</span></div>';
    }
    const tile = document.getElementById('pth-tile-checkin');
    if (tile) tile.classList.remove('pth-tile--pending');
    if (typeof window._showNotifToast === 'function') {
      window._showNotifToast({
        title: syncedToClinic ? 'Check-in synced' : 'Check-in saved locally',
        body: syncedToClinic ? 'Your clinic can review this update.' : 'This update is stored on this device only.',
        severity: 'success',
      });
    }
  };

  // ── Today's-focus snooze handler ──────────────────────────────────────────
  window._ptdSnoozeFocus = function() {
    try { localStorage.setItem(focusSnoozeKey, '1'); } catch (_e) {}
    const card = document.querySelector('.pth-focus');
    if (card) {
      card.classList.add('pth-focus--snoozing');
      setTimeout(() => { if (card && card.parentNode) card.parentNode.removeChild(card); }, 240);
    }
  };
}


function startCountdown(targetDateStr) {
  const target = new Date(targetDateStr).getTime();
  function tick() {
    const now  = Date.now();
    const diff = target - now;
    if (diff <= 0) {
      const el = document.getElementById('countdown-display');
      if (el) el.textContent = t('patient.sess.countdown.now');
      return;
    }
    const d       = Math.floor(diff / 86400000);
    const h       = Math.floor((diff % 86400000) / 3600000);
    const m       = Math.floor((diff % 3600000) / 60000);
    const s       = Math.floor((diff % 60000) / 1000);
    const display = d > 0
      ? `${d}d ${h}h ${m}m`
      : `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    const el = document.getElementById('countdown-display');
    if (el) el.textContent = display;
    else return; // stop if element gone
    window._countdownTimer = setTimeout(tick, 1000);
  }
  clearTimeout(window._countdownTimer);
  tick();
}

// ── Milestones ────────────────────────────────────────────────────────────────
function getPatientMilestones(sessions, outcomes) {
  const completedSessions = sessions.filter(s => {
    const st = (s.status || '').toLowerCase();
    return st === 'completed' || st === 'done' || s.delivered_at;
  });
  const count = completedSessions.length;
  // Compute "one week in"
  let weekOneEarned = false;
  if (completedSessions.length > 0) {
    const firstDate = completedSessions
      .map(s => new Date(s.delivered_at || s.scheduled_at || 0))
      .sort((a, b) => a - b)[0];
    weekOneEarned = firstDate && (Date.now() - firstDate.getTime()) >= 7 * 86400000;
  }
  // Compute "consistent" — 3 sessions in one week
  let consistentEarned = false;
  if (count >= 3) {
    const dates = completedSessions.map(s => new Date(s.delivered_at || s.scheduled_at || 0).getTime()).sort((a, b) => a - b);
    for (let i = 0; i <= dates.length - 3; i++) {
      if (dates[i + 2] - dates[i] <= 7 * 86400000) { consistentEarned = true; break; }
    }
  }
  // Wellness streak
  let wellnessStreak = false;
  try {
    const streakVal = parseInt(localStorage.getItem('ds_wellness_streak') || '0', 10);
    wellnessStreak = streakVal >= 7;
  } catch (_e) { /* ignore */ }

  return [
    { id: 'first_session',  icon: '🌱', title: t('patient.milestone.first_session.title'),    desc: t('patient.milestone.first_session.desc'),    earned: count >= 1 },
    { id: 'week_one',       icon: '📅', title: t('patient.milestone.week_one.title'),          desc: t('patient.milestone.week_one.desc'),          earned: weekOneEarned },
    { id: 'five_sessions',  icon: '⭐', title: t('patient.milestone.five_sessions.title'),    desc: t('patient.milestone.five_sessions.desc'),    earned: count >= 5 },
    { id: 'ten_sessions',   icon: '🏆', title: t('patient.milestone.ten_sessions.title'),     desc: t('patient.milestone.ten_sessions.desc'),     earned: count >= 10 },
    { id: 'first_outcome',  icon: '📊', title: t('patient.milestone.progress_tracked.title'), desc: t('patient.milestone.progress_tracked.desc'), earned: outcomes.length >= 1 },
    { id: 'consistent',     icon: '🔥', title: t('patient.milestone.consistent.title'),       desc: t('patient.milestone.consistent.desc'),       earned: consistentEarned },
    { id: 'halfway',        icon: '🎯', title: t('patient.milestone.halfway.title'),          desc: t('patient.milestone.halfway.desc'),          earned: false },
    { id: 'wellness_streak',icon: '💚', title: t('patient.milestone.wellness_warrior.title'), desc: t('patient.milestone.wellness_warrior.desc'), earned: wellnessStreak },
  ];
}
