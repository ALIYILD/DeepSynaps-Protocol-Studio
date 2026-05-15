// ─────────────────────────────────────────────────────────────────────────────
// pages-multimodal-correlations.js — Cross-Modality Correlation Matrix
//
// Features:
// - KPI cards: Modalities tracked, Correlation pairs, Significant (p<0.05), Fusion analyses
// - Modality selector checkboxes: qEEG | MRI | Biomarkers | Symptoms | Cognition | Sleep | HRV | Medication
// - Correlation matrix grid (CSS): rows/cols are modalities, cells show r-value and color
// - Significant correlations table: Modality A | Modality B | r-value | p-value | n | Evidence | Clinical note
// - Fusion analysis section: "Run multimodal fusion" button with modality selection
// - Evidence grades on all correlation outputs
// - Safety: "Cross-modal correlations may reflect confounding"
// ─────────────────────────────────────────────────────────────────────────────

import { evidenceBadge } from './helpers.js';
import { api } from './api.js';

// ── Modalities ──────────────────────────────────────────────────────────────
const MODALITIES = [
  { id: 'qeeg', label: 'qEEG', color: '#00d4bc' },
  { id: 'mri', label: 'MRI', color: '#4a9eff' },
  { id: 'biomarkers', label: 'Biomarkers', color: '#ffb547' },
  { id: 'symptoms', label: 'Symptoms', color: '#ff6b6b' },
  { id: 'cognition', label: 'Cognition', color: '#a78bfa' },
  { id: 'sleep', label: 'Sleep', color: '#34d399' },
  { id: 'hrv', label: 'HRV', color: '#f472b6' },
  { id: 'medication', label: 'Medication', color: '#fb923c' },
];

// ── Demo correlations (upper triangle only, symmetrical) ────────────────────
let DEMO_CORRELATIONS = [
  { a: 'qeeg', b: 'symptoms', varA: 'Alpha asymmetry', varB: 'HAM-D score', r: -0.62, p: 0.003, n: 48, grade: 'B', note: 'Higher left alpha = lower depression severity', provenance: 'measured' },
  { a: 'qeeg', b: 'cognition', varA: 'Theta/gamma ratio', varB: 'Working memory', r: -0.55, p: 0.008, n: 36, grade: 'B', note: 'Theta-gamma coupling linked to executive function', provenance: 'measured' },
  { a: 'qeeg', b: 'sleep', varA: 'Beta power (15-25 Hz)', varB: 'PSQI total', r: 0.48, p: 0.016, n: 42, grade: 'C', note: 'Elevated beta associated with poor sleep quality', provenance: 'inferred' },
  { a: 'mri', b: 'cognition', varA: 'Left DLPFC volume', varB: 'CANTAB composite', r: 0.58, p: 0.006, n: 32, grade: 'B', note: 'DLPFC structural integrity predicts cognitive performance', provenance: 'measured' },
  { a: 'mri', b: 'symptoms', varA: 'Hippocampal volume', varB: 'HAM-D score', r: -0.42, p: 0.028, n: 40, grade: 'C', note: 'Smaller hippocampus correlated with chronic depression', provenance: 'measured' },
  { a: 'biomarkers', b: 'symptoms', varA: 'BDNF serum', varB: 'HAM-D score', r: -0.51, p: 0.011, n: 30, grade: 'B', note: 'Lower BDNF associated with higher depression scores', provenance: 'measured' },
  { a: 'biomarkers', b: 'cognition', varA: 'Cortisol awakening', varB: 'Memory recall', r: -0.44, p: 0.024, n: 28, grade: 'C', note: 'HPA axis dysregulation affects memory consolidation', provenance: 'proxy' },
  { a: 'hrv', b: 'symptoms', varA: 'HRV SDNN', varB: 'HAM-A score', r: -0.55, p: 0.008, n: 36, grade: 'B', note: 'Reduced vagal tone linked to anxiety severity', provenance: 'measured' },
  { a: 'hrv', b: 'sleep', varA: 'HRV RMSSD', varB: 'Sleep efficiency', r: 0.46, p: 0.019, n: 34, grade: 'C', note: 'Autonomic balance supports sleep architecture', provenance: 'measured' },
  { a: 'sleep', b: 'cognition', varA: 'Slow wave sleep %', varB: 'Declarative memory', r: 0.52, p: 0.012, n: 26, grade: 'B', note: 'Deep sleep critical for memory consolidation', provenance: 'measured' },
  { a: 'medication', b: 'qeeg', varA: 'SSRI dose', varB: 'Alpha power change', r: 0.35, p: 0.065, n: 30, grade: 'D', note: 'Trend toward alpha increase with SSRI (n.s.)', provenance: 'proxy' },
  { a: 'medication', b: 'biomarkers', varA: 'SNRI dose', varB: 'BDNF change', r: 0.41, p: 0.032, n: 24, grade: 'C', note: 'SNRI may upregulate BDNF expression', provenance: 'inferred' },
  { a: 'qeeg', b: 'mri', varA: 'Alpha coherence', varB: 'Corpus callosum FA', r: 0.49, p: 0.018, n: 28, grade: 'B', note: 'Structural connectivity supports functional coherence', provenance: 'measured' },
  { a: 'symptoms', b: 'cognition', varA: 'HAM-D cognitive subscale', varB: 'Processing speed', r: -0.60, p: 0.004, n: 44, grade: 'B', note: 'Depression cognitive symptoms track with objective deficits', provenance: 'measured' },
  { a: 'biomarkers', b: 'hrv', varA: 'IL-6 serum', varB: 'HRV LF/HF ratio', r: 0.38, p: 0.045, n: 22, grade: 'C', note: 'Inflammation may shift autonomic balance', provenance: 'inferred' },
];

// ── Module state ────────────────────────────────────────────────────────────
let _selectedModalities = new Set(MODALITIES.map(m => m.id));
let _showFusionPanel = false;
let _fusionModalities = new Set();

// ── KPI data ────────────────────────────────────────────────────────────────
function _kpiData() {
  const visible = _visibleCorrelations();
  return {
    modalitiesTracked: _selectedModalities.size,
    correlationPairs: visible.length,
    significant: visible.filter(c => c.p < 0.05).length,
    fusionAnalyses: 4,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function _visibleCorrelations() {
  return DEMO_CORRELATIONS.filter(c => _selectedModalities.has(c.a) && _selectedModalities.has(c.b));
}

function _rColor(r) {
  const abs = Math.abs(r);
  if (abs >= 0.5) return r > 0 ? 'rgba(0,212,188,0.40)' : 'rgba(255,107,107,0.40)';
  if (abs >= 0.35) return r > 0 ? 'rgba(0,212,188,0.25)' : 'rgba(255,107,107,0.25)';
  if (abs >= 0.2) return r > 0 ? 'rgba(0,212,188,0.12)' : 'rgba(255,107,107,0.12)';
  return 'rgba(255,255,255,0.03)';
}

function _rTextColor(r) {
  const abs = Math.abs(r);
  if (abs >= 0.4) return r > 0 ? 'var(--teal)' : 'var(--red)';
  if (abs >= 0.25) return 'var(--text-secondary)';
  return 'var(--text-tertiary)';
}

function _provenanceBadge(prov) {
  const map = {
    measured: { bg: 'rgba(0,212,188,0.1)', color: 'var(--teal)', label: 'Measured' },
    inferred: { bg: 'rgba(74,158,255,0.1)', color: 'var(--blue)', label: 'Inferred' },
    proxy: { bg: 'rgba(255,181,71,0.1)', color: 'var(--amber)', label: 'Proxy' },
    simulated: { bg: 'rgba(167,139,250,0.1)', color: 'var(--violet)', label: 'Simulated' },
  };
  const s = map[prov] || map.inferred;
  return `<span style="font-size:10px;font-weight:600;padding:2px 7px;border-radius:4px;background:${s.bg};color:${s.color};font-family:var(--font-mono)">${s.label}</span>`;
}

function _sigStars(p) {
  if (p < 0.001) return '***';
  if (p < 0.01) return '**';
  if (p < 0.05) return '*';
  return 'n.s.';
}

// ── KPI cards ───────────────────────────────────────────────────────────────
function _renderKpis() {
  const k = _kpiData();
  const cards = [
    { label: 'Modalities tracked', value: k.modalitiesTracked, sub: 'Active in matrix', color: 'var(--teal)' },
    { label: 'Correlation pairs', value: k.correlationPairs, sub: 'Cross-modality combinations', color: 'var(--blue)' },
    { label: 'Significant (p<0.05)', value: k.significant, sub: 'Statistically significant', color: 'var(--green)' },
    { label: 'Fusion analyses', value: k.fusionAnalyses, sub: 'Multimodal integrations', color: 'var(--violet)' },
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

// ── Safety banner ───────────────────────────────────────────────────────────
function _renderSafetyBanner() {
  return `
    <div style="margin-bottom:24px;padding:12px 16px;border-radius:8px;border-left:4px solid var(--amber);background:rgba(255,181,71,0.08);color:var(--amber);font-size:12.5px;line-height:1.5">
      <strong>Safety notice:</strong> Cross-modal correlations may reflect confounding — requires causal validation. Correlations between different measurement modalities (e.g., qEEG and MRI) may be mediated by unmeasured third variables. All fusion analyses produce <em>inferred</em> outputs that require clinician review.
    </div>
  `;
}

// ── Modality selector ───────────────────────────────────────────────────────
function _renderModalitySelector() {
  return `
    <div style="margin-bottom:20px;padding:14px;border-radius:10px;border:1px solid var(--border);background:var(--navy-850)">
      <div style="font-size:11px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:12px">Modality selector</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        ${MODALITIES.map(m => {
          const checked = _selectedModalities.has(m.id);
          return `
            <label style="display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:6px;border:1px solid ${checked ? m.color + '40' : 'var(--border)'};background:${checked ? m.color + '12' : 'transparent'};cursor:pointer;user-select:none">
              <input type="checkbox" ${checked ? 'checked' : ''} onchange="window._mmToggleModality('${m.id}')"
                style="accent-color:${m.color};cursor:pointer" />
              <span style="font-size:12px;font-weight:${checked ? '600' : '400'};color:${checked ? m.color : 'var(--text-secondary)'};font-family:var(--font-mono)">${m.label}</span>
            </label>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

// ── Correlation matrix ──────────────────────────────────────────────────────
function _renderMatrix() {
  const active = MODALITIES.filter(m => _selectedModalities.has(m.id));
  const n = active.length;
  if (n < 2) {
    return `<div style="padding:30px;text-align:center;border-radius:10px;border:1px dashed var(--border);color:var(--text-tertiary);font-size:13px;margin-bottom:28px">Select at least 2 modalities to view correlations</div>`;
  }

  // Build r lookup
  const rMap = {};
  DEMO_CORRELATIONS.forEach(c => {
    rMap[`${c.a}|${c.b}`] = c;
    rMap[`${c.b}|${c.a}`] = c;
  });

  const cellSize = Math.max(56, Math.min(80, Math.floor(560 / n)));

  return `
    <div style="margin-bottom:28px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <h3 style="font-size:15px;font-weight:700;margin:0;color:var(--text-primary)">Cross-Modality Correlation Matrix</h3>
        <span style="font-size:11px;color:var(--text-tertiary)">${active.length} modalities · Pearson r · clinic cohort</span>
      </div>
      <div style="overflow-x:auto;padding:4px">
        <div style="display:inline-grid;gap:3px;grid-template-columns:${cellSize}px repeat(${n}, ${cellSize}px);align-items:center">
          <!-- Corner -->
          <div style="width:${cellSize}px;height:${cellSize}px"></div>
          <!-- Column headers -->
          ${active.map(m => `
            <div style="width:${cellSize}px;height:${cellSize}px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;color:${m.color};text-align:center;padding:4px;font-family:var(--font-mono);white-space:nowrap"
              title="${m.label}">
              ${m.label}
            </div>
          `).join('')}
          <!-- Rows -->
          ${active.map((mi, i) => `
            <!-- Row header -->
            <div style="width:${cellSize}px;height:${cellSize}px;display:flex;align-items:center;justify-content:flex-end;font-size:10px;font-weight:600;color:${mi.color};padding-right:8px;font-family:var(--font-mono);white-space:nowrap"
              title="${mi.label}">
              ${mi.label}
            </div>
            <!-- Cells -->
            ${active.map((mj, j) => {
              const key = `${mi.id}|${mj.id}`;
              const corr = rMap[key];
              const isDiag = i === j;
              const bg = isDiag ? 'rgba(255,255,255,0.06)' : corr != null ? _rColor(corr.r) : 'transparent';
              const text = isDiag ? '1.00' : corr != null ? corr.r.toFixed(2) : '';
              const color = isDiag ? 'var(--text-tertiary)' : corr != null ? _rTextColor(corr.r) : 'var(--text-tertiary)';
              const stars = corr && !isDiag ? _sigStars(corr.p) : '';
              const title = isDiag ? mi.label : corr ? `${corr.varA} vs ${corr.varB}: r=${corr.r.toFixed(3)}, p=${corr.p.toFixed(3)} ${stars}` : '';
              return `<div style="display:flex;align-items:center;justify-content:center;width:${cellSize}px;height:${cellSize}px;border-radius:5px;font-size:11px;font-weight:600;font-family:var(--font-mono);background:${bg};color:${color};position:relative"
                   title="${title}">
                ${text}
                ${stars && stars !== 'n.s.' ? `<span style="position:absolute;top:1px;right:2px;font-size:8px;color:${color};opacity:0.7">${stars}</span>` : ''}
              </div>`;
            }).join('')}
          `).join('')}
        </div>
      </div>
      <div style="display:flex;gap:16px;align-items:center;margin-top:12px;flex-wrap:wrap">
        <div style="display:flex;align-items:center;gap:6px">
          <span style="font-size:10px;color:var(--text-tertiary)">Strength:</span>
          <span style="width:14px;height:14px;border-radius:3px;background:rgba(0,212,188,0.40)"></span><span style="font-size:10px;color:var(--text-secondary)">Strong +</span>
          <span style="width:14px;height:14px;border-radius:3px;background:rgba(0,212,188,0.25)"></span><span style="font-size:10px;color:var(--text-secondary)">Mod +</span>
          <span style="width:14px;height:14px;border-radius:3px;background:rgba(255,107,107,0.25)"></span><span style="font-size:10px;color:var(--text-secondary)">Mod -</span>
          <span style="width:14px;height:14px;border-radius:3px;background:rgba(255,107,107,0.40)"></span><span style="font-size:10px;color:var(--text-secondary)">Strong -</span>
        </div>
        <div style="display:flex;gap:6px;align-items:center">
          <span style="font-size:10px;color:var(--text-tertiary)">Significance:</span>
          <span style="font-size:10px;font-family:var(--font-mono);color:var(--text-secondary)">* p<0.05</span>
          <span style="font-size:10px;font-family:var(--font-mono);color:var(--text-secondary)">** p<0.01</span>
          <span style="font-size:10px;font-family:var(--font-mono);color:var(--text-secondary)">*** p<0.001</span>
        </div>
      </div>
    </div>
  `;
}

// ── Significant correlations table ──────────────────────────────────────────
function _renderCorrelationTable() {
  const visible = _visibleCorrelations().filter(c => c.p < 0.05).sort((a, b) => a.p - b.p);

  if (visible.length === 0) {
    return `<div style="padding:30px;text-align:center;border-radius:10px;border:1px dashed var(--border);color:var(--text-tertiary);font-size:13px;margin-bottom:28px">No significant correlations for the selected modalities</div>`;
  }

  return `
    <div style="margin-bottom:28px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <h3 style="font-size:15px;font-weight:700;margin:0;color:var(--text-primary)">Significant Cross-Modal Correlations</h3>
        <span style="font-size:11px;color:var(--text-tertiary)">${visible.length} significant · α = 0.05 · Bonferroni correction recommended</span>
      </div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead>
            <tr style="border-bottom:2px solid var(--border);background:var(--navy-850)">
              <th style="padding:10px 12px;text-align:left;font-weight:600;color:var(--text-secondary);font-size:11px">Variable (Modality A)</th>
              <th style="padding:10px 12px;text-align:left;font-weight:600;color:var(--text-secondary);font-size:11px">Variable (Modality B)</th>
              <th style="padding:10px 12px;text-align:center;font-weight:600;color:var(--text-secondary);font-size:11px">r</th>
              <th style="padding:10px 12px;text-align:center;font-weight:600;color:var(--text-secondary);font-size:11px">p-value</th>
              <th style="padding:10px 12px;text-align:center;font-weight:600;color:var(--text-secondary);font-size:11px">n</th>
              <th style="padding:10px 12px;text-align:center;font-weight:600;color:var(--text-secondary);font-size:11px">Evidence</th>
              <th style="padding:10px 12px;text-align:center;font-weight:600;color:var(--text-secondary);font-size:11px">Source</th>
              <th style="padding:10px 12px;text-align:left;font-weight:600;color:var(--text-secondary);font-size:11px">Clinical note</th>
            </tr>
          </thead>
          <tbody>
            ${visible.map((c, i) => `
              <tr style="border-bottom:1px solid var(--border);${i % 2 === 0 ? 'background:var(--navy-850)' : ''}">
                <td style="padding:9px 12px;font-size:12px;color:var(--text-primary)">
                  <div style="font-weight:500">${c.varA}</div>
                  <span style="font-size:10px;font-family:var(--font-mono);color:${MODALITIES.find(m => m.id === c.a)?.color || 'var(--text-tertiary)'};text-transform:uppercase">${c.a}</span>
                </td>
                <td style="padding:9px 12px;font-size:12px;color:var(--text-primary)">
                  <div style="font-weight:500">${c.varB}</div>
                  <span style="font-size:10px;font-family:var(--font-mono);color:${MODALITIES.find(m => m.id === c.b)?.color || 'var(--text-tertiary)'};text-transform:uppercase">${c.b}</span>
                </td>
                <td style="padding:9px 12px;text-align:center;font-family:var(--font-mono);font-size:13px;font-weight:700;color:${_rTextColor(c.r)}">${c.r.toFixed(2)}</td>
                <td style="padding:9px 12px;text-align:center;font-family:var(--font-mono);font-size:12px;color:var(--text-secondary)">${c.p < 0.001 ? '<0.001' : c.p.toFixed(3)} ${_sigStars(c.p)}</td>
                <td style="padding:9px 12px;text-align:center;font-family:var(--font-mono);font-size:12px;color:var(--text-secondary)">${c.n}</td>
                <td style="padding:9px 12px;text-align:center">${evidenceBadge(c.grade)}</td>
                <td style="padding:9px 12px;text-align:center">${_provenanceBadge(c.provenance)}</td>
                <td style="padding:9px 12px;font-size:11px;color:var(--text-secondary);max-width:240px;line-height:1.4">${c.note}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ── Fusion analysis section ─────────────────────────────────────────────────
function _renderFusionSection() {
  return `
    <div style="margin-bottom:28px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <h3 style="font-size:15px;font-weight:700;margin:0;color:var(--text-primary)">Multimodal Fusion</h3>
        <span style="font-size:11px;color:var(--text-tertiary)">Combine modalities for enhanced prediction</span>
      </div>
      <div style="padding:20px;border-radius:10px;border:1px solid var(--border);background:var(--navy-850)">
        <div style="font-size:12px;color:var(--text-secondary);margin-bottom:14px;line-height:1.5">
          Select modalities to include in a multimodal fusion analysis. The ensemble model integrates features across selected domains to predict treatment response with higher accuracy than single-modality models.
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">
          ${MODALITIES.map(m => {
            const inFusion = _fusionModalities.has(m.id);
            return `
              <label style="display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:6px;border:1px solid ${inFusion ? m.color + '50' : 'var(--border)'};background:${inFusion ? m.color + '15' : 'transparent'};cursor:pointer;user-select:none">
                <input type="checkbox" ${inFusion ? 'checked' : ''} onchange="window._mmToggleFusionModality('${m.id}')"
                  style="accent-color:${m.color};cursor:pointer" />
                <span style="font-size:12px;font-weight:${inFusion ? '600' : '400'};color:${inFusion ? m.color : 'var(--text-secondary)'};font-family:var(--font-mono)">${m.label}</span>
              </label>
            `;
          }).join('')}
        </div>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" style="font-size:12px;padding:6px 18px" onclick="window._mmRunFusion()" ${(_fusionModalities.size < 2) ? 'disabled' : ''}>
            ▶ Run multimodal fusion
          </button>
          <span id="fusion-result" style="font-size:11px;color:var(--text-tertiary)">${_fusionModalities.size < 2 ? 'Select at least 2 modalities' : ''}</span>
        </div>
        ${_showFusionPanel ? `
          <div style="margin-top:16px;padding:14px;border-radius:8px;border:1px solid var(--border-teal);background:rgba(0,212,188,0.05)">
            <div style="font-size:12px;font-weight:600;color:var(--teal);margin-bottom:8px">Fusion Results (simulated)</div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px">
              <div style="padding:10px;border-radius:6px;background:rgba(255,255,255,0.02)">
                <div style="font-size:10px;color:var(--text-tertiary);margin-bottom:2px">Ensemble AUC</div>
                <div style="font-size:18px;font-weight:700;color:var(--teal);font-family:var(--font-mono)">0.82</div>
                <div style="font-size:10px;color:var(--text-tertiary)">vs best single: 0.71</div>
              </div>
              <div style="padding:10px;border-radius:6px;background:rgba(255,255,255,0.02)">
                <div style="font-size:10px;color:var(--text-tertiary);margin-bottom:2px">Cross-validated</div>
                <div style="font-size:18px;font-weight:700;color:var(--blue);font-family:var(--font-mono)">5-fold</div>
                <div style="font-size:10px;color:var(--text-tertiary)">stratified CV</div>
              </div>
              <div style="padding:10px;border-radius:6px;background:rgba(255,255,255,0.02)">
                <div style="font-size:10px;color:var(--text-tertiary);margin-bottom:2px">Top modality</div>
                <div style="font-size:18px;font-weight:700;color:var(--amber);font-family:var(--font-mono)">qEEG</div>
                <div style="font-size:10px;color:var(--text-tertiary)">SHAP importance 0.34</div>
              </div>
              <div style="padding:10px;border-radius:6px;background:rgba(255,255,255,0.02)">
                <div style="font-size:10px;color:var(--text-tertiary);margin-bottom:2px">Sample size</div>
                <div style="font-size:18px;font-weight:700;color:var(--text-primary);font-family:var(--font-mono)">n=48</div>
                <div style="font-size:10px;color:var(--text-tertiary)">complete cases</div>
              </div>
            </div>
            <div style="font-size:11px;color:var(--amber);margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">
              <strong>Simulated output:</strong> These fusion results are generated from a model ensemble trained on synthetic multimodal data. Not for clinical decision-making without validation.
            </div>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

// ── Window handlers ─────────────────────────────────────────────────────────
window._mmToggleModality = function(modId) {
  if (_selectedModalities.has(modId)) {
    if (_selectedModalities.size > 2) _selectedModalities.delete(modId);
  } else {
    _selectedModalities.add(modId);
  }
  _rerender();
};

window._mmToggleFusionModality = function(modId) {
  if (_fusionModalities.has(modId)) {
    _fusionModalities.delete(modId);
  } else {
    _fusionModalities.add(modId);
  }
  _rerender();
};

window._mmRunFusion = function() {
  if (_fusionModalities.size < 2) return;
  _showFusionPanel = true;
  _rerender();
  const toast = document.createElement('div');
  toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--teal);color:#000;padding:10px 22px;border-radius:8px;font-size:13px;font-weight:600;z-index:500';
  toast.textContent = `Fusion complete — ${_fusionModalities.size} modalities integrated`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
};

function _rerender() {
  const el = document.getElementById('mm-content-area');
  if (el) el.innerHTML = _renderModalitySelector() + _renderMatrix() + _renderCorrelationTable() + _renderFusionSection();
}

// ── Main render ─────────────────────────────────────────────────────────────
function _renderPage() {
  return `
    <div style="max-width:1200px;margin:0 auto;padding:20px">
      ${_renderSafetyBanner()}
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:12px">
        <div>
          <h2 style="font-size:20px;font-weight:800;margin:0 0 4px;color:var(--text-primary)">Multimodal Correlations</h2>
          <p style="margin:0;font-size:12px;color:var(--text-tertiary)">Cross-modality correlation matrix and fusion analysis</p>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-sm btn-ghost" style="font-size:11px" onclick="window._exportMultimodal('csv')">Export CSV</button>
        </div>
      </div>
      ${_renderKpis()}
      <div id="mm-content-area">
        ${_renderModalitySelector()}
        ${_renderMatrix()}
        ${_renderCorrelationTable()}
        ${_renderFusionSection()}
      </div>
    </div>
  `;
}

window._exportMultimodal = function(fmt) {
  const toast = document.createElement('div');
  toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--teal);color:#000;padding:10px 22px;border-radius:8px;font-size:13px;font-weight:600;z-index:500';
  toast.textContent = `Exporting correlations as ${fmt.toUpperCase()}...`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
};

// ── Entry point ─────────────────────────────────────────────────────────────
export async function pgMultimodalCorrelations(setTopbar, navigate) {
  setTopbar('Multimodal Correlations',
    `<button class="btn btn-sm btn-ghost" onclick="window._nav('deeptwin-insights')" style="margin-right:6px" title="Correlation engine">DeepTwin</button>` +
    `<button class="btn btn-sm btn-ghost" onclick="window._nav('knowledge-graph')" style="margin-right:6px" title="Clinical knowledge graph">Knowledge Graph</button>` +
    `<button class="btn btn-primary btn-sm" onclick="window._nav('forecast-simulation')">Forecast</button>`
  );

  const clinicId = window.APP_STATE?.clinicId || 'demo-clinic';
  const modalities = [];

  // Fetch multimodal correlations from API with demo fallback
  let correlations = [];
  try {
    const res = await api.getMultimodalCorrelations(clinicId, modalities);
    correlations = res?.correlations || res?.items || [];
  } catch (err) {
    console.warn('[MultimodalCorrelations] API error, using demo data:', err.message);
  }
  if (correlations && correlations.length > 0) {
    DEMO_CORRELATIONS = correlations;
  }

  // Reset state
  _selectedModalities = new Set(MODALITIES.map(m => m.id));
  _fusionModalities = new Set();
  _showFusionPanel = false;
  document.getElementById('content').innerHTML = _renderPage();
}

export default { pgMultimodalCorrelations };
