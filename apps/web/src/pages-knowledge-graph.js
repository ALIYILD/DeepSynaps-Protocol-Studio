// ─────────────────────────────────────────────────────────────────────────────
// pages-knowledge-graph.js — Clinical Knowledge Graph Explorer
//
// Features:
// - KPI cards: Nodes, Edges, Relations, Evidence sources
// - Search bar for clinical concepts
// - Node cards: concept type, connections count, evidence grade
// - Filter: Conditions / Interventions / Biomarkers / Brain Regions / Drugs
// - Relationship table: Source → Relation → Target | Evidence | Strength
// - Clinical safety framing
// ─────────────────────────────────────────────────────────────────────────────

import { evidenceBadge } from './helpers.js';
import { api } from './api.js';

// ── Demo data ───────────────────────────────────────────────────────────────
let DEMO_NODES = [
  { id: 'N1', label: 'Major Depressive Disorder', type: 'condition', connections: 14, grade: 'A', provenance: 'measured' },
  { id: 'N2', label: 'Generalized Anxiety Disorder', type: 'condition', connections: 11, grade: 'A', provenance: 'measured' },
  { id: 'N3', label: 'tDCS', type: 'intervention', connections: 9, grade: 'A', provenance: 'measured' },
  { id: 'N4', label: 'rTMS', type: 'intervention', connections: 12, grade: 'A', provenance: 'measured' },
  { id: 'N5', label: 'rTMS-iTBS', type: 'intervention', connections: 8, grade: 'A', provenance: 'measured' },
  { id: 'N6', label: 'tACS', type: 'intervention', connections: 6, grade: 'B', provenance: 'measured' },
  { id: 'N7', label: 'Neurofeedback', type: 'intervention', connections: 7, grade: 'B', provenance: 'inferred' },
  { id: 'N8', label: 'Left DLPFC', type: 'brain_region', connections: 10, grade: 'A', provenance: 'measured' },
  { id: 'N9', label: 'Right DLPFC', type: 'brain_region', connections: 8, grade: 'A', provenance: 'measured' },
  { id: 'N10', label: 'BDNF', type: 'biomarker', connections: 6, grade: 'B', provenance: 'proxy' },
  { id: 'N11', label: 'Cortisol', type: 'biomarker', connections: 5, grade: 'B', provenance: 'measured' },
  { id: 'N12', label: 'Alpha power (8-12 Hz)', type: 'biomarker', connections: 7, grade: 'A', provenance: 'measured' },
  { id: 'N13', label: 'Theta power (4-8 Hz)', type: 'biomarker', connections: 6, grade: 'B', provenance: 'measured' },
  { id: 'N14', label: 'Sertraline', type: 'drug', connections: 5, grade: 'A', provenance: 'measured' },
  { id: 'N15', label: 'Escitalopram', type: 'drug', connections: 4, grade: 'A', provenance: 'measured' },
];

let DEMO_EDGES = [
  { source: 'tDCS', target: 'Left DLPFC', relation: 'targets', strength: 'strong', evidence: 'A', n: 42, provenance: 'measured' },
  { source: 'rTMS', target: 'Left DLPFC', relation: 'targets', strength: 'strong', evidence: 'A', n: 56, provenance: 'measured' },
  { source: 'rTMS-iTBS', target: 'Left DLPFC', relation: 'targets', strength: 'strong', evidence: 'A', n: 28, provenance: 'measured' },
  { source: 'tACS', target: 'Alpha power (8-12 Hz)', relation: 'modulates', strength: 'moderate', evidence: 'B', n: 18, provenance: 'measured' },
  { source: 'tDCS', target: 'Major Depressive Disorder', relation: 'treats', strength: 'strong', evidence: 'A', n: 48, provenance: 'measured' },
  { source: 'rTMS', target: 'Major Depressive Disorder', relation: 'treats', strength: 'strong', evidence: 'A', n: 64, provenance: 'measured' },
  { source: 'rTMS-iTBS', target: 'Major Depressive Disorder', relation: 'treats', strength: 'strong', evidence: 'A', n: 32, provenance: 'measured' },
  { source: 'Neurofeedback', target: 'ADHD', relation: 'treats', strength: 'moderate', evidence: 'B', n: 24, provenance: 'inferred' },
  { source: 'BDNF', target: 'rTMS', relation: 'predicts_response', strength: 'moderate', evidence: 'B', n: 16, provenance: 'proxy' },
  { source: 'BDNF', target: 'Major Depressive Disorder', relation: 'associated_with', strength: 'moderate', evidence: 'B', n: 36, provenance: 'measured' },
  { source: 'Cortisol', target: 'Generalized Anxiety Disorder', relation: 'associated_with', strength: 'moderate', evidence: 'B', n: 28, provenance: 'measured' },
  { source: 'Left DLPFC', target: 'Right DLPFC', relation: 'functionally_connected', strength: 'strong', evidence: 'A', n: 52, provenance: 'measured' },
  { source: 'Alpha power (8-12 Hz)', target: 'Major Depressive Disorder', relation: 'biomarker_for', strength: 'moderate', evidence: 'B', n: 38, provenance: 'measured' },
  { source: 'Sertraline', target: 'Major Depressive Disorder', relation: 'treats', strength: 'strong', evidence: 'A', n: 72, provenance: 'measured' },
  { source: 'tDCS', target: 'BDNF', relation: 'modulates', strength: 'weak', evidence: 'C', n: 12, provenance: 'inferred' },
];

const FILTER_TYPES = [
  { id: 'all', label: 'All', count: 15 },
  { id: 'condition', label: 'Conditions', count: 2 },
  { id: 'intervention', label: 'Interventions', count: 5 },
  { id: 'biomarker', label: 'Biomarkers', count: 4 },
  { id: 'brain_region', label: 'Brain Regions', count: 2 },
  { id: 'drug', label: 'Drugs', count: 2 },
];

// ── KPI data ────────────────────────────────────────────────────────────────
function _kpiData() {
  return {
    nodes: DEMO_NODES.length,
    edges: DEMO_EDGES.length,
    relations: [...new Set(DEMO_EDGES.map(e => e.relation))].length,
    evidenceSources: [...new Set(DEMO_EDGES.map(e => e.provenance))].length,
  };
}

// ── Color helpers ───────────────────────────────────────────────────────────
function _nodeTypeColor(type) {
  const map = {
    condition: { color: 'var(--teal)', bg: 'rgba(0,212,188,0.12)' },
    intervention: { color: 'var(--blue)', bg: 'rgba(74,158,255,0.12)' },
    biomarker: { color: 'var(--amber)', bg: 'rgba(255,181,71,0.12)' },
    brain_region: { color: 'var(--violet)', bg: 'rgba(167,139,250,0.12)' },
    drug: { color: 'var(--rose)', bg: 'rgba(251,113,133,0.12)' },
  };
  return map[type] || { color: 'var(--text-tertiary)', bg: 'rgba(255,255,255,0.06)' };
}

function _strengthBadge(strength) {
  const map = {
    strong: { color: 'var(--teal)', bg: 'rgba(0,212,188,0.12)', label: 'Strong' },
    moderate: { color: 'var(--blue)', bg: 'rgba(74,158,255,0.12)', label: 'Moderate' },
    weak: { color: 'var(--amber)', bg: 'rgba(255,181,71,0.12)', label: 'Weak' },
  };
  const s = map[strength] || map.weak;
  return `<span style="font-size:10px;font-weight:600;padding:2px 8px;border-radius:4px;background:${s.bg};color:${s.color};font-family:var(--font-mono)">${s.label}</span>`;
}

function _provenanceBadge(prov) {
  const map = {
    measured: { bg: 'rgba(0,212,188,0.1)', color: 'var(--teal)', label: 'Measured' },
    inferred: { bg: 'rgba(74,158,255,0.1)', color: 'var(--blue)', label: 'Inferred' },
    proxy: { bg: 'rgba(255,181,71,0.1)', color: 'var(--amber)', label: 'Proxy' },
  };
  const s = map[prov] || map.inferred;
  return `<span style="font-size:10px;font-weight:600;padding:2px 7px;border-radius:4px;background:${s.bg};color:${s.color};font-family:var(--font-mono)">${s.label}</span>`;
}

// ── KPI cards ───────────────────────────────────────────────────────────────
function _renderKpis() {
  const k = _kpiData();
  const cards = [
    { label: 'Nodes', value: k.nodes, sub: 'Clinical concepts', color: 'var(--teal)' },
    { label: 'Edges', value: k.edges, sub: 'Relationships mapped', color: 'var(--blue)' },
    { label: 'Relation types', value: k.relations, sub: 'Unique predicates', color: 'var(--amber)' },
    { label: 'Evidence sources', value: k.evidenceSources, sub: 'Data modalities', color: 'var(--violet)' },
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
      <strong>Knowledge graph notice:</strong> Relationships shown are derived from published literature and clinic data. Edge strengths reflect statistical association, not clinical recommendation. Always consult primary sources and evidence grades before applying to patient care.
    </div>
  `;
}

// ── Search + Filter bar ─────────────────────────────────────────────────────
let _activeFilter = 'all';
let _searchQuery = '';

function _renderSearchAndFilter() {
  return `
    <div style="margin-bottom:20px">
      <div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap">
        <div style="flex:1;min-width:240px;position:relative">
          <input type="text" id="kg-search" placeholder="Search clinical concepts..."
            value="${_searchQuery}" oninput="window._kgSearch(this.value)"
            style="width:100%;padding:8px 12px 8px 32px;border-radius:6px;border:1px solid var(--border);background:var(--navy-900);color:var(--text-primary);font-size:13px" />
          <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--text-tertiary);font-size:14px">&#128269;</span>
        </div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${FILTER_TYPES.map(f => `
          <button onclick="window._kgFilter('${f.id}')"
            style="padding:5px 12px;border-radius:6px;border:1px solid ${f.id === _activeFilter ? 'var(--border-teal)' : 'var(--border)'};background:${f.id === _activeFilter ? 'rgba(0,212,188,0.08)' : 'var(--navy-900)'};color:${f.id === _activeFilter ? 'var(--teal)' : 'var(--text-secondary)'};cursor:pointer;font-size:12px;font-weight:${f.id === _activeFilter ? '600' : '400'};font-family:var(--font-mono)">
            ${f.label} · ${f.count}
          </button>
        `).join('')}
      </div>
    </div>
  `;
}

// ── Node cards ──────────────────────────────────────────────────────────────
function _renderNodeCards() {
  const filtered = DEMO_NODES.filter(n => {
    const matchesFilter = _activeFilter === 'all' || n.type === _activeFilter;
    const q = _searchQuery.toLowerCase();
    const matchesSearch = !q || n.label.toLowerCase().includes(q) || n.type.toLowerCase().includes(q);
    return matchesFilter && matchesSearch;
  });

  if (filtered.length === 0) {
    return `
      <div style="padding:40px;text-align:center;border-radius:10px;border:1px dashed var(--border);background:var(--navy-850)">
        <div style="font-size:15px;color:var(--text-secondary);margin-bottom:8px">No concepts found</div>
        <div style="font-size:12px;color:var(--text-tertiary)">Try a different search term or filter</div>
      </div>
    `;
  }

  return `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;margin-bottom:28px">
      ${filtered.map(node => {
        const tc = _nodeTypeColor(node.type);
        return `
          <div style="padding:14px;border-radius:8px;border:1px solid var(--border);background:var(--navy-850);cursor:pointer"
            onclick="window._kgSelectNode('${node.id}')"
            onmouseover="this.style.borderColor='${tc.color}'"
            onmouseout="this.style.borderColor='var(--border)'">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
              <span style="font-size:10px;font-weight:600;padding:2px 8px;border-radius:4px;background:${tc.bg};color:${tc.color};font-family:var(--font-mono);text-transform:uppercase;letter-spacing:0.4px">${node.type.replace('_', ' ')}</span>
              ${evidenceBadge(node.grade)}
            </div>
            <div style="font-size:13.5px;font-weight:600;color:var(--text-primary);margin-bottom:6px;line-height:1.3">${node.label}</div>
            <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
              <span style="font-size:11px;color:var(--text-tertiary)"><strong style="color:var(--text-secondary)">${node.connections}</strong> connections</span>
              ${_provenanceBadge(node.provenance)}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// ── Relationship table ──────────────────────────────────────────────────────
function _renderRelationshipTable() {
  const sorted = [...DEMO_EDGES].sort((a, b) => {
    const order = { strong: 3, moderate: 2, weak: 1 };
    return (order[b.strength] || 0) - (order[a.strength] || 0);
  });

  return `
    <div style="margin-bottom:28px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <h3 style="font-size:15px;font-weight:700;margin:0;color:var(--text-primary)">Relationships</h3>
        <span style="font-size:11px;color:var(--text-tertiary)">${DEMO_EDGES.length} edges · sorted by strength</span>
      </div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead>
            <tr style="border-bottom:2px solid var(--border);background:var(--navy-850)">
              <th style="padding:10px 12px;text-align:left;font-weight:600;color:var(--text-secondary);font-size:11px">Source</th>
              <th style="padding:10px 12px;text-align:left;font-weight:600;color:var(--text-secondary);font-size:11px">Relation</th>
              <th style="padding:10px 12px;text-align:left;font-weight:600;color:var(--text-secondary);font-size:11px">Target</th>
              <th style="padding:10px 12px;text-align:center;font-weight:600;color:var(--text-secondary);font-size:11px">Strength</th>
              <th style="padding:10px 12px;text-align:center;font-weight:600;color:var(--text-secondary);font-size:11px">Evidence</th>
              <th style="padding:10px 12px;text-align:center;font-weight:600;color:var(--text-secondary);font-size:11px">n</th>
              <th style="padding:10px 12px;text-align:center;font-weight:600;color:var(--text-secondary);font-size:11px">Source</th>
            </tr>
          </thead>
          <tbody>
            ${sorted.map((e, i) => `
              <tr style="border-bottom:1px solid var(--border);${i % 2 === 0 ? 'background:var(--navy-850)' : ''}">
                <td style="padding:9px 12px;font-size:12px;color:var(--text-primary);font-weight:500">${e.source}</td>
                <td style="padding:9px 12px;font-size:11px;color:var(--text-secondary);font-family:var(--font-mono);text-transform:uppercase;letter-spacing:0.3px">${e.relation}</td>
                <td style="padding:9px 12px;font-size:12px;color:var(--text-primary)">${e.target}</td>
                <td style="padding:9px 12px;text-align:center">${_strengthBadge(e.strength)}</td>
                <td style="padding:9px 12px;text-align:center">${evidenceBadge(e.evidence)}</td>
                <td style="padding:9px 12px;text-align:center;font-family:var(--font-mono);font-size:12px;color:var(--text-secondary)">${e.n}</td>
                <td style="padding:9px 12px;text-align:center">${_provenanceBadge(e.provenance)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ── Network stats ───────────────────────────────────────────────────────────
function _renderNetworkStats() {
  const typeCounts = {};
  DEMO_NODES.forEach(n => { typeCounts[n.type] = (typeCounts[n.type] || 0) + 1; });

  const relationCounts = {};
  DEMO_EDGES.forEach(e => { relationCounts[e.relation] = (relationCounts[e.relation] || 0) + 1; });

  return `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;margin-bottom:28px">
      <div style="padding:16px;border-radius:10px;border:1px solid var(--border);background:var(--navy-850)">
        <div style="font-size:11px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:12px">Node type distribution</div>
        ${Object.entries(typeCounts).map(([type, count]) => {
          const tc = _nodeTypeColor(type);
          const pct = (count / DEMO_NODES.length * 100).toFixed(0);
          return `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
              <span style="font-size:11px;color:var(--text-secondary);width:100px;text-transform:capitalize">${type.replace('_', ' ')}</span>
              <div style="flex:1;height:6px;border-radius:3px;background:var(--navy-700)">
                <div style="height:6px;border-radius:3px;background:${tc.color};width:${pct}%"></div>
              </div>
              <span style="font-size:11px;font-family:var(--font-mono);color:${tc.color};width:32px;text-align:right">${count}</span>
            </div>
          `;
        }).join('')}
      </div>
      <div style="padding:16px;border-radius:10px;border:1px solid var(--border);background:var(--navy-850)">
        <div style="font-size:11px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:12px">Relation type distribution</div>
        ${Object.entries(relationCounts).map(([rel, count]) => {
          const pct = (count / DEMO_EDGES.length * 100).toFixed(0);
          return `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
              <span style="font-size:11px;color:var(--text-secondary);width:140px;font-family:var(--font-mono);text-transform:uppercase;letter-spacing:0.3px">${rel}</span>
              <div style="flex:1;height:6px;border-radius:3px;background:var(--navy-700)">
                <div style="height:6px;border-radius:3px;background:var(--blue);width:${pct}%"></div>
              </div>
              <span style="font-size:11px;font-family:var(--font-mono);color:var(--blue);width:32px;text-align:right">${count}</span>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

// ── Window handlers ─────────────────────────────────────────────────────────
window._kgFilter = function(filterId) {
  _activeFilter = filterId;
  _rerender();
};

window._kgSearch = function(query) {
  _searchQuery = query;
  _rerender();
};

window._kgSelectNode = function(nodeId) {
  const node = DEMO_NODES.find(n => n.id === nodeId);
  if (!node) return;
  const related = DEMO_EDGES.filter(e => e.source === node.label || e.target === node.label);
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:400;display:flex;align-items:center;justify-content:center;padding:24px';
  const tc = _nodeTypeColor(node.type);
  overlay.innerHTML = `
    <div style="background:var(--navy-850);border:1px solid var(--border);border-radius:12px;max-width:520px;width:100%;max-height:80vh;overflow:auto;padding:24px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:10px;font-weight:600;padding:3px 10px;border-radius:4px;background:${tc.bg};color:${tc.color};font-family:var(--font-mono);text-transform:uppercase">${node.type.replace('_', ' ')}</span>
          <h3 style="margin:0;font-size:16px;color:var(--text-primary)">${node.label}</h3>
        </div>
        <button onclick="this.closest('.ds-overlay').remove()" style="background:none;border:none;color:var(--text-secondary);cursor:pointer;font-size:18px">&times;</button>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
        ${evidenceBadge(node.grade)}
        ${_provenanceBadge(node.provenance)}
        <span style="font-size:10px;color:var(--text-tertiary)">${node.connections} connections</span>
      </div>
      ${related.length > 0 ? `
        <div style="font-size:11px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px">Related (${related.length})</div>
        ${related.map(r => `
          <div style="display:flex;align-items:center;gap:8px;padding:8px;border-radius:6px;background:rgba(255,255,255,0.02);margin-bottom:6px">
            <span style="font-size:12px;color:var(--text-primary)">${r.source}</span>
            <span style="font-size:10px;font-family:var(--font-mono);color:var(--text-tertiary);text-transform:uppercase">${r.relation}</span>
            <span style="font-size:12px;color:var(--text-primary)">${r.target}</span>
            <span style="margin-left:auto">${_strengthBadge(r.strength)}</span>
          </div>
        `).join('')}
      ` : '<div style="font-size:12px;color:var(--text-tertiary);padding:12px 0">No direct relationships found.</div>'}
      <div style="font-size:11px;color:var(--text-tertiary);line-height:1.5;border-top:1px solid var(--border);padding-top:12px;margin-top:12px">
        Node evidence grade reflects the quality of supporting studies for this concept. Connections are derived from published literature and clinic data.
      </div>
    </div>
  `;
  overlay.className = 'ds-overlay';
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
};

function _rerender() {
  const el = document.getElementById('kg-nodes-area');
  if (el) el.innerHTML = _renderNodeCards();
}

// ── Main render ─────────────────────────────────────────────────────────────
function _renderPage() {
  return `
    <div style="max-width:1200px;margin:0 auto;padding:20px">
      ${_renderSafetyBanner()}
      <div style="margin-bottom:20px">
        <h2 style="font-size:20px;font-weight:800;margin:0 0 4px;color:var(--text-primary)">Knowledge Graph</h2>
        <p style="margin:0;font-size:12px;color:var(--text-tertiary)">Clinical concept network for neuromodulation intelligence</p>
      </div>
      ${_renderKpis()}
      ${_renderSearchAndFilter()}
      <div id="kg-nodes-area">${_renderNodeCards()}</div>
      ${_renderRelationshipTable()}
      ${_renderNetworkStats()}
    </div>
  `;
}

// ── Entry point ─────────────────────────────────────────────────────────────
export async function pgKnowledgeGraph(setTopbar, navigate) {
  setTopbar('Knowledge Graph',
    `<button class="btn btn-sm btn-ghost" onclick="window._nav('deeptwin-insights')" style="margin-right:6px" title="Correlation engine">DeepTwin</button>` +
    `<button class="btn btn-sm btn-ghost" onclick="window._nav('multimodal-correlations')" style="margin-right:6px" title="Cross-modality correlations">Multimodal</button>`
  );

  const query = _searchQuery || '';

  // Fetch knowledge graph from API with demo fallback
  let nodes = [];
  let edges = [];
  try {
    const res = await api.searchKnowledgeGraph(query);
    nodes = res?.nodes || res?.items || [];
    edges = res?.edges || res?.relationships || [];
  } catch (err) {
    console.warn('[KnowledgeGraph] API error, using demo data:', err.message);
  }
  if (nodes && nodes.length > 0) {
    DEMO_NODES = nodes;
  }
  if (edges && edges.length > 0) {
    DEMO_EDGES = edges;
  }

  _activeFilter = 'all';
  _searchQuery = '';
  document.getElementById('content').innerHTML = _renderPage();
}

export default { pgKnowledgeGraph };
