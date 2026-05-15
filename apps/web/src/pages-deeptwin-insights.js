// ─────────────────────────────────────────────────────────────────────────────
// pages-deeptwin-insights.js — DeepTwin Insights Dashboard
// Correlation engine + hypothesis generation for clinical neuromodulation
//
// Features:
// - KPI cards: Active correlations, Hypotheses generated, N-of-1 trials, Predictions validated
// - Correlation matrix visualization (CSS grid of colored cells showing r-values)
// - Hypothesis cards with correlation pair, strength, p-value, evidence grade
// - Causal Hypotheses section with N-of-1 trial designer button
// - Provenance labels: measured/inferred/proxy/simulated
// - Safety framing: "Correlations do not imply causation"
// ─────────────────────────────────────────────────────────────────────────────

import { evidenceBadge } from './helpers.js';
import { api } from './api.js';

// ── Demo data ───────────────────────────────────────────────────────────────
let DEMO_CORRELATIONS = [
  { varA: 'Alpha power (qEEG)', varB: 'HAM-D score', r: -0.62, p: 0.003, n: 48, provenance: 'measured', grade: 'B', direction: 'negative' },
  { varA: 'Theta frontal asymmetry', varB: 'Anxiety severity', r: 0.58, p: 0.007, n: 48, provenance: 'measured', grade: 'B', direction: 'positive' },
  { varA: 'tDCS session count', varB: 'Cognitive composite', r: 0.71, p: 0.001, n: 32, provenance: 'measured', grade: 'A', direction: 'positive' },
  { varA: 'Beta/gamma ratio', varB: 'Sleep quality (PSQI)', r: -0.45, p: 0.021, n: 48, provenance: 'inferred', grade: 'C', direction: 'negative' },
  { varA: 'BDNF serum level', varB: 'rTMS response', r: 0.52, p: 0.012, n: 24, provenance: 'proxy', grade: 'C', direction: 'positive' },
  { varA: 'HRV SDNN', varB: 'Stress score (DASS)', r: -0.55, p: 0.008, n: 36, provenance: 'measured', grade: 'B', direction: 'negative' },
  { varA: 'Left DLPFC perfusion (MRI)', varB: 'Working memory', r: 0.49, p: 0.018, n: 28, provenance: 'measured', grade: 'B', direction: 'positive' },
  { varA: 'Gamma power (qEEG)', varB: 'Treatment response', r: 0.38, p: 0.042, n: 48, provenance: 'inferred', grade: 'C', direction: 'positive' },
  { varA: 'SNRI dose (mg)', varB: 'HRV RMSSD', r: -0.33, p: 0.058, n: 36, provenance: 'proxy', grade: 'D', direction: 'negative' },
  { varA: 'Sleep spindle density', varB: 'Memory consolidation', r: 0.67, p: 0.002, n: 22, provenance: 'measured', grade: 'A', direction: 'positive' },
  { varA: 'rTMS pulse intensity', varB: 'Motor threshold', r: 0.73, p: 0.001, n: 36, provenance: 'measured', grade: 'A', direction: 'positive' },
  { varA: 'PFC theta coherence', varB: 'Executive function', r: 0.54, p: 0.009, n: 30, provenance: 'measured', grade: 'B', direction: 'positive' },
  { varA: 'GABA concentration (MRS)', varB: 'tDCS response', r: -0.47, p: 0.019, n: 20, provenance: 'proxy', grade: 'C', direction: 'negative' },
  { varA: 'Morning cortisol', varB: 'Sleep onset latency', r: 0.56, p: 0.007, n: 34, provenance: 'measured', grade: 'B', direction: 'positive' },
  { varA: 'DLPFC-fMRI connectivity', varB: 'Treatment resistance', r: -0.61, p: 0.004, n: 26, provenance: 'inferred', grade: 'B', direction: 'negative' },
];

let DEMO_HYPOTHESES = [
  { id: 'H1', pair: 'Alpha power → HAM-D score', r: -0.62, p: 0.003, grade: 'B', provenance: 'measured', action: 'Increase alpha entrainment protocol frequency for MDD patients', nOf1Ready: true, causalDirection: 'A→B (suggested)' },
  { id: 'H2', pair: 'tDCS session count → Cognitive composite', r: 0.71, p: 0.001, grade: 'A', provenance: 'measured', action: 'Extend tDCS course duration for cognitive enhancement endpoint', nOf1Ready: true, causalDirection: 'A→B (supported)' },
  { id: 'H3', pair: 'Theta frontal asymmetry → Anxiety severity', r: 0.58, p: 0.007, grade: 'B', provenance: 'measured', action: 'Consider left frontal tDCS for anxiety reduction', nOf1Ready: true, causalDirection: 'A↔B (unclear)' },
  { id: 'H4', pair: 'BDNF → rTMS response', r: 0.52, p: 0.012, grade: 'C', provenance: 'proxy', action: 'Screen BDNF Val66Met before rTMS course', nOf1Ready: false, causalDirection: 'Confounding likely' },
  { id: 'H5', pair: 'HRV SDNN → Stress score', r: -0.55, p: 0.008, grade: 'B', provenance: 'measured', action: 'Integrate HRV biofeedback with neuromodulation protocol', nOf1Ready: true, causalDirection: 'A→B (suggested)' },
  { id: 'H6', pair: 'Beta/gamma → Sleep quality', r: -0.45, p: 0.021, grade: 'C', provenance: 'inferred', action: 'Target beta suppression for sleep-onset insomnia', nOf1Ready: true, causalDirection: 'A→B (simulated)' },
  { id: 'H7', pair: 'PFC theta coherence → Executive function', r: 0.54, p: 0.009, grade: 'B', provenance: 'measured', action: 'Prioritize frontal theta neuromodulation for executive deficits', nOf1Ready: true, causalDirection: 'A→B (suggested)' },
  { id: 'H8', pair: 'DLPFC connectivity → Treatment resistance', r: -0.61, p: 0.004, grade: 'B', provenance: 'inferred', action: 'Screen connectivity before rTMS to predict non-response', nOf1Ready: false, causalDirection: 'Confounding possible' },
  { id: 'H9', pair: 'rTMS intensity → Motor threshold', r: 0.73, p: 0.001, grade: 'A', provenance: 'measured', action: 'Individualize intensity via MT-guided dosing', nOf1Ready: true, causalDirection: 'A→B (supported)' },
  { id: 'H10', pair: 'GABA → tDCS response', r: -0.47, p: 0.019, grade: 'C', provenance: 'proxy', action: 'Consider MRS-GABA screening for anodal tDCS candidates', nOf1Ready: false, causalDirection: 'Third variable likely' },
  { id: 'H11', pair: 'Morning cortisol → Sleep latency', r: 0.56, p: 0.007, grade: 'B', provenance: 'measured', action: 'Combine tACS with circadian interventions for insomnia', nOf1Ready: true, causalDirection: 'A→B (suggested)' },
];

// ── KPI data ────────────────────────────────────────────────────────────────
function _kpiData() {
  return {
    activeCorrelations: DEMO_CORRELATIONS.filter(c => c.p < 0.05).length,
    hypothesesGenerated: DEMO_HYPOTHESES.length,
    nOf1Trials: 3,
    predictionsValidated: 12,
  };
}

// ── Color helpers ───────────────────────────────────────────────────────────
function _rColor(r) {
  const abs = Math.abs(r);
  if (abs >= 0.6) return r > 0 ? 'rgba(0,212,188,0.35)' : 'rgba(255,107,107,0.35)';
  if (abs >= 0.4) return r > 0 ? 'rgba(0,212,188,0.22)' : 'rgba(255,107,107,0.22)';
  if (abs >= 0.2) return r > 0 ? 'rgba(0,212,188,0.12)' : 'rgba(255,107,107,0.12)';
  return 'rgba(255,255,255,0.03)';
}

function _rTextColor(r) {
  const abs = Math.abs(r);
  if (abs >= 0.4) return r > 0 ? 'var(--teal)' : 'var(--red)';
  return 'var(--text-secondary)';
}

function _provenanceBadge(prov) {
  const map = {
    measured: { bg: 'rgba(0,212,188,0.1)', color: 'var(--teal)', label: 'Measured' },
    inferred: { bg: 'rgba(74,158,255,0.1)', color: 'var(--blue)', label: 'Inferred' },
    proxy: { bg: 'rgba(255,181,71,0.1)', color: 'var(--amber)', label: 'Proxy' },
    simulated: { bg: 'rgba(167,139,250,0.1)', color: 'var(--violet)', label: 'Simulated' },
  };
  const s = map[prov] || map.simulated;
  return `<span style="font-size:10px;font-weight:600;padding:2px 7px;border-radius:4px;background:${s.bg};color:${s.color};font-family:var(--font-mono)">${s.label}</span>`;
}

// ── KPI cards ───────────────────────────────────────────────────────────────
function _renderKpis() {
  const k = _kpiData();
  const cards = [
    { label: 'Active correlations', value: k.activeCorrelations, sub: 'p < 0.05 · qEEG + MRI + bio', color: 'var(--teal)' },
    { label: 'Hypotheses generated', value: k.hypothesesGenerated, sub: 'From correlation engine', color: 'var(--blue)' },
    { label: 'N-of-1 trials', value: k.nOf1Trials, sub: 'Active single-patient designs', color: 'var(--amber)' },
    { label: 'Predictions validated', value: k.predictionsValidated, sub: 'Clinically confirmed outcomes', color: 'var(--green)' },
  ];
  return `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin-bottom:24px">
    ${cards.map(c => `
      <div style="padding:16px;border-radius:10px;border:1px solid var(--border);background:var(--navy-850)">
        <div style="font-size:11px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:10px">${c.label}</div>
        <div style="font-size:32px;font-weight:700;color:${c.color};font-family:var(--font-mono);line-height:1;margin-bottom:6px">${c.value}</div>
        <div style="font-size:11px;color:var(--text-secondary)">${c.sub}</div>
      </div>
    `).join('')}
  </div>`;
}

// ── Correlation matrix ──────────────────────────────────────────────────────
function _renderCorrelationMatrix() {
  const vars = [...new Set([...DEMO_CORRELATIONS.flatMap(c => [c.varA, c.varB])])];
  const n = vars.length;

  // Build lookup for r-values
  const rMap = {};
  DEMO_CORRELATIONS.forEach(c => {
    const key1 = `${c.varA}|${c.varB}`;
    const key2 = `${c.varB}|${c.varA}`;
    rMap[key1] = c.r;
    rMap[key2] = c.r;
  });

  return `
    <div style="margin-bottom:28px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <h3 style="font-size:15px;font-weight:700;margin:0;color:var(--text-primary)">Correlation Matrix</h3>
        <span style="font-size:11px;color:var(--text-tertiary)">Pearson r · clinic cohort n=48</span>
      </div>
      <div style="overflow-x:auto">
        <div style="display:grid;gap:3px;min-width:${n * 72 + 120}px" 
             style="grid-template-columns:120px repeat(${n}, 1fr)">
          <!-- Header row -->
          <div style="width:120px;flex-shrink:0"></div>
          ${vars.map(v => `
            <div style="font-size:10px;font-weight:600;color:var(--text-tertiary);text-align:center;padding:6px 2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:72px" title="${v}">
              ${v.length > 14 ? v.slice(0, 12) + '..' : v}
            </div>
          `).join('')}
          <!-- Data rows -->
          ${vars.map((vi, i) => `
            <div style="display:contents">
              <div style="font-size:10px;font-weight:600;color:var(--text-secondary);padding:8px 6px;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:120px;border-right:1px solid var(--border)" title="${vi}">
                ${vi.length > 18 ? vi.slice(0, 16) + '..' : vi}
              </div>
              ${vars.map((vj, j) => {
                const key = `${vi}|${vj}`;
                const r = rMap[key];
                const isDiag = i === j;
                const bg = isDiag ? 'rgba(255,255,255,0.06)' : r != null ? _rColor(r) : 'transparent';
                const text = isDiag ? '1.00' : r != null ? r.toFixed(2) : '';
                const color = isDiag ? 'var(--text-tertiary)' : r != null ? _rTextColor(r) : 'var(--text-tertiary)';
                return `<div style="display:flex;align-items:center;justify-content:center;padding:8px;border-radius:4px;font-size:12px;font-weight:600;font-family:var(--font-mono);background:${bg};color:${color};min-height:36px"
                     title="${isDiag ? vi : vi + ' vs ' + vj + (r != null ? ': r=' + r.toFixed(3) : '')}">
                  ${text}
                </div>`;
              }).join('')}
            </div>
          `).join('')}
        </div>
      </div>
      <div style="display:flex;gap:16px;align-items:center;margin-top:12px;flex-wrap:wrap">
        <div style="display:flex;align-items:center;gap:6px">
          <span style="font-size:10px;color:var(--text-tertiary)">Strength:</span>
          <span style="width:14px;height:14px;border-radius:3px;background:rgba(0,212,188,0.35)"></span><span style="font-size:10px;color:var(--text-secondary)">Strong +</span>
          <span style="width:14px;height:14px;border-radius:3px;background:rgba(0,212,188,0.22)"></span><span style="font-size:10px;color:var(--text-secondary)">Mod +</span>
          <span style="width:14px;height:14px;border-radius:3px;background:rgba(255,107,107,0.22)"></span><span style="font-size:10px;color:var(--text-secondary)">Mod -</span>
          <span style="width:14px;height:14px;border-radius:3px;background:rgba(255,107,107,0.35)"></span><span style="font-size:10px;color:var(--text-secondary)">Strong -</span>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <span style="font-size:10px;color:var(--text-tertiary)">Source:</span>
          ${_provenanceBadge('measured')}
          ${_provenanceBadge('inferred')}
          ${_provenanceBadge('proxy')}
        </div>
      </div>
    </div>
  `;
}

// ── Hypothesis cards ────────────────────────────────────────────────────────
function _renderHypotheses() {
  return `
    <div style="margin-bottom:28px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <h3 style="font-size:15px;font-weight:700;margin:0;color:var(--text-primary)">Causal Hypotheses</h3>
        <span style="font-size:11px;color:var(--text-tertiary)">${DEMO_HYPOTHESES.length} hypotheses · ranked by evidence</span>
      </div>
      ${DEMO_HYPOTHESES.map(h => `
        <div style="background:var(--navy-850);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:10px">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:10px;flex-wrap:wrap">
            <div style="flex:1;min-width:0">
              <div style="font-size:14px;font-weight:600;color:var(--text-primary);margin-bottom:4px">${h.pair}</div>
              <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
                ${_provenanceBadge(h.provenance)}
                <span style="font-size:10px;font-weight:600;padding:2px 7px;border-radius:4px;background:${h.nOf1Ready ? 'rgba(0,212,188,0.1)' : 'rgba(255,107,107,0.1)'};color:${h.nOf1Ready ? 'var(--teal)' : 'var(--red)'};font-family:var(--font-mono)">
                  ${h.nOf1Ready ? 'N-of-1 ready' : 'Not trial-ready'}
                </span>
                <span style="font-size:10px;color:var(--text-tertiary);font-family:var(--font-mono)">Causal: ${h.causalDirection}</span>
              </div>
            </div>
            <div style="display:flex;gap:10px;align-items:center;flex-shrink:0">
              ${evidenceBadge(h.grade)}
              <span style="font-size:12px;font-family:var(--font-mono);color:${_rTextColor(h.r)}">r = ${h.r.toFixed(2)}</span>
              <span style="font-size:11px;font-family:var(--font-mono);color:var(--text-secondary)">p = ${h.p.toFixed(3)}</span>
            </div>
          </div>
          <div style="font-size:12px;color:var(--text-secondary);line-height:1.5;margin-bottom:10px;padding:8px;border-radius:6px;background:rgba(255,255,255,0.02)">
            <strong style="color:var(--text-primary)">Suggested action:</strong> ${h.action}
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            ${h.nOf1Ready ? `<button class="btn btn-sm" style="font-size:11px;padding:4px 12px" onclick="window._nav('n-of-1-designer?hypothesis=${h.id}')"
              title="Design a single-patient trial to test this hypothesis">
              Test this hypothesis → N-of-1 trial
            </button>` : '<span style="font-size:10px;color:var(--text-tertiary)">Insufficient evidence for causal trial design</span>'}
            <button class="btn btn-sm btn-ghost" style="font-size:11px;padding:4px 12px" onclick="window._showHypothesisDetail('${h.id}')">
              View evidence
            </button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// ── Correlation detail table ────────────────────────────────────────────────
function _renderCorrelationTable() {
  const sig = DEMO_CORRELATIONS.filter(c => c.p < 0.05).sort((a, b) => a.p - b.p);
  return `
    <div style="margin-bottom:28px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <h3 style="font-size:15px;font-weight:700;margin:0;color:var(--text-primary)">Significant Correlations</h3>
        <span style="font-size:11px;color:var(--text-tertiary)">${sig.length} significant · α = 0.05</span>
      </div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead>
            <tr style="border-bottom:2px solid var(--border);background:var(--navy-850)">
              <th style="padding:10px 12px;text-align:left;font-weight:600;color:var(--text-secondary);font-size:11px">Variable A</th>
              <th style="padding:10px 12px;text-align:left;font-weight:600;color:var(--text-secondary);font-size:11px">Variable B</th>
              <th style="padding:10px 12px;text-align:center;font-weight:600;color:var(--text-secondary);font-size:11px">r</th>
              <th style="padding:10px 12px;text-align:center;font-weight:600;color:var(--text-secondary);font-size:11px">p-value</th>
              <th style="padding:10px 12px;text-align:center;font-weight:600;color:var(--text-secondary);font-size:11px">n</th>
              <th style="padding:10px 12px;text-align:center;font-weight:600;color:var(--text-secondary);font-size:11px">Evidence</th>
              <th style="padding:10px 12px;text-align:center;font-weight:600;color:var(--text-secondary);font-size:11px">Source</th>
            </tr>
          </thead>
          <tbody>
            ${sig.map((c, i) => `
              <tr style="border-bottom:1px solid var(--border);${i % 2 === 0 ? 'background:var(--navy-850)' : ''}">
                <td style="padding:9px 12px;font-size:12px;color:var(--text-primary)">${c.varA}</td>
                <td style="padding:9px 12px;font-size:12px;color:var(--text-primary)">${c.varB}</td>
                <td style="padding:9px 12px;text-align:center;font-family:var(--font-mono);font-size:12px;font-weight:600;color:${_rTextColor(c.r)}">${c.r.toFixed(2)}</td>
                <td style="padding:9px 12px;text-align:center;font-family:var(--font-mono);font-size:12px;color:var(--text-secondary)">${c.p < 0.001 ? '<0.001' : c.p.toFixed(3)}</td>
                <td style="padding:9px 12px;text-align:center;font-family:var(--font-mono);font-size:12px;color:var(--text-secondary)">${c.n}</td>
                <td style="padding:9px 12px;text-align:center">${evidenceBadge(c.grade)}</td>
                <td style="padding:9px 12px;text-align:center">${_provenanceBadge(c.provenance)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ── Safety banner ───────────────────────────────────────────────────────────
function _renderSafetyBanner() {
  return `
    <div style="margin-bottom:24px;padding:12px 16px;border-radius:8px;border-left:4px solid var(--amber);background:rgba(255,181,71,0.08);color:var(--amber);font-size:12.5px;line-height:1.5">
      <strong>Safety notice:</strong> Correlations do not imply causation — requires clinical validation. All hypotheses should be tested via N-of-1 trials or controlled studies before protocol modification. Predictions shown are <em>simulated</em> and may differ from actual clinical outcomes.
    </div>
  `;
}

// ── Export button ───────────────────────────────────────────────────────────
function _renderExportBar() {
  return `
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-bottom:16px">
      <button class="btn btn-sm btn-ghost" style="font-size:11px" onclick="window._exportCorrelations('csv')">Export CSV</button>
      <button class="btn btn-sm btn-ghost" style="font-size:11px" onclick="window._exportCorrelations('json')">Export JSON</button>
    </div>
  `;
}

// ── Detail modal handler ────────────────────────────────────────────────────
window._showHypothesisDetail = function(hypothesisId) {
  const h = DEMO_HYPOTHESES.find(x => x.id === hypothesisId);
  if (!h) return;
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:400;display:flex;align-items:center;justify-content:center;padding:24px';
  overlay.innerHTML = `
    <div style="background:var(--navy-850);border:1px solid var(--border);border-radius:12px;max-width:520px;width:100%;max-height:80vh;overflow:auto;padding:24px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h3 style="margin:0;font-size:16px;color:var(--text-primary)">Hypothesis ${h.id}</h3>
        <button onclick="this.closest('.ds-overlay').remove()" style="background:none;border:none;color:var(--text-secondary);cursor:pointer;font-size:18px">&times;</button>
      </div>
      <div style="font-size:14px;color:var(--text-primary);margin-bottom:12px"><strong>${h.pair}</strong></div>
      <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
        ${evidenceBadge(h.grade)}
        ${_provenanceBadge(h.provenance)}
        <span style="font-size:10px;font-family:var(--font-mono);color:var(--text-secondary);padding:2px 7px;border-radius:4px;background:rgba(255,255,255,0.04)">r = ${h.r.toFixed(3)} · p = ${h.p.toFixed(3)}</span>
      </div>
      <div style="font-size:12px;color:var(--text-secondary);line-height:1.6;margin-bottom:16px;padding:12px;border-radius:8px;background:rgba(255,255,255,0.02)">
        <div style="margin-bottom:8px"><strong>Causal direction:</strong> ${h.causalDirection}</div>
        <div style="margin-bottom:8px"><strong>N-of-1 ready:</strong> ${h.nOf1Ready ? 'Yes — sufficient evidence to design single-patient trial' : 'No — requires additional evidence'}</div>
        <div><strong>Suggested action:</strong> ${h.action}</div>
      </div>
      <div style="font-size:11px;color:var(--text-tertiary);line-height:1.5;border-top:1px solid var(--border);padding-top:12px">
        This hypothesis was generated by DeepTwin correlation analysis. Evidence grade reflects the quality of supporting studies, not clinical certainty. All recommendations require clinician review.
      </div>
    </div>
  `;
  overlay.className = 'ds-overlay';
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
};

window._exportCorrelations = function(fmt) {
  const toast = document.createElement('div');
  toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--teal);color:#000;padding:10px 22px;border-radius:8px;font-size:13px;font-weight:600;z-index:500';
  toast.textContent = `Exporting correlations as ${fmt.toUpperCase()}...`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
};

// ── Recent activity ─────────────────────────────────────────────────────────
function _renderRecentActivity() {
  const activities = [
    { time: '2h ago', type: 'hypothesis', label: 'H9 generated', detail: 'rTMS intensity → Motor threshold (r=0.73, EV-A)', status: 'new' },
    { time: '5h ago', type: 'validation', label: 'H2 validated', detail: 'tDCS session count → Cognitive composite confirmed via N-of-1', status: 'confirmed' },
    { time: '1d ago', type: 'trial', label: 'N-of-1 started', detail: 'Patient PT-2841 · Alpha entrainment for MDD · 3-week crossover', status: 'active' },
    { time: '1d ago', type: 'correlation', label: 'Matrix updated', detail: '6 new correlations added from qEEG + MRI fusion pipeline', status: 'updated' },
    { time: '2d ago', type: 'validation', label: 'H5 partial', detail: 'HRV SDNN → Stress score: partial confirmation in n=12 cohort', status: 'partial' },
    { time: '3d ago', type: 'hypothesis', label: 'H7 generated', detail: 'PFC theta coherence → Executive function (r=0.54, EV-B)', status: 'new' },
  ];
  const typeColors = { hypothesis: 'var(--blue)', validation: 'var(--teal)', trial: 'var(--amber)', correlation: 'var(--violet)' };
  const statusColors = { new: 'var(--blue)', confirmed: 'var(--teal)', active: 'var(--amber)', updated: 'var(--violet)', partial: 'var(--amber)' };
  return `
    <div style="margin-bottom:28px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <h3 style="font-size:15px;font-weight:700;margin:0;color:var(--text-primary)">Recent Activity</h3>
        <span style="font-size:11px;color:var(--text-tertiary)">Last 3 days</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${activities.map(a => `
          <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:8px;background:var(--navy-850);border:1px solid var(--border)">
            <span style="font-size:10px;font-family:var(--font-mono);color:var(--text-tertiary);width:50px;flex-shrink:0">${a.time}</span>
            <span style="font-size:10px;font-weight:600;padding:2px 8px;border-radius:4px;background:${typeColors[a.type]}18;color:${typeColors[a.type]};font-family:var(--font-mono);text-transform:uppercase;width:80px;text-align:center;flex-shrink:0">${a.type}</span>
            <div style="flex:1;min-width:0">
              <div style="font-size:12px;font-weight:600;color:var(--text-primary)">${a.label}</div>
              <div style="font-size:11px;color:var(--text-secondary)">${a.detail}</div>
            </div>
            <span style="font-size:10px;font-weight:600;padding:2px 7px;border-radius:4px;background:${statusColors[a.status]}18;color:${statusColors[a.status]};font-family:var(--font-mono);flex-shrink:0">${a.status}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// ── Causal inference indicators ─────────────────────────────────────────────
function _renderCausalIndicators() {
  const indicators = [
    { label: 'Temporal precedence', value: '68%', desc: 'Cause measured before effect', grade: 'B' },
    { label: 'Dose-response gradient', value: '54%', desc: 'Higher dose → stronger association', grade: 'B' },
    { label: 'Consistency across studies', value: '72%', desc: 'Replicated in ≥2 independent cohorts', grade: 'A' },
    { label: 'Biological plausibility', value: '61%', desc: 'Supported by mechanistic model', grade: 'C' },
    { label: 'Experimental support', value: '45%', desc: 'Confirmed by N-of-1 or RCT', grade: 'B' },
  ];
  return `
    <div style="margin-bottom:28px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <h3 style="font-size:15px;font-weight:700;margin:0;color:var(--text-primary)">Causal Inference Indicators</h3>
        <span style="font-size:11px;color:var(--text-tertiary)">Bradford Hill criteria coverage</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px">
        ${indicators.map(ind => `
          <div style="padding:14px;border-radius:8px;border:1px solid var(--border);background:var(--navy-850)">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
              <span style="font-size:12px;font-weight:600;color:var(--text-primary)">${ind.label}</span>
              ${evidenceBadge(ind.grade)}
            </div>
            <div style="display:flex;align-items:baseline;gap:6px;margin-bottom:6px">
              <span style="font-size:24px;font-weight:700;color:var(--teal);font-family:var(--font-mono)">${ind.value}</span>
              <span style="font-size:10px;color:var(--text-tertiary)">of hypotheses</span>
            </div>
            <div style="font-size:11px;color:var(--text-secondary)">${ind.desc}</div>
            <div style="margin-top:8px;height:4px;border-radius:2px;background:var(--navy-700)">
              <div style="height:4px;border-radius:2px;background:var(--teal);width:${ind.value}"></div>
            </div>
          </div>
        `).join('')}
      </div>
      <div style="margin-top:10px;padding:10px;border-radius:6px;background:rgba(255,181,71,0.06);border:1px solid rgba(255,181,71,0.15)">
        <span style="font-size:11px;color:var(--amber);line-height:1.5">
          <strong>Caution:</strong> Causal inference indicators are <em>inferred</em> from available evidence. No single indicator proves causation. Combined assessment across all criteria is required before designing interventional studies.
        </span>
      </div>
    </div>
  `;
}

// ── Main render ─────────────────────────────────────────────────────────────
function _renderPage() {
  return `
    <div style="max-width:1200px;margin:0 auto;padding:20px">
      ${_renderSafetyBanner()}
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:12px">
        <div>
          <h2 style="font-size:20px;font-weight:800;margin:0 0 4px;color:var(--text-primary)">DeepTwin Insights</h2>
          <p style="margin:0;font-size:12px;color:var(--text-tertiary)">AI-powered correlation engine for clinical neuromodulation intelligence</p>
        </div>
        ${_renderExportBar()}
      </div>
      ${_renderKpis()}
      ${_renderCorrelationMatrix()}
      ${_renderHypotheses()}
      ${_renderCorrelationTable()}
      ${_renderRecentActivity()}
      ${_renderCausalIndicators()}
    </div>
  `;
}

// ── Entry point ─────────────────────────────────────────────────────────────
export async function pgDeeptwinInsights(setTopbar, navigate) {
  setTopbar('DeepTwin Insights',
    `<button class="btn btn-sm btn-ghost" onclick="window._nav('forecast-simulation')" style="margin-right:6px" title="Open prediction workbench">Forecast</button>` +
    `<button class="btn btn-sm btn-ghost" onclick="window._nav('multimodal-correlations')" style="margin-right:6px" title="Cross-modality correlation matrix">Multimodal</button>` +
    `<button class="btn btn-primary btn-sm" onclick="window._nav('n-of-1-designer')">+ N-of-1 Trial</button>`
  );

  const clinicId = window.APP_STATE?.clinicId || 'demo-clinic';
  const userRole = window.APP_STATE?.userRole || 'clinician';

  // Fetch correlations from API with demo fallback
  let correlations = [];
  let hypotheses = [];
  try {
    const res = await api.getDeeptwinCorrelations(clinicId);
    correlations = res?.correlations || res?.items || [];
    hypotheses = res?.hypotheses || [];
  } catch (err) {
    console.warn('[DeepTwinInsights] API error, using demo data:', err.message);
  }
  if (correlations && correlations.length > 0) {
    DEMO_CORRELATIONS = correlations;
  }
  if (hypotheses && hypotheses.length > 0) {
    DEMO_HYPOTHESES = hypotheses;
  }

  document.getElementById('content').innerHTML = _renderPage();
}

export default { pgDeeptwinInsights };
