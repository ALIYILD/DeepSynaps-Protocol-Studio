import { api } from './api.js';
import { isDemoSession } from './demo-session.js';
import { ANALYZER_DEMO_FIXTURES, DEMO_FIXTURE_BANNER_HTML } from './demo-fixtures-analyzers.js';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _fmtDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return String(iso); }
}

function _fmtDateTime(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return String(iso); }
}

function _adherenceColor(pct) {
  const n = Number(pct);
  if (!Number.isFinite(n)) return 'var(--text-tertiary)';
  if (n >= 90) return 'var(--green)';
  if (n >= 75) return 'var(--amber)';
  return 'var(--red)';
}

function _adherencePill(pct) {
  const n = Number(pct);
  if (!Number.isFinite(n)) return '<span class="pill pill-inactive">—</span>';
  if (n >= 90) return `<span class="pill pill-active">${n}%</span>`;
  if (n >= 75) return `<span class="pill pill-pending">${n}%</span>`;
  return `<span class="pill" style="background:rgba(255,107,107,0.12);color:var(--red);border:1px solid rgba(255,107,107,0.25)">${n}%</span>`;
}

function _trendArrow(trend) {
  const t = String(trend || '').toLowerCase();
  if (t === 'up' || t === 'improving') return '<span title="Improving" aria-label="Improving" style="color:var(--green);font-weight:600">↑</span>';
  if (t === 'down' || t === 'worsening') return '<span title="Worsening" aria-label="Worsening" style="color:var(--red);font-weight:600">↓</span>';
  if (t === 'flat' || t === 'stable') return '<span title="Stable" aria-label="Stable" style="color:var(--amber);font-weight:600">→</span>';
  return '<span style="color:var(--text-tertiary)">·</span>';
}

function _signoffPill(signed, unsigned) {
  const u = Number(unsigned) || 0;
  if (u === 0) return '<span class="pill pill-active">All signed</span>';
  return `<span class="pill" style="background:rgba(245,158,11,0.12);color:var(--amber);border:1px solid rgba(245,158,11,0.30)">${u} pending</span>`;
}

function _aeDot(hasAE) {
  if (!hasAE) return '';
  return '<span title="Adverse-event flag" aria-label="Adverse-event flag" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--red);margin-left:6px;vertical-align:middle"></span>';
}

function _signedIcon(signed) {
  if (signed) {
    return '<span title="Signed off" aria-label="Signed off" style="color:var(--green);font-weight:600">✓</span>';
  }
  return '<span title="Awaiting sign-off" aria-label="Awaiting sign-off" style="color:var(--amber);font-weight:600">●</span>';
}

function _skeletonChips(n = 6) {
  const chip = '<span style="display:inline-block;width:120px;height:22px;border-radius:11px;background:linear-gradient(90deg,rgba(255,255,255,.04),rgba(255,255,255,.08),rgba(255,255,255,.04));background-size:200% 100%;animation:dh2AttnPulse 1.6s ease-in-out infinite"></span>';
  return `<div style="display:flex;gap:8px;flex-wrap:wrap">${Array.from({ length: n }, () => chip).join('')}</div>`;
}

function _errorCard(message, retryLabel = 'Try again') {
  const safe = esc(message || 'We couldn’t load the session data right now.');
  return `<div role="alert" style="max-width:560px;margin:24px auto;padding:18px 20px;border:1px solid rgba(255,107,107,0.35);background:rgba(255,107,107,0.06);border-radius:12px">
    <div style="font-weight:600;margin-bottom:6px;color:var(--text-primary)">We couldn’t load the session data right now.</div>
    <div style="font-size:12px;color:var(--text-secondary);line-height:1.5;margin-bottom:12px">${safe}</div>
    <button type="button" class="btn btn-ghost btn-sm" data-action="retry" style="min-height:44px">${esc(retryLabel)}</button>
  </div>`;
}

function _emptyClinicCard() {
  return `<div style="max-width:520px;margin:48px auto;padding:24px;border:1px solid var(--border);border-radius:14px;background:var(--bg-card);text-align:center">
    <div style="font-size:15px;font-weight:600;margin-bottom:8px">No active courses yet</div>
    <div style="font-size:12px;color:var(--text-secondary);margin-bottom:14px;line-height:1.5">
      Treatment session analytics light up once a patient has an active course with at least one delivered session.
    </div>
    <button type="button" class="btn btn-primary btn-sm" id="ts-go-courses" style="min-height:44px">Open courses</button>
  </div>`;
}

function _emptySessionsCard() {
  return `<div style="margin:18px 0;padding:18px 20px;border:1px dashed var(--border);border-radius:12px;background:rgba(255,255,255,.02);text-align:center">
    <div style="font-weight:600;margin-bottom:6px">No sessions delivered yet for this course</div>
    <div style="font-size:12px;color:var(--text-secondary);line-height:1.5">Once the first session is signed off, it will appear here with its telemetry, comfort score, and any AE flags.</div>
  </div>`;
}

function _renderClinicTable(rows, sortKey, sortDir) {
  if (!Array.isArray(rows) || !rows.length) return _emptyClinicCard();
  const sorted = rows.slice();
  const dir = sortDir === 'asc' ? 1 : -1;
  const cmp = (a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
    return String(av).localeCompare(String(bv)) * dir;
  };
  sorted.sort(cmp);

  const sortIndicator = (key) => key === sortKey ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';
  const th = (key, label, align = 'left') =>
    `<th data-sort-key="${esc(key)}" style="padding:8px 10px;text-align:${align};font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border);cursor:pointer;user-select:none">${esc(label)}${sortIndicator(key)}</th>`;

  const body = sorted.map((r) => {
    const adh = Number.isFinite(Number(r.adherence_pct)) ? `${Number(r.adherence_pct)}%` : '—';
    const adhColor = _adherenceColor(r.adherence_pct);
    return `<tr data-patient-id="${esc(r.patient_id)}" data-course-id="${esc(r.course_id || '')}" tabindex="0" role="button"
      style="cursor:pointer;min-height:44px"
      onmouseover="this.style.background='rgba(255,255,255,.03)'"
      onmouseout="this.style.background='transparent'">
      <td style="padding:10px;border-bottom:1px solid var(--border);font-weight:500">${esc(r.patient_name || 'Unknown')}</td>
      <td style="padding:10px;border-bottom:1px solid var(--border);font-size:12px;color:var(--text-secondary)">${esc(r.course_label || '—')}</td>
      <td style="padding:10px;text-align:center;border-bottom:1px solid var(--border);font-variant-numeric:tabular-nums">${esc(r.completed)}/${esc(r.prescribed)}</td>
      <td style="padding:10px;text-align:center;border-bottom:1px solid var(--border);color:${adhColor};font-weight:600">${esc(adh)}</td>
      <td style="padding:10px;border-bottom:1px solid var(--border);font-size:11px;color:var(--text-tertiary);white-space:nowrap">${esc(_fmtDate(r.last_session_at))}</td>
      <td style="padding:10px;text-align:center;border-bottom:1px solid var(--border)">${_trendArrow(r.outcome_trend)}</td>
      <td style="padding:10px;text-align:center;border-bottom:1px solid var(--border)">${_signoffPill(r.signed_count, r.unsigned_count)}</td>
    </tr>`;
  }).join('');

  return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:14px;overflow:auto">
    <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:820px">
      <thead><tr>
        ${th('patient_name', 'Patient')}
        ${th('course_label', 'Active course')}
        ${th('completed', 'Sessions', 'center')}
        ${th('adherence_pct', 'Adherence', 'center')}
        ${th('last_session_at', 'Last session')}
        ${th('outcome_trend', 'Outcomes', 'center')}
        ${th('unsigned_count', 'Sign-off', 'center')}
      </tr></thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}

function _ringSvg(pct, color) {
  const n = Math.max(0, Math.min(100, Number(pct) || 0));
  const r = 22;
  const c = 2 * Math.PI * r;
  const dash = (c * n) / 100;
  return `<svg width="56" height="56" viewBox="0 0 56 56" aria-label="Adherence ${n}%">
    <circle cx="28" cy="28" r="${r}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="6"/>
    <circle cx="28" cy="28" r="${r}" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round"
      stroke-dasharray="${dash} ${c - dash}" transform="rotate(-90 28 28)"/>
    <text x="28" y="32" text-anchor="middle" font-size="11" font-weight="600" fill="var(--text-primary)">${n}%</text>
  </svg>`;
}

function _renderCourseHeader(course, summary) {
  const color = _adherenceColor(course.adherence_pct);
  const ring = _ringSvg(course.adherence_pct, color);
  const total = course.total_sessions;
  const completed = course.completed_sessions;
  const signed = summary.signed_count;
  const delivered = summary.delivered_count;
  return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:14px;padding:16px 18px;display:flex;gap:18px;align-items:center;flex-wrap:wrap">
    <div style="flex:0 0 auto">${ring}</div>
    <div style="flex:1;min-width:240px">
      <div style="font-weight:600;font-size:14px;margin-bottom:4px">${esc(course.protocol_name || 'Course')}</div>
      <div style="font-size:12px;color:var(--text-secondary);line-height:1.5">
        ${esc(course.modality || '—')} · ${esc(course.target_site || '—')} · started ${esc(_fmtDate(course.started_at))}
      </div>
      <div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">
        Week ${esc(course.current_week || '—')} of ${esc(course.total_weeks || '—')} · ${esc(completed)}/${esc(total)} sessions delivered
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:6px;font-size:12px;color:var(--text-secondary);min-width:160px">
      <div>Signed off: <strong style="color:var(--text-primary)">${esc(signed)}/${esc(delivered)}</strong></div>
      <div>Course start: <strong style="color:var(--text-primary)">${esc(_fmtDate(course.started_at))}</strong></div>
    </div>
  </div>`;
}

function _renderSignoffQueue(unsigned) {
  if (!Array.isArray(unsigned) || !unsigned.length) {
    return `<div style="margin-top:14px;padding:14px;border:1px solid rgba(74,222,128,0.25);background:rgba(74,222,128,0.06);border-radius:12px;display:flex;justify-content:space-between;align-items:center;gap:10px">
      <div style="font-size:12px;color:var(--text-secondary)"><strong style="color:var(--green)">Sign-off queue clear.</strong> Every delivered session has a clinician signature.</div>
    </div>`;
  }
  const list = unsigned.map((s) => `<li style="padding:8px 10px;border-bottom:1px solid var(--border);font-size:12px;display:flex;justify-content:space-between;gap:10px">
    <span><strong>Session ${esc(s.session_number || '—')}</strong> · ${esc(_fmtDateTime(s.scheduled_at))}</span>
    <span style="color:var(--text-tertiary)">${esc(s.modality || '')}</span>
  </li>`).join('');
  return `<div style="margin-top:14px;background:var(--bg-card);border:1px solid rgba(245,158,11,0.30);border-radius:12px;overflow:hidden">
    <div style="padding:12px 14px;display:flex;justify-content:space-between;align-items:center;gap:10px;border-bottom:1px solid var(--border);background:rgba(245,158,11,0.06)">
      <div style="font-weight:600;font-size:13px"><span style="color:var(--amber)">${unsigned.length}</span> session${unsigned.length === 1 ? '' : 's'} awaiting sign-off</div>
      <button type="button" class="btn btn-primary btn-sm" data-action="sign-all" style="min-height:44px">Sign all</button>
    </div>
    <ul style="list-style:none;margin:0;padding:0">${list}</ul>
  </div>`;
}

function _renderDeviationPanel(deviations) {
  if (!Array.isArray(deviations) || !deviations.length) {
    return `<div style="margin-top:14px;padding:14px;border:1px solid rgba(74,222,128,0.25);background:rgba(74,222,128,0.06);border-radius:12px;font-size:12px;color:var(--text-secondary)">
      <strong style="color:var(--green)">No parameter deviations.</strong> Every delivered session matched the prescribed protocol within tolerance.
    </div>`;
  }
  const rows = deviations.map((d) => `<li style="padding:10px 12px;border-bottom:1px solid var(--border);font-size:12px;display:flex;flex-direction:column;gap:4px">
    <div style="display:flex;justify-content:space-between;gap:10px;align-items:center">
      <strong>Session ${esc(d.session_number || '—')}</strong>
      <span style="color:var(--text-tertiary);font-size:11px">${esc(_fmtDate(d.scheduled_at))}</span>
    </div>
    <div style="color:var(--text-secondary)"><span style="color:var(--amber)">${esc(d.parameter)}</span>: prescribed ${esc(d.prescribed)} · delivered ${esc(d.delivered)} <span style="color:var(--text-tertiary)">(${esc(d.note || 'outside tolerance')})</span></div>
  </li>`).join('');
  return `<div style="margin-top:14px;background:var(--bg-card);border:1px solid rgba(245,158,11,0.30);border-radius:12px;overflow:hidden">
    <div style="padding:12px 14px;border-bottom:1px solid var(--border);background:rgba(245,158,11,0.06);font-weight:600;font-size:13px">
      <span style="color:var(--amber)">${deviations.length}</span> delivered-vs-prescribed deviation${deviations.length === 1 ? '' : 's'}
    </div>
    <ul style="list-style:none;margin:0;padding:0">${rows}</ul>
  </div>`;
}

function _renderSparkline(scores, scaleName) {
  if (!Array.isArray(scores) || scores.length < 2) {
    return `<div style="margin-top:14px;padding:14px;background:var(--bg-card);border:1px solid var(--border);border-radius:12px">
      <div style="font-weight:600;font-size:13px;margin-bottom:6px">Outcomes — ${esc(scaleName || '—')}</div>
      <div style="font-size:12px;color:var(--text-tertiary)">Not enough data points to plot a trajectory yet.</div>
    </div>`;
  }
  const w = 480;
  const h = 80;
  const pad = 8;
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const span = Math.max(1, max - min);
  const step = (w - pad * 2) / (scores.length - 1);
  const pts = scores.map((s, i) => {
    const x = pad + i * step;
    const y = pad + (h - pad * 2) * (1 - (s - min) / span);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const first = scores[0];
  const last = scores[scores.length - 1];
  const direction = last < first ? 'down' : last > first ? 'up' : 'flat';
  const stroke = direction === 'down' ? 'var(--green)' : direction === 'up' ? 'var(--red)' : 'var(--amber)';
  return `<div style="margin-top:14px;padding:14px;background:var(--bg-card);border:1px solid var(--border);border-radius:12px">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:8px">
      <div style="font-weight:600;font-size:13px">Outcomes — ${esc(scaleName || '—')}</div>
      <div style="font-size:11px;color:var(--text-tertiary);font-variant-numeric:tabular-nums">${esc(first)} → ${esc(last)} (${scores.length} reads)</div>
    </div>
    <svg viewBox="0 0 ${w} ${h}" style="width:100%;height:auto;display:block" aria-label="${esc(scaleName)} trajectory">
      <polyline fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" points="${pts}"/>
      ${scores.map((s, i) => {
        const x = pad + i * step;
        const y = pad + (h - pad * 2) * (1 - (s - min) / span);
        return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.5" fill="${stroke}"/>`;
      }).join('')}
    </svg>
  </div>`;
}

function _renderSessionRow(s, expanded) {
  const aeDot = _aeDot(s.has_ae);
  const signed = _signedIcon(s.signed);
  const view = expanded ? 'Hide' : 'View';
  const inline = expanded ? `<div style="margin-top:8px;padding:10px 12px;background:rgba(255,255,255,.02);border-radius:10px;font-size:12px;color:var(--text-secondary);line-height:1.5">
      <div><strong style="color:var(--text-primary)">Telemetry</strong>: ${esc(s.telemetry_summary || '—')}</div>
      <div><strong style="color:var(--text-primary)">Impedance</strong>: ${esc(s.impedance_summary || '—')}</div>
      <div><strong style="color:var(--text-primary)">Comfort</strong>: ${esc(s.comfort_summary || '—')}</div>
      ${s.ae_log ? `<div style="color:var(--red)"><strong>AE</strong>: ${esc(s.ae_log)}</div>` : ''}
    </div>` : '';
  return `<li data-session-id="${esc(s.id)}" style="padding:12px 14px;border-bottom:1px solid var(--border);min-height:44px">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
      <div style="display:flex;flex-direction:column;gap:2px;min-width:200px">
        <div style="font-weight:600;font-size:13px">Session ${esc(s.session_number || '—')} ${signed}${aeDot}</div>
        <div style="font-size:11px;color:var(--text-tertiary)">${esc(_fmtDateTime(s.scheduled_at))}</div>
      </div>
      <div style="display:flex;gap:14px;align-items:center;font-size:12px;color:var(--text-secondary);flex-wrap:wrap">
        <span>${esc(s.intensity_label || '—')}</span>
        <span>${esc(s.duration_minutes ?? '—')} min</span>
        <span>Comfort ${esc(s.comfort_score ?? '—')}/10</span>
        <button type="button" class="btn btn-ghost btn-sm" data-action="toggle-session" data-session-id="${esc(s.id)}" style="min-height:44px">${view}</button>
      </div>
    </div>
    ${inline}
  </li>`;
}

function _renderTimeline(sessions, expandedId) {
  if (!Array.isArray(sessions) || !sessions.length) return _emptySessionsCard();
  return `<div style="margin-top:14px;background:var(--bg-card);border:1px solid var(--border);border-radius:12px;overflow:hidden">
    <div style="padding:10px 14px;border-bottom:1px solid var(--border);font-weight:600;font-size:13px">Session timeline</div>
    <ul style="list-style:none;margin:0;padding:0">${sessions.map((s) => _renderSessionRow(s, s.id === expandedId)).join('')}</ul>
  </div>`;
}

function _renderPatientDetail(detail, expandedId) {
  const course = detail.course || {};
  const sessions = detail.sessions || [];
  const summary = detail.summary || { signed_count: 0, delivered_count: sessions.length };
  const unsigned = sessions.filter((s) => !s.signed);
  const deviations = detail.deviations || [];
  const outcomes = detail.outcomes || { scale: '—', scores: [] };
  return `${_renderCourseHeader(course, summary)}
    ${_renderSignoffQueue(unsigned)}
    ${_renderTimeline(sessions, expandedId)}
    ${_renderDeviationPanel(deviations)}
    ${_renderSparkline(outcomes.scores, outcomes.scale)}`;
}

function _summarizeOutcomeScores(scores) {
  if (!Array.isArray(scores) || scores.length < 2) return 'flat';
  const first = scores[0];
  const last = scores[scores.length - 1];
  if (last < first - 1) return 'down';
  if (last > first + 1) return 'up';
  return 'flat';
}

function _outcomeTrendForClinic(detail) {
  const scores = detail?.outcomes?.scores;
  const dir = _summarizeOutcomeScores(scores);
  if (dir === 'down') return 'up';
  if (dir === 'up') return 'down';
  return 'flat';
}

function _buildClinicRow(detail) {
  const course = detail.course || {};
  const sessions = detail.sessions || [];
  const signed = sessions.filter((s) => s.signed).length;
  const unsigned = sessions.length - signed;
  const last = sessions.length ? sessions[sessions.length - 1].scheduled_at : null;
  return {
    patient_id: course.patient_id,
    patient_name: course.patient_name,
    course_id: course.id,
    course_label: `${course.modality || ''} · ${course.protocol_name || ''}`.trim(),
    completed: course.completed_sessions ?? sessions.length,
    prescribed: course.total_sessions ?? sessions.length,
    adherence_pct: course.adherence_pct,
    last_session_at: last,
    outcome_trend: _outcomeTrendForClinic(detail),
    signed_count: signed,
    unsigned_count: unsigned,
  };
}

export async function pgTreatmentSessionsAnalyzer(setTopbar, navigate) {
  try {
    setTopbar({
      title: 'Treatment Sessions Analyzer',
      subtitle: 'Adherence · sign-off backlog · parameter drift',
    });
  } catch {
    try { setTopbar('Treatment Sessions Analyzer', 'Course adherence and sign-off'); } catch {}
  }

  const el = document.getElementById('content');
  if (!el) return;

  let view = 'clinic';
  let clinicCache = null;
  let detailCache = null;
  let activePatientId = null;
  let activePatientName = '';
  let sortKey = 'unsigned_count';
  let sortDir = 'desc';
  let usingFixtures = false;
  let expandedSessionId = null;

  el.innerHTML = `
    <div class="ds-treatment-sessions-analyzer-shell" style="max-width:1100px;margin:0 auto;padding:16px 20px 48px">
      <div id="ts-demo-banner"></div>
      <div style="padding:12px 14px;border-radius:12px;border:1px solid rgba(155,127,255,0.28);background:rgba(155,127,255,0.06);margin-bottom:14px;font-size:12px;line-height:1.45;color:var(--text-secondary)">
        <strong style="color:var(--text-primary)">Clinical decision-support.</strong>
        Adherence, sign-off backlog, and delivered-vs-prescribed deviations are surfaced here so a busy clinician can triage at a glance. Sign-off remains a clinician action — never auto-signed.
      </div>
      <div id="ts-breadcrumb" style="display:flex;align-items:center;gap:10px;margin-bottom:12px;font-size:12px"></div>
      <div id="ts-body"></div>
    </div>`;

  const $ = (id) => document.getElementById(id);

  function _syncDemoBanner() {
    const slot = $('ts-demo-banner');
    if (!slot) return;
    slot.innerHTML = usingFixtures && isDemoSession() ? DEMO_FIXTURE_BANNER_HTML : '';
  }

  function setBreadcrumb() {
    const bc = $('ts-breadcrumb');
    if (!bc) return;
    if (view === 'clinic') {
      bc.innerHTML = `<span style="font-weight:600">Clinic session summary</span>`;
    } else {
      bc.innerHTML = `<button type="button" class="btn btn-ghost btn-sm" id="ts-back" style="min-height:44px">← Back to clinic</button>
        <span style="color:var(--text-tertiary)">/</span>
        <span style="font-weight:600">${esc(activePatientName || 'Patient')}</span>`;
      $('ts-back')?.addEventListener('click', () => { view = 'clinic'; expandedSessionId = null; render(); });
    }
  }

  function _useFixtureClinic() {
    const fx = ANALYZER_DEMO_FIXTURES.treatmentSessions;
    if (!fx) return null;
    const rows = fx.patients.map((pid) => _buildClinicRow(fx.detail(pid)));
    return rows;
  }

  function _useFixtureDetail(pid) {
    const fx = ANALYZER_DEMO_FIXTURES.treatmentSessions;
    if (!fx) return null;
    return fx.detail(pid);
  }

  async function _loadDetailFromApi(pid) {
    const courses = await api.listCourses({ patient_id: pid }).catch(() => null);
    const items = Array.isArray(courses?.items) ? courses.items : (Array.isArray(courses) ? courses : []);
    const active = items.find((c) => String(c.status || '').toLowerCase() === 'active') || items[0];
    if (!active) return null;
    const [courseSessions, outcomes] = await Promise.all([
      api.listCourseSessions(active.id).catch(() => ({ items: [] })),
      api.courseOutcomeSummary(active.id).catch(() => ({ items: [] })),
    ]);
    const sessions = Array.isArray(courseSessions?.items) ? courseSessions.items : (Array.isArray(courseSessions) ? courseSessions : []);
    const outcomeItems = Array.isArray(outcomes?.items) ? outcomes.items : (Array.isArray(outcomes) ? outcomes : []);
    if (!sessions.length) return null;
    return {
      course: {
        id: active.id,
        patient_id: pid,
        patient_name: active.patient_name || '',
        protocol_name: active.protocol_name || active.name || '',
        modality: active.modality || '',
        target_site: active.target_site || active.target_region || '',
        total_sessions: active.total_sessions ?? sessions.length,
        completed_sessions: sessions.filter((s) => String(s.status || '').toLowerCase() === 'completed').length,
        adherence_pct: active.adherence_pct ?? null,
        current_week: active.current_week ?? null,
        total_weeks: active.total_weeks ?? null,
        started_at: active.started_at || active.created_at,
      },
      sessions: sessions.map((s, i) => ({
        id: s.id,
        session_number: s.session_number ?? i + 1,
        scheduled_at: s.scheduled_at,
        intensity_label: s.intensity_label || '',
        duration_minutes: s.duration_minutes,
        comfort_score: s.comfort_score ?? null,
        signed: !!s.completed_at,
        has_ae: !!s.adverse_events,
        modality: s.modality || active.modality,
        telemetry_summary: '',
        impedance_summary: '',
        comfort_summary: '',
        ae_log: s.adverse_events || '',
      })),
      summary: {
        signed_count: sessions.filter((s) => !!s.completed_at).length,
        delivered_count: sessions.length,
      },
      deviations: [],
      outcomes: {
        scale: outcomeItems[0]?.scale || '—',
        scores: outcomeItems.map((o) => Number(o.score)).filter((n) => Number.isFinite(n)),
      },
    };
  }

  async function loadClinic() {
    const body = $('ts-body');
    if (!body) return;
    body.innerHTML = `<div style="padding:18px;background:var(--bg-card);border:1px solid var(--border);border-radius:14px">
      ${_skeletonChips(6)}
    </div>`;
    let rows = null;
    try {
      const personas = ANALYZER_DEMO_FIXTURES.patients || [];
      const details = await Promise.all(personas.map((p) => _loadDetailFromApi(p.id).catch(() => null)));
      rows = details.filter(Boolean).map(_buildClinicRow);
      if (!rows.length && isDemoSession()) {
        rows = _useFixtureClinic();
        usingFixtures = true;
      } else {
        usingFixtures = false;
      }
    } catch (e) {
      if (isDemoSession()) {
        rows = _useFixtureClinic();
        usingFixtures = true;
      } else {
        const msg = (e && e.message) || String(e);
        body.innerHTML = _errorCard(msg);
        body.querySelector('[data-action="retry"]')?.addEventListener('click', loadClinic);
        return;
      }
    }
    clinicCache = rows;
    _syncDemoBanner();
    body.innerHTML = _renderClinicTable(clinicCache, sortKey, sortDir);
    body.querySelector('#ts-go-courses')?.addEventListener('click', () => {
      try { navigate?.('protocol-studio'); } catch {}
    });
    body.querySelectorAll('[data-sort-key]').forEach((th) => {
      th.addEventListener('click', () => {
        const k = th.getAttribute('data-sort-key');
        if (k === sortKey) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        else { sortKey = k; sortDir = 'desc'; }
        body.innerHTML = _renderClinicTable(clinicCache, sortKey, sortDir);
        wireClinicTable();
      });
    });
    wireClinicTable();
  }

  function wireClinicTable() {
    const body = $('ts-body');
    body?.querySelectorAll('tr[data-patient-id]').forEach((tr) => {
      const pid = tr.getAttribute('data-patient-id');
      const open = () => {
        activePatientId = pid;
        const row = (clinicCache || []).find((r) => r.patient_id === pid);
        activePatientName = row?.patient_name || 'Patient';
        view = 'patient';
        expandedSessionId = null;
        render();
      };
      tr.addEventListener('click', open);
      tr.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(); }
      });
    });
  }

  async function loadPatient() {
    const body = $('ts-body');
    if (!body || !activePatientId) return;
    body.innerHTML = `<div style="padding:18px;background:var(--bg-card);border:1px solid var(--border);border-radius:14px">
      ${_skeletonChips(6)}
    </div>`;
    let detail = null;
    try {
      detail = await _loadDetailFromApi(activePatientId);
      if (!detail && isDemoSession()) {
        detail = _useFixtureDetail(activePatientId);
        usingFixtures = true;
      } else if (detail) {
        usingFixtures = false;
      }
    } catch (e) {
      if (isDemoSession()) {
        detail = _useFixtureDetail(activePatientId);
        usingFixtures = true;
      } else {
        const msg = (e && e.message) || String(e);
        body.innerHTML = _errorCard(msg);
        body.querySelector('[data-action="retry"]')?.addEventListener('click', loadPatient);
        return;
      }
    }
    if (!detail) {
      body.innerHTML = _emptySessionsCard();
      return;
    }
    detailCache = detail;
    _syncDemoBanner();
    body.innerHTML = _renderPatientDetail(detail, expandedSessionId);
    wirePatientDetail();
  }

  function wirePatientDetail() {
    const body = $('ts-body');
    if (!body) return;

    body.querySelectorAll('[data-action="toggle-session"]').forEach((b) => {
      b.addEventListener('click', () => {
        const sid = b.getAttribute('data-session-id');
        expandedSessionId = expandedSessionId === sid ? null : sid;
        body.innerHTML = _renderPatientDetail(detailCache, expandedSessionId);
        wirePatientDetail();
      });
    });

    body.querySelector('[data-action="sign-all"]')?.addEventListener('click', async (ev) => {
      const btn = ev.currentTarget;
      const unsigned = (detailCache?.sessions || []).filter((s) => !s.signed);
      if (!unsigned.length) return;
      const ok = window.confirm(`Sign off ${unsigned.length} session${unsigned.length === 1 ? '' : 's'}? Each will be recorded as a clinician signature.`);
      if (!ok) return;
      const old = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Signing…';
      try {
        for (const s of unsigned) {
          if (!usingFixtures) {
            await api.signSession(s.id, {});
          }
          s.signed = true;
        }
        if (detailCache.summary) {
          detailCache.summary.signed_count = (detailCache.sessions || []).filter((s) => s.signed).length;
        }
        body.innerHTML = _renderPatientDetail(detailCache, expandedSessionId);
        wirePatientDetail();
      } catch (e) {
        btn.disabled = false;
        btn.textContent = old;
        alert((e && e.message) || String(e));
      }
    });
  }

  function render() {
    setBreadcrumb();
    if (view === 'clinic') loadClinic();
    else loadPatient();
  }

  render();
}

export default { pgTreatmentSessionsAnalyzer };
