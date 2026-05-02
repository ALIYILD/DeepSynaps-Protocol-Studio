/**
 * Voice Analyzer — clinical decision-support UI for acoustic voice biomarkers.
 * Uploads route to POST /api/v1/audio/analyze-upload; reports include corpus + external refs.
 */

import { api } from './api.js';
import { EVIDENCE_TOTAL_PAPERS } from './evidence-dataset.js';
import {
  VOICE_DECISION_SUPPORT_FULL,
  voiceApiErrorToast,
  voicePipelineMetaBlock,
} from './voice-decision-support.js';
import { isDemoSession } from './demo-session.js';
import { ANALYZER_DEMO_FIXTURES, DEMO_FIXTURE_BANNER_HTML } from './demo-fixtures-analyzers.js';

const VA_LAST_ANALYSIS_KEY = 'ds_va_last_analysis_id';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const DISCLAIMER = VOICE_DECISION_SUPPORT_FULL;

export async function pgVoiceAnalyzer(setTopbar, navigate) {
  try {
    setTopbar({
      title: 'Voice Analyzer',
      subtitle: 'Acoustic biomarkers · neurology / neuromodulation context',
    });
  } catch {
    try { setTopbar('Voice Analyzer', 'Acoustic biomarkers'); } catch {}
  }

  const el = document.getElementById('content');
  if (!el) return;

  let lastReport = null;
  let lastAnalysisId = null;

  el.innerHTML = `
    <div class="va-shell" style="max-width:920px;margin:0 auto;padding:16px 20px 48px">
      <div style="padding:14px 16px;border-radius:12px;border:1px solid rgba(246,178,60,.35);background:rgba(246,178,60,.09);margin-bottom:20px;font-size:12px;line-height:1.45;color:var(--text-secondary)">
        <strong style="color:var(--text-primary)">Clinical decision-support.</strong> ${DISCLAIMER}
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:18px">
        <button type="button" class="btn btn-ghost btn-sm" id="va-open-evidence">Research Evidence (${EVIDENCE_TOTAL_PAPERS.toLocaleString()} papers)</button>
        <button type="button" class="btn btn-ghost btn-sm" id="va-open-biomarkers">Neuro-Biomarker Reference</button>
        <button type="button" class="btn btn-ghost btn-sm" id="va-open-deeptwin">DeepTwin 360</button>
      </div>
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:14px;padding:20px;margin-bottom:18px">
        <div style="font-weight:700;margin-bottom:6px">Upload audio</div>
        <div style="font-size:12px;color:var(--text-tertiary);margin-bottom:12px">WAV / MP3 / WebM — processed server-side when the voice pipeline is installed.</div>
        <label style="display:block;margin-bottom:10px;font-size:12px">Patient ID (optional)</label>
        <input id="va-patient-id" class="form-control" style="max-width:360px;margin-bottom:12px" placeholder="UUID or MRN-linked patient id" />
        <label style="display:block;margin-bottom:10px;font-size:12px">Task protocol</label>
        <select id="va-protocol" class="form-control" style="max-width:360px;margin-bottom:12px">
          <option value="sustained_vowel_a">Sustained vowel /a/</option>
          <option value="reading_passage">Reading passage</option>
          <option value="voluntary_cough">Voluntary cough</option>
        </select>
        <label style="display:block;margin-bottom:10px;font-size:12px">Transcript (optional, for cognitive features)</label>
        <textarea id="va-transcript" class="form-control" rows="2" style="margin-bottom:12px" placeholder="Paste transcript if available"></textarea>
        <input type="file" id="va-file" accept="audio/*" />
        <div style="margin-top:14px">
          <button type="button" class="btn btn-primary" id="va-run">Run Voice Analyzer</button>
          <span id="va-status" style="margin-left:12px;font-size:12px;color:var(--text-tertiary)"></span>
        </div>
      </div>
      <div id="va-result" style="display:none;font-size:12px;line-height:1.5"></div>
    </div>`;

  const statusEl = () => document.getElementById('va-status');
  const resultEl = () => document.getElementById('va-result');

  document.getElementById('va-open-evidence')?.addEventListener('click', () => {
    try { window._resEvidenceTab = 'search'; } catch {}
    navigate('research-evidence');
  });
  document.getElementById('va-open-biomarkers')?.addEventListener('click', () => navigate('biomarkers'));
  document.getElementById('va-open-deeptwin')?.addEventListener('click', () => {
    try { window._deeptwinPatientId = document.getElementById('va-patient-id')?.value?.trim() || window._deeptwinPatientId; } catch {}
    navigate('deeptwin');
  });

  document.getElementById('va-run')?.addEventListener('click', async () => {
    const fileInput = document.getElementById('va-file');
    const file = fileInput?.files?.[0];
    if (!file) {
      statusEl().textContent = 'Choose an audio file first.';
      return;
    }
    const pid = document.getElementById('va-patient-id')?.value?.trim() || null;
    const taskProtocol = document.getElementById('va-protocol')?.value || 'sustained_vowel_a';
    const transcript = document.getElementById('va-transcript')?.value?.trim() || null;
    statusEl().textContent = 'Uploading & analyzing…';
    try {
      const sessionId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
      const res = await api.audioAnalyzeUpload(file, {
        sessionId,
        patientId: pid,
        taskProtocol,
        transcript,
      });
      lastReport = res?.voice_report || null;
      lastAnalysisId = res?.analysis_id || null;
      _persistLastAnalysisId(lastAnalysisId);
      resultEl().style.display = '';
      resultEl().innerHTML = _renderReportHtml(res);
      statusEl().textContent = res?.ok ? 'Complete.' : 'Finished with warnings.';
    } catch (e) {
      const t = voiceApiErrorToast(e);
      statusEl().textContent = t.title + ' — ' + t.body.slice(0, 120);
      resultEl().style.display = '';
      resultEl().innerHTML = `<div style="color:#f87171;padding:12px;border-radius:10px;background:rgba(248,113,113,.08)"><strong>${esc(t.title)}</strong><br/>${esc(t.body)}</div>`;
    }
  });

  await _tryLoadPendingReport(statusEl, resultEl);

  if (isDemoSession() && resultEl().style.display === 'none') {
    resultEl().style.display = '';
    resultEl().innerHTML = DEMO_FIXTURE_BANNER_HTML + _renderReportHtml(ANALYZER_DEMO_FIXTURES.voice);
    statusEl().textContent = 'Showing demo report.';
  }
}

function _persistLastAnalysisId(id) {
  if (!id) return;
  try {
    window._lastVoiceAnalysisId = id;
  } catch (_) {}
  try {
    sessionStorage.setItem(VA_LAST_ANALYSIS_KEY, id);
  } catch (_) {}
}

async function _tryLoadPendingReport(statusEl, resultEl) {
  let id = null;
  try {
    id = window._lastVoiceAnalysisId || sessionStorage.getItem(VA_LAST_ANALYSIS_KEY);
  } catch (_) {
    id = window._lastVoiceAnalysisId;
  }
  if (!id || !api.audioGetReport) return;

  statusEl().textContent = 'Loading last analysis…';
  try {
    const rep = await api.audioGetReport(id);
    const voiceReport = rep?.voice_report || {};
    const synthetic = {
      ok: true,
      analysis_id: rep?.analysis_id || id,
      voice_report: voiceReport,
      clinical_disclaimer: rep?.clinical_disclaimer || voiceReport?.clinical_disclaimer,
    };
    resultEl().style.display = '';
    const banner =
      '<div style="margin-bottom:12px;padding:10px 12px;border-radius:10px;border:1px solid rgba(0,212,188,.28);background:rgba(0,212,188,.08);font-size:12px;color:var(--text-secondary)">'
      + '<strong style="color:var(--text-primary)">Latest saved report</strong> — loaded automatically. Upload a new file below to run another analysis.'
      + '</div>';
    resultEl().innerHTML = banner + _renderReportHtml(synthetic);
    statusEl().textContent = 'Showing stored report.';
    _persistLastAnalysisId(id);
  } catch (e) {
    if (isDemoSession()) {
      resultEl().style.display = '';
      resultEl().innerHTML = DEMO_FIXTURE_BANNER_HTML + _renderReportHtml(ANALYZER_DEMO_FIXTURES.voice);
      statusEl().textContent = 'Showing demo report.';
      try { sessionStorage.removeItem(VA_LAST_ANALYSIS_KEY); } catch (_) {}
      try { window._lastVoiceAnalysisId = null; } catch (_) {}
      return;
    }
    const t = voiceApiErrorToast(e);
    statusEl().textContent = '';
    resultEl().style.display = '';
    resultEl().innerHTML = `<div style="padding:12px;border-radius:10px;border:1px solid rgba(246,178,60,.35);background:rgba(246,178,60,.1);font-size:12px"><strong>${esc(t.title)}</strong><br/>${esc(t.body)}</div>`;
    try {
      sessionStorage.removeItem(VA_LAST_ANALYSIS_KEY);
    } catch (_) {}
    try {
      window._lastVoiceAnalysisId = null;
    } catch (_) {}
  }
}

function _renderReportHtml(res) {
  const vr = res?.voice_report || {};
  const ds = vr.decision_support || {};
  const packs = ds.evidence_packs || {};
  const ext = ds.external_resources || [];
  const aid = res?.analysis_id || '';

  let packHtml = '';
  for (const [k, v] of Object.entries(packs)) {
    if (v.error) {
      packHtml += `<div style="margin-bottom:10px"><strong>${esc(k)}</strong>: ${esc(v.error)}</div>`;
      continue;
    }
    const papers = v.supporting_papers || [];
    packHtml += `<div style="margin-bottom:14px;padding:12px;border-radius:10px;border:1px solid var(--border);background:rgba(255,255,255,.03)">
      <div style="font-weight:600;margin-bottom:6px">${esc(k)}</div>
      <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:8px">${esc(v.literature_summary || '').slice(0, 420)}${(v.literature_summary || '').length > 420 ? '…' : ''}</div>
      <div style="font-size:11px">${papers.slice(0, 5).map((p) => {
        const url = p.url || (p.doi ? `https://doi.org/${p.doi}` : '');
        const title = esc((p.title || 'Paper').slice(0, 120));
        return url
          ? `<div style="margin-bottom:4px"><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${title}</a></div>`
          : `<div style="margin-bottom:4px">${title}</div>`;
      }).join('')}
      </div></div>`;
  }

  const extHtml = ext.map((r) => `<li><a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(r.label)}</a></li>`).join('');

  return `
    <div style="padding:14px 16px;border-radius:12px;border:1px solid var(--border);background:var(--bg-card)">
      <div style="font-weight:700;margin-bottom:8px">Analysis ${aid ? esc(aid) : ''}</div>
      ${ds.disclaimer ? `<p style="font-size:11px;color:var(--text-tertiary);margin-bottom:12px">${esc(ds.disclaimer)}</p>` : ''}
      <div style="margin-bottom:12px;font-size:11px;color:var(--text-tertiary)">${esc(res?.clinical_disclaimer || '')}</div>
      ${voicePipelineMetaBlock(vr)}
      <details style="margin-bottom:12px"><summary style="cursor:pointer;font-weight:600">Structured report (JSON overview)</summary>
        <pre style="font-size:10px;overflow:auto;max-height:220px;margin-top:8px;padding:10px;border-radius:8px;background:rgba(0,0,0,.2)">${esc(JSON.stringify({ qc: vr.qc, pd_voice: vr.pd_voice, cognitive_speech: vr.cognitive_speech }, null, 2))}</pre>
      </details>
      <div style="font-weight:600;margin-bottom:8px">Evidence packs (DeepSynaps corpus)</div>
      ${packHtml || '<p style="font-size:12px;color:var(--text-tertiary)">No packs attached (patient id may be required for retrieval).</p>'}
      <div style="font-weight:600;margin:14px 0 8px">External orientation links</div>
      <ul style="margin:0;padding-left:18px;font-size:12px">${extHtml || '<li>—</li>'}</ul>
    </div>`;
}
