import { api } from './api.js';

function esc(v) {
  return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export const EVIDENCE_TARGETS = {
  predictions: { target_name: 'protocol_ranking', context_type: 'recommendation', modality: 'neuromodulation', diagnosis: 'depression' },
  qeeg: { target_name: 'frontal_alpha_asymmetry', context_type: 'biomarker', modality: 'qeeg', diagnosis: 'depression' },
  mri: { target_name: 'hippocampal_atrophy', context_type: 'biomarker', modality: 'mri', diagnosis: 'mci' },
  voice: { target_name: 'voice_affect', context_type: 'multimodal_summary', modality: 'voice', diagnosis: 'depression' },
  video: { target_name: 'video_affect', context_type: 'multimodal_summary', modality: 'video', diagnosis: 'anxiety' },
  text: { target_name: 'text_sentiment', context_type: 'multimodal_summary', modality: 'text', diagnosis: 'depression' },
  depression: { target_name: 'depression_risk', context_type: 'prediction', modality: 'assessment', diagnosis: 'depression' },
  anxiety: { target_name: 'anxiety_risk', context_type: 'risk_score', modality: 'assessment', diagnosis: 'anxiety' },
};

export function EvidenceChip({
  count = 0,
  evidenceLevel = 'moderate',
  label = '',
  compact = false,
  showIcon = true,
  target = '',
  query = null,
} = {}) {
  const text = label || (count ? `${count} papers` : 'Evidence');
  const payload = query ? esc(JSON.stringify(query)) : '';
  const targetName = target || query?.target_name || '';
  return `<button type="button" class="ds-evidence-chip ds-evidence-chip--${esc(evidenceLevel)}${compact ? ' ds-evidence-chip--compact' : ''}" data-evidence-target="${esc(targetName)}" ${payload ? `data-evidence-query="${payload}"` : ''} aria-label="Open evidence for ${esc(text)}">
    ${showIcon ? '<span class="ds-evidence-chip__icon" aria-hidden="true">E</span>' : ''}
    <span>${esc(text)}</span>
    ${count ? `<span class="ds-evidence-chip__count">${esc(count)} papers</span>` : ''}
  </button>`;
}

export function createEvidenceQueryForTarget({
  patientId = 'demo-patient',
  targetName = 'depression_risk',
  contextType = 'biomarker',
  modalityFilters = [],
  diagnosisFilters = [],
  interventionFilters = [],
  phenotypeTags = [],
  featureSummary = [],
  maxResults = 8,
} = {}) {
  return {
    patient_id: patientId,
    context_type: contextType,
    target_name: targetName,
    modality_filters: modalityFilters,
    diagnosis_filters: diagnosisFilters,
    intervention_filters: interventionFilters,
    phenotype_tags: phenotypeTags,
    feature_summary: featureSummary,
    max_results: maxResults,
    include_counter_evidence: true,
  };
}

export function EvidenceStrengthBadge(type = 'review') {
  const key = String(type || 'mechanistic').toLowerCase();
  return `<span class="ds-evidence-strength ds-evidence-strength--${esc(key.replaceAll(' ', '-').replaceAll('/', ''))}" title="${esc(strengthHelp(key))}">${esc(type)}</span>`;
}

function strengthHelp(key) {
  if (key.includes('meta') || key.includes('systematic')) return 'Synthesized evidence across multiple studies.';
  if (key.includes('random')) return 'Interventional evidence with randomized design.';
  if (key.includes('cohort') || key.includes('longitudinal')) return 'Observational follow-up evidence.';
  if (key.includes('case')) return 'Small-sample or case-based evidence.';
  return 'Mechanistic, review, or indirect evidence.';
}

export function EvidencePaperList(papers = [], result = null) {
  if (!papers.length) {
    return '<div class="ds-evidence-empty">No ranked papers returned for this claim.</div>';
  }
  return `<div class="ds-evidence-paper-list">${papers.map((paper) => `
    <article class="ds-evidence-paper">
      <div class="ds-evidence-paper__top">
        <div>
          <div class="ds-evidence-paper__title">${esc(paper.title)}</div>
          <div class="ds-evidence-paper__meta">${esc([paper.journal, paper.year].filter(Boolean).join(' · '))}</div>
        </div>
        ${EvidenceStrengthBadge(paper.study_type)}
      </div>
      <p>${esc(paper.abstract_snippet || paper.relevance_note || 'No abstract snippet available.')}</p>
      <div class="ds-evidence-paper__foot">
        <span>${esc(paper.relevance_note || '')}</span>
        <span class="mono">score ${Number(paper.score_breakdown?.total || 0).toFixed(2)}</span>
        ${paper.citation_count != null ? `<span>${esc(paper.citation_count)} cites</span>` : ''}
        ${paper.url ? `<a href="${esc(paper.url)}" target="_blank" rel="noreferrer">Open</a>` : ''}
        <button type="button" data-evidence-save="${esc(paper.paper_id)}" data-evidence-save-paper="${esc(paper.paper_id)}">Save</button>
      </div>
    </article>`).join('')}</div>`;
}

export function EvidenceDriversPanel(drivers = []) {
  return `<div class="ds-evidence-drivers">${drivers.map((driver) => `
    <div class="ds-evidence-driver">
      <span class="ds-evidence-driver__source">${esc(driver.source_modality)}</span>
      <strong>${esc(driver.label)}</strong>
      <span>${esc(driver.value)}</span>
      <small>${esc(driver.contribution_text)}</small>
    </div>`).join('')}</div>`;
}

export function EvidenceApplicabilityPanel(applicability) {
  const dims = applicability?.dimensions || [];
  return `<div class="ds-evidence-applicability">
    <div class="ds-evidence-applicability__overall ds-evidence-match--${esc(applicability?.overall_match || 'partially_matched')}">
      Patient applicability: ${esc((applicability?.overall_match || 'partially matched').replaceAll('_', ' '))}
    </div>
    ${dims.map((dim) => `<div class="ds-evidence-applicability__row">
      <span>${esc(dim.label)}</span>
      <b class="ds-evidence-match--${esc(dim.match)}">${esc(dim.match.replaceAll('_', ' '))}</b>
      <small>${esc(dim.rationale)}</small>
    </div>`).join('')}
  </div>`;
}

export function EvidenceSummaryCard(summary) {
  return `<div class="ds-evidence-summary-card" data-evidence-target="${esc(summary.target_name)}">
    <div>
      <strong>${esc(summary.label || summary.target_name)}</strong>
      <p>${esc(summary.claim || '')}</p>
    </div>
    ${EvidenceChip({ count: summary.paper_count, evidenceLevel: summary.evidence_level, label: `${summary.paper_count} papers`, compact: true, target: summary.target_name })}
  </div>`;
}

export function EvidenceDrawer(result, { patientId = '' } = {}) {
  if (!result) return '';
  const papers = result.supporting_papers || [];
  const conflicting = result.conflicting_papers || [];
  return `<div class="ds-evidence-backdrop" data-evidence-close="1"></div>
    <aside class="ds-evidence-drawer" role="dialog" aria-modal="true" aria-label="Evidence details">
      <header class="ds-evidence-drawer__header">
        <div>
          <div class="ds-evidence-eyebrow">Decision support evidence</div>
          <h2>${esc(result.target_name?.replaceAll('_', ' ') || 'Evidence')}</h2>
          <p>${esc(result.claim)}</p>
        </div>
        <button type="button" class="ds-evidence-drawer__close" data-evidence-close="1">Close</button>
      </header>
      <section class="ds-evidence-drawer__body">
        <div class="ds-evidence-kpis">
          <div><span>Confidence</span><strong>${Math.round((result.confidence_score || 0) * 100)}%</strong></div>
          <div><span>Evidence strength</span><strong>${esc(result.evidence_strength)}</strong></div>
          <div><span>Papers</span><strong>${papers.length}</strong></div>
          <div><span>Conflicts</span><strong>${conflicting.length}</strong></div>
        </div>
        <div class="ds-evidence-section"><h3>Patient context / phenotype tags</h3><p>${esc(result.patient_context_summary)}</p></div>
        <div class="ds-evidence-section"><h3>Top drivers</h3>${EvidenceDriversPanel(result.top_drivers || [])}</div>
        <div class="ds-evidence-section"><h3>Literature summary</h3><p>${esc(result.literature_summary)}</p></div>
        <div class="ds-evidence-section"><h3>Top papers</h3>${EvidencePaperList(papers, result)}</div>
        <div class="ds-evidence-section"><h3>Applicability to this patient</h3>${EvidenceApplicabilityPanel(result.applicability)}</div>
        <div class="ds-evidence-section"><h3>Counter-evidence / conflicting evidence</h3>${conflicting.length ? EvidencePaperList(conflicting, result) : '<p>No explicit counter-evidence was retrieved in the top-ranked set.</p>'}</div>
        <div class="ds-evidence-section"><h3>Recommended review / next step</h3><p>${esc(result.recommended_caution)}</p></div>
      </section>
      <footer class="ds-evidence-drawer__footer">
        <button type="button" class="btn btn-primary btn-sm" data-evidence-add-report="1">Add to report</button>
        <button type="button" class="btn btn-sm" data-evidence-full-tab="${esc(patientId)}">Open full evidence tab</button>
      </footer>
    </aside>`;
}

export function PatientEvidenceTab(overview, filter = {}) {
  if (overview && overview.patientId && !overview.highlights && !overview.by_score) {
    overview = { patient_id: overview.patientId, highlights: [], by_score: [], by_protocol: [], by_modality: {}, saved_citations: [] };
  }
  const all = [
    ...(overview?.highlights || []),
    ...(overview?.by_score || []),
    ...(overview?.by_protocol || []),
    ...Object.values(overview?.by_modality || {}).flat(),
  ];
  const seen = new Set();
  const unique = filterEvidenceSummaries(all.filter((item) => {
    if (!item || seen.has(item.finding_id)) return false;
    seen.add(item.finding_id);
    return true;
  }), filter);
  const saved = overview?.saved_citations || [];
  return `<div class="ds-evidence-tab">
    <div class="ds-evidence-tab__hero">
      <div><div class="ds-evidence-eyebrow">Patient 360 Evidence</div><h2>Evidence workspace</h2><p>Aggregates evidence linked to biomarkers, scores, longitudinal changes, recommendations, and saved report citations.</p></div>
      <input class="ds-evidence-search" data-evidence-search placeholder="Search title, abstract, entity, concept" value="${esc(filter.search || '')}" />
    </div>
    <div class="ds-evidence-tab__sections">
      ${['All evidence','Biomarkers','Risk scores','Protocol recommendations','Longitudinal changes','Conflicting evidence','Saved citations'].map((label) => `<span>${esc(label)}</span>`).join('')}
    </div>
    <div class="ds-evidence-tab__grid">
      <section><h3>Highlights</h3>${unique.map(EvidenceSummaryCard).join('') || '<div class="ds-evidence-empty">No evidence summaries yet.</div>'}</section>
      <section><h3>Compare with literature phenotype</h3><p>${esc(overview?.compare_with_literature_phenotype?.summary || 'No phenotype comparison available.')}</p><div class="ds-evidence-tags">${(overview?.compare_with_literature_phenotype?.matched_tags || []).map((t) => `<span>${esc(t)}</span>`).join('')}</div></section>
      <section><h3>Evidence used in report</h3>${(overview?.evidence_used_in_report || []).map((c) => `<div class="ds-evidence-citation">${esc(c.inline_citation)} ${esc(c.title)}</div>`).join('') || '<div class="ds-evidence-empty">No report citations staged.</div>'}</section>
      <section><h3>Saved evidence</h3>${saved.map((s) => `<div class="ds-evidence-citation"><strong>${esc(s.finding_label)}</strong><br>${esc(s.paper_title)}</div>`).join('') || '<div class="ds-evidence-empty">No saved citations.</div>'}</section>
    </div>
  </div>`;
}

export async function openEvidenceDrawer({ patientId, target, featureSummary = [], query = null, ...rest } = {}) {
  const directQuery = query || (rest.target_name ? { patient_id: patientId, target_name: rest.target_name, ...rest } : null);
  const spec = EVIDENCE_TARGETS[target] || EVIDENCE_TARGETS[target?.replaceAll?.('_', '-')] || { target_name: target || directQuery?.target_name || 'depression_risk', context_type: 'biomarker' };
  const host = ensureEvidenceHost();
  host.innerHTML = '<div class="ds-evidence-backdrop" data-evidence-close="1"></div><aside class="ds-evidence-drawer"><div class="ds-evidence-loading">Loading evidence...</div></aside>';
  host.classList?.add?.('is-open');
  try {
    const queryFn = api.queryEvidence || api.evidenceQuery;
    const result = await queryFn(directQuery || {
      patient_id: patientId || 'demo-patient',
      context_type: spec.context_type || 'biomarker',
      target_name: spec.target_name || target,
      modality_filters: spec.modality ? [spec.modality] : [],
      diagnosis_filters: spec.diagnosis ? [spec.diagnosis] : [],
      intervention_filters: spec.intervention ? [spec.intervention] : [],
      phenotype_tags: [spec.diagnosis, spec.modality].filter(Boolean),
      feature_summary: featureSummary,
      max_results: 8,
      include_counter_evidence: true,
    });
    host.innerHTML = EvidenceDrawer(result, { patientId });
    wireDrawer(host, result, patientId);
  } catch (err) {
    host.innerHTML = `<div class="ds-evidence-backdrop" data-evidence-close="1"></div><aside class="ds-evidence-drawer"><div class="ds-evidence-error">Could not load evidence: ${esc(err.message || err)}</div></aside>`;
    wireDrawer(host, null, patientId);
  }
}

export function initEvidenceDrawer({ patientId = '', onOpenFullTab = null } = {}) {
  const host = ensureEvidenceHost();
  host.dataset = host.dataset || {};
  host.dataset.patientId = patientId;
  if (onOpenFullTab) {
    window.__dsEvidenceOpenFullTab = onOpenFullTab;
  }
  return host;
}

export async function renderPatientEvidenceWorkspace(patientId, host, filter = {}) {
  if (!host) return;
  host.innerHTML = '<div class="ds-evidence-loading">Loading patient evidence...</div>';
  try {
    const overviewFn = api.getPatientEvidenceOverview || api.evidencePatientOverview;
    const overview = await overviewFn(patientId);
    host.innerHTML = PatientEvidenceTab(overview, filter);
    host.querySelectorAll('[data-evidence-target]').forEach((node) => {
      node.addEventListener('click', () => openEvidenceDrawer({ patientId, target: node.getAttribute('data-evidence-target') }));
    });
    const search = host.querySelector('[data-evidence-search]');
    if (search) {
      search.addEventListener('input', () => {
        window.clearTimeout(search._evidenceTimer);
        search._evidenceTimer = window.setTimeout(() => {
          host.innerHTML = PatientEvidenceTab(overview, { search: search.value });
          host.querySelectorAll('[data-evidence-target]').forEach((node) => {
            node.addEventListener('click', () => openEvidenceDrawer({ patientId, target: node.getAttribute('data-evidence-target') }));
          });
        }, 120);
      });
    }
  } catch (err) {
    host.innerHTML = `<div class="ds-evidence-error">Could not load patient evidence: ${esc(err.message || err)}</div>`;
  }
}

export function wireEvidenceChips(root, patientId) {
  if (!root || typeof root.querySelectorAll !== 'function') return;
  const options = typeof patientId === 'object' && patientId !== null ? patientId : null;
  root.querySelectorAll('[data-evidence-target]').forEach((node) => {
    node.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      let parsed = null;
      const raw = node.getAttribute('data-evidence-query');
      if (raw) {
        try { parsed = JSON.parse(raw); } catch {}
      }
      if (options?.onOpen) {
        options.onOpen(parsed || { target: node.getAttribute('data-evidence-target') });
      } else {
        openEvidenceDrawer(parsed || { patientId, target: node.getAttribute('data-evidence-target') });
      }
    });
  });
}

export function filterEvidenceSummaries(rows = [], filter = {}) {
  const q = String(filter.search || '').toLowerCase();
  const modality = String(filter.modality || '').toLowerCase();
  return rows.filter((item) => {
    if (!item) return false;
    const haystack = `${item.label || ''} ${item.claim || ''} ${item.target_name || ''} ${item.context_type || ''}`.toLowerCase();
    if (q && !haystack.includes(q)) return false;
    if (modality) {
      if (modality === 'score' && !['prediction', 'risk_score'].includes(item.context_type)) return false;
      if (modality !== 'score' && !haystack.includes(modality)) return false;
    }
    return true;
  });
}

function ensureEvidenceHost() {
  let host = document.getElementById('ds-evidence-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'ds-evidence-host';
    host.className = 'ds-evidence-host';
    document.body.appendChild(host);
  }
  return host;
}

function wireDrawer(host, result, patientId) {
  host.querySelectorAll('[data-evidence-close]').forEach((node) => node.addEventListener('click', () => {
    host.classList?.remove?.('is-open');
    host.innerHTML = '';
  }));
  host.querySelectorAll('[data-evidence-save]').forEach((node) => node.addEventListener('click', async () => {
    const paper = (result?.supporting_papers || []).find((p) => p.paper_id === node.getAttribute('data-evidence-save'));
    if (!paper || !result) return;
    const citation = (result.export_citations || []).find((c) => c.paper_id === paper.paper_id) || {};
    await api.saveEvidenceCitation({
      patient_id: patientId || result.patient_id || 'demo-patient',
      finding_id: result.finding_id,
      finding_label: result.target_name,
      claim: result.claim,
      paper_id: paper.paper_id,
      paper_title: paper.title,
      pmid: paper.pmid,
      doi: paper.doi,
      citation_payload: citation,
    });
    node.textContent = 'Saved';
    node.disabled = true;
  }));
  host.querySelectorAll('[data-evidence-full-tab]').forEach((node) => node.addEventListener('click', () => {
    if (typeof window.__dsEvidenceOpenFullTab === 'function') {
      window.__dsEvidenceOpenFullTab();
      return;
    }
    window._paEvidenceTab = true;
    window._paPatientId = node.getAttribute('data-evidence-full-tab') || patientId;
    window._nav?.('patient-analytics');
  }));
  host.querySelectorAll('[data-evidence-add-report]').forEach((node) => node.addEventListener('click', () => {
    window._dsToast?.({ title: 'Evidence staged', body: 'Citation payload is ready for report export.', severity: 'success' });
  }));
}
