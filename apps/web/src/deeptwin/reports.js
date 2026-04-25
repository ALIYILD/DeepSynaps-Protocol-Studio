// DeepTwin reports — 8 report kinds rendered as UI objects with optional
// JSON / Markdown download. PDF export is intentionally deferred.

import { generateTwinReport } from './service.js';
import { escHtml } from './safety.js';

export const REPORT_KINDS = [
  { id: 'clinician_deep',     label: 'Clinician deep report' },
  { id: 'patient_progress',   label: 'Patient-friendly progress' },
  { id: 'prediction',         label: 'Prediction report' },
  { id: 'correlation',        label: 'Correlation report' },
  { id: 'causal',             label: 'Causal hypothesis report' },
  { id: 'simulation',         label: 'Simulation report' },
  { id: 'governance',         label: 'Safety & governance' },
  { id: 'data_completeness',  label: 'Data completeness' },
];

export async function buildReport(patientId, kind, extras = {}) {
  return generateTwinReport(patientId, { kind, ...extras });
}

export function reportToMarkdown(report) {
  const lines = [
    `# ${report.title || report.kind}`,
    `_patient_id: \`${report.patient_id}\` · generated_at: ${report.generated_at}_`,
    '',
    `**Evidence grade:** ${report.evidence_grade || 'moderate'}`,
    '',
    '## Data sources used',
    ...((report.data_sources_used || []).map(s => `- ${s}`)),
    '',
    '## Limitations',
    ...((report.limitations || []).map(s => `- ${s}`)),
    '',
    '## Review points',
    ...((report.review_points || []).map(s => `- ${s}`)),
    '',
    '## Audit references',
    ...((report.audit_refs || []).map(s => `- \`${s}\``)),
    '',
    '---',
    '_Decision-support only. Outputs are model-estimated hypotheses, not prescriptions._',
  ];
  return lines.join('\n');
}

export function reportToJSONString(report) {
  return JSON.stringify(report, null, 2);
}

export function downloadBlob(filename, content, mime = 'application/json') {
  try {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 200);
  } catch (e) {
    if (window._showToast) window._showToast('Could not download: ' + (e.message || e), 'warning');
  }
}

export function renderReportPreview(report) {
  const lim = (report.limitations || []).map(s => `<li>${escHtml(s)}</li>`).join('');
  const rev = (report.review_points || []).map(s => `<li>${escHtml(s)}</li>`).join('');
  const src = (report.data_sources_used || []).map(s => `<span class="dt-chip dt-chip-muted">${escHtml(s)}</span>`).join(' ');
  const aud = (report.audit_refs || []).map(s => `<code>${escHtml(s)}</code>`).join(' · ');
  return `
    <div class="dt-report">
      <div class="dt-report-head">
        <div>
          <div class="dt-report-title">${escHtml(report.title || report.kind)}</div>
          <div class="dt-report-meta">${escHtml(report.patient_id)} · ${escHtml(report.generated_at || '')}</div>
        </div>
        <span class="dt-grade dt-grade-${escHtml(report.evidence_grade || 'moderate')}">Evidence: ${escHtml(report.evidence_grade || 'moderate')}</span>
      </div>
      ${src ? `<div class="dt-report-row"><span class="dt-report-k">Sources</span><span>${src}</span></div>` : ''}
      ${rev ? `<div class="dt-report-row"><span class="dt-report-k">Review points</span><ul class="dt-report-list">${rev}</ul></div>` : ''}
      ${lim ? `<div class="dt-report-row"><span class="dt-report-k">Limitations</span><ul class="dt-report-list">${lim}</ul></div>` : ''}
      ${aud ? `<div class="dt-report-row"><span class="dt-report-k">Audit</span><span style="font-family:var(--font-mono,monospace);font-size:11px;color:var(--text-tertiary)">${aud}</span></div>` : ''}
    </div>
  `;
}
