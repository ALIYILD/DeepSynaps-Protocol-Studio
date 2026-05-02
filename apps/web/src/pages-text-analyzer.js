/**
 * Clinical Text Analyzer — OpenMed-backed NLP for free-text clinical notes.
 *
 * UI wraps the three endpoints exposed by `clinical_text_router.py`:
 *   • POST /api/v1/clinical-text/analyze       → entity / concept extraction
 *   • POST /api/v1/clinical-text/extract-pii   → PII span detection
 *   • POST /api/v1/clinical-text/deidentify    → redacted text
 *
 * Decision-support framing only — extracted entities are NLP candidates,
 * never validated clinical findings. Mirrors the small-wrapper pattern used
 * by `pages-voice-analyzer.js`.
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

function _isDemoMode() {
  try {
    return !!(import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO === '1');
  } catch (_) {
    return false;
  }
}

function _demoBanner() {
  if (!_isDemoMode()) return '';
  return '<div data-demo="true" data-testid="text-analyzer-demo-banner" role="note"'
    + ' style="margin-bottom:14px;padding:10px 12px;border-radius:10px;'
    + 'border:1px solid rgba(246,178,60,.35);background:rgba(246,178,60,.1);'
    + 'font-size:12px;line-height:1.45;color:var(--text-secondary)">'
    + '<strong style="color:var(--text-primary)">Demo build.</strong> '
    + 'Submitted text is processed by the OpenMed adapter when available, '
    + 'or by an in-process heuristic backend in offline preview mode. '
    + 'Output is decision-support only — never a validated clinical finding.'
    + '</div>';
}

const DISCLAIMER = 'Decision-support only. Extracted entities, PII spans and '
  + 'de-identified output are NLP candidates — clinician review is required '
  + 'before any document is filed, shared, or used for care decisions.';

const DEFAULT_SAMPLE = `Patient John Doe, 58 y/o male (DOB 1968-04-12, MRN 442189), seen on
2026-04-30 in the Oxford clinic by Dr. Ali Yildirim.

Hx: TBI 2014, post-concussive syndrome, mild MDD. Currently on sertraline
50 mg PO daily and melatonin 3 mg qhs. BP 132/84, HR 72.

Plan: continue tDCS protocol DLPFC-LEFT-2mA-20min x 10 sessions. Repeat
PHQ-9 in 4 weeks. Patient consented to research data sharing.

Contact: john.doe@example.com / +44 7700 900123.`;

function _renderResultBlock(title, body) {
  return `<details open style="margin-bottom:14px;border:1px solid var(--border);border-radius:12px;background:var(--bg-card);overflow:hidden">
    <summary style="cursor:pointer;padding:12px 14px;font-weight:600;font-size:13px;background:rgba(255,255,255,.02)">${esc(title)}</summary>
    <div style="padding:14px;font-size:12px;line-height:1.5">${body}</div>
  </details>`;
}

function _renderEntities(entities) {
  if (!Array.isArray(entities) || entities.length === 0) {
    return '<div style="color:var(--text-tertiary)">No entities returned.</div>';
  }
  const rows = entities.slice(0, 200).map((e) => {
    const label = esc(e.label || e.type || e.category || '—');
    const text = esc(e.text || e.span || e.value || '');
    const score = (e.score != null) ? Number(e.score).toFixed(2) : '';
    return `<tr>
      <td style="padding:6px 8px;border-bottom:1px solid var(--border);font-family:var(--font-mono,monospace);font-size:11px">${text}</td>
      <td style="padding:6px 8px;border-bottom:1px solid var(--border);color:var(--text-secondary)">${label}</td>
      <td style="padding:6px 8px;border-bottom:1px solid var(--border);color:var(--text-tertiary);text-align:right">${score}</td>
    </tr>`;
  }).join('');
  return `<table style="width:100%;border-collapse:collapse;font-size:12px">
    <thead><tr>
      <th style="text-align:left;padding:6px 8px;border-bottom:1px solid var(--border);color:var(--text-tertiary);font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:.5px">Span</th>
      <th style="text-align:left;padding:6px 8px;border-bottom:1px solid var(--border);color:var(--text-tertiary);font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:.5px">Label</th>
      <th style="text-align:right;padding:6px 8px;border-bottom:1px solid var(--border);color:var(--text-tertiary);font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:.5px">Score</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function _renderRawJson(obj) {
  return `<pre style="font-size:10.5px;overflow:auto;max-height:280px;margin:0;padding:10px;border-radius:8px;background:rgba(0,0,0,.2)">${esc(JSON.stringify(obj, null, 2))}</pre>`;
}

export async function pgTextAnalyzer(setTopbar, navigate) {
  try {
    setTopbar({
      title: 'Text Analyzer',
      subtitle: 'Clinical NLP · entity extraction · PII redaction',
    });
  } catch {
    try { setTopbar('Text Analyzer', 'Clinical NLP'); } catch {}
  }

  const el = document.getElementById('content');
  if (!el) return;

  el.innerHTML = `
    <div class="ds-text-analyzer-shell" style="max-width:920px;margin:0 auto;padding:16px 20px 48px">
      ${_demoBanner()}
      <div style="padding:14px 16px;border-radius:12px;border:1px solid rgba(246,178,60,.35);background:rgba(246,178,60,.09);margin-bottom:18px;font-size:12px;line-height:1.45;color:var(--text-secondary)">
        <strong style="color:var(--text-primary)">Clinical decision-support.</strong> ${esc(DISCLAIMER)}
      </div>

      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:14px;padding:20px;margin-bottom:18px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <div style="font-weight:700">Clinical text input</div>
          <div style="display:flex;gap:8px">
            <button type="button" class="btn btn-ghost btn-sm" id="ta-load-sample">Load sample note</button>
            <button type="button" class="btn btn-ghost btn-sm" id="ta-clear">Clear</button>
          </div>
        </div>
        <div style="font-size:12px;color:var(--text-tertiary);margin-bottom:12px">
          Paste a clinical note, discharge summary, or other free-text record. Up to 200,000 characters.
        </div>

        <textarea id="ta-text" class="form-control" rows="10"
          style="font-family:var(--font-mono,monospace);font-size:12px;width:100%;margin-bottom:12px"
          placeholder="Paste clinical text here…"></textarea>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
          <div>
            <label style="display:block;margin-bottom:6px;font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px">Source type</label>
            <select id="ta-source" class="form-control">
              <option value="free_text">Free text</option>
              <option value="clinical_note">Clinical note</option>
              <option value="discharge_summary">Discharge summary</option>
              <option value="referral_letter">Referral letter</option>
              <option value="research_note">Research note</option>
            </select>
          </div>
          <div>
            <label style="display:block;margin-bottom:6px;font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px">Locale</label>
            <select id="ta-locale" class="form-control">
              <option value="en">English (en)</option>
              <option value="en-GB">English UK (en-GB)</option>
              <option value="en-US">English US (en-US)</option>
            </select>
          </div>
        </div>

        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
          <button type="button" class="btn btn-primary" id="ta-analyze">Analyze</button>
          <button type="button" class="btn btn-ghost" id="ta-pii">Extract PII</button>
          <button type="button" class="btn btn-ghost" id="ta-deid">De-identify</button>
          <span id="ta-status" style="margin-left:8px;font-size:12px;color:var(--text-tertiary)"></span>
        </div>
      </div>

      <div id="ta-result"></div>
    </div>`;

  const $ = (id) => document.getElementById(id);
  const status = (msg) => { const s = $('ta-status'); if (s) s.textContent = msg || ''; };
  const resultEl = () => $('ta-result');
  const getPayload = () => ({
    text: $('ta-text')?.value || '',
    sourceType: $('ta-source')?.value || 'free_text',
    locale: $('ta-locale')?.value || 'en',
  });

  $('ta-load-sample')?.addEventListener('click', () => {
    const ta = $('ta-text');
    if (ta) ta.value = DEFAULT_SAMPLE;
  });
  $('ta-clear')?.addEventListener('click', () => {
    const ta = $('ta-text');
    if (ta) ta.value = '';
    if (resultEl()) resultEl().innerHTML = '';
    status('');
  });

  async function _runOp(label, apiCall, renderFn) {
    const payload = getPayload();
    if (!payload.text.trim()) {
      status('Paste or load some clinical text first.');
      return;
    }
    status(`${label}…`);
    try {
      const res = await apiCall(payload);
      status(`${label} complete.`);
      resultEl().innerHTML = renderFn(res) + _renderResultBlock('Raw response (JSON)', _renderRawJson(res));
    } catch (e) {
      const msg = (e && e.message) || String(e);
      status(`${label} failed.`);
      resultEl().innerHTML = `<div style="padding:12px;border-radius:10px;background:rgba(248,113,113,.08);color:#f87171;font-size:12px">
        <strong>${esc(label)} failed.</strong><br/>${esc(msg)}
      </div>`;
    }
  }

  $('ta-analyze')?.addEventListener('click', () => _runOp(
    'Analyze',
    api.clinicalTextAnalyze,
    (res) => {
      const entities = res?.entities || res?.spans || [];
      return _renderResultBlock(
        `Entities (${entities.length})`,
        _renderEntities(entities),
      );
    },
  ));

  $('ta-pii')?.addEventListener('click', () => _runOp(
    'Extract PII',
    api.clinicalTextExtractPII,
    (res) => {
      const spans = res?.pii_spans || res?.spans || res?.entities || [];
      return _renderResultBlock(
        `PII spans (${spans.length})`,
        _renderEntities(spans),
      );
    },
  ));

  $('ta-deid')?.addEventListener('click', () => _runOp(
    'De-identify',
    api.clinicalTextDeidentify,
    (res) => {
      const out = res?.deidentified_text || res?.text || '';
      const body = out
        ? `<pre style="margin:0;padding:10px;border-radius:8px;background:rgba(0,0,0,.2);font-size:12px;white-space:pre-wrap;line-height:1.5">${esc(out)}</pre>`
        : '<div style="color:var(--text-tertiary)">No de-identified text returned.</div>';
      return _renderResultBlock('De-identified text', body);
    },
  ));

  if (isDemoSession()) {
    const demo = ANALYZER_DEMO_FIXTURES.text;
    const ta = $('ta-text');
    if (ta && !ta.value) ta.value = demo.source_text;
    const r = resultEl();
    if (r && !r.innerHTML) {
      const ents = demo.analyze.entities;
      const pii = demo.pii.pii_spans;
      r.innerHTML = DEMO_FIXTURE_BANNER_HTML
        + _renderResultBlock(`Entities (${ents.length})`, _renderEntities(ents))
        + _renderResultBlock(`PII spans (${pii.length})`, _renderEntities(pii))
        + _renderResultBlock(
          'De-identified text',
          `<pre style="margin:0;padding:10px;border-radius:8px;background:rgba(0,0,0,.2);font-size:12px;white-space:pre-wrap;line-height:1.5">${esc(demo.deidentify.deidentified_text)}</pre>`,
        );
      status('Showing demo output for ' + demo.patient.name + '.');
    }
  }
}

export default { pgTextAnalyzer };
