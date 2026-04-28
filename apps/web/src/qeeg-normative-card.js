// ─────────────────────────────────────────────────────────────────────────────
// qeeg-normative-card.js — Normative Model Card
//
// Exports:
//   renderNormativeModelCard(card)   → HTML string
//   mountNormativeModelCard(containerId, analysisId, api)
// ─────────────────────────────────────────────────────────────────────────────

function esc(v) {
  if (v == null) return '';
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _pill(label, color) {
  return '<span class="qeeg-ai-chip" style="--chip-color:' + (color || 'var(--teal)') + '">' + esc(label) + '</span>';
}

function renderNormativeModelCard(card) {
  if (!card) return '';
  var complete = !!card.complete;
  var ood = card.ood_warning || '';
  var limitations = card.limitations || [];

  var rows = [
    ['Normative Database', card.normative_db_name || '—'],
    ['Version', card.normative_db_version || '—'],
    ['Age Range', card.age_range || '—'],
    ['Eyes Condition Compatible', card.eyes_condition_compatible != null ? (card.eyes_condition_compatible ? 'Yes' : 'No') : '—'],
    ['Montage Compatible', card.montage_compatible != null ? (card.montage_compatible ? 'Yes' : 'No') : '—'],
    ['Z-Score Method', card.zscore_method || '—'],
    ['Confidence Interval', card.confidence_interval || '—'],
  ].map(function (r) {
    return '<tr><td style="font-weight:600;width:40%">' + esc(r[0]) + '</td><td>' + esc(r[1]) + '</td></tr>';
  }).join('');

  var oodBanner = ood
    ? '<div style="padding:10px 14px;border-radius:6px;margin-bottom:10px;background:#fffbeb;border-left:4px solid #f59e0b">'
      + '<strong>Out-of-Distribution Warning</strong> ' + esc(ood) + '</div>'
    : '';

  var lims = limitations.length
    ? '<ul style="margin:8px 0 0 16px;font-size:13px">' + limitations.map(function (l) {
      return '<li>' + esc(l) + '</li>';
    }).join('') + '</ul>'
    : '';

  return '<div class="ds-card qeeg-ai-card">'
    + '<div class="ds-card__header"><h3>Normative Model Card</h3>' + (complete ? _pill('Complete', '#22c55e') : _pill('Partial', '#f59e0b')) + '</div>'
    + '<div class="ds-card__body">'
    + oodBanner
    + '<table class="ds-table" style="width:100%;font-size:13px"><tbody>' + rows + '</tbody></table>'
    + (lims ? '<h4 style="margin:12px 0 4px;font-size:13px">Limitations</h4>' + lims : '')
    + '<p style="margin-top:12px;font-size:11px;color:var(--text-secondary)">This is decision-support information. Please consult your clinician for care decisions.</p>'
    + '</div></div>';
}

async function mountNormativeModelCard(containerId, analysisId, api) {
  var container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '<div class="ds-spinner"></div>';
  try {
    var data = await api.getQEEGNormativeModelCard(analysisId);
    container.innerHTML = renderNormativeModelCard(data);
  } catch (e) {
    container.innerHTML = '<div class="ds-alert ds-alert--error">Unable to load normative model card.</div>';
  }
}

export { renderNormativeModelCard, mountNormativeModelCard };
