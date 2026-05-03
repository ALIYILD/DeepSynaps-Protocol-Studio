/**
 * Pure helpers for Assessments v2 (pgAssessmentsHub) — API row → queue UI shape.
 * Extracted for unit tests and stable clinical/deterministic mapping.
 */

/** @param {unknown} v */
function _num(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Map one AssessmentOut-like API record to the queue row shape used by pgAssessmentsHub.
 *
 * @param {Record<string, unknown>} a - API assessment object
 * @param {number} index - row index (for avatar colour rotation)
 * @param {{ interpretScore?: (id: string, score: number) => { severity?: string, label?: string } | null }} [scoringEngine]
 * @param {Array<{ id?: string, abbr?: string, max?: number }>} [registry]
 */
export function mapApiAssessmentToQueueRow(a, index, scoringEngine, registry) {
  const sid = String(a.scale_id || a.template_id || a.instrument || 'PHQ-9');
  const rawScore = a.score_numeric != null ? a.score_numeric : _num(a.score);
  const data = /** @type {Record<string, unknown>} */ (a.data && typeof a.data === 'object' ? a.data : {});
  const itemsRaw = data.items ?? a.items;
  let itemsArr = null;
  if (Array.isArray(itemsRaw)) {
    itemsArr = itemsRaw.map((x) => _num(x));
  } else if (itemsRaw && typeof itemsRaw === 'object') {
    itemsArr = Object.keys(itemsRaw)
      .sort((x, y) => Number(x) - Number(y))
      .map((k) => _num(itemsRaw[k]));
  }
  const item9 =
    Array.isArray(itemsArr) && itemsArr.length >= 9 ? itemsArr[8] ?? 0 : _num(a.item9) ?? 0;

  const reg = registry?.find((x) => x.id === sid || x.abbr === sid);
  const max = _num(a.max_score) ?? reg?.max ?? (sid.toUpperCase().includes('GAD') ? 21 : sid.toUpperCase().includes('PHQ') ? 27 : null);

  let sev = 'mod';
  let sevLabel = typeof a.severity_label === 'string' && a.severity_label ? a.severity_label : '—';
  const scoreForInterp = rawScore != null ? Number(rawScore) : null;
  if (scoreForInterp != null && scoringEngine?.interpretScore) {
    const interp = scoringEngine.interpretScore(sid, scoreForInterp);
    if (interp) {
      sev =
        ({ minimal: 'mild', mild: 'mild', moderate: 'mod', severe: 'mods', critical: 'sev' })[interp.severity] ||
        'mod';
      sevLabel = interp.label || sevLabel;
    }
  }

  const dueSrc = a.due_date || a.due_at;
  let overdue = !!a.overdue;
  let dueISO = '';
  if (dueSrc) {
    const d = new Date(String(dueSrc));
    if (!Number.isNaN(d.getTime())) {
      overdue = overdue || d < new Date();
      dueISO = d.toISOString();
    }
  }

  const st = String(a.status || '').toLowerCase();
  const reviewed = !!(a.reviewed_at || (typeof a.approved_status === 'string' && a.approved_status === 'approved'));

  let sendLabel = 'Open';
  if (st === 'draft' || st === 'in_progress' || st === 'assigned') sendLabel = 'Continue';
  else if ((st === 'completed' || st === 'submitted') && !reviewed) sendLabel = 'Review';
  else if (overdue) sendLabel = 'Resend';

  const patientName =
    typeof a.patient_name === 'string' && a.patient_name
      ? a.patient_name
      : typeof a.patient_display === 'string'
        ? a.patient_display
        : a.patient_id
          ? String(a.patient_id)
          : 'Patient';

  const pid = a.patient_id != null ? String(a.patient_id) : '';

  const redflag =
    !!a.red_flag ||
    !!(typeof a.escalated === 'boolean' && a.escalated) ||
    (sid.toUpperCase().includes('PHQ') && item9 != null && item9 >= 1);

  return {
    id: 'be-' + String(a.id ?? index),
    backendId: String(a.id ?? ''),
    patientId: pid,
    scaleId: sid,
    patient: patientName,
    mrn: typeof a.mrn === 'string' ? a.mrn : pid ? pid.slice(0, 8) : '—',
    avInit: patientName
      .split(/\s+/)
      .filter(Boolean)
      .map((x) => x[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'PT',
    avCls: ['a', 'b', 'c', 'd', 'e'][index % 5],
    dx: typeof a.diagnosis === 'string' ? a.diagnosis : typeof a.condition_name === 'string' ? a.condition_name : '—',
    inst: sid,
    instSub: typeof a.phase === 'string' ? a.phase : '',
    score: rawScore,
    max,
    item9,
    sev,
    sevLabel,
    trend: typeof a.trend_label === 'string' ? a.trend_label : st === 'completed' ? 'Completed' : 'In progress',
    trendCls: overdue ? 'up' : 'flat',
    sparkline: Array.isArray(a.sparkline) ? a.sparkline : [],
    due: dueSrc ? new Date(String(dueSrc)).toLocaleDateString() : '—',
    dueCls: overdue ? 'overdue' : 'soon',
    dueISO,
    overdue,
    mode: typeof a.delivery_mode === 'string' ? a.delivery_mode : '—',
    modeSub: typeof a.respondent_type === 'string' ? a.respondent_type : '',
    redflag,
    flagLabel: overdue ? 'OVERDUE' : null,
    flagCls: overdue ? 'amber' : null,
    sendLabel,
    status: a.status,
    reviewed,
    items: itemsArr,
    reviewedAt: typeof a.reviewed_at === 'string' ? a.reviewed_at : null,
    completedAt: typeof a.completed_at === 'string' ? a.completed_at : null,
    aiSummary: typeof a.ai_summary === 'string' ? a.ai_summary : null,
    aiModel: typeof a.ai_model === 'string' ? a.ai_model : null,
    aiConfidence: typeof a.ai_confidence === 'number' ? a.ai_confidence : null,
  };
}

/**
 * Resolve UUID/id for GET /assessments/{id} from a queue row.
 * @param {{ id?: string, backendId?: string }} row
 */
export function assessmentDetailIdFromRow(row) {
  if (row?.backendId) return row.backendId;
  const raw = String(row?.id || '');
  if (raw.startsWith('be-')) return raw.slice(3);
  return raw;
}
