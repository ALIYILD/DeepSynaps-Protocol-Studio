// ESM loader hook — stubs @cornerstonejs/* so mri-viewer-cs3d.js can be
// imported in a node:test environment without the full Cornerstone bundle.
//
// Usage:
//   node --loader ./src/__fixtures__/cornerstone-esm-loader.mjs \
//        --test src/mri-viewer-cs3d.test.js

const STUB_SPECIFIERS = new Set([
  '@cornerstonejs/core',
  '@cornerstonejs/tools',
  '@cornerstonejs/nifti-volume-loader',
]);

// Data URL that exports an empty default + named stub exports used by the
// module under test.
function _makeStubUrl() {
  const src = `
export default {};
export const init = async () => {};
export const Enums = {
  ViewportType: { ORTHOGRAPHIC: 'ORTHOGRAPHIC', VolumeOrthographic: 'ORTHOGRAPHIC' },
  OrientationAxis: { AXIAL: 'AXIAL', CORONAL: 'CORONAL', SAGITTAL: 'SAGITTAL' },
};
export const volumeLoader = {
  registerVolumeLoader: () => {},
  createAndCacheVolume: async () => ({ load: async () => {} }),
};
export const setVolumesForViewports = async () => {};
export class RenderingEngine {
  constructor(id) { this.id = id; }
  enableElement() {}
  getViewport() { return { reset: () => {} }; }
  render() {}
  disableElement() {}
  destroy() {}
}
export const ToolGroupManager = {
  createToolGroup: () => ({
    addTool: () => {},
    addViewport: () => {},
    setToolActive: () => {},
  }),
};
export const ToolsEnums = { MouseBindings: { Primary: 1 } };
export const PanTool = { toolName: 'Pan' };
export const ZoomTool = { toolName: 'Zoom' };
export const LengthTool = { toolName: 'Length' };
export const AngleTool = { toolName: 'Angle' };
export const cornerstoneNiftiImageVolumeLoader = {};
`;
  return 'data:text/javascript,' + encodeURIComponent(src);
}

const STUB_URL = _makeStubUrl();

export function resolve(specifier, context, nextResolve) {
  if (STUB_SPECIFIERS.has(specifier)) {
    return { shortCircuit: true, url: STUB_URL };
  }
  return nextResolve(specifier, context);
}
