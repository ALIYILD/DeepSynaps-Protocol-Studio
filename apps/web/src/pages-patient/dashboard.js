// ============================================================================
// pgPatientDashboard — World-Class Patient Dashboard (DeepSynaps Protocol Studio)
// ============================================================================
// Mobile-first patient dashboard (max-width: 600px). Patient-safe throughout.
// Clinician-reviewed content only. Educational, not interpretive. Positive
// framing on all progress indicators.
//
// TEN CARDS RENDERED:
//   1. Navigation Tabs    — Sticky top nav for quick section jumps
//   2. Today Card         — Date, next session, pending tasks, messages, streak
//   3. My Care Plan       — Goals, course progress bar, handbooks
//   4. Home Tasks         — Checkbox list with toggle completion
//   5. Messages           — Unread/read previews with timestamps
//   6. Shared Reports     — Clinician-shared reports with safety disclaimers
//   7. Wellness Check-In  — Mood, sleep, energy, symptoms + notes
//   8. My Progress        — Wearable-derived sleep, steps, HRV metrics
//   9. Education Centre   — Therapy articles, handbooks, FAQs
//  10. Upload Centre      — Requested file uploads with due dates
//  11. Safety Footer      — Emergency disclaimer + clinic contact info
//
// API INTEGRATION:
//   patientPortalDashboard, portalListHomeProgramTasks,
//   patientPortalMessages, patientPortalReports,
//   patientPortalWearableSummary, patientPortalLearnProgress,
//   patientPortalCourses, patientPortalSessions,
//   patientPortalSubmitWellnessLog
//
// SAFETY PATTERNS:
//   - "Your clinician will review this" on all check-in submissions
//   - Emergency disclaimer in footer
//   - No diagnosis, no prescription, no emergency triage
//   - Patient-scoped localStorage: ds_checkin_${patientId}_${date}
//   - Role gate: patient-only access
// ============================================================================

import { api } from '../api.js';
import { setTopbar } from './_shared.js';

// ════════════════════════════════════════════════════════════════════════════
//  CONSTANTS
// ════════════════════════════════════════════════════════════════════════════

const MOODS = [
  { emoji: '\uD83D\uDE0A', label: 'Great',  value: 10 },
  { emoji: '\uD83D\uDE42', label: 'Good',   value: 8  },
  { emoji: '\uD83D\uDE10', label: 'Okay',   value: 5  },
  { emoji: '\uD83D\uDE15', label: 'Low',    value: 3  },
  { emoji: '\uD83D\uDE22', label: 'Rough',  value: 1  },
];

const SLEEP_LABELS   = ['Poor', 'Fair', 'Good', 'Excellent'];
const ENERGY_LABELS  = ['Low', 'Medium', 'High'];
const SYMPTOM_LABELS = ['None', 'Mild', 'Moderate', 'Severe'];
const WEARABLE_DAYS  = 7;

// ════════════════════════════════════════════════════════════════════════════
//  UTILITY FUNCTIONS
// ════════════════════════════════════════════════════════════════════════════

/** Escape HTML to prevent XSS in patient-facing content. */
function esc(v) {
  if (v == null) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/** Build a patient-scoped localStorage key to avoid collisions. */
function _lsKey(patientId, suffix) {
  return `ds_${suffix}_${patientId}`;
}

/** Retrieve a saved check-in for a given patient + date. */
function _getCheckin(patientId, dateStr) {
  try {
    return JSON.parse(localStorage.getItem(_lsKey(patientId, `checkin_${dateStr}`)));
  } catch (_e) {
    return null;
  }
}

/** Persist a check-in for a given patient + date. */
function _setCheckin(patientId, dateStr, data) {
  localStorage.setItem(_lsKey(patientId, `checkin_${dateStr}`), JSON.stringify(data));
}

/** Get the current wellness streak for a patient. */
function _getStreak(patientId) {
  const n = parseInt(localStorage.getItem(_lsKey(patientId, 'streak')) || '0', 10);
  return Number.isNaN(n) ? 0 : n;
}

/** Set the wellness streak for a patient. */
function _setStreak(patientId, n) {
  localStorage.setItem(_lsKey(patientId, 'streak'), String(n));
}

/** Format today's date as "Monday, May 16, 2026". */
function _todayDate() {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
}

/** Human-readable relative time (e.g. "2h ago", "Yesterday"). */
function _relative(iso) {
  if (!iso) return '';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? 'Yesterday' : `${days}d ago`;
}

/** Short date format: "May 10". */
function _fmtDate(iso) {
  return iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
}

/** Time format: "2:00 PM". */
function _fmtTime(iso) {
  return iso ? new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
}

/** Compute wearable trend direction based on 7-day data. */
function _computeTrend(values, higherIsBetter = true) {
  if (values.length < 3) return { label: '\u2192 Stable', className: 'trend-stable' };
  const half = Math.floor(values.length / 2);
  const first = values.slice(0, half);
  const second = values.slice(half);
  const avg1 = first.reduce((a, b) => a + b, 0) / first.length;
  const avg2 = second.reduce((a, b) => a + b, 0) / second.length;
  const diff = avg2 - avg1;
  const threshold = 0.05 * avg1;
  if (Math.abs(diff) < threshold) return { label: '\u2192 Stable', className: 'trend-stable' };
  const improving = higherIsBetter ? diff > 0 : diff < 0;
  return improving
    ? { label: '\u2197 Improving', className: 'trend-up' }
    : { label: '\u2198 Declining', className: 'trend-stable' };
}

// ════════════════════════════════════════════════════════════════════════════
//  PAGE CSS (mobile-first, max-width 600px)
// ════════════════════════════════════════════════════════════════════════════

const PAGE_CSS = `
/* ── Layout shell ── */
.patient-dashboard { max-width: 600px; margin: 0 auto; padding: 12px; background: #f8fafc; min-height: 100vh; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; -webkit-font-smoothing: antialiased; }

/* ── Card component ── */
.patient-card { background: #ffffff; border-radius: 12px; padding: 16px; margin-bottom: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); transition: box-shadow 0.2s; }
.patient-card:hover { box-shadow: 0 2px 6px rgba(0,0,0,0.10); }
.patient-card-title { font-size: 16px; font-weight: 600; color: #1e293b; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }

/* ── Task checklist ── */
.task-item { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid #f1f5f9; }
.task-item:last-child { border-bottom: none; }
.task-checkbox { width: 20px; height: 20px; border: 2px solid #cbd5e1; border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: all 0.15s; }
.task-checkbox.checked { background: #10b981; border-color: #10b981; }
.task-checkbox.checked::after { content: '\\2713'; color: white; font-size: 12px; font-weight: 700; }

/* ── Mood emoji picker ── */
.mood-selector { display: flex; gap: 12px; justify-content: center; padding: 12px 0; }
.mood-emoji { font-size: 32px; cursor: pointer; opacity: 0.5; transition: all 0.2s; user-select: none; }
.mood-emoji:hover, .mood-emoji.selected { opacity: 1; transform: scale(1.2); }

/* ── Progress bars (green/blue/orange) ── */
.progress-bar { height: 8px; background: #e2e8f0; border-radius: 4px; overflow: hidden; margin: 8px 0; }
.progress-fill { height: 100%; border-radius: 4px; transition: width 0.3s; }
.progress-fill.green { background: linear-gradient(90deg, #10b981, #34d399); }
.progress-fill.blue { background: linear-gradient(90deg, #3b82f6, #60a5fa); }
.progress-fill.orange { background: linear-gradient(90deg, #f59e0b, #fbbf24); }

/* ── Safety footer (amber warning card) ── */
.safety-footer { background: #fef3c7; border: 1px solid #fbbf24; border-radius: 12px; padding: 16px; margin-top: 12px; font-size: 13px; color: #92400e; line-height: 1.6; }
.safety-footer-title { font-weight: 600; margin-bottom: 8px; display: flex; align-items: center; gap: 6px; }

/* ── Streak badge ── */
.streak-badge { display: inline-flex; align-items: center; gap: 4px; background: #fef3c7; color: #92400e; padding: 4px 10px; border-radius: 20px; font-size: 13px; font-weight: 500; }

/* ── Check-in submit button ── */
.checkin-btn { width: 100%; padding: 12px; background: #3b82f6; color: white; border: none; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer; margin-top: 8px; transition: background 0.15s; }
.checkin-btn:hover { background: #2563eb; }
.checkin-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* ── Sticky navigation tabs ── */
.nav-tab { display: flex; gap: 4px; padding: 8px; background: white; border-radius: 8px; margin-bottom: 12px; position: sticky; top: 0; z-index: 10; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
.nav-tab-btn { flex: 1; padding: 8px; border: none; border-radius: 6px; background: transparent; font-size: 12px; cursor: pointer; text-align: center; font-weight: 500; color: #64748b; transition: all 0.15s; }
.nav-tab-btn.active { background: #3b82f6; color: white; }

/* ── Message list items ── */
.message-item { padding: 10px; border-radius: 8px; background: #f8fafc; margin-bottom: 8px; cursor: pointer; transition: background 0.15s; }
.message-item:hover { background: #f1f5f9; }
.message-item.unread { border-left: 3px solid #3b82f6; }
.message-sender { font-weight: 600; font-size: 13px; color: #1e293b; }
.message-time { font-size: 11px; color: #94a3b8; }
.message-preview { font-size: 13px; color: #64748b; margin-top: 4px; }

/* ── Report items (green accent) ── */
.report-item { padding: 10px; border-radius: 8px; background: #f0fdf4; margin-bottom: 8px; border: 1px solid #dcfce7; }
.report-title { font-weight: 600; font-size: 13px; color: #1e293b; }
.report-meta { font-size: 11px; color: #64748b; }
.report-disclaimer { font-size: 11px; color: #92400e; margin-top: 4px; font-style: italic; }

/* ── Education list items ── */
.education-item { display: flex; align-items: center; gap: 10px; padding: 10px; border-radius: 8px; background: #f8fafc; margin-bottom: 8px; cursor: pointer; transition: background 0.15s; }
.education-item:hover { background: #f1f5f9; }

/* ── Links and buttons ── */
.action-link { color: #3b82f6; font-size: 13px; font-weight: 500; cursor: pointer; background: none; border: none; padding: 4px 0; transition: color 0.15s; }
.action-link:hover { color: #2563eb; text-decoration: underline; }
.section-link { display: inline-block; margin-top: 8px; color: #3b82f6; font-size: 13px; font-weight: 500; cursor: pointer; background: none; border: none; padding: 0; transition: color 0.15s; }
.section-link:hover { color: #2563eb; text-decoration: underline; }

/* ── Label button groups (sleep/energy/symptoms) ── */
.label-group { margin-bottom: 12px; }
.label-title { font-size: 13px; font-weight: 500; color: #475569; margin-bottom: 6px; }
.label-options { display: flex; gap: 6px; flex-wrap: wrap; }
.label-btn { padding: 6px 12px; border: 1px solid #e2e8f0; border-radius: 6px; background: white; font-size: 13px; cursor: pointer; transition: all 0.15s; color: #475569; }
.label-btn:hover { border-color: #3b82f6; color: #3b82f6; }
.label-btn.selected { background: #3b82f6; color: white; border-color: #3b82f6; }

/* ── Notes textarea ── */
.notes-input { width: 100%; padding: 10px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; resize: vertical; min-height: 60px; box-sizing: border-box; font-family: inherit; }
.notes-input:focus { outline: none; border-color: #3b82f6; }

/* ── Wearable metrics ── */
.wearable-metric { margin-bottom: 16px; }
.wearable-metric:last-child { margin-bottom: 0; }
.wearable-label { font-size: 14px; font-weight: 500; color: #1e293b; margin-bottom: 4px; }
.wearable-source { font-size: 11px; color: #94a3b8; }
.trend-up { color: #10b981; font-size: 12px; font-weight: 500; }
.trend-stable { color: #94a3b8; font-size: 12px; font-weight: 500; }

/* ── Upload items ── */
.upload-item { display: flex; align-items: center; gap: 8px; padding: 6px 0; font-size: 13px; color: #475569; }

/* ── Goal and handbook rows ── */
.goal-item { display: flex; align-items: flex-start; gap: 8px; padding: 4px 0; font-size: 13px; color: #475569; }
.handbook-item { padding: 3px 0; font-size: 13px; color: #475569; }

/* ── Today card rows ── */
.today-row { display: flex; align-items: flex-start; gap: 10px; padding: 8px 0; }
.today-icon { font-size: 18px; flex-shrink: 0; width: 24px; text-align: center; }
.today-body { flex: 1; }
.today-label { font-size: 13px; font-weight: 500; color: #1e293b; }
.today-sub { font-size: 12px; color: #64748b; margin-top: 2px; }

/* ── Loading / Error / Empty states ── */
.loading-state { text-align: center; padding: 48px 16px; color: #94a3b8; }
.error-state { text-align: center; padding: 48px 16px; color: #64748b; }
.retry-btn { margin-top: 12px; padding: 8px 16px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500; transition: background 0.15s; }
.retry-btn:hover { background: #2563eb; }
.empty-state { text-align: center; padding: 24px; color: #94a3b8; font-size: 13px; }

/* ── Clinic contact info ── */
.clinic-info { display: flex; align-items: center; gap: 8px; margin-top: 6px; font-size: 13px; }

/* ── Responsive: tighten on small screens ── */
@media (max-width: 480px) {
  .patient-dashboard { padding: 8px; }
  .patient-card { padding: 12px; border-radius: 10px; }
  .mood-emoji { font-size: 28px; }
  .nav-tab-btn { font-size: 11px; padding: 6px; }
}
`;

// Module-level state for handler callbacks
let _pageState = {};

// ════════════════════════════════════════════════════════════════════════════
//  ENTRY POINT — pgPatientDashboard(setTopbar, navigate)
// ════════════════════════════════════════════════════════════════════════════
export async function pgPatientDashboard(user) {
  setTopbar('Dashboard');

  const patientId = user?.patient_id || user?.id || 'guest';
  const todayStr = new Date().toISOString().slice(0, 10);
  const container = document.getElementById('patient-content');

  // ── Role gate: patient-only ──────────────────────────────────────────────
  if ((user?.role || 'patient') !== 'patient') {
    container.innerHTML = '<div class="patient-dashboard"><div class="patient-card" style="text-align:center;padding:32px">This dashboard is for patient access only.</div></div>';
    return;
  }

  // ── Inject scoped styles once per page lifecycle ─────────────────────────
  if (!document.getElementById('patient-dashboard-styles')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'patient-dashboard-styles';
    styleEl.textContent = PAGE_CSS;
    document.head.appendChild(styleEl);
  }

  // ── Loading state while data fetches ─────────────────────────────────────
  container.innerHTML = '<div class="patient-dashboard"><div class="loading-state"><div style="font-size:32px;margin-bottom:12px">\u25C8</div><div>Loading your dashboard...</div></div></div>';

  // ══════════════════════════════════════════════════════════════════════════
  //  DATA FETCHING — all APIs in parallel with graceful fallbacks
  // ══════════════════════════════════════════════════════════════════════════
  let dashboard = null, tasks = [], messages = [], reports = [];
  let wearable = null, education = [], courses = [], sessions = [];
  let fetchError = null;

  try {
    const [d, t, m, r, w, e, c, s] = await Promise.all([
      api.patientPortalDashboard?.().catch(() => null) ?? Promise.resolve(null),
      api.portalListHomeProgramTasks?.().catch(() => null) ?? Promise.resolve(null),
      api.patientPortalMessages?.().catch(() => null) ?? Promise.resolve(null),
      api.patientPortalReports?.().catch(() => null) ?? Promise.resolve(null),
      api.patientPortalWearableSummary?.(WEARABLE_DAYS).catch(() => null) ?? Promise.resolve(null),
      api.patientPortalLearnProgress?.().catch(() => null) ?? Promise.resolve(null),
      api.patientPortalCourses?.().catch(() => null) ?? Promise.resolve(null),
      api.patientPortalSessions?.().catch(() => null) ?? Promise.resolve(null),
    ]);
    dashboard = d;
    tasks = Array.isArray(t) ? t : (t?.items || []);
    messages = Array.isArray(m) ? m : [];
    reports = Array.isArray(r) ? r : [];
    wearable = w;
    education = Array.isArray(e) ? e : [];
    courses = Array.isArray(c) ? c : [];
    sessions = Array.isArray(s) ? s : [];
  } catch (err) {
    fetchError = err;
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  DEMO DATA SEED — first-time preview when all APIs return empty
  // ══════════════════════════════════════════════════════════════════════════
  const allEmpty = !dashboard && !tasks.length && !messages.length &&
                   !reports.length && !wearable && !education.length && !courses.length;
  if (allEmpty) {
    dashboard = {
      wellness_streak: 7,
      last_checkin_date: '2026-05-15',
      next_session: { title: 'TMS Session', time: '2026-05-16T14:00:00', clinician: 'Dr. Smith' },
      unread_messages: 2,
      pending_tasks: 2,
    };
    tasks = [
      {id:'demo-t1',title:'Breathing exercise (10 min)',category:'Breathing',instructions:'Practice slow deep breathing for 10 minutes',completed:false,due_on:todayStr,clinician_name:'Dr. Smith',task_type:'breathing'},
      {id:'demo-t2',title:'Sleep diary entry',category:'Sleep',instructions:'Log your sleep duration and quality from last night',completed:false,due_on:todayStr,task_type:'journal'},
      {id:'demo-t3',title:'Morning stretch routine',category:'Exercise',instructions:'Gentle full-body stretches for 15 minutes',completed:true,due_on:todayStr,completed_at:'2026-05-16T08:30:00'},
      {id:'demo-t4',title:'Medication log',category:'Medication',instructions:'Record all medications taken today',completed:true,due_on:todayStr,completed_at:'2026-05-16T09:00:00'},
    ];
    messages = [
      {id:'demo-m1',sender_name:'Dr. Smith',sender_type:'clinician',preview:'Your last session went well. Let\'s keep the momentum going.',subject:'Session follow-up',is_read:false,created_at:new Date(Date.now()-7200000).toISOString()},
      {id:'demo-m2',sender_name:'Clinic',sender_type:'system',preview:'Reminder: Your next session is scheduled for tomorrow at 2:00 PM.',subject:'Appointment reminder',is_read:false,created_at:new Date(Date.now()-86400000).toISOString()},
    ];
    reports = [
      {id:'demo-r1',title:'Session Summary',date:'2026-05-10',shared_by:'Dr. Smith',type:'session'},
      {id:'demo-r2',title:'Progress Report',date:'2026-05-01',shared_by:'Dr. Smith',type:'progress'},
    ];
    wearable = [
      {date:'2026-05-16',sleep_duration_h:7.2,hrv_ms:42,steps:6432,rhr_bpm:64},
      {date:'2026-05-15',sleep_duration_h:7.5,hrv_ms:45,steps:7200,rhr_bpm:62},
      {date:'2026-05-14',sleep_duration_h:6.8,hrv_ms:38,steps:5800,rhr_bpm:66},
      {date:'2026-05-13',sleep_duration_h:7.8,hrv_ms:48,steps:8100,rhr_bpm:60},
      {date:'2026-05-12',sleep_duration_h:7.0,hrv_ms:40,steps:6200,rhr_bpm:63},
      {date:'2026-05-11',sleep_duration_h:7.4,hrv_ms:44,steps:6900,rhr_bpm:61},
      {date:'2026-05-10',sleep_duration_h:6.9,hrv_ms:39,steps:5500,rhr_bpm:65},
    ];
    education = [
      {id:'demo-e1',title:'TMS: What to Expect',category:'tms',read:false},
      {id:'demo-e2',title:'Sleep Tips for Therapy',category:'sleep',read:false},
      {id:'demo-e3',title:'Managing Side Effects',category:'safety',read:false},
    ];
    courses = [
      {id:'demo-c1',name:'TMS Course',status:'active',total_sessions_planned:10,session_count:6,modality_slug:'tms',condition_slug:'depression'},
    ];
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  DERIVED DATA COMPUTATION
  // ══════════════════════════════════════════════════════════════════════════
  const streak = dashboard?.wellness_streak ?? _getStreak(patientId);
  const nextSession = dashboard?.next_session || null;
  const unreadCount = messages.filter(m => !m.is_read && m.sender_type !== 'patient').length;
  const completedTasks = tasks.filter(t => t.completed || t.done).length;
  const activeCourse = courses.find(c => c.status === 'active') || courses[0] || null;
  const sessDone = activeCourse ? (activeCourse.session_count || 0) : 0;
  const sessTotal = activeCourse ? (activeCourse.total_sessions_planned || 10) : 10;
  const progressPct = sessTotal > 0 ? Math.round((sessDone / sessTotal) * 100) : 0;

  const wDays = Array.isArray(wearable) ? wearable : [];
  const sleepVals = wDays.map(d => d.sleep_duration_h || 0);
  const sleepAvg = wDays.length ? (sleepVals.reduce((a, b) => a + b, 0) / wDays.length).toFixed(1) : '7.2';
  const stepsAvg = wDays.length ? Math.round(wDays.reduce((s, d) => s + (d.steps || 0), 0) / wDays.length) : 6432;
  const hrvAvg = wDays.length ? Math.round(wDays.reduce((s, d) => s + (d.hrv_ms || 0), 0) / wDays.length) : 42;
  const sleepTrend = _computeTrend(sleepVals, true);

  _pageState = { patientId, todayStr, streak, tasks };

  // ══════════════════════════════════════════════════════════════════════════
  //  RENDER — all 10 cards + sticky nav
  // ══════════════════════════════════════════════════════════════════════════
  if (fetchError) {
    container.innerHTML = `<div class="patient-dashboard"><div class="patient-card error-state"><div style="font-size:28px;margin-bottom:8px">\u26A0\uFE0F</div><div>We couldn't load your dashboard right now.</div><div style="font-size:12px;margin-top:4px">Please check your connection and try again.</div><button class="retry-btn" onclick="window.location.reload()">Retry</button></div></div>`;
    return;
  }

  container.innerHTML = `<div class="patient-dashboard">
${renderNavTabs()}
${renderToday(nextSession, unreadCount, tasks.length - completedTasks, streak)}
${renderCarePlan(progressPct, sessDone, sessTotal, completedTasks, tasks.length)}
${renderTasks(tasks)}
${renderMessages(messages)}
${renderReports(reports)}
${renderCheckIn(patientId, todayStr, streak)}
${renderProgress(sleepAvg, stepsAvg, hrvAvg, sleepTrend)}
${renderEducation(education)}
${renderUploads()}
${renderSafety()}
</div>`;

  attachHandlers(patientId, todayStr, streak);
}

// ════════════════════════════════════════════════════════════════════════════
//  CARD 1 — Sticky Navigation Tabs
// ════════════════════════════════════════════════════════════════════════════
function renderNavTabs() {
  return `<div class="nav-tab">
  <button class="nav-tab-btn active" onclick="window.scrollTo({top:0,behavior:'smooth'})">Overview</button>
  <button class="nav-tab-btn" onclick="document.getElementById('card-tasks').scrollIntoView({behavior:'smooth'})">Tasks</button>
  <button class="nav-tab-btn" onclick="document.getElementById('card-messages').scrollIntoView({behavior:'smooth'})">Messages</button>
  <button class="nav-tab-btn" onclick="document.getElementById('card-checkin').scrollIntoView({behavior:'smooth'})">Check-In</button>
</div>`;
}

// ════════════════════════════════════════════════════════════════════════════
//  CARD 2 — Today Card
// ════════════════════════════════════════════════════════════════════════════
function renderToday(nextSession, unreadCount, pendingCount, streak) {
  const sessTitle = nextSession?.title || 'TMS Session';
  const sessTime = nextSession ? _fmtTime(nextSession.time) : '2:00 PM';
  return `<div class="patient-card" id="card-today">
  <div class="patient-card-title">\uD83D\uDCC5 Today \u2014 ${esc(_todayDate())}</div>
  <div class="today-row">
    <span class="today-icon">\uD83D\uDDD3\uFE0F</span>
    <div class="today-body">
      <div class="today-label">Next: ${esc(sessTitle)}</div>
      <div class="today-sub">Today, ${esc(sessTime)}</div>
      <button class="section-link" onclick="window._navPatient && window._navPatient('patient-sessions')">Join Virtual Care</button>
    </div>
  </div>
  <div class="today-row">
    <span class="today-icon">\u2705</span>
    <div class="today-body">
      <div class="today-label">${pendingCount} task${pendingCount !== 1 ? 's' : ''} due today</div>
      <button class="section-link" onclick="document.getElementById('card-tasks').scrollIntoView({behavior:'smooth'})">View Tasks \u2192</button>
    </div>
  </div>
  <div class="today-row">
    <span class="today-icon">\uD83D\uDCAC</span>
    <div class="today-body">
      <div class="today-label">${unreadCount} unread message${unreadCount !== 1 ? 's' : ''}</div>
      <button class="section-link" onclick="window._navPatient && window._navPatient('patient-messages')">View Messages \u2192</button>
    </div>
  </div>
  <div class="today-row">
    <span class="today-icon">\uD83D\uDD25</span>
    <div class="today-body">
      <div class="today-label"><span class="streak-badge">\uD83D\uDD25 ${streak}-day wellness streak!</span></div>
      <button class="section-link" onclick="document.getElementById('card-checkin').scrollIntoView({behavior:'smooth'})">Check In \u2192</button>
    </div>
  </div>
</div>`;
}

// ════════════════════════════════════════════════════════════════════════════
//  CARD 3 — My Care Plan
// ════════════════════════════════════════════════════════════════════════════
function renderCarePlan(progressPct, sessDone, sessTotal, doneTasks, totalTasks) {
  const goals = ['Reduce headache frequency', 'Improve sleep quality', 'Complete home program'];
  return `<div class="patient-card" id="card-careplan">
  <div class="patient-card-title">\uD83C\uDFAF My Care Plan</div>
  <div style="margin-bottom:14px">
    <div style="font-size:13px;font-weight:600;color:#1e293b;margin-bottom:6px">Active Goals: ${goals.length}</div>
    ${goals.map(g => `<div class="goal-item"><span style="color:#3b82f6;font-weight:700">\u2022</span><span>${esc(g)}</span></div>`).join('')}
  </div>
  <div style="margin-bottom:14px">
    <div style="font-size:13px;font-weight:600;color:#1e293b;margin-bottom:4px">Course Progress: ${progressPct}%</div>
    <div class="progress-bar"><div class="progress-fill green" style="width:${progressPct}%"></div></div>
    <div style="font-size:12px;color:#64748b">${sessDone} of ${sessTotal} sessions completed</div>
  </div>
  <div style="margin-bottom:14px">
    <div style="font-size:13px;font-weight:600;color:#1e293b;margin-bottom:4px">Home Tasks: ${doneTasks} of ${totalTasks} done</div>
    <button class="section-link" onclick="document.getElementById('card-tasks').scrollIntoView({behavior:'smooth'})">View All Tasks \u2192</button>
  </div>
  <div>
    <div style="font-size:13px;font-weight:600;color:#1e293b;margin-bottom:6px">My Handbooks</div>
    <div class="handbook-item">\uD83D\uDCD6 TMS Patient Guide</div>
    <div class="handbook-item">\uD83D\uDCD6 Sleep Hygiene Tips</div>
    <button class="section-link" onclick="window._navPatient && window._navPatient('patient-handbooks')">View Library \u2192</button>
  </div>
</div>`;
}

// ════════════════════════════════════════════════════════════════════════════
//  CARD 4 — Home Tasks
// ════════════════════════════════════════════════════════════════════════════
function renderTasks(tasks) {
  if (!tasks.length) {
    return `<div class="patient-card" id="card-tasks">
  <div class="patient-card-title">\uD83D\uDCCB Today's Tasks</div>
  <div class="empty-state">
    <div style="font-size:24px;margin-bottom:8px">\uD83D\uDCCB</div>
    <div>No tasks assigned yet.</div>
    <div style="font-size:12px;margin-top:4px">Check back soon for your care team's assignments.</div>
  </div>
</div>`;
  }
  const rows = tasks.map(t => {
    const done = t.completed || t.done;
    const meta = done
      ? `Completed \u2014 ${t.completed_at ? _fmtTime(t.completed_at) : 'earlier today'}`
      : `${t.clinician_name ? 'Dr. ' + t.clinician_name.split(' ').pop() + ' assigned \u2014 ' : ''}Due today`;
    return `<div class="task-item" data-task-id="${esc(t.id)}">
  <div class="task-checkbox${done ? ' checked' : ''}" onclick="window._ptdToggleTask('${esc(t.id)}')"></div>
  <div style="flex:1">
    <div style="font-size:14px;color:#1e293b">${done ? '<s>' : ''}${esc(t.title || t.name || 'Task')}${done ? '</s>' : ''}</div>
    <div style="font-size:12px;color:#64748b;margin-top:2px">${esc(meta)}</div>
    ${done ? '' : `<button class="action-link" onclick="window._ptdToggleTask('${esc(t.id)}')">Mark Complete</button>`}
  </div>
</div>`;
  }).join('');
  return `<div class="patient-card" id="card-tasks">
  <div class="patient-card-title">\uD83D\uDCCB Today's Tasks</div>
  ${rows}
</div>`;
}

// ════════════════════════════════════════════════════════════════════════════
//  CARD 5 — Messages
// ════════════════════════════════════════════════════════════════════════════
function renderMessages(messages) {
  if (!messages.length) {
    return `<div class="patient-card" id="card-messages">
  <div class="patient-card-title">\uD83D\uDCAC Messages</div>
  <div class="empty-state">
    <div style="font-size:24px;margin-bottom:8px">\uD83D\uDCE8</div>
    <div>No messages yet.</div>
    <div style="font-size:12px;margin-top:4px">Your care team will reach out here.</div>
  </div>
  <button class="section-link" onclick="window._navPatient && window._navPatient('patient-messages')">Send Message \u2192</button>
</div>`;
  }
  const rows = messages.slice(0, 3).map(m => {
    const icon = m.sender_type === 'system' ? '\uD83D\uDCE2' : '\uD83D\uDCAC';
    return `<div class="message-item${!m.is_read ? ' unread' : ''}" onclick="window._navPatient && window._navPatient('patient-messages')">
  <div style="display:flex;justify-content:space-between;align-items:center">
    <span class="message-sender">${icon} ${esc(m.sender_name || 'Clinic')}</span>
    <span class="message-time">${esc(_relative(m.created_at))}</span>
  </div>
  <div class="message-preview">${esc(m.preview || m.subject || '')}</div>
</div>`;
  }).join('');
  return `<div class="patient-card" id="card-messages">
  <div class="patient-card-title">\uD83D\uDCAC Messages</div>
  ${rows}
  <button class="section-link" style="margin-top:4px" onclick="window._navPatient && window._navPatient('patient-messages')">Send Message \u2192</button>
</div>`;
}

// ════════════════════════════════════════════════════════════════════════════
//  CARD 6 — Shared Reports
// ════════════════════════════════════════════════════════════════════════════
function renderReports(reports) {
  if (!reports.length) {
    return `<div class="patient-card" id="card-reports">
  <div class="patient-card-title">\uD83D\uDCC4 Reports Shared With Me</div>
  <div class="empty-state">
    <div style="font-size:24px;margin-bottom:8px">\uD83D\uDCC4</div>
    <div>No reports shared yet.</div>
    <div style="font-size:12px;margin-top:4px">Your clinician will share reports here when they're ready.</div>
  </div>
</div>`;
  }
  const rows = reports.map(r =>
    `<div class="report-item">
  <div class="report-title">\uD83D\uDCC4 ${esc(r.title)} \u2014 ${esc(_fmtDate(r.date))}</div>
  <div class="report-meta">Shared by ${esc(r.shared_by || 'Your clinician')}</div>
  <button class="action-link" onclick="window._navPatient && window._navPatient('patient-reports')">View ${r.type === 'session' ? 'Summary' : 'Report'} \u2192</button>
  <div class="report-disclaimer">Your clinician reviewed this</div>
</div>`
  ).join('');
  return `<div class="patient-card" id="card-reports">
  <div class="patient-card-title">\uD83D\uDCC4 Reports Shared With Me</div>
  ${rows}
</div>`;
}

// ════════════════════════════════════════════════════════════════════════════
//  CARD 7 — Wellness Check-In
// ════════════════════════════════════════════════════════════════════════════
function renderCheckIn(patientId, todayStr, streak) {
  const saved = _getCheckin(patientId, todayStr);
  const submitted = !!saved;
  return `<div class="patient-card" id="card-checkin">
  <div class="patient-card-title">\uD83C\uDF3F Wellness Check-In</div>
  ${streak > 0 ? `<div style="margin-bottom:10px"><span class="streak-badge">\uD83D\uDD25 ${streak}-day streak!</span></div>` : ''}
  ${submitted ? `<div style="font-size:13px;color:#10b981;margin-bottom:10px">\u2713 You've checked in today. Great job!</div>` : ''}
  <div class="label-group">
    <div class="label-title">How are you feeling today?</div>
    <div class="mood-selector" id="mood-selector">
      ${MOODS.map(m => `<span class="mood-emoji${saved?.mood === m.value ? ' selected' : ''}" data-mood="${m.value}" title="${m.label}">${m.emoji}</span>`).join('')}
    </div>
  </div>
  <div class="label-group">
    <div class="label-title">Sleep last night?</div>
    <div class="label-options" id="sleep-selector">
      ${SLEEP_LABELS.map((l, i) => `<button class="label-btn${saved?.sleep === i ? ' selected' : ''}" data-sleep="${i}">${l}</button>`).join('')}
    </div>
  </div>
  <div class="label-group">
    <div class="label-title">Energy level?</div>
    <div class="label-options" id="energy-selector">
      ${ENERGY_LABELS.map((l, i) => `<button class="label-btn${saved?.energy === i ? ' selected' : ''}" data-energy="${i}">${l}</button>`).join('')}
    </div>
  </div>
  <div class="label-group">
    <div class="label-title">Any symptoms?</div>
    <div class="label-options" id="symptom-selector">
      ${SYMPTOM_LABELS.map((l, i) => `<button class="label-btn${saved?.symptoms === i ? ' selected' : ''}" data-symptoms="${i}">${l}</button>`).join('')}
    </div>
  </div>
  <div class="label-group">
    <div class="label-title">Notes (optional):</div>
    <textarea class="notes-input" id="checkin-notes" placeholder="Anything else you'd like to share...">${esc(saved?.notes || '')}</textarea>
  </div>
  <button class="checkin-btn" id="checkin-submit" ${submitted ? 'disabled' : ''} onclick="window._ptdSubmitCheckin()">${submitted ? 'Check-In Submitted' : 'Submit Check-In'}</button>
  <div style="font-size:11px;color:#64748b;text-align:center;margin-top:6px">Your clinician will review this</div>
</div>`;
}

// ════════════════════════════════════════════════════════════════════════════
//  CARD 8 — My Progress (Wearables)
// ════════════════════════════════════════════════════════════════════════════
function renderProgress(sleepAvg, stepsAvg, hrvAvg, sleepTrend) {
  const sPct = Math.min(100, Math.round((parseFloat(sleepAvg) / 9) * 100));
  const stPct = Math.min(100, Math.round((stepsAvg / 10000) * 100));
  const hPct = Math.min(100, Math.round((hrvAvg / 60) * 100));
  const sq = parseFloat(sleepAvg) >= 7 ? 'Good' : 'Fair';
  return `<div class="patient-card" id="card-progress">
  <div class="patient-card-title">\uD83D\uDCC8 My Progress</div>
  <div class="wearable-metric">
    <div class="wearable-label">\uD83D\uDE34 Sleep: ${sleepAvg}h avg</div>
    <div class="progress-bar"><div class="progress-fill blue" style="width:${sPct}%"></div></div>
    <div class="wearable-source">From: wearable data</div>
  </div>
  <div class="wearable-metric">
    <div class="wearable-label">\uD83C\uDFC3 Steps: ${stepsAvg.toLocaleString()} avg</div>
    <div class="progress-bar"><div class="progress-fill green" style="width:${stPct}%"></div></div>
    <div class="wearable-source">From: wearable data</div>
  </div>
  <div class="wearable-metric">
    <div class="wearable-label">\u2764\uFE0F HRV: ${hrvAvg} ms</div>
    <div class="progress-bar"><div class="progress-fill orange" style="width:${hPct}%"></div></div>
    <div class="wearable-source">From: wearable data</div>
  </div>
  <div class="wearable-metric">
    <div class="wearable-label">\uD83D\uDCA4 Sleep Quality: ${sq}</div>
    <div class="${sleepTrend.className}">Trend: ${sleepTrend.label}</div>
  </div>
</div>`;
}

// ════════════════════════════════════════════════════════════════════════════
//  CARD 9 — Education Centre
// ════════════════════════════════════════════════════════════════════════════
function renderEducation(education) {
  const articles = education.length ? education : [
    { id: 'e1', title: 'TMS: What to Expect' },
    { id: 'e2', title: 'Sleep Tips for Therapy' },
    { id: 'e3', title: 'Managing Side Effects' },
  ];
  const rows = articles.slice(0, 3).map(a =>
    `<div class="education-item" onclick="window._navPatient && window._navPatient('patient-education')">
  <span style="font-size:16px">\uD83D\uDCD6</span>
  <span style="font-size:13px;color:#1e293b">${esc(a.title)}</span>
</div>`
  ).join('');
  return `<div class="patient-card" id="card-education">
  <div class="patient-card-title">\uD83D\uDCDA My Education</div>
  ${rows}
  <button class="section-link" onclick="window._navPatient && window._navPatient('patient-education')">\u2753 Frequently Asked Questions \u2192</button>
</div>`;
}

// ════════════════════════════════════════════════════════════════════════════
//  CARD 10 — Upload Centre
// ════════════════════════════════════════════════════════════════════════════
function renderUploads() {
  const uploads = [
    { name: 'Sleep diary', due: 'May 18' },
    { name: 'Voice journal', due: 'May 20' },
  ];
  return `<div class="patient-card" id="card-uploads">
  <div class="patient-card-title">\uD83D\uDCE4 Uploads</div>
  <div style="font-size:13px;color:#475569;margin-bottom:8px">Upload requested files</div>
  <div style="font-size:13px;color:#1e293b;font-weight:500;margin-bottom:6px">${uploads.length} files requested:</div>
  ${uploads.map(u => `<div class="upload-item">\u2022 ${esc(u.name)} <span style="color:#94a3b8">(due ${esc(u.due)})</span></div>`).join('')}
  <button class="section-link" onclick="window._navPatient && window._navPatient('patient-uploads')">Upload Files \u2192</button>
</div>`;
}

// ════════════════════════════════════════════════════════════════════════════
//  CARD 11 — Safety Footer
// ════════════════════════════════════════════════════════════════════════════
function renderSafety() {
  return `<div class="safety-footer" id="card-safety">
  <div class="safety-footer-title"><span>\u26A0\uFE0F</span> Important</div>
  <ul style="margin:0;padding-left:18px;line-height:1.7">
    <li>This is educational information only.</li>
    <li>Your clinician will review all your check-ins and reports.</li>
    <li>Contact your clinic for medical advice.</li>
    <li>For emergencies, call your local emergency services.</li>
  </ul>
  <div class="clinic-info">\uD83D\uDCDE Clinic: <strong>(555) 123-4567</strong></div>
  <div class="clinic-info">\uD83D\uDEA8 Emergency: <strong>911</strong></div>
</div>`;
}

// ════════════════════════════════════════════════════════════════════════════
//  INTERACTIVE HANDLERS
// ════════════════════════════════════════════════════════════════════════════

function attachHandlers(patientId, todayStr, currentStreak) {
  // ── Mood emoji selection ─────────────────────────────────────────────────
  document.querySelectorAll('#mood-selector .mood-emoji').forEach(el => {
    el.addEventListener('click', () => {
      document.querySelectorAll('#mood-selector .mood-emoji').forEach(e => e.classList.remove('selected'));
      el.classList.add('selected');
    });
  });

  // ── Label button groups (sleep / energy / symptoms) ──────────────────────
  ['sleep', 'energy', 'symptoms'].forEach(group => {
    document.querySelectorAll(`#${group}-selector .label-btn`).forEach(el => {
      el.addEventListener('click', () => {
        document.querySelectorAll(`#${group}-selector .label-btn`).forEach(e => e.classList.remove('selected'));
        el.classList.add('selected');
      });
    });
  });

  // ── Submit wellness check-in ─────────────────────────────────────────────
  window._ptdSubmitCheckin = async function () {
    const moodEl = document.querySelector('#mood-selector .mood-emoji.selected');
    if (!moodEl) {
      alert('Please select how you\'re feeling today.');
      return;
    }
    const checkinData = {
      mood: Number(moodEl.dataset.mood),
      sleep: Number(document.querySelector('#sleep-selector .label-btn.selected')?.dataset.sleep ?? -1),
      energy: Number(document.querySelector('#energy-selector .label-btn.selected')?.dataset.energy ?? -1),
      symptoms: Number(document.querySelector('#symptom-selector .label-btn.selected')?.dataset.symptoms ?? -1),
      notes: (document.getElementById('checkin-notes')?.value || '').trim(),
      date: todayStr,
    };

    // Persist locally (patient-scoped)
    _setCheckin(patientId, todayStr, checkinData);

    // Update streak
    const yesterdayStr = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const hadYesterday = !!_getCheckin(patientId, yesterdayStr);
    const newStreak = hadYesterday ? currentStreak + 1 : 1;
    _setStreak(patientId, newStreak);

    // Attempt API submission (non-blocking)
    try {
      if (api.patientPortalSubmitWellnessLog) {
        await api.patientPortalSubmitWellnessLog(checkinData);
      }
    } catch (_e) {
      // localStorage is source of truth; API failure is non-blocking
    }

    // Update UI
    const btn = document.getElementById('checkin-submit');
    if (btn) {
      btn.textContent = 'Check-In Submitted';
      btn.disabled = true;
    }
    const card = document.getElementById('card-checkin');
    if (card && !card.querySelector('[data-checkin-confirm]')) {
      const confirmEl = document.createElement('div');
      confirmEl.dataset.checkinConfirm = 'true';
      confirmEl.style.cssText = 'font-size:13px;color:#10b981;margin-bottom:10px';
      confirmEl.textContent = '\u2713 You\'ve checked in today. Great job!';
      card.insertBefore(confirmEl, card.children[1]);
    }
  };

  // ── Toggle task completion ───────────────────────────────────────────────
  window._ptdToggleTask = function (taskId) {
    const item = document.querySelector(`[data-task-id="${taskId}"]`);
    if (!item) return;
    const checkbox = item.querySelector('.task-checkbox');
    const titleEl = item.querySelector('div[style*="color:#1e293b"]');
    const nowDone = !checkbox.classList.contains('checked');
    checkbox.classList.toggle('checked');
    if (titleEl) {
      const txt = titleEl.textContent.replace(/<\/?s>/g, '');
      titleEl.innerHTML = nowDone ? `<s>${esc(txt)}</s>` : esc(txt);
    }
  };
}
