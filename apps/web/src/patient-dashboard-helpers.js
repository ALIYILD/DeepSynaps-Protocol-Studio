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
  function card(kind, headline, caption, primaryLabel, primaryTarget, { hide = false } = {}) {
    return {
      kind,
      eyebrow: EY,
      headline,
      caption,
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
    );
  }

  // 6. Fallback — hide when snoozed
  return card(
    'fallback',
    "You're on track today.",
    'Nothing is waiting on you. Small, consistent steps are what matter.',
    'See your progress',
    'pt-outcomes',
    { hide: !!state.snoozed },
  );
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
