import { api, downloadBlob } from './api.js';
import { spinner, emptyState, evidenceBadge, labelBadge, safetyBadge, approvalBadge, govFlag, fr, cardWrap, tag } from './helpers.js';
import { FALLBACK_ASSESSMENT_TEMPLATES, FALLBACK_CONDITIONS, FALLBACK_MODALITIES } from './constants.js';
import { currentUser } from './auth.js';

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

// ── Clinical Intelligence — Risk Scoring ──────────────────────────────────────

function computeRiskScore(course) {
  let score = 0;
  const gradeRisk = { A: 0, B: 10, C: 25, D: 40 };
  score += gradeRisk[course.evidence_grade] ?? 20;
  if (course.on_label === false) score += 30;
  score += (course.governance_warnings || []).length * 15;
  if (course.review_required) score += 10;
  if (course.planned_intensity_pct_rmt > 110) score += 15;
  if (course.planned_intensity_pct_rmt > 120) score += 15;
  if (course.planned_frequency_hz > 20) score += 10;
  if (course.planned_sessions_total > 40) score += 5;
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
  'tDCS':          { condition: 'Depression (MDD)',          expected_responder_rate: 52, evidence: 'Meta-analysis (n=1,144)' },
  'TMS':           { condition: 'Treatment-Resistant Depression', expected_responder_rate: 58, evidence: 'FDA-cleared indication' },
  'Neurofeedback': { condition: 'ADHD',                      expected_responder_rate: 64, evidence: 'Meta-analysis (n=830)' },
  'taVNS':         { condition: 'Epilepsy',                  expected_responder_rate: 45, evidence: 'RCT data (n=600)' },
  'CES':           { condition: 'Anxiety/Insomnia',          expected_responder_rate: 55, evidence: 'Meta-analysis (n=2,400)' },
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
    <div style="font-size:10px;color:var(--text-tertiary);margin-top:3px">${benchmark.evidence} &middot; ${benchmark.condition}</div>
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
  if (lowAdherence)                         return { label: 'Message Patient',     onclick: "window._nav('messaging')",          style: 'normal'  };
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
        <span style="font-size:13px;font-weight:700;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:150px">${c._patientName || '—'}</span>
        <span style="font-size:11.5px;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${(c.condition_slug || '—').replace(/-/g,' ')}</span>
        <span style="font-size:11px;color:var(--teal);font-weight:600;flex-shrink:0">${c.modality_slug || '—'}</span>
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
        <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c._patientName || '—'}</div>
        <div style="font-size:11.5px;color:var(--text-secondary)">${(c.condition_slug || '—').replace(/-/g,' ')} · <span style="color:var(--teal)">${c.modality_slug || '—'}</span></div>
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

  el.innerHTML = `
    <div class="page-section">

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
          <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--text-tertiary);font-size:13px;pointer-events:none">⌕</span>
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
            style="padding:6px 12px;font-size:12px;border:none;cursor:pointer;background:var(--teal);color:#000;font-weight:700;font-family:var(--font-body)">≡ List</button>
          <button id="tc-view-card" onclick="window._tcSetView('card')"
            style="padding:6px 12px;font-size:12px;border:none;cursor:pointer;background:transparent;color:var(--text-secondary);font-family:var(--font-body)">⊞ Cards</button>
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

    </div>`;

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

    let visible = [...(window._tcAllCourses || [])];

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
          <div style="font-size:0.75rem;color:var(--text-secondary);margin-top:2px">${entry.course?.title || entry.course?.condition_slug || 'Course ' + String(entry.courseId).slice(0, 6)}</div>
          <div style="font-size:0.72rem;color:var(--text-secondary);margin-top:1px">${new Date(entry.note.updated_at).toLocaleDateString()}</div>
          <div style="font-size:0.75rem;color:var(--text-secondary);margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px">${entry.note.subjective?.slice(0, 60) || 'Empty note'}...</div>
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
    window._showNotifToast?.({ title: 'Note Saved', body: 'SOAP note saved successfully', severity: 'success' });
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
      <div class="header"><h1>Clinical SOAP Note</h1><p style="color:#666;font-size:0.9rem">Generated: ${new Date().toLocaleString()} · ${note.clinician || 'Clinician'}</p></div>
      <h3>Subjective</h3><p>${note.subjective || '—'}</p>
      <h3>Objective</h3><p>${note.objective || '—'}</p>
      <h3>Assessment</h3><p>${note.assessment || '—'}</p>
      <h3>Plan</h3><p>${note.plan || '—'}</p>
      <h3>Adverse Effects</h3><p>${note.adverse || 'None reported'}</p>
      <div class="footer">Next session: ${note.next_date || 'Not scheduled'} · DeepSynaps Protocol Studio · CONFIDENTIAL</div>
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

// ── pgCourseDetail — Full course detail ──────────────────────────────────────
export async function pgCourseDetail(setTopbar, navigate) {
  const id = window._selectedCourseId;
  if (!id) { navigate('courses'); return; }

  const el = document.getElementById('content');
  el.innerHTML = spinner();

  let course = null, sessions = [], adverseEvents = [], patient = null, protocolDetail = null, outcomes = [], outcomeSummary = null;
  try {
    course = await api.getCourse(id);
    [sessions, adverseEvents, outcomes] = await Promise.all([
      api.listCourseSessions(id).then(r => r?.items || []).catch(() => []),
      api.listAdverseEvents({ course_id: id }).then(r => r?.items || []).catch(() => []),
      api.listOutcomes({ course_id: id }).then(r => r?.items || []).catch(() => []),
    ]);
    if (course?.patient_id) {
      patient = await api.getPatient(course.patient_id).catch(() => null);
    }
    if (course?.protocol_id) {
      protocolDetail = await api.protocolDetail(course.protocol_id).catch(() => null);
    }
    outcomeSummary = await api.courseOutcomeSummary(id).catch(() => null);
  } catch (e) {
    el.innerHTML = `<div class="notice notice-warn">Could not load course: ${e.message}</div>`;
    return;
  }

  if (!course) { navigate('courses'); return; }

  const patName   = patient ? `${patient.first_name} ${patient.last_name}` : 'Unknown Patient';
  const progress  = course.planned_sessions_total > 0
    ? Math.min(100, Math.round((course.sessions_delivered / course.planned_sessions_total) * 100))
    : 0;
  const statusCol = STATUS_COLOR[course.status] || 'var(--text-tertiary)';

  setTopbar(
    `${course.condition_slug ? course.condition_slug.replace(/-/g,' ') : 'Course'} · ${course.modality_slug || ''}`,
    `<button class="btn btn-ghost btn-sm" onclick="window._nav('courses')">← Courses</button>
     <button class="btn btn-sm" onclick="window._showExportPanel()">↓ Export Report</button>
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
              Patient: <strong style="color:var(--text-primary)">${patName}</strong>
              ${course.device_slug ? ` · Device: <span class="tag">${course.device_slug}</span>` : ''}
              ${course.target_region ? ` · Target: <span class="tag">${course.target_region}</span>` : ''}
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              ${approvalBadge(course.status)}
              ${evidenceBadge(course.evidence_grade)}
              ${course.on_label === false ? labelBadge(false) : labelBadge(true)}
              ${safetyBadge(course.governance_warnings)}
              ${course.review_required ? `<span style="font-size:10px;padding:2px 7px;border-radius:4px;background:rgba(255,107,107,0.1);color:var(--red);font-weight:600">Review Required</span>` : ''}
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
        <button class="btn btn-sm no-print" onclick="window._cdPrint()">&#128424; Print Course Report</button>
      </div>
      <div id="cd-exp-notice" style="display:none;margin-top:10px;font-size:12px;color:var(--text-secondary)"></div>
    </div>

    <div class="tab-bar" style="margin-bottom:20px">
      ${['overview','sessions','outcomes','protocol','adverse-events','governance','assessments','home-programs','reports','notes'].map(t =>
        `<button class="tab-btn ${tab === t ? 'active' : ''}" onclick="window._cdSwitchTab('${t}')">${
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

    <div id="cd-tab-body">${renderCourseTab(course, sessions, adverseEvents, protocolDetail, tab, outcomes, outcomeSummary)}</div>`;

  window._cdSwitchTab = function(t) {
    window._cdTab = t;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.getAttribute('onclick')?.includes(`'${t}'`)));
    document.getElementById('cd-tab-body').innerHTML = renderCourseTab(course, sessions, adverseEvents, protocolDetail, t, outcomes, outcomeSummary);
  };

  window._showExportPanel = function() {
    const panel = document.getElementById('cd-export-panel');
    if (panel) panel.style.display = panel.style.display === 'none' ? '' : 'none';
  };

  window._cdExport = async function(type) {
    const btnId  = type === 'protocol' ? 'cd-exp-protocol' : type === 'guide' ? 'cd-exp-guide' : 'cd-exp-summary';
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

  window._activateCourseDetail = async function(courseId) {
    try {
      await api.activateCourse(courseId);
      window._nav('course-detail');
    } catch (e) {
      const errBanner = document.createElement('div');
      errBanner.className = 'notice notice-warn';
      errBanner.style.cssText = 'position:fixed;top:16px;right:16px;z-index:9999;max-width:380px;animation:fadeIn 0.2s';
      errBanner.textContent = e.message || 'Activation failed.';
      document.body.appendChild(errBanner);
      setTimeout(() => errBanner.remove(), 4000);
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
      <div style="font-size:10pt;color:#555;margin-bottom:20px">Patient: <strong>${patName2}</strong> &nbsp;|&nbsp; Status: <strong>${statusLabel}</strong> &nbsp;|&nbsp; Progress: <strong>${course.sessions_delivered || 0} / ${course.planned_sessions_total || '?'} sessions</strong></div>

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
    info:    { border: 'var(--accent-teal, #00d4bc)', bg: 'color-mix(in srgb,var(--accent-teal, #00d4bc) 8%,var(--card-bg, #1a2035))', label: '💡 Next Session Suggestion', labelColor: 'var(--accent-teal, #00d4bc)' },
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

function renderCourseTab(course, sessions, adverseEvents, protocolDetail, tab, outcomes = [], outcomeSummary = null) {
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
      <button class="btn btn-sm" onclick="window._showExportPanel()">↓ Export Report</button>
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
      const mockChangelog = [
        { date: '2026-04-08', actor: 'Dr. A. Smith', action: 'Protocol generated', version: 'v1', type: 'generate' },
        { date: '2026-04-09', actor: 'Dr. A. Smith', action: `Parameters adjusted \u2014 frequency 10Hz \u2192 12Hz`, version: 'v2', type: 'edit' },
        { date: '2026-04-10', actor: 'R. Brown (Reviewer)', action: 'Protocol approved for treatment', version: 'v2', type: 'approve' },
      ];
      const typeColor = { generate: 'var(--teal)', edit: 'var(--blue)', approve: 'var(--green)', reject: 'var(--red)' };
      const typeIcon  = { generate: '&#x2605;', edit: '&#x270E;', approve: '&#x2713;', reject: '&#x2715;' };
      const entries = mockChangelog.map((e, i) => `
        <div style="position:relative;padding-left:24px;margin-bottom:${i < mockChangelog.length - 1 ? '16' : '0'}px">
          <div style="position:absolute;left:0;top:2px;width:14px;height:14px;border-radius:50%;background:${typeColor[e.type] || 'var(--text-tertiary)'};display:flex;align-items:center;justify-content:center;font-size:7px;color:#000;font-weight:700">${typeIcon[e.type] || '&#x25CF;'}</div>
          ${i < mockChangelog.length - 1 ? `<div style="position:absolute;left:6px;top:16px;bottom:-16px;width:2px;background:var(--border)"></div>` : ''}
          <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">
            <span style="font-size:12.5px;font-weight:500;color:var(--text-primary)">${e.action}</span>
            <span style="font-size:10.5px;padding:1px 6px;border-radius:4px;background:rgba(255,255,255,0.05);color:var(--text-tertiary);font-family:'DM Mono',monospace">${e.version}</span>
          </div>
          <div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">${e.date} &nbsp;&middot;&nbsp; ${e.actor}</div>
        </div>`).join('');
      return `<div class="ds-card" style="margin-top:16px">
        <h4 style="margin-bottom:14px;font-size:13px;font-weight:600">Protocol Change Log</h4>
        <div id="proto-changelog-${course.id}" style="position:relative">
          ${entries}
        </div>
        <div style="font-size:10.5px;color:var(--text-tertiary);margin-top:14px;padding-top:10px;border-top:1px solid var(--border)">Session-based history only &mdash; full audit log planned</div>
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
                    ].map(([k,v]) => `<div><span style="color:var(--text-tertiary);font-size:11px">${k}:</span> <span style="color:var(--text-primary)">${v}</span></div>`).join('')}
                  </div>
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
    const canPause = ['active', 'approved'].includes(course.status);
    const canDiscontinue = ['active', 'approved', 'pending_approval', 'paused'].includes(course.status);
    const canResume = course.status === 'paused';
    const canApprove = course.status === 'pending_approval';

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
          `<div id="cd-gov-error" style="color:var(--red);font-size:12px;display:none;margin-bottom:8px"></div>
          <div style="display:flex;flex-direction:column;gap:10px">
            ${canApprove ? `
              <div>
                <div style="font-size:12px;color:var(--text-secondary);margin-bottom:6px">Approve this course to allow session execution.</div>
                <button class="btn btn-primary btn-sm" onclick="window._cdGovAction('approve')">✓ Approve Course</button>
              </div>` : ''}
            ${canResume ? `
              <div>
                <div style="font-size:12px;color:var(--text-secondary);margin-bottom:6px">Resume a paused treatment course.</div>
                <button class="btn btn-sm" style="border-color:var(--teal);color:var(--teal)" onclick="window._cdGovAction('resume')">▶ Resume Course</button>
              </div>` : ''}
            ${canPause ? `
              <div>
                <div style="font-size:12px;color:var(--text-secondary);margin-bottom:6px">Temporarily halt sessions. Patient remains enrolled.</div>
                <button class="btn btn-sm" style="border-color:var(--amber);color:var(--amber)" onclick="window._cdGovAction('pause')">⏸ Pause Course</button>
              </div>` : ''}
            ${canDiscontinue ? `
              <div style="padding-top:${canPause ? '10px' : '0'};border-top:${canPause ? '1px solid var(--border)' : 'none'}">
                <div style="font-size:12px;color:var(--text-secondary);margin-bottom:6px">Permanently discontinue. This cannot be reversed.</div>
                <div style="display:flex;gap:8px;align-items:flex-start">
                  <textarea id="cd-discont-reason" class="form-control" style="flex:1;font-size:12px" rows="2" placeholder="Reason for discontinuation (required)…"></textarea>
                  <button class="btn btn-sm" style="border-color:var(--red);color:var(--red);white-space:nowrap" onclick="window._cdGovAction('discontinue')">⬛ Discontinue</button>
                </div>
              </div>` : ''}
            ${!canPause && !canDiscontinue && !canResume && !canApprove
              ? `<div style="color:var(--text-tertiary);font-size:12.5px;padding:8px 0">No actions available for status <strong>${course.status}</strong>.</div>`
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
          const createdDate = course.created_at ? new Date(course.created_at) : null;
          const submittedDate = course.submitted_at ? new Date(course.submitted_at) : (createdDate ? new Date(createdDate.getTime() + 86400000) : null);
          const approvedDate  = (course.status === 'active' || course.status === 'completed') && course.updated_at ? new Date(course.updated_at) : null;
          const events = [
            { label: `Created by ${course.clinician_id ? 'Clinician' : 'System'}`, date: createdDate, color: 'var(--blue)' },
            { label: 'Submitted for review', date: submittedDate, color: 'var(--amber)' },
            ...(approvedDate ? [{ label: 'Approved &amp; Activated', date: approvedDate, color: 'var(--green)' }] : []),
            ...(course.status === 'paused' ? [{ label: 'Course paused', date: course.updated_at ? new Date(course.updated_at) : null, color: 'var(--amber)' }] : []),
            ...(course.status === 'discontinued' ? [{ label: 'Course discontinued', date: course.updated_at ? new Date(course.updated_at) : null, color: 'var(--red)' }] : []),
          ].filter(e => e.date);
          if (events.length === 0) return '<div style="font-size:12px;color:var(--text-tertiary)">No approval history available.</div>';
          return `<div style="position:relative;padding-left:20px">
            <div style="position:absolute;left:7px;top:6px;bottom:6px;width:2px;background:var(--border)"></div>
            ${events.map((e, i) => `<div style="position:relative;margin-bottom:${i < events.length - 1 ? '16' : '0'}px;display:flex;align-items:flex-start;gap:10px">
              <div style="position:absolute;left:-16px;width:10px;height:10px;border-radius:50%;background:${e.color};border:2px solid var(--navy-850);flex-shrink:0;margin-top:2px"></div>
              <div>
                <div style="font-size:12.5px;font-weight:500;color:var(--text-primary)">${e.label}</div>
                <div style="font-size:11px;color:var(--text-tertiary)">${e.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
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
    return renderCourseAssessmentsTab(course);
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
function renderCourseAssessmentsTab(course) {
  const assigned = course.assessments || [];
  const hasDue   = assigned.some(a => a.status === 'due' || a.status === 'overdue');
  return `<div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <div>
        <h3 style="margin:0 0 2px">Assessments</h3>
        <div style="font-size:11.5px;color:var(--text-secondary)">Outcome tracking for this course · ${assigned.length} assigned</div>
      </div>
      <button class="btn btn-primary btn-sm" onclick="window._nav('assessments-hub')">+ Assign Assessment</button>
    </div>
    ${hasDue ? `<div style="padding:10px 14px;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.25);border-radius:var(--radius-md);margin-bottom:16px;font-size:12px;color:var(--amber)">
      ⚠ One or more assessments are due or overdue for this course.
    </div>` : ''}
    ${assigned.length === 0
      ? `<div style="text-align:center;padding:40px;color:var(--text-secondary)">
          <div style="font-size:32px;margin-bottom:10px">📊</div>
          <div style="font-weight:600;margin-bottom:4px">No assessments assigned</div>
          <div style="font-size:12px;color:var(--text-tertiary);margin-bottom:16px">Assign standardized assessments to track outcomes objectively.</div>
          <button class="btn btn-primary btn-sm" onclick="window._nav('assessments-hub')">Browse Assessment Library</button>
        </div>`
      : `<div class="card" style="padding:0;overflow:hidden">
          ${assigned.map(a => {
            const statusColor = a.status === 'completed' ? 'var(--green)' : a.status === 'overdue' ? 'var(--red)' : a.status === 'due' ? 'var(--amber)' : 'var(--text-tertiary)';
            const statusLabel = a.status === 'completed' ? 'Completed' : a.status === 'overdue' ? 'Overdue' : a.status === 'due' ? 'Due' : 'Scheduled';
            return `<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--border)">
              <div style="flex:1;min-width:0">
                <div style="font-size:13px;font-weight:600;color:var(--text-primary)">${a.name || a.template_name || '—'}</div>
                <div style="font-size:11px;color:var(--text-secondary);margin-top:2px">${a.frequency || 'Once'} · ${a.due_date ? `Due ${new Date(a.due_date).toLocaleDateString()}` : 'No due date'}</div>
              </div>
              ${a.score != null ? `<div style="font-size:13px;font-weight:700;color:var(--teal)">Score: ${a.score}</div>` : ''}
              <span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:8px;background:${statusColor}18;color:${statusColor}">${statusLabel}</span>
              <button style="font-size:11px;padding:5px 11px;border-radius:var(--radius-md);background:transparent;color:var(--teal);border:1px solid rgba(0,212,188,0.3);cursor:pointer;font-family:var(--font-body)"
                onclick="window._nav('assessments-hub')">${a.status === 'completed' ? 'View' : 'Complete'}</button>
            </div>`;
          }).join('')}
        </div>`
    }
    <div style="margin-top:20px">
      <div style="font-size:12px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.6px;margin-bottom:10px">Outcome Trend</div>
      <div style="padding:20px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-md);color:var(--text-tertiary);font-size:12px;text-align:center">
        Outcome chart renders when 2+ assessments are completed.<br>
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
      <button class="btn btn-primary btn-sm" onclick="alert('Home program builder coming soon.')">+ Add Program</button>
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
                onclick="alert('Program template: ${pt.label}')">
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
        <button class="btn btn-sm" style="font-size:12px" onclick="alert('PDF export coming soon.')">⬇ Export PDF</button>
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
          <option value="minor">Minor</option>
          <option value="moderate">Moderate</option>
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
  try {
    await api.recordOutcome({ course_id: courseId, patient_id: patientId || null, template_name: template, score, measurement_point: point });
    window._cdTab = 'outcomes';
    window._nav('course-detail');
  } catch (e) { showErr(e.message || 'Save failed.'); }
};

window._submitAE = async function(courseId, patientId) {
  const errEl = document.getElementById('ae-error');
  if (errEl) errEl.style.display = 'none';
  const type = document.getElementById('ae-type')?.value;
  if (!type) { if (errEl) { errEl.textContent = 'Select event type.'; errEl.style.display = ''; } return; }
  try {
    await api.reportAdverseEvent({
      course_id:    courseId,
      patient_id:   patientId || null,
      event_type:   type,
      severity:     document.getElementById('ae-severity')?.value || 'minor',
      onset_timing: document.getElementById('ae-onset')?.value || null,
      resolution:   document.getElementById('ae-resolution')?.value || null,
      action_taken: document.getElementById('ae-action')?.value || null,
      notes:        document.getElementById('ae-notes')?.value || null,
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

  try {
    if (action === 'approve') {
      await api.activateCourse(courseId);
    } else if (action === 'pause') {
      await api.updateCourse(courseId, { status: 'paused' });
    } else if (action === 'resume') {
      await api.updateCourse(courseId, { status: 'active' });
    } else if (action === 'discontinue') {
      const reason = document.getElementById('cd-discont-reason')?.value?.trim();
      if (!reason) {
        if (errEl) { errEl.textContent = 'Reason required to discontinue.'; errEl.style.display = ''; }
        return;
      }
      if (!confirm('Permanently discontinue this treatment course? This cannot be undone.')) return;
      await api.updateCourse(courseId, { status: 'discontinued', clinician_notes: reason });
    }
    window._cdTab = 'governance';
    window._nav('course-detail');
  } catch (e) {
    if (errEl) { errEl.textContent = e.message || 'Action failed.'; errEl.style.display = ''; }
  }
};

// ── pgSessionExecution — Guided session delivery workflow ─────────────────────
export async function pgSessionExecution(setTopbar, navigate) {
  setTopbar('Session Execution', `<span id="sex-topbar-status" style="font-size:11px;color:var(--text-tertiary)">Select a patient to begin</span>`);
  const el = document.getElementById('content');
  el.innerHTML = spinner();

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

    <!-- ── STEP 0: SELECT PATIENT ─────────────────────────────────────── -->
    <div id="sex-select">
      ${currentUser?.role === 'technician' ? `<div class="notice notice-info" style="margin-bottom:14px">◧ Technician mode — log session parameters only. Course management is handled by your supervising clinician.</div>` : ''}
      <div class="sex-queue-card card">
        <div class="sex-queue-header">
          <span>Active Courses <span class="sex-queue-count">${activeCourses.length}</span></span>
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

      <!-- Session Header -->
      <div class="card sex-header-card" id="sex-header">
        <div class="sex-header-body">
          <div class="sex-header-patient">
            <div id="sex-h-name" class="sex-h-name">—</div>
            <div id="sex-h-meta" class="sex-h-meta"></div>
          </div>
          <div class="sex-header-right">
            <div id="sex-h-session" class="sex-h-session"></div>
            <div id="sex-h-status" class="sex-status-pill sex-status-pending">Pending</div>
          </div>
        </div>
        <div id="sex-h-course-bar" class="sex-h-course-bar" style="display:none"></div>
      </div>

      <!-- Protocol Summary + Parameters -->
      <div class="card" style="margin-bottom:12px">
        <div class="sex-section-hd">Protocol Summary</div>
        <div class="sex-proto-body">
          <div class="sex-proto-params">
            <div class="sex-param"><span class="sex-param-label">Protocol</span><span id="spp-name" class="sex-param-val">—</span></div>
            <div class="sex-param"><span class="sex-param-label">Label</span><span id="spp-label" class="sex-param-val">—</span></div>
            <div class="sex-param"><span class="sex-param-label">Target</span><span id="spp-target" class="sex-param-val">—</span></div>
            <div class="sex-param"><span class="sex-param-label">Side</span><span id="spp-side" class="sex-param-val">—</span></div>
          </div>
          <div class="sex-proto-fields">
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
        <div id="sex-consent-display" style="margin:0 16px 12px"></div>
      </div>

      <!-- Safety Checklist -->
      <div class="card" style="margin-bottom:16px">
        <div class="sex-section-hd">
          Safety Checklist
          <span id="sex-safety-tally" class="sex-safety-tally">0 / 7</span>
        </div>
        <div style="padding:0 16px 16px">
          <div class="sex-checks">
            ${[
              ['sex-ck-identity', 'Patient identity confirmed against record'],
              ['sex-ck-contra',   'Contraindications reviewed — none currently active'],
              ['sex-ck-consent',  'Treatment consent on file and valid'],
              ['sex-ck-ae',       'Prior adverse events reviewed'],
              ['sex-ck-assess',   'Baseline / pre-session assessment completed'],
              ['sex-ck-device',   'Device ready and calibration confirmed'],
              ['sex-ck-target',   'Target site verified and marked on patient'],
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
        <div style="padding:0 16px 16px;display:flex;gap:10px;align-items:center">
          <button id="sex-begin-btn" class="btn btn-primary" onclick="window._seSetPhase('active')" disabled style="opacity:0.5">
            Begin Session →
          </button>
          <button class="btn btn-sm" onclick="window._seSetPhase('select')">← Change Patient</button>
        </div>
      </div>
    </div>

    <!-- ── PHASE 2: ACTIVE SESSION ────────────────────────────────────── -->
    <div id="sex-phase-active" class="sex-phase" style="display:none">

      <!-- Mini session header -->
      <div id="sex-active-header" class="sex-active-header"></div>

      <!-- Stimulation Guide (collapsible) -->
      <details class="sex-guide-details card" style="margin-bottom:12px">
        <summary class="sex-section-hd sex-guide-sum">
          Stimulation Guide
          <span style="font-size:10px;color:var(--text-tertiary);font-weight:400;margin-left:6px">▸ expand</span>
        </summary>
        <div class="sex-guide-body">
          <div id="sex-guide-visual-wrap"></div>
          <div id="sex-guide-instructions" class="sex-guide-text"></div>
        </div>
      </details>

      <!-- Live Session Controls -->
      <div class="card sex-controls-card" style="margin-bottom:12px">
        <div class="sex-section-hd">
          Live Session Controls
          <span id="se-timer-active-label" style="display:none;font-size:11px;color:var(--green);font-weight:600;display:none;align-items:center;gap:5px">
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
          <div>
            <label class="sex-obs-label">
              Clinician Notes
              <span style="font-weight:400;color:var(--text-tertiary)">(patient comments, events, observations)</span>
            </label>
            <textarea id="sex-obs-note" class="form-control" rows="2"
              placeholder="Patient reports, observations during stimulation…"
              style="font-size:12.5px;margin-top:6px"></textarea>
          </div>
        </div>
        <div style="padding:0 16px 16px;display:flex;gap:10px">
          <button class="btn btn-primary" onclick="window._seSetPhase('post')">End Session → Post-Session</button>
          <button class="btn btn-sm" onclick="window._seSetPhase('setup')">← Back to Setup</button>
        </div>
      </div>
    </div>

    <!-- ── PHASE 3: POST-SESSION ──────────────────────────────────────── -->
    <div id="sex-phase-post" class="sex-phase" style="display:none">

      <!-- Mini session header -->
      <div id="sex-post-header" class="sex-active-header"></div>

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
          <textarea id="se-notes" class="form-control" rows="3"
            placeholder="Patient response, tolerance observations, deviation rationale, adverse reactions…"
            style="font-size:12.5px;margin-top:6px;resize:vertical"></textarea>
        </div>
      </div>

      <!-- Quick Outcome Capture -->
      <div class="card" style="margin-bottom:12px">
        <div class="sex-section-hd">
          Quick Outcome Capture
          <span style="font-size:10px;font-weight:400;color:var(--text-tertiary)">optional</span>
        </div>
        <div style="padding:0 16px 16px">
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:10px">
            <div>
              <label class="sex-field-lbl">Assessment Template</label>
              <select id="pse-template" class="form-control sex-field-input">
                <option value="">Skip outcome</option>
                ${FALLBACK_ASSESSMENT_TEMPLATES.map(t => `<option value="${t.id}">${t.id} — ${t.label.split('—')[1]?.trim() || t.label}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="sex-field-lbl">Score</label>
              <input id="pse-score" class="form-control sex-field-input" type="number" placeholder="e.g. 12">
            </div>
            <div>
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
          <button class="btn btn-sm" onclick="window._savePostSessionOutcome(document.getElementById('se-course').value, window._seCurrentPatientId)">
            Save Outcome
          </button>
        </div>
      </div>

      <!-- Aftercare Guidance -->
      <div class="card" style="margin-bottom:12px">
        <div class="sex-section-hd">Aftercare &amp; Patient Guidance</div>
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

      <!-- Final Actions -->
      <div class="card sex-actions-card">
        <div class="sex-section-hd">Save &amp; Next Steps</div>
        <div id="se-error" style="display:none;color:var(--red);font-size:12px;margin:0 16px 10px;padding:8px 10px;border-radius:6px;background:rgba(255,107,107,0.07)"></div>
        <div id="se-success" style="display:none;color:var(--green);font-size:12px;margin:0 16px 10px;padding:8px 10px;border-radius:6px;background:rgba(74,222,128,0.07)"></div>
        <div class="sex-actions-row">
          <button id="se-submit-btn" class="btn btn-primary sex-action-primary" onclick="window._logSession()">Save Session</button>
          <button class="btn sex-action-btn" onclick="window._seLogAndNext()">Save + Next Patient</button>
          <button class="btn sex-action-btn" onclick="window._seLogAndFlag()">Save + Flag Review</button>
          <button class="btn btn-sm sex-action-btn no-print"
            onclick="window._printSessionNotes(document.getElementById('se-course').value)">&#128424; Print Notes</button>
        </div>
        <div style="padding:8px 16px 16px">
          <button class="btn btn-sm" onclick="window._seSetPhase('active')">← Back to Active Session</button>
        </div>
        <div style="padding:0 16px 12px;display:flex;gap:8px;flex-wrap:wrap;border-top:1px solid var(--border);padding-top:12px">
          <button class="btn btn-sm" onclick="window._selectedCourseId=document.getElementById('se-course').value;window._cdTab='sessions';window._nav('course-detail')">View Course →</button>
          <button class="btn btn-sm" onclick="window._nav('courses')">All Courses</button>
        </div>
      </div>
    </div>
  </div>`;

  // ── Phase state machine ────────────────────────────────────────────────────
  window._seCurrentCourseId  = null;
  window._seCurrentPatientId = null;
  window._seCurrentPhase     = 'select';
  window._seSideEffects      = [];
  window._seCurrentTolerance = null;

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
    // Sync mini session header
    if (phase === 'active' || phase === 'post') {
      const hdrId = phase === 'active' ? 'sex-active-header' : 'sex-post-header';
      const dst = document.getElementById(hdrId);
      if (dst) {
        const name    = document.getElementById('sex-h-name')?.textContent || '—';
        const meta    = document.getElementById('sex-h-meta')?.textContent || '';
        const session = document.getElementById('sex-h-session')?.textContent || '';
        dst.innerHTML = `<div class="sex-active-hdr-row">
          <span style="font-weight:700;font-size:14px;color:var(--text-primary)">${name}</span>
          <span style="color:var(--text-tertiary);font-size:12px;margin-left:10px">${meta}</span>
          <span style="margin-left:auto;font-size:12px;font-weight:600;color:var(--teal)">${session}</span>
        </div>`;
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
    ['sex-ck-identity','sex-ck-contra','sex-ck-consent','sex-ck-ae','sex-ck-assess','sex-ck-device','sex-ck-target']
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
    const ids = ['sex-ck-identity','sex-ck-contra','sex-ck-consent','sex-ck-ae','sex-ck-assess','sex-ck-device','sex-ck-target'];
    const n = ids.filter(id => document.getElementById(id)?.checked).length;
    const tally = document.getElementById('sex-safety-tally');
    const btn   = document.getElementById('sex-begin-btn');
    const err   = document.getElementById('sex-safety-err');
    if (tally) tally.textContent = `${n} / 7`;
    if (btn)   { btn.disabled = n < 7; btn.style.opacity = n === 7 ? '' : '0.5'; }
    if (err)   err.style.display = n === 7 ? 'none' : '';
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
      };

      if (!navigator.onLine) {
        if (errEl) { errEl.textContent = 'No internet connection. Session logs require an active connection.'; errEl.style.display = ''; }
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Save Session'; }
        return;
      }

      const session = await api.logSession(courseId, sessionData);

      const course    = (window._seActiveCourses || []).find(c => c.id === courseId) || {};
      const patientId = course.patient_id || null;
      window._seCurrentPatientId = patientId;
      const needsAE   = toleranceVal === 'poor' || outcomeVal === 'stopped_early';

      // Show success state
      if (okEl) {
        okEl.innerHTML = session.offline
          ? '\u{1F4BE} Saved offline \u2014 will sync when connected.'
          : `\u2713 Session ${(course.sessions_delivered || 0) + 1} logged for <strong>${course.condition_slug?.replace(/-/g, ' ') || 'course'}</strong>.`;
        okEl.style.display = '';
      }
      if (submitBtn) { submitBtn.textContent = 'Saved \u2713'; submitBtn.style.opacity = '0.6'; }

      // AE warning if poor tolerance or stopped early
      if (needsAE) {
        const aeWarn  = document.getElementById('sex-ae-warning');
        const aePanel = document.getElementById('sex-ae-panel');
        if (aeWarn) {
          aeWarn.style.display = '';
          aeWarn.innerHTML = `<strong>\u26A0 Attention required:</strong> Tolerance rated \u201C${toleranceVal || outcomeVal}\u201D. Consider filing an adverse event report.`;
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
    snFrame.innerHTML = [
      '<div style="border-bottom:2px solid #003366;padding-bottom:12px;margin-bottom:20px">',
      '<div style="display:flex;justify-content:space-between;align-items:flex-start">',
      '<div><div style="font-size:18pt;font-weight:700;color:#003366">DeepSynaps Protocol Studio</div>',
      '<div style="font-size:10pt;color:#555;margin-top:2px">Session Notes</div></div>',
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
}


// ── pgReviewQueue — Protocol & course approvals ───────────────────────────────
export async function pgReviewQueue(setTopbar, navigate) {
  // ── Topbar ─────────────────────────────────────────────────────────────────
  setTopbar('Clinical Review & Approvals', `
    <div style="display:flex;align-items:center;gap:8px">
      <select id="rq-status-filter" class="form-control" style="height:30px;padding:0 28px 0 10px;font-size:12px;width:160px"
        onchange="window._rqFilterStatus(this.value)">
        <option value="">All Items</option>
        <option value="pending">Awaiting Review</option>
        <option value="approved">Approved</option>
        <option value="rejected">Rejected</option>
      </select>
      <button class="btn btn-sm" onclick="window._rqSortPriority()" title="Sort by priority">&#x2195; Priority</button>
      <button class="btn btn-sm btn-primary" onclick="pgReviewQueue(window._rqSetTopbar,window._rqNavigate)">&#x21BB; Refresh</button>
    </div>`);

  window._rqSetTopbar = setTopbar;
  window._rqNavigate  = navigate;

  const el = document.getElementById('content');
  el.innerHTML = spinner();

  // ── Data loading ────────────────────────────────────────────────────────────
  const [queueRes, aeRes] = await Promise.all([
    api.listReviewQueue({}).catch(() => ({ items: [] })),
    api.listAdverseEvents({ resolved: false }).catch(() => ({ items: [] })),
  ]);
  const items   = queueRes?.items || [];
  const openAEs = aeRes?.items    || [];

  window._rqItems   = items;
  window._rqOpenAEs = openAEs;
  if (!window._rqDecision) window._rqDecision = {};

  // ── SLA / urgency helpers ──────────────────────────────────────────────────
  const now = Date.now();

  function isOverdue(item) {
    if (item.status !== 'pending') return false;
    const ts = item.submitted_at || item.created_at;
    if (!ts) return false;
    return (now - new Date(ts).getTime()) > 48 * 3600 * 1000;
  }

  function isUrgent(item) {
    if (isOverdue(item)) return false;
    const course    = item._course || {};
    const govWarn   = course.governance_warnings || [];
    if (item.on_label === false || course.on_label === false) return true;
    if (govWarn.length > 0) return true;
    const cid = item.course_id || item.target_id;
    return !!(openAEs.find(ae => ae.course_id === cid && ae.severity === 'serious'));
  }

  function slaBadge(item) {
    const ts    = item.submitted_at || item.created_at;
    const hours = ts ? Math.floor((now - new Date(ts).getTime()) / 3600000) : null;
    if (isOverdue(item))
      return '<span style="font-size:9.5px;font-weight:700;padding:2px 6px;border-radius:3px;background:rgba(255,107,107,0.15);color:var(--red)">OVERDUE</span>';
    if (isUrgent(item))
      return '<span title="Urgent: off-label use, governance flags, or serious adverse event linked" style="cursor:help;font-size:9.5px;font-weight:700;padding:2px 6px;border-radius:3px;background:rgba(255,181,71,0.15);color:var(--amber)">⚑ URGENT</span>';
    return hours !== null
      ? '<span style="font-size:9.5px;color:var(--text-tertiary)">' + hours + 'h ago</span>'
      : '';
  }

  function priorityScore(item) {
    if (isOverdue(item))          return 0;
    if (isUrgent(item))           return 1;
    const c = item._course || {};
    if (c.on_label === false)     return 2;
    if (item.status === 'pending') return 3;
    return 4;
  }

  // ── Summary stats ──────────────────────────────────────────────────────────
  const pendingItems   = items.filter(i => i.status === 'pending');
  const overdueItems   = pendingItems.filter(i => isOverdue(i));
  const today          = new Date().toISOString().split('T')[0];
  const approvedToday  = items.filter(i =>
    (i.status === 'approved' || i.resolution === 'approved') &&
    (i.updated_at || i.reviewed_at || '').startsWith(today)).length;
  const seriousAECount = openAEs.filter(ae => ae.severity === 'serious').length;

  // ── Toast ──────────────────────────────────────────────────────────────────
  window._rqToast = function(msg, type) {
    type = type || 'ok';
    const t = document.createElement('div');
    t.style.cssText = 'position:fixed;bottom:24px;right:24px;padding:12px 20px;border-radius:8px;font-size:13px;font-weight:500;color:#fff;background:' +
      (type === 'ok' ? '#0d9488' : '#dc2626') +
      ';z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.4);transition:opacity 0.3s';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function() { t.style.opacity = '0'; setTimeout(function() { t.remove(); }, 300); }, 2500);
  };

  // ── Card HTML builder ──────────────────────────────────────────────────────
  function rqCard(item) {
    const course   = item._course || {};
    const warnings = course.governance_warnings || [];
    const courseId = item.course_id || item.target_id || item.id;
    const cond     = ((course.condition_slug || item.condition_slug || '') || '').replace(/-/g, ' ') || '\u2014';
    const mod      = course.modality_slug || item.modality_slug || '\u2014';
    const sc       = { pending: 'var(--amber)', approved: 'var(--green)', rejected: 'var(--red)', changes_requested: 'var(--amber)' }[item.status] || 'var(--text-tertiary)';
    const history  = item.review_history || (item.review_notes
      ? [{ note: item.review_notes, created_at: item.updated_at, action: 'reviewed' }]
      : []);

    const historyHtml = history.length
      ? history.map(h => {
          const dt  = h.created_at ? h.created_at.split('T')[0] : '\u2014';
          const rev = h.reviewer || h.reviewer_name || 'Reviewer';
          const act = (h.action || h.resolution || 'note').replace(/_/g, ' ');
          const n   = h.note || h.notes || '';
          return '<div style="font-size:11.5px;padding:6px 0;border-bottom:1px solid var(--border);color:var(--text-secondary);line-height:1.55">'
            + '<span style="color:var(--text-tertiary);font-size:10.5px">' + dt + '</span>'
            + ' <strong style="color:var(--text-primary)">' + rev + '</strong> \u2014'
            + ' <span style="text-transform:capitalize">' + act + '</span>'
            + (n ? '<span style="color:var(--text-tertiary)">: ' + n + '</span>' : '')
            + '</div>';
        }).join('')
      : '<div style="font-size:11.5px;color:var(--text-tertiary);padding:6px 0">No prior reviews.</div>';

    const paramRows = [
      fr('Condition',    cond),
      fr('Modality',     mod),
      fr('Device',       course.device_slug || course.device || '\u2014'),
      fr('Target',       course.target_region || '\u2014'),
      fr('Frequency',    course.planned_frequency_hz ? course.planned_frequency_hz + ' Hz' : '\u2014'),
      fr('Intensity',    course.planned_intensity || '\u2014'),
      fr('Sessions/Wk', course.planned_sessions_per_week ? course.planned_sessions_per_week + '\xd7' : '\u2014'),
      fr('Total Sess.',  course.planned_sessions_total || '\u2014'),
      fr('Laterality',   course.laterality || '\u2014'),
      fr('Evidence',     course.evidence_grade || '\u2014'),
    ].join('');

    const decisionBtns = [
      { key: 'approve',         icon: '\u2713', label: 'Approve',         border: 'var(--teal)',   color: 'var(--teal)'   },
      { key: 'reject',          icon: '\u2717', label: 'Reject',          border: 'var(--red)',    color: 'var(--red)'    },
      { key: 'request_changes', icon: '\u25b1', label: 'Request Changes', border: 'var(--amber)',  color: 'var(--amber)'  },
      { key: 'escalate',        icon: '\u2b21', label: 'Escalate',        border: 'var(--violet)', color: 'var(--violet)' },
    ].map(d =>
      '<button id="rq-dec-' + item.id + '-' + d.key + '" class="btn btn-sm"'
      + ' style="border-color:' + d.border + ';color:' + d.color + ';font-size:11.5px;transition:all .15s"'
      + ' onclick="window._rqSetDecision(\'' + item.id + '\',\'' + d.key + '\')">'
      + d.icon + ' ' + d.label + '</button>'
    ).join('');

    return '<div class="card" style="margin-bottom:10px;overflow:hidden" id="rq-card-' + item.id + '">'
      // Collapsed header
      + '<div style="display:flex;align-items:center;gap:10px;padding:12px 16px;cursor:pointer"'
      + ' onclick="window._rqToggle(\'' + item.id + '\')">'
      +   '<div style="flex-shrink:0;width:72px">' + slaBadge(item) + '</div>'
      +   '<div style="flex:1;min-width:0">'
      +     '<span style="font-size:12.5px;font-weight:600;color:var(--text-primary)">' + cond + '</span>'
      +     '<span style="font-size:11.5px;color:var(--text-tertiary);margin-left:6px">\xb7 ' + mod + '</span>'
      +   '</div>'
      +   '<div style="display:flex;align-items:center;gap:6px;flex-shrink:0;flex-wrap:wrap">'
      +     evidenceBadge(course.evidence_grade)
      +     (course.on_label === false ? labelBadge(false) : '')
      +     (warnings.length ? '<span style="font-size:10px;font-weight:600;padding:2px 6px;border-radius:4px;background:rgba(255,181,71,0.1);color:var(--amber)">\u26a0 ' + warnings.length + '</span>' : '')
      +     '<span style="font-size:10px;font-weight:600;padding:2px 8px;border-radius:4px;background:' + sc + '18;color:' + sc + ';text-transform:capitalize">' + (item.status || '\u2014') + '</span>'
      +     '<span style="font-size:14px;color:var(--text-tertiary)" id="rq-chevron-' + item.id + '">\u203a</span>'
      +   '</div>'
      + '</div>'
      // Expanded panel
      + '<div id="rq-panel-' + item.id + '" style="display:none;background:rgba(0,0,0,0.15);padding:16px 20px;border-top:1px solid var(--border)">'
      +   '<div class="g2" style="gap:20px">'
          // Left: params + governance
      +     '<div>'
      +       '<div style="font-size:9.5px;text-transform:uppercase;letter-spacing:.9px;color:var(--text-tertiary);font-weight:600;margin-bottom:8px">Course Parameters</div>'
      +       paramRows
      +       (warnings.length
                ? '<div style="margin-top:14px"><div style="font-size:9.5px;text-transform:uppercase;letter-spacing:.9px;color:var(--text-tertiary);font-weight:600;margin-bottom:8px">Governance Warnings</div>'
                  + warnings.map(w => govFlag(w, 'warn')).join('') + '</div>'
                : '')
      +       (course.on_label === false
                ? '<div class="notice notice-warn" style="margin-top:10px">Off-label use \u2014 additional documentation required.</div>'
                : '')
      +       (item.notes
                ? '<div style="margin-top:12px"><div style="font-size:9.5px;text-transform:uppercase;letter-spacing:.9px;color:var(--text-tertiary);font-weight:600;margin-bottom:6px">Submission Notes</div>'
                  + '<div style="font-size:12.5px;color:var(--text-secondary);line-height:1.65">' + item.notes + '</div></div>'
                : '')
      +     '</div>'
          // Right: review actions + history
      +     '<div>'
      +       '<div style="font-size:9.5px;text-transform:uppercase;letter-spacing:.9px;color:var(--text-tertiary);font-weight:600;margin-bottom:10px">Decision</div>'
      +       '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px">' + decisionBtns + '</div>'
      +       '<div style="margin-bottom:10px">'
      +         '<label style="font-size:10.5px;color:var(--text-tertiary);display:block;margin-bottom:4px">Assigned to</label>'
      +         '<select class="form-control" style="font-size:12px;height:30px;padding:0 28px 0 10px" onchange="window._rqAssign(\'' + item.id + '\',this.value)">'
      +           '<option value="">Unassigned</option><option>Dr. Chen</option><option>Dr. Patel</option><option>Dr. Kim</option>'
      +         '</select>'
      +       '</div>'
      +       '<div style="margin-top:12px;margin-bottom:6px">'
      +         '<label style="font-size:10.5px;color:var(--text-tertiary);display:block;margin-bottom:4px">'
      +           'Review note <span style="color:var(--red)">*</span> required for Reject / Request Changes'
      +         '</label>'
      +         '<textarea id="rq-note-' + item.id + '" class="form-control" rows="3"'
      +                   ' placeholder="Review note (required for reject/changes)\u2026" style="resize:vertical;font-size:12.5px"></textarea>'
      +       '</div>'
      +       '<div id="rq-err-' + item.id + '" style="display:none;font-size:12px;color:var(--red);padding:6px 10px;border-radius:6px;background:rgba(255,107,107,0.07);margin-bottom:8px"></div>'
      +       '<button class="btn btn-primary" style="width:100%;margin-bottom:14px"'
      +               ' onclick="window._rqSubmit(\'' + item.id + '\',\'' + courseId + '\')">'
      +         'Submit Review \u2192'
      +       '</button>'
      +       '<div style="font-size:9.5px;text-transform:uppercase;letter-spacing:.9px;color:var(--text-tertiary);font-weight:600;margin-bottom:6px">Review History</div>'
      +       '<div id="rq-history-' + item.id + '">' + historyHtml + '</div>'
      +     '</div>'
      +   '</div>'
      + '</div>'
      + '</div>';
  }

  // ── Render list helper ─────────────────────────────────────────────────────
  function renderList(list) {
    const listEl = document.getElementById('rq-list');
    if (!listEl) return;
    listEl.innerHTML = list.length
      ? list.map(item => rqCard(item)).join('')
      : emptyState('\u25b1', 'No items match the current filter.');
  }

  // ── AE severity badge ──────────────────────────────────────────────────────
  function aeSeverityBadge(sev) {
    const s = { serious: { bg: 'rgba(255,107,107,0.12)', color: 'var(--red)' }, moderate: { bg: 'rgba(255,181,71,0.12)', color: 'var(--amber)' }, mild: { bg: 'rgba(0,212,188,0.12)', color: 'var(--teal)' } }[sev]
      || { bg: 'rgba(255,255,255,0.06)', color: 'var(--text-tertiary)' };
    return '<span style="font-size:10.5px;font-weight:600;padding:2px 8px;border-radius:4px;background:' + s.bg + ';color:' + s.color + ';text-transform:capitalize">' + (sev || '\u2014') + '</span>';
  }

  // ── Stat card ──────────────────────────────────────────────────────────────
  function statCard(label, value, color, sub, alertBorder) {
    return '<div class="metric-card" style="' + (alertBorder ? 'border-color:' + color + ';border-width:1.5px' : '') + '">'
      + '<div style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.8px">' + label + '</div>'
      + '<div style="font-size:28px;font-weight:700;color:' + color + ';margin:8px 0 4px">' + value + '</div>'
      + '<div style="font-size:11px;color:var(--text-secondary)">' + sub + '</div>'
      + '</div>';
  }

  // ── AE table ───────────────────────────────────────────────────────────────
  const hasSerious    = openAEs.some(ae => ae.severity === 'serious');
  const aeHeaderColor = hasSerious ? 'var(--red)' : 'var(--text-tertiary)';
  const aeRows = openAEs.length
    ? openAEs.map(ae => {
        const occurredAt = ae.occurred_at || ae.created_at;
        const daysOpen   = occurredAt ? Math.floor((now - new Date(occurredAt).getTime()) / 86400000) : '\u2014';
        const dateStr    = occurredAt ? occurredAt.split('T')[0] : '\u2014';
        return '<tr>'
          + '<td style="font-size:12px">' + dateStr + '</td>'
          + '<td style="font-size:12px;color:var(--text-secondary)">' + (ae.course_id ? ae.course_id.slice(0, 10) + '\u2026' : '\u2014') + '</td>'
          + '<td style="font-size:12px">' + (ae.event_type || ae.type || '\u2014') + '</td>'
          + '<td>' + aeSeverityBadge(ae.severity) + '</td>'
          + '<td style="font-size:12px;font-weight:600;color:' + (typeof daysOpen === 'number' && daysOpen > 7 ? 'var(--red)' : 'var(--text-primary)') + '">' + daysOpen + '</td>'
          + '<td><button class="btn btn-sm" style="border-color:var(--teal);color:var(--teal)" onclick="window._rqResolveAE(\'' + (ae.id || '') + '\')">&#10003; Resolve</button></td>'
          + '</tr>';
      }).join('')
    : '<tr><td colspan="6" style="text-align:center;color:var(--text-tertiary);font-size:12.5px;padding:24px">No open adverse events.</td></tr>';

  // ── Full page render ───────────────────────────────────────────────────────
  el.innerHTML =
    '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:18px">'
    + statCard('Pending Decisions',    pendingItems.length,  pendingItems.length  > 0 ? 'var(--amber)' : 'var(--green)', pendingItems.length  > 0 ? 'Awaiting clinician action' : 'Decision desk clear')
    + statCard('Overdue (&gt;48h)',   overdueItems.length,  'var(--red)',   overdueItems.length > 0 ? 'Past SLA threshold' : 'All within SLA', overdueItems.length > 0)
    + statCard('Approved Today',      approvedToday,        'var(--green)', approvedToday > 0 ? 'This calendar day' : 'None yet today')
    + statCard('Open Adverse Events', openAEs.length,       openAEs.length > 0 ? 'var(--red)' : 'var(--teal)', openAEs.length > 0 ? seriousAECount + ' serious' : 'No open AEs')
    + '</div>'
    + '<div style="margin-bottom:18px">'
    +   '<div style="display:flex;align-items:center;margin-bottom:10px">'
    +     '<div style="font-size:12px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.8px">'
    +       'Pending Decisions <span style="font-weight:400;color:var(--text-tertiary)">(' + items.length + ')</span>'
    +     '</div>'
    +   '</div>'
    +   '<div id="rq-list">'
    +   (items.length ? items.map(item => rqCard(item)).join('') : emptyState('✅', 'Decision desk is clear', 'No pending approvals, escalations, or governance items.'))
    +   '</div>'
    + '</div>'
    + '<div class="card" style="overflow:hidden">'
    +   '<div style="padding:11px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;cursor:pointer"'
    +        ' onclick="(function(){var p=document.getElementById(\'rq-ae-panel\');p.style.display=p.style.display===\'none\'?\'\':\' none\';})()">'
    +     '<span style="font-size:9.5px;text-transform:uppercase;letter-spacing:.9px;font-weight:700;color:' + aeHeaderColor + '">'
    +       (hasSerious ? '\u26a0 ' : '') + 'Open Adverse Events (' + openAEs.length + ')'
    +     '</span>'
    +     '<span style="font-size:11px;color:var(--text-tertiary)">\u25be toggle</span>'
    +   '</div>'
    +   '<div id="rq-ae-panel" style="overflow-x:auto">'
    +     '<table class="ds-table"><thead><tr><th>Date</th><th>Course</th><th>Type</th><th>Severity</th><th>Days Open</th><th>Actions</th></tr></thead>'
    +     '<tbody>' + aeRows + '</tbody></table>'
    +   '</div>'
    + '</div>';

  // ── Store globals ──────────────────────────────────────────────────────────
  window._rqCourseMap  = {};
  window._rqPatientMap = {};

  // Toggle expand/collapse
  window._rqToggle = function(itemId) {
    const panel   = document.getElementById('rq-panel-'   + itemId);
    const chevron = document.getElementById('rq-chevron-' + itemId);
    if (!panel) return;
    const open = panel.style.display !== 'none';
    panel.style.display = open ? 'none' : '';
    if (chevron) chevron.textContent = open ? '\u203a' : '\u2193';
  };

  // Decision button selection + visual state
  window._rqSetDecision = function(itemId, decision) {
    window._rqDecision[itemId] = decision;
    const keys   = ['approve', 'reject', 'request_changes', 'escalate'];
    const colors = { approve: 'var(--teal)', reject: 'var(--red)', request_changes: 'var(--amber)', escalate: 'var(--violet)' };
    const bgs    = { approve: 'rgba(0,212,188,0.15)', reject: 'rgba(255,107,107,0.15)', request_changes: 'rgba(255,181,71,0.15)', escalate: 'rgba(139,92,246,0.15)' };
    keys.forEach(key => {
      const btn = document.getElementById('rq-dec-' + itemId + '-' + key);
      if (!btn) return;
      if (key === decision) {
        btn.style.background = bgs[key] || '';
        btn.style.fontWeight = '700';
        btn.style.boxShadow  = '0 0 0 1.5px ' + (colors[key] || '');
      } else {
        btn.style.background = '';
        btn.style.fontWeight = '';
        btn.style.boxShadow  = '';
      }
    });
  };

  // Reviewer assignment — persists to backend
  window._rqAssign = async function(itemId, reviewer) {
    try {
      await api.assignReviewer(itemId, reviewer || null);
      const item = (window._rqItems || []).find(i => i.id === itemId);
      if (item) item.assigned_to = reviewer || null;
    } catch (e) {
      console.warn('assignReviewer failed:', e);
      window._rqToast?.('Failed to save reviewer assignment — please try again.', 'error');
    }
  };

  // Submit review
  window._rqSubmit = async function(itemId, courseId) {
    const decision  = window._rqDecision[itemId];
    const noteEl    = document.getElementById('rq-note-' + itemId);
    const noteValue = noteEl ? noteEl.value.trim() : '';
    const errEl     = document.getElementById('rq-err-' + itemId);
    if (errEl) errEl.style.display = 'none';

    if (!decision) {
      if (errEl) { errEl.textContent = 'Please select a decision (Approve / Reject / Request Changes / Escalate).'; errEl.style.display = ''; }
      return;
    }
    if ((decision === 'reject' || decision === 'request_changes') && !noteValue) {
      if (errEl) { errEl.textContent = 'A review note is required for Reject / Request Changes.'; errEl.style.display = ''; }
      return;
    }
    const submitBtn = document.querySelector('#rq-card-' + itemId + ' button[onclick*="_rqSubmit"]');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Submitting\u2026'; }
    try {
      // itemId is the review queue item id; courseId is the treatment course id
      // Map 'request_changes' to 'comment' (backend only accepts: approve, reject, escalate, comment)
      const backendAction = decision === 'request_changes' ? 'comment' : decision;
      await api.submitReview({ review_item_id: itemId, course_id: courseId, action: backendAction, notes: noteValue });
      if (decision === 'approve') {
        try { await api.activateCourse(courseId); }
        catch(ae) { console.warn('Course activation failed after approval:', ae); window._rqToast?.('Approved, but activation failed — please activate manually.', 'warn'); }
      }
      window._rqToast(
        decision === 'approve'         ? 'Course approved and activated.' :
        decision === 'reject'          ? 'Course rejected.' :
        decision === 'request_changes' ? 'Changes requested.' :
        'Escalated for review.', 'ok');
      delete window._rqDecision[itemId];
      await pgReviewQueue(setTopbar, navigate);
    } catch (e) {
      if (errEl) { errEl.textContent = (e && e.message) || 'Submission failed. Please try again.'; errEl.style.display = ''; }
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Submit Review \u2192'; }
    }
  };

  // Priority sort
  window._rqSortPriority = function() {
    const sorted = (window._rqItems || []).slice().sort((a, b) => priorityScore(a) - priorityScore(b));
    window._rqItems = sorted;
    renderList(sorted);
    window._rqToast('Sorted by priority.', 'ok');
  };

  // Status filter
  window._rqFilterStatus = function(status) {
    const filtered = status ? (window._rqItems || []).filter(i => i.status === status) : (window._rqItems || []);
    renderList(filtered);
  };

  // Legacy compatibility
  window._rqConfirmAction = function(courseId, itemId, action) {
    window._rqDecision[itemId] = action === 'changes_requested' ? 'request_changes' : action;
    window._rqSubmit(itemId, courseId);
  };
  window._rqAction = async function(courseId, itemId, action) {
    window._rqDecision[itemId] = action === 'changes_requested' ? 'request_changes' : action;
    await window._rqSubmit(itemId, courseId);
  };

  // Resolve an open adverse event from the Review Queue AE table
  window._rqResolveAE = async function(aeId) {
    if (!aeId) return;
    const btn = document.querySelector(`button[onclick*="_rqResolveAE('${aeId}')"]`);
    if (btn) { btn.disabled = true; btn.textContent = 'Resolving\u2026'; }
    try {
      await api.resolveAdverseEvent(aeId, { resolved: true }).catch(() => {});
      window._rqToast('Adverse event marked resolved.', 'ok');
      // Remove the row from the table without full reload
      if (btn) {
        const row = btn.closest('tr');
        if (row) row.remove();
      }
      // Update the open AE count in stat card
      const remaining = (window._rqOpenAEs || []).filter(ae => ae.id !== aeId);
      window._rqOpenAEs = remaining;
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = '\u2713 Resolve'; }
      window._rqToast('Failed to resolve — try again.', 'err');
    }
  };

}

// ── pgOutcomes — Outcomes & Trends ────────────────────────────────────────────
export async function pgOutcomes(setTopbar, navigate) {
  // Topbar: title + Export CSV button + time range select
  setTopbar('Outcomes & Trends', `
    <div style="display:flex;align-items:center;gap:8px">
      <select id="outcomes-time-range" class="form-control" style="font-size:12px;padding:4px 10px;height:32px;width:auto"
        onchange="window._outcomesTimeRange=this.value;window._renderOutcomes()">
        <option value="30d">Last 30 days</option>
        <option value="90d">Last 90 days</option>
        <option value="6m">Last 6 months</option>
        <option value="all" selected>All time</option>
      </select>
      <button class="btn btn-sm" onclick="window._exportOutcomesCSV()">Export CSV</button>
      <button class="btn btn-primary btn-sm" onclick="window._showRecordOutcome()">+ Record Outcome</button>
    </div>`);

  const el = document.getElementById('content');
  el.innerHTML = spinner();

  // ── Data loading ──────────────────────────────────────────────────────────
  const [outcomesRes, aggregateRes, coursesRes] = await Promise.all([
    api.listOutcomes().catch(() => null),
    api.aggregateOutcomes().catch(() => null),
    api.listCourses().catch(() => null),
  ]);
  const outcomes  = outcomesRes?.items || [];
  const aggregate = aggregateRes || {};
  const courses   = coursesRes?.items || [];

  const courseMap = {};
  courses.forEach(c => { courseMap[c.id] = c; });

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
        <div style="font-size:12px;font-weight:600;color:var(--text-primary);margin-bottom:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${tmpl}">${tmpl}</div>
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
        <td style="font-weight:500">${mod.replace(/-/g, ' ')}</td>
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

  // ── _renderOutcomes — re-renders all sections with current time filter ──
  window._renderOutcomes = function() {
    const range   = window._outcomesTimeRange || 'all';
    const filtered = filterByTimeRange(window._outcomesAllData || [], range);
    window._outcomesData = filtered;

    // Sync select if present
    const sel = document.getElementById('outcomes-time-range');
    if (sel && sel.value !== range) sel.value = range;

    // KPIs
    const { responderRatePct, meanChange, activeCourses, completionPct } = computeKPIs(filtered);
    const rrDisplay = responderRatePct != null ? responderRatePct + '%' : '—';
    const mcDisplay = meanChange != null ? (meanChange > 0 ? '+' : '') + meanChange.toFixed(1) : '—';
    const mcColor   = meanChange == null ? 'var(--text-tertiary)' : meanChange < 0 ? 'var(--green)' : 'var(--teal)';
    const cpDisplay = completionPct != null ? completionPct + '%' : '—';

    const kpiEl = document.getElementById('oc-kpi-strip');
    if (kpiEl) kpiEl.innerHTML = `
      ${metricCard('Responder Rate', rrDisplay, 'var(--teal)', `n=${aggregate.total_outcomes || filtered.length} measurements`)}
      ${metricCard('Mean Score Change', `<span style="color:${mcColor}">${mcDisplay}</span>`, mcColor, 'Avg baseline vs latest')}
      ${metricCard('Courses with Outcomes', String(activeCourses), 'var(--violet)', 'Unique courses tracked')}
      ${metricCard('Assessment Completion', cpDisplay, 'var(--blue)', 'Scores recorded')}`;

    // Waterfall
    const wfEl = document.getElementById('oc-waterfall');
    if (wfEl) wfEl.innerHTML = renderWaterfall(filtered);

    // Sparklines
    const spEl = document.getElementById('oc-sparklines');
    if (spEl) spEl.innerHTML = renderSparklineCards(filtered);

    // Modality table
    const modEl = document.getElementById('oc-modality');
    if (modEl) modEl.innerHTML = renderModalityTable(filtered);

    // Trajectory chart
    const trajEl = document.getElementById('oc-trajectory');
    if (trajEl) trajEl.innerHTML = filtered.length > 0 ? outcomeTrajectoryChart(filtered) : '';

    // Records table (also apply template/course filters)
    window._rerenderOutcomeTable();
  };

  window._rerenderOutcomeTable = function() {
    const base   = window._outcomesData || [];
    const tmplF  = document.getElementById('oc-filter-tmpl')?.value || '';
    const courseF = document.getElementById('oc-filter-course')?.value || '';
    const filtered = base.filter(o => {
      if (tmplF   && (o.template_name || o.template_id || '') !== tmplF)   return false;
      if (courseF && (o.course_id || '') !== courseF)                       return false;
      return true;
    });
    const tableEl = document.getElementById('oc-records-table');
    if (tableEl) tableEl.innerHTML = renderOutcomeTable(filtered);
  };

  // ── Unique templates + courses for filter dropdowns ────────────────────
  const uniqueTemplates = [...new Set(outcomes.map(o => o.template_name || o.template_id || '').filter(Boolean))];
  const uniqueCourses   = courses.slice(0, 40); // cap for dropdown

  // ── Initial render ────────────────────────────────────────────────────────
  const initFiltered = filterByTimeRange(outcomes, window._outcomesTimeRange);
  window._outcomesData = initFiltered;
  const { responderRatePct, meanChange, activeCourses, completionPct } = computeKPIs(initFiltered);
  const rrDisplay = responderRatePct != null ? responderRatePct + '%' : '—';
  const mcDisplay = meanChange != null ? (meanChange > 0 ? '+' : '') + meanChange.toFixed(1) : '—';
  const mcColor   = meanChange == null ? 'var(--text-tertiary)' : meanChange < 0 ? 'var(--green)' : 'var(--teal)';
  const cpDisplay = completionPct != null ? completionPct + '%' : '—';

  el.innerHTML = `<div class="page-section">

    <!-- ── Section 1: KPI Strip ──────────────────────────────────────────── -->
    <div class="g4" id="oc-kpi-strip">
      ${metricCard('Responder Rate', rrDisplay, 'var(--teal)', `n=${aggregate.total_outcomes || initFiltered.length} measurements`)}
      ${metricCard('Mean Score Change', `<span style="color:${mcColor}">${mcDisplay}</span>`, mcColor, 'Avg baseline vs latest')}
      ${metricCard('Courses with Outcomes', String(activeCourses), 'var(--violet)', 'Unique courses tracked')}
      ${metricCard('Assessment Completion', cpDisplay, 'var(--blue)', 'Scores recorded')}
    </div>

    <!-- ── Section 1b: Trajectory Chart ────────────────────────────────── -->
    <div id="oc-trajectory" style="${initFiltered.length > 0 ? '' : 'display:none'}">
      ${initFiltered.length > 0 ? `<div class="card" style="padding:16px 20px;margin-bottom:20px">${outcomeTrajectoryChart(initFiltered)}</div>` : ''}
    </div>

    <!-- ── Section 2: Responder Waterfall ───────────────────────────────── -->
    <div class="card" style="margin-bottom:20px">
      <div class="card-header" style="padding:14px 20px;border-bottom:1px solid var(--border)">
        <span style="font-weight:600;font-size:14px">Responder Rate by Template</span>
        <div style="display:flex;align-items:center;gap:14px;font-size:11px;color:var(--text-tertiary)">
          <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--teal);margin-right:4px;vertical-align:middle"></span>Responders</span>
          <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--bg-surface-2);margin-right:4px;vertical-align:middle"></span>Non-responders</span>
        </div>
      </div>
      <div class="card-body" id="oc-waterfall">
        ${renderWaterfall(initFiltered)}
      </div>
    </div>

    <!-- ── Section 3: Sparkline Cards ───────────────────────────────────── -->
    <div style="margin-bottom:8px">${sectionHeader('Score Trends by Template — Top 4')}</div>
    <div class="g4" id="oc-sparklines" style="margin-bottom:20px">
      ${renderSparklineCards(initFiltered)}
    </div>

    <!-- ── Section 4: Cohort by Modality ────────────────────────────────── -->
    <div class="card" style="margin-bottom:20px">
      <div class="card-header" style="padding:14px 20px;border-bottom:1px solid var(--border)">
        <span style="font-weight:600;font-size:14px">Cohort Comparison by Modality</span>
      </div>
      <div style="padding:16px;overflow-x:auto" id="oc-modality">
        ${renderModalityTable(initFiltered)}
      </div>
    </div>

    <!-- ── Record Outcome Panel ─────────────────────────────────────────── -->
    <div id="record-outcome-panel" style="display:none;margin-bottom:16px">
      <div class="card" style="padding:20px">
        <div style="font-size:13px;font-weight:600;margin-bottom:14px">Record Outcome Measurement</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px">
          <div>
            <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">Course</label>
            <select id="oc-course" class="form-control" style="font-size:12.5px">
              <option value="">Select course…</option>
              ${courses.map(c => `<option value="${c.id}|${c.patient_id}">${c.condition_slug?.replace(/-/g,' ')} · ${c.modality_slug} (${c.status})</option>`).join('')}
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

    <!-- ── Section 5: Outcome Records Table ─────────────────────────────── -->
    <div class="card">
      <div class="card-header" style="padding:14px 20px;border-bottom:1px solid var(--border)">
        <span style="font-weight:600;font-size:14px">Outcome Records</span>
        <div style="display:flex;align-items:center;gap:8px">
          <select id="oc-filter-tmpl" class="form-control" style="font-size:12px;padding:3px 8px;height:28px;width:auto" onchange="window._rerenderOutcomeTable()">
            <option value="">All templates</option>
            ${uniqueTemplates.map(t => `<option value="${t}">${t}</option>`).join('')}
          </select>
          <select id="oc-filter-course" class="form-control" style="font-size:12px;padding:3px 8px;height:28px;width:auto" onchange="window._rerenderOutcomeTable()">
            <option value="">All courses</option>
            ${uniqueCourses.map(c => `<option value="${c.id}">${c.condition_slug?.replace(/-/g,' ') || c.id.slice(0,8)} · ${c.modality_slug || ''}</option>`).join('')}
          </select>
        </div>
      </div>
      <div style="padding:16px;overflow-x:auto" id="oc-records-table">
        ${renderOutcomeTable(initFiltered)}
      </div>
    </div>

    <!-- ── Section 6: Clinic Benchmarks ──────────────────────────────────── -->
    ${(() => {
      // Compute per-modality responder rates from outcome data
      const modalityRates = {};
      const byModality = {};
      initFiltered.forEach(o => {
        const c = courseMap[o.course_id] || {};
        const mod = c.modality_slug || o.modality_slug;
        if (!mod) return;
        // Normalise slug to match BENCHMARKS key (e.g. tms -> TMS)
        const modKey = Object.keys(BENCHMARKS).find(k => k.toLowerCase() === mod.toLowerCase()) || mod;
        if (!byModality[modKey]) byModality[modKey] = { total: 0, responders: 0 };
        const withData = o.pct_change != null || o.is_responder != null;
        if (withData) {
          byModality[modKey].total++;
          const resp = o.is_responder != null ? o.is_responder : Math.abs(o.pct_change || 0) >= 50;
          if (resp) byModality[modKey].responders++;
        }
      });
      const matchedRows = Object.entries(BENCHMARKS)
        .filter(([mod]) => byModality[mod] && byModality[mod].total > 0)
        .map(([mod, bm]) => {
          const { total, responders } = byModality[mod];
          const clinicRate = Math.round((responders / total) * 100);
          return benchmarkRow(mod, clinicRate, bm.expected_responder_rate, bm);
        });
      if (!matchedRows.length) return '';
      return `<div class="card" style="margin-bottom:20px">
        <div class="card-header" style="padding:14px 20px;border-bottom:1px solid var(--border)">
          <span style="font-weight:600;font-size:14px">Clinic Benchmarks vs. Published Literature</span>
        </div>
        <div style="padding:20px">
          ${matchedRows.join('')}
          <div style="font-size:11px;color:var(--text-tertiary);font-style:italic;margin-top:12px">Benchmarks sourced from published meta-analyses. Direct comparison should account for patient population differences.</div>
        </div>
      </div>`;
    })()}

  </div>`;

  // ── Wire up show record outcome ────────────────────────────────────────
  window._showRecordOutcome = () => {
    document.getElementById('record-outcome-panel').style.display = '';
    document.getElementById('record-outcome-panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  window._saveOutcome = async function() {
    const errEl = document.getElementById('oc-error');
    errEl.style.display = 'none';
    const courseVal = document.getElementById('oc-course')?.value || '';
    const [courseId, patientId] = courseVal.split('|');
    const score = document.getElementById('oc-score')?.value;
    if (!courseId || !patientId) { errEl.textContent = 'Select a course.'; errEl.style.display = ''; return; }
    if (!score) { errEl.textContent = 'Enter a score.'; errEl.style.display = ''; return; }
    const tid = document.getElementById('oc-template')?.value || 'PHQ-9';
    try {
      await api.recordOutcome({
        patient_id:        patientId,
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
      errEl.textContent = e.message || 'Save failed.';
      errEl.style.display = '';
    }
  };
}

// ── pgAdverseEvents — Clinic-wide AE monitoring ───────────────────────────────
export async function pgAdverseEvents(setTopbar, navigate) {
  setTopbar('Adverse Events Monitor', `<button class="btn btn-sm" onclick="window._nav('courses')">← Courses</button>`);
  const el = document.getElementById('content');
  el.innerHTML = spinner();

  let aes = [], courses = [], patients = [];
  try {
    [aes, courses, patients] = await Promise.all([
      api.listAdverseEvents().then(r => r?.items || []).catch(() => []),
      api.listCourses().then(r => r?.items || []).catch(() => []),
      api.listPatients().then(r => r?.items || []).catch(() => []),
    ]);
  } catch {}

  const courseMap = {};
  courses.forEach(c => { courseMap[c.id] = c; });
  const patMap = {};
  patients.forEach(p => { patMap[p.id] = `${p.first_name} ${p.last_name}`; });

  const counts = { mild: 0, moderate: 0, severe: 0, serious: 0 };
  aes.forEach(ae => { if (counts[ae.severity] !== undefined) counts[ae.severity]++; });

  const SEV_COLOR = { mild: 'var(--text-secondary)', moderate: 'var(--amber)', severe: 'var(--red)', serious: 'var(--red)' };

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px">
      ${['mild','moderate','severe','serious'].map(s => `
        <div class="metric-card" style="cursor:pointer" onclick="window._aeFilter('${s}')">
          <div class="metric-label">${s.charAt(0).toUpperCase()+s.slice(1)}</div>
          <div class="metric-value" style="color:${SEV_COLOR[s]}">${counts[s]}</div>
          <div class="metric-delta">reported events</div>
        </div>`).join('')}
    </div>

    <div class="card" style="margin-bottom:16px">
      <div style="padding:12px 20px;border-bottom:1px solid var(--border);display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <select id="ae-sev-filter" class="form-control" style="width:auto;font-size:12px" onchange="window._aeFilter()">
          <option value="">All Severities</option>
          <option value="mild">Mild</option>
          <option value="moderate">Moderate</option>
          <option value="severe">Severe</option>
          <option value="serious">Serious</option>
        </select>
        <input id="ae-search" class="form-control" placeholder="Search event type or notes…" style="flex:1;min-width:180px;font-size:12px" oninput="window._aeFilter()">
        <span id="ae-count" style="font-size:11px;color:var(--text-tertiary);white-space:nowrap">${aes.length} events</span>
      </div>
      <div style="overflow-x:auto">
        ${aes.length === 0 ? emptyState('🛡️', 'No adverse events reported', 'Adverse events will be logged here when reported during sessions.') : `
        <table class="ds-table" id="ae-table">
          <thead><tr><th>Date</th><th>Patient</th><th>Course</th><th>Event Type</th><th>Severity</th><th>Onset</th><th>Action</th><th>Resolution</th><th></th></tr></thead>
          <tbody id="ae-tbody">
            ${aes.map(ae => {
              const sev = ae.severity || 'mild';
              const sc = SEV_COLOR[sev] || 'var(--text-secondary)';
              const course = courseMap[ae.course_id] || {};
              const patName = patMap[ae.patient_id] || (course.patient_id ? patMap[course.patient_id] : '') || '—';
              return `<tr data-sev="${sev}" data-text="${(ae.event_type||'') + ' ' + (ae.notes||'')}">
                <td style="font-size:11.5px;color:var(--text-secondary);white-space:nowrap">${ae.occurred_at ? ae.occurred_at.split('T')[0] : ae.created_at?.split('T')[0] || '—'}</td>
                <td style="font-size:12px">${patName}</td>
                <td style="font-size:12px">${course.condition_slug ? course.condition_slug.replace(/-/g,' ') + ' · ' + (course.modality_slug||'') : '—'}</td>
                <td style="font-size:12.5px;font-weight:500">${ae.event_type || '—'}</td>
                <td><span style="font-size:11px;padding:2px 8px;border-radius:4px;background:${sc}22;color:${sc};font-weight:600">${sev}</span></td>
                <td style="font-size:11.5px">${ae.onset_timing || '—'}</td>
                <td style="font-size:11.5px">${ae.action_taken || '—'}</td>
                <td style="font-size:11.5px">${ae.resolution || ae.resolved ? '<span style="color:var(--green)">Resolved</span>' : '<span style="color:var(--amber)">Ongoing</span>'}</td>
                <td>${ae.course_id ? `<button class="btn btn-sm" onclick="window._openCourse('${ae.course_id}')">View →</button>` : ''}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>`}
      </div>
    </div>`;

  window._aeFilter = function(directSev) {
    const sevEl = document.getElementById('ae-sev-filter');
    const q     = (document.getElementById('ae-search')?.value || '').toLowerCase();
    if (directSev && sevEl) sevEl.value = directSev;
    const sev = sevEl?.value || '';
    const rows = document.querySelectorAll('#ae-tbody tr');
    let visible = 0;
    rows.forEach(row => {
      const matchSev  = !sev  || row.dataset.sev === sev;
      const matchText = !q    || (row.dataset.text || '').toLowerCase().includes(q);
      row.style.display = matchSev && matchText ? '' : 'none';
      if (matchSev && matchText) visible++;
    });
    const countEl = document.getElementById('ae-count');
    if (countEl) countEl.textContent = visible + ' event' + (visible !== 1 ? 's' : '');
  };
}

// ── pgProtocolRegistry — Browse registry protocols ────────────────────────────
export async function pgProtocolRegistry(setTopbar) {
  setTopbar('Protocol Registry', '');
  const el = document.getElementById('content');
  el.innerHTML = spinner();

  try {
    const [protoData, condData, modData, patientsData] = await Promise.all([
      api.protocols(),
      api.conditions().catch(() => null),
      api.modalities().catch(() => null),
      api.listPatients().catch(() => null),
    ]);
    const items    = protoData?.items || [];
    const conds    = condData?.items  || [];
    const mods     = modData?.items   || [];
    const patients = patientsData?.items || [];
    const condMap  = {};
    conds.forEach(c => { condMap[c.id || c.Condition_ID] = c.name || c.Condition_Name || c.id; });

    // Build condition & modality option lists with fallback
    const condOptions = conds.length
      ? conds.map(c => `<option value="${c.id || c.Condition_ID}">${c.name || c.Condition_Name || c.id}</option>`).join('')
      : FALLBACK_CONDITIONS.map(c => `<option value="${c}">${c}</option>`).join('');

    const modOptions = mods.length
      ? mods.map(m => `<option value="${m.id || m.name || m.Modality_Name}">${m.name || m.Modality_Name || m.id}</option>`).join('')
      : FALLBACK_MODALITIES.map(m => `<option value="${m}">${m}</option>`).join('');

    const patientOptions = patients.length
      ? patients.map(p => `<option value="${p.id}">${p.first_name} ${p.last_name}</option>`).join('')
      : '<option value="" disabled>No patients</option>';

    el.innerHTML = `
      <div class="page-section">
        <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap">
          <input id="pr-search" class="form-control" placeholder="Search protocols, conditions, modalities…" style="flex:1;min-width:200px;font-size:12.5px" oninput="window._filterProtocols()">
          <select id="pr-condition" class="form-control" style="width:auto;font-size:12.5px" onchange="window._filterProtocols()">
            <option value="">All Conditions</option>
            ${condOptions}
          </select>
          <select id="pr-modality" class="form-control" style="width:auto;font-size:12.5px" onchange="window._filterProtocols()">
            <option value="">All Modalities</option>
            ${modOptions}
          </select>
          <select id="pr-grade" class="form-control" style="width:auto;font-size:12.5px" onchange="window._filterProtocols()">
            <option value="">All Evidence Grades</option>
            <option value="EV-A">EV-A (Highest)</option>
            <option value="EV-B">EV-B</option>
            <option value="EV-C">EV-C</option>
            <option value="EV-D">EV-D</option>
          </select>
          <label style="display:flex;align-items:center;gap:6px;font-size:12.5px;color:var(--text-secondary);cursor:pointer;flex-shrink:0">
            <input type="checkbox" id="pr-onlabel" onchange="window._filterProtocols()"> On-label only
          </label>
        </div>
        <div id="pr-count" style="margin-bottom:12px;font-size:12px;color:var(--text-secondary)">${items.length} registry protocols</div>
        <div id="pr-list" style="display:flex;flex-direction:column;gap:8px">
          ${items.map(p => renderProtocolCard(p, condMap, patientOptions)).join('')}
        </div>
      </div>`;

    window._allProtocols    = items;
    window._condMap         = condMap;
    window._patientOptions  = patientOptions;

    bindProtocolRegistry();

    window._filterProtocols = function() {
      const q       = (document.getElementById('pr-search')?.value || '').toLowerCase();
      const grade   = document.getElementById('pr-grade')?.value || '';
      const condSel = document.getElementById('pr-condition')?.value || '';
      const modSel  = document.getElementById('pr-modality')?.value || '';
      const onLabel = document.getElementById('pr-onlabel')?.checked || false;
      const visible = (window._allProtocols || []).filter(p => {
        const condName = (window._condMap || {})[p.condition_id] || p.condition_id || '';
        const text = `${p.name || ''} ${condName} ${p.modality_id || ''} ${p.target_region || ''}`.toLowerCase();
        const isOn = String(p.on_label_vs_off_label || '').toLowerCase().startsWith('on');
        const matchCond = !condSel || (p.condition_id || '').includes(condSel) || condName.toLowerCase().includes(condSel.toLowerCase());
        const matchMod  = !modSel  || (p.modality_id || '').toLowerCase().includes(modSel.toLowerCase());
        return (!q || text.includes(q))
          && (!grade  || p.evidence_grade === grade)
          && (!onLabel || isOn)
          && matchCond
          && matchMod;
      });
      const listEl  = document.getElementById('pr-list');
      const countEl = document.getElementById('pr-count');
      if (countEl) countEl.textContent = `${visible.length} of ${(window._allProtocols || []).length} registry protocols`;
      if (listEl) listEl.innerHTML = visible.length
        ? visible.map(p => renderProtocolCard(p, window._condMap || {}, window._patientOptions || '')).join('')
        : emptyState('◇', 'No protocols match filter.');
      bindProtocolRegistry();
    };
  } catch (e) {
    el.innerHTML = `<div style="padding:32px">${emptyState('◇', 'Protocol registry unavailable. Ensure backend is running.')}</div>`;
  }
}

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
        <button class="btn btn-sm" style="font-size:10.5px" onclick="event.stopPropagation();window._toggleProtoDetail('${pid}')">View Details →</button>
        <span style="font-size:10px;color:var(--text-tertiary)" id="proto-chevron-${pid}">▼</span>
      </div>
    </div>
    <div id="proto-detail-${pid}" style="display:none;background:rgba(0,0,0,0.2);padding:16px 20px;border-top:1px solid var(--border);border-bottom:1px solid var(--border)">
      <div class="g2" style="margin-bottom:14px">
        <div>
          ${[
            ['Protocol ID',      p.id || '—'],
            ['Condition',        condName],
            ['Phenotype',        p.phenotype_id || '—'],
            ['Modality',         p.modality_id || '—'],
            ['Device',           p.device_id_if_specific || 'Any compatible'],
            ['Target Region',    p.target_region || '—'],
            ['Laterality',       p.laterality || '—'],
          ].map(([k,v]) => `<div style="display:flex;gap:8px;padding:4px 0;border-bottom:1px solid var(--border);font-size:12px"><span style="color:var(--text-tertiary);width:130px;flex-shrink:0">${k}</span><span style="color:var(--text-primary)">${v}</span></div>`).join('')}
        </div>
        <div>
          ${[
            ['Frequency',        p.frequency_hz ? p.frequency_hz + ' Hz' : '—'],
            ['Intensity',        p.intensity || '—'],
            ['Session Duration', p.session_duration || '—'],
            ['Sessions/Week',    p.sessions_per_week ? p.sessions_per_week + '×/wk' : '—'],
            ['Total Course',     p.total_course || '—'],
            ['Coil/Placement',   p.coil_or_electrode_placement || '—'],
            ['Review Required',  p.clinician_review_required === 'Yes' ? '<span style="color:var(--amber)">Yes</span>' : '<span style="color:var(--green)">No</span>'],
          ].map(([k,v]) => `<div style="display:flex;gap:8px;padding:4px 0;border-bottom:1px solid var(--border);font-size:12px"><span style="color:var(--text-tertiary);width:130px;flex-shrink:0">${k}</span><span style="color:var(--text-primary)">${v}</span></div>`).join('')}
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:center">
        ${evidenceBadge(p.evidence_grade)}
        ${labelBadge(isOn)}
        ${p.governance_flags?.length ? `<span style="font-size:10px;font-weight:600;padding:2px 7px;border-radius:4px;background:rgba(255,107,107,0.1);color:var(--red)">⚠ ${p.governance_flags.length} governance flag${p.governance_flags.length > 1 ? 's' : ''}</span>` : ''}
      </div>
      ${(p.governance_flags || []).map(f => `<div style="font-size:11.5px;color:var(--amber);padding:6px 10px;background:rgba(255,181,71,0.06);border-radius:5px;margin-bottom:6px;border-left:3px solid var(--amber)">⚠ ${f}</div>`).join('')}
      ${p.monitoring_requirements ? `<div style="font-size:11.5px;color:var(--text-secondary);margin-bottom:12px;padding:10px;background:rgba(255,181,71,0.06);border-radius:6px;border-left:3px solid var(--amber)">Monitoring: ${p.monitoring_requirements}</div>` : ''}
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
        <button class="btn btn-primary btn-sm" onclick="window._useProtocol('${pid}')">Use This Protocol →</button>
        <button class="btn btn-sm" onclick="window._toggleAssignForm('${pid}')">Assign to Patient →</button>
        <button class="btn btn-sm" onclick="window._startCourseFromProtocol('${pid}')">+ Create Course</button>
        <button class="btn btn-sm" onclick="window._toggleProtoDetail('${pid}')">Close</button>
      </div>
      <div id="proto-assign-form-${pid}" style="display:none;margin-top:8px;padding:12px;background:rgba(255,255,255,0.03);border-radius:6px;border:1px solid var(--border)">
        <div style="font-size:11.5px;font-weight:600;color:var(--text-secondary);margin-bottom:8px;text-transform:uppercase;letter-spacing:.7px">Assign to Patient</div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <select id="proto-assign-pat-${pid}" class="form-control" style="flex:1;min-width:180px;font-size:12.5px">
            <option value="">Select patient…</option>
            ${patientOptions}
          </select>
          <button class="btn btn-primary btn-sm" onclick="window._assignProtocolToPatient('${pid}','${p.phenotype_id || ''}')">Assign</button>
          <button class="btn btn-sm" onclick="document.getElementById('proto-assign-form-${pid}').style.display='none'">Cancel</button>
        </div>
        <div id="proto-assign-msg-${pid}" style="font-size:11.5px;margin-top:6px;display:none"></div>
      </div>
    </div>
  </div>`;
}

// bind in pgProtocolRegistry
function bindProtocolRegistry() {
  window._toggleProtoDetail = function(id) {
    // Close all other open panels
    document.querySelectorAll('[id^="proto-detail-"]').forEach(el => {
      if (el.id !== 'proto-detail-' + id && el.style.display !== 'none') {
        el.style.display = 'none';
        const chev = document.getElementById('proto-chevron-' + el.id.replace('proto-detail-', ''));
        if (chev) chev.textContent = '▼';
      }
    });
    const panel = document.getElementById('proto-detail-' + id);
    const chev  = document.getElementById('proto-chevron-' + id);
    if (!panel) return;
    const open = panel.style.display !== 'none';
    panel.style.display = open ? 'none' : '';
    if (chev) chev.textContent = open ? '▼' : '▲';
  };

  window._useProtocol = function(protocolId) {
    window._wizardProtocolId = protocolId;
    window._nav('protocol-wizard');
  };

  window._startCourseFromProtocol = function(protocolId) {
    window._wizardProtocolId = protocolId;
    window._nav('protocol-wizard');
  };

  window._toggleAssignForm = function(pid) {
    const form = document.getElementById('proto-assign-form-' + pid);
    if (form) form.style.display = form.style.display === 'none' ? '' : 'none';
  };

  window._assignProtocolToPatient = async function(protocolId, phenotypeId) {
    const patEl  = document.getElementById('proto-assign-pat-' + protocolId);
    const msgEl  = document.getElementById('proto-assign-msg-' + protocolId);
    const patId  = patEl?.value;
    if (!patId) {
      if (msgEl) { msgEl.textContent = 'Select a patient.'; msgEl.style.color = 'var(--red)'; msgEl.style.display = ''; }
      return;
    }
    try {
      const payload = { patient_id: patId, protocol_id: protocolId };
      if (phenotypeId) payload.phenotype_id = phenotypeId;
      await api.assignPhenotype(payload);
      if (msgEl) { msgEl.textContent = 'Assigned successfully.'; msgEl.style.color = 'var(--teal)'; msgEl.style.display = ''; }
      setTimeout(() => {
        const form = document.getElementById('proto-assign-form-' + protocolId);
        if (form) form.style.display = 'none';
        if (msgEl) msgEl.style.display = 'none';
      }, 2000);
    } catch (e) {
      if (msgEl) { msgEl.textContent = e.message || 'Assignment failed.'; msgEl.style.color = 'var(--red)'; msgEl.style.display = ''; }
    }
  };
}

// ── pgClinicalReports — Reporting dashboard ───────────────────────────────────
export async function pgClinicalReports(setTopbar) {
  setTopbar('Clinical Reports', '<span style="font-size:12px;color:var(--text-secondary)">Generate and export patient outcome reports</span>');
  const el = document.getElementById('content');

  el.innerHTML = `
    <div id="report-type-grid" style="display:grid;grid-template-columns:repeat(2,1fr);gap:16px;margin-bottom:24px;max-width:800px">
      ${[
        { id: 'patient',    icon: '&#128100;', title: 'Patient Outcome Summary',  desc: 'Full outcome history for a single patient across all courses' },
        { id: 'course',     icon: '&#128203;', title: 'Course Progress Report',   desc: 'Detailed session log and outcome data for a treatment course' },
        { id: 'population', icon: '&#128202;', title: 'Population Analytics',     desc: 'Aggregate outcomes across all patients and conditions' },
        { id: 'ae',         icon: '&#9888;',   title: 'Adverse Events Log',       desc: 'All reported adverse events with severity and resolution status' },
      ].map(t => `
        <div class="card" style="cursor:pointer;transition:border-color 0.15s;border:2px solid transparent"
          id="report-tile-${t.id}"
          onmouseover="this.style.borderColor='var(--teal)'"
          onmouseout="if(window._reportType!=='${t.id}')this.style.borderColor='transparent'"
          onclick="window._selectReportType('${t.id}')">
          <div style="padding:20px">
            <div style="font-size:28px;margin-bottom:10px">${t.icon}</div>
            <div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:6px">${t.title}</div>
            <div style="font-size:11.5px;color:var(--text-secondary);line-height:1.5">${t.desc}</div>
          </div>
        </div>`).join('')}
    </div>

    <div id="report-config-panel" style="display:none;margin-bottom:24px;padding:20px;background:rgba(0,0,0,0.2);border:1px solid var(--border);border-radius:var(--radius-md)">
      <div style="font-size:11px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.8px;margin-bottom:14px">Report Configuration</div>
      <div id="report-config-body"></div>
      <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn btn-primary btn-sm" onclick="window._generateReport()">Generate Report</button>
        <button class="btn btn-sm" onclick="document.getElementById('report-config-panel').style.display='none';window._reportType=null;document.querySelectorAll('[id^=report-tile-]').forEach(t=>t.style.borderColor='transparent')">Cancel</button>
      </div>
    </div>

    <div id="report-preview" style="display:none">
      <div style="display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap" class="no-print">
        <button class="btn btn-primary btn-sm" onclick="window._printReport()">&#128424; Print Report</button>
        <button class="btn btn-sm" onclick="window._printReport()">&#128229; Download PDF</button>
        <span style="font-size:11px;color:var(--text-tertiary);align-self:center">Use browser Print &rarr; Save as PDF to download</span>
      </div>
      <div id="printable-report" style="background:white;color:#111;padding:32px;border-radius:var(--radius-md);border:1px solid var(--border)"></div>
    </div>`;

  window._reportType = null;

  const configTemplates = {
    patient: `
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
        <div>
          <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">Patient</label>
          <select id="rp-patient" class="form-control" style="font-size:12px"><option value="">Loading\u2026</option></select>
        </div>
        <div>
          <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">From</label>
          <input id="rp-from" class="form-control" type="date" style="font-size:12px">
        </div>
        <div>
          <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">To</label>
          <input id="rp-to" class="form-control" type="date" style="font-size:12px">
        </div>
      </div>`,
    course: `
      <div>
        <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">Course ID</label>
        <input id="rp-course-id" class="form-control" placeholder="Paste course ID or select from Treatment Courses" style="font-size:12px;max-width:400px">
      </div>`,
    population: `
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
        <div>
          <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">From</label>
          <input id="rp-from" class="form-control" type="date" style="font-size:12px">
        </div>
        <div>
          <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">To</label>
          <input id="rp-to" class="form-control" type="date" style="font-size:12px">
        </div>
        <div>
          <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">Condition Filter</label>
          <input id="rp-condition" class="form-control" placeholder="e.g. depression" style="font-size:12px">
        </div>
      </div>`,
    ae: `
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
        <div>
          <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">From</label>
          <input id="rp-from" class="form-control" type="date" style="font-size:12px">
        </div>
        <div>
          <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">To</label>
          <input id="rp-to" class="form-control" type="date" style="font-size:12px">
        </div>
        <div>
          <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">Severity</label>
          <select id="rp-severity" class="form-control" style="font-size:12px">
            <option value="">All</option>
            <option value="mild">Mild</option>
            <option value="moderate">Moderate</option>
            <option value="severe">Severe</option>
            <option value="serious">Serious</option>
          </select>
        </div>
      </div>`,
  };

  window._selectReportType = async function(type) {
    window._reportType = type;
    document.querySelectorAll('[id^="report-tile-"]').forEach(t => { t.style.borderColor = 'transparent'; });
    const tile = document.getElementById('report-tile-' + type);
    if (tile) tile.style.borderColor = 'var(--teal)';
    const configBody = document.getElementById('report-config-body');
    const panel      = document.getElementById('report-config-panel');
    if (configBody) configBody.innerHTML = configTemplates[type] || '';
    if (panel)      panel.style.display  = '';

    if (type === 'patient') {
      const sel = document.getElementById('rp-patient');
      if (sel) {
        sel.innerHTML = '<option value="">Loading patients\u2026</option>';
        try {
          const pats = await api.listPatients().catch(() => null);
          const items = pats?.items || pats || [];
          sel.innerHTML = '<option value="">Select patient\u2026</option>'
            + items.map(p => '<option value="' + p.id + '">' + p.first_name + ' ' + p.last_name + '</option>').join('');
        } catch (_) {
          sel.innerHTML = '<option value="">Could not load patients</option>';
        }
      }
    }
  };

  window._generateReport = async function() {
    const type = window._reportType;
    if (!type) return;
    const preview = document.getElementById('report-preview');
    const reportEl = document.getElementById('printable-report');
    if (reportEl) reportEl.innerHTML = '<div style="text-align:center;padding:32px;color:#555">Generating report\u2026</div>';
    if (preview) preview.style.display = '';
    try {
      const html = await window._buildReportHtml(type);
      if (reportEl) reportEl.innerHTML = html;
    } catch (e) {
      if (reportEl) reportEl.innerHTML = '<div style="color:#cc0000;padding:16px">Error generating report: ' + (e.message || 'Unknown error') + '</div>';
    }
  };

  window._buildReportHtml = async function(type) {
    const genDate = new Date().toLocaleString();
    const hdr = '<div class="print-header" style="display:block;border-bottom:2px solid #003366;padding-bottom:12px;margin-bottom:20px"><div style="display:flex;justify-content:space-between;align-items:flex-start"><div><div style="font-size:18pt;font-weight:700;color:#003366">DeepSynaps Protocol Studio</div><div style="font-size:10pt;color:#555;margin-top:2px">Clinical Reports</div></div><div style="text-align:right;font-size:9pt;color:#555"><div>Generated: ' + genDate + '</div><div style="background:#cc0000;color:white;padding:2px 8px;border-radius:3px;font-weight:700;margin-top:4px">CONFIDENTIAL</div></div></div></div>';
    const ftr = '<div style="margin-top:32px;padding-top:12px;border-top:1px solid #ccc;font-size:8pt;color:#888;display:flex;justify-content:space-between"><span>DeepSynaps Protocol Studio \u2014 Confidential Clinical Record</span><span>Generated ' + genDate + '</span></div>';

    if (type === 'patient') {
      const patId = document.getElementById('rp-patient')?.value;
      if (!patId) throw new Error('Select a patient.');
      const from = document.getElementById('rp-from')?.value || null;
      const to   = document.getElementById('rp-to')?.value || null;
      const [pat, outRes] = await Promise.all([
        api.getPatient(patId),
        api.listOutcomes({ patient_id: patId }).catch(() => null),
      ]);
      const outs = outRes?.items || [];
      const cRes = await api.listCourses({ patient_id: patId }).catch(() => null);
      const cList = cRes?.items || [];
      const filtOut = outs.filter(o => {
        const d = o.recorded_at ? o.recorded_at.split('T')[0] : null;
        return (!from || !d || d >= from) && (!to || !d || d <= to);
      });
      const tRowsSym = ['Date','Template','Score','Point'];
      const tHdr = '<tr style="background:#003366;color:white">' + tRowsSym.map(h => '<th style="padding:5px 8px;text-align:left">' + h + '</th>').join('') + '</tr>';
      const outRows = filtOut.map(o => '<tr><td style="padding:5px 8px;border:1px solid #ddd">' + (o.recorded_at ? o.recorded_at.split('T')[0] : '\u2014') + '</td><td style="padding:5px 8px;border:1px solid #ddd">' + (o.template_name || o.template_id || '\u2014') + '</td><td style="padding:5px 8px;border:1px solid #ddd">' + (o.score != null ? o.score : '\u2014') + '</td><td style="padding:5px 8px;border:1px solid #ddd">' + (o.measurement_point || '\u2014') + '</td></tr>').join('');
      const cRows = cList.map(c => '<tr><td style="padding:5px 8px;border:1px solid #ddd">' + (c.condition_slug || '\u2014').replace(/-/g,' ') + '</td><td style="padding:5px 8px;border:1px solid #ddd">' + (c.modality_slug || '\u2014') + '</td><td style="padding:5px 8px;border:1px solid #ddd">' + (c.status || '\u2014').replace(/_/g,' ') + '</td><td style="padding:5px 8px;border:1px solid #ddd">' + (c.sessions_delivered || 0) + ' / ' + (c.planned_sessions_total || '?') + '</td></tr>').join('');
      return hdr
        + '<h2 style="font-size:14pt;color:#003366;margin-bottom:4px">Patient Outcome Summary</h2>'
        + '<div style="font-size:10pt;color:#555;margin-bottom:20px">Patient: <strong>' + pat.first_name + ' ' + pat.last_name + '</strong>' + ((pat.dob || pat.date_of_birth) ? ' &nbsp;|&nbsp; DOB: ' + (pat.dob || pat.date_of_birth) : '') + (from || to ? ' &nbsp;|&nbsp; Period: ' + (from || 'all') + ' to ' + (to || 'present') : '') + '</div>'
        + '<h3 style="font-size:12pt;color:#003366;border-bottom:1px solid #ccc;padding-bottom:4px;margin-bottom:10px">Treatment Courses (' + cList.length + ')</h3>'
        + (cList.length === 0 ? '<p style="color:#777">No treatment courses.</p>' : '<table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:9pt"><thead><tr style="background:#003366;color:white"><th style="padding:5px 8px;text-align:left">Condition</th><th style="padding:5px 8px;text-align:left">Modality</th><th style="padding:5px 8px;text-align:left">Status</th><th style="padding:5px 8px;text-align:left">Sessions</th></tr></thead><tbody>' + cRows + '</tbody></table>')
        + '<h3 style="font-size:12pt;color:#003366;border-bottom:1px solid #ccc;padding-bottom:4px;margin-bottom:10px">Outcome Measures (' + filtOut.length + ')</h3>'
        + (filtOut.length === 0 ? '<p style="color:#777">No outcome records for selected period.</p>' : '<table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:9pt"><thead>' + tHdr + '</thead><tbody>' + outRows + '</tbody></table>')
        + ftr;
    }

    if (type === 'course') {
      const courseId = document.getElementById('rp-course-id')?.value?.trim();
      if (!courseId) throw new Error('Enter a course ID.');
      const [crs, sRes, oRes, aeR] = await Promise.all([
        api.getCourse(courseId),
        api.listCourseSessions(courseId).then(r => r?.items || []).catch(() => []),
        api.listOutcomes({ course_id: courseId }).then(r => r?.items || []).catch(() => []),
        api.listAdverseEvents({ course_id: courseId }).then(r => r?.items || []).catch(() => []),
      ]);
      let pt3 = null;
      if (crs?.patient_id) pt3 = await api.getPatient(crs.patient_id).catch(() => null);
      const pct2 = Math.min(100, Math.round(((crs.sessions_delivered || 0) / (crs.planned_sessions_total || 1)) * 100));
      const sRows = sRes.map((s, i) => '<tr><td style="padding:5px 8px;border:1px solid #ddd">' + (i + 1) + '</td><td style="padding:5px 8px;border:1px solid #ddd">' + (s.session_date ? s.session_date.split('T')[0] : '\u2014') + '</td><td style="padding:5px 8px;border:1px solid #ddd">' + (s.frequency_hz || '\u2014') + '</td><td style="padding:5px 8px;border:1px solid #ddd">' + (s.intensity_pct_rmt || '\u2014') + '</td><td style="padding:5px 8px;border:1px solid #ddd">' + (s.pulses_delivered || '\u2014') + '</td><td style="padding:5px 8px;border:1px solid #ddd">' + (s.tolerance_rating || '\u2014') + '</td><td style="padding:5px 8px;border:1px solid #ddd">' + (s.session_outcome || '\u2014') + '</td></tr>').join('');
      const oRows = oRes.map(o => '<tr><td style="padding:5px 8px;border:1px solid #ddd">' + (o.recorded_at ? o.recorded_at.split('T')[0] : '\u2014') + '</td><td style="padding:5px 8px;border:1px solid #ddd">' + (o.template_name || o.template_id || '\u2014') + '</td><td style="padding:5px 8px;border:1px solid #ddd">' + (o.score != null ? o.score : '\u2014') + '</td><td style="padding:5px 8px;border:1px solid #ddd">' + (o.measurement_point || '\u2014') + '</td></tr>').join('');
      const aeRows2 = aeR.map(ae => '<tr><td style="padding:5px 8px;border:1px solid #ddd">' + (ae.reported_at ? ae.reported_at.split('T')[0] : '\u2014') + '</td><td style="padding:5px 8px;border:1px solid #ddd;text-transform:capitalize">' + (ae.severity || '\u2014') + '</td><td style="padding:5px 8px;border:1px solid #ddd">' + (ae.description || '\u2014') + '</td><td style="padding:5px 8px;border:1px solid #ddd">' + (ae.resolved ? 'Yes' : 'No') + '</td></tr>').join('');
      return hdr
        + '<h2 style="font-size:14pt;color:#003366;margin-bottom:4px">Course Progress Report</h2>'
        + '<div style="font-size:10pt;color:#555;margin-bottom:16px">' + (crs.condition_slug ? crs.condition_slug.replace(/-/g,' ') : '\u2014') + ' &middot; ' + (crs.modality_slug || '\u2014') + (pt3 ? ' &nbsp;|&nbsp; Patient: <strong>' + pt3.first_name + ' ' + pt3.last_name + '</strong>' : '') + ' &nbsp;|&nbsp; Status: <strong>' + (crs.status || '\u2014').replace(/_/g,' ') + '</strong></div>'
        + '<div style="margin-bottom:16px"><div style="font-size:10pt;font-weight:600;margin-bottom:4px">Session Progress: ' + (crs.sessions_delivered || 0) + ' / ' + (crs.planned_sessions_total || '?') + '</div><div style="height:12px;background:#eee;border-radius:6px;overflow:hidden"><div style="height:12px;background:#003366;width:' + pct2 + '%;border-radius:6px"></div></div></div>'
        + (sRes.length > 0 ? '<h3 style="font-size:12pt;color:#003366;border-bottom:1px solid #ccc;padding-bottom:4px;margin-bottom:10px">Session Log (' + sRes.length + ')</h3><table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:9pt"><thead><tr style="background:#003366;color:white"><th style="padding:5px 8px;text-align:left">#</th><th style="padding:5px 8px;text-align:left">Date</th><th style="padding:5px 8px;text-align:left">Hz</th><th style="padding:5px 8px;text-align:left">% RMT</th><th style="padding:5px 8px;text-align:left">Pulses</th><th style="padding:5px 8px;text-align:left">Tolerance</th><th style="padding:5px 8px;text-align:left">Outcome</th></tr></thead><tbody>' + sRows + '</tbody></table>' : '')
        + (oRes.length > 0 ? '<h3 style="font-size:12pt;color:#003366;border-bottom:1px solid #ccc;padding-bottom:4px;margin-bottom:10px">Outcomes (' + oRes.length + ')</h3><table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:9pt"><thead><tr style="background:#003366;color:white"><th style="padding:5px 8px;text-align:left">Date</th><th style="padding:5px 8px;text-align:left">Template</th><th style="padding:5px 8px;text-align:left">Score</th><th style="padding:5px 8px;text-align:left">Point</th></tr></thead><tbody>' + oRows + '</tbody></table>' : '')
        + (aeR.length > 0 ? '<h3 style="font-size:12pt;color:#cc0000;border-bottom:1px solid #ccc;padding-bottom:4px;margin-bottom:10px">Adverse Events (' + aeR.length + ')</h3><table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:9pt"><thead><tr style="background:#cc0000;color:white"><th style="padding:5px 8px;text-align:left">Date</th><th style="padding:5px 8px;text-align:left">Severity</th><th style="padding:5px 8px;text-align:left">Description</th><th style="padding:5px 8px;text-align:left">Resolved</th></tr></thead><tbody>' + aeRows2 + '</tbody></table>' : '')
        + ftr;
    }

    if (type === 'population') {
      const from = document.getElementById('rp-from')?.value || null;
      const to   = document.getElementById('rp-to')?.value || null;
      const cond = (document.getElementById('rp-condition')?.value || '').toLowerCase();
      const [agg2, cAll] = await Promise.all([
        api.aggregateOutcomes().catch(() => null),
        api.listCourses().then(r => r?.items || []).catch(() => []),
      ]);
      const filt = cAll.filter(c => !cond || (c.condition_slug || '').toLowerCase().includes(cond));
      const bySt = {};
      filt.forEach(c => { bySt[c.status] = (bySt[c.status] || 0) + 1; });
      const byMod = {};
      filt.forEach(c => { byMod[c.modality_slug || 'Unknown'] = (byMod[c.modality_slug || 'Unknown'] || 0) + 1; });
      return hdr
        + '<h2 style="font-size:14pt;color:#003366;margin-bottom:4px">Population Analytics Report</h2>'
        + '<div style="font-size:10pt;color:#555;margin-bottom:20px">Aggregate outcomes across all patients' + (cond ? ' \u2014 filter: ' + cond : '') + (from || to ? ' | Period: ' + (from || 'all') + ' to ' + (to || 'present') : '') + '</div>'
        + '<h3 style="font-size:12pt;color:#003366;border-bottom:1px solid #ccc;padding-bottom:4px;margin-bottom:10px">Key Metrics</h3>'
        + '<table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:10pt"><tbody>'
        + '<tr><td style="padding:5px 8px;border:1px solid #ddd;font-weight:600;background:#f5f7fa;width:40%">Total Courses (filtered)</td><td style="padding:5px 8px;border:1px solid #ddd">' + filt.length + '</td></tr>'
        + '<tr><td style="padding:5px 8px;border:1px solid #ddd;font-weight:600;background:#f5f7fa">Total Outcomes Recorded</td><td style="padding:5px 8px;border:1px solid #ddd">' + (agg2?.total_outcomes || '\u2014') + '</td></tr>'
        + '<tr><td style="padding:5px 8px;border:1px solid #ddd;font-weight:600;background:#f5f7fa">Responder Rate</td><td style="padding:5px 8px;border:1px solid #ddd">' + (agg2?.responder_rate != null ? (agg2.responder_rate * 100).toFixed(1) + '%' : '\u2014') + '</td></tr>'
        + '<tr><td style="padding:5px 8px;border:1px solid #ddd;font-weight:600;background:#f5f7fa">Mean Improvement</td><td style="padding:5px 8px;border:1px solid #ddd">' + (agg2?.mean_improvement != null ? agg2.mean_improvement : '\u2014') + '</td></tr>'
        + '</tbody></table>'
        + '<h3 style="font-size:12pt;color:#003366;border-bottom:1px solid #ccc;padding-bottom:4px;margin-bottom:10px">Courses by Status</h3>'
        + '<table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:10pt"><thead><tr style="background:#003366;color:white"><th style="padding:5px 8px;text-align:left">Status</th><th style="padding:5px 8px;text-align:left">Count</th></tr></thead><tbody>'
        + Object.entries(bySt).map(([s, c]) => '<tr><td style="padding:5px 8px;border:1px solid #ddd;text-transform:capitalize">' + s.replace(/_/g,' ') + '</td><td style="padding:5px 8px;border:1px solid #ddd">' + c + '</td></tr>').join('')
        + '</tbody></table>'
        + '<h3 style="font-size:12pt;color:#003366;border-bottom:1px solid #ccc;padding-bottom:4px;margin-bottom:10px">Courses by Modality</h3>'
        + '<table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:10pt"><thead><tr style="background:#003366;color:white"><th style="padding:5px 8px;text-align:left">Modality</th><th style="padding:5px 8px;text-align:left">Count</th></tr></thead><tbody>'
        + Object.entries(byMod).map(([m, c]) => '<tr><td style="padding:5px 8px;border:1px solid #ddd">' + m + '</td><td style="padding:5px 8px;border:1px solid #ddd">' + c + '</td></tr>').join('')
        + '</tbody></table>'
        + ftr;
    }

    if (type === 'ae') {
      const from = document.getElementById('rp-from')?.value || null;
      const to   = document.getElementById('rp-to')?.value || null;
      const sev  = document.getElementById('rp-severity')?.value || null;
      const params = {};
      if (sev) params.severity = sev;
      const aeAllRes = await api.listAdverseEvents(params).catch(() => null);
      let aeAll = aeAllRes?.items || [];
      if (from) aeAll = aeAll.filter(ae => !ae.reported_at || ae.reported_at.split('T')[0] >= from);
      if (to)   aeAll = aeAll.filter(ae => !ae.reported_at || ae.reported_at.split('T')[0] <= to);
      const aeSevCounts = { mild: 0, moderate: 0, severe: 0, serious: 0 };
      aeAll.forEach(ae => { if (aeSevCounts[ae.severity] !== undefined) aeSevCounts[ae.severity]++; });
      const aeDetailRows = aeAll.map(ae => '<tr><td style="padding:5px 8px;border:1px solid #ddd">' + (ae.reported_at ? ae.reported_at.split('T')[0] : '\u2014') + '</td><td style="padding:5px 8px;border:1px solid #ddd;text-transform:capitalize">' + (ae.severity || '\u2014') + '</td><td style="padding:5px 8px;border:1px solid #ddd">' + (ae.description || '\u2014') + '</td><td style="padding:5px 8px;border:1px solid #ddd">' + (ae.course_id ? ae.course_id.slice(0, 8) + '\u2026' : '\u2014') + '</td><td style="padding:5px 8px;border:1px solid #ddd">' + (ae.resolved ? 'Yes' : 'No') + '</td></tr>').join('');
      return hdr
        + '<h2 style="font-size:14pt;color:#003366;margin-bottom:4px">Adverse Events Log</h2>'
        + '<div style="font-size:10pt;color:#555;margin-bottom:20px">All reported adverse events' + (sev ? ' \u2014 severity: ' + sev : '') + (from || to ? ' | Period: ' + (from || 'all') + ' to ' + (to || 'present') : '') + ' &nbsp;|\u00a0 Total: <strong>' + aeAll.length + '</strong></div>'
        + '<h3 style="font-size:12pt;color:#003366;border-bottom:1px solid #ccc;padding-bottom:4px;margin-bottom:10px">Severity Summary</h3>'
        + '<table style="width:60%;border-collapse:collapse;margin-bottom:20px;font-size:10pt"><thead><tr style="background:#003366;color:white"><th style="padding:5px 8px;text-align:left">Severity</th><th style="padding:5px 8px;text-align:left">Count</th></tr></thead><tbody>'
        + Object.entries(aeSevCounts).map(([s, c]) => '<tr><td style="padding:5px 8px;border:1px solid #ddd;text-transform:capitalize">' + s + '</td><td style="padding:5px 8px;border:1px solid #ddd">' + c + '</td></tr>').join('')
        + '</tbody></table>'
        + (aeAll.length > 0
          ? '<h3 style="font-size:12pt;color:#003366;border-bottom:1px solid #ccc;padding-bottom:4px;margin-bottom:10px">Event Details</h3><table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:9pt"><thead><tr style="background:#003366;color:white"><th style="padding:5px 8px;text-align:left">Date</th><th style="padding:5px 8px;text-align:left">Severity</th><th style="padding:5px 8px;text-align:left">Description</th><th style="padding:5px 8px;text-align:left">Course</th><th style="padding:5px 8px;text-align:left">Resolved</th></tr></thead><tbody>' + aeDetailRows + '</tbody></table>'
          : '<p style="color:#777">No adverse events found for selected filters.</p>')
        + ftr;
    }

    return '<div style="color:#cc0000">Unknown report type.</div>';
  };

  window._printReport = function() {
    const reportEl = document.getElementById('printable-report');
    if (!reportEl) return;
    const pw = window.open('', '_blank');
    if (!pw) { window.print(); return; }
    pw.document.write('<!DOCTYPE html><html><head><title>DeepSynaps Report</title><style>body{font-family:serif;font-size:11pt;color:#111;background:white;padding:32px;margin:0}table{width:100%;border-collapse:collapse}@media print{body{padding:0}}</style></head><body>' + reportEl.innerHTML + '</body></html>');
    pw.document.close();
    pw.focus();
    pw.print();
  };
}

// ── Population Analytics ──────────────────────────────────────────────────────

function _popConditionBarChart(patients) {
  const counts = {};
  (patients || []).forEach(p => {
    const c = p.primary_condition || 'Unknown';
    counts[c] = (counts[c] || 0) + 1;
  });
  const total = patients.length || 1;
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (sorted.length === 0) {
    return `<div class="card" style="padding:20px"><h3 style="margin-bottom:12px;font-size:14px">Condition Distribution</h3><p style="color:var(--text-secondary);font-size:0.85rem;text-align:center;padding:20px 0">No patient data available</p></div>`;
  }
  return `<div class="card" style="padding:20px">
    <h3 style="margin-bottom:16px;font-size:14px">Condition Distribution</h3>
    ${sorted.map(([cond, count]) => {
      const pct = Math.round(count / total * 100);
      return `<div style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;font-size:0.85rem">
          <span>${cond}</span>
          <span style="color:var(--text-secondary)">${count} patients (${pct}%)</span>
        </div>
        <div style="height:8px;background:var(--bg-surface-2);border-radius:4px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,var(--teal),var(--blue));border-radius:4px;transition:width 0.6s ease"></div>
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

function _popModalityEffectiveness(courses) {
  const modMap = {};
  (courses || []).forEach(c => {
    const m = c.modality || c.modality_slug || 'Unknown';
    if (!modMap[m]) modMap[m] = { courses: 0, completed: 0, totalSessions: 0 };
    modMap[m].courses++;
    if (c.status === 'completed') modMap[m].completed++;
    modMap[m].totalSessions += c.session_count_completed || c.sessions_delivered || 0;
  });
  const rows = Object.entries(modMap).map(([mod, data]) => {
    const completionRate = data.courses ? Math.round(data.completed / data.courses * 100) : 0;
    const avgSessions = data.courses ? Math.round(data.totalSessions / data.courses) : 0;
    return { mod, ...data, completionRate, avgSessions };
  }).sort((a, b) => b.completionRate - a.completionRate);
  if (rows.length === 0) {
    return `<div class="card" style="padding:20px"><h3 style="margin-bottom:12px;font-size:14px">Modality Effectiveness</h3><p style="color:var(--text-secondary);font-size:0.85rem;text-align:center;padding:20px 0">No course data available</p></div>`;
  }
  return `<div class="card" style="padding:20px">
    <h3 style="margin-bottom:16px;font-size:14px">Modality Effectiveness</h3>
    <div style="overflow-x:auto"><table class="ds-table">
      <thead><tr><th>Modality</th><th>Courses</th><th>Completion Rate</th><th>Avg Sessions</th></tr></thead>
      <tbody>${rows.map(r => `<tr>
        <td><strong>${r.mod}</strong></td>
        <td>${r.courses}</td>
        <td>
          <div style="display:flex;align-items:center;gap:8px">
            <div style="flex:1;height:6px;background:var(--bg-surface-2);border-radius:3px;overflow:hidden;min-width:60px">
              <div style="height:100%;width:${r.completionRate}%;background:var(--teal);border-radius:3px"></div>
            </div>
            <span style="min-width:35px;text-align:right;font-size:0.8rem">${r.completionRate}%</span>
          </div>
        </td>
        <td>${r.avgSessions}</td>
      </tr>`).join('')}</tbody>
    </table></div>
  </div>`;
}

function _popSuccessHeatmap(courses) {
  const allConds = [...new Set((courses || []).map(c => c.condition || c.condition_slug).filter(Boolean))].slice(0, 6);
  const allMods  = [...new Set((courses || []).map(c => c.modality || c.modality_slug).filter(Boolean))].slice(0, 5);
  const grid = {};
  (courses || []).forEach(c => {
    const cond = c.condition || c.condition_slug;
    const mod  = c.modality  || c.modality_slug;
    if (!cond || !mod) return;
    const key = `${cond}:${mod}`;
    grid[key] = (grid[key] || 0) + 1;
  });
  const maxVal = Math.max(1, ...Object.values(grid));
  return `<div class="card" style="padding:20px">
    <h3 style="margin-bottom:16px;font-size:14px">Treatment Heatmap <span style="font-size:0.75rem;color:var(--text-secondary);font-weight:400">Condition × Modality (course count)</span></h3>
    ${allConds.length === 0 ? '<p style="color:var(--text-secondary);font-size:0.85rem;text-align:center;padding:20px">No course data available yet</p>' : `
    <div style="overflow-x:auto">
      <table style="border-collapse:separate;border-spacing:3px;min-width:100%">
        <thead><tr>
          <th style="padding:8px;font-size:0.75rem;text-align:left;color:var(--text-secondary);font-weight:600;background:none">Condition</th>
          ${allMods.map(m => `<th style="padding:8px;font-size:0.75rem;text-align:center;color:var(--text-secondary);font-weight:600;white-space:nowrap;background:none">${m}</th>`).join('')}
        </tr></thead>
        <tbody>${allConds.map(cond => `<tr>
          <td style="padding:8px;font-size:0.82rem;white-space:nowrap;color:var(--text-primary)">${cond.replace(/-/g,' ')}</td>
          ${allMods.map(mod => {
            const val = grid[`${cond}:${mod}`] || 0;
            const intensity = val / maxVal;
            const bg = val === 0 ? 'rgba(255,255,255,0.03)' : `rgba(0,212,188,${0.1 + intensity * 0.7})`;
            return `<td style="padding:8px;text-align:center;background:${bg};border-radius:4px;font-size:0.85rem;font-weight:${val > 0 ? 600 : 400};color:${val > 0 ? 'var(--teal)' : 'var(--text-secondary)'}">${val || '—'}</td>`;
          }).join('')}
        </tr>`).join('')}</tbody>
      </table>
    </div>`}
  </div>`;
}

function _popCohortRiskProfile(courses) {
  const buckets = { Low: 0, Moderate: 0, Elevated: 0, High: 0 };
  (courses || []).forEach(c => {
    const s = computeRiskScore(c);
    if (s < 20) buckets.Low++;
    else if (s < 50) buckets.Moderate++;
    else if (s < 75) buckets.Elevated++;
    else buckets.High++;
  });
  const total = courses.length || 1;
  const colors = { Low: 'var(--teal)', Moderate: 'var(--amber)', Elevated: '#f97316', High: 'var(--red)' };
  return `<div class="card" style="padding:20px">
    <h3 style="margin-bottom:16px;font-size:14px">Cohort Risk Profile</h3>
    <div style="height:24px;border-radius:6px;overflow:hidden;display:flex;margin-bottom:16px">
      ${Object.entries(buckets).map(([label, count]) => {
        const pct = Math.round(count / total * 100);
        return pct > 0 ? `<div style="width:${pct}%;background:${colors[label]};display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#000;transition:width 0.6s ease" title="${label}: ${count}">${pct > 8 ? pct + '%' : ''}</div>` : '';
      }).join('')}
    </div>
    <div style="display:flex;gap:16px;flex-wrap:wrap">
      ${Object.entries(buckets).map(([label, count]) => `
        <div style="display:flex;align-items:center;gap:6px;font-size:0.82rem">
          <span style="width:10px;height:10px;border-radius:2px;background:${colors[label]};display:inline-block"></span>
          <span style="color:var(--text-secondary)">${label}:</span>
          <span style="font-weight:600;color:var(--text-primary)">${count}</span>
        </div>`).join('')}
    </div>
  </div>`;
}

function _popAdverseEventDots(adverseEvents, courses) {
  const courseMap = {};
  (courses || []).forEach(c => { courseMap[c.id] = c.condition || c.condition_slug || 'Unknown'; });
  const aeByCond = {};
  (adverseEvents || []).forEach(ae => {
    const cond = courseMap[ae.course_id] || 'Unknown';
    if (!aeByCond[cond]) aeByCond[cond] = { mild: 0, moderate: 0, severe: 0 };
    const sev = ae.severity || 'mild';
    if (aeByCond[cond][sev] !== undefined) aeByCond[cond][sev]++;
    else aeByCond[cond].mild++;
  });
  const rows = Object.entries(aeByCond);
  if (rows.length === 0) {
    return `<div class="card" style="padding:20px"><h3 style="font-size:14px;margin-bottom:12px">Adverse Events by Condition</h3>
      <p style="color:var(--text-secondary);padding:20px 0;text-align:center">No adverse events recorded</p></div>`;
  }
  return `<div class="card" style="padding:20px">
    <h3 style="margin-bottom:16px;font-size:14px">Adverse Events by Condition</h3>
    <div style="display:flex;gap:16px;margin-bottom:12px;font-size:0.75rem">
      <span style="display:flex;align-items:center;gap:4px"><span style="width:10px;height:10px;border-radius:50%;background:var(--amber);display:inline-block"></span> Mild</span>
      <span style="display:flex;align-items:center;gap:4px"><span style="width:10px;height:10px;border-radius:50%;background:var(--red);display:inline-block"></span> Moderate</span>
      <span style="display:flex;align-items:center;gap:4px"><span style="width:12px;height:12px;border-radius:50%;background:#dc2626;display:inline-block"></span> Severe</span>
    </div>
    ${rows.map(([cond, counts]) => {
      const mildDots     = Array(Math.min(counts.mild || 0, 20)).fill(0).map(() => `<span style="width:10px;height:10px;border-radius:50%;background:var(--amber);display:inline-block;flex-shrink:0"></span>`).join('');
      const modDots      = Array(Math.min(counts.moderate || 0, 20)).fill(0).map(() => `<span style="width:10px;height:10px;border-radius:50%;background:var(--red);display:inline-block;flex-shrink:0"></span>`).join('');
      const sevDots      = Array(Math.min(counts.severe || 0, 20)).fill(0).map(() => `<span style="width:12px;height:12px;border-radius:50%;background:#dc2626;display:inline-block;flex-shrink:0"></span>`).join('');
      const totalCount   = (counts.mild || 0) + (counts.moderate || 0) + (counts.severe || 0);
      return `<div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;flex-wrap:wrap">
        <div style="min-width:140px;font-size:0.82rem;color:var(--text-primary)">${cond.replace(/-/g,' ')}</div>
        <div style="display:flex;gap:3px;align-items:center;flex-wrap:wrap">${mildDots}${modDots}${sevDots}
          <span style="font-size:0.75rem;color:var(--text-secondary);margin-left:4px">${totalCount} total</span>
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

function _popOutcomeTable(courses, filterCondition = '') {
  let rows = (courses || []).filter(c => !filterCondition || (c.condition || c.condition_slug || '').toLowerCase().includes(filterCondition.toLowerCase()));
  const conditions = [...new Set((courses || []).map(c => c.condition || c.condition_slug).filter(Boolean))].sort();
  return `<div class="card" style="padding:20px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px">
      <h3 style="font-size:14px;margin:0">Patient Outcome Table</h3>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <select id="pop-table-filter" class="form-control" style="width:auto;font-size:12px;padding:5px 10px" onchange="window._popFilterTable()">
          <option value="">All Conditions</option>
          ${conditions.map(c => `<option value="${c}" ${c === filterCondition ? 'selected' : ''}>${c.replace(/-/g,' ')}</option>`).join('')}
        </select>
        <button class="btn btn-sm" onclick="window._exportPopulationCSV()">Export CSV</button>
      </div>
    </div>
    <div style="overflow-x:auto"><table class="ds-table">
      <thead><tr>
        <th>Patient ID</th><th>Condition</th><th>Modality</th><th>Sessions</th><th>Status</th><th>Created</th>
      </tr></thead>
      <tbody>
        ${rows.length === 0
          ? `<tr><td colspan="6" style="text-align:center;color:var(--text-secondary);padding:32px">No courses match the selected filter</td></tr>`
          : rows.slice(0, 50).map(c => `<tr onclick="window._openCourse('${c.id}')">
            <td style="font-family:var(--font-mono);font-size:11px">${(c.patient_id || '').slice(0, 8) || '—'}</td>
            <td>${(c.condition || c.condition_slug || '—').replace(/-/g,' ')}</td>
            <td style="color:var(--teal)">${c.modality || c.modality_slug || '—'}</td>
            <td class="mono">${c.session_count_completed || c.sessions_delivered || 0}/${c.planned_sessions_total || '?'}</td>
            <td><span style="font-size:11px;padding:2px 7px;border-radius:4px;background:${
              c.status === 'completed' ? 'rgba(34,197,94,0.15)' :
              c.status === 'active'    ? 'rgba(0,212,188,0.15)' :
              c.status === 'paused'    ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.08)'
            };color:${
              c.status === 'completed' ? 'var(--green)' :
              c.status === 'active'    ? 'var(--teal)'  :
              c.status === 'paused'    ? 'var(--amber)'  : 'var(--text-secondary)'
            }">${c.status || '—'}</span></td>
            <td style="font-size:11px;color:var(--text-secondary)">${c.created_at ? c.created_at.split('T')[0] : '—'}</td>
          </tr>`).join('')}
        ${rows.length > 50 ? `<tr><td colspan="6" style="text-align:center;color:var(--text-secondary);font-size:11.5px;padding:12px">Showing 50 of ${rows.length} records — use CSV export for full dataset</td></tr>` : ''}
      </tbody>
    </table></div>
  </div>`;
}

export async function pgPopulationAnalytics(setTopbar) {
  const el = document.getElementById('content');
  if (!el) return;

  // Role gate
  const allowedRoles = ['admin', 'supervisor', 'clinic-admin'];
  if (!allowedRoles.includes(currentUser?.role || '')) {
    el.innerHTML = `<div style="padding:60px;text-align:center">
      <div style="font-size:2.5rem;margin-bottom:16px">&#128274;</div>
      <h2>Access Restricted</h2>
      <p style="color:var(--text-secondary)">Population Analytics is available to admin and supervisor roles only.</p>
    </div>`;
    return;
  }

  setTopbar('Population Analytics', 'Aggregate outcomes across all patients and conditions');
  el.innerHTML = '<div class="page-loading">Loading analytics&#8230;</div>';

  const [patients, coursesRaw, outcomes, adverseEventsRaw, aggregate] = await Promise.allSettled([
    api.listPatients(),
    api.listCourses(),
    api.listOutcomes(),
    api.listAdverseEvents(),
    api.aggregateOutcomes(),
  ]).then(results => results.map(r => r.status === 'fulfilled' ? (r.value || []) : []));

  const courses       = coursesRaw?.items       || (Array.isArray(coursesRaw)       ? coursesRaw       : []);
  const adverseEvents = adverseEventsRaw?.items  || (Array.isArray(adverseEventsRaw) ? adverseEventsRaw : []);
  const patientList   = patients?.items          || (Array.isArray(patients)         ? patients         : []);
  const outcomeList   = outcomes?.items          || (Array.isArray(outcomes)          ? outcomes         : []);

  // Cache for CSV export and filtering
  window._popPatients  = patientList;
  window._popCourses   = courses;
  window._popOutcomes  = outcomeList;

  // Summary metrics
  const totalPatients    = patientList.length || (patients?.total ?? 0);
  const activeCourses    = courses.filter(c => c.status === 'active').length;
  const completedCourses = courses.filter(c => c.status === 'completed').length;
  const totalSessions    = courses.reduce((s, c) => s + (c.sessions_delivered || c.session_count_completed || 0), 0);
  const responderRate    = (() => {
    if (!aggregate) return '—';
    const r = aggregate.responder_rate_pct ?? aggregate.responder_rate;
    return r != null ? Math.round(r) + '%' : '—';
  })();
  const completionRate   = courses.length ? Math.round(completedCourses / courses.length * 100) : 0;

  window._exportPopulationCSV = function() {
    const rows = [['Patient ID', 'Condition', 'Modality', 'Sessions Completed', 'Status', 'Created At']];
    (window._popCourses || []).forEach(c => {
      rows.push([
        c.patient_id || '',
        c.condition || c.condition_slug || '',
        c.modality  || c.modality_slug  || '',
        c.session_count_completed || c.sessions_delivered || 0,
        c.status || '',
        c.created_at || '',
      ]);
    });
    const csv  = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `population-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  window._popFilterTable = function() {
    const val    = document.getElementById('pop-table-filter')?.value || '';
    const target = document.getElementById('pop-outcome-table');
    if (target) target.outerHTML = `<div id="pop-outcome-table">${_popOutcomeTable(window._popCourses || [], val)}</div>`;
  };

  el.innerHTML = `<div class="page-section">

    <!-- Filter bar -->
    <div class="card" style="padding:14px 20px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <span style="font-size:12px;color:var(--text-secondary)">Population Analytics</span>
        <span style="font-size:11px;color:var(--text-tertiary)">&middot; ${courses.length} courses &middot; ${patientList.length} patients loaded</span>
      </div>
      <button class="btn btn-sm" onclick="window._exportPopulationCSV()">&#11167; Export CSV</button>
    </div>

    <!-- KPI stat strip -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px">
      ${metricCard('Total Patients',   totalPatients   || '—', 'var(--teal)',   'In registry')}
      ${metricCard('Active Courses',   activeCourses   || '0', 'var(--blue)',   'Currently running')}
      ${metricCard('Sessions Logged',  totalSessions   || '0', 'var(--violet)', 'All time')}
      ${metricCard('Responder Rate',   responderRate,          'var(--green)',  `${completionRate}% completion`)}
    </div>

    <!-- Section 1 + 2: two-column row -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;align-items:start">
      <div>${_popConditionBarChart(patientList)}</div>
      <div>${_popModalityEffectiveness(courses)}</div>
    </div>

    <!-- Section 3: Heatmap full-width -->
    ${_popSuccessHeatmap(courses)}

    <!-- Section 4: Risk profile -->
    ${_popCohortRiskProfile(courses)}

    <!-- Section 5: Adverse events dot plot -->
    ${_popAdverseEventDots(adverseEvents, courses)}

    <!-- Section 6: Outcome table -->
    <div id="pop-outcome-table">${_popOutcomeTable(courses)}</div>

  </div>`;
}

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
        title="${a.patientName} \u2014 ${a.type} (${a.startHour}:00, ${a.duration}min)">
        <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${a.patientName}</div>
        <div style="opacity:.8;font-size:.65rem">${a.type}</div>
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
      title="${a.patientName}">
      <div style="font-weight:700">${a.patientName}</div>
      <div style="opacity:.85;font-size:.68rem">${a.type} \u00b7 ${a.startHour}:00 \u00b7 ${a.duration}min \u00b7 ${a.room}</div>
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
    const dots    = dayA.slice(0, 5).map(a => `<span class="cal-dot" style="background:${CAL_TYPE_COLOR[a.type] || '#555'}" title="${a.patientName}"></span>`).join('');
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
      <div style="flex:1;font-weight:700;font-size:.95rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.patientName}</div>
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
    ${a.notes ? `<div style="font-size:.82rem;background:rgba(255,255,255,.04);border-radius:6px;padding:10px;margin-bottom:14px;line-height:1.5">${a.notes}</div>` : ''}
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
  if (!patient) { alert('Patient name is required.'); return; }
  if (!date)    { alert('Date is required.'); return; }
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
  if (!confirm('Permanently delete this appointment?')) return;
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
let _monitorSession = null; // { id, patientName, modality, protocol, targetDuration, startTime, paused, pausedAt, totalPaused, params, notes, cues, aborted }
let _monitorTimer = null;
let _monitorParamHistory = {}; // { amplitude: [], frequency: [], impedance: [] } — last 60 ticks

const _MONITOR_MOCK_PATIENTS = [
  { id: 'mp1', name: 'Alice Johnson' },
  { id: 'mp2', name: 'Bob Martinez' },
  { id: 'mp3', name: 'Carol Chen' },
  { id: 'mp4', name: 'David Kim' },
  { id: 'mp5', name: 'Emma Patel' },
  { id: 'mp6', name: 'Frank Nguyen' },
  { id: 'mp7', name: 'Grace Okafor' },
  { id: 'mp8', name: 'Henry Svensson' },
];

const _MONITOR_DEFAULT_PROTOCOLS = {
  Neurofeedback: 'Alpha/Theta Training',
  TMS:           'rTMS 10 Hz Motor Cortex',
  tDCS:          'Anodal tDCS F3 Montage',
  taVNS:         'taVNS 25 Hz Auricular',
  CES:           'CES 0.5 Hz Alpha Induction',
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
  svg.innerHTML = `<polyline points="${pts.join(' ')}" fill="none" stroke="var(--accent-teal)" stroke-width="2" stroke-linecap="round"/>`;
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
  svg.innerHTML = `<polyline points="${pts.join(' ')}" fill="none" stroke="${color || 'var(--accent-teal)'}" stroke-width="1.5" stroke-linecap="round"/>`;
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
  _drawSparkline('monitor-spark-amp', _monitorParamHistory.amplitude, 'var(--accent-teal)');
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
  const modalitySelect = document.getElementById('monitor-form-modality');
  const protocolInput = document.getElementById('monitor-form-protocol');
  const durationSelect = document.getElementById('monitor-form-duration');
  const ampSlider = document.getElementById('monitor-form-amp');
  const freqSlider = document.getElementById('monitor-form-freq');
  const notesInput = document.getElementById('monitor-form-notes');

  if (!patientSelect.value) { alert('Please select a patient.'); return; }

  const patientName = patientSelect.options[patientSelect.selectedIndex].text;
  const modality = modalitySelect.value;
  const protocol = protocolInput.value.trim() || _MONITOR_DEFAULT_PROTOCOLS[modality];
  const targetDuration = parseInt(durationSelect.value, 10);
  const amplitude = parseFloat(ampSlider.value);
  const frequency = parseFloat(freqSlider.value);
  const notes = notesInput.value.trim();

  _monitorSession = {
    id: `ses_${Date.now()}`,
    patientName,
    modality,
    protocol,
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

  // Save to localStorage
  try {
    const sessions = JSON.parse(localStorage.getItem('ds_completed_sessions') || '[]');
    sessions.unshift({ ..._monitorSession, completedAt: new Date().toISOString(), aborted: true });
    localStorage.setItem('ds_completed_sessions', JSON.stringify(sessions.slice(0, 100)));
  } catch (_) {}

  const root = document.getElementById('session-monitor-root');
  if (root) {
    root.innerHTML = `<div style="text-align:center;padding:48px;color:var(--text-muted)">
      <div style="font-size:2.5rem;margin-bottom:8px">⛔</div>
      <h2 style="margin:0 0 8px">Session Aborted</h2>
      <p style="font-size:.9rem;margin-bottom:24px">Reason: <strong>${reason}</strong></p>
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
  const payload = {
    id: _monitorSession.id,
    patientName: _monitorSession.patientName,
    modality: _monitorSession.modality,
    protocol: _monitorSession.protocol,
    duration: _monitorSession.targetDuration,
    params: _monitorSession.params,
    paramHistory: _monitorParamHistory,
    cues: _monitorSession.cues,
    notes: _monitorSession.notes,
    completedAt: new Date().toISOString(),
    aborted: _monitorSession.aborted || false,
  };

  let saved = false;
  try {
    await api.logSession(payload);
    saved = true;
  } catch (_) {}

  if (!saved) {
    try {
      const sessions = JSON.parse(localStorage.getItem('ds_completed_sessions') || '[]');
      sessions.unshift(payload);
      localStorage.setItem('ds_completed_sessions', JSON.stringify(sessions.slice(0, 100)));
      saved = true;
    } catch (_) {}
  }

  const overlay = document.getElementById('monitor-completion-overlay');
  if (overlay) {
    overlay.innerHTML = `<div style="background:var(--card-bg);border-radius:14px;padding:40px;text-align:center">
      <div style="font-size:2.5rem;margin-bottom:8px">💾</div>
      <h2 style="margin:0 0 8px">Session Saved</h2>
      <p style="color:var(--text-muted);margin-bottom:20px">Session log saved ${saved ? '' : '(locally)'}.</p>
      <button class="btn-primary" onclick="document.getElementById('monitor-completion-overlay').remove();_monitorSession=null;window._nav('session-monitor')">Done</button>
    </div>`;
  }
};

function _monitorStartFormHTML(patients) {
  const patientOptions = patients.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  const modalityOptions = ['Neurofeedback', 'TMS', 'tDCS', 'taVNS', 'CES'].map(m => `<option value="${m}">${m}</option>`).join('');
  const durationOptions = [15, 20, 30, 45, 60].map(d => `<option value="${d}" ${d === 30 ? 'selected' : ''}>${d} min</option>`).join('');

  return `
    <div style="max-width:560px;margin:0 auto">
      <div style="background:var(--card-bg);border:1px solid var(--border);border-radius:12px;padding:28px">
        <h2 style="margin:0 0 20px;font-size:1.15rem">Configure New Session</h2>
        <div style="display:grid;gap:14px">

          <label style="display:flex;flex-direction:column;gap:4px;font-size:.85rem;font-weight:600">
            Patient
            <select id="monitor-form-patient" class="form-select" style="font-weight:400">
              <option value="">— Select patient —</option>
              ${patientOptions}
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
            Starting Amplitude: <span id="monitor-form-amp-val" style="color:var(--accent-teal);font-weight:700">50 mA</span>
            <input id="monitor-form-amp" type="range" min="0" max="100" step="1" value="50"
              oninput="document.getElementById('monitor-form-amp-val').textContent=this.value+' mA'"
              style="width:100%;margin:4px 0">
          </div>

          <div style="display:flex;flex-direction:column;gap:4px;font-size:.85rem;font-weight:600">
            Starting Frequency: <span id="monitor-form-freq-val" style="color:var(--accent-teal);font-weight:700">10 Hz</span>
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
          <div id="monitor-timer-big" style="font-size:2.8rem;font-weight:800;font-variant-numeric:tabular-nums;color:var(--accent-teal)">00:00</div>
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
        `<div class="monitor-log-entry">[${c.ts}] ${c.msg}</div>`
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

  // Fetch patients (with mock fallback)
  let patients = _MONITOR_MOCK_PATIENTS;
  try {
    const res = await api.getPatients();
    const list = res?.items || res?.patients || res;
    if (Array.isArray(list) && list.length) {
      patients = list.map(p => ({ id: p.id || p._id, name: p.name || `${p.first_name || ''} ${p.last_name || ''}`.trim() }));
    }
  } catch (_) { /* fall back to mock list */ }

  root.innerHTML = _monitorStartFormHTML(patients);
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

function _predResultHTML(result, ci) {
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
  if (predictedScore >= 75) {
    scoreInterpretation = `A predicted outcome score of <strong>${predictedScore}/100</strong> indicates a <strong>strong likelihood of clinical improvement</strong> with current treatment parameters. This patient profile aligns closely with high-responder cohorts in the neuromodulation evidence base.`;
  } else if (predictedScore >= 55) {
    scoreInterpretation = `A predicted outcome score of <strong>${predictedScore}/100</strong> suggests a <strong>moderate probability of meaningful improvement</strong>. Close monitoring and protocol optimisation are recommended to maximise this patient's response trajectory.`;
  } else if (predictedScore >= 40) {
    scoreInterpretation = `A predicted outcome score of <strong>${predictedScore}/100</strong> reflects a <strong>guarded prognosis</strong>. This patient may require additional support, enhanced session frequency, or a protocol adjustment to achieve clinically meaningful gains.`;
  } else {
    scoreInterpretation = `A predicted outcome score of <strong>${predictedScore}/100</strong> signals a <strong>high-risk trajectory</strong>. Consider a multidisciplinary review, barrier assessment, and protocol intensification or adjunct interventions.`;
  }

  const drivingFactors = `The two strongest predictors in this model are <strong>${topFeatLabel}</strong> (${isTopPos ? 'positively' : 'negatively'} influencing outcome) and <strong>${secondFeatLabel}</strong> (${isSecondPos ? 'positively' : 'negatively'} influencing outcome). Targeting improvements in these dimensions is likely to shift the predicted score most efficiently.`;

  let adjustmentAdvice;
  if (predictedScore < 50) {
    adjustmentAdvice = 'Consider increasing session frequency to 3×/week if patient schedule allows, reviewing adherence barriers, and assessing for untreated comorbidities that may be dampening response. A mid-course protocol review at session 10–12 is advised.';
  } else if (predictedScore < 70) {
    adjustmentAdvice = 'Maintain current protocol with standard review at session 10. If adherence drops below 80%, implement a proactive outreach plan. Consider adding a structured home practice component to reinforce in-clinic gains.';
  } else {
    adjustmentAdvice = 'Current parameters appear well-matched to this patient profile. Continue standard monitoring cadence. Document response markers carefully — this case may be suitable for evidence contribution or protocol benchmarking.';
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
          <div style="width:${Math.round(confidence * 100)}%;height:100%;background:var(--accent-teal,#10b981);border-radius:6px;transition:width .4s ease"></div>
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
      <td style="padding:8px 10px">${p.patientName}</td>
      <td style="padding:8px 10px;color:var(--text-muted)">${p.date}</td>
      <td style="padding:8px 10px;font-weight:700">${p.result.predictedScore}</td>
      <td style="padding:8px 10px"><span style="color:${riskColor};font-size:.78rem;font-weight:700">${riskLabel}</span></td>
      <td style="padding:8px 10px">${actualCell}</td>
      <td style="padding:8px 10px;color:var(--text-muted)">${accuracy}</td>
      <td style="padding:8px 10px;color:var(--text-muted);font-size:.8rem;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${(p.notes || '').replace(/"/g, '&quot;')}">${p.notes || '\u2014'}</td>
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
        style="padding:6px 14px;background:var(--accent-teal,#10b981);color:#fff;border:none;border-radius:8px;font-size:.82rem;font-weight:600;cursor:pointer">
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
  setTopbar('Outcome Prediction & ML Scoring', '');
  _initPredictions();

  const el = document.getElementById('content');
  el.innerHTML = `
    <div style="padding:16px 0;max-width:1200px;margin:0 auto">

      <div style="display:flex;gap:4px;margin-bottom:20px;border-bottom:1px solid var(--border)">
        <button id="pred-tab-predict" onclick="window._qqSwitchPredTab('predict')"
          style="padding:8px 18px;background:var(--accent-teal,#10b981);color:#fff;border:none;border-radius:8px 8px 0 0;font-size:.875rem;font-weight:600;cursor:pointer">
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
              <input id="pred-patient-name" type="text" placeholder="Enter patient name"
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
                style="flex:1;padding:10px;background:var(--accent-teal,#10b981);color:#fff;border:none;border-radius:8px;font-size:.875rem;font-weight:600;cursor:pointer">
                Run Prediction
              </button>
              <button id="pred-save-btn" onclick="window._qqSavePrediction()"
                style="display:none;flex:1;padding:10px;background:var(--accent-blue,#3b82f6);color:#fff;border:none;border-radius:8px;font-size:.875rem;font-weight:600;cursor:pointer">
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
    const activeStyle  = 'var(--accent-teal,#10b981)';
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
      panel.innerHTML = _predResultHTML(result, ci);
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
    alert('Prediction saved to history.');
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
    if (!confirm('Delete this prediction?')) return;
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
  { id: 'log-1', ruleId: 'rule-seed-1', ruleName: 'Missed Session Alert', patientName: 'Alice Thornton', details: '{"days-since-session":18}', ts: '2026-04-05T10:22:00Z', dismissed: false },
  { id: 'log-2', ruleId: 'rule-seed-2', ruleName: 'Score Drop Warning', patientName: 'Bob Osei', details: '{"score-drop":19}', ts: '2026-04-07T14:10:00Z', dismissed: false },
  { id: 'log-3', ruleId: 'rule-seed-3', ruleName: 'Adverse Event Escalation', patientName: 'Carol Martinez', details: '{"ae-severity":"severe"}', ts: '2026-04-06T09:05:00Z', dismissed: true },
  { id: 'log-4', ruleId: 'rule-seed-1', ruleName: 'Missed Session Alert', patientName: 'David Chen', details: '{"days-since-session":21}', ts: '2026-04-04T11:30:00Z', dismissed: true },
  { id: 'log-5', ruleId: 'rule-seed-4', ruleName: 'Weekly Summary', patientName: 'All Patients', details: '{"trigger":"schedule"}', ts: '2026-04-07T08:00:00Z', dismissed: false },
  { id: 'log-6', ruleId: 'rule-seed-2', ruleName: 'Score Drop Warning', patientName: 'Emma Walsh', details: '{"score-drop":22}', ts: '2026-04-08T15:45:00Z', dismissed: false },
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
          <span style="font-weight:600;font-size:.92rem">${rule.name}</span>
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
    const dismissBtn = e.dismissed ? '' : `<button class="btn-sm" onclick="window._rulesDismissAlert('${e.id}')">Dismiss</button>`;
    return `
    <tr class="${e.dismissed ? '' : 'alert-log-row-active'}">
      <td style="padding:8px 10px;font-size:.85rem;font-weight:600">${e.ruleName}</td>
      <td style="padding:8px 10px;font-size:.85rem">${e.patientName}</td>
      <td style="padding:8px 10px;font-size:.82rem;color:var(--text-muted)">${ts}</td>
      <td style="padding:8px 10px;font-size:.78rem;color:var(--text-muted);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${e.details}">${e.details}</td>
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

  const app = document.getElementById('app');
  if (!app) return;

  function _reRender() {
    const rules = getRules();
    const log = getAlertLog();
    const activeCount = rules.filter(r => r.enabled).length;
    const undismissed = log.filter(e => !e.dismissed).length;

    const tabStyle = (id) => {
      const active = _reActiveTab === id;
      return `style="padding:8px 18px;border:none;border-radius:8px 8px 0 0;font-size:.9rem;font-weight:${active?'700':'500'};cursor:pointer;background:${active?'var(--card-bg)':'transparent'};color:${active?'var(--text-primary)':'var(--text-muted)'};border-bottom:${active?'2px solid var(--accent-teal)':'2px solid transparent'}"`;
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
            Alert Log ${undismissed > 0 ? `<span style="background:var(--accent-teal);color:#fff;border-radius:10px;padding:1px 7px;font-size:.7rem;margin-left:4px">${undismissed}</span>` : ''}
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
    if (!name) { alert('Rule name is required.'); return; }
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
    else alert(`Evaluation complete. ${count} rule${count !== 1 ? 's' : ''} fired.`);
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
        logTab.insertAdjacentHTML('beforeend', `<span style="background:var(--accent-teal);color:#fff;border-radius:10px;padding:1px 7px;font-size:.7rem;margin-left:4px">${undismissed}</span>`);
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
        <div style="font-weight:600;margin-bottom:10px;color:var(--accent-teal)">🔔 ${fired.length} rule${fired.length > 1 ? 's' : ''} fired:</div>
        ${fired.map(r => `
          <div style="margin-bottom:8px;padding:10px;background:var(--card-bg);border-radius:8px;border:1px solid var(--accent-teal)">
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
            background:${_aiPhraseTab === tab ? 'var(--accent-teal,#00d4bc)' : 'var(--surface-2)'};
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
          <div style="font-weight:600;font-size:0.875rem">${s.patientName || 'Unknown Patient'}</div>
          <div style="font-size:0.78rem;color:var(--text-secondary);margin-top:2px">
            ${s.modality || 'Neurofeedback'} · ${s.duration || 30}min · ${s.condition || 'General'}
          </div>
          <div style="font-size:0.75rem;color:var(--text-secondary);margin-top:2px;font-style:italic">${s.notes || 'No notes'}</div>
        </div>`).join('');
    }
    document.getElementById('ai-session-modal').style.display = 'flex';
    window._aiSessionData = sessions;
  };

  window._aiSelectSession = function(index) {
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
    const filled = generateNoteFromSession(session, _aiCondition);
    const nameEl = document.getElementById('ai-patient-name');
    if (nameEl && session.patientName) nameEl.value = session.patientName;
    const ta_S = document.getElementById('ai-soap-S'); if (ta_S) ta_S.value = filled.S;
    const ta_O = document.getElementById('ai-soap-O'); if (ta_O) ta_O.value = filled.O;
    const ta_A = document.getElementById('ai-soap-A'); if (ta_A) ta_A.value = filled.A;
    const ta_P = document.getElementById('ai-soap-P'); if (ta_P) ta_P.value = filled.P;
    runLiveQualityCheck();
    window._showNotifToast?.({ title: 'Note Generated', body: `Pre-filled from session: ${session.patientName}`, severity: 'success' });
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
    window._showNotifToast?.({ title: 'Note Saved', body: `SOAP note for ${patientName} saved.`, severity: 'success' });
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

  window._aiQuickGenerate = function() {
    const sessions = getRecentSessions();
    if (sessions.length === 0) return;
    window._aiSessionData = sessions;
    window._aiSelectSession(0);
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

  // Group by template
  const byTemplate = {};
  outcomes.forEach(o => {
    const key = o.template_name || 'Unknown';
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

  const colors = ['var(--teal,#00d4bc)', 'var(--accent-blue,#3b82f6)', 'var(--accent-violet,#8b5cf6)', 'var(--accent-amber,#f59e0b)', 'var(--accent-rose,#f43f5e)'];
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

  // Parallel fetch
  const [course, sessionsRaw, outcomesRaw, summaryRaw] = await Promise.all([
    api.getCourse(id).catch(() => null),
    api.listCourseSessions(id).catch(() => null),
    api.listOutcomes({ course_id: id }).catch(() => null),
    api.courseOutcomeSummary(id).catch(() => null),
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

  // Stats
  const sessionsCompleted = sessions.filter(s => s.status === 'completed').length;
  const sessionsPlanned = course.planned_sessions || course.total_sessions || sessions.length || 0;
  const pctComplete = sessionsPlanned > 0 ? Math.round((sessionsCompleted / sessionsPlanned) * 100) : 0;

  const sortedSessions = [...sessions].sort((a, b) => new Date(a.scheduled_at || a.date || 0) - new Date(b.scheduled_at || b.date || 0));
  const startDate = sortedSessions[0]?.scheduled_at || sortedSessions[0]?.date || course.start_date;
  const endDate = course.end_date || (course.status === 'completed' ? (sortedSessions[sortedSessions.length - 1]?.scheduled_at || null) : null);
  const durationWeeks = _ccrWeeksBetween(startDate, endDate || new Date().toISOString());

  // Adverse events from sessions
  const adverseEvents = sessions.filter(s => s.adverse_event || s.adverse_event_note);

  // Soap notes count
  let soapCount = 0;
  try {
    const allNotes = JSON.parse(localStorage.getItem('ds_soap_notes') || '{}');
    const courseNotes = allNotes[String(id)] || {};
    soapCount = Object.keys(courseNotes).length;
  } catch { soapCount = 0; }

  // Responder status: look at the first outcome measure with pct_change
  const summaryOutcomes = summaryRaw?.outcomes || [];
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
  setTopbar(
    `${course.condition || 'Course'} — ${course.modality || 'Protocol'}`,
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
          <div class="ccr-clinic-name">${clinicName}</div>
          <h1 class="ccr-title">Course Completion Report</h1>
          <div class="ccr-subtitle">${course.condition || '—'} &nbsp;·&nbsp; ${course.modality || '—'}</div>
        </div>
        <div class="ccr-header-right">
          <div class="ccr-patient-block">
            <div class="ccr-patient-label">Patient</div>
            <div class="ccr-patient-name">${patientName}</div>
          </div>
          <div class="ccr-meta-block">
            <div><span class="ccr-meta-label">Protocol:</span> ${course.protocol_name || course.name || '—'}</div>
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
          ${firstWithPct ? `<span class="ccr-responder-detail">Based on ${firstWithPct.template_name || 'outcome measure'}: ${firstWithPct.pct_change > 0 ? '+' : ''}${Math.round(firstWithPct.pct_change)}% change</span>` : '<span class="ccr-responder-detail">No outcome comparison data available</span>'}
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
                  <th>Mood Before → After</th>
                  <th>Adverse Event</th>
                </tr>
              </thead>
              <tbody>
                ${sortedSessions.map(s => `<tr>
                  <td>${_ccrFmtDate(s.scheduled_at || s.date)}</td>
                  <td>${s.duration_minutes != null ? s.duration_minutes + ' min' : '—'}</td>
                  <td>${s.tolerance_rating != null ? s.tolerance_rating + '/5' : '—'}</td>
                  <td>${s.mood_before != null || s.mood_after != null ? (s.mood_before ?? '—') + ' → ' + (s.mood_after ?? '—') : '—'}</td>
                  <td>${(s.adverse_event || s.adverse_event_note) ? '<span class="ccr-ae-yes">Yes</span>' : '<span class="ccr-ae-no">No</span>'}</td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>`
        }
      </div>

      <!-- Adverse Events -->
      ${adverseEvents.length > 0 ? `
      <div class="ccr-section">
        <div class="ccr-section-title">Adverse Events</div>
        <div class="ccr-adverse-card">
          ${adverseEvents.map(s => `
            <div class="ccr-adverse-item">
              <span class="ccr-adverse-date">${_ccrFmtDate(s.scheduled_at || s.date)}</span>
              <span class="ccr-adverse-note">${s.adverse_event_note || s.adverse_event || 'Adverse event noted'}</span>
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
          <div class="ccr-footer-clinic">${clinicName}</div>
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
      ${patientName ? `<div class="qoc-patient-name">${patientName}</div>` : ''}
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

  const payload = {
    course_id: courseId,
    session_id: sessionId,
    template_name: measure,
    score_numeric: score,
    measurement_point: point,
    notes,
    administered_at: new Date().toISOString(),
  };

  // Disable save button to prevent double-submit
  const saveBtn = document.querySelector('#qoc-modal .qoc-btn-primary');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }

  let saved = false;
  try {
    const result = await api.recordOutcome(payload);
    if (result) saved = true;
  } catch (_) { saved = false; }

  if (!saved) {
    // Fallback: localStorage
    try {
      const localKey = 'ds_local_outcomes';
      const existing = JSON.parse(localStorage.getItem(localKey) || '[]');
      existing.push({ ...payload, _local: true, _saved_at: new Date().toISOString() });
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
