/**
 * Nutrition, Supplements & Diet Analyzer — MVP decision-support scaffold.
 *
 * Backend: GET /api/v1/nutrition/analyzer/patient/{patient_id}
 * Demo/offline: ANALYZER_DEMO_FIXTURES.nutrition.payload(patientId)
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

function _resolvedPatientId() {
  try {
    return (
      window._selectedPatientId
      || window._profilePatientId
      || sessionStorage.getItem('ds_pat_selected_id')
      || null
    );
  } catch {
    return window._selectedPatientId || window._profilePatientId || null;
  }
}

function _go(navigate, pageId) {
  try {
    if (typeof window._nav === 'function') window._nav(pageId);
    else navigate?.(pageId);
  } catch {}
}

/** Keep patient context for cross-analyzer pages that read globals */
function _navWithPatient(navigate, pageId, patientId) {
  if (patientId) {
    try {
      window._paPatientId = patientId;
      window._selectedPatientId = patientId;
      sessionStorage.setItem('ds_pat_selected_id', patientId);
    } catch {}
  }
  _go(navigate, pageId);
}

function _skeletonCards() {
  const chip =
    '<span style="display:block;height:56px;border-radius:12px;background:linear-gradient(90deg,rgba(255,255,255,.04),rgba(255,255,255,.08),rgba(255,255,255,.04));background-size:200% 100%;animation:dh2AttnPulse 1.6s ease-in-out infinite"></span>';
  return `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px">${Array.from({ length: 4 }, () => `<div>${chip}</div>`).join('')}</div>`;
}

function _errorCard(message, retryLabel = 'Try again') {
  const safe = esc(message || 'We could not load nutrition data.');
  return `<div role="alert" style="max-width:560px;margin:24px auto;padding:18px 20px;border:1px solid rgba(255,107,107,0.35);background:rgba(255,107,107,0.06);border-radius:12px">
    <div style="font-weight:600;margin-bottom:6px;color:var(--text-primary)">Nutrition analyzer unavailable</div>
    <div style="font-size:12px;color:var(--text-secondary);line-height:1.5;margin-bottom:12px">${safe}</div>
    <button type="button" class="btn btn-ghost btn-sm" data-action="retry-load" style="min-height:44px">${esc(retryLabel)}</button>
  </div>`;
}

function _noPatientCard() {
  return `<div style="max-width:520px;margin:32px auto;padding:22px;border:1px solid var(--border);border-radius:14px;background:var(--bg-card);text-align:center">
    <div style="font-weight:600;margin-bottom:8px">Select a patient</div>
    <div style="font-size:12px;color:var(--text-secondary);line-height:1.5;margin-bottom:14px">
      Open someone from Patients to personalize diet logs and supplement review. Demo mode loads sample data without a selection.
    </div>
    <button type="button" class="btn btn-primary btn-sm" id="na-go-patients" style="min-height:44px">Open Patients</button>
  </div>`;
}

function _priorityPill(p) {
  const x = String(p || '').toLowerCase();
  if (x === 'urgent') {
    return '<span class="pill" style="background:rgba(255,107,107,0.14);color:var(--red);border:1px solid rgba(255,107,107,0.25)">Urgent</span>';
  }
  if (x === 'follow_up') {
    return '<span class="pill pill-pending">Follow-up</span>';
  }
  return '<span class="pill pill-active">Routine</span>';
}

function _paperHref(it) {
  if (it.europe_pmc_url) return it.europe_pmc_url;
  if (it.oa_url) return it.oa_url;
  if (it.pmid) return `https://pubmed.ncbi.nlm.nih.gov/${String(it.pmid).replace(/[^0-9]/g, '')}/`;
  if (it.doi) return `https://doi.org/${encodeURIComponent(String(it.doi))}`;
  return null;
}

function renderPage(payload, patientLabel, navigate, patientId) {
  const snap = Array.isArray(payload.snapshot) ? payload.snapshot : [];
  const cards = snap
    .map(
      (c) => `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:4px">
      <div style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px">${esc(c.label)}</div>
      <div style="font-size:22px;font-weight:700;line-height:1.1">${esc(c.value)}<span style="font-size:12px;font-weight:500;color:var(--text-tertiary);margin-left:4px">${esc(c.unit || '')}</span></div>
      <div style="font-size:11px;color:var(--text-tertiary)">Confidence ${typeof c.confidence === 'number' ? esc(String(c.confidence)) : esc('—')}${c.provenance ? ` · ${esc(c.provenance)}` : ''}</div>
    </div>`,
    )
    .join('');

  const d = payload.diet || {};
  const dietRows = [
    ['Window', `${d.window_days || '—'} days`],
    ['Avg energy', d.avg_calories_kcal != null ? `${d.avg_calories_kcal} kcal/d` : '—'],
    ['Avg protein', d.avg_protein_g != null ? `${d.avg_protein_g} g/d` : '—'],
    ['Avg carbs', d.avg_carbs_g != null ? `${d.avg_carbs_g} g/d` : '—'],
    ['Avg fat', d.avg_fat_g != null ? `${d.avg_fat_g} g/d` : '—'],
    ['Avg sodium', d.avg_sodium_mg != null ? `${d.avg_sodium_mg} mg/d` : '—'],
    ['Avg fiber', d.avg_fiber_g != null ? `${d.avg_fiber_g} g/d` : '—'],
    ['Logging coverage', d.logging_coverage_pct != null ? `${d.logging_coverage_pct}%` : '—'],
  ];

  const supplements = Array.isArray(payload.supplements) ? payload.supplements : [];
  const supHtml = supplements.length
    ? `<ul style="list-style:none;margin:0;padding:0">${supplements
      .map(
        (s) => `<li style="padding:10px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;gap:10px">
        <div>
          <div style="font-weight:600">${esc(s.name)}${s.active === false ? ' <span style="color:var(--text-tertiary);font-weight:400">(inactive)</span>' : ''}</div>
          <div style="font-size:12px;color:var(--text-secondary)">${esc([s.dose, s.frequency].filter(Boolean).join(' · ') || '—')}</div>
          ${s.notes ? `<div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">${esc(s.notes)}</div>` : ''}
        </div>
        <div style="font-size:11px;color:var(--text-tertiary);white-space:nowrap">${esc(s.started_at || '')}</div>
      </li>`,
      )
      .join('')}</ul>`
    : `<div style="padding:14px;font-size:12px;color:var(--text-secondary)">No supplements documented yet.</div>`;

  const links = Array.isArray(payload.biomarker_links) ? payload.biomarker_links : [];
  const linkBtns = links
    .map(
      (l) =>
        `<button type="button" class="btn btn-ghost btn-sm" data-nav-page="${esc(l.page_id)}" style="min-height:44px;text-align:left">
        <span style="font-weight:600">${esc(l.label)}</span>
        <span style="display:block;font-size:11px;color:var(--text-tertiary);font-weight:400;margin-top:2px">${esc(l.detail || l.page_id)}</span>
      </button>`,
    )
    .join('');

  const evPack = payload.evidence_pack || {};
  const evItems = Array.isArray(evPack.items) ? evPack.items : [];
  const corpusN = evPack.corpus_paper_count;
  const corpusNote = evPack.corpus_note || '';
  const evHtml = evItems.length
    ? `<div style="display:flex;flex-direction:column;gap:10px">${evItems
      .map((it) => {
        const href = _paperHref(it);
        const meta = [
          it.year ? String(it.year) : '',
          it.journal ? String(it.journal) : '',
          it.cited_by_count != null ? `${it.cited_by_count} cites` : '',
        ]
          .filter(Boolean)
          .join(' · ');
        const linkRow = href
          ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer" style="font-size:11px;color:var(--blue)">Open source ↗</a>`
          : '';
        const topic = String(it.evidence_topic || it.title || 'nutrition dietary');
        return `<div style="padding:12px;border:1px solid var(--border);border-radius:10px;background:rgba(255,255,255,.02)">
          <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:4px">${esc(it.evidence_topic || 'Literature')}${it.strength ? ` · ${esc(it.strength)}` : ''}</div>
          <div style="font-weight:600;font-size:13px;margin-bottom:4px">${esc(it.title || 'Untitled')}</div>
          <div style="font-size:12px;color:var(--text-secondary);line-height:1.45;margin-bottom:6px">${esc(it.snippet || '')}</div>
          <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;font-size:11px;color:var(--text-tertiary)">
            ${meta ? `<span>${esc(meta)}</span>` : ''}
            ${linkRow}
            <button type="button" class="btn btn-ghost btn-sm" data-na-re-search="${esc(topic)}" style="min-height:36px;padding:4px 10px;font-size:11px">Search in Research Evidence</button>
          </div>
        </div>`;
      })
      .join('')}</div>`
    : `<div style="font-size:12px;color:var(--text-secondary)">No literature excerpts — build evidence.db (ingest pipeline) or check API connectivity.</div>`;

  const aiBlocks = Array.isArray(payload.ai_interpretation) ? payload.ai_interpretation : [];
  const aiHtml = aiBlocks.length
    ? `<div style="display:flex;flex-direction:column;gap:10px">${aiBlocks
      .map(
        (b) => `<div style="padding:12px;border:1px solid rgba(155,127,255,0.22);border-radius:10px;background:rgba(155,127,255,0.04)">
        <div style="font-weight:600;font-size:13px;margin-bottom:6px">${esc(b.title)}</div>
        <div style="font-size:12px;color:var(--text-secondary);line-height:1.45">${esc(b.summary)}</div>
        ${b.uncertainty ? `<div style="margin-top:8px;font-size:11px;color:var(--text-tertiary)"><strong>Uncertainty:</strong> ${esc(b.uncertainty)}</div>` : ''}
        <div style="margin-top:6px;font-size:11px;color:var(--text-tertiary)">${esc(b.provenance || '')}${typeof b.confidence === 'number' ? ` · confidence ${esc(String(b.confidence))}` : ''}</div>
      </div>`,
      )
      .join('')}</div>`
    : '';

  const quickLinks = [
    { id: 'deeptwin', label: 'DeepTwin' },
    { id: 'patient-analytics', label: 'Patient analytics' },
    { id: 'treatment-sessions-analyzer', label: 'Sessions' },
    { id: 'wearables', label: 'Biometrics' },
    { id: 'medication-analyzer', label: 'Medications' },
    { id: 'research-evidence', label: 'Research Evidence' },
  ]
    .map(
      (x) =>
        `<button type="button" class="btn btn-ghost btn-sm" data-qp-nav="${esc(x.id)}" style="min-height:40px">${esc(x.label)}</button>`,
    )
    .join('');

  const recs = Array.isArray(payload.recommendations) ? payload.recommendations : [];
  const recHtml = recs.length
    ? recs
      .map(
        (r) => `<div style="padding:12px;border:1px solid var(--border);border-radius:10px;background:rgba(255,255,255,.02)">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px">
          <div style="font-weight:600;font-size:13px">${esc(r.title)}</div>
          <div>${_priorityPill(r.priority)}</div>
        </div>
        <div style="font-size:12px;color:var(--text-secondary);line-height:1.45">${esc(r.detail || '')}</div>
        <div style="font-size:11px;color:var(--text-tertiary);margin-top:6px">Confidence ${esc(String(r.confidence ?? '—'))}${r.provenance ? ` · ${esc(r.provenance)}` : ''}</div>
      </div>`,
      )
      .join('')
    : `<div style="font-size:12px;color:var(--text-secondary)">No heuristic recommendations returned.</div>`;

  const audit = payload.audit_events || {};
  const auditStub = `<div style="font-size:12px;color:var(--text-secondary);line-height:1.5">
      <strong style="color:var(--text-primary)">Audit (summary)</strong><br/>
      Total events: <strong>${esc(String(audit.total_events ?? '—'))}</strong><br/>
      Last: ${esc(audit.last_event_at || '—')} (${esc(audit.last_event_type || '—')})<br/>
      <span style="font-size:11px;color:var(--text-tertiary)">Full event list will appear when the audit API is wired in the UI.</span>
    </div>`;

  return `
    <div class="ds-nutrition-analyzer-shell" style="max-width:1100px;margin:0 auto;padding:16px 20px 48px">
      <div id="na-demo-banner"></div>
      <div style="padding:12px 14px;border-radius:12px;border:1px solid rgba(155,127,255,0.28);background:rgba(155,127,255,0.06);margin-bottom:14px;font-size:12px;line-height:1.45;color:var(--text-secondary)">
        <strong style="color:var(--text-primary)">Clinical decision-support only.</strong>
        This view does not prescribe diets, doses, or supplements. All outputs require clinician interpretation and local formulary/policy checks.
      </div>
      <div style="margin-bottom:14px;display:flex;flex-wrap:wrap;gap:10px;align-items:baseline">
        <h1 style="margin:0;font-size:22px;font-weight:700;color:var(--text-primary)">Nutrition &amp; diet</h1>
        <span style="font-size:12px;color:var(--text-tertiary)">${esc(patientLabel)} · Computation ${esc(payload.computation_id || '—')} · As of ${esc(payload.data_as_of || '—')}</span>
      </div>
      <div style="font-size:11px;color:var(--text-tertiary);margin:-6px 0 16px;line-height:1.4">${esc(payload.clinical_disclaimer || '')}</div>

      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:18px;padding:12px;border:1px solid var(--border);border-radius:12px;background:var(--bg-card)">
        <span style="font-size:11px;color:var(--text-tertiary);width:100%;margin-bottom:2px">Open related analyzers (patient context preserved when selected)</span>
        ${quickLinks}
      </div>

      <div style="font-size:12px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;margin:10px 0 8px">Nutrition snapshot</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin-bottom:22px">${cards}</div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;margin-bottom:22px">
        <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px">
          <div style="font-weight:600;margin-bottom:10px">Diet intake summary</div>
          <table style="width:100%;font-size:12px;border-collapse:collapse">${dietRows
      .map(
        ([k, v]) =>
          `<tr><td style="padding:6px 0;color:var(--text-tertiary);width:42%">${esc(k)}</td><td style="padding:6px 0;font-weight:500">${esc(v)}</td></tr>`,
      )
      .join('')}
          </table>
          ${d.notes ? `<div style="margin-top:10px;font-size:11px;color:var(--text-secondary);line-height:1.45">${esc(d.notes)}</div>` : ''}
        </div>
        <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:10px">
          <div style="font-weight:600">Biomarker &amp; correlates</div>
          <div style="display:flex;flex-direction:column;gap:6px">${linkBtns}</div>
        </div>
      </div>

      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;overflow:hidden;margin-bottom:22px">
        <div style="padding:14px;font-weight:600;border-bottom:1px solid var(--border)">Supplements</div>
        ${supHtml}
      </div>

      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:22px">
        <div style="font-weight:600;margin-bottom:10px">Recommendations</div>
        <div style="display:flex;flex-direction:column;gap:10px">${recHtml}</div>
      </div>

      ${
  aiHtml
    ? `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:22px">
        <div style="font-weight:600;margin-bottom:8px">Interpretation (decision-support)</div>
        <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:10px;line-height:1.4">Rule-assembled summaries — not autonomous diagnosis or prescribing. Separate from raw intake totals.</div>
        ${aiHtml}
      </div>`
    : ''
}

      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:22px">
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:8px;flex-wrap:wrap">
          <div style="font-weight:600">Literature evidence (shared corpus)</div>
          <div style="font-size:12px;color:var(--text-tertiary)">${corpusN != null ? `${Number(corpusN).toLocaleString()} papers indexed` : 'Corpus count unavailable'}</div>
        </div>
        <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:12px;line-height:1.45">${esc(corpusNote)} Full Explorer: Research Evidence — same underlying evidence.db as Protocol Studio when deployed.</div>
        ${evHtml}
      </div>

      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px">
        ${auditStub}
      </div>
    </div>`;
}

export async function pgNutritionAnalyzer(setTopbar, navigate) {
  try {
    setTopbar({
      title: 'Nutrition & Diet',
      subtitle: 'Supplements · intake · biomarker links',
    });
  } catch {
    try { setTopbar('Nutrition & Diet', 'Decision-support'); } catch {}
  }

  const el = document.getElementById('content');
  if (!el) return;

  let usingFixtures = false;
  let patientId = _resolvedPatientId();

  el.innerHTML = `<div style="max-width:1100px;margin:0 auto;padding:24px">${_skeletonCards()}</div>`;

  async function load() {
    const slot = document.getElementById('content');
    if (!slot) return;
    slot.innerHTML = `<div style="max-width:1100px;margin:0 auto;padding:24px">${_skeletonCards()}</div>`;

    let payload = null;
    let label = 'No patient selected';

    if (!patientId && isDemoSession()) {
      patientId = (ANALYZER_DEMO_FIXTURES.patients && ANALYZER_DEMO_FIXTURES.patients[0]?.id) || 'demo-pt-samantha-li';
    }

    if (!patientId) {
      if (!isDemoSession()) {
        slot.innerHTML = `<div class="ds-nutrition-analyzer-shell" style="max-width:1100px;margin:0 auto;padding:16px 20px 48px"><div id="na-demo-banner"></div>${_noPatientCard()}</div>`;
        const banner = slot.querySelector('#na-demo-banner');
        if (banner) banner.innerHTML = '';
        slot.querySelector('#na-go-patients')?.addEventListener('click', () => {
          try { navigate?.('patients-v2'); } catch {}
        });
        return;
      }
    }

    if (patientId) {
      const personas = ANALYZER_DEMO_FIXTURES.patients || [];
      const match = personas.find((p) => p.id === patientId);
      label = match ? `${match.name} (${patientId})` : patientId;
    }

    const token = api.getToken?.() || null;
    if (patientId && token && !isDemoSession()) {
      try {
        payload = await api.getNutritionAnalyzerPayload(patientId);
        usingFixtures = false;
      } catch (e) {
        const msg = (e && e.message) || String(e);
        if (isDemoSession()) {
          payload = ANALYZER_DEMO_FIXTURES.nutrition.payload(patientId);
          usingFixtures = true;
        } else {
          slot.innerHTML = _errorCard(msg);
          slot.querySelector('[data-action="retry-load"]')?.addEventListener('click', () => { load(); });
          return;
        }
      }
    } else {
      payload = ANALYZER_DEMO_FIXTURES.nutrition.payload(patientId);
      usingFixtures = true;
    }

    if (!payload) {
      slot.innerHTML = _errorCard('Empty response');
      return;
    }

    slot.innerHTML = renderPage(payload, label, navigate, patientId);
    const ban = slot.querySelector('#na-demo-banner');
    if (ban) {
      ban.innerHTML = usingFixtures && isDemoSession() ? DEMO_FIXTURE_BANNER_HTML : '';
    }
    slot.querySelectorAll('[data-nav-page]').forEach((b) => {
      b.addEventListener('click', () => {
        const pidPage = b.getAttribute('data-nav-page');
        if (pidPage) _navWithPatient(navigate, pidPage, patientId);
      });
    });
    slot.querySelectorAll('[data-qp-nav]').forEach((b) => {
      b.addEventListener('click', () => {
        const pidPage = b.getAttribute('data-qp-nav');
        if (pidPage) _navWithPatient(navigate, pidPage, patientId);
      });
    });
    slot.querySelectorAll('[data-na-re-search]').forEach((b) => {
      b.addEventListener('click', () => {
        const q = b.getAttribute('data-na-re-search') || 'nutrition';
        try {
          window._reSearch = window._reSearch || {};
          window._reSearch.papers = q;
        } catch {}
        _navWithPatient(navigate, 'research-evidence', patientId);
      });
    });
  }

  await load();
}

export default { pgNutritionAnalyzer };
