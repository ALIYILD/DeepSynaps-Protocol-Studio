// ─────────────────────────────────────────────────────────────────────────────
// qeeg-protocol-fit.js — AI Protocol Fit Panel
//
// Exports:
//   renderProtocolFit(fit)           → HTML string
//   mountProtocolFit(containerId, analysisId, api)
// ─────────────────────────────────────────────────────────────────────────────

function esc(v) {
  if (v == null) return '';
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _pill(label, color) {
  return '<span class="qeeg-ai-chip" style="--chip-color:' + (color || 'var(--teal)') + '">' + esc(label) + '</span>';
}

function renderProtocolFit(fit) {
  if (!fit) return '';
  var offLabel = fit.off_label_flag;
  var evidence = fit.evidence_grade || 'N/A';
  var evColor = evidence === 'A' ? '#22c55e' : (evidence === 'B' ? '#3b82f6' : (evidence === 'C' ? '#f59e0b' : '#6b7280'));

  var summary = '<div style="display:flex;gap:12px;margin-bottom:12px;flex-wrap:wrap">'
    + _pill('Evidence: ' + evidence, evColor)
    + (offLabel ? _pill('Off-Label', '#ef4444') : '')
    + (fit.clinician_reviewed ? _pill('Reviewed', '#22c55e') : _pill('Pending Review', '#f59e0b'))
    + '</div>';

  var candidate = fit.candidate_protocol || {};
  var candidateBlock = candidate.name
    ? '<div style="padding:12px;background:#f8fafc;border-radius:8px;margin-bottom:10px">'
      + '<strong>' + esc(candidate.name) + '</strong>'
      + (candidate.description ? '<p style="margin:4px 0 0;font-size:12px;color:var(--text-secondary)">' + esc(candidate.description) + '</p>' : '')
      + '</div>'
    : '';

  var contras = (fit.contraindications || []).length
    ? '<div style="padding:10px 14px;border-radius:6px;background:#fef2f2;border-left:4px solid #ef4444;margin-bottom:10px">'
      + '<strong>Contraindications</strong><ul style="margin:4px 0 0 16px;font-size:12px">'
      + fit.contraindications.map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('')
      + '</ul></div>'
    : '';

  var checks = (fit.required_checks || []).length
    ? '<h4 style="margin:8px 0 4px;font-size:13px">Required Clinician Checks</h4><ul style="margin:0 0 0 16px;font-size:12px">'
      + fit.required_checks.map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('')
      + '</ul>'
    : '';

  var rationale = '';
  if (fit.match_rationale) {
    rationale += '<p style="font-size:12px;margin:4px 0"><strong>Match rationale:</strong> ' + esc(fit.match_rationale) + '</p>';
  }
  if (fit.caution_rationale) {
    rationale += '<p style="font-size:12px;margin:4px 0"><strong>Caution:</strong> ' + esc(fit.caution_rationale) + '</p>';
  }

  return '<div class="ds-card qeeg-ai-card">'
    + '<div class="ds-card__header"><h3>Protocol Fit</h3></div>'
    + '<div class="ds-card__body">'
    + summary
    + '<p style="font-size:13px;margin:0 0 8px">' + esc(fit.pattern_summary) + '</p>'
    + candidateBlock
    + contras
    + rationale
    + checks
    + '</div></div>';
}

async function mountProtocolFit(containerId, analysisId, api) {
  var container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '<div class="ds-spinner"></div>';
  try {
    var data = await api.getQEEGProtocolFit(analysisId);
    container.innerHTML = renderProtocolFit(data);
  } catch (e) {
    // If not found, auto-compute
    try {
      data = await api.computeQEEGProtocolFit(analysisId);
      container.innerHTML = renderProtocolFit(data);
    } catch (e2) {
      container.innerHTML = '<div class="ds-alert ds-alert--error">Unable to load protocol fit.</div>';
    }
  }
}

export { renderProtocolFit, mountProtocolFit };
