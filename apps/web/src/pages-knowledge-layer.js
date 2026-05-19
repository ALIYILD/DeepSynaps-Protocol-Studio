// pages-knowledge-layer.js — DeepSynaps Knowledge Layer Dashboard
// Displays governed multimodal neurohealth intelligence plus pharmaceutical inventory status

import { api } from './api.js';
import { cardWrap, fr, pillSt, spinner, emptyState } from './helpers.js';

const ADAPTER_ICONS = {
  rxnorm: 'pill', pharmgkb: 'dna', clinvar: 'microscope', loinc: 'flask',
  openfda: 'shield-alert', chbmp: 'brain', mni_atlas: 'map', promis: 'clipboard-list',
  simnibs: 'zap', faers: 'alert-triangle', onsides: 'file-warning',
  allen_brain: 'brain-circuit', schaefer: 'network', neurosynth: 'search',
  adni: 'users', abide: 'users',
  clinical_neurophysiology: 'activity', ieeg: 'wave-square', tms_atlas: 'crosshair',
  deepbrain: 'brain', neuromod_devices: 'cpu',
};

const STATUS_COLORS = {
  healthy: 'var(--teal)', degraded: 'var(--yellow)', error: 'var(--red)', unknown: 'var(--text-tertiary)'
};
const PHARMA_STATUS_COLORS = {
  healthy: 'var(--teal)',
  registered: 'var(--blue)',
  degraded: 'var(--amber)',
  disabled: 'var(--text-tertiary)',
  unavailable: 'var(--red)',
  catalogued: 'var(--blue)',
  unknown: 'var(--text-tertiary)',
};
const NEUROMOD_STATUS_COLORS = {
  healthy: 'var(--teal)',
  registered: 'var(--blue)',
  degraded: 'var(--amber)',
  disabled: 'var(--text-tertiary)',
  unavailable: 'var(--red)',
  catalogued: 'var(--blue)',
  unknown: 'var(--text-tertiary)',
};

function _statusChip(label, color, bg) {
  return `<span style="font-size:10px;padding:2px 8px;border-radius:999px;background:${bg};color:${color};font-weight:700;letter-spacing:.02em">${_esc(label)}</span>`;
}

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
  let pharma = { total: 0, adapters: [] };
  let neuromod = { total: 0, sources: [] };
  try {
    status = await api.get('/knowledge/status') || {};
    adapters = status.adapters || [];
  } catch (e) {
    adapters = [];
  }
  try {
    pharma = await api.pharmaceuticalListAdapters() || { total: 0, adapters: [] };
  } catch (e) {
    pharma = { total: 0, adapters: [] };
  }
  try {
    neuromod = await api.neuromodulationListSources() || { total: 0, sources: [] };
  } catch (e) {
    neuromod = { total: 0, sources: [] };
  }

  const total = adapters.length;
  const healthy = adapters.filter(a => a.health === 'healthy').length;
  const research = adapters.filter(a => a.research_only).length;
  const totalRecords = adapters.reduce((sum, a) => sum + (a.cached_records || 0), 0);
  const pharmaAdapters = pharma.adapters || [];
  const pharmaConnected = pharmaAdapters.filter(a => ['healthy', 'registered'].includes(String(a.status || a.lifecycle_state || '').toLowerCase())).length;
  const pharmaDegraded = pharmaAdapters.filter(a => String(a.status || a.lifecycle_state || '').toLowerCase() === 'degraded').length;
  const pharmaDisabled = pharmaAdapters.filter(a => String(a.status || a.lifecycle_state || '').toLowerCase() === 'disabled').length;
  const neuromodSources = neuromod.sources || [];
  const neuromodAvailable = neuromodSources.filter(a => ['healthy', 'registered', 'degraded'].includes(String(a.status || a.lifecycle_state || '').toLowerCase())).length;
  const neuromodDisabled = neuromodSources.filter(a => String(a.status || a.lifecycle_state || '').toLowerCase() === 'disabled').length;
  const neuromodUnavailable = neuromodSources.filter(a => String(a.status || a.lifecycle_state || '').toLowerCase() === 'unavailable').length;

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

  const pharmaBanner = `
  <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg,10px);padding:14px 16px;margin-top:18px;margin-bottom:12px">
    <div style="display:flex;align-items:flex-start;gap:10px;justify-content:space-between;flex-wrap:wrap">
      <div>
        <div style="font-weight:700;font-size:13px;color:var(--text-primary);font-family:var(--font-display)">Category 1 Pharmaceutical Databases</div>
        <div style="font-size:11px;color:var(--text-secondary);margin-top:4px">Decision support only. Not a diagnosis. Not a prescription. Clinician must verify source data before any medication decision.</div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${_statusChip(`${pharmaConnected} connected`, 'var(--teal)', 'rgba(0,212,188,.10)')}
        ${_statusChip(`${pharmaDegraded} degraded`, 'var(--amber)', 'rgba(255,181,71,.10)')}
        ${_statusChip(`${pharmaDisabled} disabled`, 'var(--text-tertiary)', 'rgba(255,255,255,.06)')}
      </div>
    </div>
  </div>`;

  const pharmaCards = pharmaAdapters.length === 0
    ? emptyState('No pharmaceutical adapters registered', 'The category inventory is initializing. Connected and pending adapters will appear here once available.')
    : `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px">
      ${pharmaAdapters.map(a => {
        const status = String(a.status || a.lifecycle_state || 'unknown').toLowerCase();
        const statusColor = PHARMA_STATUS_COLORS[status] || PHARMA_STATUS_COLORS.unknown;
        const sourceVersion = a.source_version || 'unknown';
        const sourceUrl = a.source_url || '';
        const utility = a.clinical_utility || 'Decision support only.';
        return `
        <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg,10px);padding:14px 16px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
            <span style="font-size:18px;color:${statusColor}">pill</span>
            <span style="font-weight:700;font-size:13px;color:var(--text-primary);font-family:var(--font-display)">${_esc(a.display_name || a.key || 'Unknown')}</span>
            <span style="margin-left:auto;font-size:10px;padding:2px 8px;border-radius:999px;background:${a.enabled ? 'rgba(74,222,128,.10)' : 'rgba(255,255,255,.06)'};color:${a.enabled ? 'var(--green)' : 'var(--text-tertiary)'}">${a.enabled ? 'ENABLED' : 'DISABLED'}</span>
          </div>
          <div style="font-size:11px;color:var(--text-secondary);margin-bottom:6px">${_esc(a.key || '—')} · ${_esc(a.access_type || 'unknown')} · v${_esc(sourceVersion)}</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
            ${_statusChip(status, statusColor, status === 'disabled' ? 'rgba(255,255,255,.06)' : status === 'degraded' ? 'rgba(255,181,71,.10)' : 'rgba(0,212,188,.10)')}
            ${_statusChip(a.category || 'pharmaceutical', 'var(--blue)', 'rgba(74,158,255,.10)')}
            ${_statusChip(a.api_key_required ? 'API key required' : 'Free access', a.api_key_required ? 'var(--amber)' : 'var(--green)', a.api_key_required ? 'rgba(255,181,71,.10)' : 'rgba(74,222,128,.10)')}
          </div>
          <div style="font-size:11px;color:var(--text-secondary);line-height:1.45;margin-bottom:8px">${_esc(utility)}</div>
          <div style="font-size:10px;color:var(--text-tertiary);border-top:1px solid var(--border);padding-top:6px;display:flex;flex-direction:column;gap:4px">
            <span>${_esc(a.license_type || a.access_type || 'unknown')} · ${a.registered ? 'registered' : 'catalogued'}</span>
            ${sourceUrl ? `<a href="${_esc(sourceUrl)}" target="_blank" rel="noreferrer" style="color:var(--blue);text-decoration:none;word-break:break-all">${_esc(sourceUrl)}</a>` : `<span>Source URL unavailable</span>`}
          </div>
        </div>`;
      }).join('')}
    </div>`;

  const neuromodBanner = `
  <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg,10px);padding:14px 16px;margin-top:18px;margin-bottom:12px">
    <div style="display:flex;align-items:flex-start;gap:10px;justify-content:space-between;flex-wrap:wrap">
      <div>
        <div style="font-weight:700;font-size:13px;color:var(--text-primary);font-family:var(--font-display)">Category 5 Neuromodulation Sources</div>
        <div style="font-size:11px;color:var(--text-secondary);margin-top:4px">Decision support only. Not diagnosis. Not prescription. Source metadata, caveats, and provenance are shown before any planning workflow uses them.</div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${_statusChip(`${neuromodAvailable} available`, 'var(--teal)', 'rgba(0,212,188,.10)')}
        ${_statusChip(`${neuromodDisabled} disabled`, 'var(--text-tertiary)', 'rgba(255,255,255,.06)')}
        ${_statusChip(`${neuromodUnavailable} unavailable`, 'var(--amber)', 'rgba(255,181,71,.10)')}
      </div>
    </div>
  </div>`;

  const neuromodCards = neuromodSources.length === 0
    ? emptyState('No neuromodulation sources registered', 'The category inventory is initializing. SimNIBS and target atlases will appear here once available.')
    : `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px">
      ${neuromodSources.map(a => {
        const status = String(a.status || a.lifecycle_state || 'unknown').toLowerCase();
        const statusColor = NEUROMOD_STATUS_COLORS[status] || NEUROMOD_STATUS_COLORS.unknown;
        const sourceVersion = a.source_version || 'unknown';
        const sourceUrl = a.source_url || '';
        const utility = a.clinical_utility || a.clinical_utility_summary || 'Decision support only.';
        return `
        <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg,10px);padding:14px 16px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
            <span style="font-size:18px;color:${statusColor}">${ADAPTER_ICONS[a.key] || 'brain'}</span>
            <span style="font-weight:700;font-size:13px;color:var(--text-primary);font-family:var(--font-display)">${_esc(a.display_name || a.key || 'Unknown')}</span>
            <span style="margin-left:auto;font-size:10px;padding:2px 8px;border-radius:999px;background:${a.enabled ? 'rgba(74,222,128,.10)' : 'rgba(255,255,255,.06)'};color:${a.enabled ? 'var(--green)' : 'var(--text-tertiary)'}">${a.enabled ? 'ENABLED' : 'DISABLED'}</span>
          </div>
          <div style="font-size:11px;color:var(--text-secondary);margin-bottom:6px">${_esc(a.key || '—')} · ${_esc(a.access_type || 'unknown')} · v${_esc(sourceVersion)}</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
            ${_statusChip(status, statusColor, status === 'disabled' ? 'rgba(255,255,255,.06)' : status === 'degraded' ? 'rgba(255,181,71,.10)' : 'rgba(0,212,188,.10)')}
            ${_statusChip(a.category || 'neuromodulation', 'var(--blue)', 'rgba(74,158,255,.10)')}
            ${_statusChip(a.login_required ? 'login required' : 'no login', a.login_required ? 'var(--amber)' : 'var(--green)', a.login_required ? 'rgba(255,181,71,.10)' : 'rgba(74,222,128,.10)')}
          </div>
          <div style="font-size:11px;color:var(--text-secondary);line-height:1.45;margin-bottom:8px">${_esc(utility)}</div>
          <div style="font-size:10px;color:var(--text-tertiary);border-top:1px solid var(--border);padding-top:6px;display:flex;flex-direction:column;gap:4px">
            <span>${_esc(a.lifecycle_note || a.access_notes || 'Metadata only')} · ${a.enabled ? 'queryable' : 'catalogued'}</span>
            ${sourceUrl ? `<a href="${_esc(sourceUrl)}" target="_blank" rel="noreferrer" style="color:var(--blue);text-decoration:none;word-break:break-all">${_esc(sourceUrl)}</a>` : `<span>Source URL unavailable</span>`}
          </div>
        </div>`;
      }).join('')}
    </div>`;

  el.innerHTML = header + adaptersHtml + pharmaBanner + pharmaCards + neuromodBanner + neuromodCards + governance;
}
