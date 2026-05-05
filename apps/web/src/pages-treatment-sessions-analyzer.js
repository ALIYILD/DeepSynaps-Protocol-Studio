/**
 * Treatment Sessions Analyzer — clinician-reviewed treatment-session decision support.
 * Does not approve protocols, adjust dosing, or infer causality. Surfaces source-backed
 * course/session data and honest gaps when APIs or records are missing.
 */
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

/** Neutral trajectory label for outcome sparkline / table — not "improving/worsening" as clinical fact */
function _trendArrow(trend) {
  const t = String(trend || '').toLowerCase();
  if (t === 'up' || t === 'improving') return '<span title="Scores moved in direction consistent with improvement on this scale (rule-based)" aria-label="Trajectory up on scale" style="color:var(--text-secondary);font-weight:600">↑</span>';
  if (t === 'down' || t === 'worsening') return '<span title="Scores moved in direction consistent with worsening on this scale (rule-based)" aria-label="Trajectory down on scale" style="color:var(--text-secondary);font-weight:600">↓</span>';
  if (t === 'flat' || t === 'stable') return '<span title="Little change between first and last plotted points" aria-label="Flat trajectory" style="color:var(--text-tertiary);font-weight:600">→</span>';
  return '<span style="color:var(--text-tertiary)">·</span>';
}

function _signoffPill(signed, unsigned, opts = {}) {
  if (opts.loading) {
    return '<span class="pill pill-inactive" title="Loading sign-off status">Loading…</span>';
  }
  if (opts.unavailable) {
    return '<span class="pill pill-inactive" title="Sign-off status unavailable (API error or offline)">—</span>';
  }
  if (opts.unknown) {
    return '<span class="pill pill-inactive" title="Open patient row for SIGN events — not loaded in clinic summary">—</span>';
  }
  const u = Number(unsigned) || 0;
  const partialHint = opts.partial
    ? ' Sign-off counts reflect delivered sessions returned by batch API only — may not include every planned session.'
    : '';
  if (u === 0) {
    return `<span class="pill pill-active" title="All returned sessions have SIGN events recorded.${partialHint}">All signed</span>`;
  }
  return `<span class="pill" style="background:rgba(245,158,11,0.12);color:var(--amber);border:1px solid rgba(245,158,11,0.30)" title="Sessions without SIGN event among batch-visible rows.${partialHint}">${u} pending</span>`;
}

function _aeDot(hasAE) {
  if (!hasAE) return '';
  return '<span title="Course-linked adverse-event records exist — requires clinician review per clinic protocol" aria-label="Adverse-event flag" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--red);margin-left:6px;vertical-align:middle"></span>';
}

function _signedIcon(signed, unknown) {
  if (unknown) {
    return '<span title="Sign-off not loaded (expand session after load)" aria-label="Sign-off unknown" style="color:var(--text-tertiary);font-weight:600">?</span>';
  }
  if (signed) {
    return '<span title="Sign-off event recorded" aria-label="Signed off" style="color:var(--green);font-weight:600">✓</span>';
  }
  return '<span title="No sign-off event on file for this session" aria-label="Awaiting review" style="color:var(--amber);font-weight:600">●</span>';
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

function _restrictedCard() {
  return `<div role="region" aria-label="Access restricted" style="max-width:560px;margin:48px auto;padding:24px;border:1px solid var(--border);border-radius:14px;background:var(--bg-card);text-align:center">
    <div style="font-size:15px;font-weight:600;margin-bottom:8px">Clinician workspace</div>
    <div style="font-size:12px;color:var(--text-secondary);line-height:1.6">
      Treatment session analytics are restricted to clinician and administrator roles. Follow your clinic’s policy for patient-facing session summaries.
    </div>
  </div>`;
}

function _emptyClinicCard() {
  return `<div style="max-width:560px;margin:48px auto;padding:24px;border:1px solid var(--border);border-radius:14px;background:var(--bg-card);text-align:center">
    <div style="font-size:15px;font-weight:600;margin-bottom:8px">No active treatment courses found</div>
    <div style="font-size:12px;color:var(--text-secondary);margin-bottom:14px;line-height:1.5">
      This list only reflects courses returned by your clinic API for your account. Absence of rows does not prove a patient has no sessions elsewhere — verify source systems and clinic workflow.
    </div>
    <button type="button" class="btn btn-primary btn-sm" id="ts-go-courses" style="min-height:44px">Open Protocol Studio</button>
    <div style="margin-top:12px"><button type="button" class="btn btn-ghost btn-sm" id="ts-go-schedule" style="min-height:44px">Open schedule</button></div>
  </div>`;
}

function _emptySessionsCard() {
  return `<div style="margin:18px 0;padding:18px 20px;border:1px dashed var(--border);border-radius:12px;background:rgba(255,255,255,.02);text-align:center">
    <div style="font-weight:600;margin-bottom:6px">No delivered sessions in course records</div>
    <div style="font-size:12px;color:var(--text-secondary);line-height:1.5">
      There are no delivered-session parameter rows for this course in the connected backend. This does not prove zero treatments occurred — verify documentation and device imports. Requires clinician review per clinic protocol if sessions should appear.
    </div>
  </div>`;
}

/**
 * Parse course outcome summary into per-scale series (multiple instruments supported).
 */
function _parseOutcomeSummaries(outcomesResp) {
  const summaries = Array.isArray(outcomesResp?.summaries) ? outcomesResp.summaries : [];
  const allSeries = summaries.map((s) => {
    const measurements = Array.isArray(s.measurements) ? s.measurements : [];
    const scores = measurements
      .map((m) => (m.score_numeric != null ? Number(m.score_numeric) : NaN))
      .filter((n) => Number.isFinite(n));
    return {
      template_id: s.template_id || '',
      template_title: s.template_title || s.template_id || '—',
      scores,
    };
  });
  const ruleNote = 'Outcome trajectory uses recorded outcome series for this course (backend rule-based deltas). Not a diagnosis or treatment-response label. Requires clinician interpretation.';
  const pickSeries = (templateId) => {
    let ser = templateId ? allSeries.find((x) => x.template_id === templateId) : null;
    if (!ser) ser = allSeries.find((x) => x.scores.length >= 2) || allSeries[0];
    if (!ser) {
      return { scale: '—', scores: [], template_id: '', ruleNote, summariesCount: summaries.length };
    }
    return {
      scale: ser.template_title,
      scores: ser.scores,
      template_id: ser.template_id,
      ruleNote,
      summariesCount: summaries.length,
    };
  };
  const primary = pickSeries(null);
  return {
    ...primary,
    all_series: allSeries,
    responderFlag: outcomesResp?.responder,
    pickSeries,
  };
}

function _completionPct(course, sessSummary) {
  const planned = Number(course?.planned_sessions_total) || Number(sessSummary?.sessions_planned) || 0;
  const delivered = Number(course?.sessions_delivered) || Number(sessSummary?.sessions_delivered) || 0;
  if (!planned || planned <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((delivered / planned) * 100)));
}

async function _sessionSignedMap(sessionIds) {
  const unique = [...new Set((sessionIds || []).filter(Boolean))];
  const out = new Map();
  await Promise.all(unique.map(async (sid) => {
    try {
      const ev = await api.listSessionEvents(sid);
      const signed = Array.isArray(ev) && ev.some((e) => String(e.type || '').toUpperCase() === 'SIGN');
      out.set(sid, signed);
    } catch {
      out.set(sid, false);
    }
  }));
  return out;
}

async function _mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx;
      idx += 1;
      results[i] = await fn(items[i], i);
    }
  }
  const n = Math.min(Math.max(1, limit), Math.max(1, items.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

/** @param {{ lite?: boolean }} opts — lite skips per-session GET/events (clinic table performance). */
async function _hydrateCourseDetail(course, patientId, patientNameFromCaller = '', opts = {}) {
  const lite = !!opts.lite;
  const courseId = course.id;
  const [
    courseSessions,
    outcomesResp,
    sessSummary,
    aeSummary,
    auditResp,
  ] = await Promise.all([
    api.listCourseSessions(courseId).catch(() => ({ items: [] })),
    api.courseOutcomeSummary(courseId).catch(() => null),
    api.getCourseSessionsSummary(courseId).catch(() => null),
    api.getCourseAdverseEventsSummary(courseId).catch(() => null),
    lite
      ? Promise.resolve({ items: [] })
      : api.listCourseAuditEvents(courseId, { limit: 40 }).catch(() => ({ items: [] })),
  ]);

  const logs = Array.isArray(courseSessions?.items)
    ? courseSessions.items
    : (Array.isArray(courseSessions) ? courseSessions : []);
  if (!logs.length) return null;

  const sessionIds = logs.map((l) => l.session_id).filter(Boolean);
  let signedMap = new Map();
  if (!lite) {
    signedMap = await _sessionSignedMap(sessionIds);
  }

  let clinicalById = new Map();
  if (!lite) {
    const clinicalRows = await _mapWithConcurrency(sessionIds, 5, async (sid) => {
      try {
        return await api.getSession(sid);
      } catch {
        return null;
      }
    });
    clinicalById = new Map(sessionIds.map((id, i) => [id, clinicalRows[i]]));
  }

  const outcomeParsed = outcomesResp ? _parseOutcomeSummaries(outcomesResp) : {
    scale: '—',
    scores: [],
    template_id: '',
    ruleNote: '',
    responderFlag: null,
    summariesCount: 0,
    all_series: [],
    pickSeries: () => ({ scale: '—', scores: [], template_id: '', ruleNote: '', summariesCount: 0 }),
  };

  const sessions = logs.map((s, i) => {
    const clin = clinicalById.get(s.session_id);
    const scheduled = clin?.scheduled_at || s.created_at;
    const intensityParts = [s.intensity_pct_rmt, s.frequency_hz].filter(Boolean);
    const intensityLabel = intensityParts.length ? intensityParts.join(' · ') : '';
    const comfortFromTol = s.tolerance_rating
      ? ({ well_tolerated: '8', moderate: '5', poor: '3' }[String(s.tolerance_rating).toLowerCase()] || '')
      : '';
    let signed = false;
    if (!lite) {
      signed = !!signedMap.get(s.session_id);
    }
    return {
      id: s.session_id,
      log_id: s.id,
      session_number: clin?.session_number ?? i + 1,
      scheduled_at: scheduled,
      intensity_label: intensityLabel,
      duration_minutes: s.duration_minutes ?? clin?.duration_minutes ?? null,
      comfort_score: comfortFromTol ? Number(comfortFromTol) : null,
      signed,
      signoff_unknown: lite,
      has_ae: !!(clin?.adverse_events && String(clin.adverse_events).trim()),
      modality: clin?.modality || course.modality_slug || '',
      telemetry_summary: s.interruptions ? `Interruption recorded${s.interruption_reason ? `: ${s.interruption_reason}` : ''}` : '—',
      impedance_summary: '—',
      comfort_summary: s.tolerance_rating ? `Tolerance: ${s.tolerance_rating}` : '—',
      ae_log: clin?.adverse_events || '',
      post_session_notes: s.post_session_notes || '',
      protocol_ref: clin?.protocol_ref || '',
    };
  });

  let ptName = patientNameFromCaller || '';
  if (!ptName) {
    ptName = await api.getPatient(patientId).then((p) => `${p?.first_name || ''} ${p?.last_name || ''}`.trim()).catch(() => '');
  }

  const adherencePct = _completionPct(course, sessSummary);
  const deviationsNote = sessSummary?.deviations != null
    ? Number(sessSummary.deviations)
    : null;

  return {
    course: {
      id: courseId,
      patient_id: patientId,
      patient_name: ptName,
      protocol_name: course.protocol_id || '',
      protocol_id: course.protocol_id,
      modality: course.modality_slug || '',
      target_site: course.target_region || '',
      total_sessions: course.planned_sessions_total ?? logs.length,
      completed_sessions: course.sessions_delivered ?? logs.length,
      adherence_pct: adherencePct,
      current_week: null,
      total_weeks: null,
      started_at: course.started_at,
      status: course.status,
      evidence_grade: course.evidence_grade,
      review_required: course.review_required,
    },
    sessions,
    summary: {
      signed_count: sessions.filter((x) => x.signed).length,
      delivered_count: sessions.length,
    },
    deviations: [],
    deviations_count: deviationsNote,
    interrupted_count: sessSummary?.interrupted ?? null,
    outcomes: {
      scale: outcomeParsed.scale,
      scores: outcomeParsed.scores,
      outcome_template_id: outcomeParsed.template_id || '',
      rule_note: outcomeParsed.ruleNote,
      responder_backend_flag: outcomeParsed.responderFlag,
      has_summaries: outcomeParsed.summariesCount > 0,
      all_summaries: outcomeParsed.all_series || [],
      pick_series: outcomeParsed.pickSeries,
    },
    ae_summary: aeSummary,
    audit_items: Array.isArray(auditResp?.items) ? auditResp.items : [],
    sess_summary: sessSummary,
    meta: {
      last_session_at: sessSummary?.last_session_at || null,
      is_demo: !!sessSummary?.is_demo,
      lite,
    },
  };
}

async function _pickCourseForPatient(patientId) {
  const courses = await api.listCourses({ patient_id: patientId }).catch(() => null);
  const items = Array.isArray(courses?.items) ? courses.items : (Array.isArray(courses) ? courses : []);
  const active = items.find((c) => String(c.status || '').toLowerCase() === 'active')
    || items.find((c) => String(c.status || '').toLowerCase() === 'paused')
    || items[0];
  return active || null;
}

async function _loadDetailFromApi(pid, prefetchedCourse = null) {
  const course = prefetchedCourse || (await _pickCourseForPatient(pid));
  if (!course) return null;
  const pname = '';
  return _hydrateCourseDetail(course, pid, pname);
}

async function _loadClinicRowsFromApi(patientItemsForNames = null) {
  const coursesResp = await api.listCourses().catch(() => ({ items: [] }));
  const items = Array.isArray(coursesResp?.items) ? coursesResp.items : [];
  const preferred = items.filter((c) => {
    const st = String(c.status || '').toLowerCase();
    return st === 'active' || st === 'paused';
  });
  const pool = preferred.length ? preferred : items;
  const byPatient = new Map();
  for (const c of pool) {
    if (!c.patient_id) continue;
    const prev = byPatient.get(c.patient_id);
    const st = String(c.status || '').toLowerCase();
    if (!prev) {
      byPatient.set(c.patient_id, c);
      continue;
    }
    const prevSt = String(prev.status || '').toLowerCase();
    if (st === 'active' && prevSt !== 'active') byPatient.set(c.patient_id, c);
  }
  const pItems = patientItemsForNames || (await api.listPatients({ limit: 300 }).catch(() => ({ items: [] })))?.items || [];
  const nameById = new Map(pItems.map((p) => [p.id, `${p.first_name || ''} ${p.last_name || ''}`.trim()]));

  const rows = [];
  const courseIds = [];
  for (const c of byPatient.values()) {
    courseIds.push(c.id);
    const pname = nameById.get(c.patient_id) || '';
    const detail = await _hydrateCourseDetail(c, c.patient_id, pname, { lite: true }).catch(() => null);
    if (detail) rows.push(_buildClinicRow(detail));
  }
  return { rows, courseIds };
}

/** Merge batch SIGN status into clinic rows (one API call, no per-session N+1). */
function _mergeBatchSignIntoRows(rows, batchResp) {
  const items = Array.isArray(batchResp?.items) ? batchResp.items : [];
  const byCourse = new Map();
  for (const it of items) {
    const cid = it.course_id;
    if (!cid) continue;
    if (!byCourse.has(cid)) {
      byCourse.set(cid, { signed: 0, pending: 0, unknown: 0, total: 0 });
    }
    const agg = byCourse.get(cid);
    agg.total += 1;
    const ss = String(it.sign_status || '').toLowerCase();
    if (ss === 'signed') agg.signed += 1;
    else if (ss === 'pending') agg.pending += 1;
    else agg.unknown += 1;
  }
  return rows.map((r) => {
    const agg = byCourse.get(r.course_id);
    if (!agg) {
      return {
        ...r,
        signoff_unknown: true,
        sign_batch_unavailable: false,
        sign_batch_partial: false,
      };
    }
    const sessionTotal = Number(r.completed) || agg.total;
    const partial = agg.total < sessionTotal;
    return {
      ...r,
      signed_count: agg.signed,
      unsigned_count: agg.pending + agg.unknown,
      signoff_unknown: false,
      sign_batch_unavailable: false,
      sign_batch_partial: partial,
    };
  });
}

function _mergeBatchUnavailable(rows) {
  return rows.map((r) => ({
    ...r,
    signoff_unknown: true,
    sign_batch_unavailable: true,
    sign_batch_partial: false,
  }));
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
      <td style="padding:10px;text-align:center;border-bottom:1px solid var(--border)">${_signoffPill(r.signed_count, r.unsigned_count, {
    loading: r.sign_loading,
    unknown: r.signoff_unknown,
    unavailable: r.sign_batch_unavailable,
    partial: r.sign_batch_partial,
  })}</td>
    </tr>`;
  }).join('');

  return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:14px;overflow:auto">
    <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:820px" aria-label="Clinic treatment session summary">
      <thead><tr>
        ${th('patient_name', 'Patient')}
        ${th('course_label', 'Active course')}
        ${th('completed', 'Sessions', 'center')}
        ${th('adherence_pct', 'Plan completion', 'center')}
        ${th('last_session_at', 'Last session')}
        ${th('outcome_trend', 'Outcome plot', 'center')}
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
  return `<svg width="56" height="56" viewBox="0 0 56 56" aria-label="Planned session completion ${n}%">
    <circle cx="28" cy="28" r="${r}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="6"/>
    <circle cx="28" cy="28" r="${r}" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round"
      stroke-dasharray="${dash} ${c - dash}" transform="rotate(-90 28 28)"/>
    <text x="28" y="32" text-anchor="middle" font-size="11" font-weight="600" fill="var(--text-primary)">${n}%</text>
  </svg>`;
}

function _renderCourseHeader(course, summary) {
  const color = _adherenceColor(course.adherence_pct);
  const ring = Number.isFinite(Number(course.adherence_pct)) ? _ringSvg(course.adherence_pct, color) : '';
  const total = course.total_sessions;
  const completed = course.completed_sessions;
  const signed = summary.signed_count;
  const delivered = summary.delivered_count;
  const demoTag = course._demo_fixture ? `<span class="pill pill-pending" style="margin-left:8px">Demo sample</span>` : '';
  return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:14px;padding:16px 18px;display:flex;gap:18px;align-items:center;flex-wrap:wrap">
    ${ring ? `<div style="flex:0 0 auto">${ring}</div>` : `<div style="flex:0 0 auto;font-size:11px;color:var(--text-tertiary);max-width:100px">No planned total — completion % not computed</div>`}
    <div style="flex:1;min-width:240px">
      <div style="font-weight:600;font-size:14px;margin-bottom:4px">${esc(course.protocol_name || 'Course')} ${demoTag}</div>
      <div style="font-size:12px;color:var(--text-secondary);line-height:1.5">
        ${esc(course.modality || '—')} · ${esc(course.target_site || '—')} · started ${esc(_fmtDate(course.started_at))}
      </div>
      <div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">
        ${esc(completed)}/${esc(total)} sessions logged vs plan · protocol ${esc(course.protocol_id || '—')}
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:6px;font-size:12px;color:var(--text-secondary);min-width:160px">
      <div>Sign-off recorded: <strong style="color:var(--text-primary)">${esc(signed)}/${esc(delivered)}</strong></div>
      <div>Course status: <strong style="color:var(--text-primary)">${esc(course.status || '—')}</strong></div>
    </div>
  </div>`;
}

function _renderSignoffQueue(unsigned) {
  if (!Array.isArray(unsigned) || !unsigned.length) {
    return `<div style="margin-top:14px;padding:14px;border:1px solid var(--border);background:rgba(255,255,255,.02);border-radius:12px;font-size:12px;color:var(--text-secondary)">
      <strong style="color:var(--text-primary)">No pending sign-offs in this view.</strong> Either sign-off events exist for each delivered session row, or sign-off state could not be loaded — verify session events in the source record. This does not certify clinical completeness.
    </div>`;
  }
  const list = unsigned.map((s) => `<li style="padding:8px 10px;border-bottom:1px solid var(--border);font-size:12px;display:flex;justify-content:space-between;gap:10px">
    <span><strong>Session ${esc(s.session_number || '—')}</strong> · ${esc(_fmtDateTime(s.scheduled_at))}</span>
    <span style="color:var(--text-tertiary)">${esc(s.modality || '')}</span>
  </li>`).join('');
  return `<div style="margin-top:14px;background:var(--bg-card);border:1px solid rgba(245,158,11,0.30);border-radius:12px;overflow:hidden">
    <div style="padding:12px 14px;display:flex;justify-content:space-between;align-items:center;gap:10px;border-bottom:1px solid var(--border);background:rgba(245,158,11,0.06)">
      <div style="font-weight:600;font-size:13px"><span style="color:var(--amber)">${unsigned.length}</span> delivered session${unsigned.length === 1 ? '' : 's'} without sign-off event</div>
      <button type="button" class="btn btn-primary btn-sm" data-action="sign-all" style="min-height:44px">Record sign-off…</button>
    </div>
    <ul style="list-style:none;margin:0;padding:0">${list}</ul>
    <div style="padding:10px 14px;font-size:11px;color:var(--text-tertiary);line-height:1.45">Sign-off writes a clinician signature event to each session — requires clinician review per clinic protocol; not autonomous approval.</div>
  </div>`;
}

function _renderDeviationPanel(deviations, deviationsCount, interruptedCount) {
  const hasCount = deviationsCount != null && deviationsCount > 0;
  if ((!Array.isArray(deviations) || !deviations.length) && !hasCount) {
    return `<div style="margin-top:14px;padding:14px;border:1px solid var(--border);background:rgba(255,255,255,.02);border-radius:12px;font-size:12px;color:var(--text-secondary)">
      <strong style="color:var(--text-primary)">Protocol deviation signals.</strong>
      ${interruptedCount != null && interruptedCount > 0
    ? ` Sessions with interruptions logged: <strong>${interruptedCount}</strong>. Requires clinician review — follow clinic protocol.`
    : ' No interruption/deviation counters reported for this course in the session summary API, or counts are zero. Absence here does not prove zero deviations elsewhere.'}
    </div>`;
  }
  if (hasCount && (!Array.isArray(deviations) || !deviations.length)) {
    return `<div style="margin-top:14px;padding:14px;border:1px solid rgba(245,158,11,0.28);background:rgba(245,158,11,0.06);border-radius:12px;font-size:12px;color:var(--text-secondary)">
      <strong style="color:var(--amber)">Deviation/interruption signals:</strong> summary reports ${deviationsCount} session row(s) with deviation flags and ${interruptedCount != null ? `${interruptedCount} with interruptions` : 'unknown interruptions'}. Open Course Detail or source records for parameters — requires clinician review.
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
      Parameter deltas / deviations (source-specific)
    </div>
    <ul style="list-style:none;margin:0;padding:0">${rows}</ul>
  </div>`;
}

function _renderSparkline(scores, scaleName, ruleNote) {
  if (!Array.isArray(scores) || scores.length < 2) {
    return `<div style="margin-top:14px;padding:14px;background:var(--bg-card);border:1px solid var(--border);border-radius:12px">
      <div style="font-weight:600;font-size:13px;margin-bottom:6px">Outcome series — ${esc(scaleName || '—')}</div>
      <div style="font-size:12px;color:var(--text-tertiary);line-height:1.5">${scores?.length === 1 ? 'Only one numeric point — trajectory not plotted.' : 'Not enough outcome measurements linked to this course to plot.'} Outcome analytics may be unavailable or not configured.</div>
    </div>`;
  }
  const w = 480;
  const h = 80;
  const pad = 8;
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const span = Math.max(1e-6, max - min);
  const step = (w - pad * 2) / (scores.length - 1);
  const pts = scores.map((s, i) => {
    const x = pad + i * step;
    const y = pad + (h - pad * 2) * (1 - (s - min) / span);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const first = scores[0];
  const last = scores[scores.length - 1];
  const stroke = 'var(--text-secondary)';
  const hypo = last < first
    ? 'Last point is lower than first on this scale (direction depends on scale polarity). Requires clinician interpretation — not causal.'
    : last > first
      ? 'Last point is higher than first on this scale (direction depends on scale polarity). Requires clinician interpretation — not causal.'
      : 'Little change between first and last points.';
  return `<div style="margin-top:14px;padding:14px;background:var(--bg-card);border:1px solid var(--border);border-radius:12px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:8px;flex-wrap:wrap">
      <div style="font-weight:600;font-size:13px">Outcome series — ${esc(scaleName || '—')}</div>
      <div style="font-size:11px;color:var(--text-tertiary);font-variant-numeric:tabular-nums;max-width:280px;text-align:right">${esc(first)} → ${esc(last)} (${scores.length} points)</div>
    </div>
    <div style="font-size:11px;color:var(--text-secondary);margin-bottom:8px;line-height:1.45">${esc(ruleNote || '')}</div>
    <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:8px">${esc(hypo)}</div>
    <svg viewBox="0 0 ${w} ${h}" style="width:100%;height:auto;display:block" aria-label="Outcome series plot">
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
  const signed = _signedIcon(s.signed, s.signoff_unknown);
  const view = expanded ? 'Hide' : 'View';
  const inline = expanded ? `<div style="margin-top:8px;padding:10px 12px;background:rgba(255,255,255,.02);border-radius:10px;font-size:12px;color:var(--text-secondary);line-height:1.5">
      <div><strong style="color:var(--text-primary)">Delivered parameters</strong>: ${esc(s.intensity_label || '—')} · ${esc(s.duration_minutes ?? '—')} min · ${esc(s.modality || '—')}</div>
      <div><strong style="color:var(--text-primary)">Tolerance / notes</strong>: ${esc(s.telemetry_summary || '—')}</div>
      <div><strong style="color:var(--text-primary)">Post-session notes</strong>: ${esc(s.post_session_notes || '—')}</div>
      ${s.ae_log ? `<div style="color:var(--red)"><strong>Session AE field</strong>: ${esc(s.ae_log)} <span style="color:var(--text-tertiary)">(requires clinician review per clinic protocol)</span></div>` : ''}
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
        <button type="button" class="btn btn-ghost btn-sm" data-action="toggle-session" data-session-id="${esc(s.id)}" style="min-height:44px">${view}</button>
      </div>
    </div>
    ${inline}
  </li>`;
}

function _renderTimeline(sessions, expandedId) {
  if (!Array.isArray(sessions) || !sessions.length) return _emptySessionsCard();
  return `<div style="margin-top:14px;background:var(--bg-card);border:1px solid var(--border);border-radius:12px;overflow:hidden">
    <div style="padding:10px 14px;border-bottom:1px solid var(--border);font-weight:600;font-size:13px">Delivered session rows (course log)</div>
    <div style="padding:8px 14px;font-size:11px;color:var(--text-tertiary);line-height:1.45">List completeness depends on sessions logged to this course in the backend — not proof of all treatments performed.</div>
    <ul style="list-style:none;margin:0;padding:0">${sessions.map((s) => _renderSessionRow(s, s.id === expandedId)).join('')}</ul>
  </div>`;
}

function _renderAeBanner(aeSummary) {
  if (!aeSummary || aeSummary.total === 0) {
    return `<div style="margin-top:14px;padding:14px;border:1px dashed var(--border);border-radius:12px;font-size:12px;color:var(--text-secondary);line-height:1.5">
      <strong style="color:var(--text-primary)">Adverse events (course-linked).</strong> No adverse-event rows returned for this course in the API response — does not prove absence of adverse events. Requires clinician review if symptoms or events were reported outside this feed.
    </div>`;
  }
  const unresolved = aeSummary.unresolved != null ? aeSummary.unresolved : '—';
  return `<div style="margin-top:14px;padding:14px;border:1px solid rgba(255,107,107,0.28);background:rgba(255,107,107,0.06);border-radius:12px;font-size:12px;color:var(--text-secondary);line-height:1.5">
    <strong style="color:var(--text-primary)">Adverse events on file:</strong> ${esc(aeSummary.total)} total; ${esc(unresolved)} unresolved in source records. <strong style="color:var(--red)">Requires clinician review per clinic protocol.</strong> This UI does not notify staff unless your backend sends notifications separately.
  </div>`;
}

function _renderAuditTeaser(items, usingDemoFixture) {
  const rows = (Array.isArray(items) ? items : []).slice(0, 6);
  if (!rows.length) {
    return `<div style="margin-top:14px;padding:12px;border:1px solid var(--border);border-radius:12px;font-size:12px;color:var(--text-secondary)">
      <strong style="color:var(--text-primary)">Audit trail.</strong> No audit events returned for this course, or the endpoint was unavailable. Use Course Detail for the full timeline when available.
    </div>`;
  }
  const demoNote = usingDemoFixture ? '<span class="pill pill-pending" style="margin-left:6px">Demo / sample</span>' : '';
  const body = rows.map((e) => `<li style="padding:6px 0;border-bottom:1px solid var(--border);font-size:11px;color:var(--text-secondary)">
    <span style="color:var(--text-tertiary)">${esc(_fmtDateTime(e.created_at))}</span> · ${esc(e.action || '—')} · ${esc((e.note || '').slice(0, 80))}${(e.note || '').length > 80 ? '…' : ''}
  </li>`).join('');
  return `<div style="margin-top:14px;padding:12px 14px;border:1px solid var(--border);border-radius:12px;background:var(--bg-card)">
    <div style="font-weight:600;font-size:13px;margin-bottom:8px">Recent audit events ${demoNote}</div>
    <ul style="list-style:none;margin:0;padding:0;max-height:180px;overflow:auto">${body}</ul>
  </div>`;
}

function _renderLinkedBar(patientId, courseId, navigate) {
  const pid = esc(patientId);
  const cid = esc(courseId);
  return `<div style="margin-top:14px;padding:12px 14px;border:1px solid var(--border);border-radius:12px;background:rgba(155,127,255,0.04)">
    <div style="font-weight:600;font-size:13px;margin-bottom:10px">Linked modules (opens in app)</div>
    <div style="display:flex;flex-wrap:wrap;gap:8px">
      <button type="button" class="btn btn-ghost btn-sm" data-nav="patient-profile" style="min-height:40px">Patient profile</button>
      <button type="button" class="btn btn-ghost btn-sm" data-nav="course-detail" style="min-height:40px">Course detail</button>
      <button type="button" class="btn btn-ghost btn-sm" data-nav="assessments-v2" style="min-height:40px">Assessments</button>
      <button type="button" class="btn btn-ghost btn-sm" data-nav="qeeg-launcher" style="min-height:40px">qEEG</button>
      <button type="button" class="btn btn-ghost btn-sm" data-nav="mri-analysis" style="min-height:40px">MRI</button>
      <button type="button" class="btn btn-ghost btn-sm" data-nav="biomarkers" style="min-height:40px">Biomarkers</button>
      <button type="button" class="btn btn-ghost btn-sm" data-nav="documents-hub" style="min-height:40px">Documents</button>
      <button type="button" class="btn btn-ghost btn-sm" data-nav="voice-analyzer" style="min-height:40px">Voice</button>
      <button type="button" class="btn btn-ghost btn-sm" data-nav="video-assessments" style="min-height:40px">Video</button>
      <button type="button" class="btn btn-ghost btn-sm" data-nav="text-analyzer" style="min-height:40px">Text</button>
      <button type="button" class="btn btn-ghost btn-sm" data-nav="deeptwin" style="min-height:40px">DeepTwin</button>
      <button type="button" class="btn btn-ghost btn-sm" data-nav="brain-map-planner" style="min-height:40px">Brain Map Planner</button>
      <button type="button" class="btn btn-ghost btn-sm" data-nav="risk-analyzer" style="min-height:40px">Risk Analyzer</button>
      <button type="button" class="btn btn-ghost btn-sm" data-nav="medication-analyzer" style="min-height:40px">Medication Analyzer</button>
      <button type="button" class="btn btn-ghost btn-sm" data-nav="protocol-studio" style="min-height:40px">Protocol Studio</button>
      <button type="button" class="btn btn-ghost btn-sm" data-nav="handbooks" style="min-height:40px">Handbooks</button>
      <button type="button" class="btn btn-ghost btn-sm" data-nav="scheduling-hub" style="min-height:40px">Schedule</button>
      <button type="button" class="btn btn-ghost btn-sm" data-nav="clinician-inbox" style="min-height:40px">Inbox</button>
      <button type="button" class="btn btn-ghost btn-sm" data-nav="session-execution" style="min-height:40px">Live session</button>
    </div>
    <div style="font-size:11px;color:var(--text-tertiary);margin-top:10px;line-height:1.45">Context-only navigation — does not change protocols or approve treatment. Course: <code style="font-size:10px">${cid}</code> · Patient: <code style="font-size:10px">${pid}</code></div>
  </div>`;
}

function _wireLinkedBar(body, patientId, courseId, navigate) {
  if (!body || !navigate) return;
  const map = {
    'patient-profile': () => { window._selectedPatientId = patientId; window._profilePatientId = patientId; navigate('patient-profile', { id: patientId }); },
    'course-detail': () => { window._selectedPatientId = patientId; window._selectedCourseId = courseId; navigate('course-detail'); },
    'assessments-v2': () => { window._selectedPatientId = patientId; navigate('assessments-v2', { id: patientId }); },
    'qeeg-launcher': () => { window._selectedPatientId = patientId; navigate('qeeg-launcher', { id: patientId }); },
    'mri-analysis': () => { window._selectedPatientId = patientId; navigate('mri-analysis', { id: patientId }); },
    'biomarkers': () => { window._selectedPatientId = patientId; navigate('biomarkers', { id: patientId }); },
    'documents-hub': () => { window._selectedPatientId = patientId; navigate('documents-hub', { id: patientId }); },
    'voice-analyzer': () => { window._selectedPatientId = patientId; navigate('voice-analyzer', { id: patientId }); },
    'video-assessments': () => { window._selectedPatientId = patientId; navigate('video-assessments', { id: patientId }); },
    'text-analyzer': () => { window._selectedPatientId = patientId; navigate('text-analyzer', { id: patientId }); },
    'deeptwin': () => { window._selectedPatientId = patientId; navigate('deeptwin', { id: patientId }); },
    'brain-map-planner': () => { window._selectedPatientId = patientId; navigate('brain-map-planner', { id: patientId }); },
    'risk-analyzer': () => { window._selectedPatientId = patientId; navigate('risk-analyzer', { id: patientId }); },
    'medication-analyzer': () => { window._selectedPatientId = patientId; navigate('medication-analyzer', { id: patientId }); },
    'protocol-studio': () => navigate('protocol-studio'),
    'handbooks': () => { window._selectedPatientId = patientId; navigate('handbooks', { id: patientId }); },
    'scheduling-hub': () => { window._selectedPatientId = patientId; navigate('scheduling-hub', { id: patientId }); },
    'clinician-inbox': () => navigate('clinician-inbox'),
    'session-execution': () => { window._selectedPatientId = patientId; window._selectedCourseId = courseId; navigate('session-execution'); },
  };
  body.querySelectorAll('[data-nav]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const k = btn.getAttribute('data-nav');
      try { (map[k] || (() => {}))(); } catch (_) {}
    });
  });
}

function _summarizeOutcomeScores(scores) {
  if (!Array.isArray(scores) || scores.length < 2) return 'flat';
  const first = scores[0];
  const last = scores[scores.length - 1];
  if (last < first - 1e-9) return 'down';
  if (last > first + 1e-9) return 'up';
  return 'flat';
}

function _outcomeScoresForTrend(detail) {
  const all = detail?.outcomes?.all_summaries;
  if (Array.isArray(all) && all.length) {
    const withData = all.find((x) => Array.isArray(x.scores) && x.scores.length >= 2);
    if (withData) return withData.scores;
  }
  return detail?.outcomes?.scores;
}

function _outcomeTrendForClinic(detail) {
  const scores = _outcomeScoresForTrend(detail);
  const dir = _summarizeOutcomeScores(scores);
  if (dir === 'down') return 'up';
  if (dir === 'up') return 'down';
  return 'flat';
}

function _buildClinicRow(detail) {
  const course = detail.course || {};
  const sessions = detail.sessions || [];
  const lite = !!detail.meta?.lite;
  const signed = sessions.filter((s) => s.signed).length;
  const unsigned = sessions.length - signed;
  const last = sessions.length ? sessions[sessions.length - 1].scheduled_at : null;
  return {
    patient_id: course.patient_id,
    patient_name: course.patient_name,
    course_id: course.id,
    course_label: `${course.modality || ''} · ${course.protocol_name || course.protocol_id || ''}`.trim() || '—',
    completed: course.completed_sessions ?? sessions.length,
    prescribed: course.total_sessions ?? sessions.length,
    adherence_pct: course.adherence_pct,
    last_session_at: last,
    outcome_trend: _outcomeTrendForClinic(detail),
    signed_count: lite ? null : signed,
    unsigned_count: lite ? null : unsigned,
    signoff_unknown: lite,
    sign_batch_unavailable: false,
    sign_batch_partial: false,
    sign_loading: false,
  };
}

export async function pgTreatmentSessionsAnalyzer(setTopbar, navigate) {
  try {
    setTopbar({
      title: 'Treatment Sessions Analyzer',
      subtitle: 'Clinician-reviewed session records · decision support only',
    });
  } catch {
    try { setTopbar('Treatment Sessions Analyzer', 'Clinician-reviewed session analytics'); } catch {}
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
  let actorRole = null;
  /** @type {string|null} template_id for outcome sparkline when multiple scales exist */
  let selectedOutcomeTemplateId = null;

  el.innerHTML = `
    <div class="ds-treatment-sessions-analyzer-shell" style="max-width:1100px;margin:0 auto;padding:16px 20px 48px">
      <div id="ts-demo-banner"></div>
      <div style="padding:12px 14px;border-radius:12px;border:1px solid rgba(155,127,255,0.28);background:rgba(155,127,255,0.06);margin-bottom:14px;font-size:12px;line-height:1.45;color:var(--text-secondary)">
        <strong style="color:var(--text-primary)">Clinician-reviewed decision support only.</strong>
        Surfaces treatment-course logs, outcome series, and sign-off state from connected records. Not autonomous treatment approval, protocol optimisation, dosing advice, or emergency triage. Follow clinic governance; interpret outcomes with source context.
      </div>
      <div id="ts-breadcrumb" style="display:flex;align-items:center;gap:10px;margin-bottom:12px;font-size:12px;flex-wrap:wrap"></div>
      <div id="ts-toolbar" style="margin-bottom:12px"></div>
      <div id="ts-body"></div>
    </div>`;

  const $ = (id) => document.getElementById(id);

  function _syncDemoBanner() {
    const slot = $('ts-demo-banner');
    if (!slot) return;
    slot.innerHTML = usingFixtures && isDemoSession() ? DEMO_FIXTURE_BANNER_HTML : '';
  }

  async function _resolveActorRole() {
    try {
      const me = await api.me();
      actorRole = me?.role || me?.user?.role || null;
    } catch {
      actorRole = null;
    }
  }

  function setBreadcrumb() {
    const bc = $('ts-breadcrumb');
    if (!bc) return;
    if (view === 'clinic') {
      bc.innerHTML = `<span style="font-weight:600">Treatment sessions by patient</span>`;
    } else {
      bc.innerHTML = `<button type="button" class="btn btn-ghost btn-sm" id="ts-back" style="min-height:44px">← Back to clinic</button>
        <span style="color:var(--text-tertiary)">/</span>
        <span style="font-weight:600">${esc(activePatientName || 'Patient')}</span>`;
      $('ts-back')?.addEventListener('click', () => { view = 'clinic'; expandedSessionId = null; render(); });
    }
  }

  function _renderToolbarPatientSelect(patients) {
    const tb = $('ts-toolbar');
    if (!tb) return;
    const opts = (patients || []).map((p) =>
      `<option value="${esc(p.id)}" ${p.id === activePatientId ? 'selected' : ''}>${esc(p.name || p.id)}</option>`).join('');
    tb.innerHTML = `
      <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center">
        <label for="ts-patient-select" style="font-size:12px;color:var(--text-secondary)">Select patient</label>
        <select id="ts-patient-select" class="btn btn-ghost btn-sm" style="min-height:44px;max-width:280px;border:1px solid var(--border);border-radius:8px;padding:8px 10px;background:var(--bg-card);color:var(--text-primary)">
          <option value="">— Choose patient —</option>
          ${opts}
        </select>
        <button type="button" class="btn btn-secondary btn-sm" id="ts-open-patient" style="min-height:44px" ${!activePatientId ? 'disabled' : ''}>Open profile</button>
        <button type="button" class="btn btn-ghost btn-sm" id="ts-refresh" style="min-height:44px">Refresh</button>
        <span style="font-size:11px;color:var(--text-tertiary);max-width:420px;line-height:1.4">Patient list from clinic directory API. Switching only changes selection — it does not alter protocols.</span>
      </div>`;
    tb.querySelector('#ts-patient-select')?.addEventListener('change', (ev) => {
      const v = ev.target.value;
      if (!v) return;
      activePatientId = v;
      const hit = (patients || []).find((p) => p.id === v);
      activePatientName = hit?.name || v;
      view = 'patient';
      expandedSessionId = null;
      render();
    });
    tb.querySelector('#ts-open-patient')?.addEventListener('click', () => {
      if (!activePatientId) return;
      window._selectedPatientId = activePatientId;
      window._profilePatientId = activePatientId;
      try { navigate?.('patient-profile', { id: activePatientId }); } catch {}
    });
    tb.querySelector('#ts-refresh')?.addEventListener('click', () => { render(); });
  }

  function _useFixtureClinic() {
    const fx = ANALYZER_DEMO_FIXTURES.treatmentSessions;
    if (!fx) return null;
    const rows = fx.patients.map((pid) => {
      const d = fx.detail(pid);
      if (d && d.course) d.course._demo_fixture = true;
      return _buildClinicRow(d);
    });
    return rows;
  }

  function _useFixtureDetail(pid) {
    const fx = ANALYZER_DEMO_FIXTURES.treatmentSessions;
    if (!fx) return null;
    const d = fx.detail(pid);
    if (d && d.course) d.course._demo_fixture = true;
    return d;
  }

  function _paintClinicTable(patients, loadingSign) {
    const body = $('ts-body');
    if (!body) return;
    let rows = (clinicCache || []).map((r) => ({ ...r, sign_loading: !!loadingSign }));
    clinicCache = rows;
    body.innerHTML = `
      <div style="margin-bottom:12px;font-size:11px;color:var(--text-tertiary);line-height:1.45">
        <strong style="color:var(--text-primary)">Data availability.</strong> Rows aggregate delivered session logs per active/paused course. “Plan completion” compares logged deliveries to planned totals when present — not adherence from wearables unless separately integrated.
        Sign-off column uses batch SIGN events when available — not inferred from schedule alone.
      </div>
      <div style="margin-bottom:10px;display:flex;flex-wrap:wrap;gap:10px;align-items:center">
        <button type="button" class="btn btn-ghost btn-sm" id="ts-refresh-sign" style="min-height:40px">Refresh sign-off status</button>
        <span style="font-size:11px;color:var(--text-tertiary)">Reloads delivered-session sign status from the API without per-session round trips.</span>
      </div>
      ${_renderClinicTable(clinicCache, sortKey, sortDir)}`;
    _renderToolbarPatientSelect(patients);
    body.querySelector('#ts-refresh-sign')?.addEventListener('click', () => { loadClinic(); });
    body.querySelectorAll('[data-sort-key]').forEach((th) => {
      th.addEventListener('click', () => {
        const k = th.getAttribute('data-sort-key');
        if (k === sortKey) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        else { sortKey = k; sortDir = 'desc'; }
        body.innerHTML = `
          <div style="margin-bottom:12px;font-size:11px;color:var(--text-tertiary);line-height:1.45">
            <strong style="color:var(--text-primary)">Data availability.</strong> Rows aggregate delivered session logs per active/paused course.
          </div>
          <div style="margin-bottom:10px;display:flex;flex-wrap:wrap;gap:10px;align-items:center">
            <button type="button" class="btn btn-ghost btn-sm" id="ts-refresh-sign" style="min-height:40px">Refresh sign-off status</button>
          </div>
          ${_renderClinicTable(clinicCache, sortKey, sortDir)}`;
        body.querySelector('#ts-refresh-sign')?.addEventListener('click', () => { loadClinic(); });
        wireClinicTable();
      });
    });
    wireClinicTable();
  }

  async function loadClinic() {
    const body = $('ts-body');
    if (!body) return;
    if (actorRole === 'patient') {
      body.innerHTML = _restrictedCard();
      return;
    }
    body.innerHTML = `<div style="padding:18px;background:var(--bg-card);border:1px solid var(--border);border-radius:14px">
      ${_skeletonChips(6)}
    </div>`;
    let patients = [];
    try {
      const pr = await api.listPatients({ limit: 200 }).catch(() => ({ items: [] }));
      patients = pr?.items || (Array.isArray(pr) ? pr : []);
    } catch { patients = []; }

    let clinicRows = [];
    let courseIdsForBatch = [];
    try {
      const loaded = await _loadClinicRowsFromApi(patients);
      clinicRows = loaded.rows || [];
      courseIdsForBatch = loaded.courseIds || [];
      if (!clinicRows.length && isDemoSession()) {
        clinicRows = _useFixtureClinic();
        usingFixtures = true;
      } else {
        usingFixtures = false;
      }
    } catch (e) {
      if (isDemoSession()) {
        clinicRows = _useFixtureClinic();
        courseIdsForBatch = [];
        usingFixtures = true;
      } else {
        const msg = (e && e.message) || String(e);
        body.innerHTML = _errorCard(msg);
        body.querySelector('[data-action="retry"]')?.addEventListener('click', loadClinic);
        return;
      }
    }

    clinicCache = clinicRows.map((r) => ({ ...r, sign_loading: !usingFixtures && clinicRows.length > 0 }));
    _syncDemoBanner();
    _paintClinicTable(patients, !usingFixtures && clinicRows.length > 0);

    if (!usingFixtures && courseIdsForBatch.length) {
      try {
        const batch = await api.getTreatmentSessionSignStatusBatch({ course_ids: courseIdsForBatch });
        clinicCache = _mergeBatchSignIntoRows(clinicRows, batch).map((r) => ({ ...r, sign_loading: false }));
      } catch {
        clinicCache = _mergeBatchUnavailable(clinicRows).map((r) => ({ ...r, sign_loading: false }));
      }
      _paintClinicTable(patients, false);
    }
  }

  function wireClinicTable() {
    const body = $('ts-body');
    body?.querySelector('#ts-go-courses')?.addEventListener('click', () => {
      try { navigate?.('protocol-studio'); } catch {}
    });
    body?.querySelector('#ts-go-schedule')?.addEventListener('click', () => {
      try { navigate?.('scheduling-hub'); } catch {}
    });
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

  function _renderOutcomePicker(outcomes) {
    const list = Array.isArray(outcomes.all_summaries) ? outcomes.all_summaries : [];
    const choices = list.filter((x) => x.scores?.length >= 2);
    if (choices.length <= 1) return '';
    const cur = selectedOutcomeTemplateId || outcomes.outcome_template_id || choices[0].template_id;
    const opts = choices.map((c) =>
      `<option value="${esc(c.template_id)}" ${c.template_id === cur ? 'selected' : ''}>${esc(c.template_title)} (${c.scores.length} points)</option>`,
    ).join('');
    return `<div style="margin-top:10px;display:flex;flex-wrap:wrap;align-items:center;gap:8px">
      <label for="ts-outcome-scale" style="font-size:12px;color:var(--text-secondary)">Outcome scale</label>
      <select id="ts-outcome-scale" class="btn btn-ghost btn-sm" style="min-height:40px;max-width:360px;border:1px solid var(--border);border-radius:8px;padding:6px 10px;background:var(--bg-card)">
        ${opts}
      </select>
      <span style="font-size:11px;color:var(--text-tertiary)">Switching only changes the plot — does not recompute data.</span>
    </div>`;
  }

  function _renderPatientDetail(detail, expandedId) {
    const course = detail.course || {};
    const sessions = detail.sessions || [];
    const summary = detail.summary || { signed_count: 0, delivered_count: sessions.length };
    const unsigned = sessions.filter((s) => !s.signed && !s.signoff_unknown);
    const deviations = detail.deviations || [];
    const outcomes = detail.outcomes || { scale: '—', scores: [], rule_note: '' };
    const pick = typeof outcomes.pick_series === 'function'
      ? outcomes.pick_series(selectedOutcomeTemplateId)
      : { scale: outcomes.scale, scores: outcomes.scores, ruleNote: outcomes.rule_note };
    const sparkScores = pick.scores || outcomes.scores || [];
    const sparkScale = pick.scale || outcomes.scale;
    const sparkRule = pick.ruleNote || outcomes.rule_note;
    const ae = detail.ae_summary;
    const auditItems = detail.audit_items || [];
    const dm = detail.meta || {};
    const governance = `
      <div style="margin-top:14px;padding:12px 14px;border:1px solid var(--border);border-radius:12px;font-size:12px;color:var(--text-secondary);line-height:1.5">
        <strong style="color:var(--text-primary)">Evidence / governance.</strong>
        Course evidence grade: <strong>${esc(course.evidence_grade || '—')}</strong>.
        ${course.review_required ? '<span style="color:var(--amber)">Review required flag set on course.</span>' : ''}
        Rules require clinic governance review where policy is not configured in this workspace.
      </div>`;
    const stale = dm.last_session_at
      ? `<div style="font-size:11px;color:var(--text-tertiary);margin-top:8px">Last session log timestamp from summary API: ${esc(_fmtDateTime(dm.last_session_at))}${dm.is_demo ? ' · Demo-tagged course in backend' : ''}</div>`
      : `<div style="font-size:11px;color:var(--amber);margin-top:8px">No last-session timestamp in summary — verify freshness in source systems.</div>`;
    return `${_renderCourseHeader(course, summary)}
    ${stale}
    ${_renderAeBanner(ae)}
    ${_renderSignoffQueue(unsigned)}
    ${_renderTimeline(sessions, expandedId)}
    ${_renderDeviationPanel(deviations, detail.deviations_count, detail.interrupted_count)}
    ${_renderOutcomePicker(outcomes)}
    ${_renderSparkline(sparkScores, sparkScale, sparkRule)}
    ${outcomes.responder_backend_flag != null ? `<div style="margin-top:8px;font-size:11px;color:var(--text-tertiary)">Backend responder heuristic flag (rule-based, not clinical fact): ${outcomes.responder_backend_flag ? 'true' : 'false'} — requires clinician interpretation.</div>` : ''}
    ${governance}
    ${_renderAuditTeaser(auditItems, !!course._demo_fixture)}
    ${_renderLinkedBar(course.patient_id, course.id, navigate)}`;
  }

  async function loadPatient() {
    const body = $('ts-body');
    if (!body || !activePatientId) return;
    if (actorRole === 'patient') {
      body.innerHTML = _restrictedCard();
      return;
    }
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
    activePatientName = detail.course?.patient_name || activePatientName;
    selectedOutcomeTemplateId = null;
    const alls = detail.outcomes?.all_summaries || [];
    const defaultPick = alls.find((x) => x.scores?.length >= 2) || alls[0];
    if (defaultPick?.template_id) selectedOutcomeTemplateId = defaultPick.template_id;
    _syncDemoBanner();
    body.innerHTML = _renderPatientDetail(detail, expandedSessionId);
    wirePatientDetail();
  }

  function wirePatientDetail() {
    const body = $('ts-body');
    if (!body) return;

    _wireLinkedBar(body, detailCache?.course?.patient_id, detailCache?.course?.id, navigate);

    body.querySelector('#ts-outcome-scale')?.addEventListener('change', (ev) => {
      selectedOutcomeTemplateId = ev.target.value || null;
      body.innerHTML = _renderPatientDetail(detailCache, expandedSessionId);
      wirePatientDetail();
    });

    body.querySelectorAll('[data-action="toggle-session"]').forEach((b) => {
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
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
      const ok = window.confirm(`Record clinician sign-off on ${unsigned.length} session${unsigned.length === 1 ? '' : 's'}? This writes SIGN events to the session record (not a protocol change).`);
      if (!ok) return;
      const old = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Signing…';
      try {
        if (!usingFixtures) {
          await Promise.all(unsigned.map((s) => api.signSession(s.id, {}).then(() => { s.signed = true; })));
        } else {
          unsigned.forEach((s) => { s.signed = true; });
        }
        if (detailCache.summary) {
          detailCache.summary.signed_count = (detailCache.sessions || []).filter((x) => x.signed).length;
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

  async function render() {
    await _resolveActorRole();
    setBreadcrumb();
    let patients = [];
    try {
      const pr = await api.listPatients({ limit: 200 }).catch(() => ({ items: [] }));
      patients = pr?.items || [];
    } catch { patients = []; }
    if (view === 'clinic') {
      $('ts-toolbar').innerHTML = '';
      loadClinic();
    } else {
      _renderToolbarPatientSelect(patients.map((p) => ({ id: p.id, name: `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.id })));
      loadPatient();
    }
  }

  render();
}

export default { pgTreatmentSessionsAnalyzer };

/** @internal exported for unit tests */
export {
  _parseOutcomeSummaries,
  _summarizeOutcomeScores,
  _completionPct,
  _mergeBatchSignIntoRows,
  _mergeBatchUnavailable,
};
