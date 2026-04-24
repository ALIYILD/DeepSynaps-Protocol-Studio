/**
 * Therapy Adherence Dashboard — patient adherence tracking view
 * Wired into pages-home-therapy.js as a togglable sub-view alongside
 * the existing "Session Review" clinician panel.
 *
 * Exports:
 *   renderAdherenceDashboard(patientId, apiObj) -> Promise<string>
 *   bindAdherenceActions()
 */

// ── Design tokens (mirrors pages-brainmap.js T.* pattern) ─────────────────────
const T = {
  bg:       'var(--dv2-bg-base, var(--bg-base, #04121c))',
  panel:    'var(--dv2-bg-panel, var(--bg-panel, #0a1d29))',
  surface:  'var(--dv2-bg-surface, var(--bg-surface, rgba(255,255,255,0.04)))',
  surface2: 'var(--dv2-bg-surface-2, rgba(255,255,255,0.07))',
  card:     'var(--dv2-bg-card, rgba(14,22,40,0.8))',
  border:   'var(--dv2-border, var(--border, rgba(255,255,255,0.08)))',
  t1:       'var(--dv2-text-primary, var(--text-primary, #e2e8f0))',
  t2:       'var(--dv2-text-secondary, var(--text-secondary, #94a3b8))',
  t3:       'var(--dv2-text-tertiary, var(--text-tertiary, #64748b))',
  teal:     'var(--dv2-teal, var(--teal, #00d4bc))',
  green:    'var(--green, #4ade80)',
  blue:     'var(--dv2-blue, var(--blue, #4a9eff))',
  amber:    'var(--dv2-amber, var(--amber, #ffb547))',
  red:      'var(--red, #ff6b6b)',
  rose:     'var(--dv2-rose, var(--rose, #ff6b9d))',
  violet:   'var(--dv2-violet, var(--violet, #9b7fff))',
  fdisp:    'var(--dv2-font-display, var(--font-display, "Outfit", system-ui, sans-serif))',
  fbody:    'var(--dv2-font-body, var(--font-body, "DM Sans", system-ui, sans-serif))',
  fmono:    'var(--dv2-font-mono, "JetBrains Mono", ui-monospace, monospace)',
};

// ── Helpers ────────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function safeArr(v) { return Array.isArray(v) ? v : []; }

/** Parse ISO date string to Date, null-safe */
function parseDate(d) {
  if (!d) return null;
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? null : dt;
}

/** Format date as YYYY-MM-DD */
function fmtDate(d) {
  if (!d) return '';
  const dt = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(dt.getTime())) return '';
  return dt.toISOString().split('T')[0];
}

/** Short weekday label */
function dayLabel(d) {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
}

/** Get Monday-based start of week for a given date */
function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Generate array of dates for the current and surrounding weeks */
function getWeekDates(centerDate, weeksBack = 3, weeksForward = 1) {
  const start = startOfWeek(centerDate);
  start.setDate(start.getDate() - weeksBack * 7);
  const days = [];
  const total = (weeksBack + weeksForward + 1) * 7;
  for (let i = 0; i < total; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  return days;
}

// ── Data processing helpers ────────────────────────────────────────────────────

/**
 * Build a date->status map from session logs and assignments.
 * Status: 'completed' | 'partial' | 'missed' | 'not_scheduled'
 */
function buildCalendarMap(logs, assignments) {
  const map = new Map();

  // Determine scheduled days from assignments
  const scheduledDays = new Set();
  for (const a of assignments) {
    if (a.status !== 'active' && a.status !== 'completed') continue;
    const freq = a.session_frequency_per_week || 0;
    if (freq <= 0) continue;
    // If assignment has start/end dates, fill in scheduled days
    const start = parseDate(a.start_date || a.assigned_date || a.created_at);
    const end = parseDate(a.end_date) || new Date();
    if (!start) continue;
    const cur = new Date(start);
    cur.setHours(0, 0, 0, 0);
    const endD = new Date(end);
    endD.setHours(23, 59, 59, 999);
    // Distribute sessions across the week (Mon-Sun based on frequency)
    const sessionDays = [];
    if (freq >= 7) sessionDays.push(0, 1, 2, 3, 4, 5, 6);
    else if (freq >= 5) sessionDays.push(1, 2, 3, 4, 5);
    else if (freq >= 3) sessionDays.push(1, 3, 5);
    else if (freq >= 2) sessionDays.push(1, 4);
    else sessionDays.push(1);

    while (cur <= endD) {
      const dayOfWeek = cur.getDay();
      if (sessionDays.includes(dayOfWeek)) {
        scheduledDays.add(fmtDate(cur));
      }
      cur.setDate(cur.getDate() + 1);
    }
  }

  // Mark scheduled days
  for (const dateStr of scheduledDays) {
    map.set(dateStr, 'missed'); // default: missed unless proven otherwise
  }

  // Overlay actual session logs
  for (const log of logs) {
    const dateStr = fmtDate(log.session_date || log.created_at);
    if (!dateStr) continue;
    if (log.completed) {
      map.set(dateStr, 'completed');
    } else if (map.get(dateStr) !== 'completed') {
      map.set(dateStr, 'partial');
    }
  }

  return map;
}

/** Compute adherence statistics */
function computeAdherenceStats(logs, assignments) {
  const allLogs = safeArr(logs);
  const completedCount = allLogs.filter(l => l.completed).length;
  const partialCount = allLogs.filter(l => !l.completed).length;

  // Total planned from assignments
  let totalPlanned = 0;
  for (const a of safeArr(assignments)) {
    totalPlanned += (a.planned_total_sessions || 0);
  }
  // If no planned total, estimate from frequency
  if (totalPlanned === 0) {
    for (const a of safeArr(assignments)) {
      const freq = a.session_frequency_per_week || 0;
      const start = parseDate(a.start_date || a.assigned_date || a.created_at);
      if (start && freq > 0) {
        const weeks = Math.max(1, Math.ceil((Date.now() - start.getTime()) / (7 * 86400000)));
        totalPlanned += weeks * freq;
      }
    }
  }
  if (totalPlanned === 0) totalPlanned = Math.max(completedCount + partialCount, 1);

  const pct = Math.min(100, Math.round((completedCount / totalPlanned) * 100));
  return { completedCount, partialCount, totalPlanned, pct };
}

/** Compute streak data from logs sorted by date */
function computeStreaks(logs, calendarMap) {
  if (!logs.length && calendarMap.size === 0) {
    return { current: 0, best: 0, lastSessionDate: null };
  }

  // Build sorted list of scheduled dates with their status
  const dates = Array.from(calendarMap.entries())
    .sort(([a], [b]) => a.localeCompare(b));

  let current = 0;
  let best = 0;
  let streak = 0;
  let lastSessionDate = null;

  for (const [dateStr, status] of dates) {
    if (status === 'completed') {
      streak++;
      best = Math.max(best, streak);
      lastSessionDate = dateStr;
    } else {
      streak = 0;
    }
  }
  current = streak; // trailing streak is current

  // If we have logs but no calendar map entries, count consecutive completed logs
  if (dates.length === 0 && logs.length > 0) {
    const sorted = [...logs]
      .filter(l => l.session_date || l.created_at)
      .sort((a, b) => (b.session_date || b.created_at || '').localeCompare(a.session_date || a.created_at || ''));
    for (const l of sorted) {
      if (l.completed) { current++; best = Math.max(best, current); }
      else break;
    }
    lastSessionDate = sorted[0]?.session_date || sorted[0]?.created_at || null;
  }

  return { current, best, lastSessionDate };
}

/** Compute per-device usage statistics */
function computeDeviceUsage(logs, assignments) {
  const deviceMap = new Map();
  for (const a of safeArr(assignments)) {
    const key = a.device_name || a.device_category || 'Unknown Device';
    if (!deviceMap.has(key)) {
      deviceMap.set(key, {
        name: a.device_name || 'Unknown',
        category: a.device_category || 'other',
        totalSessions: 0,
        totalMinutes: 0,
      });
    }
  }
  for (const log of safeArr(logs)) {
    // Try to find the matching device
    const key = log.device_name || log.device_category ||
      (safeArr(assignments).find(a => a.id === log.assignment_id)?.device_name) || 'Unknown Device';
    if (!deviceMap.has(key)) {
      deviceMap.set(key, {
        name: key,
        category: log.device_category || 'other',
        totalSessions: 0,
        totalMinutes: 0,
      });
    }
    const entry = deviceMap.get(key);
    entry.totalSessions++;
    entry.totalMinutes += (log.duration_minutes || 0);
  }
  return Array.from(deviceMap.values());
}

/** Detect alert conditions from adherence events and trends */
function buildAlerts(events, logs, calendarMap) {
  const alerts = [];

  // Open adherence events become alerts
  for (const e of safeArr(events)) {
    alerts.push({
      type: (e.event_type || 'adherence_alert').replace(/_/g, ' '),
      severity: e.severity || 'warning',
      message: e.body || e.detail || 'Adherence event requires attention.',
      date: e.report_date || e.created_at || '',
    });
  }

  // Detect recent missed sessions (last 7 days)
  const now = new Date();
  let recentMissed = 0;
  for (const [dateStr, status] of calendarMap.entries()) {
    const d = parseDate(dateStr);
    if (!d) continue;
    const daysAgo = (now - d) / 86400000;
    if (daysAgo >= 0 && daysAgo <= 7 && status === 'missed') {
      recentMissed++;
    }
  }
  if (recentMissed >= 2) {
    alerts.push({
      type: 'missed sessions',
      severity: 'warning',
      message: `${recentMissed} missed session${recentMissed > 1 ? 's' : ''} in the past 7 days.`,
      date: fmtDate(now),
    });
  }
  if (recentMissed >= 4) {
    alerts.push({
      type: 'declining adherence',
      severity: 'urgent',
      message: 'Patient adherence has significantly declined. Consider follow-up.',
      date: fmtDate(now),
    });
  }

  // Detect declining trend (compare last 2 weeks)
  const twoWeeksAgo = new Date(now);
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
  const oneWeekAgo = new Date(now);
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  let week1Done = 0, week1Total = 0, week2Done = 0, week2Total = 0;
  for (const [dateStr, status] of calendarMap.entries()) {
    const d = parseDate(dateStr);
    if (!d) continue;
    if (d >= twoWeeksAgo && d < oneWeekAgo) {
      week1Total++;
      if (status === 'completed') week1Done++;
    } else if (d >= oneWeekAgo && d <= now) {
      week2Total++;
      if (status === 'completed') week2Done++;
    }
  }
  if (week1Total >= 2 && week2Total >= 2) {
    const rate1 = week1Done / week1Total;
    const rate2 = week2Done / week2Total;
    if (rate1 > 0 && rate2 < rate1 * 0.6) {
      alerts.push({
        type: 'declining trend',
        severity: 'warning',
        message: `Adherence dropped from ${Math.round(rate1 * 100)}% to ${Math.round(rate2 * 100)}% week-over-week.`,
        date: fmtDate(now),
      });
    }
  }

  return alerts;
}

// ── SVG donut ring chart ───────────────────────────────────────────────────────
function donutRing(pct, size = 140) {
  const r = (size - 16) / 2;
  const circ = 2 * Math.PI * r;
  const filled = (pct / 100) * circ;
  const color = pct >= 80 ? T.green : pct >= 50 ? T.amber : T.red;
  const cx = size / 2;
  const cy = size / 2;
  return `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" class="adh-donut-svg">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none"
              stroke="${T.border}" stroke-width="10" opacity="0.35"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none"
              stroke="${color}" stroke-width="10"
              stroke-dasharray="${filled} ${circ - filled}"
              stroke-dashoffset="${circ * 0.25}"
              stroke-linecap="round"
              style="transition:stroke-dasharray 0.6s ease"/>
      <text x="${cx}" y="${cy - 6}" text-anchor="middle"
            font-size="26" font-weight="800" fill="${color}"
            font-family="var(--font-display, Outfit, system-ui)">${pct}%</text>
      <text x="${cx}" y="${cy + 14}" text-anchor="middle"
            font-size="10" fill="${T.t3}" letter-spacing="0.05em"
            font-family="var(--font-body, DM Sans, system-ui)">ADHERENCE</text>
    </svg>`;
}

// ── Render: Weekly Calendar Heatmap ────────────────────────────────────────────
function renderCalendarHeatmap(calendarMap) {
  const today = new Date();
  const days = getWeekDates(today, 3, 0); // 4 weeks total (3 back + current)

  // Group by week
  const weeks = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  const statusColor = {
    completed:     'var(--green, #4ade80)',
    partial:       'var(--amber, #ffb547)',
    missed:        'var(--red, #ff6b6b)',
    not_scheduled: 'rgba(255,255,255,0.06)',
  };

  const statusLabel = {
    completed:     'Completed',
    partial:       'Partial',
    missed:        'Missed',
    not_scheduled: 'Not scheduled',
  };

  const dayHeaders = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return `
    <div class="adh-calendar">
      <div class="adh-calendar-header">
        ${dayHeaders.map(d => `<div class="adh-cal-dh">${d}</div>`).join('')}
      </div>
      ${weeks.map(week => {
        const weekLabel = fmtDate(week[0]);
        return `<div class="adh-cal-week">
          <div class="adh-cal-week-label">${weekLabel.slice(5)}</div>
          <div class="adh-cal-days">
            ${week.map(day => {
              const key = fmtDate(day);
              const status = calendarMap.get(key) || 'not_scheduled';
              const isToday = fmtDate(day) === fmtDate(today);
              const isFuture = day > today;
              return `<div class="adh-cal-cell ${isToday ? 'adh-cal-today' : ''} ${isFuture ? 'adh-cal-future' : ''}"
                           title="${key}: ${statusLabel[status] || 'Not scheduled'}"
                           style="--cell-color:${isFuture ? 'rgba(255,255,255,0.03)' : statusColor[status]}">
                <div class="adh-cal-dot"></div>
                <div class="adh-cal-date">${day.getDate()}</div>
              </div>`;
            }).join('')}
          </div>
        </div>`;
      }).join('')}
      <div class="adh-cal-legend">
        <span><i style="background:${statusColor.completed}"></i>Completed</span>
        <span><i style="background:${statusColor.partial}"></i>Partial</span>
        <span><i style="background:${statusColor.missed}"></i>Missed</span>
        <span><i style="background:${statusColor.not_scheduled}"></i>Not scheduled</span>
      </div>
    </div>`;
}

// ── Render: Streak tracker ─────────────────────────────────────────────────────
function renderStreakTracker(streaks) {
  const flameColor = streaks.current >= 7 ? T.green : streaks.current >= 3 ? T.amber : T.t3;
  return `
    <div class="adh-streak">
      <div class="adh-streak-current">
        <div class="adh-streak-flame" style="color:${flameColor}">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 23c-4.97 0-9-3.13-9-7.5 0-2.38 1.28-4.52 2.42-5.94C6.56 8.09 8 6.03 8 4c0-.28.1-.52.26-.7A.75.75 0 019 3c0 0 .5 1.5 2 3s3 2 3 2c1.5-1 2-3 2-3a.75.75 0 01.74-.3c.16.18.26.42.26.7 0 2.03 1.44 4.09 2.58 5.56C20.72 12.48 21 14.62 21 17c0 4.37-4.03 7.5-9 7.5z"/>
          </svg>
        </div>
        <div class="adh-streak-num" style="color:${flameColor}">${streaks.current}</div>
        <div class="adh-streak-label">Current streak</div>
      </div>
      <div class="adh-streak-divider"></div>
      <div class="adh-streak-best">
        <div class="adh-streak-best-num">${streaks.best}</div>
        <div class="adh-streak-label">Best streak</div>
      </div>
      ${streaks.lastSessionDate ? `
        <div class="adh-streak-divider"></div>
        <div class="adh-streak-last">
          <div class="adh-streak-last-date">${esc(streaks.lastSessionDate)}</div>
          <div class="adh-streak-label">Last session</div>
        </div>
      ` : ''}
    </div>`;
}

// ── Render: Session timeline ───────────────────────────────────────────────────
function renderSessionTimeline(logs) {
  if (!logs.length) {
    return `<div class="adh-timeline-empty">No session logs recorded yet.</div>`;
  }

  const sorted = [...logs].sort((a, b) =>
    (b.session_date || b.created_at || '').localeCompare(a.session_date || a.created_at || ''));

  return `
    <div class="adh-timeline">
      ${sorted.slice(0, 12).map((log, idx) => {
        const date = fmtDate(log.session_date || log.created_at);
        const completed = log.completed;
        const dotColor = completed ? 'var(--green)' : 'var(--amber)';
        const duration = log.duration_minutes ? `${log.duration_minutes} min` : null;
        const tolerance = log.tolerance_rating ? `${log.tolerance_rating}/5` : null;
        const painBefore = log.pain_score_before ?? log.pain_before ?? null;
        const painAfter = log.pain_score_after ?? log.pain_after ?? null;
        const moodBefore = log.mood_score_before ?? log.mood_before ?? null;
        const moodAfter = log.mood_score_after ?? log.mood_after ?? null;
        const sideEffects = log.side_effects_during || log.side_effects || null;
        const notes = log.patient_notes || log.notes || null;
        const isLast = idx === Math.min(sorted.length, 12) - 1;

        return `<div class="adh-tl-item ${isLast ? 'adh-tl-last' : ''}">
          <div class="adh-tl-line">
            <div class="adh-tl-dot" style="background:${dotColor}"></div>
            ${!isLast ? '<div class="adh-tl-connector"></div>' : ''}
          </div>
          <div class="adh-tl-content">
            <div class="adh-tl-header">
              <span class="adh-tl-date">${esc(date)}</span>
              <span class="adh-tl-status" style="color:${dotColor}">${completed ? 'Completed' : 'Partial'}</span>
              ${duration ? `<span class="adh-tl-dur">${esc(duration)}</span>` : ''}
              ${tolerance ? `<span class="adh-tl-tol">Tolerance: ${esc(tolerance)}</span>` : ''}
            </div>
            ${(painBefore !== null || moodBefore !== null) ? `
              <div class="adh-tl-scores">
                ${painBefore !== null ? `<span class="adh-tl-score">Pain: <b>${esc(String(painBefore))}</b>${painAfter !== null ? ` → <b>${esc(String(painAfter))}</b>` : ''}</span>` : ''}
                ${moodBefore !== null ? `<span class="adh-tl-score">Mood: <b>${esc(String(moodBefore))}</b>${moodAfter !== null ? ` → <b>${esc(String(moodAfter))}</b>` : ''}</span>` : ''}
              </div>` : ''}
            ${sideEffects ? `<div class="adh-tl-side">Side effects: ${esc(sideEffects)}</div>` : ''}
            ${notes ? `<div class="adh-tl-notes">${esc(notes)}</div>` : ''}
          </div>
        </div>`;
      }).join('')}
    </div>`;
}

// ── Render: Alert panel ────────────────────────────────────────────────────────
function renderAlertPanel(alerts) {
  if (!alerts.length) return '';

  const sevColor = {
    info:    'var(--blue)',
    warning: 'var(--amber)',
    urgent:  'var(--red)',
  };
  const sevBg = {
    info:    'rgba(74,158,255,0.08)',
    warning: 'rgba(255,181,71,0.08)',
    urgent:  'rgba(255,107,107,0.08)',
  };

  return `
    <div class="adh-alerts">
      <div class="adh-alerts-hd">
        <span class="adh-alerts-title">Alerts</span>
        <span class="adh-alerts-count">${alerts.length}</span>
      </div>
      <div class="adh-alerts-body">
        ${alerts.slice(0, 6).map(a => {
          const color = sevColor[a.severity] || sevColor.warning;
          const bg = sevBg[a.severity] || sevBg.warning;
          return `<div class="adh-alert-row" style="--alert-color:${color};--alert-bg:${bg}">
            <div class="adh-alert-indicator"></div>
            <div class="adh-alert-info">
              <div class="adh-alert-type">${esc(a.type)}</div>
              <div class="adh-alert-msg">${esc(a.message)}</div>
            </div>
            ${a.date ? `<div class="adh-alert-date">${esc(fmtDate(a.date))}</div>` : ''}
          </div>`;
        }).join('')}
      </div>
    </div>`;
}

// ── Render: Device usage summary ───────────────────────────────────────────────
function renderDeviceUsage(deviceStats) {
  if (!deviceStats.length) {
    return `<div class="adh-device-empty">No device usage data available.</div>`;
  }

  const maxSessions = Math.max(1, ...deviceStats.map(d => d.totalSessions));

  return `
    <div class="adh-device-usage">
      ${deviceStats.map(d => {
        const barPct = Math.round((d.totalSessions / maxSessions) * 100);
        const catColor = {
          tDCS: T.teal, tACS: T.blue, TMS: T.violet, CES: T.amber,
          tPBM: T.green, PEMF: T.rose,
        }[d.category] || T.teal;

        return `<div class="adh-dev-row">
          <div class="adh-dev-info">
            <div class="adh-dev-name">${esc(d.name)}</div>
            <div class="adh-dev-cat" style="color:${catColor}">${esc(d.category)}</div>
          </div>
          <div class="adh-dev-stats">
            <div class="adh-dev-bar-wrap">
              <div class="adh-dev-bar" style="width:${barPct}%;background:${catColor}"></div>
            </div>
            <div class="adh-dev-nums">
              <span>${d.totalSessions} session${d.totalSessions !== 1 ? 's' : ''}</span>
              ${d.totalMinutes > 0 ? `<span>${d.totalMinutes} min total</span>` : ''}
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>`;
}

// ── Style block ────────────────────────────────────────────────────────────────
function adherenceStyles() {
  return `<style id="adh-styles">
    /* ── Adherence Dashboard Layout ─────────────────────────────────────── */
    .adh-wrap { padding: 20px; display: flex; flex-direction: column; gap: 16px; color: ${T.t1}; font-family: ${T.fbody}; }

    /* Top row: donut + streak + KPIs */
    .adh-top-row {
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 16px;
      align-items: stretch;
    }
    @media (max-width: 900px) {
      .adh-top-row { grid-template-columns: 1fr; }
    }

    /* Donut card */
    .adh-donut-card {
      background: ${T.card};
      border: 1px solid ${T.border};
      border-radius: 12px;
      padding: 20px 24px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-width: 180px;
    }
    .adh-donut-svg { display: block; }
    .adh-donut-stats {
      display: flex;
      gap: 16px;
      margin-top: 12px;
      font-size: 11px;
      color: ${T.t3};
      font-family: ${T.fmono};
    }
    .adh-donut-stats b { color: ${T.t1}; font-weight: 700; }

    /* Streak card */
    .adh-streak-card {
      background: ${T.card};
      border: 1px solid ${T.border};
      border-radius: 12px;
      padding: 16px 20px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .adh-streak {
      display: flex;
      align-items: center;
      gap: 20px;
    }
    .adh-streak-current {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
    }
    .adh-streak-flame { line-height: 0; }
    .adh-streak-num {
      font-size: 32px;
      font-weight: 800;
      line-height: 1.1;
      font-family: ${T.fdisp};
    }
    .adh-streak-label {
      font-size: 10px;
      color: ${T.t3};
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    .adh-streak-divider {
      width: 1px;
      height: 48px;
      background: ${T.border};
    }
    .adh-streak-best {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
    }
    .adh-streak-best-num {
      font-size: 22px;
      font-weight: 700;
      color: ${T.t2};
      font-family: ${T.fdisp};
    }
    .adh-streak-last {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
    }
    .adh-streak-last-date {
      font-size: 12px;
      font-weight: 600;
      color: ${T.t2};
      font-family: ${T.fmono};
    }

    /* Alert card (top-right) */
    .adh-alerts {
      background: ${T.card};
      border: 1px solid ${T.border};
      border-radius: 12px;
      overflow: hidden;
      min-width: 260px;
      max-width: 340px;
    }
    .adh-alerts-hd {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      border-bottom: 1px solid ${T.border};
    }
    .adh-alerts-title {
      font-size: 12px;
      font-weight: 600;
      color: ${T.t1};
    }
    .adh-alerts-count {
      font-size: 10px;
      font-weight: 700;
      padding: 1px 8px;
      border-radius: 10px;
      background: rgba(255,107,107,0.12);
      color: var(--red);
    }
    .adh-alerts-body { max-height: 180px; overflow-y: auto; }
    .adh-alert-row {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 10px 16px;
      border-bottom: 1px solid ${T.border};
      background: var(--alert-bg);
    }
    .adh-alert-row:last-child { border-bottom: none; }
    .adh-alert-indicator {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      flex-shrink: 0;
      margin-top: 5px;
      background: var(--alert-color);
    }
    .adh-alert-info { flex: 1; min-width: 0; }
    .adh-alert-type {
      font-size: 11.5px;
      font-weight: 600;
      color: var(--alert-color);
      text-transform: capitalize;
    }
    .adh-alert-msg {
      font-size: 11px;
      color: ${T.t2};
      margin-top: 2px;
      line-height: 1.4;
    }
    .adh-alert-date {
      font-size: 10px;
      color: ${T.t3};
      font-family: ${T.fmono};
      flex-shrink: 0;
    }

    /* Calendar heatmap */
    .adh-cal-card {
      background: ${T.card};
      border: 1px solid ${T.border};
      border-radius: 12px;
      padding: 16px;
    }
    .adh-cal-card-hd {
      font-size: 13px;
      font-weight: 600;
      color: ${T.t1};
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .adh-cal-card-hd .adh-label-num {
      font-family: ${T.fmono};
      color: ${T.teal};
      background: rgba(0,212,188,0.14);
      padding: 1px 6px;
      border-radius: 4px;
      font-size: 9.5px;
      font-weight: 700;
    }
    .adh-calendar-header {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 4px;
      margin-left: 52px;
      margin-bottom: 6px;
    }
    .adh-cal-dh {
      text-align: center;
      font-size: 9.5px;
      font-weight: 600;
      color: ${T.t3};
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .adh-cal-week {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 4px;
    }
    .adh-cal-week-label {
      width: 44px;
      font-size: 10px;
      color: ${T.t3};
      font-family: ${T.fmono};
      text-align: right;
      flex-shrink: 0;
    }
    .adh-cal-days {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 4px;
      flex: 1;
    }
    .adh-cal-cell {
      aspect-ratio: 1;
      border-radius: 6px;
      background: var(--cell-color);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      cursor: default;
      position: relative;
      min-height: 32px;
      transition: transform 0.1s, box-shadow 0.1s;
    }
    .adh-cal-cell:hover:not(.adh-cal-future) {
      transform: scale(1.12);
      box-shadow: 0 0 8px var(--cell-color);
      z-index: 1;
    }
    .adh-cal-today {
      outline: 2px solid ${T.teal};
      outline-offset: -1px;
    }
    .adh-cal-future { opacity: 0.35; }
    .adh-cal-dot { display: none; }
    .adh-cal-date {
      font-size: 10px;
      font-weight: 600;
      color: ${T.t1};
      opacity: 0.85;
    }
    .adh-cal-legend {
      display: flex;
      gap: 14px;
      margin-top: 10px;
      margin-left: 52px;
      font-size: 10px;
      color: ${T.t3};
      font-family: ${T.fmono};
    }
    .adh-cal-legend i {
      width: 10px;
      height: 10px;
      border-radius: 3px;
      display: inline-block;
      margin-right: 4px;
      vertical-align: middle;
    }

    /* Bottom grid: timeline + device usage */
    .adh-bottom-grid {
      display: grid;
      grid-template-columns: 1fr 340px;
      gap: 16px;
    }
    @media (max-width: 900px) {
      .adh-bottom-grid { grid-template-columns: 1fr; }
      .adh-alerts { max-width: 100%; }
    }

    /* Section cards */
    .adh-section-card {
      background: ${T.card};
      border: 1px solid ${T.border};
      border-radius: 12px;
      overflow: hidden;
    }
    .adh-section-hd {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 16px;
      border-bottom: 1px solid ${T.border};
    }
    .adh-section-title {
      font-size: 13px;
      font-weight: 600;
      color: ${T.t1};
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .adh-section-title .adh-label-num {
      font-family: ${T.fmono};
      color: ${T.teal};
      background: rgba(0,212,188,0.14);
      padding: 1px 6px;
      border-radius: 4px;
      font-size: 9.5px;
      font-weight: 700;
    }

    /* Timeline */
    .adh-timeline { padding: 16px; }
    .adh-timeline-empty {
      text-align: center;
      padding: 28px 16px;
      color: ${T.t3};
      font-size: 12.5px;
    }
    .adh-tl-item {
      display: flex;
      gap: 14px;
      min-height: 56px;
    }
    .adh-tl-line {
      display: flex;
      flex-direction: column;
      align-items: center;
      width: 14px;
      flex-shrink: 0;
    }
    .adh-tl-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      flex-shrink: 0;
      margin-top: 4px;
    }
    .adh-tl-connector {
      flex: 1;
      width: 2px;
      background: ${T.border};
      margin: 4px 0;
    }
    .adh-tl-content {
      flex: 1;
      padding-bottom: 16px;
      min-width: 0;
    }
    .adh-tl-last .adh-tl-content { padding-bottom: 0; }
    .adh-tl-header {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .adh-tl-date {
      font-size: 12px;
      font-weight: 600;
      color: ${T.t1};
      font-family: ${T.fmono};
    }
    .adh-tl-status {
      font-size: 10.5px;
      font-weight: 600;
    }
    .adh-tl-dur {
      font-size: 10.5px;
      color: ${T.t3};
      font-family: ${T.fmono};
    }
    .adh-tl-tol {
      font-size: 10.5px;
      color: ${T.teal};
      font-family: ${T.fmono};
    }
    .adh-tl-scores {
      display: flex;
      gap: 14px;
      margin-top: 6px;
      font-size: 11px;
      color: ${T.t2};
    }
    .adh-tl-score b { color: ${T.t1}; font-weight: 700; }
    .adh-tl-side {
      font-size: 11px;
      color: ${T.amber};
      margin-top: 4px;
      line-height: 1.4;
    }
    .adh-tl-notes {
      font-size: 11.5px;
      color: ${T.t3};
      margin-top: 4px;
      line-height: 1.45;
      font-style: italic;
    }

    /* Device usage */
    .adh-device-usage { padding: 12px 16px; }
    .adh-device-empty {
      text-align: center;
      padding: 28px 16px;
      color: ${T.t3};
      font-size: 12.5px;
    }
    .adh-dev-row {
      padding: 10px 0;
      border-bottom: 1px solid ${T.border};
    }
    .adh-dev-row:last-child { border-bottom: none; }
    .adh-dev-info {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
    }
    .adh-dev-name {
      font-size: 12.5px;
      font-weight: 600;
      color: ${T.t1};
    }
    .adh-dev-cat {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .adh-dev-stats { display: flex; flex-direction: column; gap: 4px; }
    .adh-dev-bar-wrap {
      height: 6px;
      background: ${T.surface};
      border-radius: 3px;
      overflow: hidden;
    }
    .adh-dev-bar {
      height: 100%;
      border-radius: 3px;
      transition: width 0.4s ease;
    }
    .adh-dev-nums {
      display: flex;
      gap: 12px;
      font-size: 10.5px;
      color: ${T.t3};
      font-family: ${T.fmono};
    }

    /* No-alerts placeholder */
    .adh-no-alerts {
      background: ${T.card};
      border: 1px solid ${T.border};
      border-radius: 12px;
      padding: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 260px;
      max-width: 340px;
    }
    .adh-no-alerts-text {
      font-size: 12px;
      color: ${T.t3};
      text-align: center;
    }
    .adh-no-alerts-check {
      font-size: 18px;
      color: ${T.green};
      margin-right: 8px;
    }
  </style>`;
}

// ── Main render function ───────────────────────────────────────────────────────
export async function renderAdherenceDashboard(patientId, apiObj) {
  const a = apiObj;

  // Fetch data from API (gracefully handle missing endpoints or empty results)
  const [assignRes, logsRes, eventsRes] = await Promise.all([
    (typeof a.listHomeAssignments === 'function'
      ? a.listHomeAssignments({ patient_id: patientId }) : Promise.resolve([])
    ).catch(() => []),
    (typeof a.listHomeSessionLogs === 'function'
      ? a.listHomeSessionLogs({ patient_id: patientId }) : Promise.resolve([])
    ).catch(() => []),
    (typeof a.listHomeAdherenceEvents === 'function'
      ? a.listHomeAdherenceEvents({ patient_id: patientId, status: 'open' }) : Promise.resolve([])
    ).catch(() => []),
  ]);

  const assignments = safeArr(assignRes);
  const allLogs     = safeArr(logsRes);
  const openEvents  = safeArr(eventsRes);

  // Compute derived data
  const calendarMap   = buildCalendarMap(allLogs, assignments);
  const stats         = computeAdherenceStats(allLogs, assignments);
  const streaks       = computeStreaks(allLogs, calendarMap);
  const deviceStats   = computeDeviceUsage(allLogs, assignments);
  const alerts        = buildAlerts(openEvents, allLogs, calendarMap);

  // Build the adherence dashboard HTML
  const alertsHtml = alerts.length > 0
    ? renderAlertPanel(alerts)
    : `<div class="adh-no-alerts">
         <span class="adh-no-alerts-check">&#10003;</span>
         <span class="adh-no-alerts-text">No adherence alerts. Patient on track.</span>
       </div>`;

  return `
    ${adherenceStyles()}
    <div class="adh-wrap">

      <!-- Top row: Donut + Streak + Alerts -->
      <div class="adh-top-row">
        <div class="adh-donut-card">
          ${donutRing(stats.pct, 140)}
          <div class="adh-donut-stats">
            <span><b>${stats.completedCount}</b> done</span>
            <span><b>${stats.partialCount}</b> partial</span>
            <span><b>${stats.totalPlanned}</b> planned</span>
          </div>
        </div>

        <div class="adh-streak-card">
          ${renderStreakTracker(streaks)}
        </div>

        ${alertsHtml}
      </div>

      <!-- Calendar heatmap -->
      <div class="adh-cal-card">
        <div class="adh-cal-card-hd">
          <span class="adh-label-num">01</span>
          Weekly Adherence Calendar
        </div>
        ${renderCalendarHeatmap(calendarMap)}
      </div>

      <!-- Bottom grid: Timeline + Device usage -->
      <div class="adh-bottom-grid">
        <div class="adh-section-card">
          <div class="adh-section-hd">
            <span class="adh-section-title">
              <span class="adh-label-num">02</span>
              Session Timeline
            </span>
            <span style="font-size:10.5px;color:${T.t3};font-family:${T.fmono}">
              ${allLogs.length} session${allLogs.length !== 1 ? 's' : ''} recorded
            </span>
          </div>
          ${renderSessionTimeline(allLogs)}
        </div>

        <div class="adh-section-card">
          <div class="adh-section-hd">
            <span class="adh-section-title">
              <span class="adh-label-num">03</span>
              Device Usage
            </span>
          </div>
          ${renderDeviceUsage(deviceStats)}
        </div>
      </div>

    </div>`;
}

// ── Bind actions (interactive hooks) ───────────────────────────────────────────
export function bindAdherenceActions() {
  // Currently the adherence view is read-only.
  // Future: add drill-down into calendar cells, export PDF, etc.
  // Hook into calendar cell clicks for detail popover
  document.querySelectorAll('.adh-cal-cell:not(.adh-cal-future)').forEach(cell => {
    cell.style.cursor = 'pointer';
    cell.addEventListener('click', () => {
      const title = cell.getAttribute('title') || '';
      if (typeof window._dsToast === 'function') {
        window._dsToast({ title: 'Session Detail', body: title, severity: 'info' });
      }
    });
  });
}
