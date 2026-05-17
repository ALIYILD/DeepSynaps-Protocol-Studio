// pages-knowledge-layer.js — DeepSynaps Knowledge Layer Dashboard
// Displays governed multimodal neurohealth intelligence from 16 database adapters

import { api, cardWrap, fr, pillSt, spinner, emptyState } from './helpers.js';

const ADAPTER_ICONS = {
  rxnorm: 'pill', pharmgkb: 'dna', clinvar: 'microscope', loinc: 'flask',
  openfda: 'shield-alert', chbmp: 'brain', mni_atlas: 'map', promis: 'clipboard-list',
  simnibs: 'zap', faers: 'alert-triangle', onsides: 'file-warning',
  allen_brain: 'brain-circuit', schaefer: 'network', neurosynth: 'search',
  adni: 'users', abide: 'users'
};

const STATUS_COLORS = {
  healthy: 'var(--teal)', degraded: 'var(--yellow)', error: 'var(--red)', unknown: 'var(--text-tertiary)'
};

function _esc(v) {
  if (v == null) return '';
  return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

export async function pgKnowledgeLayer(setTopbar) {
  setTopbar('Knowledge Layer', 'Governed multimodal neurohealth intelligence');
  const el = document.getElementById('content');
  el.innerHTML = spinner();

  let adapters = [];
  let status = {};
  try {
    status = await api.get('/knowledge/status') || {};
    adapters = status.adapters || [];
  } catch (e) {
    adapters = [];
  }

  const total = adapters.length;
  const healthy = adapters.filter(a => a.health === 'healthy').length;
  const research = adapters.filter(a => a.research_only).length;
  const totalRecords = adapters.reduce((sum, a) => sum + (a.cached_records || 0), 0);

  // Header stats
  const header = `
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;margin-bottom:18px">
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg,10px);padding:14px 16px;text-align:center">
      <div style="font-size:20px;font-weight:800;color:var(--teal);font-family:var(--font-display)">${total}</div>
      <div style="font-size:10.5px;color:var(--text-tertiary)">Active adapters</div>
    </div>
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg,10px);padding:14px 16px;text-align:center">
      <div style="font-size:20px;font-weight:800;color:var(--green);font-family:var(--font-display)">${healthy}</div>
      <div style="font-size:10.5px;color:var(--text-tertiary)">Healthy</div>
    </div>
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg,10px);padding:14px 16px;text-align:center">
      <div style="font-size:20px;font-weight:800;color:var(--blue);font-family:var(--font-display)">${totalRecords.toLocaleString()}</div>
      <div style="font-size:10.5px;color:var(--text-tertiary)">Cached records</div>
    </div>
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg,10px);padding:14px 16px;text-align:center">
      <div style="font-size:20px;font-weight:800;color:var(--orange);font-family:var(--font-display)">${research}</div>
      <div style="font-size:10.5px;color:var(--text-tertiary)">Research-only</div>
    </div>
  </div>`;

  // Adapter cards
  let adaptersHtml = '';
  if (adapters.length === 0) {
    adaptersHtml = emptyState('No adapters registered', 'The knowledge layer is initializing. Adapters will appear here once connected.');
  } else {
    adaptersHtml = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px">
    ${adapters.map(a => {
      const icon = ADAPTER_ICONS[a.name] || 'database';
      const healthColor = STATUS_COLORS[a.health] || STATUS_COLORS.unknown;
      const license = a.license || 'Unknown';
      const prov = a.provenance || {};
      return `
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg,10px);padding:14px 16px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <span style="font-size:18px;color:${healthColor}">${icon}</span>
          <span style="font-weight:700;font-size:13px;color:var(--text-primary);font-family:var(--font-display)">${_esc(a.name || 'Unknown')}</span>
          <span style="margin-left:auto;font-size:10px;padding:2px 8px;border-radius:999px;background:${a.research_only ? 'var(--orange-10)' : 'var(--green-10)'};color:${a.research_only ? 'var(--orange)' : 'var(--green)'}">${a.research_only ? 'R-ONLY' : 'CLINICAL'}</span>
        </div>
        <div style="font-size:11px;color:var(--text-secondary);margin-bottom:6px">${_esc(a.source_database || '—')} · v${_esc(a.source_version || '?')}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
          ${pillSt(a.health || 'unknown', {color: healthColor})}
          ${pillSt(license, {color: 'var(--text-tertiary)'})}
          ${a.cached_records ? pillSt(`${a.cached_records.toLocaleString()} records`, {color: 'var(--blue)'}) : ''}
        </div>
        <div style="font-size:10px;color:var(--text-tertiary);border-top:1px solid var(--border);padding-top:6px">
          ${_esc(a.provenance?.license_type || license)} · Updated: ${_esc(a.provenance?.update_timestamp?.slice(0,10) || '?')}
        </div>
      </div>`;
    }).join('')}
    </div>`;
  }

  // Governance notice
  const governance = `
  <div style="background:var(--blue-5);border:1px solid var(--blue-20);border-radius:var(--radius-lg,10px);padding:12px 16px;margin-top:18px;display:flex;align-items:center;gap:10px">
    <span style="font-size:18px;color:var(--blue)">shield-check</span>
    <div>
      <div style="font-weight:700;font-size:12px;color:var(--blue)">Governance Active</div>
      <div style="font-size:10.5px;color:var(--text-secondary)">All data carries provenance, confidence scoring, and research-only flags. <a href="#" style="color:var(--blue)">View governance docs</a></div>
    </div>
  </div>`;

  el.innerHTML = header + adaptersHtml + governance;
}
