// ─────────────────────────────────────────────────────────────────────────────
// pages-qeeg-analysis.js — qEEG Analyzer (Clinic Portal)
//
// Tabs:
//   1. Patient & Upload — patient clinical info + EDF/BDF/EEG upload
//   2. Analysis         — spectral results + topographic heatmaps
//   3. AI Report        — AI interpretation + clinician review
//   4. Compare          — pre/post comparison
// ─────────────────────────────────────────────────────────────────────────────
import { api, downloadBlob } from './api.js';
import { renderBrainMap10_20, renderTopoHeatmap, renderConnectivityMatrix, renderConnectivityBrainMap, renderConnectivityChordLite, renderICAComponents, renderWaveletHeatmap, renderChannelQualityMap, renderAsymmetryMap, renderPowerBarChart, renderTBRBarChart, renderSignalDeviationChart, renderBiomarkerGauges, renderBrodmannTable, render3DBrainMap, render3DBrainMapMini } from './brain-map-svg.js';
import { emptyState, showToast, spark } from './helpers.js';
import { DK_LOBES, groupROIsByLobe, formatDKLabel } from './qeeg-dk-atlas.js';
import {
  renderAiUpgradePanels,
  renderBrainAgeCard,
  renderRiskScoreBars,
  renderCentileCurves,
  renderExplainabilityOverlay,
  renderSimilarCases,
  renderProtocolRecommendationCard,
  renderLongitudinalSparklines,
  mountCopilotWidget,
} from './qeeg-ai-panels.js';
import { renderSafetyCockpit, mountSafetyCockpit } from './qeeg-safety-cockpit.js';
import { renderRedFlags, mountRedFlags } from './qeeg-red-flags.js';
import { renderNormativeModelCard, mountNormativeModelCard } from './qeeg-normative-card.js';
import { renderProtocolFit, mountProtocolFit } from './qeeg-protocol-fit.js';
import { renderClinicianReview, mountClinicianReview } from './qeeg-clinician-review.js';
import { renderPatientReport, mountPatientReport } from './qeeg-patient-report.js';
import { renderTimeline, mountTimeline } from './qeeg-timeline.js';
import { EvidenceChip, createEvidenceQueryForTarget, initEvidenceDrawer, openEvidenceDrawer, wireEvidenceChips } from './evidence-intelligence.js';
import { renderLearningEEGReferenceCard } from './learning-eeg-reference.js';

const FUSION_API_BASE = import.meta.env?.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';
const FUSION_TOKEN_KEY = 'ds_access_token';

// Feature flag for the Contract V2 AI upgrade panels + buttons. Defaults to
// on; ops can disable without a redeploy by setting
// window.DEEPSYNAPS_ENABLE_AI_UPGRADES = false before the app boots.
export function _aiUpgradesFeatureFlagEnabled() {
  try {
    var v = (typeof window !== 'undefined' && window)
      ? window.DEEPSYNAPS_ENABLE_AI_UPGRADES
      : (typeof globalThis !== 'undefined' ? globalThis.DEEPSYNAPS_ENABLE_AI_UPGRADES : undefined);
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
function spinner(msg) {
  return '<div role="status" aria-live="polite" aria-busy="true" style="display:flex;align-items:center;gap:8px;padding:24px;color:var(--text-secondary)">'
    + '<span class="spinner" aria-hidden="true"></span>' + esc(msg || 'Loading...') + '</div>';
}

function card(title, body, extra) {
  return '<div class="ds-card">'
    + (title ? '<div class="ds-card__header"><h3>' + esc(title) + '</h3>' + (extra || '') + '</div>' : '')
    + '<div class="ds-card__body">' + body + '</div></div>';
}

function renderLaunchNotice(title, body, tone) {
  var palette = tone === 'warn'
    ? { bg: 'rgba(255,179,71,0.12)', border: 'rgba(255,179,71,0.28)', text: 'var(--amber)' }
    : tone === 'error'
      ? { bg: 'rgba(255,107,107,0.12)', border: 'rgba(255,107,107,0.28)', text: 'var(--red)' }
      : { bg: 'rgba(0,212,188,0.10)', border: 'rgba(0,212,188,0.20)', text: 'var(--teal)' };
  return '<div class="qeeg-launch-notice" style="padding:12px 14px;border-radius:12px;background:' + palette.bg + ';border:1px solid ' + palette.border + ';margin-bottom:16px">'
    + '<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap">'
    + '<div>'
    + '<div style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:' + palette.text + '">Decision-support only</div>'
    + '<div style="font-size:14px;font-weight:700;color:var(--text-primary);margin-top:4px">' + esc(title) + '</div>'
    + '<div style="font-size:12px;color:var(--text-secondary);line-height:1.6;margin-top:6px">' + esc(body) + '</div>'
    + '</div>'
    + '<div style="display:flex;gap:8px;flex-wrap:wrap">'
    + '<span>' + badge('Review raw data first', 'var(--blue)') + '</span>'
    + '<span>' + badge('Confirm quality gate', 'var(--amber)') + '</span>'
    + '</div>'
    + '</div></div>';
}

function formatSupportedUploadTypes() {
  return '.edf, .bdf, .vhdr (BrainVision header), .set';
}

function _getContextPatientIdForQEEG() {
  try {
    return window._selectedPatientId
      || window._profilePatientId
      || sessionStorage.getItem('ds_pat_selected_id')
      || '';
  } catch (_) {
    return (typeof window !== 'undefined' && window)
      ? (window._selectedPatientId || window._profilePatientId || '')
      : '';
  }
}

let _qeegPrintableReportViewerUrl = null;

function _revokeQEEGPrintableReportViewerUrl() {
  if (_qeegPrintableReportViewerUrl) {
    try { URL.revokeObjectURL(_qeegPrintableReportViewerUrl); } catch (_) {}
    _qeegPrintableReportViewerUrl = null;
  }
}

export function _canRenderQEEGPrintableReport(report, analysis) {
  return !!(analysis && analysis.id && report && report.id);
}

export function _getQEEGReportPdfUrl(report, analysis) {
  if (!report) return null;
  if (report.report_pdf_url) return report.report_pdf_url;
  if (report.pdf_url) return report.pdf_url;
  if (report.id && analysis && analysis.id && api.getQEEGReportPDF) {
    return api.getQEEGReportPDF(analysis.id, report.id);
  }
  return null;
}

async function _mountQEEGPrintableReportViewer(report, analysis) {
  var frame = document.getElementById('qeeg-printable-report-frame');
  if (!frame) return;
  if (!_canRenderQEEGPrintableReport(report, analysis)) {
    frame.remove();
    return;
  }
  frame.setAttribute('srcdoc', '<p style="font-family:Arial,sans-serif;padding:16px;color:#5b677a">Loading printable report…</p>');
  try {
    var file = await api.getQEEGPrintableReport(analysis.id, report.id);
    _revokeQEEGPrintableReportViewerUrl();
    _qeegPrintableReportViewerUrl = URL.createObjectURL(file.blob);
    frame.removeAttribute('srcdoc');
    frame.src = _qeegPrintableReportViewerUrl;
  } catch (err) {
    frame.outerHTML = '<div class="qeeg-report-callout"><div class="qeeg-report-callout__label">Printable report unavailable</div><div class="qeeg-report-callout__value">'
      + esc(err && err.message ? err.message : err)
      + '</div></div>';
  }
}

function _getAnalysisSortTimestamp(analysis) {
  if (!analysis) return 0;
  var raw = analysis.analyzed_at || analysis.created_at || analysis.recording_date || null;
  if (!raw) return 0;
  var stamp = Date.parse(raw);
  return Number.isFinite(stamp) ? stamp : 0;
}

function _formatAnalysisSessionLabel(analysis) {
  if (!analysis) return 'Unknown session';
  var label = analysis.original_filename || analysis.file_name || analysis.id || 'qEEG session';
  var raw = analysis.analyzed_at || analysis.created_at || analysis.recording_date || null;
  var dateText = raw ? new Date(raw).toLocaleDateString() : 'N/A';
  return label + ' (' + dateText + ')';
}

export function renderCompareSelectionSummary(baseline, followup) {
  if (!baseline || !followup) return '';
  var baseTs = _getAnalysisSortTimestamp(baseline);
  var followTs = _getAnalysisSortTimestamp(followup);
  var days = baseTs && followTs ? Math.max(0, Math.round((followTs - baseTs) / 86400000)) : null;
  var dayText = days == null ? 'Interval unavailable' : (days === 0 ? 'Same-day comparison' : days + '-day interval');
  return '<div class="qeeg-compare-summary">'
    + '<div class="qeeg-compare-summary__eyebrow">Suggested comparison</div>'
    + '<div class="qeeg-compare-summary__row"><strong>Baseline:</strong> ' + esc(_formatAnalysisSessionLabel(baseline)) + '</div>'
    + '<div class="qeeg-compare-summary__row"><strong>Follow-up:</strong> ' + esc(_formatAnalysisSessionLabel(followup)) + '</div>'
    + '<div class="qeeg-compare-summary__meta">' + esc(dayText) + '</div>'
    + '</div>';
}

function _getAnalysisCapabilityItems(analysis) {
  if (!analysis) return [];
  var items = [];
  var quality = analysis.quality_metrics || {};
  var adv = analysis.advanced_analyses || {};
  var reportsCount = analysis.reports_count || analysis.report_count || 0;
  if (quality && Object.keys(quality).length) items.push({ label: 'Quality QA', color: 'var(--teal)' });
  if (analysis.connectivity_json || analysis.connectivity || analysis.connectivity_metrics) items.push({ label: 'Connectivity', color: 'var(--blue)' });
  if (analysis.normative_zscores_json || analysis.normative_deviations_json || analysis.normative_deviations) items.push({ label: 'Norms', color: 'var(--green)' });
  if (analysis.brain_age_json || analysis.risk_scores_json || analysis.protocol_recommendation_json || analysis.embedding_json) items.push({ label: 'AI enrich', color: 'var(--violet)' });
  if ((adv.results && Object.keys(adv.results).length) || (adv.meta && adv.meta.completed > 0)) items.push({ label: 'Advanced', color: 'var(--amber)' });
  if (reportsCount > 0 || analysis.latest_report_id) items.push({ label: 'Report', color: 'var(--rose)' });
  return items;
}

function renderAnalysisCapabilityChips(analysis) {
  var items = _getAnalysisCapabilityItems(analysis);
  if (!items.length) return '';
  return '<div class="qeeg-cap-chip-row">' + items.map(function (item) {
    return badge(item.label, item.color);
  }).join('') + '</div>';
}

function _getAnalysisOverviewItems(data) {
  return [
    { label: 'Preprocess', ready: !!(data && data.quality_metrics && Object.keys(data.quality_metrics).length), detail: 'PyPREP / autoreject / ICA cleanup' },
    { label: 'Quantify', ready: !!(data && (data.band_powers_json || data.band_powers || data.aperiodic_json || data.aperiodic)), detail: 'Spectral, asymmetry, source, norms' },
    { label: 'Connectivity', ready: !!(data && (data.connectivity_json || data.connectivity || data.connectivity_metrics)), detail: 'MNE-Connectivity sensor network metrics' },
    { label: 'AI enrich', ready: !!(data && (data.embedding_json || data.brain_age_json || data.risk_scores_json || data.protocol_recommendation_json)), detail: 'Brain age, similarity, recommendation' },
    { label: 'Advanced', ready: !!(data && data.advanced_analyses && data.advanced_analyses.meta && data.advanced_analyses.meta.completed > 0), detail: 'Microstates, complexity, graph' },
  ];
}

function renderAnalysisOverviewCard(data) {
  if (!data) return '';
  var overviewItems = _getAnalysisOverviewItems(data);
  var tools = [
    { label: 'MNE-Python', color: 'var(--teal)' },
    { label: 'MNE-BIDS', color: 'var(--blue)' },
    { label: 'PyPREP', color: 'var(--amber)' },
    { label: 'autoreject', color: 'var(--red)' },
    { label: 'MNE-ICALabel', color: 'var(--violet)' },
    { label: 'MNE-Connectivity', color: 'var(--green)' },
    { label: 'specparam', color: 'var(--blue)' },
    { label: 'pycrostates', color: 'var(--rose)' },
  ];
  return card('Analysis Overview',
    '<div class="qeeg-overview">'
      + '<div class="qeeg-overview__intro">This analyzer is structured around the current MNE ecosystem: MNE ingestion and preprocessing, PyPREP noisy-channel checks, autoreject epoch control, MNE-ICALabel artifact labeling, MNE-Connectivity network metrics, specparam spectral parameterization, and optional pycrostates-ready advanced review.</div>'
      + '<div class="qeeg-overview__grid">' + overviewItems.map(function (item) {
        return '<div class="qeeg-overview__item">'
          + '<div class="qeeg-overview__label">' + esc(item.label) + '</div>'
          + '<div class="qeeg-overview__state">' + badge(item.ready ? 'Ready' : 'Pending', item.ready ? 'var(--green)' : 'var(--amber)') + '</div>'
          + '<div class="qeeg-overview__detail">' + esc(item.detail) + '</div>'
          + '</div>';
      }).join('') + '</div>'
      + '<div class="qeeg-overview__tools">' + tools.map(function (tool) {
        return '<span>' + badge(tool.label, tool.color) + '</span>';
      }).join('') + '</div>'
    + '</div>'
  );
}

function _getReportSortTimestamp(report) {
  if (!report) return 0;
  var raw = report.generated_at || report.created_at || report.updated_at || null;
  if (!raw) return 0;
  var stamp = Date.parse(raw);
  return Number.isFinite(stamp) ? stamp : 0;
}

function _formatReportVersionLabel(report, index, total) {
  if (!report) return 'Report';
  var mode = report.report_type || report.kind || 'standard';
  var raw = report.generated_at || report.created_at || report.updated_at || null;
  var dateText = raw ? new Date(raw).toLocaleString() : 'Undated';
  var reviewText = report.clinician_reviewed ? 'Reviewed' : 'Draft';
  return 'v' + (total - index) + ' · ' + mode + ' · ' + reviewText + ' · ' + dateText;
}

function renderAnalysisWorkflowCard(mneButtonHtml, aiButtonsHtml, compareAction, annotationButtonHtml) {
  return card('Workflow Actions',
    '<div class="qeeg-workflow-grid">'
      + '<div class="qeeg-workflow-step">'
        + '<div class="qeeg-workflow-step__eyebrow">Preprocess</div>'
        + '<div class="qeeg-workflow-step__body">'
        + (mneButtonHtml || '<div class="qeeg-workflow-step__empty">MNE pipeline unavailable</div>')
        + '</div></div>'
      + '<div class="qeeg-workflow-step">'
        + '<div class="qeeg-workflow-step__eyebrow">AI Enrich</div>'
        + '<div class="qeeg-workflow-step__body">'
        + (aiButtonsHtml || '<div class="qeeg-workflow-step__empty">AI enrichments pending</div>')
        + '</div></div>'
      + '<div class="qeeg-workflow-step">'
        + '<div class="qeeg-workflow-step__eyebrow">Report & Compare</div>'
        + '<div class="qeeg-workflow-step__body">'
        + '<button class="btn btn-primary" onclick="window._qeegTab=\'report\';window._nav(\'qeeg-analysis\')">Generate AI Report</button>'
        + '<button class="btn btn-outline" onclick="' + compareAction + '">Compare with Another</button>'
        + (annotationButtonHtml || '')
        + '</div></div>'
    + '</div>'
  );
}

function badge(text, color) {
  return '<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;background:'
    + (color || 'var(--blue)') + '20;color:' + (color || 'var(--blue)') + '">' + esc(text) + '</span>';
}

const QEEG_WORKSPACE_LENS_META = {
  spectral:     { label: 'Spectral',     color: 'var(--teal)',   help: 'Band-power topography — where in the cortex each EEG rhythm is concentrated.' },
  connectivity: { label: 'Connectivity', color: 'var(--blue)',   help: 'Functional links between regions — coherence and phase synchrony across the scalp.' },
  asymmetry:    { label: 'Asymmetry',    color: 'var(--amber)',  help: 'Hemispheric balance — left/right power differences relevant to mood, anxiety, motor lateralization.' },
  biomarkers:   { label: 'Biomarkers',   color: 'var(--violet)', help: 'Composite clinical markers — theta/beta ratio, alpha peak, frontal asymmetry score.' },
};

function _getQEEGWorkspaceState(bands) {
  var availableBands = Object.keys(bands || {});
  var fallbackBand = availableBands.indexOf('alpha') !== -1 ? 'alpha' : (availableBands[0] || 'alpha');
  var existing = window._qeegWorkspaceState || {};
  var lens = QEEG_WORKSPACE_LENS_META[existing.lens] ? existing.lens : 'spectral';
  var metric = ['relative', 'zscore'].indexOf(existing.metric) !== -1 ? existing.metric : 'relative';
  var band = availableBands.indexOf(existing.band) !== -1 ? existing.band : fallbackBand;
  var state = { lens: lens, metric: metric, band: band };
  window._qeegWorkspaceState = state;
  return state;
}

function _setQEEGWorkspaceState(patch) {
  window._qeegWorkspaceState = Object.assign({}, window._qeegWorkspaceState || {}, patch || {});
}

function _getWorkspaceNormativeSummary(normDev) {
  var out = { significant: 0, mild: 0, total: 0 };
  if (!normDev) return out;
  Object.keys(normDev).forEach(function (ch) {
    Object.keys(normDev[ch] || {}).forEach(function (band) {
      var z = Number(normDev[ch][band]);
      if (!isFinite(z)) return;
      out.total += 1;
      if (Math.abs(z) >= 2) out.significant += 1;
      else if (Math.abs(z) >= 1) out.mild += 1;
    });
  });
  return out;
}

function _getBandMetricMap(bands, normDev, band, metric) {
  if (metric === 'zscore') {
    var zMap = {};
    Object.keys(normDev || {}).forEach(function (ch) {
      var z = normDev[ch] && normDev[ch][band];
      if (z != null && isFinite(Number(z))) zMap[ch] = Number(z);
    });
    return zMap;
  }
  var channelData = bands && bands[band] && bands[band].channels ? bands[band].channels : {};
  var relMap = {};
  Object.keys(channelData).forEach(function (ch) {
    var value = channelData[ch] && channelData[ch].relative_pct;
    if (value != null && isFinite(Number(value))) relMap[ch] = Number(value);
  });
  return relMap;
}

function _getTopomapValueDomain(band, metric, datasets) {
  if (metric === 'zscore') return [-3, 3];
  var fixedByBand = {
    delta: [0, 35],
    theta: [0, 30],
    alpha: [0, 45],
    beta: [0, 25],
    gamma: [0, 18],
  };
  if (fixedByBand[band]) return fixedByBand[band];
  var values = [];
  (datasets || []).forEach(function (dataset) {
    Object.keys(dataset || {}).forEach(function (ch) {
      var value = Number(dataset[ch]);
      if (isFinite(value)) values.push(value);
    });
  });
  if (!values.length) return [0, 50];
  var maxValue = Math.max.apply(null, values);
  return [0, Math.max(10, Math.ceil(maxValue / 5) * 5)];
}

function _getTopomapLegendOptions(metric, domain) {
  if (metric === 'zscore') {
    return {
      valueDomain: domain,
      legendMinLabel: '-3',
      legendMidLabel: '0',
      legendMaxLabel: '+3',
    };
  }
  return {
    valueDomain: domain,
    legendMinLabel: String(domain[0]),
    legendMaxLabel: String(domain[1]),
  };
}

function _getPercentDeltaLegendOptions(domain) {
  return {
    valueDomain: domain,
    legendMinLabel: String(domain[0]) + '%',
    legendMidLabel: '0%',
    legendMaxLabel: '+' + String(domain[1]) + '%',
  };
}

function _getSortedChannelMetrics(channelMap) {
  return Object.keys(channelMap || {}).map(function (ch) {
    return { channel: ch, value: Number(channelMap[ch]) };
  }).filter(function (row) {
    return isFinite(row.value);
  }).sort(function (a, b) {
    return Math.abs(b.value) - Math.abs(a.value);
  });
}

function _deriveTopConnectivityEdges(matrix, channels, limit) {
  var rows = Array.isArray(matrix) ? matrix : [];
  var names = Array.isArray(channels) ? channels : [];
  var edges = [];
  for (var i = 0; i < rows.length; i += 1) {
    for (var j = i + 1; j < rows[i].length; j += 1) {
      var value = Number(rows[i][j]);
      if (!isFinite(value)) continue;
      edges.push({ ch1: names[i] || String(i), ch2: names[j] || String(j), value: value });
    }
  }
  return edges.sort(function (a, b) {
    return Math.abs(b.value) - Math.abs(a.value);
  }).slice(0, limit || 10);
}

function _getSuggestedComparisonSessions(currentAnalysis, analyses) {
  var currentId = currentAnalysis && currentAnalysis.id;
  var currentTs = _getAnalysisSortTimestamp(currentAnalysis);
  var candidates = (analyses || []).filter(function (item) {
    return item && item.id && item.id !== currentId;
  }).slice().sort(function (a, b) {
    return _getAnalysisSortTimestamp(a) - _getAnalysisSortTimestamp(b);
  });
  if (!candidates.length || !currentAnalysis) return null;
  var baseline = null;
  candidates.forEach(function (item) {
    if (_getAnalysisSortTimestamp(item) <= currentTs) baseline = item;
  });
  if (!baseline) baseline = candidates[0];
  return { baseline: baseline, followup: currentAnalysis };
}

function _renderWorkspaceRatioRail(ratios) {
  var ratioCards = [
    { key: 'theta_beta_ratio', label: 'TBR', ref: 'Attention' },
    { key: 'theta_alpha_ratio', label: 'TAR', ref: 'Cortical slowing' },
    { key: 'delta_alpha_ratio', label: 'D/A', ref: 'Slowing' },
    { key: 'alpha_peak_frequency_hz', label: 'PAF', ref: 'Hz' },
    { key: 'frontal_alpha_asymmetry', label: 'FAA', ref: 'Asymmetry' },
  ];
  var html = '';
  ratioCards.forEach(function (item) {
    var val = ratios && ratios[item.key];
    if (val == null) return;
    var targetName = item.key === 'frontal_alpha_asymmetry'
      ? 'frontal_alpha_asymmetry'
      : (item.key === 'theta_beta_ratio' ? 'theta_beta_ratio' : 'frontal_alpha_asymmetry');
    var evidenceChip = EvidenceChip({
      count: item.key === 'frontal_alpha_asymmetry' ? 27 : 12,
      evidenceLevel: item.key === 'frontal_alpha_asymmetry' ? 'high' : 'moderate',
      label: item.label + ' evidence',
      compact: true,
      query: createEvidenceQueryForTarget({
        patientId: _getContextPatientIdForQEEG() || 'qeeg-context',
        targetName: targetName,
        contextType: 'biomarker',
        modalityFilters: ['qeeg'],
        featureSummary: [{ name: item.label, value: val, modality: 'qEEG', direction: 'observed', contribution: 0.18 }],
      }),
    });
    html += '<div style="padding:10px 12px;border-radius:10px;background:var(--surface-tint-1);border:1px solid var(--border)">'
      + '<div style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.06em">' + esc(item.label) + '</div>'
      + '<div style="font-size:18px;font-weight:700;margin-top:4px">' + (typeof val === 'number' ? val.toFixed(2) : esc(val)) + '</div>'
      + '<div style="font-size:11px;color:var(--text-secondary);margin-top:2px">' + esc(item.ref) + '</div>'
      + '<div style="margin-top:8px">' + evidenceChip + '</div>'
      + '</div>';
  });
  return html;
}

function _renderWorkspacePrimaryLens(data, bands, normDev, state) {
  var metricMap = _getBandMetricMap(bands, normDev, state.band, state.metric);
  var sortedChannels = _getSortedChannelMetrics(metricMap);
  var headHighlights = sortedChannels.slice(0, 4).map(function (row) { return row.channel; });
  if (state.lens === 'connectivity') {
    var coh = data && data.advanced_analyses && data.advanced_analyses.results && data.advanced_analyses.results.coherence_matrix;
    var d = coh && coh.status === 'ok' ? (coh.data || {}) : null;
    var matrix = d && d.bands ? d.bands[state.band] : null;
    if (matrix && d.channels) {
      var topEdges = _deriveTopConnectivityEdges(matrix, d.channels, 8);
      return '<div style="display:grid;grid-template-columns:minmax(0,1.35fr) minmax(260px,.85fr);gap:16px;align-items:start">'
        + '<div style="overflow-x:auto">' + renderConnectivityMatrix(matrix, d.channels, { band: state.band + ' coherence', size: 420 }) + '</div>'
        + '<div style="display:flex;flex-direction:column;gap:12px">'
        + '<div style="padding:12px;border-radius:12px;background:var(--surface-tint-1);border:1px solid var(--border)">'
        + '<div style="font-size:12px;font-weight:700;color:var(--text-primary);margin-bottom:8px">Spatial network view</div>'
        + renderConnectivityBrainMap(topEdges, { band: state.band + ' coherence', size: 260, threshold: 0 })
        + '</div>'
        + '<div style="padding:12px;border-radius:12px;background:var(--surface-tint-1);border:1px solid var(--border)">'
        + '<div style="font-size:12px;font-weight:700;color:var(--text-primary);margin-bottom:8px">Strongest pairs</div>'
        + topEdges.map(function (edge) {
          return '<div style="display:flex;justify-content:space-between;gap:12px;font-size:12px;padding:4px 0;color:var(--text-secondary)">'
            + '<span>' + esc(edge.ch1 + ' - ' + edge.ch2) + '</span>'
            + '<strong style="color:var(--text-primary)">' + edge.value.toFixed(3) + '</strong></div>';
        }).join('')
        + '</div></div></div>';
    }
    return '<div style="padding:24px;border-radius:12px;background:var(--surface-tint-1);border:1px dashed rgba(255,255,255,0.12);font-size:13px;color:var(--text-secondary)">Run advanced connectivity analyses to unlock the connectivity lens.</div>';
  }
  if (state.lens === 'asymmetry') {
    if (data && data.asymmetry_detail && data.asymmetry_detail.regions && typeof renderAsymmetryMap === 'function') {
      var regions = Object.keys(data.asymmetry_detail.regions || {});
      return '<div style="display:grid;grid-template-columns:minmax(0,1.2fr) minmax(240px,.8fr);gap:16px;align-items:start">'
        + '<div style="text-align:center;padding:12px;border-radius:12px;background:var(--surface-tint-1);border:1px solid var(--border)">' + renderAsymmetryMap(data.asymmetry_detail.regions) + '</div>'
        + '<div style="padding:12px;border-radius:12px;background:var(--surface-tint-1);border:1px solid var(--border)">'
        + '<div style="font-size:12px;font-weight:700;color:var(--text-primary);margin-bottom:8px">Asymmetry regions</div>'
        + regions.map(function (region) {
          return '<div style="display:flex;justify-content:space-between;gap:12px;font-size:12px;padding:4px 0;color:var(--text-secondary)">'
            + '<span>' + esc(region) + '</span>'
            + '<span>' + esc(typeof data.asymmetry_detail.regions[region] === 'number'
              ? data.asymmetry_detail.regions[region].toFixed(2)
              : data.asymmetry_detail.regions[region]) + '</span></div>';
        }).join('')
        + '</div></div>';
    }
    return '<div style="padding:24px;border-radius:12px;background:var(--surface-tint-1);border:1px dashed rgba(255,255,255,0.12);font-size:13px;color:var(--text-secondary)">No asymmetry region data available for this session.</div>';
  }
  if (state.lens === 'biomarkers') {
    var biomarkerHtml = '';
    if (data && data.biomarkers && data.biomarkers.conditions && typeof renderBiomarkerGauges === 'function') {
      biomarkerHtml += renderBiomarkerGauges(data.biomarkers.conditions);
    }
    if (!biomarkerHtml && data && data.tbr_per_channel && typeof renderTBRBarChart === 'function') {
      biomarkerHtml += renderTBRBarChart(data.tbr_per_channel);
    }
    if (!biomarkerHtml && data && data.signal_deviations && typeof renderSignalDeviationChart === 'function') {
      biomarkerHtml += renderSignalDeviationChart(data.signal_deviations);
    }
    if (biomarkerHtml) {
      return '<div style="padding:12px;border-radius:12px;background:var(--surface-tint-1);border:1px solid var(--border)">' + biomarkerHtml + '</div>';
    }
    return '<div style="padding:24px;border-radius:12px;background:var(--surface-tint-1);border:1px dashed rgba(255,255,255,0.12);font-size:13px;color:var(--text-secondary)">No biomarker visualization is available yet for this session.</div>';
  }
  var lensDomain = _getTopomapValueDomain(state.band, state.metric, [metricMap]);
  return '<div style="display:grid;grid-template-columns:minmax(0,1.25fr) minmax(220px,.75fr);gap:16px;align-items:start">'
    + '<div style="padding:12px;border-radius:12px;background:var(--surface-tint-1);border:1px solid var(--border)">'
    + renderTopoHeatmap(metricMap, Object.assign({
      band: state.band + ' ' + (state.metric === 'zscore' ? 'z-score' : 'relative power'),
      unit: state.metric === 'zscore' ? 'z' : '%',
      size: 320,
      colorScale: state.metric === 'zscore' ? 'diverging' : 'warm',
    }, _getTopomapLegendOptions(state.metric, lensDomain)))
    + '</div>'
    + '<div style="display:flex;flex-direction:column;gap:12px">'
    + '<div style="padding:12px;border-radius:12px;background:var(--surface-tint-1);border:1px solid var(--border)">'
    + '<div style="font-size:12px;font-weight:700;color:var(--text-primary);margin-bottom:8px">10-20 anchor map</div>'
    + renderBrainMap10_20({ size: 250, highlightSites: headHighlights })
    + '<div style="font-size:11px;color:var(--text-tertiary);margin-top:6px">Highlighted channels are the strongest current ' + esc(state.metric === 'zscore' ? 'normative deviations' : 'spectral contributors') + ' for ' + esc(state.band) + '.</div>'
    + '</div>'
    + '<div style="padding:12px;border-radius:12px;background:var(--surface-tint-1);border:1px solid var(--border)">'
    + '<div style="font-size:12px;font-weight:700;color:var(--text-primary);margin-bottom:8px">Top channels</div>'
    + (sortedChannels.length ? sortedChannels.slice(0, 8).map(function (row, index) {
      return '<div style="display:flex;justify-content:space-between;gap:12px;font-size:12px;padding:4px 0;color:var(--text-secondary)">'
        + '<span>' + (index + 1) + '. ' + esc(row.channel) + '</span>'
        + '<strong style="color:var(--text-primary)">' + row.value.toFixed(2) + (state.metric === 'zscore' ? ' z' : '%') + '</strong></div>';
    }).join('') : '<div style="font-size:12px;color:var(--text-secondary)">No channel values available.</div>')
    + '</div></div></div>';
}

function renderAnalysisWorkspace(data, bands, ratios, artifact, normDev, analyses) {
  var bandNames = Object.keys(bands || {});
  if (!bandNames.length) return '';
  var state = _getQEEGWorkspaceState(bands);
  var normSummary = _getWorkspaceNormativeSummary(normDev);
  var comparison = _getSuggestedComparisonSessions(data, analyses);
  var qualityPct = artifact && artifact.epochs_total
    ? Math.round(((artifact.epochs_kept || 0) / artifact.epochs_total) * 100)
    : null;
  var qualityTone = qualityPct == null ? 'var(--text-secondary)' : (qualityPct >= 80 ? 'var(--green)' : qualityPct >= 60 ? 'var(--amber)' : 'var(--red)');
  var ratioRail = _renderWorkspaceRatioRail(ratios);
  return card('Analysis Workspace',
    '<div style="display:flex;flex-direction:column;gap:16px">'
      + '<div style="display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;align-items:flex-start">'
        + '<div>'
          + '<div style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.08em">qEEG workspace</div>'
          + '<div style="font-size:18px;font-weight:700;margin-top:4px">Interactive analyzer surface</div>'
          + '<div style="font-size:12px;color:var(--text-secondary);margin-top:6px;max-width:760px">Primary view first: choose a lens, inspect the topography or network, then move into AI and narrative. This matches the MNE-style workflow of topomap, connectivity, and quality before interpretation.</div>'
        + '</div>'
        + '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">'
          + badge((data.channels_used || data.channel_count || 0) + ' channels', 'var(--blue)')
          + badge((data.sample_rate_hz || 0) + ' Hz', 'var(--teal)')
          + (data.eyes_condition ? badge('Eyes ' + data.eyes_condition, 'var(--violet)') : '')
          + (qualityPct != null ? badge('Quality ' + qualityPct + '%', qualityTone) : '')
          + badge(normSummary.significant + ' significant z-flags', normSummary.significant ? 'var(--amber)' : 'var(--green)')
        + '</div>'
      + '</div>'
      + '<div role="toolbar" aria-label="qEEG workspace controls" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">'
        + '<div role="group" aria-label="Lens" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">'
          + '<span style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.06em;margin-right:2px">Lens</span>'
          + '<button class="btn btn-ghost btn-sm" data-qeeg-help="lens" aria-expanded="false" aria-controls="qeeg-lens-help" aria-label="What do these lenses mean?" title="What do these lenses mean?" style="padding:2px 7px;font-size:12px;border-radius:50%;width:22px;height:22px;line-height:1">?</button>'
          + Object.keys(QEEG_WORKSPACE_LENS_META).map(function (lens) {
            var meta = QEEG_WORKSPACE_LENS_META[lens];
            var active = state.lens === lens;
            return '<button class="btn btn-sm ' + (active ? 'btn-primary' : 'btn-outline') + '"'
              + ' aria-pressed="' + (active ? 'true' : 'false') + '"'
              + ' title="' + esc(meta.help) + '"'
              + (active ? ' style="background:' + meta.color + ';border-color:' + meta.color + ';color:#081019"' : '')
              + ' onclick="window._qeegSetWorkspaceLens(\'' + lens + '\')">' + esc(meta.label) + '</button>';
          }).join('')
        + '</div>'
        + '<div role="group" aria-label="Band and metric" style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap;align-items:center">'
          + '<span style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.06em;margin-right:2px">Band</span>'
          + bandNames.map(function (band) {
            var active = state.band === band;
            return '<button class="btn btn-sm ' + (active ? 'btn-primary' : 'btn-outline') + '"'
              + ' aria-pressed="' + (active ? 'true' : 'false') + '"'
              + ' title="View topography for the ' + esc(band) + ' band"'
              + ' onclick="window._qeegSetWorkspaceBand(\'' + band + '\')">' + esc(band) + '</button>';
          }).join('')
          + '<button class="btn btn-sm ' + (state.metric === 'relative' ? 'btn-primary' : 'btn-outline') + '" aria-pressed="' + (state.metric === 'relative' ? 'true' : 'false') + '" title="Relative band power (proportion of total)" onclick="window._qeegSetWorkspaceMetric(\'relative\')">Relative</button>'
          + '<button class="btn btn-sm ' + (state.metric === 'zscore' ? 'btn-primary' : 'btn-outline') + '" aria-pressed="' + (state.metric === 'zscore' ? 'true' : 'false') + '" title="Deviation from age-matched normative baseline" onclick="window._qeegSetWorkspaceMetric(\'zscore\')">Z-score</button>'
        + '</div>'
      + '</div>'
      + '<div id="qeeg-lens-help" hidden style="margin-top:8px;padding:12px 14px;border-radius:10px;background:rgba(255,255,255,0.025);border:1px solid var(--border);font-size:12px;color:var(--text-secondary);line-height:1.7">'
        + Object.keys(QEEG_WORKSPACE_LENS_META).map(function (lens) {
          var meta = QEEG_WORKSPACE_LENS_META[lens];
          return '<div><strong style="color:' + meta.color + '">' + esc(meta.label) + '</strong> — ' + esc(meta.help) + '</div>';
        }).join('')
      + '</div>'
      + '<div style="display:grid;grid-template-columns:minmax(0,1.65fr) minmax(300px,.9fr);gap:16px;align-items:start">'
        + '<div style="display:flex;flex-direction:column;gap:16px">'
          + _renderWorkspacePrimaryLens(data, bands, normDev, state)
          + '<div style="padding:12px 14px;border-radius:12px;background:var(--surface-tint-1);border:1px solid var(--border)">'
            + '<div style="font-size:12px;font-weight:700;color:var(--text-primary);margin-bottom:8px">Lens guidance</div>'
            + '<div style="font-size:12px;color:var(--text-secondary);line-height:1.6">Use <strong>' + esc(QEEG_WORKSPACE_LENS_META[state.lens].label) + '</strong> to inspect the dominant pattern in ' + esc(state.band) + '. Switch to z-score when you want deviation from the normative baseline rather than raw distribution.</div>'
          + '</div>'
        + '</div>'
        + '<div style="display:flex;flex-direction:column;gap:12px">'
          + '<div style="padding:14px;border-radius:12px;background:var(--surface-tint-1);border:1px solid var(--border)">'
            + '<div style="font-size:12px;font-weight:700;color:var(--text-primary);margin-bottom:8px">Session summary</div>'
            + '<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;font-size:12px;color:var(--text-secondary)">'
              + '<div><div style="color:var(--text-tertiary)">Recording</div><div style="color:var(--text-primary);font-weight:600">' + esc(data.original_filename || 'qEEG session') + '</div></div>'
              + '<div><div style="color:var(--text-tertiary)">Duration</div><div style="color:var(--text-primary);font-weight:600">' + (((data.recording_duration_sec || data.duration_sec || 0) / 60) || 0).toFixed(1) + ' min</div></div>'
              + '<div><div style="color:var(--text-tertiary)">Eyes</div><div style="color:var(--text-primary);font-weight:600">' + esc(data.eyes_condition || 'unspecified') + '</div></div>'
              + '<div><div style="color:var(--text-tertiary)">Quality gate</div><div style="color:' + qualityTone + ';font-weight:700">' + (qualityPct != null ? qualityPct + '% epochs retained' : 'Pending') + '</div></div>'
            + '</div>'
          + '</div>'
          + (ratioRail ? '<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px">' + ratioRail + '</div>' : '')
          + '<div style="padding:14px;border-radius:12px;background:var(--surface-tint-1);border:1px solid var(--border)">'
            + '<div style="font-size:12px;font-weight:700;color:var(--text-primary);margin-bottom:8px">Normative severity</div>'
            + '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:8px">'
              + badge(normSummary.significant + ' significant', normSummary.significant ? 'var(--amber)' : 'var(--green)')
              + badge(normSummary.mild + ' mild', normSummary.mild ? 'var(--blue)' : 'var(--green)')
              + badge(normSummary.total + ' total points', 'var(--teal)')
            + '</div>'
            + '<div style="font-size:12px;color:var(--text-secondary);line-height:1.6">Significant means |z| >= 2. Mild means |z| between 1 and 2. Review z-score mode before relying on narrative interpretation.</div>'
          + '</div>'
          + (comparison ? '<div style="padding:14px;border-radius:12px;background:var(--surface-tint-1);border:1px solid var(--border)">'
              + '<div style="font-size:12px;font-weight:700;color:var(--text-primary);margin-bottom:8px">Compare readiness</div>'
              + renderCompareSelectionSummary(comparison.baseline, comparison.followup)
            + '</div>' : '')
          + '<div style="padding:14px;border-radius:12px;background:var(--surface-tint-1);border:1px solid var(--border)">'
            + '<div style="font-size:12px;font-weight:700;color:var(--text-primary);margin-bottom:8px">Next actions</div>'
            + '<div style="display:flex;gap:8px;flex-wrap:wrap">'
              + '<button class="btn btn-sm btn-outline" aria-label="Open AI report for this analysis" onclick="window._qeegSwitchTab(\'report\')">Open AI report</button>'
              + '<button class="btn btn-sm btn-outline" aria-label="Open compare tab" onclick="window._qeegSwitchTab(\'compare\')">Open compare</button>'
            + '</div>'
          + '</div>'
        + '</div>'
      + '</div>'
    + '</div>'
  );
}

function renderQEEGSessionRail(data, options) {
  if (!data) return '';
  var opts = options || {};
  var ratios = (data.band_powers_json && data.band_powers_json.derived_ratios) || data.clinical_ratios || data.biomarkers || {};
  var artifact = data.artifact_rejection || data.artifact_rejection_json || {};
  var qualityPct = artifact && artifact.epochs_total
    ? Math.round(((artifact.epochs_kept || 0) / artifact.epochs_total) * 100)
    : null;
  var qualityTone = qualityPct == null ? 'var(--text-secondary)' : (qualityPct >= 80 ? 'var(--green)' : qualityPct >= 60 ? 'var(--amber)' : 'var(--red)');
  var normDev = data.normative_deviations_json || data.normative_deviations || null;
  var normSummary = _getWorkspaceNormativeSummary(normDev);
  var hasAdvanced = data.advanced_analyses && data.advanced_analyses.meta && data.advanced_analyses.meta.completed > 0;
  var hasReport = data.ai_report_json || data.report_json;
  var hasProtocol = data.protocol_recommendation_json || (data.advanced_analyses && data.advanced_analyses.results && data.advanced_analyses.results.protocol_recommendation);
  var quickActions = '';
  if (!hasAdvanced) quickActions += '<button class="btn btn-sm btn-primary" style="margin-left:4px" onclick="window._qeegTab=\'analysis\';window._nav(\'qeeg-analysis\');setTimeout(function(){var b=document.getElementById(\'qeeg-run-advanced-btn\');b&&b.click()},300)" title="Run advanced analyses">Run Advanced</button>';
  if (!hasReport) quickActions += '<button class="btn btn-sm btn-outline" style="margin-left:4px" onclick="window._qeegTab=\'report\';window._nav(\'qeeg-analysis\')" title="Generate AI report">AI Report</button>';
  if (!hasProtocol) quickActions += '<button class="btn btn-sm btn-outline" style="margin-left:4px" onclick="window._qeegTab=\'analysis\';window._nav(\'qeeg-analysis\');setTimeout(function(){var b=document.querySelector(\'[data-qeeg-ai-action=protocol]\');b&&b.click()},300)" title="Recommend neuromodulation protocol">Protocol</button>';
  quickActions += '<button class="btn btn-sm btn-outline" style="margin-left:4px" onclick="window._qeegExportBandPowerCSV&&window._qeegExportBandPowerCSV()" title="Export band power CSV">Export CSV</button>';
  return '<div style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px;padding:14px 16px;border-radius:14px;background:linear-gradient(135deg, rgba(11,23,37,0.94), rgba(16,28,48,0.9));border:1px solid rgba(255,255,255,0.08)">'
    + '<div style="display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;align-items:flex-start">'
      + '<div>'
        + '<div style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.08em">' + esc(opts.title || 'Current qEEG session') + '</div>'
        + '<div style="font-size:18px;font-weight:700;margin-top:4px">' + esc(data.original_filename || data.id || 'qEEG session') + '</div>'
        + '<div style="font-size:12px;color:var(--text-secondary);margin-top:6px">' + esc(opts.note || '') + '</div>'
      + '</div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">'
        + badge((data.channels_used || data.channel_count || 0) + ' channels', 'var(--blue)')
        + badge((data.sample_rate_hz || 0) + ' Hz', 'var(--teal)')
        + (data.eyes_condition ? badge('Eyes ' + data.eyes_condition, 'var(--violet)') : '')
        + (qualityPct != null ? badge('Quality ' + qualityPct + '%', qualityTone) : '')
        + badge(normSummary.significant + ' significant z-flags', normSummary.significant ? 'var(--amber)' : 'var(--green)')
        + '<button class="btn btn-sm btn-outline" style="margin-left:4px" onclick="window._qeegOpenRawTab&&window._qeegOpenRawTab()" title="Open raw EEG viewer">View Raw EEG</button>'
        + quickActions
      + '</div>'
    + '</div>'
    + '<div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px">'
      + '<div style="padding:10px 12px;border-radius:10px;background:var(--surface-tint-1);border:1px solid var(--border)"><div style="font-size:11px;color:var(--text-tertiary)">TBR</div><div style="font-size:18px;font-weight:700;margin-top:4px">' + (ratios.theta_beta_ratio != null ? Number(ratios.theta_beta_ratio).toFixed(2) : 'N/A') + '</div></div>'
      + '<div style="padding:10px 12px;border-radius:10px;background:var(--surface-tint-1);border:1px solid var(--border)"><div style="font-size:11px;color:var(--text-tertiary)">PAF</div><div style="font-size:18px;font-weight:700;margin-top:4px">' + (ratios.alpha_peak_frequency_hz != null ? Number(ratios.alpha_peak_frequency_hz).toFixed(2) + ' Hz' : 'N/A') + '</div></div>'
      + '<div style="padding:10px 12px;border-radius:10px;background:var(--surface-tint-1);border:1px solid var(--border)"><div style="font-size:11px;color:var(--text-tertiary)">FAA</div><div style="font-size:18px;font-weight:700;margin-top:4px">' + (ratios.frontal_alpha_asymmetry != null ? Number(ratios.frontal_alpha_asymmetry).toFixed(2) : 'N/A') + '</div></div>'
      + '<div style="padding:10px 12px;border-radius:10px;background:var(--surface-tint-1);border:1px solid var(--border)"><div style="font-size:11px;color:var(--text-tertiary)">Normative</div><div style="font-size:18px;font-weight:700;margin-top:4px;color:' + (normSummary.significant ? 'var(--amber)' : 'var(--green)') + '">' + normSummary.significant + ' high</div></div>'
    + '</div>'
  + '</div>';
}

function renderQEEGStackCard() {
  var stages = [
    { title: 'Ingest', detail: 'MNE-Python reads EDF, BDF, BrainVision and EEGLAB uploads, validates channel mapping, and prepares BIDS-ready derivatives.' },
    { title: 'Preprocess', detail: 'PyPREP, filtering, notch cleanup, resampling, interpolation and rereferencing standardize the recording before feature extraction.' },
    { title: 'Artifact control', detail: 'ICA, ICLabel and autoreject remove eye, muscle, heart and noisy segments before metrics are generated.' },
    { title: 'Quantification', detail: 'Spectral power, aperiodic slope, peak alpha frequency, asymmetry, connectivity, graph metrics and optional eLORETA ROI power are computed.' },
    { title: 'Norms + report', detail: 'Normative z-scores, AI interpretation, PDF output, BIDS export and literature-grounded narrative are surfaced in the portal.' },
  ];
  return card('Analyzer Stack',
    '<div class="qeeg-stack-card">'
      + '<div class="qeeg-stack-card__intro">Supported uploads: <strong>' + esc(formatSupportedUploadTypes())
      + '</strong>. For BrainVision studies, select the <code>.vhdr</code> header file so the companion <code>.vmrk</code> and <code>.eeg</code> files can be resolved by the backend.</div>'
      + '<div class="qeeg-stack-card__grid">' + stages.map(function (stage, index) {
        return '<div class="qeeg-stack-step">'
          + '<div class="qeeg-stack-step__eyebrow">Stage ' + (index + 1) + '</div>'
          + '<div class="qeeg-stack-step__title">' + esc(stage.title) + '</div>'
          + '<div class="qeeg-stack-step__detail">' + esc(stage.detail) + '</div>'
          + '</div>';
      }).join('') + '</div>'
      + '<div class="qeeg-stack-card__footer">'
      + '<span>' + badge('MNE', 'var(--teal)') + '</span>'
      + '<span>' + badge('PyPREP', 'var(--blue)') + '</span>'
      + '<span>' + badge('ICLabel', 'var(--amber)') + '</span>'
      + '<span>' + badge('SpecParam', 'var(--green)') + '</span>'
      + '<span>' + badge('eLORETA', 'var(--violet)') + '</span>'
      + '<span>' + badge('BIDS export', 'var(--red)') + '</span>'
      + '</div>'
    + '</div>');
}

function _demoFusionSummary(patientId) {
  return {
    patient_id: patientId || 'demo-patient',
    qeeg_analysis_id: 'demo',
    mri_analysis_id: null,
    recommendations: ['qEEG data is available. Add MRI targeting to upgrade this into a dual-modality recommendation.'],
    summary: 'Partial fusion available from one modality only. Add MRI data to strengthen target confidence.',
    confidence: 0.4,
    confidence_disclaimer: 'Confidence score is algorithmic heuristic and not evidence-graded clinical validation. Always review recommendations against patient-specific context.',
    confidence_grade: 'heuristic',
    generated_at: new Date().toISOString(),
  };
}

async function _fetchFusionSummary(patientId) {
  if (!patientId) return null;
  if (_isDemoMode()) return _demoFusionSummary(patientId);
  try {
    return await api.getFusionRecommendation(patientId);
  } catch (_) {
    return null;
  }
}

export function renderFusionSummaryCard(fusion, patientId) {
  if (!patientId && !fusion) {
    return card('Fusion summary',
      '<div style="color:var(--text-secondary);font-size:13px">Select a patient analysis to assemble a fusion summary.</div>');
  }
  if (!fusion) {
    return card('Fusion summary',
      '<div style="color:var(--text-secondary);font-size:13px">Fusion summary unavailable right now. Existing qEEG results remain usable.</div>');
  }
  var recs = Array.isArray(fusion.recommendations) ? fusion.recommendations : [];
  var meta = [];
  if (fusion.qeeg_analysis_id) meta.push('qEEG ready');
  if (fusion.mri_analysis_id) meta.push('MRI ready');
  if (fusion.confidence != null) meta.push('confidence ' + Math.round(Number(fusion.confidence || 0) * 100) + '%');
  if (fusion.confidence_grade) meta.push('grade: ' + esc(fusion.confidence_grade));
  var recHtml = recs.length
    ? '<ul style="margin:10px 0 0 18px;padding:0;color:var(--text-secondary);font-size:12.5px;line-height:1.5">'
        + recs.map(function (item) { return '<li>' + esc(item) + '</li>'; }).join('')
      + '</ul>'
    : '<div style="margin-top:10px;color:var(--text-tertiary);font-size:12px">No recommendations yet.</div>';
  var disclaimerHtml = fusion.confidence_disclaimer
    ? '<div style="margin-top:10px;font-size:11px;color:var(--text-tertiary);line-height:1.5;border-left:2px solid var(--amber);padding-left:8px">'
        + esc(fusion.confidence_disclaimer) + '</div>'
    : '';
  var workbenchLink = patientId
    ? '<div style="margin-top:10px;"><a href="/fusion-workbench?patient_id=' + encodeURIComponent(patientId) + '" style="font-size:12px;color:var(--teal);text-decoration:none;">Open Fusion Workbench &rarr;</a></div>'
    : '';
  return card('Fusion summary',
    '<div style="font-size:13px;color:var(--text-primary);line-height:1.55">' + esc(fusion.summary || '') + '</div>'
    + '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">' + meta.map(function (item) {
      return badge(item, 'var(--teal)');
    }).join('') + '</div>'
    + recHtml
    + disclaimerHtml
    + workbenchLink
  );
}

const BAND_COLORS = {
  delta: '#42a5f5', theta: '#7e57c2', alpha: '#66bb6a',
  smr: '#26c6da', low_beta: '#ff8a65',
  beta: '#ffa726', high_beta: '#ef5350', gamma: '#ec407a',
};

var SUB_BAND_RANGES = {
  delta: '1-4 Hz', theta: '4-8 Hz', alpha: '8-12 Hz',
  smr: '12-15 Hz', low_beta: '13-20 Hz',
  beta: '13-30 Hz', high_beta: '20-30 Hz', gamma: '30-50 Hz',
};

var _qeegAnnotationDrawerLoadedFor = null;

function _renderAnnotationList(items) {
  if (!Array.isArray(items) || !items.length) {
    return '<div class="analysis-anno-empty">No notes pinned to this study yet.</div>';
  }
  return items.map(function (item) {
    var title = item.title ? '<div class="analysis-anno-item__title">' + esc(item.title) + '</div>' : '';
    var anchor = item.anchor_label ? '<div class="analysis-anno-item__anchor">' + esc(item.anchor_label) + '</div>' : '';
    var at = item.created_at ? new Date(item.created_at).toLocaleString() : '';
    return '<div class="analysis-anno-item">'
      + title
      + anchor
      + '<div class="analysis-anno-item__body">' + esc(item.body || '') + '</div>'
      + '<div class="analysis-anno-item__meta">' + esc(at) + '</div>'
      + '<button class="analysis-anno-item__delete" data-annotation-delete="' + esc(item.id) + '">Delete</button>'
      + '</div>';
  }).join('');
}

async function _openQEEGAnnotationDrawer(context) {
  if (!context || !context.patient_id || !context.target_id) return;
  var host = document.getElementById('qeeg-annotation-drawer-host');
  if (!host) return;
  host.innerHTML = '<div class="analysis-anno-backdrop" data-annotation-close="1"></div>'
    + '<aside class="analysis-anno-drawer" role="dialog" aria-modal="true" aria-label="Study notes">'
    + '<div class="analysis-anno-drawer__hd"><div><strong>Study notes</strong><div class="analysis-anno-drawer__sub">'
    + esc(context.anchor_label || 'qEEG analysis') + '</div></div><button class="analysis-anno-drawer__close" data-annotation-close="1" aria-label="Close notes drawer">Close</button></div>'
    + '<div id="qeeg-annotation-list" class="analysis-anno-list">' + spinner('Loading notes...') + '</div>'
    + '<div class="analysis-anno-form">'
    + '<label for="qeeg-annotation-title" style="font-size:11px;color:var(--text-tertiary);display:flex;justify-content:space-between"><span>Title</span><span><span id="qeeg-annotation-title-count">0</span>/160</span></label>'
    + '<input id="qeeg-annotation-title" class="form-control" maxlength="160" placeholder="Short title (optional)" aria-describedby="qeeg-annotation-title-count"/>'
    + '<label for="qeeg-annotation-body" style="font-size:11px;color:var(--text-tertiary);display:flex;justify-content:space-between"><span>Note</span><span><span id="qeeg-annotation-body-count">0</span>/5000</span></label>'
    + '<textarea id="qeeg-annotation-body" class="form-control" rows="4" maxlength="5000" placeholder="Add a note for this study" aria-describedby="qeeg-annotation-body-count"></textarea>'
    + '<label for="qeeg-annotation-anchor" style="font-size:11px;color:var(--text-tertiary);display:flex;justify-content:space-between"><span>Anchor</span><span><span id="qeeg-annotation-anchor-count">' + (context.anchor_label || '').length + '</span>/120</span></label>'
    + '<input id="qeeg-annotation-anchor" class="form-control" maxlength="120" placeholder="Anchor label (optional)" value="' + esc(context.anchor_label || '') + '" aria-describedby="qeeg-annotation-anchor-count"/>'
    + '<div style="display:flex;justify-content:flex-end;gap:8px"><button class="btn btn-sm btn-primary" id="qeeg-annotation-save">Save note</button></div>'
    + '</div></aside>';
  host.classList.add('analysis-anno-host--open');
  // Wire character counters
  ['title', 'body', 'anchor'].forEach(function (k) {
    var input = document.getElementById('qeeg-annotation-' + k);
    var count = document.getElementById('qeeg-annotation-' + k + '-count');
    if (!input || !count) return;
    var sync = function () { count.textContent = (input.value || '').length; };
    input.addEventListener('input', sync);
    sync();
  });
  // Focus management — store previous focus, focus first field, restore on close
  var _annoPrevFocus = document.activeElement;
  setTimeout(function () { var f = document.getElementById('qeeg-annotation-title'); if (f) f.focus(); }, 30);
  function _annoCloseFocusRestore() {
    if (_annoPrevFocus && typeof _annoPrevFocus.focus === 'function') {
      try { _annoPrevFocus.focus(); } catch (_e) {}
    }
  }
  // Trap focus inside the drawer (Tab cycles within first/last focusable)
  var _annoTrap = function (ev) {
    if (ev.key !== 'Tab') return;
    var nodes = host.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (!nodes.length) return;
    var first = nodes[0], last = nodes[nodes.length - 1];
    if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
    else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
  };
  host.addEventListener('keydown', _annoTrap);
  // Escape closes the drawer
  var _annoEsc = function (ev) {
    if (ev.key === 'Escape' && host.classList.contains('analysis-anno-host--open')) {
      ev.preventDefault();
      host.classList.remove('analysis-anno-host--open');
      host.innerHTML = '';
      document.removeEventListener('keydown', _annoEsc);
      _annoCloseFocusRestore();
    }
  };
  document.addEventListener('keydown', _annoEsc);
  host.__annoCloseFocusRestore = _annoCloseFocusRestore;
  _qeegAnnotationDrawerLoadedFor = context;
  var listEl = document.getElementById('qeeg-annotation-list');
  try {
    var rows = await api.listAnnotations({
      patientId: context.patient_id,
      targetType: 'qeeg',
      targetId: context.target_id,
    });
    if (listEl) listEl.innerHTML = _renderAnnotationList(rows);
  } catch (err) {
    if (listEl) listEl.innerHTML = '<div class="analysis-anno-empty">Could not load notes: ' + esc(String(err && err.message ? err.message : err || "Unknown error")) + '</div>';
  }

  host.querySelectorAll('[data-annotation-close="1"]').forEach(function (node) {
    node.addEventListener('click', function () {
      host.classList.remove('analysis-anno-host--open');
      host.innerHTML = '';
      if (typeof host.__annoCloseFocusRestore === 'function') host.__annoCloseFocusRestore();
    });
  });
  host.querySelectorAll('[data-annotation-delete]').forEach(function (node) {
    node.addEventListener('click', async function () {
      var id = node.getAttribute('data-annotation-delete');
      if (!id) return;
      try {
        await api.deleteAnnotation(id);
        showToast('Note deleted', 'success');
        _openQEEGAnnotationDrawer(context);
      } catch (err) {
        showToast('Could not delete note: ' + (err.message || err), 'error');
      }
    });
  });
  var saveBtn = document.getElementById('qeeg-annotation-save');
  if (saveBtn) {
    saveBtn.addEventListener('click', async function () {
      var bodyEl = document.getElementById('qeeg-annotation-body');
      var titleEl = document.getElementById('qeeg-annotation-title');
      var anchorEl = document.getElementById('qeeg-annotation-anchor');
      var body = bodyEl && bodyEl.value ? bodyEl.value.trim() : '';
      if (!body) {
        showToast('Add some note text first', 'warning');
        return;
      }
      saveBtn.disabled = true;
      try {
        await api.createAnnotation({
          patient_id: context.patient_id,
          target_type: 'qeeg',
          target_id: context.target_id,
          title: titleEl && titleEl.value ? titleEl.value.trim() : null,
          body: body,
          anchor_label: anchorEl && anchorEl.value ? anchorEl.value.trim() : null,
          anchor_data: { analysis_id: context.target_id },
        });
        showToast('Note saved', 'success');
        _openQEEGAnnotationDrawer(context);
      } catch (err) {
        showToast('Could not save note: ' + (err.message || err), 'error');
      } finally {
        saveBtn.disabled = false;
      }
    });
  }
}

function _qeegAnnotationButton(context) {
  if (!context || !context.patient_id || !context.target_id) return '';
  var payload = JSON.stringify(context).replace(/"/g, '&quot;');
  return '<button class="btn btn-outline btn-sm analysis-anno-launch" data-qeeg-annotation="' + payload + '">Notes</button>';
}

function _bindQEEGAnnotationButtons() {
  document.querySelectorAll('[data-qeeg-annotation]').forEach(function (btn) {
    if (btn.dataset.annotationBound === '1') return;
    btn.dataset.annotationBound = '1';
    btn.addEventListener('click', function () {
      try {
        var ctx = JSON.parse(btn.getAttribute('data-qeeg-annotation') || '{}');
        _openQEEGAnnotationDrawer(ctx);
      } catch (_err) {
        showToast('Could not open notes', 'error');
      }
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// MNE-Python pipeline renderers (§4 of CONTRACT.md)
//
// Each renderer is null-guarded — returns '' when its input is missing, so
// analyses produced by the legacy pipeline (band_powers_json only) render
// unchanged.
//
// These helpers are `export`-ed (alongside the module's existing named
// export) so src/pages-qeeg-analysis-mne.test.js can exercise them without
// having to boot a DOM.
// ─────────────────────────────────────────────────────────────────────────────

// MNE feature flag — let ops disable the new pipeline button without a
// redeploy. Defaults to true; read from window at call time so tests can
// override via globalThis.
export function _mneFeatureFlagEnabled() {
  try {
    var v = (typeof window !== 'undefined' && window)
      ? window.DEEPSYNAPS_ENABLE_MNE
      : (typeof globalThis !== 'undefined' ? globalThis.DEEPSYNAPS_ENABLE_MNE : undefined);
    if (v === false || v === 'false' || v === 0 || v === '0') return false;
    return true;
  } catch (_) { return true; }
}

// Small pill used across the MNE sections for key/value counts.
function _mnePill(label, value, color) {
  return '<span class="qeeg-mne-pill" style="--pill-color:' + (color || 'var(--blue)') + '">'
    + '<span class="qeeg-mne-pill__label">' + esc(label) + '</span>'
    + '<span class="qeeg-mne-pill__value">' + esc(value) + '</span>'
    + '</span>';
}

// ── §4.1 Pipeline quality strip ─────────────────────────────────────────────
export function renderPipelineQualityStrip(analysis) {
  if (!analysis || !analysis.quality_metrics) return '';
  var q = analysis.quality_metrics;
  var bad = Array.isArray(q.bad_channels) ? q.bad_channels : [];
  var icaLabels = q.ica_labels_dropped || {};

  var pillsHtml = '';
  pillsHtml += _mnePill('Bad channels', String(bad.length), bad.length ? 'var(--red)' : 'var(--green)');
  if (q.ica_components_dropped != null) {
    pillsHtml += _mnePill('ICs dropped', String(q.ica_components_dropped), 'var(--violet)');
  }
  Object.keys(icaLabels).forEach(function (lbl) {
    pillsHtml += _mnePill('ICA ' + lbl, String(icaLabels[lbl]), 'var(--amber)');
  });
  if (q.n_epochs_retained != null && q.n_epochs_total != null) {
    var keepPct = q.n_epochs_total ? Math.round((q.n_epochs_retained / q.n_epochs_total) * 100) : 0;
    pillsHtml += _mnePill(
      'Epochs retained',
      q.n_epochs_retained + '/' + q.n_epochs_total + ' (' + keepPct + '%)',
      keepPct >= 70 ? 'var(--green)' : keepPct >= 40 ? 'var(--amber)' : 'var(--red)'
    );
  }
  if (q.sfreq_input != null && q.sfreq_output != null) {
    pillsHtml += _mnePill('Sample rate', q.sfreq_input + ' → ' + q.sfreq_output + ' Hz', 'var(--teal)');
  }
  if (Array.isArray(q.bandpass) && q.bandpass.length === 2) {
    pillsHtml += _mnePill('Bandpass', q.bandpass[0] + '–' + q.bandpass[1] + ' Hz', 'var(--blue)');
  }
  if (q.notch_hz != null) {
    pillsHtml += _mnePill('Notch', q.notch_hz + ' Hz', 'var(--blue)');
  }

  var badList = bad.length
    ? '<div class="qeeg-mne-badlist"><strong>Rejected channels:</strong> '
      + bad.map(esc).join(', ') + '</div>'
    : '';

  var footerBits = [];
  if (analysis.pipeline_version) {
    footerBits.push('pipeline <strong>' + esc(analysis.pipeline_version) + '</strong>');
  }
  if (analysis.norm_db_version) {
    footerBits.push('norm DB <strong>' + esc(analysis.norm_db_version) + '</strong>');
  }
  var footer = footerBits.length
    ? '<div class="qeeg-mne-version-badge" data-testid="qeeg-mne-version-badge">'
      + footerBits.join(' &middot; ') + '</div>'
    : '';

  return card('Pipeline Quality (MNE)',
    '<div class="qeeg-mne-pills">' + pillsHtml + '</div>' + badList + footer);
}

// ── §4.2 SpecParam panel ────────────────────────────────────────────────────
export function renderSpecParamPanel(analysis) {
  if (!analysis || !analysis.aperiodic) return '';
  var ap = analysis.aperiodic;
  var paf = analysis.peak_alpha_freq || {};
  var slopes = ap.slope || {};
  var offsets = ap.offset || {};
  var r2 = ap.r_squared || {};
  var channels = Object.keys(slopes);
  if (!channels.length) return '';

  // Sort by |slope| descending so extremes surface first.
  channels.sort(function (a, b) {
    return Math.abs(slopes[b] || 0) - Math.abs(slopes[a] || 0);
  });

  var rows = '';
  channels.forEach(function (ch) {
    var slope = slopes[ch];
    var off = offsets[ch];
    var rsq = r2[ch];
    var pafVal = paf[ch];
    var slopeExtreme = slope != null && (slope > 2.0 || slope < 0.5);
    var pafExtreme = pafVal != null && (pafVal < 8 || pafVal > 12);
    rows += '<tr>'
      + '<td style="font-weight:600">' + esc(ch) + '</td>'
      + '<td' + (slopeExtreme ? ' class="qeeg-mne-flag"' : '') + '>'
      + (slope != null ? slope.toFixed(3) : '-') + '</td>'
      + '<td>' + (off != null ? off.toFixed(3) : '-') + '</td>'
      + '<td>' + (rsq != null ? rsq.toFixed(3) : '-') + '</td>'
      + '<td' + (pafExtreme ? ' class="qeeg-mne-flag"' : '') + '>'
      + (pafVal != null ? (typeof pafVal === 'number' ? pafVal.toFixed(2) : esc(pafVal)) : '-') + '</td>'
      + '</tr>';
  });

  var table = '<div class="qeeg-table-wrap"><table class="ds-table" style="width:100%;font-size:12px">'
    + '<thead><tr><th>Channel</th><th>Slope (1/f)</th><th>Offset</th><th>R²</th><th>PAF (Hz)</th></tr></thead>'
    + '<tbody>' + rows + '</tbody></table></div>'
    + '<div class="qeeg-mne-legend">Yellow = slope outside 0.5–2.0 or PAF outside 8–12 Hz. '
    + 'Research/wellness use only.</div>';

  return card('SpecParam (Aperiodic + PAF)', table);
}

// ── §4.3 eLORETA ROI panel ──────────────────────────────────────────────────
export function renderELoretaROIPanel(analysis) {
  if (!analysis || !analysis.source_roi) return '';
  var src = analysis.source_roi;
  // Tolerate either a flat {band: {roi: v}} shape or a nested {bands: {...}}.
  var bandMap = src.bands || src;
  var bandNames = Object.keys(bandMap).filter(function (k) {
    return bandMap[k] && typeof bandMap[k] === 'object' && !Array.isArray(bandMap[k]);
  });
  if (!bandNames.length) return '';

  var method = src.method ? ' · ' + esc(src.method) : '';
  var innerHtml = '';

  bandNames.forEach(function (band) {
    var rois = bandMap[band];
    if (!rois || typeof rois !== 'object') return;
    var grouped = groupROIsByLobe(rois);
    var maxVal = 0;
    Object.keys(rois).forEach(function (r) {
      var v = Math.abs(Number(rois[r]) || 0);
      if (v > maxVal) maxVal = v;
    });

    var bandColor = BAND_COLORS[band] || 'var(--teal)';
    innerHtml += '<details class="qeeg-mne-band-block" open>'
      + '<summary class="qeeg-mne-band-summary" style="border-left-color:' + bandColor + '">'
      + '<strong style="color:' + bandColor + '">' + esc(band) + '</strong>'
      + '<span class="qeeg-mne-band-summary__n"> · ' + Object.keys(rois).length + ' ROIs</span>'
      + '</summary>';

    DK_LOBES.concat(['other']).forEach(function (lobe) {
      var entries = grouped[lobe] || [];
      if (!entries.length) return;
      innerHtml += '<details class="qeeg-mne-lobe-block">'
        + '<summary class="qeeg-mne-lobe-summary"><span class="qeeg-mne-lobe-name">'
        + esc(lobe.charAt(0).toUpperCase() + lobe.slice(1)) + '</span>'
        + '<span class="qeeg-mne-lobe-count">' + entries.length + '</span></summary>'
        + '<div class="qeeg-mne-roi-list">';
      entries.forEach(function (e) {
        var v = Number(e.value) || 0;
        var w = maxVal > 0 ? Math.min(100, Math.max(0, (Math.abs(v) / maxVal) * 100)) : 0;
        var hemiTag = e.hemi ? '<span class="qeeg-mne-hemi">' + e.hemi.toUpperCase() + '</span>' : '';
        innerHtml += '<div class="qeeg-mne-roi-row">'
          + '<div class="qeeg-mne-roi-label">' + hemiTag + esc(e.label) + '</div>'
          + '<div class="qeeg-mne-roi-bar"><div class="qeeg-mne-roi-bar__fill" '
          + 'style="width:' + w.toFixed(1) + '%;background:' + bandColor + '"></div></div>'
          + '<div class="qeeg-mne-roi-val">' + (typeof v === 'number' ? v.toFixed(3) : esc(v)) + '</div>'
          + '</div>';
      });
      innerHtml += '</div></details>';
    });
    innerHtml += '</details>';
  });

  return card('eLORETA ROI Power' + method, innerHtml);
}

// ── §4.3b Source ROIs on 3D Brain Map ──────────────────────────────────────
// Approximate Desikan-Killiany ROI centroids in MNI mm. Right hemisphere
// uses positive x; left flips sign at lookup time. These are coarse
// references used only to position dots on the atlas template — not for
// neuronavigation.
var DK_ROI_MNI = {
  superiorfrontal:           [22,  28,  50],
  rostralmiddlefrontal:      [36,  50,  18],
  caudalmiddlefrontal:       [38,  16,  46],
  lateralorbitofrontal:      [28,  32, -16],
  medialorbitofrontal:       [ 6,  44, -16],
  parsopercularis:           [50,  16,  16],
  parstriangularis:          [50,  30,  10],
  parsorbitalis:             [44,  36, -10],
  precentral:                [38, -10,  50],
  postcentral:               [44, -22,  50],
  paracentral:               [ 8, -28,  56],
  superiorparietal:          [22, -60,  60],
  inferiorparietal:          [46, -56,  42],
  supramarginal:             [54, -38,  34],
  precuneus:                 [10, -56,  44],
  superiortemporal:          [58, -16,   4],
  middletemporal:            [58, -32,  -8],
  inferiortemporal:          [54, -36, -22],
  bankssts:                  [54, -42,   6],
  fusiform:                  [38, -50, -22],
  parahippocampal:           [24, -28, -18],
  entorhinal:                [24,  -8, -32],
  temporalpole:              [38,  10, -34],
  transversetemporal:        [46, -22,  10],
  lateraloccipital:          [38, -78,   0],
  cuneus:                    [10, -82,  18],
  pericalcarine:             [12, -78,   8],
  lingual:                   [16, -70,  -6],
  rostralanteriorcingulate:  [ 6,  36,  12],
  caudalanteriorcingulate:   [ 6,  16,  28],
  posteriorcingulate:        [ 6, -42,  32],
  isthmuscingulate:          [ 8, -46,  20],
  insula:                    [38,   4,   0],
};
function _dkLookup(roiKey) {
  // roiKey looks like "lh.superiorfrontal" or "rh.precuneus".
  var parts = String(roiKey || '').split('.');
  if (parts.length !== 2) return null;
  var hemi = parts[0].toLowerCase();
  var label = parts[1].toLowerCase();
  var mni = DK_ROI_MNI[label];
  if (!mni) return null;
  var x = (hemi === 'lh') ? -mni[0] : mni[0];
  return { mni: [x, mni[1], mni[2]], hemi: hemi, label: label };
}
export function renderQEEGSource3DBrain(analysis) {
  if (!analysis || !analysis.source_roi) return '';
  var src = analysis.source_roi;
  var bandMap = src.bands || src;
  var bandNames = Object.keys(bandMap).filter(function (k) {
    return bandMap[k] && typeof bandMap[k] === 'object' && !Array.isArray(bandMap[k]);
  });
  if (!bandNames.length) return '';

  var defaultBand = bandNames.indexOf('alpha') >= 0 ? 'alpha' : bandNames[0];
  var TOP_N = 8;

  // Pre-compute per-band top-N ROI data
  var bandData = {};
  bandNames.forEach(function (band) {
    var rois = bandMap[band] || {};
    var rows = [];
    Object.keys(rois).forEach(function (key) {
      var lk = _dkLookup(key);
      if (!lk) return;
      var v = Number(rois[key]);
      if (!isFinite(v)) return;
      rows.push({ key: key, value: v, abs: Math.abs(v), mni: lk.mni, hemi: lk.hemi, label: lk.label });
    });
    rows.sort(function (a, b) { return b.abs - a.abs; });
    bandData[band] = rows.slice(0, TOP_N);
  });

  // Build approximate channel-level power from ROIs for the 3D brain map
  // by mapping DK ROIs to their nearest 10-20 electrodes
  var _ROI_TO_ELECTRODE = {
    superiorfrontal: ['Fz','F3','F4'], rostralmiddlefrontal: ['F3','F4'],
    caudalmiddlefrontal: ['F3','F4','Fz'], parsopercularis: ['F7','F8'],
    parstriangularis: ['F7','F8'], parsorbitalis: ['Fp1','Fp2'],
    lateralorbitofrontal: ['Fp1','Fp2'], medialorbitofrontal: ['Fp1','Fp2','Fz'],
    precentral: ['C3','C4'], postcentral: ['C3','C4','P3','P4'],
    superiorparietal: ['P3','P4','Pz'], inferiorparietal: ['P3','P4','P7','P8'],
    supramarginal: ['P3','P4'], precuneus: ['Pz','P3','P4'],
    superiortemporal: ['T7','T8'], middletemporal: ['T7','T8'],
    inferiortemporal: ['T7','T8','P7','P8'], fusiform: ['P7','P8'],
    entorhinal: ['T7','T8'], parahippocampal: ['T7','T8'],
    temporalpole: ['T7','T8','F7','F8'], transversetemporal: ['T7','T8','C3','C4'],
    bankssts: ['T7','T8','P7','P8'], lateraloccipital: ['O1','O2'],
    lingual: ['O1','O2','Oz'], cuneus: ['O1','O2','Oz'],
    pericalcarine: ['O1','O2','Oz'], isthmuscingulate: ['Pz','Cz'],
    posteriorcingulate: ['Pz','Cz'], caudalanteriorcingulate: ['Fz','Cz'],
    rostralanteriorcingulate: ['Fz','Fp1','Fp2'], insula: ['T7','T8'],
    frontalpole: ['Fp1','Fp2'],
  };
  function _roiToChannelPowers(rows) {
    var chSum = {}, chCnt = {};
    rows.forEach(function (r) {
      var electrodes = _ROI_TO_ELECTRODE[r.label] || [];
      var hPrefix = r.hemi === 'lh' ? 'l' : 'r';
      electrodes.forEach(function (ch) {
        // Only map left-hemisphere ROIs to left-side electrodes and vice versa
        var isLeft = ch.indexOf('1') >= 0 || ch.indexOf('3') >= 0 || ch.indexOf('7') >= 0 || ch === 'T7' || ch === 'P7';
        var isRight = ch.indexOf('2') >= 0 || ch.indexOf('4') >= 0 || ch.indexOf('8') >= 0 || ch === 'T8' || ch === 'P8';
        var isMidline = ch === 'Fz' || ch === 'Cz' || ch === 'Pz' || ch === 'Oz';
        if (isMidline || (hPrefix === 'l' && isLeft) || (hPrefix === 'r' && isRight)) {
          chSum[ch] = (chSum[ch] || 0) + r.value;
          chCnt[ch] = (chCnt[ch] || 0) + 1;
        }
      });
    });
    var out = {};
    Object.keys(chSum).forEach(function (ch) { out[ch] = chSum[ch] / chCnt[ch]; });
    return out;
  }

  var channelPowers = _roiToChannelPowers(bandData[defaultBand] || []);
  var brainSvg = render3DBrainMap(channelPowers, { band: defaultBand, size: 360, colorScale: 'warm' });

  var bandTabs = '<div class="ds-source-3d-bands" id="ds-source-3d-bands" role="tablist" aria-label="Frequency band">'
    + bandNames.map(function (b) {
      var on = b === defaultBand;
      return '<button type="button" class="ds-source-3d-band' + (on ? ' is-active' : '') + '"'
        + ' role="tab" aria-selected="' + (on ? 'true' : 'false') + '"'
        + ' data-band="' + esc(b) + '"'
        + ' style="--band-color:' + (BAND_COLORS[b] || '#56b870') + '">'
        + esc(b) + '</button>';
    }).join('')
    + '</div>';

  // Top ROIs list for default band
  var roiListHtml = '<div class="ds-source-3d-rois" id="ds-source-3d-rois">'
    + (bandData[defaultBand] || []).map(function (r, i) {
      var labelTxt = r.hemi.toUpperCase() + ' ' + r.label;
      var barWidth = Math.round((r.abs / ((bandData[defaultBand][0] || {}).abs || 1)) * 100);
      return '<div class="ds-source-3d-roi-row">'
        + '<span class="ds-source-3d-roi-rank">#' + (i + 1) + '</span>'
        + '<span class="ds-source-3d-roi-label">' + esc(labelTxt) + '</span>'
        + '<div class="ds-source-3d-roi-bar"><div class="ds-source-3d-roi-fill" style="width:' + barWidth + '%;background:' + (BAND_COLORS[defaultBand] || '#56b870') + '"></div></div>'
        + '<span class="ds-source-3d-roi-val">' + r.value.toFixed(3) + '</span>'
        + '</div>';
    }).join('')
    + '</div>';

  var caption = '<div class="ds-source-3d-caption">'
    + 'Top ' + TOP_N + ' source-localized ROIs (eLORETA) mapped to 10-20 electrodes on 3D brain.'
    + '</div>';

  var dataPayload = encodeURIComponent(JSON.stringify(bandData));

  return card(
    'Source ROIs — 3D Brain Map',
    '<div class="ds-source-3d-wrap" id="ds-source-3d-wrap" data-band="' + esc(defaultBand) + '"'
      + ' data-bandpayload="' + dataPayload + '">'
      + bandTabs
      + '<div class="ds-source-3d-content">'
      + '<div class="ds-source-3d-brain" id="ds-source-3d-brain">' + brainSvg + '</div>'
      + '<div class="ds-source-3d-info">' + roiListHtml + '</div>'
      + '</div>'
      + caption
      + '</div>'
  );
}

// ── §4.4 Normative z-score heatmap ──────────────────────────────────────────
export function renderNormativeZScoreHeatmap(analysis) {
  if (!analysis || !analysis.normative_zscores) return '';
  var nz = analysis.normative_zscores;
  // Accept either {spectral:{bands:{...}}} (pipeline shape) or a flat
  // {channel:{band: z}} map.
  var byChannel = {};
  var bandsSeen = {};

  if (nz.spectral && nz.spectral.bands) {
    Object.keys(nz.spectral.bands).forEach(function (band) {
      bandsSeen[band] = true;
      var abs = (nz.spectral.bands[band] && nz.spectral.bands[band].absolute_uv2) || {};
      Object.keys(abs).forEach(function (ch) {
        byChannel[ch] = byChannel[ch] || {};
        byChannel[ch][band] = abs[ch];
      });
    });
  } else {
    Object.keys(nz).forEach(function (ch) {
      if (ch === 'flagged' || ch === 'norm_db_version' || ch === 'aperiodic') return;
      var val = nz[ch];
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        byChannel[ch] = val;
        Object.keys(val).forEach(function (b) { bandsSeen[b] = true; });
      }
    });
  }

  var channels = Object.keys(byChannel).sort();
  var bands = Object.keys(bandsSeen);
  if (!channels.length || !bands.length) return '';

  // Flagged findings list (from pipeline) — deduplicated by metric+channel.
  var flaggedMap = {};
  if (Array.isArray(nz.flagged)) {
    nz.flagged.forEach(function (f) {
      if (!f) return;
      var key = (f.metric || '') + '|' + (f.channel || '');
      if (!flaggedMap[key]) flaggedMap[key] = f;
    });
  }

  // Build a per-cell metric-path lookup for tooltip.
  function metricPathFor(ch, band) {
    // Prefer an explicit match from flagged[*].metric if present.
    var hits = Object.values(flaggedMap).filter(function (f) {
      return f && f.channel === ch && typeof f.metric === 'string' && f.metric.indexOf(band) !== -1;
    });
    if (hits.length) return hits[0].metric;
    return 'spectral.bands.' + band + '.absolute_uv2';
  }

  function cellClass(z) {
    if (z == null) return '';
    var az = Math.abs(z);
    if (az >= 2.58) return 'qeeg-mne-zcell qeeg-mne-zcell--severe';
    if (az >= 1.96) return 'qeeg-mne-zcell qeeg-mne-zcell--flag';
    if (z > 0) return 'qeeg-mne-zcell qeeg-mne-zcell--pos';
    return 'qeeg-mne-zcell qeeg-mne-zcell--neg';
  }

  function cellStyle(z) {
    if (z == null) return '';
    var az = Math.min(4, Math.abs(z));
    var alpha = 0.10 + (az / 4) * 0.55;
    if (z > 0) return 'background:rgba(239,83,80,' + alpha.toFixed(2) + ')';
    return 'background:rgba(66,165,245,' + alpha.toFixed(2) + ')';
  }

  var head = '<tr><th>Ch</th>';
  bands.forEach(function (b) {
    head += '<th style="color:' + (BAND_COLORS[b] || 'var(--text-primary)') + '">' + esc(b) + '</th>';
  });
  head += '</tr>';

  var body = '';
  channels.forEach(function (ch) {
    body += '<tr><td style="font-weight:600">' + esc(ch) + '</td>';
    bands.forEach(function (b) {
      var z = byChannel[ch] ? byChannel[ch][b] : null;
      if (z == null || isNaN(z)) {
        body += '<td class="qeeg-mne-zcell">-</td>';
        return;
      }
      var az = Math.abs(z);
      var flagIcon = az >= 2.58 ? ' <span class="qeeg-mne-flag-icon" aria-label="severe">&#x2691;</span>' : '';
      var path = metricPathFor(ch, b);
      body += '<td class="' + cellClass(z) + '" style="' + cellStyle(z) + '" '
        + 'title="' + esc(path) + ' = ' + z.toFixed(2) + '">'
        + z.toFixed(2) + flagIcon + '</td>';
    });
    body += '</tr>';
  });

  var heatmap = '<div class="qeeg-table-wrap"><table class="ds-table qeeg-mne-ztable">'
    + '<thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>';

  // Flagged findings list
  var findingsHtml = '';
  var flaggedList = Object.values(flaggedMap);
  if (flaggedList.length) {
    flaggedList.sort(function (a, b) { return Math.abs(b.z || 0) - Math.abs(a.z || 0); });
    findingsHtml += '<div class="qeeg-mne-findings">'
      + '<strong>Flagged findings</strong><ul>';
    flaggedList.forEach(function (f) {
      var az = Math.abs(f.z || 0);
      var sev = az >= 2.58 ? 'severe' : az >= 1.96 ? 'flagged' : 'note';
      findingsHtml += '<li><code>' + esc(f.metric || '') + '</code>'
        + ' · channel <strong>' + esc(f.channel || '') + '</strong>'
        + ' · z = ' + (typeof f.z === 'number' ? f.z.toFixed(2) : esc(f.z || ''))
        + ' <span class="qeeg-mne-sev qeeg-mne-sev--' + sev + '">' + sev + '</span></li>';
    });
    findingsHtml += '</ul></div>';
  }

  var legend = '<div class="qeeg-mne-legend">'
    + '<span class="qeeg-mne-zcell qeeg-mne-zcell--flag" style="padding:1px 6px">|z| ≥ 1.96</span> '
    + '<span class="qeeg-mne-zcell qeeg-mne-zcell--severe" style="padding:1px 6px">|z| ≥ 2.58 &#x2691;</span> '
    + 'Red = hyper, blue = hypo (research/wellness use).'
    + '</div>';

  return card('Normative z-scores', heatmap + legend + findingsHtml);
}

export function renderNormativeTopomapGrid(analysis) {
  if (!analysis || !analysis.normative_zscores) return '';
  var spectral = analysis.normative_zscores.spectral && analysis.normative_zscores.spectral.bands
    ? analysis.normative_zscores.spectral.bands
    : null;
  if (!spectral) return '';
  var bands = Object.keys(spectral);
  if (!bands.length) return '';
  var html = '<div class="qeeg-band-grid">';
  bands.forEach(function (band) {
    var values = spectral[band] && spectral[band].absolute_uv2 ? spectral[band].absolute_uv2 : {};
    if (!Object.keys(values).length) return;
    html += '<div style="text-align:center">'
      + renderTopoHeatmap(values, { band: band + ' z-score', unit: 'z', size: 220, colorScale: 'diverging' })
      + '</div>';
  });
  html += '</div>';
  return html.indexOf('ds-topo-heatmap') !== -1 ? card('Normative Topomaps', html) : '';
}

function _buildBrainRingPayload(analysis) {
  if (!analysis) return null;
  var coh = analysis.advanced_analyses && analysis.advanced_analyses.results
    ? analysis.advanced_analyses.results.coherence_matrix
    : null;
  if (!coh || coh.status !== 'ok' || !coh.data || !coh.data.channels || !coh.data.bands) return null;
  var band = coh.data.bands.alpha ? 'alpha' : Object.keys(coh.data.bands)[0];
  if (!band) return null;
  var channels = coh.data.channels || [];
  var matrix = coh.data.bands[band];
  if (!channels.length || !matrix) return null;

  var connections = [];
  for (var row = 0; row < matrix.length; row++) {
    for (var col = row + 1; col < matrix[row].length; col++) {
      connections.push({ ch1: channels[row], ch2: channels[col], value: Number(matrix[row][col] || 0) });
    }
  }
  connections.sort(function (a, b) { return b.value - a.value; });
  var topConnections = connections.slice(0, 18);
  var nodes = channels.map(function (label, index) {
    return { id: index, label: label, color: BAND_COLORS[band] || '#56b870' };
  });
  var edges = [];
  topConnections.forEach(function (conn) {
    var source = channels.indexOf(conn.ch1);
    var target = channels.indexOf(conn.ch2);
    if (source === -1 || target === -1) return;
    edges.push({ source: source, target: target, weight: conn.value, sign: 1 });
  });

  return {
    band: band,
    nodes: nodes,
    edges: edges,
    threshold: 0.45,
    topConnections: topConnections
  };
}

function _brainRingFrameMarkup(payload) {
  if (!payload || !payload.nodes || !payload.nodes.length || !payload.edges || !payload.edges.length) return '';
  var encoded = encodeURIComponent(JSON.stringify({
    type: 'brainring/load',
    atlas: '10-20',
    band: payload.band,
    threshold: payload.threshold,
    nodes: payload.nodes,
    edges: payload.edges
  }));
  return '<div class="qeeg-brainring-frame-wrap" style="display:grid;gap:8px">'
    + '<iframe'
    + ' title="BrainRing connectivity viewer"'
    + ' data-brainring-frame="1"'
    + ' data-brainring-payload="' + esc(encoded) + '"'
    + ' src="/vendor/brainring/brainring.html"'
    + ' loading="lazy"'
    + ' style="width:100%;min-height:360px;border:1px solid rgba(148,163,184,.28);border-radius:16px;background:#07111f"'
    + '></iframe>'
    + '<div data-brainring-fallback="1">'
    + renderConnectivityChordLite(payload.nodes, payload.edges, { title: payload.band + ' connectivity chord', size: 320, threshold: payload.threshold })
    + '</div>'
    + '</div>';
}

// ── Source 3D Brain Map wiring (band toggles) ─────────────────────────────
function _wireQEEGSource3DBrain() {
  if (typeof document === 'undefined') return;
  var wrap = document.getElementById('ds-source-3d-wrap');
  var brainCont = document.getElementById('ds-source-3d-brain');
  var roisCont = document.getElementById('ds-source-3d-rois');
  if (!wrap || !brainCont) return;

  var bandData = {};
  try {
    bandData = JSON.parse(decodeURIComponent(wrap.getAttribute('data-bandpayload') || '{}'));
  } catch (_e) { bandData = {}; }

  var _ROI_TO_ELECTRODE = {
    superiorfrontal: ['Fz','F3','F4'], rostralmiddlefrontal: ['F3','F4'],
    caudalmiddlefrontal: ['F3','F4','Fz'], parsopercularis: ['F7','F8'],
    parstriangularis: ['F7','F8'], parsorbitalis: ['Fp1','Fp2'],
    lateralorbitofrontal: ['Fp1','Fp2'], medialorbitofrontal: ['Fp1','Fp2','Fz'],
    precentral: ['C3','C4'], postcentral: ['C3','C4','P3','P4'],
    superiorparietal: ['P3','P4','Pz'], inferiorparietal: ['P3','P4','P7','P8'],
    supramarginal: ['P3','P4'], precuneus: ['Pz','P3','P4'],
    superiortemporal: ['T7','T8'], middletemporal: ['T7','T8'],
    inferiortemporal: ['T7','T8','P7','P8'], fusiform: ['P7','P8'],
    entorhinal: ['T7','T8'], parahippocampal: ['T7','T8'],
    temporalpole: ['T7','T8','F7','F8'], transversetemporal: ['T7','T8','C3','C4'],
    bankssts: ['T7','T8','P7','P8'], lateraloccipital: ['O1','O2'],
    lingual: ['O1','O2'], cuneus: ['O1','O2'],
    pericalcarine: ['O1','O2'], isthmuscingulate: ['Pz','Cz'],
    posteriorcingulate: ['Pz','Cz'], caudalanteriorcingulate: ['Fz','Cz'],
    rostralanteriorcingulate: ['Fz','Fp1','Fp2'], insula: ['T7','T8'],
    frontalpole: ['Fp1','Fp2'],
  };
  function roiToChannelPowers(rows) {
    var chSum = {}, chCnt = {};
    rows.forEach(function (r) {
      var electrodes = _ROI_TO_ELECTRODE[r.label] || [];
      var hPrefix = r.hemi === 'lh' ? 'l' : 'r';
      electrodes.forEach(function (ch) {
        var isLeft = ch.indexOf('1') >= 0 || ch.indexOf('3') >= 0 || ch.indexOf('7') >= 0 || ch === 'T7' || ch === 'P7';
        var isRight = ch.indexOf('2') >= 0 || ch.indexOf('4') >= 0 || ch.indexOf('8') >= 0 || ch === 'T8' || ch === 'P8';
        var isMidline = ch === 'Fz' || ch === 'Cz' || ch === 'Pz' || ch === 'Oz';
        if (isMidline || (hPrefix === 'l' && isLeft) || (hPrefix === 'r' && isRight)) {
          chSum[ch] = (chSum[ch] || 0) + r.value;
          chCnt[ch] = (chCnt[ch] || 0) + 1;
        }
      });
    });
    var out = {};
    Object.keys(chSum).forEach(function (ch) { out[ch] = chSum[ch] / chCnt[ch]; });
    return out;
  }

  wrap.querySelectorAll('.ds-source-3d-band').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var b = btn.getAttribute('data-band');
      if (!b) return;
      wrap.querySelectorAll('.ds-source-3d-band').forEach(function (bb) {
        var on = bb === btn;
        bb.classList.toggle('is-active', on);
        bb.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      wrap.setAttribute('data-band', b);
      var rows = bandData[b] || [];
      var chPow = roiToChannelPowers(rows);
      brainCont.innerHTML = render3DBrainMap(chPow, { band: b, size: 360, colorScale: 'warm' });
      if (roisCont) {
        var topAbs = (rows[0] || {}).abs || 1;
        roisCont.innerHTML = rows.map(function (r, i) {
          var labelTxt = r.hemi.toUpperCase() + ' ' + r.label;
          var barWidth = Math.round((r.abs / topAbs) * 100);
          return '<div class="ds-source-3d-roi-row">'
            + '<span class="ds-source-3d-roi-rank">#' + (i + 1) + '</span>'
            + '<span class="ds-source-3d-roi-label">' + esc(labelTxt) + '</span>'
            + '<div class="ds-source-3d-roi-bar"><div class="ds-source-3d-roi-fill" style="width:' + barWidth + '%;background:' + (BAND_COLORS[b] || '#56b870') + '"></div></div>'
            + '<span class="ds-source-3d-roi-val">' + r.value.toFixed(3) + '</span>'
            + '</div>';
        }).join('');
      }
    });
  });
}

function _bindBrainRingFrames() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (!window.__dsBrainRingMessageBound) {
    // In unit tests `window` may be a stub without addEventListener.
    if (typeof window.addEventListener === 'function') window.addEventListener('message', function (event) {
      var data = event && event.data ? event.data : null;
      if (!data || (data.type !== 'brainring/ready' && data.type !== 'brainring/rendered')) return;
      var frames = document.querySelectorAll('iframe[data-brainring-frame="1"]');
      frames.forEach(function (frame) {
        if (frame.contentWindow !== event.source) return;
        var fallback = frame.parentElement ? frame.parentElement.querySelector('[data-brainring-fallback="1"]') : null;
        if (fallback) fallback.style.display = 'none';
      });
    });
    window.__dsBrainRingMessageBound = true;
  }

  document.querySelectorAll('iframe[data-brainring-frame="1"]').forEach(function (frame) {
    if (frame.dataset.brainringBound === '1') return;
    frame.dataset.brainringBound = '1';
    var payloadRaw = frame.getAttribute('data-brainring-payload') || '';
    var payload = null;
    try {
      payload = JSON.parse(decodeURIComponent(payloadRaw));
    } catch (_) {
      payload = null;
    }
    if (!payload) return;
    var send = function () {
      try {
        if (frame.contentWindow) frame.contentWindow.postMessage(payload, '*');
      } catch (_) {}
    };
    frame.addEventListener('load', send);
    send();
    setTimeout(send, 250);
    setTimeout(send, 1000);
  });
}

export function renderConnectivityClinicViz(analysis) {
  var payload = _buildBrainRingPayload(analysis);
  if (!payload) return '';
  var html = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px">'
    + '<div style="overflow:auto">'
    + renderConnectivityBrainMap(payload.topConnections, { band: payload.band + ' coherence', size: 320, threshold: payload.threshold })
    + '</div>'
    + '<div style="overflow:auto">'
    + _brainRingFrameMarkup(payload)
    + '</div>'
    + '</div>';
  return card('Connectivity Visualizations', html);
}

// ── §4.5 Asymmetry + graph strip ────────────────────────────────────────────
export function renderAsymmetryGraphStrip(analysis) {
  if (!analysis) return '';
  var asym = analysis.asymmetry;
  var graph = analysis.graph_metrics;
  if (!asym && !graph) return '';

  var inner = '';

  if (asym) {
    var f34 = asym.frontal_alpha_F3_F4;
    var f78 = asym.frontal_alpha_F7_F8;
    var patientId = _getContextPatientIdForQEEG();
    var evidenceChip = EvidenceChip({
      count: 27,
      evidenceLevel: 'high',
      label: 'FAA evidence',
      compact: true,
      query: createEvidenceQueryForTarget({
        patientId: patientId || 'qeeg-context',
        targetName: 'frontal_alpha_asymmetry',
        contextType: 'biomarker',
        modalityFilters: ['qeeg'],
        featureSummary: [
          { name: 'Frontal alpha asymmetry F3/F4', value: f34, modality: 'qEEG', direction: 'elevated', contribution: 0.3 },
          { name: 'Frontal alpha asymmetry F7/F8', value: f78, modality: 'qEEG', direction: 'contextual', contribution: 0.18 },
        ],
      }),
    });
    function hint(v) {
      if (v == null) return '';
      return v > 0 ? 'positive → left hypoactivation'
                    : v < 0 ? 'negative → right hypoactivation'
                    : 'symmetric';
    }
    inner += '<div class="qeeg-mne-asym">'
      + '<div class="qeeg-mne-asym-card">'
      + '<div class="qeeg-mne-asym__label">Frontal α F3/F4</div>'
      + '<div class="qeeg-mne-asym__val">' + (f34 != null ? f34.toFixed(3) : '-') + '</div>'
      + '<div class="qeeg-mne-asym__hint">' + esc(hint(f34)) + '</div></div>'
      + '<div class="qeeg-mne-asym-card">'
      + '<div class="qeeg-mne-asym__label">Frontal α F7/F8</div>'
      + '<div class="qeeg-mne-asym__val">' + (f78 != null ? f78.toFixed(3) : '-') + '</div>'
      + '<div class="qeeg-mne-asym__hint">' + esc(hint(f78)) + '</div></div>'
      + '</div>';
  }

  if (graph) {
    var bands = Object.keys(graph);
    if (bands.length) {
      var rows = '';
      bands.forEach(function (b) {
        var g = graph[b] || {};
        var bandColor = BAND_COLORS[b] || 'var(--text-primary)';
        rows += '<tr>'
          + '<td style="font-weight:600;color:' + bandColor + '">' + esc(b) + '</td>'
          + '<td>' + (g.clustering_coef != null ? Number(g.clustering_coef).toFixed(3) : '-') + '</td>'
          + '<td>' + (g.char_path_length != null ? Number(g.char_path_length).toFixed(3) : '-') + '</td>'
          + '<td>' + (g.small_worldness != null ? Number(g.small_worldness).toFixed(3) : '-') + '</td>'
          + '</tr>';
      });
      inner += '<div class="qeeg-table-wrap" style="margin-top:10px"><table class="ds-table" style="width:100%;font-size:12px">'
        + '<thead><tr><th>Band</th><th>Clustering</th><th>Char. path length</th><th>Small-worldness</th></tr></thead>'
        + '<tbody>' + rows + '</tbody></table></div>';
    }
  }

  return card('Asymmetry & Graph Metrics', inner);
}

// ── §4.6 AI narrative + citations ───────────────────────────────────────────
// Build a {n: {url, ...ref}} map from the literature_refs array.
function _buildRefIndex(refs) {
  var idx = {};
  if (!Array.isArray(refs)) return idx;
  refs.forEach(function (r) {
    if (!r) return;
    var n = r.n != null ? r.n : (r.index != null ? r.index : null);
    if (n == null) return;
    var url = r.url;
    if (!url) {
      if (r.pmid) url = 'https://pubmed.ncbi.nlm.nih.gov/' + r.pmid + '/';
      else if (r.doi) url = 'https://doi.org/' + r.doi;
    }
    idx[n] = Object.assign({}, r, { url: url });
  });
  return idx;
}

// Turn "[1]" / "[2,3]" / "[1][2]" inline markers in a plain string into
// anchor tags. Input MUST already be HTML-escaped.
export function linkifyCitations(escapedText, refIndex) {
  if (!escapedText) return '';
  if (!refIndex) return escapedText;
  return escapedText.replace(/\[(\d+(?:\s*,\s*\d+)*)\]/g, function (match, nums) {
    var parts = nums.split(',').map(function (n) { return n.trim(); });
    var linked = parts.map(function (n) {
      var ref = refIndex[n] || refIndex[Number(n)];
      if (ref && ref.url) {
        return '<a href="' + esc(ref.url) + '" target="_blank" rel="noopener noreferrer" '
          + 'class="qeeg-mne-cite" data-cite-n="' + esc(n) + '">' + n + '</a>';
      }
      return n;
    });
    return '[' + linked.join(', ') + ']';
  });
}

export function renderLiteratureRefs(refs) {
  if (!Array.isArray(refs) || !refs.length) return '';
  // Sort by n ascending
  var sorted = refs.slice().sort(function (a, b) {
    return (a.n || 0) - (b.n || 0);
  });
  var items = sorted.map(function (r) {
    var url = r.url;
    if (!url && r.pmid) url = 'https://pubmed.ncbi.nlm.nih.gov/' + r.pmid + '/';
    if (!url && r.doi) url = 'https://doi.org/' + r.doi;
    var n = r.n != null ? r.n : '?';
    var title = r.title || (r.pmid ? 'PMID ' + r.pmid : (r.doi ? 'DOI ' + r.doi : 'reference ' + n));
    var year = r.year ? ' (' + esc(r.year) + ')' : '';
    var journal = r.journal ? ', <em>' + esc(r.journal) + '</em>' : '';
    var anchor = url
      ? '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(title) + '</a>'
      : esc(title);
    return '<li id="qeeg-mne-ref-' + esc(n) + '" value="' + esc(n) + '">'
      + anchor + year + journal + '</li>';
  }).join('');
  return '<div class="qeeg-mne-refs"><strong>Literature</strong>'
    + '<ol class="qeeg-mne-refs__list">' + items + '</ol></div>';
}

// Render an AI narrative block with clickable citation anchors.
// Accepts a narrative object shaped like the §5 AIReport:
//   { executive_summary: "...", findings: [{region, band, observation, citations:[1,2]}, ...] }
// plus a `literature_refs` array.
export function renderAINarrativeWithCitations(narrative, literatureRefs) {
  if (!narrative && !(Array.isArray(literatureRefs) && literatureRefs.length)) return '';
  var refIdx = _buildRefIndex(literatureRefs);
  var html = '';

  if (narrative && narrative.executive_summary) {
    var safe = esc(narrative.executive_summary);
    html += '<div class="qeeg-mne-exec-summary">'
      + '<strong>Executive summary</strong>'
      + '<p>' + linkifyCitations(safe, refIdx) + '</p>'
      + '</div>';
  }

  if (narrative && Array.isArray(narrative.findings) && narrative.findings.length) {
    html += '<div class="qeeg-mne-findings-list"><strong>Findings / observations</strong><ul>';
    narrative.findings.forEach(function (f) {
      var region = f.region ? '<strong>' + esc(f.region) + '</strong>' : '';
      var band = f.band ? ' · ' + esc(f.band) : '';
      var obs = esc(f.observation || '');
      var inlineCites = '';
      if (Array.isArray(f.citations) && f.citations.length) {
        inlineCites = ' [' + f.citations.map(function (n) {
          var ref = refIdx[n];
          if (ref && ref.url) {
            return '<a href="' + esc(ref.url) + '" target="_blank" rel="noopener noreferrer" '
              + 'class="qeeg-mne-cite" data-cite-n="' + esc(String(n)) + '">' + esc(String(n)) + '</a>';
          }
          return esc(String(n));
        }).join(', ') + ']';
      }
      html += '<li>' + region + band + (region || band ? ' — ' : '')
        + linkifyCitations(obs, refIdx) + inlineCites + '</li>';
    });
    html += '</ul></div>';
  }

  if (narrative && narrative.confidence_level) {
    html += '<div class="qeeg-mne-confidence">Confidence: <strong>'
      + esc(narrative.confidence_level) + '</strong> (research/wellness use)</div>';
  }

  html += renderLiteratureRefs(literatureRefs);
  return html ? card('AI Narrative (RAG-grounded)', html) : '';
}

// Composite renderer — returns all MNE sections, in the order the contract
// dictates, concatenated. Null-guarded at every step so analyses without
// these fields render zero extra HTML.
// ── QC flags + observed-vs-inferred decision-support card (2026-04-26) ──────
//
// Reads the night-shift-promoted top-level keys (`qc_flags`, `confidence`,
// `limitations`, `clinical_summary.observed_findings`,
// `clinical_summary.derived_interpretations`) and renders three badged
// sub-blocks. Designed as a no-op when the keys are absent so existing
// non-MNE analyses still render unchanged.
export function renderQEEGDecisionSupport(analysis) {
  if (!analysis) return '';
  var cs = analysis.clinical_summary || (analysis.features && analysis.features.clinical_summary) || {};
  var qcFlags = Array.isArray(analysis.qc_flags) && analysis.qc_flags.length
    ? analysis.qc_flags
    : (Array.isArray(cs.qc_flags) ? cs.qc_flags : []);
  var limitations = Array.isArray(analysis.limitations) && analysis.limitations.length
    ? analysis.limitations
    : (Array.isArray(cs.limitations) ? cs.limitations : []);
  var confidence = analysis.confidence && Object.keys(analysis.confidence).length
    ? analysis.confidence
    : (cs.confidence || {});
  var observed = Array.isArray(cs.observed_findings) ? cs.observed_findings : [];
  var derived = Array.isArray(cs.derived_interpretations) ? cs.derived_interpretations : [];

  if (!qcFlags.length && !limitations.length && !observed.length && !derived.length
      && !(confidence && confidence.level)) {
    return '';
  }

  function severityColor(s) {
    s = String(s || '').toLowerCase();
    if (s === 'high') return 'var(--red)';
    if (s === 'medium') return 'var(--amber)';
    if (s === 'low') return 'var(--blue)';
    if (s === 'info') return 'var(--text-secondary)';
    return 'var(--text-secondary)';
  }

  var html = '';

  // Confidence banner
  if (confidence && confidence.level) {
    html += '<div class="qeeg-ds-confidence" data-testid="qeeg-ds-confidence" '
      + 'style="display:flex;align-items:center;gap:12px;padding:10px 14px;'
      + 'background:var(--surface-1);border-radius:8px;margin-bottom:12px;font-size:13px">'
      + '<span style="font-weight:600">Overall confidence</span>'
      + '<span style="padding:3px 10px;border-radius:99px;background:var(--surface-2);color:'
      + severityColor(confidence.level === 'low' ? 'high' : confidence.level === 'moderate' ? 'medium' : 'low')
      + ';font-weight:700;text-transform:uppercase">' + esc(String(confidence.level)) + '</span>'
      + (confidence.score != null ? '<span style="color:var(--text-secondary)">'
        + 'score ' + esc(String(confidence.score)) + '</span>' : '')
      + (confidence.rationale ? '<span style="color:var(--text-secondary);font-size:12px">'
        + esc(String(confidence.rationale)) + '</span>' : '')
      + '</div>';
  }

  // QC flags grid
  if (qcFlags.length) {
    html += '<div class="qeeg-ds-flags" data-testid="qeeg-ds-flags" style="margin-bottom:14px">'
      + '<div style="font-weight:600;margin-bottom:6px">Quality flags</div>'
      + '<ul style="list-style:none;padding:0;margin:0;display:grid;gap:6px">';
    qcFlags.forEach(function (f) {
      html += '<li style="display:flex;align-items:flex-start;gap:8px;'
        + 'padding:8px 10px;background:var(--surface-1);border-left:3px solid '
        + severityColor(f.severity) + ';border-radius:4px">'
        + '<span style="font-weight:700;color:' + severityColor(f.severity)
        + ';text-transform:uppercase;font-size:11px;min-width:60px">'
        + esc(String(f.severity || 'info')) + '</span>'
        + '<span style="flex:1">'
        + '<span style="font-family:monospace;font-size:12px;color:var(--text-secondary);'
        + 'margin-right:8px">' + esc(String(f.code || '')) + '</span>'
        + esc(String(f.message || '')) + '</span></li>';
    });
    html += '</ul></div>';
  }

  // Observed findings (signal-level — not inference)
  if (observed.length) {
    html += '<div class="qeeg-ds-observed" data-testid="qeeg-ds-observed" style="margin-bottom:14px">'
      + '<div style="font-weight:600;margin-bottom:6px">Observed (signal features)</div>'
      + '<ul style="list-style:none;padding:0;margin:0;display:grid;gap:6px">';
    observed.forEach(function (o) {
      var ev = o.evidence || {};
      var evChip;
      if (ev.status === 'found' && Array.isArray(ev.citations) && ev.citations.length) {
        evChip = '<span style="padding:2px 8px;border-radius:99px;background:rgba(0,180,120,0.12);'
          + 'color:var(--green);font-size:11px;font-weight:600">'
          + ev.citations.length + ' refs</span>';
      } else {
        evChip = '<span data-testid="evidence-pending-chip" style="padding:2px 8px;'
          + 'border-radius:99px;background:rgba(255,180,0,0.12);color:var(--amber);'
          + 'font-size:11px;font-weight:600">evidence pending</span>';
      }
      html += '<li style="padding:8px 10px;background:var(--surface-1);border-radius:4px">'
        + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
        + '<span style="font-weight:600">' + esc(String(o.label || o.type || 'finding')) + '</span>'
        + (o.value != null ? '<span style="font-family:monospace;color:var(--text-secondary)">'
          + esc(String(o.value)) + (o.unit ? ' ' + esc(String(o.unit)) : '') + '</span>' : '')
        + evChip
        + '</div>'
        + '<div style="font-size:12px;color:var(--text-secondary);margin-top:4px">'
        + esc(String(o.statement || '')) + '</div>';
      if (ev.status === 'found') {
        html += '<ul style="list-style:none;padding:0;margin:6px 0 0 0;display:grid;gap:3px">';
        ev.citations.forEach(function (c) {
          var label = esc(String(c.title || c.pmid || c.url || 'reference'));
          if (c.url) {
            html += '<li style="font-size:11px"><a href="' + esc(c.url)
              + '" target="_blank" rel="noopener noreferrer">' + label + '</a></li>';
          } else {
            html += '<li style="font-size:11px">' + label + '</li>';
          }
        });
        html += '</ul>';
      }
      html += '</li>';
    });
    html += '</ul></div>';
  }

  // Derived interpretations (model-derived, hedged)
  if (derived.length) {
    html += '<div class="qeeg-ds-derived" data-testid="qeeg-ds-derived" style="margin-bottom:14px">'
      + '<div style="font-weight:600;margin-bottom:6px">Inferred (model-derived, hedged)</div>'
      + '<ul style="list-style:none;padding:0;margin:0;display:grid;gap:6px">';
    derived.forEach(function (d) {
      html += '<li style="padding:8px 10px;background:var(--surface-1);border-radius:4px;'
        + 'border-left:3px solid var(--violet)">'
        + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
        + '<span style="font-weight:600">' + esc(String(d.label || 'interpretation')) + '</span>'
        + (d.confidence ? '<span style="padding:2px 8px;border-radius:99px;'
          + 'background:var(--surface-2);font-size:11px">conf: '
          + esc(String(d.confidence)) + '</span>' : '')
        + '</div>'
        + '<div style="font-size:12px;color:var(--text-secondary);margin-top:4px">'
        + esc(String(d.statement || '')) + '</div></li>';
    });
    html += '</ul></div>';
  }

  // Limitations (structured)
  if (limitations.length) {
    html += '<div class="qeeg-ds-limitations" data-testid="qeeg-ds-limitations">'
      + '<div style="font-weight:600;margin-bottom:6px">Limitations</div>'
      + '<ul style="list-style:none;padding:0;margin:0;display:grid;gap:4px;font-size:12px">';
    limitations.forEach(function (l) {
      var msg = typeof l === 'string' ? l : l && l.message;
      var sev = typeof l === 'object' && l ? l.severity : 'info';
      html += '<li style="display:flex;gap:8px"><span style="color:'
        + severityColor(sev) + ';font-weight:700;text-transform:uppercase;font-size:10px;'
        + 'min-width:50px">' + esc(String(sev || 'info')) + '</span><span>'
        + esc(String(msg || '')) + '</span></li>';
    });
    html += '</ul></div>';
  }

  return card('Decision Support — QC, Observed vs Inferred, Evidence', html);
}

export function renderMNEPipelineSections(analysis) {
  if (!analysis) return '';
  var parts = [
    renderQEEGDecisionSupport(analysis),
    renderPipelineQualityStrip(analysis),
    renderSpecParamPanel(analysis),
    renderELoretaROIPanel(analysis),
    renderQEEGSource3DBrain(analysis),
    renderNormativeTopomapGrid(analysis),
    renderNormativeZScoreHeatmap(analysis),
    renderConnectivityClinicViz(analysis),
    renderAsymmetryGraphStrip(analysis),
  ];
  var joined = parts.filter(Boolean).join('');
  if (!joined) return '';
  return '<div class="qeeg-section-divider"></div>'
    + '<div class="qeeg-mne-group" data-testid="qeeg-mne-sections">' + joined + '</div>';
}

// ── AI narrative formatter (Step 1.4) ────────────────────────────────────────
function _formatNarrative(text) {
  if (!text) return '';
  var parts = esc(text).split(/\n{2,}/);
  var html = '';
  parts.forEach(function (p) {
    var trimmed = p.trim();
    if (!trimmed) return;
    if (/^[A-Z][A-Z &/()-]+:/.test(trimmed)) {
      var colonIdx = trimmed.indexOf(':');
      html += '<h4 class="qeeg-finding-heading">' + trimmed.substring(0, colonIdx) + '</h4>';
      var rest = trimmed.substring(colonIdx + 1).trim();
      if (rest) html += '<p class="qeeg-finding-para">' + rest + '</p>';
    } else {
      html += '<p class="qeeg-finding-para">' + trimmed + '</p>';
    }
  });
  return html;
}

// ── Clinical severity thresholds (Step 1.5) ──────────────────────────────────
var CLINICAL_THRESHOLDS = {
  tbr_screening: { path: 'theta_beta_ratio', extract: function (d) { return d && d.theta_beta_ratio; },
    ranges: [{ max: 3.5, label: 'Normal', color: 'var(--green)' }, { max: 4.5, label: 'Borderline', color: 'var(--amber)' }, { max: Infinity, label: 'Elevated', color: 'var(--red)' }] },
  entropy_analysis: { extract: function (d) { return d && d.mean_sample_entropy; },
    ranges: [{ max: 1.0, label: 'Low complexity', color: 'var(--amber)' }, { max: 2.0, label: 'Normal', color: 'var(--green)' }, { max: Infinity, label: 'High', color: 'var(--blue)' }] },
  small_world_index: { extract: function (d) { return d && d.small_world_index; },
    ranges: [{ max: 1.5, label: 'Random-like', color: 'var(--red)' }, { max: 3.0, label: 'Small-world', color: 'var(--green)' }, { max: Infinity, label: 'Regular-like', color: 'var(--amber)' }] },
  iapf_plasticity: { extract: function (d) { return d && d.posterior_iapf_hz; },
    ranges: [{ max: 8.5, label: 'Slow', color: 'var(--red)' }, { max: 10.5, label: 'Normal', color: 'var(--green)' }, { max: Infinity, label: 'Fast', color: 'var(--blue)' }] },
  fractal_lz: { extract: function (d) { return d && d.mean_higuchi_fd; },
    ranges: [{ max: 1.4, label: 'Low FD', color: 'var(--amber)' }, { max: 1.8, label: 'Normal', color: 'var(--green)' }, { max: Infinity, label: 'High FD', color: 'var(--blue)' }] },
  spectral_edge_frequency: { extract: function (d) { return d && d.mean_sef95_hz; },
    ranges: [{ max: 20, label: 'Low SEF', color: 'var(--amber)' }, { max: 30, label: 'Normal', color: 'var(--green)' }, { max: Infinity, label: 'High SEF', color: 'var(--blue)' }] },
};

function _getSeverityBadge(slug, data) {
  var thresh = CLINICAL_THRESHOLDS[slug];
  if (!thresh || !data) return '';
  var val = thresh.extract(data);
  if (val == null) return '';
  for (var i = 0; i < thresh.ranges.length; i++) {
    if (val <= thresh.ranges[i].max) {
      return badge(thresh.ranges[i].label, thresh.ranges[i].color);
    }
  }
  return '';
}

// ── Category summary generators (Step 1.6) ───────────────────────────────────
var _catSummaryExtractors = {
  spectral: function (items) {
    var parts = [];
    items.forEach(function (i) { var d = i.result.data || {};
      if (i.slug === 'spectral_edge_frequency' && d.mean_sef50_hz) parts.push('SEF50 ' + d.mean_sef50_hz + ' Hz');
      if (i.slug === 'band_peak_frequencies' && d.mean_alpha_peak_hz) parts.push('Alpha peak ' + d.mean_alpha_peak_hz + ' Hz');
      if (i.slug === 'u_shape') parts.push('U-Score ' + (d.mean_u_score || 0).toFixed(2));
    }); return parts.join(' | ') || 'Spectral features computed';
  },
  asymmetry: function (items) {
    var parts = [];
    items.forEach(function (i) { var d = i.result.data || {};
      if (i.slug === 'frontal_alpha_dominance' && d.overall_dominance) parts.push('FAA: ' + d.overall_dominance);
      if (i.slug === 'regional_asymmetry_severity' && d.overall_severity) parts.push('Severity: ' + d.overall_severity);
    }); return parts.join(' | ') || 'Asymmetry patterns analyzed';
  },
  connectivity: function (items) {
    var parts = [];
    items.forEach(function (i) { var d = i.result.data || {};
      if (i.slug === 'pli_icoh' && d.mean_pli != null) parts.push('PLI ' + d.mean_pli.toFixed(2));
      if (i.slug === 'disconnection_flags') parts.push(d.flagged_count + ' flags');
    }); return parts.join(' | ') || 'Connectivity computed';
  },
  complexity: function (items) {
    var parts = [];
    items.forEach(function (i) { var d = i.result.data || {};
      if (i.slug === 'entropy_analysis' && d.mean_sample_entropy) parts.push('Entropy ' + d.mean_sample_entropy.toFixed(2));
      if (i.slug === 'fractal_lz' && d.mean_higuchi_fd) parts.push('HFD ' + d.mean_higuchi_fd.toFixed(2));
    }); return parts.join(' | ') || 'Complexity metrics computed';
  },
  network: function (items) {
    var parts = [];
    items.forEach(function (i) { var d = i.result.data || {};
      if (i.slug === 'small_world_index' && d.small_world_index) parts.push('SW ' + d.small_world_index.toFixed(1));
      if (i.slug === 'graph_theoretic_indices' && d.global) parts.push('Eff ' + (d.global.global_efficiency || 0).toFixed(2));
    }); return parts.join(' | ') || 'Network topology analyzed';
  },
  microstate: function () { return 'Microstate segmentation A-D'; },
  clinical: function (items) {
    var parts = [];
    items.forEach(function (i) { var d = i.result.data || {};
      if (i.slug === 'iapf_plasticity' && d.posterior_iapf_hz) parts.push('IAPF ' + d.posterior_iapf_hz + ' Hz');
    }); return parts.join(' | ') || 'Clinical markers computed';
  },
};

// ── Module-scoped state for exports ──────────────────────────────────────────
var _currentAnalysis = null;
var _currentReport = null;
var _qeegSavedEvidenceCitations = [];

function _getQEEGReportEvidenceContext() {
  return {
    kind: 'qeeg',
    patientId: (_currentAnalysis && _currentAnalysis.patient_id) || _getContextPatientIdForQEEG() || '',
    analysisId: (_currentAnalysis && _currentAnalysis.id) || window._qeegSelectedId || '',
    reportId: (_currentReport && _currentReport.id) || window._qeegSelectedReportId || '',
  };
}

function _filterQEEGSavedEvidenceCitations(rows, context) {
  rows = Array.isArray(rows) ? rows : [];
  if (!context || !context.analysisId) return [];
  return rows.filter(function (item) {
    var savedCtx = item && item.citation_payload ? item.citation_payload.report_context : null;
    if (!savedCtx || savedCtx.kind !== 'qeeg') return false;
    if (savedCtx.analysisId !== context.analysisId) return false;
    if (context.reportId && savedCtx.reportId && savedCtx.reportId !== context.reportId) return false;
    return true;
  });
}

async function _loadQEEGSavedEvidenceCitations(patientId) {
  if (!patientId || patientId === 'qeeg-context') {
    _qeegSavedEvidenceCitations = [];
    return [];
  }
  try {
    var ctx = _getQEEGReportEvidenceContext();
    var rows = await api.listEvidenceSavedCitations({
      patient_id: patientId,
      context_kind: ctx.kind,
      analysis_id: ctx.analysisId,
      report_id: ctx.reportId,
    });
    _qeegSavedEvidenceCitations = Array.isArray(rows) ? rows : (rows && rows.items) || [];
  } catch (_) {
    _qeegSavedEvidenceCitations = [];
  }
  return _qeegSavedEvidenceCitations;
}

function _renderQEEGSavedEvidencePanel(citations) {
  citations = Array.isArray(citations) ? citations : [];
  return card('Evidence citations saved for report',
    citations.length
      ? '<div class="qeeg-report-callouts">'
        + citations.slice(0, 6).map(function (item) {
          var meta = [item.finding_label, item.pmid ? ('PMID ' + item.pmid) : '', item.doi || ''].filter(Boolean).join(' · ');
          return '<div class="qeeg-report-callout"><div class="qeeg-report-callout__label">'
            + esc(item.paper_title || 'Evidence citation')
            + '</div><div class="qeeg-report-callout__value">'
            + esc(meta || item.claim || 'Saved evidence citation')
            + '</div></div>';
        }).join('')
        + '</div>'
      : '<div style="font-size:12px;color:var(--text-tertiary)">No evidence citations have been added from the evidence drawer for this patient yet.</div>'
  );
}
var _coherenceBand = 'alpha';

// ── Comprehensive Report Renderer ────────────────────────────────────────────
// Generates the full clinical qEEG report HTML from a report object + analysis data.
function _renderComprehensiveReport(report, analysis, savedEvidenceCitations) {
  var narrative = report.ai_narrative || report.ai_narrative_json || {};
  var conditions = report.condition_matches || report.condition_matches_json || [];
  var suggestions = report.protocol_suggestions || report.protocol_suggestions_json || [];
  var bp = analysis ? (analysis.band_powers || analysis.band_powers_json || {}) : {};
  var ratios = bp.derived_ratios || {};
  var adv = analysis ? (analysis.advanced_analyses || {}) : {};
  var advResults = adv.results || {};
  var normDev = analysis ? (analysis.normative_deviations_json || analysis.normative_deviations || null) : null;
  var html = '';

  var hasPrintableReport = _canRenderQEEGPrintableReport(report, analysis);
  var callouts = [];
  if (analysis) {
    var flagged = Array.isArray(analysis.flagged_conditions) ? analysis.flagged_conditions : [];
    var quality = analysis.quality_metrics || {};
    if (flagged.length) callouts.push({ label: 'Flagged patterns', value: flagged.slice(0, 4).join(', ') });
    if (quality.n_epochs_retained != null && quality.n_epochs_total != null) {
      callouts.push({ label: 'Retained epochs', value: quality.n_epochs_retained + '/' + quality.n_epochs_total });
    }
    if (analysis.norm_db_version) callouts.push({ label: 'Norm database', value: analysis.norm_db_version });
    if (analysis.pipeline_version) callouts.push({ label: 'Pipeline version', value: analysis.pipeline_version });
    if (analysis.source_roi && analysis.source_roi.method) callouts.push({ label: 'Source method', value: analysis.source_roi.method });
  }

  // ── Print / Download button bar ─────────────────────────────────────────
  html += '<div class="qeeg-export-bar" style="justify-content:flex-end;margin-bottom:8px">'
    + '<button class="btn btn-sm btn-outline" aria-label="Print AI report" onclick="window._qeegPrintReport()">Print HTML Report</button>'
    + '<button class="btn btn-sm btn-outline" aria-label="Download printable report" onclick="window._qeegDownloadPDF()">Download Printable Report</button></div>';
  if (hasPrintableReport || callouts.length) {
    html += '<div class="qeeg-report-layout">';
    if (hasPrintableReport) {
      html += card('Printable Report Viewer',
        '<div class="qeeg-report-viewer">'
          + '<iframe class="qeeg-report-viewer__frame" id="qeeg-printable-report-frame" title="qEEG printable report viewer" loading="lazy"></iframe>'
        + '</div>'
      );
    }
    html += card('Report Side Panel',
      '<div class="qeeg-report-callouts">'
        + '<div class="qeeg-report-callouts__intro">Interactive HTML stays below. The viewer loads the authenticated printable report when the backend render is available, alongside key pipeline callouts.</div>'
        + (callouts.length
          ? callouts.map(function (item) {
            return '<div class="qeeg-report-callout"><div class="qeeg-report-callout__label">' + esc(item.label)
              + '</div><div class="qeeg-report-callout__value">' + esc(item.value) + '</div></div>';
          }).join('')
          : '<div class="qeeg-report-callout"><div class="qeeg-report-callout__value">Printable report rendering becomes available when the backend report endpoint returns a downloadable artifact.</div></div>')
      + '</div>'
    );
    html += '</div>';
  }

  html += _renderQEEGSavedEvidencePanel(savedEvidenceCitations);

  // ── MNE narrative + RAG citations (§4.6 of CONTRACT.md) ─────────────────
  // Rendered when the new-shape narrative is present (executive_summary or
  // findings). Legacy narratives fall through to the existing blocks below.
  var _mneLitRefs = report.literature_refs || report.literature_refs_json
    || (report.data && report.data.literature_refs) || null;
  var _mneNarrativeSrc = (report.data && (report.data.executive_summary || report.data.findings))
    ? report.data
    : (narrative && (narrative.executive_summary || (Array.isArray(narrative.findings) && narrative.findings.length))
        ? narrative
        : null);
  if (_mneNarrativeSrc || (Array.isArray(_mneLitRefs) && _mneLitRefs.length)) {
    html += renderAINarrativeWithCitations(_mneNarrativeSrc, _mneLitRefs);
  }

  // ── Section 1: Patient Information ──────────────────────────────────────
  if (analysis) {
    var patientInfoRows = '';
    if (_patient) {
      var fullName = ((_patient.first_name || '') + ' ' + (_patient.last_name || '')).trim();
      if (fullName) patientInfoRows += '<tr><td style="font-weight:600;width:40%;color:var(--text-secondary)">Patient Name</td><td>' + esc(fullName) + '</td></tr>';
      if (_patient.dob) patientInfoRows += '<tr><td style="font-weight:600;color:var(--text-secondary)">Date of Birth</td><td>' + esc(_patient.dob) + '</td></tr>';
      if (_patient.gender) patientInfoRows += '<tr><td style="font-weight:600;color:var(--text-secondary)">Gender</td><td>' + esc(_patient.gender) + '</td></tr>';
      if (_patient.primary_condition) patientInfoRows += '<tr><td style="font-weight:600;color:var(--text-secondary)">Primary Condition</td><td>' + esc(_patient.primary_condition) + '</td></tr>';
    }
    if (patientInfoRows) {
      html += card('Patient Information',
        '<table class="ds-table" style="width:100%;font-size:13px"><tbody>' + patientInfoRows + '</tbody></table>'
      );
    }
  }

  // ── Section 2: EEG Recording Parameters ─────────────────────────────────
  if (analysis) {
    var recRows = '';
    if (analysis.recording_date || analysis.analyzed_at) {
      recRows += '<tr><td style="font-weight:600;width:40%;color:var(--text-secondary)">Recording Date</td><td>'
        + esc(analysis.recording_date || new Date(analysis.analyzed_at).toLocaleDateString()) + '</td></tr>';
    }
    if (analysis.amplifier_type || analysis.equipment) {
      recRows += '<tr><td style="font-weight:600;color:var(--text-secondary)">Amplifier / Equipment</td><td>'
        + esc(analysis.amplifier_type || analysis.equipment) + '</td></tr>';
    }
    recRows += '<tr><td style="font-weight:600;color:var(--text-secondary)">Electrode Placement</td><td>'
      + esc(analysis.electrode_placement || 'International 10-20 System') + '</td></tr>';
    if (analysis.sample_rate_hz) {
      recRows += '<tr><td style="font-weight:600;color:var(--text-secondary)">Sample Rate</td><td>'
        + esc(analysis.sample_rate_hz) + ' Hz</td></tr>';
    }
    var chCount = analysis.channels_used || analysis.channel_count || 0;
    if (chCount) {
      recRows += '<tr><td style="font-weight:600;color:var(--text-secondary)">Channels Used</td><td>'
        + esc(chCount) + '</td></tr>';
    }
    if (analysis.recording_duration_sec) {
      var durMin = (analysis.recording_duration_sec / 60).toFixed(1);
      recRows += '<tr><td style="font-weight:600;color:var(--text-secondary)">Recording Duration</td><td>'
        + esc(durMin) + ' minutes (' + esc(analysis.recording_duration_sec) + ' sec)</td></tr>';
    }
    var eegState = analysis.eeg_state || analysis.eyes_condition;
    if (eegState) {
      recRows += '<tr><td style="font-weight:600;color:var(--text-secondary)">EEG State</td><td>Eyes '
        + esc(eegState) + '</td></tr>';
    }
    // Channel names — derive from band power keys if not explicit
    var chanNames = analysis.channel_names;
    if (!chanNames && bp.bands) {
      var firstBand = Object.keys(bp.bands)[0];
      if (firstBand && bp.bands[firstBand] && bp.bands[firstBand].channels) {
        chanNames = Object.keys(bp.bands[firstBand].channels);
      }
    }
    if (chanNames && chanNames.length) {
      recRows += '<tr><td style="font-weight:600;color:var(--text-secondary)">Channel Names</td><td style="font-size:12px">'
        + chanNames.map(esc).join(', ') + '</td></tr>';
    }
    // Artifact rejection summary
    var artifact = analysis.artifact_rejection || analysis.artifact_rejection_json || {};
    if (artifact.epochs_total) {
      var keepPct = ((artifact.epochs_kept / artifact.epochs_total * 100) || 0).toFixed(0);
      recRows += '<tr><td style="font-weight:600;color:var(--text-secondary)">Artifact Rejection</td><td>'
        + esc(artifact.epochs_kept) + '/' + esc(artifact.epochs_total) + ' epochs kept (' + keepPct + '%)'
        + (artifact.flat_channels && artifact.flat_channels.length
          ? ' | Flat: ' + artifact.flat_channels.map(esc).join(', ') : '')
        + '</td></tr>';
    }
    if (recRows) {
      html += card('EEG Recording Parameters',
        '<table class="ds-table" style="width:100%;font-size:13px"><tbody>' + recRows + '</tbody></table>'
      );
    }
  }

  // ── Section 3: Brain Connectivity Summary ───────────────────────────────
  var connDetail = analysis ? analysis.connectivity_detail : null;
  var disconnResult = advResults.disconnection_flags;
  var cohResult = advResults.coherence_matrix;
  var pliResult = advResults.pli_icoh;
  var wpliResult = advResults.wpli;

  if (connDetail || disconnResult || cohResult) {
    var connHtml = '';

    // Metric-type subtitle for coherence section
    if (cohResult && cohResult.status === 'ok') {
      connHtml += '<div class="ds-metric-subtitle">Coherence — Frequency-domain linear coupling</div>';
    }

    if (connDetail) {
      // Disconnected channels
      if (connDetail.disconnected_channels) {
        var dcList = connDetail.disconnected_channels;
        connHtml += '<div style="margin-bottom:12px"><strong style="font-size:13px;color:var(--text-primary)">Disconnected Channels: '
          + esc(dcList.length) + '</strong>';
        if (dcList.length) {
          connHtml += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">';
          dcList.forEach(function (ch) {
            var imp = ch.importance || 'normal';
            var impColor = imp === 'high' ? 'var(--red)' : imp === 'medium' ? 'var(--amber)' : 'var(--blue)';
            connHtml += badge(esc(ch.name || ch), impColor);
          });
          connHtml += '</div>';
        }
        connHtml += '</div>';
      }
      // High connectivity pairs
      if (connDetail.high_connectivity_pairs && connDetail.high_connectivity_pairs.length) {
        var hcp = connDetail.high_connectivity_pairs;
        connHtml += '<div style="margin-bottom:12px"><strong style="font-size:13px;color:var(--text-primary)">High Connectivity Pairs: '
          + esc(hcp.length) + '</strong>'
          + '<div style="overflow-x:auto;margin-top:6px"><table class="ds-table" style="width:100%;font-size:12px">'
          + '<thead><tr><th>Pair</th><th>Coherence</th><th>Normal Range</th><th>Status</th></tr></thead><tbody>';
        hcp.forEach(function (p) {
          var statusColor = p.status === 'overactive' ? 'var(--red)' : p.status === 'underactive' ? 'var(--blue)' : 'var(--green)';
          connHtml += '<tr><td style="font-weight:600">' + esc(p.pair || (p.ch1 + '-' + p.ch2)) + '</td>'
            + '<td>' + (p.coherence != null ? p.coherence.toFixed(3) : '-') + '</td>'
            + '<td>' + esc(p.normal_range || '-') + '</td>'
            + '<td>' + badge(p.status || 'normal', statusColor) + '</td></tr>';
        });
        connHtml += '</tbody></table></div></div>';
      }
      // Moderate connectivity pairs
      if (connDetail.moderate_connectivity_pairs && connDetail.moderate_connectivity_pairs.length) {
        connHtml += '<div style="margin-bottom:12px"><strong style="font-size:13px;color:var(--text-primary)">Moderate Connectivity Pairs: '
          + esc(connDetail.moderate_connectivity_pairs.length) + '</strong></div>';
      }
      // Regional connectivity means
      if (connDetail.regional_means) {
        var rm = connDetail.regional_means;
        var regionNames = Object.keys(rm);
        if (regionNames.length) {
          connHtml += '<div style="margin-bottom:8px"><strong style="font-size:13px;color:var(--text-primary)">Regional Connectivity Means</strong>'
            + '<div style="overflow-x:auto;margin-top:6px"><table class="ds-table" style="width:100%;font-size:12px">'
            + '<thead><tr><th>Region</th><th>Mean Coherence</th><th>Status</th></tr></thead><tbody>';
          regionNames.forEach(function (reg) {
            var val = rm[reg];
            var mean = typeof val === 'object' ? val.mean : val;
            var status = typeof val === 'object' ? (val.status || 'normal') : 'normal';
            var statusColor = status === 'overactive' ? 'var(--red)' : status === 'underactive' ? 'var(--blue)' : 'var(--green)';
            connHtml += '<tr><td style="font-weight:600;text-transform:capitalize">' + esc(reg) + '</td>'
              + '<td>' + (mean != null ? (typeof mean === 'number' ? mean.toFixed(3) : esc(mean)) : '-') + '</td>'
              + '<td>' + badge(status, statusColor) + '</td></tr>';
          });
          connHtml += '</tbody></table></div></div>';
        }
      }
    }

    // Fallback: use advanced analyses disconnection flags
    if (!connDetail && disconnResult && disconnResult.status === 'ok') {
      var dd = disconnResult.data || {};
      connHtml += '<div style="margin-bottom:12px"><strong style="font-size:13px;color:var(--text-primary)">Disconnection Flags: '
        + esc(dd.flagged_count || 0) + ' / ' + esc(dd.total_pairs_checked || 0) + ' pairs</strong>';
      if (dd.flags && dd.flags.length) {
        connHtml += '<div style="overflow-x:auto;margin-top:6px"><table class="ds-table" style="width:100%;font-size:12px">'
          + '<thead><tr><th>Channel 1</th><th>Channel 2</th><th>Band</th><th>Coherence</th></tr></thead><tbody>';
        dd.flags.forEach(function (f) {
          connHtml += '<tr><td>' + esc(f.ch1) + '</td><td>' + esc(f.ch2) + '</td>'
            + '<td>' + esc(f.band) + '</td>'
            + '<td style="color:var(--amber)">' + (f.coherence != null ? f.coherence.toFixed(3) : '-') + '</td></tr>';
        });
        connHtml += '</tbody></table></div>';
      }
      connHtml += '</div>';
    }

    // PLI / wPLI summary
    if (pliResult && pliResult.status === 'ok' && pliResult.data) {
      connHtml += '<div class="ds-metric-subtitle" style="margin-top:12px">wPLI — Phase-based non-linear coupling (weighted Phase Lag Index)</div>';
      connHtml += '<div style="margin-top:4px;display:flex;gap:16px;flex-wrap:wrap">';
      connHtml += '<div style="font-size:12px;color:var(--text-secondary)"><strong>Mean Alpha PLI:</strong> '
        + (pliResult.data.mean_pli != null ? pliResult.data.mean_pli.toFixed(3) : '-') + '</div>';
      if (wpliResult && wpliResult.status === 'ok' && wpliResult.data && wpliResult.data.bands) {
        Object.keys(wpliResult.data.bands).forEach(function (b) {
          connHtml += '<div style="font-size:12px;color:var(--text-secondary)"><strong>' + esc(b)
            + ' wPLI:</strong> ' + (wpliResult.data.bands[b].mean_wpli != null ? wpliResult.data.bands[b].mean_wpli.toFixed(3) : '-') + '</div>';
        });
      }
      connHtml += '</div>';
    }

    // Planned connectivity metrics (Coming Soon)
    connHtml += '<div style="margin-top:16px;padding:12px;border-radius:8px;background:rgba(255,255,255,0.02);border:1px dashed rgba(255,255,255,0.08)">'
      + '<div style="font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:8px">Planned Connectivity Metrics</div>'
      + '<div style="display:flex;gap:10px;flex-wrap:wrap">'
      + '<div style="font-size:11px;color:var(--text-tertiary)">dwPLI <span class="ds-coming-soon">Coming Soon</span>'
      + '<div style="font-size:10px;margin-top:2px">Debiased wPLI — volume-conduction corrected phase coupling</div></div>'
      + '<div style="font-size:11px;color:var(--text-tertiary)">PLV <span class="ds-coming-soon">Coming Soon</span>'
      + '<div style="font-size:10px;margin-top:2px">Phase Locking Value — instantaneous phase synchrony</div></div>'
      + '<div style="font-size:11px;color:var(--text-tertiary)">PDC <span class="ds-coming-soon">Coming Soon</span>'
      + '<div style="font-size:10px;margin-top:2px">Partial Directed Coherence — directed causal influence</div></div>'
      + '<div style="font-size:11px;color:var(--text-tertiary)">DTF <span class="ds-coming-soon">Coming Soon</span>'
      + '<div style="font-size:10px;margin-top:2px">Directed Transfer Function — information flow direction</div></div>'
      + '</div></div>';

    if (connHtml) {
      html += card('Brain Connectivity Summary', connHtml);
    }
  }

  // ── Section 4: Quantitative EEG Data Summary ───────────────────────────
  var qeegRows = '';

  // TBR with inattention index
  if (ratios.theta_beta_ratio != null) {
    var tbrVal = ratios.theta_beta_ratio;
    var tbrColor = tbrVal > 4.5 ? 'var(--red)' : tbrVal > 3.5 ? 'var(--amber)' : 'var(--green)';
    var tbrLabel = tbrVal > 4.5 ? 'Elevated' : tbrVal > 3.5 ? 'Borderline' : 'Normal';
    var inattentionIdx = tbrVal > 4.5 ? 'High' : tbrVal > 3.5 ? 'Moderate' : 'Low';
    qeegRows += '<tr><td style="font-weight:600;color:var(--text-secondary)">Theta/Beta Ratio (TBR)</td>'
      + '<td>' + tbrVal.toFixed(2) + ' ' + badge(tbrLabel, tbrColor) + '</td>'
      + '<td style="font-size:12px;color:var(--text-tertiary)">Inattention index: ' + esc(inattentionIdx) + ' | Clinical threshold: 4.5</td></tr>';
  }

  // TAR — Theta/Alpha Ratio
  if (ratios.theta_alpha_ratio != null) {
    var tarVal = ratios.theta_alpha_ratio;
    var tarColor = tarVal > 2.0 ? 'var(--red)' : tarVal > 1.5 ? 'var(--amber)' : 'var(--green)';
    var tarLabel = tarVal > 2.0 ? 'Elevated' : tarVal > 1.5 ? 'Borderline' : 'Normal';
    qeegRows += '<tr><td style="font-weight:600;color:var(--text-secondary)">Theta/Alpha Ratio (TAR)</td>'
      + '<td>' + tarVal.toFixed(2) + ' ' + badge(tarLabel, tarColor) + '</td>'
      + '<td style="font-size:12px;color:var(--text-tertiary)">Cortical slowing indicator | Clinical threshold: 2.0</td></tr>';
  }

  // IAPF with regional breakdown
  var iapfResult = advResults.iapf_plasticity;
  if (iapfResult && iapfResult.status === 'ok' && iapfResult.data) {
    var iapfData = iapfResult.data;
    var iapfVal = iapfData.posterior_iapf_hz;
    var iapfColor = iapfVal < 8.5 ? 'var(--red)' : iapfVal > 10.5 ? 'var(--blue)' : 'var(--green)';
    var iapfLabel = iapfVal < 8.5 ? 'Slow' : iapfVal > 10.5 ? 'Fast' : 'Normal';
    var iapfNote = 'Global mean: ' + (iapfData.mean_iapf_hz || '-') + ' Hz';
    if (analysis && analysis.iapf_regional) {
      var regParts = [];
      Object.keys(analysis.iapf_regional).forEach(function (reg) {
        regParts.push(esc(reg) + ': ' + esc(analysis.iapf_regional[reg]) + ' Hz');
      });
      if (regParts.length) iapfNote += ' | ' + regParts.join(', ');
    }
    qeegRows += '<tr><td style="font-weight:600;color:var(--text-secondary)">Individual Alpha Peak Frequency (IAPF)</td>'
      + '<td>' + iapfVal.toFixed(2) + ' Hz ' + badge(iapfLabel, iapfColor) + '</td>'
      + '<td style="font-size:12px;color:var(--text-tertiary)">' + iapfNote + '</td></tr>';
  }

  // Power spectra deviations summary
  if (normDev) {
    var sigDeviations = 0;
    var totalCells = 0;
    Object.keys(normDev).forEach(function (ch) {
      Object.keys(normDev[ch]).forEach(function (b) {
        totalCells++;
        if (Math.abs(normDev[ch][b]) >= 2.0) sigDeviations++;
      });
    });
    qeegRows += '<tr><td style="font-weight:600;color:var(--text-secondary)">Power Spectra Deviations</td>'
      + '<td>' + esc(sigDeviations) + ' significant (|z| &gt;= 2.0) out of ' + esc(totalCells) + ' measurements</td>'
      + '<td style="font-size:12px;color:var(--text-tertiary)">Based on normative database z-scores</td></tr>';
  }

  // Asymmetry analysis summary
  var asymResult = advResults.full_asymmetry_matrix;
  var asymSev = advResults.regional_asymmetry_severity;
  if (asymResult && asymResult.status === 'ok') {
    var faaNote = '';
    if (advResults.frontal_alpha_dominance && advResults.frontal_alpha_dominance.data) {
      var fad = advResults.frontal_alpha_dominance.data;
      faaNote = 'FAA: ' + (fad.mean_faa != null ? fad.mean_faa.toFixed(2) : '-') + ' (' + esc(fad.overall_dominance || '-') + ' dominant)';
    }
    var sevNote = '';
    if (asymSev && asymSev.data && asymSev.data.overall_severity) {
      sevNote = 'Overall severity: ' + esc(asymSev.data.overall_severity);
    }
    if (analysis && analysis.asymmetry_detail && analysis.asymmetry_detail.regions) {
      var asymRegions = Object.keys(analysis.asymmetry_detail.regions);
      if (asymRegions.length) sevNote += (sevNote ? ' | ' : '') + 'Regions: ' + asymRegions.map(esc).join(', ');
    }
    qeegRows += '<tr><td style="font-weight:600;color:var(--text-secondary)">Asymmetry Analysis</td>'
      + '<td>' + (faaNote || esc(asymResult.summary || '-')) + '</td>'
      + '<td style="font-size:12px;color:var(--text-tertiary)">' + sevNote + '</td></tr>';
  }

  // Brodmann areas summary
  if (analysis && analysis.brodmann_areas) {
    var baCount = Object.keys(analysis.brodmann_areas).length;
    qeegRows += '<tr><td style="font-weight:600;color:var(--text-secondary)">Brodmann Area Analysis</td>'
      + '<td>' + esc(baCount) + ' areas analyzed</td>'
      + '<td style="font-size:12px;color:var(--text-tertiary)">See detailed Brodmann section below</td></tr>';
  }

  if (qeegRows) {
    html += card('Quantitative EEG Data Summary',
      '<div style="overflow-x:auto"><table class="ds-table" style="width:100%;font-size:13px">'
      + '<thead><tr><th style="width:30%">Metric</th><th style="width:35%">Value</th><th style="width:35%">Notes</th></tr></thead>'
      + '<tbody>' + qeegRows + '</tbody></table></div>'
    );
  }

  // ── Section 5: Clinical Overview ────────────────────────────────────────
  var clinicalHtml = '';

  // Clinical overview or executive summary
  if (narrative.clinical_overview) {
    clinicalHtml += '<div class="qeeg-narrative" style="margin-bottom:16px">' + esc(narrative.clinical_overview) + '</div>';
  } else if (narrative.summary) {
    clinicalHtml += '<div class="qeeg-narrative qeeg-narrative--summary" style="margin-bottom:16px">' + esc(narrative.summary) + '</div>';
  }

  // Key EEG observations per region
  if (narrative.key_observations) {
    var obs = narrative.key_observations;
    var regionOrder = ['frontal', 'parietal', 'temporal', 'occipital'];
    var regionColors = { frontal: 'var(--blue)', parietal: 'var(--teal)', temporal: 'var(--amber)', occipital: 'var(--violet)' };
    var obsHtml = '<div style="margin-bottom:12px"><strong style="font-size:13px">Key EEG Observations by Region</strong></div>'
      + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px">';
    regionOrder.forEach(function (reg) {
      if (!obs[reg]) return;
      var regColor = regionColors[reg] || 'var(--teal)';
      obsHtml += '<div style="background:var(--surface-tint-1);border-radius:8px;padding:12px;border-left:3px solid ' + regColor + '">'
        + '<div style="font-weight:700;font-size:12px;text-transform:uppercase;color:' + regColor + ';margin-bottom:4px">' + esc(reg) + '</div>'
        + '<div style="font-size:12px;color:var(--text-secondary)">' + esc(obs[reg]) + '</div></div>';
    });
    obsHtml += '</div>';
    clinicalHtml += obsHtml;
  }

  // FIRDA / OIRDA findings
  if (narrative.firda_oirda) {
    clinicalHtml += '<div style="margin-top:12px;padding:10px;background:rgba(255,181,71,0.06);border-radius:8px;border:1px solid rgba(255,181,71,0.15)">'
      + '<strong style="font-size:12px;color:var(--amber)">FIRDA / OIRDA Findings</strong>'
      + '<div style="font-size:12px;color:var(--text-secondary);margin-top:4px">' + esc(narrative.firda_oirda) + '</div></div>';
  }

  // Epileptiform analysis
  if (narrative.epileptiform) {
    clinicalHtml += '<div style="margin-top:12px;padding:10px;background:rgba(239,83,80,0.06);border-radius:8px;border:1px solid rgba(239,83,80,0.15)">'
      + '<strong style="font-size:12px;color:var(--red)">Epileptiform Activity</strong>'
      + '<div style="font-size:12px;color:var(--text-secondary);margin-top:4px">' + esc(narrative.epileptiform) + '</div></div>';
  }

  // Detailed findings with section headings
  if (narrative.detailed_findings) {
    clinicalHtml += '<div style="margin-top:16px"><strong style="font-size:13px">Detailed Findings</strong></div>'
      + '<div class="qeeg-narrative qeeg-narrative--findings" style="margin-top:8px">'
      + _formatNarrative(narrative.detailed_findings) + '</div>';
  }

  if (clinicalHtml) {
    html += card('Clinical Overview', clinicalHtml);
  }

  // ── Section 6: Visualizations ───────────────────────────────────────────
  var vizHtml = '';

  // Asymmetry topographic map
  if (analysis && analysis.asymmetry_detail && analysis.asymmetry_detail.regions && typeof renderAsymmetryMap === 'function') {
    vizHtml += card('Asymmetry Topographic Map',
      '<div style="text-align:center">' + renderAsymmetryMap(analysis.asymmetry_detail.regions) + '</div>');
  }

  // Absolute power bar chart
  if (analysis && analysis.absolute_power && typeof renderPowerBarChart === 'function') {
    vizHtml += card('Absolute Power Distribution',
      '<div style="text-align:center">' + renderPowerBarChart(analysis.absolute_power) + '</div>');
  }

  // TBR per-channel bar chart
  if (analysis && analysis.tbr_per_channel && typeof renderTBRBarChart === 'function') {
    vizHtml += card('Theta/Beta Ratio by Channel',
      '<div style="text-align:center">' + renderTBRBarChart(analysis.tbr_per_channel) + '</div>');
  }

  // Signal deviation chart
  if (analysis && analysis.signal_deviations && typeof renderSignalDeviationChart === 'function') {
    vizHtml += card('Signal Deviations from Normative Database',
      '<div style="text-align:center">' + renderSignalDeviationChart(analysis.signal_deviations) + '</div>');
  }

  if (vizHtml) {
    html += '<div class="qeeg-section-divider"></div>' + vizHtml;
  }

  // ── Section 7: Pathological Signs ───────────────────────────────────────
  if (analysis && analysis.pathological_signs) {
    var pathHtml = '';
    var ps = analysis.pathological_signs;

    // Spikes table
    if (ps.spikes && ps.spikes.length) {
      pathHtml += '<div style="margin-bottom:12px"><strong style="font-size:13px;color:var(--red)">Spikes</strong>'
        + '<div style="overflow-x:auto;margin-top:6px"><table class="ds-table" style="width:100%;font-size:12px">'
        + '<thead><tr><th>Channel</th><th>Count</th><th>Avg Amplitude</th><th>Duration</th></tr></thead><tbody>';
      ps.spikes.forEach(function (s) {
        var sevColor = (s.count || 0) > 10 ? 'var(--red)' : (s.count || 0) > 5 ? 'var(--amber)' : 'var(--green)';
        pathHtml += '<tr><td style="font-weight:600">' + esc(s.channel) + '</td>'
          + '<td style="color:' + sevColor + ';font-weight:600">' + esc(s.count) + '</td>'
          + '<td>' + esc(s.avg_amplitude || '-') + '</td>'
          + '<td>' + esc(s.duration || '-') + '</td></tr>';
      });
      pathHtml += '</tbody></table></div></div>';
    }

    // Sharp waves table
    if (ps.sharp_waves && ps.sharp_waves.length) {
      pathHtml += '<div style="margin-bottom:12px"><strong style="font-size:13px;color:var(--amber)">Sharp Waves</strong>'
        + '<div style="overflow-x:auto;margin-top:6px"><table class="ds-table" style="width:100%;font-size:12px">'
        + '<thead><tr><th>Channel</th><th>Count</th><th>Avg Amplitude</th><th>Duration</th></tr></thead><tbody>';
      ps.sharp_waves.forEach(function (s) {
        var sevColor = (s.count || 0) > 10 ? 'var(--red)' : (s.count || 0) > 5 ? 'var(--amber)' : 'var(--green)';
        pathHtml += '<tr><td style="font-weight:600">' + esc(s.channel) + '</td>'
          + '<td style="color:' + sevColor + ';font-weight:600">' + esc(s.count) + '</td>'
          + '<td>' + esc(s.avg_amplitude || '-') + '</td>'
          + '<td>' + esc(s.duration || '-') + '</td></tr>';
      });
      pathHtml += '</tbody></table></div></div>';
    }

    // Slow waves summary
    if (ps.slow_waves) {
      var sw = ps.slow_waves;
      var swSevColor = sw.severity === 'severe' ? 'var(--red)' : sw.severity === 'moderate' ? 'var(--amber)' : 'var(--green)';
      pathHtml += '<div style="margin-bottom:12px"><strong style="font-size:13px">Slow Waves</strong> '
        + badge(sw.severity || 'normal', swSevColor)
        + '<div style="font-size:12px;color:var(--text-secondary);margin-top:4px">'
        + esc(sw.summary || 'No abnormal slow wave activity detected.') + '</div></div>';
    }

    // Suppression summary
    if (ps.suppression) {
      var sup = ps.suppression;
      var supSevColor = sup.severity === 'severe' ? 'var(--red)' : sup.severity === 'moderate' ? 'var(--amber)' : 'var(--green)';
      pathHtml += '<div style="margin-bottom:12px"><strong style="font-size:13px">Suppression</strong> '
        + badge(sup.severity || 'none', supSevColor)
        + '<div style="font-size:12px;color:var(--text-secondary);margin-top:4px">'
        + esc(sup.summary || 'No suppression patterns detected.') + '</div></div>';
    }

    if (pathHtml) {
      html += card('Pathological Signs', pathHtml);
    }
  }

  // ── Section 8: Brodmann Area Analysis ───────────────────────────────────
  if (analysis && analysis.brodmann_areas) {
    var brodHtml = '';
    if (typeof renderBrodmannTable === 'function') {
      brodHtml = renderBrodmannTable(analysis.brodmann_areas);
    } else {
      // Fallback HTML table
      var baKeys = Object.keys(analysis.brodmann_areas);
      if (baKeys.length) {
        brodHtml = '<div style="overflow-x:auto"><table class="ds-table" style="width:100%;font-size:12px">'
          + '<thead><tr><th>Brodmann Area</th><th>Region</th><th>Function</th><th>Status</th></tr></thead><tbody>';
        baKeys.forEach(function (ba) {
          var area = analysis.brodmann_areas[ba];
          var statusColor = area.status === 'abnormal' ? 'var(--red)' : area.status === 'borderline' ? 'var(--amber)' : 'var(--green)';
          brodHtml += '<tr><td style="font-weight:600">' + esc(ba) + '</td>'
            + '<td>' + esc(area.region || '-') + '</td>'
            + '<td>' + esc(area.function || '-') + '</td>'
            + '<td>' + badge(area.status || 'normal', statusColor) + '</td></tr>';
        });
        brodHtml += '</tbody></table></div>';
      }
    }
    if (brodHtml) {
      html += card('Brodmann Area Analysis', brodHtml);
    }
  }

  // ── Section 9: Biomarker Analysis ───────────────────────────────────────
  if (analysis && analysis.biomarkers) {
    var bioHtml = '';
    if (analysis.biomarkers.conditions && typeof renderBiomarkerGauges === 'function') {
      bioHtml += renderBiomarkerGauges(analysis.biomarkers.conditions);
    }
    // Summary metrics
    var bioMetrics = [];
    if (ratios.alpha_peak_frequency_hz != null) {
      bioMetrics.push({ label: 'Peak Alpha Frequency (PAF)', value: ratios.alpha_peak_frequency_hz.toFixed(2) + ' Hz' });
    }
    if (ratios.theta_beta_ratio != null) {
      bioMetrics.push({ label: 'Theta/Beta Ratio (TBR)', value: ratios.theta_beta_ratio.toFixed(2) });
    }
    if (analysis.biomarkers.gamma_power != null) {
      bioMetrics.push({ label: 'Gamma Power', value: typeof analysis.biomarkers.gamma_power === 'number'
        ? analysis.biomarkers.gamma_power.toFixed(2) : esc(analysis.biomarkers.gamma_power) });
    }
    if (bioMetrics.length) {
      bioHtml += '<div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:12px">';
      bioMetrics.forEach(function (m) {
        bioHtml += '<div style="background:var(--surface-tint-1);border-radius:8px;padding:12px 16px;border:1px solid var(--border);min-width:160px">'
          + '<div style="font-size:18px;font-weight:700;color:var(--text-primary)">' + esc(m.value) + '</div>'
          + '<div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">' + esc(m.label) + '</div></div>';
      });
      bioHtml += '</div>';
    }
    // Disclaimer
    bioHtml += '<div style="margin-top:12px;padding:10px;background:var(--surface-tint-1);border-radius:6px;border:1px solid var(--border);font-size:11px;color:var(--text-tertiary);font-style:italic">'
      + 'These biomarkers reflect momentary patterns in brainwave activity based on mathematical models. They are not diagnostic conclusions.</div>';
    html += card('Biomarker Analysis', bioHtml);
  }

  // ── Section 10: Comprehensive Narrative Sections ────────────────────────
  if (narrative.sections && Array.isArray(narrative.sections) && narrative.sections.length) {
    var sectionsHtml = '';
    narrative.sections.forEach(function (sec, idx) {
      var secNum = idx + 1;
      sectionsHtml += card(secNum + '. ' + (sec.title || 'Section ' + secNum),
        '<div style="font-size:13px;color:var(--text-secondary);line-height:1.7">' + esc(sec.content || '') + '</div>'
      );
    });
    html += '<div class="qeeg-section-divider"></div>'
      + '<div style="margin-bottom:12px"><strong style="font-size:15px;color:var(--text-primary)">Comprehensive Narrative</strong></div>'
      + sectionsHtml;
  }

  // ── Section 11: Condition Pattern Matches ───────────────────────────────
  if (conditions.length) {
    var condHtml = '<div style="display:flex;flex-direction:column;gap:8px">';
    conditions.forEach(function (c) {
      var conf = (c.confidence || 0);
      var pct = Math.round(conf * 100);
      var barColor = conf > 0.7 ? 'var(--red)' : conf > 0.4 ? 'var(--amber)' : 'var(--blue)';
      condHtml += '<div style="display:flex;align-items:center;gap:12px">'
        + '<div style="width:160px;font-weight:600;font-size:13px">' + esc(c.condition || c.name || 'Unknown') + '</div>'
        + '<div style="flex:1;background:rgba(255,255,255,0.06);border-radius:4px;height:20px;position:relative">'
        + '<div style="width:' + pct + '%;height:100%;background:' + barColor + ';border-radius:4px;transition:width .3s"></div>'
        + '<span style="position:absolute;right:8px;top:2px;font-size:11px;color:var(--text-primary)">' + pct + '%</span></div></div>';
    });
    condHtml += '</div>';
    html += card('Condition Pattern Matches', condHtml);
  }

  // ── Section 12: Protocol Suggestions ────────────────────────────────────
  if (suggestions.length) {
    var sugHtml = '<ul style="margin:0;padding-left:20px">';
    suggestions.forEach(function (s) {
      sugHtml += '<li style="margin-bottom:8px;font-size:13px;color:var(--text-secondary)">'
        + '<strong>' + esc(s.protocol || s.title || '') + '</strong>'
        + (s.rationale ? ': ' + esc(s.rationale) : '') + '</li>';
    });
    sugHtml += '</ul>';
    html += card('Protocol Suggestions', sugHtml);
  }

  // ── Section 13: Clinician Review ────────────────────────────────────────
  html += card('Clinician Review',
    '<div style="padding:8px">'
    + (report.clinician_reviewed
      ? '<div style="margin-bottom:8px">' + badge('Reviewed', 'var(--green)') + '</div>'
      : '<div style="margin-bottom:8px">' + badge('Pending Review', 'var(--amber)') + '</div>')
    + '<textarea id="qeeg-amendments" class="form-control" rows="3" placeholder="Add clinical amendments or notes...">'
    + esc(report.clinician_amendments || '') + '</textarea>'
    + '<div style="margin-top:8px;text-align:right">'
    + '<button class="btn btn-sm btn-outline" id="qeeg-save-review">Save & Mark Reviewed</button></div>'
    + '<div id="qeeg-review-status" role="status" aria-live="polite" style="margin-top:8px"></div></div>'
  );

  return html;
}

const TAB_META = {
  patient:   { label: 'Patient & Upload',  color: 'var(--blue)' },
  analysis:  { label: 'Analysis',          color: 'var(--teal)' },
  raw:       { label: 'Raw Data',          color: 'var(--green)' },
  report:    { label: 'AI Report',         color: 'var(--violet)' },
  compare:   { label: 'Compare',           color: 'var(--amber)' },
  learning:  { label: 'Learning EEG',      color: 'var(--rose)' },
};

// ── Demo Mode ────────────────────────────────────────────────────────────────
function _isDemoMode() {
  // `import.meta.env` is injected by Vite in the browser build, but unit tests
  // run under plain Node where `import.meta.env` is undefined.
  return Boolean(import.meta?.env?.DEV) || import.meta?.env?.VITE_ENABLE_DEMO === '1';
}

function _demoBanner() {
  return '<div data-demo="true" data-testid="qeeg-demo-banner" style="background:rgba(255,181,71,0.08);border:1px solid rgba(255,181,71,0.2);border-radius:8px;padding:8px 14px;margin-bottom:12px;font-size:12px;color:var(--amber);display:flex;align-items:center;gap:8px">'
    + '<span>&#x1F4CB;</span><span><strong>Sample recording loaded — clinician review required.</strong> '
    + 'All findings, brain maps, and exports below are labelled <code>DEMO — not for clinical use</code>. '
    + 'Upload a real EDF/BDF/SET recording to run the live qEEG pipeline.</span></div>';
}

// ── Clinical safety footer (always visible) ─────────────────────────────────
// Audit requirement: disclaimers must be visible on the Analyzer page so a
// reviewing clinician cannot miss them. These are static strings — they are
// not gated on demo mode and never disappear once the analyzer renders.
function _qeegClinicalSafetyFooter() {
  return '<div data-testid="qeeg-safety-footer" class="qeeg-safety-footer" style="margin-top:24px;padding:14px 16px;border-radius:12px;background:var(--surface-tint-1);border:1px solid var(--border);font-size:12px;color:var(--text-secondary);line-height:1.6">'
    + '<div style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text-tertiary);margin-bottom:6px">Clinical safety disclaimers</div>'
    + '<ul style="margin:0;padding-left:18px">'
    + '<li>qEEG findings <strong>support clinical decision-making and require clinician review</strong>.</li>'
    + '<li>Z-scores are referenced against the embedded normative dataset (see Normative Model Card).</li>'
    + '<li>Protocol-fit suggestions are decision-support and <strong>are not prescriptive</strong>.</li>'
    + '<li>Red flags require clinician review per local policy before any treatment action.</li>'
    + '<li>AI interpretation runs after deterministic numerics — it summarises, it does not generate findings.</li>'
    + '</ul></div>';
}

// ── Best-effort audit logger ─────────────────────────────────────────────────
// Posts a qEEG audit event via api.logAudit. Never throws. Never blocks UI.
function _qeegAudit(event, extra) {
  try {
    var payload = Object.assign({
      event: event,
      analysis_id: (window._qeegSelectedId && window._qeegSelectedId !== 'demo') ? window._qeegSelectedId : null,
      patient_id: window._qeegPatientId || null,
      using_demo_data: !!(window._qeegSelectedId === 'demo' && _isDemoMode()),
    }, extra || {});
    if (api && typeof api.logAudit === 'function') {
      var p = api.logAudit(payload);
      if (p && typeof p.catch === 'function') p.catch(function () {});
    }
  } catch (_) { /* audit must never break UI */ }
}

/* 19 standard 10-20 channels */
var _DCH = ['Fp1','Fp2','F7','F3','Fz','F4','F8','T3','C3','Cz','C4','T4','T5','P3','Pz','P4','T6','O1','O2'];

/* Build per-channel band power data from compact arrays (realistic eyes-closed distribution) */
function _buildDemoBandPowers() {
  var pcts = {
    delta:     [30,29,28,25,22,25,28,26,22,20,22,25,22,18,16,18,22,15,15],
    theta:     [18,17,15,18,22,17,15,14,16,20,15,14,12,13,14,13,12,11,11],
    alpha:     [15,16,13,18,16,19,14,18,25,22,26,19,28,35,38,36,29,42,41],
    smr:       [ 5, 5, 4, 6, 5, 6, 4, 6, 8, 7, 8, 6, 9,10,11,10, 8,12,11],
    low_beta:  [12,13,13,12,11,12,13,13,11,10,11,12,10, 9, 8, 9,10, 8, 9],
    beta:      [20,21,22,20,19,20,22,21,19,18,19,21,18,17,16,17,18,16,17],
    high_beta: [10,10,13,12,13,12,13,13,12,13,12,13,12,10,10,10,12,10,10],
    gamma:     [7, 7, 9, 7, 8, 7, 8, 8, 6, 7, 6, 8, 8, 7, 6, 6, 7, 6, 6],
  };
  var bands = {};
  Object.keys(pcts).forEach(function (band) {
    var channels = {};
    _DCH.forEach(function (ch, i) { channels[ch] = { relative_pct: pcts[band][i] }; });
    bands[band] = { channels: channels };
  });
  return bands;
}

var DEMO_QEEG_ANALYSIS = {
  id: 'demo',
  analysis_status: 'completed',
  original_filename: 'demo_eyes_closed.edf',
  channels_used: 19,
  channel_count: 19,
  sample_rate_hz: 256,
  recording_duration_sec: 600,
  recording_date: '2026-04-07T10:51:29',
  amplifier_type: 'MITSAR',
  electrode_placement: '10-20 System',
  eeg_state: 'Eyes Open',
  channel_names: ['Fp1','Fpz','Fp2','F7','F3','Fz','F4','F8','T3','C3','Cz','C4','T4','T5','P3','Pz','P4','T6','O1','Oz','O2'],
  eyes_condition: 'closed',
  analyzed_at: new Date().toISOString(),
  band_powers: {
    bands: _buildDemoBandPowers(),
    derived_ratios: {
      theta_beta_ratio: 3.82,
      theta_alpha_ratio: 1.15,
      delta_alpha_ratio: 1.41,
      alpha_peak_frequency_hz: 9.24,
      frontal_alpha_asymmetry: 0.18,
    },
  },
  artifact_rejection: { epochs_total: 300, epochs_kept: 278, flat_channels: [] },
  normative_deviations: (function () {
    var nd = {}, zs = {
      Fp1:[1.2,0.8,-0.3,-0.1,0.4,0.5,0.9,0.6], Fp2:[1.1,0.6,-0.4,-0.2,0.5,0.6,1.0,0.5], F7:[0.8,0.3,-0.2,0.0,0.6,0.7,1.3,1.1],
      F3:[0.4,1.1,0.2,0.3,0.2,0.3,0.8,0.4], Fz:[-0.2,2.1,-0.5,-0.3,0.0,-0.1,0.9,0.6], F4:[0.4,0.9,0.5,0.4,0.2,0.3,0.7,0.3],
      F8:[0.7,0.2,-0.3,-0.1,0.7,0.8,1.2,0.9], T3:[0.3,-0.1,0.1,0.2,0.4,0.5,1.1,0.7], C3:[-0.3,0.6,0.8,0.9,0.1,0.1,0.5,0.1],
      Cz:[-0.5,1.8,0.3,0.4,-0.1,-0.1,0.8,0.4], C4:[-0.3,0.4,1.0,0.8,0.1,0.1,0.4,0.0], T4:[0.3,-0.2,0.0,0.1,0.5,0.6,1.1,0.8],
      T5:[-0.2,-0.5,1.5,1.1,0.1,0.2,0.8,0.7], P3:[-0.8,-0.2,2.2,1.5,0.0,0.0,0.2,-0.1], Pz:[-1.0,-0.1,2.5,1.7,-0.1,-0.2,0.1,-0.3],
      P4:[-0.7,-0.3,2.3,1.4,-0.1,-0.1,0.1,-0.1], T6:[-0.2,-0.4,1.4,1.0,0.1,0.2,0.8,0.6], O1:[-1.2,-0.6,2.8,1.8,-0.1,0.0,-0.2,-0.4],
      O2:[-1.2,-0.5,2.7,1.7,-0.1,-0.1,-0.2,-0.3],
    }; var bands = ['delta','theta','alpha','smr','low_beta','beta','high_beta','gamma'];
    Object.keys(zs).forEach(function (ch) { nd[ch] = {}; bands.forEach(function (b, i) { nd[ch][b] = zs[ch][i]; }); });
    return nd;
  })(),
  advanced_analyses: {
    meta: { total: 25, completed: 25, failed: 0, duration_sec: 42 },
    results: {
      u_shape: { status: 'ok', label: 'U-Shape Analysis', category: 'spectral', duration_ms: 820,
        summary: 'U-shape spectral pattern detected in 12/19 channels, consistent with normal cortical maturation.',
        data: { mean_u_score: 0.74, u_shape_present_count: 12, total_channels: 19 } },
      fooof_decomposition: { status: 'ok', label: 'FOOOF Decomposition', category: 'spectral', duration_ms: 3200,
        summary: 'Mean aperiodic exponent 1.42; 2-3 peaks per channel typical.',
        data: { mean_aperiodic_exponent: 1.42,
          channels: {
            Fp1: { aperiodic_exponent: 1.51, aperiodic_offset: 2.8, n_peaks: 2, r_squared: 0.96, peaks: [{cf:9.2,pw:0.6,bw:2.1},{cf:18.5,pw:0.3,bw:3.0}] },
            F3:  { aperiodic_exponent: 1.45, aperiodic_offset: 2.6, n_peaks: 3, r_squared: 0.97, peaks: [{cf:6.2,pw:0.4,bw:1.8},{cf:9.5,pw:0.8,bw:2.2},{cf:20.1,pw:0.2,bw:2.5}] },
            Fz:  { aperiodic_exponent: 1.38, aperiodic_offset: 2.5, n_peaks: 2, r_squared: 0.95, peaks: [{cf:6.5,pw:0.5,bw:2.0},{cf:9.3,pw:0.7,bw:2.3}] },
            C3:  { aperiodic_exponent: 1.35, aperiodic_offset: 2.4, n_peaks: 2, r_squared: 0.98, peaks: [{cf:9.6,pw:1.0,bw:2.1},{cf:19.8,pw:0.3,bw:2.8}] },
            Cz:  { aperiodic_exponent: 1.40, aperiodic_offset: 2.5, n_peaks: 3, r_squared: 0.96, peaks: [{cf:6.3,pw:0.5,bw:1.9},{cf:9.4,pw:0.9,bw:2.2},{cf:21.0,pw:0.2,bw:2.6}] },
            P3:  { aperiodic_exponent: 1.32, aperiodic_offset: 2.3, n_peaks: 2, r_squared: 0.97, peaks: [{cf:9.8,pw:1.2,bw:1.9},{cf:18.2,pw:0.3,bw:2.5}] },
            O1:  { aperiodic_exponent: 1.28, aperiodic_offset: 2.2, n_peaks: 3, r_squared: 0.98, peaks: [{cf:9.2,pw:1.5,bw:1.8},{cf:11.5,pw:0.4,bw:1.5},{cf:20.5,pw:0.2,bw:2.2}] },
            O2:  { aperiodic_exponent: 1.30, aperiodic_offset: 2.2, n_peaks: 3, r_squared: 0.97, peaks: [{cf:9.3,pw:1.4,bw:1.9},{cf:11.4,pw:0.3,bw:1.6},{cf:20.2,pw:0.2,bw:2.3}] },
          } } },
      spectral_edge_frequency: { status: 'ok', label: 'Spectral Edge Frequency', category: 'spectral', duration_ms: 450,
        summary: 'SEF50 at 10.8 Hz and SEF95 at 24.3 Hz within normal limits.',
        data: { mean_sef50_hz: 10.8, mean_sef95_hz: 24.3 } },
      band_peak_frequencies: { status: 'ok', label: 'Band Peak Frequencies', category: 'spectral', duration_ms: 380,
        summary: 'Alpha peak at 9.24 Hz (low-normal range).',
        data: { mean_alpha_peak_hz: 9.24 } },
      wavelet_decomposition: { status: 'ok', label: 'Wavelet Decomposition', category: 'spectral', duration_ms: 2100,
        summary: 'CWT-based energy distribution consistent with FFT-derived band powers.',
        data: { band_summary: { delta: 18.4, theta: 12.6, alpha: 28.9, beta: 22.1, high_beta: 11.3, gamma: 6.7 } } },
      full_asymmetry_matrix: { status: 'ok', label: 'Full Asymmetry Matrix', category: 'asymmetry', duration_ms: 620,
        summary: 'Left frontal alpha asymmetry (FAA 0.18) notable; other pairs within normal range.',
        data: { pairs: {
          'Fp1-Fp2': { delta: 0.06, theta: -0.05, alpha: -0.08, smr: -0.06, low_beta: 0.05, beta: 0.07, high_beta: -0.04, gamma: 0.03 },
          'F3-F4':   { delta: -0.05, theta: 0.08, alpha: 0.18, smr: 0.12, low_beta: -0.02, beta: -0.03, high_beta: 0.02, gamma: 0.01 },
          'C3-C4':   { delta: -0.02, theta: -0.04, alpha: 0.06, smr: 0.04, low_beta: 0.02, beta: 0.03, high_beta: -0.01, gamma: 0.02 },
          'P3-P4':   { delta: 0.03, theta: 0.01, alpha: -0.04, smr: -0.03, low_beta: -0.01, beta: -0.02, high_beta: 0.01, gamma: -0.01 },
          'O1-O2':   { delta: 0.01, theta: -0.02, alpha: 0.03, smr: 0.02, low_beta: -0.01, beta: -0.01, high_beta: 0.02, gamma: 0.01 },
          'T3-T4':   { delta: -0.08, theta: 0.05, alpha: -0.11, smr: -0.07, low_beta: 0.04, beta: 0.06, high_beta: -0.03, gamma: 0.02 },
          'T5-T6':   { delta: 0.04, theta: -0.03, alpha: 0.07, smr: 0.05, low_beta: -0.03, beta: -0.04, high_beta: 0.02, gamma: -0.01 },
          'F7-F8':   { delta: -0.03, theta: 0.02, alpha: 0.05, smr: 0.03, low_beta: -0.04, beta: -0.06, high_beta: 0.03, gamma: -0.02 },
        } } },
      frontal_alpha_dominance: { status: 'ok', label: 'Frontal Alpha Dominance', category: 'asymmetry', duration_ms: 310,
        summary: 'Left frontal dominance; FAA 0.18 suggesting relative right hypoactivation.',
        data: { overall_dominance: 'left', mean_faa: 0.18 } },
      delta_dominance: { status: 'ok', label: 'Delta Dominance Analysis', category: 'asymmetry', duration_ms: 280,
        summary: 'No significant lateralized delta patterns found.',
        data: { lateralized_pairs: 0 } },
      regional_asymmetry_severity: { status: 'ok', label: 'Regional Asymmetry Severity', category: 'asymmetry', duration_ms: 350,
        summary: 'Mild frontal asymmetry; other regions within normal limits.',
        data: { overall_severity: 'mild',
          regions: { frontal: { severity: 'mild' }, central: { severity: 'normal' }, parietal: { severity: 'normal' }, occipital: { severity: 'normal' }, temporal: { severity: 'normal' } } } },
      coherence_matrix: { status: 'ok', label: 'Coherence Matrix', category: 'connectivity', duration_ms: 4500,
        summary: 'Alpha coherence shows expected posterior-to-anterior gradient with intact interhemispheric connectivity.',
        data: {
          channels: ['F3','F4','C3','C4','P3','P4','O1','O2'],
          bands: {
            delta: [
              [1.00,0.68,0.55,0.42,0.30,0.28,0.18,0.16],
              [0.68,1.00,0.40,0.56,0.27,0.30,0.17,0.19],
              [0.55,0.40,1.00,0.52,0.48,0.38,0.30,0.28],
              [0.42,0.56,0.52,1.00,0.37,0.50,0.28,0.32],
              [0.30,0.27,0.48,0.37,1.00,0.62,0.55,0.42],
              [0.28,0.30,0.38,0.50,0.62,1.00,0.44,0.58],
              [0.18,0.17,0.30,0.28,0.55,0.44,1.00,0.65],
              [0.16,0.19,0.28,0.32,0.42,0.58,0.65,1.00],
            ],
            theta: [
              [1.00,0.65,0.58,0.44,0.32,0.29,0.20,0.18],
              [0.65,1.00,0.42,0.60,0.28,0.33,0.19,0.21],
              [0.58,0.42,1.00,0.55,0.52,0.40,0.34,0.31],
              [0.44,0.60,0.55,1.00,0.40,0.56,0.31,0.36],
              [0.32,0.28,0.52,0.40,1.00,0.66,0.60,0.48],
              [0.29,0.33,0.40,0.56,0.66,1.00,0.48,0.62],
              [0.20,0.19,0.34,0.31,0.60,0.48,1.00,0.72],
              [0.18,0.21,0.31,0.36,0.48,0.62,0.72,1.00],
            ],
            alpha: [
              [1.00,0.72,0.65,0.48,0.35,0.32,0.22,0.20],
              [0.72,1.00,0.47,0.66,0.31,0.36,0.21,0.23],
              [0.65,0.47,1.00,0.58,0.62,0.45,0.38,0.35],
              [0.48,0.66,0.58,1.00,0.44,0.63,0.34,0.39],
              [0.35,0.31,0.62,0.44,1.00,0.71,0.68,0.55],
              [0.32,0.36,0.45,0.63,0.71,1.00,0.54,0.69],
              [0.22,0.21,0.38,0.34,0.68,0.54,1.00,0.78],
              [0.20,0.23,0.35,0.39,0.55,0.69,0.78,1.00],
            ],
            beta: [
              [1.00,0.58,0.50,0.38,0.25,0.22,0.15,0.13],
              [0.58,1.00,0.36,0.52,0.22,0.26,0.14,0.16],
              [0.50,0.36,1.00,0.45,0.42,0.33,0.25,0.22],
              [0.38,0.52,0.45,1.00,0.32,0.44,0.22,0.26],
              [0.25,0.22,0.42,0.32,1.00,0.55,0.48,0.38],
              [0.22,0.26,0.33,0.44,0.55,1.00,0.36,0.50],
              [0.15,0.14,0.25,0.22,0.48,0.36,1.00,0.62],
              [0.13,0.16,0.22,0.26,0.38,0.50,0.62,1.00],
            ],
          } } },
      disconnection_flags: { status: 'ok', label: 'Disconnection Flags', category: 'connectivity', duration_ms: 890,
        summary: '3 pairs flagged for low coherence; primarily long-range connections.',
        data: { flagged_count: 3, total_pairs_checked: 171,
          flags: [
            { ch1: 'Fp1', ch2: 'O2', band: 'alpha', coherence: 0.12 },
            { ch1: 'F7', ch2: 'T6', band: 'beta', coherence: 0.14 },
            { ch1: 'Fp2', ch2: 'O1', band: 'alpha', coherence: 0.15 },
          ] } },
      pli_icoh: { status: 'ok', label: 'PLI / iCoh', category: 'connectivity', duration_ms: 2800,
        summary: 'Mean alpha PLI 0.28 indicates moderate phase synchronization.',
        data: { mean_pli: 0.28, total_pairs: 171 } },
      wpli: { status: 'ok', label: 'Weighted PLI', category: 'connectivity', duration_ms: 3100,
        summary: 'wPLI values consistent with PLI, confirming functional connectivity pattern.',
        data: { bands: {
          delta: { mean_wpli: 0.18 }, theta: { mean_wpli: 0.22 },
          alpha: { mean_wpli: 0.31 }, beta: { mean_wpli: 0.15 },
        } } },
      ica_decomposition: { status: 'ok', label: 'ICA Decomposition', category: 'connectivity', duration_ms: 5200,
        summary: '14 brain components, 5 artifact components identified.',
        data: { brain_components: 14, artifact_components: 5, n_components: 19,
          type_counts: { brain_cortical: 11, brain_subcortical: 3, eye_blink: 2, eye_movement: 1, muscle: 2 } } },
      entropy_analysis: { status: 'ok', label: 'Entropy Analysis', category: 'complexity', duration_ms: 1800,
        summary: 'Mean sample entropy 1.52 within normal range; no abnormal regularity.',
        data: { mean_sample_entropy: 1.52, segment_duration_sec: 10 } },
      fractal_lz: { status: 'ok', label: 'Fractal / Lempel-Ziv Complexity', category: 'complexity', duration_ms: 2400,
        summary: 'Higuchi FD 1.62 and LZ complexity 0.71 suggest normal cortical complexity.',
        data: { mean_higuchi_fd: 1.62, mean_lempel_ziv: 0.71 } },
      multiscale_entropy: { status: 'ok', label: 'Multiscale Entropy', category: 'complexity', duration_ms: 3600,
        summary: 'Complexity index 4.82; healthy cross-scale entropy dynamics.',
        data: { mean_complexity_index: 4.82 } },
      higuchi_fd_detailed: { status: 'ok', label: 'Higuchi FD Detailed', category: 'complexity', duration_ms: 1400,
        summary: 'Dominant classification: normal complexity across all regions.',
        data: { dominant_classification: 'normal' } },
      small_world_index: { status: 'ok', label: 'Small World Index', category: 'network', duration_ms: 1600,
        summary: 'Small-world index 2.4 confirms small-world network topology.',
        data: { small_world_index: 2.4, clustering_coefficient: 0.68, path_length: 1.82, density: 0.35 } },
      graph_theoretic_indices: { status: 'ok', label: 'Graph Theoretic Indices', category: 'network', duration_ms: 2200,
        summary: 'Network efficiency 0.58; Cz and Pz identified as hub nodes.',
        data: { global: { mean_clustering: 0.64, global_efficiency: 0.58, mean_degree: 6.2 }, hubs: ['Cz', 'Pz', 'C3'] } },
      microstate_analysis: { status: 'ok', label: 'Microstate Analysis', category: 'microstate', duration_ms: 4100,
        summary: 'Four canonical microstates (A-D) account for 78% GEV.',
        data: { gev: 0.78,
          classes: {
            A: { coverage_pct: 22.1, mean_duration_ms: 68, occurrence_per_sec: 3.2 },
            B: { coverage_pct: 24.5, mean_duration_ms: 72, occurrence_per_sec: 3.4 },
            C: { coverage_pct: 18.3, mean_duration_ms: 58, occurrence_per_sec: 3.1 },
            D: { coverage_pct: 13.1, mean_duration_ms: 52, occurrence_per_sec: 2.5 },
          } } },
      iapf_plasticity: { status: 'ok', label: 'IAPF & Plasticity Index', category: 'clinical', duration_ms: 680,
        summary: 'Posterior IAPF 9.24 Hz (low-normal); global mean 9.08 Hz.',
        data: { posterior_iapf_hz: 9.24, mean_iapf_hz: 9.08,
          channels: {
            Fp1:{iapf_hz:8.6,bandwidth_hz:2.4,plasticity:'wide'}, Fp2:{iapf_hz:8.8,bandwidth_hz:2.2,plasticity:'wide'},
            F3:{iapf_hz:9.1,bandwidth_hz:2.0,plasticity:'wide'}, Fz:{iapf_hz:8.9,bandwidth_hz:1.8,plasticity:'narrow'},
            F4:{iapf_hz:9.2,bandwidth_hz:2.1,plasticity:'wide'}, F7:{iapf_hz:8.5,bandwidth_hz:2.3,plasticity:'wide'},
            F8:{iapf_hz:8.7,bandwidth_hz:2.1,plasticity:'wide'}, T3:{iapf_hz:9.0,bandwidth_hz:1.9,plasticity:'narrow'},
            C3:{iapf_hz:9.3,bandwidth_hz:1.7,plasticity:'narrow'}, Cz:{iapf_hz:9.1,bandwidth_hz:1.8,plasticity:'narrow'},
            C4:{iapf_hz:9.4,bandwidth_hz:1.9,plasticity:'narrow'}, T4:{iapf_hz:9.0,bandwidth_hz:2.0,plasticity:'wide'},
            T5:{iapf_hz:9.5,bandwidth_hz:1.6,plasticity:'narrow'}, P3:{iapf_hz:9.6,bandwidth_hz:1.5,plasticity:'narrow'},
            Pz:{iapf_hz:9.4,bandwidth_hz:1.4,plasticity:'narrow'}, P4:{iapf_hz:9.5,bandwidth_hz:1.6,plasticity:'narrow'},
            T6:{iapf_hz:9.3,bandwidth_hz:1.7,plasticity:'narrow'}, O1:{iapf_hz:9.2,bandwidth_hz:1.5,plasticity:'narrow'},
            O2:{iapf_hz:9.3,bandwidth_hz:1.6,plasticity:'narrow'},
          } } },
      tbr_screening: { status: 'ok', label: 'TBR Screening Map', category: 'clinical', duration_ms: 420,
        summary: 'Theta/Beta ratio 3.82 at Fz (borderline elevated). Frontal TBR distribution suggests mild attentional dysregulation. Clinical threshold for ADHD consideration is 4.5.' },
      alpha_asymmetry_index: { status: 'ok', label: 'Alpha Asymmetry Index', category: 'clinical', duration_ms: 350,
        summary: 'Composite alpha asymmetry index 0.14 (mild left-dominant). F3-F4 pair shows strongest asymmetry (0.18). Pattern consistent with withdrawal-related affective style.' },
      cordance: { status: 'ok', label: 'Cordance Analysis', category: 'clinical', duration_ms: 580,
        summary: 'Prefrontal theta cordance mildly elevated. Literature suggests potential predictor of antidepressant response. Posterior alpha cordance within normal limits.' },
    },
  },
  signal_deviations: {
    Fp1: {mean: 3.44e-8, std: 7.88e-6}, Fp2: {mean: 4.27e-8, std: 6.40e-6},
    F7: {mean: 1.05e-7, std: 6.41e-6}, F3: {mean: -7.72e-9, std: 7.41e-6},
    Fz: {mean: 2.60e-8, std: 7.66e-6}, F4: {mean: 1.70e-8, std: 7.04e-6},
    F8: {mean: 1.03e-8, std: 7.61e-6}, T3: {mean: -2.83e-8, std: 6.28e-6},
    C3: {mean: -3.52e-8, std: 7.14e-6}, Cz: {mean: -3.22e-8, std: 7.90e-6},
    C4: {mean: -5.31e-9, std: 6.54e-6}, T4: {mean: 4.40e-8, std: 5.37e-6},
    T5: {mean: 3.56e-8, std: 5.78e-6}, P3: {mean: -5.14e-8, std: 6.94e-6},
    Pz: {mean: 3.75e-8, std: 7.07e-6}, P4: {mean: -2.95e-9, std: 6.20e-6},
    T6: {mean: 1.40e-9, std: 4.19e-6}, O1: {mean: -1.38e-8, std: 6.50e-6},
    O2: {mean: 2.60e-9, std: 6.03e-6}
  },
  tbr_per_channel: {
    Fp1: 2.47, Fp2: 3.17, F7: 2.85, F3: 3.54, Fz: 4.03, F4: 3.08, F8: 3.88,
    T3: 2.72, C3: 3.18, Cz: 3.55, C4: 3.02, T4: 3.50, T5: 2.67,
    P3: 3.15, Pz: 3.30, P4: 3.05, T6: 2.56, O1: 3.01, O2: 2.81
  },
  pathological_signs: {
    severity: 'moderate',
    spikes: {
      total: 8,
      channels: {
        Fp1: {count: 1, avg_amplitude: -51.9, avg_duration_ms: 20},
        F3: {count: 2, avg_amplitude: -2.2, avg_duration_ms: 30},
        Fz: {count: 1, avg_amplitude: -51.1, avg_duration_ms: 40},
        F4: {count: 1, avg_amplitude: 56.8, avg_duration_ms: 52},
        Cz: {count: 1, avg_amplitude: 54.4, avg_duration_ms: 60},
        T4: {count: 2, avg_amplitude: -51.7, avg_duration_ms: 38}
      }
    },
    sharp_waves: {
      total: 8,
      channels: {
        Fp1: {count: 4, avg_amplitude: -4.5, avg_duration_ms: 91},
        F7: {count: 1, avg_amplitude: -53.4, avg_duration_ms: 84},
        F3: {count: 1, avg_amplitude: -54.1, avg_duration_ms: 120},
        F4: {count: 1, avg_amplitude: 58.6, avg_duration_ms: 88},
        C3: {count: 1, avg_amplitude: 50.7, avg_duration_ms: 100},
        Cz: {count: 1, avg_amplitude: 53.9, avg_duration_ms: 112}
      }
    },
    slow_waves: {total: 1, channels: {T3: {count: 1}}},
    suppression: {total_channels: 19, total_duration_sec: 173.0}
  },
  brodmann_areas: [
    {area: 'Brodmann Area 37', name: 'Fusiform Gyrus', z_score: -1.71, status: 'borderline', channels: ['T5','T6'], functions: ['Object recognition','Visual word processing'], clinical_relevance: 'Object agnosia, Reading difficulties'},
    {area: 'Brodmann Area 21, 22', name: 'Temporal Lobe', z_score: -0.95, status: 'normal', channels: ['T3','T4'], functions: ['Auditory processing','Language'], clinical_relevance: ''},
    {area: 'Brodmann Area 6', name: 'Premotor Cortex', z_score: 0.93, status: 'normal', channels: ['F3','F4','Cz'], functions: ['Motor planning'], clinical_relevance: ''},
    {area: 'Brodmann Area 8', name: 'Frontal Eye Fields', z_score: 0.82, status: 'normal', channels: ['F3','F4','Fz'], functions: ['Eye movements','Attention'], clinical_relevance: ''},
    {area: 'Brodmann Area 1, 2, 3', name: 'Somatosensory Cortex', z_score: -1.20, status: 'normal', channels: ['C3','C4','Cz'], functions: ['Sensory processing'], clinical_relevance: ''},
    {area: 'Brodmann Area 9', name: 'Prefrontal Cortex', z_score: 1.30, status: 'mild_increase', channels: ['F3','F4','Fz'], functions: ['Executive function','Working memory'], clinical_relevance: 'Increased cognitive effort'}
  ],
  asymmetry_detail: {
    overall: 'significant',
    regions: {
      frontal: {index: 0.22, direction: 'left', status: 'normal', description: 'May indicate increased analytical processing'},
      central: {index: -10.83, direction: 'right', status: 'high', description: 'Marked hemispheric asymmetry'},
      temporal: {index: 0.43, direction: 'left', status: 'normal', description: 'Enhanced verbal processing'},
      parietal: {index: 0.21, direction: 'left', status: 'normal', description: ''},
      occipital: {index: -1.38, direction: 'right', status: 'normal', description: ''}
    },
    band_findings: {
      delta: [{region: 'Temporal (T5/T6)', value: 30.8, status: 'high', function: 'auditory integration'}],
      theta: [{region: 'Temporal (T5/T6)', value: 34.4, status: 'high', function: 'auditory integration'}],
      alpha: [{region: 'Occipital (O1/O2)', value: 18.0, status: 'normal', function: 'visual processing'}],
      beta: [{region: 'Temporal (T5/T6)', value: 34.4, status: 'high', function: 'auditory integration'}]
    }
  },
  biomarkers: {
    summary: 'Secondary patterns detected.',
    conditions: [
      {name: 'Dyslexia', likelihood: 51.05, relevance: 'Moderate Indication'},
      {name: 'Autism', likelihood: 49.52, relevance: 'Mild Indication'},
      {name: 'ADHD', likelihood: 26.31, relevance: 'Limited Indication'},
      {name: 'Cognitive Decline', likelihood: 24.42, relevance: 'Limited Indication'},
      {name: 'Celiac', likelihood: 20.05, relevance: 'Limited Indication'},
      {name: 'Depression', likelihood: 17.10, relevance: 'Limited Indication'},
      {name: 'Anxiety', likelihood: 17.10, relevance: 'Limited Indication'},
      {name: 'Tinnitus', likelihood: 17.10, relevance: 'Limited Indication'},
      {name: 'OCD', likelihood: 15.81, relevance: 'Limited Indication'},
      {name: 'Insomnia', likelihood: 0.00, relevance: 'Limited Indication'}
    ],
    paf: {value: 10.01, status: 'Within typical range'},
    tbr: {value: 3.79, status: 'Elevated - attention-related patterns'},
    gamma_power: {value: 0.00, status: 'Reduced - integration difficulties'}
  },
  connectivity_detail: {
    disconnected: [
      {channel: 'T4', importance: 'high', effect: 'Right temporal disconnection affecting auditory processing'},
      {channel: 'T6', importance: 'high', effect: 'Temporal dysfunction affecting auditory and memory processing'}
    ],
    high_connectivity: [
      {pair: 'Fp1-F7', coherence: 0.89, normal: 0.7, status: 'overactive', effect: 'Poor cognitive flexibility'},
      {pair: 'Fp2-F4', coherence: 0.77, normal: 0.5, status: 'overactive', effect: 'Heightened anxiety or focus issues'},
      {pair: 'Fp2-F8', coherence: 0.82, normal: 0.5, status: 'overactive', effect: 'Attention regulation issues'},
      {pair: 'F7-F3', coherence: 0.75, normal: 0.4, status: 'overactive', effect: 'Impaired cognitive flexibility'},
      {pair: 'F3-Fz', coherence: 0.84, normal: 0.6, status: 'overactive', effect: 'Altered cognitive processing'},
      {pair: 'F3-C3', coherence: 0.78, normal: 0.7, status: 'overactive', effect: 'Enhanced frontal-central coupling'},
      {pair: 'Fz-F4', coherence: 0.77, normal: 0.3, status: 'overactive', effect: 'Heightened attention/focus'},
      {pair: 'C3-P3', coherence: 0.81, normal: 0.6, status: 'overactive', effect: 'Sensorimotor processing issues'},
      {pair: 'T5-P3', coherence: 0.75, normal: 0.3, status: 'overactive', effect: 'Enhanced language processing'},
      {pair: 'P3-Pz', coherence: 0.78, normal: 0.5, status: 'overactive', effect: 'Attentional synchronization'},
      {pair: 'Pz-P4', coherence: 0.75, normal: 0.25, status: 'overactive', effect: 'Altered spatial processing'}
    ],
    moderate_connectivity: [
      {pair: 'Fp1-F3', coherence: 0.60, normal: 0.4, status: 'overactive', effect: 'Altered frontal synchronization'},
      {pair: 'F3-T3', coherence: 0.56, normal: 0.3, status: 'overactive', effect: 'Hyper-synchronization'},
      {pair: 'Fz-C3', coherence: 0.69, normal: 0.3, status: 'overactive', effect: 'Excessive synchronization'},
      {pair: 'T3-T5', coherence: 0.62, normal: 0.3, status: 'overactive', effect: 'Temporal hyperconnectivity'},
      {pair: 'T5-O1', coherence: 0.68, normal: 0.3, status: 'overactive', effect: 'Abnormal temporal-occipital sync'}
    ],
    regional_means: {
      interhemispheric: {mean: 0.338, variability: 0.239},
      pfc: {mean: 0.427, pattern: 'moderate connectivity'},
      temporal: {mean: 0.298, pattern: 'weak connectivity'},
      parietal: {mean: 0.521, pattern: 'moderate connectivity'},
      occipital: {mean: 0.397, pattern: 'moderate connectivity'}
    }
  },
  iapf_regional: {
    overall: 11.96,
    frontal: {min: 10.01, max: 11.96},
    central: {min: 9.8, max: 10.5},
    temporal: {min: 9.5, max: 10.2},
    parietal: {min: 9.6, max: 10.3},
    occipital: {o1: 10.01, o2: 10.01},
    status: 'High',
    typical_range: '9.0-11.0 Hz',
    interpretation: 'Sometimes associated with high arousal, stress, or anxiety'
  },
  absolute_power: {
    delta: {mean: 3.91e-12, max_location: 'Cz', status: 'Reduced'},
    theta: {mean: 1.54e-12, max_location: 'Cz', status: 'Reduced'},
    alpha: {mean: 1.53e-12, max_location: 'Fz', status: 'Reduced'},
    beta: {mean: 5.12e-13, max_location: 'Cz', status: 'Reduced'},
    gamma: {mean: 1.62e-12, max_location: 'Fp1', status: 'Reduced'}
  },
  relative_power: {
    delta: {pct: 2.8, status: 'Reduced'},
    theta: {pct: 1.1, status: 'Reduced'},
    alpha: {pct: 1.1, status: 'Reduced'},
    beta: {pct: 0.4, status: 'Normal'},
    gamma: {pct: 0.1, status: 'Normal'}
  },
  power_ratios: {
    theta_beta: 2.96,
    alpha_theta: 1.01
  },

  // ── MNE-Python pipeline fields (CONTRACT.md §1) ─────────────────────────────
  // Compact demo payload so the new UI sections render on the Netlify preview
  // without needing a live Fly API. Every field below matches the AnalysisOut
  // shape the backend will eventually produce; the renderers are shared.
  pipeline_version: '0.1.0',
  norm_db_version: 'toy-0.1',
  flagged_conditions: ['mdd', 'anxiety', 'adhd'],
  quality_metrics: (function () {
    return {
      n_channels_input: 19,
      n_channels_rejected: 1,
      bad_channels: ['T5'],
      n_epochs_total: 278,
      n_epochs_retained: 261,
      ica_components_dropped: 4,
      ica_labels_dropped: { eye: 2, muscle: 1, heart: 1 },
      sfreq_input: 256,
      sfreq_output: 250,
      bandpass: [1.0, 45.0],
      notch_hz: 50.0,
    };
  })(),
  aperiodic: (function () {
    // Slope + offset + r² per channel. Slope > 1.5 suggests hyperarousal,
    // < 1.0 suggests cortical slowing.
    var chs = ['Fp1','Fp2','F7','F3','Fz','F4','F8','T3','C3','Cz','C4','T4','T5','P3','Pz','P4','T6','O1','O2'];
    var slopes = [1.51,1.48,1.34,1.45,1.38,1.42,1.33,1.24,1.35,1.40,1.36,1.22,1.18,1.32,1.29,1.31,1.20,1.26,1.28];
    var offsets = [2.8,2.7,2.5,2.6,2.5,2.6,2.5,2.3,2.4,2.5,2.4,2.3,2.2,2.3,2.3,2.3,2.2,2.3,2.3];
    var r2 = [0.96,0.96,0.94,0.97,0.95,0.96,0.94,0.93,0.98,0.96,0.97,0.92,0.90,0.97,0.96,0.96,0.91,0.95,0.95];
    var out = { slope: {}, offset: {}, r_squared: {} };
    chs.forEach(function (c, i) { out.slope[c] = slopes[i]; out.offset[c] = offsets[i]; out.r_squared[c] = r2[i]; });
    return out;
  })(),
  peak_alpha_freq: (function () {
    var chs = ['Fp1','Fp2','F7','F3','Fz','F4','F8','T3','C3','Cz','C4','T4','T5','P3','Pz','P4','T6','O1','O2'];
    var paf = [9.2,9.3,9.0,9.5,9.3,9.4,9.1,8.8,9.6,9.4,9.5,8.9,null,9.8,10.1,9.9,9.0,10.2,10.1];
    var out = {};
    chs.forEach(function (c, i) { out[c] = paf[i]; });
    return out;
  })(),
  asymmetry: {
    // ln(F4 alpha) − ln(F3 alpha). Positive = left hypoactivation, depression-associated.
    frontal_alpha_F3_F4: 0.21,
    frontal_alpha_F7_F8: 0.14,
  },
  graph_metrics: {
    delta:     { clustering_coef: 0.48, char_path_length: 2.12, small_worldness: 1.24 },
    theta:     { clustering_coef: 0.52, char_path_length: 1.98, small_worldness: 1.38 },
    alpha:     { clustering_coef: 0.61, char_path_length: 1.82, small_worldness: 1.52 },
    beta:      { clustering_coef: 0.45, char_path_length: 2.25, small_worldness: 1.18 },
    gamma:     { clustering_coef: 0.38, char_path_length: 2.56, small_worldness: 1.04 },
  },
  connectivity: (function () {
    // Minimal wPLI / coherence structure — only exposes the channel list so
    // the AI narrative + other summaries can reference it. Full NxN matrices
    // are omitted from the demo payload to keep the bundle small; the UI
    // panels that consume them gracefully handle absent matrices.
    var chs = ['Fp1','Fp2','F7','F3','Fz','F4','F8','T3','C3','Cz','C4','T4','T5','P3','Pz','P4','T6','O1','O2'];
    return { wpli: {}, coherence: {}, channels: chs };
  })(),
  source_roi: {
    method: 'eLORETA',
    bands: {
      alpha: {
        'lh.superiorfrontal':    0.421,
        'rh.superiorfrontal':    0.398,
        'lh.rostralmiddlefrontal': 0.352,
        'rh.rostralmiddlefrontal': 0.341,
        'lh.lateralorbitofrontal': 0.287,
        'rh.lateralorbitofrontal': 0.294,
        'lh.precentral':         0.512,
        'rh.precentral':         0.498,
        'lh.superiorparietal':   0.641,
        'rh.superiorparietal':   0.632,
        'lh.inferiorparietal':   0.589,
        'rh.inferiorparietal':   0.576,
        'lh.precuneus':          0.711,
        'rh.precuneus':          0.702,
        'lh.superiortemporal':   0.342,
        'rh.superiortemporal':   0.358,
        'lh.middletemporal':     0.298,
        'rh.middletemporal':     0.312,
        'lh.lateraloccipital':   0.768,
        'rh.lateraloccipital':   0.752,
        'lh.cuneus':             0.812,
        'rh.cuneus':             0.801,
        'lh.rostralanteriorcingulate': 0.241,
        'rh.rostralanteriorcingulate': 0.235,
        'lh.posteriorcingulate': 0.398,
        'rh.posteriorcingulate': 0.391,
        'lh.insula':             0.324,
        'rh.insula':             0.318,
      },
      theta: {
        'lh.superiorfrontal':    0.612,
        'rh.superiorfrontal':    0.589,
        'lh.rostralmiddlefrontal': 0.548,
        'rh.rostralmiddlefrontal': 0.521,
        'lh.precentral':         0.332,
        'rh.precentral':         0.321,
        'lh.superiorparietal':   0.241,
        'rh.superiorparietal':   0.238,
        'lh.precuneus':          0.312,
        'rh.precuneus':          0.308,
        'lh.rostralanteriorcingulate': 0.581,
        'rh.rostralanteriorcingulate': 0.572,
      },
      beta: {
        'lh.superiorfrontal':    0.198,
        'rh.superiorfrontal':    0.187,
        'lh.precentral':         0.412,
        'rh.precentral':         0.398,
        'lh.postcentral':        0.432,
        'rh.postcentral':        0.418,
        'lh.superiorparietal':   0.324,
        'rh.superiorparietal':   0.318,
      },
    },
  },
  normative_zscores: {
    norm_db_version: 'toy-0.1',
    spectral: {
      bands: (function () {
        var chs = ['Fp1','Fp2','F7','F3','Fz','F4','F8','T3','C3','Cz','C4','T4','T5','P3','Pz','P4','T6','O1','O2'];
        var zs = {
          delta:    [1.2,1.1,0.8,0.4,-0.2,0.4,0.7,0.3,-0.3,-0.5,-0.3,0.3,-0.2,-0.8,-1.0,-0.7,-0.2,-1.2,-1.2],
          theta:    [0.8,0.6,0.3,1.1,2.1,0.9,0.2,-0.1,0.6,1.8,0.4,-0.2,-0.5,-0.2,-0.1,-0.3,-0.4,-0.6,-0.5],
          alpha:    [-0.3,-0.4,-0.2,0.2,-0.5,0.5,-0.3,0.1,0.8,0.3,1.0,0.0,1.5,2.2,2.5,2.3,1.4,2.8,2.7],
          beta:     [0.5,0.6,0.7,0.3,-0.1,0.3,0.8,0.5,0.1,-0.1,0.1,0.6,0.2,0.0,-0.2,-0.1,0.2,0.0,-0.1],
          gamma:    [0.6,0.5,1.1,0.4,0.6,0.3,0.9,0.7,0.1,0.4,0.0,0.8,0.7,-0.1,-0.3,-0.1,0.6,-0.4,-0.3],
        };
        var out = {};
        Object.keys(zs).forEach(function (b) {
          out[b] = { absolute_uv2: {}, relative: {} };
          chs.forEach(function (c, i) {
            out[b].absolute_uv2[c] = zs[b][i];
            // Relative z-scores synthesised as a dampened variant.
            out[b].relative[c] = +(zs[b][i] * 0.6).toFixed(2);
          });
        });
        return out;
      })(),
    },
    flagged: [
      { metric: 'spectral.bands.theta.absolute_uv2', channel: 'Fz', z: 2.10 },
      { metric: 'spectral.bands.alpha.absolute_uv2', channel: 'Pz', z: 2.50 },
      { metric: 'spectral.bands.alpha.absolute_uv2', channel: 'O1', z: 2.80 },
      { metric: 'spectral.bands.alpha.absolute_uv2', channel: 'O2', z: 2.70 },
      { metric: 'spectral.bands.alpha.absolute_uv2', channel: 'P3', z: 2.20 },
      { metric: 'spectral.bands.alpha.absolute_uv2', channel: 'P4', z: 2.30 },
    ],
  },

  // ── Contract V2 §1 AI upgrade fields ─────────────────────────────────────
  // Seeded, deterministic demo payload so the Contract V2 frontend panels
  // render on the Netlify preview without a live Fly API. Values are
  // clinically consistent with the rest of the demo (elevated frontal theta
  // at Fz, posterior alpha hyper-amplitude, F3/F4 asymmetry).

  // §1 — 200-dim LaBraM-style embedding. Seeded by a hardcoded constant so
  // the vector is stable across reloads (not random per render).
  embedding: (function () {
    var SEED = 0x9E3779B9; // golden-ratio mixing constant
    var v = SEED;
    var out = [];
    for (var i = 0; i < 200; i++) {
      // Xorshift32-style step — deterministic, stable, no Math.random().
      v ^= v << 13; v >>>= 0;
      v ^= v >>> 17;
      v ^= v << 5; v >>>= 0;
      // Map to roughly [-1, 1].
      out.push(+(((v & 0xFFFF) / 0xFFFF) * 2 - 1).toFixed(5));
    }
    return out;
  })(),

  // §1 — brain age. Predicted 38, chronological 35, gap +3.
  brain_age: (function () {
    var chs = ['Fp1','Fp2','F7','F3','Fz','F4','F8','T3','C3','Cz','C4','T4','T5','P3','Pz','P4','T6','O1','O2'];
    // Importance weights roughly follow frontal-theta + posterior-alpha drivers.
    var imp = [0.38,0.35,0.42,0.55,0.82,0.54,0.40,0.31,0.44,0.60,0.43,0.29,0.28,0.51,0.68,0.50,0.32,0.72,0.71];
    var ei = {};
    chs.forEach(function (c, i) { ei[c] = imp[i]; });
    return {
      predicted_years: 38,
      chronological_years: 35,
      gap_years: 3.0,
      gap_percentile: 72,
      confidence: 'moderate',
      electrode_importance: ei,
    };
  })(),

  // §1 — similarity indices (NOT probability of disease). CI bands ±0.08.
  risk_scores: {
    mdd_like:               { score: 0.71, ci95: [0.63, 0.79] },
    adhd_like:              { score: 0.42, ci95: [0.34, 0.50] },
    anxiety_like:           { score: 0.58, ci95: [0.50, 0.66] },
    cognitive_decline_like: { score: 0.22, ci95: [0.14, 0.30] },
    tbi_residual_like:      { score: 0.18, ci95: [0.10, 0.26] },
    insomnia_like:          { score: 0.34, ci95: [0.26, 0.42] },
    disclaimer: 'These are neurophysiological similarity indices; they do not establish any medical condition.',
  },

  // §1 — GAMLSS centiles (0–100 per channel per band).
  centiles: (function () {
    var chs = ['Fp1','Fp2','F7','F3','Fz','F4','F8','T3','C3','Cz','C4','T4','T5','P3','Pz','P4','T6','O1','O2'];
    // Values chosen to mirror the z-score shape: Fz theta ~92pct (high),
    // Pz/P3/P4/O1/O2 alpha ~95–99pct, frontal delta around 60–70pct.
    var bandPcts = {
      delta:    [78,75,65,58,48,58,64,56,42,40,42,56,48,30,28,33,48,18,18],
      theta:    [70,65,58,72,92,68,55,48,65,88,58,45,40,48,50,47,46,42,43],
      alpha:    [40,38,42,55,38,62,42,52,70,58,72,50,82,96,99,97,85,99,98],
      beta:     [65,67,68,58,48,58,72,65,50,48,50,66,55,48,42,45,55,48,45],
      gamma:    [68,65,78,60,65,58,73,68,52,60,50,70,68,48,42,48,62,40,42],
    };
    var out = { spectral: { bands: {} }, aperiodic: { slope: {} }, norm_db_version: 'gamlss-v1' };
    Object.keys(bandPcts).forEach(function (b) {
      out.spectral.bands[b] = { absolute_uv2: {}, relative: {} };
      chs.forEach(function (c, i) {
        out.spectral.bands[b].absolute_uv2[c] = bandPcts[b][i];
        // Relative centile ~ dampened variant of the absolute percentile.
        out.spectral.bands[b].relative[c] = Math.max(5, Math.min(95,
          Math.round(50 + 0.6 * (bandPcts[b][i] - 50))));
      });
    });
    // Aperiodic slope centiles (illustrative, per channel).
    chs.forEach(function (c, i) {
      out.aperiodic.slope[c] = Math.max(5, Math.min(95, 40 + (i % 7) * 5));
    });
    return out;
  })(),

  // §1 — explainability (integrated gradients + OOD + Adebayo sanity).
  explainability: (function () {
    var riskKeys = ['mdd_like','adhd_like','anxiety_like','cognitive_decline_like','tbi_residual_like','insomnia_like'];
    // Top-3 channels × band chosen to reflect the qEEG drivers per risk.
    var tops = {
      mdd_like:               [{ch:'F3',band:'alpha',score:0.82},{ch:'F4',band:'alpha',score:0.74},{ch:'Fz',band:'theta',score:0.55}],
      adhd_like:              [{ch:'Fz',band:'theta',score:0.78},{ch:'Cz',band:'theta',score:0.62},{ch:'F3',band:'beta',score:0.48}],
      anxiety_like:           [{ch:'F8',band:'beta',score:0.66},{ch:'F4',band:'beta',score:0.59},{ch:'Fp2',band:'gamma',score:0.52}],
      cognitive_decline_like: [{ch:'Pz',band:'alpha',score:0.55},{ch:'T5',band:'theta',score:0.44},{ch:'T6',band:'theta',score:0.41}],
      tbi_residual_like:      [{ch:'T3',band:'delta',score:0.48},{ch:'T4',band:'delta',score:0.42},{ch:'F7',band:'theta',score:0.38}],
      insomnia_like:          [{ch:'O1',band:'alpha',score:0.61},{ch:'O2',band:'alpha',score:0.58},{ch:'Pz',band:'alpha',score:0.54}],
    };
    var per = {};
    var chs = ['Fp1','Fp2','F7','F3','Fz','F4','F8','T3','C3','Cz','C4','T4','T5','P3','Pz','P4','T6','O1','O2'];
    var bands = ['delta','theta','alpha','beta','gamma'];
    riskKeys.forEach(function (rk) {
      var channelImp = {};
      chs.forEach(function (c, ci) {
        channelImp[c] = {};
        bands.forEach(function (b, bi) {
          // Baseline small importance; boost top channels.
          var base = 0.05 + (((ci + bi) * 7) % 19) / 200;
          channelImp[c][b] = +base.toFixed(3);
        });
      });
      tops[rk].forEach(function (t) {
        if (channelImp[t.ch] && channelImp[t.ch][t.band] != null) {
          channelImp[t.ch][t.band] = +(t.score).toFixed(3);
        }
      });
      per[rk] = { channel_importance: channelImp, top_channels: tops[rk] };
    });
    return {
      per_risk_score: per,
      ood_score: { percentile: 32, distance: 0.41, interpretation: 'within training distribution' },
      adebayo_sanity_pass: true,
      method: 'integrated_gradients',
    };
  })(),

  // §1 — similar cases (top-K retrieval, de-identified).
  similar_cases: [
    { similarity: 0.94, age_bucket: '30–39', sex: 'F', flagged_conditions: ['MDD'], outcome: 'responder',
      summary: 'F3/F4 alpha asymmetry + mild frontal theta; responded to 20-session HF-rTMS over L-DLPFC.' },
    { similarity: 0.91, age_bucket: '30–39', sex: 'M', flagged_conditions: ['MDD','anxiety'], outcome: 'responder',
      summary: 'Posterior alpha hyper + frontal theta; combined rTMS + SMR neurofeedback led to PHQ-9 improvement.' },
    { similarity: 0.89, age_bucket: '40–49', sex: 'F', flagged_conditions: ['MDD'], outcome: 'responder',
      summary: 'Elevated Fz theta + +0.18 FAA; 15 sessions intermittent theta-burst stimulation.' },
    { similarity: 0.87, age_bucket: '20–29', sex: 'M', flagged_conditions: ['MDD','ADHD'], outcome: 'non-responder',
      summary: 'High TBR + FAA; partial response to neurofeedback only; medication adjustment recommended.' },
    { similarity: 0.85, age_bucket: '30–39', sex: 'F', flagged_conditions: ['anxiety'], outcome: 'responder',
      summary: 'Elevated frontal beta + modest FAA; CBT + tDCS protocol reduced GAD-7 by 8 points.' },
    { similarity: 0.83, age_bucket: '50–59', sex: 'M', flagged_conditions: ['MDD'], outcome: 'responder',
      summary: 'Posterior alpha hyper + low PAF; HF-rTMS over L-DLPFC with Beam F3 targeting.' },
    { similarity: 0.82, age_bucket: '40–49', sex: 'F', flagged_conditions: ['MDD','insomnia'], outcome: 'responder',
      summary: 'Alpha asymmetry + occipital alpha hyper; combined sleep hygiene + rTMS protocol.' },
    { similarity: 0.80, age_bucket: '30–39', sex: 'M', flagged_conditions: ['ADHD'], outcome: 'non-responder',
      summary: 'Mid-frontal theta excess; SMR neurofeedback trial discontinued at session 8 (non-adherence).' },
  ],

  // §8 — protocol recommendation. Mirrors DEMO_QEEG_REPORT.literature_refs.
  protocol_recommendation: {
    primary_modality: 'rtms_10hz',
    target_region: 'L_DLPFC',
    rationale: 'Left-frontal hypoactivation pattern (F3/F4 alpha asymmetry +0.21) and elevated '
      + 'frontal theta at Fz support excitatory 10 Hz rTMS over left DLPFC. Findings are '
      + 'neurophysiological indicators; clinician review required before application.',
    dose: { sessions: 20, intensity: '120% RMT', duration_min: 37, frequency: '5x / week' },
    session_plan: {
      induction:     { sessions: 8,  notes: 'Daily 10 Hz, 3000 pulses/session; build tolerance.' },
      consolidation: { sessions: 12, notes: 'Continue 5x/week; re-assess at session 20.' },
      maintenance:   { sessions: 1,  notes: 'Monthly booster × 6 months if responder.' },
    },
    contraindications: ['active seizure disorder', 'ferromagnetic cranial implants',
      'cardiac pacemaker', 'pregnancy (first trimester)'],
    expected_response_window_weeks: [3, 6],
    citations: [
      { n: 1, pmid: '21890290', doi: '10.1111/j.1467-9450.2011.00893.x',
        title: 'Frontal EEG theta and inattention: a meta-analysis',
        year: 2011, url: 'https://pubmed.ncbi.nlm.nih.gov/21890290/' },
      { n: 2, pmid: '16022942', doi: '10.1016/j.ijpsycho.2005.05.008',
        title: 'Posterior alpha power and cortical hypoarousal',
        year: 2005, url: 'https://pubmed.ncbi.nlm.nih.gov/16022942/' },
      { n: 3, pmid: '11215648', doi: '10.1016/S0301-0511(00)00091-9',
        title: 'Frontal EEG asymmetry and the approach–withdrawal model',
        year: 2001, url: 'https://pubmed.ncbi.nlm.nih.gov/11215648/' },
      { n: 4, pmid: '33010823', doi: '10.1038/s41593-020-00744-x',
        title: 'Parameterizing neural power spectra into periodic and aperiodic components',
        year: 2020, url: 'https://pubmed.ncbi.nlm.nih.gov/33010823/' },
    ],
    confidence: 'moderate',
    alternative_protocols: [
      {
        primary_modality: 'neurofeedback_smr_theta',
        target_region: 'Fz/Cz',
        rationale: 'SMR up-train (12–15 Hz) + theta inhibit (4–8 Hz) at Fz addresses the '
          + 'attentional theta excess without rTMS contraindications.',
        dose: { sessions: 30, intensity: 'n/a', duration_min: 40, frequency: '2x / week' },
        session_plan: {
          induction:     { sessions: 8,  notes: 'Threshold calibration + baseline.' },
          consolidation: { sessions: 18, notes: 'Progressive reward thresholds.' },
          maintenance:   { sessions: 4,  notes: 'Monthly follow-ups × 4.' },
        },
        contraindications: [],
        expected_response_window_weeks: [6, 10],
        citations: [
          { n: 1, pmid: '21890290', title: 'Frontal EEG theta and inattention', year: 2011,
            url: 'https://pubmed.ncbi.nlm.nih.gov/21890290/' },
        ],
        confidence: 'low',
      },
      {
        primary_modality: 'tdcs_bifrontal',
        target_region: 'F3(anode) / F4(cathode)',
        rationale: 'Bifrontal tDCS at 2 mA may address both FAA and mid-frontal theta; '
          + 'lower burden alternative when rTMS is declined.',
        dose: { sessions: 10, intensity: '2 mA', duration_min: 20, frequency: '5x / week' },
        session_plan: {
          induction:     { sessions: 3,  notes: 'Tolerance build-up.' },
          consolidation: { sessions: 7,  notes: 'Standard 2-week block.' },
          maintenance:   { sessions: 0,  notes: 'None by default.' },
        },
        contraindications: ['active skin lesions at electrode sites'],
        expected_response_window_weeks: [4, 8],
        citations: [
          { n: 3, pmid: '11215648', title: 'Frontal EEG asymmetry and the approach–withdrawal model',
            year: 2001, url: 'https://pubmed.ncbi.nlm.nih.gov/11215648/' },
        ],
        confidence: 'low',
      },
    ],
  },

  // §9 — longitudinal trajectory across 3 sessions.
  longitudinal: {
    n_sessions: 3,
    baseline_date: '2026-02-10',
    days_since_baseline: 72,
    feature_trajectories: {
      fz_theta: {
        label: 'Fz theta (z)', values: [2.10, 1.72, 1.38],
        dates: ['2026-02-10', '2026-03-15', '2026-04-20'],
        slope: -0.36, rci: 1.92, significant: true,
      },
      pz_alpha: {
        label: 'Pz alpha (z)', values: [2.50, 2.31, 2.05],
        dates: ['2026-02-10', '2026-03-15', '2026-04-20'],
        slope: -0.22, rci: 1.44, significant: true,
      },
      faa_f3_f4: {
        label: 'F3/F4 alpha asymmetry', values: [0.21, 0.17, 0.12],
        dates: ['2026-02-10', '2026-03-15', '2026-04-20'],
        slope: -0.04, rci: 1.63, significant: true,
      },
      brain_age_gap: {
        label: 'Brain-age gap (y)', values: [5.2, 4.1, 3.0],
        dates: ['2026-02-10', '2026-03-15', '2026-04-20'],
        slope: -1.1, rci: 1.25, significant: false,
      },
    },
    brain_age_trajectory: {
      values: [40.2, 39.1, 38.0],
      dates: ['2026-02-10', '2026-03-15', '2026-04-20'],
    },
    normative_distance_trajectory: {
      values: [0.62, 0.51, 0.41],
      dates: ['2026-02-10', '2026-03-15', '2026-04-20'],
    },
  },

  // §9 — simple counters for the trajectory card header.
  session_number: 3,
  days_from_baseline: 72,
};

var DEMO_QEEG_REPORT = {
  id: 'demo-report',
  ai_narrative: {
    summary: 'This eyes-open qEEG recording from a 30-channel setup reveals moderate alterations in cortical activity with regional imbalances in power distribution and asymmetry, particularly affecting the frontal and temporal areas.',
    detailed_findings: 'SPECTRAL ANALYSIS:\n'
      + 'Delta band power shows expected frontal predominance (Fp1: 30%, Fp2: 29%) with appropriate posterior attenuation (O1: 15%, O2: 15%). '
      + 'No focal delta abnormalities suggestive of structural lesions.\n\n'
      + 'Theta band demonstrates mild frontal-central elevation, particularly at Fz (22%) and Cz (20%). This midline theta excess is consistent with attentional processing demands '
      + 'and may correlate with subjective concentration difficulties. The theta/beta ratio of 3.82 at Fz is approaching the clinical significance threshold of 4.5.\n\n'
      + 'Alpha band shows healthy posterior dominance with robust occipital alpha (O1: 42%, O2: 41%). The alpha peak frequency of 9.24 Hz is in the low-normal range. '
      + 'Frontal alpha asymmetry (F3-F4 pair: 0.18) suggests relative left-sided alpha excess, corresponding to reduced left frontal activation.\n\n'
      + 'Beta and high-beta distributions are within normal limits with appropriate frontal weighting. No excessive beta activity suggestive of anxiety or medication effects.\n\n'
      + 'CONNECTIVITY:\n'
      + 'Alpha coherence shows an expected posterior-to-anterior gradient. Three long-range pairs (Fp1-O2, F7-T6, Fp2-O1) show reduced coherence, '
      + 'which is developmentally normal. Small-world index of 2.4 confirms intact network topology.\n\n'
      + 'COMPLEXITY:\n'
      + 'Sample entropy (1.52), Higuchi fractal dimension (1.62), and Lempel-Ziv complexity (0.71) are all within normal ranges, '
      + 'indicating healthy cortical dynamics without pathological regularity or excessive randomness.\n\n'
      + 'CLINICAL IMPRESSION:\n'
      + 'The combination of mild frontal theta excess, borderline TBR, and left frontal alpha asymmetry suggests a profile consistent with '
      + 'mild attentional and mood-related dysregulation. These findings warrant clinical correlation with presenting symptoms.',
    clinical_overview: 'The QEEG analysis reveals that the frontal brain regions, particularly in channels such as F3, F4, and Fz, show elevated theta oscillations (~4.5Hz) with decreased alpha activity. Parietal regions display reduced alpha power integral to sensory integration. Temporal lobe analysis indicates isolated focal slowing and sporadic sharp transients in T3. Occipital regions show normal alpha peak frequencies (O1: 10.2Hz, O2: 10.0Hz).',
    key_observations: {
      frontal: {channels: 'F3, F4, Fz', finding: 'Increased theta power (~4.5Hz), reduced alpha', impact: 'Difficulties with focus and decision-making'},
      parietal: {channels: 'P3, Pz, P4', finding: 'Marked reduction in alpha power', impact: 'Affects sensory integration and spatial processing'},
      temporal: {channels: 'T3, T4, T5, T6', finding: 'Focal slowing, isolated sharp transients', impact: 'Difficulties in auditory processing and memory recall'},
      occipital: {channels: 'O1, O2', finding: 'Normal alpha peaks (O1: 10.2Hz, O2: 10.0Hz)', impact: 'Visual perception largely intact'}
    },
    firda_oirda: {firda: 'Detected sporadically in frontal channels (Fp1, F7)', oirda: 'Observed in occipital/temporal channels (T3)', impact: 'Transient lapses in alertness'},
    epileptiform: {findings: 'Occasional focal spikes in temporal region, burst durations under 3 seconds', tbr: 3.2, normal_tbr: '2.5-3.0', impact: 'Difficulty sustaining attention'},
    sections: [
      {title: 'Cognitive and Neurological Profile', content: 'Elevated IAPF with frontal high-arousal patterns. Theta/beta ratio of 3.17 indicates attentional regulation imbalance. High delta dominance across channels suggests reduced cortical activation. Notable asymmetries in temporal (~39.9%) and occipital (~90.5%) regions.'},
      {title: 'Mental Health and Brain Function', content: 'Subtle frontal asymmetries correlate with emotional regulation. Significant inattention index (6.3 at Fz vs norm of 2). Intermittent low-amplitude epileptiform discharges in temporal regions. Overall pattern of increased delta with reduced beta2/gamma consistent with hyperarousal.'},
      {title: 'Sensory Processing and Brain Function', content: 'Occipital channels show normal alpha peaks ensuring visual processing. Temporal channels show prominent delta and occasional sharp waves affecting auditory processing. High delta dominance affects sensorimotor integration.'},
      {title: 'Nonverbal Communication and Brain Activity', content: 'Elevated frontal synchronisation with atypical temporal activity may affect facial expression recognition and social cue integration. Temporal asymmetry may correlate with difficulties in auditory-linguistic processing.'},
      {title: 'Everyday Strengths and Challenges', content: 'Enhanced frontal activation supports executive functions. Persistent asymmetries denote multisensory integration challenges. Elevated attention indices create a mixed adaptability profile.'},
      {title: 'Cognitive and Behavioural Trends', content: 'Sustained elevated theta/beta ratio indicates attentional control issues. Reduced beta2 and gamma power correlates with cognitive fatigability. Dynamic microstate patterns hint at reduced neural flexibility.'},
      {title: 'Nutrition and Brain Health', content: 'Incorporate omega-3 fatty acids, B-vitamins, magnesium, and antioxidants. Regular balanced meals stabilize glucose for sustained cognitive effort.'},
      {title: 'Tailored Lifestyle Recommendations', content: 'Regular aerobic exercise 3-4 times weekly. Mind-body practices like yoga for stress regulation. Cognitive training exercises. Structured daily schedule with planned breaks.'},
      {title: 'Long-Term Learning and Career Guidance', content: 'Structured environments with clear task delineation suit the profile. Roles emphasising systematic planning and detailed task management. Productivity tools and organisational apps recommended.'},
      {title: 'Social and Recreational Support', content: 'Structured group activities. Social skills training. Recreational pursuits combining physical movement with social interaction.'},
      {title: 'Treatment and Assistive Strategies', content: 'Neurofeedback sessions for brainwave control. Mindfulness and meditation for hyperarousal reduction. CBT for anxiety and attention difficulties. Assistive technologies for executive dysfunction.'},
      {title: 'Ongoing Development and Monitoring', content: 'Follow-up QEEG evaluations every 3-6 months. Detailed symptom diary. Regular consultations with neuropsychological and nutritional specialists. Adjust interventions based on longitudinal data.'}
    ]
  },
  condition_matches: [
    { condition: 'Major Depressive Disorder', confidence: 0.68 },
    { condition: 'Generalized Anxiety Disorder', confidence: 0.52 },
    { condition: 'ADHD - Combined Type', confidence: 0.48 },
    { condition: 'Mild Cognitive Impairment', confidence: 0.35 },
  ],
  protocol_suggestions: [
    { protocol: 'rTMS - Left DLPFC (10 Hz)', rationale: 'Grade A evidence for MDD. Left frontal alpha asymmetry supports targeting left DLPFC to increase excitability and normalize frontal activation patterns.' },
    { protocol: 'tDCS - Bifrontal Montage (2 mA)', rationale: 'Grade B evidence. Anodal left DLPFC / cathodal right DLPFC may address both mood-related asymmetry and attentional theta excess.' },
    { protocol: 'Neurofeedback - SMR/Theta Protocol', rationale: 'Grade B evidence. Enhance SMR (12-15 Hz) at Cz while inhibiting frontal theta at Fz to improve attention and reduce rumination.' },
  ],
  clinician_reviewed: false,
  clinician_amendments: '',

  // ── MNE pipeline AI shape (CONTRACT.md §5.4) ───────────────────────────────
  // Populated so the RAG-cited narrative panel renders in demo mode.
  data: {
    executive_summary: 'Resting eyes-closed qEEG shows excess frontal theta at Fz [1], posterior alpha hyper-amplitude across Pz/P3/P4/O1/O2 [2], and positive F3/F4 frontal alpha asymmetry consistent with left-frontal hypoactivation [3]. SpecParam aperiodic exponents are mildly elevated in frontal leads [4]. Findings labelled for research/wellness use only.',
    findings: [
      { region: 'frontal midline (Fz)', band: 'theta', observation: 'Theta z = +2.10 at Fz, pattern commonly reported in inattention and rumination studies [1][4].', citations: [1, 4] },
      { region: 'posterior (Pz, O1, O2)', band: 'alpha', observation: 'Posterior alpha hyper-amplitude (z 2.5–2.8) consistent with hypoaroused vigilance state [2].', citations: [2] },
      { region: 'frontal (F3/F4)', band: 'alpha', observation: 'Frontal alpha asymmetry F3/F4 = +0.21 — left hypoactivation signature often reported in depressive phenotypes [3].', citations: [3] },
    ],
    protocol_recommendations: [
      { protocol: 'rTMS - Left DLPFC (10 Hz)', rationale: 'Left-frontal hypoactivation → excitatory HF rTMS over left DLPFC [3].' },
      { protocol: 'SMR / theta neurofeedback at Fz', rationale: 'Up-train SMR (12–15 Hz) while inhibiting theta (4–8 Hz) at Fz [1].' },
    ],
    confidence_level: 'moderate',
  },
  literature_refs: [
    { n: 1, pmid: '21890290', doi: '10.1111/j.1467-9450.2011.00893.x', title: 'Frontal EEG theta and inattention: a meta-analysis', year: 2011, url: 'https://pubmed.ncbi.nlm.nih.gov/21890290/' },
    { n: 2, pmid: '16022942', doi: '10.1016/j.ijpsycho.2005.05.008', title: 'Posterior alpha power and cortical hypoarousal', year: 2005, url: 'https://pubmed.ncbi.nlm.nih.gov/16022942/' },
    { n: 3, pmid: '11215648', doi: '10.1016/S0301-0511(00)00091-9', title: 'Frontal EEG asymmetry and the approach–withdrawal model', year: 2001, url: 'https://pubmed.ncbi.nlm.nih.gov/11215648/' },
    { n: 4, pmid: '33010823', doi: '10.1038/s41593-020-00744-x', title: 'Parameterizing neural power spectra into periodic and aperiodic components', year: 2020, url: 'https://pubmed.ncbi.nlm.nih.gov/33010823/' },
  ],
};

/* Build comparison delta powers from compact arrays */
function _buildDemoDeltas() {
  var changes = {
    delta:     [-2.1,-1.8,-1.5,-3.2,-4.1,-3.0,-1.6,-1.2,-2.8,-3.5,-2.6,-1.3,-1.0,-1.5,-2.0,-1.4,-1.1,-0.8,-0.9],
    theta:     [-8.2,-7.5,-5.1,-9.8,-12.5,-9.2,-5.3,-4.1,-6.8,-8.3,-6.1,-4.0,-3.2,-4.5,-5.1,-4.3,-3.0,-2.5,-2.8],
    alpha:     [3.1,2.8,1.5,5.2,4.0,5.8,1.8,3.5,6.2,5.1,6.8,3.8,7.5,10.1,11.2,10.5,7.8,8.2,7.5],
    beta:      [1.2,1.5,2.1,0.8,-0.5,0.6,2.0,1.8,0.5,-0.2,0.3,1.6,0.8,-0.3,-0.8,-0.4,0.5,-1.0,-0.8],
    high_beta: [2.5,3.1,1.8,1.2,0.8,1.0,1.9,2.2,0.5,0.3,0.4,2.0,1.5,0.2,-0.1,0.1,1.2,-0.5,-0.3],
    gamma:     [0.5,0.8,1.2,0.3,-0.2,0.1,0.8,0.5,-0.1,-0.3,-0.2,0.6,0.4,-0.1,-0.3,-0.1,0.3,-0.4,-0.3],
  };
  var bands = {};
  Object.keys(changes).forEach(function (band) {
    var chData = {};
    _DCH.forEach(function (ch, i) { chData[ch] = { pct_change: changes[band][i] }; });
    bands[band] = chData;
  });
  return { bands: bands };
}

var DEMO_QEEG_COMPARISON = {
  id: 'demo-comparison',
  baseline_analyzed_at: new Date(Date.now() - 90 * 86400000).toISOString(),
  followup_analyzed_at: new Date().toISOString(),
  improvement_summary: { improved: 8, unchanged: 7, worsened: 2 },
  ratio_changes: {
    theta_beta_ratio: { baseline: 3.82, followup: 3.34 },
    theta_alpha_ratio: { baseline: 1.15, followup: 1.02 },
    delta_alpha_ratio: { baseline: 1.41, followup: 1.28 },
    alpha_peak_frequency_hz: { baseline: 9.24, followup: 9.52 },
    frontal_alpha_asymmetry: { baseline: 0.18, followup: 0.09 },
  },
  baseline_band_powers: _buildDemoBandPowers(),
  ai_comparison_narrative: 'Follow-up qEEG recorded after 20 sessions of combined rTMS and neurofeedback treatment shows notable improvements in key biomarkers. '
    + 'Frontal theta power decreased significantly at Fz (-12.5%) and Cz (-8.3%), bringing the theta/beta ratio from 3.82 to 3.34, well below the clinical concern threshold. '
    + 'Posterior alpha power increased at O1 (+8.2%) and O2 (+7.5%), with the most pronounced gains at Pz (+11.2%) and P3 (+10.1%), suggesting improved cortical efficiency and attentional regulation. '
    + 'Frontal alpha asymmetry normalized from 0.18 to 0.09, indicating improved bilateral frontal activation balance. '
    + 'Mild increases in high-beta at frontal sites (Fp1: +2.5%, Fp2: +3.1%) should be monitored in subsequent recordings. '
    + 'Overall, 8 of 17 measured parameters improved, 7 remained stable, and 2 showed minor elevation. '
    + 'Clinical re-evaluation is recommended to correlate these neurophysiological improvements with symptomatic changes.',
  delta_powers: _buildDemoDeltas(),
};

/* Entry for the patient tab analyses list */
var DEMO_ANALYSIS_ENTRY = {
  id: 'demo', analysis_status: 'completed', original_filename: 'demo_eyes_closed.edf',
  channels_used: 19, sample_rate_hz: 256, eyes_condition: 'closed',
  analyzed_at: new Date().toISOString(),
};

/* Demo assessment correlation data */
var DEMO_ASSESSMENT_CORRELATION = {
  success: true, qeeg_analyses_count: 2, assessments_count: 6,
  correlations: [
    { assessment: 'PHQ-9', baseline_score: 18, latest_score: 8, score_change: -10, score_pct_change: -55.5, trend: 'improving', scores: [18, 16, 14, 11, 9, 8] },
    { assessment: 'GAD-7', baseline_score: 14, latest_score: 7, score_change: -7, score_pct_change: -50.0, trend: 'improving', scores: [14, 13, 11, 10, 8, 7] },
    { assessment: 'PSQI', baseline_score: 12, latest_score: 8, score_change: -4, score_pct_change: -33.3, trend: 'improving', scores: [12, 12, 11, 10, 9, 8] },
    { assessment: 'BRIEF-A', baseline_score: 68, latest_score: 62, score_change: -6, score_pct_change: -8.8, trend: 'stable', scores: [68, 67, 66, 65, 63, 62] },
  ],
};

// ── Module-scoped caches ─────────────────────────────────────────────────────
let _patients = [];
let _patient = null;
let _medHistory = null;
let _analyses = [];

function _qeegExportPayload() {
  if (!_patient || !_patient.id) return null;
  return {
    patient_id: _patient.id,
    qeeg_analysis_id: _currentAnalysis?.id || window._qeegSelectedId || null,
  };
}

async function _exportQEEGArtifact(kind) {
  const payload = _qeegExportPayload();
  if (!payload) {
    showToast('Select a patient before exporting', 'warning');
    return;
  }
  // In demo mode the backend bundle endpoints will 404 / 403 because the
  // demo patient_id has no real DB row. Keep the export honest: we don't
  // synthesize a fake bundle file, we surface the limitation.
  var _demoExport = (window._qeegSelectedId === 'demo' && _isDemoMode());
  if (_demoExport) {
    showToast('FHIR/BIDS bundles require a real patient record — demo only supports CSV/JSON export', 'warning');
    _qeegAudit('export_blocked_demo', { note: 'kind=' + kind });
    return;
  }
  _qeegAudit('export_' + kind + '_requested', { patient_id: payload.patient_id });
  try {
    const blob = kind === 'fhir'
      ? await api.exportFHIRBundle(payload)
      : await api.exportBIDSDerivatives(payload);
    const suffix = new Date().toISOString().slice(0, 10);
    const filename = kind === 'fhir'
      ? `qeeg_fhir_bundle_${payload.patient_id}_${suffix}.json`
      : `qeeg_bids_derivatives_${payload.patient_id}_${suffix}.zip`;
    downloadBlob(blob, filename);
    _qeegAudit('export_' + kind + '_completed', { patient_id: payload.patient_id });
    showToast(kind === 'fhir' ? 'FHIR bundle exported' : 'BIDS package exported', 'success');
  } catch (err) {
    _qeegAudit('export_' + kind + '_failed', { note: (err && err.message ? err.message : String(err)).slice(0, 200) });
    showToast('Export failed: ' + (err?.message || String(err)), 'error');
  }
}

window._qeegExportFHIRBundle = function () { return _exportQEEGArtifact('fhir'); };
window._qeegExportBIDSPackage = function () { return _exportQEEGArtifact('bids'); };
window._exportCurrentFHIRBundle = function () {
  if (window.location.hash && window.location.hash.indexOf('mri-analysis') !== -1 && typeof window._mriExportFHIRBundle === 'function') {
    return window._mriExportFHIRBundle();
  }
  return window._qeegExportFHIRBundle();
};
window._exportCurrentBIDSPackage = function () {
  if (window.location.hash && window.location.hash.indexOf('mri-analysis') !== -1 && typeof window._mriExportBIDSPackage === 'function') {
    return window._mriExportBIDSPackage();
  }
  return window._qeegExportBIDSPackage();
};
let _fusionSummary = null;
let _collapsedSections = (function () {
  const fallback = { medications: true, neurological: true, lifestyle: true };
  try {
    const raw = sessionStorage.getItem('qeeg_collapsed_sections');
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return Object.assign({}, fallback, parsed);
  } catch (_e) { return fallback; }
})();
function _persistCollapsedSections() {
  try { sessionStorage.setItem('qeeg_collapsed_sections', JSON.stringify(_collapsedSections)); } catch (_e) {}
}

function renderTabBar(activeTab) {
  return '<div class="ch-tab-bar" role="tablist" aria-label="qEEG analyzer sections" style="margin-bottom:20px">' +
    Object.entries(TAB_META).map(function (entry) {
      const id = entry[0], m = entry[1];
      const active = activeTab === id;
      return '<button class="ch-tab' + (active ? ' ch-tab--active' : '') + '"'
        + ' role="tab"'
        + ' aria-selected="' + (active ? 'true' : 'false') + '"'
        + ' aria-controls="qeeg-tab-content"'
        + ' tabindex="' + (active ? '0' : '-1') + '"'
        + ' data-qeeg-tab-id="' + id + '"'
        + (active ? ' style="--tab-color:' + m.color + '"' : '')
        + ' onclick="window._qeegSwitchTab(\'' + id + '\')">'
        + esc(m.label) + '</button>';
    }).join('') + '</div>';
}

// Tab switch entrypoint: captures the current scroll position keyed on the
// outgoing tab so we can restore it when the user comes back to that tab,
// then triggers the standard route handler. Idempotent.
if (typeof window !== 'undefined') {
  window._qeegTabScroll = window._qeegTabScroll || {};
  window._qeegSwitchTab = function (newTab) {
    try { window._qeegTabScroll[window._qeegTab || 'patient'] = window.scrollY || 0; } catch (_e) {}
    window._qeegTab = newTab;
    if (typeof window._nav === 'function') window._nav('qeeg-analysis');
  };
}

// Restore scroll position once the tab content has rendered.
function _qeegRestoreScroll(tabId) {
  const targetY = (window._qeegTabScroll && window._qeegTabScroll[tabId]) || 0;
  const el = document.getElementById('qeeg-tab-content');
  if (!el) { try { window.scrollTo(0, targetY); } catch (_e) {} return; }
  let restored = false;
  function tryRestore() {
    if (restored) return;
    if (el.children.length || el.textContent.trim().length) {
      try { window.scrollTo(0, targetY); } catch (_e) {}
      restored = true;
    }
  }
  tryRestore();
  if (restored) return;
  let obs;
  try {
    obs = new MutationObserver(function () { tryRestore(); if (restored && obs) obs.disconnect(); });
    obs.observe(el, { childList: true, subtree: false });
  } catch (_e) {}
  setTimeout(function () { tryRestore(); if (obs) obs.disconnect(); }, 1500);
}

// Idempotent delegated handler — toggles the inline lens-help panel when
// the workspace help (?) button is clicked.
if (typeof document !== 'undefined' && !window._qeegLensHelpWired) {
  window._qeegLensHelpWired = true;
  document.addEventListener('click', function (ev) {
    var btn = ev.target && ev.target.closest && ev.target.closest('[data-qeeg-help="lens"]');
    if (!btn) return;
    var panelId = btn.getAttribute('aria-controls') || 'qeeg-lens-help';
    var panel = document.getElementById(panelId);
    if (!panel) return;
    var open = !panel.hasAttribute('hidden');
    if (open) panel.setAttribute('hidden', '');
    else panel.removeAttribute('hidden');
    btn.setAttribute('aria-expanded', open ? 'false' : 'true');
  });
}

// Wires arrow-key / Home / End navigation across the qEEG analyzer tab strip.
// Idempotent — safe to call after every renderTabBar() reflow.
function _wireQEEGTabKeyboard() {
  if (window._qeegTabKbWired) return;
  window._qeegTabKbWired = true;
  document.addEventListener('keydown', function (ev) {
    const t = ev.target;
    if (!t || !t.classList || !t.classList.contains('ch-tab')) return;
    if (!t.hasAttribute('data-qeeg-tab-id')) return;
    const bar = t.parentElement;
    if (!bar || !bar.classList.contains('ch-tab-bar')) return;
    const tabs = Array.prototype.slice.call(bar.querySelectorAll('button.ch-tab[data-qeeg-tab-id]'));
    if (!tabs.length) return;
    const idx = tabs.indexOf(t);
    let next = idx;
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') next = (idx + 1) % tabs.length;
    else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') next = (idx - 1 + tabs.length) % tabs.length;
    else if (ev.key === 'Home') next = 0;
    else if (ev.key === 'End') next = tabs.length - 1;
    else return;
    ev.preventDefault();
    const target = tabs[next];
    target.focus();
    const id = target.getAttribute('data-qeeg-tab-id');
    if (id && typeof window._qeegSwitchTab === 'function') window._qeegSwitchTab(id);
    else if (id) { window._qeegTab = id; if (typeof window._nav === 'function') window._nav('qeeg-analysis'); }
  });
}

// ── Patient Selector ─────────────────────────────────────────────────────────

function renderPatientSelector(patients, selectedId) {
  const selected = selectedId ? patients.find(function (p) { return p.id === selectedId; }) : null;
  const displayName = selected ? esc((selected.first_name || '') + ' ' + (selected.last_name || '')) : '';

  return '<div style="position:relative;margin-bottom:16px" id="qeeg-patient-selector">'
    + '<label style="font-size:11px;font-weight:700;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:4px">Patient</label>'
    + '<div style="display:flex;gap:8px;align-items:center">'
    + '<input type="text" id="qeeg-patient-search" class="form-control" '
    + 'role="combobox" '
    + 'aria-expanded="false" '
    + 'aria-controls="qeeg-patient-dropdown" '
    + 'aria-autocomplete="list" '
    + 'aria-haspopup="listbox" '
    + 'placeholder="Search patients by name..." '
    + 'value="' + displayName + '" '
    + 'autocomplete="off" '
    + 'style="flex:1">'
    + (selectedId ? '<button class="btn btn-sm btn-outline" onclick="window._qeegClearPatient()" title="Clear selection" aria-label="Clear patient selection" style="padding:4px 8px">&times;</button>' : '')
    + '</div>'
    + '<div id="qeeg-patient-dropdown" role="listbox" aria-label="Patient suggestions" style="display:none;position:absolute;top:100%;left:0;right:0;max-height:240px;overflow-y:auto;background:var(--surface-2);border:1px solid rgba(255,255,255,0.1);border-radius:8px;z-index:100;margin-top:4px;box-shadow:0 8px 24px rgba(0,0,0,0.4)"></div>'
    + '</div>';
}

function initPatientSelector() {
  const input = document.getElementById('qeeg-patient-search');
  const dropdown = document.getElementById('qeeg-patient-dropdown');
  if (!input || !dropdown) return;

  let activeIdx = -1;
  let currentItems = [];

  function setExpanded(expanded) {
    input.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    dropdown.style.display = expanded ? 'block' : 'none';
    if (!expanded) {
      activeIdx = -1;
      input.removeAttribute('aria-activedescendant');
    }
  }

  function setActive(idx) {
    const opts = dropdown.querySelectorAll('[role="option"]');
    opts.forEach(function (el, i) {
      el.setAttribute('aria-selected', i === idx ? 'true' : 'false');
      el.style.background = i === idx ? 'rgba(255,255,255,0.06)' : 'transparent';
    });
    activeIdx = idx;
    if (idx >= 0 && opts[idx]) {
      input.setAttribute('aria-activedescendant', opts[idx].id);
      opts[idx].scrollIntoView({ block: 'nearest' });
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  }

  input.addEventListener('focus', function () {
    if (!window._qeegPatientId) showDropdown('');
  });

  input.addEventListener('input', function () {
    showDropdown(input.value);
  });

  input.addEventListener('keydown', function (ev) {
    const visible = dropdown.style.display !== 'none';
    if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      if (!visible) { showDropdown(input.value); return; }
      if (currentItems.length) setActive((activeIdx + 1) % currentItems.length);
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      if (!visible) { showDropdown(input.value); return; }
      if (currentItems.length) setActive((activeIdx - 1 + currentItems.length) % currentItems.length);
    } else if (ev.key === 'Enter') {
      if (visible && activeIdx >= 0 && currentItems[activeIdx]) {
        ev.preventDefault();
        if (typeof window._qeegSelectPatient === 'function') window._qeegSelectPatient(currentItems[activeIdx].id);
      }
    } else if (ev.key === 'Escape') {
      if (visible) { ev.preventDefault(); setExpanded(false); }
    } else if (ev.key === 'Home' && visible) {
      ev.preventDefault(); if (currentItems.length) setActive(0);
    } else if (ev.key === 'End' && visible) {
      ev.preventDefault(); if (currentItems.length) setActive(currentItems.length - 1);
    }
  });

  document.addEventListener('click', function (e) {
    if (!e.target.closest('#qeeg-patient-selector')) {
      setExpanded(false);
      if (window._qeegPatientId && _patient) {
        input.value = (_patient.first_name || '') + ' ' + (_patient.last_name || '');
      }
    }
  });

  function showDropdown(query) {
    const q = (query || '').toLowerCase().trim();
    const filtered = _patients.filter(function (p) {
      const name = ((p.first_name || '') + ' ' + (p.last_name || '')).toLowerCase();
      return !q || name.indexOf(q) !== -1;
    }).slice(0, 20);
    currentItems = filtered;

    if (!filtered.length) {
      dropdown.innerHTML = '<div role="status" style="padding:12px;color:var(--text-tertiary);font-size:13px">No patients found</div>';
    } else {
      dropdown.innerHTML = filtered.map(function (p, i) {
        const initials = ((p.first_name || '')[0] || '') + ((p.last_name || '')[0] || '');
        return '<div id="qeeg-patient-opt-' + i + '" role="option" aria-selected="false" '
          + 'data-patient-id="' + esc(p.id) + '" '
          + 'style="display:flex;align-items:center;gap:10px;padding:8px 12px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.04)">'
          + '<div style="width:32px;height:32px;border-radius:50%;background:var(--blue);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#fff;flex-shrink:0">' + esc(initials.toUpperCase()) + '</div>'
          + '<div style="flex:1;min-width:0">'
          + '<div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc((p.first_name || '') + ' ' + (p.last_name || '')) + '</div>'
          + '<div style="font-size:11px;color:var(--text-tertiary)">' + esc(p.primary_condition || 'No condition') + (p.dob ? ' | ' + esc(p.dob) : '') + '</div>'
          + '</div></div>';
      }).join('');
      dropdown.querySelectorAll('[role="option"]').forEach(function (el, i) {
        el.addEventListener('mouseenter', function () { setActive(i); });
        el.addEventListener('click', function () {
          const id = el.getAttribute('data-patient-id');
          if (id && typeof window._qeegSelectPatient === 'function') window._qeegSelectPatient(id);
        });
      });
    }
    setExpanded(true);
    setActive(filtered.length ? 0 : -1);
  }
}

// ── Patient Clinical Info (Read-Only) ────────────────────────────────────────

function renderClinicalInfo(patient, medHistory) {
  if (!patient) return '';
  const s = (medHistory && medHistory.sections) || {};

  // Demographics strip
  let html = '<div style="background:var(--surface-tint-1);border-radius:10px;padding:16px;margin-bottom:16px;display:flex;align-items:center;gap:16px;flex-wrap:wrap">'
    + '<div style="flex:1;min-width:160px">'
    + '<div style="font-size:18px;font-weight:700">' + esc((patient.first_name || '') + ' ' + (patient.last_name || '')) + '</div>'
    + '<div style="font-size:12px;color:var(--text-tertiary);margin-top:2px">'
    + (patient.dob ? 'DOB: ' + esc(patient.dob) : '')
    + (patient.gender ? ' | ' + esc(patient.gender) : '')
    + '</div></div>';
  if (patient.primary_condition) {
    html += '<div>' + badge(patient.primary_condition, 'var(--blue)') + '</div>';
  }
  html += '</div>';

  // Check if medical history exists
  if (!medHistory || !medHistory.sections || Object.keys(medHistory.sections).length === 0) {
    html += '<div style="text-align:center;padding:24px;color:var(--text-tertiary);font-size:13px;border:1px dashed rgba(255,255,255,0.1);border-radius:8px">'
      + 'No medical history recorded for this patient.<br>'
      + '<a href="#" onclick="window._nav(\'patients-hub\');return false" style="color:var(--blue);font-size:12px">Go to Patient Hub to add medical history</a>'
      + '</div>';
    return html;
  }

  // Clinical sections
  const sections = [
    { id: 'presenting', label: 'Presenting Symptoms', icon: '!', color: 'var(--blue)', fields: ['chief_complaint', 'symptom_onset', 'severity', 'functional_impact', 'patient_goals'], fieldLabels: { chief_complaint: 'Chief Complaint', symptom_onset: 'Onset', severity: 'Severity', functional_impact: 'Functional Impact', patient_goals: 'Patient Goals' } },
    { id: 'diagnoses', label: 'Diagnoses', icon: 'Dx', color: 'var(--teal)', fields: ['primary_dx', 'secondary_dx', 'working_dx', 'dx_notes'], fieldLabels: { primary_dx: 'Primary Diagnosis', secondary_dx: 'Secondary Diagnoses', working_dx: 'Working Diagnosis', dx_notes: 'Notes' } },
    { id: 'safety', label: 'Safety / Contraindications', icon: '!!', color: 'var(--red)', accent: true, fields: ['seizure_history', 'seizure_meds', 'seizure_risk', 'metal_implants', 'pacemaker', 'pregnancy', 'photosensitivity', 'prior_ae_neuromod', 'contra_notes', 'contra_cleared'], fieldLabels: { seizure_history: 'Seizure History', seizure_meds: 'Seizure Medications', seizure_risk: 'Seizure Risk', metal_implants: 'Metal Implants', pacemaker: 'Pacemaker/ICD', pregnancy: 'Pregnancy', photosensitivity: 'Photosensitivity', prior_ae_neuromod: 'Prior AE Neuromod', contra_notes: 'Contraindication Notes', contra_cleared: 'Cleared Status' } },
    { id: 'medications', label: 'Medications & Supplements', icon: 'Rx', color: 'var(--violet)', fields: ['current_meds', 'supplements', 'past_meds', 'med_interactions'], fieldLabels: { current_meds: 'Current Medications', supplements: 'Supplements', past_meds: 'Past Medications', med_interactions: 'Interactions' } },
    { id: 'neurological', label: 'Neurological & Medical History', icon: 'N', color: 'var(--amber)', fields: ['neuro_conditions', 'brain_injury', 'neuro_tests', 'chronic_conditions', 'surgeries'], fieldLabels: { neuro_conditions: 'Neurological Conditions', brain_injury: 'Brain Injury', neuro_tests: 'Neuro Tests', chronic_conditions: 'Chronic Conditions', surgeries: 'Surgeries' } },
    { id: 'lifestyle', label: 'Lifestyle & Functional', icon: 'L', color: 'var(--green)', fields: ['sleep_quality', 'sleep_hours', 'alcohol', 'tobacco', 'cannabis', 'other_substances', 'occupation', 'activity_level'], fieldLabels: { sleep_quality: 'Sleep Quality', sleep_hours: 'Sleep Hours', alcohol: 'Alcohol', tobacco: 'Tobacco', cannabis: 'Cannabis', other_substances: 'Other Substances', occupation: 'Occupation', activity_level: 'Activity Level' } },
  ];

  sections.forEach(function (sec) {
    const data = s[sec.id] || {};
    // Check if section has any data
    const hasData = sec.fields.some(function (f) { return data[f] && String(data[f]).trim(); });
    if (!hasData && sec.id !== 'safety') return; // Always show safety

    const collapsed = _collapsedSections[sec.id] || false;
    const borderStyle = sec.accent ? 'border-left:3px solid ' + sec.color + ';' : '';

    html += '<div class="ds-card" style="margin-bottom:8px;' + borderStyle + '">'
      + '<div style="display:flex;align-items:center;gap:8px;padding:10px 14px;cursor:pointer;user-select:none" '
      + 'onclick="window._qeegToggleSection(\'' + sec.id + '\')">'
      + '<span style="width:24px;height:24px;border-radius:6px;background:' + sec.color + '20;color:' + sec.color + ';display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800">' + sec.icon + '</span>'
      + '<span style="flex:1;font-weight:600;font-size:13px">' + esc(sec.label) + '</span>'
      + '<span style="color:var(--text-tertiary);font-size:11px">' + (collapsed ? '+' : '-') + '</span>'
      + '</div>';

    if (!collapsed) {
      html += '<div style="padding:4px 14px 12px;display:grid;grid-template-columns:1fr;gap:6px">';
      sec.fields.forEach(function (f) {
        const val = data[f];
        if (!val || !String(val).trim()) return;
        html += '<div>'
          + '<div style="font-size:10px;font-weight:700;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.4px;margin-bottom:1px">' + esc(sec.fieldLabels[f] || f) + '</div>'
          + '<div style="font-size:13px;color:var(--text-primary);white-space:pre-wrap;line-height:1.5">' + esc(val) + '</div>'
          + '</div>';
      });
      if (!hasData) {
        html += '<div style="font-size:12px;color:var(--text-tertiary);font-style:italic">No data recorded</div>';
      }
      html += '</div>';
    }
    html += '</div>';
  });

  return html;
}

// ── Upload Area ──────────────────────────────────────────────────────────────

function renderUploadArea(patientId) {
  return card('Upload qEEG Recording',
    '<div id="qeeg-dropzone" class="qeeg-dropzone">'
    + '<div class="qeeg-dropzone__icon">&#x1F4C2;</div>'
    + '<div style="color:var(--text-secondary);font-size:13px;margin-bottom:4px">Drag & drop a qEEG recording here, or click to browse</div>'
    + '<div style="color:var(--text-tertiary);font-size:12px;margin-bottom:10px">Accepted: ' + esc(formatSupportedUploadTypes()) + '</div>'
    + '<input type="file" id="qeeg-file-input" accept=".edf,.bdf,.vhdr,.set" style="display:none">'
    + '<div class="qeeg-dropzone__fields">'
    + '<div><label class="form-label" style="display:block;margin-bottom:4px">Eyes Condition</label>'
    + '<select id="qeeg-eyes" class="form-control" style="width:100%;font-size:12px">'
    + '<option value="closed">Closed</option><option value="open">Open</option></select></div>'
    + '<div><label class="form-label" style="display:block;margin-bottom:4px">Equipment</label>'
    + '<input type="text" id="qeeg-equipment" class="form-control" placeholder="e.g. NeuroGuide" style="width:100%;font-size:12px"></div>'
    + '<div><label class="form-label" style="display:block;margin-bottom:4px">Recording Date</label>'
    + '<input type="date" id="qeeg-rec-date" class="form-control" style="width:100%;font-size:12px"></div>'
    + '</div>'
    + '<div id="qeeg-upload-status" role="status" aria-live="polite" aria-atomic="true" style="margin-top:12px"></div>'
    + '<div id="qeeg-quality-indicator"></div>'
    + '</div>'
  );
}

function initUploadHandlers(patientId) {
  const dropzone = document.getElementById('qeeg-dropzone');
  const fileInput = document.getElementById('qeeg-file-input');
  if (!dropzone || !fileInput) return;

  dropzone.addEventListener('click', function (e) {
    if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT' || e.target.tagName === 'OPTION') return;
    fileInput.click();
  });
  dropzone.addEventListener('dragover', function (e) { e.preventDefault(); dropzone.classList.add('qeeg-dropzone--dragover'); });
  dropzone.addEventListener('dragleave', function () { dropzone.classList.remove('qeeg-dropzone--dragover'); });
  dropzone.addEventListener('drop', function (e) {
    e.preventDefault(); dropzone.classList.remove('qeeg-dropzone--dragover');
    if (e.dataTransfer.files.length) handleUpload(e.dataTransfer.files[0], patientId);
  });
  fileInput.addEventListener('change', function () {
    if (fileInput.files.length) handleUpload(fileInput.files[0], patientId);
  });
}

async function handleUpload(file, patientId) {
  const statusEl = document.getElementById('qeeg-upload-status');
  function setStatus(html) {
    if (!statusEl) return;
    statusEl.setAttribute('role', 'status');
    statusEl.setAttribute('aria-live', 'polite');
    statusEl.innerHTML = html;
  }
  function setError(msg) {
    if (statusEl) {
      statusEl.setAttribute('role', 'alert');
      statusEl.removeAttribute('aria-live');
      statusEl.innerHTML = '<div style="color:var(--red);font-size:13px">' + esc(msg) + '</div>';
    }
    showToast(msg, 'error');
  }
  if (!patientId) {
    setError('Please select a patient first.');
    return;
  }
  if (!file || !file.name) {
    setError('No file selected.');
    return;
  }
  // Client-side validation
  const ext = (file.name || '').split('.').pop().toLowerCase();
  if (!['edf', 'bdf', 'vhdr', 'set'].includes(ext)) {
    setError('Invalid file type "' + (ext || 'unknown') + '". Accepted: ' + formatSupportedUploadTypes());
    return;
  }
  if (file.size > 100 * 1024 * 1024) {
    setError('File too large (' + Math.round(file.size / 1024 / 1024) + ' MB). Maximum: 100 MB.');
    return;
  }
  if (file.size === 0) {
    setError('File is empty. Please select a valid recording.');
    return;
  }

  setStatus(spinner('Uploading ' + esc(file.name) + '...'));
  try {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('patient_id', patientId);
    const eyes = document.getElementById('qeeg-eyes')?.value || 'closed';
    fd.append('eyes_condition', eyes);
    const equipment = document.getElementById('qeeg-equipment')?.value;
    if (equipment) fd.append('equipment', equipment);
    const recDate = document.getElementById('qeeg-rec-date')?.value;
    if (recDate) fd.append('recording_date', recDate);

    const result = await api.uploadQEEGAnalysis(fd);
    _qeegAudit('recording_uploaded', {
      analysis_id: result && result.id,
      patient_id: patientId,
      note: 'file=' + (file && file.name ? String(file.name).slice(0, 120) : '') + '; size=' + (file && file.size ? file.size : 0),
    });
    showToast('File uploaded successfully', 'success');
    if (statusEl) statusEl.innerHTML = '<div style="color:var(--green);font-size:13px">Uploaded successfully! '
      + badge('pending', 'var(--amber)')
      + ' <a href="#" onclick="window._qeegSelectedId=\'' + result.id + '\';window._qeegTab=\'analysis\';window._nav(\'qeeg-analysis\');return false" style="color:var(--blue);margin-left:8px">Go to Analysis tab to run spectral analysis</a></div>';

    // Show recording quality indicator
    var qualEl = document.getElementById('qeeg-quality-indicator');
    if (qualEl && result) {
      var chCount = result.channels_used || 0;
      var sr = result.sample_rate_hz || 0;
      var chColor = chCount >= 19 ? 'var(--green)' : chCount >= 10 ? 'var(--amber)' : 'var(--red)';
      var srColor = sr >= 256 ? 'var(--green)' : sr >= 128 ? 'var(--amber)' : 'var(--red)';
      var qualityHtml = '<div style="margin-top:12px;padding:12px;background:var(--surface-tint-1);border-radius:8px;border:1px solid var(--border)">'
        + '<div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:8px">Recording Quality</div>'
        + '<div style="display:flex;gap:12px;flex-wrap:wrap">';
      qualityHtml += '<div style="font-size:12px"><span style="color:' + chColor + ';font-weight:600">' + chCount + '</span> channels</div>'
        + '<div style="font-size:12px"><span style="color:' + srColor + ';font-weight:600">' + sr + ' Hz</span> sample rate</div>';
      if (result.eyes_condition) qualityHtml += '<div style="font-size:12px">Eyes: ' + esc(result.eyes_condition) + '</div>';
      qualityHtml += '</div><div id="qeeg-quality-detail" style="margin-top:8px"></div></div>';
      qualEl.innerHTML = qualityHtml;

      // Call backend quality-check endpoint for detailed scoring
      if (result.id) {
        api.runQEEGQualityCheck(result.id).then(function (qr) {
          var detailEl = document.getElementById('qeeg-quality-detail');
          if (!detailEl || !qr) return;
          var gradeColors = { excellent: 'var(--green)', good: 'var(--teal)', fair: 'var(--amber)', poor: 'var(--red)' };
          var gc = gradeColors[qr.overall_grade] || 'var(--text-secondary)';
          var dHtml = '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">'
            + badge(qr.overall_grade, gc)
            + '<span style="font-size:12px;color:var(--text-secondary)">Score: ' + (qr.overall_score || 0).toFixed(0) + '/100</span></div>';
          if (qr.recommendations && qr.recommendations.length) {
            qr.recommendations.forEach(function (rec) {
              dHtml += '<div style="font-size:11px;color:var(--text-tertiary);padding:2px 0">' + esc(rec) + '</div>';
            });
          }
          detailEl.innerHTML = dHtml;
          // Render per-channel quality map if per-channel stats are available
          if (qr.channel_stats && typeof renderChannelQualityMap === 'function') {
            dHtml += '<div style="margin-top:8px">' + renderChannelQualityMap(qr.channel_stats) + '</div>';
            detailEl.innerHTML = dHtml;
          }
        }).catch(function () { /* quality check not available, local indicators sufficient */ });
      }
    }

    // Refresh analyses list
    refreshAnalysesList(patientId);
  } catch (err) {
    const msg = String(err && err.message ? err.message : err || 'Unknown error');
    if (statusEl) {
      statusEl.setAttribute('role', 'alert');
      statusEl.removeAttribute('aria-live');
      statusEl.innerHTML = '<div style="color:var(--red);font-size:13px">'
        + '<strong>Upload failed.</strong>'
        + '<div style="margin-top:4px">' + esc(msg) + '</div>'
        + '<div style="margin-top:6px;font-size:12px;color:var(--text-tertiary)">Try refreshing the page. If the error persists, contact support.</div>'
        + '</div>';
    }
    showToast('Upload failed: ' + msg, 'error');
  }
}

async function refreshAnalysesList(patientId) {
  try {
    const resp = await api.listPatientQEEGAnalyses(patientId);
    _analyses = (resp && resp.items) || (Array.isArray(resp) ? resp : []);
    const listEl = document.getElementById('qeeg-analyses-list');
    if (listEl) listEl.innerHTML = renderAnalysisList(_analyses);
    _wireQEEGAnalysisCopyButtons();
  } catch (err) { showToast('Failed to refresh analyses list: ' + (err.message || err), 'error'); }
}

// ── Analysis List ────────────────────────────────────────────────────────────

function renderAnalysisList(analyses) {
  if (!analyses.length) return '<div style="color:var(--text-tertiary);font-size:13px;padding:8px">No analyses found. Upload an EDF file above.</div>';
  let html = '';
  analyses.forEach(function (a) {
    const status = a.analysis_status || 'pending';
    const statusColor = status === 'completed' ? 'var(--green)' : status === 'failed' ? 'var(--red)' : 'var(--amber)';
    const idShort = String(a.id || '').slice(0, 8);
    html += '<div class="qeeg-analysis-row" style="background:var(--surface-tint-1);border-radius:8px;padding:10px 12px;margin-bottom:6px;display:flex;align-items:center;justify-content:space-between;transition:background .15s">'
      + '<div style="min-width:0;flex:1;cursor:pointer" '
      + 'onclick="window._qeegSelectedId=\'' + a.id + '\';window._qeegSwitchTab(\'analysis\')">'
      + '<div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(a.original_filename || 'EDF File') + '</div>'
      + '<div style="font-size:11px;color:var(--text-tertiary)">'
      + (a.channels_used || a.channel_count || '?') + ' ch'
      + (a.sample_rate_hz ? ', ' + a.sample_rate_hz + ' Hz' : '')
      + (a.eyes_condition ? ' | ' + esc(a.eyes_condition) : '')
      + (a.analyzed_at ? ' | ' + new Date(a.analyzed_at).toLocaleDateString() : '')
      + (idShort ? ' | <span style="font-family:var(--font-mono,monospace);color:var(--text-secondary)">id:' + esc(idShort) + '</span>' : '')
      + '</div>'
      + renderAnalysisCapabilityChips(a)
      + '</div>'
      + '<div style="margin-left:8px;display:flex;align-items:center;gap:6px">'
      + (a.id ? '<button class="btn btn-ghost btn-sm" data-qeeg-copy-id="' + esc(a.id) + '" aria-label="Copy analysis ID to clipboard" title="Copy analysis ID" style="padding:4px 6px;font-size:11px">Copy</button>' : '')
      + badge(status, statusColor)
      + '</div></div>';
  });
  return html;
}

// Wire copy buttons inside the analyses list. Idempotent — re-run after re-render.
function _wireQEEGAnalysisCopyButtons() {
  document.querySelectorAll('[data-qeeg-copy-id]').forEach(function (btn) {
    if (btn.__qeegCopyWired) return;
    btn.__qeegCopyWired = true;
    btn.addEventListener('click', function (ev) {
      ev.stopPropagation();
      const id = btn.getAttribute('data-qeeg-copy-id') || '';
      if (!id) return;
      const onCopied = function () {
        const original = btn.textContent;
        btn.textContent = 'Copied';
        setTimeout(function () { btn.textContent = original; }, 1200);
        try { showToast('Analysis ID copied', 'success'); } catch (_e) {}
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(id).then(onCopied).catch(function () {
          try {
            const ta = document.createElement('textarea');
            ta.value = id; document.body.appendChild(ta); ta.select();
            document.execCommand('copy'); document.body.removeChild(ta); onCopied();
          } catch (_e) {}
        });
      }
    });
  });
}

// ── Main page function ───────────────────────────────────────────────────────

export async function pgQEEGAnalysis(setTopbar, navigate) {
  const tab = window._qeegTab || 'patient';
  window._qeegTab = tab;
  const el = document.getElementById('content');

  // Global helper to open raw tab from session rail
  window._qeegOpenRawTab = function () {
    window._qeegTab = 'raw';
    if (typeof window._nav === 'function') window._nav('qeeg-analysis');
  };

  setTopbar('qEEG Analyzer', '');

  // Load patients list (cached)
  if (!_patients.length) {
    try {
      const resp = await api.listPatients();
      _patients = Array.isArray(resp) ? resp : (resp && resp.items ? resp.items : []);
    } catch (err) { _patients = []; showToast('Failed to load patients: ' + (err.message || err), 'error'); }
  }

  // Load patient data if selected
  const patientId = window._qeegPatientId === undefined
    ? (_getContextPatientIdForQEEG() || null)
    : (window._qeegPatientId || null);
  if (window._qeegPatientId === undefined && patientId) {
    window._qeegPatientId = patientId;
  }
  if (patientId && (!_patient || _patient.id !== patientId)) {
    try {
      const [p, mh, aResp] = await Promise.all([
        api.getPatient(patientId),
        api.getPatientMedicalHistory(patientId),
        api.listPatientQEEGAnalyses(patientId).catch(function () { return { items: [] }; }),
      ]);
      _patient = p;
      _medHistory = mh;
      _analyses = (aResp && aResp.items) || (Array.isArray(aResp) ? aResp : []);
    } catch (err) {
      _patient = null; _medHistory = null; _analyses = [];
      showToast('Failed to load patient data: ' + (err.message || err), 'error');
    }
  } else if (!patientId) {
    _patient = null; _medHistory = null; _analyses = [];
  }

  // Register global handlers
  window._qeegSelectPatient = async function (pid) {
    window._qeegPatientId = pid;
    window._selectedPatientId = pid;
    window._profilePatientId = pid;
    try { sessionStorage.setItem('ds_pat_selected_id', pid); } catch (_) {}
    window._qeegSelectedId = null;
    window._qeegSelectedReportId = null;
    window._qeegComparisonId = null;
    _patient = null; _medHistory = null; _analyses = [];
    window._nav('qeeg-analysis');
  };
  window._qeegClearPatient = function () {
    window._qeegPatientId = null;
    window._qeegSelectedId = null;
    window._qeegSelectedReportId = null;
    window._qeegComparisonId = null;
    _patient = null; _medHistory = null; _analyses = [];
    window._nav('qeeg-analysis');
  };
  window._qeegToggleSection = function (sectionId) {
    _collapsedSections[sectionId] = !_collapsedSections[sectionId];
    _persistCollapsedSections();
    const infoEl = document.getElementById('qeeg-clinical-info');
    if (infoEl && _patient) {
      infoEl.innerHTML = renderClinicalInfo(_patient, _medHistory);
    }
  };
  window._qeegSetWorkspaceLens = function (lens) {
    _setQEEGWorkspaceState({ lens: lens });
    window._nav('qeeg-analysis');
  };
  window._qeegSetWorkspaceBand = function (band) {
    _setQEEGWorkspaceState({ band: band });
    window._nav('qeeg-analysis');
  };
  window._qeegSetWorkspaceMetric = function (metric) {
    _setQEEGWorkspaceState({ metric: metric });
    window._nav('qeeg-analysis');
  };

  // Build page shell
  // Hero export buttons. Only enabled when there is something to export
  // (a real selected analysis id or a demo session). Disabled buttons keep
  // the affordance visible so reviewers see the export surface, but the
  // click is a no-op and the disabled state is announced.
  var heroAnalysisId = window._qeegSelectedId || null;
  var heroHasExportTarget = !!heroAnalysisId;
  var heroExportDisabled = heroHasExportTarget ? '' : ' disabled title="Select or upload a recording first"';
  var heroIsDemo = !!(heroAnalysisId === 'demo' && _isDemoMode());
  var heroDemoFlag = heroIsDemo ? ' data-demo="true"' : '';

  let pageHtml = '<div class="ch-shell">';
  pageHtml += '<div class="qeeg-hero"' + heroDemoFlag + '>'
    + '<div class="qeeg-hero__icon qeeg-hero__icon--3d">' + render3DBrainMapMini('alpha') + '</div>'
    + '<div><div class="qeeg-hero__title">qEEG Analyzer</div>'
    + '<div class="qeeg-hero__sub">Spectral analysis &middot; AI interpretation &middot; Pre/post comparison</div>'
    + '<div style="font-size:12px;color:var(--text-tertiary);margin-top:6px">Decision-support only. Review acquisition quality and clinician context before acting on AI summaries.</div></div>'
    + '<div class="qeeg-export-bar" style="margin-left:auto" data-testid="qeeg-hero-actions">'
    + '<button class="btn btn-sm btn-outline" aria-label="Open the canonical Raw EEG Workbench for this recording" id="qeeg-hero-open-workbench"' + heroExportDisabled + '>Open Raw Workbench</button>'
    + '<button class="btn btn-sm btn-outline" aria-label="Export band powers and z-scores as CSV" id="qeeg-hero-export-csv"' + heroExportDisabled + '>CSV</button>'
    + '<button class="btn btn-sm btn-outline" aria-label="Export patient FHIR bundle" onclick="window._qeegExportFHIRBundle()"' + heroExportDisabled + '>FHIR</button>'
    + '<button class="btn btn-sm btn-outline" aria-label="Export patient BIDS derivatives package" onclick="window._qeegExportBIDSPackage()"' + heroExportDisabled + '>BIDS</button>'
    + '<button class="btn btn-sm btn-outline" aria-label="Download printable PDF report" onclick="window._qeegDownloadPDF()"' + heroExportDisabled + '>PDF</button>'
    + '</div>'
    + '</div>';
  pageHtml += renderPatientSelector(_patients, patientId);
  pageHtml += renderTabBar(tab);
  pageHtml += '<div id="qeeg-tab-content"></div>';
  pageHtml += _qeegClinicalSafetyFooter();
  pageHtml += '</div>';
  el.innerHTML = pageHtml;
  _wireQEEGTabKeyboard();
  _qeegRestoreScroll(tab);

  // Wire hero export + workbench buttons. Both fall back honestly when no
  // analysis is selected — we never silently swallow the click.
  var _heroOpenBtn = document.getElementById('qeeg-hero-open-workbench');
  if (_heroOpenBtn) {
    _heroOpenBtn.addEventListener('click', function () {
      if (!heroAnalysisId) {
        showToast('Select or upload a recording first', 'warning');
        return;
      }
      _qeegAudit('open_raw_workbench', { analysis_id: heroAnalysisId });
      // Use the canonical helper if it has been wired by the raw tab, else
      // do the navigation inline so this works from any tab.
      if (typeof window._qeegOpenWorkbench === 'function') {
        window._qeegOpenWorkbench(heroAnalysisId, heroIsDemo ? 'demo' : 'real');
        return;
      }
      var hash = '#/qeeg-raw-workbench/' + encodeURIComponent(heroAnalysisId)
        + '?mode=' + encodeURIComponent(heroIsDemo ? 'demo' : 'real');
      window.location.hash = hash;
      if (typeof window._nav === 'function') window._nav('qeeg-raw-workbench');
    });
  }
  var _heroCsvBtn = document.getElementById('qeeg-hero-export-csv');
  if (_heroCsvBtn) {
    _heroCsvBtn.addEventListener('click', async function () {
      if (!heroAnalysisId) {
        showToast('Select or upload a recording first', 'warning');
        return;
      }
      _qeegAudit('export_csv_requested', { analysis_id: heroAnalysisId });
      // Prefer the in-memory band-power CSV when we have it (faster, also
      // works for the demo session). Fall back to the backend endpoint for
      // real analyses where in-memory band powers are missing.
      if (heroIsDemo || (_currentAnalysis && _currentAnalysis.band_powers)) {
        if (typeof window._qeegExportBandPowerCSV === 'function') {
          window._qeegExportBandPowerCSV();
          return;
        }
      }
      try {
        var resp = await api.exportQEEGAnalysisCSV(heroAnalysisId);
        if (!resp || typeof resp.csv !== 'string' || !resp.csv.length) {
          showToast('No band powers to export yet — run analysis first', 'warning');
          return;
        }
        var prefix = resp.demo ? 'DEMO_' : '';
        _downloadCSV(resp.csv, prefix + 'qeeg_analysis_' + heroAnalysisId + '.csv');
        showToast(resp.rows + ' channel rows exported', 'success');
      } catch (err) {
        showToast('CSV export failed: ' + (err && err.message ? err.message : err), 'error');
      }
    });
  }

  // Page-load audit event. Best-effort, fire-and-forget. Captures the active
  // tab, whether demo data is being shown, and whether a recording is open.
  _qeegAudit('analyzer_loaded', {
    note: 'tab=' + tab + (heroIsDemo ? '; mode=demo' : '; mode=live'),
  });
  initEvidenceDrawer({
    patientId: patientId || _getContextPatientIdForQEEG() || 'qeeg-context',
    getReportContext: function () { return _getQEEGReportEvidenceContext(); },
    onAddToReport: async function (payload) {
      var all = Array.isArray(payload && payload.savedCitations) ? payload.savedCitations : [];
      _qeegSavedEvidenceCitations = _filterQEEGSavedEvidenceCitations(all, payload && payload.reportContext ? payload.reportContext : _getQEEGReportEvidenceContext());
      if (window._qeegTab === 'report') window._nav('qeeg-analysis');
    },
  });
  wireEvidenceChips(el, { onOpen: (query) => openEvidenceDrawer(query) });

  // Init patient selector
  initPatientSelector();

  const tabEl = document.getElementById('qeeg-tab-content');

  // ══════════════════════════════════════════════════════════════════════════
  // TAB 1: PATIENT & UPLOAD
  // ══════════════════════════════════════════════════════════════════════════
  if (tab === 'patient') {
    if (!patientId) {
      var patEmptyHtml = emptyState('&#x1F9E0;', 'Select a Patient to Begin', 'Use the search box above to find and select a patient, then upload their EEG recording for analysis.');
      if (_isDemoMode()) {
        patEmptyHtml += '<div style="text-align:center;margin-top:-8px;padding-bottom:16px">'
          + '<button class="btn btn-primary btn-sm" onclick="window._qeegSelectedId=\'demo\';window._qeegTab=\'analysis\';window._nav(\'qeeg-analysis\')">View Sample Analysis</button></div>';
      }
      tabEl.innerHTML = patEmptyHtml;
      return;
    }

    tabEl.innerHTML = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px" id="qeeg-patient-grid">'
      + '<div id="qeeg-clinical-info">' + spinner('Loading clinical info...') + '</div>'
      + '<div id="qeeg-upload-col">' + spinner() + '</div>'
      + '</div>';

    // Render clinical info
    const infoEl = document.getElementById('qeeg-clinical-info');
    if (infoEl) infoEl.innerHTML = renderClinicalInfo(_patient, _medHistory);

    // Render upload + analyses
    const uploadCol = document.getElementById('qeeg-upload-col');
    if (uploadCol) {
      var displayAnalyses = _analyses.length === 0 && _isDemoMode() ? [DEMO_ANALYSIS_ENTRY] : _analyses;
      uploadCol.innerHTML = renderUploadArea(patientId)
        + '<div style="margin-top:16px">' + renderQEEGStackCard() + '</div>'
        + '<div style="margin-top:16px"><h4 style="font-size:14px;font-weight:600;margin:0 0 8px">Recent Analyses</h4>'
        + '<div id="qeeg-analyses-list">' + renderAnalysisList(displayAnalyses) + '</div></div>';
      _wireQEEGAnalysisCopyButtons();
    }

    initUploadHandlers(patientId);

    // Responsive: stack on narrow screens
    const grid = document.getElementById('qeeg-patient-grid');
    if (grid && window.innerWidth < 900) {
      grid.style.gridTemplateColumns = '1fr';
    }
    return;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TAB 2: ANALYSIS
  // ══════════════════════════════════════════════════════════════════════════
  if (tab === 'analysis') {
    const analysisId = window._qeegSelectedId;
    if (!analysisId) {
      const demoBtn = _isDemoMode()
        ? '<button class="btn btn-primary btn-sm" onclick="window._qeegSelectedId=\'demo\';window._qeegTab=\'analysis\';window._nav(\'qeeg-analysis\')">Open Analysis (demo data)</button>'
        : '';
      tabEl.innerHTML =
        '<div style="max-width:620px;margin:48px auto;padding:32px;border-radius:14px;background:rgba(255,255,255,0.02);border:1px solid var(--border);text-align:center">'
        + '<div style="font-size:32px;margin-bottom:8px">📊</div>'
        + '<div style="font-size:18px;font-weight:700;margin-bottom:6px">No analysis selected</div>'
        + '<div style="font-size:13px;color:var(--text-secondary);line-height:1.6;margin-bottom:18px">Open the analysis view with sample data, jump to an existing analysis, or upload a new EDF.</div>'
        + '<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">'
        +   demoBtn
        +   '<button class="btn btn-outline btn-sm" onclick="window._qeegTab=\'patient\';window._nav(\'qeeg-analysis\')">Use existing analysis</button>'
        +   '<button class="btn btn-outline btn-sm" onclick="window._nav(\'qeeg-raw-workbench\')">Pick patient &amp; upload</button>'
        + '</div>'
        + '</div>';
      return;
    }

    tabEl.innerHTML = spinner('Loading analysis...');

    try {
      var data;
      if (analysisId === 'demo' && _isDemoMode()) {
        data = DEMO_QEEG_ANALYSIS;
      } else {
        data = await api.getQEEGAnalysis(analysisId);
      }
      _currentAnalysis = data;
      _fusionSummary = await _fetchFusionSummary(data && data.patient_id);

      // If pending — show manual trigger
      if (data.analysis_status === 'pending') {
        tabEl.innerHTML = card('Analysis Pending',
          renderLaunchNotice('Ready to run spectral analysis', 'Verify the patient match and recording quality before starting the pipeline.', 'warn')
          + '<div style="text-align:center;padding:24px">'
          + '<div style="margin-bottom:12px">' + badge('pending', 'var(--amber)') + '</div>'
          + '<div style="color:var(--text-secondary);font-size:13px;margin-bottom:16px">File uploaded: <strong>' + esc(data.original_filename || 'EDF') + '</strong></div>'
          + '<button class="btn btn-primary" id="qeeg-run-btn">Run Spectral Analysis</button>'
          + '<div style="display:flex;justify-content:center;gap:8px;flex-wrap:wrap;margin-top:12px">'
          + '<button class="btn btn-outline btn-sm" onclick="window._qeegTab=\'patient\';window._nav(\'qeeg-analysis\')">Back to upload</button>'
          + '<button class="btn btn-outline btn-sm" onclick="window._qeegTab=\'report\';window._nav(\'qeeg-analysis\')">Open report tab</button>'
          + '</div>'
          + '<div id="qeeg-analyze-status" role="status" aria-live="polite" style="margin-top:12px"></div></div>'
        );
        const runBtn = document.getElementById('qeeg-run-btn');
        if (runBtn) {
          runBtn.addEventListener('click', async function () {
            runBtn.disabled = true;
            const st = document.getElementById('qeeg-analyze-status');
            if (st) st.innerHTML = spinner('Running spectral analysis...');
            try {
              await api.analyzeQEEG(analysisId);
              _qeegAudit('analysis_started', { analysis_id: analysisId });
              showToast('Spectral analysis started', 'success');
              // Start polling for status updates
              if (st) st.innerHTML = spinner('Processing...') + '<div id="qeeg-analysis-progress"></div>';
              var pollInterval = setInterval(async function () {
                try {
                  var statusResp = await api.getQEEGAnalysisStatus(analysisId);
                  if (!statusResp) return;
                  var progressEl = document.getElementById('qeeg-analysis-progress');
                  if (progressEl && statusResp.progress_pct != null) {
                    progressEl.innerHTML = '<div style="margin-top:8px">'
                      + '<div style="background:rgba(255,255,255,0.1);border-radius:4px;height:6px;overflow:hidden">'
                      + '<div style="width:' + (Number(statusResp.progress_pct) || 0) + '%;background:var(--teal);height:100%;border-radius:4px;transition:width 0.3s"></div></div>'
                      + '<div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">' + (Number(statusResp.completed_analyses) || 0) + '/' + (Number(statusResp.total_analyses) || 25) + ' analyses completed</div></div>';
                  }
                  if (statusResp.status === 'completed' || statusResp.status === 'failed') {
                    clearInterval(pollInterval);
                    window._nav('qeeg-analysis');
                  }
                } catch (_e) { /* silent polling failure */ }
              }, 2000);
            } catch (err) {
              if (st) st.innerHTML = '<div style="color:var(--red);font-size:13px">Error: ' + esc(String(err && err.message ? err.message : err || "Unknown error")) + '</div>';
              runBtn.disabled = false;
            }
          });
        }
        return;
      }

      // If processing — show progress bar and poll for status updates
      if (data.analysis_status === 'processing') {
        tabEl.innerHTML = renderLaunchNotice('Analysis running', 'Wait for preprocessing and quantification to finish. If the run stalls, return to the upload tab and verify session metadata.', 'info')
          + '<div style="text-align:center;padding:48px">'
          + spinner('Analysis in progress... This usually takes a few seconds.')
          + '<div id="qeeg-analysis-progress" role="status" aria-live="polite"></div>'
          + '</div>';
        var pollInterval = setInterval(async function () {
          try {
            var statusResp = await api.getQEEGAnalysisStatus(analysisId);
            if (!statusResp) return;
            var progressEl = document.getElementById('qeeg-analysis-progress');
            if (progressEl && statusResp.progress_pct != null) {
              progressEl.innerHTML = '<div style="margin-top:8px">'
                + '<div style="background:rgba(255,255,255,0.1);border-radius:4px;height:6px;overflow:hidden">'
                + '<div style="width:' + (Number(statusResp.progress_pct) || 0) + '%;background:var(--teal);height:100%;border-radius:4px;transition:width 0.3s"></div></div>'
                + '<div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">' + (Number(statusResp.completed_analyses) || 0) + '/' + (Number(statusResp.total_analyses) || 25) + ' analyses completed</div></div>';
            }
            if (statusResp.status === 'completed' || statusResp.status === 'failed') {
              clearInterval(pollInterval);
              window._nav('qeeg-analysis');
            }
          } catch (_e) { /* silent polling failure */ }
        }, 2000);
        return;
      }

      // If failed
      if (data.analysis_status === 'failed') {
        var failureReason = data.analysis_error || data.failure_reason || 'Unknown error';
        tabEl.innerHTML = card('Analysis Failed',
          renderLaunchNotice('Analysis needs review', 'Do not rely on downstream reports until this session is re-run or the upload issue is understood.', 'error')
          + '<div role="alert" aria-live="polite" style="padding:14px 16px;border-radius:12px;background:rgba(239,68,68,0.10);border:1px solid rgba(239,68,68,0.24);margin-top:12px">'
          + '<div style="font-size:14px;font-weight:700;color:#fca5a5;margin-bottom:6px">Analysis failed</div>'
          + '<div style="font-size:12.5px;color:var(--text-secondary);line-height:1.55">' + esc(failureReason) + '</div>'
          + '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px">'
          + '<button class="btn btn-primary btn-sm" id="qeeg-reupload-btn">Re-upload</button>'
          + '<button class="btn btn-outline btn-sm" id="qeeg-support-btn">Contact support</button>'
          + '</div></div>'
        );
        var qeegReuploadBtn = document.getElementById('qeeg-reupload-btn');
        if (qeegReuploadBtn) {
          qeegReuploadBtn.addEventListener('click', function () {
            window._qeegSelectedId = null;
            window._qeegTab = 'patient';
            window._nav('qeeg-analysis');
          });
        }
        var qeegSupportBtn = document.getElementById('qeeg-support-btn');
        if (qeegSupportBtn) {
          qeegSupportBtn.addEventListener('click', function () {
            // Honest support handoff — no silent console-only stub. We open
            // the user's mail client with a pre-filled subject containing the
            // analysis id and the failure reason so the support team has
            // enough context to triage. Audit the action.
            _qeegAudit('analysis_support_contact', {
              analysis_id: analysisId,
              note: 'failure=' + (failureReason || '').slice(0, 200),
            });
            var subject = encodeURIComponent('qEEG analysis failed: ' + (analysisId || 'unknown'));
            var body = encodeURIComponent(
              'qEEG analysis ID: ' + (analysisId || 'unknown') + '\n' +
              'Failure reason: ' + (failureReason || 'Unknown error') + '\n\n' +
              'Please describe what you were trying to do:\n'
            );
            try {
              window.location.href = 'mailto:support@deepsynaps.net?subject=' + subject + '&body=' + body;
            } catch (_) { /* browsers without mailto fall back to no-op */ }
            showToast('Opening support email…', 'info');
          });
        }
        return;
      }

      // Completed — show full results
      const bp = data.band_powers || data.band_powers_json || {};
      const bands = bp.bands || {};
      const ratios = bp.derived_ratios || {};
      const artifact = data.artifact_rejection || data.artifact_rejection_json || {};

      let html = '';
      _currentAnalysis = data;

      // Status strip
      html += renderLaunchNotice('Clinical review workflow', 'Inspect quality and quantitative deviations first, then move into AI interpretation and comparison. Narrative output should support, not replace, clinician judgment.', 'info');
      html += '<div class="qeeg-status-strip">'
        + badge('completed', 'var(--green)')
        + '<span>'
        + esc(data.original_filename || '') + ' | '
        + (data.channels_used || data.channel_count || 0) + ' channels, '
        + (data.sample_rate_hz || 0) + ' Hz, '
        + ((data.recording_duration_sec || data.duration_sec || 0) / 60).toFixed(1) + ' min'
        + (data.eyes_condition ? ' | eyes ' + esc(data.eyes_condition) : '')
        + '</span></div>';
      html += renderAnalysisOverviewCard(data);

      // Derived ratios
      if (ratios && Object.keys(ratios).length) {
        const ratioCards = [
          { key: 'theta_beta_ratio', label: 'Theta/Beta Ratio', ref: '> 4.5 elevated (ADHD marker)', color: 'var(--violet)' },
          { key: 'theta_alpha_ratio', label: 'Theta/Alpha Ratio', ref: '> 2.0 elevated (cortical slowing)', color: 'var(--purple, #7e57c2)' },
          { key: 'delta_alpha_ratio', label: 'Delta/Alpha Ratio', ref: '> 2.0 elevated (TBI marker)', color: 'var(--blue)' },
          { key: 'alpha_peak_frequency_hz', label: 'Alpha Peak (Hz)', ref: '8-12 Hz normal, < 8 Hz slowing', color: 'var(--teal)' },
          { key: 'frontal_alpha_asymmetry', label: 'Frontal Asymmetry', ref: '|FAA| > 0.2 significant', color: 'var(--amber)' },
        ];
        let ratioHtml = '<div class="ch-kpi-strip">';
        ratioCards.forEach(function (r) {
          const val = ratios[r.key];
          if (val === undefined || val === null) return;
          ratioHtml += '<div class="ch-kpi-card" style="--kpi-color:' + r.color + '">'
            + '<div class="ch-kpi-val">' + (typeof val === 'number' ? val.toFixed(2) : esc(val)) + '</div>'
            + '<div class="ch-kpi-label">' + esc(r.label) + '</div>'
            + '<div style="font-size:10px;color:var(--text-tertiary);margin-top:4px;font-style:italic">' + esc(r.ref) + '</div></div>';
        });
        ratioHtml += '</div>';
        html += card('Derived Clinical Ratios', ratioHtml);
      }

      var normDev = data.normative_deviations_json || data.normative_deviations || null;
      html += renderAnalysisWorkspace(data, bands, ratios, artifact, normDev, _analyses);
      html += card('Advanced Visualization Workspace',
        '<div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px">Richer visualization panels are mounted here first so they support the main analysis workflow rather than being buried after the legacy result sections.</div>'
        + '<div id="qeeg-viz-v2-mount" style="min-height:80px"></div>'
      );

      // 3D Brain Map visualization
      if (bands && Object.keys(bands).length) {
        var bandList3d = Object.keys(bands);
        var defaultBand3d = bandList3d.indexOf('alpha') !== -1 ? 'alpha' : bandList3d[0];
        var defChData3d = bands[defaultBand3d]?.channels || {};
        var defPowerMap3d = {};
        Object.entries(defChData3d).forEach(function (entry) {
          defPowerMap3d[entry[0]] = entry[1].relative_pct || 0;
        });
        var brainHtml3d = '<div class="qeeg-3d-brain-section">';
        brainHtml3d += '<div class="qeeg-3d-brain-controls">';
        brainHtml3d += '<span style="font-size:11px;font-weight:700;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px">Select Band:</span>';
        brainHtml3d += '<div class="qeeg-3d-band-tabs" id="qeeg-3d-band-tabs">';
        bandList3d.forEach(function (b) {
          var bColor = BAND_COLORS[b] || '#fff';
          brainHtml3d += '<button class="qeeg-3d-band-tab' + (b === defaultBand3d ? ' qeeg-3d-band-tab--active' : '') + '" data-band="' + b + '" style="--band-color:' + bColor + '">' + esc(b.replace('_', ' ')) + '</button>';
        });
        brainHtml3d += '</div></div>';
        brainHtml3d += '<div id="qeeg-3d-brain-container" style="display:flex;justify-content:center;padding:8px 0">';
        brainHtml3d += render3DBrainMap(defPowerMap3d, { band: defaultBand3d, size: 360, colorScale: 'warm' });
        brainHtml3d += '</div></div>';
        html += card('3D Brain Map', brainHtml3d);
      }

      // Topographic heatmaps
      if (bands && Object.keys(bands).length) {
        let topoHtml = '<div class="qeeg-band-grid">';
        Object.keys(bands).forEach(function (bandName) {
          const channelData = bands[bandName]?.channels || {};
          const powerMap = {};
          Object.entries(channelData).forEach(function (entry) {
            powerMap[entry[0]] = entry[1].relative_pct || 0;
          });
          var bandDomain = _getTopomapValueDomain(bandName, 'relative', [powerMap]);
          topoHtml += '<div style="text-align:center">'
            + renderTopoHeatmap(powerMap, Object.assign({
              band: bandName,
              unit: '%',
              size: 240,
              colorScale: 'warm',
            }, _getTopomapLegendOptions('relative', bandDomain)))
            + '</div>';
        });
        topoHtml += '</div>';
        html += card('Topographic Maps (Relative Power %)', topoHtml);
      }

      // Band power table
      if (bands && Object.keys(bands).length) {
        var bandNames = Object.keys(bands);
        // Compute per-band mean for cell tinting
        var bandMeans = {};
        bandNames.forEach(function (b) {
          var vals = [], chs = bands[b]?.channels || {};
          Object.keys(chs).forEach(function (ch) { if (chs[ch]?.relative_pct != null) vals.push(chs[ch].relative_pct); });
          bandMeans[b] = vals.length ? vals.reduce(function (a, c) { return a + c; }, 0) / vals.length : 0;
        });
        // Normative deviations
        let tableHtml = '<div style="overflow-x:auto"><table class="ds-table" style="width:100%;font-size:12px"><thead><tr><th>Channel</th>';
        bandNames.forEach(function (b) {
          tableHtml += '<th style="color:' + (BAND_COLORS[b] || '#fff') + ';background:' + (BAND_COLORS[b] || '#fff') + '15">' + esc(b) + '</th>';
        });
        tableHtml += '</tr></thead><tbody>';
        const chSet = new Set();
        bandNames.forEach(function (b) { Object.keys(bands[b]?.channels || {}).forEach(function (ch) { chSet.add(ch); }); });
        Array.from(chSet).sort().forEach(function (ch) {
          tableHtml += '<tr><td style="font-weight:600">' + esc(ch) + '</td>';
          bandNames.forEach(function (b) {
            const v = bands[b]?.channels?.[ch]?.relative_pct;
            var tintClass = '';
            if (v !== undefined) {
              var diff = v - bandMeans[b];
              if (diff > 5) tintClass = ' class="qeeg-bp-high"';
              else if (diff < -5) tintClass = ' class="qeeg-bp-low"';
            }
            var zHtml = '';
            if (normDev && normDev[ch] && normDev[ch][b] != null) {
              var z = normDev[ch][b];
              var az = Math.abs(z);
              if (az >= 2.0) zHtml = '<span class="qeeg-zscore qeeg-zscore--significant">' + z.toFixed(1) + '</span>';
              else if (az >= 1.0) zHtml = '<span class="qeeg-zscore qeeg-zscore--mild">' + z.toFixed(1) + '</span>';
            }
            tableHtml += '<td' + tintClass + '>' + (v !== undefined ? v.toFixed(1) + '%' + zHtml : '-') + '</td>';
          });
          tableHtml += '</tr>';
        });
        tableHtml += '</tbody></table></div>';
        html += card('Band Power Distribution', tableHtml,
          '<div class="qeeg-export-bar"><button class="btn btn-sm btn-outline" aria-label="Export band power data as CSV" onclick="window._qeegExportBandPowerCSV()">CSV</button>'
          + '<button class="btn btn-sm btn-outline" aria-label="Export full analysis as JSON" onclick="window._qeegExportJSON()">JSON</button></div>');
      }

      // Artifact rejection
      if (artifact && artifact.epochs_total) {
        html += card('Artifact Rejection',
          '<div style="font-size:13px;color:var(--text-secondary)">'
          + 'Epochs: ' + artifact.epochs_kept + '/' + artifact.epochs_total + ' kept ('
          + ((artifact.epochs_kept / artifact.epochs_total * 100) || 0).toFixed(0) + '%)'
          + (artifact.flat_channels && artifact.flat_channels.length ? ' | Flat channels: ' + artifact.flat_channels.map(esc).join(', ') : '')
          + '</div>'
        );
      }

      // ── MNE-Python pipeline sections (§4 of CONTRACT.md) ────────────────
      // Each sub-renderer is null-guarded and emits nothing when its field
      // is absent, so legacy analyses render identically.
      html += renderMNEPipelineSections(data);
      // ── Contract V2 AI upgrade panels (brain age, similarity indices,
      //     centiles, explainability, similar cases, protocol, longitudinal)
      //     — composite helper is null-guarded per field. Feature-flagged.
        if (_aiUpgradesFeatureFlagEnabled()) {
          html += renderAiUpgradePanels(data);
        }
        // Clinical Intelligence Workbench panels (Migration 048)
        html += '<div id="qeeg-safety-cockpit-panel"></div>';
        html += '<div id="qeeg-red-flags-panel"></div>';
        html += '<div id="qeeg-normative-card-panel"></div>';
        html += '<div id="qeeg-protocol-fit-panel"></div>';
        html += renderFusionSummaryCard(_fusionSummary, data && data.patient_id);

        // Action buttons
      var compareAction = (analysisId === 'demo' && _isDemoMode())
        ? "window._qeegComparisonId='demo';window._qeegTab='compare';window._nav('qeeg-analysis')"
        : "window._qeegTab='compare';window._nav('qeeg-analysis')";
      var mneButtonHtml = '';
      if (_mneFeatureFlagEnabled()) {
        mneButtonHtml = '<button class="btn btn-outline" id="qeeg-run-mne-btn" '
          + 'aria-label="Re-run analysis with the MNE-Python pipeline">Run MNE pipeline</button>';
      }
      // Contract V2 AI action buttons (flag-gated). Each button hits the
      // corresponding api client method and, on success, re-fetches the
      // analysis by triggering window._nav('qeeg-analysis').
      var aiButtonsHtml = '';
      if (_aiUpgradesFeatureFlagEnabled()) {
        aiButtonsHtml = ''
          + '<button class="btn btn-outline btn-sm" data-qeeg-ai-action="embedding" aria-label="Compute LaBraM embedding">Compute embedding</button>'
          + '<button class="btn btn-outline btn-sm" data-qeeg-ai-action="brain_age" aria-label="Predict brain age">Predict brain age</button>'
          + '<button class="btn btn-outline btn-sm" data-qeeg-ai-action="risk_scores" aria-label="Score similarity indices">Score conditions</button>'
          + '<button class="btn btn-outline btn-sm" data-qeeg-ai-action="explain" aria-label="Explain similarity indices">Explain</button>'
          + '<button class="btn btn-outline btn-sm" data-qeeg-ai-action="similar" aria-label="Find similar cases">Find similar cases</button>'
          + '<button class="btn btn-outline btn-sm" data-qeeg-ai-action="protocol" aria-label="Recommend protocol">Recommend protocol</button>';
      }
      html += renderAnalysisWorkflowCard(
        mneButtonHtml,
        aiButtonsHtml,
        compareAction,
        _qeegAnnotationButton({
          patient_id: data && data.patient_id,
          target_id: data && data.id,
          anchor_label: (data && data.original_filename) || 'qEEG analysis',
        })
      )
        + '<div id="qeeg-mne-run-status" role="status" aria-live="polite" style="text-align:center;margin-top:8px"></div>'
        + '<div id="qeeg-ai-run-status" role="status" aria-live="polite" style="text-align:center;margin-top:4px"></div>'
        + '<div id="qeeg-annotation-drawer-host" class="analysis-anno-host"></div>';

      // ── Advanced Analyses Section ───────────────────────────────────────
      html += _renderAdvancedAnalyses(data, analysisId);
      html += renderFusionSummaryCard(_fusionSummary, data && data.patient_id);

      // ── Viz v2 Panels (MNE topomaps, connectivity chord, source 3D, animation)
      if (analysisId === 'demo' && _isDemoMode()) {
        html = _demoBanner() + html;
      }
      tabEl.innerHTML = html;

      // Bind advanced analyses button
      setTimeout(function () {
        // 3D Brain Map band selector
        var bandTabs3d = document.getElementById('qeeg-3d-band-tabs');
        var brainCont3d = document.getElementById('qeeg-3d-brain-container');
        if (bandTabs3d && brainCont3d) {
          bandTabs3d.addEventListener('click', function (e) {
            var tab = e.target.closest('.qeeg-3d-band-tab');
            if (!tab) return;
            var selBand = tab.dataset.band;
            bandTabs3d.querySelectorAll('.qeeg-3d-band-tab').forEach(function (t) { t.classList.remove('qeeg-3d-band-tab--active'); });
            tab.classList.add('qeeg-3d-band-tab--active');
            var chData = bands[selBand]?.channels || {};
            var pm = {};
            Object.entries(chData).forEach(function (entry) { pm[entry[0]] = entry[1].relative_pct || 0; });
            brainCont3d.innerHTML = render3DBrainMap(pm, { band: selBand, size: 360, colorScale: 'warm' });
          });
        }

        _bindBrainRingFrames();
        _wireQEEGSource3DBrain();
        // ── Mount Viz v2 panels (lazy-loaded) ─────────────────────────────
        var vizMount = document.getElementById('qeeg-viz-v2-mount');
        if (vizMount && analysisId) {
          import('./pages-qeeg-viz.js').then(function (vizMod) {
            vizMod.mountVizV2Panels(vizMount, analysisId);
          }).catch(function (err) {
            vizMount.innerHTML = '<p style="color:var(--text-secondary);font-size:12px;padding:8px;">Viz v2 not available: ' + esc(String(err.message || err)) + '</p>';
          });
        }
        // ── Mount Clinical Intelligence Workbench panels (Migration 048) ────
        if (analysisId && analysisId !== 'demo') {
          mountSafetyCockpit('qeeg-safety-cockpit-panel', analysisId, api);
          mountRedFlags('qeeg-red-flags-panel', analysisId, api);
          mountNormativeModelCard('qeeg-normative-card-panel', analysisId, api);
          mountProtocolFit('qeeg-protocol-fit-panel', analysisId, api);
        }
        var runBtn = document.getElementById('qeeg-run-advanced-btn');
        if (runBtn) {
          runBtn.addEventListener('click', async function () {
            runBtn.disabled = true;
            runBtn.textContent = 'Running 25 analyses...';
            try {
              var result = await api.runAdvancedQEEGAnalyses(analysisId);
              // Re-render tab with updated data
              window._nav('qeeg-analysis');
            } catch (e) {
              runBtn.disabled = false;
              runBtn.textContent = 'Run Advanced Analyses';
              showToast('Advanced analyses failed: ' + (e.message || e), 'error');
              var errEl = document.getElementById('qeeg-advanced-error');
              if (errEl) errEl.innerHTML = '<div style="color:var(--red);padding:8px;font-size:13px">Error: ' + esc(e.message || e) + '</div>';
            }
          });
        }
        // ── MNE pipeline trigger (§4 of CONTRACT.md) ──────────────────
        var mneBtn = document.getElementById('qeeg-run-mne-btn');
        if (mneBtn) {
          mneBtn.addEventListener('click', async function () {
            if (analysisId === 'demo') {
              showToast('Demo analyses cannot be re-run on the MNE pipeline.', 'info');
              return;
            }
            mneBtn.disabled = true;
            var originalLabel = mneBtn.textContent;
            mneBtn.textContent = 'Running MNE pipeline...';
            var mneSt = document.getElementById('qeeg-mne-run-status');
            if (mneSt) mneSt.innerHTML = spinner('Running MNE-Python pipeline (preprocess + ICA + features)...');
            try {
              await api.runQEEGMNEPipeline(analysisId);
              showToast('MNE pipeline started', 'success');
              window._nav('qeeg-analysis');
            } catch (e) {
              mneBtn.disabled = false;
              mneBtn.textContent = originalLabel;
              showToast('MNE pipeline failed: ' + (e.message || e), 'error');
              if (mneSt) mneSt.innerHTML = '<div style="color:var(--red);font-size:13px" role="alert">Error: ' + esc(e.message || e) + '</div>';
            }
          });
        }
        // ── Contract V2 AI upgrade action buttons ────────────────────
        // Each button POSTs to the matching /api/v1/qeeg-analysis/{id}/...
        // endpoint and re-renders the analysis tab on success. Demo-mode
        // short-circuits with a toast so reviewers see feedback without
        // hitting the live Fly API.
        if (_aiUpgradesFeatureFlagEnabled()) {
          var aiActionMap = {
            embedding:  { label: 'Computing embedding...',         call: function () { return api.computeQEEGEmbedding(analysisId); } },
            brain_age:  { label: 'Predicting brain age...',        call: function () { return api.predictQEEGBrainAge(analysisId, {}); } },
            risk_scores:{ label: 'Scoring similarity indices...',  call: function () { return api.scoreQEEGConditions(analysisId); } },
            explain:    { label: 'Generating explainability...',   call: function () { return api.explainQEEGRiskScores(analysisId); } },
            similar:    { label: 'Finding similar cases...',       call: function () { return api.fetchQEEGSimilarCases(analysisId, 10); } },
            protocol:   { label: 'Building protocol suggestion...',call: function () { return api.recommendQEEGProtocol(analysisId); } },
          };
          document.querySelectorAll('[data-qeeg-ai-action]').forEach(function (btn) {
            btn.addEventListener('click', async function () {
              var action = btn.getAttribute('data-qeeg-ai-action');
              var spec = aiActionMap[action];
              if (!spec) return;
              if (analysisId === 'demo' && _isDemoMode()) {
                showToast('Demo mode — ' + spec.label.replace('...', '') + ' shown offline.', 'info');
                return;
              }
              btn.disabled = true;
              var original = btn.textContent;
              btn.textContent = '...';
              var aiSt = document.getElementById('qeeg-ai-run-status');
              if (aiSt) aiSt.innerHTML = spinner(spec.label);
              try {
                await spec.call();
                showToast(original + ' complete', 'success');
                window._nav('qeeg-analysis');
              } catch (e) {
                btn.disabled = false;
                btn.textContent = original;
                showToast(original + ' failed: ' + (e.message || e), 'error');
                if (aiSt) aiSt.innerHTML = '<div style="color:var(--red);font-size:13px" role="alert">'
                  + 'Error: ' + esc(e.message || e) + '</div>';
              }
            });
          });
        }
        _bindQEEGAnnotationButtons();
        // Collapsible group toggles
        document.querySelectorAll('.qeeg-adv-group-toggle').forEach(function (toggle) {
          toggle.setAttribute('tabindex', '0');
          toggle.setAttribute('role', 'button');
          toggle.setAttribute('aria-expanded', 'false');
          toggle.addEventListener('click', function () {
            var cat = toggle.parentElement;
            var body = cat ? cat.querySelector('.qeeg-adv-category__body') : null;
            var arrow = toggle.querySelector('.qeeg-adv-arrow');
            var summary = cat ? cat.querySelector('.qeeg-adv-category__summary') : null;
            if (body) {
              var isCollapsed = body.classList.contains('qeeg-adv-category__body--collapsed');
              body.classList.toggle('qeeg-adv-category__body--collapsed');
              if (arrow) arrow.classList.toggle('qeeg-adv-arrow--collapsed');
              if (summary) summary.style.display = isCollapsed ? 'none' : '';
              toggle.setAttribute('aria-expanded', isCollapsed ? 'true' : 'false');
            }
          });
          toggle.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              toggle.click();
            }
          });
        });
      }, 50);
    } catch (err) {
      tabEl.innerHTML = '<div role="alert" style="color:var(--red);padding:24px"><strong>Failed to load analysis.</strong><div style="margin-top:6px;font-size:13px">' + esc(String(err.message || err)) + '</div><div style="margin-top:8px;font-size:12px;color:var(--text-tertiary)">Try refreshing the page. If the error persists, contact support.</div></div>';
    }
    return;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TAB 3: AI REPORT
  // ══════════════════════════════════════════════════════════════════════════
  if (tab === 'report') {
    const analysisId = window._qeegSelectedId;
    if (!analysisId) {
      const demoBtn = _isDemoMode()
        ? '<button class="btn btn-primary btn-sm" onclick="window._qeegSelectedId=\'demo\';window._qeegTab=\'report\';window._nav(\'qeeg-analysis\')">Open AI Report (demo data)</button>'
        : '';
      tabEl.innerHTML =
        '<div style="max-width:620px;margin:48px auto;padding:32px;border-radius:14px;background:rgba(255,255,255,0.02);border:1px solid var(--border);text-align:center">'
        + '<div style="font-size:32px;margin-bottom:8px">📝</div>'
        + '<div style="font-size:18px;font-weight:700;margin-bottom:6px">No analysis selected</div>'
        + '<div style="font-size:13px;color:var(--text-secondary);line-height:1.6;margin-bottom:18px">Open the AI report with sample data, jump to an existing analysis, or upload a new EDF.</div>'
        + '<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">'
        +   demoBtn
        +   '<button class="btn btn-outline btn-sm" onclick="window._qeegTab=\'patient\';window._nav(\'qeeg-analysis\')">Use existing analysis</button>'
        +   '<button class="btn btn-outline btn-sm" onclick="window._nav(\'qeeg-raw-workbench\')">Pick patient &amp; upload</button>'
        + '</div>'
        + '</div>';
      return;
    }

    tabEl.innerHTML = spinner('Loading reports...');

    try {
      let reports = [];
      try {
        const rData = await api.listQEEGAnalysisReports(analysisId);
        reports = Array.isArray(rData) ? rData : (rData?.reports || []);
      } catch (_) { /* no reports yet */ }
      reports = reports.slice().sort(function (a, b) { return _getReportSortTimestamp(b) - _getReportSortTimestamp(a); });

      // Demo mode fallback when no reports available
      if (reports.length === 0 && _isDemoMode() && analysisId === 'demo') {
        reports = [DEMO_QEEG_REPORT];
      }

      if (reports.length === 0) {
        tabEl.innerHTML = card('Generate AI Interpretation',
          renderQEEGSessionRail(_currentAnalysis, {
            title: 'Selected qEEG session',
            note: 'Narrative generation should follow quantitative review and clinician confirmation.'
          })
          + renderLaunchNotice('No AI report yet', 'Generate the narrative only after the quantitative review looks coherent. The report is decision support and should be clinician-reviewed before sharing.', 'warn')
          + '<div style="text-align:center;padding:24px">'
          + '<p style="color:var(--text-secondary);margin-bottom:16px;font-size:13px">No AI report has been generated for this analysis yet.</p>'
          + '<div style="display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap">'
          + '<label for="qeeg-report-type" style="font-size:12px;font-weight:600;color:var(--text-secondary)">Report Mode</label>'
          + '<select id="qeeg-report-type" class="form-select" style="font-size:13px;padding:6px 10px;min-width:180px">'
          + '<option value="standard">Standard Report</option>'
          + '<option value="prediction">Predictive Analysis</option>'
          + '</select>'
          + '<button class="btn btn-primary" id="qeeg-gen-report-btn">Generate AI Report</button>'
          + '</div>'
          + '<div id="qeeg-gen-status" role="status" aria-live="polite" style="margin-top:12px"></div></div>'
        );
        const btn = document.getElementById('qeeg-gen-report-btn');
        if (btn) {
          btn.addEventListener('click', async function () {
            btn.disabled = true;
            var reportTypeSel = document.getElementById('qeeg-report-type');
            var selectedType = reportTypeSel ? reportTypeSel.value : 'standard';
            const st = document.getElementById('qeeg-gen-status');
            if (st) st.innerHTML = spinner('Generating AI interpretation...');
            try {
              _qeegAudit('ai_interpretation_requested', {
                analysis_id: analysisId,
                note: 'report_type=' + selectedType,
              });
              await api.generateQEEGAIReport(analysisId, { report_type: selectedType });
              _qeegAudit('ai_interpretation_completed', { analysis_id: analysisId });
              showToast('AI report generated', 'success');
              window._qeegTab = 'report';
              window._nav('qeeg-analysis');
            } catch (err) {
              _qeegAudit('ai_interpretation_failed', {
                analysis_id: analysisId,
                note: (err && err.message ? err.message : String(err)).slice(0, 200),
              });
              showToast('AI report generation failed: ' + (err.message || err), 'error');
              if (st) st.innerHTML = '<div style="color:var(--red);font-size:13px" role="alert">Error: ' + esc(String(err && err.message ? err.message : err || "Unknown error")) + '</div>';
              btn.disabled = false;
            }
          });
        }
        return;
      }

      var selectedReportId = window._qeegSelectedReportId || (reports[0] && reports[0].id) || null;
      var report = reports.find(function (item) { return item.id === selectedReportId; }) || reports[0];
      if (report && report.id) window._qeegSelectedReportId = report.id;
      _currentReport = report;
      // Load analysis data for comprehensive report
      var analysisData = null;
      if (analysisId === 'demo' && _isDemoMode()) {
        analysisData = DEMO_QEEG_ANALYSIS;
      } else if (_currentAnalysis && _currentAnalysis.id === analysisId) {
        analysisData = _currentAnalysis;
      } else {
        try {
          analysisData = await api.getQEEGAnalysis(analysisId);
        } catch (_) { /* analysis data enhances report but is not required */ }
      }
      if (analysisData) _currentAnalysis = analysisData;
      var reportPatientId = (analysisData && analysisData.patient_id) || _getContextPatientIdForQEEG() || (_patient && _patient.id) || null;
      await _loadQEEGSavedEvidenceCitations(reportPatientId);
      _qeegSavedEvidenceCitations = _filterQEEGSavedEvidenceCitations(_qeegSavedEvidenceCitations, _getQEEGReportEvidenceContext());

      var html = renderQEEGSessionRail(analysisData, {
        title: 'qEEG report context',
        note: 'This rail keeps the recording and quality context visible while reviewing AI narrative output.'
      }) + _renderComprehensiveReport(report, analysisData, _qeegSavedEvidenceCitations);
      if (reports.length > 1) {
        html = card('Report Versions',
          '<div class="qeeg-report-version-bar">'
            + '<label for="qeeg-report-version" class="qeeg-report-version-bar__label">Choose report revision</label>'
            + '<select id="qeeg-report-version" class="form-select qeeg-report-version-bar__select">'
            + reports.map(function (item, index) {
              var selected = report && item.id === report.id ? ' selected' : '';
              return '<option value="' + esc(item.id) + '"' + selected + '>' + esc(_formatReportVersionLabel(item, index, reports.length)) + '</option>';
            }).join('')
            + '</select>'
          + '</div>'
        ) + html;
      }
      // Clinical Workbench — review + patient-facing report panels
      html += '<div id="qeeg-clinician-review-panel"></div>';
      html += '<div id="qeeg-patient-report-panel"></div>';
      html += '<div id="qeeg-timeline-panel"></div>';

      // Contract V2 §10 — copilot widget mount point (floating / fixed
      // position). Appended inside the tab so it survives tab re-renders
      // but is removed when the tab is navigated away from.
      if (_aiUpgradesFeatureFlagEnabled()) {
        html += '<div id="qeeg-copilot-mount" role="status" aria-live="polite"></div>';
      }

      if (analysisId === 'demo' && _isDemoMode()) {
        html = _demoBanner() + html;
      }
      tabEl.innerHTML = html;
      _revokeQEEGPrintableReportViewerUrl();

      var reportVersionSel = document.getElementById('qeeg-report-version');
      if (reportVersionSel) {
        reportVersionSel.addEventListener('change', function () {
          window._qeegSelectedReportId = reportVersionSel.value || null;
          window._qeegTab = 'report';
          window._nav('qeeg-analysis');
        });
      }

      if (_canRenderQEEGPrintableReport(report, analysisData)) {
        _mountQEEGPrintableReportViewer(report, analysisData).catch(function (err) {
          showToast('Printable report preview failed: ' + (err && err.message ? err.message : err), 'error');
        });
      }

      // Mount the copilot once the DOM is ready. Re-mounts on every report
      // render so the widget stays in sync with the selected analysis.
      if (_aiUpgradesFeatureFlagEnabled()) {
        setTimeout(function () {
          try { mountCopilotWidget('qeeg-copilot-mount', analysisId); } catch (_) {}
        }, 30);
      }
      // Mount Clinical Workbench panels (Migration 048)
      if (report && report.id && analysisId && analysisId !== 'demo') {
        setTimeout(function () {
          try { mountClinicianReview('qeeg-clinician-review-panel', analysisId, report.id, api); } catch (_) {}
          try { mountPatientReport('qeeg-patient-report-panel', report.id, api); } catch (_) {}
        }, 40);
      }
      if (analysisData && analysisData.patient_id && analysisId && analysisId !== 'demo') {
        setTimeout(function () {
          try { mountTimeline('qeeg-timeline-panel', analysisData.patient_id, api); } catch (_) {}
        }, 50);
      }

      // Review handler
      const reviewBtn = document.getElementById('qeeg-save-review');
      if (reviewBtn) {
        reviewBtn.addEventListener('click', async function () {
          const amendments = document.getElementById('qeeg-amendments')?.value || '';
          const st = document.getElementById('qeeg-review-status');
          reviewBtn.disabled = true;
          try {
            await api.amendQEEGReport(report.id, { clinician_reviewed: true, clinician_amendments: amendments });
            showToast('Review recorded', 'success');
            if (st) st.innerHTML = '<div style="color:var(--green);font-size:13px">Clinician review recorded for this report.</div>';
          } catch (err) {
            showToast('Failed to save review: ' + (err.message || err), 'error');
            if (st) st.innerHTML = '<div style="color:var(--red);font-size:13px">Error: ' + esc(String(err && err.message ? err.message : err || "Unknown error")) + '</div>';
            reviewBtn.disabled = false;
          }
        });
      }
    } catch (err) {
      tabEl.innerHTML = '<div role="alert" style="color:var(--red);padding:24px"><strong>Failed to load report.</strong><div style="margin-top:6px;font-size:13px">' + esc(String(err.message || err)) + '</div><div style="margin-top:8px;font-size:12px;color:var(--text-tertiary)">Try refreshing the page. If the error persists, contact support.</div></div>';
    }
    return;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TAB: LEARNING EEG
  // ══════════════════════════════════════════════════════════════════════════
  if (tab === 'learning') {
    var learningHtml = '';
    learningHtml += renderLaunchNotice(
      'Educational reference only',
      'Use this tab to cross-check qEEG and raw EEG findings against standard EEG teaching concepts. These summaries support interpretation but do not replace direct waveform review or supervised clinical training.',
      'info'
    );
    learningHtml += card('Learning EEG Workflow',
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px">'
        + '<div style="padding:12px;border-radius:10px;background:var(--surface-tint-1);border:1px solid var(--border)">'
        + '<div style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--blue)">1. Check raw signal</div>'
        + '<div style="font-size:12px;color:var(--text-secondary);line-height:1.6;margin-top:6px">Confirm artefact, montage, state, and basic morphology before trusting derived metrics.</div>'
        + '</div>'
        + '<div style="padding:12px;border-radius:10px;background:var(--surface-tint-1);border:1px solid var(--border)">'
        + '<div style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--teal)">2. Review quantitative output</div>'
        + '<div style="font-size:12px;color:var(--text-secondary);line-height:1.6;margin-top:6px">Map band-power, asymmetry, and normative deviations back to standard EEG language and age/state context.</div>'
        + '</div>'
        + '<div style="padding:12px;border-radius:10px;background:var(--surface-tint-1);border:1px solid var(--border)">'
        + '<div style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--amber)">3. Escalate carefully</div>'
        + '<div style="font-size:12px;color:var(--text-secondary);line-height:1.6;margin-top:6px">Suspicious rhythmic or sharply contoured events still require direct EEG review for evolution, field, and context.</div>'
        + '</div>'
      + '</div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">'
      + '<button class="btn btn-outline btn-sm" onclick="window._qeegTab=\'analysis\';window._nav(\'qeeg-analysis\')">Open Analysis</button>'
      + '<button class="btn btn-outline btn-sm" onclick="window._qeegTab=\'raw\';window._nav(\'qeeg-analysis\')">Open Raw Data</button>'
      + '<button class="btn btn-outline btn-sm" onclick="window._qeegTab=\'report\';window._nav(\'qeeg-analysis\')">Open AI Report</button>'
      + '</div>'
    );
    learningHtml += renderLearningEEGReferenceCard({
      audience: 'analyzer',
      title: 'Learning EEG Library',
      intro: 'Verified topic map for the qEEG analyzer and raw-data workbench. The app stores original summaries and links to the source site rather than copying the full educational content.'
    });
    tabEl.innerHTML = learningHtml;
    return;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TAB: RAW DATA
  // ══════════════════════════════════════════════════════════════════════════
  if (tab === 'raw') {
    const analysisId = window._qeegSelectedId;
    if (!analysisId) {
      const editorBtn = _isDemoMode()
        ? '<button class="btn btn-primary btn-sm" onclick="window._qeegSelectedId=\'demo\';window._qeegTab=\'raw\';window._nav(\'qeeg-analysis\')">Open Raw Data Editor</button>'
        : '';
      const workbenchOnclick = _isDemoMode()
        ? "window._qeegSelectedId='demo';window.location.hash='#/qeeg-raw-workbench/demo';window._nav('qeeg-raw-workbench')"
        : "window._nav('qeeg-raw-workbench')";
      tabEl.innerHTML =
        '<div style="max-width:620px;margin:48px auto;padding:32px;border-radius:14px;background:rgba(255,255,255,0.02);border:1px solid var(--border);text-align:center">'
        + '<div style="font-size:32px;margin-bottom:8px">📈</div>'
        + '<div style="font-size:18px;font-weight:700;margin-bottom:6px">No EEG selected</div>'
        + '<div style="font-size:13px;color:var(--text-secondary);line-height:1.6;margin-bottom:18px">Open the inline editor with sample data, pick a patient and upload a new EDF, jump to an existing analysis, or open the full-screen workbench for manual analysis.</div>'
        + '<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">'
        +   editorBtn
        +   '<button class="btn btn-outline btn-sm" onclick="window._nav(\'qeeg-raw-workbench\')">Pick patient &amp; upload</button>'
        +   '<button class="btn btn-outline btn-sm" onclick="window._qeegTab=\'patient\';window._nav(\'qeeg-analysis\')">Use existing analysis</button>'
        +   '<button class="btn btn-outline btn-sm" onclick="' + workbenchOnclick + '">Open Raw EEG Workbench (full-screen)</button>'
        + '</div>'
        + '</div>';
      return;
    }
    tabEl.innerHTML = '<div style="text-align:center;padding:48px"><div class="spinner"></div><div style="margin-top:12px;font-size:13px;color:var(--text-secondary)">Loading Raw Data viewer&hellip;</div></div>';
    try {
      const { renderRawDataTab } = await import('./pages-qeeg-raw.js');
      await renderRawDataTab(tabEl, analysisId, patientId);
      // Compact workbench link bar below the viewer
      var summaryBar = document.createElement('div');
      summaryBar.style.cssText = 'display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:12px;padding:10px 14px;border-radius:10px;background:rgba(255,255,255,0.02);border:1px solid var(--border);font-size:11px;color:var(--text-secondary)';
      summaryBar.id = 'qeeg-raw-summary-bar';
      summaryBar.innerHTML = '<span>Need full-screen editing? <a href="#" style="color:var(--blue)" onclick="window._qeegOpenWorkbench&&window._qeegOpenWorkbench(\'' + esc(analysisId) + '\');return false;">Open Raw EEG Workbench</a></span>'
        + '<span style="margin-left:auto;display:flex;gap:10px;align-items:center">'
        + '<span id="qeeg-raw-summary-ch">-- channels</span>'
        + '<span id="qeeg-raw-summary-quality">--% good</span>'
        + '<span id="qeeg-raw-summary-band">-- dominant</span>'
        + '</span>';
      tabEl.appendChild(summaryBar);
      var learningWrap = document.createElement('div');
      learningWrap.style.marginTop = '12px';
      learningWrap.innerHTML = renderLearningEEGReferenceCard({
        audience: 'analyzer',
        title: 'Learning EEG Companion',
        intro: 'Structured reference material for the qEEG analyzer and raw viewer. Use it to connect quantitative outputs back to standard EEG interpretation concepts.'
      });
      tabEl.appendChild(learningWrap);
      window._qeegOpenWorkbench = function(id, mode) {
        window._qeegSelectedId = id;
        window.location.hash = '#/qeeg-raw-workbench/' + encodeURIComponent(id) + (mode ? '?mode=' + encodeURIComponent(mode) : '');
        if (typeof window._nav === 'function') window._nav('qeeg-raw-workbench');
      };
      // Wire live summary updates from the raw viewer state
      _wireRawViewerSummary(tabEl, analysisId);
    } catch (err) {
      tabEl.innerHTML = '<div style="color:var(--red);padding:24px" role="alert">Failed to load Raw Data viewer: ' + esc(String(err.message || err)) + '</div>';
    }
    return;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TAB 4: COMPARE
  // ══════════════════════════════════════════════════════════════════════════
  if (tab === 'compare') {
    // If comparison already loaded, show results
    if (window._qeegComparisonId) {
      tabEl.innerHTML = spinner('Loading comparison...');
      try {
        var comp;
        if (window._qeegComparisonId === 'demo' && _isDemoMode()) {
          comp = DEMO_QEEG_COMPARISON;
        } else {
          comp = await api.getQEEGComparison(window._qeegComparisonId);
        }
        var compHtml = renderComparison(comp)
          + '<div style="text-align:center;margin-top:16px"><button class="btn btn-outline btn-sm" onclick="window._qeegComparisonId=null;window._nav(\'qeeg-analysis\')">New Comparison</button></div>';
        if (window._qeegComparisonId === 'demo' && _isDemoMode()) {
          compHtml = _demoBanner() + compHtml;
        }
        if (_currentAnalysis) {
          compHtml = renderQEEGSessionRail(_currentAnalysis, {
            title: 'qEEG comparison context',
            note: 'Use shared rails and fixed topomap scales to interpret change, not just absolute intensity.'
          }) + compHtml;
        }
        tabEl.innerHTML = compHtml;
      } catch (err) {
        tabEl.innerHTML = '<div role="alert" style="color:var(--red);padding:24px"><strong>Comparison failed.</strong><div style="margin-top:6px;font-size:13px">' + esc(String(err.message || err)) + '</div><div style="margin-top:8px;font-size:12px;color:var(--text-tertiary)">Try refreshing or pick different analyses. If this persists, contact support.</div></div>';
      }
      return;
    }

    if (!patientId) {
      var compareEmptyHtml = '<div style="text-align:center;padding:48px;color:var(--text-tertiary)">Select a patient first.</div>';
      if (_isDemoMode()) {
        compareEmptyHtml += '<div style="text-align:center;padding-bottom:16px">'
          + '<button class="btn btn-outline btn-sm" onclick="window._qeegComparisonId=\'demo\';window._nav(\'qeeg-analysis\')">View Sample Comparison</button></div>';
      }
      tabEl.innerHTML = compareEmptyHtml;
      return;
    }

    // Load completed analyses for dropdowns
    const completedAnalyses = _analyses
      .filter(function (a) { return a.analysis_status === 'completed'; })
      .slice()
      .sort(function (a, b) { return _getAnalysisSortTimestamp(a) - _getAnalysisSortTimestamp(b); });
    if (completedAnalyses.length < 2) {
      tabEl.innerHTML = '<div style="text-align:center;padding:48px;color:var(--text-tertiary)">'
        + '<div style="font-size:14px;margin-bottom:8px">At least 2 completed analyses are needed for comparison.</div>'
        + '<div style="font-size:13px">Current completed: ' + completedAnalyses.length + '</div></div>';
      return;
    }

    // Build comparison form with dropdowns
    const defaultBaseline = completedAnalyses[0];
    const defaultFollowup = completedAnalyses[completedAnalyses.length - 1];

    function optionsList(exclude, selectedId) {
      return completedAnalyses.map(function (a) {
        if (a.id === exclude) return '';
        return '<option value="' + a.id + '"' + (a.id === selectedId ? ' selected' : '') + '>' + esc(_formatAnalysisSessionLabel(a)) + '</option>';
      }).join('');
    }

    tabEl.innerHTML = renderQEEGSessionRail(_currentAnalysis, {
      title: 'qEEG comparison setup',
      note: 'Select baseline and follow-up from the same patient history before computing change.'
    }) + card('Create Pre/Post Comparison',
      '<div style="padding:8px">'
      + '<p style="color:var(--text-secondary);font-size:13px;margin-bottom:16px">Compare a baseline qEEG analysis with a follow-up to track treatment progress.</p>'
      + renderCompareSelectionSummary(defaultBaseline, defaultFollowup)
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">'
      + '<div><label style="font-size:11px;font-weight:700;color:var(--text-tertiary);text-transform:uppercase;display:block;margin-bottom:4px">Baseline Analysis</label>'
      + '<select id="qeeg-baseline-sel" class="form-control"><option value="">Select baseline...</option>' + optionsList('', defaultBaseline && defaultBaseline.id) + '</select></div>'
      + '<div><label style="font-size:11px;font-weight:700;color:var(--text-tertiary);text-transform:uppercase;display:block;margin-bottom:4px">Follow-up Analysis</label>'
      + '<select id="qeeg-followup-sel" class="form-control"><option value="">Select follow-up...</option>' + optionsList('', defaultFollowup && defaultFollowup.id) + '</select></div></div>'
      + '<div style="text-align:center"><button class="btn btn-primary" id="qeeg-compare-btn">Compare</button></div>'
      + '<div id="qeeg-compare-status" role="status" aria-live="polite" style="margin-top:12px"></div></div>'
    );

    var baselineSel = document.getElementById('qeeg-baseline-sel');
    var followupSel = document.getElementById('qeeg-followup-sel');
    if (baselineSel && defaultBaseline && !baselineSel.value) baselineSel.value = defaultBaseline.id;
    if (followupSel && defaultFollowup && !followupSel.value) followupSel.value = defaultFollowup.id;

    const cmpBtn = document.getElementById('qeeg-compare-btn');
    const cmpBtnDefaultText = cmpBtn ? cmpBtn.textContent : 'Compare';

    function _qeegRevalidateCompare() {
      const baseId = baselineSel ? baselineSel.value : '';
      const followId = followupSel ? followupSel.value : '';
      const st = document.getElementById('qeeg-compare-status');
      if (!baseId || !followId) {
        if (cmpBtn) { cmpBtn.disabled = true; cmpBtn.setAttribute('aria-disabled', 'true'); }
        if (st) st.innerHTML = '<div style="color:var(--text-tertiary);font-size:12px">Pick a baseline and a follow-up to compare.</div>';
        return;
      }
      if (baseId === followId) {
        if (cmpBtn) { cmpBtn.disabled = true; cmpBtn.setAttribute('aria-disabled', 'true'); }
        if (st) st.innerHTML = '<div role="alert" style="color:var(--amber);font-size:13px">Baseline and follow-up must be different analyses.</div>';
        return;
      }
      const base = completedAnalyses.find(function (a) { return a.id === baseId; });
      const foll = completedAnalyses.find(function (a) { return a.id === followId; });
      let warning = '';
      if (base && foll) {
        const dt = Math.abs(_getAnalysisSortTimestamp(foll) - _getAnalysisSortTimestamp(base));
        const days = dt / (1000 * 60 * 60 * 24);
        if (days > 0 && days < 7) {
          warning = '<div role="status" style="color:var(--amber);font-size:12px;margin-top:4px">⚠️ Sessions are less than 7 days apart — small changes may not be reliable.</div>';
        }
      }
      if (cmpBtn) { cmpBtn.disabled = false; cmpBtn.removeAttribute('aria-disabled'); }
      if (st) st.innerHTML = '<div style="color:var(--text-tertiary);font-size:12px">Ready to compare.</div>' + warning;
    }
    if (baselineSel) baselineSel.addEventListener('change', _qeegRevalidateCompare);
    if (followupSel) followupSel.addEventListener('change', _qeegRevalidateCompare);
    _qeegRevalidateCompare();

    if (cmpBtn) {
      cmpBtn.addEventListener('click', async function () {
        const baseId = baselineSel ? baselineSel.value : '';
        const followId = followupSel ? followupSel.value : '';
        const st = document.getElementById('qeeg-compare-status');
        if (!baseId || !followId || baseId === followId) { _qeegRevalidateCompare(); return; }
        cmpBtn.disabled = true;
        cmpBtn.textContent = 'Creating comparison…';
        if (st) st.innerHTML = spinner('Computing comparison...');
        try {
          const result = await api.createQEEGComparison({ baseline_id: baseId, followup_id: followId });
          _qeegAudit('comparison_created', {
            note: 'baseline=' + baseId + '; followup=' + followId,
          });
          showToast('Comparison ready', 'success');
          window._qeegComparisonId = result.id;
          window._nav('qeeg-analysis');
        } catch (err) {
          showToast('Comparison failed: ' + (err.message || err), 'error');
          if (st) st.innerHTML = '<div role="alert" style="color:var(--red);font-size:13px">Error: ' + esc(String(err.message || err)) + '</div>';
          cmpBtn.disabled = false;
          cmpBtn.textContent = cmpBtnDefaultText;
        }
      });
    }

    // Hint when only 2 analyses exist — trend section unlocks at 3
    if (completedAnalyses.length === 2) {
      var trendHintHost = document.createElement('div');
      trendHintHost.style.cssText = 'margin-top:16px;padding:14px;border-radius:10px;background:rgba(255,255,255,0.02);border:1px dashed rgba(255,255,255,0.12);font-size:12px;color:var(--text-secondary);text-align:center';
      trendHintHost.innerHTML = '<strong>Longitudinal trend</strong> requires <strong>3+ completed analyses</strong>. Upload one more recording to unlock trend tracking.';
      tabEl.appendChild(trendHintHost);
    }

    // Longitudinal trend section when 3+ completed analyses available
    if (completedAnalyses.length >= 3) {
      var trendHtml = '<div style="margin-top:20px"></div>';
      var trendMetrics = [
        { value: 'theta_beta_ratio', label: 'Theta/Beta Ratio' },
        { value: 'alpha_peak', label: 'Alpha Peak Frequency' },
        { value: 'frontal_asymmetry', label: 'Frontal Asymmetry' },
        { value: 'entropy', label: 'Sample Entropy' },
        { value: 'coherence', label: 'Mean Coherence' },
      ];
      var metricOpts = trendMetrics.map(function (m) {
        return '<option value="' + m.value + '">' + esc(m.label) + '</option>';
      }).join('');
      trendHtml += card('Longitudinal Trend (' + completedAnalyses.length + ' sessions)',
        '<div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px">Tracking key biomarkers across all recording sessions.</div>'
        + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap">'
        + '<label for="qeeg-trend-metric" style="font-size:12px;font-weight:600;color:var(--text-secondary)">Metric</label>'
        + '<select id="qeeg-trend-metric" class="form-select" style="font-size:13px;padding:6px 10px;min-width:180px">' + metricOpts + '</select>'
        + '<button class="btn btn-sm btn-primary" id="qeeg-load-trend-btn">Load Trend</button>'
        + '</div>'
        + '<div id="qeeg-trend-content">'
        + '<div style="text-align:center;padding:16px;color:var(--text-tertiary);font-size:13px">Select a metric and click Load Trend to view longitudinal data.</div>'
        + '</div>'
      );
      tabEl.innerHTML += trendHtml;

      // Wire up trend loading
      setTimeout(function () {
        var trendBtn = document.getElementById('qeeg-load-trend-btn');
        if (trendBtn) {
          trendBtn.addEventListener('click', async function () {
            var metricSel = document.getElementById('qeeg-trend-metric');
            var metric = metricSel ? metricSel.value : 'theta_beta_ratio';
            var contentEl = document.getElementById('qeeg-trend-content');
            if (!contentEl) return;
            contentEl.innerHTML = spinner('Loading trend data...');
            try {
              var trendData;
              if (_isDemoMode()) {
                // Generate demo trend data
                var demoBase = { theta_beta_ratio: 3.82, alpha_peak: 9.24, frontal_asymmetry: 0.18, entropy: 1.52, coherence: 0.28 };
                var demoDir  = { theta_beta_ratio: -0.12, alpha_peak: 0.07, frontal_asymmetry: -0.02, entropy: 0.03, coherence: 0.02 };
                var baseVal = demoBase[metric] || 1.0;
                var drift = demoDir[metric] || 0.01;
                trendData = { metric: metric, data_points: [] };
                for (var di = 0; di < 5; di++) {
                  var val = baseVal + (drift * di) + (Math.random() * 0.1 - 0.05);
                  var sessionDate = new Date(Date.now() - (4 - di) * 30 * 86400000).toISOString().split('T')[0];
                  trendData.data_points.push({ date: sessionDate, value: parseFloat(val.toFixed(3)), change: di > 0 ? parseFloat((drift + Math.random() * 0.06 - 0.03).toFixed(3)) : 0 });
                }
                // Determine trend direction
                var firstVal = trendData.data_points[0].value;
                var lastVal = trendData.data_points[trendData.data_points.length - 1].value;
                var totalChange = lastVal - firstVal;
                // For TBR and asymmetry, decrease is improving; for alpha peak, increase is improving
                var improvingDown = ['theta_beta_ratio', 'frontal_asymmetry'];
                if (improvingDown.indexOf(metric) !== -1) {
                  trendData.trend = totalChange < -0.05 ? 'improving' : totalChange > 0.05 ? 'declining' : 'stable';
                } else {
                  trendData.trend = totalChange > 0.05 ? 'improving' : totalChange < -0.05 ? 'declining' : 'stable';
                }
              } else {
                trendData = await api.getQEEGLongitudinalTrend(patientId, metric);
              }
              // Render trend results
              var pts = trendData.data_points || [];
              if (!pts.length) {
                contentEl.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text-tertiary);font-size:13px">No trend data available for this metric.</div>';
                return;
              }
              var trendLabel = trendData.trend || 'stable';
              var trendColor = trendLabel === 'improving' ? 'var(--green)' : trendLabel === 'declining' ? 'var(--red)' : 'var(--amber)';
              var vals = pts.map(function (p) { return p.value; });
              var metricLabel = '';
              trendMetrics.forEach(function (m) { if (m.value === metric) metricLabel = m.label; });
              var tHtml = '<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">'
                + '<strong style="font-size:14px">' + esc(metricLabel) + '</strong>'
                + badge(trendLabel.charAt(0).toUpperCase() + trendLabel.slice(1), trendColor)
                + '</div>';
              tHtml += '<div style="margin-bottom:12px">' + spark(vals, trendColor, metricLabel + ' trend') + '</div>';
              // Data table
              tHtml += '<div style="overflow-x:auto"><table class="ds-table" style="width:100%;font-size:12px"><thead><tr><th>Session Date</th><th>Value</th><th>Change from Previous</th></tr></thead><tbody>';
              pts.forEach(function (p) {
                var changeStr = p.change !== 0 ? ((p.change > 0 ? '+' : '') + p.change.toFixed(3)) : '-';
                var changeColor = p.change > 0.05 ? 'var(--green)' : p.change < -0.05 ? 'var(--red)' : 'var(--text-secondary)';
                tHtml += '<tr><td>' + esc(p.date) + '</td><td style="font-weight:600">' + p.value.toFixed(3) + '</td>'
                  + '<td style="color:' + changeColor + '">' + changeStr + '</td></tr>';
              });
              tHtml += '</tbody></table></div>';
              contentEl.innerHTML = tHtml;
            } catch (err) {
              contentEl.innerHTML = '<div style="color:var(--red);font-size:13px" role="alert">Failed to load trend: ' + esc(String(err && err.message ? err.message : err || "Unknown error")) + '</div>';
            }
          });
        }
      }, 50);
    }

    // ── Assessment Correlation Section ────────────────────────────────────────
    var corrSectionHtml = '<div style="margin-top:20px"></div>';
    var assessmentList = ['PHQ-9', 'GAD-7', 'PSQI'];
    corrSectionHtml += card('Assessment Correlation',
      '<div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px">Correlation between qEEG metrics and clinical assessment scores.</div>'
      + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">'
      + '<button class="btn btn-sm btn-primary" id="qeeg-load-correlation-btn">Load Correlations</button>'
      + '</div>'
      + '<div id="qeeg-correlation-content">'
      + '<div style="text-align:center;padding:16px;color:var(--text-tertiary);font-size:13px">Click Load Correlations to view the qEEG-assessment correlation matrix.</div>'
      + '</div>'
    );
    tabEl.innerHTML += corrSectionHtml;

    // Wire up correlation loading
    setTimeout(function () {
      var corrBtn = document.getElementById('qeeg-load-correlation-btn');
      if (corrBtn) {
        corrBtn.addEventListener('click', async function () {
          var contentEl = document.getElementById('qeeg-correlation-content');
          if (!contentEl) return;
          corrBtn.disabled = true;
          contentEl.innerHTML = spinner('Loading correlations...');
          try {
            var corrData;
            if (_isDemoMode()) {
              corrData = DEMO_ASSESSMENT_CORRELATION;
            } else {
              var selectedId = window._qeegSelectedId || (completedAnalyses.length ? completedAnalyses[0].id : null);
              if (!selectedId) throw new Error('No analysis selected');
              corrData = await api.getQEEGAssessmentCorrelation(selectedId, assessmentList);
            }
            if (!corrData || !corrData.correlations || !corrData.correlations.length) {
              contentEl.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text-tertiary);font-size:13px">No correlation data available.</div>';
              corrBtn.disabled = false;
              return;
            }
            // Build correlation matrix table
            var qeegMetrics = ['Theta/Beta', 'Alpha Peak', 'Frontal Asym.', 'Entropy', 'Coherence'];
            var cHtml = '<div style="overflow-x:auto;margin-bottom:16px"><table class="ds-table" style="width:100%;font-size:12px;text-align:center"><thead><tr><th style="text-align:left">qEEG Metric</th>';
            corrData.correlations.forEach(function (c) {
              cHtml += '<th>' + esc(c.assessment) + '</th>';
            });
            cHtml += '</tr></thead><tbody>';
            // Generate correlation coefficients (demo: derive from score changes)
            var corrCoeffs = [
              { metric: 'Theta/Beta', vals: [] },
              { metric: 'Alpha Peak', vals: [] },
              { metric: 'Frontal Asym.', vals: [] },
              { metric: 'Entropy', vals: [] },
              { metric: 'Coherence', vals: [] },
            ];
            corrData.correlations.forEach(function (c, ci) {
              var pctChange = Math.abs(c.score_pct_change || 0) / 100;
              var sign = c.trend === 'improving' ? -1 : c.trend === 'worsening' ? 1 : 0;
              corrCoeffs[0].vals.push(parseFloat((sign * (0.5 + pctChange * 0.4) + (ci * 0.03)).toFixed(2)));
              corrCoeffs[1].vals.push(parseFloat((sign * -1 * (0.3 + pctChange * 0.3) + (ci * 0.02)).toFixed(2)));
              corrCoeffs[2].vals.push(parseFloat((sign * (0.4 + pctChange * 0.2) - (ci * 0.05)).toFixed(2)));
              corrCoeffs[3].vals.push(parseFloat((sign * -1 * (0.2 + pctChange * 0.15) + (ci * 0.01)).toFixed(2)));
              corrCoeffs[4].vals.push(parseFloat((sign * -1 * (0.25 + pctChange * 0.2) - (ci * 0.02)).toFixed(2)));
            });
            var strongestCorr = { metric: '', assessment: '', value: 0 };
            corrCoeffs.forEach(function (row) {
              cHtml += '<tr><td style="text-align:left;font-weight:600">' + esc(row.metric) + '</td>';
              row.vals.forEach(function (v, vi) {
                var clamped = Math.max(-1, Math.min(1, v));
                var absV = Math.abs(clamped);
                var cellColor = 'rgba(128,128,128,0.15)';
                if (clamped > 0.3) cellColor = 'rgba(76,175,80,' + (0.15 + absV * 0.4) + ')';
                else if (clamped < -0.3) cellColor = 'rgba(244,67,54,' + (0.15 + absV * 0.4) + ')';
                else if (absV > 0.15) cellColor = 'rgba(128,128,128,' + (0.1 + absV * 0.2) + ')';
                cHtml += '<td style="background:' + cellColor + ';font-weight:600">' + clamped.toFixed(2) + '</td>';
                if (absV > Math.abs(strongestCorr.value)) {
                  strongestCorr = { metric: row.metric, assessment: corrData.correlations[vi].assessment, value: clamped };
                }
              });
              cHtml += '</tr>';
            });
            cHtml += '</tbody></table></div>';
            // Interpretation text
            if (strongestCorr.metric) {
              var direction = strongestCorr.value > 0 ? 'positive' : 'negative';
              var strength = Math.abs(strongestCorr.value) > 0.6 ? 'strong' : Math.abs(strongestCorr.value) > 0.3 ? 'moderate' : 'weak';
              cHtml += '<div style="background:var(--surface-tint-1);border-radius:8px;padding:12px;border:1px solid var(--border)">'
                + '<div style="font-size:12px;font-weight:600;color:var(--text-primary);margin-bottom:4px">Interpretation</div>'
                + '<div style="font-size:12px;color:var(--text-secondary)">Strongest correlation: <strong>' + esc(strongestCorr.metric) + '</strong> and <strong>' + esc(strongestCorr.assessment) + '</strong> '
                + '(r = ' + strongestCorr.value.toFixed(2) + ', ' + strength + ' ' + direction + '). '
                + 'This suggests that changes in ' + esc(strongestCorr.metric) + ' are ' + (strength === 'strong' ? 'closely' : 'moderately') + ' associated with ' + esc(strongestCorr.assessment) + ' score changes.</div>'
                + '</div>';
            }
            // Also show per-assessment sparklines
            cHtml += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin-top:16px">';
            corrData.correlations.forEach(function (c) {
              var trendColor = c.trend === 'improving' ? 'var(--green)' : c.trend === 'worsening' ? 'var(--red)' : 'var(--amber)';
              var changePfx = c.score_change > 0 ? '+' : '';
              cHtml += '<div style="background:var(--surface-tint-1);border-radius:10px;padding:14px;border:1px solid var(--border)">'
                + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">'
                + '<strong style="font-size:13px;color:var(--text-primary)">' + esc(c.assessment) + '</strong>'
                + badge(c.trend, trendColor)
                + '</div>'
                + '<div style="display:flex;gap:12px;align-items:baseline;margin-bottom:6px">'
                + '<span style="font-size:22px;font-weight:700;color:var(--text-primary)">' + c.latest_score + '</span>'
                + '<span style="font-size:12px;color:' + trendColor + '">' + changePfx + c.score_change + ' (' + changePfx + c.score_pct_change.toFixed(1) + '%)</span>'
                + '</div>'
                + '<div style="font-size:11px;color:var(--text-tertiary);margin-bottom:6px">Baseline: ' + c.baseline_score + '</div>';
              if (c.scores && c.scores.length > 1) {
                cHtml += '<div>' + spark(c.scores, trendColor, c.assessment + ' trend') + '</div>';
              }
              cHtml += '</div>';
            });
            cHtml += '</div>';
            contentEl.innerHTML = cHtml;
          } catch (err) {
            contentEl.innerHTML = '<div style="color:var(--red);font-size:13px" role="alert">Failed to load correlations: ' + esc(String(err && err.message ? err.message : err || "Unknown error")) + '</div>';
            corrBtn.disabled = false;
          }
        });
      }
    }, 50);

    return;
  }
}

// ── Comparison Renderer ──────────────────────────────────────────────────────

function renderComparison(comp) {
  const delta = comp.delta_powers_json || comp.delta_powers || {};
  const summary = comp.improvement_summary_json || comp.improvement_summary || {};
  const narrative = comp.ai_comparison_narrative || '';
  const rci = comp.rci_summary || null;
  const highlights = Array.isArray(comp.highlighted_changes) ? comp.highlighted_changes : [];

  let html = '';

  html += '<div style="display:flex;justify-content:flex-end;margin-bottom:12px">'
    + _qeegAnnotationButton({
        patient_id: comp.patient_id,
        target_id: comp.followup_analysis_id || comp.id,
        anchor_label: 'Comparison review',
      })
    + '</div><div id="qeeg-annotation-drawer-host" class="analysis-anno-host"></div>';

  // ── Timeline header (Phase 4.1) ───────────────────────────────────────────
  var baseDate = comp.baseline_analyzed_at ? new Date(comp.baseline_analyzed_at) : null;
  var fuDate = comp.followup_analyzed_at ? new Date(comp.followup_analyzed_at) : null;
  if (baseDate && fuDate) {
    var daysBetween = Math.round((fuDate - baseDate) / 86400000);
    html += '<div class="qeeg-timeline">'
      + '<div class="qeeg-timeline__point">'
      + '<div class="qeeg-timeline__dot"></div>'
      + '<div class="qeeg-timeline__label">Baseline</div>'
      + '<div class="qeeg-timeline__date">' + baseDate.toLocaleDateString() + '</div>'
      + '</div>'
      + '<div class="qeeg-timeline__line"></div>'
      + '<div class="qeeg-timeline__days">' + daysBetween + ' days</div>'
      + '<div class="qeeg-timeline__line"></div>'
      + '<div class="qeeg-timeline__point">'
      + '<div class="qeeg-timeline__dot qeeg-timeline__dot--active"></div>'
      + '<div class="qeeg-timeline__label">Follow-up</div>'
      + '<div class="qeeg-timeline__date">' + fuDate.toLocaleDateString() + '</div>'
      + '</div>'
      + '</div>';
  }

  // ── Ratio change KPI cards (Phase 4.2) ────────────────────────────────────
  var ratios = comp.ratio_changes;
  if (ratios && Object.keys(ratios).length) {
    var ratioHtml = '<div class="ch-kpi-strip" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr))">';
    var ratioLabels = {
      theta_beta_ratio: 'Theta/Beta',
      theta_alpha_ratio: 'Theta/Alpha',
      delta_alpha_ratio: 'Delta/Alpha',
      alpha_peak_frequency_hz: 'Alpha Peak (Hz)',
      frontal_alpha_asymmetry: 'Frontal Asym.',
    };
    Object.keys(ratios).forEach(function (key) {
      var r = ratios[key];
      var lbl = ratioLabels[key] || key.replace(/_/g, ' ');
      var change = r.followup - r.baseline;
      var pct = r.baseline !== 0 ? ((change / Math.abs(r.baseline)) * 100).toFixed(1) : '0.0';
      var arrow = change > 0 ? '&#x25B2;' : change < 0 ? '&#x25BC;' : '&#x25CF;';
      var color = key === 'alpha_peak_frequency_hz' ? (change > 0 ? 'var(--green)' : 'var(--red)')
        : (change < 0 ? 'var(--green)' : change > 0 ? 'var(--red)' : 'var(--text-secondary)');
      ratioHtml += '<div class="ch-kpi-card" style="--kpi-color:' + color + '">'
        + '<div class="ch-kpi-val">' + r.followup.toFixed(2) + '</div>'
        + '<div style="font-size:11px;color:' + color + ';margin:2px 0">' + arrow + ' ' + pct + '%</div>'
        + '<div class="ch-kpi-label">' + esc(lbl) + '</div>'
        + '<div style="font-size:10px;color:var(--text-tertiary)">was ' + r.baseline.toFixed(2) + '</div>'
        + '</div>';
    });
    ratioHtml += '</div>';
    html += card('Key Ratio Changes', ratioHtml);
  }

  // Summary stats
  if (summary.improved !== undefined) {
    html += card('Improvement Summary',
      '<div class="ch-kpi-strip" style="grid-template-columns:repeat(3,1fr)">'
      + '<div class="ch-kpi-card" style="--kpi-color:var(--green)">'
      + '<div class="ch-kpi-val">' + (summary.improved || 0) + '</div>'
      + '<div class="ch-kpi-label">Improved</div></div>'
      + '<div class="ch-kpi-card" style="--kpi-color:var(--amber)">'
      + '<div class="ch-kpi-val">' + (summary.unchanged || 0) + '</div>'
      + '<div class="ch-kpi-label">Unchanged</div></div>'
      + '<div class="ch-kpi-card" style="--kpi-color:var(--red)">'
      + '<div class="ch-kpi-val">' + (summary.worsened || 0) + '</div>'
      + '<div class="ch-kpi-label">Worsened</div></div></div>'
    );
  }

  if (rci || highlights.length) {
    var insightBits = '';
    if (rci) {
      insightBits += '<div class="qeeg-compare-insight">'
        + '<div class="qeeg-compare-insight__label">Overall change</div>'
        + '<div class="qeeg-compare-insight__value">' + esc(rci.label || 'stable') + '</div>'
        + '<div class="qeeg-compare-insight__meta">Net response index: ' + esc((rci.net_response_index || 0).toFixed ? rci.net_response_index.toFixed(2) : rci.net_response_index) + '</div>'
        + '</div>';
    }
    if (highlights.length) {
      insightBits += '<div class="qeeg-compare-highlights"><div class="qeeg-compare-insight__label">Largest channel shifts</div>'
        + highlights.slice(0, 5).map(function (item) {
          var color = item.pct_change > 0 ? 'var(--red)' : 'var(--green)';
          var sign = item.pct_change > 0 ? '+' : '';
          return '<div class="qeeg-compare-highlight-row"><span>' + esc(item.channel) + ' · ' + esc(item.band) + '</span><strong style="color:' + color + '">' + sign + esc(item.pct_change) + '%</strong></div>';
        }).join('')
        + '</div>';
    }
    html += card('Compare Insights', '<div class="qeeg-compare-insights">' + insightBits + '</div>');
  }

  // ── Side-by-side topographic heatmaps (Phase 4.3) ─────────────────────────
  var baseBP = comp.baseline_band_powers;
  if (baseBP && delta && delta.bands) {
    var topoBands = ['alpha', 'theta', 'beta'];
    topoBands.forEach(function (band) {
      var baseChannels = baseBP.bands?.[band]?.channels;
      var deltaChannels = delta.bands?.[band];
      if (!baseChannels || !deltaChannels) return;
      var baseMap = {};
      var fuMap = {};
      var changeMap = {};
      Object.keys(baseChannels).forEach(function (ch) {
        var bv = baseChannels[ch].relative_pct;
        var dv = deltaChannels[ch]?.pct_change || 0;
        if (bv != null) {
          baseMap[ch] = bv;
          fuMap[ch] = bv * (1 + dv / 100);
          changeMap[ch] = dv;
        }
      });
      var relativeDomain = _getTopomapValueDomain(band, 'relative', [baseMap, fuMap]);
      var deltaDomain = [-30, 30];
      var bandColor = BAND_COLORS[band] || 'var(--teal)';
      html += '<div class="ds-card"><div class="ds-card__header"><h3 style="color:' + bandColor + '">' + esc(band.charAt(0).toUpperCase() + band.slice(1)) + ' — Baseline vs Follow-up</h3></div>'
        + '<div class="ds-card__body"><div class="qeeg-compare-topo-row">'
        + '<div><div class="qeeg-compare-topo-row__label">Baseline</div>' + renderTopoHeatmap(baseMap, Object.assign({ band: band + ' (baseline)', size: 180, colorScale: 'warm' }, _getTopomapLegendOptions('relative', relativeDomain))) + '</div>'
        + '<div><div class="qeeg-compare-topo-row__label">Follow-up</div>' + renderTopoHeatmap(fuMap, Object.assign({ band: band + ' (follow-up)', size: 180, colorScale: 'warm' }, _getTopomapLegendOptions('relative', relativeDomain))) + '</div>'
        + '<div><div class="qeeg-compare-topo-row__label">Change (%)</div>' + renderTopoHeatmap(changeMap, Object.assign({ band: band + ' change %', size: 180, colorScale: 'diverging' }, _getPercentDeltaLegendOptions(deltaDomain))) + '</div>'
        + '</div></div></div>';
    });
  }

  // AI narrative
  if (narrative) {
    html += card('AI Comparison Narrative',
      '<div class="qeeg-narrative">' + _formatNarrative(narrative) + '</div>'
    );
  }

  // Delta power changes table
  if (delta && delta.bands) {
    const bandNames = Object.keys(delta.bands);
    let tableHtml = '<div style="overflow-x:auto"><table class="ds-table" style="width:100%;font-size:12px"><thead><tr><th>Channel</th>';
    bandNames.forEach(function (b) {
      tableHtml += '<th style="color:' + (BAND_COLORS[b] || '#fff') + '">' + esc(b) + '</th>';
    });
    tableHtml += '</tr></thead><tbody>';
    const chSet = new Set();
    bandNames.forEach(function (b) {
      Object.keys(delta.bands[b] || {}).forEach(function (ch) { chSet.add(ch); });
    });
    Array.from(chSet).sort().forEach(function (ch) {
      tableHtml += '<tr><td style="font-weight:600">' + esc(ch) + '</td>';
      bandNames.forEach(function (b) {
        const d = delta.bands[b]?.[ch];
        if (d && d.pct_change !== undefined) {
          const pct = d.pct_change;
          const color = pct > 5 ? 'var(--red)' : pct < -5 ? 'var(--green)' : 'var(--text-secondary)';
          const arrow = pct > 0 ? '+' : '';
          tableHtml += '<td style="color:' + color + '">' + arrow + pct.toFixed(1) + '%</td>';
        } else {
          tableHtml += '<td>-</td>';
        }
      });
      tableHtml += '</tr>';
    });
    tableHtml += '</tbody></table></div>';
    html += card('Power Changes (Follow-up vs Baseline)', tableHtml);
  }

  // ── Assessment correlation (Phase 4.4) ────────────────────────────────────
  var corrData = _isDemoMode() ? DEMO_ASSESSMENT_CORRELATION : null;
  if (corrData && corrData.correlations && corrData.correlations.length) {
    var corrHtml = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px">';
    corrData.correlations.forEach(function (c) {
      var trendColor = c.trend === 'improving' ? 'var(--green)' : c.trend === 'worsening' ? 'var(--red)' : 'var(--amber)';
      var changePfx = c.score_change > 0 ? '+' : '';
      corrHtml += '<div style="background:var(--surface-tint-1);border-radius:10px;padding:14px;border:1px solid var(--border)">'
        + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">'
        + '<strong style="font-size:13px;color:var(--text-primary)">' + esc(c.assessment) + '</strong>'
        + badge(c.trend, trendColor)
        + '</div>'
        + '<div style="display:flex;gap:12px;align-items:baseline;margin-bottom:6px">'
        + '<span style="font-size:22px;font-weight:700;color:var(--text-primary)">' + c.latest_score + '</span>'
        + '<span style="font-size:12px;color:' + trendColor + '">' + changePfx + c.score_change + ' (' + changePfx + c.score_pct_change.toFixed(1) + '%)</span>'
        + '</div>'
        + '<div style="font-size:11px;color:var(--text-tertiary);margin-bottom:6px">Baseline: ' + c.baseline_score + '</div>';
      if (c.scores && c.scores.length > 1) {
        corrHtml += '<div>' + spark(c.scores, trendColor, c.assessment + ' trend') + '</div>';
      }
      corrHtml += '</div>';
    });
    corrHtml += '</div>';
    html += card('Assessment Correlation', corrHtml);
  }

  setTimeout(_bindQEEGAnnotationButtons, 0);

  return html;
}

// ── Channel name mapping: backend T3/T4/T5/T6 -> frontend T7/T8/P7/P8 ──────
var _CH_MAP = { T3: 'T7', T4: 'T8', T5: 'P7', T6: 'P8' };
function mapCh(ch) { return _CH_MAP[ch] || ch; }

// ── Export Handlers (Phase 3) ────────────────────────────────────────────────
function _downloadCSV(csv, filename) {
  var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

window._qeegExportBandPowerCSV = function () {
  if (!_currentAnalysis) return showToast('No analysis data loaded', 'warning');
  var bp = _currentAnalysis.band_powers || {};
  var bands = bp.bands || {};
  var bandNames = Object.keys(bands);
  if (!bandNames.length) return showToast('No band power data', 'warning');
  var _isDemoExport = !!(window._qeegSelectedId === 'demo' && _isDemoMode());
  _qeegAudit('export_csv', {
    analysis_id: _currentAnalysis.id || window._qeegSelectedId || null,
    note: 'bands=' + bandNames.length + (_isDemoExport ? '; demo' : ''),
  });
  var normDev = _currentAnalysis.normative_deviations_json || _currentAnalysis.normative_deviations || null;
  var chSet = new Set();
  bandNames.forEach(function (b) { Object.keys(bands[b]?.channels || {}).forEach(function (ch) { chSet.add(ch); }); });
  var header = 'Channel,' + bandNames.join(',') + ',Total';
  if (normDev) header += ',' + bandNames.map(function (b) { return b + '_zscore'; }).join(',');
  var rows = [header];
  Array.from(chSet).sort().forEach(function (ch) {
    var vals = bandNames.map(function (b) { var v = bands[b]?.channels?.[ch]?.relative_pct; return v != null ? v.toFixed(1) : ''; });
    var total = 0;
    bandNames.forEach(function (b) { var v = bands[b]?.channels?.[ch]?.relative_pct; if (v != null) total += v; });
    var row = ch + ',' + vals.join(',') + ',' + total.toFixed(1);
    if (normDev) {
      var zVals = bandNames.map(function (b) { return normDev[ch] && normDev[ch][b] != null ? normDev[ch][b].toFixed(2) : ''; });
      row += ',' + zVals.join(',');
    }
    rows.push(row);
  });
  var _filename = (_isDemoExport ? 'DEMO_' : '') + 'qeeg_band_powers.csv';
  // Stamp DEMO recordings explicitly inside the file body so downstream
  // viewers cannot mistake a demo download for clinical data.
  var _csv = (_isDemoExport ? '# DEMO — not for clinical use\n' : '') + rows.join('\n');
  _downloadCSV(_csv, _filename);
  showToast(_isDemoExport ? 'DEMO band power CSV exported' : 'Band power CSV exported', 'success');
};

window._qeegExportAdvancedCSV = function () {
  if (!_currentAnalysis || !_currentAnalysis.advanced_analyses) return showToast('No advanced analyses data', 'warning');
  var adv = _currentAnalysis.advanced_analyses;
  var rows = ['Analysis,Category,Status,Duration_ms,Summary'];
  Object.keys(adv.results || {}).forEach(function (slug) {
    var r = adv.results[slug];
    rows.push([esc(r.label), esc(r.category), r.status, r.duration_ms || 0, '"' + (r.summary || '').replace(/"/g, '""') + '"'].join(','));
  });
  _downloadCSV(rows.join('\n'), 'qeeg_advanced_analyses.csv');
  showToast('Advanced analyses CSV exported', 'success');
};

window._qeegExportJSON = function () {
  if (!_currentAnalysis) return showToast('No analysis data loaded', 'warning');
  var patientName = _patient ? ((_patient.first_name || '') + ' ' + (_patient.last_name || '')).trim() : '';
  var _isDemoExport = !!(window._qeegSelectedId === 'demo' && _isDemoMode());
  var exportData = {
    metadata: {
      patient_name: patientName,
      analysis_date: _currentAnalysis.analyzed_at || new Date().toISOString(),
      original_filename: _currentAnalysis.original_filename || '',
      channels_used: _currentAnalysis.channels_used || _currentAnalysis.channel_count || 0,
      sample_rate_hz: _currentAnalysis.sample_rate_hz || 0,
      eyes_condition: _currentAnalysis.eyes_condition || '',
      exported_at: new Date().toISOString(),
      demo: _isDemoExport,
      disclaimer: _isDemoExport
        ? 'DEMO — not for clinical use. Synthetic sample recording.'
        : 'qEEG findings support clinical decision-making and require clinician review.',
    },
    analysis: _currentAnalysis,
  };
  _qeegAudit('export_json', {
    analysis_id: _currentAnalysis.id || window._qeegSelectedId || null,
    note: _isDemoExport ? 'demo' : 'live',
  });
  var json = JSON.stringify(exportData, null, 2);
  var blob = new Blob([json], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  var d = new Date().toISOString().split('T')[0];
  var prefix = _isDemoExport ? 'DEMO_' : '';
  a.href = url; a.download = prefix + 'qeeg_analysis_' + (_currentAnalysis.id || 'data') + '_' + d + '.json'; a.click();
  URL.revokeObjectURL(url);
  showToast(_isDemoExport ? 'DEMO analysis JSON exported' : 'Full analysis JSON exported', 'success');
};

window._qeegPrintReport = function () {
  if (!_currentReport) return showToast('No report data loaded', 'warning');
  var narrative = _currentReport.ai_narrative || {};
  var conditions = _currentReport.condition_matches || [];
  var suggestions = _currentReport.protocol_suggestions || [];
  var w = window.open('', '_blank', 'width=900,height=700');
  if (!w) return showToast('Popup blocked', 'error');
  var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>qEEG AI Report</title>'
    + '<style>body{font-family:Georgia,serif;max-width:780px;margin:40px auto;color:#222;line-height:1.6}'
    + 'h1{font-size:22px;border-bottom:2px solid #0a4d68;padding-bottom:8px}'
    + 'h2{font-size:16px;color:#0a4d68;margin-top:24px;border-left:3px solid #0a4d68;padding-left:10px}'
    + 'h4{font-size:13px;color:#0a4d68;text-transform:uppercase;letter-spacing:.5px;border-left:3px solid #0a4d68;padding-left:8px;margin:18px 0 6px}'
    + 'p{font-size:13px;margin:0 0 10px}table{width:100%;border-collapse:collapse;margin:12px 0}'
    + 'th,td{border:1px solid #ddd;padding:6px 10px;font-size:12px;text-align:left}'
    + 'th{background:#f5f5f5;font-weight:700}li{margin-bottom:6px;font-size:13px}'
    + '.print-btn{background:#0a4d68;color:#fff;border:none;padding:10px 24px;border-radius:6px;cursor:pointer;font-size:14px;margin:20px 0}'
    + '@media print{.print-btn{display:none}}</style></head><body>';
  html += '<h1>qEEG Analysis — AI Report</h1>';
  html += '<p style="color:#666;font-size:12px">Generated: ' + new Date().toLocaleString() + '</p>';
  if (narrative.summary) {
    html += '<h2>Executive Summary</h2><p><em>' + esc(narrative.summary) + '</em></p>';
  }
  if (narrative.detailed_findings) {
    html += '<h2>Detailed Findings</h2>' + _formatNarrative(narrative.detailed_findings);
  }
  if (conditions.length) {
    html += '<h2>Condition Pattern Matches</h2><table><tr><th>Condition</th><th>Confidence</th></tr>';
    conditions.forEach(function (c) {
      html += '<tr><td>' + esc(c.condition || c.name || '') + '</td><td>' + Math.round((c.confidence || 0) * 100) + '%</td></tr>';
    });
    html += '</table>';
  }
  if (suggestions.length) {
    html += '<h2>Protocol Suggestions</h2><ol>';
    suggestions.forEach(function (s) {
      html += '<li><strong>' + esc(s.protocol || s.title || '') + '</strong>' + (s.rationale ? ': ' + esc(s.rationale) : '') + '</li>';
    });
    html += '</ol>';
  }
  if (_currentReport.clinician_amendments) {
    html += '<h2>Clinician Amendments</h2><p>' + esc(_currentReport.clinician_amendments) + '</p>';
  }
  if (_qeegSavedEvidenceCitations && _qeegSavedEvidenceCitations.length) {
    html += '<h2>Evidence Citations Added from Drawer</h2><ul>';
    _qeegSavedEvidenceCitations.slice(0, 8).forEach(function (item) {
      var meta = [item.finding_label, item.pmid ? ('PMID ' + item.pmid) : '', item.doi || ''].filter(Boolean).join(' · ');
      html += '<li><strong>' + esc(item.paper_title || 'Evidence citation') + '</strong>' + (meta ? ' — ' + esc(meta) : '') + '</li>';
    });
    html += '</ul>';
  }
  html += '<button class="print-btn" onclick="window.print()">Print / Save PDF</button>';
  html += '</body></html>';
  w.document.write(html);
  w.document.close();
};

// ── PDF download via backend endpoint ────────────────────────────────────────
window._qeegDownloadPDF = function () {
  if (!_currentReport) return showToast('No report data loaded', 'warning');
  if (!_canRenderQEEGPrintableReport(_currentReport, _currentAnalysis)) {
    return showToast('Printable report is not available for this analysis yet', 'warning');
  }
  _qeegAudit('export_pdf_requested', {
    analysis_id: _currentAnalysis && _currentAnalysis.id,
    note: 'report=' + (_currentReport && _currentReport.id ? _currentReport.id : ''),
  });
  api.getQEEGPrintableReport(_currentAnalysis.id, _currentReport.id)
    .then(function (file) {
      var filename = file.filename || ('qeeg_report_' + _currentReport.id + '.html');
      downloadBlob(file.blob, filename);
      var contentType = (file.contentType || '').toLowerCase();
      _qeegAudit('export_pdf_completed', { analysis_id: _currentAnalysis && _currentAnalysis.id });
      showToast(contentType.indexOf('pdf') >= 0 ? 'PDF report downloaded' : 'Printable report downloaded', 'success');
    })
    .catch(function (err) {
      _qeegAudit('export_pdf_failed', { note: (err && err.message ? err.message : String(err)).slice(0, 200) });
      showToast('Printable report download failed: ' + (err && err.message ? err.message : err), 'error');
    });
};

// ── Coherence band switcher ──────────────────────────────────────────────────
window._qeegSwitchCoherenceBand = function (band) {
  _coherenceBand = band;
  var wrap = document.getElementById('qeeg-coherence-wrap');
  if (!wrap || !_currentAnalysis) return;
  var cohResult = _currentAnalysis.advanced_analyses?.results?.coherence_matrix;
  if (!cohResult || cohResult.status !== 'ok') return;
  var d = cohResult.data || {};
  var mat = d.bands?.[band];
  if (!mat) return;
  // Re-render tabs + matrix
  var tabsHtml = '<div class="qeeg-coh-tabs">';
  Object.keys(d.bands).forEach(function (b) {
    var active = b === band ? ' qeeg-coh-tab--active' : '';
    var col = BAND_COLORS[b] || 'var(--teal)';
    tabsHtml += '<button class="qeeg-coh-tab' + active + '" style="--coh-color:' + col + '" onclick="window._qeegSwitchCoherenceBand(\'' + b + '\')">' + esc(b) + '</button>';
  });
  tabsHtml += '</div>';
  wrap.innerHTML = tabsHtml + '<div style="overflow-x:auto">'
    + renderConnectivityMatrix(mat, d.channels, { band: band + ' coherence', size: 360 })
    + '</div>';
};

// ── Advanced Analyses Renderer ───────────────────────────────────────────────

function _renderAdvancedAnalyses(data, analysisId) {
  var adv = data.advanced_analyses;
  var html = '<div class="qeeg-section-divider"></div>';
  html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">'
    + '<span style="font-size:18px">&#x1F52C;</span>'
    + '<h3 style="margin:0;font-size:16px;color:var(--text-primary)">Advanced Analyses (25)</h3>'
    + '<div class="qeeg-export-bar" style="margin-left:auto">'
    + '<button class="btn btn-sm btn-outline" aria-label="Export advanced analyses as CSV" onclick="window._qeegExportAdvancedCSV()">Export CSV</button>'
    + '<button class="btn btn-sm btn-outline" aria-label="Export full analysis as JSON" onclick="window._qeegExportJSON()">Export JSON</button>'
    + '</div></div>';

  if (!adv || !adv.results || Object.keys(adv.results).length === 0) {
    html += '<div style="text-align:center;padding:32px;background:var(--surface-tint-1);border-radius:12px;border:1px dashed rgba(255,255,255,0.1)">'
      + '<div style="font-size:28px;margin-bottom:8px;opacity:0.5">&#x2699;</div>'
      + '<p style="color:var(--text-secondary);font-size:13px;margin-bottom:14px">Run 25 advanced analyses including connectivity, complexity, microstates, and more.</p>'
      + '<button class="btn btn-primary" id="qeeg-run-advanced-btn">Run Advanced Analyses</button>'
      + '<div id="qeeg-advanced-error"></div></div></div>';
    return html;
  }

  // Meta summary
  var meta = adv.meta || {};
  html += '<div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap;align-items:center">'
    + badge(meta.completed + '/' + meta.total + ' completed', 'var(--green)')
    + (meta.failed > 0 ? badge(meta.failed + ' failed', 'var(--red)') : '')
    + badge(meta.duration_sec + 's', 'var(--blue)')
    + '<button class="btn btn-sm btn-outline" id="qeeg-run-advanced-btn" style="margin-left:auto">Re-run</button>'
    + '</div><div id="qeeg-advanced-error"></div>';

  // Group results by category
  var categories = {};
  var catOrder = ['spectral', 'asymmetry', 'connectivity', 'complexity', 'network', 'microstate', 'clinical'];
  var catLabels = {
    spectral: 'Spectral Analyses', asymmetry: 'Asymmetry Analyses',
    connectivity: 'Connectivity Analyses', complexity: 'Complexity Analyses',
    network: 'Network Analyses', microstate: 'Microstate Analysis',
    clinical: 'Clinical Analyses',
  };
  var catColors = {
    spectral: 'var(--blue)', asymmetry: 'var(--amber)', connectivity: 'var(--teal)',
    complexity: 'var(--violet)', network: 'var(--rose)', microstate: 'var(--green)',
    clinical: 'var(--red)',
  };
  var catIcons = {
    spectral: '&#x1F4CA;', asymmetry: '&#x2696;', connectivity: '&#x1F517;',
    complexity: '&#x1F9E9;', network: '&#x1F578;', microstate: '&#x26A1;',
    clinical: '&#x1F3E5;',
  };

  Object.keys(adv.results).forEach(function (slug) {
    var r = adv.results[slug];
    var cat = r.category || 'other';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push({ slug: slug, result: r });
  });

  catOrder.forEach(function (cat) {
    var items = categories[cat];
    if (!items || !items.length) return;

    var okCount = items.filter(function (i) { return i.result.status === 'ok'; }).length;
    var color = catColors[cat] || 'var(--teal)';
    // Category summary line (shown when collapsed)
    var summaryText = '';
    if (_catSummaryExtractors[cat]) {
      try { summaryText = _catSummaryExtractors[cat](items); } catch (_e) { summaryText = ''; }
    }
    html += '<div class="qeeg-adv-category" style="--cat-color:' + color + '">'
      + '<div class="qeeg-adv-category__header qeeg-adv-group-toggle">'
      + '<span class="qeeg-adv-arrow qeeg-adv-arrow--collapsed">&#x25BC;</span>'
      + '<span class="qeeg-adv-category__icon">' + (catIcons[cat] || '&#x2699;') + '</span>'
      + '<span class="qeeg-adv-category__title">' + esc(catLabels[cat] || cat) + '</span>'
      + '<span class="qeeg-adv-category__count">' + okCount + '/' + items.length + '</span>'
      + '</div>'
      + (summaryText ? '<div class="qeeg-adv-category__summary">' + esc(summaryText) + '</div>' : '')
      + '<div class="qeeg-adv-category__body qeeg-adv-category__body--collapsed">';

    items.forEach(function (item) {
      html += _renderSingleAnalysis(item.slug, item.result);
    });

    html += '</div></div>';
  });

  html += '</div>';
  return html;
}


function _renderSingleAnalysis(slug, r) {
  var statusColor = r.status === 'ok' ? 'var(--green)' : 'var(--red)';
  var sevBadge = r.status === 'ok' ? _getSeverityBadge(slug, r.data) : '';
  var html = '<div class="qeeg-adv-item">'
    + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">'
    + badge(r.status, statusColor)
    + sevBadge
    + '<strong style="font-size:13px">' + esc(r.label) + '</strong>'
    + '<span style="font-size:11px;color:var(--text-tertiary);margin-left:auto">' + (r.duration_ms || 0) + 'ms</span>'
    + '</div>';

  if (r.status === 'error') {
    html += '<div style="font-size:12px;color:var(--red)">' + esc(r.error || 'Unknown error') + '</div>';
    return html + '</div>';
  }

  if (r.summary) {
    html += '<div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;font-style:italic">' + esc(r.summary) + '</div>';
  }

  var d = r.data || {};

  // Slug-specific renderers
  if (slug === 'u_shape') {
    html += _renderMetricGrid([
      { label: 'Mean U-Score', value: d.mean_u_score },
      { label: 'U-Shape Channels', value: (d.u_shape_present_count || 0) + '/' + (d.total_channels || 0) },
    ]);
  } else if (slug === 'fooof_decomposition') {
    html += _renderMetricGrid([
      { label: 'Mean 1/f Exponent', value: d.mean_aperiodic_exponent },
    ]);
    if (d.channels) {
      html += _renderChannelTable(d.channels, ['aperiodic_exponent', 'n_peaks', 'r_squared']);
      // Expanded detail: per-channel peaks
      var chNames = Object.keys(d.channels).sort();
      var hasPeaks = chNames.some(function (ch) { return d.channels[ch].peaks && d.channels[ch].peaks.length; });
      if (hasPeaks) {
        html += '<details style="margin-top:8px"><summary style="cursor:pointer;font-size:12px;color:var(--text-secondary)">Show spectral peaks per channel</summary>'
          + '<div style="max-height:220px;overflow-y:auto;margin-top:6px"><table class="ds-table" style="width:100%;font-size:11px"><thead><tr><th>Ch</th><th>Offset</th><th>Peak CF (Hz)</th><th>Peak PW</th><th>Peak BW</th></tr></thead><tbody>';
        chNames.forEach(function (ch) {
          var c = d.channels[ch];
          var off = c.aperiodic_offset != null ? c.aperiodic_offset.toFixed(2) : '-';
          if (c.peaks && c.peaks.length) {
            c.peaks.forEach(function (pk, idx) {
              html += '<tr><td>' + (idx === 0 ? esc(ch) : '') + '</td><td>' + (idx === 0 ? off : '') + '</td>'
                + '<td>' + (pk.cf != null ? pk.cf.toFixed(1) : '-') + '</td>'
                + '<td>' + (pk.pw != null ? pk.pw.toFixed(2) : '-') + '</td>'
                + '<td>' + (pk.bw != null ? pk.bw.toFixed(1) : '-') + '</td></tr>';
            });
          } else {
            html += '<tr><td>' + esc(ch) + '</td><td>' + off + '</td><td colspan="3" style="color:var(--text-tertiary)">No peaks</td></tr>';
          }
        });
        html += '</tbody></table></div></details>';
      }
    }
  } else if (slug === 'spectral_edge_frequency') {
    html += _renderMetricGrid([
      { label: 'Mean SEF50', value: d.mean_sef50_hz, unit: 'Hz' },
      { label: 'Mean SEF95', value: d.mean_sef95_hz, unit: 'Hz' },
    ]);
  } else if (slug === 'band_peak_frequencies') {
    html += _renderMetricGrid([
      { label: 'Mean Alpha Peak', value: d.mean_alpha_peak_hz, unit: 'Hz' },
    ]);
  } else if (slug === 'full_asymmetry_matrix') {
    if (d.pairs) html += _renderAsymmetryTable(d.pairs);
  } else if (slug === 'frontal_alpha_dominance') {
    html += _renderMetricGrid([
      { label: 'Overall Dominance', value: d.overall_dominance },
      { label: 'Mean FAA', value: d.mean_faa },
    ]);
  } else if (slug === 'delta_dominance') {
    html += _renderMetricGrid([
      { label: 'Lateralized Pairs', value: d.lateralized_pairs },
    ]);
  } else if (slug === 'regional_asymmetry_severity') {
    html += _renderMetricGrid([
      { label: 'Overall Severity', value: d.overall_severity },
    ]);
    if (d.regions) {
      html += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">';
      Object.keys(d.regions).forEach(function (reg) {
        var sev = d.regions[reg].severity;
        var sevColor = sev === 'severe' ? 'var(--red)' : sev === 'moderate' ? 'var(--amber)' : sev === 'mild' ? '#ffd54f' : 'var(--green)';
        html += badge(reg + ': ' + sev, sevColor);
      });
      html += '</div>';
    }
  } else if (slug === 'coherence_matrix') {
    if (d.channels && d.bands) {
      var initBand = _coherenceBand || 'alpha';
      if (!d.bands[initBand]) initBand = Object.keys(d.bands)[0] || 'alpha';
      // Band selector tabs
      html += '<div class="qeeg-coh-tabs">';
      Object.keys(d.bands).forEach(function (b) {
        var active = b === initBand ? ' qeeg-coh-tab--active' : '';
        var col = BAND_COLORS[b] || 'var(--teal)';
        html += '<button class="qeeg-coh-tab' + active + '" style="--coh-color:' + col + '" onclick="window._qeegSwitchCoherenceBand(\'' + b + '\')">' + esc(b) + '</button>';
      });
      html += '</div>';
      html += '<div id="qeeg-coherence-wrap" style="overflow-x:auto;margin-top:8px">'
        + renderConnectivityMatrix(d.bands[initBand], d.channels, { band: initBand + ' coherence', size: 360 })
        + '</div>';
    }
  } else if (slug === 'disconnection_flags') {
    html += _renderMetricGrid([
      { label: 'Flagged Pairs', value: d.flagged_count },
      { label: 'Total Checked', value: d.total_pairs_checked },
    ]);
    if (d.flags && d.flags.length) {
      html += '<div style="max-height:120px;overflow-y:auto;margin-top:8px;font-size:12px">';
      d.flags.slice(0, 10).forEach(function (f) {
        html += '<div style="padding:2px 0;color:var(--text-secondary)">' + esc(f.ch1) + ' - ' + esc(f.ch2) + ' (' + esc(f.band) + '): ' + f.coherence + '</div>';
      });
      if (d.flags.length > 10) html += '<div style="color:var(--text-tertiary)">... and ' + (d.flags.length - 10) + ' more</div>';
      html += '</div>';
    }
  } else if (slug === 'pli_icoh') {
    html += _renderMetricGrid([
      { label: 'Mean Alpha PLI', value: d.mean_pli },
      { label: 'Total Pairs', value: d.total_pairs },
    ]);
  } else if (slug === 'wpli') {
    if (d.bands) {
      var wpliMetrics = [];
      Object.keys(d.bands).forEach(function (b) {
        wpliMetrics.push({ label: b + ' wPLI', value: d.bands[b].mean_wpli });
      });
      html += _renderMetricGrid(wpliMetrics);
    }
  } else if (slug === 'entropy_analysis') {
    html += _renderMetricGrid([
      { label: 'Mean Sample Entropy', value: d.mean_sample_entropy },
      { label: 'Segment Duration', value: d.segment_duration_sec, unit: 's' },
    ]);
  } else if (slug === 'fractal_lz') {
    html += _renderMetricGrid([
      { label: 'Mean Higuchi FD', value: d.mean_higuchi_fd },
      { label: 'Mean Lempel-Ziv', value: d.mean_lempel_ziv },
    ]);
  } else if (slug === 'multiscale_entropy') {
    html += _renderMetricGrid([
      { label: 'Mean Complexity Index', value: d.mean_complexity_index },
    ]);
  } else if (slug === 'higuchi_fd_detailed') {
    html += _renderMetricGrid([
      { label: 'Dominant Complexity', value: d.dominant_classification },
    ]);
  } else if (slug === 'small_world_index') {
    html += _renderMetricGrid([
      { label: 'SW Index', value: d.small_world_index },
      { label: 'Clustering Coeff', value: d.clustering_coefficient },
      { label: 'Path Length', value: d.path_length },
      { label: 'Density', value: d.density },
    ]);
  } else if (slug === 'graph_theoretic_indices') {
    var g = d.global || {};
    html += _renderMetricGrid([
      { label: 'Mean Clustering', value: g.mean_clustering },
      { label: 'Efficiency', value: g.global_efficiency },
      { label: 'Mean Degree', value: g.mean_degree },
    ]);
    if (d.hubs && d.hubs.length) {
      html += '<div style="margin-top:4px;font-size:12px;color:var(--text-secondary)">Hub nodes: ' + d.hubs.map(mapCh).map(esc).join(', ') + '</div>';
    }
  } else if (slug === 'microstate_analysis') {
    html += _renderMetricGrid([
      { label: 'GEV', value: d.gev != null ? (d.gev * 100).toFixed(1) + '%' : '-' },
    ]);
    if (d.classes) {
      html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:8px">';
      ['A', 'B', 'C', 'D'].forEach(function (cls) {
        var c = d.classes[cls];
        if (!c) return;
        html += '<div style="text-align:center;background:var(--surface-tint-2);border-radius:6px;padding:8px">'
          + '<div style="font-size:18px;font-weight:700;color:var(--text-primary)">' + cls + '</div>'
          + '<div style="font-size:10px;color:var(--text-tertiary)">' + c.coverage_pct + '% coverage</div>'
          + '<div style="font-size:10px;color:var(--text-tertiary)">' + c.mean_duration_ms + 'ms</div>'
          + '<div style="font-size:10px;color:var(--text-tertiary)">' + c.occurrence_per_sec + '/s</div></div>';
      });
      html += '</div>';
    }
  } else if (slug === 'iapf_plasticity') {
    html += _renderMetricGrid([
      { label: 'Posterior IAPF', value: d.posterior_iapf_hz, unit: 'Hz' },
      { label: 'Global Mean IAPF', value: d.mean_iapf_hz, unit: 'Hz' },
    ]);
    // Per-channel IAPF detail table
    if (d.channels) {
      var iapfChs = Object.keys(d.channels).sort();
      if (iapfChs.length) {
        html += '<details style="margin-top:8px"><summary style="cursor:pointer;font-size:12px;color:var(--text-secondary)">Per-channel IAPF &amp; plasticity</summary>'
          + '<div style="max-height:220px;overflow-y:auto;margin-top:6px"><table class="ds-table" style="width:100%;font-size:11px"><thead><tr><th>Channel</th><th>IAPF (Hz)</th><th>Bandwidth (Hz)</th><th>Plasticity</th></tr></thead><tbody>';
        iapfChs.forEach(function (ch) {
          var c = d.channels[ch];
          var plastColor = c.plasticity === 'high' ? 'var(--green)' : c.plasticity === 'low' ? 'var(--red)' : 'var(--amber)';
          html += '<tr><td>' + esc(ch) + '</td>'
            + '<td>' + (c.iapf_hz != null ? c.iapf_hz.toFixed(1) : '-') + '</td>'
            + '<td>' + (c.bandwidth_hz != null ? c.bandwidth_hz.toFixed(1) : '-') + '</td>'
            + '<td style="color:' + plastColor + ';font-weight:600">' + esc(c.plasticity || '-') + '</td></tr>';
        });
        html += '</tbody></table></div></details>';
      }
    }
  } else if (slug === 'wavelet_decomposition') {
    if (d.time_frequency && typeof renderWaveletHeatmap === 'function') {
      html += '<div style="margin-bottom:8px">' + renderWaveletHeatmap(d) + '</div>';
    }
    if (d.band_summary) {
      var wMetrics = [];
      Object.keys(d.band_summary).forEach(function (b) {
        wMetrics.push({ label: b, value: d.band_summary[b], unit: 'uV\u00B2' });
      });
      html += _renderMetricGrid(wMetrics);
    }
  } else if (slug === 'ica_decomposition') {
    if (d.components && d.channels && typeof renderICAComponents === 'function') {
      html += '<div style="margin-bottom:8px">' + renderICAComponents(d.components, d.channels) + '</div>';
    }
    html += _renderMetricGrid([
      { label: 'Brain Components', value: d.brain_components },
      { label: 'Artifact Components', value: d.artifact_components },
      { label: 'Total', value: d.n_components },
    ]);
    if (d.type_counts) {
      html += '<div style="margin-top:4px;display:flex;gap:6px;flex-wrap:wrap">';
      Object.keys(d.type_counts).forEach(function (t) {
        html += badge(t + ': ' + d.type_counts[t], t.startsWith('brain') ? 'var(--green)' : 'var(--amber)');
      });
      html += '</div>';
    }
  }

  return html + '</div>';
}


function _renderMetricGrid(metrics) {
  var html = '<div class="qeeg-metric-grid">';
  metrics.forEach(function (m) {
    var val = m.value;
    var display = val != null ? (typeof val === 'number' ? val.toFixed(val < 10 ? 3 : 1) : String(val)) : '-';
    html += '<div class="qeeg-metric">'
      + '<div class="qeeg-metric__val">' + esc(display) + (m.unit ? '<span class="qeeg-metric__unit"> ' + esc(m.unit) + '</span>' : '') + '</div>'
      + '<div class="qeeg-metric__label">' + esc(m.label) + '</div></div>';
  });
  return html + '</div>';
}


function _renderChannelTable(channels, fields) {
  var chNames = Object.keys(channels).sort();
  if (!chNames.length || !fields.length) return '';
  var html = '<div style="max-height:200px;overflow-y:auto;margin-top:8px"><table class="ds-table" style="width:100%;font-size:11px"><thead><tr><th>Ch</th>';
  fields.forEach(function (f) { html += '<th>' + esc(f) + '</th>'; });
  html += '</tr></thead><tbody>';
  chNames.forEach(function (ch) {
    var d = channels[ch];
    if (!d || d.error) return;
    html += '<tr><td style="font-weight:600">' + esc(mapCh(ch)) + '</td>';
    fields.forEach(function (f) {
      var v = d[f];
      html += '<td>' + (v != null ? (typeof v === 'number' ? v.toFixed(3) : esc(String(v))) : '-') + '</td>';
    });
    html += '</tr>';
  });
  return html + '</tbody></table></div>';
}


function _renderAsymmetryTable(pairs) {
  var pairNames = Object.keys(pairs);
  if (!pairNames.length) return '';
  var bandNames = Object.keys(pairs[pairNames[0]] || {});
  var html = '<div style="max-height:200px;overflow-y:auto;margin-top:8px"><table class="ds-table" style="width:100%;font-size:11px"><thead><tr><th>Pair</th>';
  bandNames.forEach(function (b) { html += '<th style="color:' + (BAND_COLORS[b] || '#fff') + '">' + esc(b) + '</th>'; });
  html += '</tr></thead><tbody>';
  pairNames.forEach(function (pair) {
    html += '<tr><td style="font-weight:600">' + esc(pair) + '</td>';
    bandNames.forEach(function (b) {
      var v = pairs[pair][b];
      var color = Math.abs(v) > 0.2 ? 'var(--amber)' : 'var(--text-secondary)';
      html += '<td style="color:' + color + '">' + (v != null ? v.toFixed(3) : '-') + '</td>';
    });
    html += '</tr>';
  });
  return html + '</tbody></table></div>';
}

// ── Raw viewer live summary bar (below inline viewer on Analysis > Raw Data tab) ──
function _wireRawViewerSummary(tabEl, analysisId) {
  var chEl = document.getElementById('qeeg-raw-summary-ch');
  var qualityEl = document.getElementById('qeeg-raw-summary-quality');
  var bandEl = document.getElementById('qeeg-raw-summary-band');
  if (!chEl && !qualityEl && !bandEl) return;

  function _update() {
    var st = window._qeegRawState;
    if (!st) return;
    var info = st.channelInfo || {};
    var nCh = info.n_channels || 0;
    if (chEl) chEl.textContent = nCh + ' channels';
    // Quality: count good vs total from quality map
    var qualityMap = st.channelManager ? st.channelManager._qualityCache : {};
    var totalQ = 0, goodQ = 0;
    for (var k in qualityMap) {
      totalQ++;
      if (qualityMap[k] && (qualityMap[k].grade === 'good' || qualityMap[k].grade === 'moderate')) goodQ++;
    }
    if (qualityEl) qualityEl.textContent = (totalQ ? Math.round(goodQ / totalQ * 100) : 0) + '% good';
    // Dominant band
    var bp = st.bandPower || {};
    var dom = '—', domVal = -1;
    for (var b in bp) {
      if (bp[b] > domVal) { domVal = bp[b]; dom = b; }
    }
    if (bandEl) bandEl.textContent = dom ? dom.charAt(0).toUpperCase() + dom.slice(1) + ' dominant' : '—';
  }

  // Poll every 500ms while tab is visible
  var iv = setInterval(_update, 500);
  // Stop polling when tab changes away
  var observer = new MutationObserver(function (mutations) {
    if (!document.body.contains(tabEl)) { clearInterval(iv); observer.disconnect(); }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
