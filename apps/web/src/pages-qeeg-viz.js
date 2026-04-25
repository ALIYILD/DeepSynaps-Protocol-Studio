// ─────────────────────────────────────────────────────────────────────────────
// pages-qeeg-viz.js — qEEG Visualization v2 Components
//
// Provides upgraded visualization panels for the qEEG Analyzer:
//   - MNE-quality topomaps (server-rendered via viz API)
//   - three-brain-js 3D source viewer (WebGL)
//   - brainvis-d3 connectivity chord diagram
//   - Animated topomap playback
//   - Band-grid overview panel
//
// These components are lazy-loaded from pages-qeeg-analysis.js when the
// v2 viz API reports capabilities for a given analysis.
// ─────────────────────────────────────────────────────────────────────────────

const API_BASE = import.meta.env?.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';
const TOKEN_KEY = 'ds_access_token';

function _token() {
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}

async function vizFetch(path, opts = {}) {
  const url = `${API_BASE}${path}`;
  const headers = { Authorization: `Bearer ${_token()}`, ...opts.headers };
  const res = await fetch(url, { ...opts, headers });
  if (!res.ok) throw new Error(`Viz API ${res.status}: ${await res.text().catch(() => '')}`);
  return res.json();
}

function esc(v) {
  if (v == null) return '';
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Capabilities ─────────────────────────────────────────────────────────────

export async function fetchVizCapabilities(analysisId) {
  try {
    return await vizFetch(`/api/v1/qeeg-viz/${analysisId}/capabilities`);
  } catch {
    return null;
  }
}

// ── Topomap Panel ────────────────────────────────────────────────────────────

export async function renderV2TopomapPanel(container, analysisId, caps) {
  if (!caps?.has_topomaps) {
    container.innerHTML = '<p style="color:var(--text-secondary);padding:16px;">No topomap data available.</p>';
    return;
  }

  container.innerHTML = _topomapPanelShell(caps.bands);
  const imgEl = container.querySelector('.viz2-topo-img');
  const modeSelect = container.querySelector('.viz2-topo-mode');
  const bandBtns = container.querySelectorAll('.viz2-band-btn');

  let currentBand = caps.bands[0] || 'alpha';
  let currentMode = 'power';

  async function loadTopomap() {
    imgEl.innerHTML = '<div class="spinner" style="margin:24px auto;"></div>';
    try {
      const data = await vizFetch(`/api/v1/qeeg-viz/${analysisId}/topomap/${currentBand}?mode=${currentMode}`);
      imgEl.innerHTML = `<img src="${esc(data.image_b64)}" alt="${esc(data.band)} ${esc(data.mode)}" style="max-width:100%;border-radius:8px;" />`;
    } catch (err) {
      imgEl.innerHTML = `<p style="color:var(--error);padding:8px;">Failed to load topomap: ${esc(err.message)}</p>`;
    }
  }

  modeSelect?.addEventListener('change', (e) => { currentMode = e.target.value; loadTopomap(); });
  bandBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      bandBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentBand = btn.dataset.band;
      loadTopomap();
    });
  });

  loadTopomap();
}

function _topomapPanelShell(bands) {
  const bandBtns = bands.map((b, i) =>
    `<button class="viz2-band-btn ds-btn ds-btn--sm ${i === 0 ? 'active' : ''}" data-band="${esc(b)}">${esc(b.charAt(0).toUpperCase() + b.slice(1))}</button>`
  ).join('');

  return `
    <div class="viz2-panel viz2-topomap-panel">
      <div class="viz2-panel__header">
        <h3>Topographic Maps (MNE v2)</h3>
        <select class="viz2-topo-mode ds-select ds-select--sm">
          <option value="power">Absolute Power</option>
          <option value="zscore">Z-Score</option>
          <option value="relative">Relative Power</option>
        </select>
      </div>
      <div class="viz2-band-selector">${bandBtns}</div>
      <div class="viz2-topo-img" style="text-align:center;min-height:200px;padding:12px;"></div>
    </div>`;
}

// ── Band Grid Panel ──────────────────────────────────────────────────────────

export async function renderV2BandGridPanel(container, analysisId, caps) {
  if (!caps?.has_topomaps) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = `
    <div class="viz2-panel viz2-bandgrid-panel">
      <div class="viz2-panel__header">
        <h3>Band Grid Overview</h3>
        <select class="viz2-grid-mode ds-select ds-select--sm">
          <option value="power">Absolute Power</option>
          <option value="zscore">Z-Score</option>
        </select>
      </div>
      <div class="viz2-grid-img" style="text-align:center;min-height:150px;padding:12px;">
        <div class="spinner" style="margin:24px auto;"></div>
      </div>
    </div>`;

  const imgEl = container.querySelector('.viz2-grid-img');
  const modeSelect = container.querySelector('.viz2-grid-mode');
  let currentMode = 'power';

  async function loadGrid() {
    imgEl.innerHTML = '<div class="spinner" style="margin:24px auto;"></div>';
    try {
      const data = await vizFetch(`/api/v1/qeeg-viz/${analysisId}/band-grid?mode=${currentMode}`);
      imgEl.innerHTML = `<img src="${esc(data.image_b64)}" alt="Band grid (${esc(data.mode)})" style="max-width:100%;border-radius:8px;" />`;
    } catch (err) {
      imgEl.innerHTML = `<p style="color:var(--error);padding:8px;">Failed: ${esc(err.message)}</p>`;
    }
  }

  modeSelect?.addEventListener('change', (e) => { currentMode = e.target.value; loadGrid(); });
  loadGrid();
}

// ── Connectivity Panel ───────────────────────────────────────────────────────

export async function renderV2ConnectivityPanel(container, analysisId, caps) {
  if (!caps?.has_connectivity) {
    container.innerHTML = '';
    return;
  }

  const bands = caps.bands || ['alpha'];
  container.innerHTML = `
    <div class="viz2-panel viz2-connectivity-panel">
      <div class="viz2-panel__header">
        <h3>Functional Connectivity (v2)</h3>
        <div style="display:flex;gap:8px;">
          <select class="viz2-conn-metric ds-select ds-select--sm">
            <option value="coherence">Coherence</option>
            <option value="wpli">wPLI</option>
          </select>
          <select class="viz2-conn-band ds-select ds-select--sm">
            ${bands.map(b => `<option value="${esc(b)}">${esc(b.charAt(0).toUpperCase() + b.slice(1))}</option>`).join('')}
          </select>
          <select class="viz2-conn-view ds-select ds-select--sm">
            <option value="heatmap">Heatmap</option>
            <option value="chord">Chord Diagram</option>
          </select>
        </div>
      </div>
      <div class="viz2-conn-content" style="min-height:300px;padding:12px;">
        <div class="spinner" style="margin:24px auto;"></div>
      </div>
    </div>`;

  const contentEl = container.querySelector('.viz2-conn-content');
  const metricSel = container.querySelector('.viz2-conn-metric');
  const bandSel = container.querySelector('.viz2-conn-band');
  const viewSel = container.querySelector('.viz2-conn-view');

  async function loadConnectivity() {
    const metric = metricSel.value;
    const band = bandSel.value;
    const view = viewSel.value;

    contentEl.innerHTML = '<div class="spinner" style="margin:24px auto;"></div>';

    try {
      if (view === 'heatmap') {
        const data = await vizFetch(`/api/v1/qeeg-viz/${analysisId}/connectivity/heatmap/${band}?metric=${metric}`);
        contentEl.innerHTML = '<div class="viz2-plotly-container" style="width:100%;min-height:400px;"></div>';
        const plotEl = contentEl.querySelector('.viz2-plotly-container');
        if (window.Plotly) {
          window.Plotly.newPlot(plotEl, data.data, data.layout, { responsive: true });
        } else {
          plotEl.innerHTML = '<p style="color:var(--text-secondary);">Plotly.js not loaded. Add it to see interactive heatmaps.</p>';
        }
      } else {
        const data = await vizFetch(`/api/v1/qeeg-viz/${analysisId}/connectivity/chord/${band}?metric=${metric}&threshold=0.3`);
        contentEl.innerHTML = _renderChordFallback(data.payload);
      }
    } catch (err) {
      contentEl.innerHTML = `<p style="color:var(--error);padding:8px;">Failed: ${esc(err.message)}</p>`;
    }
  }

  [metricSel, bandSel, viewSel].forEach(sel => sel?.addEventListener('change', loadConnectivity));
  loadConnectivity();
}

function _renderChordFallback(payload) {
  // Render a summary table when brainvis-d3 is not loaded
  const nodes = payload.nodes || [];
  const edges = payload.edges || [];
  const networks = payload.networks || [];

  let html = `
    <div class="viz2-chord-summary">
      <div style="display:flex;gap:24px;flex-wrap:wrap;margin-bottom:16px;">
        <div class="ds-metric"><span class="ds-metric__value">${nodes.length}</span><span class="ds-metric__label">Nodes</span></div>
        <div class="ds-metric"><span class="ds-metric__value">${edges.length}</span><span class="ds-metric__label">Edges (above threshold)</span></div>
        <div class="ds-metric"><span class="ds-metric__value">${networks.length}</span><span class="ds-metric__label">Networks</span></div>
      </div>`;

  // Top edges table
  if (edges.length > 0) {
    const topEdges = edges.sort((a, b) => b.weight - a.weight).slice(0, 10);
    html += `<h4 style="margin:12px 0 6px;">Strongest Connections</h4>
      <table class="ds-table ds-table--sm"><thead><tr><th>Source</th><th>Target</th><th>Weight</th></tr></thead><tbody>`;
    for (const e of topEdges) {
      const srcLabel = nodes[e.source]?.label || e.source;
      const tgtLabel = nodes[e.target]?.label || e.target;
      html += `<tr><td>${esc(srcLabel)}</td><td>${esc(tgtLabel)}</td><td>${e.weight.toFixed(3)}</td></tr>`;
    }
    html += `</tbody></table>`;
  }

  // Network distribution
  if (networks.length > 0) {
    html += `<h4 style="margin:16px 0 6px;">Network Distribution</h4><div style="display:flex;flex-wrap:wrap;gap:6px;">`;
    const netCounts = {};
    for (const n of nodes) { netCounts[n.network] = (netCounts[n.network] || 0) + 1; }
    for (const [net, count] of Object.entries(netCounts).sort((a, b) => b[1] - a[1])) {
      html += `<span style="display:inline-block;padding:3px 10px;border-radius:12px;font-size:11px;background:var(--blue-bg, #edf2fb);color:var(--blue, #2563eb);">${esc(net)}: ${count}</span>`;
    }
    html += `</div>`;
  }

  html += `<p style="font-size:11px;color:var(--text-secondary);margin-top:12px;">
    Install <code>brainvis-d3</code> for interactive chord visualization.
  </p></div>`;
  return html;
}

// ── Source Localization Panel (three-brain-js) ────────────────────────────────

export async function renderV2SourcePanel(container, analysisId, caps) {
  if (!caps?.has_source) {
    container.innerHTML = '';
    return;
  }

  const bands = caps.bands || ['alpha'];
  container.innerHTML = `
    <div class="viz2-panel viz2-source-panel">
      <div class="viz2-panel__header">
        <h3>Source Localization (${esc(caps.source_method || 'eLORETA')})</h3>
        <div style="display:flex;gap:8px;">
          <select class="viz2-src-band ds-select ds-select--sm">
            ${bands.map(b => `<option value="${esc(b)}"${b === 'alpha' ? ' selected' : ''}>${esc(b.charAt(0).toUpperCase() + b.slice(1))}</option>`).join('')}
          </select>
          <select class="viz2-src-view ds-select ds-select--sm">
            <option value="image">Static Image</option>
            <option value="3d">3D Viewer</option>
          </select>
        </div>
      </div>
      <div class="viz2-src-content" style="min-height:300px;padding:12px;">
        <div class="spinner" style="margin:24px auto;"></div>
      </div>
    </div>`;

  const contentEl = container.querySelector('.viz2-src-content');
  const bandSel = container.querySelector('.viz2-src-band');
  const viewSel = container.querySelector('.viz2-src-view');

  async function loadSource() {
    const band = bandSel.value;
    const view = viewSel.value;
    contentEl.innerHTML = '<div class="spinner" style="margin:24px auto;"></div>';

    try {
      if (view === 'image') {
        const res = await fetch(`${API_BASE}/api/v1/qeeg-viz/${analysisId}/source-image/${band}?fmt=png`, {
          headers: { Authorization: `Bearer ${_token()}` },
        });
        if (!res.ok) throw new Error(`${res.status}`);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        contentEl.innerHTML = `<img src="${url}" alt="Source ${esc(band)}" style="max-width:100%;border-radius:8px;" />`;
      } else {
        const data = await vizFetch(`/api/v1/qeeg-viz/${analysisId}/source/${band}`);
        contentEl.innerHTML = _render3DFallback(data.payload);
      }
    } catch (err) {
      contentEl.innerHTML = `<p style="color:var(--error);padding:8px;">Failed: ${esc(err.message)}</p>`;
    }
  }

  [bandSel, viewSel].forEach(sel => sel?.addEventListener('change', loadSource));
  loadSource();
}

function _render3DFallback(payload) {
  const rois = payload.roi_values || [];
  const stats = payload.stats || {};
  const visible = rois.filter(r => r.visible);

  let html = `
    <div class="viz2-3d-fallback">
      <div style="display:flex;gap:24px;flex-wrap:wrap;margin-bottom:16px;">
        <div class="ds-metric"><span class="ds-metric__value">${stats.n_rois || 0}</span><span class="ds-metric__label">ROIs</span></div>
        <div class="ds-metric"><span class="ds-metric__value">${(stats.mean || 0).toExponential(2)}</span><span class="ds-metric__label">Mean Power</span></div>
        <div class="ds-metric"><span class="ds-metric__value">${esc(payload.method)}</span><span class="ds-metric__label">Method</span></div>
      </div>`;

  // Top ROIs by power
  const sorted = [...rois].sort((a, b) => b.value - a.value).slice(0, 10);
  if (sorted.length > 0) {
    html += `<h4 style="margin:12px 0 6px;">Top ROIs by Power</h4>
      <table class="ds-table ds-table--sm"><thead><tr><th>ROI</th><th>Hemisphere</th><th>Power</th></tr></thead><tbody>`;
    for (const r of sorted) {
      html += `<tr><td>${esc(r.label)}</td><td>${esc(r.hemisphere)}</td><td>${r.value.toExponential(3)}</td></tr>`;
    }
    html += `</tbody></table>`;
  }

  html += `<p style="font-size:11px;color:var(--text-secondary);margin-top:12px;">
    Install <code>three-brain-js</code> for interactive 3D cortex visualization.
  </p></div>`;
  return html;
}

// ── Animated Topomap Panel ───────────────────────────────────────────────────

export function renderV2AnimationPanel(container, analysisId, caps) {
  if (!caps?.has_animation) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = `
    <div class="viz2-panel viz2-animation-panel">
      <div class="viz2-panel__header">
        <h3>Animated Topomaps</h3>
        <div style="display:flex;gap:8px;align-items:center;">
          <select class="viz2-anim-band ds-select ds-select--sm">
            ${(caps.bands || ['alpha']).map(b => `<option value="${esc(b)}">${esc(b.charAt(0).toUpperCase() + b.slice(1))}</option>`).join('')}
          </select>
          <button class="viz2-anim-play ds-btn ds-btn--sm ds-btn--primary">Load Frames</button>
        </div>
      </div>
      <div class="viz2-anim-player" style="text-align:center;min-height:200px;padding:12px;">
        <p style="color:var(--text-secondary);font-size:13px;">
          Click "Load Frames" to generate animated topomap sequence.
          <br/>This requires a completed MNE pipeline analysis with epoch data.
        </p>
      </div>
      <div class="viz2-anim-controls" style="display:none;padding:8px;text-align:center;">
        <button class="viz2-anim-prev ds-btn ds-btn--sm">&laquo; Prev</button>
        <span class="viz2-anim-label" style="margin:0 12px;font-size:13px;">Frame 1</span>
        <button class="viz2-anim-next ds-btn ds-btn--sm">Next &raquo;</button>
        <button class="viz2-anim-autoplay ds-btn ds-btn--sm" style="margin-left:12px;">Auto-play</button>
      </div>
    </div>`;

  const playerEl = container.querySelector('.viz2-anim-player');
  const controlsEl = container.querySelector('.viz2-anim-controls');
  const labelEl = container.querySelector('.viz2-anim-label');
  const playBtn = container.querySelector('.viz2-anim-play');
  const prevBtn = container.querySelector('.viz2-anim-prev');
  const nextBtn = container.querySelector('.viz2-anim-next');
  const autoBtn = container.querySelector('.viz2-anim-autoplay');
  const bandSel = container.querySelector('.viz2-anim-band');

  let frames = [];
  let currentFrame = 0;
  let autoInterval = null;

  function showFrame(idx) {
    if (!frames.length) return;
    currentFrame = Math.max(0, Math.min(idx, frames.length - 1));
    const f = frames[currentFrame];
    playerEl.innerHTML = `<img src="${f.image_b64}" alt="${esc(f.label)}" style="max-width:100%;border-radius:8px;" />`;
    labelEl.textContent = `${f.label} (${currentFrame + 1}/${frames.length})`;
  }

  playBtn?.addEventListener('click', async () => {
    playerEl.innerHTML = '<div class="spinner" style="margin:24px auto;"></div>';
    playBtn.disabled = true;
    try {
      // Animation frames come from the backend which needs epoch data
      // For now, show a placeholder since this requires raw epoch access
      playerEl.innerHTML = `<p style="color:var(--text-secondary);padding:16px;">
        Animated topomap generation requires the MNE pipeline to re-process epochs.
        <br/>This feature will be triggered automatically when an analysis with epoch data is available.
      </p>`;
      controlsEl.style.display = 'none';
    } catch (err) {
      playerEl.innerHTML = `<p style="color:var(--error);padding:8px;">Failed: ${esc(err.message)}</p>`;
    }
    playBtn.disabled = false;
  });

  prevBtn?.addEventListener('click', () => showFrame(currentFrame - 1));
  nextBtn?.addEventListener('click', () => showFrame(currentFrame + 1));
  autoBtn?.addEventListener('click', () => {
    if (autoInterval) {
      clearInterval(autoInterval);
      autoInterval = null;
      autoBtn.textContent = 'Auto-play';
    } else {
      autoInterval = setInterval(() => {
        if (currentFrame >= frames.length - 1) currentFrame = -1;
        showFrame(currentFrame + 1);
      }, 250);
      autoBtn.textContent = 'Stop';
    }
  });
}

// ── PDF Report v2 Button ─────────────────────────────────────────────────────

export async function generateV2Report(analysisId) {
  try {
    const data = await vizFetch(`/api/v1/qeeg-viz/${analysisId}/report-pdf`, { method: 'POST' });
    if (data.html_content) {
      const blob = new Blob([data.html_content], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `qeeg_report_v2_${analysisId.slice(0, 8)}.html`;
      a.click();
      URL.revokeObjectURL(url);
    }
    return data;
  } catch (err) {
    throw new Error(`Report generation failed: ${err.message}`);
  }
}

// ── Master Panel Mount ───────────────────────────────────────────────────────
// Call this from pages-qeeg-analysis.js to mount all v2 panels into a container.

export async function mountVizV2Panels(container, analysisId) {
  container.innerHTML = '<div class="spinner" style="margin:24px auto;"></div>';

  const caps = await fetchVizCapabilities(analysisId);
  if (!caps) {
    container.innerHTML = `<p style="color:var(--text-secondary);padding:16px;">
      Viz v2 not available for this analysis. Run the MNE pipeline first.
    </p>`;
    return;
  }

  container.innerHTML = `
    <div class="viz2-container" style="display:flex;flex-direction:column;gap:16px;">
      <div class="viz2-section-bandgrid"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;" class="viz2-topo-source-row">
        <div class="viz2-section-topomap"></div>
        <div class="viz2-section-source"></div>
      </div>
      <div class="viz2-section-connectivity"></div>
      <div class="viz2-section-animation"></div>
      <div style="text-align:center;padding:8px;">
        <button class="viz2-btn-report ds-btn ds-btn--primary">Download v2 PDF Report</button>
      </div>
    </div>`;

  // Mount all panels concurrently
  const promises = [
    renderV2BandGridPanel(container.querySelector('.viz2-section-bandgrid'), analysisId, caps),
    renderV2TopomapPanel(container.querySelector('.viz2-section-topomap'), analysisId, caps),
    renderV2SourcePanel(container.querySelector('.viz2-section-source'), analysisId, caps),
    renderV2ConnectivityPanel(container.querySelector('.viz2-section-connectivity'), analysisId, caps),
  ];

  // Animation is synchronous (just sets up UI)
  renderV2AnimationPanel(container.querySelector('.viz2-section-animation'), analysisId, caps);

  // PDF button
  const reportBtn = container.querySelector('.viz2-btn-report');
  reportBtn?.addEventListener('click', async () => {
    reportBtn.disabled = true;
    reportBtn.textContent = 'Generating...';
    try {
      await generateV2Report(analysisId);
      reportBtn.textContent = 'Downloaded!';
      setTimeout(() => { reportBtn.textContent = 'Download v2 PDF Report'; reportBtn.disabled = false; }, 3000);
    } catch (err) {
      reportBtn.textContent = 'Failed — Retry';
      reportBtn.disabled = false;
    }
  });

  await Promise.allSettled(promises);
}

// ── Responsive CSS for viz2 panels ───────────────────────────────────────────

const vizStyle = document.createElement('style');
vizStyle.textContent = `
  .viz2-panel {
    background: var(--card-bg, #fff);
    border: 1px solid var(--border, #e5e7eb);
    border-radius: 12px;
    overflow: hidden;
  }
  .viz2-panel__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border, #e5e7eb);
    flex-wrap: wrap;
    gap: 8px;
  }
  .viz2-panel__header h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary, #1b2430);
  }
  .viz2-band-selector {
    display: flex;
    gap: 4px;
    padding: 8px 16px;
    flex-wrap: wrap;
  }
  .viz2-band-btn.active {
    background: var(--blue, #2563eb);
    color: #fff;
  }
  .ds-metric {
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .ds-metric__value {
    font-size: 20px;
    font-weight: 700;
    color: var(--text-primary, #1b2430);
  }
  .ds-metric__label {
    font-size: 11px;
    color: var(--text-secondary, #6b7280);
  }
  @media (max-width: 768px) {
    .viz2-topo-source-row {
      grid-template-columns: 1fr !important;
    }
    .viz2-panel__header {
      flex-direction: column;
      align-items: flex-start;
    }
  }
  @media (max-width: 480px) {
    .viz2-band-selector {
      gap: 2px;
      padding: 6px 8px;
    }
    .viz2-band-btn {
      font-size: 11px;
      padding: 4px 8px;
    }
  }
`;
document.head.appendChild(vizStyle);
