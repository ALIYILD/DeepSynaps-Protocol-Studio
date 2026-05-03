/**
 * Voice Analyzer — clinician-reviewed acoustic voice / speech decision-support workspace.
 * Upload routes to POST /api/v1/audio/analyze-upload; stored reports load via GET /api/v1/audio/report/{id}.
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
const VA_PATIENT_STORAGE = 'ds_pat_selected_id';

export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const DISCLAIMER = VOICE_DECISION_SUPPORT_FULL;

function _isDemoBuildFlag() {
  try {
    return !!(import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO === '1');
  } catch (_) {
    return false;
  }
}

/** Banner when preview uses bundled demo fixtures (demo token session). */
export function voiceAnalyzerDemoFixtureBanner() {
  return DEMO_FIXTURE_BANNER_HTML;
}

/** Amber strip when the SPA build is compiled with demo affordances (not necessarily demo-token session). */
export function voiceAnalyzerPreviewBuildBanner() {
  if (!_isDemoBuildFlag()) return '';
  return (
    '<div class="va-demo-build-banner" data-demo-build="true" role="note" '
    + 'style="margin-bottom:14px;padding:10px 12px;border-radius:10px;'
    + 'border:1px solid rgba(246,178,60,.35);background:rgba(246,178,60,.1);'
    + 'font-size:12px;line-height:1.45;color:var(--text-secondary)">'
    + '<strong style="color:var(--text-primary)">Preview / demo-enabled build.</strong> '
    + 'Offline demo sessions may show labelled sample reports. '
    + 'Production voice analysis requires a signed-in clinician account and an API worker with the acoustic pipeline installed.'
    + '</div>'
  );
}

function _syncPatientFromGlobal(inputId) {
  let pid = '';
  try {
    pid = window._selectedPatientId || window._profilePatientId || '';
  } catch (_) {}
  const inp = document.getElementById(inputId);
  if (inp && pid && !inp.value) inp.value = pid;
}

function _persistPatientSelection(pid) {
  try {
    window._selectedPatientId = pid || null;
    window._profilePatientId = pid || window._profilePatientId;
  } catch (_) {}
  try {
    if (pid) sessionStorage.setItem(VA_PATIENT_STORAGE, pid);
  } catch (_) {}
}

function _pickMimeType() {
  if (typeof MediaRecorder === 'undefined') return '';
  const preferred = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ];
  for (const m of preferred) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch (_) {}
  }
  return '';
}

function _fmtBytes(n) {
  if (n == null || Number.isNaN(n)) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function _fmtDur(sec) {
  if (sec == null || Number.isNaN(sec)) return '—';
  const s = Math.floor(sec % 60);
  const m = Math.floor(sec / 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Render stored / API voice analysis envelope for the results panel.
 * @param {object} res - API shape: { ok?, analysis_id, voice_report, clinical_disclaimer }
 * @param {{ demoFixture?: boolean, storedReport?: boolean }} opts
 */
export function renderVoiceReportHtml(res, opts = {}) {
  const demoFixture = !!opts.demoFixture;
  const storedReport = !!opts.storedReport;
  const vr = res?.voice_report || {};
  const dsRoot = vr.decision_support || {};
  const ds = dsRoot.evidence_packs ? dsRoot : (vr.decision_support || {});
  const packs = ds.evidence_packs || {};
  const ext = ds.external_resources || [];
  const aid = res?.analysis_id || '';
  const statusRow = res?.status ? `<div style="font-size:11px;color:var(--text-tertiary);margin-bottom:8px">Job status: <span class="font-mono">${esc(res.status)}</span></div>` : '';

  const provNote = demoFixture
    ? '<div style="margin-bottom:12px;padding:8px 10px;border-radius:8px;border:1px dashed rgba(246,178,60,.45);background:rgba(246,178,60,.06);font-size:11px;color:var(--text-secondary)"><strong>Demo/sample payload</strong> — not derived from a live upload in this session.</div>'
    : '';

  const storedNote = storedReport && !demoFixture
    ? '<div style="margin-bottom:12px;padding:8px 10px;border-radius:8px;border:1px solid rgba(0,212,188,.28);background:rgba(0,212,188,.06);font-size:11px;color:var(--text-secondary)"><strong>Stored analysis</strong> — retrieved from the clinic database for this analysis id. Confirm patient context before interpreting.</div>'
    : '';

  let packHtml = '';
  const packEntries = Object.entries(packs);
  for (const [k, v] of packEntries) {
    if (!v || typeof v !== 'object') continue;
    if (v.error) {
      packHtml += `<div style="margin-bottom:10px"><strong>${esc(k)}</strong>: ${esc(v.error)}</div>`;
      continue;
    }
    const papers = v.supporting_papers || [];
    const claim = v.claim || v.literature_summary || '';
    const conf = v.confidence_score != null ? ` · corpus confidence (retrieval heuristic): ${Number(v.confidence_score).toFixed(2)}` : '';
    const caution = v.recommended_caution ? `<div style="font-size:11px;color:#fbbf24;margin-top:6px">${esc(v.recommended_caution)}</div>` : '';
    packHtml += `<article style="margin-bottom:14px;padding:12px;border-radius:10px;border:1px solid var(--border);background:rgba(255,255,255,.03)">
      <h4 style="margin:0 0 6px;font-size:13px;font-weight:600">${esc(k)}</h4>
      <p style="font-size:11px;color:var(--text-tertiary);margin:0 0 8px;line-height:1.45">${esc(String(claim).slice(0, 520))}${String(claim).length > 520 ? '…' : ''}${esc(conf)}</p>
      ${caution}
      <div style="font-size:11px">${papers.slice(0, 6).map((p) => {
        const url = p.url || (p.doi ? `https://doi.org/${p.doi}` : '');
        const title = esc((p.title || 'Paper').slice(0, 140));
        return url
          ? `<div style="margin-bottom:4px"><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${title}</a></div>`
          : `<div style="margin-bottom:4px">${title}</div>`;
      }).join('')}
      </div></article>`;
  }

  const extHtml = ext.map((r) => `<li><a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(r.label)}</a></li>`).join('');

  const qcBlock = _renderQcSection(vr.qc);
  const acousticBlock = _renderAcousticSection(vr);
  const biomarkerBlock = _renderBiomarkerSection(vr);
  const interpBlock = _renderAiInterpretation(ds, demoFixture);
  const evidenceGov = _renderEvidenceGovernance(ds);
  const jsonPreviewKeys = ['qc', 'pd_voice', 'cognitive_speech', 'respiratory', 'dysarthria', 'acoustic_features'];
  const jsonSubset = {};
  for (const key of jsonPreviewKeys) {
    if (vr[key] != null) jsonSubset[key] = vr[key];
  }

  return `
    <div class="va-results-inner" style="padding:14px 16px;border-radius:12px;border:1px solid var(--border);background:var(--bg-card)">
      ${provNote}
      ${storedNote}
      <header style="margin-bottom:10px">
        <h3 style="margin:0 0 6px;font-size:15px;font-weight:700">Analysis ${aid ? esc(aid) : ''}</h3>
        ${statusRow}
        ${ds.disclaimer ? `<p style="font-size:11px;color:var(--text-tertiary);margin:0 0 8px;line-height:1.45">${esc(ds.disclaimer)}</p>` : ''}
        <p style="font-size:11px;color:var(--text-tertiary);margin:0;line-height:1.45">${esc(res?.clinical_disclaimer || '')}</p>
      </header>
      ${voicePipelineMetaBlock(vr)}
      ${qcBlock}
      ${acousticBlock}
      ${biomarkerBlock}
      ${interpBlock}
      ${evidenceGov}
      <section style="margin-top:14px" aria-labelledby="va-evidence-packs-h">
        <h4 id="va-evidence-packs-h" style="font-size:13px;font-weight:600;margin:0 0 8px">Literature-linked evidence packs</h4>
        ${packHtml || '<p style="font-size:12px;color:var(--text-tertiary)">No packs attached — evidence retrieval may require a patient context or the corpus may be unavailable.</p>'}
      </section>
      <section style="margin-top:14px" aria-labelledby="va-ext-links-h">
        <h4 id="va-ext-links-h" style="font-size:13px;font-weight:600;margin:0 0 8px">External orientation links</h4>
        <ul style="margin:0;padding-left:18px;font-size:12px;line-height:1.5">${extHtml || '<li style="color:var(--text-tertiary)">None listed</li>'}</ul>
      </section>
      <details style="margin-top:14px"><summary style="cursor:pointer;font-weight:600;font-size:12px">Structured analyser output (subset JSON)</summary>
        <pre style="font-size:10px;overflow:auto;max-height:240px;margin-top:8px;padding:10px;border-radius:8px;background:rgba(0,0,0,.2)" aria-label="Voice analyser JSON subset">${esc(JSON.stringify(jsonSubset, null, 2))}</pre>
      </details>
    </div>`;
}

function _renderQcSection(qc) {
  if (!qc || typeof qc !== 'object') {
    return `<section class="va-qc" style="margin-top:12px;padding:12px;border-radius:10px;border:1px solid var(--border);background:rgba(255,255,255,.02)" aria-labelledby="va-qc-h">
      <h4 id="va-qc-h" style="margin:0 0 6px;font-size:13px;font-weight:600">Audio quality (QC)</h4>
      <p style="margin:0;font-size:12px;color:var(--text-tertiary)">Quality metrics unavailable — interpret acoustic outputs cautiously and require clinician review.</p>
    </section>`;
  }
  const verdict = (qc.verdict != null && qc.verdict !== '')
    ? qc.verdict
    : (qc.usable === false ? 'warn' : qc.usable === true ? 'pass' : '');
  const snr = qc.snr_db != null ? `${Number(qc.snr_db).toFixed(1)} dB (estimated)` : 'unknown';
  const clip = qc.clip_fraction != null
    ? `${(Number(qc.clip_fraction) * 100).toFixed(2)}% clipped samples`
    : (qc.clipping_pct != null ? `${Number(qc.clipping_pct).toFixed(2)}% (legacy clipping field)` : 'unknown');
  const speech = qc.speech_ratio != null ? Number(qc.speech_ratio).toFixed(2) : (qc.voiced_ratio != null ? Number(qc.voiced_ratio).toFixed(2) : 'unknown');
  const loud = qc.loudness_lufs != null ? `${Number(qc.loudness_lufs).toFixed(1)} LUFS` : '—';
  const reasons = Array.isArray(qc.reasons) && qc.reasons.length
    ? `<ul style="margin:8px 0 0;padding-left:18px;font-size:11px;color:var(--text-secondary)">${qc.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>`
    : '';
  const engine = qc.qc_engine_version ? esc(qc.qc_engine_version) : '—';

  return `<section class="va-qc" style="margin-top:12px;padding:12px;border-radius:10px;border:1px solid var(--border);background:rgba(255,255,255,.02)" aria-labelledby="va-qc-h">
    <h4 id="va-qc-h" style="margin:0 0 8px;font-size:13px;font-weight:600">Audio quality (QC)</h4>
    <p style="font-size:11px;color:var(--text-tertiary);margin:0 0 8px;line-height:1.45">Source: server-side QC · Method: pipeline gate (see version below) · Clinician review required for all outputs.</p>
    <dl style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px 16px;margin:0;font-size:12px">
      <div><dt style="color:var(--text-tertiary);font-size:10px;text-transform:uppercase;letter-spacing:.04em">Verdict</dt><dd style="margin:0">${verdict ? esc(String(verdict)) : '—'}</dd></div>
      <div><dt style="color:var(--text-tertiary);font-size:10px;text-transform:uppercase;letter-spacing:.04em">SNR</dt><dd style="margin:0">${esc(snr)}</dd></div>
      <div><dt style="color:var(--text-tertiary);font-size:10px;text-transform:uppercase;letter-spacing:.04em">Clipping</dt><dd style="margin:0">${clip}</dd></div>
      <div><dt style="color:var(--text-tertiary);font-size:10px;text-transform:uppercase;letter-spacing:.04em">Speech / voiced ratio</dt><dd style="margin:0">${esc(speech)}</dd></div>
      <div><dt style="color:var(--text-tertiary);font-size:10px;text-transform:uppercase;letter-spacing:.04em">Loudness</dt><dd style="margin:0">${esc(loud)}</dd></div>
      <div><dt style="color:var(--text-tertiary);font-size:10px;text-transform:uppercase;letter-spacing:.04em">QC engine</dt><dd style="margin:0;font-family:var(--font-mono,monospace)">${engine}</dd></div>
    </dl>
    ${reasons}
  </section>`;
}

function _renderAcousticSection(vr) {
  const af = vr.acoustic_features || {};
  const keys = ['f0_mean_hz', 'f0_sd_hz', 'intensity_mean_db', 'intensity_sd_db', 'voiced_fraction'];
  const hasAf = keys.some((k) => af[k] != null);
  const legacyPd = vr.pd_voice || {};
  const legacyPitch = legacyPd.f0_mean_hz != null || legacyPd.jitter_local_pct != null;

  if (!hasAf && !legacyPitch) {
    return `<section style="margin-top:12px;padding:12px;border-radius:10px;border:1px dashed var(--border)" aria-labelledby="va-acoustic-h">
      <h4 id="va-acoustic-h" style="margin:0 0 6px;font-size:13px;font-weight:600">Acoustic features</h4>
      <p style="margin:0;font-size:12px;color:var(--text-tertiary)">No structured acoustic feature block in this report — pipeline stage may be unavailable or QC blocked extraction.</p>
    </section>`;
  }

  const rows = [];
  if (hasAf) {
    if (af.f0_mean_hz != null) rows.push(['F0 mean', `${Number(af.f0_mean_hz).toFixed(1)} Hz`, 'Extractor / pipeline']);
    if (af.f0_sd_hz != null) rows.push(['F0 SD', `${Number(af.f0_sd_hz).toFixed(2)} Hz`, 'Extractor / pipeline']);
    if (af.intensity_mean_db != null) rows.push(['Intensity mean', `${Number(af.intensity_mean_db).toFixed(1)} dB`, 'Extractor / pipeline']);
    if (af.intensity_sd_db != null) rows.push(['Intensity SD', `${Number(af.intensity_sd_db).toFixed(2)} dB`, 'Extractor / pipeline']);
    if (af.voiced_fraction != null) rows.push(['Voiced fraction', Number(af.voiced_fraction).toFixed(3), 'Extractor / pipeline']);
  }
  if (!hasAf && legacyPitch) {
    if (legacyPd.f0_mean_hz != null) rows.push(['F0 mean (phonation)', `${Number(legacyPd.f0_mean_hz).toFixed(1)} Hz`, 'Legacy PD-voice block']);
    if (legacyPd.jitter_local_pct != null) rows.push(['Jitter local', `${Number(legacyPd.jitter_local_pct).toFixed(3)}%`, 'Legacy PD-voice block']);
    if (legacyPd.shimmer_local_pct != null) rows.push(['Shimmer local', `${Number(legacyPd.shimmer_local_pct).toFixed(3)}%`, 'Legacy PD-voice block']);
    if (legacyPd.hnr_db != null) rows.push(['HNR', `${Number(legacyPd.hnr_db).toFixed(1)} dB`, 'Legacy PD-voice block']);
  }

  const body = rows.map(([label, val, src]) => `<tr>
    <td style="padding:6px 8px;border-bottom:1px solid var(--border)">${esc(label)}</td>
    <td style="padding:6px 8px;border-bottom:1px solid var(--border);font-family:var(--font-mono,monospace);font-size:11px">${esc(val)}</td>
    <td style="padding:6px 8px;border-bottom:1px solid var(--border);color:var(--text-tertiary);font-size:11px">${esc(src)}</td>
  </tr>`).join('');

  return `<section style="margin-top:12px;padding:12px;border-radius:10px;border:1px solid var(--border);background:rgba(255,255,255,.02)" aria-labelledby="va-acoustic-h">
    <h4 id="va-acoustic-h" style="margin:0 0 8px;font-size:13px;font-weight:600">Acoustic features</h4>
    <p style="font-size:11px;color:var(--text-tertiary);margin:0 0 8px">Units and sources as returned by the analyser — not standalone clinical findings.</p>
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead><tr>
        <th style="text-align:left;padding:6px 8px;border-bottom:1px solid var(--border);color:var(--text-tertiary);font-size:10px">Measure</th>
        <th style="text-align:left;padding:6px 8px;border-bottom:1px solid var(--border);color:var(--text-tertiary);font-size:10px">Value</th>
        <th style="text-align:left;padding:6px 8px;border-bottom:1px solid var(--border);color:var(--text-tertiary);font-size:10px">Source block</th>
      </tr></thead>
      <tbody>${body}</tbody>
    </table>
  </section>`;
}

function _renderBiomarkerSection(vr) {
  const blocks = [];
  const pd = vr.pd_voice;
  const pdLegacyMetrics = pd && typeof pd === 'object'
    && (pd.jitter_local_pct != null || pd.shimmer_local_pct != null || pd.hnr_db != null || pd.f0_mean_hz != null)
    && pd.score == null && !pd.model_name;
  if (pd && typeof pd === 'object' && (pd.score != null || pd.model_name || pdLegacyMetrics)) {
    blocks.push(`<div style="padding:10px;border-radius:8px;border:1px solid var(--border);margin-bottom:8px;background:rgba(255,255,255,.02)">
      <div style="font-weight:600;font-size:12px;margin-bottom:6px">Parkinson-style voice screening (research indicator)</div>
      <div style="font-size:11px;color:var(--text-secondary);line-height:1.45">
        ${pd.score != null ? `Score: ${esc(Number(pd.score).toFixed(3))} (0–1 model output)` : ''}
        ${pd.confidence != null ? ` · Model confidence: ${esc(Number(pd.confidence).toFixed(2))}` : ''}
        ${pd.model_name ? `<br/>Model: ${esc(pd.model_name)} ${esc(pd.model_version || '')}` : ''}
        ${pd.percentile != null ? `<br/>Normative percentile (where available): ${esc(String(pd.percentile))}` : ''}
        ${Array.isArray(pd.drivers) && pd.drivers.length ? `<br/>Drivers: ${esc(pd.drivers.slice(0, 6).join('; '))}` : ''}
        ${pdLegacyMetrics ? `<br/><span style="color:var(--text-tertiary)">Legacy phonation metrics present — correlate with motor exam; not a stand-alone disease label.</span>` : ''}
      </div>
      <p style="font-size:10px;color:#fbbf24;margin:8px 0 0">Not a diagnosis of Parkinson disease — adjunct signal only.</p>
    </div>`);
  }

  const cog = vr.cognitive_speech;
  if (cog && typeof cog === 'object') {
    const hasScore = cog.score != null && cog.model_name;
    const legacy = !hasScore && (cog.speech_rate_wpm != null || cog.pause_ratio != null);
    if (hasScore || legacy) {
      const legacyDetail = legacy
        ? `Speech rate ${cog.speech_rate_wpm != null ? esc(String(cog.speech_rate_wpm)) + ' wpm' : '—'}; pause ratio ${cog.pause_ratio != null ? esc(String(cog.pause_ratio)) : '—'}; type–token ${cog.type_token_ratio != null ? esc(String(cog.type_token_ratio)) : '—'}. (Heuristic / legacy row — not a validated score.)`
        : '';
      blocks.push(`<div style="padding:10px;border-radius:8px;border:1px solid var(--border);margin-bottom:8px;background:rgba(255,255,255,.02)">
        <div style="font-weight:600;font-size:12px;margin-bottom:6px">Cognitive / linguistic speech metrics</div>
        <div style="font-size:11px;color:var(--text-secondary);line-height:1.45">
          ${hasScore ? `Risk indicator: ${esc(Number(cog.score).toFixed(3))} · ${esc(cog.model_name || '')} ${esc(cog.model_version || '')}` : ''}
          ${legacy ? `<br/>${legacyDetail}` : ''}
          ${cog.confidence != null ? `<br/>Model confidence: ${esc(Number(cog.confidence).toFixed(2))}` : ''}
          ${Array.isArray(cog.drivers) && cog.drivers.length ? `<br/>Drivers: ${esc(cog.drivers.slice(0, 6).join('; '))}` : ''}
        </div>
        <p style="font-size:10px;color:#fbbf24;margin:8px 0 0">Not a diagnosis of dementia or MCI — requires neuropsychology / clinical correlation.</p>
      </div>`);
    }
  }

  const dys = vr.dysarthria;
  if (dys && typeof dys === 'object' && dys.severity != null) {
    blocks.push(`<div style="padding:10px;border-radius:8px;border:1px solid var(--border);margin-bottom:8px;background:rgba(255,255,255,.02)">
      <div style="font-weight:600;font-size:12px;margin-bottom:6px">Dysarthria severity (model estimate)</div>
      <div style="font-size:11px;color:var(--text-secondary)">
        Severity (0–4 scale): ${esc(Number(dys.severity).toFixed(2))}
        ${dys.subtype_hint ? ` · Subtype hint: ${esc(dys.subtype_hint)}` : ''}
        ${dys.model_name ? `<br/>Model: ${esc(dys.model_name)}` : ''}
      </div>
    </div>`);
  }

  const resp = vr.respiratory;
  if (resp && typeof resp === 'object' && resp.score != null) {
    blocks.push(`<div style="padding:10px;border-radius:8px;border:1px solid var(--border);margin-bottom:8px;background:rgba(255,255,255,.02)">
      <div style="font-weight:600;font-size:12px;margin-bottom:6px">Respiratory acoustic screening</div>
      <div style="font-size:11px;color:var(--text-secondary)">Score: ${esc(Number(resp.score).toFixed(3))} · ${esc(resp.model_name || '')}</div>
      <p style="font-size:10px;color:var(--text-tertiary);margin:8px 0 0">Wellness / screening context only — not pulmonary diagnosis.</p>
    </div>`);
  }

  if (!blocks.length) {
    return `<section style="margin-top:12px" aria-labelledby="va-bio-h">
      <h4 id="va-bio-h" style="margin:0 0 6px;font-size:13px;font-weight:600">Voice biomarker summaries</h4>
      <p style="font-size:12px;color:var(--text-tertiary);margin:0">No model-scored biomarker blocks in this payload.</p>
    </section>`;
  }

  return `<section style="margin-top:12px" aria-labelledby="va-bio-h">
    <h4 id="va-bio-h" style="margin:0 0 8px;font-size:13px;font-weight:600">Voice biomarker summaries</h4>
    ${blocks.join('')}
  </section>`;
}

function _renderAiInterpretation(ds, demoFixture) {
  const summary = ds.summary || ds.ai_summary;
  if (!summary) {
    return `<section style="margin-top:12px;padding:12px;border-radius:10px;border:1px dashed var(--border)" aria-labelledby="va-ai-h">
      <h4 id="va-ai-h" style="margin:0 0 6px;font-size:13px;font-weight:600">AI-assisted interpretation</h4>
      <p style="margin:0;font-size:12px;color:var(--text-tertiary)">No narrative summary attached — literature retrieval and acoustic outputs still require clinician review.</p>
    </section>`;
  }
  const tag = demoFixture ? ' (demo/sample wording)' : '';
  return `<section style="margin-top:12px;padding:12px;border-radius:10px;border:1px solid var(--border);background:rgba(59,130,246,.06)" aria-labelledby="va-ai-h">
    <h4 id="va-ai-h" style="margin:0 0 8px;font-size:13px;font-weight:600">AI-assisted interpretation${esc(tag)}</h4>
    <p style="font-size:12px;line-height:1.55;color:var(--text-secondary);margin:0">${esc(summary)}</p>
    <p style="font-size:11px;color:#fbbf24;margin:10px 0 0">Draft text for clinician review only — not a clinical diagnosis, staging, or treatment instruction.</p>
  </section>`;
}

function _renderEvidenceGovernance(ds) {
  const note = ds.internal_corpus_note || '';
  const targets = Array.isArray(ds.targets_queried) ? ds.targets_queried.join(', ') : '';
  return `<section style="margin-top:12px;padding:12px;border-radius:10px;border:1px solid rgba(246,178,60,.28);background:rgba(246,178,60,.06)" aria-labelledby="va-gov-h">
    <h4 id="va-gov-h" style="margin:0 0 8px;font-size:13px;font-weight:600">Evidence & governance</h4>
    <ul style="margin:0;padding-left:18px;font-size:11px;line-height:1.55;color:var(--text-secondary)">
      <li>Evidence packs use semantic retrieval over an embedded literature corpus — grades are heuristic, not guideline directives.</li>
      <li>${note ? esc(note) : 'Corpus provenance is listed per-pack when available.'}</li>
      ${targets ? `<li>Targets queried: <span class="font-mono">${esc(targets)}</span></li>` : ''}
      <li>All outputs remain clinician-reviewed decision support; autonomy limits apply (no autonomous diagnosis, triage, or protocol approval from voice alone).</li>
    </ul>
  </section>`;
}

export async function pgVoiceAnalyzer(setTopbar, navigate) {
  try {
    setTopbar({
      title: 'Voice Analyzer',
      subtitle: 'Clinician-reviewed acoustic voice / speech analysis workspace',
    });
  } catch {
    try { setTopbar('Voice Analyzer', 'Acoustic biomarkers'); } catch (_) {}
  }

  const el = document.getElementById('content');
  if (!el) return;

  let recordChunks = [];
  let mediaRecorder = null;
  let recordMime = '';
  let recordTimer = null;
  let recordStarted = 0;
  let pendingBlob = null;
  let playbackObjectUrl = null;

  const revokePlayback = () => {
    try {
      if (playbackObjectUrl) URL.revokeObjectURL(playbackObjectUrl);
    } catch (_) {}
    playbackObjectUrl = null;
  };

  el.innerHTML = `
    <div class="va-shell" style="max-width:960px;margin:0 auto;padding:16px 20px 48px">
      ${voiceAnalyzerPreviewBuildBanner()}
      <div style="padding:14px 16px;border-radius:12px;border:1px solid rgba(246,178,60,.35);background:rgba(246,178,60,.09);margin-bottom:18px;font-size:12px;line-height:1.45;color:var(--text-secondary)">
        <strong style="color:var(--text-primary)">Clinical decision-support.</strong> ${DISCLAIMER}
      </div>

      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px" class="va-linked-modules" aria-label="Linked clinical modules">
        <button type="button" class="btn btn-ghost btn-sm" data-va-nav="patient-profile">Patient profile</button>
        <button type="button" class="btn btn-ghost btn-sm" data-va-nav="assessments-hub">Assessments</button>
        <button type="button" class="btn btn-ghost btn-sm" data-va-nav="qeeg-analysis">qEEG</button>
        <button type="button" class="btn btn-ghost btn-sm" data-va-nav="mri-analysis">MRI</button>
        <button type="button" class="btn btn-ghost btn-sm" data-va-nav="video-assessments">Video</button>
        <button type="button" class="btn btn-ghost btn-sm" data-va-nav="text-analyzer">Text</button>
        <button type="button" class="btn btn-ghost btn-sm" data-va-nav="biomarkers">Biomarkers</button>
        <button type="button" class="btn btn-ghost btn-sm" data-va-nav="digital-phenotyping-analyzer">Digital phenotyping</button>
        <button type="button" class="btn btn-ghost btn-sm" data-va-nav="documents-hub">Documents</button>
        <button type="button" class="btn btn-ghost btn-sm" data-va-nav="deeptwin">DeepTwin</button>
        <button type="button" class="btn btn-ghost btn-sm" data-va-nav="protocol-studio">Protocol Studio</button>
        <button type="button" class="btn btn-ghost btn-sm" data-va-nav="brainmap-v2">Brain Map</button>
        <button type="button" class="btn btn-ghost btn-sm" data-va-nav="schedule-v2">Schedule</button>
        <button type="button" class="btn btn-ghost btn-sm" data-va-nav="clinician-inbox">Inbox</button>
        <button type="button" class="btn btn-ghost btn-sm" data-va-nav="handbooks-v2">Handbooks</button>
        <button type="button" class="btn btn-ghost btn-sm" data-va-nav="live-session">Virtual Care</button>
        <button type="button" class="btn btn-ghost btn-sm" data-va-nav="audittrail">Audit trail</button>
        <button type="button" class="btn btn-ghost btn-sm" id="va-open-evidence">Research Evidence (${EVIDENCE_TOTAL_PAPERS.toLocaleString()} papers)</button>
      </div>

      <section style="background:var(--bg-card);border:1px solid var(--border);border-radius:14px;padding:20px;margin-bottom:18px" aria-labelledby="va-patient-h">
        <h2 id="va-patient-h" style="margin:0 0 12px;font-size:16px;font-weight:700">Patient context</h2>
        <p style="font-size:12px;color:var(--text-tertiary);margin:0 0 12px;line-height:1.5">Select the patient this recording belongs to so uploads store under the correct clinic record. Voice outputs stay adjunct to examination and standardised assessments.</p>
        <label style="display:block;margin-bottom:6px;font-size:12px;font-weight:600" for="va-patient-select">Active patient</label>
        <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;margin-bottom:12px">
          <select id="va-patient-select" class="form-control" style="min-width:260px;max-width:100%" aria-label="Select patient for voice analysis">
            <option value="">Loading patients…</option>
          </select>
          <button type="button" class="btn btn-outline btn-sm" id="va-patient-clear">Clear</button>
        </div>
        <label style="display:block;margin-bottom:6px;font-size:12px" for="va-patient-id-override">Patient ID (manual override)</label>
        <input id="va-patient-id-override" class="form-control" style="max-width:420px;margin-bottom:8px" placeholder="UUID — optional if patient selected above" autocomplete="off" />
        <p style="font-size:11px;color:var(--text-tertiary);margin:0">Manual ID is sent to the API as <span class="font-mono">patient_id</span> when provided; prefer the selector to avoid transcription errors.</p>
      </section>

      <section style="background:var(--bg-card);border:1px solid var(--border);border-radius:14px;padding:20px;margin-bottom:18px" aria-labelledby="va-audio-h">
        <h2 id="va-audio-h" style="margin:0 0 8px;font-size:16px;font-weight:700">Audio capture & upload</h2>
        <p style="font-size:12px;color:var(--text-tertiary);margin:0 0 14px;line-height:1.5">
          Supported uploads: WAV, MP3, WebM, OGG, FLAC, M4A when the browser reports <span class="font-mono">audio/*</span> and the API confirms bytes (server-side validation).
          Browser recording uses MediaRecorder when available — clips stay in this browser tab until you run analysis (local-only; not an EHR save by itself).
        </p>
        <div style="display:grid;gap:14px;margin-bottom:14px">
          <div>
            <span style="font-size:12px;font-weight:600;display:block;margin-bottom:8px">Record in browser</span>
            <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
              <button type="button" class="btn btn-secondary btn-sm" id="va-rec-start" aria-label="Start microphone recording">Start recording</button>
              <button type="button" class="btn btn-secondary btn-sm" id="va-rec-stop" disabled aria-label="Stop recording">Stop</button>
              <span id="va-rec-status" style="font-size:12px;color:var(--text-tertiary)" role="status"></span>
            </div>
            <p id="va-rec-err" style="font-size:11px;color:#f87171;margin:8px 0 0;display:none"></p>
          </div>
          <div>
            <label style="font-size:12px;font-weight:600;display:block;margin-bottom:8px" for="va-file">Or upload a file</label>
            <input type="file" id="va-file" accept="audio/*,.wav,.mp3,.webm,.ogg,.flac,.m4a,audio/mpeg" aria-label="Upload audio file" />
            <div id="va-file-meta" style="font-size:11px;color:var(--text-tertiary);margin-top:6px"></div>
          </div>
        </div>
        <div id="va-local-preview-wrap" style="display:none;margin-bottom:12px;padding:12px;border-radius:10px;border:1px solid var(--border);background:rgba(255,255,255,.02)">
          <div style="font-size:12px;font-weight:600;margin-bottom:6px">Local preview (this session)</div>
          <audio id="va-local-audio" controls style="width:100%;max-width:480px" aria-label="Local recording or file preview"></audio>
          <button type="button" class="btn btn-ghost btn-xs" id="va-discard-local" style="margin-top:8px">Discard local audio</button>
        </div>
        <label style="display:block;margin-bottom:6px;font-size:12px;font-weight:600" for="va-protocol">Task protocol</label>
        <select id="va-protocol" class="form-control" style="max-width:420px;margin-bottom:14px">
          <option value="sustained_vowel_a">Sustained vowel /a/</option>
          <option value="reading_passage">Reading passage</option>
          <option value="voluntary_cough">Voluntary cough</option>
        </select>
        <label style="display:block;margin-bottom:6px;font-size:12px;font-weight:600" for="va-transcript">Transcript (optional — clinician-entered or imported text)</label>
        <p style="font-size:11px;color:var(--text-tertiary);margin:0 0 6px">Optional linguistic features use text you provide. This field is <strong>not</strong> automatic speech recognition.</p>
        <textarea id="va-transcript" class="form-control" rows="2" style="margin-bottom:14px" placeholder="Paste transcript text if available for cognitive/linguistic feature extraction"></textarea>
        <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center">
          <button type="button" class="btn btn-primary" id="va-run" aria-label="Run voice analysis on selected audio">Run Voice Analyzer</button>
          <span id="va-status" style="font-size:12px;color:var(--text-tertiary)" role="status"></span>
        </div>
      </section>

      <section id="va-patient-analyses" style="display:none;margin-bottom:18px;padding:16px;border-radius:14px;border:1px solid var(--border);background:var(--bg-card)" aria-live="polite">
        <h3 style="margin:0 0 8px;font-size:14px;font-weight:600">Recent voice analyses (selected patient)</h3>
        <p style="font-size:11px;color:var(--text-tertiary);margin:0 0 10px">Stored server-side when analysis completes successfully. Click to load.</p>
        <ul id="va-analysis-list" style="list-style:none;margin:0;padding:0;font-size:12px"></ul>
      </section>

      <section id="va-result-wrap" style="display:none;font-size:12px;line-height:1.5" aria-labelledby="va-results-h">
        <h2 id="va-results-h" class="sr-only" style="position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);border:0">Analysis results</h2>
        <div id="va-result"></div>
      </section>

      <section style="margin-top:20px;padding:14px;border-radius:12px;border:1px solid var(--border);background:rgba(255,255,255,.02);font-size:11px;line-height:1.5;color:var(--text-tertiary)" aria-labelledby="va-audit-h">
        <h3 id="va-audit-h" style="font-size:12px;font-weight:600;margin:0 0 6px;color:var(--text-secondary)">Audit note</h3>
        <p style="margin:0">Uploading or running analysis should be performed under your clinic’s policies. Server-side storage follows API persistence rules; this page does not replace signed documents or protocol approval workflows.</p>
      </section>
    </div>`;

  const statusEl = () => document.getElementById('va-status');
  const resultEl = () => document.getElementById('va-result');
  const resultWrap = () => document.getElementById('va-result-wrap');
  const fileMetaEl = () => document.getElementById('va-file-meta');
  const recErr = () => document.getElementById('va-rec-err');
  const localAudio = () => document.getElementById('va-local-audio');
  const previewWrap = () => document.getElementById('va-local-preview-wrap');

  function setPendingBlob(blob, label) {
    pendingBlob = blob;
    revokePlayback();
    const url = URL.createObjectURL(blob);
    playbackObjectUrl = url;
    const a = localAudio();
    const wrap = previewWrap();
    if (a) {
      a.src = url;
      try { a.load(); } catch (_) {}
    }
    if (wrap) wrap.style.display = '';
    if (fileMetaEl()) {
      fileMetaEl().textContent = label || `${_fmtBytes(blob.size)} · audio blob`;
    }
  }

  function clearPendingAudio() {
    pendingBlob = null;
    revokePlayback();
    const a = localAudio();
    if (a) {
      try { a.removeAttribute('src'); } catch (_) {}
      a.load?.();
    }
    if (previewWrap()) previewWrap().style.display = 'none';
    const fi = document.getElementById('va-file');
    if (fi) fi.value = '';
    if (fileMetaEl()) fileMetaEl().textContent = '';
  }

  function effectivePatientId() {
    const ov = document.getElementById('va-patient-id-override')?.value?.trim();
    if (ov) return ov;
    const sel = document.getElementById('va-patient-select')?.value?.trim();
    return sel || null;
  }

  // Navigation shortcuts
  el.querySelectorAll('[data-va-nav]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const page = btn.getAttribute('data-va-nav');
      const pid = effectivePatientId();
      if (pid) _persistPatientSelection(pid);
      try {
        window._deeptwinPatientId = pid || window._deeptwinPatientId;
      } catch (_) {}
      navigate(page);
    });
  });

  document.getElementById('va-open-evidence')?.addEventListener('click', () => {
    try { window._resEvidenceTab = 'search'; } catch (_) {}
    navigate('research-evidence');
  });

  document.getElementById('va-patient-clear')?.addEventListener('click', () => {
    const sel = document.getElementById('va-patient-select');
    const ov = document.getElementById('va-patient-id-override');
    if (sel) sel.value = '';
    if (ov) ov.value = '';
    _persistPatientSelection('');
  });

  document.getElementById('va-file')?.addEventListener('change', () => {
    const fileInput = document.getElementById('va-file');
    const file = fileInput?.files?.[0];
    if (!file) {
      clearPendingAudio();
      return;
    }
    setPendingBlob(file, `${file.name} · ${_fmtBytes(file.size)}`);
  });

  document.getElementById('va-discard-local')?.addEventListener('click', () => {
    clearPendingAudio();
    statusEl().textContent = 'Local audio cleared.';
  });

  async function refreshPatientList() {
    const sel = document.getElementById('va-patient-select');
    if (!sel) return;
    sel.innerHTML = '<option value="">— Select patient —</option>';
    try {
      const res = await api.listPatients({ limit: 200 });
      const items = res?.items || (Array.isArray(res) ? res : []);
      for (const p of items) {
        const id = p.id || p.patient_id;
        if (!id) continue;
        const name = p.display_name || p.name || 'Patient';
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = `${name} (${id.slice(0, 8)}…)`;
        sel.appendChild(opt);
      }
    } catch (_) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'Could not load patients (sign in as clinician)';
      sel.appendChild(opt);
    }
    _syncPatientFromGlobal('va-patient-id-override');
    let stored = '';
    try { stored = sessionStorage.getItem(VA_PATIENT_STORAGE) || ''; } catch (_) {}
    const want = window._selectedPatientId || stored;
    if (want) {
      sel.value = want;
      const ov = document.getElementById('va-patient-id-override');
      if (ov && !ov.value) ov.value = want;
    }
  }

  async function refreshAnalysisList(pid) {
    const sec = document.getElementById('va-patient-analyses');
    const ul = document.getElementById('va-analysis-list');
    if (!sec || !ul || !pid || !api.audioListPatientAnalyses) {
      if (sec) sec.style.display = 'none';
      return;
    }
    try {
      const res = await api.audioListPatientAnalyses(pid, 20);
      const items = res?.items || [];
      if (!items.length) {
        sec.style.display = 'none';
        return;
      }
      ul.innerHTML = items.map((it) => {
        const id = esc(it.analysis_id || '');
        const st = esc(it.status || '');
        const dt = esc(it.created_at || '');
        return `<li style="margin-bottom:6px"><button type="button" class="btn btn-ghost btn-xs va-load-analysis" data-analysis-id="${id}" style="text-align:left">${id.slice(0, 13)}… · ${st} · ${dt}</button></li>`;
      }).join('');
      sec.style.display = '';
      ul.querySelectorAll('.va-load-analysis').forEach((b) => {
        b.addEventListener('click', async () => {
          const aid = b.getAttribute('data-analysis-id');
          statusEl().textContent = 'Loading analysis…';
          try {
            const rep = await api.audioGetReport(aid);
            const voiceReport = rep?.voice_report || {};
            const synthetic = {
              ok: true,
              analysis_id: rep?.analysis_id || aid,
              voice_report: voiceReport,
              clinical_disclaimer: rep?.clinical_disclaimer || voiceReport?.clinical_disclaimer,
              status: rep?.status,
            };
            resultWrap().style.display = '';
            resultEl().innerHTML = renderVoiceReportHtml(synthetic, { storedReport: true });
            statusEl().textContent = 'Showing stored analysis.';
            _persistLastAnalysisId(aid);
          } catch (e) {
            const t = voiceApiErrorToast(e);
            statusEl().textContent = t.title;
            window._showToast?.(t.title, t.severity || 'warning');
          }
        });
      });
    } catch (_) {
      sec.style.display = 'none';
    }
  }

  document.getElementById('va-patient-select')?.addEventListener('change', (e) => {
    const v = e.target?.value?.trim() || '';
    const ov = document.getElementById('va-patient-id-override');
    if (ov && !ov.value) ov.value = v;
    _persistPatientSelection(v);
    refreshAnalysisList(v);
  });

  await refreshPatientList();
  await refreshAnalysisList(effectivePatientId());

  // Recording
  document.getElementById('va-rec-start')?.addEventListener('click', async () => {
    const errEl = recErr();
    if (errEl) errEl.style.display = 'none';
    if (!navigator.mediaDevices?.getUserMedia) {
      if (errEl) {
        errEl.textContent = 'Microphone capture is not supported in this browser.';
        errEl.style.display = '';
      }
      return;
    }
    recordMime = _pickMimeType();
    if (typeof MediaRecorder === 'undefined') {
      if (errEl) {
        errEl.textContent = 'Recording is unavailable (MediaRecorder missing).';
        errEl.style.display = '';
      }
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordChunks = [];
      mediaRecorder = recordMime
        ? new MediaRecorder(stream, { mimeType: recordMime })
        : new MediaRecorder(stream);
      mediaRecorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size) recordChunks.push(ev.data);
      };
      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((t) => { try { t.stop(); } catch (_) {} });
        const mime = mediaRecorder.mimeType || recordMime || 'audio/webm';
        const blob = new Blob(recordChunks, { type: mime });
        const ext = mime.includes('webm') ? 'webm' : mime.includes('ogg') ? 'ogg' : 'audio';
        const file = new File([blob], `voice-recording.${ext}`, { type: mime });
        const fi = document.getElementById('va-file');
        if (fi) fi.value = '';
        setPendingBlob(file, `Recorded · ${_fmtBytes(file.size)} · ${mime}`);
        document.getElementById('va-rec-status').textContent = 'Recording stopped — ready to analyze (local clip).';
      };
      mediaRecorder.start();
      recordStarted = Date.now();
      document.getElementById('va-rec-start').disabled = true;
      document.getElementById('va-rec-stop').disabled = false;
      document.getElementById('va-rec-status').textContent = 'Recording…';
      recordTimer = setInterval(() => {
        const sec = (Date.now() - recordStarted) / 1000;
        document.getElementById('va-rec-status').textContent = `Recording… ${_fmtDur(sec)}`;
      }, 500);
    } catch (err) {
      if (errEl) {
        errEl.textContent = err?.name === 'NotAllowedError'
          ? 'Microphone permission denied — enable access in browser settings or upload a file instead.'
          : `Microphone error: ${String(err?.message || err)}`;
        errEl.style.display = '';
      }
    }
  });

  document.getElementById('va-rec-stop')?.addEventListener('click', () => {
    if (recordTimer) {
      clearInterval(recordTimer);
      recordTimer = null;
    }
    try {
      if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    } catch (_) {}
    document.getElementById('va-rec-start').disabled = false;
    document.getElementById('va-rec-stop').disabled = true;
    mediaRecorder = null;
  });

  document.getElementById('va-run')?.addEventListener('click', async () => {
    let file = pendingBlob;
    if (!file) {
      const fileInput = document.getElementById('va-file');
      file = fileInput?.files?.[0] || null;
    }
    if (!file) {
      statusEl().textContent = 'Choose a file, record audio, or load a stored analysis from the list.';
      return;
    }
    const pid = effectivePatientId();
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
      resultWrap().style.display = '';
      resultEl().innerHTML = renderVoiceReportHtml(res);
      statusEl().textContent = res?.ok ? 'Analysis complete (review outputs below).' : 'Finished with warnings.';
      _persistLastAnalysisId(res?.analysis_id || null);
      if (pid) {
        refreshAnalysisList(pid);
        try {
          await api.recordPatientProfileAuditEvent(pid, {
            event: 'voice_analyzer_run',
            note: 'Voice Analyzer upload/analysis',
            using_demo_data: !!isDemoSession(),
          });
        } catch (_) {}
      }
    } catch (e) {
      const t = voiceApiErrorToast(e);
      statusEl().textContent = `${t.title} — ${t.body.slice(0, 140)}`;
      resultWrap().style.display = '';
      resultEl().innerHTML = `<div style="color:#f87171;padding:12px;border-radius:10px;background:rgba(248,113,113,.08)"><strong>${esc(t.title)}</strong><br/>${esc(t.body)}</div>`;
      window._showToast?.(t.title, t.severity || 'error');
    }
  });

  await _tryLoadPendingReport(statusEl, resultEl, resultWrap);

  if (isDemoSession() && resultWrap().style.display === 'none') {
    resultWrap().style.display = '';
    resultEl().innerHTML = voiceAnalyzerDemoFixtureBanner() + renderVoiceReportHtml(ANALYZER_DEMO_FIXTURES.voice, { demoFixture: true });
    statusEl().textContent = 'Showing labelled demo report — not from a live upload.';
  }

  window.addEventListener('beforeunload', revokePlayback, { once: true });
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

async function _tryLoadPendingReport(statusEl, resultEl, resultWrap) {
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
      status: rep?.status,
    };
    if (resultWrap) resultWrap.style.display = '';
    resultEl().innerHTML = '<div style="margin-bottom:12px;padding:10px 12px;border-radius:10px;border:1px solid rgba(0,212,188,.28);background:rgba(0,212,188,.08);font-size:12px;color:var(--text-secondary)">'
      + '<strong style="color:var(--text-primary)">Latest stored report</strong> — loaded from the server. Run a new analysis below to replace.'
      + '</div>' + renderVoiceReportHtml(synthetic, { storedReport: true });
    statusEl().textContent = 'Showing stored report.';
    _persistLastAnalysisId(id);
  } catch (e) {
    if (isDemoSession()) {
      if (resultWrap) resultWrap.style.display = '';
      resultEl().innerHTML = voiceAnalyzerDemoFixtureBanner() + renderVoiceReportHtml(ANALYZER_DEMO_FIXTURES.voice, { demoFixture: true });
      statusEl().textContent = 'Showing labelled demo report.';
      try { sessionStorage.removeItem(VA_LAST_ANALYSIS_KEY); } catch (_) {}
      try { window._lastVoiceAnalysisId = null; } catch (_) {}
      return;
    }
    const t = voiceApiErrorToast(e);
    statusEl().textContent = '';
    if (resultWrap) resultWrap.style.display = '';
    resultEl().innerHTML = `<div style="padding:12px;border-radius:10px;border:1px solid rgba(246,178,60,.35);background:rgba(246,178,60,.1);font-size:12px"><strong>${esc(t.title)}</strong><br/>${esc(t.body)}</div>`;
    try {
      sessionStorage.removeItem(VA_LAST_ANALYSIS_KEY);
    } catch (_) {}
    try {
      window._lastVoiceAnalysisId = null;
    } catch (_) {}
  }
}
