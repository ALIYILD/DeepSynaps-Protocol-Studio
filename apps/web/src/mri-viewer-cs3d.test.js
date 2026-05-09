// Tests for mri-viewer-cs3d.js — mountCornerstoneMPR public contract.
//
// @cornerstonejs/* cannot be loaded in the node:test environment. We register
// a stub loader before importing the module under test, using register() from
// node:module (available in Node ≥20.6). The static `import` of
// register-cornerstone-stub.mjs fires the hook early enough that the
// subsequent dynamic import of mri-viewer-cs3d.js sees the stubs.

import { register } from 'node:module';
register('./__fixtures__/cornerstone-esm-loader.mjs', import.meta.url);

import { describe, it } from 'node:test';
import assert from 'node:assert';

// Dynamic import so it resolves after the loader hook is registered above.
const { mountCornerstoneMPR } = await import('./mri-viewer-cs3d.js');

describe('mountCornerstoneMPR exports', () => {
  it('exports mountCornerstoneMPR as a function', () => {
    assert.strictEqual(typeof mountCornerstoneMPR, 'function');
  });

  it('returns false immediately when host is null', async () => {
    const result = await mountCornerstoneMPR(null, { baseVolumeUrl: 'http://x/a.nii.gz' });
    assert.strictEqual(result, false);
  });

  it('returns false immediately when host is undefined', async () => {
    const result = await mountCornerstoneMPR(undefined, { baseVolumeUrl: 'http://x/a.nii.gz' });
    assert.strictEqual(result, false);
  });

  it('returns false when opts is omitted (no baseVolumeUrl)', async () => {
    const result = await mountCornerstoneMPR({}, undefined);
    assert.strictEqual(result, false);
  });

  it('returns false when baseVolumeUrl is missing from opts', async () => {
    const result = await mountCornerstoneMPR({}, {});
    assert.strictEqual(result, false);
  });

  it('returns false when baseVolumeUrl is an empty string', async () => {
    const result = await mountCornerstoneMPR({}, { baseVolumeUrl: '' });
    assert.strictEqual(result, false);
  });

  it('returns false when host is falsy (0)', async () => {
    const result = await mountCornerstoneMPR(0, { baseVolumeUrl: 'http://x/a.nii.gz' });
    assert.strictEqual(result, false);
  });

  it('returns false when host is an empty string', async () => {
    const result = await mountCornerstoneMPR('', { baseVolumeUrl: 'http://x/a.nii.gz' });
    assert.strictEqual(result, false);
  });
});
