// Cornerstone3D-based MRI viewer (MPR + tools).
// Bundled via Vite from local node_modules (CSP-safe; no CDN/esm.sh).

import * as core from '@cornerstonejs/core';
import * as tools from '@cornerstonejs/tools';
import * as nifti from '@cornerstonejs/nifti-volume-loader';

let _didInit = false;
let _didRegisterNifti = false;

function _safeId(s) {
  return String(s || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'x';
}

export async function mountCornerstoneMPR(host, opts = {}) {
  if (!host) return false;
  const baseUrl = opts?.baseVolumeUrl;
  if (!baseUrl) return false;

  // Build DOM
  const prefix = `ds-cs3d-${_safeId(opts.analysisId || 'analysis')}-${Date.now()}`;
  host.innerHTML = `
    <div class="ds-mri-cs3d">
      <div class="ds-mri-cs3d__toolbar">
        <button class="btn btn-sm" data-tool="Pan">Pan</button>
        <button class="btn btn-sm" data-tool="Zoom">Zoom</button>
        <button class="btn btn-sm" data-tool="Length">Length</button>
        <button class="btn btn-sm" data-tool="Angle">Angle</button>
        <button class="btn btn-sm" data-tool="Reset">Reset</button>
        <span class="ds-mri-cs3d__hint">Cornerstone3D (MPR + measurement tools)</span>
      </div>
      <div class="ds-mri-cs3d__grid">
        <div class="ds-mri-cs3d__vp" id="${prefix}-ax"></div>
        <div class="ds-mri-cs3d__vp" id="${prefix}-cor"></div>
        <div class="ds-mri-cs3d__vp" id="${prefix}-sag"></div>
      </div>
    </div>
  `;

  const elAx = document.getElementById(`${prefix}-ax`);
  const elCor = document.getElementById(`${prefix}-cor`);
  const elSag = document.getElementById(`${prefix}-sag`);
  if (!elAx || !elCor || !elSag) return false;

  // Cornerstone init
  try {
    if (!_didInit) {
      const initCore = core?.init;
      if (typeof initCore === 'function') await initCore();
      const initTools = tools?.init;
      if (typeof initTools === 'function') initTools();
      _didInit = true;
    }
  } catch {
    // If init fails, bail out to fallback viewer.
    return false;
  }

  // Register NIfTI loader scheme
  try {
    if (!_didRegisterNifti) {
      const loader = nifti?.cornerstoneNiftiImageVolumeLoader;
      const registerVolumeLoader = core?.volumeLoader?.registerVolumeLoader;
      if (typeof registerVolumeLoader === 'function' && loader) {
        registerVolumeLoader('nifti', loader);
      }
      _didRegisterNifti = true;
    }
  } catch {
    // If loader can't register, we can't continue
    return false;
  }

  const {
    RenderingEngine,
    Enums,
    volumeLoader,
    setVolumesForViewports,
  } = core;

  const {
    ToolGroupManager,
    Enums: ToolsEnums,
    PanTool,
    ZoomTool,
    LengthTool,
    AngleTool,
  } = tools;

  if (!RenderingEngine || !Enums || !volumeLoader || !setVolumesForViewports) return false;

  const renderingEngineId = `${prefix}-re`;
  const renderingEngine = new RenderingEngine(renderingEngineId);

  const viewportAx = `${prefix}-vp-ax`;
  const viewportCor = `${prefix}-vp-cor`;
  const viewportSag = `${prefix}-vp-sag`;

  const type = Enums.ViewportType?.ORTHOGRAPHIC || Enums.ViewportType?.VolumeOrthographic || 'ORTHOGRAPHIC';

  renderingEngine.enableElement({
    viewportId: viewportAx,
    type,
    element: elAx,
    defaultOptions: { orientation: Enums.OrientationAxis?.AXIAL || 'AXIAL' },
  });
  renderingEngine.enableElement({
    viewportId: viewportCor,
    type,
    element: elCor,
    defaultOptions: { orientation: Enums.OrientationAxis?.CORONAL || 'CORONAL' },
  });
  renderingEngine.enableElement({
    viewportId: viewportSag,
    type,
    element: elSag,
    defaultOptions: { orientation: Enums.OrientationAxis?.SAGITTAL || 'SAGITTAL' },
  });

  const volumeId = `nifti:${baseUrl}`;
  let volume;
  try {
    volume = await volumeLoader.createAndCacheVolume(volumeId);
  } catch {
    return false;
  }

  try {
    await volume.load?.();
  } catch {
    // not all loaders require load()
  }

  await setVolumesForViewports(
    renderingEngine,
    [{ volumeId }],
    [viewportAx, viewportCor, viewportSag]
  );

  // Tool group (single group for all three viewports)
  const toolGroupId = `${prefix}-tg`;
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);
  if (!toolGroup) return false;

  // Register tools if available
  try { if (PanTool) toolGroup.addTool(PanTool.toolName); } catch {}
  try { if (ZoomTool) toolGroup.addTool(ZoomTool.toolName); } catch {}
  try { if (LengthTool) toolGroup.addTool(LengthTool.toolName); } catch {}
  try { if (AngleTool) toolGroup.addTool(AngleTool.toolName); } catch {}

  toolGroup.addViewport(viewportAx, renderingEngineId);
  toolGroup.addViewport(viewportCor, renderingEngineId);
  toolGroup.addViewport(viewportSag, renderingEngineId);

  const MouseBinding = ToolsEnums?.MouseBindings || tools?.Enums?.MouseBindings || {};
  const Primary = MouseBinding.Primary || 1;

  function setActive(toolName) {
    if (!toolName) return;
    try { toolGroup.setToolActive(toolName, { bindings: [{ mouseButton: Primary }] }); } catch {}
  }

  // Default tool
  setActive(PanTool?.toolName);

  // Wire toolbar
  host.querySelectorAll('[data-tool]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const name = btn.getAttribute('data-tool');
      if (name === 'Reset') {
        try {
          [viewportAx, viewportCor, viewportSag].forEach((id) => {
            const vp = renderingEngine.getViewport(id);
            vp?.reset?.();
          });
          renderingEngine.render();
        } catch {}
        return;
      }
      if (name === 'Pan') setActive(PanTool?.toolName);
      if (name === 'Zoom') setActive(ZoomTool?.toolName);
      if (name === 'Length') setActive(LengthTool?.toolName);
      if (name === 'Angle') setActive(AngleTool?.toolName);
    });
  });

  // Render once everything is in place
  try { renderingEngine.render(); } catch {}

  // Return a tiny disposer the page can call during navigation cleanup
  host._dsDisposeCornerstone = () => {
    try { renderingEngine?.disableElement?.(viewportAx); } catch {}
    try { renderingEngine?.disableElement?.(viewportCor); } catch {}
    try { renderingEngine?.disableElement?.(viewportSag); } catch {}
    try { renderingEngine?.destroy?.(); } catch {}
  };

  return true;
}

