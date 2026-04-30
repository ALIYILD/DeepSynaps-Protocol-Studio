// ─────────────────────────────────────────────────────────────────────────────
// qeeg-brain-map-template.js
//
// Shared section renderers for the QEEG Brain Map report (Phase 1).
// Both the patient-facing renderer (qeeg-patient-report.js) and the
// clinician-facing renderer (qeeg-clinician-report.js) compose the same
// section helpers from here so the on-screen and print views stay in sync
// with the QEEGBrainMapReport contract from Phase 0
// (apps/api/app/services/qeeg_report_template.py).
//
// Contract entry points consumed:
//   report.header                     → renderBrainMapHeader
//   report.indicators                 → renderIndicatorCard (× 5)
//   report.lobe_summary               → renderLobeTable
//   report.brain_function_score       → renderBrainFunctionScoreCard
//   report.source_map                 → renderSourceMapSection
//   report.dk_atlas                   → renderLobeSection / renderDKRegionCard
//   report.ai_narrative.findings      → renderFindings
//   report.ai_narrative.citations     → renderCitations
//   report.quality.qc_flags           → renderQCFlags
//   report.disclaimer                 → renderDisclaimer
//
// Regulatory copy: never "diagnosis"/"diagnostic"/"treatment recommendation".
// Use "may indicate" / "is associated with" framing.
// ─────────────────────────────────────────────────────────────────────────────

function esc(v) {
  if (v == null) return '';
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtPct(v) {
  if (v == null || isNaN(v)) return '—';
  return Math.round(Number(v) * 10) / 10 + '%ile';
}

function fmtNum(v, digits) {
  if (v == null || isNaN(v)) return '—';
  return Number(v).toFixed(digits == null ? 1 : digits);
}

function fmtZ(v) {
  if (v == null || isNaN(v)) return '—';
  var n = Number(v);
  return (n >= 0 ? '+' : '') + n.toFixed(2);
}

function bandColor(band) {
  if (band === 'low') return '#3b82f6';
  if (band === 'high') return '#ef4444';
  if (band === 'flag') return '#dc2626';
  if (band === 'balanced' || band === 'typical') return '#10b981';
  return '#6b7280';
}

function zColor(z) {
  if (z == null || isNaN(z)) return '#9ca3af';
  var n = Number(z);
  if (n <= -2.58) return '#1d4ed8';
  if (n <= -1.96) return '#3b82f6';
  if (n >= 2.58) return '#b91c1c';
  if (n >= 1.96) return '#ef4444';
  return '#10b981';
}

function renderBrainMapHeader(header, opts) {
  var h = header || {};
  var variant = (opts && opts.variant) || 'patient';
  var title = variant === 'clinician'
    ? 'qEEG Brain Map — Clinician Review'
    : 'Brain Function Mapping';
  return '<header class="qeeg-cover__header ds-print">'
    + '<h2 style="margin:0 0 4px;font-size:18px">' + esc(title) + '</h2>'
    + '<dl class="qeeg-cover__meta" style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:0;font-size:12px;color:var(--text-secondary)">'
    + (h.client_name ? '<div><dt>Name</dt><dd style="margin:0;color:var(--text-primary)">' + esc(h.client_name) + '</dd></div>' : '')
    + (h.sex ? '<div><dt>Sex</dt><dd style="margin:0;color:var(--text-primary)">' + esc(h.sex) + '</dd></div>' : '')
    + (h.dob || h.age_years != null ? '<div><dt>DOB / Age</dt><dd style="margin:0;color:var(--text-primary)">'
        + esc(h.dob || '') + (h.age_years != null ? ' (' + fmtNum(h.age_years, 1) + 'y)' : '') + '</dd></div>' : '')
    + (h.eeg_acquisition_date ? '<div><dt>EEG date</dt><dd style="margin:0;color:var(--text-primary)">' + esc(h.eeg_acquisition_date) + '</dd></div>' : '')
    + (h.eyes_condition ? '<div><dt>Condition</dt><dd style="margin:0;color:var(--text-primary)">' + esc(h.eyes_condition.replace('_', ' ')) + '</dd></div>' : '')
    + '</dl></header>';
}

function renderIndicatorCard(label, indicator, helpText) {
  var i = indicator || {};
  var color = bandColor(i.band);
  var valueLine = (i.value != null ? fmtNum(i.value, 1) : '—') + (i.unit ? ' <span style="font-size:11px;color:var(--text-secondary)">' + esc(i.unit) + '</span>' : '');
  return '<article class="qeeg-indicator-card ds-card ds-print" style="border-left:4px solid ' + color + '">'
    + '<div class="ds-card__body" style="padding:14px">'
    + '<h4 style="margin:0 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:0.4px;color:var(--text-secondary)">' + esc(label) + '</h4>'
    + '<div style="display:flex;align-items:baseline;gap:12px;margin-bottom:6px">'
    + '<div style="font-size:22px;font-weight:600">' + valueLine + '</div>'
    + '<div style="font-size:13px;color:' + color + '">' + esc(fmtPct(i.percentile)) + '</div>'
    + '</div>'
    + (helpText ? '<p style="margin:0;font-size:12px;color:var(--text-secondary);line-height:1.4">' + esc(helpText) + '</p>' : '')
    + '</div></article>';
}

function renderIndicatorGrid(indicators) {
  var ind = indicators || {};
  var items = [
    ['Frontal Lobe Development (TBR)', ind.tbr, 'Theta/Beta ratio. May indicate frontal-lobe maturation status when measured eyes-open.'],
    ['Information Processing Speed', ind.occipital_paf, 'Peak alpha frequency at occipital electrodes. Best measured eyes-closed.'],
    ['Alpha Wave Reactivity', ind.alpha_reactivity, 'Eyes-open vs eyes-closed alpha modulation. A typical brain shows roughly 2× alpha eyes-closed.'],
    ['Frontal Alpha Asymmetry (FAA)', ind.brain_balance, 'Inter-hemispheric alpha-band laterality. Research-grade marker — not regulatory-cleared.'],
    ['AI Brain Development Age', ind.ai_brain_age, 'Model-estimated brain age compared to chronological age.'],
  ];
  return '<section class="qeeg-cover__indicators ds-print" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-bottom:24px">'
    + items.map(function (it) { return renderIndicatorCard(it[0], it[1], it[2]); }).join('')
    + '</section>';
}

function renderLobeTable(lobeSummary) {
  var ls = lobeSummary || {};
  var rows = [
    ['Frontal',   'Voluntary movement, high-level cognitive function',   ls.frontal],
    ['Temporal',  'Auditory processing, memory encoding',                 ls.temporal],
    ['Parietal',  'Sensory processing & integration, learning',           ls.parietal],
    ['Occipital', 'Visual perception',                                    ls.occipital],
  ];
  var body = rows.map(function (r) {
    var lobe = r[2] || {};
    return '<tr>'
      + '<th scope="row" style="padding:10px;text-align:left">' + esc(r[0]) + '</th>'
      + '<td style="padding:10px;color:var(--text-secondary);font-size:12px">' + esc(r[1]) + '</td>'
      + '<td style="padding:10px;color:' + bandColor(lobe.lt_band) + '">' + esc(fmtPct(lobe.lt_percentile)) + '</td>'
      + '<td style="padding:10px;color:' + bandColor(lobe.rt_band) + '">' + esc(fmtPct(lobe.rt_percentile)) + '</td>'
      + '</tr>';
  }).join('');
  return '<section class="qeeg-lobe-table ds-card ds-print" style="margin-bottom:24px">'
    + '<div class="ds-card__header"><h3 style="margin:0">Brain Activity by Hemisphere</h3></div>'
    + '<div class="ds-card__body">'
    + '<table style="width:100%;border-collapse:collapse"><thead><tr>'
    + '<th style="padding:10px;text-align:left">Lobe</th>'
    + '<th style="padding:10px;text-align:left">Function</th>'
    + '<th style="padding:10px;text-align:left">Left</th>'
    + '<th style="padding:10px;text-align:left">Right</th>'
    + '</tr></thead><tbody>' + body + '</tbody></table>'
    + '<p style="margin:12px 0 0;font-size:11px;color:var(--text-secondary)">Scores are standardized; 50%ile is average. Below 16%ile or above 84%ile indicates activity one standard deviation outside the typical range.</p>'
    + '</div></section>';
}

function renderBrainFunctionScoreCard(score) {
  var s = score || {};
  var n = (s.score_0_100 != null) ? Number(s.score_0_100) : null;
  var color = (n == null) ? '#9ca3af' : (n < 30 ? '#ef4444' : n < 70 ? '#10b981' : '#3b82f6');
  return '<section class="qeeg-bfs ds-card ds-print" style="margin-bottom:24px">'
    + '<div class="ds-card__header"><h3 style="margin:0">Standardized Brain Function Score</h3></div>'
    + '<div class="ds-card__body" style="display:flex;gap:24px;align-items:center;flex-wrap:wrap">'
    + '<div style="font-size:48px;font-weight:700;color:' + color + '">' + (n != null ? n.toFixed(1) : '—') + '</div>'
    + '<div style="flex:1;min-width:200px;font-size:12px;color:var(--text-secondary);line-height:1.5">'
    + 'Aggregate score across the four lobes versus age and sex-matched norms. ' + (n != null && n > 30 && n < 70 ? 'Within the typical range.' : (n != null ? 'May indicate atypical pattern — discuss with clinician.' : ''))
    + '<div style="margin-top:6px;font-size:10px">Formula: ' + esc(s.formula_version || 'phase0_placeholder_v1') + ' (see Phase 0 docs)</div>'
    + '</div></div></section>';
}

function renderSourceMapSection(sourceMap) {
  var sm = sourceMap || {};
  var img = sm.topomap_url
    ? '<img src="' + esc(sm.topomap_url) + '" alt="Source-localized topomap" style="max-width:100%;border-radius:8px"/>'
    : '<div style="padding:32px;text-align:center;color:var(--text-secondary);font-size:12px;border:1px dashed var(--border-color);border-radius:8px">Topomap not generated. Source localization requires fsaverage template.</div>';
  return '<section class="qeeg-source-map ds-card ds-print" style="margin-bottom:24px">'
    + '<div class="ds-card__header"><h3 style="margin:0">Brain Source Image</h3></div>'
    + '<div class="ds-card__body">' + img
    + '<p style="margin:12px 0 0;font-size:12px;color:var(--text-secondary)">3D source-localized power compared to age and sex-matched norms. Red areas indicate higher-than-typical activity; blue areas indicate lower-than-typical.</p>'
    + '</div></section>';
}

function renderDKRegionCard(region) {
  var r = region || {};
  var pctL = fmtPct(r.lt_percentile);
  var pctR = fmtPct(r.rt_percentile);
  var z = r.z_score;
  var summaryColor = zColor(z);

  var fnList = (r.functions || []).map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('');
  var symList = (r.decline_symptoms || []).map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');

  return '<details class="qeeg-roi-card ds-card ds-print" style="margin:6px 0;border-left:3px solid ' + summaryColor + '">'
    + '<summary style="padding:10px 14px;cursor:pointer;list-style:none">'
    + '<div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap">'
    + '<div><strong>' + esc(r.code || r.roi) + '</strong> ' + esc(r.name || r.roi) + '</div>'
    + '<div style="font-size:12px;color:var(--text-secondary)">L: <span style="color:var(--text-primary)">' + esc(pctL) + '</span> &nbsp; R: <span style="color:var(--text-primary)">' + esc(pctR) + '</span>'
    + (z != null ? ' &nbsp; z: <span style="color:' + summaryColor + '">' + esc(fmtZ(z)) + '</span>' : '')
    + '</div></div></summary>'
    + '<div style="padding:0 14px 14px">'
    + (fnList ? '<h5 style="margin:8px 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:0.4px">Key functions</h5><ul style="margin:0 0 8px 18px;font-size:12px;line-height:1.5">' + fnList + '</ul>' : '')
    + (symList ? '<h5 style="margin:8px 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:0.4px">Symptoms associated with functional decline</h5><ul style="margin:0 0 0 18px;font-size:12px;line-height:1.5">' + symList + '</ul>' : '')
    + '</div></details>';
}

function _filterByLobe(dkAtlas, lobe) {
  return (dkAtlas || []).filter(function (r) { return r.lobe === lobe; });
}

function renderLobeSection(title, regions, intro) {
  if (!regions || !regions.length) return '';
  // Group lh + rh per ROI so each region appears once with both percentiles.
  var byROI = {};
  regions.forEach(function (r) {
    if (!byROI[r.roi]) byROI[r.roi] = { code: r.code, roi: r.roi, name: r.name, lobe: r.lobe, functions: r.functions, decline_symptoms: r.decline_symptoms, z_score: r.z_score };
    if (r.hemisphere === 'lh' && r.lt_percentile != null) byROI[r.roi].lt_percentile = r.lt_percentile;
    if (r.hemisphere === 'rh' && r.rt_percentile != null) byROI[r.roi].rt_percentile = r.rt_percentile;
    if (r.z_score != null && (byROI[r.roi].z_score == null || Math.abs(r.z_score) > Math.abs(byROI[r.roi].z_score))) {
      byROI[r.roi].z_score = r.z_score;
    }
  });
  var grouped = Object.keys(byROI).map(function (k) { return byROI[k]; }).sort(function (a, b) {
    return String(a.code || '').localeCompare(String(b.code || ''), undefined, { numeric: true });
  });
  var cards = grouped.map(renderDKRegionCard).join('');
  return '<section class="qeeg-lobe-section ds-print" style="margin-bottom:24px">'
    + '<h3 style="margin:0 0 4px">' + esc(title) + '</h3>'
    + (intro ? '<p style="margin:0 0 12px;font-size:12px;color:var(--text-secondary);line-height:1.5">' + esc(intro) + '</p>' : '')
    + '<div class="qeeg-roi-grid">' + cards + '</div>'
    + '</section>';
}

function renderAllLobeSections(dkAtlas) {
  return renderLobeSection('Frontal Lobe', _filterByLobe(dkAtlas, 'frontal'),
      'Responsible for high-level executive functions: attention, working memory, planning, problem-solving, and voluntary movement.')
    + renderLobeSection('Temporal Lobe', _filterByLobe(dkAtlas, 'temporal'),
      'Responsible for auditory processing, memory encoding, and facial / object recognition.')
    + renderLobeSection('Parietal Lobe', _filterByLobe(dkAtlas, 'parietal'),
      'Responsible for integrating sensory information, body-position awareness, and spatial reasoning.')
    + renderLobeSection('Occipital Lobe', _filterByLobe(dkAtlas, 'occipital'),
      'Responsible for visual perception.');
}

function renderFindings(findings) {
  if (!findings || !findings.length) return '';
  var rows = findings.map(function (f) {
    var color = f.severity === 'flag' ? '#dc2626' : f.severity === 'watch' ? '#f59e0b' : '#6b7280';
    return '<li style="margin-bottom:6px"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + color + ';margin-right:8px"></span>' + esc(f.description || '') + '</li>';
  }).join('');
  return '<section class="qeeg-findings ds-card ds-print" style="margin-bottom:16px">'
    + '<div class="ds-card__header"><h3 style="margin:0">Observed Patterns</h3></div>'
    + '<div class="ds-card__body"><ul style="margin:0;padding-left:18px;font-size:13px">' + rows + '</ul></div></section>';
}

function renderCitations(citations) {
  if (!citations || !citations.length) return '';
  var rows = citations.map(function (c) {
    var label = c.title || (c.pmid ? 'PMID ' + c.pmid : '') || (c.doi ? 'DOI ' + c.doi : 'Reference');
    var url = c.pmid
      ? 'https://pubmed.ncbi.nlm.nih.gov/' + encodeURIComponent(String(c.pmid)) + '/'
      : (c.doi ? 'https://doi.org/' + encodeURIComponent(String(c.doi)) : null);
    var line = url
      ? '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(label) + '</a>'
      : esc(label);
    if (c.year) line += ' <span style="color:var(--text-secondary);font-size:11px">(' + esc(c.year) + ')</span>';
    return '<li style="margin-bottom:4px;font-size:12px">' + line + '</li>';
  }).join('');
  return '<section class="qeeg-citations ds-card ds-print" style="margin-bottom:16px">'
    + '<div class="ds-card__header"><h3 style="margin:0">Citations</h3></div>'
    + '<div class="ds-card__body"><ol style="margin:0;padding-left:18px">' + rows + '</ol></div></section>';
}

function renderQCFlags(quality) {
  var q = quality || {};
  var flags = q.qc_flags || [];
  var lim = q.limitations || [];
  if (!flags.length && !lim.length && !q.n_clean_epochs) return '';
  return '<section class="qeeg-qc ds-card ds-print" style="margin-bottom:16px">'
    + '<div class="ds-card__header"><h3 style="margin:0">Recording Quality</h3></div>'
    + '<div class="ds-card__body">'
    + (q.n_clean_epochs != null ? '<p style="margin:0 0 6px;font-size:12px">Clean epochs: <strong>' + esc(q.n_clean_epochs) + '</strong></p>' : '')
    + (q.channels_used && q.channels_used.length ? '<p style="margin:0 0 6px;font-size:12px">Channels used: ' + q.channels_used.map(esc).join(', ') + '</p>' : '')
    + (flags.length ? '<p style="margin:0 0 6px;font-size:12px">QC flags: <span style="color:#f59e0b">' + flags.map(esc).join(', ') + '</span></p>' : '')
    + (lim.length ? '<p style="margin:0;font-size:12px;color:var(--text-secondary)">Limitations: ' + lim.map(esc).join('; ') + '</p>' : '')
    + '</div></section>';
}

function renderDisclaimer(report, variant) {
  var disclaimer = (report && report.disclaimer)
    || 'Research and wellness use only. This brain map summary is informational and is not a medical diagnosis or treatment recommendation. Discuss any findings with a qualified clinician.';
  var sub = variant === 'clinician'
    ? 'Generated by the DeepSynaps Studio brain-map pipeline. Schema version: ' + esc(((report || {}).provenance || {}).schema_version || '?') + '. Pipeline: ' + esc(((report || {}).provenance || {}).pipeline_version || '?') + '. Norm DB: ' + esc(((report || {}).provenance || {}).norm_db_version || '?') + '.'
    : 'These results are intended to support — not replace — a clinician\'s assessment.';
  return '<footer class="qeeg-disclaimer ds-print" style="margin-top:24px;padding:14px;background:#f8fafc;border-radius:8px;font-size:12px;color:var(--text-secondary);line-height:1.5">'
    + '<p style="margin:0 0 6px"><strong>Disclaimer.</strong> ' + esc(disclaimer) + '</p>'
    + '<p style="margin:0;font-size:11px">' + sub + '</p>'
    + '</footer>';
}

function emptyState(message) {
  return '<div class="ds-card ds-print"><div class="ds-card__body" style="padding:24px;text-align:center;color:var(--text-secondary);font-size:13px">'
    + esc(message || 'No brain map report available.')
    + '</div></div>';
}

export {
  esc,
  fmtPct,
  fmtNum,
  fmtZ,
  bandColor,
  zColor,
  renderBrainMapHeader,
  renderIndicatorCard,
  renderIndicatorGrid,
  renderLobeTable,
  renderBrainFunctionScoreCard,
  renderSourceMapSection,
  renderDKRegionCard,
  renderLobeSection,
  renderAllLobeSections,
  renderFindings,
  renderCitations,
  renderQCFlags,
  renderDisclaimer,
  emptyState,
};
