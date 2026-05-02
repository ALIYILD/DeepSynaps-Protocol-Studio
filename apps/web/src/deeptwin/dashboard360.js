// DeepTwin 360 Dashboard — single doctor-facing rollup of 22 patient
// domains. Calls GET /api/v1/deeptwin/patients/:id/dashboard and renders
// 4 top cards + 22-domain grid + 6 bottom panels. Each domain card shows
// status, record count, latest update, summary, warnings, source links,
// and quick-upload buttons that hand off to existing upload surfaces
// (qEEG analyzer, MRI analyzer, assessments, sessions, devices, etc.).
//
// Honest data only:
// - status comes from the backend (available | partial | missing | unavailable)
// - prediction confidence is "placeholder" until a validated model lands
// - safety + decision-support disclaimers are wired throughout

import { api } from '../api.js';
import { VOICE_DECISION_SUPPORT_SHORT, VOICE_DEEPTWIN_DOMAIN_NOTE } from '../voice-decision-support.js';
import { EVIDENCE_TOTAL_PAPERS } from '../evidence-dataset.js';
import { getDemoPatientHeader } from './mockData.js';

const ESC = (s) => String(s ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

// SVG icons for each domain (20x20 viewBox, stroke-based)
const DOMAIN_ICONS = {
  identity:           '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="6" r="3.5"/><path d="M3 17.5c0-3.5 3-5.5 7-5.5s7 2 7 5.5"/></svg>',
  diagnosis:          '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="5"/><path d="M14 14l3 3"/><path d="M6.5 8h3M8 6.5v3"/></svg>',
  symptoms_goals:     '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="7.5"/><circle cx="10" cy="10" r="4"/><circle cx="10" cy="10" r="1"/></svg>',
  assessments:        '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="12" height="16" rx="2"/><path d="M7 7l2 2 4-4"/><path d="M7 13h6"/></svg>',
  qeeg:               '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 10c1-3 2.5-1 3.5-4s1.5 2 3 0 1.5-5 3-2 1.5 3 3 1 1.5-3 2.5 0"/><ellipse cx="10" cy="13" rx="6" ry="4"/></svg>',
  mri:                '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="7.5"/><path d="M10 2.5v15"/><path d="M5 5c3 2 7 2 10 0"/><path d="M5 15c3-2 7-2 10 0"/></svg>',
  video:              '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="11" height="10" rx="2"/><path d="M13 8l5-2.5v9L13 12"/></svg>',
  voice:              '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="2" width="6" height="10" rx="3"/><path d="M4 10c0 3.3 2.7 6 6 6s6-2.7 6-6"/><path d="M10 16v2"/></svg>',
  text:               '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="2" width="14" height="16" rx="2"/><path d="M6 6h8M6 10h8M6 14h4"/></svg>',
  biometrics:         '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 10h3l2-5 3 10 2-7 2 4h4"/></svg>',
  wearables:          '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4" width="10" height="12" rx="3"/><path d="M8 4V2M12 4V2M8 16v2M12 16v2"/><circle cx="10" cy="9" r="1"/><path d="M10 9v2"/></svg>',
  cognitive_tasks:    '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2H5a2 2 0 00-2 2v4c0 1.1.9 2 2 2h4a2 2 0 002-2V4a2 2 0 00-2-2z"/><path d="M15 10h-4a2 2 0 00-2 2v4c0 1.1.9 2 2 2h4a2 2 0 002-2v-4a2 2 0 00-2-2z"/><path d="M14 3l3 3M3 14l3 3"/></svg>',
  medications:        '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="8" height="16" rx="4"/><path d="M6 10h8"/></svg>',
  labs:               '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v6l-5 8a1.5 1.5 0 001.3 2.2h11.4a1.5 1.5 0 001.3-2.2L12 8V2"/><path d="M6 2h8"/><path d="M5.5 13h9"/></svg>',
  treatment_sessions: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="16" height="14" rx="2"/><path d="M2 7h16"/><path d="M6 1v4M14 1v4"/><path d="M7 11l2 2 4-4"/></svg>',
  safety_flags:       '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 1.5L2 6v5c0 4.4 3.4 8.2 8 9 4.6-.8 8-4.6 8-9V6l-8-4.5z"/><path d="M10 7v4M10 13v1"/></svg>',
  lifestyle:          '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 10a7 7 0 11-14 0"/><path d="M10 3v7l4 3"/><path d="M3 17h14"/></svg>',
  environment:        '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2c-3 0-5.5 3.5-5.5 7.5S7 18 10 18s5.5-5 5.5-8.5S13 2 10 2z"/><path d="M10 2v16"/><path d="M5 7c2 1 5.5 1 10 0"/><path d="M5 13c2-1 5.5-1 10 0"/></svg>',
  caregiver_reports:  '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="5" r="2.5"/><circle cx="14" cy="6" r="2"/><path d="M1 15c0-3 2.5-4.5 6-4.5s4.5 1 5.5 2.5"/><path d="M11 15c0-2 1.5-3 3-3s3 1 3 3"/></svg>',
  clinical_documents: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2H5a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7l-5-5z"/><path d="M12 2v5h5"/><path d="M7 10h6M7 14h3"/></svg>',
  outcomes:           '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l4-6 3 3 4-7 3 4"/><path d="M15 7h3v3"/></svg>',
  twin_predictions:   '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="7.5"/><path d="M10 5v5l3 3"/><path d="M6 3l-1-1.5M14 3l1-1.5"/><circle cx="10" cy="10" r="1" fill="currentColor"/></svg>',
};

// Navigation targets for each domain when clicked
const DOMAIN_NAV = {
  identity:           'patient-profile',
  diagnosis:          'patient-profile',
  symptoms_goals:     'patient-profile',
  assessments:        'assessments',
  qeeg:               'qeeg-analysis',
  mri:                'mri-analysis',
  video:              null,
  voice:              'voice-analyzer',
  text:               null,
  biometrics:         'patient-home-devices',
  wearables:          'patient-home-devices',
  cognitive_tasks:    null,
  medications:        'patient-profile',
  labs:               null,
  treatment_sessions: 'clinical-sessions',
  safety_flags:       'patient-profile',
  lifestyle:          null,
  environment:        null,
  caregiver_reports:  null,
  clinical_documents: 'patient-profile',
  outcomes:           null,
  twin_predictions:   null,
};

// Action label for each domain in the detail panel
const DOMAIN_ACTIONS = {
  identity:           { label: 'Edit patient profile',      icon: 'edit' },
  diagnosis:          { label: 'Edit diagnosis',            icon: 'edit' },
  symptoms_goals:     { label: 'Edit symptoms & goals',     icon: 'edit' },
  assessments:        { label: 'Submit assessment',         icon: 'upload' },
  qeeg:               { label: 'Upload EEG / qEEG',        icon: 'upload' },
  mri:                { label: 'Upload MRI scan',           icon: 'upload' },
  video:              { label: 'Upload video',              icon: 'upload' },
  voice:              { label: 'Upload voice recording',    icon: 'upload' },
  text:               { label: 'Add journal entry',         icon: 'edit' },
  biometrics:         { label: 'Connect biometric device',  icon: 'link' },
  wearables:          { label: 'Connect wearable',          icon: 'link' },
  cognitive_tasks:    { label: 'Not available yet',         icon: 'lock' },
  medications:        { label: 'Edit medications',          icon: 'edit' },
  labs:               { label: 'Not available yet',         icon: 'lock' },
  treatment_sessions: { label: 'Schedule session',          icon: 'calendar' },
  safety_flags:       { label: 'Report adverse event',      icon: 'alert' },
  lifestyle:          { label: 'Add lifestyle data',        icon: 'edit' },
  environment:        { label: 'Not available yet',         icon: 'lock' },
  caregiver_reports:  { label: 'Not available yet',         icon: 'lock' },
  clinical_documents: { label: 'Generate document',         icon: 'edit' },
  outcomes:           { label: 'Add outcome event',         icon: 'edit' },
  twin_predictions:   { label: 'View prediction engine',    icon: 'view' },
};

const STATUS_TONE = {
  available: 'ok',
  partial: 'warn',
  missing: 'low',
  unavailable: 'low',
};

const STATUS_LABEL = {
  available: 'Available',
  partial: 'Partial',
  missing: 'Missing',
  unavailable: 'Not ingested',
};

function _fmtDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    return d.toISOString().slice(0, 10);
  } catch {
    return String(iso).slice(0, 10);
  }
}

function _statusBadge(status) {
  const tone = STATUS_TONE[status] || 'low';
  return `<span class="dt-chip dt-chip--${tone}" data-status="${ESC(status)}">${ESC(STATUS_LABEL[status] || status)}</span>`;
}

const TOP_ICONS = {
  patient: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="6" r="3.5"/><path d="M3 17.5c0-3.5 3-5.5 7-5.5s7 2 7 5.5"/></svg>',
  completeness: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="7.5"/><path d="M10 4v6l4 2"/></svg>',
  safety: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 1.5L2 6v5c0 4.4 3.4 8.2 8 9 4.6-.8 8-4.6 8-9V6l-8-4.5z"/><path d="M7 10l2 2 4-4"/></svg>',
  review: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="12" height="16" rx="2"/><path d="M7 7l2 2 4-4"/><path d="M7 13h6"/></svg>',
};

function _topCardPatient(payload) {
  const s = payload.patient_summary || {};
  const dx = (s.diagnosis || []).join(' · ') || '—';
  return `
    <div class="dt360-top-card">
      <div class="dt360-top-row">
        <div class="dt360-top-icon dt360-top-icon--teal">${TOP_ICONS.patient}</div>
        <div class="dt360-top-h">Patient</div>
      </div>
      <div class="dt360-top-v">${ESC(s.name || payload.patient_id)}</div>
      <div class="dt360-top-sub">Age ${ESC(s.age == null ? '—' : s.age)} · ${ESC(dx)}</div>
      <div class="dt360-top-sub">Risk: <strong>${ESC(s.risk_level || 'unknown')}</strong></div>
    </div>
  `;
}

function _topCardCompleteness(payload) {
  const c = payload.completeness || {};
  const pct = Math.round((c.score || 0) * 100);
  const missing = (c.high_priority_missing || []).join(', ');
  return `
    <div class="dt360-top-card">
      <div class="dt360-top-row">
        <div class="dt360-top-icon dt360-top-icon--blue">${TOP_ICONS.completeness}</div>
        <div class="dt360-top-h">Twin completeness</div>
      </div>
      <div class="dt360-top-v">${pct}%</div>
      <div class="dt360-top-sub">${ESC(c.available_domains || 0)} available · ${ESC(c.partial_domains || 0)} partial · ${ESC(c.missing_domains || 0)} missing</div>
      ${missing ? `<div class="dt360-top-sub" style="color:var(--amber)">High-priority gaps: ${ESC(missing)}</div>` : ''}
    </div>
  `;
}

function _topCardSafety(payload) {
  const s = payload.safety || {};
  const ae = (s.adverse_events || []).length;
  const flags = (s.red_flags || []).length;
  const tone = (ae + flags) > 0 ? 'warn' : 'ok';
  const iconTone = (ae + flags) > 0 ? 'amber' : 'green';
  return `
    <div class="dt360-top-card">
      <div class="dt360-top-row">
        <div class="dt360-top-icon dt360-top-icon--${iconTone}">${TOP_ICONS.safety}</div>
        <div class="dt360-top-h">Safety / risk flags</div>
      </div>
      <div class="dt360-top-v">${ae + flags}</div>
      <div class="dt360-top-sub">${ae} adverse event(s) · ${flags} wearable flag(s)</div>
      <span class="dt-chip dt-chip--${tone}">${(ae + flags) === 0 ? 'No active flags' : 'Review required'}</span>
    </div>
  `;
}

function _topCardReview(payload) {
  const r = payload.review || {};
  const status = r.reviewed ? 'Reviewed' : 'Awaiting clinician review';
  const iconTone = r.reviewed ? 'green' : 'amber';
  return `
    <div class="dt360-top-card">
      <div class="dt360-top-row">
        <div class="dt360-top-icon dt360-top-icon--${iconTone}">${TOP_ICONS.review}</div>
        <div class="dt360-top-h">Clinician review</div>
      </div>
      <div class="dt360-top-v">${ESC(status)}</div>
      <div class="dt360-top-sub">${r.reviewed_by ? `By ${ESC(r.reviewed_by)} · ${_fmtDate(r.reviewed_at)}` : 'Decision-support only · requires clinician review'}</div>
    </div>
  `;
}

function _domainCard(d) {
  const warnings = (d.warnings || []).map(w => `<div class="dt360-warn">${ESC(w)}</div>`).join('');
  const icon = DOMAIN_ICONS[d.key] || '';
  const navTarget = DOMAIN_NAV[d.key];
  const tone = STATUS_TONE[d.status] || 'low';
  return `
    <div class="card dt360-card dt360-card--${tone}" data-domain-key="${ESC(d.key)}" role="button" tabindex="0"
         ${navTarget ? `data-nav-target="${ESC(navTarget)}"` : ''}>
      <div class="dt360-card-h">
        <div class="dt360-card-icon dt360-card-icon--${tone}">${icon}</div>
        <div class="dt360-card-title">
          <span class="dt360-card-label">${ESC(d.label)}</span>
          <div class="dt360-card-meta">
            <span>${ESC(d.record_count)} record(s)</span>
            <span>·</span>
            <span>Updated ${_fmtDate(d.last_updated)}</span>
          </div>
        </div>
        ${_statusBadge(d.status)}
      </div>
      ${d.summary ? `<div class="dt360-card-summary">${ESC(d.summary)}</div>` : ''}
      ${warnings}
      <div class="dt360-card-foot">
        <span class="dt360-card-cta">View details &rarr;</span>
      </div>
    </div>
  `;
}

function _bottomPanel(title, content, opts = {}) {
  return `
    <section class="card dt360-bottom">
      <div class="dt360-bottom-h">${ESC(title)}</div>
      <div class="dt360-bottom-body">${content}</div>
      ${opts.note ? `<div class="dt360-bottom-note">${ESC(opts.note)}</div>` : ''}
    </section>
  `;
}

function _renderTimeline(payload) {
  const events = payload.timeline || [];
  if (!events.length) {
    return `<div class="dt-empty"><p>No timeline events yet. Pull from the DeepTwin v1 timeline endpoint or seed sessions / assessments / qEEG.</p></div>`;
  }
  return events.slice(0, 25).map(e => `
    <div class="dt360-tl-row"><span>${ESC(e.kind || 'event')}</span><span>${ESC(e.label || '')}</span><span>${_fmtDate(e.ts)}</span></div>
  `).join('');
}

function _renderOutcomes(payload) {
  const o = payload.outcomes || {};
  if (!o.series_count && !o.event_count) {
    return `<div class="dt-empty"><p>No outcome series or events on file.</p></div>`;
  }
  return `<div class="dt360-stat-row"><strong>${ESC(o.series_count || 0)}</strong> series · <strong>${ESC(o.event_count || 0)}</strong> events</div>${ESC(o.summary || '')}`;
}

function _renderConfounds(payload) {
  const meds = payload.safety?.medication_confounds || [];
  if (!meds.length) {
    return `<div class="dt-empty"><p>No medication / qEEG confound rules applied yet.</p></div>`;
  }
  return meds.map(m => `<div>${ESC(m.medication || '')}: ${ESC(m.note || '')}</div>`).join('');
}

function _renderCorrelations(payload) {
  const corr = payload.correlations || [];
  if (!corr.length) {
    return `<div class="dt-empty"><p>No correlations computed for this view. Open the DeepTwin Correlations panel.</p></div>`;
  }
  return corr.slice(0, 10).map(c => `
    <div class="dt360-corr-row"><span>${ESC(c.left)} ↔ ${ESC(c.right)}</span><span>r=${ESC(c.strength)} (${ESC(c.confidence || 'low')})</span></div>
  `).join('');
}

function _renderPredictionPanel(payload) {
  const pc = payload.prediction_confidence || {};
  const limits = (pc.limitations || []).map(l => `<li>${ESC(l)}</li>`).join('');
  const warn = !pc.real_ai
    ? `<div class="dt360-warn">⚠ Model is currently a deterministic placeholder. Predictions are uncalibrated.</div>`
    : '';
  return `
    <div class="dt360-pred-head">
      <span class="dt-chip dt-chip--warn">${ESC(pc.confidence_label || 'Not calibrated')}</span>
      <span class="dt-chip dt-chip--low">status: ${ESC(pc.status || 'placeholder')}</span>
      <span class="dt-chip dt-chip--low">real AI: ${pc.real_ai ? 'yes' : 'no'}</span>
    </div>
    <div class="dt360-pred-summary">${ESC(pc.summary || 'Decision-support only. Requires clinician review.')}</div>
    ${warn}
    ${limits ? `<ul class="dt360-pred-limits">${limits}</ul>` : ''}
  `;
}

function _renderClinicianNotes(payload) {
  const notes = payload.clinician_notes || [];
  if (!notes.length) {
    return `<div class="dt-empty"><p>No clinician notes attached to this dashboard view.</p></div>`;
  }
  return notes.slice(0, 25).map(n => `
    <div class="dt360-note-row"><strong>${ESC(n.author || 'Clinician')}</strong> · ${_fmtDate(n.at)}<div>${ESC(n.text || '')}</div></div>
  `).join('');
}

function _renderSafetyFooter() {
  return `
    <div class="dt-safety-footer dt360-footer">
      Decision-support only · Requires clinician review · Correlation does not imply causation ·
      Predictions are uncalibrated unless validated · Not an autonomous treatment recommendation.
    </div>
  `;
}

export function renderDashboard360Skeleton() {
  return `
    <div class="dt360-page" id="dt360-root">
      <div class="dt360-loading">Loading DeepTwin 360 dashboard…</div>
    </div>
  `;
}

export function renderDashboard360(payload) {
  let hint360 = '';
  try {
    if (window._deeptwinDomainHint === 'voice') {
      window._deeptwinDomainHint = null;
      hint360 = `
        <div style="margin-bottom:14px;padding:10px 14px;font-size:11px;line-height:1.45;color:var(--text-secondary);border:1px solid rgba(246,178,60,.35);background:rgba(246,178,60,.09);border-radius:10px">
          <strong style="color:var(--text-primary)">Voice domain</strong> — ${ESC(VOICE_DEEPTWIN_DOMAIN_NOTE)}
        </div>`;
    }
  } catch (_) {}
  const top = `
    <div class="dt360-top-grid">
      ${_topCardPatient(payload)}
      ${_topCardCompleteness(payload)}
      ${_topCardSafety(payload)}
      ${_topCardReview(payload)}
    </div>
  `;
  const grid = `
    <div class="dt360-grid">
      ${(payload.domains || []).map(_domainCard).join('')}
    </div>
  `;
  const bottom = `
    <div class="dt360-bottom-grid">
      ${_bottomPanel('Patient timeline', _renderTimeline(payload))}
      ${_bottomPanel('Outcomes & progress', _renderOutcomes(payload))}
      ${_bottomPanel('Medication / qEEG confounds', _renderConfounds(payload), { note: 'No causal claim. Confounds are surfaced for clinician interpretation.' })}
      ${_bottomPanel('Correlation explorer', _renderCorrelations(payload), { note: 'Correlation does not imply causation.' })}
      ${_bottomPanel('DeepTwin prediction & confidence', _renderPredictionPanel(payload))}
      ${_bottomPanel('Clinician notes', _renderClinicianNotes(payload))}
    </div>
  `;
  return `
    <div class="dt360-page" id="dt360-root">
      ${hint360}
      ${top}
      <div class="dt360-section-h">22-domain matrix</div>
      ${grid}
      ${bottom}
      ${_renderSafetyFooter()}
    </div>
    <div class="dt360-panel-overlay" id="dt360-panel-overlay" style="display:none">
      <div class="dt360-panel" id="dt360-panel">
        <div class="dt360-panel-content" id="dt360-panel-content"></div>
      </div>
    </div>
  `;
}

// Render the detail panel content for a specific domain
function _renderDomainDetail(d) {
  const icon = DOMAIN_ICONS[d.key] || '';
  const tone = STATUS_TONE[d.status] || 'low';
  const action = DOMAIN_ACTIONS[d.key] || { label: 'View', icon: 'view' };
  const navTarget = DOMAIN_NAV[d.key];
  const warnings = (d.warnings || []).map(w => `<div class="dt360-warn">${ESC(w)}</div>`).join('');

  const actionBtnClass = action.icon === 'lock' ? 'btn-ghost' : 'btn-primary';
  const actionDisabled = action.icon === 'lock' ? 'disabled' : '';
  const navBtn = navTarget
    ? `<button class="btn ${actionBtnClass} btn-sm dt360-panel-action" data-panel-nav="${ESC(navTarget)}" ${actionDisabled}>${ESC(action.label)}</button>`
    : `<button class="btn btn-ghost btn-sm" disabled>${ESC(action.label)}</button>`;

  const statusDesc = {
    available: 'Data has been ingested and is available for analysis.',
    partial: 'Some data exists but additional records are needed for complete analysis.',
    missing: 'No data has been uploaded yet. Upload data to populate this domain.',
    unavailable: 'This domain does not have an ingestion path in the platform yet.',
  };

  const voiceNote = d.key === 'voice'
    ? `<div class="dt360-warn" style="margin-top:8px;border-color:rgba(139,125,255,.3)">${ESC(VOICE_DECISION_SUPPORT_SHORT)}</div>`
    : '';

  return `
    <button class="dt360-panel-close" id="dt360-panel-close" aria-label="Close">&times;</button>
    <div class="dt360-panel-header">
      <div class="dt360-panel-icon dt360-card-icon--${tone}">${icon}</div>
      <div>
        <div class="dt360-panel-title">${ESC(d.label)}</div>
        ${_statusBadge(d.status)}
      </div>
    </div>
    <div class="dt360-panel-status-desc">${ESC(statusDesc[d.status] || '')}</div>
    <div class="dt360-panel-body">
      <div class="dt360-panel-row">
        <span class="dt360-panel-label">Records</span>
        <span>${ESC(d.record_count)}</span>
      </div>
      <div class="dt360-panel-row">
        <span class="dt360-panel-label">Last updated</span>
        <span>${_fmtDate(d.last_updated)}</span>
      </div>
      ${d.summary ? `
      <div class="dt360-panel-row" style="flex-direction:column;align-items:flex-start;gap:4px">
        <span class="dt360-panel-label">Summary</span>
        <span style="color:var(--text-secondary)">${ESC(d.summary)}</span>
      </div>` : ''}
      ${warnings ? `<div class="dt360-panel-warnings">${warnings}</div>` : ''}
      ${voiceNote}
    </div>
    <div class="dt360-panel-actions">
      ${navBtn}
    </div>
  `;
}

let _dashboardPayloadCache = null;

export function wireDashboard360Actions(payload) {
  if (payload) _dashboardPayloadCache = payload;

  // Wire card clicks → open detail panel
  document.querySelectorAll('.dt360-card[data-domain-key]').forEach(card => {
    const handler = () => {
      const key = card.dataset.domainKey;
      const domains = _dashboardPayloadCache?.domains || [];
      const d = domains.find(x => x.key === key);
      if (!d) return;
      const overlay = document.getElementById('dt360-panel-overlay');
      const content = document.getElementById('dt360-panel-content');
      if (!overlay || !content) return;
      content.innerHTML = _renderDomainDetail(d);
      overlay.style.display = '';
      // Animate in
      requestAnimationFrame(() => overlay.classList.add('dt360-panel-overlay--open'));
      _wirePanelClose();
      _wirePanelNav();
    };
    card.addEventListener('click', handler);
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(); } });
  });
}

function _wirePanelClose() {
  const overlay = document.getElementById('dt360-panel-overlay');
  const closeBtn = document.getElementById('dt360-panel-close');
  const close = () => {
    if (!overlay) return;
    overlay.classList.remove('dt360-panel-overlay--open');
    setTimeout(() => { overlay.style.display = 'none'; }, 220);
  };
  closeBtn?.addEventListener('click', close);
  overlay?.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
}

function _wirePanelNav() {
  document.querySelectorAll('.dt360-panel-action[data-panel-nav]').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.panelNav;
      if (target) window._nav?.(target);
    });
  });
}

// Demo seed used when the backend has no Patient row (Netlify preview, demo
// patients, offline review). Mirrors the patient-roster seed pattern used
// elsewhere on the DeepTwin page so the tab always renders something
// inspectable. Honesty rules from the real endpoint apply: status is
// `missing`/`unavailable` for everything except identity + diagnosis;
// prediction confidence is `placeholder` / not calibrated.
function _demoDashboardPayload(patientId) {
  const header = getDemoPatientHeader(patientId);
  const dx = [header.primary, ...(header.secondary || [])];
  const labels = {
    identity: 'Identity / demographics',
    diagnosis: 'Diagnosis / phenotype',
    symptoms_goals: 'Symptoms / goals',
    assessments: 'Assessments',
    qeeg: 'EEG / qEEG',
    mri: 'MRI / imaging',
    video: 'Video',
    voice: 'Voice',
    text: 'Text / language',
    biometrics: 'Biometrics',
    wearables: 'Wearables',
    cognitive_tasks: 'Cognitive tasks',
    medications: 'Medication / supplements',
    labs: 'Labs / blood biomarkers',
    treatment_sessions: 'Treatment sessions',
    safety_flags: 'Adverse events / safety flags',
    lifestyle: 'Lifestyle / sleep / diet',
    environment: 'Environment',
    caregiver_reports: 'Family / teacher / caregiver reports',
    clinical_documents: 'Clinical documents',
    outcomes: 'Outcomes',
    twin_predictions: 'DeepTwin predictions and confidence',
  };
  const card = (key, status, summary, extra = {}) => ({
    key, label: labels[key], status,
    record_count: status === 'available' ? 1 : 0,
    last_updated: null,
    summary,
    warnings: extra.warnings || [],
    source_links: extra.source_links || [],
    upload_links: extra.upload_links || [],
  });
  const domains = [
    card('identity', 'available', header.name),
    card('diagnosis', 'available', dx.join(' · ')),
    card('symptoms_goals', 'partial', 'Demo intake notes only.'),
    card('assessments', 'missing', 'No assessment scores in this demo seed.', {
      upload_links: [{ label: 'Submit assessment', href: '/assessments', kind: 'assessment' }],
    }),
    card('qeeg', 'missing', 'No qEEG records in this demo seed.', {
      upload_links: [{ label: 'Upload qEEG', href: '/qeeg-analysis', kind: 'qeeg' }],
    }),
    card('mri', 'missing', 'No MRI records in this demo seed.', {
      upload_links: [{ label: 'Upload MRI', href: '/mri-analysis', kind: 'mri' }],
    }),
    card('video', 'missing', `No video analyses on file. When present, each task section carries evidence_context: registry-backed (${EVIDENCE_TOTAL_PAPERS.toLocaleString()} papers) condition anchors + rationale for why kinematics map to literature — not diagnostic proof.`, {
      warnings: ['Video movement/monitoring outputs are not clinically validated diagnostic scores.'],
      source_links: [
        { label: 'Research evidence (87k)', href: '/research-evidence' },
        { label: 'Patient analytics · video panel', href: '/patient-analytics' },
      ],
      upload_links: [{ label: 'Open video visits', href: '/virtualcare', kind: 'video' }],
    }),
    card('voice', 'missing', 'No voice analyses on file.'),
    card('text', 'missing', 'No journal or message text on file.'),
    card('biometrics', 'missing', 'No biometric observations on file.'),
    card('wearables', 'missing', 'No wearable daily summaries on file.'),
    card('cognitive_tasks', 'unavailable', 'No cognitive-task ingestion path in the platform yet.', {
      warnings: ['Domain is structurally unavailable, not data-missing.'],
    }),
    card('medications', header.medications.length ? 'available' : 'missing',
      header.medications.length ? `${header.medications.length} medication(s) on file (demo).` : 'No medications on file.'),
    card('labs', 'unavailable', 'No labs/biomarker ingestion path in the platform yet.', {
      warnings: ['Domain is structurally unavailable, not data-missing.'],
    }),
    card('treatment_sessions', 'missing', 'No treatment sessions on file.'),
    card('safety_flags', 'missing', 'No adverse events or safety flags on file.'),
    card('lifestyle', 'missing', 'No lifestyle / sleep observations available; diet not ingested.'),
    card('environment', 'unavailable', 'No environmental-context ingestion path in the platform yet.', {
      warnings: ['Domain is structurally unavailable, not data-missing.'],
    }),
    card('caregiver_reports', 'unavailable', 'No family/teacher/caregiver-report ingestion path yet.', {
      warnings: ['Domain is structurally unavailable, not data-missing.'],
    }),
    card('clinical_documents', 'partial', 'Document templates exist; per-patient generated documents not yet aggregated here.'),
    card('outcomes', 'missing', 'No outcome series or events on file.'),
    card('twin_predictions', 'partial', 'DeepTwin predictions are model-estimated and uncalibrated.', {
      warnings: ['DeepTwin model is currently a deterministic placeholder; no validated outcome calibration.'],
    }),
  ];
  const available = domains.filter(d => d.status === 'available').length;
  const partialCount = domains.filter(d => d.status === 'partial').length;
  const missing = domains.filter(d => d.status === 'missing').length;
  return {
    patient_id: patientId,
    generated_at: new Date().toISOString(),
    patient_summary: {
      name: header.name, age: header.age,
      diagnosis: dx, phenotype: [], primary_goals: [], risk_level: 'unknown',
    },
    completeness: {
      score: Math.round(((available + 0.5 * partialCount) / 22) * 1000) / 1000,
      available_domains: available, partial_domains: partialCount,
      missing_domains: missing,
      high_priority_missing: ['qeeg', 'assessments', 'treatment_sessions', 'outcomes'],
    },
    safety: { adverse_events: [], contraindications: [], red_flags: [], medication_confounds: [] },
    domains,
    timeline: [], correlations: [],
    outcomes: { series_count: 0, event_count: 0, summary: 'No outcomes on file (demo).' },
    prediction_confidence: {
      status: 'placeholder', real_ai: false, confidence: null,
      confidence_label: 'Not calibrated',
      summary: 'Decision-support only. Requires clinician review.',
      drivers: [],
      limitations: [
        'No validated outcome dataset bound to this engine.',
        'Encoders are deterministic feature extractors, not trained ML.',
        'Predictions must not be used as autonomous treatment recommendations.',
      ],
    },
    clinician_notes: [],
    review: { reviewed: false, reviewed_by: null, reviewed_at: null },
    disclaimer: 'Decision-support only. Requires clinician review. Correlation does not imply causation. Predictions are uncalibrated unless validated. Not an autonomous treatment recommendation.',
    _demo: true,
  };
}

export async function loadDashboard360(patientId) {
  if (!patientId) {
    return _demoDashboardPayload('demo-patient');
  }
  try {
    const payload = await api.deeptwinDashboard360(patientId);
    if (payload && Array.isArray(payload.domains) && payload.domains.length === 22) {
      return payload;
    }
    return _demoDashboardPayload(patientId);
  } catch (e) {
    // 404 (no DB row), 401, network error → fall back to demo seed so the
    // tab still renders. Mirrors the rest of the DeepTwin page's behaviour.
    return _demoDashboardPayload(patientId);
  }
}

export const DASHBOARD_360_VERSION = 'v1';
