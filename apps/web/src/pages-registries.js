// ── DeepSynaps Registry Browser Pages ─────────────────────────────────────────
// 10 registry browsers: Condition, Assessment, Protocol, Device, Brain Target,
// Consent/Document, Report Template, Handbook, Home Program, Virtual Care.
// All pages import from registries.js and fall back to those constants if the
// API is unavailable. API-first, local-fallback pattern consistent with rest of app.
// ─────────────────────────────────────────────────────────────────────────────

import {
  CONDITION_REGISTRY,
  ASSESSMENT_REGISTRY,
  PROTOCOL_REGISTRY,
  DEVICE_REGISTRY,
  BRAIN_TARGET_REGISTRY,
  CONSENT_REGISTRY,
  REPORT_TEMPLATE_REGISTRY,
  HANDBOOK_REGISTRY,
  HOME_PROGRAM_REGISTRY,
  VIRTUAL_CARE_REGISTRY,
} from './registries.js';
import { renderRegistryInfoModal } from './registry-widget-info.js';

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function mountRegistryInfoModal(kind) {
  try { document.getElementById('ds-registry-info-modal-root')?.remove(); } catch {}
  const root = document.createElement('div');
  root.id = 'ds-registry-info-modal-root';
  root.innerHTML = renderRegistryInfoModal(kind);
  document.body.appendChild(root);
  window._closeRegistryInfo = (fromBackdrop) => {
    try { document.getElementById('ds-registry-info-modal-root')?.remove(); } catch {}
    if (!fromBackdrop) return;
  };
  // ESC closes
  const onKey = (e) => {
    if (e.key === 'Escape') window._closeRegistryInfo?.(false);
  };
  window.addEventListener('keydown', onKey, { once: true });
}

// ── Shared UI helpers ─────────────────────────────────────────────────────────

function evBadge(ev) {
  const color = ev === 'A' ? 'var(--green,#22c55e)' : ev === 'B' ? 'var(--amber-500,#f59e0b)' : 'var(--text-tertiary,#64748b)';
  return `<span style="display:inline-block;padding:1px 7px;border-radius:10px;font-size:0.68rem;font-weight:700;background:${color}20;color:${color};border:1px solid ${color}40">Ev-${esc(ev)}</span>`;
}

function labelBadge(onLabel) {
  if (!onLabel || !onLabel.length) return '';
  return `<span style="display:inline-block;padding:1px 7px;border-radius:10px;font-size:0.68rem;font-weight:700;background:#3b82f620;color:#60a5fa;border:1px solid #3b82f640">${onLabel.map(esc).join(' · ')}</span>`;
}

function catChip(cat, active) {
  const bg = active ? 'var(--accent,#6366f1)' : 'var(--surface-2,rgba(255,255,255,.06))';
  const col = active ? '#fff' : 'var(--text-secondary,#94a3b8)';
  return `<button style="padding:4px 12px;border-radius:20px;font-size:0.75rem;font-weight:600;background:${bg};color:${col};border:1px solid ${active?'transparent':'var(--border,rgba(255,255,255,.1))'};cursor:pointer;white-space:nowrap"`;
}

function registryShell(el, title, filtersHtml, gridHtml) {
  el.innerHTML = `
    <div style="padding:24px;max-width:1400px;margin:0 auto">
      <div style="margin-bottom:20px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        ${filtersHtml}
      </div>
      <div id="reg-grid" style="display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(320px,1fr))">
        ${gridHtml}
      </div>
    </div>
  `;
}

function emptyState(msg) {
  return `<div style="grid-column:1/-1;text-align:center;padding:48px;color:var(--text-tertiary,#64748b);font-size:0.9rem">${msg}</div>`;
}

function regCard(header, body, footer) {
  return `
    <div style="background:var(--surface-1,rgba(255,255,255,.04));border:1px solid var(--border,rgba(255,255,255,.1));border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:8px">
      <div>${header}</div>
      <div style="font-size:0.82rem;color:var(--text-secondary,#94a3b8);line-height:1.5">${body}</div>
      ${footer ? `<div style="margin-top:4px;display:flex;gap:6px;flex-wrap:wrap">${footer}</div>` : ''}
    </div>
  `;
}

/** Clickable card: opens item detail modal (cross-registry context) via `window._openRegItemDetail`. */
function regCardClickable(kind, index, header, body, footer) {
  const foot = footer ? `<div style="margin-top:4px;display:flex;gap:6px;flex-wrap:wrap">${footer}</div>` : '';
  const k = JSON.stringify(kind);
  return `
    <div class="reg-card-clickable" role="button" tabindex="0" aria-label="Open registry entry details"
      onclick="window._openRegItemDetail(${k},${index})"
      onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window._openRegItemDetail(${k},${index});}"
      style="background:var(--surface-1,rgba(255,255,255,.04));border:1px solid var(--border,rgba(255,255,255,.1));border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:8px">
      <div>${header}</div>
      <div style="font-size:0.82rem;color:var(--text-secondary,#94a3b8);line-height:1.5">${body}</div>
      ${foot}
    </div>
  `;
}

function searchBar(id, placeholder) {
  return `<input id="${id}" type="search" placeholder="${esc(placeholder)}" style="padding:7px 14px;border-radius:8px;border:1px solid var(--border,rgba(255,255,255,.12));background:var(--surface-1,rgba(255,255,255,.04));color:var(--text-primary,#e2e8f0);font-size:0.85rem;min-width:220px;flex:1;max-width:340px" oninput="window._regSearch(this.value)" />`;
}

function filterBar(items, activeId, handlerName) {
  return `<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
    ${items.map(c => `${catChip(c, c === activeId)} onclick="${handlerName}('${esc(c)}')">${esc(c)}</button>`).join('')}
  </div>`;
}

// ── 1. CONDITION REGISTRY ─────────────────────────────────────────────────────
export async function pgConditionRegistry(setTopbar) {
  setTopbar('Condition Registry', `
    <div style="display:flex;gap:8px">
      <span style="font-size:0.8rem;color:var(--text-secondary);align-self:center">53 conditions</span>
      <button class="btn btn-sm" onclick="window._regAbout?.('conditions')">ℹ About</button>
    </div>
  `);
  const el = document.getElementById('content');
  if (!el) return;
  window._regAbout = (k) => mountRegistryInfoModal(k);

  const cats = ['All', ...new Set(CONDITION_REGISTRY.map(c => c.cat))];
  let activeCat = 'All';
  let query = '';

  function render() {
    const data = CONDITION_REGISTRY.filter(c => {
      const matchCat = activeCat === 'All' || c.cat === activeCat;
      const q = query.toLowerCase();
      const matchQ = !q || c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q) || c.icd10.toLowerCase().includes(q) || (c.notes||'').toLowerCase().includes(q);
      return matchCat && matchQ;
    });

    window._regDetailItems = data;
    const cards = data.length
      ? data.map((c, i) => regCardClickable('conditions', i,
          `<div style="display:flex;align-items:flex-start;gap:8px;justify-content:space-between">
            <div>
              <div style="font-weight:600;font-size:0.9rem;color:var(--text-primary)">${esc(c.name)}</div>
              <div style="font-size:0.75rem;color:var(--text-tertiary);margin-top:2px">${esc(c.icd10)} · ${esc(c.cat)}</div>
            </div>
            ${evBadge(c.ev)}
          </div>`,
          `<div><span style="color:var(--text-tertiary);font-size:0.75rem">Modalities:</span> ${c.modalities.map(esc).join(', ')}</div>
           <div><span style="color:var(--text-tertiary);font-size:0.75rem">Targets:</span> ${c.targets.map(esc).join(', ')}</div>
           ${c.notes ? `<div style="margin-top:4px;color:var(--text-secondary)">${esc(c.notes)}</div>` : ''}
           <div style="margin-top:8px;font-size:0.72rem;color:var(--text-tertiary)">Click for cross-registry context · references</div>`,
          `${labelBadge(c.onLabel)}${(c.flags||[]).map(f => `<span style="padding:1px 7px;border-radius:10px;font-size:0.68rem;font-weight:600;background:var(--red-500,#ef4444)20;color:#f87171;border:1px solid #ef444440">${esc(f)}</span>`).join('')}`
        )).join('')
      : emptyState('No conditions match your filter.');

    el.innerHTML = `
      <div style="padding:24px;max-width:1400px;margin:0 auto">
        <div style="margin-bottom:16px;display:flex;gap:12px;flex-wrap:wrap;align-items:center">
          <input id="cond-search" type="search" placeholder="Search conditions, ICD-10…" value="${esc(query)}"
            style="padding:7px 14px;border-radius:8px;border:1px solid var(--border,rgba(255,255,255,.12));background:var(--surface-1,rgba(255,255,255,.04));color:var(--text-primary,#e2e8f0);font-size:0.85rem;min-width:220px;flex:1;max-width:340px"
            oninput="window._condSearch(this.value)" />
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${cats.map(c => `<button style="padding:4px 12px;border-radius:20px;font-size:0.75rem;font-weight:600;background:${c===activeCat?'var(--accent,#6366f1)':'var(--surface-2,rgba(255,255,255,.06))'};color:${c===activeCat?'#fff':'var(--text-secondary)'};border:1px solid ${c===activeCat?'transparent':'var(--border,rgba(255,255,255,.1))'};cursor:pointer" onclick="window._condCat('${esc(c)}')">${esc(c)}</button>`).join('')}
          </div>
        </div>
        <div style="display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(300px,1fr))">
          ${cards}
        </div>
      </div>
    `;
  }

  window._condSearch = (v) => { query = v; render(); };
  window._condCat    = (v) => { activeCat = v; render(); };
  render();
}

// ── 2. ASSESSMENT REGISTRY ────────────────────────────────────────────────────
export async function pgAssessmentRegistry(setTopbar) {
  setTopbar('Assessment Registry', `
    <span style="font-size:0.8rem;color:var(--text-secondary);align-self:center">${ASSESSMENT_REGISTRY.length} instruments</span>
    <button class="btn btn-sm" onclick="window._regAbout?.('assessments')">ℹ About</button>
  `);
  const el = document.getElementById('content');
  if (!el) return;
  window._regAbout = (k) => mountRegistryInfoModal(k);

  const domains = ['All', ...new Set(ASSESSMENT_REGISTRY.map(a => a.domain))];
  const types   = ['All', 'Self-report', 'Clinician', 'Structured'];
  let activeDomain = 'All';
  let activeType   = 'All';
  let query = '';

  function render() {
    const data = ASSESSMENT_REGISTRY.filter(a => {
      const matchD = activeDomain === 'All' || a.domain === activeDomain;
      const matchT = activeType === 'All' || a.type === activeType;
      const q = query.toLowerCase();
      const matchQ = !q || a.name.toLowerCase().includes(q) || a.domain.toLowerCase().includes(q) || a.scoring.toLowerCase().includes(q);
      return matchD && matchT && matchQ;
    });

    window._regDetailItems = data;
    const cards = data.length
      ? data.map((a, i) => regCardClickable('assessments', i,
          `<div style="display:flex;align-items:flex-start;gap:8px;justify-content:space-between">
            <div>
              <div style="font-weight:600;font-size:0.9rem;color:var(--text-primary)">${esc(a.name)}</div>
              <div style="font-size:0.75rem;color:var(--text-tertiary);margin-top:2px">${esc(a.domain)} · ${esc(a.type)}</div>
            </div>
            ${evBadge(a.ev)}
          </div>`,
          `<div>${esc(a.scoring)}</div>
           <div style="margin-top:4px"><span style="color:var(--text-tertiary);font-size:0.75rem">Items:</span> ${esc(a.items)} · <span style="color:var(--text-tertiary);font-size:0.75rem">~${esc(a.mins)} min</span></div>
           <div style="margin-top:2px"><span style="color:var(--text-tertiary);font-size:0.75rem">Freq:</span> ${a.freq.map(esc).join(', ')}</div>
           <div style="margin-top:8px;font-size:0.72rem;color:var(--text-tertiary)">Click for cross-registry context · references</div>`,
          `<span style="padding:1px 7px;border-radius:10px;font-size:0.68rem;font-weight:600;background:var(--surface-2,rgba(255,255,255,.06));color:var(--text-secondary);border:1px solid var(--border)">${esc(a.type)}</span>`
        )).join('')
      : emptyState('No assessments match.');

    el.innerHTML = `
      <div style="padding:24px;max-width:1400px;margin:0 auto">
        <div style="margin-bottom:16px;display:flex;gap:12px;flex-wrap:wrap;align-items:center">
          <input id="assess-search" type="search" placeholder="Search instruments…" value="${esc(query)}"
            style="padding:7px 14px;border-radius:8px;border:1px solid var(--border,rgba(255,255,255,.12));background:var(--surface-1,rgba(255,255,255,.04));color:var(--text-primary);font-size:0.85rem;min-width:220px;flex:1;max-width:340px"
            oninput="window._assessSearch(this.value)" />
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${domains.map(d => `<button style="padding:4px 12px;border-radius:20px;font-size:0.75rem;font-weight:600;background:${d===activeDomain?'var(--accent,#6366f1)':'var(--surface-2,rgba(255,255,255,.06))'};color:${d===activeDomain?'#fff':'var(--text-secondary)'};border:1px solid ${d===activeDomain?'transparent':'var(--border)'};cursor:pointer" onclick="window._assessDomain('${esc(d)}')">${esc(d)}</button>`).join('')}
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${types.map(t => `<button style="padding:4px 10px;border-radius:20px;font-size:0.72rem;font-weight:500;background:${t===activeType?'#475569':'var(--surface-2,rgba(255,255,255,.04))'};color:${t===activeType?'#fff':'var(--text-tertiary)'};border:1px solid var(--border);cursor:pointer" onclick="window._assessType('${esc(t)}')">${esc(t)}</button>`).join('')}
          </div>
        </div>
        <div style="display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(300px,1fr))">
          ${cards}
        </div>
      </div>
    `;
  }

  window._assessSearch = (v) => { query = v; render(); };
  window._assessDomain = (v) => { activeDomain = v; render(); };
  window._assessType   = (v) => { activeType = v; render(); };
  render();
}

// ── 3. PROTOCOL REGISTRY ──────────────────────────────────────────────────────
export async function pgProtocolRegistryPage(setTopbar) {
  setTopbar('Protocol Registry', `
    <span style="font-size:0.8rem;color:var(--text-secondary);align-self:center">${PROTOCOL_REGISTRY.length} templates</span>
    <button class="btn btn-sm" onclick="window._regAbout?.('protocols')">ℹ About</button>
  `);
  const el = document.getElementById('content');
  if (!el) return;
  window._regAbout = (k) => mountRegistryInfoModal(k);

  const modalities = ['All', ...new Set(PROTOCOL_REGISTRY.map(p => p.modality))];
  let activeMod = 'All';
  let query = '';

  function render() {
    const data = PROTOCOL_REGISTRY.filter(p => {
      const matchM = activeMod === 'All' || p.modality === activeMod;
      const q = query.toLowerCase();
      const matchQ = !q || p.name.toLowerCase().includes(q) || p.condition.toLowerCase().includes(q) || p.target.toLowerCase().includes(q);
      return matchM && matchQ;
    });

    window._regDetailItems = data;
    const cards = data.length
      ? data.map((p, i) => regCardClickable('protocols', i,
          `<div style="display:flex;align-items:flex-start;gap:8px;justify-content:space-between">
            <div>
              <div style="font-weight:600;font-size:0.9rem;color:var(--text-primary)">${esc(p.name)}</div>
              <div style="font-size:0.75rem;color:var(--text-tertiary);margin-top:2px">${esc(p.modality)} · ${esc(p.condition)}</div>
            </div>
            ${evBadge(p.ev)}
          </div>`,
          `<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;font-size:0.8rem">
            <div><span style="color:var(--text-tertiary);font-size:0.72rem">Target</span><br>${esc(p.target)}</div>
            <div><span style="color:var(--text-tertiary);font-size:0.72rem">Laterality</span><br>${esc(p.laterality)}</div>
            <div><span style="color:var(--text-tertiary);font-size:0.72rem">Frequency</span><br>${esc(p.freq)}</div>
            <div><span style="color:var(--text-tertiary);font-size:0.72rem">Intensity</span><br>${esc(p.intensity)}</div>
            <div><span style="color:var(--text-tertiary);font-size:0.72rem">Sessions</span><br>${esc(p.sessions)} (${esc(p.sessPerWeek)}×/wk, ${esc(p.duration)})</div>
          </div>
          ${p.notes ? `<div style="margin-top:6px;color:var(--text-secondary);font-size:0.8rem">${esc(p.notes)}</div>` : ''}
          <div style="margin-top:8px;font-size:0.72rem;color:var(--text-tertiary)">Click for cross-registry context · references</div>`,
          p.onLabel ? `<span style="padding:1px 7px;border-radius:10px;font-size:0.68rem;font-weight:700;background:#22c55e20;color:#4ade80;border:1px solid #22c55e40">On-Label</span>` : ''
        )).join('')
      : emptyState('No protocols match.');

    el.innerHTML = `
      <div style="padding:24px;max-width:1400px;margin:0 auto">
        <div style="margin-bottom:16px;display:flex;gap:12px;flex-wrap:wrap;align-items:center">
          <input type="search" placeholder="Search protocols…" value="${esc(query)}"
            style="padding:7px 14px;border-radius:8px;border:1px solid var(--border,rgba(255,255,255,.12));background:var(--surface-1,rgba(255,255,255,.04));color:var(--text-primary);font-size:0.85rem;min-width:220px;flex:1;max-width:340px"
            oninput="window._protoSearch(this.value)" />
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${modalities.map(m => `<button style="padding:4px 12px;border-radius:20px;font-size:0.75rem;font-weight:600;background:${m===activeMod?'var(--accent,#6366f1)':'var(--surface-2,rgba(255,255,255,.06))'};color:${m===activeMod?'#fff':'var(--text-secondary)'};border:1px solid ${m===activeMod?'transparent':'var(--border)'};cursor:pointer" onclick="window._protoMod('${esc(m)}')">${esc(m)}</button>`).join('')}
          </div>
        </div>
        <div style="display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(320px,1fr))">
          ${cards}
        </div>
      </div>
    `;
  }

  window._protoSearch = (v) => { query = v; render(); };
  window._protoMod    = (v) => { activeMod = v; render(); };
  render();
}

// ── 4. DEVICE REGISTRY ────────────────────────────────────────────────────────
export async function pgDeviceRegistry(setTopbar) {
  setTopbar('Device Registry', `
    <span style="font-size:0.8rem;color:var(--text-secondary);align-self:center">${DEVICE_REGISTRY.length} devices</span>
    <button class="btn btn-sm" onclick="window._regAbout?.('devices')">ℹ About</button>
  `);
  const el = document.getElementById('content');
  if (!el) return;
  window._regAbout = (k) => mountRegistryInfoModal(k);

  const modalities = ['All', ...new Set(DEVICE_REGISTRY.map(d => d.modality))];
  const settings   = ['All', 'Clinic', 'Home', 'Both'];
  let activeMod = 'All';
  let activeSetting = 'All';
  let query = '';

  function render() {
    const data = DEVICE_REGISTRY.filter(d => {
      const matchM = activeMod === 'All' || d.modality === activeMod;
      const matchS = activeSetting === 'All' || d.homeClinic === activeSetting;
      const q = query.toLowerCase();
      const matchQ = !q || d.name.toLowerCase().includes(q) || d.mfr.toLowerCase().includes(q) || d.indication.toLowerCase().includes(q);
      return matchM && matchS && matchQ;
    });

    const settingColor = { Clinic:'#60a5fa', Home:'#4ade80', Both:'#c084fc' };

    window._regDetailItems = data;
    const cards = data.length
      ? data.map((d, i) => regCardClickable('devices', i,
          `<div style="display:flex;align-items:flex-start;gap:8px;justify-content:space-between">
            <div>
              <div style="font-weight:600;font-size:0.9rem;color:var(--text-primary)">${esc(d.name)}</div>
              <div style="font-size:0.75rem;color:var(--text-tertiary);margin-top:2px">${esc(d.mfr)} · ${esc(d.modality)}</div>
            </div>
            <span style="padding:1px 8px;border-radius:10px;font-size:0.68rem;font-weight:700;white-space:nowrap;background:${settingColor[d.homeClinic]||'#94a3b8'}20;color:${settingColor[d.homeClinic]||'#94a3b8'};border:1px solid ${settingColor[d.homeClinic]||'#94a3b8'}40">${esc(d.homeClinic)}</span>
          </div>`,
          `<div><span style="color:var(--text-tertiary);font-size:0.72rem">Type:</span> ${esc(d.type)}</div>
           <div><span style="color:var(--text-tertiary);font-size:0.72rem">Clearance:</span> ${esc(d.clearance)}</div>
           <div><span style="color:var(--text-tertiary);font-size:0.72rem">Indication:</span> ${esc(d.indication)}</div>
           ${d.notes ? `<div style="margin-top:4px;color:var(--text-secondary)">${esc(d.notes)}</div>` : ''}
           <div style="margin-top:8px;font-size:0.72rem;color:var(--text-tertiary)">Click for cross-registry context · references</div>`,
          `<span style="padding:1px 7px;border-radius:10px;font-size:0.68rem;font-weight:600;background:var(--surface-2,rgba(255,255,255,.06));color:var(--text-secondary);border:1px solid var(--border)">${esc(d.channels)} ch</span>`
        )).join('')
      : emptyState('No devices match.');

    el.innerHTML = `
      <div style="padding:24px;max-width:1400px;margin:0 auto">
        <div style="margin-bottom:16px;display:flex;gap:12px;flex-wrap:wrap;align-items:center">
          <input type="search" placeholder="Search devices, manufacturers…" value="${esc(query)}"
            style="padding:7px 14px;border-radius:8px;border:1px solid var(--border,rgba(255,255,255,.12));background:var(--surface-1,rgba(255,255,255,.04));color:var(--text-primary);font-size:0.85rem;min-width:220px;flex:1;max-width:340px"
            oninput="window._devSearch(this.value)" />
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${modalities.map(m => `<button style="padding:4px 12px;border-radius:20px;font-size:0.75rem;font-weight:600;background:${m===activeMod?'var(--accent,#6366f1)':'var(--surface-2,rgba(255,255,255,.06))'};color:${m===activeMod?'#fff':'var(--text-secondary)'};border:1px solid ${m===activeMod?'transparent':'var(--border)'};cursor:pointer" onclick="window._devMod('${esc(m)}')">${esc(m)}</button>`).join('')}
          </div>
          <div style="display:flex;gap:6px">
            ${settings.map(s => `<button style="padding:4px 10px;border-radius:20px;font-size:0.72rem;font-weight:500;background:${s===activeSetting?'#475569':'var(--surface-2,rgba(255,255,255,.04))'};color:${s===activeSetting?'#fff':'var(--text-tertiary)'};border:1px solid var(--border);cursor:pointer" onclick="window._devSetting('${esc(s)}')">${esc(s)}</button>`).join('')}
          </div>
        </div>
        <div style="display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(300px,1fr))">
          ${cards}
        </div>
      </div>
    `;
  }

  window._devSearch  = (v) => { query = v; render(); };
  window._devMod     = (v) => { activeMod = v; render(); };
  window._devSetting = (v) => { activeSetting = v; render(); };
  render();
}

// ── 5. BRAIN TARGET REGISTRY ──────────────────────────────────────────────────
export async function pgBrainTargetRegistry(setTopbar) {
  setTopbar('Brain Target Registry', `
    <span style="font-size:0.8rem;color:var(--text-secondary);align-self:center">${BRAIN_TARGET_REGISTRY.length} sites · 10–20 / 10–10 mapped</span>
    <button class="btn btn-sm" onclick="window._regAbout?.('targets')">ℹ About</button>
  `);
  const el = document.getElementById('content');
  if (!el) return;
  window._regAbout = (k) => mountRegistryInfoModal(k);

  const lobes = ['All', ...new Set(BRAIN_TARGET_REGISTRY.map(t => t.lobe))];
  let activeLobe = 'All';
  let query = '';

  function render() {
    const data = BRAIN_TARGET_REGISTRY.filter(t => {
      const matchL = activeLobe === 'All' || t.lobe === activeLobe;
      const q = query.toLowerCase();
      const matchQ = !q || t.label.toLowerCase().includes(q) || t.region.toLowerCase().includes(q) || t.clinical.toLowerCase().includes(q) || t.site10_20.toLowerCase().includes(q);
      return matchL && matchQ;
    });

    const lobeColor = {
      Frontal:'#818cf8', Parietal:'#60a5fa', Temporal:'#34d399',
      Occipital:'#f59e0b', Subcortical:'#f472b6', Cerebellar:'#a78bfa', Peripheral:'#94a3b8',
    };

    window._regDetailItems = data;
    const cards = data.length
      ? data.map((t, i) => regCardClickable('targets', i,
          `<div style="display:flex;align-items:flex-start;gap:8px;justify-content:space-between">
            <div>
              <div style="font-weight:700;font-size:0.95rem;color:var(--text-primary)">${esc(t.label)}</div>
              <div style="font-size:0.73rem;color:var(--text-tertiary);margin-top:2px">${esc(t.region)}</div>
            </div>
            <span style="padding:1px 8px;border-radius:10px;font-size:0.68rem;font-weight:700;white-space:nowrap;background:${lobeColor[t.lobe]||'#94a3b8'}20;color:${lobeColor[t.lobe]||'#94a3b8'};border:1px solid ${lobeColor[t.lobe]||'#94a3b8'}40">${esc(t.lobe)}</span>
          </div>`,
          `<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;font-size:0.8rem;margin-bottom:6px">
            <div><span style="color:var(--text-tertiary);font-size:0.72rem">10–20</span><br><strong>${esc(t.site10_20)}</strong></div>
            <div><span style="color:var(--text-tertiary);font-size:0.72rem">10–10</span><br><strong>${esc(t.site10_10)}</strong></div>
            <div><span style="color:var(--text-tertiary);font-size:0.72rem">BA</span><br>${esc(t.ba)}</div>
          </div>
          <div style="color:var(--text-secondary);font-size:0.79rem"><span style="color:var(--text-tertiary)">Function:</span> ${esc(t.function)}</div>
          <div style="color:var(--text-secondary);font-size:0.79rem;margin-top:3px"><span style="color:var(--text-tertiary)">Clinical use:</span> ${esc(t.clinical)}</div>
          <div style="margin-top:8px;font-size:0.72rem;color:var(--text-tertiary)">Click for cross-registry context · references</div>`,
          ''
        )).join('')
      : emptyState('No targets match.');

    el.innerHTML = `
      <div style="padding:24px;max-width:1400px;margin:0 auto">
        <div style="margin-bottom:16px;display:flex;gap:12px;flex-wrap:wrap;align-items:center">
          <input type="search" placeholder="Search site, region, condition…" value="${esc(query)}"
            style="padding:7px 14px;border-radius:8px;border:1px solid var(--border,rgba(255,255,255,.12));background:var(--surface-1,rgba(255,255,255,.04));color:var(--text-primary);font-size:0.85rem;min-width:220px;flex:1;max-width:340px"
            oninput="window._btSearch(this.value)" />
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${lobes.map(l => `<button style="padding:4px 12px;border-radius:20px;font-size:0.75rem;font-weight:600;background:${l===activeLobe?'var(--accent,#6366f1)':'var(--surface-2,rgba(255,255,255,.06))'};color:${l===activeLobe?'#fff':'var(--text-secondary)'};border:1px solid ${l===activeLobe?'transparent':'var(--border)'};cursor:pointer" onclick="window._btLobe('${esc(l)}')">${esc(l)}</button>`).join('')}
          </div>
        </div>
        <div style="display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(300px,1fr))">
          ${cards}
        </div>
      </div>
    `;
  }

  window._btSearch = (v) => { query = v; render(); };
  window._btLobe   = (v) => { activeLobe = v; render(); };
  render();
}

// ── 6. CONSENT / DOCUMENT REGISTRY ───────────────────────────────────────────
export async function pgConsentRegistry(setTopbar) {
  setTopbar('Consent & Document Registry', `
    <span style="font-size:0.8rem;color:var(--text-secondary);align-self:center">${CONSENT_REGISTRY.length} templates</span>
    <button class="btn btn-sm" onclick="window._regAbout?.('consent')">ℹ About</button>
  `);
  const el = document.getElementById('content');
  if (!el) return;
  window._regAbout = (k) => mountRegistryInfoModal(k);

  const cats = ['All', ...new Set(CONSENT_REGISTRY.map(c => c.cat))];
  let activeCat = 'All';
  let query = '';

  function render() {
    const data = CONSENT_REGISTRY.filter(c => {
      const matchC = activeCat === 'All' || c.cat === activeCat;
      const q = query.toLowerCase();
      const matchQ = !q || c.name.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q);
      return matchC && matchQ;
    });

    const catColor = { Intake:'#60a5fa', Consent:'#f59e0b', Privacy:'#a78bfa', Caregiver:'#34d399', Clinical:'#f472b6' };

    window._regDetailItems = data;
    const cards = data.length
      ? data.map((c, i) => regCardClickable('consent', i,
          `<div style="display:flex;align-items:flex-start;gap:8px;justify-content:space-between">
            <div>
              <div style="font-weight:600;font-size:0.9rem;color:var(--text-primary)">${esc(c.name)}</div>
              <div style="font-size:0.72rem;color:var(--text-tertiary);margin-top:2px">v${esc(c.version)} · ${esc(c.cat)}</div>
            </div>
            <span style="padding:1px 8px;border-radius:10px;font-size:0.68rem;font-weight:700;white-space:nowrap;background:${catColor[c.cat]||'#94a3b8'}20;color:${catColor[c.cat]||'#94a3b8'};border:1px solid ${catColor[c.cat]||'#94a3b8'}40">${esc(c.cat)}</span>
          </div>`,
          `<div>${esc(c.desc)}</div>
           <div style="margin-top:6px;font-size:0.75rem;color:var(--text-tertiary)">Fields: ${c.fields.map(esc).join(', ')}</div>
           <div style="margin-top:8px;font-size:0.72rem;color:var(--text-tertiary)">Click for cross-registry context · references</div>`,
          c.required ? `<span style="padding:1px 7px;border-radius:10px;font-size:0.68rem;font-weight:700;background:#ef444420;color:#f87171;border:1px solid #ef444440">Required</span>` : `<span style="padding:1px 7px;border-radius:10px;font-size:0.68rem;background:var(--surface-2,rgba(255,255,255,.06));color:var(--text-tertiary);border:1px solid var(--border)">Optional</span>`
        )).join('')
      : emptyState('No documents match.');

    el.innerHTML = `
      <div style="padding:24px;max-width:1400px;margin:0 auto">
        <div style="margin-bottom:16px;display:flex;gap:12px;flex-wrap:wrap;align-items:center">
          <input type="search" placeholder="Search consent forms, documents…" value="${esc(query)}"
            style="padding:7px 14px;border-radius:8px;border:1px solid var(--border,rgba(255,255,255,.12));background:var(--surface-1,rgba(255,255,255,.04));color:var(--text-primary);font-size:0.85rem;min-width:220px;flex:1;max-width:340px"
            oninput="window._consentSearch(this.value)" />
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${cats.map(c => `<button style="padding:4px 12px;border-radius:20px;font-size:0.75rem;font-weight:600;background:${c===activeCat?'var(--accent,#6366f1)':'var(--surface-2,rgba(255,255,255,.06))'};color:${c===activeCat?'#fff':'var(--text-secondary)'};border:1px solid ${c===activeCat?'transparent':'var(--border)'};cursor:pointer" onclick="window._consentCat('${esc(c)}')">${esc(c)}</button>`).join('')}
          </div>
        </div>
        <div style="display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(300px,1fr))">
          ${cards}
        </div>
      </div>
    `;
  }

  window._consentSearch = (v) => { query = v; render(); };
  window._consentCat    = (v) => { activeCat = v; render(); };
  render();
}

// ── 7. REPORT TEMPLATE REGISTRY ──────────────────────────────────────────────
export async function pgReportTemplateRegistry(setTopbar) {
  setTopbar('Report Template Registry', `
    <span style="font-size:0.8rem;color:var(--text-secondary);align-self:center">${REPORT_TEMPLATE_REGISTRY.length} templates</span>
    <button class="btn btn-sm" onclick="window._regAbout?.('reports')">ℹ About</button>
  `);
  const el = document.getElementById('content');
  if (!el) return;
  window._regAbout = (k) => mountRegistryInfoModal(k);

  const cats = ['All', ...new Set(REPORT_TEMPLATE_REGISTRY.map(r => r.cat))];
  let activeCat = 'All';
  let query = '';

  function render() {
    const data = REPORT_TEMPLATE_REGISTRY.filter(r => {
      const matchC = activeCat === 'All' || r.cat === activeCat;
      const q = query.toLowerCase();
      const matchQ = !q || r.name.toLowerCase().includes(q) || r.desc.toLowerCase().includes(q);
      return matchC && matchQ;
    });

    window._regDetailItems = data;
    const cards = data.length
      ? data.map((r, i) => regCardClickable('reports', i,
          `<div style="display:flex;align-items:flex-start;gap:8px;justify-content:space-between">
            <div>
              <div style="font-weight:600;font-size:0.9rem;color:var(--text-primary)">${esc(r.name)}</div>
              <div style="font-size:0.72rem;color:var(--text-tertiary);margin-top:2px">${esc(r.cat)} · ${esc(r.freq)}</div>
            </div>
            ${r.auto ? `<span style="padding:1px 8px;border-radius:10px;font-size:0.68rem;font-weight:700;white-space:nowrap;background:#6366f120;color:#818cf8;border:1px solid #6366f140">Auto</span>` : ''}
          </div>`,
          `<div>${esc(r.desc)}</div>
           <div style="margin-top:6px;font-size:0.75rem;color:var(--text-tertiary)">Sections: ${r.sections.map(esc).join(', ')}</div>
           <div style="margin-top:8px;font-size:0.72rem;color:var(--text-tertiary)">Click for cross-registry context · references</div>`,
          ''
        )).join('')
      : emptyState('No report templates match.');

    el.innerHTML = `
      <div style="padding:24px;max-width:1400px;margin:0 auto">
        <div style="margin-bottom:16px;display:flex;gap:12px;flex-wrap:wrap;align-items:center">
          <input type="search" placeholder="Search report templates…" value="${esc(query)}"
            style="padding:7px 14px;border-radius:8px;border:1px solid var(--border,rgba(255,255,255,.12));background:var(--surface-1,rgba(255,255,255,.04));color:var(--text-primary);font-size:0.85rem;min-width:220px;flex:1;max-width:340px"
            oninput="window._rptSearch(this.value)" />
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${cats.map(c => `<button style="padding:4px 12px;border-radius:20px;font-size:0.75rem;font-weight:600;background:${c===activeCat?'var(--accent,#6366f1)':'var(--surface-2,rgba(255,255,255,.06))'};color:${c===activeCat?'#fff':'var(--text-secondary)'};border:1px solid ${c===activeCat?'transparent':'var(--border)'};cursor:pointer" onclick="window._rptCat('${esc(c)}')">${esc(c)}</button>`).join('')}
          </div>
        </div>
        <div style="display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(300px,1fr))">
          ${cards}
        </div>
      </div>
    `;
  }

  window._rptSearch = (v) => { query = v; render(); };
  window._rptCat    = (v) => { activeCat = v; render(); };
  render();
}

// ── 8. HANDBOOK REGISTRY ─────────────────────────────────────────────────────
export async function pgHandbookRegistry(setTopbar) {
  setTopbar('Handbook Registry', `
    <span style="font-size:0.8rem;color:var(--text-secondary);align-self:center">${HANDBOOK_REGISTRY.length} handbooks</span>
    <button class="btn btn-sm" onclick="window._regAbout?.('handbooks')">ℹ About</button>
  `);
  const el = document.getElementById('content');
  if (!el) return;
  window._regAbout = (k) => mountRegistryInfoModal(k);

  const cats = ['All', ...new Set(HANDBOOK_REGISTRY.map(h => h.cat))];
  let activeCat = 'All';
  let query = '';

  function render() {
    const data = HANDBOOK_REGISTRY.filter(h => {
      const matchC = activeCat === 'All' || h.cat === activeCat;
      const q = query.toLowerCase();
      const matchQ = !q || h.name.toLowerCase().includes(q) || h.desc.toLowerCase().includes(q);
      return matchC && matchQ;
    });

    const catColor = { Patient:'#60a5fa', Clinician:'#f59e0b', Safety:'#f87171', Governance:'#a78bfa', Caregiver:'#34d399' };

    window._regDetailItems = data;
    const cards = data.length
      ? data.map((h, i) => regCardClickable('handbooks', i,
          `<div style="display:flex;align-items:flex-start;gap:8px;justify-content:space-between">
            <div>
              <div style="font-weight:600;font-size:0.9rem;color:var(--text-primary)">${esc(h.name)}</div>
              <div style="font-size:0.72rem;color:var(--text-tertiary);margin-top:2px">${esc(h.pages)} pages · ${esc(h.format)}</div>
            </div>
            <span style="padding:1px 8px;border-radius:10px;font-size:0.68rem;font-weight:700;white-space:nowrap;background:${catColor[h.cat]||'#94a3b8'}20;color:${catColor[h.cat]||'#94a3b8'};border:1px solid ${catColor[h.cat]||'#94a3b8'}40">${esc(h.cat)}</span>
          </div>`,
          `<div>${esc(h.desc)}</div>
           <div style="margin-top:8px;font-size:0.72rem;color:var(--text-tertiary)">Click for cross-registry context · references</div>`,
          h.condition !== 'all' ? `<span style="padding:1px 7px;border-radius:10px;font-size:0.68rem;background:var(--surface-2,rgba(255,255,255,.06));color:var(--text-secondary);border:1px solid var(--border)">${esc(h.condition)}</span>` : ''
        )).join('')
      : emptyState('No handbooks match.');

    el.innerHTML = `
      <div style="padding:24px;max-width:1400px;margin:0 auto">
        <div style="margin-bottom:16px;display:flex;gap:12px;flex-wrap:wrap;align-items:center">
          <input type="search" placeholder="Search handbooks…" value="${esc(query)}"
            style="padding:7px 14px;border-radius:8px;border:1px solid var(--border,rgba(255,255,255,.12));background:var(--surface-1,rgba(255,255,255,.04));color:var(--text-primary);font-size:0.85rem;min-width:220px;flex:1;max-width:340px"
            oninput="window._hbSearch(this.value)" />
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${cats.map(c => `<button style="padding:4px 12px;border-radius:20px;font-size:0.75rem;font-weight:600;background:${c===activeCat?'var(--accent,#6366f1)':'var(--surface-2,rgba(255,255,255,.06))'};color:${c===activeCat?'#fff':'var(--text-secondary)'};border:1px solid ${c===activeCat?'transparent':'var(--border)'};cursor:pointer" onclick="window._hbCat('${esc(c)}')">${esc(c)}</button>`).join('')}
          </div>
        </div>
        <div style="display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(280px,1fr))">
          ${cards}
        </div>
      </div>
    `;
  }

  window._hbSearch = (v) => { query = v; render(); };
  window._hbCat    = (v) => { activeCat = v; render(); };
  render();
}

// ── 9. HOME PROGRAM REGISTRY ──────────────────────────────────────────────────
export async function pgHomeProgramRegistry(setTopbar) {
  setTopbar('Home Program Registry', `
    <span style="font-size:0.8rem;color:var(--text-secondary);align-self:center">${HOME_PROGRAM_REGISTRY.length} programs</span>
    <button class="btn btn-sm" onclick="window._regAbout?.('home-programs')">ℹ About</button>
  `);
  const el = document.getElementById('content');
  if (!el) return;
  window._regAbout = (k) => mountRegistryInfoModal(k);

  const cats = ['All', ...new Set(HOME_PROGRAM_REGISTRY.map(h => h.cat))];
  let activeCat = 'All';
  let query = '';

  function render() {
    const data = HOME_PROGRAM_REGISTRY.filter(h => {
      const matchC = activeCat === 'All' || h.cat === activeCat;
      const q = query.toLowerCase();
      const matchQ = !q || h.name.toLowerCase().includes(q) || h.desc.toLowerCase().includes(q) || h.condition.toLowerCase().includes(q);
      return matchC && matchQ;
    });

    const catColor = { Device:'#60a5fa', Behavioural:'#34d399', Rehab:'#f59e0b' };

    window._regDetailItems = data;
    const cards = data.length
      ? data.map((h, i) => regCardClickable('home-programs', i,
          `<div style="display:flex;align-items:flex-start;gap:8px;justify-content:space-between">
            <div>
              <div style="font-weight:600;font-size:0.9rem;color:var(--text-primary)">${esc(h.name)}</div>
              <div style="font-size:0.72rem;color:var(--text-tertiary);margin-top:2px">${esc(h.condition)} · ${esc(h.freq)}, ${esc(h.duration)}</div>
            </div>
            <span style="padding:1px 8px;border-radius:10px;font-size:0.68rem;font-weight:700;white-space:nowrap;background:${catColor[h.cat]||'#94a3b8'}20;color:${catColor[h.cat]||'#94a3b8'};border:1px solid ${catColor[h.cat]||'#94a3b8'}40">${esc(h.cat)}</span>
          </div>`,
          `<div>${esc(h.desc)}</div>
           ${h.device && h.device !== 'None' ? `<div style="margin-top:4px;font-size:0.75rem;color:var(--text-tertiary)">Device: ${esc(h.device)}</div>` : ''}
           <div style="margin-top:4px;font-size:0.75rem;color:var(--text-tertiary)">Tasks: ${h.tasks.map(esc).join(', ')}</div>
           <div style="margin-top:8px;font-size:0.72rem;color:var(--text-tertiary)">Click for cross-registry context · references</div>`,
          evBadge(h.ev)
        )).join('')
      : emptyState('No programs match.');

    el.innerHTML = `
      <div style="padding:24px;max-width:1400px;margin:0 auto">
        <div style="margin-bottom:16px;display:flex;gap:12px;flex-wrap:wrap;align-items:center">
          <input type="search" placeholder="Search home programs…" value="${esc(query)}"
            style="padding:7px 14px;border-radius:8px;border:1px solid var(--border,rgba(255,255,255,.12));background:var(--surface-1,rgba(255,255,255,.04));color:var(--text-primary);font-size:0.85rem;min-width:220px;flex:1;max-width:340px"
            oninput="window._hpSearch(this.value)" />
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${cats.map(c => `<button style="padding:4px 12px;border-radius:20px;font-size:0.75rem;font-weight:600;background:${c===activeCat?'var(--accent,#6366f1)':'var(--surface-2,rgba(255,255,255,.06))'};color:${c===activeCat?'#fff':'var(--text-secondary)'};border:1px solid ${c===activeCat?'transparent':'var(--border)'};cursor:pointer" onclick="window._hpCat('${esc(c)}')">${esc(c)}</button>`).join('')}
          </div>
        </div>
        <div style="display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(300px,1fr))">
          ${cards}
        </div>
      </div>
    `;
  }

  window._hpSearch = (v) => { query = v; render(); };
  window._hpCat    = (v) => { activeCat = v; render(); };
  render();
}

// ── 10. VIRTUAL CARE REGISTRY ─────────────────────────────────────────────────
export async function pgVirtualCareRegistry(setTopbar) {
  setTopbar('Virtual Care Registry', `
    <span style="font-size:0.8rem;color:var(--text-secondary);align-self:center">${VIRTUAL_CARE_REGISTRY.length} templates</span>
    <button class="btn btn-sm" onclick="window._regAbout?.('virtual-care')">ℹ About</button>
  `);
  const el = document.getElementById('content');
  if (!el) return;
  window._regAbout = (k) => mountRegistryInfoModal(k);

  const cats = ['All', ...new Set(VIRTUAL_CARE_REGISTRY.map(v => v.cat))];
  let activeCat = 'All';
  let query = '';

  function render() {
    const data = VIRTUAL_CARE_REGISTRY.filter(v => {
      const matchC = activeCat === 'All' || v.cat === activeCat;
      const q = query.toLowerCase();
      const matchQ = !q || v.name.toLowerCase().includes(q) || v.desc.toLowerCase().includes(q) || v.staffing.toLowerCase().includes(q);
      return matchC && matchQ;
    });

    const catColor = { Intake:'#60a5fa', 'Pre-Treatment':'#f59e0b', Progress:'#34d399', Discharge:'#a78bfa', Safety:'#f87171', Support:'#c084fc', Therapy:'#818cf8', Clinical:'#38bdf8', Education:'#fb923c', Monitoring:'#94a3b8' };

    window._regDetailItems = data;
    const cards = data.length
      ? data.map((v, i) => regCardClickable('virtual-care', i,
          `<div style="display:flex;align-items:flex-start;gap:8px;justify-content:space-between">
            <div>
              <div style="font-weight:600;font-size:0.9rem;color:var(--text-primary)">${esc(v.name)}</div>
              <div style="font-size:0.72rem;color:var(--text-tertiary);margin-top:2px">${esc(v.modality)} · ${esc(v.duration)} min · ${esc(v.staffing)}</div>
            </div>
            <span style="padding:1px 8px;border-radius:10px;font-size:0.68rem;font-weight:700;white-space:nowrap;background:${catColor[v.cat]||'#94a3b8'}20;color:${catColor[v.cat]||'#94a3b8'};border:1px solid ${catColor[v.cat]||'#94a3b8'}40">${esc(v.cat)}</span>
          </div>`,
          `<div>${esc(v.desc)}</div>
           <div style="margin-top:6px;font-size:0.75rem;color:var(--text-tertiary)">Tasks: ${v.tasks.map(esc).join(', ')}</div>
           <div style="margin-top:8px;font-size:0.72rem;color:var(--text-tertiary)">Click for cross-registry context · references</div>`,
          ''
        )).join('')
      : emptyState('No virtual care templates match.');

    el.innerHTML = `
      <div style="padding:24px;max-width:1400px;margin:0 auto">
        <div style="margin-bottom:16px;display:flex;gap:12px;flex-wrap:wrap;align-items:center">
          <input type="search" placeholder="Search virtual care templates…" value="${esc(query)}"
            style="padding:7px 14px;border-radius:8px;border:1px solid var(--border,rgba(255,255,255,.12));background:var(--surface-1,rgba(255,255,255,.04));color:var(--text-primary);font-size:0.85rem;min-width:220px;flex:1;max-width:340px"
            oninput="window._vcSearch(this.value)" />
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${cats.map(c => `<button style="padding:4px 12px;border-radius:20px;font-size:0.75rem;font-weight:600;background:${c===activeCat?'var(--accent,#6366f1)':'var(--surface-2,rgba(255,255,255,.06))'};color:${c===activeCat?'#fff':'var(--text-secondary)'};border:1px solid ${c===activeCat?'transparent':'var(--border)'};cursor:pointer" onclick="window._vcCat('${esc(c)}')">${esc(c)}</button>`).join('')}
          </div>
        </div>
        <div style="display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(300px,1fr))">
          ${cards}
        </div>
      </div>
    `;
  }

  window._vcSearch = (v) => { query = v; render(); };
  window._vcCat    = (v) => { activeCat = v; render(); };
  render();
}
