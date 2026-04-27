// ─────────────────────────────────────────────────────────────────────────────
// qeeg-ai-panels.js — frontend renderers for the 10 qEEG AI upgrades.
//
// Each renderer is null-guarded and returns '' when its field is absent, so
// legacy analyses without the new AI fields render unchanged. See
// packages/qeeg-pipeline/CONTRACT_V2.md §6 for the authoritative spec.
//
// Exports:
//   renderBrainAgeCard(analysis)                  — §1 brain-age gauge + mini topomap
//   renderRiskScoreBars(analysis)                 — §2 similarity-index bars
//   renderCentileCurves(analysis)                 — §4 GAMLSS centile pills
//   renderExplainabilityOverlay(analysis)         — §7 top channels × band + OOD + Adebayo
//   renderSimilarCases(analysis)                  — §5 top-K retrieval rack
//   renderProtocolRecommendationCard(analysis)    — §8 full protocol card
//   renderLongitudinalSparklines(analysis)        — §9 per-feature sparklines
//   renderAiUpgradePanels(analysis)               — composite (calls 7 above)
//   mountCopilotWidget(containerId, analysisId)   — §10 floating copilot widget
//
// Regulatory:
//   - Never "diagnose" / "diagnostic" / "probability of disease".
//   - Risk scores are "similarity indices" (research/wellness use).
//   - Copilot offline demo responses always end with "please consult your
//     clinician for care decisions".
// ─────────────────────────────────────────────────────────────────────────────

// ── XSS escape (match pages-qeeg-analysis.js style) ─────────────────────────
function esc(v) {
  if (v == null) return '';
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Clamp helper.
function _clamp(v, lo, hi) {
  v = Number(v);
  if (!isFinite(v)) return lo;
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

// Section card wrapper — mirrors the ds-card pattern from pages-qeeg-analysis.js.
function _card(title, body, extra) {
  return '<div class="ds-card qeeg-ai-card">'
    + (title ? '<div class="ds-card__header"><h3>' + esc(title) + '</h3>' + (extra || '') + '</div>' : '')
    + '<div class="ds-card__body">' + body + '</div></div>';
}

// Tiny pill helper reused across panels.
function _pill(label, color) {
  return '<span class="qeeg-ai-chip" style="--chip-color:' + (color || 'var(--teal)') + '">'
    + esc(label) + '</span>';
}

// 10-20 positions for the 19-channel montage used by the demo payload.
// Coordinates are in a unit circle around (0,0) with radius 1 — the mini
// topomap renderer scales these into the SVG viewBox.
var _EEG_10_20 = {
  Fp1: [-0.30, 0.92], Fpz: [ 0.00, 0.97], Fp2: [ 0.30, 0.92],
  F7:  [-0.72, 0.59], F3:  [-0.42, 0.55], Fz:  [ 0.00, 0.58], F4:  [ 0.42, 0.55], F8:  [ 0.72, 0.59],
  T3:  [-0.95, 0.00], C3:  [-0.45, 0.00], Cz:  [ 0.00, 0.00], C4:  [ 0.45, 0.00], T4:  [ 0.95, 0.00],
  T5:  [-0.72,-0.59], P3:  [-0.42,-0.55], Pz:  [ 0.00,-0.58], P4:  [ 0.42,-0.55], T6:  [ 0.72,-0.59],
  O1:  [-0.30,-0.92], Oz:  [ 0.00,-0.97], O2:  [ 0.30,-0.92],
};

// Return an inline SVG mini-topomap of `weights` {channel: float},
// Electrodes above threshold highlighted in cyan/teal, rest dark.
// Matches the INTEGRATED_GRADIENTS explainability style.
function _miniTopomap(weights, opts) {
  weights = weights || {};
  opts = opts || {};
  var size = opts.size || 240;
  var r = size / 2 - 8;
  var cx = size / 2;
  var cy = size / 2;
  var vals = Object.keys(weights).map(function (k) { return Number(weights[k]); }).filter(isFinite);
  if (!vals.length) return '';
  var maxAbs = vals.reduce(function (m, v) { return Math.max(m, Math.abs(v)); }, 0) || 1;
  var eR = Math.max(7, Math.round(size / 22));
  // Head outline + nose marker + ears
  var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + size + ' ' + size
    + '" role="img" aria-label="Electrode importance topomap" class="qeeg-ai-topomap">'
    + '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="rgba(10,20,40,0.85)" '
    + 'stroke="rgba(255,255,255,0.18)" stroke-width="1.5"/>'
    + '<polygon points="' + cx + ',' + (cy - r - 6) + ' ' + (cx - 6) + ',' + (cy - r + 2) + ' '
    + (cx + 6) + ',' + (cy - r + 2) + '" fill="rgba(255,255,255,0.12)"/>'
    + '<ellipse cx="' + (cx - r - 4) + '" cy="' + cy + '" rx="3" ry="8" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="1"/>'
    + '<ellipse cx="' + (cx + r + 4) + '" cy="' + cy + '" rx="3" ry="8" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="1"/>';
  Object.keys(weights).forEach(function (ch) {
    var pos = _EEG_10_20[ch];
    if (!pos) return;
    var v = Number(weights[ch]);
    if (!isFinite(v)) return;
    var x = cx + pos[0] * r * 0.9;
    var y = cy - pos[1] * r * 0.9;
    var intensity = Math.abs(v) / maxAbs;
    // High importance: cyan/teal glow; low importance: dark muted
    var fill, stroke, textFill;
    if (intensity > 0.4) {
      fill = 'rgba(0,229,255,' + (0.15 + 0.65 * intensity).toFixed(2) + ')';
      stroke = 'rgba(0,229,255,' + (0.4 + 0.5 * intensity).toFixed(2) + ')';
      textFill = 'rgba(255,255,255,0.95)';
    } else {
      fill = 'rgba(30,40,60,' + (0.5 + 0.3 * intensity).toFixed(2) + ')';
      stroke = 'rgba(255,255,255,' + (0.08 + 0.12 * intensity).toFixed(2) + ')';
      textFill = 'rgba(255,255,255,' + (0.35 + 0.25 * intensity).toFixed(2) + ')';
    }
    svg += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + eR
      + '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="1.2"/>';
    svg += '<text x="' + x.toFixed(1) + '" y="' + (y + 3).toFixed(1)
      + '" text-anchor="middle" font-size="' + Math.max(7, Math.round(size / 28)) + '" font-weight="600" fill="' + textFill + '">'
      + esc(ch) + '</text>';
  });
  svg += '</svg>';
  return svg;
}

// ─────────────────────────────────────────────────────────────────────────────
// §1 Brain-age card
// ─────────────────────────────────────────────────────────────────────────────

export function renderBrainAgeCard(analysis) {
  if (!analysis || !analysis.brain_age) return '';
  var ba = analysis.brain_age;
  var predicted = Number(ba.predicted_years);
  var chrono = ba.chronological_years != null ? Number(ba.chronological_years) : null;
  var gap = ba.gap_years != null ? Number(ba.gap_years) : (chrono != null ? predicted - chrono : null);
  var pct = _clamp(Number(ba.gap_percentile || 50), 0, 100);
  var confidence = ba.confidence || 'moderate';

  // Gauge: 0–100 percentile sweep; pointer colour bands low/moderate/high.
  var gaugeColor = pct < 33 ? 'var(--green)' : pct < 67 ? 'var(--amber)' : 'var(--red)';
  var pointerAngle = (-90 + (pct / 100) * 180).toFixed(1); // arc from -90deg to +90deg
  var gaugeSvg = ''
    + '<svg class="qeeg-ai-gauge" viewBox="0 0 200 120" role="img" aria-label="Brain-age percentile gauge">'
    + '<path d="M 20 110 A 80 80 0 0 1 180 110" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="12"/>'
    + '<path d="M 20 110 A 80 80 0 0 1 ' + (100 + 80 * Math.cos(Math.PI * (1 - pct / 100))).toFixed(1)
    + ' ' + (110 - 80 * Math.sin(Math.PI * (1 - pct / 100))).toFixed(1)
    + '" fill="none" stroke="' + gaugeColor + '" stroke-width="12" stroke-linecap="round"/>'
    + '<g transform="translate(100,110) rotate(' + pointerAngle + ')">'
    + '<line x1="0" y1="0" x2="0" y2="-70" stroke="var(--text-primary)" stroke-width="2.5"/>'
    + '<circle cx="0" cy="0" r="5" fill="var(--text-primary)"/>'
    + '</g>'
    + '<text x="100" y="105" text-anchor="middle" font-size="13" font-weight="700" fill="var(--text-primary)">'
    + pct.toFixed(0) + 'th pct</text>'
    + '</svg>';

  var statsHtml = '<div class="qeeg-ai-ba-stats">'
    + '<div class="qeeg-ai-ba-stat"><span class="qeeg-ai-ba-stat__label">Predicted</span>'
    + '<span class="qeeg-ai-ba-stat__value">' + (isFinite(predicted) ? predicted.toFixed(1) + ' y' : '—') + '</span></div>'
    + '<div class="qeeg-ai-ba-stat"><span class="qeeg-ai-ba-stat__label">Chronological</span>'
    + '<span class="qeeg-ai-ba-stat__value">' + (chrono != null ? chrono + ' y' : '—') + '</span></div>'
    + '<div class="qeeg-ai-ba-stat"><span class="qeeg-ai-ba-stat__label">Gap</span>'
    + '<span class="qeeg-ai-ba-stat__value" style="color:' + gaugeColor + '">'
    + (gap != null ? (gap >= 0 ? '+' : '') + gap.toFixed(1) + ' y' : '—') + '</span></div>'
    + '<div class="qeeg-ai-ba-stat"><span class="qeeg-ai-ba-stat__label">Confidence</span>'
    + '<span class="qeeg-ai-ba-stat__value">' + esc(confidence) + '</span></div>'
    + '</div>';

  var topoHtml = '';
  if (ba.electrode_importance && Object.keys(ba.electrode_importance).length) {
    topoHtml = '<div class="qeeg-ai-ba-topo"><div class="qeeg-ai-ba-topo__label">'
      + 'Electrode importance (LRP saliency)</div>'
      + _miniTopomap(ba.electrode_importance, { size: 220 }) + '</div>';
  }

  var body = '<div class="qeeg-ai-ba">'
    + '<div class="qeeg-ai-ba-gauge-wrap">' + gaugeSvg + statsHtml + '</div>'
    + topoHtml
    + '</div>'
    + '<div class="qeeg-ai-footnote">Research/wellness use. Brain-age gap is a '
    + 'neurophysiological metric and does not indicate any medical condition.</div>';

  return _card('Brain age (research)', body);
}

// ─────────────────────────────────────────────────────────────────────────────
// §2 Similarity-index (risk-score) bars
// ─────────────────────────────────────────────────────────────────────────────

var _RISK_LABELS = {
  mdd_like:               'MDD-like',
  adhd_like:              'ADHD-like',
  anxiety_like:           'Anxiety-like',
  cognitive_decline_like: 'Cognitive-decline-like',
  tbi_residual_like:      'TBI-residual-like',
  insomnia_like:          'Insomnia-like',
};
var _RISK_ORDER = [
  'mdd_like', 'adhd_like', 'anxiety_like',
  'cognitive_decline_like', 'tbi_residual_like', 'insomnia_like',
];

export function renderRiskScoreBars(analysis) {
  if (!analysis || !analysis.risk_scores) return '';
  var rs = analysis.risk_scores;
  var rowsHtml = '';
  _RISK_ORDER.forEach(function (key) {
    if (!rs[key]) return;
    var s = rs[key] || {};
    var score = _clamp(Number(s.score || 0), 0, 1);
    var ci = Array.isArray(s.ci95) ? s.ci95 : [null, null];
    var lo = ci[0] != null ? _clamp(Number(ci[0]), 0, 1) : null;
    var hi = ci[1] != null ? _clamp(Number(ci[1]), 0, 1) : null;
    var pct = (score * 100).toFixed(1);
    var barColor = score > 0.66 ? 'var(--red)' : score > 0.33 ? 'var(--amber)' : 'var(--green)';
    var ciHtml = '';
    if (lo != null && hi != null) {
      var loPct = (lo * 100).toFixed(1);
      var hiPct = (hi * 100).toFixed(1);
      ciHtml = '<div class="qeeg-ai-riskbar__ci" style="left:' + loPct + '%;width:' + (hiPct - loPct).toFixed(2) + '%"></div>';
    }
    rowsHtml += '<div class="qeeg-ai-riskbar-row">'
      + '<div class="qeeg-ai-riskbar__label">' + esc(_RISK_LABELS[key] || key) + '</div>'
      + '<div class="qeeg-ai-riskbar" role="progressbar" aria-valuenow="' + pct
      + '" aria-valuemin="0" aria-valuemax="100" aria-label="' + esc(_RISK_LABELS[key] || key) + ' similarity index">'
      + '<div class="qeeg-ai-riskbar__fill" style="width:' + pct + '%;background:' + barColor + '"></div>'
      + ciHtml
      + '</div>'
      + '<div class="qeeg-ai-riskbar__value">' + pct + '%'
      + (lo != null && hi != null ? ' <span class="qeeg-ai-riskbar__ci-text">(CI ' + (lo * 100).toFixed(0)
        + '–' + (hi * 100).toFixed(0) + ')</span>' : '')
      + '</div></div>';
  });
  if (!rowsHtml) return '';

  var disclaimer = rs.disclaimer
    || 'These are neurophysiological similarity indices; they do not establish any medical condition.';

  var body = '<div class="qeeg-ai-risk-sub">Higher values = more similarity to the cohort pattern, '
    + 'not a likelihood of disease.</div>'
    + '<div class="qeeg-ai-riskbars">' + rowsHtml + '</div>'
    + '<div class="qeeg-ai-footnote">' + esc(disclaimer) + '</div>';
  return _card('Similarity indices (research/wellness use)', body);
}

// ─────────────────────────────────────────────────────────────────────────────
// §4 Centile curves (GAMLSS)
// ─────────────────────────────────────────────────────────────────────────────

function _centileColor(pct) {
  // Monotone from red (extreme low) → green (middle) → red (extreme high).
  if (pct <= 5 || pct >= 95) return 'var(--red)';
  if (pct <= 15 || pct >= 85) return 'var(--amber)';
  return 'var(--green)';
}

export function renderCentileCurves(analysis) {
  if (!analysis || !analysis.centiles) return '';
  var cent = analysis.centiles;
  var spectral = cent.spectral || {};
  var bands = spectral.bands || {};
  var bandOrder = ['delta', 'theta', 'alpha', 'beta', 'gamma'];
  var channelsSet = {};
  bandOrder.forEach(function (b) {
    if (bands[b] && bands[b].absolute_uv2) {
      Object.keys(bands[b].absolute_uv2).forEach(function (c) { channelsSet[c] = true; });
    }
  });
  var channels = Object.keys(channelsSet);
  if (!channels.length) return '';

  // z-score cross-reference (if present in legacy normative payload).
  var zSource = analysis.normative_zscores && analysis.normative_zscores.spectral
    && analysis.normative_zscores.spectral.bands || null;

  var headHtml = '<thead><tr><th>Channel</th>';
  bandOrder.forEach(function (b) {
    if (bands[b]) headHtml += '<th>' + esc(b) + '</th>';
  });
  headHtml += '</tr></thead>';

  var bodyHtml = '<tbody>';
  channels.forEach(function (ch) {
    bodyHtml += '<tr><td class="qeeg-ai-centile-ch">' + esc(ch) + '</td>';
    bandOrder.forEach(function (b) {
      if (!bands[b]) return;
      var pctVal = bands[b].absolute_uv2 && bands[b].absolute_uv2[ch];
      var zVal = zSource && zSource[b] && zSource[b].absolute_uv2 && zSource[b].absolute_uv2[ch];
      if (pctVal == null) {
        bodyHtml += '<td class="qeeg-ai-centile-cell">—</td>';
        return;
      }
      var p = _clamp(Number(pctVal), 0, 100);
      bodyHtml += '<td class="qeeg-ai-centile-cell">'
        + '<span class="qeeg-ai-centile-pill" style="--pill-color:' + _centileColor(p) + '" '
        + 'title="centile ' + p.toFixed(0) + '">' + p.toFixed(0) + '</span>'
        + (zVal != null ? '<span class="qeeg-ai-centile-z">z ' + (zVal >= 0 ? '+' : '')
          + Number(zVal).toFixed(2) + '</span>' : '')
        + '</td>';
    });
    bodyHtml += '</tr>';
  });
  bodyHtml += '</tbody>';

  var table = '<div class="qeeg-ai-centile-wrap"><table class="qeeg-ai-centile-table">'
    + headHtml + bodyHtml + '</table></div>';
  var ver = cent.norm_db_version ? '<div class="qeeg-ai-footnote">Norm DB: '
    + esc(cent.norm_db_version) + '</div>' : '';
  return _card('Centile curves (GAMLSS)',
    '<div class="qeeg-ai-risk-sub">Per-channel percentile within the normative cohort '
    + '(0–100). Centiles &lt; 5 or &gt; 95 are marked red; 5–15 / 85–95 amber.</div>'
    + table + ver);
}

// ─────────────────────────────────────────────────────────────────────────────
// §7 Explainability overlay
// ─────────────────────────────────────────────────────────────────────────────

export function renderExplainabilityOverlay(analysis) {
  if (!analysis || !analysis.explainability) return '';
  var ex = analysis.explainability;
  var per = ex.per_risk_score || {};
  var ood = ex.ood_score || {};
  var sanity = ex.adebayo_sanity_pass;

  // OOD badge
  var oodPct = ood.percentile != null ? Number(ood.percentile).toFixed(0) : null;
  var oodColor = oodPct != null ? (oodPct < 20 ? 'var(--red)' : oodPct > 80 ? 'var(--amber)' : 'var(--green)')
    : 'var(--text-secondary)';
  var oodHtml = '<div class="qeeg-ai-ood-badge" style="--ood-color:' + oodColor + '">'
    + '<span class="qeeg-ai-ood-badge__dot"></span>'
    + '<span>OOD percentile: <strong>' + (oodPct != null ? oodPct : '—') + '</strong></span>'
    + (ood.distance != null ? '<span class="qeeg-ai-ood-badge__sep">·</span>'
      + '<span>distance ' + Number(ood.distance).toFixed(2) + '</span>' : '')
    + (ood.interpretation ? '<span class="qeeg-ai-ood-badge__sep">·</span><span>'
      + esc(ood.interpretation) + '</span>' : '')
    + '</div>';

  var cardsHtml = '';
  _RISK_ORDER.forEach(function (riskKey) {
    var row = per[riskKey];
    if (!row) return;
    var top = Array.isArray(row.top_channels) ? row.top_channels.slice(0, 3) : [];
    var channelImp = row.channel_importance || {};

    // Build per-channel importance list
    var chipsHtml = top.map(function (t) {
      return '<div class="qeeg-ai-explain-chip">'
        + '<span class="qeeg-ai-explain-chip__ch">' + esc(t.ch) + '</span>'
        + '<span class="qeeg-ai-explain-chip__band">' + esc(t.band) + '</span>'
        + '<span class="qeeg-ai-explain-chip__score">' + Number(t.score || 0).toFixed(2) + '</span>'
        + '</div>';
    }).join('');

    // Aggregate per-channel importance for the brain map
    var flat = {};
    Object.keys(channelImp).forEach(function (ch) {
      var bandMap = channelImp[ch] || {};
      var total = 0;
      Object.keys(bandMap).forEach(function (b) {
        var v = Number(bandMap[b]);
        if (isFinite(v)) total += Math.abs(v);
      });
      flat[ch] = total;
    });
    var topo = '';
    if (sanity !== false && Object.keys(flat).length) {
      topo = _miniTopomap(flat, { size: 160 });
    }

    cardsHtml += '<div class="qeeg-ai-explain-card">'
      + '<div class="qeeg-ai-explain-card__header">'
      + '<strong class="qeeg-ai-explain-card__title">' + esc(_RISK_LABELS[riskKey] || riskKey) + '</strong>'
      + '<span class="qeeg-ai-explain-card__method">' + esc(ex.method || 'integrated_gradients') + '</span>'
      + '</div>'
      + (topo ? '<div class="qeeg-ai-explain-card__topo">' + topo + '</div>' : '')
      + '<div class="qeeg-ai-explain-card__channels">'
      + '<div class="qeeg-ai-explain-card__channels-label">Top channels + band</div>'
      + chipsHtml
      + '</div>'
      + '</div>';
  });

  var sanityFooter = '';
  if (sanity === false) {
    sanityFooter = '<div class="qeeg-ai-adebayo-fail" role="alert">'
      + 'Attribution disabled (sanity check failed). Channel-level importance is not shown '
      + 'because the model failed Adebayo et al. (2018) parameter / data randomisation tests.'
      + '</div>';
  } else {
    sanityFooter = '<div class="qeeg-ai-footnote">Adebayo sanity check: passed.</div>';
  }

  if (!cardsHtml && sanity !== false) return '';

  var body = '<div class="qeeg-ai-risk-sub">Per-condition top channels × band importance (integrated gradients). '
    + 'Highlighted electrodes indicate strongest contributors.</div>'
    + oodHtml
    + (sanity !== false ? '<div class="qeeg-ai-explain-card-grid">' + cardsHtml + '</div>' : '')
    + sanityFooter;
  return _card('Explainability (research)', body);
}

// ─────────────────────────────────────────────────────────────────────────────
// §5 Similar cases
// ─────────────────────────────────────────────────────────────────────────────

export function renderSimilarCases(analysis) {
  if (!analysis || !analysis.similar_cases) return '';
  var sc = analysis.similar_cases;

  // Aggregate fallback for privacy (K < 5).
  if (!Array.isArray(sc) && sc && typeof sc === 'object' && sc.aggregate) {
    var agg = sc.aggregate;
    var aggBody = '<div class="qeeg-ai-case-card qeeg-ai-case-card--agg">'
      + '<div class="qeeg-ai-case-card__title">Aggregate cohort</div>'
      + '<div class="qeeg-ai-case-card__row">Mean similarity: <strong>'
      + (agg.mean_similarity != null ? (Number(agg.mean_similarity) * 100).toFixed(0) + '%' : '—')
      + '</strong></div>'
      + '<div class="qeeg-ai-case-card__row">N cases: <strong>'
      + esc(agg.n_cases != null ? agg.n_cases : '—') + '</strong></div>'
      + (Array.isArray(agg.common_conditions) && agg.common_conditions.length
        ? '<div class="qeeg-ai-case-card__row">Common: '
          + agg.common_conditions.map(function (c) { return _pill(c); }).join('') + '</div>'
        : '')
      + '<div class="qeeg-ai-case-card__note">Fewer than 5 neighbours available — individual '
      + 'cases suppressed for privacy.</div>'
      + '</div>';
    return _card('Similar cases (top-K retrieval)',
      '<div class="qeeg-ai-case-rack qeeg-ai-case-rack--single">' + aggBody + '</div>');
  }

  if (!Array.isArray(sc) || !sc.length) return '';

  var cardsHtml = sc.map(function (cse) {
    var sim = Number(cse.similarity != null ? cse.similarity : cse.score);
    var simPct = isFinite(sim) ? (sim * 100).toFixed(0) + '%' : '—';
    var flagged = Array.isArray(cse.flagged_conditions) ? cse.flagged_conditions : [];
    var outcome = (cse.outcome || '').toLowerCase();
    var outcomeBadge;
    if (outcome === 'responder') {
      outcomeBadge = '<span class="qeeg-ai-chip" style="--chip-color:var(--green)">responder</span>';
    } else if (outcome === 'non-responder' || outcome === 'nonresponder' || outcome === 'non_responder') {
      outcomeBadge = '<span class="qeeg-ai-chip" style="--chip-color:var(--red)">non-responder</span>';
    } else if (outcome) {
      outcomeBadge = '<span class="qeeg-ai-chip">' + esc(outcome) + '</span>';
    } else {
      outcomeBadge = '';
    }
    var ageSex = '';
    if (cse.age_bucket || cse.age) ageSex += esc(String(cse.age_bucket || cse.age));
    if (cse.sex) ageSex += (ageSex ? ' · ' : '') + esc(String(cse.sex));
    return '<div class="qeeg-ai-case-card">'
      + '<div class="qeeg-ai-case-card__sim">' + simPct + '</div>'
      + (ageSex ? '<div class="qeeg-ai-case-card__meta">' + ageSex + '</div>' : '')
      + '<div class="qeeg-ai-case-card__flags">'
      + flagged.map(function (c) { return _pill(c, 'var(--blue)'); }).join('') + '</div>'
      + (outcomeBadge ? '<div class="qeeg-ai-case-card__outcome">' + outcomeBadge + '</div>' : '')
      + '<div class="qeeg-ai-case-card__summary">' + esc(cse.summary || cse.de_identified_summary || '') + '</div>'
      + '</div>';
  }).join('');

  var body = '<div class="qeeg-ai-risk-sub">De-identified neighbours from the normative/retrieval '
    + 'cohort; ordered by similarity. Use as reference only.</div>'
    + '<div class="qeeg-ai-case-rack">' + cardsHtml + '</div>';
  return _card('Similar cases (top-' + sc.length + ')', body);
}

// ─────────────────────────────────────────────────────────────────────────────
// §8 Protocol recommendation
// ─────────────────────────────────────────────────────────────────────────────

function _renderProtocolBlock(pr, isPrimary) {
  if (!pr) return '';
  var confColor = pr.confidence === 'high' ? 'var(--green)'
    : pr.confidence === 'low' ? 'var(--amber)' : 'var(--blue)';
  var dose = pr.dose || {};
  var plan = pr.session_plan || {};
  var contra = Array.isArray(pr.contraindications) ? pr.contraindications : [];
  var respWindow = Array.isArray(pr.expected_response_window_weeks)
    ? pr.expected_response_window_weeks : null;
  var cits = Array.isArray(pr.citations) ? pr.citations : [];

  var phases = ['induction', 'consolidation', 'maintenance'];
  var phaseLabels = {
    induction:     'S · Induction',
    consolidation: 'O · Consolidation',
    maintenance:   'Z/O · Maintenance',
  };
  var phaseTabs = '<div class="qeeg-ai-protocol-phases" role="tablist" aria-label="S-O-Z-O session plan">';
  phases.forEach(function (ph) {
    var p = plan[ph] || {};
    var sessions = p.sessions != null ? p.sessions : '—';
    phaseTabs += '<div class="qeeg-ai-protocol-phase">'
      + '<div class="qeeg-ai-protocol-phase__head">' + esc(phaseLabels[ph]) + '</div>'
      + '<div class="qeeg-ai-protocol-phase__sessions"><strong>' + esc(String(sessions))
      + '</strong> sessions</div>'
      + (p.notes ? '<div class="qeeg-ai-protocol-phase__notes">' + esc(p.notes) + '</div>' : '')
      + '</div>';
  });
  phaseTabs += '</div>';

  var doseRow = '<div class="qeeg-ai-protocol-dose">'
    + (dose.sessions != null ? _pill('Total: ' + dose.sessions + ' sessions') : '')
    + (dose.intensity ? _pill('Intensity: ' + dose.intensity) : '')
    + (dose.duration_min != null ? _pill('Duration: ' + dose.duration_min + ' min') : '')
    + (dose.frequency ? _pill('Frequency: ' + dose.frequency) : '')
    + '</div>';

  var contraHtml = contra.length
    ? '<div class="qeeg-ai-protocol-row"><span class="qeeg-ai-protocol-row__label">'
      + 'Contraindications</span><div class="qeeg-ai-protocol-row__chips">'
      + contra.map(function (c) { return _pill(c, 'var(--red)'); }).join('') + '</div></div>'
    : '';

  var windowHtml = respWindow
    ? '<div class="qeeg-ai-protocol-row"><span class="qeeg-ai-protocol-row__label">'
      + 'Expected response window</span><div>' + esc(respWindow[0]) + '–' + esc(respWindow[1])
      + ' weeks</div></div>'
    : '';

  var citsHtml = '';
  if (cits.length) {
    citsHtml = '<ol class="qeeg-ai-protocol-cites">'
      + cits.map(function (c) {
        var href = c.url || (c.pmid ? 'https://pubmed.ncbi.nlm.nih.gov/' + c.pmid + '/' : null)
          || (c.doi ? 'https://doi.org/' + c.doi : null);
        return '<li value="' + esc(c.n || '') + '">'
          + (href ? '<a href="' + esc(href) + '" target="_blank" rel="noopener">' : '')
          + esc(c.title || (c.pmid ? 'PMID ' + c.pmid : c.doi || ''))
          + (c.year ? ' (' + esc(c.year) + ')' : '')
          + (href ? '</a>' : '')
          + '</li>';
      }).join('')
      + '</ol>';
  }

  var rationale = pr.rationale ? '<div class="qeeg-ai-protocol-rationale">'
    + esc(pr.rationale) + '</div>' : '';

  var headerBadge = pr.confidence
    ? '<span class="qeeg-ai-chip" style="--chip-color:' + confColor + '">confidence: '
      + esc(pr.confidence) + '</span>'
    : '';

  return '<div class="qeeg-ai-protocol-card' + (isPrimary ? ' qeeg-ai-protocol-card--primary' : '') + '">'
    + '<div class="qeeg-ai-protocol-card__head">'
    + '<div class="qeeg-ai-protocol-card__title">'
    + esc(pr.primary_modality || 'Protocol') + ' — ' + esc(pr.target_region || '')
    + '</div>' + headerBadge + '</div>'
    + rationale
    + doseRow
    + phaseTabs
    + contraHtml
    + windowHtml
    + (citsHtml ? '<div class="qeeg-ai-protocol-row qeeg-ai-protocol-row--cites">'
      + '<span class="qeeg-ai-protocol-row__label">References</span>' + citsHtml + '</div>'
      : '')
    + '</div>';
}

export function renderProtocolRecommendationCard(analysis) {
  if (!analysis || !analysis.protocol_recommendation) return '';
  var pr = analysis.protocol_recommendation;
  var primaryHtml = _renderProtocolBlock(pr, true);

  var altsHtml = '';
  if (Array.isArray(pr.alternative_protocols) && pr.alternative_protocols.length) {
    altsHtml = '<details class="qeeg-ai-protocol-alts">'
      + '<summary>Alternative protocols (' + pr.alternative_protocols.length + ')</summary>'
      + pr.alternative_protocols.map(function (alt) {
        return _renderProtocolBlock(alt, false);
      }).join('')
      + '</details>';
  }

  var body = '<div class="qeeg-ai-risk-sub">Research-derived protocol suggestion. Clinician review '
    + 'required before application.</div>'
    + primaryHtml + altsHtml;
  return _card('Protocol recommendation (research)', body);
}

// ─────────────────────────────────────────────────────────────────────────────
// §9 Longitudinal sparklines
// ─────────────────────────────────────────────────────────────────────────────

function _sparklineSvg(values, opts) {
  values = Array.isArray(values) ? values.filter(function (v) { return v != null && isFinite(v); }) : [];
  if (values.length < 2) return '';
  opts = opts || {};
  var w = opts.width || 160;
  var h = opts.height || 36;
  var pad = 3;
  var lo = Math.min.apply(null, values);
  var hi = Math.max.apply(null, values);
  var rng = hi - lo || 1;
  var points = values.map(function (v, i) {
    var x = pad + (i / (values.length - 1)) * (w - pad * 2);
    var y = h - pad - ((v - lo) / rng) * (h - pad * 2);
    return x.toFixed(1) + ',' + y.toFixed(1);
  }).join(' ');
  var last = values[values.length - 1];
  var first = values[0];
  var dir = last > first ? 'up' : last < first ? 'down' : 'flat';
  var color = opts.color || (dir === 'up' ? 'var(--green)' : dir === 'down' ? 'var(--red)' : 'var(--blue)');
  return '<svg class="qeeg-ai-sparkline" viewBox="0 0 ' + w + ' ' + h + '" role="img" '
    + 'aria-label="' + esc(opts.ariaLabel || 'sparkline') + '">'
    + '<polyline fill="none" stroke="' + color + '" stroke-width="2" points="' + points + '"/>'
    + '</svg>';
}

export function renderLongitudinalSparklines(analysis) {
  if (!analysis || !analysis.longitudinal) return '';
  var lg = analysis.longitudinal;
  var trajectories = lg.feature_trajectories || {};
  var keys = Object.keys(trajectories);
  if (!keys.length && !lg.brain_age_trajectory && !lg.normative_distance_trajectory) return '';

  var rowsHtml = '';
  keys.forEach(function (k) {
    var t = trajectories[k] || {};
    var values = Array.isArray(t.values) ? t.values : [];
    var dates = Array.isArray(t.dates) ? t.dates : [];
    var spark = _sparklineSvg(values, { ariaLabel: k + ' trajectory' });
    if (!spark) return;
    var first = values[0];
    var last = values[values.length - 1];
    var slope = t.slope != null ? Number(t.slope) : (last - first);
    var rci = t.rci != null ? Number(t.rci).toFixed(2) : '—';
    var sig = t.significant ? '<span class="qeeg-ai-chip" style="--chip-color:var(--teal)">sig</span>'
      : '<span class="qeeg-ai-chip" style="--chip-color:var(--text-tertiary)">ns</span>';
    rowsHtml += '<div class="qeeg-ai-traj-row">'
      + '<div class="qeeg-ai-traj-row__label">' + esc(t.label || k) + '</div>'
      + '<div class="qeeg-ai-traj-row__spark">' + spark + '</div>'
      + '<div class="qeeg-ai-traj-row__stats">'
      + '<span>' + (isFinite(first) ? Number(first).toFixed(2) : '—') + ' → '
      + (isFinite(last) ? Number(last).toFixed(2) : '—') + '</span>'
      + '<span class="qeeg-ai-traj-row__slope">Δ ' + (isFinite(slope) && slope >= 0 ? '+' : '')
      + (isFinite(slope) ? slope.toFixed(2) : '—') + '</span>'
      + '<span class="qeeg-ai-traj-row__rci">RCI ' + rci + '</span>'
      + sig
      + '</div>'
      + (dates.length ? '<div class="qeeg-ai-traj-row__dates">' + dates.map(esc).join(' · ') + '</div>' : '')
      + '</div>';
  });

  var aggHtml = '';
  if (lg.normative_distance_trajectory) {
    var ndt = lg.normative_distance_trajectory;
    var vals = Array.isArray(ndt.values) ? ndt.values : [];
    var spark = _sparklineSvg(vals, { ariaLabel: 'Normative distance trajectory', color: 'var(--teal)' });
    aggHtml = '<div class="qeeg-ai-traj-row qeeg-ai-traj-row--agg">'
      + '<div class="qeeg-ai-traj-row__label"><strong>Normative distance (agg.)</strong></div>'
      + '<div class="qeeg-ai-traj-row__spark">' + spark + '</div>'
      + '<div class="qeeg-ai-traj-row__stats">n=' + vals.length + '</div>'
      + '</div>';
  }

  var metaBits = [];
  if (lg.n_sessions != null) metaBits.push(lg.n_sessions + ' sessions');
  if (lg.baseline_date) metaBits.push('baseline ' + esc(lg.baseline_date));
  if (lg.days_since_baseline != null) metaBits.push(lg.days_since_baseline + ' days since baseline');
  var meta = metaBits.length
    ? '<div class="qeeg-ai-risk-sub">' + metaBits.join(' · ') + '</div>' : '';

  return _card('Longitudinal trajectory', meta + rowsHtml + aggHtml);
}

// ─────────────────────────────────────────────────────────────────────────────
// Composite renderer
// ─────────────────────────────────────────────────────────────────────────────

export function renderAiUpgradePanels(analysis) {
  if (!analysis) return '';
  var parts = [
    renderBrainAgeCard(analysis),
    renderRiskScoreBars(analysis),
    renderCentileCurves(analysis),
    renderExplainabilityOverlay(analysis),
    renderSimilarCases(analysis),
    renderProtocolRecommendationCard(analysis),
    renderLongitudinalSparklines(analysis),
  ].filter(Boolean);
  if (!parts.length) return '';
  return '<div class="qeeg-section-divider"></div>'
    + '<div class="qeeg-ai-group" data-testid="qeeg-ai-upgrade-panels">'
    + parts.join('') + '</div>';
}

// ─────────────────────────────────────────────────────────────────────────────
// §10 Copilot widget
// ─────────────────────────────────────────────────────────────────────────────

// Hard-coded offline demo exchanges — referenced against the demo analysis
// payload (Fz theta hyper, posterior alpha hyper, F3/F4 asymmetry, brain-age
// gap +3y). Every response ends with the mandatory clinician-handoff line.
var _COPILOT_DEMO_REPLIES = [
  {
    match: /brain ?age|age gap|gap/i,
    reply: 'Brain-age gap is +3.0 years (predicted 38, chronological 35), sitting at the '
      + '72nd percentile of the normative cohort (moderate confidence). This is a neurophysiological '
      + 'metric, not a disease indicator. This is research/wellness info — please consult '
      + 'your clinician for care decisions.',
  },
  {
    match: /mdd|depress/i,
    reply: 'MDD-like similarity index is 0.71 (CI 0.63–0.79). Key drivers include positive '
      + 'F3/F4 frontal alpha asymmetry and elevated frontal theta at Fz. Similarity indices '
      + 'reflect pattern overlap with a research cohort and should not be read as a likelihood '
      + 'of depression. This is research/wellness info — please consult your clinician for care decisions.',
  },
  {
    match: /protocol|recommend|rtms|stim/i,
    reply: 'Primary suggested protocol is 10 Hz rTMS over the left DLPFC (Beam F3-based targeting), '
      + '8/12/monthly S-O-Z-O session plan, expected response window 3–6 weeks. Review contraindications '
      + '(seizure risk, implants) before scheduling. This is research/wellness info — please consult '
      + 'your clinician for care decisions.',
  },
  {
    match: /similar|neighbour|neighbor|case/i,
    reply: 'Top-8 retrieval returned a majority of MDD-flagged responders (6/8) with comparable '
      + 'posterior alpha hyper-amplitude and frontal alpha asymmetry profiles. Full list is in '
      + 'the Similar cases panel. This is research/wellness info — please consult your clinician '
      + 'for care decisions.',
  },
  {
    match: /.*/,
    reply: 'I can discuss the brain-age gap, similarity indices, the protocol suggestion, '
      + 'explainability, or similar-case neighbours shown on this page. This is research/wellness '
      + 'info — please consult your clinician for care decisions.',
  },
];

var _COPILOT_DANGEROUS = /\b(suicide|self[- ]harm|kill myself|overdose|kill someone|how much .* to die)\b/i;

function _copilotBubble(author, text) {
  var cls = author === 'you' ? 'qeeg-ai-copilot__bubble qeeg-ai-copilot__bubble--user'
    : 'qeeg-ai-copilot__bubble qeeg-ai-copilot__bubble--bot';
  return '<div class="' + cls + '"><div class="qeeg-ai-copilot__author">' + esc(author)
    + '</div><div class="qeeg-ai-copilot__text">' + esc(text) + '</div></div>';
}

function _copilotOfflineReply(text) {
  if (_COPILOT_DANGEROUS.test(text)) {
    return 'I can\'t help with that — please consult your clinician or reach your local crisis '
      + 'service. This is research/wellness info — please consult your clinician for care decisions.';
  }
  for (var i = 0; i < _COPILOT_DEMO_REPLIES.length; i++) {
    if (_COPILOT_DEMO_REPLIES[i].match.test(text)) return _COPILOT_DEMO_REPLIES[i].reply;
  }
  return _COPILOT_DEMO_REPLIES[_COPILOT_DEMO_REPLIES.length - 1].reply;
}

// Mount the widget into `containerId`. If a live WebSocket connection is not
// available (demo mode / Netlify preview), falls back to the scripted offline
// reply list above so the widget always renders something useful.
export function mountCopilotWidget(containerId, analysisId) {
  if (typeof document === 'undefined') return null;
  var el = document.getElementById(containerId);
  if (!el) return null;

  el.innerHTML = ''
    + '<div class="qeeg-ai-copilot" role="complementary" aria-label="qEEG AI copilot">'
    + '<div class="qeeg-ai-copilot__head">'
    + '<span class="qeeg-ai-copilot__title">qEEG copilot</span>'
    + '<span class="qeeg-ai-copilot__status" data-role="status">connecting…</span>'
    + '<button class="qeeg-ai-copilot__toggle" aria-expanded="true" aria-label="Minimise copilot">–</button>'
    + '</div>'
    + '<div class="qeeg-ai-copilot__body" data-role="body">'
    + '<div class="qeeg-ai-copilot__stream" data-role="stream" aria-live="polite"></div>'
    + '<div class="qeeg-ai-copilot__chips" data-role="chips">'
    + '<button class="qeeg-ai-copilot__chip" data-q="Explain the brain-age gap">brain-age gap</button>'
    + '<button class="qeeg-ai-copilot__chip" data-q="Why MDD-like?">why MDD-like?</button>'
    + '<button class="qeeg-ai-copilot__chip" data-q="What protocol do you suggest?">protocol?</button>'
    + '<button class="qeeg-ai-copilot__chip" data-q="Show similar cases">similar cases</button>'
    + '</div>'
    + '<form class="qeeg-ai-copilot__form" data-role="form" autocomplete="off">'
    + '<input class="qeeg-ai-copilot__input" data-role="input" type="text" '
    + 'placeholder="Ask about this analysis…" aria-label="Ask the copilot" maxlength="500"/>'
    + '<button class="qeeg-ai-copilot__send" type="submit">Send</button>'
    + '</form>'
    + '</div>'
    + '</div>';

  var state = {
    ws: null,
    mode: 'offline',
    stream: el.querySelector('[data-role="stream"]'),
    status: el.querySelector('[data-role="status"]'),
    form: el.querySelector('[data-role="form"]'),
    input: el.querySelector('[data-role="input"]'),
    body: el.querySelector('[data-role="body"]'),
    toggle: el.querySelector('.qeeg-ai-copilot__toggle'),
    minimised: false,
    // Streaming bubble state — populated when an ``llm_delta`` arrives.
    activeBubble: null,    // HTMLElement of the .qeeg-ai-copilot__text node
    activeChip: null,      // HTMLElement of the "calling tool…" chip
    activeBubbleText: '',  // Accumulated streamed text (plain).
    activeComplete: false,
  };

  function setStatus(s, cls) {
    if (!state.status) return;
    state.status.textContent = s;
    state.status.className = 'qeeg-ai-copilot__status qeeg-ai-copilot__status--' + (cls || 'ok');
  }

  function appendBubble(author, text) {
    if (!state.stream) return null;
    state.stream.insertAdjacentHTML('beforeend', _copilotBubble(author, text));
    state.stream.scrollTop = state.stream.scrollHeight;
    // Return the text node of the most-recently appended bubble so the
    // caller can append streaming deltas directly.
    var bubbles = state.stream.querySelectorAll('.qeeg-ai-copilot__bubble');
    if (!bubbles.length) return null;
    return bubbles[bubbles.length - 1].querySelector('.qeeg-ai-copilot__text');
  }

  function _ensureStreamingBubble() {
    // Create-on-first-delta so we don't leave empty bubbles on error.
    if (state.activeBubble && !state.activeComplete) return state.activeBubble;
    state.activeBubble = appendBubble('copilot', '');
    state.activeBubbleText = '';
    state.activeComplete = false;
    return state.activeBubble;
  }

  function _setToolChip(toolName) {
    // Render a small grey chip above the active bubble. Replaces any
    // existing chip for this turn.
    _clearToolChip();
    if (!state.stream || !toolName) return;
    var chipHtml = '<div class="qeeg-ai-copilot__toolchip" data-role="toolchip">'
      + '↗ calling tool: <code>' + esc(String(toolName)) + '</code>'
      + '</div>';
    state.stream.insertAdjacentHTML('beforeend', chipHtml);
    var chips = state.stream.querySelectorAll('[data-role="toolchip"]');
    state.activeChip = chips.length ? chips[chips.length - 1] : null;
    state.stream.scrollTop = state.stream.scrollHeight;
  }

  function _clearToolChip() {
    if (state.activeChip && state.activeChip.parentNode) {
      state.activeChip.parentNode.removeChild(state.activeChip);
    }
    state.activeChip = null;
  }

  function _finalizeBubble(finalText) {
    // Set bubble to the authoritative final text (server-sanitised).
    var node = state.activeBubble || _ensureStreamingBubble();
    if (node) {
      node.textContent = finalText != null ? String(finalText) : state.activeBubbleText;
    }
    _clearToolChip();
    state.activeComplete = true;
    state.activeBubble = null;
    state.activeBubbleText = '';
    if (state.stream) state.stream.scrollTop = state.stream.scrollHeight;
  }

  // Welcome bubble.
  appendBubble('copilot',
    'Hello! I can answer questions about the brain-age gap, similarity indices, the '
    + 'protocol suggestion, and similar-case neighbours on this page. This is '
    + 'research/wellness info — please consult your clinician for care decisions.');

  // Try to open a WebSocket. Fall back to offline mode silently on failure.
  try {
    var proto = (typeof window !== 'undefined' && window.location && window.location.protocol === 'https:')
      ? 'wss://' : 'ws://';
    var host = (typeof window !== 'undefined' && window.location) ? window.location.host : '';
    var base = (typeof window !== 'undefined' && window.DEEPSYNAPS_COPILOT_WS_BASE)
      ? window.DEEPSYNAPS_COPILOT_WS_BASE
      : proto + host + '/api/v1/qeeg-copilot';
    var url = base.replace(/\/$/, '') + '/' + encodeURIComponent(analysisId || 'demo');
    // WebSockets can't carry Authorization headers from the browser; pass the
    // access token via query string. Backend enforces the same RBAC + clinic
    // gate as the REST routes (qeeg_copilot_router._resolve_ws_actor).
    try {
      var _tok = null;
      try {
        // localStorage is the same source api.js reads from.
        if (typeof window !== 'undefined' && window.localStorage) {
          _tok = window.localStorage.getItem('ds_access_token');
        }
      } catch (_) {}
      if (_tok) url += (url.indexOf('?') === -1 ? '?' : '&') + 'token=' + encodeURIComponent(_tok);
    } catch (_) { /* fall through; backend will close 1008 */ }
    if (typeof WebSocket !== 'undefined') {
      state.ws = new WebSocket(url);
      setStatus('connecting…', 'ok');
      state.ws.addEventListener('open', function () {
        state.mode = 'online';
        setStatus('online', 'ok');
      });
      state.ws.addEventListener('message', function (evt) {
        try {
          var msg = JSON.parse(evt.data);
          if (!msg || typeof msg !== 'object') {
            appendBubble('copilot', String(evt.data));
            return;
          }
          // ── New streaming protocol (type: "llm_delta") ────────────
          if (msg.type === 'llm_delta' && msg.chunk) {
            var chunk = msg.chunk;
            var ctype = chunk.type;
            if (ctype === 'delta' && chunk.text) {
              var node = _ensureStreamingBubble();
              if (node) {
                state.activeBubbleText += String(chunk.text);
                node.textContent = state.activeBubbleText;
                if (state.stream) state.stream.scrollTop = state.stream.scrollHeight;
              }
              return;
            }
            if (ctype === 'tool_use' && chunk.tool) {
              _setToolChip(chunk.tool);
              return;
            }
            if (ctype === 'tool_result') {
              _clearToolChip();
              return;
            }
            if (ctype === 'error' && chunk.text) {
              _clearToolChip();
              appendBubble('copilot', 'Error: ' + String(chunk.text));
              state.activeBubble = null;
              state.activeComplete = true;
              return;
            }
            // ``final`` chunks are informational here — the server
            // will follow with an authoritative ``reply`` event that
            // finalises the bubble.
            return;
          }
          // ── Legacy wire-format events ──────────────────────────────
          if (msg.type === 'refusal' || msg.type === 'refuse') {
            _clearToolChip();
            state.activeBubble = null;
            state.activeComplete = true;
            appendBubble('copilot',
              (msg.content || msg.text
                || 'I can\'t help with that — please consult your clinician.')
              + ' This is research/wellness info — please consult your clinician for care decisions.');
            return;
          }
          if (msg.type === 'reply') {
            _finalizeBubble(msg.content != null ? msg.content : msg.text);
            return;
          }
          if (msg.type === 'welcome') {
            // Welcome already rendered; no-op.
            return;
          }
          if (msg.type === 'pong') {
            return;
          }
          if (msg.type === 'error') {
            _clearToolChip();
            appendBubble('copilot', 'Error: ' + String(msg.content || msg.text || 'unknown'));
            state.activeBubble = null;
            state.activeComplete = true;
            return;
          }
          // Generic fallthrough — legacy payloads.
          if (msg.text) {
            appendBubble('copilot', msg.text);
            return;
          }
        } catch (_) {
          // Plain text payload.
        }
        appendBubble('copilot', String(evt.data));
      });
      state.ws.addEventListener('error', function () {
        state.mode = 'offline';
        setStatus('offline (demo replies)', 'warn');
      });
      state.ws.addEventListener('close', function () {
        state.mode = 'offline';
        setStatus('offline (demo replies)', 'warn');
      });
    } else {
      setStatus('offline (demo replies)', 'warn');
    }
  } catch (_) {
    state.mode = 'offline';
    setStatus('offline (demo replies)', 'warn');
  }

  function handleSend(text) {
    text = (text || '').trim();
    if (!text) return;
    appendBubble('you', text);
    // Client-side refuse for dangerous queries regardless of mode.
    if (_COPILOT_DANGEROUS.test(text)) {
      appendBubble('copilot',
        'I can\'t help with that — please consult your clinician or reach your local crisis '
        + 'service. This is research/wellness info — please consult your clinician for care decisions.');
      return;
    }
    if (state.mode === 'online' && state.ws && state.ws.readyState === 1) {
      try {
        // Server ``qeeg_copilot_router`` expects ``{type:"message",content}``.
        // Reset any pending streaming bubble so the next ``llm_delta``
        // creates a fresh assistant bubble.
        state.activeBubble = null;
        state.activeComplete = true;
        _clearToolChip();
        state.ws.send(JSON.stringify({ type: 'message', content: text }));
      } catch (_) {
        appendBubble('copilot', _copilotOfflineReply(text));
      }
    } else {
      appendBubble('copilot', _copilotOfflineReply(text));
    }
  }

  if (state.form) {
    state.form.addEventListener('submit', function (e) {
      e.preventDefault();
      var t = state.input ? state.input.value : '';
      if (state.input) state.input.value = '';
      handleSend(t);
    });
  }
  Array.prototype.forEach.call(el.querySelectorAll('.qeeg-ai-copilot__chip'), function (chip) {
    chip.addEventListener('click', function () {
      handleSend(chip.getAttribute('data-q') || chip.textContent || '');
    });
  });
  if (state.toggle) {
    state.toggle.addEventListener('click', function () {
      state.minimised = !state.minimised;
      if (state.body) state.body.style.display = state.minimised ? 'none' : '';
      state.toggle.setAttribute('aria-expanded', state.minimised ? 'false' : 'true');
      state.toggle.textContent = state.minimised ? '+' : '–';
    });
  }

  return {
    send: handleSend,
    close: function () { try { state.ws && state.ws.close(); } catch (_) {} },
    _state: state,
  };
}

// Export the offline reply helper for testing.
export { _copilotOfflineReply as _copilotOfflineReplyForTest };

// ─────────────────────────────────────────────────────────────────────────────
// NiiVue 3-plane viewer (browser-side) — used by the MRI Analyzer page.
//
// Exports:
//   T1_MNI_URL   - public MNI152 T1 NIfTI (MIT-licensed demo asset)
//   mountNiiVue(containerId, opts) — lazy-loads NiiVue from CDN, wires 3 canvases
//                                    (axial/coronal/sagittal) + marker sidebar,
//                                    degrades gracefully when volumeUrl is null
//                                    or the CDN fetch fails.
// License: NiiVue is MIT. We inject a <script> tag at runtime — no npm dep.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Public MNI152 T1-weighted demo volume (MIT-licensed, hosted by the NiiVue
 * maintainers). Used when we don't have a patient-specific T1 on disk (demo
 * mode + overlay-only renders).
 */
export var T1_MNI_URL = 'https://niivue.github.io/niivue-demo-images/mni152.nii.gz';

/** URL to the NiiVue UMD CDN build. Stable track, pinned by maintainer. */
var _NIIVUE_CDN_URL = 'https://niivue.github.io/niivue/features/niivue.umd.js';

/** Single-flight promise for the CDN <script> inject. */
var _niivuePromise = null;

/**
 * Lazily fetch the NiiVue bundle via a <script src> injection, returning a
 * promise that resolves with the global ``niivue`` module (``window.niivue``).
 * Rejects if the script fails to load or the browser is offline.
 */
export function _loadNiiVue() {
  if (_niivuePromise) return _niivuePromise;
  _niivuePromise = new Promise(function (resolve, reject) {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      reject(new Error('NiiVue requires a browser document'));
      return;
    }
    if (window.niivue && window.niivue.Niivue) {
      resolve(window.niivue);
      return;
    }
    var existing = document.querySelector('script[data-ds-niivue="1"]');
    if (existing) {
      existing.addEventListener('load', function () { resolve(window.niivue); });
      existing.addEventListener('error', function () { reject(new Error('NiiVue CDN load failed')); });
      return;
    }
    var s = document.createElement('script');
    s.src = _NIIVUE_CDN_URL;
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.setAttribute('data-ds-niivue', '1');
    s.onload = function () {
      if (window.niivue && window.niivue.Niivue) resolve(window.niivue);
      else reject(new Error('NiiVue bundle loaded but global missing'));
    };
    s.onerror = function () { reject(new Error('NiiVue CDN fetch failed')); };
    document.head.appendChild(s);
  });
  return _niivuePromise;
}

/**
 * Render a NiiVue degraded placeholder into ``container`` and return it.
 * Always idempotent — safe to call multiple times. Placeholder mirrors the
 * "ds-niivue-grid" styling so the page layout doesn't jump around when the
 * CDN is unreachable.
 */
function _renderNiiVuePlaceholder(container, reason) {
  var msg = reason || 'Viewer unavailable — click a stim target to see its MNI coordinates';
  container.innerHTML =
    '<div class="ds-niivue-grid ds-niivue-grid--placeholder">'
    + '<div class="ds-niivue-grid__placeholder" role="status">'
    + '<div class="ds-niivue-grid__placeholder-icon" aria-hidden="true">T1</div>'
    + '<div class="ds-niivue-grid__placeholder-msg">' + esc(msg) + '</div>'
    + '</div></div>';
}

/**
 * Render the NiiVue grid shell (3 canvases + marker sidebar) into ``container``.
 * Safe to call before NiiVue is loaded — canvases are attached later.
 */
function _renderNiiVueShell(container, markers) {
  markers = Array.isArray(markers) ? markers : [];
  var sidebar = markers.map(function (m, i) {
    var label = esc(m.label || ('Target ' + (i + 1)));
    var xyz = Array.isArray(m.xyz) ? m.xyz : [];
    var xyzText = xyz.length === 3
      ? '[' + xyz.map(function (v) { return (typeof v === 'number' ? v.toFixed(1) : esc(v)); }).join(', ') + ']'
      : '—';
    var color = esc(m.color || '#f43f5e');
    return '<button type="button" class="ds-niivue-marker" '
      + 'data-idx="' + i + '" '
      + 'data-x="' + (xyz[0] != null ? esc(xyz[0]) : '') + '" '
      + 'data-y="' + (xyz[1] != null ? esc(xyz[1]) : '') + '" '
      + 'data-z="' + (xyz[2] != null ? esc(xyz[2]) : '') + '">'
      + '<span class="ds-niivue-marker__dot" style="background:' + color + '"></span>'
      + '<span class="ds-niivue-marker__label">' + label + '</span>'
      + '<span class="ds-niivue-marker__xyz">' + esc(xyzText) + '</span>'
      + '</button>';
  }).join('');
  container.innerHTML =
    '<div class="ds-niivue-grid">'
    + '<div class="ds-niivue-grid__canvases">'
    + '<canvas class="ds-niivue-canvas" data-plane="axial" aria-label="Axial slice"></canvas>'
    + '<canvas class="ds-niivue-canvas" data-plane="coronal" aria-label="Coronal slice"></canvas>'
    + '<canvas class="ds-niivue-canvas" data-plane="sagittal" aria-label="Sagittal slice"></canvas>'
    + '</div>'
    + '<aside class="ds-niivue-grid__sidebar" aria-label="Stim target markers">'
    + '<div class="ds-niivue-grid__sidebar-head">Stim targets (' + markers.length + ')</div>'
    + (sidebar || '<div class="ds-niivue-grid__sidebar-empty">No markers</div>')
    + '</aside>'
    + '</div>';
}

/**
 * Mount a NiiVue 3-plane viewer into the DOM element identified by
 * ``containerId``.
 *
 * Parameters
 * ----------
 * containerId : string
 *     ``id`` of the container <div>. The function replaces its contents.
 * opts : object
 *     - volumeUrl  : URL to a NIfTI base volume (e.g. T1 MNI). If null/falsy
 *                    the viewer short-circuits to a degraded placeholder.
 *     - overlayUrl : optional overlay volume URL (second volume, warm colormap).
 *     - markers    : optional Array<{xyz:[x,y,z], label?, color?}>. Rendered as
 *                    a sidebar; clicking re-centers the NiiVue crosshair.
 *     - onReady    : optional callback(nv, canvases) fired once the volume loaded.
 *
 * Returns
 * -------
 * object
 *     ``{ ok: boolean, reason?: string }``. ``ok=false`` when the viewer had to
 *     degrade — the caller can surface a tooltip but MUST NOT throw.
 */
export async function mountNiiVue(containerId, opts) {
  opts = opts || {};
  var container = (typeof document !== 'undefined')
    ? document.getElementById(containerId)
    : null;
  if (!container) return { ok: false, reason: 'container_missing' };

  var markers = Array.isArray(opts.markers) ? opts.markers : [];

  // Fast-path: no volume URL → render static placeholder + marker pills.
  if (!opts.volumeUrl) {
    _renderNiiVueShell(container, markers);
    // Replace the 3 canvases with a "viewer unavailable" strip but keep the
    // sidebar so users can still read MNI coordinates.
    var canvases = container.querySelector('.ds-niivue-grid__canvases');
    if (canvases) {
      canvases.innerHTML =
        '<div class="ds-niivue-grid__placeholder" role="status">'
        + '<div class="ds-niivue-grid__placeholder-icon" aria-hidden="true">T1</div>'
        + '<div class="ds-niivue-grid__placeholder-msg">'
        + 'Viewer unavailable — click a stim target to see its MNI coordinates'
        + '</div></div>';
    }
    return { ok: false, reason: 'volume_missing' };
  }

  // Render the shell first so the marker sidebar paints even before NiiVue
  // finishes loading (the CDN fetch can take 1-2s on cold connections).
  _renderNiiVueShell(container, markers);

  var niivue;
  try {
    niivue = await _loadNiiVue();
  } catch (err) {
    _renderNiiVuePlaceholder(container, 'Viewer unavailable — offline or CDN unreachable');
    return { ok: false, reason: 'cdn_failed' };
  }

  if (!niivue || !niivue.Niivue) {
    _renderNiiVuePlaceholder(container, 'Viewer unavailable — NiiVue module missing');
    return { ok: false, reason: 'niivue_missing' };
  }

  try {
    var axial = container.querySelector('canvas[data-plane="axial"]');
    var coronal = container.querySelector('canvas[data-plane="coronal"]');
    var sagittal = container.querySelector('canvas[data-plane="sagittal"]');
    var nvAxial = new niivue.Niivue({ show3Dcrosshair: true, backColor: [0, 0, 0, 1] });
    var nvCor = new niivue.Niivue({ show3Dcrosshair: true, backColor: [0, 0, 0, 1] });
    var nvSag = new niivue.Niivue({ show3Dcrosshair: true, backColor: [0, 0, 0, 1] });
    if (axial) nvAxial.attachToCanvas(axial);
    if (coronal) nvCor.attachToCanvas(coronal);
    if (sagittal) nvSag.attachToCanvas(sagittal);

    var volumes = [{ url: opts.volumeUrl }];
    await Promise.all([
      nvAxial.loadVolumes(volumes),
      nvCor.loadVolumes(volumes),
      nvSag.loadVolumes(volumes),
    ]);

    // Overlay (optional — second volume painted warm with alpha).
    if (opts.overlayUrl) {
      try {
        await Promise.all([
          nvAxial.addVolumeFromUrl({ url: opts.overlayUrl, colormap: 'warm', opacity: 0.6 }),
          nvCor.addVolumeFromUrl({ url: opts.overlayUrl, colormap: 'warm', opacity: 0.6 }),
          nvSag.addVolumeFromUrl({ url: opts.overlayUrl, colormap: 'warm', opacity: 0.6 }),
        ]);
      } catch (_e) { /* overlay optional — keep base T1 visible */ }
    }

    // Pin each canvas to a specific slice plane. NiiVue uses integer codes:
    // 0=axial, 1=coronal, 2=sagittal, 3=3D.
    try { nvAxial.setSliceType(0); } catch (_e) {}
    try { nvCor.setSliceType(1);   } catch (_e) {}
    try { nvSag.setSliceType(2);   } catch (_e) {}

    // Marker sidebar click → re-center all three views at that MNI point.
    var sidebarBtns = container.querySelectorAll('.ds-niivue-marker');
    sidebarBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var x = parseFloat(btn.getAttribute('data-x'));
        var y = parseFloat(btn.getAttribute('data-y'));
        var z = parseFloat(btn.getAttribute('data-z'));
        if (!isFinite(x) || !isFinite(y) || !isFinite(z)) return;
        try { nvAxial.scene.crosshairPos = [x, y, z]; nvAxial.drawScene(); } catch (_e) {}
        try { nvCor.scene.crosshairPos = [x, y, z]; nvCor.drawScene(); } catch (_e) {}
        try { nvSag.scene.crosshairPos = [x, y, z]; nvSag.drawScene(); } catch (_e) {}
        container.querySelectorAll('.ds-niivue-marker').forEach(function (b) {
          b.classList.remove('is-active');
        });
        btn.classList.add('is-active');
      });
    });

    if (typeof opts.onReady === 'function') {
      try { opts.onReady({ axial: nvAxial, coronal: nvCor, sagittal: nvSag }); } catch (_e) {}
    }
    return { ok: true };
  } catch (err) {
    _renderNiiVuePlaceholder(container, 'Viewer failed to initialise');
    return { ok: false, reason: 'init_failed' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTRACT_V3 §1 — Fusion recommendation card
// ─────────────────────────────────────────────────────────────────────────────

function _fusionModalityBadge(used) {
  used = Array.isArray(used) ? used : [];
  var qeeg = used.indexOf('qeeg') >= 0;
  var mri = used.indexOf('mri') >= 0;
  var parts = [];
  parts.push('<span class="qeeg-ai-chip" style="--chip-color:'
    + (qeeg ? 'var(--teal, #26c6da)' : 'rgba(255,255,255,0.2)') + '">'
    + 'qEEG ' + (qeeg ? '&#x2713;' : '&#x2013;') + '</span>');
  parts.push('<span class="qeeg-ai-chip" style="--chip-color:'
    + (mri ? 'var(--purple, #9575cd)' : 'rgba(255,255,255,0.2)') + '">'
    + 'MRI ' + (mri ? '&#x2713;' : '&#x2013;') + '</span>');
  if (!qeeg || !mri) {
    parts.push('<span class="qeeg-ai-chip" style="--chip-color:#ffa726">single-modality</span>');
  }
  return parts.join(' ');
}

function _agreementPill(score) {
  var s = Number(score);
  if (!isFinite(s)) s = 0;
  var color = s >= 0.6 ? '#66bb6a' : (s >= 0.2 ? '#ffa726' : '#ef5350');
  var label = 'agreement ' + s.toFixed(2);
  return '<span class="qeeg-ai-chip" style="--chip-color:' + color + '">' + esc(label) + '</span>';
}

function _boostBadge(boost) {
  var b = Number(boost);
  if (!isFinite(b)) b = 1.0;
  return '<span class="qeeg-ai-chip" style="--chip-color:#42a5f5">&#xD7;'
    + b.toFixed(2) + '</span>';
}

function _supportList(title, support) {
  support = Array.isArray(support) ? support : [];
  if (!support.length) {
    return '<details class="qeeg-ai-support">'
      + '<summary>' + esc(title) + ' (0)</summary>'
      + '<div class="qeeg-ai-support__empty">No biomarker support.</div>'
      + '</details>';
  }
  var rows = support.map(function (s) {
    var z = (s && typeof s.z === 'number') ? s.z.toFixed(2) : '–';
    var w = (s && typeof s.weight === 'number') ? s.weight.toFixed(2) : '–';
    var v = (s && typeof s.value === 'number') ? s.value.toFixed(2) : '–';
    return '<li><code>' + esc(s && s.biomarker ? s.biomarker : '?') + '</code>'
      + ' value=' + esc(v) + ', z=' + esc(z) + ', weight=' + esc(w) + '</li>';
  }).join('');
  return '<details class="qeeg-ai-support">'
    + '<summary>' + esc(title) + ' (' + support.length + ')</summary>'
    + '<ul class="qeeg-ai-support__list">' + rows + '</ul>'
    + '</details>';
}

function _fusionCitations(citations) {
  citations = Array.isArray(citations) ? citations : [];
  if (!citations.length) return '';
  var items = citations.map(function (c) {
    var title = c && c.title ? c.title : (c && c.doi ? 'DOI ' + c.doi : 'Reference');
    var href = c && c.url ? c.url : (c && c.doi ? 'https://doi.org/' + c.doi : '#');
    return '<li><a href="' + esc(href) + '" target="_blank" rel="noopener noreferrer">'
      + esc(title) + '</a></li>';
  }).join('');
  return '<ul class="qeeg-ai-citations">' + items + '</ul>';
}

function _fusionRecommendationBlock(rec) {
  if (!rec) return '';
  var mod = rec.primary_modality || '?';
  var target = rec.target_region || '?';
  var conflicts = Array.isArray(rec.conflicts) ? rec.conflicts : [];
  var conflictHtml = '';
  if (conflicts.length) {
    conflictHtml = '<div class="qeeg-ai-conflicts">'
      + '<strong>Conflicts:</strong><ul>'
      + conflicts.map(function (c) {
          return '<li>' + esc(c.field || 'field') + ': qeeg=' + esc(c.qeeg || '?')
            + ' vs mri=' + esc(c.mri || '?') + ' &mdash; '
            + esc(c.resolution || 'clinician review') + '</li>';
        }).join('')
      + '</ul></div>';
  }
  return '<div class="qeeg-ai-fusion-rec" data-testid="fusion-rec">'
    + '<div class="qeeg-ai-fusion-rec__head">'
    + '<span class="qeeg-ai-chip" style="--chip-color:#7e57c2">' + esc(mod) + '</span>'
    + '<strong class="qeeg-ai-fusion-rec__target">' + esc(target) + '</strong>'
    + ' ' + _boostBadge(rec.fusion_boost)
    + ' ' + _agreementPill(rec.agreement_score)
    + ' <span class="qeeg-ai-chip" style="--chip-color:#26a69a">'
    + esc(rec.confidence || 'moderate') + '</span>'
    + '</div>'
    + (rec.rationale ? '<p class="qeeg-ai-fusion-rec__rationale">'
      + esc(rec.rationale) + '</p>' : '')
    + _supportList('qEEG support', rec.qeeg_support)
    + _supportList('MRI support', rec.mri_support)
    + _fusionCitations(rec.citations)
    + conflictHtml
    + '</div>';
}

/**
 * Render a multi-modal fusion recommendation card (CONTRACT_V3 §1).
 *
 * @param {object|null} fusion — a FusionRecommendation envelope, or null.
 * @returns {string} HTML string. Returns '' when fusion is null-ish or has
 *   no recommendations.
 */
export function renderFusionCard(fusion) {
  if (!fusion || !fusion.recommendations || !fusion.recommendations.length) {
    return '';
  }
  var badges = _fusionModalityBadge(fusion.modalities_used);
  var body = fusion.recommendations.map(_fusionRecommendationBlock).join('');
  var envConflicts = Array.isArray(fusion.conflicts) ? fusion.conflicts : [];
  var envConflictsHtml = '';
  if (envConflicts.length) {
    envConflictsHtml = '<div class="qeeg-ai-conflicts qeeg-ai-conflicts--envelope">'
      + '<strong>Cross-modality conflicts:</strong><ul>'
      + envConflicts.map(function (c) {
          return '<li>' + esc(c.field || 'field') + ': qeeg=' + esc(c.qeeg || '?')
            + ' vs mri=' + esc(c.mri || '?') + ' &mdash; '
            + esc(c.resolution || 'clinician review') + '</li>';
        }).join('')
      + '</ul></div>';
  }
  var summary = fusion.summary ? '<p class="qeeg-ai-fusion__summary">'
    + esc(fusion.summary) + '</p>' : '';
  var disclaimer = '<footer class="qeeg-ai-fusion__disclaimer">'
    + esc(fusion.disclaimer || 'Decision-support tool. Not a medical device.')
    + '</footer>';
  var header = '<div class="qeeg-ai-fusion__head">' + badges + '</div>';
  return _card('Multi-modal fusion',
    header + summary + envConflictsHtml + body + disclaimer);
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTRACT_V3 §2 — SSE pipeline progress client
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Open an EventSource against `url` and wire event handlers. Returns a
 * cleanup object with `.close()` that tears the stream down.
 *
 * When `EventSource` is undefined (JSDOM / older browser), the returned
 * object has `ok:false` and callers may fall back to their existing
 * polling loop.
 *
 * @param {string}   containerId — DOM id the stream belongs to (used as
 *                   a stable key for cleanup; can be empty).
 * @param {string}   url — the SSE endpoint URL (must include ?token=…).
 * @param {object=}  opts — { onStage, onComplete, onError }.
 * @returns {{ok:boolean, close:Function}}
 */
export function mountPipelineSSE(containerId, url, opts) {
  opts = opts || {};
  if (typeof EventSource === 'undefined') {
    return { ok: false, close: function () {} };
  }
  var es;
  try {
    es = new EventSource(url);
  } catch (err) {
    if (typeof opts.onError === 'function') opts.onError(err);
    return { ok: false, close: function () {} };
  }
  es.addEventListener('stage_update', function (ev) {
    var payload = null;
    try { payload = JSON.parse(ev.data || '{}'); } catch (_e) {}
    if (typeof opts.onStage === 'function') opts.onStage(payload || {});
  });
  es.addEventListener('complete', function (ev) {
    var payload = null;
    try { payload = JSON.parse(ev.data || '{}'); } catch (_e) {}
    if (typeof opts.onComplete === 'function') opts.onComplete(payload || {});
    try { es.close(); } catch (_e) {}
  });
  es.addEventListener('error', function (ev) {
    if (typeof opts.onError === 'function') opts.onError(ev);
  });
  return {
    ok: true,
    close: function () { try { es.close(); } catch (_e) {} },
  };
}

