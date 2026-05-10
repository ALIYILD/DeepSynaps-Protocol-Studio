// Shared AI Report + PDF UI helper for analyzer pages.
//
// Produces a "Generate AI Report" + "Download PDF" topbar action strip and
// a result modal that renders the unified decision-support payload returned
// by /api/v1/analyzer-reports/{analyzer_type}/{analysis_id}/ai-report.
//
// Used by: pages-mri-analysis, pages-video-assessments, pages-voice-analyzer,
// pages-movement-analyzer, pages-phenotype-analyzer, pages-labs-analyzer,
// pages-nutrition-analyzer, pages-risk-analyzer,
// pages-digital-phenotyping-analyzer, pages-deeptwin, pages-treatment-sessions-analyzer.

import { api, downloadBlob } from './api.js';
import { renderAiOutputDisclaimer } from './clinical-disclaimer.js';

const STYLE_ID = 'ds-aar-styles';

const STYLE = `
  .ds-aar-strip { display:flex; gap:8px; flex-wrap:wrap; padding:8px 12px; background:#f8fafc;
    border:1px solid #e2e8f0; border-radius:6px; margin:8px 0 12px 0; align-items:center; }
  .ds-aar-strip-label { font-size:12px; color:#475569; font-weight:600; letter-spacing:.04em;
    text-transform:uppercase; margin-right:6px; }
  .ds-aar-btn { background:#0f172a; color:#fff; border:none; padding:6px 12px; border-radius:4px;
    font-size:13px; font-weight:500; cursor:pointer; }
  .ds-aar-btn:hover { background:#1e293b; }
  .ds-aar-btn:disabled { background:#94a3b8; cursor:not-allowed; }
  .ds-aar-btn.secondary { background:#fff; color:#0f172a; border:1px solid #cbd5e1; }
  .ds-aar-btn.secondary:hover { background:#f1f5f9; }
  .ds-aar-status { font-size:12px; color:#475569; }
  .ds-aar-status.err { color:#b91c1c; font-weight:500; }
  .ds-aar-modal-bg { position:fixed; inset:0; background:rgba(15,23,42,.55); z-index:9000;
    display:flex; align-items:center; justify-content:center; padding:24px; }
  .ds-aar-modal { background:#fff; max-width:780px; width:100%; max-height:90vh; overflow-y:auto;
    border-radius:8px; padding:0; box-shadow:0 20px 50px rgba(0,0,0,.25); }
  .ds-aar-mhdr { padding:14px 20px; border-bottom:1px solid #e2e8f0;
    display:flex; align-items:center; justify-content:space-between; }
  .ds-aar-mhdr h3 { margin:0; font-size:15px; }
  .ds-aar-mclose { background:none; border:none; font-size:22px; line-height:1;
    cursor:pointer; color:#64748b; }
  .ds-aar-mbody { padding:14px 20px; }
  .ds-aar-pill { display:inline-block; padding:2px 8px; border-radius:999px;
    font-size:11px; font-weight:600; }
  .ds-aar-pill.src-llm { background:#e0e7ff; color:#3730a3; }
  .ds-aar-pill.src-fallback { background:#fee2e2; color:#991b1b; }
  .ds-aar-pill.conf-low { background:#fecaca; color:#7f1d1d; }
  .ds-aar-pill.conf-moderate { background:#fef3c7; color:#92400e; }
  .ds-aar-pill.conf-high { background:#bbf7d0; color:#14532d; }
  .ds-aar-section { margin-top:12px; }
  .ds-aar-section h4 { margin:0 0 4px 0; font-size:12px; text-transform:uppercase;
    color:#475569; letter-spacing:.04em; border-left:3px solid #0f172a; padding-left:6px; }
  .ds-aar-callout { background:#f1f5f9; border-left:3px solid #0f172a; padding:8px 10px;
    margin:4px 0; }
  .ds-aar-finding { padding:8px 10px; margin:4px 0; border:1px solid #e2e8f0;
    border-radius:4px; background:#fafafa; }
  .ds-aar-finding-row { display:flex; align-items:center; gap:8px; margin-bottom:4px; }
  .ds-aar-finding-title { font-weight:600; flex:1; font-size:13px; }
  .ds-aar-sev { color:#fff; padding:1px 8px; border-radius:999px; font-size:10px; font-weight:600; }
  .ds-aar-sev.critical { background:#9f1239; }
  .ds-aar-sev.high { background:#dc2626; }
  .ds-aar-sev.moderate { background:#d97706; }
  .ds-aar-sev.low { background:#15803d; }
  .ds-aar-conf { color:#475569; font-size:11px; }
  .ds-aar-bul { padding-left:18px; margin:4px 0; font-size:13px; }
  .ds-aar-refs { padding-left:0; list-style:none; margin:0; }
  .ds-aar-refs li { padding:6px 0; border-top:1px solid #f1f5f9; font-size:12px; }
  .ds-aar-refnum { color:#475569; font-weight:700; margin-right:6px; }
  .ds-aar-disc { background:#fffbeb; border:1px solid #fcd34d; padding:8px 10px;
    margin-top:14px; font-size:11.5px; color:#92400e; border-radius:4px; }
  .ds-aar-mfoot { padding:10px 20px; border-top:1px solid #e2e8f0; display:flex;
    gap:8px; justify-content:flex-end; align-items:center; }
`;

function _esc(value) {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _ensureStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const tag = document.createElement('style');
  tag.id = STYLE_ID;
  tag.textContent = STYLE;
  document.head.appendChild(tag);
}

function _findingsHTML(findings) {
  if (!Array.isArray(findings) || !findings.length) {
    return '<p style="color:#94a3b8;font-style:italic">No structured findings produced.</p>';
  }
  return findings.map((f) => {
    const sev = String(f && f.severity || 'moderate').toLowerCase();
    const conf = (() => {
      const v = Number(f && f.confidence);
      if (!isFinite(v)) return '—';
      return Math.max(0, Math.min(100, Math.round(v * 100))) + '%';
    })();
    return `
      <div class="ds-aar-finding">
        <div class="ds-aar-finding-row">
          <span class="ds-aar-sev ${_esc(sev)}">${_esc(sev.toUpperCase())}</span>
          <span class="ds-aar-finding-title">${_esc(f && f.title || '—')}</span>
          <span class="ds-aar-conf">conf ${_esc(conf)}</span>
        </div>
        <div>${_esc(f && f.observation || '')}</div>
      </div>
    `;
  }).join('');
}

function _bullets(items) {
  if (!Array.isArray(items) || !items.length) {
    return '<p style="color:#94a3b8;font-style:italic">None.</p>';
  }
  return '<ul class="ds-aar-bul">' + items.map((i) => `<li>${_esc(i)}</li>`).join('') + '</ul>';
}

function _refsHTML(refs) {
  if (!Array.isArray(refs) || !refs.length) {
    return '<p style="color:#94a3b8;font-style:italic">No literature retrieved.</p>';
  }
  return '<ol class="ds-aar-refs">' + refs.map((r, i) => {
    const meta = [r && r.authors, r && r.year, r && r.journal].filter(Boolean).map(_esc).join(' · ');
    const ids = [
      r && r.doi ? `DOI ${_esc(r.doi)}` : '',
      r && r.pmid ? `PMID ${_esc(r.pmid)}` : '',
    ].filter(Boolean).join(' · ');
    return `<li>
      <span class="ds-aar-refnum">[${i + 1}]</span>
      <strong>${_esc(r && r.title || '—')}</strong><br>
      <span style="color:#475569">${meta}</span><br>
      <span style="color:#64748b">${ids}</span>
    </li>`;
  }).join('') + '</ol>';
}

function _renderReportModal(result, ctx) {
  _ensureStyles();
  const data = (result && result.data) || {};
  const conf = String(data.confidence_overall || 'moderate').toLowerCase();
  const src = (result && result.source) || 'llm';
  const refs = (result && result.literature_refs) || [];

  const bg = document.createElement('div');
  bg.className = 'ds-aar-modal-bg';
  bg.innerHTML = `
      <div class="ds-aar-modal" role="dialog" aria-modal="true">
      <div class="ds-aar-mhdr">
        <div>
          <h3>${_esc(result.title || ctx.label || 'AI Decision Support Report')}</h3>
          <div style="margin-top:4px">
            <span class="ds-aar-pill src-${src === 'llm' ? 'llm' : 'fallback'}">SOURCE: ${_esc(src.toUpperCase())}</span>
            <span class="ds-aar-pill conf-${_esc(conf)}" style="margin-left:6px">CONFIDENCE: ${_esc(conf.toUpperCase())}</span>
          </div>
        </div>
        <button class="ds-aar-mclose" aria-label="Close">×</button>
      </div>
      <div class="ds-aar-mbody">
        ${renderAiOutputDisclaimer({ compact: false, marginBottom: 14 })}
        <div class="ds-aar-section"><h4>Executive summary</h4>
          <div class="ds-aar-callout">${_esc(data.executive_summary || 'Not produced.')}</div></div>
        <div class="ds-aar-section"><h4>Key findings</h4>${_findingsHTML(data.key_findings)}</div>
        <div class="ds-aar-section"><h4>Clinical significance</h4>
          <p>${_esc(data.clinical_significance || 'Not produced.')}</p></div>
        <div class="ds-aar-section"><h4>Differential considerations</h4>
          ${_bullets(data.differential_considerations)}</div>
        <div class="ds-aar-section"><h4>Recommended follow-up</h4>
          ${_bullets(data.recommended_followup)}</div>
        <div class="ds-aar-section"><h4>Decision-support notes</h4>
          <p>${_esc(data.decision_support_notes || 'Not produced.')}</p></div>
        <div class="ds-aar-section"><h4>Limitations</h4>
          ${_bullets(data.limitations)}</div>
        <div class="ds-aar-section"><h4>Literature references</h4>
          ${_refsHTML(refs)}</div>
      </div>
      <div class="ds-aar-mfoot">
        <span style="flex:1;font-size:11px;color:#64748b">
          prompt ${_esc(String(result.prompt_hash || '').slice(0, 12))} · generated ${_esc(result.generated_at || '')}
        </span>
        <button class="ds-aar-btn secondary" data-act="close">Close</button>
        <button class="ds-aar-btn" data-act="pdf">Download PDF</button>
      </div>
    </div>
  `;

  function close() { bg.remove(); }
  bg.addEventListener('click', (ev) => { if (ev.target === bg) close(); });
  bg.querySelector('.ds-aar-mclose').addEventListener('click', close);
  bg.querySelector('[data-act="close"]').addEventListener('click', close);
  bg.querySelector('[data-act="pdf"]').addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    btn.disabled = true; btn.textContent = 'Rendering…';
    try {
      const blob = await api.downloadAnalyzerReportPDF(ctx.analyzerType, ctx.analysisId, {
        patientContext: ctx.patientContext || undefined,
      });
      const filename = (blob && blob.filename)
        || `${ctx.analyzerType}_decision_support_${String(ctx.analysisId).slice(0, 8)}.pdf`;
      downloadBlob(blob.blob || blob, filename);
    } catch (err) {
      alert('PDF download failed: ' + (err && err.message || err));
    } finally {
      btn.disabled = false; btn.textContent = 'Download PDF';
    }
  });

  document.body.appendChild(bg);
}

/**
 * Mount a "Generate AI Report" + "Download PDF" action strip into a container.
 *
 * Required opts:
 *   - container: HTMLElement to append into
 *   - analyzerType: registry key (mri, voice, video_assessment, movement,
 *     phenotype, labs, nutrition, risk, digital_phenotyping, deeptwin,
 *     treatment_sessions)
 *   - getAnalysisId: () => string  (patient_id for per-patient analyzers,
 *     row id for row-keyed analyzers)
 *
 * Optional:
 *   - getPatientContext: () => string — clinician-supplied free text
 *   - label: string — strip label (default "AI Decision Support")
 */
export function mountAnalyzerAIReportStrip(opts) {
  if (!opts || typeof document === 'undefined') return null;
  _ensureStyles();
  const container = opts.container;
  if (!container) return null;

  const strip = document.createElement('div');
  strip.className = 'ds-aar-strip';
  strip.dataset.analyzerType = opts.analyzerType;
  strip.innerHTML = `
    <span class="ds-aar-strip-label">${_esc(opts.label || 'AI Decision Support')}</span>
    <button class="ds-aar-btn" data-act="generate">Generate AI Report</button>
    <button class="ds-aar-btn secondary" data-act="pdf">Download PDF</button>
    <span class="ds-aar-status" data-role="status"></span>
  `;
  container.appendChild(strip);

  const statusEl = strip.querySelector('[data-role="status"]');
  function _status(msg, isErr) {
    if (!statusEl) return;
    statusEl.textContent = msg || '';
    statusEl.classList.toggle('err', !!isErr);
  }

  async function _resolveCtx() {
    const analysisId = typeof opts.getAnalysisId === 'function' ? opts.getAnalysisId() : null;
    if (!analysisId) {
      _status('No analysis selected.', true);
      return null;
    }
    const patientContext = typeof opts.getPatientContext === 'function'
      ? (opts.getPatientContext() || '') : '';
    return {
      analyzerType: opts.analyzerType,
      analysisId,
      patientContext,
      label: opts.label,
    };
  }

  strip.querySelector('[data-act="generate"]').addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    const ctx = await _resolveCtx();
    if (!ctx) return;
    btn.disabled = true;
    _status('Generating decision-support narrative…');
    try {
      const result = await api.generateAnalyzerAIReport(ctx.analyzerType, ctx.analysisId, {
        patient_context: ctx.patientContext || null,
      });
      _status(result && result.source === 'llm'
        ? `Report ready (${(result.literature_refs || []).length} refs).`
        : 'Fallback report (LLM unavailable).');
      _renderReportModal(result, ctx);
    } catch (err) {
      _status('Error: ' + (err && err.message || 'failed'), true);
    } finally {
      btn.disabled = false;
    }
  });

  strip.querySelector('[data-act="pdf"]').addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    const ctx = await _resolveCtx();
    if (!ctx) return;
    btn.disabled = true;
    _status('Rendering PDF…');
    try {
      const blob = await api.downloadAnalyzerReportPDF(ctx.analyzerType, ctx.analysisId, {
        patientContext: ctx.patientContext || undefined,
      });
      const filename = (blob && blob.filename)
        || `${ctx.analyzerType}_decision_support_${String(ctx.analysisId).slice(0, 8)}.pdf`;
      downloadBlob(blob.blob || blob, filename);
      _status('PDF download started.');
    } catch (err) {
      _status('PDF error: ' + (err && err.message || 'failed'), true);
    } finally {
      btn.disabled = false;
    }
  });

  return strip;
}

export default { mountAnalyzerAIReportStrip };
