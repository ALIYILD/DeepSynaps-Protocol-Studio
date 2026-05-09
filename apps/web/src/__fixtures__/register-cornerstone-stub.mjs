// Pre-loader registration module for use with --import.
// Registers the cornerstone stub loader so @cornerstonejs/* is intercepted
// when mri-viewer-cs3d.js is loaded in the node:test environment.
//
// Usage:
//   node --import ./src/__fixtures__/register-cornerstone-stub.mjs \
//        --test src/mri-viewer-cs3d.test.js

import { register } from 'node:module';

register('./cornerstone-esm-loader.mjs', import.meta.url);
