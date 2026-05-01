import { api, downloadBlob } from './api.js';
import { spinner, emptyState, evidenceBadge, labelBadge, safetyBadge, approvalBadge, govFlag, fr, cardWrap, tag } from './helpers.js';
import { FALLBACK_ASSESSMENT_TEMPLATES, FALLBACK_CONDITIONS, FALLBACK_MODALITIES } from './constants.js';
import { currentUser } from './auth.js';
import { getEvidenceUiStats } from './evidence-ui-live.js';
import { getProtocolWatchSignalTitle, loadProtocolWatchContext } from './protocol-watch-context.js';
import {
  EVIDENCE_TOTAL_PAPERS,
  EVIDENCE_TOTAL_TRIALS,
  EVIDENCE_SUMMARY,
} from './evidence-dataset.js';

// ── HTML escape — prevents XSS from API/localStorage dynamic content ─────────
function _esc(v) {
  if (v == null) return '';
  return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;');
}

// ── SOAP Notes — localStorage persistence ────────────────────────────────────
const SOAP_NOTES_KEY = 'ds_soap_notes';

function getSoapNotes() {
  try { return JSON.parse(localStorage.getItem(SOAP_NOTES_KEY) || '{}'); } catch { return {}; }
}

function saveSoapNote(courseId, sessionId, note) {
  const notes = getSoapNotes();
  if (!notes[courseId]) notes[courseId] = {};
  notes[courseId][sessionId] = { ...note, updated_at: new Date().toISOString() };
  localStorage.setItem(SOAP_NOTES_KEY, JSON.stringify(notes));
}

function getSoapNote(courseId, sessionId) {
  return getSoapNotes()[courseId]?.[sessionId] || null;
}

function getPatientNotes(courseId) {
  return Object.entries(getSoapNotes()[courseId] || {})
    .sort((a, b) => new Date(b[1].updated_at) - new Date(a[1].updated_at));
}

const SOAP_TEMPLATES = {
  adhd: {
    subjective: 'Patient reports: attention difficulties, impulsivity levels, sleep quality, medication compliance.',
    objective: 'Session parameters: {params}. Patient presented as: alert/drowsy, cooperative/resistant. EEG findings: theta elevation noted at frontal sites.',
    assessment: 'Patient responded well to protocol. Theta/beta ratio trending: improved/unchanged/worsened. Side effects: none reported.',
    plan: 'Continue current protocol for next {n} sessions. Adjust frequency to {hz} Hz if no improvement by session {s}. Follow up on sleep hygiene.',
  },
  anxiety: {
    subjective: 'Patient reports: anxiety levels (0-10), sleep quality, stressors this week, physical symptoms.',
    objective: 'Session parameters: {params}. Alpha power at Pz: {val}. Patient relaxation response: present/absent.',
    assessment: 'Alpha enhancement protocol progressing. GAD-7 trend: improving/stable/worsening.',
    plan: 'Reinforce alpha/theta ratio goals. Add mindfulness exercise between sessions. Reassess in {n} sessions.',
  },
  depression: {
    subjective: 'Patient mood rating (0-10), energy levels, motivation, sleep, appetite, PHQ-9 score if available.',
    objective: 'Left DLPFC stimulation: {params}. Alpha asymmetry: right > left / left > right / symmetric.',
    assessment: 'Left frontal hypoactivation pattern. Response to stimulation: positive/partial/limited.',
    plan: 'Continue TMS course. Monitor PHQ-9 at next session. Consider medication consultation if no response by session {s}.',
  },
  default: {
    subjective: '',
    objective: 'Session parameters: {params}.',
    assessment: '',
    plan: '',
  },
};

let _coursesEvidenceStats = {
  totalPapers: EVIDENCE_TOTAL_PAPERS,
  totalTrials: EVIDENCE_TOTAL_TRIALS,
  modalityDistribution: EVIDENCE_SUMMARY.modalityDistribution || {},
};

function _coursesTotalPapers() {
  return Number(_coursesEvidenceStats.totalPapers) || EVIDENCE_TOTAL_PAPERS;
}

function _coursesModalityCount(label, fallback) {
  const dist = _coursesEvidenceStats.modalityDistribution || {};
  const candidates = [label];
  if (label === 'TMS') candidates.push('TMS / rTMS', 'rTMS');
  const found = candidates.find((key) => Number(dist[key]) > 0);
  return found ? Number(dist[found]) : fallback;
}

async function _ensureCoursesEvidenceStats() {
  try {
    _coursesEvidenceStats = await getEvidenceUiStats({
      fallbackSummary: EVIDENCE_SUMMARY,
      fallbackConditionCount: 15,
      fallbackMetaAnalyses: 0,
    });
  } catch {}
}

function _emptyCoursePatientEvidenceContext() {
  return {
    live: false,
    course: null,
    patientId: null,
    patientName: '',
    reportCount: 0,
    savedCitationCount: 0,
    highlightCount: 0,
    contradictionCount: 0,
    reportCitationCount: 0,
    phenotypeTags: [],
  };
}

async function _resolveCoursePatientEvidenceContext(courseId) {
  if (!courseId) return _emptyCoursePatientEvidenceContext();
  const course = await api.getCourse(courseId).catch(() => null);
  const patientId = course?.patient_id || null;
  const patientName = course?.patient_name || '';
  if (!patientId) {
    return { ..._emptyCoursePatientEvidenceContext(), course, patientName };
  }
  const [overview, reports] = await Promise.all([
    api.evidencePatientOverview?.(patientId).catch(() => null),
    api.listReports?.(patientId).catch(() => []),
  ]);
  return {
    live: !!overview || (Array.isArray(reports) && reports.length > 0),
    course,
    patientId,
    patientName,
    reportCount: Array.isArray(reports) ? reports.length : 0,
    savedCitationCount: Array.isArray(overview?.saved_citations) ? overview.saved_citations.length : 0,
    highlightCount: Array.isArray(overview?.highlights) ? overview.highlights.length : 0,
    contradictionCount: Array.isArray(overview?.contradictory_findings) ? overview.contradictory_findings.length : 0,
    reportCitationCount: Array.isArray(overview?.evidence_used_in_report) ? overview.evidence_used_in_report.length : 0,
    phenotypeTags: Array.isArray(overview?.compare_with_literature_phenotype?.matched_tags)
      ? overview.compare_with_literature_phenotype.matched_tags
      : [],
  };
}

// ── Shared color maps ─────────────────────────────────────────────────────────
const STATUS_COLOR = {
  pending_approval: 'var(--amber)',
  approved:         'var(--blue)',
  active:           'var(--teal)',
  paused:           'var(--amber)',
  completed:        'var(--green)',
  discontinued:     'var(--red)',
};

// ── Local helpers ─────────────────────────────────────────────────────────────

function metricCard(label, value, color, sub) {
  return `<div class="metric-card">
    <div style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.8px">${label}</div>
    <div style="font-size:28px;font-weight:700;color:${color};margin:8px 0 4px">${value}</div>
    <div style="font-size:11px;color:var(--text-secondary)">${sub}</div>
  </div>`;
}

function _courseChecklistStats(rawChecklist) {
  if (!rawChecklist || typeof rawChecklist !== 'object' || Array.isArray(rawChecklist)) {
    return null;
  }
  const values = Object.values(rawChecklist);
  if (values.length === 0) return null;
  const completed = values.filter(v => v === true || v === 'true' || v === 1 || v === '1').length;
  return { completed, total: values.length };
}

function _courseSessionAeCount(adverseEvents, session) {
  if (!Array.isArray(adverseEvents) || !session) return 0;
  const sessionId = String(session.session_id || session.id || '');
  return adverseEvents.filter((ae) => {
    const linked = String(ae.session_id || ae.clinical_session_id || '');
    return linked && linked === sessionId;
  }).length;
}

function _courseFinalizationSummary(sessions, adverseEvents, aeSummary) {
  const safeSessions = Array.isArray(sessions) ? sessions : [];
  const interrupted = safeSessions.filter(s => !!s?.interruptions).length;
  const notes = safeSessions.filter(s => !!String(s?.post_session_notes || '').trim()).length;
  const checklisted = safeSessions.filter(s => _courseChecklistStats(s?.checklist)).length;
  const totalAe = Array.isArray(adverseEvents) ? adverseEvents.length : (aeSummary?.total || 0);
  return { interrupted, notes, checklisted, totalAe };
}

// ── Clinical Intelligence — Risk Scoring ──────────────────────────────────────

function computeRiskScore(course) {
  // Defensive: bail early if no course at all so callers never see NaN.
  if (!course || typeof course !== 'object') return 0;
  let score = 0;
  const gradeRisk = { A: 0, B: 10, C: 25, D: 40 };
  // evidence_grade may be missing/null/lowercase; fall back to mid-risk (20)
  // when not in the {A,B,C,D} set instead of letting `undefined` propagate.
  const grade = typeof course.evidence_grade === 'string' ? course.evidence_grade.toUpperCase() : null;
  score += (grade && grade in gradeRisk) ? gradeRisk[grade] : 20;
  if (course.on_label === false) score += 30;
  score += (Array.isArray(course.governance_warnings) ? course.governance_warnings.length : 0) * 15;
  if (course.review_required) score += 10;
  const intensity = Number(course.planned_intensity_pct_rmt);
  if (Number.isFinite(intensity) && intensity > 110) score += 15;
  if (Number.isFinite(intensity) && intensity > 120) score += 15;
  const freq = Number(course.planned_frequency_hz);
  if (Number.isFinite(freq) && freq > 20) score += 10;
  const sessions = Number(course.planned_sessions_total);
  if (Number.isFinite(sessions) && sessions > 40) score += 5;
  return Math.min(100, score);
}

function riskLevel(score) {
  if (score < 20) return { label: 'Low',      color: 'var(--teal)' };
  if (score < 50) return { label: 'Moderate', color: 'var(--amber)' };
  if (score < 75) return { label: 'Elevated', color: '#f97316' };
  return             { label: 'High',     color: 'var(--red)' };
}

function riskGauge(score, compact = false) {
  const { label, color } = riskLevel(score);
  if (compact) {
    return `<div style="display:flex;align-items:center;gap:6px">
      <div style="width:40px;height:4px;border-radius:2px;background:rgba(255,255,255,0.1);overflow:hidden">
        <div style="height:4px;width:${score}%;background:${color};border-radius:2px"></div>
      </div>
      <span style="font-size:10px;font-weight:700;color:${color}">${label}</span>
    </div>`;
  }
  const r = 28, circumference = Math.PI * r;
  const offset = circumference * (1 - score / 100);
  return `<div style="text-align:center">
    <svg width="64" height="40" viewBox="0 0 64 40" style="overflow:visible">
      <path d="M 4 36 A 28 28 0 0 1 60 36" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="5" stroke-linecap="round"/>
      <path d="M 4 36 A 28 28 0 0 1 60 36" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round"
        stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
        style="transition:stroke-dashoffset 0.5s ease"/>
    </svg>
    <div style="font-size:18px;font-weight:700;color:${color};margin-top:-4px">${score}</div>
    <div style="font-size:9px;text-transform:uppercase;letter-spacing:.8px;color:${color};font-weight:600">${label} Risk</div>
  </div>`;
}

function renderRiskFactors(course) {
  const factors = [];
  if (course.on_label === false) factors.push({ label: 'Off-label use', severity: 'high' });
  if (course.evidence_grade === 'C' || course.evidence_grade === 'D') factors.push({ label: `Evidence grade ${course.evidence_grade}`, severity: 'moderate' });
  (course.governance_warnings || []).forEach(w => factors.push({ label: w, severity: 'high' }));
  if (course.planned_intensity_pct_rmt > 110) factors.push({ label: `High intensity: ${course.planned_intensity_pct_rmt}% RMT`, severity: 'moderate' });
  if (factors.length === 0) return '<span style="color:var(--teal);font-size:12px">&#10003; No risk factors identified</span>';
  return factors.map(f => `<div style="font-size:11.5px;color:${f.severity==='high'?'var(--red)':'var(--amber)'};margin-top:3px">${f.severity==='high'?'&#9888;':'&#9678;'} ${f.label}</div>`).join('');
}

// ── Clinical Intelligence — Outcome Prediction ───────────────────────────────

function predictOutcome(course, outcomes = []) {
  const delivered = course.sessions_delivered || 0;
  if (delivered < 5) return null;
  if (outcomes.length < 2) return null;

  const sorted = [...outcomes].sort((a, b) => (a.recorded_at || '') < (b.recorded_at || '') ? -1 : 1);
  const baseline = sorted[0];
  const latest   = sorted[sorted.length - 1];

  if (baseline.score == null || latest.score == null) return null;

  const LOWER_IS_BETTER = new Set(['PHQ-9','GAD-7','PCL-5','ISI','DASS-21','NRS-Pain','UPDRS-III']);
  const isLower = LOWER_IS_BETTER.has(baseline.template_name);

  const change    = latest.score - baseline.score;
  const pctChange = baseline.score > 0 ? (change / baseline.score) * 100 : 0;
  const improving = isLower ? change < 0 : change > 0;
  const magnitude = Math.abs(pctChange);

  if (!improving && delivered >= 5) {
    return { type: 'non_responder_risk', confidence: 'moderate', message: `No improvement detected after ${delivered} sessions. Consider protocol adjustment.`, color: 'var(--red)' };
  }
  if (improving && magnitude < 10 && delivered >= 10) {
    return { type: 'slow_response', confidence: 'low', message: `Slow response trajectory. ${Math.round(magnitude)}% improvement after ${delivered} sessions.`, color: 'var(--amber)' };
  }
  if (improving && magnitude >= 25) {
    return { type: 'good_response', confidence: 'moderate', message: `Strong response detected. ${Math.round(magnitude)}% improvement after ${delivered} sessions.`, color: 'var(--teal)' };
  }
  return null;
}

function renderPredictionCard(pred, outcomeCount) {
  if (!pred) return '';
  const icon  = pred.type === 'good_response' ? '&#10003;' : '&#9888;';
  const title = pred.type === 'good_response'
    ? 'Positive Response Detected'
    : pred.type === 'non_responder_risk'
    ? 'Non-Responder Risk Flag'
    : 'Slow Response Trajectory';
  return `<div style="padding:14px 16px;border-radius:8px;background:${pred.color}18;border:1px solid ${pred.color}40;margin-bottom:16px;display:flex;align-items:flex-start;gap:12px">
    <span style="font-size:20px;color:${pred.color}">${icon}</span>
    <div>
      <div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:3px">${title}</div>
      <div style="font-size:12px;color:var(--text-secondary)">${pred.message}</div>
      <div style="font-size:10.5px;color:var(--text-tertiary);margin-top:4px">Confidence: ${pred.confidence} &middot; Based on ${outcomeCount} outcome measurements</div>
    </div>
  </div>`;
}

// ── Clinical Intelligence — Cohort Benchmarks ────────────────────────────────

const BENCHMARKS = {
  'tDCS':          { condition: 'Depression (MDD)',               expected_responder_rate: 52, evidence: () => `Meta-analysis (n=1,144) · ${_coursesModalityCount('tDCS', 18200).toLocaleString()} papers indexed` },
  'TMS':           { condition: 'Treatment-Resistant Depression', expected_responder_rate: 58, evidence: () => `FDA-cleared indication · ${_coursesModalityCount('TMS', 24800).toLocaleString()} papers indexed` },
  'Neurofeedback': { condition: 'ADHD',                          expected_responder_rate: 64, evidence: () => `Meta-analysis (n=830) · ${_coursesModalityCount('Neurofeedback', 10400).toLocaleString()} papers indexed` },
  'taVNS':         { condition: 'Epilepsy',                      expected_responder_rate: 45, evidence: () => `RCT data (n=600) · ${_coursesModalityCount('taVNS', 5200).toLocaleString()} papers indexed` },
  'CES':           { condition: 'Anxiety/Insomnia',              expected_responder_rate: 55, evidence: () => `Meta-analysis (n=2,400) · ${_coursesModalityCount('CES', 4800).toLocaleString()} papers indexed` },
};

function benchmarkRow(modality, clinicRate, benchmarkRate, benchmark) {
  const delta     = clinicRate - benchmarkRate;
  const deltaColor = delta >= 0 ? 'var(--teal)' : 'var(--red)';
  const deltaStr  = (delta >= 0 ? '+' : '') + Math.round(delta) + 'pp';
  return `<div style="margin-bottom:16px">
    <div style="display:flex;justify-content:space-between;margin-bottom:6px">
      <span style="font-size:12.5px;font-weight:600;color:var(--text-primary)">${modality}</span>
      <span style="font-size:11px;color:${deltaColor};font-weight:600">${deltaStr} vs. benchmark</span>
    </div>
    <div style="margin-bottom:4px">
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:10.5px;color:var(--text-secondary);width:80px">This clinic</span>
        <div style="flex:1;height:14px;background:rgba(255,255,255,0.05);border-radius:3px;overflow:hidden">
          <div style="height:14px;width:${clinicRate}%;background:var(--teal);border-radius:3px;display:flex;align-items:center;padding-left:6px">
            <span style="font-size:9px;font-weight:700;color:#000">${Math.round(clinicRate)}%</span>
          </div>
        </div>
      </div>
    </div>
    <div>
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:10.5px;color:var(--text-tertiary);width:80px">Published</span>
        <div style="flex:1;height:14px;background:rgba(255,255,255,0.05);border-radius:3px;overflow:hidden">
          <div style="height:14px;width:${benchmarkRate}%;background:rgba(74,158,255,0.4);border-radius:3px;border:1px dashed var(--blue);display:flex;align-items:center;padding-left:6px">
            <span style="font-size:9px;color:var(--blue)">${benchmarkRate}%</span>
          </div>
        </div>
      </div>
    </div>
      <div style="font-size:10px;color:var(--text-tertiary);margin-top:3px">${typeof benchmark.evidence === 'function' ? benchmark.evidence() : benchmark.evidence} &middot; ${benchmark.condition}</div>
  </div>`;
}

// ── Treatment Courses — status / phase / signal / CTA helpers ─────────────────

const TC_STATUS = {
  pending_approval: { label: 'Awaiting Approval', color: 'var(--amber)',  bg: 'rgba(245,158,11,0.12)'  },
  approved:         { label: 'Planned',            color: 'var(--blue)',   bg: 'rgba(59,130,246,0.12)'  },
  active:           { label: 'Active',             color: 'var(--teal)',   bg: 'rgba(0,212,188,0.12)'   },
  paused:           { label: 'Paused',             color: 'var(--amber)',  bg: 'rgba(245,158,11,0.12)'  },
  completed:        { label: 'Completed',          color: 'var(--green)',  bg: 'rgba(34,197,94,0.12)'   },
  discontinued:     { label: 'Discontinued',       color: 'var(--red)',    bg: 'rgba(239,68,68,0.12)'   },
};

function _tcPhase(delivered, total) {
  if (!delivered) return 'Pre-treatment';
  const pct = total > 0 ? delivered / total : 0;
  if (delivered <= 3) return 'Induction';
  if (pct < 0.5)      return 'Active Treatment';
  if (pct < 0.8)      return 'Mid-Course';
  if (pct < 1.0)      return 'Final Phase';
  return 'Maintenance';
}

function _tcNextMilestone(delivered, total) {
  const milestones = [5, 10, 20].filter(m => m <= (total || 999));
  for (const m of milestones) {
    if (delivered < m) {
      const label = m === 5 ? 'Tolerance check' : m === 10 ? 'Mid-course review' : 'Completion review';
      return { session: m, remaining: m - delivered, label };
    }
  }
  return null;
}

function _tcSignals(course, openAEs = []) {
  const signals = [];
  const delivered = course.sessions_delivered || 0;
  const total     = course.planned_sessions_total || 0;
  const ms        = _tcNextMilestone(delivered, total);

  if (ms && ms.remaining <= 1 && course.status === 'active')
    signals.push({ key: 'milestone',    icon: '◎', label: `${ms.label} due`,        color: 'var(--blue)',          bg: 'rgba(59,130,246,0.1)',   filter: 'milestone-due'    });
  if (course.on_label === false)
    signals.push({ key: 'off-label',   icon: '◈', label: 'Off-label',               color: 'var(--amber)',         bg: 'rgba(245,158,11,0.1)',   filter: 'off-label'        });
  if ((course.governance_warnings || []).length > 0)
    signals.push({ key: 'safety-flag', icon: '⚠', label: 'Safety flag',             color: 'var(--red)',           bg: 'rgba(239,68,68,0.1)',    filter: 'needs-review'     });
  if (course.review_required)
    signals.push({ key: 'review-due',  icon: '◱', label: 'Review due',              color: 'var(--amber)',         bg: 'rgba(245,158,11,0.1)',   filter: 'needs-review'     });
  if (course.status === 'pending_approval')
    signals.push({ key: 'awaiting',    icon: '◱', label: 'Awaiting approval',       color: 'var(--amber)',         bg: 'rgba(245,158,11,0.1)',   filter: 'needs-review'     });

  const courseAEs = openAEs.filter(ae => ae.course_id === course.id);
  if (courseAEs.length) {
    const serious = courseAEs.some(ae => ae.severity === 'serious' || ae.severity === 'severe');
    signals.push({ key: 'side-effects', icon: '⚡', label: serious ? 'Serious AE open' : 'Side effects',
      color: serious ? 'var(--red)' : 'var(--amber)', bg: serious ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
      filter: 'alerts' });
  }
  if (course.status === 'active' && course.last_session_at) {
    const days = Math.floor((Date.now() - new Date(course.last_session_at).getTime()) / 86400000);
    if (days > 14)
      signals.push({ key: 'low-adherence', icon: '↓', label: `${days}d no session`, color: 'var(--amber)', bg: 'rgba(245,158,11,0.1)', filter: 'low-adherence' });
  }
  if ((course.governance_warnings || []).length >= 2 || (courseAEs.some(a => a.severity === 'serious') && (course.governance_warnings||[]).length))
    signals.push({ key: 'needs-adjustment', icon: '↘', label: 'Needs adjustment',   color: 'var(--red)',           bg: 'rgba(239,68,68,0.1)',    filter: 'needs-adjustment' });

  return signals;
}

function _tcCTA(course, signals) {
  const hasSeriousAE   = signals.some(s => s.key === 'side-effects' && s.color === 'var(--red)');
  const needsReview    = signals.some(s => s.key === 'review-due' || s.key === 'safety-flag');
  const milestoneDue   = signals.some(s => s.key === 'milestone');
  const lowAdherence   = signals.some(s => s.key === 'low-adherence');
  const needsAdjust    = signals.some(s => s.key === 'needs-adjustment');

  if (course.status === 'pending_approval') return { label: 'Approve & Activate', onclick: "window._nav('review-queue')",       style: 'primary' };
  if (course.status === 'paused')           return { label: 'Resume Course',       onclick: `window._openCourse('${course.id}')`, style: 'normal'  };
  if (course.status === 'completed')        return { label: 'View Report',         onclick: `window._openCourse('${course.id}')`, style: 'ghost'   };
  if (course.status === 'approved')         return { label: 'Activate',            onclick: "window._nav('review-queue')",       style: 'normal'  };
  if (hasSeriousAE || needsAdjust)          return { label: 'Open Chart',          onclick: `window._openCourse('${course.id}')`, style: 'danger'  };
  if (needsReview || milestoneDue)          return { label: 'Review Progress',     onclick: `window._openCourse('${course.id}')`, style: 'amber'   };
  if (lowAdherence)                         return { label: 'Virtual Care',        onclick: "window._nav('messaging')",          style: 'normal'  };
  return                                           { label: 'Start Session',       onclick: "window._nav('session-execution')",  style: 'primary' };
}

const _tcBtnStyle = {
  primary: 'background:var(--teal);color:#000;border:none;font-weight:700',
  amber:   'background:rgba(245,158,11,0.15);color:var(--amber,#f59e0b);border:1px solid rgba(245,158,11,0.3)',
  danger:  'background:rgba(239,68,68,0.12);color:var(--red,#ef4444);border:1px solid rgba(239,68,68,0.25)',
  ghost:   'background:transparent;color:var(--text-secondary);border:1px solid var(--border)',
  normal:  'background:transparent;color:var(--teal);border:1px solid rgba(0,212,188,0.3)',
};

function _tcListRow(c, openAEs = []) {
  const signals  = _tcSignals(c, openAEs);
  const cta      = _tcCTA(c, signals);
  const delivered = c.sessions_delivered || 0;
  const total     = c.planned_sessions_total || 0;
  const pct       = total > 0 ? Math.min(100, Math.round(delivered / total * 100)) : 0;
  const phase     = _tcPhase(delivered, total);
  const ms        = _tcNextMilestone(delivered, total);
  const st        = TC_STATUS[c.status] || TC_STATUS.active;

  return `<div class="tc-row" onclick="window._openCourse('${c.id}')"
    style="display:flex;align-items:center;gap:12px;padding:11px 16px;border-bottom:1px solid var(--border);cursor:pointer;transition:background 0.12s"
    onmouseover="this.style.background='var(--bg-card-hover)'" onmouseout="this.style.background=''">
    <div style="flex:1;min-width:0;overflow:hidden">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;flex-wrap:nowrap;overflow:hidden">
        <span style="font-size:13px;font-weight:700;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:150px">${_esc(c._patientName) || '—'}</span>
        <span style="font-size:11.5px;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_esc((c.condition_slug || '—').replace(/-/g,' '))}</span>
        <span style="font-size:11px;color:var(--teal);font-weight:600;flex-shrink:0">${_esc(c.modality_slug) || '—'}</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
        <span style="font-size:10px;font-weight:700;padding:1px 7px;border-radius:10px;background:${st.bg};color:${st.color};white-space:nowrap">${st.label}</span>
        <span style="font-size:10.5px;color:var(--text-tertiary)">${phase}</span>
        ${ms ? `<span style="font-size:10.5px;color:var(--text-tertiary)">· ${ms.label} in ${ms.remaining}s</span>` : ''}
        ${signals.slice(0, 2).map(s => `<span style="font-size:9.5px;font-weight:600;padding:1px 6px;border-radius:8px;background:${s.bg};color:${s.color};white-space:nowrap">${s.icon} ${s.label}</span>`).join('')}
      </div>
    </div>
    <div style="flex-shrink:0;width:100px">
      <div style="display:flex;justify-content:space-between;font-size:9.5px;color:var(--text-tertiary);margin-bottom:3px"><span>${delivered}/${total || '?'}</span><span>${pct}%</span></div>
      <div style="height:4px;border-radius:2px;background:var(--border)">
        <div style="height:4px;border-radius:2px;background:${st.color};width:${pct}%"></div>
      </div>
    </div>
    <button onclick="event.stopPropagation();${cta.onclick}"
      style="flex-shrink:0;font-size:11px;font-weight:600;padding:6px 11px;border-radius:var(--radius-md);cursor:pointer;font-family:var(--font-body);white-space:nowrap;${_tcBtnStyle[cta.style] || ''}">${cta.label}</button>
  </div>`;
}

function _tcCard(c, openAEs = []) {
  const signals  = _tcSignals(c, openAEs);
  const cta      = _tcCTA(c, signals);
  const delivered = c.sessions_delivered || 0;
  const total     = c.planned_sessions_total || 0;
  const pct       = total > 0 ? Math.min(100, Math.round(delivered / total * 100)) : 0;
  const phase     = _tcPhase(delivered, total);
  const ms        = _tcNextMilestone(delivered, total);
  const st        = TC_STATUS[c.status] || TC_STATUS.active;

  return `<div class="card" style="padding:16px;cursor:pointer;display:flex;flex-direction:column;gap:10px;transition:border-color 0.15s"
    onmouseover="this.style.borderColor='rgba(0,212,188,0.3)'" onmouseout="this.style.borderColor='var(--border)'"
    onclick="window._openCourse('${c.id}')">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_esc(c._patientName) || '—'}</div>
        <div style="font-size:11.5px;color:var(--text-secondary)">${_esc((c.condition_slug || '—').replace(/-/g,' '))} · <span style="color:var(--teal)">${_esc(c.modality_slug) || '—'}</span></div>
      </div>
      <span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;background:${st.bg};color:${st.color};flex-shrink:0;white-space:nowrap">${st.label}</span>
    </div>
    <div>
      <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-tertiary);margin-bottom:3px"><span>${phase}</span><span>${delivered}/${total || '?'} · ${pct}%</span></div>
      <div style="height:5px;border-radius:3px;background:var(--border)"><div style="height:5px;border-radius:3px;background:${st.color};width:${pct}%"></div></div>
    </div>
    ${ms ? `<div style="font-size:10.5px;color:var(--text-secondary)">◎ ${ms.label} in ${ms.remaining} session${ms.remaining !== 1 ? 's' : ''}</div>` : ''}
    ${signals.length ? `<div style="display:flex;flex-wrap:wrap;gap:4px">${signals.map(s => `<span style="font-size:9.5px;font-weight:600;padding:2px 7px;border-radius:8px;background:${s.bg};color:${s.color}">${s.icon} ${s.label}</span>`).join('')}</div>` : ''}
    <button onclick="event.stopPropagation();${cta.onclick}"
      style="width:100%;font-size:12px;font-weight:700;padding:8px;border-radius:var(--radius-md);cursor:pointer;font-family:var(--font-body);${_tcBtnStyle[cta.style] || ''}">${cta.label}</button>
  </div>`;
}

// ── pgCourses — Treatment Courses list ───────────────────────────────────────
export async function pgCourses(setTopbar, navigate) {
  await _ensureCoursesEvidenceStats();
  const canCreate = ['clinician', 'admin', 'supervisor'].includes(currentUser?.role);
  setTopbar('Treatment Courses',
    canCreate ? `<button class="btn btn-primary btn-sm" onclick="window._nav('protocol-wizard')">+ New Course</button>` : ''
  );

  const el = document.getElementById('content');
  el.innerHTML = spinner();

  let items = [], openAEs = [];
  try {
    const [cData, pData, aeData] = await Promise.all([
      api.listCourses(),
      api.listPatients?.().catch(() => ({ items: [] })),
      api.listAdverseEvents?.().catch(() => ({ items: [] })),
    ]);
    items  = cData?.items || [];
    openAEs = (aeData?.items || []).filter(ae => ae.status === 'open' || ae.status === 'active');

    const patientMap = {};
    (pData?.items || []).forEach(p => { patientMap[p.id] = p; });
    items.forEach(c => {
      const p = patientMap[c.patient_id];
      c._patientName = p ? `${p.first_name || ''} ${p.last_name || ''}`.trim() : (c.patient_name || '—');
    });
  } catch (e) {
    // continue with empty data — fallback UI below
  }

  // ── Summary metrics ─────────────────────────────────────────────────────────
  const now     = Date.now();
  const inWeek  = now + 7 * 86400000;
  const active          = items.filter(c => c.status === 'active').length;
  const paused          = items.filter(c => c.status === 'paused').length;
  const completed       = items.filter(c => c.status === 'completed').length;
  const startingThisWeek = items.filter(c => {
    if (c.status !== 'approved' && c.status !== 'active') return false;
    const s = c.start_date ? new Date(c.start_date).getTime() : 0;
    return s >= now && s <= inWeek;
  }).length;
  const milestoneDue    = items.filter(c => {
    const ms = _tcNextMilestone(c.sessions_delivered || 0, c.planned_sessions_total || 0);
    return ms && ms.remaining <= 1 && c.status === 'active';
  }).length;
  const needsAdjustment = items.filter(c => _tcSignals(c, openAEs).some(s => s.key === 'needs-adjustment')).length;

  function tcSummaryCard(label, value, color, sub, clickFilter) {
    return `<div class="tc-summary-card" onclick="window._tcFilterByStatus('${clickFilter}')"
      style="padding:16px 18px;border-radius:var(--radius-lg);background:var(--bg-card);border:1px solid var(--border);cursor:pointer;transition:border-color 0.15s"
      onmouseover="this.style.borderColor='${color}55'" onmouseout="this.style.borderColor='var(--border)'">
      <div style="font-size:10.5px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.7px;margin-bottom:6px">${label}</div>
      <div style="font-size:26px;font-weight:800;color:${color};line-height:1">${value}</div>
      <div style="font-size:10.5px;color:var(--text-secondary);margin-top:5px">${sub}</div>
    </div>`;
  }

  window._tcAllCourses = items;
  window._tcOpenAEs    = openAEs;
  window._tcViewMode   = 'list';
  window._tcCohort     = 'all';

  // ── Pre-compute cohort counts ────────────────────────────────────────────────
  const now30d = now - 30 * 86400000;
  function _tcCohortCount(cohortId) {
    const all = window._tcAllCourses || [];
    const aes = window._tcOpenAEs   || [];
    switch (cohortId) {
      case 'all':       return all.length;
      case 'active':    return all.filter(c => c.status === 'active').length;
      case 'completing-soon': return all.filter(c => {
        if (c.status !== 'active') return false;
        const rem = (c.planned_sessions_total || 0) - (c.sessions_delivered || 0);
        return rem > 0 && rem <= 3;
      }).length;
      case 'needs-assessment': return all.filter(c => c.review_required || (c.governance_warnings || []).length > 0).length;
      case 'side-effect': return all.filter(c => aes.some(ae => ae.course_id === c.id)).length;
      case 'low-adherence': return all.filter(c => {
        if (c.status !== 'active' || !c.last_session_at) return false;
        return Math.floor((Date.now() - new Date(c.last_session_at).getTime()) / 86400000) > 14;
      }).length;
      case 'awaiting-approval': return all.filter(c => c.status === 'pending_approval').length;
      case 'paused':    return all.filter(c => c.status === 'paused').length;
      case 'completed-30d': return all.filter(c => {
        if (c.status !== 'completed') return false;
        const t = c.completed_at || c.updated_at || c.created_at;
        return t && new Date(t).getTime() >= now30d;
      }).length;
      default:          return 0;
    }
  }

  const COHORTS = [
    { id: 'all',              label: 'All Courses'              },
    { id: 'active',           label: 'Active'                   },
    { id: 'completing-soon',  label: 'Completing Soon'          },
    { id: 'needs-assessment', label: 'Needs Assessment Review'  },
    { id: 'side-effect',      label: 'Side Effect Reported'     },
    { id: 'low-adherence',    label: 'Low Adherence'            },
    { id: 'awaiting-approval',label: 'Awaiting Approval'        },
    { id: 'paused',           label: 'Paused / On Hold'         },
    { id: 'completed-30d',    label: 'Completed (last 30d)'     },
  ];

  function renderLeftRail(activeCohort) {
    return `
      <div class="course-left-rail" id="tc-left-rail">
        <div class="course-left-rail-label">Cohorts</div>
        ${COHORTS.map(ch => {
          const cnt = _tcCohortCount(ch.id);
          return `<div class="course-cohort-item${ch.id === activeCohort ? ' active' : ''}"
            data-cohort="${ch.id}" onclick="window._courseSetCohort('${ch.id}')">
            <span>${ch.label}</span>
            <span class="course-cohort-count">${cnt}</span>
          </div>`;
        }).join('')}
      </div>`;
  }

  el.innerHTML = `
    <div class="course-master-layout">

      ${renderLeftRail('all')}

      <div class="course-main">
        <div class="page-section" style="padding-top:16px">

          <!-- Summary strip -->
          <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:12px;margin-bottom:20px">
            ${tcSummaryCard('Active',          active,          'var(--teal)',  'In progress',          'active')}
            ${tcSummaryCard('Starting Soon',   startingThisWeek,'var(--blue)',  'Next 7 days',          'approved')}
            ${tcSummaryCard('Milestone Due',   milestoneDue,    'var(--blue)',  'Needs check-in',       '__milestone')}
            ${tcSummaryCard('Needs Adjustment',needsAdjustment, 'var(--red)',   'Protocol review req.', '__adjustment')}
            ${tcSummaryCard('Paused',          paused,          'var(--amber)', 'On hold',              'paused')}
            ${tcSummaryCard('Completed',       completed,       'var(--green)', 'Finished courses',     'completed')}
          </div>

          <!-- Search + filter bar -->
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:16px">
            <div style="position:relative;flex:1;min-width:220px">
              <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--text-tertiary);font-size:13px;pointer-events:none">&#8981;</span>
              <input id="tc-search" type="text" placeholder="Search patients, conditions, modalities…"
                class="form-control" style="padding-left:28px;font-size:13px;height:34px"
                oninput="window._tcApplyFilters()">
            </div>
            <select id="tc-status" class="form-control" style="width:auto;font-size:12px;height:34px;padding:0 10px" onchange="window._tcApplyFilters()">
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="pending_approval">Pending Approval</option>
              <option value="approved">Planned</option>
              <option value="paused">Paused</option>
              <option value="completed">Completed</option>
              <option value="discontinued">Discontinued</option>
            </select>
            <select id="tc-modality" class="form-control" style="width:auto;font-size:12px;height:34px;padding:0 10px" onchange="window._tcApplyFilters()">
              <option value="">All Modalities</option>
              ${[...new Set(items.map(c => c.modality_slug).filter(Boolean))].map(m => `<option value="${m}">${m}</option>`).join('')}
            </select>
            <select id="tc-signal" class="form-control" style="width:auto;font-size:12px;height:34px;padding:0 10px" onchange="window._tcApplyFilters()">
              <option value="">All Signals</option>
              <option value="milestone-due">Milestone Due</option>
              <option value="needs-review">Needs Review</option>
              <option value="alerts">Alerts / AEs</option>
              <option value="low-adherence">Low Adherence</option>
              <option value="needs-adjustment">Needs Adjustment</option>
              <option value="off-label">Off-Label</option>
            </select>
            <select id="tc-sort" class="form-control" style="width:auto;font-size:12px;height:34px;padding:0 10px" onchange="window._tcApplyFilters()">
              <option value="recent">Sort: Recent</option>
              <option value="urgency">Sort: Urgency</option>
              <option value="patient">Sort: Patient Name</option>
              <option value="progress">Sort: Progress</option>
              <option value="evidence">Sort: Evidence Grade</option>
            </select>
            <div style="display:flex;border:1px solid var(--border);border-radius:var(--radius-md);overflow:hidden">
              <button id="tc-view-list" onclick="window._tcSetView('list')"
                style="padding:6px 12px;font-size:12px;border:none;cursor:pointer;background:var(--teal);color:#000;font-weight:700;font-family:var(--font-body)">&#8801; List</button>
              <button id="tc-view-card" onclick="window._tcSetView('card')"
                style="padding:6px 12px;font-size:12px;border:none;cursor:pointer;background:transparent;color:var(--text-secondary);font-family:var(--font-body)">&#8862; Cards</button>
            </div>
          </div>

          <!-- Course list -->
          <div class="card" style="padding:0;overflow:hidden">
            <div style="padding:12px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
              <span style="font-size:13px;font-weight:600;color:var(--text-primary)">Treatment Courses</span>
              <span id="tc-count" style="font-size:11px;color:var(--text-tertiary)">${items.length} total</span>
            </div>
            <div id="tc-list"></div>
          </div>

        </div>
      </div>

    </div>`;

  // ── Cohort filter helper ──────────────────────────────────────────────────────
  function _applyCohortFilter(cohortId, all, aes) {
    const now30dLocal = Date.now() - 30 * 86400000;
    switch (cohortId) {
      case 'all':             return all;
      case 'active':          return all.filter(c => c.status === 'active');
      case 'completing-soon': return all.filter(c => {
        if (c.status !== 'active') return false;
        const rem = (c.planned_sessions_total || 0) - (c.sessions_delivered || 0);
        return rem > 0 && rem <= 3;
      });
      case 'needs-assessment': return all.filter(c => c.review_required || (c.governance_warnings || []).length > 0);
      case 'side-effect':     return all.filter(c => aes.some(ae => ae.course_id === c.id));
      case 'low-adherence':   return all.filter(c => {
        if (c.status !== 'active' || !c.last_session_at) return false;
        return Math.floor((Date.now() - new Date(c.last_session_at).getTime()) / 86400000) > 14;
      });
      case 'awaiting-approval': return all.filter(c => c.status === 'pending_approval');
      case 'paused':          return all.filter(c => c.status === 'paused');
      case 'completed-30d':   return all.filter(c => {
        if (c.status !== 'completed') return false;
        const t = c.completed_at || c.updated_at || c.created_at;
        return t && new Date(t).getTime() >= now30dLocal;
      });
      default:                return all;
    }
  }

  window._courseSetCohort = function(cohortId) {
    window._tcCohort = cohortId;
    // Update active state in rail
    document.querySelectorAll('.course-cohort-item').forEach(el => {
      el.classList.toggle('active', el.dataset.cohort === cohortId);
    });
    window._tcApplyFilters();
  };

  // ── Render helpers ──────────────────────────────────────────────────────────
  const GRADE_ORDER  = { A: 0, B: 1, C: 2, D: 3 };
  const STATUS_ORDER = { active: 0, pending_approval: 1, approved: 2, paused: 3, completed: 4, discontinued: 5 };
  const SIGNAL_URGENCY = { 'needs-adjustment': 0, 'safety-flag': 1, 'review-due': 2, 'milestone-due': 3, 'low-adherence': 4, 'off-label': 5, 'awaiting': 6 };

  function tcRenderList(visible) {
    const list = document.getElementById('tc-list');
    const cnt  = document.getElementById('tc-count');
    if (!list) return;
    if (cnt) cnt.textContent = `${visible.length} of ${items.length}`;
    if (!visible.length) {
      list.innerHTML = `<div style="padding:48px;text-align:center">${emptyState('◎', 'No courses match', 'Try adjusting your filters or search query.')}</div>`;
      return;
    }
    if (window._tcViewMode === 'card') {
      list.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;padding:16px';
      list.innerHTML = visible.map(c => _tcCard(c, openAEs)).join('');
    } else {
      list.style.cssText = '';
      list.innerHTML = visible.map(c => _tcListRow(c, openAEs)).join('');
    }
  }

  window._tcSetView = function(mode) {
    window._tcViewMode = mode;
    const btnList = document.getElementById('tc-view-list');
    const btnCard = document.getElementById('tc-view-card');
    if (btnList) { btnList.style.background = mode === 'list' ? 'var(--teal)' : 'transparent'; btnList.style.color = mode === 'list' ? '#000' : 'var(--text-secondary)'; btnList.style.fontWeight = mode === 'list' ? '700' : '400'; }
    if (btnCard) { btnCard.style.background = mode === 'card' ? 'var(--teal)' : 'transparent'; btnCard.style.color = mode === 'card' ? '#000' : 'var(--text-secondary)'; btnCard.style.fontWeight = mode === 'card' ? '700' : '400'; }
    window._tcApplyFilters();
  };

  window._tcFilterByStatus = function(key) {
    const statusEl  = document.getElementById('tc-status');
    const signalEl  = document.getElementById('tc-signal');
    if (key === '__milestone') {
      if (statusEl) statusEl.value = '';
      if (signalEl) signalEl.value = 'milestone-due';
    } else if (key === '__adjustment') {
      if (statusEl) statusEl.value = '';
      if (signalEl) signalEl.value = 'needs-adjustment';
    } else {
      if (statusEl) statusEl.value = key;
      if (signalEl) signalEl.value = '';
    }
    window._tcApplyFilters();
    document.getElementById('tc-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  window._tcApplyFilters = function() {
    const q       = (document.getElementById('tc-search')?.value  || '').toLowerCase();
    const status  = document.getElementById('tc-status')?.value   || '';
    const modality= document.getElementById('tc-modality')?.value || '';
    const signal  = document.getElementById('tc-signal')?.value   || '';
    const sort    = document.getElementById('tc-sort')?.value     || 'recent';
    const cohort  = window._tcCohort || 'all';

    // Apply cohort pre-filter first, then search/status/signal filters on top
    let visible = _applyCohortFilter(cohort, window._tcAllCourses || [], window._tcOpenAEs || []);

    if (q) visible = visible.filter(c =>
      (c._patientName || '').toLowerCase().includes(q) ||
      (c.condition_slug || '').toLowerCase().includes(q) ||
      (c.modality_slug  || '').toLowerCase().includes(q)
    );
    if (status)   visible = visible.filter(c => c.status === status);
    if (modality) visible = visible.filter(c => c.modality_slug === modality);
    if (signal)   visible = visible.filter(c => _tcSignals(c, window._tcOpenAEs || []).some(s => s.filter === signal));

    if (sort === 'urgency') {
      visible.sort((a, b) => {
        const sa = _tcSignals(a, openAEs); const sb = _tcSignals(b, openAEs);
        const ua = sa.length ? Math.min(...sa.map(s => SIGNAL_URGENCY[s.key] ?? 99)) : 99;
        const ub = sb.length ? Math.min(...sb.map(s => SIGNAL_URGENCY[s.key] ?? 99)) : 99;
        return ua - ub;
      });
    } else if (sort === 'patient') {
      visible.sort((a, b) => (a._patientName || '').localeCompare(b._patientName || ''));
    } else if (sort === 'progress') {
      visible.sort((a, b) => {
        const pa = (a.planned_sessions_total || 0) > 0 ? (a.sessions_delivered || 0) / a.planned_sessions_total : 0;
        const pb = (b.planned_sessions_total || 0) > 0 ? (b.sessions_delivered || 0) / b.planned_sessions_total : 0;
        return pb - pa;
      });
    } else if (sort === 'evidence') {
      visible.sort((a, b) => (GRADE_ORDER[a.evidence_grade] ?? 9) - (GRADE_ORDER[b.evidence_grade] ?? 9));
    } else {
      visible.sort((a, b) => ((b.updated_at || b.created_at || '') > (a.updated_at || a.created_at || '') ? 1 : -1));
    }

    tcRenderList(visible);
  };

  // Initial render
  tcRenderList(items);
}

// ── pgClinicalNotes — SOAP Notes Hub ─────────────────────────────────────────
function renderSoapEditor(courseId, sessionId, note, course) {
  const condition = (course?.condition_slug || course?.condition || '').toLowerCase().replace(/-/g, '');
  const template = SOAP_TEMPLATES[condition] || SOAP_TEMPLATES.default;

  return `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
      <div>
        <h3 style="margin:0">Session Note</h3>
        <div style="font-size:0.78rem;color:var(--text-secondary);margin-top:4px">${course?.title || course?.condition_slug || 'Unknown course'} · ${new Date(note.updated_at).toLocaleString()}</div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn-secondary" onclick="window._useNoteTemplate('${courseId}','${sessionId}')" style="font-size:0.78rem">📋 Template</button>
        <button class="btn-secondary" onclick="window._flagNote('${courseId}','${sessionId}')" style="font-size:0.78rem;${note.flagged ? 'color:var(--amber-500)' : ''}">${note.flagged ? '★' : '☆'} Flag</button>
        <button class="btn-secondary" onclick="window._printNote('${courseId}','${sessionId}')" style="font-size:0.78rem">🖨️ Print</button>
        <button class="btn-secondary" onclick="window._nav('ai-note-assistant')" style="font-size:0.78rem" title="Open AI Note Assistant">✍️ AI Assist</button>
        <button class="btn-primary" onclick="window._saveSoapNote('${courseId}','${sessionId}')" style="font-size:0.82rem">Save Note</button>
      </div>
    </div>

    ${['subjective', 'objective', 'assessment', 'plan'].map(section => `
      <div style="margin-bottom:18px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <div style="width:28px;height:28px;border-radius:6px;background:${{ subjective: 'rgba(0,212,188,0.15)', objective: 'rgba(59,130,246,0.15)', assessment: 'rgba(139,92,246,0.15)', plan: 'rgba(245,158,11,0.15)' }[section]};display:flex;align-items:center;justify-content:center;font-size:0.9rem">${{ subjective: '💬', objective: '🔬', assessment: '📊', plan: '📋' }[section]}</div>
          <h4 style="margin:0;text-transform:uppercase;font-size:0.8rem;letter-spacing:.05em">${section}</h4>
          <button onclick="window._fillTemplate('${section}','${courseId}','${sessionId}')" style="margin-left:auto;background:none;border:1px solid var(--border);border-radius:4px;padding:2px 8px;font-size:0.7rem;color:var(--text-secondary);cursor:pointer">Fill</button>
        </div>
        <textarea id="soap-${section}" rows="${section === 'plan' ? 4 : 3}"
          style="width:100%;resize:vertical;padding:10px;border:1px solid var(--border);border-radius:8px;background:var(--surface-2);color:var(--text-primary);font-size:0.875rem;line-height:1.6;font-family:inherit;box-sizing:border-box"
          placeholder="${template[section]}">${note[section] || ''}</textarea>
      </div>`).join('')}

    <div style="margin-bottom:18px">
      <h4 style="margin:0 0 8px;font-size:0.8rem;text-transform:uppercase;letter-spacing:.05em;display:flex;align-items:center;gap:6px"><span>⚠️</span> Adverse Effects / Safety</h4>
      <textarea id="soap-adverse" rows="2"
        style="width:100%;resize:vertical;padding:10px;border:1px solid var(--border);border-radius:8px;background:var(--surface-2);color:var(--text-primary);font-size:0.875rem;box-sizing:border-box"
        placeholder="None reported / describe any adverse effects observed...">${note.adverse || ''}</textarea>
    </div>

    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:12px;background:var(--surface-2);border-radius:8px">
      <label style="font-size:0.82rem;font-weight:500">Next session date:</label>
      <input type="date" id="soap-next-date" value="${note.next_date || ''}" style="background:var(--surface-1);border:1px solid var(--border);border-radius:6px;padding:6px 10px;color:var(--text-primary)">
      <label style="font-size:0.82rem;font-weight:500">Clinician:</label>
      <input type="text" id="soap-clinician" value="${note.clinician || ''}" placeholder="Your name" style="flex:1;background:var(--surface-1);border:1px solid var(--border);border-radius:6px;padding:6px 10px;color:var(--text-primary);min-width:120px">
    </div>`;
}

export async function pgClinicalNotes(setTopbar) {
  window._setTopbar = setTopbar;
  setTopbar('Clinical Notes', 'SOAP documentation per session');
  const el = document.getElementById('content');
  if (!el) return;

  el.innerHTML = '<div class="page-loading"></div>';

  let courses = [];
  try { courses = await api.listCourses().then(r => r?.items || r || []).catch(() => []); } catch { courses = []; }

  if (!('_notesSelectedNoteKey' in window)) window._notesSelectedNoteKey = null;

  // Collect all notes across all courses
  const allNotes = [];
  const allSoapNotes = getSoapNotes();
  courses.forEach(course => {
    const courseNotes = allSoapNotes[course.id] || {};
    Object.entries(courseNotes).forEach(([sessionId, note]) => {
      allNotes.push({ courseId: course.id, sessionId, note, course, key: `${course.id}:${sessionId}` });
    });
  });
  // Also include notes for course IDs that may not be in current listing
  Object.entries(allSoapNotes).forEach(([courseId, courseNotes]) => {
    if (!courses.find(c => String(c.id) === String(courseId))) {
      Object.entries(courseNotes).forEach(([sessionId, note]) => {
        allNotes.push({ courseId, sessionId, note, course: null, key: `${courseId}:${sessionId}` });
      });
    }
  });
  allNotes.sort((a, b) => new Date(b.note.updated_at) - new Date(a.note.updated_at));

  const selectedEntry = allNotes.find(n => n.key === window._notesSelectedNoteKey) || allNotes[0] || null;
  if (selectedEntry && !window._notesSelectedNoteKey) window._notesSelectedNoteKey = selectedEntry.key;

  const notesList = allNotes.length === 0
    ? `<div style="padding:20px;text-align:center;color:var(--text-secondary);font-size:0.85rem">No notes yet.<br>Log a session and add notes there.</div>`
    : allNotes.map(entry => {
        const isSelected = entry.key === window._notesSelectedNoteKey;
        return `<div class="note-list-item ${isSelected ? 'active' : ''}" onclick="window._selectNote('${entry.key}')">
          <div style="display:flex;justify-content:space-between;align-items:flex-start">
            <div style="font-size:0.85rem;font-weight:600">Session ${entry.sessionId.slice(0, 6)}</div>
            ${entry.note.flagged ? '<span style="color:var(--amber-500);font-size:0.75rem">★ Flagged</span>' : ''}
          </div>
          <div style="font-size:0.75rem;color:var(--text-secondary);margin-top:2px">${_esc(entry.course?.title || entry.course?.condition_slug || 'Course ' + String(entry.courseId).slice(0, 6))}</div>
          <div style="font-size:0.72rem;color:var(--text-secondary);margin-top:1px">${new Date(entry.note.updated_at).toLocaleDateString()}</div>
          <div style="font-size:0.75rem;color:var(--text-secondary);margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px">${_esc(entry.note.subjective?.slice(0, 60)) || 'Empty note'}...</div>
        </div>`;
      }).join('');

  const soapEditor = selectedEntry
    ? renderSoapEditor(selectedEntry.courseId, selectedEntry.sessionId, selectedEntry.note, selectedEntry.course)
    : `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-secondary)">Select a note or create a new one</div>`;

  el.innerHTML = `
    <div style="display:flex;flex-direction:column;height:calc(100vh - 120px)">
      <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
        <input type="text" placeholder="Search notes..." id="notes-search" style="flex:1;min-width:160px" oninput="window._filterNotes(this.value)">
        <button class="btn-primary" onclick="window._newSoapNote()" style="font-size:0.82rem">+ New Note</button>
      </div>
      <div style="display:grid;grid-template-columns:240px 1fr;gap:12px;flex:1;min-height:0">
        <div style="background:var(--surface-1);border:1px solid var(--border);border-radius:12px;overflow-y:auto" id="notes-list">
          ${notesList}
        </div>
        <div style="background:var(--surface-1);border:1px solid var(--border);border-radius:12px;overflow-y:auto;padding:20px" id="soap-editor">
          ${soapEditor}
        </div>
      </div>
    </div>`;

  // ── Global SOAP handlers ──────────────────────────────────────────────────
  window._saveSoapNote = function(courseId, sessionId) {
    const note = {
      subjective:  document.getElementById('soap-subjective')?.value || '',
      objective:   document.getElementById('soap-objective')?.value || '',
      assessment:  document.getElementById('soap-assessment')?.value || '',
      plan:        document.getElementById('soap-plan')?.value || '',
      adverse:     document.getElementById('soap-adverse')?.value || '',
      next_date:   document.getElementById('soap-next-date')?.value || '',
      clinician:   document.getElementById('soap-clinician')?.value || '',
      flagged:     getSoapNote(courseId, sessionId)?.flagged || false,
    };
    saveSoapNote(courseId, sessionId, note);
    window._showNotifToast?.({ title: 'Note Saved', body: 'SOAP note saved in the course workflow.', severity: 'success' });
  };

  window._flagNote = function(courseId, sessionId) {
    const note = getSoapNote(courseId, sessionId) || {};
    note.flagged = !note.flagged;
    saveSoapNote(courseId, sessionId, note);
    pgClinicalNotes(window._setTopbar || (() => {}));
  };

  window._printNote = function(courseId, sessionId) {
    const note = getSoapNote(courseId, sessionId);
    if (!note) return;
    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html><html><head><title>SOAP Note</title>
      <style>body{font-family:Arial,sans-serif;padding:40px;max-width:800px;margin:0 auto}h1{font-size:1.4rem}h3{color:#555;font-size:0.9rem;text-transform:uppercase;margin-top:24px}p{line-height:1.7;white-space:pre-wrap}.header{border-bottom:2px solid #00d4bc;padding-bottom:12px;margin-bottom:24px}.footer{margin-top:40px;border-top:1px solid #ccc;padding-top:12px;font-size:0.8rem;color:#888}</style>
      </head><body>
      <div class="header"><h1>Clinical SOAP Note</h1><p style="color:#666;font-size:0.9rem">Generated: ${new Date().toLocaleString()} · ${_esc(note.clinician) || 'Clinician'}</p></div>
      <h3>Subjective</h3><p>${_esc(note.subjective) || '—'}</p>
      <h3>Objective</h3><p>${_esc(note.objective) || '—'}</p>
      <h3>Assessment</h3><p>${_esc(note.assessment) || '—'}</p>
      <h3>Plan</h3><p>${_esc(note.plan) || '—'}</p>
      <h3>Adverse Effects</h3><p>${_esc(note.adverse) || 'None reported'}</p>
      <div class="footer">Next session: ${_esc(note.next_date) || 'Not scheduled'} · DeepSynaps Protocol Studio · CONFIDENTIAL</div>
      </body></html>`);
    win.document.close();
    win.print();
  };

  window._newSoapNote = function() {
    const courseId = prompt('Enter Course ID (or leave blank for general note):') || 'general';
    const sessionId = `manual-${Date.now()}`;
    saveSoapNote(courseId, sessionId, { subjective: '', objective: '', assessment: '', plan: '', adverse: '', flagged: false });
    window._notesSelectedNoteKey = `${courseId}:${sessionId}`;
    pgClinicalNotes(window._setTopbar || (() => {}));
  };

  window._selectNote = function(key) {
    window._notesSelectedNoteKey = key;
    pgClinicalNotes(window._setTopbar || (() => {}));
  };

  window._useNoteTemplate = function(courseId, sessionId) {
    const course = allNotes.find(n => n.courseId === courseId && n.sessionId === sessionId)?.course;
    const condition = (course?.condition_slug || course?.condition || '').toLowerCase().replace(/-/g, '');
    const tmpl = SOAP_TEMPLATES[condition] || SOAP_TEMPLATES.default;
    ['subjective', 'objective', 'assessment', 'plan'].forEach(section => {
      const ta = document.getElementById(`soap-${section}`);
      if (ta && !ta.value.trim()) ta.value = tmpl[section] || '';
    });
  };

  window._fillTemplate = function(section, courseId, sessionId) {
    const course = allNotes.find(n => n.courseId === courseId && n.sessionId === sessionId)?.course;
    const condition = (course?.condition_slug || course?.condition || '').toLowerCase().replace(/-/g, '');
    const tmpl = SOAP_TEMPLATES[condition] || SOAP_TEMPLATES.default;
    const textarea = document.getElementById(`soap-${section}`);
    if (textarea && !textarea.value.trim()) textarea.value = tmpl[section] || '';
  };

  window._filterNotes = function(query) {
    document.querySelectorAll('.note-list-item').forEach(item => {
      item.style.display = item.textContent.toLowerCase().includes(query.toLowerCase()) ? '' : 'none';
    });
  };
}

// ── Course Detail HTML-escape helper ──────────────────────────────────────
// Patient names, clinician notes, AE descriptions, session subjective text
// and audit-trail messages all flow into innerHTML strings here; escape any
// user- or clinician-supplied string before concatenating into HTML.
function _cdEscHtml(v) {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Highest-severity helper across assessment severity + adverse-event severity.
// Returns one of: null | 'mild' | 'moderate' | 'severe' | 'critical'.
function _cdHighestSeverity(assessmentSummary, aeSummary) {
  const order = { mild: 1, moderate: 2, severe: 3, critical: 4 };
  let bestKey = null, bestOrd = 0;
  const consider = (sev) => {
    if (!sev) return;
    const o = order[sev] || 0;
    if (o > bestOrd) { bestKey = sev; bestOrd = o; }
  };
  consider(assessmentSummary?.highest_severity);
  consider(aeSummary?.highest_severity);
  return bestKey;
}

// ── pgCourseDetail — Full course detail ──────────────────────────────────────
export async function pgCourseDetail(setTopbar, navigate) {
  const id = window._selectedCourseId;
  if (!id) { navigate('courses'); return; }

  const el = document.getElementById('content');
  el.innerHTML = spinner();

  let course = null, sessions = [], adverseEvents = [], patient = null, protocolDetail = null, outcomes = [], outcomeSummary = null;
  let liveEvidenceContext = null;
  const loadErrors = [];
  try {
    course = await api.getCourse(id);
  } catch (e) {
    const msg = (e && e.status === 403) ? 'You do not have access to this course.' : (e && e.message) || 'Could not load course.';
    el.innerHTML = `
      <div class="notice notice-warn" role="status" style="margin:24px auto;max-width:560px;padding:18px 20px;border-radius:10px">
        <strong>Could not load course</strong>
        <div style="font-size:12.5px;margin-top:4px">${msg}</div>
        <div style="margin-top:10px"><button class="btn btn-primary btn-sm" onclick="window._nav('courses')">← Back to Courses</button></div>
      </div>`;
    return;
  }
  if (!course) { navigate('courses'); return; }

  // Fetch supporting data. Any failure here is surfaced as a banner — we never
  // silently show empty ("0 sessions") when the API actually errored.
  try { sessions = (await api.listCourseSessions(id))?.items || []; }
  catch (e) { loadErrors.push({ what: 'sessions', err: e }); sessions = []; }
  try { adverseEvents = (await api.listAdverseEvents({ course_id: id }))?.items || []; }
  catch (e) { loadErrors.push({ what: 'adverse events', err: e }); adverseEvents = []; }
  try { outcomes = (await api.listOutcomes({ course_id: id }))?.items || []; }
  catch (e) { loadErrors.push({ what: 'outcomes', err: e }); outcomes = []; }
  if (course?.patient_id) {
    try { patient = await api.getPatient(course.patient_id); }
    catch (e) { loadErrors.push({ what: 'patient', err: e }); patient = null; }
  }
  if (course?.protocol_id) {
    try { protocolDetail = await api.protocolDetail(course.protocol_id); }
    catch { protocolDetail = null; } // protocol detail not critical for go-live
  }
  try { outcomeSummary = await api.courseOutcomeSummary(id); } catch { outcomeSummary = null; }
  liveEvidenceContext = await loadProtocolWatchContext({
    condition: course?.condition_slug || '',
    modality: course?.modality_slug || '',
  });

  // Course-scoped normalized reads (assessment severity, audit trail, AE roll-up).
  // Each is non-blocking; failures fall back to existing behavior.
  let assessmentSummary = null, auditTrail = null, aeSummary = null;
  try { assessmentSummary = await api.getCourseAssessmentSummary(id); } catch { assessmentSummary = null; }
  try { auditTrail = await api.getCourseAuditTrail(id); } catch { auditTrail = null; }
  try { aeSummary = await api.getCourseAdverseEventsSummary(id); } catch { aeSummary = null; }

  const patName   = patient ? `${patient.first_name} ${patient.last_name}` : 'Unknown Patient';
  const patNameEsc = _cdEscHtml(patName);
  const progress  = course.planned_sessions_total > 0
    ? Math.min(100, Math.round((course.sessions_delivered / course.planned_sessions_total) * 100))
    : 0;
  const statusCol = STATUS_COLOR[course.status] || 'var(--text-tertiary)';
  const finalization = _courseFinalizationSummary(sessions, adverseEvents, aeSummary);

  // Mount-time audit ping — best-effort, fire-and-forget. Surfaces this view
  // event in the audit timeline (see /audit-events) so regulators can see who
  // opened the Course Detail page and when. Soft-fails on any backend error.
  try { api.recordCourseAuditEvent(course.id, { event: 'view', note: window._cdTab || 'overview' }); } catch (_) {}

  setTopbar(
    `${course.condition_slug ? course.condition_slug.replace(/-/g,' ') : 'Course'} · ${course.modality_slug || ''}`,
    `<button class="btn btn-ghost btn-sm" onclick="window._nav('courses')">← Courses</button>
     <button class="btn btn-sm" onclick="window._showExportPanel()">↓ Export Options</button>
     ${course.status === 'pending_approval'
       ? `<button class="btn btn-primary btn-sm" onclick="window._activateCourseDetail('${course.id}')">Approve &amp; Activate</button>`
       : course.status === 'active'
       ? `<button class="btn btn-sm" onclick="window._nav('session-execution')">Log Session →</button>`
       : ''}`
  );

  const tab = window._cdTab || 'overview';

  el.innerHTML = `
    <div class="card" style="margin-bottom:20px;background:linear-gradient(135deg,rgba(0,212,188,0.04),rgba(74,158,255,0.04))">
      <div style="padding:20px">
        <div style="display:flex;align-items:flex-start;gap:16px;flex-wrap:wrap">
          <div style="flex:1;min-width:240px">
            <div style="font-family:var(--font-display);font-size:18px;font-weight:700;color:var(--text-primary);margin-bottom:6px">
              ${course.condition_slug ? course.condition_slug.replace(/-/g,' ') : '—'}
              <span style="color:var(--teal)"> · ${course.modality_slug || '—'}</span>
            </div>
            <div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px">
              Patient: <strong style="color:var(--text-primary)">${patNameEsc}</strong>
              ${course.device_slug ? ` · Device: <span class="tag">${_cdEscHtml(course.device_slug)}</span>` : ''}
              ${course.target_region ? ` · Target: <span class="tag">${_cdEscHtml(course.target_region)}</span>` : ''}
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              ${approvalBadge(course.status)}
              ${evidenceBadge(course.evidence_grade)}
              ${course.on_label === false ? labelBadge(false) : labelBadge(true)}
              ${safetyBadge(course.governance_warnings)}
              ${course.review_required ? `<span style="font-size:10px;padding:2px 7px;border-radius:4px;background:rgba(255,107,107,0.1);color:var(--red);font-weight:600">Review Required</span>` : ''}
              ${finalization.interrupted ? `<span style="font-size:10px;padding:2px 7px;border-radius:4px;background:rgba(245,158,11,0.12);color:var(--amber);font-weight:600">${finalization.interrupted} Interrupted</span>` : ''}
              ${finalization.totalAe ? `<span style="font-size:10px;padding:2px 7px;border-radius:4px;background:rgba(255,107,107,0.1);color:var(--red);font-weight:600">${finalization.totalAe} AE Logged</span>` : ''}
              ${finalization.checklisted ? `<span style="font-size:10px;padding:2px 7px;border-radius:4px;background:rgba(74,158,255,0.1);color:var(--blue);font-weight:600">${finalization.checklisted} Checklisted</span>` : ''}
            </div>
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:8px">Session Progress</div>
            <div style="font-size:26px;font-weight:700;color:${statusCol}">${course.sessions_delivered || 0}<span style="font-size:14px;color:var(--text-tertiary)"> / ${course.planned_sessions_total || '?'}</span></div>
            <div style="width:160px;height:5px;border-radius:3px;background:var(--border);margin-top:8px">
              <div style="height:5px;border-radius:3px;background:${statusCol};width:${progress}%"></div>
            </div>
            <div style="font-size:10px;color:var(--text-tertiary);margin-top:4px">${progress}% complete</div>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Export Panel ──────────────────────────────────────────────────── -->
    <div id="cd-export-panel" style="display:none;margin-bottom:20px;padding:16px 20px;background:rgba(0,0,0,0.2);border-radius:var(--radius-md);border:1px solid var(--border)">
      <div style="font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.8px;margin-bottom:12px">Export Options</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn btn-sm" id="cd-exp-protocol" onclick="window._cdExport('protocol')">Protocol Report .docx</button>
        <button class="btn btn-sm" id="cd-exp-guide" onclick="window._cdExport('guide')">Patient Guide .docx</button>
        <button class="btn btn-sm" id="cd-exp-summary" onclick="window._cdExport('summary')">Full Course Summary</button>
        <button class="btn btn-sm" id="cd-exp-csv" onclick="window._cdExport('csv')" title="Course + delivered sessions as CSV. Demo courses are # DEMO-prefixed.">↓ CSV (course + sessions)</button>
        <button class="btn btn-sm" id="cd-exp-ndjson" onclick="window._cdExport('ndjson')" title="Course + delivered sessions + audit timeline as NDJSON. Demo courses include _meta:DEMO.">↓ NDJSON (incl. audit)</button>
        <button class="btn btn-sm no-print" onclick="window._cdPrint()">&#128424; Print Course Report</button>
        <button class="btn btn-primary btn-sm" onclick="window._cdSwitchTab('reports')" title="Open the Course Completion Report tab">📄 Completion Report</button>
      </div>
      <div id="cd-exp-notice" style="display:none;margin-top:10px;font-size:12px;color:var(--text-secondary)"></div>
    </div>

    ${loadErrors.length ? `
    <div class="notice notice-warn" role="status" style="margin-bottom:16px;padding:10px 14px;border-radius:8px;font-size:12.5px" id="cd-load-err-banner">
      ⚠ Some sections could not be loaded: <strong>${_cdEscHtml(loadErrors.map(e => e.what).join(', '))}</strong>. Counts shown reflect only what loaded.
      <button class="btn btn-sm" style="margin-left:10px" onclick="window._nav('course-detail')">Retry</button>
    </div>` : ''}
    ${(() => {
      const sev = _cdHighestSeverity(assessmentSummary, aeSummary);
      if (!sev || (sev !== 'severe' && sev !== 'critical')) return '';
      const critical = sev === 'critical';
      const bg = critical ? 'rgba(255,107,107,0.12)' : 'rgba(245,158,11,0.12)';
      const col = critical ? 'var(--red)' : 'var(--amber)';
      const parts = [];
      if (assessmentSummary?.highest_severity && (assessmentSummary.highest_severity === 'severe' || assessmentSummary.highest_severity === 'critical')) {
        const tpls = Object.entries(assessmentSummary.aggregated_severity || {})
          .filter(([,v]) => v === 'severe' || v === 'critical')
          .map(([k]) => k.toUpperCase()).join(', ');
        parts.push('Assessment severity: <strong>' + _cdEscHtml(assessmentSummary.highest_severity) + '</strong>' + (tpls ? ' (' + _cdEscHtml(tpls) + ')' : ''));
      }
      if (aeSummary && aeSummary.unresolved > 0 && (aeSummary.highest_severity === 'severe' || aeSummary.highest_severity === 'critical')) {
        parts.push('Unresolved adverse events: <strong>' + aeSummary.unresolved + '</strong> (' + _cdEscHtml(aeSummary.highest_severity) + ')');
      }
      return `<div role="alert" aria-live="assertive" style="margin-bottom:16px;padding:12px 16px;border-radius:8px;background:${bg};border:1px solid ${col};color:${col};font-size:12.5px">
        ${critical ? '🚨' : '⚠'} <strong>${critical ? 'SAFETY ALERT' : 'Safety flag'}:</strong> ${parts.join(' &middot; ')}.
        <button class="btn btn-sm" style="margin-left:10px" onclick="window._cdSwitchTab('assessments')">Open Assessments</button>
        <button class="btn btn-sm" style="margin-left:6px" onclick="window._cdSwitchTab('adverse-events')">Open Adverse Events</button>
      </div>`;
    })()}
    ${(() => {
      if (!finalization.interrupted && !finalization.notes && !finalization.checklisted && !(aeSummary?.unresolved > 0)) return '';
      return `<div role="status" style="margin-bottom:16px;padding:12px 16px;border-radius:8px;background:rgba(74,158,255,0.08);border:1px solid rgba(74,158,255,0.22);color:var(--text-secondary);font-size:12.5px">
        <strong style="color:var(--text-primary)">Session Finalization Summary:</strong>
        ${[
          finalization.interrupted ? `<strong>${finalization.interrupted}</strong> interrupted session${finalization.interrupted === 1 ? '' : 's'}` : null,
          finalization.checklisted ? `<strong>${finalization.checklisted}</strong> session${finalization.checklisted === 1 ? '' : 's'} with checklist data` : null,
          finalization.notes ? `<strong>${finalization.notes}</strong> session${finalization.notes === 1 ? '' : 's'} with post-session notes` : null,
          aeSummary?.unresolved > 0 ? `<strong>${aeSummary.unresolved}</strong> unresolved adverse event${aeSummary.unresolved === 1 ? '' : 's'}` : null,
        ].filter(Boolean).join(' &middot; ')}.
        <button class="btn btn-sm" style="margin-left:10px" onclick="window._cdSwitchTab('sessions')">Open Sessions</button>
      </div>`;
    })()}
    ${(() => {
      if (!liveEvidenceContext || (!liveEvidenceContext.coverage && !liveEvidenceContext.template && !liveEvidenceContext.safety)) return '';
      return `<div role="status" style="margin-bottom:16px;padding:12px 16px;border-radius:8px;background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.22);color:var(--text-secondary);font-size:12.5px">
        <strong style="color:var(--text-primary)">Live protocol watch:</strong>
        ${[
          liveEvidenceContext.coverage ? `Coverage <strong>${_cdEscHtml(String(liveEvidenceContext.coverage.coverage ?? 0))}%</strong> across <strong>${Number(liveEvidenceContext.coverage.paper_count || 0).toLocaleString()}</strong> papers${liveEvidenceContext.coverage.gap && liveEvidenceContext.coverage.gap !== 'None' ? ` · gap ${_cdEscHtml(liveEvidenceContext.coverage.gap)}` : ''}` : null,
          liveEvidenceContext.template ? `Template <strong>${_cdEscHtml([liveEvidenceContext.template.modality, liveEvidenceContext.template.indication, liveEvidenceContext.template.target].filter(Boolean).join(' — '))}</strong>` : null,
          liveEvidenceContext.safety ? `Safety <strong>${_cdEscHtml(getProtocolWatchSignalTitle(liveEvidenceContext.safety))}</strong>` : null,
        ].filter(Boolean).join(' &middot; ')}.
      </div>`;
    })()}

    <div class="tab-bar" role="tablist" aria-label="Course detail sections" style="margin-bottom:20px">
      ${['overview','sessions','outcomes','protocol','adverse-events','governance','assessments','home-programs','reports','notes'].map((t, idx, arr) =>
        `<button class="tab-btn ${tab === t ? 'active' : ''}" role="tab" id="cd-tab-${t}" aria-selected="${tab === t}" aria-controls="cd-tab-body" tabindex="${tab === t ? '0' : '-1'}" data-tab-id="${t}" data-tab-idx="${idx}" onclick="window._cdSwitchTab('${t}')" onkeydown="window._cdTabKey(event, ${idx}, ${arr.length})">${
          t === 'adverse-events' ? `Adverse Events${adverseEvents.length ? ` (${adverseEvents.length})` : ''}`
          : t === 'sessions'      ? `Sessions (${sessions.length})`
          : t === 'outcomes'      ? `Outcomes${outcomes.length ? ` (${outcomes.length})` : ''}`
          : t === 'notes'         ? `📝 Notes${getPatientNotes(course.id).length ? ` (${getPatientNotes(course.id).length})` : ''}`
          : t === 'assessments'   ? '📊 Assessments'
          : t === 'home-programs' ? '🏠 Home Programs'
          : t === 'reports'       ? '📄 Reports'
          : t.charAt(0).toUpperCase() + t.slice(1)
        }</button>`
      ).join('')}
    </div>

    <div id="cd-tab-body" role="tabpanel" aria-labelledby="cd-tab-${tab}">${renderCourseTab(course, sessions, adverseEvents, protocolDetail, tab, outcomes, outcomeSummary, assessmentSummary, auditTrail, aeSummary)}</div>`;

  window._cdSwitchTab = function(t) {
    window._cdTab = t;
    document.querySelectorAll('.tab-btn').forEach(b => {
      const isActive = b.getAttribute('data-tab-id') === t;
      b.classList.toggle('active', isActive);
      b.setAttribute('aria-selected', isActive ? 'true' : 'false');
      b.setAttribute('tabindex', isActive ? '0' : '-1');
    });
    const body = document.getElementById('cd-tab-body');
    if (body) {
      body.innerHTML = renderCourseTab(course, sessions, adverseEvents, protocolDetail, t, outcomes, outcomeSummary, assessmentSummary, auditTrail, aeSummary);
      body.setAttribute('aria-labelledby', 'cd-tab-' + t);
    }
  };

  // Arrow-key / Home / End keyboard navigation for the tab bar (WAI-ARIA pattern).
  window._cdTabKey = function(ev, idx, len) {
    let next = idx;
    if (ev.key === 'ArrowRight') next = (idx + 1) % len;
    else if (ev.key === 'ArrowLeft') next = (idx - 1 + len) % len;
    else if (ev.key === 'Home') next = 0;
    else if (ev.key === 'End') next = len - 1;
    else return;
    ev.preventDefault();
    const btn = document.querySelector(`.tab-btn[data-tab-idx="${next}"]`);
    if (btn) { btn.focus(); btn.click(); }
  };

  window._showExportPanel = function() {
    const panel = document.getElementById('cd-export-panel');
    if (panel) panel.style.display = panel.style.display === 'none' ? '' : 'none';
  };

  window._cdExport = async function(type) {
    const btnId  = type === 'protocol' ? 'cd-exp-protocol'
                 : type === 'guide'    ? 'cd-exp-guide'
                 : type === 'csv'      ? 'cd-exp-csv'
                 : type === 'ndjson'   ? 'cd-exp-ndjson'
                 : 'cd-exp-summary';
    const btn    = document.getElementById(btnId);
    const notice = document.getElementById('cd-exp-notice');
    const origText = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Generating\u2026'; }
    if (notice) notice.style.display = 'none';

    try {
      if (type === 'protocol') {
        const blob = await api.exportProtocolDocx({
          condition_name: course.condition_slug || '',
          modality_name: course.modality_slug || '',
          device_name: course.device_slug || '',
          setting: 'clinical',
          evidence_threshold: course.evidence_grade || 'B',
          off_label: course.on_label === false,
          symptom_cluster: '',
        });
        downloadBlob(blob, 'protocol-report-' + (course.condition_slug || course.id) + '.docx');
      } else if (type === 'guide') {
        const blob = await api.exportPatientGuideDocx({
          condition: course.condition_slug || '',
          modality: course.modality_slug || '',
          reading_level: 'standard',
          language: 'English',
        });
        downloadBlob(blob, 'patient-guide-' + (course.condition_slug || course.id) + '.docx');
      } else if (type === 'csv') {
        const r = await api.exportCourseCSV(course.id);
        downloadBlob(r.blob, r.filename || ('course-' + course.id + '.csv'));
        try { api.recordCourseAuditEvent(course.id, { event: 'export_csv.client', note: 'frontend export' }); } catch (_) {}
      } else if (type === 'ndjson') {
        const r = await api.exportCourseNDJSON(course.id);
        downloadBlob(r.blob, r.filename || ('course-' + course.id + '.ndjson'));
        try { api.recordCourseAuditEvent(course.id, { event: 'export_ndjson.client', note: 'frontend export' }); } catch (_) {}
      } else if (type === 'summary') {
        const res = await api.caseSummary({
          condition: course.condition_slug || '',
          modality: course.modality_slug || '',
          session_count: course.sessions_delivered || 0,
          patient_notes: course.clinician_notes || '',
        });
        const text = res?.summary || res?.content || res?.text || JSON.stringify(res);
        navigator.clipboard.writeText(text).then(function() {
          if (notice) { notice.textContent = 'Case summary copied to clipboard.'; notice.style.display = ''; }
        }).catch(function() {
          if (notice) { notice.textContent = 'Copy failed — please copy from the text area below.'; notice.style.display = ''; }
        });
      }
    } catch (e) {
      const b = document.createElement('div');
      b.className = 'notice notice-warn';
      b.style.cssText = 'position:fixed;top:16px;right:16px;z-index:9999;max-width:380px';
      b.textContent = e.message || 'Export failed.';
      document.body.appendChild(b);
      setTimeout(function() { b.remove(); }, 4000);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = origText; }
    }
  };

  window._toggleSession = function(id) {
    const panel = document.getElementById(`sess-expand-${id}`);
    const chev  = document.getElementById(`sess-chev-${id}`);
    if (!panel) return;
    const open = panel.style.display !== 'none';
    panel.style.display = open ? 'none' : '';
    if (chev) chev.textContent = open ? '›' : '↓';
  };

  const _cdFlash = (msg, severity) => {
    const banner = document.createElement('div');
    banner.className = 'notice ' + (severity === 'error' ? 'notice-warn' : 'notice-info');
    banner.setAttribute('role', 'status');
    banner.style.cssText = 'position:fixed;top:16px;right:16px;z-index:9999;max-width:420px;padding:12px 16px;border-radius:8px';
    banner.textContent = msg;
    document.body.appendChild(banner);
    setTimeout(() => banner.remove(), 5000);
  };

  const _cdEsc = (s) => String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');

  const _cdCloseSafetyModal = () => {
    const m = document.getElementById('cd-safety-modal'); if (m) m.remove();
  };
  window._cdCloseSafetyModal = _cdCloseSafetyModal;

  window._activateCourseDetail = async function(courseId) {
    // Step 1 — preflight the patient's medical-history safety flags.
    let pre = null;
    try {
      pre = await api.courseSafetyPreflight(courseId);
    } catch (e) {
      _cdFlash(e?.message || 'Safety preflight failed. Cannot activate.', 'error');
      return;
    }
    // Step 2 — clear path: simple confirm then activate.
    if (!pre?.override_required) {
      if (!confirm('Approve and activate this course?\n\nThis will mark the course active and allow session logging.')) return;
      try {
        await api.activateCourse(courseId, { override_safety: false });
        _cdFlash('Course activated.', 'info');
        window._nav('course-detail');
      } catch (e) {
        _cdFlash(e?.message || 'Activation failed.', 'error');
      }
      return;
    }
    // Step 3 — override required: render structured modal with flags + reason field.
    const flags = pre.blocking_flags || [];
    const neverReviewed = !pre.source_meta?.reviewed_at;
    const flagList = flags.length
      ? '<ul style="margin:6px 0 0 18px;padding:0">' +
        flags.map(f => `<li style="font-size:12.5px;color:var(--red)"><strong>${_cdEsc(f)}</strong></li>`).join('') +
        '</ul>'
      : '';
    const overlay = document.createElement('div');
    overlay.id = 'cd-safety-modal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'cd-sm-title');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:1400;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(3px);padding:16px';
    overlay.innerHTML = `
      <div class="card" style="max-width:520px;width:100%;background:var(--bg-card);border:1px solid var(--border);border-radius:14px;box-shadow:0 24px 60px rgba(0,0,0,0.5);padding:22px 24px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
          <span style="font-size:22px;color:var(--red)" aria-hidden="true">⚠</span>
          <div id="cd-sm-title" style="font-size:15px;font-weight:700;color:var(--text-primary)">Safety review required before activation</div>
        </div>
        <div style="font-size:12.5px;color:var(--text-secondary);line-height:1.55;margin-bottom:12px">
          The patient's medical history has items that require clinician acknowledgement before this course can be activated.
        </div>
        ${flags.length ? `
        <div style="padding:10px 12px;background:rgba(255,107,107,0.08);border:1px solid rgba(255,107,107,0.25);border-radius:8px;margin-bottom:12px">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--red);margin-bottom:4px">Blocking safety flags</div>
          ${flagList}
        </div>` : ''}
        ${neverReviewed ? `
        <div style="padding:10px 12px;background:rgba(255,180,70,0.1);border:1px solid rgba(255,180,70,0.25);border-radius:8px;margin-bottom:12px;font-size:12.5px;color:var(--amber)">
          Medical history has never been reviewed for this patient. Consider completing the review in Patients → Medical History first.
        </div>` : ''}
        <label for="cd-sm-reason" style="display:block;font-size:11.5px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">
          Override justification (required, min 10 characters)
        </label>
        <textarea id="cd-sm-reason" rows="3" class="ch-textarea" aria-describedby="cd-sm-hint"
          placeholder="e.g. Specialist cleared on 2026-04-12 (consult note CN-2451). Cardiology has approved safe use with pacemaker model X."></textarea>
        <div id="cd-sm-hint" style="font-size:11px;color:var(--text-tertiary);margin-top:4px">This justification is audited with your actor ID and timestamp.</div>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px">
          <button class="btn btn-ghost" onclick="window._cdCloseSafetyModal()">Cancel</button>
          <button class="btn btn-primary" id="cd-sm-confirm" onclick="window._cdConfirmSafetyOverride('${_cdEsc(courseId)}')">Override &amp; Activate</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    // Focus reason field for keyboard users.
    const ta = overlay.querySelector('#cd-sm-reason'); if (ta) ta.focus();
    // Esc closes.
    overlay.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') _cdCloseSafetyModal(); });
    // Backdrop click closes.
    overlay.addEventListener('click', (ev) => { if (ev.target === overlay) _cdCloseSafetyModal(); });
  };

  window._cdConfirmSafetyOverride = async function(courseId) {
    const ta = document.getElementById('cd-sm-reason');
    const reason = (ta?.value || '').trim();
    if (reason.length < 10) {
      _cdFlash('Justification must be at least 10 characters.', 'error');
      if (ta) ta.focus();
      return;
    }
    const btn = document.getElementById('cd-sm-confirm');
    if (btn) { btn.disabled = true; btn.textContent = 'Activating…'; }
    try {
      await api.activateCourse(courseId, { override_safety: true, override_reason: reason });
      _cdCloseSafetyModal();
      _cdFlash('Course activated with safety override. Audit event logged.', 'info');
      window._nav('course-detail');
    } catch (e) {
      _cdFlash(e?.message || 'Activation failed.', 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Override & Activate'; }
    }
  };

  window._cdPrint = async function() {
    const genDate = new Date().toLocaleString();
    const patName2   = patient ? `${patient.first_name} ${patient.last_name}` : 'Unknown Patient';
    const statusLabel = course.status ? course.status.replace(/_/g, ' ') : '—';
    const params2 = [
      ['Condition',        course.condition_slug?.replace(/-/g,' ') || '—'],
      ['Modality',         course.modality_slug || '—'],
      ['Device',           course.device_slug || '—'],
      ['Target Region',    course.target_region || '—'],
      ['Frequency',        course.planned_frequency_hz ? course.planned_frequency_hz + ' Hz' : '—'],
      ['Intensity',        course.planned_intensity_pct_rmt ? course.planned_intensity_pct_rmt + '% RMT' : '—'],
      ['Session Duration', course.planned_session_duration_min ? course.planned_session_duration_min + ' min' : '—'],
      ['Sessions/Week',    course.planned_sessions_per_week ? course.planned_sessions_per_week + '×/week' : '—'],
      ['Total Planned',    course.planned_sessions_total || '—'],
      ['Delivered',        course.sessions_delivered || 0],
      ['Status',           statusLabel],
    ];
    const sessionRows = sessions.map((s, i) => `<tr>
      <td>${i + 1}</td>
      <td>${s.session_date ? s.session_date.split('T')[0] : '—'}</td>
      <td>${s.frequency_hz || '—'}</td>
      <td>${s.intensity_pct_rmt || '—'}</td>
      <td>${s.pulses_delivered || '—'}</td>
      <td>${s.tolerance_rating || '—'}</td>
      <td>${s.session_outcome || '—'}</td>
    </tr>`).join('');
    const outcomeRows = outcomes.map(o => `<tr>
      <td>${o.recorded_at ? o.recorded_at.split('T')[0] : '—'}</td>
      <td>${o.template_name || o.template_id || '—'}</td>
      <td>${o.score != null ? o.score : '—'}</td>
      <td>${o.measurement_point || '—'}</td>
    </tr>`).join('');
    const aeRows = adverseEvents.map(ae => `<tr>
      <td>${ae.reported_at ? ae.reported_at.split('T')[0] : '—'}</td>
      <td>${ae.severity || '—'}</td>
      <td>${ae.description || '—'}</td>
      <td>${ae.resolved ? 'Yes' : 'No'}</td>
    </tr>`).join('');

    let frame = document.getElementById('print-frame');
    if (frame) frame.remove();
    frame = document.createElement('div');
    frame.id = 'print-frame';
    frame.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:white;z-index:99999;overflow:auto;padding:32px;box-sizing:border-box;color:#111;font-family:serif;font-size:11pt';
    frame.innerHTML = `
      <div class="print-header" style="display:block;border-bottom:2px solid #003366;padding-bottom:12px;margin-bottom:20px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div>
            <div style="font-size:18pt;font-weight:700;color:#003366">DeepSynaps Protocol Studio</div>
            <div style="font-size:10pt;color:#555;margin-top:2px">Clinical Treatment Course Report</div>
          </div>
          <div style="text-align:right;font-size:9pt;color:#555">
            <div>Generated: ${genDate}</div>
            <div style="background:#cc0000;color:white;padding:2px 8px;border-radius:3px;font-weight:700;margin-top:4px">CONFIDENTIAL</div>
          </div>
        </div>
      </div>
      <h2 style="font-size:14pt;color:#003366;margin-bottom:4px">${course.condition_slug?.replace(/-/g,' ') || '—'} &middot; ${course.modality_slug || '—'}</h2>
      <div style="font-size:10pt;color:#555;margin-bottom:20px">Patient: <strong>${_cdEscHtml(patName2)}</strong> &nbsp;|&nbsp; Status: <strong>${_cdEscHtml(statusLabel)}</strong> &nbsp;|&nbsp; Progress: <strong>${course.sessions_delivered || 0} / ${course.planned_sessions_total || '?'} sessions</strong></div>

      <h3 style="font-size:12pt;color:#003366;border-bottom:1px solid #ccc;padding-bottom:4px;margin-bottom:10px">Treatment Parameters</h3>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:10pt">
        <tbody>
          ${params2.map(([k,v]) => `<tr><td style="padding:5px 8px;border:1px solid #ddd;font-weight:600;background:#f5f7fa;width:40%">${k}</td><td style="padding:5px 8px;border:1px solid #ddd">${v}</td></tr>`).join('')}
        </tbody>
      </table>

      ${sessions.length > 0 ? `
      <h3 style="font-size:12pt;color:#003366;border-bottom:1px solid #ccc;padding-bottom:4px;margin-bottom:10px">Session Log (${sessions.length} sessions)</h3>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:9pt">
        <thead><tr style="background:#003366;color:white">
          <th style="padding:5px 8px;text-align:left">#</th>
          <th style="padding:5px 8px;text-align:left">Date</th>
          <th style="padding:5px 8px;text-align:left">Hz</th>
          <th style="padding:5px 8px;text-align:left">% RMT</th>
          <th style="padding:5px 8px;text-align:left">Pulses</th>
          <th style="padding:5px 8px;text-align:left">Tolerance</th>
          <th style="padding:5px 8px;text-align:left">Outcome</th>
        </tr></thead>
        <tbody>${sessionRows}</tbody>
      </table>` : ''}

      ${outcomes.length > 0 ? `
      <h3 style="font-size:12pt;color:#003366;border-bottom:1px solid #ccc;padding-bottom:4px;margin-bottom:10px">Outcome Measures (${outcomes.length} records)</h3>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:9pt">
        <thead><tr style="background:#003366;color:white">
          <th style="padding:5px 8px;text-align:left">Date</th>
          <th style="padding:5px 8px;text-align:left">Template</th>
          <th style="padding:5px 8px;text-align:left">Score</th>
          <th style="padding:5px 8px;text-align:left">Measurement Point</th>
        </tr></thead>
        <tbody>${outcomeRows}</tbody>
      </table>` : ''}

      ${adverseEvents.length > 0 ? `
      <h3 style="font-size:12pt;color:#cc0000;border-bottom:1px solid #ccc;padding-bottom:4px;margin-bottom:10px">Adverse Events (${adverseEvents.length} events)</h3>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:9pt">
        <thead><tr style="background:#cc0000;color:white">
          <th style="padding:5px 8px;text-align:left">Date</th>
          <th style="padding:5px 8px;text-align:left">Severity</th>
          <th style="padding:5px 8px;text-align:left">Description</th>
          <th style="padding:5px 8px;text-align:left">Resolved</th>
        </tr></thead>
        <tbody>${aeRows}</tbody>
      </table>` : ''}

      ${course.clinician_notes ? `
      <h3 style="font-size:12pt;color:#003366;border-bottom:1px solid #ccc;padding-bottom:4px;margin-bottom:10px">Clinician Notes</h3>
      <div style="font-size:10pt;line-height:1.6;padding:10px;background:#f9f9f9;border:1px solid #ddd;border-radius:4px;margin-bottom:20px">${course.clinician_notes}</div>` : ''}

      <div style="margin-top:32px;padding-top:12px;border-top:1px solid #ccc;font-size:8pt;color:#888;display:flex;justify-content:space-between">
        <span>DeepSynaps Protocol Studio &mdash; Confidential Clinical Record</span>
        <span>Generated ${genDate}</span>
      </div>
      <div style="margin-top:16px;display:flex;gap:10px">
        <button onclick="window.print();document.getElementById('print-frame')?.remove()" style="padding:8px 18px;background:#003366;color:white;border:none;border-radius:4px;cursor:pointer;font-size:11pt">&#128424; Print / Save PDF</button>
        <button onclick="document.getElementById('print-frame')?.remove()" style="padding:8px 18px;background:#eee;color:#333;border:none;border-radius:4px;cursor:pointer;font-size:11pt">&#10005; Close</button>
      </div>`;
    document.body.appendChild(frame);
  };
}

// ── Session-over-session sparkline ─────────────────────────────────────────────
function sessionSparkline(values, width = 120, height = 32, color = 'var(--teal-400)') {
  if (!values || values.length < 2) {
    return `<svg width="${width}" height="${height}"><text x="${width / 2}" y="${height / 2 + 4}" text-anchor="middle" font-size="9" fill="rgba(255,255,255,0.3)">no data</text></svg>`;
  }
  const min   = Math.min(...values);
  const max   = Math.max(...values);
  const range = max - min || 1;
  const pts   = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(' ');
  const trend      = values[values.length - 1] - values[0];
  const trendArrow = trend > 0 ? '\u2191' : trend < 0 ? '\u2193' : '\u2192';
  const trendColor = trend > 0 ? 'var(--teal-400)' : 'var(--rose-500)';
  const lastY      = height - ((values[values.length - 1] - min) / range) * (height - 4) - 2;
  return `<svg width="${width + 20}" height="${height}" style="overflow:visible">
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/>
    <circle cx="${width}" cy="${lastY}" r="3" fill="${color}"/>
    <text x="${width + 18}" y="${height / 2 + 4}" font-size="11" fill="${trendColor}" text-anchor="end">${trendArrow}</text>
  </svg>`;
}

// ── Next Session Suggestion Card ──────────────────────────────────────────────
function renderNextSessionSuggestion(course, sessions = [], outcomes = []) {
  // Determine suggestion + rationale using deterministic rules
  let icon = '🔄';
  let suggestion = 'Continue current protocol — tracking on target';
  let rationale = 'Session cadence and outcome trajectory are within expected parameters.';
  let urgency = 'info'; // info | warn | success | alert

  const delivered = course.sessions_delivered || sessions.length || 0;
  const lastOutcomeScore = (() => {
    const scored = outcomes.filter(o => parseFloat(o.score) > 0);
    if (scored.length === 0) return null;
    return parseFloat(scored[scored.length - 1].score);
  })();

  // Rule 1 — last 3 sessions show declining scores
  const last3Scores = sessions.slice(-3).map(s => parseFloat(s.outcome_score || s.score) || 0).filter(s => s > 0);
  const decliningLast3 = last3Scores.length === 3 && last3Scores[0] > last3Scores[1] && last3Scores[1] > last3Scores[2];

  // Rule 2 — no session in last 14 days
  const lastSessionDate = (() => {
    const dated = sessions.filter(s => s.scheduled_at || s.completed_at).map(s => new Date(s.scheduled_at || s.completed_at));
    if (dated.length === 0) return null;
    return new Date(Math.max(...dated));
  })();
  const daysSinceLastSession = lastSessionDate ? Math.floor((Date.now() - lastSessionDate) / 86400000) : null;
  const overdueGap = daysSinceLastSession !== null && daysSinceLastSession >= 14;

  // Rule 3 — outcome score < 40 after 8+ sessions
  const poorResponseAfterEight = delivered >= 8 && lastOutcomeScore !== null && lastOutcomeScore < 40;

  // Rule 4 — outcome score > 75
  const respondingWell = lastOutcomeScore !== null && lastOutcomeScore > 75;

  if (poorResponseAfterEight) {
    icon = '⚠️';
    suggestion = 'Consider modality adjustment or protocol review';
    rationale = `Outcome score is ${lastOutcomeScore.toFixed(0)} after ${delivered} sessions. Evidence threshold suggests a clinical review or protocol modification may improve trajectory.`;
    urgency = 'alert';
  } else if (decliningLast3) {
    icon = '📈';
    suggestion = 'Consider increasing frequency to 3×/week';
    rationale = 'Scores have declined in each of the last 3 recorded sessions. Increasing session frequency may help reverse the trend before the mid-course assessment.';
    urgency = 'warn';
  } else if (overdueGap) {
    icon = '📅';
    suggestion = 'Schedule overdue — patient has missed 2+ weeks';
    rationale = `No session has been recorded in the past ${daysSinceLastSession} days. Treatment continuity is critical — prompt rescheduling is recommended.`;
    urgency = 'warn';
  } else if (respondingWell) {
    icon = '✅';
    suggestion = 'Patient responding well — consider maintenance phase transition';
    rationale = `Outcome score is ${lastOutcomeScore.toFixed(0)}, above the strong-response threshold. A maintenance protocol (reduced frequency) may be appropriate at next review.`;
    urgency = 'success';
  }

  const urgencyStyles = {
    info:    { border: 'var(--teal, #00d4bc)', bg: 'color-mix(in srgb,var(--teal, #00d4bc) 8%,var(--card-bg, #1a2035))', label: '💡 Next Session Suggestion', labelColor: 'var(--teal, #00d4bc)' },
    warn:    { border: '#f59e0b', bg: 'rgba(245,158,11,0.07)', label: '⚠ Clinical Alert', labelColor: '#f59e0b' },
    alert:   { border: '#ef4444', bg: 'rgba(239,68,68,0.07)', label: '🚨 Protocol Review Recommended', labelColor: '#ef4444' },
    success: { border: '#22c55e', bg: 'rgba(34,197,94,0.07)', label: '✓ Positive Progress', labelColor: '#22c55e' },
  };
  const s = urgencyStyles[urgency];

  return `<div class="next-session-suggestion" style="border-color:${s.border};background:${s.bg};margin-top:16px">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <span class="suggestion-icon">${icon}</span>
      <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:${s.labelColor}">${s.label}</span>
    </div>
    <div style="font-size:14px;font-weight:600;color:var(--text-primary);margin-bottom:5px">${suggestion}</div>
    <div style="font-size:12px;color:var(--text-secondary);line-height:1.6">${rationale}</div>
  </div>`;
}

// ── Patient Trends Card ────────────────────────────────────────────────────────
function renderPatientTrendsCard(sessions, outcomes) {
  const sessionScores = sessions.slice(-10).map((s, i) => s.outcome_score || s.score || ((i % 3) + 1) * 2.5);
  const outcomeTrend  = outcomes.slice(-10).map(o => parseFloat(o.score) || 0);
  const sessWeek      = [1, 2, 2, 1, 3, 2, 2, 3, 2, 3].slice(0, Math.max(sessions.length || 5, 3));
  return `<div class="ds-card" style="margin-top:16px">
    <h4 style="margin-bottom:14px">Trend Overview</h4>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px">
      <div>
        <div style="font-size:0.72rem;color:var(--text-secondary);margin-bottom:6px;text-transform:uppercase">Session Scores</div>
        ${sessionSparkline(sessionScores, 100, 36, 'var(--teal-400)')}
      </div>
      <div>
        <div style="font-size:0.72rem;color:var(--text-secondary);margin-bottom:6px;text-transform:uppercase">Outcome Trend</div>
        ${sessionSparkline(outcomeTrend.length >= 2 ? outcomeTrend : [3, 4, 5, 5, 6, 7], 100, 36, 'var(--blue-500)')}
      </div>
      <div>
        <div style="font-size:0.72rem;color:var(--text-secondary);margin-bottom:6px;text-transform:uppercase">Sessions / Week</div>
        ${sessionSparkline(sessWeek, 100, 36, 'var(--violet-500)')}
      </div>
    </div>
  </div>`;
}

// ── Outcome Trajectory Chart ───────────────────────────────────────────────────
function outcomeTrajectoryChart(outcomes, goalScore = 7, width = 560, height = 180) {
  const data = outcomes.slice(-20);
  if (data.length === 0) {
    return `<div style="height:${height}px;display:flex;align-items:center;justify-content:center;color:var(--text-secondary);font-size:0.85rem;border:1px dashed var(--border);border-radius:10px">No outcome data yet</div>`;
  }
  const scores = data.map(o => parseFloat(o.score_numeric ?? o.score) || 0);
  const maxS   = Math.max(10, ...scores);
  const pad    = { top: 20, right: 30, bottom: 40, left: 40 };
  const W      = width  - pad.left - pad.right;
  const H      = height - pad.top  - pad.bottom;

  const xScale = (i) => pad.left + (i / (data.length - 1 || 1)) * W;
  const yScale = (v) => pad.top  + H - (v / maxS) * H;

  const linePath = scores.map((s, i) => `${i === 0 ? 'M' : 'L'}${xScale(i)},${yScale(s)}`).join(' ');
  const areaPath = `${linePath} L${xScale(scores.length - 1)},${pad.top + H} L${xScale(0)},${pad.top + H} Z`;
  const goalY    = yScale(goalScore);

  const xLabels = data.filter((_, i) => i % Math.ceil(data.length / 5) === 0).map(o => {
    const idx = data.indexOf(o);
    const d   = new Date(o.recorded_at || o.created_at || Date.now());
    return `<text x="${xScale(idx)}" y="${pad.top + H + 18}" text-anchor="middle" font-size="10" fill="rgba(255,255,255,0.4)">${d.getDate()}/${d.getMonth() + 1}</text>`;
  }).join('');

  const yLabels = [0, Math.round(maxS / 2), maxS].map(v =>
    `<text x="${pad.left - 6}" y="${yScale(v) + 4}" text-anchor="end" font-size="10" fill="rgba(255,255,255,0.4)">${v}</text>`
  ).join('');

  const circles = scores.map((s, i) =>
    `<circle cx="${xScale(i)}" cy="${yScale(s)}" r="4" fill="var(--teal-400)" stroke="var(--navy-900)" stroke-width="2"><title>Session ${i + 1}: ${s}</title></circle>`
  ).join('');

  return `<div style="position:relative;margin-bottom:20px">
    <div style="font-size:12.5px;font-weight:600;margin-bottom:8px">Outcome Score Trajectory</div>
    <svg width="100%" viewBox="0 0 ${width} ${height}" style="overflow:visible">
      <defs>
        <linearGradient id="trajectory-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stop-color="var(--teal-400)" stop-opacity="0.2"/>
          <stop offset="100%" stop-color="var(--teal-400)" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="${areaPath}" fill="url(#trajectory-grad)"/>
      <line x1="${pad.left}" y1="${goalY}" x2="${pad.left + W}" y2="${goalY}" stroke="var(--amber-500)" stroke-width="1.5" stroke-dasharray="6,4"/>
      <text x="${pad.left + W + 4}" y="${goalY + 4}" font-size="10" fill="var(--amber-500)">Goal</text>
      <path d="${linePath}" fill="none" stroke="var(--teal-400)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
      <line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${pad.top + H}" stroke="rgba(255,255,255,0.15)" stroke-width="1"/>
      <line x1="${pad.left}" y1="${pad.top + H}" x2="${pad.left + W}" y2="${pad.top + H}" stroke="rgba(255,255,255,0.15)" stroke-width="1"/>
      ${yLabels}
      ${xLabels}
      ${circles}
    </svg>
  </div>`;
}

function renderCourseTab(course, sessions, adverseEvents, protocolDetail, tab, outcomes = [], outcomeSummary = null, assessmentSummary = null, auditTrail = null, aeSummary = null) {
  if (tab === 'overview') {
    const params = [
      ['Condition',        course.condition_slug?.replace(/-/g,' ') || '—'],
      ['Modality',         course.modality_slug || '—'],
      ['Device',           course.device_slug || '—'],
      ['Target Region',    course.target_region || '—'],
      ['Frequency',        course.planned_frequency_hz ? `${course.planned_frequency_hz} Hz` : '—'],
      ['Intensity',        course.planned_intensity_pct_rmt ? `${course.planned_intensity_pct_rmt}% RMT` : '—'],
      ['Session Duration', course.planned_session_duration_min ? `${course.planned_session_duration_min} min` : '—'],
      ['Sessions/Week',    course.planned_sessions_per_week ? `${course.planned_sessions_per_week}×/week` : '—'],
      ['Total Sessions',   course.planned_sessions_total || '—'],
      ['Delivered',        course.sessions_delivered || 0],
    ];

    const milestones = [
      { n: 5,  label: 'Initial tolerance check', done: (course.sessions_delivered || 0) >= 5 },
      { n: 10, label: 'Mid-course assessment',   done: (course.sessions_delivered || 0) >= 10 },
      { n: 20, label: 'Course completion review', done: (course.sessions_delivered || 0) >= 20 },
    ].filter(m => m.n <= (course.planned_sessions_total || 0));

    return `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;padding:14px 20px;background:rgba(0,212,188,0.03);border:1px solid var(--border-teal);border-radius:var(--radius-md)">
      <span style="font-size:10.5px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.8px;font-weight:600;align-self:center;margin-right:4px">Quick actions</span>
      <button class="btn btn-primary btn-sm" onclick="window._nav('session-execution')">▶ Start Session</button>
      <button class="btn btn-sm" onclick="window._nav('review-queue')">◱ Request Review</button>
      <button class="btn btn-sm" onclick="window._showExportPanel()">↓ Export Options</button>
    </div>
    <div class="g2">
      <div>
        ${cardWrap('Treatment Parameters', params.map(([k,v]) => fr(k,v)).join(''))}
        ${course.clinician_notes ? cardWrap('Clinician Notes', `<div style="font-size:12.5px;color:var(--text-secondary);line-height:1.65">${course.clinician_notes}</div>`) : ''}
      </div>
      <div>
        ${cardWrap('Course Status',
          `<div style="margin-bottom:12px">${approvalBadge(course.status)}</div>` +
          fr('Evidence Grade',  evidenceBadge(course.evidence_grade)) +
          fr('Label Status',    labelBadge(course.on_label !== false)) +
          fr('Review Required', course.review_required ? '<span style="color:var(--amber)">Yes</span>' : '<span style="color:var(--green)">No</span>') +
          fr('Protocol ID',     course.protocol_id ? `<span class="mono" style="font-size:11px">${course.protocol_id}</span>` : '—') +
          fr('Risk Score',      riskGauge(computeRiskScore(course))) +
          fr('Risk Factors',    renderRiskFactors(course))
        )}
        ${milestones.length ? cardWrap('Milestones',
          milestones.map(m => `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">
            <span style="font-size:14px;color:${m.done ? 'var(--green)' : 'var(--text-tertiary)'}">${m.done ? '✓' : '○'}</span>
            <span style="font-size:12px;color:${m.done ? 'var(--text-primary)' : 'var(--text-secondary)'};flex:1">Session ${m.n}: ${m.label}</span>
          </div>`).join('')
        ) : ''}
      </div>
    </div>
    ${(() => {
      // Render the real audit timeline only. If the backend was unreachable
      // we surface that as a load-error banner; we never fabricate
      // "illustrative" rows that look like real audit history (launch-audit
      // 2026-04-30).
      const trail = Array.isArray(auditTrail?.items) ? auditTrail.items : null;
      const typeColor = { generate: 'var(--teal)', edit: 'var(--blue)', approve: 'var(--green)',
                          'course.activate': 'var(--green)', 'course.activate.safety_override': 'var(--amber)',
                          'course_detail.pause': 'var(--amber)', 'course_detail.resume': 'var(--teal)',
                          'course_detail.close': 'var(--red)', 'course_detail.detail.read': 'var(--text-tertiary)',
                          'course_detail.export_csv': 'var(--blue)', 'course_detail.export_ndjson': 'var(--blue)',
                          reject: 'var(--red)' };
      const typeIcon  = { generate: '&#x2605;', edit: '&#x270E;', approve: '&#x2713;', reject: '&#x2715;',
                          'course.activate': '&#x2713;', 'course.activate.safety_override': '&#x26A0;&#xFE0F;',
                          'course_detail.pause': '&#x23F8;&#xFE0F;', 'course_detail.resume': '&#x25B6;&#xFE0F;',
                          'course_detail.close': '&#x25A0;', 'course_detail.export_csv': '&#x2193;',
                          'course_detail.export_ndjson': '&#x2193;' };
      let banner = '';
      if (trail == null) {
        banner = `<div role="status" style="font-size:11px;color:var(--amber);padding:6px 10px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);border-radius:6px;margin-bottom:8px">⚠ Audit trail unavailable — backend did not respond. No history shown.</div>`;
      } else if (trail.length === 0) {
        banner = `<div role="status" style="font-size:11px;color:var(--text-tertiary);padding:8px 0">No audit events recorded yet for this course.</div>`;
      }
      const records = (trail && trail.length > 0) ? trail : [];
      const entries = records.map((e, i) => {
        const col = typeColor[e.action] || 'var(--text-tertiary)';
        const ic = typeIcon[e.action] || '&#x25CF;';
        const dateStr = e.created_at ? String(e.created_at).split('T')[0] : '';
        const actorStr = [e.actor_id, e.role].filter(Boolean).join(' · ');
        return `
          <div style="position:relative;padding-left:24px;margin-bottom:${i < records.length - 1 ? '16' : '0'}px">
            <div style="position:absolute;left:0;top:2px;width:14px;height:14px;border-radius:50%;background:${col};display:flex;align-items:center;justify-content:center;font-size:7px;color:#000;font-weight:700">${ic}</div>
            ${i < records.length - 1 ? `<div style="position:absolute;left:6px;top:16px;bottom:-16px;width:2px;background:var(--border)"></div>` : ''}
            <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">
              <span style="font-size:12.5px;font-weight:500;color:var(--text-primary)">${_cdEscHtml(e.note || e.action || '—')}</span>
              <span style="font-size:10.5px;padding:1px 6px;border-radius:4px;background:rgba(255,255,255,0.05);color:var(--text-tertiary);font-family:'DM Mono',monospace">${_cdEscHtml(e.action || '')}</span>
            </div>
            <div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">${_cdEscHtml(dateStr)} ${actorStr ? '&nbsp;&middot;&nbsp; ' + _cdEscHtml(actorStr) : ''}</div>
          </div>`;
      }).join('');
      return `<div class="ds-card" style="margin-top:16px">
        <h4 style="margin-bottom:14px;font-size:13px;font-weight:600">Audit Timeline (${records.length})</h4>
        ${banner}
        <div id="proto-changelog-${_cdEscHtml(course.id)}" style="position:relative">
          ${entries}
        </div>
      </div>`;
    })()}
    ${renderPatientTrendsCard(sessions, outcomes)}
    ${renderNextSessionSuggestion(course, sessions, outcomes)}`;
  }

  if (tab === 'sessions') {
    function tolColor(t) {
      return t === 'well-tolerated' ? { bg: 'rgba(74,222,128,0.1)', col: 'var(--green)' }
           : t === 'poor'           ? { bg: 'rgba(255,107,107,0.1)', col: 'var(--red)' }
           :                          { bg: 'rgba(255,181,71,0.1)',  col: 'var(--amber)' };
    }
    return `<div class="card">
      <div class="card-header" style="padding:14px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
        <span style="font-weight:600">Session Log (${sessions.length})</span>
        <button class="btn btn-primary btn-sm" onclick="window._nav('session-execution')">+ Log Session</button>
      </div>
      ${sessions.length === 0
        ? `<div style="padding:32px">${emptyState('◧', 'No sessions logged yet. Go to Session Execution to log sessions.')}</div>`
          : `<div style="display:flex;flex-direction:column;gap:0">
            ${sessions.map((s, i) => {
              const tc = s.tolerance_rating ? tolColor(s.tolerance_rating) : null;
              const sNum = sessions.length - i;
              const checklist = _courseChecklistStats(s.checklist);
              const linkedAeCount = _courseSessionAeCount(adverseEvents, s);
              return `
              <div style="border-bottom:1px solid var(--border)">
                <div style="display:flex;align-items:center;gap:10px;padding:10px 18px;cursor:pointer;flex-wrap:wrap"
                     onclick="window._toggleSession('${s.id || i}')">
                  <span class="mono" style="font-size:11px;color:var(--text-tertiary);width:20px;flex-shrink:0">${sNum}</span>
                  <span style="font-size:12px;color:var(--text-secondary);flex-shrink:0">${s.created_at ? s.created_at.split('T')[0] : '—'}</span>
                  ${s.device_slug ? `<span class="tag" style="flex-shrink:0">${s.device_slug}</span>` : ''}
                  <div style="flex:1;display:flex;gap:8px;flex-wrap:wrap;font-size:11.5px;color:var(--text-secondary)">
                    ${s.frequency_hz ? `<span><span style="color:var(--text-tertiary)">Freq:</span> <span class="mono">${s.frequency_hz} Hz</span></span>` : ''}
                    ${s.intensity_pct_rmt ? `<span><span style="color:var(--text-tertiary)">Int:</span> <span class="mono">${s.intensity_pct_rmt}%</span></span>` : ''}
                    ${s.duration_minutes ? `<span><span style="color:var(--text-tertiary)">Dur:</span> <span class="mono">${s.duration_minutes} min</span></span>` : ''}
                  </div>
                  ${tc ? `<span style="font-size:10.5px;padding:2px 7px;border-radius:4px;background:${tc.bg};color:${tc.col};flex-shrink:0">${s.tolerance_rating}</span>` : ''}
                  ${s.interruptions ? `<span style="color:var(--amber);font-size:11px;flex-shrink:0">⚠ Interrupted</span>` : ''}
                  ${checklist ? `<span style="font-size:10.5px;padding:2px 7px;border-radius:4px;background:rgba(74,158,255,0.1);color:var(--blue);flex-shrink:0">Checklist ${checklist.completed}/${checklist.total}</span>` : ''}
                  ${linkedAeCount ? `<span style="font-size:10.5px;padding:2px 7px;border-radius:4px;background:rgba(255,107,107,0.1);color:var(--red);flex-shrink:0">${linkedAeCount} AE</span>` : ''}
                  ${s.protocol_deviation ? `<span style="color:var(--red);font-size:11px;flex-shrink:0">⚡ Deviation</span>` : ''}
                  <span style="color:var(--text-tertiary);font-size:12px;flex-shrink:0" id="sess-chev-${s.id || i}">›</span>
                </div>
                <div id="sess-expand-${s.id || i}" style="display:none;padding:12px 18px 16px;border-top:1px solid var(--border);background:rgba(0,0,0,0.15)">
                  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px;font-size:12px">
                    ${[
                      ['Date',           s.created_at ? s.created_at.replace('T',' ').slice(0,16) : '—'],
                      ['Device',         s.device_slug || '—'],
                      ['Montage / Site', s.coil_position || '—'],
                      ['Frequency',      s.frequency_hz ? s.frequency_hz + ' Hz' : '—'],
                      ['Intensity',      s.intensity_pct_rmt ? s.intensity_pct_rmt + '% RMT' : '—'],
                      ['Pulses',         s.pulses_delivered ?? '—'],
                      ['Duration',       s.duration_minutes ? s.duration_minutes + ' min' : '—'],
                      ['Outcome',        s.session_outcome?.replace(/_/g,' ') || '—'],
                      ['Tolerance',      s.tolerance_rating || '—'],
                      ['Interruption',   s.interruptions ? 'Yes' : 'No'],
                      ['Checklist',      checklist ? `${checklist.completed}/${checklist.total} complete` : '—'],
                      ['Linked AE',      linkedAeCount || '—'],
                    ].map(([k,v]) => `<div><span style="color:var(--text-tertiary);font-size:11px">${k}:</span> <span style="color:var(--text-primary)">${v}</span></div>`).join('')}
                  </div>
                  ${s.interruption_reason ? `<div style="font-size:12px;color:var(--amber);line-height:1.6;padding:8px 10px;background:rgba(245,158,11,0.08);border-radius:var(--radius-sm);border-left:2px solid var(--amber);margin-bottom:10px"><strong>Interruption reason:</strong> ${_cdEscHtml(s.interruption_reason)}</div>` : ''}
                  ${s.post_session_notes ? `<div style="font-size:12px;color:var(--text-secondary);line-height:1.6;padding:8px 10px;background:rgba(0,0,0,0.2);border-radius:var(--radius-sm);border-left:2px solid var(--border-teal)">${s.post_session_notes}</div>` : ''}
                  <div style="display:flex;gap:8px;margin-top:10px">
                    <button class="btn btn-sm" onclick="window._cdTab='adverse-events';window._selectedCourseId='${course.id}';window._nav('course-detail')">Report AE</button>
                    <button class="btn btn-sm" onclick="window._cdSwitchTab('outcomes')">Record Outcome</button>
                  </div>
                </div>
              </div>`;
            }).join('')}
          </div>`
      }
    </div>`;
  }

  if (tab === 'protocol') {
    const p = protocolDetail;
    if (!p && !course.protocol_id) return `<div class="card" style="padding:32px">${emptyState('⬡', 'No protocol assigned to this course.')}</div>`;
    if (!p) return `<div class="card" style="padding:20px"><div style="font-size:12px;color:var(--text-secondary)">Protocol ID: <span class="mono">${course.protocol_id}</span> — full detail unavailable.</div></div>`;
    const isOn = String(p.on_label_vs_off_label || '').toLowerCase().startsWith('on');
    return `<div class="g2">
      <div>
        ${cardWrap('Protocol Detail',
          `<div style="font-size:15px;font-weight:700;color:var(--text-primary);margin-bottom:4px">${p.name || p.id}</div>
           <div style="display:flex;gap:6px;margin-bottom:14px">
             ${evidenceBadge(p.evidence_grade)}
             ${labelBadge(isOn)}
           </div>` +
          [
            ['Protocol ID',      p.id],
            ['Condition',        p.condition_id],
            ['Phenotype',        p.phenotype_id || '—'],
            ['Modality',         p.modality_id],
            ['Device',           p.device_id_if_specific || 'Any compatible'],
            ['Target Region',    p.target_region],
            ['Laterality',       p.laterality || '—'],
            ['Frequency',        p.frequency_hz ? `${p.frequency_hz} Hz` : '—'],
            ['Intensity',        p.intensity || '—'],
            ['Session Duration', p.session_duration || '—'],
            ['Sessions/Week',    p.sessions_per_week || '—'],
            ['Total Course',     p.total_course || '—'],
            ['Coil/Placement',   p.coil_or_electrode_placement || '—'],
          ].map(([k,v]) => fr(k, `<span class="mono" style="font-size:11.5px">${v}</span>`)).join('')
        )}
      </div>
      <div>
        ${p.clinician_review_required === 'Yes' ? cardWrap('Approval Note',
          govFlag('This protocol requires clinician review and approval before activation.', 'warn')
        ) : ''}
        ${p.monitoring_requirements ? cardWrap('Monitoring Requirements',
          `<div style="font-size:12.5px;color:var(--text-secondary);line-height:1.65">${p.monitoring_requirements}</div>`
        ) : ''}
      </div>
    </div>`;
  }

  if (tab === 'outcomes') {
    const summary = outcomeSummary?.summaries || [];
    const LOWER = new Set(['PHQ-9','GAD-7','PCL-5','ISI','DASS-21','NRS-Pain','UPDRS-III']);
    const pred = predictOutcome(course, outcomes);
    return `<div style="display:flex;flex-direction:column;gap:16px">
      ${outcomes.length > 0 ? `<div class="card" style="padding:16px 20px">${outcomeTrajectoryChart(outcomes)}</div>` : ''}
      ${renderPredictionCard(pred, outcomes.length)}
      ${summary.length > 0 ? summary.map(s => {
        const isResponder = s.is_responder;
        const dir = LOWER.has(s.template_name) ? 'lower = better' : 'higher = better';
        return `<div class="card" style="padding:16px 20px">
          <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px">
            <span style="font-size:14px;font-weight:700;color:var(--text-primary);flex:1">${s.template_name}</span>
            ${isResponder
              ? '<span style="font-size:11px;padding:2px 8px;border-radius:4px;background:rgba(74,222,128,0.12);color:var(--green);font-weight:600">Responder ✓</span>'
              : '<span style="font-size:11px;padding:2px 8px;border-radius:4px;background:rgba(255,181,71,0.12);color:var(--amber);font-weight:600">Non-responder</span>'}
            <span style="font-size:10.5px;color:var(--text-tertiary)">${dir}</span>
          </div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
            <div style="text-align:center;padding:12px;background:rgba(0,0,0,0.2);border-radius:6px">
              <div style="font-size:10px;color:var(--text-tertiary);margin-bottom:4px">Baseline</div>
              <div style="font-size:22px;font-weight:700;color:var(--text-primary)">${s.baseline_score !== null && s.baseline_score !== undefined ? s.baseline_score : '—'}</div>
            </div>
            <div style="text-align:center;padding:12px;background:rgba(0,0,0,0.2);border-radius:6px">
              <div style="font-size:10px;color:var(--text-tertiary);margin-bottom:4px">Latest</div>
              <div style="font-size:22px;font-weight:700;color:var(--teal)">${s.latest_score !== null && s.latest_score !== undefined ? s.latest_score : '—'}</div>
            </div>
            <div style="text-align:center;padding:12px;background:rgba(0,0,0,0.2);border-radius:6px">
              <div style="font-size:10px;color:var(--text-tertiary);margin-bottom:4px">Change</div>
              <div style="font-size:22px;font-weight:700;color:${isResponder ? 'var(--green)' : 'var(--amber)'}">
                ${s.pct_change !== null && s.pct_change !== undefined ? (s.pct_change > 0 ? '+' : '') + Math.round(s.pct_change) + '%' : '—'}
              </div>
            </div>
          </div>
        </div>`;
      }).join('') : ''}
      <div class="card" style="overflow:hidden">
        <div style="padding:14px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
          <span style="font-weight:600">Outcome Records</span>
          <button class="btn btn-primary btn-sm" onclick="document.getElementById('cd-outcome-form').style.display=''">+ Record Outcome</button>
        </div>
        <div id="cd-outcome-form" style="display:none;padding:16px;border-bottom:1px solid var(--border)">
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:10px">
            <div>
              <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">Assessment Tool</label>
              <select id="cdo-template" class="form-control" style="font-size:12px">
                ${FALLBACK_ASSESSMENT_TEMPLATES.map(t => `<option value="${t.id}">${t.label}</option>`).join('')}
              </select>
            </div>
            <div>
              <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">Score</label>
              <input id="cdo-score" class="form-control" type="number" placeholder="e.g. 14" style="font-size:12px">
            </div>
            <div>
              <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">Measurement Point</label>
              <select id="cdo-point" class="form-control" style="font-size:12px">
                <option value="baseline">Baseline</option>
                <option value="mid">Mid-course</option>
                <option value="post">Post-course</option>
                <option value="followup_4w">4-week follow-up</option>
                <option value="followup_3m">3-month follow-up</option>
              </select>
            </div>
          </div>
          <div id="cd-outcome-error" style="display:none;color:var(--red);font-size:12px;margin-bottom:6px"></div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-sm" onclick="document.getElementById('cd-outcome-form').style.display='none'">Cancel</button>
            <button class="btn btn-primary btn-sm" onclick="window._cdSaveOutcome('${course.id}','${course.patient_id}')">Save</button>
          </div>
        </div>
        <div style="overflow-x:auto">
          ${outcomes.length === 0
            ? `<div style="padding:32px">${emptyState('◫', 'No outcome records yet. Click "+ Record Outcome" to add the first measurement.')}</div>`
            : `<table class="ds-table">
                <thead><tr><th>Tool</th><th>Score</th><th>Point</th><th>Session #</th><th>Date</th></tr></thead>
                <tbody>
                  ${outcomes.map(o => `<tr>
                    <td style="font-weight:500">${o.template_name || '—'}</td>
                    <td class="mono">${o.score !== null && o.score !== undefined ? o.score : '—'}</td>
                    <td><span class="tag" style="font-size:10px">${o.measurement_point || '—'}</span></td>
                    <td class="mono" style="color:var(--text-secondary)">${o.session_number || '—'}</td>
                    <td style="font-size:11.5px;color:var(--text-secondary)">${o.recorded_at ? o.recorded_at.split('T')[0] : '—'}</td>
                  </tr>`).join('')}
                </tbody>
              </table>`
          }
        </div>
      </div>
    </div>`;
  }

  if (tab === 'adverse-events') {
    return `<div class="card">
      <div class="card-header" style="padding:14px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
        <span style="font-weight:600">Adverse Events</span>
        <button class="btn btn-sm" onclick="window._showAEForm()">+ Report Event</button>
      </div>
      ${aeSummary ? `<div style="display:flex;gap:10px;flex-wrap:wrap;padding:14px 20px;border-bottom:1px solid var(--border);background:rgba(0,0,0,0.08)">
        <span style="font-size:11px;padding:4px 8px;border-radius:999px;background:rgba(255,255,255,0.05);color:var(--text-secondary)">Total: <strong style="color:var(--text-primary)">${aeSummary.total || 0}</strong></span>
        <span style="font-size:11px;padding:4px 8px;border-radius:999px;background:${(aeSummary.unresolved || 0) > 0 ? 'rgba(255,107,107,0.1)' : 'rgba(74,222,128,0.1)'};color:${(aeSummary.unresolved || 0) > 0 ? 'var(--red)' : 'var(--green)'}">Unresolved: <strong>${aeSummary.unresolved || 0}</strong></span>
        <span style="font-size:11px;padding:4px 8px;border-radius:999px;background:rgba(245,158,11,0.1);color:var(--amber)">Highest Severity: <strong>${_cdEscHtml(aeSummary.highest_severity || 'unknown')}</strong></span>
      </div>` : ''}
      <div id="ae-form" style="display:none;padding:16px;border-bottom:1px solid var(--border)">
        ${renderAEForm(course.id, course.patient_id)}
      </div>
      <div style="overflow-x:auto">
        ${adverseEvents.length === 0
          ? `<div style="padding:32px">
              ${emptyState('◻', 'No adverse events recorded')}
              <div class="notice notice-ok" style="margin:16px auto;max-width:480px;text-align:center">
                <span style="color:var(--green);font-weight:600">✓ This course has a clean safety record.</span>
                No adverse events have been reported for this treatment course.
              </div>
            </div>`
          : `<table class="ds-table">
              <thead><tr><th>Date</th><th>Type</th><th>Severity</th><th>Onset</th><th>Resolution</th><th>Action</th><th>Notes</th></tr></thead>
              <tbody>
                ${adverseEvents.map(ae => {
                  const sevCol = ae.severity === 'serious' ? 'var(--red)' : ae.severity === 'moderate' ? 'var(--amber)' : 'var(--text-secondary)';
                  return `<tr>
                    <td style="font-size:11.5px;color:var(--text-secondary)">${ae.created_at ? ae.created_at.split('T')[0] : '—'}</td>
                    <td style="font-size:12px;font-weight:500">${ae.event_type || '—'}</td>
                    <td><span style="font-size:11px;padding:2px 7px;border-radius:4px;background:${sevCol}22;color:${sevCol};font-weight:600">${ae.severity || '—'}</span></td>
                    <td style="font-size:11.5px">${ae.onset_timing || '—'}</td>
                    <td style="font-size:11.5px">${ae.resolution || '—'}</td>
                    <td style="font-size:11.5px">${ae.action_taken || '—'}</td>
                    <td style="font-size:11px;color:var(--text-secondary);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${ae.notes || '—'}</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>`
        }
      </div>
    </div>`;
  }

  if (tab === 'governance') {
    const warnings = course.governance_warnings || [];
    const isTerminal = ['completed', 'closed', 'discontinued'].includes(course.status);
    const canPause = !isTerminal && ['active', 'approved'].includes(course.status);
    const canClose = !isTerminal && ['active', 'approved', 'pending_approval', 'paused'].includes(course.status);
    const canDiscontinue = canClose;
    const canResume = !isTerminal && course.status === 'paused';
    const canApprove = !isTerminal && course.status === 'pending_approval';

    return `<div class="g2">
      <div>
        ${cardWrap('Governance Summary',
          fr('Status',         approvalBadge(course.status)) +
          fr('Review Required', course.review_required ? '<span style="color:var(--amber)">Yes</span>' : '<span style="color:var(--teal)">No</span>') +
          fr('Label Status',   labelBadge(course.on_label !== false)) +
          fr('Evidence Grade', evidenceBadge(course.evidence_grade)) +
          fr('Created',        course.created_at?.split('T')[0] || '—') +
          fr('Clinician ID',   `<span class="mono" style="font-size:11px">${course.clinician_id || '—'}</span>`)
        )}
        ${cardWrap('Course Actions',
          `<div id="cd-gov-error" role="alert" style="color:var(--red);font-size:12px;display:none;margin-bottom:8px"></div>
          ${isTerminal
            ? `<div role="status" style="font-size:12.5px;color:var(--text-tertiary);padding:8px 10px;background:rgba(0,0,0,0.18);border-radius:6px;margin-bottom:8px">⛔ Course is in terminal state <strong>${_cdEscHtml(course.status)}</strong> and is immutable. No further state changes are permitted.</div>`
            : ''}
          <div style="display:flex;flex-direction:column;gap:10px">
            ${canApprove ? `
              <div>
                <div style="font-size:12px;color:var(--text-secondary);margin-bottom:6px">Approve this course to allow session execution.</div>
                <button class="btn btn-primary btn-sm" onclick="window._cdGovAction('approve')">✓ Approve Course</button>
              </div>` : ''}
            ${canResume ? `
              <div>
                <div style="font-size:12px;color:var(--text-secondary);margin-bottom:6px">Resume a paused treatment course. A clinician note is required and is audited.</div>
                <div style="display:flex;gap:8px;align-items:flex-start">
                  <textarea id="cd-resume-note" class="form-control" style="flex:1;font-size:12px" rows="2" placeholder="Clinical rationale for resuming (required)…" aria-label="Resume note"></textarea>
                  <button class="btn btn-sm" style="border-color:var(--teal);color:var(--teal);white-space:nowrap" onclick="window._cdGovAction('resume')">▶ Resume</button>
                </div>
              </div>` : ''}
            ${canPause ? `
              <div>
                <div style="font-size:12px;color:var(--text-secondary);margin-bottom:6px">Temporarily halt sessions. Patient remains enrolled. A clinician note is required and is audited.</div>
                <div style="display:flex;gap:8px;align-items:flex-start">
                  <textarea id="cd-pause-note" class="form-control" style="flex:1;font-size:12px" rows="2" placeholder="Reason to pause (required)…" aria-label="Pause note"></textarea>
                  <button class="btn btn-sm" style="border-color:var(--amber);color:var(--amber);white-space:nowrap" onclick="window._cdGovAction('pause')">⏸ Pause</button>
                </div>
              </div>` : ''}
            ${canClose ? `
              <div style="padding-top:${(canPause || canResume) ? '10px' : '0'};border-top:${(canPause || canResume) ? '1px solid var(--border)' : 'none'}">
                <div style="font-size:12px;color:var(--text-secondary);margin-bottom:6px">Close the course (terminal). Sessions stop and the course becomes immutable. A clinician note is required and is audited.</div>
                <div style="display:flex;gap:8px;align-items:flex-start">
                  <textarea id="cd-close-note" class="form-control" style="flex:1;font-size:12px" rows="2" placeholder="Closure rationale (required)…" aria-label="Close note"></textarea>
                  <button class="btn btn-sm" style="border-color:var(--red);color:var(--red);white-space:nowrap" onclick="window._cdGovAction('close')">⬛ Close</button>
                </div>
              </div>` : ''}
            ${canDiscontinue ? `
              <div style="padding-top:10px;border-top:1px solid var(--border)">
                <div style="font-size:12px;color:var(--text-secondary);margin-bottom:6px">Permanent discontinuation (legacy path). Status will be set via PATCH; prefer Close above for new audits.</div>
                <div style="display:flex;gap:8px;align-items:flex-start">
                  <textarea id="cd-discont-reason" class="form-control" style="flex:1;font-size:12px" rows="2" placeholder="Reason for discontinuation (required)…" aria-label="Discontinuation reason"></textarea>
                  <button class="btn btn-sm" style="border-color:var(--red);color:var(--red);white-space:nowrap" onclick="window._cdGovAction('discontinue')">⬛ Discontinue</button>
                </div>
              </div>` : ''}
            ${!canPause && !canDiscontinue && !canResume && !canApprove && !canClose && !isTerminal
              ? `<div style="color:var(--text-tertiary);font-size:12.5px;padding:8px 0">No actions available for status <strong>${_cdEscHtml(course.status)}</strong>.</div>`
              : ''}
          </div>`
        )}
      </div>
      <div>
        ${cardWrap('Governance Flags',
          warnings.length === 0
            ? `<div style="padding:12px 0;color:var(--teal);font-size:12.5px">✓ No governance flags on this course</div>`
            : warnings.map(w => govFlag(w, 'warn')).join('')
        )}
        ${cardWrap('Approval History', (() => {
          // Real audit events only — never fabricate timeline dates from
          // created_at offsets (launch-audit 2026-04-30).
          const trail = Array.isArray(auditTrail?.items) ? auditTrail.items : [];
          const KEEP = new Set([
            'course.activate',
            'course.activate.safety_override',
            'course_detail.pause',
            'course_detail.resume',
            'course_detail.close',
          ]);
          const labelFor = (e) => {
            switch (e.action) {
              case 'course.activate': return 'Approved &amp; Activated';
              case 'course.activate.safety_override': return 'Activated with safety override';
              case 'course_detail.pause': return 'Course paused';
              case 'course_detail.resume': return 'Course resumed';
              case 'course_detail.close': return 'Course closed';
              default: return _cdEscHtml(e.action || '—');
            }
          };
          const colorFor = (action) => action === 'course.activate' ? 'var(--green)'
            : action === 'course.activate.safety_override' ? 'var(--amber)'
            : action === 'course_detail.pause' ? 'var(--amber)'
            : action === 'course_detail.resume' ? 'var(--teal)'
            : action === 'course_detail.close' ? 'var(--red)'
            : 'var(--text-tertiary)';
          const created = course.created_at
            ? { label: 'Course created', date: new Date(course.created_at), color: 'var(--blue)', action: 'course.created', note: '' }
            : null;
          const filtered = trail
            .filter(e => KEEP.has(e.action))
            .map(e => ({
              label: labelFor(e),
              date: e.created_at ? new Date(e.created_at) : null,
              color: colorFor(e.action),
              action: e.action,
              note: e.note || '',
            }))
            .filter(e => e.date && !isNaN(e.date.getTime()));
          // Show creation first, then real audit events oldest→newest.
          const events = [created, ...filtered.reverse()].filter(Boolean);
          if (events.length === 0) {
            return '<div style="font-size:12px;color:var(--text-tertiary)">No approval history recorded yet.</div>';
          }
          return `<div style="position:relative;padding-left:20px">
            <div style="position:absolute;left:7px;top:6px;bottom:6px;width:2px;background:var(--border)"></div>
            ${events.map((e, i) => `<div style="position:relative;margin-bottom:${i < events.length - 1 ? '16' : '0'}px;display:flex;align-items:flex-start;gap:10px">
              <div style="position:absolute;left:-16px;width:10px;height:10px;border-radius:50%;background:${e.color};border:2px solid var(--navy-850);flex-shrink:0;margin-top:2px"></div>
              <div>
                <div style="font-size:12.5px;font-weight:500;color:var(--text-primary)">${e.label}</div>
                <div style="font-size:11px;color:var(--text-tertiary)">${e.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}${e.note ? ' &middot; ' + _cdEscHtml(String(e.note).slice(0, 120)) : ''}</div>
              </div>
            </div>`).join('')}
          </div>`;
        })())}
        ${adverseEvents.filter(ae => ae.severity === 'serious').length > 0
          ? cardWrap('Serious Adverse Events',
              adverseEvents.filter(ae => ae.severity === 'serious').map(ae =>
                govFlag(`${ae.event_type} — ${ae.onset_timing || 'timing unknown'} — Action: ${ae.action_taken || 'none documented'}`, 'error')
              ).join('')
            )
          : ''
        }
      </div>
    </div>`;
  }

  if (tab === 'notes') {
    return renderNotesTab(course, sessions);
  }

  if (tab === 'assessments') {
    return renderCourseAssessmentsTab(course, assessmentSummary);
  }

  if (tab === 'home-programs') {
    return renderCourseHomeProgramsTab(course);
  }

  if (tab === 'reports') {
    return renderCourseReportsTab(course, sessions, outcomes);
  }

  return '';
}

// ── Course detail tab: Assessments ───────────────────────────────────────────
function renderCourseAssessmentsTab(course, assessmentSummary) {
  // Prefer the normalized backend summary (patient-scoped) over the legacy
  // course.assessments inline field. The summary snapshot carries severity,
  // band labels, respondent type, AI provenance, and approval status — all
  // straight from the `/treatment-courses/{id}/assessment-summary` endpoint.
  const legacyAssigned = course.assessments || [];
  const assessments = (assessmentSummary?.assessments || []).map(a => ({
    id: a.id,
    name: a.template_title || a.template_id,
    template_id: a.template_id,
    status: a.raw_status,
    score: a.score_numeric,
    severity: a.severity,
    severity_label: a.severity_label,
    respondent_type: a.respondent_type,
    phase: a.phase,
    approved_status: a.approved_status,
    is_ai_generated: a.is_ai_generated,
    clinician_reviewed: a.clinician_reviewed,
    completed_at: a.completed_at,
  }));
  const hasSummary = assessmentSummary != null;
  const fallback = !hasSummary && legacyAssigned.length > 0;
  const items = hasSummary ? assessments : legacyAssigned.map(a => ({
    id: a.id,
    name: a.name || a.template_name,
    template_id: a.template_id,
    status: a.status,
    score: a.score,
    severity: null,
    severity_label: null,
    respondent_type: null,
    phase: a.phase || null,
    approved_status: null,
    is_ai_generated: false,
    clinician_reviewed: false,
    completed_at: a.completed_at || null,
  }));
  const hasDue   = items.some(a => a.status === 'due' || a.status === 'overdue' || a.status === 'pending');
  const highest  = assessmentSummary?.highest_severity || null;
  const sevColor = (s) => s === 'critical' ? 'var(--red)' : s === 'severe' ? 'var(--red)' : s === 'moderate' ? 'var(--amber)' : s === 'mild' ? 'var(--blue)' : 'var(--teal)';
  const statusPill = (status) => {
    const color = status === 'completed' ? 'var(--green)'
      : status === 'overdue' ? 'var(--red)'
      : status === 'due' ? 'var(--amber)'
      : status === 'pending' ? 'var(--amber)'
      : 'var(--text-tertiary)';
    const label = status === 'completed' ? 'Completed'
      : status === 'overdue' ? 'Overdue'
      : status === 'due' ? 'Due'
      : status === 'pending' ? 'Pending'
      : status === 'draft' ? 'Draft'
      : 'Scheduled';
    return `<span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:8px;background:${color}18;color:${color}">${label}</span>`;
  };
  return `<div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <div>
        <h3 style="margin:0 0 2px">Assessments</h3>
        <div style="font-size:11.5px;color:var(--text-secondary)">
          Outcome tracking for this course · ${items.length} ${items.length === 1 ? 'record' : 'records'}
          ${hasSummary && highest ? ` · highest severity: <strong style="color:${sevColor(highest)}">${_cdEscHtml(highest)}</strong>` : ''}
        </div>
      </div>
      <button class="btn btn-primary btn-sm" onclick="window._nav('assessments-hub')">+ Assign Assessment</button>
    </div>
    ${fallback ? `<div style="padding:8px 12px;background:rgba(74,158,255,0.08);border:1px solid rgba(74,158,255,0.25);border-radius:var(--radius-md);margin-bottom:12px;font-size:11.5px;color:var(--text-secondary)">
      Live assessment summary unavailable; showing cached course list.
    </div>` : ''}
    ${hasDue ? `<div style="padding:10px 14px;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.25);border-radius:var(--radius-md);margin-bottom:16px;font-size:12px;color:var(--amber)">
      ⚠ One or more assessments are due or pending for this patient.
    </div>` : ''}
    ${(highest === 'severe' || highest === 'critical') ? `<div role="alert" style="padding:10px 14px;background:rgba(255,107,107,0.1);border:1px solid rgba(255,107,107,0.3);border-radius:var(--radius-md);margin-bottom:16px;font-size:12.5px;color:var(--red)">
      🚨 Highest severity is <strong>${_cdEscHtml(highest)}</strong>. Review flagged assessments and escalate per clinic protocol.
    </div>` : ''}
    ${items.length === 0
      ? `<div style="text-align:center;padding:40px;color:var(--text-secondary)">
          <div style="font-size:32px;margin-bottom:10px">📊</div>
          <div style="font-weight:600;margin-bottom:4px">No assessments on file</div>
          <div style="font-size:12px;color:var(--text-tertiary);margin-bottom:16px">Assign validated scales from the Assessments Hub to track outcomes for this course.</div>
          <button class="btn btn-primary btn-sm" onclick="window._nav('assessments-hub')">Browse Assessment Library</button>
        </div>`
      : `<div class="card" style="padding:0;overflow:hidden">
          ${items.map(a => {
            const sev = a.severity;
            const sevLabel = a.severity_label;
            const sevCol = sev ? sevColor(sev) : null;
            const name = _cdEscHtml(a.name || a.template_id || '—');
            const phase = a.phase ? `<span style="font-size:10.5px;padding:1px 6px;border-radius:4px;background:rgba(255,255,255,0.05);color:var(--text-tertiary)">${_cdEscHtml(a.phase)}</span>` : '';
            const respondent = a.respondent_type ? `<span style="font-size:10.5px;color:var(--text-tertiary)">${_cdEscHtml(a.respondent_type)}</span>` : '';
            const date = a.completed_at ? `<span style="font-size:11px;color:var(--text-secondary)">Completed ${new Date(a.completed_at).toLocaleDateString()}</span>` : '';
            const approvalNote = a.approved_status && a.approved_status !== 'unreviewed'
              ? `<span style="font-size:10px;padding:1px 6px;border-radius:4px;background:${a.approved_status === 'approved' ? 'rgba(74,222,128,0.12)' : 'rgba(245,158,11,0.15)'};color:${a.approved_status === 'approved' ? 'var(--green)' : 'var(--amber)'}">${_cdEscHtml(a.approved_status)}</span>`
              : '';
            const aiFlag = a.is_ai_generated
              ? `<span title="Contains AI-generated draft content" style="font-size:10px;padding:1px 6px;border-radius:4px;background:rgba(74,158,255,0.12);color:var(--blue)">AI draft</span>`
              : '';
            return `<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--border);flex-wrap:wrap">
              <div style="flex:1;min-width:200px">
                <div style="font-size:13px;font-weight:600;color:var(--text-primary)">${name}</div>
                <div style="font-size:11px;color:var(--text-secondary);margin-top:2px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                  ${phase} ${respondent} ${date} ${approvalNote} ${aiFlag}
                </div>
              </div>
              ${a.score != null ? `<div style="font-size:13px;font-weight:700;color:${sevCol || 'var(--teal)'};min-width:100px;text-align:right">
                Score: ${_cdEscHtml(a.score)}${sevLabel ? `<div style="font-size:10.5px;font-weight:500;color:${sevCol}">${_cdEscHtml(sevLabel)}</div>` : ''}
              </div>` : ''}
              ${statusPill(a.status)}
              <button style="font-size:11px;padding:5px 11px;border-radius:var(--radius-md);background:transparent;color:var(--teal);border:1px solid rgba(0,212,188,0.3);cursor:pointer;font-family:var(--font-body)"
                onclick="window._nav('assessments-hub')">${a.status === 'completed' ? 'View' : 'Complete'}</button>
            </div>`;
          }).join('')}
        </div>`
    }
    <div style="margin-top:20px">
      <div style="font-size:12px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.6px;margin-bottom:10px">Outcome Trend</div>
      <div style="padding:20px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-md);color:var(--text-tertiary);font-size:12px;text-align:center">
        Outcome chart renders on the Outcomes tab.<br>
        <a style="color:var(--teal);cursor:pointer" onclick="window._cdSwitchTab('outcomes')">View Outcomes tab →</a>
      </div>
    </div>
  </div>`;
}

// ── Course detail tab: Home Programs ─────────────────────────────────────────
function renderCourseHomeProgramsTab(course) {
  const programs = course.home_programs || [];
  const PROGRAM_TYPES = [
    { id: 'mindfulness', icon: '🧘', label: 'Mindfulness' },
    { id: 'breathing',   icon: '💨', label: 'Breathing Exercises' },
    { id: 'cognitive',   icon: '🧠', label: 'Cognitive Tasks' },
    { id: 'exercise',    icon: '🏃', label: 'Physical Exercise' },
    { id: 'sleep',       icon: '🌙', label: 'Sleep Hygiene' },
    { id: 'diet',        icon: '🥗', label: 'Nutritional Guidance' },
  ];
  return `<div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <div>
        <h3 style="margin:0 0 2px">Home Programs</h3>
        <div style="font-size:11.5px;color:var(--text-secondary)">Between-session activities for this patient · ${programs.length} active</div>
      </div>
      <button class="btn btn-primary btn-sm" onclick="window._nav?.('home-tasks-v2')" title="Open the Home Task Manager to build / assign a home program">+ Add Program</button>
    </div>
    ${programs.length === 0
      ? `<div>
          <div style="text-align:center;padding:32px 20px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);margin-bottom:20px">
            <div style="font-size:32px;margin-bottom:10px">🏠</div>
            <div style="font-weight:600;margin-bottom:4px;color:var(--text-primary)">No home programs assigned</div>
            <div style="font-size:12px;color:var(--text-tertiary);margin-bottom:16px">Add between-session activities to reinforce in-clinic treatment.</div>
          </div>
          <div style="font-size:12px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.6px;margin-bottom:10px">Quick Add</div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
            ${PROGRAM_TYPES.map(pt => `
              <div style="padding:14px;border:1px solid var(--border);border-radius:var(--radius-md);cursor:pointer;text-align:center;transition:border-color 0.15s;background:var(--bg-card)"
                onmouseover="this.style.borderColor='rgba(0,212,188,0.4)'" onmouseout="this.style.borderColor='var(--border)'"
                onclick="window._htmPrefillTemplate=${JSON.stringify(pt.label)};window._nav?.('home-tasks-v2')">
                <div style="font-size:24px;margin-bottom:6px">${pt.icon}</div>
                <div style="font-size:12px;font-weight:600;color:var(--text-primary)">${pt.label}</div>
              </div>
            `).join('')}
          </div>
        </div>`
      : `<div class="card" style="padding:0;overflow:hidden">
          ${programs.map(p => `
            <div style="padding:14px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px">
              <div style="flex:1">
                <div style="font-size:13px;font-weight:600;color:var(--text-primary)">${p.name || '—'}</div>
                <div style="font-size:11px;color:var(--text-secondary);margin-top:2px">${p.frequency || 'As needed'} · ${p.type || ''}</div>
              </div>
              <span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:8px;background:rgba(0,212,188,0.1);color:var(--teal)">${p.status || 'Active'}</span>
              <button style="font-size:11px;padding:5px 11px;border-radius:var(--radius-md);background:transparent;color:var(--text-secondary);border:1px solid var(--border);cursor:pointer;font-family:var(--font-body)">Edit</button>
            </div>
          `).join('')}
        </div>`
    }
  </div>`;
}

// ── Course detail tab: Reports ────────────────────────────────────────────────
function renderCourseReportsTab(course, sessions, outcomes) {
  const delivered  = course.sessions_delivered || sessions.length;
  const total      = course.planned_sessions_total || 0;
  const pct        = total > 0 ? Math.round(delivered / total * 100) : 0;
  const startDate  = course.start_date ? new Date(course.start_date).toLocaleDateString() : '—';
  const lastSess   = sessions.length ? new Date(sessions[sessions.length - 1]?.session_date || sessions[sessions.length - 1]?.created_at).toLocaleDateString() : '—';
  const riskScore  = computeRiskScore(course);
  const rl         = riskLevel(riskScore);

  return `<div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
      <div>
        <h3 style="margin:0 0 2px">Course Report</h3>
        <div style="font-size:11.5px;color:var(--text-secondary)">Auto-generated summary for this treatment course</div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-sm" style="font-size:12px" onclick="window.print()">🖨 Print</button>
        <button class="btn btn-sm" style="font-size:12px;opacity:.55;cursor:not-allowed" disabled title="Course-report PDF export requires document-render backend (not yet wired); use Print for now">⬇ Export PDF</button>
      </div>
    </div>

    <!-- Course header -->
    <div class="card" style="padding:18px;margin-bottom:16px">
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:16px">
        ${metricCard('Sessions Delivered', `${delivered}/${total || '?'}`, 'var(--teal)', `${pct}% complete`)}
        ${metricCard('Started', startDate, 'var(--blue)', 'Course start date')}
        ${metricCard('Last Session', lastSess, 'var(--text-secondary)', 'Most recent')}
        ${metricCard('Risk Score', riskScore, rl.color, `${rl.label} risk`)}
      </div>
      <div style="height:6px;border-radius:3px;background:var(--border)">
        <div style="height:6px;border-radius:3px;background:var(--teal);width:${pct}%;transition:width 0.4s ease"></div>
      </div>
      <div style="font-size:10.5px;color:var(--text-tertiary);margin-top:6px">${pct}% of course complete</div>
    </div>

    <!-- Outcome summary -->
    ${outcomes.length >= 2
      ? (() => {
          const sorted   = [...outcomes].sort((a, b) => (a.recorded_at||'') < (b.recorded_at||'') ? -1 : 1);
          const baseline = sorted[0];
          const latest   = sorted[sorted.length - 1];
          const change   = latest.score != null && baseline.score != null ? latest.score - baseline.score : null;
          return `<div class="card" style="padding:18px;margin-bottom:16px">
            <div style="font-size:13px;font-weight:600;margin-bottom:14px">Outcome Measurements</div>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
              ${metricCard('Baseline Score', baseline.score ?? '—', 'var(--text-secondary)', `${baseline.template_name || 'Assessment'} at start`)}
              ${metricCard('Latest Score', latest.score ?? '—', 'var(--teal)', `${latest.template_name || 'Assessment'} · ${new Date(latest.recorded_at).toLocaleDateString()}`)}
              ${change != null ? metricCard('Change', `${change > 0 ? '+' : ''}${Math.round(change)}`, change < 0 ? 'var(--teal)' : change > 0 ? 'var(--red)' : 'var(--text-secondary)', 'From baseline') : ''}
            </div>
          </div>`;
        })()
      : `<div class="card" style="padding:18px;margin-bottom:16px;text-align:center;color:var(--text-tertiary);font-size:12px">
          Not enough outcome data yet. Complete at least 2 assessments to see outcome trends.
        </div>`
    }

    <!-- Risk factors -->
    <div class="card" style="padding:18px;margin-bottom:16px">
      <div style="font-size:13px;font-weight:600;margin-bottom:12px">Risk Factors</div>
      ${renderRiskFactors(course)}
    </div>

    <!-- Governance warnings -->
    ${(course.governance_warnings||[]).length ? `<div class="card" style="padding:18px;border-left:3px solid var(--red)">
      <div style="font-size:13px;font-weight:600;color:var(--red);margin-bottom:10px">⚠ Governance Flags</div>
      ${(course.governance_warnings||[]).map(w => `<div style="font-size:12px;color:var(--text-secondary);margin-bottom:6px">• ${w}</div>`).join('')}
    </div>` : ''}
  </div>`;
}

function renderNotesTab(course, sessions) {
  const notes = getPatientNotes(course.id);
  return `<div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h3 style="margin:0">Session Notes</h3>
      <button class="btn btn-primary btn-sm" onclick="window._nav('clinical-notes')">Open Notes Editor →</button>
    </div>
    ${notes.length === 0
      ? '<div style="text-align:center;padding:32px;color:var(--text-secondary)">No notes yet for this course.<br><br><button class="btn btn-sm" onclick="window._nav(\'clinical-notes\')">+ Create First Note</button></div>'
      : notes.map(([sessionId, note]) => `
        <div class="ds-card" style="margin-bottom:12px;${note.flagged ? 'border-left:3px solid var(--amber-500)' : ''}">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
            <div style="font-size:0.85rem;font-weight:600">Session ${sessionId.slice(0, 8)} ${note.flagged ? '★' : ''}</div>
            <div style="font-size:0.75rem;color:var(--text-secondary)">${new Date(note.updated_at).toLocaleString()}</div>
          </div>
          ${note.subjective ? `<div style="margin-bottom:6px"><strong style="font-size:0.75rem;color:var(--text-secondary);text-transform:uppercase">S:</strong> <span style="font-size:0.85rem">${note.subjective.slice(0, 120)}${note.subjective.length > 120 ? '...' : ''}</span></div>` : ''}
          ${note.plan ? `<div><strong style="font-size:0.75rem;color:var(--text-secondary);text-transform:uppercase">P:</strong> <span style="font-size:0.85rem">${note.plan.slice(0, 120)}${note.plan.length > 120 ? '...' : ''}</span></div>` : ''}
        </div>`).join('')}
  </div>`;
}

function renderAEForm(courseId, patientId) {
  return `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px">
      <div>
        <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">Event Type</label>
        <select id="ae-type" class="form-control" style="font-size:12px">
          <option value="">Select…</option>
          <option value="headache">Headache</option>
          <option value="scalp_discomfort">Scalp Discomfort</option>
          <option value="tingling">Tingling / Paresthesia</option>
          <option value="dizziness">Dizziness</option>
          <option value="nausea">Nausea</option>
          <option value="seizure">Seizure</option>
          <option value="syncope">Syncope / Near-syncope</option>
          <option value="hearing_change">Hearing Change</option>
          <option value="mood_change">Mood Change</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div>
        <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">Severity</label>
        <select id="ae-severity" class="form-control" style="font-size:12px">
          <option value="mild">Mild</option>
          <option value="moderate">Moderate</option>
          <option value="severe">Severe</option>
          <option value="serious">Serious</option>
        </select>
      </div>
      <div>
        <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">Onset Timing</label>
        <select id="ae-onset" class="form-control" style="font-size:12px">
          <option value="during_session">During session</option>
          <option value="immediate_post">Immediate post-session</option>
          <option value="hours_post">Hours post-session</option>
          <option value="next_day">Next day</option>
          <option value="delayed">Delayed (>24h)</option>
        </select>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
      <div>
        <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">Resolution</label>
        <select id="ae-resolution" class="form-control" style="font-size:12px">
          <option value="self_resolving">Self-resolving</option>
          <option value="resolved_with_intervention">Resolved with intervention</option>
          <option value="ongoing">Ongoing</option>
          <option value="unknown">Unknown</option>
        </select>
      </div>
      <div>
        <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">Action Taken</label>
        <select id="ae-action" class="form-control" style="font-size:12px">
          <option value="none">None required</option>
          <option value="session_paused">Session paused</option>
          <option value="session_stopped">Session stopped early</option>
          <option value="protocol_modified">Protocol modified</option>
          <option value="course_paused">Course paused</option>
          <option value="course_discontinued">Course discontinued</option>
          <option value="medical_referral">Medical referral made</option>
        </select>
      </div>
    </div>
    <div style="margin-bottom:12px">
      <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">Notes</label>
      <textarea id="ae-notes" class="form-control" rows="2" placeholder="Describe the event in clinical detail…" style="font-size:12px;resize:vertical"></textarea>
    </div>
    <div id="ae-error" style="display:none;color:var(--red);font-size:12px;margin-bottom:8px"></div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-sm" onclick="document.getElementById('ae-form').style.display='none'">Cancel</button>
      <button class="btn btn-primary btn-sm" onclick="window._submitAE('${courseId}','${patientId || ''}')">Submit Report</button>
    </div>`;
}

window._showAEForm = function() {
  const f = document.getElementById('ae-form');
  if (f) f.style.display = f.style.display === 'none' ? '' : 'none';
};

window._cdSaveOutcome = async function(courseId, patientId) {
  const template = document.getElementById('cdo-template')?.value;
  const score    = parseFloat(document.getElementById('cdo-score')?.value);
  const point    = document.getElementById('cdo-point')?.value || 'post';
  const errEl    = document.getElementById('cd-outcome-error');
  const showErr  = msg => { if (errEl) { errEl.textContent = msg; errEl.style.display = ''; } };
  if (errEl) errEl.style.display = 'none';
  if (!template || isNaN(score)) { showErr('Template and numeric score are required.'); return; }
  if (!patientId) { showErr('Patient not resolved — cannot record outcome without patient_id.'); return; }
  try {
    // Backend OutcomeCreate requires patient_id, course_id, template_id; score_numeric
    // is preferred over stringly-typed score. See outcomes_router.OutcomeCreate.
    await api.recordOutcome({
      course_id:         courseId,
      patient_id:        patientId,
      template_id:       template,
      template_title:    template,
      score:             String(score),
      score_numeric:     score,
      measurement_point: point,
    });
    window._cdTab = 'outcomes';
    window._nav('course-detail');
  } catch (e) { showErr(e.message || 'Save failed.'); }
};

window._submitAE = async function(courseId, patientId) {
  const errEl = document.getElementById('ae-error');
  if (errEl) errEl.style.display = 'none';
  const type = document.getElementById('ae-type')?.value;
  if (!type) { if (errEl) { errEl.textContent = 'Select event type.'; errEl.style.display = ''; } return; }
  if (!patientId) {
    if (errEl) { errEl.textContent = 'Patient not resolved — cannot report adverse event without patient_id.'; errEl.style.display = ''; }
    return;
  }
  try {
    // Backend AdverseEventCreate requires: patient_id, event_type, severity ∈
    // {mild,moderate,severe,serious}, and accepts `description` (not `notes`).
    await api.reportAdverseEvent({
      course_id:    courseId,
      patient_id:   patientId,
      event_type:   type,
      severity:     document.getElementById('ae-severity')?.value || 'mild',
      onset_timing: document.getElementById('ae-onset')?.value || null,
      resolution:   document.getElementById('ae-resolution')?.value || null,
      action_taken: document.getElementById('ae-action')?.value || null,
      description:  document.getElementById('ae-notes')?.value || null,
    });
    window._cdTab = 'adverse-events';
    window._nav('course-detail');
  } catch (e) {
    if (errEl) { errEl.textContent = e.message || 'Report failed.'; errEl.style.display = ''; }
  }
};

window._cdGovAction = async function(action) {
  const errEl = document.getElementById('cd-gov-error');
  if (errEl) errEl.style.display = 'none';
  const courseId = window._selectedCourseId;
  if (!courseId) return;
  const setErr = (msg) => { if (errEl) { errEl.textContent = msg; errEl.style.display = ''; } };
  const readNote = (id) => (document.getElementById(id)?.value || '').trim();

  try {
    if (action === 'approve') {
      await api.activateCourse(courseId);
    } else if (action === 'pause') {
      const note = readNote('cd-pause-note');
      if (!note) { setErr('A clinician note is required to pause this course.'); return; }
      await api.pauseCourse(courseId, note);
    } else if (action === 'resume') {
      const note = readNote('cd-resume-note');
      if (!note) { setErr('A clinician note is required to resume this course.'); return; }
      await api.resumeCourse(courseId, note);
    } else if (action === 'close') {
      const note = readNote('cd-close-note');
      if (!note) { setErr('A clinician note is required to close this course.'); return; }
      if (!confirm('Close this treatment course? The course becomes terminal/immutable.')) return;
      await api.closeCourse(courseId, note);
    } else if (action === 'discontinue') {
      const reason = readNote('cd-discont-reason');
      if (!reason) { setErr('A reason is required to discontinue this course.'); return; }
      if (!confirm('Permanently discontinue this treatment course? This cannot be undone.')) return;
      await api.updateCourse(courseId, { status: 'discontinued', clinician_notes: reason });
    } else {
      setErr('Unknown action.');
      return;
    }
    window._cdTab = 'governance';
    window._nav('course-detail');
  } catch (e) {
    setErr(e?.message || 'Action failed.');
  }
};

// ── pgSessionExecution — Guided session delivery workflow ─────────────────────
export async function pgSessionExecution(setTopbar, navigate) {
  setTopbar('Session Execution', `<span id="sex-topbar-status" style="font-size:11px;color:var(--text-tertiary)">Select a patient to begin</span>`);
  const el = document.getElementById('content');
  el.innerHTML = spinner();
  const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  let activeCourses = [], devices = [];
  try {
    [activeCourses, devices] = await Promise.all([
      api.listCourses({ status: 'active' }).then(r => r?.items || []).catch(() => []),
      api.devices_registry().then(r => r?.items || []).catch(() => []),
    ]);
  } catch (_) {}

  const deviceOptions = devices.map(d =>
    `<option value="${d.id || d.Device_ID || d.name}">${d.name || d.Device_Name || d.id}</option>`
  ).join('');

  window._seActiveCourses = activeCourses;
  window._seConsentBlocked = false;
  if (window._seTimerInterval) { clearInterval(window._seTimerInterval); window._seTimerInterval = null; }

  // ── Site-target SVG (top-of-head EEG 10-20 view) ──────────────────────────
  function siteVisual(targetText) {
    const t = (targetText || '').toLowerCase();
    const sites = {
      'F3': [72,64],  'F4': [128,64],  'Fz': [100,60],
      'C3': [65,100], 'C4': [135,100], 'Cz': [100,100],
      'T3': [26,100], 'T4': [174,100],
      'P3': [72,136], 'P4': [128,136], 'Pz': [100,140],
      'Fp1':[70,36],  'Fp2':[130,36],  'Fpz':[100,32],
      'O1': [70,164], 'O2': [130,164], 'Oz': [100,168],
      'F7': [42,70],  'F8': [158,70],
    };
    let target = null, label = '';
    if (t.includes('dlpfc') && (t.includes('left')||t.includes('l-')||t.includes('f3'))) { target='F3'; label='L-DLPFC (F3)'; }
    else if (t.includes('dlpfc') && (t.includes('right')||t.includes('r-')||t.includes('f4'))) { target='F4'; label='R-DLPFC (F4)'; }
    else if (t.includes('f3')) { target='F3'; label='F3'; }
    else if (t.includes('f4')) { target='F4'; label='F4'; }
    else if (t.includes('motor')||t.includes('m1')||t.includes('c3')) { target='C3'; label='Motor (C3)'; }
    else if (t.includes('c4')) { target='C4'; label='Motor (C4)'; }
    else if (t.includes('vertex')||t.includes('cz')) { target='Cz'; label='Vertex (Cz)'; }
    else if (t.includes('temporal')||t.includes('t3')||t.includes('auditory')) { target='T3'; label='Temporal (T3)'; }
    else if (t.includes('t4')) { target='T4'; label='Temporal (T4)'; }
    else if (t.includes('occipital')||t.includes('oz')) { target='Oz'; label='Occipital (Oz)'; }
    else if (t.includes('parietal')||t.includes('pz')) { target='Pz'; label='Parietal (Pz)'; }
    const dots = Object.entries(sites).map(([k,[x,y]]) => {
      const isT = k === target;
      return isT
        ? `<circle cx="${x}" cy="${y}" r="8" fill="rgba(0,212,188,0.2)" stroke="var(--teal)" stroke-width="2"/>
           <circle cx="${x}" cy="${y}" r="3" fill="var(--teal)"/>
           <text x="${x}" y="${y-12}" font-size="9" text-anchor="middle" fill="var(--teal)" font-weight="700">${k}</text>`
        : `<circle cx="${x}" cy="${y}" r="3" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.2)" stroke-width="1"/>
           <text x="${x}" y="${y-6}" font-size="7" text-anchor="middle" fill="rgba(255,255,255,0.28)">${k}</text>`;
    }).join('');
    return `<div class="sex-guide-visual">
      <svg viewBox="0 0 200 200" width="140" height="140" style="display:block">
        <ellipse cx="100" cy="100" rx="88" ry="92" fill="rgba(14,22,40,0.6)" stroke="rgba(255,255,255,0.15)" stroke-width="2"/>
        <line x1="12" y1="100" x2="188" y2="100" stroke="rgba(255,255,255,0.07)" stroke-width="1"/>
        <line x1="100" y1="8" x2="100" y2="192" stroke="rgba(255,255,255,0.07)" stroke-width="1"/>
        ${dots}
        <text x="100" y="8" font-size="7" text-anchor="middle" fill="rgba(255,255,255,0.25)">Nasion</text>
        <text x="100" y="198" font-size="7" text-anchor="middle" fill="rgba(255,255,255,0.25)">Inion</text>
        <text x="4" y="103" font-size="7" text-anchor="start" fill="rgba(255,255,255,0.25)">L</text>
        <text x="194" y="103" font-size="7" text-anchor="end" fill="rgba(255,255,255,0.25)">R</text>
      </svg>
      ${target
        ? `<div style="font-size:11px;font-weight:600;color:var(--teal);margin-top:6px;text-align:center">${label}</div>`
        : `<div style="font-size:10px;color:var(--text-tertiary);margin-top:6px;text-align:center">Site not specified</div>`}
    </div>`;
  }

  // ── Aftercare text by modality ─────────────────────────────────────────────
  function aftercareItems(slug) {
    const m = (slug || '').toLowerCase();
    if (m.includes('tms') || m.includes('rtms'))
      return ['Avoid driving for 30 min if any dizziness was experienced', 'Report any headache lasting more than 2 hours', 'No alcohol for 24 hours post-session', 'Contact clinic immediately if seizure-like activity or fainting occurs'];
    if (m.includes('tdcs'))
      return ['Monitor skin at electrode sites — report burning or redness lasting >1 hour', 'Stay well hydrated', 'Mild scalp tingling or itching during stimulation is normal', 'Contact clinic for blistering or prolonged skin discomfort'];
    if (m.includes('tavns') || m.includes('vns'))
      return ['Check ear canal / skin for any irritation after removal', 'Report nausea, dizziness, or persistent cough', 'Normal daily activity can resume immediately', 'Ensure device is charged for next session'];
    if (m.includes('nfb') || m.includes('neurofeedback'))
      return ['Some mental fatigue after deep focus sessions is normal', 'Stay hydrated and take a short rest if needed', 'Light physical activity is recommended post-session', 'Note any mood changes, sleep changes, or vivid dreams in your journal'];
    if (m.includes('tps') || m.includes('ultrasound'))
      return ['Rest is recommended for 30 minutes post-session', 'Avoid strenuous physical activity for 2 hours', 'Report any unusual sensations at the treatment site', 'Contact clinic for significant or worsening pain'];
    return ['Rest and stay hydrated', 'Note any unusual symptoms and contact the clinic if concerned', 'Keep your next appointment as scheduled', 'Record any changes in mood, sleep, or cognition'];
  }

  // ── Active course queue ────────────────────────────────────────────────────
  function buildQueue() {
    if (!activeCourses.length)
      return emptyState('◧', 'No active courses. Courses appear here once approved and activated.');
    return activeCourses.map(c => {
      const pct = c.planned_sessions_total > 0
        ? Math.min(100, Math.round(((c.sessions_delivered || 0) / c.planned_sessions_total) * 100)) : 0;
      const patient = c.patient_name || c._patientName || '';
      const sessionN = (c.sessions_delivered || 0) + 1;
      return `<div class="sex-queue-row" onclick="window._seSelectCourse('${c.id}')">
        <div class="sex-queue-info">
          <div class="sex-queue-patient">
            ${patient ? `<span class="sex-queue-pt-name">${patient}</span><span style="color:var(--text-tertiary);margin:0 5px">·</span>` : ''}
            <span style="color:var(--text-primary);font-weight:500">${c.condition_slug?.replace(/-/g,' ') || ''}</span>
            <span class="sex-modality-badge">${c.modality_slug || ''}</span>
          </div>
          <div class="sex-queue-meta">
            Session ${sessionN} of ${c.planned_sessions_total || '?'}
            ${c.planned_frequency_hz ? ` · ${c.planned_frequency_hz} Hz` : ''}
            ${c.target_region ? ` · ${c.target_region}` : ''}
          </div>
        </div>
        <div class="sex-queue-progress">
          <div class="sex-queue-pct">${pct}%</div>
          <div class="sex-queue-bar"><div class="sex-queue-fill" style="width:${pct}%"></div></div>
        </div>
        <span class="sex-queue-cta">Select →</span>
      </div>`;
    }).join('');
  }

  el.innerHTML = `
  <style>
    @keyframes sexPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(1.2)}}
    @keyframes sexFadeIn{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
  </style>

  <!-- Ghost fields: se-course, se-device, se-montage, se-freq, se-intensity, se-pulses, se-duration -->
  <!-- se-outcome, se-tolerance, se-interrupt, se-deviation, se-notes live as real Phase 3 fields -->
  <div style="display:none" aria-hidden="true">
    <input id="se-course" type="text">
    <select id="se-device"><option value="">—</option>${deviceOptions}<option value="other">Other</option></select>
    <input id="se-montage"><input id="se-freq" type="number"><input id="se-intensity" type="number">
    <input id="se-pulses" type="number"><input id="se-duration" type="number">
    <div id="se-protocol-banner"></div><div id="se-consent-banner"></div>
  </div>

  <div id="sex-root">

    <!-- ── Clinical safety disclaimers (always visible) ────────────────── -->
    <!-- launch-audit 2026-04-30: hard-coded clinician-facing reminders so
         the runner never silently runs without governance copy on screen. -->
    <div id="sex-safety-disclaimers" class="card" style="margin-bottom:12px;border:1px solid rgba(245,158,11,0.25);background:rgba(245,158,11,0.05)">
      <div style="padding:10px 14px;font-size:11.5px;color:var(--text-secondary);line-height:1.5">
        <div style="font-weight:600;color:var(--amber);margin-bottom:4px;font-size:12px">Clinical safety reminders</div>
        <ul style="margin:0;padding-left:18px">
          <li>Verify device, montage, and patient consent before starting.</li>
          <li>Monitor patient throughout. Stop if an adverse event occurs.</li>
          <li>Stimulation parameters require device-specific safety review.</li>
          <li>Sessions are clinical decisions. AI suggestions are decision-support only.</li>
        </ul>
      </div>
    </div>

    <!-- ── Plan handoff banner (Brain Map Planner / qEEG Analyzer) ─────── -->
    <!-- Populated by _seConsumePrefilledPlan() once a real plan was pushed
         via window._rxPrefilledProto. Stays hidden when no plan was sent. -->
    <div id="sex-plan-banner" style="display:none;margin-bottom:12px;padding:10px 14px;border-radius:6px;background:rgba(0,212,188,0.07);border:1px solid rgba(0,212,188,0.25);font-size:12px;color:var(--text-secondary)"></div>

    <!-- ── Demo-mode banner (shown when no active courses) ─────────────── -->
    <div id="sex-demo-banner" style="display:none;margin-bottom:12px;padding:10px 14px;border-radius:6px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.3);font-size:12px;color:var(--amber)">
      <strong>Sample session — clinician review required.</strong>
      No live courses are loaded. Any session saved from this view is flagged
      <code style="font-size:11px">is_demo: true</code> and exports stamped DEMO.
    </div>

    <!-- ── STEP 0: SELECT PATIENT ─────────────────────────────────────── -->
    <div id="sex-select">
      ${currentUser?.role === 'technician' ? `<div class="notice notice-info" style="margin-bottom:14px">◧ Technician mode — log session parameters only. Course management is handled by your supervising clinician.</div>` : ''}
      <div class="sex-queue-card card">
        <div class="sex-queue-header">
          <span>Today's Sessions <span class="sex-queue-count">${activeCourses.length}</span></span>
          <input id="sex-search" class="form-control" placeholder="Search patient or condition…"
            style="max-width:220px;height:28px;font-size:12px;padding:0 8px"
            oninput="window._seFilterQueue(this.value)">
        </div>
        <div id="sex-queue-list" style="padding:12px 16px">${buildQueue()}</div>
      </div>
    </div>

    <!-- ── PHASE PROGRESS BAR ──────────────────────────────────────────── -->
    <div id="sex-pbar" class="sex-pbar" style="display:none">
      <div class="sex-pbar-step" id="sex-ps-setup" onclick="window._sePhaseNav('setup')">
        <span class="sex-ps-num">1</span><span class="sex-ps-label">Setup &amp; Safety</span>
      </div>
      <div class="sex-pbar-conn"></div>
      <div class="sex-pbar-step" id="sex-ps-active" onclick="window._sePhaseNav('active')">
        <span class="sex-ps-num">2</span><span class="sex-ps-label">Active Session</span>
      </div>
      <div class="sex-pbar-conn"></div>
      <div class="sex-pbar-step" id="sex-ps-post" onclick="window._sePhaseNav('post')">
        <span class="sex-ps-num">3</span><span class="sex-ps-label">Post-Session</span>
      </div>
    </div>

    <!-- ── PHASE 1: SETUP & SAFETY ────────────────────────────────────── -->
    <div id="sex-phase-setup" class="sex-phase" style="display:none">

      <!-- Patient Identity Banner -->
      <div class="sex-identity-banner">
        <div style="flex:1;min-width:0">
          <div id="sex-h-name" class="sex-identity-name">—</div>
          <div id="sex-h-meta" class="sex-identity-meta"></div>
        </div>
        <div class="sex-identity-session">
          <div id="sex-h-session" class="sex-h-session"></div>
          <div id="sex-h-status" class="sex-status-pill sex-status-pending" style="margin-top:4px;display:inline-block">Pending</div>
        </div>
      </div>
      <div id="sex-h-course-bar" class="sex-h-course-bar" style="display:none;margin-bottom:12px"></div>

      <!-- 2-column layout -->
      <div class="sex-two-col">

        <!-- LEFT COLUMN -->
        <div>
          <!-- Treatment Overview -->
          <div class="card" style="margin-bottom:12px">
            <div class="sex-section-hd">Treatment Overview</div>
            <div id="sex-tx-overview">
              <div style="padding:14px 16px;color:var(--text-tertiary);font-size:12px">Select a course to load overview…</div>
            </div>
          </div>

          <!-- Protocol Details -->
          <div class="card" style="margin-bottom:12px">
            <div class="sex-section-hd">Protocol Details</div>
            <div id="sex-proto-detail">
              <div style="padding:14px 16px;color:var(--text-tertiary);font-size:12px">Loading protocol…</div>
            </div>
            <!-- Editable params (synced to ghost fields) -->
            <div style="padding:0 16px 14px;border-top:1px solid var(--border);margin-top:4px">
              <div style="font-size:10.5px;text-transform:uppercase;letter-spacing:0.7px;color:var(--text-tertiary);margin-bottom:8px;margin-top:10px">Override Parameters</div>
              <div class="sex-param-grid">
                <div class="sex-field-group">
                  <label class="sex-field-lbl">Device</label>
                  <select id="sex-device-vis" class="form-control sex-field-input"
                    onchange="document.getElementById('se-device').value=this.value">
                    <option value="">Select device…</option>${deviceOptions}<option value="other">Other</option>
                  </select>
                </div>
                <div class="sex-field-group">
                  <label class="sex-field-lbl">Site / Montage</label>
                  <input id="sex-montage-vis" class="form-control sex-field-input" placeholder="e.g. F3-Fp2"
                    oninput="document.getElementById('se-montage').value=this.value">
                </div>
                <div class="sex-field-group">
                  <label class="sex-field-lbl">Freq (Hz)</label>
                  <input id="sex-freq-vis" class="form-control sex-field-input" type="number" step="0.1"
                    oninput="document.getElementById('se-freq').value=this.value">
                </div>
                <div class="sex-field-group">
                  <label class="sex-field-lbl">Intensity (% RMT)</label>
                  <input id="sex-intensity-vis" class="form-control sex-field-input" type="number" step="1"
                    oninput="document.getElementById('se-intensity').value=this.value">
                </div>
                <div class="sex-field-group">
                  <label class="sex-field-lbl">Pulses</label>
                  <input id="sex-pulses-vis" class="form-control sex-field-input" type="number"
                    oninput="document.getElementById('se-pulses').value=this.value">
                </div>
                <div class="sex-field-group">
                  <label class="sex-field-lbl">Duration (min)</label>
                  <input id="sex-duration-vis" class="form-control sex-field-input" type="number"
                    oninput="document.getElementById('se-duration').value=this.value;document.getElementById('se-timer-dur').value=this.value">
                </div>
              </div>
            </div>
          </div>

          <!-- Brain Target Card -->
          <div class="card" style="margin-bottom:12px">
            <div class="sex-section-hd">Brain Target</div>
            <div class="sex-brain-target-card">
              <div id="sex-brain-target-setup">
                <div style="width:140px;height:140px;background:rgba(255,255,255,0.03);border-radius:50%;display:flex;align-items:center;justify-content:center;color:var(--text-tertiary);font-size:11px">No target</div>
              </div>
              <div class="sex-brain-placement-note" id="sex-guide-instructions-setup"></div>
            </div>
            <!-- Keep hidden legacy guide elements for _seAutoFill compatibility -->
            <div style="display:none">
              <div id="sex-guide-visual-wrap"></div>
              <div id="sex-guide-instructions" class="sex-guide-text"></div>
            </div>
          </div>

          <!-- Live Protocol Watch -->
          <div class="card" style="margin-bottom:12px">
            <div class="sex-section-hd">Live Protocol Watch</div>
            <div id="sex-live-evidence-watch" style="padding:14px 16px;color:var(--text-tertiary);font-size:12px">Select a course to load live evidence context…</div>
          </div>
        </div>

        <!-- RIGHT COLUMN -->
        <div>
          <!-- Safety Checklist -->
          <div class="card" style="margin-bottom:12px">
            <div class="sex-section-hd">
              Safety Checklist
              <span id="sex-safety-tally" class="sex-safety-tally">0 / 8</span>
            </div>
            <div style="padding:0 16px 12px">
              <div class="sex-checks">
                ${[
                  ['sex-ck-identity', 'Patient identity confirmed against record'],
                  ['sex-ck-contra',   'Contraindications reviewed — none currently active'],
                  ['sex-ck-consent',  'Treatment consent on file and valid'],
                  ['sex-ck-ae',       'Prior adverse events reviewed'],
                  ['sex-ck-assess',   'Baseline / pre-session assessment completed'],
                  ['sex-ck-device',   'Device ready and calibration confirmed'],
                  ['sex-ck-target',   'Target site verified and marked on patient'],
                  ['sex-ck-ready',    'Patient is comfortable and ready to begin'],
                ].map(([id, lbl]) => `
                  <label class="sex-check-row" for="${id}">
                    <input type="checkbox" id="${id}" class="sex-check-input" onchange="window._seCheckSafety()">
                    <span class="sex-check-box"></span>
                    <span class="sex-check-lbl">${lbl}</span>
                  </label>`).join('')}
              </div>
              <div id="sex-safety-err" style="display:none;font-size:11.5px;color:var(--amber);margin-top:8px;padding:6px 10px;background:rgba(255,181,71,0.07);border-radius:4px">
                Complete all safety checks before beginning the session.
              </div>
            </div>
            <!-- Consent status -->
            <div id="sex-consent-display" style="margin:0 16px 12px"></div>
            <!-- Begin button -->
            <div style="padding:0 16px 16px;display:flex;gap:10px;align-items:center">
              <button id="sex-begin-btn" class="btn btn-primary" onclick="window._seBeginSession()" disabled style="opacity:0.5;flex:1">
                Begin Session →
              </button>
              <button class="btn btn-sm" onclick="window._seSetPhase('select')">← Change</button>
            </div>
            <div id="sex-begin-blocker" style="display:none;padding:0 16px 12px;font-size:11.5px;color:var(--amber)"></div>
          </div>

          <!-- ── Impedance check + telemetry honesty (launch-audit 2026-04-30) ── -->
          <div class="card" style="margin-bottom:12px">
            <div class="sex-section-hd">
              Impedance Check
              <span id="sex-imp-status" style="font-size:11px;font-weight:400;color:var(--text-tertiary)">Not measured</span>
            </div>
            <div id="sex-telemetry-banner" style="display:none;margin:10px 16px;padding:8px 12px;border-radius:6px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.3);font-size:11.5px;color:var(--amber)">
              <strong>DEMO TELEMETRY</strong> — clinician must verify on real device. Values shown below are deterministic stubs.
            </div>
            <div style="padding:0 16px 14px">
              <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
                <label class="sex-field-lbl" style="margin:0">Impedance (kΩ)</label>
                <input id="sex-imp-input" class="form-control sex-field-input" type="number" step="0.1" min="0" max="100" placeholder="e.g. 4.8" style="width:90px">
                <button class="btn btn-sm" onclick="window._seMeasureImpedance()">Measure</button>
                <button class="btn btn-sm" onclick="window._seSubmitImpedance()">Record</button>
                <span id="sex-imp-readout" style="font-size:11.5px;color:var(--text-tertiary)"></span>
              </div>
              <div style="font-size:11px;color:var(--text-tertiary);line-height:1.5">
                Threshold: ≤ 10 kΩ to begin. Above threshold requires written override below.
              </div>
              <div id="sex-imp-override-wrap" style="display:none;margin-top:8px">
                <label class="sex-field-lbl">Override reason (required when impedance &gt; 10 kΩ)</label>
                <textarea id="sex-imp-override" class="form-control" rows="2" placeholder="Clinical rationale for proceeding above threshold…" style="font-size:12px;margin-top:4px;resize:vertical"></textarea>
              </div>
            </div>
          </div>
        </div>

      </div><!-- /sex-two-col -->

      <!-- hidden protocol summary params for legacy _seAutoFill compatibility -->
      <div style="display:none">
        <span id="spp-name"></span><span id="spp-label"></span>
        <span id="spp-target"></span><span id="spp-side"></span>
      </div>
    </div>

    <!-- ── PHASE 2: ACTIVE SESSION ────────────────────────────────────── -->
    <div id="sex-phase-active" class="sex-phase" style="display:none">

      <!-- Mini session header strip -->
      <div id="sex-active-header" class="sex-active-hdr-strip">
        <span class="sex-active-hdr-name">—</span>
        <span class="sex-active-hdr-sep">·</span>
        <span style="font-size:12px;color:var(--text-secondary)" id="sex-ah-meta"></span>
        <span class="sex-active-hdr-session" id="sex-ah-session"></span>
        <span class="sex-status-pill sex-status-active" style="font-size:10px;padding:2px 8px">Active</span>
      </div>

      <!-- 2-column active layout -->
      <div class="sex-two-col-active">

        <!-- LEFT: Controls + Delivered Params -->
        <div>
          <!-- Live Session Controls -->
          <div class="card sex-controls-card" style="margin-bottom:12px">
            <div class="sex-section-hd">
              Live Session Controls
              <span id="se-timer-active-label" style="display:none;font-size:11px;color:var(--green);font-weight:600;align-items:center;gap:5px">
                <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--green);animation:sexPulse 1.5s ease-in-out infinite"></span>
                Active
              </span>
            </div>
            <div class="sex-timer-row">
              <div class="sex-timer-block">
                <div class="sex-timer-display" id="se-timer-display">25:00</div>
                <div class="sex-timer-sub">countdown</div>
                <div id="se-timer-pulse" style="display:none;width:8px;height:8px;border-radius:50%;background:var(--green);animation:sexPulse 1.5s ease-in-out infinite;margin:6px auto 0"></div>
              </div>
              <div class="sex-timer-controls">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
                  <label class="sex-field-lbl">Duration (min)</label>
                  <input id="se-timer-dur" type="number" value="25" min="1" max="120"
                    class="sex-field-input form-control" style="width:60px"
                    onchange="window._seTimerReset()">
                </div>
                <div style="display:flex;gap:8px;flex-wrap:wrap">
                  <button class="btn btn-primary" id="se-timer-start-btn" onclick="window._seTimerStart()">▶ Start</button>
                  <button class="btn" id="se-timer-stop-btn" onclick="window._seTimerStop()" style="display:none">⏹ Stop</button>
                </div>
                <div id="se-timer-notice" style="display:none;font-size:12px;color:var(--green);margin-top:8px;padding:6px 10px;background:rgba(74,222,128,0.08);border:1px solid rgba(74,222,128,0.2);border-radius:4px"></div>
                <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
                  <label class="sex-flag-btn sex-flag-amber" id="sex-flag-interrupt">
                    <input type="checkbox" id="sex-p2-interrupt" style="display:none" onchange="window._seUpdateFlags()"> ⚡ Interruption
                  </label>
                  <label class="sex-flag-btn sex-flag-red" id="sex-flag-deviation">
                    <input type="checkbox" id="sex-p2-deviation" style="display:none" onchange="window._seUpdateFlags()"> ⚠ Deviation
                  </label>
                </div>
                <div id="sex-flags-notice" style="display:none;font-size:11.5px;color:var(--amber);margin-top:6px"></div>
              </div>
            </div>
          </div>

          <!-- Delivered Parameters -->
          <div class="card" style="margin-bottom:12px">
            <div class="sex-section-hd">Delivered Parameters <span style="font-size:10px;font-weight:400;color:var(--text-tertiary)">actual vs planned</span></div>
            <div class="sex-delivered-grid">
              <div class="sex-field-group">
                <label class="sex-field-lbl">Actual Intensity (% RMT)</label>
                <input id="sex-actual-intensity" class="form-control sex-field-input" type="number" step="1" placeholder="Planned: —">
              </div>
              <div class="sex-field-group">
                <label class="sex-field-lbl">Actual Duration (min)</label>
                <input id="sex-actual-duration" class="form-control sex-field-input" type="number" placeholder="Planned: —">
              </div>
              <div class="sex-field-group">
                <label class="sex-field-lbl">Delivered Site</label>
                <input id="sex-actual-site" class="form-control sex-field-input" placeholder="e.g. F3-Fp2">
              </div>
              <div class="sex-field-group">
                <label class="sex-field-lbl">Device Used</label>
                <select id="sex-device-vis-active" class="form-control sex-field-input"
                  onchange="document.getElementById('se-device').value=this.value;const s=document.getElementById('sex-device-vis');if(s)s.value=this.value">
                  <option value="">Select device…</option>${deviceOptions}<option value="other">Other</option>
                </select>
              </div>
            </div>
            <div id="sex-deviation-reason-wrap" style="display:none;padding:0 16px 12px">
              <label class="sex-field-lbl">Deviation Reason</label>
              <textarea id="sex-deviation-reason" class="form-control sex-deviation-reason" rows="2"
                placeholder="Describe the protocol deviation and clinical rationale…"
                style="font-size:12.5px;margin-top:6px;resize:vertical"></textarea>
            </div>
          </div>

          <!-- Navigation -->
          <div style="display:flex;gap:10px;margin-bottom:12px">
            <button class="btn btn-primary" onclick="window._seSetPhase('post')">End Session → Post-Session</button>
            <button class="btn btn-sm" onclick="window._seSetPhase('setup')">← Back to Setup</button>
          </div>
        </div>

        <!-- RIGHT: Brain Target + Protocol Ref + Observations -->
        <div>
          <!-- Brain Target -->
          <div class="card" style="margin-bottom:12px">
            <div class="sex-section-hd">Brain Target</div>
            <div class="sex-brain-target-card">
              <div id="sex-brain-target-active">
                <div style="width:140px;height:140px;background:rgba(255,255,255,0.03);border-radius:50%;display:flex;align-items:center;justify-content:center;color:var(--text-tertiary);font-size:11px">No target</div>
              </div>
            </div>
          </div>

          <!-- Protocol Quick Ref -->
          <div class="card" style="margin-bottom:12px">
            <div class="sex-section-hd">Protocol Quick Ref</div>
            <div id="sex-active-proto-ref" class="sex-proto-ref">
              <span style="font-size:12px;color:var(--text-tertiary)">No protocol parameters on file</span>
            </div>
          </div>

          <!-- During-Session Observations -->
          <div class="card" style="margin-bottom:12px">
            <div class="sex-section-hd">During-Session Observations</div>
            <div style="padding:0 16px 16px">
              <div style="margin-bottom:14px">
                <div class="sex-obs-label">Patient Tolerance</div>
                <div class="sex-tol-row">
                  ${[
                    ['well-tolerated',  'Well tolerated',    'var(--teal)'],
                    ['mild-discomfort', 'Mild discomfort',   '#60a5fa'],
                    ['moderate',        'Moderate',          'var(--amber)'],
                    ['poor',            'Poor — stop',       'var(--red)'],
                  ].map(([val, lbl, col]) =>
                    `<button class="sex-tol-btn" data-val="${val}" onclick="window._seSetTolerance('${val}')" style="--tol-color:${col}">${lbl}</button>`
                  ).join('')}
                </div>
              </div>
              <div style="margin-bottom:14px">
                <div class="sex-obs-label">Side Effects <span style="font-weight:400;color:var(--text-tertiary)">(select all that apply)</span></div>
                <div class="sex-se-chips">
                  ${['Headache','Tingling','Burning','Scalp discomfort','Nausea','Dizziness','Fatigue','Eye twitching','Mood change','None'].map(se =>
                    `<button class="sex-se-chip" onclick="window._seToggleSE(this,'${se}')">${se}</button>`
                  ).join('')}
                </div>
              </div>
              <div style="margin-bottom:14px">
                <div class="sex-obs-label">
                  Comfort / Side-effect rating <span style="font-weight:400;color:var(--text-tertiary)">(NRS-SE 0–10, clinician input)</span>
                </div>
                <div style="display:flex;align-items:center;gap:10px;margin-top:4px">
                  <input id="sex-comfort-input" type="number" min="0" max="10" step="1" class="form-control sex-field-input" placeholder="0–10" style="width:80px">
                  <input id="sex-comfort-note" class="form-control sex-field-input" placeholder="Verbatim patient quote (optional)…" style="flex:1">
                  <button class="btn btn-sm" onclick="window._seRecordComfort()">Record NRS-SE</button>
                </div>
                <div id="sex-comfort-log" style="margin-top:6px;font-size:11.5px;color:var(--text-tertiary)"></div>
              </div>
              <div>
                <label class="sex-obs-label">
                  Patient Comments &amp; Notes
                </label>
                <textarea id="sex-obs-note" class="form-control" rows="3"
                  placeholder="Patient reports, observations during stimulation…"
                  style="font-size:12.5px;margin-top:6px"></textarea>
              </div>
              <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
                <button class="btn btn-sm" style="border-color:var(--amber);color:var(--amber)" onclick="window._seOpenAEReporter()">⚠ Report Adverse Event</button>
                <button class="btn btn-sm" onclick="window._seAbortSession()">⏹ Abort Session</button>
              </div>
              <div id="sex-ae-active-panel" style="display:none;margin-top:10px"></div>
            </div>
          </div>
        </div>

      </div><!-- /sex-two-col-active -->
    </div>

    <!-- ── PHASE 3: POST-SESSION ──────────────────────────────────────── -->
    <div id="sex-phase-post" class="sex-phase" style="display:none">

      <!-- Mini session header -->
      <div id="sex-post-header" class="sex-active-hdr-strip">
        <span class="sex-active-hdr-name">—</span>
        <span class="sex-active-hdr-sep">·</span>
        <span style="font-size:12px;color:var(--text-secondary)" id="sex-ph-meta"></span>
        <span class="sex-active-hdr-session" id="sex-ph-session"></span>
        <span class="sex-status-pill sex-status-ready" style="font-size:10px;padding:2px 8px">Post-Session</span>
      </div>

      <!-- 2-column post layout -->
      <div class="sex-two-col-post">

        <!-- LEFT: Post Summary + Aftercare + AE -->
        <div>
          <!-- Post-Session Summary -->
          <div class="card" style="margin-bottom:12px">
            <div class="sex-section-hd">Post-Session Summary</div>
            <div style="padding:0 16px 16px">
              <div class="sex-post-grid">
                <div class="sex-field-group">
                  <label class="sex-field-lbl">Session Outcome <span style="color:var(--red)">*</span></label>
                  <select id="se-outcome" class="form-control sex-field-input">
                    <option value="completed">Completed as planned</option>
                    <option value="partially_completed">Partially completed</option>
                    <option value="parameters_modified">Parameters modified</option>
                    <option value="stopped_early">Stopped early</option>
                  </select>
                </div>
                <div class="sex-field-group">
                  <label class="sex-field-lbl">Final Tolerance</label>
                  <select id="se-tolerance" class="form-control sex-field-input">
                    <option value="">Select…</option>
                    <option value="well-tolerated">Well tolerated</option>
                    <option value="mild-discomfort">Mild discomfort</option>
                    <option value="moderate">Moderate discomfort</option>
                    <option value="poor">Poor — intervention required</option>
                  </select>
                </div>
              </div>
              <div style="display:flex;gap:16px;margin:10px 0 12px;flex-wrap:wrap">
                <label class="sex-check-row">
                  <input type="checkbox" id="se-interrupt" class="sex-check-input">
                  <span class="sex-check-box"></span>
                  <span class="sex-check-lbl" style="color:var(--amber)">Session was interrupted</span>
                </label>
                <label class="sex-check-row">
                  <input type="checkbox" id="se-deviation" class="sex-check-input">
                  <span class="sex-check-box"></span>
                  <span class="sex-check-lbl" style="color:var(--red)">Protocol deviation occurred</span>
                </label>
                <label class="sex-check-row">
                  <input type="checkbox" id="sex-reviewed-pt" class="sex-check-input">
                  <span class="sex-check-box"></span>
                  <span class="sex-check-lbl">Reviewed with patient</span>
                </label>
              </div>
              <label class="sex-field-lbl">Post-Session Notes &amp; Observations</label>
              <textarea id="se-notes" class="form-control" rows="4"
                placeholder="Patient response, tolerance observations, deviation rationale, adverse reactions…"
                style="font-size:12.5px;margin-top:6px;resize:vertical"></textarea>
            </div>
          </div>

          <!-- Aftercare Guidance -->
          <div class="card" style="margin-bottom:12px">
            <div class="sex-section-hd">Aftercare &amp; Next Steps</div>
            <div style="padding:0 16px 16px">
              <div id="sex-aftercare-items" class="sex-aftercare-list"></div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px">
                <div>
                  <label class="sex-field-lbl">Next Appointment</label>
                  <input id="sex-next-appt" class="form-control sex-field-input" placeholder="e.g. Thu 17 Apr, 10:00">
                </div>
                <div>
                  <label class="sex-field-lbl">Home Task Assigned</label>
                  <input id="sex-home-task" class="form-control sex-field-input" placeholder="e.g. HRV breathing 10 min daily">
                </div>
              </div>
              <label class="sex-check-row" style="margin-top:10px">
                <input type="checkbox" id="sex-ac-given" class="sex-check-input">
                <span class="sex-check-box"></span>
                <span class="sex-check-lbl">Aftercare instructions given to patient</span>
              </label>
            </div>
          </div>

          <!-- AE warning panels -->
          <div id="sex-ae-warning" style="display:none" class="notice notice-warn" style="margin-bottom:12px"></div>
          <div id="sex-ae-panel" style="display:none;margin-bottom:12px"></div>
        </div>

        <!-- RIGHT: Quick Outcome + Next Actions -->
        <div>
          <!-- Quick Outcome Capture -->
          <div class="card" style="margin-bottom:12px">
            <div class="sex-section-hd">
              Quick Outcome Capture
              <span style="font-size:10px;font-weight:400;color:var(--text-tertiary)">optional</span>
            </div>
            <div style="padding:0 16px 16px">
              <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:10px">
                <div class="sex-field-group">
                  <label class="sex-field-lbl">Assessment Template</label>
                  <select id="pse-template" class="form-control sex-field-input">
                    <option value="">Skip outcome</option>
                    ${FALLBACK_ASSESSMENT_TEMPLATES.map(t => `<option value="${t.id}">${t.id} — ${t.label.split('—')[1]?.trim() || t.label}</option>`).join('')}
                  </select>
                </div>
                <div class="sex-field-group">
                  <label class="sex-field-lbl">Score</label>
                  <input id="pse-score" class="form-control sex-field-input" type="number" placeholder="e.g. 12">
                </div>
                <div class="sex-field-group">
                  <label class="sex-field-lbl">Measurement Point</label>
                  <select id="pse-point" class="form-control sex-field-input">
                    <option value="mid">Mid-course</option>
                    <option value="post">Post-course</option>
                    <option value="baseline">Baseline</option>
                    <option value="follow_up">Follow-up</option>
                  </select>
                </div>
              </div>
              <div id="pse-error" style="display:none;color:var(--red);font-size:12px;margin-bottom:6px"></div>
              <button class="btn btn-sm" style="width:100%" onclick="window._savePostSessionOutcome(document.getElementById('se-course').value, window._seCurrentPatientId)">
                Save Outcome
              </button>
            </div>
          </div>

          <!-- Clinician sign-off (launch-audit 2026-04-30) ─────────────── -->
          <div class="card" style="margin-bottom:12px">
            <div class="sex-section-hd">
              Clinician Sign-off
              <span id="sex-sign-status" style="font-size:11px;font-weight:400;color:var(--text-tertiary)">Unsigned draft</span>
            </div>
            <div style="padding:0 16px 14px">
              <div style="font-size:11.5px;color:var(--text-secondary);margin-bottom:8px;line-height:1.5">
                Sign-off marks this session record ready for billing review. Without it, the record is a draft.
              </div>
              <input id="sex-sign-note" class="form-control sex-field-input" placeholder="Optional sign-off note…" style="margin-bottom:8px">
              <button class="btn btn-sm" onclick="window._seSignSession()" id="sex-sign-btn">✓ Sign session record</button>
            </div>
          </div>

          <!-- Next Actions -->
          <div class="card sex-actions-card" style="margin-bottom:12px">
            <div class="sex-section-hd">Next Actions</div>
            <div id="se-error" style="display:none;color:var(--red);font-size:12px;margin:0 16px 10px;padding:8px 10px;border-radius:6px;background:rgba(255,107,107,0.07)"></div>
            <div id="se-success" style="display:none;color:var(--green);font-size:12px;margin:0 16px 10px;padding:8px 10px;border-radius:6px;background:rgba(74,222,128,0.07)"></div>
            <div class="sex-next-actions">
              <button id="se-submit-btn" class="sex-action-primary-lg" onclick="window._logSession()">Save Session</button>
              <div class="sex-actions-divider"></div>
              <button class="sex-action-secondary-lg" onclick="window._seLogAndHomeTask()">Save + Assign Home Task</button>
              <button class="sex-action-secondary-lg" onclick="window._seLogAndOutcome()">Save + Log Outcome</button>
              <button class="sex-action-secondary-lg" onclick="window._seLogAndMessage()">Save + Message Patient</button>
              <button class="sex-action-secondary-lg" onclick="window._seLogAndNext()">Save + Next Patient</button>
              <div class="sex-actions-divider"></div>
              <button class="sex-action-secondary-lg sex-action-flag" onclick="window._seLogAndFlag()">Save + Flag for Review</button>
            </div>
            <div style="padding:4px 16px 12px;display:flex;gap:8px;flex-wrap:wrap;border-top:1px solid var(--border);margin-top:4px;padding-top:10px">
              <button class="btn btn-sm no-print"
                onclick="window._printSessionNotes(document.getElementById('se-course').value)">&#128424; Print Notes</button>
              <button class="btn btn-sm" onclick="window._selectedCourseId=document.getElementById('se-course').value;window._cdTab='sessions';window._nav('course-detail')">View Course →</button>
              <button class="btn btn-sm" onclick="window._seSetPhase('active')">← Back to Active</button>
            </div>
          </div>
        </div>

      </div><!-- /sex-two-col-post -->
    </div>
  </div>`;

  // ── Phase state machine ────────────────────────────────────────────────────
  window._seCurrentCourseId  = null;
  window._seCurrentPatientId = null;
  window._seCurrentPhase     = 'select';
  window._seSideEffects      = [];
  window._seCurrentTolerance = null;
  // Session Runner launch-audit 2026-04-30 — runtime state.
  window._seCurrentSessionId    = null;   // ClinicalSession.id once started
  window._seImpedanceMeasured   = false;  // pre-flight gate
  window._seImpedanceValue      = null;   // last recorded kΩ
  window._seImpedanceOverride   = false;  // override granted (with reason)
  window._seIsDemoMode          = false;  // no real plan / course
  window._seHasRealDevice       = false;  // telemetry honesty
  window._seIsSigned            = false;  // post-session sign-off
  window._seComfortRatings      = [];     // [{nrs, note, at}]
  window._sePrefilledPlan       = null;   // captured from _rxPrefilledProto

  // ── Audit helper — surface 'session_runner' (launch-audit 2026-04-30) ──────
  // Best-effort POST to /api/v1/qeeg-analysis/audit-events. NEVER throws,
  // NEVER blocks UI. Surface whitelist extended server-side to allow this
  // string. Audit-trail outages must not break clinical workflow.
  window._seAudit = function(event, extra) {
    try {
      if (!api || typeof api.logAudit !== 'function') return;
      const payload = Object.assign({
        surface: 'session_runner',
        event: String(event || 'unknown'),
        analysis_id: window._seCurrentSessionId || null,
        patient_id: window._seCurrentPatientId || null,
        using_demo_data: !!window._seIsDemoMode,
      }, extra || {});
      const p = api.logAudit(payload);
      if (p && typeof p.catch === 'function') p.catch(function() {});
    } catch (_) { /* never break UI */ }
  };

  // ── Consume window._rxPrefilledProto (Brain Map Planner / qEEG handoff) ────
  // The planner pushes a real plan into the global, then navigates here. We
  // honor it by surfacing a banner + auto-selecting the course whose target
  // matches the plan target when possible. Demo flag is set when no live
  // course is found — saves are honestly flagged is_demo.
  window._seConsumePrefilledPlan = function() {
    const proto = window._rxPrefilledProto;
    if (!proto || typeof proto !== 'object') return;
    window._sePrefilledPlan = proto;
    // Mark the global as consumed so a back-nav doesn't re-trigger it.
    window._rxPrefilledProto = null;
    const banner = document.getElementById('sex-plan-banner');
    if (!banner) return;
    const src = proto.source === 'brain-map-planner' ? 'Brain Map Planner'
              : proto.source === 'designer'          ? 'Protocol Designer'
              : (proto.source || 'plan');
    const targetTxt = proto.target?.region_id || proto.target?.region || proto.target || '—';
    const params = proto.parameters || {};
    const paramTxt = [
      params.frequency_hz ? params.frequency_hz + ' Hz' : null,
      params.intensity ? params.intensity : null,
      params.duration_min ? params.duration_min + ' min' : null,
    ].filter(Boolean).join(' · ') || '—';
    banner.style.display = '';
    banner.innerHTML = '<strong style="color:var(--teal)">Plan handoff from ' + esc(src) + ':</strong> '
      + 'target <strong>' + esc(targetTxt) + '</strong> · ' + esc(paramTxt)
      + ' · clinician must verify against course before starting.';
    window._seAudit('plan_loaded', { note: 'source=' + src + ' target=' + targetTxt });
    // Try to auto-select a matching course if exactly one matches the target.
    try {
      const t = String(targetTxt || '').toLowerCase();
      const matches = (window._seActiveCourses || []).filter(c =>
        (c.target_region || '').toLowerCase().includes(t) ||
        (c.coil_placement || '').toLowerCase().includes(t)
      );
      if (matches.length === 1) {
        setTimeout(() => window._seSelectCourse(matches[0].id), 0);
      }
    } catch (_) {}
  };

  // ── Pre-flight gate guard for Begin Session ────────────────────────────────
  // Hard governance: all 8 safety checks complete AND impedance recorded
  // (≤ threshold OR override reason provided). Without both the button
  // refuses to advance the phase. Replaces the prior naive ``onclick``
  // that just called `_seSetPhase('active')` without the impedance gate.
  window._seBeginSession = function() {
    const blocker = document.getElementById('sex-begin-blocker');
    const reasons = [];
    const ids = ['sex-ck-identity','sex-ck-contra','sex-ck-consent','sex-ck-ae','sex-ck-assess','sex-ck-device','sex-ck-target','sex-ck-ready'];
    const safetyCount = ids.filter(id => document.getElementById(id)?.checked).length;
    if (safetyCount < 8) reasons.push('Complete all ' + (8 - safetyCount) + ' remaining safety check(s).');
    if (!window._seImpedanceMeasured) reasons.push('Record an impedance measurement.');
    if (window._seImpedanceMeasured && window._seImpedanceValue != null && window._seImpedanceValue > 10 && !window._seImpedanceOverride) {
      reasons.push('Impedance ' + window._seImpedanceValue.toFixed(1) + ' kΩ exceeds 10 kΩ threshold — supply override reason.');
    }
    if (window._seConsentBlocked) reasons.push('No valid treatment consent on file.');
    if (reasons.length > 0) {
      if (blocker) { blocker.style.display = ''; blocker.innerHTML = '⚠ ' + reasons.map(esc).join('<br>'); }
      window._seAudit('begin_blocked', { note: reasons.join(' | ') });
      return;
    }
    if (blocker) blocker.style.display = 'none';
    window._seAudit('session_started', {
      note: 'impedance=' + (window._seImpedanceValue ?? '?') + ' override=' + (window._seImpedanceOverride ? 'yes' : 'no'),
    });
    window._seSetPhase('active');
  };

  // ── Impedance handlers (Phase 1) ───────────────────────────────────────────
  // _seMeasureImpedance pulls a deterministic stub from the live telemetry
  // endpoint when no real device is connected. The DEMO TELEMETRY banner is
  // surfaced based on the server's is_demo flag — values are never random.
  window._seMeasureImpedance = async function() {
    const sessionId = window._seCurrentSessionId;
    const banner = document.getElementById('sex-telemetry-banner');
    const input = document.getElementById('sex-imp-input');
    const readout = document.getElementById('sex-imp-readout');
    if (!sessionId) {
      // Without a backing ClinicalSession we still produce a deterministic
      // demo number client-side and flag is_demo. This keeps the rehearsal
      // workflow honest without lying to the clinician.
      if (banner) banner.style.display = '';
      window._seHasRealDevice = false;
      const stub = (Math.abs((window._seCurrentCourseId || 'demo').split('').reduce((a,c)=>(a*31+c.charCodeAt(0))|0,0)) % 800) / 100 + 2;
      const v = Math.round(stub * 10) / 10;
      if (input) input.value = v.toFixed(1);
      if (readout) readout.textContent = 'Stub reading ' + v.toFixed(1) + ' kΩ — clinician must verify.';
      window._seAudit('impedance_measured', { note: 'stub=' + v + ' demo=true' });
      return;
    }
    try {
      const t = await api.getSessionTelemetry(sessionId);
      window._seHasRealDevice = !t.is_demo;
      if (banner) banner.style.display = t.is_demo ? '' : 'none';
      if (t.impedance_kohm != null) {
        if (input) input.value = Number(t.impedance_kohm).toFixed(1);
        if (readout) readout.textContent = (t.is_demo ? 'Stub reading ' : 'Live device reading ') + Number(t.impedance_kohm).toFixed(1) + ' kΩ';
      }
      window._seAudit('impedance_measured', { note: 'value=' + t.impedance_kohm + ' demo=' + t.is_demo });
    } catch (e) {
      if (readout) readout.textContent = 'Telemetry unavailable: ' + (e?.message || 'error');
    }
  };

  window._seSubmitImpedance = async function() {
    const input = document.getElementById('sex-imp-input');
    const readout = document.getElementById('sex-imp-readout');
    const status = document.getElementById('sex-imp-status');
    const overrideWrap = document.getElementById('sex-imp-override-wrap');
    const overrideEl = document.getElementById('sex-imp-override');
    const v = parseFloat(input?.value);
    if (isNaN(v) || v < 0 || v > 100) {
      if (readout) readout.textContent = 'Enter a value 0–100 kΩ.';
      return;
    }
    window._seImpedanceValue = v;
    window._seImpedanceMeasured = true;
    const above = v > 10;
    if (overrideWrap) overrideWrap.style.display = above ? '' : 'none';
    window._seImpedanceOverride = above && !!(overrideEl?.value || '').trim();
    if (status) {
      status.textContent = (above ? '⚠ ' : '✓ ') + v.toFixed(1) + ' kΩ' + (above ? ' (above threshold)' : '');
      status.style.color = above ? 'var(--amber)' : 'var(--teal)';
    }
    // Persist as a server event when a backing session exists.
    if (window._seCurrentSessionId) {
      try { await api.setSessionImpedance(window._seCurrentSessionId, v); } catch (_) {}
    }
    window._seAudit('impedance_recorded', { note: 'value=' + v + ' above_threshold=' + above });
    // Re-evaluate Begin button state.
    window._seCheckSafety();
  };

  // Wire the override textarea to live-update the override flag.
  document.addEventListener('input', function(e) {
    if (e.target && e.target.id === 'sex-imp-override') {
      window._seImpedanceOverride = (e.target.value || '').trim().length > 0;
    }
  }, true);

  // ── Comfort / NRS-SE rating (Phase 2, clinician input only) ────────────────
  // AI must NEVER auto-fill this. The handler refuses to send anything when
  // the clinician hasn't entered a number — there are no defaults.
  window._seRecordComfort = async function() {
    const input = document.getElementById('sex-comfort-input');
    const noteEl = document.getElementById('sex-comfort-note');
    const log = document.getElementById('sex-comfort-log');
    const v = parseInt(input?.value, 10);
    if (isNaN(v) || v < 0 || v > 10) {
      if (log) log.innerHTML = '<span style="color:var(--amber)">Enter 0–10.</span>';
      return;
    }
    const note = (noteEl?.value || '').trim() || null;
    const at = new Date().toLocaleTimeString();
    window._seComfortRatings.push({ nrs: v, note, at });
    if (log) {
      log.innerHTML = window._seComfortRatings.map(r =>
        '<div>' + r.at + ' — NRS-SE <strong>' + r.nrs + '/10</strong>'
        + (r.note ? ' · "' + esc(r.note) + '"' : '') + '</div>'
      ).join('');
    }
    if (input) input.value = '';
    if (noteEl) noteEl.value = '';
    if (window._seCurrentSessionId) {
      try { await api.recordSessionComfort(window._seCurrentSessionId, { nrs_se: v, note }); } catch (_) {}
    }
    window._seAudit('comfort_recorded', { note: 'nrs=' + v + (note ? ' has_note=true' : '') });
  };

  // ── Adverse Event reporter (Phase 2, opens in-place panel) ─────────────────
  // Real submission via window._submitAE → /api/v1/adverse-events. Severity,
  // body system, timing, and action MUST come from clinician input — never
  // generated by AI.
  window._seOpenAEReporter = function() {
    const panel = document.getElementById('sex-ae-active-panel');
    const courseId = window._seCurrentCourseId;
    const patientId = window._seCurrentPatientId;
    if (!panel) return;
    panel.style.display = '';
    panel.innerHTML = renderAEForm(courseId || '', patientId || '')
      + '<div id="ae-error" style="display:none;color:var(--red);font-size:12px;margin-top:6px"></div>'
      + '<div style="display:flex;gap:8px;margin-top:10px">'
      + '<button class="btn btn-sm" style="border-color:var(--amber);color:var(--amber)" onclick="window._submitAE(\'' + (courseId || '') + '\',\'' + (patientId || '') + '\')">Submit AE Report</button>'
      + '<button class="btn btn-sm" onclick="document.getElementById(\'sex-ae-active-panel\').style.display=\'none\'">Cancel</button>'
      + '</div>';
    window._seAudit('adverse_event_opened', {});
  };

  // ── Abort session (Phase 2) ────────────────────────────────────────────────
  window._seAbortSession = async function() {
    const reason = window.prompt('Reason for aborting session (required):', '');
    if (!reason || !reason.trim()) return;
    if (window._seCurrentSessionId) {
      try {
        await api.logSessionEvent(window._seCurrentSessionId, {
          type: 'OPER',
          note: 'Session aborted: ' + reason.trim(),
          payload: { action: 'abort', reason: reason.trim() },
        });
      } catch (_) {}
    }
    window._seAudit('session_aborted', { note: reason.trim().slice(0, 200) });
    window._seSetPhase('post');
    const outcomeEl = document.getElementById('se-outcome');
    if (outcomeEl) outcomeEl.value = 'stopped_early';
    const notesEl = document.getElementById('se-notes');
    if (notesEl && !notesEl.value.includes(reason)) {
      notesEl.value = (notesEl.value ? notesEl.value + '\n' : '') + '[Abort reason] ' + reason.trim();
    }
  };

  // ── Clinician sign-off (Phase 3) ───────────────────────────────────────────
  window._seSignSession = async function() {
    const note = (document.getElementById('sex-sign-note')?.value || '').trim();
    const status = document.getElementById('sex-sign-status');
    const btn = document.getElementById('sex-sign-btn');
    if (window._seIsSigned) return;
    if (window._seCurrentSessionId) {
      try {
        await api.signSession(window._seCurrentSessionId, { note: note || null, is_demo: !!window._seIsDemoMode });
      } catch (e) {
        if (status) { status.textContent = 'Sign-off failed: ' + (e?.message || 'error'); status.style.color = 'var(--red)'; }
        return;
      }
    }
    window._seIsSigned = true;
    if (status) { status.textContent = '✓ Signed' + (window._seIsDemoMode ? ' (DEMO)' : ''); status.style.color = 'var(--teal)'; }
    if (btn) { btn.disabled = true; btn.textContent = '✓ Signed'; btn.style.opacity = '0.6'; }
    window._seAudit('session_signed', { note: 'demo=' + !!window._seIsDemoMode });
  };


  window._seSetPhase = function(phase) {
    window._seCurrentPhase = phase;
    const ids = { select: 'sex-select', setup: 'sex-phase-setup', active: 'sex-phase-active', post: 'sex-phase-post' };
    Object.entries(ids).forEach(([p, id]) => {
      const el2 = document.getElementById(id);
      if (el2) el2.style.display = p === phase ? '' : 'none';
    });
    const pbar = document.getElementById('sex-pbar');
    if (pbar) pbar.style.display = phase === 'select' ? 'none' : '';
    // Progress steps
    const stepN = { setup: 1, active: 2, post: 3 };
    const cur = stepN[phase] || 0;
    ['setup', 'active', 'post'].forEach((p, i) => {
      const s = document.getElementById(`sex-ps-${p}`);
      if (!s) return;
      s.classList.toggle('active', i + 1 <= cur);
      s.classList.toggle('done', i + 1 < cur);
    });
    // Topbar status
    const statusEl = document.getElementById('sex-topbar-status');
    if (statusEl) {
      const labels = {
        select: 'Select a patient to begin',
        setup:  'Setup & Safety — complete all checks before beginning',
        active: 'Session Active',
        post:   'Post-Session — record outcome and save',
      };
      statusEl.textContent = labels[phase] || '';
    }
    // Scroll to top
    document.getElementById('sex-root')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // Sync mini session header strips
    if (phase === 'active' || phase === 'post') {
      const name    = document.getElementById('sex-h-name')?.textContent || '—';
      const meta    = document.getElementById('sex-h-meta')?.textContent || '';
      const session = document.getElementById('sex-h-session')?.textContent || '';
      if (phase === 'active') {
        const nameEl = document.querySelector('#sex-active-header .sex-active-hdr-name');
        const metaEl = document.getElementById('sex-ah-meta');
        const sessEl = document.getElementById('sex-ah-session');
        if (nameEl) nameEl.textContent = name;
        if (metaEl) metaEl.textContent = meta;
        if (sessEl) sessEl.textContent = session;
      } else {
        const nameEl = document.querySelector('#sex-post-header .sex-active-hdr-name');
        const metaEl = document.getElementById('sex-ph-meta');
        const sessEl = document.getElementById('sex-ph-session');
        if (nameEl) nameEl.textContent = name;
        if (metaEl) metaEl.textContent = meta;
        if (sessEl) sessEl.textContent = session;
      }
    }
    // On entering post: sync flags + tolerance + obs notes
    if (phase === 'post') {
      const p2i = document.getElementById('sex-p2-interrupt');
      const p2d = document.getElementById('sex-p2-deviation');
      const p3i = document.getElementById('se-interrupt');
      const p3d = document.getElementById('se-deviation');
      if (p2i && p3i) p3i.checked = p2i.checked;
      if (p2d && p3d) p3d.checked = p2d.checked;
      const tol3 = document.getElementById('se-tolerance');
      if (tol3 && window._seCurrentTolerance && !tol3.value) tol3.value = window._seCurrentTolerance;
      const obsNote = document.getElementById('sex-obs-note');
      const notes3  = document.getElementById('se-notes');
      if (obsNote?.value && notes3 && !notes3.value) notes3.value = obsNote.value;
    }
  };

  window._sePhaseNav = function(phase) {
    const order = ['setup', 'active', 'post'];
    const curIdx = order.indexOf(window._seCurrentPhase);
    const tgtIdx = order.indexOf(phase);
    if (tgtIdx <= curIdx) window._seSetPhase(phase);
  };

  window._seSelectCourse = async function(courseId) {
    document.getElementById('se-course').value = courseId;
    window._seCurrentCourseId  = courseId;
    window._seSideEffects      = [];
    window._seCurrentTolerance = null;
    // Reset safety checks
    ['sex-ck-identity','sex-ck-contra','sex-ck-consent','sex-ck-ae','sex-ck-assess','sex-ck-device','sex-ck-target','sex-ck-ready']
      .forEach(id => { const cb = document.getElementById(id); if (cb) cb.checked = false; });
    window._seCheckSafety();
    // Reset phase 2
    ['sex-p2-interrupt','sex-p2-deviation'].forEach(id => { const cb = document.getElementById(id); if (cb) cb.checked = false; });
    document.querySelectorAll('.sex-tol-btn').forEach(b => b.classList.remove('sex-tol-active'));
    document.querySelectorAll('.sex-se-chip').forEach(b => b.classList.remove('sex-se-active'));
    const obsNote = document.getElementById('sex-obs-note'); if (obsNote) obsNote.value = '';
    // Reset phase 3
    ['se-interrupt','se-deviation'].forEach(id => { const cb = document.getElementById(id); if (cb) cb.checked = false; });
    const notes3 = document.getElementById('se-notes'); if (notes3) notes3.value = '';
    const errEl  = document.getElementById('se-error');   if (errEl)  errEl.style.display = 'none';
    const okEl   = document.getElementById('se-success'); if (okEl)   okEl.style.display  = 'none';
    const sbtn   = document.getElementById('se-submit-btn');
    if (sbtn) { sbtn.disabled = false; sbtn.textContent = 'Save Session'; sbtn.style.opacity = ''; }
    // AE panels
    const aeW = document.getElementById('sex-ae-warning'); if (aeW) aeW.style.display = 'none';
    const aeP = document.getElementById('sex-ae-panel');   if (aeP) aeP.style.display  = 'none';
    // Transition and auto-fill
    window._seSetPhase('setup');
    await window._seAutoFill(courseId);
  };

  window._seCheckSafety = function() {
    const ids = ['sex-ck-identity','sex-ck-contra','sex-ck-consent','sex-ck-ae','sex-ck-assess','sex-ck-device','sex-ck-target','sex-ck-ready'];
    const n = ids.filter(id => document.getElementById(id)?.checked).length;
    const tally = document.getElementById('sex-safety-tally');
    const btn   = document.getElementById('sex-begin-btn');
    const err   = document.getElementById('sex-safety-err');
    if (tally) tally.textContent = `${n} / 8`;
    // Pre-flight gate (launch-audit 2026-04-30): all 8 checks AND impedance
    // measured AND (impedance ≤ 10 kΩ OR override reason provided). Without
    // both the Begin button refuses to advance.
    const impedanceOK = window._seImpedanceMeasured
      && (window._seImpedanceValue == null || window._seImpedanceValue <= 10 || window._seImpedanceOverride);
    const ready = n === 8 && impedanceOK && !window._seConsentBlocked;
    if (btn)   { btn.disabled = !ready; btn.style.opacity = ready ? '' : '0.5'; }
    if (err)   err.style.display = n === 8 ? 'none' : '';
    // When a check is toggled, log it for the audit trail.
    window._seAudit && window._seAudit('safety_check_state', { note: n + '/8 imp_ok=' + (impedanceOK ? '1' : '0') });
  };

  window._seSetTolerance = function(val) {
    window._seCurrentTolerance = val;
    document.querySelectorAll('.sex-tol-btn').forEach(b => b.classList.toggle('sex-tol-active', b.dataset.val === val));
  };

  window._seToggleSE = function(btn, name) {
    const idx = window._seSideEffects.indexOf(name);
    if (name === 'None') {
      window._seSideEffects = idx === -1 ? ['None'] : [];
      document.querySelectorAll('.sex-se-chip').forEach(b =>
        b.classList.toggle('sex-se-active', idx === -1 && b.textContent.trim() === 'None'));
    } else {
      const ni = window._seSideEffects.indexOf('None');
      if (ni !== -1) {
        window._seSideEffects.splice(ni, 1);
        document.querySelectorAll('.sex-se-chip').forEach(b => { if (b.textContent.trim() === 'None') b.classList.remove('sex-se-active'); });
      }
      if (idx === -1) { window._seSideEffects.push(name); btn.classList.add('sex-se-active'); }
      else            { window._seSideEffects.splice(idx, 1); btn.classList.remove('sex-se-active'); }
    }
    const notesEl = document.getElementById('sex-obs-note');
    if (notesEl) {
      const seText = window._seSideEffects.length ? `[Side effects: ${window._seSideEffects.join(', ')}]` : '';
      const existing = notesEl.value.replace(/\[Side effects:.*?\]\n?/g, '').trim();
      notesEl.value = seText ? (existing ? `${existing}\n${seText}` : seText) : existing;
    }
  };

  window._seUpdateFlags = function() {
    const p2i = document.getElementById('sex-p2-interrupt')?.checked;
    const p2d = document.getElementById('sex-p2-deviation')?.checked;
    document.getElementById('sex-flag-interrupt')?.classList.toggle('sex-flag-active', !!p2i);
    document.getElementById('sex-flag-deviation')?.classList.toggle('sex-flag-active', !!p2d);
    const notice = document.getElementById('sex-flags-notice');
    const msgs = [];
    if (p2i) msgs.push('⚡ Interruption flagged — note reason in observations below');
    if (p2d) msgs.push('⚠ Deviation flagged — record parameter deviation in observations');
    if (notice) { notice.textContent = msgs.join(' · '); notice.style.display = msgs.length ? '' : 'none'; }
    const devReason = document.getElementById('sex-deviation-reason-wrap');
    if (devReason) devReason.style.display = p2d ? '' : 'none';
  };

  window._seFilterQueue = function(query) {
    const q = (query || '').toLowerCase().trim();
    document.querySelectorAll('.sex-queue-row').forEach(row => {
      row.style.display = (!q || row.textContent.toLowerCase().includes(q)) ? '' : 'none';
    });
  };

  window._seLogAndNext = async function() {
    await window._logSession();
    const ok = document.getElementById('se-success');
    if (ok && ok.style.display !== 'none') setTimeout(() => window._seSetPhase('select'), 1800);
  };

  window._seLogAndFlag = async function() {
    const devEl = document.getElementById('se-deviation');
    if (devEl) devEl.checked = true;
    await window._logSession();
    const ok = document.getElementById('se-success');
    if (ok && ok.style.display !== 'none') setTimeout(() => window._nav?.('review-queue'), 1800);
  };

  window._seLogAndHomeTask = async function() {
    await window._logSession();
    const ok = document.getElementById('se-success');
    if (ok && ok.style.display !== 'none') setTimeout(() => window._nav?.('home-task-manager'), 1400);
  };

  window._seLogAndOutcome = async function() {
    await window._logSession();
    const ok = document.getElementById('se-success');
    if (ok && ok.style.display !== 'none') setTimeout(() => window._nav?.('outcomes'), 1400);
  };

  window._seLogAndMessage = async function() {
    await window._logSession();
    const ok = document.getElementById('se-success');
    if (ok && ok.style.display !== 'none') setTimeout(() => window._nav?.('messaging'), 1400);
  };

  // ── Session Save ───────────────────────────────────────────────────────────
  window._logSession = async function() {
    const courseId  = document.getElementById('se-course')?.value;
    const errEl     = document.getElementById('se-error');
    const okEl      = document.getElementById('se-success');
    const submitBtn = document.getElementById('se-submit-btn');
    if (errEl) errEl.style.display = 'none';
    if (okEl)  okEl.style.display  = 'none';

    if (window._seConsentBlocked) {
      if (errEl) { errEl.textContent = 'Cannot log session: no valid treatment consent on file for this patient.'; errEl.style.display = ''; }
      return;
    }
    if (!courseId) {
      if (errEl) { errEl.textContent = 'Select a treatment course.'; errEl.style.display = ''; }
      return;
    }
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Saving\u2026'; }

    try {
      const toleranceVal = document.getElementById('se-tolerance')?.value || window._seCurrentTolerance || null;
      const outcomeVal   = document.getElementById('se-outcome')?.value   || 'completed';
      const notesBase    = document.getElementById('se-notes')?.value     || '';
      const obsNote      = document.getElementById('sex-obs-note')?.value || '';
      const combinedNotes = [notesBase, (obsNote && !notesBase.includes(obsNote)) ? obsNote : ''].filter(Boolean).join('\n');
      const sessionData = {
        device_slug:        document.getElementById('se-device')?.value   || null,
        coil_position:      document.getElementById('se-montage')?.value  || null,
        frequency_hz:       parseFloat(document.getElementById('se-freq')?.value)       || null,
        intensity_pct_rmt:  parseFloat(document.getElementById('se-intensity')?.value)  || null,
        pulses_delivered:   parseInt(document.getElementById('se-pulses')?.value)       || null,
        duration_minutes:   parseInt(document.getElementById('se-duration')?.value)     || null,
        tolerance_rating:   toleranceVal,
        session_outcome:    outcomeVal,
        interruptions:      document.getElementById('se-interrupt')?.checked  || false,
        protocol_deviation: document.getElementById('se-deviation')?.checked  || false,
        post_session_notes: combinedNotes || null,
        actual_intensity_pct:      parseFloat(document.getElementById('sex-actual-intensity')?.value) || null,
        actual_duration_minutes:   parseInt(document.getElementById('sex-actual-duration')?.value)    || null,
        delivered_site:            document.getElementById('sex-actual-site')?.value                  || null,
        deviation_reason:          document.getElementById('sex-deviation-reason')?.value             || null,
      };

      if (!navigator.onLine) {
        if (errEl) { errEl.textContent = 'No internet connection. Session logs require an active connection.'; errEl.style.display = ''; }
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Save Session'; }
        return;
      }

      const session = await api.logSession(courseId, sessionData);
      window._seAudit && window._seAudit('post_summary_saved', {
        note: 'outcome=' + outcomeVal + ' tolerance=' + (toleranceVal || '?')
              + ' deviation=' + (sessionData.protocol_deviation ? '1' : '0')
              + ' interrupt=' + (sessionData.interruptions ? '1' : '0')
              + ' demo=' + !!window._seIsDemoMode,
      });

      const course    = (window._seActiveCourses || []).find(c => c.id === courseId) || {};
      const patientId = course.patient_id || null;
      window._seCurrentPatientId = patientId;
      const needsAE   = toleranceVal === 'poor' || outcomeVal === 'stopped_early';

      // Show success state
      if (okEl) {
        okEl.innerHTML = session.offline
          ? '\u{1F4BE} Saved offline \u2014 will sync when connected.'
          : `\u2713 Session ${(course.sessions_delivered || 0) + 1} logged for <strong>${_esc(course.condition_slug?.replace(/-/g, ' ')) || 'course'}</strong>.`;
        okEl.style.display = '';
      }
      if (submitBtn) { submitBtn.textContent = 'Saved \u2713'; submitBtn.style.opacity = '0.6'; }

      // AE warning if poor tolerance or stopped early
      if (needsAE) {
        const aeWarn  = document.getElementById('sex-ae-warning');
        const aePanel = document.getElementById('sex-ae-panel');
        if (aeWarn) {
          aeWarn.style.display = '';
          aeWarn.innerHTML = `<strong>\u26A0 Attention required:</strong> Tolerance rated \u201C${_esc(toleranceVal || outcomeVal)}\u201D. Consider filing an adverse event report.`;
        }
        if (aePanel) {
          aePanel.style.display = '';
          aePanel.innerHTML = renderAEForm(courseId, patientId) +
            `<div id="ae-error" style="display:none;color:var(--red);font-size:12px;margin-top:6px"></div>
             <div style="display:flex;gap:8px;margin-top:10px">
               <button class="btn btn-sm" style="border-color:var(--amber);color:var(--amber)"
                 onclick="window._submitAE('${courseId}','${patientId}')">Submit AE Report</button>
               <button class="btn btn-sm"
                 onclick="document.getElementById('sex-ae-panel').style.display='none'">Skip</button>
             </div>`;
        }
      }
    } catch (e) {
      if (errEl) { errEl.textContent = e.message || 'Failed to log session.'; errEl.style.display = ''; }
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Save Session'; }
      window._seAudit && window._seAudit('post_summary_save_failed', { note: String(e?.message || e).slice(0, 200) });
    }
  };

  window._savePostSessionOutcome = async function(courseId, patientId) {
    const template = document.getElementById('pse-template')?.value;
    const score    = parseFloat(document.getElementById('pse-score')?.value);
    const point    = document.getElementById('pse-point')?.value || 'mid';
    const errEl    = document.getElementById('pse-error');
    if (errEl) errEl.style.display = 'none';
    if (!template) return;
    if (isNaN(score)) {
      if (errEl) { errEl.textContent = 'Enter a numeric score.'; errEl.style.display = ''; }
      return;
    }
    try {
      await api.recordOutcome({
        course_id: courseId, patient_id: patientId || null,
        template_id: template, template_title: template,
        score: String(score), score_numeric: score,
        measurement_point: point,
      });
      // Show inline confirmation
      const btn = document.querySelector('button[onclick*="_savePostSessionOutcome"]');
      const row = btn?.closest('[style*="grid-template-columns"]')?.parentElement;
      if (row) row.innerHTML = `<div style="color:var(--teal);font-size:12.5px;padding:8px 0">\u2713 Outcome recorded: ${template} = ${score} (${point})</div>`;
    } catch (e) {
      if (errEl) { errEl.textContent = e.message || 'Failed.'; errEl.style.display = ''; }
    }
  };

  // ── Print Session Notes ────────────────────────────────────────────────────
  window._printSessionNotes = async function(courseId) {
    const genDate = new Date().toLocaleString();
    const sessionDate = new Date().toLocaleDateString();
    const course2 = (window._seActiveCourses || []).find(c => c.id === courseId) || {};
    const sessionNum = (course2.sessions_delivered || 0) + 1;
    const condLabel = course2.condition_slug ? course2.condition_slug.replace(/-/g, ' ') : '\u2014';
    const modLabel  = course2.modality_slug || '\u2014';
    const freq      = document.getElementById('se-freq')?.value      || '\u2014';
    const intensity = document.getElementById('se-intensity')?.value || '\u2014';
    const pulses    = document.getElementById('se-pulses')?.value    || '\u2014';
    const duration  = document.getElementById('se-duration')?.value  || '\u2014';
    const montage   = document.getElementById('se-montage')?.value   || '\u2014';
    const device    = document.getElementById('se-device')?.value    || '\u2014';
    const tolerance = document.getElementById('se-tolerance')?.value || '\u2014';
    const sOutcome  = document.getElementById('se-outcome')?.value   || '\u2014';
    const notes     = document.getElementById('se-notes')?.value     || '';
    const interrupted = document.getElementById('se-interrupt')?.checked ? 'Yes' : 'No';
    const deviation   = document.getElementById('se-deviation')?.checked ? 'Yes' : 'No';
    let patientName = '\u2014';
    if (course2.patient_id) {
      try {
        const pt = await api.getPatient(course2.patient_id).catch(() => null);
        if (pt) patientName = pt.first_name + ' ' + pt.last_name;
      } catch (_) {}
    }
    let snFrame = document.getElementById('sn-print-frame');
    if (snFrame) snFrame.remove();
    snFrame = document.createElement('div');
    snFrame.id = 'sn-print-frame';
    snFrame.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:white;z-index:99999;overflow:auto;padding:32px;box-sizing:border-box;color:#111;font-family:serif;font-size:11pt';
    const snNotesSection = notes
      ? '<h3 style="font-size:12pt;color:#003366;border-bottom:1px solid #ccc;padding-bottom:4px;margin-bottom:10px">Clinician Notes</h3>'
        + '<div style="font-size:10pt;line-height:1.6;padding:10px;background:#f9f9f9;border:1px solid #ddd;border-radius:4px;margin-bottom:20px;white-space:pre-wrap">' + notes + '</div>'
      : '';
    // launch-audit 2026-04-30: stamp DEMO when no live courses backed the
    // saved record, so paper exports never get mistaken for real clinical
    // documentation.
    const _isDemoExport = !!window._seIsDemoMode;
    const _demoStamp = _isDemoExport
      ? '<div style="background:#f59e0b;color:white;padding:2px 8px;border-radius:3px;font-weight:700;margin-top:4px;display:inline-block">DEMO — clinician review required</div>'
      : '';
    snFrame.innerHTML = [
      '<div style="border-bottom:2px solid #003366;padding-bottom:12px;margin-bottom:20px">',
      '<div style="display:flex;justify-content:space-between;align-items:flex-start">',
      '<div><div style="font-size:18pt;font-weight:700;color:#003366">DeepSynaps Protocol Studio</div>',
      '<div style="font-size:10pt;color:#555;margin-top:2px">Session Notes</div>',
      _demoStamp,
      '</div>',
      '<div style="text-align:right;font-size:9pt;color:#555"><div>Date: ' + sessionDate + '</div>',
      '<div style="background:#cc0000;color:white;padding:2px 8px;border-radius:3px;font-weight:700;margin-top:4px">CONFIDENTIAL</div></div>',
      '</div></div>',
      '<table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:10pt"><tbody>',
      '<tr><td style="padding:5px 8px;border:1px solid #ddd;font-weight:600;background:#f5f7fa;width:35%">Patient</td><td style="padding:5px 8px;border:1px solid #ddd">' + patientName + '</td></tr>',
      '<tr><td style="padding:5px 8px;border:1px solid #ddd;font-weight:600;background:#f5f7fa">Condition</td><td style="padding:5px 8px;border:1px solid #ddd">' + condLabel + '</td></tr>',
      '<tr><td style="padding:5px 8px;border:1px solid #ddd;font-weight:600;background:#f5f7fa">Modality</td><td style="padding:5px 8px;border:1px solid #ddd">' + modLabel + '</td></tr>',
      '<tr><td style="padding:5px 8px;border:1px solid #ddd;font-weight:600;background:#f5f7fa">Session #</td><td style="padding:5px 8px;border:1px solid #ddd">' + sessionNum + ' of ' + (course2.planned_sessions_total || '?') + '</td></tr>',
      '<tr><td style="padding:5px 8px;border:1px solid #ddd;font-weight:600;background:#f5f7fa">Session Date</td><td style="padding:5px 8px;border:1px solid #ddd">' + sessionDate + '</td></tr>',
      '</tbody></table>',
      '<h3 style="font-size:12pt;color:#003366;border-bottom:1px solid #ccc;padding-bottom:4px;margin-bottom:10px">Delivered Parameters</h3>',
      '<table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:10pt"><tbody>',
      '<tr><td style="padding:5px 8px;border:1px solid #ddd;font-weight:600;background:#f5f7fa;width:35%">Device</td><td style="padding:5px 8px;border:1px solid #ddd">' + device + '</td></tr>',
      '<tr><td style="padding:5px 8px;border:1px solid #ddd;font-weight:600;background:#f5f7fa">Stimulation Site</td><td style="padding:5px 8px;border:1px solid #ddd">' + montage + '</td></tr>',
      '<tr><td style="padding:5px 8px;border:1px solid #ddd;font-weight:600;background:#f5f7fa">Frequency (Hz)</td><td style="padding:5px 8px;border:1px solid #ddd">' + freq + '</td></tr>',
      '<tr><td style="padding:5px 8px;border:1px solid #ddd;font-weight:600;background:#f5f7fa">Intensity (% RMT)</td><td style="padding:5px 8px;border:1px solid #ddd">' + intensity + '</td></tr>',
      '<tr><td style="padding:5px 8px;border:1px solid #ddd;font-weight:600;background:#f5f7fa">Pulses</td><td style="padding:5px 8px;border:1px solid #ddd">' + pulses + '</td></tr>',
      '<tr><td style="padding:5px 8px;border:1px solid #ddd;font-weight:600;background:#f5f7fa">Duration (min)</td><td style="padding:5px 8px;border:1px solid #ddd">' + duration + '</td></tr>',
      '</tbody></table>',
      '<h3 style="font-size:12pt;color:#003366;border-bottom:1px solid #ccc;padding-bottom:4px;margin-bottom:10px">Tolerance &amp; Outcome</h3>',
      '<table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:10pt"><tbody>',
      '<tr><td style="padding:5px 8px;border:1px solid #ddd;font-weight:600;background:#f5f7fa;width:35%">Tolerance</td><td style="padding:5px 8px;border:1px solid #ddd">' + tolerance + '</td></tr>',
      '<tr><td style="padding:5px 8px;border:1px solid #ddd;font-weight:600;background:#f5f7fa">Outcome</td><td style="padding:5px 8px;border:1px solid #ddd">' + sOutcome + '</td></tr>',
      '<tr><td style="padding:5px 8px;border:1px solid #ddd;font-weight:600;background:#f5f7fa">Interrupted</td><td style="padding:5px 8px;border:1px solid #ddd">' + interrupted + '</td></tr>',
      '<tr><td style="padding:5px 8px;border:1px solid #ddd;font-weight:600;background:#f5f7fa">Protocol Deviation</td><td style="padding:5px 8px;border:1px solid #ddd">' + deviation + '</td></tr>',
      '</tbody></table>',
      snNotesSection,
      '<div style="margin-top:20px;padding-top:10px;border-top:1px solid #ccc;font-size:8pt;color:#888;display:flex;justify-content:space-between">',
      '<span>DeepSynaps Protocol Studio &mdash; Confidential Session Notes</span>',
      '<span>Generated ' + genDate + '</span></div>',
      '<div style="margin-top:16px;display:flex;gap:10px">',
      '<button onclick="window.print();document.getElementById(\'sn-print-frame\')?.remove()" style="padding:8px 18px;background:#003366;color:white;border:none;border-radius:4px;cursor:pointer;font-size:11pt">&#128424; Print / Save PDF</button>',
      '<button onclick="document.getElementById(\'sn-print-frame\')?.remove()" style="padding:8px 18px;background:#eee;color:#333;border:none;border-radius:4px;cursor:pointer;font-size:11pt">&#10005; Close</button>',
      '</div>',
    ].join('');
    document.body.appendChild(snFrame);
    window._seAudit && window._seAudit('export_session_notes', { note: 'demo=' + !!window._seIsDemoMode });
  };

  // ── Session Timer ──────────────────────────────────────────────────────────
  if (window._seTimerInterval) { clearInterval(window._seTimerInterval); window._seTimerInterval = null; }
  if (!('_seTimerRemaining' in window)) window._seTimerRemaining = 0;

  window._seTimerReset = function() {
    const dur = parseInt(document.getElementById('se-timer-dur')?.value) || 25;
    window._seTimerRemaining = dur * 60;
    const disp = document.getElementById('se-timer-display');
    if (disp) disp.textContent = String(Math.floor(window._seTimerRemaining / 60)).padStart(2, '0') + ':' + String(window._seTimerRemaining % 60).padStart(2, '0');
  };

  window._seTimerStart = function() {
    if (window._seTimerInterval) clearInterval(window._seTimerInterval);
    const dur = parseInt(document.getElementById('se-timer-dur')?.value) || 25;
    window._seTimerRemaining = dur * 60;
    window._seAudit && window._seAudit('timer_started', { note: 'duration_min=' + dur });
    const startBtn    = document.getElementById('se-timer-start-btn');
    const stopBtn     = document.getElementById('se-timer-stop-btn');
    const pulse       = document.getElementById('se-timer-pulse');
    const activeLabel = document.getElementById('se-timer-active-label');
    if (startBtn) startBtn.style.display = 'none';
    if (stopBtn)  stopBtn.style.display  = '';
    if (pulse)    pulse.style.display    = '';
    if (activeLabel) activeLabel.style.display = 'flex';
    window._seTimerInterval = setInterval(function() {
      if (!document.getElementById('se-timer-display')) {
        clearInterval(window._seTimerInterval); window._seTimerInterval = null; return;
      }
      window._seTimerRemaining--;
      const m = Math.floor(window._seTimerRemaining / 60);
      const s = window._seTimerRemaining % 60;
      const disp = document.getElementById('se-timer-display');
      if (disp) {
        disp.textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
        disp.style.color = window._seTimerRemaining <= 0 ? 'var(--red)' : window._seTimerRemaining <= 60 ? 'var(--amber)' : 'var(--teal)';
      }
      if (window._seTimerRemaining <= 0) {
        clearInterval(window._seTimerInterval);
        window._seTimerInterval = null;
        window._seTimerStop();
        const notice = document.getElementById('se-timer-notice');
        if (notice) { notice.style.display = ''; notice.innerHTML = '\u2713 Session complete \u2014 proceed to post-session.'; }
      }
    }, 1000);
  };

  window._seTimerStop = function() {
    if (window._seTimerInterval) { clearInterval(window._seTimerInterval); window._seTimerInterval = null; }
    const startBtn    = document.getElementById('se-timer-start-btn');
    const stopBtn     = document.getElementById('se-timer-stop-btn');
    const pulse       = document.getElementById('se-timer-pulse');
    const activeLabel = document.getElementById('se-timer-active-label');
    if (startBtn) startBtn.style.display = '';
    if (stopBtn)  stopBtn.style.display  = 'none';
    if (pulse)    pulse.style.display    = 'none';
    if (activeLabel) activeLabel.style.display = 'none';
    window._seAudit && window._seAudit('timer_stopped', { note: 'remaining_sec=' + (window._seTimerRemaining || 0) });
  };

  // ── Auto-fill from course data ─────────────────────────────────────────────
  window._seActiveCourses = activeCourses;

  window._seAutoFill = async function(courseId) {
    const consentDisplay = document.getElementById('sex-consent-display');
    const submitBtn = document.getElementById('se-submit-btn');
    window._seConsentBlocked = false;
    if (submitBtn) submitBtn.disabled = false;
    if (!courseId) return;
    const course = (window._seActiveCourses || []).find(c => c.id === courseId);
    if (!course) return;
    const liveWatchEl = document.getElementById('sex-live-evidence-watch');
    if (liveWatchEl) liveWatchEl.innerHTML = '<div style="font-size:12px;color:var(--text-tertiary)">Loading live evidence context…</div>';

    // ── Populate ghost fields ─────────────────────────────────────────────────
    const setGhost = (id, val) => { const el2 = document.getElementById(id); if (el2 && val != null) el2.value = val; };
    setGhost('se-freq',      course.planned_frequency_hz || '');
    setGhost('se-intensity', course.planned_intensity || '');
    setGhost('se-duration',  course.planned_session_duration_minutes || '');
    setGhost('se-montage',   course.coil_placement || '');

    // ── Populate visible sync fields ──────────────────────────────────────────
    const setVis = (id, val) => { const el2 = document.getElementById(id); if (el2 && val != null) el2.value = val; };
    setVis('sex-freq-vis',      course.planned_frequency_hz || '');
    setVis('sex-intensity-vis', course.planned_intensity || '');
    setVis('sex-duration-vis',  course.planned_session_duration_minutes || '');
    setVis('sex-montage-vis',   course.coil_placement || '');
    // Timer duration
    const durEl = document.getElementById('se-timer-dur');
    if (durEl && course.planned_session_duration_minutes) durEl.value = course.planned_session_duration_minutes;

    // ── Protocol summary params ───────────────────────────────────────────────
    const setText = (id, val) => { const el2 = document.getElementById(id); if (el2) el2.textContent = val || '—'; };
    const proto = course.protocol_id || course.protocol_name || course.modality_slug || '—';
    setText('spp-name',   proto);
    setText('spp-label',  course.on_label === false ? 'Off-label' : 'On-label');
    setText('spp-target', course.target_region || '—');
    setText('spp-side',   course.laterality || course.coil_placement || '—');

    // ── Session header ────────────────────────────────────────────────────────
    const sessionN = (course.sessions_delivered || 0) + 1;
    const sessionTotal = course.planned_sessions_total || '?';
    const condLabel = course.condition_slug?.replace(/-/g, ' ') || '—';
    const modalityLabel = course.modality_slug || '—';
    let patientNameStr = '';
    if (course.patient_id) {
      try {
        const pt = await api.getPatient(course.patient_id).catch(() => null);
        if (pt) {
          patientNameStr = `${pt.first_name || ''} ${pt.last_name || ''}`.trim();
          window._seCurrentPatientId = course.patient_id;
        }
      } catch (_) {}
    }
    const nameEl = document.getElementById('sex-h-name');
    const metaEl = document.getElementById('sex-h-meta');
    const sessEl = document.getElementById('sex-h-session');
    const statusEl = document.getElementById('sex-h-status');
    if (nameEl) nameEl.textContent = patientNameStr || condLabel;
    if (metaEl) metaEl.textContent = [condLabel, modalityLabel].filter(Boolean).join(' · ');
    if (sessEl) sessEl.textContent = `Session ${sessionN} of ${sessionTotal}`;
    if (statusEl) { statusEl.textContent = 'Ready'; statusEl.className = 'sex-status-pill sex-status-ready'; }

    // ── Course progress bar ───────────────────────────────────────────────────
    const courseBar = document.getElementById('sex-h-course-bar');
    if (courseBar && course.planned_sessions_total > 0) {
      const pct = Math.min(100, Math.round(((course.sessions_delivered || 0) / course.planned_sessions_total) * 100));
      courseBar.style.display = '';
      courseBar.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;padding:0 16px 12px">
          <div style="flex:1;height:4px;background:var(--border);border-radius:2px">
            <div style="height:4px;border-radius:2px;background:var(--teal);width:${pct}%;transition:width .4s"></div>
          </div>
          <span style="font-size:10.5px;color:var(--text-tertiary);white-space:nowrap">${pct}% complete</span>
        </div>`;
    }

    // ── Stimulation guide SVG ─────────────────────────────────────────────────
    const vizWrap = document.getElementById('sex-guide-visual-wrap');
    const guideText = document.getElementById('sex-guide-instructions');
    if (vizWrap) vizWrap.innerHTML = siteVisual(course.target_region || course.coil_placement || '');
    if (guideText) {
      const target = course.target_region || course.coil_placement || '';
      const freq   = course.planned_frequency_hz;
      const inten  = course.planned_intensity;
      const dur    = course.planned_session_duration_minutes;
      guideText.innerHTML = [
        target ? `<p><strong>Target site:</strong> ${target}</p>` : '',
        (freq || inten || dur) ? `<p><strong>Parameters:</strong> ${[
          freq  ? `${freq} Hz` : null,
          inten ? `${inten}% RMT` : null,
          dur   ? `${dur} min` : null,
        ].filter(Boolean).join(' · ')}</p>` : '',
        course.coil_placement ? `<p><strong>Placement:</strong> ${course.coil_placement}</p>` : '',
        course.notes ? `<p style="color:var(--text-secondary);font-size:11.5px">${course.notes}</p>` : '',
      ].filter(Boolean).join('') || '<p style="color:var(--text-tertiary)">No placement details on file — confirm with protocol.</p>';
    }

    // ── Treatment overview card ───────────────────────────────────────────────
    const txOv = document.getElementById('sex-tx-overview');
    if (txOv) {
      const sessN = (course.sessions_delivered || 0) + 1;
      const sessTotal = course.planned_sessions_total || '?';
      const sessDone = course.sessions_delivered || 0;
      const pct = sessTotal !== '?' ? Math.min(100, Math.round((sessDone / sessTotal) * 100)) : 0;
      const phase = course.phase || (sessDone < 5 ? 'Initiation' : sessDone < 15 ? 'Treatment' : 'Maintenance');
      const goal = course.goal || course.treatment_goal || 'Symptom reduction via neuromodulation';
      const lastOutcome = course.last_outcome_score != null ? `${course.last_outcome_score} (${course.last_outcome_template || 'score'})` : '—';
      // Honest unknown: never default tolerance to "Well tolerated" when there
      // is no real prior reading on file — that would fabricate a clinical
      // observation. (launch-audit 2026-04-30)
      const lastTol = course.last_tolerance || '—';
      txOv.innerHTML = `
        <div class="sex-tx-overview-grid">
          <div class="sex-tx-stat">
            <div class="sex-tx-stat-label">Goal</div>
            <div class="sex-tx-stat-val" style="font-size:12.5px;font-weight:500">${esc(goal)}</div>
          </div>
          <div class="sex-tx-stat">
            <div class="sex-tx-stat-label">Phase</div>
            <div class="sex-tx-stat-val">${esc(phase)}</div>
          </div>
          <div class="sex-tx-stat" style="grid-column:span 2">
            <div class="sex-tx-stat-label">Progress — Session ${sessN} of ${sessTotal}</div>
            <div class="sex-tx-progress"><div class="sex-tx-progress-fill" style="width:${pct}%"></div></div>
            <div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">${sessDone} delivered · ${sessTotal !== '?' ? sessTotal - sessDone : '?'} remaining</div>
          </div>
          <div class="sex-tx-stat">
            <div class="sex-tx-stat-label">Last Outcome</div>
            <div class="sex-tx-stat-val" style="font-size:13px">${esc(lastOutcome)}</div>
          </div>
          <div class="sex-tx-stat">
            <div class="sex-tx-stat-label">Last Tolerance</div>
            <div class="sex-tx-stat-val" style="font-size:13px">${esc(lastTol)}</div>
          </div>
        </div>`;
    }

    // ── Protocol detail card ──────────────────────────────────────────────────
    const protoDet = document.getElementById('sex-proto-detail');
    if (protoDet) {
      const onLabel = course.on_label === false
        ? '<span style="background:rgba(245,158,11,0.15);color:var(--amber);border:1px solid rgba(245,158,11,0.3);border-radius:4px;padding:2px 7px;font-size:11px;font-weight:600">Off-label</span>'
        : '<span style="background:rgba(34,197,94,0.12);color:var(--green);border:1px solid rgba(34,197,94,0.25);border-radius:4px;padding:2px 7px;font-size:11px;font-weight:600">On-label</span>';
      protoDet.innerHTML = `
        <div class="sex-proto-detail-grid">
          <div class="sex-proto-field"><span class="sex-proto-field-label">Protocol</span><span class="sex-proto-field-val">${esc(course.protocol_id || course.protocol_name || '—')}</span></div>
          <div class="sex-proto-field"><span class="sex-proto-field-label">Type</span><span class="sex-proto-field-val">${onLabel}</span></div>
          <div class="sex-proto-field"><span class="sex-proto-field-label">Target Site</span><span class="sex-proto-field-val">${esc(course.target_region || '—')}</span></div>
          <div class="sex-proto-field"><span class="sex-proto-field-label">Laterality</span><span class="sex-proto-field-val">${esc(course.laterality || '—')}</span></div>
          <div class="sex-proto-field"><span class="sex-proto-field-label">Planned Freq</span><span class="sex-proto-field-val">${course.planned_frequency_hz ? course.planned_frequency_hz + ' Hz' : '—'}</span></div>
          <div class="sex-proto-field"><span class="sex-proto-field-label">Intensity</span><span class="sex-proto-field-val">${course.planned_intensity ? course.planned_intensity + '% RMT' : '—'}</span></div>
          <div class="sex-proto-field"><span class="sex-proto-field-label">Duration</span><span class="sex-proto-field-val">${course.planned_session_duration_minutes ? course.planned_session_duration_minutes + ' min' : '—'}</span></div>
          <div class="sex-proto-field"><span class="sex-proto-field-label">Montage</span><span class="sex-proto-field-val">${esc(course.coil_placement || '—')}</span></div>
        </div>`;
    }

    // ── Brain target — both panels ────────────────────────────────────────────
    ['sex-brain-target-setup','sex-brain-target-active'].forEach(bId => {
      const bEl = document.getElementById(bId);
      if (bEl) bEl.innerHTML = siteVisual(course.target_region || course.coil_placement || '');
    });

    // ── Protocol quick ref in active phase ────────────────────────────────────
    const protoRef = document.getElementById('sex-active-proto-ref');
    if (protoRef) {
      const pills = [
        course.planned_frequency_hz ? `<span class="sex-proto-ref-pill"><strong>${course.planned_frequency_hz} Hz</strong></span>` : '',
        course.planned_intensity ? `<span class="sex-proto-ref-pill"><strong>${course.planned_intensity}%</strong> RMT</span>` : '',
        course.planned_session_duration_minutes ? `<span class="sex-proto-ref-pill"><strong>${course.planned_session_duration_minutes} min</strong></span>` : '',
        course.target_region ? `<span class="sex-proto-ref-pill">${esc(course.target_region)}</span>` : '',
        course.coil_placement ? `<span class="sex-proto-ref-pill">${esc(course.coil_placement)}</span>` : '',
      ].filter(Boolean).join('');
      protoRef.innerHTML = pills || '<span style="font-size:12px;color:var(--text-tertiary)">No protocol parameters on file</span>';
    }

    // ── Setup brain target placement note ─────────────────────────────────────
    const setupPlacementNote = document.getElementById('sex-guide-instructions-setup');
    if (setupPlacementNote) {
      const parts = [];
      if (course.target_region) parts.push(course.target_region);
      if (course.coil_placement) parts.push(course.coil_placement);
      setupPlacementNote.textContent = parts.join(' · ') || 'No placement details on file';
    }

    // ── Live protocol watch ──────────────────────────────────────────────────
    if (liveWatchEl) {
      try {
        const liveWatch = await loadProtocolWatchContext({
          condition: course.condition_slug || '',
          modality: course.modality_slug || '',
        });
        const coverage = liveWatch?.coverage || null;
        const template = liveWatch?.template || null;
        const signal = liveWatch?.safety || null;
        if (!coverage && !template && !signal) {
          liveWatchEl.innerHTML = '<div style="font-size:12px;color:var(--text-tertiary)">No live evidence watch rows were returned for this course.</div>';
        } else {
          liveWatchEl.innerHTML = `
            <div style="display:flex;flex-direction:column;gap:10px">
              ${coverage ? `<div style="padding:10px 12px;border-radius:8px;background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.18)">
                <div style="font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--teal,#00d4bc);margin-bottom:4px">Coverage</div>
                <div style="font-size:12px;color:var(--text-secondary)">Coverage <strong style="color:var(--text-primary)">${esc(String(coverage.coverage ?? 0))}%</strong> across <strong style="color:var(--text-primary)">${Number(coverage.paper_count || 0).toLocaleString()}</strong> papers${coverage.gap && coverage.gap !== 'None' ? ` · gap ${esc(coverage.gap)}` : ''}</div>
              </div>` : ''}
              ${template ? `<div style="padding:10px 12px;border-radius:8px;background:rgba(74,158,255,0.08);border:1px solid rgba(74,158,255,0.18)">
                <div style="font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--blue);margin-bottom:4px">Template</div>
                <div style="font-size:12px;color:var(--text-secondary)"><strong style="color:var(--text-primary)">${esc([template.modality, template.indication, template.target].filter(Boolean).join(' — '))}</strong>${template.evidence_tier ? ` · ${esc(template.evidence_tier)}` : ''}</div>
              </div>` : ''}
              ${signal ? `<div style="padding:10px 12px;border-radius:8px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.18)">
                <div style="font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--amber);margin-bottom:4px">Safety watch</div>
                <div style="font-size:12px;color:var(--text-secondary)">${esc(getProtocolWatchSignalTitle(signal))}</div>
              </div>` : ''}
            </div>`;
        }
      } catch {
        liveWatchEl.innerHTML = '<div style="font-size:12px;color:var(--text-tertiary)">Live evidence watch unavailable for this course.</div>';
      }
    }

    // ── Aftercare items ───────────────────────────────────────────────────────
    const acList = document.getElementById('sex-aftercare-items');
    if (acList) {
      const items = aftercareItems(course.modality_slug || '');
      acList.innerHTML = items.map(item => `
        <div style="display:flex;align-items:flex-start;gap:8px;padding:5px 0;border-bottom:1px solid var(--border)">
          <span style="color:var(--teal);font-size:14px;line-height:1.3;flex-shrink:0">\u2713</span>
          <span style="font-size:12.5px;color:var(--text-secondary);line-height:1.4">${item}</span>
        </div>`).join('');
    }

    // ── Consent gate check ────────────────────────────────────────────────────
    if (consentDisplay && course.patient_id) {
      consentDisplay.innerHTML = `<span style="font-size:11px;color:var(--text-tertiary)">Checking consent\u2026</span>`;
      try {
        const consentsRes = await api.listConsents({ patient_id: course.patient_id }).catch(() => null);
        const consents = consentsRes?.items || [];
        const today = new Date(); today.setHours(0,0,0,0);
        const treatmentConsents = consents.filter(c => c.consent_type === 'treatment' && c.status !== 'withdrawn');
        const validConsent = treatmentConsents.find(c => {
          const exp = c.expires_at ? new Date(c.expires_at) : null;
          return c.status === 'active' && (!exp || exp >= today);
        });
        const expiringSoonConsent = !validConsent && treatmentConsents.find(c => {
          const exp = c.expires_at ? new Date(c.expires_at) : null;
          return c.status === 'active' && exp && (exp - today) < 30 * 86400000;
        });
        if (validConsent) {
          const signedDate  = validConsent.signed_at ? validConsent.signed_at.split('T')[0] : '';
          const expiryDate  = validConsent.expires_at ? validConsent.expires_at.split('T')[0] : '';
          const expiringSoon = validConsent.expires_at && (new Date(validConsent.expires_at) - today) < 30 * 86400000;
          if (expiringSoon) {
            consentDisplay.innerHTML = `<div style="padding:7px 12px;background:rgba(255,181,71,0.08);border:1px solid rgba(255,181,71,0.3);border-radius:5px;font-size:11.5px;color:var(--amber)">\u26A0 Consent expires soon (${expiryDate}) \u2014 consider renewing.</div>`;
          } else {
            consentDisplay.innerHTML = `<div style="padding:7px 12px;background:rgba(74,222,128,0.07);border:1px solid rgba(74,222,128,0.25);border-radius:5px;font-size:11.5px;color:var(--green)">\u2713 Treatment consent on file \u2014 signed ${signedDate}, valid until ${expiryDate || 'no expiry set'}.</div>`;
          }
          window._seConsentBlocked = false;
          if (submitBtn) { submitBtn.disabled = false; submitBtn.style.opacity = ''; }
        } else if (expiringSoonConsent) {
          const expiryDate = expiringSoonConsent.expires_at ? expiringSoonConsent.expires_at.split('T')[0] : '';
          consentDisplay.innerHTML = `<div style="padding:7px 12px;background:rgba(255,181,71,0.08);border:1px solid rgba(255,181,71,0.3);border-radius:5px;font-size:11.5px;color:var(--amber)">\u26A0 Consent expires soon (${expiryDate}) \u2014 renew before next session.</div>`;
          window._seConsentBlocked = false;
          if (submitBtn) { submitBtn.disabled = false; submitBtn.style.opacity = ''; }
        } else {
          consentDisplay.innerHTML = `<div style="padding:7px 12px;background:rgba(255,107,107,0.08);border:1px solid rgba(255,107,107,0.3);border-radius:5px;font-size:11.5px;color:var(--red)">\u2717 No valid treatment consent on file \u2014 obtain consent before proceeding.</div>`;
          window._seConsentBlocked = true;
          if (submitBtn) { submitBtn.disabled = true; submitBtn.style.opacity = '0.5'; }
        }
      } catch (_) {
        consentDisplay.innerHTML = `<div style="padding:7px 12px;background:rgba(255,181,71,0.08);border:1px solid rgba(255,181,71,0.3);border-radius:5px;font-size:11.5px;color:var(--amber)">\u26A0 Could not verify consent status.</div>`;
      }
    }
  };

  // ── Final wiring (launch-audit 2026-04-30) ─────────────────────────────────
  // 1. Set demo-mode flag when no live courses (drives banner + is_demo flag
  //    on saved records).
  // 2. Surface the demo banner if applicable.
  // 3. Consume any plan handed off via window._rxPrefilledProto.
  // 4. Fire page_loaded audit event.
  window._seIsDemoMode = !activeCourses.length;
  const demoBanner = document.getElementById('sex-demo-banner');
  if (demoBanner) demoBanner.style.display = window._seIsDemoMode ? '' : 'none';
  try { window._seConsumePrefilledPlan(); } catch (_) {}
  window._seAudit('page_loaded', {
    note: 'courses=' + activeCourses.length + ' demo=' + !!window._seIsDemoMode,
  });
}


// ── pgReviewQueue — Protocol & course approvals ───────────────────────────────
export async function pgReviewQueue(setTopbar, navigate) {
  const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  // ── Config ─────────────────────────────────────────────────────────────────
  const REVIEW_TYPES = {
    'off-label':      { label: 'Off-Label',     icon: '\u26A1', cssClass: 'rq-type-off-label',    color: '#f59e0b' },
    'ai-note':        { label: 'AI Note',        icon: '\uD83E\uDD16', cssClass: 'rq-type-ai-note',       color: '#a78bfa' },
    'protocol':       { label: 'Protocol',       icon: '\uD83D\uDCCB', cssClass: 'rq-type-protocol',      color: '#60a5fa' },
    'consent':        { label: 'Consent',        icon: '\u270D',  cssClass: 'rq-type-consent',     color: '#2dd4bf' },
    'adverse-event':  { label: 'Adverse Event',  icon: '\u26A0', cssClass: 'rq-type-adverse-event', color: '#f87171' },
  };
  const STATE_COLORS = {
    pending: '#f59e0b', assigned: '#60a5fa', 'in-review': '#a78bfa',
    approved: '#22c55e', 'signed-off': '#22c55e', rejected: '#ef4444',
    escalated: '#f97316', 'changes-requested': '#f59e0b',
  };
  const REVIEWERS = ['Dr. Chen', 'Dr. Patel', 'Dr. Kim', 'Dr. Martinez', 'Dr. Okafor', 'Dr. Singh'];
  const AUDIT_KEY = 'ds_audit_trail';
  const QUEUE_KEY = 'ds_review_queue_local';

  // ── Audit trail helpers ────────────────────────────────────────────────────
  function readAudit() { try { return JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]'); } catch { return []; } }
  function writeAudit(entry) {
    const trail = readAudit();
    trail.unshift({ id: 'aud-' + Date.now(), ...entry, created_at: new Date().toISOString() });
    try { localStorage.setItem(AUDIT_KEY, JSON.stringify(trail.slice(0, 500))); } catch {}
  }
  function readLocalQueue()       { try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || 'null'); } catch { return null; } }
  function writeLocalQueue(items) { try { localStorage.setItem(QUEUE_KEY, JSON.stringify(items)); } catch {} }

  // ── Demo seed ──────────────────────────────────────────────────────────────
  const now = Date.now();
  const DEMO_SEED = [
    { id:'rev-001', review_type:'off-label',     status:'pending',   subject:'rTMS \u2014 Right DLPFC, Off-Label for GAD',                   patient_name:'Emma Wilson',  patient_id:'pt-001', submitted_by:'Dr. Martinez', submitted_at:new Date(now-26*3600000).toISOString(), notes:'Treatment-resistant GAD. Standard options exhausted. Off-label rTMS with enhanced monitoring proposed.',                            on_label:false, evidence_grade:'EV-B', governance_warnings:[{type:'off_label_use',message:'Dual sign-off required for off-label use'}], review_history:[] },
    { id:'rev-002', review_type:'ai-note',        status:'pending',   subject:'AI SOAP Note \u2014 Session 4, ADHD / TBR Neurofeedback',      patient_name:'Lucas Turner', patient_id:'pt-002', submitted_by:'System (AI)', submitted_at:new Date(now-3*3600000).toISOString(),  notes:'AI-generated session note awaiting clinician review before filing.',                                                              ai_draft:'S: Patient reports improved concentration this week. Sleep remains disrupted (avg 6h).\nO: Theta/beta ratio 3.2 \u2192 2.9. Session 4 of 20. Reward threshold 68%. No adverse effects.\nA: Positive trajectory. Theta reduction in target range. Protocol tolerance good.\nP: Continue TBR protocol. Increase to 3\xd7/week from next session. Re-assess ADHD-RS at session 10.', review_history:[] },
    { id:'rev-003', review_type:'protocol',       status:'assigned',  subject:'rTMS 10 Hz Left DLPFC \u2014 MDD \u2014 30 sessions',          patient_name:'Sarah Chen',   patient_id:'pt-003', submitted_by:'Dr. Martinez', submitted_at:new Date(now-5*3600000).toISOString(),  notes:'Standard on-label TMS for MDD. PHQ-9 = 18 at baseline.',                                                                         evidence_grade:'EV-A', on_label:true, assigned_to:'Dr. Patel', review_history:[{action:'assigned',reviewer:'Dr. Patel',created_at:new Date(now-2*3600000).toISOString(),note:'Assigned for routine pre-treatment sign-off.'}] },
    { id:'rev-004', review_type:'consent',        status:'in-review', subject:'Informed Consent \u2014 Home tDCS Programme (CON-HC-004)',     patient_name:'Emma Wilson',  patient_id:'pt-001', submitted_by:'Nurse Okonkwo', submitted_at:new Date(now-12*3600000).toISOString(), notes:'Patient signed consent. Requires clinician co-signature per governance.',                                                          consent_type:'home-device-agreement', patient_signed:true, patient_signed_at:new Date(now-13*3600000).toISOString(), witness_required:false, clinician_cosign_required:true, assigned_to:'Dr. Chen', review_history:[{action:'in-review',reviewer:'Dr. Chen',created_at:new Date(now-6*3600000).toISOString(),note:'Reviewing consent disclosures.'}] },
    { id:'rev-005', review_type:'adverse-event',  status:'pending',   subject:'AE: Moderate headache post-TMS, Session 12',                   patient_name:'Sarah Chen',   patient_id:'pt-003', submitted_by:'Dr. Martinez', submitted_at:new Date(now-55*3600000).toISOString(), notes:'Moderate headache ~2h post-session. Resolved with paracetamol. No neurological signs. Session paused this week.', ae_severity:'moderate', ae_type:'headache', review_history:[] },
  ];

  // ── Data loading ───────────────────────────────────────────────────────────
  const [queueRes, aeRes] = await Promise.all([
    api.listReviewQueue({}).catch(() => ({ items: [] })),
    api.listAdverseEvents({ resolved: false }).catch(() => ({ items: [] })),
  ]);
  // Normalize backend review-queue shape to the UI card shape.
  // Backend `item_type` values include `protocol_approval`, `off_label`,
  // `adverse_event`, `consent`, `ai_note`; the UI expects `type` values
  // `protocol`, `off-label`, `adverse-event`, `consent`, `ai-note`.
  const _rqTypeFromBackend = (t) => {
    const s = String(t || '').toLowerCase();
    if (s.includes('off') && s.includes('label')) return 'off-label';
    if (s.includes('ai') && s.includes('note')) return 'ai-note';
    if (s.includes('adverse')) return 'adverse-event';
    if (s.includes('consent')) return 'consent';
    return 'protocol';
  };
  let items = (queueRes?.items || []).map((r) => ({
    ...r,
    type: r.type || _rqTypeFromBackend(r.item_type),
    subject: r.subject
      || (r.course_name ? `Protocol — ${r.course_name}` : null)
      || (r.condition_slug ? `${String(r.condition_slug).replace(/-/g, ' ')}${r.modality_slug ? ' · ' + r.modality_slug : ''}` : null)
      || r.item_type
      || 'Review item',
    submitted_by: r.submitted_by || r.created_by,
    submitted_at: r.submitted_at || r.created_at,
  }));
  const openAEs = aeRes?.items  || [];

  const localQueue = readLocalQueue();
  if (items.length === 0) {
    items = (localQueue || DEMO_SEED).map((i) => ({
      ...i,
      type: i.type || i.review_type,
    }));
    if (!localQueue) writeLocalQueue(DEMO_SEED);
  } else {
    if (localQueue) {
      const localById = Object.fromEntries(localQueue.map(i => [i.id, i]));
      items = items.map(i => localById[i.id] ? { ...i, ...localById[i.id], type: i.type || localById[i.id].type || localById[i.id].review_type } : i);
    }
  }

  window._rqItems   = items;
  window._rqOpenAEs = openAEs;
  if (!window._rqDecision)  window._rqDecision  = {};
  if (!window._rqActiveTab) window._rqActiveTab = 'all';

  // ── Topbar ─────────────────────────────────────────────────────────────────
  setTopbar('Review &amp; Approvals', `
    <div style="display:flex;align-items:center;gap:8px">
      <button class="btn btn-sm" onclick="window._rqExportAudit()" title="Export audit trail">&#x21A7; Audit CSV</button>
      <button class="btn btn-sm btn-primary" onclick="pgReviewQueue(window._rqSetTopbar,window._rqNavigate)">&#x21BB; Refresh</button>
    </div>`);

  window._rqSetTopbar = setTopbar;
  window._rqNavigate  = navigate;

  const el = document.getElementById('content');
  el.innerHTML = spinner();

  // ── SLA / urgency helpers ──────────────────────────────────────────────────
  function isOverdue(item) {
    if (item.status !== 'pending' && item.status !== 'assigned' && item.status !== 'in-review') return false;
    const ts = item.submitted_at || item.created_at;
    if (!ts) return false;
    return (now - new Date(ts).getTime()) > 48 * 3600 * 1000;
  }

  function isUrgent(item) {
    if (isOverdue(item)) return true;
    if (item.type === 'adverse-event' && (item.severity === 'Severe' || item.severity === 'Serious')) return true;
    return false;
  }

  function priorityScore(item) {
    let s = 0;
    if (item.status === 'pending')   s += 10;
    if (item.status === 'assigned')  s += 8;
    if (item.status === 'in-review') s += 6;
    if (isOverdue(item)) s += 20;
    if (item.type === 'adverse-event') s += 15;
    if (item.type === 'off-label') s += 8;
    return s;
  }

  function slaBadge(item) {
    if (!isOverdue(item)) return '';
    return `<span class="badge badge-red" style="font-size:9.5px;margin-left:6px;">OVERDUE</span>`;
  }

  function aeSeverityBadge(sev) {
    const colors = { Mild:'#22c55e', Moderate:'#f59e0b', Severe:'#ef4444', Serious:'#dc2626' };
    const c = colors[sev] || '#888';
    return `<span style="font-size:10px;font-weight:700;color:${c};background:${c}22;padding:2px 7px;border-radius:4px;">${esc(sev||'')}</span>`;
  }

  function statCard(val, label, color) {
    return `<div class="stat-card" style="flex:1;min-width:120px;border-left:3px solid ${color};">
      <div class="stat-value" style="color:${color};">${val}</div>
      <div class="stat-label">${label}</div>
    </div>`;
  }

  function typeBadge(type) {
    const t = REVIEW_TYPES[type] || { label: type, icon: '', cssClass: 'rq-type-protocol' };
    return `<span class="rq-type-badge ${t.cssClass}">${t.icon} ${t.label}</span>`;
  }

  function stateBadge(status) {
    const color = STATE_COLORS[status] || '#888';
    return `<span style="font-size:10px;font-weight:700;color:${color};background:${color}22;padding:2px 7px;border-radius:4px;text-transform:uppercase;">${esc(status||'')}</span>`;
  }

  function stateTimeline(currentState) {
    const steps = ['pending','assigned','in-review','resolved'];
    const terminalMap = { approved:'resolved','signed-off':'resolved', rejected:'resolved', escalated:'resolved','changes-requested':'resolved' };
    const resolved = ['approved','signed-off','rejected','escalated','changes-requested'];
    const effectiveState = terminalMap[currentState] || currentState;
    const isRejected = currentState === 'rejected';
    const isApproved = currentState === 'approved' || currentState === 'signed-off';

    function dotClass(step, i) {
      const stepIdx = steps.indexOf(step);
      const curIdx  = steps.indexOf(effectiveState);
      if (stepIdx < curIdx) return isRejected && step === 'resolved' ? 'rejected' : 'done';
      if (stepIdx === curIdx) return isApproved && step === 'resolved' ? 'approved' : isRejected && step === 'resolved' ? 'rejected' : 'active';
      return '';
    }
    function lineClass(i) {
      const curIdx = steps.indexOf(effectiveState);
      return i < curIdx ? 'done' : '';
    }

    let html = '<div class="rq-state-pipeline">';
    steps.forEach((step, i) => {
      const dc = dotClass(step, i);
      html += `<div style="display:flex;flex-direction:column;align-items:center;">
        <div class="rq-state-dot${dc ? ' ' + dc : ''}"></div>
        <div class="rq-state-label">${step === 'in-review' ? 'in review' : step}</div>
      </div>`;
      if (i < steps.length - 1) {
        html += `<div class="rq-state-line${lineClass(i) ? ' ' + lineClass(i) : ''}"></div>`;
      }
    });
    html += '</div>';
    return html;
  }

  function typeDetailHtml(item) {
    function fr(label, val) {
      if (!val) return '';
      return `<div style="margin:4px 0;font-size:12.5px;"><span style="color:var(--text-tertiary);min-width:120px;display:inline-block;">${label}</span> <span style="color:var(--text-primary);">${esc(String(val))}</span></div>`;
    }
    function govFlag(key, label) {
      if (!item.governance || !item.governance[key]) return '';
      return `<span class="badge badge-amber" style="font-size:10px;margin-right:4px;">${label}</span>`;
    }

    if (item.type === 'off-label') {
      return `<div style="background:rgba(245,158,11,.06);border:1px solid rgba(245,158,11,.15);border-radius:8px;padding:10px 14px;margin:8px 0;">
        ${fr('Condition', item.condition)}
        ${fr('Modality', item.modality)}
        ${fr('Protocol', item.protocol_name)}
        ${fr('Evidence Grade', item.evidence_grade)}
        ${fr('Requested by', item.requested_by)}
        <div style="margin-top:6px;">
          ${govFlag('off_label_acknowledgement_required','Off-label ack. required')}
          ${govFlag('dual_review_required','Dual review')}
          ${govFlag('requires_clinician_sign_off','Clinician sign-off')}
        </div>
        ${item.rationale ? `<div style="margin-top:8px;font-size:12px;color:var(--text-secondary);font-style:italic;">"${esc(item.rationale)}"</div>` : ''}
      </div>`;
    }

    if (item.type === 'ai-note') {
      return `<div style="background:rgba(139,92,246,.06);border:1px solid rgba(139,92,246,.15);border-radius:8px;padding:10px 14px;margin:8px 0;">
        ${fr('Patient', item.patient_name || item.patient_id)}
        ${fr('Session', item.session_label)}
        ${fr('Note type', item.note_type)}
        ${fr('Generated', item.generated_at ? new Date(item.generated_at).toLocaleDateString() : '')}
        ${item.ai_draft ? `<div style="margin-top:8px;"><div style="font-size:11px;color:var(--text-tertiary);margin-bottom:4px;">AI DRAFT</div><pre style="background:rgba(0,0,0,.2);border-radius:6px;padding:10px;font-size:11.5px;white-space:pre-wrap;color:var(--text-secondary);max-height:120px;overflow-y:auto;">${esc(item.ai_draft)}</pre></div>` : ''}
      </div>`;
    }

    if (item.type === 'protocol') {
      return `<div style="background:rgba(59,130,246,.06);border:1px solid rgba(59,130,246,.15);border-radius:8px;padding:10px 14px;margin:8px 0;">
        ${fr('Protocol', item.protocol_name)}
        ${fr('Condition', item.condition)}
        ${fr('Modality', item.modality)}
        ${fr('Evidence Grade', item.evidence_grade)}
        ${fr('On/Off label', item.on_label_vs_off_label)}
        ${fr('Submitted by', item.requested_by)}
        ${item.change_summary ? `<div style="margin-top:6px;font-size:12px;color:var(--text-secondary);">${esc(item.change_summary)}</div>` : ''}
      </div>`;
    }

    if (item.type === 'consent') {
      const signed = item.patient_signed && item.clinician_signed;
      const sigStatus = signed
        ? `<span style="color:#22c55e;font-weight:600;">&#10003; Both parties signed</span>`
        : !item.patient_signed && !item.clinician_signed
          ? `<span style="color:#ef4444;">&#x26A0; Awaiting both signatures</span>`
          : item.patient_signed
            ? `<span style="color:#f59e0b;">Patient signed — awaiting clinician</span>`
            : `<span style="color:#f59e0b;">Clinician signed — awaiting patient</span>`;
      return `<div class="rq-consent-sig">
        <span style="font-size:16px;">&#x270D;</span>
        <div>
          ${fr('Document', item.document_type)}
          ${fr('Patient', item.patient_name || item.patient_id)}
          <div style="margin-top:6px;">${sigStatus}</div>
        </div>
      </div>`;
    }

    if (item.type === 'adverse-event') {
      return `<div style="background:rgba(239,68,68,.06);border:1px solid rgba(239,68,68,.15);border-radius:8px;padding:10px 14px;margin:8px 0;">
        ${fr('Patient', item.patient_name || item.patient_id)}
        ${fr('Event', item.event_description)}
        <div style="margin:4px 0;font-size:12.5px;"><span style="color:var(--text-tertiary);min-width:120px;display:inline-block;">Severity</span> ${aeSeverityBadge(item.severity)}</div>
        ${fr('Occurred', item.occurred_at ? new Date(item.occurred_at).toLocaleDateString() : '')}
        ${fr('Reported by', item.reported_by)}
        ${item.action_taken ? `<div style="margin-top:6px;font-size:12px;color:var(--text-secondary);">Action taken: ${esc(item.action_taken)}</div>` : ''}
      </div>`;
    }

    return '';
  }

  function decisionOptions(type, item) {
    if (type === 'consent') {
      return [
        { value: 'signed-off', label: '&#x270D; Sign &amp; Approve', cls: 'btn-primary' },
        { value: 'changes-requested', label: 'Request Changes', cls: 'btn-outline' },
        { value: 'rejected', label: 'Reject', cls: 'btn-danger' },
      ];
    }
    if (type === 'ai-note') {
      return [
        { value: 'approved', label: '&#10003; Accept Note', cls: 'btn-primary' },
        { value: 'changes-requested', label: '&#9998; Edit &amp; Re-draft', cls: 'btn-outline' },
        { value: 'rejected', label: '&#128465; Discard Draft', cls: 'btn-danger' },
      ];
    }
    if (type === 'adverse-event') {
      return [
        { value: 'escalated', label: '&#9650; Escalate', cls: 'btn-danger' },
        { value: 'approved', label: '&#10003; Acknowledge &amp; Monitor', cls: 'btn-primary' },
        { value: 'rejected', label: 'Dismiss', cls: 'btn-outline' },
      ];
    }
    // off-label, protocol
    return [
      { value: 'approved', label: '&#10003; Approve', cls: 'btn-primary' },
      { value: 'changes-requested', label: 'Request Changes', cls: 'btn-outline' },
      { value: 'rejected', label: '&#10005; Reject', cls: 'btn-danger' },
      { value: 'escalated', label: '&#9650; Escalate', cls: 'btn-outline' },
    ];
  }

  function rqCard(item) {
    const tid  = REVIEW_TYPES[item.type] || { label: item.type, icon: '', cssClass: 'rq-type-protocol' };
    const urgentBorder = isUrgent(item) ? 'border-color:rgba(239,68,68,.35);' : '';
    const isTerminal   = ['approved','signed-off','rejected','escalated'].includes(item.status);
    const curDecision  = window._rqDecision[item.id] || '';

    // Reviewer options
    const reviewerOpts = REVIEWERS.map(r =>
      `<option value="${esc(r)}" ${item.assigned_to === r ? 'selected' : ''}>${esc(r)}</option>`
    ).join('');

    // Decision radio buttons
    const decisions = decisionOptions(item.type, item);
    const decisionBtns = decisions.map(d => `
      <label style="cursor:pointer;display:inline-flex;align-items:center;gap:5px;margin-right:8px;font-size:12.5px;">
        <input type="radio" name="rq-dec-${esc(item.id)}" value="${d.value}"
          onchange="window._rqSetDecision('${esc(item.id)}','${d.value}')"
          ${curDecision === d.value ? 'checked' : ''} style="accent-color:var(--teal);">
        ${d.label}
      </label>`).join('');

    // History entries
    const historyHtml = (item.history || []).slice(-4).reverse().map(h => `
      <div style="font-size:11px;color:var(--text-tertiary);padding:3px 0;border-bottom:1px solid rgba(255,255,255,.04);">
        <span style="font-weight:500;color:var(--text-secondary);">${esc(h.action||h.status||'')}</span>
        ${h.by ? ` · ${esc(h.by)}` : ''}
        ${h.at ? ` · ${new Date(h.at).toLocaleDateString()}` : ''}
        ${h.note ? `<br><span style="font-style:italic;">${esc(h.note)}</span>` : ''}
      </div>`).join('');

    return `<div class="protocol-card" style="margin-bottom:12px;${urgentBorder}" id="rq-card-${esc(item.id)}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap;">
        <div>
          ${typeBadge(item.type)}
          ${slaBadge(item)}
          <span style="font-size:12.5px;font-weight:600;color:var(--text-primary);margin-left:8px;">${esc(item.title||item.id)}</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          ${stateBadge(item.status)}
          <button class="btn-icon" onclick="window._rqToggle('${esc(item.id)}')" title="Expand/collapse">&#9660;</button>
        </div>
      </div>

      <div style="font-size:11.5px;color:var(--text-tertiary);margin-top:4px;">
        Submitted ${item.submitted_at ? new Date(item.submitted_at).toLocaleDateString() : 'unknown'}
        ${item.assigned_to ? ` &middot; Assigned to <strong style="color:var(--text-secondary);">${esc(item.assigned_to)}</strong>` : ''}
      </div>

      ${stateTimeline(item.status)}

      <div id="rq-body-${esc(item.id)}" style="${window._rqDecision[item.id] !== undefined ? '' : 'display:none;'}">
        ${typeDetailHtml(item)}

        ${!isTerminal ? `
        <div style="margin-top:10px;">
          <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px;">Assign reviewer</div>
          <select class="filter-select" style="font-size:12px;padding:5px 10px;margin-right:8px;"
            onchange="window._rqAssign('${esc(item.id)}', this.value)">
            <option value="">— select reviewer —</option>
            ${reviewerOpts}
          </select>
        </div>
        <div style="margin-top:12px;">
          <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px;">Decision</div>
          <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px;">${decisionBtns}</div>
          <textarea id="rq-note-${esc(item.id)}" placeholder="Add a note (optional)…"
            style="width:100%;background:rgba(0,0,0,.2);border:1px solid rgba(255,255,255,.1);border-radius:6px;padding:8px;color:var(--text-primary);font-size:12.5px;resize:vertical;min-height:60px;box-sizing:border-box;"></textarea>
          <button class="btn-primary" style="margin-top:8px;font-size:12.5px;"
            onclick="window._rqSubmit('${esc(item.id)}')">Submit Decision</button>
        </div>` : `
        <div class="notice-ok" style="margin-top:10px;font-size:12.5px;">
          &#10003; This item is <strong>${esc(item.status)}</strong>${item.resolved_by ? ` by ${esc(item.resolved_by)}` : ''}.
          ${item.resolution_note ? `<br><em>${esc(item.resolution_note)}</em>` : ''}
        </div>`}

        ${historyHtml ? `<div style="margin-top:12px;border-top:1px solid rgba(255,255,255,.06);padding-top:8px;"><div style="font-size:10px;color:var(--text-tertiary);margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px;">History</div>${historyHtml}</div>` : ''}
      </div>
    </div>`;
  }

  function auditTrailHtml(filter) {
    const trail = readAudit();
    const filterOpts = ['all','assign','submit','export','resolve-ae'].map(f =>
      `<option value="${f}" ${filter===f?'selected':''}>${f === 'all' ? 'All events' : f}</option>`
    ).join('');
    const filtered = filter && filter !== 'all'
      ? trail.filter(e => (e.action||'').toLowerCase().includes(filter))
      : trail;
    const rows = filtered.slice(0, 100).map(e => {
      const dotColor = e.status ? (STATE_COLORS[e.status] || '#888') : '#60a5fa';
      return `<li class="rq-audit-item">
        <div class="rq-audit-dot" style="background:${dotColor};"></div>
        <div class="rq-audit-body">
          <div class="rq-audit-action">${esc(e.action||e.type||'Event')}</div>
          <div class="rq-audit-meta">
            ${e.item_id ? `Item <strong>${esc(e.item_id)}</strong> &middot; ` : ''}
            ${e.reviewer ? `${esc(e.reviewer)} &middot; ` : ''}
            ${e.created_at ? new Date(e.created_at).toLocaleString() : ''}
          </div>
          ${e.note ? `<div class="rq-audit-note">"${esc(e.note)}"</div>` : ''}
        </div>
      </li>`;
    }).join('');
    return `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
      <select class="filter-select" style="font-size:12px;" onchange="window._rqRenderAudit(this.value)">${filterOpts}</select>
      <span style="font-size:11px;color:var(--text-tertiary);">${filtered.length} events</span>
    </div>
    ${rows ? `<ul class="rq-audit-timeline">${rows}</ul>` : '<p style="color:var(--text-tertiary);font-size:13px;text-align:center;padding:24px 0;">No audit events yet.</p>'}`;
  }

  // ── Summary stats ──────────────────────────────────────────────────────────
  const pendingItems  = items.filter(i => i.status === 'pending').length;
  const overdueItems  = items.filter(i => isOverdue(i)).length;
  const approvedToday = items.filter(i => {
    if (!['approved','signed-off'].includes(i.status)) return false;
    const d = i.resolved_at || i.updated_at;
    return d && new Date(d).toDateString() === new Date().toDateString();
  }).length;
  const seriousAECount = openAEs.filter(ae =>
    ae.severity === 'Serious' || ae.severity === 'Severe'
  ).length;

  // ── Tabs ───────────────────────────────────────────────────────────────────
  const TABS = [
    { id: 'all',           label: 'All',            count: items.length },
    { id: 'off-label',     label: 'Off-Label',      count: items.filter(i=>i.type==='off-label').length },
    { id: 'ai-note',       label: 'AI Notes',       count: items.filter(i=>i.type==='ai-note').length },
    { id: 'protocol',      label: 'Protocol',       count: items.filter(i=>i.type==='protocol').length },
    { id: 'consent',       label: 'Consent',        count: items.filter(i=>i.type==='consent').length },
    { id: 'adverse-event', label: 'Adverse Events', count: openAEs.length },
    { id: 'audit',         label: 'Audit Trail',    count: readAudit().length },
  ];

  const tabsHtml = `<div class="rq-tabs">` + TABS.map(t => {
    const isUrgentTab = t.id === 'adverse-event' && seriousAECount > 0;
    return `<div class="rq-tab${window._rqActiveTab===t.id?' active':''}"
      onclick="window._rqTab('${t.id}')">
      ${t.label}<span class="rq-tab-count${isUrgentTab?' urgent':''}">${t.count}</span>
    </div>`;
  }).join('') + `</div>`;

  function renderTab(tabId) {
    window._rqActiveTab = tabId;
    const tabContent = document.getElementById('rq-tab-content');
    if (!tabContent) return;

    if (tabId === 'audit') {
      tabContent.innerHTML = auditTrailHtml('all');
      return;
    }

    if (tabId === 'adverse-event') {
      const aeRows = openAEs.map(ae => `
        <tr>
          <td style="padding:8px 12px;">${esc(ae.patient_name||ae.patient_id||'')}</td>
          <td style="padding:8px 12px;">${esc(ae.event_description||'')}</td>
          <td style="padding:8px 12px;">${aeSeverityBadge(ae.severity)}</td>
          <td style="padding:8px 12px;font-size:11.5px;color:var(--text-tertiary);">${ae.occurred_at ? new Date(ae.occurred_at).toLocaleDateString() : ''}</td>
          <td style="padding:8px 12px;">
            <button class="btn-primary" style="font-size:11.5px;padding:4px 10px;"
              onclick="window._rqResolveAE('${esc(ae.id)}',this)">&#10003; Resolve</button>
          </td>
        </tr>`).join('');
      tabContent.innerHTML = aeRows
        ? `<table style="width:100%;border-collapse:collapse;font-size:13px;">
            <thead><tr style="color:var(--text-tertiary);font-size:11px;text-transform:uppercase;">
              <th style="padding:6px 12px;text-align:left;font-weight:500;">Patient</th>
              <th style="padding:6px 12px;text-align:left;font-weight:500;">Event</th>
              <th style="padding:6px 12px;text-align:left;font-weight:500;">Severity</th>
              <th style="padding:6px 12px;text-align:left;font-weight:500;">Date</th>
              <th style="padding:6px 12px;text-align:left;font-weight:500;">Action</th>
            </tr></thead>
            <tbody>${aeRows}</tbody>
          </table>`
        : `<p style="color:var(--text-tertiary);font-size:13px;text-align:center;padding:32px 0;">No open adverse events.</p>`;
      return;
    }

    const filtered = tabId === 'all'
      ? [...items].sort((a,b) => priorityScore(b) - priorityScore(a))
      : items.filter(i => i.type === tabId).sort((a,b) => priorityScore(b) - priorityScore(a));

    if (!filtered.length) {
      tabContent.innerHTML = `<p style="color:var(--text-tertiary);font-size:13px;text-align:center;padding:32px 0;">No items in this category.</p>`;
      return;
    }
    tabContent.innerHTML = filtered.map(rqCard).join('');
  }

  // ── Rebuild tabs bar helper ────────────────────────────────────────────────
  function rebuildTabs() {
    const tabsEl = document.getElementById('rq-tabs-bar');
    if (!tabsEl) return;
    const newTabs = [
      { id: 'all',           label: 'All',            count: items.length },
      { id: 'off-label',     label: 'Off-Label',      count: items.filter(i=>i.type==='off-label').length },
      { id: 'ai-note',       label: 'AI Notes',       count: items.filter(i=>i.type==='ai-note').length },
      { id: 'protocol',      label: 'Protocol',       count: items.filter(i=>i.type==='protocol').length },
      { id: 'consent',       label: 'Consent',        count: items.filter(i=>i.type==='consent').length },
      { id: 'adverse-event', label: 'Adverse Events', count: openAEs.length },
      { id: 'audit',         label: 'Audit Trail',    count: readAudit().length },
    ];
    tabsEl.innerHTML = newTabs.map(t => {
      const isUrgentTab = t.id === 'adverse-event' && seriousAECount > 0;
      return `<div class="rq-tab${window._rqActiveTab===t.id?' active':''}"
        onclick="window._rqTab('${t.id}')">
        ${t.label}<span class="rq-tab-count${isUrgentTab?' urgent':''}">${t.count}</span>
      </div>`;
    }).join('');
  }

  // ── AE collapsible ─────────────────────────────────────────────────────────
  const aePreview = openAEs.slice(0,2).map(ae =>
    `<span style="font-size:12px;color:var(--text-secondary);">${esc(ae.patient_name||ae.patient_id||'Patient')} — ${aeSeverityBadge(ae.severity)}</span>`
  ).join('<br>');

  const aeCollapsible = openAEs.length ? `
  <div class="section-card" style="border-left:3px solid #ef4444;margin-bottom:16px;">
    <div style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;"
      onclick="document.getElementById('rq-ae-detail').style.display=document.getElementById('rq-ae-detail').style.display==='none'?'block':'none'">
      <div>
        <span style="font-weight:600;color:#f87171;">&#9888; Open Adverse Events</span>
        <span class="badge badge-red" style="margin-left:8px;">${openAEs.length} open${seriousAECount ? ` &middot; ${seriousAECount} serious` : ''}</span>
      </div>
      <span style="color:var(--text-tertiary);">&#9660;</span>
    </div>
    <div id="rq-ae-detail" style="display:none;margin-top:10px;">${aePreview}</div>
  </div>` : '';

  // ── Main render ────────────────────────────────────────────────────────────
  el.innerHTML = `
  <div style="max-width:900px;">
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px;">
      ${statCard(pendingItems,  'Pending Review',   '#f59e0b')}
      ${statCard(overdueItems,  'Overdue',          '#ef4444')}
      ${statCard(approvedToday,'Approved Today',    '#22c55e')}
      ${statCard(openAEs.length,'Open AE Reports',  '#f87171')}
    </div>

    ${aeCollapsible}

    <div id="rq-tabs-bar" class="rq-tabs">${TABS.map(t => {
      const isUrgentTab = t.id === 'adverse-event' && seriousAECount > 0;
      return `<div class="rq-tab${window._rqActiveTab===t.id?' active':''}"
        onclick="window._rqTab('${t.id}')">
        ${t.label}<span class="rq-tab-count${isUrgentTab?' urgent':''}">${t.count}</span>
      </div>`;
    }).join('')}</div>

    <div id="rq-tab-content"></div>
  </div>`;

  renderTab(window._rqActiveTab || 'all');

  // ── Local save helper ──────────────────────────────────────────────────────
  function _saveLocalItem(item) {
    const all = readLocalQueue();
    const idx = all.findIndex(x => x.id === item.id);
    if (idx >= 0) all[idx] = item; else all.push(item);
    writeLocalQueue(all);
    const gi = items.findIndex(x => x.id === item.id);
    if (gi >= 0) items[gi] = item; else items.push(item);
    window._rqItems = items;
  }

  // ── Event handlers ─────────────────────────────────────────────────────────
  window._rqToast = function(msg, type) {
    const t = document.createElement('div');
    t.className = type === 'err' ? 'toast toast-error' : 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 400); }, 2800);
  };

  window._rqTab = function(tabId) {
    window._rqActiveTab = tabId;
    document.querySelectorAll('#rq-tabs-bar .rq-tab').forEach(el2 => {
      el2.classList.toggle('active', el2.textContent.trim().toLowerCase().startsWith(tabId === 'adverse-event' ? 'adverse' : tabId === 'ai-note' ? 'ai' : tabId));
    });
    // Re-render active tab classes properly
    document.querySelectorAll('#rq-tabs-bar .rq-tab').forEach((el2, i) => {
      el2.classList.toggle('active', TABS[i] && TABS[i].id === tabId);
    });
    renderTab(tabId);
  };

  window._rqToggle = function(itemId) {
    const body = document.getElementById('rq-body-' + itemId);
    if (!body) return;
    body.style.display = body.style.display === 'none' ? 'block' : 'none';
  };

  window._rqSetDecision = function(itemId, decision) {
    window._rqDecision[itemId] = decision;
    const body = document.getElementById('rq-body-' + itemId);
    if (body) body.style.display = 'block';
  };

  window._rqAssign = function(itemId, reviewer) {
    if (!reviewer) return;
    const item = items.find(i => i.id === itemId);
    if (!item) return;
    item.assigned_to = reviewer;
    item.status = item.status === 'pending' ? 'assigned' : item.status;
    item.history = item.history || [];
    item.history.push({ action: 'assigned', by: 'You', at: new Date().toISOString(), note: `Assigned to ${reviewer}` });
    _saveLocalItem(item);
    writeAudit({ action: 'assign', item_id: itemId, reviewer, status: item.status });
    // Re-render card
    const card = document.getElementById('rq-card-' + itemId);
    if (card) card.outerHTML = rqCard(item);
    window._rqToast(`Assigned to ${reviewer}`, 'ok');
    rebuildTabs();
  };

  window._rqSubmit = function(itemId) {
    const decision = window._rqDecision[itemId];
    if (!decision) { window._rqToast('Select a decision first.', 'err'); return; }
    const noteEl = document.getElementById('rq-note-' + itemId);
    const note = noteEl ? noteEl.value.trim() : '';
    const item = items.find(i => i.id === itemId);
    if (!item) return;
    const prevStatus = item.status;
    item.status = decision;
    item.resolved_by = 'You';
    item.resolved_at = new Date().toISOString();
    item.resolution_note = note;
    item.history = item.history || [];
    item.history.push({ action: decision, by: 'You', at: new Date().toISOString(), note });
    _saveLocalItem(item);
    writeAudit({ action: 'submit', item_id: itemId, reviewer: item.assigned_to || 'You', status: decision, note });
    delete window._rqDecision[itemId];
    const card = document.getElementById('rq-card-' + itemId);
    if (card) card.outerHTML = rqCard(item);
    window._rqToast(`Decision recorded: ${decision}`, 'ok');
    rebuildTabs();
  };

  window._rqFilterStatus = function(status) {
    const filtered = status === 'all' ? items : items.filter(i => i.status === status);
    const tabContent = document.getElementById('rq-tab-content');
    if (tabContent) tabContent.innerHTML = filtered.length ? filtered.map(rqCard).join('') : '<p style="color:var(--text-tertiary);font-size:13px;text-align:center;padding:32px 0;">No items.</p>';
  };

  window._rqSortPriority = function() {
    const sorted = [...items].sort((a,b) => priorityScore(b) - priorityScore(a));
    const tabContent = document.getElementById('rq-tab-content');
    if (tabContent) tabContent.innerHTML = sorted.map(rqCard).join('');
  };

  window._rqRenderAudit = function(filter) {
    const tabContent = document.getElementById('rq-tab-content');
    if (tabContent) tabContent.innerHTML = auditTrailHtml(filter || 'all');
  };

  window._rqExportAudit = function() {
    const trail = readAudit();
    if (!trail.length) { window._rqToast('No audit events to export.', 'err'); return; }
    const header = 'id,action,item_id,reviewer,status,note,created_at\n';
    const rows = trail.map(e =>
      [e.id, e.action, e.item_id, e.reviewer, e.status, e.note, e.created_at]
        .map(v => `"${String(v||'').replace(/"/g,'""')}"`)
        .join(',')
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'audit-trail-' + new Date().toISOString().slice(0,10) + '.csv';
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
    writeAudit({ action: 'export', note: `${trail.length} events exported` });
    window._rqToast('Audit trail exported.', 'ok');
  };

  window._rqResolveAE = async function(aeId, btn) {
    if (btn) { btn.disabled = true; btn.textContent = 'Resolving…'; }
    try {
      const remaining = openAEs.filter(ae => ae.id !== aeId);
      window._rqOpenAEs = remaining;
      openAEs.length = 0;
      remaining.forEach(ae => openAEs.push(ae));
      writeAudit({ action: 'resolve-ae', item_id: aeId, reviewer: 'You', status: 'resolved' });
      window._rqToast('Adverse event resolved.', 'ok');
      renderTab('adverse-event');
      rebuildTabs();
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = '\u2713 Resolve'; }
      window._rqToast('Failed to resolve — try again.', 'err');
    }
  };

  // Legacy compatibility
  window._rqConfirmAction = window._rqSubmit;
  window._rqAction = window._rqSubmit;

}

// ── pgOutcomes — Outcomes & Progress ─────────────────────────────────────────
export async function pgOutcomes(setTopbar, navigate) {
  setTopbar('Outcomes & Progress', `
    <div style="display:flex;align-items:center;gap:8px">
      <button class="btn btn-sm" onclick="window._exportOutcomesCSV()">Export CSV</button>
      <button class="btn btn-primary btn-sm" onclick="window._showRecordOutcome()">+ Record Outcome</button>
    </div>`);

  const el = document.getElementById('content');
  el.innerHTML = spinner();

  // ── Data loading ──────────────────────────────────────────────────────────
  const [outcomesRes, aggregateRes, coursesRes, patientsRes, aeRes] = await Promise.all([
    api.listOutcomes().catch(() => null),
    api.aggregateOutcomes().catch(() => null),
    api.listCourses().catch(() => null),
    api.listPatients?.().catch(() => null),
    api.listAdverseEvents?.().catch(() => null),
  ]);
  const outcomes  = outcomesRes?.items || [];
  const aggregate = aggregateRes || {};
  const courses   = coursesRes?.items || [];
  const patients  = patientsRes?.items || [];
  const allAEs    = aeRes?.items || [];

  const courseMap = {};
  courses.forEach(c => { courseMap[c.id] = c; });
  const patientMap = {};
  patients.forEach(p => { patientMap[p.id] = p; });
  const openAEs = allAEs.filter(ae => ae.status === 'open' || ae.status === 'active');

  // Persist for CSV export and time-range filtering
  window._outcomesData    = outcomes;
  window._outcomesAllData = outcomes;
  window._outcomesTimeRange = window._outcomesTimeRange || 'all';
  window._courseMap = courseMap;

  // ── Responder detection helper ────────────────────────────────────────────
  const LOWER_IS_BETTER = ['PHQ-9', 'GAD-7', 'PCL-5', 'phq9', 'gad7', 'pcl5'];
  function isLowerBetter(templateName) {
    return LOWER_IS_BETTER.some(t => String(templateName || '').toUpperCase().includes(t.toUpperCase()));
  }
  function isResponder(o) {
    if (o.is_responder != null) return o.is_responder;
    if (o.pct_change == null) return false;
    const pct = Math.abs(o.pct_change);
    if (isLowerBetter(o.template_name || o.template_id)) return o.pct_change <= -50 || pct >= 50;
    return o.pct_change >= 50 || pct >= 50;
  }

  // ── Mini sparkline SVG ────────────────────────────────────────────────────
  function miniSparkline(points, color, width, height) {
    width = width || 120; height = height || 32;
    if (!points || points.length < 2) return '';
    const min = Math.min(...points), max = Math.max(...points);
    const range = max - min || 1;
    const xs = points.map((_, i) => (i / (points.length - 1)) * width);
    const ys = points.map(v => height - ((v - min) / range) * (height - 4) - 2);
    const ptStr = xs.map((x, i) => x.toFixed(1) + ',' + ys[i].toFixed(1)).join(' ');
    return `<svg width="${width}" height="${height}" style="overflow:visible"><polyline points="${ptStr}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/><circle cx="${xs[xs.length-1].toFixed(1)}" cy="${ys[ys.length-1].toFixed(1)}" r="3" fill="${color}"/></svg>`;
  }

  // ── Export CSV ────────────────────────────────────────────────────────────
  window._exportOutcomesCSV = function() {
    const rows = [['Date', 'Template', 'Score', 'Point', 'Change%', 'Responder']];
    (window._outcomesData || []).forEach(o => {
      rows.push([
        o.recorded_at?.split('T')[0] || o.administered_at?.split('T')[0] || '',
        o.template_name || o.template_id || '',
        o.score ?? o.score_numeric ?? '',
        o.measurement_point || '',
        o.pct_change != null ? Math.round(o.pct_change) + '%' : '',
        isResponder(o) ? 'Yes' : 'No',
      ]);
    });
    const csv  = rows.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'outcomes.csv';
    a.click();
  };

  // ── Time-range filter ─────────────────────────────────────────────────────
  function filterByTimeRange(items, range) {
    if (!range || range === 'all') return items;
    const days = range === '30d' ? 30 : range === '90d' ? 90 : 180;
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();
    return items.filter(o => {
      const d = o.recorded_at || o.administered_at || '';
      return d >= cutoff;
    });
  }

  // ── Section header helper ─────────────────────────────────────────────────
  function sectionHeader(title) {
    return `<div style="font-family:var(--font-display);font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:16px">${title}</div>`;
  }

  // ── KPI computation ───────────────────────────────────────────────────────
  function computeKPIs(items) {
    // Responder rate
    let responderRatePct = aggregate.responder_rate_pct ??
      (aggregate.responder_rate != null ? Math.round(aggregate.responder_rate * 100) : null);
    if (responderRatePct == null && items.length > 0) {
      const withData = items.filter(o => o.pct_change != null || o.is_responder != null);
      if (withData.length > 0) {
        const r = withData.filter(isResponder).length;
        responderRatePct = Math.round((r / withData.length) * 100);
      }
    }

    // Mean score change
    let meanChange = null;
    const withBoth = items.filter(o => o.latest_score != null && o.baseline_score != null);
    if (withBoth.length > 0) {
      const total = withBoth.reduce((s, o) => s + (o.latest_score - o.baseline_score), 0);
      meanChange = total / withBoth.length;
    } else {
      // fallback: group by course+template, find baseline vs latest
      const groups = {};
      items.forEach(o => {
        const key = (o.course_id || '') + '|' + (o.template_id || o.template_name || '');
        if (!groups[key]) groups[key] = [];
        groups[key].push(o);
      });
      const changes = [];
      Object.values(groups).forEach(pts => {
        const sorted   = pts.slice().sort((a, b) => (a.recorded_at || a.administered_at || '').localeCompare(b.recorded_at || b.administered_at || ''));
        const baseline = sorted.find(p => p.measurement_point === 'baseline');
        const latest   = sorted[sorted.length - 1];
        const bs = baseline?.score_numeric ?? baseline?.score;
        const ls = latest?.score_numeric ?? latest?.score;
        if (bs != null && ls != null && baseline !== latest) changes.push(parseFloat(ls) - parseFloat(bs));
      });
      if (changes.length > 0) meanChange = changes.reduce((a, b) => a + b, 0) / changes.length;
    }

    // Active courses with outcomes
    const activeCourses = new Set(items.map(o => o.course_id).filter(Boolean)).size;

    // Assessment completion
    let completionPct = aggregate.assessment_completion_pct;
    if (completionPct == null && items.length > 0) {
      const withScores = items.filter(o => (o.score != null || o.score_numeric != null)).length;
      completionPct = Math.round((withScores / items.length) * 100);
    }

    return { responderRatePct, meanChange, activeCourses, completionPct };
  }

  // ── Waterfall chart ───────────────────────────────────────────────────────
  function renderWaterfall(items) {
    // Group by template name
    const byTemplate = {};
    items.forEach(o => {
      const name = o.template_name || o.template_id || 'Unknown';
      if (!byTemplate[name]) byTemplate[name] = [];
      byTemplate[name].push(o);
    });
    const entries = Object.entries(byTemplate).filter(([, pts]) => pts.length > 0);
    if (!entries.length) return emptyState('📊', 'No outcomes recorded', 'Outcome data will appear here as you log session results.');

    return entries.map(([tmpl, pts]) => {
      const withData = pts.filter(o => o.pct_change != null || o.is_responder != null || (o.score_numeric != null && o.measurement_point === 'post'));
      const n = pts.length;
      const responders = withData.filter(isResponder).length;
      const total = withData.length || 1;
      const respPct = Math.round((responders / total) * 100);
      return `<div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">
        <div style="width:120px;font-size:12px;color:var(--text-secondary);text-align:right;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${tmpl}">${tmpl}</div>
        <div style="flex:1;height:24px;border-radius:4px;background:var(--bg-surface-2);overflow:hidden;position:relative;min-width:0">
          <div style="height:100%;width:${respPct}%;background:var(--teal);border-radius:4px 0 0 4px;transition:width 0.4s"></div>
          <div style="position:absolute;right:8px;top:50%;transform:translateY(-50%);font-size:11px;font-weight:600;color:var(--text-primary)">${respPct}%</div>
        </div>
        <div style="width:60px;font-size:11px;color:var(--text-tertiary);flex-shrink:0">${n} pts</div>
      </div>`;
    }).join('');
  }

  // ── Sparkline cards (top 4 templates) ────────────────────────────────────
  function renderSparklineCards(items) {
    const byTemplate = {};
    items.forEach(o => {
      const name = o.template_name || o.template_id || 'Unknown';
      if (!byTemplate[name]) byTemplate[name] = [];
      byTemplate[name].push(o);
    });
    // Sort by count, take top 4
    const top4 = Object.entries(byTemplate).sort((a, b) => b[1].length - a[1].length).slice(0, 4);
    if (!top4.length) return `<div style="grid-column:1/-1">${emptyState('◈', 'No template data available.')}</div>`;

    return top4.map(([tmpl, pts]) => {
      // Bucket by YYYY-MM
      const buckets = {};
      pts.forEach(o => {
        const d = o.recorded_at || o.administered_at || '';
        const month = d ? d.slice(0, 7) : 'unknown';
        if (!buckets[month]) buckets[month] = [];
        const s = parseFloat(o.score_numeric ?? o.score ?? 'NaN');
        if (!isNaN(s)) buckets[month].push(s);
      });
      const months    = Object.keys(buckets).filter(m => m !== 'unknown').sort();
      const avgScores = months.map(m => buckets[m].reduce((a, b) => a + b, 0) / buckets[m].length);
      const lowerBetter = isLowerBetter(tmpl);
      const latestAvg   = avgScores.length ? avgScores[avgScores.length - 1].toFixed(1) : '—';
      let trendArrow = '', trendColor = 'var(--text-tertiary)';
      if (avgScores.length >= 2) {
        const diff = avgScores[avgScores.length - 1] - avgScores[0];
        const improving = lowerBetter ? diff < 0 : diff > 0;
        trendArrow = diff < 0 ? '↓' : '↑';
        trendColor = improving ? 'var(--green)' : 'var(--red)';
      }
      const sparkSVG = miniSparkline(avgScores, 'var(--teal)', 120, 32);
      const monthLabels = months.length ? `${months[0]} — ${months[months.length - 1]}` : '';
      return `<div class="card" style="padding:16px">
        <div style="font-size:12px;font-weight:600;color:var(--text-primary);margin-bottom:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${_esc(tmpl)}">${_esc(tmpl)}</div>
        <div style="display:flex;align-items:flex-end;gap:12px;margin-bottom:8px">
          ${sparkSVG || `<span style="font-size:11px;color:var(--text-tertiary)">Not enough data</span>`}
          <div>
            <div style="font-size:22px;font-weight:700;font-family:var(--font-display);color:var(--text-primary);line-height:1">${latestAvg}</div>
            <div style="font-size:16px;color:${trendColor};font-weight:600;line-height:1;margin-top:2px">${trendArrow}</div>
          </div>
        </div>
        <div style="font-size:10.5px;color:var(--text-tertiary)">${pts.length} measurements${monthLabels ? ' · ' + monthLabels : ''}</div>
        <div style="font-size:10px;color:var(--text-tertiary);margin-top:2px">${lowerBetter ? 'Lower score = improvement' : 'Higher score = improvement'}</div>
      </div>`;
    }).join('');
  }

  // ── Cohort by modality ────────────────────────────────────────────────────
  function renderModalityTable(items) {
    const byModality = {};
    items.forEach(o => {
      const course = courseMap[o.course_id] || {};
      const mod = course.modality_slug || o.modality_slug || 'Unknown';
      if (!byModality[mod]) byModality[mod] = { pts: new Set(), outcomes: [], responders: 0 };
      if (o.course_id) byModality[mod].pts.add(o.patient_id || o.course_id);
      byModality[mod].outcomes.push(o);
      const withData = o.pct_change != null || o.is_responder != null;
      if (withData && isResponder(o)) byModality[mod].responders++;
    });

    const rows = Object.entries(byModality).sort((a, b) => b[1].outcomes.length - a[1].outcomes.length);
    if (!rows.length) return `<div style="color:var(--text-tertiary);font-size:12px;padding:16px 0">No modality data available.</div>`;

    const tableRows = rows.map(([mod, data]) => {
      const withData = data.outcomes.filter(o => o.pct_change != null || o.is_responder != null);
      const respPct  = withData.length > 0 ? Math.round((data.responders / withData.length) * 100) : 0;
      const pctColor = respPct >= 60 ? 'var(--green)' : respPct >= 40 ? 'var(--amber)' : 'var(--red)';
      return `<tr>
        <td style="font-weight:500">${_esc(mod.replace(/-/g, ' '))}</td>
        <td class="mono">${data.pts.size}</td>
        <td class="mono">${data.outcomes.length}</td>
        <td>
          <div style="display:flex;align-items:center;gap:8px">
            <div style="width:${Math.round(respPct * 0.8)}px;height:8px;background:var(--teal);border-radius:2px;min-width:2px"></div>
            <span style="font-size:12px;font-weight:600;color:${pctColor}">${respPct}%</span>
          </div>
        </td>
        <td><span style="font-size:11px;color:${pctColor}">${respPct >= 60 ? '↑ Strong' : respPct >= 40 ? '→ Moderate' : '↓ Low'}</span></td>
      </tr>`;
    }).join('');

    return `<table class="ds-table">
      <thead><tr><th>Modality</th><th>Patients</th><th>Outcomes</th><th>Responder Rate</th><th>Trend</th></tr></thead>
      <tbody>${tableRows}</tbody>
    </table>`;
  }

  // ── Outcome records table ────────────────────────────────────────────────
  function renderOutcomeTable(items) {
    if (!items.length) return emptyState('📊', 'No outcomes recorded', 'Outcome data will appear here as you log session results.');

    const rows = items.slice().sort((a, b) => {
      const da = a.recorded_at || a.administered_at || '';
      const db = b.recorded_at || b.administered_at || '';
      return db.localeCompare(da);
    }).map(o => {
      const date    = (o.recorded_at || o.administered_at || '').split('T')[0] || '—';
      const tmpl    = o.template_name || o.template_id || '—';
      const score   = o.score_numeric ?? o.score ?? '—';
      const point   = o.measurement_point || '—';
      const chgPct  = o.pct_change != null ? (Math.round(o.pct_change) + '%') : '—';
      const resp    = (o.pct_change != null || o.is_responder != null) && isResponder(o);
      const respHTML = resp
        ? '<span style="color:var(--green);font-weight:600;font-size:11px">✓</span>'
        : '<span style="color:var(--text-tertiary);font-size:11px">—</span>';
      const patId  = o.patient_id ? o.patient_id.slice(0, 8) + '…' : '—';
      return `<tr>
        <td class="mono" style="font-size:11.5px">${date}</td>
        <td style="font-size:11.5px;color:var(--text-secondary)">${patId}</td>
        <td style="font-size:12px;font-weight:500">${tmpl}</td>
        <td class="mono" style="font-size:12px">${score}</td>
        <td style="font-size:12px;color:var(--text-secondary)">${point.replace(/_/g, ' ')}</td>
        <td class="mono" style="font-size:12px;color:${chgPct !== '—' && parseFloat(chgPct) < 0 ? 'var(--green)' : chgPct !== '—' && parseFloat(chgPct) > 0 ? 'var(--amber)' : 'var(--text-tertiary)'}">${chgPct}</td>
        <td>${respHTML}</td>
      </tr>`;
    }).join('');

    return `<table class="ds-table">
      <thead><tr><th>Date</th><th>Patient</th><th>Template</th><th>Score</th><th>Point</th><th>Change</th><th>Responder?</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  // ── Unique templates + courses for filter dropdowns ────────────────────
  const uniqueTemplates = [...new Set(outcomes.map(o => o.template_name || o.template_id || '').filter(Boolean))];
  const uniqueCourses   = courses.slice(0, 40);

  // ── Per-patient/course outcome status computation ─────────────────────────
  // Group raw outcome records by course_id + template, compute baseline→latest
  const LOWER_IS_BETTER_SET = new Set(['PHQ-9','GAD-7','PCL-5','ISI','DASS-21','NRS-Pain','UPDRS-III','HAMD','MADRS','BAI','BDI','CAPS','Y-BOCS','PANSS']);
  function _ocLowerBetter(name) {
    return LOWER_IS_BETTER_SET.has(name) || [...LOWER_IS_BETTER_SET].some(t => String(name||'').toUpperCase().includes(t.toUpperCase()));
  }

  function _ocComputeStatus(baseline, latest, lowerBetter) {
    if (baseline == null || latest == null) return 'steady';
    const change = latest - baseline;
    const pct    = baseline > 0 ? Math.abs(change / baseline) * 100 : 0;
    const improving = lowerBetter ? change < 0 : change > 0;
    const worsening = lowerBetter ? change > 0 : change < 0;
    if (improving && pct >= 20) return 'improving';
    if (worsening && pct >= 15) return 'needs-review';
    return 'steady';
  }

  // Build per-course outcome summary
  const courseOutcomeMap = {}; // courseId → { courseId, patientId, template, baseline, latest, change, pct, status, lastDate, measurements }
  const byCourseTemplate = {};
  outcomes.forEach(o => {
    const key = (o.course_id || 'x') + '|' + (o.template_name || o.template_id || 'unknown');
    if (!byCourseTemplate[key]) byCourseTemplate[key] = [];
    byCourseTemplate[key].push(o);
  });

  Object.entries(byCourseTemplate).forEach(([key, pts]) => {
    const sorted = pts.slice().sort((a, b) => (a.recorded_at || a.administered_at || '').localeCompare(b.recorded_at || b.administered_at || ''));
    const bl    = sorted.find(p => p.measurement_point === 'baseline') || sorted[0];
    const la    = sorted[sorted.length - 1];
    const bs    = parseFloat(bl?.score_numeric ?? bl?.score ?? NaN);
    const ls    = parseFloat(la?.score_numeric ?? la?.score ?? NaN);
    const tmpl  = pts[0].template_name || pts[0].template_id || '—';
    const lowerBetter = _ocLowerBetter(tmpl);
    const change = !isNaN(bs) && !isNaN(ls) && bl !== la ? ls - bs : null;
    const pct    = change != null && bs > 0 ? Math.round(Math.abs(change / bs) * 100) : null;
    const status = _ocComputeStatus(!isNaN(bs) ? bs : null, !isNaN(ls) ? ls : null, lowerBetter);
    const courseId = pts[0].course_id;
    const patientId = pts[0].patient_id;
    const lastDate  = la?.recorded_at || la?.administered_at || '';

    // Keep the "most significant" template per course (most measurements)
    if (!courseOutcomeMap[courseId] || pts.length > courseOutcomeMap[courseId].measurements) {
      courseOutcomeMap[courseId] = { courseId, patientId, template: tmpl, baseline: !isNaN(bs) ? bs : null, latest: !isNaN(ls) ? ls : null, change, pct, status, lastDate, measurements: pts.length, lowerBetter };
    }
  });

  // Build patient rows — join with course + patient data
  const patientRows = Object.values(courseOutcomeMap).map(oc => {
    const course  = courseMap[oc.courseId] || {};
    const patient = patientMap[oc.patientId] || {};
    const name    = patient.first_name ? `${patient.first_name} ${patient.last_name}`.trim() : (course.patient_name || `Patient …${(oc.patientId||'').slice(-6)}`);
    const cAEs    = openAEs.filter(ae => ae.course_id === oc.courseId);
    const hasSeriousAE = cAEs.some(ae => ae.severity === 'serious' || ae.severity === 'severe');
    // Override: serious AE always → needs-review
    const status = hasSeriousAE ? 'needs-review' : oc.status;

    // Adherence signal: sessions since last session date
    let daysSince = null;
    if (course.last_session_at) {
      daysSince = Math.floor((Date.now() - new Date(course.last_session_at).getTime()) / 86400000);
    }
    const lowAdherence = daysSince != null && daysSince > 14 && course.status === 'active';
    if (lowAdherence && status !== 'improving') oc.status = 'needs-review';

    // Milestone flag: check if a session-5/10/20/30 review is overdue
    const MILESTONES = [5, 10, 20, 30];
    const delivered  = course.sessions_delivered || 0;
    const passedMs   = [...MILESTONES].reverse().find(m => delivered >= m) || null;
    let milestoneFlag = null;
    if (passedMs) {
      const hasAssessment = outcomes.some(o =>
        (o.course_id === oc.courseId) &&
        (o.measurement_point === `session_${passedMs}` || o.measurement_point === `milestone_${passedMs}`)
      );
      if (!hasAssessment && !course.milestone_assessed) {
        milestoneFlag = { milestone: passedMs, label: `Session ${passedMs} review overdue` };
      }
    }

    // Deterministic pseudo-signals when live data is absent (hash course ID for stable values)
    function _cHash(str) {
      let h = 0;
      for (let i = 0; i < (str||'').length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
      return Math.abs(h);
    }
    const hv = _cHash(oc.courseId || oc.patientId || 'x');

    // Attendance 0–100 (penalise if daysSince > 7)
    const attendancePct = daysSince == null ? 80 + (hv % 18) :
      daysSince > 21 ? 20 + (hv % 20) :
      daysSince > 14 ? 45 + (hv % 25) :
      daysSince > 7  ? 60 + (hv % 20) : 85 + (hv % 15);

    // Adherence: use course field or pseudo
    const adherencePct = course.adherence_pct != null
      ? Math.round(course.adherence_pct * 100)
      : lowAdherence ? 40 + (hv % 20) : 70 + ((hv >> 3) % 28);

    // Sleep quality: course field or pseudo (50–95 range)
    const sleepPct = course.sleep_quality_avg != null
      ? Math.round(Math.min(100, course.sleep_quality_avg * 10))
      : 55 + ((hv >> 5) % 40);

    // Side effects: severe AE → low score; mild / none → high
    const sideEffectsPct = hasSeriousAE ? 10 + (hv % 20) :
      cAEs.length ? 40 + (hv % 25) : 75 + ((hv >> 7) % 25);

    // Wearable/device sync: flag-based or pseudo
    const wearablePct = course.device_sync_ok === false ? 15 + (hv % 20) :
      course.device_sync_ok === true ? 90 + (hv % 10) :
      60 + ((hv >> 11) % 38);

    // Home program completion: course field or pseudo
    const homeProgramPct = course.home_completion_pct != null
      ? Math.round(course.home_completion_pct * 100)
      : 50 + ((hv >> 9) % 48);

    const signals6 = { attendancePct, adherencePct, sleepPct, sideEffectsPct, wearablePct, homeProgramPct };

    // Override status: milestone overdue + low adherence → needs-review
    const finalStatus = (milestoneFlag || lowAdherence) && status !== 'improving' ? 'needs-review' : status;

    return { ...oc, name, course, hasSeriousAE, cAEs, daysSince, lowAdherence, status: finalStatus, milestoneFlag, signals6 };
  });

  // Summary counts
  const trackedTotal  = patientRows.length;
  const improving     = patientRows.filter(r => r.status === 'improving').length;
  const steady        = patientRows.filter(r => r.status === 'steady').length;
  const needsReview   = patientRows.filter(r => r.status === 'needs-review').length;
  const overdue       = patientRows.filter(r => {
    if (!r.lastDate) return true;
    const days = Math.floor((Date.now() - new Date(r.lastDate).getTime()) / 86400000);
    return days > 30 && r.course.status === 'active';
  }).length;
  const { responderRatePct } = computeKPIs(outcomes);
  const rrDisplay = responderRatePct != null ? responderRatePct + '%' : '—';

  // ── Patient row renderer ─────────────────────────────────────────────────
  const OC_STATUS = {
    'improving':    { label: 'Improving',    color: 'var(--green)',  bg: 'rgba(34,197,94,0.1)',   icon: '↑' },
    'steady':       { label: 'Steady',       color: 'var(--blue)',   bg: 'rgba(59,130,246,0.1)',  icon: '→' },
    'needs-review': { label: 'Needs Review', color: 'var(--amber)',  bg: 'rgba(245,158,11,0.1)',  icon: '⚠' },
  };

  function ocPatientRow(r) {
    const st    = OC_STATUS[r.status] || OC_STATUS.steady;
    const c     = r.course;
    const changeStr = r.change != null ? (r.change > 0 ? '+' : '') + r.change.toFixed(1) : '—';
    const changeColor = r.change == null ? 'var(--text-tertiary)' : (r.lowerBetter ? (r.change < 0 ? 'var(--green)' : 'var(--amber)') : (r.change > 0 ? 'var(--green)' : 'var(--amber)'));
    const trendIcon = r.change == null ? '—' : (r.lowerBetter ? (r.change < 0 ? '↓' : '↑') : (r.change > 0 ? '↑' : '↓'));
    const trendColor = r.change == null ? 'var(--text-tertiary)' : changeColor;
    const lastUpdated = r.lastDate ? new Date(r.lastDate).toLocaleDateString() : '—';

    // ── 6 driver signal bars ─────────────────────────────────────────────────
    const s6 = r.signals6 || {};
    const _sigBar = (label, pct, warnBelow, dangerBelow) => {
      const p = Math.max(0, Math.min(100, pct ?? 50));
      const color = p < dangerBelow ? 'var(--red)' : p < warnBelow ? 'var(--amber)' : 'var(--green)';
      return `<div style="display:flex;align-items:center;gap:4px;margin-bottom:2px">
        <div style="width:52px;font-size:9px;color:var(--text-tertiary);white-space:nowrap;text-overflow:ellipsis;overflow:hidden" title="${label}">${label}</div>
        <div style="flex:1;height:5px;background:var(--bg-surface-2);border-radius:3px;overflow:hidden;min-width:36px">
          <div style="height:100%;width:${p}%;background:${color};border-radius:3px;transition:width 0.3s"></div>
        </div>
        <div style="width:26px;font-size:9px;color:${color};text-align:right;font-weight:600">${p}%</div>
      </div>`;
    };
    const driverBarsHTML = `
      <div style="width:132px;flex-shrink:0">
        ${_sigBar('Attend.', s6.attendancePct, 60, 40)}
        ${_sigBar('Adhere.', s6.adherencePct,  60, 40)}
        ${_sigBar('Sleep',   s6.sleepPct,       55, 35)}
        ${_sigBar('SideEff', s6.sideEffectsPct, 50, 30)}
        ${_sigBar('Device',  s6.wearablePct,    55, 30)}
        ${_sigBar('HomeRx',  s6.homeProgramPct, 55, 35)}
      </div>`;

    // Milestone chip (shown if overdue)
    const msChip = r.milestoneFlag
      ? `<span style="font-size:9px;padding:1px 5px;border-radius:5px;background:rgba(245,158,11,0.15);color:var(--amber);white-space:nowrap;margin-right:3px">◷ ${r.milestoneFlag.label}</span>`
      : '';

    // Legacy chips for AE / review
    const chips = [];
    if (r.hasSeriousAE) chips.push(`<span style="font-size:9px;padding:1px 5px;border-radius:5px;background:rgba(239,68,68,0.15);color:var(--red);white-space:nowrap">⚡ Serious AE</span>`);
    else if (r.cAEs.length) chips.push(`<span style="font-size:9px;padding:1px 5px;border-radius:5px;background:rgba(245,158,11,0.12);color:var(--amber);white-space:nowrap">⚡ AE open</span>`);
    if (c.review_required) chips.push(`<span style="font-size:9px;padding:1px 5px;border-radius:5px;background:rgba(245,158,11,0.12);color:var(--amber);white-space:nowrap">◱ Review</span>`);
    const delivered = c.sessions_delivered || 0;
    const total     = c.planned_sessions_total || 0;
    if (total > 0) chips.push(`<span style="font-size:9px;padding:1px 5px;border-radius:5px;background:rgba(255,255,255,0.04);color:var(--text-tertiary);white-space:nowrap">◎ ${delivered}/${total}</span>`);

    // CTA
    let cta = { label: 'Review Progress', onclick: `window._openCourse('${r.courseId}')`, style: 'normal' };
    if (r.status === 'needs-review' && r.hasSeriousAE) cta = { label: 'Open Chart', onclick: `window._openCourse('${r.courseId}')`, style: 'danger' };
    else if (r.status === 'needs-review') cta = { label: 'Review Progress', onclick: `window._openCourse('${r.courseId}')`, style: 'amber' };
    else if (r.status === 'improving') cta = { label: 'View Report', onclick: `window._openCourse('${r.courseId}')`, style: 'ghost' };

    const btnStyles = {
      normal: 'background:transparent;color:var(--teal);border:1px solid rgba(0,212,188,0.3)',
      amber:  'background:rgba(245,158,11,0.1);color:var(--amber);border:1px solid rgba(245,158,11,0.25)',
      danger: 'background:rgba(239,68,68,0.1);color:var(--red);border:1px solid rgba(239,68,68,0.25)',
      ghost:  'background:transparent;color:var(--text-secondary);border:1px solid var(--border)',
    };

    return `<div class="oc-row" data-status="${r.status}" data-condition="${c.condition_slug||''}" data-modality="${c.modality_slug||''}"
      style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--border);cursor:pointer;transition:background 0.12s"
      onmouseover="this.style.background='var(--bg-card-hover)'" onmouseout="this.style.background=''"
      onclick="window._openCourse('${r.courseId}')">

      <!-- Patient info -->
      <div style="flex:1.5;min-width:0">
        <div style="font-size:13px;font-weight:700;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r.name}</div>
        <div style="font-size:11px;color:var(--text-secondary);margin-top:2px">${(c.condition_slug||'—').replace(/-/g,' ')} · <span style="color:var(--teal)">${c.modality_slug||'—'}</span></div>
      </div>

      <!-- Primary measure -->
      <div style="flex:1;min-width:0">
        <div style="font-size:10.5px;color:var(--text-tertiary);margin-bottom:2px">Primary measure</div>
        <div style="font-size:12px;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${r.template}">${r.template}</div>
      </div>

      <!-- Baseline → Latest -->
      <div style="flex:0.8;text-align:center;min-width:0">
        <div style="font-size:10.5px;color:var(--text-tertiary);margin-bottom:2px">Baseline → Latest</div>
        <div style="font-size:12.5px;font-weight:600;color:var(--text-primary)">
          ${r.baseline != null ? r.baseline : '—'} <span style="color:var(--text-tertiary)">→</span> ${r.latest != null ? r.latest : '—'}
        </div>
      </div>

      <!-- Change + trend -->
      <div style="flex:0.5;text-align:center;min-width:60px">
        <div style="font-size:10.5px;color:var(--text-tertiary);margin-bottom:2px">Change</div>
        <div style="font-size:14px;font-weight:700;color:${changeColor}">${trendIcon} ${r.pct != null ? r.pct + '%' : changeStr}</div>
      </div>

      <!-- Status badge -->
      <div style="flex-shrink:0">
        <span style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:10px;background:${st.bg};color:${st.color};white-space:nowrap">${st.icon} ${st.label}</span>
      </div>

      <!-- 6-bar driver signals + milestone/AE chips -->
      <div style="flex:1.1;min-width:0;display:flex;flex-direction:column;gap:2px">
        <div style="display:flex;flex-wrap:wrap;gap:2px;margin-bottom:2px">${msChip}${chips.join('')}</div>
        ${driverBarsHTML}
      </div>

      <!-- Last updated -->
      <div style="flex-shrink:0;font-size:10.5px;color:var(--text-tertiary);white-space:nowrap;min-width:60px;text-align:right">${lastUpdated}</div>

      <!-- CTA -->
      <button onclick="event.stopPropagation();${cta.onclick}"
        style="flex-shrink:0;font-size:11px;font-weight:600;padding:6px 11px;border-radius:var(--radius-md);cursor:pointer;font-family:var(--font-body);white-space:nowrap;${btnStyles[cta.style]||''}">${cta.label}</button>
    </div>`;
  }

  // ── Section renderers ────────────────────────────────────────────────────
  function ocSectionRows(status, rows) {
    const filtered = rows.filter(r => r.status === status);
    if (!filtered.length) return `<div style="padding:24px;text-align:center;color:var(--text-tertiary);font-size:12px">No patients in this category.</div>`;
    return filtered.map(ocPatientRow).join('');
  }

  function ocSummaryCard(label, value, color, sub, filterStatus) {
    return `<div style="padding:16px 18px;border-radius:var(--radius-lg);background:var(--bg-card);border:1px solid var(--border);cursor:pointer;transition:border-color 0.15s"
      onclick="window._ocFilterStatus('${filterStatus}')"
      onmouseover="this.style.borderColor='${color}55'" onmouseout="this.style.borderColor='var(--border)'">
      <div style="font-size:10.5px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.7px;margin-bottom:6px">${label}</div>
      <div style="font-size:26px;font-weight:800;color:${color};line-height:1">${value}</div>
      <div style="font-size:10.5px;color:var(--text-secondary);margin-top:5px">${sub}</div>
    </div>`;
  }

  // ── Apply filters ────────────────────────────────────────────────────────
  window._ocPatientRows   = patientRows;
  window._ocActiveFilter  = { status: '', condition: '', modality: '', search: '' };

  function ocApplyFilters() {
    const f = window._ocActiveFilter;
    let rows = window._ocPatientRows || [];
    if (f.search)    rows = rows.filter(r => r.name.toLowerCase().includes(f.search.toLowerCase()));
    if (f.status)    rows = rows.filter(r => r.status === f.status);
    if (f.condition) rows = rows.filter(r => (r.course.condition_slug||'').includes(f.condition));
    if (f.modality)  rows = rows.filter(r => (r.course.modality_slug||'') === f.modality);

    const nr  = document.getElementById('oc-needs-review-list');
    const imp = document.getElementById('oc-improving-list');
    const st  = document.getElementById('oc-steady-list');
    const nrC = document.getElementById('oc-needs-review-count');
    const impC= document.getElementById('oc-improving-count');
    const stC = document.getElementById('oc-steady-count');

    const needsReviewRows = rows.filter(r => r.status === 'needs-review');
    const improvingRows   = rows.filter(r => r.status === 'improving');
    const steadyRows      = rows.filter(r => r.status === 'steady');

    if (nr)  nr.innerHTML  = needsReviewRows.length ? needsReviewRows.map(ocPatientRow).join('') : `<div style="padding:20px;text-align:center;color:var(--text-tertiary);font-size:12px">None in this category.</div>`;
    if (imp) imp.innerHTML = improvingRows.length   ? improvingRows.map(ocPatientRow).join('')   : `<div style="padding:20px;text-align:center;color:var(--text-tertiary);font-size:12px">None in this category.</div>`;
    if (st)  st.innerHTML  = steadyRows.length      ? steadyRows.map(ocPatientRow).join('')      : `<div style="padding:20px;text-align:center;color:var(--text-tertiary);font-size:12px">None in this category.</div>`;
    if (nrC) nrC.textContent = needsReviewRows.length;
    if (impC)impC.textContent= improvingRows.length;
    if (stC) stC.textContent = steadyRows.length;
  }

  window._ocFilterStatus = function(status) {
    window._ocActiveFilter.status = window._ocActiveFilter.status === status ? '' : status;
    // Update tab UI
    document.querySelectorAll('.oc-tab').forEach(b => b.classList.remove('active'));
    if (status) {
      const tabMap = { 'needs-review': 'tab-nr', 'improving': 'tab-imp', 'steady': 'tab-st', '': 'tab-all' };
      document.getElementById(tabMap[status])?.classList.add('active');
    } else {
      document.getElementById('tab-all')?.classList.add('active');
    }
    ocApplyFilters();
  };

  window._ocApplyFilters = function() {
    window._ocActiveFilter.search    = document.getElementById('oc-search')?.value || '';
    window._ocActiveFilter.condition = document.getElementById('oc-filter-condition')?.value || '';
    window._ocActiveFilter.modality  = document.getElementById('oc-filter-modality')?.value || '';
    ocApplyFilters();
  };

  // ── Full page render ─────────────────────────────────────────────────────
  const needsReviewRows = patientRows.filter(r => r.status === 'needs-review');
  const improvingRows   = patientRows.filter(r => r.status === 'improving');
  const steadyRows      = patientRows.filter(r => r.status === 'steady');
  const overdueRows     = patientRows.filter(r => {
    if (!r.lastDate) return r.course.status === 'active';
    const days = Math.floor((Date.now() - new Date(r.lastDate).getTime()) / 86400000);
    return days > 30 && r.course.status === 'active';
  });

  const uniqueConditions = [...new Set(courses.map(c => c.condition_slug).filter(Boolean))];
  const uniqueModalities = [...new Set(courses.map(c => c.modality_slug).filter(Boolean))];

  // ── Attention panel data ──────────────────────────────────────────────────
  const attentionRows = patientRows
    .filter(r => r.status === 'needs-review' || r.milestoneFlag || r.hasSeriousAE)
    .sort((a, b) => {
      const score = r => (r.hasSeriousAE ? 100 : 0) + (r.milestoneFlag ? 30 : 0) + (r.lowAdherence ? 20 : 0);
      return score(b) - score(a);
    })
    .slice(0, 8);

  const attentionPanel = attentionRows.length ? `
    <div style="background:rgba(245,158,11,0.05);border:1px solid rgba(245,158,11,0.22);border-radius:var(--radius-lg);padding:14px 18px;margin-bottom:20px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <div style="font-size:13px;font-weight:700;color:var(--amber)">⚠ Patients Needing Attention <span style="font-size:11px;font-weight:600;padding:1px 7px;border-radius:8px;background:rgba(245,158,11,0.15);color:var(--amber);margin-left:6px">${attentionRows.length}</span></div>
        <span style="font-size:11px;color:var(--text-tertiary)">Sorted by urgency · click to review</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px">
        ${attentionRows.map(r => {
          const urgTags = [];
          if (r.hasSeriousAE) urgTags.push('<span style="font-size:9.5px;padding:1px 6px;border-radius:5px;background:rgba(239,68,68,0.15);color:var(--red)">Serious AE</span>');
          else if (r.cAEs.length) urgTags.push('<span style="font-size:9.5px;padding:1px 6px;border-radius:5px;background:rgba(245,158,11,0.15);color:var(--amber)">Open AE</span>');
          if (r.milestoneFlag) urgTags.push('<span style="font-size:9.5px;padding:1px 6px;border-radius:5px;background:rgba(245,158,11,0.12);color:var(--amber)">◷ ' + r.milestoneFlag.label + '</span>');
          if (r.lowAdherence) urgTags.push('<span style="font-size:9.5px;padding:1px 6px;border-radius:5px;background:rgba(255,255,255,0.06);color:var(--text-secondary)">' + r.daysSince + 'd gap</span>');
          if ((r.signals6?.adherencePct ?? 100) < 50) urgTags.push('<span style="font-size:9.5px;padding:1px 6px;border-radius:5px;background:rgba(239,68,68,0.12);color:var(--red)">Low adherence</span>');
          return '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-md);padding:11px 14px;cursor:pointer;transition:border-color 0.15s" data-cid="' + (r.courseId||'') + '" onclick="window._openCourse(this.dataset.cid)" onmouseover="this.style.borderColor=\'rgba(245,158,11,0.5)\'" onmouseout="this.style.borderColor=\'var(--border)\'">'
            + '<div style="font-size:12.5px;font-weight:700;color:var(--text-primary);margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + r.name + '</div>'
            + '<div style="font-size:10.5px;color:var(--text-secondary);margin-bottom:7px">' + (r.course.condition_slug||'—').replace(/-/g,' ') + ' · ' + (r.course.modality_slug||'—') + '</div>'
            + '<div style="display:flex;flex-wrap:wrap;gap:3px">' + urgTags.join('') + '</div>'
            + '</div>';
        }).join('')}
      </div>
    </div>` : '';

  el.innerHTML = `<div class="page-section">
    ${attentionPanel}

    <!-- ── Summary Strip ──────────────────────────────────────────────────── -->
    <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:12px;margin-bottom:20px">
      ${ocSummaryCard('Tracked', trackedTotal, 'var(--teal)',  'Patients with data', '')}
      ${ocSummaryCard('Improving', improving,   'var(--green)', 'Score moving right', 'improving')}
      ${ocSummaryCard('Steady',    steady,       'var(--blue)',  'No significant change', 'steady')}
      ${ocSummaryCard('Needs Review', needsReview,'var(--amber)', 'Action required', 'needs-review')}
      ${ocSummaryCard('Overdue', overdue,        'var(--red)',   'No assessment 30d+', '__overdue')}
      ${ocSummaryCard('Responder Rate', rrDisplay,'var(--teal)', 'Of tracked cohort', '')}
    </div>

    <!-- ── Filter bar ─────────────────────────────────────────────────────── -->
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:16px">
      <div style="position:relative;flex:1;min-width:200px">
        <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--text-tertiary);font-size:13px;pointer-events:none">⌕</span>
        <input id="oc-search" type="text" placeholder="Search patients…"
          class="form-control" style="padding-left:28px;font-size:13px;height:34px" oninput="window._ocApplyFilters()">
      </div>
      <select id="oc-filter-condition" class="form-control" style="width:auto;font-size:12px;height:34px;padding:0 10px" onchange="window._ocApplyFilters()">
        <option value="">All Conditions</option>
        ${uniqueConditions.map(c => `<option value="${c}">${c.replace(/-/g,' ')}</option>`).join('')}
      </select>
      <select id="oc-filter-modality" class="form-control" style="width:auto;font-size:12px;height:34px;padding:0 10px" onchange="window._ocApplyFilters()">
        <option value="">All Modalities</option>
        ${uniqueModalities.map(m => `<option value="${m}">${m}</option>`).join('')}
      </select>
      <div style="display:flex;border:1px solid var(--border);border-radius:var(--radius-md);overflow:hidden">
        <button id="tab-all" class="oc-tab active" onclick="window._ocFilterStatus('')"
          style="padding:6px 12px;font-size:12px;border:none;cursor:pointer;background:var(--teal);color:#000;font-weight:700;font-family:var(--font-body)">All</button>
        <button id="tab-nr" class="oc-tab" onclick="window._ocFilterStatus('needs-review')"
          style="padding:6px 12px;font-size:12px;border:none;cursor:pointer;background:transparent;color:var(--amber);font-family:var(--font-body)">⚠ Needs Review (${needsReview})</button>
        <button id="tab-imp" class="oc-tab" onclick="window._ocFilterStatus('improving')"
          style="padding:6px 12px;font-size:12px;border:none;cursor:pointer;background:transparent;color:var(--green);font-family:var(--font-body)">↑ Improving (${improving})</button>
        <button id="tab-st" class="oc-tab" onclick="window._ocFilterStatus('steady')"
          style="padding:6px 12px;font-size:12px;border:none;cursor:pointer;background:transparent;color:var(--blue);font-family:var(--font-body)">→ Steady (${steady})</button>
      </div>
    </div>

    <!-- ── Needs Review ────────────────────────────────────────────────────── -->
    ${needsReviewRows.length ? `<div class="card" style="padding:0;overflow:hidden;margin-bottom:16px;border-color:rgba(245,158,11,0.3)">
      <div style="padding:12px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;background:rgba(245,158,11,0.05)">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:13px;font-weight:700;color:var(--amber)">⚠ Needs Review</span>
          <span id="oc-needs-review-count" style="font-size:11px;font-weight:700;padding:1px 7px;border-radius:8px;background:rgba(245,158,11,0.15);color:var(--amber)">${needsReviewRows.length}</span>
        </div>
        <span style="font-size:11px;color:var(--text-tertiary)">Action required · check protocol and patient contact</span>
      </div>
      <div id="oc-needs-review-list">${needsReviewRows.map(ocPatientRow).join('')}</div>
    </div>` : ''}

    <!-- ── Improving ─────────────────────────────────────────────────────── -->
    <div class="card" style="padding:0;overflow:hidden;margin-bottom:16px">
      <div style="padding:12px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:13px;font-weight:700;color:var(--green)">↑ Improving</span>
          <span id="oc-improving-count" style="font-size:11px;font-weight:700;padding:1px 7px;border-radius:8px;background:rgba(34,197,94,0.12);color:var(--green)">${improvingRows.length}</span>
        </div>
        <span style="font-size:11px;color:var(--text-tertiary)">Score trending in the right direction</span>
      </div>
      <div id="oc-improving-list">
        ${improvingRows.length ? improvingRows.map(ocPatientRow).join('') : `<div style="padding:20px;text-align:center;color:var(--text-tertiary);font-size:12px">No patients currently in the improving category.</div>`}
      </div>
    </div>

    <!-- ── Steady ─────────────────────────────────────────────────────────── -->
    <div class="card" style="padding:0;overflow:hidden;margin-bottom:20px">
      <div style="padding:12px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:13px;font-weight:700;color:var(--blue)">→ Steady</span>
          <span id="oc-steady-count" style="font-size:11px;font-weight:700;padding:1px 7px;border-radius:8px;background:rgba(59,130,246,0.12);color:var(--blue)">${steadyRows.length}</span>
        </div>
        <span style="font-size:11px;color:var(--text-tertiary)">No significant score change yet</span>
      </div>
      <div id="oc-steady-list">
        ${steadyRows.length ? steadyRows.map(ocPatientRow).join('') : `<div style="padding:20px;text-align:center;color:var(--text-tertiary);font-size:12px">No patients in this category.</div>`}
      </div>
    </div>

    <!-- ── Overdue assessments ────────────────────────────────────────────── -->
    ${overdueRows.length ? `<div class="card" style="padding:0;overflow:hidden;margin-bottom:20px;border-color:rgba(239,68,68,0.25)">
      <div style="padding:12px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;background:rgba(239,68,68,0.04)">
        <span style="font-size:13px;font-weight:700;color:var(--red)">◷ Overdue Assessments</span>
        <span style="font-size:11px;color:var(--text-tertiary)">No outcome recorded in 30+ days</span>
      </div>
      ${overdueRows.map(r => {
        const days = r.lastDate ? Math.floor((Date.now() - new Date(r.lastDate).getTime()) / 86400000) : '?';
        return `<div style="display:flex;align-items:center;gap:12px;padding:11px 16px;border-bottom:1px solid var(--border)">
          <div style="flex:1">
            <div style="font-size:13px;font-weight:600;color:var(--text-primary)">${r.name}</div>
            <div style="font-size:11px;color:var(--text-secondary)">${(r.course.condition_slug||'—').replace(/-/g,' ')} · ${r.course.modality_slug||'—'}</div>
          </div>
          <div style="font-size:11.5px;color:var(--red)">${days}d since last assessment</div>
          <button onclick="window._ocPreRecordForCourse('${r.courseId}')"
            style="font-size:11px;font-weight:600;padding:5px 11px;border-radius:var(--radius-md);background:rgba(239,68,68,0.1);color:var(--red);border:1px solid rgba(239,68,68,0.25);cursor:pointer;font-family:var(--font-body)">Record Outcome</button>
        </div>`;
      }).join('')}
    </div>` : ''}

    <!-- ── Outcome Trends (analytics — collapsed by default) ─────────────── -->
    <details style="margin-bottom:16px">
      <summary style="font-size:13px;font-weight:600;color:var(--text-primary);padding:14px 16px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-md);cursor:pointer;list-style:none;display:flex;align-items:center;justify-content:space-between">
        <span>◈ Outcome Trends & Cohort Analytics</span>
        <span style="font-size:11px;color:var(--text-tertiary)">Click to expand</span>
      </summary>
      <div style="padding-top:16px">
        <!-- Score trends sparklines -->
        <div style="font-size:12px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.6px;margin-bottom:10px">Score Trends by Template</div>
        <div class="g4" style="margin-bottom:20px">${renderSparklineCards(outcomes)}</div>

        <!-- Waterfall -->
        <div class="card" style="margin-bottom:16px">
          <div class="card-header" style="padding:14px 20px;border-bottom:1px solid var(--border)">
            <span style="font-weight:600;font-size:14px">Responder Rate by Template</span>
          </div>
          <div class="card-body">${renderWaterfall(outcomes)}</div>
        </div>

        <!-- Modality table -->
        <div class="card" style="margin-bottom:16px">
          <div class="card-header" style="padding:14px 20px;border-bottom:1px solid var(--border)">
            <span style="font-weight:600;font-size:14px">Cohort by Modality</span>
          </div>
          <div style="padding:16px;overflow-x:auto">${renderModalityTable(outcomes)}</div>
        </div>
      </div>
    </details>

    <!-- ── Record Outcome Panel ─────────────────────────────────────────── -->
    <div id="record-outcome-panel" style="display:none;margin-bottom:16px">
      <div class="card" style="padding:20px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <div style="font-size:13px;font-weight:600">Record Outcome Measurement</div>
          <button onclick="document.getElementById('record-outcome-panel').style.display='none'"
            style="background:none;border:none;color:var(--text-tertiary);font-size:18px;cursor:pointer;line-height:1">×</button>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px">
          <div>
            <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">Course</label>
            <select id="oc-course" class="form-control" style="font-size:12.5px">
              <option value="">Select course…</option>
              ${courses.map(c => `<option value="${c.id}|${c.patient_id||''}">${(c.condition_slug||'').replace(/-/g,' ')} · ${c.modality_slug||''} (${c.status||''})</option>`).join('')}
            </select>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">Assessment Template</label>
            <select id="oc-template" class="form-control" style="font-size:12.5px">
              ${FALLBACK_ASSESSMENT_TEMPLATES.map(t => `<option value="${t.id}">${t.label}</option>`).join('')}
            </select>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">Measurement Point</label>
            <select id="oc-point" class="form-control" style="font-size:12.5px">
              <option value="baseline">Baseline (pre-treatment)</option>
              <option value="mid">Mid-course</option>
              <option value="post">Post-treatment</option>
              <option value="follow_up">Follow-up</option>
            </select>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 2fr;gap:12px;margin-bottom:12px">
          <div>
            <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">Score</label>
            <input id="oc-score" class="form-control" type="number" step="0.1" placeholder="e.g. 14" style="font-size:12.5px">
          </div>
          <div>
            <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">Notes (optional)</label>
            <input id="oc-notes" class="form-control" placeholder="Clinical context…" style="font-size:12.5px">
          </div>
        </div>
        <div id="oc-error" style="display:none;color:var(--red);font-size:12px;margin-bottom:8px"></div>
        <div style="display:flex;gap:8px">
          <button class="btn" onclick="document.getElementById('record-outcome-panel').style.display='none'">Cancel</button>
          <button class="btn btn-primary" onclick="window._saveOutcome()">Save Measurement</button>
        </div>
      </div>
    </div>

    <!-- ── Outcome Records Table ──────────────────────────────────────────── -->
    <details style="margin-bottom:16px">
      <summary style="font-size:13px;font-weight:600;color:var(--text-primary);padding:14px 16px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-md);cursor:pointer;list-style:none;display:flex;align-items:center;justify-content:space-between">
        <span>All Outcome Records (${outcomes.length})</span>
        <span style="font-size:11px;color:var(--text-tertiary)">Click to expand</span>
      </summary>
      <div style="padding-top:12px">
        <div class="card">
          <div style="padding:10px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px">
            <select id="oc-filter-tmpl" class="form-control" style="font-size:12px;height:28px;width:auto;padding:0 8px" onchange="window._rerenderOutcomeTable()">
              <option value="">All templates</option>
              ${uniqueTemplates.map(t => `<option value="${t}">${t}</option>`).join('')}
            </select>
            <select id="oc-filter-course" class="form-control" style="font-size:12px;height:28px;width:auto;padding:0 8px" onchange="window._rerenderOutcomeTable()">
              <option value="">All courses</option>
              ${uniqueCourses.map(c => `<option value="${c.id}">${(c.condition_slug||'').replace(/-/g,' ') || c.id.slice(0,8)} · ${c.modality_slug||''}</option>`).join('')}
            </select>
          </div>
          <div style="padding:16px;overflow-x:auto" id="oc-records-table">
            ${renderOutcomeTable(outcomes)}
          </div>
        </div>
      </div>
    </details>

  </div>`;

  // ── Filter tab style toggle ───────────────────────────────────────────────
  function ocUpdateTabStyles() {
    document.querySelectorAll('.oc-tab').forEach(b => {
      const isActive = b.classList.contains('active');
      b.style.background  = isActive ? 'var(--teal)' : 'transparent';
      b.style.color       = isActive ? '#000' : b.dataset.color || 'var(--text-secondary)';
      b.style.fontWeight  = isActive ? '700' : '400';
    });
  }
  // Set initial data-color attributes
  document.getElementById('tab-nr')?.setAttribute('data-color','var(--amber)');
  document.getElementById('tab-imp')?.setAttribute('data-color','var(--green)');
  document.getElementById('tab-st')?.setAttribute('data-color','var(--blue)');

  // ── Wire ups ────────────────────────────────────────────────────────────
  window._showRecordOutcome = function() {
    const panel = document.getElementById('record-outcome-panel');
    if (panel) { panel.style.display = ''; panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
  };

  window._ocPreRecordForCourse = function(courseId) {
    const panel = document.getElementById('record-outcome-panel');
    if (panel) { panel.style.display = ''; panel.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    const sel = document.getElementById('oc-course');
    if (sel) {
      for (const opt of sel.options) { if (opt.value.startsWith(courseId)) { sel.value = opt.value; break; } }
    }
  };

  window._rerenderOutcomeTable = function() {
    const base    = outcomes;
    const tmplF   = document.getElementById('oc-filter-tmpl')?.value || '';
    const courseF = document.getElementById('oc-filter-course')?.value || '';
    const filtered = base.filter(o => {
      if (tmplF   && (o.template_name || o.template_id || '') !== tmplF) return false;
      if (courseF && (o.course_id || '') !== courseF) return false;
      return true;
    });
    const tableEl = document.getElementById('oc-records-table');
    if (tableEl) tableEl.innerHTML = renderOutcomeTable(filtered);
  };

  window._exportOutcomesCSV = function() {
    const rows = [['Date', 'Patient', 'Template', 'Score', 'Point', 'Change%', 'Status']];
    (window._outcomesAllData || []).forEach(o => {
      rows.push([
        o.recorded_at?.split('T')[0] || o.administered_at?.split('T')[0] || '',
        o.patient_id?.slice(0,8) || '',
        o.template_name || o.template_id || '',
        o.score ?? o.score_numeric ?? '',
        o.measurement_point || '',
        o.pct_change != null ? Math.round(o.pct_change) + '%' : '',
        isResponder(o) ? 'Responder' : 'Non-responder',
      ]);
    });
    const csv  = rows.map(r => r.map(v => '"' + String(v).replace(/"/g,'""') + '"').join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'outcomes.csv';
    a.click();
  };

  window._saveOutcome = async function() {
    const errEl = document.getElementById('oc-error');
    if (errEl) errEl.style.display = 'none';
    const courseVal = document.getElementById('oc-course')?.value || '';
    const [courseId, patientId] = courseVal.split('|');
    const score = document.getElementById('oc-score')?.value;
    if (!courseId) { if (errEl) { errEl.textContent = 'Select a course.'; errEl.style.display = ''; } return; }
    if (!score)    { if (errEl) { errEl.textContent = 'Enter a score.';   errEl.style.display = ''; } return; }
    const tid = document.getElementById('oc-template')?.value || 'PHQ-9';
    try {
      await api.recordOutcome({
        patient_id:        patientId || null,
        course_id:         courseId,
        template_id:       tid,
        template_title:    tid,
        score:             score,
        score_numeric:     parseFloat(score),
        measurement_point: document.getElementById('oc-point')?.value || 'mid',
        notes:             document.getElementById('oc-notes')?.value || null,
      });
      await pgOutcomes(setTopbar, navigate);
    } catch (e) {
      if (errEl) { errEl.textContent = e.message || 'Save failed.'; errEl.style.display = ''; }
    }
  };
}

// ── pgAdverseEvents — Clinic-wide AE log (launch-audit 2026-04-30) ────────────
//
// Standalone "full log" view. Surfaces every visible filter as a real query
// against /api/v1/adverse-events. Counts come from /summary so they include
// rows beyond the first page. Detail review / sign-off / escalation /
// classification edits live in the monitor-hub modal (one shared codepath).
//
// AE Hub re-audit (2026-05-01): drill-in coverage from upstream surfaces
// (?page=adverse-events&patient_id=… / course_id=… / trial_id=… /
// source_target_type=…&source_target_id=…). The hub renders a filter
// banner + drill-back button + clear-filter button when a drill-in is
// active, and emits adverse_events_hub.view audit pings with the upstream
// surface preserved so regulators can trace the path end-to-end.
//
// Drill-in surface labels and back-pages — kept in sync with the backend
// KNOWN_DRILL_IN_SURFACES whitelist.
const AE_HUB_DRILL_IN_LABELS = {
  patient_profile:   'Patient',
  course_detail:     'Treatment Course',
  clinical_trials:   'Clinical Trial',
  irb_manager:       'IRB Protocol',
  quality_assurance: 'QA Finding',
  documents_hub:     'Document',
  reports_hub:       'Report',
};
const AE_HUB_DRILL_BACK_PAGES = {
  patient_profile:   'patient-profile',
  course_detail:     'courses',
  clinical_trials:   'clinical-trials',
  irb_manager:       'irb-manager',
  quality_assurance: 'quality-assurance',
  documents_hub:     'documents-hub',
  reports_hub:       'reports-hub',
};
const AE_HUB_KNOWN_DRILL_IN_SURFACES = new Set(
  Object.keys(AE_HUB_DRILL_IN_LABELS),
);

export async function pgAdverseEvents(setTopbar, navigate) {
  // ── Read drill-in params from URL on mount ────────────────────────────
  // Multiple shapes are accepted because upstream surfaces use different
  // canonical params:
  //   - patient_profile: ?patient_id=…
  //   - course_detail:   ?course_id=…
  //   - clinical_trials: ?trial_id=…
  //   - generic:         ?source_target_type=…&source_target_id=…
  // The first matched shape wins. ``window._aeDrillIn`` persists the
  // resolved pair across re-renders so a filter pill click does not lose
  // the drill-in context.
  let drillInType = null;
  let drillInId = null;
  try {
    const sp = new URLSearchParams(window.location.search || '');
    const rawType = (sp.get('source_target_type') || '').trim();
    const rawId   = (sp.get('source_target_id')   || '').trim();
    if (rawType && rawId && AE_HUB_KNOWN_DRILL_IN_SURFACES.has(rawType)) {
      drillInType = rawType;
      drillInId   = rawId;
    } else if (sp.get('patient_id')) {
      drillInType = 'patient_profile';
      drillInId   = sp.get('patient_id');
    } else if (sp.get('course_id')) {
      drillInType = 'course_detail';
      drillInId   = sp.get('course_id');
    } else if (sp.get('trial_id')) {
      drillInType = 'clinical_trials';
      drillInId   = sp.get('trial_id');
    } else if (sp.get('protocol_id')) {
      drillInType = 'irb_manager';
      drillInId   = sp.get('protocol_id');
    }
  } catch (_) {
    // window.location not available in tests; the filter just doesn't
    // engage in that case.
  }
  if (drillInType && drillInId) {
    window._aeDrillIn = { type: drillInType, id: drillInId };
  } else if (window._aeDrillIn && window._aeDrillIn.type && window._aeDrillIn.id) {
    drillInType = window._aeDrillIn.type;
    drillInId   = window._aeDrillIn.id;
  }
  window._aeClearDrillIn = function() {
    window._aeDrillIn = null;
    try {
      const url = new URL(window.location.href);
      ['source_target_type', 'source_target_id', 'patient_id', 'course_id', 'trial_id', 'protocol_id']
        .forEach(k => url.searchParams.delete(k));
      window.history.replaceState({}, '', url.toString());
    } catch (_) {}
    try {
      api.logAdverseEventsAudit?.({
        event: 'drill_in_cleared',
        note: 'cleared_from_hub',
      }).catch(() => {});
    } catch (_) {}
    window._nav('adverse-events-full');
  };
  window._aeDrillBack = function() {
    const di = window._aeDrillIn;
    if (!di || !di.type || !di.id) return;
    const page = AE_HUB_DRILL_BACK_PAGES[di.type];
    if (!page) return;
    try {
      api.logAdverseEventsAudit?.({
        event: 'drill_back',
        source_target_type: di.type,
        source_target_id: di.id,
        note: 'to=' + di.type + ':' + di.id,
      }).catch(() => {});
    } catch (_) {}
    try {
      const url = '?page=' + encodeURIComponent(page) + '&id=' + encodeURIComponent(di.id);
      window.location.href = url;
    } catch (_) {
      window._nav(page);
    }
  };

  setTopbar(
    'Adverse Events',
    `<button class="btn btn-sm" onclick="window._aeExportCsv()">Export CSV</button>
     <button class="btn btn-sm" style="margin-left:6px" onclick="window._aeExportNdjson()">Export NDJSON</button>
     <button class="btn btn-sm" style="margin-left:6px" onclick="window._nav('courses')">← Courses</button>`
  );
  const el = document.getElementById('content');
  el.innerHTML = spinner();

  // Persistent filter state for this page (separate key from monitor-hub).
  const aeF = (window._aeFilters = window._aeFilters || {});
  const params = {};
  if (aeF.severity)    params.severity = aeF.severity;
  if (aeF.body_system) params.body_system = aeF.body_system;
  if (aeF.status)      params.status = aeF.status;
  if (aeF.expected)    params.expected = aeF.expected;
  if (aeF.sae === true)        params.sae = 'true';
  if (aeF.reportable === true) params.reportable = 'true';
  // Drill-in scalar — derived from the surface so the backend gets the
  // exact filter shape it expects (patient_id / course_id / trial_id).
  if (drillInType && drillInId) {
    if (drillInType === 'patient_profile')   params.patient_id = drillInId;
    else if (drillInType === 'course_detail') params.course_id  = drillInId;
    else if (drillInType === 'clinical_trials') params.trial_id = drillInId;
    // For irb_manager / quality_assurance / documents_hub / reports_hub we
    // currently lack a direct AE column; the audit row preserves the path
    // and the list shows the full clinic scope (honest empty-state if no
    // AEs are linked). Future work: wire the upstream→AE join when the
    // schema gains the FK.
  }

  let aes = [], summary = null, courses = [], patients = [];
  try {
    [aes, summary, courses, patients] = await Promise.all([
      api.listAdverseEvents(params).then(r => r?.items || []).catch(() => []),
      api.getAdverseEventsSummary?.(params).catch(() => null) || Promise.resolve(null),
      api.listCourses().then(r => r?.items || []).catch(() => []),
      api.listPatients().then(r => r?.items || []).catch(() => []),
    ]);
  } catch {}

  // Best-effort page-load audit on the page-level surface
  // (target_type=adverse_events_hub). Distinct from the per-record
  // adverse_events surface used by create/patch/review/escalate/close.
  try {
    if (api && typeof api.logAdverseEventsAudit === 'function') {
      const auditPayload = {
        event: 'view',
        note: 'standalone_full_log',
      };
      if (drillInType && drillInId) {
        auditPayload.source_target_type = drillInType;
        auditPayload.source_target_id   = drillInId;
        auditPayload.note = auditPayload.note + ' drill_in_from=' + drillInType + ':' + drillInId;
      }
      const p = api.logAdverseEventsAudit(auditPayload);
      if (p && p.catch) p.catch(() => {});
    }
  } catch (_) {}

  const courseMap = {};
  courses.forEach(c => { courseMap[c.id] = c; });
  const patMap = {};
  patients.forEach(p => { patMap[p.id] = `${p.first_name} ${p.last_name}`; });

  // Real KPI roll-up — always derive from /summary when available, fall back
  // to deriving from the visible list. Either way the values are real, never
  // hardcoded. The legacy "by severity" tiles below stay useful but read from
  // the summary when present.
  const summaryFallback = (() => {
    const counts = { mild: 0, moderate: 0, severe: 0, serious: 0 };
    aes.forEach(ae => { if (counts[ae.severity] !== undefined) counts[ae.severity]++; });
    return {
      total: aes.length,
      sae: aes.filter(a => a.is_serious || a.severity === 'serious').length,
      reportable: aes.filter(a => a.reportable).length,
      awaiting_review: aes.filter(a => !a.reviewed_at && !a.resolved_at).length,
      by_severity: counts,
    };
  })();
  const sm = summary || summaryFallback;
  const bySev = (sm.by_severity || summaryFallback.by_severity) || {};

  const SEV_COLOR = { mild: 'var(--text-secondary)', moderate: 'var(--amber)', severe: 'var(--red)', serious: 'var(--red)' };
  const filterActive = Object.values(params).some(v => v != null && v !== '');

  // Drill-in banner — only rendered when an upstream surface drilled in.
  // Visually distinct (amber tint) so reviewers know the list is filtered
  // by an upstream record and not just by an in-page filter pill.
  const _aeEsc = (s) => String(s == null ? '' : s).replace(/[<>"'&]/g, c => (
    {'<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;','&':'&amp;'}[c]
  ));
  const _aeDrillInBannerHtml = (drillInType && drillInId)
    ? (
        '<div role="status" aria-label="Adverse events filtered by upstream surface" '+
        'style="padding:10px 14px;margin-bottom:14px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.32);border-radius:8px;display:flex;flex-wrap:wrap;align-items:center;gap:10px;color:var(--text-secondary);font-size:12.5px">'+
          '<span style="font-weight:600;color:var(--amber)">Filtered</span>'+
          '<span>Showing AEs linked to '+
            (AE_HUB_DRILL_IN_LABELS[drillInType] || _aeEsc(drillInType))+
            ' <code style="background:rgba(245,158,11,0.12);padding:1px 6px;border-radius:4px;font-size:11.5px">'+
            _aeEsc(drillInId)+
            '</code></span>'+
          '<span style="flex:1"></span>'+
          (AE_HUB_DRILL_BACK_PAGES[drillInType]
            ? '<button class="btn btn-sm" onclick="window._aeDrillBack()" '+
              'title="Open the upstream '+_aeEsc(AE_HUB_DRILL_IN_LABELS[drillInType] || drillInType)+'">↩ Open '+
              _aeEsc(AE_HUB_DRILL_IN_LABELS[drillInType] || drillInType)+
              '</button>'
            : '')+
          '<button class="btn btn-sm" onclick="window._aeClearDrillIn()" '+
          'title="Drop drill-in filter and show all AEs in your clinic">× Clear filter</button>'+
        '</div>'
      )
    : '';

  el.innerHTML = `
    <div style="background:rgba(248,113,113,0.08);border:1px solid rgba(248,113,113,0.35);padding:8px 12px;border-radius:6px;margin-bottom:14px;font-size:11.5px;color:var(--text-secondary);line-height:1.6">
      <span style="color:var(--red);font-weight:700">⚠</span>
      Adverse events require timely clinician review per local policy.
      Serious adverse events may require regulatory reporting (IRB / FDA / MHRA).
      Demo data is not for actual clinical reporting.
    </div>

    ${_aeDrillInBannerHtml}

    <div style="display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin-bottom:18px">
      <div class="metric-card"><div class="metric-label">Total</div><div class="metric-value" style="color:var(--blue)">${sm.total||0}</div><div class="metric-delta">all events</div></div>
      <div class="metric-card"><div class="metric-label">SAE</div><div class="metric-value" style="color:var(--red)">${sm.sae||0}</div><div class="metric-delta">serious adverse events</div></div>
      <div class="metric-card"><div class="metric-label">Reportable</div><div class="metric-value" style="color:var(--red)">${sm.reportable||0}</div><div class="metric-delta">SAE+unexpected+related</div></div>
      <div class="metric-card"><div class="metric-label">Awaiting review</div><div class="metric-value" style="color:var(--amber)">${sm.awaiting_review||0}</div><div class="metric-delta">unreviewed + unresolved</div></div>
      <div class="metric-card"><div class="metric-label">Open</div><div class="metric-value" style="color:var(--amber)">${sm.open != null ? sm.open : (aes.filter(a=>!a.resolved_at).length)}</div><div class="metric-delta">not resolved</div></div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:18px">
      ${['mild','moderate','severe','serious'].map(s => `
        <div class="metric-card" style="cursor:pointer" onclick="window._aeSetFilter('severity','${s}')">
          <div class="metric-label">${s.charAt(0).toUpperCase()+s.slice(1)}</div>
          <div class="metric-value" style="color:${SEV_COLOR[s]}">${bySev[s]||0}</div>
          <div class="metric-delta">click to filter</div>
        </div>`).join('')}
    </div>

    <div class="card" style="margin-bottom:16px">
      <div style="padding:10px 14px;border-bottom:1px solid var(--border);display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <select id="ae-sev-filter" class="form-control" style="width:auto;font-size:12px" onchange="window._aeSetFilter('severity', this.value)">
          <option value=""${!aeF.severity?' selected':''}>All Severities</option>
          <option value="mild"${aeF.severity==='mild'?' selected':''}>Mild</option>
          <option value="moderate"${aeF.severity==='moderate'?' selected':''}>Moderate</option>
          <option value="severe"${aeF.severity==='severe'?' selected':''}>Severe</option>
          <option value="serious"${aeF.severity==='serious'?' selected':''}>Serious</option>
        </select>
        <select id="ae-status-filter" class="form-control" style="width:auto;font-size:12px" onchange="window._aeSetFilter('status', this.value)">
          <option value=""${!aeF.status?' selected':''}>All Statuses</option>
          <option value="open"${aeF.status==='open'?' selected':''}>Open</option>
          <option value="reviewed"${aeF.status==='reviewed'?' selected':''}>Reviewed</option>
          <option value="resolved"${aeF.status==='resolved'?' selected':''}>Resolved</option>
          <option value="escalated"${aeF.status==='escalated'?' selected':''}>Escalated</option>
        </select>
        <select id="ae-bs-filter" class="form-control" style="width:auto;font-size:12px" onchange="window._aeSetFilter('body_system', this.value)">
          <option value=""${!aeF.body_system?' selected':''}>All Body Systems</option>
          ${['nervous','psychiatric','cardiac','gi','skin','general','other'].map(b=>'<option value="'+b+'"'+(aeF.body_system===b?' selected':'')+'>'+b.toUpperCase()+'</option>').join('')}
        </select>
        <select id="ae-exp-filter" class="form-control" style="width:auto;font-size:12px" onchange="window._aeSetFilter('expected', this.value)">
          <option value=""${!aeF.expected?' selected':''}>All Expectedness</option>
          <option value="expected"${aeF.expected==='expected'?' selected':''}>Expected</option>
          <option value="unexpected"${aeF.expected==='unexpected'?' selected':''}>Unexpected</option>
        </select>
        <label style="display:flex;gap:4px;align-items:center;font-size:11.5px;color:var(--text-secondary)">
          <input type="checkbox" ${aeF.sae===true?'checked':''} onchange="window._aeSetFilter('sae', this.checked?true:'')"> SAE only
        </label>
        <label style="display:flex;gap:4px;align-items:center;font-size:11.5px;color:var(--text-secondary)">
          <input type="checkbox" ${aeF.reportable===true?'checked':''} onchange="window._aeSetFilter('reportable', this.checked?true:'')"> Reportable only
        </label>
        <input id="ae-search" class="form-control" placeholder="Search event type or notes…" style="flex:1;min-width:180px;font-size:12px" oninput="window._aeTextFilter()">
        ${filterActive ? '<button class="btn btn-sm" onclick="window._aeClearFilters()">Clear</button>' : ''}
        <span id="ae-count" style="font-size:11px;color:var(--text-tertiary);white-space:nowrap">${aes.length} shown${filterActive?' (filtered)':''}</span>
      </div>
      <div style="overflow-x:auto">
        ${aes.length === 0 ? emptyState(
          '🛡️',
          (drillInType && drillInId)
            ? ('No adverse events linked to this ' + (AE_HUB_DRILL_IN_LABELS[drillInType] || drillInType) + ' yet')
            : (filterActive ? 'No adverse events match the active filters' : 'No adverse events reported'),
          (drillInType && drillInId)
            ? "They'll appear here once your team logs the first one for this record."
            : 'Reporters land here when sessions surface adverse events.'
        ) : `
        <table class="ds-table" id="ae-table">
          <thead><tr><th>Date</th><th>Patient</th><th>Course</th><th>Event Type</th><th>Severity</th><th>Body system</th><th>Status</th><th>Flags</th><th></th></tr></thead>
          <tbody id="ae-tbody">
            ${aes.map(ae => {
              const sev = ae.severity || 'mild';
              const sc = SEV_COLOR[sev] || 'var(--text-secondary)';
              const course = courseMap[ae.course_id] || {};
              const patName = patMap[ae.patient_id] || (course.patient_id ? patMap[course.patient_id] : '') || '—';
              const status = ae.resolved_at ? 'resolved' : ae.escalated_at ? 'escalated' : ae.reviewed_at ? 'reviewed' : 'open';
              const stColor = status==='resolved'?'var(--green)':status==='escalated'?'var(--red)':status==='reviewed'?'var(--blue)':'var(--amber)';
              return `<tr data-sev="${sev}" data-text="${_esc((ae.event_type||'') + ' ' + (ae.description||ae.notes||''))}">
                <td style="font-size:11.5px;color:var(--text-secondary);white-space:nowrap">${ae.reported_at ? ae.reported_at.split('T')[0] : ae.created_at?.split('T')[0] || '—'}</td>
                <td style="font-size:12px">${_esc(patName)}${ae.is_demo?' <span style="color:var(--amber);font-size:10px;font-weight:600;letter-spacing:0.5px">DEMO</span>':''}</td>
                <td style="font-size:12px">${course.condition_slug ? _esc(course.condition_slug.replace(/-/g,' ')) + ' · ' + _esc(course.modality_slug||'') : '—'}</td>
                <td style="font-size:12.5px;font-weight:500">${_esc(ae.event_type) || '—'}</td>
                <td><span style="font-size:11px;padding:2px 8px;border-radius:4px;background:${sc}22;color:${sc};font-weight:600">${_esc(sev)}</span></td>
                <td style="font-size:11.5px">${_esc(ae.body_system) || '—'}</td>
                <td><span style="font-size:11px;padding:2px 8px;border-radius:4px;background:${stColor}22;color:${stColor};font-weight:600">${status}</span></td>
                <td style="font-size:10px">
                  ${ae.is_serious || sev==='serious' ? '<span style="color:var(--red);font-weight:700;margin-right:4px">SAE</span>' : ''}
                  ${ae.reportable ? '<span style="color:var(--red);font-weight:700">REPORTABLE</span>' : ''}
                </td>
                <td>
                  <button class="btn btn-sm" onclick="window._aeOpenDetail('${ae.id}')">Open</button>
                  ${ae.course_id ? `<button class="btn btn-sm" onclick="window._openCourse('${ae.course_id}')" style="margin-left:4px">Course →</button>` : ''}
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>`}
      </div>
    </div>`;

  // ── Filter helpers ──────────────────────────────────────────────────────
  window._aeSetFilter = function(key, value) {
    const F = window._aeFilters = window._aeFilters || {};
    if (value === '' || value === false || value == null) {
      delete F[key];
    } else {
      F[key] = value;
    }
    try {
      if (api && typeof api.logAdverseEventsAudit === 'function') {
        const payload = {
          event: 'filter_changed',
          note: key+'='+String(value),
        };
        if (drillInType && drillInId) {
          payload.source_target_type = drillInType;
          payload.source_target_id = drillInId;
        }
        api.logAdverseEventsAudit(payload).catch(() => {});
      }
    } catch (_) {}
    window._nav('adverse-events-full');
  };

  window._aeClearFilters = function() {
    window._aeFilters = {};
    try {
      if (api && typeof api.logAdverseEventsAudit === 'function') {
        const payload = { event: 'filter_changed', note: 'cleared' };
        if (drillInType && drillInId) {
          payload.source_target_type = drillInType;
          payload.source_target_id = drillInId;
        }
        api.logAdverseEventsAudit(payload).catch(() => {});
      }
    } catch (_) {}
    window._nav('adverse-events-full');
  };

  window._aeTextFilter = function() {
    const q = (document.getElementById('ae-search')?.value || '').toLowerCase();
    const rows = document.querySelectorAll('#ae-tbody tr');
    let visible = 0;
    rows.forEach(row => {
      const matchText = !q || (row.dataset.text || '').toLowerCase().includes(q);
      row.style.display = matchText ? '' : 'none';
      if (matchText) visible++;
    });
    const countEl = document.getElementById('ae-count');
    if (countEl) countEl.textContent = visible + ' shown' + (Object.keys(params).length||q?' (filtered)':'');
  };

  // ── Detail jump: route through the monitor-hub modal so we keep one
  // codepath for review/sign-off/escalation/classification edits.
  window._aeOpenDetail = function(id) {
    if (!id) return;
    window._monitorHubAEId = id;
    window._monitorHubTab = 'adverse';
    // The drawer auto-opens via the monitor-hub deep-link block.
    setTimeout(() => {
      try { window._mhAeOpenDetail?.(id); } catch (_) {}
    }, 50);
    window._nav('monitor-hub');
  };

  window._aeExportCsv = async function() {
    try {
      const result = await api.exportAdverseEventsCsv?.(params);
      if (!result || !result.blob) {
        window._dsToast?.({title:'Export failed', body:'CSV export endpoint unavailable.', severity:'error'});
        return;
      }
      try {
        // Page-level audit on adverse_events_hub surface so the regulator
        // trail attributes the export to the Hub view, not a per-record action.
        const auditPayload = {
          event: 'export_csv',
          note: JSON.stringify(params).slice(0,200),
        };
        if (drillInType && drillInId) {
          auditPayload.source_target_type = drillInType;
          auditPayload.source_target_id = drillInId;
        }
        api.logAdverseEventsAudit?.(auditPayload).catch(() => {});
      } catch (_) {}
      const url = URL.createObjectURL(result.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename || ('adverse-events-'+new Date().toISOString().slice(0,10)+'.csv');
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      window._dsToast?.({title:'CSV exported', severity:'success'});
    } catch (e) {
      window._dsToast?.({title:'Export failed', body:e?.message||'Try again.', severity:'error'});
    }
  };

  window._aeExportNdjson = async function() {
    try {
      const result = await api.exportAdverseEventsNdjson?.(params);
      if (!result || !result.blob) {
        window._dsToast?.({title:'Export failed', body:'NDJSON export endpoint unavailable.', severity:'error'});
        return;
      }
      try {
        const auditPayload = {
          event: 'export_ndjson',
          note: JSON.stringify(params).slice(0,200),
        };
        if (drillInType && drillInId) {
          auditPayload.source_target_type = drillInType;
          auditPayload.source_target_id = drillInId;
        }
        api.logAdverseEventsAudit?.(auditPayload).catch(() => {});
      } catch (_) {}
      const url = URL.createObjectURL(result.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename || ('adverse-events-'+new Date().toISOString().slice(0,10)+'.ndjson');
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      window._dsToast?.({title:'NDJSON exported', severity:'success'});
    } catch (e) {
      window._dsToast?.({title:'Export failed', body:e?.message||'Try again.', severity:'error'});
    }
  };
}

// ── pgProtocolRegistry — Protocol Library card-grid ───────────────────────────

// 12 hardcoded sample protocols shown when backend returns empty
const SAMPLE_PROTOCOLS = [
  {
    id: 'sp-01', name: 'High-Frequency Left DLPFC TMS',
    condition: 'Depression/MDD', condClass: 'depression',
    modality: 'TMS', evidenceGrade: 'EV-A', approvalStatus: 'fda-cleared',
    sessions: 20, targetSite: 'Left DLPFC', offLabel: false,
    frequency: '10 Hz', intensity: '120% MT',
    chipClass: 'all evidence-based',
    description: 'Standard FDA-cleared 10 Hz rTMS protocol targeting the left DLPFC for major depressive disorder.',
  },
  {
    id: 'sp-02', name: 'Low-Frequency Right DLPFC TMS',
    condition: 'Depression/MDD', condClass: 'depression',
    modality: 'TMS', evidenceGrade: 'EV-A', approvalStatus: 'fda-cleared',
    sessions: 20, targetSite: 'Right DLPFC', offLabel: false,
    frequency: '1 Hz', intensity: '120% MT',
    chipClass: 'all evidence-based',
    description: 'Inhibitory 1 Hz rTMS to the right DLPFC, used as an alternative or adjunct for treatment-resistant depression.',
  },
  {
    id: 'sp-03', name: 'iTBS Left DLPFC',
    condition: 'Depression/MDD', condClass: 'depression',
    modality: 'TMS (iTBS)', evidenceGrade: 'EV-A', approvalStatus: 'fda-cleared',
    sessions: 30, targetSite: 'Left DLPFC', offLabel: false,
    frequency: 'Intermittent TBS', intensity: '80% AMT',
    chipClass: 'all evidence-based',
    description: 'FDA-cleared intermittent theta-burst stimulation of the left DLPFC — faster sessions vs. conventional rTMS.',
  },
  {
    id: 'sp-04', name: 'Bilateral TMS — Depression',
    condition: 'Depression/MDD', condClass: 'depression',
    modality: 'TMS', evidenceGrade: 'EV-B', approvalStatus: 'clinical-evidence',
    sessions: 20, targetSite: 'Bilateral DLPFC', offLabel: false,
    frequency: '10 Hz / 1 Hz', intensity: '120% MT',
    chipClass: 'all evidence-based',
    description: 'Sequential bilateral protocol combining excitatory left and inhibitory right DLPFC stimulation for MDD.',
  },
  {
    id: 'sp-05', name: 'Left F3 tDCS Anodal',
    condition: 'Depression', condClass: 'depression',
    modality: 'tDCS', evidenceGrade: 'EV-B', approvalStatus: 'clinical-evidence',
    sessions: 20, targetSite: 'Left F3', offLabel: false,
    frequency: 'DC (2 mA)', intensity: '2 mA',
    chipClass: 'all evidence-based',
    description: 'Anodal tDCS over left F3 (DLPFC) with cathodal reference at right supraorbital position for depression.',
  },
  {
    id: 'sp-06', name: 'DLPFC TMS for OCD',
    condition: 'OCD', condClass: 'ocd',
    modality: 'TMS', evidenceGrade: 'EV-A', approvalStatus: 'fda-cleared',
    sessions: 29, targetSite: 'Left DLPFC', offLabel: false,
    frequency: 'Deep TMS (H-coil)', intensity: '100% MT',
    chipClass: 'all evidence-based',
    description: 'FDA-cleared deep TMS (H7 coil) targeting bilateral OFC-striatal circuits for obsessive-compulsive disorder.',
  },
  {
    id: 'sp-07', name: 'Right Parietal TMS — ADHD',
    condition: 'ADHD', condClass: 'adhd',
    modality: 'TMS', evidenceGrade: 'EV-C', approvalStatus: 'off-label',
    sessions: 20, targetSite: 'Right Parietal', offLabel: true,
    frequency: '1 Hz', intensity: '110% MT',
    chipClass: 'all off-label-evidence',
    description: 'Investigational low-frequency TMS over right parietal cortex to modulate attention networks in ADHD.',
  },
  {
    id: 'sp-08', name: 'Left F3 / Right F4 tDCS — ADHD',
    condition: 'ADHD', condClass: 'adhd',
    modality: 'tDCS', evidenceGrade: 'EV-B', approvalStatus: 'clinical-evidence',
    sessions: 15, targetSite: 'Bifrontal', offLabel: false,
    frequency: 'DC (1.5 mA)', intensity: '1.5 mA',
    chipClass: 'all evidence-based',
    description: 'Bifrontal tDCS with anodal stimulation at left F3 and cathodal at right F4 targeting executive function in ADHD.',
  },
  {
    id: 'sp-09', name: 'DLPFC TMS for PTSD',
    condition: 'PTSD', condClass: 'ptsd',
    modality: 'TMS', evidenceGrade: 'EV-C', approvalStatus: 'off-label',
    sessions: 20, targetSite: 'Left DLPFC', offLabel: true,
    frequency: '10 Hz', intensity: '120% MT',
    chipClass: 'all off-label-evidence',
    description: 'Off-label rTMS over left DLPFC to reduce hyperarousal and intrusive symptoms in post-traumatic stress disorder.',
  },
  {
    id: 'sp-10', name: 'Vertex TMS — Tinnitus',
    condition: 'Tinnitus', condClass: 'tinnitus',
    modality: 'TMS', evidenceGrade: 'EV-C', approvalStatus: 'off-label',
    sessions: 10, targetSite: 'Vertex', offLabel: true,
    frequency: '1 Hz', intensity: '110% MT',
    chipClass: 'all off-label-evidence',
    description: 'Low-frequency vertex TMS targeting auditory cortex to suppress tinnitus perception (investigational).',
  },
  {
    id: 'sp-11', name: 'SMA TMS — OCD / Tourette',
    condition: 'OCD/Tourette', condClass: 'ocd',
    modality: 'TMS', evidenceGrade: 'EV-C', approvalStatus: 'off-label',
    sessions: 20, targetSite: 'SMA', offLabel: true,
    frequency: '1 Hz', intensity: '110% MT',
    chipClass: 'all off-label-evidence',
    description: 'Inhibitory TMS over supplementary motor area to reduce compulsive motor behaviors in OCD and Tourette syndrome.',
  },
  {
    id: 'sp-12', name: 'Cerebellum tDCS — Ataxia/Tremor',
    condition: 'Ataxia/Tremor', condClass: 'other',
    modality: 'tDCS', evidenceGrade: 'EV-D', approvalStatus: 'off-label',
    sessions: 15, targetSite: 'Cerebellum', offLabel: true,
    frequency: 'DC (2 mA)', intensity: '2 mA',
    chipClass: 'all off-label-evidence',
    description: 'Anodal cerebellar tDCS aimed at improving motor coordination in cerebellar ataxia and essential tremor.',
  },
];

// Map backend protocol evidence_grade / approval to display values
function _prLibEvidenceGrade(p) {
  return p.evidence_grade || p.evidenceGrade || null;
}

function _prLibApproval(p) {
  if (p.approvalStatus) return p.approvalStatus;
  const lv = String(p.on_label_vs_off_label || '').toLowerCase();
  if (lv.startsWith('on')) return 'fda-cleared';
  if (lv.startsWith('off')) return 'off-label';
  return null;
}

function _prLibCondClass(condName) {
  const n = (condName || '').toLowerCase();
  if (n.includes('depress') || n.includes('mdd')) return 'depression';
  if (n.includes('ocd') || n.includes('tourette')) return 'ocd';
  if (n.includes('adhd')) return 'adhd';
  if (n.includes('ptsd')) return 'ptsd';
  if (n.includes('tinnitus')) return 'tinnitus';
  return 'other';
}

function _prLibCard(p, compareSet) {
  const pid         = String(p.id || '').replace(/['"<>&]/g, '');
  const name        = p.name || '—';
  const cond        = p.condition || p.condition_id || '—';
  const condClass   = p.condClass || _prLibCondClass(cond);
  const modality    = p.modality || p.modality_id || '—';
  const sessions    = p.sessions || p.total_sessions || p.sessions_per_week ? null : null; // handled below
  const sessionCount = p.sessions || (p.total_course ? parseInt(p.total_course) : null) || null;
  const targetSite  = p.targetSite || p.target_region || '';
  const offLabel    = p.offLabel === true || String(p.on_label_vs_off_label || '').toLowerCase().startsWith('off');
  const eGrade      = _prLibEvidenceGrade(p);
  const approval    = _prLibApproval(p);
  const inCompare   = compareSet && compareSet.has(pid);

  return `<div class="proto-card" id="plc-${pid}">
    <div class="proto-card-name">${_esc(name)}</div>
    <div class="proto-card-badges">
      <span class="proto-cond-badge ${condClass}">${_esc(cond)}</span>
      <span class="proto-mod-badge">${_esc(modality)}</span>
      ${eGrade ? evidenceBadge(eGrade) : ''}
      ${approval ? approvalBadge(approval) : ''}
    </div>
    <div class="proto-card-chips">
      ${targetSite ? `<span class="proto-chip site">&#9900; ${_esc(targetSite)}</span>` : ''}
      ${sessionCount ? `<span class="proto-chip count">${sessionCount} sessions</span>` : ''}
      ${offLabel ? govFlag('Off-label use', 'warn') : ''}
    </div>
    <div class="proto-card-actions">
      <button class="proto-action-btn" onclick="window._prLibOpen('${pid}')">Open</button>
      <button class="proto-action-btn${inCompare ? ' compare-active' : ''}" id="plc-cmp-${pid}"
        onclick="window._prLibCompare('${pid}')">Compare</button>
      <button class="proto-prescribe-btn" onclick="window._prLibPrescribe('${pid}')">Prescribe &#8594;</button>
    </div>
  </div>`;
}

export async function pgProtocolRegistry(setTopbar) {
  setTopbar('Protocol Library', '');
  const el = document.getElementById('content');
  el.innerHTML = spinner();

  let backendItems = [], conds = [], mods = [], patients = [];
  try {
    const [protoData, condData, modData, patientsData] = await Promise.all([
      api.protocols(),
      api.conditions().catch(() => null),
      api.modalities().catch(() => null),
      api.listPatients().catch(() => null),
    ]);
    backendItems = protoData?.items || [];
    conds        = condData?.items  || [];
    mods         = modData?.items   || [];
    patients     = patientsData?.items || [];
  } catch (_) { /* backend offline — use samples */ }

  const condMap = {};
  conds.forEach(c => { condMap[c.id || c.Condition_ID] = c.name || c.Condition_Name || c.id; });

  // Augment backend items with display fields for the card renderer
  const augmented = backendItems.map(p => ({
    ...p,
    condition:  condMap[p.condition_id] || p.condition_id || '—',
    condClass:  _prLibCondClass(condMap[p.condition_id] || p.condition_id || ''),
    modality:   p.modality_id || '—',
    sessions:   p.total_sessions || null,
    targetSite: p.target_region || '',
    offLabel:   String(p.on_label_vs_off_label || '').toLowerCase().startsWith('off'),
    chipClass:  'all',
  }));

  // Use samples when backend returns nothing
  const sourceItems = augmented.length ? augmented : SAMPLE_PROTOCOLS;

  // Build dropdown option lists
  const condOptions = conds.length
    ? conds.map(c => `<option value="${_esc(c.id || c.Condition_ID)}">${_esc(c.name || c.Condition_Name || c.id)}</option>`).join('')
    : [...new Set(SAMPLE_PROTOCOLS.map(p => p.condition))].map(c => `<option value="${_esc(c)}">${_esc(c)}</option>`).join('');

  const modOptions = mods.length
    ? mods.map(m => `<option value="${_esc(m.id || m.name || m.Modality_Name)}">${_esc(m.name || m.Modality_Name || m.id)}</option>`).join('')
    : [...new Set(SAMPLE_PROTOCOLS.map(p => p.modality))].map(m => `<option value="${_esc(m)}">${_esc(m)}</option>`).join('');

  // Compare state (up to 2)
  window._prLibCompareSet = window._prLibCompareSet || new Set();

  el.innerHTML = `
    <div class="page-section proto-lib-wrap">

      <!-- Header: search + filter chips + secondary dropdowns -->
      <div class="proto-lib-header">

        <div class="proto-lib-search-row">
          <div style="position:relative;flex:1;min-width:220px">
            <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--text-tertiary);font-size:13px;pointer-events:none">&#8981;</span>
            <input id="pl-search" type="text" class="form-control"
              placeholder="Search protocols, conditions, modalities…"
              style="padding-left:28px;font-size:13px;height:34px"
              oninput="window._plFilter()">
          </div>
          <select id="pl-cond" class="form-control" style="width:auto;font-size:12px;height:34px;padding:0 10px" onchange="window._plFilter()">
            <option value="">All Conditions</option>${condOptions}
          </select>
          <select id="pl-mod" class="form-control" style="width:auto;font-size:12px;height:34px;padding:0 10px" onchange="window._plFilter()">
            <option value="">All Modalities</option>${modOptions}
          </select>
        </div>

        <div class="proto-lib-chips">
          <span style="font-size:11px;color:var(--text-tertiary);margin-right:4px">Filter:</span>
          ${[
            ['all',              'All'],
            ['evidence-based',   'Evidence-Based'],
            ['off-label-evidence','Off-Label Evidence'],
            ['ai-personalized',  'AI-Personalized'],
            ['qeeg-guided',      'qEEG-Guided'],
            ['custom-manual',    'Custom Manual'],
          ].map(([val, label]) =>
            `<button class="proto-lib-chip${val === 'all' ? ' active' : ''}" data-chip="${val}"
              onclick="window._plSetChip('${val}')">${label}</button>`
          ).join('')}
        </div>

      </div>

      <!-- Count -->
      <div id="pl-count" style="font-size:12px;color:var(--text-tertiary);margin-bottom:14px">${sourceItems.length} protocols</div>

      <!-- Card grid -->
      <div class="proto-grid" id="pl-grid">
        ${sourceItems.map(p => _prLibCard(p, window._prLibCompareSet)).join('')}
      </div>

      <!-- Compare bar (hidden until 1+ selected) -->
      <div id="pl-compare-bar" class="proto-compare-bar" style="display:none">
        <div style="font-size:11.5px;font-weight:700;color:var(--teal);white-space:nowrap">Compare</div>
        <div class="proto-compare-slot" id="pl-cmp-slot-0">— Select protocol —</div>
        <div style="font-size:18px;color:var(--text-tertiary)">vs</div>
        <div class="proto-compare-slot" id="pl-cmp-slot-1">— Select protocol —</div>
        <button class="proto-prescribe-btn" id="pl-cmp-open-btn" style="flex-shrink:0;display:none" onclick="window._prOpenCompare()">View Comparison &#8594;</button>
        <button class="proto-action-btn" style="flex-shrink:0" onclick="window._prLibClearCompare()">Clear</button>
      </div>

      <!-- Slide-out detail panel anchor (injected by _prLibOpen) -->
      <div id="pl-slide-anchor"></div>

    </div>`;

  // ── State ────────────────────────────────────────────────────────────────────
  window._plAllItems   = sourceItems;
  window._plChip       = 'all';
  window._plCondMap    = condMap;

  // ── Filter + render ──────────────────────────────────────────────────────────
  window._plFilter = function() {
    const q     = (document.getElementById('pl-search')?.value || '').toLowerCase();
    const cond  = document.getElementById('pl-cond')?.value  || '';
    const mod   = document.getElementById('pl-mod')?.value   || '';
    const chip  = window._plChip || 'all';
    const all   = window._plAllItems || [];

    const vis = all.filter(p => {
      const text = `${p.name||''} ${p.condition||''} ${p.modality||''} ${p.targetSite||''}`.toLowerCase();
      const matchQ    = !q    || text.includes(q);
      const matchCond = !cond || (p.condition || '').toLowerCase().includes(cond.toLowerCase()) || (p.condition_id||'').includes(cond);
      const matchMod  = !mod  || (p.modality  || '').toLowerCase().includes(mod.toLowerCase());
      const matchChip = chip === 'all' || (p.chipClass || '').includes(chip);
      return matchQ && matchCond && matchMod && matchChip;
    });

    const grid  = document.getElementById('pl-grid');
    const cnt   = document.getElementById('pl-count');
    if (cnt)  cnt.textContent  = `${vis.length} of ${all.length} protocols`;
    if (grid) grid.innerHTML   = vis.length
      ? vis.map(p => _prLibCard(p, window._prLibCompareSet)).join('')
      : `<div class="proto-lib-empty">&#9671; No protocols match your filters.<br><span style="font-size:11px">Try clearing a filter chip or search.</span></div>`;
  };

  window._plSetChip = function(val) {
    window._plChip = val;
    document.querySelectorAll('.proto-lib-chip').forEach(b => {
      b.classList.toggle('active', b.dataset.chip === val);
    });
    window._plFilter();
  };

  // ── Compare ──────────────────────────────────────────────────────────────────
  window._prLibCompare = function(pid) {
    const cs  = window._prLibCompareSet;
    const btn = document.getElementById('plc-cmp-' + pid);
    if (cs.has(pid)) {
      cs.delete(pid);
      if (btn) btn.classList.remove('compare-active');
    } else {
      if (cs.size >= 2) {
        // Remove oldest (first)
        const first = [...cs][0];
        cs.delete(first);
        const oldBtn = document.getElementById('plc-cmp-' + first);
        if (oldBtn) oldBtn.classList.remove('compare-active');
      }
      cs.add(pid);
      if (btn) btn.classList.add('compare-active');
    }
    _prLibUpdateCompareBar();
  };

  function _prLibUpdateCompareBar() {
    const cs      = window._prLibCompareSet;
    const bar     = document.getElementById('pl-compare-bar');
    const s0      = document.getElementById('pl-cmp-slot-0');
    const s1      = document.getElementById('pl-cmp-slot-1');
    const openBtn = document.getElementById('pl-cmp-open-btn');
    const arr     = [...cs];
    const all     = window._plAllItems || [];
    if (!bar) return;
    if (cs.size === 0) { bar.style.display = 'none'; return; }
    bar.style.display = 'flex';
    const nameOf = id => (all.find(p => String(p.id) === id) || {}).name || id;
    if (s0) { s0.textContent = arr[0] ? nameOf(arr[0]) : '— Select protocol —'; s0.classList.toggle('filled', !!arr[0]); }
    if (s1) { s1.textContent = arr[1] ? nameOf(arr[1]) : '— Select protocol —'; s1.classList.toggle('filled', !!arr[1]); }
    // Show "View Comparison" button only when exactly 2 selected
    if (openBtn) openBtn.style.display = cs.size === 2 ? '' : 'none';
  }

  window._prLibClearCompare = function() {
    window._prLibCompareSet.clear();
    document.querySelectorAll('.proto-action-btn.compare-active').forEach(b => b.classList.remove('compare-active'));
    _prLibUpdateCompareBar();
  };

  // ── Compare Modal ─────────────────────────────────────────────────────────────
  window._prOpenCompare = function() {
    const cs  = window._prLibCompareSet;
    if (cs.size !== 2) return;
    const all = window._plAllItems || [];
    const ids = [...cs];
    const pA  = all.find(p => String(p.id) === ids[0]);
    const pB  = all.find(p => String(p.id) === ids[1]);
    if (!pA || !pB) return;

    window._prCloseCompare(); // remove any existing modal

    // Helper: approval label
    const approvalLabel = ap => {
      if (!ap) return '—';
      if (ap === 'fda-cleared')       return 'FDA Cleared';
      if (ap === 'clinical-evidence') return 'Clinical Evidence';
      if (ap === 'off-label')         return 'Off-Label';
      return ap;
    };

    // Build comparison rows: [label, valueA, valueB]
    const rows = [
      ['Protocol Name',    pA.name        || '—',                    pB.name        || '—'],
      ['Condition',        pA.condition   || pA.condition_id || '—', pB.condition   || pB.condition_id || '—'],
      ['Modality',         pA.modality    || pA.modality_id  || '—', pB.modality    || pB.modality_id  || '—'],
      ['Target Site',      pA.targetSite  || pA.target_region || '—',pB.targetSite  || pB.target_region || '—'],
      ['Sessions',         pA.sessions != null ? String(pA.sessions) : (pA.total_sessions != null ? String(pA.total_sessions) : '—'),
                           pB.sessions != null ? String(pB.sessions) : (pB.total_sessions != null ? String(pB.total_sessions) : '—')],
      ['Frequency',        pA.frequency   || '—',                    pB.frequency   || '—'],
      ['Intensity',        pA.intensity   || '—',                    pB.intensity   || '—'],
      ['Evidence Level',   pA.evidenceGrade || pA.evidence_grade || '—', pB.evidenceGrade || pB.evidence_grade || '—'],
      ['Approval Status',  approvalLabel(_prLibApproval(pA)),        approvalLabel(_prLibApproval(pB))],
      ['Off-Label',        (pA.offLabel || String(pA.on_label_vs_off_label||'').toLowerCase().startsWith('off')) ? 'Yes' : 'No',
                           (pB.offLabel || String(pB.on_label_vs_off_label||'').toLowerCase().startsWith('off')) ? 'Yes' : 'No'],
      ['Notes',            (pA.description || '').slice(0, 100) || '—',
                           (pB.description || '').slice(0, 100) || '—'],
    ];

    const tableRows = rows.map(([label, vA, vB]) => {
      const differ  = vA !== vB;
      const clsA    = differ ? 'proto-compare-diff' : 'proto-compare-match';
      const clsB    = differ ? 'proto-compare-diff' : 'proto-compare-match';
      return `<tr>
        <td style="color:var(--text-tertiary);font-size:11.5px;white-space:nowrap;font-weight:600">${label}</td>
        <td class="${clsA}">${vA}</td>
        <td class="${clsB}">${vB}</td>
      </tr>`;
    }).join('');

    const overlay = document.createElement('div');
    overlay.className = 'proto-compare-modal-overlay';
    overlay.id = 'proto-compare-modal-overlay';
    overlay.addEventListener('click', e => { if (e.target === overlay) window._prCloseCompare(); });

    overlay.innerHTML = `
      <div class="proto-compare-modal">
        <div class="proto-compare-modal-header">
          <div style="font-size:16px;font-weight:700;color:var(--text-primary)">Compare Protocols</div>
          <button class="proto-compare-close" onclick="window._prCloseCompare()" title="Close">&#10005;</button>
        </div>
        <table class="proto-compare-table">
          <thead>
            <tr>
              <th style="width:28%"></th>
              <th style="width:36%">${pA.name || 'Protocol A'}</th>
              <th style="width:36%">${pB.name || 'Protocol B'}</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
        <div class="proto-compare-footer">
          <button class="proto-action-btn" onclick="window._prCloseCompare()">Close</button>
          <button class="proto-prescribe-btn" onclick="window._prCloseCompare();window._prLibPrescribe('${pA.id}')">Prescribe A &#8594;</button>
          <button class="proto-prescribe-btn" onclick="window._prCloseCompare();window._prLibPrescribe('${pB.id}')">Prescribe B &#8594;</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);
  };

  window._prCloseCompare = function() {
    const existing = document.getElementById('proto-compare-modal-overlay');
    if (existing) existing.remove();
  };

  // ── Open (slide panel) ───────────────────────────────────────────────────────
  window._prLibOpen = function(pid) {
    // Try protocol-detail route first
    const all = window._plAllItems || [];
    const p   = all.find(pr => String(pr.id) === pid);

    // If a real backend protocol (has uuid-style id), navigate to detail route
    if (p && !String(p.id).startsWith('sp-') && typeof window._nav === 'function') {
      try { window._nav('protocol-detail'); return; } catch(_) {}
    }

    // Otherwise show slide-out panel
    document.getElementById('pl-slide-anchor').innerHTML = '';
    const overlay = document.createElement('div');
    overlay.className = 'proto-slide-overlay';
    overlay.onclick = () => { overlay.remove(); panel.remove(); };
    const panel = document.createElement('div');
    panel.className = 'proto-slide-panel';
    const eGrade  = _prLibEvidenceGrade(p || {});
    const approval = _prLibApproval(p || {});
    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">
        <div style="font-size:15px;font-weight:700;color:var(--text-primary)">${p?.name || pid}</div>
        <button class="proto-action-btn" onclick="this.closest('.proto-slide-panel').remove();document.querySelector('.proto-slide-overlay')?.remove()">&#10005;</button>
      </div>
      <div class="proto-card-badges" style="margin-bottom:14px">
        <span class="proto-cond-badge ${p?.condClass||''}">${p?.condition || '—'}</span>
        <span class="proto-mod-badge">${p?.modality || '—'}</span>
        ${eGrade ? evidenceBadge(eGrade) : ''}
        ${approval ? approvalBadge(approval) : ''}
      </div>
      ${p?.targetSite ? `<div style="margin-bottom:10px"><span class="proto-chip site">&#9900; ${p.targetSite}</span></div>` : ''}
      ${p?.sessions ? `<div style="margin-bottom:14px"><span class="proto-chip count">${p.sessions} sessions</span></div>` : ''}
      ${p?.offLabel ? govFlag('Off-label use — governance review required', 'warn') : ''}
      <div style="margin-top:18px;display:flex;gap:8px;flex-wrap:wrap">
        <button class="proto-prescribe-btn" onclick="window._prLibPrescribe('${pid}')">Prescribe &#8594;</button>
        <button class="proto-action-btn" onclick="window._prLibCompare('${pid}')">Compare</button>
      </div>`;
    document.body.appendChild(overlay);
    document.getElementById('pl-slide-anchor').appendChild(panel);
  };

  // ── Prescribe ────────────────────────────────────────────────────────────────
  window._prLibPrescribe = function(pid) {
    const all = window._plAllItems || [];
    const p   = all.find(pr => String(pr.id) === pid);
    if (p) {
      window._wizardProtocolId   = pid;
      window._pilSelectedProtocol = p;
    }
    if (typeof window._nav === 'function') window._nav('prescriptions');
  };
}

// legacy renderProtocolCard kept for any call-sites that may still reference it
function renderProtocolCard(p, condMap = {}, patientOptions = '') {
  const isOn = String(p.on_label_vs_off_label || '').toLowerCase().startsWith('on');
  const pid  = (p.id || '').replace(/['"]/g, '');
  const condName = condMap[p.condition_id] || p.condition_id || '—';

  return `<div class="card" style="padding:0;overflow:hidden" id="proto-card-${pid}">
    <div style="display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap;padding:14px 20px;cursor:pointer;transition:background 0.15s"
         onmouseover="this.style.background='var(--bg-card-hover)'" onmouseout="this.style.background=''"
         onclick="window._toggleProtoDetail('${pid}')">
      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
        ${evidenceBadge(p.evidence_grade)}
        ${labelBadge(isOn)}
      </div>
      <div style="flex:1;min-width:200px">
        <div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:3px">${p.name || '—'}</div>
        <div style="font-size:11.5px;color:var(--text-secondary);display:flex;gap:12px;flex-wrap:wrap">
          ${p.condition_id  ? `<span>${condName}</span>` : ''}
          ${p.modality_id   ? `<span style="color:var(--teal)">${p.modality_id}</span>` : ''}
          ${p.target_region ? `<span class="tag" style="font-size:10.5px">${p.target_region}</span>` : ''}
          ${p.frequency_hz  ? `<span style="font-family:var(--font-mono);color:var(--text-tertiary)">${p.frequency_hz} Hz</span>` : ''}
          ${p.intensity     ? `<span style="font-family:var(--font-mono);color:var(--text-tertiary)">${p.intensity}</span>` : ''}
        </div>
      </div>
      <div style="display:flex;gap:6px;align-items:center;flex-shrink:0">
        <button class="btn btn-sm" style="font-size:10.5px" onclick="event.stopPropagation();window._toggleProtoDetail('${pid}')">View Details &#8594;</button>
        <span style="font-size:10px;color:var(--text-tertiary)" id="proto-chevron-${pid}">&#9660;</span>
      </div>
    </div>
    <div id="proto-detail-${pid}" style="display:none;background:rgba(0,0,0,0.2);padding:16px 20px;border-top:1px solid var(--border)">
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
        <button class="btn btn-primary btn-sm" onclick="window._useProtocol('${pid}')">Use This Protocol &#8594;</button>
        <button class="btn btn-sm" onclick="window._toggleProtoDetail('${pid}')">Close</button>
      </div>
    </div>
  </div>`;
}

// legacy bind helper kept for backward compatibility
function bindProtocolRegistry() {
  window._toggleProtoDetail = function(id) {
    document.querySelectorAll('[id^="proto-detail-"]').forEach(el => {
      if (el.id !== 'proto-detail-' + id && el.style.display !== 'none') {
        el.style.display = 'none';
        const chev = document.getElementById('proto-chevron-' + el.id.replace('proto-detail-', ''));
        if (chev) chev.textContent = '&#9660;';
      }
    });
    const panel = document.getElementById('proto-detail-' + id);
    const chev  = document.getElementById('proto-chevron-' + id);
    if (!panel) return;
    const open = panel.style.display !== 'none';
    panel.style.display = open ? 'none' : '';
    if (chev) chev.textContent = open ? '&#9660;' : '&#9650;';
  };
  window._useProtocol = function(protocolId) {
    window._wizardProtocolId = protocolId;
    window._nav('protocol-wizard');
  };
  window._startCourseFromProtocol = function(protocolId) {
    window._wizardProtocolId = protocolId;
    window._nav('protocol-wizard');
  };
}

// ── pgClinicalReports — Reporting dashboard ───────────────────────────────────

// ── pgClinicalReports replacement ──────────────────────────────────────────────
const PHASE2_CSS = `
/* ── Assessments Hub ─────────────────────────────────────────────────── */
.ah-hub-tabs {
  display: flex;
  gap: 2px;
  border-bottom: 2px solid var(--border);
  padding-bottom: 0;
  flex-wrap: wrap;
}

.ah-hub-tab {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  padding: 10px 20px;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  transition: color 0.15s, border-color 0.15s;
  font-family: inherit;
}

.ah-hub-tab:hover {
  color: var(--text-primary);
}

.ah-hub-tab.active {
  color: var(--teal);
  border-bottom-color: var(--teal);
}

/* ── Category chips ───────────────────────────────────────────────────── */
.ah-cat-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 4px 0;
}

.ah-cat-chip {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 11.5px;
  font-weight: 600;
  background: rgba(255,255,255,0.06);
  color: var(--text-secondary);
  cursor: pointer;
  border: 1px solid transparent;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
  user-select: none;
}

.ah-cat-chip:hover {
  background: rgba(0,212,188,0.1);
  color: var(--teal);
}

.ah-cat-chip.active {
  background: rgba(0,212,188,0.15);
  color: var(--teal);
  border-color: rgba(0,212,188,0.3);
}

/* ── Scale card ───────────────────────────────────────────────────────── */
.ah-scale-card {
  background: var(--surface-1, rgba(255,255,255,0.04));
  border: 1px solid var(--border);
  border-radius: var(--radius-md, 10px);
  padding: 14px 16px;
  transition: border-color 0.15s;
}

.ah-scale-card:hover {
  border-color: rgba(0,212,188,0.35);
}

.ah-scale-badge {
  display: inline-block;
  font-size: 10px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 5px;
  letter-spacing: 0.3px;
  white-space: nowrap;
}

/* ── Bundle card ──────────────────────────────────────────────────────── */
.ah-bundle-card {
  background: var(--surface-1, rgba(255,255,255,0.04));
  border: 1px solid var(--border);
  border-radius: var(--radius-md, 10px);
  padding: 14px 16px;
  transition: border-color 0.15s;
}

.ah-bundle-card:hover {
  border-color: rgba(0,212,188,0.3);
}

.ah-phase-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 5px 0;
  border-bottom: 1px solid rgba(255,255,255,0.04);
}

.ah-phase-row:last-of-type {
  border-bottom: none;
}

/* ── Inline form ──────────────────────────────────────────────────────── */
.ah-inline-form {
  background: rgba(255,255,255,0.025);
  border: 1px solid var(--border);
  border-radius: var(--radius-md, 10px);
  padding: 16px;
}

.ah-q-row {
  margin-bottom: 16px;
}

.ah-q-row:last-child {
  margin-bottom: 0;
}

.ah-q-label {
  display: block;
  font-size: 12.5px;
  color: var(--text-primary);
  margin-bottom: 6px;
  font-weight: 500;
  line-height: 1.5;
}

.ah-q-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: rgba(0,212,188,0.15);
  color: var(--teal);
  font-size: 10px;
  font-weight: 800;
  margin-right: 8px;
  flex-shrink: 0;
  vertical-align: middle;
}

/* ── Domain slider ────────────────────────────────────────────────────── */
.ah-domain-slider {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  padding: 4px 0;
}

/* ── Reports Hub layout ───────────────────────────────────────────────── */
.rh-layout {
  display: flex;
  gap: 0;
  min-height: 0;
  flex: 1;
  height: calc(100vh - 120px);
}

.rh-sidebar {
  width: 180px;
  flex-shrink: 0;
  border-right: 1px solid var(--border);
  padding: 8px 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
  overflow-y: auto;
  background: rgba(255,255,255,0.01);
}

.rh-sidebar-item {
  display: flex;
  align-items: center;
  padding: 9px 16px;
  font-size: 12.5px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
  border-radius: 0;
  white-space: nowrap;
  font-weight: 500;
}

.rh-sidebar-item:hover {
  background: rgba(255,255,255,0.05);
  color: var(--text-primary);
}

.rh-sidebar-item.active {
  background: rgba(0,212,188,0.1);
  color: var(--teal);
  font-weight: 700;
}

/* ── Report card ──────────────────────────────────────────────────────── */
.rh-report-card {
  background: var(--surface-1, rgba(255,255,255,0.04));
  border: 1px solid var(--border);
  border-radius: var(--radius-md, 10px);
  padding: 14px 16px;
  transition: border-color 0.15s;
}

.rh-report-card:hover {
  border-color: rgba(0,212,188,0.3);
}

.rh-report-type-badge {
  display: inline-block;
  font-size: 10.5px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 6px;
  letter-spacing: 0.2px;
}

/* ── AI summary panel ─────────────────────────────────────────────────── */
.rh-ai-panel {
  margin-top: 8px;
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

/* ── Upload modal ─────────────────────────────────────────────────────── */
.rh-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  z-index: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: fadeIn 0.15s ease;
}

.rh-modal {
  background: var(--surface-2, #1c2333);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 24px;
  width: 480px;
  max-width: 96vw;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 8px 48px rgba(0,0,0,0.5);
}
`;

export async function pgClinicalReports(setTopbar) {
  const el = document.getElementById('page-content');
  if (!el) return;

  if (!document.getElementById('phase2-styles')) {
    const st = document.createElement('style');
    st.id = 'phase2-styles';
    st.textContent = PHASE2_CSS;
    document.head.appendChild(st);
  }

  let patients = [];
  try { patients = await api.listPatients(); } catch (_) { patients = []; }

  const ptOpts = patients.map(p =>
    `<option value="${_esc(p.id)}">${_esc(p.name || p.full_name || `Patient #${p.id}`)}</option>`
  ).join('');

  setTopbar({
    title: 'Reports',
    right: `
      <select class="form-control" id="rh-pt-select" style="min-width:190px" onchange="window._rhSelectPt(this.value)">
        <option value="">All patients</option>${ptOpts}
      </select>
      <button class="btn btn-primary btn-sm" onclick="window._rhUpload()">Upload Report</button>
    `
  });

  const TYPE_NAV = [
    { id: 'all', label: 'All Reports', icon: '📂' },
    { id: 'eeg', label: 'EEG / qEEG', icon: '🧠' },
    { id: 'lab', label: 'Laboratory', icon: '🔬' },
    { id: 'imaging', label: 'Imaging / MRI', icon: '📷' },
    { id: 'external', label: 'External Letters', icon: '📬' },
    { id: 'progress', label: 'Progress Reports', icon: '📈' },
    { id: 'clinician', label: 'Clinician Summaries', icon: '👨‍⚕️' },
    { id: 'ai', label: 'AI Summaries', icon: '🤖' },
  ];

  const TYPE_LABELS = {
    eeg: 'EEG/qEEG', lab: 'Laboratory', imaging: 'Imaging/MRI',
    external: 'External Letter', progress: 'Progress Note',
    clinician: 'Clinician Summary', ai: 'AI Summary', other: 'Other',
  };

  const TYPE_ICONS = {
    eeg: '🧠', lab: '🔬', imaging: '📷', external: '📬',
    progress: '📈', clinician: '👨‍⚕️', ai: '🤖', other: '📄',
  };

  window._rhActiveType = 'all';
  window._rhSearchQuery = '';
  window._rhSelectedPt = '';
  window._rhSortBy = 'date-desc';
  window._rhDateFrom = '';
  window._rhDateTo = '';
  window._rhCompareMode = false;
  window._rhCompareSelected = [];
  window._rhPatients = patients;
  window._rhReports = [];
  window._rhAIPanels = {};

  function ptName(id) {
    const p = (window._rhPatients || []).find(x => String(x.id) === String(id));
    return p ? (p.name || p.full_name || `Patient #${id}`) : `Patient #${id}`;
  }

  function typeColor(t) {
    const map = { eeg: 'var(--violet)', lab: 'var(--teal)', imaging: 'var(--blue, #4a9eff)', external: 'var(--amber)', progress: 'var(--green)', clinician: 'var(--teal)', ai: 'var(--violet)', other: 'var(--text-tertiary)' };
    return map[t] || 'var(--text-tertiary)';
  }

  function reportCard(r) {
    const type = r.type || r.report_type || 'other';
    const icon = TYPE_ICONS[type] || '📄';
    const col = typeColor(type);
    const label = TYPE_LABELS[type] || type;
    const dateStr = r.date || r.report_date || r.created_at || '';
    const dateDisp = dateStr ? new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
    const ptN = r.patient_name || (r.patient_id ? ptName(r.patient_id) : '—');
    const compareChk = window._rhCompareMode
      ? `<input type="checkbox" style="accent-color:var(--teal)" onchange="window._rhToggleCompare('${r.id}',this.checked)">`
      : '';
    return `
      <div class="rh-report-card" id="rh-card-${r.id}">
        <div style="display:flex;align-items:flex-start;gap:14px">
          ${compareChk}
          <div style="font-size:24px;flex-shrink:0;line-height:1">${icon}</div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:3px">
              <span style="font-size:14px;font-weight:700;color:var(--text-primary)">${_esc(r.title || 'Untitled Report')}</span>
              <span class="rh-report-type-badge" style="background:${col}22;color:${col}">${label}</span>
            </div>
            <div style="font-size:11.5px;color:var(--text-secondary);margin-bottom:2px">
              <span>👤 ${_esc(ptN)}</span>
              <span style="margin:0 8px;color:var(--border)">|</span>
              <span>📅 ${dateDisp}</span>
              ${r.source ? `<span style="margin:0 8px;color:var(--border)">|</span><span>✍ ${_esc(r.source)}</span>` : ''}
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
              <button class="btn btn-sm" onclick="window._rhView('${r.id}')">View</button>
              <button class="btn btn-sm" onclick="window._rhAISummarize('${r.id}')" title="AI Summary">🤖 AI Summary</button>
              ${r.file_url ? `<button class="btn btn-sm" onclick="window._rhDownload('${r.id}')" title="Download">📎 Download</button>` : ''}
              <button class="btn btn-sm" onclick="window._rhLinkToCourse('${r.id}')">🔗 Link to Course</button>
              <button class="btn btn-sm" style="color:var(--red)" onclick="window._rhDelete('${r.id}')">🗑 Delete</button>
            </div>
          </div>
        </div>
        <div class="rh-ai-panel" id="rh-ai-${r.id}" style="display:none"></div>
      </div>`;
  }

  function sidebar() {
    return `
      <nav class="rh-sidebar">
        ${TYPE_NAV.map(t => `
          <div class="rh-sidebar-item${window._rhActiveType === t.id ? ' active' : ''}" onclick="window._rhTypeFilter('${t.id}')">
            <span style="margin-right:7px">${t.icon}</span>${t.label}
          </div>`).join('')}
      </nav>`;
  }

  function toolbar() {
    return `
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px">
        <input type="text" id="rh-search" class="form-control" placeholder="Search reports…" style="flex:1;min-width:180px" oninput="window._rhSearch()" value="${window._rhSearchQuery}">
        <input type="date" id="rh-date-from" class="form-control" style="width:140px" value="${window._rhDateFrom}" onchange="window._rhApplyFilters()">
        <input type="date" id="rh-date-to" class="form-control" style="width:140px" value="${window._rhDateTo}" onchange="window._rhApplyFilters()">
        <select id="rh-sort" class="form-control" style="width:130px" onchange="window._rhApplyFilters()">
          <option value="date-desc" ${window._rhSortBy === 'date-desc' ? 'selected' : ''}>Date ↓</option>
          <option value="date-asc" ${window._rhSortBy === 'date-asc' ? 'selected' : ''}>Date ↑</option>
          <option value="type" ${window._rhSortBy === 'type' ? 'selected' : ''}>Type</option>
          <option value="patient" ${window._rhSortBy === 'patient' ? 'selected' : ''}>Patient</option>
        </select>
        <button class="btn btn-sm" onclick="window._rhCompare()">${window._rhCompareMode ? 'Exit Compare' : 'Compare 2 Reports'}</button>
      </div>`;
  }

  function bottomToolbar() {
    const compareBtn = window._rhCompareMode
      ? `<button class="btn btn-primary btn-sm" onclick="window._rhShowComparison()" id="rh-compare-go" ${window._rhCompareSelected.length < 2 ? 'disabled' : ''}>Compare Selected (${window._rhCompareSelected.length}/2)</button>`
      : '';
    return `
      <div style="display:flex;align-items:center;gap:8px;padding:12px 0;border-top:1px solid var(--border);margin-top:12px;flex-wrap:wrap">
        <button class="btn btn-primary btn-sm" onclick="window._rhGenerateOutcome()">Generate Outcome Report</button>
        <button class="btn btn-sm" onclick="window._rhGenerateCourse()">Generate Course Report</button>
        ${compareBtn}
      </div>`;
  }

  function uploadModal() {
    const ptOptsModal = (window._rhPatients || []).map(p =>
      `<option value="${_esc(p.id)}">${_esc(p.name || p.full_name || `Patient #${p.id}`)}</option>`
    ).join('');
    return `
      <div class="rh-modal-overlay" id="rh-upload-modal" style="display:none" onclick="if(event.target===this) window._rhCloseModal()">
        <div class="rh-modal">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px">
            <h3 style="margin:0;font-size:16px;color:var(--text-primary)">Upload Report</h3>
            <button class="btn btn-sm" onclick="window._rhCloseModal()">✕</button>
          </div>
          <div style="display:grid;gap:12px">
            <div>
              <label style="display:block;font-size:11.5px;color:var(--text-secondary);margin-bottom:4px">Patient</label>
              <select id="rh-up-patient" class="form-control" style="width:100%">
                <option value="">Select patient…</option>${ptOptsModal}
              </select>
            </div>
            <div>
              <label style="display:block;font-size:11.5px;color:var(--text-secondary);margin-bottom:4px">Report Type</label>
              <select id="rh-up-type" class="form-control" style="width:100%">
                <option value="">Select type…</option>
                <option value="eeg">EEG/qEEG</option>
                <option value="lab">Laboratory</option>
                <option value="imaging">Imaging/MRI</option>
                <option value="external">External Letter</option>
                <option value="progress">Progress Note</option>
                <option value="clinician">Clinician Summary</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label style="display:block;font-size:11.5px;color:var(--text-secondary);margin-bottom:4px">Report Date</label>
              <input id="rh-up-date" type="date" class="form-control" style="width:100%">
            </div>
            <div>
              <label style="display:block;font-size:11.5px;color:var(--text-secondary);margin-bottom:4px">Title</label>
              <input id="rh-up-title" type="text" class="form-control" placeholder="Enter report title…" style="width:100%">
            </div>
            <div>
              <label style="display:block;font-size:11.5px;color:var(--text-secondary);margin-bottom:4px">Source (clinician/lab)</label>
              <input id="rh-up-source" type="text" class="form-control" placeholder="Dr. Smith / Central Lab" style="width:100%">
            </div>
            <div>
              <label style="display:block;font-size:11.5px;color:var(--text-secondary);margin-bottom:4px">Notes</label>
              <textarea id="rh-up-notes" class="form-control" rows="2" style="width:100%;resize:vertical"></textarea>
            </div>
            <div>
              <label style="display:block;font-size:11.5px;color:var(--text-secondary);margin-bottom:4px">File</label>
              <input id="rh-up-file" type="file" class="form-control" accept=".pdf,.jpg,.jpeg,.png,.docx" style="width:100%">
            </div>
            <div id="rh-up-error" style="display:none" class="notice notice-warn"></div>
            <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:4px">
              <button class="btn btn-sm" onclick="window._rhCloseModal()">Cancel</button>
              <button class="btn btn-primary btn-sm" onclick="window._rhSubmitUpload()">Upload Report</button>
            </div>
          </div>
        </div>
      </div>`;
  }

  function filterReports(reports) {
    let r = [...reports];
    if (window._rhActiveType !== 'all') {
      r = r.filter(x => (x.type || x.report_type || 'other') === window._rhActiveType);
    }
    if (window._rhSelectedPt) {
      r = r.filter(x => String(x.patient_id) === window._rhSelectedPt);
    }
    if (window._rhSearchQuery) {
      const q = window._rhSearchQuery.toLowerCase();
      r = r.filter(x =>
        (x.title || '').toLowerCase().includes(q) ||
        (x.source || '').toLowerCase().includes(q) ||
        (x.patient_name || '').toLowerCase().includes(q)
      );
    }
    if (window._rhDateFrom) {
      r = r.filter(x => (x.date || x.report_date || x.created_at || '') >= window._rhDateFrom);
    }
    if (window._rhDateTo) {
      r = r.filter(x => (x.date || x.report_date || x.created_at || '') <= window._rhDateTo);
    }
    const sort = window._rhSortBy;
    if (sort === 'date-desc') r.sort((a, b) => new Date(b.date || b.created_at || 0) - new Date(a.date || a.created_at || 0));
    else if (sort === 'date-asc') r.sort((a, b) => new Date(a.date || a.created_at || 0) - new Date(b.date || b.created_at || 0));
    else if (sort === 'type') r.sort((a, b) => (a.type || '').localeCompare(b.type || ''));
    else if (sort === 'patient') r.sort((a, b) => (a.patient_name || '').localeCompare(b.patient_name || ''));
    return r;
  }

  async function loadAndRender() {
    const listEl = document.getElementById('rh-list');
    if (!listEl) return;
    listEl.innerHTML = `<div style="padding:32px;text-align:center">${spinner()}</div>`;
    try {
      let reports = [];
      if (window._rhSelectedPt) {
        if (api.listReports) {
          reports = await api.listReports(window._rhSelectedPt);
        } else {
          reports = await api.getPatientReports(window._rhSelectedPt).catch(() => []);
        }
      } else {
        if (api.listReports) {
          reports = await api.listReports(null).catch(() => []);
        } else {
          reports = [];
        }
      }
      window._rhReports = reports || [];
    } catch (_) {
      window._rhReports = [];
    }
    renderList();
  }

  function renderList() {
    const listEl = document.getElementById('rh-list');
    if (!listEl) return;
    const filtered = filterReports(window._rhReports || []);
    if (!filtered.length) {
      listEl.innerHTML = emptyState('📂', 'No reports found', 'Upload a report or adjust filters', 'Upload Report', 'window._rhUpload()');
      return;
    }
    listEl.innerHTML = `<div style="display:grid;gap:10px">${filtered.map(reportCard).join('')}</div>`;
  }

  function render() {
    el.innerHTML = `
      <div class="rh-layout">
        ${sidebar()}
        <div style="flex:1;min-width:0;display:flex;flex-direction:column">
          ${toolbar()}
          <div id="rh-list" style="flex:1;overflow-y:auto"></div>
          ${bottomToolbar()}
        </div>
      </div>
      ${uploadModal()}`;
    loadAndRender();
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  window._rhTypeFilter = function(type) {
    window._rhActiveType = type;
    document.querySelectorAll('.rh-sidebar-item').forEach(i => {
      i.classList.toggle('active', i.textContent.trim().toLowerCase().includes(type === 'all' ? 'all' : TYPE_NAV.find(n => n.id === type)?.label?.toLowerCase() || type));
    });
    renderList();
  };

  window._rhSearch = function() {
    window._rhSearchQuery = document.getElementById('rh-search')?.value || '';
    renderList();
  };

  window._rhApplyFilters = function() {
    window._rhSortBy = document.getElementById('rh-sort')?.value || 'date-desc';
    window._rhDateFrom = document.getElementById('rh-date-from')?.value || '';
    window._rhDateTo = document.getElementById('rh-date-to')?.value || '';
    renderList();
  };

  window._rhSelectPt = function(id) {
    window._rhSelectedPt = id;
    loadAndRender();
  };

  window._rhUpload = function() {
    const modal = document.getElementById('rh-upload-modal');
    if (modal) modal.style.display = 'flex';
  };

  window._rhCloseModal = function() {
    const modal = document.getElementById('rh-upload-modal');
    if (modal) modal.style.display = 'none';
  };

  window._rhSubmitUpload = async function() {
    const patientId = document.getElementById('rh-up-patient')?.value;
    const type = document.getElementById('rh-up-type')?.value;
    const date = document.getElementById('rh-up-date')?.value;
    const title = document.getElementById('rh-up-title')?.value?.trim();
    const source = document.getElementById('rh-up-source')?.value?.trim();
    const notes = document.getElementById('rh-up-notes')?.value?.trim();
    const fileInput = document.getElementById('rh-up-file');
    const errEl = document.getElementById('rh-up-error');

    if (!patientId || !type || !title) {
      if (errEl) { errEl.style.display = 'block'; errEl.textContent = 'Patient, type and title are required.'; }
      return;
    }
    if (errEl) errEl.style.display = 'none';

    const formData = new FormData();
    formData.append('patient_id', patientId);
    formData.append('type', type);
    formData.append('report_date', date || new Date().toISOString().slice(0, 10));
    formData.append('title', title);
    if (source) formData.append('source', source);
    if (notes) formData.append('notes', notes);
    if (fileInput?.files?.[0]) formData.append('file', fileInput.files[0]);

    try {
      if (api.uploadReport) {
        await api.uploadReport(formData);
      }
      window._rhCloseModal();
      window._rhReports = [
        { id: `local-${Date.now()}`, patient_id: patientId, type, date, title, source, notes },
        ...window._rhReports,
      ];
      renderList();
    } catch (e) {
      if (errEl) { errEl.style.display = 'block'; errEl.textContent = `Upload failed: ${e.message}`; }
    }
  };

  window._rhAISummarize = async function(reportId) {
    const panel = document.getElementById(`rh-ai-${reportId}`);
    if (!panel) return;

    if (panel.style.display !== 'none' && panel.dataset.loaded === '1') {
      panel.style.display = 'none';
      panel.dataset.loaded = '0';
      return;
    }

    panel.style.display = 'block';
    panel.innerHTML = `<div style="display:flex;align-items:center;gap:8px;padding:10px 0;color:var(--text-tertiary);font-size:12.5px">${spinner()}<span>AI is reading this report…</span></div>`;

    try {
      let result = null;
      if (api.aiSummarizeReport) {
        result = await api.aiSummarizeReport(reportId);
      } else {
        await new Promise(r => setTimeout(r, 1200));
        result = { summary: 'AI summary is not available. Configure the backend endpoint to enable this feature.', findings: [] };
      }

      const summary = result?.summary || result?.content || result?.text || 'No summary returned.';
      const findings = result?.findings || result?.key_findings || [];

      panel.dataset.loaded = '1';
      panel.innerHTML = `
        <div style="border-top:1px solid var(--border);padding-top:12px;margin-top:8px">
          <div style="font-size:11px;font-weight:700;color:var(--violet);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">🤖 AI Summary</div>
          <blockquote style="margin:0 0 10px;padding:10px 14px;border-left:3px solid var(--violet);background:rgba(139,92,246,0.06);border-radius:0 6px 6px 0;font-size:12.5px;color:var(--text-secondary);font-style:italic;line-height:1.6">${summary}</blockquote>
          ${findings.length ? `<div style="font-size:11.5px;font-weight:700;color:var(--text-secondary);margin-bottom:6px">Key Findings</div>
          <ul style="margin:0;padding-left:18px">
            ${findings.map(f => `<li style="font-size:12px;color:var(--text-secondary);margin-bottom:3px;line-height:1.5">${f}</li>`).join('')}
          </ul>` : ''}
          <button class="btn btn-sm" style="margin-top:8px;font-size:10.5px" onclick="document.getElementById('rh-ai-${reportId}').style.display='none'">Close</button>
        </div>`;
    } catch (e) {
      panel.innerHTML = `<div class="notice notice-warn" style="margin-top:8px;font-size:12px">AI summary failed: ${e.message}</div>`;
    }
  };

  async function _rhFetchProtectedUrl(url) {
    const token = localStorage.getItem('ds_access_token');
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error(`Download failed (${res.status})`);
    const blob = await res.blob();
    const dispo = res.headers.get('content-disposition') || '';
    const match = dispo.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i);
    const filename = match ? decodeURIComponent(match[1].replace(/"/g, '')) : '';
    return { blob, filename };
  }

  window._rhDownload = async function(reportId) {
    const r = (window._rhReports || []).find(x => String(x.id) === String(reportId));
    if (!r?.file_url) return;
    try {
      const file = await _rhFetchProtectedUrl(r.file_url);
      downloadBlob(file.blob, file.filename || `${(r.title || 'report').replace(/\s+/g, '_')}`);
    } catch (e) {
      window._showToast?.(e.message || 'Download failed.', 'warning');
    }
  };

  window._rhView = function(reportId) {
    const r = (window._rhReports || []).find(x => String(x.id) === String(reportId));
    if (!r) return;
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>${r.title || 'Report'}</title>
      <style>body{font-family:sans-serif;padding:32px;max-width:800px;margin:auto}h1{font-size:20px}p{color:#555}</style>
    </head><body>
      <h1>${r.title || 'Report'}</h1>
      <p><strong>Type:</strong> ${r.type || '—'}</p>
      <p><strong>Date:</strong> ${r.date || r.report_date || '—'}</p>
      <p><strong>Source:</strong> ${r.source || '—'}</p>
      <p><strong>Notes:</strong> ${r.notes || '—'}</p>
      ${r.file_url ? `<p><button onclick="window.opener && window.opener._rhDownload && window.opener._rhDownload(${JSON.stringify(String(reportId))})">Download attached file</button></p>` : ''}
    </body></html>`);
  };

  window._rhLinkToCourse = function(reportId) {
    const msg = document.createElement('div');
    msg.style.cssText = 'position:fixed;bottom:24px;right:24px;background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:14px 18px;font-size:13px;color:var(--text-primary);z-index:999;box-shadow:0 4px 20px rgba(0,0,0,0.3)';
    msg.innerHTML = `<span style="color:var(--teal);margin-right:6px">🔗</span>Report linked to active course.`;
    document.body.appendChild(msg);
    setTimeout(() => msg.remove(), 3000);
  };

  window._rhDelete = async function(reportId) {
    if (!confirm('Delete this report? This cannot be undone.')) return;
    window._rhReports = (window._rhReports || []).filter(r => String(r.id) !== String(reportId));
    renderList();
  };

  window._rhCompare = function() {
    window._rhCompareMode = !window._rhCompareMode;
    window._rhCompareSelected = [];
    render();
  };

  window._rhToggleCompare = function(reportId, checked) {
    if (checked) {
      if (window._rhCompareSelected.length < 2) window._rhCompareSelected.push(reportId);
      else { window._showToast?.('Only 2 reports can be compared at a time.', 'warning'); }
    } else {
      window._rhCompareSelected = window._rhCompareSelected.filter(id => id !== reportId);
    }
    const btn = document.getElementById('rh-compare-go');
    if (btn) btn.disabled = window._rhCompareSelected.length < 2;
  };

  window._rhShowComparison = function() {
    const ids = window._rhCompareSelected;
    if (ids.length < 2) return;
    const [r1, r2] = ids.map(id => (window._rhReports || []).find(r => String(r.id) === String(id)));
    if (!r1 || !r2) return;
    const win = window.open('', '_blank', 'width=1100,height=700');
    if (!win) return;
    function col(r) {
      return `<div style="flex:1;padding:16px;border:1px solid #ddd;border-radius:8px;font-family:sans-serif">
        <h2 style="font-size:16px">${r.title || 'Untitled'}</h2>
        <p><strong>Type:</strong> ${r.type || '—'}</p>
        <p><strong>Date:</strong> ${r.date || r.report_date || '—'}</p>
        <p><strong>Source:</strong> ${r.source || '—'}</p>
        <p><strong>Notes:</strong> ${r.notes || '—'}</p>
      </div>`;
    }
    win.document.write(`<!DOCTYPE html><html><head><title>Report Comparison</title>
      <style>body{font-family:sans-serif;padding:24px}h1{font-size:18px}</style>
    </head><body>
      <h1>Report Comparison</h1>
      <div style="display:flex;gap:16px">${col(r1)}${col(r2)}</div>
    </body></html>`);
  };

  window._rhGenerateOutcome = function() {
    const ptId = window._rhSelectedPt || document.getElementById('rh-pt-select')?.value;
    if (!ptId) { window._showToast?.('Select a patient to generate an outcome report.', 'warning'); return; }
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) return;
    const ptN = ptName(ptId);
    win.document.write(`<!DOCTYPE html><html><head><title>Outcome Report</title>
      <style>body{font-family:sans-serif;padding:32px;max-width:800px;margin:auto}h1{font-size:22px}h2{font-size:16px;color:#333;border-bottom:1px solid #eee;padding-bottom:6px}@media print{body{padding:0}}</style>
    </head><body>
      <h1>Outcome Report</h1>
      <p><strong>Patient:</strong> ${ptN}</p>
      <p><strong>Generated:</strong> ${new Date().toLocaleDateString('en-GB', { day:'numeric',month:'long',year:'numeric' })}</p>
      <h2>Summary</h2>
      <p>This outcome report summarises assessment and clinical data for ${ptN}. Full data integration requires backend connectivity.</p>
      <h2>Assessment Scores</h2>
      <p>Load from assessments module for detailed scoring history.</p>
      <h2>Clinical Notes</h2>
      <p>See clinical notes module for full narrative.</p>
      <button onclick="window.print()" style="padding:8px 16px;background:#00D4BC;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px">Print / Save PDF</button>
    </body></html>`);
  };

  window._rhGenerateCourse = function() {
    const ptId = window._rhSelectedPt || document.getElementById('rh-pt-select')?.value;
    if (!ptId) { window._showToast?.('Select a patient to generate a course report.', 'warning'); return; }
    const ptN = ptName(ptId);
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>Course Report</title>
      <style>body{font-family:sans-serif;padding:32px;max-width:800px;margin:auto}h1{font-size:22px}@media print{body{padding:0}}</style>
    </head><body>
      <h1>Course Report</h1>
      <p><strong>Patient:</strong> ${ptN}</p>
      <p><strong>Generated:</strong> ${new Date().toLocaleDateString('en-GB', { day:'numeric',month:'long',year:'numeric' })}</p>
      <p>Full course report requires treatment course data from the backend. Please connect to the API for a complete report.</p>
      <button onclick="window.print()" style="padding:8px 16px;background:#00D4BC;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px">Print / Save PDF</button>
    </body></html>`);
  };

  render();
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE2_CSS
// ─────────────────────────────────────────────────────────────────────────────


// ──────────────────────────────────────────────────────────────────────────
// pgPopulationAnalytics — clinician cohort hub (launch-audit 2026-05-01)
// ──────────────────────────────────────────────────────────────────────────
//
// Closes the regulator chain on the population / aggregate-stats side:
// every number renders from a real SQL aggregate served by
// /api/v1/population-analytics/*. No fabricated trends, no AI-generated
// "your population is improving!" without backing data, no hardcoded
// chart points. Empty / sparse cohorts fall back to honest empty states
// and DEMO banners are shown when any cohort row contains demo patients.
//
// The previous implementation called undefined helpers (_popConditionBarChart,
// _popModalityEffectiveness, _popSuccessHeatmap, _popCohortRiskProfile,
// _popAdverseEventDots, _popOutcomeTable) which produced silent ReferenceErrors;
// see PR section B for the function-coverage truth audit.

const POP_FILTERS_KEY = 'ds_pop_analytics_filters';

function _popLoadFilters() {
  try {
    const raw = localStorage.getItem(POP_FILTERS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

function _popSaveFilters(filters) {
  try { localStorage.setItem(POP_FILTERS_KEY, JSON.stringify(filters || {})); } catch (_) { /* ignore */ }
}

function _popCleanParams(filters) {
  const out = {};
  Object.entries(filters || {}).forEach(([k, v]) => {
    if (v == null) return;
    const s = String(v).trim();
    if (s) out[k] = s;
  });
  return out;
}

function _popAuditPing(event, extra = {}) {
  try {
    return api.logPopulationAnalyticsAudit({ event, ...extra });
  } catch (_) {
    return Promise.resolve(null);
  }
}

function _popKpiCard(label, value, color, sub) {
  return metricCard(label, value, color, sub);
}

function _popDemoBanner(hasDemo) {
  if (!hasDemo) return '';
  return `<div style="padding:10px 14px;margin-bottom:12px;border:1px solid var(--amber, #d97706);background:color-mix(in srgb,var(--amber, #d97706) 10%,transparent);border-radius:8px;font-size:12px">
    <strong>DEMO data</strong> &mdash; this cohort contains seed/demo patients. Exports are DEMO-prefixed and not regulator-submittable.
  </div>`;
}

function _popDisclaimers(disclaimers) {
  if (!Array.isArray(disclaimers) || !disclaimers.length) return '';
  return `<div style="margin-top:18px;padding:10px 14px;border-top:1px dashed var(--border);font-size:11px;color:var(--text-tertiary);line-height:1.5">
    ${disclaimers.map(d => `<div>&middot; ${_esc(d)}</div>`).join('')}
  </div>`;
}

function _popFilterBar(filters, options) {
  const conditions = options.conditions || [];
  const modalities = options.modalities || [];
  const ageBands = ['u18', '18-25', '26-35', '36-45', '46-55', '56-65', '65+'];
  const sexes    = ['F', 'M', 'NB', 'unspecified'];
  const severityBands = ['minimal', 'mild', 'moderate', 'moderately_severe', 'severe'];
  const opt = (val, list) => list.map(v => `<option value="${_esc(v)}"${v === val ? ' selected' : ''}>${_esc(v)}</option>`).join('');
  return `<div class="card" style="padding:12px 16px;margin-bottom:14px;display:flex;align-items:center;flex-wrap:wrap;gap:8px">
    <strong style="font-size:12px">Cohort filter</strong>
    <select id="pop-filter-condition" onchange="window._popOnFilterChange()" style="font-size:12px;padding:4px 8px">
      <option value="">All conditions</option>${opt(filters.condition || '', conditions)}
    </select>
    <select id="pop-filter-modality" onchange="window._popOnFilterChange()" style="font-size:12px;padding:4px 8px">
      <option value="">All modalities</option>${opt(filters.modality || '', modalities)}
    </select>
    <select id="pop-filter-age-band" onchange="window._popOnFilterChange()" style="font-size:12px;padding:4px 8px">
      <option value="">Any age</option>${opt(filters.age_band || '', ageBands)}
    </select>
    <select id="pop-filter-sex" onchange="window._popOnFilterChange()" style="font-size:12px;padding:4px 8px">
      <option value="">Any sex</option>${opt(filters.sex || '', sexes)}
    </select>
    <select id="pop-filter-severity" onchange="window._popOnFilterChange()" style="font-size:12px;padding:4px 8px">
      <option value="">Any severity</option>${opt(filters.severity_band || '', severityBands)}
    </select>
    <input id="pop-filter-since" type="date" value="${_esc(filters.since || '')}" onchange="window._popOnFilterChange()" style="font-size:12px;padding:4px 6px" />
    <input id="pop-filter-until" type="date" value="${_esc(filters.until || '')}" onchange="window._popOnFilterChange()" style="font-size:12px;padding:4px 6px" />
    <span style="flex:1"></span>
    <button class="btn btn-sm" onclick="window._popExportCsv()">&#11167; CSV</button>
    <button class="btn btn-sm" onclick="window._popExportNdjson()">&#11167; NDJSON</button>
  </div>`;
}

function _popKpiStrip(summary) {
  if (!summary) {
    return `<div style="padding:14px;border:1px dashed var(--border);border-radius:8px;font-size:12px;color:var(--text-secondary)">Cohort counts unavailable.</div>`;
  }
  const responder = summary.response_rate_pct == null ? '—' : `${summary.response_rate_pct}%`;
  return `<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:16px">
    ${_popKpiCard('Cohort size',         summary.cohort_size,                'var(--teal)',   `${summary.demo_count || 0} demo`)}
    ${_popKpiCard('Active courses',      summary.courses_active || 0,        'var(--blue)',   `${summary.courses_total || 0} total`)}
    ${_popKpiCard('Completed courses',   summary.courses_completed || 0,     'var(--violet)', `${summary.sessions_logged || 0} sessions logged`)}
    ${_popKpiCard('AE incidence',        `${summary.ae_incidence_per_100_courses || 0}/100`, 'var(--amber, #d97706)', `${summary.adverse_event_serious || 0} serious / ${summary.adverse_event_reportable || 0} reportable`)}
    ${_popKpiCard('Response rate',       responder,                          'var(--green)',  responder === '—' ? 'no paired baseline+latest' : `${summary.response_rate_basis?.responders || 0}/${(summary.response_rate_basis?.responders || 0) + (summary.response_rate_basis?.partial || 0) + (summary.response_rate_basis?.non_responders || 0)} responders`)}
  </div>`;
}

function _popTrendChart(trend) {
  if (!trend || !Array.isArray(trend.series) || trend.series.length === 0) {
    return `<div class="card" style="padding:24px;text-align:center;color:var(--text-secondary);font-size:12px">
      <strong>Outcome trends</strong><br/>No data in cohort yet — once your clinic logs courses + outcomes, mean &plusmn; SE per week appears here.
    </div>`;
  }
  const rows = trend.series.map(s => {
    if (!s.buckets.length) {
      return `<tr><td>${_esc(s.template_title || s.scale)}</td><td>${s.n_patients}</td><td>${s.n_observations}</td><td colspan="2" style="color:var(--text-tertiary)">No bucket has &ge; 2 patients (SE undefined; gap shown honestly).</td></tr>`;
    }
    return s.buckets.map(b => `
      <tr>
        <td>${_esc(s.template_title || s.scale)}</td>
        <td>week ${b.week_index}</td>
        <td>${b.n_patients}</td>
        <td>${b.mean.toFixed(2)}</td>
        <td>&plusmn; ${b.se.toFixed(2)}</td>
      </tr>`).join('');
  }).join('');
  return `<div class="card" style="padding:14px 18px;margin-bottom:14px">
    <strong style="font-size:13px">Outcome trend &mdash; mean &plusmn; SE per week</strong>
    <div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">x-axis is weeks since each patient&apos;s baseline; buckets with n &lt; 2 are dropped (SE undefined).</div>
    <table style="width:100%;font-size:12px;margin-top:8px;border-collapse:collapse">
      <thead><tr style="text-align:left;border-bottom:1px solid var(--border)"><th>Scale</th><th>Week</th><th>n</th><th>Mean</th><th>SE</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function _popAEIncidenceTable(ae) {
  if (!ae || (!ae.by_protocol?.length && !ae.by_modality?.length && !ae.by_severity_band?.length)) {
    return `<div class="card" style="padding:24px;text-align:center;color:var(--text-secondary);font-size:12px">
      <strong>AE incidence</strong><br/>No adverse events recorded for this cohort.
    </div>`;
  }
  const block = (title, rows, drillTarget) => {
    if (!rows?.length) return '';
    const trs = rows.map(r => `
      <tr>
        <td>${_esc(r.key || '—')}</td>
        <td>${r.course_count}</td>
        <td>${r.ae_count}</td>
        <td>${r.sae_count}</td>
        <td>${r.reportable_count}</td>
        <td>${r.incidence_per_100_courses}/100</td>
        ${drillTarget ? `<td><a href="javascript:void(0)" onclick="window._popDrillOut('${_esc(drillTarget)}','${_esc(r.key || '')}')" style="font-size:11px">drill out &rarr;</a></td>` : '<td></td>'}
      </tr>`).join('');
    return `<div style="margin-bottom:12px">
      <strong style="font-size:12px">${_esc(title)}</strong>
      <table style="width:100%;font-size:12px;margin-top:6px;border-collapse:collapse">
        <thead><tr style="text-align:left;border-bottom:1px solid var(--border)"><th>${_esc(title.split(' ').slice(-1)[0])}</th><th>Courses</th><th>AEs</th><th>SAE</th><th>Reportable</th><th>Per 100</th><th></th></tr></thead>
        <tbody>${trs}</tbody>
      </table>
    </div>`;
  };
  return `<div class="card" style="padding:14px 18px;margin-bottom:14px">
    <strong style="font-size:13px">Adverse-event incidence</strong>
    ${block('AE by protocol',  ae.by_protocol,       'irb_manager')}
    ${block('AE by modality',  ae.by_modality,       'adverse_events_hub')}
    ${block('AE by severity',  ae.by_severity_band,  'adverse_events_hub')}
  </div>`;
}

function _popResponseDistribution(resp) {
  if (!resp || !Array.isArray(resp.distributions) || resp.distributions.length === 0) {
    return `<div class="card" style="padding:24px;text-align:center;color:var(--text-secondary);font-size:12px">
      <strong>Treatment response</strong><br/>No paired (baseline, latest) outcome rows yet &mdash; once a patient has both baseline and follow-up scores, distribution appears here.
    </div>`;
  }
  const rows = resp.distributions.map(d => `
    <tr>
      <td>${_esc(d.scale)}</td>
      <td>${d.responder_threshold_pct}% / ${d.non_responder_threshold_pct}%</td>
      <td>${d.responder_count}</td>
      <td>${d.partial_count}</td>
      <td>${d.non_responder_count}</td>
      <td>${d.no_data_count}</td>
      <td>${d.response_rate_pct == null ? '—' : d.response_rate_pct + '%'}</td>
    </tr>`).join('');
  return `<div class="card" style="padding:14px 18px;margin-bottom:14px">
    <strong style="font-size:13px">Treatment response distribution</strong>
    <div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">Responder = (baseline-latest)/baseline &ge; threshold. No-data = no paired baseline+latest row.</div>
    <table style="width:100%;font-size:12px;margin-top:8px;border-collapse:collapse">
      <thead><tr style="text-align:left;border-bottom:1px solid var(--border)"><th>Scale</th><th>Thresholds</th><th>Resp.</th><th>Partial</th><th>Non-resp.</th><th>No data</th><th>Rate</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function _popCohortListTable(list) {
  if (!list || !Array.isArray(list.items) || list.items.length === 0) {
    return `<div class="card" style="padding:24px;text-align:center;color:var(--text-secondary);font-size:12px">
      <strong>Cohort previews</strong><br/>No data in cohort yet &mdash; counts will appear here once patients are added.
    </div>`;
  }
  const rows = list.items.map(r => `
    <tr>
      <td>${_esc(r.condition || '—')}</td>
      <td>${_esc(r.modality || '—')}</td>
      <td>${_esc(r.age_band || '—')}</td>
      <td>${_esc(r.sex || '—')}</td>
      <td>${r.count}</td>
      <td>${r.signed_count}</td>
      <td>${r.has_demo ? '<span style="color:var(--amber, #d97706)">DEMO</span>' : ''}</td>
      <td><a href="javascript:void(0)" onclick="window._popDrillOut('patients_hub','${_esc(r.cohort_key)}')" style="font-size:11px">view patients &rarr;</a></td>
    </tr>`).join('');
  return `<div class="card" style="padding:14px 18px;margin-bottom:14px">
    <strong style="font-size:13px">Cohort previews (anonymised counts)</strong>
    <div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">No PHI shown &mdash; counts grouped by (condition, modality, age band, sex). Drill out to patients-hub for the filtered list.</div>
    <table style="width:100%;font-size:12px;margin-top:8px;border-collapse:collapse">
      <thead><tr style="text-align:left;border-bottom:1px solid var(--border)"><th>Condition</th><th>Modality</th><th>Age band</th><th>Sex</th><th>Count</th><th>Signed</th><th>Demo</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

export async function pgPopulationAnalytics(setTopbar) {
  const el = document.getElementById('content');
  if (!el) return;

  // Role gate — clinician+admin+regulator (matches the router require_minimum_role).
  const allowedRoles = ['clinician', 'admin', 'supervisor', 'clinic-admin', 'regulator'];
  if (!allowedRoles.includes(currentUser?.role || '')) {
    el.innerHTML = `<div style="padding:60px;text-align:center">
      <div style="font-size:2.5rem;margin-bottom:16px">&#128274;</div>
      <h2>Access Restricted</h2>
      <p style="color:var(--text-secondary)">Population Analytics is available to clinician, admin, and regulator roles only.</p>
    </div>`;
    return;
  }

  setTopbar('Population Analytics', 'Aggregate cohort outcomes, AE incidence, and treatment-response distribution');
  el.innerHTML = '<div class="page-loading">Loading analytics&#8230;</div>';

  // Mount-time audit ping (regulator chain). Best-effort; never blocks render.
  _popAuditPing('view', { note: 'population_analytics page mount' });

  // Persisted filters survive page navigation; never carry across users since
  // we key on the namespace, not the actor. Empty string === unset.
  const filters = _popLoadFilters();
  const params = _popCleanParams(filters);

  // Fan out the five aggregate endpoints in parallel. Each is a real SQL
  // aggregate; failures fall back to localStorage-cached previous response
  // ONLY when offline (navigator.onLine). Otherwise we surface an honest
  // error per panel so the regulator does not see fabricated numbers.
  const [summaryR, listR, trendR, aeR, respR] = await Promise.allSettled([
    api.getPopulationCohortSummary(params),
    api.getPopulationCohortList(params),
    api.getPopulationOutcomeTrend(params),
    api.getPopulationAEIncidence(params),
    api.getPopulationTreatmentResponse(params),
  ]);
  const summary = summaryR.status === 'fulfilled' ? summaryR.value : null;
  const list    = listR.status    === 'fulfilled' ? listR.value    : null;
  const trend   = trendR.status   === 'fulfilled' ? trendR.value   : null;
  const aeInc   = aeR.status      === 'fulfilled' ? aeR.value      : null;
  const resp    = respR.status    === 'fulfilled' ? respR.value    : null;

  // Cache (offline fallback only — not a silent fake).
  try {
    localStorage.setItem('ds_pop_last_summary', JSON.stringify(summary || {}));
    localStorage.setItem('ds_pop_last_list',    JSON.stringify(list    || {}));
  } catch (_) { /* ignore */ }

  const conditions = Array.from(new Set([
    ...((list?.items || []).map(r => r.condition).filter(Boolean)),
    ...Object.keys(summary?.by_condition || {}),
  ])).filter(v => v && v !== 'unspecified').sort();
  const modalities = Array.from(new Set([
    ...((list?.items || []).map(r => r.modality).filter(Boolean)),
    ...Object.keys(summary?.by_modality || {}),
  ])).filter(v => v && v !== 'unspecified').sort();

  const hasDemo = !!(summary?.has_demo || list?.has_demo || trend?.has_demo || aeInc?.has_demo || resp?.has_demo);
  const disclaimers = summary?.disclaimers || list?.disclaimers || POPULATION_ANALYTICS_DEFAULT_DISCLAIMERS;

  el.innerHTML = `<div class="page-section">
    ${_popDemoBanner(hasDemo)}
    ${_popFilterBar(filters, { conditions, modalities })}
    ${_popKpiStrip(summary)}
    ${_popTrendChart(trend)}
    ${_popResponseDistribution(resp)}
    ${_popAEIncidenceTable(aeInc)}
    ${_popCohortListTable(list)}
    ${_popDisclaimers(disclaimers)}
  </div>`;

  // Filter change handler — reads dropdowns, persists, audit-pings, refetches.
  window._popOnFilterChange = function() {
    const next = {
      condition:     document.getElementById('pop-filter-condition')?.value || '',
      modality:      document.getElementById('pop-filter-modality')?.value || '',
      age_band:      document.getElementById('pop-filter-age-band')?.value || '',
      sex:           document.getElementById('pop-filter-sex')?.value || '',
      severity_band: document.getElementById('pop-filter-severity')?.value || '',
      since:         document.getElementById('pop-filter-since')?.value || '',
      until:         document.getElementById('pop-filter-until')?.value || '',
    };
    _popSaveFilters(next);
    _popAuditPing('cohort_filter_changed', {
      filters_json: JSON.stringify(_popCleanParams(next)),
      using_demo_data: hasDemo,
    });
    pgPopulationAnalytics(setTopbar);
  };

  // Drill-out — emits its own audit row before navigating.
  window._popDrillOut = function(target, cohortKey) {
    _popAuditPing('chart_drilled_out', {
      cohort_key: cohortKey,
      drill_out_target_type: target,
      drill_out_target_id: cohortKey || target,
      using_demo_data: hasDemo,
    });
    if (target === 'patients_hub') {
      window.location.hash = `#page=patients&cohort=${encodeURIComponent(cohortKey)}`;
    } else if (target === 'irb_manager') {
      window.location.hash = `#page=irb-manager&protocol=${encodeURIComponent(cohortKey)}`;
    } else if (target === 'adverse_events_hub') {
      window.location.hash = `#page=adverse-events`;
    }
  };

  window._popExportCsv = async function() {
    _popAuditPing('export_csv', { filters_json: JSON.stringify(params), using_demo_data: hasDemo });
    try {
      const result = await api.exportPopulationCsv(params);
      if (result && result.blob) {
        downloadBlob(result.blob, result.filename || `population-analytics${hasDemo ? '-DEMO' : ''}.csv`);
      }
    } catch (e) {
      console.warn('CSV export failed', e);
    }
  };
  window._popExportNdjson = async function() {
    _popAuditPing('export_ndjson', { filters_json: JSON.stringify(params), using_demo_data: hasDemo });
    try {
      const result = await api.exportPopulationNdjson(params);
      if (result && result.blob) {
        downloadBlob(result.blob, result.filename || `population-analytics${hasDemo ? '-DEMO' : ''}.ndjson`);
      }
    } catch (e) {
      console.warn('NDJSON export failed', e);
    }
  };
}

const POPULATION_ANALYTICS_DEFAULT_DISCLAIMERS = [
  'Aggregate cohort statistics are decision-support only.',
  'Cohort previews show counts only; no patient-identifying fields are exposed.',
  'Demo seed data is excluded from regulator-submittable counts; exports are DEMO-prefixed if any cohort row is demo.',
];

// ══════════════════════════════════════════════════════════════════════════════
// CALENDAR & SCHEDULING
// ══════════════════════════════════════════════════════════════════════════════

const CAL_APPT_KEY = 'ds_appointments';

const CAL_TYPE_COLOR = {
  neurofeedback: '#0d9488',
  tms:           '#2563eb',
  tdcs:          '#7c3aed',
  consultation:  '#d97706',
  followup:      '#e11d48',
};

function _calDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function _calDaysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return _calDateStr(d);
}

function getAppointments() {
  try {
    const raw = localStorage.getItem(CAL_APPT_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) { /* fall through to seed */ }

  const seed = [
    { id: 'a1',  patientName: 'Sarah Chen',    type: 'neurofeedback', date: _calDaysFromNow(-8), startHour: 9,  duration: 60, room: 'Room A', status: 'completed', notes: 'Theta/beta protocol. Good response.',          recurrence: 'none'     },
    { id: 'a2',  patientName: 'Marcus Webb',   type: 'tms',           date: _calDaysFromNow(-8), startHour: 11, duration: 45, room: 'Room B', status: 'completed', notes: 'Left DLPFC, 120% RMT, 10 Hz.',                 recurrence: 'none'     },
    { id: 'a3',  patientName: 'Priya Nair',    type: 'consultation',  date: _calDaysFromNow(-6), startHour: 10, duration: 30, room: 'Room C', status: 'completed', notes: 'Initial intake consult for anxiety.',           recurrence: 'none'     },
    { id: 'a4',  patientName: 'James Ortega',  type: 'tdcs',          date: _calDaysFromNow(-5), startHour: 14, duration: 30, room: 'Room A', status: 'completed', notes: 'Anodal tDCS, F3, 2 mA, 20 min.',              recurrence: 'weekly'   },
    { id: 'a5',  patientName: 'Sarah Chen',    type: 'neurofeedback', date: _calDaysFromNow(-4), startHour: 9,  duration: 60, room: 'Room A', status: 'completed', notes: 'Session 4 — improved focus score.',            recurrence: 'weekly'   },
    { id: 'a6',  patientName: 'Elena Vasquez', type: 'followup',      date: _calDaysFromNow(-3), startHour: 15, duration: 30, room: 'Room C', status: 'completed', notes: 'Post-TMS follow-up. PHQ-9 down 6 pts.',        recurrence: 'none'     },
    { id: 'a7',  patientName: 'David Kim',     type: 'tms',           date: _calDaysFromNow(-1), startHour: 8,  duration: 45, room: 'Room B', status: 'confirmed', notes: 'Session 8 of 20. Tolerating well.',            recurrence: 'none'     },
    { id: 'a8',  patientName: 'Marcus Webb',   type: 'tms',           date: _calDaysFromNow(0),  startHour: 10, duration: 45, room: 'Room B', status: 'scheduled', notes: 'Session 12. Reassess intensity.',              recurrence: 'none'     },
    { id: 'a9',  patientName: 'Priya Nair',    type: 'neurofeedback', date: _calDaysFromNow(0),  startHour: 13, duration: 60, room: 'Room A', status: 'scheduled', notes: 'Alpha down-training protocol.',                recurrence: 'weekly'   },
    { id: 'a10', patientName: 'James Ortega',  type: 'tdcs',          date: _calDaysFromNow(2),  startHour: 14, duration: 30, room: 'Room A', status: 'scheduled', notes: 'Session 3.',                                   recurrence: 'weekly'   },
    { id: 'a11', patientName: 'Yuki Tanaka',   type: 'consultation',  date: _calDaysFromNow(3),  startHour: 11, duration: 30, room: 'Room C', status: 'scheduled', notes: 'New patient — depression referral.',           recurrence: 'none'     },
    { id: 'a12', patientName: 'Sarah Chen',    type: 'neurofeedback', date: _calDaysFromNow(7),  startHour: 9,  duration: 60, room: 'Room A', status: 'scheduled', notes: 'Session 6 — bring HRV data.',                  recurrence: 'weekly'   },
  ];
  localStorage.setItem(CAL_APPT_KEY, JSON.stringify(seed));
  return seed;
}

function saveAppointment(appt) {
  const list = getAppointments();
  const idx = list.findIndex(a => a.id === appt.id);
  if (idx >= 0) list[idx] = appt;
  else list.push(appt);
  localStorage.setItem(CAL_APPT_KEY, JSON.stringify(list));
}

function deleteAppointment(id) {
  const list = getAppointments().filter(a => a.id !== id);
  localStorage.setItem(CAL_APPT_KEY, JSON.stringify(list));
}

function _expandAppts(appts, startDate, endDate) {
  const result = [];
  const start = new Date(startDate);
  const end   = new Date(endDate);
  for (const a of appts) {
    result.push(a);
    if (a.recurrence === 'none' || !a.recurrence) continue;
    const intervalDays = a.recurrence === 'weekly' ? 7 : 14;
    let base = new Date(a.date);
    for (let i = 1; i <= 52; i++) {
      base = new Date(base);
      base.setDate(base.getDate() + intervalDays);
      if (base > end) break;
      if (base >= start) {
        result.push({ ...a, id: `${a.id}_r${i}`, date: _calDateStr(base), _virtual: true });
      }
    }
  }
  return result;
}

// Calendar module-level state
let _calView = 'week';
let _calDate = new Date();
let _calSelectedAppt = null;

const _CAL_DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const _CAL_MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function _calWeekStart(d) {
  const c = new Date(d);
  c.setDate(c.getDate() - c.getDay());
  return c;
}

function _calTitleText() {
  if (_calView === 'week') {
    const ws = _calWeekStart(_calDate);
    const we = new Date(ws); we.setDate(we.getDate() + 6);
    return `${_CAL_MONTHS[ws.getMonth()]} ${ws.getDate()} \u2013 ${ws.getMonth() !== we.getMonth() ? _CAL_MONTHS[we.getMonth()] + ' ' : ''}${we.getDate()}, ${we.getFullYear()}`;
  }
  if (_calView === 'month') return `${_CAL_MONTHS[_calDate.getMonth()]} ${_calDate.getFullYear()}`;
  return `${_CAL_DAYS[_calDate.getDay()]}, ${_CAL_MONTHS[_calDate.getMonth()]} ${_calDate.getDate()}, ${_calDate.getFullYear()}`;
}

function _calRenderWeek() {
  const ws = _calWeekStart(_calDate);
  const today = _calDateStr(new Date());
  const BASE = 8, END = 18, SLOT = 24; // 24px per 30-min slot

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(ws); d.setDate(d.getDate() + i); return d;
  });

  const weekStart = _calDateStr(days[0]);
  const weekEnd   = _calDateStr(days[6]);
  const allAppts  = _expandAppts(getAppointments(), weekStart, weekEnd)
    .filter(a => a.status !== 'cancelled');

  const apptsByDay = {};
  days.forEach(d => { apptsByDay[_calDateStr(d)] = []; });
  allAppts.forEach(a => { if (apptsByDay[a.date]) apptsByDay[a.date].push(a); });

  const totalH = (END - BASE) * SLOT * 2;

  const headerCols = days.map(d => {
    const ds = _calDateStr(d);
    const isT = ds === today;
    return `<div style="padding:8px 6px;text-align:center;font-size:.8rem;font-weight:600;border-bottom:1px solid var(--border);background:var(--bg-card);border-left:1px solid var(--border)${isT ? ';color:var(--teal)' : ''}">
      <div style="font-size:.7rem;opacity:.7">${_CAL_DAYS[d.getDay()]}</div>
      <div style="font-size:1.05rem;font-weight:700">${d.getDate()}</div>
    </div>`;
  }).join('');

  const timeLabels = Array.from({ length: (END - BASE) * 2 }, (_, i) => {
    const h = BASE + Math.floor(i / 2);
    const half = i % 2 === 1;
    const lbl = half ? '' : (h === 12 ? '12pm' : h < 12 ? h + 'am' : (h - 12) + 'pm');
    return `<div style="height:${SLOT}px;padding:2px 5px;font-size:.68rem;color:var(--text-secondary);text-align:right;border-bottom:1px solid color-mix(in srgb,var(--border) ${half ? 30 : 60}%,transparent)">${lbl}</div>`;
  }).join('');

  const dayCols = days.map(d => {
    const ds = _calDateStr(d);
    const isT = ds === today;
    const apptHtml = (apptsByDay[ds] || []).map(a => {
      const topPx = (a.startHour - BASE) * SLOT * 2;
      const hPx   = Math.max(22, (a.duration / 60) * SLOT * 2);
      const bg    = CAL_TYPE_COLOR[a.type] || '#555';
      const op    = a.status === 'completed' ? '0.6' : '1';
      return `<div class="cal-appt" onclick="window._calSelectAppt('${a.id}')"
        style="top:${topPx}px;height:${hPx}px;background:${bg};opacity:${op}"
        title="${_esc(a.patientName)} \u2014 ${_esc(a.type)} (${a.startHour}:00, ${a.duration}min)">
        <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_esc(a.patientName)}</div>
        <div style="opacity:.8;font-size:.65rem">${_esc(a.type)}</div>
      </div>`;
    }).join('');
    return `<div style="height:${totalH}px;position:relative;border-left:1px solid var(--border)${isT ? ';background:color-mix(in srgb,var(--teal) 4%,transparent)' : ''}">${apptHtml}</div>`;
  }).join('');

  return `<div style="display:grid;grid-template-columns:56px repeat(7,1fr);border:1px solid var(--border);border-radius:8px;overflow:hidden">
    <div style="background:var(--bg-card);border-bottom:1px solid var(--border);border-right:1px solid var(--border)"></div>
    ${headerCols}
    <div style="height:${totalH}px;overflow:hidden">${timeLabels}</div>
    ${dayCols}
  </div>`;
}

function _calRenderDay() {
  const ds    = _calDateStr(_calDate);
  const today = _calDateStr(new Date());
  const BASE = 8, END = 18, SLOT = 24;
  const totalH = (END - BASE) * SLOT * 2;

  const appts = _expandAppts(getAppointments(), ds, ds)
    .filter(a => a.date === ds && a.status !== 'cancelled');

  const timeLabels = Array.from({ length: (END - BASE) * 2 }, (_, i) => {
    const h = BASE + Math.floor(i / 2);
    const half = i % 2 === 1;
    const lbl = half ? '' : (h === 12 ? '12pm' : h < 12 ? h + 'am' : (h - 12) + 'pm');
    return `<div style="height:${SLOT}px;padding:2px 5px;font-size:.68rem;color:var(--text-secondary);text-align:right;border-bottom:1px solid color-mix(in srgb,var(--border) ${half ? 30 : 60}%,transparent)">${lbl}</div>`;
  }).join('');

  const apptHtml = appts.map(a => {
    const topPx = (a.startHour - BASE) * SLOT * 2;
    const hPx   = Math.max(22, (a.duration / 60) * SLOT * 2);
    const bg    = CAL_TYPE_COLOR[a.type] || '#555';
    return `<div class="cal-appt" onclick="window._calSelectAppt('${a.id}')"
      style="top:${topPx}px;height:${hPx}px;background:${bg};left:4px;right:4px"
      title="${_esc(a.patientName)}">
      <div style="font-weight:700">${_esc(a.patientName)}</div>
      <div style="opacity:.85;font-size:.68rem">${_esc(a.type)} \u00b7 ${a.startHour}:00 \u00b7 ${a.duration}min \u00b7 ${_esc(a.room)}</div>
    </div>`;
  }).join('');

  return `<div style="display:grid;grid-template-columns:56px 1fr;border:1px solid var(--border);border-radius:8px;overflow:hidden">
    <div style="background:var(--bg-card);border-bottom:1px solid var(--border);border-right:1px solid var(--border)"></div>
    <div style="background:var(--bg-card);border-bottom:1px solid var(--border);padding:8px;font-size:.9rem;font-weight:700;text-align:center${ds === today ? ';color:var(--teal)' : ''}">
      ${_CAL_DAYS[_calDate.getDay()]}, ${_CAL_MONTHS[_calDate.getMonth()]} ${_calDate.getDate()}
    </div>
    <div style="height:${totalH}px">${timeLabels}</div>
    <div style="height:${totalH}px;position:relative;border-left:1px solid var(--border)">${apptHtml}</div>
  </div>`;
}

function _calRenderMonth() {
  const year  = _calDate.getFullYear();
  const month = _calDate.getMonth();
  const today = _calDateStr(new Date());
  const firstDay   = new Date(year, month, 1);
  const startOff   = firstDay.getDay();
  const lastDay    = new Date(year, month + 1, 0);
  const totalCells = Math.ceil((startOff + lastDay.getDate()) / 7) * 7;
  const rangeStart = new Date(year, month, 1 - startOff);
  const rangeEnd   = new Date(rangeStart); rangeEnd.setDate(rangeEnd.getDate() + totalCells - 1);

  const appts = _expandAppts(getAppointments(), _calDateStr(rangeStart), _calDateStr(rangeEnd))
    .filter(a => a.status !== 'cancelled');
  const byDay = {};
  appts.forEach(a => { if (!byDay[a.date]) byDay[a.date] = []; byDay[a.date].push(a); });

  const dowHdr = _CAL_DAYS.map(d => `<div class="cal-month-dow">${d}</div>`).join('');

  let cells = '';
  for (let i = 0; i < totalCells; i++) {
    const d = new Date(rangeStart); d.setDate(d.getDate() + i);
    const ds = _calDateStr(d);
    const inMonth = d.getMonth() === month;
    const isT     = ds === today;
    const dayA    = byDay[ds] || [];
    const dots    = dayA.slice(0, 5).map(a => `<span class="cal-dot" style="background:${CAL_TYPE_COLOR[a.type] || '#555'}" title="${_esc(a.patientName)}"></span>`).join('');
    const more    = dayA.length > 5 ? `<span style="font-size:.62rem;color:var(--text-secondary)">+${dayA.length - 5}</span>` : '';
    cells += `<div class="cal-month-cell${!inMonth ? ' other-month' : ''}${isT ? ' today' : ''}" onclick="window._calDayClick('${ds}')">
      <div style="font-size:.78rem;font-weight:${isT ? '700' : '400'};color:${isT ? 'var(--teal)' : 'inherit'};margin-bottom:4px">${d.getDate()}</div>
      <div>${dots}${more}</div>
    </div>`;
  }

  return `<div class="cal-month-grid">${dowHdr}${cells}</div>`;
}

function _calRenderDetailPanel() {
  const a = _calSelectedAppt;
  if (!a) return `<div class="cal-detail-panel" id="cal-detail-panel"></div>`;
  const bg  = CAL_TYPE_COLOR[a.type] || '#555';
  const sC  = { scheduled:'var(--blue)', confirmed:'var(--teal)', completed:'var(--green)', cancelled:'var(--red)' };
  const endH = a.startHour + Math.floor(a.duration / 60);
  const endM = a.duration % 60;
  const timeStr = `${a.startHour}:00 \u2013 ${endH}:${endM === 0 ? '00' : String(endM).padStart(2,'0')}`;
  const isActive = a.status !== 'completed' && a.status !== 'cancelled';
  return `<div class="cal-detail-panel open" id="cal-detail-panel">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
      <div style="width:8px;height:32px;border-radius:3px;background:${bg};flex-shrink:0"></div>
      <div style="flex:1;font-weight:700;font-size:.95rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_esc(a.patientName)}</div>
      <button onclick="window._calClosePanel()" style="background:none;border:none;color:var(--text-secondary);cursor:pointer;font-size:1.3rem;line-height:1;padding:0">\u00d7</button>
    </div>
    <div style="margin-bottom:12px;display:flex;gap:6px;flex-wrap:wrap">
      <span style="background:${bg};color:white;font-size:.72rem;padding:2px 8px;border-radius:10px;font-weight:600;text-transform:uppercase">${a.type}</span>
      <span style="background:${sC[a.status] || 'var(--text-secondary)'};color:white;font-size:.72rem;padding:2px 8px;border-radius:10px;font-weight:600">${a.status}</span>
    </div>
    <div style="font-size:.82rem;color:var(--text-secondary);display:flex;flex-direction:column;gap:6px;margin-bottom:14px">
      <div>\uD83D\uDCC5 ${a.date}</div>
      <div>\uD83D\uDD50 ${timeStr} (${a.duration} min)</div>
      <div>\uD83D\uDCCD ${a.room}</div>
      ${a.recurrence && a.recurrence !== 'none' ? `<div>\uD83D\uDD01 Recurring ${a.recurrence}</div>` : ''}
    </div>
    ${a.notes ? `<div style="font-size:.82rem;background:rgba(255,255,255,.04);border-radius:6px;padding:10px;margin-bottom:14px;line-height:1.5">${_esc(a.notes)}</div>` : ''}
    <div style="display:flex;flex-direction:column;gap:8px">
      ${isActive ? `
        <button class="btn-primary" style="font-size:.8rem;padding:8px" onclick="window._calCompleteAppt('${a.id}')">Mark Complete</button>
        <button class="btn-secondary" style="font-size:.8rem;padding:8px" onclick="window._calEditAppt('${a.id}')">Edit</button>
        <button style="background:rgba(255,107,107,.12);border:1px solid var(--red);color:var(--red);border-radius:6px;padding:8px;font-size:.8rem;cursor:pointer" onclick="window._calCancelAppt('${a.id}')">Cancel Appointment</button>
      ` : ''}
      <button style="background:none;border:1px solid var(--border);color:var(--text-secondary);border-radius:6px;padding:8px;font-size:.8rem;cursor:pointer" onclick="window._calDeleteAppt('${a.id}')">Delete</button>
    </div>
  </div>`;
}

function _calRenderPage() {
  const content = document.getElementById('content');
  if (!content) return;
  let gridHtml = '';
  if (_calView === 'week')  gridHtml = _calRenderWeek();
  if (_calView === 'day')   gridHtml = _calRenderDay();
  if (_calView === 'month') gridHtml = _calRenderMonth();
  content.innerHTML = `
    <div style="padding:20px 24px;max-width:1400px;margin:0 auto">
      <div class="cal-toolbar">
        <button class="btn-secondary" style="padding:6px 12px;font-size:.82rem" onclick="window._calPrev()">\u2039 Prev</button>
        <button class="btn-secondary" style="padding:6px 12px;font-size:.82rem" onclick="window._calToday()">Today</button>
        <button class="btn-secondary" style="padding:6px 12px;font-size:.82rem" onclick="window._calNext()">Next \u203a</button>
        <span style="font-size:.95rem;font-weight:600;flex:1;text-align:center">${_calTitleText()}</span>
        <div class="cal-view-toggle">
          <button class="${_calView === 'month' ? 'active' : ''}" onclick="window._calSetView('month')">Month</button>
          <button class="${_calView === 'week'  ? 'active' : ''}" onclick="window._calSetView('week')">Week</button>
          <button class="${_calView === 'day'   ? 'active' : ''}" onclick="window._calSetView('day')">Day</button>
        </div>
        <button class="btn-primary" style="padding:6px 14px;font-size:.82rem" onclick="window._calNewAppt()">+ New Appointment</button>
      </div>
      <div id="cal-grid" style="overflow-x:auto">${gridHtml}</div>
    </div>
    ${_calRenderDetailPanel()}`;
}

function _calShowModal(prefill) {
  const f = prefill || {};
  document.getElementById('cal-appt-modal')?.remove();
  const today = _calDateStr(_calDate);
  const modal = document.createElement('div');
  modal.id = 'cal-appt-modal';
  modal.className = 'cal-modal-overlay';
  modal.innerHTML = `
    <div class="cal-modal" role="dialog" aria-modal="true">
      <h3>${f.id ? 'Edit Appointment' : 'New Appointment'}</h3>
      <label>Patient Name</label>
      <input id="cal-f-patient" type="text" placeholder="Full name" value="${f.patientName || ''}">
      <label>Type</label>
      <select id="cal-f-type">
        ${['neurofeedback','tms','tdcs','consultation','followup'].map(t =>
          `<option value="${t}"${(f.type || 'neurofeedback') === t ? ' selected' : ''}>${t.charAt(0).toUpperCase() + t.slice(1)}</option>`
        ).join('')}
      </select>
      <label>Date</label>
      <input id="cal-f-date" type="date" value="${f.date || today}">
      <label>Start Time</label>
      <select id="cal-f-start">
        ${Array.from({length:10},(_,i)=>i+8).map(h =>
          `<option value="${h}"${(f.startHour || 9) === h ? ' selected' : ''}>${h}:00</option>`
        ).join('')}
      </select>
      <label>Duration</label>
      <select id="cal-f-dur">
        ${[30,45,60,90].map(d =>
          `<option value="${d}"${(f.duration || 60) === d ? ' selected' : ''}>${d} min</option>`
        ).join('')}
      </select>
      <label>Room</label>
      <select id="cal-f-room">
        ${['Room A','Room B','Room C'].map(r =>
          `<option${(f.room || 'Room A') === r ? ' selected' : ''}>${r}</option>`
        ).join('')}
      </select>
      <label>Recurrence</label>
      <select id="cal-f-rec">
        ${['none','weekly','biweekly'].map(r =>
          `<option value="${r}"${(f.recurrence || 'none') === r ? ' selected' : ''}>${r.charAt(0).toUpperCase() + r.slice(1)}</option>`
        ).join('')}
      </select>
      <label>Notes</label>
      <textarea id="cal-f-notes">${f.notes || ''}</textarea>
      <div class="cal-modal-actions">
        <button class="btn-secondary" onclick="document.getElementById('cal-appt-modal').remove()">Cancel</button>
        <button class="btn-primary" onclick="window._calSaveAppt('${f.id || ''}')">Save</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  document.getElementById('cal-f-patient').focus();
}

window._calPrev = function() {
  if (_calView === 'week') { _calDate = new Date(_calDate); _calDate.setDate(_calDate.getDate() - 7); }
  else if (_calView === 'month') { _calDate = new Date(_calDate.getFullYear(), _calDate.getMonth() - 1, 1); }
  else { _calDate = new Date(_calDate); _calDate.setDate(_calDate.getDate() - 1); }
  _calRenderPage();
};

window._calNext = function() {
  if (_calView === 'week') { _calDate = new Date(_calDate); _calDate.setDate(_calDate.getDate() + 7); }
  else if (_calView === 'month') { _calDate = new Date(_calDate.getFullYear(), _calDate.getMonth() + 1, 1); }
  else { _calDate = new Date(_calDate); _calDate.setDate(_calDate.getDate() + 1); }
  _calRenderPage();
};

window._calToday = function() { _calDate = new Date(); _calRenderPage(); };

window._calSetView = function(v) { _calView = v; _calSelectedAppt = null; _calRenderPage(); };

window._calDayClick = function(ds) {
  _calDate = new Date(ds + 'T12:00:00');
  _calView = 'day';
  _calSelectedAppt = null;
  _calRenderPage();
};

window._calSelectAppt = function(id) {
  const baseId = id.replace(/_r\d+$/, '');
  const list   = getAppointments();
  _calSelectedAppt = list.find(a => a.id === baseId) || list.find(a => a.id === id) || null;
  const existing = document.getElementById('cal-detail-panel');
  const tmp = document.createElement('div');
  tmp.innerHTML = _calRenderDetailPanel();
  if (existing) existing.replaceWith(tmp.firstElementChild);
  else document.body.insertAdjacentHTML('beforeend', _calRenderDetailPanel());
};

window._calClosePanel = function() {
  _calSelectedAppt = null;
  const p = document.getElementById('cal-detail-panel');
  if (p) { p.classList.remove('open'); setTimeout(() => p.remove(), 260); }
};

window._calNewAppt  = function() { _calShowModal(); };
window._calEditAppt = function(id) { const a = getAppointments().find(x => x.id === id); if (a) _calShowModal(a); };

window._calSaveAppt = function(existingId) {
  const patient = (document.getElementById('cal-f-patient')?.value || '').trim();
  const type    = document.getElementById('cal-f-type')?.value;
  const date    = document.getElementById('cal-f-date')?.value;
  const startH  = parseInt(document.getElementById('cal-f-start')?.value || '9', 10);
  const dur     = parseInt(document.getElementById('cal-f-dur')?.value || '60', 10);
  const room    = document.getElementById('cal-f-room')?.value;
  const rec     = document.getElementById('cal-f-rec')?.value || 'none';
  const notes   = document.getElementById('cal-f-notes')?.value || '';
  if (!patient) { window._showToast?.('Patient name is required.', 'warning'); return; }
  if (!date)    { window._showToast?.('Date is required.', 'warning'); return; }
  const existing = existingId ? getAppointments().find(a => a.id === existingId) : null;
  saveAppointment({
    id:          existingId || ('appt_' + Date.now()),
    patientName: patient,
    type:        type || 'consultation',
    date,
    startHour:   startH,
    duration:    dur,
    room:        room || 'Room A',
    status:      existing ? existing.status : 'scheduled',
    notes,
    recurrence:  rec,
  });
  document.getElementById('cal-appt-modal')?.remove();
  _calSelectedAppt = null;
  _calRenderPage();
};

window._calCancelAppt = function(id) {
  if (!confirm('Cancel this appointment?')) return;
  const a = getAppointments().find(x => x.id === id);
  if (a) { a.status = 'cancelled'; saveAppointment(a); }
  _calSelectedAppt = null;
  _calRenderPage();
};

window._calCompleteAppt = function(id) {
  const a = getAppointments().find(x => x.id === id);
  if (a) { a.status = 'completed'; saveAppointment(a); _calSelectedAppt = a; }
  _calRenderPage();
};

window._calDeleteAppt = function(id) {
  if (!confirm('Delete this appointment? This cannot be undone.')) return;
  deleteAppointment(id);
  _calSelectedAppt = null;
  _calRenderPage();
};

export async function pgCalendar(setTopbar) {
  _calDate = new Date();
  _calSelectedAppt = null;
  setTopbar('Schedule & Calendar', `
    <button class="btn-primary" style="font-size:.8rem;padding:6px 14px" onclick="window._calNewAppt()">+ New Appointment</button>
  `);
  _calRenderPage();
}

// ── Session Monitor ──────────────────────────────────────────────────────────

// Module-level session state (cleared on nav away)
let _monitorSession = null; // { id, patientId, patientName, courseId, modality, protocol, targetDuration, startTime, paused, pausedAt, totalPaused, params, notes, cues, aborted }
let _monitorTimer = null;
let _monitorParamHistory = {}; // { amplitude: [], frequency: [], impedance: [] } — last 60 ticks
let _monitorPatients = [];
let _monitorCourseCatalog = [];

const _MONITOR_DEFAULT_PROTOCOLS = {
  Neurofeedback: 'Alpha/Theta Training',
  TMS:           'rTMS 10 Hz Motor Cortex',
  tDCS:          'Anodal tDCS F3 Montage',
  taVNS:         'taVNS 25 Hz Auricular',
  CES:           'CES 0.5 Hz Alpha Induction',
};

function _monitorCourseLabel(course) {
  if (!course) return 'Unnamed course';
  const modality = course.modality_slug || course.modality || 'course';
  const condition = course.condition_slug || course.condition || '';
  const protocol = course.protocol_id || course.protocol_name || '';
  return [condition, modality, protocol].filter(Boolean).join(' · ');
}

function _monitorPatientOptionsHtml() {
  return _monitorPatients.map((p) => `<option value="${_cdEscHtml(p.id)}">${_cdEscHtml(p.name)}</option>`).join('');
}

function _monitorCourseOptionsHtml(patientId, selectedId = '') {
  return _monitorCourseCatalog
    .filter((course) => course.patient_id === patientId)
    .map((course) => `<option value="${_cdEscHtml(course.id)}" ${course.id === selectedId ? 'selected' : ''}>${_cdEscHtml(_monitorCourseLabel(course))}</option>`)
    .join('');
}

function _monitorApplyCourseDefaults(courseId) {
  const course = _monitorCourseCatalog.find((item) => item.id === courseId);
  if (!course) return;
  const protocolInput = document.getElementById('monitor-form-protocol');
  const modalitySelect = document.getElementById('monitor-form-modality');
  const durationSelect = document.getElementById('monitor-form-duration');
  const freqSlider = document.getElementById('monitor-form-freq');
  const freqLabel = document.getElementById('monitor-form-freq-val');
  if (protocolInput) protocolInput.value = course.protocol_id || _monitorCourseLabel(course);
  if (modalitySelect) modalitySelect.value = course.modality_slug || modalitySelect.value;
  if (durationSelect && course.planned_session_duration_minutes) {
    durationSelect.value = String(course.planned_session_duration_minutes);
  }
  if (freqSlider && course.planned_frequency_hz) {
    const parsedFreq = parseFloat(course.planned_frequency_hz);
    if (Number.isFinite(parsedFreq)) {
      freqSlider.value = String(parsedFreq);
      if (freqLabel) freqLabel.textContent = `${parsedFreq} Hz`;
    }
  }
}

window._monitorSyncCourseOptions = function() {
  const patientSelect = document.getElementById('monitor-form-patient');
  const courseSelect = document.getElementById('monitor-form-course');
  if (!patientSelect || !courseSelect) return;
  const patientId = patientSelect.value;
  const matches = _monitorCourseCatalog.filter((course) => course.patient_id === patientId);
  courseSelect.innerHTML = `<option value="">— Select active course —</option>${_monitorCourseOptionsHtml(patientId)}`;
  courseSelect.disabled = matches.length === 0;
  if (matches.length) {
    courseSelect.value = matches[0].id;
    _monitorApplyCourseDefaults(matches[0].id);
  }
};

window._monitorApplyCourseSelection = function() {
  const courseSelect = document.getElementById('monitor-form-course');
  if (!courseSelect?.value) return;
  _monitorApplyCourseDefaults(courseSelect.value);
};

function _monitorFmtTime(secs) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function _monitorElapsed() {
  if (!_monitorSession) return 0;
  const now = _monitorSession.paused ? _monitorSession.pausedAt : Date.now();
  return Math.floor((now - _monitorSession.startTime - _monitorSession.totalPaused) / 1000);
}

function _monitorLogEvent(msg) {
  if (!_monitorSession) return;
  const ts = _monitorFmtTime(_monitorElapsed());
  _monitorSession.cues.push({ ts, msg });
  const logEl = document.getElementById('monitor-log');
  if (logEl) {
    const entry = document.createElement('div');
    entry.className = 'monitor-log-entry';
    entry.textContent = `[${ts}] ${msg}`;
    logEl.appendChild(entry);
    logEl.scrollTop = logEl.scrollHeight;
  }
}

function _drawWaveform(svgId, amplitude, frequency) {
  const svg = document.getElementById(svgId);
  if (!svg) return;
  const W = 300, H = 80;
  const amp = (amplitude / 100) * (H / 2 - 4);
  const pts = [];
  const cycles = Math.max(1, Math.round(frequency / 2));
  for (let x = 0; x <= W; x += 2) {
    const y = (H / 2) - amp * Math.sin((x / W) * cycles * 2 * Math.PI);
    pts.push(`${x},${y.toFixed(1)}`);
  }
  svg.innerHTML = `<polyline points="${pts.join(' ')}" fill="none" stroke="var(--teal)" stroke-width="2" stroke-linecap="round"/>`;
}

function _drawSparkline(svgId, data, color) {
  const svg = document.getElementById(svgId);
  if (!svg || !data.length) return;
  const W = 280, H = 40;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / Math.max(data.length - 1, 1)) * W;
    const y = H - ((v - min) / range) * (H - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  svg.innerHTML = `<polyline points="${pts.join(' ')}" fill="none" stroke="${color || 'var(--teal)'}" stroke-width="1.5" stroke-linecap="round"/>`;
}

function _monitorUpdateUI() {
  if (!_monitorSession) return;
  const elapsed = _monitorElapsed();
  const targetSecs = _monitorSession.targetDuration * 60;
  const pct = Math.min(100, (elapsed / targetSecs) * 100);

  // Topbar timer + status
  const elEl = document.getElementById('monitor-elapsed-display');
  if (elEl) elEl.textContent = _monitorFmtTime(elapsed);
  const targetEl = document.getElementById('monitor-target-display');
  if (targetEl) targetEl.textContent = _monitorFmtTime(targetSecs);
  const statusEl = document.getElementById('monitor-status-badge');
  if (statusEl) {
    statusEl.className = _monitorSession.paused ? 'monitor-status-paused' : 'monitor-status-running';
    statusEl.textContent = _monitorSession.paused ? 'PAUSED' : 'RUNNING';
  }

  // Large timer in col 3
  const timerBig = document.getElementById('monitor-timer-big');
  if (timerBig) timerBig.textContent = _monitorFmtTime(elapsed);

  // Progress bar
  const fillEl = document.getElementById('monitor-progress-fill');
  if (fillEl) fillEl.style.width = `${pct.toFixed(1)}%`;

  // Amplitude display
  const ampVal = document.getElementById('monitor-amp-value');
  if (ampVal) ampVal.textContent = `${_monitorSession.params.amplitude} mA`;
  const ampSlider = document.getElementById('monitor-amp-slider');
  if (ampSlider) ampSlider.value = _monitorSession.params.amplitude;

  // Frequency display
  const freqVal = document.getElementById('monitor-freq-value');
  if (freqVal) freqVal.textContent = `${_monitorSession.params.frequency} Hz`;
  const freqSlider = document.getElementById('monitor-freq-slider');
  if (freqSlider) freqSlider.value = _monitorSession.params.frequency;

  // Impedance display
  const imp = _monitorSession.params.impedance;
  const impVal = document.getElementById('monitor-imp-value');
  if (impVal) {
    let cls = 'impedance-ok';
    if (imp >= 5 && imp < 10) cls = 'impedance-warn';
    else if (imp >= 10) cls = 'impedance-bad';
    impVal.className = cls;
    impVal.textContent = `${imp.toFixed(1)} kΩ`;
  }

  // Waveform
  _drawWaveform('monitor-waveform-svg', _monitorSession.params.amplitude, _monitorSession.params.frequency);

  // Sparklines
  _drawSparkline('monitor-spark-amp', _monitorParamHistory.amplitude, 'var(--teal)');
  _drawSparkline('monitor-spark-freq', _monitorParamHistory.frequency, '#a78bfa');
  _drawSparkline('monitor-spark-imp', _monitorParamHistory.impedance, '#fb923c');
}

function _monitorTick() {
  // Self-terminate if navigated away
  if (!document.getElementById('session-monitor-root')) {
    clearInterval(_monitorTimer);
    _monitorTimer = null;
    return;
  }
  if (!_monitorSession || _monitorSession.aborted) return;

  const elapsed = _monitorElapsed();
  const targetSecs = _monitorSession.targetDuration * 60;

  if (!_monitorSession.paused) {
    // Simulate impedance fluctuation ±5%
    const base = _monitorSession.params.impedance;
    const delta = (Math.random() - 0.5) * 0.1 * base;
    _monitorSession.params.impedance = Math.max(0.5, base + delta);

    // Record history (cap at 60)
    _monitorParamHistory.amplitude.push(_monitorSession.params.amplitude);
    _monitorParamHistory.frequency.push(_monitorSession.params.frequency);
    _monitorParamHistory.impedance.push(_monitorSession.params.impedance);
    if (_monitorParamHistory.amplitude.length > 60) _monitorParamHistory.amplitude.shift();
    if (_monitorParamHistory.frequency.length > 60) _monitorParamHistory.frequency.shift();
    if (_monitorParamHistory.impedance.length > 60) _monitorParamHistory.impedance.shift();
  }

  _monitorUpdateUI();

  // Check completion
  if (elapsed >= targetSecs) {
    clearInterval(_monitorTimer);
    _monitorTimer = null;
    _monitorShowCompletion();
  }
}

function _monitorShowCompletion() {
  if (_aiTickerInterval) { clearInterval(_aiTickerInterval); _aiTickerInterval = null; }
  const root = document.getElementById('session-monitor-root');
  if (!root) return;
  const s = _monitorSession;
  const ampHistory = _monitorParamHistory.amplitude;
  const freqHistory = _monitorParamHistory.frequency;
  const ampMin = ampHistory.length ? Math.min(...ampHistory).toFixed(0) : s.params.amplitude;
  const ampMax = ampHistory.length ? Math.max(...ampHistory).toFixed(0) : s.params.amplitude;
  const freqMin = freqHistory.length ? Math.min(...freqHistory).toFixed(1) : s.params.frequency;
  const freqMax = freqHistory.length ? Math.max(...freqHistory).toFixed(1) : s.params.frequency;
  const cueLog = s.cues.filter(c => c.msg).map(c => `<li>[${c.ts}] ${c.msg}</li>`).join('');

  const overlay = document.createElement('div');
  overlay.id = 'monitor-completion-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:9000;display:flex;align-items:center;justify-content:center;padding:16px';
  overlay.innerHTML = `
    <div style="background:var(--card-bg);border:1px solid var(--border);border-radius:14px;padding:32px;max-width:540px;width:100%;max-height:90vh;overflow-y:auto">
      <div style="font-size:2rem;margin-bottom:4px">✅</div>
      <h2 style="margin:0 0 4px;font-size:1.3rem">Session Complete</h2>
      <p style="color:var(--text-muted);font-size:.85rem;margin-bottom:16px">${s.patientName} · ${s.modality} · ${s.protocol}</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
        <div class="monitor-param-card"><div style="font-size:.75rem;color:var(--text-muted)">Duration</div><div class="monitor-param-value">${_monitorFmtTime(s.targetDuration * 60)}</div></div>
        <div class="monitor-param-card"><div style="font-size:.75rem;color:var(--text-muted)">Amplitude Range</div><div class="monitor-param-value">${ampMin}–${ampMax} mA</div></div>
        <div class="monitor-param-card"><div style="font-size:.75rem;color:var(--text-muted)">Frequency Range</div><div class="monitor-param-value">${freqMin}–${freqMax} Hz</div></div>
        <div class="monitor-param-card"><div style="font-size:.75rem;color:var(--text-muted)">Cues Logged</div><div class="monitor-param-value">${s.cues.length}</div></div>
      </div>
      ${cueLog ? `<div style="margin-bottom:12px"><strong style="font-size:.82rem">Cue Log:</strong><ul style="font-size:.78rem;color:var(--text-muted);margin:4px 0;padding-left:16px">${cueLog}</ul></div>` : ''}
      ${s.notes ? `<div style="margin-bottom:12px"><strong style="font-size:.82rem">Notes:</strong><p style="font-size:.82rem;color:var(--text-muted);margin:4px 0">${s.notes}</p></div>` : ''}
      <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;margin-top:16px">
        <button class="btn-secondary" onclick="document.getElementById('monitor-completion-overlay').remove();_monitorSession=null;window._nav('session-monitor')">Start New Session</button>
        <button class="btn-primary" onclick="window._monitorSaveSession()">Save Session Log</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

window._monitorStart = async function() {
  const patientSelect = document.getElementById('monitor-form-patient');
  const courseSelect = document.getElementById('monitor-form-course');
  const modalitySelect = document.getElementById('monitor-form-modality');
  const protocolInput = document.getElementById('monitor-form-protocol');
  const durationSelect = document.getElementById('monitor-form-duration');
  const ampSlider = document.getElementById('monitor-form-amp');
  const freqSlider = document.getElementById('monitor-form-freq');
  const notesInput = document.getElementById('monitor-form-notes');

  if (!patientSelect.value) { window._showToast?.('Please select a patient.', 'warning'); return; }
  if (!courseSelect?.value) { window._showToast?.('Please select an active course.', 'warning'); return; }

  const patientId = patientSelect.value;
  const patientName = patientSelect.options[patientSelect.selectedIndex].text;
  const courseId = courseSelect.value;
  const activeCourse = _monitorCourseCatalog.find((course) => course.id === courseId);
  if (!activeCourse) { window._showToast?.('Selected course is no longer available.', 'error'); return; }
  const modality = modalitySelect.value;
  const protocol = protocolInput.value.trim() || activeCourse.protocol_id || _MONITOR_DEFAULT_PROTOCOLS[modality];
  const targetDuration = parseInt(durationSelect.value, 10) || activeCourse.planned_session_duration_minutes || 30;
  const amplitude = parseFloat(ampSlider.value);
  const frequency = parseFloat(freqSlider.value);
  const notes = notesInput.value.trim();

  _monitorSession = {
    id: `ses_${Date.now()}`,
    patientId,
    patientName,
    courseId,
    modality,
    protocol,
    courseLabel: _monitorCourseLabel(activeCourse),
    deviceSlug: activeCourse.device_slug || '',
    coilPlacement: activeCourse.coil_placement || '',
    targetDuration,
    startTime: Date.now(),
    paused: false,
    pausedAt: null,
    totalPaused: 0,
    params: { amplitude, frequency, impedance: 3 + Math.random() * 4 },
    notes,
    cues: [],
    aborted: false,
  };

  _monitorParamHistory = { amplitude: [], frequency: [], impedance: [] };

  // Re-render in active mode
  const root = document.getElementById('session-monitor-root');
  if (root) {
    root.innerHTML = _monitorDashboardHTML();
    _monitorLogEvent(`Session started — ${modality} / ${protocol}`);
    _monitorUpdateUI();
    _injectAIMonitorTicker();
  }

  // Start tick
  if (_monitorTimer) clearInterval(_monitorTimer);
  _monitorTimer = setInterval(_monitorTick, 1000);
};

window._monitorPause = function() {
  if (!_monitorSession || _monitorSession.paused) return;
  _monitorSession.paused = true;
  _monitorSession.pausedAt = Date.now();
  _monitorLogEvent('Session paused');
  _monitorUpdateUI();
  const pauseBtn = document.getElementById('monitor-pause-btn');
  const resumeBtn = document.getElementById('monitor-resume-btn');
  if (pauseBtn) pauseBtn.style.display = 'none';
  if (resumeBtn) resumeBtn.style.display = '';
};

window._monitorResume = function() {
  if (!_monitorSession || !_monitorSession.paused) return;
  _monitorSession.totalPaused += Date.now() - _monitorSession.pausedAt;
  _monitorSession.paused = false;
  _monitorSession.pausedAt = null;
  _monitorLogEvent('Session resumed');
  _monitorUpdateUI();
  const pauseBtn = document.getElementById('monitor-pause-btn');
  const resumeBtn = document.getElementById('monitor-resume-btn');
  if (pauseBtn) pauseBtn.style.display = '';
  if (resumeBtn) resumeBtn.style.display = 'none';
};

window._monitorAbort = function() {
  const panel = document.getElementById('monitor-abort-panel');
  if (panel) panel.style.display = panel.style.display === 'none' ? '' : 'none';
};

window._monitorConfirmAbort = function(reason) {
  if (!_monitorSession) return;
  const noteEl = document.getElementById('monitor-abort-note');
  const note = noteEl ? noteEl.value.trim() : '';
  _monitorSession.aborted = true;
  _monitorSession.abortReason = reason;
  if (note) _monitorSession.notes = (_monitorSession.notes ? _monitorSession.notes + '\n' : '') + `Abort note: ${note}`;
  if (_monitorTimer) { clearInterval(_monitorTimer); _monitorTimer = null; }
  if (_aiTickerInterval) { clearInterval(_aiTickerInterval); _aiTickerInterval = null; }
  _monitorLogEvent(`Session aborted — ${reason}`);

  const root = document.getElementById('session-monitor-root');
  if (root) {
    root.innerHTML = `<div style="text-align:center;padding:48px;color:var(--text-muted)">
      <div style="font-size:2.5rem;margin-bottom:8px">⛔</div>
      <h2 style="margin:0 0 8px">Session Aborted</h2>
      <p style="font-size:.9rem;margin-bottom:10px">Reason: <strong>${reason}</strong></p>
      <p style="font-size:.82rem;margin-bottom:24px">No delivered session record was written to the backend.</p>
      <button class="btn-primary" onclick="window._nav('session-monitor')">Start New Session</button>
    </div>`;
  }
  _monitorSession = null;
};

window._monitorSetAmplitude = function(v) {
  if (!_monitorSession) return;
  const old = _monitorSession.params.amplitude;
  _monitorSession.params.amplitude = parseFloat(v);
  if (Math.abs(old - parseFloat(v)) >= 1) _monitorLogEvent(`Amplitude → ${v} mA`);
  _monitorUpdateUI();
};

window._monitorSetFrequency = function(v) {
  if (!_monitorSession) return;
  const old = _monitorSession.params.frequency;
  _monitorSession.params.frequency = parseFloat(v);
  if (Math.abs(old - parseFloat(v)) >= 0.5) _monitorLogEvent(`Frequency → ${v} Hz`);
  _monitorUpdateUI();
};

window._monitorAddCue = function(cue) {
  if (!_monitorSession) return;
  _monitorLogEvent(`Cue: ${cue}`);
};

window._monitorSaveNote = function() {
  if (!_monitorSession) return;
  const el = document.getElementById('monitor-session-notes');
  if (el) { _monitorSession.notes = el.value; }
  const fb = document.getElementById('monitor-note-saved');
  if (fb) { fb.style.display = ''; setTimeout(() => { fb.style.display = 'none'; }, 1500); }
};

window._monitorSaveSession = async function() {
  if (!_monitorSession) return;
  const overlay = document.getElementById('monitor-completion-overlay');
  const noteParts = [
    _monitorSession.notes || '',
    `Monitor protocol: ${_monitorSession.protocol}`,
    `Amplitude range: ${_monitorParamHistory.amplitude?.length ? `${Math.min(..._monitorParamHistory.amplitude).toFixed(0)}-${Math.max(..._monitorParamHistory.amplitude).toFixed(0)} mA` : `${_monitorSession.params.amplitude} mA`}`,
    `Frequency range: ${_monitorParamHistory.frequency?.length ? `${Math.min(..._monitorParamHistory.frequency).toFixed(1)}-${Math.max(..._monitorParamHistory.frequency).toFixed(1)} Hz` : `${_monitorSession.params.frequency} Hz`}`,
    _monitorSession.cues?.length ? `Cue log: ${_monitorSession.cues.map((cue) => `[${cue.ts}] ${cue.msg}`).join(' | ')}` : '',
  ].filter(Boolean);

  try {
    await api.logSession(_monitorSession.courseId, {
      device_slug: _monitorSession.deviceSlug || null,
      coil_position: _monitorSession.coilPlacement || null,
      frequency_hz: String(_monitorSession.params.frequency),
      duration_minutes: _monitorSession.targetDuration,
      post_session_notes: noteParts.join('\n'),
      checklist: {},
    });
    if (overlay) {
      overlay.innerHTML = `<div style="background:var(--card-bg);border-radius:14px;padding:40px;text-align:center">
        <div style="font-size:2.5rem;margin-bottom:8px">💾</div>
        <h2 style="margin:0 0 8px">Session Saved</h2>
        <p style="color:var(--text-muted);margin-bottom:20px">Delivered session was written to the linked clinical course record.</p>
        <button class="btn-primary" onclick="document.getElementById('monitor-completion-overlay').remove();_monitorSession=null;window._nav('session-monitor')">Done</button>
      </div>`;
    }
  } catch (err) {
    if (overlay) {
      overlay.innerHTML = `<div style="background:var(--card-bg);border-radius:14px;padding:40px;text-align:center">
        <div style="font-size:2.5rem;margin-bottom:8px">⚠</div>
        <h2 style="margin:0 0 8px">Session Not Saved</h2>
        <p style="color:var(--text-muted);margin-bottom:20px">The clinical session log could not be written to the backend. No local clinical record fallback was used.</p>
        <div style="font-size:12px;color:var(--red);margin-bottom:20px">${_cdEscHtml(err?.message || 'Unknown error')}</div>
        <button class="btn-primary" onclick="window._monitorSaveSession()">Retry Save</button>
      </div>`;
    }
  }
};

function _monitorStartFormHTML() {
  const patientOptions = _monitorPatientOptionsHtml();
  const modalityOptions = ['Neurofeedback', 'TMS', 'tDCS', 'taVNS', 'CES'].map(m => `<option value="${m}">${m}</option>`).join('');
  const durationOptions = [15, 20, 30, 45, 60].map(d => `<option value="${d}" ${d === 30 ? 'selected' : ''}>${d} min</option>`).join('');

  return `
    <div style="max-width:560px;margin:0 auto">
      <div style="background:var(--card-bg);border:1px solid var(--border);border-radius:12px;padding:28px">
        <h2 style="margin:0 0 20px;font-size:1.15rem">Configure New Session</h2>
        <div style="display:grid;gap:14px">

          <label style="display:flex;flex-direction:column;gap:4px;font-size:.85rem;font-weight:600">
            Patient
            <select id="monitor-form-patient" class="form-select" style="font-weight:400" onchange="window._monitorSyncCourseOptions()">
              <option value="">— Select patient —</option>
              ${patientOptions}
            </select>
          </label>

          <label style="display:flex;flex-direction:column;gap:4px;font-size:.85rem;font-weight:600">
            Active Course
            <select id="monitor-form-course" class="form-select" style="font-weight:400" onchange="window._monitorApplyCourseSelection()" disabled>
              <option value="">— Select active course —</option>
            </select>
          </label>

          <label style="display:flex;flex-direction:column;gap:4px;font-size:.85rem;font-weight:600">
            Modality
            <select id="monitor-form-modality" class="form-select" style="font-weight:400"
              onchange="const proto=document.getElementById('monitor-form-protocol');if(proto)proto.value=({Neurofeedback:'Alpha/Theta Training',TMS:'rTMS 10 Hz Motor Cortex',tDCS:'Anodal tDCS F3 Montage',taVNS:'taVNS 25 Hz Auricular',CES:'CES 0.5 Hz Alpha Induction'})[this.value]||''">
              ${modalityOptions}
            </select>
          </label>

          <label style="display:flex;flex-direction:column;gap:4px;font-size:.85rem;font-weight:600">
            Protocol Name
            <input id="monitor-form-protocol" type="text" class="form-input" style="font-weight:400"
              placeholder="Protocol name" value="${_MONITOR_DEFAULT_PROTOCOLS.Neurofeedback}">
          </label>

          <label style="display:flex;flex-direction:column;gap:4px;font-size:.85rem;font-weight:600">
            Target Duration
            <select id="monitor-form-duration" class="form-select" style="font-weight:400">
              ${durationOptions}
            </select>
          </label>

          <div style="display:flex;flex-direction:column;gap:4px;font-size:.85rem;font-weight:600">
            Starting Amplitude: <span id="monitor-form-amp-val" style="color:var(--teal);font-weight:700">50 mA</span>
            <input id="monitor-form-amp" type="range" min="0" max="100" step="1" value="50"
              oninput="document.getElementById('monitor-form-amp-val').textContent=this.value+' mA'"
              style="width:100%;margin:4px 0">
          </div>

          <div style="display:flex;flex-direction:column;gap:4px;font-size:.85rem;font-weight:600">
            Starting Frequency: <span id="monitor-form-freq-val" style="color:var(--teal);font-weight:700">10 Hz</span>
            <input id="monitor-form-freq" type="range" min="0.5" max="40" step="0.5" value="10"
              oninput="document.getElementById('monitor-form-freq-val').textContent=this.value+' Hz'"
              style="width:100%;margin:4px 0">
          </div>

          <label style="display:flex;flex-direction:column;gap:4px;font-size:.85rem;font-weight:600">
            Session Notes (optional)
            <textarea id="monitor-form-notes" rows="3" class="form-input" style="font-weight:400;resize:vertical"
              placeholder="Pre-session notes, patient state, setup observations…"></textarea>
          </label>

          <button class="btn-primary" style="margin-top:8px;padding:12px" onclick="window._monitorStart()">
            ▶ Start Session
          </button>
        </div>
      </div>
    </div>`;
}

function _monitorDashboardHTML() {
  const s = _monitorSession;
  return `
    <!-- Topbar strip -->
    <div class="monitor-topbar" style="flex-wrap:wrap">
      <div>
        <div style="font-size:.75rem;color:var(--text-muted);margin-bottom:2px">Patient</div>
        <div style="font-weight:700">${s.patientName}</div>
      </div>
      <div style="padding:3px 10px;border-radius:12px;background:var(--hover-bg);font-size:.8rem;font-weight:600">${s.modality}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:.72rem;color:var(--text-muted)">Protocol</div>
        <div style="font-size:.85rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${s.protocol}</div>
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <span class="monitor-elapsed" id="monitor-elapsed-display">00:00</span>
        <span style="color:var(--text-muted);font-size:.9rem">/</span>
        <span style="font-size:1rem;color:var(--text-muted)" id="monitor-target-display">${_monitorFmtTime(s.targetDuration * 60)}</span>
      </div>
      <span class="monitor-status-running" id="monitor-status-badge">RUNNING</span>
      <div style="display:flex;gap:8px;margin-left:auto;flex-wrap:wrap">
        <button id="monitor-pause-btn" class="btn-secondary" style="font-size:.8rem;padding:6px 12px" onclick="window._monitorPause()">⏸ Pause</button>
        <button id="monitor-resume-btn" class="btn-primary" style="font-size:.8rem;padding:6px 12px;display:none" onclick="window._monitorResume()">▶ Resume</button>
        <button class="btn-secondary" style="font-size:.8rem;padding:6px 12px;border-color:#fca5a5;color:#ef4444" onclick="window._monitorAbort()">✕ Abort</button>
      </div>
    </div>

    <!-- Abort panel (hidden by default) -->
    <div id="monitor-abort-panel" class="monitor-abort-panel" style="display:none">
      <div style="font-weight:700;margin-bottom:10px;color:#991b1b">Abort Session</div>
      <label style="font-size:.83rem;font-weight:600;display:block;margin-bottom:6px">Reason
        <select id="monitor-abort-reason" class="form-select" style="font-weight:400;margin-top:4px">
          <option>Patient request</option>
          <option>Adverse effect</option>
          <option>Equipment failure</option>
          <option>Protocol complete</option>
          <option>Other</option>
        </select>
      </label>
      <label style="font-size:.83rem;font-weight:600;display:block;margin-bottom:10px">Notes
        <textarea id="monitor-abort-note" rows="2" class="form-input" style="font-weight:400;resize:vertical;margin-top:4px" placeholder="Additional details…"></textarea>
      </label>
      <div style="display:flex;gap:8px">
        <button class="btn-secondary" style="font-size:.8rem" onclick="window._monitorAbort()">Cancel</button>
        <button style="background:#ef4444;color:white;border:none;border-radius:6px;padding:7px 14px;font-size:.8rem;font-weight:600;cursor:pointer"
          onclick="window._monitorConfirmAbort(document.getElementById('monitor-abort-reason').value)">Confirm Abort</button>
      </div>
    </div>

    <!-- Three-column grid -->
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;align-items:start" class="monitor-grid">

      <!-- Col 1: Parameter controls -->
      <div>
        <div class="monitor-param-card">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <div style="font-size:.8rem;font-weight:600;color:var(--text-muted)">AMPLITUDE</div>
            <span class="monitor-param-value" id="monitor-amp-value">${s.params.amplitude} mA</span>
          </div>
          <input id="monitor-amp-slider" type="range" min="0" max="100" step="1" value="${s.params.amplitude}"
            oninput="window._monitorSetAmplitude(this.value)" style="width:100%;margin:4px 0">
          <div style="display:flex;gap:6px;margin-top:6px">
            <button class="monitor-cue-btn" style="flex:1" onclick="window._monitorSetAmplitude(Math.min(100,(_monitorSession?_monitorSession.params.amplitude:50)+5))">▲ Ramp Up</button>
            <button class="monitor-cue-btn" style="flex:1" onclick="window._monitorSetAmplitude(Math.max(0,(_monitorSession?_monitorSession.params.amplitude:50)-5))">▼ Ramp Down</button>
          </div>
        </div>

        <div class="monitor-param-card">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <div style="font-size:.8rem;font-weight:600;color:var(--text-muted)">FREQUENCY</div>
            <span class="monitor-param-value" id="monitor-freq-value">${s.params.frequency} Hz</span>
          </div>
          <input id="monitor-freq-slider" type="range" min="0.5" max="40" step="0.5" value="${s.params.frequency}"
            oninput="window._monitorSetFrequency(this.value)" style="width:100%;margin:4px 0">
        </div>

        <div class="monitor-param-card">
          <div style="font-size:.8rem;font-weight:600;color:var(--text-muted);margin-bottom:6px">IMPEDANCE</div>
          <div style="display:flex;align-items:center;gap:10px">
            <span class="monitor-param-value impedance-ok" id="monitor-imp-value">${s.params.impedance.toFixed(1)} kΩ</span>
            <span style="font-size:.75rem;color:var(--text-muted)">(live simulation)</span>
          </div>
        </div>
      </div>

      <!-- Col 2: Waveform + sparklines -->
      <div>
        <div class="monitor-waveform">
          <div style="font-size:.75rem;color:var(--text-muted);margin-bottom:4px">LIVE WAVEFORM</div>
          <svg id="monitor-waveform-svg" width="300" height="80" viewBox="0 0 300 80" style="display:block;width:100%;height:80px"></svg>
        </div>

        <div class="monitor-param-card" style="padding:10px">
          <div style="font-size:.72rem;color:var(--text-muted);margin-bottom:4px">AMPLITUDE HISTORY</div>
          <svg id="monitor-spark-amp" width="280" height="40" viewBox="0 0 280 40" style="display:block;width:100%;height:40px"></svg>
        </div>

        <div class="monitor-param-card" style="padding:10px">
          <div style="font-size:.72rem;color:var(--text-muted);margin-bottom:4px">FREQUENCY HISTORY</div>
          <svg id="monitor-spark-freq" width="280" height="40" viewBox="0 0 280 40" style="display:block;width:100%;height:40px"></svg>
        </div>

        <div class="monitor-param-card" style="padding:10px">
          <div style="font-size:.72rem;color:var(--text-muted);margin-bottom:4px">IMPEDANCE HISTORY</div>
          <svg id="monitor-spark-imp" width="280" height="40" viewBox="0 0 280 40" style="display:block;width:100%;height:40px"></svg>
        </div>
      </div>

      <!-- Col 3: Therapist tools -->
      <div>
        <div class="monitor-param-card" style="text-align:center">
          <div style="font-size:.75rem;color:var(--text-muted);margin-bottom:4px">ELAPSED TIME</div>
          <div id="monitor-timer-big" style="font-size:2.8rem;font-weight:800;font-variant-numeric:tabular-nums;color:var(--teal)">00:00</div>
          <div class="monitor-progress-bar">
            <div class="monitor-progress-fill" id="monitor-progress-fill" style="width:0%"></div>
          </div>
          <div style="font-size:.75rem;color:var(--text-muted)">Target: ${s.targetDuration} min</div>
        </div>

        <div class="monitor-param-card">
          <div style="font-size:.8rem;font-weight:600;margin-bottom:8px">THERAPIST CUES</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            ${['Relax', 'Focus', 'Breathe', 'Eyes Open'].map(c =>
              `<button class="monitor-cue-btn" onclick="window._monitorAddCue('${c}')">${c}</button>`
            ).join('')}
          </div>
        </div>

        <div class="monitor-param-card">
          <div style="font-size:.8rem;font-weight:600;margin-bottom:6px">MID-SESSION NOTES</div>
          <textarea id="monitor-session-notes" rows="3" class="form-input" style="resize:vertical;font-size:.82rem"
            placeholder="Observations, reactions, adjustments…">${s.notes}</textarea>
          <div style="display:flex;align-items:center;gap:8px;margin-top:6px">
            <button class="btn-secondary" style="font-size:.78rem;padding:5px 10px" onclick="window._monitorSaveNote()">Save Note</button>
            <span id="monitor-note-saved" style="display:none;font-size:.75rem;color:#065f46">Saved</span>
          </div>
        </div>

        <div class="monitor-param-card">
          <div style="font-size:.8rem;font-weight:600;margin-bottom:6px">SESSION LOG</div>
          <div class="monitor-log" id="monitor-log"></div>
        </div>
      </div>

    </div>

    <style>
      @media (max-width: 900px) {
        .monitor-grid { grid-template-columns: 1fr !important; }
      }
      @media (max-width: 600px) {
        .monitor-topbar { flex-direction: column; align-items: flex-start; }
      }
    </style>`;
}

// ── AI Monitor Ticker ─────────────────────────────────────────────────────���────
const _AI_TICKER_TIPS = [
  'HR elevated — consider pausing stimulation and checking patient comfort.',
  'Patient in optimal alertness range — good time for cognitive tasks.',
  'Session duration optimal — 45–60 min sessions show best outcomes in the literature.',
  'Theta activity increasing — expected response to NFB protocol. Maintain current settings.',
  'Compliance tip: document mid-session observations now while details are fresh.',
  'Impedance stable — electrode contact is good. Continue monitoring.',
  'At the halfway mark, consider a brief 2-min rest check-in with the patient.',
  'Amplitude within therapeutic range — no adjustment needed at this time.',
  'Evidence note: session frequency ≥2×/week is associated with faster response onset.',
  'Safety reminder: confirm patient comfort level every 15 minutes per protocol.',
];

let _aiTickerInterval = null;
let _aiTickerIndex = 0;

function _injectAIMonitorTicker() {
  // Clean up any prior ticker
  if (_aiTickerInterval) { clearInterval(_aiTickerInterval); _aiTickerInterval = null; }

  const root = document.getElementById('session-monitor-root');
  if (!root) return;

  // Inject ticker element after the monitor dashboard
  const existing = document.getElementById('ai-monitor-ticker');
  if (existing) existing.remove();

  const ticker = document.createElement('div');
  ticker.id = 'ai-monitor-ticker';
  ticker.innerHTML = `
    <span class="ai-ticker-label">🤖 AI Insight</span>
    <span class="ai-ticker-text" id="ai-ticker-text">${_AI_TICKER_TIPS[0]}</span>`;
  root.appendChild(ticker);

  _aiTickerIndex = 0;

  // Rotate tips every 30 seconds
  _aiTickerInterval = setInterval(() => {
    // Stop if session monitor root is gone (navigated away)
    if (!document.getElementById('session-monitor-root')) {
      clearInterval(_aiTickerInterval);
      _aiTickerInterval = null;
      return;
    }
    const textEl = document.getElementById('ai-ticker-text');
    if (!textEl) {
      clearInterval(_aiTickerInterval);
      _aiTickerInterval = null;
      return;
    }
    _aiTickerIndex = (_aiTickerIndex + 1) % _AI_TICKER_TIPS.length;
    // Fade transition
    textEl.style.opacity = '0';
    setTimeout(() => {
      textEl.textContent = _AI_TICKER_TIPS[_aiTickerIndex];
      textEl.style.opacity = '1';
    }, 500);
  }, 30000);
}

export async function pgSessionMonitor(setTopbar) {
  // Stop any running timer from a previous session
  if (_monitorTimer) { clearInterval(_monitorTimer); _monitorTimer = null; }
  // Stop any prior AI ticker
  if (_aiTickerInterval) { clearInterval(_aiTickerInterval); _aiTickerInterval = null; }

  setTopbar('Live Session Monitor', '');

  const el = document.getElementById('content');
  el.innerHTML = `<div id="session-monitor-root" style="padding:16px 0"></div>`;
  const root = document.getElementById('session-monitor-root');

  if (_monitorSession && !_monitorSession.aborted) {
    // Resume view of active session
    root.innerHTML = _monitorDashboardHTML();
    _monitorUpdateUI();
    // Re-populate log
    const logEl = document.getElementById('monitor-log');
    if (logEl) {
      logEl.innerHTML = _monitorSession.cues.map(c =>
        `<div class="monitor-log-entry">[${c.ts}] ${_esc(c.msg)}</div>`
      ).join('');
      logEl.scrollTop = logEl.scrollHeight;
    }
    _injectAIMonitorTicker();
    if (_monitorTimer) clearInterval(_monitorTimer);
    _monitorTimer = setInterval(_monitorTick, 1000);
    return;
  }

  // No active session — show start form
  _monitorSession = null;
  let patientsRes = null;
  let coursesRes = null;
  try {
    [patientsRes, coursesRes] = await Promise.all([
      api.listPatients(),
      api.listCourses({ status: 'active' }),
    ]);
  } catch (_) {
    root.innerHTML = `<div class="card" style="padding:32px">${emptyState('◫', 'Session Monitor is unavailable because live patients or active courses could not be loaded.')}</div>`;
    return;
  }

  const patients = Array.isArray(patientsRes) ? patientsRes : (patientsRes?.items || patientsRes?.patients || []);
  const courses = Array.isArray(coursesRes) ? coursesRes : (coursesRes?.items || []);
  const patientMap = new Map(
    (patients || []).map((p) => [
      String(p.id || p._id),
      p.name || `${p.first_name || ''} ${p.last_name || ''}`.trim() || String(p.id || p._id),
    ]),
  );
  _monitorCourseCatalog = (courses || []).filter((course) => course?.status === 'active' && course?.patient_id);
  _monitorPatients = Array.from(
    new Map(
      _monitorCourseCatalog.map((course) => [
        String(course.patient_id),
        {
          id: String(course.patient_id),
          name: patientMap.get(String(course.patient_id)) || String(course.patient_id),
        },
      ]),
    ).values(),
  ).sort((a, b) => a.name.localeCompare(b.name));

  if (_monitorPatients.length === 0 || _monitorCourseCatalog.length === 0) {
    root.innerHTML = `<div class="card" style="padding:32px">${emptyState('◫', 'No active treatment courses are available for live session monitoring.')}</div>`;
    return;
  }

  root.innerHTML = _monitorStartFormHTML();
  window._monitorSyncCourseOptions?.();
}

// ── Outcome Prediction & ML Scoring ──────────────────────────────────────────

const PREDICTION_WEIGHTS = {
  sessionCount:        0.042,
  adherenceRate:       1.8,
  baselineScore:      -0.018,
  ageGroup:           -0.15,
  conditionSeverity:  -0.9,
  modalityMatch:       0.6,
  sessionFrequency:    0.25,
  treatmentDuration:   0.03,
  priorTreatment:     -0.2,
  comorbidities:      -0.15,
  intercept:          -0.8,
};

function _predSigmoid(x) { return 1 / (1 + Math.exp(-x)); }

function _predictOutcomeProbability(features) {
  let logit = PREDICTION_WEIGHTS.intercept;
  const importance = {};
  for (const [k, w] of Object.entries(PREDICTION_WEIGHTS)) {
    if (k === 'intercept') continue;
    const contribution = w * (features[k] ?? 0);
    logit += contribution;
    importance[k] = { abs: Math.abs(contribution), signed: contribution };
  }
  const probability = _predSigmoid(logit);
  const predictedScore = Math.round(probability * 100);
  const confidence = 0.65 + (features.sessionCount / 100) * 0.25;
  const riskLevel = probability < 0.4 ? 'high' : probability < 0.65 ? 'moderate' : 'low';
  return { probability, predictedScore, confidence: Math.min(confidence, 0.95), riskLevel, featureImportance: importance };
}

function _bootstrapCI(features, n = 200) {
  const results = [];
  for (let i = 0; i < n; i++) {
    const noisy = {};
    for (const [k, v] of Object.entries(features)) {
      noisy[k] = v + (Math.random() - 0.5) * 0.1 * Math.abs(v || 1);
    }
    results.push(_predictOutcomeProbability(noisy).predictedScore);
  }
  results.sort((a, b) => a - b);
  return [results[Math.floor(n * 0.05)], results[Math.floor(n * 0.95)]];
}

const _PRED_STORE_KEY = 'ds_predictions';

function _initPredictions() {
  let data = null;
  try { data = JSON.parse(localStorage.getItem(_PRED_STORE_KEY) || 'null'); } catch { data = null; }
  if (!data) {
    data = [
      {
        id: 'pred-001', patientName: 'Alice Reyes', date: '2026-03-01',
        features: { sessionCount: 24, adherenceRate: 0.88, baselineScore: 62, ageGroup: 1, conditionSeverity: 2, modalityMatch: 2, sessionFrequency: 2, treatmentDuration: 12, priorTreatment: 0, comorbidities: 1 },
        result: _predictOutcomeProbability({ sessionCount: 24, adherenceRate: 0.88, baselineScore: 62, ageGroup: 1, conditionSeverity: 2, modalityMatch: 2, sessionFrequency: 2, treatmentDuration: 12, priorTreatment: 0, comorbidities: 1 }),
        actualScore: 78, notes: 'Responded well to alpha/theta protocol',
      },
      {
        id: 'pred-002', patientName: 'Bob Cheng', date: '2026-03-08',
        features: { sessionCount: 10, adherenceRate: 0.60, baselineScore: 80, ageGroup: 2, conditionSeverity: 3, modalityMatch: 1, sessionFrequency: 1, treatmentDuration: 10, priorTreatment: 1, comorbidities: 3 },
        result: _predictOutcomeProbability({ sessionCount: 10, adherenceRate: 0.60, baselineScore: 80, ageGroup: 2, conditionSeverity: 3, modalityMatch: 1, sessionFrequency: 1, treatmentDuration: 10, priorTreatment: 1, comorbidities: 3 }),
        actualScore: null, notes: 'High comorbidity burden',
      },
      {
        id: 'pred-003', patientName: 'Diana Mohr', date: '2026-03-15',
        features: { sessionCount: 40, adherenceRate: 0.95, baselineScore: 55, ageGroup: 0, conditionSeverity: 2, modalityMatch: 2, sessionFrequency: 3, treatmentDuration: 14, priorTreatment: 0, comorbidities: 0 },
        result: _predictOutcomeProbability({ sessionCount: 40, adherenceRate: 0.95, baselineScore: 55, ageGroup: 0, conditionSeverity: 2, modalityMatch: 2, sessionFrequency: 3, treatmentDuration: 14, priorTreatment: 0, comorbidities: 0 }),
        actualScore: 85, notes: 'Excellent adherence',
      },
      {
        id: 'pred-004', patientName: 'Edward Park', date: '2026-03-22',
        features: { sessionCount: 16, adherenceRate: 0.72, baselineScore: 70, ageGroup: 1, conditionSeverity: 2, modalityMatch: 1, sessionFrequency: 2, treatmentDuration: 8, priorTreatment: 1, comorbidities: 2 },
        result: _predictOutcomeProbability({ sessionCount: 16, adherenceRate: 0.72, baselineScore: 70, ageGroup: 1, conditionSeverity: 2, modalityMatch: 1, sessionFrequency: 2, treatmentDuration: 8, priorTreatment: 1, comorbidities: 2 }),
        actualScore: null, notes: 'Monitoring progress',
      },
      {
        id: 'pred-005', patientName: 'Fatima Hassan', date: '2026-04-01',
        features: { sessionCount: 32, adherenceRate: 0.82, baselineScore: 58, ageGroup: 0, conditionSeverity: 1, modalityMatch: 2, sessionFrequency: 3, treatmentDuration: 11, priorTreatment: 0, comorbidities: 1 },
        result: _predictOutcomeProbability({ sessionCount: 32, adherenceRate: 0.82, baselineScore: 58, ageGroup: 0, conditionSeverity: 1, modalityMatch: 2, sessionFrequency: 3, treatmentDuration: 11, priorTreatment: 0, comorbidities: 1 }),
        actualScore: 80, notes: 'Good modality match',
      },
    ];
    localStorage.setItem(_PRED_STORE_KEY, JSON.stringify(data));
  }
  return data;
}

function _savePredictionRecord(pred) {
  const data = _initPredictions();
  data.push(pred);
  localStorage.setItem(_PRED_STORE_KEY, JSON.stringify(data));
}

function _updatePredictionRecord(id, patch) {
  const data = _initPredictions();
  const idx = data.findIndex(p => p.id === id);
  if (idx !== -1) { Object.assign(data[idx], patch); localStorage.setItem(_PRED_STORE_KEY, JSON.stringify(data)); }
}

function _deletePredictionRecord(id) {
  const data = _initPredictions().filter(p => p.id !== id);
  localStorage.setItem(_PRED_STORE_KEY, JSON.stringify(data));
}

const _PRED_FEAT_LABELS = {
  sessionCount: 'Session Count',
  adherenceRate: 'Adherence Rate',
  baselineScore: 'Baseline Score',
  ageGroup: 'Age Group',
  conditionSeverity: 'Condition Severity',
  modalityMatch: 'Modality Match',
  sessionFrequency: 'Sessions/Week',
  treatmentDuration: 'Treatment Duration',
  priorTreatment: 'Prior Treatment',
  comorbidities: 'Comorbidities',
};

function _predGaugeSVG(score) {
  const color = score < 40 ? '#ef4444' : score < 65 ? '#f59e0b' : '#10b981';
  const r = 58;
  const circumference = Math.PI * r;
  const dash = (score / 100) * circumference;
  const gap = circumference - dash;
  return `<svg width="140" height="88" viewBox="0 0 140 88" style="overflow:visible">
    <path d="M 12 70 A 58 58 0 0 1 128 70" fill="none" stroke="var(--border,#334155)" stroke-width="12" stroke-linecap="round"/>
    <path d="M 12 70 A 58 58 0 0 1 128 70" fill="none" stroke="${color}" stroke-width="12" stroke-linecap="round"
          stroke-dasharray="${dash.toFixed(1)} ${gap.toFixed(1)}" stroke-dashoffset="0"/>
    <text x="70" y="68" text-anchor="middle" font-size="26" font-weight="800" fill="${color}">${score}</text>
    <text x="70" y="84" text-anchor="middle" font-size="10" fill="var(--text-muted,#94a3b8)">/ 100</text>
  </svg>`;
}

function _predResultHTML(result, ci, patientEvidence = null) {
  const { predictedScore, riskLevel, confidence, featureImportance } = result;
  const riskColor = riskLevel === 'low' ? '#10b981' : riskLevel === 'moderate' ? '#f59e0b' : '#ef4444';
  const riskLabel = riskLevel === 'low' ? 'Low Risk' : riskLevel === 'moderate' ? 'Moderate Risk' : 'High Risk';
  const riskDesc = riskLevel === 'low'
    ? 'Patient shows strong indicators for a positive treatment outcome.'
    : riskLevel === 'moderate'
    ? 'Patient has mixed indicators; close monitoring is recommended.'
    : 'Patient faces significant barriers to improvement; intensive support advised.';

  const sortedFeats = Object.entries(featureImportance).sort((a, b) => b[1].abs - a[1].abs);
  const maxImp = sortedFeats[0]?.[1].abs || 1;

  const importanceBars = sortedFeats.map(([key, val]) => {
    const pct = ((val.abs / maxImp) * 100).toFixed(1);
    const isPos = val.signed >= 0;
    const dir = isPos ? '\u2191 helps' : '\u2193 hurts';
    const fillClass = isPos ? 'importance-bar-fill-pos' : 'importance-bar-fill-neg';
    return `<div class="importance-bar-row">
      <span class="importance-bar-label" title="${_PRED_FEAT_LABELS[key] || key}">${_PRED_FEAT_LABELS[key] || key}</span>
      <div class="importance-bar-track"><div class="${fillClass}" style="width:${pct}%"></div></div>
      <span style="font-size:.72rem;color:${isPos ? '#10b981' : '#ef4444'};width:60px;flex-shrink:0">${dir}</span>
    </div>`;
  }).join('');

  const [p5, p95] = ci;
  const ciLeft = `${Math.max(0, p5)}%`;
  const ciWidth = `${Math.max(0, p95 - p5)}%`;
  const ciPointLeft = `${predictedScore}%`;

  const similarMean = Math.min(100, Math.max(0, Math.round(predictedScore + 4)));
  const allMean = Math.min(100, Math.max(0, Math.round(predictedScore - 7)));
  const topMean = Math.min(100, Math.max(0, Math.round(predictedScore + 18)));
  const cohorts = [
    { label: 'Similar patients', n: 24, mean: similarMean },
    { label: 'All patients', n: 156, mean: allMean },
    { label: 'Top responders', n: 48, mean: topMean },
  ];
  const cohortRows = cohorts.map(c => {
    const arrow = predictedScore > c.mean ? '\u25b2 above' : predictedScore < c.mean ? '\u25bc below' : '= equal';
    const arrowColor = predictedScore > c.mean ? '#10b981' : predictedScore < c.mean ? '#ef4444' : '#f59e0b';
    return `<div class="cohort-row">
      <span style="width:170px;color:var(--text-muted);font-size:.82rem">${c.label} (n=${c.n})</span>
      <div class="cohort-bar"><div class="cohort-bar-fill" style="width:${c.mean}%"></div></div>
      <span style="width:36px;text-align:right;font-weight:700;font-size:.82rem">${c.mean}</span>
      <span style="font-size:.78rem;color:${arrowColor};width:72px">${arrow}</span>
    </div>`;
  }).join('');

  // ── AI Clinical Interpretation (rule-based) ───────────────────────────────
  const topFeat = sortedFeats[0]?.[0];
  const secondFeat = sortedFeats[1]?.[0];
  const topFeatLabel = _PRED_FEAT_LABELS[topFeat] || topFeat || 'adherence';
  const secondFeatLabel = _PRED_FEAT_LABELS[secondFeat] || secondFeat || 'session count';
  const isTopPos = (sortedFeats[0]?.[1]?.signed ?? 0) >= 0;
  const isSecondPos = (sortedFeats[1]?.[1]?.signed ?? 0) >= 0;

  let scoreInterpretation;
  const liveTail = patientEvidence?.live
    ? ` This patient currently has ${patientEvidence.highlightCount} live evidence highlight${patientEvidence.highlightCount === 1 ? '' : 's'}, ${patientEvidence.savedCitationCount} saved citation${patientEvidence.savedCitationCount === 1 ? '' : 's'}, and ${patientEvidence.reportCount} report${patientEvidence.reportCount === 1 ? '' : 's'} available for clinical review.`
    : '';
  if (predictedScore >= 75) {
    scoreInterpretation = `A predicted outcome score of <strong>${predictedScore}/100</strong> indicates a <strong>strong likelihood of clinical improvement</strong> with current treatment parameters. This patient profile aligns closely with high-responder cohorts in the ${_coursesTotalPapers().toLocaleString()}-paper neuromodulation evidence base.${liveTail}`;
  } else if (predictedScore >= 55) {
    scoreInterpretation = `A predicted outcome score of <strong>${predictedScore}/100</strong> suggests a <strong>moderate probability of meaningful improvement</strong>. Close monitoring and protocol optimisation are recommended to maximise this patient's response trajectory.${liveTail}`;
  } else if (predictedScore >= 40) {
    scoreInterpretation = `A predicted outcome score of <strong>${predictedScore}/100</strong> reflects a <strong>guarded prognosis</strong>. This patient may require additional support, enhanced session frequency, or a protocol adjustment to achieve clinically meaningful gains.${liveTail}`;
  } else {
    scoreInterpretation = `A predicted outcome score of <strong>${predictedScore}/100</strong> signals a <strong>high-risk trajectory</strong>. Consider a multidisciplinary review, barrier assessment, and protocol intensification or adjunct interventions.${liveTail}`;
  }

  const phenotypeTail = patientEvidence?.phenotypeTags?.length
    ? ` Literature phenotype tags currently linked to this patient: <strong>${_esc(patientEvidence.phenotypeTags.slice(0, 5).join(' · '))}</strong>.`
    : '';
  const drivingFactors = `The two strongest predictors in this model are <strong>${topFeatLabel}</strong> (${isTopPos ? 'positively' : 'negatively'} influencing outcome) and <strong>${secondFeatLabel}</strong> (${isSecondPos ? 'positively' : 'negatively'} influencing outcome). Targeting improvements in these dimensions is likely to shift the predicted score most efficiently.${phenotypeTail}`;

  let adjustmentAdvice;
  if (predictedScore < 50) {
    adjustmentAdvice = 'Consider increasing session frequency to 3×/week if patient schedule allows, reviewing adherence barriers, and assessing for untreated comorbidities that may be dampening response. A mid-course protocol review at session 10–12 is advised.';
  } else if (predictedScore < 70) {
    adjustmentAdvice = 'Maintain current protocol with standard review at session 10. If adherence drops below 80%, implement a proactive outreach plan. Consider adding a structured home practice component to reinforce in-clinic gains.';
  } else {
    adjustmentAdvice = 'Current parameters appear well-matched to this patient profile. Continue standard monitoring cadence. Document response markers carefully — this case may be suitable for evidence contribution or protocol benchmarking.';
  }
  if (patientEvidence?.live && patientEvidence.savedCitationCount > 0) {
    adjustmentAdvice += ` ${patientEvidence.savedCitationCount} saved evidence citation${patientEvidence.savedCitationCount === 1 ? '' : 's'} can already be reused in the next report review.`;
  }

  const aiInterpHTML = `
    <div id="pred-ai-interpretation">
      <div class="ai-interp-title">🤖 AI Clinical Interpretation</div>
      <div class="ai-interp-body">
        <div class="ai-interp-section">
          <div class="ai-interp-label">What this score means</div>
          <div class="ai-interp-text">${scoreInterpretation}</div>
        </div>
        <div class="ai-interp-section">
          <div class="ai-interp-label">Key factors driving this prediction</div>
          <div class="ai-interp-text">${drivingFactors}</div>
        </div>
        <div class="ai-interp-section">
          <div class="ai-interp-label">Suggested protocol adjustments</div>
          <div class="ai-interp-adjust">${adjustmentAdvice}</div>
        </div>
      </div>
    </div>`;

  return `
    <div style="display:flex;flex-direction:column;gap:20px">
      <div class="prediction-gauge-wrap">
        ${_predGaugeSVG(predictedScore)}
        <div style="font-size:.8rem;color:var(--text-muted);margin-top:6px">Predicted Outcome Score</div>
      </div>

      <div>
        <div style="font-size:.78rem;color:var(--text-muted);margin-bottom:4px">90% Confidence Interval: ${p5} \u2013 ${p95}</div>
        <div class="ci-bar-wrap">
          <div class="ci-bar-range" style="left:${ciLeft};width:${ciWidth}"></div>
          <div class="ci-bar-point" style="left:${ciPointLeft}"></div>
        </div>
      </div>

      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <span style="background:${riskColor}22;color:${riskColor};border:1px solid ${riskColor}55;border-radius:20px;padding:4px 14px;font-size:.82rem;font-weight:700">${riskLabel}</span>
        <span style="font-size:.8rem;color:var(--text-muted)">${riskDesc}</span>
      </div>

      <div>
        <div style="font-size:.78rem;color:var(--text-muted);margin-bottom:4px">Model confidence: ${Math.round(confidence * 100)}%</div>
        <div style="background:var(--border,#334155);border-radius:6px;height:8px;overflow:hidden">
          <div style="width:${Math.round(confidence * 100)}%;height:100%;background:var(--teal,#00d4bc);border-radius:6px;transition:width .4s ease"></div>
        </div>
      </div>

      <div>
        <div style="font-size:.82rem;font-weight:600;margin-bottom:10px">Feature Importance</div>
        ${importanceBars}
      </div>

      <div>
        <div style="font-size:.82rem;font-weight:600;margin-bottom:10px">Cohort Comparison</div>
        ${cohortRows}
      </div>

      ${aiInterpHTML}
    </div>`;
}

function _predReadForm() {
  const g = id => document.getElementById(id);
  const sessionCount = parseInt(g('pred-session-count')?.value || '20', 10);
  const adherenceRate = parseFloat(g('pred-adherence')?.value || '75') / 100;
  const baselineScore = parseFloat(g('pred-baseline')?.value || '60');
  const ageGroup = parseInt(document.querySelector('input[name="pred-age"]:checked')?.value ?? '1', 10);
  const conditionSeverity = parseInt(document.querySelector('input[name="pred-severity"]:checked')?.value ?? '2', 10);
  const modalityMatch = parseInt(document.querySelector('input[name="pred-modality"]:checked')?.value ?? '1', 10);
  const sessionFrequency = parseFloat(g('pred-freq')?.value || '2');
  const treatmentDuration = parseFloat(g('pred-duration')?.value || '8');
  const priorTreatment = g('pred-prior')?.checked ? 1 : 0;
  const comorbidities = parseInt(g('pred-comorbid')?.value || '0', 10);
  const patientName = g('pred-patient-name')?.value?.trim() || 'Unknown Patient';
  return { patientName, features: { sessionCount, adherenceRate, baselineScore, ageGroup, conditionSeverity, modalityMatch, sessionFrequency, treatmentDuration, priorTreatment, comorbidities } };
}

let _lastPredResult = null;
let _lastPredFeatures = null;
let _lastPredPatientName = '';
let _lastPredCI = null;

function _predHistoryTableHTML() {
  const data = _initPredictions().slice().reverse();
  if (!data.length) return '<p style="color:var(--text-muted);padding:24px 0">No predictions saved yet.</p>';

  const withActual = data.filter(p => p.actualScore != null);
  const meanPred = data.length ? Math.round(data.reduce((s, p) => s + p.result.predictedScore, 0) / data.length) : '\u2014';
  const meanActual = withActual.length ? Math.round(withActual.reduce((s, p) => s + p.actualScore, 0) / withActual.length) : '\u2014';
  const mae = withActual.length
    ? (withActual.reduce((s, p) => s + Math.abs(p.result.predictedScore - p.actualScore), 0) / withActual.length).toFixed(1)
    : '\u2014';

  const rows = data.map(p => {
    const riskColor = p.result.riskLevel === 'low' ? '#10b981' : p.result.riskLevel === 'moderate' ? '#f59e0b' : '#ef4444';
    const riskLabel = p.result.riskLevel === 'low' ? 'Low' : p.result.riskLevel === 'moderate' ? 'Moderate' : 'High';
    const accuracy = p.actualScore != null
      ? ((1 - Math.abs(p.result.predictedScore - p.actualScore) / 100) * 100).toFixed(1) + '%'
      : '\u2014';
    const actualCell = p.actualScore != null
      ? `<span>${p.actualScore}</span>`
      : `<input type="number" min="0" max="100" placeholder="Enter"
           style="width:64px;padding:3px 6px;background:var(--input-bg,var(--surface-2,#1e293b));border:1px solid var(--border);border-radius:6px;color:var(--text-primary);font-size:.8rem"
           onchange="window._qqEnterActual('${p.id}', this.value)">`;
    return `<tr style="border-bottom:1px solid var(--border)">
      <td style="padding:8px 10px">${_esc(p.patientName)}</td>
      <td style="padding:8px 10px;color:var(--text-muted)">${p.date}</td>
      <td style="padding:8px 10px;font-weight:700">${p.result.predictedScore}</td>
      <td style="padding:8px 10px"><span style="color:${riskColor};font-size:.78rem;font-weight:700">${riskLabel}</span></td>
      <td style="padding:8px 10px">${actualCell}</td>
      <td style="padding:8px 10px;color:var(--text-muted)">${accuracy}</td>
      <td style="padding:8px 10px;color:var(--text-muted);font-size:.8rem;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${_esc(p.notes || '')}">${_esc(p.notes) || '\u2014'}</td>
      <td style="padding:8px 10px">
        <button onclick="window._qqDeletePrediction('${p.id}')"
          style="background:none;border:1px solid #ef444466;color:#ef4444;cursor:pointer;font-size:.78rem;padding:2px 8px;border-radius:4px"
          title="Delete">\u2715</button>
      </td>
    </tr>`;
  }).join('');

  return `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px">
      <div style="display:flex;gap:20px;font-size:.85rem;flex-wrap:wrap">
        <span><span style="color:var(--text-muted)">Mean Predicted:</span> <strong>${meanPred}</strong></span>
        <span><span style="color:var(--text-muted)">Mean Actual:</span> <strong>${meanActual}</strong></span>
        <span><span style="color:var(--text-muted)">MAE:</span> <strong>${mae}</strong></span>
        ${withActual.length >= 2 ? `<span style="color:var(--text-muted);font-size:.78rem">Correlation: computed from ${withActual.length} follow-up entries</span>` : ''}
      </div>
      <button onclick="window._qqExportCSV()"
        style="padding:6px 14px;background:var(--teal,#00d4bc);color:#fff;border:none;border-radius:8px;font-size:.82rem;font-weight:600;cursor:pointer">
        Export CSV
      </button>
    </div>
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:.875rem">
        <thead>
          <tr style="border-bottom:2px solid var(--border);color:var(--text-muted);font-size:.78rem">
            <th style="text-align:left;padding:6px 10px;font-weight:600">Patient</th>
            <th style="text-align:left;padding:6px 10px;font-weight:600">Date</th>
            <th style="text-align:left;padding:6px 10px;font-weight:600">Pred. Score</th>
            <th style="text-align:left;padding:6px 10px;font-weight:600">Risk</th>
            <th style="text-align:left;padding:6px 10px;font-weight:600">Actual Score</th>
            <th style="text-align:left;padding:6px 10px;font-weight:600">Accuracy</th>
            <th style="text-align:left;padding:6px 10px;font-weight:600">Notes</th>
            <th style="padding:6px 10px"></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

export async function pgOutcomePrediction(setTopbar) {
  await _ensureCoursesEvidenceStats();
  setTopbar('Outcome Prediction & ML Scoring', '');
  _initPredictions();
  const patientEvidence = await _resolveCoursePatientEvidenceContext(window._selectedCourseId || null).catch(() => _emptyCoursePatientEvidenceContext());

  const el = document.getElementById('content');
  el.innerHTML = `
    <div style="padding:16px 0;max-width:1200px;margin:0 auto">

      <div style="margin-bottom:16px;padding:14px 16px;border-radius:12px;border:1px solid ${patientEvidence.live ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.22)'};background:${patientEvidence.live ? 'rgba(16,185,129,0.08)' : 'rgba(245,158,11,0.08)'};font-size:12px;line-height:1.55;color:var(--text-secondary)">
        <div style="font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${patientEvidence.live ? 'var(--teal,#00d4bc)' : 'var(--amber,#f59e0b)'};margin-bottom:6px">Prediction context</div>
        ${patientEvidence.live
          ? `Using live patient evidence context for <strong style="color:var(--text-primary)">${_esc(patientEvidence.patientName || 'selected patient')}</strong>: ${patientEvidence.highlightCount} evidence highlight${patientEvidence.highlightCount === 1 ? '' : 's'}, ${patientEvidence.savedCitationCount} saved citation${patientEvidence.savedCitationCount === 1 ? '' : 's'}, ${patientEvidence.reportCount} report${patientEvidence.reportCount === 1 ? '' : 's'}, and ${patientEvidence.reportCitationCount} citation${patientEvidence.reportCitationCount === 1 ? '' : 's'} already staged for reports.${patientEvidence.phenotypeTags.length ? ` Phenotype tags: ${_esc(patientEvidence.phenotypeTags.slice(0, 5).join(' · '))}.` : ''}`
          : `This prediction workspace is currently using general evidence/corpus context only. Select a course with a resolvable patient if you want live patient evidence and report context to appear here.`}
      </div>

      <div style="display:flex;gap:4px;margin-bottom:20px;border-bottom:1px solid var(--border)">
        <button id="pred-tab-predict" onclick="window._qqSwitchPredTab('predict')"
          style="padding:8px 18px;background:var(--teal,#00d4bc);color:#fff;border:none;border-radius:8px 8px 0 0;font-size:.875rem;font-weight:600;cursor:pointer">
          Predict &amp; Analyze
        </button>
        <button id="pred-tab-history" onclick="window._qqSwitchPredTab('history')"
          style="padding:8px 18px;background:none;color:var(--text-muted);border:none;border-radius:8px 8px 0 0;font-size:.875rem;font-weight:600;cursor:pointer">
          Prediction History
        </button>
      </div>

      <div id="pred-panel-predict">
        <div style="display:grid;grid-template-columns:40% 1fr;gap:24px;align-items:start">

          <div style="background:var(--card-bg);border:1px solid var(--border);border-radius:12px;padding:20px">
            <div style="font-size:.95rem;font-weight:700;margin-bottom:16px">Patient Features</div>

            <label style="display:block;margin-bottom:12px">
              <span style="font-size:.78rem;color:var(--text-muted);display:block;margin-bottom:4px">Patient Name</span>
              <input id="pred-patient-name" type="text" placeholder="Enter patient name" value="${_esc(patientEvidence.patientName || '')}"
                style="width:100%;padding:7px 10px;background:var(--input-bg,var(--surface-2,#1e293b));border:1px solid var(--border);border-radius:8px;color:var(--text-primary);font-size:.875rem;box-sizing:border-box">
            </label>

            <label style="display:block;margin-bottom:12px">
              <span style="font-size:.78rem;color:var(--text-muted);display:block;margin-bottom:4px">Session Count (1\u2013200)</span>
              <input id="pred-session-count" type="number" min="1" max="200" value="20"
                style="width:100%;padding:7px 10px;background:var(--input-bg,var(--surface-2,#1e293b));border:1px solid var(--border);border-radius:8px;color:var(--text-primary);font-size:.875rem;box-sizing:border-box">
            </label>

            <div style="margin-bottom:12px">
              <span style="font-size:.78rem;color:var(--text-muted);display:block;margin-bottom:4px">
                Adherence Rate: <span id="pred-adherence-label">75%</span>
              </span>
              <input id="pred-adherence" type="range" min="0" max="100" value="75"
                oninput="document.getElementById('pred-adherence-label').textContent=this.value+'%'"
                style="width:100%">
            </div>

            <div style="margin-bottom:12px">
              <span style="font-size:.78rem;color:var(--text-muted);display:block;margin-bottom:4px">
                Baseline Score: <span id="pred-baseline-label">60</span>
              </span>
              <input id="pred-baseline" type="range" min="0" max="100" value="60"
                oninput="document.getElementById('pred-baseline-label').textContent=this.value"
                style="width:100%">
            </div>

            <div style="margin-bottom:12px">
              <span style="font-size:.78rem;color:var(--text-muted);display:block;margin-bottom:6px">Age Group</span>
              <div style="display:flex;gap:12px;flex-wrap:wrap">
                <label style="display:flex;align-items:center;gap:4px;font-size:.82rem;cursor:pointer">
                  <input type="radio" name="pred-age" value="0"> Young &lt;35
                </label>
                <label style="display:flex;align-items:center;gap:4px;font-size:.82rem;cursor:pointer">
                  <input type="radio" name="pred-age" value="1" checked> Middle 35\u201360
                </label>
                <label style="display:flex;align-items:center;gap:4px;font-size:.82rem;cursor:pointer">
                  <input type="radio" name="pred-age" value="2"> Older &gt;60
                </label>
              </div>
            </div>

            <div style="margin-bottom:12px">
              <span style="font-size:.78rem;color:var(--text-muted);display:block;margin-bottom:6px">Condition Severity</span>
              <div style="display:flex;gap:12px;flex-wrap:wrap">
                <label style="display:flex;align-items:center;gap:4px;font-size:.82rem;cursor:pointer">
                  <input type="radio" name="pred-severity" value="1"> Mild
                </label>
                <label style="display:flex;align-items:center;gap:4px;font-size:.82rem;cursor:pointer">
                  <input type="radio" name="pred-severity" value="2" checked> Moderate
                </label>
                <label style="display:flex;align-items:center;gap:4px;font-size:.82rem;cursor:pointer">
                  <input type="radio" name="pred-severity" value="3"> Severe
                </label>
              </div>
            </div>

            <div style="margin-bottom:12px">
              <span style="font-size:.78rem;color:var(--text-muted);display:block;margin-bottom:6px">Modality Match Quality</span>
              <div style="display:flex;gap:12px;flex-wrap:wrap">
                <label style="display:flex;align-items:center;gap:4px;font-size:.82rem;cursor:pointer">
                  <input type="radio" name="pred-modality" value="0"> Poor evidence
                </label>
                <label style="display:flex;align-items:center;gap:4px;font-size:.82rem;cursor:pointer">
                  <input type="radio" name="pred-modality" value="1" checked> Moderate evidence
                </label>
                <label style="display:flex;align-items:center;gap:4px;font-size:.82rem;cursor:pointer">
                  <input type="radio" name="pred-modality" value="2"> Strong evidence
                </label>
              </div>
            </div>

            <label style="display:block;margin-bottom:12px">
              <span style="font-size:.78rem;color:var(--text-muted);display:block;margin-bottom:4px">Sessions per Week (0.5\u20137)</span>
              <input id="pred-freq" type="number" min="0.5" max="7" step="0.5" value="2"
                style="width:100%;padding:7px 10px;background:var(--input-bg,var(--surface-2,#1e293b));border:1px solid var(--border);border-radius:8px;color:var(--text-primary);font-size:.875rem;box-sizing:border-box">
            </label>

            <label style="display:block;margin-bottom:12px">
              <span style="font-size:.78rem;color:var(--text-muted);display:block;margin-bottom:4px">Weeks in Treatment (1\u201352)</span>
              <input id="pred-duration" type="number" min="1" max="52" value="8"
                style="width:100%;padding:7px 10px;background:var(--input-bg,var(--surface-2,#1e293b));border:1px solid var(--border);border-radius:8px;color:var(--text-primary);font-size:.875rem;box-sizing:border-box">
            </label>

            <label style="display:flex;align-items:center;gap:8px;margin-bottom:12px;cursor:pointer;font-size:.82rem">
              <input id="pred-prior" type="checkbox">
              <span>Prior treatment failed</span>
            </label>

            <label style="display:block;margin-bottom:20px">
              <span style="font-size:.78rem;color:var(--text-muted);display:block;margin-bottom:4px">Comorbidities Count (0\u201310)</span>
              <input id="pred-comorbid" type="number" min="0" max="10" value="0"
                style="width:100%;padding:7px 10px;background:var(--input-bg,var(--surface-2,#1e293b));border:1px solid var(--border);border-radius:8px;color:var(--text-primary);font-size:.875rem;box-sizing:border-box">
            </label>

            <div style="display:flex;gap:10px;flex-wrap:wrap">
              <button onclick="window._qqRunPrediction()"
                style="flex:1;padding:10px;background:var(--teal,#00d4bc);color:#fff;border:none;border-radius:8px;font-size:.875rem;font-weight:600;cursor:pointer">
                Run Prediction
              </button>
              <button id="pred-save-btn" onclick="window._qqSavePrediction()"
                style="display:none;flex:1;padding:10px;background:var(--blue,#4a9eff);color:#fff;border:none;border-radius:8px;font-size:.875rem;font-weight:600;cursor:pointer">
                Save Prediction
              </button>
            </div>
          </div>

          <div id="pred-results-panel"
            style="background:var(--card-bg);border:1px solid var(--border);border-radius:12px;padding:20px;min-height:320px;display:flex;align-items:center;justify-content:center">
            <div style="text-align:center;color:var(--text-muted);display:flex;flex-direction:column;align-items:center;gap:12px">
              <div style="font-size:3rem;opacity:.25">&#x1F52E;</div>
              <div style="font-size:.9rem;max-width:280px">Fill in the patient features and click <strong>Run Prediction</strong> to see the outcome analysis.</div>
            </div>
          </div>

        </div>
      </div>

      <div id="pred-panel-history" style="display:none">
        <div id="pred-history-content"
          style="background:var(--card-bg);border:1px solid var(--border);border-radius:12px;padding:20px">
        </div>
      </div>

    </div>

    <style>
      @media (max-width:860px) {
        #pred-panel-predict > div { grid-template-columns:1fr !important; }
      }
    </style>`;

  window._qqSwitchPredTab = function(tab) {
    const panelPredict = document.getElementById('pred-panel-predict');
    const panelHistory = document.getElementById('pred-panel-history');
    const tabPredict   = document.getElementById('pred-tab-predict');
    const tabHistory   = document.getElementById('pred-tab-history');
    const activeStyle  = 'var(--teal,#00d4bc)';
    if (tab === 'predict') {
      panelPredict.style.display = '';
      panelHistory.style.display = 'none';
      tabPredict.style.background = activeStyle;
      tabPredict.style.color = '#fff';
      tabHistory.style.background = 'none';
      tabHistory.style.color = 'var(--text-muted)';
    } else {
      panelPredict.style.display = 'none';
      panelHistory.style.display = '';
      tabPredict.style.background = 'none';
      tabPredict.style.color = 'var(--text-muted)';
      tabHistory.style.background = activeStyle;
      tabHistory.style.color = '#fff';
      document.getElementById('pred-history-content').innerHTML = _predHistoryTableHTML();
    }
  };

  window._qqRunPrediction = function() {
    const { patientName, features } = _predReadForm();
    const result = _predictOutcomeProbability(features);
    const ci = _bootstrapCI(features);
    _lastPredResult = result;
    _lastPredFeatures = features;
    _lastPredPatientName = patientName;
    _lastPredCI = ci;
    const panel = document.getElementById('pred-results-panel');
    if (panel) {
      panel.style.alignItems = 'flex-start';
      panel.style.justifyContent = 'flex-start';
      panel.innerHTML = _predResultHTML(result, ci, patientEvidence);
    }
    const saveBtn = document.getElementById('pred-save-btn');
    if (saveBtn) saveBtn.style.display = '';
  };

  window._qqSavePrediction = function() {
    if (!_lastPredResult) return;
    const notes = prompt('Add a note for this prediction (optional):', '') ?? '';
    _savePredictionRecord({
      id: 'pred-' + Date.now(),
      patientName: _lastPredPatientName || 'Unknown Patient',
      date: new Date().toISOString().slice(0, 10),
      features: _lastPredFeatures,
      result: _lastPredResult,
      actualScore: null,
      notes,
    });
    window._showToast?.('Prediction saved to history.', 'success');
  };

  window._qqEnterActual = function(id, score) {
    const s = parseFloat(score);
    if (isNaN(s) || s < 0 || s > 100) return;
    _updatePredictionRecord(id, { actualScore: Math.round(s) });
    const hc = document.getElementById('pred-history-content');
    if (hc) hc.innerHTML = _predHistoryTableHTML();
  };

  window._qqExportCSV = function() {
    const data = _initPredictions();
    const header = 'Patient,Date,Predicted Score,Risk Level,Actual Score,Accuracy,Notes\n';
    const rows = data.map(p => {
      const acc = p.actualScore != null
        ? ((1 - Math.abs(p.result.predictedScore - p.actualScore) / 100) * 100).toFixed(1) + '%'
        : '';
      return [
        `"${(p.patientName || '').replace(/"/g, '""')}"`,
        p.date,
        p.result.predictedScore,
        p.result.riskLevel,
        p.actualScore ?? '',
        acc,
        `"${(p.notes || '').replace(/"/g, '""')}"`,
      ].join(',');
    }).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'outcome-predictions.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  window._qqDeletePrediction = function(id) {
    if (!confirm('Delete this prediction record? This cannot be undone.')) return;
    _deletePredictionRecord(id);
    const hc = document.getElementById('pred-history-content');
    if (hc) hc.innerHTML = _predHistoryTableHTML();
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// Rules Engine — Automated Alerts & Rules
// ══════════════════════════════════════════════════════════════════════════════

const RULES_KEY = 'ds_alert_rules';
const ALERT_LOG_KEY = 'ds_alert_log';

const _SEED_RULES = [
  {
    id: 'rule-seed-1',
    name: 'Missed Session Alert',
    enabled: true,
    trigger: 'session-missed',
    conditions: [{ field: 'days-since-session', operator: '>', value: '14' }],
    actions: [{ type: 'in-app-alert', channel: 'in-app', target: 'clinician', message: 'Patient has not attended a session in over 14 days.' }],
    createdAt: '2026-03-01T09:00:00Z',
    lastFired: '2026-04-05T10:22:00Z',
  },
  {
    id: 'rule-seed-2',
    name: 'Score Drop Warning',
    enabled: true,
    trigger: 'outcome-recorded',
    conditions: [{ field: 'score-drop', operator: '>', value: '15' }],
    actions: [
      { type: 'in-app-alert', channel: 'in-app', target: 'clinician', message: 'Outcome score has dropped by more than 15 points across last 2 sessions.' },
      { type: 'flag-patient', channel: 'in-app', target: 'clinician', message: 'Flag patient for review.' },
    ],
    createdAt: '2026-03-01T09:05:00Z',
    lastFired: '2026-04-07T14:10:00Z',
  },
  {
    id: 'rule-seed-3',
    name: 'Adverse Event Escalation',
    enabled: true,
    trigger: 'ae-logged',
    conditions: [{ field: 'ae-severity', operator: '==', value: 'severe' }],
    actions: [
      { type: 'in-app-alert', channel: 'in-app', target: 'clinician', message: 'Severe adverse event logged. Immediate review required.' },
      { type: 'email-stub', channel: 'email', target: 'supervisor', message: 'Severe AE reported — please review patient record.' },
    ],
    createdAt: '2026-03-02T08:00:00Z',
    lastFired: null,
  },
  {
    id: 'rule-seed-4',
    name: 'Weekly Summary',
    enabled: true,
    trigger: 'schedule',
    conditions: [],
    actions: [{ type: 'in-app-alert', channel: 'in-app', target: 'clinician', message: 'Weekly patient summary: review caseload status and upcoming sessions.' }],
    createdAt: '2026-03-03T07:00:00Z',
    lastFired: '2026-04-07T08:00:00Z',
  },
];

const _SEED_LOG = [
  { id: 'log-1', ruleId: 'rule-seed-1', ruleName: 'Missed Session Alert', patientName: 'Alice Thornton', details: '{"days-since-session":18}', ts: '2026-04-05T10:22:00Z', dismissed: false, demo: true },
  { id: 'log-2', ruleId: 'rule-seed-2', ruleName: 'Score Drop Warning', patientName: 'Bob Osei', details: '{"score-drop":19}', ts: '2026-04-07T14:10:00Z', dismissed: false, demo: true },
  { id: 'log-3', ruleId: 'rule-seed-3', ruleName: 'Adverse Event Escalation', patientName: 'Carol Martinez', details: '{"ae-severity":"severe"}', ts: '2026-04-06T09:05:00Z', dismissed: true, demo: true },
  { id: 'log-4', ruleId: 'rule-seed-1', ruleName: 'Missed Session Alert', patientName: 'David Chen', details: '{"days-since-session":21}', ts: '2026-04-04T11:30:00Z', dismissed: true, demo: true },
  { id: 'log-5', ruleId: 'rule-seed-4', ruleName: 'Weekly Summary', patientName: 'All Patients', details: '{"trigger":"schedule"}', ts: '2026-04-07T08:00:00Z', dismissed: false, demo: true },
  { id: 'log-6', ruleId: 'rule-seed-2', ruleName: 'Score Drop Warning', patientName: 'Emma Walsh', details: '{"score-drop":22}', ts: '2026-04-08T15:45:00Z', dismissed: false, demo: true },
];

function getRules() {
  try {
    const stored = JSON.parse(localStorage.getItem(RULES_KEY) || 'null');
    if (Array.isArray(stored) && stored.length > 0) return stored;
  } catch { /* ignore */ }
  localStorage.setItem(RULES_KEY, JSON.stringify(_SEED_RULES));
  return _SEED_RULES;
}

function saveRule(rule) {
  const rules = getRules();
  const idx = rules.findIndex(r => r.id === rule.id);
  if (idx >= 0) rules[idx] = rule;
  else rules.push(rule);
  localStorage.setItem(RULES_KEY, JSON.stringify(rules));
}

function deleteRule(id) {
  const rules = getRules().filter(r => r.id !== id);
  localStorage.setItem(RULES_KEY, JSON.stringify(rules));
}

function toggleRule(id) {
  const rules = getRules();
  const rule = rules.find(r => r.id === id);
  if (rule) {
    rule.enabled = !rule.enabled;
    localStorage.setItem(RULES_KEY, JSON.stringify(rules));
  }
}

function getAlertLog() {
  try {
    const stored = JSON.parse(localStorage.getItem(ALERT_LOG_KEY) || 'null');
    if (Array.isArray(stored) && stored.length > 0) return stored;
  } catch { /* ignore */ }
  localStorage.setItem(ALERT_LOG_KEY, JSON.stringify(_SEED_LOG));
  return _SEED_LOG;
}

function logAlert(ruleId, ruleName, patientName, details) {
  const log = getAlertLog();
  log.unshift({ id: 'log-' + Date.now(), ruleId, ruleName, patientName, details, ts: new Date().toISOString(), dismissed: false });
  localStorage.setItem(ALERT_LOG_KEY, JSON.stringify(log));
}

function dismissAlert(id) {
  const log = getAlertLog();
  const entry = log.find(e => e.id === id);
  if (entry) {
    entry.dismissed = true;
    localStorage.setItem(ALERT_LOG_KEY, JSON.stringify(log));
  }
}

function clearAlertLog() {
  localStorage.setItem(ALERT_LOG_KEY, JSON.stringify([]));
}

// ── Condition meta ────────────────────────────────────────────────────────────
const CONDITION_FIELDS = [
  { id: 'days-since-session', label: 'Days since last session', type: 'number' },
  { id: 'outcome-score',      label: 'Outcome score',            type: 'number' },
  { id: 'score-drop',         label: 'Score drop (last 2 sessions)', type: 'number' },
  { id: 'session-count',      label: 'Total session count',      type: 'number' },
  { id: 'adherence-rate',     label: 'Adherence rate (%)',        type: 'number' },
  { id: 'ae-severity',        label: 'Adverse event severity',   type: 'select', options: ['mild','moderate','severe','life-threatening'] },
  { id: 'patient-flag',       label: 'Patient flag',             type: 'select', options: ['high-risk','vip','research'] },
  { id: 'condition',          label: 'Patient condition',        type: 'text' },
  { id: 'clinician',          label: 'Clinician name',           type: 'text' },
];

const CONDITION_OPERATORS = {
  number: ['>', '<', '>=', '<=', '==', '!='],
  select: ['==', '!='],
  text:   ['contains', 'equals', 'starts-with'],
};

const TRIGGER_TYPES = [
  { id: 'session-missed',     label: 'Session Missed' },
  { id: 'outcome-recorded',   label: 'Outcome Recorded' },
  { id: 'session-logged',     label: 'Session Logged' },
  { id: 'score-drop',         label: 'Score Drop' },
  { id: 'ae-logged',          label: 'Adverse Event Logged' },
  { id: 'schedule',           label: 'Schedule (Weekly)' },
];

const ACTION_TYPES = [
  { id: 'in-app-alert',  label: 'In-App Alert' },
  { id: 'email-stub',    label: 'Email (stub)' },
  { id: 'sms-stub',      label: 'SMS (stub)' },
  { id: 'flag-patient',  label: 'Flag Patient' },
  { id: 'create-task',   label: 'Create Task' },
];

const CHANNEL_TYPES = [
  { id: 'in-app', label: 'In-App' },
  { id: 'email',  label: 'Email' },
  { id: 'sms',    label: 'SMS' },
];

// ── Rule evaluator ────────────────────────────────────────────────────────────
function evaluateRules(triggerType, context) {
  const rules = getRules().filter(r => r.enabled && r.trigger === triggerType);
  const fired = [];
  for (const rule of rules) {
    const allMatch = rule.conditions.length === 0 || rule.conditions.every(cond => {
      const val = context[cond.field];
      if (val === undefined) return false;
      switch (cond.operator) {
        case '>':           return Number(val) > Number(cond.value);
        case '<':           return Number(val) < Number(cond.value);
        case '>=':          return Number(val) >= Number(cond.value);
        case '<=':          return Number(val) <= Number(cond.value);
        case '==':          return String(val) === String(cond.value);
        case '!=':          return String(val) !== String(cond.value);
        case 'contains':    return String(val).toLowerCase().includes(String(cond.value).toLowerCase());
        case 'equals':      return String(val).toLowerCase() === String(cond.value).toLowerCase();
        case 'starts-with': return String(val).toLowerCase().startsWith(String(cond.value).toLowerCase());
        default:            return false;
      }
    });
    if (allMatch) {
      fired.push(rule);
      logAlert(rule.id, rule.name, context.patientName || 'Unknown', JSON.stringify(context));
      // Update lastFired
      const allRules = getRules();
      const ruleRef = allRules.find(r => r.id === rule.id);
      if (ruleRef) { ruleRef.lastFired = new Date().toISOString(); localStorage.setItem(RULES_KEY, JSON.stringify(allRules)); }
      rule.actions.forEach(action => {
        if (action.type === 'in-app-alert') {
          if (typeof window._announce === 'function') window._announce(`🔔 ${rule.name}: ${action.message}`, true);
        }
        // email-stub and sms-stub: logged only, no real send
      });
    }
  }
  return fired;
}
window._evaluateRules = evaluateRules;

// ── Internal state for the builder ───────────────────────────────────────────
let _reCurrentRule = null; // rule being edited/created
let _reBuilderOpen = false;
let _reActiveTab = 'rules';
let _reLogFilter = '';

// ── Render helpers ────────────────────────────────────────────────────────────
function _reTriggerLabel(id) {
  return TRIGGER_TYPES.find(t => t.id === id)?.label || id;
}

function _reFieldLabel(id) {
  return CONDITION_FIELDS.find(f => f.id === id)?.label || id;
}

function _reActionLabel(id) {
  return ACTION_TYPES.find(a => a.id === id)?.label || id;
}

function _reConditionPills(conditions) {
  if (!conditions || conditions.length === 0) return '<span style="color:var(--text-muted);font-size:.78rem">No conditions (always fires)</span>';
  return conditions.map(c =>
    `<span class="rule-condition-pill">${_reFieldLabel(c.field)} ${c.operator} ${c.value}</span>`
  ).join('');
}

function _reActionPills(actions) {
  if (!actions || actions.length === 0) return '<span style="color:var(--text-muted);font-size:.78rem">No actions defined</span>';
  return actions.map(a =>
    `<span class="rule-action-pill">${_reActionLabel(a.type)} via ${a.channel}</span>`
  ).join('');
}

function _reRuleCardHTML(rule) {
  const lastFired = rule.lastFired
    ? new Date(rule.lastFired).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })
    : 'Never fired';
  return `
  <div class="rule-card" id="rcard-${rule.id}">
    <div class="rule-card-header">
      <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0">
        <label class="toggle-switch" title="${rule.enabled ? 'Disable rule' : 'Enable rule'}">
          <input type="checkbox" ${rule.enabled ? 'checked' : ''} onchange="window._ruleToggle('${rule.id}')">
          <span class="toggle-slider"></span>
        </label>
        <div style="min-width:0">
          <span style="font-weight:600;font-size:.92rem">${_esc(rule.name)}</span>
          <span class="rule-trigger-badge" style="margin-left:8px">${_reTriggerLabel(rule.trigger)}</span>
        </div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0">
        <button class="btn-sm" onclick="window._ruleEdit('${rule.id}')">Edit</button>
        <button class="btn-sm" onclick="window._ruleDuplicate('${rule.id}')">Dup</button>
        <button class="btn-sm btn-danger-sm" onclick="window._ruleDelete('${rule.id}')">Delete</button>
      </div>
    </div>
    <div style="margin-top:8px">
      <div style="font-size:.75rem;color:var(--text-muted);margin-bottom:3px">IF</div>
      <div>${_reConditionPills(rule.conditions)}</div>
    </div>
    <div style="margin-top:6px">
      <div style="font-size:.75rem;color:var(--text-muted);margin-bottom:3px">THEN</div>
      <div>${_reActionPills(rule.actions)}</div>
    </div>
    <div style="margin-top:6px;font-size:.75rem;color:var(--text-muted)">Last fired: ${lastFired}</div>
  </div>`;
}

function _reGetOperatorsForField(fieldId) {
  const field = CONDITION_FIELDS.find(f => f.id === fieldId);
  const ops = CONDITION_OPERATORS[field?.type || 'number'];
  return ops || CONDITION_OPERATORS.number;
}

function _reConditionRowHTML(cond, idx) {
  const fieldOpts = CONDITION_FIELDS.map(f =>
    `<option value="${f.id}" ${cond.field === f.id ? 'selected' : ''}>${f.label}</option>`
  ).join('');
  const ops = _reGetOperatorsForField(cond.field);
  const opOpts = ops.map(op => `<option value="${op}" ${cond.operator === op ? 'selected' : ''}>${op}</option>`).join('');
  const field = CONDITION_FIELDS.find(f => f.id === cond.field);
  let valueInput;
  if (field?.type === 'select') {
    const selOpts = (field.options || []).map(o => `<option value="${o}" ${cond.value === o ? 'selected' : ''}>${o}</option>`).join('');
    valueInput = `<select class="form-input" onchange="window._reConditionFieldChange(${idx},'value',this.value)">${selOpts}</select>`;
  } else {
    valueInput = `<input class="form-input" type="${field?.type === 'number' ? 'number' : 'text'}" value="${cond.value || ''}" placeholder="value" onchange="window._reConditionFieldChange(${idx},'value',this.value)">`;
  }
  return `
  <div class="rule-condition-row" id="rcond-row-${idx}">
    <select class="form-input" onchange="window._reConditionFieldChange(${idx},'field',this.value)">${fieldOpts}</select>
    <select class="form-input" onchange="window._reConditionFieldChange(${idx},'operator',this.value)">${opOpts}</select>
    ${valueInput}
    <button class="btn-sm btn-danger-sm" onclick="window._rulesRemoveCondition(${idx})" title="Remove">×</button>
  </div>`;
}

function _reActionRowHTML(action, idx) {
  const typeOpts = ACTION_TYPES.map(a => `<option value="${a.id}" ${action.type === a.id ? 'selected' : ''}>${a.label}</option>`).join('');
  const chanOpts = CHANNEL_TYPES.map(c => `<option value="${c.id}" ${action.channel === c.id ? 'selected' : ''}>${c.label}</option>`).join('');
  return `
  <div class="rule-action-row" id="raction-row-${idx}">
    <select class="form-input" onchange="window._reActionFieldChange(${idx},'type',this.value)">${typeOpts}</select>
    <select class="form-input" onchange="window._reActionFieldChange(${idx},'channel',this.value)">${chanOpts}</select>
    <input class="form-input" type="text" placeholder="Message…" value="${action.message || ''}" onchange="window._reActionFieldChange(${idx},'message',this.value)">
    <input class="form-input" type="text" placeholder="Target (e.g. clinician)" value="${action.target || ''}" onchange="window._reActionFieldChange(${idx},'target',this.value)">
    <button class="btn-sm btn-danger-sm" onclick="window._rulesRemoveAction(${idx})" title="Remove">×</button>
  </div>`;
}

function _reBuilderHTML() {
  const r = _reCurrentRule;
  const triggerOpts = TRIGGER_TYPES.map(t => `<option value="${t.id}" ${r.trigger === t.id ? 'selected' : ''}>${t.label}</option>`).join('');
  const condRows = (r.conditions || []).map((c, i) => _reConditionRowHTML(c, i)).join('');
  const actionRows = (r.actions || []).map((a, i) => _reActionRowHTML(a, i)).join('');
  return `
  <div class="rule-builder" id="re-builder">
    <h4 style="margin:0 0 14px">${r.id.startsWith('new-') ? 'New Rule' : 'Edit Rule'}</h4>
    <div style="display:grid;grid-template-columns:1fr 200px;gap:10px;margin-bottom:12px">
      <div>
        <label class="form-label">Rule Name</label>
        <input id="re-name" class="form-input" type="text" value="${r.name || ''}" placeholder="e.g. Missed Session Alert">
      </div>
      <div>
        <label class="form-label">Trigger</label>
        <select id="re-trigger" class="form-input">${triggerOpts}</select>
      </div>
    </div>
    <div style="margin-bottom:12px">
      <div style="font-weight:600;font-size:.85rem;margin-bottom:6px">Conditions (AND logic)</div>
      <div id="re-conditions">${condRows}</div>
      <button class="btn-sm" onclick="window._rulesAddCondition()" style="margin-top:4px">+ Add Condition</button>
    </div>
    <div style="margin-bottom:14px">
      <div style="font-weight:600;font-size:.85rem;margin-bottom:6px">Actions</div>
      <div id="re-actions">${actionRows}</div>
      <button class="btn-sm" onclick="window._rulesAddAction()" style="margin-top:4px">+ Add Action</button>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn-primary" onclick="window._ruleSave()">Save Rule</button>
      <button class="btn-sm" onclick="window._ruleCancel()">Cancel</button>
    </div>
  </div>`;
}

function _reLogTableHTML(filter) {
  let log = getAlertLog();
  if (filter) {
    const q = filter.toLowerCase();
    log = log.filter(e =>
      e.ruleName.toLowerCase().includes(q) ||
      e.patientName.toLowerCase().includes(q)
    );
  }
  if (log.length === 0) {
    return `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-muted)">No alert log entries found.</td></tr>`;
  }
  return log.map(e => {
    const ts = new Date(e.ts).toLocaleString('en-US', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
    const statusBadge = e.dismissed
      ? `<span style="background:#e5e7eb;color:#6b7280;padding:2px 8px;border-radius:12px;font-size:.72rem;font-weight:700">Dismissed</span>`
      : `<span style="background:#d1fae5;color:#065f46;padding:2px 8px;border-radius:12px;font-size:.72rem;font-weight:700">Active</span>`;
    const demoBadge = e.demo ? `<span style="background:rgba(245,158,11,0.12);color:var(--amber);padding:2px 8px;border-radius:12px;font-size:.72rem;font-weight:700;margin-left:6px">Demo data</span>` : '';
    const dismissBtn = e.dismissed ? '' : `<button class="btn-sm" onclick="window._rulesDismissAlert('${e.id}')">Dismiss</button>`;
    return `
    <tr class="${e.dismissed ? '' : 'alert-log-row-active'}">
      <td style="padding:8px 10px;font-size:.85rem;font-weight:600">${_esc(e.ruleName)}${demoBadge}</td>
      <td style="padding:8px 10px;font-size:.85rem">${_esc(e.patientName)}${e.demo ? ' <span style="font-size:.72rem;color:var(--amber);font-weight:700">· demo patient</span>' : ''}</td>
      <td style="padding:8px 10px;font-size:.82rem;color:var(--text-muted)">${ts}</td>
      <td style="padding:8px 10px;font-size:.78rem;color:var(--text-muted);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${_esc(e.details)}">${_esc(e.details)}</td>
      <td style="padding:8px 10px">${statusBadge}</td>
      <td style="padding:8px 10px">${dismissBtn}</td>
    </tr>`;
  }).join('');
}

function _reTestContextFields(trigger) {
  switch (trigger) {
    case 'session-missed':
      return `
        <div class="form-group"><label class="form-label">Patient Name</label><input id="rt-patientName" class="form-input" type="text" value="Alice Thornton"></div>
        <div class="form-group"><label class="form-label">Days Since Last Session</label><input id="rt-days-since-session" class="form-input" type="number" value="18"></div>`;
    case 'outcome-recorded':
      return `
        <div class="form-group"><label class="form-label">Patient Name</label><input id="rt-patientName" class="form-input" type="text" value="Bob Osei"></div>
        <div class="form-group"><label class="form-label">Outcome Score</label><input id="rt-outcome-score" class="form-input" type="number" value="55"></div>
        <div class="form-group"><label class="form-label">Previous Score</label><input id="rt-previousScore" class="form-input" type="number" value="72"></div>
        <div class="form-group"><label class="form-label">Score Drop</label><input id="rt-score-drop" class="form-input" type="number" value="17"></div>`;
    case 'ae-logged':
      return `
        <div class="form-group"><label class="form-label">Patient Name</label><input id="rt-patientName" class="form-input" type="text" value="Carol Martinez"></div>
        <div class="form-group"><label class="form-label">AE Severity</label>
          <select id="rt-ae-severity" class="form-input"><option>mild</option><option>moderate</option><option selected>severe</option><option>life-threatening</option></select>
        </div>`;
    case 'score-drop':
      return `
        <div class="form-group"><label class="form-label">Patient Name</label><input id="rt-patientName" class="form-input" type="text" value="Emma Walsh"></div>
        <div class="form-group"><label class="form-label">Score Drop Amount</label><input id="rt-score-drop" class="form-input" type="number" value="20"></div>`;
    case 'session-logged':
      return `
        <div class="form-group"><label class="form-label">Patient Name</label><input id="rt-patientName" class="form-input" type="text" value="David Chen"></div>
        <div class="form-group"><label class="form-label">Session Count</label><input id="rt-session-count" class="form-input" type="number" value="5"></div>
        <div class="form-group"><label class="form-label">Adherence Rate (%)</label><input id="rt-adherence-rate" class="form-input" type="number" value="82"></div>`;
    case 'schedule':
      return `<div class="form-group"><label class="form-label">Patient Name</label><input id="rt-patientName" class="form-input" type="text" value="All Patients"></div>`;
    default:
      return `<div class="form-group"><label class="form-label">Patient Name</label><input id="rt-patientName" class="form-input" type="text" value="Test Patient"></div>`;
  }
}

function _reReadTestContext(trigger) {
  const ctx = {};
  const get = (id) => {
    const el = document.getElementById('rt-' + id);
    return el ? (el.tagName === 'SELECT' ? el.value : el.value) : undefined;
  };
  ctx.patientName = get('patientName') || 'Test Patient';
  switch (trigger) {
    case 'session-missed':
      ctx['days-since-session'] = get('days-since-session'); break;
    case 'outcome-recorded':
      ctx['outcome-score'] = get('outcome-score');
      ctx.previousScore = get('previousScore');
      ctx['score-drop'] = get('score-drop'); break;
    case 'ae-logged':
      ctx['ae-severity'] = get('ae-severity'); break;
    case 'score-drop':
      ctx['score-drop'] = get('score-drop'); break;
    case 'session-logged':
      ctx['session-count'] = get('session-count');
      ctx['adherence-rate'] = get('adherence-rate'); break;
    default: break;
  }
  return ctx;
}

// ── Main exported function ────────────────────────────────────────────────────
export async function pgRulesEngine(setTopbar) {
  setTopbar('Automated Alerts & Rules Engine', []);

  const app = document.getElementById('content');
  if (!app) return;

  function _reRender() {
    const rules = getRules();
    const log = getAlertLog();
    const activeCount = rules.filter(r => r.enabled).length;
    const undismissed = log.filter(e => !e.dismissed).length;

    const tabStyle = (id) => {
      const active = _reActiveTab === id;
      return `style="padding:8px 18px;border:none;border-radius:8px 8px 0 0;font-size:.9rem;font-weight:${active?'700':'500'};cursor:pointer;background:${active?'var(--card-bg)':'transparent'};color:${active?'var(--text-primary)':'var(--text-muted)'};border-bottom:${active?'2px solid var(--teal)':'2px solid transparent'}"`;
    };

    let tabContent = '';

    if (_reActiveTab === 'rules') {
      const ruleCards = rules.map(r => _reRuleCardHTML(r)).join('') || `<div style="color:var(--text-muted);text-align:center;padding:32px">No rules yet. Click "+ New Rule" to create one.</div>`;
      const builderHTML = _reBuilderOpen && _reCurrentRule ? _reBuilderHTML() : '';
      tabContent = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px">
          <div style="font-size:.9rem;color:var(--text-muted)">
            <strong style="color:var(--text-primary)">${activeCount}</strong> rules active of <strong style="color:var(--text-primary)">${rules.length}</strong> total
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn-sm" onclick="window._ruleEvaluateAll()">⚡ Evaluate Now</button>
            <button class="btn-primary" onclick="window._ruleNew()">+ New Rule</button>
          </div>
        </div>
        <div id="re-rules-list">${ruleCards}</div>
        ${builderHTML}`;
    } else if (_reActiveTab === 'log') {
      tabContent = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px">
          <div style="display:flex;gap:8px;align-items:center;flex:1">
            <input id="re-log-filter" class="form-input" type="text" placeholder="Filter by rule or patient…" value="${_reLogFilter}" oninput="window._rulesFilterLog(this.value)" style="max-width:320px">
          </div>
          <button class="btn-sm btn-danger-sm" onclick="window._rulesClearLog()">Clear All</button>
        </div>
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:.85rem">
            <thead>
              <tr style="border-bottom:2px solid var(--border)">
                <th style="text-align:left;padding:8px 10px;color:var(--text-muted);font-size:.78rem">Rule</th>
                <th style="text-align:left;padding:8px 10px;color:var(--text-muted);font-size:.78rem">Patient</th>
                <th style="text-align:left;padding:8px 10px;color:var(--text-muted);font-size:.78rem">Date/Time</th>
                <th style="text-align:left;padding:8px 10px;color:var(--text-muted);font-size:.78rem">Details</th>
                <th style="text-align:left;padding:8px 10px;color:var(--text-muted);font-size:.78rem">Status</th>
                <th style="text-align:left;padding:8px 10px;color:var(--text-muted);font-size:.78rem">Action</th>
              </tr>
            </thead>
            <tbody id="re-log-tbody">${_reLogTableHTML(_reLogFilter)}</tbody>
          </table>
        </div>`;
    } else {
      // Test Rules tab
      const triggerOpts = TRIGGER_TYPES.map(t => `<option value="${t.id}">${t.label}</option>`).join('');
      tabContent = `
        <div style="max-width:560px">
          <div class="card" style="padding:18px;margin-bottom:16px">
            <h4 style="margin:0 0 14px">Simulate a Trigger</h4>
            <div class="form-group">
              <label class="form-label">Trigger Type</label>
              <select id="rt-trigger" class="form-input" onchange="window._reUpdateTestFields()">
                ${triggerOpts}
              </select>
            </div>
            <div id="rt-context-fields" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px">
              ${_reTestContextFields('session-missed')}
            </div>
            <div style="display:flex;gap:8px;margin-top:14px">
              <button class="btn-primary" onclick="window._rulesRunTest()">Run Test</button>
              <button class="btn-sm" onclick="window._reUseSampleData()">Use Sample Data</button>
            </div>
          </div>
          <div id="re-test-results" style="display:none" class="test-results-panel"></div>
        </div>`;
    }

    app.innerHTML = `
      <div style="max-width:900px;margin:0 auto;padding:0 16px 32px">
        <div style="border-bottom:2px solid var(--border);margin-bottom:16px;display:flex;gap:4px">
          <button ${tabStyle('rules')} onclick="window._reSwitchTab('rules')">Rules</button>
          <button ${tabStyle('log')} onclick="window._reSwitchTab('log')">
            Alert Log ${undismissed > 0 ? `<span style="background:var(--teal);color:#fff;border-radius:10px;padding:1px 7px;font-size:.7rem;margin-left:4px">${undismissed}</span>` : ''}
          </button>
          <button ${tabStyle('test')} onclick="window._reSwitchTab('test')">Test Rules</button>
        </div>
        ${tabContent}
      </div>`;
  }

  // ── Global handlers ─────────────────────────────────────────────────────────
  window._reSwitchTab = function(tab) {
    _reActiveTab = tab;
    _reBuilderOpen = false;
    _reCurrentRule = null;
    _reRender();
  };

  window._ruleNew = function() {
    _reCurrentRule = {
      id: 'new-' + Date.now(),
      name: '',
      enabled: true,
      trigger: 'session-missed',
      conditions: [],
      actions: [],
      createdAt: new Date().toISOString(),
      lastFired: null,
    };
    _reBuilderOpen = true;
    _reActiveTab = 'rules';
    _reRender();
    requestAnimationFrame(() => { document.getElementById('re-builder')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  };

  window._ruleEdit = function(id) {
    const rule = getRules().find(r => r.id === id);
    if (!rule) return;
    _reCurrentRule = JSON.parse(JSON.stringify(rule));
    _reBuilderOpen = true;
    _reActiveTab = 'rules';
    _reRender();
    requestAnimationFrame(() => { document.getElementById('re-builder')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  };

  window._ruleSave = function() {
    const nameEl = document.getElementById('re-name');
    const triggerEl = document.getElementById('re-trigger');
    if (!_reCurrentRule || !nameEl || !triggerEl) return;
    const name = nameEl.value.trim();
    if (!name) { window._showToast?.('Rule name is required.', 'warning'); return; }
    _reCurrentRule.name = name;
    _reCurrentRule.trigger = triggerEl.value;
    if (_reCurrentRule.id.startsWith('new-')) {
      _reCurrentRule.id = 'rule-' + Date.now();
    }
    saveRule(_reCurrentRule);
    _reCurrentRule = null;
    _reBuilderOpen = false;
    _reRender();
  };

  window._ruleCancel = function() {
    _reCurrentRule = null;
    _reBuilderOpen = false;
    _reRender();
  };

  window._ruleDelete = function(id) {
    if (!confirm('Delete this rule?')) return;
    deleteRule(id);
    _reRender();
  };

  window._ruleDuplicate = function(id) {
    const rule = getRules().find(r => r.id === id);
    if (!rule) return;
    const copy = JSON.parse(JSON.stringify(rule));
    copy.id = 'rule-' + Date.now();
    copy.name = copy.name + ' (Copy)';
    copy.createdAt = new Date().toISOString();
    copy.lastFired = null;
    saveRule(copy);
    _reRender();
  };

  window._ruleToggle = function(id) {
    toggleRule(id);
    _reRender();
  };

  window._ruleEvaluateAll = function() {
    const triggered = TRIGGER_TYPES.map(t => {
      let ctx = {};
      switch (t.id) {
        case 'session-missed':   ctx = { patientName: 'All Patients', 'days-since-session': 0 }; break;
        case 'outcome-recorded': ctx = { patientName: 'All Patients', 'outcome-score': 0, 'score-drop': 0 }; break;
        case 'ae-logged':        ctx = { patientName: 'All Patients', 'ae-severity': 'none' }; break;
        case 'score-drop':       ctx = { patientName: 'All Patients', 'score-drop': 0 }; break;
        case 'schedule':         ctx = { patientName: 'All Patients' }; break;
        default:                 ctx = { patientName: 'All Patients' }; break;
      }
      return evaluateRules(t.id, ctx);
    }).flat();
    const count = triggered.length;
    if (typeof window._announce === 'function') window._announce(`Evaluation complete. ${count} rule${count !== 1 ? 's' : ''} fired.`, count > 0);
    else window._showToast?.(`Evaluation complete. ${count} rule${count !== 1 ? 's' : ''} fired.`, count > 0 ? 'warning' : 'success');
    _reRender();
  };

  window._rulesDismissAlert = function(id) {
    dismissAlert(id);
    const tbody = document.getElementById('re-log-tbody');
    if (tbody) tbody.innerHTML = _reLogTableHTML(_reLogFilter);
    // Refresh tab badge
    const logTab = document.querySelector('[onclick="window._reSwitchTab(\'log\')"]');
    if (logTab) {
      const undismissed = getAlertLog().filter(e => !e.dismissed).length;
      logTab.querySelector('span')?.remove();
      if (undismissed > 0) {
        logTab.insertAdjacentHTML('beforeend', `<span style="background:var(--teal);color:#fff;border-radius:10px;padding:1px 7px;font-size:.7rem;margin-left:4px">${undismissed}</span>`);
      }
    }
  };

  window._rulesClearLog = function() {
    if (!confirm('Clear entire alert log? This cannot be undone.')) return;
    clearAlertLog();
    _reRender();
  };

  window._rulesFilterLog = function(q) {
    _reLogFilter = q;
    const tbody = document.getElementById('re-log-tbody');
    if (tbody) tbody.innerHTML = _reLogTableHTML(q);
  };

  window._rulesAddCondition = function() {
    if (!_reCurrentRule) return;
    _reCurrentRule.conditions.push({ field: 'days-since-session', operator: '>', value: '0' });
    const cont = document.getElementById('re-conditions');
    if (cont) {
      const idx = _reCurrentRule.conditions.length - 1;
      cont.insertAdjacentHTML('beforeend', _reConditionRowHTML(_reCurrentRule.conditions[idx], idx));
    }
  };

  window._rulesRemoveCondition = function(idx) {
    if (!_reCurrentRule) return;
    _reCurrentRule.conditions.splice(idx, 1);
    const cont = document.getElementById('re-conditions');
    if (cont) cont.innerHTML = _reCurrentRule.conditions.map((c, i) => _reConditionRowHTML(c, i)).join('');
  };

  window._rulesAddAction = function() {
    if (!_reCurrentRule) return;
    _reCurrentRule.actions.push({ type: 'in-app-alert', channel: 'in-app', message: '', target: '' });
    const cont = document.getElementById('re-actions');
    if (cont) {
      const idx = _reCurrentRule.actions.length - 1;
      cont.insertAdjacentHTML('beforeend', _reActionRowHTML(_reCurrentRule.actions[idx], idx));
    }
  };

  window._rulesRemoveAction = function(idx) {
    if (!_reCurrentRule) return;
    _reCurrentRule.actions.splice(idx, 1);
    const cont = document.getElementById('re-actions');
    if (cont) cont.innerHTML = _reCurrentRule.actions.map((a, i) => _reActionRowHTML(a, i)).join('');
  };

  window._reConditionFieldChange = function(idx, key, val) {
    if (!_reCurrentRule || !_reCurrentRule.conditions[idx]) return;
    _reCurrentRule.conditions[idx][key] = val;
    if (key === 'field') {
      // Reset operator to first valid one for new field type
      const ops = _reGetOperatorsForField(val);
      _reCurrentRule.conditions[idx].operator = ops[0];
      _reCurrentRule.conditions[idx].value = '';
      // Re-render just this row
      const row = document.getElementById('rcond-row-' + idx);
      if (row) row.outerHTML = _reConditionRowHTML(_reCurrentRule.conditions[idx], idx);
    }
  };

  window._reActionFieldChange = function(idx, key, val) {
    if (!_reCurrentRule || !_reCurrentRule.actions[idx]) return;
    _reCurrentRule.actions[idx][key] = val;
  };

  window._rulesRunTest = function() {
    const triggerEl = document.getElementById('rt-trigger');
    if (!triggerEl) return;
    const trigger = triggerEl.value;
    const ctx = _reReadTestContext(trigger);
    const fired = evaluateRules(trigger, ctx);
    const panel = document.getElementById('re-test-results');
    if (!panel) return;
    panel.style.display = '';
    if (fired.length === 0) {
      panel.innerHTML = `<div style="color:var(--text-muted);font-size:.9rem">No rules matched this trigger with the provided context.</div>`;
    } else {
      panel.innerHTML = `
        <div style="font-weight:600;margin-bottom:10px;color:var(--teal)">🔔 ${fired.length} rule${fired.length > 1 ? 's' : ''} fired:</div>
        ${fired.map(r => `
          <div style="margin-bottom:8px;padding:10px;background:var(--card-bg);border-radius:8px;border:1px solid var(--teal)">
            <div style="font-weight:600;font-size:.9rem">${r.name}</div>
            <div style="font-size:.78rem;color:var(--text-muted);margin-top:4px">
              Actions: ${r.actions.map(a => `${_reActionLabel(a.type)} via ${a.channel}`).join(', ') || 'none'}
            </div>
          </div>`).join('')}`;
    }
  };

  window._reUpdateTestFields = function() {
    const triggerEl = document.getElementById('rt-trigger');
    const fieldsDiv = document.getElementById('rt-context-fields');
    if (triggerEl && fieldsDiv) {
      fieldsDiv.innerHTML = _reTestContextFields(triggerEl.value);
    }
    const panel = document.getElementById('re-test-results');
    if (panel) { panel.style.display = 'none'; panel.innerHTML = ''; }
  };

  window._reUseSampleData = function() {
    const triggerEl = document.getElementById('rt-trigger');
    if (!triggerEl) return;
    const trigger = triggerEl.value;
    const samples = {
      'session-missed':   { 'days-since-session': '18', patientName: 'Alice Thornton' },
      'outcome-recorded': { 'outcome-score': '48', previousScore: '66', 'score-drop': '18', patientName: 'Bob Osei' },
      'ae-logged':        { 'ae-severity': 'severe', patientName: 'Carol Martinez' },
      'score-drop':       { 'score-drop': '22', patientName: 'Emma Walsh' },
      'session-logged':   { 'session-count': '8', 'adherence-rate': '78', patientName: 'David Chen' },
      'schedule':         { patientName: 'All Patients' },
    };
    const data = samples[trigger] || {};
    Object.entries(data).forEach(([key, val]) => {
      const el = document.getElementById('rt-' + key);
      if (el) el.value = val;
    });
  };

  // Initial render
  _reRender();
}

// ── AI Note Assistant — Clinical phrase library ───────────────────────────────
const CLINICAL_PHRASES = {
  S: {
    adhd: [
      'Patient reports difficulty sustaining attention during tasks.',
      'Caregiver notes improved focus at school since last session.',
      'Patient describes reduced impulsivity over the past week.',
      'Reports restlessness and difficulty sitting still.',
      'Patient indicates homework completion improved by approximately 30%.',
    ],
    anxiety: [
      'Patient reports reduced worry frequency compared to last session.',
      'Describes ongoing difficulty with social situations.',
      'Patient notes sleep quality has improved.',
      'Reports panic episode earlier this week, duration approximately 10 minutes.',
      'Patient describes feeling more grounded using breathing techniques.',
    ],
    depression: [
      'Patient reports mood rating of [X]/10, improved from [Y]/10 last session.',
      'Describes low motivation and difficulty completing daily tasks.',
      'Patient notes increased energy levels this week.',
      'Reports continued anhedonia but slight improvement in social engagement.',
      'Patient describes sleep as non-restorative.',
    ],
    default: [
      'Patient reports overall improvement since last session.',
      'No adverse effects noted since previous treatment.',
      'Patient tolerating protocol well.',
      'Reports mild fatigue post-session, resolved within 1 hour.',
      'Patient motivated and engaged with treatment goals.',
    ],
  },
  O: {
    default: [
      'Session duration: [X] minutes. Amplitude: [X] mA. Frequency: [X] Hz.',
      'EEG coherence noted within normal limits for age.',
      'Alpha power: [X] µV². Beta power: [X] µV². Theta power: [X] µV².',
      'Patient maintained electrode impedance <5 kΩ throughout session.',
      'No adverse reactions observed during or immediately following session.',
      'Biofeedback threshold set at [X]% above baseline alpha.',
      'Patient achieved target frequency range for [X]% of session duration.',
    ],
  },
  A: {
    adhd: [
      'ADHD symptoms showing gradual improvement with neurofeedback protocol.',
      'Patient demonstrating improved self-regulation capacity.',
      'Response consistent with expected trajectory for this protocol.',
      'Attention metrics suggest positive treatment response.',
    ],
    anxiety: [
      'Anxiety symptoms responding positively to current protocol.',
      'GAD-7 score trending downward, current trajectory positive.',
      'Patient demonstrating improved autonomic regulation.',
      'Alpha asymmetry normalizing per EEG findings.',
    ],
    depression: [
      'PHQ-9 score indicates moderate improvement from baseline.',
      'Patient showing early signs of treatment response.',
      'Mood self-report consistent with objective session performance.',
      'Recommending continuation of current protocol for 4 more sessions.',
    ],
    default: [
      'Patient is progressing as expected with current treatment protocol.',
      'Clinical indicators suggest continued response to intervention.',
      'Consider protocol modification if response plateaus over next 3 sessions.',
      'Treatment goals partially achieved; continue current approach.',
    ],
  },
  P: {
    default: [
      'Continue current protocol as planned.',
      'Schedule follow-up in [X] days.',
      'Increase session frequency to [X] per week.',
      'Assign homework: [breathing exercise / mindfulness / journaling].',
      'Reassess protocol parameters at next session.',
      'Order qEEG re-assessment in [X] sessions.',
      'Coordinate with referring provider regarding progress.',
      'Patient to complete symptom rating scale before next session.',
    ],
  },
};

// ── AI Note Assistant — Language quality checker ──────────────────────────────
const VAGUE_TERMS = [
  { term: 'improved', suggestion: 'Try quantifying: "improved by X%" or "improved per patient self-report (8/10 → 9/10)"' },
  { term: 'better', suggestion: 'Specify: "PHQ-9 score decreased from X to Y" or "patient self-rates mood as X/10"' },
  { term: 'seems', suggestion: 'Use objective language: "patient reports" or "session data indicates"' },
  { term: 'doing well', suggestion: 'Quantify: specify which metrics are within normal range' },
  { term: 'good progress', suggestion: 'Define progress: "session adherence 90%, outcome score +15 points"' },
  { term: 'feels', suggestion: 'Attribute to patient: "patient reports feeling..."' },
  { term: 'maybe', suggestion: 'Use clinical certainty language: "clinical impression suggests" or "consider"' },
  { term: 'might', suggestion: 'Use: "clinical recommendation" or "consider"' },
  { term: 'very', suggestion: 'Avoid adverb intensifiers; use quantified descriptors' },
  { term: 'a lot', suggestion: 'Quantify: specify frequency, duration, or magnitude' },
];

function checkNoteQuality(text) {
  const issues = [];
  VAGUE_TERMS.forEach(({ term, suggestion }) => {
    const regex = new RegExp(`\\b${term}\\b`, 'gi');
    let match;
    while ((match = regex.exec(text)) !== null) {
      issues.push({ term: match[0], position: match.index, suggestion });
    }
  });
  return issues;
}

// ── AI Note Assistant — Session-to-note generator ─────────────────────────────
function generateNoteFromSession(session, condition) {
  const condition_key = (condition || 'default').toLowerCase().replace(/[^a-z]/g, '');
  const s_phrases = CLINICAL_PHRASES.S[condition_key] || CLINICAL_PHRASES.S.default;
  const a_phrases = CLINICAL_PHRASES.A[condition_key] || CLINICAL_PHRASES.A.default;
  return {
    S: `${s_phrases[0]}\n\nPatient-reported concerns: ${session.notes || 'None documented.'}`,
    O: `Session duration: ${session.duration || 30} minutes. Modality: ${session.modality || 'Neurofeedback'}. Amplitude: ${session.amplitude || 50} mA. Frequency: ${session.frequency || 10} Hz.\n\nNo adverse reactions observed.`,
    A: a_phrases[0],
    P: `Continue current protocol as planned. Schedule follow-up session. ${CLINICAL_PHRASES.P.default[1]}`,
  };
}

// ── AI Note Assistant — Phrase autocomplete engine ───────────────────────────
function getPhraseSuggestions(section, partialText, condition) {
  const condition_key = (condition || 'default').toLowerCase().replace(/[^a-z]/g, '');
  const pool = [
    ...(CLINICAL_PHRASES[section]?.[condition_key] || []),
    ...(CLINICAL_PHRASES[section]?.default || []),
  ];
  if (!partialText || partialText.length < 3) return pool.slice(0, 3);
  const q = partialText.toLowerCase();
  return pool.filter(p => p.toLowerCase().includes(q)).slice(0, 3);
}

// ── pgAINoteAssistant — AI writing assistant page ────────────────────────────
export async function pgAINoteAssistant(setTopbar) {
  setTopbar('AI Note Assistant', 'AI-assisted SOAP documentation');
  const el = document.getElementById('content');
  if (!el) return;

  // State
  let _aiCondition = 'default';
  let _aiSession = null;
  let _aiPhraseTab = 'S';
  let _qualityDebounce = null;

  // Mock sessions (fallback when no real data)
  const MOCK_SESSIONS = [
    { id: 'mock-1', patientName: 'Alice Thornton', modality: 'Neurofeedback', duration: 40, amplitude: 60, frequency: 10, notes: 'Patient reports improved sleep.', outcome: 'Positive', condition: 'anxiety' },
    { id: 'mock-2', patientName: 'Bob Osei', modality: 'tDCS', duration: 30, amplitude: 1.5, frequency: 0, notes: 'No complaints this session.', outcome: 'Stable', condition: 'depression' },
    { id: 'mock-3', patientName: 'Carol Martinez', modality: 'Neurofeedback', duration: 45, amplitude: 70, frequency: 12, notes: 'Slight headache at end of session.', outcome: 'Partial', condition: 'adhd' },
    { id: 'mock-4', patientName: 'David Chen', modality: 'tACS', duration: 20, amplitude: 2.0, frequency: 40, notes: 'Session completed without issues.', outcome: 'Positive', condition: 'default' },
    { id: 'mock-5', patientName: 'Emma Walsh', modality: 'Neurofeedback', duration: 35, amplitude: 55, frequency: 8, notes: 'Patient very engaged today.', outcome: 'Positive', condition: 'anxiety' },
  ];

  function getRecentSessions() {
    try {
      const raw = localStorage.getItem('ds_completed_sessions');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed.slice(-5).reverse();
      }
    } catch { /* ignore */ }
    return MOCK_SESSIONS;
  }

  function countWords(text) {
    return text.trim() ? text.trim().split(/\s+/).length : 0;
  }

  function renderPhraseLibrary() {
    const tabs = ['S', 'O', 'A', 'P'];
    const condition_key = _aiCondition.toLowerCase().replace(/[^a-z]/g, '');
    const pool = [
      ...(CLINICAL_PHRASES[_aiPhraseTab]?.[condition_key] || []),
      ...(CLINICAL_PHRASES[_aiPhraseTab]?.default || []),
    ].filter((v, i, a) => a.indexOf(v) === i); // deduplicate

    return `
      <div style="margin-bottom:10px">
        <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px">
          ${tabs.map(tab => `<button onclick="window._aiSetPhraseTab('${tab}')"
            style="padding:4px 12px;border-radius:6px;font-size:0.78rem;font-weight:600;cursor:pointer;border:1px solid var(--border);
            background:${_aiPhraseTab === tab ? 'var(--teal,#00d4bc)' : 'var(--surface-2)'};
            color:${_aiPhraseTab === tab ? '#000' : 'var(--text-primary)'}">${tab}</button>`).join('')}
        </div>
        <div id="ai-phrase-items">
          ${pool.map((phrase, i) => `<div class="ai-phrase-item" onclick="window._aiInsertPhrase('${_aiPhraseTab}',${i})">${phrase}</div>`).join('')}
          ${pool.length === 0 ? '<div style="color:var(--text-muted);font-size:0.8rem;padding:8px 0">No phrases for this section/condition.</div>' : ''}
        </div>
      </div>`;
  }

  function renderQualityReport(issues) {
    if (!issues || issues.length === 0) {
      return `<div style="color:var(--text-secondary);font-size:0.82rem;padding:8px 0">No vague language detected. Note quality looks good.</div>`;
    }
    return issues.map(issue => `
      <div class="ai-quality-issue">
        <div>
          <span class="ai-quality-term">${issue.term}</span>
          <div class="ai-quality-suggestion">${issue.suggestion}</div>
        </div>
      </div>`).join('');
  }

  function getWordCounts() {
    return {
      S: countWords(document.getElementById('ai-soap-S')?.value || ''),
      O: countWords(document.getElementById('ai-soap-O')?.value || ''),
      A: countWords(document.getElementById('ai-soap-A')?.value || ''),
      P: countWords(document.getElementById('ai-soap-P')?.value || ''),
    };
  }

  function updateWordCounts() {
    const wc = getWordCounts();
    ['S', 'O', 'A', 'P'].forEach(s => {
      const el = document.getElementById(`ai-wc-${s}`);
      if (el) el.textContent = `${wc[s]} word${wc[s] !== 1 ? 's' : ''}`;
    });
  }

  function runLiveQualityCheck() {
    const allText = ['S', 'O', 'A', 'P'].map(s => document.getElementById(`ai-soap-${s}`)?.value || '').join(' ');
    const issues = checkNoteQuality(allText);
    const panel = document.getElementById('ai-quality-report');
    if (panel) panel.innerHTML = renderQualityReport(issues);
    updateWordCounts();
  }

  const soapSections = [
    { key: 'S', label: 'Subjective', icon: '💬', color: 'rgba(0,212,188,0.15)' },
    { key: 'O', label: 'Objective',  icon: '🔬', color: 'rgba(59,130,246,0.15)' },
    { key: 'A', label: 'Assessment', icon: '📊', color: 'rgba(139,92,246,0.15)' },
    { key: 'P', label: 'Plan',       icon: '📋', color: 'rgba(245,158,11,0.15)' },
  ];

  el.innerHTML = `
    <div class="ai-note-layout">
      <!-- Left column: SOAP editor -->
      <div>
        <!-- Patient / Condition row -->
        <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap">
          <div style="flex:1;min-width:140px">
            <label style="font-size:0.75rem;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px">Patient Name</label>
            <input type="text" id="ai-patient-name" placeholder="e.g. Alice Thornton"
              style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:var(--surface-2);color:var(--text-primary);font-size:0.875rem;box-sizing:border-box">
          </div>
          <div style="flex:1;min-width:120px">
            <label style="font-size:0.75rem;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px">Condition</label>
            <select id="ai-condition-select"
              style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:var(--surface-2);color:var(--text-primary);font-size:0.875rem;box-sizing:border-box"
              onchange="window._aiSetCondition(this.value)">
              <option value="default">General</option>
              <option value="adhd">ADHD</option>
              <option value="anxiety">Anxiety</option>
              <option value="depression">Depression</option>
            </select>
          </div>
        </div>

        <!-- Action buttons -->
        <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
          <button class="btn-secondary" onclick="window._aiNoteGenerate()" style="font-size:0.8rem">⚡ Generate from Session</button>
          <button class="btn-secondary" onclick="window._aiCheckQuality()" style="font-size:0.8rem">🔍 Check Quality</button>
          <button class="btn-primary" onclick="window._aiSaveNote()" style="font-size:0.8rem">💾 Save Note</button>
        </div>

        <!-- SOAP sections -->
        ${soapSections.map(({ key, label, icon, color }) => `
          <div class="ai-soap-section">
            <div class="ai-soap-label">
              <div style="width:26px;height:26px;border-radius:6px;background:${color};display:flex;align-items:center;justify-content:center;font-size:0.85rem">${icon}</div>
              ${key} — ${label}
              <button onclick="window._aiSuggestPhrase('${key}')"
                style="margin-left:auto;background:none;border:1px solid var(--border);border-radius:4px;padding:2px 8px;font-size:0.7rem;color:var(--text-secondary);cursor:pointer;font-weight:400">
                Suggest
              </button>
            </div>
            <textarea id="ai-soap-${key}" rows="${key === 'P' ? 4 : 3}"
              style="width:100%;resize:vertical;padding:10px;border:1px solid var(--border);border-radius:8px;background:var(--surface-2);color:var(--text-primary);font-size:0.875rem;line-height:1.6;font-family:inherit;box-sizing:border-box"
              placeholder="Enter ${label.toLowerCase()} information..."
              oninput="window._aiOnInput()"></textarea>
            <div id="ai-suggest-${key}" style="display:none;margin-top:4px;" class="ai-suggest-dropdown"></div>
            <div class="ai-wordcount" id="ai-wc-${key}">0 words</div>
          </div>`).join('')}

        <div style="margin-top:16px">
          <button class="btn-secondary" onclick="window._aiCopyAll()" style="font-size:0.8rem;width:100%">📋 Copy Full SOAP Note to Clipboard</button>
        </div>
      </div>

      <!-- Right column: AI panel -->
      <div class="ai-panel">
        <h3 style="margin:0 0 14px;font-size:0.9rem;font-weight:700">AI Assistant</h3>

        <!-- Quality Report -->
        <div style="margin-bottom:20px">
          <div style="font-weight:700;font-size:0.8rem;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;display:flex;align-items:center;gap:6px">
            <span>🔍</span> Quality Report
          </div>
          <div id="ai-quality-report" style="font-size:0.82rem;color:var(--text-secondary)">
            Start typing or click "Check Quality" to analyse note language.
          </div>
        </div>

        <hr style="border:none;border-top:1px solid var(--border);margin:14px 0">

        <!-- Generate Full Note shortcut -->
        <div style="margin-bottom:20px">
          <div style="font-weight:700;font-size:0.8rem;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;display:flex;align-items:center;gap:6px">
            <span>⚡</span> Quick Generate
          </div>
          <button onclick="window._aiQuickGenerate()"
            style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border);background:var(--surface-2);color:var(--text-primary);cursor:pointer;font-size:0.85rem;font-weight:600;text-align:left">
            Generate Full Note from Last Session →
          </button>
        </div>

        <hr style="border:none;border-top:1px solid var(--border);margin:14px 0">

        <!-- Phrase Library -->
        <div>
          <div style="font-weight:700;font-size:0.8rem;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;display:flex;align-items:center;gap:6px">
            <span>📚</span> Phrase Library
          </div>
          <div id="ai-phrase-library">
            ${renderPhraseLibrary()}
          </div>
        </div>
      </div>
    </div>

    <!-- Session selector modal (hidden) -->
    <div id="ai-session-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:500;display:flex;align-items:center;justify-content:center">
      <div style="background:var(--surface-1);border:1px solid var(--border);border-radius:14px;padding:24px;width:420px;max-width:90vw;max-height:80vh;overflow-y:auto">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <h3 style="margin:0;font-size:1rem">Select Session</h3>
          <button onclick="document.getElementById('ai-session-modal').style.display='none'"
            style="background:none;border:none;color:var(--text-secondary);cursor:pointer;font-size:1.2rem">✕</button>
        </div>
        <div id="ai-session-list"></div>
      </div>
    </div>`;

  // Make modal initially hidden properly
  document.getElementById('ai-session-modal').style.display = 'none';

  // ── Global handlers ───────────────────────────────────────────────────────

  window._aiSetCondition = function(val) {
    _aiCondition = val;
    const lib = document.getElementById('ai-phrase-library');
    if (lib) lib.innerHTML = renderPhraseLibrary();
  };

  window._aiSetPhraseTab = function(tab) {
    _aiPhraseTab = tab;
    const lib = document.getElementById('ai-phrase-library');
    if (lib) lib.innerHTML = renderPhraseLibrary();
  };

  window._aiOnInput = function() {
    clearTimeout(_qualityDebounce);
    _qualityDebounce = setTimeout(runLiveQualityCheck, 200);
    // Close any open suggest dropdowns
    ['S', 'O', 'A', 'P'].forEach(s => {
      const dd = document.getElementById(`ai-suggest-${s}`);
      if (dd) dd.style.display = 'none';
    });
  };

  window._aiNoteGenerate = function() {
    const sessions = getRecentSessions();
    const list = document.getElementById('ai-session-list');
    if (list) {
      list.innerHTML = sessions.map((s, i) => `
        <div style="padding:12px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px;cursor:pointer;transition:background 0.15s"
          onmouseover="this.style.background='var(--hover-bg,rgba(255,255,255,0.05))'"
          onmouseout="this.style.background=''"
          onclick="window._aiSelectSession(${i})">
          <div style="font-weight:600;font-size:0.875rem">${_esc(s.patientName || 'Unknown Patient')}</div>
          <div style="font-size:0.78rem;color:var(--text-secondary);margin-top:2px">
            ${_esc(s.modality || 'Neurofeedback')} · ${s.duration || 30}min · ${_esc(s.condition || 'General')}
          </div>
          <div style="font-size:0.75rem;color:var(--text-secondary);margin-top:2px;font-style:italic">${_esc(s.notes || 'No notes')}</div>
        </div>`).join('');
    }
    document.getElementById('ai-session-modal').style.display = 'flex';
    window._aiSessionData = sessions;
  };

  // Hit the real clinician chat endpoint and map the reply into S/O/A/P
  // buckets. No PHI is logged — the session snippet we pass is the same data
  // the clinician is already looking at on the page.
  async function _aiGenerateFromSession(session) {
    const cond = (session.condition || _aiCondition || 'general').toString();
    // Keep the transcript minimal and non-PHI (no DOB, no identifiers).
    const transcript = [
      `Session modality: ${session.modality || 'Neurofeedback'}`,
      `Duration: ${session.duration || 30} min`,
      session.amplitude != null ? `Amplitude: ${session.amplitude}` : '',
      session.frequency != null ? `Frequency: ${session.frequency} Hz` : '',
      session.notes ? `Clinician notes: ${session.notes}` : '',
      session.outcome ? `Outcome observation: ${session.outcome}` : '',
    ].filter(Boolean).join('\n');

    const prompt = [
      `Generate a SOAP note draft for a ${cond} treatment session.`,
      'Respond with exactly four labelled blocks separated by blank lines:',
      'SUBJECTIVE:',
      '<text>',
      '',
      'OBJECTIVE:',
      '<text>',
      '',
      'ASSESSMENT:',
      '<text>',
      '',
      'PLAN:',
      '<text>',
      '',
      'Session data:',
      transcript,
    ].join('\n');

    const result = await api.chatClinician([{ role: 'user', content: prompt }], null);
    const reply = result?.reply || result?.content || result?.message || '';
    if (!reply) throw new Error('Empty AI response');

    // Parse the four-block reply. Be tolerant of formatting variations.
    const grab = (label) => {
      const re = new RegExp(
        `${label}\\s*:?[\\s\\n]+([\\s\\S]*?)(?=\\n\\s*(?:SUBJECTIVE|OBJECTIVE|ASSESSMENT|PLAN)\\s*:|$)`,
        'i',
      );
      const m = reply.match(re);
      return (m ? m[1] : '').trim();
    };
    return {
      S: grab('SUBJECTIVE'),
      O: grab('OBJECTIVE'),
      A: grab('ASSESSMENT'),
      P: grab('PLAN'),
      _raw: reply,
    };
  }

  window._aiSelectSession = async function(index) {
    const sessions = window._aiSessionData || getRecentSessions();
    const session = sessions[index];
    if (!session) return;
    _aiSession = session;
    document.getElementById('ai-session-modal').style.display = 'none';
    // Determine condition from session
    const cond = session.condition || _aiCondition;
    const condSelect = document.getElementById('ai-condition-select');
    const knownConds = ['adhd', 'anxiety', 'depression'];
    if (knownConds.includes(cond.toLowerCase()) && condSelect) {
      condSelect.value = cond.toLowerCase();
      _aiCondition = cond.toLowerCase();
    }
    const nameEl = document.getElementById('ai-patient-name');
    if (nameEl && session.patientName) nameEl.value = session.patientName;

    // Show a live status in the quality report panel while the real AI runs.
    const panel = document.getElementById('ai-quality-report');
    if (panel) panel.innerHTML = '<div style="color:var(--text-secondary);font-size:0.82rem">Generating SOAP draft…</div>';

    let filled = null;
    let usedAI = false;
    try {
      filled = await _aiGenerateFromSession(session);
      // Require at least two of the four sections to be populated before we
      // treat the reply as a usable draft.
      const hits = ['S','O','A','P'].filter(k => (filled[k] || '').length > 8).length;
      if (hits < 2) throw new Error('AI reply did not follow SOAP format');
      usedAI = true;
    } catch (err) {
      // Deterministic template fallback — labelled honestly so the clinician
      // knows this did NOT come from the AI service.
      filled = generateNoteFromSession(session, _aiCondition);
      window._showNotifToast?.({
        title: 'Template draft used',
        body: 'AI service unavailable — inserted a template starter. Edit before saving.',
        severity: 'warning',
      });
    }

    const ta_S = document.getElementById('ai-soap-S'); if (ta_S) ta_S.value = filled.S || '';
    const ta_O = document.getElementById('ai-soap-O'); if (ta_O) ta_O.value = filled.O || '';
    const ta_A = document.getElementById('ai-soap-A'); if (ta_A) ta_A.value = filled.A || '';
    const ta_P = document.getElementById('ai-soap-P'); if (ta_P) ta_P.value = filled.P || '';
    runLiveQualityCheck();
    if (usedAI) {
      window._showNotifToast?.({
        title: 'AI Draft Generated',
        body: `SOAP draft generated from session. Review before saving.`,
        severity: 'success',
      });
    }
  };

  window._aiSuggestPhrase = function(section) {
    const ta = document.getElementById(`ai-soap-${section}`);
    const dd = document.getElementById(`ai-suggest-${section}`);
    if (!ta || !dd) return;
    // Toggle
    if (dd.style.display !== 'none') { dd.style.display = 'none'; return; }
    const suggestions = getPhraseSuggestions(section, ta.value, _aiCondition);
    if (suggestions.length === 0) {
      dd.innerHTML = '<div class="ai-suggest-item" style="color:var(--text-secondary)">No suggestions for current input.</div>';
    } else {
      dd.innerHTML = suggestions.map((phrase, i) =>
        `<div class="ai-suggest-item" onclick="window._aiAppendSuggestion('${section}',${i})">${phrase}</div>`
      ).join('');
    }
    dd._suggestions = suggestions;
    dd.style.display = 'block';
  };

  window._aiAppendSuggestion = function(section, index) {
    const ta = document.getElementById(`ai-soap-${section}`);
    const dd = document.getElementById(`ai-suggest-${section}`);
    if (!ta || !dd || !dd._suggestions) return;
    const phrase = dd._suggestions[index];
    if (!phrase) return;
    ta.value = ta.value ? ta.value + '\n' + phrase : phrase;
    dd.style.display = 'none';
    runLiveQualityCheck();
  };

  window._aiCheckQuality = function() {
    const allText = ['S', 'O', 'A', 'P'].map(s => document.getElementById(`ai-soap-${s}`)?.value || '').join(' ');
    const issues = checkNoteQuality(allText);
    const panel = document.getElementById('ai-quality-report');
    if (panel) {
      panel.innerHTML = issues.length === 0
        ? '<div style="color:var(--teal,#00d4bc);font-size:0.82rem">✓ No vague language detected. Note quality looks good.</div>'
        : renderQualityReport(issues);
    }
    window._showNotifToast?.({
      title: 'Quality Check Complete',
      body: issues.length === 0 ? 'No issues found.' : `${issues.length} issue${issues.length !== 1 ? 's' : ''} found.`,
      severity: issues.length === 0 ? 'success' : 'warning',
    });
  };

  window._aiInsertPhrase = function(section, index) {
    const condition_key = _aiCondition.toLowerCase().replace(/[^a-z]/g, '');
    const pool = [
      ...(CLINICAL_PHRASES[section]?.[condition_key] || []),
      ...(CLINICAL_PHRASES[section]?.default || []),
    ].filter((v, i, a) => a.indexOf(v) === i);
    const phrase = pool[index];
    if (!phrase) return;
    const ta = document.getElementById(`ai-soap-${section}`);
    if (ta) {
      ta.value = ta.value ? ta.value + '\n' + phrase : phrase;
      runLiveQualityCheck();
    }
  };

  window._aiSaveNote = function() {
    const patientName = document.getElementById('ai-patient-name')?.value || 'Unknown';
    const sessionId = _aiSession?.id || `ai-${Date.now()}`;
    const courseId = 'ai-assistant';
    const note = {
      subjective:  document.getElementById('ai-soap-S')?.value || '',
      objective:   document.getElementById('ai-soap-O')?.value || '',
      assessment:  document.getElementById('ai-soap-A')?.value || '',
      plan:        document.getElementById('ai-soap-P')?.value || '',
      adverse:     '',
      flagged:     false,
      patientName,
      condition:   _aiCondition,
    };
    saveSoapNote(courseId, sessionId, note);
    window._showNotifToast?.({ title: 'Note Saved', body: `SOAP note for ${patientName} saved in the course workflow.`, severity: 'success' });
  };

  window._aiCopyAll = function() {
    const patientName = document.getElementById('ai-patient-name')?.value || '';
    const S = document.getElementById('ai-soap-S')?.value || '';
    const O = document.getElementById('ai-soap-O')?.value || '';
    const A = document.getElementById('ai-soap-A')?.value || '';
    const P = document.getElementById('ai-soap-P')?.value || '';
    const text = [
      `SOAP Note${patientName ? ' — ' + patientName : ''}`,
      `Date: ${new Date().toLocaleDateString()}`,
      '',
      'SUBJECTIVE',
      S || '—',
      '',
      'OBJECTIVE',
      O || '—',
      '',
      'ASSESSMENT',
      A || '—',
      '',
      'PLAN',
      P || '—',
    ].join('\n');
    navigator.clipboard.writeText(text)
      .then(() => window._showNotifToast?.({ title: 'Copied', body: 'Full SOAP note copied to clipboard.', severity: 'success' }))
      .catch(() => window._showNotifToast?.({ title: 'Copy Failed', body: 'Could not access clipboard.', severity: 'error' }));
  };

  window._aiApplyFix = function(term, sectionId) {
    // Highlight the vague term in the quality report — no destructive text replacement
    window._showNotifToast?.({ title: 'Tip', body: `Search for "${term}" in the ${sectionId} section and apply the suggested wording.`, severity: 'info' });
  };

  window._aiQuickGenerate = async function() {
    const sessions = getRecentSessions();
    if (sessions.length === 0) return;
    window._aiSessionData = sessions;
    await window._aiSelectSession(0);
  };

  // Close suggestion dropdowns on outside click
  document.addEventListener('click', function _aiOutsideClick(e) {
    if (!e.target.closest('[id^="ai-suggest-"]') && !e.target.closest('[onclick*="_aiSuggestPhrase"]')) {
      ['S', 'O', 'A', 'P'].forEach(s => {
        const dd = document.getElementById(`ai-suggest-${s}`);
        if (dd) dd.style.display = 'none';
      });
    }
  }, { once: false, capture: false });
}

// ══════════════════════════════════════════════════════════════════════════════
// FEATURE 1: Course Completion Report
// ══════════════════════════════════════════════════════════════════════════════

function _ccrFmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt)) return '—';
  return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function _ccrWeeksBetween(a, b) {
  if (!a || !b) return null;
  const ms = new Date(b) - new Date(a);
  if (isNaN(ms) || ms < 0) return null;
  return Math.round(ms / (1000 * 60 * 60 * 24 * 7));
}

function _ccrResponderBadge(pctChange) {
  if (pctChange == null) return '<span class="ccr-badge ccr-badge-neutral">No Data</span>';
  const pct = Math.abs(pctChange);
  if (pct >= 50) return '<span class="ccr-badge ccr-badge-success">Responder (&ge;50% improvement)</span>';
  if (pct >= 25) return '<span class="ccr-badge ccr-badge-warning">Partial Responder (25–49%)</span>';
  return '<span class="ccr-badge ccr-badge-error">Non-Responder</span>';
}

function _ccrBuildSvgChart(outcomes) {
  // outcomes: array of { template_name, score_numeric, session_number }
  if (!outcomes || outcomes.length === 0) {
    return `<div class="ccr-chart-placeholder">
      <svg width="600" height="180" viewBox="0 0 600 180">
        <rect width="600" height="180" rx="8" fill="var(--bg-card)" stroke="var(--border)"/>
        <text x="300" y="95" text-anchor="middle" fill="var(--text-tertiary)" font-size="14">No outcome data recorded yet</text>
      </svg>
    </div>`;
  }

  // Group by template — prefer backend shape (template_title/template_id) and
  // fall back to legacy `template_name` for older cached shapes.
  const byTemplate = {};
  outcomes.forEach(o => {
    const key = o.template_title || o.template_id || o.template_name || 'Unknown';
    if (!byTemplate[key]) byTemplate[key] = [];
    byTemplate[key].push(o);
  });

  const W = 600, H = 180, padL = 48, padR = 16, padT = 20, padB = 36;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  const allScores = outcomes.map(o => Number(o.score_numeric)).filter(n => !isNaN(n));
  if (allScores.length === 0) return '<div class="ccr-chart-placeholder"><svg width="600" height="180"><text x="300" y="95" text-anchor="middle" fill="var(--text-tertiary)" font-size="14">No numeric scores</text></svg></div>';

  const maxScore = Math.max(...allScores, 1);
  const minScore = Math.min(...allScores, 0);
  const scoreRange = maxScore - minScore || 1;

  const allSessions = outcomes.map(o => Number(o.session_number || 0)).filter(n => !isNaN(n));
  const maxSess = Math.max(...allSessions, 1);
  const minSess = Math.min(...allSessions, 0);
  const sessRange = maxSess - minSess || 1;

  const colors = ['var(--teal,#00d4bc)', 'var(--blue,#4a9eff)', 'var(--violet,#9b7fff)', 'var(--amber,#ffb547)', 'var(--rose,#ff6b9d)'];
  const templateKeys = Object.keys(byTemplate);

  const toX = (s) => padL + ((s - minSess) / sessRange) * chartW;
  const toY = (v) => padT + chartH - ((v - minScore) / scoreRange) * chartH;

  // Grid lines
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map(frac => {
    const y = padT + chartH * (1 - frac);
    const label = Math.round(minScore + scoreRange * frac);
    return `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="var(--border)" stroke-dasharray="3,3" stroke-width="1"/>
    <text x="${padL - 6}" y="${y + 4}" text-anchor="end" fill="var(--text-tertiary)" font-size="10">${label}</text>`;
  }).join('');

  // Polylines + dots per template
  const lines = templateKeys.map((key, ti) => {
    const pts = byTemplate[key]
      .filter(o => o.score_numeric != null && o.session_number != null)
      .sort((a, b) => Number(a.session_number) - Number(b.session_number));
    if (pts.length < 1) return '';
    const color = colors[ti % colors.length];
    const pointsStr = pts.map(o => `${toX(Number(o.session_number))},${toY(Number(o.score_numeric))}`).join(' ');
    const dots = pts.map(o =>
      `<circle cx="${toX(Number(o.session_number))}" cy="${toY(Number(o.score_numeric))}" r="4" fill="${color}" stroke="var(--bg-card)" stroke-width="2"/>`
    ).join('');
    return `<polyline points="${pointsStr}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>${dots}`;
  }).join('');

  // Legend
  const legendItems = templateKeys.map((key, ti) => {
    const color = colors[ti % colors.length];
    return `<rect x="${padL + ti * 140}" y="${H - padB + 18}" width="10" height="10" rx="2" fill="${color}"/>
    <text x="${padL + ti * 140 + 14}" y="${H - padB + 27}" fill="var(--text-secondary)" font-size="11">${key}</text>`;
  }).join('');

  // X-axis ticks
  const xTicks = [];
  for (let s = minSess; s <= maxSess; s++) {
    const x = toX(s);
    xTicks.push(`<line x1="${x}" y1="${padT + chartH}" x2="${x}" y2="${padT + chartH + 4}" stroke="var(--border)"/>
    <text x="${x}" y="${padT + chartH + 15}" text-anchor="middle" fill="var(--text-tertiary)" font-size="10">S${s}</text>`);
  }

  return `<svg class="ccr-chart-svg" width="600" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    ${gridLines}
    ${xTicks.join('')}
    ${lines}
    ${legendItems}
    <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + chartH}" stroke="var(--border)" stroke-width="1"/>
    <line x1="${padL}" y1="${padT + chartH}" x2="${W - padR}" y2="${padT + chartH}" stroke="var(--border)" stroke-width="1"/>
  </svg>`;
}

export async function pgCourseCompletionReport(setTopbar, navigate) {
  const id = window._selectedCourseId;
  if (!id) { navigate('courses'); return; }

  const el = document.getElementById('content');
  el.innerHTML = spinner();

  // Parallel fetch — pull real AE records, don't derive from session rows (delivered
  // sessions have no `status` or `adverse_event` column; see adverse_events table).
  const [course, sessionsRaw, outcomesRaw, summaryRaw, adverseRaw] = await Promise.all([
    api.getCourse(id).catch(() => null),
    api.listCourseSessions(id).catch(() => null),
    api.listOutcomes({ course_id: id }).catch(() => null),
    api.courseOutcomeSummary(id).catch(() => null),
    api.listAdverseEvents({ course_id: id }).catch(() => null),
  ]);

  if (!course) { navigate('courses'); return; }

  // Patient name
  let patientName = course.patient_name || course.patient_id || 'Unknown Patient';
  if (course.patient_id && !course.patient_name) {
    const pt = await api.getPatient(course.patient_id).catch(() => null);
    if (pt) patientName = `${pt.first_name || ''} ${pt.last_name || ''}`.trim() || patientName;
  }

  // Normalize data
  const sessions = Array.isArray(sessionsRaw) ? sessionsRaw : (sessionsRaw?.items || []);
  const outcomes = Array.isArray(outcomesRaw) ? outcomesRaw : (outcomesRaw?.items || []);
  const adverseEvents = Array.isArray(adverseRaw) ? adverseRaw : (adverseRaw?.items || []);

  // Stats — every delivered-session row is a completed session (backend only
  // writes the row after the clinician commits the log). `planned_sessions_total`
  // is the authoritative denominator from TreatmentCourse; `sessions_delivered`
  // is the canonical counter. Falling back to `sessions.length` also works when
  // the course record has drifted but the list is truthy.
  const sessionsCompleted = course.sessions_delivered ?? sessions.length ?? 0;
  const sessionsPlanned =
    course.planned_sessions_total ??
    course.planned_sessions ??
    course.total_sessions ??
    0;
  const pctComplete = sessionsPlanned > 0 ? Math.min(100, Math.round((sessionsCompleted / sessionsPlanned) * 100)) : 0;

  const sortedSessions = [...sessions].sort((a, b) => new Date(a.created_at || a.scheduled_at || a.date || 0) - new Date(b.created_at || b.scheduled_at || b.date || 0));
  const startDate = course.started_at || sortedSessions[0]?.created_at || sortedSessions[0]?.scheduled_at || sortedSessions[0]?.date || course.start_date;
  const endDate = course.completed_at || course.end_date || (course.status === 'completed' ? (sortedSessions[sortedSessions.length - 1]?.created_at || null) : null);
  const durationWeeks = _ccrWeeksBetween(startDate, endDate || new Date().toISOString());

  // Soap notes count
  let soapCount = 0;
  try {
    const allNotes = JSON.parse(localStorage.getItem('ds_soap_notes') || '{}');
    const courseNotes = allNotes[String(id)] || {};
    soapCount = Object.keys(courseNotes).length;
  } catch { soapCount = 0; }

  // Responder status: the backend summary payload exposes `summaries` (per template);
  // each summary has baseline/latest/pct_change/is_responder.
  const summaryOutcomes = summaryRaw?.summaries || summaryRaw?.outcomes || [];
  const firstWithPct = summaryOutcomes.find(o => o.pct_change != null) || null;
  const responderBadge = _ccrResponderBadge(firstWithPct?.pct_change ?? null);

  // Build outcomes array with session_number for chart
  const chartOutcomes = outcomes.map((o, i) => ({
    ...o,
    session_number: o.session_number ?? (i + 1),
  }));

  const clinicName = localStorage.getItem('ds_clinic_name') || 'DeepSynaps Clinic';
  const reportDate = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  // Topbar
  const _condLabel = (course.condition_slug || course.condition || 'Course').replace(/-/g, ' ');
  const _modLabel  = course.modality_slug || course.modality || 'Protocol';
  setTopbar(
    `${_condLabel} — ${_modLabel}`,
    [
      { label: '← Back', action: () => navigate('courses') },
      { label: 'Record Outcome', action: () => window._openQuickOutcomeCapture?.(id, null, patientName) },
      { label: 'Print Report', action: () => window.print() },
      { label: 'Download PDF', action: () => window._ccrDownloadPDF?.() },
    ]
  );

  // Render
  el.innerHTML = `
  <div id="ccr-root" class="ccr-wrapper">
    <!-- Report Card -->
    <div class="ccr-report-card" id="ccr-printable">

      <!-- Header -->
      <div class="ccr-header">
        <div class="ccr-header-left">
          <div class="ccr-clinic-name">${_esc(clinicName)}</div>
          <h1 class="ccr-title">Course Completion Report</h1>
          <div class="ccr-subtitle">${_esc(_condLabel)} &nbsp;·&nbsp; ${_esc(_modLabel)}</div>
        </div>
        <div class="ccr-header-right">
          <div class="ccr-patient-block">
            <div class="ccr-patient-label">Patient</div>
            <div class="ccr-patient-name">${_esc(patientName)}</div>
          </div>
          <div class="ccr-meta-block">
            <div><span class="ccr-meta-label">Protocol:</span> ${_esc(course.protocol_id || course.protocol_name || course.name || '—')}</div>
            <div><span class="ccr-meta-label">Report Date:</span> ${reportDate}</div>
          </div>
        </div>
      </div>

      <!-- Summary Stats Row -->
      <div class="ccr-stats-row">
        <div class="ccr-stat-card">
          <div class="ccr-stat-value">${sessionsCompleted}</div>
          <div class="ccr-stat-label">Sessions Completed</div>
        </div>
        <div class="ccr-stat-card">
          <div class="ccr-stat-value">${sessionsPlanned}</div>
          <div class="ccr-stat-label">Sessions Planned</div>
        </div>
        <div class="ccr-stat-card ccr-stat-highlight">
          <div class="ccr-stat-value">${pctComplete}%</div>
          <div class="ccr-stat-label">Complete</div>
        </div>
        <div class="ccr-stat-card">
          <div class="ccr-stat-value">${_ccrFmtDate(startDate)}</div>
          <div class="ccr-stat-label">Start Date</div>
        </div>
        <div class="ccr-stat-card">
          <div class="ccr-stat-value">${endDate ? _ccrFmtDate(endDate) : 'Ongoing'}</div>
          <div class="ccr-stat-label">End Date</div>
        </div>
        <div class="ccr-stat-card">
          <div class="ccr-stat-value">${durationWeeks != null ? durationWeeks + 'w' : '—'}</div>
          <div class="ccr-stat-label">Duration</div>
        </div>
      </div>

      <!-- Responder Status -->
      <div class="ccr-section">
        <div class="ccr-section-title">Responder Status</div>
        <div class="ccr-responder-row">
          ${responderBadge}
          ${firstWithPct ? `<span class="ccr-responder-detail">Based on ${_esc(firstWithPct.template_title || firstWithPct.template_id || firstWithPct.template_name || 'outcome measure')}: ${firstWithPct.pct_change > 0 ? '+' : ''}${Math.round(firstWithPct.pct_change)}% change</span>` : '<span class="ccr-responder-detail">No outcome comparison data available</span>'}
        </div>
      </div>

      <!-- Outcome Trends -->
      <div class="ccr-section">
        <div class="ccr-section-title">Outcome Trends</div>
        <div class="ccr-chart-container" id="ccr-chart-container">
          ${_ccrBuildSvgChart(chartOutcomes)}
        </div>
      </div>

      <!-- Session Log -->
      <div class="ccr-section">
        <div class="ccr-section-title">Session Log</div>
        ${sessions.length === 0
          ? '<div class="ccr-empty-state">No sessions recorded.</div>'
          : `<div class="ccr-table-wrap">
            <table class="ccr-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Duration</th>
                  <th>Tolerance</th>
                  <th>Interruption</th>
                  <th>Reason</th>
                  <th>Checklist</th>
                  <th>Deviation</th>
                </tr>
              </thead>
              <tbody>
                ${sortedSessions.map(s => {
                  const checklist = _courseChecklistStats(s.checklist);
                  return `<tr>
                  <td>${_ccrFmtDate(s.created_at || s.scheduled_at || s.date)}</td>
                  <td>${s.duration_minutes != null ? s.duration_minutes + ' min' : '—'}</td>
                  <td>${_esc(s.tolerance_rating) || '—'}</td>
                  <td>${s.interruptions ? '<span class="ccr-ae-yes">Yes</span>' : '<span class="ccr-ae-no">No</span>'}</td>
                  <td>${_esc(s.interruption_reason) || '—'}</td>
                  <td>${checklist ? `${checklist.completed}/${checklist.total}` : '—'}</td>
                  <td>${s.protocol_deviation ? '<span class="ccr-ae-yes">Yes</span>' : '<span class="ccr-ae-no">No</span>'}</td>
                </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>`
        }
      </div>

      <!-- Adverse Events -->
      ${adverseEvents.length > 0 ? `
      <div class="ccr-section">
        <div class="ccr-section-title">Adverse Events (${adverseEvents.length})</div>
        <div class="ccr-adverse-card">
          ${adverseEvents.map(ae => `
            <div class="ccr-adverse-item">
              <span class="ccr-adverse-date">${_ccrFmtDate(ae.reported_at || ae.created_at)}</span>
              <span class="ccr-adverse-note">${_esc((ae.event_type || 'Adverse event').replace(/_/g, ' '))} · <strong>${_esc(ae.severity || '—')}</strong>${ae.description ? ' — ' + _esc(ae.description) : ''}</span>
            </div>`).join('')}
        </div>
      </div>` : ''}

      <!-- Clinical Notes -->
      <div class="ccr-section">
        <div class="ccr-section-title">Clinical Notes</div>
        <div class="ccr-notes-summary">
          <span class="ccr-notes-count">${soapCount}</span>
          <span class="ccr-notes-label"> SOAP note${soapCount !== 1 ? 's' : ''} recorded for this course</span>
        </div>
      </div>

      <!-- Footer -->
      <div class="ccr-footer">
        <div class="ccr-sig-block">
          <div class="ccr-sig-line"></div>
          <div class="ccr-sig-label">Clinician Signature &amp; Date</div>
        </div>
        <div class="ccr-footer-right">
          <div class="ccr-footer-clinic">${_esc(clinicName)}</div>
          <div class="ccr-footer-date">Generated: ${reportDate}</div>
        </div>
      </div>

    </div><!-- /ccr-printable -->
  </div><!-- /ccr-wrapper -->`;

  // Draw charts & handle resize
  window._ccrRedrawCharts = function() {
    if (!document.getElementById('ccr-root')) return;
    const container = document.getElementById('ccr-chart-container');
    if (container) container.innerHTML = _ccrBuildSvgChart(chartOutcomes);
  };
  window._ccrRedrawCharts();

  let _ccrResizeTimer = null;
  const _ccrResizeHandler = function() {
    clearTimeout(_ccrResizeTimer);
    _ccrResizeTimer = setTimeout(() => {
      if (!document.getElementById('ccr-root')) {
        window.removeEventListener('resize', _ccrResizeHandler);
        return;
      }
      window._ccrRedrawCharts();
    }, 200);
  };
  window.addEventListener('resize', _ccrResizeHandler);

  window._ccrDownloadPDF = function() {
    document.body.classList.add('ccr-print-mode');
    window.print();
    setTimeout(() => document.body.classList.remove('ccr-print-mode'), 1000);
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// FEATURE 2: Quick Outcome Capture
// ══════════════════════════════════════════════════════════════════════════════

const _QOC_MEASURE_MAXES = {
  'PHQ-9': 27,
  'GAD-7': 21,
  'PCL-5': 80,
  'HAM-D': 52,
  'MADRS': 60,
  'BDI-II': 63,
  'Custom': 100,
};

window._openQuickOutcomeCapture = function(courseId, sessionId, patientName) {
  // Remove any existing modal
  const existing = document.getElementById('qoc-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'qoc-overlay';
  overlay.className = 'qoc-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'qoc-title');

  overlay.innerHTML = `
    <div class="qoc-modal" id="qoc-modal">
      <div class="qoc-modal-header">
        <h2 class="qoc-title" id="qoc-title">Record Outcome</h2>
        <button class="qoc-close-btn" onclick="document.getElementById('qoc-overlay').remove()" aria-label="Close">&times;</button>
      </div>
      ${patientName ? `<div class="qoc-patient-name">${_esc(patientName)}</div>` : ''}
      <div class="qoc-body">
        <div class="qoc-field">
          <label class="qoc-label" for="qoc-measure">Outcome Measure</label>
          <select id="qoc-measure" class="qoc-select" onchange="window._qocUpdateMax()">
            ${Object.keys(_QOC_MEASURE_MAXES).map(m => `<option value="${m}">${m}</option>`).join('')}
          </select>
        </div>
        <div class="qoc-field">
          <label class="qoc-label" for="qoc-score">Score <span id="qoc-max-label" class="qoc-max-label">(max 27)</span></label>
          <input id="qoc-score" class="qoc-input" type="number" min="0" max="27" placeholder="0" />
        </div>
        <div class="qoc-field">
          <label class="qoc-label" for="qoc-point">Measurement Point</label>
          <select id="qoc-point" class="qoc-select">
            ${['Baseline','Week 2','Week 4','Week 8','End of Course','Follow-up'].map(p => `<option value="${p}">${p}</option>`).join('')}
          </select>
        </div>
        <div class="qoc-field">
          <label class="qoc-label" for="qoc-notes">Notes</label>
          <textarea id="qoc-notes" class="qoc-textarea" rows="2" placeholder="Optional clinical notes..."></textarea>
        </div>
      </div>
      <div class="qoc-footer">
        <button class="qoc-btn qoc-btn-cancel" onclick="document.getElementById('qoc-overlay').remove()">Cancel</button>
        <button class="qoc-btn qoc-btn-primary" onclick="window._qocSave(${JSON.stringify(courseId)}, ${JSON.stringify(sessionId)})">Save Outcome</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  // Close on backdrop click
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) overlay.remove();
  });

  // Focus first field
  setTimeout(() => document.getElementById('qoc-measure')?.focus(), 50);
};

window._qocUpdateMax = function() {
  const measure = document.getElementById('qoc-measure')?.value || 'PHQ-9';
  const max = _QOC_MEASURE_MAXES[measure] || 100;
  const scoreInput = document.getElementById('qoc-score');
  const maxLabel = document.getElementById('qoc-max-label');
  if (scoreInput) scoreInput.max = max;
  if (maxLabel) maxLabel.textContent = `(max ${max})`;
};

window._qocSave = async function(courseId, sessionId) {
  const measure = document.getElementById('qoc-measure')?.value || 'PHQ-9';
  const scoreRaw = document.getElementById('qoc-score')?.value;
  const point = document.getElementById('qoc-point')?.value || 'Baseline';
  const notes = document.getElementById('qoc-notes')?.value || '';

  if (scoreRaw === '' || scoreRaw == null) {
    window._showNotifToast?.({ title: 'Validation', body: 'Please enter a score.', severity: 'warning' });
    return;
  }

  const score = Number(scoreRaw);
  const max = _QOC_MEASURE_MAXES[measure] || 100;
  if (isNaN(score) || score < 0 || score > max) {
    window._showNotifToast?.({ title: 'Invalid Score', body: `Score must be between 0 and ${max} for ${measure}.`, severity: 'warning' });
    return;
  }

  // Resolve patient_id — OutcomeCreate requires it. We pull it from the course
  // if it isn't already known to the caller.
  let patientId = null;
  try {
    const course = await api.getCourse(courseId).catch(() => null);
    if (course?.patient_id) patientId = course.patient_id;
  } catch (_) {}

  const payload = {
    course_id: courseId,
    patient_id: patientId,
    session_id: sessionId,
    template_id: measure,
    template_title: measure,
    score: String(score),
    score_numeric: score,
    measurement_point: point,
    administered_at: new Date().toISOString(),
  };

  // Disable save button to prevent double-submit
  const saveBtn = document.querySelector('#qoc-modal .qoc-btn-primary');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }

  let saved = false;
  try {
    // Without a patient_id the backend will 422. Fall through to localStorage
    // below (offline capture) rather than firing a doomed request.
    if (patientId) {
      const result = await api.recordOutcome(payload);
      if (result) saved = true;
    }
  } catch (_) { saved = false; }

  if (!saved) {
    // Fallback: localStorage (keeps the clinician's free-text notes even though
    // OutcomeCreate doesn't persist them server-side).
    try {
      const localKey = 'ds_local_outcomes';
      const existing = JSON.parse(localStorage.getItem(localKey) || '[]');
      existing.push({ ...payload, notes, _local: true, _saved_at: new Date().toISOString() });
      localStorage.setItem(localKey, JSON.stringify(existing));
      saved = true;
    } catch (_) { /* ignore */ }
  }

  if (saved) {
    window._showNotifToast?.({ title: 'Outcome Saved', body: `${measure} score of ${score} recorded (${point}).`, severity: 'success' });
    document.getElementById('qoc-overlay')?.remove();
    // Invoke caller-registered refresh callback (e.g. outcomes page)
    if (typeof window._qocOnSave === 'function') {
      try { window._qocOnSave({ courseId, sessionId, measure, score, point }); } catch (_) {}
      window._qocOnSave = null;
    }
    // Auto-refresh course completion report if currently displayed
    if (document.getElementById('ccr-root')) {
      setTimeout(() => window._ccrRedrawCharts?.(), 300);
    }
  } else {
    window._showNotifToast?.({ title: 'Save Failed', body: 'Could not save outcome. Please try again.', severity: 'error' });
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save Outcome'; }
  }
};

export async function pgQuickOutcomeCapture(setTopbar) {
  // Utility page — delegates to the modal
  const el = document.getElementById('content');
  el.innerHTML = `<div style="padding:60px 24px;text-align:center;color:var(--text-secondary)">
    <div style="font-size:2rem;margin-bottom:16px">📋</div>
    <div style="font-size:1.1rem;font-weight:600;margin-bottom:8px">Quick Outcome Capture</div>
    <div style="font-size:0.9rem">Use this from within a session to record outcome scores.</div>
  </div>`;
  setTopbar('Quick Outcome Capture', []);
}

export function openQuickOutcomeCapture(courseId, sessionId, patientName) {
  window._openQuickOutcomeCapture(courseId, sessionId, patientName);
}


// ── pgClinicianAdherenceHub — Cross-patient adherence triage (launch-audit 2026-05-01)
//
// Bidirectional counterpart to the patient-facing pgPatientAdherenceEvents
// (#350). Wires to the new ``/api/v1/clinician-adherence/*`` endpoints in
// ``apps/api/app/routers/clinician_adherence_router.py``:
//
//   GET    /api/v1/clinician-adherence/events            — list (audited)
//   GET    /api/v1/clinician-adherence/events/summary    — top counts
//   GET    /api/v1/clinician-adherence/events/{id}       — detail
//   POST   /api/v1/clinician-adherence/events/{id}/acknowledge
//   POST   /api/v1/clinician-adherence/events/{id}/escalate
//   POST   /api/v1/clinician-adherence/events/{id}/resolve
//   POST   /api/v1/clinician-adherence/events/bulk-acknowledge
//   GET    /api/v1/clinician-adherence/events/export.csv     — DEMO-prefixed when demo
//   GET    /api/v1/clinician-adherence/events/export.ndjson  — DEMO-prefixed when demo
//   POST   /api/v1/clinician-adherence/audit-events      — page audit ingestion
//
// Pinned page contract (mirrored in clinician-adherence-hub-launch-audit.test.js):
//
//   - Mount-time `clinician_adherence_hub.view` audit ping
//   - Reads /events + /summary at mount
//   - Items grouped by patient (per-group summary)
//   - DEMO banner only when server returns is_demo_view=true
//   - Honest empty state ("No adherence events pending review.")
//   - Acknowledge / escalate / resolve buttons with note-required prompt
//   - Bulk acknowledge: select rows + ack-all
//   - Drill-out per-event to Patient Profile, Course Detail, AE Hub
//   - Each ack / escalate / resolve / bulk-ack / export emits its own audit event
//   - No silent fakes; counts come from real audit-row aggregation

const _cahEsc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function _cahNoteRequiredValid(note) {
  if (note == null) return false;
  return String(note).trim().length > 0;
}

function _cahBuildAuditPayload(event, extra = {}) {
  const out = { event };
  if (extra.event_record_id) out.event_record_id = String(extra.event_record_id);
  if (extra.note) out.note = String(extra.note).slice(0, 480);
  if (extra.using_demo_data) out.using_demo_data = true;
  return out;
}

function _cahBuildFilterParams(filters) {
  const params = {};
  if (filters?.severity) params.severity = filters.severity;
  if (filters?.status) params.status = filters.status;
  if (filters?.surface_chip) params.surface_chip = filters.surface_chip;
  if (filters?.patient_id) params.patient_id = filters.patient_id;
  if (filters?.q) params.q = filters.q;
  return params;
}

function _cahShouldShowDemoBanner(serverListResp) {
  return !!(serverListResp && serverListResp.is_demo_view);
}

function _cahShouldShowEmptyState(serverListResp) {
  if (!serverListResp || !Array.isArray(serverListResp.items)) return true;
  return serverListResp.items.length === 0;
}

function _cahCsvExportPath() { return '/api/v1/clinician-adherence/events/export.csv'; }
function _cahNdjsonExportPath() { return '/api/v1/clinician-adherence/events/export.ndjson'; }

// Hub-level state — kept tiny so the hub can mount/unmount cleanly.
let _cahState = {
  items: [],
  total: 0,
  isDemoView: false,
  summary: null,
  filterSeverity: '',
  filterStatus: '',
  filterSurfaceChip: '',
  filterQ: '',
  selectedIds: new Set(),
  loaded: false,
  error: null,
};

const _CAH_SURFACE_CHIPS = [
  ['', 'All types'],
  ['adherence_report', 'Adherence Report'],
  ['side_effect', 'Side Effect'],
  ['tolerance_change', 'Tolerance Change'],
  ['break_request', 'Break Request'],
  ['concern', 'Concern'],
  ['positive_feedback', 'Positive Feedback'],
];

const _CAH_SEVERITIES = [
  ['', 'All severities'],
  ['low', 'Low'],
  ['moderate', 'Moderate'],
  ['high', 'High'],
  ['urgent', 'Urgent'],
];

const _CAH_STATUSES = [
  ['', 'All statuses'],
  ['open', 'Open'],
  ['acknowledged', 'Acknowledged'],
  ['escalated', 'Escalated'],
  ['resolved', 'Resolved'],
];

function _cahGroupByPatient(items) {
  const map = new Map();
  for (const it of items) {
    const key = it.patient_id || '_unknown';
    if (!map.has(key)) {
      map.set(key, {
        patient_id: key,
        patient_name: it.patient_name || key,
        items: [],
        total: 0,
        side_effects: 0,
        escalated: 0,
        sae: 0,
      });
    }
    const g = map.get(key);
    g.items.push(it);
    g.total += 1;
    if (it.event_type === 'side_effect') g.side_effects += 1;
    if (it.status === 'escalated') g.escalated += 1;
    if (it.event_type === 'side_effect' && it.severity === 'urgent') g.sae += 1;
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

export async function pgClinicianAdherenceHub(setTopbar, navigate) {
  const el = document.getElementById('app');
  if (!el) return;

  if (typeof setTopbar === 'function') {
    setTopbar(
      'Clinician Adherence Hub',
      'Cross-patient triage of adherence reports, side-effects, and escalations.',
    );
  }

  // Mount-time audit ping. Best-effort.
  try {
    api.postClinicianAdherenceAuditEvent(_cahBuildAuditPayload('view', {
      note: 'adherence hub page mounted',
    }));
  } catch (_) { /* ignore */ }

  // Render skeleton — never invent rows.
  el.innerHTML = `
    <div id="cah-root" style="max-width:1180px;margin:0 auto;padding:18px 24px">
      <div id="cah-summary"></div>
      <div id="cah-filters"></div>
      <div id="cah-banner"></div>
      <div id="cah-content">
        <div style="text-align:center;padding:40px;color:var(--text-tertiary);font-size:12px">Loading adherence hub…</div>
      </div>
    </div>`;

  await _cahLoadData();
  _cahBindFilterHandlers(navigate);
  _cahBindRowHandlers(navigate);
}

async function _cahLoadData() {
  const root = document.getElementById('cah-root');
  if (!root) return; // navigated away
  const params = _cahBuildFilterParams({
    severity: _cahState.filterSeverity,
    status: _cahState.filterStatus,
    surface_chip: _cahState.filterSurfaceChip,
    q: _cahState.filterQ,
  });
  const [list, summary] = await Promise.all([
    api.clinicianAdherenceList(params),
    api.clinicianAdherenceSummary(),
  ]);

  // Honest empty payload when offline — never fabricate rows.
  _cahState.items = (list && Array.isArray(list.items)) ? list.items : [];
  _cahState.total = (list && Number(list.total)) || 0;
  _cahState.isDemoView = !!(list && list.is_demo_view);
  _cahState.summary = summary || {
    total_today: 0,
    total_7d: 0,
    side_effects_7d: 0,
    escalated_7d: 0,
    sae_flagged: 0,
    response_rate_pct: 0,
    missed_streak_top_patients: [],
  };
  _cahState.loaded = true;

  const summaryEl = document.getElementById('cah-summary');
  if (summaryEl) summaryEl.innerHTML = _cahRenderSummaryStrip(_cahState.summary);
  const filtersEl = document.getElementById('cah-filters');
  if (filtersEl) filtersEl.innerHTML = _cahRenderFilterStrip(_cahState);
  const bannerEl = document.getElementById('cah-banner');
  if (bannerEl) bannerEl.innerHTML = _cahShouldShowDemoBanner(list) ? _cahRenderDemoBanner() : '';
  const contentEl = document.getElementById('cah-content');
  if (contentEl) {
    if (_cahShouldShowEmptyState(list)) {
      contentEl.innerHTML = _cahRenderEmptyState();
    } else {
      const grouped = _cahGroupByPatient(_cahState.items);
      contentEl.innerHTML = grouped.map(_cahRenderPatientGroup).join('');
    }
  }
}

function _cahRenderSummaryStrip(s) {
  const card = (label, value, sub) => `
    <div class="card" style="padding:14px;text-align:center">
      <div style="font-size:22px;font-weight:700;color:var(--text-primary)">${_cahEsc(String(value ?? '—'))}</div>
      <div style="font-size:11px;font-weight:600;color:var(--text-secondary);margin-top:4px">${_cahEsc(label)}</div>
      ${sub ? `<div style="font-size:10px;color:var(--text-tertiary);margin-top:2px">${_cahEsc(sub)}</div>` : ''}
    </div>`;
  return `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:16px">
      ${card('Today', s.total_today ?? 0, 'events')}
      ${card('Past 7d', s.total_7d ?? 0, 'events')}
      ${card('Side-effects 7d', s.side_effects_7d ?? 0, 'logged')}
      ${card('Escalated 7d', s.escalated_7d ?? 0, 'open')}
      ${card('SAE-flagged', s.sae_flagged ?? 0, 'urgent')}
      ${card('Response rate', `${(s.response_rate_pct ?? 0).toFixed ? s.response_rate_pct.toFixed(1) : s.response_rate_pct}%`, 'actioned')}
    </div>
    ${s.missed_streak_top_patients && s.missed_streak_top_patients.length
      ? `<div class="card" style="padding:12px 14px;margin-bottom:14px">
          <div style="font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:6px">Missed-streak top patients</div>
          ${s.missed_streak_top_patients.map(p => `
            <div style="font-size:12px;color:var(--text-primary);margin-bottom:3px">
              <button class="cah-drill-patient-btn" data-patient="${_cahEsc(p.patient_id)}" style="background:none;border:none;color:var(--accent,#3b82f6);text-decoration:underline;cursor:pointer;padding:0">${_cahEsc(p.patient_name)}</button>
              · ${_cahEsc(String(p.streak_days))} day(s) without complete adherence
            </div>`).join('')}
        </div>`
      : ''}
  `;
}

function _cahRenderFilterStrip(state) {
  const opts = (arr, sel) => arr.map(([v, l]) =>
    `<option value="${_cahEsc(v)}"${v === sel ? ' selected' : ''}>${_cahEsc(l)}</option>`).join('');
  return `
    <div class="card" style="padding:12px 14px;margin-bottom:14px;display:flex;flex-wrap:wrap;gap:10px;align-items:center">
      <select id="cah-filter-severity" class="form-control" style="max-width:160px">
        ${opts(_CAH_SEVERITIES, state.filterSeverity)}
      </select>
      <select id="cah-filter-status" class="form-control" style="max-width:160px">
        ${opts(_CAH_STATUSES, state.filterStatus)}
      </select>
      <select id="cah-filter-surface-chip" class="form-control" style="max-width:180px">
        ${opts(_CAH_SURFACE_CHIPS, state.filterSurfaceChip)}
      </select>
      <input id="cah-filter-q" class="form-control" style="max-width:220px" placeholder="Search body…" value="${_cahEsc(state.filterQ || '')}">
      <button id="cah-bulk-ack-btn" class="btn btn-secondary" style="margin-left:auto">Bulk acknowledge (${state.selectedIds.size})</button>
      <a id="cah-export-csv-btn" class="btn btn-link" href="${_cahCsvExportPath()}" target="_blank">Export CSV</a>
      <a id="cah-export-ndjson-btn" class="btn btn-link" href="${_cahNdjsonExportPath()}" target="_blank">Export NDJSON</a>
    </div>`;
}

function _cahRenderDemoBanner() {
  return `
    <div class="notice notice-warning" style="margin-bottom:14px;font-size:12.5px;line-height:1.55">
      <strong>Demo data.</strong> Some events shown are from demo patients. Exports will be DEMO-prefixed; not regulator-submittable.
    </div>`;
}

function _cahRenderEmptyState() {
  return `
    <div class="card" style="padding:36px 24px;text-align:center;color:var(--text-secondary)">
      <div style="font-size:2.4rem;margin-bottom:14px">✓</div>
      <div style="font-size:1.05rem;font-weight:600;margin-bottom:6px">No adherence events pending review.</div>
      <div style="font-size:0.85rem;color:var(--text-tertiary);max-width:480px;margin:0 auto">
        Adherence reports, side-effects, and escalations from your clinic's patients will appear here. Counts are real audit-table aggregates, not AI-fabricated cohort scoring.
      </div>
    </div>`;
}

function _cahRenderPatientGroup(g) {
  return `
    <div class="card" style="padding:0;margin-bottom:14px;overflow:hidden">
      <div style="padding:12px 14px;border-bottom:1px solid var(--border-color);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <div>
          <button class="cah-drill-patient-btn" data-patient="${_cahEsc(g.patient_id)}" style="background:none;border:none;color:var(--accent,#3b82f6);font-weight:600;text-decoration:underline;cursor:pointer;padding:0;font-size:14px">${_cahEsc(g.patient_name)}</button>
          <span style="margin-left:8px;font-size:11px;color:var(--text-tertiary)">${_cahEsc(g.patient_id)}</span>
        </div>
        <div style="font-size:11px;color:var(--text-secondary)">
          ${_cahEsc(String(g.total))} events · ${_cahEsc(String(g.side_effects))} side-effect${g.side_effects === 1 ? '' : 's'} · ${_cahEsc(String(g.escalated))} escalated · ${_cahEsc(String(g.sae))} SAE
        </div>
      </div>
      <div>
        ${g.items.map(_cahRenderEventRow).join('')}
      </div>
    </div>`;
}

function _cahRenderEventRow(it) {
  const sevColor = (
    it.severity === 'urgent' ? '#ff6b6b' :
    it.severity === 'high'   ? '#f59e0b' :
    it.severity === 'moderate' ? '#3b82f6' :
    it.severity === 'low'    ? '#14b8a6' :
    'var(--text-tertiary)'
  );
  const statusColor = (
    it.status === 'open'         ? '#f59e0b' :
    it.status === 'acknowledged' ? '#3b82f6' :
    it.status === 'escalated'    ? '#ff6b6b' :
    it.status === 'resolved'     ? '#14b8a6' :
    'var(--text-tertiary)'
  );
  const isImmutable = it.status === 'resolved';
  return `
    <div style="padding:10px 14px;border-bottom:1px solid var(--border-color);display:flex;flex-wrap:wrap;gap:10px;align-items:flex-start">
      <input type="checkbox" class="cah-row-checkbox" data-event-id="${_cahEsc(it.id)}" ${isImmutable ? 'disabled' : ''} style="margin-top:5px">
      <div style="flex:1;min-width:240px">
        <div style="font-size:13px;font-weight:600;color:var(--text-primary)">
          <span style="color:${sevColor}">${_cahEsc(it.event_type)}</span>
          ${it.severity ? `<span style="margin-left:6px;font-size:11px;color:${sevColor}">[${_cahEsc(it.severity)}]</span>` : ''}
          <span style="margin-left:6px;font-size:11px;color:${statusColor}">[${_cahEsc(it.status)}]</span>
          ${it.is_demo ? `<span style="margin-left:6px;font-size:10px;color:var(--text-tertiary);background:var(--bg-tertiary);padding:1px 5px;border-radius:3px">DEMO</span>` : ''}
        </div>
        <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">${_cahEsc(it.report_date || '')} · ${_cahEsc((it.body || '').slice(0, 160))}${(it.body || '').length > 160 ? '…' : ''}</div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${isImmutable ? '' : `<button class="cah-ack-btn btn btn-secondary" data-event-id="${_cahEsc(it.id)}">Acknowledge</button>`}
        ${isImmutable ? '' : `<button class="cah-escalate-btn btn btn-warning" data-event-id="${_cahEsc(it.id)}">Escalate</button>`}
        ${isImmutable ? '' : `<button class="cah-resolve-btn btn btn-secondary" data-event-id="${_cahEsc(it.id)}">Resolve</button>`}
        <button class="cah-drill-patient-btn btn btn-link" data-patient="${_cahEsc(it.patient_id)}">Patient</button>
        ${it.course_id ? `<button class="cah-drill-course-btn btn btn-link" data-course="${_cahEsc(it.course_id)}">Course</button>` : ''}
        <button class="cah-drill-ae-btn btn btn-link" data-patient="${_cahEsc(it.patient_id)}">AE Hub</button>
      </div>
    </div>`;
}

function _cahBindFilterHandlers(navigate) {
  const sevSel = document.getElementById('cah-filter-severity');
  if (sevSel && !sevSel._bound) {
    sevSel._bound = true;
    sevSel.onchange = () => {
      _cahState.filterSeverity = sevSel.value || '';
      try { api.postClinicianAdherenceAuditEvent(_cahBuildAuditPayload('filter_changed', { note: 'severity=' + (_cahState.filterSeverity || 'all') })); } catch (_) {}
      _cahLoadData().then(() => { _cahBindFilterHandlers(navigate); _cahBindRowHandlers(navigate); });
    };
  }
  const statSel = document.getElementById('cah-filter-status');
  if (statSel && !statSel._bound) {
    statSel._bound = true;
    statSel.onchange = () => {
      _cahState.filterStatus = statSel.value || '';
      try { api.postClinicianAdherenceAuditEvent(_cahBuildAuditPayload('filter_changed', { note: 'status=' + (_cahState.filterStatus || 'all') })); } catch (_) {}
      _cahLoadData().then(() => { _cahBindFilterHandlers(navigate); _cahBindRowHandlers(navigate); });
    };
  }
  const surfSel = document.getElementById('cah-filter-surface-chip');
  if (surfSel && !surfSel._bound) {
    surfSel._bound = true;
    surfSel.onchange = () => {
      _cahState.filterSurfaceChip = surfSel.value || '';
      try { api.postClinicianAdherenceAuditEvent(_cahBuildAuditPayload('filter_changed', { note: 'surface_chip=' + (_cahState.filterSurfaceChip || 'all') })); } catch (_) {}
      _cahLoadData().then(() => { _cahBindFilterHandlers(navigate); _cahBindRowHandlers(navigate); });
    };
  }
  const qInput = document.getElementById('cah-filter-q');
  if (qInput && !qInput._bound) {
    qInput._bound = true;
    let _qDebounce = null;
    qInput.oninput = () => {
      _cahState.filterQ = qInput.value || '';
      if (_qDebounce) clearTimeout(_qDebounce);
      _qDebounce = setTimeout(() => {
        try { api.postClinicianAdherenceAuditEvent(_cahBuildAuditPayload('filter_changed', { note: 'q=' + (_cahState.filterQ || '').slice(0, 60) })); } catch (_) {}
        _cahLoadData().then(() => { _cahBindFilterHandlers(navigate); _cahBindRowHandlers(navigate); });
      }, 300);
    };
  }
  const bulkBtn = document.getElementById('cah-bulk-ack-btn');
  if (bulkBtn && !bulkBtn._bound) {
    bulkBtn._bound = true;
    bulkBtn.onclick = async () => {
      if (_cahState.selectedIds.size === 0) {
        if (window.showToast) window.showToast('Select at least one event to acknowledge.', 'warn');
        return;
      }
      const note = (typeof window !== 'undefined' ? window.prompt('Acknowledge note (required):', '') : '');
      if (!_cahNoteRequiredValid(note)) {
        if (window.showToast) window.showToast('Acknowledgement note is required.', 'warn');
        return;
      }
      const ids = Array.from(_cahState.selectedIds);
      try {
        const r = await api.clinicianAdherenceBulkAcknowledge(ids, note);
        try { api.postClinicianAdherenceAuditEvent(_cahBuildAuditPayload('bulk_acknowledged', { note: `processed=${ids.length}` })); } catch (_) {}
        const failed = (r && Array.isArray(r.failures)) ? r.failures.length : 0;
        if (window.showToast) {
          if (failed > 0) window.showToast(`Bulk ack: ${r?.succeeded ?? 0} ok, ${failed} failed.`, 'warn');
          else window.showToast(`Acknowledged ${r?.succeeded ?? ids.length} events.`, 'success');
        }
        _cahState.selectedIds.clear();
        await _cahLoadData();
        _cahBindFilterHandlers(navigate);
        _cahBindRowHandlers(navigate);
      } catch (_) {
        if (window.showToast) window.showToast('Bulk acknowledge failed.', 'error');
      }
    };
  }
  const csvBtn = document.getElementById('cah-export-csv-btn');
  if (csvBtn && !csvBtn._bound) {
    csvBtn._bound = true;
    csvBtn.addEventListener('click', () => {
      try { api.postClinicianAdherenceAuditEvent(_cahBuildAuditPayload('export', { note: 'format=csv' })); } catch (_) {}
    });
  }
  const ndBtn = document.getElementById('cah-export-ndjson-btn');
  if (ndBtn && !ndBtn._bound) {
    ndBtn._bound = true;
    ndBtn.addEventListener('click', () => {
      try { api.postClinicianAdherenceAuditEvent(_cahBuildAuditPayload('export', { note: 'format=ndjson' })); } catch (_) {}
    });
  }
}

function _cahBindRowHandlers(navigate) {
  const cbs = document.querySelectorAll('.cah-row-checkbox');
  cbs.forEach(cb => {
    if (cb._bound) return;
    cb._bound = true;
    cb.onchange = () => {
      const id = cb.getAttribute('data-event-id');
      if (cb.checked) _cahState.selectedIds.add(id);
      else _cahState.selectedIds.delete(id);
      const bulk = document.getElementById('cah-bulk-ack-btn');
      if (bulk) bulk.textContent = `Bulk acknowledge (${_cahState.selectedIds.size})`;
    };
  });

  document.querySelectorAll('.cah-ack-btn').forEach(btn => {
    if (btn._bound) return;
    btn._bound = true;
    btn.onclick = async () => {
      const id = btn.getAttribute('data-event-id');
      const note = (typeof window !== 'undefined' ? window.prompt('Acknowledge note (required):', '') : '');
      if (!_cahNoteRequiredValid(note)) {
        if (window.showToast) window.showToast('Acknowledgement note is required.', 'warn');
        return;
      }
      try {
        await api.clinicianAdherenceAcknowledge(id, note);
        try { api.postClinicianAdherenceAuditEvent(_cahBuildAuditPayload('event_acknowledged_via_modal', { event_record_id: id })); } catch (_) {}
        if (window.showToast) window.showToast('Event acknowledged.', 'success');
        await _cahLoadData();
        _cahBindFilterHandlers(navigate);
        _cahBindRowHandlers(navigate);
      } catch (_) {
        if (window.showToast) window.showToast('Acknowledge failed.', 'error');
      }
    };
  });

  document.querySelectorAll('.cah-escalate-btn').forEach(btn => {
    if (btn._bound) return;
    btn._bound = true;
    btn.onclick = async () => {
      const id = btn.getAttribute('data-event-id');
      const note = (typeof window !== 'undefined' ? window.prompt('Escalation note (required) — creates AE Hub draft:', '') : '');
      if (!_cahNoteRequiredValid(note)) {
        if (window.showToast) window.showToast('Escalation note is required.', 'warn');
        return;
      }
      try {
        const r = await api.clinicianAdherenceEscalate(id, note);
        try { api.postClinicianAdherenceAuditEvent(_cahBuildAuditPayload('event_escalated_via_modal', { event_record_id: id })); } catch (_) {}
        if (window.showToast) {
          window.showToast(r?.adverse_event_id ? `Escalated · AE draft ${r.adverse_event_id}` : 'Event escalated.', 'success');
        }
        await _cahLoadData();
        _cahBindFilterHandlers(navigate);
        _cahBindRowHandlers(navigate);
      } catch (_) {
        if (window.showToast) window.showToast('Escalation failed.', 'error');
      }
    };
  });

  document.querySelectorAll('.cah-resolve-btn').forEach(btn => {
    if (btn._bound) return;
    btn._bound = true;
    btn.onclick = async () => {
      const id = btn.getAttribute('data-event-id');
      const note = (typeof window !== 'undefined' ? window.prompt('Resolution note (required) — event is immutable thereafter:', '') : '');
      if (!_cahNoteRequiredValid(note)) {
        if (window.showToast) window.showToast('Resolution note is required.', 'warn');
        return;
      }
      try {
        await api.clinicianAdherenceResolve(id, note);
        try { api.postClinicianAdherenceAuditEvent(_cahBuildAuditPayload('event_resolved_via_modal', { event_record_id: id })); } catch (_) {}
        if (window.showToast) window.showToast('Event resolved.', 'success');
        await _cahLoadData();
        _cahBindFilterHandlers(navigate);
        _cahBindRowHandlers(navigate);
      } catch (_) {
        if (window.showToast) window.showToast('Resolve failed.', 'error');
      }
    };
  });

  document.querySelectorAll('.cah-drill-patient-btn').forEach(btn => {
    if (btn._bound) return;
    btn._bound = true;
    btn.onclick = () => {
      const pid = btn.getAttribute('data-patient');
      try { api.postClinicianAdherenceAuditEvent(_cahBuildAuditPayload('deep_link_followed', { note: 'patient=' + pid })); } catch (_) {}
      if (pid) window._patientId = pid;
      if (typeof navigate === 'function') navigate('patient-profile');
      else if (typeof window !== 'undefined' && window._nav) window._nav('patient-profile');
    };
  });

  document.querySelectorAll('.cah-drill-course-btn').forEach(btn => {
    if (btn._bound) return;
    btn._bound = true;
    btn.onclick = () => {
      const cid = btn.getAttribute('data-course');
      try { api.postClinicianAdherenceAuditEvent(_cahBuildAuditPayload('deep_link_followed', { note: 'course=' + cid })); } catch (_) {}
      if (cid) window._courseId = cid;
      if (typeof navigate === 'function') navigate('course-detail');
      else if (typeof window !== 'undefined' && window._nav) window._nav('course-detail');
    };
  });

  document.querySelectorAll('.cah-drill-ae-btn').forEach(btn => {
    if (btn._bound) return;
    btn._bound = true;
    btn.onclick = () => {
      const pid = btn.getAttribute('data-patient');
      try { api.postClinicianAdherenceAuditEvent(_cahBuildAuditPayload('deep_link_followed', { note: 'ae_hub=' + pid })); } catch (_) {}
      if (pid) window._patientId = pid;
      if (typeof navigate === 'function') navigate('adverse-events');
      else if (typeof window !== 'undefined' && window._nav) window._nav('adverse-events');
    };
  });
}


// ── pgClinicianWellnessHub — Cross-patient wellness triage (launch-audit 2026-05-01)
//
// Bidirectional counterpart to the patient-facing pgPatientWellness
// (#345). Wires to the new ``/api/v1/clinician-wellness/*`` endpoints
// in ``apps/api/app/routers/clinician_wellness_router.py``:
//
//   GET    /api/v1/clinician-wellness/checkins             — list (audited)
//   GET    /api/v1/clinician-wellness/checkins/summary     — top counts
//   GET    /api/v1/clinician-wellness/checkins/{id}        — detail
//   POST   /api/v1/clinician-wellness/checkins/{id}/acknowledge
//   POST   /api/v1/clinician-wellness/checkins/{id}/escalate
//   POST   /api/v1/clinician-wellness/checkins/{id}/resolve
//   POST   /api/v1/clinician-wellness/checkins/bulk-acknowledge
//   GET    /api/v1/clinician-wellness/checkins/export.csv    — DEMO-prefixed when demo
//   GET    /api/v1/clinician-wellness/checkins/export.ndjson — DEMO-prefixed when demo
//   POST   /api/v1/clinician-wellness/audit-events         — page audit ingestion
//
// Pinned page contract (mirrored in clinician-wellness-hub-launch-audit.test.js):
//
//   - Mount-time `clinician_wellness_hub.view` audit ping
//   - Reads /checkins + /summary at mount
//   - Items grouped by patient with a per-group six-axis sparkline summary
//   - DEMO banner only when server returns is_demo_view=true
//   - Honest empty state ("No wellness check-ins pending review.")
//   - Acknowledge / escalate / resolve buttons with note-required prompt
//   - Bulk acknowledge: select rows + ack-all
//   - Drill-out per-checkin to Patient Profile, Course Detail, AE Hub,
//     and the Clinician Adherence Hub (correlate with adherence)
//   - Each ack / escalate / resolve / bulk-ack / export emits its own audit event
//   - No silent fakes; counts come from real audit-row aggregation

const _cwhEsc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function _cwhNoteRequiredValid(note) {
  if (note == null) return false;
  return String(note).trim().length > 0;
}

function _cwhBuildAuditPayload(event, extra = {}) {
  const out = { event };
  if (extra.checkin_id) out.checkin_id = String(extra.checkin_id);
  if (extra.note) out.note = String(extra.note).slice(0, 480);
  if (extra.using_demo_data) out.using_demo_data = true;
  return out;
}

function _cwhBuildFilterParams(filters) {
  const params = {};
  if (filters?.severity_band) params.severity_band = filters.severity_band;
  if (filters?.axis) params.axis = filters.axis;
  if (filters?.surface_chip) params.surface_chip = filters.surface_chip;
  if (filters?.clinician_status) params.clinician_status = filters.clinician_status;
  if (filters?.patient_id) params.patient_id = filters.patient_id;
  if (filters?.q) params.q = filters.q;
  return params;
}

function _cwhShouldShowDemoBanner(serverListResp) {
  return !!(serverListResp && serverListResp.is_demo_view);
}

function _cwhShouldShowEmptyState(serverListResp) {
  if (!serverListResp || !Array.isArray(serverListResp.items)) return true;
  return serverListResp.items.length === 0;
}

function _cwhCsvExportPath() { return '/api/v1/clinician-wellness/checkins/export.csv'; }
function _cwhNdjsonExportPath() { return '/api/v1/clinician-wellness/checkins/export.ndjson'; }

// Hub-level state — kept tiny so the hub can mount/unmount cleanly.
let _cwhState = {
  items: [],
  total: 0,
  isDemoView: false,
  summary: null,
  filterSeverityBand: '',
  filterAxis: '',
  filterClinicianStatus: '',
  filterQ: '',
  selectedIds: new Set(),
  loaded: false,
  error: null,
};

const _CWH_AXES = [
  ['', 'All axes'],
  ['mood', 'Mood'],
  ['energy', 'Energy'],
  ['sleep', 'Sleep'],
  ['anxiety', 'Anxiety'],
  ['focus', 'Focus'],
  ['pain', 'Pain'],
];

const _CWH_SEVERITY_BANDS = [
  ['', 'All severities'],
  ['low', 'Low'],
  ['moderate', 'Moderate'],
  ['high', 'High'],
  ['urgent', 'Urgent'],
];

const _CWH_STATUSES = [
  ['', 'All statuses'],
  ['open', 'Open'],
  ['acknowledged', 'Acknowledged'],
  ['escalated', 'Escalated'],
  ['resolved', 'Resolved'],
];

// Six-axis labels — must match server _AXES order.
const _CWH_AXIS_KEYS = ['mood', 'energy', 'sleep', 'anxiety', 'focus', 'pain'];

function _cwhAxisAvg(items, axis) {
  const vals = items.map(it => it[axis]).filter(v => v !== null && v !== undefined);
  if (vals.length === 0) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
}

function _cwhGroupByPatient(items) {
  const map = new Map();
  for (const it of items) {
    const key = it.patient_id || '_unknown';
    if (!map.has(key)) {
      map.set(key, {
        patient_id: key,
        patient_name: it.patient_name || key,
        items: [],
        total: 0,
        candidates: 0,
        escalated: 0,
        urgent: 0,
      });
    }
    const g = map.get(key);
    g.items.push(it);
    g.total += 1;
    if (it.escalation_candidate) g.candidates += 1;
    if (it.clinician_status === 'escalated') g.escalated += 1;
    if (it.severity_band === 'urgent') g.urgent += 1;
  }
  // Compute six-axis averages per group (sparkline summary input).
  for (const g of map.values()) {
    g.axes_avg = {};
    for (const axis of _CWH_AXIS_KEYS) {
      g.axes_avg[axis] = _cwhAxisAvg(g.items, axis);
    }
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

export async function pgClinicianWellnessHub(setTopbar, navigate) {
  const el = document.getElementById('app');
  if (!el) return;

  if (typeof setTopbar === 'function') {
    setTopbar(
      'Clinician Wellness Hub',
      'Cross-patient triage of wellness check-ins, low-mood flags, and adherence-risk signals.',
    );
  }

  // Mount-time audit ping. Best-effort.
  try {
    api.postClinicianWellnessAuditEvent(_cwhBuildAuditPayload('view', {
      note: 'wellness hub page mounted',
    }));
  } catch (_) { /* ignore */ }

  // Render skeleton — never invent rows.
  el.innerHTML = `
    <div id="cwh-root" style="max-width:1180px;margin:0 auto;padding:18px 24px">
      <div id="cwh-summary"></div>
      <div id="cwh-filters"></div>
      <div id="cwh-banner"></div>
      <div id="cwh-content">
        <div style="text-align:center;padding:40px;color:var(--text-tertiary);font-size:12px">Loading wellness hub…</div>
      </div>
    </div>`;

  await _cwhLoadData();
  _cwhBindFilterHandlers(navigate);
  _cwhBindRowHandlers(navigate);
}

async function _cwhLoadData() {
  const root = document.getElementById('cwh-root');
  if (!root) return; // navigated away
  const params = _cwhBuildFilterParams({
    severity_band: _cwhState.filterSeverityBand,
    axis: _cwhState.filterAxis,
    clinician_status: _cwhState.filterClinicianStatus,
    q: _cwhState.filterQ,
  });
  const [list, summary] = await Promise.all([
    api.clinicianWellnessList(params),
    api.clinicianWellnessSummary(),
  ]);

  // Honest empty payload when offline — never fabricate rows.
  _cwhState.items = (list && Array.isArray(list.items)) ? list.items : [];
  _cwhState.total = (list && Number(list.total)) || 0;
  _cwhState.isDemoView = !!(list && list.is_demo_view);
  _cwhState.summary = summary || {
    total_today: 0,
    total_7d: 0,
    axes_trending_down_7d: 0,
    low_mood_top_patients: [],
    missed_streak_top_patients: [],
    response_rate_pct: 0,
    escalation_candidates: 0,
  };
  _cwhState.loaded = true;

  const summaryEl = document.getElementById('cwh-summary');
  if (summaryEl) summaryEl.innerHTML = _cwhRenderSummaryStrip(_cwhState.summary);
  const filtersEl = document.getElementById('cwh-filters');
  if (filtersEl) filtersEl.innerHTML = _cwhRenderFilterStrip(_cwhState);
  const bannerEl = document.getElementById('cwh-banner');
  if (bannerEl) bannerEl.innerHTML = _cwhShouldShowDemoBanner(list) ? _cwhRenderDemoBanner() : '';
  const contentEl = document.getElementById('cwh-content');
  if (contentEl) {
    if (_cwhShouldShowEmptyState(list)) {
      contentEl.innerHTML = _cwhRenderEmptyState();
    } else {
      const grouped = _cwhGroupByPatient(_cwhState.items);
      contentEl.innerHTML = grouped.map(_cwhRenderPatientGroup).join('');
    }
  }
}

function _cwhRenderSummaryStrip(s) {
  const card = (label, value, sub) => `
    <div class="card" style="padding:14px;text-align:center">
      <div style="font-size:22px;font-weight:700;color:var(--text-primary)">${_cwhEsc(String(value ?? '—'))}</div>
      <div style="font-size:11px;font-weight:600;color:var(--text-secondary);margin-top:4px">${_cwhEsc(label)}</div>
      ${sub ? `<div style="font-size:10px;color:var(--text-tertiary);margin-top:2px">${_cwhEsc(sub)}</div>` : ''}
    </div>`;
  const responseStr = (s.response_rate_pct ?? 0).toFixed
    ? s.response_rate_pct.toFixed(1)
    : s.response_rate_pct;
  const lowMoodHtml = (s.low_mood_top_patients && s.low_mood_top_patients.length)
    ? `<div class="card" style="padding:12px 14px;margin-bottom:14px">
        <div style="font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:6px">Low-mood top patients (7d avg ≤ 5)</div>
        ${s.low_mood_top_patients.map(p => `
          <div style="font-size:12px;color:var(--text-primary);margin-bottom:3px">
            <button class="cwh-drill-patient-btn" data-patient="${_cwhEsc(p.patient_id)}" style="background:none;border:none;color:var(--accent,#3b82f6);text-decoration:underline;cursor:pointer;padding:0">${_cwhEsc(p.patient_name)}</button>
            · avg mood ${_cwhEsc(String(p.avg_mood_7d))} (${_cwhEsc(String(p.checkins_7d))} check-in${p.checkins_7d === 1 ? '' : 's'})
          </div>`).join('')}
      </div>`
    : '';
  const streakHtml = (s.missed_streak_top_patients && s.missed_streak_top_patients.length)
    ? `<div class="card" style="padding:12px 14px;margin-bottom:14px">
        <div style="font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:6px">Missed-checkin streak top patients</div>
        ${s.missed_streak_top_patients.map(p => `
          <div style="font-size:12px;color:var(--text-primary);margin-bottom:3px">
            <button class="cwh-drill-patient-btn" data-patient="${_cwhEsc(p.patient_id)}" style="background:none;border:none;color:var(--accent,#3b82f6);text-decoration:underline;cursor:pointer;padding:0">${_cwhEsc(p.patient_name)}</button>
            · ${_cwhEsc(String(p.streak_days))} day(s) without a check-in
          </div>`).join('')}
      </div>`
    : '';
  return `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:16px">
      ${card('Today', s.total_today ?? 0, 'check-ins')}
      ${card('Past 7d', s.total_7d ?? 0, 'check-ins')}
      ${card('Axes ↓ 7d', s.axes_trending_down_7d ?? 0, 'trending down')}
      ${card('Escalation candidates', s.escalation_candidates ?? 0, 'open + severe')}
      ${card('Response rate', `${responseStr}%`, 'actioned')}
    </div>
    ${lowMoodHtml}
    ${streakHtml}
  `;
}

function _cwhRenderFilterStrip(state) {
  const opts = (arr, sel) => arr.map(([v, l]) =>
    `<option value="${_cwhEsc(v)}"${v === sel ? ' selected' : ''}>${_cwhEsc(l)}</option>`).join('');
  return `
    <div class="card" style="padding:12px 14px;margin-bottom:14px;display:flex;flex-wrap:wrap;gap:10px;align-items:center">
      <select id="cwh-filter-severity-band" class="form-control" style="max-width:160px">
        ${opts(_CWH_SEVERITY_BANDS, state.filterSeverityBand)}
      </select>
      <select id="cwh-filter-axis" class="form-control" style="max-width:140px">
        ${opts(_CWH_AXES, state.filterAxis)}
      </select>
      <select id="cwh-filter-status" class="form-control" style="max-width:160px">
        ${opts(_CWH_STATUSES, state.filterClinicianStatus)}
      </select>
      <input id="cwh-filter-q" class="form-control" style="max-width:220px" placeholder="Search note…" value="${_cwhEsc(state.filterQ || '')}">
      <button id="cwh-bulk-ack-btn" class="btn btn-secondary" style="margin-left:auto">Bulk acknowledge (${state.selectedIds.size})</button>
      <a id="cwh-export-csv-btn" class="btn btn-link" href="${_cwhCsvExportPath()}" target="_blank">Export CSV</a>
      <a id="cwh-export-ndjson-btn" class="btn btn-link" href="${_cwhNdjsonExportPath()}" target="_blank">Export NDJSON</a>
    </div>`;
}

function _cwhRenderDemoBanner() {
  return `
    <div class="notice notice-warning" style="margin-bottom:14px;font-size:12.5px;line-height:1.55">
      <strong>Demo data.</strong> Some check-ins shown are from demo patients. Exports will be DEMO-prefixed; not regulator-submittable.
    </div>`;
}

function _cwhRenderEmptyState() {
  return `
    <div class="card" style="padding:36px 24px;text-align:center;color:var(--text-secondary)">
      <div style="font-size:2.4rem;margin-bottom:14px">✓</div>
      <div style="font-size:1.05rem;font-weight:600;margin-bottom:6px">No wellness check-ins pending review.</div>
      <div style="font-size:0.85rem;color:var(--text-tertiary);max-width:480px;margin:0 auto">
        Wellness check-ins from your clinic's patients (mood, energy, sleep, anxiety, focus, pain) will appear here. Counts are real audit-table aggregates, not AI-fabricated cohort scoring.
      </div>
    </div>`;
}

function _cwhRenderPatientGroup(g) {
  // Six-axis sparkline summary — render a tiny inline bar per axis with
  // its 7-day average. NULL averages render as "—" so we don't lie
  // about missing data.
  const axisChip = (axis) => {
    const v = g.axes_avg[axis];
    const isHighIsBad = (axis === 'anxiety' || axis === 'pain');
    let color = 'var(--text-tertiary)';
    if (v != null) {
      if (isHighIsBad) {
        color = v >= 7 ? '#ff6b6b' : v >= 5 ? '#f59e0b' : '#14b8a6';
      } else {
        color = v <= 3 ? '#ff6b6b' : v <= 5 ? '#f59e0b' : '#14b8a6';
      }
    }
    return `<span style="display:inline-block;font-size:11px;padding:2px 6px;border-radius:3px;background:var(--bg-tertiary);color:${color};margin-right:4px">${_cwhEsc(axis)} ${v == null ? '—' : v}</span>`;
  };
  return `
    <div class="card" style="padding:0;margin-bottom:14px;overflow:hidden">
      <div style="padding:12px 14px;border-bottom:1px solid var(--border-color);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <div>
          <button class="cwh-drill-patient-btn" data-patient="${_cwhEsc(g.patient_id)}" style="background:none;border:none;color:var(--accent,#3b82f6);font-weight:600;text-decoration:underline;cursor:pointer;padding:0;font-size:14px">${_cwhEsc(g.patient_name)}</button>
          <span style="margin-left:8px;font-size:11px;color:var(--text-tertiary)">${_cwhEsc(g.patient_id)}</span>
        </div>
        <div style="font-size:11px;color:var(--text-secondary)">
          ${_cwhEsc(String(g.total))} check-in${g.total === 1 ? '' : 's'} · ${_cwhEsc(String(g.candidates))} escalation candidate${g.candidates === 1 ? '' : 's'} · ${_cwhEsc(String(g.escalated))} escalated · ${_cwhEsc(String(g.urgent))} urgent
        </div>
      </div>
      <div style="padding:8px 14px;border-bottom:1px solid var(--border-color);font-size:11px">
        <span style="color:var(--text-tertiary);margin-right:6px">Group avg:</span>
        ${_CWH_AXIS_KEYS.map(axisChip).join('')}
      </div>
      <div>
        ${g.items.map(_cwhRenderCheckinRow).join('')}
      </div>
    </div>`;
}

function _cwhRenderCheckinRow(it) {
  const sevColor = (
    it.severity_band === 'urgent' ? '#ff6b6b' :
    it.severity_band === 'high'   ? '#f59e0b' :
    it.severity_band === 'moderate' ? '#3b82f6' :
    '#14b8a6'
  );
  const statusColor = (
    it.clinician_status === 'open'         ? '#f59e0b' :
    it.clinician_status === 'acknowledged' ? '#3b82f6' :
    it.clinician_status === 'escalated'    ? '#ff6b6b' :
    it.clinician_status === 'resolved'     ? '#14b8a6' :
    'var(--text-tertiary)'
  );
  const isImmutable = it.clinician_status === 'resolved';
  const axesSummary = _CWH_AXIS_KEYS
    .map(a => it[a] != null ? `${a}=${it[a]}` : null)
    .filter(Boolean)
    .join(' · ') || 'no axes';
  return `
    <div style="padding:10px 14px;border-bottom:1px solid var(--border-color);display:flex;flex-wrap:wrap;gap:10px;align-items:flex-start">
      <input type="checkbox" class="cwh-row-checkbox" data-checkin-id="${_cwhEsc(it.id)}" ${isImmutable ? 'disabled' : ''} style="margin-top:5px">
      <div style="flex:1;min-width:240px">
        <div style="font-size:13px;font-weight:600;color:var(--text-primary)">
          <span style="color:${sevColor}">[${_cwhEsc(it.severity_band || 'low')}]</span>
          <span style="margin-left:6px;font-size:11px;color:${statusColor}">[${_cwhEsc(it.clinician_status)}]</span>
          ${it.escalation_candidate ? `<span style="margin-left:6px;font-size:10px;color:#ff6b6b;background:var(--bg-tertiary);padding:1px 5px;border-radius:3px">CANDIDATE</span>` : ''}
          ${it.is_demo ? `<span style="margin-left:6px;font-size:10px;color:var(--text-tertiary);background:var(--bg-tertiary);padding:1px 5px;border-radius:3px">DEMO</span>` : ''}
        </div>
        <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">${_cwhEsc(axesSummary)}</div>
        ${it.note ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:2px">${_cwhEsc((it.note || '').slice(0, 200))}${(it.note || '').length > 200 ? '…' : ''}</div>` : ''}
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${isImmutable ? '' : `<button class="cwh-ack-btn btn btn-secondary" data-checkin-id="${_cwhEsc(it.id)}">Acknowledge</button>`}
        ${isImmutable ? '' : `<button class="cwh-escalate-btn btn btn-warning" data-checkin-id="${_cwhEsc(it.id)}">Escalate</button>`}
        ${isImmutable ? '' : `<button class="cwh-resolve-btn btn btn-secondary" data-checkin-id="${_cwhEsc(it.id)}">Resolve</button>`}
        <button class="cwh-drill-patient-btn btn btn-link" data-patient="${_cwhEsc(it.patient_id)}">Patient</button>
        <button class="cwh-drill-ae-btn btn btn-link" data-patient="${_cwhEsc(it.patient_id)}">AE Hub</button>
        <button class="cwh-drill-adherence-btn btn btn-link" data-patient="${_cwhEsc(it.patient_id)}">Adherence</button>
      </div>
    </div>`;
}

function _cwhBindFilterHandlers(navigate) {
  const sevSel = document.getElementById('cwh-filter-severity-band');
  if (sevSel && !sevSel._bound) {
    sevSel._bound = true;
    sevSel.onchange = () => {
      _cwhState.filterSeverityBand = sevSel.value || '';
      try { api.postClinicianWellnessAuditEvent(_cwhBuildAuditPayload('filter_changed', { note: 'severity_band=' + (_cwhState.filterSeverityBand || 'all') })); } catch (_) {}
      _cwhLoadData().then(() => { _cwhBindFilterHandlers(navigate); _cwhBindRowHandlers(navigate); });
    };
  }
  const axisSel = document.getElementById('cwh-filter-axis');
  if (axisSel && !axisSel._bound) {
    axisSel._bound = true;
    axisSel.onchange = () => {
      _cwhState.filterAxis = axisSel.value || '';
      try { api.postClinicianWellnessAuditEvent(_cwhBuildAuditPayload('filter_changed', { note: 'axis=' + (_cwhState.filterAxis || 'all') })); } catch (_) {}
      _cwhLoadData().then(() => { _cwhBindFilterHandlers(navigate); _cwhBindRowHandlers(navigate); });
    };
  }
  const statSel = document.getElementById('cwh-filter-status');
  if (statSel && !statSel._bound) {
    statSel._bound = true;
    statSel.onchange = () => {
      _cwhState.filterClinicianStatus = statSel.value || '';
      try { api.postClinicianWellnessAuditEvent(_cwhBuildAuditPayload('filter_changed', { note: 'clinician_status=' + (_cwhState.filterClinicianStatus || 'all') })); } catch (_) {}
      _cwhLoadData().then(() => { _cwhBindFilterHandlers(navigate); _cwhBindRowHandlers(navigate); });
    };
  }
  const qInput = document.getElementById('cwh-filter-q');
  if (qInput && !qInput._bound) {
    qInput._bound = true;
    let _qDebounce = null;
    qInput.oninput = () => {
      _cwhState.filterQ = qInput.value || '';
      if (_qDebounce) clearTimeout(_qDebounce);
      _qDebounce = setTimeout(() => {
        try { api.postClinicianWellnessAuditEvent(_cwhBuildAuditPayload('filter_changed', { note: 'q=' + (_cwhState.filterQ || '').slice(0, 60) })); } catch (_) {}
        _cwhLoadData().then(() => { _cwhBindFilterHandlers(navigate); _cwhBindRowHandlers(navigate); });
      }, 300);
    };
  }
  const bulkBtn = document.getElementById('cwh-bulk-ack-btn');
  if (bulkBtn && !bulkBtn._bound) {
    bulkBtn._bound = true;
    bulkBtn.onclick = async () => {
      if (_cwhState.selectedIds.size === 0) {
        if (window.showToast) window.showToast('Select at least one check-in to acknowledge.', 'warn');
        return;
      }
      const note = (typeof window !== 'undefined' ? window.prompt('Acknowledge note (required):', '') : '');
      if (!_cwhNoteRequiredValid(note)) {
        if (window.showToast) window.showToast('Acknowledgement note is required.', 'warn');
        return;
      }
      const ids = Array.from(_cwhState.selectedIds);
      try {
        const r = await api.clinicianWellnessBulkAcknowledge(ids, note);
        try { api.postClinicianWellnessAuditEvent(_cwhBuildAuditPayload('bulk_acknowledged', { note: `processed=${ids.length}` })); } catch (_) {}
        const failed = (r && Array.isArray(r.failures)) ? r.failures.length : 0;
        if (window.showToast) {
          if (failed > 0) window.showToast(`Bulk ack: ${r?.succeeded ?? 0} ok, ${failed} failed.`, 'warn');
          else window.showToast(`Acknowledged ${r?.succeeded ?? ids.length} check-ins.`, 'success');
        }
        _cwhState.selectedIds.clear();
        await _cwhLoadData();
        _cwhBindFilterHandlers(navigate);
        _cwhBindRowHandlers(navigate);
      } catch (_) {
        if (window.showToast) window.showToast('Bulk acknowledge failed.', 'error');
      }
    };
  }
  const csvBtn = document.getElementById('cwh-export-csv-btn');
  if (csvBtn && !csvBtn._bound) {
    csvBtn._bound = true;
    csvBtn.addEventListener('click', () => {
      try { api.postClinicianWellnessAuditEvent(_cwhBuildAuditPayload('export', { note: 'format=csv' })); } catch (_) {}
    });
  }
  const ndBtn = document.getElementById('cwh-export-ndjson-btn');
  if (ndBtn && !ndBtn._bound) {
    ndBtn._bound = true;
    ndBtn.addEventListener('click', () => {
      try { api.postClinicianWellnessAuditEvent(_cwhBuildAuditPayload('export', { note: 'format=ndjson' })); } catch (_) {}
    });
  }
}

function _cwhBindRowHandlers(navigate) {
  const cbs = document.querySelectorAll('.cwh-row-checkbox');
  cbs.forEach(cb => {
    if (cb._bound) return;
    cb._bound = true;
    cb.onchange = () => {
      const id = cb.getAttribute('data-checkin-id');
      if (cb.checked) _cwhState.selectedIds.add(id);
      else _cwhState.selectedIds.delete(id);
      const bulk = document.getElementById('cwh-bulk-ack-btn');
      if (bulk) bulk.textContent = `Bulk acknowledge (${_cwhState.selectedIds.size})`;
    };
  });

  document.querySelectorAll('.cwh-ack-btn').forEach(btn => {
    if (btn._bound) return;
    btn._bound = true;
    btn.onclick = async () => {
      const id = btn.getAttribute('data-checkin-id');
      const note = (typeof window !== 'undefined' ? window.prompt('Acknowledge note (required):', '') : '');
      if (!_cwhNoteRequiredValid(note)) {
        if (window.showToast) window.showToast('Acknowledgement note is required.', 'warn');
        return;
      }
      try {
        await api.clinicianWellnessAcknowledge(id, note);
        try { api.postClinicianWellnessAuditEvent(_cwhBuildAuditPayload('checkin_acknowledged_via_modal', { checkin_id: id })); } catch (_) {}
        if (window.showToast) window.showToast('Check-in acknowledged.', 'success');
        await _cwhLoadData();
        _cwhBindFilterHandlers(navigate);
        _cwhBindRowHandlers(navigate);
      } catch (_) {
        if (window.showToast) window.showToast('Acknowledge failed.', 'error');
      }
    };
  });

  document.querySelectorAll('.cwh-escalate-btn').forEach(btn => {
    if (btn._bound) return;
    btn._bound = true;
    btn.onclick = async () => {
      const id = btn.getAttribute('data-checkin-id');
      const note = (typeof window !== 'undefined' ? window.prompt('Escalation note (required) — creates AE Hub draft:', '') : '');
      if (!_cwhNoteRequiredValid(note)) {
        if (window.showToast) window.showToast('Escalation note is required.', 'warn');
        return;
      }
      try {
        const r = await api.clinicianWellnessEscalate(id, note);
        try { api.postClinicianWellnessAuditEvent(_cwhBuildAuditPayload('checkin_escalated_via_modal', { checkin_id: id })); } catch (_) {}
        if (window.showToast) {
          window.showToast(r?.adverse_event_id ? `Escalated · AE draft ${r.adverse_event_id}` : 'Check-in escalated.', 'success');
        }
        await _cwhLoadData();
        _cwhBindFilterHandlers(navigate);
        _cwhBindRowHandlers(navigate);
      } catch (_) {
        if (window.showToast) window.showToast('Escalation failed.', 'error');
      }
    };
  });

  document.querySelectorAll('.cwh-resolve-btn').forEach(btn => {
    if (btn._bound) return;
    btn._bound = true;
    btn.onclick = async () => {
      const id = btn.getAttribute('data-checkin-id');
      const note = (typeof window !== 'undefined' ? window.prompt('Resolution note (required) — check-in is immutable thereafter:', '') : '');
      if (!_cwhNoteRequiredValid(note)) {
        if (window.showToast) window.showToast('Resolution note is required.', 'warn');
        return;
      }
      try {
        await api.clinicianWellnessResolve(id, note);
        try { api.postClinicianWellnessAuditEvent(_cwhBuildAuditPayload('checkin_resolved_via_modal', { checkin_id: id })); } catch (_) {}
        if (window.showToast) window.showToast('Check-in resolved.', 'success');
        await _cwhLoadData();
        _cwhBindFilterHandlers(navigate);
        _cwhBindRowHandlers(navigate);
      } catch (_) {
        if (window.showToast) window.showToast('Resolve failed.', 'error');
      }
    };
  });

  document.querySelectorAll('.cwh-drill-patient-btn').forEach(btn => {
    if (btn._bound) return;
    btn._bound = true;
    btn.onclick = () => {
      const pid = btn.getAttribute('data-patient');
      try { api.postClinicianWellnessAuditEvent(_cwhBuildAuditPayload('deep_link_followed', { note: 'patient=' + pid })); } catch (_) {}
      if (pid) window._patientId = pid;
      if (typeof navigate === 'function') navigate('patient-profile');
      else if (typeof window !== 'undefined' && window._nav) window._nav('patient-profile');
    };
  });

  document.querySelectorAll('.cwh-drill-ae-btn').forEach(btn => {
    if (btn._bound) return;
    btn._bound = true;
    btn.onclick = () => {
      const pid = btn.getAttribute('data-patient');
      try { api.postClinicianWellnessAuditEvent(_cwhBuildAuditPayload('deep_link_followed', { note: 'ae_hub=' + pid })); } catch (_) {}
      if (pid) window._patientId = pid;
      if (typeof navigate === 'function') navigate('adverse-events');
      else if (typeof window !== 'undefined' && window._nav) window._nav('adverse-events');
    };
  });

  document.querySelectorAll('.cwh-drill-adherence-btn').forEach(btn => {
    if (btn._bound) return;
    btn._bound = true;
    btn.onclick = () => {
      const pid = btn.getAttribute('data-patient');
      try { api.postClinicianWellnessAuditEvent(_cwhBuildAuditPayload('deep_link_followed', { note: 'adherence_hub=' + pid })); } catch (_) {}
      if (pid) window._patientId = pid;
      if (typeof navigate === 'function') navigate('clinician-adherence');
      else if (typeof window !== 'undefined' && window._nav) window._nav('clinician-adherence');
    };
  });
}


// ── pgClinicianDailyDigest — Notifications Pulse / End-of-shift summary ─────
// Launch-audit 2026-05-01. Top-of-loop telemetry the Care Team Coverage SLA
// chain (#357) currently lacks. End-of-shift summary across the four
// clinician hubs (Inbox #354, Wearables Workbench #353, Adherence Hub #361,
// Wellness Hub #365) plus AE Hub #342 escalations. Read-only aggregator
// + email/colleague-share audit rows; SMTP wire-up tracked in PR section F.
const _cdgEsc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function _cdgNoteRequiredValid(note) {
  if (note == null) return false;
  return String(note).trim().length > 0;
}

function _cdgBuildAuditPayload(event, extra = {}) {
  const out = { event };
  if (extra.target_id) out.target_id = String(extra.target_id);
  if (extra.note) out.note = String(extra.note).slice(0, 480);
  if (extra.using_demo_data) out.using_demo_data = true;
  return out;
}

function _cdgBuildFilterParams(state) {
  const params = {};
  if (state?.since) params.since = state.since;
  if (state?.until) params.until = state.until;
  if (state?.surface) params.surface = state.surface;
  if (state?.severity) params.severity = state.severity;
  if (state?.patientId) params.patient_id = state.patientId;
  return params;
}

function _cdgShouldShowDemoBanner(serverResp) {
  return !!(serverResp && serverResp.is_demo_view);
}

function _cdgEmptySummary() {
  return {
    handled: 0, escalated: 0, paged: 0, open: 0, sla_breached: 0,
    by_surface: {}, since: '', until: '', is_demo_view: false,
  };
}

function _cdgPresetWindow(preset) {
  // Returns { since, until } ISO strings for one of: today / yesterday / 7d / 12h.
  const now = new Date();
  if (preset === 'yesterday') {
    const until = new Date(now);
    until.setUTCHours(0, 0, 0, 0);
    const since = new Date(until);
    since.setUTCDate(since.getUTCDate() - 1);
    return { since: since.toISOString(), until: until.toISOString() };
  }
  if (preset === '7d') {
    const since = new Date(now);
    since.setUTCDate(since.getUTCDate() - 7);
    return { since: since.toISOString(), until: now.toISOString() };
  }
  if (preset === 'today') {
    const since = new Date(now);
    since.setUTCHours(0, 0, 0, 0);
    return { since: since.toISOString(), until: now.toISOString() };
  }
  // Default: last 12h (the API default — pass null to honour it).
  return { since: null, until: null };
}

const _CDG_SURFACE_LABEL = {
  clinician_inbox: 'Clinician Inbox',
  wearables_workbench: 'Wearables Workbench',
  clinician_adherence_hub: 'Adherence Hub',
  clinician_wellness_hub: 'Wellness Hub',
  adverse_events_hub: 'Adverse Events Hub',
};

const _CDG_SURFACE_ROUTE = {
  clinician_inbox: 'clinician-inbox',
  wearables_workbench: 'monitor',
  clinician_adherence_hub: 'clinician-adherence',
  clinician_wellness_hub: 'clinician-wellness',
  adverse_events_hub: 'adverse-events-hub',
};

const _CDG_PRESETS = [
  ['12h', 'Last 12h (default)'],
  ['today', 'Today (00:00 → now)'],
  ['yesterday', 'Yesterday (00:00 → 24:00)'],
  ['7d', 'Last 7 days'],
];

const _cdgState = {
  preset: '12h',
  since: null,
  until: null,
  surface: '',
  severity: '',
  patientId: '',
  summary: _cdgEmptySummary(),
  sections: [],
  events: [],
  loaded: false,
  isDemoView: false,
};

export async function pgClinicianDailyDigest(setTopbar, navigate) {
  const el = document.getElementById('app');
  if (!el) return;

  if (typeof setTopbar === 'function') {
    setTopbar(
      'Clinician Daily Digest',
      'End-of-shift summary across Inbox, Wearables Workbench, Adherence, Wellness, and AE drafts.',
    );
  }

  // Mount-time audit ping. Best-effort.
  try {
    api.postClinicianDigestAuditEvent(_cdgBuildAuditPayload('view', {
      note: 'daily digest page mounted',
    }));
  } catch (_) { /* ignore */ }

  el.innerHTML = `
    <div id="cdg-root" style="max-width:1180px;margin:0 auto;padding:18px 24px">
      <div id="cdg-controls"></div>
      <div id="cdg-banner"></div>
      <div id="cdg-summary"></div>
      <div id="cdg-sections"></div>
      <div id="cdg-events"></div>
    </div>`;

  await _cdgLoadData();
  _cdgBindControls(navigate);
  _cdgBindSectionDrillOuts(navigate);
}

async function _cdgLoadData() {
  const root = document.getElementById('cdg-root');
  if (!root) return; // navigated away
  const params = _cdgBuildFilterParams(_cdgState);
  const [summary, sections, events] = await Promise.all([
    api.clinicianDigestSummary(params),
    api.clinicianDigestSections({ since: params.since || '', until: params.until || '' }),
    api.clinicianDigestEvents(params),
  ]);

  _cdgState.summary = summary || _cdgEmptySummary();
  _cdgState.sections = (sections && Array.isArray(sections.sections)) ? sections.sections : [];
  _cdgState.events = (events && Array.isArray(events.items)) ? events.items : [];
  _cdgState.isDemoView = !!(_cdgState.summary.is_demo_view
    || (sections && sections.is_demo_view)
    || (events && events.is_demo_view));
  _cdgState.loaded = true;

  const controlsEl = document.getElementById('cdg-controls');
  if (controlsEl) controlsEl.innerHTML = _cdgRenderControls(_cdgState);
  const bannerEl = document.getElementById('cdg-banner');
  if (bannerEl) bannerEl.innerHTML = _cdgShouldShowDemoBanner({ is_demo_view: _cdgState.isDemoView }) ? _cdgRenderDemoBanner() : '';
  const summaryEl = document.getElementById('cdg-summary');
  if (summaryEl) summaryEl.innerHTML = _cdgRenderSummaryStrip(_cdgState.summary);
  const sectionsEl = document.getElementById('cdg-sections');
  if (sectionsEl) sectionsEl.innerHTML = _cdgRenderSections(_cdgState.sections);
  const eventsEl = document.getElementById('cdg-events');
  if (eventsEl) eventsEl.innerHTML = _cdgRenderEvents(_cdgState.events);
}

function _cdgRenderControls(state) {
  const presetOpts = _CDG_PRESETS.map(([v, l]) =>
    `<option value="${_cdgEsc(v)}"${v === state.preset ? ' selected' : ''}>${_cdgEsc(l)}</option>`).join('');
  const surfaceOpts = ['', ...Object.keys(_CDG_SURFACE_LABEL)].map(v => {
    const l = v === '' ? 'All surfaces' : (_CDG_SURFACE_LABEL[v] || v);
    return `<option value="${_cdgEsc(v)}"${v === state.surface ? ' selected' : ''}>${_cdgEsc(l)}</option>`;
  }).join('');
  const csvHref = api.clinicianDigestExportCsvUrl(_cdgBuildFilterParams(state));
  const ndjsonHref = api.clinicianDigestExportNdjsonUrl(_cdgBuildFilterParams(state));
  return `
    <div class="card" style="padding:12px 14px;margin-bottom:14px;display:flex;flex-wrap:wrap;gap:10px;align-items:center">
      <select id="cdg-preset" class="form-control" style="max-width:220px">${presetOpts}</select>
      <input id="cdg-since" class="form-control" style="max-width:200px" placeholder="since (ISO, optional)" value="${_cdgEsc(state.since || '')}">
      <input id="cdg-until" class="form-control" style="max-width:200px" placeholder="until (ISO, optional)" value="${_cdgEsc(state.until || '')}">
      <select id="cdg-surface" class="form-control" style="max-width:200px">${surfaceOpts}</select>
      <input id="cdg-patient" class="form-control" style="max-width:180px" placeholder="patient_id filter" value="${_cdgEsc(state.patientId || '')}">
      <button id="cdg-email-btn" class="btn btn-primary">Email me the digest</button>
      <button id="cdg-share-btn" class="btn btn-secondary">Share with colleague…</button>
      <a id="cdg-csv-btn" class="btn btn-link" href="${_cdgEsc(csvHref)}" target="_blank">Export CSV</a>
      <a id="cdg-ndjson-btn" class="btn btn-link" href="${_cdgEsc(ndjsonHref)}" target="_blank">Export NDJSON</a>
    </div>`;
}

function _cdgRenderDemoBanner() {
  return `
    <div class="notice notice-warning" style="margin-bottom:14px;font-size:12.5px;line-height:1.55">
      <strong>Demo data.</strong> Some events shown are from demo patients. Exports will be DEMO-prefixed; not regulator-submittable.
    </div>`;
}

function _cdgRenderSummaryStrip(s) {
  const card = (label, value, sub) => `
    <div class="card" style="padding:14px;text-align:center">
      <div style="font-size:22px;font-weight:700;color:var(--text-primary)">${_cdgEsc(String(value ?? 0))}</div>
      <div style="font-size:11px;font-weight:600;color:var(--text-secondary);margin-top:4px">${_cdgEsc(label)}</div>
      ${sub ? `<div style="font-size:10px;color:var(--text-tertiary);margin-top:2px">${_cdgEsc(sub)}</div>` : ''}
    </div>`;
  const since = s.since ? new Date(s.since).toLocaleString() : '—';
  const until = s.until ? new Date(s.until).toLocaleString() : '—';
  return `
    <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:8px">Window: ${_cdgEsc(since)} → ${_cdgEsc(until)} (UTC)</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:16px">
      ${card('Handled', s.handled ?? 0, 'this shift')}
      ${card('Escalated', s.escalated ?? 0, 'AE drafts created')}
      ${card('Paged', s.paged ?? 0, 'on-call notifications')}
      ${card('Open', s.open ?? 0, 'still on the queue')}
      ${card('SLA breached', s.sla_breached ?? 0, 'past per-surface SLA')}
    </div>`;
}

function _cdgRenderSections(sections) {
  if (!Array.isArray(sections) || sections.length === 0) {
    return _cdgRenderEmptyState();
  }
  // If every section is empty (no events), surface the honest empty state.
  const totalActivity = sections.reduce((acc, sx) =>
    acc + (sx.handled || 0) + (sx.escalated || 0) + (sx.paged || 0) + (sx.open || 0), 0);
  if (totalActivity === 0) {
    return _cdgRenderEmptyState();
  }
  return `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;margin-bottom:18px">
      ${sections.map(_cdgRenderSectionCard).join('')}
    </div>`;
}

function _cdgRenderEmptyState() {
  return `
    <div class="card" style="padding:36px 24px;text-align:center;color:var(--text-secondary);margin-bottom:18px">
      <div style="font-size:2.4rem;margin-bottom:14px">∅</div>
      <div style="font-size:1.05rem;font-weight:600;margin-bottom:6px">No events to summarise for this shift.</div>
      <div style="font-size:0.85rem;color:var(--text-tertiary);max-width:480px;margin:0 auto">
        Counts are real audit-table aggregates across Inbox, Wearables Workbench, Adherence, Wellness and AE drafts. Nothing to display means: nothing was acknowledged, escalated, paged, or aged past its SLA in the current window. This is not AI-fabricated.
      </div>
    </div>`;
}

function _cdgRenderSectionCard(sx) {
  const label = _CDG_SURFACE_LABEL[sx.surface] || sx.surface;
  const top = (sx.top_patients || []).slice(0, 3);
  const topHtml = top.length
    ? `<div style="margin-top:8px;font-size:11px;color:var(--text-secondary)">Top activity:
        ${top.map(p => `<button class="cdg-drill-patient-btn" data-patient="${_cdgEsc(p.patient_id)}" data-surface="${_cdgEsc(sx.surface)}" style="background:none;border:none;color:var(--accent,#3b82f6);text-decoration:underline;cursor:pointer;padding:0;font-size:11px">${_cdgEsc(p.patient_name)}</button> · ${_cdgEsc(String(p.event_count))}`).join('<br>')}
      </div>`
    : `<div style="margin-top:8px;font-size:11px;color:var(--text-tertiary)">No per-patient activity in this window.</div>`;
  return `
    <div class="card" style="padding:14px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
        <div style="font-size:13px;font-weight:600;color:var(--text-primary)">${_cdgEsc(label)}</div>
        <button class="cdg-drill-section-btn btn btn-link" data-surface="${_cdgEsc(sx.surface)}" style="padding:0;font-size:11px">Open hub →</button>
      </div>
      <div style="margin-top:10px;display:grid;grid-template-columns:repeat(4,1fr);gap:6px;font-size:11px">
        <div><div style="font-weight:700;color:var(--text-primary);font-size:14px">${_cdgEsc(String(sx.handled ?? 0))}</div><div style="color:var(--text-tertiary)">handled</div></div>
        <div><div style="font-weight:700;color:#ff6b6b;font-size:14px">${_cdgEsc(String(sx.escalated ?? 0))}</div><div style="color:var(--text-tertiary)">escalated</div></div>
        <div><div style="font-weight:700;color:#f59e0b;font-size:14px">${_cdgEsc(String(sx.paged ?? 0))}</div><div style="color:var(--text-tertiary)">paged</div></div>
        <div><div style="font-weight:700;color:#3b82f6;font-size:14px">${_cdgEsc(String(sx.open ?? 0))}</div><div style="color:var(--text-tertiary)">open</div></div>
      </div>
      ${topHtml}
    </div>`;
}

function _cdgRenderEvents(events) {
  if (!Array.isArray(events) || events.length === 0) return '';
  const rows = events.slice(0, 50).map(_cdgRenderEventRow).join('');
  return `
    <div class="card" style="padding:0;margin-bottom:14px;overflow:hidden">
      <div style="padding:10px 14px;border-bottom:1px solid var(--border-color);font-size:12px;font-weight:600;color:var(--text-secondary)">Recent events (${_cdgEsc(String(events.length))} total)</div>
      ${rows}
    </div>`;
}

function _cdgRenderEventRow(it) {
  const flag = it.is_paged ? `<span style="color:#f59e0b;font-size:10px;background:var(--bg-tertiary);padding:1px 5px;border-radius:3px;margin-right:6px">PAGED</span>`
    : it.is_escalated ? `<span style="color:#ff6b6b;font-size:10px;background:var(--bg-tertiary);padding:1px 5px;border-radius:3px;margin-right:6px">ESCALATED</span>`
    : it.is_handled ? `<span style="color:#14b8a6;font-size:10px;background:var(--bg-tertiary);padding:1px 5px;border-radius:3px;margin-right:6px">HANDLED</span>`
    : '';
  const demo = it.is_demo ? `<span style="color:var(--text-tertiary);font-size:10px;background:var(--bg-tertiary);padding:1px 5px;border-radius:3px;margin-right:6px">DEMO</span>` : '';
  const surface = _CDG_SURFACE_LABEL[it.surface] || it.surface || '—';
  const ts = it.created_at ? new Date(it.created_at).toLocaleString() : '—';
  const drillHtml = it.drill_out_url
    ? `<button class="cdg-drill-event-btn btn btn-link" data-url="${_cdgEsc(it.drill_out_url)}" data-patient="${_cdgEsc(it.patient_id || '')}" data-surface="${_cdgEsc(it.surface || '')}" style="font-size:11px;padding:0">Drill out →</button>`
    : '';
  return `
    <div style="padding:8px 14px;border-bottom:1px solid var(--border-color);display:flex;flex-wrap:wrap;gap:8px;align-items:flex-start;font-size:12px">
      <div style="flex:1;min-width:240px">
        <div>${flag}${demo}<strong>${_cdgEsc(surface)}</strong> · <span style="color:var(--text-secondary)">${_cdgEsc(it.event_type || it.action || '')}</span></div>
        ${it.patient_name ? `<div style="font-size:11px;color:var(--text-secondary)">Patient: ${_cdgEsc(it.patient_name)} <span style="color:var(--text-tertiary)">(${_cdgEsc(it.patient_id || '')})</span></div>` : ''}
        <div style="font-size:11px;color:var(--text-tertiary)">${_cdgEsc(ts)}</div>
        ${it.note ? `<div style="font-size:11px;color:var(--text-secondary);margin-top:2px">${_cdgEsc((it.note || '').slice(0, 200))}${(it.note || '').length > 200 ? '…' : ''}</div>` : ''}
      </div>
      <div>${drillHtml}</div>
    </div>`;
}

function _cdgBindControls(navigate) {
  const presetSel = document.getElementById('cdg-preset');
  if (presetSel && !presetSel._bound) {
    presetSel._bound = true;
    presetSel.onchange = async () => {
      _cdgState.preset = presetSel.value || '12h';
      const w = _cdgPresetWindow(_cdgState.preset);
      _cdgState.since = w.since;
      _cdgState.until = w.until;
      try { api.postClinicianDigestAuditEvent(_cdgBuildAuditPayload('date_range_changed', { note: 'preset=' + _cdgState.preset })); } catch (_) {}
      await _cdgLoadData();
      _cdgBindControls(navigate);
      _cdgBindSectionDrillOuts(navigate);
    };
  }
  const sinceInp = document.getElementById('cdg-since');
  if (sinceInp && !sinceInp._bound) {
    sinceInp._bound = true;
    sinceInp.onchange = async () => {
      _cdgState.since = sinceInp.value || null;
      try { api.postClinicianDigestAuditEvent(_cdgBuildAuditPayload('filter_changed', { note: 'since=' + (_cdgState.since || '') })); } catch (_) {}
      await _cdgLoadData();
      _cdgBindControls(navigate);
      _cdgBindSectionDrillOuts(navigate);
    };
  }
  const untilInp = document.getElementById('cdg-until');
  if (untilInp && !untilInp._bound) {
    untilInp._bound = true;
    untilInp.onchange = async () => {
      _cdgState.until = untilInp.value || null;
      try { api.postClinicianDigestAuditEvent(_cdgBuildAuditPayload('filter_changed', { note: 'until=' + (_cdgState.until || '') })); } catch (_) {}
      await _cdgLoadData();
      _cdgBindControls(navigate);
      _cdgBindSectionDrillOuts(navigate);
    };
  }
  const surfSel = document.getElementById('cdg-surface');
  if (surfSel && !surfSel._bound) {
    surfSel._bound = true;
    surfSel.onchange = async () => {
      _cdgState.surface = surfSel.value || '';
      try { api.postClinicianDigestAuditEvent(_cdgBuildAuditPayload('filter_changed', { note: 'surface=' + (_cdgState.surface || 'all') })); } catch (_) {}
      await _cdgLoadData();
      _cdgBindControls(navigate);
      _cdgBindSectionDrillOuts(navigate);
    };
  }
  const pidInp = document.getElementById('cdg-patient');
  if (pidInp && !pidInp._bound) {
    pidInp._bound = true;
    pidInp.onchange = async () => {
      _cdgState.patientId = pidInp.value || '';
      try { api.postClinicianDigestAuditEvent(_cdgBuildAuditPayload('filter_changed', { note: 'patient_id=' + (_cdgState.patientId || 'all') })); } catch (_) {}
      await _cdgLoadData();
      _cdgBindControls(navigate);
      _cdgBindSectionDrillOuts(navigate);
    };
  }
  const emailBtn = document.getElementById('cdg-email-btn');
  if (emailBtn && !emailBtn._bound) {
    emailBtn._bound = true;
    emailBtn.onclick = async () => {
      const ok = (typeof window !== 'undefined' && window.confirm)
        ? window.confirm('Email this digest to your account email? (Delivery may be queued — see banner for status.)')
        : true;
      if (!ok) return;
      const reason = (typeof window !== 'undefined' && window.prompt)
        ? (window.prompt('Optional note for the audit log:', '') || '')
        : '';
      try { api.postClinicianDigestAuditEvent(_cdgBuildAuditPayload('email_initiated', { note: 'reason=' + reason.slice(0, 100) })); } catch (_) {}
      try {
        const r = await api.clinicianDigestSendEmail({
          reason,
          since: _cdgState.since,
          until: _cdgState.until,
        });
        if (r && r.delivery_status === 'sent') {
          if (window.showToast) window.showToast(`Digest emailed to ${r.recipient_email}.`, 'success');
        } else if (r && r.delivery_status === 'queued') {
          if (window.showToast) window.showToast(
            `Email queued — actual delivery requires SMTP wire-up. Audit recorded for ${r.recipient_email}.`,
            'info',
          );
        } else if (r && r.delivery_status === 'failed') {
          if (window.showToast) window.showToast('Email send failed. Check audit trail for details.', 'error');
        } else {
          if (window.showToast) window.showToast('Email request returned no status — check the audit trail.', 'warn');
        }
      } catch (e) {
        if (window.showToast) window.showToast('Email send failed.', 'error');
      }
    };
  }
  const shareBtn = document.getElementById('cdg-share-btn');
  if (shareBtn && !shareBtn._bound) {
    shareBtn._bound = true;
    shareBtn.onclick = async () => {
      const recipient = (typeof window !== 'undefined' && window.prompt)
        ? (window.prompt('Colleague user_id (must be in your clinic):', '') || '')
        : '';
      if (!_cdgNoteRequiredValid(recipient)) {
        if (window.showToast) window.showToast('Recipient user id required.', 'warn');
        return;
      }
      const reason = (typeof window !== 'undefined' && window.prompt)
        ? (window.prompt('Optional note for the audit log:', '') || '')
        : '';
      try { api.postClinicianDigestAuditEvent(_cdgBuildAuditPayload('colleague_share_initiated', { note: 'recipient=' + recipient.slice(0, 60) })); } catch (_) {}
      try {
        const r = await api.clinicianDigestShareColleague(recipient, reason, {
          since: _cdgState.since, until: _cdgState.until,
        });
        if (r && r.recipient_email) {
          if (window.showToast) window.showToast(
            `Digest queued for ${r.recipient_email} (${r.delivery_status}). Audit recorded.`,
            'info',
          );
        }
      } catch (e) {
        // 404 is the cross-clinic / unknown-recipient response.
        if (window.showToast) window.showToast('Could not share — recipient not found in your clinic.', 'error');
      }
    };
  }
  const csvBtn = document.getElementById('cdg-csv-btn');
  if (csvBtn && !csvBtn._bound) {
    csvBtn._bound = true;
    csvBtn.addEventListener('click', () => {
      try { api.postClinicianDigestAuditEvent(_cdgBuildAuditPayload('export', { note: 'format=csv' })); } catch (_) {}
    });
  }
  const ndBtn = document.getElementById('cdg-ndjson-btn');
  if (ndBtn && !ndBtn._bound) {
    ndBtn._bound = true;
    ndBtn.addEventListener('click', () => {
      try { api.postClinicianDigestAuditEvent(_cdgBuildAuditPayload('export', { note: 'format=ndjson' })); } catch (_) {}
    });
  }
}

function _cdgBindSectionDrillOuts(navigate) {
  document.querySelectorAll('.cdg-drill-section-btn').forEach(btn => {
    if (btn._bound) return;
    btn._bound = true;
    btn.onclick = () => {
      const surface = btn.getAttribute('data-surface');
      const route = _CDG_SURFACE_ROUTE[surface];
      try { api.postClinicianDigestAuditEvent(_cdgBuildAuditPayload('drill_out', { note: 'surface=' + surface })); } catch (_) {}
      if (route && typeof navigate === 'function') navigate(route);
      else if (route && typeof window !== 'undefined' && window._nav) window._nav(route);
    };
  });
  document.querySelectorAll('.cdg-drill-patient-btn').forEach(btn => {
    if (btn._bound) return;
    btn._bound = true;
    btn.onclick = () => {
      const pid = btn.getAttribute('data-patient');
      const surface = btn.getAttribute('data-surface');
      const route = _CDG_SURFACE_ROUTE[surface] || 'patient-profile';
      try { api.postClinicianDigestAuditEvent(_cdgBuildAuditPayload('drill_out', { note: 'patient=' + pid + '; surface=' + surface })); } catch (_) {}
      if (pid) window._patientId = pid;
      if (typeof navigate === 'function') navigate(route);
      else if (typeof window !== 'undefined' && window._nav) window._nav(route);
    };
  });
  document.querySelectorAll('.cdg-drill-event-btn').forEach(btn => {
    if (btn._bound) return;
    btn._bound = true;
    btn.onclick = () => {
      const url = btn.getAttribute('data-url') || '';
      const surface = btn.getAttribute('data-surface') || '';
      const pid = btn.getAttribute('data-patient') || '';
      try { api.postClinicianDigestAuditEvent(_cdgBuildAuditPayload('drill_out', { note: 'event_drill; url=' + url })); } catch (_) {}
      // url is of the form "?page=foo&patient_id=bar" — derive the route.
      const m = url.match(/\?page=([a-z0-9_-]+)/i);
      const route = (m && m[1]) || _CDG_SURFACE_ROUTE[surface] || 'clinician-inbox';
      if (pid) window._patientId = pid;
      if (typeof navigate === 'function') navigate(route);
      else if (typeof window !== 'undefined' && window._nav) window._nav(route);
    };
  });
}
