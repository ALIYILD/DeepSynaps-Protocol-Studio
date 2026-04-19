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
 * @param {{template_name?:string, score_numeric?:number|null}} latest
 * @param {{template_name?:string, score_numeric?:number|null}|null} [baseline]
 */
export function outcomeGoalMarker(latest, baseline) {
  const name = String(latest?.template_name || '').toLowerCase();
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
    const k = String(o?.template_name || '').trim();
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
  ];
}
