// ─────────────────────────────────────────────────────────────────────────────
// pages-fusion-workbench.js — Multimodal Fusion Workbench (Migration 054)
//
// Sections:
//   1. Case Selector          — dropdown of fusion cases with state badges
//   2. Modality Status Bar    — qEEG / MRI / Assessments / Treatment history
//   3. Safety Cockpit         — merged red flags from both modalities
//   4. Agreement Dashboard    — AGREE / DISAGREE / CONFLICT / PARTIAL table
//   5. Protocol Fusion Panel  — merged qEEG protocol + MRI targets
//   6. AI Summary             — narrative summary with confidence badge
//   7. Explainability         — top modalities, drivers, missing data
//   8. Review Actions         — Approve / Edit & Approve / Sign / Archive
//   9. Patient-Facing Preview — toggle to preview sanitized report
//  10. Audit Trail            — state transitions with actor + timestamp
// ─────────────────────────────────────────────────────────────────────────────

import { api } from './api.js';

// ── Feature flag ─────────────────────────────────────────────────────────────
function _fusionFeatureFlagEnabled() {
  try {
    var v = (typeof window !== 'undefined' && window)
      ? window.DEEPSYNAPS_ENABLE_FUSION_WORKBENCH
      : (typeof globalThis !== 'undefined' ? globalThis.DEEPSYNAPS_ENABLE_FUSION_WORKBENCH : undefined);
    if (v === false || v === 'false' || v === 0 || v === '0') return false;
    return true;
  } catch (_) { return true; }
}

// ── XSS escape ───────────────────────────────────────────────────────────────
function esc(v) {
  if (v == null) return '';
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Shared helpers ───────────────────────────────────────────────────────────
function _card(title, body, extra) {
  return '<div class="ds-card fusion-card">'
    + (title ? '<div class="ds-card__header"><h3>' + esc(title) + '</h3>' + (extra || '') + '</div>' : '')
    + '<div class="ds-card__body">' + body + '</div></div>';
}

function _pill(label, color) {
  return '<span class="fusion-chip" style="--chip-color:' + (color || 'var(--teal)') + '">'
    + esc(label) + '</span>';
}

function _badge(state) {
  const colors = {
    FUSION_DRAFT_AI: '#8e9aaf',
    FUSION_NEEDS_CLINICAL_REVIEW: '#f4a261',
    FUSION_APPROVED: '#2a9d8f',
    FUSION_REVIEWED_WITH_AMENDMENTS: '#e9c46a',
    FUSION_SIGNED: '#264653',
    FUSION_ARCHIVED: '#6c757d',
  };
  return _pill(state.replace('FUSION_', '').replace(/_/g, ' '), colors[state] || 'var(--text-secondary)');
}

function _agreementPill(status) {
  const colors = {
    AGREE: '#2a9d8f',
    DISAGREE: '#f4a261',
    CONFLICT: '#e63946',
    PARTIAL: '#8e9aaf',
  };
  return _pill(status, colors[status] || 'var(--text-secondary)');
}

function _severityDot(severity) {
  const colors = { info: '#2a9d8f', warn: '#f4a261', critical: '#e63946' };
  return '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + (colors[severity] || '#8e9aaf') + ';margin-right:6px;"></span>';
}

// ── State-aware action buttons ───────────────────────────────────────────────
function _renderReviewActions(caseState, caseId) {
  const actions = [];
  if (caseState === 'FUSION_DRAFT_AI') {
    actions.push({ label: 'Send for Review', action: 'needs_clinical_review', color: '#f4a261' });
  }
  if (caseState === 'FUSION_NEEDS_CLINICAL_REVIEW') {
    actions.push({ label: 'Approve', action: 'approve', color: '#2a9d8f' });
    actions.push({ label: 'Edit & Approve', action: 'amend', color: '#e9c46a' });
  }
  if (caseState === 'FUSION_APPROVED' || caseState === 'FUSION_REVIEWED_WITH_AMENDMENTS') {
    actions.push({ label: 'Sign Off', action: 'sign', color: '#264653' });
    actions.push({ label: 'Edit & Approve', action: 'amend', color: '#e9c46a' });
  }
  if (caseState !== 'FUSION_ARCHIVED') {
    actions.push({ label: 'Archive', action: 'archive', color: '#6c757d' });
  }

  let html = '<div class="fusion-review-actions" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">';
  for (const a of actions) {
    html += '<button class="ds-btn" data-action="' + esc(a.action) + '" data-case-id="' + esc(caseId) + '" '
      + 'style="background:' + a.color + ';color:#fff;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:13px;">'
      + esc(a.label) + '</button>';
  }
  html += '</div>';
  return html;
}

// ── Section 1: Case Selector ─────────────────────────────────────────────────
export function renderCaseSelector(cases, selectedId) {
  if (!cases || cases.length === 0) {
    return _card('Fusion Cases', '<p style="color:var(--text-secondary)">No fusion cases yet. Create one to get started.</p>');
  }
  let html = '<select class="fusion-case-select" style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border);">'
    + '<option value="">Select a fusion case...</option>';
  for (const c of cases) {
    const selected = c.id === selectedId ? ' selected' : '';
    html += '<option value="' + esc(c.id) + '"' + selected + '>'
      + esc(c.id.slice(0, 8)) + ' — ' + esc(c.report_state.replace('FUSION_', ''))
      + (c.confidence !== null ? ' (' + Math.round(c.confidence * 100) + '%)' : '')
      + '</option>';
  }
  html += '</select>';
  return _card('Fusion Cases', html);
}

// ── Section 2: Modality Status Bar ───────────────────────────────────────────
export function renderModalityStatusBar(caseData) {
  const items = [];
  const qeegReady = !!caseData.qeeg_analysis_id;
  const mriReady = !!caseData.mri_analysis_id;
  items.push({ label: 'qEEG', ready: qeegReady });
  items.push({ label: 'MRI', ready: mriReady });
  items.push({ label: 'Assessments', ready: (caseData.assessment_ids_json || '[]').length > 2 });
  items.push({ label: 'Treatment History', ready: (caseData.course_ids_json || '[]').length > 2 });

  let html = '<div style="display:flex;gap:12px;flex-wrap:wrap;">';
  for (const item of items) {
    const color = item.ready ? '#2a9d8f' : '#8e9aaf';
    const icon = item.ready ? '&#10003;' : '&#10007;';
    html += '<div style="display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:20px;background:' + color + '22;color:' + color + ';font-size:13px;font-weight:500;">'
      + '<span>' + icon + '</span>' + esc(item.label)
      + '</div>';
  }
  html += '</div>';
  return _card('Modality Status', html);
}

// ── Section 3: Safety Cockpit ────────────────────────────────────────────────
export function renderSafetyCockpit(caseData) {
  const cockpit = caseData.safety_cockpit || {};
  const redFlags = caseData.red_flags || [];
  const warnings = cockpit.warnings || [];

  let html = '<div style="display:flex;flex-direction:column;gap:8px;">';
  if (redFlags.length === 0 && warnings.length === 0) {
    html += '<p style="color:#2a9d8f;font-size:13px;">No safety flags.</p>';
  }
  for (const flag of redFlags) {
    html += '<div style="padding:8px 12px;border-radius:6px;background:#e6394611;border-left:3px solid #e63946;font-size:13px;">'
      + '<strong>' + esc(flag.code || 'Flag') + '</strong>: ' + esc(flag.message || '')
      + '</div>';
  }
  for (const w of warnings) {
    html += '<div style="padding:8px 12px;border-radius:6px;background:#f4a26111;border-left:3px solid #f4a261;font-size:13px;">'
      + esc(w)
      + '</div>';
  }
  html += '</div>';
  return _card('Safety Cockpit', html);
}

// ── Section 4: Agreement Dashboard ───────────────────────────────────────────
export function renderAgreementDashboard(caseData) {
  const agreement = caseData.modality_agreement || {};
  const items = agreement.items || [];

  if (items.length === 0) {
    return _card('Agreement Dashboard', '<p style="color:var(--text-secondary)">No agreement data available.</p>');
  }

  let html = '<table style="width:100%;border-collapse:collapse;font-size:13px;">'
    + '<thead><tr style="text-align:left;border-bottom:1px solid var(--border);">'
    + '<th style="padding:8px;">Topic</th><th style="padding:8px;">qEEG</th><th style="padding:8px;">MRI</th>'
    + '<th style="padding:8px;">Status</th><th style="padding:8px;">Severity</th></tr></thead><tbody>';

  for (const item of items) {
    html += '<tr style="border-bottom:1px solid var(--border-light);">'
      + '<td style="padding:8px;">' + esc(item.topic) + '</td>'
      + '<td style="padding:8px;color:var(--text-secondary);">' + esc(item.qeeg_position) + '</td>'
      + '<td style="padding:8px;color:var(--text-secondary);">' + esc(item.mri_position) + '</td>'
      + '<td style="padding:8px;">' + _agreementPill(item.status) + '</td>'
      + '<td style="padding:8px;">' + _severityDot(item.severity) + esc(item.severity) + '</td>'
      + '</tr>';
    if (item.recommendation) {
      html += '<tr><td colspan="5" style="padding:4px 8px 12px;font-size:12px;color:var(--text-secondary);">'
        + '&#9654; ' + esc(item.recommendation) + '</td></tr>';
    }
  }
  html += '</tbody></table>';
  html += '<div style="margin-top:8px;font-size:12px;color:var(--text-secondary);">'
    + 'Overall: <strong>' + esc(agreement.overall_status || 'unknown') + '</strong> '
    + '(score: ' + (agreement.score || 0) + ')'
    + '</div>';

  return _card('Agreement Dashboard', html);
}

// ── Section 5: Protocol Fusion Panel ─────────────────────────────────────────
export function renderProtocolFusionPanel(caseData) {
  const pf = caseData.protocol_fusion || {};
  const qeegProto = pf.qeeg_protocol || {};
  const mriTarget = pf.mri_target || {};

  let html = '<div style="display:flex;gap:12px;flex-wrap:wrap;">';

  // qEEG protocol card
  html += '<div style="flex:1;min-width:200px;padding:12px;border-radius:8px;background:var(--surface-elevated);border:1px solid var(--border);">'
    + '<div style="font-size:12px;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-secondary);margin-bottom:8px;">qEEG Protocol</div>'
    + '<div style="font-size:18px;font-weight:600;margin-bottom:4px;">' + esc(qeegProto.target_region || '—') + '</div>'
    + '<div style="font-size:13px;color:var(--text-secondary);">'
    + (qeegProto.parameters?.frequency_hz ? 'Frequency: ' + esc(qeegProto.parameters.frequency_hz) + ' Hz<br>' : '')
    + (qeegProto.parameters?.sessions ? 'Sessions: ' + esc(qeegProto.parameters.sessions) + '<br>' : '')
    + '</div></div>';

  // MRI target card
  html += '<div style="flex:1;min-width:200px;padding:12px;border-radius:8px;background:var(--surface-elevated);border:1px solid var(--border);">'
    + '<div style="font-size:12px;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-secondary);margin-bottom:8px;">MRI Target</div>'
    + '<div style="font-size:18px;font-weight:600;margin-bottom:4px;">' + esc(mriTarget.region || '—') + '</div>'
    + '<div style="font-size:13px;color:var(--text-secondary);">'
    + (mriTarget.coordinates?.x !== undefined ? 'MNI: ' + esc(mriTarget.coordinates.x) + ', ' + esc(mriTarget.coordinates.y) + ', ' + esc(mriTarget.coordinates.z) + '<br>' : '')
    + '</div></div>';

  // Fusion result card
  const fusionColor = pf.fusion_status === 'merged' ? '#2a9d8f' : pf.fusion_status === 'conflict' ? '#e63946' : '#8e9aaf';
  html += '<div style="flex:1;min-width:200px;padding:12px;border-radius:8px;background:' + fusionColor + '11;border:1px solid ' + fusionColor + ';">'
    + '<div style="font-size:12px;text-transform:uppercase;letter-spacing:0.5px;color:' + fusionColor + ';margin-bottom:8px;">Fusion Result</div>'
    + '<div style="font-size:14px;font-weight:500;margin-bottom:4px;">' + esc(pf.recommendation || 'No recommendation available.') + '</div>'
    + '<div style="font-size:12px;color:var(--text-secondary);">Status: ' + esc(pf.fusion_status || 'none') + '</div>'
    + '</div>';

  html += '</div>';
  return _card('Protocol Fusion', html);
}

// ── Section 6: AI Summary ────────────────────────────────────────────────────
export function renderAiSummary(caseData) {
  const confidencePct = caseData.confidence !== null ? Math.round(caseData.confidence * 100) : null;
  let html = '<div style="display:flex;align-items:flex-start;gap:12px;">'
    + '<div style="flex:1;">'
    + '<p style="font-size:15px;line-height:1.6;margin:0 0 12px;">' + esc(caseData.summary || 'No summary available.') + '</p>'
    + '<div style="font-size:12px;color:var(--text-secondary);">Grade: ' + esc(caseData.confidence_grade || 'heuristic') + '</div>'
    + '</div>';
  if (confidencePct !== null) {
    html += '<div style="text-align:center;min-width:80px;">'
      + '<div style="width:64px;height:64px;border-radius:50%;background:conic-gradient(var(--teal) ' + confidencePct + '%, var(--surface-elevated) 0);display:flex;align-items:center;justify-content:center;margin:0 auto 4px;">'
      + '<div style="width:48px;height:48px;border-radius:50%;background:var(--surface);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;">' + confidencePct + '%</div>'
      + '</div>'
      + '<div style="font-size:11px;color:var(--text-secondary);">Confidence</div>'
      + '</div>';
  }
  html += '</div>';
  html += '<div style="margin-top:12px;padding:8px 12px;border-radius:6px;background:var(--surface-elevated);font-size:12px;color:var(--text-secondary);">'
    + '&#9888; Decision-support only. Not a diagnosis or prescription.'
    + '</div>';
  return _card('AI Summary', html);
}

// ── Section 7: Explainability ────────────────────────────────────────────────
export function renderExplainability(caseData) {
  const exp = caseData.explainability || {};
  const topModalities = exp.top_modalities || [];
  const missingNotes = exp.missing_data_notes || [];
  const cautions = exp.cautions || [];

  let html = '<div style="display:flex;flex-direction:column;gap:12px;">'
    + '<div><strong style="font-size:13px;">Top Modalities</strong><div style="display:flex;gap:8px;margin-top:6px;">';
  for (const m of topModalities) {
    const weight = Math.round((m.weight || 0) * 100);
    if (weight > 0) {
      html += _pill(m.modality + ' ' + weight + '%', 'var(--teal)');
    }
  }
  html += '</div></div>';

  if (missingNotes.length) {
    html += '<div><strong style="font-size:13px;">Missing Data</strong><ul style="margin:6px 0 0 16px;padding:0;font-size:13px;color:var(--text-secondary);">';
    for (const note of missingNotes) {
      html += '<li>' + esc(note) + '</li>';
    }
    html += '</ul></div>';
  }

  if (cautions.length) {
    html += '<div><strong style="font-size:13px;">Cautions</strong><ul style="margin:6px 0 0 16px;padding:0;font-size:13px;color:var(--text-secondary);">';
    for (const c of cautions) {
      html += '<li>' + esc(c) + '</li>';
    }
    html += '</ul></div>';
  }

  html += '</div>';
  return _card('Explainability', html);
}

// ── Section 8: Review Actions ────────────────────────────────────────────────
export function renderReviewActions(caseData) {
  let html = '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:8px;">'
    + '<span style="font-size:13px;color:var(--text-secondary);">State:</span>' + _badge(caseData.report_state);
  if (caseData.reviewer_id) {
    html += '<span style="font-size:12px;color:var(--text-secondary);">Reviewed by ' + esc(caseData.reviewer_id) + '</span>';
  }
  if (caseData.signed_by) {
    html += '<span style="font-size:12px;color:var(--text-secondary);">Signed by ' + esc(caseData.signed_by) + '</span>';
  }
  html += '</div>';
  html += _renderReviewActions(caseData.report_state, caseData.id);
  return _card('Review Actions', html);
}

// ── Section 9: Patient-Facing Preview ────────────────────────────────────────
export function renderPatientFacingPreview(caseData) {
  const report = caseData.patient_facing_report || {};
  let html = '<div style="font-size:13px;line-height:1.6;">'
    + '<p><strong>Patient ID Hash:</strong> ' + esc(report.patient_id_hash || '') + '</p>'
    + '<p><strong>Summary:</strong> ' + esc(report.summary || caseData.summary || '—') + '</p>';
  if (report.claims && report.claims.length) {
    html += '<p><strong>Claims:</strong></p><ul style="margin:4px 0 0 16px;padding:0;">';
    for (const claim of report.claims) {
      html += '<li>' + esc(claim.claim_type) + ': ' + esc(claim.text) + '</li>';
    }
    html += '</ul>';
  }
  html += '<p style="margin-top:12px;padding:8px;border-radius:6px;background:#f4a26111;font-size:12px;">'
    + '&#9888; ' + esc(report.disclaimer || 'Decision-support only. Not a diagnosis.') + '</p>'
    + '</div>';
  return _card('Patient-Facing Preview', html);
}

// ── Section 10: Audit Trail ──────────────────────────────────────────────────
export function renderAuditTrail(audits) {
  if (!audits || audits.length === 0) {
    return _card('Audit Trail', '<p style="color:var(--text-secondary)">No audit entries yet.</p>');
  }

  let html = '<table style="width:100%;border-collapse:collapse;font-size:13px;">'
    + '<thead><tr style="text-align:left;border-bottom:1px solid var(--border);">'
    + '<th style="padding:8px;">Action</th><th style="padding:8px;">Actor</th>'
    + '<th style="padding:8px;">Previous</th><th style="padding:8px;">New</th>'
    + '<th style="padding:8px;">Note</th><th style="padding:8px;">Time</th>'
    + '</tr></thead><tbody>';

  for (const a of audits) {
    html += '<tr style="border-bottom:1px solid var(--border-light);">'
      + '<td style="padding:8px;">' + esc(a.action) + '</td>'
      + '<td style="padding:8px;">' + esc(a.actor_id) + ' <span style="color:var(--text-secondary);font-size:11px;">(' + esc(a.actor_role) + ')</span></td>'
      + '<td style="padding:8px;color:var(--text-secondary);">' + esc(a.previous_state || '—') + '</td>'
      + '<td style="padding:8px;">' + esc(a.new_state) + '</td>'
      + '<td style="padding:8px;color:var(--text-secondary);font-size:12px;">' + esc(a.note || '—') + '</td>'
      + '<td style="padding:8px;color:var(--text-secondary);font-size:12px;">' + esc(a.created_at) + '</td>'
      + '</tr>';
  }
  html += '</tbody></table>';
  return _card('Audit Trail', html);
}

// ── Composite page renderer ──────────────────────────────────────────────────
export function renderFusionWorkbench(caseData, audits, cases, selectedId) {
  if (!caseData) {
    return '<div style="padding:24px;">'
      + renderCaseSelector(cases, selectedId)
      + '<div style="margin-top:24px;">' + _card('Fusion Workbench', '<p style="color:var(--text-secondary)">Select or create a fusion case to begin.</p>') + '</div>'
      + '</div>';
  }

  let html = '<div style="padding:24px;display:flex;flex-direction:column;gap:16px;max-width:1200px;margin:0 auto;">';
  html += renderCaseSelector(cases, selectedId);
  html += renderModalityStatusBar(caseData);
  html += renderSafetyCockpit(caseData);
  html += renderAgreementDashboard(caseData);
  html += renderProtocolFusionPanel(caseData);
  html += renderAiSummary(caseData);
  html += renderExplainability(caseData);
  html += renderReviewActions(caseData);
  html += renderPatientFacingPreview(caseData);
  html += renderAuditTrail(audits);
  html += '</div>';
  return html;
}

// ── Page entrypoint ──────────────────────────────────────────────────────────
export async function pgFusionWorkbench(setTopbar, navigate) {
  if (typeof setTopbar === 'function') setTopbar('Fusion Workbench', '');
  const el = (typeof document !== 'undefined') ? document.getElementById('content') : null;
  if (!el) return;

  if (!_fusionFeatureFlagEnabled()) {
    el.innerHTML = '<div style="padding:24px;max-width:800px;margin:0 auto;">'
      + '<div style="padding:24px;border-radius:12px;background:var(--surface-elevated);border:1px solid var(--border);text-align:center;">'
      + '<div style="font-size:32px;margin-bottom:12px;">&#x2696;&#xFE0F;</div>'
      + '<h2 style="margin:0 0 8px;">Fusion Workbench</h2>'
      + '<p style="color:var(--text-secondary);margin:0;">Disabled by feature flag.</p>'
      + '</div></div>';
    return;
  }

  el.innerHTML = '<div id="fusion-workbench-root"></div>';

  // Extract patient_id from URL if present
  const params = new URLSearchParams(window.location.search);
  const patientId = params.get('patient_id') || window._selectedPatientId || null;

  mountFusionWorkbench('fusion-workbench-root', patientId);
}

// ── Wire event handlers ──────────────────────────────────────────────────────
export function mountFusionWorkbench(containerId, patientId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  let currentCaseId = null;
  let currentCases = [];
  let currentAudits = [];

  async function loadCases() {
    try {
      const cases = await api.listFusionCases(patientId);
      currentCases = cases;
      refresh();
    } catch (e) {
      container.innerHTML = '<p style="padding:24px;color:var(--text-secondary)">Error loading fusion cases.</p>';
    }
  }

  async function loadCase(caseId) {
    if (!caseId) {
      currentCaseId = null;
      currentAudits = [];
      refresh();
      return;
    }
    try {
      const [caseData, audits] = await Promise.all([
        api.getFusionCase(caseId),
        api.getFusionAudit(caseId),
      ]);
      currentCaseId = caseId;
      currentAudits = audits;
      refresh(caseData);
    } catch (e) {
      container.innerHTML = '<p style="padding:24px;color:var(--text-secondary)">Error loading fusion case.</p>';
    }
  }

  function refresh(caseData) {
    container.innerHTML = renderFusionWorkbench(caseData || null, currentAudits, currentCases, currentCaseId);
    wireEvents();
  }

  function wireEvents() {
    const select = container.querySelector('.fusion-case-select');
    if (select) {
      select.addEventListener('change', (e) => loadCase(e.target.value));
    }
    const buttons = container.querySelectorAll('.fusion-review-actions button[data-action]');
    for (const btn of buttons) {
      btn.addEventListener('click', async (e) => {
        const action = e.currentTarget.dataset.action;
        const caseId = e.currentTarget.dataset.caseId;
        if (!action || !caseId) return;
        try {
          await api.transitionFusionCase(caseId, action);
          await loadCase(caseId);
        } catch (err) {
          alert('Transition failed: ' + (err.message || 'Unknown error'));
        }
      });
    }
  }

  loadCases();
}
