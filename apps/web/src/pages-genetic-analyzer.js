/**
 * pages-genetic-analyzer.js — DeepSynaps Genetic Medication Analyzer
 * Pharmacogenomics dashboard for clinician-reviewed genetic decision-support.
 *
 * Does NOT: prescribe, dose-adjust, start/stop/switch meds, or provide final DDI authority.
 * All findings are decision-support context requiring clinician/pharmacist review.
 *
 * Modules:
 *   - Dashboard: KPIs, metabolizer distribution, drug interaction severity, gene coverage
 *   - Genetic Profiles: search/filter, upload VCF, manual genotype entry
 *   - Profile Detail: variants, metabolizer status, drug interactions, side effects,
 *                     neuromodulation genetics, nutrition genetics, reports, audit
 *   - Metabolizer Panel: CYP450 gene cards with activity scores and CPIC recommendations
 *   - Drug Interactions: medication x gene matrix with evidence grades
 *   - Neuromodulation Genetics: BDNF, COMT, GRIK4 response indicators
 *   - Nutrition Genetics: MTHFR, methylation, B12/folate recommendations
 *   - Reports: generation form, preview, download with safety disclaimers
 *
 * Safety: decision-support only language, evidence grades on all findings,
 *         clinician-only access gate, safety banner on every view.
 */

import { api } from './api.js';
import { evidenceBadge } from './helpers.js';

// ── CSS custom properties for pharmacogenomic color coding ─────────────────
const PGX_CSS_VARS = `
<style>
.pgx-root {
  --pgx-normal: #22c55e;
  --pgx-moderate: #f59e0b;
  --pgx-significant: #ef4444;
  --pgx-unknown: #94a3b8;
  --pgx-research: #3b82f6;
  --pgx-normal-bg: rgba(34,197,94,0.10);
  --pgx-moderate-bg: rgba(245,158,11,0.10);
  --pgx-significant-bg: rgba(239,68,68,0.10);
  --pgx-unknown-bg: rgba(148,163,184,0.10);
  --pgx-research-bg: rgba(59,130,246,0.10);
}
.pgx-safety-banner {
  padding: 12px 14px;
  border-radius: 8px;
  background: rgba(245,158,11,0.08);
  border: 1px solid rgba(245,158,11,0.30);
  font-size: 12px;
  line-height: 1.55;
  color: var(--text-secondary);
  margin-bottom: 16px;
}
.pgx-gene-card {
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--bg-card);
  padding: 14px 16px;
  transition: box-shadow 0.15s;
}
.pgx-gene-card:hover {
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
}
.pgx-phenotype-normal { border-left: 3px solid var(--pgx-normal); }
.pgx-phenotype-moderate { border-left: 3px solid var(--pgx-moderate); }
.pgx-phenotype-significant { border-left: 3px solid var(--pgx-significant); }
.pgx-phenotype-unknown { border-left: 3px solid var(--pgx-unknown); }
.pgx-phenotype-research { border-left: 3px solid var(--pgx-research); }
.pgx-severity-dot {
  width: 10px; height: 10px; border-radius: 50%; display: inline-block; flex-shrink: 0;
}
.pgx-severity-normal { background: var(--pgx-normal); }
.pgx-severity-moderate { background: var(--pgx-moderate); }
.pgx-severity-significant { background: var(--pgx-significant); }
.pgx-severity-unknown { background: var(--pgx-unknown); }
.pgx-severity-research { background: var(--pgx-research); }
.pgx-interaction-row-normal { background: rgba(34,197,94,0.04); }
.pgx-interaction-row-moderate { background: rgba(245,158,11,0.04); }
.pgx-interaction-row-significant { background: rgba(239,68,68,0.04); }
.pgx-activity-bar {
  height: 8px;
  border-radius: 4px;
  background: var(--bg-tertiary);
  overflow: hidden;
}
.pgx-activity-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.3s ease;
}
.pgx-tab-bar {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.pgx-tab {
  padding: 8px 14px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-tertiary);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: color 0.15s;
  white-space: nowrap;
}
.pgx-tab:hover { color: var(--text-primary); }
.pgx-tab.active {
  color: var(--blue);
  border-bottom-color: var(--blue);
}
.pgx-metabolizer-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}
.pgx-evidence-grade {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 4px;
  font-family: var(--font-mono);
}
.pgx-tooltip {
  position: relative;
  cursor: help;
}
.pgx-fda-badge {
  font-size: 9px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 3px;
  background: rgba(59,130,246,0.12);
  color: var(--blue);
}
.pgx-cpic-badge {
  font-size: 9px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 3px;
  background: rgba(139,92,246,0.12);
  color: #8b5cf6;
}
.pgx-research-badge {
  font-size: 9px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 3px;
  background: var(--pgx-research-bg);
  color: var(--pgx-research);
}
.pgx-ascii-diagram {
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.7;
  color: var(--text-secondary);
  background: var(--bg-tertiary);
  padding: 14px;
  border-radius: 8px;
  white-space: pre;
  overflow-x: auto;
}
</style>`;

// ── Clinician-only roles ───────────────────────────────────────────────────
const _GENETIC_ANALYZER_CLINICAL_ROLES = new Set([
  'clinician', 'admin', 'supervisor',
]);

// ── Safe wording templates (no prescribing language) ───────────────────────
const _SAFE_WORDING = {
  mayConsider: 'Clinician may consider reviewing',
  supportiveContext: 'This finding provides supportive context only',
  notPrescribing: 'This platform does not prescribe, dose-adjust, or recommend specific medications',
  consultPharmacist: 'Consult a pharmacist or genetics counsellor for interpretation',
  evidenceBased: 'Evidence-based pharmacogenomic annotation',
  decisionSupport: 'Decision support only — requires clinician review',
};

// ── Evidence grade helpers ─────────────────────────────────────────────────
function _pgxEvidenceBadge(grade) {
  return evidenceBadge(grade);
}

// ── HTML escape ────────────────────────────────────────────────────────────
function esc(v) {
  if (v == null) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// ── Format helpers ─────────────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtDateOnly(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Safety banner (appears on every view) ──────────────────────────────────
function _safetyBanner() {
  return `<div class="pgx-safety-banner" data-test="safety-banner">
    <strong>Decision support only.</strong> Pharmacogenomic findings are supportive
    context only and require clinician/pharmacist review. This platform does not
    prescribe, dose-adjust, or autonomously recommend medications.
  </div>`;
}

// ── KPI card helper ────────────────────────────────────────────────────────
function _kpiCard(label, value, opts = {}) {
  const { subtitle = '', color = 'var(--text-primary)', testId = '' } = opts;
  const testAttr = testId ? ` data-test="${esc(testId)}"` : '';
  return `<div class="ch-card"${testAttr} style="padding:14px 16px;display:flex;flex-direction:column;gap:4px;min-width:140px;flex:1">
    <div style="font-size:10.5px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.6px">${esc(label)}</div>
    <div style="font-size:22px;font-weight:700;color:${esc(color)};font-variant-numeric:tabular-nums">${esc(String(value))}</div>
    ${subtitle ? `<div style="font-size:11px;color:var(--text-tertiary)">${esc(subtitle)}</div>` : ''}
  </div>`;
}

// ── Phenotype badge helpers ────────────────────────────────────────────────
function _phenotypeBadge(phenotype) {
  const p = String(phenotype || '').toLowerCase();
  if (p.includes('normal') || p.includes('extensive') || p.includes('rapid')) {
    return `<span class="pgx-phenotype-normal" style="display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;padding:4px 10px;border-radius:6px;background:var(--pgx-normal-bg);color:var(--pgx-normal);white-space:nowrap">
      <span class="pgx-severity-dot pgx-severity-normal"></span>${esc(phenotype)}</span>`;
  }
  if (p.includes('intermediate')) {
    return `<span class="pgx-phenotype-moderate" style="display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;padding:4px 10px;border-radius:6px;background:var(--pgx-moderate-bg);color:var(--pgx-moderate);white-space:nowrap">
      <span class="pgx-severity-dot pgx-severity-moderate"></span>${esc(phenotype)}</span>`;
  }
  if (p.includes('poor') || p.includes('ultrarapid')) {
    return `<span class="pgx-phenotype-significant" style="display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;padding:4px 10px;border-radius:6px;background:var(--pgx-significant-bg);color:var(--pgx-significant);white-space:nowrap">
      <span class="pgx-severity-dot pgx-severity-significant"></span>${esc(phenotype)}</span>`;
  }
  return `<span class="pgx-phenotype-unknown" style="display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;padding:4px 10px;border-radius:6px;background:var(--pgx-unknown-bg);color:var(--pgx-unknown);white-space:nowrap">
    <span class="pgx-severity-dot pgx-severity-unknown"></span>${esc(phenotype || 'Unknown')}</span>`;
}

// ── Severity pill for drug interactions ────────────────────────────────────
function _severityPill(severity) {
  const s = String(severity || '').toLowerCase();
  if (s === 'significant' || s === 'severe' || s === 'major') {
    return `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;padding:3px 8px;border-radius:5px;background:var(--pgx-significant-bg);color:var(--pgx-significant);border:1px solid rgba(239,68,68,0.25);white-space:nowrap">
      <span class="pgx-severity-dot pgx-severity-significant"></span>Significant</span>`;
  }
  if (s === 'moderate') {
    return `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;padding:3px 8px;border-radius:5px;background:var(--pgx-moderate-bg);color:var(--pgx-moderate);border:1px solid rgba(245,158,11,0.25);white-space:nowrap">
      <span class="pgx-severity-dot pgx-severity-moderate"></span>Moderate</span>`;
  }
  if (s === 'normal' || s === 'standard' || s === 'minor') {
    return `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;padding:3px 8px;border-radius:5px;background:var(--pgx-normal-bg);color:var(--pgx-normal);border:1px solid rgba(34,197,94,0.25);white-space:nowrap">
      <span class="pgx-severity-dot pgx-severity-normal"></span>Standard</span>`;
  }
  return `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;padding:3px 8px;border-radius:5px;background:var(--pgx-unknown-bg);color:var(--pgx-unknown);border:1px solid rgba(148,163,184,0.25);white-space:nowrap">
    <span class="pgx-severity-dot pgx-severity-unknown"></span>Unknown</span>`;
}

// ── Clinical action pill ───────────────────────────────────────────────────
function _clinicalActionPill(action) {
  const a = String(action || '').toLowerCase();
  if (a.includes('review') || a.includes('consider')) {
    return `<span style="font-size:11px;font-weight:600;padding:3px 8px;border-radius:5px;background:rgba(59,130,246,0.10);color:var(--blue);border:1px solid rgba(59,130,246,0.20)">${esc(action)}</span>`;
  }
  if (a.includes('monitor')) {
    return `<span style="font-size:11px;font-weight:600;padding:3px 8px;border-radius:5px;background:rgba(139,92,246,0.10);color:#8b5cf6;border:1px solid rgba(139,92,246,0.20)">${esc(action)}</span>`;
  }
  if (a.includes('avoid') || a.includes('contraindicated')) {
    return `<span style="font-size:11px;font-weight:600;padding:3px 8px;border-radius:5px;background:var(--pgx-significant-bg);color:var(--pgx-significant);border:1px solid rgba(239,68,68,0.20)">${esc(action)}</span>`;
  }
  return `<span style="font-size:11px;font-weight:600;padding:3px 8px;border-radius:5px;background:var(--pgx-normal-bg);color:var(--pgx-normal);border:1px solid rgba(34,197,94,0.20)">${esc(action || 'Standard use')}</span>`;
}

// ── Status badge ───────────────────────────────────────────────────────────
function _statusBadge(status) {
  const s = String(status || '').toLowerCase();
  const colors = {
    active: ['rgba(34,197,94,0.12)', 'var(--pgx-normal)'],
    pending: ['rgba(245,158,11,0.12)', 'var(--pgx-moderate)'],
    complete: ['rgba(59,130,246,0.12)', 'var(--blue)'],
    failed: ['rgba(239,68,68,0.12)', 'var(--pgx-significant)'],
    archived: ['rgba(148,163,184,0.12)', 'var(--pgx-unknown)'],
    processing: ['rgba(139,92,246,0.12)', '#8b5cf6'],
  };
  const [bg, fg] = colors[s] || colors.pending;
  return `<span style="background:${bg};color:${fg};font-size:11px;font-weight:600;padding:3px 9px;border-radius:5px;text-transform:capitalize;white-space:nowrap">${esc(status || '—')}</span>`;
}

// ── Navigation sidebar for genetic analyzer ────────────────────────────────
function _geneticNav(activeRoute) {
  const items = [
    { route: '/genetic-analyzer/dashboard', label: 'Dashboard', icon: '◈' },
    { route: '/genetic-analyzer/profiles', label: 'Profiles', icon: '⚬' },
    { route: '/genetic-analyzer/metabolizer', label: 'Metabolizer', icon: '◇' },
    { route: '/genetic-analyzer/drug-interactions', label: 'Drug–Gene', icon: '▹' },
    { route: '/genetic-analyzer/neuromodulation', label: 'Neuromod', icon: '⌇' },
    { route: '/genetic-analyzer/nutrition', label: 'Nutrition', icon: '○' },
    { route: '/genetic-analyzer/reports', label: 'Reports', icon: '⧉' },
  ];
  return `<div style="display:flex;gap:4px;margin-bottom:20px;flex-wrap:wrap">
    ${items.map(it => {
      const isActive = activeRoute === it.route || (it.route === '/genetic-analyzer/dashboard' && activeRoute === '/genetic-analyzer');
      const bg = isActive ? 'var(--blue)' : 'var(--bg-card)';
      const fg = isActive ? '#fff' : 'var(--text-secondary)';
      const border = isActive ? 'var(--blue)' : 'var(--border)';
      return `<a href="${esc(it.route)}" style="display:inline-flex;align-items:center;gap:6px;padding:7px 13px;border-radius:7px;background:${bg};color:${fg};font-size:12.5px;font-weight:600;text-decoration:none;border:1px solid ${border};white-space:nowrap" data-test="nav-${esc(it.label.toLowerCase())}">
        <span style="font-size:10px">${esc(it.icon)}</span> ${esc(it.label)}
      </a>`;
    }).join('')}
  </div>`;
}

// ── Cross-page integration links ───────────────────────────────────────────
function _crossPageLinks() {
  return `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:20px;padding-top:16px;border-top:1px solid var(--border)">
    <span style="font-size:11px;color:var(--text-tertiary);font-weight:600;align-self:center">Related:</span>
    <a href="/medication-analyzer" style="font-size:11px;color:var(--blue);text-decoration:none;font-weight:500">Medication Analyzer</a>
    <a href="/biomarkers" style="font-size:11px;color:var(--blue);text-decoration:none;font-weight:500">Biomarkers</a>
    <a href="/brainmap" style="font-size:11px;color:var(--blue);text-decoration:none;font-weight:500">qEEG / Brainmap</a>
    <a href="/biomarkers/mri" style="font-size:11px;color:var(--blue);text-decoration:none;font-weight:500">MRI Analysis</a>
  </div>`;
}

// ── Demo fixture data for genetic analyzer ─────────────────────────────────
function _demoGeneticProfiles() {
  return [
    { id: 'pgp-001', patientName: 'Demo Patient A', patientId: 'demo-pt-samantha-li', profileName: 'PsychPGx Panel v2', source: 'VCF', geneCount: 18, genesTested: ['CYP2D6','CYP2C19','CYP2C9','CYP3A4','CYP3A5','CYP1A2','SLCO1B1','ABCB1','HLA-B','HLA-A','TPMT','DPYD','UGT1A1','VKORC1','CYP4F2','BDNF','COMT','GRIK4'], status: 'complete', createdAt: '2025-05-10T09:23:00Z', variants: 24, metabolizers: { CYP2D6: 'Normal', CYP2C19: 'Intermediate', CYP2C9: 'Normal', CYP3A4: 'Normal', CYP3A5: 'Poor', CYP1A2: 'Intermediate' }, interactions: 3 },
    { id: 'pgp-002', patientName: 'Demo Patient B', patientId: 'demo-pt-marcus-chen', profileName: 'NeuroPGx Extended', source: 'VCF', geneCount: 22, genesTested: ['CYP2D6','CYP2C19','CYP2C9','CYP3A4','CYP3A5','CYP1A2','SLCO1B1','ABCB1','HLA-B','HLA-A','TPMT','DPYD','UGT1A1','VKORC1','CYP4F2','BDNF','COMT','GRIK4','MTHFR','FTO','DRD2','SLC6A4'], status: 'complete', createdAt: '2025-05-12T14:45:00Z', variants: 31, metabolizers: { CYP2D6: 'Poor', CYP2C19: 'Normal', CYP2C9: 'Intermediate', CYP3A4: 'Normal', CYP3A5: 'Poor', CYP1A2: 'Normal' }, interactions: 5 },
    { id: 'pgp-003', patientName: 'Demo Patient C', patientId: 'demo-pt-elena-vasquez', profileName: 'MTHFR + CYP Panel', source: 'Manual', geneCount: 6, genesTested: ['MTHFR','CYP2D6','CYP2C19','COMT','BDNF','SLC6A4'], status: 'complete', createdAt: '2025-05-14T11:30:00Z', variants: 8, metabolizers: { CYP2D6: 'Intermediate', CYP2C19: 'Normal' }, interactions: 1 },
    { id: 'pgp-004', patientName: 'Demo Patient D', patientId: 'demo-pt-omar-haddad', profileName: 'CardioPGx Screen', source: 'VCF', geneCount: 12, genesTested: ['CYP2C19','CYP2C9','CYP3A4','CYP3A5','VKORC1','CYP4F2','SLCO1B1','ABCB1','F2','F5','ITGB3','CES1'], status: 'pending', createdAt: '2025-06-18T08:00:00Z', variants: 0, metabolizers: {}, interactions: 0 },
    { id: 'pgp-005', patientName: 'Demo Patient E', patientId: 'demo-pt-amelia-brown', profileName: 'PsychPGx Panel v2', source: 'VCF', geneCount: 18, genesTested: ['CYP2D6','CYP2C19','CYP2C9','CYP3A4','CYP3A5','CYP1A2','SLCO1B1','ABCB1','HLA-B','HLA-A','TPMT','DPYD','UGT1A1','VKORC1','CYP4F2','BDNF','COMT','GRIK4'], status: 'processing', createdAt: '2025-06-19T16:20:00Z', variants: 0, metabolizers: {}, interactions: 0 },
  ];
}

function _demoMetabolizerData() {
  return {
    CYP2D6: { gene: 'CYP2D6', phenotype: 'Poor Metabolizer', activityScore: 0, diplotype: '*4/*4', affectedDrugs: ['Paroxetine','Fluoxetine','Venlafaxine','Tramadol','Codeine','Atomoxetine'], cpicRecommendation: 'Consider alternative not predominantly metabolized by CYP2D6. Avoid codeine and tramadol due to lack of efficacy.', fdaLabel: true, evidenceGrade: 'A' },
    CYP2C19: { gene: 'CYP2C19', phenotype: 'Intermediate Metabolizer', activityScore: 1, diplotype: '*1/*2', affectedDrugs: ['Citalopram','Escitalopram','Sertraline','Omeprazole','Clopidogrel','Diazepam'], cpicRecommendation: 'Initiate with standard dose. Monitor response. Consider alternative if poor response.', fdaLabel: true, evidenceGrade: 'A' },
    CYP2C9: { gene: 'CYP2C9', phenotype: 'Normal Metabolizer', activityScore: 2, diplotype: '*1/*1', affectedDrugs: ['Warfarin','Phenytoin','Losartan','Celecoxib'], cpicRecommendation: 'Standard dosing per guidelines.', fdaLabel: true, evidenceGrade: 'A' },
    CYP3A4: { gene: 'CYP3A4', phenotype: 'Normal Metabolizer', activityScore: 2, diplotype: '*1/*1', affectedDrugs: ['Alprazolam','Midazolam','Simvastatin','Atorvastatin'], cpicRecommendation: 'Standard dosing per guidelines.', fdaLabel: false, evidenceGrade: 'B' },
    CYP3A5: { gene: 'CYP3A5', phenotype: 'Poor Metabolizer', activityScore: 0, diplotype: '*3/*3', affectedDrugs: ['Tacrolimus','Cyclosporine'], cpicRecommendation: 'Requires higher tacrolimus dose. Monitor levels.', fdaLabel: true, evidenceGrade: 'A' },
    CYP1A2: { gene: 'CYP1A2', phenotype: 'Intermediate Metabolizer', activityScore: 1, diplotype: '*1F/*1A', affectedDrugs: ['Caffeine','Clozapine','Olanzapine','Tacrine'], cpicRecommendation: 'Monitor clozapine levels if applicable.', fdaLabel: false, evidenceGrade: 'C' },
    SLCO1B1: { gene: 'SLCO1B1', phenotype: 'Normal Function', activityScore: 2, diplotype: '*1A/*1A', affectedDrugs: ['Simvastatin','Atorvastatin','Pravastatin'], cpicRecommendation: 'Standard dosing per guidelines.', fdaLabel: true, evidenceGrade: 'A' },
    TPMT: { gene: 'TPMT', phenotype: 'Normal Metabolizer', activityScore: 2, diplotype: '*1/*1', affectedDrugs: ['Azathioprine','6-Mercaptopurine','Thioguanine'], cpicRecommendation: 'Standard dosing per guidelines.', fdaLabel: true, evidenceGrade: 'A' },
    DPYD: { gene: 'DPYD', phenotype: 'Normal Metabolizer', activityScore: 2, diplotype: '*1/*1', affectedDrugs: ['5-Fluorouracil','Capecitabine','Tegafur'], cpicRecommendation: 'Standard dosing per guidelines.', fdaLabel: true, evidenceGrade: 'A' },
  };
}

function _demoDrugInteractions() {
  return [
    { drug: 'Paroxetine', drugClass: 'SSRI', gene: 'CYP2D6', interactionType: 'Substrate — impaired metabolism', severity: 'significant', evidence: 'A', clinicalAction: 'Clinician may consider alternative', fdaLabel: true, cpicGuideline: true, detail: 'Poor CYP2D6 metabolizers have substantially higher paroxetine plasma levels. Increased risk of ADRs. Evidence supports considering alternatives not predominantly metabolized by CYP2D6.' },
    { drug: 'Venlafaxine', drugClass: 'SNRI', gene: 'CYP2D6', interactionType: 'Substrate — impaired metabolism', severity: 'moderate', evidence: 'A', clinicalAction: 'Monitor response', fdaLabel: true, cpicGuideline: true, detail: 'Poor metabolizers show higher active metabolite ratio. Monitor clinical response and tolerability.' },
    { drug: 'Citalopram', drugClass: 'SSRI', gene: 'CYP2C19', interactionType: 'Substrate — reduced metabolism', severity: 'moderate', evidence: 'A', clinicalAction: 'Monitor response', fdaLabel: true, cpicGuideline: true, detail: 'Intermediate CYP2C19 metabolizers have moderately increased citalopram exposure. Monitor for QT prolongation risk.' },
    { drug: 'Warfarin', drugClass: 'Anticoagulant', gene: 'CYP2C9', interactionType: 'Substrate + VKORC1', severity: 'significant', evidence: 'A', clinicalAction: 'Clinician may consider genotype-guided dosing', fdaLabel: true, cpicGuideline: true, detail: 'CYP2C9*2/*3 variants reduce warfarin clearance. Combined with VKORC1 variants, dosing algorithms are available.' },
    { drug: 'Clopidogrel', drugClass: 'Antiplatelet', gene: 'CYP2C19', interactionType: 'Prodrug activation reduced', severity: 'significant', evidence: 'A', clinicalAction: 'Clinician may consider alternative antiplatelet', fdaLabel: true, cpicGuideline: true, detail: 'Intermediate metabolizers have reduced active metabolite formation. Consider prasugrel or ticagrelor per guidelines.' },
    { drug: 'Sertraline', drugClass: 'SSRI', gene: 'CYP2C19', interactionType: 'Substrate — reduced metabolism', severity: 'moderate', evidence: 'B', clinicalAction: 'Monitor response', fdaLabel: false, cpicGuideline: true, detail: 'CYP2C19 intermediate status may increase sertraline exposure. Monitor clinical response.' },
    { drug: 'Codeine', drugClass: 'Analgesic', gene: 'CYP2D6', interactionType: 'Prodrug — no activation', severity: 'significant', evidence: 'A', clinicalAction: 'Avoid use', fdaLabel: true, cpicGuideline: true, detail: 'Poor metabolizers cannot convert codeine to morphine. No analgesic effect. Avoid use — consider alternative analgesic.' },
    { drug: 'Atomoxetine', drugClass: 'ADHD', gene: 'CYP2D6', interactionType: 'Substrate — impaired metabolism', severity: 'moderate', evidence: 'A', clinicalAction: 'Monitor or consider dose adjustment', fdaLabel: true, cpicGuideline: true, detail: 'Poor metabolizers have 10x higher AUC. Monitor for increased adverse effects.' },
    { drug: 'Simvastatin', drugClass: 'Statin', gene: 'SLCO1B1', interactionType: 'Transporter reduced', severity: 'moderate', evidence: 'A', clinicalAction: 'Consider lower dose or alternative statin', fdaLabel: true, cpicGuideline: true, detail: 'Reduced SLCO1B1 function increases myopathy risk. Consider pravastatin or rosuvastatin.' },
    { drug: 'Clozapine', drugClass: 'Antipsychotic', gene: 'CYP1A2', interactionType: 'Substrate — reduced metabolism', severity: 'moderate', evidence: 'C', clinicalAction: 'Monitor levels if applicable', fdaLabel: false, cpicGuideline: false, detail: 'Intermediate CYP1A2 metabolizers may have higher clozapine levels. Smoking status also affects CYP1A2 activity.' },
    { drug: 'Tacrolimus', drugClass: 'Immunosuppressant', gene: 'CYP3A5', interactionType: 'Substrate — impaired metabolism', severity: 'significant', evidence: 'A', clinicalAction: 'Clinician may consider higher initial dose', fdaLabel: true, cpicGuideline: true, detail: 'CYP3A5 poor metabolizers require higher doses to achieve therapeutic levels. TDM strongly recommended.' },
    { drug: 'Fluoxetine', drugClass: 'SSRI', gene: 'CYP2D6', interactionType: 'Substrate + inhibitor', severity: 'significant', evidence: 'A', clinicalAction: 'Clinician may consider alternative', fdaLabel: true, cpicGuideline: true, detail: 'Poor metabolizers have markedly increased fluoxetine levels. Also inhibits CYP2D6 — potential DDI.' },
  ];
}

function _demoVariants() {
  return [
    { gene: 'CYP2D6', variant: '*1/*4', genotype: 'Heterozygous', rsId: 'rs3892097', confidence: 'High', phenotype: 'Poor Metabolizer', consequence: 'Reduced enzyme function' },
    { gene: 'CYP2C19', variant: '*1/*2', genotype: 'Heterozygous', rsId: 'rs4244285', confidence: 'High', phenotype: 'Intermediate Metabolizer', consequence: 'Reduced enzyme function' },
    { gene: 'CYP2C9', variant: '*1/*1', genotype: 'Wild type', rsId: 'rs1799853', confidence: 'High', phenotype: 'Normal Metabolizer', consequence: 'Normal enzyme function' },
    { gene: 'CYP3A4', variant: '*1/*1', genotype: 'Wild type', rsId: 'rs35599367', confidence: 'High', phenotype: 'Normal Metabolizer', consequence: 'Normal enzyme function' },
    { gene: 'CYP3A5', variant: '*3/*3', genotype: 'Homozygous variant', rsId: 'rs776746', confidence: 'High', phenotype: 'Poor Metabolizer', consequence: 'No functional enzyme' },
    { gene: 'CYP1A2', variant: '*1A/*1F', genotype: 'Heterozygous', rsId: 'rs762551', confidence: 'Medium', phenotype: 'Intermediate Metabolizer', consequence: 'Inducibility altered' },
    { gene: 'SLCO1B1', variant: '*1A/*1A', genotype: 'Wild type', rsId: 'rs4149056', confidence: 'High', phenotype: 'Normal Function', consequence: 'Normal transporter function' },
    { gene: 'TPMT', variant: '*1/*1', genotype: 'Wild type', rsId: 'rs1800460', confidence: 'High', phenotype: 'Normal Metabolizer', consequence: 'Normal enzyme function' },
    { gene: 'DPYD', variant: '*1/*1', genotype: 'Wild type', rsId: 'rs3918290', confidence: 'High', phenotype: 'Normal Metabolizer', consequence: 'Normal enzyme function' },
    { gene: 'HLA-B', variant: '*15:02', genotype: 'Negative', rsId: 'rs2844682', confidence: 'High', phenotype: 'Standard risk', consequence: 'No increased carbamazepine SJS risk' },
    { gene: 'BDNF', variant: 'Val66Met', genotype: 'Val/Met', rsId: 'rs6265', confidence: 'Medium', phenotype: 'Intermediate BDNF secretion', consequence: 'Activity-dependent secretion reduced' },
    { gene: 'COMT', variant: 'Val158Met', genotype: 'Val/Met', rsId: 'rs4680', confidence: 'High', phenotype: 'Intermediate COMT activity', consequence: 'Dopaminergic tone balanced' },
    { gene: 'GRIK4', variant: 'rs1954787', genotype: 'G/T', rsId: 'rs1954787', confidence: 'Medium', phenotype: 'Possible treatment response', consequence: 'May influence antidepressant response' },
    { gene: 'MTHFR', variant: 'C677T', genotype: 'C/T', rsId: 'rs1801133', confidence: 'High', phenotype: 'Moderate enzyme reduction', consequence: '~30% reduced enzyme activity' },
    { gene: 'MTHFR', variant: 'A1298C', genotype: 'A/C', rsId: 'rs1801131', confidence: 'High', phenotype: 'Mild enzyme reduction', consequence: '~15% reduced enzyme activity' },
  ];
}

function _demoNeuromodGenetics() {
  return [
    { gene: 'BDNF', variant: 'Val66Met', rsId: 'rs6265', genotype: 'Val/Met', tmsResponse: 'Possible', tdcsResponse: 'Possible', evidenceGrade: 'B', researchOnly: false, detail: 'Met carriers show reduced activity-dependent BDNF secretion. Some studies suggest differential rTMS response. Not definitive for clinical use.' },
    { gene: 'COMT', variant: 'Val158Met', rsId: 'rs4680', genotype: 'Val/Met', tmsResponse: 'Possible', tdcsResponse: 'Possible', evidenceGrade: 'B', researchOnly: false, detail: 'Val/Met heterozygotes have intermediate COMT activity. Prefrontal dopamine tone may influence neuromodulation response patterns.' },
    { gene: 'GRIK4', variant: 'rs1954787', rsId: 'rs1954787', genotype: 'G/T', tmsResponse: 'Research', tdcsResponse: 'Unknown', evidenceGrade: 'C', researchOnly: true, detail: 'Limited evidence for GRIK4 variants influencing antidepressant and neuromodulation response. Research-grade only.' },
    { gene: 'BDNF', variant: 'Val66Val', rsId: 'rs6265', genotype: 'Val/Val', tmsResponse: 'Favourable', tdcsResponse: 'Favourable', evidenceGrade: 'C', researchOnly: true, detail: 'Val/Val genotype associated with normal BDNF secretion. Some studies suggest better neuromodulation response. Research-grade evidence.' },
    { gene: '5-HTTLPR', variant: 'L/S', rsId: 'rs25531', genotype: 'L/S', tmsResponse: 'Possible', tdcsResponse: 'Unknown', evidenceGrade: 'C', researchOnly: true, detail: 'Serotonin transporter promoter variant. Limited and inconsistent evidence for neuromodulation response prediction.' },
  ];
}

function _demoNutritionGenetics() {
  return {
    mthfr: [
      { variant: 'C677T', rsId: 'rs1801133', genotype: 'C/T', enzymeActivity: 70, recommendation: 'Methylfolate supplementation may be considered. Monitor homocysteine.', evidenceGrade: 'A' },
      { variant: 'A1298C', rsId: 'rs1801131', genotype: 'A/C', enzymeActivity: 85, recommendation: 'Standard folate intake generally sufficient. Consider monitoring if compound heterozygous.', evidenceGrade: 'A' },
    ],
    b12Folate: { b12Status: 'Adequate', folateStatus: 'Monitor', homocysteine: '12.3 μmol/L (borderline)', recommendation: 'Consider methylfolate and B12 monitoring. Clinician may order homocysteine follow-up.' },
    omega3: { gene: 'FADS1/FADS2', variant: 'rs174546', genotype: 'C/T', conversionEfficiency: 'Intermediate', recommendation: 'Direct EPA/DHA sources may be more efficient than ALA conversion.' },
    vitaminD: { gene: 'GC', variant: 'rs2282679', genotype: 'T/G', bindingProtein: 'Intermediate', recommendation: 'Monitor 25-OH vitamin D levels. May require higher supplementation.' },
    zinc: { gene: 'SLC30A2', variant: 'rs312正因为', genotype: 'Wild type', transport: 'Normal', recommendation: 'Standard zinc intake per dietary guidelines.' },
    magnesium: { gene: 'TRPM6', variant: 'rs228493', genotype: 'C/T', channelFunction: 'Normal', recommendation: 'Standard magnesium intake per dietary guidelines.' },
  };
}

function _demoGeneticReports() {
  return [
    { id: 'pgr-001', profileId: 'pgp-001', type: 'clinical', sections: ['Variants','Metabolizer Status','Drug Interactions'], generatedAt: '2025-05-11T10:00:00Z', generatedBy: 'Dr. Smith', status: 'complete', format: 'PDF' },
    { id: 'pgr-002', profileId: 'pgp-001', type: 'patient', sections: ['Metabolizer Status','Nutrition'], generatedAt: '2025-05-12T14:30:00Z', generatedBy: 'Dr. Smith', status: 'complete', format: 'PDF' },
    { id: 'pgr-003', profileId: 'pgp-002', type: 'clinical', sections: ['Variants','Metabolizer Status','Drug Interactions','Neuromodulation'], generatedAt: '2025-05-13T09:15:00Z', generatedBy: 'Dr. Jones', status: 'complete', format: 'HTML' },
  ];
}

function _demoAuditLog() {
  return [
    { action: 'profile_view', actor: 'dr.smith@clinic.com', timestamp: '2025-06-20T10:23:00Z', detail: 'Viewed genetic profile pgp-001' },
    { action: 'report_generated', actor: 'dr.smith@clinic.com', timestamp: '2025-06-20T10:30:00Z', detail: 'Generated clinical report pgr-001' },
    { action: 'variant_reviewed', actor: 'dr.smith@clinic.com', timestamp: '2025-06-20T10:35:00Z', detail: 'Reviewed CYP2D6 variant findings' },
    { action: 'profile_view', actor: 'dr.jones@clinic.com', timestamp: '2025-06-19T14:00:00Z', detail: 'Viewed genetic profile pgp-002' },
    { action: 'interaction_checked', actor: 'dr.jones@clinic.com', timestamp: '2025-06-19T14:15:00Z', detail: 'Reviewed drug-gene interactions for CYP2D6' },
  ];
}

// ── Activity feed data ─────────────────────────────────────────────────────
function _demoActivityFeed() {
  return [
    { type: 'upload', message: 'VCF uploaded for Demo Patient B (22 genes)', time: '2025-06-19T16:20:00Z', actor: 'Dr. Jones' },
    { type: 'analysis', message: 'Metabolizer analysis completed for Demo Patient A', time: '2025-06-19T14:10:00Z', actor: 'System' },
    { type: 'report', message: 'Clinical report generated for Demo Patient B', time: '2025-06-19T11:30:00Z', actor: 'Dr. Smith' },
    { type: 'review', message: 'CYP2D6 variants reviewed by Dr. Smith', time: '2025-06-18T09:45:00Z', actor: 'Dr. Smith' },
    { type: 'upload', message: 'Manual genotype entry for Demo Patient C (6 genes)', time: '2025-06-17T13:00:00Z', actor: 'Dr. Lee' },
    { type: 'alert', message: 'Significant interaction flagged: CYP2D6 × Paroxetine', time: '2025-06-16T10:20:00Z', actor: 'System' },
  ];
}

// ═════════════════════════════════════════════════════════════════════════════
// ENTRY POINT
// ═════════════════════════════════════════════════════════════════════════════
export function renderPage({ route, params, query, ctx, api }) {
  const setTopbar = ctx.setTopbar || (() => {});
  const nav = ctx.nav || { currentUser: null };
  const role = nav.currentUser?.role;

  // Clinician-only gate
  if (role !== 'clinician' && role !== 'admin' && role !== 'supervisor') {
    return _renderGeneticUnauthorized(setTopbar);
  }

  // Route dispatch
  if (route === '/genetic-analyzer' || route === '/genetic-analyzer/dashboard') {
    return _renderGeneticDashboard(setTopbar, api, query);
  }
  if (route === '/genetic-analyzer/profiles') {
    return _renderGeneticProfiles(setTopbar, api, query);
  }
  if (route === '/genetic-analyzer/profiles/:profileId') {
    return _renderGeneticProfileDetail(setTopbar, api, params);
  }
  if (route === '/genetic-analyzer/metabolizer') {
    return _renderMetabolizerPanel(setTopbar, api, query);
  }
  if (route === '/genetic-analyzer/drug-interactions') {
    return _renderDrugInteractions(setTopbar, api, query);
  }
  if (route === '/genetic-analyzer/neuromodulation') {
    return _renderNeuromodulationGenetics(setTopbar, api, query);
  }
  if (route === '/genetic-analyzer/nutrition') {
    return _renderNutritionGenetics(setTopbar, api, query);
  }
  if (route === '/genetic-analyzer/reports') {
    return _renderGeneticReports(setTopbar, api, query);
  }

  return _renderGeneticDashboard(setTopbar, api, query);
}

// ═════════════════════════════════════════════════════════════════════════════
// UNAUTHORIZED VIEW
// ═════════════════════════════════════════════════════════════════════════════
function _renderGeneticUnauthorized(setTopbar) {
  setTopbar('Genetic Medication Analyzer', '');
  const el = document.getElementById('content');
  if (!el) return;
  el.innerHTML = `<div class="pgx-root" style="padding:24px;max-width:720px;margin:0 auto">
    ${PGX_CSS_VARS}
    <div class="ch-card" style="padding:24px;border-left:3px solid var(--pgx-moderate)">
      <div style="font-size:16px;font-weight:700;color:var(--text-primary);margin-bottom:10px">Clinician workspace only</div>
      <p style="font-size:13px;color:var(--text-secondary);line-height:1.65;margin:0 0 14px">
        The Genetic Medication Analyzer is for authorised clinical staff. Patient and guest accounts cannot access pharmacogenomic decision-support tools, patient-linked genetic data, or audit views.
      </p>
      <p style="font-size:12px;color:var(--text-tertiary);line-height:1.55;margin:0">
        Pharmacogenomic findings require qualified interpretation by a clinician or pharmacist.
        This platform provides decision support only and does not prescribe, dose-adjust, or autonomously recommend medications.
      </p>
    </div>
  </div>`;
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. GENETIC DASHBOARD
// ═════════════════════════════════════════════════════════════════════════════
function _renderGeneticDashboard(setTopbar, api, query) {
  setTopbar('Genetic Medication Analyzer — Dashboard', '');
  const el = document.getElementById('content');
  if (!el) return;

  const profiles = _demoGeneticProfiles();
  const metabolizers = _demoMetabolizerData();
  const interactions = _demoDrugInteractions();
  const activity = _demoActivityFeed();

  const totalProfiles = profiles.length;
  const activeAnalyses = profiles.filter(p => p.status === 'processing').length;
  const totalGenes = 24;
  const coveredGenes = new Set();
  profiles.forEach(p => p.genesTested.forEach(g => coveredGenes.add(g)));
  const geneCoverage = coveredGenes.size;
  const evidenceFindings = interactions.filter(i => i.evidence === 'A' || i.evidence === 'B').length;
  const pendingReviews = profiles.filter(p => p.status === 'pending').length;

  // Metabolizer phenotype distribution
  const phenoCounts = { Normal: 0, Intermediate: 0, Poor: 0, Ultrarapid: 0, Unknown: 0 };
  Object.values(metabolizers).forEach(m => {
    const p = String(m.phenotype).toLowerCase();
    if (p.includes('normal') || p.includes('extensive')) phenoCounts.Normal++;
    else if (p.includes('intermediate')) phenoCounts.Intermediate++;
    else if (p.includes('poor')) phenoCounts.Poor++;
    else if (p.includes('ultrarapid')) phenoCounts.Ultrarapid++;
    else phenoCounts.Unknown++;
  });

  // Interaction severity distribution
  const sevCounts = { Normal: 0, Moderate: 0, Significant: 0 };
  interactions.forEach(i => {
    const s = String(i.severity).toLowerCase();
    if (s === 'normal' || s === 'standard') sevCounts.Normal++;
    else if (s === 'moderate') sevCounts.Moderate++;
    else if (s === 'significant' || s === 'severe') sevCounts.Significant++;
  });

  el.innerHTML = `<div class="pgx-root" style="padding:24px" data-test="genetic-dashboard">
    ${PGX_CSS_VARS}
    ${_safetyBanner()}
    ${_geneticNav('/genetic-analyzer/dashboard')}

    <div style="margin-bottom:24px">
      <div style="font-size:20px;font-weight:700;color:var(--text-primary);margin-bottom:4px">Genetic Medication Analyzer</div>
      <div style="font-size:12.5px;color:var(--text-secondary)">Pharmacogenomic decision-support dashboard — evidence-based annotations for clinician review</div>
    </div>

    <!-- KPI Cards -->
    <div style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:24px">
      ${_kpiCard('Genetic Profiles', totalProfiles, { testId: 'kpi-profiles', subtitle: `${profiles.filter(p=>p.status==='complete').length} complete`, color: 'var(--blue)' })}
      ${_kpiCard('Active Analyses', activeAnalyses, { testId: 'kpi-active', subtitle: 'Processing', color: 'var(--pgx-moderate)' })}
      ${_kpiCard('Gene Coverage', `${geneCoverage} / ${totalGenes}`, { testId: 'kpi-genes', subtitle: 'Unique genes tested', color: 'var(--teal)' })}
      ${_kpiCard('Evidence Findings', evidenceFindings, { testId: 'kpi-findings', subtitle: 'Grade A/B linked', color: 'var(--pgx-normal)' })}
      ${_kpiCard('Pending Reviews', pendingReviews, { testId: 'kpi-pending', subtitle: 'Awaiting review', color: 'var(--pgx-moderate)' })}
      ${_kpiCard('Recent Uploads', profiles.filter(p => new Date(p.createdAt) > Date.now() - 7*86400000).length, { testId: 'kpi-uploads', subtitle: 'Last 7 days', color: 'var(--text-primary)' })}
    </div>

    <!-- Charts Row -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px;margin-bottom:24px">
      <!-- Metabolizer Distribution -->
      <div class="ch-card" data-test="chart-metabolizer-dist">
        <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:12px">Metabolizer Phenotype Distribution</div>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${Object.entries(phenoCounts).filter(([,c])=>c>0).map(([label,count]) => {
            const max = Math.max(...Object.values(phenoCounts));
            const pct = max > 0 ? Math.round((count/max)*100) : 0;
            const barColor = label==='Normal'?'var(--pgx-normal)':label==='Intermediate'?'var(--pgx-moderate)':label==='Poor'?'var(--pgx-significant)':'var(--pgx-unknown)';
            return `<div style="display:flex;align-items:center;gap:10px">
              <div style="width:90px;font-size:11px;font-weight:600;color:var(--text-secondary);text-align:right">${esc(label)}</div>
              <div class="pgx-activity-bar" style="flex:1"><div class="pgx-activity-fill" style="width:${pct}%;background:${barColor}"></div></div>
              <div style="width:24px;font-size:11px;font-weight:700;color:var(--text-primary)">${count}</div>
            </div>`;
          }).join('')}
        </div>
        <div style="margin-top:10px;font-size:10.5px;color:var(--text-tertiary)">CYP450 genes across all profiles</div>
      </div>

      <!-- Interaction Severity -->
      <div class="ch-card" data-test="chart-interaction-sev">
        <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:12px">Drug–Gene Interaction Severity</div>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${Object.entries(sevCounts).filter(([,c])=>c>0).map(([label,count]) => {
            const max = Math.max(...Object.values(sevCounts));
            const pct = max > 0 ? Math.round((count/max)*100) : 0;
            const barColor = label==='Normal'?'var(--pgx-normal)':label==='Moderate'?'var(--pgx-moderate)':'var(--pgx-significant)';
            return `<div style="display:flex;align-items:center;gap:10px">
              <div style="width:90px;font-size:11px;font-weight:600;color:var(--text-secondary);text-align:right">${esc(label)}</div>
              <div class="pgx-activity-bar" style="flex:1"><div class="pgx-activity-fill" style="width:${pct}%;background:${barColor}"></div></div>
              <div style="width:24px;font-size:11px;font-weight:700;color:var(--text-primary)">${count}</div>
            </div>`;
          }).join('')}
        </div>
        <div style="margin-top:10px;font-size:10.5px;color:var(--text-tertiary)">Evidence-linked interactions (CPIC/FDA)</div>
      </div>

      <!-- Gene Coverage -->
      <div class="ch-card" data-test="chart-gene-coverage">
        <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:12px">Gene Coverage</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${profiles.slice(0,3).map(p => {
            const pct = Math.round((p.genesTested.length / totalGenes) * 100);
            return `<div style="display:flex;align-items:center;gap:10px">
              <div style="width:60px;font-size:10px;color:var(--text-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.patientName)}</div>
              <div class="pgx-activity-bar" style="flex:1"><div class="pgx-activity-fill" style="width:${pct}%;background:var(--teal)"></div></div>
              <div style="width:36px;font-size:10px;font-weight:600;color:var(--text-primary)">${p.genesTested.length}/${totalGenes}</div>
            </div>`;
          }).join('')}
        </div>
        <div style="margin-top:10px;font-size:10.5px;color:var(--text-tertiary)">${totalGenes} pharmacogenes in reference panel</div>
      </div>
    </div>

    <!-- Activity Feed -->
    <div class="ch-card" data-test="activity-feed">
      <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:12px">Recent Activity</div>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${activity.map(item => {
          const iconMap = { upload: '↑', analysis: '◈', report: '⧉', review: '✓', alert: '!' };
          const colorMap = { upload: 'var(--blue)', analysis: 'var(--teal)', report: 'var(--pgx-research)', review: 'var(--pgx-normal)', alert: 'var(--pgx-significant)' };
          return `<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:6px;background:var(--bg-tertiary)">
            <span style="font-size:14px;color:${colorMap[item.type]||'var(--text-secondary)'};width:20px;text-align:center">${esc(iconMap[item.type]||'•')}</span>
            <div style="flex:1;min-width:0">
              <div style="font-size:12px;color:var(--text-primary);font-weight:500">${esc(item.message)}</div>
              <div style="font-size:10.5px;color:var(--text-tertiary)">${esc(item.actor)} · ${esc(fmtDate(item.time))}</div>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>

    ${_crossPageLinks()}
  </div>`;
}

// ═════════════════════════════════════════════════════════════════════════════
// 2. GENETIC PROFILES
// ═════════════════════════════════════════════════════════════════════════════
function _renderGeneticProfiles(setTopbar, api, query) {
  setTopbar('Genetic Medication Analyzer — Profiles', '');
  const el = document.getElementById('content');
  if (!el) return;

  const profiles = _demoGeneticProfiles();
  const searchTerm = (query?.q || '').toLowerCase();
  const statusFilter = query?.status || '';
  const sourceFilter = query?.source || '';

  let filtered = profiles;
  if (searchTerm) {
    filtered = filtered.filter(p =>
      p.patientName.toLowerCase().includes(searchTerm) ||
      p.profileName.toLowerCase().includes(searchTerm) ||
      p.genesTested.some(g => g.toLowerCase().includes(searchTerm))
    );
  }
  if (statusFilter) {
    filtered = filtered.filter(p => p.status === statusFilter);
  }
  if (sourceFilter) {
    filtered = filtered.filter(p => p.source === sourceFilter);
  }

  el.innerHTML = `<div class="pgx-root" style="padding:24px" data-test="genetic-profiles">
    ${PGX_CSS_VARS}
    ${_safetyBanner()}
    ${_geneticNav('/genetic-analyzer/profiles')}

    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:12px">
      <div>
        <div style="font-size:18px;font-weight:700;color:var(--text-primary)">Genetic Profiles</div>
        <div style="font-size:12px;color:var(--text-secondary)">${filtered.length} profile${filtered.length!==1?'s':''} — ${_SAFE_WORDING.decisionSupport}</div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn-secondary" style="font-size:12px;padding:8px 14px" onclick="window._pgxUploadVcf()" data-test="btn-upload-vcf">Upload VCF</button>
        <button class="btn-primary" style="font-size:12px;padding:8px 14px" onclick="window._pgxAddManual()" data-test="btn-add-manual">+ Add Genotype</button>
      </div>
    </div>

    <!-- Search / Filter Bar -->
    <div class="ch-card" style="padding:12px 14px;margin-bottom:16px;display:flex;gap:10px;flex-wrap:wrap;align-items:center">
      <input type="text" id="pgx-profile-search" placeholder="Search patient, profile, gene..." value="${esc(query?.q||'')}" style="flex:1;min-width:200px;padding:7px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg-input);color:var(--text-primary);font-size:12.5px" data-test="profile-search">
      <select id="pgx-status-filter" style="padding:7px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg-input);color:var(--text-primary);font-size:12.5px" data-test="status-filter">
        <option value="">All Status</option>
        <option value="complete" ${statusFilter==='complete'?'selected':''}>Complete</option>
        <option value="pending" ${statusFilter==='pending'?'selected':''}>Pending</option>
        <option value="processing" ${statusFilter==='processing'?'selected':''}>Processing</option>
        <option value="archived" ${statusFilter==='archived'?'selected':''}>Archived</option>
      </select>
      <select id="pgx-source-filter" style="padding:7px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg-input);color:var(--text-primary);font-size:12.5px" data-test="source-filter">
        <option value="">All Sources</option>
        <option value="VCF" ${sourceFilter==='VCF'?'selected':''}>VCF Upload</option>
        <option value="Manual" ${sourceFilter==='Manual'?'selected':''}>Manual Entry</option>
      </select>
      <button class="btn-primary" style="font-size:12px;padding:7px 14px" onclick="window._pgxFilterProfiles()" data-test="btn-filter">Filter</button>
      <button class="btn-secondary" style="font-size:12px;padding:7px 14px" onclick="window._pgxResetFilters()" data-test="btn-reset">Reset</button>
    </div>

    <!-- Profiles Table -->
    <div class="ch-card" style="overflow-x:auto" data-test="profiles-table-wrapper">
      <table style="width:100%;border-collapse:collapse;font-size:12.5px">
        <thead>
          <tr style="border-bottom:1px solid var(--border)">
            <th style="text-align:left;padding:10px 12px;font-weight:600;color:var(--text-tertiary);font-size:11px;text-transform:uppercase;letter-spacing:0.5px">Patient</th>
            <th style="text-align:left;padding:10px 12px;font-weight:600;color:var(--text-tertiary);font-size:11px;text-transform:uppercase;letter-spacing:0.5px">Profile Name</th>
            <th style="text-align:left;padding:10px 12px;font-weight:600;color:var(--text-tertiary);font-size:11px;text-transform:uppercase;letter-spacing:0.5px">Source</th>
            <th style="text-align:center;padding:10px 12px;font-weight:600;color:var(--text-tertiary);font-size:11px;text-transform:uppercase;letter-spacing:0.5px">Genes</th>
            <th style="text-align:left;padding:10px 12px;font-weight:600;color:var(--text-tertiary);font-size:11px;text-transform:uppercase;letter-spacing:0.5px">Status</th>
            <th style="text-align:left;padding:10px 12px;font-weight:600;color:var(--text-tertiary);font-size:11px;text-transform:uppercase;letter-spacing:0.5px">Created</th>
            <th style="text-align:center;padding:10px 12px;font-weight:600;color:var(--text-tertiary);font-size:11px;text-transform:uppercase;letter-spacing:0.5px">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.length === 0 ? `<tr><td colspan="7" style="padding:32px;text-align:center;color:var(--text-tertiary);font-size:12px">No profiles match your filters.</td></tr>` :
            filtered.map(p => `
            <tr style="border-bottom:1px solid var(--border);cursor:pointer" onclick="window._pgxOpenProfile('${esc(p.id)}')" data-test="profile-row-${esc(p.id)}" onmouseover="this.style.background='var(--bg-tertiary)'" onmouseout="this.style.background=''">
              <td style="padding:10px 12px">
                <div style="font-weight:600;color:var(--text-primary);font-size:12.5px">${esc(p.patientName)}</div>
                <div style="font-size:10.5px;color:var(--text-tertiary)">${esc(p.patientId)}</div>
              </td>
              <td style="padding:10px 12px;color:var(--text-primary)">${esc(p.profileName)}</td>
              <td style="padding:10px 12px"><span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:4px;background:var(--bg-tertiary);color:var(--text-secondary)">${esc(p.source)}</span></td>
              <td style="padding:10px 12px;text-align:center">
                <span style="font-weight:700;color:var(--blue);font-variant-numeric:tabular-nums">${p.geneCount}</span>
                <span style="font-size:10px;color:var(--text-tertiary)"> genes</span>
              </td>
              <td style="padding:10px 12px">${_statusBadge(p.status)}</td>
              <td style="padding:10px 12px;color:var(--text-secondary);font-size:11.5px">${esc(fmtDateOnly(p.createdAt))}</td>
              <td style="padding:10px 12px;text-align:center">
                <button class="btn-secondary" style="font-size:11px;padding:4px 10px" onclick="event.stopPropagation();window._pgxDeleteProfile('${esc(p.id)}')" data-test="btn-delete-${esc(p.id)}">Delete</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    ${_crossPageLinks()}
  </div>`;

  // Attach handlers
  window._pgxUploadVcf = () => alert('VCF upload: select a .vcf or .vcf.gz file to import genetic variants. (Demo: no file dialog in preview)');
  window._pgxAddManual = () => alert('Manual genotype entry: add individual gene variants via form. (Demo: form not available in preview)');
  window._pgxOpenProfile = (id) => { window.location.hash = `#/genetic-analyzer/profiles/${id}`; };
  window._pgxDeleteProfile = (id) => { if (confirm(`Delete profile ${id}? This cannot be undone.`)) alert(`Profile ${id} deleted. (Demo)`); };
  window._pgxFilterProfiles = () => {
    const q = document.getElementById('pgx-profile-search')?.value || '';
    const status = document.getElementById('pgx-status-filter')?.value || '';
    const source = document.getElementById('pgx-source-filter')?.value || '';
    const qs = new URLSearchParams({ ...(q && { q }), ...(status && { status }), ...(source && { source }) }).toString();
    window.location.hash = `#/genetic-analyzer/profiles${qs ? '?' + qs : ''}`;
  };
  window._pgxResetFilters = () => { window.location.hash = '#/genetic-analyzer/profiles'; };
}

// ═════════════════════════════════════════════════════════════════════════════
// 3. PROFILE DETAIL
// ═════════════════════════════════════════════════════════════════════════════
function _renderGeneticProfileDetail(setTopbar, api, params) {
  const profileId = params?.profileId || '';
  setTopbar(`Genetic Medication Analyzer — Profile ${profileId}`, '');
  const el = document.getElementById('content');
  if (!el) return;

  const profiles = _demoGeneticProfiles();
  const profile = profiles.find(p => p.id === profileId) || profiles[0];
  const tab = params?.tab || 'overview';

  const tabContent = _renderProfileTab(tab, profile);

  el.innerHTML = `<div class="pgx-root" style="padding:24px" data-test="genetic-profile-detail">
    ${PGX_CSS_VARS}
    ${_safetyBanner()}
    ${_geneticNav(`/genetic-analyzer/profiles/${profileId}`)}

    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:12px">
      <div>
        <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:2px">${esc(profile.id)} · ${esc(profile.source)}</div>
        <div style="font-size:18px;font-weight:700;color:var(--text-primary)">${esc(profile.patientName)} — ${esc(profile.profileName)}</div>
      </div>
      <div style="display:flex;gap:8px">
        <a href="#/genetic-analyzer/profiles" style="font-size:12px;color:var(--blue);text-decoration:none;font-weight:500">← Back to Profiles</a>
      </div>
    </div>

    <!-- Tab Bar -->
    <div class="pgx-tab-bar">
      ${['overview','variants','metabolizer','interactions','side-effects','neuromodulation','nutrition','reports','audit'].map(t => {
        const isActive = tab === t;
        const label = { overview: 'Overview', variants: 'Variants', metabolizer: 'Metabolizer', interactions: 'Drug Interactions', 'side-effects': 'Side Effects', neuromodulation: 'Neuromodulation', nutrition: 'Nutrition', reports: 'Reports', audit: 'Audit' }[t];
        return `<div class="pgx-tab ${isActive?'active':''}" onclick="window._pgxProfileTab('${esc(t)}')" data-test="tab-${esc(t)}">${esc(label)}</div>`;
      }).join('')}
    </div>

    <!-- Tab Content -->
    <div data-test="tab-content">${tabContent}</div>

    ${_crossPageLinks()}
  </div>`;

  window._pgxProfileTab = (t) => { window.location.hash = `#/genetic-analyzer/profiles/${profileId}?tab=${t}`; };
}

function _renderProfileTab(tab, profile) {
  switch (tab) {
    case 'overview': return _profileOverviewTab(profile);
    case 'variants': return _profileVariantsTab(profile);
    case 'metabolizer': return _profileMetabolizerTab(profile);
    case 'interactions': return _profileInteractionsTab(profile);
    case 'side-effects': return _profileSideEffectsTab(profile);
    case 'neuromodulation': return _profileNeuromodTab(profile);
    case 'nutrition': return _profileNutritionTab(profile);
    case 'reports': return _profileReportsTab(profile);
    case 'audit': return _profileAuditTab(profile);
    default: return _profileOverviewTab(profile);
  }
}

function _profileOverviewTab(profile) {
  const totalGenes = 24;
  const coveragePct = Math.round((profile.genesTested.length / totalGenes) * 100);
  const variants = _demoVariants();
  const interactions = _demoDrugInteractions();
  const relevantInteractions = interactions.slice(0, profile.interactions);

  return `<div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;margin-bottom:20px">
      <!-- Patient Info -->
      <div class="ch-card">
        <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:10px">Patient Information</div>
        <div style="display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:var(--text-secondary)">
          <div style="display:flex;justify-content:space-between"><span>Patient ID:</span><span style="color:var(--text-primary);font-weight:500;font-family:var(--font-mono);font-size:11px">${esc(profile.patientId)}</span></div>
          <div style="display:flex;justify-content:space-between"><span>Profile ID:</span><span style="color:var(--text-primary);font-weight:500;font-family:var(--font-mono);font-size:11px">${esc(profile.id)}</span></div>
          <div style="display:flex;justify-content:space-between"><span>Source:</span><span style="color:var(--text-primary);font-weight:500">${esc(profile.source)}</span></div>
          <div style="display:flex;justify-content:space-between"><span>Created:</span><span style="color:var(--text-primary);font-weight:500">${esc(fmtDate(profile.createdAt))}</span></div>
          <div style="display:flex;justify-content:space-between"><span>Status:</span><span>${_statusBadge(profile.status)}</span></div>
        </div>
      </div>

      <!-- Gene Coverage -->
      <div class="ch-card">
        <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:10px">Gene Coverage</div>
        <div style="margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px">
            <span style="font-size:11px;color:var(--text-secondary)">${profile.genesTested.length} of ${totalGenes} genes tested</span>
            <span style="font-size:11px;font-weight:700;color:var(--teal)">${coveragePct}%</span>
          </div>
          <div class="pgx-activity-bar"><div class="pgx-activity-fill" style="width:${coveragePct}%;background:var(--teal)"></div></div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:4px">
          ${profile.genesTested.slice(0,12).map(g => `<span style="font-size:10px;font-weight:600;padding:2px 7px;border-radius:4px;background:var(--bg-tertiary);color:var(--text-secondary)">${esc(g)}</span>`).join('')}
          ${profile.genesTested.length > 12 ? `<span style="font-size:10px;color:var(--text-tertiary)">+${profile.genesTested.length - 12} more</span>` : ''}
        </div>
      </div>

      <!-- Quick Stats -->
      <div class="ch-card">
        <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:10px">Profile Summary</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div style="text-align:center;padding:10px;border-radius:6px;background:var(--bg-tertiary)">
            <div style="font-size:20px;font-weight:700;color:var(--blue)">${profile.variants || variants.length}</div>
            <div style="font-size:10.5px;color:var(--text-tertiary)">Variants</div>
          </div>
          <div style="text-align:center;padding:10px;border-radius:6px;background:var(--bg-tertiary)">
            <div style="font-size:20px;font-weight:700;color:var(--pgx-moderate)">${profile.interactions}</div>
            <div style="font-size:10.5px;color:var(--text-tertiary)">Interactions</div>
          </div>
          <div style="text-align:center;padding:10px;border-radius:6px;background:var(--bg-tertiary)">
            <div style="font-size:20px;font-weight:700;color:var(--pgx-normal)">${Object.keys(profile.metabolizers || {}).length}</div>
            <div style="font-size:10.5px;color:var(--text-tertiary)">Metabolizer Genes</div>
          </div>
          <div style="text-align:center;padding:10px;border-radius:6px;background:var(--bg-tertiary)">
            <div style="font-size:20px;font-weight:700;color:var(--teal)">${profile.genesTested.length}</div>
            <div style="font-size:10.5px;color:var(--text-tertiary)">Total Genes</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Relevant Interactions Preview -->
    ${relevantInteractions.length > 0 ? `<div class="ch-card" data-test="overview-interactions">
      <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:10px">Key Drug–Gene Interactions</div>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${relevantInteractions.map(ix => `<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:6px;background:var(--bg-tertiary)">
          ${_severityPill(ix.severity)}
          <span style="font-size:12px;font-weight:600;color:var(--text-primary)">${esc(ix.drug)}</span>
          <span style="font-size:11px;color:var(--text-tertiary)">×</span>
          <span style="font-size:12px;color:var(--text-secondary)">${esc(ix.gene)}</span>
          <span style="flex:1"></span>
          ${_pgxEvidenceBadge(ix.evidence)}
          ${ix.fdaLabel ? '<span class="pgx-fda-badge">FDA</span>' : ''}
          ${ix.cpicGuideline ? '<span class="pgx-cpic-badge">CPIC</span>' : ''}
        </div>`).join('')}
      </div>
    </div>` : ''}
  </div>`;
}

function _profileVariantsTab(profile) {
  const variants = _demoVariants().filter(v => profile.genesTested.includes(v.gene));
  return `<div class="ch-card" data-test="variants-tab">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">
      <div style="font-size:13px;font-weight:700;color:var(--text-primary)">Genetic Variants — ${variants.length} found</div>
      <div style="font-size:11px;color:var(--text-tertiary)">${_SAFE_WORDING.supportiveContext}</div>
    </div>
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead>
          <tr style="border-bottom:1px solid var(--border)">
            <th style="text-align:left;padding:8px 10px;font-weight:600;color:var(--text-tertiary);font-size:11px">Gene</th>
            <th style="text-align:left;padding:8px 10px;font-weight:600;color:var(--text-tertiary);font-size:11px">Variant</th>
            <th style="text-align:left;padding:8px 10px;font-weight:600;color:var(--text-tertiary);font-size:11px">Genotype</th>
            <th style="text-align:left;padding:8px 10px;font-weight:600;color:var(--text-tertiary);font-size:11px">rsID</th>
            <th style="text-align:left;padding:8px 10px;font-weight:600;color:var(--text-tertiary);font-size:11px">Confidence</th>
            <th style="text-align:left;padding:8px 10px;font-weight:600;color:var(--text-tertiary);font-size:11px">Phenotype</th>
            <th style="text-align:left;padding:8px 10px;font-weight:600;color:var(--text-tertiary);font-size:11px">Consequence</th>
          </tr>
        </thead>
        <tbody>
          ${variants.map(v => `<tr style="border-bottom:1px solid var(--border)">
            <td style="padding:8px 10px;font-weight:600;color:var(--blue);font-size:11px">${esc(v.gene)}</td>
            <td style="padding:8px 10px;color:var(--text-primary)">${esc(v.variant)}</td>
            <td style="padding:8px 10px;color:var(--text-secondary)">${esc(v.genotype)}</td>
            <td style="padding:8px 10px;font-family:var(--font-mono);font-size:10.5px;color:var(--text-tertiary)">${esc(v.rsId)}</td>
            <td style="padding:8px 10px"><span style="font-size:10.5px;font-weight:600;padding:2px 7px;border-radius:4px;background:${v.confidence==='High'?'rgba(34,197,94,0.12)':'rgba(245,158,11,0.12)'};color:${v.confidence==='High'?'var(--pgx-normal)':'var(--pgx-moderate)'}">${esc(v.confidence)}</span></td>
            <td style="padding:8px 10px">${_phenotypeBadge(v.phenotype)}</td>
            <td style="padding:8px 10px;font-size:11px;color:var(--text-secondary)">${esc(v.consequence)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}

function _profileMetabolizerTab(profile) {
  const metabolizers = Object.entries(profile.metabolizers || {}).map(([gene, phenotype]) => {
    const fullData = _demoMetabolizerData()[gene];
    return { gene, phenotype, ...(fullData || {}) };
  });
  return `<div data-test="metabolizer-tab">
    <div style="margin-bottom:10px;font-size:11px;color:var(--text-tertiary)">${_SAFE_WORDING.consultPharmacist} · CPIC guidelines referenced where available.</div>
    <div class="pgx-metabolizer-grid">
      ${metabolizers.length === 0 ? '<div class="ch-card" style="grid-column:1/-1;text-align:center;padding:24px;color:var(--text-tertiary)">No metabolizer data available for this profile.</div>' :
        metabolizers.map(m => {
          const score = m.activityScore !== undefined ? m.activityScore : '—';
          const scorePct = typeof score === 'number' ? (score / 2) * 100 : 0;
          const barColor = String(m.phenotype).toLowerCase().includes('normal') ? 'var(--pgx-normal)' :
            String(m.phenotype).toLowerCase().includes('intermediate') ? 'var(--pgx-moderate)' : 'var(--pgx-significant)';
          return `<div class="pgx-gene-card pgx-phenotype-${String(m.phenotype).toLowerCase().includes('normal')?'normal':String(m.phenotype).toLowerCase().includes('intermediate')?'moderate':'significant'}" data-test="metabolizer-card-${esc(m.gene)}">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
              <div style="font-size:15px;font-weight:700;color:var(--text-primary)">${esc(m.gene)}</div>
              ${_phenotypeBadge(m.phenotype)}
            </div>
            <div style="margin-bottom:8px">
              <div style="display:flex;justify-content:space-between;margin-bottom:3px">
                <span style="font-size:10.5px;color:var(--text-tertiary)">Activity Score</span>
                <span style="font-size:10.5px;font-weight:700;color:var(--text-primary)">${score} / 2.0</span>
              </div>
              <div class="pgx-activity-bar"><div class="pgx-activity-fill" style="width:${scorePct}%;background:${barColor}"></div></div>
            </div>
            ${m.diplotype ? `<div style="font-size:11px;color:var(--text-secondary);margin-bottom:6px">Diplotype: <span style="font-family:var(--font-mono);font-size:10.5px">${esc(m.diplotype)}</span></div>` : ''}
            ${m.affectedDrugs && m.affectedDrugs.length > 0 ? `<div style="margin-top:8px">
              <div style="font-size:10.5px;font-weight:600;color:var(--text-tertiary);margin-bottom:4px">Affected Medications</div>
              <div style="display:flex;flex-wrap:wrap;gap:3px">
                ${m.affectedDrugs.slice(0,6).map(d => `<span style="font-size:10px;padding:2px 6px;border-radius:3px;background:var(--bg-tertiary);color:var(--text-secondary)">${esc(d)}</span>`).join('')}
                ${m.affectedDrugs.length > 6 ? `<span style="font-size:10px;color:var(--text-tertiary)">+${m.affectedDrugs.length-6}</span>` : ''}
              </div>
            </div>` : ''}
            ${m.cpicRecommendation ? `<div style="margin-top:10px;padding:8px;border-radius:6px;background:rgba(139,92,246,0.06);border-left:2px solid #8b5cf6">
              <div style="font-size:10px;font-weight:700;color:#8b5cf6;margin-bottom:2px">CPIC</div>
              <div style="font-size:10.5px;color:var(--text-secondary);line-height:1.45">${esc(m.cpicRecommendation)}</div>
            </div>` : ''}
            ${m.fdaLabel ? '<span class="pgx-fda-badge" style="margin-top:6px;display:inline-block">FDA Label Info</span>' : ''}
            ${m.evidenceGrade ? `<span style="margin-top:6px;margin-left:4px;display:inline-block">${_pgxEvidenceBadge(m.evidenceGrade)}</span>` : ''}
          </div>`;
        }).join('')}
    </div>
  </div>`;
}

function _profileInteractionsTab(profile) {
  const interactions = _demoDrugInteractions().filter(i => profile.genesTested.includes(i.gene));
  return `<div class="ch-card" data-test="interactions-tab">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">
      <div style="font-size:13px;font-weight:700;color:var(--text-primary)">Drug–Gene Interactions — ${interactions.length} findings</div>
      <div style="font-size:11px;color:var(--text-tertiary)">${_SAFE_WORDING.mayConsider}</div>
    </div>
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead>
          <tr style="border-bottom:1px solid var(--border)">
            <th style="text-align:left;padding:8px 10px;font-weight:600;color:var(--text-tertiary);font-size:11px">Drug</th>
            <th style="text-align:left;padding:8px 10px;font-weight:600;color:var(--text-tertiary);font-size:11px">Class</th>
            <th style="text-align:left;padding:8px 10px;font-weight:600;color:var(--text-tertiary);font-size:11px">Gene</th>
            <th style="text-align:left;padding:8px 10px;font-weight:600;color:var(--text-tertiary);font-size:11px">Interaction</th>
            <th style="text-align:left;padding:8px 10px;font-weight:600;color:var(--text-tertiary);font-size:11px">Severity</th>
            <th style="text-align:center;padding:8px 10px;font-weight:600;color:var(--text-tertiary);font-size:11px">Evid.</th>
            <th style="text-align:left;padding:8px 10px;font-weight:600;color:var(--text-tertiary);font-size:11px">Clinical Action</th>
          </tr>
        </thead>
        <tbody>
          ${interactions.map(ix => `<tr style="border-bottom:1px solid var(--border)" class="pgx-interaction-row-${ix.severity}">
            <td style="padding:8px 10px;font-weight:600;color:var(--text-primary)">${esc(ix.drug)}</td>
            <td style="padding:8px 10px;font-size:11px;color:var(--text-secondary)">${esc(ix.drugClass)}</td>
            <td style="padding:8px 10px;font-weight:600;color:var(--blue);font-size:11px">${esc(ix.gene)}</td>
            <td style="padding:8px 10px;font-size:11px;color:var(--text-secondary)">${esc(ix.interactionType)}</td>
            <td style="padding:8px 10px">${_severityPill(ix.severity)}</td>
            <td style="padding:8px 10px;text-align:center">${_pgxEvidenceBadge(ix.evidence)}</td>
            <td style="padding:8px 10px">${_clinicalActionPill(ix.clinicalAction)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div style="margin-top:10px;font-size:10.5px;color:var(--text-tertiary)">
      Evidence grades: A = Strong (RCTs/systematic reviews) · B = Moderate · C = Limited · D = Insufficient
    </div>
  </div>`;
}

function _profileSideEffectsTab(profile) {
  const risks = [
    { gene: 'HLA-B', variant: '*15:02', risk: 'Carbamazepine SJS/TEN', severity: 'significant', probability: '< 1% if positive', evidence: 'A', management: 'Screen before carbamazepine. Consider alternative if positive.' },
    { gene: 'HLA-B', variant: '*57:01', risk: 'Abacavir hypersensitivity', severity: 'significant', probability: 'N/A (not tested)', evidence: 'A', management: 'Required screening before abacavir per FDA label.' },
    { gene: 'CYP2D6', variant: 'Poor', risk: 'Increased ADRs (CYP2D6 substrates)', severity: 'moderate', probability: 'Varies by drug', evidence: 'A', management: 'Monitor for ADRs with CYP2D6 substrate medications.' },
    { gene: 'TPMT', variant: 'Normal', risk: 'Thiopurine myelosuppression', severity: 'normal', probability: 'Standard risk', evidence: 'A', management: 'Standard thiopurine dosing per guidelines.' },
    { gene: 'UGT1A1', variant: '*1/*1', risk: 'Irinotecan neutropenia', severity: 'normal', probability: 'Standard risk', evidence: 'A', management: 'Standard irinotecan dosing per guidelines.' },
  ];
  return `<div data-test="side-effects-tab">
    <div style="margin-bottom:10px;font-size:11px;color:var(--text-tertiary)">Gene-based side effect risk assessment. ${_SAFE_WORDING.supportiveContext}</div>
    <div class="pgx-metabolizer-grid">
      ${risks.map(r => `<div class="pgx-gene-card pgx-phenotype-${r.severity}" data-test="risk-card-${esc(r.gene)}">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <div style="font-size:14px;font-weight:700;color:var(--text-primary)">${esc(r.gene)} <span style="font-size:11px;font-weight:400;color:var(--text-tertiary)">${esc(r.variant)}</span></div>
          ${_severityPill(r.severity)}
        </div>
        <div style="font-size:12px;font-weight:600;color:var(--text-primary);margin-bottom:4px">${esc(r.risk)}</div>
        <div style="font-size:11px;color:var(--text-secondary);margin-bottom:6px">Probability: ${esc(r.probability)}</div>
        <div style="font-size:11px;color:var(--text-secondary);line-height:1.5;margin-bottom:6px"><strong>Management:</strong> ${esc(r.management)}</div>
        <div>${_pgxEvidenceBadge(r.evidence)}</div>
      </div>`).join('')}
    </div>
  </div>`;
}

function _profileNeuromodTab(profile) {
  const neuromodData = _demoNeuromodGenetics();
  return `<div data-test="neuromod-tab">
    <div style="margin-bottom:10px;font-size:11px;color:var(--text-tertiary)">
      Neuromodulation response genetics — research-grade findings. ${_SAFE_WORDING.supportiveContext} Not for standalone clinical decisions.
    </div>
    <div class="pgx-metabolizer-grid">
      ${neuromodData.map(n => `<div class="pgx-gene-card ${n.researchOnly ? 'pgx-phenotype-research' : 'pgx-phenotype-moderate'}" data-test="neuromod-card-${esc(n.gene)}">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <div style="font-size:14px;font-weight:700;color:var(--text-primary)">${esc(n.gene)} <span style="font-size:11px;font-weight:400;color:var(--text-tertiary)">${esc(n.variant)}</span></div>
          <div style="display:flex;gap:4px">
            ${n.researchOnly ? '<span class="pgx-research-badge">Research Only</span>' : ''}
            ${_pgxEvidenceBadge(n.evidenceGrade)}
          </div>
        </div>
        <div style="font-size:11px;color:var(--text-secondary);margin-bottom:4px">Genotype: <span style="font-weight:600;color:var(--text-primary)">${esc(n.genotype)}</span> · ${esc(n.rsId)}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0">
          <div style="text-align:center;padding:8px;border-radius:6px;background:var(--bg-tertiary)">
            <div style="font-size:10px;color:var(--text-tertiary)">rTMS Response</div>
            <div style="font-size:13px;font-weight:700;color:${n.tmsResponse==='Favourable'?'var(--pgx-normal)':n.tmsResponse==='Possible'?'var(--pgx-moderate)':'var(--pgx-unknown)'}">${esc(n.tmsResponse)}</div>
          </div>
          <div style="text-align:center;padding:8px;border-radius:6px;background:var(--bg-tertiary)">
            <div style="font-size:10px;color:var(--text-tertiary)">tDCS Response</div>
            <div style="font-size:13px;font-weight:700;color:${n.tdcsResponse==='Favourable'?'var(--pgx-normal)':n.tdcsResponse==='Possible'?'var(--pgx-moderate)':'var(--pgx-unknown)'}">${esc(n.tdcsResponse)}</div>
          </div>
        </div>
        <div style="font-size:11px;color:var(--text-secondary);line-height:1.5">${esc(n.detail)}</div>
      </div>`).join('')}
    </div>
    <div class="ch-card" style="margin-top:16px;background:rgba(59,130,246,0.04);border:1px solid rgba(59,130,246,0.15)">
      <div style="font-size:12px;color:var(--pgx-research);font-weight:600;margin-bottom:4px">Research-Grade Notice</div>
      <div style="font-size:11px;color:var(--text-secondary);line-height:1.55">
        Neuromodulation pharmacogenomics is an active research field. Current evidence does not support using genetic variants alone to select or exclude patients from rTMS or tDCS. Clinician judgment remains paramount. These findings should not override established clinical indications or contraindications for neuromodulation therapy.
      </div>
    </div>
  </div>`;
}

function _profileNutritionTab(profile) {
  const data = _demoNutritionGenetics();
  return `<div data-test="nutrition-tab">
    <div style="margin-bottom:10px;font-size:11px;color:var(--text-tertiary)">
      Nutritional genetics — supportive context for dietary planning. ${_SAFE_WORDING.consultPharmacist}
    </div>

    <!-- MTHFR Panel -->
    <div class="ch-card" style="margin-bottom:16px">
      <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:12px">MTHFR Panel</div>
      <div class="pgx-metabolizer-grid">
        ${data.mthfr.map(m => `<div class="pgx-gene-card" data-test="mthfr-card-${esc(m.variant)}">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <div style="font-size:14px;font-weight:700;color:var(--text-primary)">MTHFR ${esc(m.variant)}</div>
            ${_pgxEvidenceBadge(m.evidenceGrade)}
          </div>
          <div style="font-size:11px;color:var(--text-secondary);margin-bottom:4px">${esc(m.rsId)} · Genotype: <strong>${esc(m.genotype)}</strong></div>
          <div style="margin-bottom:8px">
            <div style="display:flex;justify-content:space-between;margin-bottom:3px">
              <span style="font-size:10.5px;color:var(--text-tertiary)">Enzyme Activity</span>
              <span style="font-size:10.5px;font-weight:700;color:var(--text-primary)">${m.enzymeActivity}%</span>
            </div>
            <div class="pgx-activity-bar"><div class="pgx-activity-fill" style="width:${m.enzymeActivity}%;background:${m.enzymeActivity>=90?'var(--pgx-normal)':m.enzymeActivity>=60?'var(--pgx-moderate)':'var(--pgx-significant)'}"></div></div>
          </div>
          <div style="font-size:11px;color:var(--text-secondary);line-height:1.5">${esc(m.recommendation)}</div>
        </div>`).join('')}
      </div>
    </div>

    <!-- Methylation Pathway -->
    <div class="ch-card" style="margin-bottom:16px">
      <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:10px">Methylation Pathway Overview</div>
      <div class="pgx-ascii-diagram">
Dietary Folate ──→ MTHFR (C677T) ──→ 5-MTHF ──→ Methionine Synthase ──→ SAMe
                          │                                      │
                     [70% activity]                         [Methylation]
                          │                              [Neurotransmitter synthesis]
                    B2 (Riboflavin) ───────────────────────┘
                    B12 (Methylcobalamin) ───────────────────┘
      </div>
      <div style="margin-top:10px;font-size:11px;color:var(--text-secondary);line-height:1.55">
        MTHFR C677T heterozygotes (C/T) have approximately 70% of normal enzyme activity. 
        This may affect folate metabolism and methylation capacity. 
        Clinician may consider methylfolate supplementation and monitoring homocysteine levels.
      </div>
    </div>

    <!-- B12 / Folate Status -->
    <div class="ch-card" style="margin-bottom:16px">
      <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:10px">B12 / Folate Status</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:10px">
        <div style="text-align:center;padding:12px;border-radius:8px;background:var(--bg-tertiary)">
          <div style="font-size:10px;color:var(--text-tertiary)">B12 Status</div>
          <div style="font-size:15px;font-weight:700;color:var(--pgx-normal)">${esc(data.b12Folate.b12Status)}</div>
        </div>
        <div style="text-align:center;padding:12px;border-radius:8px;background:var(--bg-tertiary)">
          <div style="font-size:10px;color:var(--text-tertiary)">Folate Status</div>
          <div style="font-size:15px;font-weight:700;color:var(--pgx-moderate)">${esc(data.b12Folate.folateStatus)}</div>
        </div>
        <div style="text-align:center;padding:12px;border-radius:8px;background:var(--bg-tertiary)">
          <div style="font-size:10px;color:var(--text-tertiary)">Homocysteine</div>
          <div style="font-size:15px;font-weight:700;color:var(--pgx-moderate)">${esc(data.b12Folate.homocysteine)}</div>
        </div>
      </div>
      <div style="font-size:11.5px;color:var(--text-secondary);line-height:1.55;padding:10px;border-radius:6px;background:rgba(245,158,11,0.06)">
        <strong>Recommendation:</strong> ${esc(data.b12Folate.recommendation)}
      </div>
    </div>

    <!-- Micronutrient Genetics -->
    <div class="ch-card">
      <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:10px">Micronutrient Genetics</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px">
        ${[
          { label: 'Omega-3 Conversion', gene: data.omega3.gene, detail: `Efficiency: ${data.omega3.conversionEfficiency}`, rec: data.omega3.recommendation },
          { label: 'Vitamin D Binding', gene: data.vitaminD.gene, detail: `Binding: ${data.vitaminD.bindingProtein}`, rec: data.vitaminD.recommendation },
          { label: 'Zinc Transport', gene: data.zinc.gene, detail: `Transport: ${data.zinc.transport}`, rec: data.zinc.recommendation },
          { label: 'Magnesium Channel', gene: data.magnesium.gene, detail: `Channel: ${data.magnesium.channelFunction}`, rec: data.magnesium.recommendation },
        ].map(item => `<div style="padding:10px;border-radius:6px;background:var(--bg-tertiary)">
          <div style="font-size:11px;font-weight:600;color:var(--text-primary)">${esc(item.label)}</div>
          <div style="font-size:10px;color:var(--blue);margin-bottom:2px">${esc(item.gene)}</div>
          <div style="font-size:10.5px;color:var(--text-secondary);margin-bottom:4px">${esc(item.detail)}</div>
          <div style="font-size:10.5px;color:var(--text-secondary);line-height:1.45">${esc(item.rec)}</div>
        </div>`).join('')}
      </div>
    </div>
  </div>`;
}

function _profileReportsTab(profile) {
  const reports = _demoGeneticReports().filter(r => r.profileId === profile.id);
  return `<div data-test="reports-tab">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">
      <div style="font-size:13px;font-weight:700;color:var(--text-primary)">Generated Reports — ${reports.length}</div>
      <button class="btn-primary" style="font-size:12px;padding:6px 12px" onclick="window._pgxGenerateReport('${esc(profile.id)}')" data-test="btn-generate-report">Generate Report</button>
    </div>
    ${reports.length === 0 ? '<div class="ch-card" style="text-align:center;padding:24px;color:var(--text-tertiary)">No reports generated yet.</div>' :
      `<div style="display:flex;flex-direction:column;gap:8px">
        ${reports.map(r => `<div class="ch-card" style="display:flex;align-items:center;gap:12px;padding:12px 14px" data-test="report-${esc(r.id)}">
          <div style="font-size:20px">${r.format==='PDF'?'📄':'🌐'}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:12.5px;font-weight:600;color:var(--text-primary)">${esc(r.type==='clinical'?'Clinical':'Patient-Friendly')} Report · ${esc(r.profileId)}</div>
            <div style="font-size:11px;color:var(--text-tertiary)">${esc(r.sections.join(', '))} · ${esc(fmtDate(r.generatedAt))} · by ${esc(r.generatedBy)}</div>
          </div>
          <div style="display:flex;gap:6px">
            <button class="btn-secondary" style="font-size:11px;padding:4px 10px" onclick="window._pgxPreviewReport('${esc(r.id)}')">Preview</button>
            <button class="btn-primary" style="font-size:11px;padding:4px 10px" onclick="window._pgxDownloadReport('${esc(r.id)}')">Download ${esc(r.format)}</button>
          </div>
        </div>`).join('')}
      </div>`}
    <div style="margin-top:12px;font-size:11px;color:var(--text-tertiary)">
      All reports include the genetic medication analyzer safety disclaimer on every page.
    </div>
  </div>`;
}

function _profileAuditTab(profile) {
  const audit = _demoAuditLog().filter(a => a.detail.includes(profile.id));
  return `<div class="ch-card" data-test="audit-tab">
    <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:12px">Access Audit — ${audit.length} events</div>
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead>
          <tr style="border-bottom:1px solid var(--border)">
            <th style="text-align:left;padding:8px 10px;font-weight:600;color:var(--text-tertiary);font-size:11px">Action</th>
            <th style="text-align:left;padding:8px 10px;font-weight:600;color:var(--text-tertiary);font-size:11px">Actor</th>
            <th style="text-align:left;padding:8px 10px;font-weight:600;color:var(--text-tertiary);font-size:11px">Detail</th>
            <th style="text-align:left;padding:8px 10px;font-weight:600;color:var(--text-tertiary);font-size:11px">Timestamp</th>
          </tr>
        </thead>
        <tbody>
          ${audit.length === 0 ? `<tr><td colspan="4" style="padding:24px;text-align:center;color:var(--text-tertiary)">No audit events for this profile.</td></tr>` :
            audit.map(a => `<tr style="border-bottom:1px solid var(--border)">
              <td style="padding:8px 10px;font-weight:600;color:var(--text-primary);font-size:11px;text-transform:capitalize">${esc(a.action.replace(/_/g,' '))}</td>
              <td style="padding:8px 10px;font-size:11px;color:var(--text-secondary);font-family:var(--font-mono)">${esc(a.actor)}</td>
              <td style="padding:8px 10px;font-size:11px;color:var(--text-secondary)">${esc(a.detail)}</td>
              <td style="padding:8px 10px;font-size:11px;color:var(--text-tertiary)">${esc(fmtDate(a.timestamp))}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}

// ═════════════════════════════════════════════════════════════════════════════
// 4. METABOLIZER PANEL
// ═════════════════════════════════════════════════════════════════════════════
function _renderMetabolizerPanel(setTopbar, api, query) {
  setTopbar('Genetic Medication Analyzer — Metabolizer Panel', '');
  const el = document.getElementById('content');
  if (!el) return;

  const metabolizers = _demoMetabolizerData();
  const filterGene = (query?.gene || '').toUpperCase();
  const entries = Object.values(metabolizers).filter(m => !filterGene || m.gene.includes(filterGene));

  el.innerHTML = `<div class="pgx-root" style="padding:24px" data-test="metabolizer-panel">
    ${PGX_CSS_VARS}
    ${_safetyBanner()}
    ${_geneticNav('/genetic-analyzer/metabolizer')}

    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:12px">
      <div>
        <div style="font-size:18px;font-weight:700;color:var(--text-primary)">Metabolizer Panel</div>
        <div style="font-size:12px;color:var(--text-secondary)">CYP450 activity scores, phenotypes, and CPIC recommendations · ${_SAFE_WORDING.decisionSupport}</div>
      </div>
      <input type="text" placeholder="Filter by gene (e.g. CYP2D6)" value="${esc(filterGene)}" onchange="window._pgxFilterMetabolizer(this.value)" style="padding:7px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg-input);color:var(--text-primary);font-size:12.5px;min-width:180px" data-test="metabolizer-filter">
    </div>

    <!-- Summary Bar -->
    <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:16px">
      ${['Normal','Intermediate','Poor','Ultrarapid'].map(p => {
        const count = entries.filter(e => String(e.phenotype).toLowerCase().includes(p.toLowerCase())).length;
        const color = p==='Normal'?'var(--pgx-normal)':p==='Intermediate'?'var(--pgx-moderate)':'var(--pgx-significant)';
        return `<div class="ch-card" style="padding:10px 14px;display:flex;align-items:center;gap:8px;min-width:120px;flex:1">
          <span class="pgx-severity-dot" style="background:${color}"></span>
          <div>
            <div style="font-size:16px;font-weight:700;color:var(--text-primary)">${count}</div>
            <div style="font-size:10px;color:var(--text-tertiary)">${esc(p)}</div>
          </div>
        </div>`;
      }).join('')}
    </div>

    <!-- Metabolizer Cards -->
    <div class="pgx-metabolizer-grid">
      ${entries.map(m => {
        const scorePct = typeof m.activityScore === 'number' ? (m.activityScore / 2) * 100 : 0;
        const barColor = String(m.phenotype).toLowerCase().includes('normal') ? 'var(--pgx-normal)' :
          String(m.phenotype).toLowerCase().includes('intermediate') ? 'var(--pgx-moderate)' : 'var(--pgx-significant)';
        return `<div class="pgx-gene-card pgx-phenotype-${String(m.phenotype).toLowerCase().includes('normal')?'normal':String(m.phenotype).toLowerCase().includes('intermediate')?'moderate':'significant'}" data-test="metabolizer-panel-card-${esc(m.gene)}">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
            <div>
              <div style="font-size:16px;font-weight:700;color:var(--text-primary)">${esc(m.gene)}</div>
              <div style="font-size:11px;color:var(--text-tertiary);font-family:var(--font-mono)">${esc(m.diplotype||'—')}</div>
            </div>
            ${_phenotypeBadge(m.phenotype)}
          </div>

          <!-- Activity Score Gauge -->
          <div style="margin-bottom:12px;padding:12px;border-radius:8px;background:var(--bg-tertiary)">
            <div style="display:flex;justify-content:space-between;margin-bottom:6px">
              <span style="font-size:11px;font-weight:600;color:var(--text-tertiary)">Activity Score</span>
              <span style="font-size:14px;font-weight:700;color:${barColor}">${m.activityScore !== undefined ? m.activityScore : '—'} <span style="font-size:10px;color:var(--text-tertiary)">/ 2.0</span></span>
            </div>
            <div style="display:flex;align-items:center;gap:8px">
              <span style="font-size:9px;color:var(--text-tertiary)">0</span>
              <div class="pgx-activity-bar" style="flex:1;height:10px"><div class="pgx-activity-fill" style="width:${scorePct}%;background:${barColor}"></div></div>
              <span style="font-size:9px;color:var(--text-tertiary)">2</span>
            </div>
            <div style="margin-top:6px;display:flex;justify-content:space-between;font-size:9px;color:var(--text-tertiary)">
              <span>Poor</span><span>Intermediate</span><span>Normal</span>
            </div>
          </div>

          <!-- Affected Medications -->
          ${m.affectedDrugs && m.affectedDrugs.length > 0 ? `<div style="margin-bottom:10px">
            <div style="font-size:10.5px;font-weight:600;color:var(--text-tertiary);margin-bottom:5px">Affected Medications</div>
            <div style="display:flex;flex-wrap:wrap;gap:3px">
              ${m.affectedDrugs.map(d => `<span style="font-size:10.5px;padding:3px 7px;border-radius:4px;background:var(--bg-tertiary);color:var(--text-secondary);border:1px solid var(--border)">${esc(d)}</span>`).join('')}
            </div>
          </div>` : ''}

          <!-- CPIC Recommendation -->
          ${m.cpicRecommendation ? `<div style="padding:10px;border-radius:6px;background:rgba(139,92,246,0.06);border-left:2px solid #8b5cf6;margin-bottom:8px">
            <div style="font-size:10px;font-weight:700;color:#8b5cf6;margin-bottom:3px">CPIC Recommendation</div>
            <div style="font-size:11px;color:var(--text-secondary);line-height:1.5">${esc(m.cpicRecommendation)}</div>
          </div>` : ''}

          <!-- Badges -->
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
            ${m.fdaLabel ? '<span class="pgx-fda-badge">FDA Label</span>' : ''}
            ${m.evidenceGrade ? _pgxEvidenceBadge(m.evidenceGrade) : ''}
          </div>
        </div>`;
      }).join('')}
    </div>

    <!-- CPIC Reference -->
    <div class="ch-card" style="margin-top:16px">
      <div style="font-size:12.5px;font-weight:700;color:var(--text-primary);margin-bottom:6px">CPIC Guidelines Reference</div>
      <div style="font-size:11px;color:var(--text-secondary);line-height:1.6">
        CPIC (Clinical Pharmacogenetics Implementation Consortium) guidelines provide gene/drug pair-specific
        recommendations based on evidence levels. Grade A evidence indicates high-quality supporting data.
        All recommendations require clinician judgment and patient-specific context. This platform does not
        autonomously dose-adjust or recommend specific medications.
      </div>
    </div>

    ${_crossPageLinks()}
  </div>`;

  window._pgxFilterMetabolizer = (g) => {
    const qs = g ? `?gene=${encodeURIComponent(g)}` : '';
    window.location.hash = `#/genetic-analyzer/metabolizer${qs}`;
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// 5. DRUG INTERACTIONS
// ═════════════════════════════════════════════════════════════════════════════
function _renderDrugInteractions(setTopbar, api, query) {
  setTopbar('Genetic Medication Analyzer — Drug–Gene Interactions', '');
  const el = document.getElementById('content');
  if (!el) return;

  let interactions = _demoDrugInteractions();
  const drugClassFilter = query?.drugClass || '';
  const geneFilter = query?.gene || '';
  const severityFilter = query?.severity || '';
  const sortBy = query?.sort || 'severity';

  if (drugClassFilter) interactions = interactions.filter(i => i.drugClass === drugClassFilter);
  if (geneFilter) interactions = interactions.filter(i => i.gene.toLowerCase().includes(geneFilter.toLowerCase()));
  if (severityFilter) interactions = interactions.filter(i => i.severity === severityFilter);

  const severityOrder = { significant: 0, moderate: 1, normal: 2, unknown: 3 };
  if (sortBy === 'severity') {
    interactions.sort((a, b) => (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9));
  } else if (sortBy === 'drug') {
    interactions.sort((a, b) => a.drug.localeCompare(b.drug));
  } else if (sortBy === 'evidence') {
    interactions.sort((a, b) => a.evidence.localeCompare(b.evidence));
  }

  const drugClasses = [...new Set(_demoDrugInteractions().map(i => i.drugClass))];
  const genes = [...new Set(_demoDrugInteractions().map(i => i.gene))];

  el.innerHTML = `<div class="pgx-root" style="padding:24px" data-test="drug-interactions">
    ${PGX_CSS_VARS}
    ${_safetyBanner()}
    ${_geneticNav('/genetic-analyzer/drug-interactions')}

    <div style="margin-bottom:16px">
      <div style="font-size:18px;font-weight:700;color:var(--text-primary)">Drug–Gene Interactions</div>
      <div style="font-size:12px;color:var(--text-secondary)">${interactions.length} evidence-linked interaction${interactions.length!==1?'s':''} · ${_SAFE_WORDING.mayConsider}</div>
    </div>

    <!-- Filters -->
    <div class="ch-card" style="padding:12px 14px;margin-bottom:16px;display:flex;gap:10px;flex-wrap:wrap;align-items:center">
      <select id="pgx-drug-class" style="padding:7px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg-input);color:var(--text-primary);font-size:12.5px" data-test="filter-drug-class">
        <option value="">All Drug Classes</option>
        ${drugClasses.map(dc => `<option value="${esc(dc)}" ${drugClassFilter===dc?'selected':''}>${esc(dc)}</option>`).join('')}
      </select>
      <select id="pgx-interaction-gene" style="padding:7px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg-input);color:var(--text-primary);font-size:12.5px" data-test="filter-gene">
        <option value="">All Genes</option>
        ${genes.map(g => `<option value="${esc(g)}" ${geneFilter===g?'selected':''}>${esc(g)}</option>`).join('')}
      </select>
      <select id="pgx-severity" style="padding:7px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg-input);color:var(--text-primary);font-size:12.5px" data-test="filter-severity">
        <option value="">All Severities</option>
        <option value="significant" ${severityFilter==='significant'?'selected':''}>Significant</option>
        <option value="moderate" ${severityFilter==='moderate'?'selected':''}>Moderate</option>
        <option value="normal" ${severityFilter==='normal'?'selected':''}>Standard</option>
      </select>
      <select id="pgx-sort" style="padding:7px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg-input);color:var(--text-primary);font-size:12.5px" data-test="filter-sort">
        <option value="severity" ${sortBy==='severity'?'selected':''}>Sort by Severity</option>
        <option value="drug" ${sortBy==='drug'?'selected':''}>Sort by Drug</option>
        <option value="evidence" ${sortBy==='evidence'?'selected':''}>Sort by Evidence</option>
      </select>
      <button class="btn-primary" style="font-size:12px;padding:7px 14px" onclick="window._pgxFilterInteractions()" data-test="btn-filter-ix">Filter</button>
      <button class="btn-secondary" style="font-size:12px;padding:7px 14px" onclick="window._pgxResetInteractions()" data-test="btn-reset-ix">Reset</button>
    </div>

    <!-- Interactions Table -->
    <div class="ch-card" style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead>
          <tr style="border-bottom:1px solid var(--border)">
            <th style="text-align:left;padding:8px 10px;font-weight:600;color:var(--text-tertiary);font-size:11px">Drug</th>
            <th style="text-align:left;padding:8px 10px;font-weight:600;color:var(--text-tertiary);font-size:11px">Class</th>
            <th style="text-align:left;padding:8px 10px;font-weight:600;color:var(--text-tertiary);font-size:11px">Gene</th>
            <th style="text-align:left;padding:8px 10px;font-weight:600;color:var(--text-tertiary);font-size:11px">Interaction Type</th>
            <th style="text-align:left;padding:8px 10px;font-weight:600;color:var(--text-tertiary);font-size:11px">Severity</th>
            <th style="text-align:center;padding:8px 10px;font-weight:600;color:var(--text-tertiary);font-size:11px">Evidence</th>
            <th style="text-align:left;padding:8px 10px;font-weight:600;color:var(--text-tertiary);font-size:11px">Clinical Action</th>
          </tr>
        </thead>
        <tbody>
          ${interactions.length === 0 ? `<tr><td colspan="7" style="padding:32px;text-align:center;color:var(--text-tertiary)">No interactions match your filters.</td></tr>` :
            interactions.map(ix => `<tr style="border-bottom:1px solid var(--border)" class="pgx-interaction-row-${ix.severity}" onmouseover="this.style.background='rgba(0,0,0,0.02)'" onmouseout="this.style.background=''" title="${esc(ix.detail)}">
              <td style="padding:8px 10px;font-weight:600;color:var(--text-primary)">${esc(ix.drug)}</td>
              <td style="padding:8px 10px;font-size:11px;color:var(--text-secondary)">${esc(ix.drugClass)}</td>
              <td style="padding:8px 10px;font-weight:600;color:var(--blue);font-size:11px">${esc(ix.gene)}</td>
              <td style="padding:8px 10px;font-size:11px;color:var(--text-secondary)">${esc(ix.interactionType)}</td>
              <td style="padding:8px 10px">${_severityPill(ix.severity)}</td>
              <td style="padding:8px 10px;text-align:center">${_pgxEvidenceBadge(ix.evidence)}</td>
              <td style="padding:8px 10px">${_clinicalActionPill(ix.clinicalAction)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>

    <!-- Legend -->
    <div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:12px;font-size:11px;color:var(--text-tertiary)">
      <span><span class="pgx-severity-dot pgx-severity-significant"></span> Significant — requires review</span>
      <span><span class="pgx-severity-dot pgx-severity-moderate"></span> Moderate — monitor</span>
      <span><span class="pgx-severity-dot pgx-severity-normal"></span> Standard — no action needed</span>
      <span style="margin-left:auto">Evidence: A = Strong · B = Moderate · C = Limited · D = Insufficient</span>
    </div>

    ${_crossPageLinks()}
  </div>`;

  window._pgxFilterInteractions = () => {
    const drugClass = document.getElementById('pgx-drug-class')?.value || '';
    const gene = document.getElementById('pgx-interaction-gene')?.value || '';
    const severity = document.getElementById('pgx-severity')?.value || '';
    const sort = document.getElementById('pgx-sort')?.value || 'severity';
    const qs = new URLSearchParams({ ...(drugClass && { drugClass }), ...(gene && { gene }), ...(severity && { severity }), ...(sort && { sort }) }).toString();
    window.location.hash = `#/genetic-analyzer/drug-interactions${qs ? '?' + qs : ''}`;
  };
  window._pgxResetInteractions = () => { window.location.hash = '#/genetic-analyzer/drug-interactions'; };
}

// ═════════════════════════════════════════════════════════════════════════════
// 6. NEUROMODULATION GENETICS
// ═════════════════════════════════════════════════════════════════════════════
function _renderNeuromodulationGenetics(setTopbar, api, query) {
  setTopbar('Genetic Medication Analyzer — Neuromodulation Genetics', '');
  const el = document.getElementById('content');
  if (!el) return;

  const data = _demoNeuromodGenetics();

  el.innerHTML = `<div class="pgx-root" style="padding:24px" data-test="neuromod-genetics">
    ${PGX_CSS_VARS}
    ${_safetyBanner()}
    ${_geneticNav('/genetic-analyzer/neuromodulation')}

    <div style="margin-bottom:16px">
      <div style="font-size:18px;font-weight:700;color:var(--text-primary)">Neuromodulation Genetics</div>
      <div style="font-size:12px;color:var(--text-secondary)">Gene variants potentially influencing rTMS and tDCS response · Research-grade evidence</div>
    </div>

    <!-- Research Notice -->
    <div class="ch-card" style="margin-bottom:16px;background:rgba(59,130,246,0.04);border:1px solid rgba(59,130,246,0.15)">
      <div style="font-size:12.5px;color:var(--pgx-research);font-weight:600;margin-bottom:6px">Research-Only Domain</div>
      <div style="font-size:11.5px;color:var(--text-secondary);line-height:1.6">
        Neuromodulation pharmacogenomics is an emerging research area. The associations presented here
        are based on preliminary studies and should <strong>not</strong> be used to select or exclude patients
        from rTMS, tDCS, or other neuromodulation therapies. Clinical indications, contraindications,
        and clinician judgment remain the primary basis for treatment decisions. All findings require
        independent replication before clinical application.
      </div>
    </div>

    <!-- Gene Cards -->
    <div class="pgx-metabolizer-grid">
      ${data.map(n => `<div class="pgx-gene-card ${n.researchOnly ? 'pgx-phenotype-research' : 'pgx-phenotype-moderate'}" data-test="neuromod-card-${esc(n.gene)}">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div>
            <div style="font-size:15px;font-weight:700;color:var(--text-primary)">${esc(n.gene)}</div>
            <div style="font-size:11px;color:var(--text-tertiary)">${esc(n.variant)} · ${esc(n.rsId)}</div>
          </div>
          <div style="display:flex;gap:4px">
            ${n.researchOnly ? '<span class="pgx-research-badge">Research Only</span>' : ''}
            ${_pgxEvidenceBadge(n.evidenceGrade)}
          </div>
        </div>

        <div style="font-size:11px;color:var(--text-secondary);margin-bottom:8px">Genotype: <span style="font-weight:600;color:var(--text-primary)">${esc(n.genotype)}</span></div>

        <!-- Response Indicators -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
          <div style="text-align:center;padding:10px;border-radius:6px;background:var(--bg-tertiary)">
            <div style="font-size:10px;color:var(--text-tertiary);margin-bottom:2px">rTMS Response</div>
            <div style="font-size:14px;font-weight:700;color:${n.tmsResponse==='Favourable'?'var(--pgx-normal)':n.tmsResponse==='Possible'?'var(--pgx-moderate)':'var(--pgx-unknown)'}">${esc(n.tmsResponse)}</div>
          </div>
          <div style="text-align:center;padding:10px;border-radius:6px;background:var(--bg-tertiary)">
            <div style="font-size:10px;color:var(--text-tertiary);margin-bottom:2px">tDCS Response</div>
            <div style="font-size:14px;font-weight:700;color:${n.tdcsResponse==='Favourable'?'var(--pgx-normal)':n.tdcsResponse==='Possible'?'var(--pgx-moderate)':'var(--pgx-unknown)'}">${esc(n.tdcsResponse)}</div>
          </div>
        </div>

        <div style="font-size:11px;color:var(--text-secondary);line-height:1.55">${esc(n.detail)}</div>
      </div>`).join('')}
    </div>

    <!-- Safety Framing -->
    <div class="ch-card" style="margin-top:16px">
      <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:8px">Safety Framing for Clinical Use</div>
      <div style="font-size:11.5px;color:var(--text-secondary);line-height:1.65">
        <p style="margin:0 0 8px">The genetic variants listed above represent preliminary research findings only. They should not:</p>
        <ul style="margin:0 0 8px;padding-left:18px">
          <li>Be used as sole criteria for selecting or excluding patients from neuromodulation therapy</li>
          <li>Replace established clinical assessment, scales, or treatment guidelines</li>
          <li>Override FDA/EMA-approved indications or safety monitoring requirements</li>
          <li>Be presented to patients as predictive of treatment outcome</li>
        </ul>
        <p style="margin:0">Clinicians should continue to base neuromodulation treatment decisions on established clinical criteria, patient history, and evidence-based protocols. Genetic findings may become supplementary context as the evidence base matures.</p>
      </div>
    </div>

    <!-- Cross-links to qEEG/MRI -->
    <div class="ch-card" style="margin-top:16px">
      <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:8px">Related Clinical Tools</div>
      <div style="display:flex;flex-wrap:wrap;gap:10px">
        <a href="/brainmap" style="display:inline-flex;align-items:center;gap:6px;padding:8px 12px;border-radius:6px;background:var(--bg-tertiary);color:var(--blue);font-size:11.5px;font-weight:600;text-decoration:none;border:1px solid var(--border)">qEEG Brainmap →</a>
        <a href="/biomarkers/mri" style="display:inline-flex;align-items:center;gap:6px;padding:8px 12px;border-radius:6px;background:var(--bg-tertiary);color:var(--blue);font-size:11.5px;font-weight:600;text-decoration:none;border:1px solid var(--border)">MRI Analysis →</a>
        <a href="/clinical-tools" style="display:inline-flex;align-items:center:gap:6px;padding:8px 12px;border-radius:6px;background:var(--bg-tertiary);color:var(--blue);font-size:11.5px;font-weight:600;text-decoration:none;border:1px solid var(--border)">Clinical Tools →</a>
      </div>
    </div>

    ${_crossPageLinks()}
  </div>`;
}

// ═════════════════════════════════════════════════════════════════════════════
// 7. NUTRITION GENETICS
// ═════════════════════════════════════════════════════════════════════════════
function _renderNutritionGenetics(setTopbar, api, query) {
  setTopbar('Genetic Medication Analyzer — Nutrition Genetics', '');
  const el = document.getElementById('content');
  if (!el) return;

  const data = _demoNutritionGenetics();

  el.innerHTML = `<div class="pgx-root" style="padding:24px" data-test="nutrition-genetics">
    ${PGX_CSS_VARS}
    ${_safetyBanner()}
    ${_geneticNav('/genetic-analyzer/nutrition')}

    <div style="margin-bottom:16px">
      <div style="font-size:18px;font-weight:700;color:var(--text-primary)">Nutrition Genetics</div>
      <div style="font-size:12px;color:var(--text-secondary)">MTHFR, methylation, micronutrient genetics · Dietary planning support</div>
    </div>

    <!-- MTHFR Panel -->
    <div class="ch-card" style="margin-bottom:16px">
      <div style="font-size:14px;font-weight:700;color:var(--text-primary);margin-bottom:12px">MTHFR Panel — Folate Metabolism</div>
      <div class="pgx-metabolizer-grid">
        ${data.mthfr.map(m => `<div class="pgx-gene-card" data-test="mthfr-panel-${esc(m.variant)}">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <div>
              <div style="font-size:15px;font-weight:700;color:var(--text-primary)">MTHFR ${esc(m.variant)}</div>
              <div style="font-size:11px;color:var(--text-tertiary);font-family:var(--font-mono)">${esc(m.rsId)} · ${esc(m.genotype)}</div>
            </div>
            ${_pgxEvidenceBadge(m.evidenceGrade)}
          </div>
          <div style="margin-bottom:10px">
            <div style="display:flex;justify-content:space-between;margin-bottom:4px">
              <span style="font-size:11px;font-weight:600;color:var(--text-tertiary)">Predicted Enzyme Activity</span>
              <span style="font-size:13px;font-weight:700;color:${m.enzymeActivity>=90?'var(--pgx-normal)':m.enzymeActivity>=60?'var(--pgx-moderate)':'var(--pgx-significant)'}">${m.enzymeActivity}%</span>
            </div>
            <div class="pgx-activity-bar" style="height:10px"><div class="pgx-activity-fill" style="width:${m.enzymeActivity}%;background:${m.enzymeActivity>=90?'var(--pgx-normal)':m.enzymeActivity>=60?'var(--pgx-moderate)':'var(--pgx-significant)'}"></div></div>
            <div style="margin-top:4px;display:flex;justify-content:space-between;font-size:9px;color:var(--text-tertiary)">
              <span>0%</span><span>50%</span><span>100%</span>
            </div>
          </div>
          <div style="padding:8px;border-radius:6px;background:rgba(245,158,11,0.06);border-left:2px solid var(--pgx-moderate)">
            <div style="font-size:11px;color:var(--text-secondary);line-height:1.5"><strong>Consideration:</strong> ${esc(m.recommendation)}</div>
          </div>
        </div>`).join('')}
      </div>
    </div>

    <!-- Methylation Pathway Diagram -->
    <div class="ch-card" style="margin-bottom:16px">
      <div style="font-size:14px;font-weight:700;color:var(--text-primary);margin-bottom:10px">Methylation Pathway</div>
      <div class="pgx-ascii-diagram">
┌─────────────────────────────────────────────────────────────────────────┐
│                         METHYLATION PATHWAY                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   Dietary Folate ──┐                                                    │
│                    ▼                                                    │
│              ┌──────────┐     MTHFR C677T     ┌──────────┐             │
│              │  DHF →   │ ──────────────────→ │  5-MTHF  │             │
│              │  THF     │   [70% activity]    │ (active) │             │
│              └──────────┘                     └────┬─────┘             │
│                    ▲                               │                    │
│                    └────────── B2 (Riboflavin) ◄───┘                    │
│                                                                         │
│   5-MTHF ──→ Methionine Synthase (B12-dependent) ──→ Methionine        │
│                                                                         │
│   Methionine ──→ SAMe ──→ DNA Methylation ──→ Gene Expression          │
│                      │                                                  │
│                      └──→ Neurotransmitter Synthesis                    │
│                           (Serotonin, Dopamine, Norepinephrine)         │
│                                                                         │
│   Homocysteine ◄─── Methionine ──► SAMe ──► SAH ──► Homocysteine      │
│        │                                                     │          │
│        └──────── CBS (B6-dependent) ──→ Cystathionine ──────┘          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
      </div>
      <div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:8px">
        <span style="font-size:10px;padding:3px 8px;border-radius:4px;background:rgba(34,197,94,0.10);color:var(--pgx-normal)">B2 (Riboflavin) — MTHFR cofactor</span>
        <span style="font-size:10px;padding:3px 8px;border-radius:4px;background:rgba(59,130,246,0.10);color:var(--blue)">B12 (Methylcobalamin) — Methionine synthase</span>
        <span style="font-size:10px;padding:3px 8px;border-radius:4px;background:rgba(245,158,11,0.10);color:var(--pgx-moderate)">B6 (Pyridoxine) — CBS pathway</span>
        <span style="font-size:10px;padding:3px 8px;border-radius:4px;background:rgba(139,92,246,0.10);color:#8b5cf6">Folate — One-carbon donor</span>
      </div>
    </div>

    <!-- B12 / Folate Recommendations -->
    <div class="ch-card" style="margin-bottom:16px">
      <div style="font-size:14px;font-weight:700;color:var(--text-primary);margin-bottom:12px">B12 / Folate Status & Recommendations</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:12px">
        <div style="text-align:center;padding:14px;border-radius:8px;background:var(--bg-tertiary)">
          <div style="font-size:10px;color:var(--text-tertiary);margin-bottom:4px">B12 Status</div>
          <div style="font-size:18px;font-weight:700;color:var(--pgx-normal)">${esc(data.b12Folate.b12Status)}</div>
        </div>
        <div style="text-align:center;padding:14px;border-radius:8px;background:var(--bg-tertiary)">
          <div style="font-size:10px;color:var(--text-tertiary);margin-bottom:4px">Folate Status</div>
          <div style="font-size:18px;font-weight:700;color:var(--pgx-moderate)">${esc(data.b12Folate.folateStatus)}</div>
        </div>
        <div style="text-align:center;padding:14px;border-radius:8px;background:var(--bg-tertiary)">
          <div style="font-size:10px;color:var(--text-tertiary);margin-bottom:4px">Homocysteine</div>
          <div style="font-size:18px;font-weight:700;color:var(--pgx-moderate)">${esc(data.b12Folate.homocysteine)}</div>
        </div>
      </div>
      <div style="padding:10px;border-radius:6px;background:rgba(245,158,11,0.06);border-left:3px solid var(--pgx-moderate)">
        <div style="font-size:11.5px;color:var(--text-secondary);line-height:1.6">
          <strong>Clinical consideration:</strong> ${esc(data.b12Folate.recommendation)}
          MTHFR variants may affect folate metabolism efficiency. Methylfolate (5-MTHF) bypasses the MTHFR
          enzyme step and may be considered. B12 status should be assessed simultaneously as B12 deficiency
          can mask folate deficiency and impair methylation regardless of MTHFR genotype.
        </div>
      </div>
    </div>

    <!-- Micronutrient Genetics -->
    <div class="ch-card" style="margin-bottom:16px">
      <div style="font-size:14px;font-weight:700;color:var(--text-primary);margin-bottom:12px">Micronutrient Genetics</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px">
        ${[
          { title: 'Omega-3 Conversion', icon: '🐟', gene: data.omega3.gene, variant: data.omega3.variant, genotype: data.omega3.genotype, detail: `Conversion efficiency: ${data.omega3.conversionEfficiency}`, rec: data.omega3.recommendation, color: 'var(--blue)' },
          { title: 'Vitamin D Binding', icon: '☀', gene: data.vitaminD.gene, variant: data.vitaminD.variant, genotype: data.vitaminD.genotype, detail: `Binding protein: ${data.vitaminD.bindingProtein}`, rec: data.vitaminD.recommendation, color: 'var(--amber)' },
          { title: 'Zinc Transport', icon: '⚡', gene: data.zinc.gene, variant: data.zinc.variant, genotype: data.zinc.genotype, detail: `Transport: ${data.zinc.transport}`, rec: data.zinc.recommendation, color: 'var(--teal)' },
          { title: 'Magnesium Channel', icon: '🔋', gene: data.magnesium.gene, variant: data.magnesium.variant, genotype: data.magnesium.genotype, detail: `Channel function: ${data.magnesium.channelFunction}`, rec: data.magnesium.recommendation, color: 'var(--green)' },
        ].map(item => `<div class="pgx-gene-card" data-test="nutrition-card-${esc(item.title.toLowerCase().replace(/\s+/g,'-'))}">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
            <span style="font-size:18px">${esc(item.icon)}</span>
            <div>
              <div style="font-size:13px;font-weight:700;color:var(--text-primary)">${esc(item.title)}</div>
              <div style="font-size:10px;color:var(--blue);font-family:var(--font-mono)">${esc(item.gene)} · ${esc(item.variant)}</div>
            </div>
          </div>
          <div style="font-size:11px;color:var(--text-secondary);margin-bottom:4px">Genotype: <strong>${esc(item.genotype)}</strong></div>
          <div style="font-size:11px;color:var(--text-secondary);margin-bottom:6px">${esc(item.detail)}</div>
          <div style="padding:6px 8px;border-radius:5px;background:${esc(item.color)}10;border-left:2px solid ${esc(item.color)}">
            <div style="font-size:10.5px;color:var(--text-secondary);line-height:1.45">${esc(item.rec)}</div>
          </div>
        </div>`).join('')}
      </div>
    </div>

    <!-- Dietary Considerations -->
    <div class="ch-card">
      <div style="font-size:14px;font-weight:700;color:var(--text-primary);margin-bottom:10px">Dietary Considerations Summary</div>
      <div style="font-size:11.5px;color:var(--text-secondary);line-height:1.65">
        <p style="margin:0 0 8px">
          Nutritional genetics provides supportive context for dietary planning. The following considerations
          may be discussed with a qualified nutrition professional:
        </p>
        <ul style="margin:0 0 8px;padding-left:18px">
          <li><strong>Methylfolate supplementation</strong> may be considered given MTHFR C677T heterozygous status and borderline homocysteine.</li>
          <li><strong>B12 monitoring</strong> is recommended alongside folate assessment to ensure adequate methylation capacity.</li>
          <li><strong>Omega-3 intake:</strong> Direct EPA/DHA sources (fatty fish, algae supplements) may be more efficient given intermediate FADS1 conversion.</li>
          <li><strong>Vitamin D:</strong> Monitor 25-OH vitamin D levels; supplementation needs may be higher given GC variant.</li>
          <li><strong>Zinc and magnesium:</strong> Standard dietary intake appears adequate based on current genetic profile.</li>
        </ul>
        <p style="margin:0;font-size:11px;color:var(--text-tertiary)">
          These are general considerations based on genetic profile only. Individual dietary needs vary based on
          clinical status, medications, lifestyle, and laboratory values. Consult a registered dietitian or
          clinician for personalised recommendations.
        </p>
      </div>
    </div>

    ${_crossPageLinks()}
  </div>`;
}

// ═════════════════════════════════════════════════════════════════════════════
// 8. GENETIC REPORTS
// ═════════════════════════════════════════════════════════════════════════════
function _renderGeneticReports(setTopbar, api, query) {
  setTopbar('Genetic Medication Analyzer — Reports', '');
  const el = document.getElementById('content');
  if (!el) return;

  const reports = _demoGeneticReports();
  const profiles = _demoGeneticProfiles();

  el.innerHTML = `<div class="pgx-root" style="padding:24px" data-test="genetic-reports">
    ${PGX_CSS_VARS}
    ${_safetyBanner()}
    ${_geneticNav('/genetic-analyzer/reports')}

    <div style="margin-bottom:16px">
      <div style="font-size:18px;font-weight:700;color:var(--text-primary)">Genetic Reports</div>
      <div style="font-size:12px;color:var(--text-secondary)">Generate and download pharmacogenomic reports · Safety disclaimer on every page</div>
    </div>

    <!-- Report Generation Form -->
    <div class="ch-card" style="margin-bottom:20px" data-test="report-form">
      <div style="font-size:14px;font-weight:700;color:var(--text-primary);margin-bottom:12px">Generate New Report</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:12px">
        <div>
          <label style="display:block;font-size:11px;font-weight:600;color:var(--text-tertiary);margin-bottom:4px">Profile</label>
          <select id="pgx-report-profile" style="width:100%;padding:7px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg-input);color:var(--text-primary);font-size:12.5px" data-test="report-profile-select">
            ${profiles.map(p => `<option value="${esc(p.id)}">${esc(p.patientName)} — ${esc(p.profileName)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label style="display:block;font-size:11px;font-weight:600;color:var(--text-tertiary);margin-bottom:4px">Report Type</label>
          <select id="pgx-report-type" style="width:100%;padding:7px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg-input);color:var(--text-primary);font-size:12.5px" data-test="report-type">
            <option value="clinical">Clinical (full detail)</option>
            <option value="patient">Patient-friendly (simplified)</option>
          </select>
        </div>
        <div>
          <label style="display:block;font-size:11px;font-weight:600;color:var(--text-tertiary);margin-bottom:4px">Format</label>
          <select id="pgx-report-format" style="width:100%;padding:7px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg-input);color:var(--text-primary);font-size:12.5px" data-test="report-format">
            <option value="PDF">PDF</option>
            <option value="HTML">HTML</option>
          </select>
        </div>
      </div>
      <div style="margin-bottom:12px">
        <label style="display:block;font-size:11px;font-weight:600;color:var(--text-tertiary);margin-bottom:6px">Sections to Include</label>
        <div style="display:flex;flex-wrap:wrap;gap:10px">
          ${['Variants','Metabolizer Status','Drug Interactions','Side Effect Risks','Neuromodulation','Nutrition'].map(s => `
            <label style="display:flex;align-items:center;gap:5px;font-size:12px;color:var(--text-secondary);cursor:pointer">
              <input type="checkbox" class="pgx-report-section" value="${esc(s)}" checked style="accent-color:var(--blue)"> ${esc(s)}
            </label>
          `).join('')}
        </div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn-primary" style="font-size:12px;padding:8px 16px" onclick="window._pgxGenerateReportSubmit()" data-test="btn-generate-submit">Generate Report</button>
        <span style="font-size:11px;color:var(--text-tertiary)">Safety disclaimer included automatically</span>
      </div>
    </div>

    <!-- Generated Reports List -->
    <div class="ch-card" data-test="reports-list">
      <div style="font-size:14px;font-weight:700;color:var(--text-primary);margin-bottom:12px">Generated Reports — ${reports.length}</div>
      ${reports.length === 0 ? '<div style="text-align:center;padding:24px;color:var(--text-tertiary)">No reports generated yet.</div>' :
        `<div style="display:flex;flex-direction:column;gap:8px">
          ${reports.map(r => {
            const profile = profiles.find(p => p.id === r.profileId) || {};
            return `<div class="ch-card" style="display:flex;align-items:center;gap:12px;padding:12px 14px" data-test="report-item-${esc(r.id)}">
              <div style="font-size:24px">${r.format==='PDF'?'📄':'🌐'}</div>
              <div style="flex:1;min-width:0">
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                  <span style="font-size:13px;font-weight:600;color:var(--text-primary)">${esc(r.type==='clinical'?'Clinical':'Patient-Friendly')} Report</span>
                  <span style="font-size:10px;padding:2px 7px;border-radius:4px;background:var(--bg-tertiary);color:var(--text-secondary)">${esc(r.format)}</span>
                  ${_statusBadge(r.status)}
                </div>
                <div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">
                  ${esc(profile.patientName || r.profileId)} · ${esc(r.sections.join(', '))} · ${esc(fmtDate(r.generatedAt))} · by ${esc(r.generatedBy)}
                </div>
              </div>
              <div style="display:flex;gap:6px">
                <button class="btn-secondary" style="font-size:11px;padding:4px 10px" onclick="window._pgxPreviewReport('${esc(r.id)}')" data-test="btn-preview-${esc(r.id)}">Preview</button>
                <button class="btn-primary" style="font-size:11px;padding:4px 10px" onclick="window._pgxDownloadReport('${esc(r.id)}')" data-test="btn-download-${esc(r.id)}">Download</button>
              </div>
            </div>`;
          }).join('')}
        </div>`}
    </div>

    <!-- Safety Disclaimer Block -->
    <div class="ch-card" style="margin-top:16px;background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.25)">
      <div style="font-size:12.5px;font-weight:700;color:var(--pgx-moderate);margin-bottom:6px">Report Safety Disclaimer</div>
      <div style="font-size:11.5px;color:var(--text-secondary);line-height:1.65">
        Every generated report includes the following safety disclaimer on every page:
        <blockquote style="margin:8px 0;padding:10px 12px;border-left:3px solid var(--pgx-moderate);background:rgba(0,0,0,0.03);font-size:11px;color:var(--text-secondary);border-radius:0 6px 6px 0">
          "This report provides pharmacogenomic findings for decision support only. All findings require
          review by a qualified clinician or pharmacist. This report does not prescribe, dose-adjust,
          or autonomously recommend medications. Genetic findings are one component of patient care
          and should be integrated with clinical assessment, laboratory values, and patient history."
        </blockquote>
      </div>
    </div>

    ${_crossPageLinks()}
  </div>`;

  // Attach handlers
  window._pgxGenerateReportSubmit = () => {
    const profileId = document.getElementById('pgx-report-profile')?.value;
    const type = document.getElementById('pgx-report-type')?.value;
    const format = document.getElementById('pgx-report-format')?.value;
    const sections = Array.from(document.querySelectorAll('.pgx-report-section:checked')).map(cb => cb.value);
    alert(`Report generation requested:\nProfile: ${profileId}\nType: ${type}\nFormat: ${format}\nSections: ${sections.join(', ')}\n\n(Demo: report would be generated and queued for download)`);
  };
  window._pgxPreviewReport = (id) => {
    const report = _demoGeneticReports().find(r => r.id === id);
    if (!report) return;
    const profile = _demoGeneticProfiles().find(p => p.id === report.profileId) || {};
    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
    modal.innerHTML = `<div style="background:var(--bg-card);border-radius:12px;max-width:640px;width:100%;max-height:80vh;overflow-y:auto;padding:24px;box-shadow:0 8px 32px rgba(0,0,0,0.3)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <div style="font-size:16px;font-weight:700;color:var(--text-primary)">Report Preview — ${esc(report.id)}</div>
        <button onclick="this.closest('.pgx-modal').remove()" style="background:none;border:none;font-size:20px;color:var(--text-tertiary);cursor:pointer">&times;</button>
      </div>
      <div class="pgx-safety-banner" style="margin-bottom:12px">
        <strong>Decision support only.</strong> Pharmacogenomic findings require clinician/pharmacist review.
      </div>
      <div style="font-size:12px;color:var(--text-secondary);line-height:1.65;margin-bottom:16px">
        <p><strong>Patient:</strong> ${esc(profile.patientName || report.profileId)}<br>
        <strong>Profile:</strong> ${esc(profile.profileName || '—')}<br>
        <strong>Type:</strong> ${esc(report.type==='clinical'?'Clinical':'Patient-Friendly')}<br>
        <strong>Sections:</strong> ${esc(report.sections.join(', '))}<br>
        <strong>Generated:</strong> ${esc(fmtDate(report.generatedAt))} by ${esc(report.generatedBy)}</p>
        <hr style="border:none;border-top:1px solid var(--border);margin:12px 0">
        <p style="color:var(--text-tertiary);font-style:italic">Full report content would appear here in the actual implementation.</p>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn-secondary" style="font-size:12px;padding:6px 12px" onclick="this.closest('.pgx-modal').remove()">Close</button>
        <button class="btn-primary" style="font-size:12px;padding:6px 12px" onclick="window._pgxDownloadReport('${esc(id)}')">Download ${esc(report.format)}</button>
      </div>
    </div>`;
    modal.className = 'pgx-modal';
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  };
  window._pgxDownloadReport = (id) => {
    alert(`Report ${id} download started. (Demo: file would be generated and downloaded)`);
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// TEST API — Exposed for automated testing
// ═════════════════════════════════════════════════════════════════════════════
if (typeof window !== 'undefined') {
  window.__geneticAnalyzerTestApi__ = {
    renderPage,
    _demoGeneticProfiles,
    _demoMetabolizerData,
    _demoDrugInteractions,
    _demoVariants,
    _demoNeuromodGenetics,
    _demoNutritionGenetics,
    _demoGeneticReports,
    _demoAuditLog,
    _demoActivityFeed,
    _phenotypeBadge,
    _severityPill,
    _clinicalActionPill,
    _pgxEvidenceBadge,
    _statusBadge,
    _safetyBanner,
    _kpiCard,
    _crossPageLinks,
    _geneticNav,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// ADDITIONAL HELPER FUNCTIONS AND ADVANCED FEATURES
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Generate a radar chart SVG for gene coverage visualization.
 * Shows how many of the key pharmacogenes are covered by a profile.
 */
function _geneCoverageRadarSVG(coveredGenes, totalGenesList) {
  const size = 220;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 80;
  const count = totalGenesList.length;
  if (count === 0) return '';

  const angleStep = (2 * Math.PI) / count;
  const points = totalGenesList.map((gene, i) => {
    const isCovered = coveredGenes.includes(gene);
    const r = isCovered ? radius : radius * 0.3;
    const angle = i * angleStep - Math.PI / 2;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    return { x, y, gene, isCovered };
  });

  const polygonPoints = points.map(p => `${p.x},${p.y}`).join(' ');
  const geneLabels = points.map((p, i) => {
    const angle = i * angleStep - Math.PI / 2;
    const lx = cx + (radius + 16) * Math.cos(angle);
    const ly = cy + (radius + 16) * Math.sin(angle);
    const anchor = lx > cx ? 'start' : lx < cx ? 'end' : 'middle';
    const baseline = ly > cy ? 'hanging' : ly < cy ? 'baseline' : 'middle';
    return `<text x="${lx}" y="${ly}" text-anchor="${anchor}" dominant-baseline="${baseline}" fill="${p.isCovered ? 'var(--blue)' : 'var(--text-tertiary)'}" font-size="8" font-weight="${p.isCovered ? '600' : '400'}">${esc(p.gene)}</text>`;
  }).join('');

  const dotPoints = points.filter(p => p.isCovered).map(p =>
    `<circle cx="${p.x}" cy="${p.y}" r="3" fill="var(--blue)" />`
  ).join('');

  return `<svg viewBox="0 0 ${size} ${size}" style="width:100%;max-width:${size}px;margin:0 auto;display:block">
    <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="var(--border)" stroke-width="1" />
    <circle cx="${cx}" cy="${cy}" r="${radius * 0.66}" fill="none" stroke="var(--border)" stroke-width="0.5" stroke-dasharray="3,3" />
    <circle cx="${cx}" cy="${cy}" r="${radius * 0.33}" fill="none" stroke="var(--border)" stroke-width="0.5" stroke-dasharray="3,3" />
    <polygon points="${polygonPoints}" fill="rgba(59,130,246,0.08)" stroke="var(--blue)" stroke-width="1.5" />
    ${dotPoints}
    ${geneLabels}
  </svg>`;
}

/**
 * Build a detailed metabolizer comparison table between multiple profiles.
 * Used for family/twin studies or longitudinal comparison.
 */
function _buildMetabolizerComparisonTable(profileIds) {
  const profiles = _demoGeneticProfiles().filter(p => profileIds.includes(p.id));
  const allGenes = [...new Set(profiles.flatMap(p => Object.keys(p.metabolizers || {})))];

  if (allGenes.length === 0 || profiles.length === 0) {
    return '<div class="ch-card" style="padding:16px;text-align:center;color:var(--text-tertiary)">No metabolizer data for comparison.</div>';
  }

  return `<div class="ch-card" style="overflow-x:auto">
    <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:10px">Metabolizer Comparison</div>
    <table style="width:100%;border-collapse:collapse;font-size:11.5px">
      <thead>
        <tr style="border-bottom:1px solid var(--border)">
          <th style="text-align:left;padding:6px 8px;font-weight:600;color:var(--text-tertiary)">Gene</th>
          ${profiles.map(p => `<th style="text-align:center;padding:6px 8px;font-weight:600;color:var(--text-tertiary);font-size:10px">${esc(p.patientName)}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${allGenes.map(gene => {
          const fullData = _demoMetabolizerData()[gene];
          return `<tr style="border-bottom:1px solid var(--border)">
            <td style="padding:6px 8px;font-weight:600;color:var(--blue);font-size:10.5px">${esc(gene)}</td>
            ${profiles.map(p => {
              const pheno = (p.metabolizers || {})[gene] || '—';
              const score = fullData?.activityScore;
              return `<td style="padding:6px 8px;text-align:center">${_phenotypeBadge(pheno)}${score !== undefined ? `<div style="font-size:9px;color:var(--text-tertiary);margin-top:2px">AS: ${score}</div>` : ''}</td>`;
            }).join('')}
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>`;
}

/**
 * Build a comprehensive drug-gene interaction matrix heatmap.
 * Returns an HTML table with color-coded cells.
 */
function _buildInteractionMatrix(genes, drugs) {
  const allInteractions = _demoDrugInteractions();
  const interactionsMap = {};
  allInteractions.forEach(ix => {
    const key = `${ix.gene}|${ix.drug}`;
    interactionsMap[key] = ix;
  });

  return `<div class="ch-card" style="overflow-x:auto">
    <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:10px">Drug–Gene Interaction Matrix</div>
    <table style="width:100%;border-collapse:collapse;font-size:10.5px">
      <thead>
        <tr style="border-bottom:1px solid var(--border)">
          <th style="text-align:left;padding:5px 7px;font-weight:600;color:var(--text-tertiary);font-size:10px">Drug \ Gene</th>
          ${genes.map(g => `<th style="text-align:center;padding:5px 7px;font-weight:600;color:var(--text-tertiary);font-size:9px;writing-mode:vertical-rl;transform:rotate(180deg)">${esc(g)}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${drugs.map(drug => `<tr style="border-bottom:1px solid var(--border)">
          <td style="padding:5px 7px;font-weight:600;color:var(--text-primary);font-size:10px;white-space:nowrap">${esc(drug)}</td>
          ${genes.map(gene => {
            const ix = interactionsMap[`${gene}|${drug}`];
            if (!ix) return `<td style="padding:5px 7px;text-align:center"><span style="font-size:10px;color:var(--text-tertiary)">—</span></td>`;
            const color = ix.severity === 'significant' ? 'var(--pgx-significant)' : ix.severity === 'moderate' ? 'var(--pgx-moderate)' : 'var(--pgx-normal)';
            const bg = ix.severity === 'significant' ? 'var(--pgx-significant-bg)' : ix.severity === 'moderate' ? 'var(--pgx-moderate-bg)' : 'var(--pgx-normal-bg)';
            return `<td style="padding:5px 7px;text-align:center" title="${esc(ix.detail)}">
              <span style="display:inline-block;width:20px;height:20px;border-radius:4px;background:${bg};color:${color};font-size:8px;font-weight:700;line-height:20px">${esc(ix.evidence)}</span>
            </td>`;
          }).join('')}
        </tr>`).join('')}
      </tbody>
    </table>
    <div style="margin-top:8px;display:flex;gap:10px;font-size:10px;color:var(--text-tertiary)">
      <span><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:var(--pgx-normal-bg);border:1px solid var(--pgx-normal);vertical-align:middle"></span> Standard</span>
      <span><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:var(--pgx-moderate-bg);border:1px solid var(--pgx-moderate);vertical-align:middle"></span> Moderate</span>
      <span><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:var(--pgx-significant-bg);border:1px solid var(--pgx-significant);vertical-align:middle"></span> Significant</span>
      <span style="margin-left:auto">Cell shows evidence grade (A/B/C/D)</span>
    </div>
  </div>`;
}

/**
 * Render a comprehensive PDF-style report preview as HTML.
 * This is the full clinical report template used for report generation.
 */
function _renderFullReportPreviewHTML(report, profile) {
  const variants = _demoVariants().filter(v => profile.genesTested.includes(v.gene));
  const metabolizers = Object.entries(profile.metabolizers || {}).map(([gene, phenotype]) => {
    const fullData = _demoMetabolizerData()[gene];
    return { gene, phenotype, ...(fullData || {}) };
  });
  const interactions = _demoDrugInteractions().filter(i => profile.genesTested.includes(i.gene));

  return `<div style="max-width:700px;margin:0 auto;font-size:12px;line-height:1.6;color:var(--text-primary)">
    <!-- Report Header -->
    <div style="text-align:center;padding-bottom:16px;border-bottom:2px solid var(--blue);margin-bottom:20px">
      <div style="font-size:18px;font-weight:700;color:var(--blue)">DeepSynaps Genetic Medication Analyzer</div>
      <div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-top:4px">${esc(report.type==='clinical'?'Clinical Pharmacogenomic Report':'Patient-Friendly Genetic Summary')}</div>
      <div style="font-size:10.5px;color:var(--text-tertiary);margin-top:4px">Report ID: ${esc(report.id)} · Generated: ${esc(fmtDate(report.generatedAt))}</div>
    </div>

    <!-- Safety Banner -->
    <div class="pgx-safety-banner" style="margin-bottom:20px">
      <strong>Decision support only.</strong> This report provides pharmacogenomic findings for supportive context.
      All findings require review by a qualified clinician or pharmacist. This report does not prescribe,
      dose-adjust, or autonomously recommend medications.
    </div>

    <!-- Patient Info Section -->
    <div style="margin-bottom:20px">
      <div style="font-size:14px;font-weight:700;color:var(--text-primary);margin-bottom:8px;border-bottom:1px solid var(--border);padding-bottom:4px">Patient & Profile Information</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:11.5px">
        <div><strong>Patient:</strong> ${esc(profile.patientName)}</div>
        <div><strong>Patient ID:</strong> ${esc(profile.patientId)}</div>
        <div><strong>Profile:</strong> ${esc(profile.profileName)}</div>
        <div><strong>Profile ID:</strong> ${esc(profile.id)}</div>
        <div><strong>Source:</strong> ${esc(profile.source)}</div>
        <div><strong>Created:</strong> ${esc(fmtDateOnly(profile.createdAt))}</div>
        <div><strong>Genes Tested:</strong> ${profile.genesTested.length}</div>
        <div><strong>Status:</strong> ${esc(profile.status)}</div>
      </div>
    </div>

    <!-- Executive Summary -->
    <div style="margin-bottom:20px">
      <div style="font-size:14px;font-weight:700;color:var(--text-primary);margin-bottom:8px;border-bottom:1px solid var(--border);padding-bottom:4px">Executive Summary</div>
      <div style="font-size:11.5px;color:var(--text-secondary);line-height:1.65">
        <p>This pharmacogenomic profile tests ${profile.genesTested.length} genes relevant to medication metabolism,
        response, and adverse effect risk. Key findings include:</p>
        <ul style="padding-left:18px;margin:6px 0">
          ${metabolizers.filter(m => !String(m.phenotype).toLowerCase().includes('normal')).map(m =>
            `<li><strong>${esc(m.gene)}:</strong> ${esc(m.phenotype)} (activity score: ${m.activityScore !== undefined ? m.activityScore : 'N/A'}) — may affect ${m.affectedDrugs ? m.affectedDrugs.slice(0,3).join(', ') : 'relevant medications'}</li>`
          ).join('')}
          ${interactions.filter(ix => ix.severity === 'significant').slice(0,3).map(ix =>
            `<li><strong>Interaction:</strong> ${esc(ix.drug)} × ${esc(ix.gene)} — ${esc(ix.interactionType)} (${esc(ix.evidence)} evidence)</li>`
          ).join('')}
        </ul>
        <p style="margin:0;font-size:11px;color:var(--text-tertiary)">
          ${_SAFE_WORDING.supportiveContext} Consult a pharmacist or clinician trained in pharmacogenomics for interpretation.
        </p>
      </div>
    </div>

    <!-- Metabolizer Status Section -->
    ${report.sections.includes('Metabolizer Status') ? `<div style="margin-bottom:20px">
      <div style="font-size:14px;font-weight:700;color:var(--text-primary);margin-bottom:8px;border-bottom:1px solid var(--border);padding-bottom:4px">Metabolizer Status</div>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${metabolizers.map(m => `<div style="padding:10px;border-radius:6px;border-left:3px solid ${String(m.phenotype).toLowerCase().includes('normal')?'var(--pgx-normal)':String(m.phenotype).toLowerCase().includes('intermediate')?'var(--pgx-moderate)':'var(--pgx-significant)'};background:var(--bg-tertiary)">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="font-size:12px;font-weight:700">${esc(m.gene)} — ${esc(m.diplotype||'—')}</span>
            <span>${_phenotypeBadge(m.phenotype)}</span>
          </div>
          ${m.cpicRecommendation ? `<div style="font-size:10.5px;color:var(--text-secondary);margin-top:4px"><strong>CPIC:</strong> ${esc(m.cpicRecommendation)}</div>` : ''}
          ${m.fdaLabel ? '<span class="pgx-fda-badge">FDA Label</span>' : ''} ${_pgxEvidenceBadge(m.evidenceGrade||'C')}
        </div>`).join('')}
      </div>
    </div>` : ''}

    <!-- Drug Interactions Section -->
    ${report.sections.includes('Drug Interactions') ? `<div style="margin-bottom:20px">
      <div style="font-size:14px;font-weight:700;color:var(--text-primary);margin-bottom:8px;border-bottom:1px solid var(--border);padding-bottom:4px">Drug–Gene Interactions</div>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${interactions.map(ix => `<div style="padding:8px 10px;border-radius:6px;background:var(--bg-tertiary);display:flex;align-items:center;gap:8px">
          ${_severityPill(ix.severity)}
          <span style="font-size:11px;font-weight:600">${esc(ix.drug)} × ${esc(ix.gene)}</span>
          <span style="font-size:10px;color:var(--text-tertiary)">${esc(ix.interactionType)}</span>
          <span style="margin-left:auto">${_pgxEvidenceBadge(ix.evidence)}</span>
        </div>`).join('')}
      </div>
    </div>` : ''}

    <!-- Variants Section -->
    ${report.sections.includes('Variants') ? `<div style="margin-bottom:20px">
      <div style="font-size:14px;font-weight:700;color:var(--text-primary);margin-bottom:8px;border-bottom:1px solid var(--border);padding-bottom:4px">Genetic Variants</div>
      <table style="width:100%;border-collapse:collapse;font-size:10.5px">
        <thead><tr style="border-bottom:1px solid var(--border)">
          <th style="text-align:left;padding:5px 7px;color:var(--text-tertiary)">Gene</th>
          <th style="text-align:left;padding:5px 7px;color:var(--text-tertiary)">Variant</th>
          <th style="text-align:left;padding:5px 7px;color:var(--text-tertiary)">Genotype</th>
          <th style="text-align:left;padding:5px 7px;color:var(--text-tertiary)">rsID</th>
          <th style="text-align:left;padding:5px 7px;color:var(--text-tertiary)">Phenotype</th>
        </tr></thead>
        <tbody>
          ${variants.map(v => `<tr style="border-bottom:1px solid var(--border)">
            <td style="padding:5px 7px;font-weight:600;color:var(--blue);font-size:10px">${esc(v.gene)}</td>
            <td style="padding:5px 7px">${esc(v.variant)}</td>
            <td style="padding:5px 7px">${esc(v.genotype)}</td>
            <td style="padding:5px 7px;font-family:var(--font-mono);font-size:9px;color:var(--text-tertiary)">${esc(v.rsId)}</td>
            <td style="padding:5px 7px">${_phenotypeBadge(v.phenotype)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>` : ''}

    <!-- Closing Safety Disclaimer -->
    <div style="margin-top:24px;padding:12px 14px;border-radius:8px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.30);font-size:11px;line-height:1.6;color:var(--text-secondary)">
      <strong style="color:var(--pgx-moderate)">Important Safety Information:</strong>
      This report is generated for decision support purposes only. Pharmacogenomic testing provides one
      component of patient care. Treatment decisions should incorporate clinical assessment, patient history,
      laboratory values, and other relevant factors. This platform does not prescribe, dose-adjust, or
      autonomously recommend medications. All findings should be reviewed by a qualified clinician or pharmacist.
      Evidence grades indicate the quality of supporting research and may change as new data becomes available.
    </div>

    <!-- Report Footer -->
    <div style="margin-top:20px;padding-top:12px;border-top:1px solid var(--border);text-align:center;font-size:10px;color:var(--text-tertiary)">
      Generated by DeepSynaps Genetic Medication Analyzer · Report ID: ${esc(report.id)} ·
      Generated by: ${esc(report.generatedBy)} · ${esc(fmtDate(report.generatedAt))}
    </div>
  </div>`;
}

/**
 * Render a popup modal for viewing variant details with external links.
 */
function _variantDetailModal(variant) {
  const pubmedUrl = `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(variant.rsId)}`;
  const dbsnpUrl = `https://www.ncbi.nlm.nih.gov/snp/${encodeURIComponent(variant.rsId)}`;
  const pharmgkbUrl = `https://www.pharmgkb.org/variant/${encodeURIComponent(variant.rsId)}`;

  return `<div class="pgx-modal" style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px">
    <div style="background:var(--bg-card);border-radius:12px;max-width:520px;width:100%;padding:24px;box-shadow:0 8px 32px rgba(0,0,0,0.3)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <div style="font-size:16px;font-weight:700;color:var(--text-primary)">${esc(variant.gene)} — ${esc(variant.variant)}</div>
        <button onclick="this.closest('.pgx-modal').remove()" style="background:none;border:none;font-size:20px;color:var(--text-tertiary);cursor:pointer">&times;</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;font-size:12px">
        <div style="padding:8px;border-radius:6px;background:var(--bg-tertiary)"><div style="font-size:10px;color:var(--text-tertiary)">Genotype</div><div style="font-weight:600;color:var(--text-primary)">${esc(variant.genotype)}</div></div>
        <div style="padding:8px;border-radius:6px;background:var(--bg-tertiary)"><div style="font-size:10px;color:var(--text-tertiary)">rsID</div><div style="font-weight:600;font-family:var(--font-mono);font-size:11px">${esc(variant.rsId)}</div></div>
        <div style="padding:8px;border-radius:6px;background:var(--bg-tertiary)"><div style="font-size:10px;color:var(--text-tertiary)">Confidence</div><div style="font-weight:600;color:var(--text-primary)">${esc(variant.confidence)}</div></div>
        <div style="padding:8px;border-radius:6px;background:var(--bg-tertiary)"><div style="font-size:10px;color:var(--text-tertiary)">Phenotype</div><div>${_phenotypeBadge(variant.phenotype)}</div></div>
      </div>
      <div style="margin-bottom:14px">
        <div style="font-size:11px;font-weight:600;color:var(--text-tertiary);margin-bottom:4px">Consequence</div>
        <div style="font-size:12px;color:var(--text-secondary)">${esc(variant.consequence)}</div>
      </div>
      <div style="font-size:11px;font-weight:600;color:var(--text-tertiary);margin-bottom:6px">External References</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px">
        <a href="${esc(pubmedUrl)}" target="_blank" rel="noopener" style="font-size:10.5px;padding:4px 8px;border-radius:4px;background:var(--bg-tertiary);color:var(--blue);text-decoration:none;font-weight:500">PubMed</a>
        <a href="${esc(dbsnpUrl)}" target="_blank" rel="noopener" style="font-size:10.5px;padding:4px 8px;border-radius:4px;background:var(--bg-tertiary);color:var(--blue);text-decoration:none;font-weight:500">dbSNP</a>
        <a href="${esc(pharmgkbUrl)}" target="_blank" rel="noopener" style="font-size:10.5px;padding:4px 8px;border-radius:4px;background:var(--bg-tertiary);color:var(--blue);text-decoration:none;font-weight:500">PharmGKB</a>
      </div>
      <div style="font-size:10px;color:var(--text-tertiary);line-height:1.5">
        External links open in a new tab. These databases are maintained by third parties and may have their own terms of use.
      </div>
      <div style="display:flex;justify-content:flex-end;margin-top:12px">
        <button class="btn-secondary" style="font-size:11px;padding:5px 12px" onclick="this.closest('.pgx-modal').remove()">Close</button>
      </div>
    </div>
  </div>`;
}

/**
 * Build a patient-friendly summary of pharmacogenomic findings.
 * Uses simplified language appropriate for patient communication.
 */
function _patientFriendlySummary(profile) {
  const metabolizers = Object.entries(profile.metabolizers || {}).map(([gene, phenotype]) => {
    const fullData = _demoMetabolizerData()[gene];
    return { gene, phenotype, ...(fullData || {}) };
  });
  const significant = metabolizers.filter(m => !String(m.phenotype).toLowerCase().includes('normal'));

  return `<div class="ch-card" style="background:rgba(34,197,94,0.04);border:1px solid rgba(34,197,94,0.20)">
    <div style="font-size:14px;font-weight:700;color:var(--pgx-normal);margin-bottom:8px">Patient Summary</div>
    <div style="font-size:12px;color:var(--text-secondary);line-height:1.65">
      <p>This genetic test looked at ${profile.genesTested.length} genes that affect how your body processes medications.
      Most genes showed normal function. ${significant.length > 0 ? `Your clinician may want to review results for: ${significant.map(s => s.gene).join(', ')}.` : 'All tested genes showed normal function.'}</p>
      <p style="margin:8px 0 0">Please discuss these results with your clinician or pharmacist. They will help interpret what these findings mean for your care.</p>
    </div>
  </div>`;
}

/**
 * Activity score interpretation guide — rendered as a reference card.
 */
function _activityScoreGuide() {
  return `<div class="ch-card" style="margin-top:16px">
    <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:10px">Activity Score Interpretation Guide</div>
    <div style="display:flex;flex-direction:column;gap:6px;font-size:11px">
      ${[
        { score: '0', phenotype: 'Poor Metabolizer', meaning: 'Little to no functional enzyme activity. Substantially affected drug metabolism.', color: 'var(--pgx-significant)' },
        { score: '0.5', phenotype: 'Poor–Intermediate', meaning: 'Very reduced enzyme activity. Monitor closely.', color: 'var(--pgx-significant)' },
        { score: '1.0', phenotype: 'Intermediate Metabolizer', meaning: 'Reduced enzyme activity. May require monitoring.', color: 'var(--pgx-moderate)' },
        { score: '1.5–2.0', phenotype: 'Normal/Extensive', meaning: 'Normal enzyme activity. Standard metabolism expected.', color: 'var(--pgx-normal)' },
        { score: '>2.0', phenotype: 'Ultrarapid Metabolizer', meaning: 'Increased enzyme activity. May metabolise drugs faster than expected.', color: 'var(--pgx-moderate)' },
      ].map(row => `<div style="display:flex;align-items:center;gap:10px;padding:6px 8px;border-radius:5px;background:var(--bg-tertiary)">
        <div style="width:40px;text-align:center;font-weight:700;color:${esc(row.color)};font-family:var(--font-mono);font-size:11px">${esc(row.score)}</div>
        <div style="flex:1">
          <div style="font-weight:600;color:var(--text-primary);font-size:11px">${esc(row.phenotype)}</div>
          <div style="color:var(--text-secondary);font-size:10px">${esc(row.meaning)}</div>
        </div>
      </div>`).join('')}
    </div>
    <div style="margin-top:8px;font-size:10px;color:var(--text-tertiary);line-height:1.5">
      Activity scores are gene-specific and derived from CPIC/DPWG guidelines. Scores range from 0 (no activity)
      to >2.0 (ultrarapid). Interpretation requires clinical context and should not be used in isolation.
    </div>
  </div>`;
}

/**
 * Gene reference list — all pharmacogenes supported by the platform.
 */
function _geneReferenceList() {
  const genes = [
    { gene: 'CYP2D6', role: 'Phase I metabolism', drugs: 'SSRIs, antipsychotics, opioids, beta-blockers', importance: 'High' },
    { gene: 'CYP2C19', role: 'Phase I metabolism', drugs: 'Clopidogrel, PPIs, SSRIs', importance: 'High' },
    { gene: 'CYP2C9', role: 'Phase I metabolism', drugs: 'Warfarin, NSAIDs, sulfonylureas', importance: 'High' },
    { gene: 'CYP3A4', role: 'Phase I metabolism', drugs: 'Statins, immunosuppressants, benzodiazepines', importance: 'High' },
    { gene: 'CYP3A5', role: 'Phase I metabolism', drugs: 'Tacrolimus, cyclosporine', importance: 'High' },
    { gene: 'CYP1A2', role: 'Phase I metabolism', drugs: 'Clozapine, caffeine, theophylline', importance: 'Moderate' },
    { gene: 'SLCO1B1', role: 'Drug transporter', drugs: 'Statins', importance: 'High' },
    { gene: 'ABCB1', role: 'Drug transporter (MDR1)', drugs: 'Digoxin, antiretrovirals', importance: 'Moderate' },
    { gene: 'TPMT', role: 'Thiopurine metabolism', drugs: 'Azathioprine, 6-MP', importance: 'High' },
    { gene: 'DPYD', role: 'Fluoropyrimidine metabolism', drugs: '5-FU, capecitabine', importance: 'High' },
    { gene: 'HLA-B', role: 'Immune response', drugs: 'Carbamazepine, abacavir, allopurinol', importance: 'High' },
    { gene: 'UGT1A1', role: 'Glucuronidation', drugs: 'Irinotecan, atazanavir', importance: 'High' },
    { gene: 'VKORC1', role: 'Warfarin target', drugs: 'Warfarin', importance: 'High' },
    { gene: 'MTHFR', role: 'Folate metabolism', drugs: 'Methotrexate (indirect)', importance: 'Moderate' },
    { gene: 'BDNF', role: 'Neuroplasticity', drugs: 'Neuromodulation response', importance: 'Research' },
    { gene: 'COMT', role: 'Dopamine metabolism', drugs: 'Neuromodulation response', importance: 'Research' },
    { gene: 'GRIK4', role: 'Glutamate receptor', drugs: 'Antidepressant response', importance: 'Research' },
    { gene: 'FTO', role: 'Obesity risk', drugs: 'Metabolic considerations', importance: 'Research' },
    { gene: 'DRD2', role: 'Dopamine receptor', drugs: 'Antipsychotic response', importance: 'Research' },
    { gene: 'SLC6A4', role: 'Serotonin transporter', drugs: 'SSRI response', importance: 'Research' },
  ];

  return `<div class="ch-card" style="overflow-x:auto">
    <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:10px">Gene Reference Panel — ${genes.length} Pharmacogenes</div>
    <table style="width:100%;border-collapse:collapse;font-size:11px">
      <thead><tr style="border-bottom:1px solid var(--border)">
        <th style="text-align:left;padding:6px 8px;font-weight:600;color:var(--text-tertiary)">Gene</th>
        <th style="text-align:left;padding:6px 8px;font-weight:600;color:var(--text-tertiary)">Role</th>
        <th style="text-align:left;padding:6px 8px;font-weight:600;color:var(--text-tertiary)">Key Drugs</th>
        <th style="text-align:left;padding:6px 8px;font-weight:600;color:var(--text-tertiary)">Clinical Priority</th>
      </tr></thead>
      <tbody>
        ${genes.map(g => `<tr style="border-bottom:1px solid var(--border)">
          <td style="padding:6px 8px;font-weight:600;color:var(--blue);font-size:10.5px">${esc(g.gene)}</td>
          <td style="padding:6px 8px;color:var(--text-secondary)">${esc(g.role)}</td>
          <td style="padding:6px 8px;color:var(--text-secondary);font-size:10.5px">${esc(g.drugs)}</td>
          <td style="padding:6px 8px"><span style="font-size:10px;font-weight:600;padding:2px 6px;border-radius:4px;background:${g.importance==='High'?'rgba(239,68,68,0.10)':g.importance==='Moderate'?'rgba(245,158,11,0.10)':'rgba(59,130,246,0.10)'};color:${g.importance==='High'?'var(--pgx-significant)':g.importance==='Moderate'?'var(--pgx-moderate)':'var(--pgx-research)'}">${esc(g.importance)}</span></td>
        </tr>`).join('')}
      </tbody>
    </table>
    <div style="margin-top:8px;font-size:10px;color:var(--text-tertiary)">
      Priority levels: High = CPIC level 1A/1B with dosing guidelines · Moderate = CPIC level 2 · Research = Emerging evidence
    </div>
  </div>`;
}

/**
 * Evidence grading system explanation card.
 */
function _evidenceGradingExplainer() {
  return `<div class="ch-card" style="margin-top:16px">
    <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:10px">Evidence Grading System</div>
    <div style="display:flex;flex-direction:column;gap:6px;font-size:11px">
      <div style="display:flex;gap:8px;align-items:flex-start;padding:6px;border-radius:5px;background:rgba(0,212,188,0.06)">
        <span>${_pgxEvidenceBadge('A')}</span>
        <span style="color:var(--text-secondary);line-height:1.5"><strong>Grade A — Strong evidence:</strong> Supported by randomized controlled trials, systematic reviews, or large cohort studies. CPIC Level 1A or 1B. Clinicians should use this information to guide therapy.</span>
      </div>
      <div style="display:flex;gap:8px;align-items:flex-start;padding:6px;border-radius:5px;background:rgba(74,158,255,0.06)">
        <span>${_pgxEvidenceBadge('B')}</span>
        <span style="color:var(--text-secondary);line-height:1.5"><strong>Grade B — Moderate evidence:</strong> Supported by controlled studies or smaller clinical trials. CPIC Level 2A or 2B. Information should be considered in clinical context.</span>
      </div>
      <div style="display:flex;gap:8px;align-items:flex-start;padding:6px;border-radius:5px;background:rgba(245,158,11,0.06)">
        <span>${_pgxEvidenceBadge('C')}</span>
        <span style="color:var(--text-secondary);line-height:1.5"><strong>Grade C — Limited evidence:</strong> Based on case series, expert opinion, or preliminary studies. Use with caution and consider additional factors.</span>
      </div>
      <div style="display:flex;gap:8px;align-items:flex-start;padding:6px;border-radius:5px;background:rgba(255,107,107,0.06)">
        <span>${_pgxEvidenceBadge('D')}</span>
        <span style="color:var(--text-secondary);line-height:1.5"><strong>Grade D — Insufficient evidence:</strong> Very limited or conflicting data. Not recommended for routine clinical use at this time.</span>
      </div>
    </div>
  </div>`;
}

/**
 * CPIC guideline reference table.
 */
function _cpicGuidelineReference() {
  return `<div class="ch-card" style="margin-top:16px;overflow-x:auto">
    <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:10px">CPIC Guidelines Reference</div>
    <table style="width:100%;border-collapse:collapse;font-size:10.5px">
      <thead><tr style="border-bottom:1px solid var(--border)">
        <th style="text-align:left;padding:5px 7px;font-weight:600;color:var(--text-tertiary)">Gene</th>
        <th style="text-align:left;padding:5px 7px;font-weight:600;color:var(--text-tertiary)">Drug(s)</th>
        <th style="text-align:left;padding:5px 7px;font-weight:600;color:var(--text-tertiary)">CPIC Level</th>
        <th style="text-align:left;padding:5px 7px;font-weight:600;color:var(--text-tertiary)">FDA Label</th>
      </tr></thead>
      <tbody>
        ${[
          { gene: 'CYP2D6', drugs: 'Codeine, tramadol, paroxetine', level: '1A', fda: true },
          { gene: 'CYP2C19', drugs: 'Clopidogrel, citalopram', level: '1A', fda: true },
          { gene: 'CYP2C9', drugs: 'Warfarin, phenytoin', level: '1A', fda: true },
          { gene: 'TPMT', drugs: 'Azathioprine, 6-MP', level: '1A', fda: true },
          { gene: 'DPYD', drugs: '5-FU, capecitabine', level: '1A', fda: true },
          { gene: 'HLA-B*57:01', drugs: 'Abacavir', level: '1A', fda: true },
          { gene: 'HLA-B*15:02', drugs: 'Carbamazepine', level: '1A', fda: true },
          { gene: 'SLCO1B1', drugs: 'Simvastatin', level: '1A', fda: true },
          { gene: 'CYP3A5', drugs: 'Tacrolimus', level: '1A', fda: true },
          { gene: 'UGT1A1', drugs: 'Irinotecan', level: '1A', fda: true },
          { gene: 'CYP1A2', drugs: 'Clozapine', level: '2A', fda: false },
        ].map(row => `<tr style="border-bottom:1px solid var(--border)">
          <td style="padding:5px 7px;font-weight:600;color:var(--blue);font-size:10px">${esc(row.gene)}</td>
          <td style="padding:5px 7px;color:var(--text-secondary)">${esc(row.drugs)}</td>
          <td style="padding:5px 7px"><span class="pgx-cpic-badge">${esc(row.level)}</span></td>
          <td style="padding:5px 7px">${row.fda ? '<span class="pgx-fda-badge">Yes</span>' : '<span style="font-size:10px;color:var(--text-tertiary)">No</span>'}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    <div style="margin-top:8px;font-size:10px;color:var(--text-tertiary);line-height:1.5">
      CPIC Level 1A = Genes with strong evidence for clinical validity and utility.
      Level 2A = Genes with moderate evidence. Guidelines are freely available at cpicpgx.org.
      FDA label indicates the pharmacogenomic information is included in the FDA-approved drug label.
    </div>
  </div>`;
}

/**
 * Export genetic data as CSV or JSON.
 */
function _exportGeneticData(profile, format) {
  if (format === 'csv') {
    const variants = _demoVariants().filter(v => profile.genesTested.includes(v.gene));
    const headers = ['Gene', 'Variant', 'Genotype', 'rsID', 'Confidence', 'Phenotype', 'Consequence'];
    const rows = variants.map(v => [v.gene, v.variant, v.genotype, v.rsId, v.confidence, v.phenotype, v.consequence].map(esc).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${profile.id}_variants.csv`;
    a.click();
    URL.revokeObjectURL(url);
  } else if (format === 'json') {
    const data = {
      profileId: profile.id,
      patientName: profile.patientName,
      genesTested: profile.genesTested,
      variants: _demoVariants().filter(v => profile.genesTested.includes(v.gene)),
      exportedAt: new Date().toISOString(),
      disclaimer: _SAFE_WORDING.decisionSupport,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${profile.id}_genetic_data.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

/**
 * Medication class reference for clinicians.
 */
function _medicationClassReference() {
  return `<div class="ch-card" style="margin-top:16px">
    <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:10px">Medication Class Reference</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px;font-size:10.5px">
      ${[
        { cls: 'SSRIs', examples: 'Sertraline, fluoxetine, paroxetine, citalopram, escitalopram', genes: 'CYP2D6, CYP2C19, SLC6A4' },
        { cls: 'SNRIs', examples: 'Venlafaxine, duloxetine, desvenlafaxine', genes: 'CYP2D6' },
        { cls: 'TCAs', examples: 'Amitriptyline, nortriptyline, clomipramine', genes: 'CYP2D6, CYP2C19' },
        { cls: 'Antipsychotics', examples: 'Clozapine, olanzapine, risperidone, aripiprazole', genes: 'CYP1A2, CYP2D6, DRD2' },
        { cls: 'Anticoagulants', examples: 'Warfarin, acenocoumarol', genes: 'CYP2C9, VKORC1, CYP4F2' },
        { cls: 'Antiplatelets', examples: 'Clopidogrel, prasugrel, ticagrelor', genes: 'CYP2C19' },
        { cls: 'Statins', examples: 'Simvastatin, atorvastatin, pravastatin', genes: 'SLCO1B1, CYP3A4' },
        { cls: 'Immunosuppressants', examples: 'Tacrolimus, cyclosporine', genes: 'CYP3A5, CYP3A4' },
        { cls: 'Opioids', examples: 'Codeine, tramadol, morphine', genes: 'CYP2D6' },
        { cls: 'Thiopurines', examples: 'Azathioprine, 6-mercaptopurine', genes: 'TPMT, NUDT15' },
      ].map(m => `<div style="padding:8px;border-radius:6px;background:var(--bg-tertiary)">
        <div style="font-weight:600;color:var(--text-primary);font-size:11px;margin-bottom:2px">${esc(m.cls)}</div>
        <div style="color:var(--text-secondary);margin-bottom:2px">${esc(m.examples)}</div>
        <div style="font-size:10px;color:var(--blue)">Genes: ${esc(m.genes)}</div>
      </div>`).join('')}
    </div>
  </div>`;
}

/**
 * Mobile-responsive CSS override additions.
 */
const _PGX_MOBILE_CSS = `
<style>
@media (max-width: 768px) {
  .pgx-root { padding: 12px !important; }
  .pgx-metabolizer-grid { grid-template-columns: 1fr !important; }
  .pgx-tab-bar { overflow-x: auto; flex-wrap: nowrap !important; }
  .pgx-tab { font-size: 11px; padding: 6px 10px; }
  .pgx-ascii-diagram { font-size: 9px; padding: 8px; overflow-x: auto; }
}
@media (max-width: 480px) {
  .pgx-root { padding: 8px !important; }
  .pgx-tab { font-size: 10px; padding: 5px 8px; }
}
</style>`;

// Inject mobile CSS once
if (typeof document !== 'undefined') {
  const existing = document.getElementById('pgx-mobile-styles');
  if (!existing) {
    const style = document.createElement('div');
    style.id = 'pgx-mobile-styles';
    style.innerHTML = _PGX_MOBILE_CSS;
    document.head.appendChild(style);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// ADDITIONAL API INTEGRATION HELPERS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Fetch genetic profile data from the backend API.
 * Falls back to demo data if the API is unavailable.
 */
async function _fetchGeneticProfiles(api) {
  try {
    if (api?.geneticAnalyzerListProfiles) {
      return await api.geneticAnalyzerListProfiles();
    }
  } catch (err) {
    console.warn('Genetic analyzer API unavailable, using demo data:', err.message);
  }
  return { items: _demoGeneticProfiles() };
}

/**
 * Fetch metabolizer data for a specific profile.
 */
async function _fetchMetabolizerData(api, profileId) {
  try {
    if (api?.geneticAnalyzerGetMetabolizers) {
      return await api.geneticAnalyzerGetMetabolizers(profileId);
    }
  } catch (err) {
    console.warn('Metabolizer API unavailable, using demo data:', err.message);
  }
  return _demoMetabolizerData();
}

/**
 * Fetch drug interactions for a profile.
 */
async function _fetchDrugInteractions(api, profileId) {
  try {
    if (api?.geneticAnalyzerGetInteractions) {
      return await api.geneticAnalyzerGetInteractions(profileId);
    }
  } catch (err) {
    console.warn('Drug interaction API unavailable, using demo data:', err.message);
  }
  return _demoDrugInteractions();
}

/**
 * Fetch variants for a profile.
 */
async function _fetchVariants(api, profileId) {
  try {
    if (api?.geneticAnalyzerGetVariants) {
      return await api.geneticAnalyzerGetVariants(profileId);
    }
  } catch (err) {
    console.warn('Variants API unavailable, using demo data:', err.message);
  }
  return _demoVariants();
}

/**
 * Upload a VCF file to the genetic analyzer.
 */
async function _uploadVcfFile(api, file, patientId) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('patient_id', patientId);
  try {
    if (api?.geneticAnalyzerUploadVcf) {
      return await api.geneticAnalyzerUploadVcf(formData);
    }
  } catch (err) {
    console.error('VCF upload failed:', err.message);
    throw err;
  }
  return { id: 'demo-upload-' + Date.now(), status: 'processing', message: 'Demo upload accepted' };
}

/**
 * Submit a manual genotype entry.
 */
async function _submitManualGenotype(api, profileId, geneData) {
  try {
    if (api?.geneticAnalyzerAddGenotype) {
      return await api.geneticAnalyzerAddGenotype(profileId, geneData);
    }
  } catch (err) {
    console.error('Manual genotype submission failed:', err.message);
    throw err;
  }
  return { id: 'demo-manual-' + Date.now(), status: 'complete', message: 'Demo genotype added' };
}

/**
 * Generate a genetic report via API.
 */
async function _generateGeneticReport(api, params) {
  try {
    if (api?.geneticAnalyzerGenerateReport) {
      return await api.geneticAnalyzerGenerateReport(params);
    }
  } catch (err) {
    console.error('Report generation failed:', err.message);
    throw err;
  }
  return { id: 'pgr-demo-' + Date.now(), status: 'queued', message: 'Demo report queued' };
}

/**
 * Delete a genetic profile.
 */
async function _deleteGeneticProfile(api, profileId) {
  try {
    if (api?.geneticAnalyzerDeleteProfile) {
      return await api.geneticAnalyzerDeleteProfile(profileId);
    }
  } catch (err) {
    console.error('Profile deletion failed:', err.message);
    throw err;
  }
  return { success: true, message: 'Demo profile deleted' };
}

// ═════════════════════════════════════════════════════════════════════════════
// MODULE EXPORTS
// ═════════════════════════════════════════════════════════════════════════════

export {
  _demoGeneticProfiles,
  _demoMetabolizerData,
  _demoDrugInteractions,
  _demoVariants,
  _demoNeuromodGenetics,
  _demoNutritionGenetics,
  _demoGeneticReports,
  _demoAuditLog,
  _demoActivityFeed,
  _phenotypeBadge,
  _severityPill,
  _clinicalActionPill,
  _pgxEvidenceBadge,
  _statusBadge,
  _safetyBanner,
  _kpiCard,
  _crossPageLinks,
  _geneticNav,
  _geneCoverageRadarSVG,
  _buildMetabolizerComparisonTable,
  _buildInteractionMatrix,
  _renderFullReportPreviewHTML,
  _variantDetailModal,
  _patientFriendlySummary,
  _activityScoreGuide,
  _geneReferenceList,
  _evidenceGradingExplainer,
  _cpicGuidelineReference,
  _exportGeneticData,
  _medicationClassReference,
  _fetchGeneticProfiles,
  _fetchMetabolizerData,
  _fetchDrugInteractions,
  _fetchVariants,
  _uploadVcfFile,
  _submitManualGenotype,
  _generateGeneticReport,
  _deleteGeneticProfile,
  PGX_CSS_VARS as GENETIC_ANALYZER_CSS,
};
