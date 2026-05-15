// pages-handbooks-v2.js — DeepSynaps Handbook Frontend v2 Enhancements
// Panels: Evidence (GRADE+decay), Version History, HITL Pipeline,
//         Safety Scan, Export Centre v2, Block-Tree Editor, Accessibility Toolbar
// Clinical safety: all outputs carry evidence-grade badges & disclaimers.

import { api } from './api.js';
import { currentUser } from './auth.js';

// ── CSS ──
const V2_CSS = `
.evidence-panel { background: var(--surface-1, rgba(255,255,255,0.04)); border: 1px solid var(--border, rgba(255,255,255,0.08)); border-radius: 8px; padding: 16px; margin-top: 12px; }
.evidence-item { display: flex; align-items: flex-start; gap: 8px; padding: 8px; border-bottom: 1px solid var(--border, rgba(255,255,255,0.06)); }
.evidence-item:last-child { border-bottom: none; }
.evidence-grade { padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 700; flex-shrink: 0; }
.evidence-grade.ga { background: #dcfce7; color: #166534; }
.evidence-grade.gb { background: #dbeafe; color: #1e40af; }
.evidence-grade.gc { background: #fef3c7; color: #92400e; }
.evidence-grade.gd { background: #fee2e2; color: #991b1b; }
.evidence-meta { font-size: 11px; color: var(--text-secondary, #94a3b8); }
.decay-badge { padding: 1px 6px; border-radius: 4px; font-size: 9px; font-weight: 600; }
.decay-fresh { background: #dcfce7; color: #166534; }
.decay-aging { background: #fef3c7; color: #92400e; }
.decay-stale { background: #fee2e2; color: #991b1b; }
.grounded-yes { color: #166534; font-size: 11px; }
.grounded-no { color: #991b1b; font-size: 11px; }
.version-timeline { display: flex; flex-direction: column; gap: 8px; }
.version-item { display: flex; align-items: flex-start; gap: 12px; padding: 10px; border-radius: 6px; background: var(--surface-1, rgba(255,255,255,0.04)); border: 1px solid var(--border, rgba(255,255,255,0.08)); }
.version-dot { width: 10px; height: 10px; border-radius: 50%; margin-top: 4px; flex-shrink: 0; }
.version-current { background: var(--accent, #00d4bc); }
.version-past { background: var(--text-tertiary, #64748b); }
.version-actions { display: flex; gap: 6px; margin-top: 6px; flex-wrap: wrap; }
.version-btn { padding: 3px 10px; border-radius: 4px; font-size: 10px; background: var(--surface-2, rgba(255,255,255,0.06)); color: var(--text-primary, #e2e8f0); border: 1px solid var(--border, rgba(255,255,255,0.08)); cursor: pointer; font-family: inherit; }
.version-btn:hover { border-color: var(--accent, #00d4bc); }
.hitl-pipeline { display: flex; align-items: center; gap: 0; overflow-x: auto; padding: 8px 0; }
.hitl-step { display: flex; flex-direction: column; align-items: center; padding: 10px 6px; border-radius: 6px; min-width: 90px; text-align: center; border: 1px solid transparent; }
.hitl-step.passed { background: #dcfce7; border-color: #166534; }
.hitl-step.failed { background: #fee2e2; border-color: #991b1b; }
.hitl-step.pending { background: var(--surface-2, rgba(255,255,255,0.06)); border-color: var(--border, rgba(255,255,255,0.08)); }
.hitl-step.blocking { background: #fee2e2; border-color: #ef4444; }
.hitl-connector { width: 16px; height: 2px; background: var(--border, rgba(255,255,255,0.08)); flex-shrink: 0; }
.hitl-icon { font-size: 16px; margin-bottom: 4px; }
.hitl-label { font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
.hitl-status { font-size: 10px; margin-top: 2px; }
.safety-panel { background: var(--surface-1, rgba(255,255,255,0.04)); border: 1px solid var(--border, rgba(255,255,255,0.08)); border-radius: 8px; padding: 16px; margin-top: 12px; }
.safety-score { font-size: 28px; font-weight: 700; text-align: center; padding: 12px; border-radius: 8px; }
.safety-score.pass { color: #166534; background: #dcfce7; }
.safety-score.fail { color: #991b1b; background: #fee2e2; }
.safety-score.warn { color: #92400e; background: #fef3c7; }
.safety-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; margin-top: 12px; }
.safety-card { padding: 10px; border-radius: 6px; background: rgba(255,255,255,0.02); border: 1px solid var(--border, rgba(255,255,255,0.06)); }
.safety-card h4 { font-size: 11px; font-weight: 600; margin: 0 0 6px 0; color: var(--text-primary, #e2e8f0); }
.safety-card p { font-size: 11px; margin: 0; color: var(--text-secondary, #94a3b8); line-height: 1.5; }
.forbidden-row { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 4px; background: #fee2e2; margin-bottom: 4px; font-size: 11px; color: #991b1b; }
.export-v2-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px; }
.export-v2-btn { padding: 14px; border: 1px solid var(--border, rgba(255,255,255,0.08)); border-radius: 8px; background: var(--surface-1, rgba(255,255,255,0.04)); cursor: pointer; text-align: center; font-size: 12px; color: var(--text-primary, #e2e8f0); transition: all 0.15s; }
.export-v2-btn:hover:not(:disabled) { border-color: var(--accent, #00d4bc); background: rgba(0,212,188,0.08); }
.export-v2-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.export-v2-meta { font-size: 10px; color: var(--text-tertiary, #64748b); margin-top: 6px; }
.export-v2-lock { font-size: 10px; color: #92400e; margin-top: 4px; }
.block-editor { display: flex; flex-direction: column; gap: 4px; margin-top: 12px; }
.block-row { display: flex; align-items: flex-start; gap: 8px; padding: 8px; border-radius: 6px; border: 1px solid transparent; transition: background 0.12s; }
.block-row:hover { background: var(--surface-2, rgba(255,255,255,0.06)); border-color: var(--border, rgba(255,255,255,0.08)); }
.block-handle { cursor: grab; color: var(--text-secondary, #94a3b8); font-size: 14px; padding: 4px; flex-shrink: 0; user-select: none; }
.block-type { padding: 2px 8px; border-radius: 4px; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; flex-shrink: 0; cursor: pointer; border: 1px solid var(--border, rgba(255,255,255,0.08)); background: var(--surface-2, rgba(255,255,255,0.06)); color: var(--text-secondary, #94a3b8); }
.block-content { flex: 1; min-height: 32px; padding: 6px 10px; border-radius: 6px; background: var(--bg-base, #04121c); color: var(--text-primary, #e2e8f0); border: 1px solid var(--border, rgba(255,255,255,0.08)); font-size: 13px; font-family: inherit; line-height: 1.5; }
.block-actions { display: flex; gap: 4px; flex-shrink: 0; }
.block-icon { padding: 4px 6px; border-radius: 4px; font-size: 12px; cursor: pointer; color: var(--text-secondary, #94a3b8); border: 1px solid transparent; background: transparent; }
.block-icon:hover { color: #ef4444; background: #fee2e2; }
.block-divider { height: 1px; background: var(--border, rgba(255,255,255,0.08)); margin: 4px 24px; }
.add-block-row { display: flex; align-items: center; justify-content: center; padding: 4px; opacity: 0; transition: opacity 0.15s; }
.block-editor:hover .add-block-row { opacity: 1; }
.add-block-btn { padding: 2px 12px; border-radius: 4px; font-size: 10px; background: transparent; color: var(--text-tertiary, #64748b); border: 1px dashed var(--border, rgba(255,255,255,0.08)); cursor: pointer; font-family: inherit; }
.add-block-btn:hover { color: var(--accent, #00d4bc); border-color: var(--accent, #00d4bc); }
.a11y-toolbar { display: flex; gap: 8px; padding: 10px; background: var(--surface-1, rgba(255,255,255,0.04)); border-radius: 8px; border: 1px solid var(--border, rgba(255,255,255,0.08)); align-items: center; flex-wrap: wrap; }
.a11y-group { display: flex; gap: 4px; align-items: center; }
.a11y-label { font-size: 10px; font-weight: 600; color: var(--text-tertiary, #64748b); text-transform: uppercase; letter-spacing: 0.05em; margin-right: 4px; }
.a11y-btn { padding: 5px 12px; border-radius: 6px; font-size: 11px; background: var(--surface-2, rgba(255,255,255,0.06)); color: var(--text-primary, #e2e8f0); border: 1px solid var(--border, rgba(255,255,255,0.08)); cursor: pointer; font-family: inherit; transition: all 0.12s; }
.a11y-btn:hover { border-color: var(--accent, #00d4bc); }
.a11y-btn.active { background: var(--accent, #00d4bc); color: #04121c; border-color: var(--accent, #00d4bc); font-weight: 600; }
.empty-state { text-align: center; padding: 32px 16px; color: var(--text-secondary, #94a3b8); font-size: 13px; }
.error-state { text-align: center; padding: 24px; color: #991b1b; background: #fee2e2; border-radius: 8px; font-size: 13px; margin: 8px 0; }
.loading-state { text-align: center; padding: 24px; color: var(--text-secondary, #94a3b8); font-size: 13px; }
.v2-panel-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.v2-panel-title { font-size: 13px; font-weight: 700; color: var(--text-primary, #e2e8f0); }
.v2-disclaimer { font-size: 10px; color: var(--text-tertiary, #64748b); margin-top: 8px; font-style: italic; }
`;

// ── Helpers ──
function esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function _gradeBadge(grade) {
  const g = (grade || 'D').toUpperCase();
  return `<span class="evidence-grade g${g.toLowerCase()}">GRADE ${esc(g)}</span>`;
}
function _decayBadge(year) {
  const age = new Date().getFullYear() - (year || new Date().getFullYear());
  if (age <= 1) return `<span class="decay-badge decay-fresh">Fresh (${esc(String(year))})</span>`;
  if (age <= 3) return `<span class="decay-badge decay-aging">Aging (${esc(String(year))})</span>`;
  return `<span class="decay-badge decay-stale">Stale (${esc(String(year))})</span>`;
}
function _groundedBadge(grounded) {
  return grounded
    ? `<span class="grounded-yes">Grounded</span>`
    : `<span class="grounded-no">Not grounded</span>`;
}

// ── Role gating ──
function _roleFeatures() {
  const role = currentUser?.role || 'reviewer';
  return { canEdit: ['clinician', 'admin', 'super_admin'].includes(role), canSign: ['clinician', 'admin', 'super_admin'].includes(role), role };
}

// ═══ 1. EVIDENCE PANEL ═══
export async function renderEvidencePanel(handbookId, container) {
  container.innerHTML = `<style>${V2_CSS}</style><div class="loading-state" role="status" aria-live="polite">Loading evidence...</div>`;
  let evidence = [];
  try { evidence = await api.getHandbookEvidence(handbookId); }
  catch (_) {
    // Fallback to empty evidence — panel will show empty state
    evidence = [];
  }
  // If API returned no data, render empty state
  if (!evidence || !evidence.length) {
    container.innerHTML = `<style>${V2_CSS}</style>
      <div class="evidence-panel">
        <div class="v2-panel-header"><span class="v2-panel-title">Evidence Panel</span></div>
        <div class="empty-state">No evidence entries found.<br><span style="font-size:11px">Evidence will populate after generation and citation grounding.</span></div>
        <div class="v2-disclaimer">Evidence grades reflect supporting data strength, not clinical certainty.</div>
      </div>`;
    return;
  }

  const itemsHtml = evidence.map(item => `
    <div class="evidence-item" role="listitem">
      ${_gradeBadge(item.grade)}
      <div style="flex:1;min-width:0;">
        <div style="font-size:12px;font-weight:600;color:var(--text-primary,#e2e8f0);margin-bottom:2px;">${esc(item.title)}</div>
        <div class="evidence-meta">${esc(item.journal || 'Unknown journal')} · ${esc(String(item.year || 'N/A'))} · ${item.doi ? `<a href="https://doi.org/${esc(item.doi)}" target="_blank" rel="noopener noreferrer" style="color:var(--accent,#00d4bc);text-decoration:none;">${esc(item.doi)}</a>` : 'No DOI'}</div>
        <div style="display:flex;gap:8px;margin-top:4px;align-items:center;">
          ${_decayBadge(item.year)}
          ${_groundedBadge(item.grounded)}
          ${item.pmid ? `<a href="https://pubmed.ncbi.nlm.nih.gov/${esc(item.pmid)}/" target="_blank" rel="noopener noreferrer" style="color:var(--accent,#00d4bc);font-size:11px;text-decoration:none;">PubMed</a>` : ''}
        </div>
      </div>
    </div>
  `).join('');

  container.innerHTML = `<style>${V2_CSS}</style>
    <div class="evidence-panel" role="region" aria-label="Evidence panel for handbook ${esc(handbookId)}">
      <div class="v2-panel-header">
        <span class="v2-panel-title">Evidence Panel</span>
        <span style="font-size:11px;color:var(--text-secondary,#94a3b8)">${evidence.length} entries</span>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:12px;">
        <input type="text" id="evidence-search-${esc(handbookId)}" placeholder="Search PubMed / title / DOI..."
          style="flex:1;padding:6px 10px;border-radius:6px;background:var(--bg-base,#04121c);color:var(--text-primary,#e2e8f0);border:1px solid var(--border,rgba(255,255,255,0.08));font-size:12px;font-family:inherit;"
          onkeydown="if(event.key==='Enter')window._v2PubMedSearch(this.value,'${esc(handbookId)}')" />
        <button onclick="window._v2PubMedSearch(document.getElementById('evidence-search-${esc(handbookId)}').value,'${esc(handbookId)}')"
          style="padding:6px 12px;border-radius:6px;font-size:11px;background:var(--surface-2,rgba(255,255,255,0.06));color:var(--text-primary,#e2e8f0);border:1px solid var(--border,rgba(255,255,255,0.08));cursor:pointer;font-family:inherit;">Search</button>
      </div>
      <div role="list" aria-label="Evidence entries">${itemsHtml}</div>
      <div class="v2-disclaimer">Evidence grades indicate supporting data strength per GRADE methodology. Not clinical certainty.</div>
    </div>`;
}

// PubMed search opens in new tab (no API key required for basic search)
window._v2PubMedSearch = (query, handbookId) => {
  if (!query || !query.trim()) return;
  const url = `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(query.trim())}`;
  window.open(url, '_blank', 'noopener,noreferrer');
};

// ═══ 2. VERSION HISTORY PANEL ═══
export async function renderVersionPanel(handbookId, container) {
  container.innerHTML = `<style>${V2_CSS}</style><div class="loading-state" role="status" aria-live="polite">Loading version history...</div>`;
  let versions = [];
  try { versions = await api.getHandbookVersions(handbookId); } catch (_) { versions = []; }
  if (!versions || !versions.length) {
    container.innerHTML = `<style>${V2_CSS}</style>
      <div class="evidence-panel">
        <div class="v2-panel-header"><span class="v2-panel-title">Version History</span></div>
        <div class="empty-state">No versions recorded.<br><span style="font-size:11px">Versions are created on each save, sign, or export action.</span></div>
      </div>`;
    return;
  }
  const html = versions.map((v, idx) => {
    const isCurrent = idx === 0;
    const tagsHtml = (v.tags || []).map(t => `<span style="padding:1px 6px;border-radius:4px;font-size:9px;background:rgba(0,212,188,0.12);color:var(--accent,#00d4bc);margin-right:4px;">${esc(t)}</span>`).join('');
    return `
      <div class="version-item">
        <div class="version-dot ${isCurrent ? 'version-current' : 'version-past'}"></div>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span style="font-size:12px;font-weight:600;color:var(--text-primary,#e2e8f0);">${esc(v.version_id || 'v?' + (versions.length - idx))}</span>
            ${isCurrent ? '<span style="padding:1px 6px;border-radius:4px;font-size:9px;background:var(--accent,#00d4bc);color:#04121c;font-weight:700;">CURRENT</span>' : ''}
            ${tagsHtml}
          </div>
          <div class="evidence-meta">${esc(v.author || 'Unknown')} · ${esc(v.date || 'N/A')} · ${esc(v.message || 'No message')}</div>
          <div class="version-actions">
            ${!isCurrent ? `<button class="version-btn" onclick="window._v2RevertVersion('${esc(handbookId)}','${esc(v.version_id)}')">↩ Revert</button>` : ''}
            <button class="version-btn" onclick="window._v2TagVersion('${esc(handbookId)}','${esc(v.version_id)}')">🏷 Tag</button>
            ${idx < versions.length - 1 ? `<button class="version-btn" onclick="window._v2DiffVersion('${esc(handbookId)}','${esc(v.version_id)}','${esc(versions[idx+1].version_id)}')">⇄ Diff</button>` : ''}
          </div>
        </div>
      </div>`;
  }).join('');

  container.innerHTML = `<style>${V2_CSS}</style>
    <div class="evidence-panel" role="region" aria-label="Version history">
      <div class="v2-panel-header">
        <span class="v2-panel-title">Version History</span>
        <span style="font-size:11px;color:var(--text-secondary,#94a3b8)">${versions.length} versions</span>
      </div>
      <div class="version-timeline" role="list">${html}</div>
      <div id="v2-diff-viewer-${esc(handbookId)}" style="display:none;margin-top:12px;padding:12px;border-radius:6px;background:var(--bg-base,#04121c);border:1px solid var(--border,rgba(255,255,255,0.08));font-size:11px;font-family:monospace;white-space:pre-wrap;overflow-x:auto;"></div>
      <div class="v2-disclaimer">Reverting replaces current content. Tagging helps identify milestone versions.</div>
    </div>`;
}

window._v2RevertVersion = async (hbId, versionId) => {
  if (!confirm(`Revert handbook to version ${versionId}? Current content will be overwritten.`)) return;
  try { await api.revertHandbookVersion(hbId, versionId); window._dsToast?.({ title: 'Reverted', body: `Handbook reverted to ${versionId}`, severity: 'ok' }); }
  catch (e) { window._dsToast?.({ title: 'Revert failed', body: e?.message || 'Unknown error', severity: 'error' }); }
};
window._v2TagVersion = async (hbId, versionId) => {
  const tag = prompt(`Enter tag for version ${versionId}:`, 'milestone');
  if (!tag || !tag.trim()) return;
  try { await api.tagHandbookVersion(hbId, versionId, tag.trim()); window._dsToast?.({ title: 'Tagged', body: `Version ${versionId} tagged as "${tag.trim()}"`, severity: 'ok' }); }
  catch (e) { window._dsToast?.({ title: 'Tag failed', body: e?.message || 'Unknown error', severity: 'error' }); }
};
window._v2DiffVersion = async (hbId, vA, vB) => {
  const viewer = document.getElementById(`v2-diff-viewer-${hbId}`);
  if (!viewer) return;
  viewer.style.display = 'block';
  viewer.textContent = `Loading diff between ${vA} and ${vB}...`;
  try { const diff = await api.diffHandbookVersions(hbId, vA, vB); viewer.textContent = diff || 'No differences found.'; }
  catch (e) { viewer.textContent = `Diff unavailable: ${e?.message || 'API error'}`; }
};

// ═══ 3. HITL CHECKPOINT PANEL ═══
const HITL_STEPS = [
  { key: 'clinical_accuracy', label: 'Clinical Accuracy', icon: '⚕' },
  { key: 'citation_grounding', label: 'Citations', icon: '📑' },
  { key: 'safety_compliance', label: 'Safety', icon: '🛡' },
  { key: 'readability', label: 'Readability', icon: '📖' },
  { key: 'governance_review', label: 'Governance', icon: '⚖' },
  { key: 'final_approval', label: 'Approval', icon: '✓' },
];

export async function renderHITLPanel(handbookId, container) {
  container.innerHTML = `<style>${V2_CSS}</style><div class="loading-state" role="status" aria-live="polite">Loading HITL checkpoints...</div>`;
  let checkpoints = [];
  try { checkpoints = await api.getHandbookHITL(handbookId); } catch (_) { checkpoints = []; }
  const stepMap = Object.fromEntries(checkpoints.map(c => [c.key, c]));
  const rf = _roleFeatures();

  const pipelineHtml = HITL_STEPS.map((step, idx) => {
    const cp = stepMap[step.key] || { status: 'pending' };
    const status = cp.status || 'pending';
    const isBlocking = status === 'failed' && cp.blocking;
    const cls = isBlocking ? 'hitl-step failed blocking' : `hitl-step ${status}`;
    const statusText = status === 'passed' ? 'Passed' : status === 'failed' ? (isBlocking ? 'Blocking' : 'Failed') : 'Pending';
    return `
      <div class="${cls}" role="listitem" aria-label="${esc(step.label)}: ${statusText}">
        <div class="hitl-icon">${esc(step.icon)}</div>
        <div class="hitl-label">${esc(step.label)}</div>
        <div class="hitl-status" style="color:${status==='passed'?'#166534':status==='failed'?'#991b1b':'var(--text-tertiary,#64748b)'};">${esc(statusText)}</div>
        ${cp.reviewer ? `<div class="hitl-status">${esc(cp.reviewer)}</div>` : ''}
        ${cp.timestamp ? `<div class="hitl-status">${esc(cp.timestamp.slice(0,16).replace('T',' '))}</div>` : ''}
      </div>
      ${idx < HITL_STEPS.length - 1 ? '<div class="hitl-connector" aria-hidden="true"></div>' : ''}`;
  }).join('');

  // Find first pending step for advance button
  const firstPending = HITL_STEPS.find(s => !(stepMap[s.key]?.status === 'passed'));

  container.innerHTML = `<style>${V2_CSS}</style>
    <div class="evidence-panel" role="region" aria-label="Human-in-the-loop checkpoints">
      <div class="v2-panel-header">
        <span class="v2-panel-title">HITL Checkpoints</span>
        ${rf.canEdit && firstPending ? `<button class="version-btn" style="font-size:11px;padding:4px 12px;" onclick="window._v2AdvanceHITL('${esc(handbookId)}','${esc(firstPending.key)}')">▶ Advance: ${esc(firstPending.label)}</button>` : ''}
      </div>
      <div class="hitl-pipeline" role="list" aria-label="Checkpoint pipeline">${pipelineHtml}</div>
      ${rf.canEdit ? '<div class="v2-disclaimer">Click "Advance" to pass the current pending checkpoint. Blocking failures must be resolved before advancing.</div>' : '<div class="v2-disclaimer">Read-only view of HITL pipeline. Editing requires clinician or admin role.</div>'}
    </div>`;
}

window._v2AdvanceHITL = async (hbId, stepKey) => {
  try { await api.advanceHITLCheckpoint(hbId, stepKey); window._dsToast?.({ title: 'Checkpoint advanced', body: `${stepKey} marked as passed.`, severity: 'ok' }); }
  catch (e) { window._dsToast?.({ title: 'Advance failed', body: e?.message || 'Could not advance checkpoint.', severity: 'error' }); }
};

// ═══ 4. SAFETY SCAN PANEL ═══
export async function renderSafetyPanel(handbookId, container) {
  container.innerHTML = `<style>${V2_CSS}</style><div class="loading-state" role="status" aria-live="polite">Running safety scan...</div>`;
  let scan = null;
  try { scan = await api.scanHandbookSafety(handbookId); } catch (_) { scan = null; }

  if (!scan) {
    container.innerHTML = `<style>${V2_CSS}</style>
      <div class="safety-panel">
        <div class="v2-panel-header"><span class="v2-panel-title">Safety Scan</span></div>
        <div class="error-state">Safety scan unavailable. Ensure the handbook content is saved and try again.</div>
      </div>`;
    return;
  }

  const scoreClass = scan.overall_pass ? 'safety-score pass' : scan.overall_score >= 60 ? 'safety-score warn' : 'safety-score fail';
  const forbiddenHtml = (scan.forbidden_phrases || []).length
    ? scan.forbidden_phrases.map(fp => `<div class="forbidden-row"><span style="font-weight:700">${esc(fp.severity?.toUpperCase() || 'WARN')}</span>: "${esc(fp.phrase)}" — ${esc(fp.suggestion || 'Remove or rephrase')}</div>`).join('')
    : '<div style="padding:8px;font-size:11px;color:#166534;background:#dcfce7;border-radius:4px;">No forbidden phrases found.</div>';

  container.innerHTML = `<style>${V2_CSS}</style>
    <div class="safety-panel" role="region" aria-label="Safety scan results">
      <div class="v2-panel-header">
        <span class="v2-panel-title">Safety Scan</span>
        <button class="version-btn" style="font-size:11px;padding:4px 12px;" onclick="window._v2ReRunSafety('${esc(handbookId)}')">↻ Re-run</button>
      </div>
      <div class="${scoreClass}" role="img" aria-label="Overall safety score: ${esc(String(scan.overall_score || 0))}">
        <div style="font-size:13px;font-weight:400;margin-bottom:4px;">Overall Safety Score</div>
        ${esc(String(scan.overall_score || 0))} / 100
      </div>
      <div class="safety-grid">
        <div class="safety-card">
          <h4>Readability — FKGL</h4>
          <p><strong>${esc(String(scan.fkgl || 'N/A'))}</strong> grade level</p>
          <p>Reading ease: <strong>${esc(String(scan.reading_ease || 'N/A'))}</strong></p>
          <p>Target: <strong>${esc(scan.recommended_level || 'Professional')}</strong></p>
        </div>
        <div class="safety-card">
          <h4>Citation Grounding</h4>
          <p>Score: <strong>${esc(String(scan.citation_grounding_score || 'N/A'))}</strong> / 100</p>
          <p>${(scan.citation_grounding_score || 0) >= 80 ? '<span style="color:#166534">Adequately grounded</span>' : '<span style="color:#92400e">Needs more citations</span>'}</p>
        </div>
        <div class="safety-card">
          <h4>Health Literacy</h4>
          <p>Compliant: <strong>${scan.health_literacy_compliant ? '<span style="color:#166534">Yes</span>' : '<span style="color:#991b1b">No</span>'}</strong></p>
          <p>${esc(scan.health_literacy_note || 'Uses plain language where applicable.')}</p>
        </div>
        <div class="safety-card">
          <h4>Forbidden Phrases</h4>
          <p>Found: <strong>${esc(String((scan.forbidden_phrases || []).length))}</strong></p>
          <p>Highest severity: <strong>${esc((scan.forbidden_phrases || []).reduce((max, f) => { const s = {critical:3,high:2,medium:1,low:0}; return (s[f.severity]||0) > (s[max]||0) ? f.severity : max; }, 'none'))}</strong></p>
        </div>
      </div>
      <div style="margin-top:12px;">
        <h4 style="font-size:12px;font-weight:600;margin-bottom:8px;color:var(--text-primary,#e2e8f0);">Forbidden Phrase Details</h4>
        ${forbiddenHtml}
      </div>
      <div class="v2-disclaimer">Safety scans are advisory. A licensed clinician must review all content before clinical use.</div>
    </div>`;
}

window._v2ReRunSafety = async (hbId) => {
  const container = document.getElementById(`v2-safety-${hbId}`);
  if (container) renderSafetyPanel(hbId, container);
};

// ═══ 5. EXPORT CENTRE V2 ═══
const EXPORT_FORMATS = [
  { key: 'docx', label: '📄 DOCX', api: 'exportHandbookDocx', ext: '.docx', size: '~180 KB', desc: 'Word document' },
  { key: 'pdf', label: '📕 PDF', api: 'exportHandbookPdf', ext: '.pdf', size: '~240 KB', desc: 'Portable document' },
  { key: 'markdown', label: '📝 Markdown', api: null, ext: '.md', size: '~45 KB', desc: 'Plain-text markdown' },
  { key: 'patient', label: '👤 Patient Guide', api: 'exportPatientGuideDocx', ext: '-patient.docx', size: '~150 KB', desc: 'Patient-friendly' },
  { key: 'bundle', label: '📦 Complete Bundle', api: 'exportHandbookBundle', ext: '-bundle.zip', size: '~680 KB', desc: 'ZIP with all formats' },
];

export function renderExportCentreV2(handbookId, container, handbookState) {
  const rf = _roleFeatures();
  const isSigned = handbookState === 'signed' || handbookState === 'exported';
  const canExport = rf.canEdit && rf.role !== 'reviewer';

  const gridHtml = EXPORT_FORMATS.map(fmt => `
    <button class="export-v2-btn" ${!isSigned || !canExport ? 'disabled' : ''}
      onclick="window._v2Export('${esc(handbookId)}','${esc(fmt.key)}')"
      title="${!isSigned ? 'Handbook must be SIGNED before export' : !canExport ? 'Export requires clinician or admin role' : fmt.desc}">
      <div style="font-size:18px;margin-bottom:4px;">${esc(fmt.label.split(' ')[0])}</div>
      <div style="font-weight:600;">${esc(fmt.label.split(' ').slice(1).join(' '))}</div>
      <div class="export-v2-meta">${esc(fmt.size)} · ${esc(fmt.desc)}</div>
      ${!isSigned ? '<div class="export-v2-lock">🔒 Sign to enable</div>' : !canExport ? '<div class="export-v2-lock">🔒 Role required</div>' : ''}
    </button>
  `).join('');

  container.innerHTML = `<style>${V2_CSS}</style>
    <div class="evidence-panel" role="region" aria-label="Export centre">
      <div class="v2-panel-header">
        <span class="v2-panel-title">Export Centre v2</span>
        <span style="font-size:11px;color:var(--text-secondary,#94a3b8)">${isSigned ? '✓ Ready for export' : '⏳ Awaiting sign-off'}</span>
      </div>
      <div class="export-v2-grid" role="list">${gridHtml}</div>
      <div style="margin-top:12px;padding:10px;border-radius:6px;background:rgba(255,176,87,0.06);border:1px solid rgba(255,176,87,0.15);font-size:11px;color:var(--text-secondary,#94a3b8);line-height:1.5;">
        <strong>Clinical disclaimer:</strong> Exported handbooks are for educational decision-support only. All clinical content must be verified by a licensed practitioner before use.
      </div>
    </div>`;
}

window._v2Export = async (hbId, format) => {
  try {
    const fmt = EXPORT_FORMATS.find(f => f.key === format);
    if (!fmt) return;
    window._dsToast?.({ title: 'Exporting...', body: `Preparing ${fmt.label}...`, severity: 'info' });
    if (fmt.api && api[fmt.api]) {
      const blob = await api[fmt.api]({ handbook_id: hbId });
      _v2TriggerDownload(blob, `handbook-${hbId}${fmt.ext}`);
    } else if (format === 'markdown') {
      const md = `# Handbook ${hbId}\n\n> Export placeholder — integrate with _buildMarkdownExport() from pages-handbooks.js`;
      _v2TriggerDownload(new Blob([md], { type: 'text/markdown;charset=utf-8' }), `handbook-${hbId}.md`);
    }
    window._dsToast?.({ title: 'Exported', body: `${fmt.label} download started.`, severity: 'ok' });
  } catch (e) { window._dsToast?.({ title: 'Export failed', body: e?.message || 'Unknown error', severity: 'error' }); }
};

function _v2TriggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ═══ 6. BLOCK-TREE EDITOR ═══
const BLOCK_TYPES = [
  { key: 'heading', label: 'H', desc: 'Heading' },
  { key: 'paragraph', label: 'P', desc: 'Paragraph' },
  { key: 'bullet', label: '•', desc: 'Bullet' },
  { key: 'evidence', label: 'E', desc: 'Evidence' },
  { key: 'warning', label: '!', desc: 'Warning' },
  { key: 'divider', label: '—', desc: 'Divider' },
];

export async function renderBlockTreeEditor(handbookId, container) {
  container.innerHTML = `<style>${V2_CSS}</style><div class="loading-state" role="status" aria-live="polite">Loading block tree...</div>`;
  let blocks = [];
  try { blocks = await api.getHandbookBlocks(handbookId); } catch (_) { blocks = []; }
  if (!blocks || !blocks.length) {
    blocks = [
      { id: 'b1', type: 'heading', content: 'Untitled Section', collapsed: false },
      { id: 'b2', type: 'paragraph', content: 'Start editing...', collapsed: false },
      { id: 'b3', type: 'divider', content: '', collapsed: false },
    ];
  }
  _v2RenderBlocks(handbookId, container, blocks);
}

function _v2RenderBlocks(handbookId, container, blocks) {
  const rf = _roleFeatures();
  const rowsHtml = blocks.map((block, idx) => {
    const typeDef = BLOCK_TYPES.find(t => t.key === block.type) || BLOCK_TYPES[1];
    const isDivider = block.type === 'divider';
    const isCollapsed = block.collapsed && (block.children || []).length;
    const nestedHtml = (block.children || []).map(child => {
      const cType = BLOCK_TYPES.find(t => t.key === child.type) || BLOCK_TYPES[1];
      return `<div style="margin-left:24px;padding:4px 8px;border-left:2px solid var(--border,rgba(255,255,255,0.08));font-size:12px;color:var(--text-secondary,#94a3b8);">
        <span class="block-type" style="margin-right:6px;">${esc(cType.label)}</span>
        ${isDivider ? '' : esc(child.content || '')}
      </div>`;
    }).join('');
    return `
      ${idx > 0 ? '<div class="add-block-row"><button class="add-block-btn" onclick="window._v2AddBlock(\'' + esc(handbookId) + '\',' + idx + ')">+ Add block</button></div>' : ''}
      <div class="block-row" data-block-id="${esc(block.id)}">
        <div class="block-handle" title="Drag to reorder" aria-label="Drag handle">⋮⋮</div>
        <div class="block-type" title="${esc(typeDef.desc)} — click to change" onclick="window._v2CycleBlockType('${esc(handbookId)}','${esc(block.id)}')">${esc(typeDef.label)}</div>
        ${isDivider ? '<div class="block-divider" style="flex:1;margin:8px 0;"></div>' : `<div class="block-content" contenteditable="${rf.canEdit}" onblur="window._v2SaveBlockContent('${esc(handbookId)}','${esc(block.id)}',this.innerText)" role="textbox" aria-label="${esc(typeDef.desc)} block">${esc(block.content || '')}</div>`}
        <div class="block-actions">
          ${(block.children || []).length ? `<div class="block-icon" onclick="window._v2ToggleCollapse('${esc(handbookId)}','${esc(block.id)}')" title="${isCollapsed ? 'Expand' : 'Collapse'}" role="button" aria-label="${isCollapsed ? 'Expand' : 'Collapse'} nested blocks">${isCollapsed ? '▶' : '▼'}</div>` : ''}
          ${rf.canEdit ? `<div class="block-icon" onclick="window._v2DeleteBlock('${esc(handbookId)}','${esc(block.id)}')" title="Delete block" role="button" aria-label="Delete block">🗑</div>` : ''}
        </div>
      </div>
      ${isCollapsed ? '' : nestedHtml}`;
  }).join('');

  container.innerHTML = `<style>${V2_CSS}</style>
    <div class="evidence-panel" role="region" aria-label="Block tree editor">
      <div class="v2-panel-header">
        <span class="v2-panel-title">Block Editor</span>
        <div style="display:flex;gap:6px;">
          ${rf.canEdit ? `<button class="version-btn" onclick="window._v2AddBlock('${esc(handbookId)}',${blocks.length})">+ Add Block</button>` : ''}
          <button class="version-btn" onclick="window._v2SaveBlockTree('${esc(handbookId)}')">💾 Save</button>
        </div>
      </div>
      <div class="block-editor" role="list" aria-label="Editable blocks">${rowsHtml}</div>
      ${!rf.canEdit ? '<div class="v2-disclaimer">Read-only. Editing requires clinician or admin role.</div>' : '<div class="v2-disclaimer">Content editable inline. Drag handles are visual — full drag-and-drop to be implemented.</div>'}
    </div>`;
  // Store blocks on container for mutation operations
  container._v2Blocks = blocks;
}

window._v2AddBlock = (hbId, afterIndex) => {
  const container = document.querySelector('[role="region"][aria-label="Block tree editor"]');
  const blocks = container?._v2Blocks || [];
  const newBlock = { id: `b-${Date.now()}`, type: 'paragraph', content: '', collapsed: false };
  const insertAt = Math.min(afterIndex + 1, blocks.length);
  blocks.splice(insertAt, 0, newBlock);
  _v2RenderBlocks(hbId, container.parentElement, blocks);
};
window._v2DeleteBlock = (hbId, blockId) => {
  if (!confirm('Delete this block?')) return;
  const container = document.querySelector('[role="region"][aria-label="Block tree editor"]');
  const blocks = container?._v2Blocks || [];
  const idx = blocks.findIndex(b => b.id === blockId);
  if (idx > -1) { blocks.splice(idx, 1); _v2RenderBlocks(hbId, container.parentElement, blocks); }
};
window._v2CycleBlockType = (hbId, blockId) => {
  const container = document.querySelector('[role="region"][aria-label="Block tree editor"]');
  const blocks = container?._v2Blocks || [];
  const block = blocks.find(b => b.id === blockId);
  if (block) {
    const typeIdx = BLOCK_TYPES.findIndex(t => t.key === block.type);
    block.type = BLOCK_TYPES[(typeIdx + 1) % BLOCK_TYPES.length].key;
    _v2RenderBlocks(hbId, container.parentElement, blocks);
  }
};
window._v2ToggleCollapse = (hbId, blockId) => {
  const container = document.querySelector('[role="region"][aria-label="Block tree editor"]');
  const blocks = container?._v2Blocks || [];
  const block = blocks.find(b => b.id === blockId);
  if (block) { block.collapsed = !block.collapsed; _v2RenderBlocks(hbId, container.parentElement, blocks); }
};
window._v2SaveBlockContent = (hbId, blockId, content) => {
  const container = document.querySelector('[role="region"][aria-label="Block tree editor"]');
  const blocks = container?._v2Blocks || [];
  const block = blocks.find(b => b.id === blockId);
  if (block) block.content = content;
};
window._v2SaveBlockTree = async (hbId) => {
  const container = document.querySelector('[role="region"][aria-label="Block tree editor"]');
  const blocks = container?._v2Blocks || [];
  try { await api.saveHandbookBlocks(hbId, blocks); window._dsToast?.({ title: 'Saved', body: 'Block tree saved.', severity: 'ok' }); }
  catch (e) { window._dsToast?.({ title: 'Save failed', body: e?.message || 'Could not save blocks.', severity: 'error' }); }
};

// ═══ 7. ACCESSIBILITY TOOLBAR ═══
export function renderAccessibilityToolbar(container) {
  const prefs = JSON.parse(localStorage.getItem('ds_a11y_prefs') || '{}');
  const fontSize = prefs.fontSize || 'medium';
  const contrast = prefs.contrast || 'normal';
  const screenReader = prefs.screenReader || false;
  const focusMode = prefs.focusMode || false;

  container.innerHTML = `<style>${V2_CSS}</style>
    <div class="a11y-toolbar" role="toolbar" aria-label="Accessibility controls">
      <span class="a11y-label">A11y</span>
      <div class="a11y-group" role="group" aria-label="Font size">
        <button class="a11y-btn ${fontSize==='small'?'active':''}" onclick="window._v2A11y('fontSize','small')">Small</button>
        <button class="a11y-btn ${fontSize==='medium'?'active':''}" onclick="window._v2A11y('fontSize','medium')">Medium</button>
        <button class="a11y-btn ${fontSize==='large'?'active':''}" onclick="window._v2A11y('fontSize','large')">Large</button>
      </div>
      <div class="a11y-group" role="group" aria-label="Contrast">
        <button class="a11y-btn ${contrast==='normal'?'active':''}" onclick="window._v2A11y('contrast','normal')">Normal</button>
        <button class="a11y-btn ${contrast==='high'?'active':''}" onclick="window._v2A11y('contrast','high')">High</button>
        <button class="a11y-btn ${contrast==='dark'?'active':''}" onclick="window._v2A11y('contrast','dark')">Dark</button>
      </div>
      <div class="a11y-group" role="group" aria-label="Screen reader">
        <button class="a11y-btn ${screenReader?'active':''}" onclick="window._v2A11y('screenReader',${!screenReader})" aria-pressed="${screenReader}">Screen Reader</button>
      </div>
      <div class="a11y-group" role="group" aria-label="Focus mode">
        <button class="a11y-btn ${focusMode?'active':''}" onclick="window._v2A11y('focusMode',${!focusMode})" aria-pressed="${focusMode}">Focus</button>
      </div>
      <button class="a11y-btn" onclick="window._v2A11yHelp()" aria-label="Keyboard shortcuts help">⌨ Help</button>
    </div>
    <div id="a11y-live-region" aria-live="${screenReader?'polite':'off'}" aria-atomic="true" style="position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;"></div>`;
}

window._v2A11y = (key, value) => {
  const prefs = JSON.parse(localStorage.getItem('ds_a11y_prefs') || '{}');
  prefs[key] = value;
  localStorage.setItem('ds_a11y_prefs', JSON.stringify(prefs));
  // Apply immediately
  const root = document.documentElement;
  if (key === 'fontSize') {
    const sizes = { small: '14px', medium: '16px', large: '18px' };
    root.style.fontSize = sizes[value] || '16px';
  }
  if (key === 'contrast') {
    root.classList.remove('contrast-normal', 'contrast-high', 'contrast-dark');
    root.classList.add(`contrast-${value}`);
  }
  if (key === 'screenReader') {
    const live = document.getElementById('a11y-live-region');
    if (live) live.setAttribute('aria-live', value ? 'polite' : 'off');
  }
  if (key === 'focusMode') {
    document.body.classList.toggle('focus-mode', value);
    // Focus mode: hide sidebars/nav — relies on CSS class .focus-mode in global stylesheet
  }
  // Re-render toolbar to reflect state
  const toolbar = document.querySelector('[role="toolbar"][aria-label="Accessibility controls"]');
  if (toolbar) renderAccessibilityToolbar(toolbar.parentElement);
  // Announce change
  const live = document.getElementById('a11y-live-region');
  if (live && prefs.screenReader) live.textContent = `${key} set to ${value}`;
};

window._v2A11yHelp = () => {
  const shortcuts = [
    'Ctrl+S — Save current block tree',
    'Ctrl+E — Toggle evidence panel',
    'Ctrl+Shift+F — Toggle focus mode',
    'Ctrl+/ — Open keyboard shortcuts help',
    'Esc — Close panels / Cancel actions',
    'Tab — Navigate between controls',
    '↑ ↓ — Navigate blocks in editor',
    'Ctrl+D — Delete current block',
  ];
  window._dsToast?.({ title: 'Keyboard Shortcuts', body: shortcuts.join(' · '), severity: 'info', duration: 8000 });
};

// ═══ COMBINED RENDER — mounts all v2 panels ═══
export async function renderHandbookV2(handbookId, container, options = {}) {
  const { handbookState = 'draft', showPanels = ['evidence', 'version', 'hitl', 'safety', 'export', 'blocks', 'a11y'] } = options;
  container.innerHTML = `<style>${V2_CSS}</style><div class="loading-state" role="status">Loading v2 panels...</div>`;

  // Build panel slots
  const panelIds = {
    evidence: `v2-evidence-${handbookId}`,
    version: `v2-version-${handbookId}`,
    hitl: `v2-hitl-${handbookId}`,
    safety: `v2-safety-${handbookId}`,
    export: `v2-export-${handbookId}`,
    blocks: `v2-blocks-${handbookId}`,
    a11y: `v2-a11y-${handbookId}`,
  };

  let slotsHtml = '';
  if (showPanels.includes('a11y')) {
    slotsHtml += `<div id="${esc(panelIds.a11y)}" style="margin-bottom:12px;"></div>`;
  }
  slotsHtml += `<div style="display:grid;grid-template-columns:1fr;gap:12px;">`;
  if (showPanels.includes('evidence')) slotsHtml += `<div id="${esc(panelIds.evidence)}"></div>`;
  if (showPanels.includes('safety')) slotsHtml += `<div id="${esc(panelIds.safety)}"></div>`;
  if (showPanels.includes('hitl')) slotsHtml += `<div id="${esc(panelIds.hitl)}"></div>`;
  if (showPanels.includes('version')) slotsHtml += `<div id="${esc(panelIds.version)}"></div>`;
  if (showPanels.includes('export')) slotsHtml += `<div id="${esc(panelIds.export)}"></div>`;
  if (showPanels.includes('blocks')) slotsHtml += `<div id="${esc(panelIds.blocks)}"></div>`;
  slotsHtml += `</div>`;

  container.innerHTML = `<style>${V2_CSS}</style>
    <div class="handbook-container" role="main" aria-label="Handbook v2 enhanced view">
      ${slotsHtml}
      <div style="margin-top:16px;padding:12px;border-radius:8px;background:rgba(255,176,87,0.06);border:1px solid rgba(255,176,87,0.15);font-size:11px;color:var(--text-secondary,#94a3b8);line-height:1.5;text-align:center;">
        <strong>Clinical disclaimer:</strong> All v2 panels provide decision-support only. Evidence grades indicate supporting data strength, not clinical certainty. Verify all content with a licensed clinician.
      </div>
    </div>`;

  // Render each panel independently (non-blocking)
  const promises = [];
  if (showPanels.includes('a11y')) {
    const el = document.getElementById(panelIds.a11y);
    if (el) renderAccessibilityToolbar(el);
  }
  if (showPanels.includes('evidence')) {
    const el = document.getElementById(panelIds.evidence);
    if (el) promises.push(renderEvidencePanel(handbookId, el).catch(() => {}));
  }
  if (showPanels.includes('safety')) {
    const el = document.getElementById(panelIds.safety);
    if (el) promises.push(renderSafetyPanel(handbookId, el).catch(() => {}));
  }
  if (showPanels.includes('hitl')) {
    const el = document.getElementById(panelIds.hitl);
    if (el) promises.push(renderHITLPanel(handbookId, el).catch(() => {}));
  }
  if (showPanels.includes('version')) {
    const el = document.getElementById(panelIds.version);
    if (el) promises.push(renderVersionPanel(handbookId, el).catch(() => {}));
  }
  if (showPanels.includes('export')) {
    const el = document.getElementById(panelIds.export);
    if (el) renderExportCentreV2(handbookId, el, handbookState);
  }
  if (showPanels.includes('blocks')) {
    const el = document.getElementById(panelIds.blocks);
    if (el) promises.push(renderBlockTreeEditor(handbookId, el).catch(() => {}));
  }

  await Promise.all(promises);
}

// ── Default export ──
export default {
  renderEvidencePanel,
  renderVersionPanel,
  renderHITLPanel,
  renderSafetyPanel,
  renderExportCentreV2,
  renderBlockTreeEditor,
  renderAccessibilityToolbar,
  renderHandbookV2,
};
