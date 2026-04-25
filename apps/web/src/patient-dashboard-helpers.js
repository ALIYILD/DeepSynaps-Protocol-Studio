/**
 * Patient Dashboard — pure helpers (no DOM, no globals).
 *
 * Extracted here so `node --test` can import them without pulling in
 * the rest of pages-patient.js (which touches `window`).
 */

/**
 * Compute days-until countdown from a date (or ISO string) relative to a
 * reference "now" epoch-ms. Returns `null` when `next` is missing/invalid.
 * @param {Date|string|null|undefined} next
 * @param {number} [now]  epoch ms (defaults to Date.now())
 */
export function computeCountdown(next, now = Date.now()) {
  if (!next) return null;
  let target;
  try { target = new Date(next).getTime(); } catch (_e) { return null; }
  if (!Number.isFinite(target)) return null;
  const diff = target - now;
  const days = Math.ceil(diff / 86400000);
  let label;
  if (days <= 0) label = 'Today';
  else if (days === 1) label = 'Tomorrow';
  else label = 'In ' + days + ' days';
  return { days: Math.max(0, days), label };
}

/** Treatment phase label from % complete. */
export function phaseLabel(pct) {
  if (pct == null || pct === 0) return 'Getting started';
  if (pct <= 20)  return 'Early treatment';
  if (pct <= 50)  return 'Active treatment';
  if (pct <= 80)  return 'Consolidation';
  if (pct < 100)  return 'Final phase';
  return 'Complete';
}

/**
 * Outcome goal-marker math for the patient-dashboard progress bars.
 * Returns { goal, fillPct, markerPct, down, maxRange } for a given outcome.
 * `down` = lower-is-better (true for PHQ-9 / GAD-7 / PSQI).
 *
 * API returns `template_title`; legacy/demo code may pass `template_name`.
 * @param {{template_title?:string, template_name?:string, score_numeric?:number|null}} latest
 * @param {{template_title?:string, template_name?:string, score_numeric?:number|null}|null} [baseline]
 */
export function outcomeGoalMarker(latest, baseline) {
  const name = String(latest?.template_title || latest?.template_name || '').toLowerCase();
  const current = Number(latest?.score_numeric ?? 0);
  const THRESHOLDS = { phq: 5, gad: 4, psqi: 5 };
  let goal = null;
  let maxRange = 27;
  let down = false;
  if (name.includes('phq'))       { goal = THRESHOLDS.phq;  maxRange = 27; down = true; }
  else if (name.includes('gad'))  { goal = THRESHOLDS.gad;  maxRange = 21; down = true; }
  else if (name.includes('psqi')) { goal = THRESHOLDS.psqi; maxRange = 21; down = true; }
  else {
    const base = Number(baseline?.score_numeric);
    if (Number.isFinite(base) && base > 0) {
      goal = Math.max(1, Math.round(base * 0.5));
      maxRange = Math.max(base, current, goal, 10);
      down = base >= current;
    } else {
      maxRange = Math.max(current, 10);
    }
  }
  const fillPct = down
    ? Math.max(0, Math.min(100, Math.round(((maxRange - current) / maxRange) * 100)))
    : Math.max(0, Math.min(100, Math.round((current / maxRange) * 100)));
  const markerPct = goal != null
    ? (down
        ? Math.max(0, Math.min(100, Math.round(((maxRange - goal) / maxRange) * 100)))
        : Math.max(0, Math.min(100, Math.round((goal / maxRange) * 100))))
    : null;
  return { goal, fillPct, markerPct, down, maxRange };
}

/**
 * Pick the single "Today's focus" card content for the Patient home.
 *
 * Priority order (first match wins):
 *   1. Next session ≤ 24h away
 *   2. Daily check-in not yet done today
 *   3. Any home task still pending
 *   4. Unread clinician message
 *   5. Wearable sleep < 6h last night
 *   6. Fallback ("You're on track today.")
 *
 * Pure — no DOM, no localStorage read; snooze state is passed in via
 * `state.snoozed` so this stays testable under plain `node --test`.
 *
 * @param {object} state
 * @param {Date|string|null} [state.nextSessionAt]    ISO / Date — next scheduled session
 * @param {string|null}      [state.nextSessionTimeLabel]  Pre-formatted time string ("10:00 AM")
 * @param {boolean}          [state.checkedInToday]   Did patient already submit today's check-in?
 * @param {Array<object>}    [state.openTasks]        Pending home-program tasks (use .title)
 * @param {number}           [state.streakDays]       Current wellness streak (for caption)
 * @param {object|null}      [state.unreadMessage]    Latest unread clinician message (.sender_name,.subject,.body)
 * @param {number|null}      [state.lastNightSleepHours]   Wearable sleep duration last night
 * @param {boolean}          [state.snoozed]          True if the user tapped "Later" today
 * @param {number}           [state.now]              epoch ms override (for tests)
 *
 * @returns {{
 *   kind: 'session'|'checkin'|'task'|'message'|'sleep'|'fallback',
 *   eyebrow: string,
 *   headline: string,
 *   caption: string,
 *   primary: { label: string, target: string },
 *   secondaryLabel: string,
 *   hide: boolean
 * }}
 */
export function pickTodaysFocus(state = {}) {
  const now = Number.isFinite(state.now) ? state.now : Date.now();
  const EY = "TODAY'S FOCUS";
  const SEC = 'Later';
  function card(kind, headline, caption, primaryLabel, primaryTarget, icon, { hide = false } = {}) {
    return {
      kind,
      eyebrow: EY,
      headline,
      caption,
      icon,
      primary: { label: primaryLabel, target: primaryTarget },
      secondaryLabel: SEC,
      hide,
    };
  }

  // 1. Next session ≤ 24 h away
  if (state.nextSessionAt) {
    let ts = null;
    try { ts = new Date(state.nextSessionAt).getTime(); } catch (_e) { ts = null; }
    if (Number.isFinite(ts)) {
      const diffMs = ts - now;
      if (diffMs > 0 && diffMs <= 24 * 3600 * 1000) {
        const timeLabel = state.nextSessionTimeLabel || '';
        const head = timeLabel
          ? `Your session is tomorrow at ${timeLabel}.`
          : 'Your session is tomorrow.';
        return card(
          'session',
          head,
          'A short review the night before helps you get the most from it.',
          'Open session notes',
          'patient-sessions',
          'calendar',
        );
      }
    }
  }

  // 2. Daily check-in not yet done today
  if (state.checkedInToday === false) {
    return card(
      'checkin',
      'Take your 2-minute check-in.',
      "Your care team uses this to see how you're doing day-to-day.",
      'Start check-in',
      'pt-wellness',
      'clipboard',
    );
  }

  // 3. Any home task still pending
  const openTasks = Array.isArray(state.openTasks) ? state.openTasks : [];
  if (openTasks.length > 0) {
    const first = openTasks[0] || {};
    const title = first.title || first.name || 'home task';
    const streak = Number.isFinite(state.streakDays) && state.streakDays > 0 ? state.streakDays : null;
    const caption = streak
      ? `Finishing it keeps your ${streak}-day streak going.`
      : 'Small steps, done today, add up fastest.';
    return card(
      'task',
      `One task left today: ${title}.`,
      caption,
      'Open task',
      'pt-wellness',
      'check',
    );
  }

  // 4. Unread clinician message
  if (state.unreadMessage) {
    const m = state.unreadMessage;
    const sender = m.sender_name || m.clinician_name || 'your clinician';
    const body = String(m.subject || m.body || '').trim();
    const preview = body.length > 60 ? body.slice(0, 57) + '…' : body;
    return card(
      'message',
      `Message from ${sender}.`,
      preview || 'Tap to read your latest message.',
      'Open message',
      'patient-messages',
      'mail',
    );
  }

  // 5. Wearable sleep < 6 h last night
  if (Number.isFinite(state.lastNightSleepHours) && state.lastNightSleepHours < 6) {
    return card(
      'sleep',
      'You slept less than usual last night.',
      'Rest helps treatment work. Try an earlier wind-down tonight.',
      'Log how you feel',
      'pt-wellness',
      'moon',
    );
  }

  // 6. Fallback — hide when snoozed
  return card(
    'fallback',
    "You're on track today.",
    'Nothing is waiting on you. Small, consistent steps are what matter.',
    'See your progress',
    'pt-outcomes',
    'sparkle',
    { hide: !!state.snoozed },
  );
}

/**
 * Demo-mode detection for the Patient Dashboard. Pure helper — safe for
 * server-side tests; reads from injected accessors so `localStorage` and
 * `getToken` calls can be mocked.
 *
 * Returns true when ANY of the following holds:
 *   - user.role === 'patient' AND user.email includes 'demo' or 'example'
 *   - getToken() looks like the seeded 'patient-demo-token'
 *   - localStorage 'ds_force_demo_patient' === '1'
 * Safe: returns false when user is null/undefined.
 *
 * @param {object|null} user
 * @param {object} [deps]
 * @param {() => string|null} [deps.getToken]
 * @param {{ getItem: (k: string) => string|null }} [deps.storage]
 */
export function isDemoPatient(user, deps = {}) {
  const getToken = typeof deps.getToken === 'function' ? deps.getToken : null;
  const storage = deps.storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  // 1. Explicit force flag via localStorage.
  try {
    if (storage && storage.getItem && storage.getItem('ds_force_demo_patient') === '1') return true;
  } catch (_e) { /* ignore */ }
  // 2. Seeded demo token.
  try {
    if (getToken) {
      const tok = getToken();
      if (typeof tok === 'string' && tok.indexOf('patient-demo-token') >= 0) return true;
    }
  } catch (_e) { /* ignore */ }
  // 3. Role+email heuristic.
  if (!user || typeof user !== 'object') return false;
  if (user.role !== 'patient') return false;
  const email = String(user.email || '').toLowerCase();
  if (!email) return false;
  return email.indexOf('demo') >= 0 || email.indexOf('example') >= 0;
}

/**
 * Patient-friendly demo seed — Samantha Li (34F · MDD · tDCS · Course 3/20).
 * Used only when `isDemoPatient()` returns true, and only overlaid into empty
 * fields. Kept as a deep-frozen-ish plain object so tests + renderer share the
 * same reference shape.
 *
 * `administered_at` / `scheduled_at` values are computed at import time so the
 * demo looks chronologically sensible from "today" regardless of clock.
 */
function _demoDates() {
  const ONE_DAY = 86400000;
  const now = Date.now();
  // Anchor weekly cadence back 8 weeks; final entry ~this week (just past).
  const weeksAgo = n => new Date(now - n * 7 * ONE_DAY).toISOString();
  const daysAhead = n => new Date(now + n * ONE_DAY).toISOString();
  return {
    // PHQ-9: 6 dated entries dropping 22 → 14 over 8 weeks (weekly cadence).
    phq9: [
      { template_name: 'PHQ-9', score_numeric: 22, administered_at: weeksAgo(8) },
      { template_name: 'PHQ-9', score_numeric: 20, administered_at: weeksAgo(7) },
      { template_name: 'PHQ-9', score_numeric: 19, administered_at: weeksAgo(5) },
      { template_name: 'PHQ-9', score_numeric: 17, administered_at: weeksAgo(3) },
      { template_name: 'PHQ-9', score_numeric: 15, administered_at: weeksAgo(1) },
      { template_name: 'PHQ-9', score_numeric: 14, administered_at: new Date(now - 2 * ONE_DAY).toISOString() },
    ],
    // GAD-7: 4 dated entries dropping 15 → 10.
    gad7: [
      { template_name: 'GAD-7', score_numeric: 15, administered_at: weeksAgo(7) },
      { template_name: 'GAD-7', score_numeric: 13, administered_at: weeksAgo(4) },
      { template_name: 'GAD-7', score_numeric: 11, administered_at: weeksAgo(2) },
      { template_name: 'GAD-7', score_numeric: 10, administered_at: new Date(now - 3 * ONE_DAY).toISOString() },
    ],
    // Next session: 2 days out at 09:00.
    nextSessionAt: (() => {
      const d = new Date(now + 2 * ONE_DAY);
      d.setHours(9, 0, 0, 0);
      return d.toISOString();
    })(),
    daysAhead,
  };
}

const _DEMO_D = _demoDates();

export const DEMO_PATIENT = Object.freeze({
  profile: Object.freeze({
    first_name: 'Samantha',
    last_name: 'Li',
    age: 34,
    condition: 'Major Depressive Disorder',
    modality: 'tDCS',
  }),
  activeCourse: Object.freeze({
    id: 'demo-crs-sam-li',
    name: 'tDCS Course — Left DLPFC · Depression',
    total_sessions_planned: 20,
    session_count: 12,
    modality_slug: 'tDCS',
    condition_slug: 'depression-mdd',
    condition: 'mood',
    status: 'active',
    phase: 'Active Treatment',
    primary_clinician_name: 'Dr. Amelia Kolmar',
    care_team: [
      { name: 'Dr. Amelia Kolmar', role: 'Clinical Director',    avatar: 'AK', color: 'teal' },
      { name: 'Raquel Ortiz, NP',  role: 'Nurse Practitioner',   avatar: 'RO', color: 'violet' },
      { name: 'Jordan Hale',       role: 'tDCS Technician',      avatar: 'JH', color: 'amber' },
    ],
  }),
  nextSession: Object.freeze({
    id: 'demo-sess-13',
    session_number: 13,
    scheduled_at: _DEMO_D.nextSessionAt,
    status: 'scheduled',
    location: 'Room A',
    modality_slug: 'tDCS',
    duration_minutes: 30,
    time_label: '9:00 AM',
  }),
  outcomes: Object.freeze([..._DEMO_D.phq9, ..._DEMO_D.gad7]),
  tasks: Object.freeze([
    { id: 'demo-task-1', title: 'Breath pacing (4–7–8 × 3)', category: 'breathwork',   completed: true,  task_type: 'exercise' },
    { id: 'demo-task-2', title: 'Daily mood log',             category: 'reflection',  completed: true,  task_type: 'checkin' },
    { id: 'demo-task-3', title: 'Read: "Why DLPFC?"',        category: 'learning',    completed: false, task_type: 'reading' },
    { id: 'demo-task-4', title: 'Evening check-in',           category: 'reflection',  completed: false, task_type: 'checkin' },
  ]),
  messages: Object.freeze([
    {
      id: 'demo-msg-1',
      sender_name: 'Dr. Amelia Kolmar',
      sender_type: 'clinician',
      subject: 'Great progress this week',
      body: 'Great progress this week — your PHQ-9 dropped 3 points. See you Tuesday.',
      is_read: false,
      created_at: new Date(Date.now() - 5 * 3600000).toISOString(),
    },
  ]),
  wearables: Object.freeze({
    hrv: 48,
    sleep: 7.4,
    rhr: 62,
    steps: 7800,
    sleep_trend_7d: [6.2, 7.0, 6.8, 7.5, 7.1, 7.4, 7.4],
  }),
  streak: 6,
  mood_7d: [6, 5, 7, 6, 8, 7, 7],
});

/**
 * Overlay a demo value into `real` only when `real` is "empty". Never
 * overwrites real data the endpoint returned.
 * Rules for "empty":
 *   - null / undefined / '' → empty
 *   - array of length 0     → empty
 *   - everything else       → NOT empty (keep real)
 * Returns `{ value, usedDemo }` — the truthy `usedDemo` flag lets callers
 * tag the rendered card with `.pth-demo-tag`.
 */
export function demoOverlay(real, demo) {
  const isEmpty = (
    real == null
    || real === ''
    || (Array.isArray(real) && real.length === 0)
  );
  if (isEmpty) return { value: demo, usedDemo: true };
  return { value: real, usedDemo: false };
}

/**
 * Group outcomes by template_name, return the N most recent distinct templates.
 * Each entry: { template_name, baseline, latest, lastAt, allScores[] }.
 * @param {Array<{template_name?:string, score_numeric?:number|null, administered_at?:string|null}>} outcomes
 * @param {number} [limit]
 */
export function groupOutcomesByTemplate(outcomes, limit = 4) {
  if (!Array.isArray(outcomes) || outcomes.length === 0) return [];
  const byT = new Map();
  for (const o of outcomes) {
    // API returns `template_title`; demo/legacy rows may only have `template_name`.
    const k = String(o?.template_title || o?.template_name || '').trim();
    if (!k) continue;
    if (!byT.has(k)) byT.set(k, []);
    byT.get(k).push(o);
  }
  const groups = [];
  for (const [name, arr] of byT.entries()) {
    const sorted = arr.slice().sort((a, b) =>
      new Date(a.administered_at || 0) - new Date(b.administered_at || 0));
    const baseline = sorted[0] || null;
    const latest = sorted[sorted.length - 1] || null;
    groups.push({
      template_name: name,
      template_title: name,
      baseline,
      latest,
      lastAt: latest?.administered_at || null,
      allScores: sorted.map(o => o.score_numeric).filter(v => v != null),
    });
  }
  groups.sort((a, b) => new Date(b.lastAt || 0) - new Date(a.lastAt || 0));
  return groups.slice(0, Math.max(0, limit));
}

// ── Assessments page helpers (pure) ─────────────────────────────────────────
// Extracted so pgPatientAssessments() renderer stays thin AND so node --test
// can exercise status / score / draft / demo-seed logic without loading the
// DOM-heavy pages-patient.js module.

/**
 * Classify a raw assessment row into one of:
 *   'due' · 'in-progress' · 'upcoming' · 'completed'
 * Falls back to date-based inference when no explicit status is set.
 * @param {object} a  raw assessment row from the portal endpoint
 * @param {number} [now]  epoch ms (defaults to Date.now())
 */
export function classifyAssessmentStatus(a, now = Date.now()) {
  if (!a || typeof a !== 'object') return 'due';
  const st = String(a.status || '').toLowerCase().replace(/[^a-z_]/g, '');
  if (['completed', 'done', 'submitted'].includes(st))              return 'completed';
  if (['in_progress', 'inprogress', 'started', 'partial'].includes(st)) return 'in-progress';
  if (a.completed_at || a.administered_at)                           return 'completed';
  if (['scheduled', 'upcoming'].includes(st))                       return 'upcoming';
  if (a.due_date) {
    const due = new Date(a.due_date).getTime();
    if (!Number.isFinite(due)) return 'due';
    return due <= now ? 'due' : 'upcoming';
  }
  return 'due';
}

/**
 * Map a numeric score to a friendly { label, note } using a scoreRanges
 * array of `{ max, label, note }`. Returns null when no context can be
 * computed — the caller MUST then not render a bare number.
 * @param {{scoreRanges?: Array<{max:number,label:string,note:string}>}|null} meta
 * @param {number|string|null|undefined} score
 */
export function scoreContext(meta, score) {
  if (score == null || score === '') return null;
  if (!meta || !Array.isArray(meta.scoreRanges) || meta.scoreRanges.length === 0) return null;
  const n = Number(score);
  if (!Number.isFinite(n)) return null;
  for (const band of meta.scoreRanges) {
    if (n <= band.max) return { label: band.label, note: band.note };
  }
  return null;
}

/** LocalStorage key for a per-assessment in-progress draft. */
export function draftStorageKey(id) {
  return 'ds_assess_draft_' + String(id || '');
}

/**
 * Load a draft payload from storage. Returns null when no draft, or when
 * the stored JSON is malformed.
 * @param {string} id
 * @param {{getItem:(k:string)=>string|null}} [storage]
 */
export function loadDraft(id, storage) {
  const s = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!s || !id) return null;
  try {
    const raw = s.getItem(draftStorageKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.answers || typeof parsed.answers !== 'object') return null;
    return { answers: parsed.answers, savedAt: parsed.savedAt || null };
  } catch (_e) { return null; }
}

/**
 * Save a draft payload. Accepts either an array of answers (per-form
 * Likert state) OR a plain answers-object. Always stamps `savedAt`.
 */
export function saveDraft(id, answers, storage) {
  const s = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!s || !id) return false;
  try {
    s.setItem(draftStorageKey(id), JSON.stringify({
      answers,
      savedAt: new Date().toISOString(),
    }));
    return true;
  } catch (_e) { return false; }
}

export function clearDraft(id, storage) {
  const s = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!s || !id) return false;
  try { s.removeItem(draftStorageKey(id)); return true; } catch (_e) { return false; }
}

/**
 * 3-row demo seed for the Assessments page. Used only when demo mode is
 * on and the real endpoint returned `[]`. Dates are computed relative
 * to the supplied `now` so the seed is chronologically sensible.
 * Row order: [due today, completed yesterday, upcoming in 3 days].
 * @param {number} [now] epoch ms
 */
export function demoAssessmentSeed(now = Date.now()) {
  const ONE_DAY = 86400000;
  const iso = (ms) => new Date(ms).toISOString();
  return [
    {
      id: 'demo-assess-phq9-due',
      template_id: 'phq9',
      template_title: 'Mood Check-In (PHQ-9)',
      status: 'pending',
      due_date: iso(now),
      score: null,
      created_at: iso(now - 2 * ONE_DAY),
      _demo: true,
    },
    {
      id: 'demo-assess-phq9-done',
      template_id: 'phq9',
      template_title: 'Mood Check-In (PHQ-9)',
      status: 'completed',
      completed_at: iso(now - 1 * ONE_DAY),
      administered_at: iso(now - 1 * ONE_DAY),
      score: 9,
      created_at: iso(now - 8 * ONE_DAY),
      _demo: true,
    },
    {
      id: 'demo-assess-gad7-upcoming',
      template_id: 'gad7',
      template_title: 'Anxiety Check-In (GAD-7)',
      status: 'scheduled',
      due_date: iso(now + 3 * ONE_DAY),
      score: null,
      created_at: iso(now - 2 * ONE_DAY),
      _demo: true,
    },
  ];
}

/**
 * Select the call-tier for the patient Messages voice/video buttons.
 *
 *   Tier A — meeting URL is available. Open it in a new tab.
 *   Tier B — no URL but a clinician is assigned. Show "Request a call"
 *            inline panel that will POST a call-request message.
 *   Tier C — no clinician assigned. The /messages POST will return
 *            422/400; caller should surface that message in a toast.
 *
 * In demo mode we always return Tier A pointed at a public Jitsi room so
 * the button does something real without pinging a real clinician.
 *
 * @param {object} ctx
 * @param {object|null} [ctx.activeCourse]  patient-portal course row
 * @param {object|null} [ctx.me]            patient-portal /me response
 * @param {'video'|'voice'} [ctx.mode]      call mode (defaults to 'video')
 * @param {object} [opts]
 * @param {boolean} [opts.demo]             true when isDemoPatient() fired
 * @param {string}  [opts.patientId]        used to shape the demo Jitsi room
 */
export function pickCallTier(ctx = {}, opts = {}) {
  const mode = ctx.mode === 'voice' ? 'voice' : 'video';
  const course = ctx.activeCourse || null;
  const me = ctx.me || null;

  // Demo mode → always Tier A with a public Jitsi room. No backend needed.
  if (opts.demo) {
    const pid = String(opts.patientId || me?.patient_id || 'demo').replace(/[^a-z0-9-]/gi, '').slice(0, 32) || 'demo';
    return {
      tier: 'A',
      mode,
      url: `https://meet.jit.si/deepsynaps-demo-${pid}`,
      demo: true,
    };
  }

  // Tier A — a real meeting URL is already provisioned on the course row.
  const url = course && (
    course.clinician_meeting_url
    || course.care_team_meeting_url
    || course.meeting_url
  );
  if (url && typeof url === 'string' && /^https?:\/\//i.test(url)) {
    return { tier: 'A', mode, url, demo: false };
  }

  // Tier B — a clinician is assigned; we can send a call-request message.
  const hasClinician = !!(
    (course && (course.clinician_id || course.primary_clinician_id || course.primary_clinician_name))
    || (me && (me.clinician_id || me.primary_clinician_name))
  );
  if (hasClinician) {
    return {
      tier: 'B',
      mode,
      subject: `${mode === 'voice' ? 'Voice' : 'Video'} call request`,
      body: `Please let me know a time that works for a ${mode} call. Recent check-in data attached for context.`,
      demo: false,
    };
  }

  // Tier C — no clinician. The POST will 422; caller surfaces as toast.
  return {
    tier: 'C',
    mode,
    demo: false,
  };
}

/**
 * 3-exchange demo thread for the patient Messages page, shown only when
 * `isDemoPatient()` is true AND the portal returned 0 messages.
 *
 * Shape mirrors the portal `PortalMessageOut` contract well enough for the
 * thread renderer to bucket / date / attribute each row:
 *   { id, thread_id, sender_type, sender_name, body, created_at, is_read, _demo }
 *
 * Each row carries `_demo: true` so the renderer can append a
 * `.pth-demo-tag` chip per PR #42 convention.
 *
 * @param {number} [now] epoch ms (defaults to Date.now()) — lets tests fix time
 */
export function demoMessagesSeed(now = Date.now()) {
  const HOUR = 3600000;
  const ONE_DAY = 86400000;
  const iso = (ms) => new Date(ms).toISOString();
  const TH = 'demo-thread-kolmar';
  return [
    {
      id: 'demo-msg-1',
      thread_id: TH,
      sender_type: 'clinician',
      sender_name: 'Dr. Kolmar',
      subject: 'Check-in notes',
      body: "Hi Samantha, your check-ins look great this week. Let me know if you have any questions about Tuesday's session.",
      is_read: true,
      created_at: iso(now - 48 * HOUR),
      _demo: true,
    },
    {
      id: 'demo-msg-2',
      thread_id: TH,
      sender_type: 'patient',
      sender_name: 'You',
      subject: 'Check-in notes',
      body: 'Thanks — sleep has been better since I moved the session to morning. Small headache after session 10, gone within an hour.',
      is_read: true,
      created_at: iso(now - 24 * HOUR),
      _demo: true,
    },
    {
      id: 'demo-msg-3',
      thread_id: TH,
      sender_type: 'clinician',
      sender_name: 'Dr. Kolmar',
      subject: 'Check-in notes',
      body: 'Good to hear. Scalp tingling is common, we can adjust the electrode saline if it repeats.',
      is_read: false,
      created_at: iso(now - 4 * HOUR),
      _demo: true,
    },
    {
      id: 'demo-self-symptoms',
      template_id: 'self_daily_symptoms',
      template_title: 'Daily Symptom Tracker',
      status: 'completed',
      completed_at: iso(now - 2 * ONE_DAY),
      administered_at: iso(now - 2 * ONE_DAY),
      score: '78',
      score_numeric: 78,
      source: 'patient_self_report',
      created_at: iso(now - 2 * ONE_DAY),
      _demo: true,
    },
  ];
}

// -- Self-Assessment Survey Definitions -------------------------------------

export const SELF_ASSESSMENT_SURVEYS = Object.freeze({
  daily_mood: {
    key: 'daily_mood',
    title: 'Daily Mood Check-in',
    shortTitle: 'Mood',
    frequency: 'daily',
    timeLabel: '30s',
    emoji: 'Mood',
    tone: 'teal',
    questions: [
      { key: 'mood', label: 'How is your mood right now?', type: 'emoji_scale', min: 1, max: 5, labels: ['Very low', 'Low', 'OK', 'Good', 'Great'] },
      { key: 'energy', label: 'Energy level', type: 'slider', min: 1, max: 10, labels: ['Exhausted', 'Energized'] },
      { key: 'note', label: 'Anything on your mind? (optional)', type: 'text', maxLength: 200, optional: true },
    ],
    computeScore(responses) {
      const mood = Number(responses.mood) || 3;
      const energy = Number(responses.energy) || 5;
      return Math.round(((mood - 1) / 4) * 50 + ((energy - 1) / 9) * 50);
    },
  },
  weekly_wellness: {
    key: 'weekly_wellness',
    title: 'Weekly Wellness Check-in',
    shortTitle: 'Wellness',
    frequency: 'weekly',
    timeLabel: '2m',
    emoji: 'Wellness',
    tone: 'blue',
    questions: [
      { key: 'sleep', label: 'Sleep quality this week', type: 'slider', min: 1, max: 5, labels: ['Very poor', 'Excellent'] },
      { key: 'anxiety', label: 'Anxiety level this week', type: 'slider', min: 1, max: 5, labels: ['None', 'Severe'] },
      { key: 'social', label: 'Social connection', type: 'slider', min: 1, max: 5, labels: ['Very isolated', 'Very connected'] },
      { key: 'focus', label: 'Focus / attention', type: 'slider', min: 1, max: 5, labels: ['Very poor', 'Excellent'] },
      { key: 'side_effects', label: 'Any side effects since last session?', type: 'checkboxes', options: ['Headache', 'Nausea', 'Dizziness', 'Mood swing', 'Sleep change', 'None'], optional: true },
    ],
    computeScore(responses) {
      const sleep = Number(responses.sleep) || 3;
      const anxiety = Number(responses.anxiety) || 3;
      const social = Number(responses.social) || 3;
      const focus = Number(responses.focus) || 3;
      const avg = (sleep + (6 - anxiety) + social + focus) / 4;
      return Math.round(((avg - 1) / 4) * 100);
    },
  },
  monthly_reflection: {
    key: 'monthly_reflection',
    title: 'Monthly Reflection',
    shortTitle: 'Reflection',
    frequency: 'monthly',
    timeLabel: '3m',
    emoji: 'Reflection',
    tone: 'violet',
    questions: [
      { key: 'progress', label: 'Treatment progress this month', type: 'slider', min: 1, max: 5, labels: ['Much worse', 'Much better'] },
      { key: 'alignment', label: 'Goal alignment', type: 'slider', min: 1, max: 5, labels: ['Not aligned', 'Fully aligned'] },
      { key: 'helped', label: 'What helped most this month? (optional)', type: 'text', maxLength: 500, optional: true },
      { key: 'concerns', label: 'Concerns for your care team (optional)', type: 'text', maxLength: 500, optional: true },
    ],
    computeScore(responses) {
      const progress = Number(responses.progress) || 3;
      const alignment = Number(responses.alignment) || 3;
      return Math.round(((progress + alignment - 2) / 8) * 100);
    },
  },
  daily_symptoms: {
    key: 'daily_symptoms',
    title: 'Daily Symptom Tracker',
    shortTitle: 'Symptoms',
    frequency: 'daily',
    timeLabel: '1m',
    emoji: 'Symptoms',
    tone: 'amber',
    questions: [
      { key: 'headache', label: 'Headache', type: 'slider', min: 0, max: 10, labels: ['None', 'Severe'] },
      { key: 'nausea', label: 'Nausea', type: 'slider', min: 0, max: 10, labels: ['None', 'Severe'] },
      { key: 'dizziness', label: 'Dizziness', type: 'slider', min: 0, max: 10, labels: ['None', 'Severe'] },
      { key: 'mood_swings', label: 'Mood swings', type: 'slider', min: 0, max: 10, labels: ['None', 'Severe'] },
      { key: 'cognitive_fog', label: 'Cognitive fog / confusion', type: 'slider', min: 0, max: 10, labels: ['None', 'Severe'] },
      { key: 'sleep_disturbance', label: 'Sleep disturbance', type: 'slider', min: 0, max: 10, labels: ['None', 'Severe'] },
      { key: 'anxiety', label: 'Anxiety', type: 'slider', min: 0, max: 10, labels: ['None', 'Severe'] },
      { key: 'fatigue', label: 'Fatigue / low energy', type: 'slider', min: 0, max: 10, labels: ['None', 'Severe'] },
      { key: 'pain', label: 'General pain', type: 'slider', min: 0, max: 10, labels: ['None', 'Severe'] },
      { key: 'note', label: 'Anything else your care team should know? (optional)', type: 'text', maxLength: 300, optional: true },
    ],
    computeScore(responses) {
      const keys = ['headache','nausea','dizziness','mood_swings','cognitive_fog','sleep_disturbance','anxiety','fatigue','pain'];
      const sum = keys.reduce((acc, k) => acc + (Number(responses[k]) || 0), 0);
      const max = keys.length * 10;
      return Math.max(0, Math.round(100 - (sum / max) * 100));
    },
  },
  post_session: {
    key: 'post_session',
    title: 'Post-Session Experience',
    shortTitle: 'Session',
    frequency: 'as-needed',
    timeLabel: '1m',
    emoji: 'Session',
    tone: 'rose',
    questions: [
      { key: 'comfort', label: 'How comfortable was the session?', type: 'slider', min: 1, max: 5, labels: ['Very uncomfortable', 'Very comfortable'] },
      { key: 'sensations', label: 'What sensations did you feel?', type: 'checkboxes', options: ['Tingling', 'Warmth', 'Pressure', 'Pulsing', 'Mild discomfort', 'None'], optional: true },
      { key: 'mood_change', label: 'Immediate mood change after session', type: 'slider', min: 1, max: 5, labels: ['Much worse', 'Much better'] },
      { key: 'energy', label: 'Energy level after session', type: 'slider', min: 1, max: 5, labels: ['Very drained', 'Very energized'] },
      { key: 'note', label: 'Notes for your clinician (optional)', type: 'text', maxLength: 300, optional: true },
    ],
    computeScore(responses) {
      const comfort = Number(responses.comfort) || 3;
      const mood = Number(responses.mood_change) || 3;
      const energy = Number(responses.energy) || 3;
      return Math.round(((comfort + mood + energy - 3) / 12) * 100);
    },
  },
  adherence: {
    key: 'adherence',
    title: 'Protocol Adherence',
    shortTitle: 'Adherence',
    frequency: 'daily',
    timeLabel: '30s',
    emoji: 'Adherence',
    tone: 'green',
    questions: [
      { key: 'medications', label: 'Took prescribed medications / supplements today?', type: 'emoji_scale', min: 1, max: 2, labels: ['No', 'Yes'] },
      { key: 'exercises', label: 'Completed home program exercises?', type: 'emoji_scale', min: 1, max: 2, labels: ['No', 'Yes'] },
      { key: 'device', label: 'Used / wore prescribed device today?', type: 'emoji_scale', min: 1, max: 2, labels: ['No', 'Yes'] },
      { key: 'sleep_hygiene', label: 'Followed sleep hygiene protocol?', type: 'emoji_scale', min: 1, max: 2, labels: ['No', 'Yes'] },
      { key: 'missed', label: 'Missed anything? (optional)', type: 'text', maxLength: 200, optional: true },
    ],
    computeScore(responses) {
      const keys = ['medications', 'exercises', 'device', 'sleep_hygiene'];
      const yesCount = keys.reduce((acc, k) => acc + ((Number(responses[k]) || 0) >= 2 ? 1 : 0), 0);
      return Math.round((yesCount / keys.length) * 100);
    },
  },
  sleep_diary: {
    key: 'sleep_diary',
    title: 'Sleep Diary',
    shortTitle: 'Sleep',
    frequency: 'daily',
    timeLabel: '1m',
    emoji: 'Sleep',
    tone: 'indigo',
    questions: [
      { key: 'bedtime', label: 'What time did you go to bed?', type: 'text', maxLength: 20, optional: false },
      { key: 'wake_time', label: 'What time did you wake up?', type: 'text', maxLength: 20, optional: false },
      { key: 'fall_asleep_min', label: 'Minutes to fall asleep', type: 'slider', min: 0, max: 60, labels: ['Instant', '60+ min'] },
      { key: 'awakenings', label: 'Nighttime awakenings', type: 'slider', min: 0, max: 5, labels: ['None', '5+ times'] },
      { key: 'quality', label: 'Overall sleep quality', type: 'slider', min: 1, max: 5, labels: ['Very poor', 'Excellent'] },
      { key: 'rested', label: 'Did you feel rested this morning?', type: 'emoji_scale', min: 1, max: 3, labels: ['No', 'Somewhat', 'Yes'] },
      { key: 'dreams', label: 'Notable dreams or nightmares? (optional)', type: 'text', maxLength: 300, optional: true },
    ],
    computeScore(responses) {
      const quality = Number(responses.quality) || 3;
      const rested = Number(responses.rested) || 2;
      const awakenings = Number(responses.awakenings) || 0;
      const fallAsleep = Number(responses.fall_asleep_min) || 15;
      let score = ((quality + rested) / 8) * 100;
      score -= awakenings * 8;
      score -= Math.min(fallAsleep, 60) * 0.5;
      return Math.max(0, Math.round(score));
    },
  },
});

export const SELF_ASSESSMENT_KEYS = Object.freeze(Object.keys(SELF_ASSESSMENT_SURVEYS));

export function getSelfAssessmentLastFiled(key, storage) {
  const s = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!s) return null;
  try {
    const raw = s.getItem('ds_selfassess_last_' + key);
    if (!raw) return null;
    const d = new Date(raw);
    return Number.isFinite(d.getTime()) ? raw : null;
  } catch (_e) { return null; }
}

export function setSelfAssessmentLastFiled(key, iso, storage) {
  const s = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!s) return false;
  try { s.setItem('ds_selfassess_last_' + key, iso); return true; } catch (_e) { return false; }
}

export function getSelfAssessmentDraft(key, storage) {
  const s = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!s) return null;
  try {
    const raw = s.getItem('ds_selfassess_draft_' + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_e) { return null; }
}

export function setSelfAssessmentDraft(key, data, storage) {
  const s = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!s) return false;
  try { s.setItem('ds_selfassess_draft_' + key, JSON.stringify(data)); return true; } catch (_e) { return false; }
}

export function clearSelfAssessmentDraft(key, storage) {
  const s = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!s) return false;
  try { s.removeItem('ds_selfassess_draft_' + key); return true; } catch (_e) { return false; }
}

export function demoSelfAssessmentSeed(now = Date.now()) {
  const ONE_DAY = 86400000;
  const iso = (ms) => new Date(ms).toISOString();
  return [
    {
      id: 'demo-self-mood',
      template_id: 'self_daily_mood',
      template_title: 'Daily Mood Check-in',
      status: 'completed',
      completed_at: iso(now - 1 * ONE_DAY),
      administered_at: iso(now - 1 * ONE_DAY),
      score: '72',
      score_numeric: 72,
      source: 'patient_self_report',
      created_at: iso(now - 1 * ONE_DAY),
      _demo: true,
    },
    {
      id: 'demo-self-wellness',
      template_id: 'self_weekly_wellness',
      template_title: 'Weekly Wellness Check-in',
      status: 'completed',
      completed_at: iso(now - 3 * ONE_DAY),
      administered_at: iso(now - 3 * ONE_DAY),
      score: '65',
      score_numeric: 65,
      source: 'patient_self_report',
      created_at: iso(now - 3 * ONE_DAY),
      _demo: true,
    },
    {
      id: 'demo-self-reflection',
      template_id: 'self_monthly_reflection',
      template_title: 'Monthly Reflection',
      status: 'completed',
      completed_at: iso(now - 14 * ONE_DAY),
      administered_at: iso(now - 14 * ONE_DAY),
      score: '80',
      score_numeric: 80,
      source: 'patient_self_report',
      created_at: iso(now - 14 * ONE_DAY),
      _demo: true,
    },
    {
      id: 'demo-self-session',
      template_id: 'self_post_session',
      template_title: 'Post-Session Experience',
      status: 'completed',
      completed_at: iso(now - 1 * ONE_DAY),
      administered_at: iso(now - 1 * ONE_DAY),
      score: '85',
      score_numeric: 85,
      source: 'patient_self_report',
      created_at: iso(now - 1 * ONE_DAY),
      _demo: true,
    },
    {
      id: 'demo-self-adherence',
      template_id: 'self_adherence',
      template_title: 'Protocol Adherence',
      status: 'completed',
      completed_at: iso(now - 1 * ONE_DAY),
      administered_at: iso(now - 1 * ONE_DAY),
      score: '75',
      score_numeric: 75,
      source: 'patient_self_report',
      created_at: iso(now - 1 * ONE_DAY),
      _demo: true,
    },
    {
      id: 'demo-self-sleep',
      template_id: 'self_sleep_diary',
      template_title: 'Sleep Diary',
      status: 'completed',
      completed_at: iso(now - 1 * ONE_DAY),
      administered_at: iso(now - 1 * ONE_DAY),
      score: '62',
      score_numeric: 62,
      source: 'patient_self_report',
      created_at: iso(now - 1 * ONE_DAY),
      _demo: true,
    },
  ];
}

// ── Clinician-Side Patient Dashboard Helpers ─────────────────────────────────

/**
 * Inline SVG sparkline from an array of numbers.
 * Returns an `<svg>` string that can be embedded directly in template literals.
 * @param {number[]} values
 * @param {string} [color='var(--teal)']
 * @param {number} [width=80]
 * @param {number} [height=24]
 */
export function sparklineSVG(values, color = 'var(--teal)', width = 80, height = 24) {
  if (!Array.isArray(values) || values.length < 2) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pad = 2;
  const points = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (width - pad * 2);
    const y = pad + (1 - (v - min) / range) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="display:inline-block;vertical-align:middle"><polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

/**
 * Clinician-facing demo dashboard data for demo patients.
 * Used when isDemoPatient is true and API returns empty arrays.
 * Dates are computed relative to now so the demo is always fresh.
 */
function _clinicianDemoDates() {
  const ONE_DAY = 86400000;
  const now = Date.now();
  const daysAgo = n => new Date(now - n * ONE_DAY).toISOString().split('T')[0];
  const isoAgo = n => new Date(now - n * ONE_DAY).toISOString();
  const isoAhead = n => new Date(now + n * ONE_DAY).toISOString();
  return { daysAgo, isoAgo, isoAhead, now };
}

const _CD = _clinicianDemoDates();

export const DEMO_CLINICIAN_DASHBOARD = Object.freeze({
  sessions: Object.freeze([
    { id: 'demo-s-1',  session_number: 1,  scheduled_at: _CD.isoAgo(42), status: 'completed', modality: 'tDCS', duration_minutes: 30, comfort_score: 7, impedance_kohms: 5.2 },
    { id: 'demo-s-2',  session_number: 2,  scheduled_at: _CD.isoAgo(39), status: 'completed', modality: 'tDCS', duration_minutes: 30, comfort_score: 7, impedance_kohms: 5.0 },
    { id: 'demo-s-3',  session_number: 3,  scheduled_at: _CD.isoAgo(35), status: 'completed', modality: 'tDCS', duration_minutes: 30, comfort_score: 8, impedance_kohms: 4.8 },
    { id: 'demo-s-4',  session_number: 4,  scheduled_at: _CD.isoAgo(32), status: 'completed', modality: 'tDCS', duration_minutes: 30, comfort_score: 8, impedance_kohms: 4.9 },
    { id: 'demo-s-5',  session_number: 5,  scheduled_at: _CD.isoAgo(28), status: 'completed', modality: 'tDCS', duration_minutes: 30, comfort_score: 8, impedance_kohms: 4.7 },
    { id: 'demo-s-6',  session_number: 6,  scheduled_at: _CD.isoAgo(25), status: 'completed', modality: 'tDCS', duration_minutes: 30, comfort_score: 9, impedance_kohms: 4.6 },
    { id: 'demo-s-7',  session_number: 7,  scheduled_at: _CD.isoAgo(21), status: 'completed', modality: 'tDCS', duration_minutes: 30, comfort_score: 8, impedance_kohms: 4.8 },
    { id: 'demo-s-8',  session_number: 8,  scheduled_at: _CD.isoAgo(18), status: 'completed', modality: 'tDCS', duration_minutes: 30, comfort_score: 7, impedance_kohms: 5.1 },
    { id: 'demo-s-9',  session_number: 9,  scheduled_at: _CD.isoAgo(14), status: 'completed', modality: 'tDCS', duration_minutes: 30, comfort_score: 8, impedance_kohms: 4.5 },
    { id: 'demo-s-10', session_number: 10, scheduled_at: _CD.isoAgo(11), status: 'completed', modality: 'tDCS', duration_minutes: 30, comfort_score: 9, impedance_kohms: 4.4 },
    { id: 'demo-s-11', session_number: 11, scheduled_at: _CD.isoAgo(7),  status: 'completed', modality: 'tDCS', duration_minutes: 30, comfort_score: 7, impedance_kohms: 4.6 },
    { id: 'demo-s-12', session_number: 12, scheduled_at: _CD.isoAgo(4),  status: 'completed', modality: 'tDCS', duration_minutes: 30, comfort_score: 8, impedance_kohms: 4.3 },
  ]),
  assessments: Object.freeze([
    { template_name: 'PHQ-9', score: 14, severity: 'Moderate',           color: 'var(--amber)', date: _CD.daysAgo(2) },
    { template_name: 'GAD-7', score: 10, severity: 'Moderate',           color: 'var(--amber)', date: _CD.daysAgo(3) },
    { template_name: 'ISI',   score: 12, severity: 'Clinical Insomnia',  color: 'var(--amber)', date: _CD.daysAgo(7) },
    { template_name: 'PSQI',  score: 8,  severity: 'Poor Sleep Quality', color: 'var(--amber)', date: _CD.daysAgo(7) },
  ]),
  clinicalNotes: Object.freeze([
    { type: 'session_note',    date: _CD.daysAgo(4),  text: 'Patient tolerated session 12 well. No adverse effects reported. Electrode placement Left DLPFC, 2mA for 30 min. Impedance stable at 4.3 kohm.', clinician: 'Dr. Amelia Kolmar' },
    { type: 'progress_note',   date: _CD.daysAgo(7),  text: 'PHQ-9 dropped from 17 to 15 since last review. Patient reports improved morning motivation and reduced anhedonia. Sleep quality still variable.', clinician: 'Dr. Amelia Kolmar' },
    { type: 'clinical_update', date: _CD.daysAgo(14), text: 'Discussed sleep hygiene strategies. Wearable data shows HRV trending upward. Recommend continuing current tDCS protocol with reassessment at session 15.', clinician: 'Raquel Ortiz, NP' },
  ]),
  wearable7d: Object.freeze([
    { date: _CD.daysAgo(6), sleep_h: 6.2, hrv_ms: 42, rhr_bpm: 66, steps: 6500 },
    { date: _CD.daysAgo(5), sleep_h: 7.0, hrv_ms: 44, rhr_bpm: 64, steps: 7200 },
    { date: _CD.daysAgo(4), sleep_h: 6.8, hrv_ms: 45, rhr_bpm: 63, steps: 8100 },
    { date: _CD.daysAgo(3), sleep_h: 7.5, hrv_ms: 47, rhr_bpm: 62, steps: 7800 },
    { date: _CD.daysAgo(2), sleep_h: 7.1, hrv_ms: 46, rhr_bpm: 63, steps: 7400 },
    { date: _CD.daysAgo(1), sleep_h: 7.4, hrv_ms: 48, rhr_bpm: 62, steps: 7800 },
    { date: _CD.daysAgo(0), sleep_h: 7.2, hrv_ms: 49, rhr_bpm: 61, steps: 5200 },
  ]),
  aiAnalysis: Object.freeze({
    summary: 'Multi-modal analysis indicates positive treatment response. PHQ-9 shows 36% reduction over 6 weeks (22 to 14). HRV trending upward, suggesting autonomic regulation improvement. Current tDCS protocol aligned with evidence-based parameters.',
    confidence: 0.82,
    key_findings: [
      'Consistent PHQ-9 improvement: 22 -> 14 (36% reduction)',
      'HRV trending upward: +16% over 4 weeks (42 -> 49 ms)',
      'Sleep duration stable at 7.0h average (within normal range)',
      'Session comfort ratings consistently high (mean 7.9/10)',
    ],
    recommendations: [
      'Continue current tDCS protocol (Left DLPFC, 2mA, 30 min)',
      'Consider adding CBT homework module for residual symptoms',
      'Schedule comprehensive 4-week outcome review at session 16',
      'Monitor sleep variability - consider sleep hygiene intervention',
    ],
    generated_at: _CD.isoAgo(1),
  }),
});

// ── Offline Demo Patient Roster ─────────────────────────────────────────────
// Used by pgPatients when the API is unreachable and VITE_ENABLE_DEMO=1.
const _now = Date.now();
const _isoDay = (daysAgo) => new Date(_now - daysAgo * 86400000).toISOString().slice(0, 10);

export const DEMO_PATIENT_ROSTER = Object.freeze([
  Object.freeze({
    id: 'demo-pt-samantha-li',
    first_name: 'Samantha', last_name: 'Li',
    dob: '1992-03-14', gender: 'Female',
    primary_condition: 'Major Depressive Disorder',
    primary_modality: 'tDCS',
    status: 'active',
    consent_signed: true,
    demo_seed: true,
    notes: '[DEMO] Sample patient — Depression / tDCS',
    next_session: _isoDay(-2),
    created_at: _isoDay(90),
  }),
  Object.freeze({
    id: 'demo-pt-marcus-chen',
    first_name: 'Marcus', last_name: 'Chen',
    dob: '1985-07-22', gender: 'Male',
    primary_condition: 'Generalized Anxiety Disorder',
    primary_modality: 'rTMS',
    status: 'active',
    consent_signed: true,
    demo_seed: true,
    notes: '[DEMO] Sample patient — Anxiety / rTMS',
    next_session: _isoDay(-1),
    created_at: _isoDay(60),
  }),
  Object.freeze({
    id: 'demo-pt-elena-vasquez',
    first_name: 'Elena', last_name: 'Vasquez',
    dob: '1978-11-05', gender: 'Female',
    primary_condition: 'Chronic Pain (Fibromyalgia)',
    primary_modality: 'tFUS',
    status: 'active',
    consent_signed: true,
    demo_seed: true,
    notes: '[DEMO] Sample patient — Chronic Pain / tFUS',
    next_session: _isoDay(-3),
    created_at: _isoDay(45),
  }),
  Object.freeze({
    id: 'demo-pt-james-okonkwo',
    first_name: 'James', last_name: 'Okonkwo',
    dob: '1999-01-30', gender: 'Male',
    primary_condition: 'ADHD',
    primary_modality: 'Neurofeedback',
    status: 'pending',
    consent_signed: false,
    demo_seed: true,
    notes: '[DEMO] Sample patient — ADHD / Neurofeedback',
    created_at: _isoDay(10),
  }),
  Object.freeze({
    id: 'demo-pt-aisha-rahman',
    first_name: 'Aisha', last_name: 'Rahman',
    dob: '1988-09-18', gender: 'Female',
    primary_condition: 'PTSD',
    primary_modality: 'TPS',
    status: 'active',
    consent_signed: true,
    demo_seed: true,
    notes: '[DEMO] Sample patient — PTSD / TPS',
    next_session: _isoDay(0),
    created_at: _isoDay(75),
  }),
]);

// Lookup for dashboard's P-DEMO-* IDs (from pgDash demo fallback)
const _DASH_DEMO_MAP = {
  'P-DEMO-1': { first_name: 'Samantha', last_name: 'Li',       dob: '1985-03-12', primary_condition: 'Major Depressive Disorder', primary_modality: 'tDCS' },
  'P-DEMO-2': { first_name: 'Marcus',   last_name: 'Reilly',   dob: '1978-07-22', primary_condition: 'Anxious Depression', primary_modality: 'rTMS-iTBS' },
  'P-DEMO-3': { first_name: 'Priya',    last_name: 'Nambiar',  dob: '1990-11-04', primary_condition: 'Generalized Anxiety', primary_modality: 'tACS' },
  'P-DEMO-4': { first_name: 'Jamal',    last_name: 'Thompson', dob: '2011-05-30', primary_condition: 'ADHD (Pediatric)', primary_modality: 'Neurofeedback' },
  'P-DEMO-5': { first_name: 'Elena',    last_name: 'Okafor',   dob: '1992-08-19', primary_condition: 'ADHD (Adult)', primary_modality: 'Intake' },
  'P-DEMO-6': { first_name: 'Terence',  last_name: 'Wu',       dob: '1980-02-14', primary_condition: 'PTSD', primary_modality: 'tDCS' },
};

/**
 * Build a full patient object for pgProfile from a roster entry.
 * Fills in any fields the profile renderer expects.
 */
export function demoPtFromRoster(id) {
  const entry = DEMO_PATIENT_ROSTER.find(p => p.id === id);
  if (entry) return { ...entry };

  // Handle dashboard's P-DEMO-* IDs
  const dashEntry = _DASH_DEMO_MAP[id];
  if (dashEntry) {
    return {
      id, ...dashEntry, gender: 'Unknown', status: 'active',
      consent_signed: true, demo_seed: true, notes: '[DEMO] Sample patient',
    };
  }

  // Final fallback — canonical DEMO_PATIENT shape
  return {
    id: id || 'demo-pt-samantha-li',
    first_name: DEMO_PATIENT.profile.first_name,
    last_name: DEMO_PATIENT.profile.last_name,
    dob: '1992-03-14',
    gender: 'Female',
    primary_condition: DEMO_PATIENT.profile.condition,
    primary_modality: DEMO_PATIENT.profile.modality,
    status: 'active',
    consent_signed: true,
    demo_seed: true,
    notes: '[DEMO] Sample patient',
  };
}

// ── Bloomberg Terminal Demo Data ────────────────────────────────────────────
function _bloombergDates() {
  const ONE_DAY = 86400000;
  const now = Date.now();
  const weekly = n => new Date(now - n * 7 * ONE_DAY).toISOString().split('T')[0];
  const daily = n => new Date(now - n * ONE_DAY).toISOString().split('T')[0];
  return { weekly, daily };
}
const _BD = _bloombergDates();

export const DEMO_PATIENT_DASH = Object.freeze({
  outcomes: Object.freeze({
    phq9:  [22,21,20,19,18,17,16,15,15,14,14,13],
    gad7:  [15,14,14,13,13,12,11,11,10,10,10,9],
    isi:   [18,17,16,15,14,14,13,13,12,12,12,11],
    psqi:  [12,11,11,10,10,10,9,9,8,8,8,8],
    dates: Array.from({length:12},(_,i)=>_BD.weekly(11-i)),
  }),
  biometrics: Object.freeze({
    hrv:   [38,40,39,42,41,43,42,44,43,45,44,46,45,47,46,48,47,48,46,49,48,50,49,51,50,48,49,51,50,52],
    rhr:   [72,71,72,70,71,69,70,68,69,67,68,66,67,65,66,64,65,64,66,63,64,62,63,62,63,64,63,62,61,60],
    sleep: [5.8,6.2,6.0,6.5,6.3,6.8,6.5,7.0,6.8,7.2,7.0,7.1,6.9,7.3,7.0,7.4,7.1,7.2,6.8,7.5,7.2,7.4,7.3,7.5,7.1,7.0,7.2,7.4,7.3,7.2],
    steps: [4200,5100,4800,5500,6200,5800,6500,7000,6800,7200,7500,7100,6900,7800,7200,7600,7400,7100,6800,8000,7800,7500,7200,8200,7900,7600,7800,8100,7900,7800],
    cortisol:[22,21,22,20,21,19,20,18,19,17,18,17,16,16,17,15,16,15,14,15,14,13,14,13,12,13,13,12,12,11],
    dates: Array.from({length:30},(_,i)=>_BD.daily(29-i)),
  }),
  eeg: Object.freeze({
    alpha_power:     [8.2,7.8,9.1,8.5,10.2,9.8,10.5,11.0,10.8,11.3,11.5,12.0],
    beta_power:      [15.3,14.8,15.0,14.5,13.8,13.2,12.8,12.5,12.8,12.2,12.0,11.5],
    theta_power:     [5.2,5.5,5.0,4.8,4.5,4.3,4.2,4.0,4.1,3.9,3.8,3.6],
    alpha_asymmetry: [-0.15,-0.12,-0.10,-0.08,-0.05,-0.03,-0.01,0.02,0.01,0.04,0.05,0.07],
    coherence:       [0.42,0.45,0.48,0.50,0.52,0.55,0.57,0.60,0.58,0.62,0.63,0.65],
    labels: ['S1','S2','S3','S4','S5','S6','S7','S8','S9','S10','S11','S12'],
  }),
  mri: Object.freeze({
    last_scan: _BD.daily(14),
    hippo_l: 3.42, hippo_r: 3.51, hippo_change: 2.1,
    dlpfc: 2.8, acc: 3.1, cortical_change: 0.5,
    wm_fa: 0.48, wm_change: 1.2,
    findings: ['Normal hippocampal volumes bilaterally','DLPFC cortical thickness within range','No structural abnormalities','White matter integrity stable (FA 0.48)'],
  }),
  correlations: Object.freeze([
    {a:'PHQ-9',b:'HRV',r:-0.72},{a:'PHQ-9',b:'Sleep',r:-0.65},{a:'PHQ-9',b:'Steps',r:-0.48},
    {a:'GAD-7',b:'HRV',r:-0.58},{a:'GAD-7',b:'RHR',r:0.62},{a:'Sleep',b:'HRV',r:0.71},
    {a:'Steps',b:'Sleep',r:0.45},{a:'Alpha',b:'PHQ-9',r:-0.68},{a:'Alpha Asym',b:'Mood',r:0.74},
    {a:'Cortisol',b:'PHQ-9',r:0.66},{a:'Theta',b:'Focus',r:-0.55},{a:'Coherence',b:'GAD-7',r:-0.61},
  ]),
  predictions: Object.freeze([
    {metric:'PHQ-9 (4-week)',predicted:11,ci_low:9,ci_high:13,confidence:0.78,color:'var(--green)'},
    {metric:'Treatment Response',label:'Responder',probability:0.82,confidence:0.75,color:'var(--teal)'},
    {metric:'Remission by Wk 16',probability:0.64,confidence:0.68,color:'var(--blue)'},
    {metric:'Relapse Risk (6mo)',probability:0.22,risk:'Low',confidence:0.71,color:'var(--green)'},
    {metric:'Optimal Dose',label:'2.0 mA',confidence:0.80,color:'var(--violet)'},
  ]),
  sessionMetrics: Object.freeze({
    comfort:   [7,7,8,8,8,9,8,7,8,9,7,8],
    impedance: [5.2,5.0,4.8,4.9,4.7,4.6,4.8,5.1,4.5,4.4,4.6,4.3],
    labels:    ['S1','S2','S3','S4','S5','S6','S7','S8','S9','S10','S11','S12'],
  }),
  deepTwin: Object.freeze({
    id:'DT-SAM-LI-0042', updated:_BD.daily(1), version:'2.4.1',
    sources:['EEG (12 sessions)','Wearable (30d)','Self-report (12wk)','MRI (1 scan)','Session logs (12)'],
    trajectory:'Improving', trajectory_conf:0.84, risk:0.18, engagement:0.87, efficacy:0.76,
    bio_summary:'HRV improving (+37%), cortisol normalising, alpha asymmetry shifting positive',
  }),
});

/** Multi-series line chart SVG */
export function multiLineChartSVG(seriesArr, labels, colors, names, opts = {}) {
  const w = opts.w || 420, h = opts.h || 160;
  const pad = {top:20,right:16,bottom:28,left:38};
  const cw = w-pad.left-pad.right, ch = h-pad.top-pad.bottom;
  let allV = seriesArr.flat().filter(v => Number.isFinite(v));
  if (!allV.length) allV = [0,1];
  const yMin = opts.yMin != null ? opts.yMin : Math.min(...allV);
  const yMax = opts.yMax != null ? opts.yMax : Math.max(...allV);
  const yr = yMax-yMin||1;
  const maxLen = Math.max(...seriesArr.map(s=>s.length),1);
  const x = i => pad.left+(i/Math.max(maxLen-1,1))*cw;
  const y = v => pad.top+(1-(v-yMin)/yr)*ch;
  let g='';
  for(let i=0;i<=4;i++){const gy=pad.top+(i/4)*ch;const val=yMax-(i/4)*yr;g+='<line x1="'+pad.left+'" y1="'+gy.toFixed(1)+'" x2="'+(w-pad.right)+'" y2="'+gy.toFixed(1)+'" stroke="rgba(255,255,255,0.06)" stroke-width="1"/><text x="'+(pad.left-4)+'" y="'+(gy+3).toFixed(1)+'" fill="rgba(255,255,255,0.3)" font-size="9" text-anchor="end" font-family="var(--font-mono)">'+Math.round(val)+'</text>';}
  const st=Math.max(1,Math.floor(labels.length/6));let xl='';
  for(let i=0;i<labels.length;i+=st){xl+='<text x="'+x(i).toFixed(1)+'" y="'+(h-4)+'" fill="rgba(255,255,255,0.3)" font-size="8" text-anchor="middle" font-family="var(--font-mono)">'+(labels[i]||'')+'</text>';}
  let ln='';
  for(let si=0;si<seriesArr.length;si++){const pts=seriesArr[si].map((v,i)=>x(i).toFixed(1)+','+y(v).toFixed(1)).join(' ');const c=colors[si]||'var(--teal)';const fX=x(0).toFixed(1),lX=x(seriesArr[si].length-1).toFixed(1),bY=(pad.top+ch).toFixed(1);ln+='<polygon points="'+fX+','+bY+' '+pts+' '+lX+','+bY+'" fill="'+c+'" opacity="0.06"/><polyline points="'+pts+'" fill="none" stroke="'+c+'" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>';}
  let leg='';for(let si=0;si<names.length;si++){const lx=pad.left+si*80;leg+='<circle cx="'+(lx+5)+'" cy="8" r="3" fill="'+(colors[si]||'var(--teal)')+'"/><text x="'+(lx+12)+'" y="11" fill="rgba(255,255,255,0.5)" font-size="9" font-family="var(--font-mono)">'+names[si]+'</text>';}
  return '<svg width="100%" viewBox="0 0 '+w+' '+h+'" style="display:block">'+g+xl+ln+leg+'</svg>';
}

/** Bar chart SVG */
export function barChartSVG(values, labels, color='var(--teal)', opts={}) {
  const w=opts.w||420,h=opts.h||120;
  const pad={top:12,right:12,bottom:24,left:36};
  const cw=w-pad.left-pad.right,ch=h-pad.top-pad.bottom;
  const n=values.length; if(!n) return '';
  const maxV=Math.max(...values,1),minV=0,range=maxV-minV||1;
  const barW=Math.max(4,(cw/n)*0.65),gap=(cw-barW*n)/(n+1);
  let bars='';
  for(let i=0;i<n;i++){const bx=pad.left+gap+i*(barW+gap);const bh=((values[i]-minV)/range)*ch;const by=pad.top+ch-bh;bars+='<rect x="'+bx.toFixed(1)+'" y="'+by.toFixed(1)+'" width="'+barW.toFixed(1)+'" height="'+bh.toFixed(1)+'" rx="2" fill="'+color+'" opacity="0.8"/>';if(labels[i])bars+='<text x="'+(bx+barW/2).toFixed(1)+'" y="'+(h-6)+'" fill="rgba(255,255,255,0.3)" font-size="7" text-anchor="middle" font-family="var(--font-mono)">'+labels[i]+'</text>';}
  let ya='';for(let i=0;i<=3;i++){const gy=pad.top+(i/3)*ch;const val=maxV-(i/3)*range;ya+='<text x="'+(pad.left-4)+'" y="'+(gy+3).toFixed(1)+'" fill="rgba(255,255,255,0.3)" font-size="8" text-anchor="end" font-family="var(--font-mono)">'+(Number.isInteger(val)?val:val.toFixed(1))+'</text><line x1="'+pad.left+'" y1="'+gy.toFixed(1)+'" x2="'+(w-pad.right)+'" y2="'+gy.toFixed(1)+'" stroke="rgba(255,255,255,0.04)" stroke-width="1"/>';}
  return '<svg width="100%" viewBox="0 0 '+w+' '+h+'" style="display:block">'+ya+bars+'</svg>';
}

/** EEG waveform SVG */
export function eegWaveformSVG(eeg) {
  const w=420,h=150;
  const channels=[{name:'Alpha',data:eeg.alpha_power,color:'var(--teal)'},{name:'Beta',data:eeg.beta_power,color:'var(--blue)'},{name:'Theta',data:eeg.theta_power,color:'var(--violet)'}];
  const chH=h/channels.length;let svg='';
  for(let ci=0;ci<channels.length;ci++){const c=channels[ci];const baseY=ci*chH+chH/2;const vals=c.data;const maxA=Math.max(...vals.map(Math.abs),1);let pts='';const n=vals.length;const segW=(w-60)/Math.max(n-1,1);
  for(let i=0;i<n;i++){const px=50+i*segW;const amp=(vals[i]/maxA)*(chH*0.35);const py=baseY-amp;pts+=(i===0?'':' ')+px.toFixed(1)+','+py.toFixed(1);}
  svg+='<text x="4" y="'+(baseY+3)+'" fill="'+c.color+'" font-size="9" font-weight="600" font-family="var(--font-mono)">'+c.name+'</text><line x1="50" y1="'+baseY.toFixed(1)+'" x2="'+(w-10)+'" y2="'+baseY.toFixed(1)+'" stroke="rgba(255,255,255,0.06)" stroke-width="1"/><polyline points="'+pts+'" fill="none" stroke="'+c.color+'" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>';}
  return '<svg width="100%" viewBox="0 0 '+w+' '+h+'" style="display:block">'+svg+'</svg>';
}

/** Correlation row HTML */
export function correlationHTML(correlations) {
  if(!correlations||!correlations.length) return '';
  return correlations.map(c=>{const abs=Math.abs(c.r);const hue=c.r>0?'160':'0';const bg='hsla('+hue+','+Math.round(abs*100)+'%,50%,'+(abs*0.25).toFixed(2)+')';const border='hsla('+hue+','+Math.round(abs*100)+'%,50%,'+(abs*0.4).toFixed(2)+')';const tc=c.r>0?'var(--green)':'var(--red,#f43f5e)';
  return '<div style="display:flex;align-items:center;gap:8px;padding:5px 10px;border-radius:6px;background:'+bg+';border:1px solid '+border+';margin-bottom:3px"><span style="font-size:10px;color:var(--text-secondary);flex:1;font-family:var(--font-mono)">'+c.a+' ~ '+c.b+'</span><span style="font-size:12px;font-weight:700;color:'+tc+';font-family:var(--font-display)">'+(c.r>0?'+':'')+c.r.toFixed(2)+'</span><div style="width:40px;height:5px;border-radius:3px;background:rgba(255,255,255,0.06)"><div style="width:'+Math.round(abs*100)+'%;height:5px;border-radius:3px;background:'+tc+'"></div></div></div>';}).join('');
}

// ═══════════════════════════════════════════════════════════════════════════════
// Patient Analytics Dashboard — Demo Data + Chart Helpers
// ═══════════════════════════════════════════════════════════════════════════════

function _analyticsDates() {
  const D = 86400000, now = Date.now();
  const d = n => new Date(now - n * D).toISOString().split('T')[0];
  const w = n => new Date(now - n * 7 * D).toISOString().split('T')[0];
  return { d, w, now };
}
const _AD = _analyticsDates();

export const ANALYTICS_DEMO = Object.freeze({
  // ── Summary ──
  summary: Object.freeze({
    data_completeness: 84,
    risk_flag: 'Low',
    improvement_score: 72,
    last_visit: _AD.d(3),
    clinician: 'Dr. Amelia Kolmar',
    protocol: 'tDCS — Left DLPFC 2mA',
  }),
  // ── KPIs ──
  kpis: Object.freeze({
    adherence: 87, symptom_improvement: 36, sessions_completed: 12,
    missed_sessions: 2, sleep_avg: 7.1, hrv_avg: 48,
    stress_avg: 32, assessment_change: -6.2, task_completion: 78,
    safety_alerts: 1,
  }),
  // ── Symptoms (12 weeks) ──
  symptoms: Object.freeze({
    weeks: Array.from({length:12},(_,i)=>_AD.w(11-i)),
    phq9:   [22,21,20,19,18,17,16,15,15,14,14,13],
    gad7:   [15,14,14,13,13,12,11,11,10,10,10,9],
    isi:    [18,17,16,15,14,14,13,13,12,12,12,11],
    psqi:   [12,11,11,10,10,10,9,9,8,8,8,8],
    stress: [68,65,62,58,55,52,48,45,42,40,38,35],
  }),
  // ── Assessments ──
  assessments: Object.freeze([
    {name:'PHQ-9',baseline:22,latest:13,scores:[22,21,20,19,18,17,16,15,15,14,14,13],dates:Array.from({length:12},(_,i)=>_AD.w(11-i)),band:'Moderate',bandColor:'var(--amber)'},
    {name:'GAD-7',baseline:15,latest:9,scores:[15,14,14,13,13,12,11,11,10,10,10,9],dates:Array.from({length:12},(_,i)=>_AD.w(11-i)),band:'Mild',bandColor:'var(--green)'},
    {name:'ISI',baseline:18,latest:11,scores:[18,17,16,15,14,14,13,13,12,12,12,11],dates:Array.from({length:12},(_,i)=>_AD.w(11-i)),band:'Subthreshold',bandColor:'var(--teal)'},
    {name:'PSQI',baseline:12,latest:8,scores:[12,11,11,10,10,10,9,9,8,8,8,8],dates:Array.from({length:12},(_,i)=>_AD.w(11-i)),band:'Poor',bandColor:'var(--amber)'},
  ]),
  // ── Treatment sessions ──
  treatment: Object.freeze({
    weekLabels: Array.from({length:8},(_,i)=>'Wk '+(i+1)),
    completed:  [2,2,2,2,1,2,1,2],
    missed:     [0,0,0,1,0,0,1,0],
    cancelled:  [0,0,1,0,0,0,0,0],
    modalities: [{name:'tDCS',pct:85,color:'var(--teal)'},{name:'CBT',pct:10,color:'var(--blue)'},{name:'Mindfulness',pct:5,color:'var(--violet)'}],
    responseAfterSession: [0,-1,-2,-2,-3,-3,-4,-4,-5,-5,-6,-6],
    protocolChanges: [{week:4,note:'Increased to 2mA'},{week:8,note:'Added CBT homework'}],
  }),
  // ── Biometrics (30 days) ──
  biometrics: Object.freeze({
    dates: Array.from({length:30},(_,i)=>_AD.d(29-i)),
    sleep_duration: [5.8,6.2,6.0,6.5,6.3,6.8,6.5,7.0,6.8,7.2,7.0,7.1,6.9,7.3,7.0,7.4,7.1,7.2,6.8,7.5,7.2,7.4,7.3,7.5,7.1,7.0,7.2,7.4,7.3,7.2],
    sleep_quality:  [45,48,46,52,50,55,52,58,55,60,58,59,56,62,58,64,60,61,57,65,62,64,63,65,61,60,62,64,63,63],
    hrv: [38,40,39,42,41,43,42,44,43,45,44,46,45,47,46,48,47,48,46,49,48,50,49,51,50,48,49,51,50,52],
    rhr: [72,71,72,70,71,69,70,68,69,67,68,66,67,65,66,64,65,64,66,63,64,62,63,62,63,64,63,62,61,60],
    stress: [68,65,63,60,58,55,53,50,48,46,44,42,40,38,36,35,34,33,32,31,30,29,28,28,27,27,26,26,25,25],
    steps: [4200,5100,4800,5500,6200,5800,6500,7000,6800,7200,7500,7100,6900,7800,7200,7600,7400,7100,6800,8000,7800,7500,7200,8200,7900,7600,7800,8100,7900,7800],
  }),
  // ── EEG (per session) ──
  eeg: Object.freeze({
    labels: ['S1','S2','S3','S4','S5','S6','S7','S8','S9','S10','S11','S12'],
    alpha: [8.2,7.8,9.1,8.5,10.2,9.8,10.5,11.0,10.8,11.3,11.5,12.0],
    beta:  [15.3,14.8,15.0,14.5,13.8,13.2,12.8,12.5,12.8,12.2,12.0,11.5],
    theta: [5.2,5.5,5.0,4.8,4.5,4.3,4.2,4.0,4.1,3.9,3.8,3.6],
    alpha_beta_ratio: [0.54,0.53,0.61,0.59,0.74,0.74,0.82,0.88,0.84,0.93,0.96,1.04],
    asymmetry: [-0.15,-0.12,-0.10,-0.08,-0.05,-0.03,-0.01,0.02,0.01,0.04,0.05,0.07],
    coherence: [0.42,0.45,0.48,0.50,0.52,0.55,0.57,0.60,0.58,0.62,0.63,0.65],
    regions: [{name:'Left DLPFC',alpha:12.0,beta:11.5,theta:3.6,status:'improved'},{name:'Right DLPFC',alpha:10.8,beta:12.2,theta:4.1,status:'stable'},{name:'Frontal',alpha:11.2,beta:11.8,theta:3.8,status:'improved'},{name:'Parietal',alpha:9.5,beta:13.0,theta:4.5,status:'stable'}],
  }),
  // ── Tasks & Engagement ──
  tasks: Object.freeze({
    weekLabels: Array.from({length:8},(_,i)=>'Wk '+(i+1)),
    completed: [5,6,5,7,6,8,7,8],
    assigned:  [7,7,7,8,8,8,8,9],
    categories: [{name:'Breathwork',done:18,total:22},{name:'Mood Logs',done:24,total:28},{name:'Reading',done:8,total:16},{name:'Check-ins',done:20,total:24},{name:'Exercise',done:12,total:20}],
    streak_current: 6,
    streak_best: 11,
    engagement_7d: [true,true,false,true,true,true,true],
    missed_rate_pct: 22,
  }),
  // ── Safety ──
  safety: Object.freeze({
    adverse_events: [{date:_AD.d(18),type:'Skin irritation',severity:'mild',resolved:true},{date:_AD.d(5),type:'Headache post-session',severity:'mild',resolved:true}],
    missed_appointments: 2,
    worsening_alerts: [{date:_AD.d(12),metric:'ISI',note:'Score increased by 2 points'},{date:_AD.d(25),metric:'Sleep',note:'3 consecutive nights < 6h'}],
    tolerance: [{metric:'Comfort Score',avg:8.1,status:'good'},{metric:'Impedance',avg:4.6,status:'good'},{metric:'Side Effects',count:2,status:'monitor'}],
    deterioration: [],
  }),
  // ── Correlations ──
  correlations: Object.freeze([
    {a:'Sleep Duration',b:'PHQ-9',r:-0.68,insight:'Better sleep associated with lower depression scores'},
    {a:'HRV',b:'GAD-7',r:-0.62,insight:'Higher HRV associated with lower anxiety'},
    {a:'Adherence',b:'PHQ-9 Change',r:-0.71,insight:'Higher adherence associated with greater symptom reduction'},
    {a:'Sessions',b:'PHQ-9 Improvement',r:0.65,insight:'More sessions associated with greater improvement'},
    {a:'Stress',b:'Sleep Quality',r:-0.58,insight:'Higher stress associated with poorer sleep quality'},
    {a:'Steps',b:'Mood',r:0.45,insight:'More physical activity associated with better mood'},
    {a:'Alpha Power',b:'PHQ-9',r:-0.64,insight:'Increased alpha power associated with lower depression'},
    {a:'Task Completion',b:'Engagement',r:0.72,insight:'Higher task completion associated with better engagement'},
  ]),
  // ── AI Insights ──
  aiInsights: Object.freeze({
    generated_at: _AD.d(0),
    confidence: 0.81,
    improvements: [
      'PHQ-9 score appears to show a consistent downward trend (22 to 13, ~41% reduction), suggesting positive treatment response.',
      'HRV has shown an upward trend over 30 days (38 to 52 ms), which is associated with improved autonomic regulation.',
      'Sleep duration has stabilised around 7.1-7.4 hours, which appears to be within a healthy range.',
    ],
    worsening: [
      'ISI score showed a temporary increase around week 6, which may warrant monitoring of sleep-specific interventions.',
    ],
    adherence_notes: [
      '2 missed sessions in 14 planned (87% adherence). Missed sessions appear concentrated in weeks 5 and 7.',
      'Home task completion is at 78%, with reading assignments showing the lowest completion rate (50%).',
    ],
    anomalies: [
      'A possible sleep quality dip was observed around day 19-21, coinciding with a reported headache post-session.',
    ],
    review_areas: [
      'Reading task adherence requires clinician review — consider simplifying materials or adjusting task load.',
      'The ISI score plateau suggests possible benefit from a targeted sleep intervention.',
      'Consider scheduling a comprehensive assessment review at session 15.',
    ],
  }),
});

// ── Additional Chart Helpers for Analytics Dashboard ──────────────────────────

/** Stacked bar chart SVG */
export function stackedBarSVG(series, labels, colors, names, opts = {}) {
  const w = opts.w || 420, h = opts.h || 140;
  const pad = {top:20,right:12,bottom:28,left:36};
  const cw = w-pad.left-pad.right, ch = h-pad.top-pad.bottom;
  const n = labels.length; if (!n) return '';
  const totals = labels.map((_, i) => series.reduce((s, sr) => s + (sr[i] || 0), 0));
  const maxV = Math.max(...totals, 1);
  const barW = Math.max(8, (cw / n) * 0.6);
  const gap = (cw - barW * n) / (n + 1);
  let bars = '';
  for (let i = 0; i < n; i++) {
    let cumH = 0;
    const bx = pad.left + gap + i * (barW + gap);
    for (let si = series.length - 1; si >= 0; si--) {
      const v = series[si][i] || 0;
      const bh = (v / maxV) * ch;
      const by = pad.top + ch - cumH - bh;
      bars += '<rect x="' + bx.toFixed(1) + '" y="' + by.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + Math.max(0, bh).toFixed(1) + '" rx="2" fill="' + (colors[si] || 'var(--teal)') + '" opacity="0.85"/>';
      cumH += bh;
    }
    if (labels[i]) bars += '<text x="' + (bx + barW / 2).toFixed(1) + '" y="' + (h - 6) + '" fill="rgba(255,255,255,0.3)" font-size="8" text-anchor="middle" font-family="var(--font-mono)">' + labels[i] + '</text>';
  }
  // Y axis
  let ya = '';
  for (let i = 0; i <= 3; i++) {
    const gy = pad.top + (i / 3) * ch;
    const val = maxV - (i / 3) * maxV;
    ya += '<text x="' + (pad.left - 4) + '" y="' + (gy + 3).toFixed(1) + '" fill="rgba(255,255,255,0.3)" font-size="8" text-anchor="end" font-family="var(--font-mono)">' + Math.round(val) + '</text>';
    ya += '<line x1="' + pad.left + '" y1="' + gy.toFixed(1) + '" x2="' + (w - pad.right) + '" y2="' + gy.toFixed(1) + '" stroke="rgba(255,255,255,0.04)" stroke-width="1"/>';
  }
  // Legend
  let leg = '';
  for (let si = 0; si < names.length; si++) {
    const lx = pad.left + si * 90;
    leg += '<rect x="' + lx + '" y="3" width="8" height="8" rx="2" fill="' + (colors[si] || 'var(--teal)') + '"/>';
    leg += '<text x="' + (lx + 12) + '" y="10" fill="rgba(255,255,255,0.5)" font-size="9" font-family="var(--font-mono)">' + names[si] + '</text>';
  }
  return '<svg width="100%" viewBox="0 0 ' + w + ' ' + h + '" style="display:block">' + ya + bars + leg + '</svg>';
}

/** Area chart SVG (filled line chart) */
export function areaChartSVG(values, labels, color = 'var(--teal)', opts = {}) {
  const w = opts.w || 420, h = opts.h || 120;
  const pad = {top:12,right:12,bottom:24,left:36};
  const cw = w-pad.left-pad.right, ch = h-pad.top-pad.bottom;
  const n = values.length; if (n < 2) return '';
  const minV = opts.yMin != null ? opts.yMin : Math.min(...values);
  const maxV = opts.yMax != null ? opts.yMax : Math.max(...values);
  const yr = maxV - minV || 1;
  const x = i => pad.left + (i / (n - 1)) * cw;
  const y = v => pad.top + (1 - (v - minV) / yr) * ch;
  const pts = values.map((v, i) => x(i).toFixed(1) + ',' + y(v).toFixed(1)).join(' ');
  const baseY = (pad.top + ch).toFixed(1);
  const firstX = x(0).toFixed(1), lastX = x(n - 1).toFixed(1);
  // Grid
  let g = '';
  for (let i = 0; i <= 3; i++) {
    const gy = pad.top + (i / 3) * ch;
    const val = maxV - (i / 3) * yr;
    g += '<line x1="' + pad.left + '" y1="' + gy.toFixed(1) + '" x2="' + (w - pad.right) + '" y2="' + gy.toFixed(1) + '" stroke="rgba(255,255,255,0.04)" stroke-width="1"/>';
    g += '<text x="' + (pad.left - 4) + '" y="' + (gy + 3).toFixed(1) + '" fill="rgba(255,255,255,0.3)" font-size="8" text-anchor="end" font-family="var(--font-mono)">' + (Number.isInteger(val) ? val : val.toFixed(1)) + '</text>';
  }
  const st = Math.max(1, Math.floor(n / 6));
  let xl = '';
  for (let i = 0; i < n; i += st) {
    xl += '<text x="' + x(i).toFixed(1) + '" y="' + (h - 5) + '" fill="rgba(255,255,255,0.25)" font-size="7" text-anchor="middle" font-family="var(--font-mono)">' + (labels[i] || '') + '</text>';
  }
  return '<svg width="100%" viewBox="0 0 ' + w + ' ' + h + '" style="display:block">' + g + xl +
    '<polygon points="' + firstX + ',' + baseY + ' ' + pts + ' ' + lastX + ',' + baseY + '" fill="' + color + '" opacity="0.12"/>' +
    '<polyline points="' + pts + '" fill="none" stroke="' + color + '" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
    '</svg>';
}

/** Donut / ring gauge SVG */
export function donutSVG(pct, color = 'var(--teal)', opts = {}) {
  const sz = opts.size || 64;
  const r = (sz - 8) / 2, cx = sz / 2, cy = sz / 2;
  const circ = 2 * Math.PI * r;
  const dash = (Math.min(100, Math.max(0, pct)) / 100) * circ;
  const label = opts.label || (Math.round(pct) + '%');
  return '<svg width="' + sz + '" height="' + sz + '" viewBox="0 0 ' + sz + ' ' + sz + '" style="display:block">' +
    '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="5"/>' +
    '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="5" stroke-dasharray="' + dash.toFixed(1) + ' ' + circ.toFixed(1) + '" stroke-linecap="round" transform="rotate(-90 ' + cx + ' ' + cy + ')"/>' +
    '<text x="' + cx + '" y="' + (cy + 4) + '" fill="' + color + '" font-size="' + (sz > 50 ? 14 : 11) + '" font-weight="700" text-anchor="middle" font-family="var(--font-display)">' + label + '</text></svg>';
}

/** Horizontal bar chart (for categories) */
export function hBarChartHTML(items, opts = {}) {
  const maxVal = Math.max(...items.map(i => i.value || i.total || 1), 1);
  return items.map(it => {
    const pct = Math.round(((it.done != null ? it.done : it.value) / (it.total || maxVal)) * 100);
    const color = it.color || 'var(--teal)';
    return '<div style="margin-bottom:6px"><div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:2px"><span style="color:var(--text-secondary)">' + (it.name || it.label) + '</span><span style="color:var(--text-tertiary)">' + (it.done != null ? it.done + '/' + it.total : it.value) + ' (' + pct + '%)</span></div><div style="height:6px;border-radius:3px;background:rgba(255,255,255,0.06)"><div style="height:6px;border-radius:3px;background:' + color + ';width:' + pct + '%;transition:width .3s"></div></div></div>';
  }).join('');
}

/** Severity band indicator strip */
export function severityBandSVG(score, maxScore, bands, opts = {}) {
  const w = opts.w || 200, h = 20;
  const pad = 2;
  const bw = w - pad * 2;
  let rects = '';
  let cumPct = 0;
  for (const b of bands) {
    const segW = (b.range / maxScore) * bw;
    rects += '<rect x="' + (pad + cumPct).toFixed(1) + '" y="4" width="' + segW.toFixed(1) + '" height="12" rx="2" fill="' + b.color + '" opacity="0.25"/>';
    cumPct += segW;
  }
  const markerX = pad + (Math.min(score, maxScore) / maxScore) * bw;
  rects += '<line x1="' + markerX.toFixed(1) + '" y1="2" x2="' + markerX.toFixed(1) + '" y2="18" stroke="var(--text-primary)" stroke-width="2" stroke-linecap="round"/>';
  return '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" style="display:inline-block;vertical-align:middle">' + rects + '</svg>';
}
