// pgPatientAdherenceEvents + pgPatientAdherenceHistory
// Extracted from `pages-patient.js` on 2026-05-02 as part of the file-split
// refactor (see `pages-patient/_shared.js`). NO behavioural change: code
// below is the verbatim adherence block from the original file, with
// imports rewired.
import { api } from '../api.js';
import { t } from '../i18n.js';
import { setTopbar, spinner, fmtDate, _hdEsc } from './_shared.js';

// ── pgPatientAdherenceEvents ──────────────────────────────────────────────────
//
// Sixth patient-facing launch-audit surface (PR 2026-05-01). Wires to the
// new ``/api/v1/adherence/*`` endpoints in
// ``apps/api/app/routers/adherence_events_router.py``:
//
//   GET    /api/v1/adherence/events            — list (audited)
//   GET    /api/v1/adherence/summary           — top counts
//   POST   /api/v1/adherence/events            — log task complete/skip/partial
//   POST   /api/v1/adherence/events/{id}/side-effect  — sev 1..10
//   POST   /api/v1/adherence/events/{id}/escalate     — AE Hub draft
//   GET    /api/v1/adherence/export.csv        — DEMO-prefixed when demo
//   POST   /api/v1/adherence/audit-events      — page audit ingestion
//
// Integrity guard: this page intentionally does NOT cache "AI-suggested
// explanations" in localStorage. AI-fabricated narratives attached to a
// regulatory adherence record would be an integrity issue; if a future
// version re-adds an AI explainer it must come from a server endpoint
// with a model + version + provenance trail, never from a frontend
// freeform LLM call cached locally.
export async function pgPatientAdherenceEvents() {
  setTopbar('Adherence Events');
  const el = document.getElementById('patient-content');
  if (!el) return;
  el.innerHTML = spinner();

  // 3s timeout so a hung Fly backend can never wedge the Adherence Events
  // form on a spinner. On timeout each result is null and the page
  // renders an honest empty state.
  const _timeout = (ms) => new Promise(r => setTimeout(() => r(null), ms));
  const _raceNull = (p) => Promise.race([
    Promise.resolve(p).catch(() => null),
    _timeout(3000),
  ]);

  const [listEnvelope, summary] = await Promise.all([
    _raceNull(api.adherenceEventsList()),
    _raceNull(api.adherenceEventsSummary()),
  ]);

  // The new endpoint returns { items, total, consent_active, is_demo,
  // disclaimers }. The legacy endpoint returns a bare array. Tolerate
  // both so a half-deployed Fly stack can't break the patient page.
  let events = [];
  let consentActive = true;
  let isDemo = false;
  let disclaimers = [];
  if (Array.isArray(listEnvelope)) {
    events = listEnvelope;
  } else if (listEnvelope && typeof listEnvelope === 'object') {
    events = Array.isArray(listEnvelope.items) ? listEnvelope.items : [];
    consentActive = listEnvelope.consent_active !== false;
    isDemo = !!listEnvelope.is_demo;
    disclaimers = Array.isArray(listEnvelope.disclaimers) ? listEnvelope.disclaimers : [];
  } else {
    // Final fallback: previous portal endpoint, returns plain array.
    const legacy = await _raceNull(api.portalListAdherenceEvents());
    events = Array.isArray(legacy) ? legacy : [];
  }

  if (summary && typeof summary === 'object') {
    if (summary.consent_active === false) consentActive = false;
    if (summary.is_demo) isDemo = true;
  }

  // Mount-time audit ping (best-effort; never block the UI).
  try {
    api.postAdherenceAuditEvent({
      event: 'view',
      note: `items=${events.length}`,
      using_demo_data: !!isDemo,
    });
    if (isDemo) {
      api.postAdherenceAuditEvent({ event: 'demo_banner_shown', using_demo_data: true });
    }
    if (!consentActive) {
      api.postAdherenceAuditEvent({ event: 'consent_banner_shown' });
    }
  } catch (_e) { /* never block UI */ }

  const todayStr = new Date().toISOString().slice(0, 10);

  const SEVERITY_COLORS = { low:'var(--teal)', moderate:'var(--blue)', high:'var(--amber,#f59e0b)', urgent:'#ff6b6b' };
  const EVENT_TYPE_LABELS = {
    adherence_report: 'Adherence Report',
    side_effect: 'Side Effect',
    tolerance_change: 'Tolerance Change',
    break_request: 'Break Request',
    concern: 'Concern',
    positive_feedback: 'Positive Feedback',
    device_request: 'Device Request',
  };

  // Banner stack — kept on the page to make demo / consent state visible
  // to reviewers without needing to crack open dev tools.
  const banners = [];
  if (isDemo) {
    banners.push(`
      <div class="notice notice-warning" style="margin-bottom:14px;font-size:12.5px;line-height:1.55">
        <strong>Demo data.</strong> Exports will be DEMO-prefixed. The
        adherence events shown here are for demo purposes only.
      </div>`);
  }
  if (!consentActive) {
    banners.push(`
      <div class="notice notice-info" style="margin-bottom:14px;font-size:12.5px;line-height:1.55">
        <strong>Read-only.</strong> Your consent is currently withdrawn.
        Existing adherence records remain visible, but logging new events,
        side-effects, or escalations is paused until consent is reinstated.
      </div>`);
  }
  if (disclaimers.length) {
    banners.push(`
      <div class="notice notice-info" style="margin-bottom:14px;font-size:12px;line-height:1.55">
        ${disclaimers.map(d => `<div style="margin-bottom:4px">${_hdEsc(d)}</div>`).join('')}
      </div>`);
  }

  // Top counts strip — driven entirely by the server summary; every
  // number traces to a real PatientAdherenceEvent row. No hardcoded
  // compliance %, no fake streak counters.
  const counts = summary && typeof summary === 'object' ? summary : null;
  const countCard = (label, value, sub) => `
    <div class="card" style="padding:14px;text-align:center">
      <div style="font-size:22px;font-weight:700;font-family:var(--font-display);color:var(--text-primary)">${_hdEsc(String(value ?? '—'))}</div>
      <div style="font-size:11px;font-weight:600;color:var(--text-secondary);margin-top:4px">${_hdEsc(label)}</div>
      ${sub ? `<div style="font-size:10px;color:var(--text-tertiary);margin-top:2px">${_hdEsc(sub)}</div>` : ''}
    </div>`;
  const countsStrip = counts ? `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:16px">
      ${countCard('Today completed', counts.completed_today ?? 0, 'tasks')}
      ${countCard('Today skipped',   counts.skipped_today   ?? 0, 'tasks')}
      ${countCard('Today partial',   counts.partial_today   ?? 0, 'tasks')}
      ${countCard('Side-effects (7d)', counts.side_effects_7d ?? 0, 'logged')}
      ${countCard('Escalated',       counts.escalated_open  ?? 0, 'open')}
      ${countCard('Missed streak',   counts.missed_streak_days ?? 0, 'days')}
    </div>` : '';

  const writeDisabled = !consentActive;
  const writeDisabledAttr = writeDisabled ? 'disabled' : '';

  el.innerHTML = `
    ${banners.join('')}
    ${countsStrip}

    <!-- Log a task -->
    <div class="card" style="margin-bottom:24px">
      <div class="card-header"><h3>Log a home-program task</h3></div>
      <div class="card-body" style="padding:20px">
        <div class="form-group">
          <label class="form-label">Status</label>
          <select id="hae-task-status" class="form-control" ${writeDisabledAttr}>
            <option value="complete">Complete</option>
            <option value="partial">Partial</option>
            <option value="skipped">Skipped</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Date</label>
          <input type="date" id="hae-date" class="form-control" value="${todayStr}" max="${todayStr}" ${writeDisabledAttr}>
        </div>
        <div class="form-group">
          <label class="form-label">Reason / notes (optional)</label>
          <textarea id="hae-body" class="form-control" rows="3" placeholder="Anything you want your clinician to know about this task?" ${writeDisabledAttr}></textarea>
        </div>
        <div id="hae-status" style="display:none;margin-bottom:10px;font-size:13px"></div>
        <button class="btn btn-primary" style="width:100%;padding:11px" onclick="window._haeLog()" ${writeDisabledAttr}>Log task →</button>
      </div>
    </div>

    <!-- Side-effect form -->
    <div class="card" style="margin-bottom:24px">
      <div class="card-header"><h3>Log a side-effect</h3></div>
      <div class="card-body" style="padding:20px">
        <div class="notice notice-info" style="font-size:12px;line-height:1.5;margin-bottom:12px">
          For medical emergencies call your local emergency number. Severity 7 or higher will alert your care team at high priority.
        </div>
        <div class="form-group">
          <label class="form-label">Severity (1 = mild, 10 = severe)</label>
          <input type="number" id="hae-se-sev" class="form-control" min="1" max="10" value="3" ${writeDisabledAttr}>
        </div>
        <div class="form-group">
          <label class="form-label">Body part (optional)</label>
          <input type="text" id="hae-se-body-part" class="form-control" maxlength="80" placeholder="e.g. forehead, scalp, left arm" ${writeDisabledAttr}>
        </div>
        <div class="form-group">
          <label class="form-label">Description</label>
          <textarea id="hae-se-note" class="form-control" rows="3" placeholder="What did you experience?" ${writeDisabledAttr}></textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Attach to event</label>
          <select id="hae-se-parent" class="form-control" ${writeDisabledAttr}>
            ${events.length === 0
              ? `<option value="">— Log a task above first —</option>`
              : events.map(ev => `<option value="${_hdEsc(ev.id)}">${_hdEsc((EVENT_TYPE_LABELS[ev.event_type] || ev.event_type || 'Event'))} · ${_hdEsc(ev.report_date || '')}</option>`).join('')}
          </select>
        </div>
        <div id="hae-se-status" style="display:none;margin-bottom:10px;font-size:13px"></div>
        <button class="btn btn-secondary" style="width:100%;padding:11px" onclick="window._haeLogSideEffect()" ${writeDisabledAttr || (events.length === 0 ? 'disabled' : '')}>Log side-effect →</button>
      </div>
    </div>

    <!-- Event history -->
    <div class="card" style="margin-bottom:20px">
      <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
        <h3>Event history</h3>
        <span style="font-size:12px;color:var(--text-tertiary)">${events.length} event${events.length !== 1 ? 's' : ''}</span>
      </div>
      <div style="padding:0 0 4px">
        ${events.length === 0
          ? `<div style="padding:24px;text-align:center;color:var(--text-tertiary);font-size:13px">No adherence events yet. As you complete or skip home tasks, they will appear here.</div>`
          : events.slice().sort((a,b) => new Date(b.report_date||b.created_at||0)-new Date(a.report_date||a.created_at||0)).map(ev => {
              const sev   = ev.severity || 'low';
              const color = SEVERITY_COLORS[sev] || 'var(--text-secondary)';
              const label = EVENT_TYPE_LABELS[ev.event_type] || _hdEsc(ev.event_type || 'Event');
              const ack   = (ev.status && ev.status !== 'open') ? ` · ${ev.status.charAt(0).toUpperCase() + ev.status.slice(1)}` : '';
              const escalated = ev.status === 'escalated';
              return `<div style="padding:12px 18px;border-bottom:1px solid var(--border)">
                <div style="display:flex;align-items:flex-start;gap:10px">
                  <div style="flex:1">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap">
                      <span style="font-size:13px;font-weight:600;color:var(--text-primary)">${_hdEsc(label)}</span>
                      ${ev.event_type === 'side_effect' ? `<span style="font-size:10px;padding:2px 8px;border-radius:99px;background:${color}22;color:${color};font-weight:600">${_hdEsc(sev)}</span>` : ''}
                      ${escalated ? `<span style="font-size:10px;padding:2px 8px;border-radius:99px;background:rgba(255,107,107,0.18);color:#ff6b6b;font-weight:600">Escalated</span>` : ''}
                    </div>
                    <div style="font-size:11.5px;color:var(--text-tertiary)">${fmtDate(ev.report_date||ev.created_at)}${_hdEsc(ack)}</div>
                    ${ev.body ? `<div style="font-size:12.5px;color:var(--text-secondary);margin-top:5px;line-height:1.55">${_hdEsc(ev.body)}</div>` : ''}
                    ${(!escalated && !writeDisabled) ? `<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
                      <button class="btn btn-ghost" style="font-size:11.5px;padding:5px 10px" onclick="window._haeEscalate('${_hdEsc(ev.id)}')">Escalate to clinician →</button>
                    </div>` : ''}
                    ${escalated ? `<div style="margin-top:8px"><a href="#" onclick="event.preventDefault(); window._haeViewAEHub('${_hdEsc(ev.id)}')" style="font-size:11.5px;color:var(--blue)">View AE Hub draft →</a></div>` : ''}
                  </div>
                </div>
              </div>`;
            }).join('')}
      </div>
    </div>

    <!-- Export strip -->
    <div class="card" style="margin-bottom:20px">
      <div class="card-body" style="padding:14px 18px;display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        <span style="font-size:12.5px;color:var(--text-secondary)">Export your adherence record:</span>
        <a class="btn btn-ghost" style="font-size:12px;padding:6px 12px" href="/api/v1/adherence/export.csv" onclick="window._haeAuditExport('csv')">CSV</a>
        <a class="btn btn-ghost" style="font-size:12px;padding:6px 12px" href="/api/v1/adherence/export.ndjson" onclick="window._haeAuditExport('ndjson')">NDJSON</a>
      </div>
    </div>
  `;

  // ── Action handlers ──────────────────────────────────────────────────────

  window._haeLog = async function() {
    if (writeDisabled) return;
    const statusEl = document.getElementById('hae-task-status');
    const dateEl   = document.getElementById('hae-date');
    const bodyEl   = document.getElementById('hae-body');
    const statusOut = document.getElementById('hae-status');

    const payload = {
      status: statusEl?.value || 'complete',
      report_date: dateEl?.value || todayStr,
      body: (bodyEl?.value || '').trim() || null,
    };

    const btn = el.querySelector('button.btn-primary[onclick*="_haeLog"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Logging…'; }
    if (statusOut) statusOut.style.display = 'none';

    try {
      await api.adherenceEventLog(payload);
      if (statusOut) {
        statusOut.style.display = '';
        statusOut.style.color = 'var(--teal)';
        statusOut.textContent = 'Task logged. It will appear in your event history below.';
      }
      try {
        api.postAdherenceAuditEvent({
          event: payload.status === 'complete' ? 'task_completed' : (payload.status === 'skipped' ? 'task_skipped' : 'task_partial'),
          note: `date=${payload.report_date}`,
          using_demo_data: !!isDemo,
        });
      } catch (_e) { /* never block UI */ }
      if (btn) { btn.disabled = false; btn.textContent = 'Log task →'; }
      setTimeout(() => pgPatientAdherenceEvents(), 800);
    } catch (err) {
      if (statusOut) {
        statusOut.style.display = '';
        statusOut.style.color = '#ff6b6b';
        statusOut.textContent = 'Could not log task: ' + (err?.message || 'Unknown error');
      }
      if (btn) { btn.disabled = false; btn.textContent = 'Log task →'; }
    }
  };

  window._haeLogSideEffect = async function() {
    if (writeDisabled) return;
    const sevEl   = document.getElementById('hae-se-sev');
    const bpEl    = document.getElementById('hae-se-body-part');
    const noteEl  = document.getElementById('hae-se-note');
    const parentEl = document.getElementById('hae-se-parent');
    const out     = document.getElementById('hae-se-status');

    const sev = parseInt(sevEl?.value || '0', 10);
    if (!(sev >= 1 && sev <= 10)) {
      if (out) { out.style.display=''; out.style.color='#ff6b6b'; out.textContent = 'Severity must be between 1 and 10.'; }
      return;
    }
    if (!noteEl?.value?.trim()) {
      if (out) { out.style.display=''; out.style.color='#ff6b6b'; out.textContent = 'Please describe the side-effect.'; }
      return;
    }
    const parentId = parentEl?.value || '';
    if (!parentId) {
      if (out) { out.style.display=''; out.style.color='#ff6b6b'; out.textContent = 'Pick an event to attach the side-effect to.'; }
      return;
    }

    const btn = el.querySelector('button[onclick*="_haeLogSideEffect"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Logging…'; }
    if (out) out.style.display = 'none';

    try {
      await api.adherenceEventSideEffect(parentId, {
        severity: sev,
        body_part: (bpEl?.value || '').trim() || null,
        note: noteEl.value.trim(),
      });
      if (out) {
        out.style.display = '';
        out.style.color = 'var(--teal)';
        out.textContent = sev >= 7
          ? 'Side-effect logged. Your care team has been alerted at high priority.'
          : 'Side-effect logged.';
      }
      try {
        api.postAdherenceAuditEvent({
          event: 'side_effect_logged',
          event_record_id: parentId,
          note: `severity=${sev}`,
          using_demo_data: !!isDemo,
        });
      } catch (_e) { /* never block UI */ }
      if (btn) { btn.disabled = false; btn.textContent = 'Log side-effect →'; }
      setTimeout(() => pgPatientAdherenceEvents(), 800);
    } catch (err) {
      if (out) {
        out.style.display = '';
        out.style.color = '#ff6b6b';
        out.textContent = 'Could not log side-effect: ' + (err?.message || 'Unknown error');
      }
      if (btn) { btn.disabled = false; btn.textContent = 'Log side-effect →'; }
    }
  };

  window._haeEscalate = async function(eventId) {
    if (writeDisabled || !eventId) return;
    const reason = window.prompt('Briefly describe why you want to escalate this to your clinician:');
    if (!reason || !reason.trim()) return;
    try {
      const result = await api.adherenceEventEscalate(eventId, reason.trim());
      try {
        api.postAdherenceAuditEvent({
          event: 'escalated_to_clinician',
          event_record_id: eventId,
          note: result?.adverse_event_id ? `ae_id=${result.adverse_event_id}` : 'no_ae_draft',
          using_demo_data: !!isDemo,
        });
      } catch (_e) { /* never block UI */ }
      pgPatientAdherenceEvents();
    } catch (err) {
      window.alert('Could not escalate: ' + (err?.message || 'Unknown error'));
    }
  };

  window._haeViewAEHub = function(eventId) {
    try {
      api.postAdherenceAuditEvent({
        event: 'deep_link_followed',
        event_record_id: eventId,
        note: 'target=adverse_events_hub',
        using_demo_data: !!isDemo,
      });
    } catch (_e) { /* never block UI */ }
    if (typeof window._navPatient === 'function') {
      window._navPatient('pt-adverse-events');
    } else {
      window.location.hash = '#pt-adverse-events';
    }
  };

  window._haeAuditExport = function(format) {
    try {
      api.postAdherenceAuditEvent({
        event: 'export',
        note: `format=${format}`,
        using_demo_data: !!isDemo,
      });
    } catch (_e) { /* never block UI */ }
  };
}

// ── pgPatientAdherenceHistory ─────────────────────────────────────────────────
export async function pgPatientAdherenceHistory() {
  setTopbar(t('patient.nav.adherence'));
  const el = document.getElementById('patient-content');
  if (!el) return;
  el.innerHTML = spinner();

  // 3s timeout so a hung Fly backend can never wedge Adherence History on
  // a spinner. Null / [] from timeout falls through to the local/empty
  // rendering path below.
  const _timeout = (ms) => new Promise(r => setTimeout(() => r(null), ms));
  const _raceNull = (p) => Promise.race([
    Promise.resolve(p).catch(() => null),
    _timeout(3000),
  ]);
  let summary = null;
  let sessions = [];
  try {
    [summary, sessions] = await Promise.all([
      _raceNull(api.portalHomeAdherenceSummary()),
      _raceNull(api.portalListHomeSessions()),
    ]);
    if (!Array.isArray(sessions)) sessions = [];
  } catch (_e) { /* handled below */ }

  const sessArr = Array.isArray(sessions) ? sessions : [];
  // Backend envelope: { assignment_id, adherence: {...} } or { assignment: null, adherence: null }.
  // Accept flat legacy shape too.
  const _envelope = summary || {};
  const s = (_envelope && typeof _envelope === 'object' && _envelope.adherence)
    ? _envelope.adherence
    : _envelope;
  const hasAssignment = !!(_envelope && (_envelope.assignment_id || _envelope.adherence));

  // Stats — map backend keys (sessions_logged / sessions_expected / adherence_rate_pct
  // / streak_current / streak_best / logs_by_week).
  const totalSessions    = s.sessions_logged   ?? s.total_sessions     ?? sessArr.length;
  const completedCount   = s.sessions_logged   ?? s.completed_sessions ?? sessArr.filter(x => x.completed !== false).length;
  const expectedSessions = s.sessions_expected ?? null;
  const completedRate    = (s.adherence_rate_pct != null)
    ? Math.round(s.adherence_rate_pct)
    : ((expectedSessions && expectedSessions > 0)
        ? Math.round((completedCount / expectedSessions) * 100)
        : (totalSessions > 0 ? Math.round((completedCount / totalSessions) * 100) : 0));
  const currentStreak = s.streak_current ?? s.current_streak ?? 0;
  const longestStreak = s.streak_best    ?? s.longest_streak ?? 0;
  const avgTolerance    = s.avg_tolerance    != null
    ? Number(s.avg_tolerance).toFixed(1)
    : (sessArr.filter(x => x.tolerance_rating != null).length > 0
        ? (sessArr.reduce((acc, x) => acc + (x.tolerance_rating ?? 0), 0) / sessArr.filter(x => x.tolerance_rating != null).length).toFixed(1)
        : null);
  const avgMoodBefore = s.avg_mood_before != null ? Number(s.avg_mood_before).toFixed(1) : null;
  const avgMoodAfter  = s.avg_mood_after  != null ? Number(s.avg_mood_after).toFixed(1)  : null;

  // Weekly bar chart data (8 weeks) — backend returns logs_by_week: [{week_start, count}].
  const weeklyData = Array.isArray(s.logs_by_week)
    ? s.logs_by_week
    : (Array.isArray(s.weekly_sessions) ? s.weekly_sessions : []);

  // Build 8-week local data if no server data
  function buildLocalWeekly() {
    if (!sessArr.length) return Array(8).fill(0);
    const weeks = Array(8).fill(0);
    const now = Date.now();
    sessArr.forEach(sess => {
      const d = new Date(sess.session_date || sess.created_at || 0);
      const msAgo = now - d.getTime();
      const weekIdx = Math.floor(msAgo / (7 * 86400000));
      if (weekIdx >= 0 && weekIdx < 8) weeks[7 - weekIdx]++;
    });
    return weeks;
  }

  const chartData = weeklyData.length >= 8
    ? weeklyData.slice(-8).map(w => (typeof w === 'object' ? (w.count ?? w.sessions ?? 0) : Number(w)))
    : buildLocalWeekly();

  const maxBar = Math.max(...chartData, 1);

  // Simple bar chart SVG
  function barChartHTML(data) {
    const w = 280; const h = 80; const barW = 26; const gap = 10;
    const totalW = data.length * (barW + gap) - gap;
    const startX = (w - totalW) / 2;
    const bars = data.map((v, i) => {
      const barH = Math.max(2, Math.round((v / maxBar) * (h - 20)));
      const x = startX + i * (barW + gap);
      const y = h - barH;
      const color = v === 0 ? 'rgba(255,255,255,0.07)' : 'var(--teal)';
      return `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="4" fill="${color}"/>
              <text x="${x + barW/2}" y="${h + 14}" text-anchor="middle" font-size="9" fill="var(--text-tertiary)">W${i+1}</text>
              ${v > 0 ? `<text x="${x + barW/2}" y="${y - 4}" text-anchor="middle" font-size="9" fill="var(--text-secondary)">${v}</text>` : ''}`;
    }).join('');
    return `<svg width="${w}" height="${h + 20}" viewBox="0 0 ${w} ${h + 20}" style="overflow:visible">${bars}</svg>`;
  }

  // Stat card helper
  function statCard(label, value, sub, color) {
    return `<div class="card" style="padding:16px;text-align:center;border-color:rgba(${color},0.3)">
      <div style="font-size:24px;font-weight:700;font-family:var(--font-display);color:rgb(${color})">${_hdEsc(String(value ?? '—'))}</div>
      <div style="font-size:11.5px;font-weight:600;color:var(--text-primary);margin-top:4px">${_hdEsc(label)}</div>
      ${sub ? `<div style="font-size:10.5px;color:var(--text-tertiary);margin-top:3px">${_hdEsc(sub)}</div>` : ''}
    </div>`;
  }

  const noAssignmentNotice = !hasAssignment ? `
    <div class="notice notice-info" style="margin-bottom:16px;font-size:12.5px;line-height:1.6">
      No active home device assignment — the stats below reflect any sessions you have already logged.
    </div>` : '';

  el.innerHTML = `
    ${noAssignmentNotice}
    <!-- Stats grid -->
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:20px">
      ${statCard('Total Sessions', totalSessions, 'logged', '0,212,188')}
      ${statCard('Adherence', completedRate + '%', expectedSessions ? (completedCount + ' of ' + expectedSessions + ' planned') : (completedCount + ' sessions'), '74,158,255')}
      ${statCard('Current Streak', currentStreak, currentStreak === 1 ? 'day' : 'days', '167,139,250')}
      ${statCard('Best Streak', longestStreak, longestStreak === 1 ? 'day' : 'days', '52,211,153')}
      ${statCard('Avg Tolerance', avgTolerance ?? '—', 'out of 5', '0,212,188')}
      ${avgMoodBefore != null ? statCard('Avg Mood Before', avgMoodBefore, 'out of 5', '74,158,255') : ''}
      ${avgMoodAfter  != null ? statCard('Avg Mood After',  avgMoodAfter,  'out of 5', '52,211,153') : ''}
    </div>

    <!-- Weekly chart -->
    <div class="card" style="margin-bottom:20px">
      <div class="card-header"><h3>Sessions per Week (last 8 weeks)</h3></div>
      <div class="card-body" style="padding:16px 20px;display:flex;justify-content:center">
        ${barChartHTML(chartData)}
      </div>
    </div>

    <!-- Full session log table -->
    <div class="card" style="margin-bottom:20px">
      <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
        <h3>Full Session Log</h3>
        <span style="font-size:12px;color:var(--text-tertiary)">${sessArr.length} session${sessArr.length !== 1 ? 's' : ''}</span>
      </div>
      <div style="overflow-x:auto">
        ${sessArr.length === 0
          ? `<div style="padding:24px;text-align:center;color:var(--text-tertiary);font-size:13px">No sessions logged yet.</div>`
          : `<table style="width:100%;border-collapse:collapse;font-size:12.5px">
              <thead>
                <tr style="border-bottom:1px solid var(--border)">
                  <th style="padding:10px 16px;text-align:left;font-weight:600;color:var(--text-secondary);white-space:nowrap">Date</th>
                  <th style="padding:10px 16px;text-align:left;font-weight:600;color:var(--text-secondary)">Duration</th>
                  <th style="padding:10px 16px;text-align:left;font-weight:600;color:var(--text-secondary)">Tolerance</th>
                  <th style="padding:10px 16px;text-align:left;font-weight:600;color:var(--text-secondary)">Mood ↑</th>
                  <th style="padding:10px 16px;text-align:left;font-weight:600;color:var(--text-secondary)">Status</th>
                </tr>
              </thead>
              <tbody>
                ${sessArr.slice().sort((a,b)=>new Date(b.session_date||b.created_at||0)-new Date(a.session_date||a.created_at||0)).map(s => {
                  const done = s.completed !== false;
                  const mb = s.mood_before != null ? String(s.mood_before) : '—';
                  const ma = s.mood_after  != null ? String(s.mood_after)  : '—';
                  return `<tr style="border-bottom:1px solid var(--border)">
                    <td style="padding:10px 16px;color:var(--text-primary)">${fmtDate(s.session_date||s.created_at)}</td>
                    <td style="padding:10px 16px;color:var(--text-secondary)">${s.duration_minutes ? s.duration_minutes + ' min' : '—'}</td>
                    <td style="padding:10px 16px;color:var(--text-secondary)">${s.tolerance_rating != null ? s.tolerance_rating + '/5' : '—'}</td>
                    <td style="padding:10px 16px;color:var(--text-secondary)">${mb} → ${ma}</td>
                    <td style="padding:10px 16px"><span style="font-size:10px;padding:2px 8px;border-radius:99px;background:${done?'rgba(0,212,188,0.1)':'rgba(148,163,184,0.1)'};color:${done?'var(--teal)':'var(--text-tertiary)'}">${done?'Done':'Partial'}</span></td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>`}
      </div>
    </div>

    <!-- Navigation links -->
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:4px">
      <button class="btn btn-ghost btn-sm" style="flex:1;min-width:130px" onclick="window._navPatient('pt-home-device')">← Home Device</button>
      <button class="btn btn-ghost btn-sm" style="flex:1;min-width:130px" onclick="window._navPatient('pt-home-session-log')">Log New Session →</button>
    </div>
  `;
}

