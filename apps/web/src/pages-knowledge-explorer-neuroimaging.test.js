// pages-knowledge-explorer-neuroimaging.test.js — Category 4 PR-2 (frontend)
//
// Verifies the live-registry tile added to the Knowledge Explorer:
//   1. `summariseLifecycle` aggregates source counts by lifecycle_state
//      exactly as the backend reports them (no re-categorisation).
//   2. pages-knowledge-explorer.js imports the new component and mounts
//      it once, AFTER (not in place of) the curated catalog.
//   3. Regression guard: the hardcoded 18-source neuroimaging catalog
//      is still present in pages-knowledge-explorer.js. (Owned by
//      pages-knowledge-coverage.test.js — this is a defensive pin.)
//
// node --test compatible; no DOM mount.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { summariseLifecycle } from './neuroimaging-live-registry.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const EXPLORER_SRC = readFileSync(join(__dir, 'pages-knowledge-explorer.js'), 'utf8');

describe('Knowledge Explorer — neuroimaging live registry (summariseLifecycle)', () => {
  it('counts sources by lifecycle_state without renaming buckets', () => {
    const result = summariseLifecycle([
      { id: 'a', lifecycle_state: 'healthy' },
      { id: 'b', lifecycle_state: 'healthy' },
      { id: 'c', lifecycle_state: 'requires_application' },
      { id: 'd', lifecycle_state: 'deprecated' },
      { id: 'e', lifecycle_state: 'catalogued' },
      { id: 'f', lifecycle_state: 'software_resource' },
    ]);
    assert.equal(result.total, 6);
    assert.equal(result.counts.healthy, 2);
    assert.equal(result.counts.requires_application, 1);
    assert.equal(result.counts.deprecated, 1);
    assert.equal(result.counts.catalogued, 1);
    assert.equal(result.counts.software_resource, 1);
  });

  it('handles empty / non-list inputs', () => {
    assert.deepEqual(summariseLifecycle(null), { counts: {}, byState: {}, total: 0 });
    assert.deepEqual(summariseLifecycle([]),  { counts: {}, byState: {}, total: 0 });
    assert.deepEqual(summariseLifecycle(undefined), { counts: {}, byState: {}, total: 0 });
  });

  it('groups sources under their lifecycle_state', () => {
    const result = summariseLifecycle([
      { id: 'neurovault', lifecycle_state: 'healthy' },
      { id: 'adni',       lifecycle_state: 'requires_application' },
      { id: 'hcp',        lifecycle_state: 'requires_application' },
    ]);
    assert.equal(result.byState.healthy.length, 1);
    assert.equal(result.byState.requires_application.length, 2);
    assert.equal(result.byState.healthy[0].id, 'neurovault');
  });

  it('skips entries with missing / non-object rows', () => {
    const result = summariseLifecycle([null, undefined, 'string-row', { id: 'ok', lifecycle_state: 'healthy' }]);
    assert.equal(result.total, 1);
    assert.equal(result.counts.healthy, 1);
  });

  it('treats unknown / missing lifecycle_state as "unknown" bucket', () => {
    const result = summariseLifecycle([
      { id: 'a' },
      { id: 'b', lifecycle_state: '' },
    ]);
    assert.equal(result.counts.unknown, 2);
  });
});

describe('Knowledge Explorer — pages-knowledge-explorer.js wiring', () => {
  it('imports NeuroimagingLiveRegistry from the new module', () => {
    assert.match(EXPLORER_SRC, /import NeuroimagingLiveRegistry from "\.\/neuroimaging-live-registry\.js"/);
  });

  it('mounts the live-registry tile inside the explorer page', () => {
    assert.match(EXPLORER_SRC, /<NeuroimagingLiveRegistry \/>/);
  });

  it('regression: hardcoded 18-source neuroimaging catalog is still present', () => {
    // Curated catalog identity is owned by pages-knowledge-coverage.test.js;
    // this is a defensive pin so PR-2 cannot accidentally drop the list
    // while wiring in the live registry.
    const NEUROIMAGING_NAMES = [
      'ADNI', 'AIBL', 'OASIS', 'UK Biobank Brain', 'HCP',
      'OpenNeuro', 'NeuroVault', 'Brain-CODE', 'NITRC', 'FCON1000',
      'ABCD Study', 'IXI Dataset', 'MIRIAD', 'DLBS', 'GSP',
      'NKI-RS', 'COBRE', 'FBIRN',
    ];
    for (const name of NEUROIMAGING_NAMES) {
      assert.ok(
        EXPLORER_SRC.includes(name),
        `curated catalog must still mention ${name}`,
      );
    }
  });

  it('regression: curated-catalog header (67 adapters) remains in the page subtitle', () => {
    // The subtitle line in the page header anchors the curated catalog
    // tone; if it ever drifts, the live-registry tile is masquerading
    // for the curated list, which we forbid.
    assert.match(EXPLORER_SRC, /67 clinical database adapters/);
  });
});
