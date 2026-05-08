/**
 * Production-hardening contracts for Monitor / Biometrics Analyzer (pages-monitor.js).
 * Run: node --test src/monitor-biometrics-hardening.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

function pagesMonitorSrc() {
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  return fs.readFileSync(path.join(here, 'pages-monitor.js'), 'utf8');
}

test('GOVERNANCE_COPY is present verbatim', () => {
  const src = pagesMonitorSrc();
  assert.ok(src.includes(
    'Biometrics are clinician-reviewed decision-support signals. This page is not emergency monitoring, diagnosis, treatment approval, or protocol recommendation.',
  ));
});

test('Default tab is biometrics-analyzer', () => {
  const src = pagesMonitorSrc();
  assert.ok(src.includes("'biometrics-analyzer'"));
  assert.ok(src.includes("storedTab = 'biometrics-analyzer'"));
});

test('Biometrics tab renders required test ids', () => {
  const src = pagesMonitorSrc();
  assert.ok(src.includes('data-testid="monitor-tab-biometrics"'));
  assert.ok(src.includes('data-testid="monitor-biometrics-governance"'));
  assert.ok(src.includes('data-testid="monitor-ai-summary-unavailable"'));
  assert.ok(src.includes('data-testid="monitor-alerts-empty"'));
  assert.ok(src.includes('data-testid="monitor-biometrics-auth-gate"'));
});

test('Trends are rendered inline (doctor-ready improvement)', () => {
  const src = pagesMonitorSrc();
  assert.ok(src.includes('_renderTrendPanel'));
  assert.ok(src.includes('_sparklineSvg'));
  // The active workspace renderer uses real sparklines; legacy renderBiometricsAnalyzer may still contain the old placeholder.
  const workspaceMatch = src.match(/function renderBiometricsWorkspace\(s\)\s*\{[\s\S]*?var quickLinks/);
  assert.ok(workspaceMatch);
  assert.equal(/Trend endpoint not connected on this page yet/.test(workspaceMatch[0]), false);
});

test('No fake connected-device claims in category tiles', () => {
  const src = pagesMonitorSrc();
  assert.equal(/All healthy/i.test(src), false);
});

test('Alert empty state avoids all-clear language', () => {
  const src = pagesMonitorSrc();
  assert.equal(/all clear/i.test(src), false);
  assert.ok(src.includes('Empty queue does not mean clinically cleared'));
});

test('Clinic overview tab disclaimer — not emergency monitoring', () => {
  const src = pagesMonitorSrc();
  assert.ok(src.includes('data-testid="monitor-live-disclaimer"'));
  assert.ok(src.includes('not continuous bedside monitoring'));
});

test('renderWorkbenchKpis must not shadow esc() with escalated count', () => {
  const src = pagesMonitorSrc();
  assert.match(src, /var escalatedN = Number\(s\.escalated/);
  assert.equal(/function renderWorkbenchKpis[\s\S]*var esc = Number\(s\.escalated/.test(src), false);
});

test('LLM biometrics report generation is wired', () => {
  const src = pagesMonitorSrc();
  assert.ok(src.includes('function _generateBiometricsReport'));
  assert.ok(src.includes('function _renderBiometricsReportPanel'));
  assert.ok(src.includes('function _buildBiometricsLlmPrompt'));
  assert.ok(src.includes('window._monitorGenerateBiometricsReport'));
  assert.ok(src.includes('window._monitorSaveBiometricsReport'));
  assert.ok(src.includes('api.createReport'));
  assert.ok(src.includes('api.chatClinician'));
});

test('DeepTwin 360 context-sharing is wired from biometrics analyzer', () => {
  const src = pagesMonitorSrc();
  assert.ok(src.includes('window._monitorOpenDeepTwin360'));
  assert.ok(src.includes('window._monitorOpenDeepTwin'));
  assert.ok(src.includes("sessionStorage.setItem('ds_dt_active_tab', '360')"));
});

test('Generate Report button and DeepTwin card are present in workspace', () => {
  const src = pagesMonitorSrc();
  // The workspace renderer is large; verify key pieces exist in the file near the function.
  const workspaceMatch = src.match(/function renderBiometricsWorkspace\(s\)\s*\{[\s\S]*?\n\}\s*\/\* ── Main render ──/);
  assert.ok(workspaceMatch);
  assert.ok(/monitor-generate-report-btn/.test(workspaceMatch[0]));
  assert.ok(/_monitorOpenDeepTwin360/.test(workspaceMatch[0]));
  assert.ok(/_renderBiometricsReportPanel/.test(workspaceMatch[0]));
});

test('Multi-format report export is wired (PDF, DOCX, HTML, Markdown, JSON)', () => {
  const src = pagesMonitorSrc();
  assert.ok(src.includes('window._monitorDownloadReport'));
  assert.ok(src.includes("format === 'pdf'"));
  assert.ok(src.includes("format === 'docx'"));
  assert.ok(src.includes("format === 'html'"));
  assert.ok(src.includes("format === 'markdown'"));
  assert.ok(src.includes("format === 'json'"));
  assert.ok(src.includes('api.renderStoredReport'));
  assert.ok(src.includes('api.exportReportDocx'));
});

test('Detailed LLM prompt includes all clinical report sections', () => {
  const src = pagesMonitorSrc();
  assert.ok(src.includes('Executive Summary'));
  assert.ok(src.includes('Temporal Trends & Patterns'));
  assert.ok(src.includes('Risk Stratification & Monitoring Recommendations'));
  assert.ok(src.includes('Data Quality & Coverage Assessment'));
  assert.ok(src.includes('Inter-Metric Correlations & Clinical Interpretation'));
});

test('Personal baseline deviation panel is wired', () => {
  const src = pagesMonitorSrc();
  assert.ok(src.includes('function _computePersonalBaselines'));
  assert.ok(src.includes('function _renderBaselinePanel'));
  assert.ok(src.includes('_renderBaselinePanel(detail.summaries)'));
  assert.ok(src.includes('Z-score'));
});

test('Composite multi-metric alert rules are wired', () => {
  const src = pagesMonitorSrc();
  assert.ok(src.includes('function _computeCompositeAlerts'));
  assert.ok(src.includes('function _renderCompositeAlertsPanel'));
  assert.ok(src.includes('_renderCompositeAlertsPanel(detail.summaries)'));
  assert.ok(src.includes('autonomic_stress'));
  assert.ok(src.includes('recovery_deficit'));
  assert.ok(src.includes('multi_dysregulation'));
});

test('Treatment timeline overlay is wired on sparklines', () => {
  const src = pagesMonitorSrc();
  assert.ok(src.includes('function _loadPatientSessions'));
  assert.ok(src.includes('function _buildSessionMarkers'));
  assert.ok(src.includes('function _renderTreatmentTimelinePanel'));
  assert.ok(src.includes('function _computePrePostDeltas'));
  assert.ok(src.includes('markers: markers'));
  assert.ok(src.includes('stroke-dasharray'));
});

test('FHIR R4 export is wired in download handler', () => {
  const src = pagesMonitorSrc();
  assert.ok(src.includes("format === 'fhir'"));
  assert.ok(src.includes('function _buildFhirBiometricsBundle'));
  assert.ok(src.includes('resourceType'));
  assert.ok(src.includes('Bundle'));
  assert.ok(src.includes('Observation'));
});

test('Patient-friendly report mode is wired with toggle and save', () => {
  const src = pagesMonitorSrc();
  assert.ok(src.includes('function _generatePatientFriendlyReport'));
  assert.ok(src.includes('window._monitorSwitchReportMode'));
  assert.ok(src.includes('window._monitorSavePatientFriendlyReport'));
  assert.ok(src.includes('patientFriendlyMarkdown'));
  assert.ok(src.includes('Patient-friendly'));
});

test('Biomarkers cross-correlation panel is wired', () => {
  const src = pagesMonitorSrc();
  assert.ok(src.includes('function _renderBiomarkersCorrelationPanel'));
  assert.ok(src.includes('data-testid="monitor-biomarkers-correlation-panel"'));
  assert.ok(src.includes('Wearable-to-lab'));
  assert.ok(src.includes('Exploratory only'));
  assert.ok(src.includes('function _computeTrendDirection'));
});
test('Copy-to-clipboard handler is wired for report markdown', () => {
  const src = pagesMonitorSrc();
  assert.ok(src.includes('window._monitorCopyReportMarkdown'));
  assert.ok(src.includes('navigator.clipboard.writeText'));
});

test('Patient-friendly format is handled in scheduled auto-reports', () => {
  const src = pagesMonitorSrc();
  assert.ok(src.includes("sch.format === 'patient-friendly'"));
  assert.ok(src.includes('_generatePatientFriendlyReport'));
});
test('Data freshness indicator is wired in patient toolbar', () => {
  const src = pagesMonitorSrc();
  assert.ok(src.includes('function _computeDataFreshness'));
  assert.ok(src.includes('Last sync:'));
});

test('Expanded biomarker correlations include Vitamin D, Ferritin, Glucose, Testosterone', () => {
  const src = pagesMonitorSrc();
  assert.ok(src.includes('Vitamin D'));
  assert.ok(src.includes('Ferritin'));
  assert.ok(src.includes('Fasting Glucose'));
  assert.ok(src.includes('Testosterone'));
});
test('CSV raw data export is wired', () => {
  const src = pagesMonitorSrc();
  assert.ok(src.includes('function _buildBiometricsCsv'));
  assert.ok(src.includes("format === 'csv'"));
  assert.ok(src.includes('text/csv'));
});

test('Vital cards include day-over-day trend arrows', () => {
  const src = pagesMonitorSrc();
  assert.ok(src.includes('prevS'));
  assert.ok(src.includes('\\u2191') || src.includes('↑'));
  assert.ok(src.includes('\\u2193') || src.includes('↓'));
});
