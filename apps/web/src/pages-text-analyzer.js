/**
 * Clinical Text Analyzer — OpenMed / heuristic-backed NLP for free-text notes.
 *
 * API: `clinical_text_router.py` — POST analyze, extract-pii, deidentify; GET health.
 * Decision-support only: entities are extracted mentions, not confirmed diagnoses
 * or active medications.
 */

import { api } from './api.js';
import { isDemoSession } from './demo-session.js';
import { ANALYZER_DEMO_FIXTURES, DEMO_FIXTURE_BANNER_HTML } from './demo-fixtures-analyzers.js';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _isDemoBuild() {
  try {
    return !!(import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO === '1');
  } catch (_) {
    return false;
  }
}

function _demoBuildBanner() {
  if (!_isDemoBuild()) return '';
  return '<div data-demo="true" data-testid="text-analyzer-demo-banner" role="note"'
    + ' style="margin-bottom:14px;padding:10px 12px;border-radius:10px;'
    + 'border:1px solid rgba(246,178,60,.35);background:rgba(246,178,60,.1);'
    + 'font-size:12px;line-height:1.45;color:var(--text-secondary)">'
    + '<strong style="color:var(--text-primary)">Demo / preview build.</strong> '
    + 'Use a clinician session against the hosted API for live extraction. '
    + 'This page does not store pasted text in the EHR unless a future documents '
    + 'integration is completed — text in the box is local to this browser session.'
    + '</div>';
}

const DISCLAIMER = 'This workspace provides AI-assisted text review and rule-based or '
  + 'model-based extraction. Output is not a diagnosis, prescription, protocol '
  + 'recommendation, or safety triage. Every finding requires clinician review before '
  + 'use in care, billing, or legal contexts.';

const ILLUSTRATIVE_SAMPLE = '**Demo sample note (illustrative only — not a real patient record)**\n\n'
  + 'Patient example, 40 y/o, with anxiety and sleep concerns. Currently on an SSRI '
  + 'and sleep hygiene support. Plan: follow-up in four weeks. Contact on file for clinic use.';

/** Map UI source type values to API `source_type` (see `openmed/schemas.py` SourceType). */
export function toApiSourceType(v) {
  const m = {
    free_text: 'free_text',
    clinical_note: 'clinician_note',
    discharge_summary: 'document_text',
    referral_letter: 'referral',
    research_note: 'transcript',
  };
  return m[v] || 'free_text';
}

function _spanLabel(e) {
  if (e && e.span && typeof e.span.start === 'number' && typeof e.span.end === 'number') {
    return `chars ${e.span.start}–${e.span.end}`;
  }
  if (e && typeof e.start === 'number' && typeof e.end === 'number') {
    return `chars ${e.start}–${e.end}`;
  }
  return '—';
}

function _confidenceLabel(e) {
  const c = e?.confidence ?? e?.score;
  if (c == null || Number.isNaN(Number(c))) return 'Unavailable — review required';
  const n = Number(c);
  if (n > 1) return n.toFixed(2);
  return n.toFixed(2);
}

/**
 * Normalise entity rows from analyze (clinical entities) or PII lists.
 * @param {object} res
 * @param {'entity'|'pii'} kind
 */
export function normaliseEntityRows(res, kind) {
  const raw = kind === 'pii'
    ? (res?.pii || res?.pii_spans || res?.spans || res?.entities || [])
    : (res?.entities || res?.spans || []);
  if (!Array.isArray(raw)) return [];
  return raw.map((e) => ({
    text: e.text ?? e.value ?? e.span_text ?? '',
    label: e.label ?? e.type ?? e.category ?? '—',
    confidence: _confidenceLabel(e),
    span: _spanLabel(e),
    source: e.source ?? (kind === 'pii' ? 'pii_detector' : 'extractor'),
    method: kind === 'pii' ? 'PII span detection' : 'Clinical entity extraction',
  }));
}

function _renderEntityTable(rows, opt = {}) {
  const titleHint = opt.title || 'Extracted spans';
  if (!rows.length) {
    return `<div style="color:var(--text-tertiary);font-size:12px;padding:8px 0">No spans returned for this pass.</div>`;
  }
  const rowsHtml = rows.slice(0, 300).map((r) => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid var(--border);font-size:12px;vertical-align:top">${esc(r.text)}</td>
      <td style="padding:8px;border-bottom:1px solid var(--border);color:var(--text-secondary);font-size:12px;vertical-align:top">${esc(r.label)}</td>
      <td style="padding:8px;border-bottom:1px solid var(--border);color:var(--text-tertiary);font-size:11px;vertical-align:top">${esc(r.span)}</td>
      <td style="padding:8px;border-bottom:1px solid var(--border);color:var(--text-tertiary);font-size:11px;text-align:right;vertical-align:top">${esc(r.confidence)}</td>
    </tr>`).join('');
  return `
    <div style="margin-bottom:8px;font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.04em">${esc(titleHint)}</div>
    <div style="overflow:auto;border:1px solid var(--border);border-radius:10px">
    <table style="width:100%;border-collapse:collapse;font-size:12px" aria-label="${esc(titleHint)}">
      <thead><tr>
        <th scope="col" style="text-align:left;padding:8px;border-bottom:1px solid var(--border);font-size:10px;color:var(--text-tertiary)">Mention / span</th>
        <th scope="col" style="text-align:left;padding:8px;border-bottom:1px solid var(--border);font-size:10px;color:var(--text-tertiary)">Category</th>
        <th scope="col" style="text-align:left;padding:8px;border-bottom:1px solid var(--border);font-size:10px;color:var(--text-tertiary)">Source offset</th>
        <th scope="col" style="text-align:right;padding:8px;border-bottom:1px solid var(--border);font-size:10px;color:var(--text-tertiary)">Score / status</th>
      </tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table></div>
    <p style="font-size:11px;color:var(--text-tertiary);margin:10px 0 0;line-height:1.45">
      “Diagnosis” / “medication” labels refer to <strong>text mentions</strong>, not confirmed conditions or active prescriptions.
      Low or missing scores mean manual review is required.
    </p>`;
}

function _renderGroupedClinicalEntities(rows) {
  if (!rows.length) return _renderEntityTable([], { title: 'Extracted spans' });
  const priority = ['diagnosis', 'symptom', 'medication', 'allergy', 'risk_factor', 'procedure', 'lab', 'vital'];
  const buckets = {};
  for (const r of rows) {
    const k = String(r.label || 'other').toLowerCase();
    if (!buckets[k]) buckets[k] = [];
    buckets[k].push(r);
  }
  let html = '';
  for (const p of priority) {
    if (buckets[p] && buckets[p].length) {
      html += _renderEntityTable(buckets[p], { title: `Mentions · ${p.replace(/_/g, ' ')}` });
      delete buckets[p];
    }
  }
  const rest = Object.values(buckets).flat();
  if (rest.length) html += _renderEntityTable(rest, { title: 'Other extracted spans' });
  return html || _renderEntityTable(rows, { title: 'All extracted spans' });
}

function _deidentifiedBody(res) {
  const out = res?.redacted_text ?? res?.deidentified_text ?? res?.text ?? '';
  if (!out) return '<div style="color:var(--text-tertiary)">No de-identified text returned.</div>';
  return `<pre style="margin:0;padding:12px;border-radius:8px;background:rgba(0,0,0,.2);font-size:12px;white-space:pre-wrap;line-height:1.5;max-height:320px;overflow:auto" role="region" aria-label="De-identified text">${esc(out)}</pre>`;
}

function _renderAnalyzeResult(res) {
  const entities = normaliseEntityRows(res, 'entity');
  const meta = [];
  if (res?.backend) meta.push(`Backend: ${res.backend}`);
  if (res?.schema_id) meta.push(`Schema: ${res.schema_id}`);
  if (res?.char_count != null) meta.push(`${res.char_count} characters`);
  const summary = (res?.summary || '').trim();
  const safeFooter = (res?.safety_footer || '').trim();

  let html = '';
  if (meta.length) {
    html += `<div style="font-size:11px;color:var(--text-tertiary);margin-bottom:12px">${esc(meta.join(' · '))}</div>`;
  }
  if (summary) {
    html += `<div style="margin-bottom:16px;padding:12px 14px;border-radius:10px;border:1px solid var(--border);background:rgba(255,255,255,.02)">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-tertiary);margin-bottom:6px">AI-assisted roll-up (not a clinical interpretive report)</div>
      <div style="font-size:13px;line-height:1.5;color:var(--text-secondary)">${esc(summary)}</div>
      ${safeFooter ? `<div style="margin-top:8px;font-size:11px;color:var(--text-tertiary)">${esc(safeFooter)}</div>` : ''}
    </div>`;
  }
  html += _renderGroupedClinicalEntities(entities);
  const piiSidecar = normaliseEntityRows(res, 'pii');
  if (piiSidecar.length) {
    html += `<details style="margin-top:16px;border:1px solid var(--border);border-radius:10px;padding:10px 12px;background:var(--bg-card)">
      <summary style="cursor:pointer;font-size:12px;font-weight:600">PII-like spans also detected in analyze response (${piiSidecar.length})</summary>
      <div style="margin-top:10px">${_renderEntityTable(piiSidecar, { title: 'PII candidates' })}</div>
    </details>`;
  }
  return html;
}

function _renderJsonDetails(label, obj) {
  return `<details style="margin-top:14px;border:1px solid var(--border);border-radius:10px;overflow:hidden">
    <summary style="cursor:pointer;padding:10px 12px;font-weight:600;font-size:12px;background:rgba(255,255,255,.02)">${esc(label)}</summary>
    <pre style="font-size:10px;overflow:auto;max-height:240px;margin:0;padding:12px;background:rgba(0,0,0,.2)">${esc(JSON.stringify(obj, null, 2))}</pre>
  </details>`;
}

function _demoFixtureResultsHtml() {
  const demo = ANALYZER_DEMO_FIXTURES.text;
  const ents = (demo.analyze.entities || []).map((e) => ({
    text: e.text,
    label: e.label,
    confidence: _confidenceLabel(e),
    span: _spanLabel(e),
  }));
  const pii = (demo.pii.pii_spans || []).map((e) => ({
    text: e.text,
    label: e.label,
    confidence: _confidenceLabel(e),
    span: _spanLabel(e),
  }));
  return DEMO_FIXTURE_BANNER_HTML
    + '<div style="margin-bottom:10px;font-size:12px;color:var(--text-secondary)">Offline illustrative extraction for UI review — not produced by your current API call.</div>'
    + _renderResultSection('Illustrative entities (demo fixture)', _renderEntityTable(ents, { title: 'Demo mentions' }))
    + _renderResultSection('Illustrative PII spans (demo fixture)', _renderEntityTable(pii, { title: 'Demo PII' }))
    + _renderResultSection('Illustrative de-identified text (demo fixture)', _deidentifiedBody({ deidentified_text: demo.deidentify.deidentified_text }))
    + `<p style="font-size:11px;color:var(--text-tertiary);margin-top:12px">Patient label: ${esc(demo.patient.name)} (${esc(demo.patient.patient_id)}) — synthetic demo persona.</p>`;
}

function _renderResultSection(title, body) {
  return `<section style="margin-bottom:16px;border:1px solid var(--border);border-radius:12px;background:var(--bg-card);overflow:hidden">
    <h2 style="margin:0;padding:12px 14px;font-size:13px;font-weight:600;border-bottom:1px solid var(--border);background:rgba(255,255,255,.02)">${esc(title)}</h2>
    <div style="padding:14px">${body}</div>
  </section>`;
}

function _patientSummaryLine() {
  const pid = typeof window !== 'undefined' ? (window._selectedPatientId || '') : '';
  if (!pid) {
    return '<span style="color:var(--text-tertiary)">No patient selected — choose a patient from Patients or open a profile first.</span>';
  }
  const demoPts = ANALYZER_DEMO_FIXTURES.patients || [];
  const match = demoPts.find((p) => p.id === pid);
  const name = match ? match.name : pid;
  return `<strong style="color:var(--text-primary)">${esc(name)}</strong> <span style="color:var(--text-tertiary);font-family:var(--font-mono,monospace);font-size:11px">${esc(pid)}</span>`;
}

export async function pgTextAnalyzer(setTopbar, navigate) {
  try {
    setTopbar({
      title: 'Text Analyzer',
      subtitle: 'Clinical text · extraction · de-identification · decision support',
    });
  } catch {
    try { setTopbar('Text Analyzer', 'Clinical text · decision support'); } catch {}
  }

  const el = document.getElementById('content');
  if (!el) return;

  el.innerHTML = `
    <div class="ds-text-analyzer-shell" style="max-width:980px;margin:0 auto;padding:16px 20px 48px">
      ${_demoBuildBanner()}
      <div style="padding:14px 16px;border-radius:12px;border:1px solid rgba(246,178,60,.35);background:rgba(246,178,60,.09);margin-bottom:18px;font-size:12px;line-height:1.45;color:var(--text-secondary)">
        <strong style="color:var(--text-primary)">Clinical decision-support.</strong> ${esc(DISCLAIMER)}
      </div>

      <section style="background:var(--bg-card);border:1px solid var(--border);border-radius:14px;padding:18px 20px;margin-bottom:16px">
        <h2 style="margin:0 0 10px;font-size:15px;font-weight:700">Patient &amp; session context</h2>
        <div id="ta-patient-line" style="font-size:13px;line-height:1.5;margin-bottom:12px">${_patientSummaryLine()}</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px">
          <button type="button" class="btn btn-ghost btn-sm" id="ta-open-patient-hub">Patients</button>
          <button type="button" class="btn btn-ghost btn-sm" id="ta-open-profile">Open patient profile</button>
        </div>
        <div id="ta-backend-status" style="font-size:12px;color:var(--text-tertiary);min-height:1.2em" role="status" aria-live="polite">Checking clinical-text service…</div>
      </section>

      <section style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;margin-bottom:18px">
        <button type="button" class="btn btn-ghost btn-sm" id="ta-nav-assessments">Assessments</button>
        <button type="button" class="btn btn-ghost btn-sm" id="ta-nav-qeeg">qEEG</button>
        <button type="button" class="btn btn-ghost btn-sm" id="ta-nav-mri">MRI</button>
        <button type="button" class="btn btn-ghost btn-sm" id="ta-nav-video">Video</button>
        <button type="button" class="btn btn-ghost btn-sm" id="ta-nav-voice">Voice</button>
        <button type="button" class="btn btn-ghost btn-sm" id="ta-nav-biomarkers">Biomarkers</button>
        <button type="button" class="btn btn-ghost btn-sm" id="ta-nav-documents">Documents</button>
        <button type="button" class="btn btn-ghost btn-sm" id="ta-nav-deeptwin">DeepTwin</button>
        <button type="button" class="btn btn-ghost btn-sm" id="ta-nav-protocol">Protocol Studio</button>
        <button type="button" class="btn btn-ghost btn-sm" id="ta-nav-brainmap">Brain Map</button>
        <button type="button" class="btn btn-ghost btn-sm" id="ta-nav-schedule">Schedule</button>
        <button type="button" class="btn btn-ghost btn-sm" id="ta-nav-inbox">Inbox</button>
        <button type="button" class="btn btn-ghost btn-sm" id="ta-nav-handbooks">Handbooks</button>
        <button type="button" class="btn btn-ghost btn-sm" id="ta-nav-live">Virtual Care</button>
        <button type="button" class="btn btn-ghost btn-sm" id="ta-nav-evidence">Research Evidence</button>
      </section>

      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:14px;padding:20px;margin-bottom:18px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:10px;flex-wrap:wrap">
          <div>
            <div style="font-weight:700;font-size:15px;margin-bottom:4px">Source text</div>
            <div style="font-size:12px;color:var(--text-tertiary);max-width:640px">
              Paste or type clinical narrative here. Text stays in this browser tab unless you save it elsewhere — it is not automatically written to Documents or the chart.
              Plain text and .txt uploads only on this page (no PDF/DOCX parsing here).
            </div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button type="button" class="btn btn-ghost btn-sm" id="ta-load-sample">Load illustrative sample</button>
            <button type="button" class="btn btn-ghost btn-sm" id="ta-clear">Clear text &amp; results</button>
          </div>
        </div>

        <label style="display:block;margin-bottom:6px;font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px" for="ta-file">Upload plain text (.txt)</label>
        <input type="file" id="ta-file" accept=".txt,text/plain" style="margin-bottom:12px;font-size:12px" />

        <textarea id="ta-text" class="form-control" rows="11"
          style="font-family:var(--font-mono,monospace);font-size:12px;width:100%;margin-bottom:12px"
          placeholder="Paste clinical text here…"
          aria-label="Clinical text to analyze"></textarea>
        <div id="ta-meta-hint" style="font-size:11px;color:var(--text-tertiary);margin:-6px 0 12px"></div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
          <div>
            <label style="display:block;margin-bottom:6px;font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px" for="ta-source">Document / channel type</label>
            <select id="ta-source" class="form-control" aria-label="Document or channel type">
              <option value="free_text">Free text</option>
              <option value="clinical_note">Clinician note</option>
              <option value="discharge_summary">Document text</option>
              <option value="referral_letter">Referral</option>
              <option value="research_note">Transcript / session text</option>
            </select>
          </div>
          <div>
            <label style="display:block;margin-bottom:6px;font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px" for="ta-locale">Locale</label>
            <select id="ta-locale" class="form-control">
              <option value="en">English (en)</option>
              <option value="en-GB">English UK (en-GB)</option>
              <option value="en-US">English US (en-US)</option>
            </select>
          </div>
        </div>

        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:8px">
          <button type="button" class="btn btn-primary" id="ta-analyze">Run extraction</button>
          <button type="button" class="btn btn-ghost" id="ta-pii">Detect PII spans</button>
          <button type="button" class="btn btn-ghost" id="ta-deid">De-identify preview</button>
          <button type="button" class="btn btn-ghost ${isDemoSession() ? '' : 'is-disabled'}" id="ta-offline-demo"
            ${isDemoSession() ? '' : 'disabled title="Available in demo-token preview sessions"'}>Show offline demo panel</button>
          <span id="ta-status" style="margin-left:4px;font-size:12px;color:var(--text-tertiary)" role="status" aria-live="polite"></span>
        </div>
        <p style="font-size:11px;color:var(--text-tertiary);margin:0;line-height:1.45">
          Evidence matching, autonomous protocol selection, and billing codes are not performed on this page.
          Use Research Evidence and Protocol Studio separately under governance review.
        </p>
      </div>

      <div id="ta-result" data-testid="text-analyzer-results"></div>
    </div>`;

  const $ = (id) => document.getElementById(id);
  const status = (msg) => { const s = $('ta-status'); if (s) s.textContent = msg || ''; };
  const resultEl = () => $('ta-result');
  const metaHint = () => $('ta-meta-hint');

  const getPayload = () => ({
    text: $('ta-text')?.value || '',
    sourceType: toApiSourceType($('ta-source')?.value || 'free_text'),
    locale: $('ta-locale')?.value || 'en',
  });

  function wireNav(id, page) {
    $(id)?.addEventListener('click', () => {
      try {
        if (page === 'deeptwin' && window._selectedPatientId) window._deeptwinPatientId = window._selectedPatientId;
      } catch (_) {}
      navigate(page);
    });
  }

  wireNav('ta-open-patient-hub', 'patients-hub');
  $('ta-open-profile')?.addEventListener('click', () => {
    if (!window._selectedPatientId) {
      status('Select a patient from Patients (or another workflow) first.');
      return;
    }
    try { window._profilePatientId = window._selectedPatientId; } catch (_) {}
    navigate('patient-profile');
  });
  wireNav('ta-nav-assessments', 'assessments-v2');
  wireNav('ta-nav-qeeg', 'qeeg-analysis');
  wireNav('ta-nav-mri', 'mri-analysis');
  wireNav('ta-nav-video', 'video-assessments');
  wireNav('ta-nav-voice', 'voice-analyzer');
  wireNav('ta-nav-biomarkers', 'biomarkers');
  wireNav('ta-nav-documents', 'documents-v2');
  wireNav('ta-nav-deeptwin', 'deeptwin');
  wireNav('ta-nav-protocol', 'protocol-studio');
  wireNav('ta-nav-brainmap', 'brainmap-v2');
  wireNav('ta-nav-schedule', 'schedule-v2');
  wireNav('ta-nav-inbox', 'clinician-inbox');
  wireNav('ta-nav-handbooks', 'handbooks-v2');
  wireNav('ta-nav-live', 'live-session');
  wireNav('ta-nav-evidence', 'research-evidence');

  $('ta-load-sample')?.addEventListener('click', () => {
    const ta = $('ta-text');
    if (ta) ta.value = ILLUSTRATIVE_SAMPLE;
    updateMetaHint();
  });
  $('ta-clear')?.addEventListener('click', () => {
    const ta = $('ta-text');
    if (ta) ta.value = '';
    if (resultEl()) resultEl().innerHTML = '';
    status('');
    updateMetaHint();
  });

  $('ta-text')?.addEventListener('input', updateMetaHint);

  $('ta-file')?.addEventListener('change', async (ev) => {
    const f = ev.target?.files?.[0];
    if (!f) return;
    if (f.size > 1024 * 1024) {
      status('File too large — use a text file under 1 MB or paste content.');
      ev.target.value = '';
      return;
    }
    try {
      const text = await f.text();
      const ta = $('ta-text');
      if (ta) ta.value = text;
      status(`Loaded ${f.name} (${text.length} characters).`);
      updateMetaHint();
    } catch {
      status('Could not read file.');
    }
    ev.target.value = '';
  });

  function updateMetaHint() {
    const hi = metaHint();
    if (!hi) return;
    const t = $('ta-text')?.value || '';
    const n = t.length;
    hi.textContent = n
      ? `${n.toLocaleString()} characters · local to this browser · not saved as a chart note`
      : '';
    if (n > 200_000) hi.textContent += ' — exceeds API limit (200,000); trim before running.';
  }

  async function refreshBackendStatus() {
    const slot = $('ta-backend-status');
    if (!slot) return;
    slot.textContent = 'Checking clinical-text service…';
    try {
      const h = await api.clinicalTextHealth();
      const parts = [`${h.backend || 'unknown'} backend`, h.ok === false ? 'status not OK' : 'reachable'];
      if (h.note) parts.push(h.note);
      slot.innerHTML = `<span style="color:var(--text-secondary)">${esc(parts.join(' · '))}</span>`;
    } catch (e) {
      const code = e?.status || e?.code;
      slot.innerHTML = `<span style="color:var(--text-tertiary)">Could not load service metadata (${esc(String(code || e?.message || 'error'))}). `
        + `You may lack clinician access, or the API may be offline. Extraction buttons will still attempt a request.</span>`;
    }
  }

  async function _runOp(label, apiCall, renderFn, includeRaw = true) {
    const payload = getPayload();
    if (!payload.text.trim()) {
      status('Paste text or load the illustrative sample first.');
      return;
    }
    if (payload.text.length > 200_000) {
      status('Text exceeds 200,000 character API limit.');
      return;
    }
    status(`${label}…`);
    try {
      const res = await apiCall(payload);
      status(`${label} complete — review all spans before reuse.`);
      let inner = renderFn(res);
      if (includeRaw) inner += _renderJsonDetails('Raw API response (audit)', res);
      resultEl().innerHTML = inner;
    } catch (e) {
      const msg = (e && e.message) || String(e);
      status(`${label} failed.`);
      let extra = '';
      if (isDemoSession()) {
        extra = `<div style="margin-top:12px;font-size:12px;color:var(--text-secondary)">
          Demo-token sessions often cannot reach authenticated NLP routes. Use “Show offline demo panel” for labelled placeholder output, or sign in with a clinician account against the hosted API.</div>`;
      }
      resultEl().innerHTML = `<div role="alert" style="padding:14px;border-radius:10px;background:rgba(248,113,113,.08);border:1px solid rgba(248,113,113,.35);font-size:13px;line-height:1.5">
        <strong style="color:#f87171">${esc(label)} unavailable</strong><br/>
        <span style="color:var(--text-secondary)">${esc(msg)}</span>${extra}
      </div>`;
    }
  }

  $('ta-analyze')?.addEventListener('click', () => _runOp(
    'Entity extraction',
    api.clinicalTextAnalyze,
    (res) => _renderResultSection('Clinical mention extraction (requires review)', _renderAnalyzeResult(res)),
  ));

  $('ta-pii')?.addEventListener('click', () => _runOp(
    'PII span detection',
    api.clinicalTextExtractPII,
    (res) => {
      const spans = normaliseEntityRows(res, 'pii');
      const hdr = `<div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px">
        Candidate personally identifiable spans for redaction review — not a certification that all PHI has been found.</div>`;
      return _renderResultSection('PII span detection', hdr + _renderEntityTable(spans, { title: 'PII candidates' }));
    },
  ));

  $('ta-deid')?.addEventListener('click', () => _runOp(
    'De-identification preview',
    api.clinicalTextDeidentify,
    (res) => {
      const foot = (res?.safety_footer || '').trim();
      const hdr = `<div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px">
        Algorithmic redaction preview only — verify before sharing externally.${foot ? ` ${esc(foot)}` : ''}</div>`;
      return _renderResultSection('De-identified text preview', hdr + _deidentifiedBody(res));
    },
  ));

  $('ta-offline-demo')?.addEventListener('click', () => {
    status('Showing labelled offline demo panel.');
    resultEl().innerHTML = _demoFixtureResultsHtml();
  });

  await refreshBackendStatus();
  updateMetaHint();

  if (isDemoSession()) {
    const ta = $('ta-text');
    if (ta && !ta.value.trim()) ta.value = ANALYZER_DEMO_FIXTURES.text.source_text;
    updateMetaHint();
  }
}

export default { pgTextAnalyzer };
