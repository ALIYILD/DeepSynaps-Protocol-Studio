/**
 * Medication Analyzer — clinician-reviewed medication decision-support workspace.
 *
 * Does NOT: prescribe, dose-adjust, start/stop/switch meds, or provide final DDI authority.
 * Interaction checks use backend rule metadata (see API response engine_id / engine_detail).
 */

import { api } from './api.js';
import { isDemoSession } from './demo-session.js';
import { ANALYZER_DEMO_FIXTURES, DEMO_FIXTURE_BANNER_HTML } from './demo-fixtures-analyzers.js';
import { crossCheckMedNeuromod } from './medication-neuromod-rules.js';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Demo IDs must not read as real individuals on this clinical surface. */
const DEMO_PERSONA_PUBLIC_LABEL = Object.freeze({
  'demo-pt-samantha-li': 'Demo persona A (sample vignette)',
  'demo-pt-marcus-chen': 'Demo persona B (sample vignette)',
  'demo-pt-elena-vasquez': 'Demo persona C (sample vignette)',
});

function displayPatientLabel(patientId, rawName) {
  if (patientId && DEMO_PERSONA_PUBLIC_LABEL[patientId]) {
    return DEMO_PERSONA_PUBLIC_LABEL[patientId];
  }
  return rawName || patientId || 'Patient';
}

function _severityPillInteraction(sev) {
  const s = String(sev || '').toLowerCase();
  if (s === 'severe' || s === 'major' || s === 'critical') {
    return '<span class="pill" style="background:rgba(255,107,107,0.12);color:var(--red);border:1px solid rgba(255,107,107,0.25)">Higher concern</span>';
  }
  if (s === 'moderate' || s === 'amber') {
    return '<span class="pill pill-pending">Moderate signal</span>';
  }
  if (s === 'mild' || s === 'minor') {
    return '<span class="pill pill-review">Lower signal</span>';
  }
  if (s === 'none' || s === 'green' || s === 'clear') {
    return '<span class="pill pill-inactive">No rule hits</span>';
  }
  return '<span class="pill pill-inactive">Unknown</span>';
}

function _neuromodSeverityPill(sev) {
  const s = String(sev || '').toLowerCase();
  if (s === 'critical') return '<span class="pill" style="background:rgba(255,107,107,0.18);color:var(--red);border:1px solid rgba(255,107,107,0.4)">Critical—review</span>';
  if (s === 'major') return '<span class="pill" style="background:rgba(255,107,107,0.12);color:var(--red);border:1px solid rgba(255,107,107,0.25)">Major—review</span>';
  if (s === 'moderate') return '<span class="pill pill-pending">Moderate—review</span>';
  if (s === 'mild') return '<span class="pill pill-review">Mild—review</span>';
  if (s === 'monitor') return '<span class="pill" style="background:rgba(96,165,250,0.12);color:var(--blue);border:1px solid rgba(96,165,250,0.25)">Monitor</span>';
  return '<span class="pill pill-inactive">Unknown</span>';
}

function _neuromodSeverityColor(sev) {
  const s = String(sev || '').toLowerCase();
  if (s === 'critical' || s === 'major') return 'var(--red)';
  if (s === 'moderate') return 'var(--amber)';
  if (s === 'mild' || s === 'monitor') return 'var(--blue)';
  return 'var(--green)';
}

const _MODALITY_LABEL = {
  rtms: 'rTMS', tms: 'rTMS', tdcs: 'tDCS', tacs: 'tACS', trns: 'tRNS',
  ect: 'ECT', vns: 'VNS', tfus: 'tFUS', dbs: 'DBS', neurofeedback: 'Neurofeedback',
};

function _modLabel(m) {
  const k = String(m || '').toLowerCase();
  return _MODALITY_LABEL[k] || (k ? k.toUpperCase() : '—');
}

function _skeletonChips(n = 6) {
  const chip = '<span style="display:inline-block;width:120px;height:22px;border-radius:11px;background:linear-gradient(90deg,rgba(255,255,255,.04),rgba(255,255,255,.08),rgba(255,255,255,.04));background-size:200% 100%;animation:dh2AttnPulse 1.6s ease-in-out infinite"></span>';
  return `<div style="display:flex;gap:8px;flex-wrap:wrap">${Array.from({ length: n }, () => chip).join('')}</div>`;
}

function _errorCard(message, retryLabel = 'Try again') {
  const safe = esc(message || 'Request failed.');
  return `<div role="alert" style="max-width:560px;margin:24px auto;padding:18px 20px;border:1px solid rgba(255,107,107,0.35);background:rgba(255,107,107,0.06);border-radius:12px">
    <div style="font-weight:600;margin-bottom:6px;color:var(--text-primary)">Could not load medication workspace data</div>
    <div style="font-size:12px;color:var(--text-secondary);line-height:1.5;margin-bottom:12px">${safe}</div>
    <button type="button" class="btn btn-ghost btn-sm" data-action="retry" style="min-height:44px">${esc(retryLabel)}</button>
  </div>`;
}

function _missingSection(title, body) {
  return `<section style="margin-top:14px;padding:14px;border:1px dashed var(--border);border-radius:12px;background:rgba(255,255,255,.02)" aria-label="${esc(title)}">
    <div style="font-weight:600;font-size:13px;margin-bottom:6px">${esc(title)}</div>
    <div style="font-size:12px;color:var(--text-secondary);line-height:1.5">${body}</div>
  </section>`;
}

function _renderInteractionMeta(result, usingFixtures) {
  const engineId = result?.engine_id || (usingFixtures ? 'demo_fixture' : '—');
  const detail = result?.engine_detail || '';
  const demoNote = usingFixtures && isDemoSession()
    ? '<div style="margin-top:8px;padding:8px 10px;border-radius:8px;background:rgba(155,127,255,0.08);border:1px solid rgba(155,127,255,0.25);font-size:11px;color:var(--text-secondary)"><strong>Demo/sample:</strong> Interaction rows below are illustrative; they are not verified patient data.</div>'
    : '';
  return `<div style="margin-top:12px;padding:12px;border:1px solid var(--border);border-radius:12px;background:var(--bg-card);font-size:11px;color:var(--text-secondary);line-height:1.5">
    <div><strong style="color:var(--text-primary)">Interaction method:</strong> ${esc(engineId)}</div>
    ${detail ? `<div style="margin-top:6px">${esc(detail)}</div>` : ''}
    <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border);color:var(--amber)">
      <strong>Requires clinician/pharmacist review</strong> — follow your clinic medication safety protocol. This screen is not a verified drug–drug interaction database and must not be treated as clinically final.
    </div>
    ${demoNote}
  </div>`;
}

function _renderInteractionResults(result, usingFixtures) {
  if (!result) return '';
  const interactions = Array.isArray(result.interactions) ? result.interactions : [];
  const meta = _renderInteractionMeta(result, usingFixtures);
  if (!interactions.length) {
    return `${meta}<div style="margin-top:14px;padding:14px;border:1px solid var(--border);background:rgba(255,255,255,.02);border-radius:12px">
      <div style="font-weight:600;margin-bottom:4px;color:var(--text-primary)">No curated rule pairs matched</div>
      <div style="font-size:12px;color:var(--text-secondary);line-height:1.55">
        This does <strong>not</strong> prove absence of interactions — data may be incomplete, doses unspecified, or pairs outside the configured rule list.
        Missing medication history does not imply safety. Requires clinician/pharmacist review if prescribing or changing therapy.
      </div>
    </div>`;
  }
  const cards = interactions.map((it) => {
    const sev = String(it.severity || '').toLowerCase();
    const color = sev === 'none' ? 'var(--border)' : _neuromodSeverityColor(sev === 'severe' ? 'critical' : sev);
    const drugs = Array.isArray(it.drugs) ? it.drugs.join(' + ') : '—';
    const rec = it.recommendation
      ? `<div style="font-size:11px;color:var(--text-tertiary);margin-top:6px;padding:8px;border-radius:8px;background:rgba(255,255,255,.03)"><strong style="color:var(--text-secondary)">Review considerations (not a prescribing directive):</strong> ${esc(it.recommendation)}</div>`
      : '';
    return `<div style="padding:14px;border:1px solid ${color};background:rgba(255,255,255,.02);border-radius:12px;display:flex;flex-direction:column;gap:6px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
        <div style="font-weight:600;font-size:13px">Possible pair: ${esc(drugs)}</div>
        <div>${_severityPillInteraction(sev)}</div>
      </div>
      <div style="font-size:12px;color:var(--text-secondary);line-height:1.55">${esc(it.description || '')}</div>
      ${rec}
    </div>`;
  }).join('');
  return `${meta}<div style="margin-top:14px;display:flex;flex-direction:column;gap:10px">
    <div style="font-size:12px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px">Rule-based pair findings (${interactions.length})</div>
    ${cards}
  </div>`;
}

function _renderRefPills(refs) {
  if (!Array.isArray(refs) || !refs.length) return '';
  const items = refs.map((r) => {
    const pmid = String(r.pmid || '').trim();
    if (!pmid) return '';
    const meta = [r.year, r.journal].filter(Boolean).join(' · ');
    const title = esc(r.title || '');
    const tooltip = esc([r.title, meta].filter(Boolean).join(' — ') || `PMID ${pmid}`);
    const prefill = esc(`${pmid} ${r.title || ''}`.trim());
    const pubmed = `https://pubmed.ncbi.nlm.nih.gov/${esc(pmid)}/`;
    return `<span style="display:inline-flex;gap:6px;align-items:center;flex-wrap:wrap;margin:2px 8px 2px 0">
      <span style="font-size:11px;color:var(--text-tertiary);max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${tooltip}">${title}${meta ? ` <span style="opacity:.7">(${esc(meta)})</span>` : ''}</span>
      <button type="button" class="pill" data-action="open-evidence" data-prefill="${prefill}"
        title="Search this PMID in the local evidence corpus"
        style="background:rgba(155,127,255,0.10);color:var(--violet,#9b7fff);border:1px solid rgba(155,127,255,0.30);cursor:pointer;font-size:10.5px;min-height:24px;padding:2px 8px">Evidence search</button>
      <a class="pill" href="${pubmed}" target="_blank" rel="noopener noreferrer"
        title="Open PMID on PubMed (new tab)"
        style="background:rgba(45,212,191,0.10);color:var(--teal);border:1px solid rgba(45,212,191,0.30);text-decoration:none;font-size:10.5px;min-height:24px;padding:2px 8px">PubMed</a>
    </span>`;
  }).filter(Boolean).join('');
  if (!items) return '';
  return `<div style="margin-top:6px;display:flex;flex-direction:column;gap:4px">
    <div style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.4px">References</div>
    <div style="display:flex;flex-wrap:wrap;align-items:center;gap:2px">${items}</div>
  </div>`;
}

function _renderNeuromodSection(state, usingFixtures) {
  const fixtureNote = usingFixtures && isDemoSession()
    ? '<div style="font-size:11px;color:var(--text-tertiary);margin-bottom:8px">Demo/sample protocol context — not a real prescription record.</div>'
    : '';
  const headerLine = '<div style="font-size:12px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px">Medication ↔ neuromodulation (literature rules)</div>';
  const wrap = (inner) => `<div data-neuromod-section style="margin-top:18px;padding-top:14px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:10px">${fixtureNote}${headerLine}${inner}</div>`;

  if (state.status === 'loading') {
    return wrap('<div style="font-size:12px;color:var(--text-tertiary)">Loading neuromodulation protocol context…</div>');
  }
  if (state.status === 'error') {
    return wrap(`<div style="font-size:12px;color:var(--text-tertiary)">Could not load protocol list — neuromodulation cross-check unavailable.
      <button type="button" class="btn btn-ghost btn-sm" data-action="retry-neuromod" style="min-height:32px;padding:2px 10px;font-size:11px">Retry</button></div>`);
  }
  if (state.status === 'no-protocol') {
    return wrap('<div style="font-size:12px;color:var(--text-secondary)">No active neuromodulation prescription found for this patient — cross-check not applied. This does not assess oral medication interactions alone.</div>');
  }
  const proto = state.protocol || {};
  const modality = _modLabel(proto.modality);
  const protoLine = `<div style="font-size:12px;color:var(--text-secondary)">
    Protocol context: <strong style="color:var(--text-primary)">${esc(proto.protocol_name || modality)}</strong> · <span style="color:var(--violet,#9b7fff);font-weight:600">${esc(modality)}</span>${proto.target_region ? ` · ${esc(proto.target_region)}` : ''}
  </div>
  <div style="font-size:11px;color:var(--text-tertiary);line-height:1.45;margin-top:6px">
    Literature-based rule screen only (see references). <strong>Requires clinician/pharmacist review</strong> — not dosage advice; does not modify protocols without clinician action.
  </div>`;
  const matches = Array.isArray(state.matches) ? state.matches : [];
  if (!matches.length) {
    return wrap(`${protoLine}<div style="font-size:12px;color:var(--text-secondary)">No medication↔modality rule hits for this medication list. Does not exclude clinical risk — incomplete med list or untracked combinations remain possible.</div>`);
  }
  const cards = matches.map((rule) => {
    const color = _neuromodSeverityColor(rule.severity);
    const drug = rule.drug_label || rule.matched_med_name || 'Medication';
    const mod = _modLabel(rule.matched_modality);
    const rec = rule.recommendation
      ? `<div style="font-size:11px;color:var(--text-tertiary);margin-top:6px;padding:8px;border-radius:8px;background:rgba(255,255,255,.03)"><strong style="color:var(--text-secondary)">Literature considerations (context only):</strong> ${esc(rule.recommendation)}</div>`
      : '';
    return `<div style="padding:14px;border:1px solid ${color};background:rgba(255,255,255,.02);border-radius:12px;display:flex;flex-direction:column;gap:6px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
        <div style="font-weight:600;font-size:13px">${esc(drug)} · ${esc(mod)}</div>
        <div>${_neuromodSeverityPill(rule.severity)}</div>
      </div>
      <div style="font-size:12px;color:var(--text-secondary);line-height:1.5">${esc(rule.mechanism || '')}</div>
      ${rec}
      ${_renderRefPills(rule.references)}
    </div>`;
  }).join('');
  return wrap(`${protoLine}<div style="font-size:11px;color:var(--text-tertiary)">${matches.length} rule hit${matches.length === 1 ? '' : 's'} · verify against primary sources and clinic policy.</div>${cards}`);
}

function _renderMedRow(m) {
  const meta = [m.dose, m.frequency, m.route].filter(Boolean).join(' · ');
  const updated = m.updated_at ? `Updated ${String(m.updated_at).slice(0, 10)}` : '';
  const created = m.created_at && !m.updated_at ? `Entered ${String(m.created_at).slice(0, 10)}` : '';
  const sub = [m.prescriber ? `Source note: ${m.prescriber}` : '', m.started_at ? `Started ${m.started_at.slice(0, 10)}` : '', updated || created]
    .filter(Boolean).join(' · ');
  const stale = m.updated_at && (Date.now() - Date.parse(m.updated_at)) > 90 * 24 * 60 * 60 * 1000;
  const staleBanner = stale
    ? '<div style="font-size:10px;color:var(--amber);margin-top:4px">Stale record — verify currency with patient/pharmacy.</div>'
    : '';
  return `<li data-med-id="${esc(m.id)}" style="display:flex;justify-content:space-between;gap:12px;padding:12px;border-bottom:1px solid var(--border);min-height:44px;align-items:flex-start">
    <div style="flex:1;min-width:0">
      <div style="font-weight:600;font-size:13px">${esc(m.name || 'Unnamed medication')}${m.generic_name ? ` <span style="color:var(--text-tertiary);font-weight:400">(${esc(m.generic_name)})</span>` : ''}</div>
      <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">${esc(meta || 'Dose/route/frequency not recorded — interaction screening may be limited.')}</div>
      ${sub ? `<div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">${esc(sub)}</div>` : ''}
      ${staleBanner}
    </div>
    <button type="button" class="btn btn-ghost btn-sm" data-action="remove-med" data-med-id="${esc(m.id)}" style="min-height:44px;color:var(--red)" title="Remove from this workspace list (does not change prescriptions)">Remove</button>
  </li>`;
}

function _emptyMedsCard(patientLabel) {
  return `<div style="margin:14px 0;padding:18px 20px;border:1px dashed var(--border);border-radius:12px;background:rgba(255,255,255,.02)">
    <div style="font-weight:600;margin-bottom:6px">No medications in this workspace list</div>
    <div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px;line-height:1.55">
      An empty list does <strong>not</strong> confirm a patient has no medications — records may be incomplete, external to this system, or not yet imported.
      Requires clinician verification against source records before clinical decisions.
    </div>
    <button type="button" class="btn btn-primary btn-sm" data-action="focus-add" style="min-height:44px">Add a medication row</button>
  </div>`;
}

function _renderMedList(meds, patientLabel) {
  if (!Array.isArray(meds) || !meds.length) return _emptyMedsCard(patientLabel);
  return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;overflow:hidden">
    <ul style="list-style:none;margin:0;padding:0" aria-label="Medication list">${meds.map(_renderMedRow).join('')}</ul>
  </div>`;
}

function _renderAddForm() {
  return `<form data-add-med-form style="margin-top:14px;padding:14px;border:1px dashed var(--border);border-radius:12px;background:rgba(255,255,255,.02);display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px">
    <div style="grid-column:1/-1;font-size:11px;color:var(--text-tertiary);line-height:1.45">
      Adds a row to the clinic medication list in this product for review workflows — <strong>not</strong> an e-prescription and not sent to a pharmacy from this action alone.
    </div>
    <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--text-tertiary)">
      Name
      <input class="form-control" name="name" required placeholder="Medication name" autocomplete="off" style="min-height:44px" aria-required="true">
    </label>
    <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--text-tertiary)">
      Dose
      <input class="form-control" name="dose" placeholder="Optional" style="min-height:44px">
    </label>
    <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--text-tertiary)">
      Frequency
      <input class="form-control" name="frequency" placeholder="Optional" style="min-height:44px">
    </label>
    <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--text-tertiary)">
      Route
      <input class="form-control" name="route" placeholder="Optional" style="min-height:44px">
    </label>
    <div style="grid-column:1 / -1;display:flex;gap:8px;justify-content:flex-end">
      <button type="submit" class="btn btn-primary btn-sm" style="min-height:44px">Add medication row</button>
    </div>
  </form>`;
}

function _renderRiskSnippet(profile) {
  const cats = Array.isArray(profile?.categories) ? profile.categories : [];
  const med = cats.find((c) => c.category === 'medication');
  const adh = cats.find((c) => c.category === 'adherence');
  const fmt = (c) => {
    if (!c) return 'Not available — risk model may be uncomputed or access denied.';
    const lvl = esc(c.level || 'unknown');
    const conf = c.confidence != null ? ` · confidence ${esc(c.confidence)}` : '';
    const comp = c.computed_at ? ` · computed ${esc(new Date(c.computed_at).toLocaleString())}` : '';
    const factors = Array.isArray(c.evidence_refs) && c.evidence_refs.length
      ? `<div style="margin-top:6px;font-size:11px;color:var(--text-tertiary)">Factors (labels): ${c.evidence_refs.slice(0, 4).map((x) => esc(typeof x === 'string' ? x : (x.label || ''))).filter(Boolean).join('; ') || '—'}</div>`
      : '';
    return `<div style="font-size:12px;color:var(--text-secondary);line-height:1.5"><strong>${lvl}</strong>${conf}${comp}${factors}</div>`;
  };
  return `<div style="margin-top:12px;padding:12px;border:1px solid var(--border);border-radius:12px;background:rgba(255,255,255,.02)">
    <div style="font-weight:600;font-size:13px;margin-bottom:8px">Linked risk stratification (decision-support)</div>
    <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:8px">Traffic-light outputs are model-assisted, not definitive clinical findings. Requires clinician review.</div>
    <div style="margin-bottom:10px"><span style="font-size:11px;font-weight:600;color:var(--text-tertiary)">Medication category</span>${fmt(med)}</div>
    <div><span style="font-size:11px;font-weight:600;color:var(--text-tertiary)">Adherence category</span>${fmt(adh)}</div>
  </div>`;
}

function _renderGovernancePanel() {
  return `<section style="margin-top:14px;padding:14px;border:1px solid var(--border);border-radius:12px;background:var(--bg-card)" aria-label="Governance">
    <div style="font-weight:600;font-size:13px;margin-bottom:8px">Evidence & policy status</div>
    <ul style="margin:0;padding-left:18px;font-size:12px;color:var(--text-secondary);line-height:1.55">
      <li>Drug–drug screening: in-product curated rules / demo fixtures — <strong>not</strong> a commercial interaction database unless separately configured by your organisation.</li>
      <li>Adherence / refill / pharmacy signals: <strong>not integrated</strong> on this page — use patient charts, pharmacy, and clinic workflows.</li>
      <li>Side effects / adverse events: capture via assessments, documents, and clinical review — not auto-imported here.</li>
      <li>If governance rules are not configured for your tenant, all outputs remain review-gated documentation aids only.</li>
    </ul>
  </section>`;
}

function _renderMedicationAnalyzerSupport(payload) {
  const data = payload || {};
  const notes = Array.isArray(data.persisted_review_notes) ? data.persisted_review_notes : [];
  const timeline = Array.isArray(data.timeline) ? data.timeline : [];
  const disclosures = data.regulatory_disclosures || null;
  const timelineRows = timeline.length
    ? timeline.slice().reverse().slice(0, 8).map((ev) => {
      const detail = ev?.payload && Object.keys(ev.payload).length
        ? `<div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">${esc(JSON.stringify(ev.payload))}</div>`
        : '';
      return `<div style="padding:10px 0;border-bottom:1px solid var(--border)">
        <div style="font-size:12px;color:var(--text-secondary)"><strong style="color:var(--text-primary)">${esc(ev.event_type || 'event')}</strong> · ${esc(ev.occurred_at || '—')}</div>
        ${detail}
      </div>`;
    }).join('')
    : '<div style="font-size:12px;color:var(--text-tertiary)">No saved timeline annotations yet.</div>';
  const noteRows = notes.length
    ? notes.slice(0, 8).map((note) => `<div style="padding:10px 0;border-bottom:1px solid var(--border)">
        <div style="font-size:10px;color:var(--text-tertiary);margin-bottom:4px">${esc(note.created_at || '—')}</div>
        <div style="font-size:12px;color:var(--text-secondary);white-space:pre-wrap">${esc(note.note_text || '')}</div>
      </div>`).join('')
    : '<div style="font-size:12px;color:var(--text-tertiary)">No saved review notes yet.</div>';
  const disclosureBlock = disclosures
    ? `<div style="font-size:12px;color:var(--text-secondary);line-height:1.55">
        <div><strong style="color:var(--text-primary)">Intended use:</strong> ${esc(disclosures.intended_use || '—')}</div>
        <div style="margin-top:6px"><strong style="color:var(--text-primary)">Not intended for:</strong> ${esc((disclosures.not_intended_for || []).join(' · ') || '—')}</div>
        <div style="margin-top:6px"><strong style="color:var(--text-primary)">Evidence basis:</strong> ${esc(disclosures.evidence_basis || '—')}</div>
      </div>`
    : '<div style="font-size:12px;color:var(--text-tertiary)">Medication Analyzer payload not available yet. The medication workspace still works without this research block.</div>';
  return `<section style="margin-top:16px;padding:14px;border:1px solid var(--border);border-radius:12px;background:var(--bg-card)" aria-label="Medication analyzer support">
    <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap">
      <h2 style="font-size:15px;font-weight:600;margin:0">Medication Analyzer support</h2>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button type="button" class="btn btn-ghost btn-sm" id="ma-refresh-analyzer" style="min-height:40px">Refresh analyzer payload</button>
        <button type="button" class="btn btn-ghost btn-sm" id="ma-export-irb" style="min-height:40px">Export IRB JSON</button>
      </div>
    </div>
    <div style="margin-top:12px;padding:12px;border:1px solid var(--border);border-radius:12px;background:rgba(255,255,255,.02)">
      <div style="font-weight:600;font-size:13px;margin-bottom:8px">Research / algorithm disclosure</div>
      ${disclosureBlock}
      ${data.audit_ref ? `<div style="margin-top:8px;font-size:11px;color:var(--text-tertiary)">Audit ref: ${esc(data.audit_ref)}</div>` : ''}
    </div>
    <div style="margin-top:14px;display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px">
      <div style="padding:12px;border:1px solid var(--border);border-radius:12px;background:rgba(255,255,255,.02)">
        <div style="font-weight:600;font-size:13px;margin-bottom:8px">Add timeline annotation</div>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--text-tertiary)">
          Event type
          <select class="form-control" name="timeline-event-type" style="min-height:44px">
            <option value="side_effect_report">Side-effect report</option>
            <option value="missed_dose">Missed dose</option>
            <option value="dose_change_external">Dose change (external/EHR)</option>
            <option value="symptom_change">Symptom change</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--text-tertiary);margin-top:10px">
          Occurred at (ISO)
          <input class="form-control" name="timeline-occurred-at" placeholder="2026-05-01T14:00:00Z" style="min-height:44px">
        </label>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--text-tertiary);margin-top:10px">
          Detail
          <textarea class="form-control" name="timeline-detail" rows="2" placeholder="Brief note for review / audit"></textarea>
        </label>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px">
          <button type="button" class="btn btn-primary btn-sm" data-action="save-timeline-event" style="min-height:40px">Add timeline annotation</button>
          <span data-med-timeline-status style="font-size:12px;color:var(--text-tertiary)"></span>
        </div>
        <div style="margin-top:10px">${timelineRows}</div>
      </div>
      <div style="padding:12px;border:1px solid var(--border);border-radius:12px;background:rgba(255,255,255,.02)">
        <div style="font-weight:600;font-size:13px;margin-bottom:8px">Clinician review notes (persisted)</div>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--text-tertiary)">
          New note
          <textarea class="form-control" name="review-note-text" rows="3" placeholder="Documentation for chart review, IRB, or handoff — not a prescription"></textarea>
        </label>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px">
          <button type="button" class="btn btn-primary btn-sm" data-action="save-review-note" style="min-height:40px">Save note</button>
          <span data-med-note-status style="font-size:12px;color:var(--text-tertiary)"></span>
        </div>
        <div style="margin-top:10px">${noteRows}</div>
      </div>
    </div>
    <details style="margin-top:14px;border:1px solid var(--border);border-radius:12px;background:rgba(255,255,255,.02)">
      <summary style="cursor:pointer;padding:12px 14px;font-weight:600">Persisted review notes & audit (server)</summary>
      <div data-med-audit-strip style="padding:0 14px 14px;font-size:12px;color:var(--text-secondary)">Loading…</div>
    </details>
  </section>`;
}

function _renderLinkedActions() {
  return `<section style="margin-top:14px;padding:14px;border:1px solid var(--border);border-radius:12px;background:rgba(255,255,255,.02)" aria-label="Linked modules">
    <div style="font-weight:600;font-size:13px;margin-bottom:10px">Linked workflows</div>
    <div style="display:flex;flex-wrap:wrap;gap:8px">
      <button type="button" class="btn btn-ghost btn-sm" data-nav="patient-profile" style="min-height:40px">Patient profile</button>
      <button type="button" class="btn btn-ghost btn-sm" data-nav="assessments" style="min-height:40px">Assessments</button>
      <button type="button" class="btn btn-ghost btn-sm" data-nav="documents-hub" style="min-height:40px">Documents</button>
      <button type="button" class="btn btn-ghost btn-sm" data-nav="text-analyzer" style="min-height:40px">Text analyzer</button>
      <button type="button" class="btn btn-ghost btn-sm" data-nav="labs-analyzer" style="min-height:40px">Biomarkers / labs</button>
      <button type="button" class="btn btn-ghost btn-sm" data-nav="risk-analyzer" style="min-height:40px">Risk Analyzer</button>
      <button type="button" class="btn btn-ghost btn-sm" data-nav="deeptwin" style="min-height:40px">DeepTwin</button>
      <button type="button" class="btn btn-ghost btn-sm" data-nav="protocol-hub" style="min-height:40px">Protocol Studio</button>
      <button type="button" class="btn btn-ghost btn-sm" data-nav="scheduling-hub" style="min-height:40px">Schedule</button>
      <button type="button" class="btn btn-ghost btn-sm" data-nav="inbox" style="min-height:40px">Inbox</button>
      <button type="button" class="btn btn-ghost btn-sm" data-nav="session-execution" style="min-height:40px">Live session</button>
      <button type="button" class="btn btn-ghost btn-sm" data-nav="qeeg-analysis" style="min-height:40px">qEEG</button>
      <button type="button" class="btn btn-ghost btn-sm" data-nav="mri-analysis" style="min-height:40px">MRI</button>
      <button type="button" class="btn btn-ghost btn-sm" data-nav="voice-analyzer" style="min-height:40px">Voice</button>
      <button type="button" class="btn btn-ghost btn-sm" data-nav="video-assessments" style="min-height:40px">Video</button>
      <button type="button" class="btn btn-ghost btn-sm" data-nav="research-evidence" style="min-height:40px">Evidence library</button>
      <button type="button" class="btn btn-ghost btn-sm" data-nav="handbooks-v2" style="min-height:40px">Handbooks</button>
    </div>
    <p style="font-size:11px;color:var(--text-tertiary);margin:10px 0 0;line-height:1.45">Opens the selected workspace with this patient when the destination supports <code style="font-size:10px">window._profilePatientId</code> / patient context.</p>
  </section>`;
}

function _renderLogTable(items, navigate) {
  if (!Array.isArray(items) || !items.length) {
    return `<div style="max-width:520px;margin:24px auto;padding:24px;border:1px solid var(--border);border-radius:14px;background:var(--bg-card);text-align:center">
      <div style="font-size:15px;font-weight:600;margin-bottom:8px">No interaction checks logged yet</div>
      <div style="font-size:12px;color:var(--text-secondary);margin-bottom:14px;line-height:1.55">
        The log records screening runs stored by the API when a clinician checks interactions for a patient.
        An empty log does not mean patients have no medications or no risks — only that no checks were persisted here.
      </div>
      <button type="button" class="btn btn-primary btn-sm" id="ma-go-patients" style="min-height:44px">Open patient directory</button>
    </div>`;
  }
  const rows = items.map((it) => {
    const when = it.created_at ? new Date(it.created_at).toLocaleString() : '—';
    const meds = Array.isArray(it.medications_checked) ? it.medications_checked.join(', ') : '—';
    const sev = it.severity_summary || 'none';
    const interactions = Array.isArray(it.interactions_found) ? it.interactions_found.length : 0;
    const action = interactions > 0
      ? `${interactions} possible pair${interactions === 1 ? '' : 's'} flagged (rule screen)`
      : 'No rule hits';
    const pname = displayPatientLabel(it.patient_id, it.patient_name || it.patient_id);
    return `<tr data-patient-id="${esc(it.patient_id)}" data-patient-name="${esc(pname)}" tabindex="0" role="button"
      style="cursor:pointer;min-height:44px"
      onmouseover="this.style.background='rgba(255,255,255,.03)'"
      onmouseout="this.style.background='transparent'">
      <td style="padding:10px;border-bottom:1px solid var(--border);font-size:11px;color:var(--text-tertiary);white-space:nowrap">${esc(when)}</td>
      <td style="padding:10px;border-bottom:1px solid var(--border);font-weight:500">${esc(pname)}</td>
      <td style="padding:10px;border-bottom:1px solid var(--border);font-size:12px;color:var(--text-secondary)">${esc(meds)}</td>
      <td style="padding:10px;border-bottom:1px solid var(--border);text-align:center">${_severityPillInteraction(sev)}</td>
      <td style="padding:10px;border-bottom:1px solid var(--border);font-size:12px;color:var(--text-secondary)">${esc(action)}</td>
    </tr>`;
  }).join('');
  return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:14px;overflow:auto">
    <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:760px" aria-label="Medication interaction check log">
      <thead><tr>
        <th scope="col" style="padding:8px 10px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border)">When</th>
        <th scope="col" style="padding:8px 10px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border)">Patient</th>
        <th scope="col" style="padding:8px 10px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border)">Medications checked</th>
        <th scope="col" style="padding:8px 10px;text-align:center;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border)">Screen summary</th>
        <th scope="col" style="padding:8px 10px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border)">Outcome</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function _normaliseMedList(resp) {
  if (Array.isArray(resp?.items)) return resp.items;
  if (Array.isArray(resp?.medications)) return resp.medications;
  if (Array.isArray(resp)) return resp;
  return [];
}

function _normaliseLog(resp) {
  if (Array.isArray(resp?.items)) return resp.items;
  if (Array.isArray(resp)) return resp;
  return [];
}

function _enrichLogWithNames(items) {
  const personas = ANALYZER_DEMO_FIXTURES?.patients || [];
  return items.map((it) => {
    if (it.patient_name && !DEMO_PERSONA_PUBLIC_LABEL[it.patient_id]) return it;
    const match = personas.find((p) => p.id === it.patient_id);
    const raw = match ? match.name : it.patient_name || it.patient_id;
    const label = displayPatientLabel(it.patient_id, raw);
    return { ...it, patient_name: label };
  });
}

function _openLinkedPatientPage(navigate, patientId, page) {
  try {
    window._profilePatientId = patientId;
    window._selectedPatientId = patientId;
    window._patientHubSelectedId = patientId;
    window._deeptwinPatientId = patientId;
  } catch {}
  try { navigate?.(page); } catch {}
}

export async function pgMedicationAnalyzer(setTopbar, navigate) {
  try {
    setTopbar({
      title: 'Medication Analyzer',
      subtitle: 'Clinician-reviewed medication list & interaction screening',
    });
  } catch {
    try { setTopbar('Medication Analyzer', 'Medication review'); } catch {}
  }

  const el = document.getElementById('content');
  if (!el) return;

  let view = 'log';
  let logCache = null;
  let patientPicker = [];
  let activePatientId = null;
  let activePatientName = '';
  let medsCache = [];
  let lastInteractionResult = null;
  let riskProfileCache = null;
  let analyzerPayload = null;
  let usingFixtures = false;
  let neuromodState = { status: 'loading', protocol: null, matches: [] };

  el.innerHTML = `
    <div class="ds-medication-analyzer-shell" style="max-width:1100px;margin:0 auto;padding:16px 20px 48px" data-testid="medication-analyzer-page">
      <div id="ma-demo-banner"></div>
      <header style="padding:12px 14px;border-radius:12px;border:1px solid rgba(155,127,255,0.28);background:rgba(155,127,255,0.06);margin-bottom:14px;font-size:12px;line-height:1.45;color:var(--text-secondary)">
        <strong style="color:var(--text-primary)">Clinical decision-support.</strong>
        Does not prescribe, dose, or replace pharmacist review. For clinician/pharmacist use only; not final drug-interaction authority.
        Outputs require verification against source records and local formulary; follow clinic medication safety protocols for risks including interactions, adherence uncertainty, pregnancy, controlled substances, and self-harm context.
      </header>
      <div id="ma-breadcrumb" style="display:flex;align-items:center;gap:10px;margin-bottom:12px;font-size:12px;flex-wrap:wrap"></div>
      <div id="ma-body"></div>
    </div>`;

  const $ = (id) => document.getElementById(id);

  function _syncDemoBanner() {
    const slot = $('ma-demo-banner');
    if (!slot) return;
    slot.innerHTML = usingFixtures && isDemoSession() ? DEMO_FIXTURE_BANNER_HTML : '';
  }

  function setBreadcrumb() {
    const bc = $('ma-breadcrumb');
    if (!bc) return;
    if (view === 'log') {
      bc.innerHTML = `
        <button type="button" class="btn btn-ghost btn-sm" id="ma-back-clinic" style="min-height:44px">← Clinical hub</button>
        <span style="color:var(--text-tertiary)">/</span>
        <span style="font-weight:600">Medication checks log</span>`;
      $('ma-back-clinic')?.addEventListener('click', () => {
        try { navigate?.('clinical-hub'); } catch {}
      });
    } else {
      bc.innerHTML = `<button type="button" class="btn btn-ghost btn-sm" id="ma-back" style="min-height:44px">← Back to log</button>
        <span style="color:var(--text-tertiary)">/</span>
        <span style="font-weight:600">${esc(activePatientName || 'Patient')}</span>`;
      $('ma-back')?.addEventListener('click', () => { view = 'log'; lastInteractionResult = null; riskProfileCache = null; render(); });
    }
  }

  function _openPatient(pid, pname) {
    activePatientId = pid;
    activePatientName = displayPatientLabel(pid, pname);
    lastInteractionResult = null;
    riskProfileCache = null;
    neuromodState = { status: 'loading', protocol: null, matches: [] };
    view = 'patient';
    try {
      window._profilePatientId = pid;
      window._selectedPatientId = pid;
    } catch {}
    render();
  }

  function _refreshNeuromodSlot() {
    const body = $('ma-body');
    const slot = body?.querySelector('[data-neuromod-results]');
    if (!slot) return;
    slot.innerHTML = _renderNeuromodSection(neuromodState, usingFixtures);
    _wireNeuromodSlot();
  }

  function _wireNeuromodSlot() {
    const body = $('ma-body');
    if (!body) return;
    body.querySelectorAll('[data-neuromod-section] [data-action="open-evidence"]').forEach((b) => {
      b.addEventListener('click', () => {
        const prefill = b.getAttribute('data-prefill') || '';
        try {
          window._reEvidencePrefill = prefill;
          window._resEvidenceTab = 'search';
        } catch {}
        try { navigate?.('research-evidence'); } catch {}
      });
    });
    body.querySelectorAll('[data-neuromod-section] [data-action="retry-neuromod"]').forEach((b) => {
      b.addEventListener('click', () => { loadNeuromodForPatient(); });
    });
  }

  function _activeProtocolFromList(items) {
    const arr = Array.isArray(items) ? items : [];
    const withModality = arr.filter((p) => p && (p.modality || p.modality_key));
    if (!withModality.length) return null;
    const active = withModality.find((p) => String(p.status || '').toLowerCase() === 'active');
    const ranked = (active ? [active] : withModality).slice().sort((a, b) => {
      const ta = Date.parse(a.updated_at || a.created_at || a.started_at || 0) || 0;
      const tb = Date.parse(b.updated_at || b.created_at || b.started_at || 0) || 0;
      return tb - ta;
    });
    return ranked[0] || null;
  }

  async function loadNeuromodForPatient() {
    if (!activePatientId) return;
    neuromodState = { status: 'loading', protocol: null, matches: [] };
    _refreshNeuromodSlot();
    let items = null;
    try {
      if (usingFixtures && ANALYZER_DEMO_FIXTURES?.medication?.active_protocol) {
        items = (ANALYZER_DEMO_FIXTURES.medication.active_protocol(activePatientId) || {}).items || [];
      } else {
        const resp = await api.listSavedProtocols(activePatientId);
        items = Array.isArray(resp?.items) ? resp.items : (Array.isArray(resp) ? resp : []);
        if ((!items || !items.length) && isDemoSession() && ANALYZER_DEMO_FIXTURES?.medication?.active_protocol) {
          items = (ANALYZER_DEMO_FIXTURES.medication.active_protocol(activePatientId) || {}).items || [];
        }
      }
    } catch (e) {
      if (isDemoSession() && ANALYZER_DEMO_FIXTURES?.medication?.active_protocol) {
        items = (ANALYZER_DEMO_FIXTURES.medication.active_protocol(activePatientId) || {}).items || [];
      } else {
        neuromodState = { status: 'error', protocol: null, matches: [] };
        _refreshNeuromodSlot();
        return;
      }
    }
    const protocol = _activeProtocolFromList(items);
    if (!protocol) {
      neuromodState = { status: 'no-protocol', protocol: null, matches: [] };
      _refreshNeuromodSlot();
      return;
    }
    const modality = String(protocol.modality || protocol.modality_key || '').toLowerCase();
    const matches = crossCheckMedNeuromod({
      meds: medsCache,
      modalities: [modality],
    });
    neuromodState = { status: 'ok', protocol, matches };
    _refreshNeuromodSlot();
  }

  async function loadPatientPicker() {
    try {
      const resp = await api.listPatients({ limit: 200 });
      const items = Array.isArray(resp?.items) ? resp.items : (Array.isArray(resp) ? resp : []);
      patientPicker = items.map((p) => ({
        id: p.id || p.patient_id,
        name: p.name || p.display_name || p.patient_name || p.id,
      })).filter((p) => p.id);
    } catch {
      patientPicker = [];
    }
  }

  function _renderPatientPickerRow() {
    if (!patientPicker.length) {
      return `<div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px">
        No patients returned from API — open the patient directory to register patients, or use demo session fixtures when enabled.
        <button type="button" class="btn btn-primary btn-sm" id="ma-open-patients-top" style="min-height:40px;margin-left:8px">Patients</button>
      </div>`;
    }
    const opts = patientPicker.map((p) => {
      const label = displayPatientLabel(p.id, p.name);
      return `<option value="${esc(p.id)}">${esc(label)}</option>`;
    }).join('');
    return `<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:14px">
      <label style="font-size:12px;color:var(--text-secondary);display:flex;align-items:center;gap:8px">
        <span>Open patient</span>
        <select id="ma-patient-select" class="form-control" style="min-width:220px;min-height:44px" aria-label="Select patient">
          <option value="">Choose…</option>
          ${opts}
        </select>
      </label>
      <button type="button" class="btn btn-primary btn-sm" id="ma-open-selected" style="min-height:44px" disabled>Open</button>
    </div>`;
  }

  async function loadLog() {
    const body = $('ma-body');
    if (!body) return;
    body.innerHTML = `<div style="padding:18px;background:var(--bg-card);border:1px solid var(--border);border-radius:14px">
      ${_skeletonChips(5)}
    </div>`;
    await loadPatientPicker();
    try {
      const resp = await api.getMedicationInteractionLog();
      let items = _normaliseLog(resp);
      if (items.length === 0 && isDemoSession()) {
        items = ANALYZER_DEMO_FIXTURES.medication.interaction_log;
        usingFixtures = true;
      } else {
        usingFixtures = false;
      }
      logCache = _enrichLogWithNames(items);
    } catch (e) {
      if (isDemoSession()) {
        logCache = _enrichLogWithNames(ANALYZER_DEMO_FIXTURES.medication.interaction_log);
        usingFixtures = true;
      } else {
        const msg = (e && e.message) || String(e);
        body.innerHTML = _errorCard(msg);
        body.querySelector('[data-action="retry"]')?.addEventListener('click', loadLog);
        return;
      }
    }
    _syncDemoBanner();
    body.innerHTML = `
      ${_renderPatientPickerRow()}
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px">
        <button type="button" class="btn btn-ghost btn-sm" id="ma-refresh-log" style="min-height:44px">Refresh log</button>
        <button type="button" class="btn btn-ghost btn-sm" id="ma-export-log" style="min-height:44px" ${!logCache?.length ? 'disabled' : ''} title="Download visible log as JSON">Export log snapshot</button>
      </div>
      ${_renderGovernancePanel()}
      ${_renderLogTable(logCache, navigate)}
    `;
    $('ma-open-patients-top')?.addEventListener('click', () => { try { navigate?.('patients-v2'); } catch {} });
    const sel = $('ma-patient-select');
    const openSel = $('ma-open-selected');
    sel?.addEventListener('change', () => {
      if (openSel) openSel.disabled = !sel.value;
    });
    openSel?.addEventListener('click', () => {
      const pid = sel?.value;
      if (!pid) return;
      const p = patientPicker.find((x) => x.id === pid);
      _openPatient(pid, p?.name || pid);
    });
    $('ma-refresh-log')?.addEventListener('click', () => loadLog());
    $('ma-export-log')?.addEventListener('click', () => {
      if (!logCache?.length) return;
      const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), items: logCache }, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'medication-interaction-log-snapshot.json';
      a.click();
      URL.revokeObjectURL(a.href);
    });
    body.querySelector('#ma-go-patients')?.addEventListener('click', () => {
      try { navigate?.('patients-v2'); } catch {}
    });
    body.querySelectorAll('tr[data-patient-id]').forEach((tr) => {
      const pid = tr.getAttribute('data-patient-id');
      const pname = tr.getAttribute('data-patient-name') || pid;
      const open = () => _openPatient(pid, pname);
      tr.addEventListener('click', open);
      tr.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(); }
      });
    });
  }

  async function loadPatient() {
    const body = $('ma-body');
    if (!body || !activePatientId) return;
    body.innerHTML = `<div style="padding:18px;background:var(--bg-card);border:1px solid var(--border);border-radius:14px">
      ${_skeletonChips(4)}
    </div>`;
    try {
      const resp = await api.getPatientMedications(activePatientId);
      let meds = _normaliseMedList(resp);
      if (meds.length === 0 && isDemoSession()) {
        meds = ANALYZER_DEMO_FIXTURES.medication.patient_medications(activePatientId);
        usingFixtures = true;
      }
      medsCache = meds;
    } catch (e) {
      if (isDemoSession()) {
        medsCache = ANALYZER_DEMO_FIXTURES.medication.patient_medications(activePatientId);
        usingFixtures = true;
      } else {
        const msg = (e && e.message) || String(e);
        body.innerHTML = _errorCard(msg);
        body.querySelector('[data-action="retry"]')?.addEventListener('click', loadPatient);
        return;
      }
    }

    try {
      riskProfileCache = await api.getPatientRiskProfile(activePatientId);
    } catch {
      riskProfileCache = null;
    }
    try {
      analyzerPayload = await api.medicationAnalyzerPayload(activePatientId);
    } catch {
      analyzerPayload = null;
    }

    _syncDemoBanner();
    const dataAvail = usingFixtures && isDemoSession()
      ? '<div style="font-size:11px;color:var(--amber);margin-bottom:10px;padding:8px 10px;border-radius:8px;border:1px dashed rgba(255,180,80,0.35);background:rgba(255,180,80,0.06)"><strong>Demo/sample data.</strong> Labels refer to synthetic vignettes — not real patients or pharmacy feeds.</div>'
      : `<div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px;line-height:1.55">
          Source: clinic-entered medication rows in this product (API). Completeness depends on data entry and imports — not a guaranteed medication reconciliation.
        </div>`;

    body.innerHTML = `
      <section aria-label="Patient context">
        <h2 style="font-size:15px;font-weight:600;margin:0 0 8px">Patient context</h2>
        ${dataAvail}
        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
          <button type="button" class="btn btn-ghost btn-sm" id="ma-change-patient" style="min-height:44px">Change patient</button>
          <button type="button" class="btn btn-ghost btn-sm" id="ma-refresh-meds" style="min-height:44px">Refresh medication list</button>
          <button type="button" class="btn btn-ghost btn-sm" id="ma-recompute-risk" style="min-height:44px">Recompute risk categories</button>
          <button type="button" class="btn btn-ghost btn-sm" id="ma-export-summary" style="min-height:44px">Export medication summary (JSON)</button>
        </div>
      </section>
      ${riskProfileCache ? _renderRiskSnippet(riskProfileCache) : _missingSection('Risk / adherence signals', 'Risk categories could not be loaded (uncomputed, unauthorized, or offline). Use Risk Analyzer for full detail — not implied from this page alone.')}
      ${_missingSection('Medication history, adherence, refills, side effects', 'Not integrated on this page. Review EHR/pharmacy records, patient-reported events, and linked modules. Possible refill gaps or self-reported adherence require clinician interpretation — not proof of non-adherence.')}
      <section style="margin-top:16px" aria-label="Current medications">
        <h2 style="font-size:15px;font-weight:600;margin:0 0 8px">Current medication list (workspace)</h2>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin:12px 0 14px;flex-wrap:wrap">
          <div style="font-size:12px;color:var(--text-tertiary)">${medsCache.length} row${medsCache.length === 1 ? '' : 's'} · requires verification against authoritative sources</div>
          <button type="button" class="btn btn-primary btn-sm" data-action="check-interactions" ${medsCache.length < 2 ? 'disabled' : ''} style="min-height:44px" title="${medsCache.length < 2 ? 'Enter at least two medication names to run the pairwise rule screen' : 'Run backend interaction rule screen'}">Run interaction rule screen</button>
        </div>
        <div data-med-list-slot>${_renderMedList(medsCache, activePatientName)}</div>
        ${_renderAddForm()}
        <div data-interaction-results style="margin-top:14px">${_renderInteractionResults(lastInteractionResult, usingFixtures)}</div>
        <div data-neuromod-results>${_renderNeuromodSection(neuromodState, usingFixtures)}</div>
      </section>
      ${_renderMedicationAnalyzerSupport(analyzerPayload)}
      ${_renderGovernancePanel()}
      ${_renderLinkedActions()}
    `;

    $('ma-change-patient')?.addEventListener('click', () => { view = 'log'; render(); });
    $('ma-refresh-meds')?.addEventListener('click', () => loadPatient());
    $('ma-recompute-risk')?.addEventListener('click', async (ev) => {
      const btn = ev.currentTarget;
      const old = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Recomputing…';
      try {
        await api.recomputeRisk(activePatientId);
        riskProfileCache = await api.getPatientRiskProfile(activePatientId);
        await loadPatient();
      } catch (e) {
        btn.disabled = false;
        btn.textContent = old;
        alert((e && e.message) || String(e));
      }
    });
    $('ma-export-summary')?.addEventListener('click', () => {
      const payload = {
        exported_at: new Date().toISOString(),
        patient_id: activePatientId,
        patient_label: activePatientName,
        demo_mode: usingFixtures && isDemoSession(),
        medications: medsCache,
        last_interaction_result: lastInteractionResult,
        neuromod_state: neuromodState,
        risk_profile: riskProfileCache,
        analyzer_payload: analyzerPayload,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `medication-summary-${activePatientId}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    });

    body.querySelectorAll('[data-nav]').forEach((b) => {
      b.addEventListener('click', () => {
        const page = b.getAttribute('data-nav');
        if (page) _openLinkedPatientPage(navigate, activePatientId, page);
      });
    });

    wirePatientDetail();
    loadNeuromodForPatient();
    loadAnalyzerAuditStrip();
  }

  function _refreshMedListInPlace() {
    const body = $('ma-body');
    if (!body) return;
    const slot = body.querySelector('[data-med-list-slot]');
    if (slot) slot.innerHTML = _renderMedList(medsCache, activePatientName);
    const btn = body.querySelector('[data-action="check-interactions"]');
    if (btn) btn.disabled = medsCache.length < 2;
    wireMedRows();
    if (neuromodState && neuromodState.status === 'ok' && neuromodState.protocol) {
      const modality = String(neuromodState.protocol.modality || neuromodState.protocol.modality_key || '').toLowerCase();
      neuromodState = {
        status: 'ok',
        protocol: neuromodState.protocol,
        matches: crossCheckMedNeuromod({ meds: medsCache, modalities: [modality] }),
      };
      _refreshNeuromodSlot();
    }
  }

  function wireMedRows() {
    const body = $('ma-body');
    body?.querySelectorAll('[data-action="remove-med"]').forEach((b) => {
      b.addEventListener('click', async () => {
        const mid = b.getAttribute('data-med-id');
        if (!mid) return;
        b.disabled = true;
        b.textContent = 'Removing…';
        try {
          if (!usingFixtures) {
            await api.removeMedication(activePatientId, mid);
          }
          medsCache = medsCache.filter((m) => m.id !== mid);
          _refreshMedListInPlace();
        } catch (e) {
          b.disabled = false;
          b.textContent = 'Remove';
          alert((e && e.message) || String(e));
        }
      });
    });
    body?.querySelector('[data-action="focus-add"]')?.addEventListener('click', () => {
      body.querySelector('[data-add-med-form] input[name="name"]')?.focus();
    });
  }

  function wirePatientDetail() {
    const body = $('ma-body');
    if (!body) return;

    wireMedRows();
    _wireNeuromodSlot();

    body.querySelector('[data-add-med-form]')?.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const form = ev.currentTarget;
      const fd = new FormData(form);
      const payload = {
        name: String(fd.get('name') || '').trim(),
        dose: String(fd.get('dose') || '').trim() || null,
        frequency: String(fd.get('frequency') || '').trim() || null,
        route: String(fd.get('route') || '').trim() || null,
      };
      if (!payload.name) {
        form.querySelector('input[name="name"]')?.focus();
        return;
      }
      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;
      submit.textContent = 'Saving…';
      try {
        let added;
        if (usingFixtures) {
          added = {
            id: `demo-med-${Date.now()}`,
            patient_id: activePatientId,
            ...payload,
            active: true,
          };
        } else {
          added = await api.addMedication(activePatientId, payload);
        }
        medsCache = [...medsCache, added];
        form.reset();
        _refreshMedListInPlace();
      } catch (e) {
        alert((e && e.message) || String(e));
      } finally {
        submit.disabled = false;
        submit.textContent = 'Add medication row';
      }
    });

    body.querySelector('[data-action="check-interactions"]')?.addEventListener('click', async (ev) => {
      const btn = ev.currentTarget;
      const old = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Running…';
      const names = medsCache.map((m) => m.name).filter(Boolean);
      try {
        if (usingFixtures) {
          lastInteractionResult = ANALYZER_DEMO_FIXTURES.medication.check_interactions(activePatientId, names);
        } else {
          lastInteractionResult = await api.checkInteractions(names, activePatientId);
        }
      } catch (e) {
        if (isDemoSession()) {
          lastInteractionResult = ANALYZER_DEMO_FIXTURES.medication.check_interactions(activePatientId, names);
          usingFixtures = true;
          _syncDemoBanner();
        } else {
          alert((e && e.message) || String(e));
          btn.disabled = false;
          btn.textContent = old;
          return;
        }
      }
      btn.disabled = medsCache.length < 2;
      btn.textContent = old;
      const slot = body.querySelector('[data-interaction-results]');
      if (slot) slot.innerHTML = _renderInteractionResults(lastInteractionResult, usingFixtures);
    });

    body.querySelector('#ma-refresh-analyzer')?.addEventListener('click', () => {
      loadPatient();
    });
    body.querySelector('#ma-export-irb')?.addEventListener('click', () => {
      if (!analyzerPayload) {
        alert('Medication Analyzer payload is not available for this patient yet.');
        return;
      }
      const bundle = {
        export_kind: 'medication_analyzer_irb_appendix',
        exported_at: new Date().toISOString(),
        patient_id: analyzerPayload.patient_id || activePatientId,
        audit_ref: analyzerPayload.audit_ref || null,
        schema_version: analyzerPayload.schema_version || null,
        generated_at: analyzerPayload.generated_at || null,
        regulatory_disclosures: analyzerPayload.regulatory_disclosures || null,
        provenance: analyzerPayload.provenance || null,
        snapshot: analyzerPayload.snapshot || null,
        timeline: analyzerPayload.timeline || [],
        adherence: analyzerPayload.adherence || null,
        safety_alerts: analyzerPayload.safety_alerts || [],
        confounds: analyzerPayload.confounds || [],
        recommendations: analyzerPayload.recommendations || [],
        persisted_review_notes: analyzerPayload.persisted_review_notes || [],
      };
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      const safeId = String(activePatientId || 'patient').replace(/[^a-z0-9_-]/gi, '_').slice(0, 36);
      a.href = URL.createObjectURL(blob);
      a.download = `medication-analyzer-irb-${safeId}-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    });
    body.querySelector('[data-action="save-review-note"]')?.addEventListener('click', async () => {
      const textarea = body.querySelector('textarea[name="review-note-text"]');
      const status = body.querySelector('[data-med-note-status]');
      const noteText = String(textarea?.value || '').trim();
      if (!noteText) {
        textarea?.focus();
        if (status) status.textContent = 'Enter note text.';
        return;
      }
      if (status) status.textContent = 'Saving…';
      try {
        const res = await api.medicationAnalyzerReviewNote(activePatientId, {
          note_text: noteText,
          linked_recommendation_ids: [],
        });
        analyzerPayload = res?.full_payload || analyzerPayload;
        await loadPatient();
      } catch (e) {
        if (status) status.textContent = (e && e.message) || String(e);
      }
    });
    body.querySelector('[data-action="save-timeline-event"]')?.addEventListener('click', async () => {
      const type = body.querySelector('select[name="timeline-event-type"]')?.value || 'other';
      const whenInput = body.querySelector('input[name="timeline-occurred-at"]');
      const detailInput = body.querySelector('textarea[name="timeline-detail"]');
      const status = body.querySelector('[data-med-timeline-status]');
      let occurredAt = String(whenInput?.value || '').trim();
      if (!occurredAt) {
        occurredAt = new Date().toISOString();
        if (whenInput) whenInput.value = occurredAt;
      }
      if (status) status.textContent = 'Saving…';
      try {
        const res = await api.medicationAnalyzerTimelineEvent(activePatientId, {
          event_type: type,
          occurred_at: occurredAt,
          payload: detailInput?.value?.trim() ? { detail: detailInput.value.trim() } : {},
        });
        analyzerPayload = res?.full_payload || analyzerPayload;
        await loadPatient();
      } catch (e) {
        if (status) status.textContent = (e && e.message) || String(e);
      }
    });
  }

  async function loadAnalyzerAuditStrip() {
    const body = $('ma-body');
    const slot = body?.querySelector('[data-med-audit-strip]');
    if (!slot || !activePatientId) return;
    slot.textContent = 'Loading…';
    try {
      const j = await api.medicationAnalyzerAudit(activePatientId);
      const notes = Array.isArray(j?.review_notes) ? j.review_notes : [];
      const entries = Array.isArray(j?.entries) ? j.entries : [];
      const recent = entries.slice(0, 6).map((e) => {
        const act = esc(e.action || '');
        const at = esc(e.at || '');
        return `<div style="padding:4px 0;border-bottom:1px solid var(--border)"><span style="color:var(--text-tertiary)">${at}</span> · ${act}</div>`;
      }).join('');
      slot.innerHTML = `<div style="margin-bottom:10px">${esc(String(notes.length))} saved review note(s) · ${esc(String(entries.length))} analyzer audit row(s)</div>`
        + (recent ? `<div style="max-height:160px;overflow:auto">${recent}</div>` : '');
    } catch (e) {
      slot.textContent = (e && e.message) || String(e);
    }
  }

  function render() {
    setBreadcrumb();
    if (view === 'log') loadLog();
    else loadPatient();
  }

  render();
}

export default { pgMedicationAnalyzer };
