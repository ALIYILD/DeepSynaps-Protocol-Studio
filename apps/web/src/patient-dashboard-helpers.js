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
