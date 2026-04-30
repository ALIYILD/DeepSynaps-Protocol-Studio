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

const ESC = (s) => String(s ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

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

function _topCardPatient(payload) {
  const s = payload.patient_summary || {};
  const dx = (s.diagnosis || []).join(' · ') || '—';
  return `
    <div class="dt360-top-card">
      <div class="dt360-top-h">Patient</div>
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
      <div class="dt360-top-h">Twin completeness</div>
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
  return `
    <div class="dt360-top-card">
      <div class="dt360-top-h">Safety / risk flags</div>
      <div class="dt360-top-v">${ae + flags}</div>
      <div class="dt360-top-sub">${ae} adverse event(s) · ${flags} wearable flag(s)</div>
      <span class="dt-chip dt-chip--${tone}">${(ae + flags) === 0 ? 'No active flags' : 'Review required'}</span>
    </div>
  `;
}

function _topCardReview(payload) {
  const r = payload.review || {};
  const status = r.reviewed ? 'Reviewed' : 'Awaiting clinician review';
  return `
    <div class="dt360-top-card">
      <div class="dt360-top-h">Clinician review</div>
      <div class="dt360-top-v">${ESC(status)}</div>
      <div class="dt360-top-sub">${r.reviewed_by ? `By ${ESC(r.reviewed_by)} · ${_fmtDate(r.reviewed_at)}` : 'Decision-support only · requires clinician review'}</div>
    </div>
  `;
}

function _domainCard(d) {
  const warnings = (d.warnings || []).map(w => `<div class="dt360-warn">⚠ ${ESC(w)}</div>`).join('');
  const sources = (d.source_links || []).map(l =>
    `<a class="dt360-link" href="${ESC(l.href)}" data-nav>${ESC(l.label)}</a>`
  ).join('');
  const uploads = (d.upload_links || []).map(l =>
    `<button class="btn btn-ghost btn-sm dt360-upload" data-href="${ESC(l.href)}" data-kind="${ESC(l.kind || '')}">＋ ${ESC(l.label)}</button>`
  ).join('');
  return `
    <div class="card dt360-card" data-domain-key="${ESC(d.key)}">
      <div class="dt360-card-h">
        <span class="dt360-card-label">${ESC(d.label)}</span>
        ${_statusBadge(d.status)}
      </div>
      <div class="dt360-card-meta">
        <span>${ESC(d.record_count)} record(s)</span>
        <span>·</span>
        <span>Updated ${_fmtDate(d.last_updated)}</span>
      </div>
      ${d.summary ? `<div class="dt360-card-summary">${ESC(d.summary)}</div>` : ''}
      ${warnings}
      ${(sources || uploads) ? `<div class="dt360-card-actions">${sources}${uploads}</div>` : ''}
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
    <div class="dt360-page">
      ${top}
      <div class="dt360-section-h">22-domain matrix</div>
      ${grid}
      ${bottom}
      ${_renderSafetyFooter()}
    </div>
  `;
}

export function wireDashboard360Actions() {
  document.querySelectorAll('.dt360-upload').forEach(btn => {
    btn.addEventListener('click', (ev) => {
      ev.preventDefault();
      const href = btn.dataset.href || '';
      // We honour app-internal hash navigation when available; otherwise a
      // simple anchor href takes the doctor to the existing upload surface.
      if (href.startsWith('/qeeg-analysis')) { window._nav?.('qeeg-analysis'); return; }
      if (href.startsWith('/mri-analysis')) { window._nav?.('mri-analysis'); return; }
      if (href.includes('/assessments')) { window._nav?.('assessments'); return; }
      if (href.includes('/sessions')) { window._nav?.('clinical-sessions'); return; }
      if (href.includes('/medications')) { window._nav?.('patient-profile'); return; }
      if (href.includes('/devices')) { window._nav?.('patient-home-devices'); return; }
      if (href.includes('/adverse-events')) { window._nav?.('patient-profile'); return; }
      // Fallback — patient profile, where most subpages live.
      window._nav?.('patient-profile');
    });
  });
  document.querySelectorAll('a.dt360-link[data-nav]').forEach(a => {
    a.addEventListener('click', (ev) => {
      ev.preventDefault();
      const href = a.getAttribute('href') || '';
      if (href.includes('/qeeg')) window._nav?.('qeeg-analysis');
      else if (href.includes('/mri')) window._nav?.('mri-analysis');
      else if (href.includes('/assessments')) window._nav?.('assessments');
      else window._nav?.('patient-profile');
    });
  });
}

export async function loadDashboard360(patientId) {
  if (!patientId) {
    return { error: 'no_patient' };
  }
  return await api.deeptwinDashboard360(patientId);
}

export const DASHBOARD_360_VERSION = 'v1';
